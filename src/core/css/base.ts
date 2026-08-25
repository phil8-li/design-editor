/** Root variables, vendor-UI suppression, the app inset, and stacking order. */

import { tokens as t } from "../tokens"

/*
 * The vendored React Rewrite overlay stays loaded — we drive it headlessly for
 * fiber -> source resolution and source writes — but its chrome is replaced by
 * ours. Its toasts, drag preview, and drop indicator stay: we call into them.
 */
const VENDOR_CHROME = [
  ".prop-sidebar",
  ".toolbar",
  ".tools-panel",
  ".selection-label",
  ".changelog-panel",
  ".changelog-badge",
  ".help-btn",
  ".shortcuts-overlay",
]

/**
 * The same list, unprefixed, for injection *inside* the vendor's shadow root.
 *
 * The vendor mounts its chrome into `#react-rewrite-root`'s open shadow root,
 * so the descendant selectors below can never match it — which is why its
 * `.prop-sidebar` kept painting over our inspector at z-index 2147483645
 * despite having been named in a suppression rule since day one. A shadow
 * boundary blocks selectors, not stacking.
 */
export const vendorChromeCss = `${VENDOR_CHROME.join(",\n")} { display: none !important; }\n`

export const baseCss = `
:root {
  --de-left: 0px;
  --de-right: 0px;
  --de-top: 0px;
}

${VENDOR_CHROME.map((selector) => `#react-rewrite-root ${selector}`).join(",\n")} {
  display: none !important;
}

/*
 * Inset the app so the chrome never covers what you are editing.
 *
 * Padding on a border-box <html> rather than margins on <body>: the app sets
 * \`html.h-full\` + \`body.min-h-full\`, so a body margin would be *added* to a
 * height that already fills the viewport and put every page into overflow.
 * Padding inside a border-box root shrinks the containing block instead.
 *
 * Not a transform — a transformed ancestor would break the app's own layoutId
 * shared-element morphs (docs/agent-rules/card-reader-morph.md). The tradeoff
 * is that the app's own \`position: fixed\` chrome is viewport-anchored and does
 * not move with the inset; that is inherent to any non-transform inset.
 */
html.design-editor-active {
  box-sizing: border-box;
  padding: var(--de-top) var(--de-right) 0 var(--de-left);
}

@media (prefers-reduced-motion: reduce) {
  [data-design-editor] *, [data-design-editor] *::before, [data-design-editor] *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}

[data-design-editor] {
  box-sizing: border-box;
  font-family: ${t.font.ui};
  font-size: ${t.type.body};
  line-height: 16px;
  -webkit-font-smoothing: antialiased;
}
/*
 * Ink is declared at the ROOTS of the chrome, not on every node of it.
 *
 * \`el()\` stamps CHROME_ATTR on everything it builds — 1604 elements in a live
 * session against 4 actual roots — so declaring \`color\` on the bare attribute
 * re-asserted white on every descendant. A directly matching declaration beats
 * an inherited value at any specificity, so this silently switched inheritance
 * off for the whole editor: a surface could flip its ink and none of its
 * children would follow. That is how the selected token row came to draw dark
 * text and a WHITE check mark on the same light-indigo fill, at 1.9:1.
 *
 * \`accentFill\` cannot own its way out of this — it emits fill and ink together
 * on the surface, and the bug was that no child could hear it. \`:where()\` keeps
 * the specificity at (0,1,0), unchanged from the rule this splits.
 */
[data-design-editor]:where(:not([data-design-editor] *)) {
  color: ${t.color.text};
}
[data-design-editor] *, [data-design-editor] *::before, [data-design-editor] *::after {
  box-sizing: border-box;
}
/* Glyphs are decorative and live inside buttons. Leaving them hit-testable
   makes \`event.target\` an <svg> on half the clicks in the chrome, and every
   handler that reads a dataset off the target then reads undefined. */
[data-design-editor] svg { pointer-events: none; display: block; }

.de-root {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.de-root > * { pointer-events: auto; }

/*
 * Inside .de-root's stacking context, canvas chrome sits below the panels.
 * Without an explicit order the positive-z overlay layer would paint over the
 * toolbar, and its handles would swallow toolbar clicks.
 */
.de-overlay-layer { z-index: 1; }
.de-toolbar, .de-panel { z-index: 2; }

`
