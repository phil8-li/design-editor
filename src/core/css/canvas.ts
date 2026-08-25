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
 * numerals measure 1.9:1 and 2.6:1 at 9px on a mark that only ever appears
 * mid-drag, which is the worst moment to have to squint. color.onAccent is the
 * ink tokens.ts ships for exactly this pairing: 10.1:1 and 7.1:1.
 */
.de-badge {
  position: absolute;
  padding: 0 4px;
  border-radius: ${t.radius.sm};
  ${accentFill}
  font-family: ${t.font.ui};
  font-size: ${t.type.micro};
  font-variant-numeric: tabular-nums;
  line-height: 13px;
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
