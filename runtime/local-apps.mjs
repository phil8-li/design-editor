/**
 * Discovery for the start screen: what is already running on this machine, and
 * where does each of those things live on disk.
 *
 * No UI, no HTTP, no config. This is the half of the start screen that touches
 * the machine, and the machine is one nobody here has seen: a port that hangs
 * mid-response, an `lsof` the OS refuses, a home directory behind a TCC prompt.
 * Every function degrades to `null` or `[]` rather than throwing — a wrong
 * guess costs one click at the folder picker, an exception costs the whole
 * start screen.
 *
 * Nothing here is authoritative. Whether a project can actually be edited stays
 * the vendor's call, which is why the framework test below is a transcription
 * of the vendor's own rather than an improvement on it.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/**
 * Where a local web app is actually likely to be, kept short so a full scan
 * costs one timeout rather than a minute:
 *
 *   3000-3005  Next.js and Create React App both default to 3000 and walk up
 *              one port at a time when it is taken, so a second app is 3001.
 *   5173-5175  Vite, which walks the same way.
 *   4321       Astro.  4200  Angular CLI and the scaffolds that copied it.
 *   8080, 8000 The generic pair: Remix, webpack-dev-server, anything Python.
 */
export const DEFAULT_SCAN_PORTS = [
  3000, 3001, 3002, 3003, 3004, 3005, 5173, 5174, 5175, 4321, 4200, 8080, 8000,
]

/** How much of a document is read looking for a title, before giving up. */
const MAX_TITLE_BYTES = 8 * 1024
const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i
// Titles carry entities, and the picker prints what it is given.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" }

/** `lsof` is fast, but a hung one must not hold the start screen open. */
const LSOF_TIMEOUT_MS = 1500

// The `dev` and `start` families, best first. The exact names come first in
// this order; anything else in the family (`dev:https`, `start-local`) keeps
// its declaration order behind them.
const PREFERRED_DEV_SCRIPTS = ["dev", "develop", "start", "serve"]
const DEV_SCRIPT_FAMILY = /^(dev|develop|start|serve)([:_-]|$)/

// Transcribed from `react-rewrite-cli/dist/detect.js`. Disagreeing with the
// vendor here means the launch fails after this screen already said yes.
const NEXT_CONFIGS = ["next.config.js", "next.config.ts", "next.config.mjs"]
const VITE_CONFIGS = ["vite.config.js", "vite.config.ts"]

/** Missing and denied are the same answer to every question asked here. */
function statOf(target) {
  try {
    return fs.statSync(target)
  } catch {
    return null
  }
}

const isDirectory = (target) => statOf(target)?.isDirectory() ?? false
const hasFile = (dir, name) => statOf(path.join(dir, name))?.isFile() ?? false

/** The parsed `package.json`, or null for missing, unreadable and malformed alike. */
function readPackageJson(dir) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  } catch {
    return null
  }
  return parsed && typeof parsed === "object" ? parsed : null
}

const withinNodeModules = (dir) => dir.split(path.sep).includes("node_modules")

/**
 * The nearest ancestor (including `start`) holding a package.json and not
 * itself vendored. `npm run dev` is often invoked from a subdirectory, and a
 * cwd inside node_modules describes a launcher rather than a project.
 */
