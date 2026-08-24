/** Validate the host manifest and normalize its token groups for the browser. */

export const DESIGN_SYSTEM_TOKEN_GROUPS = [
  "colors", "spacing", "radii", "textStyles", "uiTextStyles", "effects", "icons", "motion",
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function manifestError(label, requirement) {
  throw new Error(`Invalid design-system manifest: ${label} ${requirement}`)
}

function expectObject(value, label) {
  if (!isPlainObject(value)) manifestError(label, "must be an object")
  return value
}

function expectArray(value, label) {
  if (!Array.isArray(value)) manifestError(label, "must be an array")
  return value
}

function expectString(value, label) {
  if (typeof value !== "string" || !value.trim()) manifestError(label, "must be a non-empty string")
  return value
}

function expectNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) manifestError(label, "must be a finite number")
  return value
}

function expectCustomProperty(value, label) {
  const name = expectString(value, label)
  if (!/^--[a-zA-Z0-9_-]+$/.test(name)) manifestError(label, "must be a CSS custom property")
  return name
}

function tokenId(category, name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `${category}:${slug}`
}

function tokenScope(value, label) {
  if (value === undefined) return []
  return expectArray(value, label).map((entry, index) => expectString(entry, `${label}[${index}]`))
}

function textStyleCssVars(style) {
  const prefix = expectCustomProperty(style.cssPrefix, `${style.name}.cssPrefix`)
  const vars = {
    fontSize: `${prefix}-size`,
    lineHeight: `${prefix}-leading`,
    fontWeight: `${prefix}-weight`,
    letterSpacing: `${prefix}-tracking`,
  }
  if (typeof style.cssUtility === "string" && style.cssUtility.startsWith("text-")) {
    const utility = `--text-${style.cssUtility.slice(5)}`
    Object.assign(vars, {
      utilityFontSize: utility,
      utilityLineHeight: `${utility}--line-height`,
      utilityLetterSpacing: `${utility}--letter-spacing`,
      utilityFontWeight: `${utility}--font-weight`,
    })
  }
  return vars
}

function uiTextStyleCssVars(style) {
  const utility = expectString(style.cssUtility, `${style.name}.cssUtility`)
  if (!utility.startsWith("text-")) manifestError(`${style.name}.cssUtility`, "must start with text-")
  const base = `--text-${utility.slice(5)}`
  return { fontSize: base, lineHeight: `${base}--line-height`, letterSpacing: `${base}--letter-spacing` }
}

