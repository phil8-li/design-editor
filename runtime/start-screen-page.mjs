/**
 * The start screen document: the product's front door.
 *
 * Until now the only way in was `design-editor --dev 3000` — you had to know
 * the port, the project root and the flag before anything appeared. This page
 * is the replacement, and it is served by the start-screen server before the
 * editing proxy exists, so it has to be one self-contained document: inline
 * style, inline module script, no fetches for anything but its own three JSON
 * routes.
 *
 * Everything the script renders from the server — a page title, a folder name,
 * an error sentence — arrives as untrusted string data and is written with
 * `textContent`. That is the whole injection surface of this feature, and it is
 * closed by never building markup from a string.
 */

import { startScreenStyle } from "./start-screen-style.mjs"

/**
 * Where the folder picker opens when nothing at all was detected: no app is
 * running, so no project root came back, and the browser cannot name a single
 * absolute path on the machine it is talking to. The filesystem root is the one
 * path that is always there to navigate down from.
 */
const PICKER_FALLBACK = "/"

/** How long the waiting state stays silent before it says what to check. */
const SLOW_MS = 90_000

const CLIENT = `
const $ = (id) => document.getElementById(id)
const el = {
  form: $("form"), url: $("url"),
  apps: $("apps"), appsNote: $("apps-note"), appsError: $("apps-error"),
  path: $("folder-path"), change: $("folder-change"), folderError: $("folder-error"),
  picker: $("picker"), crumbs: $("crumbs"), dirs: $("dirs"),
  cancel: $("picker-cancel"), use: $("picker-use"),
  scriptRow: $("script-row"), script: $("script"),
  submit: $("submit"), hint: $("hint"), submitError: $("submit-error"),
  waiting: $("waiting"), progress: $("progress"), waitingNote: $("waiting-note"),
}

let apps = []
let root = null      // { path, info } — the folder the editor will write source into
let browsing = null  // { path, project } while the picker is open
let devScript = null
let busy = false

/*
 * The browser is never told the server's home directory and the API contract is
 * frozen, so the two conventional layouts are recognised by shape. Anything
 * else renders in full, which is correct — only longer.
 */
const HOME = /^(\\/Users\\/[^/]+|\\/home\\/[^/]+|[A-Za-z]:\\\\Users\\\\[^\\\\]+)(?=[/\\\\]|$)/
const tilde = (value) => value.replace(HOME, "~")

function show(node, message) {
  node.textContent = message
  node.hidden = message === ""
}

function clearErrors() {
  for (const node of [el.appsError, el.folderError, el.submitError]) show(node, "")
}

/** A typed URL only counts as one of the detected apps if it is loopback. */
function portOf(value) {
  try {
    const url = new URL(/^[a-z]+:\\/\\//i.test(value) ? value : "http://" + value)
    const host = url.hostname.replace(/^\\[|\\]$/g, "")
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return null
    return Number(url.port || (url.protocol === "https:" ? 443 : 80))
  } catch {
    return null
  }
}

const matchedApp = () => {
  const port = portOf(el.url.value.trim())
  return port === null ? null : apps.find((app) => app.port === port) ?? null
}

function render() {
  const app = matchedApp()
  for (const row of el.apps.children) {
    row.setAttribute("aria-pressed", String(app !== null && Number(row.dataset.port) === app.port))
  }
  el.path.textContent = root ? tilde(root.path) : "Not chosen yet"
  const scripts = root ? root.info.devScripts : []
  el.scriptRow.hidden = app !== null || scripts.length < 2
  el.submit.textContent = app ? "Start designing" : "Start app & designing"
  if (app || !root) show(el.hint, "")
  else if (devScript) show(el.hint, "Runs npm run " + devScript + " in " + tilde(root.path))
  else show(el.hint, "That folder has no dev script in its package.json.")
  el.submit.disabled = busy || el.url.value.trim() === "" || !root || (!app && !devScript)
}

async function getJson(path, errorNode) {
  let response
  try {
    response = await fetch(path)
  } catch (error) {
    show(errorNode, "Could not reach the start screen: " + error.message)
    return null
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    show(errorNode, (data && data.error) || "The start screen answered " + response.status + ".")
    return null
  }
  return data
}

function adoptProject(project) {
  root = { path: project.path, info: project }
  devScript = project.devScripts[0] ?? null
  el.script.replaceChildren()
  for (const name of project.devScripts) {
    const option = document.createElement("option")
    option.value = name
    option.textContent = name
    el.script.append(option)
  }
  if (devScript) el.script.value = devScript
}

function appRow(app) {
  const row = document.createElement("button")
  row.type = "button"
  row.className = "app"
  row.dataset.port = String(app.port)
  row.setAttribute("aria-pressed", "false")
  const name = document.createElement("span")
  name.className = "app-name"
  name.textContent = app.title || app.url
  const port = document.createElement("span")
  port.className = "app-port"
  port.textContent = ":" + app.port
  row.append(name, port)
  row.addEventListener("click", () => chooseApp(app))
  return row
}

async function chooseApp(app) {
  clearErrors()
  closePicker()
  el.url.value = app.url
  if (app.projectRoot) {
    const data = await getJson("/api/project?path=" + encodeURIComponent(app.projectRoot), el.folderError)
    if (data) adoptProject(data.project)
  }
  render()
}

function dirRow(name, path, isProject) {
  const item = document.createElement("li")
  const button = document.createElement("button")
  button.type = "button"
  button.className = "dir"
  const label = document.createElement("span")
  label.className = "dir-name"
  label.textContent = name
  button.append(label)
  if (isProject) {
    const tag = document.createElement("span")
    tag.className = "dir-tag"
    tag.textContent = "project"
    button.append(tag)
  }
  button.addEventListener("click", () => browse(path))
  item.append(button)
  return item
}

async function browse(path) {
  const data = await getJson("/api/project?path=" + encodeURIComponent(path), el.folderError)
  if (!data) return
  browsing = { path: data.listing.path, project: data.project }
  el.picker.hidden = false
  el.crumbs.textContent = tilde(data.listing.path)
  el.dirs.replaceChildren()
  if (data.listing.parent) el.dirs.append(dirRow("Up one level", data.listing.parent, false))
  for (const entry of data.listing.entries) {
    el.dirs.append(dirRow(entry.name, entry.path, entry.hasPackageJson))
  }
  // Focus follows the navigation, so the picker can be driven from the keyboard.
  const first = el.dirs.querySelector(".dir")
  if (first) first.focus()
}

function closePicker() {
  if (el.picker.hidden) return
  el.picker.hidden = true
  browsing = null
  el.change.focus()
}

el.change.addEventListener("click", () => {
  clearErrors()
  browse(root ? root.path : ${JSON.stringify(PICKER_FALLBACK)})
})
el.cancel.addEventListener("click", closePicker)
el.use.addEventListener("click", () => {
  if (!browsing) return
  adoptProject(browsing.project)
  closePicker()
  render()
})
el.picker.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePicker()
})

el.url.addEventListener("input", () => {
  clearErrors()
  render()
})
el.script.addEventListener("change", () => {
  devScript = el.script.value
  render()
})

el.form.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (el.submit.disabled) return
  clearErrors()
  const script = matchedApp() ? null : devScript
  busy = true
  render()

  let response
  try {
    response = await fetch("/api/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: el.url.value.trim(), projectRoot: root.path, devScript: script }),
    })
  } catch (error) {
    busy = false
    render()
    show(el.submitError, "Could not reach the start screen: " + error.message)
    return
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    busy = false
    render()
    show(el.submitError, (data && data.error) || "The start screen answered " + response.status + ".")
    return
  }
  waitForEditor(script)
})

/*
 * A first Next.js compile routinely runs past thirty seconds, so this state has
 * no deadline. It keeps polling forever and, once it is clearly slow, says
 * where to look instead of failing into a dead end.
 */
function waitForEditor(script) {
  el.form.hidden = true
  el.waiting.hidden = false
  el.progress.textContent = script ? "Starting your app…" : "Starting the editor…"
  const startedAt = Date.now()
  const poll = async () => {
    const response = await fetch("/api/status").catch(() => null)
    const data = response && response.ok ? await response.json().catch(() => null) : null
    if (data && data.ready) {
      location.replace(data.url)
      return
    }
    if (Date.now() - startedAt > ${SLOW_MS}) {
      show(
        el.waitingNote,
        "Still working. A first compile can take a while — the terminal running design-editor has the app's output."
      )
    }
    setTimeout(poll, 500)
  }
  poll()
}

async function boot() {
  const data = await getJson("/api/apps", el.appsError)
  apps = (data && data.apps) || []
  el.apps.replaceChildren(...apps.map(appRow))
  show(
    el.appsNote,
    apps.length
      ? ""
      : "Nothing is running yet. Type the URL your dev server will use and it will be started for you."
  )
  if (apps.length && el.url.value.trim() === "") await chooseApp(apps[0])
  else render()
}

boot()
`

