/** DOM contract for the quiet UI3 shell and supported-tool inventory. */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
const { window } = dom
for (const key of [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "PointerEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
}

const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { createContext } from "./src/core/context"
      export { installSelectionFrame } from "./src/canvas/selection"
      export { installToolbar } from "./src/shell/toolbar"
      export { controlRow, installOptionsBrowser } from "./src/options/inventory-panel"
      export { shellCss } from "./src/core/css"
    `,
    resolveDir: path.join(ROOT, "design-editor"),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "silent",
})
const editorModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

const slot = () => {
  const node = window.document.createElement("div")
  node.setAttribute("data-design-editor", "")
  window.document.body.append(node)
  return node
}
const bridge = {
  elementInfo: () => null,
  send() {},
  toast() {},
  subscribe: () => () => {},
  // No canvas-transform members: the toolbar's zoom cluster is gone, and a
  // stub for it here would let one grow back unnoticed.
  store: {
    setActiveTool() {},
    hasChanges: () => false,
    canUndo: () => false,
    canvasUndo: () => null,
    onStateChange() {},
  },
}
const context = editorModule.createContext(bridge, {
  overlay: slot(),
  toolbar: slot(),
  left: slot(),
  right: slot(),
})
editorModule.installToolbar(context)

const label = (name) => context.slots.toolbar.querySelector(`[aria-label="${name}"]`)
assert.ok(label("Move"))
assert.ok(label("Hand (browser scroll)"))
assert.ok(label("Toggle layers panel"))
assert.ok(label("Toggle inspector"))

// The toolbar no longer dispatches the options event — the inspector's empty
// state is now its only in-chrome caller besides the browser's own launcher.
// The subsystem must still be reachable, so this asserts the receiver, not the
// removed sender. Full coverage of the four removed clusters is in
// test/toolbar-cases.mjs.
const toolbarText = context.slots.toolbar.textContent
assert.doesNotMatch(toolbarText, /Variables/)
assert.doesNotMatch(toolbarText, /Actions/)
assert.equal(context.slots.toolbar.querySelector(".de-actions-menu"), null)

assert.match(editorModule.shellCss, /bottom:/)
assert.doesNotMatch(editorModule.shellCss, /transition: padding/)
assert.doesNotMatch(editorModule.shellCss, /de-outline--scope/)
assert.match(
  editorModule.shellCss,
  /\.de-outline\s*\{[^}]*transition: none;[^}]*animation: none;/s
)
assert.match(editorModule.shellCss, /\.de-outline--hover\s*\{[^}]*opacity: 1;/s)
assert.doesNotMatch(editorModule.shellCss, /\.de-outline--hover\s*\{[^}]*opacity: 0\.48;/s)
assert.match(
  editorModule.shellCss,
  /\.de-handle\s*\{[^}]*border-radius: 0;[^}]*transition: none;[^}]*animation: none;/s
)
assert.match(editorModule.shellCss, /\.de-layer\s*\{[^}]*transition: none;[^}]*animation: none;/s)

editorModule.installSelectionFrame(context)
assert.equal(context.slots.overlay.querySelectorAll(".de-outline").length, 2)
assert.equal(context.slots.overlay.querySelector(".de-badge"), null)
assert.equal(context.slots.overlay.querySelectorAll("[data-handle]").length, 8)

const selectedTarget = window.document.createElement("main")
selectedTarget.getBoundingClientRect = () => new window.DOMRect(20, 30, 100, 60)
window.document.body.append(selectedTarget)
const nextPaint = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
const hoverOutline = context.slots.overlay.querySelector(".de-outline--hover")
const selectionOutline = context.slots.overlay.querySelector(".de-outline:not(.de-outline--hover)")
const selectionHandles = Array.from(context.slots.overlay.querySelectorAll("[data-handle]"))

context.setState({ hovered: selectedTarget, selection: [] })
await nextPaint()
assert.equal(hoverOutline.style.display, "block")
assert.equal(hoverOutline.style.transform, "translate(20px, 30px)")
assert.equal(selectionOutline.style.display, "none")
assert.ok(selectionHandles.every((handle) => handle.style.display === "none"))

context.select(selectedTarget)
await nextPaint()
assert.equal(hoverOutline.style.display, "none")
assert.equal(selectionOutline.style.display, "block")
assert.equal(selectionOutline.style.transform, "translate(20px, 30px)")
assert.ok(selectionHandles.every((handle) => handle.style.display === "block"))

context.select(null)
context.setState({ hovered: null })
selectedTarget.remove()

const { resolveConfig } = await import(path.join(ROOT, "design-editor/config.mjs"))
const { patchOverlay } = await import(path.join(ROOT, "design-editor/runtime/vendor-patch.mjs"))
const vendorSource = await fs.readFile(
  path.join(ROOT, "node_modules/react-rewrite-cli/dist/overlay.js"),
  "utf8"
)
const patchedVendor = patchOverlay(vendorSource, resolveConfig({}, { cwd: ROOT }))
assert.match(
  patchedVendor,
  /function qe\(\)\{for\(let e of \[se,j,\.\.\.G\]\)e&&\(e\.current=\{\.\.\.e\.target\},e\.opacity=e\.targetOpacity\);P&&oe&&P\.clearRect/
)
assert.doesNotMatch(
  patchedVendor,
  /function qe\(\)\{Yt===null&&\(Yt=requestAnimationFrame\(bs\)\)\}/
)

const disabledControl = {
  path: "Cards.Layout.gap",
  key: "gap",
  label: "Gap",
  type: "SELECT",
  value: 8,
  valueText: "8",
  variants: ["Compact", "Comfortable"],
  variantValues: [8, 16],
  bounds: null,
  disabled: true,
  visible: true,
  selectors: [],
  relationship: null,
  defaultGroup: null,
  defaultKey: null,
  canPersistDefault: false,
}
const disabledRow = editorModule.controlRow(disabledControl, context)
assert.ok(Array.from(disabledRow.querySelectorAll(".de-opt-chip")).every((button) => button.disabled))

const disabledNumber = editorModule.controlRow(
  { ...disabledControl, type: "NUMBER", variants: null, variantValues: null },
  context
)
assert.equal(disabledNumber.querySelector(".de-opt-input").disabled, true)

const originalFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
editorModule.installOptionsBrowser(context)
const returnTarget = window.document.createElement("button")
window.document.body.append(returnTarget)
returnTarget.focus()
window.dispatchEvent(new window.CustomEvent("design-editor:open-options"))
const optionsPanel = window.document.querySelector(".de-opt-window")
assert.equal(optionsPanel.hidden, false)
assert.equal(window.document.activeElement?.className, "de-opt-filter")
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
assert.equal(optionsPanel.hidden, true)
assert.equal(window.document.activeElement, returnTarget)
globalThis.fetch = originalFetch

console.log("34 passed, 0 failed")
process.exit(0)
