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
  height: 32px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px 0 10px;
  color: ${t.color.text};
  font-size: 11px; font-weight: 600;
}
.de-section-body { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 6px; }

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
