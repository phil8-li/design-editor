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
  assert.equal(catalog.textStyles.length, 11)
  assert.equal(catalog.uiTextStyles.length, 1)
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
  assert.deepEqual(generic.containerBreakpoints, [])
  assert.deepEqual(generic.responsiveMeasures, [])
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

check("scoped aliases stay uncertain while exact evidence wins", () => {
  const one = helpers.authoredTokenMatches("fill-color", "", ["bg-sidebar"], catalog)
  assert.deepEqual(one.map((match) => [match.token.id, match.ambiguous]), [
    ["color:background-chrome", true],
  ])

  const inline = helpers.authoredTokenMatches(
    "fill-color",
    "var(--workspace-theme-chrome)",
    [],
    catalog
  )
  assert.deepEqual(inline.map((match) => [match.token.id, match.ambiguous]), [
    ["color:background-chrome", true],
  ])

  const many = helpers.authoredTokenMatches("fill-color", "", ["bg-sidebar-accent"], catalog)
  assert.deepEqual(many.map((match) => [match.token.id, match.ambiguous]), [
    ["color:background-canvas", true],
    ["color:background-primary-hover", true],
  ])

  const exact = helpers.authoredTokenMatches("fill-color", "", ["bg-background"], catalog)
  assert.deepEqual(exact.map((match) => [match.token.id, match.ambiguous]), [
    ["color:background-primary", false],
  ])

  const exactOverAlias = helpers.authoredTokenMatches(
    "fill-color",
    "var(--sem-background-primary)",
    ["bg-sidebar"],
    catalog
  )
  assert.deepEqual(exactOverAlias.map((match) => [match.token.id, match.ambiguous]), [
    ["color:background-primary", false],
  ])
})

check("radius, text, spacing, effect, and icon tokens match their authored forms", () => {
  const cases = [
    ["corner-radius", "", ["rounded-[var(--radius-xl)]"], "radius:radius-xl"],
    ["text-style", "", ["text-body-sm"], "typography:body-small"],
    ["gap", "", ["gap-4"], "spacing:spacing-lg"],
    ["shadow", "", ["shadow-[var(--elev-2)]"], "shadow:elevation-2"],
    ["icon-size", "", ["size-4"], "icon-size:action"],
    ["corner-radius-bottom-left", "", ["rounded-bl-[var(--radius-xl)]"], "radius:radius-xl"],
    ["row-gap", "", ["gap-y-4"], "spacing:spacing-lg"],
    ["column-gap", "", ["gap-x-4"], "spacing:spacing-lg"],
    ["padding-top", "", ["pt-4"], "spacing:spacing-lg"],
    ["margin-left", "", ["ml-4"], "spacing:spacing-lg"],
    ["ring-color", "", ["ring-background"], "color:background-primary"],
    ["outline-color", "", ["outline-background"], "color:background-primary"],
    ["svg-fill", "", ["fill-background"], "color:background-primary"],
    ["svg-stroke", "", ["stroke-background"], "color:background-primary"],
  ]
  for (const [property, inlineValue, classNames, tokenId] of cases) {
    const matches = helpers.authoredTokenMatches(property, inlineValue, classNames, catalog)
    assert.equal(matches[0]?.token.id, tokenId, `${property} did not resolve ${classNames[0]}`)
  }

  // The honesty rule reaches matching too: a 0.3s transition is not `lively`,
  // because no CSS duration can be. Only the flat springs are ever offered.
  assert.deepEqual(
    helpers.computedTokenMatches("motion-duration", "0.15s", catalog).map((match) => match.token.id),
    ["motion:crossfade"]
  )
  assert.deepEqual(helpers.computedTokenMatches("motion-duration", "0.3s", catalog), [])
})

console.log("\nToken source-write shapes")

function find(group, name) {
  const token = catalog[group].find((entry) => entry.name === name)
  assert.ok(token, `${group}/${name} is missing`)
  return token
}

