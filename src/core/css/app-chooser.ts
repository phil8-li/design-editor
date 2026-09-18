/**
 * The app chooser: the header row at the top of the left panel, and the floating
 * card it opens.
 *
 * Two surfaces in one module because they are one control. The trigger is the
 * only thing on screen that names the app every other panel is a view of, and
 * the menu is the chooser itself — the rows are the running prototypes and
 * clicking one switches the editor to it. Splitting them would put half a
 * control's measurements in a file that never mentions the other half.
 *
 * ## Why the menu is a fixed card with a z-index rather than overlay furniture
 *
 * The other floating surfaces in this chrome divide into two kinds. Canvas
 * chrome — the selection frame, the layer stack, the drop indicator — lives in
 * `.de-overlay-layer`, which `css/base.ts` pins at `z-index: 1`, BELOW the rail
 * holding the panels. That is right for anything drawn over the app and wrong
 * for anything drawn over a panel: the overlay's z-index makes it a stacking
 * context, so a card inside it can never paint above the opaque panel it drops
 * out of, whatever it asks for.
 *
 * The second kind is a popover opened from a panel control — `.de-asset-details`
 * in `css/assets.ts`, `.de-token-popover` in `css/token-picker.ts` — which is
 * `position: fixed` in `document.body` with a z-index above `.de-root`. This
 * menu is the second kind, and shares their vocabulary exactly: `bgRaised` on
 * the `lg` corner, a hairline, and `shadow.popover`. A designer should not be
 * able to tell from the surface which lane built the card.
 *
 * ## Ordering
 *
 * Registered after `left-tabs.ts` and before the overlay's modules. The trigger
 * is the left panel's first child and sits directly above the tab strip that
 * file lays out, so the two read as a pair; the menu declares its own stacking
 * outright rather than relying on where in the sheet it lands.
 */

import { tokens as t, nest } from "../tokens"

/**
 * Above `.de-root` (2147483000), which is what it takes to clear the panel this
 * card drops out of.
 *
 * A step above `.de-token-popover` as well, and that ordering is deliberate
 * rather than incidental: those popovers are opened from a control INSIDE a
 * panel, and this one is opened from the row that says which app the panel is
 * describing. If the two are ever on screen together the outer question is the
 * one in front.
 */
const MENU_Z = 2147483250

/**
 * The card's corner and the rows' corner, derived from one inset.
 *
 * `radius.lg` outside, a `space.sm` gap in, `radius.md` on the rows — which is
 * what they already wore. The padding is what changed: one pixel under the
 * spacing step, so the hairline the card draws is counted as part of the gap
 * between the two curves rather than added on top of it.
 */
const MENU = nest({ of: ".de-app-menu", outer: t.radius.lg, inset: t.space.sm, hairline: 1 })

