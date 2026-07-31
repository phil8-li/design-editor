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
  const inventory = await load("design-editor/src/options/inventory.ts")

  check("no __STORE reports an empty state instead of throwing", () => {
    delete dom.window.__STORE
    const result = inventory.readInventory()
    assert.equal(result.available, false)
    assert.match(result.reason, /window\.__STORE/)
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
await baselineCases()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
