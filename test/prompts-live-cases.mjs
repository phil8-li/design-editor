/**
 * The Prompts tab while source resolution is still in flight.
 *
 * `stranded-write-cases.mjs` proves the ledger gets filled and `tab-prompts`
 * can draw it; both of them call `tab.update()` by hand at the moment they want
 * a repaint. The product has nobody to do that. The inspector repaints from a
 * store subscription and from `refresh()`, and a write to the ledger is neither
 * — so the interesting question is not whether the tab CAN draw the row, it is
 * whether anything ever asks it to.
 *
 * It did not, and the window in which that mattered was wide. A property the
 * translator can spell only strands once `ensureSource` has come back with no
 * usable file, which is a sourcemap fetch and sometimes a grep — hundreds of
 * milliseconds after the edit, sometimes seconds. Change a value, click over to
 * Prompts inside that window, and the tab rendered from an empty ledger and
 * then never rendered again: "Nothing to hand over yet", permanently, over a
 * change sitting on screen behind it. No user action would clear it, because
 * the only action available — switching to the tab — had already been spent.
 *
 * So this suite boots the real inspector against a bridge that resolves slowly,
 * drives a real field in the right panel, and never calls `update()` itself
 * after the edit. Everything it asserts has to arrive on its own.
 *
 * Usage: node design-editor/test/prompts-live-cases.mjs
 */

import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

import { PACKAGE_DIR } from "./host.mjs"

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

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
const { window } = dom
window.document.elementsFromPoint = () => []
window.Element.prototype.getBoundingClientRect = function box() {
  return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }
}
// The Design tab asks the server for saved option sets the first time it
// renders. There is no server here, and every way of failing that request ends
// in a warning whose stack quotes the entire base64 bundle back at the
// terminal — megabytes of it. An empty set is the honest answer anyway: this
// suite is about the ledger, and no case has an option to remember.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
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

