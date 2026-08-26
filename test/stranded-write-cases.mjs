/**
 * The writes that reach the screen and nothing else.
 *
 * `apply-source-cases.mjs` pins the happy path: the async resolver finds the
 * file, the operation queues, jscodeshift rewrites the JSX. This suite pins
 * what happens when that path comes up empty — which on a React 19 page is
 * often. The sync walk always answers `filePath: ""`, the owner-stack resolver
 * hands back a bundler chunk roughly half the time, `isProjectSourcePath`
 * rejects it, and the engine itself refuses operations it cannot locate in
 * source.
 *
 * Every one of those used to end in silence. The user picked a colour in the
 * right panel, the element changed, `hasChanges()` stayed false so "Apply to
 * code" could not write it, the ledger stayed empty so the Prompts tab said
 * "Nothing to hand over yet", and the next hot reload ate it. There was no
 * surface anywhere in the editor that admitted the change existed.
 *
 * So the claim under test is narrow and total: a write that cannot reach source
 * lands in the ledger instead, exactly once, with a real from and a real to —
 * and a write that CAN reach source still does, leaving the ledger clean. The
 * second half matters as much as the first; an over-eager fix that stranded
 * everything would fill the Prompts tab with changes that were already written.
 *
 * Usage: node design-editor/test/stranded-write-cases.mjs
 */

import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

import { PACKAGE_DIR as PACKAGE } from "./host.mjs"

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

