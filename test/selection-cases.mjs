/**
 * Selection-model cases for the design editor.
 *
 * Level 1 exercises the resolver and the keymap as units. Level 2 mounts the
 * real canvas lane over a jsdom fixture and drives it with genuine events, so
 * the assertions cover the wiring — which modifier reaches which branch, what
 * the scope becomes — and not just the pure functions underneath.
 *
 * jsdom is the sanctioned DOM-test path here: the selection model is a rule
 * over hit/scope/modifiers, and none of that needs a compositor.
 *
 * Usage: node design-editor/test/selection-cases.mjs
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

// ── Fixture ────────────────────────────────────────────────────────────────

/**
 * A component tree with wrapper DOM, repeated component call sites, and SVG
 * geometry that must normalize to its selectable HTML host.
 */
const MARKUP = `
<div id="root">
  <div id="wrap">
    <section id="card">
      <div id="head">
        <span id="title">Homecoming</span>
        <button id="more"><svg id="icon" aria-hidden="true"><rect id="bar"></rect></svg></button>
      </div>
      <div id="body"><p id="text">Body copy</p></div>
    </section>
    <section id="card2">
      <div id="head2"><span id="title2">Second</span></div>
    </section>
  </div>
</div>`

/** `[componentName, ...stack frames as "Name@line"]`, nearest-first. */
const SOURCE = {
  root: ["Page", "Page@1"],
  wrap: ["Page", "Page@1"],
  card: ["Card", "Card@10", "Page@2"],
  head: ["Card", "Card@10", "Page@2"],
  title: ["Card", "Card@10", "Page@2"],
  more: ["IconButton", "IconButton@5", "Card@12", "Page@2"],
  icon: ["IconButton", "IconButton@5", "Card@12", "Page@2"],
  bar: ["IconButton", "IconButton@5", "Card@12", "Page@2"],
  body: ["Card", "Card@10", "Page@2"],
  text: ["Card", "Card@10", "Page@2"],
  card2: ["Card", "Card@20", "Page@2"],
  head2: ["Card", "Card@20", "Page@2"],
  title2: ["Card", "Card@20", "Page@2"],
}

function elementInfo(element) {
  const entry = element?.id ? SOURCE[element.id] : null
  if (!entry) return null
  const [componentName, ...frames] = entry
  return {
    tagName: element.tagName.toLowerCase(),
    componentName,
    filePath: `src/${componentName}.tsx`,
    lineNumber: Number(frames[0].split("@")[1]),
    columnNumber: 1,
    stack: frames.map((frame) => {
      const [name, line] = frame.split("@")
      return {
        componentName: name,
        filePath: `src/${name}.tsx`,
        lineNumber: Number(line),
        columnNumber: 1,
      }
    }),
  }
}

