#!/usr/bin/env node

/**
 * `design-editor [appPort] [--config <path>] [--proxy-port N] [--ws-port N]`
 *
 * Every flag is consumed here. The vendored CLI parses `process.argv` at module
 * scope with commander and aborts on anything it does not declare, so argv is
 * rewritten into exactly its shape before it is imported — that reshape is what
 * makes first-party flags possible at all.
 *
 * With the start screen, this command runs in one of two roles. The SUPERVISOR
 * owns the chooser for the whole session and never boots an editor itself; each
 * app the user picks is a CHILD of it, started by re-running this same file with
 * `--no-start` and a port. The two are the same code because they are the same
 * command; `wantsStartScreen` is the whole fork.
 */

import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
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
  --project-root <path>   Project the config loads against (default: the current folder)
  --start-screen-port <n> Port for the start screen (default: 3455, else any free port)
  --proxy-port <n>        Port for the editing proxy the browser loads
  --ws-port <n>           Port for the source-edit WebSocket
  --host <host>           Dev server host (default: 127.0.0.1)
  --open / --no-open      Open the editing URL on start (default: no)
  --verify                Check the vendor patch still applies, then exit
  --print-config          Print the resolved config as JSON, then exit
  --help
`

/** This file, as the supervisor has to name it when it re-runs it as a child. */
const CLI_PATH = fileURLToPath(import.meta.url)

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
    else if (arg === "--project-root") options.projectRoot = next()
    else if (arg === "--start-screen-port") options.startScreenPort = Number(next())
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
  /*
   * `--project-root` rather than a working directory. A child spawned with
   * `cwd: projectRoot` cannot read its own cwd back when that folder is one
   * macOS protects — `chdir` succeeds and every later `process.cwd()` fails
   * with EPERM — so the root travels as an argument the child never has to ask
   * the OS about.
   */
  const config = await loadConfig({
    cwd: options.projectRoot,
    configPath: options.configPath,
    overrides,
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

  /*
   * The start screen answers the three questions this command used to require
   * on the line — which app, which folder, and whether to start it — from a
   * page, before anything else has bound a port. Answering them is a job of its
   * own: nothing below this line runs in the process that serves it.
   */
  if (wantsStartScreen(options, config)) return supervise(options)

  // With `--dev` the port can no longer be left to the vendor's framework
  // detection: a dev server has to be told one before it can be asked.
  const appPort = options.appPort ?? config.app.port ?? (options.dev ? DEFAULT_APP_PORT : null)
  const devScript = options.dev ? options.devScript ?? config.app.devScript : null

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
    open: config.app.open,
    verbose: options.verbose,
    /*
     * How a supervised child tells its parent where the editor is. `process.send`
     * exists only when this process was spawned with an IPC channel, so an
     * ordinary run passes a function that does nothing.
     *
     * IPC rather than the endpoint file: that file is written inside the
     * project folder, and the write fails outright on the folders macOS
     * protects — which is where a great many people keep their projects. The
     * proxy comes up fine there; only the note about it does not.
     */
    onReady: (url) => process.send?.({ type: "ready", url }),
  })
}

/**
 * The supervisor: the chooser is the session, and each chosen app is a process
 * under it.
 *
 * A fresh process per app is not ceremony. The vendored CLI is a one-shot
 * `await import(...)` that reads the project root, the source roots, the routes
 * and the browser prelude at module scope, and it binds 3456/3457 as it goes.
 * There is no in-process way to point it at a second app, so switching apps
 * means a second process — and the only honest way to have a chooser that
 * outlives the choice is for the chooser not to be in that process at all.
 */
async function supervise(options) {
  const screen = await createStartScreen({ port: options.startScreenPort })
  holdUntilExit(screen.close)

  let running = null
  // Ctrl+C here is Ctrl+C for the editor too. The child is a process of its
  // own, so nothing takes it down on the way out unless this line does.
  holdUntilExit(() => running?.child.kill("SIGTERM"))

  console.log(`[design-editor] open ${screen.url} to choose an app`)
  if (options.open !== false) openBrowser(screen.url)

  for (;;) {
    let choice
    try {
      choice = await screen.nextChoice()
    } catch {
      // `close()` rejects the round nobody answered — the process is exiting.
      return
    }

    if (running) {
      // The editor that is up is about to be replaced, so its exit is expected
      // and must not be reported to the page as a failure. Waiting for it also
      // frees 3456 before the next one asks for it.
      running.replaced = true
      running.child.kill("SIGTERM")
      await running.exited
    }
    running = startEditor(options, choice, screen)
  }
}

/** The argv that turns this command into the single-app child of a supervisor. */
function childArgv(options, choice) {
  return [
    CLI_PATH,
    "--project-root",
    choice.projectRoot,
    // The chooser is the parent's, and there is only one of it.
    "--no-start",
    // The tab that pressed Start moves itself to the editor. A window opened
    // from here would be the same page a second time, one of them orphaned.
    "--no-open",
    String(choice.appPort),
    ...(choice.devScript ? ["--dev-script", choice.devScript] : []),
    ...(options.proxyPort ? ["--proxy-port", String(options.proxyPort)] : []),
    ...(options.wsPort ? ["--ws-port", String(options.wsPort)] : []),
    ...(options.host ? ["--host", options.host] : []),
    ...(options.configPath ? ["--config", options.configPath] : []),
    ...(options.verbose ? ["--verbose"] : []),
  ]
}

/** The sentence the chooser shows where the editor used to be. */
function farewell(choice, code, signal) {
  const name = choice.packageName ?? path.basename(choice.projectRoot)
  if (signal) return `The editor for ${name} was stopped (${signal}). Choose an app to start again.`
  if (code === 0) return `The editor for ${name} closed. Choose an app to start again.`
  return `The editor for ${name} stopped with code ${code}. Its output is in the terminal running design-editor.`
}

function startEditor(options, choice, screen) {
  const child = spawn(process.execPath, childArgv(options, choice), {
    // The child's banner and the app's compile output are what the person in
    // the terminal came to read, so they stay on the terminal unedited. The
    // fourth stream is the IPC channel `onReady` answers on.
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    // Deliberately no `cwd`. See `--project-root`.
    env: { ...process.env, DESIGN_EDITOR_CHOOSER_URL: screen.url },
  })

  const running = { child, replaced: false }
  child.on("message", (message) => {
    if (message?.type !== "ready") return
    screen.reportReady(message.url, {
      appUrl: choice.appUrl,
      projectRoot: choice.projectRoot,
      packageName: choice.packageName,
    })
    console.log(`[design-editor] editing at ${message.url} — ${screen.url} to switch apps`)
  })

  // A child that dies on its own — a crash, a port clash, a project the vendor
  // refuses — must not take the supervisor with it. The chooser is still up, so
  // it is where the explanation goes and where the next attempt starts.
  running.exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      if (!running.replaced) {
        const reason = farewell(choice, code, signal)
        screen.reportStopped(reason)
        console.log(`[design-editor] ${reason}`)
      }
      resolve()
    })
  })
  return running
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
