/** Panel shells, section chrome, and the shared field/select primitives. */

import { tokens as t } from "../tokens"

export const panelsCss = `/* ---------- panels ---------- */
.de-panel {
  position: fixed;
  top: ${t.size.toolbarHeight}px;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: ${t.color.bg};
  overflow: hidden;
}
.de-panel--left { left: 0; width: ${t.size.panelWidth}px; border-right: 1px solid ${t.color.border}; }
.de-panel--right { right: 0; width: ${t.size.inspectorWidth}px; border-left: 1px solid ${t.color.border}; }
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
.de-section-header {
  height: ${t.size.sectionHeader}px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px 0 10px;
  color: ${t.color.text};
  font-size: 11px; font-weight: 600;
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
.de-section-actions { display: inline-flex; align-items: center; gap: 2px; }
.de-chevron {
  display: inline-block; width: 10px;
  color: ${t.color.textDim};
  transform: rotate(90deg);
  transition: transform ${t.duration.fast} ${t.ease};
}
.de-section-toggle--collapsed .de-chevron { transform: rotate(0deg); }

/* Vertical rhythm inside a section body — one rule instead of an inline style. */
.de-stack { display: flex; flex-direction: column; gap: 6px; }
.de-hint { color: ${t.color.textDim}; font-size: 10px; line-height: 1.4; }

/* Selection identity: what you picked, and where it lives in the source. */
.de-tagname { color: ${t.color.textDim}; font-weight: 400; }
.de-source { font-size: 10px; color: ${t.color.textDim}; word-break: break-all; }

.de-row { display: flex; align-items: center; gap: 6px; }
.de-row--split { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.de-row--quad { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }

.de-field {
  display: flex; align-items: center; gap: 4px;
  height: ${t.size.rowHeight}px;
  padding: 0 6px;
  border-radius: ${t.radius.md};
  background: transparent;
  border: 1px solid transparent;
  transition: border-color ${t.duration.fast} ${t.ease}, background ${t.duration.fast} ${t.ease};
}
.de-field:hover { border-color: ${t.color.borderInteractive}; }
.de-field:focus-within { border-color: ${t.color.accent}; background: ${t.color.bgSunken}; }
.de-field-label {
  color: ${t.color.textDim};
  font-size: 10px;
  min-width: 12px;
  user-select: none;
  cursor: ew-resize;
}
.de-field input {
  flex: 1; min-width: 0; width: 100%;
  border: none; background: transparent; outline: none;
  color: ${t.color.text}; font-family: inherit; font-size: 11px;
}
.de-field input::-webkit-outer-spin-button,
.de-field input::-webkit-inner-spin-button { appearance: none; margin: 0; }
.de-field input[disabled] { color: ${t.color.textDim}; cursor: default; }
.de-field input::placeholder { color: ${t.color.textDim}; }
.de-field-suffix { color: ${t.color.textDim}; font-size: 10px; user-select: none; }

/* ---------- paint rows (fill / stroke / effects) ---------- */
.de-paint-row { display: flex; align-items: center; gap: 4px; }
.de-paint-row .de-field { flex: 1; min-width: 0; }
.de-paint-row .de-select { flex: 1; min-width: 0; }
.de-paint-value {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: ${t.color.textMuted};
  font-family: ${t.font.mono}; font-size: 10px;
}
.de-paint-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 4px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
}

.de-mini {
  width: ${t.size.miniSize}px; height: ${t.size.miniSize}px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim};
  font-family: inherit; font-size: 11px; line-height: 1;
  cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-mini:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-mini[aria-pressed="true"] { color: ${t.color.accent}; }
.de-mini--danger:hover { background: ${t.color.danger}; color: ${t.color.text}; }
.de-mini[disabled] { opacity: 0.35; cursor: default; background: transparent; }
.de-mini:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

/* ---------- segmented control ---------- */
.de-segmented {
  display: flex; align-items: stretch;
  height: ${t.size.rowHeight}px;
  padding: 2px;
  border-radius: ${t.radius.md};
  background: ${t.color.bgSunken};
}
.de-segment {
  flex: 1; min-width: 0;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim};
  font-family: inherit; font-size: 10px; line-height: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-segment:hover { color: ${t.color.text}; }
.de-segment[aria-pressed="true"] { background: ${t.color.accentSurface}; color: ${t.color.text}; }
.de-segment:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -1px; }

.de-select {
  height: ${t.size.rowHeight}px;
  width: 100%;
  padding: 0 6px;
  border: 1px solid transparent; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.text};
  font-family: inherit; font-size: 11px;
  appearance: none; cursor: pointer;
}
.de-select:hover { border-color: ${t.color.borderInteractive}; }
.de-select:focus { outline: none; border-color: ${t.color.accent}; }
.de-select option { background: ${t.color.bgRaised}; color: ${t.color.text}; }

.de-empty {
  padding: 24px 16px;
  color: ${t.color.textDim};
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
}

`
