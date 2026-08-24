import fs from "node:fs"
import path from "node:path"

import { aliasesFromCss } from "./design-system-aliases.mjs"
import {
  emptyDesignSystemCatalog,
  normalizeBreakpoints,
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

export function resolveDesignSystemConfig(value, projectRoot, breakpoints) {
  if (!isPlainObject(value)) throw new Error("designSystem must be an object with manifest and cssSources")
  if (value.manifest !== null && (typeof value.manifest !== "string" || !value.manifest.trim())) {
    throw new Error("designSystem.manifest must be a non-empty path string or null")
  }
  if (!Array.isArray(value.cssSources) || value.cssSources.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("designSystem.cssSources must be an array of non-empty path strings")
  }

  const manifest = value.manifest ? path.resolve(projectRoot, value.manifest) : null
  const cssSources = value.cssSources.map((entry) => path.resolve(projectRoot, entry))
  if (!manifest) {
    return Object.freeze({
      manifest: null,
      cssSources: Object.freeze(cssSources),
      catalog: emptyDesignSystemCatalog(breakpoints),
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
  catalog.breakpoints = normalizeBreakpoints(breakpoints)
  catalog.aliases = aliasesFromCss(catalog, css)
  return Object.freeze({
    manifest,
    cssSources: Object.freeze(cssSources),
    catalog: Object.freeze(catalog),
  })
}
