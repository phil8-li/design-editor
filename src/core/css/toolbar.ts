/** Floating bottom toolbar, drawn as one pill, plus its controls and tooltips. */

import { tokens as t, accentFill, accentFillHover } from "../tokens"

/*
 * The strip's geometry, written here rather than added to the token file.
 *
 * It used to be declared from the outside in: `tokens.size.toolbarHeight` fixed
 * the bar at 36 and `tokens.size.toolSize` its buttons at 28, so the space
 * between them was whatever was left over. Move either number and the row
 * silently re-centres inside a height nobody re-derived — which is how the bar
 * ended up 36 tall around 34 of content. The pill is built from the inside out
 * instead: a square, the padding wrapped around the row of them, and a height
 * that is simply the sum. There is no third number to keep in agreement.
 *
 * These sit in this file and not in `tokens.ts` because they are not shared
 * vocabulary. Nothing else in the chrome draws a 32px square or nests at this
 * padding, and the token file is read by every surface that does.
 */
const TOOL = 32
const PAD = 4
const GAP = 2

/** The lift, which is most of what makes this read as floating. */
const LIFT = t.shadow.float

export const toolbarCss = `/* ---------- toolbar ---------- */
/*
 * No height declaration, on purpose: ${PAD} + ${TOOL} + ${PAD} is the height, and the
 * source of that sum is the constants above this template. The radii nest
 * rather than compete — ${t.radius.xl} on the pill, ${t.radius.lg} on every child, with
 * the padding as the offset between the two curves.
 */
.de-toolbar {
  position: fixed;
  bottom: ${t.size.panelInset}px; left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  max-width: calc(100vw - var(--de-left) - var(--de-right) - 24px);
  padding: ${PAD}px;
  background: ${t.color.bg};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.xl};
  box-shadow: ${LIFT};
  white-space: nowrap;
}
.de-toolbar-group {
  display: flex;
  align-items: center;
  gap: ${GAP}px;
}
/*
 * Clusters told apart by AIR, not by rules.
 *
 * A hairline at every seam was furniture: three vertical lines in a bar holding
 * six controls, two of which were separating things that could not have been
 * confused anyway. The mode switch is a wide labelled pill and the control next
 * to it is a bare square — nothing has to be drawn between those two for the
 * eye to see the break. Space says it.
 *
 * The one seam space cannot carry alone is the second, where two icon squares
 * meet two more. Four identical squares in a row read as one run of four however
 * the gaps are set, because likeness groups faster than distance separates. That
 * seam keeps a single hairline, and it is inset to half the button's height so
 * it parts the glyphs without slicing the pill in two.
 */
.de-toolbar-group + .de-toolbar-group { margin-left: 8px; }
.de-toolbar-group + .de-toolbar-group + .de-toolbar-group::before {
  content: "";
  width: 1px;
  height: ${TOOL / 2}px;
  margin-right: ${8 - GAP}px;
  background: ${t.color.border};
}

/*
 * The generic icon button. It is NOT only the bar's — the inspector's align
 * strip and every other \`iconButton\` wear it too, inside a 240px panel where
 * ${t.size.toolSize} is already the largest square that fits a row. So this rule stays as
 * the panels need it and the bar's own version is the override below.
 */
.de-tool {
  width: ${t.size.toolSize}px; height: ${t.size.toolSize}px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.textMuted};
  cursor: pointer;
}
.de-tool:hover { background: ${t.color.bgHoverQuiet}; color: ${t.color.text}; }
.de-tool[aria-pressed="true"] { background: ${t.color.selectionSurface}; color: ${t.color.text}; }
.de-tool:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }
.de-tool[disabled] { opacity: 0.35; cursor: default; }

/*
 * The same button in the bar, where it has room and no row to line up with.
 *
 * Three ink tiers, and no two of them step in the same currency: resting is
 * muted ink on the bar's own ground, hover adds a surface AND takes the ink to
 * full, and ON is the accent as a fill. A state told apart from its neighbour by
 * hue alone would be no state at all at a glance, so every step changes
 * something that does not require holding two swatches side by side.
 *
 * ON used to be the canvas's 18% wash, which is a tint built to let the page
 * show THROUGH a selected element. Nothing shows through a ${TOOL}px button, so the
 * wash was paying for a transparency nobody needed and reading as a hover that
 * had got stuck. The ink flips with the fill because this accent is a light
 * indigo — see the pairing note in tokens.ts.
 */
.de-toolbar .de-tool {
  width: ${TOOL}px; height: ${TOOL}px;
  border-radius: ${t.radius.lg};
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-toolbar .de-tool[aria-pressed="true"] { ${accentFill} }
.de-toolbar .de-tool[aria-pressed="true"]:hover { ${accentFillHover} }

/*
 * In this bar the text pills stand as tall as the squares.
 *
 * \`.de-button\` is 24 everywhere else, which is a panel row's height and is
 * right there. Dropped into a ${TOOL}px row it would float with ${(TOOL - 24) / 2}px of air
 * above and below, and the strip would read as two courses of furniture instead
 * of one row. Scoped for the same reason the square above is: the panels that
 * need the smaller control are not the ones being redrawn.
 */
.de-toolbar .de-button {
  height: ${TOOL}px;
  border-radius: ${t.radius.lg};
}

.de-button {
  height: 24px;
  padding: 0 10px;
  display: inline-flex; align-items: center; gap: 6px;
  border: none; border-radius: ${t.radius.md};
  background: ${t.color.bgRaised}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightValue};
  cursor: pointer;
}
.de-button:hover { background: ${t.color.bgHover}; }
/*
 * The accent is a LIGHT indigo, so a filled button flips its ink instead of
 * darkening its surface. White on this fill measures 1.9:1; the fixed-dark ink
 * measures 10.1:1, which is why tokens.ts pairs the two.
 */
.de-button--primary { ${accentFill} }
.de-button--primary:hover { ${accentFillHover} }
.de-button--danger:hover { background: ${t.color.danger}; }
/*
 * A pressed text button is a MODE, and a mode has to be legible from across the
 * room — the whole point of the interactive switch is that a click no longer
 * does what the editor trained you to expect.
 *
 * It does NOT get the filled accent above, though, which is the primary
 * ACTION's treatment: two identical indigo pills a few pixels apart read as two
 * things to press, not as one state you are standing in. So the mode is drawn
 * the other way round — the accent as ink and as a hairline over a wash of
 * itself — a vocabulary no action in this strip uses. The hairline is an inset
 * shadow rather than a border because .de-button has none, and a real one would
 * grow the pill by 2px at the moment it turns on.
 */
.de-button[aria-pressed="true"] {
  background: ${t.color.accentSoft};
  color: ${t.color.accent};
  box-shadow: inset 0 0 0 1px ${t.color.accent};
  font-weight: ${t.type.weightSection};
}
/*
 * Hover thickens the ring rather than stepping the wash. The two accent washes
 * this file has to choose between are 16% and 18% of the same colour, about two
 * RGB units apart on the chrome — a rule that changes nothing. The ring is what
 * carries the state, so the ring is what answers the pointer.
 */
.de-button[aria-pressed="true"]:hover { box-shadow: inset 0 0 0 2px ${t.color.accent}; }
.de-button[disabled] { opacity: 0.4; cursor: default; background: ${t.color.bgRaised}; }
.de-button:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

/*
 * A button that leads with a glyph pulls its leading padding in by the optical
 * margin the glyph already carries; 10px on both sides reads as a gap on the
 * left and a snug fit on the right. The 4px gap is tighter than the 6px between
 * two words because the arrow and the word are one lockup, not two items.
 */
.de-button--mode { gap: 4px; padding-left: 7px; }
.de-button-glyph { flex: none; display: inline-flex; align-items: center; }

/*
 * Tooltips. Always ABOVE the control: this strip is pinned to the bottom of the
 * viewport, so a tip below it would render off-screen. Delayed on the way in so
 * it never fires while the pointer is only crossing the bar, and instant on the
 * way out so walking the row does not trail a queue of labels. Not the native
 * \`title\` attribute — that waits about a second and then paints OS chrome,
 * which beside this surface reads as a glitch rather than as an answer.
 *
 * Deliberately no \`prefers-reduced-motion\` override. The obvious one,
 * \`transition: none\`, zeroes transition-property and takes the 400ms delay
 * down with it, so the population most disturbed by flicker is the one that
 * gets six labels flashing as the pointer crosses the bar. base.ts already
 * clamps every duration in the chrome to 0.01ms under that query, which removes
 * the fade and keeps the wait.
 */
.de-toolbar [data-de-tip] { position: relative; }
.de-toolbar [data-de-tip]::after {
  content: attr(data-de-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 6px;
  background: ${t.color.bgSunken};
  color: ${t.color.text};
  border-radius: ${t.radius.md};
  box-shadow: ${t.shadow.popover};
  font-size: ${t.type.caption};
  font-weight: ${t.type.weightBody};
  line-height: 14px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity ${t.duration.fast} ${t.ease};
}
.de-toolbar [data-de-tip]:hover::after,
.de-toolbar [data-de-tip]:focus-visible::after {
  opacity: 1;
  transition-delay: 400ms;
}
`
