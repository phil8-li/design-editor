/** Layers tree rows. */

import { tokens as t } from "../tokens"

/**
 * One indent step, in px, shared with the panel that builds the rows.
 *
 * It lives here because the stylesheet is the other half of the measurement:
 * the row sets its own `padding-left` from this, and the indent guides are a
 * gradient that has to repeat on exactly the same pitch or the rule drifts off
 * the level it marks. Two numbers that must agree is one number.
 */
export const LAYER_INDENT = 16

export const layersCss = `/* ---------- layers ---------- */
/*
 * The tree is the focus root for the selected band below, so it — and not the
 * whole left slot — is what :focus-within is asked about. The horizontal inset
 * is what lets a rounded row read as a band with edges, not a full-bleed stripe.
 */
.de-layers-tree { position: relative; padding: 0 4px 8px; }
.de-layer {
  position: relative;
  display: flex; align-items: center; gap: 4px;
  height: ${t.size.rowHeight}px;
  padding-right: 8px;
  border-radius: ${t.radius.md};
  color: ${t.color.textMuted};
  cursor: default;
  white-space: nowrap;
  transition: none;
  animation: none;
}
/*
 * Indent guides: one hairline per level the row sits under, drawn as a single
 * repeating gradient clipped to the row's own indent width. A rule per level
 * as real elements would triple the node count of a deep tree for decoration
 * that never takes a pointer — and this tree is diffed on every selection.
 */
.de-layer::before {
  content: ""; position: absolute; left: 8px; top: 0; bottom: 0;
  width: var(--de-indent, 0px);
  background-image: repeating-linear-gradient(
    to right,
    ${t.color.border} 0 ${t.size.hairline}px,
    transparent ${t.size.hairline}px ${LAYER_INDENT}px
  );
  pointer-events: none;
}
.de-layer:hover { background-color: ${t.color.bgHoverQuiet}; }
/*
 * A selected row is a SOLID band, not the canvas's 18% wash: the panel is the
 * one place a selection has to stay findable while the pointer is elsewhere.
 * Muted is that band with focus outside the tree — still the row you left, no
 * longer competing with whatever now has the caret.
 */
.de-layer[aria-selected="true"] { background-color: ${t.color.rowSelectedMuted}; color: ${t.color.text}; }
.de-layers-tree:focus-within .de-layer[aria-selected="true"] { background-color: ${t.color.rowSelected}; }
.de-layer:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-layer-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; }
.de-layer--component .de-layer-name { color: ${t.color.component}; font-weight: ${t.type.weightValue}; }
.de-layer[aria-selected="true"] .de-layer-name { color: ${t.color.text}; }
.de-layer-twisty {
  width: 14px; height: 14px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer;
}
.de-layer-twisty[aria-expanded="true"] { transform: rotate(90deg); }
/*
 * The type mark. Dim by default so a column of them reads as texture; only the
 * component diamond takes a colour, and it keeps it through selection — the
 * distinction it draws is what the row is, which selection does not change.
 */
.de-layer-icon {
  width: 12px; height: 12px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  color: ${t.color.textDim};
}
.de-layer--component .de-layer-icon { color: ${t.color.component}; }
/* A hidden element still has a row; it just stops competing for the eye. */
.de-layer--hidden .de-layer-name { opacity: 0.5; }
/*
 * The lock and the eye.
 *
 * The strip is always laid out and only ever changes OPACITY — revealing it by
 * mounting it would reflow the name mid-hover, which is exactly the jitter that
 * makes a row feel unclickable. It stays up on a row whose state is not the
 * default, because a lock nobody can see is a lock nobody can undo.
 */
.de-layer-actions {
  display: flex; flex: none; align-items: center; gap: 2px;
  margin-left: 4px;
  opacity: 0;
}
.de-layer:hover .de-layer-actions,
.de-layer:focus-within .de-layer-actions,
.de-layer[aria-selected="true"] .de-layer-actions,
.de-layer--locked .de-layer-actions,
.de-layer--hidden .de-layer-actions { opacity: 1; }
.de-layer-action {
  width: ${t.size.miniSize}px; height: ${t.size.miniSize}px;
  flex: none; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: ${t.radius.sm};
  background: transparent;
  color: ${t.color.textDim};
  cursor: pointer;
}
.de-layer-action:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-layer-action[aria-pressed="true"] { color: ${t.color.text}; }
.de-layer-action:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
/* The drop line rides the boundary between two rows, so it is placed by the
   panel and only coloured here. Accent, never the pink canvas guide: this is a
   commit target in the tree, not a measurement on the page. */
.de-layer-drop {
  position: absolute; right: 4px; height: 2px;
  background: ${t.color.accent};
  border-radius: ${t.radius.sm};
  pointer-events: none;
}

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
.de-layer-menu-row--component { color: ${t.color.component}; font-weight: ${t.type.weightValue}; }
.de-layer-menu-row--component:hover { color: ${t.color.text}; }

`
