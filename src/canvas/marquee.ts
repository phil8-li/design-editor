/**
 * Marquee multi-select.
 *
 * The gesture starts only on genuinely empty canvas — the page background,
 * never an element — because a drag that begins on an element already means
 * "move that element", and one gesture may only mean one thing.
 */

import { el, isCanvasElement, isChrome } from "../core/dom"
import type { EditorContext } from "../core/context"

const DRAG_THRESHOLD = 3

export function installMarquee(context: EditorContext): void {
  const box = el("div", { class: "de-marquee", style: "display:none" })
  context.slots.overlay.append(box)

  let originX = 0
  let originY = 0
  let pending = false
  let active = false
  let additive = false

  /** Shallowest fully-enclosed elements: picking descendants too would select
   * the same thing five times over. */
  const enclosed = (left: number, top: number, right: number, bottom: number): HTMLElement[] => {
    const found: HTMLElement[] = []
    for (const node of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (!isCanvasElement(node)) continue
      if (found.some((chosen) => chosen.contains(node))) continue
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      if (rect.left < left || rect.top < top || rect.right > right || rect.bottom > bottom) continue
      found.push(node)
    }
    return found
  }

  const onPointerDown = (event: PointerEvent) => {
    const { tool } = context.getState()
    if (event.button !== 0 || (tool !== "move" && tool !== "select")) return
    if (isChrome(event.target) || isCanvasElement(event.target)) return
    originX = event.clientX
    originY = event.clientY
    additive = event.shiftKey
    pending = true
    active = false
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pending) return
    const dx = event.clientX - originX
    const dy = event.clientY - originY
    if (!active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    active = true
    event.preventDefault()
    box.style.display = "block"
    box.style.transform = `translate(${Math.min(originX, event.clientX)}px, ${Math.min(originY, event.clientY)}px)`
    box.style.width = `${Math.abs(dx)}px`
    box.style.height = `${Math.abs(dy)}px`
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!pending) return
    pending = false
    box.style.display = "none"
    if (!active) return
    active = false

    const left = Math.min(originX, event.clientX)
    const right = Math.max(originX, event.clientX)
    const top = Math.min(originY, event.clientY)
    const bottom = Math.max(originY, event.clientY)

    // One store write for the whole marquee: selecting element-by-element would
    // rebuild every panel once per hit, and a wide drag hits dozens.
    const kept = additive ? context.getState().selection.map((entry) => entry.element) : []
    context.selectMany([...kept, ...enclosed(left, top, right, bottom)])
  }

  window.addEventListener("pointerdown", onPointerDown, true)
  window.addEventListener("pointermove", onPointerMove, true)
  window.addEventListener("pointerup", onPointerUp, true)
  window.addEventListener("pointercancel", () => {
    pending = false
    active = false
    box.style.display = "none"
  }, true)
}
