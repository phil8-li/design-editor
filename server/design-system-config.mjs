import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

import { DEFAULT_THEME_NAMESPACES, aliasesFromCss } from "./design-system-aliases.mjs"
import {
  DESIGN_SYSTEM_TOKEN_GROUPS,
  emptyDesignSystemCatalog,
  normalizeBreakpoints,
  normalizeContainerBreakpoints,
  normalizeDesignSystemBreakpoints,
  normalizeDesignSystemContainerBreakpoints,
  normalizeDesignSystemManifest,
  normalizeTrackingUnit,
} from "./design-system-manifest.mjs"

export const DEFAULT_TAILWIND_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid design-system manifest: ${label} must be a non-empty string`)
  }
  return value
}

export function normalizeResponsiveMeasures(value) {
  if (value === undefined || value === null) return []
  if (!isPlainObject(value)) {
    throw new Error("Invalid design-system manifest: designSystem.responsiveMeasures must be an object")
  }
  return Object.entries(value).map(([name, raw]) => {
    const label = `designSystem.responsiveMeasures.${name}`
    if (!isPlainObject(raw)) throw new Error(`Invalid design-system manifest: ${label} must be an object`)
    return {
      id: `responsive-measure:${name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`,
      name,
      category: "responsive-measure",
      formula: requiredString(raw.formula, `${label}.formula`),
      usage: requiredString(raw.usage, `${label}.usage`),
      owner: requiredString(raw.owner, `${label}.owner`),
    }
  })
}

/**
 * Tailwind v3's theme keys, mapped to the namespaces the editor reasons in.
 *
 * v4 spells a scale as an `@theme` custom property, so the namespace is IN the
 * variable name and `aliasesFromCss` reads it off the stylesheet. v3 has no such
 * variable: the scale is a JavaScript object, and this table is the only place
 * that says `borderRadius` is what v4 calls `radius`.
 */
const V3_THEME_KEYS = {
  colors: "color",
  borderRadius: "radius",
  fontSize: "text",
  boxShadow: "shadow",
}

/** `{ brand: { 500: "#f00" } }` -> `[["brand-500", "#f00"]]`. */
function flattenThemeScale(scale, prefix = []) {
  const entries = []
  for (const [key, raw] of Object.entries(scale)) {
    const name = key === "DEFAULT" && prefix.length ? prefix.join("-") : [...prefix, key].join("-")
    if (isPlainObject(raw)) entries.push(...flattenThemeScale(raw, [...prefix, key]))
    // A v3 fontSize entry is often `["14px", { lineHeight: "20px" }]`; the size
    // is the part an alias can be traced by.
    else if (Array.isArray(raw) && typeof raw[0] === "string") entries.push([name, raw[0]])
    else if (typeof raw === "string" || typeof raw === "number") entries.push([name, String(raw)])
  }
  return entries
}

function themeEntriesFromScales(scales, label) {
  if (!isPlainObject(scales)) throw new Error(`Invalid design-system config: ${label} must be an object`)
  const entries = []
  for (const [namespace, scale] of Object.entries(scales)) {
    if (!isPlainObject(scale)) throw new Error(`Invalid design-system config: ${label}.${namespace} must be an object`)
    for (const [name, value] of flattenThemeScale(scale)) entries.push({ namespace, name, value })
  }
  return entries
}

/**
 * The v3 escape from "no `@theme`, therefore no aliases".
 *
 * `tailwindTheme` is the declared form and always works. `tailwindConfig` is the
 * convenience: it loads the host's own `tailwind.config.*` so the scale has one
 * owner rather than two. The load is `require`, which covers the CommonJS shape
 * v3 configs are almost always written in; anything it cannot evaluate says so
 * and names the declared form rather than falling back to silence.
 */
function resolveTailwindThemeEntries(value, projectRoot) {
  if (value.tailwindTheme !== undefined && value.tailwindTheme !== null) {
    return themeEntriesFromScales(value.tailwindTheme, "designSystem.tailwindTheme")
  }
  if (value.tailwindConfig === undefined || value.tailwindConfig === null) return []
  if (typeof value.tailwindConfig !== "string" || !value.tailwindConfig.trim()) {
    throw new Error("designSystem.tailwindConfig must be a non-empty path string")
  }
  const configPath = path.resolve(projectRoot, value.tailwindConfig)
  let loaded
  try {
    loaded = createRequire(import.meta.url)(configPath)
  } catch (error) {
    throw new Error(
      `Could not read Tailwind config ${configPath}: ${error.message}. ` +
        "Declare designSystem.tailwindTheme instead if the file cannot be required."
    )
  }
  const config = isPlainObject(loaded?.default) ? loaded.default : loaded
  const theme = isPlainObject(config?.theme) ? config.theme : {}
  const extend = isPlainObject(theme.extend) ? theme.extend : {}
  const scales = {}
  for (const [themeKey, namespace] of Object.entries(V3_THEME_KEYS)) {
    const merged = { ...(isPlainObject(theme[themeKey]) ? theme[themeKey] : {}), ...(isPlainObject(extend[themeKey]) ? extend[themeKey] : {}) }
    if (Object.keys(merged).length) scales[namespace] = merged
  }
  return themeEntriesFromScales(scales, `designSystem.tailwindConfig (${value.tailwindConfig})`)
}

/**
 * The one branch for a host whose tokens are not a Figma-style manifest.
 *
 * A design system that lives in a TypeScript module, a Style Dictionary build,
 * or a CMS is still a design system, and refusing it would make the tool care
 * where the tokens sleep. The adapter returns the same normalized catalog shape
 * the manifest path produces; everything downstream — aliases, breakpoints,
 * inspector rows — is identical, which is why this is a branch and not a plugin
 * framework.
 */
function catalogFromAdapter(adapter, projectRoot, trackingUnit) {
  const produced = typeof adapter === "function" ? adapter({ projectRoot }) : adapter
  if (!isPlainObject(produced)) {
    throw new Error("designSystem.adapter must return an object with the catalog's token groups")
  }
  const catalog = {
    name: typeof produced.name === "string" ? produced.name : "Design system",
    trackingUnit: normalizeTrackingUnit(trackingUnit ?? produced.trackingUnit),
  }
  for (const group of DESIGN_SYSTEM_TOKEN_GROUPS) {
    const tokens = produced[group]
    if (tokens !== undefined && !Array.isArray(tokens)) {
      throw new Error(`designSystem.adapter returned a non-array ${group}`)
    }
    catalog[group] = tokens ?? []
  }
  return catalog
}

export function resolveDesignSystemConfig(value, projectRoot, breakpoints, containerBreakpoints = {}, tailwind = {}) {
  if (!isPlainObject(value)) throw new Error("designSystem must be an object with manifest and cssSources")
  if (value.manifest !== null && (typeof value.manifest !== "string" || !value.manifest.trim())) {
    throw new Error("designSystem.manifest must be a non-empty path string or null")
  }
  if (!Array.isArray(value.cssSources) || value.cssSources.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("designSystem.cssSources must be an array of non-empty path strings")
  }

  const annotations = normalizeDesignSystemBreakpoints(value.breakpoints)
  const containerAnnotations = normalizeDesignSystemContainerBreakpoints(value.containerBreakpoints)
  const responsiveMeasures = normalizeResponsiveMeasures(value.responsiveMeasures)
  const trackingUnit = normalizeTrackingUnit(value.trackingUnit)
  const namespaces = Array.isArray(tailwind.themeNamespaces)
    ? tailwind.themeNamespaces.filter((entry) => typeof entry === "string" && entry.trim())
    : DEFAULT_THEME_NAMESPACES
  const themeEntries = resolveTailwindThemeEntries(value, projectRoot)
  const manifest = value.manifest ? path.resolve(projectRoot, value.manifest) : null
  const adapter = value.adapter ?? null
  const cssSources = value.cssSources.map((entry) => path.resolve(projectRoot, entry))
  if (!manifest && !adapter) {
    const catalog = emptyDesignSystemCatalog(
      breakpoints,
      annotations,
      containerBreakpoints,
      containerAnnotations,
      responsiveMeasures,
      trackingUnit
    )
    return Object.freeze({
      manifest: null,
      cssSources: Object.freeze(cssSources),
      catalog: Object.freeze(catalog),
    })
  }

  let catalog
  if (adapter) {
    if (manifest) {
      throw new Error("designSystem takes a manifest or an adapter, not both")
    }
    catalog = catalogFromAdapter(adapter, projectRoot, value.trackingUnit)
  } else {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(manifest, "utf8"))
    } catch (error) {
      throw new Error(`Could not read design-system manifest ${manifest}: ${error.message}`)
    }
    catalog = normalizeDesignSystemManifest(parsed, { trackingUnit: value.trackingUnit })
  }

  const css = []
  for (const sourcePath of cssSources) {
    try {
      css.push(fs.readFileSync(sourcePath, "utf8"))
    } catch (error) {
      throw new Error(`Could not read design-system CSS source ${sourcePath}: ${error.message}`)
    }
  }
  catalog.breakpoints = normalizeBreakpoints(breakpoints, annotations)
  catalog.containerBreakpoints = normalizeContainerBreakpoints(containerBreakpoints, containerAnnotations)
  catalog.responsiveMeasures = responsiveMeasures
  catalog.aliases = aliasesFromCss(catalog, css, { namespaces, themeEntries })
  return Object.freeze({
    manifest,
    cssSources: Object.freeze(cssSources),
    catalog: Object.freeze(catalog),
  })
}
