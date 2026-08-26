/**
 * The right panel's tab strip and its panes.
 *
 * The inspector stopped being one scroll of sections when it grew a Code view
 * and a Change-prompts view: those two are not sections you scroll past, they
 * are other things to be looking at. So the panel body becomes a fixed strip
 * plus one scrolling pane, rather than a single scroll with a sticky header —
 * a sticky header would put the code view's own footer at the bottom of a
 * scroll it does not control.
 *
 * Only the RIGHT panel is re-laid out here. The left panel is still one list
 * and still scrolls as a whole.
 */

import { tokens as t } from "../tokens"

export const inspectorCss = `/* ---------- inspector tabs ---------- */
.de-panel--right .de-panel-body {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.de-tabs {
  flex: none;
  display: flex; align-items: center; gap: 2px;
  height: ${t.size.tabBar}px;
  padding: 0 6px;
  border-bottom: 1px solid ${t.color.border};
}
.de-tab {
  position: relative;
  display: inline-flex; align-items: center; gap: 4px;
  height: 100%;
  padding: 0 7px;
  border: none; background: transparent;
  color: ${t.color.textDim};
  font-family: inherit; font-size: ${t.type.body}; font-weight: ${t.type.weightBody};
  cursor: pointer;
}
.de-tab:hover { color: ${t.color.text}; }
.de-tab[aria-selected="true"] { color: ${t.color.text}; font-weight: ${t.type.weightSection}; }
/*
 * The underline sits on the strip's own border, not under the label, so the
 * selected tab reads as continuous with the pane below it.
 */
.de-tab::after {
  content: "";
  position: absolute; left: 4px; right: 4px; bottom: -1px;
  height: 2px; border-radius: 1px;
  background: transparent;
}
.de-tab[aria-selected="true"]::after { background: ${t.color.accent}; }
.de-tab:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -3px; }
.de-tab svg { flex: none; }

.de-tabpanel {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overscroll-behavior: contain;
}
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-tabpanel[hidden] { display: none; }
.de-tabpanel::-webkit-scrollbar { width: 8px; }
.de-tabpanel::-webkit-scrollbar-thumb {
  background: transparent; border-radius: ${t.radius.md};
  border: 2px solid transparent; background-clip: content-box;
}
.de-tabpanel:hover::-webkit-scrollbar-thumb {
  background: ${t.color.borderStrong}; background-clip: content-box;
}
`
