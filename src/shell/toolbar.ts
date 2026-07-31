/**
 * Top toolbar: tools, zoom, panel toggles, and the commit action.
 *
 * Tool state is mirrored into the vendor engine so its text-editing mode stays
 * in sync with ours — two sources of truth for "what does a click do" is the
 * fastest way to make a direct-manipulation tool feel broken.
 */

import { el } from "../core/dom"
import { isTextEntry } from "../core/keymap"
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
 * Figma's tool order, minus the tools that have nothing to act on here.
 *
 * Hand and Comment used to sit at the end of this strip. Both were inert — the
 * canvas is a real scrolling page, so the browser already pans, and there is no
 * comment store — and an inert tool is worse than a missing one: it teaches the
 * user the whole strip is decoration. Pen, shapes and Frame are absent for the
 * same reason at a larger scale: the engine writes Tailwind classes into JSX and
 * has no verb for inserting geometry.
 */
const TOOLS: ToolSpec[] = [
  { id: "move", label: "Move", shortcut: "V", vendor: "select", path: "M4 2.5 12.5 8 8.6 9.1 11 13.4 9.3 14.3 6.9 10 4 12.8z" },
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
        context.toast(`Applying ${operations.length} change${operations.length === 1 ? "" : "s"}…`)
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

  // Figma's shape: tools on the left, everything about the *file* on the right,
  // with the zoom readout at the far end of that cluster.
  slots.toolbar.append(
    toolGroup,
    el("div", { class: "de-toolbar-spacer" }),
    panelToggles,
    zoomGroup,
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
