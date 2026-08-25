/**
 * Floating bottom toolbar: the mode switch, time travel, and the commit path.
 *
 * It used to carry a zoom stepper, a measurement reminder and an overflow menu
 * inventorying every Figma tool this editor does not have. All three answered
 * questions nobody asked at the bottom of the screen — the zoom scaled a
 * transformed ancestor the product's own `layoutId` morphs cannot survive, the
 * measure button was a label for a modifier that works whether or not you press
 * it, and the inventory was a changelog wearing a menu. What is left is the set
 * of things a click here actually does.
 *
 * Two more went the same way, and for the same reason.
 *
 *  - The Hand tool. It suppressed selection so the page could be scrolled, but
 *    the wheel and the trackpad scroll the live page in EVERY mode, so all it
 *    added was a state in which clicking did nothing — the exact thing the mode
 *    switch below now says in a word.
 *  - The Move tool, as a separate button. With Hand gone it was a one-member
 *    radio group: a control whose pressed state could never change. The arrow it
 *    drew was the useful part, so the arrow moved INTO the mode switch, where it
 *    finally means something, because there the pointer really does change hands.
 *
 * The two panel toggles STAY here, and this is the one place they live — a
 * disclosure with two homes is a disclosure with two answers. What changed is
 * that they now report themselves: `aria-pressed` tracks the store, and the
 * glyph swaps between an open and a collapsed drawing of the same layout, so the
 * state is legible before the pointer arrives rather than after.
 *
 * The remaining tool state is still mirrored into the vendor engine so its
 * selection mode stays in sync with ours — two sources of truth for "what does a
 * click do" is the fastest way to make a direct-manipulation tool feel broken.
 */

import { el } from "../core/dom"
import { canRedo, canUndo, onHistoryChange, redo, undo } from "../core/history"
import { icon, type IconName } from "../core/icons"
import { historyAction, isMac, isTextEntry } from "../core/keymap"
import { untranslatedProperties } from "../core/writer"
import type { EditorContext } from "../core/context"

/**
 * Hover text for an icon-only control, plus the label everyone else reads.
 *
 * `data-de-tip` rather than `title`: the native tooltip waits about a second
 * and then paints in the OS's own chrome, which next to this strip reads as the
 * page having glitched rather than as an answer. The CSS in `css/toolbar.ts`
 * draws it above the strip. The `aria-label` is not a duplicate of it — a
 * pseudo-element is not an accessible name, so a tooltip on its own leaves the
 * control unnamed.
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

/**
 * The two halves of the mode, spelled out.
 *
 * The switch used to be labelled "Interactive" in both states and told apart
 * only by a pressed treatment, which meant the label was a promise in one state
 * and a lie in the other — you had to look at the ring to learn whether the
 * editor was still holding your clicks. So the label now names the state you are
 * STANDING IN, and the tip names what pressing would do; those are different
 * sentences and they were being asked to share one string.
 *
 * The glyph is the same arrow twice, filled while the editor holds the pointer
 * and hollow once it has handed it over. Shape, not colour: this pair is read at
 * 14px in the corner of the eye, and a mode told apart by hue alone is not told
 * apart at all.
 */
const MODES = {
  inspecting: {
    label: "Inspecting",
    glyph: "Cursor",
    detail: "Hand the pointer back to the app",
  },
  interactive: {
    label: "Interactive",
    glyph: "CursorOutline",
    detail: "Take the pointer back for the editor",
  },
} as const

