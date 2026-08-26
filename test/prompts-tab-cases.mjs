/**
 * The Prompts tab, row by row.
 *
 * `inspector-tabs-cases.mjs` pins the tab's place in the host — that it exists,
 * that it owns the copy button, that the button is armed by the ledger and
 * writes synchronously. This suite pins what the tab SAYS, which is the part a
 * restyle can quietly hollow out while every one of those still passes:
 *
 *  - an icon swap and a CSS property do not read the same, because they are not
 *    the same kind of change and `describe()` in `change-prompt.ts` has always
 *    known that;
 *  - a row's own copy hands over that row and nothing else, so a queue of five
 *    can be handed over one at a time;
 *  - a row's own remove drops that row and nothing else, matched the way
 *    `recordPreviewOnly` matches rather than by object identity;
 *  - the brief on screen is byte-for-byte the brief on the clipboard. That is
 *    the whole claim of the tab. If these two can drift, reading the region
 *    tells you nothing about what you are about to paste.
 *
 * Usage: node design-editor/test/prompts-tab-cases.mjs
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

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
const { window } = dom
window.document.elementsFromPoint = () => []
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
      export { promptsTab, currentChangeBrief } from "./src/panels/inspector/tab-prompts"
      export {
        recordPreviewOnly,
        removePreviewOnly,
        clearPreviewOnly,
        previewOnlyChanges,
      } from "./src/core/change-prompt"
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
const toasts = []
const bridge = {
  elementInfo: () => null,
  send() {},
  toast(message) {
    toasts.push(message)
  },
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

const tab = editor.promptsTab(context)
right.append(tab.node)

/** The last thing written to the clipboard, or null since it was reset. */
let written = null
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: (text) => ((written = text), Promise.resolve()) },
  configurable: true,
})
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
const rows = () => Array.from(tab.node.querySelectorAll(".de-prompt"))
const rowFor = (label) =>
  rows().find((row) => row.querySelector(".de-prompt-what")?.textContent.trim() === label) ?? null
const briefText = () => tab.node.querySelector(".de-prompt-brief-text")
const copyAll = () =>
  Array.from(tab.node.querySelectorAll("button")).find(
    (node) => node.textContent.trim() === "Copy change prompts"
  ) ?? null

const SHADOW = {
  filePath: "/Users/someone/app/src/components/card.tsx",
  componentName: "Card",
  tagName: "div",
  className: "rounded-xl",
  property: "box-shadow",
  from: "none",
  to: "0 2px 8px rgba(0,0,0,.3)",
}
const GLYPH = {
  filePath: "/Users/someone/app/src/components/toolbar.tsx",
  componentName: "Toolbar",
  tagName: "svg",
  className: "size-4",
  property: "icon",
  from: "Star",
  to: "Heart",
}

function seed() {
  editor.clearPreviewOnly()
  editor.recordPreviewOnly({ ...SHADOW })
  editor.recordPreviewOnly({ ...GLYPH })
  tab.update()
}

// ── The row ────────────────────────────────────────────────────────────────

console.log("\nQueued change rows")

seed()

check("every queued change gets a row", () => {
  assert.equal(rows().length, 2)
})

check("a row says where it is: the component, and the repo-relative tail", () => {
  const row = rowFor("box-shadow")
  assert.ok(row, "the box-shadow change has no row")
  assert.equal(row.querySelector(".de-prompt-component").textContent.trim(), "Card")
  assert.equal(
    row.querySelector(".de-prompt-path").textContent.trim(),
    "src/components/card.tsx"
  )
})

check("no row carries an absolute path, in its text or in its title", () => {
  assert.ok(!tab.node.textContent.includes("/Users/someone"), "an absolute path reached the panel")
  for (const node of tab.node.querySelectorAll("[title]")) {
    assert.ok(
      !(node.getAttribute("title") ?? "").includes("/Users/someone"),
      "an absolute path reached a tooltip"
    )
  }
})

check("a row states the transition, from and to", () => {
  const row = rowFor("box-shadow")
  assert.equal(row.querySelector(".de-prompt-from").textContent.trim(), "none")
  assert.equal(row.querySelector(".de-prompt-to").textContent.trim(), "0 2px 8px rgba(0,0,0,.3)")
})

check("an icon swap reads as a swap, not as a CSS declaration", () => {
  const row = rowFor("swap icon")
  assert.ok(row, "the icon change did not get a 'swap icon' row")
  assert.equal(rowFor("icon"), null, "the icon change is still labelled as a property")
  assert.equal(row.querySelector(".de-prompt-from").textContent.trim(), "Star")
  assert.equal(row.querySelector(".de-prompt-to").textContent.trim(), "Heart")
})

