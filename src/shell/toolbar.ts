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
 * disclosure with two homes is a disclosure with two answers. Each draws ONE
 * mark, named for what its panel holds rather than for the shape of the panel:
 * layers on the left, sliders on the right. `aria-pressed` carries the state,
 * which is all a side panel needs from its button — the panel is on screen or it
 * is not, and that is a louder report than any 16px drawing.
 *
 * Every glyph in the strip is drawn at ONE size, `GLYPH`, and inks the same
 * share of its grid (see `inkViewBox` in `core/icons.ts`). Two glyphs at the
 * same nominal size still read a step apart when one of them fills more of its
 * box, so the size alone was never the whole of "consistent".
 *
 * "Copy change prompts" left too, and this one was not a deletion — it moved.
 * The changes the writer cannot express as classes are a QUEUE that grows as
 * you work, and the toolbar had room for a button but never for the list. It
 * now sits under the list it copies, in the right panel's Prompts tab, where a
 * count is not the only thing it can tell you.
 *
 * One thing did arrive, and it is not a tool: the way back to the chooser. The
 * editor takes over the URL the chooser was on, so a designer who wanted a
 * different app had no door except the terminal. It is drawn only for the
 * sessions that have a chooser to go back to, which is why the strip most
 * people see is unchanged.
 *
 * The remaining tool state is still mirrored into the vendor engine so its
 * selection mode stays in sync with ours — two sources of truth for "what does a
 * click do" is the fastest way to make a direct-manipulation tool feel broken.
 */

import { previewOnlyChanges } from "../core/change-prompt"
import { config } from "../core/config"
import { el } from "../core/dom"
import { canRedo, canUndo, onHistoryChange, redo, undo } from "../core/history"
import { icon, type IconName } from "../core/icons"
import { historyAction, isMac, isTextEntry } from "../core/keymap"
import { untranslatedProperties } from "../core/writer"
import type { EditorContext } from "../core/context"

/**
 * The one size every glyph in this strip is drawn at.
 *
 * The mode switch used to draw its arrow at 14 while everything else drew at
 * 16, on the theory that a glyph beside a word should sit back. Beside a row of
 * 16s it does not read as deferential, it reads as a different icon set.
 */
const GLYPH = 16

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
 * and hollow once it has handed it over. Shape, not colour: this pair is read
 * in the corner of the eye at `GLYPH`, and a mode told apart by hue alone is not
 * told apart at all.
 */
/**
 * The two things the chooser link can say, and how long it stays asking.
 *
 * The second string is not a dialog in disguise — it is the same control,
 * saying what pressing it now means. It reverts on its own, because an armed
 * button that stayed armed would let a click ten minutes later leave without a
 * word, which is the exact silence the arming exists to break.
 */
