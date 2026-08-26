/**
 * Right panel, Change prompts tab.
 *
 * The other half of the commit path. "Apply to code" writes everything that
 * became a utility class; this is everything that could not — an icon swap, a
 * property with no Tailwind spelling, a value that lives in a shared token —
 * queued as a brief an agent can execute.
 *
 * It lives in the panel rather than the toolbar because it is a LIST that
 * grows as you work, and the toolbar had room for a button but not for the
 * list. A button alone could only ever report a count; here the queue is the
 * thing, and copying it is one action on it.
 *
 * The tab shows the brief itself, expanded in place, rather than only offering
 * to copy it. A button whose result you can only inspect by pasting it
 * somewhere else is a button you have to trust; the queue is a list of things
 * the editor is admitting it could not do, which is precisely the moment the
 * user has the least reason to. So: every row states its own before and after,
 * every row can be copied or dropped alone, and the exact bytes the primary
 * button writes are readable underneath.
 */

import { clear, el } from "../../core/dom"
import { icon } from "../../core/icons"
import {
  buildChangePrompt,
  clearPreviewOnly,
  copyChangePrompt,
  previewOnlyChanges,
  removePreviewOnly,
  sanitizeChangePrompt,
  type PreviewOnlyChange,
} from "../../core/change-prompt"
import { isProjectSourcePath } from "../../core/bridge"
import type { EditorContext } from "../../core/context"
import type { InspectorTab } from "./tab-code"

/** The same words `buildChangePrompt` files an unresolved entry under. */
const UNRESOLVED = "File not resolved"

/**
 * What the row calls the change, and the two values it moves between.
 *
 * `property` is a CSS property for every entry but one. `icon` is a glyph
 * swap: there is no `icon:` declaration to go looking for, and a row that
 * printed one would send the reader to the stylesheet instead of to the JSX.
 * `describe()` in `change-prompt.ts` already forks here for the markdown, so
 * the row forks the same way — the panel and the brief have to be telling the
 * same story, or reading one of them is worthless.
 *
 * The empty `from` is spelled rather than dropped. A blank where a value goes
 * reads as a rendering bug; "unset" is the actual claim, and it is the same
 * claim the brief makes by omitting its parenthetical.
 */
function summarize(change: PreviewOnlyChange): { label: string; from: string; to: string } {
  if (change.property === "icon") {
    return { label: "swap icon", from: change.from || "unknown", to: change.to }
  }
  return { label: change.property, from: change.from || "unset", to: change.to }
}

/**
 * The path as it is safe to put on screen.
 *
 * Same test `buildChangePrompt` applies, so a compiled chunk is disowned here
 * exactly as it is there. `sanitizeChangePrompt` then does the shortening — but
 * it only ever shortens a path that HAS an `src/` in it, which is most of them
 * and not all of them. Anything still absolute after that carries the user's
 * home directory and their name into a panel they may well be screen-sharing,
 * so it falls back to the last two segments, which is what the Design tab's
 * source line shows anyway.
 */
function pathOf(change: PreviewOnlyChange): string {
  const raw = change.filePath
  if (!raw || !isProjectSourcePath(raw)) return UNRESOLVED
  const shortened = sanitizeChangePrompt(raw)
  return shortened.startsWith("/") ? shortened.split("/").slice(-2).join("/") : shortened
}

