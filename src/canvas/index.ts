/**
 * Canvas lane entry: hover feedback, click-to-select, keyboard navigation, and
 * the selection frame.
 *
 * Every gesture here answers "what did the user point at?" through
 * `core/resolve`, never on its own. Direct manipulation (drag, resize,
 * snapping, measurement, marquee) is layered on by the modules this installs,
 * so each concern owns one file.
 */

import { isCanvasElement, isChrome } from "../core/dom"
import { canvasAction, isDeepSelect, NUDGE, ownsCanvasKeys } from "../core/keymap"
import { getResolver, toSelectable } from "../core/resolve"
import { createWriter } from "../core/writer"
import type { EditorContext } from "../core/context"
import { installSelectionFrame } from "./selection"
import { installTransform, translateBy } from "./transform"
import { installSnapping } from "./snapping"
import { installMeasure } from "./measure"
import { installMarquee } from "./marquee"
import { installLayerMenu } from "./layer-menu"

export function installCanvas(context: EditorContext): void {
  const writer = createWriter(context.bridge)
  const resolver = getResolver(context.bridge)

  installSelectionFrame(context)
  installTransform(context)
  installSnapping(context)
  installMeasure(context)
  installMarquee(context)
  installLayerMenu(context)

  // `select()` early-returns when the element is already the whole selection,
  // so a re-click can never refresh a source ref that a code edit has moved.
  // `selectMany` carries no such guard and a one-element set is the same write.
  const selectOne = (element: HTMLElement) => context.selectMany([element])

  // The last pointer position, so a modifier press can re-answer the question
  // with the pointer standing still.
  let pointerX = 0
  let pointerY = 0

  const hitFor = (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
    if (isCanvasElement(event.target)) return event.target
    return resolver.hitStack(event.clientX, event.clientY)[0] ?? null
  }

  /** The one answer both the outline and the click use. */
  const targetFor = (hit: Element | null, deep: boolean): HTMLElement | null => {
    if (!hit) return null
    return toSelectable(resolver.resolve(hit, context.getState().scope, deep))
  }

  const setHovered = (hovered: Element | null) => {
    if (context.getState().hovered !== hovered) context.setState({ hovered })
  }

  const onPointerMove = (event: PointerEvent) => {
    pointerX = event.clientX
    pointerY = event.clientY
    const { tool } = context.getState()
    if (tool === "hand" || tool === "text") return
    if (isChrome(event.target)) return
    setHovered(targetFor(hitFor(event), isDeepSelect(event)))
  }

  const onPointerDown = (event: PointerEvent) => {
    if (isChrome(event.target)) return
    const { tool } = context.getState()
    if (tool === "hand" || tool === "text" || tool === "comment") return
    // Right-click belongs to the layer-stack menu, which selects for itself.
    if (event.button !== 0) return

    const deep = isDeepSelect(event)
    const target = targetFor(hitFor(event), deep)
    if (!target) {
      // Shift means "add to what I have"; the marquee about to start needs it.
      if (event.shiftKey) return
      context.select(null)
      context.setState({ scope: null })
      return
    }

    // Shift is a toggle, not an append: clicking a selected element again with
    // shift held takes it back out of the set.
    if (event.shiftKey) context.select(target, { additive: true })
    else selectOne(target)
    // Deep select is a one-shot bypass of the scope rule, so it re-points the
    // scope at the layer it landed in — otherwise the next plain click undoes it.
    if (deep) context.setState({ scope: resolver.layerParent(target) })
  }

  /** Double-click descends exactly one level and takes the scope with it. */
  const onDoubleClick = (event: MouseEvent) => {
    if (isChrome(event.target)) return
    const { tool } = context.getState()
    if (tool === "hand" || tool === "text" || tool === "comment") return
    const hit = hitFor(event)
    if (!hit) return

    const state = context.getState()
    const primary = state.selection[0]?.element ?? null
    const next = primary && primary.contains(hit) ? primary : resolver.resolve(hit, state.scope)
    if (!next) return
    context.setState({ scope: next })
    const target = toSelectable(resolver.resolve(hit, next))
    if (target) selectOne(target)
    event.preventDefault()
    event.stopPropagation()
  }

  const nudge = (event: KeyboardEvent) => {
    const state = context.getState()
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

  const selectAt = (element: Element | null, scope: Element | null) => {
    const target = toSelectable(element)
    if (!target) return
    selectOne(target)
    context.setState({ scope })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // A held modifier changes what a click would select, so the outline has to
    // follow it even while the pointer is stationary.
    if (event.key === "Meta" || event.key === "Control") {
      setHovered(targetFor(resolver.hitStack(pointerX, pointerY)[0] ?? null, isDeepSelect(event)))
      return
    }
    if (!ownsCanvasKeys(event)) return

    const action = canvasAction(event)
    if (!action) return
    if (action === "nudge") {
      nudge(event)
      return
    }

    const state = context.getState()
    const primary = state.selection[0]?.element ?? null

    // Escape clears. It does not select the parent — that is Shift+Enter.
    if (action === "deselect") {
      if (!primary && !state.scope) return
      context.select(null)
      context.setState({ scope: null })
      return
    }

    // Tab only belongs to the canvas while something is selected; otherwise it
    // is still the browser's focus traversal and the panels' way in.
    if (!primary) return
    event.preventDefault()

    if (action === "select-child") {
      selectAt(resolver.layerChildren(primary)[0] ?? null, primary)
      return
    }
    if (action === "select-parent") {
      const parent = resolver.layerParent(primary)
      selectAt(parent, parent ? resolver.layerParent(parent) : null)
      return
    }

    const siblings = resolver.layerSiblings(primary)
    const index = siblings.indexOf(primary)
    if (index === -1 || siblings.length < 2) return
    const step = action === "next-sibling" ? 1 : -1
    selectAt(siblings[(index + step + siblings.length) % siblings.length], state.scope)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Meta" && event.key !== "Control") return
    setHovered(targetFor(resolver.hitStack(pointerX, pointerY)[0] ?? null, isDeepSelect(event)))
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
  window.addEventListener("dblclick", onDoubleClick, true)
  window.addEventListener("click", onClick, true)
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keyup", onKeyUp, true)
}
