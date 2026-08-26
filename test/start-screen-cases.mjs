/**
 * The start screen: the flow that replaces typing a port on the command line.
 *
 * The pieces are a discovery module that reads the machine, a loopback server
 * that carries the choice, and a page. This suite pins the two that have to be
 * correct rather than merely nice, and it pins the contract BETWEEN them —
 * three lanes were written against those names in parallel, so a renamed field
 * is the defect this file exists to catch.
 *
 * What is worth a case:
 *  - discovery degrades instead of throwing. It runs on a machine nobody can
 *    see, where half the directories are TCC-denied and `lsof` may refuse to
 *    name another process's cwd. Every function has to answer anyway;
 *  - the refusals are the safety story. This process writes source files and
 *    proxies whatever it is pointed at, so a non-loopback target, a folder with
 *    no package.json, and a project with no React are all rejected BEFORE the
 *    launch, with a sentence the page can show;
 *  - `ready` means the proxy this process started is up. A stale endpoint file
 *    from a previous run parses perfectly and would redirect the browser to a
 *    dead port, so the pid is what the check is really on.
 *
 * Usage: node design-editor/test/start-screen-cases.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

import {
  DEFAULT_SCAN_PORTS,
  describeProject,
  listDirectories,
  projectRootForPort,
  scanLocalApps,
} from "../runtime/local-apps.mjs"
import { createStartScreen } from "../runtime/start-screen.mjs"

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

const temporary = []
function fixture(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `design-editor-${prefix}-`)))
  temporary.push(dir)
  return dir
}

/** A project the start screen should accept: package.json, React, a dev script. */
function reactProject(extra = {}) {
  const dir = fixture("project")
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "fixture-app",
      private: true,
      dependencies: { react: "19.0.0" },
      scripts: { dev: "node app.mjs", build: "true" },
      ...extra,
    })
  )
  return dir
}

/** A page server standing in for someone's dev server. */
function pageServer(title) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(`<!doctype html><html><head><title>${title}</title></head><body>hi</body></html>`)
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port, close: () => server.close() })
    )
  })
}

async function freePort() {
  const { server, port } = await pageServer("gone")
  await new Promise((resolve) => server.close(resolve))
  return port
}

const json = async (url, init) => {
  const response = await fetch(url, init)
  return { status: response.status, body: await response.json().catch(() => null) }
}

console.log("\nDiscovery")

await check("the scan list covers the ports a local app is actually on", () => {
  assert.ok(Array.isArray(DEFAULT_SCAN_PORTS))
  assert.ok(DEFAULT_SCAN_PORTS.includes(3000), "Next's default")
  assert.ok(DEFAULT_SCAN_PORTS.includes(5173), "Vite's default")
  assert.ok(DEFAULT_SCAN_PORTS.every((port) => Number.isInteger(port)))
})

await check("a running app is found, and named by its own <title>", async () => {
  const app = await pageServer("Workspaces")
  try {
    const apps = await scanLocalApps({ ports: [app.port] })
    assert.equal(apps.length, 1)
    assert.equal(apps[0].port, app.port)
    assert.equal(apps[0].title, "Workspaces")
    assert.match(apps[0].url, new RegExp(`:${app.port}$`))
    // Present on every hit, even when the machine will not say.
    assert.ok("projectRoot" in apps[0] && "packageName" in apps[0])
  } finally {
    app.close()
  }
})

await check("a port nobody is on is not an error", async () => {
  assert.deepEqual(await scanLocalApps({ ports: [await freePort()] }), [])
})

await check("the cwd probe answers, or answers null — it never throws", async () => {
  const app = await pageServer("probe")
  try {
    const root = projectRootForPort(app.port)
    assert.ok(root === null || typeof root === "string")
  } finally {
    app.close()
  }
})

await check("a project describes itself completely", () => {
  const dir = reactProject()
  fs.writeFileSync(path.join(dir, "next.config.mjs"), "export default {}\n")
  const project = describeProject(dir)
  assert.equal(project.exists, true)
  assert.equal(project.isDirectory, true)
  assert.equal(project.hasPackageJson, true)
  assert.equal(project.packageName, "fixture-app")
  assert.equal(project.hasReact, true)
  assert.ok(project.devScripts.includes("dev"))
  assert.equal(project.framework, "nextjs")
})

await check("a directory that is not there still answers every field", () => {
  const project = describeProject(path.join(os.tmpdir(), "design-editor-does-not-exist"))
  for (const key of [
    "path",
    "name",
    "exists",
    "isDirectory",
    "hasPackageJson",
    "packageName",
    "hasReact",
    "devScripts",
    "framework",
  ]) {
    assert.ok(key in project, `missing ${key}`)
  }
  assert.equal(project.exists, false)
  assert.deepEqual(project.devScripts, [])
})

await check("the picker lists real folders and skips the noise", () => {
  const dir = fixture("listing")
  fs.mkdirSync(path.join(dir, "app"))
  fs.writeFileSync(path.join(dir, "app", "package.json"), "{}")
  fs.mkdirSync(path.join(dir, "docs"))
  fs.mkdirSync(path.join(dir, "node_modules"))
  fs.mkdirSync(path.join(dir, ".git"))
  fs.writeFileSync(path.join(dir, "readme.md"), "")

  const listing = listDirectories(dir)
  assert.equal(listing.path, dir)
  assert.ok(listing.parent && listing.parent !== dir)
  assert.deepEqual(
    listing.entries.map((entry) => entry.name),
    ["app", "docs"]
  )
  assert.equal(listing.entries[0].hasPackageJson, true)
  assert.equal(listing.entries[1].hasPackageJson, false)
  assert.equal(listing.entries[0].path, path.join(dir, "app"))
})

