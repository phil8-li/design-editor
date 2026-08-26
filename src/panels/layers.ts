/**
 * Layers panel: the shared layer graph projected as a Figma-style tree. React
 * component boundaries still supply source-aware names and drag metadata, but
 * never replace the hierarchy used by canvas selection.
 *
 * Two rules keep it cheap on an app that renders 28 areas / 137 projects: a
 * branch is walked only while expanded, and rows are diffed in place.
 */

import { toSourceRef } from "../core/bridge"
import { LAYER_INDENT } from "../core/css/layers"
import { el } from "../core/dom"
import { icon, type IconName } from "../core/icons"
import { isDeepSelect } from "../core/keymap"
import { getResolver } from "../core/resolve"
import { elementKey } from "../core/store"
import { createWriter } from "../core/writer"
import type { EditorContext } from "../core/context"
import type { LayerElement, Selection } from "../core/types"

const INDENT = LAYER_INDENT, MAX_DEPTH = 40
/** Filtering is the only full-tree walk; bound it so typing can never lock up. */
const FILTER_BUDGET = 6000

/** Everything the vendor server needs to move a node among its JSX siblings. */
interface DragRef { filePath: string; fromLine: number; parentPath: string; parentLine: number }
interface Meta { name: string; promoted: boolean; drag: DragRef | null }
interface Row { element: LayerElement; parent: LayerElement | null; depth: number; meta: Meta
  open: boolean; hasChildren: boolean; posinset: number; setsize: number }

function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) node.removeAttribute(name)
  else if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

/**
 * The row's type mark, decided from what the DOM can actually tell apart.
 *
 * A component wins over whatever it happens to be rendered as, and is the only
 * one of the four that also takes a colour. Below it the test is deliberately
 * shallow — media, then a leaf that is nothing but words, then the box that
 * everything else is. Guessing harder (list, button, link) would put a dozen
 * near-identical outlines in one column, which is texture, not information.
 */
function glyphFor(element: LayerElement, promoted: boolean): IconName {
  if (promoted) return "Component"
  const tag = element.tagName.toLowerCase()
  if (tag === "img" || tag === "svg" || tag === "picture") return "Image"
  if (!element.firstElementChild && (element.textContent ?? "").trim()) return "Type"
  return "Square"
}

/** One row action, restated in place. The glyph is redrawn only when it flips. */
function setAction(button: HTMLElement, on: boolean, glyph: IconName, label: string): void {
  if (button.dataset.glyph !== glyph) {
    button.dataset.glyph = glyph
    button.replaceChildren(icon(glyph, 12))
  }
  setAttr(button, "aria-pressed", String(on))
  // The label names the OUTCOME, not the state: a button that says "Locked"
  // leaves a screen-reader user to guess what pressing it does.
  setAttr(button, "aria-label", label)
  setAttr(button, "title", label)
}

