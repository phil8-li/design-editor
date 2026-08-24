/**
 * The browser half of the host contract.
 *
 * `config.mjs` resolves one object on the server and injects it ahead of this
 * bundle as `window.__DESIGN_EDITOR_CONFIG__`. Everything host-specific — which
 * elements are dev chrome, which CSS custom properties a docked panel reads,
 * which colour words and spacing steps the host's Tailwind build actually
 * ships — arrives through here, so porting the editor to another Next app is a
 * config file rather than a diff across four source files.
 *
 * The defaults below are not a second source of truth: they are what this file
 * falls back to when the bundle is loaded without its prologue (a unit test, or
 * a stale `dist/` served directly). They mirror the generic server defaults;
 * host integrations belong in design-editor.config.mjs.
 */

export interface DockedPanelConfig {
  offsetVar: string
  widthVar: string
}

export interface TailwindConfig {
  colorWords: string[]
  fontSizes: string[]
  fontFamilies: string[]
  /** px -> Tailwind step, e.g. `16` -> `"4"`. Misses become arbitrary values. */
  spacingScale: Record<string, string>
  /** Responsive prefix -> minimum viewport width in CSS pixels. */
  breakpoints: Record<string, number>
  /** Overrides which stems consult `spacingScale`; null keeps the built-in set. */
  spacedStems: string | null
}

export interface DesignSystemToken {
  id: string
  name: string
  category: string
  values: Record<string, unknown>
  cssVar?: string
  cssVars?: Record<string, string>
  cssUtility?: string
  scope?: string[]
  codeSyntax?: Record<string, unknown> | null
  usage?: string
  prefix?: string
}

export interface DesignSystemAlias {
  name: string
  tokenIds: string[]
  ambiguous: boolean
}

export interface TailwindTokenAlias extends DesignSystemAlias {
  namespace: string
  cssVar: string
}

export interface DesignSystemCatalog {
  name: string | null
  colors: DesignSystemToken[]
  spacing: DesignSystemToken[]
  radii: DesignSystemToken[]
  textStyles: DesignSystemToken[]
  uiTextStyles: DesignSystemToken[]
  effects: DesignSystemToken[]
  icons: DesignSystemToken[]
  motion: DesignSystemToken[]
  breakpoints: DesignSystemToken[]
  aliases: {
    cssVariables: DesignSystemAlias[]
    tailwind: TailwindTokenAlias[]
  }
}

export interface DesignEditorConfig {
  apiBase: string
  chrome: {
    /** Comma-joined selector list. Empty means the host has no extra dev chrome. */
    trustedSelector: string
    dockedPanel: DockedPanelConfig
  }
  tailwind: TailwindConfig
  designSystem: DesignSystemCatalog
}

const STANDARD_BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 }

function breakpointTokens(breakpoints: Record<string, number>): DesignSystemToken[] {
  return Object.entries(breakpoints).map(([name, value]) => ({
    id: `breakpoint:${name}`,
    name,
    category: "breakpoint",
    prefix: `${name}:`,
    values: { default: value },
  })).sort((a, b) => (a.values.default as number) - (b.values.default as number))
}

function emptyDesignSystem(breakpoints: Record<string, number>): DesignSystemCatalog {
  return {
    name: null,
    colors: [],
    spacing: [],
    radii: [],
    textStyles: [],
    uiTextStyles: [],
    effects: [],
    icons: [],
    motion: [],
    breakpoints: breakpointTokens(breakpoints),
    aliases: { cssVariables: [], tailwind: [] },
  }
}

const FALLBACK: DesignEditorConfig = {
  apiBase: "/__design-editor",
  chrome: {
    trustedSelector: "",
    dockedPanel: {
      offsetVar: "--design-editor-docked-panel-offset",
      widthVar: "--design-editor-docked-panel-width",
    },
  },
  tailwind: {
    colorWords: [
      "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
      "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
      "indigo", "violet", "purple", "fuchsia", "pink", "rose", "black", "white",
      "transparent", "current", "inherit", "foreground", "background", "muted",
      "primary", "secondary", "accent", "destructive", "border", "input",
      "ring", "card", "popover", "sidebar",
    ],
    fontSizes: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"],
    fontFamilies: ["sans", "serif", "mono"],
    spacingScale: {
      0: "0", 1: "px", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5", 12: "3",
      14: "3.5", 16: "4", 20: "5", 24: "6", 28: "7", 32: "8", 36: "9", 40: "10",
      44: "11", 48: "12", 56: "14", 64: "16", 80: "20", 96: "24", 112: "28",
      128: "32",
    },
    breakpoints: STANDARD_BREAKPOINTS,
    spacedStems: null,
  },
  designSystem: emptyDesignSystem(STANDARD_BREAKPOINTS),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function numberMap(value: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!isRecord(value)) return fallback
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  )
  return { ...fallback, ...Object.fromEntries(entries) }
}

