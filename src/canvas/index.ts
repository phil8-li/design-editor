/**
 * Canvas lane entry: hover feedback, click-to-select, keyboard navigation, and
 * the selection frame.
 *
 * Direct manipulation (drag, resize, snapping, measurement, marquee) is layered
 * on by the modules this installs, so each concern owns one file.
 */

import { isCanvasElement, isChrome } from "../core/dom"
import { createWriter } from "../core/writer"
import type { EditorContext } from "../core/context"
import { installSelectionFrame } from "./selection"
import { installTransform, translateBy } from "./transform"
import { installSnapping } from "./snapping"
import { installMeasure } from "./measure"
import { installMarquee } from "./marquee"

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Editing text is editing text: the canvas keeps its hands off those keys. */
function isTextEntry(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.isContentEditable) return true
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT"
}

/** Topmost non-chrome element under the point — the deepest painted app node. */
function deepestAt(x: number, y: number): HTMLElement | null {
  for (const node of document.elementsFromPoint(x, y)) {
    if (isCanvasElement(node)) return node
  }
  return null
}

export function installCanvas(context: EditorContext): void {
  const writer = createWriter(context.bridge)

  installSelectionFrame(context)
  installTransform(context)
  installSnapping(context)
  installMeasure(context)
  installMarquee(context)

  const onPointerMove = (event: PointerEvent) => {
    const { tool } = context.getState()
    if (tool === "hand" || tool === "text") return
    const target = event.target
    const hovered = isCanvasElement(target) ? target : null
    if (context.getState().hovered !== hovered) context.setState({ hovered })
  }

  const onPointerDown = (event: PointerEvent) => {
    if (isChrome(event.target)) return
    const { tool } = context.getState()
    if (tool === "hand" || tool === "text" || tool === "comment") return

    // Cmd/Ctrl reaches past whatever the app layered on top of the hit target.
    if (event.metaKey || event.ctrlKey) {
      const deepest = deepestAt(event.clientX, event.clientY)
      if (deepest) {
        context.select(deepest, { additive: event.shiftKey })
        return
      }
    }

    if (!isCanvasElement(event.target)) {
      // Shift means "add to what I have"; the marquee about to start needs it.
      if (!event.shiftKey) context.select(null)
      return
    }
    context.select(event.target, { additive: event.shiftKey })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Keys pressed inside our own chrome belong to that control. Without this
    // guard, arrowing through the layers tree would nudge the selected element
    // and dirty "Apply to code", and Enter would never reach a panel button.
    if (isChrome(event.target) || isTextEntry(event.target)) return
    const state = context.getState()
    const primary = state.selection[0]

    if (event.key === "Escape") {
      if (!primary) return
      const parent = primary.element.parentElement
      context.select(parent && isCanvasElement(parent) ? parent : null)
      return
    }

    if (event.key === "Enter") {
      if (!primary) return
      const child = Array.from(primary.element.children).find(isCanvasElement)
      if (!child) return
      event.preventDefault()
      context.select(child)
      return
    }

    const delta = NUDGE[event.key]
    if (!delta || state.selection.length === 0) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    for (const entry of state.selection) {
      const value = translateBy(entry.element, delta[0] * step, delta[1] * step)
      writer.applyStyles(entry, [{ property: "transform", value }], `Nudge ${step}px`)
    }
    context.refresh()
  }

  // Swallow app activation while a design tool is active: clicking a button to
  // select it must not also navigate. Capture on `window` runs before the
  // vendor overlay's own document-level guards, so ours wins the gesture.
  const onClick = (event: MouseEvent) => {
    const { tool } = context.getState()
    if (tool !== "move" && tool !== "select") return
    if (isChrome(event.target) || !isCanvasElement(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }

  window.addEventListener("pointermove", onPointerMove, true)
  window.addEventListener("pointerdown", onPointerDown, true)
  window.addEventListener("click", onClick, true)
  window.addEventListener("keydown", onKeyDown, true)
}
