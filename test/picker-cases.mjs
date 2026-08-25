/**
 * Design-system token picker cases: the field, the popover, and the one rule
 * that keeps the fix from rotting — nothing code-shaped reaches the screen.
 *
 * The catalog and the matching underneath live in token-cases.mjs. Everything
 * here is about what a designer sees and can do with a pointer or a keyboard.
 *
 * Usage: node design-editor/test/picker-cases.mjs
 */

import assert from "node:assert/strict"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

import { browserPrelude, loadConfig } from "../config.mjs"

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url))
const ROOT = path.dirname(PACKAGE_DIR)

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

async function checkAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

async function loadEditorHelpers() {
  const { build } = await import("esbuild")
  const bundled = await build({
    stdin: {
      contents: `
        export { createContext } from "./src/core/context"
        export { installInspector } from "./src/panels/inspector"
        export { tokenPickerCss } from "./src/core/css/token-picker"
        export { tokens } from "./src/core/tokens"
      `,
      resolveDir: PACKAGE_DIR,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
  )
}

const workspace = await loadConfig({ configPath: path.join(ROOT, "design-editor.config.mjs") })
const browserSandbox = { window: {} }
vm.runInNewContext(browserPrelude(workspace, { proxyPort: 4567 }), browserSandbox)
globalThis.__DESIGN_EDITOR_CONFIG__ = browserSandbox.window.__DESIGN_EDITOR_CONFIG__
const helpers = await loadEditorHelpers()

/** Mounts the real inspector over a fixture, the way token-cases.mjs does. */
async function withInspector(markup, run) {
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  })
  const { window } = dom
  for (const key of [
    "window", "document", "navigator", "Node", "Element", "HTMLElement",
    "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement",
    "Event", "CustomEvent", "KeyboardEvent", "PointerEvent", "requestAnimationFrame",
    "cancelAnimationFrame", "getComputedStyle",
  ]) {
    Object.defineProperty(globalThis, key, {
      value: key === "getComputedStyle" ? window.getComputedStyle.bind(window) : window[key],
      configurable: true,
      writable: true,
    })
  }

  const right = window.document.createElement("aside")
  right.setAttribute("data-design-editor", "")
  window.document.body.append(right)
  const slot = () => {
    const node = window.document.createElement("div")
    node.setAttribute("data-design-editor", "")
    window.document.body.append(node)
    return node
  }
  const pending = []
  const bridge = {
    elementInfo: () => ({
      tagName: "div", componentName: "Fixture", filePath: "/tmp/fixture.tsx",
      lineNumber: 1, columnNumber: 0, stack: [],
    }),
    send() {}, subscribe: () => () => {}, toast() {},
    store: {
      addPendingPropertyOperation: (...args) => pending.push(args),
      getCanvasTransform: () => ({ x: 0, y: 0, scale: 1 }),
      setCanvasTransform() {}, onCanvasTransformChange: () => () => {},
      onStateChange: () => () => {}, hasChanges: () => false, canUndo: () => false,
      canvasUndo: () => null,
    },
  }
  const editor = helpers.createContext(bridge, {
    overlay: slot(), toolbar: slot(), left: slot(), right,
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
  const paint = () => new Promise((resolve) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  )
  try {
    helpers.installInspector(editor)
    editor.select(window.document.getElementById("target"))
    await paint()
    await run({ window, right, target: window.document.getElementById("target"), pending, paint })
  } finally {
    globalThis.fetch = originalFetch
    dom.window.close()
  }
}

const field = (right, property) =>
  right.querySelector(`[data-de-field="design-system.${property}"]`)

function open(harness, property) {
  const node = field(harness.right, property)
  assert.ok(node, `${property} has no field`)
  node.click()
  const popover = harness.window.document.querySelector(".de-token-popover")
  assert.ok(popover, `${property} opened no picker`)
  return { node, popover }
}

const rowsOf = (popover) => [...popover.querySelectorAll(".de-token-row")]
const key = (window, node, name) =>
  node.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))

const FIXTURE = `<div id="target" class="bg-background p-4" style="display:flex;padding:16px;gap:16px;background-color:var(--color-background);border-radius:20px;font-size:16px;line-height:20px">Hello<span></span></div>`

console.log("\nToken field")

