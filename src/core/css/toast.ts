/**
 * Sonner, wearing the editor's design system.
 *
 * Two stylesheets concatenated, in this order and no other:
 *
 *   1. Sonner's own `styles.css`, verbatim, via the generated `sonner-css.ts`
 *      beside this file. It is the library's layout, stacking, swipe and
 *      enter/exit behaviour, and none of it is ours to re-derive — the moment
 *      it is retyped by hand, a version bump silently stops applying. It is
 *      copied into a `.ts` module rather than imported as a `.css` file
 *      because every jsdom suite in `test/` bundles its lane with esbuild and
 *      no output path, where a CSS import is a hard error; the long version is
 *      in `tools/build-sonner-css.mjs`.
 *   2. The overrides below, which replace every colour, radius, shadow and
 *      type size the library hard-codes with the token that already answers
 *      for it everywhere else in this chrome.
 *
 * ORDER IS THE MECHANISM, not specificity. Sonner declares its palette at
 * `[data-sonner-toaster][data-sonner-theme='light']` — two attribute
 * selectors, (0,2,0). The override block matches the same element at the same
 * weight with `[data-sonner-toaster][data-sonner-theme]`, so nothing here wins
 * by out-specifying the library; it wins by coming second. Every rule below is
 * therefore written to the weight of the rule it replaces, deliberately, and a
 * selector copied from `styles.css` should be left spelled the way that file
 * spells it.
 *
 * Both halves go into the toaster's SHADOW ROOT (see `core/toast.ts`), never
 * into the document. Sonner's selectors are unprefixed and global — a rule
 * like `[data-sonner-toast][data-styled='true'] { padding: 16px }` in the
 * document would restyle the toasts of any host app that also uses Sonner, and
 * this editor is pointed at apps it did not write. A shadow boundary is the
 * only containment that does not depend on rewriting someone else's selectors.
 */

import { tokens as t } from "../tokens"
import { sonnerCss } from "./sonner-css"

/**
 * Above `.de-root`, which sits at 2147483000.
 *
 * Sonner ships `z-index: 999999999`, which loses to the editor's own chrome by
 * three orders of magnitude — a toast reporting a failed write would be painted
 * UNDER the inspector that triggered it. Left below the vendor's own maximum
 * (2147483647) so that nothing here can cover a surface the vendor considers
 * more urgent than ours.
 */
const LAYER = 2147483646

/**
 * A signal colour tinted into the card's own ground — OPAQUE, and that is the
 * whole point of the helper.
 *
 * The first version mixed into `transparent`, which is how the rest of this
 * chrome tints a surface, and it is wrong HERE for a reason that does not apply
 * anywhere else in the package: every other tinted surface sits on a panel this
 * editor painted, and a toast sits on whatever app is underneath it. A
 * translucent error card is therefore legible or not depending on the page
 * being edited — measured at 4.6:1 over the dark chrome and collapsing to
 * roughly 1.5:1 over a white app, for the same declaration.
 *
 * Mixed into `bgRaised`, the ground the plain card already uses, the error text
 * measures 4.62:1 in the dark theme and 4.62:1 in the light one, because the
 * token flips with the theme and the ground flips with it. Same number both
 * ways, and it no longer depends on the host.
 */
const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, ${t.color.bgRaised})`

const overrides = `
/*
 * The host is an anchor, not a box. Everything Sonner renders is
 * \`position: fixed\`, so the element holding the shadow root should occupy no
 * space and start no stacking context of its own — \`display: contents\` is the
 * only value that promises both.
 */
:host { display: contents; }

/*
 * The squircle every other corner in this chrome is cut with.
 *
 * \`corner-shape\` does not inherit, and a shadow boundary blocks the document's
 * copy of this rule, so it is restated rather than borrowed. Same \`:where()\`
 * for the same reason as in \`css/base.ts\`: a rule that reaches every element
 * must be the thing everything else beats.
 */
:where([data-sonner-toaster], [data-sonner-toaster] *) {
  corner-shape: ${t.cornerShape};
}

/*
 * \`--width\` and \`--gap\` are deliberately NOT here. Sonner writes both inline on
 * the section from its own props, and an inline declaration beats a stylesheet
 * at any specificity — so the width lives with the other Toaster props in
 * \`core/toast.ts\`, where it is actually obeyed. Setting it here as well would
 * be a value that looks authoritative and does nothing.
 */
[data-sonner-toaster] {
  z-index: ${LAYER};
  font-family: ${t.font.ui};
  --border-radius: ${t.radius.md};
}

/*
 * The palette, in place of both of Sonner's built-in themes.
 *
 * \`[data-sonner-theme]\` with no value matches whichever one the library picked,
 * so the editor's two themes are handled by the tokens themselves — every value
 * here is a \`var(--de-*)\` that \`css/base.ts\` re-declares on \`:root\` when
 * \`data-de-theme\` flips, and custom properties inherit THROUGH a shadow
 * boundary. Nothing in this file has to know which theme is up.
 */
