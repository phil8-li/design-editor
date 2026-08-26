/** The right panel's Code tab: header, the code view itself, and its footer. */

import { tokens as t } from "../tokens"

export const codeCss = `/* ---------- code tab ---------- */
.de-code {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
}
.de-code-header {
  flex: none;
  display: flex; align-items: center; gap: 6px;
  padding: 8px;
  border-bottom: 1px solid ${t.color.border};
}
.de-code-view {
  flex: 1; min-height: 0;
  margin: 0; padding: 10px;
  overflow: auto;
  background: ${t.color.bgSunken};
  color: ${t.color.text};
  font-family: ${t.font.mono};
  font-size: ${t.type.body};
  line-height: 1.55;
  tab-size: 2;
  white-space: pre;
}
.de-code-tag { color: ${t.code.tag}; }
.de-code-attribute { color: ${t.code.attribute}; }
.de-code-string { color: ${t.code.string}; }
.de-code-number { color: ${t.code.number}; }
.de-code-punctuation { color: ${t.code.punctuation}; }
.de-code-footer {
  flex: none;
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 8px;
  border-top: 1px solid ${t.color.border};
}
.de-code-status { font-size: ${t.type.caption}; color: ${t.color.textDim}; }
.de-code-status--success { color: ${t.color.success}; }
.de-code-status--error { color: ${t.color.danger}; }
.de-code-actions { display: inline-flex; align-items: center; gap: 4px; }
`
