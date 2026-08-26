/** Panel shells, section chrome, and the shared field/select primitives. */

import { tokens as t } from "../tokens"

export const panelsCss = `/* ---------- panels ---------- */
.de-panel {
  position: fixed;
  top: ${t.size.panelInset}px;
  bottom: ${t.size.panelInset}px;
  display: flex;
  flex-direction: column;
  background: ${t.color.bg};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.xl};
  box-shadow: ${t.shadow.panel};
  overflow: hidden;
}
.de-panel--left { left: ${t.size.panelInset}px; width: ${t.size.panelWidth}px; }
.de-panel--right { right: ${t.size.panelInset}px; width: ${t.size.inspectorWidth}px; }
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-panel[hidden] { display: none; }

.de-panel-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.de-panel-body::-webkit-scrollbar { width: 8px; }
.de-panel-body::-webkit-scrollbar-thumb {
  background: transparent; border-radius: ${t.radius.md};
  border: 2px solid transparent; background-clip: content-box;
}
.de-panel-body:hover::-webkit-scrollbar-thumb { background: ${t.color.borderStrong}; background-clip: content-box; }

.de-section { border-bottom: 1px solid ${t.color.border}; }
/*
 * A grid, and the actions column is reserved whether or not the header has an
 * action in it.
 *
 * With \`space-between\` the title of a section that owns a \`+\` sat at the same
 * left edge as one that does not — but the \`+\` itself was the only thing
 * holding the right edge, so Fill's add button and Effects' add button landed
 * wherever their titles left room, and scrolling the panel walked them left
 * and right. A fixed trailing track means every add sits on one line down the
 * panel, and a header without one leaves that line empty rather than closing
 * it up. \`auto\` as the max so a header that grows a second action still fits.
 */
.de-section-header {
  height: ${t.size.sectionHeader}px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(${t.size.miniSize}px, auto);
  align-items: center;
  padding: 0 8px 0 10px;
  color: ${t.color.text};
  font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
}
.de-section-body { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 6px; }
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-section-body[hidden] { display: none; }

.de-section-header--collapsible:hover { background: ${t.color.bgRaised}; }
.de-section-toggle {
  flex: 1; min-width: 0;
  height: 100%;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 0;
  border: none; background: transparent;
  color: inherit; font-family: inherit; font-size: inherit; font-weight: inherit;
  text-align: left;
  cursor: pointer;
}
.de-section-toggle:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-section-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px; }
.de-chevron {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  color: ${t.color.textDim};
  transform: rotate(90deg);
}
.de-section-toggle--collapsed .de-chevron { transform: rotate(0deg); }

/* Vertical rhythm inside a section body — one rule instead of an inline style. */
.de-stack { display: flex; flex-direction: column; gap: 6px; }
.de-layout-group { display: flex; flex-direction: column; gap: 6px; }
.de-layout-group + .de-layout-group {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid ${t.color.border};
}
.de-layout-group-title {
  color: ${t.color.textMuted};
  font-size: ${t.type.caption};
  font-weight: ${t.type.weightSection};
}
.de-hint { color: ${t.color.textDim}; font-size: ${t.type.caption}; line-height: 1.4; }

/* Selection identity: what you picked, and where it lives in the source. */
.de-tagname { color: ${t.color.textDim}; font-weight: ${t.type.weightBody}; }
.de-source { font-size: ${t.type.caption}; color: ${t.color.textDim}; word-break: break-all; }

.de-row { display: flex; align-items: center; gap: 6px; }
.de-row--split { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.de-row--quad { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }

/*
 * Every field rests in a well.
 *
 * These were transparent until hovered, on the theory that a quiet panel is a
 * calm one. It is not: a section of eight numbers with nothing behind them
 * reads as eight pieces of loose text, and you have to sweep the pointer along
 * the column to find out which of them you are allowed to touch. Giving each
 * one a resting surface is what turns the column into a form — the affordance
 * is visible before the pointer arrives, and the row edges align the values
 * for free. Hover lifts the same well rather than drawing a border, so nothing
 * shifts by a pixel on the way in; the border is spent on focus instead, where
 * it is the one state worth an accent.
 *
 * Horizontal padding lives on the *parts*, not here, so the leading label can
 * be a full-height strip you can grab anywhere rather than a word with dead
 * space above and below it.
 */
.de-field {
  display: flex; align-items: center;
  height: ${t.size.rowHeight}px;
  border-radius: ${t.radius.md};
  background: ${t.color.field};
  border: 1px solid transparent;
  overflow: hidden;
  transition: border-color ${t.duration.fast} ${t.ease}, background ${t.duration.fast} ${t.ease};
}
.de-field:hover { background: ${t.color.fieldHover}; }
.de-field:focus-within { background: ${t.color.fieldHover}; border-color: ${t.color.accent}; }
.de-field-label {
  flex: none; align-self: stretch;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 12px;
  padding: 0 6px;
  color: ${t.color.textDim};
  font-size: ${t.type.body};
  user-select: none;
  cursor: ew-resize;
}
.de-field input {
  flex: 1; min-width: 0; width: 100%;
  padding: 0 6px 0 0;
  border: none; background: transparent; outline: none;
  color: ${t.color.text}; font-family: inherit; font-size: ${t.type.body};
}
/* Numbers only: a proportional font walks the digits sideways as you scrub. */
.de-field--numeric input { font-variant-numeric: tabular-nums; }
.de-field input::-webkit-outer-spin-button,
.de-field input::-webkit-inner-spin-button { appearance: none; margin: 0; }
.de-field input[disabled] { color: ${t.color.textDim}; cursor: default; }
.de-field input::placeholder { color: ${t.color.textDim}; }
/* Pushed to the far edge by the flexed input, the way Figma parks a unit. */
.de-field-suffix {
  flex: none;
  padding-right: 6px;
  color: ${t.color.textDim}; font-size: ${t.type.body};
  user-select: none;
}
/* A measured value in a field's clothes — read-only, so it never takes a caret. */
.de-field-value {
  flex: 1; min-width: 0;
  padding-right: 6px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: ${t.color.text}; font-size: ${t.type.body};
  font-variant-numeric: tabular-nums;
  user-select: none;
}

/* ---------- paint rows (fill / stroke / effects) ---------- */
.de-paint-row { display: flex; align-items: center; gap: 4px; }
.de-paint-row .de-field { flex: 1; min-width: 0; }
.de-paint-row .de-select { flex: 1; min-width: 0; }
.de-paint-value {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: ${t.color.textMuted};
  font-family: ${t.font.mono}; font-size: ${t.type.caption};
}
.de-paint-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 4px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
}

/*
 * Ghost buttons: no surface of their own, a surface on hover, an accent
 * OUTLINE when they are holding a state on.
 *
 * The border is transparent at rest rather than absent, so turning one on adds
 * a colour and never a box — a pressed \`+\` used to grow a ring the same frame
 * it changed meaning, and the row under it stepped down a pixel. Outline
 * rather than fill for the on state because these sit inside a section header
 * or a row that already carries a well behind it; a second filled surface at
 * this size reads as a badge, not a toggle.
 */
.de-mini {
  width: ${t.size.miniSize}px; height: ${t.size.miniSize}px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim};
  font-family: inherit; font-size: ${t.type.body}; line-height: 1;
  cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease},
    border-color ${t.duration.fast} ${t.ease};
}
.de-mini:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-mini[aria-pressed="true"] { border-color: ${t.color.accent}; color: ${t.color.accent}; }
.de-mini--danger:hover { background: ${t.color.danger}; color: ${t.color.text}; }
.de-mini[disabled] { opacity: 0.35; cursor: default; background: transparent; }
.de-mini:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

/*
 * The toolbar's icon button, borrowed by inspector sections (align, direction).
 *
 * It is sized for the toolbar, where it is the pointer's first target; in a
 * panel row it has to line up with the 24px fields beside it, and it answers
 * to the same ghost/outline grammar as \`.de-mini\` rather than the toolbar's
 * filled pressed state. Scoped to \`.de-panel\` so the toolbar keeps its own.
 */
.de-panel .de-tool {
  width: ${t.size.rowHeight}px; height: ${t.size.rowHeight}px;
  border: 1px solid transparent;
  color: ${t.color.textDim};
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease},
    border-color ${t.duration.fast} ${t.ease};
}
.de-panel .de-tool:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-panel .de-tool[aria-pressed="true"] {
  background: transparent;
  border-color: ${t.color.accent};
  color: ${t.color.accent};
}

/* ---------- segmented control ---------- */
/*
 * An inset track carrying one lifted pill.
 *
 * The rail is a field well, because that is what the control is: one field
 * whose value happens to be a word from a short list, and it has to sit in a
 * row beside real fields without looking like a different species. The
 * selection was a filled accent, which at this size — three of them stacked in
 * Auto layout — turned the section into a wall of indigo and shouted about
 * defaults nobody chose. A step UP off the rail says "this one" quietly, and
 * the ink going from dim to full carries the rest of the message.
 */
.de-segmented {
  display: flex; align-items: stretch;
  height: ${t.size.rowHeight}px;
  padding: 2px;
  border-radius: ${t.radius.md};
  background: ${t.color.field};
}
.de-segment {
  flex: 1; min-width: 0;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim};
  font-family: inherit; font-size: ${t.type.caption}; line-height: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-segment:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-segment[aria-pressed="true"] {
  background: ${t.color.fieldHover};
  color: ${t.color.text};
  font-weight: ${t.type.weightValue};
}
.de-segment:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -1px; }

/* The same well as \`.de-field\`, since a select is a field you pick from. */
.de-select {
  height: ${t.size.rowHeight}px;
  width: 100%;
  padding: 0 6px;
  border: 1px solid transparent; border-radius: ${t.radius.md};
  background: ${t.color.field}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body};
  appearance: none; cursor: pointer;
  transition: border-color ${t.duration.fast} ${t.ease}, background ${t.duration.fast} ${t.ease};
}
.de-select:hover { background: ${t.color.fieldHover}; }
.de-select:focus { outline: none; background: ${t.color.fieldHover}; border-color: ${t.color.accent}; }
.de-select option { background: ${t.color.bgRaised}; color: ${t.color.text}; }

/*
 * The inspector's last row: actions, not properties.
 *
 * No border of its own. Every section above closes with a bottom hairline, so
 * a border-top here would land against that one and read as a 2px rule — the
 * divider the footer needs is already drawn by whatever sits above it, and the
 * footer is last, so nothing needs closing below.
 */
.de-inspector-footer {
  padding: 8px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
}

.de-empty {
  padding: 24px 16px;
  color: ${t.color.textDim};
  text-align: center;
  font-size: ${t.type.body};
  line-height: 1.5;
}

`
