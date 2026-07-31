/** Top toolbar strip: tool buttons and text buttons. */

import { tokens as t } from "../tokens"

export const toolbarCss = `/* ---------- toolbar ---------- */
.de-toolbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: ${t.size.toolbarHeight}px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  background: ${t.color.bg};
  border-bottom: 1px solid ${t.color.border};
}
.de-toolbar-spacer { flex: 1; }
.de-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
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
  transition: background ${t.duration.fast} ${t.ease}, color ${t.duration.fast} ${t.ease};
}
.de-tool:hover { background: ${t.color.bgHover}; color: ${t.color.text}; }
.de-tool[aria-pressed="true"] { background: ${t.color.accentSurface}; color: ${t.color.text}; }
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
  transition: background ${t.duration.fast} ${t.ease};
}
.de-button:hover { background: ${t.color.bgHover}; }
.de-button--primary { background: ${t.color.accentSurface}; }
.de-button--primary:hover { background: ${t.color.accentSurfaceHover}; }
.de-button--danger:hover { background: ${t.color.danger}; }
.de-button[disabled] { opacity: 0.4; cursor: default; background: ${t.color.bgRaised}; }
.de-button:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 1px; }

`
