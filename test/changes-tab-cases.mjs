/**
 * The Changes tab's two sections, and taking a change back.
 *
 * Three claims, and they are the ones the tab was restructured to make true:
 *
 * 1. A row is filed under WHO FINISHES IT, not under what kind of thing it is.
 *    The editor writes what it can spell; everything else, notes included, is
 *    the agent's. Each group carries the verb that finishes it, under its own
 *    rows, so the scope of a button is the block you are looking at.
 *
 * 2. Dropping a row WITHDRAWS the change. It used to remove the row and leave
 *    the queued operation standing, so Apply afterwards wrote something the
 *    designer had explicitly discarded — the tab said one thing and the file
 *    said another.
 *
 * 3. Withdrawal works in ANY ORDER. Undo is a timeline and has to be walked
 *    backwards; this is not undo. A row is one (element, property) and the
 *    journal collapses repeats onto one row, so rows are independent by
 *    construction and the middle of the list can go first.
 *
 * The harness is `stranded-write-cases`': one bundle, because the journal, the
 * ledger and the vendor store are all module state and two builds would each
 * get their own.
 */

import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

import { PACKAGE_DIR as PACKAGE } from "./host.mjs"

const dom = new JSDOM(
  '<!doctype html><html><body><main id="app"></main></body></html>',
  { pretendToBeVisual: true, url: "http://localhost/overview" }
)
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
  "window", "document", "navigator", "Node", "Element", "HTMLElement", "SVGElement",
  "SVGSVGElement", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle",
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
}
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: () => Promise.resolve() },
  configurable: true,
})

// No route behind the panel in this harness. The MCP status block and the
// component-usage lookup both fetch; both are written to treat a dead route as
// "say nothing confident", and returning a rejection here is what proves it.
globalThis.fetch = async () => {
  throw new Error("no server in this harness")
}

