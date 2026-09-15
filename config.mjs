/**
 * Host configuration for the design editor.
 *
 * One resolved object is the single source of truth for every value that used
 * to be a literal in three places at once: the chrome selectors (vendor patch
 * AND client), the project roots (options store AND agent), the API prefix
 * (server AND client AND test harness), and the ports (launcher AND harness).
 *
 * Defaults target a stock Next.js + Tailwind app and know nothing about the
 * repository they happen to be copied from. Optional host tools (Leva,
 * Agentation, a docked dev panel) are integrations declared by the host config,
 * never package assumptions.
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { DEFAULT_THEME_NAMESPACES } from "./server/design-system-aliases.mjs"
import {
  DEFAULT_TAILWIND_BREAKPOINTS,
  resolveDesignSystemConfig,
} from "./server/design-system-config.mjs"
import { resolveIconSetConfig } from "./server/icon-set.mjs"

export const CONFIG_FILE_NAMES = [
  "design-editor.config.mjs",
  "design-editor.config.js",
]

/**
 * Never host-overridable. The agent reads and rewrites files the browser names,
 * and `.env.local` sits in the project root next to the components. An
 * allowlist a host can empty is not a guard, so this list is applied after the
 * host's own extension allowlist and cannot be extended or removed.
 */
export const SOURCE_DENY_PATTERNS = Object.freeze([
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])[^\\/]*\.config\.[cm]?[jt]sx?$/i,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])\.git([\\/]|$)/,
])

// Tailwind's own palette stems. Always present; a host adds to this, never
// replaces it.
const PALETTE_WORDS = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose", "black", "white",
  "transparent", "current", "inherit",
]

// shadcn/ui's semantic token vocabulary, which `components.json` hosts share.
const SHADCN_WORDS = [
  "foreground", "background", "muted", "primary", "secondary", "accent",
  "destructive", "border", "input", "ring", "card", "popover", "sidebar",
]

// Tailwind v3's discrete spacing table. v4 accepts every integer, so a host on
// v4 should set `spacingScale: "v4-linear"` to stop emitting arbitrary values
// for tokens that now exist.
const V3_SPACING_SCALE = {
  0: "0", 1: "px", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5", 12: "3",
  14: "3.5", 16: "4", 20: "5", 24: "6", 28: "7", 32: "8", 36: "9", 40: "10",
  44: "11", 48: "12", 56: "14", 64: "16", 80: "20", 96: "24", 112: "28",
  128: "32",
}

