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
 *    dead port, so the pid is what the check is really on;
 *  - the screen outlives every editor it starts. It used to latch shut on the
 *    first press, which is what made the whole command a one-way door: the only
 *    way to design a second app was to kill the process. A second choice being
 *    accepted is the point of the supervisor, so it is pinned here.
 *
 * Usage: node design-editor/test/start-screen-cases.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

import { folderDialog } from "../runtime/folder-dialog.mjs"
import {
  DEFAULT_SCAN_PORTS,
  describeProject,
  projectRootForPort,
  projectRootFromPage,
  scanLocalApps,
} from "../runtime/local-apps.mjs"
import { PREFERRED_START_SCREEN_PORT, createStartScreen } from "../runtime/start-screen.mjs"

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
function pageServer(title, body = "hi") {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`)
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

/*
 * The folder an app row carries. `lsof -d cwd` is the direct answer and a
 * managed Mac refuses it for the user's own dev servers, which left every row
 * with no folder and sent the person to a file picker for a path the machine
 * already knew. A dev server writes absolute paths into its own page, so the
 * page is the way around a permission the process cannot get.
 */
await check("a dev server that names itself in its page needs no permission", () => {
  const root = reactProject()
  fs.mkdirSync(path.join(root, ".next"), { recursive: true })
  const trace = `at Layout (${root}/.next/dev/server/chunks/ssr/app_page_tsx.js:35:28)`
  assert.equal(projectRootFromPage(`<script>x=${JSON.stringify(trace)}</script>`), root)
})

await check("a path with spaces in it survives the page and the URL alike", () => {
  const root = path.join(fixture("IG Projects Local"), "Workspaces app")
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "workspaces" }))
  assert.equal(projectRootFromPage(`at Boot (${root}/.next/dev/server/x.js:1:1)`), root)
  // The same path also arrives percent-encoded, inside a file:// URL.
  const encoded = root.split("/").map(encodeURIComponent).join("/")
  assert.equal(projectRootFromPage(`"file://${encoded}/.next/dev/server/x.js"`), root)
})

await check("a path in a page that leads nowhere is not a project folder", () => {
  assert.equal(projectRootFromPage("<html>nothing here</html>"), null)
  assert.equal(projectRootFromPage("at X (/no/such/place/.next/dev/server/x.js:1:1)"), null)
  assert.equal(projectRootFromPage("at X (relative/.next/dev/x.js:1:1)"), null)
})

await check("the folder reaches the app row the page came from", async () => {
  const root = reactProject()
  fs.mkdirSync(path.join(root, ".next"), { recursive: true })
  // Past where a title lives, so the read has to keep going to find it.
  const app = await pageServer("Workspaces", `${"<p>filler</p>".repeat(1200)}
    <script>window.__t = "at Layout (${root}/.next/dev/server/chunks/ssr/page.js:1:1)"</script>`)
  try {
    const [found] = await scanLocalApps({ ports: [app.port] })
    assert.equal(found.projectRoot, root)
    assert.equal(found.packageName, "fixture-app")
  } finally {
    app.close()
  }
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

console.log("\nThe folder dialog")

// The dialog itself is a window a person has to answer, so what is pinned here
// is the command built for it — the part that is wrong silently.
await check("each desktop gets its own native picker, opened where it was told", () => {
  const mac = folderDialog("darwin", "/Users/someone/code")
  assert.equal(mac.command, "osascript")
  // NSOpenPanel rather than `choose folder`: the AppleScript command answers
  // with an alias, which cannot be built for a folder macOS protects.
  assert.match(mac.args.join(" "), /NSOpenPanel/)
  assert.match(mac.args.join(" "), /\/Users\/someone\/code/)

  const windows = folderDialog("win32", "C:\\Users\\someone")
  assert.equal(windows.command, "powershell.exe")
  assert.match(windows.args.join(" "), /FolderBrowserDialog/)
  // Without an apartment of its own the dialog never appears.
  assert.ok(windows.args.includes("-STA"))

  const linux = folderDialog("linux", "/home/someone")
  assert.equal(linux.command, "zenity")
  assert.ok(linux.args.includes("--directory"))
  // zenity opens the parent unless the path ends in a separator.
  assert.ok(linux.args.includes("--filename=/home/someone/"))
})

await check("a quote in a path cannot break out of the script it is written into", () => {
  const mac = folderDialog("darwin", '/tmp/it"s here')
  assert.match(mac.args.at(-1), /\\"s here/)
  const windows = folderDialog("win32", "C:\\it's here")
  assert.match(windows.args.at(-1), /it''s here/)
})

await check("a platform with no known picker says so instead of guessing", () => {
  assert.equal(folderDialog("aix", "/"), null)
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

await check("it reports what is running", async () => {
  const { status, body } = await json(`${screen.url}/api/apps`)
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.apps))
})

await check("it describes a folder", async () => {
  const { status, body } = await json(
    `${screen.url}/api/project?path=${encodeURIComponent(project)}`
  )
  assert.equal(status, 200)
  assert.equal(body.project.hasReact, true)
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

/*
 * The dialog is a window a person has to answer, so the route is driven with a
 * stand-in for it. What is worth pinning is the three things the page depends
 * on: where the dialog is told to open, what a choice turns into, and that
 * dismissing it is an ordinary answer rather than an error.
 */
async function withBrowseScreen(openFolderDialog, run) {
  const stub = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {}, openFolderDialog })
  const browse = (payload) =>
    json(`${stub.url}/api/browse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  try {
    await run(browse)
  } finally {
    stub.close()
  }
}

