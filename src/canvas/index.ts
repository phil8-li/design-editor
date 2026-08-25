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
import { editorOwnsInput } from "../core/store"
import { createWriter } from "../core/writer"
import type { EditorContext } from "../core/context"
import type { LayerElement } from "../core/types"
import { installSelectionFrame } from "./selection"
import { installTransform, translateBy } from "./transform"
import { installSnapping } from "./snapping"
import { installMarquee } from "./marquee"
import { installLayerMenu } from "./layer-menu"

export function installCanvas(context: EditorContext): void {
  const writer = createWriter(context.bridge)
  const resolver = getResolver(context.bridge)

  installSelectionFrame(context)
  installTransform(context)
  installSnapping(context)
  installLayerMenu(context)

  // `select()` early-returns when the element is already the whole selection,
  // so a re-click can never refresh a source ref that a code edit has moved.
  // `selectMany` carries no such guard and a one-element set is the same write.
  const selectOne = (element: LayerElement) => context.selectMany([element])

  // The last pointer position, so a modifier press can re-answer the question
  // with the pointer standing still.
  let pointerX = 0
  let pointerY = 0
  let pointerHit: Element | null = null

  const hitFor = (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
    if (isCanvasElement(event.target)) return event.target
    return resolver.hitStack(event.clientX, event.clientY)[0] ?? null
  }

  /** The one answer both the outline and the click use. */
  const targetFor = (hit: Element | null, deep: boolean): LayerElement | null => {
    if (!hit) return null
    return resolver.resolve(hit, context.getState().scope, deep)
  }

  const marquee = installMarquee(context)

  const setHovered = (hovered: Element | null) => {
    if (context.getState().hovered !== hovered) context.setState({ hovered })
  }

  const onPointerMove = (event: PointerEvent) => {
    pointerX = event.clientX
    pointerY = event.clientY
    pointerHit = hitFor(event)
    if (!editorOwnsInput()) return
    if (isChrome(event.target)) return
    setHovered(targetFor(pointerHit, isDeepSelect(event)))
  }

  const onPointerDown = (event: PointerEvent) => {
    if (isChrome(event.target)) return
    if (!editorOwnsInput()) return
    // Right-click belongs to the layer-stack menu, which selects for itself.
    if (event.button !== 0) return

    const deep = isDeepSelect(event)
    const hit = hitFor(event)
    const target = targetFor(hit, deep)
    if (marquee.begin(event, target)) return
    if (!target) {
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
    if (deep) {
      context.setState({ scope: resolver.layerParent(target) })
    } else {
      const held = context.getState().scope
      if (held && (!held.isConnected || !hit || !held.contains(hit))) {
        context.setState({ scope: resolver.layerParent(target) })
      }
    }
  }

  /** Double-click descends exactly one level and takes the scope with it. */
  const onDoubleClick = (event: MouseEvent) => {
    if (isChrome(event.target)) return
    if (!editorOwnsInput()) return
    const hit = hitFor(event)
    if (!hit) return

    const state = context.getState()
    const primary = state.selection[0]?.element ?? null
    const base = primary && primary.contains(hit) ? primary : resolver.resolve(hit, state.scope)
    if (!base) return
    const target = resolver.resolve(hit, base)
    // Drilling into the layer you are already on is not a drill: without this
    // the scope would advance on a press that changed nothing.
    if (!target || target === base) return
    context.setState({ scope: base })
    selectOne(target)
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
    if (!editorOwnsInput()) return
    // A held modifier changes what a click would select, so the outline has to
    // follow it even while the pointer is stationary.
    if (event.key === "Meta" || event.key === "Control") {
      setHovered(
        targetFor(pointerHit ?? resolver.hitStack(pointerX, pointerY)[0] ?? null, isDeepSelect(event))
      )
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
    if (!editorOwnsInput()) return
    if (event.key !== "Meta" && event.key !== "Control") return
    setHovered(
      targetFor(pointerHit ?? resolver.hitStack(pointerX, pointerY)[0] ?? null, isDeepSelect(event))
    )
  }

  // Swallow app activation while the editor owns the page: clicking a button to
  // select it must not also navigate. Capture on `window` runs before the
  // vendor overlay's own document-level guards, so ours wins the gesture.
  //
  // Interactive mode is exactly the absence of this line, which is why it is
  // the mode's whole point rather than a convenience: nothing else in the
  // editor stops the app from responding to a click.
  const onClick = (event: MouseEvent) => {
    if (!editorOwnsInput()) return
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