export const DEFAULT_CONFIG = {
  // `devScript` is the host's own npm script, run only under `--dev`. Named
  // rather than assumed to be `next dev`, because the script is where a host
  // keeps the env, the flags and the wrapper its app actually needs.
  app: { port: null, host: "127.0.0.1", open: false, openQuery: "design", devScript: "dev" },
  ports: { proxy: "auto", ws: "auto" },
  projectRoot: null,
  stateDir: ".local/design-editor",
  apiPrefix: "/__design-editor",
  chrome: {
    // Elements the editor must never treat as canvas: its own shell, and the
    // host's dev GUI. An empty list is legal — `closest("")` throws, so the
    // patch guards on the empty string rather than calling it.
    trustedSelectors: [],
    dockedPanel: {
      selector: "",
      fallbackSelector: "",
      chromeSelectors: [],
      offsetVar: "--design-editor-docked-panel-offset",
      widthVar: "--design-editor-docked-panel-width",
      minWidth: 260,
      maxWidth: 380,
      gap: 12,
      edgeGap: 8,
    },
  },
  // The host's icon set: the DOM attribute an icon names itself with, and the
  // JSON of drawings the picker offers as its variants. Absent by default —
  // a stock app has no such attribute, and the icon section stays hidden.
  icons: { attribute: "", data: null },
  designSystem: {
    manifest: null,
    // A host whose tokens are not a Figma-style manifest: a function (or an
    // object) returning the same normalized token groups. One escape hatch, not
    // a plugin system — see server/design-system-config.mjs.
    adapter: null,
    cssSources: [],
    breakpoints: null,
    containerBreakpoints: null,
    responsiveMeasures: null,
    // Tailwind v3 keeps its scale in `tailwind.config.js` rather than in a
    // stylesheet, so a v3 host has no `@theme` custom property to trace and
    // would otherwise resolve no aliases at all. Either key gives the v3 arm
    // its input; `tailwindTheme` is the declared form, `tailwindConfig` reads
    // the host's own file so the scale keeps one owner.
    tailwindTheme: null,
    tailwindConfig: null,
    // "em" or "px" — the unit the manifest states letter-spacing in. Declared,
    // because a magnitude does not say which one it is.
    trackingUnit: null,
  },
  controls: { leva: null },
  tailwind: {
    version: 3,
    colorWords: [],
    fontSizes: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"],
    fontFamilies: ["sans", "serif", "mono"],
    spacingBase: 4,
    spacingScale: "v3-default",
    breakpoints: DEFAULT_TAILWIND_BREAKPOINTS,
    containerBreakpoints: {},
    spacedStems: null,
    // The `@theme` namespaces a v4 host spells its scales with. Tailwind's own
    // four are the default; a host that renames or extends them says so here
    // rather than being told what its variables are called.
    themeNamespaces: [...DEFAULT_THEME_NAMESPACES],
  },
  source: { roots: [], extensions: [".tsx", ".jsx", ".ts", ".js", ".mts", ".mjs"] },
  // Which UI framework the host app is written in, and whether it compiles
  // Tailwind. "auto"/null mean "work it out from the project", which is what
  // every host should leave them as: both are properties of the project, not
  // things a config file should have to restate.
  //
  // They are first-class settings rather than runtime sniffs because several
  // decisions hang off them before the browser exists — whether the vendored
  // React CLI's detection gates have to be answered, which file extensions the
  // writer may touch, and which resolver the editor bundle uses.
  host: { framework: "auto", tailwind: null },
  vendor: { package: "react-rewrite-cli" },
  agent: {
    transport: "auto",
    // Mirrors the vendor's dist/claude-apply.js, which reserves Sonnet for
    // changes that have to reason about structure — every free-form prompt does.
    model: "claude-sonnet-4-6-20250514",
    maxTokens: 4096,
    systemPrompt: null,
  },
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function merge(base, override) {
  if (!isPlainObject(override)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    out[key] = isPlainObject(base[key]) ? merge(base[key], value) : value
  }
  return out
}

/** First config file at or above `startDir`; null when the host has none. */
export function findConfigFile(startDir = process.cwd()) {
  let dir = path.resolve(startDir)
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function resolveSpacingScale(tailwind) {
  const { spacingScale, spacingBase } = tailwind
  if (isPlainObject(spacingScale)) return spacingScale
  if (spacingScale === "v4-linear") {
    // v4 resolves `p-<n>` to `calc(var(--spacing) * n)`, so every multiple of
    // the base is a real token and needs no arbitrary value.
    const table = {}
    for (let px = 0; px <= 384; px += spacingBase) table[px] = String(px / spacingBase)
    table[1] = "px"
    return table
  }
  return V3_SPACING_SCALE
}

function resolveLevaConfig(value, projectRoot) {
  if (!isPlainObject(value) || typeof value.storeGlobal !== "string" || !value.storeGlobal) {
    return null
  }

  const source = isPlainObject(value.sourceDefaults) ? value.sourceDefaults : null
  const sourceDefaults =
    source && typeof source.file === "string" && typeof source.exportName === "string"
      ? Object.freeze({
          file: path.resolve(projectRoot, source.file),
          exportName: source.exportName,
        })
      : null

  const bindings = Array.isArray(value.bindings)
    ? value.bindings
        .filter((binding) => isPlainObject(binding) && typeof binding.pathPattern === "string")
        .map((binding) =>
          Object.freeze({
            pathPattern: binding.pathPattern,
            selectors: Array.isArray(binding.selectors)
              ? binding.selectors.filter((selector) => typeof selector === "string" && selector)
              : [],
            relationship:
              typeof binding.relationship === "string" && binding.relationship
                ? binding.relationship
                : "affects",
            defaultGroup:
              typeof binding.defaultGroup === "string" && binding.defaultGroup
                ? binding.defaultGroup
                : null,
            defaultKey:
              typeof binding.defaultKey === "string" && binding.defaultKey
                ? binding.defaultKey
                : null,
          })
        )
    : []

  return Object.freeze({
    storeGlobal: value.storeGlobal,
    sourceDefaults,
    bindings: Object.freeze(bindings),
  })
}

const HOST_FRAMEWORKS = new Set(["react", "angular"])

/**
 * What the host's dev server is, and what it takes to start one on a chosen
 * port.
 *
 * One probe, four consumers: which editing lane the browser uses, which port
 * `--dev` picks when nothing names one, and whether the port and the interface
 * have to be spelled on the command line.
 *
 * The two flag columns are the ones that cost bugs, and both were measured on a
 * real machine rather than read off a docs page.
 *
 * PORT: `next dev` reads the environment variable, which is the only mechanism
 * this package ever had. `vite` does not — `PORT=3999 vite` binds 5173 and says
 * so — and neither does `ng serve`. A `--dev` run against either started the
 * app on the framework's own default while the launcher waited on the port it
 * had asked for.
 *
 * HOST: worse, because it is silent. `vite` and `ng serve` both default to
 * `localhost`, and on a machine that resolves that to IPv6 they bind `[::1]`
 * and NOTHING on `127.0.0.1` — measured for both. The launcher probes
 * `127.0.0.1`, the vendored proxy targets `127.0.0.1`, so the app was up,
 * reachable in a browser, and invisible to the editor.
 *
 * Create React App takes neither flag and reads `PORT` and `HOST` instead,
 * which is why this is a table rather than "pass everything and hope".
 */
const DEV_SERVERS = {
  angular: { framework: "angular", port: 4200, portFlag: "--port", hostFlag: "--host" },
  next: { framework: "react", port: 3000, portFlag: "--port", hostFlag: "--hostname" },
  vite: { framework: "react", port: 5173, portFlag: "--port", hostFlag: "--host" },
  cra: { framework: "react", port: 3000, portFlag: null, hostFlag: null },
  unknown: { framework: "react", port: 3000, portFlag: null, hostFlag: null },
}

function readManifest(projectRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  } catch {
    return null
  }
}

/**
 * Which of the five the host is, by the dependency that decides it.
 *
 * Angular is tested first because its scaffolds may carry a `vite.config.ts` of
 * their own, and `next` before `vite` because a Next project can depend on Vite
 * for its tests. The fallthrough is `unknown`, which behaves exactly as this
 * package behaved before any of this existed.
 */
export function detectDevServer(projectRoot) {
  const manifest = readManifest(projectRoot)
  const deps = { ...manifest?.dependencies, ...manifest?.devDependencies }
  const has = (name) => fs.existsSync(path.join(projectRoot, name))

  if (deps["@angular/core"]) return "angular"
  if (deps.next || has("next.config.js") || has("next.config.ts") || has("next.config.mjs")) {
    return "next"
  }
  if (deps["react-scripts"]) return "cra"
  if (deps.vite || has("vite.config.js") || has("vite.config.ts")) return "vite"
  return "unknown"
}

/**
 * Whether the host compiles Tailwind.
 *
 * A separate question from the framework, and the one that actually decides
 * whether a utility class means anything. The React lane's whole writer speaks
 * in utilities, the Code tab offers a "Tailwind classes" view, and the
 * Responsive section writes `md:grid-cols-2` — all three are noise in a project
 * that has no Tailwind, whether that project is Angular or React.
 *
 * The dependency is the reliable signal: Tailwind has to be installed to
 * compile, however the host wires it up. The config file is checked too, for a
 * host that resolves the package through a workspace root this cannot see.
 */
export function detectTailwind(projectRoot) {
  const manifest = readManifest(projectRoot)
  const deps = { ...manifest?.dependencies, ...manifest?.devDependencies }
  if (deps.tailwindcss) return true
  return ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs", "tailwind.config.cjs"]
    .some((name) => fs.existsSync(path.join(projectRoot, name)))
}

/**
 * Which framework the app under the overlay is written in.
 *
 * Detected from the dependency that decides it, not from a config file that
 * happens to sit beside one. `react` is the fallback rather than a third
 * "unknown" state, because every path this value gates already behaved as if
 * the host were React — an unrecognised project keeps that behaviour instead of
 * acquiring a new failure mode.
 */
export function resolveHostFramework(projectRoot, configured = "auto") {
  if (HOST_FRAMEWORKS.has(configured)) return configured
  if (configured !== "auto" && configured !== undefined && configured !== null) {
    throw new Error(`host.framework must be "auto", "react" or "angular" (got ${configured})`)
  }
  return DEV_SERVERS[detectDevServer(projectRoot)].framework
}

/**
 * The file kinds the writer may touch, widened for a framework whose markup is
 * not in its script files.
 *
 * Only when the host has NOT set `source.extensions` itself. The allowlist is
 * the last thing standing between the browser and a file it should not reach,
 * so a host that narrowed it deliberately keeps exactly what it asked for.
 */
function hostSourceExtensions(extensions, framework, overridden) {
  if (framework !== "angular" || overridden) return extensions
  return [...new Set([...extensions, ".html", ".css", ".scss"])]
}

// The `dev` and `start` families, best first — the same order the start screen
// offers them in, so the script this resolves to is the one the screen would
// have preselected. Kept in step with `PREFERRED_DEV_SCRIPTS` in
// runtime/local-apps.mjs, which cannot be imported here: this module is the one
// every other module loads, and that one shells out to `lsof`.
const DEV_SCRIPT_PREFERENCE = ["dev", "develop", "start", "serve"]

/**
 * The npm script `--dev` runs, resolved against the scripts the host actually
 * has.
 *
 * `"dev"` is the right default for Next and Vite and the wrong one for Angular,
 * whose `ng new` writes `start` and no `dev` at all — so `design-editor --dev`
 * on a stock Angular project used to die on `Missing script: dev`, and the fix
 * was a flag the designer had to know to pass. Naming a script the project does
 * not have is not a default, it is a guess, and this is the one place that can
 * check.
 *
 * An explicitly configured name always wins, even a wrong one: a host that says
 * `devScript: "dev"` and has no `dev` script should hear that from npm rather
 * than have this quietly run something else.
 */
export function resolveDevScript(projectRoot, configured, explicit) {
  if (explicit) return configured
  const scripts = readManifest(projectRoot)?.scripts
  if (!scripts || typeof scripts !== "object") return configured
  const has = (name) => typeof scripts[name] === "string"
  if (has(configured)) return configured
  return DEV_SCRIPT_PREFERENCE.find(has) ?? configured
}

/**
 * The port `--dev` starts the app on when nothing names one.
 *
 * A dev server has to be told a port before it can be asked which one it took,
 * so this is a guess by construction — but the framework narrows it to one
 * guess that is nearly always right, and an Angular project that moved its port
 * says so in `angular.json`, which is better than any default.
 */
export function resolveDevPort(projectRoot, devServer) {
  if (devServer === "angular") {
    try {
      const angularJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, "angular.json"), "utf8")
      )
      for (const project of Object.values(angularJson.projects ?? {})) {
        const port =
          project?.architect?.serve?.options?.port ?? project?.targets?.serve?.options?.port
        if (Number.isInteger(port)) return port
      }
    } catch {
      // No angular.json, or one this cannot read. The CLI's own default stands.
    }
  }
  return DEV_SERVERS[devServer].port
}

