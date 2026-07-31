/**
 * Cases for the options subsystem: the Leva inventory bridge, the
 * null-prototype guard on page-supplied keys, and baseline persistence.
 *
 * No browser and no servers. The inventory bridge is exercised against a
 * stubbed `window.__STORE` inside jsdom, and baseline persistence is checked
 * against the *real* server normaliser rather than a copy of it, because the
 * failure this guards against is precisely the normaliser silently dropping a
 * field the client added.
 *
 * Usage: node design-editor/test/options-cases.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
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

/** Loads a TypeScript module through the bundler this package already uses. */
async function load(relativePath) {
  const { build } = await import("esbuild")
  const bundled = await build({
    entryPoints: [path.join(ROOT, relativePath)],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
  const source = Buffer.from(bundled.outputFiles[0].text).toString("base64")
  return import(`data:text/javascript;base64,${source}`)
}

/** The shape leva's `Store.getData()` returns, reduced to what we read. */
function stubStore(data, visiblePaths) {
  const writes = []
  return {
    writes,
    getData: () => data,
    getVisiblePaths: () => visiblePaths,
    setValueAtPath(pathName, value) {
      if (pathName === "Broken.control") throw new Error("Selected value doesn't match")
      writes.push([pathName, value])
    },
  }
}

const SAMPLE = {
  "Overview.Hover.hoverPreset": {
    type: "SELECT",
    label: "preset",
    value: "Lift",
    settings: { keys: ["None", "Lift", "Tilt 3D"], values: ["None", "Lift", "Tilt 3D"] },
  },
  "Overview.Hover.hoverScale": {
    type: "NUMBER",
    label: "scale",
    value: 1.02,
    settings: { min: 1, max: 1.2, step: 0.01 },
  },
  // Ten of these share one schema in project-shell and are disambiguated with
  // trailing zero-width spaces, so the label needs normalising to be matched.
  "Overview.Hover.save": { type: "BUTTON", label: "save as default​​", value: null },
  "Overview.Analytics.chart types.barWidth": { type: "NUMBER", label: "bar width", value: 12 },
  "Sidebar.Width.collapsed": { type: "BOOLEAN", label: "collapsed", value: false },
}
const SAMPLE_VISIBLE = [
  "Overview.Hover.hoverPreset",
  "Overview.Hover.hoverScale",
  "Overview.Hover.save",
  "Sidebar.Width.collapsed",
]

async function inventoryCases() {
  console.log("\nInventory bridge")

  const dom = new JSDOM("<!doctype html><html><body></body></html>")
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.Element = dom.window.Element
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.CustomEvent = dom.window.CustomEvent
  globalThis.__DESIGN_EDITOR_CONFIG__ = {
    controls: {
      leva: {
        storeGlobal: "__STORE",
        sourceDefaults: true,
        bindings: [
          {
            pathPattern: "Overview.Hover.*",
            selectors: ["[data-card]"],
            relationship: "spacing within",
            defaultGroup: "Card hover",
            defaultKey: null,
          },
        ],
      },
    },
  }
  const inventory = await load("design-editor/src/options/inventory.ts")

  check("no __STORE reports an empty state instead of throwing", () => {
    delete dom.window.__STORE
    const result = inventory.readInventory()
    assert.equal(result.available, false)
    assert.match(result.reason, /configured Leva store/)
  })

  check("an object that is not a leva store is refused", () => {
    dom.window.__STORE = { getData: 1 }
    assert.equal(inventory.levaStore(), null)
    assert.equal(inventory.readInventory().available, false)
  })

  check("a store with no registered controls reports why, not zero rows", () => {
    dom.window.__STORE = stubStore({}, [])
    const result = inventory.readInventory()
    assert.equal(result.available, false)
    assert.match(result.reason, /not registered any controls/)
  })

  check("a stubbed store is projected into sections, folders and controls", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const result = inventory.readInventory()
    assert.equal(result.available, true)
    assert.deepEqual(
      result.sections.map((section) => section.name),
      ["Overview", "Sidebar"]
    )
    const overview = result.sections[0]
    assert.deepEqual(
      overview.folders.map((folder) => folder.name),
      ["Hover", "Analytics"]
    )
    // 2 in Hover + 1 in Analytics/chart types; the save button is not a control.
    assert.equal(overview.controlCount, 3)
    assert.equal(result.controlCount, 4)
  })

  check("a save-as-default button becomes a folder badge, not a row", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const hover = inventory.readInventory().sections[0].folders[0]
    assert.equal(hover.hasSaveDefault, true)
    assert.deepEqual(
      hover.controls.map((control) => control.key),
      ["hoverPreset", "hoverScale"]
    )
  })

  check("named variants come through as the list a designer built", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const result = inventory.readInventory()
    const preset = result.sections[0].folders[0].controls[0]
    assert.deepEqual(preset.variants, ["None", "Lift", "Tilt 3D"])
    assert.equal(preset.value, "Lift")
    assert.equal(result.selectCount, 1)
    assert.equal(result.variantCount, 3)
  })

  check("explicit bindings annotate relevance and the source-default address", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const control = inventory.readInventory().sections[0].folders[0].controls[0]
    assert.equal(control.relationship, "spacing within")
    assert.deepEqual(control.selectors, ["[data-card]"])
    assert.equal(control.defaultGroup, "Card hover")
    assert.equal(control.defaultKey, "hoverPreset")
    assert.equal(control.canPersistDefault, true)
  })

  check("unbound paths stay unbound instead of guessing from their names", () => {
    const tree = inventory.buildTree(SAMPLE, SAMPLE_VISIBLE, [])
    const control = tree.sections[0].folders[0].controls[0]
    assert.equal(control.relationship, null)
    assert.deepEqual(control.selectors, [])
    assert.equal(control.defaultGroup, null)
  })

  check("highlight dispatch carries only host-declared target elements", () => {
    const card = dom.window.document.createElement("article")
    card.setAttribute("data-card", "")
    dom.window.document.body.append(card)
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const control = inventory.readInventory().sections[0].folders[0].controls[0]
    let detail = null
    dom.window.addEventListener("design-editor:highlight-elements", (event) => {
      detail = event.detail
    }, { once: true })
    const resolved = inventory.highlightControlTargets(control)
    assert.deepEqual(resolved.elements, [card])
    assert.deepEqual(detail.elements, [card])
    assert.equal(detail.relationship, "spacing within")
  })

  check("a control hidden by a render predicate is listed, flagged hidden", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const nested = inventory.readInventory().sections[0].folders[1].folders[0].controls[0]
    assert.equal(nested.key, "barWidth")
    assert.equal(nested.visible, false)
  })

  check("number bounds survive so the editor can clamp", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const scale = inventory.readInventory().sections[0].folders[0].controls[1]
    assert.deepEqual(scale.bounds, { min: 1, max: 1.2, step: 0.01 })
  })

  check("setControlValue writes through, and a rejection is a false not a throw", () => {
    const store = stubStore(SAMPLE, SAMPLE_VISIBLE)
    dom.window.__STORE = store
    assert.equal(inventory.setControlValue("Overview.Hover.hoverPreset", "Tilt 3D"), true)
    assert.deepEqual(store.writes, [["Overview.Hover.hoverPreset", "Tilt 3D"]])
    // The rejection path warns on purpose; the stack would drown the results.
    const warn = console.warn
    console.warn = () => {}
    try {
      assert.equal(inventory.setControlValue("Broken.control", "x"), false)
    } finally {
      console.warn = warn
    }
  })

  check("subscribeToLeva degrades to a no-op when the store has no useStore", () => {
    dom.window.__STORE = stubStore(SAMPLE, SAMPLE_VISIBLE)
    const unsubscribe = inventory.subscribeToLeva(() => {})
    assert.equal(typeof unsubscribe, "function")
    unsubscribe()
  })

  check("filtering matches a variant name, not just the control name", () => {
    const tree = inventory.buildTree(SAMPLE, SAMPLE_VISIBLE)
    const hit = inventory.filterTree(tree.sections, "tilt 3d")
    assert.deepEqual(
      hit.map((section) => section.name),
      ["Overview"]
    )
    assert.deepEqual(
      hit[0].folders[0].controls.map((control) => control.key),
      ["hoverPreset"]
    )
  })

  check("filtering a folder name keeps everything inside it", () => {
    const tree = inventory.buildTree(SAMPLE, SAMPLE_VISIBLE)
    const hit = inventory.filterTree(tree.sections, "sidebar")
    assert.equal(hit.length, 1)
    assert.equal(hit[0].controlCount, 1)
  })

  return inventory
}

