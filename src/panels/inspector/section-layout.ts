/**
 * Position & size — the reference implementation other sections follow.
 *
 * X/Y are expressed as a translate offset rather than absolute coordinates:
 * the app is a flow layout, so nudging an element must not rip it out of flow.
 */

import { el } from "../../core/dom"
import { numberField, section } from "./field"
import type { InspectorSection } from "./index"

function currentOffset(element: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 0, y: 0 }
  const matrix = new DOMMatrixReadOnly(transform)
  return { x: matrix.m41, y: matrix.m42 }
}

export const layoutSection: InspectorSection = ({ selection, writer, invalidate }) => {
  const element = selection.element
  const rect = element.getBoundingClientRect()
  const offset = currentOffset(element)

  const setOffset = (x: number, y: number) => {
    writer.applyStyles(selection, [{ property: "transform", value: `translate(${x}px, ${y}px)` }], "Move element")
    invalidate()
  }

  const body = el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
    el("div", { class: "de-row--split" }, [
      numberField({
        label: "X",
        title: "Horizontal offset",
        value: offset.x,
        onCommit: (value) => setOffset(value, offset.y),
      }),
      numberField({
        label: "Y",
        title: "Vertical offset",
        value: offset.y,
        onCommit: (value) => setOffset(offset.x, value),
      }),
    ]),
    el("div", { class: "de-row--split" }, [
      numberField({
        label: "W",
        title: "Width",
        value: rect.width,
        min: 0,
        onCommit: (value) => {
          writer.applyStyles(selection, [{ property: "width", value: `${Math.round(value)}px` }], "Set width")
          invalidate()
        },
      }),
      numberField({
        label: "H",
        title: "Height",
        value: rect.height,
        min: 0,
        onCommit: (value) => {
          writer.applyStyles(selection, [{ property: "height", value: `${Math.round(value)}px` }], "Set height")
          invalidate()
        },
      }),
    ]),
  ])

  return section("Position & size", body)
}
