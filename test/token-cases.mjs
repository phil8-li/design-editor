/**
 * Deterministic design-system catalog, token-matching, and token-row cases.
 *
 * Breakpoints and responsive classes live in responsive-cases.mjs.
 */

import assert from "node:assert/strict"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

import { browserPrelude, loadConfig, resolveConfig } from "../config.mjs"

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
        export * from "./src/core/design-system"
        export { toClassUpdate } from "./src/core/tailwind"
        export { createContext } from "./src/core/context"
        export { installInspector } from "./src/panels/inspector"
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

console.log("\nDesign-system catalog")

const workspace = await loadConfig({
  configPath: path.join(ROOT, "design-editor.config.mjs"),
})
const catalog = workspace.designSystem.catalog
const prelude = browserPrelude(workspace, { proxyPort: 4567 })
const browserSandbox = { window: {} }
vm.runInNewContext(prelude, browserSandbox)

check("the Workspaces catalog is the non-vacuous 123-asset export", () => {
  const counts = {
    colors: catalog.colors.length,
    spacing: catalog.spacing.length,
    radii: catalog.radii.length,
    text: catalog.textStyles.length + catalog.uiTextStyles.length,
    effects: catalog.effects.length,
    icons: catalog.icons.length,
    motion: catalog.motion.length,
  }
  assert.deepEqual(counts, {
    colors: 71,
    spacing: 11,
    radii: 8,
    text: 12,
    effects: 6,
    icons: 6,
    motion: 9,
  })
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 123)

  const ids = [
    ...catalog.colors,
    ...catalog.spacing,
    ...catalog.radii,
    ...catalog.textStyles,
    ...catalog.uiTextStyles,
    ...catalog.effects,
    ...catalog.icons,
    ...catalog.motion,
  ].map((token) => token.id)
  assert.equal(new Set(ids).size, ids.length, "catalog token ids must be unique")
})

check("a generic host gets no borrowed product tokens", () => {
  const generic = resolveConfig({}, { cwd: PACKAGE_DIR }).designSystem.catalog
  for (const group of [
    "colors",
    "spacing",
    "radii",
    "textStyles",
    "uiTextStyles",
    "effects",
    "icons",
    "motion",
  ]) {
    assert.deepEqual(generic[group], [], `${group} should be empty`)
  }
  assert.equal(generic.name, null)
  assert.deepEqual(generic.aliases, { cssVariables: [], tailwind: [] })
  assert.deepEqual(
    generic.breakpoints.map(({ name, prefix, values }) => [name, prefix, values.default]),
    [
      ["sm", "sm:", 640],
      ["md", "md:", 768],
      ["lg", "lg:", 1024],
      ["xl", "xl:", 1280],
      ["2xl", "2xl:", 1536],
    ]
  )
})

check("the browser prelude carries the catalog but no server filesystem paths", () => {
  assert.equal(prelude.includes(ROOT), false)
  assert.equal(prelude.includes("docs/figma-conversion/tokens.figma.json"), false)
  assert.equal(prelude.includes("src/app/globals.css"), false)

  const browserConfig = browserSandbox.window.__DESIGN_EDITOR_CONFIG__
  assert.equal(browserConfig.designSystem.colors.length, 71)
  assert.equal(browserConfig.designSystem.breakpoints.length, 5)
  assert.equal("manifest" in browserConfig.designSystem, false)
  assert.equal("cssSources" in browserConfig.designSystem, false)
})

check("CSS and Tailwind aliases resolve to the canonical token", () => {
  const cssAlias = catalog.aliases.cssVariables.find(
    (alias) => alias.name === "--color-background"
  )
  assert.deepEqual(cssAlias, {
    name: "--color-background",
    tokenIds: ["color:background-primary"],
    ambiguous: false,
  })

  const tailwindAlias = catalog.aliases.tailwind.find(
    (alias) => alias.cssVar === "--color-background"
  )
  assert.deepEqual(tailwindAlias, {
    namespace: "color",
    name: "background",
    cssVar: "--color-background",
    tokenIds: ["color:background-primary"],
    ambiguous: false,
  })
})

globalThis.__DESIGN_EDITOR_CONFIG__ = browserSandbox.window.__DESIGN_EDITOR_CONFIG__
const helpers = await loadEditorHelpers()

console.log("\nAuthored and computed token matching")

check("authored CSS-variable identity wins over a computed-value collision", () => {
  const authored = helpers.authoredTokenMatches(
    "fill-color",
    "var(--color-background)",
    [],
    catalog
  )
  assert.equal(authored[0]?.token.id, "color:background-primary")
  assert.equal(authored[0]?.via, "authored")
  assert.match(authored[0]?.source ?? "", /--color-background/)

  const authoredClass = helpers.authoredTokenMatches(
    "fill-color",
    "",
    ["bg-background"],
    catalog
  )
  assert.equal(authoredClass[0]?.token.id, "color:background-primary")
  assert.equal(authoredClass[0]?.via, "authored")

  const computed = helpers.computedTokenMatches("fill-color", "#ffffff", catalog)
  assert.ok(computed.length > 1, "equal resolved colors must remain multiple candidates")
  assert.ok(computed.some((match) => match.token.id === "color:background-primary"))
  assert.ok(computed.some((match) => match.token.id === "color:background-elevated"))
})

check("CSS variable extraction keeps authored order and removes duplicates", () => {
  assert.deepEqual(
    helpers.extractCssVarNames(
      "linear-gradient(var(--sem-background-primary), var(--sem-border-primary), var(--sem-background-primary))"
    ),
    ["--sem-background-primary", "--sem-border-primary"]
  )
})