function prototypeCases(inventory) {
  console.log("\nNull-prototype guard")

  check("the index every path is keyed on has no prototype", () => {
    assert.equal(Object.getPrototypeOf(inventory.nullIndex()), null)
  })

  check("a __proto__ path builds a folder instead of reassigning the prototype", () => {
    const data = {
      "__proto__.polluted.key": { type: "STRING", label: "key", value: "x" },
      "Real.Folder.key": { type: "STRING", label: "key", value: "y" },
    }
    const tree = inventory.buildTree(data, Object.keys(data))
    assert.equal({}.polluted, undefined, "Object.prototype was polluted")
    assert.equal(Object.prototype.polluted, undefined)
    assert.ok(
      tree.sections.some((section) => section.name === "__proto__"),
      "the __proto__ segment should be listed as an ordinary folder"
    )
    assert.equal(tree.controlCount, 2)
  })

  check("a __proto__ entry in visiblePaths is not read off Object.prototype", () => {
    const tree = inventory.buildTree({}, ["__proto__", "toString"])
    assert.equal(tree.controlCount, 0)
    assert.deepEqual(tree.sections, [])
  })

  check("zero-width padding does not create ten distinct labels", () => {
    assert.equal(inventory.plainLabel("save as default​​‍"), "save as default")
    assert.equal(inventory.plainLabel(undefined), "")
  })
}

