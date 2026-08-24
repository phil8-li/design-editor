import fs from "node:fs"
import path from "node:path"

import { aliasesFromCss } from "./design-system-aliases.mjs"
import {
  emptyDesignSystemCatalog,
  normalizeBreakpoints,
  normalizeContainerBreakpoints,
  normalizeDesignSystemBreakpoints,
  normalizeDesignSystemContainerBreakpoints,
  normalizeDesignSystemManifest,
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

export function resolveDesignSystemConfig(value, projectRoot, breakpoints, containerBreakpoints = {}) {
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
  const manifest = value.manifest ? path.resolve(projectRoot, value.manifest) : null
  const cssSources = value.cssSources.map((entry) => path.resolve(projectRoot, entry))
  if (!manifest) {
    const catalog = emptyDesignSystemCatalog(
      breakpoints,
      annotations,
      containerBreakpoints,
      containerAnnotations,
      responsiveMeasures
    )
    return Object.freeze({
      manifest: null,
      cssSources: Object.freeze(cssSources),
      catalog: Object.freeze(catalog),
    })
  }

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, "utf8"))
  } catch (error) {
    throw new Error(`Could not read design-system manifest ${manifest}: ${error.message}`)
  }

  const catalog = normalizeDesignSystemManifest(parsed)
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
  catalog.aliases = aliasesFromCss(catalog, css)
  return Object.freeze({
    manifest,
    cssSources: Object.freeze(cssSources),
    catalog: Object.freeze(catalog),
  })
}
