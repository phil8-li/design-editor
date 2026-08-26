/**
 * Drag-to-move and handle-resize for the current selection.
 *
 * Both write to inline styles first so the gesture stays at 60fps, then hand
 * the resulting values to the inspector's writer on release. The frames in
 * between are preview and nothing else: they are never recorded, so a drag is
 * one history step and one ledger row rather than one per pointermove.
 * Snapping and alignment guides live in `snapping.ts` and hook in through
 * `onDragUpdate`.
 */

import { isChrome, round } from "../core/dom"
import { editorOwnsInput } from "../core/store"
import type { EditorContext } from "../core/context"
import type { LayerElement, Selection } from "../core/types"
import type { StyleWrite, Writer } from "../core/writer"
import type { HandleId } from "./selection"

interface DragTarget {
  /** The writer takes a Selection, not an element: it needs the source ref too. */
  selection: Selection
  element: LayerElement
  offsetX: number
  offsetY: number
  /**
   * The inline declarations as the gesture found them, so the release can put
   * them back exactly. An empty string and `0px` are different states — one
   * leaves the stylesheet in charge — and a normalised reading loses that.
   */
  inline: { transform: string; width: string; height: string }
}

interface Gesture {
  /** `targets[0]` is the primary element the geometry is measured from. */
  targets: DragTarget[]
  mode: "move" | "resize"
  handle: HandleId | null
  startX: number
  startY: number
  startRect: DOMRect
  moved: boolean
}

export interface DragGeometry {
  left: number
  top: number
  width: number
  height: number
}

export interface DragInfo {
  element: LayerElement
  mode: "move" | "resize"
  rect: DOMRect
}

type DragHook = (gesture: {
  element: LayerElement
  rect: DOMRect
  proposed: DragGeometry
}) => DragGeometry

const hooks: DragHook[] = []
const startHooks: Array<(info: DragInfo) => void> = []
const endHooks: Array<() => void> = []

function register<T>(list: T[], entry: T): () => void {
  list.push(entry)
  return () => {
    const index = list.indexOf(entry)
    if (index !== -1) list.splice(index, 1)
  }
}

/** Snapping registers here so it can adjust the proposed geometry each frame. */
export function onDragUpdate(hook: DragHook): () => void {
  return register(hooks, hook)
}

/** Fires once the drag threshold is crossed, so hooks measure a settled layout. */
export function onDragStart(hook: (info: DragInfo) => void): () => void {
  return register(startHooks, hook)
}

export function onDragEnd(hook: () => void): () => void {
  return register(endHooks, hook)
}

let altDown = false

/**
 * Alt is the one gesture modifier the canvas shares: it suppresses snapping
 * while dragging and reveals measurements while hovering. Pointer events keep
 * it honest when the document never received the keydown.
 */
export function isAltDown(): boolean {
  return altDown
}

function readOffset(element: LayerElement): { x: number; y: number } {
  const style = getComputedStyle(element)
  const matrix = new DOMMatrixReadOnly(style.transform === "none" ? "" : style.transform)
  return { x: matrix.m41, y: matrix.m42 }
}

/**
 * The element's translate offset shifted by a delta. One definition, so drag
 * and keyboard nudge can never disagree about what "move by 1px" means.
 */
export function translateBy(element: LayerElement, dx: number, dy: number): string {
  const offset = readOffset(element)
  return `translate(${round(offset.x + dx)}px, ${round(offset.y + dy)}px)`
}

const DRAG_THRESHOLD = 3

/**
 * Restores one inline declaration, where "no declaration" is a value too.
 * Blanking a property the element never set inline is not the same as removing
 * it: the blank keeps the declaration and shuts the stylesheet out.
 */
function setInline(element: LayerElement, property: string, value: string): void {
  if (value) element.style.setProperty(property, value)
  else element.style.removeProperty(property)
}