async function sourceDefaultCases() {
  console.log("\nSource-backed control defaults")
  const { browserPrelude, resolveConfig } = await import(path.join(ROOT, "design-editor/config.mjs"))
  const { createControlDefaults } = await import(
    path.join(ROOT, "design-editor/server/control-defaults.mjs")
  )
  const { createDesignEditorRoutes } = await import(
    path.join(ROOT, "design-editor/server/routes.mjs")
  )
  const fixtureDir = path.join(ROOT, "design-editor/test/.control-default-fixture")
  const fixture = path.join(fixtureDir, "defaults.ts")
  const source = `// unrelated header stays byte-for-byte\nexport const DEFAULTS: Record<string, Record<string, unknown>> = {\n  "Card": {\n    // keep this note\n    "gap": 8,\n    "color": "#fff",\n    "dynamic": makeDefault(),\n  },\n  "Other": { "flag": true },\n}\n\nexport const SENTINEL = "untouched"\n`

  await fs.mkdir(fixtureDir, { recursive: true })
  await fs.writeFile(fixture, source)
  const config = resolveConfig(
    {
      projectRoot: ROOT,
      source: { roots: [fixtureDir], extensions: [".ts"] },
      controls: {
        leva: {
          storeGlobal: "__STORE",
          sourceDefaults: { file: fixture, exportName: "DEFAULTS" },
          bindings: [],
        },
      },
    },
    { cwd: ROOT }
  )
  const defaults = createControlDefaults(config)

  check("generic defaults do not assume Leva, Agentation, or host chrome", () => {
    const generic = resolveConfig({}, { cwd: ROOT })
    assert.deepEqual(generic.chrome.trustedSelectors, [])
    assert.equal(generic.chrome.trustedSelector, "")
    assert.equal(generic.controls.leva, null)
  })

  check("the browser prelude excludes source-default file and export details", () => {
    const prelude = browserPrelude(config)
    assert.match(prelude, /"storeGlobal":"__STORE"/)
    assert.match(prelude, /"sourceDefaults":true/)
    assert.doesNotMatch(prelude, /defaults\.ts/)
    assert.doesNotMatch(prelude, /DEFAULTS/)
  })

  await checkAsync("reads and replaces one literal without reformatting the file", async () => {
    assert.deepEqual(await defaults.read("Card", "gap"), {
      configured: true,
      exists: true,
      value: 8,
    })
    await defaults.write("Card", "gap", 12)
    assert.equal(await fs.readFile(fixture, "utf8"), source.replace('"gap": 8', '"gap": 12'))
  })

  await checkAsync("adds and removes one key while preserving unrelated comments/content", async () => {
    await defaults.write("Card", "radius", 20)
    let next = await fs.readFile(fixture, "utf8")
    assert.match(next, /"radius": 20/)
    assert.match(next, /\/\/ keep this note/)
    assert.match(next, /export const SENTINEL = "untouched"/)
    assert.deepEqual(await defaults.remove("Card", "color"), { configured: true, existed: true })
    next = await fs.readFile(fixture, "utf8")
    assert.doesNotMatch(next, /"color"/)
    assert.match(next, /"gap": 12/)
    assert.match(next, /"radius": 20/)
    assert.match(next, /"Other": \{ "flag": true \}/)
  })

  await checkAsync("refuses to read, update, or remove a dynamic expression", async () => {
    await assert.rejects(defaults.read("Card", "dynamic"), /dynamic/)
    await assert.rejects(defaults.write("Card", "dynamic", 1), /dynamic/)
    await assert.rejects(defaults.remove("Card", "dynamic"), /dynamic/)
  })

  await checkAsync("loopback routes expose GET, PUT, and DELETE against the configured literal", async () => {
    const routes = createDesignEditorRoutes(config)
    const server = http.createServer((request, response) => {
      if (routes.handle(request, response)) return
      response.writeHead(404).end()
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    const base = `http://127.0.0.1:${address.port}${config.apiPrefix}/control-default`
    const url = `${base}?${new URLSearchParams({ group: "Other", key: "flag" })}`
    try {
      const initial = await (await fetch(url)).json()
      assert.deepEqual(initial, { configured: true, exists: true, value: true })
      const put = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: false }),
      })
      assert.equal(put.status, 200)
      assert.equal((await put.json()).value, false)
      assert.match(await fs.readFile(fixture, "utf8"), /"Other": \{ "flag": false \}/)
      const drop = await fetch(url, { method: "DELETE" })
      assert.deepEqual(await drop.json(), { configured: true, existed: true })
      assert.doesNotMatch(await fs.readFile(fixture, "utf8"), /"flag"/)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  check("refuses a configured defaults file outside editable source roots", () => {
    const unsafe = resolveConfig(
      {
        projectRoot: ROOT,
        source: { roots: [fixtureDir], extensions: [".ts"] },
        controls: {
          leva: {
            storeGlobal: "__STORE",
            sourceDefaults: { file: path.join(ROOT, "elsewhere.ts"), exportName: "DEFAULTS" },
            bindings: [],
          },
        },
      },
      { cwd: ROOT }
    )
    assert.throws(() => createControlDefaults(unsafe), /outside editable source roots/)
  })

  await fs.rm(fixtureDir, { recursive: true, force: true })
}

async function writerCases() {
  console.log("\nClass snapshot writer")
  const { createWriter } = await load("design-editor/src/core/writer.ts")
  const parent = document.createElement("div")
  parent.className = "parent-shell"
  const element = document.createElement("button")
  element.className = "rounded px-2 text-sm"
  parent.append(element)
  document.body.append(parent)

  const pending = []
  const bridge = {
    toast() {},
    store: {
      addPendingPropertyOperation(key, operation, propertyKeys) {
        pending.push({ key, operation, propertyKeys })
      },
    },
  }
  const selection = {
    element,
    tagName: "button",
    componentName: "Button",
    key: "Button:1:button0",
    source: {
      filePath: "src/Button.tsx",
      lineNumber: 1,
      columnNumber: 1,
      componentName: "Button",
    },
  }
  const writer = createWriter(bridge)

  check("class swaps queue the removal and preserve pre-mutation identity", () => {
    writer.applyClasses(selection, { remove: ["px-2"], add: ["px-4"] }, "Swap padding")
    assert.equal(element.className, "rounded text-sm px-4")
    assert.equal(pending[0].operation.className, "rounded px-2 text-sm")
    assert.equal(pending[0].operation.parentClassName, "parent-shell")
    assert.deepEqual(pending[0].operation.updates[0], {
      tailwindPrefix: "px-2",
      tailwindToken: "px-4",
      value: "px-4",
      standalone: true,
      classPattern: "^px-2$",
    })
  })

  check("a pure removal queues an empty exact replacement instead of preview-only", () => {
    writer.applyClasses(selection, { remove: ["text-sm"], add: [] }, "Remove text size")
    assert.equal(element.classList.contains("text-sm"), false)
    assert.equal(pending[1].operation.className, "rounded text-sm px-4")
    assert.equal(pending[1].operation.updates[0].tailwindToken, "")
    assert.equal(pending[1].operation.updates[0].classPattern, "^text-sm$")
  })

  parent.remove()
}

async function baselineCases() {
  console.log("\nBaseline persistence")

  const client = await load("design-editor/src/options/store.ts")
  const { normalizeOptionSet } = await import(
    path.join(ROOT, "design-editor/server/options-store.mjs")
  )

  const KEY = "ProjectShell:412:div0/div1/div2/div3/main0/button3"
  const baseline = {
    id: client.BASELINE_OPTION_ID,
    name: "Before options",
    className: "rounded-md p-2",
    style: { opacity: "1" },
    createdAt: 1,
  }
  const saved = {
    id: "abc",
    name: "Option 1",
    className: "rounded-xl p-4",
    style: { opacity: "0.9" },
    createdAt: 2,
  }
  const set = { key: KEY, label: "ProjectShell", activeOptionId: "abc", options: [baseline, saved] }

  check("the baseline survives the server normaliser's four-field rebuild", () => {
    const stored = normalizeOptionSet(JSON.parse(JSON.stringify(set)), KEY)
    const roundTripped = client.baselineOf(stored, KEY)
    assert.deepEqual(roundTripped, {
      className: "rounded-md p-2",
      style: { opacity: "1" },
      text: undefined,
    })
  })

  check("a top-level baseline field would NOT have survived — hence the option slot", () => {
    const stored = normalizeOptionSet({ ...set, options: [saved], baseline }, KEY)
    assert.equal(stored.baseline, undefined)
    assert.equal(client.baselineOf(stored, KEY), null)
  })

  check("the baseline is never shown as one of the saved options", () => {
    const stored = normalizeOptionSet(JSON.parse(JSON.stringify(set)), KEY)
    assert.deepEqual(
      client.visibleOptions(stored).map((option) => option.id),
      ["abc"]
    )
    assert.equal(client.visibleOptions(null).length, 0)
  })

  check("the baseline can never become the active option", () => {
    const stored = normalizeOptionSet(
      { ...set, activeOptionId: client.BASELINE_OPTION_ID },
      KEY
    )
    // The server only keeps an active id that names a real option, and the
    // client filters the baseline out of every list, so nothing can select it.
    assert.equal(stored.activeOptionId, client.BASELINE_OPTION_ID)
    assert.equal(
      client.visibleOptions(stored).some((option) => option.id === stored.activeOptionId),
      false
    )
  })

  check("a set with only a baseline reads as having no options", () => {
    const stored = normalizeOptionSet({ ...set, activeOptionId: null, options: [baseline] }, KEY)
    assert.equal(client.visibleOptions(stored).length, 0)
    assert.notEqual(client.baselineOf(stored, KEY), null)
  })
}

const inventory = await inventoryCases()
prototypeCases(inventory)
await sourceDefaultCases()
await writerCases()
await baselineCases()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
