/**
 * Angular host support: which file an element is written in, and how to write
 * to it.
 *
 * This is the Angular half of the one question `src/core/bridge.ts` owns for
 * React — "where is this element authored" — plus the writer that answers what
 * jscodeshift answers there. It exists because neither of the React mechanisms
 * has an Angular equivalent:
 *
 *   - There is no fiber, so there is no `_debugSource` and no owner stack. The
 *     browser side gets the component from Angular's own dev-mode `ng` global
 *     (`ng.getOwningComponent`) and sends this module a CLASS NAME.
 *   - There is no JSX, so the vendor's AST codemod has nothing to walk. An
 *     Angular component's markup is a separate `.html` file (or an inline
 *     template string), which is plain HTML plus Angular's own syntax.
 *
 * So resolution is `class name -> @Component decorator -> templateUrl`, and
 * writing is a byte-range splice into that template. Nothing here parses
 * Angular's binding syntax: it locates a START TAG and edits its attributes,
 * which is the smallest operation that can express a style, a class or a text
 * change, and the only one that cannot silently rewrite control flow.
 *
 * What it deliberately will not do is guess. A descriptor that matches two
 * template elements equally well returns `null` rather than a coin flip; the
 * caller strands the change into the Prompts tab, which is the behaviour the
 * React path already has for an element it cannot place.
 */

import fs from "node:fs"
import path from "node:path"

import { isEditableSourcePath } from "../config.mjs"

/** Directories never worth walking for component sources. */
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".angular",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".cache",
])

/** Bounded so a mis-pointed project root cannot walk a home directory. */
const MAX_SCANNED_FILES = 4000

/** HTML elements that never have a closing tag, so the depth stack must not push them. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
])

/**
 * Angular stamps these onto every element at runtime for style encapsulation.
 * They are not in the template, so a descriptor must never be matched on them.
 */
const RUNTIME_ATTRIBUTE = /^_ng(content|host)-/

/* -------------------------------------------------------------------------
 * The component index
 * ---------------------------------------------------------------------- */

/**
 * The end of a balanced `(...)` or `{...}` run that starts at `open`.
 *
 * String-aware, because a decorator's `template:` is very often a backtick
 * string containing braces of its own, and a brace counter that cannot see
 * quotes stops in the middle of one.
 */
function matchingClose(source, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" }
  const stack = [pairs[source[open]]]
  let index = open + 1
  while (index < source.length && stack.length) {
    const char = source[index]
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(source, index)
      continue
    }
    if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index)
      if (index === -1) return -1
      continue
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2)
      if (end === -1) return -1
      index = end + 2
      continue
    }
    if (pairs[char]) stack.push(pairs[char])
    else if (char === stack[stack.length - 1]) stack.pop()
    index += 1
  }
  return stack.length ? -1 : index - 1
}

/** The index just past the string literal opening at `start`. */
function skipString(source, start) {
  const quote = source[start]
  let index = start + 1
  while (index < source.length) {
    const char = source[index]
    if (char === "\\") {
      index += 2
      continue
    }
    if (char === quote) return index + 1
    // A template literal's `${}` can nest anything, including another string.
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      const close = matchingClose(source, index + 1)
      if (close === -1) return source.length
      index = close + 1
      continue
    }
    index += 1
  }
  return source.length
}

