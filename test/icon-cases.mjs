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
  // Most of the set is stroke-drawn — Play, the four panel toggles, RotateCcw,
  // Search, Check, ChevronRight, Plus and CursorOutline among them. The rest are
  // filled paths and never had the defect.
  assert.ok(stroked.length >= 8, `expected at least 8 stroke-drawn glyphs, saw ${stroked.length}`)
})

/*
 * The ink tier — how big a glyph actually DRAWS inside its 24 grid.
 *
 * `viewBox` is not the answer to that question and neither is the `size`
 * argument: two glyphs drawn at the same size read a step apart if one of them
 * fills more of the box. Undo and redo did exactly that — an arc of r=10.003
 * plus a 2-unit stroke put their ink at 0.997..23.003, 22x22, against 20x20 for
 * the panel toggles sitting beside them in the same strip.
 *
 * Nothing else catches it. It type-checks, it renders, it passes every
 * assertion above, and the only symptom is that two buttons in a row of six
 * look wrong together. So this measures the geometry the way the renderer will:
 * the union of every shape's own bounds, expanded by half the stroke on each
 * side, because a stroke is centred on its path.
 */
function arcPoints(x1, y1, rx, ry, largeArc, sweep, x2, y2, push) {
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (!rx || !ry) {
    push(x2, y2)
    return
  }
  // Endpoint -> centre parameterisation, per SVG 1.1 F.6.5. Every arc in this
  // set has x-axis-rotation 0, so the rotation terms drop out.
  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const lambda = (dx2 * dx2) / (rx * rx) + (dy2 * dy2) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }
  const numerator = rx * rx * ry * ry - rx * rx * dy2 * dy2 - ry * ry * dx2 * dx2
  const denominator = rx * rx * dy2 * dy2 + ry * ry * dx2 * dx2
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (coefficient * rx * dy2) / ry
  const cyp = (-coefficient * ry * dx2) / rx
  const cx = cxp + (x1 + x2) / 2
  const cy = cyp + (y1 + y2) / 2
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy
    const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const sign = ux * vy - uy * vx < 0 ? -1 : 1
    return sign * Math.acos(Math.min(1, Math.max(-1, dot / length)))
  }
  const ux = (dx2 - cxp) / rx
  const uy = (dy2 - cyp) / ry
  const vx = (-dx2 - cxp) / rx
  const vy = (-dy2 - cyp) / ry
  const start = angle(1, 0, ux, uy)
  let sweptAngle = angle(ux, uy, vx, vy)
  if (!sweep && sweptAngle > 0) sweptAngle -= 2 * Math.PI
  if (sweep && sweptAngle < 0) sweptAngle += 2 * Math.PI
  // Sampled rather than solved for the four axis extrema: an arc's bounding box
  // depends on which quadrant boundaries it crosses, and 0.1 degrees is well
  // inside the 0.001 tolerance the assertions below use.
  const steps = Math.max(64, Math.ceil(Math.abs(sweptAngle) / (Math.PI / 1800)))
  for (let step = 0; step <= steps; step += 1) {
    const t = start + (sweptAngle * step) / steps
    push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
}

function walkPath(d, push) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let index = 0
  let command = ""
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const next = () => Number(tokens[index++])
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++]
    // An implicit repeat after a moveto is a lineto, per the grammar.
    else if (command === "M") command = "L"
    else if (command === "m") command = "l"
    switch (command) {
      case "M": x = next(); y = next(); startX = x; startY = y; push(x, y); break
      case "m": x += next(); y += next(); startX = x; startY = y; push(x, y); break
      case "L": x = next(); y = next(); push(x, y); break
      case "l": x += next(); y += next(); push(x, y); break
      case "H": x = next(); push(x, y); break
      case "h": x += next(); push(x, y); break
      case "V": y = next(); push(x, y); break
      case "v": y += next(); push(x, y); break
      case "A":
      case "a": {
        const rx = next()
        const ry = next()
        next() // x-axis-rotation
        const largeArc = next()
        const sweep = next()
        const endX = command === "A" ? next() : x + next()
        const endY = command === "A" ? next() : y + next()
        arcPoints(x, y, rx, ry, largeArc, sweep, endX, endY, push)
        x = endX
        y = endY
        break
      }
      case "Z":
      case "z": x = startX; y = startY; push(x, y); break
      // Loudly, not silently: an unmeasured curve would report a box that is too
      // small and the assertion would pass for the wrong reason.
      default: throw new Error(`unsupported path command "${command}" in "${d}"`)
    }
  }
}

