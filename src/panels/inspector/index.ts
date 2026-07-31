/**
 * Right-hand inspector.
 *
 * A flat list of sections, each owning one file. A section returns `null` when
 * it has nothing to say about the current selection, which keeps the panel as
 * short as the element is simple.
 */

import { clear, el } from "../../core/dom"
import { createWriter, type Writer } from "../../core/writer"
import type { EditorContext } from "../../core/context"
import type { Selection } from "../../core/types"

import { layoutSection } from "./section-layout"
import { autoLayoutSection } from "./section-autolayout"
import { alignSection } from "./section-align"
import { appearanceSection } from "./section-appearance"
import { typographySection } from "./section-typography"
import { classesSection } from "./section-classes"
import { optionsSection } from "../../options/panel"
import { aiSection } from "../../ai/panel"

export interface SectionContext {
  editor: EditorContext
  writer: Writer
  selection: Selection
  /** Computed style of the selected element, read once per render. */
  computed: CSSStyleDeclaration
  /** Re-renders the inspector after a write. */
  invalidate(): void
}

export type InspectorSection = (context: SectionContext) => HTMLElement | null

const SECTIONS: InspectorSection[] = [
  alignSection,
  layoutSection,
  autoLayoutSection,
  appearanceSection,
  typographySection,
  classesSection,
  optionsSection,
  aiSection,
]

export function installInspector(editor: EditorContext): void {
  const writer = createWriter(editor.bridge)
  const host = el("div")
  editor.slots.right.append(host)

  let scheduled = 0
  const invalidate = () => {
    if (scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      render()
    })
  }

  function render(): void {
    clear(host)
    const selection = editor.primarySelection()

    if (!selection) {
      host.append(
        el("div", { class: "de-empty" }, [
          "Select an element on the canvas, or pick a layer, to edit it here.",
        ])
      )
      return
    }

    host.append(
      el("div", { class: "de-section" }, [
        el("div", { class: "de-section-header" }, [
          el("span", {}, [selection.componentName]),
          el("span", { class: "de-tagname" }, [`<${selection.tagName}>`]),
        ]),
        selection.source
          ? el("div", { class: "de-section-body de-source" }, [
              `${selection.source.filePath.split("/").slice(-2).join("/")}:${selection.source.lineNumber}`,
            ])
          : null,
      ])
    )

    const context: SectionContext = {
      editor,
      writer,
      selection,
      computed: getComputedStyle(selection.element),
      invalidate,
    }

    for (const section of SECTIONS) {
      let node: HTMLElement | null = null
      try {
        node = section(context)
      } catch (error) {
        console.warn("[design-editor] inspector section failed", error)
      }
      if (node) host.append(node)
    }
  }

  // Rebuild only when what the inspector shows actually changed. `hovered` is
  // written on every pointermove; rebuilding on it would tear the focused
  // control out of the DOM mid-edit and drop a drag-scrub's pointer capture.
  editor.subscribe((next, previous) => {
    if (
      next.selection === previous.selection &&
      next.optionSets === previous.optionSets
    ) {
      return
    }
    invalidate()
  })
  editor.onRefresh(invalidate)
  render()
}