await check("browsing opens the dialog where the field points, and describes what comes back", async () => {
  let openedAt = null
  await withBrowseScreen(
    async ({ startIn }) => {
      openedAt = startIn
      return { canceled: false, path: project }
    },
    async (browse) => {
      const { status, body } = await browse({ startIn: "~" })
      assert.equal(status, 200)
      // The page may send `~`, or nothing at all; neither reaches the dialog raw.
      assert.equal(openedAt, os.homedir())
      assert.equal(body.canceled, false)
      assert.equal(body.project.path, project)
      assert.equal(body.project.hasReact, true)
    }
  )
})

await check("a dismissed dialog leaves the field alone instead of erroring", async () => {
  await withBrowseScreen(
    async () => ({ canceled: true }),
    async (browse) => {
      const { status, body } = await browse({})
      assert.equal(status, 200)
      assert.equal(body.canceled, true)
      assert.equal(body.project, undefined)
    }
  )
})

// The dialog can end up behind the browser window, and the second press has to
// say that rather than queue another one behind the first.
await check("a second press while the dialog is open says where the first one went", async () => {
  let release
  await withBrowseScreen(
    () => new Promise((resolve) => (release = () => resolve({ canceled: true }))),
    async (browse) => {
      const first = browse({})
      // The route only holds the flag once the dialog call is under way.
      await new Promise((resolve) => setTimeout(resolve, 50))
      const { status, body } = await browse({})
      assert.equal(status, 409)
      assert.match(body.error, /already open/i)
      release()
      assert.equal((await first).status, 200)
    }
  )
})

// Dragging a folder onto a terminal is the most direct way to get a path out of
// the Finder, and it writes the shell's escaping along with it.
await check("a path pasted with shell escaping still finds the folder", async () => {
  const dir = fixture("with space")
  const spaced = path.join(dir, "IG Projects Local")
  fs.mkdirSync(spaced)
  const escaped = spaced.replace(/ /g, "\\ ")

  const { status, body } = await json(`${screen.url}/api/project?path=${encodeURIComponent(escaped)}`)
  assert.equal(status, 200)
  assert.equal(body.project.path, spaced)
  assert.equal(body.project.isDirectory, true)
})

await check("a folder whose name really has a backslash is not unescaped away", async () => {
  const dir = fixture("backslash")
  const odd = path.join(dir, "a\\ b")
  fs.mkdirSync(odd)
  const { body } = await json(`${screen.url}/api/project?path=${encodeURIComponent(odd)}`)
  assert.equal(body.project.path, odd)
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

/*
 * The launcher runs in this same process, so the endpoint file was never the
 * fact — only a way of carrying it, and one that fails whenever the project
 * folder refuses to be written to. When it does, the proxy is up, the page is
 * still polling, and "Starting the editor…" stays on screen forever.
 */
await check("the proxy being up is not a file the project folder has to accept", async () => {
  const deaf = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {} })
  try {
    // No endpoint file was ever reported: the write it would have come from failed.
    assert.equal((await json(`${deaf.url}/api/status`)).body.ready, false)
    deaf.reportReady("http://127.0.0.1:4344")
    const { body } = await json(`${deaf.url}/api/status`)
    assert.equal(body.ready, true)
    assert.equal(body.url, "http://127.0.0.1:4344")
  } finally {
    deaf.close()
  }
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
  // The supervisor names the running editor on the page, and this is where the
  // name comes from — the manifest it just read to validate the folder.
  assert.equal(choice.packageName, "fixture-app")
})

// The press before this one is still on its way up, and the supervisor has not
// spawned anything yet. Acting on a second would kill a child the first is
// waiting on, so it is refused — and refused in words, on the screen.
await check("a second press before the editor answers is the same press", async () => {
  const { status, body } = await start({
    url: `http://127.0.0.1:${app.port}`,
    projectRoot: project,
    devScript: "dev",
  })
  assert.equal(status, 400)
  assert.match(body.error, /already starting/i)
})

screen.close()

console.log("\nSwitching apps")

/*
 * The whole point of the supervisor. Before it, `/api/start` latched shut on
 * the first press for the life of the process: the page bounced to the editor
 * forever, and designing a second app meant Ctrl+C and starting over.
 */
