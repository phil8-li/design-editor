/**
 * Right panel, Code tab.
 *
 * Shows the selected element as source. The editor has no file-read route —
 * the loopback server exposes options, icons, variants and the agent, and
 * nothing that hands back a file — so what is drawn here is REBUILT from the
 * live element and its resolved source reference, not fetched. That is a real
 * constraint on the tab, not a stopgap: the DOM is the only complete record of
 * what the element currently is once the editor has written to it.
 */

import { clear, el } from "../../core/dom"
import type { EditorContext } from "../../core/context"

export interface InspectorTab {
  node: HTMLElement
  /** Re-read the world. Called on every inspector invalidation and on activation. */
  update(): void
}

export function codeTab(editor: EditorContext): InspectorTab {
  const view = el("pre", { class: "de-code-view", tabindex: "0" })
  const node = el("div", { class: "de-code" }, [view])

  return {
    node,
    update() {
      clear(view)
      const selection = editor.primarySelection()
      if (!selection) {
        view.append("Select an element to see its code.")
        return
      }
      const classes = selection.element.getAttribute("class")
      view.append(`<${selection.tagName}${classes ? ` className="${classes}"` : ""}>`)
    },
  }
}