/** A single-quoted, double-quoted or backticked literal value for `key`. */
function decoratorString(decorator, key) {
  const match = new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`).exec(decorator)
  return match ? match[2] : null
}

/** The first entry of `key: [...]`, which is how `styleUrls` is spelled. */
function decoratorFirstOfArray(decorator, key) {
  const match = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(decorator)
  if (!match) return null
  const first = /(['"`])([^'"`]*)\1/.exec(match[1])
  return first ? first[2] : null
}

/**
 * The inline `template:` literal's byte range inside the `.ts` file, or null.
 *
 * The range covers the template TEXT only, so a splice into it lands in the
 * markup rather than through the quote that delimits it.
 */
function inlineTemplateRange(source, decoratorStart, decoratorEnd) {
  const decorator = source.slice(decoratorStart, decoratorEnd)
  const match = /\btemplate\s*:\s*(['"`])/.exec(decorator)
  if (!match) return null
  const quoteAt = decoratorStart + match.index + match[0].length - 1
  const end = skipString(source, quoteAt)
  return { start: quoteAt + 1, end: end - 1 }
}

function scanComponentFile(absolutePath, source) {
  const found = []
  let cursor = 0
  for (;;) {
    const at = source.indexOf("@Component", cursor)
    if (at === -1) break
    const open = source.indexOf("(", at)
    if (open === -1) break
    const close = matchingClose(source, open)
    if (close === -1) break
    // `export class Foo`, `export default class Foo`, `class Foo` — the name is
    // whatever follows the nearest `class` keyword after the decorator.
    const tail = source.slice(close + 1, close + 400)
    const named = /\bclass\s+([A-Za-z_$][\w$]*)/.exec(tail)
    cursor = close + 1
    if (!named) continue

    const decorator = source.slice(open, close + 1)
    const templateUrl = decoratorString(decorator, "templateUrl")
    const styleUrl =
      decoratorString(decorator, "styleUrl") ?? decoratorFirstOfArray(decorator, "styleUrls")
    const directory = path.dirname(absolutePath)

    found.push({
      componentName: named[1],
      selector: decoratorString(decorator, "selector"),
      tsFile: absolutePath,
      templateFile: templateUrl ? path.resolve(directory, templateUrl) : null,
      styleFile: styleUrl ? path.resolve(directory, styleUrl) : null,
      inlineTemplate: templateUrl ? null : inlineTemplateRange(source, open, close + 1),
    })
  }
  return found
}

function walkSources(root, onFile) {
  let scanned = 0
  const queue = [root]
  while (queue.length) {
    const directory = queue.shift()
    let entries
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue
        queue.push(path.join(directory, entry.name))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue
      if (entry.name.endsWith(".spec.ts") || entry.name.endsWith(".d.ts")) continue
      if (scanned >= MAX_SCANNED_FILES) return
      scanned += 1
      onFile(path.join(directory, entry.name))
    }
  }
}

/* -------------------------------------------------------------------------
 * Template scanning
 * ---------------------------------------------------------------------- */

/**
 * Comments blanked, offsets preserved.
 *
 * Replacing rather than removing keeps every index this module hands out — and
 * every index it later splices at — an index into the file as it sits on disk.
 */
function blankComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length))
}