/**
 * The box the glyph's ink occupies on the 24 grid, stroke included.
 *
 * Half of a stroke lies outside the geometry it is centred on, and the weight
 * is declared in two places in this data — on the root for a glyph whose whole
 * set of shapes is stroked, on the individual node otherwise — so each shape is
 * expanded by its OWN half-stroke before the union is taken. Reading only the
 * root reports RotateCcw as 18x18 and quietly passes it as if it were smaller
 * than the toggles beside it, which is the opposite of the bug.
 */
function inkBox(name) {
  const svg = icon(name, 24)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of svg.querySelectorAll("*")) {
    let shapeMinX = Infinity
    let shapeMinY = Infinity
    let shapeMaxX = -Infinity
    let shapeMaxY = -Infinity
    const push = (px, py) => {
      shapeMinX = Math.min(shapeMinX, px)
      shapeMaxX = Math.max(shapeMaxX, px)
      shapeMinY = Math.min(shapeMinY, py)
      shapeMaxY = Math.max(shapeMaxY, py)
    }
    const tag = node.tagName.toLowerCase()
    const attr = (nodeName) => Number(node.getAttribute(nodeName))
    if (tag === "path") walkPath(node.getAttribute("d"), push)
    else if (tag === "rect") {
      push(attr("x"), attr("y"))
      push(attr("x") + attr("width"), attr("y") + attr("height"))
    } else if (tag === "circle") {
      push(attr("cx") - attr("r"), attr("cy") - attr("r"))
      push(attr("cx") + attr("r"), attr("cy") + attr("r"))
    } else throw new Error(`unsupported shape <${tag}> in ${name}`)

    const stroked = node.getAttribute("stroke") ?? svg.getAttribute("stroke")
    const weight = node.getAttribute("stroke-width") ?? svg.getAttribute("stroke-width")
    const half = stroked && stroked !== "none" ? Number(weight ?? 1) / 2 : 0
    minX = Math.min(minX, shapeMinX - half)
    maxX = Math.max(maxX, shapeMaxX + half)
    minY = Math.min(minY, shapeMinY - half)
    maxY = Math.max(maxY, shapeMaxY + half)
  }
  return { width: maxX - minX, height: maxY - minY }
}

// Every glyph the bottom strip can draw, including the states it swaps between.
// A toggle whose two glyphs ink differently changes SIZE when it flips, which
// is the one motion this motionless strip must not have.
const TOOLBAR_GLYPHS = [
  "SidebarLeft",
  "SidebarLeftCollapsed",
  "SidebarRight",
  "SidebarRightCollapsed",
  "RotateCcw",
  "RotateCw",
  "Cursor",
  "CursorOutline",
]

check("the toolbar's glyphs all draw to one ink tier", () => {
  // The tier is 20x20 of the 24 grid. It is asserted on the first glyph as a
  // number once, and every other glyph is then measured against that glyph
  // rather than against a second typed number that could drift from it.
  const [first, ...rest] = TOOLBAR_GLYPHS
  const reference = inkBox(first)
  assert.ok(
    Math.abs(reference.width - 20) < 0.001 && Math.abs(reference.height - 20) < 0.001,
    `the reference glyph moved: ${first} now measures ${reference.width}x${reference.height}`
  )
  for (const name of rest) {
    const box = inkBox(name)
    assert.ok(
      Math.abs(box.width - reference.width) < 0.001 &&
        Math.abs(box.height - reference.height) < 0.001,
      `${name} inks ${box.width.toFixed(3)}x${box.height.toFixed(3)}, not ${reference.width}x${reference.height}`
    )
  }
})

/*
 * The panel toggles' two states have to be told apart with the colour turned
 * off, because the strip's pressed treatment is a tint and a tint is the whole
 * thing this pair replaced. So compare the DRAWING: same ink box, different
 * geometry, on both sides.
 */
check("each panel toggle's open and collapsed states differ in shape", () => {
  for (const [open, collapsed] of [
    ["SidebarLeft", "SidebarLeftCollapsed"],
    ["SidebarRight", "SidebarRightCollapsed"],
  ]) {
    const shape = (name) =>
      Array.from(icon(name, 24).querySelectorAll("*"))
        .map((node) => Array.from(node.attributes).map((a) => `${a.name}=${a.value}`).join(" "))
        .join(" | ")
    assert.notEqual(shape(open), shape(collapsed), `${open} and ${collapsed} draw the same thing`)
  }
})

check("the retired panel glyphs are gone, not left drawing nothing", () => {
  for (const name of ["PanelLeft", "PanelRight", "Move", "Hand"]) {
    assert.ok(!ICON_NAMES.includes(name), `${name} is still in the set with nothing drawing it`)
  }
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
