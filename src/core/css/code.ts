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
/* The picker takes the row; the file reference keeps whatever is left. */
.de-code-header .de-select { flex: 1; min-width: 0; }
.de-code-source {
  flex: none; max-width: 50%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ${t.font.mono};
  font-size: ${t.type.caption};
  color: ${t.color.textDim};
}
/* Stands in for the code view, so it has to fill the same slot. */
.de-code .de-empty { flex: 1; min-height: 0; }
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
/*
 * One row per logical line, numbered in a gutter, wrapping in place.
 *
 * A 260px panel cannot show a JSX line: at 1440x900 a data-URI src and a
 * sentence of body copy both ran off the right edge with nothing to say they
 * had. Wrapping is the only way the content is all readable, and once a line
 * can occupy several rows it needs a number to still read as one line — which
 * is what open-pencil's view does too.
 *
 * The number is ::before content, so selecting the view and copying it takes
 * the code and leaves the gutter behind. It counts lines in THIS view, not in
 * the file; the file's own line is in the header beside the name.
 */
.de-code-line {
  display: grid; grid-template-columns: 2ch 1fr; gap: 10px;
}
.de-code-line::before {
  content: attr(data-line);
  text-align: right;
  color: ${t.color.textDim};
  user-select: none; -webkit-user-select: none;
}
.de-code-text { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
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