const START_TAG = /<([a-zA-Z][-\w.:]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
const END_TAG = /<\/([a-zA-Z][-\w.:]*)\s*>/g
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function parseAttributes(raw, rawStart) {
  const attributes = new Map()
  ATTRIBUTE.lastIndex = 0
  let match
  while ((match = ATTRIBUTE.exec(raw))) {
    const name = match[1]
    if (!name || name === "/") continue
    const quoted = match[2] !== undefined ? '"' : match[3] !== undefined ? "'" : ""
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    // Where the VALUE sits, so a rewrite replaces the value and nothing else.
    // The OPENING quote, which is the first one in the match: taking the last
    // one lands past the closing quote, and the splice then writes the new
    // value into the markup after the attribute instead of into it.
    const valueStart = quoted ? rawStart + match.index + match[0].indexOf(quoted) + 1 : -1
    attributes.set(name, {
      name,
      value,
      quote: quoted || '"',
      start: rawStart + match.index,
      end: rawStart + match.index + match[0].length,
      valueStart: quoted ? valueStart : -1,
      valueEnd: quoted ? valueStart + value.length : -1,
    })
  }
  return attributes
}

/** The static class list a template element declares, ignoring bindings. */
function templateClasses(attributes) {
  const attribute = attributes.get("class")
  if (!attribute) return []
  return attribute.value.split(/\s+/).filter(Boolean)
}

/**
 * Every start tag in a template, with its parent, its index among same-tag
 * siblings, and the byte ranges an edit needs.
 *
 * A hand-rolled scanner rather than a real parser on purpose. An Angular
 * template is not HTML — `@if`/`@for` blocks, `*ngFor`, `{{ }}` interpolation
 * and `[attr]` bindings all appear inside it — and every HTML parser worth
 * using normalises exactly the things that must survive a byte-range splice.
 * Scanning start tags leaves the rest of the file untouched by construction.
 */
export function scanTemplate(html) {
  const source = blankComments(html)
  const nodes = []
  const stack = []
  const tokens = []

  START_TAG.lastIndex = 0
  let match
  while ((match = START_TAG.exec(source))) {
    tokens.push({ kind: "start", index: match.index, match })
  }
  END_TAG.lastIndex = 0
  while ((match = END_TAG.exec(source))) {
    tokens.push({ kind: "end", index: match.index, name: match[1].toLowerCase() })
  }
  tokens.sort((a, b) => a.index - b.index)

  // Same-tag counts per open parent, so `nthOfType` means the same thing here
  // as `previousElementSibling` counting does in the browser.
  const counters = [new Map()]

  for (const token of tokens) {
    if (token.kind === "end") {
      // Unwinding to the matching open tag closes it and everything a malformed
      // template left open under it, which is what a browser does too.
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].tagName === token.name) {
          stack[depth].contentEnd = token.index
          stack.length = depth
          counters.length = depth + 1
          break
        }
      }
      continue
    }

    const [whole, rawName, rawAttributes, selfClosing] = token.match
    const tagName = rawName.toLowerCase()
    const attributesStart = token.index + 1 + rawName.length
    const attributes = parseAttributes(rawAttributes, attributesStart)
    const parent = stack[stack.length - 1] ?? null
    const counter = counters[counters.length - 1]
    const seen = counter.get(tagName) ?? 0
    counter.set(tagName, seen + 1)

    const node = {
      tagName,
      attributes,
      classes: templateClasses(attributes),
      nthOfType: seen,
      depth: stack.length,
      parentTagName: parent?.tagName ?? null,
      parentClasses: parent?.classes ?? [],
      // The whole start tag, `<` through `>`.
      start: token.index,
      end: token.index + whole.length,
      // Where a new attribute is inserted: after the last one, which is where a
      // person writing the template would have put it. Straight after the tag
      // name also produces valid HTML, and produces it in an order no author
      // chose — `<h2 style="…" class="card__title">` reads as machine output.
      insertAt: attributesStart + rawAttributes.replace(/\s+$/, "").length,
      selfClosing: Boolean(selfClosing) || VOID_ELEMENTS.has(tagName),
      contentStart: token.index + whole.length,
      contentEnd: -1,
    }
    nodes.push(node)
    if (!node.selfClosing) {
      stack.push(node)
      counters.push(new Map())
    }
  }

  return nodes
}

function lineColumnAt(source, offset) {
  let line = 1
  let lastBreak = -1
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1
      lastBreak = index
    }
  }
  return { lineNumber: line, columnNumber: offset - lastBreak }
}

/* -------------------------------------------------------------------------
 * Matching a live element to a template node
 * ---------------------------------------------------------------------- */

const REQUIRED_TAG_SCORE = 1

/**
 * How well a template node answers a descriptor of a live element.
 *
 * Returns `-1` for a node that is disqualified rather than merely unlikely.
 * The distinction matters: the caller needs a UNIQUE best score, and a scale
 * where impossible candidates score zero makes two impossible nodes tie.
 *
 * Every static class the template declares must be on the live element. The
 * converse is not required and must not be: `[class.active]`, `[ngClass]` and
 * a component's own host classes all add classes at runtime that were never in
 * the template.
 */
