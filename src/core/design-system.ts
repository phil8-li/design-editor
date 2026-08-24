/** Shared authored tracing, computed fallback, and writes for host design tokens. */

import {
  config,
  type DesignSystemCatalog,
  type DesignSystemToken,
  type TailwindTokenAlias,
} from "./config"
import { splitVariantChain } from "./responsive"

/**
 * Every design-system axis the inspector can bind, as a value rather than a
 * bare union so a test can walk the whole set. That walk is the guard: a
 * property with no catalog category, or one whose writes no Tailwind
 * translation knows, would be a row that silently never reaches source.
 */
export const DESIGN_TOKEN_PROPERTIES = [
  "fill-color", "text-color", "stroke-color", "ring-color", "outline-color",
  "svg-fill", "svg-stroke",
  "corner-radius", "corner-radius-top-left", "corner-radius-top-right",
  "corner-radius-bottom-right", "corner-radius-bottom-left",
  "text-style", "shadow", "icon-size",
  "gap", "row-gap", "column-gap",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "motion-duration",
] as const

export type DesignTokenProperty = (typeof DESIGN_TOKEN_PROPERTIES)[number]

export type DesignSystemMatch = {
  token: DesignSystemToken
  via: "authored" | "computed"
  source: string
  /** True when an alias changes meaning across theme or selector scopes. */
  ambiguous: boolean
}

export type TokenStyleWrite = { property: string; value: string }

const PROPERTY_CATEGORY: Record<DesignTokenProperty, keyof DesignSystemCatalog> = {
  "fill-color": "colors", "text-color": "colors", "stroke-color": "colors",
  "ring-color": "colors", "outline-color": "colors",
  "svg-fill": "colors", "svg-stroke": "colors",
  "corner-radius": "radii", "corner-radius-top-left": "radii",
  "corner-radius-top-right": "radii", "corner-radius-bottom-right": "radii",
  "corner-radius-bottom-left": "radii",
  "text-style": "textStyles",
  shadow: "effects",
  "icon-size": "icons",
  gap: "spacing", "row-gap": "spacing", "column-gap": "spacing",
  padding: "spacing", "padding-top": "spacing", "padding-right": "spacing",
  "padding-bottom": "spacing", "padding-left": "spacing",
  margin: "spacing", "margin-top": "spacing", "margin-right": "spacing",
  "margin-bottom": "spacing", "margin-left": "spacing",
  "motion-duration": "motion",
}

/**
 * The single CSS declaration each property writes. `text-style` and `icon-size`
 * are compound — `tokenStyleWrites` emits four and two writes respectively — so
 * their entry names the one an inspector should probe a resolved value with.
 * A ring in Tailwind v4 is a box-shadow driven by a custom property, so the
 * ring colour is that property rather than a border of its own.
 */
const CSS_PROPERTY: Record<DesignTokenProperty, string> = {
  "fill-color": "background-color", "text-color": "color", "stroke-color": "border-color",
  "ring-color": "--tw-ring-color", "outline-color": "outline-color",
  "svg-fill": "fill", "svg-stroke": "stroke",
  "corner-radius": "border-radius", "corner-radius-top-left": "border-top-left-radius",
  "corner-radius-top-right": "border-top-right-radius",
  "corner-radius-bottom-right": "border-bottom-right-radius",
  "corner-radius-bottom-left": "border-bottom-left-radius",
  "text-style": "font-size",
  shadow: "box-shadow",
  "icon-size": "width",
  gap: "gap", "row-gap": "row-gap", "column-gap": "column-gap",
  padding: "padding", "padding-top": "padding-top", "padding-right": "padding-right",
  "padding-bottom": "padding-bottom", "padding-left": "padding-left",
  margin: "margin", "margin-top": "margin-top", "margin-right": "margin-right",
  "margin-bottom": "margin-bottom", "margin-left": "margin-left",
  "motion-duration": "transition-duration",
}