/** The class the write would land in source as, or a failure if it lands nowhere. */
function classShape({ property, value }) {
  const update = helpers.toClassUpdate(property, value)
  assert.ok(update, `${property}:${value} did not translate`)
  return update.tailwindToken
    ? `${update.tailwindPrefix}-${update.tailwindToken}`
    : `${update.tailwindPrefix}-[${update.value}]`
}

check("semantic tokens translate to durable Tailwind arbitrary-value shapes", () => {
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
  assert.deepEqual(writes.map(classShape), [
    "bg-[var(--sem-background-primary)]",
    "rounded-[var(--radius-xl)]",
    "text-[length:var(--type-h1-size)]",
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

check("the axes beyond the first nine write a real CSS property and a real class", () => {
  const cases = [
    ["ring-color", find("colors", "Background/Primary")],
    ["outline-color", find("colors", "Background/Primary")],
    ["svg-fill", find("colors", "Background/Primary")],
    ["svg-stroke", find("colors", "Background/Primary")],
    ["corner-radius-top-left", find("radii", "radius/xl")],
    ["corner-radius-top-right", find("radii", "radius/xl")],
    ["corner-radius-bottom-right", find("radii", "radius/xl")],
    ["corner-radius-bottom-left", find("radii", "radius/xl")],
    ["row-gap", find("spacing", "spacing/lg")],
    ["column-gap", find("spacing", "spacing/lg")],
    ["padding-top", find("spacing", "spacing/lg")],
    ["padding-right", find("spacing", "spacing/lg")],
    ["padding-bottom", find("spacing", "spacing/lg")],
    ["padding-left", find("spacing", "spacing/lg")],
    ["margin", find("spacing", "spacing/lg")],
    ["margin-top", find("spacing", "spacing/lg")],
    ["margin-right", find("spacing", "spacing/lg")],
    ["margin-bottom", find("spacing", "spacing/lg")],
    ["margin-left", find("spacing", "spacing/lg")],
    ["motion-duration", find("motion", "crossfade")],
  ]
  const rows = cases.flatMap(([property, token]) =>
    helpers
      .tokenStyleWrites(property, token)
      .map((write) => [property, write.property, classShape(write)])
  )
  assert.deepEqual(rows, [
    // A ring is a box-shadow in Tailwind v4, so its colour is the custom
    // property that shadow reads — not a border-color the element never has.
    ["ring-color", "--tw-ring-color", "ring-[var(--sem-background-primary)]"],
    ["outline-color", "outline-color", "outline-[var(--sem-background-primary)]"],
    ["svg-fill", "fill", "fill-[var(--sem-background-primary)]"],
    ["svg-stroke", "stroke", "stroke-[var(--sem-background-primary)]"],
    ["corner-radius-top-left", "border-top-left-radius", "rounded-tl-[var(--radius-xl)]"],
    ["corner-radius-top-right", "border-top-right-radius", "rounded-tr-[var(--radius-xl)]"],
    ["corner-radius-bottom-right", "border-bottom-right-radius", "rounded-br-[var(--radius-xl)]"],
    ["corner-radius-bottom-left", "border-bottom-left-radius", "rounded-bl-[var(--radius-xl)]"],
    ["row-gap", "row-gap", "gap-y-4"],
    ["column-gap", "column-gap", "gap-x-4"],
    ["padding-top", "padding-top", "pt-4"],
    ["padding-right", "padding-right", "pr-4"],
    ["padding-bottom", "padding-bottom", "pb-4"],
    ["padding-left", "padding-left", "pl-4"],
    ["margin", "margin", "m-4"],
    ["margin-top", "margin-top", "mt-4"],
    ["margin-right", "margin-right", "mr-4"],
    ["margin-bottom", "margin-bottom", "mb-4"],
    ["margin-left", "margin-left", "ml-4"],
    ["motion-duration", "transition-duration", "duration-[150ms]"],
  ])

  // `ring`, `outline` and `stroke` each carry a width as well as a colour, so a
  // recolour that matched on the stem alone would delete the width with it.
  const replaces = (property, className) =>
    new RegExp(helpers.toClassUpdate(property, "var(--sem-background-primary)").classPattern).test(className)
  assert.equal(replaces("--tw-ring-color", "ring-2"), false)
  assert.equal(replaces("outline-color", "outline-dashed"), false)
  assert.equal(replaces("stroke", "stroke-2"), false)
  assert.equal(replaces("fill", "fill-current"), true)
})

check("font family and weight patterns cannot replace each other", () => {
  const family = helpers.toClassUpdate("font-family", "Inter")
  const weight = helpers.toClassUpdate("font-weight", "650")
  assert.ok(family?.classPattern)
  assert.ok(weight?.classPattern)

  const familyPattern = new RegExp(family.classPattern)
  assert.equal(familyPattern.test("font-[650]"), false)
  assert.equal(familyPattern.test("font-[number:var(--type-h1-weight)]"), false)

  const weightPattern = new RegExp(weight.classPattern)
  assert.equal(weightPattern.test("font-sans"), false)
  assert.equal(weightPattern.test("font-[Inter]"), false)
  assert.equal(weightPattern.test("font-[family-name:var(--font-family)]"), false)
})

check("font size and text color variables cannot replace each other", () => {
  const size = helpers.toClassUpdate("font-size", "var(--type-h1-size)")
  const color = helpers.toClassUpdate("color", "var(--sem-text-icon-primary)")
  assert.equal(`${size.tailwindPrefix}-[${size.value}]`, "text-[length:var(--type-h1-size)]")

  const sizePattern = new RegExp(size.classPattern)
  const colorPattern = new RegExp(color.classPattern)
  assert.equal(sizePattern.test("text-[length:var(--type-h1-size)]"), true)
  assert.equal(sizePattern.test("text-[var(--sem-text-icon-primary)]"), false)
  assert.equal(colorPattern.test("text-[var(--sem-text-icon-primary)]"), true)
  assert.equal(colorPattern.test("text-[length:var(--type-h1-size)]"), false)
})

check("a bouncing spring writes nothing rather than a duration that lies", () => {
  const flat = catalog.motion.filter((token) => token.values.default.bounce === 0)
  assert.deepEqual(flat.map((token) => token.name), ["crossfade", "calm"])
  assert.deepEqual(
    flat.map((token) => helpers.tokenStyleWrites("motion-duration", token)),
    [
      [{ property: "transition-duration", value: "150ms" }],
      [{ property: "transition-duration", value: "240ms" }],
    ]
  )

  // The other seven are the point of the rule: transition-duration has no way
  // to carry bounce, so applying one would change the feel while the toast said
  // it worked. No writes is how this module says "not expressible here".
  const bouncing = catalog.motion.filter((token) => token.values.default.bounce !== 0)
  assert.equal(bouncing.length, 7)
  for (const token of bouncing) {
    assert.deepEqual(
      helpers.tokenStyleWrites("motion-duration", token),
      [],
      `${token.name} bounces and must not be written as a plain duration`
    )
  }
})

console.log("\nHuman spellings")

check("a token name splits into the group it lists under and the leaf a row shows", () => {
  const parts = (group, name) => helpers.tokenNameParts(find(group, name))
  assert.deepEqual(parts("colors", "Background/Primary"), { group: "Background", leaf: "Primary" })
  assert.deepEqual(parts("colors", "Text and Icon/On chrome (weak)"), {
    group: "Text and Icon",
    leaf: "On chrome (weak)",
  })
  // One register for the headers: the catalog writes some prefixes for people
  // and some for a stylesheet, and a `workspace` header three rows above
  // `Background` reads as two systems rather than one.
  assert.deepEqual(parts("radii", "radius/xl"), { group: "Radius", leaf: "xl" })
  assert.deepEqual(parts("spacing", "spacing/lg"), { group: "Spacing", leaf: "lg" })
  assert.deepEqual(parts("colors", "workspace/page"), { group: "Workspace", leaf: "page" })
  // A token with no path of its own still needs a header to sit under, or the
  // list opens with a run of ungrouped rows and the grouping reads like a bug.
  assert.deepEqual(parts("icons", "action"), { group: "Icon", leaf: "action" })
  assert.deepEqual(parts("motion", "crossfade"), { group: "Motion", leaf: "crossfade" })
  assert.deepEqual(parts("textStyles", "Display"), { group: "Text", leaf: "Display" })
  // Identifiers, not names: the motion collection is the one place the catalog
  // hands over source spellings, and the camel humps are the giveaway.
  assert.deepEqual(parts("motion", "fullScreen"), { group: "Motion", leaf: "full screen" })
  assert.deepEqual(parts("motion", "sinkInRecede"), { group: "Motion", leaf: "sink in recede" })
  // Case is otherwise left as authored: `2xl` is the design system's spelling.
  assert.equal(helpers.tokenDisplayName(find("radii", "radius/2xl")), "Radius/2xl")
  assert.equal(helpers.tokenDisplayName(find("motion", "navigationZoom")), "navigation zoom")
})

check("a token row carries the number that IS the decision", () => {
  const detail = (property, group, name) => helpers.tokenDetail(property, find(group, name))
  // Eight radii called sm…pill, previewed as eight chips, are eight rows of no
  // information without this: the px is the design fact being chosen.
  assert.equal(detail("corner-radius", "radii", "radius/sm"), "8px")
  assert.equal(detail("corner-radius", "radii", "radius/pill"), "999px")
  assert.equal(detail("gap", "spacing", "spacing/lg"), "16px")
  assert.equal(detail("icon-size", "icons", "action"), "16px")
  assert.equal(detail("text-style", "textStyles", "Heading/H1"), "36/40")
  // Including the springs that cannot be written: how long one takes is still
  // what a designer is choosing between.
  assert.equal(detail("motion-duration", "motion", "crossfade"), "150ms")
  assert.equal(detail("motion-duration", "motion", "lively"), "300ms")
  // The swatch already carries a colour whole; a hex on 71 rows is noise.
  assert.equal(detail("fill-color", "colors", "Background/Primary"), "")
  assert.equal(detail("shadow", "effects", "Elevation/1"), "")
})

check("a text style is spelled as its size and leading, and a swatch paints from the theme", () => {
  assert.equal(helpers.tokenTextPair(find("textStyles", "Heading/H1")), "36/40")
  assert.equal(helpers.tokenTextPair(find("textStyles", "Body/Default")), "16/26")
  assert.equal(helpers.tokenTextPair(find("radii", "radius/xl")), "")

  // The variable, not the literal: the swatch draws in the host document, so it
  // follows the live theme instead of freezing one theme's value.
  assert.equal(helpers.tokenSwatchCss(find("colors", "Background/Primary")), "var(--sem-background-primary)")
  assert.equal(helpers.tokenSwatchCss(find("spacing", "spacing/lg")), null)
})

check("a rendered value is spelled plainly or not at all", () => {
  assert.equal(helpers.plainValue("fill-color", "rgb(240, 242, 245)"), "#f0f2f5")
  assert.equal(helpers.plainValue("fill-color", "#FFF"), "#ffffff")

  // Alpha is not decoration. An element with no background computes to
  // `rgba(0, 0, 0, 0)`, and the Fill color row is unconditional — so dropping
  // the fourth channel put `#000000` beside an empty swatch on nearly every
  // selection, which is a design fact, and a false one. Same for every scrim
  // and hover wash, all of which used to read as their opaque base.
  assert.equal(helpers.plainValue("fill-color", "rgba(0, 0, 0, 0)"), "")
  assert.equal(helpers.plainValue("fill-color", "rgba(12, 16, 20, 0.5)"), "#0c1014 50%")
  assert.equal(helpers.plainValue("fill-color", "rgb(12 16 20 / 25%)"), "#0c1014 25%")
  assert.equal(helpers.plainValue("fill-color", "#0c101480"), "#0c1014 50%")
  assert.equal(helpers.plainValue("fill-color", "#0c1014ff"), "#0c1014")
  assert.equal(helpers.plainValue("text-style", "16|26|400|-0.32"), "16/26")
  assert.equal(helpers.plainValue("corner-radius", "20px"), "20px")
  assert.equal(helpers.plainValue("motion-duration", "0.15s"), "150ms")

  // The half that matters: a computed value can still be an unresolved variable
  // or a colour space no designer reads, and this surface prints neither.
  for (const value of [
    "var(--sem-background-primary)",
    "oklch(0.62 0.15 39)",
    "color-mix(in srgb, #fff 6%, #363c44)",
  ]) {
    assert.equal(helpers.plainValue("fill-color", value), "", `${value} reached the screen`)
  }
  assert.equal(helpers.plainValue("shadow", "0 1px 2px #0002"), "")
})

check("every design-system property has a category and a way into source", () => {
  assert.deepEqual(helpers.DESIGN_TOKEN_PROPERTIES, [
    "fill-color", "text-color", "stroke-color", "ring-color", "outline-color",
    "svg-fill", "svg-stroke",
    "corner-radius", "corner-radius-top-left", "corner-radius-top-right",
    "corner-radius-bottom-right", "corner-radius-bottom-left",
    "text-style", "shadow", "icon-size",
    "gap", "row-gap", "column-gap",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "motion-duration",
  ])
  for (const property of helpers.DESIGN_TOKEN_PROPERTIES) {
    const tokens = helpers.tokensForProperty(property, catalog)
    assert.ok(tokens.length, `${property} maps to no populated catalog category`)

    let writable = 0
    for (const token of tokens) {
      const writes = helpers.tokenStyleWrites(property, token)
      if (writes.length) writable += 1
      for (const write of writes) {
        assert.ok(
          helpers.toClassUpdate(write.property, write.value),
          `${property}/${token.name} writes ${write.property}, which stays preview-only`
        )
      }
    }
    assert.ok(writable, `${property} can write no token in its category`)
  }
})

console.log("\nInspector controls")

/**
 * Mounts the real inspector over a fixture and hands back the panel.
 *
 * The sections read `getComputedStyle`, `SVGElement` and `Node` off the global
 * scope the way they do in the browser, so the JSDOM's own have to be installed
 * there before the panel is built rather than passed in.
 */
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
    const target = window.document.getElementById("target")
    editor.select(target)
    await paint()
    // The precision expander is panel-level memory that outlives a fixture, so
    // each case starts collapsed rather than wherever its predecessor left it.
    const open = right.querySelector('[aria-label="Hide per-side tokens"]')
    if (open) {
      open.click()
      await paint()
    }
    await run({ window, right, target, pending, paint })
  } finally {
    globalThis.fetch = originalFetch
    dom.window.close()
  }
}

const rowLabels = (right) =>
  [...right.querySelectorAll('[data-de-field^="design-system."]')].map((node) =>
    node.getAttribute("aria-label")
  )

function expectRows(right, { present = [], absent = [] }) {
  const labels = rowLabels(right)
  for (const label of present) assert.ok(labels.includes(label), `${label} is missing`)
  for (const label of absent) assert.equal(labels.includes(label), false, `${label} should not be here`)
}

/** Opens a row's picker and returns the popover the click mounted. */
function open({ window, right }, property) {
  const field = right.querySelector(`[data-de-field="design-system.${property}"]`)
  assert.ok(field, `${property} has no row to pick in`)
  field.click()
  const popover = window.document.querySelector(".de-token-popover")
  assert.ok(popover, `${property} opened no picker`)
  return { field, popover }
}

/** Picks a token in a row the way a pointer does, and lets the panel rebuild. */
async function pick(harness, property, tokenId) {
  const { field, popover } = open(harness, property)
  const row = popover.querySelector(`[data-de-choice="${tokenId}"]`)
  assert.ok(row, `${tokenId} is not offered on the ${property} row`)
  row.click()
  await harness.paint()
  return field
}

/** What the closed field reads — a token name, or the element's own value. */
const fieldText = (right, property) =>
  right.querySelector(`[data-de-field="design-system.${property}"]`)?.textContent ?? ""

const GRID_FIXTURE = `<div id="target" class="grid grid-cols-1 border bg-background gap-4 p-4 md:grid-cols-2 dark:md:hover:gap-6 xl:grid-cols-4" style="display:grid;gap:16px;padding:16px;background-color:var(--color-background);border:1px solid var(--sem-border-primary);border-radius:var(--radius-xl);box-shadow:var(--elev-2)">Hello<span></span></div>`

await checkAsync("token controls are named and keep focus across their write", async () => {
  await withInspector(GRID_FIXTURE, async (harness) => {
    const { window, right, target, pending } = harness
    for (const label of [
      "Fill color token", "Text color token", "Text style token", "Stroke color token",
      "Corner radius token", "Shadow / effect token", "Container gap token",
      "Uniform padding token",
    ]) {
      assert.ok(right.querySelector(`[aria-label="${label}"]`), `${label} is missing`)
    }
    // Picking a token is one gesture, so it must not cost the row you were on:
    // every commit rebuilds the whole panel, and a field that loses focus makes
    // walking a column of token rows by keyboard impossible.
    const before = right.querySelector('[data-de-field="design-system.corner-radius"]')
    await pick(harness, "corner-radius", "radius:radius-sm")

    const after = right.querySelector('[data-de-field="design-system.corner-radius"]')
    assert.notEqual(after, before, "the inspector did not rebuild")
    assert.equal(window.document.activeElement, after)
    assert.equal(after.textContent, "Radius/sm", "the row does not read back as bound")
    assert.match(target.style.borderRadius, /var\(--radius-sm\)/)
    assert.ok(pending.length > 0, "token pick did not queue a source operation")
  })
})

// Every axis this box can actually carry, and nothing it cannot: a ring, an
// outline and a transition are all present, an SVG paint and an icon are not.
const PAINTED_FIXTURE = `<div id="target" class="flex border p-4" style="display:flex;gap:16px;padding:16px;margin:8px;border:1px solid #000;border-top-left-radius:8px;border-top-right-radius:8px;border-bottom-right-radius:8px;border-bottom-left-radius:8px;box-shadow:0 1px 2px #0002;outline-width:2px;outline-style:solid;transition-duration:0.15s;--tw-ring-shadow:0 0 0 2px #00f">Hello<span></span></div>`

const COMMON_LABELS = [
  "Fill color token", "Text color token", "Text style token", "Stroke color token",
  "Ring color token", "Outline color token", "Corner radius token", "Shadow / effect token",
  "Container gap token", "Uniform padding token", "Motion duration token",
]
const PRECISION_LABELS = [
  "Radius top left token", "Radius top right token", "Radius bottom right token",
  "Radius bottom left token", "Row gap token", "Column gap token",
  "Padding top token", "Padding right token", "Padding bottom token", "Padding left token",
  "Uniform margin token", "Margin top token", "Margin right token", "Margin bottom token",
  "Margin left token",
]

await checkAsync("precision axes stay folded until asked for, then write like any other row", async () => {
  await withInspector(PAINTED_FIXTURE, async (harness) => {
    const { right, target, pending } = harness
    expectRows(right, {
      present: COMMON_LABELS,
      // Twenty always-visible selects is a worse inspector than nine, so the
      // per-side half is absent from the DOM rather than merely styled away.
      absent: [...PRECISION_LABELS, "SVG fill token", "SVG stroke token", "Icon size token"],
    })

    right.querySelector('[aria-label="Show per-side tokens"]').click()
    await harness.paint()
    expectRows(right, { present: [...COMMON_LABELS, ...PRECISION_LABELS] })

    const queued = pending.length
    await pick(harness, "margin-top", "spacing:spacing-lg")
    assert.equal(target.style.marginTop, "16px", "the precision row did not paint the preview")
    assert.ok(pending.length > queued, "the precision row did not queue a source operation")

    await pick(harness, "ring-color", "color:background-primary")
    assert.equal(
      target.style.getPropertyValue("--tw-ring-color"),
      "var(--sem-background-primary)",
      "a Tailwind v4 ring recolours through its custom property"
    )
    assert.ok(pending.length > queued + 1, "the ring row did not queue a source operation")
  })
})

await checkAsync("an icon host reaches its own SVG's paint", async () => {
  await withInspector(
    `<button id="target" class="p-2" style="padding:8px"><svg style="fill:#ff0000;stroke:#0000ff"></svg></button>`,
    async ({ right }) => {
      expectRows(right, {
        present: ["SVG fill token", "SVG stroke token", "Icon size token"],
        // No text node of its own, so the two type rows would edit nothing.
        absent: ["Text color token", "Text style token"],
      })
    }
  )
})

await checkAsync("Tailwind's registered ring initial is not mistaken for a ring", async () => {
  // v4 registers --tw-ring-shadow with an initial value, so it resolves on
  // EVERY element: 1958 of 1958 on /ds when this was measured in the browser.
  // A row keyed on "the property is non-empty" is therefore a row on the whole
  // document — inert, and the disclosure logic doing nothing at all.
  await withInspector(
    `<div id="target" class="p-4" style="padding:16px;--tw-ring-shadow:0 0 #0000">Hello<span></span></div>`,
    async ({ right }) => {
      expectRows(right, { present: ["Uniform padding token"], absent: ["Ring color token"] })
    }
  )
  // ...and the row is still there when the element really carries one.
  await withInspector(PAINTED_FIXTURE, async ({ right }) => {
    expectRows(right, { present: ["Ring color token"] })
  })
})

await checkAsync("a spring that cannot arrive intact says so before the click", async () => {
  await withInspector(PAINTED_FIXTURE, async (harness) => {
    const { right } = harness
    const { popover } = open(harness, "motion-duration")
    const disabled = (id) =>
      popover.querySelector(`[data-de-choice="${id}"]`)?.getAttribute("aria-disabled") ?? "false"
    assert.equal(disabled("motion:crossfade"), "false")
    assert.equal(disabled("motion:lively"), "true", "a bouncing spring reads as pickable")

    // The toast fires after the click, which is one spring too late: the row
    // itself has to name the seven that cannot land and why.
    const field = right.querySelector('[data-de-field="design-system.motion-duration"]')
    const hints = [...field.parentElement.querySelectorAll(".de-hint")].map((node) => node.textContent)
    assert.equal(hints.length, 1, "the motion row lost its unavailable-token hint")
    assert.match(hints[0], /bounce/)
    assert.match(hints[0], /lively/)
  })
})

await checkAsync("a scoped alias reads as the element's own value, not as a binding", async () => {
  const markups = [
    `<div id="target" class="bg-sidebar"></div>`,
    `<div id="target" style="background-color:var(--workspace-theme-chrome)"></div>`,
    `<div id="target" class="bg-sidebar-accent"></div>`,
  ]
  for (const markup of markups) {
    await withInspector(markup, async ({ right }) => {
      // An alias whose meaning moves with the theme is not a binding. The field
      // says so by not claiming a token — but silence alone would make a
      // theme-driven alias and a hand-typed colour look identical, so the
      // candidates stay, said as a design fact instead of an evidence trail.
      const text = fieldText(right, "fill-color")
      assert.ok(!text.includes("Background/"), `an ambiguous alias was named as bound: ${text}`)
      assert.ok(!text.includes("var("), "the field printed a custom property")

      const field = right.querySelector('[data-de-field="design-system.fill-color"]')
      const hint = [...field.parentElement.querySelectorAll(".de-hint")].find((node) =>
        node.textContent.startsWith("Could be ")
      )
      assert.ok(hint, `the uncertainty went silent for ${markup}`)
      assert.match(hint.textContent, /the theme decides$/)
      assert.match(hint.textContent, /Background\//)
    })
  }

  await withInspector(`<div id="target" class="bg-background"></div>`, async ({ right }) => {
    assert.equal(fieldText(right, "fill-color"), "Background/Primary")
    // A certain binding has nothing to be uncertain about.
    const field = right.querySelector('[data-de-field="design-system.fill-color"]')
    assert.equal(
      [...field.parentElement.querySelectorAll(".de-hint")].filter((node) =>
        node.textContent.startsWith("Could be ")
      ).length,
      0
    )
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
