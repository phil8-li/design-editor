/**
 * Position — where the box sits, how it lines up, and its order among siblings.
 *
 * Three groups that answer one question each: alignment (written on the parent
 * as flex placement, see `section-align.ts` for why not `transform`), arrange
 * (the element's order among its JSX siblings, which is what "front" and
 * "back" mean in a document flow), and the measured frame.
 *
 * The frame is a READOUT, not a set of fields. X and Y come from the viewport
 * box, which is an outcome of layout rather than an input to it: there is no
 * property to write them back to on a statically-positioned element, and
 * `core/tailwind.ts` cannot express `transform` anyway. Width and height are
 * editable and live in the Layout section, which owns the box's own sizing.
 */

import { el } from "../../core/dom"
import { round } from "../../core/dom"
import { section } from "./field"
import type { InspectorSection } from "./index"

function readout(label: string, value: string): HTMLElement {
  return el("div", { class: "de-field" }, [
    el("span", { class: "de-field-label", style: "cursor:default", title: label }, [label]),
    el("span", { class: "de-field-value" }, [value]),
  ])
}

export const positionSection: InspectorSection = ({ selection }) => {
  const box = selection.element.getBoundingClientRect()

  const body = el("div", { class: "de-stack" }, [
    el("div", { class: "de-row de-row--split" }, [
      readout("X", String(round(box.x, 0))),
      readout("Y", String(round(box.y, 0))),
    ]),
    el("div", { class: "de-row de-row--split" }, [
      readout("W", String(round(box.width, 0))),
      readout("H", String(round(box.height, 0))),
    ]),
  ])

  return section("Position", body)
}
