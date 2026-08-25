/**
 * Floating bottom toolbar: the two tools, the panel toggles, the interactive
 * mode switch, and the commit path.
 *
 * It used to carry a zoom stepper, a measurement reminder and an overflow menu
 * inventorying every Figma tool this editor does not have. All three answered
 * questions nobody asked at the bottom of the screen — the zoom scaled a
 * transformed ancestor the product's own `layoutId` morphs cannot survive, the
 * measure button was a label for a modifier that works whether or not you press
 * it, and the inventory was a changelog wearing a menu. What is left is the set
 * of things a click here actually does.
 *
 * Tool state is mirrored into the vendor engine so its selection mode stays in
 * sync with ours — two sources of truth for "what does a click do" is the
 * fastest way to make a direct-manipulation tool feel broken.
 */

import { el } from "../core/dom"
import { icon, type IconName } from "../core/icons"
import { isTextEntry } from "../core/keymap"
import { untranslatedProperties } from "../core/writer"
import type { EditorContext } from "../core/context"
import type { ToolId } from "../core/types"

interface ToolSpec {
  id: ToolId
  label: string
  shortcut: string
  glyph: IconName
  /** Vendor tool name to mirror into, when one exists. */
  vendor?: string
}

/**
 * Hand deliberately has no vendor mode: it suppresses selection while the
 * browser's native trackpad/wheel scrolling continues to pan the live page.
 */
const TOOLS: ToolSpec[] = [
  { id: "move", label: "Move", shortcut: "V", vendor: "select", glyph: "Move" },
  { id: "hand", label: "Hand (browser scroll)", shortcut: "H", glyph: "Hand" },
]

/**
 * Hover text for an icon-only control, plus the label everyone else reads.
 *
 * `data-de-tip` rather than `title`: the native tooltip waits about a second
 * and then paints in the OS's own chrome, which next to this strip reads as the
 * page having glitched rather than as an answer. The CSS in `css/toolbar.ts`
 * draws it above the bar, because the bar is already at the bottom of the
 * viewport. The `aria-label` is not a duplicate of it — a pseudo-element is not
 * an accessible name, so a tooltip on its own leaves the control unnamed.
 */
function tip(label: string, shortcut?: string): Record<string, string> {
  return { "data-de-tip": shortcut ? `${label} · ${shortcut}` : label, "aria-label": label }
}

/**
 * Hover text for a control that already shows its own label.
 *
 * The `aria-label` here is not redundant with the visible text — it PINS it.
 * CSS generated content joins name-from-content, so a `data-de-tip` alone
 * leaves the button announced as "Apply to code Write pending visual changes
 * back to source": the sighted user's hint smuggled into everyone else's name.
 * An explicit label wins over content and shuts that off.
 */
function hint(label: string, detail: string): Record<string, string> {
  return { "data-de-tip": detail, "aria-label": label }
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
        ...tip(tool.label, tool.shortcut),
        "aria-pressed": "false",
        onclick: () => selectTool(tool.id),
      },
      [icon(tool.glyph)]
    )
    toolButtons.set(tool.id, button)
    toolGroup.append(button)
  }

  function selectTool(id: ToolId): void {
    context.setTool(id)
    if (id === "hand") context.setState({ hovered: null })
    const spec = TOOLS.find((tool) => tool.id === id)
    if (spec?.vendor) {
      try {
        bridge.store.setActiveTool(spec.vendor)
      } catch {
        // Vendor tool set is version-pinned; a missing mode is not fatal.
      }
    }
  }

  /**
   * The one control that changes what a click means everywhere, so it is the
   * one control that spells itself out. An icon would have to say "the editor
   * is not intercepting you now", and no 16px glyph says that.
   */
  const interactiveButton = el(
    "button",
    {
      class: "de-button",
      type: "button",
      "aria-pressed": "false",
      ...hint("Interactive", "Click through to the app"),
      onclick: () => context.setInteractive(!context.getState().interactive),
    },
    ["Interactive"]
  )

  const applyButton = el(
    "button",
    {
      class: "de-button de-button--primary",
      type: "button",
      ...hint("Apply to code", "Write pending visual changes back to source"),
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
      ...hint("Undo", "Undo last canvas change"),
      onclick: () => {
        const label = bridge.store.canvasUndo()
        context.toast(label ? `Undo: ${label}` : "Nothing to undo")
        context.refresh()
      },
    },
    ["Undo"]
  )

  const panelToggles = el("div", { class: "de-toolbar-group" }, [
    el(
      "button",
      {
        class: "de-tool",
        type: "button",
        ...tip("Toggle layers panel"),
        onclick: () => context.setState({ layersOpen: !context.getState().layersOpen }),
      },
      [icon("PanelLeft")]
    ),
    el(
      "button",
      {
        class: "de-tool",
        type: "button",
        ...tip("Toggle inspector"),
        onclick: () => context.setState({ inspectorOpen: !context.getState().inspectorOpen }),
      },
      [icon("PanelRight")]
    ),
  ])

  // UI3 keeps one slim, stable strip at the bottom. Selection never moves it.
  //
  // Interactive sits immediately after the tools it switches off, not out by
  // the commit path: the mode and the controls it makes inert have to be read
  // in one glance, or the dimmed tools look broken rather than stood down.
  slots.toolbar.append(
    toolGroup,
    el("div", { class: "de-toolbar-group" }, [interactiveButton]),
    panelToggles,
    el("div", { class: "de-toolbar-group" }, [undoButton, applyButton])
  )

  const syncPressed = () => {
    const { tool, interactive } = context.getState()
    for (const [id, button] of toolButtons) {
      button.setAttribute("aria-pressed", String(id === tool))
      // In interactive mode the canvas is not listening, so a tool decides
      // nothing. Leaving the pair at full strength would advertise a live
      // cluster that does nothing when clicked — the disabled state is the
      // honest one, and it is also what stops the click from flipping
      // `aria-pressed` on a tool that cannot take effect.
      button.toggleAttribute("disabled", interactive)
    }
    interactiveButton.setAttribute("aria-pressed", String(interactive))
    undoButton.toggleAttribute("disabled", !bridge.store.canUndo())
    applyButton.toggleAttribute("disabled", !bridge.store.hasChanges())
  }

  // The engine pushes its own change events below; from our store only the
  // tool, the mode and the dirty flag affect this row. Anything broader would
  // re-query the engine on every pointermove.
  context.subscribe((next, previous) => {
    if (
      next.tool === previous.tool &&
      next.interactive === previous.interactive &&
      next.dirty === previous.dirty
    ) {
      return
    }
    syncPressed()
  })
  context.onRefresh(syncPressed)
  try {
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
    // Interactive mode hands every key to the app, and a tool shortcut is a
    // key: typing "v" into the product's own search box must reach the box.
    if (context.getState().interactive) return
    const match = TOOLS.find((tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase())
    if (!match) return
    event.preventDefault()
    selectTool(match.id)
  })

  syncPressed()
}
