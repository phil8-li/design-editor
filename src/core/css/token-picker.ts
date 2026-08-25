/**
 * The design-system token picker: field, popover, search, and grouped rows.
 *
 * Its own module so the picker's surface is owned in one place, the way every
 * other lane owns the stylesheet for the surface it draws.
 */

import { tokens as t } from "../tokens"

export const tokenPickerCss = `/* ---------- token field ---------- */
/*
 * The whole row is the target. The old control was a native select whose option
 * text had to spell the token, its source and its value on one line; a button
 * that opens a real list owes the closed state nothing but the name.
 */
.de-token-field {
  display: flex; align-items: center; gap: 6px;
  width: 100%; height: ${t.size.rowHeight}px;
  padding: 0 6px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.text};
  font: inherit; font-size: ${t.type.body}; text-align: left;
  cursor: default;
  transition: background ${t.duration.fast} ${t.ease};
}
.de-token-field:hover { background: ${t.color.bgHoverQuiet}; }
.de-token-field:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }
.de-token-field-name {
  flex: 1; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font-weight: ${t.type.weightBody};
}
/* Nothing is bound, so this is the element's own value rather than a name. */
.de-token-field-name--plain { color: ${t.color.textMuted}; }

/* ---------- the leading 16px slot ---------- */
.de-token-swatch {
  flex: none;
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px;
  border-radius: ${t.radius.sm};
}
/*
 * Inset rather than a border: a border would grow the chip and shift the name,
 * and the ring exists so a near-white token still reads as a chip on the dark
 * chrome instead of dissolving into the surface behind it.
 */
.de-token-swatch--color { box-shadow: inset 0 0 0 1px ${t.color.border}; }
.de-token-swatch--radius { box-shadow: inset 0 0 0 1px ${t.color.borderInteractive}; }
.de-token-swatch--text { font-weight: ${t.type.weightValue}; line-height: 1; }

/* ---------- picker popover ---------- */
.de-token-popover {
  position: fixed;
  z-index: 2147483200;
  width: 264px;
  display: flex; flex-direction: column;
  background: ${t.color.bgRaised};
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.lg};
  box-shadow: ${t.shadow.popover};
  overflow: hidden;
}
.de-token-popover-header {
  display: flex; align-items: center; gap: 6px;
  height: ${t.size.sectionHeader}px; padding: 0 6px 0 10px;
  border-bottom: 1px solid ${t.color.border};
}
.de-token-popover-title {
  flex: 1; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
}
.de-token-search {
  display: flex; align-items: center; gap: 6px;
  padding: 0 10px; height: ${t.size.sectionHeader}px;
  border-bottom: 1px solid ${t.color.border};
  color: ${t.color.textDim};
}
.de-token-search-input {
  flex: 1; min-width: 0;
  border: none; background: transparent;
  color: ${t.color.text};
  font: inherit; font-size: ${t.type.body};
}
.de-token-search-input:focus { outline: none; }
.de-token-search-input::placeholder { color: ${t.color.textDim}; }

.de-token-list { max-height: 320px; overflow-y: auto; padding-bottom: 4px; }
/*
 * Sticky because the leaf names only make sense under their group: scroll the
 * header away and \`Primary\` stops saying which family it belongs to.
 */
.de-token-group {
  position: sticky; top: 0; z-index: 1;
  padding: 8px 10px 4px;
  background: ${t.color.bgRaised};
  color: ${t.color.textDim};
  font-size: ${t.type.caption}; font-weight: ${t.type.weightSection};
}
.de-token-row {
  display: flex; align-items: center; gap: 8px;
  width: 100%; height: 28px; padding: 0 10px;
  border: none; background: transparent;
  color: ${t.color.text};
  font: inherit; font-size: ${t.type.body}; text-align: left;
  cursor: default;
}
.de-token-row-name {
  flex: 1; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.de-token-row-detail { flex: none; color: ${t.color.textDim}; font-variant-numeric: tabular-nums; }
.de-token-row-check { flex: none; display: flex; align-items: center; }
.de-token-row:hover, .de-token-row[data-active="true"] { background: ${t.color.bgHover}; }
/*
 * Full-bleed accent with dark ink. The design system's accent is a LIGHT
 * indigo, so the ink flips instead of the surface darkening — white text here
 * would land at 1.7:1 and vanish.
 */
.de-token-row[aria-selected="true"] { background: ${t.color.accentSurface}; color: ${t.color.onAccent}; }
.de-token-row[aria-selected="true"] .de-token-row-detail { color: ${t.color.onAccent}; }
.de-token-row[aria-disabled="true"] { opacity: 0.4; }
.de-token-empty { padding: 10px; color: ${t.color.textDim}; font-size: ${t.type.body}; }

`
