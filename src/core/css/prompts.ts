/**
 * The right panel's Change-prompts tab.
 *
 * This is the queue of edits the editor could NOT write to source — the
 * preview-only ledger in `core/change-prompt.ts`. It is a list, not a form, so
 * it borrows the layer row's density rather than the field grid's.
 *
 * Every text run in a row is a single line with an ellipsis. A queued value can
 * be a four-part box-shadow or a data URI, and in a 260px panel one wrapping
 * value pushes the row to four lines and the list stops being scannable — which
 * is the only thing a queue is for. What does not fit is truncated and carried
 * whole in the `title`, and the brief below holds the untruncated text.
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
  display: flex; align-items: flex-start; gap: 4px;
  padding: 5px 4px 6px 8px;
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.bgRaised};
  font-size: ${t.type.body};
  color: ${t.color.text};
  transition: border-color ${t.duration.fast} ${t.ease};
}
.de-prompt:hover { border-color: ${t.color.borderInteractive}; }
.de-prompt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

/* Line one: which thing, and where it lives. */
.de-prompt-where {
  display: flex; align-items: baseline; gap: 5px; min-width: 0;
  font-size: ${t.type.caption};
}
.de-prompt-component {
  flex: 0 1 auto; min-width: 0;
  color: ${t.color.component};
  font-weight: ${t.type.weightValue};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.de-prompt-path {
  flex: 1 1 auto; min-width: 0;
  color: ${t.color.textDim};
  font-family: ${t.font.mono};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Line two: the property, at body size because it is what the row is about. */
.de-prompt-what {
  min-width: 0;
  font-family: ${t.font.mono}; font-size: ${t.type.body};
  color: ${t.color.textMuted};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/*
 * Line three: the transition. The old value shrinks three times as fast as the
 * new one, so when the pair cannot both fit it is the value you are replacing
 * that gives way — the one you just typed is the one you are checking.
 */
.de-prompt-change {
  display: flex; align-items: baseline; gap: 4px; min-width: 0;
  font-family: ${t.font.mono}; font-size: ${t.type.caption};
}
.de-prompt-from, .de-prompt-to {
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.de-prompt-from { flex: 0 3 auto; color: ${t.color.textDim}; }
.de-prompt-arrow { flex: none; color: ${t.color.textDim}; }
.de-prompt-to { flex: 0 1 auto; color: ${t.color.accent}; font-weight: ${t.type.weightValue}; }

/*
 * Always drawn, never revealed on hover. Two of the three things you can do to
 * a queued change are per-row, and an affordance that only exists under the
 * pointer is one a keyboard never finds and a first-time reader never learns.
 */
.de-prompt-row-actions { flex: none; display: inline-flex; align-items: center; gap: 2px; }

/* ---------- the brief, in place ---------- */
.de-prompt-brief {
  flex: none;
  display: flex; flex-direction: column; min-height: 0;
  border-top: 1px solid ${t.color.border};
}
.de-prompt-brief[hidden] { display: none; }
.de-prompt-brief-toggle {
  flex: none;
  height: ${t.size.rowHeight}px;
  display: flex; align-items: center; gap: 4px;
  padding: 0 8px;
  border: none; background: transparent;
  color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightSection};
  text-align: left;
  cursor: pointer;
}
.de-prompt-brief-toggle:hover { background: ${t.color.bgRaised}; }
.de-prompt-brief-toggle:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-prompt-brief-toggle--collapsed .de-chevron { transform: rotate(0deg); }
.de-prompt-brief-hint {
  margin-left: auto;
  color: ${t.color.textDim};
  font-size: ${t.type.caption}; font-weight: ${t.type.weightBody};
}
/*
 * Wrapped rather than scrolled sideways: this is the one place in the tab where
 * the whole value has to be readable, so a line too long for the panel folds
 * instead of hiding. Capped in height so the queue above it keeps most of the
 * pane — the brief is there to be checked, not to be lived in.
 */
.de-prompt-brief-text {
  margin: 0; padding: 8px 10px;
  max-height: 180px; overflow: auto;
  border-top: 1px solid ${t.color.border};
  background: ${t.color.bgSunken};
  color: ${t.color.textMuted};
  font-family: ${t.font.mono}; font-size: ${t.type.caption};
  line-height: 1.55;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.de-prompt-brief-text[hidden] { display: none; }

/* ---------- footer and empty state ---------- */
/*
 * Two rows, not one. "Copy change prompts" beside a count does not fit the
 * 260px panel: side by side the label wrapped and the second line fell out of
 * the button — seen in a browser at 1440x900. The count takes a line of its
 * own and the actions sit under it, so the button keeps one line at any width.
 */
.de-prompt-footer {
  flex: none;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px;
  padding: 8px;
  border-top: 1px solid ${t.color.border};
}
.de-prompt-count { flex: 1 1 100%; font-size: ${t.type.caption}; color: ${t.color.textDim}; }
.de-prompt-actions { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.de-prompt-actions button { white-space: nowrap; }
.de-prompts-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.de-prompts-empty-glyph { color: ${t.color.accent}; }
.de-prompts-empty-detail { font-size: ${t.type.caption}; text-align: left; }
`