// One bundle, because the ledger is module state: a writer and a Prompts tab
// imported from two builds would each get their own and the end-to-end case
// would pass while the product stayed broken.
const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `
      export { resetSourceResolutionCache } from "./src/core/bridge"
      export { createWriter, untranslatedProperties } from "./src/core/writer"
      export {
        buildChangePrompt,
        previewOnlyChanges,
        clearPreviewOnly,
        recordPreviewOnly,
      } from "./src/core/change-prompt"
      export { createContext } from "./src/core/context"
      export { promptsTab } from "./src/panels/inspector/tab-prompts"
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
const {
  resetSourceResolutionCache,
  createWriter,
  untranslatedProperties,
  buildChangePrompt,
  previewOnlyChanges,
  clearPreviewOnly,
  recordPreviewOnly,
  createContext,
  promptsTab,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

/** Source resolution is a promise chain; nothing is decided in the same task. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

/**
 * The patched vendor's shape, with the two answers the real one gives:
 * `elementInfo` is populated but its `filePath` is empty, exactly as React 19.2
 * leaves it, and everything true comes from the async twin.
 *
 * `reject` stands in for the engine refusing an operation whose JSX node it
 * cannot find — a throw, which the writer used to swallow.
 */
function makeBridge({
  asyncInfo = null,
  discovered = null,
  componentName = "Fixture",
  reject = false,
} = {}) {
  const queued = []
  const toasts = []
  const store = {
    addPendingPropertyOperation(mergeKey, operation, propertyKeys) {
      if (reject) throw new Error("no matching element in source")
      queued.push({ mergeKey, operation, propertyKeys })
    },
    buildBatchOperations() {
      return queued.map((entry) => entry.operation)
    },
    hasChanges() {
      return queued.length > 0
    },
    setActiveTool() {},
    onStateChange() {},
    getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
    viewportToPage: (x, y) => ({ x, y }),
    pageToViewport: (x, y) => ({ x, y }),
  }
  return {
    queued,
    toasts,
    store,
    discoverCalls: [],
    elementInfo() {
      return {
        tagName: "div",
        componentName,
        filePath: "",
        lineNumber: 0,
        columnNumber: 0,
        stack: [],
      }
    },
    async elementSourceAsync() {
      return asyncInfo
    },
    async discoverFile(name) {
      this.discoverCalls.push(name)
      return discovered
    },
    send() {},
    subscribe: () => () => {},
    toast(message) {
      toasts.push(message)
    },
  }
}

function mount(html) {
  const host = window.document.getElementById("app")
  host.innerHTML = html
  return host.firstElementChild
}

function selectionFor(element, componentName = "Fixture") {
  return {
    element,
    tagName: element.tagName.toLowerCase(),
    componentName,
    source: null,
    key: `${componentName}:${element.tagName}`,
  }
}

/** A file the resolver can actually place an element in. */
const RESOLVED = {
  tagName: "button",
  componentName: "Fixture",
  filePath: "src/Fixture.tsx",
  lineNumber: 4,
  columnNumber: 6,
  stack: [],
}

function begin() {
  clearPreviewOnly()
  resetSourceResolutionCache()
}

// --- a style write with nowhere to land ------------------------------------

await check("SW-01 an unresolvable style write queues nothing and lands in the ledger", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  // Nothing answers: no async frame, and the component grep finds no file.
  const bridge = makeBridge()
  createWriter(bridge).applyStyles(
    selectionFor(element),
    [{ property: "background-color", value: "#ff0000" }],
    "Background"
  )
  await settle()

  assert.equal(bridge.queued.length, 0, "an unresolved file cannot carry an operation")
  assert.equal(bridge.store.hasChanges(), false)
  const changes = previewOnlyChanges()
  assert.equal(changes.length, 1, "the change is on screen and in no list")
  assert.equal(changes[0].property, "background-color")
  // Read before the preview overwrote it, or the prompt states a from that is
  // already the to.
  assert.equal(changes[0].from, "rgba(0, 0, 0, 0)")
  assert.equal(changes[0].to, "#ff0000")
  assert.equal(changes[0].componentName, "Fixture")
  assert.equal(changes[0].filePath, null)
  assert.equal(element.style.getPropertyValue("background-color"), "rgb(255, 0, 0)")
})

await check("SW-02 the same write with a resolved file queues, and the ledger stays empty", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  const bridge = makeBridge({ asyncInfo: RESOLVED })
  createWriter(bridge).applyStyles(
    selectionFor(element),
    [{ property: "background-color", value: "#ff0000" }],
    "Background"
  )
  await settle()

  assert.equal(bridge.queued.length, 1)
  assert.equal(bridge.queued[0].operation.file, "src/Fixture.tsx")
  // The assertion that catches an over-eager fix: a change Apply to code will
  // write must never also be queued as something to hand to an agent.
  assert.deepEqual(previewOnlyChanges(), [])
  assert.deepEqual(untranslatedProperties(), [])
})

await check("SW-03 a bundler chunk strands rather than dispatching against a name the server cannot open", async () => {
  begin()
  const element = mount('<span class="chip">Chip</span>')
  const bridge = makeBridge({
    asyncInfo: {
      tagName: "span",
      componentName: "FolderChip",
      filePath: "src_components_workspace_space_0w_i7fl._.js",
      lineNumber: 953,
      columnNumber: 12,
      stack: [],
    },
    componentName: "FolderChip",
  })
  createWriter(bridge).applyStyles(
    selectionFor(element, "FolderChip"),
    [{ property: "background-color", value: "#00ff00" }],
    "Background"
  )
  await settle()

  assert.equal(bridge.queued.length, 0, "a chunk is not a file the writer may target")
  // The grep fallback was asked and had no answer, which is what makes this
  // element unresolvable rather than merely slow.
  assert.deepEqual(bridge.discoverCalls, ["FolderChip"])
  const changes = previewOnlyChanges()
  assert.equal(changes.length, 1)
  assert.equal(changes[0].property, "background-color")
  assert.equal(changes[0].to, "#00ff00")
})

await check("SW-04 an engine that rejects the operation strands it instead of swallowing it", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  // The file resolves; the AST walker simply cannot find the node in it.
  const bridge = makeBridge({ asyncInfo: RESOLVED, reject: true })
  createWriter(bridge).applyStyles(
    selectionFor(element),
    [{ property: "background-color", value: "#0000ff" }],
    "Background"
  )
  await settle()

  assert.equal(bridge.store.hasChanges(), false)
  const changes = previewOnlyChanges()
  assert.equal(changes.length, 1, "a refused operation used to end in an empty catch")
  assert.equal(changes[0].property, "background-color")
  assert.equal(changes[0].to, "#0000ff")
  // The path is known here, so the brief can name the file to fix by hand.
  assert.equal(changes[0].filePath, "src/Fixture.tsx")
})

// --- the class writes: variants, responsive, the design system -------------

await check("SW-05 an unresolvable class write is one class-attribute entry", async () => {
  begin()
  const element = mount('<button class="rounded bg-blue-500 px-3">Go</button>')
  const bridge = makeBridge()
  createWriter(bridge).applyClasses(
    selectionFor(element),
    { remove: ["bg-blue-500"], add: ["bg-red-500"] },
    "Background"
  )
  await settle()

  assert.equal(bridge.queued.length, 0)
  const changes = previewOnlyChanges()
  assert.equal(changes.length, 1, "one entry for the write, not one per token")
  assert.equal(changes[0].property, "class")
  assert.equal(changes[0].from, "rounded bg-blue-500 px-3")
  assert.equal(changes[0].to, "rounded px-3 bg-red-500")
  // Described by the list still standing in the JSX, which is the one an agent
  // will be searching for — the new list only exists in the browser.
  assert.equal(changes[0].className, "rounded bg-blue-500 px-3")

  const prompt = buildChangePrompt()
  assert.ok(prompt.includes("File not resolved"), prompt)
  assert.ok(prompt.includes("Search for `Fixture`"), prompt)
  assert.ok(prompt.includes("the class attribute becomes"), prompt)
  assert.ok(prompt.includes("rounded px-3 bg-red-500"), prompt)
  assert.ok(!prompt.includes("set `class` to"), prompt)
})

await check("SW-06 the Apply toast lists a stranded property but never class or icon", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  const bridge = makeBridge()
  const writer = createWriter(bridge)
  writer.applyStyles(
    selectionFor(element),
    [{ property: "background-color", value: "#ff0000" }],
    "Background"
  )
  writer.applyClasses(selectionFor(element), { remove: [], add: ["shadow-lg"] }, "Shadow")
  recordPreviewOnly({
    filePath: null,
    componentName: "Fixture",
    tagName: "svg",
    className: "size-4",
    property: "icon",
    from: "Star",
    to: "Heart",
  })
  await settle()

  assert.equal(previewOnlyChanges().length, 3)
  // The stranded CSS property belongs in the toast: it genuinely will not be
  // written. `class` and `icon` are not declarations and would read as ones.
  assert.deepEqual(untranslatedProperties(), ["background-color"])
})

await check("SW-07 re-editing a stranded property is one row, first from and latest to", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  const bridge = makeBridge()
  const writer = createWriter(bridge)
  const selection = selectionFor(element)
  // A colour field commits on every keystroke of a hex, and a slider on every
  // pointermove. Three rows for one decision is a Prompts tab nobody reads.
  writer.applyStyles(selection, [{ property: "background-color", value: "#ff0000" }], "Background")
  await settle()
  writer.applyStyles(selection, [{ property: "background-color", value: "#00ff00" }], "Background")
  await settle()

  const changes = previewOnlyChanges()
  assert.equal(changes.length, 1, "the collapse is by element and property, not by write")
  // The first from, not the second: what the agent has to reproduce is the
  // distance from what is in the JSX to what is on screen now.
  assert.equal(changes[0].from, "rgba(0, 0, 0, 0)")
  assert.equal(changes[0].to, "#00ff00")
})

// --- the tab the user is actually looking at -------------------------------

await check("SW-08 a stranded panel write puts a row in the Prompts tab", async () => {
  begin()
  const element = mount('<button class="rounded px-3">Go</button>')
  const bridge = makeBridge()

  const slot = () => {
    const node = window.document.createElement("div")
    node.setAttribute("data-design-editor", "")
    window.document.body.append(node)
    return node
  }
  const right = slot()
  const context = createContext(bridge, {
    overlay: slot(),
    toolbar: slot(),
    left: slot(),
    right,
  })
  const tab = promptsTab(context)
  right.append(tab.node)

  tab.update()
  assert.ok(tab.node.textContent.includes("Nothing to hand over yet."), "the tab did not start empty")

  createWriter(bridge).applyStyles(
    selectionFor(element),
    [{ property: "background-color", value: "#ff0000" }],
    "Background"
  )
  await settle()
  // Switching to the tab is what calls this; the ledger is what it reads.
  tab.update()

  assert.equal(tab.node.querySelectorAll(".de-prompt").length, 1)
  assert.ok(
    !tab.node.textContent.includes("Nothing to hand over yet."),
    "the change is on screen and the tab still denies it"
  )
  const row = tab.node.querySelector(".de-prompt")
  assert.equal(row.querySelector(".de-prompt-what").textContent.trim(), "background-color")
  assert.equal(row.querySelector(".de-prompt-to").textContent.trim(), "#ff0000")
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
