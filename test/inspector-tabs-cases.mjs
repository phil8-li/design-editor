/**
 * The right panel's tab host.
 *
 * The inspector used to be one scroll of sections. It is now three views over
 * one selection — Design, Code, Change prompts — and the things worth pinning
 * are the ones a refactor of any one tab could quietly break:
 *
 *  - all three tabs exist, exactly once, and exactly one is selected;
 *  - a hidden pane keeps its DOM (so its scroll position survives a glance at
 *    another tab) but is `hidden`, so it cannot be tabbed into;
 *  - only the VISIBLE tab is re-read on an invalidation, which is what keeps
 *    the code view and the ledger off the hot path of a number scrub;
 *  - the "Copy change prompts" button lives HERE, not on the toolbar, and its
 *    clipboard write still happens synchronously inside the click task.
 *
 * Usage: node design-editor/test/inspector-tabs-cases.mjs
 */

import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

import { PACKAGE_DIR } from "./host.mjs"

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

const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { createContext } from "./src/core/context"
      export { installInspector } from "./src/panels/inspector/index"
      export { getState, setState } from "./src/core/store"
      export { recordPreviewOnly, clearPreviewOnly, previewOnlyChanges } from "./src/core/change-prompt"
      export { shellCss } from "./src/core/css"
    `,
    resolveDir: PACKAGE_DIR,
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
const right = slot()
const context = editor.createContext(bridge, {
  overlay: slot(),
  toolbar: slot(),
  left: slot(),
  right,
})
editor.installInspector(context)

const tabs = () => Array.from(right.querySelectorAll('[role="tab"]'))
const panes = () => Array.from(right.querySelectorAll('[role="tabpanel"]'))
const tabNamed = (label) => tabs().find((node) => node.textContent.trim() === label) ?? null
const paneFor = (label) => {
  const tab = tabNamed(label)
  return tab ? right.querySelector(`#${tab.getAttribute("aria-controls")}`) : null
}

console.log("\nInspector tab host")

check("three tabs, named for the three things you can be looking at", () => {
  assert.deepEqual(
    tabs().map((node) => node.textContent.trim()),
    ["Design", "Code", "Prompts"]
  )
})

check("exactly one tab is selected, and Design is the one you land on", () => {
  const selected = tabs().filter((node) => node.getAttribute("aria-selected") === "true")
  assert.equal(selected.length, 1)
  assert.equal(selected[0].textContent.trim(), "Design")
})

check("every tab names the pane it controls, and that pane names it back", () => {
  for (const tab of tabs()) {
    const id = tab.getAttribute("aria-controls")
    assert.ok(id, `${tab.textContent.trim()} controls nothing`)
    const pane = right.querySelector(`#${id}`)
    assert.ok(pane, `${id} is not in the panel`)
    assert.equal(pane.getAttribute("aria-labelledby"), tab.id)
  }
})

check("the two tabs you are not on are hidden, not removed", () => {
  assert.equal(panes().length, 3)
  assert.equal(panes().filter((pane) => !pane.hidden).length, 1)
})

check("switching tabs moves the selection and the hidden flag together", () => {
  tabNamed("Code").dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.equal(tabNamed("Code").getAttribute("aria-selected"), "true")
  assert.equal(tabNamed("Design").getAttribute("aria-selected"), "false")
  assert.equal(paneFor("Code").hidden, false)
  assert.equal(paneFor("Design").hidden, true)
})

check("a pane that has been visited keeps its DOM while hidden", () => {
  const before = paneFor("Code").innerHTML
  tabNamed("Design").dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.equal(paneFor("Code").hidden, true)
  assert.equal(paneFor("Code").innerHTML, before)
})

// ── The copy button, in its new home ───────────────────────────────────────

console.log("\nCopy change prompts")

const promptsPane = () => paneFor("Prompts")
const copyButton = () =>
  Array.from(promptsPane().querySelectorAll("button")).find(
    (node) => node.textContent.trim() === "Copy change prompts"
  ) ?? null

check("the button lives in the panel, and the toolbar no longer holds one", () => {
  assert.ok(copyButton(), "the Prompts tab has no copy button")
  const toolbar = context.slots.toolbar
  const strays = Array.from(toolbar.querySelectorAll("button")).filter(
    (node) => node.textContent.trim() === "Copy change prompts"
  )
  assert.deepEqual(strays, [], "the toolbar still carries a copy button")
})

check("with an empty ledger the button is disabled and says so", () => {
  editor.clearPreviewOnly()
  tabNamed("Prompts").dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.equal(copyButton().disabled, true)
  assert.match(promptsPane().textContent, /Nothing queued/)
})

check("a recorded change lists itself and arms the button", () => {
  editor.recordPreviewOnly({
    filePath: "/Users/someone/app/src/components/card.tsx",
    componentName: "Card",
    tagName: "div",
    className: "rounded-xl",
    property: "box-shadow",
    from: "none",
    to: "0 2px 8px rgba(0,0,0,.3)",
  })
  tabNamed("Prompts").dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.equal(copyButton().disabled, false)
  assert.match(promptsPane().textContent, /1 change queued/)
  assert.match(promptsPane().textContent, /box-shadow/)
})

check("the listed path is the repo-relative tail, never the user's home", () => {
  assert.match(promptsPane().textContent, /src\/components\/card\.tsx/)
  assert.ok(
    !promptsPane().textContent.includes("/Users/someone"),
    "an absolute path reached the panel"
  )
})

check("the clipboard write happens in the click task, before any await", () => {
  let written = null
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: (text) => ((written = text), Promise.resolve()) },
    configurable: true,
  })
  copyButton().dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.ok(written, "nothing was written synchronously")
  assert.match(written, /box-shadow/)
  assert.ok(!written.includes("/Users/someone"), "the brief carried an absolute path")
  assert.ok(!written.includes("**Source:**"), "the brief carried a Source line")
})

check("clearing the queue empties the list and re-disables the button", () => {
  const clear = promptsPane().querySelector('[aria-label="Clear the queue"]')
  assert.ok(clear, "the queue cannot be cleared")
  clear.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  assert.equal(editor.previewOnlyChanges().length, 0)
  assert.equal(copyButton().disabled, true)
})

// ── The stylesheet the panes rely on ───────────────────────────────────────

console.log("\nTab stylesheet")

check("a hidden pane is display:none, beating the UA [hidden] rule", () => {
  assert.match(editor.shellCss, /\.de-tabpanel\[hidden\]\s*\{[^}]*display:\s*none/)
})

check("the right panel's body stops scrolling — its pane does that now", () => {
  assert.match(
    editor.shellCss,
    /\.de-panel--right \.de-panel-body\s*\{[^}]*overflow:\s*hidden/s
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