function scoreNode(node, descriptor) {
  if (node.tagName !== descriptor.tagName) return -1

  const live = new Set(descriptor.classes ?? [])
  for (const name of node.classes) {
    if (!live.has(name)) return -1
  }

  let score = REQUIRED_TAG_SCORE + node.classes.length * 4

  const id = node.attributes.get("id")
  if (id && descriptor.id && id.value === descriptor.id) score += 6

  if (descriptor.parentTagName && node.parentTagName === descriptor.parentTagName) score += 2
  const liveParent = new Set(descriptor.parentClasses ?? [])
  for (const name of node.parentClasses) {
    if (liveParent.has(name)) score += 1
  }

  // Static attributes the template declares and the live element still has.
  for (const [name, attribute] of node.attributes) {
    if (name === "class" || name === "style" || RUNTIME_ATTRIBUTE.test(name)) continue
    if (name.startsWith("[") || name.startsWith("(") || name.startsWith("*") || name.startsWith("#")) continue
    if (descriptor.attributes?.[name] === attribute.value) score += 2
  }

  if (typeof descriptor.nthOfType === "number" && node.nthOfType === descriptor.nthOfType) {
    score += 1
  }

  return score
}

/**
 * The one template node a descriptor names, or null when that is not a fact.
 *
 * `null` on a tie is the whole point. The alternative — taking the first of two
 * equal candidates — writes a style onto an element the user was not looking at,
 * and the user's only clue is that the wrong thing moved.
 */
export function matchNode(nodes, descriptor) {
  let best = null
  let bestScore = 0
  let tied = false
  for (const node of nodes) {
    const score = scoreNode(node, descriptor)
    if (score < 0) continue
    if (score > bestScore) {
      best = node
      bestScore = score
      tied = false
    } else if (score === bestScore) {
      tied = true
    }
  }
  return tied ? null : best
}

/* -------------------------------------------------------------------------
 * Edits
 * ---------------------------------------------------------------------- */

function parseStyleAttribute(value) {
  const declarations = new Map()
  for (const part of value.split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const property = part.slice(0, colon).trim()
    const declared = part.slice(colon + 1).trim()
    if (property) declarations.set(property, declared)
  }
  return declarations
}

function formatStyleAttribute(declarations) {
  return [...declarations]
    .filter(([, value]) => value !== "")
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ")
}

/** An attribute rewrite expressed as one splice, so edits can be sorted and applied. */
function setAttribute(node, name, value) {
  const existing = node.attributes.get(name)
  if (existing && existing.valueStart !== -1) {
    return { start: existing.valueStart, end: existing.valueEnd, text: escapeAttribute(value) }
  }
  if (existing) {
    return { start: existing.start, end: existing.end, text: `${name}="${escapeAttribute(value)}"` }
  }
  return { start: node.insertAt, end: node.insertAt, text: ` ${name}="${escapeAttribute(value)}"` }
}

function removeAttribute(node, name) {
  const existing = node.attributes.get(name)
  if (!existing) return null
  return { start: existing.start, end: existing.end, text: "" }
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;")
}

/**
 * The splices one operation makes to one template node.
 *
 * Returned rather than applied so a batch can sort every splice across every
 * operation and rewrite the file once, back to front — the only order in which
 * earlier offsets stay valid.
 */