export function promptsTab(editor: EditorContext): InspectorTab {
  const list = el("div", { class: "de-prompts-list" })
  const count = el("span", { class: "de-prompt-count" })

  const clearButton = el(
    "button",
    {
      class: "de-mini de-mini--danger",
      type: "button",
      title: "Clear the queue",
      "aria-label": "Clear the queue",
      onclick: () => {
        clearPreviewOnly()
        editor.toast("Change queue cleared")
        render()
      },
    },
    [icon("Trash", 12)]
  )

  /*
   * `copyChangePrompt()` runs synchronously in the click task, before any
   * await: the Clipboard API needs the transient user activation, and the
   * browser drops it the moment the handler yields.
   */
  const copyButton = el(
    "button",
    {
      class: "de-button de-button--primary",
      type: "button",
      title: "Copy the changes that cannot be written as classes",
      onclick: () => {
        const changes = previewOnlyChanges()
        if (!changes.length) {
          editor.toast("Nothing to hand over — every change here can be applied to code")
          return
        }
        void copyChangePrompt()
        editor.toast(`Copied ${changes.length} change${changes.length === 1 ? "" : "s"} for an agent`)
      },
    },
    ["Copy change prompts"]
  )

  /*
   * Built once and only refilled, rather than rebuilt inside `render()`: the
   * fold is user state, and a region that re-collapsed itself every time a
   * number was scrubbed would be a region nobody ever finished reading.
   */
  let briefOpen = false
  const briefText = el("pre", { class: "de-prompt-brief-text", id: "de-prompt-brief", tabindex: "0" })
  const briefToggle = el(
    "button",
    {
      class: "de-prompt-brief-toggle de-prompt-brief-toggle--collapsed",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "de-prompt-brief",
      onclick: () => setBriefOpen(!briefOpen),
    },
    [
      el("span", { class: "de-chevron", "aria-hidden": "true" }, [icon("ChevronRight", 10)]),
      "Brief",
      el("span", { class: "de-prompt-brief-hint" }, ["exactly what Copy writes"]),
    ]
  )
  const brief = el("div", { class: "de-prompt-brief" }, [briefToggle, briefText])
  briefText.hidden = true

  function setBriefOpen(open: boolean): void {
    briefOpen = open
    briefText.hidden = !open
    briefToggle.setAttribute("aria-expanded", String(open))
    briefToggle.classList.toggle("de-prompt-brief-toggle--collapsed", !open)
  }

  const node = el("div", { class: "de-prompts" }, [
    list,
    brief,
    el("div", { class: "de-prompt-footer" }, [
      count,
      el("span", { class: "de-prompt-actions" }, [clearButton, copyButton]),
    ]),
  ])

  /**
   * One queued change, as a row you can act on without acting on the rest.
   *
   * Per-entry copy hands over `buildChangePrompt([change])` rather than a bare
   * bullet. The bullet names an element and a property and no file, which is
   * the one thing an agent cannot guess; the single-entry brief is the same
   * document scoped to one row, so what you paste still says where to go.
   */
  function entryRow(change: PreviewOnlyChange): HTMLElement {
    const { label, from, to } = summarize(change)
    const where = pathOf(change)

    const copyOne = el(
      "button",
      {
        class: "de-mini",
        type: "button",
        title: `Copy the prompt for ${label}`,
        "aria-label": `Copy the prompt for ${label}`,
        onclick: () => {
          void copyChangePrompt(buildChangePrompt([change]))
          editor.toast(`Copied the ${label} change`)
        },
      },
      [icon("Copy", 12)]
    )

    const removeOne = el(
      "button",
      {
        class: "de-mini de-mini--danger",
        type: "button",
        title: `Remove ${label} from the queue`,
        "aria-label": `Remove ${label} from the queue`,
        onclick: () => {
          removePreviewOnly(change)
          render()
        },
      },
      [icon("X", 12)]
    )

    return el("div", { class: "de-prompt" }, [
      el("div", { class: "de-prompt-body" }, [
        el("div", { class: "de-prompt-where" }, [
          el("span", { class: "de-prompt-component" }, [
            change.componentName || `<${change.tagName}>`,
          ]),
          el("span", { class: "de-prompt-path", title: where }, [where]),
        ]),
        el("div", { class: "de-prompt-what", title: label }, [label]),
        el("div", { class: "de-prompt-change" }, [
          el("span", { class: "de-prompt-from", title: from }, [from]),
          el("span", { class: "de-prompt-arrow", "aria-hidden": "true" }, ["→"]),
          el("span", { class: "de-prompt-to", title: to }, [to]),
        ]),
      ]),
      el("div", { class: "de-prompt-row-actions" }, [copyOne, removeOne]),
    ])
  }

  /**
   * The empty state answers "what would ever be here", not "nothing is here".
   *
   * An empty queue is the normal state for a session that went well, so this
   * is the copy most users will read most often — and it is the only place the
   * editor ever explains the split between what it writes and what it hands
   * over. The footer already carries the bare "Nothing queued" count.
   */
  function emptyState(): HTMLElement {
    return el("div", { class: "de-empty de-prompts-empty" }, [
      el("span", { class: "de-prompts-empty-glyph", "aria-hidden": "true" }, [icon("Sparkles", 18)]),
      el("div", {}, ["Nothing to hand over yet."]),
      el("div", { class: "de-prompts-empty-detail" }, [
        "Apply to code writes every edit it can spell as a utility class. The rest — a glyph swap, a property with no Tailwind name, a value that belongs in a shared token — collects here with its file, its element and its before and after, ready to copy as one brief.",
      ]),
    ])
  }

  function render(): void {
    clear(list)
    const changes = previewOnlyChanges()
    const copyable = changes.length > 0
    ;(copyButton as HTMLButtonElement).disabled = !copyable
    ;(clearButton as HTMLButtonElement).disabled = !copyable
    count.textContent = copyable
      ? `${changes.length} change${changes.length === 1 ? "" : "s"} queued`
      : "Nothing queued"

    // Read straight from the ledger, not from the rows: the point of the
    // region is to be the copy path's own output, so anything the panel does
    // to a value on its way to a row must not be able to reach it.
    briefText.textContent = currentChangeBrief()
    brief.hidden = !copyable

    if (!copyable) {
      list.append(emptyState())
      return
    }

    for (const change of changes) list.append(entryRow(change))
  }

  return {
    node,
    update: render,
  }
}

/** The brief as it would be copied — the tab's own view of what it holds. */
export function currentChangeBrief(): string {
  return sanitizeChangePrompt(buildChangePrompt())
}
