/**
 * The one-command flow: start the app, then attach to it.
 *
 * What is worth pinning here is not that `npm run dev` boots Next — that is the
 * host's business — but the three decisions this package makes around it:
 *
 *  - a server it did NOT start is not one it may stop. `started: false` is the
 *    whole guard, and a `stop` that killed an attached process would take down
 *    a terminal the user is still using;
 *  - a dev script that dies has to be reported as a dev script that died,
 *    rather than as the port timeout it would otherwise look like 60s later;
 *  - `--dev-script` implies `--dev`, and the CLI still refuses every flag it
 *    does not declare — the vendor's commander aborts on anything that leaks
 *    through, so an accepted-but-ignored flag is a broken launch.
 *
 * Usage: node design-editor/test/dev-flow-cases.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

import { parseArgs } from "../cli.mjs"
import { DEFAULT_CONFIG } from "../config.mjs"
import { ensureAppRunning, probePort } from "../runtime/dev-server.mjs"

let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

/** A listener standing in for the host's dev server. */
function listen() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end())
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }))
  })
}

const quiet = () => {}

console.log("\nFlags")

await check("--dev-script implies --dev", () => {
  assert.deepEqual(parseArgs(["--dev-script", "start"]), {
    open: undefined,
    start: undefined,
    dev: true,
    devScript: "start",
    verify: false,
    printConfig: false,
    verbose: false,
  })
})

await check("--dev alone leaves the script to the config", () => {
  const options = parseArgs(["--dev"])
  assert.equal(options.dev, true)
  assert.equal(options.devScript, undefined)
  assert.equal(DEFAULT_CONFIG.app.devScript, "dev")
})

await check("an undeclared flag is still refused", () => {
  assert.throws(() => parseArgs(["--dev-server"]), /Unknown option: --dev-server/)
})

await check("--dev is documented", () => {
  const usage = fs.readFileSync(new URL("../cli.mjs", import.meta.url), "utf8")
  assert.match(usage, /^ {2}--dev {19}Start the app's dev server/m)
  assert.match(usage, /^ {2}--dev-script <name>/m)
})

// The two flags the supervisor puts on its children's command lines. A child
// cannot read its own working directory when the project is somewhere macOS
// protects, so `--project-root` is the only way it learns which project it is.
await check("the supervisor's flags are taken, and documented like the rest", () => {
  assert.equal(parseArgs(["--project-root", "/tmp/app"]).projectRoot, "/tmp/app")
  assert.equal(parseArgs(["--start-screen-port", "3455"]).startScreenPort, 3455)
  const usage = fs.readFileSync(new URL("../cli.mjs", import.meta.url), "utf8")
  assert.match(usage, /^ {2}--project-root <path> {3}Project the config loads against/m)
  assert.match(usage, /^ {2}--start-screen-port <n> Port for the start screen/m)
})

console.log("\nAttaching")

await check("attaches to a port that already answers, and starts nothing", async () => {
  const { server, port } = await listen()
  try {
    const app = await ensureAppRunning({
      projectRoot: process.cwd(),
      host: "127.0.0.1",
      port,
      // Would fail loudly if it were ever run, which is the point.
      script: "design-editor-should-not-run-this",
      log: quiet,
    })
    assert.equal(app.started, false)
    assert.equal(app.child, null)
    // Calling it is legal and does nothing; the port stays up.
    app.stop()
    assert.equal(await probePort("127.0.0.1", port), true)
  } finally {
    server.close()
  }
})

await check("probePort says no when the port is free", async () => {
  const { server, port } = await listen()
  await new Promise((resolve) => server.close(resolve))
  assert.equal(await probePort("127.0.0.1", port), false)
})

console.log("\nStarting")

await check("a dev script that exits is reported as such, not as a timeout", async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "design-editor-dev-"))
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: { dev: "exit 7" } })
  )
  const { server, port } = await listen()
  await new Promise((resolve) => server.close(resolve))
  try {
    await assert.rejects(
      ensureAppRunning({
        projectRoot: fixture,
        host: "127.0.0.1",
        port,
        script: "dev",
        timeoutMs: 30_000,
        log: quiet,
      }),
      /npm run dev.*before anything answered on port/s
    )
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