/**
 * Merges host overrides onto the defaults and makes every path absolute.
 * `projectRoot` defaults to the directory the config file was found in, so it
 * tracks the HOST even when this package is installed under node_modules.
 */
export function resolveConfig(raw = {}, { configPath = null, cwd = process.cwd() } = {}) {
  if (raw.designSystem !== undefined && !isPlainObject(raw.designSystem)) {
    throw new Error("designSystem must be an object with manifest and cssSources")
  }
  const merged = merge(DEFAULT_CONFIG, raw)
  const rootBase = configPath ? path.dirname(configPath) : cwd
  const projectRoot = path.resolve(rootBase, merged.projectRoot ?? ".")
  const stateDir = path.resolve(projectRoot, merged.stateDir)
  const leva = resolveLevaConfig(merged.controls?.leva, projectRoot)
  if (!isPlainObject(merged.tailwind.breakpoints)) {
    throw new Error("tailwind.breakpoints must be an object of CSS pixel values")
  }
  if (!isPlainObject(merged.tailwind.containerBreakpoints)) {
    throw new Error("tailwind.containerBreakpoints must be an object of CSS pixel values")
  }
  const tailwind = Object.freeze({
    ...merged.tailwind,
    colorWords: [...PALETTE_WORDS, ...SHADCN_WORDS, ...merged.tailwind.colorWords],
    spacingScale: resolveSpacingScale(merged.tailwind),
    breakpoints: Object.freeze({ ...merged.tailwind.breakpoints }),
    containerBreakpoints: Object.freeze({ ...merged.tailwind.containerBreakpoints }),
  })
  const designSystem = resolveDesignSystemConfig(
    merged.designSystem,
    projectRoot,
    tailwind.breakpoints,
    tailwind.containerBreakpoints,
    tailwind
  )

  const icons = resolveIconSetConfig(merged.icons, projectRoot)
  const devServer = detectDevServer(projectRoot)
  const framework = resolveHostFramework(projectRoot, merged.host?.framework)
  const tailwindPresent =
    typeof merged.host?.tailwind === "boolean"
      ? merged.host.tailwind
      : detectTailwind(projectRoot)

  const apiPrefix = merged.apiPrefix.startsWith("/")
    ? merged.apiPrefix.replace(/\/+$/, "")
    : `/${merged.apiPrefix.replace(/\/+$/, "")}`

  return Object.freeze({
    ...merged,
    app: Object.freeze({
      ...merged.app,
      devScript: resolveDevScript(
        projectRoot,
        merged.app.devScript,
        typeof raw.app?.devScript === "string"
      ),
      // The port and flags `--dev` uses when neither the command line nor this
      // config names one. Reported rather than applied: `app.port` stays null
      // so "the host did not say" and "the host said 3000" stay distinguishable.
      devPort: resolveDevPort(projectRoot, devServer),
      devPortFlag: DEV_SERVERS[devServer].portFlag,
      devHostFlag: DEV_SERVERS[devServer].hostFlag,
    }),
    configPath,
    projectRoot,
    stateDir,
    endpointFile: path.join(stateDir, "endpoint.json"),
    apiPrefix,
    chrome: Object.freeze({
      ...merged.chrome,
      trustedSelector: merged.chrome.trustedSelectors.join(","),
      dockedPanel: Object.freeze({
        ...merged.chrome.dockedPanel,
        chromeSelector: merged.chrome.dockedPanel.chromeSelectors.join(","),
      }),
    }),
    tailwind,
    designSystem,
    icons,
    controls: Object.freeze({ leva }),
    host: Object.freeze({ framework, devServer, tailwind: tailwindPresent }),
    source: Object.freeze({
      ...merged.source,
      roots: merged.source.roots.map((entry) => path.resolve(projectRoot, entry)),
      extensions: hostSourceExtensions(
        merged.source.extensions.map((ext) => ext.toLowerCase()),
        framework,
        Array.isArray(raw.source?.extensions)
      ),
    }),
  })
}