[data-sonner-toaster][data-sonner-theme] {
  --normal-bg: ${t.color.bgRaised};
  --normal-bg-hover: ${t.color.bgHover};
  --normal-border: ${t.color.border};
  --normal-border-hover: ${t.color.borderStrong};
  --normal-text: ${t.color.text};

  --error-bg: ${tint(t.color.danger, 16)};
  --error-border: ${tint(t.color.danger, 38)};
  --error-text: ${t.color.danger};

  --success-bg: ${tint(t.color.success, 16)};
  --success-border: ${tint(t.color.success, 38)};
  --success-text: ${t.color.success};

  --info-bg: ${tint(t.color.accent, 16)};
  --info-border: ${tint(t.color.accent, 38)};
  --info-text: ${t.color.accent};

  --warning-bg: ${tint(t.color.lintWarning, 16)};
  --warning-border: ${tint(t.color.lintWarning, 38)};
  --warning-text: ${t.color.lintWarning};
}

/*
 * The card itself. Sonner's own numbers are a product surface's — 16px of
 * padding, 13px type, a 10% black cast — and this is chrome: it has to match
 * the inspector rows it appears beside, not the marketing site it was designed
 * on.
 *
 * A rich-coloured toast keeps the tinted background the block above gives it;
 * the cast and the geometry are shared, which is why they are set here once
 * rather than per type.
 */
[data-sonner-toast][data-styled='true'] {
  padding: ${t.space.md}px ${t.space.lg}px;
  gap: ${t.space.md}px;
  font-size: ${t.type.body};
  line-height: 16px;
  box-shadow: ${t.shadow.popover};
}

[data-sonner-toast][data-styled='true'] [data-title] {
  font-weight: ${t.type.weightValue};
  line-height: 16px;
}

/*
 * Sonner hard-codes \`#3f3f3f\` here — a light-theme grey that is unreadable on
 * the dark chrome and wrong on the light one. It is spelled at (0,3,0) there,
 * so it is spelled at (0,3,0) here.
 */
[data-sonner-toast][data-styled='true'] [data-description] {
  color: ${t.color.textMuted};
  font-size: ${t.type.caption};
  line-height: 15px;
}

/*
 * The WORDS go back to the chrome's own ink; the GLYPH keeps the signal.
 *
 * \`richColors\` paints the whole card in the signal colour — background, border
 * and text together. On the tinted ground above, that text measures 4.62:1:
 * legible, and only just, for the one message in the editor a reader actually
 * has to act on. The chrome's own ink on the same ground measures 10.7:1 in the
 * dark theme and 14.8:1 in the light one.
 *
 * So the tint and the border carry the severity — which is what makes the card
 * readable as an error at a glance, before any word is — and the glyph carries
 * it at full strength, where a 14px mark has no contrast threshold to meet in
 * the first place because it is not text. Nothing is given up by this except
 * coloured prose.
 *
 * Spelled to beat \`[data-rich-colors='true'][data-sonner-toast][data-type=…]\`
 * (0,3,0) in Sonner's sheet, which the type selector here matches at (0,3,0)
 * and wins on order, exactly as the header describes.
 */
[data-sonner-toast][data-styled='true'][data-type] {
  color: ${t.color.text};
}

[data-sonner-toast][data-styled='true'] [data-icon] {
  height: 14px;
  width: 14px;
}
[data-sonner-toast][data-type='error'] [data-icon] { color: ${t.color.danger}; }
[data-sonner-toast][data-type='success'] [data-icon] { color: ${t.color.success}; }
[data-sonner-toast][data-type='warning'] [data-icon] { color: ${t.color.lintWarning}; }
[data-sonner-toast][data-type='info'] [data-icon] { color: ${t.color.accent}; }
[data-sonner-toast][data-styled='true'] [data-icon] > svg {
  height: 14px;
  width: 14px;
}

/*
 * The action and cancel buttons, which the editor does not use yet but which
 * \`toast()\` can be handed at any call site. Left looking like the chrome's own
 * small buttons so that the first one added does not arrive wearing Sonner's
 * black pill.
 */
[data-sonner-toast][data-styled='true'] [data-button] {
  height: ${t.size.rowHeight}px;
  padding: 0 ${t.space.md}px;
  border-radius: ${t.radius.sm};
  font-size: ${t.type.caption};
  font-weight: ${t.type.weightValue};
  background: ${t.color.accentSurface};
  color: ${t.color.onAccent};
}
[data-sonner-toast][data-styled='true'] [data-button]:hover {
  background: ${t.color.accentSurfaceHover};
}
[data-sonner-toast][data-styled='true'] [data-cancel] {
  background: ${t.color.field};
  color: ${t.color.text};
}
[data-sonner-toast][data-styled='true'] [data-cancel]:hover {
  background: ${t.color.fieldHover};
}

/*
 * The focus ring the rest of the chrome wears, in place of Sonner's
 * \`rgba(0,0,0,0.2)\` halo — which is invisible on a dark ground, and this is the
 * ring a keyboard user lands on when they reach a toast with alt+T.
 */
[data-sonner-toast]:focus-visible {
  box-shadow: ${t.shadow.popover}, 0 0 0 2px ${t.color.focusHalo};
}
`

/** Sonner's stylesheet, then ours. The order is the mechanism — see above. */
export const toasterCss = `${sonnerCss}\n${overrides}`
