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
 */

import { clear, el } from "../../core/dom"
import { icon } from "../../core/icons"
import {
  buildChangePrompt,
  clearPreviewOnly,
  copyChangePrompt,
  previewOnlyChanges,
  sanitizeChangePrompt,
} from "../../core/change-prompt"
import type { EditorContext } from "../../core/context"
import type { InspectorTab } from "./tab-code"

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

  const node = el("div", { class: "de-prompts" }, [
    list,
    el("div", { class: "de-prompt-footer" }, [
      count,
      el("span", { class: "de-prompt-actions" }, [clearButton, copyButton]),
    ]),
  ])

  function render(): void {
    clear(list)
    const changes = previewOnlyChanges()
    const copyable = changes.length > 0
    ;(copyButton as HTMLButtonElement).disabled = !copyable
    ;(clearButton as HTMLButtonElement).disabled = !copyable
    count.textContent = copyable
      ? `${changes.length} change${changes.length === 1 ? "" : "s"} queued`
      : "Nothing queued"

    if (!copyable) {
      list.append(
        el("div", { class: "de-empty" }, [
          "Changes the editor cannot write as classes collect here, ready to hand to an agent.",
        ])
      )
      return
    }

    for (const change of changes) {
      const where = change.filePath
        ? sanitizeChangePrompt(change.filePath)
        : change.componentName || "File not resolved"
      list.append(
        el("div", { class: "de-prompt" }, [
          el("span", { class: "de-prompt-body" }, [
            el("span", { class: "de-prompt-where" }, [where]),
            el("span", { class: "de-prompt-what" }, [
              `${change.property}: `,
              el("b", {}, [change.to]),
            ]),
          ]),
        ])
      )
    }
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