check("an unknown starting glyph is spelled, not left blank", () => {
  editor.clearPreviewOnly()
  editor.recordPreviewOnly({ ...GLYPH, from: "" })
  tab.update()
  assert.equal(rowFor("swap icon").querySelector(".de-prompt-from").textContent.trim(), "unknown")
})

// ── Per-entry actions ──────────────────────────────────────────────────────

console.log("\nPer-entry actions")

check("a row's copy writes that row's prompt, and only that row's", () => {
  seed()
  written = null
  click(rowFor("box-shadow").querySelector('[aria-label="Copy the prompt for box-shadow"]'))
  assert.ok(written, "nothing was written synchronously")
  assert.match(written, /box-shadow/)
  assert.ok(!written.includes("Heart"), "the icon change came along with it")
  assert.ok(!written.includes("toolbar.tsx"), "the other file came along with it")
})

check("a row's copy still names the file, so what you paste knows where to go", () => {
  assert.match(written, /src\/components\/card\.tsx/)
  assert.ok(!written.includes("/Users/someone"), "the single-entry prompt carried a home directory")
})

check("a row's remove drops that row and leaves the rest queued", () => {
  seed()
  click(rowFor("swap icon").querySelector('[aria-label="Remove swap icon from the queue"]'))
  const left = editor.previewOnlyChanges()
  assert.equal(left.length, 1)
  assert.equal(left[0].property, "box-shadow")
  assert.equal(rows().length, 1)
  assert.equal(rowFor("swap icon"), null)
})

check("remove matches the ledger's identity, not the object it was handed", () => {
  seed()
  // The same element and property, recorded again: `recordPreviewOnly` folds it
  // onto the stored record rather than queueing a second row, so removing by
  // reference would miss. This is the drag case — every pointermove re-records.
  editor.recordPreviewOnly({ ...SHADOW, to: "0 4px 16px rgba(0,0,0,.5)" })
  tab.update()
  assert.equal(rows().length, 2, "a re-edit queued a second row")
  click(rowFor("box-shadow").querySelector('[aria-label="Remove box-shadow from the queue"]'))
  assert.deepEqual(
    editor.previewOnlyChanges().map((change) => change.property),
    ["icon"]
  )
})

check("emptying the queue by row lands on the empty state, not on nothing", () => {
  click(rowFor("swap icon").querySelector('[aria-label="Remove swap icon from the queue"]'))
  assert.equal(rows().length, 0)
  assert.equal(editor.previewOnlyChanges().length, 0)
  assert.match(tab.node.textContent, /Nothing queued/)
  assert.match(tab.node.textContent, /Apply to code writes every edit it can spell/)
  assert.equal(copyAll().disabled, true)
})

// ── The brief, in place ────────────────────────────────────────────────────

console.log("\nThe visible brief")

check("with an empty queue there is no brief to read", () => {
  assert.equal(tab.node.querySelector(".de-prompt-brief").hidden, true)
})

check("a populated queue shows the brief region, folded shut", () => {
  seed()
  const region = tab.node.querySelector(".de-prompt-brief")
  assert.equal(region.hidden, false)
  const toggle = region.querySelector(".de-prompt-brief-toggle")
  assert.equal(toggle.getAttribute("aria-expanded"), "false")
  assert.equal(toggle.getAttribute("aria-controls"), briefText().id)
  assert.equal(briefText().hidden, true)
})

check("the toggle unfolds it, and the fold survives a re-render", () => {
  click(tab.node.querySelector(".de-prompt-brief-toggle"))
  assert.equal(briefText().hidden, false)
  tab.update()
  assert.equal(briefText().hidden, false, "a re-render re-collapsed the brief")
})

check("what you read is byte-for-byte what the copy button writes", () => {
  written = null
  const onScreen = briefText().textContent
  click(copyAll())
  assert.ok(written, "nothing was written synchronously")
  assert.equal(onScreen, written)
})

check("the brief tracks the queue rather than the render it was built in", () => {
  click(rowFor("swap icon").querySelector('[aria-label="Remove swap icon from the queue"]'))
  written = null
  const onScreen = briefText().textContent
  click(copyAll())
  assert.equal(onScreen, written)
  assert.ok(!onScreen.includes("Heart"), "the brief still shows a change that was removed")
})

check("the brief on screen is sanitized, the same as the clipboard's", () => {
  assert.ok(!briefText().textContent.includes("/Users/someone"), "the brief showed a home directory")
  assert.ok(!briefText().textContent.includes("**Source:**"), "the brief showed a Source line")
})

editor.clearPreviewOnly()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
