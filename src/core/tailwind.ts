/**
 * CSS declaration -> Tailwind class update.
 *
 * The React Rewrite engine only ever writes Tailwind utilities into JSX; it has
 * no verb for a raw inline style. So every inspector control that thinks in CSS
 * is translated here, once, on the way to the source writer. Inline styles still
 * drive the live preview — this is only what lands in the file.
 */

export interface ClassUpdate {
  tailwindPrefix: string
  tailwindToken: string | null
  value: string
  relatedPrefixes?: string[]
  classPattern?: string
  standalone?: boolean
}

/**
 * Properties whose class name *is* the value. The engine matches on
 * `classPattern` rather than the prefix because these share no common stem
 * (`flex` and `hidden` are both `display`), and because a prefix match would
 * let `display: flex` clobber an unrelated `flex-col`.
 */
const KEYWORDS: Record<string, Record<string, string>> = {
  display: {
    block: "block",
    "inline-block": "inline-block",
    inline: "inline",
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    "inline-grid": "inline-grid",
    contents: "contents",
    none: "hidden",
  },
  "flex-direction": {
    row: "flex-row",
    "row-reverse": "flex-row-reverse",
    column: "flex-col",
    "column-reverse": "flex-col-reverse",
  },
  "flex-wrap": {
    wrap: "flex-wrap",
    nowrap: "flex-nowrap",
    "wrap-reverse": "flex-wrap-reverse",
  },
  "justify-content": {
    "flex-start": "justify-start",
    center: "justify-center",
    "flex-end": "justify-end",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
  },
  "align-items": {
    "flex-start": "items-start",
    center: "items-center",
    "flex-end": "items-end",
    stretch: "items-stretch",
    baseline: "items-baseline",
  },
  "text-align": {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  },
  "font-weight": {
    "100": "font-thin",
    "200": "font-extralight",
    "300": "font-light",
    "400": "font-normal",
    "500": "font-medium",
    "600": "font-semibold",
    "700": "font-bold",
    "800": "font-extrabold",
    "900": "font-black",
  },
}

/** Prefix stems that need a stem-plus-value class, e.g. `gap` -> `gap-2`. */
const SCALARS: Record<
  string,
  { prefix: string; related?: string[]; pattern?: string }
> = {
  opacity: { prefix: "opacity" },
  gap: { prefix: "gap" },
  "column-gap": { prefix: "gap-x", related: ["gap"] },
  "row-gap": { prefix: "gap-y", related: ["gap"] },
  padding: { prefix: "p" },
  "padding-top": { prefix: "pt", related: ["p", "py"] },
  "padding-right": { prefix: "pr", related: ["p", "px"] },
  "padding-bottom": { prefix: "pb", related: ["p", "py"] },
  "padding-left": { prefix: "pl", related: ["p", "px"] },
  margin: { prefix: "m" },
  "margin-top": { prefix: "mt", related: ["m", "my"] },
  "margin-right": { prefix: "mr", related: ["m", "mx"] },
  "margin-bottom": { prefix: "mb", related: ["m", "my"] },
  "margin-left": { prefix: "ml", related: ["m", "mx"] },
  width: { prefix: "w" },
  height: { prefix: "h" },
  "min-width": { prefix: "min-w" },
  "min-height": { prefix: "min-h" },
  "max-width": { prefix: "max-w" },
  "max-height": { prefix: "max-h" },
  "border-radius": { prefix: "rounded" },
  "border-top-left-radius": { prefix: "rounded-tl", related: ["rounded", "rounded-t"] },
  "border-top-right-radius": { prefix: "rounded-tr", related: ["rounded", "rounded-t"] },
  "border-bottom-right-radius": { prefix: "rounded-br", related: ["rounded", "rounded-b"] },
  "border-bottom-left-radius": { prefix: "rounded-bl", related: ["rounded", "rounded-b"] },
  "background-color": { prefix: "bg" },
  "line-height": { prefix: "leading" },
  "letter-spacing": { prefix: "tracking" },
  "box-shadow": { prefix: "shadow" },

  /*
   * `text`, `border`, and `font` each serve two properties. Prefix matching
   * cannot tell `text-lg` from `text-red-500`, so these carry an explicit
   * pattern and only replace a class of their own kind.
   */
  color: { prefix: "text", pattern: `^text-(\\[(#|rgb|hsl|oklch|var).*\\]|${colorWords()})$` },
  "font-size": { prefix: "text", pattern: "^text-(\\[[^\\]]*(px|rem|em|ch|%)\\]|xs|sm|base|lg|[2-9]?xl)$" },
  "border-width": { prefix: "border", pattern: "^border(-\\[[^\\]]*px\\]|-\\d+)?$" },
  "border-color": { prefix: "border", pattern: `^border-(\\[(#|rgb|hsl|oklch|var).*\\]|${colorWords()})$` },
  "font-family": { prefix: "font", pattern: "^font-(sans|serif|mono|\\[[^\\]]*\\])$" },
}

/** Tailwind's default 0.25rem spacing scale, in px, for the stems that use it. */
const SPACING_SCALE: Record<number, string> = {
  0: "0", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5", 12: "3", 14: "3.5",
  16: "4", 20: "5", 24: "6", 28: "7", 32: "8", 36: "9", 40: "10", 44: "11",
  48: "12", 56: "14", 64: "16", 80: "20", 96: "24", 112: "28", 128: "32",
}

const SPACED_STEMS =
  /^(p|pt|pr|pb|pl|px|py|m|mt|mr|mb|ml|mx|my|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h)$/

function colorWords(): string {
  // Tailwind palette stems plus this project's semantic tokens, so a themed
  // class like `text-muted-foreground` is replaced rather than duplicated.
  return "(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white|transparent|current|inherit|foreground|background|muted|primary|secondary|accent|destructive|border|input|ring|card|popover|sidebar)([-/].*)?"
}

/** Tailwind arbitrary values may not contain spaces; underscores stand in. */
function toArbitrary(value: string): string {
  return value.trim().replace(/\s+/g, "_")
}

/** Resolves a px length onto the spacing scale when it lands exactly on a step. */
function spacingToken(prefix: string, value: string): string | null {
  if (!SPACED_STEMS.test(prefix)) return null
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (!match) return null
  const px = Number(match[1])
  const token = SPACING_SCALE[Math.abs(px)]
  return token == null ? null : `${px < 0 ? "-" : ""}${token}`
}

/**
 * Stable per-property key. The engine uses it to replace an earlier pending
 * edit to the same property instead of stacking a second class onto the node.
 */
export function propertyKey(property: string): string {
  return property
}

export function toClassUpdate(property: string, rawValue: string): ClassUpdate | null {
  const value = rawValue.trim()
  if (!value) return null

  const keywords = KEYWORDS[property]
  if (keywords) {
    const token = keywords[value]
    if (!token) return null
    const alternatives = Object.values(keywords)
      .map((cls) => cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")
    return {
      tailwindPrefix: token,
      tailwindToken: token,
      value,
      standalone: true,
      classPattern: `^(${alternatives})$`,
    }
  }

  const scalar = SCALARS[property]
  if (!scalar) return null

  const token = spacingToken(scalar.prefix, value)
  return {
    tailwindPrefix: scalar.prefix,
    tailwindToken: token,
    value: token ? value : toArbitrary(value),
    ...(scalar.related ? { relatedPrefixes: scalar.related } : {}),
    ...(scalar.pattern ? { classPattern: scalar.pattern } : {}),
  }
}