await check("an unreadable folder is an empty list, not a crash", () => {
  const listing = listDirectories(path.join(os.tmpdir(), "design-editor-not-a-folder"))
  assert.deepEqual(listing.entries, [])
})

console.log("\nThe screen")

const app = await pageServer("Workspaces")
const project = reactProject()
const screen = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {} })

await check("it binds on loopback and serves one page", async () => {
  assert.match(screen.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  const response = await fetch(`${screen.url}/`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get("content-type") ?? "", /text\/html/)
  const html = await response.text()
  assert.match(html.slice(0, 200).toLowerCase(), /<!doctype html/)
  // The two ways in, both on the page: type the address, paste the folder.
  assert.match(html, /<input id="url"/)
  assert.match(html, /<input id="folder-path"/)
})

await check("it reports what is running, and where the picker should open", async () => {
  const { status, body } = await json(`${screen.url}/api/apps`)
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.apps))
  // The browser cannot name a path on the machine it is talking to.
  assert.equal(body.home, os.homedir())
})

await check("it describes a folder and lists its children", async () => {
  const { status, body } = await json(
    `${screen.url}/api/project?path=${encodeURIComponent(project)}`
  )
  assert.equal(status, 200)
  assert.equal(body.project.hasReact, true)
  assert.ok(Array.isArray(body.listing.entries))
})

await check("a relative path is refused", async () => {
  const { status } = await json(`${screen.url}/api/project?path=..`)
  assert.equal(status, 400)
})

// A path is pasted into a text field here, and every other place a path is
// written on this machine — the shell, Finder's Copy as Pathname — writes `~`.
await check("a pasted ~ is the home directory, not a relative path", async () => {
  const { status, body } = await json(`${screen.url}/api/project?path=${encodeURIComponent("~")}`)
  assert.equal(status, 200)
  assert.equal(body.project.path, os.homedir())
  assert.equal(body.project.isDirectory, true)
})

const start = (payload) =>
  json(`${screen.url}/api/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })

await check("a target that is not local is refused, in a sentence", async () => {
  const { status, body } = await start({
    url: "https://example.com",
    projectRoot: project,
    devScript: null,
  })
  assert.equal(status, 400)
  assert.match(body.error, /local|loopback|localhost/i)
})

await check("a folder with no package.json is refused", async () => {
  const { status, body } = await start({
    url: `http://127.0.0.1:${app.port}`,
    projectRoot: fixture("empty"),
    devScript: null,
  })
  assert.equal(status, 400)
  assert.match(body.error, /package\.json/i)
})

await check("a project without React is refused before the launch, not after", async () => {
  const dir = fixture("plain")
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "plain" }))
  const { status, body } = await start({
    url: `http://127.0.0.1:${app.port}`,
    projectRoot: dir,
    devScript: null,
  })
  assert.equal(status, 400)
  assert.match(body.error, /react/i)
})

await check("a dev script the project does not have is refused", async () => {
  const { status, body } = await start({
    url: `http://127.0.0.1:${app.port}`,
    projectRoot: project,
    devScript: "nope",
  })
  assert.equal(status, 400)
  assert.match(body.error, /nope|script/i)
})

await check("an off-origin page cannot reach it", async () => {
  const { status } = await json(`${screen.url}/api/apps`, {
    headers: { origin: "https://evil.example" },
  })
  assert.ok(status >= 400, `expected a refusal, got ${status}`)
})

await check("an unknown path is a 404", async () => {
  const response = await fetch(`${screen.url}/nope`)
  assert.equal(response.status, 404)
})

await check("status stays false until an endpoint file says otherwise", async () => {
  const { body } = await json(`${screen.url}/api/status`)
  assert.equal(body.ready, false)
})

await check("a stale endpoint file from another run is not ready", async () => {
  const file = path.join(fixture("state"), "endpoint.json")
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid + 1, proxyPort: 4312 }))
  screen.reportEndpointFile(file)
  const { body } = await json(`${screen.url}/api/status`)
  assert.equal(body.ready, false)
})

await check("this run's endpoint file flips it to ready, with the proxy URL", async () => {
  const file = path.join(fixture("state"), "endpoint.json")
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, proxyPort: 4312, wsPort: 4313 }))
  screen.reportEndpointFile(file)
  const { body } = await json(`${screen.url}/api/status`)
  assert.equal(body.ready, true)
  assert.equal(body.url, "http://127.0.0.1:4312")
})

await check("a valid choice resolves the handoff the CLI is waiting on", async () => {
  const response = await start({
    url: `http://127.0.0.1:${app.port}`,
    projectRoot: project,
    devScript: "dev",
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)

  const choice = await Promise.race([
    screen.chosen,
    new Promise((_, reject) => setTimeout(() => reject(new Error("chosen never resolved")), 2000)),
  ])
  assert.equal(choice.appPort, app.port)
  assert.equal(choice.projectRoot, project)
  assert.equal(choice.devScript, "dev")
  assert.match(choice.appUrl, new RegExp(`:${app.port}$`))
})

screen.close()
app.close()
for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
