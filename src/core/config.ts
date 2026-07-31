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
 * a stale `dist/` served directly). They mirror the server defaults so that
 * path degrades to the previous hardcoded behaviour instead of to nothing.
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
  /** Overrides which stems consult `spacingScale`; null keeps the built-in set. */
  spacedStems: string | null
}

export interface DesignEditorConfig {
  apiBase: string
  chrome: {
    /** Comma-joined selector list; never empty, or `closest("")` would throw. */
    trustedSelector: string
    dockedPanel: DockedPanelConfig
  }
  tailwind: TailwindConfig
}

const FALLBACK: DesignEditorConfig = {
  apiBase: "/__design-editor",
  chrome: {
    trustedSelector:
      '#leva__root,[data-leva-chrome],[data-design-editor],div[class*="leva-c-"],[data-agentation-root]',
    dockedPanel: {
      offsetVar: "--react-rewrite-leva-offset",
      widthVar: "--react-rewrite-inspector-width",
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
    spacedStems: null,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
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

  return {
    apiBase: str(raw.apiBase, FALLBACK.apiBase),
    chrome: {
      trustedSelector: str(chrome.trustedSelector, FALLBACK.chrome.trustedSelector),
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
      spacedStems:
        typeof tailwind.spacedStems === "string" ? tailwind.spacedStems : null,
    },
  }
}

/**
 * Read once at module load. The prologue runs before this bundle and the server
 * cannot change its mind mid-session, so re-reading would only add a chance of
 * two call sites disagreeing.
 */
export const config: DesignEditorConfig = read()
