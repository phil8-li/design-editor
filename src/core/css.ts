/**
 * The shell stylesheet.
 *
 * Scoped under `[data-design-editor]` so it can never leak into the app being
 * edited, and the app's own cascade can never reach in.
 */

import { tokens as t } from "./tokens"

export const shellCss = `
:root {
  --de-left: 0px;
  --de-right: 0px;
  --de-top: 0px;
}

/*
 * The vendored React Rewrite overlay stays loaded — we drive it headlessly for
 * fiber -> source resolution and source writes — but its chrome is replaced by
 * ours. Its toasts, drag preview, and drop indicator stay: we call into them.
 */
#react-rewrite-root .prop-sidebar,
#react-rewrite-root .toolbar,
#react-rewrite-root .tools-panel,
#react-rewrite-root .selection-label,
#react-rewrite-root .changelog-panel,
#react-rewrite-root .changelog-badge,
#react-rewrite-root .help-btn,
#react-rewrite-root .shortcuts-overlay {
  display: none !important;
}

/*
 * Inset the app so the chrome never covers what you are editing.
 *
 * Padding on a border-box <html> rather than margins on <body>: the app sets
 * \`html.h-full\` + \`body.min-h-full\`, so a body margin would be *added* to a
 * height that already fills the viewport and put every page into overflow.
 * Padding inside a border-box root shrinks the containing block instead.
 *
 * Not a transform — a transformed ancestor would break the app's own layoutId
 * shared-element morphs (docs/agent-rules/card-reader-morph.md). The tradeoff
 * is that the app's own \`position: fixed\` chrome is viewport-anchored and does
 * not move with the inset; that is inherent to any non-transform inset.
 */
html.design-editor-active {
  box-sizing: border-box;
  padding: var(--de-top) var(--de-right) 0 var(--de-left);
  transition: padding ${t.duration.base} ${t.ease};
}

@media (prefers-reduced-motion: reduce) {
  html.design-editor-active { transition: none !important; }
  [data-design-editor] *, [data-design-editor] *::before, [data-design-editor] *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}

[data-design-editor] {
  box-sizing: border-box;
  font-family: ${t.font.ui};
  font-size: 11px;
  line-height: 16px;
  color: ${t.color.text};
  -webkit-font-smoothing: antialiased;
}
[data-design-editor] *, [data-design-editor] *::before, [data-design-editor] *::after {
  box-sizing: border-box;
}

.de-root {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.de-root > * { pointer-events: auto; }

/*
 * Inside .de-root's stacking context, canvas chrome sits below the panels.
 * Without an explicit order the positive-z overlay layer would paint over the
 * toolbar, and its handles would swallow toolbar clicks.
 */
.de-overlay-layer { z-index: 1; }
.de-toolbar, .de-panel { z-index: 2; }

/* ---------- toolbar ---------- */
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

/* ---------- panels ---------- */
.de-panel {
  position: fixed;
  top: ${t.size.toolbarHeight}px;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: ${t.color.bg};
  overflow: hidden;
}
.de-panel--left { left: 0; width: ${t.size.panelWidth}px; border-right: 1px solid ${t.color.border}; }
.de-panel--right { right: 0; width: ${t.size.inspectorWidth}px; border-left: 1px solid ${t.color.border}; }
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-panel[hidden] { display: none; }

.de-panel-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.de-panel-body::-webkit-scrollbar { width: 8px; }
.de-panel-body::-webkit-scrollbar-thumb {
  background: transparent; border-radius: ${t.radius.md};
  border: 2px solid transparent; background-clip: content-box;
}
.de-panel-body:hover::-webkit-scrollbar-thumb { background: ${t.color.borderStrong}; background-clip: content-box; }

.de-section { border-bottom: 1px solid ${t.color.border}; }
.de-section-header {
  height: 32px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px 0 10px;
  color: ${t.color.text};
  font-size: 11px; font-weight: 600;
}
.de-section-body { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 6px; }

/* Selection identity: what you picked, and where it lives in the source. */
.de-tagname { color: ${t.color.textDim}; font-weight: 400; }
.de-source { font-size: 10px; color: ${t.color.textDim}; word-break: break-all; }

.de-row { display: flex; align-items: center; gap: 6px; }
.de-row--split { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.de-row--quad { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }

.de-field {
  display: flex; align-items: center; gap: 4px;
  height: ${t.size.rowHeight}px;
  padding: 0 6px;
  border-radius: ${t.radius.md};
  background: transparent;
  border: 1px solid transparent;
  transition: border-color ${t.duration.fast} ${t.ease}, background ${t.duration.fast} ${t.ease};
}
.de-field:hover { border-color: ${t.color.borderInteractive}; }
.de-field:focus-within { border-color: ${t.color.accent}; background: ${t.color.bgSunken}; }
.de-field-label {
  color: ${t.color.textDim};
  font-size: 10px;
  min-width: 12px;
  user-select: none;
  cursor: ew-resize;
}
.de-field input {
  flex: 1; min-width: 0; width: 100%;
  border: none; background: transparent; outline: none;
  color: ${t.color.text}; font-family: inherit; font-size: 11px;
}
.de-field input::-webkit-outer-spin-button,
.de-field input::-webkit-inner-spin-button { appearance: none; margin: 0; }

.de-select {
  height: ${t.size.rowHeight}px;
  width: 100%;
  padding: 0 6px;
  border: 1px solid transparent; border-radius: ${t.radius.md};
  background: transparent; color: ${t.color.text};
  font-family: inherit; font-size: 11px;
  appearance: none; cursor: pointer;
}
.de-select:hover { border-color: ${t.color.borderInteractive}; }
.de-select:focus { outline: none; border-color: ${t.color.accent}; }
.de-select option { background: ${t.color.bgRaised}; color: ${t.color.text}; }

.de-empty {
  padding: 24px 16px;
  color: ${t.color.textDim};
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
}

/* ---------- layers ---------- */
.de-layer {
  display: flex; align-items: center; gap: 4px;
  height: ${t.size.rowHeight}px;
  padding-right: 8px;
  color: ${t.color.textMuted};
  cursor: default;
  white-space: nowrap;
}
.de-layer:hover { background: ${t.color.bgHover}; }
.de-layer[aria-selected="true"] { background: ${t.color.accentSurface}; color: ${t.color.text}; }
.de-layer-name { overflow: hidden; text-overflow: ellipsis; }
.de-layer--component .de-layer-name { color: ${t.color.component}; font-weight: 500; }
.de-layer[aria-selected="true"] .de-layer-name { color: ${t.color.text}; }
.de-layer-twisty {
  width: 14px; height: 14px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer;
  transition: transform ${t.duration.fast} ${t.ease};
}
.de-layer-twisty[aria-expanded="true"] { transform: rotate(90deg); }

/* ---------- options / variants ---------- */
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

/* ---------- canvas chrome ---------- */
.de-overlay-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147482000; }
.de-outline {
  position: absolute;
  border: ${t.size.hairline}px solid ${t.color.accent};
  pointer-events: none;
}
.de-outline--hover { border-style: solid; opacity: 0.7; }
.de-outline--autolayout { border-color: ${t.color.autoLayout}; }
.de-handle {
  position: absolute;
  width: 7px; height: 7px;
  margin: -4px 0 0 -4px;
  border: ${t.size.hairline}px solid ${t.color.accent};
  border-radius: ${t.radius.sm};
  background: ${t.color.text};
  pointer-events: auto;
}
.de-guide { position: absolute; background: ${t.color.guide}; pointer-events: none; }
.de-badge {
  position: absolute;
  padding: 1px 5px;
  border-radius: ${t.radius.sm};
  background: ${t.color.accentSurface};
  color: ${t.color.text};
  font-family: ${t.font.ui};
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
  pointer-events: none;
}
.de-badge--measure { background: ${t.color.measure}; }
.de-marquee {
  position: absolute;
  border: ${t.size.hairline}px solid ${t.color.accent};
  background: ${t.color.accentSoft};
  pointer-events: none;
}
`