// A specifier in the config's own source that has to be re-based when the
// module is evaluated from somewhere other than its own folder.
const RELATIVE_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.\.?\/[^"']*)\2/g

/**
 * The config file, evaluated from its source rather than from its path.
 *
 * Node's ESM resolver `stat`s a specifier before reading it, and on a managed
 * Mac `stat` is the one call TCC refuses for a protected folder — `readFileSync`
 * on the very same file succeeds. So a project living under, say, a protected
 * Documents subtree gets `ERR_MODULE_NOT_FOUND` for a file that is plainly
 * there, and the CLI dies a second after the start screen hands off.
 *
 * Reading the bytes and evaluating them as a module sidesteps the resolver
 * entirely. Relative specifiers inside the config are re-based to absolute
 * `file://` URLs first, since a `data:` module has no folder to be relative to.
 */
async function importConfigModule(found) {
  try {
    return await import(pathToFileURL(found).href)
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error
    const base = pathToFileURL(found)
    const source = fs
      .readFileSync(found, "utf8")
      .replace(RELATIVE_SPECIFIER, (whole, lead, quote, specifier) => {
        try {
          return `${lead}${quote}${new URL(specifier, base).href}${quote}`
        } catch {
          return whole
        }
      })
    return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
  }
}

/** Loads `design-editor.config.mjs` if the host has one, else pure defaults. */
export async function loadConfig({ configPath, cwd = process.cwd(), overrides = {} } = {}) {
  const found = configPath ? path.resolve(cwd, configPath) : findConfigFile(cwd)
  if (found && !fs.existsSync(found)) {
    throw new Error(`Design editor config not found: ${found}`)
  }

  let raw = {}
  if (found) {
    const loaded = await importConfigModule(found)
    const exported = loaded.default ?? loaded.config ?? {}
    raw = typeof exported === "function" ? await exported() : exported
  }

  return resolveConfig(merge(raw, overrides), { configPath: found, cwd })
}

/**
 * The browser half of the contract. Prepended to the overlay bundle rather than
 * fetched, so the injected vendor functions and the first-party chrome read one
 * object and invariant 4 (no `import` in the served bundle) still holds.
 */
export function browserPrelude(config, runtime = {}) {
  const payload = {
    apiBase: config.apiPrefix,
    apiPrefix: config.apiPrefix,
    openQuery: config.app.openQuery,
    chrome: {
      trustedSelectors: config.chrome.trustedSelectors,
      trustedSelector: config.chrome.trustedSelector,
      dockedPanel: config.chrome.dockedPanel,
    },
    tailwind: config.tailwind,
    // Which resolver and which write lane the editor bundle uses. The browser
    // could sniff for `window.ng`, and it does check — but a page that has not
    // bootstrapped yet has no `ng`, so the authoritative answer has to arrive
    // from the side that read the host's package.json.
    host: config.host,
    // Absolute manifest and stylesheet paths stay in the server-side config.
    designSystem: config.designSystem.catalog,
    // The attribute, not the drawings: 114KB of path data would be paid for on
    // every page load. `GET {apiBase}/icons` serves the set when asked.
    icons: { attribute: config.icons.attribute, available: Boolean(config.icons.data) },
    controls: {
      leva: config.controls.leva
        ? {
            storeGlobal: config.controls.leva.storeGlobal,
            bindings: config.controls.leva.bindings,
            sourceDefaults: Boolean(config.controls.leva.sourceDefaults),
          }
        : null,
    },
    ports: { proxy: runtime.proxyPort ?? null, ws: runtime.wsPort ?? null },
    // The screen this editor was chosen from, so the chrome can offer a way
    // back to it. Null for every session that had no such screen, and the
    // launcher has already refused anything that is not a loopback http URL —
    // this one is injected into the page and then navigated to, which is a
    // stronger claim than the rest of this payload makes.
    //
    // A URL is all that crosses. Nothing about the host's own files does: the
    // prelude has never named a source path, and the chooser knowing which
    // folder it started is not a reason for the browser to.
    chooserUrl: typeof runtime.chooserUrl === "string" ? runtime.chooserUrl : null,
  }

  return `window.__DESIGN_EDITOR_CONFIG__=${JSON.stringify(payload)};${wsPortPin(runtime.wsPort)}`
}

/**
 * The vendor's `getAvailablePort` returns the port it ASKED for, not the one it
 * bound, so a host that pins `ports.ws` gets the pre-remap number injected into
 * the page and the overlay opens a socket nobody is listening on.
 *
 * Both globals are pinned to the port actually bound. The vendor's own
 * `<script>window.__REACT_REWRITE_WS_PORT__ = …</script>` runs after this and
 * would otherwise win, so the pin has to be a no-op setter rather than a value.
 */
function wsPortPin(wsPort) {
  if (!wsPort) return ""
  return (
    `window.__DESIGN_EDITOR_WS_PORT__=${wsPort};` +
    `Object.defineProperty(window,"__REACT_REWRITE_WS_PORT__",` +
    `{get:function(){return ${wsPort}},set:function(){},configurable:true});`
  )
}

/**
 * A path with its symlinks resolved, or `null` for one that cannot be reached.
 *
 * `realpath` lstats, and lstat is the call a managed Mac refuses for a
 * protected folder while reading and listing it perfectly. Answering "not
 * editable" to that refusal means every source file in such a project is
 * refused and the editor can change nothing at all, which is why a path the
 * machine will not resolve but will still confirm falls back to its lexical
 * form. Only for EPERM: a path that is genuinely absent stays refused, and a
 * lexical path is a weaker containment check — it cannot see a symlink out of
 * the project — so it is the fallback and never the first answer.
 */
function canonicalPath(target) {
  try {
    return fs.realpathSync(target)
  } catch (error) {
    if (error?.code !== "EPERM") return null
    return fs.existsSync(target) ? path.resolve(target) : null
  }
}

/** True when the agent is allowed to read/write this path. */
export function isEditableSourcePath(config, absolutePath, relativePath) {
  const lexicalProbe = relativePath ?? absolutePath
  if (SOURCE_DENY_PATTERNS.some((pattern) => pattern.test(lexicalProbe))) return false
  if (!config.source.extensions.includes(path.extname(absolutePath).toLowerCase())) return false

  const target = canonicalPath(absolutePath)
  const projectRoot = canonicalPath(config.projectRoot)
  if (target === null || projectRoot === null) return false

  const projectRelative = path.relative(projectRoot, target)
  if (
    projectRelative === "" ||
    projectRelative.startsWith("..") ||
    path.isAbsolute(projectRelative) ||
    SOURCE_DENY_PATTERNS.some((pattern) => pattern.test(projectRelative)) ||
    !config.source.extensions.includes(path.extname(target).toLowerCase())
  ) {
    return false
  }

  const roots = config.source.roots.length === 0 ? [config.projectRoot] : config.source.roots
  return roots.some((root) => {
    const canonicalRoot = canonicalPath(root)
    if (canonicalRoot === null) return false
    const rel = path.relative(canonicalRoot, target)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
  })
}