export function installToolbar(context: EditorContext): void {
  const { slots, bridge } = context

  /*
   * One tool, mirrored once.
   *
   * The vendor engine has its own idea of the active tool and the canvas reads
   * ours, so the two have to agree; with the tool cluster gone there is no
   * moment at which they could diverge, which makes this an install-time
   * statement rather than a per-click sync.
   */
  try {
    bridge.store.setActiveTool("select")
  } catch {
    // Vendor tool set is version-pinned; a missing mode is not fatal.
  }

  /**
   * The one control that changes what a click means everywhere, so it is the
   * one control that spells itself out — and it sits at the far LEFT, first in
   * the strip, because it is the question every other control's answer depends
   * on. An icon alone would have to say "the editor is not intercepting you
   * now", and no 14px glyph says that; a word alone would drop the arrow this
   * editor's pointer has always been drawn as. It carries both.
   */
  const modeGlyph = el("span", { class: "de-button-glyph" }, [icon(MODES.inspecting.glyph, 14)])
  const modeLabel = el("span", {}, [MODES.inspecting.label])
  const interactiveButton = el(
    "button",
    {
      class: "de-button de-button--mode",
      type: "button",
      "aria-pressed": "false",
      ...hint(MODES.inspecting.label, MODES.inspecting.detail),
      onclick: () => context.setInteractive(!context.getState().interactive),
    },
    [modeGlyph, modeLabel]
  )

  /** Both halves of the switch move together, so one function moves them. */
  const paintMode = (interactive: boolean) => {
    const mode = interactive ? MODES.interactive : MODES.inspecting
    interactiveButton.setAttribute("aria-pressed", String(interactive))
    // The accessible name tracks the visible word rather than sitting on a
    // stable "Interactive mode": a name that disagrees with the label on screen
    // is the failure mode WCAG 2.5.3 exists for, and voice control types what it
    // sees.
    interactiveButton.setAttribute("aria-label", mode.label)
    interactiveButton.setAttribute("data-de-tip", mode.detail)
    if (modeLabel.textContent !== mode.label) modeLabel.textContent = mode.label
    modeGlyph.replaceChildren(icon(mode.glyph, 14))
  }

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

  /**
   * The button and the shortcut are the same call, not two that agree.
   *
   * `travel` is what Cmd+Z runs and what the button runs, so the toast, the
   * refresh and the disabled state cannot drift apart — which is the shape the
   * old Undo button failed at from the other direction: it asked the vendor
   * engine whether there was anything to undo, and the answer was always no.
   */
  const travel = (direction: "undo" | "redo") => {
    const label = direction === "undo" ? undo() : redo()
    const verb = direction === "undo" ? "Undo" : "Redo"
    context.toast(label ? `${verb}: ${label}` : `Nothing to ${direction}`)
    // The inspector reads the element, so the panel is stale until it re-reads.
    context.refresh()
  }

  const undoButton = el(
    "button",
    {
      class: "de-tool",
      type: "button",
      // Spelled the way the platform spells it, since the tooltip is the only
      // place the shortcut is written down.
      ...tip("Undo", isMac() ? "⌘Z" : "Ctrl+Z"),
      onclick: () => travel("undo"),
    },
    [icon("RotateCcw")]
  )

  const redoButton = el(
    "button",
    {
      class: "de-tool",
      type: "button",
      ...tip("Redo", isMac() ? "⇧⌘Z" : "Shift+Ctrl+Z"),
      onclick: () => travel("redo"),
    },
    [icon("RotateCw")]
  )

  /**
   * A panel toggle that draws the state it is in.
   *
   * The old pair drew one glyph in both states and left the answer to a pressed
   * tint, which is a colour-only distinction on a 16px outline — the least
   * legible signal this strip has. Each toggle now owns two glyphs, an open
   * layout and a collapsed one, and swaps between them, so the shape carries the
   * state and the tint is only reinforcement.
   *
   * `aria-pressed` is set from the store here rather than assumed from the last
   * click: `layersOpen` and `inspectorOpen` are written by the shell too, and a
   * button that remembered its own clicks would drift the first time anything
   * else moved the flag.
   */
  const panelToggle = (
    label: string,
    open: IconName,
    collapsed: IconName,
    read: () => boolean,
    write: (next: boolean) => void
  ) => {
    const button = el(
      "button",
      {
        class: "de-tool",
        type: "button",
        ...tip(label),
        onclick: () => write(!read()),
      },
      [icon(collapsed)]
    )
    const paint = () => {
      const showing = read()
      button.setAttribute("aria-pressed", String(showing))
      button.replaceChildren(icon(showing ? open : collapsed))
    }
    return { button, paint }
  }

  const layersToggle = panelToggle(
    "Toggle layers panel",
    "SidebarLeft",
    "SidebarLeftCollapsed",
    () => context.getState().layersOpen,
    (next) => context.setState({ layersOpen: next })
  )
  const inspectorToggle = panelToggle(
    "Toggle inspector",
    "SidebarRight",
    "SidebarRightCollapsed",
    () => context.getState().inspectorOpen,
    (next) => context.setState({ inspectorOpen: next })
  )

  // UI3 keeps one slim, stable strip at the bottom. Selection never moves it.
  //
  // The mode leads and the commit path closes: read left to right the strip is
  // "what a click does", then "which surfaces are up", then "what has been done
  // with them". The mode is first because it is the question every other
  // control's answer depends on.
  slots.toolbar.append(
    el("div", { class: "de-toolbar-group" }, [interactiveButton]),
    el("div", { class: "de-toolbar-group" }, [layersToggle.button, inspectorToggle.button]),
    el("div", { class: "de-toolbar-group" }, [undoButton, redoButton, applyButton])
  )

  const syncPressed = () => {
    paintMode(context.getState().interactive)
    layersToggle.paint()
    inspectorToggle.paint()
    undoButton.toggleAttribute("disabled", !canUndo())
    redoButton.toggleAttribute("disabled", !canRedo())
    applyButton.toggleAttribute("disabled", !bridge.store.hasChanges())
  }

  // The engine pushes its own change events below; from our store only the mode,
  // the two panel flags and the dirty flag affect this row. Anything broader
  // would re-query the engine on every pointermove.
  context.subscribe((next, previous) => {
    if (
      next.interactive === previous.interactive &&
      next.layersOpen === previous.layersOpen &&
      next.inspectorOpen === previous.inspectorOpen &&
      next.dirty === previous.dirty
    ) {
      return
    }
    syncPressed()
  })
  context.onRefresh(syncPressed)
  onHistoryChange(syncPressed)
  try {
    bridge.store.onStateChange(syncPressed)
  } catch {
    // Older engine builds do not expose every subscription.
  }

  window.addEventListener("keydown", (event) => {
    /*
     * Undo and redo are editor commands, not canvas ones, so they are not
     * gated on `editorOwnsInput()`: the buttons stay live in interactive mode
     * and the keys have to match them. A native field keeps its own Cmd+Z —
     * that undo is the user's typing.
     */
    const history = historyAction(event)
    if (history) {
      if (isTextEntry(event.target)) return
      event.preventDefault()
      // The vendor's document-capture guard reaches keys too.
      event.stopPropagation()
      travel(history)
    }

    /*
     * No bare-letter shortcuts here any more.
     *
     * V and H picked between two tools; with one tool left there is nothing for
     * a letter to pick, and a letter that reaches the page and does nothing is
     * worse than no letter — it swallows a keystroke the app might have wanted.
     * Capture is kept for the history branch above, which has to beat an app
     * handler that stops the event on its way up.
     */
  }, true)

  syncPressed()
}
