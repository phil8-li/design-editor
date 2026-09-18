/**
 * The right panel's tab strip and its panes.
 *
 * The inspector stopped being one scroll of sections when it grew a Code view
 * and a Change-prompts view: those two are not sections you scroll past, they
 * are other things to be looking at. So the panel body becomes a fixed strip
 * plus one scrolling pane, rather than a single scroll with a sticky header —
 * a sticky header would put the code view's own footer at the bottom of a
 * scroll it does not control.
 *
 * Only the RIGHT panel is re-laid out here. The left panel is still one list
 * and still scrolls as a whole.
 */

import { accentFillText, tokens as t } from "../tokens"

export const inspectorCss = `/* ---------- inspector tabs ---------- */
.de-panel--right .de-panel-body {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
 * A SEGMENTED STRIP OF PILLS, NOT AN UNDERLINED RAIL — the treatment Figma's
 * own right panel uses, and the reason the icons are gone.
 *
 * The strip was four icon+label tabs under an accent underline. Both halves of
 * that were paying for a problem this panel no longer has. The underline is a
 * mark that needs an edge to sit on, so it forced the strip's border up to
 * \`borderStrong\` — a heavier rule than any of the section dividers below it,
 * which made the top of the panel the loudest thing in it. And the icons were
 * load-bearing only while the labels were competing for a 260px row: three
 * words this short are already scannable, and a glyph in front of each one is
 * three more drawings in a panel whose job is to show someone else's.
 *
 * What replaces it is the selected tab carrying a quiet neutral surface of its
 * own. That reads as "one of these is taken" without an edge to hang off, so
 * the strip's border drops to \`border\` and lines up with every section
 * divider under it — the panel now has one hairline weight, not two.
 *
 * NEUTRAL, not \`accentFill\`, which is what the sibling control in
 * \`options.ts\` gives its pressed tab. That control is a dialog's own two-way
 * switch and can afford to shout; this one is the permanent header of the
 * inspector, and an accent slab sitting there all session competes with the
 * accent that actually means something — the selection on the canvas.
 */
.de-tabs {
  flex: none;
  /*
   * 2px, where the underlined strip had none.
   *
   * The old zero was a width measure: four icon+label tabs cleared a 260px
   * panel by three pixels and the gap was six of the eleven they overflowed
   * by. Dropping the icons returns about 16px per tab, so the budget that
   * forced it is gone — and pills need the gap for a reason a text rail does
   * not. Two adjacent backgrounds that touch read as one wider container with
   * a seam in it, which is the wrong object.
   */
  display: flex; align-items: center; gap: ${t.space.xs}px;
  height: ${t.size.tabBar}px;
  /*
   * The workhorse step, so the PILL'S EDGE lands on the panel's own column.
   *
   * Every pane below pads to 8 (\`.de-section-header\`, \`.de-section-body\`).
   * With the underline gone, the thing that has to line up with that column is
   * no longer a 2px rule inset inside its tab, it is the left edge of the
   * selected tab's surface — so the strip takes the column directly instead of
   * the 4 that used to sum to it. The label then sits 8px further in, inside
   * the pill, which is exactly how a pill differs from a word.
   */
  padding: 0 ${t.space.md}px;
  border-bottom: 1px solid ${t.color.border};
  /*
   * THE STRIP STILL SCROLLS RATHER THAN SHRINKS, though it now has room.
   *
   * It is kept because the constraint that forced it never went away: the
   * panels are resizable down to \`inspectorMinWidth\` (200px), so the width
   * three tabs have is whatever the user last dragged the seam to, not the
   * width they mounted at. Dropping the icons bought roughly 48px of headroom
   * and bought nothing at all at the narrow end.
   *
   * The other three answers are still worse: letting the tabs shrink truncates
   * the labels of the tabs you are not on, wrapping to a second row doubles
   * the height of a landmark, and clipping silently leaves a tab unreachable.
   *
   * The scrollbar is hidden in both engines — it is 15px of furniture across a
   * 34px landmark, and the thing it would report is already reported by a tab
   * half-cut at the edge. Reachability comes from \`activate()\` instead, which
   * scrolls the selected tab into view, so the keyboard path never depends on
   * the pointer finding a bar that is not drawn.
   */
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.de-tabs::-webkit-scrollbar { display: none; }
/*
 * An unselected tab is a CONTROL, so it takes the control ink (rank 3 in the
 * ladder at the top of panels.ts), not the secondary one. At \`textDim\` the
 * unselected tabs sat at the same rank as the hint text inside the pane they
 * switch to — the landmark reading quieter than the body it leads.
 * \`textMuted\` puts them at 9.95:1, a step under the selected tab's white.
 *
 * ONE WEIGHT FOR EVERY TAB, and it is the value rung rather than the section
 * one the selected tab used to take. A weight that changes with selection
 * changes the label's WIDTH with it, so every switch shoved the tabs beside it
 * sideways — on a strip that is also a scroller, that is a landmark that moves
 * when you use it. The pill and the white ink say which one is taken; they do
 * not need a third voice that costs layout.
 *
 * The box matches \`.de-opt-tab\`, the other tab-pill in this chrome: a
 * \`rowHeight\` box on the \`md\` corner with the workhorse step inside it. Being
 * shorter than the 34px strip is the point — a pill that filled the strip
 * would be a filled header, not a control sitting in one.
 *
 * \`flex: none\` and \`nowrap\` because the failure this pair prevents is the one
 * the scroller cannot: flex items shrink before their container overflows, so
 * without them the tabs would squeeze to fit and truncate their own labels,
 * and the strip would never scroll at all.
 */
.de-tab {
  flex: none;
  display: inline-flex; align-items: center;
  height: ${t.size.rowHeight}px;
  padding: 0 ${t.space.md}px;
  border: none; border-radius: ${t.radius.md};
  background: transparent;
  color: ${t.color.textMuted};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightValue};
  white-space: nowrap;
  cursor: pointer;
}
/*
 * HOVER BRIGHTENS THE INK AND DRAWS NO SURFACE, so the pill means one thing.
 *
 * The obvious build gives hover \`bgHoverQuiet\` and selection \`bgHover\`, and
 * it was tried: on the dark ground those are \`lift(6)\` and \`lift(12)\`, two
 * greys six percent apart, and the hovered tab also takes the white ink the
 * selected one has. Screenshotted, a hovered neighbour and the selected tab
 * were a pair of pills you had to compare to tell apart — for as long as the
 * pointer rested there, the strip had two answers to "which one am I on".
 *
 * A mark that means "selected" cannot also mean "the mouse is here". So the
 * surface is reserved for selection outright and hover does what this strip
 * did before it had pills at all: it lifts the label from \`textMuted\` to
 * full ink, which is unmistakably a different KIND of change from growing a
 * background, and therefore never mistaken for one.
 */
.de-tab:hover { color: ${t.color.text}; }
.de-tab[aria-selected="true"] {
  background: ${t.color.bgHover};
  color: ${t.color.text};
}
/* Outside the pill, not inset into it. At the \`-3px\` the underlined tab used,
   the ring landed inside the surface and read as a second border on the pill
   rather than as a ring around it. */
.de-tab:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

/*
 * HOW MUCH IS OWED, ON THE CHANGES TAB.
 *
 * A number, not a dot: "there is something here" is the one thing a designer
 * can already infer from opening the panel, and the useful question — one
 * stray tweak, or a session's worth — is exactly what a dot refuses to answer.
 *
 * It is the MUTED ink, not the accent. The accent in this chrome means "this
 * is selected" and is already spent on the pill behind the label; a second
 * accent inside the same pill would be two claims on one colour. The count is
 * not an alert either — it is a fact about a list — and muted keeps a
 * five-item session from reading as an error state.
 *
 * Empty until there is something to say, and \`:empty\` collapses the margin
 * with it, so a tab owing nothing measures exactly what it did before the
 * count existed and the strip's overflow point does not move.
 */
/*
 * A BADGE, not a loose numeral beside a word.
 *
 * It was \`content: attr(data-de-count)\` with a 2px margin and nothing else, so
 * the tab read "Changes 5" — a number set in running text at the same rank as
 * the label, which the eye takes as part of the name. Two digits made it
 * plainer: "Changes 12" reads as a version number.
 *
 * A count is a different KIND of thing from a label and has to be drawn as one.
 * The pill is the smallest treatment that says so — its own surface, its own
 * ink, and a shape the label cannot have.
 *
 * Sized from the scale rather than from a fixed box: \`min-width\` equal to the
 * height makes a single digit a circle and lets a three-digit count grow into a
 * stadium instead of clipping, and a badge that truncates its own number is
 * worse than no badge. \`tabular-nums\` keeps the tab's width from twitching as
 * the count crosses 9, which matters because the strip is a scroller and its
 * overflow point is a function of that width.
 *
 * \`corner-shape: round\`, for the reason the switch track opts out in
 * \`css/base.ts\`: at a radius past half the height the corner box is the whole
 * side, so the chrome's superellipse would square the cap off into a rounded
 * rectangle instead of leaving it a pill.
 *
 * The attribute is still deleted rather than set to "0" by
 * \`installChangeCount\`, so a session owing nothing wears no badge and the tab
 * measures exactly what it did before the count existed.
 */
.de-tab[data-de-count]::after {
  content: attr(data-de-count);
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: ${t.space.sm}px;
  min-width: ${t.space["2xl"]}px; height: ${t.space["2xl"]}px;
  padding: 0 ${t.space.sm}px;
  border-radius: ${t.space["2xl"]}px;
  corner-shape: round;
  background: ${t.color.bgHover};
  color: ${t.color.textMuted};
  font-variant-numeric: tabular-nums;
  font-size: ${t.type.micro};
  font-weight: ${t.type.weightValue};
  line-height: 1;
}
/*
 * Chosen, the badge takes the accent.
 *
 * The selected tab already wears a neutral surface, so a neutral chip on top of
 * it is a plate on a plate — about 1.2:1 apart, which loses the count at
 * exactly the moment the user is looking at the list it counts. \`accentFill\`
 * rather than a bare background because this chrome's accent is light in one
 * theme and dark in the other, and the ink has to flip with it.
 */
.de-tab[aria-selected="true"][data-de-count]::after { ${accentFillText} }

.de-tabpanel {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overscroll-behavior: contain;
}
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-tabpanel[hidden] { display: none; }
.de-tabpanel::-webkit-scrollbar { width: 8px; }
.de-tabpanel::-webkit-scrollbar-thumb {
  background: transparent; border-radius: ${t.radius.md};
  border: 2px solid transparent; background-clip: content-box;
}
.de-tabpanel:hover::-webkit-scrollbar-thumb {
  background: ${t.color.borderStrong}; background-clip: content-box;
}
`