const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { createWriter } from "./src/core/writer"
      export { createContext } from "./src/core/context"
      export { annotationsTab } from "./src/panels/inspector/tab-annotations"
      export { addAnnotation, resetAnnotationsForTest } from "./src/annotations/store"
      export {
        isEditQueued,
        recordEdit,
        resetJournalForTest,
        markEditsWritten,
      } from "./src/annotations/journal"
      export { previewOnlyChanges, recordPreviewOnly, clearPreviewOnly } from "./src/core/change-prompt"
      export { withdrawEdit } from "./src/core/withdraw"
      export { resetComponentUsageForTest } from "./src/core/component-usage"
      export { elementKey } from "./src/core/store"
    `,
    resolveDir: PACKAGE,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  logLevel: "silent",
})
const ui = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

/**
 * A store that records what is queued AND honours a withdrawal.
 *
 * The real one is the vendor's, reached through a patch that exposes its own
 * `su`. Modelled here rather than stubbed to a no-op, because the claim under
 * test is precisely that a withdrawal reaches the queue — a stub that accepted
 * the call and did nothing would pass while the product stayed broken.
 */
function makeBridge() {
  const queued = new Map()
  return {
    queued,
    store: {
      addPendingPropertyOperation(mergeKey, operation, propertyKeys) {
        const entry = queued.get(mergeKey) ?? { keys: new Set() }
        for (const key of propertyKeys) entry.keys.add(key)
        queued.set(mergeKey, entry)
      },
      removePendingPropertyOperation(mergeKey, propertyKeys) {
        const entry = queued.get(mergeKey)
        if (!entry) return
        for (const key of propertyKeys) entry.keys.delete(key)
        if (entry.keys.size === 0) queued.delete(mergeKey)
      },
      buildBatchOperations() {
        return [...queued.values()].map(() => ({ op: "updateClass" }))
      },
      hasChanges() {
        return queued.size > 0
      },
      setActiveTool() {},
      onStateChange() {},
      getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
      viewportToPage: (x, y) => ({ x, y }),
      pageToViewport: (x, y) => ({ x, y }),
    },
    elementInfo() {
      return {
        tagName: "div",
        componentName: "Fixture",
        filePath: "",
        lineNumber: 0,
        columnNumber: 0,
        stack: [],
      }
    },
    async elementSourceAsync() {
      return {
        tagName: "div",
        componentName: "Fixture",
        filePath: "src/Fixture.tsx",
        lineNumber: 4,
        columnNumber: 6,
        stack: [],
      }
    },
    async discoverFile() {
      return null
    },
    send() {},
    subscribe: () => () => {},
    toast() {},
  }
}

let bridge
let tab

function reset() {
  ui.resetJournalForTest()
  ui.resetAnnotationsForTest()
  ui.clearPreviewOnly()
  ui.resetComponentUsageForTest()
  window.localStorage.clear()
  window.document.getElementById("app").innerHTML = ""
  bridge = makeBridge()
  const context = ui.createContext(bridge, { right: null, left: null, bottom: null })
  tab = ui.annotationsTab(context)
  tab.update()
}

function mount(html) {
  const host = window.document.getElementById("app")
  const holder = window.document.createElement("div")
  holder.innerHTML = html
  host.append(holder.firstElementChild)
  return host.lastElementChild
}

/**
 * The outbox's sections, in column order.
 *
 * They were `.de-ann-group` blocks stacked inside one section called Handover,
 * each drawing a heading and a tally of its own. They are `section()`s now —
 * the panel's own header, the same call the Design tab makes — so the title is
 * read off `.de-section-title`, and there is no count to read anywhere: the
 * rows ARE the section, and a list you can count by looking does not need to be
 * counted at you three times.
 *
 * Settings is filtered out. It is a section in the same column but it is not
 * part of the outbox, and these cases are about the two piles a session makes.
 */
const groups = () =>
  Array.from(tab.node.querySelectorAll(".de-section"))
    .map((node) => ({
      title: node.querySelector(".de-section-title").textContent.trim(),
      cta: node.querySelector(".de-ann-cta button")?.textContent.trim() ?? null,
      rows: Array.from(node.querySelectorAll(".de-ann-item")).map((row) =>
        row.querySelector(".de-ann-item-line")?.textContent.trim() ?? ""
      ),
      numbers: Array.from(node.querySelectorAll(".de-ann-index")).map((n) =>
        Number(n.textContent.trim())
      ),
    }))
    .filter((group) => group.title !== "Settings")

const rowIds = () =>
  Array.from(tab.node.querySelectorAll(".de-ann-item")).map((row) =>
    row.getAttribute("data-item")
  )

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

console.log("\nTwo sections, each counting from one")

await check("edits and notes are separate sections, split by what you did", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "opacity", value: "0.5" }],
    "Opacity"
  )
  await settle()
  ui.addAnnotation({
    kind: "element",
    comment: "This is doing too much",
    rect: { x: 0, y: 0, width: 10, height: 10 },
    target: null,
    selectedText: null,
  })
  tab.update()

  /*
   * The split is what the designer DID, not what happens to it next. An edit is
   * a change made on the canvas; a note is a sentence written about the page.
   * Those are the two activities a session is made of, and they are the two
   * errands somebody opens this tab on — "what have I changed" and "where is
   * that note I left".
   */
  const found = groups()
  assert.deepEqual(
    found.map((group) => group.title),
    ["Direct edits", "Notes"]
  )
})

await check("an unwritable edit stays with the edits, not with the notes", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  // `filter` has no Tailwind spelling, so no commit will ever write it. It is
  // still an edit: the designer changed it on the canvas, and filing it under
  // Notes would describe it as something they wrote rather than something they
  // did. Its BADGE says who has to finish it; its section says what it is.
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "filter", value: "blur(2px)" }],
    "Blur"
  )
  await settle()
  tab.update()

  const [edits] = groups()
  assert.equal(edits.title, "Direct edits")
  assert.ok(
    edits.rows.some((line) => line.includes("filter")),
    "an unwritable edit was filed away from the other edits"
  )
})

await check("EACH SECTION COUNTS FROM ONE", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  const selection = {
    element,
    tagName: "button",
    componentName: "Fixture",
    source: null,
    key: ui.elementKey(element, "Fixture", 0),
  }

  /*
   * Interleaved on purpose: note, edit, note, edit, note. Under the old merged
   * numbering these came out 1..5 and the sections were cosmetic — the third
   * note being called 5 told you only that two edits happened to be made before
   * it, which is a fact about the clock and not about the note.
   */
  ui.addAnnotation({
    kind: "element", comment: "First note", rect: { x: 0, y: 0, width: 10, height: 10 },
    target: null, selectedText: null,
  })
  writer.applyStyles(selection, [{ property: "opacity", value: "0.5" }], "Opacity")
  await settle()
  ui.addAnnotation({
    kind: "element", comment: "Second note", rect: { x: 0, y: 0, width: 10, height: 10 },
    target: null, selectedText: null,
  })
  writer.applyStyles(selection, [{ property: "width", value: "120px" }], "Width")
  await settle()
  ui.addAnnotation({
    kind: "element", comment: "Third note", rect: { x: 0, y: 0, width: 10, height: 10 },
    target: null, selectedText: null,
  })
  tab.update()

  const found = groups()
  assert.deepEqual(found.map((group) => group.title), ["Direct edits", "Notes"])
  assert.deepEqual(found[0].numbers, [1, 2], "the edits did not count from one")
  assert.deepEqual(found[1].numbers, [1, 2, 3], "the notes did not count from one")
})

await check("only the edits carry a verb; the handover is a footer action", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "opacity", value: "0.5" }],
    "Opacity"
  )
  await settle()
  ui.addAnnotation({
    kind: "element", comment: "A note", rect: { x: 0, y: 0, width: 10, height: 10 },
    target: null, selectedText: null,
  })
  tab.update()

  /*
   * "Apply to code" acts on exactly the rows above it, so it sits under them.
   * Handing over does not: the brief carries the whole session, notes AND
   * edits, so a Send button under the notes heading would claim a scope it does
   * not have. It belongs beside Copy, the other whole-session action.
   */
  const found = groups()
  assert.deepEqual(found.map((group) => group.cta), ["Apply to code", null])
  const footer = Array.from(tab.node.querySelectorAll(".de-ann-ctas button")).map((node) =>
    node.textContent.trim()
  )
  assert.ok(footer.includes("Send to agent"), "the handover left the footer")
  assert.ok(footer.includes("Copy"), "Copy left the footer")
})

console.log("\nTaking a change back")

await check("dropping a row withdraws the queued write, not just the row", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "opacity", value: "0.5" }],
    "Opacity"
  )
  await settle()
  assert.equal(bridge.store.hasChanges(), true, "the edit never reached the queue")

  const [id] = rowIds()
  ui.withdrawEdit(bridge, id)

  // The whole point. Before this existed the row went and the operation stayed,
  // so the next Apply wrote a change the designer had thrown away.
  assert.equal(bridge.store.hasChanges(), false, "the queued write survived the withdrawal")
  assert.deepEqual(rowIds(), [], "the row survived the withdrawal")
})

await check("the preview goes back to what it was", async () => {
  reset()
  const element = mount('<button class="btn" style="opacity: 1">Go</button>')
  const writer = ui.createWriter(bridge)
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "opacity", value: "0.5" }],
    "Opacity"
  )
  await settle()
  assert.equal(element.style.opacity, "0.5")

  ui.withdrawEdit(bridge, rowIds()[0])
  // Safe only because rows collapse: no later row can have written `opacity` on
  // this element, so restoring the "from" cannot clobber somebody else's value.
  assert.equal(element.style.opacity, "1", "the page kept a change that was taken back")
})

await check("ANY row, in ANY order — the middle one goes first", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  const selection = {
    element,
    tagName: "button",
    componentName: "Fixture",
    source: null,
    key: ui.elementKey(element, "Fixture", 0),
  }
  for (const [property, value] of [
    ["opacity", "0.5"],
    ["width", "120px"],
    ["height", "40px"],
  ]) {
    writer.applyStyles(selection, [{ property, value }], property)
  }
  await settle()
  tab.update()
  const ids = rowIds()
  assert.equal(ids.length, 3)

  /*
   * The middle one, then the last, then the first — deliberately not the order
   * they were made in and not the reverse of it either. Undo could not do this;
   * it is a timeline and has to unwind. This is a set of independent rows.
   */
  ui.withdrawEdit(bridge, ids[1])
  tab.update()
  assert.deepEqual(rowIds(), [ids[0], ids[2]], "withdrawing the middle row disturbed its neighbours")

  ui.withdrawEdit(bridge, ids[2])
  tab.update()
  assert.deepEqual(rowIds(), [ids[0]], "withdrawing the last row disturbed the first")

  ui.withdrawEdit(bridge, ids[0])
  tab.update()
  assert.deepEqual(rowIds(), [], "the last withdrawal left something behind")
  assert.equal(bridge.store.hasChanges(), false, "three withdrawals left a queued write")
})

await check("withdrawing an unwritable change clears the ledger too", async () => {
  reset()
  const element = mount('<span class="icon">x</span>')
  ui.recordEdit({
    property: "icon",
    from: "Star",
    to: "Heart",
    element,
    written: false,
  })
  ui.recordPreviewOnly({
    filePath: "src/Fixture.tsx",
    componentName: "Fixture",
    tagName: "span",
    className: "icon",
    property: "icon",
    from: "Star",
    to: "Heart",
  })
  assert.equal(ui.previewOnlyChanges().length, 1)

  tab.update()
  ui.withdrawEdit(bridge, rowIds()[0])

  // The ledger is what builds the brief. A withdrawn change left in it would
  // reach the agent through the one document the designer never re-reads.
  assert.equal(
    ui.previewOnlyChanges().length,
    0,
    "a withdrawn change is still queued for the agent"
  )
})

await check("a row that was already written is not queued, and says so", async () => {
  reset()
  const element = mount('<button class="btn">Go</button>')
  const writer = ui.createWriter(bridge)
  writer.applyStyles(
    { element, tagName: "button", componentName: "Fixture", source: null, key: ui.elementKey(element, "Fixture", 0) },
    [{ property: "opacity", value: "0.5" }],
    "Opacity"
  )
  await settle()
  const [id] = rowIds()
  assert.equal(ui.isEditQueued(id), true, "a fresh writable edit is not owed")

  ui.markEditsWritten()
  assert.equal(ui.isEditQueued(id), false, "a committed edit is still owed")
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
