/** Figma UI3-style floating bottom toolbar, its controls, and their tooltips. */

import { tokens as t, accentFill, accentFillHover } from "../tokens"

export const toolbarCss = `/* ---------- toolbar ---------- */
.de-toolbar {
  position: fixed;
  bottom: ${t.size.panelInset}px; left: 50%;
  transform: translateX(-50%);
  height: ${t.size.toolbarHeight}px;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - var(--de-left) - var(--de-right) - 24px);
  padding: 3px 6px;
  background: ${t.color.bg};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.xl};
  box-shadow: ${t.shadow.panel};
  white-space: nowrap;
}
.de-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}
.de-toolbar-group + .de-toolbar-group {
  border-left: 1px solid ${t.color.border};
}

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
