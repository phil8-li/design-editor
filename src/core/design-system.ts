/** Shared authored tracing, computed fallback, and writes for host design tokens. */

import {
  config,
  type DesignSystemCatalog,
  type DesignSystemToken,
  type TailwindTokenAlias,
} from "./config"
import { splitVariantChain } from "./responsive"

export type DesignTokenProperty =
  | "fill-color" | "text-color" | "stroke-color" | "corner-radius" | "text-style"
  | "shadow" | "gap" | "padding" | "icon-size"

export type DesignSystemMatch = {
  token: DesignSystemToken
  via: "authored" | "computed"
  source: string
}

export type TokenStyleWrite = { property: string; value: string }

const PROPERTY_CATEGORY: Record<DesignTokenProperty, keyof DesignSystemCatalog> = {
  "fill-color": "colors",
  "text-color": "colors",
  "stroke-color": "colors",
  "corner-radius": "radii",
  "text-style": "textStyles",
  shadow: "effects",
  gap: "spacing",
  padding: "spacing",
  "icon-size": "icons",
}

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)] }

function tokensFor(property: DesignTokenProperty, registry: DesignSystemCatalog): DesignSystemToken[] {
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
  if (alias.namespace === "color") {
    if (property === "fill-color") return `bg-${name}`
    if (property === "text-color") return `text-${name}`
    if (property === "stroke-color") return `border-${name}`
  }
  if (alias.namespace === "radius" && property === "corner-radius") {
    return name === "DEFAULT" ? "rounded" : `rounded-${name}`
  }
  if (alias.namespace === "text" && property === "text-style") return `text-${name}`
  if (alias.namespace === "shadow" && property === "shadow") {
    return name === "DEFAULT" ? "shadow" : `shadow-${name}`
  }
  return null
}

function scalarFromClass(property: DesignTokenProperty, className: string, spacingScale: Record<string, string>): number | null {
  const stem = property === "gap" ? "gap" : property === "padding" ? "p" : "size"
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
  const tokens = tokensFor(property, registry)
  const byId = tokenIndex(registry)
  const sources = new Map<string, string[]>()
  const add = (ids: readonly string[], source: string) => {
    for (const id of ids) {
      if (!byId.has(id) || !tokens.some((token) => token.id === id)) continue
      const current = sources.get(id) ?? []
      if (!current.includes(source)) current.push(source)
      sources.set(id, current)
    }
  }

  const inlineVars = extractCssVarNames(inlineValue)
  for (const variable of inlineVars) {
    add(
      tokens.filter((token) => tokenVariables(token).includes(variable)).map((token) => token.id),
      `var(${variable})`
    )
    const alias = registry.aliases.cssVariables.find((entry) => entry.name === variable)
    if (alias) add(alias.tokenIds, `var(${variable})`)
  }

  const utilities = directUtilities(classNames)
  for (const utility of utilities) {
    for (const variable of extractCssVarNames(utility)) {
      add(
        tokens.filter((token) => tokenVariables(token).includes(variable)).map((token) => token.id),
        `.${utility}`
      )
      const alias = registry.aliases.cssVariables.find((entry) => entry.name === variable)
      if (alias) add(alias.tokenIds, `.${utility}`)
    }
    for (const alias of registry.aliases.tailwind) {
      if (aliasUtility(property, alias) === utility) add(alias.tokenIds, `.${utility}`)
    }
    if (property === "text-style") {
      for (const token of tokens) if (token.cssUtility === utility) add([token.id], `.${utility}`)
    }
    if (property === "gap" || property === "padding" || property === "icon-size") {
      const px = scalarFromClass(property, utility, config.tailwind.spacingScale)
      if (px !== null) {
        add(
          tokens.filter((token) => Number(token.values.default) === px).map((token) => token.id),
          `.${utility}`
        )
      }
    }
  }

  return [...sources].map(([id, found]) => ({
    token: byId.get(id) as DesignSystemToken,
    via: "authored",
    source: found.join(", "),
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
  if (property === "corner-radius" || property === "gap" || property === "padding" || property === "icon-size") {
    const number = scalar(value)
    return number === null ? [] : [`${number}px`, String(number)]
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
  return tokensFor(property, registry).flatMap((token) => {
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
      ? [{ token, via: "computed" as const, source: unique(candidates).join(" · ") }]
      : []
  })
}

export function tokenSourceSpelling(token: DesignSystemToken): string {
  if (token.cssUtility) return `.${token.cssUtility}`
  if (token.cssVar) return `var(${token.cssVar})`
  const variables = Object.values(token.cssVars ?? {})
  if (variables.length) return variables.map((name) => `var(${name})`).join(" · ")
  const web = token.codeSyntax?.WEB
  if (typeof web === "string") return web
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
  const cssProperty: Record<Exclude<DesignTokenProperty, "text-style" | "icon-size">, string> = {
    "fill-color": "background-color",
    "text-color": "color",
    "stroke-color": "border-color",
    "corner-radius": "border-radius",
    shadow: "box-shadow",
    gap: "gap",
    padding: "padding",
  }
  let next = variable
  if (!next && (property === "corner-radius" || property === "gap" || property === "padding")) {
    const px = scalar(value)
    next = px === null ? null : `${px}px`
  }
  if (!next && property === "shadow") next = shadowValue(value)
  if (!next) next = Object.values(token.values).find((entry): entry is string => typeof entry === "string") ?? null
  return next ? [{ property: cssProperty[property], value: next }] : []
}
