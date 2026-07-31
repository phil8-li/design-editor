/** DOM contract for the quiet UI3 shell and supported-tool inventory. */

import assert from "node:assert/strict"
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
  store: {
    setActiveTool() {},
    getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
    setCanvasTransform() {},
    hasChanges: () => false,
    canUndo: () => false,
    canvasUndo: () => null,
    onCanvasTransformChange() {},
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
assert.ok(label("Scale"))
assert.ok(label("Text"))
assert.ok(label("Measure spacing with Option or Alt"))

let optionsEvents = 0
window.addEventListener("design-editor:open-options", () => optionsEvents += 1)
const variables = Array.from(context.slots.toolbar.querySelectorAll("button")).find(
  (button) => button.textContent === "Variables"
)
variables.click()
assert.equal(optionsEvents, 1)

const actions = Array.from(context.slots.toolbar.querySelectorAll("button")).find(
  (button) => button.textContent === "Actions"
)
actions.click()
const menu = context.slots.toolbar.querySelector(".de-actions-menu")
assert.equal(menu.hidden, false)
assert.match(menu.textContent, /Requires a code-insertion adapter/)
assert.match(menu.textContent, /Frame · Section · Slice/)
assert.match(menu.textContent, /Requires a collaboration store/)
assert.match(menu.textContent, /Dev Mode · Figma Draw/)
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }))
assert.equal(menu.hidden, true)

assert.match(editorModule.shellCss, /bottom:/)
assert.doesNotMatch(editorModule.shellCss, /transition: padding/)
assert.doesNotMatch(editorModule.shellCss, /de-outline--scope/)

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

console.log("17 passed, 0 failed")
process.exit(0)
