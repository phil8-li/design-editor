/**
 * Chrome tokens for the editor UI.
 *
 * Deliberately its own scale rather than the app's design system: this chrome
 * sits *around* the product and must read as tooling, never as product surface.
 */

export const tokens = {
  color: {
    bg: "#1e1e1e",
    bgRaised: "#2c2c2c",
    bgSunken: "#181818",
    bgHover: "#383838",
    bgHoverQuiet: "#292929",
    bgActive: "#0d99ff",
    /** Dividers and rests — decorative, so the 3:1 rule does not apply. */
    border: "#383838",
    borderStrong: "#4d4d4d",
    /** Boundary of a control you can act on: 3.1:1 on `bg`, per WCAG 1.4.11. */
    borderInteractive: "#6b6b6b",
    text: "#ffffff",
    textMuted: "#b3b3b3",
    /** 4.8:1 on `bg`. The obvious #7a7a7a lands at 3.9:1 and fails. */
    textDim: "#8a8a8a",
    /** Strokes, handles, and focus rings — Figma blue, never behind text. */
    accent: "#0d99ff",
    /**
     * Accent *behind white text*. The bright accent is only 3:1 against white,
     * so filled buttons, pressed tools, and selected rows use this instead
     * (5:1) and keep `accent` for the 1px stroke that pairs with them.
     */
    accentSurface: "#0b6fd1",
    accentSurfaceHover: "#1a82e2",
    accentSoft: "rgba(13,153,255,0.16)",
    selectionSurface: "rgba(13,153,255,0.18)",
    /** Component (as opposed to plain element) names, Figma's purple. */
    component: "#a78bfa",
    danger: "#f24822",
    guide: "#ff2d55",
    measure: "#ff2d55",
    autoLayout: "#8b5cf6",
  },
  radius: { sm: "2px", md: "4px", lg: "6px", xl: "10px" },
  shadow: {
    panel: "0 2px 14px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(0,0,0,0.6)",
    popover: "0 6px 22px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.6)",
  },
  font: {
    ui: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  size: {
    toolbarHeight: 36,
    panelInset: 12,
    panelWidth: 240,
    inspectorWidth: 260,
    /** Panel rows and fields. */
    rowHeight: 24,
    /** Section headers: taller than a row so the fold target is unmissable. */
    sectionHeader: 32,
    /** Trailing row affordances (eye, remove) and header adds. */
    miniSize: 18,
    /** Toolbar hit targets: larger on purpose, they are pointer-first. */
    toolSize: 28,
    /** Handles, guides, and the marquee all share one hairline. */
    hairline: 1,
  },
  /** Shared curve for occasional controls; high-frequency selection chrome stays instant. */
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
  duration: { fast: "120ms", base: "180ms" },
} as const

export type Tokens = typeof tokens