function installDom() {
  const dom = new JSDOM(`<!doctype html><html><body>${MARKUP}</body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  })
  const { window } = dom
  // The resolver hit-tests through `elementsFromPoint`, which jsdom does not
  // implement. Cases hand it the stack they mean directly.
  window.document.elementsFromPoint = () => window.__stack ?? []
  // jsdom has no geometry interfaces either; the drag lane reads the current
  // translate off one, and with no layout every fixture sits at the origin.
  // Without layout every rect is 0x0, and the resolver reads zero area as
  // "hidden" — which would empty the hit stack before any rule ran.
  window.Element.prototype.getBoundingClientRect = function box() {
    return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }
  }
  window.Element.prototype.scrollIntoView = function scrollIntoView() {}
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
    "MouseEvent",
    "PointerEvent",
    "KeyboardEvent",
    "Event",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
  ]) {
    // `navigator` is a getter-only global on Node 24, so plain assignment fails.
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
  }
  return window
}

/**
 * One bundle per call, so anything that must share module state — the store is
 * a module singleton — has to be requested in a single `load`.
 */
async function load(contents) {
  const { build } = await import("esbuild")
  const bundled = await build({
    stdin: { contents, resolveDir: path.join(ROOT, "design-editor"), loader: "ts" },
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
  )
}

const id = (window, name) => window.document.getElementById(name)
const nameOf = (element) => element?.id ?? (element === null ? "null" : element.tagName)

// ── Level 1: resolver and keymap ───────────────────────────────────────────

async function resolverCases(window) {
  console.log("\nLevel 1 — resolver")
  const { getResolver, isHidden, isLayerCandidate, toSelectable } = await load(
    `export { getResolver, isHidden, isLayerCandidate, toSelectable } from "./src/core/resolve"`
  )
  const resolver = getResolver({ elementInfo })
  const $ = (name) => id(window, name)

  check("a component instance root is a layer, a bare wrapper is not", () => {
    assert.equal(resolver.isLayerRoot($("card")), true)
    assert.equal(resolver.isLayerRoot($("more")), true)
    assert.equal(resolver.isLayerRoot($("wrap")), false)
    assert.equal(resolver.isLayerRoot($("head")), false)
  })

  check("two call sites of one component are two layers", () => {
    assert.equal(resolver.isLayerRoot($("card2")), true)
    assert.notEqual($("card"), $("card2"))
  })

  check("plain click takes the scope root's direct layer, not the deepest hit", () => {
    assert.equal(nameOf(resolver.resolve($("title"), null)), "root")
  })

  check("deep click takes the deepest layer, and an icon is one", () => {
    assert.equal(nameOf(resolver.resolve($("title"), null, true)), "title")
    // Not "more": the `<svg>` is the node the JSX names, so it is where a deep
    // click lands. Only the geometry inside it still resolves up.
    assert.equal(nameOf(resolver.resolve($("bar"), null, true)), "icon")
  })

  check("drilling the scope moves the click one level at a time", () => {
    assert.equal(nameOf(resolver.resolve($("title"), $("root"))), "wrap")
    assert.equal(nameOf(resolver.resolve($("title"), $("wrap"))), "card")
    assert.equal(nameOf(resolver.resolve($("title"), $("card"))), "head")
    assert.equal(nameOf(resolver.resolve($("title"), $("head"))), "title")
  })

  check("a click outside the scope leaves the scope", () => {
    assert.equal(nameOf(resolver.resolve($("title2"), $("card"))), "root")
  })

  check("layer children are the direct selectable HTML graph", () => {
    assert.deepEqual(resolver.layerChildren($("root")).map(nameOf), ["wrap"])
    assert.deepEqual(resolver.layerChildren($("wrap")).map(nameOf), ["card", "card2"])
    assert.deepEqual(resolver.layerChildren($("card")).map(nameOf), ["head", "body"])
    assert.deepEqual(resolver.layerChildren($("more")).map(nameOf), ["icon"])
    // The icon is a leaf: its geometry resolves up to it, so it lists nothing.
    assert.deepEqual(resolver.layerChildren($("icon")).map(nameOf), [])
  })

  check("Enter descends to the first layer child", () => {
    assert.equal(nameOf(resolver.layerChildren($("root"))[0]), "wrap")
  })

  check("Shift+Enter climbs to the enclosing layer", () => {
    assert.equal(nameOf(resolver.layerParent($("card"))), "wrap")
    assert.equal(nameOf(resolver.layerParent($("more"))), "head")
    assert.equal(nameOf(resolver.layerParent($("root"))), "null")
  })

  check("Tab walks siblings at one depth and wraps", () => {
    const siblings = resolver.layerSiblings($("card"))
    assert.deepEqual(siblings.map(nameOf), ["card", "card2"])
    const next = (element, step) => {
      const list = resolver.layerSiblings(element)
      const index = list.indexOf(element)
      return nameOf(list[(index + step + list.length) % list.length])
    }
    assert.equal(next($("card"), 1), "card2")
    assert.equal(next($("card2"), 1), "card")
    assert.equal(next($("card"), -1), "card2")
  })

  check("the `<svg>` is the layer; the geometry inside it is not", () => {
    assert.equal(isLayerCandidate($("icon")), true)
    assert.equal(resolver.resolve($("bar"), null, true), $("icon"))
    assert.equal(toSelectable($("bar")), $("icon"))
    assert.equal(toSelectable($("icon")), $("icon"))
    // The host is still reachable — one level up, exactly as for any parent.
    assert.equal(resolver.layerParent($("icon")), $("more"))
  })

  check("every plain and deep click result is reachable in the layer graph", () => {
    const graph = new Set()
    const visit = (container) => {
      for (const child of resolver.layerChildren(container)) {
        graph.add(child)
        visit(child)
      }
    }
    visit(window.document.body)
    for (const name of Object.keys(SOURCE)) {
      const hit = $(name)
      const plain = resolver.resolve(hit, null)
      const deep = resolver.resolve(hit, null, true)
      if (plain) assert.equal(graph.has(plain), true, `plain ${name}`)
      if (deep) assert.equal(graph.has(deep), true, `deep ${name}`)
    }
  })

  check("a decorative glyph is painted, so `aria-hidden` does not hide it", () => {
    // Every icon this app ships is `aria-hidden="true"` — correct a11y for a
    // glyph a label already names. Reading that as hidden dropped all of them
    // out of the stack menu while the layers tree went on listing them.
    assert.equal($("icon").getAttribute("aria-hidden"), "true")
    assert.equal(isHidden($("icon")), false)
    assert.equal(isHidden($("more")), false)
    $("more").setAttribute("hidden", "")
    assert.equal(isHidden($("more")), true, "the `hidden` attribute still hides")
    $("more").removeAttribute("hidden")
  })

  check("overlap stack dedupes SVG hosts and follows Layers order", () => {
    window.__stack = [$("bar"), $("icon"), $("more"), $("head"), $("card"), $("wrap"), $("root")]
    // `bar` dedupes into the icon above it; the icon itself is its own row.
    assert.deepEqual(
      resolver.hitStack(10, 10).map(nameOf),
      ["root", "wrap", "card", "head", "more", "icon"]
    )
  })

  console.log("\nLevel 1 — keymap")
  const keymap = await load(`export * from "./src/core/keymap"`)

  const platform = (value) =>
    Object.defineProperty(window.navigator, "platform", { value, configurable: true })

  check("deep select is Cmd on Mac and never Ctrl", () => {
    platform("MacIntel")
    assert.equal(keymap.isDeepSelect({ metaKey: true, ctrlKey: false }), true)
    assert.equal(keymap.isDeepSelect({ metaKey: false, ctrlKey: true }), false)
  })

  check("deep select is Ctrl elsewhere and never Meta", () => {
    platform("Win32")
    assert.equal(keymap.isDeepSelect({ metaKey: false, ctrlKey: true }), true)
    assert.equal(keymap.isDeepSelect({ metaKey: true, ctrlKey: false }), false)
    platform("MacIntel")
  })

  const key = (init) => new window.KeyboardEvent("keydown", init)

  check("keys map to the documented actions", () => {
    assert.equal(keymap.canvasAction(key({ key: "Escape" })), "deselect")
    assert.equal(keymap.canvasAction(key({ key: "Enter" })), "select-child")
    assert.equal(keymap.canvasAction(key({ key: "Enter", shiftKey: true })), "select-parent")
    assert.equal(keymap.canvasAction(key({ key: "Tab" })), "next-sibling")
    assert.equal(keymap.canvasAction(key({ key: "Tab", shiftKey: true })), "prev-sibling")
    assert.equal(keymap.canvasAction(key({ key: "ArrowLeft" })), "nudge")
    assert.equal(keymap.canvasAction(key({ key: "k" })), null)
  })

  check("Escape never means select-parent", () => {
    assert.notEqual(keymap.canvasAction(key({ key: "Escape", shiftKey: true })), "select-parent")
  })

  check("text entry and chrome keep their own keys", () => {
    const input = window.document.createElement("input")
    const chrome = window.document.createElement("div")
    chrome.setAttribute("data-design-editor", "")
    window.document.body.append(input, chrome)

    const dispatched = (target, init) => {
      let seen = null
      const listen = (event) => {
        seen = keymap.ownsCanvasKeys(event)
      }
      window.addEventListener("keydown", listen, true)
      target.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, ...init }))
      window.removeEventListener("keydown", listen, true)
      return seen
    }
    assert.equal(dispatched(window.document.body, { key: "Enter" }), true)
    assert.equal(dispatched(input, { key: "Enter" }), false)
    assert.equal(dispatched(chrome, { key: "Enter" }), false)

    input.remove()
    chrome.remove()
  })
}

// ── Level 2: the real canvas lane ──────────────────────────────────────────

async function canvasCases(window) {
  console.log("\nLevel 2 — canvas lane")
  const { createContext, installCanvas, installLayersPanel, getState, setState } = await load(`
    export { createContext } from "./src/core/context"
    export { installCanvas } from "./src/canvas/index"
    export { installLayersPanel } from "./src/panels/layers"
    export { getState, setState } from "./src/core/store"
  `)
  const store = { getState, setState }

  const slot = () => {
    const node = window.document.createElement("div")
    node.setAttribute("data-design-editor", "")
    window.document.body.append(node)
    return node
  }
  const bridge = {
    elementInfo,
    toast() {},
    store: {
      getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
      viewportToPage: (x, y) => ({ x, y }),
      pageToViewport: (x, y) => ({ x, y }),
    },
  }
  const context = createContext(bridge, {
    overlay: slot(),
    toolbar: slot(),
    left: slot(),
    right: slot(),
  })
  installCanvas(context)
  installLayersPanel(context)
  context.setTool("move")

  const $ = (name) => id(window, name)
  const selection = () => store.getState().selection.map((entry) => nameOf(entry.element))
  const scope = () => nameOf(store.getState().scope)
  const reset = () => store.setState({ selection: [], scope: null, hovered: null })

  /** jsdom has no layout, so the hit stack is declared rather than measured. */
  const at = (element) => {
    const stack = []
    for (let node = element; node && node !== window.document.body; node = node.parentElement) {
      stack.push(node)
    }
    window.__stack = stack
  }

  const pointer = (element, init = {}) => {
    at(element)
    const options = {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        ...init,
      }
    element.dispatchEvent(new window.PointerEvent("pointerdown", options))
    element.dispatchEvent(new window.PointerEvent("pointerup", options))
  }
  const press = (init) =>
    window.document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, ...init })
    )

  check("a plain click selects the top layer and not the leaf", () => {
    reset()
    pointer($("title"))
    assert.deepEqual(selection(), ["root"])
  })

  check("Cmd+click selects the exact leaf and re-points the scope", () => {
    reset()
    pointer($("title"), { metaKey: true })
    assert.deepEqual(selection(), ["title"])
    assert.equal(scope(), "head")
  })

  check("Ctrl+click is not deep select on a Mac", () => {
    reset()
    pointer($("title"), { ctrlKey: true })
    assert.deepEqual(selection(), ["root"])
  })

  check("double-click drills exactly one level", () => {
    reset()
    pointer($("title"))
    at($("title"))
    $("title").dispatchEvent(
      new window.MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 })
    )
    assert.equal(scope(), "root")
    assert.deepEqual(selection(), ["wrap"])
  })

  check("double-clicking SVG geometry drills to the icon, then stops", () => {
    reset()
    pointer($("bar"), { metaKey: true })
    // Deep click takes the icon itself, and the scope follows its parent.
    assert.deepEqual(selection(), ["icon"])
    assert.equal(scope(), "more")
    at($("bar"))
    $("bar").dispatchEvent(
      new window.MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 })
    )
    // The icon is the floor: there is no layer below it to drill into.
    assert.deepEqual(selection(), ["icon"])
    assert.equal(scope(), "more")
  })

  check("shift+click toggles rather than only appending", () => {
    reset()
    pointer($("title"))
    // At the top scope both clicks resolve to the same layer, so the second one
    // removes it. Append-only would have left it selected.
    pointer($("title2"), { shiftKey: true })
    assert.deepEqual(selection(), [])
    store.setState({ selection: [], scope: id(window, "wrap") })
    pointer($("title"), { shiftKey: true })
    pointer($("title2"), { shiftKey: true })
    assert.deepEqual(selection(), ["card", "card2"])
    pointer($("title"), { shiftKey: true })
    assert.deepEqual(selection(), ["card2"])
  })

  check("Enter selects the first child and takes the scope with it", () => {
    reset()
    pointer($("title"))
    press({ key: "Enter" })
    assert.deepEqual(selection(), ["wrap"])
    assert.equal(scope(), "root")
  })

  check("Shift+Enter selects the parent", () => {
    reset()
    pointer($("title"))
    press({ key: "Enter" })
    press({ key: "Enter", shiftKey: true })
    assert.deepEqual(selection(), ["root"])
    assert.equal(scope(), "null")
  })

  check("Tab and Shift+Tab walk siblings", () => {
    reset()
    pointer($("title"))
    press({ key: "Enter" })
    press({ key: "Enter" })
    press({ key: "Tab" })
    assert.deepEqual(selection(), ["card2"])
    press({ key: "Tab", shiftKey: true })
    assert.deepEqual(selection(), ["card"])
  })

  check("a click outside a drilled scope exits to the top layer", () => {
    reset()
    pointer($("title"))
    press({ key: "Enter" })
    press({ key: "Enter" })
    press({ key: "Enter" })
    assert.equal(scope(), "card")
    pointer($("title2"))
    assert.deepEqual(selection(), ["root"])
    assert.equal(scope(), "null")
  })

  check("Shift+drag is reachable over full-bleed content and toggles swept layers", () => {
    reset()
    pointer($("title"))
    press({ key: "Enter" })
    press({ key: "Enter" })
    press({ key: "Enter" })
    assert.deepEqual(selection(), ["head"])
    at($("title"))
    $("title").dispatchEvent(
      new window.PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 10, clientY: 10, shiftKey: true,
      })
    )
    $("title").dispatchEvent(
      new window.PointerEvent("pointermove", {
        bubbles: true, button: 0, clientX: 30, clientY: 30, shiftKey: true,
      })
    )
    $("title").dispatchEvent(
      new window.PointerEvent("pointerup", {
        bubbles: true, button: 0, clientX: 30, clientY: 30, shiftKey: true,
      })
    )
    assert.deepEqual(selection(), ["body"])
  })

  check("Escape deselects and exits the scope, it does not select the parent", () => {
    reset()
    pointer($("title"), { metaKey: true })
    assert.equal(scope(), "head")
    press({ key: "Escape" })
    assert.deepEqual(selection(), [])
    assert.equal(scope(), "null")
  })

  check("hover answers with the same target a click would", () => {
    reset()
    at($("title"))
    $("title").dispatchEvent(
      new window.PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 })
    )
    assert.equal(nameOf(store.getState().hovered), "root")
    press({ key: "Meta", metaKey: true })
    assert.equal(nameOf(store.getState().hovered), "title")
    window.document.body.dispatchEvent(
      new window.KeyboardEvent("keyup", { bubbles: true, key: "Meta", metaKey: false })
    )
    assert.equal(nameOf(store.getState().hovered), "root")
  })

  check("clicking empty background clears both selection and scope", () => {
    reset()
    pointer($("title"), { metaKey: true })
    window.__stack = []
    window.document.body.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 999,
        clientY: 999,
      })
    )
    window.document.body.dispatchEvent(
      new window.PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 999,
        clientY: 999,
      })
    )
    assert.deepEqual(selection(), [])
    assert.equal(scope(), "null")
  })

  check("right-click is left to the layer-stack menu", () => {
    reset()
    pointer($("title"), { button: 2 })
    assert.deepEqual(selection(), [])
  })

  check("overlap menu follows Layers order and Escape closes only the menu", () => {
    reset()
    pointer($("title"))
    const invoker = window.document.createElement("button")
    window.document.body.append(invoker)
    invoker.focus()
    window.document.documentElement.style.setProperty("--de-left", "240px")
    window.document.documentElement.style.setProperty("--de-right", "260px")
    at($("bar"))
    $("bar").dispatchEvent(
      new window.MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })
    )
    const menu = window.document.querySelector(".de-layer-menu")
    const rows = Array.from(menu.querySelectorAll(".de-layer-menu-row"))
    assert.equal(menu.style.display, "block")
    assert.equal(menu.style.left, "248px")
    assert.equal(rows[0].textContent, "Page")
    // The icon is the deepest row now. It has no component boundary of its own
    // in this fixture, so it reads by tag, the same as any unnamed layer.
    assert.equal(rows.at(-2).textContent, "IconButton")
    assert.equal(rows.at(-1).textContent, "svg")
    assert.equal(window.document.activeElement, rows[0])
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }))
    assert.equal(window.document.activeElement, rows.at(-1))
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    assert.equal(menu.style.display, "none")
    assert.equal(window.document.activeElement, invoker)
    assert.deepEqual(selection(), ["root"])
    window.document.documentElement.style.removeProperty("--de-left")
    window.document.documentElement.style.removeProperty("--de-right")
    invoker.remove()
  })

  check("keyboard layer-menu activation restores invocation focus", () => {
    reset()
    const invoker = window.document.createElement("button")
    window.document.body.append(invoker)
    invoker.focus()
    at($("bar"))
    $("bar").dispatchEvent(
      new window.MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })
    )
    const menu = window.document.querySelector(".de-layer-menu")
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }))
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    assert.equal(menu.style.display, "none")
    assert.equal(window.document.activeElement, invoker)
    invoker.remove()
  })

  check("Layers highlights every selected row", () => {
    context.selectMany([$("card"), $("title")])
    const selectedRows = Array.from(
      context.slots.left.querySelectorAll('.de-layer[aria-selected="true"]')
    )
    assert.equal(selectedRows.length, 2)
    assert.deepEqual(
      selectedRows.map((row) => row.querySelector(".de-layer-name").textContent),
      ["Card", "Homecoming"]
    )
  })
}

// ── Run ────────────────────────────────────────────────────────────────────

const window = installDom()
Object.defineProperty(window.navigator, "platform", { value: "MacIntel", configurable: true })

await resolverCases(window)
await canvasCases(window)

console.log(`\n${passed} passed, ${failed} failed`)
// Installed DOM listeners intentionally live for the editor session.
process.exit(failed > 0 ? 1 : 0)
