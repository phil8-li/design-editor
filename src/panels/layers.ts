/**
 * Layers panel: the shared layer graph projected as a Figma-style tree. React
 * component boundaries still supply source-aware names and drag metadata, but
 * never replace the hierarchy used by canvas selection.
 *
 * Two rules keep it cheap on an app that renders 28 areas / 137 projects: a
 * branch is walked only while expanded, and rows are diffed in place.
 */

import { el } from "../core/dom"
import { icon } from "../core/icons"
import { getResolver } from "../core/resolve"
import type { EditorContext } from "../core/context"

const INDENT = 12, MAX_DEPTH = 40
/** Filtering is the only full-tree walk; bound it so typing can never lock up. */
const FILTER_BUDGET = 6000

/** Everything the vendor server needs to move a node among its JSX siblings. */
interface DragRef { filePath: string; fromLine: number; parentPath: string; parentLine: number }
interface Meta { name: string; promoted: boolean; drag: DragRef | null }
interface Row { element: HTMLElement; parent: HTMLElement | null; depth: number; meta: Meta
  open: boolean; hasChildren: boolean; posinset: number; setsize: number }

function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) node.removeAttribute(name)
  else if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

export function installLayersPanel(context: EditorContext): void {
  const resolver = getResolver(context.bridge)
  const childrenOf = (element: Element): HTMLElement[] => resolver.layerChildren(element)
  const search = el("input", { class: "de-ai-input", type: "search", placeholder: "Filter layers",
    "aria-label": "Filter layers", style: "min-height:0;height:24px;resize:none" }) as HTMLInputElement
  const tree = el("div", { role: "tree", "aria-label": "Layers",
    style: "position:relative;padding-bottom:8px" })
  const indicator = el("div", { class: "de-guide", "aria-hidden": "true",
    style: "display:none;left:0;right:0;height:2px" })
  const header = el("div", { class: "de-section-header" }, ["Layers"])
  tree.append(indicator)
  context.slots.left.append(header, el("div", { style: "padding:0 8px 8px" }, [search]), tree)

  /** User expand/collapse only. A filter reveals rows without touching it. */
  const overrides = new Map<HTMLElement, boolean>()
  const rowByElement = new Map<HTMLElement, HTMLElement>()
  const rowInfo = new WeakMap<HTMLElement, Row>()
  const metaCache = new WeakMap<HTMLElement, Meta>()
  let filter: { query: string; reveal: Set<HTMLElement>; matched: Set<HTMLElement> } | null = null
  let visible: Row[] = [], focused: HTMLElement | null = null

  /**
   * The tree and the canvas must agree on what a layer is, so the instance-root
   * test and the display name come from `core/resolve`. Only the drag reference
   * is the panel's own: a row is reorderable where the engine gave it a JSX
   * line to move, and its host component a line to move it within.
   */
  function metaOf(element: HTMLElement): Meta {
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
    const reveal = new Set<HTMLElement>()
    const matched = new Set<HTMLElement>()
    let budget = FILTER_BUDGET
    const visit = (element: HTMLElement, depth: number): boolean => {
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
    const walk = (element: HTMLElement, parent: HTMLElement | null, depth: number, posinset: number, setsize: number) => {
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

  function buildRow(row: Row, selected: Set<HTMLElement>, focusTarget: HTMLElement | null) {
    let node = rowByElement.get(row.element)
    if (!node) {
      node = el("div", { class: "de-layer", role: "treeitem" }, [
        el("span", { class: "de-layer-twisty", "aria-hidden": "true" }),
        el("span", { class: "de-layer-name" }),
      ])
      rowByElement.set(row.element, node)
    }
    rowInfo.set(node, row)
    const [twisty, label] = Array.from(node.children) as HTMLElement[]
    const openState = row.hasChildren ? String(row.open) : null
    // Rows are recycled across renders, so the twisty is toggled by presence
    // rather than rebuilt — a fresh <svg> per frame would churn the whole tree.
    if (row.hasChildren && twisty.childElementCount === 0) twisty.append(icon("ChevronRight", 10))
    else if (!row.hasChildren && twisty.childElementCount > 0) twisty.replaceChildren()
    if (label.textContent !== row.meta.name) label.textContent = row.meta.name
    // The stylesheet rotates the twisty off its own aria-expanded; the row
    // carries the state a screen reader actually reads.
    setAttr(twisty, "aria-expanded", openState)
    setAttr(node, "class", `de-layer${row.meta.promoted ? " de-layer--component" : ""}`)
    setAttr(node, "style", `padding-left:${8 + row.depth * INDENT}px`)
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

  function rowAt(target: EventTarget | null): Row | null {
    const node = target instanceof Element ? target.closest(".de-layer") : null
    return node ? rowInfo.get(node as HTMLElement) ?? null : null
  }

  function toggle(row: Row, open: boolean): void {
    overrides.set(row.element, open)
    render()
  }

  /** Roving focus, and optionally selection, moves to `element`. */
  function activate(element: HTMLElement | null, select: boolean): void {
    if (!element) return
    focused = element
    if (select) {
      // A row selects at its own depth, so the canvas scope follows it. Without
      // that, the next click on the canvas jumps straight back out to the top.
      context.selectMany([element])
      context.setState({ scope: resolver.layerParent(element) })
    }
    render()
    rowByElement.get(element)?.focus()
  }

  // Drop lines come from the vendor's `getSiblings`, the only thing that knows
  // the real JSX sibling list. `reorder` always inserts *before* `toLine`, so
  // dropping below a row targets the next sibling instead.
  let drag: { ref: DragRef; parent: HTMLElement | null; lines: Set<number>; to: number } | null = null
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
    const next = visible[visible.indexOf(row) + 1]
    const target = event.clientY <= rect.top + rect.height / 2 ? row : next?.parent === row.parent ? next : null
    const line = target?.meta.drag?.fromLine ?? 0
    if (!line || line === drag.ref.fromLine || !drag.lines.has(line)) return 0
    indicator.style.top = `${rowByElement.get(target!.element)!.offsetTop - 1}px`
    return line
  }

  tree.addEventListener("click", (event) => {
    const row = rowAt(event.target)
    if (!row) return
    if (row.hasChildren && (event.target as Element).closest(".de-layer-twisty")) toggle(row, !row.open)
    else activate(row.element, true)
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