await checkAsync("the closed field is a swatch and a name, and nothing else", async () => {
  await withInspector(FIXTURE, async ({ right }) => {
    const fill = field(right, "fill-color")
    assert.equal(fill.tagName, "BUTTON", "the field must be one target, not a native select")
    assert.equal(fill.getAttribute("aria-haspopup"), "listbox")
    assert.ok(fill.querySelector(".de-token-swatch--color"), "the field lost its swatch")
    assert.equal(fill.textContent, "Background/Primary")

    // A text style previews the face rather than describing it.
    const specimen = field(right, "text-style").querySelector(".de-token-swatch--text")
    assert.ok(specimen, "the text style field lost its specimen")
    assert.equal(specimen.textContent, "Ag")
  })
})

await checkAsync("an unbound field shows the plain value with no label in front of it", async () => {
  await withInspector(
    `<div id="target" style="display:flex;gap:16px;background-color:rgb(240, 242, 245)">Hi<span></span></div>`,
    async ({ right }) => {
      const fill = field(right, "fill-color")
      assert.equal(fill.textContent, "#f0f2f5")
      assert.ok(
        fill.querySelector(".de-token-field-name--plain"),
        "an unbound value must read as the element's own, not as a name"
      )
    }
  )
})

console.log("\nPicker popover")

await checkAsync("the list groups by path prefix and each row carries only its leaf", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { popover } = open(harness, "fill-color")
    const list = popover.querySelector(".de-token-list")
    let group = null
    const seen = new Map()
    for (const node of list.children) {
      if (node.classList.contains("de-token-group")) {
        group = node.textContent
        continue
      }
      const leaf = node.querySelector(".de-token-row-name").textContent
      assert.ok(group, "a row appeared before any group header")
      assert.ok(!leaf.includes("/"), `the row still repeats its path: ${leaf}`)
      seen.set(`${group}/${leaf}`, true)
    }
    // The split has to reconstruct the token exactly, or the picker is showing
    // a name the design system does not have.
    assert.ok(seen.has("Background/Primary"), "Background/Primary went missing in the split")
    assert.ok(seen.has("Text and Icon/On chrome (weak)"), "a multi-word group did not survive")
    assert.equal(seen.size, 71, "the colour catalog lost rows to the grouping")

    // Exactly one header per group, so `Background` is not said forty times.
    const headers = [...popover.querySelectorAll(".de-token-group")].map((node) => node.textContent)
    assert.equal(new Set(headers).size, headers.length, "a group was headed twice")
    assert.ok(headers.includes("Background"))
  })
})

await checkAsync("a text style row pairs its specimen with its size and leading", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { popover } = open(harness, "text-style")
    const row = popover.querySelector('[data-de-choice="typography:heading-h1"]')
    assert.equal(row.querySelector(".de-token-swatch--text").textContent, "Ag")
    assert.equal(row.querySelector(".de-token-row-name").textContent, "H1")
    assert.equal(row.querySelector(".de-token-row-detail").textContent, "36/40")
  })
})

await checkAsync("search filters on the name, case-insensitively", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { window } = harness
    const { popover } = open(harness, "fill-color")
    const search = popover.querySelector(".de-token-search-input")
    assert.equal(search.getAttribute("placeholder"), "Search")
    assert.equal(window.document.activeElement, search, "the search did not take focus on open")

    search.value = "DECORATIVE"
    search.dispatchEvent(new window.Event("input", { bubbles: true }))
    const leaves = rowsOf(popover).map((row) => row.querySelector(".de-token-row-name").textContent)
    assert.deepEqual(leaves, [
      "Amber", "Blue", "Coral", "Ochre", "Green", "Indigo", "Lime", "Teal", "Violet", "On chrome",
      "On decorative",
    ])
    // The whole path is searched, so a hit inside another family brings its own
    // header with it rather than being filed under the one the typing named.
    assert.deepEqual(
      [...popover.querySelectorAll(".de-token-group")].map((node) => node.textContent),
      ["Decorative", "Text and Icon"]
    )

    search.value = "nothing here"
    search.dispatchEvent(new window.Event("input", { bubbles: true }))
    assert.equal(rowsOf(popover).length, 0)
    assert.equal(popover.querySelector(".de-token-empty").textContent, "No matches")
  })
})

await checkAsync("the selected row is filled with the accent and inked with its counterpart", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { popover } = open(harness, "fill-color")
    const selected = popover.querySelectorAll('[aria-selected="true"]')
    assert.equal(selected.length, 1, "exactly one row is the binding")
    assert.equal(selected[0].getAttribute("data-de-choice"), "color:background-primary")
    assert.ok(selected[0].querySelector(".de-token-row-check svg"), "the selected row lost its check")
  })
})

