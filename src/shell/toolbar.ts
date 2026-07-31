/**
 * Floating bottom toolbar: supported tools, zoom, panel toggles, actions, and
 * the commit path. Unsupported Figma tools live in an explicit capability
 * inventory rather than masquerading as active controls.
 *
 * Tool state is mirrored into the vendor engine so its text-editing mode stays
 * in sync with ours — two sources of truth for "what does a click do" is the
 * fastest way to make a direct-manipulation tool feel broken.
 */

import { el } from "../core/dom"
import { isTextEntry } from "../core/keymap"
import { untranslatedProperties } from "../core/writer"
import type { EditorContext } from "../core/context"
import type { ToolId } from "../core/types"

interface ToolSpec {
  id: ToolId
  label: string
  shortcut: string
  path: string
  /** Vendor tool name to mirror into, when one exists. */
  vendor?: string
}

/**
 * Hand deliberately has no vendor mode: it suppresses selection while the
 * browser's native trackpad/wheel scrolling continues to pan the live page.
 */
const TOOLS: ToolSpec[] = [
  { id: "move", label: "Move", shortcut: "V", vendor: "select", path: "M4 2.5 12.5 8 8.6 9.1 11 13.4 9.3 14.3 6.9 10 4 12.8z" },
  { id: "hand", label: "Hand (browser scroll)", shortcut: "H", path: "M5.1 7V3.8a1 1 0 0 1 2 0V6h.3V2.8a1 1 0 0 1 2 0V6h.3V3.6a1 1 0 0 1 2 0v5.1c0 3-1.7 5.3-4.6 5.3-1.8 0-3-.8-4-2.1L1.3 9.7a1.1 1.1 0 0 1 1.6-1.5z" },
  { id: "select", label: "Scale", shortcut: "K", vendor: "select", path: "M3 3h6v1.6H4.6V9H3zM13 13H7v-1.6h4.4V7H13z" },
  { id: "text", label: "Text", shortcut: "T", vendor: "text", path: "M3 3h10v1.7H8.8V13H7.2V4.7H3z" },
]

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "16")
  svg.setAttribute("height", "16")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("fill", "currentColor")
  svg.setAttribute("aria-hidden", "true")
  const node = document.createElementNS("http://www.w3.org/2000/svg", "path")
  node.setAttribute("d", path)
  svg.append(node)
  return svg
}

