/**
 * Right-hand inspector.
 *
 * A stack of collapsible sections, each owning one file. A section returns
 * `null` when it has nothing to say about the current selection, which keeps
 * the panel as short as the element is simple.
 */

import { clear, el } from "../../core/dom"
import { createWriter, type Writer } from "../../core/writer"
import type { EditorContext } from "../../core/context"
import type { Selection } from "../../core/types"

import { layoutSection } from "./section-layout"
import { autoLayoutSection } from "./section-autolayout"
import { alignSection } from "./section-align"
import { appearanceSection } from "./section-appearance"
import { fillSection } from "./section-fill"
import { strokeSection } from "./section-stroke"
import { effectsSection } from "./section-effects"
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

/** Figma's own top-to-bottom order, minus the sections with no DOM analogue. */
const SECTIONS: InspectorSection[] = [
  alignSection,
  layoutSection,
  autoLayoutSection,
  appearanceSection,
  fillSection,
  strokeSection,
  effectsSection,
  typographySection,
  classesSection,
  optionsSection,
  aiSection,
]

interface FocusMemory {
  /** `data-de-field` identity, when the control declared one. */
  field: string | null
  /** Child-index path from the panel host — the fallback for controls without one. */
  path: number[]
  start: number | null
  end: number | null
}

function indexPath(host: HTMLElement, node: Element): number[] {
  const path: number[] = []
  for (let step: Element | null = node; step && step !== host; step = step.parentElement) {
    const parent = step.parentElement
    if (!parent) return []
    path.unshift(Array.prototype.indexOf.call(parent.children, step))
  }
  return path
}

function nodeAtPath(host: HTMLElement, path: number[]): HTMLElement | null {
  let node: Element | undefined = host
  for (const index of path) {
    node = node?.children[index]
    if (!node) return null
  }
  return node instanceof HTMLElement ? node : null
}

function captureFocus(host: HTMLElement): FocusMemory | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !host.contains(active)) return null
  const text = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  return {
    field: active.getAttribute("data-de-field"),
    path: indexPath(host, active),
    start: text ? active.selectionStart : null,
    end: text ? active.selectionEnd : null,
  }
}

/**
 * Puts the caret back after a rebuild.
 *
 * Every commit re-renders the whole panel, so without this the field you just
 * typed into is a detached node and focus has fallen to `<body>` — which makes
 * Tab-between-fields, Enter-to-commit, and repeated arrow nudges all impossible.
 */
function restoreFocus(host: HTMLElement, memory: FocusMemory | null): void {
  if (!memory) return
  // Matched by string compare rather than an attribute selector: field ids are
  // dotted (`appearance.radius.tl`), and building a selector from them means
  // escaping, which is one more thing to get wrong for no gain at this size.
  const byField = memory.field
    ? [...host.querySelectorAll<HTMLElement>("[data-de-field]")].find(
        (node) => node.getAttribute("data-de-field") === memory.field
      ) ?? null
    : null
  const target = byField ?? nodeAtPath(host, memory.path)
  if (!target || !target.isConnected) return
  target.focus({ preventScroll: true })
  if (memory.start === null) return
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
  const limit = target.value.length
  target.setSelectionRange(Math.min(memory.start, limit), Math.min(memory.end ?? memory.start, limit))
}

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
    const focus = captureFocus(host)
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

    restoreFocus(host, focus)
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
