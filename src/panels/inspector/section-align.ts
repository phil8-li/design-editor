/**
 * Align — flex alignment on the parent, not geometry on the child.
 *
 * The obvious implementation nudges the selected box with `transform:
 * translate()`. That is wrong twice over here: `core/tailwind.ts` has no entry
 * for `transform`, so every one of those edits is silently dropped at "Apply to
 * code"; and a `translate-*` utility on an element that also uses Motion
 * `layout`/`layoutId` fights Motion's own transform and breaks the app's
 * shared-element morphs. Writing `justify-content`/`align-items` on the parent
 * says the same thing in a way that survives the trip to source.
 *
 * What is left here is that write path and the parent it writes to. The strip
 * of buttons moved into `section-position.ts`, where align, distribute and
 * arrange are drawn as one section — but the reasoning above is the reason the
 * strip works the way it does, so it stays with the code it justifies.
 */

import { toSourceRef } from "../../core/bridge"
import { elementKey } from "../../core/store"
import type { EditorContext } from "../../core/context"
import type { Selection } from "../../core/types"
import type { SectionContext } from "./index"

export type Place = "flex-start" | "center" | "flex-end"
export type Axis = "horizontal" | "vertical"
export type AlignProperty = "justify-content" | "align-items"

/** Computed `justify-content`/`align-items` collapsed onto the three we write. */
function placeOf(value: string): Place | null {
  if (value === "center") return "center"
  if (value === "flex-end" || value === "end" || value === "right") return "flex-end"
  if (value === "flex-start" || value === "start" || value === "left" || value === "normal") return "flex-start"
  return null
}

/**
 * The parent as a writable target. `context.describe` is private to the context
 * module, so this rebuilds the same shape from the two core helpers it uses.
 */
function describeParent(editor: EditorContext, parent: HTMLElement): Selection {
  const info = editor.bridge.elementInfo(parent)
  const componentName = info?.componentName || parent.tagName.toLowerCase()
  return {
    element: parent,
    tagName: parent.tagName.toLowerCase(),
    componentName,
    source: toSourceRef(info),
    key: elementKey(parent, componentName, info?.lineNumber ?? 0),
  }
}

export interface ParentAlignment {
  /** The parent, in the shape the writer addresses a selection by. */
  target: Selection
  isFlex: boolean
  column: boolean
  /** True when the parent's main axis is already spread. */
  distributed: boolean
  /** Horizontal on a row is `justify-content`; on a column it is `align-items`. */
  propertyFor(axis: Axis): AlignProperty
  /** What the parent's computed style says that axis is set to today. */
  currentFor(axis: Axis): Place | null
  write(property: string, value: string, summary: string): void
}

/**
 * The parent's alignment state, or null when there is no parent worth writing
 * to. `<body>` and `<html>` are the app's frame rather than a layout the user
 * authored, so laying the selection out inside one is not an offer we make.
 */
export function parentAlignment({ editor, selection, writer }: SectionContext): ParentAlignment | null {
  const parent = selection.element.parentElement
  if (!parent || parent === document.body || parent === document.documentElement) return null

  const target = describeParent(editor, parent)
  const style = getComputedStyle(parent)
  const column = style.flexDirection.startsWith("column")
  const justify = placeOf(style.justifyContent)
  const align = placeOf(style.alignItems)
  const propertyFor = (axis: Axis): AlignProperty =>
    (axis === "horizontal") === column ? "align-items" : "justify-content"

  return {
    target,
    isFlex: style.display === "flex" || style.display === "inline-flex",
    column,
    distributed: style.justifyContent === "space-between",
    propertyFor,
    currentFor: (axis) => (propertyFor(axis) === "justify-content" ? justify : align),
    write: (property, value, summary) => writer.applyStyles(target, [{ property, value }], summary),
  }
}
