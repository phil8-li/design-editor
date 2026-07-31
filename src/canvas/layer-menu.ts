/**
 * The right-click "Select layer" stack menu.
 *
 * This is what makes the scope rule tolerable: a plain click deliberately
 * refuses to go deep, so there has to be one gesture that lists everything
 * under the cursor and lets the user say which one they meant. Rows are ordered
 * frontmost-first, the same order the layers panel shows.
 */

import { el, isChrome } from "../core/dom"
import { getResolver, toSelectable } from "../core/resolve"
import type { EditorContext } from "../core/context"

/** Deeper than this the stack is layout wrappers, and the menu is a wall of divs. */
const MAX_ROWS = 12
const EDGE = 8

export function installLayerMenu(context: EditorContext): void {
  const resolver = getResolver(context.bridge)
  const menu = el("div", {
    class: "de-layer-menu",
    role: "menu",
    "aria-label": "Select layer",
    style: "display:none",
  })
  context.slots.overlay.append(menu)

  let open = false

  const close = () => {
    if (!open) return
    open = false
    menu.style.display = "none"
    while (menu.firstChild) menu.removeChild(menu.firstChild)
  }

  const row = (element: Element) => {
    const meta = resolver.meta(element)
    const node = el(
      "button",
      { class: `de-layer-menu-row${meta.isRoot ? " de-layer-menu-row--component" : ""}`, type: "button", role: "menuitem" },
      [meta.name]
    )
    node.addEventListener("pointerenter", () => context.setState({ hovered: element }))
    node.addEventListener("click", () => {
      const target = toSelectable(element)
      close()
      if (!target) return
      // `selectMany` rather than `select`: the latter early-returns on an
      // unchanged selection, and re-picking the same row must still take.
      context.selectMany([target])
      // Picking out of the stack is an explicit depth choice, so the scope
      // follows it and the next plain click stays at that level.
      context.setState({ scope: resolver.layerParent(target) })
    })
    return node
  }

  const onContextMenu = (event: MouseEvent) => {
    close()
    const { tool } = context.getState()
    if (tool !== "move" && tool !== "select") return
    if (isChrome(event.target)) return
    const stack = resolver.hitStack(event.clientX, event.clientY).slice(0, MAX_ROWS)
    if (!stack.length) return

    event.preventDefault()
    event.stopPropagation()
    for (const element of stack) menu.append(row(element))

    // Measured after mount: the row count decides the height, and a menu that
    // opens past the viewport edge is a menu with unreachable entries.
    menu.style.display = "block"
    menu.style.left = "0px"
    menu.style.top = "0px"
    const rect = menu.getBoundingClientRect()
    const left = Math.min(event.clientX, window.innerWidth - rect.width - EDGE)
    const top = Math.min(event.clientY, window.innerHeight - rect.height - EDGE)
    menu.style.left = `${Math.max(EDGE, left)}px`
    menu.style.top = `${Math.max(EDGE, top)}px`
    open = true
  }

  window.addEventListener("contextmenu", onContextMenu, true)
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (open && !menu.contains(event.target as Node)) close()
    },
    true
  )
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close()
  }, true)
  window.addEventListener("scroll", close, true)
  window.addEventListener("blur", close)
}
