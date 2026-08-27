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
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadConfig } from "./config.mjs"
import { ensureAppRunning, probePort } from "./runtime/dev-server.mjs"
import { launch, readOverlaySource, resolveVendor } from "./runtime/launcher.mjs"
import { openBrowser } from "./runtime/open-browser.mjs"
import { createStartScreen } from "./runtime/start-screen.mjs"
import { patchOverlay } from "./runtime/vendor-patch.mjs"

const USAGE = `Usage: design-editor [appPort] [options]

  (no arguments)          Open the start screen: pick a running app and its folder
  appPort                 Dev server port (default: config app.port, else framework detection)
  --start / --no-start    Force or skip the start screen (default: when no port is known)
  --dev                   Start the app's dev server too, and attach when it is up
  --dev-script <name>     npm script --dev runs (default: config app.devScript, "dev")
  --config <path>         Config file (default: nearest design-editor.config.mjs above cwd)
  --proxy-port <n>        Port for the editing proxy the browser loads
  --ws-port <n>           Port for the source-edit WebSocket
  --host <host>           Dev server host (default: 127.0.0.1)
  --open / --no-open      Open the editing URL on start (default: no)
  --verify                Check the vendor patch still applies, then exit
  --print-config          Print the resolved config as JSON, then exit
  --help
`

/**
 * The port `--dev` starts the app on when neither the flag nor the config names
 * one. Framework detection is not available this early — the vendor does it
 * after its own boot — and a dev server has to be told a port before it can be
 * asked which one it took.
 */
const DEFAULT_APP_PORT = 3000

export function parseArgs(argv) {
  const options = {
    open: undefined,
    start: undefined,
    dev: false,
    verify: false,
    printConfig: false,
    verbose: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      index += 1
      return value
    }

    if (arg === "--config") options.configPath = next()
    else if (arg === "--dev") options.dev = true
    // Naming the script is asking for it to be run, so it implies the flag.
    else if (arg === "--dev-script") {
      options.devScript = next()
      options.dev = true
    }
    else if (arg === "--proxy-port") options.proxyPort = Number(next())
    else if (arg === "--ws-port") options.wsPort = Number(next())
    else if (arg === "--host") options.host = next()
    else if (arg === "--no-open") options.open = false
    else if (arg === "--open") options.open = true
    else if (arg === "--no-start") options.start = false
    else if (arg === "--start") options.start = true
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

/**
 * The start screen is the default way in, and the flags are how to say
 * otherwise. It is skipped the moment the command already knows which app it is
 * for — a port on the line, a port in the config, or `--dev` — because at that
 * point a screen asking which app would be asking a question already answered.
 */
function wantsStartScreen(options, config) {
  if (options.start !== undefined) return options.start
  return !options.dev && options.appPort === undefined && config.app.port === null
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  const overrides = {
    app: { port: options.appPort, host: options.host, open: options.open },
    ports: { proxy: options.proxyPort, ws: options.wsPort },
  }
  let config = await loadConfig({ configPath: options.configPath, overrides })

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

  // With `--dev` the port can no longer be left to the vendor's framework
  // detection: a dev server has to be told one before it can be asked.
  let appPort = options.appPort ?? config.app.port ?? (options.dev ? DEFAULT_APP_PORT : null)
  let devScript = options.dev ? options.devScript ?? config.app.devScript : null

  /*
   * The start screen answers the three questions this command used to require
   * on the line — which app, which folder, and whether to start it — from a
   * page, before anything else has bound a port. Its choice can name a project
   * anywhere on the machine, so the config is loaded a second time against THAT
   * root: the first load only ever saw the directory the command was run in.
   */
  const screen = wantsStartScreen(options, config) ? await createStartScreen() : null
  if (screen) {
    holdUntilExit(screen.close)
    console.log(`[design-editor] open ${screen.url} to choose an app`)
    openBrowser(screen.url)

    const choice = await screen.chosen
    config = await loadConfig({ cwd: choice.projectRoot, configPath: options.configPath, overrides })
    appPort = choice.appPort
    devScript = choice.devScript
    // How the page learns the proxy is up and where to send the browser next.
    screen.reportEndpointFile(config.endpointFile)
  }

  for (const [port, label] of [
    [config.ports.ws, "WebSocket"],
    [config.ports.proxy, "Proxy"],
  ]) {
    if (port !== "auto") await assertPortFree(port, label)
  }

  if (devScript !== null) {
    const app = await ensureAppRunning({
      projectRoot: config.projectRoot,
      host: config.app.host,
      port: appPort,
      script: devScript,
    })
    if (app.started) holdUntilExit(app.stop)
  } else if (appPort !== null && !(await probePort(config.app.host, appPort))) {
    // The vendor's own health check fails here too, but it fails from inside a
    // banner that has already claimed to be starting, and it does not know that
    // starting the app is something this command can do.
    throw new Error(
      `Nothing is listening on http://${config.app.host}:${appPort}.\n` +
        `  Start your dev server first, or run with --dev to start it here.`
    )
  }

  await launch(config, {
    appPort,
    host: config.app.host,
    // The browser is already on the start screen, which polls for the proxy and
    // moves itself. A second window opened underneath it would be the same page
    // twice, one of them orphaned.
    open: screen ? false : config.app.open,
    verbose: options.verbose,
    onReady: (url) => screen?.reportReady(url),
  })
}

/**
 * Whatever this process started is this process's to take down with it: a dev
 * server it spawned, a start screen it bound.
 *
 * The SIGINT listener lands before the vendor's, which means Ctrl+C exits here
 * and the vendor never closes its two servers — a cost of nothing, since the
 * process is going away and the sockets go with it. Not exiting instead would
 * be worse: a signal with a listener stops terminating by default, so Ctrl+C
 * during a slow first compile would do nothing at all.
 */
const cleanups = []
function holdUntilExit(stop) {
  if (cleanups.length === 0) {
    // One pass over the list on the way out, rather than a listener per caller:
    // the first signal handler to call `process.exit` is the only one that runs,
    // so the cleanup cannot live in the signal handlers themselves.
    process.once("exit", () => {
      for (const cleanup of cleanups) cleanup()
    })
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
      process.once(signal, () => process.exit(code))
    }
  }
  cleanups.push(stop)
}

/** npm exposes package bins through a symlink in `node_modules/.bin`. Compare
 * canonical paths so the installed command boots just like `node cli.mjs`. */
function isDirectRun(entry = process.argv[1]) {
  if (!entry) return false
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectRun()) {
  try {
    await main()
  } catch (error) {
    console.error(`\n  design-editor: ${error.message}\n`)
    process.exit(1)
  }
}
