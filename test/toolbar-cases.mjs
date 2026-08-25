/**
 * Bottom-toolbar contract: what it draws, what it must never draw again, and
 * what interactive mode does to a click.
 *
 * The removals are asserted rather than merely deleted because a toolbar is
 * where speculative controls accrete: the zoom stepper, the measure reminder
 * and the capability inventory each arrived as one more button. A test that
 * names them by their rendered text is the cheapest thing that notices one
 * coming back.
 *
 * Usage: node design-editor/test/toolbar-cases.mjs
 */

import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

const dom = new JSDOM(
  '<!doctype html><html><body><main id="app"><button id="cta">Go</button></main></body></html>',
  { pretendToBeVisual: true, url: "http://localhost/" }
)
const { window } = dom
// The resolver hit-tests through `elementsFromPoint`, which jsdom does not
// implement, and reads zero-area rects as hidden. Both are declared here.
window.document.elementsFromPoint = () => window.__stack ?? []
window.Element.prototype.getBoundingClientRect = function box() {
  return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }
}
globalThis.DOMMatrixReadOnly = class {
  constructor() {
    this.m41 = 0
    this.m42 = 0
  }
}
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
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
}

/** One bundle, because the store is a module singleton every lane must share. */
const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { createContext } from "./src/core/context"
      export { installToolbar } from "./src/shell/toolbar"
      export { installCanvas } from "./src/canvas/index"
      export { installInspector } from "./src/panels/inspector/index"
      export { installOptionsBrowser } from "./src/options/inventory-panel"
      export { getState, setState, editorOwnsInput } from "./src/core/store"
      export { toolbarCss } from "./src/core/css/toolbar"
    `,
    resolveDir: path.join(ROOT, "design-editor"),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "silent",
})
const editor = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

const slot = () => {
  const node = window.document.createElement("div")
  node.setAttribute("data-design-editor", "")
  node.className = "de-toolbar"
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
    hasChanges: () => false,
    buildBatchOperations: () => [],
    canUndo: () => false,
    canvasUndo: () => null,
    onStateChange() {},
    getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
    viewportToPage: (x, y) => ({ x, y }),
    pageToViewport: (x, y) => ({ x, y }),
  },
}
const context = editor.createContext(bridge, {
  overlay: slot(),
  toolbar: slot(),
  left: slot(),
  right: slot(),
})
editor.installToolbar(context)
editor.installCanvas(context)

const toolbar = context.slots.toolbar
const buttons = () => Array.from(toolbar.querySelectorAll("button"))
const byText = (text) => buttons().find((button) => button.textContent.trim() === text) ?? null
const byLabel = (name) => toolbar.querySelector(`[aria-label="${name}"]`)

// ── The four removed clusters ──────────────────────────────────────────────

console.log("\nRemoved clusters")

check("the Scale and Text tools are gone", () => {
  assert.equal(byLabel("Scale"), null)
  assert.equal(byLabel("Text"), null)
  // …and the two that survive are still there, so this is not asserting an
  // empty toolbar.
  assert.ok(byLabel("Move"))
  assert.ok(byLabel("Hand (browser scroll)"))
})

check("the zoom cluster is gone, readout and steppers alike", () => {
  assert.doesNotMatch(toolbar.textContent, /%/)
  assert.equal(byLabel("Zoom in"), null)
  assert.equal(byLabel("Zoom out"), null)
  assert.equal(byLabel("Reset zoom to 100%"), null)
})

check("the measure affordance is gone", () => {
  assert.doesNotMatch(toolbar.textContent, /Measure/i)
  assert.doesNotMatch(toolbar.textContent, /Alt/)
  assert.equal(byLabel("Measure spacing with Option or Alt"), null)
})

check("the overflow actions menu and its Variables row are gone", () => {
  assert.equal(toolbar.querySelector(".de-actions-menu"), null)
  assert.equal(toolbar.querySelector(".de-action-row"), null)
  assert.equal(toolbar.querySelector(".de-capability-group"), null)
  assert.equal(byText("Actions"), null)
  assert.equal(byText("Variables"), null)
  assert.doesNotMatch(toolbar.textContent, /Requires a code-insertion adapter/)
})

check("no toolbar button opens a menu any more", () => {
  assert.equal(toolbar.querySelector('[aria-haspopup="dialog"]'), null)
})

// ── What survives ──────────────────────────────────────────────────────────

console.log("\nSurviving controls")

check("move, hand, both panel toggles, undo and apply are all present", () => {
  assert.ok(byLabel("Move"))
  assert.ok(byLabel("Hand (browser scroll)"))
  assert.ok(byLabel("Toggle layers panel"))
  assert.ok(byLabel("Toggle inspector"))
  assert.ok(byText("Undo"))
  assert.ok(byText("Apply to code"))
  assert.ok(byText("Interactive"))
})

check("the panel toggles still flip their store flags", () => {
  const before = context.getState().layersOpen
  byLabel("Toggle layers panel").click()
  assert.equal(context.getState().layersOpen, !before)
  byLabel("Toggle layers panel").click()
  assert.equal(context.getState().layersOpen, before)
})

check("the tool shortcuts still switch tools", () => {
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "h", bubbles: true }))
  assert.equal(context.getState().tool, "hand")
  assert.equal(byLabel("Hand (browser scroll)").getAttribute("aria-pressed"), "true")
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "v", bubbles: true }))
  assert.equal(context.getState().tool, "move")
})

check("the options subsystem still opens from the inspector, not the toolbar", () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
  editor.installOptionsBrowser(context)
  editor.installInspector(context)
  const launcher = Array.from(context.slots.right.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === "Browse controls and options"
  )
  assert.ok(launcher, "inspector empty state must still offer the options entry point")
  launcher.click()
  assert.equal(window.document.querySelector(".de-opt-window").hidden, false)
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  globalThis.fetch = originalFetch
})

// ── Hover text and accessible names ────────────────────────────────────────

console.log("\nTooltips")

check("every icon-only toolbar button has both a tip and an aria-label", () => {
  const iconOnly = buttons().filter((button) => button.textContent.trim() === "")
  assert.ok(iconOnly.length >= 4, "expected the tools and both panel toggles")
  for (const button of iconOnly) {
    const tip = button.getAttribute("data-de-tip")
    const label = button.getAttribute("aria-label")
    assert.ok(tip && tip.length > 0, `missing data-de-tip: ${button.outerHTML}`)
    assert.ok(label && label.length > 0, `missing aria-label: ${button.outerHTML}`)
  }
})

// The tip is a ::after, and CSS generated content joins name-from-content. On a
// button that shows no text that is harmless because the aria-label pins the
// name; on a button that DOES show text, an unpinned name becomes "Undo Undo
// last canvas change". jsdom computes no accessible name, so this asserts the
// thing that makes the name correct rather than the name itself.
check("a tip never leaks into a button's accessible name", () => {
  const tipped = buttons().filter((button) => button.hasAttribute("data-de-tip"))
  assert.ok(tipped.length >= 7, "every control in the bar carries a tip")
  for (const button of tipped) {
    assert.ok(button.getAttribute("aria-label"), `tip without a label: ${button.outerHTML}`)
  }
  for (const text of ["Interactive", "Undo", "Apply to code"]) {
    assert.equal(byText(text).getAttribute("aria-label"), text)
  }
})

check("a tip names the shortcut where the control has one", () => {
  assert.equal(byLabel("Move").getAttribute("data-de-tip"), "Move · V")
  assert.equal(byLabel("Hand (browser scroll)").getAttribute("data-de-tip"), "Hand (browser scroll) · H")
})

check("no toolbar control falls back to the native title attribute", () => {
  for (const button of buttons()) assert.equal(button.getAttribute("title"), null)
})

check("the tip paints above the bar, quietly, and out of the pointer's way", () => {
  const rule = editor.toolbarCss.match(/\.de-toolbar \[data-de-tip\]::after \{[^}]*\}/s)?.[0]
  assert.ok(rule, "the tooltip rule must exist")
  assert.match(rule, /content: attr\(data-de-tip\)/)
  // Below the bar would render off the bottom of the viewport.
  assert.match(rule, /bottom: calc\(100% \+ 8px\)/)
  assert.doesNotMatch(rule, /(^|[^-])top:/)
  assert.match(rule, /pointer-events: none/)
  assert.match(editor.toolbarCss, /:focus-visible::after/)
  assert.match(editor.toolbarCss, /transition-delay: 400ms/)
})

// `transition: none` under the reduced-motion query zeroes transition-property,
// which takes the delay with it and flashes a label at every button the pointer
// crosses. base.ts clamps the duration for the whole chrome already, so this
// file must not restate it.
check("reduced motion drops the fade without dropping the delay", () => {
  assert.doesNotMatch(editor.toolbarCss, /@media[^{]*prefers-reduced-motion/)
})

// ── Interactive mode ───────────────────────────────────────────────────────

console.log("\nInteractive mode")

const interactive = () => byText("Interactive")

check("it defaults to off", () => {
  assert.equal(context.getState().interactive, false)
  assert.equal(interactive().getAttribute("aria-pressed"), "false")
  assert.equal(editor.editorOwnsInput(), true)
})

check("clicking it toggles both the state and aria-pressed", () => {
  interactive().click()
  assert.equal(context.getState().interactive, true)
  assert.equal(interactive().getAttribute("aria-pressed"), "true")
  interactive().click()
  assert.equal(context.getState().interactive, false)
  assert.equal(interactive().getAttribute("aria-pressed"), "false")
})

check("the ON state does not borrow the primary action's fill", () => {
  const rule = (selector) =>
    editor.toolbarCss.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? ""
  const pressed = rule('\\.de-button\\[aria-pressed="true"\\]')
  const primary = rule("\\.de-button--primary")
  assert.ok(pressed, "the pressed rule must exist")
  assert.ok(primary, "the primary rule must exist")
  const background = (block) => block.match(/background: ([^;]+);/)?.[1]
  assert.notEqual(
    background(pressed),
    background(primary),
    "a mode and an action cannot wear the same pill"
  )
  // Accent as ink and as a hairline over a wash of itself.
  assert.match(pressed, /background: color-mix/)
  assert.match(pressed, /box-shadow: inset 0 0 0 1px/)
})

check("the mode sits next to the tools it switches off", () => {
  const groups = Array.from(toolbar.querySelectorAll(".de-toolbar-group"))
  const owner = interactive().closest(".de-toolbar-group")
  assert.equal(groups.indexOf(owner), 1, "the mode follows the tool group directly")
  assert.ok(groups[0].contains(byLabel("Move")))
})

check("turning it on stands the tool cluster down", () => {
  context.setInteractive(true)
  assert.equal(byLabel("Move").disabled, true)
  assert.equal(byLabel("Hand (browser scroll)").disabled, true)
  context.setInteractive(false)
  assert.equal(byLabel("Move").disabled, false)
  assert.equal(byLabel("Hand (browser scroll)").disabled, false)
})

/** Returns whether the canvas swallowed the app's click. */
const clickApp = () => {
  const target = window.document.getElementById("cta")
  window.__stack = [target, window.document.getElementById("app")]
  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 10,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

check("with interactive off a canvas click IS swallowed", () => {
  context.setInteractive(false)
  assert.equal(clickApp(), true)
})

check("with interactive on a canvas click is NOT swallowed", () => {
  context.setInteractive(true)
  assert.equal(clickApp(), false)
})

check("pointer, key and double-click handlers all stand down together", () => {
  const target = window.document.getElementById("cta")
  context.setInteractive(false)
  context.select(null)
  context.setState({ scope: null, hovered: null })
  context.setInteractive(true)

  window.__stack = [target, window.document.getElementById("app")]
  const pointer = (type, init = {}) =>
    target.dispatchEvent(
      new window.PointerEvent(type, { bubbles: true, button: 0, clientX: 10, clientY: 10, ...init })
    )
  pointer("pointermove")
  assert.equal(context.getState().hovered, null, "hover highlight must stay down")
  pointer("pointerdown")
  pointer("pointerup")
  assert.deepEqual(context.getState().selection, [], "a press must not select")
  target.dispatchEvent(
    new window.MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 })
  )
  assert.deepEqual(context.getState().selection, [], "a double-click must not drill")
  assert.equal(context.getState().scope, null)
})

check("tool shortcuts reach the app instead of switching tools", () => {
  context.setInteractive(true)
  context.setTool("move")
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "h", bubbles: true }))
  assert.equal(context.getState().tool, "move")
})

check("leaving the mode hands the canvas back", () => {
  context.setInteractive(false)
  assert.equal(editor.editorOwnsInput(), true)
  assert.equal(clickApp(), true)
  window.__stack = [window.document.getElementById("cta"), window.document.getElementById("app")]
  window.document
    .getElementById("cta")
    .dispatchEvent(
      new window.PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 })
    )
  assert.notEqual(context.getState().hovered, null, "hover must come back")
})

console.log(`\n${passed} passed, ${failed} failed`)
// Installed DOM listeners intentionally live for the editor session.
process.exit(failed > 0 ? 1 : 0)
