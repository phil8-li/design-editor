/**
 * The vendored glyph set renders as legal SVG.
 *
 * The source data is authored for React, so it spells presentation attributes
 * `strokeWidth` and carries `var(--instagram-icon-stroke-width, 2)` as an
 * attribute value. Both are silent failures: `setAttribute` accepts any name,
 * and custom properties do not resolve in an attribute, so the eight
 * stroke-drawn glyphs drew at the UA's 1px default instead of the 2-unit weight
 * the design system draws them at — ChevronRight among them, which the layers
 * tree and every field row use. Nothing else catches this — it type-checks, it builds,
 * and a test that only asks whether an <svg> exists passes.
 */

import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url))

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

const dom = new JSDOM("<!doctype html><html><body></body></html>")
globalThis.window = dom.window
globalThis.document = dom.window.document

const { build } = await import("esbuild")
const bundled = await build({
  stdin: {
    contents: `export { icon, ICON_NAMES } from "./src/core/icons"`,
    resolveDir: PACKAGE_DIR,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "silent",
})
const { icon, ICON_NAMES } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
)

console.log("\nVendored glyph set")

// Guard the sweep before the sweep: every assertion below is a loop, and a loop
// over an empty list passes while asserting nothing.
check("the set is non-empty and every name resolves", () => {
  assert.ok(ICON_NAMES.length >= 16, `expected at least 16 glyphs, saw ${ICON_NAMES.length}`)
  for (const name of ICON_NAMES) assert.ok(icon(name), `${name} produced nothing`)
})

check("no attribute name survives in React's camelCase spelling", () => {
  const offenders = []
  for (const name of ICON_NAMES) {
    for (const node of icon(name).querySelectorAll("*")) {
      for (const attr of node.attributes) {
        if (/[A-Z]/.test(attr.name)) offenders.push(`${name}: ${attr.name}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

check("no attribute value is left as an unresolved custom property", () => {
  const offenders = []
  for (const name of ICON_NAMES) {
    for (const node of icon(name).querySelectorAll("*")) {
      for (const attr of node.attributes) {
        if (attr.value.includes("var(--")) offenders.push(`${name}: ${attr.name}=${attr.value}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

check("every stroke-drawn glyph carries the design system's 2-unit weight", () => {
  const stroked = []
  for (const name of ICON_NAMES) {
    const svg = icon(name)
    const nodes = [svg, ...svg.querySelectorAll("*")]
    const carrier = nodes.find((node) => node.getAttribute("stroke") === "currentColor")
    if (!carrier) continue
    stroked.push(name)
    const width = nodes.map((node) => node.getAttribute("stroke-width")).find(Boolean)
    assert.equal(width, "2", `${name} strokes at ${width ?? "the UA default"}, not 2`)
  }
  // The bug was in this population specifically, so prove the population exists.
  // Eight of the sixteen are stroke-drawn: Play, PanelLeft, PanelRight,
  // RotateCcw, Search, Check, ChevronRight, Plus. The rest are filled paths and
  // never had the defect.
  assert.ok(stroked.length >= 8, `expected at least 8 stroke-drawn glyphs, saw ${stroked.length}`)
})

check("every glyph is decorative and sized on the 24 grid", () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name, 12)
    assert.equal(svg.getAttribute("viewBox"), "0 0 24 24", `${name} is not on the 24 grid`)
    assert.equal(svg.getAttribute("aria-hidden"), "true", `${name} is exposed to a screen reader`)
    assert.equal(svg.getAttribute("width"), "12", `${name} ignored its size argument`)
    assert.equal(svg.getAttribute("height"), "12", `${name} ignored its size argument`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
