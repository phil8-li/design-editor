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
.de-layer:hover { background: ${t.color.bgHoverQuiet}; }
.de-layer[aria-selected="true"] { background: ${t.color.selectionSurface}; color: ${t.color.text}; }
.de-layer:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-layer-name { overflow: hidden; text-overflow: ellipsis; }
.de-layer--component .de-layer-name { color: ${t.color.component}; font-weight: 500; }
.de-layer[aria-selected="true"] .de-layer-name { color: ${t.color.text}; }
.de-layer-twisty {
  width: 14px; height: 14px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer;
}
.de-layer-twisty[aria-expanded="true"] { transform: rotate(90deg); }

/* The right-click layer stack. Same rows, same order, over the canvas. */
.de-layer-menu {
  position: absolute;
  min-width: 176px; max-width: 260px;
  padding: 4px;
  background: ${t.color.bgRaised};
  border-radius: ${t.radius.lg};
  box-shadow: ${t.shadow.popover};
  pointer-events: auto;
}
.de-layer-menu-row {
  display: block; width: 100%;
  height: ${t.size.rowHeight}px;
  padding: 0 8px;
  border: none; border-radius: ${t.radius.sm};
  background: transparent;
  color: ${t.color.textMuted};
  font: inherit; text-align: left;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: default;
}
.de-layer-menu-row:hover { background: ${t.color.selectionSurface}; color: ${t.color.text}; }
.de-layer-menu-row:focus-visible {
  outline: 2px solid ${t.color.accent};
  outline-offset: -2px;
  background: ${t.color.selectionSurface};
  color: ${t.color.text};
}
.de-layer-menu-row--component { color: ${t.color.component}; font-weight: 500; }
.de-layer-menu-row--component:hover { color: ${t.color.text}; }

`
