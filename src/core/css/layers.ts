/** Layers tree rows. */

import { tokens as t } from "../tokens"

export const layersCss = `/* ---------- layers ---------- */
.de-layer {
  display: flex; align-items: center; gap: 4px;
  height: ${t.size.rowHeight}px;
  padding-right: 8px;
  color: ${t.color.textMuted};
  cursor: default;
  white-space: nowrap;
}
.de-layer:hover { background: ${t.color.bgHover}; }
.de-layer[aria-selected="true"] { background: ${t.color.accentSurface}; color: ${t.color.text}; }
.de-layer-name { overflow: hidden; text-overflow: ellipsis; }
.de-layer--component .de-layer-name { color: ${t.color.component}; font-weight: 500; }
.de-layer[aria-selected="true"] .de-layer-name { color: ${t.color.text}; }
.de-layer-twisty {
  width: 14px; height: 14px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer;
  transition: transform ${t.duration.fast} ${t.ease};
}
.de-layer-twisty[aria-expanded="true"] { transform: rotate(90deg); }

`
