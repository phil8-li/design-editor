/**
 * Getting the host app running before the editor attaches to it.
 *
 * The vendored CLI health-checks the app port and refuses to boot when nothing
 * answers, so until now the app had to be started by hand in another terminal
 * and the editor command was useless until that one was warm. This module is
 * what collapses the two into one: probe the port, attach silently if something
 * already answers, otherwise run the host's OWN dev script and wait for it.
 *
 * It knows no framework flags. The port is handed over as `PORT` — which is
 * what `next dev` reads — and the script is the host's, so whatever that script
 * already does keeps happening. Nothing here is guessed on the host's behalf.
 */

import net from "node:net"
import { spawn } from "node:child_process"

/** How often the port is re-probed while the app boots. */
const POLL_MS = 250

/** Resolves true when something accepts a TCP connection on the port. */
export function probePort(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (answered) => {
      socket.destroy()
      resolve(answered)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
    socket.connect(port, host)
  })
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** npm ships as a shell shim on Windows, which `spawn` will not find unsuffixed. */
const npmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm")

/**
 * The dev server's output, line-prefixed so one terminal can carry both halves.
 *
 * Buffered to the newline rather than written per chunk: a framework that
 * prints its banner in three writes would otherwise get three prefixes in the
 * middle of one line.
 */
function relay(stream, write) {
  let carry = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk) => {
    const lines = (carry + chunk).split("\n")
    carry = lines.pop() ?? ""
    for (const line of lines) write(`  [app] ${line}\n`)
  })
}

const describeExit = ({ code, signal }) =>
  signal ? `killed by ${signal}` : `exit code ${code}`

/**
 * Attach to the app on `port`, starting `npm run <script>` first if nothing is
 * listening. Returns `{ started, stop }` — `started` is false when it attached
 * to a server someone else owns, and `stop` is a no-op in that case, because a
 * process this one did not start is not this one's to kill.
 */
export async function ensureAppRunning({
  projectRoot,
  host,
  port,
  script,
  timeoutMs = 60_000,
  log = console.log,
}) {
  if (await probePort(host, port)) {
    log(`[design-editor] app already running on http://${host}:${port}`)
    return { started: false, stop: () => {}, child: null }
  }

  log(`[design-editor] starting your app: npm run ${script} (PORT=${port})`)
  const child = spawn(npmCommand(), ["run", script], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so `stop` can take the whole `npm` -> `next` chain
    // down. Killing the npm shim alone orphans the server that holds the port,
    // and the next run would attach to a stale build.
    detached: process.platform !== "win32",
  })
  relay(child.stdout, (text) => process.stdout.write(text))
  relay(child.stderr, (text) => process.stderr.write(text))

  let exited = null
  child.once("exit", (code, signal) => {
    exited = { code, signal }
  })
  child.once("error", (error) => {
    exited = { code: null, signal: null, message: error.message }
  })

  let stopped = false
  const stop = () => {
    if (stopped || exited) return
    stopped = true
    try {
      if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM")
      else child.kill("SIGTERM")
    } catch {
      // Already gone. Nothing to clean up.
    }
  }

  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (exited) {
      throw new Error(
        `\`npm run ${script}\` ${exited.message ?? describeExit(exited)} before anything answered on port ${port}`
      )
    }
    if (await probePort(host, port)) break
    if (Date.now() > deadline) {
      stop()
      throw new Error(
        `\`npm run ${script}\` did not answer on port ${port} within ${Math.round(timeoutMs / 1000)}s`
      )
    }
    await delay(POLL_MS)
  }

  log(`[design-editor] app ready on http://${host}:${port}`)
  return { started: true, stop, child }
}