check("radius, text, spacing, effect, and icon tokens match their authored forms", () => {
  const cases = [
    ["corner-radius", "", ["rounded-[var(--radius-xl)]"], "radius:radius-xl"],
    ["text-style", "", ["text-body-sm"], "typography:body-small"],
    ["gap", "", ["gap-4"], "spacing:spacing-lg"],
    ["shadow", "", ["shadow-[var(--elev-2)]"], "shadow:elevation-2"],
    ["icon-size", "", ["size-4"], "icon-size:action"],
  ]
  for (const [property, inlineValue, classNames, tokenId] of cases) {
    const matches = helpers.authoredTokenMatches(property, inlineValue, classNames, catalog)
    assert.equal(matches[0]?.token.id, tokenId, `${property} did not resolve ${classNames[0]}`)
  }
})

console.log("\nToken source-write shapes")

check("semantic tokens translate to durable Tailwind arbitrary-value shapes", () => {
  const find = (group, name) => {
    const token = catalog[group].find((entry) => entry.name === name)
    assert.ok(token, `${group}/${name} is missing`)
    return token
  }
  const writes = [
    ...helpers.tokenStyleWrites("fill-color", find("colors", "Background/Primary")),
    ...helpers.tokenStyleWrites("corner-radius", find("radii", "radius/xl")),
    ...helpers.tokenStyleWrites("text-style", find("textStyles", "Heading/H1")),
    ...helpers.tokenStyleWrites("gap", find("spacing", "spacing/lg")),
    ...helpers.tokenStyleWrites("shadow", find("effects", "Elevation/2")),
    ...helpers.tokenStyleWrites("icon-size", find("icons", "action")),
  ]
  assert.deepEqual(writes, [
    { property: "background-color", value: "var(--sem-background-primary)" },
    { property: "border-radius", value: "var(--radius-xl)" },
    { property: "font-size", value: "var(--type-h1-size)" },
    { property: "line-height", value: "var(--type-h1-leading)" },
    { property: "font-weight", value: "var(--type-h1-weight)" },
    { property: "letter-spacing", value: "var(--type-h1-tracking)" },
    { property: "gap", value: "16px" },
    { property: "box-shadow", value: "var(--elev-2)" },
    { property: "width", value: "16px" },
    { property: "height", value: "16px" },
  ])
  const classShape = ({ property, value }) => {
    const update = helpers.toClassUpdate(property, value)
    assert.ok(update, `${property}:${value} did not translate`)
    return update.tailwindToken
      ? `${update.tailwindPrefix}-${update.tailwindToken}`
      : `${update.tailwindPrefix}-[${update.value}]`
  }
  assert.deepEqual(writes.map(classShape), [
    "bg-[var(--sem-background-primary)]",
    "rounded-[var(--radius-xl)]",
    "text-[var(--type-h1-size)]",
    "leading-[var(--type-h1-leading)]",
    "font-[number:var(--type-h1-weight)]",
    "tracking-[var(--type-h1-tracking)]",
    "gap-4",
    "shadow-[var(--elev-2)]",
    "w-4",
    "h-4",
  ])

  const weight = helpers.toClassUpdate("font-weight", "650")
  assert.equal(weight?.tailwindPrefix, "font")
  assert.equal(weight?.tailwindToken, null)
  assert.equal(weight?.value, "650")
  assert.equal(`${weight.tailwindPrefix}-[${weight.value}]`, "font-[650]")
  assert.equal(new RegExp(weight.classPattern).test("font-[650]"), true)
  assert.equal(new RegExp(weight.classPattern).test("font-sans"), false)
})

console.log("\nInspector controls")

await checkAsync("token controls are named and keep focus across their write", async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="target" class="grid grid-cols-1 border bg-background gap-4 p-4 md:grid-cols-2 dark:md:hover:gap-6 xl:grid-cols-4" style="display:grid;gap:16px;padding:16px;background-color:var(--color-background);border:1px solid var(--sem-border-primary);border-radius:var(--radius-xl);box-shadow:var(--elev-2)">Hello<span></span></div></body></html>`,
    { pretendToBeVisual: true, url: "http://localhost/" }
  )
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

  const target = window.document.getElementById("target")
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
  try {
    helpers.installInspector(editor)
    editor.select(target)
    const paint = () => new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    )
    await paint()

    for (const label of [
      "Fill color token", "Text color token", "Text style token", "Stroke color token",
      "Corner radius token", "Shadow / effect token", "Container gap token",
      "Uniform padding token",
    ]) {
      assert.ok(right.querySelector(`[aria-label="${label}"]`), `${label} is missing`)
    }
    // Picking a token is one gesture, so it must not cost the row you were on:
    // every commit rebuilds the whole panel, and a select that loses focus makes
    // walking a column of token rows by keyboard impossible.
    const before = right.querySelector('[data-de-field="design-system.corner-radius"]')
    before.focus()
    before.value = "radius:radius-sm"
    before.dispatchEvent(new window.Event("change", { bubbles: true }))
    await paint()

    const after = right.querySelector('[data-de-field="design-system.corner-radius"]')
    assert.notEqual(after, before, "the inspector did not rebuild")
    assert.equal(window.document.activeElement, after)
    assert.equal(after.value, "radius:radius-sm", "the row does not read back as bound")
    assert.match(target.style.borderRadius, /var\(--radius-sm\)/)
    assert.ok(pending.length > 0, "token pick did not queue a source operation")
  } finally {
    globalThis.fetch = originalFetch
    dom.window.close()
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
