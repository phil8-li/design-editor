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

import {
  DEFAULT_TAILWIND_BREAKPOINTS,
  resolveDesignSystemConfig,
} from "./server/design-system-config.mjs"

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
  app: { port: null, host: "127.0.0.1", open: false, openQuery: "design" },
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
  designSystem: {
    manifest: null,
    cssSources: [],
    breakpoints: null,
    containerBreakpoints: null,
    responsiveMeasures: null,
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
  },
  source: { roots: [], extensions: [".tsx", ".jsx", ".ts", ".js", ".mts", ".mjs"] },
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
    tailwind.containerBreakpoints
  )

  const apiPrefix = merged.apiPrefix.startsWith("/")
    ? merged.apiPrefix.replace(/\/+$/, "")
    : `/${merged.apiPrefix.replace(/\/+$/, "")}`

  return Object.freeze({
    ...merged,
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
    controls: Object.freeze({ leva }),
    source: Object.freeze({
      ...merged.source,
      roots: merged.source.roots.map((entry) => path.resolve(projectRoot, entry)),
      extensions: merged.source.extensions.map((ext) => ext.toLowerCase()),
    }),
  })
}

/** Loads `design-editor.config.mjs` if the host has one, else pure defaults. */
export async function loadConfig({ configPath, cwd = process.cwd(), overrides = {} } = {}) {
  const found = configPath ? path.resolve(cwd, configPath) : findConfigFile(cwd)
  if (found && !fs.existsSync(found)) {
    throw new Error(`Design editor config not found: ${found}`)
  }

  let raw = {}
  if (found) {
    const loaded = await import(pathToFileURL(found).href)
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
    // Absolute manifest and stylesheet paths stay in the server-side config.
    designSystem: config.designSystem.catalog,
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

/** True when the agent is allowed to read/write this path. */
export function isEditableSourcePath(config, absolutePath, relativePath) {
  const lexicalProbe = relativePath ?? absolutePath
  if (SOURCE_DENY_PATTERNS.some((pattern) => pattern.test(lexicalProbe))) return false
  if (!config.source.extensions.includes(path.extname(absolutePath).toLowerCase())) return false

  let target
  let projectRoot
  try {
    target = fs.realpathSync(absolutePath)
    projectRoot = fs.realpathSync(config.projectRoot)
  } catch {
    return false
  }

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
    let canonicalRoot
    try {
      canonicalRoot = fs.realpathSync(root)
    } catch {
      return false
    }
    const rel = path.relative(canonicalRoot, target)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
  })
}
