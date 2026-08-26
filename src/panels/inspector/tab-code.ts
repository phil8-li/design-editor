/**
 * Right panel, Code tab.
 *
 * Shows the selected element as source. The editor has no file-read route —
 * the loopback server exposes options, icons, variants and the agent, and
 * nothing that hands back a file — so what is drawn here is REBUILT from the
 * live element and its resolved source reference, not fetched. That is a real
 * property of this editor, not a stopgap, and it is arguably the more honest
 * view: the DOM is the only complete record of what the element currently is
 * once the editor has written to it. A file on disk is one "Apply to code"
 * behind, and it never held the preview-only changes at all.
 *
 * There is no Reset here, and open-pencil's has one. Its code view is an
 * editor: you type, it re-parses the JSX and pushes the result back into the
 * scene graph, so a Reset is the way out of an edit you did not mean. Ours
 * cannot round-trip — the writer speaks in class edits and text edits, not in
 * "here is a new JSX tree for this node" — so a Reset would be a button that
 * undoes nothing. This view is read-only and says so, and the status line
 * reports the one action it has: the copy.
 *
 * The file is layout only. Everything that turns an element into source lives
 * in `core/element-code.ts`, where it can be tested without a panel.
 */

import { clear, el } from "../../core/dom"
import { icon } from "../../core/icons"
import { CODE_VIEWS, codeText, elementCode, type CodeTokenKind, type CodeView } from "../../core/element-code"
import type { EditorContext } from "../../core/context"

export interface InspectorTab {
  node: HTMLElement
  /** Re-read the world. Called on every inspector invalidation and on activation. */
  update(): void
}

/** The five tints `css/code.ts` reserves, plus the one kind that takes none. */
const TINT: Record<CodeTokenKind, string | null> = {
  tag: "de-code-tag",
  attribute: "de-code-attribute",
  string: "de-code-string",
  number: "de-code-number",
  punctuation: "de-code-punctuation",
  plain: null,
}

const IDLE_STATUS = "Rebuilt from the live DOM · read-only"
/** open-pencil's `useClipboard({ copiedDuring: 2000 })`, in milliseconds. */
const COPIED_FOR = 2000

export function codeTab(editor: EditorContext): InspectorTab {
  let view: CodeView = CODE_VIEWS[0].id
  /** The plain text behind whatever is on screen, kept for the clipboard. */
  let generated = ""
  let copiedTimer = 0

  const picker = el(
    "select",
    {
      class: "de-select",
      "aria-label": "Code view",
      onchange: () => {
        view = picker.value as CodeView
        render()
      },
    },
    CODE_VIEWS.map((option) =>
      el("option", { value: option.id, selected: option.id === view }, [option.label])
    )
  )

  const where = el("span", { class: "de-code-source" })
  const code = el("pre", { class: "de-code-view", tabindex: "0" })
  const empty = el("div", { class: "de-empty" }, [
    "Select an element on the canvas, or pick a layer, to read it as code.",
  ])
  const status = el("span", { class: "de-code-status" })
  const copyButton = el("button", {
    class: "de-button",
    type: "button",
    title: "Copy this view to the clipboard",
  })

  /*
   * The write is issued synchronously inside the click task, before anything
   * awaits: the Clipboard API only works under the transient user activation
   * the click carries, and a browser revokes that activation the moment the
   * handler yields. Same reasoning, same shape as `copyChangePrompt` in
   * `core/change-prompt.ts`, which is the other clipboard path in this editor.
   *
   * The button flips to a check in the same task rather than waiting on the
   * promise, because the flip is feedback for the gesture and a two-frame lag
   * reads as a dead button. If the write is then refused, the rejection lands
   * a microtask later and the status corrects itself out loud.
   */
  copyButton.addEventListener("click", () => {
    if (!generated) return
    let refused = false
    try {
      void navigator.clipboard.writeText(generated).catch(() => reportRefused())
    } catch {
      refused = true
    }
    if (refused) reportRefused()
    else showCopied()
  })

  const node = el("div", { class: "de-code" }, [
    el("div", { class: "de-code-header" }, [picker, where]),
    code,
    empty,
    el("div", { class: "de-code-footer" }, [
      status,
      el("span", { class: "de-code-actions" }, [copyButton]),
    ]),
  ])

  function setStatus(text: string, tone: "" | "success" | "error" = ""): void {
    status.className = tone ? `de-code-status de-code-status--${tone}` : "de-code-status"
    status.textContent = text
  }

  function setCopyLabel(copied: boolean): void {
    clear(copyButton)
    copyButton.append(icon(copied ? "Check" : "Copy", 12), copied ? "Copied" : "Copy")
  }

  function showCopied(): void {
    setCopyLabel(true)
    setStatus("Copied to clipboard", "success")
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedTimer = 0
      setCopyLabel(false)
      setStatus(IDLE_STATUS)
    }, COPIED_FOR) as unknown as number
  }

  function reportRefused(): void {
    setCopyLabel(false)
    setStatus("The browser refused the clipboard", "error")
  }

  function render(): void {
    const selection = editor.primarySelection()
    clear(code)
    setCopyLabel(false)
    if (copiedTimer) {
      clearTimeout(copiedTimer)
      copiedTimer = 0
    }

    if (!selection) {
      generated = ""
      code.hidden = true
      empty.hidden = false
      where.textContent = ""
      copyButton.disabled = true
      setStatus("Nothing selected")
      return
    }

    code.hidden = false
    empty.hidden = true
    copyButton.disabled = false
    // Basename, not the full path: the panel is 260px wide, and the tail is
    // the part that identifies the file to someone who already knows the repo.
    where.textContent = selection.source
      ? `${selection.source.filePath.split("/").pop()}:${selection.source.lineNumber}`
      : ""

    const tokens = elementCode(selection, view)
    generated = codeText(tokens)
    for (const token of tokens) {
      const tint = TINT[token.kind]
      code.append(tint ? el("span", { class: tint }, [token.text]) : document.createTextNode(token.text))
    }
    setStatus(IDLE_STATUS)
  }

  return { node, update: render }
}
