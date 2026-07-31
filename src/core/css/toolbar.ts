/** Figma UI3-style floating bottom toolbar and its compact action inventory. */

import { tokens as t } from "../tokens"

export const toolbarCss = `/* ---------- toolbar ---------- */
.de-toolbar {
  position: fixed;
  bottom: ${t.size.panelInset}px; left: 50%;
  transform: translateX(-50%);
  height: ${t.size.toolbarHeight}px;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - var(--de-left) - var(--de-right) - 24px);
  padding: 3px 6px;
  background: ${t.color.bg};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.xl};
  box-shadow: ${t.shadow.panel};
  white-space: nowrap;
}
.de-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}
.de-toolbar-group + .de-toolbar-group {
  border-left: 1px solid ${t.color.border};
}

.de-tool {
  width: ${t.size.toolSize}px; height: ${t.size.toolSize}px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.textMuted};
  cursor: pointer;
}
.de-tool:hover { background: ${t.color.bgHoverQuiet}; color: ${t.color.text}; }
.de-tool[aria-pressed="true"] { background: ${t.color.selectionSurface}; color: ${t.color.text}; }
.de-tool:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }
.de-tool[disabled] { opacity: 0.35; cursor: default; }

.de-button {
  height: 24px;
  padding: 0 10px;
  display: inline-flex; align-items: center; gap: 6px;
  border: none; border-radius: ${t.radius.md};
  background: ${t.color.bgRaised}; color: ${t.color.text};
  font-family: inherit; font-size: 11px; font-weight: 500;
  cursor: pointer;
}
.de-button:hover { background: ${t.color.bgHover}; }
.de-button--primary { background: ${t.color.accentSurface}; }
.de-button--primary:hover { background: ${t.color.accentSurfaceHover}; }
.de-button--danger:hover { background: ${t.color.danger}; }
.de-button[disabled] { opacity: 0.4; cursor: default; background: ${t.color.bgRaised}; }
.de-button:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

.de-toolbar-hint {
  height: 24px;
  display: inline-flex; align-items: center;
  padding: 0 6px;
  color: ${t.color.textDim};
  font-size: 10px;
}
.de-actions { position: relative; }
.de-actions-menu {
  position: absolute;
  right: 0; bottom: calc(100% + 8px);
  width: 272px;
  max-height: min(520px, calc(100vh - 72px));
  overflow-y: auto;
  padding: 6px;
  background: ${t.color.bgRaised};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.lg};
  box-shadow: ${t.shadow.popover};
}
.de-actions-menu[hidden] { display: none; }
.de-action-row {
  width: 100%; min-height: 28px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 4px 7px;
  border: none; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.text};
  font: inherit; text-align: left; cursor: pointer;
}
.de-action-row:hover { background: ${t.color.bgHoverQuiet}; }
.de-action-row:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-capability-group { padding: 7px; border-top: 1px solid ${t.color.border}; }
.de-capability-title { color: ${t.color.text}; font-size: 10px; font-weight: 600; }
.de-capability-copy { margin-top: 2px; color: ${t.color.textDim}; font-size: 9px; line-height: 1.45; }

`