export function startScreenPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>design-editor — open an app</title>
<style>${startScreenStyle()}</style>
</head>
<body>
<main class="card">
  <header>
    <p class="brand">design-editor</p>
    <p class="lede">Open a running dev server and edit the page straight into its source.</p>
  </header>

  <form id="form" autocomplete="off">
    <div class="section">
      <label class="label" for="url">Dev server URL</label>
      <input id="url" name="url" type="text" spellcheck="false" autofocus
             placeholder="http://127.0.0.1:3000">
    </div>

    <div class="section">
      <p class="label">Running locally</p>
      <div class="apps" id="apps"></div>
      <p class="note" id="apps-note">Looking for dev servers…</p>
      <p class="error" id="apps-error" hidden></p>
    </div>

    <div class="section">
      <p class="label">Project folder</p>
      <div class="folder">
        <span class="path" id="folder-path">Not chosen yet</span>
        <button type="button" class="ghost" id="folder-change">Change</button>
      </div>
      <div class="picker" id="picker" hidden>
        <p class="crumbs" id="crumbs"></p>
        <ul class="dirs" id="dirs"></ul>
        <div class="picker-actions">
          <button type="button" class="ghost" id="picker-cancel">Cancel</button>
          <button type="button" class="ghost strong" id="picker-use">Use this folder</button>
        </div>
      </div>
      <p class="error" id="folder-error" hidden></p>
    </div>

    <div class="section" id="script-row" hidden>
      <label class="label" for="script">Dev script</label>
      <select id="script"></select>
    </div>

    <div class="section">
      <button type="submit" class="primary" id="submit" disabled>Start designing</button>
      <p class="note" id="hint" hidden></p>
      <p class="error" id="submit-error" hidden></p>
    </div>
  </form>

  <div class="waiting" id="waiting" hidden>
    <p class="progress"><span class="pulse"></span><span id="progress"></span></p>
    <p class="note" id="waiting-note" hidden></p>
  </div>
</main>
<script type="module">${CLIENT}</script>
</body>
</html>
`
}