// One bundle, for the reason `stranded-write-cases.mjs` gives: the ledger is
// module state, and an inspector imported from one build watching a ledger from
// another would pass here and stay broken in the browser.
const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { createContext } from "./src/core/context"
      export { installInspector } from "./src/panels/inspector/index"
      export { resetSourceResolutionCache } from "./src/core/bridge"
      export {
        clearPreviewOnly,
        previewOnlyChanges,
        recordPreviewOnly,
        removePreviewOnly,
      } from "./src/core/change-prompt"
    `,
    resolveDir: PACKAGE_DIR,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  logLevel: "silent",
})
const editor = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

/** Long enough that no assertion can land inside it by accident. */
const SLOW = 400
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One painted frame.
 *
 * The inspector debounces its repaint onto a `requestAnimationFrame`, so a test
 * that read the DOM in the same task as the write would be reading the panel as
 * it was before, and would fail on a fix that works.
 */
const frame = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => setTimeout(resolve, 0)))

/**
 * A bridge that answers, eventually, and answers no.
 *
 * The two slow methods are the whole point: React 19 leaves `elementInfo` with
 * an empty `filePath`, so every write goes down the async path, and the async
 * path is a symbolication round trip followed by a `grep`. That is the window
 * the user clicks the Prompts tab in.
 */
const queued = []
const bridge = {
  elementInfo: (element) => ({
    tagName: element.tagName.toLowerCase(),
    componentName: "Fixture",
    filePath: "",
    lineNumber: 0,
    columnNumber: 0,
    stack: [],
  }),
  async elementSourceAsync() {
    await wait(SLOW)
    return null
  },
  async discoverFile() {
    await wait(SLOW)
    return null
  },
  send() {},
  toast() {},
  subscribe: () => () => {},
  store: {
    addPendingPropertyOperation(mergeKey, operation) {
      queued.push({ mergeKey, operation })
    },
    buildBatchOperations: () => [],
    hasChanges: () => false,
    setActiveTool() {},
    onStateChange() {},
    getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
    viewportToPage: (x, y) => ({ x, y }),
    pageToViewport: (x, y) => ({ x, y }),
  },
}

const slot = () => {
  const node = window.document.createElement("div")
  node.setAttribute("data-design-editor", "")
  window.document.body.append(node)
  return node
}
const right = slot()
const context = editor.createContext(bridge, {
  overlay: slot(),
  toolbar: slot(),
  left: slot(),
  right,
})
editor.installInspector(context)

const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
const tabButton = (label) =>
  Array.from(right.querySelectorAll(".de-tab")).find((node) => node.textContent.trim() === label)
const promptsPane = () => right.querySelector("#de-tabpanel-prompts")
const rows = () => Array.from(promptsPane().querySelectorAll(".de-prompt"))

function mount(html) {
  const app = window.document.getElementById("app")
  app.insertAdjacentHTML("beforeend", html)
  return app.lastElementChild
}

/** A number field commits on Enter, not on `change` — see `field.ts`. */
function commitRadius(px) {
  const input = right.querySelector('[data-de-field="appearance.radius"]')
  assert.ok(input, "the Design tab is not showing a radius field to commit from")
  input.value = String(px)
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

/**
 * A clean start that does not lean on the thing under test.
 *
 * Switching to a tab updates it whatever else is broken, so visiting Prompts
 * and leaving again is how each case begins with the pane holding an empty
 * ledger. Clearing and trusting the repaint would make every case pass on the
 * unfixed code, or fail on it for the wrong reason.
 */
async function begin() {
  editor.resetSourceResolutionCache()
  editor.clearPreviewOnly()
  click(tabButton("Prompts"))
  click(tabButton("Design"))
  await frame()
}

const ICON_CHANGE = {
  filePath: "src/Fixture.tsx",
  componentName: "Fixture",
  tagName: "svg",
  className: "size-4",
  property: "icon",
  from: "Star",
  to: "Heart",
}
const SHADOW_CHANGE = {
  filePath: "src/Fixture.tsx",
  componentName: "Fixture",
  tagName: "div",
  className: "rounded-xl",
  property: "box-shadow",
  from: "none",
  to: "0 2px 8px rgba(0,0,0,.3)",
}

console.log("\nThe Prompts tab during resolution")

await check("PL-01 a row that strands while the tab is open appears without being asked for", async () => {
  await begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  context.select(element)
  await frame()

  commitRadius(12)
  // The translator can spell a radius, so nothing is decided yet: the write is
  // waiting on a file, and the ledger is genuinely empty at this instant.
  assert.deepEqual(editor.previewOnlyChanges(), [], "the write stranded before resolution answered")

  click(tabButton("Prompts"))
  assert.deepEqual(rows(), [], "a row appeared before anything could have stranded")
  assert.match(promptsPane().textContent, /Nothing to hand over yet/)

  // Resolution comes back empty. Nothing else happens — no click, no
  // selection change, no refresh. This is the regression: from here the user
  // does nothing, and the tab has to correct itself.
  await wait(SLOW * 2 + 200)
  await frame()

  assert.equal(editor.previewOnlyChanges().length, 1, "the write never reached the ledger at all")
  assert.equal(rows().length, 1, "the ledger holds the change and the open tab still denies it")
  assert.ok(
    !promptsPane().textContent.includes("Nothing to hand over yet."),
    "the empty state outlived the change it was denying"
  )
  const row = rows()[0]
  assert.equal(row.querySelector(".de-prompt-what").textContent.trim(), "border-radius")
  assert.equal(row.querySelector(".de-prompt-to").textContent.trim(), "12px")
  assert.match(promptsPane().textContent, /1 change queued/)
})

await check("PL-02 a hidden Prompts tab is left alone, and is right the moment you switch to it", async () => {
  await begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  context.select(element)
  await frame()

  const beforeWrite = promptsPane().innerHTML
  commitRadius(16)
  await wait(SLOW * 2 + 200)
  await frame()

  assert.equal(editor.previewOnlyChanges().length, 1)
  // A hidden pane keeping its DOM is deliberate — it is what keeps the code
  // view's scroll position and the ledger off the hot path of a scrub — so a
  // fix that repainted every pane on every ledger write would be a different
  // regression wearing this one's clothes.
  assert.equal(promptsPane().hidden, true)
  assert.equal(promptsPane().innerHTML, beforeWrite, "a hidden pane was repainted on a ledger write")

  click(tabButton("Prompts"))
  assert.equal(rows().length, 1, "switching to the tab is supposed to read the ledger")
  assert.equal(rows()[0].querySelector(".de-prompt-to").textContent.trim(), "16px")
})

console.log("\nThe queue shrinking under the tab")

await check("PL-03 clearing the queue from outside the tab empties the list you are looking at", async () => {
  await begin()
  click(tabButton("Prompts"))
  editor.recordPreviewOnly({ ...ICON_CHANGE })
  await frame()
  assert.equal(rows().length, 1, "a change recorded while the tab was open never reached it")

  editor.clearPreviewOnly()
  await frame()
  assert.deepEqual(rows(), [], "the queue is empty and the tab is still listing it")
  assert.match(promptsPane().textContent, /Nothing to hand over yet/)
})

await check("PL-04 dropping one entry from outside the tab drops one row and keeps the rest", async () => {
  await begin()
  click(tabButton("Prompts"))
  const shadow = { ...SHADOW_CHANGE }
  editor.recordPreviewOnly(shadow)
  editor.recordPreviewOnly({ ...ICON_CHANGE })
  await frame()
  assert.equal(rows().length, 2)

  editor.removePreviewOnly(shadow)
  await frame()
  assert.equal(rows().length, 1)
  assert.equal(rows()[0].querySelector(".de-prompt-what").textContent.trim(), "swap icon")
})

console.log(`\n${passed} passed, ${failed} failed`)
// jsdom's timers keep the loop alive, and the slow bridge leaves some pending.
process.exit(failed === 0 ? 0 : 1)