export const appChooserCss = `/* ---------- app chooser ---------- */
/*
 * A heading you can press, which is the whole brief.
 *
 * It takes rank 1 off the ladder in panels.ts — \`text\` on \`weightSection\` — so
 * at rest it reads as the panel's title rather than as a control competing with
 * the tabs under it. No fill, no border, no corner: everything that would make
 * it look like a button is spent on hover and focus instead, where it costs
 * nothing until somebody is actually reaching for it.
 *
 * Full bleed rather than inset, because it is the panel's header and a header
 * with a margin reads as the first item in a list. The horizontal padding is
 * the workhorse step, which is the column \`.de-tabs\` and every section below
 * it already start on — so the app's name, the tab labels and the layer rows
 * all share one left edge.
 *
 * \`sectionHeader\` tall for the reason that token exists: taller than a row, so
 * the target is unmissable and the band is legible as a landmark.
 */
.de-app-chooser {
  flex: none;
  display: flex; align-items: center; gap: ${t.space.sm}px;
  width: 100%;
  height: ${t.size.sectionHeader}px;
  padding: 0 ${t.space.md}px;
  border: none;
  border-bottom: 1px solid ${t.color.border};
  border-radius: 0;
  background: transparent;
  color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
  text-align: left;
  cursor: default;
  transition: background ${t.duration.fast} ${t.ease};
}
/* 32px is over the 24px line in the hover rule, so it takes the quiet step its
   own ground asks for rather than the louder one small controls get. */
.de-app-chooser:hover { background: ${t.color.bgHoverQuiet}; }
/* Inset, because the row is full-bleed: an outward ring on a box flush with the
   panel edge is a ring with one side drawn off the panel. */
.de-app-chooser:focus-visible {
  outline: 2px solid ${t.color.accent};
  outline-offset: -2px;
}
.de-app-chooser[aria-expanded="true"] { background: ${t.color.bgHoverQuiet}; }
/*
 * The name gives up its width before the chevron does.
 *
 * \`min-width: 0\` is the half that is not optional: a flex item's default
 * \`min-width: auto\` refuses to shrink below its content, so without it a long
 * package name pushes the glyph out of the panel instead of truncating — and
 * the glyph is the only thing on the row saying it opens.
 */
.de-app-chooser-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/*
 * No app name known, so the row is holding instruction text rather than a value
 * — rank 4 on the ladder, and the weight comes off it too. The BOX does not
 * move: same height, same padding, same chevron. A control that changes shape
 * when it has nothing to show is a control the reader has to learn twice.
 */
.de-app-chooser--empty .de-app-chooser-name {
  color: ${t.color.textDim};
  font-weight: ${t.type.weightBody};
}
/*
 * The glyph is the affordance and never shrinks. \`base.ts\` already gives every
 * svg in the chrome \`flex: none\`; it is restated here because this is the one
 * row where a long name is actively pushing against it, and losing the chevron
 * would leave a heading that gives no sign it opens anything.
 *
 * Rank 4 at rest and the row's own ink when the row is reached for — the
 * glyph-only carve-out on the ladder, applied to the one mark on this row.
 */
.de-app-chooser svg { flex: none; color: ${t.color.textDim}; }
.de-app-chooser:hover svg,
.de-app-chooser:focus-visible svg,
.de-app-chooser[aria-expanded="true"] svg { color: ${t.color.text}; }

/* ---------- the menu, which is the chooser ---------- */
/*
 * \`position: fixed\` in \`document.body\`, not \`absolute\` in the overlay. See the
 * note at the top of this file: the overlay is a stacking context under the
 * rail, so a card mounted there is unclipped and invisible at the same time.
 *
 * The width floor is what a two-line row needs before the url starts
 * truncating; the ceiling keeps the card from spanning a wide window just
 * because one project lives at a deep path. Between them the card sizes to its
 * content, which on a typical machine is two or three rows.
 */
.de-app-menu {
  position: fixed;
  z-index: ${MENU_Z};
  min-width: 232px; max-width: 340px;
  padding: ${MENU.padding};
  background: ${t.color.bgRaised};
  border: ${MENU.hairline}px solid ${t.color.border};
  border-radius: ${MENU.outer};
  box-shadow: ${t.shadow.popover};
  pointer-events: auto;
}
/*
 * Two lines, because a row has two facts to carry and they are not the same
 * kind of fact: what the app is called, and where it is running. One line
 * holding both would make the reader parse a separator to find the name, and
 * the name is what the click is chosen on.
 */
.de-app-menu-row {
  display: flex; flex-direction: column; gap: ${t.space.xs}px;
  width: 100%;
  padding: ${t.space.sm}px ${t.space.md}px;
  /* Read off the card's nest, not matched to it by hand — see \`MENU\`. */
  border: none; border-radius: ${MENU.radius};
  background: transparent;
  color: ${t.color.text};
  font: inherit;
  text-align: left;
  cursor: default;
}
/* A row on a raised surface lifts to \`bgHover\`, per the hover rule in
   panels.ts — the card is already a step off the ground, so the quiet step
   would be invisible on it. */
.de-app-menu-row:hover:not(:disabled) { background: ${t.color.bgHover}; }
.de-app-menu-row:focus-visible {
  outline: 2px solid ${t.color.accent};
  outline-offset: -2px;
  background: ${t.color.bgHover};
}
/*
 * A switch is in flight and the rows are dead, so they say so.
 *
 * \`textDisabled\` rather than \`opacity\`, for the reason that role exists: a
 * fade takes the ink and the fill toward whatever is behind them together and
 * lands a disabled label under the contrast floor. This keeps both lines
 * readable — the reader still needs to see which app they picked.
 */
.de-app-menu-row:disabled { color: ${t.color.textDisabled}; cursor: default; }
/*
 * An app the scanner found but could not place on disk — running, listed, and
 * not openable, because the editor rewrites source files and there is no folder
 * to rewrite them in.
 *
 * It keeps the disabled ink from the rule above but not its silence: the second
 * line stays at \`textDim\` rather than fading with the rest, because that line
 * is the only thing on screen saying WHY the row is dead. A uniformly greyed
 * row reads as "not available just now" and invites a second click; this one
 * has to read as "here is the reason".
 */
.de-app-menu-row--unplaced .de-app-menu-where { color: ${t.color.textDim}; }
.de-app-menu-name {
  font-weight: ${t.type.weightValue};
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/*
 * Where it is running: rank 4, and the one line in the card that WRAPS rather
 * than truncating.
 *
 * Every loopback url on the machine is the same string up to the port, so an
 * ellipsis lands on \`http://127.0.0.1:30…\` and hides the only part that tells
 * two prototypes apart. Two lines of small text is a cheaper price than a row
 * the reader cannot identify; \`word-break\` is what keeps a long project path
 * from pushing past the card's edge on the way.
 */
.de-app-menu-where {
  color: ${t.color.textDim};
  font-size: ${t.type.caption};
  word-break: break-word;
}
/*
 * The app you are already editing.
 *
 * A left rule in the accent rather than a filled band: the row is still a live
 * control — pressing it closes the menu — and a filled row in a list of
 * pressable rows reads as the one that is selected AND about to do something.
 * The mark is a border rather than a background so it survives hover, which is
 * the moment the reader most needs to be told they are on it.
 */
.de-app-menu-row--current {
  box-shadow: inset 2px 0 0 ${t.color.accent};
  color: ${t.color.text};
}
.de-app-menu-row--current .de-app-menu-name { color: ${t.color.accent}; }
/*
 * Looking, empty, no chooser, failed — every answer the menu can give that is
 * not a list of apps.
 *
 * One class for all four rather than a state each, because they are one thing
 * as far as the reader is concerned: a sentence where the rows would be. It is
 * deliberately NOT centred or italic. A centred sentence in a small card reads
 * as an illustration of emptiness; left on the rows' own column it reads as the
 * answer to the question that was asked.
 */
.de-app-menu-note {
  padding: ${t.space.sm}px ${t.space.md}px;
  color: ${t.color.textDim};
  font-size: ${t.type.caption};
  line-height: 1.45;
  word-break: break-word;
}

/* The only transition in this module is the trigger's hover fill, and a reader
   who has asked for less motion has asked for that too. Nothing here animates
   position or size, so there is nothing else to stand down. */
@media (prefers-reduced-motion: reduce) {
  .de-app-chooser { transition: none; }
}
`