/** Tailwind utility stem per property, for reading an authored class back. */
const UTILITY_STEM: Partial<Record<DesignTokenProperty, string>> = {
  "fill-color": "bg", "text-color": "text", "stroke-color": "border", "ring-color": "ring",
  "outline-color": "outline", "svg-fill": "fill", "svg-stroke": "stroke",
  "corner-radius": "rounded", "corner-radius-top-left": "rounded-tl",
  "corner-radius-top-right": "rounded-tr", "corner-radius-bottom-right": "rounded-br",
  "corner-radius-bottom-left": "rounded-bl",
  gap: "gap", "row-gap": "gap-y", "column-gap": "gap-x",
  padding: "p", "padding-top": "pt", "padding-right": "pr", "padding-bottom": "pb",
  "padding-left": "pl",
  margin: "m", "margin-top": "mt", "margin-right": "mr", "margin-bottom": "mb",
  "margin-left": "ml",
  "icon-size": "size",
}

export function tokenCssProperty(property: DesignTokenProperty): string {
  return CSS_PROPERTY[property]
}

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)] }

/** The catalog tokens a property may be bound to. One owner: panels list these. */
export function tokensForProperty(
  property: DesignTokenProperty,
  registry: DesignSystemCatalog = config.designSystem
): DesignSystemToken[] {
  if (property === "text-style") return [...registry.textStyles, ...registry.uiTextStyles]
  return registry[PROPERTY_CATEGORY[property]] as DesignSystemToken[]
}

function tokenIndex(registry: DesignSystemCatalog): Map<string, DesignSystemToken> {
  const all = [
    ...registry.colors,
    ...registry.spacing,
    ...registry.radii,
    ...registry.textStyles,
    ...registry.uiTextStyles,
    ...registry.effects,
    ...registry.icons,
    ...registry.motion,
    ...registry.breakpoints,
  ]
  return new Map(all.map((token) => [token.id, token]))
}

export function extractCssVarNames(value: string): string[] {
  const names: string[] = []
  const pattern = /var\(\s*(--[\w-]+)/g
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) names.push(match[1])
  return unique(names)
}

function directUtilities(classNames: readonly string[]): string[] {
  return classNames.filter((name) => splitVariantChain(name).length === 1)
}

function aliasUtility(property: DesignTokenProperty, alias: TailwindTokenAlias): string | null {
  const name = alias.name.replace(/^--(?:color|radius|text|shadow)-/, "")
  const stem = UTILITY_STEM[property]
  const category = PROPERTY_CATEGORY[property]
  if (alias.namespace === "color" && category === "colors" && stem) return `${stem}-${name}`
  if (alias.namespace === "radius" && category === "radii" && stem) {
    return name === "DEFAULT" ? stem : `${stem}-${name}`
  }
  if (alias.namespace === "text" && property === "text-style") return `text-${name}`
  if (alias.namespace === "shadow" && property === "shadow") {
    return name === "DEFAULT" ? "shadow" : `shadow-${name}`
  }
  return null
}

function scalarFromClass(stem: string, className: string, spacingScale: Record<string, string>): number | null {
  const match = new RegExp(`^${stem}-(-?[\\w.]+)$`).exec(className)
  if (!match) return null
  const token = match[1]
  const entry = Object.entries(spacingScale).find(([, value]) => value === token)
  return entry ? Number(entry[0]) : null
}

function tokenVariables(token: DesignSystemToken): string[] {
  return unique([...(token.cssVar ? [token.cssVar] : []), ...Object.values(token.cssVars ?? {})])
}