export function installLayersPanel(context: EditorContext): void {
  const resolver = getResolver(context.bridge)
  const writer = createWriter(context.bridge)
  const childrenOf = (element: Element): LayerElement[] => resolver.layerChildren(element)
  const search = el("input", { class: "de-ai-input", type: "search", placeholder: "Filter layers",
    "aria-label": "Filter layers", style: "min-height:0;height:24px;resize:none" }) as HTMLInputElement
  const tree = el("div", { class: "de-layers-tree", role: "tree", "aria-label": "Layers" })
  const indicator = el("div", { class: "de-layer-drop", "aria-hidden": "true", style: "display:none" })
  const header = el("div", { class: "de-section-header" }, ["Layers"])
  tree.append(indicator)
  context.slots.left.append(header, el("div", { style: "padding:0 8px 8px" }, [search]), tree)

  /** User expand/collapse only. A filter reveals rows without touching it. */
  const overrides = new Map<LayerElement, boolean>()
  const rowByElement = new Map<LayerElement, HTMLElement>()
  const rowInfo = new WeakMap<HTMLElement, Row>()
  const metaCache = new WeakMap<LayerElement, Meta>()
  /** What `display` to put back when the eye is un-hidden; see `toggleVisible`. */
  const restoreDisplay = new WeakMap<LayerElement, string>()
  let filter: { query: string; reveal: Set<LayerElement>; matched: Set<LayerElement> } | null = null
  let visible: Row[] = [], focused: LayerElement | null = null, anchor: LayerElement | null = null

  /**
   * The tree and the canvas must agree on what a layer is, so the instance-root
   * test and the display name come from `core/resolve`. Only the drag reference
   * is the panel's own: a row is reorderable where the engine gave it a JSX
   * line to move, and its host component a line to move it within.
   */
  function metaOf(element: LayerElement): Meta {
    const cached = metaCache.get(element)
    if (cached) return cached
    const { info, name, isRoot } = resolver.meta(element)
    const host = info?.stack[1]
    const drag =
      isRoot && info?.filePath && info.lineNumber && host?.filePath && host.lineNumber
        ? { filePath: info.filePath, fromLine: info.lineNumber, parentPath: host.filePath, parentLine: host.lineNumber }
        : null
    const meta = { name, promoted: isRoot, drag }
    metaCache.set(element, meta)
    return meta
  }

  function filterFor(query: string) {
    const reveal = new Set<LayerElement>()
    const matched = new Set<LayerElement>()
    let budget = FILTER_BUDGET
    const visit = (element: LayerElement, depth: number): boolean => {
      if (budget-- <= 0 || depth > MAX_DEPTH) return false
      let hit = metaOf(element).name.toLowerCase().includes(query)
      if (hit) matched.add(element)
      for (const child of childrenOf(element)) if (visit(child, depth + 1)) hit = true
      if (hit) reveal.add(element)
      return hit
    }
    for (const root of childrenOf(document.body)) visit(root, 0)
    return { query, reveal, matched }
  }

  /** The rows that should be on screen. Collapsed branches are never walked. */
  function flatten(): Row[] {
    const query = search.value.trim().toLowerCase()
    const found = query ? (filter?.query === query ? filter : (filter = filterFor(query))) : null
    const rows: Row[] = []
    const walk = (element: LayerElement, parent: LayerElement | null, depth: number, posinset: number, setsize: number) => {
      const kids = childrenOf(element).filter((k) => !found || found.matched.has(element) || found.reveal.has(k))
      const open = overrides.get(element) ?? Boolean(found && kids.some((k) => found.reveal.has(k)))
      rows.push({ element, parent, depth, meta: metaOf(element), open, hasChildren: kids.length > 0, posinset, setsize })
      if (!open || depth >= MAX_DEPTH) return
      kids.forEach((kid, index) => walk(kid, element, depth + 1, index + 1, kids.length))
    }
    const roots = childrenOf(document.body).filter((root) => !found || found.reveal.has(root))
    roots.forEach((root, index) => walk(root, null, 0, index + 1, roots.length))
    return rows
  }

  function buildRow(row: Row, selected: Set<LayerElement>, focusTarget: LayerElement | null) {
    let node = rowByElement.get(row.element)
    if (!node) {
      const fresh = el("div", { class: "de-layer", role: "treeitem" }, [
        el("span", { class: "de-layer-twisty", "aria-hidden": "true" }),
        el("span", { class: "de-layer-icon", "aria-hidden": "true" }),
        el("span", { class: "de-layer-name" }),
        el("span", { class: "de-layer-actions" }, [
          el("button", { class: "de-layer-action", type: "button", "data-action": "lock" }),
          el("button", { class: "de-layer-action", type: "button", "data-action": "eye" }),
        ]),
      ])
      // open-pencil stops the press on the action itself rather than filtering
      // it out of the row handler. Same here, and on both events: pointerdown
      // is what would otherwise begin a row drag, click is what would select.
      const strip = fresh.lastElementChild as HTMLElement
      strip.addEventListener("pointerdown", (event) => event.stopPropagation())
      strip.addEventListener("click", (event) => {
        event.stopPropagation()
        const action = (event.target as Element).closest<HTMLElement>(".de-layer-action")
        const current = rowInfo.get(fresh)
        if (!action || !current) return
        if (action.dataset.action === "lock") toggleLock(current)
        else toggleVisible(current)
      })
      node = fresh
      rowByElement.set(row.element, node)
    }
    rowInfo.set(node, row)
    const [twisty, glyph, label, strip] = Array.from(node.children) as HTMLElement[]
    const [lock, eye] = Array.from(strip.children) as HTMLElement[]
    const openState = row.hasChildren ? String(row.open) : null
    // Rows are recycled across renders, so the twisty is toggled by presence
    // rather than rebuilt — a fresh <svg> per frame would churn the whole tree.
    if (row.hasChildren && twisty.childElementCount === 0) twisty.append(icon("ChevronRight", 10))
    else if (!row.hasChildren && twisty.childElementCount > 0) twisty.replaceChildren()
    // Same reason the mark is remembered on the node: it can only change when
    // the element does, and redrawing it is another whole <svg>.
    const mark = glyphFor(row.element, row.meta.promoted)
    if (glyph.dataset.glyph !== mark) {
      glyph.dataset.glyph = mark
      glyph.replaceChildren(icon(mark, 12))
    }
    if (label.textContent !== row.meta.name) label.textContent = row.meta.name
    // The stylesheet rotates the twisty off its own aria-expanded; the row
    // carries the state a screen reader actually reads.
    setAttr(twisty, "aria-expanded", openState)
    // Hidden is read back off the cascade rather than remembered, so a row is
    // right about an element the app itself hid. Every visible row reads in one
    // batch here, which is one style flush per render, not one per row.
    const isHidden = getComputedStyle(row.element).display === "none"
    const isLocked = context.getState().locked.has(row.element)
    setAction(lock, isLocked, isLocked ? "Lock" : "LockOpen", `${isLocked ? "Unlock" : "Lock"} ${row.meta.name}`)
    setAction(eye, isHidden, isHidden ? "EyeOff" : "EyeOpen", `${isHidden ? "Show" : "Hide"} ${row.meta.name}`)
    setAttr(node, "class", `de-layer${row.meta.promoted ? " de-layer--component" : ""}` +
      `${isLocked ? " de-layer--locked" : ""}${isHidden ? " de-layer--hidden" : ""}`)
    setAttr(node, "style", `padding-left:${8 + row.depth * INDENT}px;--de-indent:${row.depth * INDENT}px`)
    setAttr(node, "aria-expanded", openState)
    setAttr(node, "aria-selected", String(selected.has(row.element)))
    setAttr(node, "aria-level", String(row.depth + 1))
    setAttr(node, "aria-posinset", String(row.posinset))
    setAttr(node, "aria-setsize", String(row.setsize))
    setAttr(node, "tabindex", row.element === focusTarget ? "0" : "-1")
    node.draggable = Boolean(row.meta.drag)
    return node
  }

  function render(): void {
    visible = flatten()
    const selected = new Set(context.getState().selection.map((entry) => entry.element))
    const focusTarget = visible.some((r) => r.element === focused) ? focused : visible[0]?.element ?? null
    let cursor = indicator.nextSibling
    for (const row of visible) {
      const node = buildRow(row, selected, focusTarget)
      if (node === cursor) cursor = cursor.nextSibling
      else tree.insertBefore(node, cursor)
    }
    while (cursor) {
      const next = cursor.nextSibling
      const stale = rowInfo.get(cursor as HTMLElement)
      if (stale) rowByElement.delete(stale.element)
      tree.removeChild(cursor)
      cursor = next
    }
    const hint = search.value.trim() ? "Nothing matches that filter." : "Waiting for the app."
    if (!visible.length) tree.append(el("div", { class: "de-empty" }, [hint]))
  }

  /**
   * The row as a writable target. `context.describe` is private to the context
   * module, so this rebuilds the same shape from the two core helpers it uses —
   * the same thing `section-align` does to write to a selection's parent.
   */
  function describe(element: LayerElement): Selection {
    const info = context.bridge.elementInfo(element)
    const componentName = info?.componentName || element.tagName.toLowerCase()
    return {
      element,
      tagName: element.tagName.toLowerCase(),
      componentName,
      source: toSourceRef(info),
      key: elementKey(element, componentName, info?.lineNumber ?? 0),
    }
  }

  /**
   * The eye is a real edit, so it goes through the writer every other panel
   * writes through: `display: none` previews now and lands as `hidden` at
   * "Apply to code", and Cmd+Z undoes it like any other change.
   *
   * Showing has to name a value — `applyStyles` sets, it cannot unset — so the
   * display the element had when it was hidden is kept for the trip back.
   * Without that a hidden flex row would come back as a block and quietly
   * restack its children. `block` is only the fallback for something this
   * session never hid itself.
   */
  function toggleVisible(row: Row): void {
    const shown = getComputedStyle(row.element).display
    const hidden = shown === "none"
    if (!hidden) restoreDisplay.set(row.element, shown)
    const value = hidden ? restoreDisplay.get(row.element) ?? "block" : "none"
    const summary = `${hidden ? "Show" : "Hide"} ${row.meta.name}`
    writer.applyStyles(describe(row.element), [{ property: "display", value }], summary)
    render()
  }

  /** A new Set per toggle: `setState` compares by identity. */
  function toggleLock(row: Row): void {
    const locked = new Set(context.getState().locked)
    if (!locked.delete(row.element)) locked.add(row.element)
    context.setState({ locked })
    render()
  }

  function rowAt(target: EventTarget | null): Row | null {
    const node = target instanceof Element ? target.closest(".de-layer") : null
    return node ? rowInfo.get(node as HTMLElement) ?? null : null
  }

  function toggle(row: Row, open: boolean): void {
    overrides.set(row.element, open)
    render()
  }

  /** Roving focus, and optionally selection, moves to `element`. */
  function activate(element: LayerElement | null, select: boolean): void {
    if (!element) return
    focused = element
    if (select) {
      anchor = element
      // A row selects at its own depth, so the canvas scope follows it. Without
      // that, the next click on the canvas jumps straight back out to the top.
      context.selectMany([element])
      context.setState({ scope: resolver.layerParent(element) })
    }
    render()
    rowByElement.get(element)?.focus()
  }

  /**
   * The three ways a row can be clicked.
   *
   * The accelerator comes from `keymap.isDeepSelect`, so this lane and the
   * canvas cannot drift apart on the platform question. They spend it
   * differently on purpose: the canvas has no flattened row order, so Shift is
   * its additive toggle; the tree has one, so Shift is the range and the
   * accelerator is the toggle — which is also how open-pencil reads it.
   *
   * A range walks the FLATTENED visible rows from the last row a click or an
   * Enter landed on. That is the order the eye is dragging down, and the only
   * one in which "the rows between these two" has an answer when the two sit
   * under different parents.
   *
   * Only a plain click re-points the scope: a multi-row selection has no single
   * parent to scope to, and guessing one would silently change what the next
   * click on the canvas resolves to.
   */
  function selectRow(row: Row, event: MouseEvent): void {
    const to = visible.indexOf(row)
    const from = event.shiftKey ? visible.findIndex((r) => r.element === anchor) : -1
    if (from !== -1) {
      const span = visible.slice(Math.min(from, to), Math.max(from, to) + 1)
      context.selectMany(span.map((r) => r.element))
    } else if (isDeepSelect(event)) {
      anchor = row.element
      context.select(row.element, { additive: true })
    } else return activate(row.element, true)
    // Selection is already written; this only moves roving focus and repaints.
    activate(row.element, false)
  }

  // Drop lines come from the vendor's `getSiblings`, the only thing that knows
  // the real JSX sibling list. `reorder` always inserts *before* `toLine`, so
  // dropping below a row targets the next sibling instead.
  let drag: { ref: DragRef; parent: LayerElement | null; lines: Set<number>; to: number } | null = null
  let stopSiblings: (() => void) | null = null

  function endDrag(): void {
    stopSiblings?.()
    stopSiblings = null
    drag = null
    indicator.style.display = "none"
  }

  function dropLine(event: DragEvent): number {
    const row = rowAt(event.target)
    const node = row && rowByElement.get(row.element)
    if (!drag || !row || !node || row.parent !== drag.parent) return 0
    const rect = node.getBoundingClientRect()
    const above = event.clientY <= rect.top + rect.height / 2
    const next = visible[visible.indexOf(row) + 1]
    const target = above ? row : next?.parent === row.parent ? next : null
    const line = target?.meta.drag?.fromLine ?? 0
    if (!line || line === drag.ref.fromLine || !drag.lines.has(line)) return 0
    // Drawn on the HOVERED row's own edge, not the target's top, so above and
    // below read as two gestures — `reorder` is handed one line either way.
    indicator.style.top = `${node.offsetTop + (above ? 0 : node.offsetHeight) - 1}px`
    indicator.style.left = `${4 + row.depth * INDENT}px`
    return line
  }

  tree.addEventListener("click", (event) => {
    const row = rowAt(event.target)
    if (!row) return
    if (row.hasChildren && (event.target as Element).closest(".de-layer-twisty")) toggle(row, !row.open)
    else selectRow(row, event as MouseEvent)
  })
  tree.addEventListener("pointerover", (event) => {
    const row = rowAt(event.target)
    if (row) context.setState({ hovered: row.element })
  })
  tree.addEventListener("pointerleave", () => context.setState({ hovered: null }))

  tree.addEventListener("keydown", (event) => {
    const row = rowAt(event.target)
    if (!row) return
    const index = visible.indexOf(row)
    const step = (to: number) => activate(visible[to]?.element ?? null, false)
    const key = (event as KeyboardEvent).key
    if (key === "ArrowDown") step(index + 1)
    else if (key === "ArrowUp") step(index - 1)
    else if (key === "Home") step(0)
    else if (key === "End") step(visible.length - 1)
    else if (key === "ArrowRight") {
      if (row.hasChildren && !row.open) toggle(row, true)
      else if (visible[index + 1]?.parent === row.element) step(index + 1)
    } else if (key === "ArrowLeft") {
      if (row.hasChildren && row.open) toggle(row, false)
      else activate(row.parent, false)
    } else if (key === "Enter" || key === " ") activate(row.element, true)
    else return
    event.preventDefault()
  })

  tree.addEventListener("dragstart", (event) => {
    const row = rowAt(event.target)
    const ref = row?.meta.drag
    if (!row || !ref) return event.preventDefault()
    ;(event as DragEvent).dataTransfer?.setData("text/plain", row.meta.name)
    drag = { ref, parent: row.parent, lines: new Set(), to: 0 }
    stopSiblings = context.bridge.subscribe((message) => {
      if (message.type !== "siblingsList") return
      stopSiblings?.()
      stopSiblings = null
      for (const s of (message.siblings ?? []) as Array<{ lineNumber: number }>) drag?.lines.add(s.lineNumber)
    })
    context.bridge.send({ type: "getSiblings", filePath: ref.parentPath, parentLine: ref.parentLine })
  })
  tree.addEventListener("dragover", (event) => {
    if (!drag) return
    drag.to = dropLine(event as DragEvent)
    indicator.style.display = drag.to ? "block" : "none"
    if (!drag.to) return
    event.preventDefault()
    const transfer = (event as DragEvent).dataTransfer
    if (transfer) transfer.dropEffect = "move"
  })
  tree.addEventListener("drop", (event) => {
    event.preventDefault()
    const pending = drag
    endDrag()
    if (!pending?.to) return
    // The vendor's own socket listener already toasts `reorderComplete` errors.
    const { filePath, fromLine } = pending.ref
    context.bridge.send({ type: "reorder", filePath, fromLine, toLine: pending.to })
  })
  tree.addEventListener("dragend", endDrag)
  search.addEventListener("input", render)

  context.subscribe((state, previous) => {
    if (state.selection === previous.selection) return
    const element = state.selection[0]?.element ?? null
    for (let n = element && resolver.layerParent(element); n; n = resolver.layerParent(n)) {
      overrides.set(n, true)
    }
    if (element) focused = element
    render()
    // Never smooth: selection can change faster than a smooth scroll settles.
    if (element) rowByElement.get(element)?.scrollIntoView({ block: "nearest" })
  })

  context.onRefresh(() => {
    // `filter` memoises a DOM walk, so a refresh must drop it. `metaCache` is
    // keyed on the element itself and holds fiber-resolved source metadata that
    // a nudge or a drag cannot change — discarding it would re-resolve the whole
    // tree through the bridge on every arrow-key auto-repeat.
    filter = null
    render()
  })

  render()
}