const CHOOSER = {
  label: "Choose app",
  detail: "Leave the editor and pick another app to design",
  confirm: "Leave anyway?",
  armedMs: 6000,
} as const

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
   * now", and no glyph at this size says that; a word alone would drop the arrow
   * this editor's pointer has always been drawn as. It carries both.
   */
  const modeGlyph = el("span", { class: "de-button-glyph" }, [icon(MODES.inspecting.glyph, GLYPH)])
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
    modeGlyph.replaceChildren(icon(mode.glyph, GLYPH))
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
    [icon("RotateCcw", GLYPH)]
  )

  const redoButton = el(
    "button",
    {
      class: "de-tool",
      type: "button",
      ...tip("Redo", isMac() ? "⇧⌘Z" : "Shift+Ctrl+Z"),
      onclick: () => travel("redo"),
    },
    [icon("RotateCw", GLYPH)]
  )

  /**
   * A panel toggle that NAMES its panel and lets the panel report itself.
   *
   * It used to own two drawings — an open layout and a collapsed one — and swap
   * between them, on the reasoning that a pressed tint is a colour-only signal.
   * True, but the conclusion was wrong: the thing being reported is a whole side
   * of the screen, and it is either there or it is not. Nobody consults a 16px
   * rectangle to find out whether the panel they are looking at is open. What
   * they cannot get from the screen is which panel a button opens, and a picture
   * of a sliding rectangle does not answer that either — so the mark names the
   * CONTENTS instead: the layer tree, and the controls.
   *
   * The name stays put through both states — "Toggle …" is true either way, and
   * a name that rewrote itself under the pointer would be the second report of a
   * state `aria-pressed` already carries. `aria-pressed` is read from the store
   * rather than remembered from the last click, since the shell writes
   * `layersOpen` and `inspectorOpen` too and a button counting its own clicks
   * would drift the first time anything else moved the flag.
   */
  const panelToggle = (
    label: string,
    glyph: IconName,
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
      [icon(glyph, GLYPH)]
    )
    const paint = () => button.setAttribute("aria-pressed", String(read()))
    return { button, paint }
  }

  const layersToggle = panelToggle(
    "Toggle layers panel",
    "Layers",
    () => context.getState().layersOpen,
    (next) => context.setState({ layersOpen: next })
  )
  const inspectorToggle = panelToggle(
    "Toggle inspector",
    "SlidersHorizontal",
    () => context.getState().inspectorOpen,
    (next) => context.setState({ inspectorOpen: next })
  )

  /**
   * The way back to the screen that chose this app — when there is one.
   *
   * Once the editor is up, the browser sits on the proxy with the overlay over
   * the app, and until this control existed that was a one-way door: the URL
   * that used to show the chooser now shows the editor, so the only way to
   * design a different app was to kill the process. The supervisor that keeps
   * a chooser alive for the session says so in `chooserUrl`; every other way of
   * starting leaves it null and draws nothing, because a link to a screen that
   * is not running is worse than no link at all.
   *
   * An anchor, not a button. This is a real navigation, and an anchor is what
   * hands the browser back its own vocabulary for one: the target in the status
   * bar before you commit, Cmd-click for a second tab, and a back button that
   * works afterwards. None of that survives a click handler on a `<button>`,
   * and all of it is worth more here than anywhere else in this strip, because
   * this is the only control that ends the page.
   *
   * Same tab by default: the editor is the thing being left. A second tab would
   * leave a stale overlay running behind the chooser, pinned to an app the
   * designer has already moved on from, and two live editors is exactly the
   * confusion this control exists to end.
   */
  const chooserLabel = el("span", {}, [CHOOSER.label])
  let armed = 0

  /**
   * What leaving would throw away, in words rather than counts.
   *
   * Both kinds of work exist only in this tab. The engine holds applied-but-
   * unsent operations until "Apply to code" commits them, and the ledger in
   * `change-prompt.ts` holds every change that could NOT be written as a class
   * — icon swaps, untranslatable properties, and (since the writer learned to
   * strand them) class lists whose file never resolved. The Prompts tab is the
   * only copy of that second list, and it is a copy nobody has taken until they
   * press the button under it. A navigation drops both without a sound, so the
   * control asks first and says which one it would be costing.
   */
  const pendingWork = (): string[] => {
    const kinds: string[] = []
    if (bridge.store.hasChanges()) kinds.push("changes you have not applied")
    if (previewOnlyChanges().length > 0) kinds.push("prompts you have not copied")
    return kinds
  }

  const disarm = () => {
    if (armed === 0) return
    window.clearTimeout(armed)
    armed = 0
    chooserLabel.textContent = CHOOSER.label
    chooserLink?.setAttribute("aria-label", CHOOSER.label)
  }

  const chooserLink = config.chooserUrl
    ? el(
        "a",
        {
          class: "de-button",
          href: config.chooserUrl,
          ...hint(CHOOSER.label, CHOOSER.detail),
          onclick: (event: Event) => {
            const click = event as MouseEvent
            // A modified click opens a second tab and leaves this one standing,
            // so there is nothing to lose and nothing to ask about. Holding one
            // back would be guarding against a navigation that is not happening.
            if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return
            // Armed: this is the second click, so it goes. The timer is dropped
            // but the flag is left standing — the label must not snap back to
            // "Choose app" while the page it is drawn on is unloading.
            if (armed !== 0) {
              window.clearTimeout(armed)
              return
            }
            const losing = pendingWork()
            if (losing.length === 0) return
            click.preventDefault()
            chooserLabel.textContent = CHOOSER.confirm
            // The name follows the word, for the reason the mode switch does:
            // a control that says one thing on screen and another to a screen
            // reader is two controls.
            ;(click.currentTarget as HTMLElement).setAttribute("aria-label", CHOOSER.confirm)
            armed = window.setTimeout(disarm, CHOOSER.armedMs)
            context.toast(
              `Leaving loses ${losing.join(" and ")} — click again to leave anyway`,
              "error"
            )
          },
        },
        [chooserLabel]
      )
    : null

  // UI3 keeps one slim, stable strip at the bottom. Selection never moves it.
  //
  // The mode leads the EDITING controls and the commit path closes them: read
  // left to right that run is "what a click does", then "which surfaces are
  // up", then "what has been done with them". The mode is first among them
  // because it is the question every other control's answer depends on.
  //
  // The chooser link sits outside that reading, ahead of all of it, because it
  // is not a thing you do to this page — it is the way out of it, one level up
  // from every other control here. Trailing the strip it would read as the last
  // step of the commit path, which is the one thing it must not be mistaken for.
  //
  // The hairline between clusters is asked for by name rather than counted:
  // `--seam` marks the one seam air cannot carry, four icon squares meeting in
  // a row, and a fourth group appearing at the front must not conjure a second
  // rule somewhere else in the bar.
  slots.toolbar.append(
    ...(chooserLink ? [el("div", { class: "de-toolbar-group" }, [chooserLink])] : []),
    el("div", { class: "de-toolbar-group" }, [interactiveButton]),
    el("div", { class: "de-toolbar-group" }, [layersToggle.button, inspectorToggle.button]),
    el("div", { class: "de-toolbar-group de-toolbar-group--seam" }, [
      undoButton,
      redoButton,
      applyButton,
    ])
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