function configuredList<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? value as T[] : fallback
}

function readDesignSystem(value: unknown, breakpoints: Record<string, number>): DesignSystemCatalog {
  const fallback = emptyDesignSystem(breakpoints)
  if (!isRecord(value)) return fallback
  const aliases = isRecord(value.aliases) ? value.aliases : {}
  return {
    name: typeof value.name === "string" ? value.name : null,
    colors: configuredList(value.colors, fallback.colors),
    spacing: configuredList(value.spacing, fallback.spacing),
    radii: configuredList(value.radii, fallback.radii),
    textStyles: configuredList(value.textStyles, fallback.textStyles),
    uiTextStyles: configuredList(value.uiTextStyles, fallback.uiTextStyles),
    effects: configuredList(value.effects, fallback.effects),
    icons: configuredList(value.icons, fallback.icons),
    motion: configuredList(value.motion, fallback.motion),
    breakpoints: configuredList(value.breakpoints, fallback.breakpoints),
    aliases: {
      cssVariables: configuredList<DesignSystemAlias>(aliases.cssVariables, []),
      tailwind: configuredList<TailwindTokenAlias>(aliases.tailwind, []),
    },
  }
}

/**
 * Merged per leaf, not per branch. A host that overrides one colour word must
 * not lose the spacing table with it, and a partially-written config is the
 * normal case rather than the exception.
 */
function read(): DesignEditorConfig {
  const raw: unknown = (globalThis as { __DESIGN_EDITOR_CONFIG__?: unknown })
    .__DESIGN_EDITOR_CONFIG__
  if (!isRecord(raw)) return FALLBACK

  const chrome = isRecord(raw.chrome) ? raw.chrome : {}
  const panel = isRecord(chrome.dockedPanel) ? chrome.dockedPanel : {}
  const tailwind = isRecord(raw.tailwind) ? raw.tailwind : {}

  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.length > 0 ? value : fallback
  const list = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) && value.length > 0 ? value.filter((v) => typeof v === "string") : fallback
  const breakpoints = numberMap(tailwind.breakpoints, FALLBACK.tailwind.breakpoints)

  return {
    apiBase: str(raw.apiBase, FALLBACK.apiBase),
    chrome: {
      // Not `str()`: an empty list is a documented, meaningful answer ("this
      // host has no dev chrome"), so only an absent key falls back. Treating
      // "" as absent would hand a stock Next app this app's Leva selectors.
      trustedSelector:
        typeof chrome.trustedSelector === "string"
          ? chrome.trustedSelector
          : FALLBACK.chrome.trustedSelector,
      dockedPanel: {
        offsetVar: str(panel.offsetVar, FALLBACK.chrome.dockedPanel.offsetVar),
        widthVar: str(panel.widthVar, FALLBACK.chrome.dockedPanel.widthVar),
      },
    },
    tailwind: {
      colorWords: list(tailwind.colorWords, FALLBACK.tailwind.colorWords),
      fontSizes: list(tailwind.fontSizes, FALLBACK.tailwind.fontSizes),
      fontFamilies: list(tailwind.fontFamilies, FALLBACK.tailwind.fontFamilies),
      spacingScale: isRecord(tailwind.spacingScale)
        ? (tailwind.spacingScale as Record<string, string>)
        : FALLBACK.tailwind.spacingScale,
      breakpoints,
      spacedStems:
        typeof tailwind.spacedStems === "string" ? tailwind.spacedStems : null,
    },
    designSystem: readDesignSystem(raw.designSystem, breakpoints),
  }
}

/**
 * Read once at module load. The prologue runs before this bundle and the server
 * cannot change its mind mid-session, so re-reading would only add a chance of
 * two call sites disagreeing.
 */
export const config: DesignEditorConfig = read()
