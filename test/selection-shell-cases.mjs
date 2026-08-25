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
  "SVGSVGElement",
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
      export { mountShell } from "./src/shell/shell"
      export { setState } from "./src/core/store"
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

/**
 * The pass count is counted, never typed. It used to be a literal at the foot
 * of the file, which meant an edit that removed an assertion could still print
 * a bigger number than the run before it.
 */
let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

const label = (name) => context.slots.toolbar.querySelector(`[aria-label="${name}"]`)

await check("the toolbar draws its two tools and both panel toggles", () => {
  assert.ok(label("Move"))
  assert.ok(label("Hand (browser scroll)"))
  assert.ok(label("Toggle layers panel"))
  assert.ok(label("Toggle inspector"))
})

// The toolbar no longer dispatches the options event — the inspector's empty
// state is now its only in-chrome caller besides the browser's own launcher.
// The subsystem must still be reachable, so this asserts the receiver, not the
// removed sender. Full coverage of the four removed clusters is in
// test/toolbar-cases.mjs.
await check("no overflow menu and no capability inventory", () => {
  const toolbarText = context.slots.toolbar.textContent
  assert.doesNotMatch(toolbarText, /Variables/)
  assert.doesNotMatch(toolbarText, /Actions/)
  assert.equal(context.slots.toolbar.querySelector(".de-actions-menu"), null)
})

await check("the shell keeps its quiet, motionless chrome", () => {
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
})

editorModule.installSelectionFrame(context)

await check("the frame mounts one node pool and nothing else", () => {
  assert.equal(context.slots.overlay.querySelectorAll(".de-outline").length, 2)
  assert.equal(context.slots.overlay.querySelector(".de-badge"), null)
  assert.equal(context.slots.overlay.querySelectorAll("[data-handle]").length, 8)
})

const selectedTarget = window.document.createElement("main")
selectedTarget.getBoundingClientRect = () => new window.DOMRect(20, 30, 100, 60)
window.document.body.append(selectedTarget)
const nextPaint = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
const hoverOutline = context.slots.overlay.querySelector(".de-outline--hover")
const selectionOutline = context.slots.overlay.querySelector(".de-outline:not(.de-outline--hover)")
const selectionHandles = Array.from(context.slots.overlay.querySelectorAll("[data-handle]"))

await check("a hover paints the hover outline and no handles", async () => {
  context.setState({ hovered: selectedTarget, selection: [] })
  await nextPaint()
  assert.equal(hoverOutline.style.display, "block")
  assert.equal(hoverOutline.style.transform, "translate(20px, 30px)")
  assert.equal(selectionOutline.style.display, "none")
  assert.ok(selectionHandles.every((handle) => handle.style.display === "none"))
})

await check("a selection takes the outline over and brings the handles", async () => {
  context.select(selectedTarget)
  await nextPaint()
  assert.equal(hoverOutline.style.display, "none")
  assert.equal(selectionOutline.style.display, "block")
  assert.equal(selectionOutline.style.transform, "translate(20px, 30px)")
  assert.ok(selectionHandles.every((handle) => handle.style.display === "block"))
})

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

await check("the vendor overlay is patched off its own rAF loop", () => {
  assert.match(
    patchedVendor,
    /function qe\(\)\{for\(let e of \[se,j,\.\.\.G\]\)e&&\(e\.current=\{\.\.\.e\.target\},e\.opacity=e\.targetOpacity\);P&&oe&&P\.clearRect/
  )
  assert.doesNotMatch(
    patchedVendor,
    /function qe\(\)\{Yt===null&&\(Yt=requestAnimationFrame\(bs\)\)\}/
  )
})

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
await check("a disabled control disables every input it draws", () => {
  const disabledRow = editorModule.controlRow(disabledControl, context)
  assert.ok(
    Array.from(disabledRow.querySelectorAll(".de-opt-chip")).every((button) => button.disabled)
  )
  const disabledNumber = editorModule.controlRow(
    { ...disabledControl, type: "NUMBER", variants: null, variantValues: null },
    context
  )
  assert.equal(disabledNumber.querySelector(".de-opt-input").disabled, true)
})

await check("the options browser still answers the open event and returns focus", () => {
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
})

/*
 * Interactive mode has two halves, and only one of them was ever ours.
 *
 * The vendor registers a `document`-capture guard that stops every gesture not
 * aimed at its own shadow chrome. Gating the editor's handlers on
 * `editorOwnsInput()` left that guard standing, so with the mode ON an app
 * button received neither pointerdown nor click — measured live before the fix.
 * `restoreChromeFocus` neuters the guard's methods from `window` capture, which
 * runs first; the mode widens that from our chrome to the app.
 */
await check("interactive mode hands the gesture to the app, and only then", () => {
  editorModule.mountShell()

  const appButton = window.document.createElement("button")
  window.document.body.append(appButton)
  let reached = 0
  appButton.addEventListener("pointerdown", () => {
    reached += 1
  })

  // Stands in for the vendor's guard: same node, same phase, same method. It is
  // registered after the shell so the shell's window-capture listener runs first,
  // which is the ordering the real page has.
  window.document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof window.Element && event.target.closest("[data-design-editor]")) return
      event.stopPropagation()
    },
    true
  )

  const press = () =>
    appButton.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true }))

  editorModule.setState({ interactive: false })
  press()
  assert.equal(reached, 0, "the app answered a click while the editor owned input")

  editorModule.setState({ interactive: true })
  press()
  assert.equal(reached, 1, "interactive mode did not reach the app — the vendor guard is still standing")

  editorModule.setState({ interactive: false })
  press()
  assert.equal(reached, 1, "the app stayed reachable after the mode was switched back off")
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