await check("a second choice is accepted once the first editor is up", async () => {
  const second = await pageServer("Second")
  const screen = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {} })
  const press = (port) =>
    json(`${screen.url}/api/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${port}`, projectRoot: project, devScript: null }),
    })
  try {
    const first = screen.nextChoice()
    assert.equal((await press(app.port)).status, 200)
    assert.equal((await first).appPort, app.port)

    // The supervisor's loop: ask again the moment the child is spawned, then
    // report the URL it answered with.
    const next = screen.nextChoice()
    screen.reportReady("http://127.0.0.1:3456", {
      appUrl: `http://127.0.0.1:${app.port}`,
      projectRoot: project,
      packageName: "fixture-app",
    })

    assert.equal((await press(second.port)).status, 200)
    const choice = await Promise.race([
      next,
      new Promise((_, reject) => setTimeout(() => reject(new Error("the second choice never arrived")), 2000)),
    ])
    assert.equal(choice.appPort, second.port)
    // `chosen` is still the first choice, for the callers that only ever want one.
    assert.equal((await screen.chosen).appPort, app.port)
  } finally {
    screen.close()
    second.close()
  }
})

/*
 * A switch usually lands the new proxy on the very port the old one had, so a
 * page that kept the old URL and waited for it to change would follow the
 * corpse. Accepting a choice is what clears the old editor from the answer.
 */
await check("status says what is being edited, and forgets it the moment a switch is asked for", async () => {
  const screen = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {} })
  try {
    const idle = (await json(`${screen.url}/api/status`)).body
    assert.deepEqual(idle, { ready: false, editing: null, stopped: null })

    screen.reportReady("http://127.0.0.1:3456", {
      appUrl: "http://127.0.0.1:3000",
      projectRoot: project,
      packageName: "fixture-app",
    })
    const running = (await json(`${screen.url}/api/status`)).body
    assert.equal(running.ready, true)
    assert.equal(running.url, "http://127.0.0.1:3456")
    assert.equal(running.editing.appUrl, "http://127.0.0.1:3000")
    assert.equal(running.editing.packageName, "fixture-app")
    assert.equal(running.editing.projectRoot, project)
    assert.equal(running.stopped, null)

    screen.nextChoice()
    const accepted = await json(`${screen.url}/api/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${app.port}`, projectRoot: project, devScript: null }),
    })
    assert.equal(accepted.status, 200)
    const switching = (await json(`${screen.url}/api/status`)).body
    assert.equal(switching.ready, false)
    assert.equal(switching.editing, null)
  } finally {
    screen.close()
  }
})

// A child that dies on its own must not be a dead terminal. The screen is still
// up, so it is where the explanation goes and where the next attempt starts.
await check("an editor that stops clears readiness and leaves a sentence behind", async () => {
  const screen = await createStartScreen({ host: "127.0.0.1", port: 0, log: () => {} })
  try {
    screen.reportReady("http://127.0.0.1:3456", {
      appUrl: "http://127.0.0.1:3000",
      projectRoot: project,
      packageName: "fixture-app",
    })
    screen.reportStopped("The editor for fixture-app stopped with code 1.")
    const { body } = await json(`${screen.url}/api/status`)
    assert.equal(body.ready, false)
    assert.equal(body.url, undefined)
    assert.equal(body.editing, null)
    assert.match(body.stopped, /stopped with code 1/)

    // And the screen is a chooser again: the round the stopped child closed is
    // open, so the next press is accepted rather than refused as a double.
    const next = screen.nextChoice()
    const { status } = await json(`${screen.url}/api/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${app.port}`, projectRoot: project, devScript: null }),
    })
    assert.equal(status, 200)
    assert.equal((await next).appPort, app.port)
  } finally {
    screen.close()
  }
})

/*
 * The URL has to be one the user can come back to, all session, without reading
 * it off a terminal — so it is a port next to the proxy's rather than whatever
 * the OS handed out. Preferred, though: something else on 3455 moves the screen
 * aside instead of stopping the command.
 */
await check("the screen prefers one port, and steps aside when it is taken", async () => {
  const squatter = http.createServer()
  await new Promise((resolve, reject) => {
    squatter.once("error", reject)
    squatter.listen(PREFERRED_START_SCREEN_PORT, "127.0.0.1", resolve)
  })

  const moved = await createStartScreen({ host: "127.0.0.1", log: () => {} })
  const movedPort = Number(new URL(moved.url).port)
  moved.close()
  assert.notEqual(movedPort, PREFERRED_START_SCREEN_PORT)
  assert.ok(movedPort > 0)

  await new Promise((resolve) => squatter.close(resolve))
  const preferred = await createStartScreen({ host: "127.0.0.1", log: () => {} })
  const port = Number(new URL(preferred.url).port)
  preferred.close()
  assert.equal(port, PREFERRED_START_SCREEN_PORT)
})

app.close()
for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