export function installTransform(context: EditorContext, writer: Writer): void {
  let gesture: Gesture | null = null
  let capture: Element | null = null
  let pointerId = -1

  const targetsFor = (selections: Selection[]): DragTarget[] =>
    selections.map((selection) => {
      const element = selection.element
      const offset = readOffset(element)
      return {
        selection,
        element,
        offsetX: offset.x,
        offsetY: offset.y,
        inline: {
          transform: element.style.transform,
          width: element.style.width,
          height: element.style.height,
        },
      }
    })

  const onPointerDown = (event: PointerEvent) => {
    if (!editorOwnsInput()) return
    const state = context.getState()
    if (state.tool !== "move") return
    if (event.button !== 0) return

    const target = event.target as HTMLElement | null
    const handleId = target?.dataset?.handle as HandleId | undefined
    const primary = state.selection[0] ?? null
    const selected = primary?.element ?? null

    const capturePointer = () => {
      capture = event.target instanceof Element ? event.target : null
      pointerId = event.pointerId
      if (!capture || !("setPointerCapture" in capture)) return
      try {
        ;(capture as Element & { setPointerCapture(id: number): void }).setPointerCapture(pointerId)
      } catch {
        capture = null
      }
    }

    if (handleId && primary) {
      gesture = {
        targets: targetsFor([primary]),
        mode: "resize",
        handle: handleId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: primary.element.getBoundingClientRect(),
        moved: false,
      }
      capturePointer()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    // Shift+drag is the full-bleed marquee escape hatch. Reserve it before a
    // selected descendant can turn the same press into a move gesture.
    if (event.shiftKey) return
    if (isChrome(target) || !selected) return
    if (!selected.contains(target)) return

    // Dragging one member of a multi-selection carries the whole set.
    gesture = {
      targets: targetsFor(state.selection),
      mode: "move",
      handle: null,
      startX: event.clientX,
      startY: event.clientY,
      startRect: selected.getBoundingClientRect(),
      moved: false,
    }
    capturePointer()
  }

  const onPointerMove = (event: PointerEvent) => {
    altDown = event.altKey
    if (!gesture) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!gesture.moved) {
      gesture.moved = true
      const info: DragInfo = {
        element: gesture.targets[0].element,
        mode: gesture.mode,
        rect: gesture.startRect,
      }
      for (const hook of startHooks) hook(info)
    }
    event.preventDefault()

    const { startRect } = gesture
    let proposed: DragGeometry = {
      left: startRect.left,
      top: startRect.top,
      width: startRect.width,
      height: startRect.height,
    }

    if (gesture.mode === "move") {
      proposed.left += dx
      proposed.top += dy
    } else {
      const handle = gesture.handle ?? "se"
      if (handle.includes("e")) proposed.width = Math.max(1, startRect.width + dx)
      if (handle.includes("s")) proposed.height = Math.max(1, startRect.height + dy)
      if (handle.includes("w")) {
        proposed.width = Math.max(1, startRect.width - dx)
        proposed.left = startRect.left + dx
      }
      if (handle.includes("n")) {
        proposed.height = Math.max(1, startRect.height - dy)
        proposed.top = startRect.top + dy
      }
    }

    for (const hook of hooks) {
      proposed = hook({ element: gesture.targets[0].element, rect: startRect, proposed })
    }

    const shiftX = proposed.left - startRect.left
    const shiftY = proposed.top - startRect.top

    if (gesture.mode === "move") {
      for (const target of gesture.targets) {
        target.element.style.transform = `translate(${target.offsetX + shiftX}px, ${target.offsetY + shiftY}px)`
      }
      return
    }

    const primary = gesture.targets[0]
    primary.element.style.width = `${Math.round(proposed.width)}px`
    primary.element.style.height = `${Math.round(proposed.height)}px`
    if (shiftX !== 0 || shiftY !== 0) {
      primary.element.style.transform = `translate(${primary.offsetX + shiftX}px, ${primary.offsetY + shiftY}px)`
    }
  }

  /**
   * The gesture's own preview, rewound and then replayed through the writer.
   *
   * `writer.applyStyles` reads the "before" value off the element to decide
   * whether anything changed and what the ledger's "from" should be, so with
   * the dragged value still sitting inline the write reads as a no-op: no
   * history step, and a change prompt that reports `from` equal to `to`.
   * Restoring first is what makes a drag an edit like any other. Both halves
   * run in the same task, so nothing paints in between and the rewind is
   * invisible.
   */
  const commit = (finished: Gesture) => {
    const summary = finished.mode === "resize" ? "Resize" : "Move"
    for (const target of finished.targets) {
      const style = target.element.style
      const writes: StyleWrite[] = []
      if (finished.mode === "resize") {
        writes.push({ property: "width", value: style.width })
        writes.push({ property: "height", value: style.height })
      }
      // A resize only moves the origin when a west or north handle dragged it,
      // and a move that snapped back where it started moved nothing. The
      // element is the honest record of which of those happened.
      if (style.transform !== target.inline.transform) {
        writes.push({ property: "transform", value: style.transform })
      }
      if (writes.length === 0) continue

      setInline(target.element, "transform", target.inline.transform)
      if (finished.mode === "resize") {
        setInline(target.element, "width", target.inline.width)
        setInline(target.element, "height", target.inline.height)
      }
      // One call carrying every property the gesture settled, so a resize that
      // also shifted the origin is one step on the timeline rather than three.
      writer.applyStyles(target.selection, writes, summary)
    }
  }

  const onPointerUp = () => {
    if (capture && pointerId >= 0 && "releasePointerCapture" in capture) {
      try {
        ;(capture as Element & { releasePointerCapture(id: number): void }).releasePointerCapture(pointerId)
      } catch {
        // A removed target has already released capture.
      }
    }
    capture = null
    pointerId = -1
    if (!gesture) return
    const finished = gesture
    gesture = null
    if (!finished.moved) return
    // Before the hooks and the refresh: both read state the write produces —
    // the guides come down around a settled element, and the panels repaint
    // from the history and ledger entries this leaves behind.
    commit(finished)
    for (const hook of endHooks) hook()
    context.refresh()
  }

  const onAltKey = (event: KeyboardEvent) => {
    altDown = event.altKey
  }

  window.addEventListener("pointerdown", onPointerDown, true)
  window.addEventListener("pointermove", onPointerMove, true)
  window.addEventListener("pointerup", onPointerUp, true)
  window.addEventListener("pointercancel", onPointerUp, true)
  window.addEventListener("keydown", onAltKey, true)
  window.addEventListener("keyup", onAltKey, true)
  window.addEventListener("blur", () => {
    altDown = false
  })
}
