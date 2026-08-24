import { DESIGN_SYSTEM_TOKEN_GROUPS } from "./design-system-manifest.mjs"

/** Trace authored CSS variables and Tailwind theme aliases to canonical tokens. */

function cssDeclarations(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const declarations = []
  const scopes = []
  let start = 0
  let quote = null
  let escaped = false
  let parens = 0
  const push = (end) => {
    const match = /^(--[a-zA-Z0-9_-]+)\s*:\s*([\s\S]+)$/.exec(css.slice(start, end).trim())
    if (match) declarations.push({ name: match[1], value: match[2].trim(), scopes: [...scopes] })
  }

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === "(") parens += 1
    else if (char === ")") parens = Math.max(0, parens - 1)
    else if (parens === 0 && char === "{") {
      scopes.push(css.slice(start, index).trim())
      start = index + 1
    } else if (parens === 0 && char === ";") {
      push(index)
      start = index + 1
    } else if (parens === 0 && char === "}") {
      push(index)
      scopes.pop()
      start = index + 1
    }
  }
  return declarations
}

function aliasReference(value) {
  const match = /^var\(\s*(--[a-zA-Z0-9_-]+)(\s*,[\s\S]*)?\)$/.exec(value.trim())
  return match ? { name: match[1], fallback: Boolean(match[2]) } : null
}

function canonicalVariables(catalog) {
  const variables = new Map()
  const add = (name, id) => {
    if (!name) return
    const ids = variables.get(name) ?? new Set()
    ids.add(id)
    variables.set(name, ids)
  }
  for (const group of DESIGN_SYSTEM_TOKEN_GROUPS) {
    for (const token of catalog[group]) {
      add(token.cssVar, token.id)
      for (const cssVar of Object.values(token.cssVars ?? {})) add(cssVar, token.id)
    }
  }
  return variables
}

export function aliasesFromCss(catalog, sources) {
  const declarations = sources.flatMap(cssDeclarations)
  const canonical = canonicalVariables(catalog)
  const definitions = new Map()
  for (const declaration of declarations) {
    const definition = definitions.get(declaration.name) ?? { refs: new Set(), derived: false }
    const reference = aliasReference(declaration.value)
    if (reference) {
      definition.refs.add(reference.name)
      if (reference.fallback) definition.derived = true
    } else {
      definition.derived = true
    }
    definitions.set(declaration.name, definition)
  }

  const resolve = (name, trail = new Set()) => {
    if (canonical.has(name)) return { tokenIds: new Set(canonical.get(name)), ambiguous: false }
    if (trail.has(name) || !definitions.has(name)) return { tokenIds: new Set(), ambiguous: true }
    const definition = definitions.get(name)
    const tokenIds = new Set()
    let ambiguous = definition.derived || definition.refs.size !== 1
    const nextTrail = new Set([...trail, name])
    for (const reference of definition.refs) {
      const result = resolve(reference, nextTrail)
      for (const id of result.tokenIds) tokenIds.add(id)
      ambiguous ||= result.ambiguous
    }
    return { tokenIds, ambiguous: ambiguous || tokenIds.size !== 1 }
  }

  const cssVariables = []
  for (const name of definitions.keys()) {
    if (canonical.has(name)) continue
    const result = resolve(name)
    if (result.tokenIds.size === 0) continue
    cssVariables.push({ name, tokenIds: [...result.tokenIds].sort(), ambiguous: result.ambiguous })
  }

  const tailwind = []
  const seen = new Set()
  for (const declaration of declarations) {
    if (!declaration.scopes.some((scope) => /^@theme\b/.test(scope))) continue
    const match = /^--(color|radius|text|shadow)-(.+)$/.exec(declaration.name)
    if (!match || match[2].includes("--") || seen.has(declaration.name)) continue
    const result = canonical.has(declaration.name)
      ? { tokenIds: new Set(canonical.get(declaration.name)), ambiguous: false }
      : resolve(declaration.name)
    if (result.tokenIds.size === 0) continue
    seen.add(declaration.name)
    tailwind.push({
      namespace: match[1],
      name: match[2],
      cssVar: declaration.name,
      tokenIds: [...result.tokenIds].sort(),
      ambiguous: result.ambiguous || result.tokenIds.size !== 1,
    })
  }

  return {
    cssVariables: cssVariables.sort((a, b) => a.name.localeCompare(b.name)),
    tailwind: tailwind.sort((a, b) => a.cssVar.localeCompare(b.cssVar)),
  }
}
