/** Canvas chrome: outlines, handles, guides, badges, marquee. */

import { tokens as t } from "../tokens"

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
}
.de-outline--hover { border-style: solid; opacity: 0.7; }
/* The container you have drilled into. Dashed and neutral so it reads as
   context rather than as a second selection competing with the accent. */
.de-outline--scope {
  border-style: dashed;
  border-color: ${t.color.borderStrong};
}
.de-outline--autolayout { border-color: ${t.color.autoLayout}; }
.de-handle {
  position: absolute;
  width: 7px; height: 7px;
  margin: -4px 0 0 -4px;
  border: ${t.size.hairline}px solid ${t.color.accent};
  border-radius: ${t.radius.sm};
  background: ${t.color.text};
  pointer-events: auto;
}
.de-guide { position: absolute; background: ${t.color.guide}; pointer-events: none; }
.de-badge {
  position: absolute;
  padding: 1px 5px;
  border-radius: ${t.radius.sm};
  background: ${t.color.accentSurface};
  color: ${t.color.text};
  font-family: ${t.font.ui};
  font-size: 10px;
  line-height: 14px;
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
