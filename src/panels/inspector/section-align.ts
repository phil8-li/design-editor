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
 */

import { el } from "../../core/dom"
import { toSourceRef } from "../../core/bridge"
import { elementKey } from "../../core/store"
import type { EditorContext } from "../../core/context"
import type { Selection } from "../../core/types"
import { iconButton, section } from "./field"
import type { InspectorSection } from "./index"

type Place = "flex-start" | "center" | "flex-end"

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

export const alignSection: InspectorSection = ({ editor, selection, writer, invalidate }) => {
  const parent = selection.element.parentElement
  if (!parent || parent === document.body || parent === document.documentElement) return null

  const target = describeParent(editor, parent)
  const parentStyle = getComputedStyle(parent)
  const isFlex = parentStyle.display === "flex" || parentStyle.display === "inline-flex"

  if (!isFlex) {
    const enable = el(
      "button",
      {
        class: "de-button",
        type: "button",
        onclick: () => {
          writer.applyStyles(target, [{ property: "display", value: "flex" }], "Auto layout on parent")
          invalidate()
        },
      },
      ["Make parent auto layout"]
    )
    return section(
      "Align",
      el("div", { class: "de-stack" }, [
        el("div", { class: "de-hint" }, [
          `<${target.tagName}> is not a flex container, so alignment has nothing to act on.`,
        ]),
        enable,
      ])
    )
  }

  const column = parentStyle.flexDirection.startsWith("column")
  const justify = placeOf(parentStyle.justifyContent)
  const align = placeOf(parentStyle.alignItems)

  /** Horizontal on a row is `justify-content`; on a column it is `align-items`. */
  const propertyFor = (axis: "horizontal" | "vertical") =>
    (axis === "horizontal") === column ? "align-items" : "justify-content"

  const currentFor = (axis: "horizontal" | "vertical") =>
    propertyFor(axis) === "justify-content" ? justify : align

  const button = (axis: "horizontal" | "vertical", place: Place, label: string, glyph: string) =>
    iconButton({
      label,
      glyph,
      pressed: currentFor(axis) === place,
      onClick: () => {
        writer.applyStyles(target, [{ property: propertyFor(axis), value: place }], label)
        invalidate()
      },
    })

  const body = el("div", { class: "de-stack" }, [
    el("div", { class: "de-row", style: "gap:2px" }, [
      button("horizontal", "flex-start", "Align left", "⇤"),
      button("horizontal", "center", "Align horizontal centers", "↔"),
      button("horizontal", "flex-end", "Align right", "⇥"),
      el("div", { style: "flex:1" }),
      button("vertical", "flex-start", "Align top", "⤒"),
      button("vertical", "center", "Align vertical centers", "↕"),
      button("vertical", "flex-end", "Align bottom", "⤓"),
    ]),
    el("div", { class: "de-hint" }, [
      `Aligns every child of <${target.tagName}> — that is what flex alignment means.`,
    ]),
  ])

  return section("Align", body)
}