/** Finds explicit CSS-variable, utility, alias, and scalar source bindings. */
export function authoredTokenMatches(
  property: DesignTokenProperty,
  inlineValue: string,
  classNames: readonly string[],
  registry: DesignSystemCatalog = config.designSystem
): DesignSystemMatch[] {
  const tokens = tokensForProperty(property, registry)
  const byId = tokenIndex(registry)
  const evidence = new Map<string, { sources: string[]; exact: boolean }>()
  const add = (ids: readonly string[], source: string, exact = true) => {
    for (const id of ids) {
      if (!byId.has(id) || !tokens.some((token) => token.id === id)) continue
      const current = evidence.get(id) ?? { sources: [], exact: false }
      if (!current.sources.includes(source)) current.sources.push(source)
      current.exact ||= exact
      evidence.set(id, current)
    }
  }

  const inlineVars = extractCssVarNames(inlineValue)
  for (const variable of inlineVars) {
    add(
      tokens.filter((token) => tokenVariables(token).includes(variable)).map((token) => token.id),
      `var(${variable})`
    )
    const alias = registry.aliases.cssVariables.find((entry) => entry.name === variable)
    if (alias) add(alias.tokenIds, `var(${variable})`, !alias.ambiguous)
  }

  const utilities = directUtilities(classNames)
  for (const utility of utilities) {
    for (const variable of extractCssVarNames(utility)) {
      add(
        tokens.filter((token) => tokenVariables(token).includes(variable)).map((token) => token.id),
        `.${utility}`
      )
      const alias = registry.aliases.cssVariables.find((entry) => entry.name === variable)
      if (alias) add(alias.tokenIds, `.${utility}`, !alias.ambiguous)
    }
    for (const alias of registry.aliases.tailwind) {
      if (aliasUtility(property, alias) === utility) {
        add(alias.tokenIds, `.${utility}`, !alias.ambiguous)
      }
    }
    if (property === "text-style") {
      for (const token of tokens) if (token.cssUtility === utility) add([token.id], `.${utility}`)
    }
    const scalarStem = UTILITY_STEM[property]
    const scalarCategory = PROPERTY_CATEGORY[property]
    if (scalarStem && (scalarCategory === "spacing" || scalarCategory === "icons")) {
      const px = scalarFromClass(scalarStem, utility, config.tailwind.spacingScale)
      if (px !== null) {
        add(
          tokens.filter((token) => Number(token.values.default) === px).map((token) => token.id),
          `.${utility}`
        )
      }
    }
  }

  const matches = [...evidence]
  const exact = matches.filter(([, found]) => found.exact)
  return (exact.length ? exact : matches).map(([id, found]) => ({
    token: byId.get(id) as DesignSystemToken,
    via: "authored",
    source: found.sources.join(", "),
    ambiguous: !found.exact,
  }))
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",")
}

function scalar(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim())
  return match ? Number(match[1]) : null
}

export function textStyleSignature(value: {
  fontSize: number
  lineHeight: number
  fontWeight?: number | null
  letterSpacing: number
}): string {
  return [value.fontSize, value.lineHeight, value.fontWeight ?? "", value.letterSpacing]
    .map(String)
    .join("|")
}

function textTokenSignature(token: DesignSystemToken): string | null {
  const value = token.values.default
  if (!value || typeof value !== "object") return null
  const shape = value as Record<string, unknown>
  const fontSize = scalar(shape.fontSize)
  const lineHeight = scalar(shape.lineHeight)
  const fontWeight = scalar(shape.fontWeight)
  const tracking = scalar(shape.letterSpacing)
  if (fontSize === null || lineHeight === null || tracking === null) return null
  // The catalog stores tracking in em; computed style reports px. Larger generic-host values are px.
  const letterSpacing = Math.abs(tracking) < 1 ? tracking * fontSize : tracking
  return textStyleSignature({ fontSize, lineHeight, fontWeight, letterSpacing })
}

function rawTokenValues(property: DesignTokenProperty, token: DesignSystemToken): string[] {
  if (property === "text-style") {
    const signature = textTokenSignature(token)
    return signature ? [signature] : []
  }
  const value = token.values.default
  const category = PROPERTY_CATEGORY[property]
  if (category === "radii" || category === "spacing" || category === "icons") {
    const number = scalar(value)
    return number === null ? [] : [`${number}px`, String(number)]
  }
  if (category === "motion") {
    // A computed duration may only match a spring CSS can actually express, so
    // the candidates are exactly what `tokenStyleWrites` would write, in both
    // the ms spelling it writes and the seconds spelling authors tend to use.
    const write = motionDurationWrites(token)[0]
    return write ? [write.value, `${Number.parseFloat(write.value) / 1000}s`] : []
  }
  if (property === "shadow" && Array.isArray(value)) return [JSON.stringify(value)]
  return Object.values(token.values).filter((entry): entry is string => typeof entry === "string")
}

/** Computed-value fallback. Every equal candidate is returned; no arbitrary winner. */
export function computedTokenMatches(
  property: DesignTokenProperty,
  computedValue: string,
  registry: DesignSystemCatalog = config.designSystem,
  resolveCssVar: (name: string) => string = (name) => `var(${name})`
): DesignSystemMatch[] {
  const targetNumber = scalar(computedValue)
  return tokensForProperty(property, registry).flatMap((token) => {
    const candidates = [
      ...tokenVariables(token).map((name) => resolveCssVar(name)),
      ...rawTokenValues(property, token),
    ].filter(Boolean)
    const equal = candidates.some((candidate) => {
      const candidateNumber = scalar(candidate)
      if (targetNumber !== null && candidateNumber !== null) {
        return Math.abs(targetNumber - candidateNumber) < 0.01
      }
      return normalized(candidate) === normalized(computedValue)
    })
    return equal
      ? [{ token, via: "computed" as const, source: unique(candidates).join(" · "), ambiguous: false }]
      : []
  })
}

