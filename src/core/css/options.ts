/** Saved option rows, the design-options browser, and the AI prompt panel. */

import { tokens as t, accentFill } from "../tokens"

export const optionsCss = `/* ---------- options / variants ---------- */
.de-option-row { display: flex; align-items: center; gap: 2px; }
.de-option {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 6px;
  height: ${t.size.rowHeight}px; padding: 0 4px 0 6px;
  border-radius: ${t.radius.md};
  cursor: pointer;
}
.de-option:hover { background: ${t.color.bgHover}; }
.de-option[aria-checked="true"] { background: ${t.color.accentSoft}; box-shadow: inset 0 0 0 1px ${t.color.accent}; }
.de-option-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
/*
 * Visible at rest. It used to be \`opacity: 0\` until hover, which meant the one
 * verb this panel actually supports was invisible to anyone reading the screen.
 */
.de-option-delete {
  width: 18px; height: 18px; flex: none;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim}; cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-option-delete:hover, .de-option-delete:focus-visible { background: ${t.color.danger}; color: ${t.color.text}; }

/* ---------- design options browser ---------- */
[data-design-editor].de-options-root {
  position: fixed;
  left: calc(var(--de-left) + 10px);
  bottom: 10px;
  z-index: 2147483100;
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  pointer-events: none;
}
.de-options-root > * { pointer-events: auto; }

.de-options-root .de-opt-launcher {
  order: 2;
  height: 28px; padding: 0 12px;
  border: 1px solid ${t.color.borderInteractive}; border-radius: ${t.radius.xl};
  background: ${t.color.bgRaised}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
  box-shadow: ${t.shadow.panel};
  cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease};
}
.de-options-root .de-opt-launcher:hover { background: ${t.color.bgHover}; }
.de-options-root .de-opt-launcher[aria-expanded="true"] { ${accentFill} border-color: ${t.color.accent}; }
.de-options-root .de-opt-launcher:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 2px; }

.de-options-root .de-opt-window {
  order: 1;
  width: 460px;
  max-width: calc(100vw - var(--de-left) - var(--de-right) - 20px);
  max-height: min(72vh, 720px);
  display: flex; flex-direction: column;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.lg};
  background: ${t.color.bg};
  box-shadow: ${t.shadow.popover};
  overflow: hidden;
}
.de-options-root .de-opt-window[hidden] { display: none; }

.de-opt-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 34px; padding: 0 6px 0 12px;
  border-bottom: 1px solid ${t.color.border};
}
.de-opt-title { font-size: ${t.type.body}; font-weight: ${t.type.weightSection}; }
.de-opt-close {
  width: 22px; height: 22px;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim};
  font-size: 14px; line-height: 1; cursor: pointer;
}
.de-opt-close:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }

.de-opt-tabs { display: flex; gap: 2px; padding: 6px 8px 0; }
.de-opt-tab {
  height: 24px; padding: 0 10px;
  border: none; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.textMuted};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightValue}; cursor: pointer;
}
.de-opt-tab:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-opt-tab[aria-pressed="true"] { ${accentFill} }
.de-opt-tab:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

.de-opt-filter {
  margin: 8px; padding: 0 8px;
  height: ${t.size.rowHeight}px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
  background: ${t.color.bgSunken}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body};
  outline: none;
}
.de-opt-filter:focus { border-color: ${t.color.accent}; }
.de-opt-filter::-webkit-search-cancel-button { filter: invert(1); opacity: 0.5; }

.de-opt-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.de-opt-scroll::-webkit-scrollbar { width: 8px; }
.de-opt-scroll::-webkit-scrollbar-thumb {
  background: transparent; border-radius: ${t.radius.md};
  border: 2px solid transparent; background-clip: content-box;
}
.de-opt-scroll:hover::-webkit-scrollbar-thumb { background: ${t.color.borderStrong}; background-clip: content-box; }

.de-opt-body { display: flex; flex-direction: column; padding: 0 8px 10px; }
.de-opt-note {
  margin: 0 0 8px; padding: 6px 8px;
  border-left: 2px solid ${t.color.borderStrong}; border-radius: ${t.radius.sm};
  background: ${t.color.bgSunken};
  color: ${t.color.textMuted}; font-size: ${t.type.caption}; line-height: 1.5;
}

.de-opt-folder { border-top: 1px solid ${t.color.border}; }
.de-opt-summary {
  display: flex; align-items: center; gap: 8px;
  height: 28px; padding: 0 4px;
  cursor: pointer; list-style: none;
  font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
}
.de-opt-summary::-webkit-details-marker { display: none; }
.de-opt-summary::before {
  content: "▸";
  color: ${t.color.textDim}; font-size: ${t.type.micro};
  transition: transform ${t.duration.fast} ${t.ease};
}
.de-opt-folder[open] > .de-opt-summary::before { transform: rotate(90deg); }
.de-opt-summary:hover { background: ${t.color.bgHover}; }
.de-opt-folder-name { flex: none; }
.de-opt-count { flex: 1; color: ${t.color.textDim}; font-size: ${t.type.caption}; font-weight: ${t.type.weightBody}; }
.de-opt-folder-body { padding: 0 0 6px 14px; display: flex; flex-direction: column; gap: 2px; }
/* Only the inspector's inline copy scrolls. The options browser is a full-height
   list of its own and must keep growing. */
.de-opt-folder--inline > .de-opt-folder-body { max-height: 260px; overflow-y: auto; }

.de-opt-row {
  display: flex; flex-direction: column; gap: 3px;
  padding: 6px 6px 7px;
  border-radius: ${t.radius.md};
}
.de-opt-row:hover { background: ${t.color.bgSunken}; }
.de-opt-row[data-hidden] { opacity: 0.55; }
.de-opt-head { display: flex; align-items: baseline; gap: 6px; }
.de-opt-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.de-opt-type { color: ${t.color.textDim}; font-size: ${t.type.micro}; text-transform: uppercase; letter-spacing: 0.04em; }
.de-opt-tag {
  padding: 0 4px;
  border-radius: ${t.radius.sm};
  background: ${t.color.bgHover}; color: ${t.color.textMuted};
  font-size: ${t.type.micro}; font-weight: ${t.type.weightValue};
}
.de-opt-tag--saved { background: ${t.color.accentSoft}; color: ${t.color.text}; }
.de-opt-path {
  font-family: ${t.font.mono}; font-size: ${t.type.micro};
  color: ${t.color.textDim}; word-break: break-all;
}
.de-opt-value { color: ${t.color.textMuted}; font-family: ${t.font.mono}; font-size: ${t.type.caption}; }
.de-opt-check { display: inline-flex; align-items: center; gap: 6px; color: ${t.color.textMuted}; cursor: pointer; }
.de-opt-input {
  height: 20px; padding: 0 6px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.sm};
  background: ${t.color.bgSunken}; color: ${t.color.text};
  font-family: ${t.font.mono}; font-size: ${t.type.caption};
  outline: none;
}
.de-opt-input:focus { border-color: ${t.color.accent}; }

/* The variant list is the answer to "what options do we have?" — always shown. */
.de-opt-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.de-opt-chip {
  padding: 1px 7px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.xl};
  background: ${t.color.bgRaised}; color: ${t.color.textMuted};
  font-family: inherit; font-size: ${t.type.caption}; cursor: pointer;
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-opt-chip:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-opt-chip[aria-pressed="true"] {
  ${accentFill} border-color: ${t.color.accent};
}
.de-opt-chip:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

.de-opt-actions { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; }
.de-opt-row--variant { border: 1px solid ${t.color.border}; }

.de-opt-whywrap { display: flex; flex-direction: column; gap: 4px; }
.de-opt-link {
  align-self: flex-start;
  padding: 0; border: none; background: transparent;
  color: ${t.color.textDim};
  font-family: inherit; font-size: ${t.type.caption}; text-decoration: underline;
  text-underline-offset: 2px; cursor: pointer;
}
.de-opt-link:hover { color: ${t.color.text}; }
.de-opt-link:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 2px; }
.de-opt-why {
  margin: 0; padding: 6px 8px;
  border-radius: ${t.radius.sm};
  background: ${t.color.bgSunken}; color: ${t.color.textMuted};
  font-size: ${t.type.caption}; line-height: 1.5;
}
.de-opt-why[hidden] { display: none; }

/* ---------- ai ---------- */
.de-ai-input {
  width: 100%; min-height: 60px; resize: vertical;
  padding: 6px 8px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
  background: ${t.color.bgSunken}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; line-height: 1.45;
  outline: none;
}
.de-ai-input:focus { border-color: ${t.color.accent}; }
.de-ai-status { color: ${t.color.textDim}; font-size: ${t.type.caption}; line-height: 1.5; white-space: pre-wrap; }
.de-ai-status[data-state="error"] { color: ${t.color.danger}; }

`
