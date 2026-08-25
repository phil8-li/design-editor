/**
 * Chrome tokens for the editor UI.
 *
 * This chrome sits *around* the product and must read as tooling, never as
 * product surface — but "not product surface" is not the same as "not the
 * design system". The design system already owns a theme-invariant CHROME rung
 * for exactly this: the surfaces the workspace paints around its content
 * canvas. That rung is what the editor wears now, in place of the Figma greys
 * it was born with.
 *
 * Values are vendored as literals rather than read from the app. The package
 * contract is that nothing here imports the app and nothing in the app imports
 * this, so the coupling is the comment naming each source role, not a module
 * edge. Regenerate against `src/app/globals.css` if the rung moves.
 *
 *   --sem-background-chrome   --base-gray-1200   #363c44
 *   --sem-fixed-always-light  --base-gray-white  #ffffff
 *   --sem-decorative-on-chrome --base-indigos-indigo-01  #a1bbff
 *   --sem-fixed-always-dark   --base-gray-1600   #0c1014
 */

/** `--sem-background-chrome`. Every surface below is a step off this ground. */
const CHROME = "#363c44"
/** `--sem-fixed-always-light`. Also the substance every quiet step is cut from. */
const ON_CHROME = "#ffffff"
/**
 * `--sem-decorative-on-chrome`. The workspace's rail colour, and the editor's
 * accent. It is a LIGHT indigo, so it can carry a stroke on the dark chrome and
 * a fill under dark ink, but it must never sit behind white text.
 */
const RAIL = "#a1bbff"
/** `--sem-fixed-always-dark`. The ink that rides on a filled `RAIL`. */
const ON_RAIL = "#0c1014"

/** A quiet step off the chrome, expressed the way the app expresses it. */
const lift = (percent: number) => `color-mix(in srgb, ${ON_CHROME} ${percent}%, ${CHROME})`
/** A hairline cut from the chrome ink, so it survives on any ground. */
const rule = (percent: number) => `color-mix(in srgb, ${ON_CHROME} ${percent}%, transparent)`

export const tokens = {
  color: {
    bg: CHROME,
    /** Panels and popovers. 6% is the app's `--sidebar-shelf` step. */
    bgRaised: lift(6),
    /** `--base-gray-1400`, the rung below chrome — wells and inset tracks. */
    bgSunken: "#25292e",
    bgHover: lift(12),
    bgHoverQuiet: lift(6),
    bgActive: RAIL,
    /** Dividers and rests — decorative, so the 3:1 rule does not apply. */
    border: rule(14),
    borderStrong: rule(22),
    /**
     * Boundary of a control you can act on. 32% is the app's `--sidebar-border`
     * step and lands at 3.2:1 on the chrome, per WCAG 1.4.11.
     */
    borderInteractive: rule(32),
    text: ON_CHROME,
    /** `--sem-fixed-always-light-weaker` — Prism's 75% step. 6.9:1 on chrome. */
    textMuted: "rgba(255,255,255,0.75)",
    /** 4.7:1 on chrome. The obvious 55% lands at 4.4:1 and fails. */
    textDim: "rgba(255,255,255,0.58)",
    /** Strokes, handles, and focus rings. 5.8:1 on chrome. */
    accent: RAIL,
    /**
     * Accent as a FILL. Unlike the Figma blue this replaced, the design system's
     * accent is light, so the ink flips instead of the surface darkening — the
     * same pairing the app ships as `--workspace-theme-drop-surface` over
     * `--workspace-theme-drop-foreground`. 10.1:1.
     */
    accentSurface: RAIL,
    accentSurfaceHover: `color-mix(in srgb, ${ON_CHROME} 22%, ${RAIL})`,
    /** Ink for anything sitting on `accentSurface`. */
    onAccent: ON_RAIL,
    accentSoft: `color-mix(in srgb, ${RAIL} 16%, transparent)`,
    selectionSurface: `color-mix(in srgb, ${RAIL} 18%, transparent)`,
    /** Component (as opposed to plain element) names. */
    component: "#c9b8ff",
    /** `--sem-text-icon-alert`, lifted to carry on the dark chrome. */
    danger: "#ff8a65",
    guide: "#ff6b9a",
    measure: "#ff6b9a",
    autoLayout: "#c9b8ff",
  },
  radius: { sm: "2px", md: "4px", lg: "6px", xl: "10px" },
  shadow: {
    panel: "0 2px 14px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(0,0,0,0.6)",
    popover: "0 6px 22px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.6)",
  },
  font: {
    /** `--font-sans`. The face the product ships, not next/font Inter. */
    ui: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  /**
   * One type scale for the whole shell. Editor chrome is denser than the
   * product's 14px body on purpose — but the density lives here, once, so a
   * surface picks a role rather than a number.
   */
  type: {
    /** Panel rows, field labels, tool labels. The editor's body. */
    body: "11px",
    /** Group headers and hints. Density, not tone — use sparingly. */
    caption: "10px",
    /** Inventory eyebrows and type tags in the options panel, and only those. */
    micro: "9px",
    weightBody: 400,
    weightValue: 500,
    weightSection: 600,
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

/**
 * A filled accent surface and the ink that rides on it, as ONE declaration.
 *
 * The fill and its foreground are not two decisions. While the accent was
 * Figma's dark blue a call site could write `background: accentSurface` alone
 * and inherit the shell's white ink harmlessly; against the design system's
 * light indigo that same line lands at 1.9:1 and the label disappears. Five
 * call sites were already written that way. Emitting both properties together
 * means the wrong pairing cannot be written — the same reason `glyph-plate.ts`
 * owns a fill and a radius rather than exporting a colour.
 */
export const accentFill = `background: ${RAIL}; color: ${ON_RAIL};`
export const accentFillHover = `background: ${tokens.color.accentSurfaceHover}; color: ${ON_RAIL};`