function spring(token: DesignSystemToken): { visualDuration: number; bounce: number } | null {
  const value = token.values.default
  if (!value || typeof value !== "object") return null
  const shape = value as Record<string, unknown>
  const visualDuration = scalar(shape.visualDuration)
  const bounce = scalar(shape.bounce)
  return visualDuration === null || bounce === null ? null : { visualDuration, bounce }
}

export function tokenSourceSpelling(token: DesignSystemToken): string {
  if (token.cssUtility) return `.${token.cssUtility}`
  if (token.cssVar) return `var(${token.cssVar})`
  const variables = Object.values(token.cssVars ?? {})
  if (variables.length) return variables.map((name) => `var(${name})`).join(" · ")
  const web = token.codeSyntax?.WEB
  if (typeof web === "string") return web
  // Motion springs are declared in TypeScript, not in globals.css, so they have
  // no custom property to name. Spell the spring itself rather than inventing a
  // var() the stylesheet does not define.
  const curve = spring(token)
  if (curve) return `spring ${curve.visualDuration}s · bounce ${curve.bounce}`
  const value = token.values.default
  return typeof value === "number" ? `${value}px` : JSON.stringify(value)
}

function shadowValue(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const layers = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const layer = entry as Record<string, unknown>
    if (![layer.x, layer.y, layer.blur, layer.spread].every((part) => typeof part === "number")) return []
    return [`${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px ${String(layer.color ?? "#000")}`]
  })
  return layers.length ? layers.join(", ") : null
}

/**
 * `transition-duration` carries a duration and nothing else, so only a spring
 * with no bounce survives the trip into CSS. Seven of the system's nine bounce;
 * writing their visualDuration as a duration would ship a different feel while
 * reporting success, so they write nothing instead — an empty array is already
 * how this module says "this token cannot be written here", and the inspector
 * surfaces it rather than silently applying half the token.
 */
function motionDurationWrites(token: DesignSystemToken): TokenStyleWrite[] {
  const curve = spring(token)
  if (!curve || curve.bounce !== 0) return []
  return [{ property: "transition-duration", value: `${Math.round(curve.visualDuration * 1000)}ms` }]
}

export function tokenStyleWrites(property: DesignTokenProperty, token: DesignSystemToken): TokenStyleWrite[] {
  const variable = token.cssVar ? `var(${token.cssVar})` : null
  const value = token.values.default
  if (property === "text-style") {
    const shape = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    const css = token.cssVars ?? {}
    const write = (name: string, key: string, fallback: string | null) =>
      css[key] ? { property: name, value: `var(${css[key]})` } : fallback ? { property: name, value: fallback } : null
    return [
      write("font-size", "fontSize", scalar(shape.fontSize) === null ? null : `${scalar(shape.fontSize)}px`),
      write("line-height", "lineHeight", scalar(shape.lineHeight) === null ? null : `${scalar(shape.lineHeight)}px`),
      write("font-weight", "fontWeight", scalar(shape.fontWeight) === null ? null : String(scalar(shape.fontWeight))),
      write("letter-spacing", "letterSpacing", scalar(shape.letterSpacing) === null ? null : `${scalar(shape.letterSpacing)}em`),
    ].filter((entry): entry is TokenStyleWrite => entry !== null)
  }
  if (property === "icon-size") {
    const px = scalar(value)
    return px === null ? [] : [{ property: "width", value: `${px}px` }, { property: "height", value: `${px}px` }]
  }
  if (property === "motion-duration") return motionDurationWrites(token)
  const category = PROPERTY_CATEGORY[property]
  let next = variable
  if (!next && (category === "radii" || category === "spacing")) {
    const px = scalar(value)
    next = px === null ? null : `${px}px`
  }
  if (!next && property === "shadow") next = shadowValue(value)
  if (!next) next = Object.values(token.values).find((entry): entry is string => typeof entry === "string") ?? null
  return next ? [{ property: CSS_PROPERTY[property], value: next }] : []
}
