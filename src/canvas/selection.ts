/**
 * Selection and hover chrome drawn in the overlay layer.
 *
 * Geometry is read every frame while something is selected: the app animates
 * with Motion, so a cached rect would drift behind the element it outlines.
 * Guides and measurements paint from this same loop — a second rAF loop would
 * double the layout reads every frame costs.
 */

import { el } from "../core/dom"
import type { EditorContext } from "../core/context"

const HANDLES = [
  ["nw", 0, 0, "nwse-resize"],
  ["n", 0.5, 0, "ns-resize"],
  ["ne", 1, 0, "nesw-resize"],
  ["e", 1, 0.5, "ew-resize"],
  ["se", 1, 1, "nwse-resize"],
  ["s", 0.5, 1, "ns-resize"],
  ["sw", 0, 1, "nesw-resize"],
  ["w", 0, 0.5, "ew-resize"],
] as const

export type HandleId = (typeof HANDLES)[number][0]

/** Handles read as 7px but grab at 13px: Fitts' law without the visual bulk. */
const HANDLE_SIZE = 7
const HANDLE_HIT = 13

export interface NodePool {
  /** Returns a visible node; call `flush()` once per pass to hide the rest. */
  take(): HTMLElement
  flush(): void
}

/** Overlay nodes are pooled so the per-frame painters never allocate DOM. */
export function createNodePool(parent: HTMLElement, className: string): NodePool {
  const nodes: HTMLElement[] = []
  let used = 0
  return {
    take() {
      let node = nodes[used]
      if (!node) {
        node = el("div", { class: className })
        parent.append(node)
        nodes.push(node)
      }
      node.style.display = "block"
      used += 1
      return node
    },
    flush() {
      for (let index = used; index < nodes.length; index += 1) nodes[index].style.display = "none"
      used = 0
    },
  }
}

/** Positions an overlay node; sizes are omitted for auto-sized nodes. */
export function placeNode(
  node: HTMLElement,
  x: number,
  y: number,
  width?: number,
  height?: number
): void {
  node.style.transform = `translate(${x}px, ${y}px)`
  if (width !== undefined) node.style.width = `${width}px`
  if (height !== undefined) node.style.height = `${height}px`
}

/** Centres an auto-sized badge on a point. */
export function placeBadge(node: HTMLElement, x: number, y: number, text: string): void {
  node.textContent = text
  node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
}

const painters: Array<() => void> = []

/** Registers a painter on the shared canvas-chrome frame loop. */
export function onFrame(paint: () => void): () => void {
  painters.push(paint)
  return () => {
    const index = painters.indexOf(paint)
    if (index !== -1) painters.splice(index, 1)
  }
}

export function installSelectionFrame(context: EditorContext): void {
  const layer = context.slots.overlay
  const hoverOutline = el("div", { class: "de-outline de-outline--hover" })
  const boundsOutline = el("div", { class: "de-outline" })
  const label = el("div", { class: "de-badge" })
  layer.append(hoverOutline, boundsOutline, label)

  // Per-element outlines for a multi-selection; `boundsOutline` wraps the set.
  const members = createNodePool(layer, "de-outline")

  const handles = new Map<HandleId, HTMLElement>()
  const inset = (HANDLE_HIT - HANDLE_SIZE) / 2
  for (const [id, , , cursor] of HANDLES) {
    const visual = el("div", {
      class: "de-handle",
      style: `margin:0;left:${inset}px;top:${inset}px;pointer-events:none`,
    })
    handles.set(
      id,
      el(
        "div",
        {
          "data-handle": id,
          style: `position:absolute;width:${HANDLE_HIT}px;height:${HANDLE_HIT}px;margin:${-HANDLE_HIT / 2}px 0 0 ${-HANDLE_HIT / 2}px;pointer-events:auto;cursor:${cursor}`,
        },
        [visual]
      )
    )
  }
  layer.append(...handles.values())

  const hide = (node: HTMLElement) => {
    node.style.display = "none"
  }

  const paintSelection = () => {
    const state = context.getState()
    const selection = state.selection

    // Every rect this frame needs is read before anything is written. Writing a
    // style between two reads invalidates layout, so an interleaved loop forces
    // one synchronous reflow per selected element — on every animation frame.
    // Any selected element already draws its own stroke; a hover outline on top
    // of one would read as a second, thicker border rather than as feedback.
    const hoverRect =
      state.hovered && !selection.some((entry) => entry.element === state.hovered)
        ? state.hovered.getBoundingClientRect()
        : null
    const rects: DOMRect[] = []
    for (const entry of selection) {
      if (!entry.element.isConnected) continue
      rects.push(entry.element.getBoundingClientRect())
    }

    if (hoverRect) {
      hoverOutline.style.display = "block"
      placeNode(hoverOutline, hoverRect.left, hoverRect.top, hoverRect.width, hoverRect.height)
    } else {
      hide(hoverOutline)
    }

    let left = Number.POSITIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    const count = rects.length

    for (const rect of rects) {
      if (rect.left < left) left = rect.left
      if (rect.top < top) top = rect.top
      if (rect.right > right) right = rect.right
      if (rect.bottom > bottom) bottom = rect.bottom
      if (count > 1) {
        placeNode(members.take(), rect.left, rect.top, rect.width, rect.height)
      }
    }
    members.flush()

    if (count === 0) {
      hide(boundsOutline)
      hide(label)
      for (const handle of handles.values()) hide(handle)
      return
    }

    const width = right - left
    const height = bottom - top
    boundsOutline.style.display = "block"
    boundsOutline.style.borderStyle = "solid"
    placeNode(boundsOutline, left, top, width, height)

    label.style.display = "block"
    label.textContent =
      count > 1
        ? `${count} layers · ${Math.round(width)} × ${Math.round(height)}`
        : `${Math.round(width)} × ${Math.round(height)}`
    placeNode(label, Math.max(4, left), top - 18 < 4 ? bottom + 4 : top - 18)

    const showHandles = count === 1 && (state.tool === "move" || state.tool === "select")
    for (const [id, fx, fy] of HANDLES) {
      const handle = handles.get(id)
      if (!handle) continue
      const horizontalMiddle = fx === 0.5 && width < 24
      const verticalMiddle = fy === 0.5 && height < 24
      if (!showHandles || horizontalMiddle || verticalMiddle) {
        hide(handle)
        continue
      }
      handle.style.display = "block"
      placeNode(handle, left + width * fx, top + height * fy)
    }
  }

  let frame = 0
  let destroyed = false
  const schedule = () => {
    if (!destroyed && frame === 0) frame = requestAnimationFrame(draw)
  }
  const draw = () => {
    frame = 0
    if (!layer.isConnected) {
      destroyed = true
      unsubscribe()
      return
    }
    paintSelection()
    for (let index = 0; index < painters.length; index += 1) painters[index]()
    const state = context.getState()
    // Selected or hovered app content may move under Motion, so track it. Once
    // both are empty, stop entirely until the store wakes the painter again.
    if (state.selection.length > 0 || state.hovered) schedule()
  }

  const unsubscribe = context.subscribe((next, previous) => {
    if (
      next.selection !== previous.selection ||
      next.hovered !== previous.hovered ||
      next.tool !== previous.tool
    ) {
      schedule()
    }
  })
  schedule()
  window.addEventListener("beforeunload", () => {
    destroyed = true
    unsubscribe()
    if (frame) cancelAnimationFrame(frame)
  })
}
