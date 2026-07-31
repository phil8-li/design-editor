/**
 * Marquee multi-select.
 *
 * The gesture starts only on genuinely empty canvas — the page background,
 * never an element — because a drag that begins on an element already means
 * "move that element", and one gesture may only mean one thing.
 */

import { el, isCanvasElement, isChrome } from "../core/dom"
import { isDeepSelect } from "../core/keymap"
import { getResolver, isLayerCandidate, toSelectable } from "../core/resolve"
import type { EditorContext } from "../core/context"

const DRAG_THRESHOLD = 3

export function installMarquee(context: EditorContext): void {
  const resolver = getResolver(context.bridge)
  const box = el("div", { class: "de-marquee", style: "display:none" })
  context.slots.overlay.append(box)

  let originX = 0
  let originY = 0
  let pending = false
  let active = false
  let additive = false

  /**
   * Touching an object selects it. Full enclosure is the intuitive rule and the
   * wrong one: on a full-bleed layout nothing is ever entirely inside the drag,
   * so an enclose-only marquee returns almost nothing.
   */
  const touched = (element: Element, l: number, t: number, r: number, b: number): boolean => {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    return !(rect.right < l || rect.left > r || rect.bottom < t || rect.top > b)
  }

  /**
   * Candidates come from the current scope at layer granularity, so a marquee
   * collects the same things a click would — a selection set stays
   * depth-homogeneous. The deep modifier ignores scope depth and collects the
   * INNERMOST candidates instead, matching Cmd-click's deep select.
   */
  const swept = (l: number, t: number, r: number, b: number, deep: boolean): Element[] => {
    // `isConnected`, as in `resolve()`: React replaces DOM nodes constantly, and
    // a drilled scope that has since been unmounted makes `querySelectorAll`
    // and `layerChildren` both return nothing — a marquee that selects zero
    // elements for no reason the user can see. Fall back to the live root.
    const held = context.getState().scope
    const scope = held?.isConnected ? held : resolver.scopeRoot()

    if (!deep) return resolver.layerChildren(scope).filter((node) => touched(node, l, t, r, b))

    // Document order is ancestors-first, so keeping the first match of any
    // nested pair keeps the OUTERMOST — which made the deep modifier return the
    // app shell and nothing else. Walk it in reverse and drop any candidate
    // that contains one already taken, which leaves the leaves.
    const found: Element[] = []
    for (const node of Array.from(scope.querySelectorAll("*")).reverse()) {
      if (!isLayerCandidate(node)) continue
      if (found.some((chosen) => node.contains(chosen))) continue
      if (!touched(node, l, t, r, b)) continue
      found.push(node)
    }
    return found.reverse()
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
    const hits = swept(left, top, right, bottom, isDeepSelect(event))
      .map(toSelectable)
      .filter((node): node is HTMLElement => node !== null)
    context.selectMany([...kept, ...hits])
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