function nearestProjectRoot(start) {
  let dir = start
  for (;;) {
    if (!withinNodeModules(dir) && hasFile(dir, "package.json")) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Runs `lsof` and returns its stdout, or null if it is missing, slow or denied. */
function lsof(args) {
  try {
    return execFileSync("lsof", args, {
      timeout: LSOF_TIMEOUT_MS,
      encoding: "utf8",
      // stderr is discarded: a denied lookup is an expected answer here, not
      // something the user should see printed under the start screen banner.
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

/**
 * The project root for whatever is listening on `port`, by asking that process
 * for its own working directory — which, for a dev server, IS the project root.
 *
 * macOS only, stated plainly rather than dressed up as portable: this is BSD
 * `lsof` output, Linux answers `-d cwd` only for your own processes, and
 * Windows has no equivalent. Everywhere else it returns null and the user picks
 * the folder themselves.
 */
export function projectRootForPort(port) {
  if (process.platform !== "darwin") return null
  if (!Number.isInteger(port)) return null

  // One port can list several pids (IPv4 and IPv6 rows, or a cluster). The
  // first is the one that answered the scan closely enough.
  const pid = lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => /^\d+$/.test(line))
  if (!pid) return null

  // `-Fn` is the machine-readable form: one field per line, the cwd being the
  // line tagged `n`.
  //
  // Denial arrives HERE, not as a failure: a process this user does not own
  // answers with a zero exit status and the reason inside the field itself
  // ("ncwd|rtd info error: Operation not permitted"), which `path` is happy to
  // read as a relative path. So the field only counts when it is absolute.
  const cwd = lsof(["-a", "-p", pid, "-d", "cwd", "-Fn"])
    ?.split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1)
    .trim()
  if (!cwd || !path.isAbsolute(cwd)) return null

  return nearestProjectRoot(isDirectory(cwd) ? cwd : path.dirname(cwd))
}

function decodeEntities(text) {
  return text.replace(/&(#39|[a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
}

/**
 * The first `MAX_TITLE_BYTES` of the response. Bounded, and matched rather than
 * parsed: all that is wanted is the `<title>`, and a dev server's index page is
 * a megabyte of inlined bundle below the fold.
 */
async function readHead(response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let head = ""
  try {
    while (head.length < MAX_TITLE_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      head += decoder.decode(value, { stream: true })
      if (TITLE_PATTERN.test(head)) break
    }
  } catch {
    // A truncated read is still worth a regex.
  }
  reader.cancel().catch(() => {})
  return head
}

/**
 * The page title at `url`, `""` for a web page with no usable title, and null
 * when there is no app here. Content type carries the "is this an app" half of
 * the question, so a Postgres port or a bare JSON API drops out here, and a
 * closed port is refused before that — hence no separate TCP probe in front.
 */
async function probeTitle(url, timeoutMs) {
  let response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "text/html" },
    })
  } catch (error) {
    // On loopback a closed port is refused instantly, so running out of time is
    // not silence: something accepted and is still thinking, which is a dev
    // server compiling its first page — the row the user came for. It counts as
    // a hit with no title rather than being dropped for being slow.
    return error?.name === "TimeoutError" ? "" : null
  }

  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    response.body?.cancel().catch(() => {})
    return null
  }

  const title = TITLE_PATTERN.exec(await readHead(response))?.[1] ?? ""
  return decodeEntities(title).replace(/\s+/g, " ").trim()
}

/**
 * Every local app the machine will admit to, sorted by port. Probed
 * concurrently, because a serial scan pays every dead port's timeout in turn
 * and most of this list is dead on any given machine.
 *
 * Never rejects. Finding nothing is the empty list, which the start screen's
 * URL field covers.
 */
export async function scanLocalApps({
  ports = DEFAULT_SCAN_PORTS,
  host = "127.0.0.1",
  // Long enough to get a NAME out of a dev server, not just a port. A warm one
  // answers in milliseconds, but the scan is often the first request the thing
  // has had all day and Next compiles the route before it replies — measured at
  // 8s cold, well past any timeout worth waiting through. So this buys the warm
  // case and the cold one still lists, labelled by its address. Probes run
  // concurrently, so it is the whole scan's ceiling, not a cost per port.
  timeoutMs = 1500,
} = {}) {
  const probed = await Promise.all(
    ports.map(async (port) => {
      const url = `http://${host}:${port}`
      const title = await probeTitle(`${url}/`, timeoutMs)
      // An untitled page is still an app worth offering; the address is the
      // only honest label left for it.
      return title === null ? null : { port, url, title: title || `${host}:${port}` }
    })
  )

  // The disk lookups run only for ports that answered: `lsof` is synchronous
  // and would otherwise block the scan once per dead port.
  return probed
    .filter((hit) => hit !== null)
    .sort((a, b) => a.port - b.port)
    .map((hit) => {
      const projectRoot = projectRootForPort(hit.port)
      return {
        ...hit,
        projectRoot,
        packageName: projectRoot ? describeProject(projectRoot).packageName : null,
      }
    })
}

/**
 * One directory, read synchronously and reported flat. Every field is present
 * on every return — including for a directory that does not exist — so the page
 * never has to feature-test one. `hasReact` is separate from `framework`
 * because the vendor checks it FIRST, before any config file: a Vite project
 * without React reports `framework: "vite"` and still cannot be edited.
 */
export function describeProject(dir) {
  const target = path.resolve(dir)
  const result = {
    path: target,
    name: path.basename(target),
    exists: fs.existsSync(target),
    isDirectory: isDirectory(target),
    hasPackageJson: false,
    packageName: null,
    hasReact: false,
    devScripts: [],
    framework: null,
  }
  if (!result.isDirectory) return result

  const pkg = readPackageJson(target)
  result.hasPackageJson = hasFile(target, "package.json")
  if (!pkg) return result

  result.packageName = typeof pkg.name === "string" ? pkg.name : null
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
  result.hasReact = Boolean(dependencies.react)

  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {}
  const named = Object.keys(scripts).filter(
    (name) => typeof scripts[name] === "string" && DEV_SCRIPT_FAMILY.test(name)
  )
  const preferred = PREFERRED_DEV_SCRIPTS.filter((name) => named.includes(name))
  result.devScripts = [...preferred, ...named.filter((name) => !preferred.includes(name))]

  if (NEXT_CONFIGS.some((name) => hasFile(target, name))) result.framework = "nextjs"
  else if (VITE_CONFIGS.some((name) => hasFile(target, name))) result.framework = "vite"
  else if (dependencies["react-scripts"]) result.framework = "cra"

  return result
}

/**
 * The folder picker's one screen: where it is, where up is, and what it can
 * descend into, each subdirectory flagged so the picker can mark real projects
 * without a second round trip.
 *
 * A missing or unreadable directory is an empty listing, never a throw. This
 * walks a stranger's home directory on a machine that puts a TCC prompt in
 * front of Desktop, Documents and Downloads: denial is the normal case, and it
 * has to look like an empty folder rather than a broken picker.
 */
export function listDirectories(dir) {
  const target = path.resolve(dir)
  const parent = path.dirname(target)

  let names = []
  try {
    // Dotfiles are noise and node_modules is a project's interior; neither is a
    // folder anyone is looking for. `isDirectory` stats, so a checkout reached
    // through a symlink still counts as one.
    names = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map((entry) => entry.name)
  } catch {
    // Denied, missing, or not a directory. All three are an empty folder here.
  }

  const entries = names
    .map((name) => ({ name, path: path.join(target, name) }))
    .filter((entry) => isDirectory(entry.path))
    .map((entry) => ({ ...entry, hasPackageJson: hasFile(entry.path, "package.json") }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

  return { path: target, parent: parent === target ? null : parent, entries }
}
