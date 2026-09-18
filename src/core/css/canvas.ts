/** Canvas chrome: outlines, handles, guides, badges, marquee. */

import { tokens as t, accentFill } from "../tokens"

export const canvasCss = `/* ---------- canvas chrome ---------- */
/*
 * No z-index here. This layer is a child of .de-root, which is the stacking
 * context, so base.ts orders it against the toolbar and panels (1 vs 2). This
 * module is concatenated last, so re-declaring z-index would win on cascade
 * order and silently undo that — putting resize handles, which are
 * pointer-events:auto, on top of every button in the chrome.
 */
.de-overlay-layer { position: fixed; inset: 0; pointer-events: none; }
.de-outline {
  position: absolute;
  border: ${t.size.hairline}px solid ${t.color.accent};
  pointer-events: none;
  transition: none;
  animation: none;
}
.de-outline--hover { border-style: solid; opacity: 1; }
.de-outline--related {
  border-color: ${t.color.measure};
  border-style: dashed;
  opacity: 0.82;
}
.de-outline--autolayout { border-color: ${t.color.autoLayout}; }
/*
 * 7px is the DRAWING. The target is not here and cannot be fixed here.
 *
 * \`selection.ts\` wraps each of these in a 13px hit box (\`HANDLE_HIT\`) and pins
 * the visual inside it with an inline \`pointer-events: none\`, which beats the
 * \`auto\` below — so that declaration is inert and the grab area is 13x13, well
 * under the 24px a pointer is owed. Widening it is a call for whoever owns
 * \`selection.ts\`, and not a free one: corner handles 24px apart cannot both be
 * reachable on an element narrower than 48px, which is most icons on a page.
 * Figma's answer is about 10px plus an edge band, and that is the shape of the
 * fix — a bigger \`HANDLE_HIT\` alone would make small elements unselectable.
 */
.de-handle {
  position: absolute;
  width: 7px; height: 7px;
  margin: -4px 0 0 -4px;
  border: ${t.size.hairline}px solid ${t.color.accent};
  border-radius: 0;
  background: ${t.color.text};
  pointer-events: auto;
  transition: none;
  animation: none;
}
.de-guide { position: absolute; background: ${t.color.guide}; pointer-events: none; }
/*
 * Fixed-dark ink, not white. Both grounds a badge paints on are light — the
 * accent is a light indigo and the snapping pink is lighter still — so white
 * numerals measure 1.9:1 and 2.6:1 on a mark that only ever appears mid-drag,
 * which is the worst moment to have to squint. color.onAccent is the ink
 * tokens.ts ships for exactly this pairing: 10.1:1 and 7.1:1.
 *
 * And the numerals are on \`body\`, where they were on \`micro\`.
 *
 * 9px was the smallest type anywhere in the editor, carrying the one content
 * the chrome produces that a designer reads as DATA — the width, the height,
 * the gap being snapped to. Fixing the contrast and leaving the size was the
 * half-measure: the ratio was never why "128 x 44" was hard to read at arm's
 * length mid-drag, three-quarters of the 12px floor was. \`body\` is the nearest
 * rung that exists and is still 11px; the badge is the strongest argument in
 * the chrome for moving that rung to 12.
 *
 * The line box follows the shell's own 16px rather than staying at 13, so the
 * 11px numerals sit in the same box as every other line of text in the editor
 * instead of in one cut to fit a size that is gone.
 */
.de-badge {
  position: absolute;
  padding: 0 4px;
  border-radius: ${t.radius.sm};
  ${accentFill}
  font-family: ${t.font.ui};
  font-size: ${t.type.body};
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.de-badge--measure { background: ${t.color.measure}; }
.de-marquee {
  position: absolute;
  border: ${t.size.hairline}px solid ${t.color.accent};
  background: ${t.color.accentSoft};
  pointer-events: none;
}
`
