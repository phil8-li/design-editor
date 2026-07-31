/**
 * The one path from "user changed something in the UI" to "the app shows it and
 * the source will too".
 *
 * Every section writes through here so live preview and the queued source
 * operation can never disagree — the failure mode that makes visual editors
 * untrustworthy is a preview that the code write silently drops.
 */

import type { RewriteBridge, UpdateClassOperation } from "./bridge"
import { propertyKey, toClassUpdate, type ClassUpdate } from "./tailwind"
import type { Selection } from "./types"

export interface StyleWrite {
  /** CSS property in kebab-case, e.g. `padding-left`. */
  property: string
  value: string
}

export interface ClassWrite {
  remove: string[]
  add: string[]
}

export interface Writer {
  /** Applies inline styles now and queues the equivalent utilities for source. */
  applyStyles(selection: Selection, writes: StyleWrite[], summary: string): void
  /** Swaps utility classes now and queues them for the source writer. */
  applyClasses(selection: Selection, write: ClassWrite, summary: string): void
  /** Replaces the element's text content. */
  applyText(selection: Selection, text: string): void
  /** CSS properties the source writer cannot express, newest first. */
  untranslated(): string[]
}

/** Index among preceding siblings of the same tag — an AST disambiguator. */
function nthOfType(element: HTMLElement): number {
  let index = 0
  let sibling = element.previousElementSibling
  while (sibling) {
    if (sibling.tagName === element.tagName) index += 1
    sibling = sibling.previousElementSibling
  }
  return index
}

/**
 * Module-scoped, not per-writer. The canvas, the inspector and the options
 * panel each build their own writer, so a per-instance list could only ever
 * report the drops made through one of them — and the drop the user most needs
 * warned about (drag/nudge writing `transform`) happens in the canvas while the
 * button that must warn about it lives in the toolbar.
 */
const skipped: string[] = []

/** CSS properties this session previewed but could not express as utilities. */
export function untranslatedProperties(): string[] {
  return [...skipped]
}

export function createWriter(bridge: RewriteBridge): Writer {

  const operationFor = (
    selection: Selection,
    updates: ClassUpdate[]
  ): UpdateClassOperation | null => {
    const source = selection.source
    if (!source?.filePath) return null
    const element = selection.element
    const parent = element.parentElement

    return {
      op: "updateClass",
      file: source.filePath,
      line: source.lineNumber,
      col: source.columnNumber ?? 0,
      componentName: source.componentName,
      tagName: element.tagName.toLowerCase(),
      className: element.className || undefined,
      parentTagName: parent?.tagName.toLowerCase(),
      parentClassName: parent?.className || undefined,
      nthOfType: nthOfType(element),
      updates,
    }
  }

  const queue = (
    selection: Selection,
    updates: ClassUpdate[],
    keys: string[]
  ) => {
    const operation = operationFor(selection, updates)
    if (!operation) return
    try {
      bridge.store.addPendingPropertyOperation(selection.key, operation, keys)
    } catch {
      // The engine rejects operations it cannot locate in source; the live
      // preview still stands, and "Apply to code" reports the shortfall.
    }
  }

  return {
    applyStyles(selection, writes, summary) {
      const updates: ClassUpdate[] = []
      const keys: string[] = []
      const dropped: string[] = []

      for (const write of writes) {
        selection.element.style.setProperty(write.property, write.value)

        const update = toClassUpdate(write.property, write.value)
        if (!update) {
          // Preview-only. Surfaced rather than swallowed so the toolbar can say
          // which properties will not survive "Apply to code".
          if (!skipped.includes(write.property)) skipped.unshift(write.property)
          dropped.push(write.property)
          continue
        }
        updates.push(update)
        keys.push(propertyKey(write.property))
      }

      if (updates.length) queue(selection, updates, keys)

      // An unqualified success toast on a partly-dropped write is worse than no
      // toast: the change is on screen, so the only thing that could tell the
      // user it will not reach source is this message. Drag and arrow-nudge
      // both land here, and both write `transform`, which has no utility.
      if (dropped.length === 0) {
        bridge.toast(summary, "info")
      } else if (updates.length === 0) {
        bridge.toast(`${summary} — preview only (${dropped.join(", ")})`, "error")
      } else {
        bridge.toast(`${summary} — ${dropped.join(", ")} is preview only`, "error")
      }
    },

    applyClasses(selection, write, summary) {
      const element = selection.element
      for (const name of write.remove) element.classList.remove(name)
      for (const name of write.add) element.classList.add(name)

      // A raw class edit has no CSS property to key on, so each added class is
      // its own standalone update keyed by name — re-adding replaces, and the
      // removals are already reflected in the `className` resolution context.
      const updates = write.add.map<ClassUpdate>((name) => ({
        tailwindPrefix: name,
        tailwindToken: name,
        value: name,
        standalone: true,
        classPattern: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      }))
      if (updates.length) {
        queue(selection, updates, write.add.map((name) => `class:${name}`))
      }
      bridge.toast(summary, "info")
    },

    applyText(selection, text) {
      const element = selection.element
      const originalText = element.textContent ?? ""
      element.textContent = text
      if (!selection.source?.filePath) return
      bridge.send({
        type: "updateText",
        filePath: selection.source.filePath,
        lineNumber: selection.source.lineNumber,
        columnNumber: selection.source.columnNumber ?? 0,
        componentName: selection.source.componentName,
        tagName: element.tagName.toLowerCase(),
        className: element.className || undefined,
        parentTagName: element.parentElement?.tagName.toLowerCase(),
        parentClassName: element.parentElement?.className || undefined,
        nthOfType: nthOfType(element),
        originalText,
        newText: text,
      })
    },

    untranslated() {
      return [...skipped]
    },
  }
}
