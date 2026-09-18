/**
 * The keyboard shortcuts sheet.
 *
 * A modal card over everything, so it declares its own stacking outright rather
 * than depending on where in `css.ts` it lands — the same choice `app-chooser`
 * makes, and for the same reason: a surface that must be in front of the panels
 * cannot live inside the overlay layer, which is a stacking context pinned
 * below the rail.
 *
 * It borrows the popover vocabulary the rest of the chrome uses — `bgRaised`, a
 * hairline, `shadow.popover` — because a designer should not be able to tell
 * from the surface which lane drew a card. What it adds is the `kbd`, which
 * nothing else in this editor prints: a key is a thing you press, so it is
 * drawn as a key rather than as a code span.
 */

import { tokens as t, nest } from "../tokens"

/**
 * Above the app chooser's menu, which is otherwise the front-most surface.
 *
 * A step above rather than equal to it: this is a modal, and the one time the
 * two can be on screen together is a designer opening the sheet with the
 * chooser's card still up. A modal painting behind a menu would be one you
 * cannot read and cannot click away, since its own scrim would be underneath
 * the thing covering it.
 */
const SHEET_Z = 2147483400

/**
 * The card's corner and the close button's, derived from one inset.
 *
 * `radius['2xl']` over a `space['2xl']` gap: 20 − 16 lands the button on 4,
 * which is `radius.sm` and what every other small control in the chrome draws.
 * The padding is one pixel under the spacing step because the card's hairline
 * is counted as part of the gap between the two curves rather than added to it.
 */
const SHEET = nest({
  of: ".de-shortcuts",
  outer: t.radius["2xl"],
  inset: t.space["2xl"],
  hairline: 1,
})

export const shortcutsCss = `/* ---------- keyboard shortcuts sheet ---------- */
/*
 * The scrim is the click target for "close", so it covers the viewport rather
 * than sizing to the card. Dark enough to say the page behind is out of play,
 * light enough to keep reading it — the sheet is a reference held up against
 * the thing you were doing, not a context switch away from it.
 */
.de-shortcuts-scrim {
  position: fixed; inset: 0;
  z-index: ${SHEET_Z};
  display: flex; align-items: center; justify-content: center;
  padding: ${t.space["5xl"]}px;
  background: rgba(0, 0, 0, 0.45);
}

.de-shortcuts {
  display: flex; flex-direction: column;
  width: min(760px, 100%);
  max-height: 100%;
  padding: ${SHEET.padding};
  border: 1px solid ${t.color.border};
  border-radius: ${SHEET.outer};
  background: ${t.color.bgRaised};
  box-shadow: ${t.shadow.popover};
  color: ${t.color.text};
  font-family: inherit;
  font-size: ${t.type.body};
}
.de-shortcuts:focus { outline: none; }

.de-shortcut-head {
  position: relative;
  flex: none;
  padding: 0 ${t.size.toolSize + t.space.md}px ${t.space.lg}px 0;
  border-bottom: 1px solid ${t.color.border};
}
.de-shortcut-title {
  margin: 0;
  font-size: ${t.type.body};
  font-weight: ${t.type.weightSection};
  color: ${t.color.text};
}
/*
 * The one rule that is not Figma's, printed where the key is about to be
 * pressed. \`textMuted\` rather than \`textDim\`: it is the only sentence in this
 * card that is not restating something the reader can already see, so it has to
 * survive a skim.
 */
.de-shortcut-note {
  margin: ${t.space.sm}px 0 0;
  max-width: 62ch;
  font-size: ${t.type.caption};
  line-height: 1.5;
  color: ${t.color.textMuted};
}
.de-shortcut-close {
  position: absolute; top: 0; right: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: ${t.size.toolSize}px; height: ${t.size.toolSize}px;
  padding: 0;
  border: none;
  border-radius: ${SHEET.radius};
  background: transparent;
  color: ${t.color.textMuted};
  cursor: pointer;
}
.de-shortcut-close:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }

/*
 * Two columns where they fit, one below that.
 *
 * The list runs to about thirty rows; in a single column that is a scroll with
 * no shape to it, and the groups are exactly what makes it skimmable.
 * \`break-inside: avoid\` is the load-bearing line — without it a group's heading
 * lands at the foot of one column and its rows at the head of the next.
 */
.de-shortcut-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-top: ${t.space.lg}px;
  columns: 2;
  column-gap: ${t.space["5xl"]}px;
}
@media (max-width: 720px) { .de-shortcut-body { columns: 1; } }

.de-shortcut-group {
  break-inside: avoid;
  margin: 0 0 ${t.space["4xl"]}px;
}
.de-shortcut-heading {
  margin: 0 0 ${t.space.md}px;
  font-size: ${t.type.micro};
  font-weight: ${t.type.weightSection};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${t.color.textDim};
}

/*
 * Keys first, in a fixed gutter, so the column of keycaps reads as a column. A
 * shortcut sheet is scanned by key at least as often as by name — "what does ⌥2
 * do" — and a ragged key column makes that the slow direction.
 */
.de-shortcut-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: ${t.space.md}px;
  align-items: baseline;
  padding: ${t.space.sm}px 0;
}
.de-shortcut-keys { display: flex; flex-wrap: wrap; gap: ${t.space.xs}px; }

.de-kbd {
  display: inline-block;
  min-width: ${t.space["3xl"]}px;
  padding: ${t.space.xs}px ${t.space.sm}px;
  border: 1px solid ${t.color.border};
  border-bottom-width: 2px;
  border-radius: ${t.radius.sm};
  background: ${t.color.bgSunken};
  color: ${t.color.text};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: ${t.type.caption};
  line-height: 1.5;
  text-align: center;
  white-space: nowrap;
}

.de-shortcut-text { display: flex; flex-direction: column; gap: ${t.space.xs}px; min-width: 0; }
.de-shortcut-label { color: ${t.color.text}; line-height: 1.4; }
/*
 * The Figma lineage, and it is deliberately quiet.
 *
 * It is there so a designer can check a key against what they already know, and
 * so a divergence from Figma is visible on the surface rather than buried in a
 * source comment. It is not what you read the row for, so it takes \`textDim\`
 * at \`micro\` — present on a second pass, invisible on the first.
 */
.de-shortcut-figma {
  font-size: ${t.type.micro};
  line-height: 1.4;
  color: ${t.color.textDim};
}
`
