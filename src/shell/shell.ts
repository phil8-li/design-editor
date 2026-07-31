/**
 * Mounts the editor chrome: a floating toolbar, a layers rail on the left, an
 * inspector on the right, and a transparent overlay layer for canvas chrome.
 *
 * The app is inset with padding on a border-box <html> rather than a transform,
 * because a transformed ancestor would break the app's own `layoutId`
 * shared-element morphs (see docs/agent-rules/card-reader-morph.md).
 */

import { config } from "../core/config"
import { shellCss } from "../core/css"
import { el } from "../core/dom"
import { tokens } from "../core/tokens"
import type { EditorSlots } from "../core/context"
import { getState, subscribe } from "../core/store"

const STYLE_ID = "design-editor-shell-style"

export interface Shell {
  slots: EditorSlots
  root: HTMLElement
  destroy(): void
}

export function mountShell(): Shell {
  if (!document.getElementById(STYLE_ID)) {
    const style = el("style", { id: STYLE_ID })
    style.textContent = shellCss
    document.head.append(style)
  }

  const overlay = el("div", { class: "de-overlay-layer" })
  const toolbar = el("div", { class: "de-toolbar", role: "toolbar", "aria-label": "Design editor" })

  const left = el("div", { class: "de-panel-body" })
  const leftPanel = el("aside", { class: "de-panel de-panel--left", "aria-label": "Layers" }, [left])

  const right = el("div", { class: "de-panel-body" })
  const rightPanel = el(
    "aside",
    { class: "de-panel de-panel--right", "aria-label": "Inspector" },
    [right]
  )

  const root = el("div", { class: "de-root" }, [overlay, toolbar, leftPanel, rightPanel])
  document.body.append(root)
  document.documentElement.classList.add("design-editor-active")

  const syncInsets = () => {
    const { layersOpen, inspectorOpen } = getState()
    const style = document.documentElement.style
    leftPanel.hidden = !layersOpen
    rightPanel.hidden = !inspectorOpen
    const panelGutter = tokens.size.panelInset * 2
    style.setProperty(
      "--de-left",
      layersOpen ? `${tokens.size.panelWidth + panelGutter}px` : "0px"
    )
    style.setProperty(
      "--de-right",
      inspectorOpen ? `${tokens.size.inspectorWidth + panelGutter}px` : "0px"
    )
    style.setProperty("--de-top", "0px")
    // The host's docked panel (Leva here) sits against the right edge; keep it
    // clear of the inspector. The property name is the host's to choose.
    style.setProperty(
      config.chrome.dockedPanel.offsetVar,
      inspectorOpen ? `-${tokens.size.inspectorWidth + panelGutter}px` : "0px"
    )
  }

  syncInsets()
  // Only the two panel toggles move the insets. `hovered` changes on every
  // pointermove, so an unguarded subscription would write inline custom
  // properties — and force a style recalc of the whole app — on mouse motion.
  const unsubscribe = subscribe((next, previous) => {
    if (
      next.layersOpen === previous.layersOpen &&
      next.inspectorOpen === previous.inspectorOpen
    ) {
      return
    }
    syncInsets()
  })

  return {
    slots: { overlay, toolbar, left, right },
    root,
    destroy() {
      unsubscribe()
      root.remove()
      document.documentElement.classList.remove("design-editor-active")
      document.documentElement.style.removeProperty("--de-left")
      document.documentElement.style.removeProperty("--de-right")
      document.documentElement.style.removeProperty("--de-top")
      document.documentElement.style.removeProperty(config.chrome.dockedPanel.offsetVar)
      document.getElementById(STYLE_ID)?.remove()
    },
  }
}