function editsFor(node, operation, template) {
  if (operation.op === "setStyles") {
    const attribute = node.attributes.get("style")
    const declarations = parseStyleAttribute(attribute?.value ?? "")
    for (const [property, value] of Object.entries(operation.declarations ?? {})) {
      if (value === "" || value === null) declarations.delete(property)
      else declarations.set(property, String(value))
    }
    const next = formatStyleAttribute(declarations)
    if (!next) {
      const removal = removeAttribute(node, "style")
      return removal ? [removal] : []
    }
    return [setAttribute(node, "style", next)]
  }

  if (operation.op === "setClasses") {
    const classes = templateClasses(node.attributes)
    const remove = new Set(operation.remove ?? [])
    const next = classes.filter((name) => !remove.has(name))
    for (const name of operation.add ?? []) {
      if (!next.includes(name)) next.push(name)
    }
    if (!next.length) {
      const removal = removeAttribute(node, "class")
      return removal ? [removal] : []
    }
    return [setAttribute(node, "class", next.join(" "))]
  }

  if (operation.op === "setText") {
    if (node.selfClosing || node.contentEnd === -1) {
      throw new Error("element has no closing tag to hold text")
    }
    const current = template.slice(node.contentStart, node.contentEnd)
    // Refused, not guessed. Replacing content that holds child elements would
    // delete them, and content holding `{{ }}` or an `@if` block is generated —
    // overwriting it edits the render, not the words.
    if (/<[a-zA-Z/]/.test(current)) throw new Error("element contains child elements")
    if (/\{\{|@(if|for|switch|defer|empty|else)\b/.test(current)) {
      throw new Error("element text is bound or inside control flow")
    }
    return [{ start: node.contentStart, end: node.contentEnd, text: String(operation.text ?? "") }]
  }

  throw new Error(`unsupported operation ${operation.op}`)
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start)
  let output = source
  let previousStart = Number.POSITIVE_INFINITY
  for (const edit of ordered) {
    // Two operations on one element can produce overlapping splices — merging
    // them is the caller's job, so an overlap here is a bug worth surfacing.
    if (edit.end > previousStart) throw new Error("overlapping edits to one template")
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
    previousStart = edit.start
  }
  return output
}

/* -------------------------------------------------------------------------
 * The module
 * ---------------------------------------------------------------------- */

export function createAngularSource(config) {
  const root = config.projectRoot
  /** class name -> component record. Built on first use, rebuilt on a miss. */
  let index = null

  const build = () => {
    const next = new Map()
    walkSources(root, (file) => {
      let source
      try {
        source = fs.readFileSync(file, "utf8")
      } catch {
        return
      }
      if (!source.includes("@Component")) return
      for (const component of scanComponentFile(file, source)) {
        if (!next.has(component.componentName)) next.set(component.componentName, component)
      }
    })
    index = next
    return next
  }

  /**
   * Angular class names survive bundling, but not untouched: esbuild renames a
   * class it has to keep alive, and the usual result is a `_` prefix
   * (`_OverviewComponent`) or a numeric suffix on a collision. The browser
   * sends what it read off the instance; normalising here keeps that detail out
   * of the client, which has no way to know what a real class name looks like.
   */
  const lookup = (rawName) => {
    if (typeof rawName !== "string" || !rawName) return null
    const candidates = [rawName]
    const unprefixed = rawName.replace(/^_+/, "")
    if (unprefixed !== rawName) candidates.push(unprefixed)
    const unsuffixed = unprefixed.replace(/\$?\d+$/, "")
    if (unsuffixed && unsuffixed !== unprefixed) candidates.push(unsuffixed)

    for (const pass of [index ?? build(), null]) {
      const table = pass ?? build()
      for (const candidate of candidates) {
        const found = table.get(candidate)
        if (found) return found
      }
      // Only the first pass may be a stale cache; the second is a fresh build.
      if (pass === null) break
    }
    return null
  }

  /** The template a component's markup lives in, with its text. */
  const templateOf = (component) => {
    if (component.templateFile) {
      return {
        file: component.templateFile,
        text: fs.readFileSync(component.templateFile, "utf8"),
        offset: 0,
      }
    }
    if (component.inlineTemplate) {
      const text = fs.readFileSync(component.tsFile, "utf8")
      return {
        file: component.tsFile,
        text: text.slice(component.inlineTemplate.start, component.inlineTemplate.end),
        offset: component.inlineTemplate.start,
        whole: text,
      }
    }
    return null
  }

  const relative = (absolute) => {
    const value = path.relative(root, absolute)
    return value.startsWith("..") ? absolute : value
  }

  const locate = (componentName, descriptor) => {
    const component = lookup(componentName)
    if (!component) return { ok: false, reason: `no component class named ${componentName}` }
    let template
    try {
      template = templateOf(component)
    } catch (error) {
      return { ok: false, reason: `template unreadable (${error.message})` }
    }
    if (!template) return { ok: false, reason: `${component.componentName} has no template` }

    const node = matchNode(scanTemplate(template.text), descriptor ?? {})
    if (!node) {
      return {
        ok: false,
        component,
        template,
        reason: `no unique <${descriptor?.tagName ?? "?"}> in ${path.basename(template.file)}`,
      }
    }
    const position = lineColumnAt(template.whole ?? template.text, template.offset + node.start)
    return { ok: true, component, template, node, position }
  }

  return {
    /** The component record for a class name the browser read off an instance. */
    component(componentName) {
      const component = lookup(componentName)
      if (!component) return null
      return {
        componentName: component.componentName,
        selector: component.selector,
        tsFile: relative(component.tsFile),
        templateFile: component.templateFile ? relative(component.templateFile) : null,
        styleFile: component.styleFile ? relative(component.styleFile) : null,
      }
    },

    /**
     * Where an element is written: the template file and the line of its start
     * tag, or the component's `.ts` when the element cannot be placed inside it.
     *
     * The degraded answer is deliberate. Naming the component's own file is
     * true and useful — the inspector header, the Code tab and the change
     * prompt all want somewhere to point — while `located: false` is what stops
     * the writer from acting on a position nobody verified.
     */
    resolve(componentName, descriptor) {
      const found = locate(componentName, descriptor)
      if (found.ok) {
        return {
          filePath: relative(found.template.file),
          lineNumber: found.position.lineNumber,
          columnNumber: found.position.columnNumber,
          componentName: found.component.componentName,
          located: true,
        }
      }
      const component = lookup(componentName)
      if (!component) return null
      return {
        filePath: relative(component.templateFile ?? component.tsFile),
        lineNumber: 0,
        columnNumber: 0,
        componentName: component.componentName,
        located: false,
        reason: found.reason,
      }
    },

    /**
     * Writes a batch of operations, grouped by template so each file is read
     * once, spliced once and written once.
     *
     * Partial success is a real outcome and is reported as one: an operation on
     * an element that cannot be placed must not stop the four that can.
     */
    apply(operations) {
      const applied = []
      const failed = []
      /** file -> { text, whole, offset, edits[] } */
      const batches = new Map()

      for (const operation of operations) {
        const found = locate(operation.componentName, operation.target)
        if (!found.ok) {
          failed.push({ operation, reason: found.reason })
          continue
        }
        const file = found.template.file
        if (!isEditableSourcePath(config, file)) {
          failed.push({ operation, reason: `${relative(file)} is outside the editable roots` })
          continue
        }
        let batch = batches.get(file)
        if (!batch) {
          batch = { template: found.template, edits: [], operations: [] }
          batches.set(file, batch)
        }
        try {
          batch.edits.push(...editsFor(found.node, operation, found.template.text))
          batch.operations.push({ operation, node: found.node, position: found.position })
        } catch (error) {
          failed.push({ operation, reason: error.message })
        }
      }

      for (const [file, batch] of batches) {
        try {
          // Splices are computed against the template TEXT; an inline template
          // is a window into the `.ts`, so its offsets are rebased before use.
          const offset = batch.template.offset
          const edits = batch.edits.map((edit) => ({
            start: edit.start + offset,
            end: edit.end + offset,
            text: edit.text,
          }))
          const whole = batch.template.whole ?? batch.template.text
          fs.writeFileSync(file, applyEdits(whole, edits), "utf8")
          for (const entry of batch.operations) {
            applied.push({
              op: entry.operation.op,
              componentName: entry.operation.componentName,
              filePath: relative(file),
              lineNumber: entry.position.lineNumber,
            })
          }
        } catch (error) {
          for (const entry of batch.operations) {
            failed.push({ operation: entry.operation, reason: error.message })
          }
        }
      }

      return { applied, failed }
    },

    /** Test seam: drops the cached component index. */
    reset() {
      index = null
    },
  }
}
