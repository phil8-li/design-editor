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
  "SVGSVGElement",
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
/** The mode switch is the one control whose accessible name changes. */
const mode = () => toolbar.querySelector(".de-button--mode")

// ── The removed clusters ───────────────────────────────────────────────────

console.log("\nRemoved clusters")

check("the tool cluster is gone entirely — Scale, Text, Move and Hand alike", () => {
  for (const gone of ["Scale", "Text", "Move", "Hand (browser scroll)"]) {
    assert.equal(byLabel(gone), null, `${gone} is still in the bar`)
  }
  // The panel toggles are pressable too, so absence of `aria-pressed` is no
  // longer the signal. What must be gone is a pressable that picks a TOOL.
  const pressable = Array.from(toolbar.querySelectorAll(".de-tool[aria-pressed]"))
  assert.deepEqual(
    pressable.map((button) => button.getAttribute("aria-label")).sort(),
    ["Toggle inspector", "Toggle layers panel"],
    "a tool radio survives"
  )
  // …and the bar is not simply empty, so this is not asserting nothing.
  assert.ok(byLabel("Undo"))
  assert.ok(mode())
})

// The two panel toggles stay in the bar; what went is the mark they used to
// wear. A ruled frame said "panel" and nothing else, so the button could only
// report its state in colour. Their new behaviour is asserted further down.
check("neither panel toggle still draws the retired ruled frame", () => {
  for (const button of [byLabel("Toggle layers panel"), byLabel("Toggle inspector")]) {
    assert.ok(button, "both toggles must still be in the bar")
    const paths = Array.from(button.querySelectorAll("path")).map((node) => node.getAttribute("d"))
    // PanelLeft and PanelRight were a rect with one of these ruled down it.
    assert.ok(!paths.includes("M9 3v18") && !paths.includes("M15 3v18"), "the old glyph is back")
  }
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

check("the mode switch, the two panel toggles, undo, redo and apply are the whole bar", () => {
  assert.ok(mode())
  assert.ok(byLabel("Toggle layers panel"))
  assert.ok(byLabel("Toggle inspector"))
  assert.ok(byLabel("Undo"))
  assert.ok(byLabel("Redo"))
  assert.ok(byText("Apply to code"))
  assert.equal(buttons().length, 6, `expected six controls, saw ${buttons().length}`)
})

// V and H picked between two tools. With one tool left there is nothing for a
// letter to pick, and a letter the bar swallows is a letter the app never gets.
check("no bare letter is claimed by the bar any more", () => {
  for (const key of ["h", "v"]) {
    const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false, `"${key}" was swallowed`)
  }
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

// ── The panel toggles ──────────────────────────────────────────────────────

console.log("\nPanel toggles")

/**
 * A stable fingerprint of what a button is DRAWING, colour excluded.
 *
 * The pressed treatment is a tint, so comparing rendered colour would pass on
 * the very thing these glyphs exist to replace. This reads the geometry.
 */
const drawing = (button) =>
  Array.from(button.querySelectorAll("rect, path, circle"))
    .map((node) =>
      Array.from(node.attributes)
        .filter((attribute) => attribute.name !== "fill" && attribute.name !== "stroke")
        .map((attribute) => `${attribute.name}=${attribute.value}`)
        .join(",")
    )
    .join("|")

const TOGGLES = [
  ["Toggle layers panel", "layersOpen"],
  ["Toggle inspector", "inspectorOpen"],
]

check("each toggle draws a different glyph for open than for collapsed", () => {
  for (const [label, flag] of TOGGLES) {
    editor.setState({ [flag]: true })
    const open = drawing(byLabel(label))
    editor.setState({ [flag]: false })
    const collapsed = drawing(byLabel(label))
    assert.notEqual(open, collapsed, `${label} draws the same glyph in both states`)
    assert.ok(open.length > 0 && collapsed.length > 0, `${label} drew nothing`)
  }
})

check("the two toggles are told apart from each other, in both states", () => {
  for (const open of [true, false]) {
    editor.setState({ layersOpen: open, inspectorOpen: open })
    assert.notEqual(
      drawing(byLabel("Toggle layers panel")),
      drawing(byLabel("Toggle inspector")),
      `the pair is indistinguishable while ${open ? "open" : "collapsed"}`
    )
  }
})

// The shell writes these flags too, so the button cannot infer its state from
// its own last click. It reads the store on every paint.
check("aria-pressed follows the store, not the click", () => {
  for (const [label, flag] of TOGGLES) {
    for (const open of [true, false, true]) {
      editor.setState({ [flag]: open })
      assert.equal(byLabel(label).getAttribute("aria-pressed"), String(open), `${label} @ ${open}`)
    }
  }
})

check("clicking a toggle moves its own flag and only its own", () => {
  editor.setState({ layersOpen: true, inspectorOpen: true })
  byLabel("Toggle layers panel").click()
  assert.equal(context.getState().layersOpen, false)
  assert.equal(context.getState().inspectorOpen, true, "the inspector moved with the layers panel")
  byLabel("Toggle inspector").click()
  assert.equal(context.getState().inspectorOpen, false)
  assert.equal(context.getState().layersOpen, false)
  byLabel("Toggle layers panel").click()
  assert.equal(context.getState().layersOpen, true)
  editor.setState({ layersOpen: true, inspectorOpen: true })
})

// ── Hover text and accessible names ────────────────────────────────────────

console.log("\nTooltips")

check("every icon-only toolbar button has both a tip and an aria-label", () => {
  const iconOnly = buttons().filter((button) => button.textContent.trim() === "")
  assert.equal(iconOnly.length, 4, "the two panel toggles plus undo and redo")
  for (const button of iconOnly) {
    const tip = button.getAttribute("data-de-tip")
    const label = button.getAttribute("aria-label")
    assert.ok(tip && tip.length > 0, `missing data-de-tip: ${button.outerHTML}`)
    assert.ok(label && label.length > 0, `missing aria-label: ${button.outerHTML}`)
  }
})

// The tip is a ::after, and CSS generated content joins name-from-content. On a
// button that shows no text that is harmless because the aria-label pins the
// name; on a button that DOES show text, an unpinned name becomes "Apply to
// code Write pending visual changes back to source". jsdom computes no
// accessible name, so this asserts the thing that makes the name correct
// rather than the name itself.
check("a tip never leaks into a button's accessible name", () => {
  const tipped = buttons().filter((button) => button.hasAttribute("data-de-tip"))
  assert.equal(tipped.length, buttons().length, "every control in the bar carries a tip")
  for (const button of tipped) {
    assert.ok(button.getAttribute("aria-label"), `tip without a label: ${button.outerHTML}`)
  }
  for (const text of ["Inspecting", "Apply to code"]) {
    assert.equal(byText(text).getAttribute("aria-label"), text)
  }
})

check("a tip names the shortcut where the control has one", () => {
  assert.match(byLabel("Undo").getAttribute("data-de-tip"), /^Undo · \S/)
  assert.match(byLabel("Redo").getAttribute("data-de-tip"), /^Redo · \S/)
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

const interactive = () => mode()

check("it defaults to off, and says so in the label", () => {
  assert.equal(context.getState().interactive, false)
  assert.equal(interactive().getAttribute("aria-pressed"), "false")
  assert.equal(interactive().textContent.trim(), "Inspecting")
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

/*
 * The switch used to read "Interactive" in both of its states and be told apart
 * only by a pressed ring, so the word was a promise in one state and a lie in
 * the other. Now it names the state you are standing in — and it has to do that
 * in the SHAPE as well as the word, because the glyph is read at 14px in the
 * corner of the eye. A pair told apart by colour alone is not told apart.
 */
check("each state is named in the label and drawn in a different shape", () => {
  const read = () => {
    const svg = interactive().querySelector("svg")
    return {
      label: interactive().textContent.trim(),
      name: interactive().getAttribute("aria-label"),
      tip: interactive().getAttribute("data-de-tip"),
      d: svg.querySelector("path").getAttribute("d"),
      fill: svg.getAttribute("fill"),
    }
  }

  context.setInteractive(false)
  const inspecting = read()
  context.setInteractive(true)
  const handedOver = read()

  assert.equal(inspecting.label, "Inspecting")
  assert.equal(handedOver.label, "Interactive")
  // Voice control types what it sees, so the name follows the word.
  assert.equal(inspecting.name, inspecting.label)
  assert.equal(handedOver.name, handedOver.label)
  // The tip says what pressing DOES, which is the other sentence entirely.
  assert.notEqual(inspecting.tip, inspecting.label)
  assert.notEqual(inspecting.tip, handedOver.tip)
  // Shape and fill, not hue: one arrow solid, the same arrow hollow.
  assert.notEqual(inspecting.d, handedOver.d)
  assert.equal(inspecting.fill, "currentColor")
  assert.equal(handedOver.fill, "none")
  context.setInteractive(false)
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

check("the mode leads the strip, at the far left", () => {
  const groups = Array.from(toolbar.querySelectorAll(".de-toolbar-group"))
  assert.equal(groups.length, 3, "mode, then the panels, then the commit path")
  assert.equal(groups.indexOf(interactive().closest(".de-toolbar-group")), 0)
  assert.equal(toolbar.firstElementChild, groups[0])
  // The toggles sit between the mode and the commit path, not before the mode.
  assert.equal(groups.indexOf(byLabel("Toggle layers panel").closest(".de-toolbar-group")), 1)
  assert.equal(groups.indexOf(byLabel("Toggle inspector").closest(".de-toolbar-group")), 1)
})

// The mode used to grey the tool cluster out, which was the honest thing to do
// with controls that could not take effect. There is no such cluster now, so
// flipping it must change nothing about what is inert — anything it still
// dimmed would be a control that had quietly stopped meaning anything.
check("flipping the mode no longer stands anything down", () => {
  const inert = () => buttons().filter((button) => button.disabled).length
  context.setInteractive(false)
  const off = inert()
  context.setInteractive(true)
  assert.equal(inert(), off)
  assert.equal(interactive().disabled, false)
  context.setInteractive(false)
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

check("a bare letter reaches the app in interactive mode too", () => {
  context.setInteractive(true)
  const event = new window.KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false)
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