export function installToolbar(context: EditorContext): void {
  const { slots, bridge } = context

  const toolButtons = new Map<ToolId, HTMLButtonElement>()
  const toolGroup = el("div", { class: "de-toolbar-group" })

  for (const tool of TOOLS) {
    const button = el(
      "button",
      {
        class: "de-tool",
        type: "button",
        title: `${tool.label} — ${tool.shortcut}`,
        "aria-label": tool.label,
        "aria-pressed": "false",
        onclick: () => selectTool(tool.id),
      },
      [icon(tool.path)]
    )
    toolButtons.set(tool.id, button)
    toolGroup.append(button)
  }

  function selectTool(id: ToolId): void {
    context.setTool(id)
    if (id === "hand" || id === "text") context.setState({ hovered: null })
    const spec = TOOLS.find((tool) => tool.id === id)
    if (spec?.vendor) {
      try {
        bridge.store.setActiveTool(spec.vendor)
      } catch {
        // Vendor tool set is version-pinned; a missing mode is not fatal.
      }
    }
  }

  // Figma's zoom readout is a menu; ours is a button, because only one of that
  // menu's items means anything here. Zoom-to-fit and zoom-to-selection would
  // have to scale the live app, and a transformed ancestor breaks the product's
  // own `layoutId` morphs. Reset-to-100% is the item that survives.
  const zoomLabel = el(
    "button",
    {
      class: "de-button",
      type: "button",
      title: "Reset zoom to 100%",
      "aria-label": "Reset zoom to 100%",
      "aria-live": "polite",
      onclick: () => setZoom(1),
    },
    ["100%"]
  )
  const zoomGroup = el("div", { class: "de-toolbar-group" }, [
    el("button", { class: "de-tool", type: "button", title: "Zoom out", "aria-label": "Zoom out", onclick: () => nudgeZoom(1 / 1.2) }, [icon("M3 7.2h10v1.6H3z")]),
    zoomLabel,
    el("button", { class: "de-tool", type: "button", title: "Zoom in", "aria-label": "Zoom in", onclick: () => nudgeZoom(1.2) }, [icon("M7.2 3h1.6v4.2H13v1.6H8.8V13H7.2V8.8H3V7.2h4.2z")]),
  ])

  function setZoom(scale: number): void {
    try {
      const current = bridge.store.getCanvasTransform()
      bridge.store.setCanvasTransform({ ...current, scale: Math.min(4, Math.max(0.1, scale)) })
    } catch {
      context.toast("Zoom is unavailable in this mode", "error")
    }
  }

  function nudgeZoom(factor: number): void {
    try {
      setZoom(bridge.store.getCanvasTransform().scale * factor)
    } catch {
      context.toast("Zoom is unavailable in this mode", "error")
    }
  }

  const applyButton = el(
    "button",
    {
      class: "de-button de-button--primary",
      type: "button",
      title: "Write pending visual changes back to source",
      onclick: () => {
        if (!bridge.store.hasChanges()) {
          context.toast("Nothing to apply — make a change first")
          return
        }
        const operations = bridge.store.buildBatchOperations()
        if (!operations.length) {
          context.toast("Could not resolve source files for these changes", "error")
          return
        }
        bridge.send({ type: "commitBatch", operations })

        // The count only covers what became a utility class. Anything the
        // translator could not express is still on screen and is about to be
        // lost on the next hot reload, so the commit message has to name it
        // rather than report an unqualified success.
        const lost = untranslatedProperties()
        const applying = `Applying ${operations.length} change${operations.length === 1 ? "" : "s"}…`
        if (lost.length === 0) {
          context.toast(applying)
        } else {
          context.toast(`${applying} ${lost.join(", ")} cannot be written to code`, "error")
        }
      },
    },
    ["Apply to code"]
  )

  const undoButton = el(
    "button",
    {
      class: "de-button",
      type: "button",
      title: "Undo last canvas change",
      onclick: () => {
        const label = bridge.store.canvasUndo()
        context.toast(label ? `Undo: ${label}` : "Nothing to undo")
        context.refresh()
      },
    },
    ["Undo"]
  )

  const panelToggles = el("div", { class: "de-toolbar-group" }, [
    el("button", { class: "de-tool", type: "button", title: "Toggle layers panel", "aria-label": "Toggle layers panel", onclick: () => context.setState({ layersOpen: !context.getState().layersOpen }) }, [icon("M8 2 14 5 8 8 2 5zM2 8l6 3 6-3v1.6L8 12.6 2 9.6z")]),
    el("button", { class: "de-tool", type: "button", title: "Toggle inspector", "aria-label": "Toggle inspector", onclick: () => context.setState({ inspectorOpen: !context.getState().inspectorOpen }) }, [icon("M2 3h12v10H2zm7 1.5v7h3.5v-7z")]),
  ])

  const openOptions = () =>
    window.dispatchEvent(new window.CustomEvent("design-editor:open-options"))

  const measureButton = el(
    "button",
    {
      class: "de-button",
      type: "button",
      title: "Hold Option on Mac or Alt on Windows, then hover another layer",
      "aria-label": "Measure spacing with Option or Alt",
      onclick: () => context.toast("Hold Option/Alt and hover another layer to measure spacing"),
    },
    ["⌥/Alt Measure"]
  )

  const capability = (title: string, copy: string) =>
    el("div", { class: "de-capability-group" }, [
      el("div", { class: "de-capability-title" }, [title]),
      el("div", { class: "de-capability-copy" }, [copy]),
    ])

  const actionsMenu = el(
    "div",
    {
      class: "de-actions-menu",
      role: "dialog",
      "aria-label": "Design tools and capabilities",
      hidden: true,
    },
    [
      el(
        "button",
        { class: "de-action-row", type: "button", onclick: openOptions },
        ["Variables and options", "Open"]
      ),
      capability(
        "Available in this editor",
        "Move · Hand via browser scroll · Scale · Text · Measurement · Actions"
      ),
      capability(
        "Requires a code-insertion adapter",
        "Frame · Section · Slice · Rectangle · Line · Arrow · Ellipse · Polygon · Star · Image/video · Pen · Pencil"
      ),
      capability("Requires a collaboration store", "Comment · Annotation"),
      capability("Requires a host integration", "Dev Mode · Figma Draw"),
    ]
  )
  const actionsButton = el(
    "button",
    {
      class: "de-button",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    },
    ["Actions"]
  )
  const actions = el("div", { class: "de-actions" }, [actionsButton, actionsMenu])
  const setActionsOpen = (open: boolean) => {
    actionsMenu.hidden = !open
    actionsButton.setAttribute("aria-expanded", String(open))
    if (open) actionsMenu.querySelector<HTMLElement>("button")?.focus()
    else actionsButton.focus()
  }
  actionsMenu.querySelector("button")?.addEventListener("click", () => {
    actionsMenu.hidden = true
    actionsButton.setAttribute("aria-expanded", "false")
  })
  actionsButton.addEventListener("click", () => setActionsOpen(actionsMenu.hidden))
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!actionsMenu.hidden && !actions.contains(event.target as Node)) setActionsOpen(false)
    },
    true
  )
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || actionsMenu.hidden) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setActionsOpen(false)
    },
    true
  )

  const actionsGroup = el("div", { class: "de-toolbar-group" }, [
    measureButton,
    el(
      "button",
      { class: "de-button", type: "button", title: "Browse variables and options", onclick: openOptions },
      ["Variables"]
    ),
    actions,
  ])

  // UI3 keeps one slim, stable strip at the bottom. Selection never moves it.
  slots.toolbar.append(
    toolGroup,
    panelToggles,
    zoomGroup,
    actionsGroup,
    el("div", { class: "de-toolbar-group" }, [undoButton, applyButton])
  )

  const syncPressed = () => {
    const { tool } = context.getState()
    for (const [id, button] of toolButtons) {
      button.setAttribute("aria-pressed", String(id === tool))
    }
    undoButton.toggleAttribute("disabled", !bridge.store.canUndo())
    applyButton.toggleAttribute("disabled", !bridge.store.hasChanges())
  }

  const syncZoom = () => {
    try {
      zoomLabel.textContent = `${Math.round(bridge.store.getCanvasTransform().scale * 100)}%`
    } catch {
      zoomLabel.textContent = "100%"
    }
  }

  // The engine pushes its own change events below; from our store only the tool
  // and dirty flag affect this row. Anything broader would re-query the engine
  // on every pointermove.
  context.subscribe((next, previous) => {
    if (next.tool === previous.tool && next.dirty === previous.dirty) return
    syncPressed()
  })
  context.onRefresh(() => {
    syncPressed()
    syncZoom()
  })
  try {
    bridge.store.onCanvasTransformChange(syncZoom)
    bridge.store.onStateChange(syncPressed)
  } catch {
    // Older engine builds do not expose every subscription.
  }

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Text entry only. Deliberately not `ownsCanvasKeys`, which also excludes
    // chrome: clicking a tool leaves focus on its button, and the next letter
    // must still switch tools.
    if (isTextEntry(event.target)) return
    const match = TOOLS.find((tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase())
    if (!match) return
    event.preventDefault()
    selectTool(match.id)
  })

  syncPressed()
  syncZoom()
}
