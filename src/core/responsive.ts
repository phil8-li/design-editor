/** Pure Tailwind breakpoint parsing and replacement helpers. */

import { config } from "./config"

export interface ResponsiveClassBinding {
  /** Exact authored class; retained as `className` for call-site readability. */
  original: string
  className: string
  breakpoint: string
  /** Configured viewport px. Container-query thresholds are deliberately unknown. */
  px: number | null
  context: "viewport" | "container"
  /** Every variant before the utility, byte-for-byte, plus the trailing colon. */
  prefix: string
  variants: string[]
  utility: string
  /** A breakpoint with no state or nesting variants around it. */
  direct: boolean
  sourceIndex: number
}

/** Split Tailwind variants without breaking arbitrary selectors such as `[&:hover]`. */
export function splitVariantChain(className: string): string[] {
  const parts: string[] = []
  let start = 0
  let square = 0
  let round = 0
  let escaped = false
  for (let index = 0; index < className.length; index += 1) {
    const char = className[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "[") square += 1
    else if (char === "]") square = Math.max(0, square - 1)
    else if (char === "(") round += 1
    else if (char === ")") round = Math.max(0, round - 1)
    else if (char === ":" && square === 0 && round === 0) {
      parts.push(className.slice(start, index))
      start = index + 1
    }
  }
  parts.push(className.slice(start))
  return parts.filter(Boolean)
}

export function parseResponsiveClassName(
  className: string,
  breakpoints: Record<string, number> = config.tailwind.breakpoints
): ResponsiveClassBinding | null {
  const parts = splitVariantChain(className)
  if (parts.length < 2) return null
  const variants = parts.slice(0, -1)
  let breakpoint = ""
  let context: ResponsiveClassBinding["context"] = "viewport"
  for (const variant of variants) {
    const container = /^@([^/]+)(?:\/[^/]+)?$/.exec(variant)
    const name = container?.[1] ?? variant
    if (!(name in breakpoints)) continue
    breakpoint = name
    context = container ? "container" : "viewport"
    break
  }
  if (!breakpoint) return null
  return {
    original: className,
    className,
    breakpoint,
    px: context === "viewport" ? breakpoints[breakpoint] : null,
    context,
    prefix: `${variants.join(":")}:`,
    variants,
    utility: parts.at(-1) ?? "",
    direct: variants.length === 1,
    sourceIndex: 0,
  }
}

export function responsiveClassBindings(
  classNames: readonly string[],
  breakpoints: Record<string, number> = config.tailwind.breakpoints
): ResponsiveClassBinding[] {
  return classNames
    .map((className, sourceIndex) => {
      const parsed = parseResponsiveClassName(className, breakpoints)
      return parsed ? { ...parsed, sourceIndex } : null
    })
    .filter((entry): entry is ResponsiveClassBinding => entry !== null)
    .sort((a, b) => {
      if (a.px === null && b.px !== null) return 1
      if (a.px !== null && b.px === null) return -1
      return (a.px ?? 0) - (b.px ?? 0) || a.sourceIndex - b.sourceIndex
    })
}

export function replaceResponsiveClass(
  binding: ResponsiveClassBinding,
  nextUtility: string
): { remove: string[]; add: string[] } {
  const utility = nextUtility.trim()
  return { remove: [binding.original], add: utility ? [`${binding.prefix}${utility}`] : [] }
}
