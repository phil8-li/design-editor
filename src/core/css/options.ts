/** Saved option rows and the AI prompt panel. */

import { tokens as t } from "../tokens"

export const optionsCss = `/* ---------- options / variants ---------- */
.de-option {
  display: flex; align-items: center; gap: 6px;
  height: ${t.size.rowHeight}px; padding: 0 4px 0 6px;
  border-radius: ${t.radius.md};
  cursor: pointer;
}
.de-option:hover { background: ${t.color.bgHover}; }
.de-option[aria-checked="true"] { background: ${t.color.accentSoft}; box-shadow: inset 0 0 0 1px ${t.color.accent}; }
.de-option-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.de-option-delete {
  width: 18px; height: 18px; flex: none;
  border: none; border-radius: ${t.radius.sm};
  background: transparent; color: ${t.color.textDim}; cursor: pointer;
  opacity: 0; transition: opacity ${t.duration.fast} ${t.ease};
}
.de-option:hover .de-option-delete, .de-option-delete:focus-visible { opacity: 1; }
.de-option-delete:hover { background: ${t.color.danger}; color: ${t.color.text}; }

/* ---------- ai ---------- */
.de-ai-input {
  width: 100%; min-height: 60px; resize: vertical;
  padding: 6px 8px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
  background: ${t.color.bgSunken}; color: ${t.color.text};
  font-family: inherit; font-size: 11px; line-height: 1.45;
  outline: none;
}
.de-ai-input:focus { border-color: ${t.color.accent}; }
.de-ai-status { color: ${t.color.textDim}; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }
.de-ai-status[data-state="error"] { color: ${t.color.danger}; }

`