check("the selected row's ink is the accent's counterpart, never white", () => {
  const rule = helpers.tokenPickerCss
    .split("\n")
    .find((line) => line.startsWith('.de-token-row[aria-selected="true"] {'))
  assert.ok(rule, "the selected-row rule went missing")
  // The design system's accent is a LIGHT indigo, so the ink flips instead of
  // the surface darkening. White here would land at 1.7:1 and vanish.
  assert.ok(rule.includes(helpers.tokens.color.accentSurface), "the fill is not the accent surface")
  assert.ok(rule.includes(helpers.tokens.color.onAccent), "the ink is not the accent's counterpart")
  assert.ok(!rule.includes("#ffffff"), "white ink on a light accent")
})

console.log("\nKeyboard and dismissal")

await checkAsync("arrows move the active row and Enter commits it", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { window, right, target, pending } = harness
    const { popover } = open(harness, "corner-radius")
    const search = popover.querySelector(".de-token-search-input")

    search.value = "2xl"
    search.dispatchEvent(new window.Event("input", { bubbles: true }))
    assert.equal(rowsOf(popover).length, 1)

    key(window, search, "ArrowDown")
    key(window, search, "ArrowUp")
    assert.equal(rowsOf(popover)[0].getAttribute("data-active"), "true")

    const before = field(right, "corner-radius")
    key(window, search, "Enter")
    await harness.paint()

    assert.equal(window.document.querySelector(".de-token-popover"), null, "the picker stayed open")
    assert.match(target.style.borderRadius, /var\(--radius-2xl\)/)
    assert.ok(pending.length > 0, "the pick queued no source operation")
    // The commit rebuilds the panel, so the field the keyboard was on has to be
    // handed back or the next arrow key goes to <body>.
    const after = field(right, "corner-radius")
    assert.notEqual(after, before, "the inspector did not rebuild")
    assert.equal(window.document.activeElement, after)
    assert.equal(after.textContent, "radius/2xl")
  })
})

await checkAsync("Escape closes and hands focus back to the field", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { window } = harness
    const { node, popover } = open(harness, "fill-color")
    key(window, popover.querySelector(".de-token-search-input"), "Escape")
    assert.equal(window.document.querySelector(".de-token-popover"), null)
    assert.equal(window.document.activeElement, node)
    assert.equal(node.getAttribute("aria-expanded"), "false")
  })
})

await checkAsync("a click outside closes the picker", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { window } = harness
    open(harness, "fill-color")
    window.document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true }))
    assert.equal(window.document.querySelector(".de-token-popover"), null)
  })
})

await checkAsync("the picker flips above the field rather than off the bottom", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { window } = harness
    // 320 of list under a field at y=700 in a 768-tall window: below is off the
    // screen, and the rows past the edge are rows that cannot be picked.
    window.Element.prototype.getBoundingClientRect = () => ({
      top: 700, bottom: 724, left: 100, right: 360, width: 260, height: 320, x: 100, y: 700,
    })
    const { popover } = open(harness, "fill-color")
    assert.equal(popover.style.top, "376px")
    assert.equal(popover.style.left, "100px")
  })
})

console.log("\nNothing code-shaped on the screen")

/**
 * The case that keeps this fix from rotting.
 *
 * Every one of these was on the screen before: option labels spelled the
 * Tailwind stem and the custom property, and the hints under them said Bound,
 * Value matches and Custom value. A row that regrows any of them fails here
 * rather than in a screenshot six weeks later.
 */
const BANNED = [
  "var(", "--", "oklch(", "lab(", "color-mix(", "rgb(",
  "bg-", "text-[", "rounded-", "shadow-[", "gap-", "size-",
  "Bound", "Value matches", "authored", "Custom value", "token id", ".de-",
]

await checkAsync("no field, list or hint carries a machine spelling", async () => {
  await withInspector(FIXTURE, async (harness) => {
    const { right } = harness
    const properties = [...right.querySelectorAll('[data-de-field^="design-system."]')].map((node) =>
      node.getAttribute("data-de-field").replace("design-system.", "")
    )
    assert.ok(properties.length >= 6, `only ${properties.length} rows to scan`)

    const read = []
    for (const property of properties) {
      read.push(field(right, property).closest(".de-stack").textContent)
      const { popover } = open(harness, property)
      read.push(popover.textContent)
    }
    const offenders = (text) => BANNED.filter((banned) => text.includes(banned))
    for (const text of read) {
      assert.deepEqual(offenders(text), [], `a machine spelling is on the screen: ${text.slice(0, 160)}`)
    }
    // A sweep that cannot fail is not a sweep: this is the label the old row
    // shipped, and it has to come back flagged.
    assert.deepEqual(offenders("Bound: Background/Primary · bg-background · var(--sem-background-primary)"), [
      "var(", "--", "bg-", "Bound",
    ])
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