export function normalizeDesignSystemManifest(manifest) {
  expectObject(manifest, "root")
  const collections = new Map()
  for (const [index, raw] of expectArray(manifest.collections, "collections").entries()) {
    const collection = expectObject(raw, `collections[${index}]`)
    const name = expectString(collection.name, `collections[${index}].name`)
    if (collections.has(name)) manifestError("collections", `contains duplicate ${name}`)
    collections.set(name, expectArray(collection.tokens, `${name}.tokens`))
  }
  const collection = (name) => {
    if (!collections.has(name)) manifestError("collections", `is missing ${name}`)
    return collections.get(name)
  }
  const named = (raw, label) => {
    const value = expectObject(raw, label)
    return { value, name: expectString(value.name, `${label}.name`) }
  }

  const colors = collection("Color").map((raw, index) => {
    const { value, name } = named(raw, `Color.tokens[${index}]`)
    return {
      id: tokenId("color", name),
      name,
      category: "color",
      cssVar: expectCustomProperty(value.cssVar, `Color.tokens[${index}].cssVar`),
      scope: tokenScope(value.scope, `Color.tokens[${index}].scope`),
      values: {
        light: expectString(value.light, `Color.tokens[${index}].light`),
        dark: expectString(value.dark, `Color.tokens[${index}].dark`),
      },
      codeSyntax: isPlainObject(value.$codeSyntax) ? value.$codeSyntax : null,
    }
  })

  const scalarTokens = (collectionName, category) => collection(collectionName).map((raw, index) => {
    const label = `${collectionName}.tokens[${index}]`
    const { value, name } = named(raw, label)
    return {
      id: tokenId(category, name),
      name,
      category,
      ...(value.cssVar === undefined ? {} : { cssVar: expectCustomProperty(value.cssVar, `${label}.cssVar`) }),
      scope: tokenScope(value.scope, `${label}.scope`),
      values: { default: expectNumber(value.value, `${label}.value`) },
    }
  })

  const normalizeTextStyle = (raw, index, ui = false) => {
    const group = ui ? "uiTextStyles" : "textStyles"
    const { value, name } = named(raw, `${group}[${index}]`)
    const styleValues = {
      fontSize: expectNumber(value.size, `${group}[${index}].size`),
      lineHeight: expectNumber(value.lineHeight, `${group}[${index}].lineHeight`),
      letterSpacing: expectNumber(value.tracking, `${group}[${index}].tracking`),
    }
    if (value.weight !== undefined) styleValues.fontWeight = expectNumber(value.weight, `${group}[${index}].weight`)
    return {
      id: tokenId("typography", name),
      name,
      category: "typography",
      cssVars: ui ? uiTextStyleCssVars(value) : textStyleCssVars(value),
      ...(typeof value.cssUtility === "string" ? { cssUtility: value.cssUtility } : {}),
      values: { default: styleValues },
    }
  }

  const effects = expectArray(manifest.effectStyles, "effectStyles").map((raw, index) => {
    const label = `effectStyles[${index}]`
    const { value, name } = named(raw, label)
    const layers = expectArray(value.layers, `${label}.layers`).map((rawLayer, layerIndex) => {
      const layerLabel = `${label}.layers[${layerIndex}]`
      const layer = expectObject(rawLayer, layerLabel)
      return {
        color: expectString(layer.color, `${layerLabel}.color`),
        x: expectNumber(layer.x, `${layerLabel}.x`),
        y: expectNumber(layer.y, `${layerLabel}.y`),
        blur: expectNumber(layer.blur, `${layerLabel}.blur`),
        spread: expectNumber(layer.spread, `${layerLabel}.spread`),
      }
    })
    return {
      id: tokenId("shadow", name),
      name,
      category: "shadow",
      cssVar: expectCustomProperty(value.cssVar, `${label}.cssVar`),
      values: { default: layers },
    }
  })

  const icons = expectArray(manifest.iconScale, "iconScale").map((raw, index) => {
    const label = `iconScale[${index}]`
    const { value, name } = named(raw, label)
    return {
      id: tokenId("icon-size", name),
      name,
      category: "icon-size",
      values: { default: expectNumber(value.value, `${label}.value`) },
      usage: typeof value.usage === "string" ? value.usage : "",
    }
  })

  const motion = expectArray(manifest.motion, "motion").map((raw, index) => {
    const label = `motion[${index}]`
    const { value, name } = named(raw, label)
    return {
      id: tokenId("motion", name),
      name,
      category: "motion",
      values: { default: {
        visualDuration: expectNumber(value.visualDuration, `${label}.visualDuration`),
        bounce: expectNumber(value.bounce, `${label}.bounce`),
      } },
    }
  })

  const catalog = {
    name: typeof manifest.name === "string" ? manifest.name : "Design system",
    colors,
    spacing: scalarTokens("Spacing", "spacing"),
    radii: scalarTokens("Radius", "radius"),
    textStyles: expectArray(manifest.textStyles, "textStyles").map((raw, index) => normalizeTextStyle(raw, index)),
    uiTextStyles: expectArray(manifest.uiTextStyles, "uiTextStyles").map((raw, index) => normalizeTextStyle(raw, index, true)),
    effects,
    icons,
    motion,
  }
  const ids = new Set()
  for (const group of DESIGN_SYSTEM_TOKEN_GROUPS) {
    for (const token of catalog[group]) {
      if (ids.has(token.id)) manifestError("tokens", `contains duplicate normalized id ${token.id}`)
      ids.add(token.id)
    }
  }
  return catalog
}

export function normalizeBreakpoints(breakpoints) {
  if (!isPlainObject(breakpoints)) throw new Error("tailwind.breakpoints must be an object of CSS pixel values")
  return Object.entries(breakpoints).map(([name, value]) => {
    if (!name.trim()) throw new Error("tailwind breakpoint names must not be empty")
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`tailwind.breakpoints.${name} must be a non-negative finite number`)
    }
    return {
      id: tokenId("breakpoint", name),
      name,
      category: "breakpoint",
      prefix: `${name}:`,
      values: { default: value },
    }
  }).sort((a, b) => a.values.default - b.values.default)
}

export function emptyDesignSystemCatalog(breakpoints) {
  return {
    name: null,
    colors: [],
    spacing: [],
    radii: [],
    textStyles: [],
    uiTextStyles: [],
    effects: [],
    icons: [],
    motion: [],
    breakpoints: normalizeBreakpoints(breakpoints),
    aliases: { cssVariables: [], tailwind: [] },
  }
}
