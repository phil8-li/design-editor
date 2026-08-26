/**
 * The right panel's Change-prompts tab.
 *
 * This is the queue of edits the editor could NOT write to source — the
 * preview-only ledger in `core/change-prompt.ts`. It is a list, not a form, so
 * it borrows the layer row's density rather than the field grid's.
 */

import { tokens as t } from "../tokens"

export const promptsCss = `/* ---------- change prompts ---------- */
.de-prompts {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
}
.de-prompts-list {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 6px;
  display: flex; flex-direction: column; gap: 4px;
}
.de-prompt {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 6px 6px 6px 8px;
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.bgRaised};
  font-size: ${t.type.body};
  color: ${t.color.text};
}
.de-prompt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.de-prompt-where {
  font-size: ${t.type.caption};
  color: ${t.color.textDim};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.de-prompt-what { font-family: ${t.font.mono}; font-size: ${t.type.caption}; }
.de-prompt-what b { color: ${t.color.accent}; font-weight: ${t.type.weightValue}; }
.de-prompt-footer {
  flex: none;
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 8px;
  border-top: 1px solid ${t.color.border};
}
.de-prompt-count { font-size: ${t.type.caption}; color: ${t.color.textDim}; }
.de-prompt-actions { display: inline-flex; align-items: center; gap: 4px; }
`
