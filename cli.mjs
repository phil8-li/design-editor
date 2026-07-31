#!/usr/bin/env node

/**
 * `design-editor [appPort] [--config <path>] [--proxy-port N] [--ws-port N]`
 *
 * Every flag is consumed here. The vendored CLI parses `process.argv` at module
 * scope with commander and aborts on anything it does not declare, so argv is
 * rewritten into exactly its shape before it is imported — that reshape is what
 * makes first-party flags possible at all.
 */

import net from "node:net"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { loadConfig } from "./config.mjs"
import { launch, readOverlaySource, resolveVendor } from "./runtime/launcher.mjs"
import { patchOverlay } from "./runtime/vendor-patch.mjs"

const USAGE = `Usage: design-editor [appPort] [options]

  appPort                 Dev server port (default: config app.port, else framework detection)
  --config <path>         Config file (default: nearest design-editor.config.mjs above cwd)
  --proxy-port <n>        Port for the editing proxy the browser loads
  --ws-port <n>           Port for the source-edit WebSocket
  --host <host>           Dev server host (default: localhost)
  --open / --no-open      Open a browser on start (default: no)
  --verify                Check the vendor patch still applies, then exit
  --print-config          Print the resolved config as JSON, then exit
  --help
`

export function parseArgs(argv) {
  const options = { open: undefined, verify: false, printConfig: false, verbose: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      index += 1
      return value
    }

    if (arg === "--config") options.configPath = next()
    else if (arg === "--proxy-port") options.proxyPort = Number(next())
    else if (arg === "--ws-port") options.wsPort = Number(next())
    else if (arg === "--host") options.host = next()
    else if (arg === "--no-open") options.open = false
    else if (arg === "--open") options.open = true
    else if (arg === "--verbose") options.verbose = true
    else if (arg === "--verify") options.verify = true
    else if (arg === "--print-config") options.printConfig = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (/^\d+$/.test(arg)) options.appPort = Number(arg)
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

/**
 * An explicitly configured port that is already taken must stop the launch. The
 * vendor's own probe would silently walk to the next free port instead, and a
 * second editor answering on a port the host wrote down is worse than no start.
 */
function assertPortFree(port, label) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", (error) =>
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `${label} port ${port} is already in use`
            : `${label} port ${port} is unusable: ${error.message}`
        )
      )
    )
    probe.once("listening", () => probe.close(() => resolve()))
    probe.listen(port, "127.0.0.1")
  })
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  const config = await loadConfig({
    configPath: options.configPath,
    overrides: {
      app: { port: options.appPort, host: options.host, open: options.open },
      ports: { proxy: options.proxyPort, ws: options.wsPort },
    },
  })

  if (options.printConfig) {
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`)
    return
  }

  if (options.verify) {
    const source = readOverlaySource(config)
    const patched = patchOverlay(source, config)
    console.log("PASS React Rewrite overlay patch compatibility")
    // A hoisted or symlinked install resolves outside the project, where a
    // relative path reads as a stack of `../` and hides which copy was checked.
    const overlay = resolveVendor(config).overlay
    const inProject = overlay.startsWith(`${config.projectRoot}${path.sep}`)
    console.log(`Checked: ${inProject ? path.relative(config.projectRoot, overlay) : overlay}`)
    console.log(`Config: ${config.configPath ?? "defaults (no design-editor.config.mjs found)"}`)
    console.log(`Patched bundle: ${source.length} -> ${patched.length} bytes`)
    return
  }

  for (const [port, label] of [
    [config.ports.ws, "WebSocket"],
    [config.ports.proxy, "Proxy"],
  ]) {
    if (port !== "auto") await assertPortFree(port, label)
  }

  await launch(config, {
    appPort: options.appPort ?? config.app.port ?? null,
    host: config.app.host,
    open: config.app.open,
    verbose: options.verbose,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (error) {
    console.error(`\n  design-editor: ${error.message}\n`)
    process.exit(1)
  }
}
