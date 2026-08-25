/**
 * The instance-properties section: one labelled row per variant axis.
 *
 * A grid rather than a flex row, so `variant` and `size` put their controls on
 * the same left edge however long their names are — the axis names come from
 * the host's source and nothing here can predict their width.
 */

import { tokens as t } from "../tokens"

export const variantsCss = `/* ---------- variant axes ---------- */
.de-variant-axis {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.de-variant-axis-name {
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  color: ${t.color.textMuted};
  font-size: ${t.type.body};
}
/*
 * Said once per selection, not once per session: the pinned rewrite engine has
 * no operation that edits a JSX prop, so choosing an option here writes the
 * classes the option contributes and leaves \`variant="…"\` in the source alone.
 */
.de-variant-note { color: ${t.color.textDim}; font-size: ${t.type.caption}; line-height: 1.4; }
`
