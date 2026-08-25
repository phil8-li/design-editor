/**
 * Size — width and height, each with Figma's Fixed / Hug / Fill mode.
 *
 * The X/Y fields that used to live here are gone. They emitted `transform:
 * translate()`, which `core/tailwind.ts` cannot express, so every nudge was
 * dropped on "Apply to code" without saying so. In a flow layout the honest
 * controls are the sizing modes: Fixed is a length, Hug is `fit-content`, Fill
 * is `100%`, and all three reach source.
 */

import { el } from "../../core/dom"
import { numberField, section, segmented } from "./field"
import type { InspectorSection } from "./index"
import type { LayerElement } from "../../core/types"

type Axis = "width" | "height"
type Mode = "fixed" | "hug" | "fill"

const HUG = "fit-content"
const FILL = "100%"

const STEM: Record<Axis, string> = { width: "w", height: "h" }

/**
 * The mode is a property of the *authored* value, and computed style resolves
 * every one of them to used pixels. So this reads what we wrote inline first,
 * then the Tailwind classes that are the actual source of truth.
 */
function modeOf(element: LayerElement, axis: Axis): Mode {
  const inline = element.style.getPropertyValue(axis).trim()
  if (inline === HUG || inline === "max-content" || inline === "auto") return "hug"
  if (inline === FILL) return "fill"
  if (inline) return "fixed"

  const stem = STEM[axis]
  for (const name of Array.from(element.classList)) {
    if (name === `${stem}-full` || name === `${stem}-[100%]`) return "fill"
    if (name === `${stem}-fit` || name === `${stem}-auto` || name === `${stem}-[${HUG}]`) return "hug"
    if (name.startsWith(`${stem}-`)) return "fixed"
  }
  return "hug"
}

export const layoutSection: InspectorSection = ({ selection, writer, invalidate }) => {
  const element = selection.element
  const rect = element.getBoundingClientRect()

  const write = (axis: Axis, value: string, summary: string) => {
    writer.applyStyles(selection, [{ property: axis, value }], summary)
    invalidate()
  }

  const axisFields = (axis: Axis, label: string, measured: number) => {
    const mode = modeOf(element, axis)
    const field = numberField({
      id: `size.${axis}`,
      label,
      title: `${axis[0].toUpperCase()}${axis.slice(1)}`,
      value: Math.round(measured),
      min: 0,
      disabled: mode !== "fixed",
      onPreview: (value) => element.style.setProperty(axis, `${Math.round(value)}px`),
      onCommit: (value) => write(axis, `${Math.round(value)}px`, `Set ${axis}`),
    })

    const modes = segmented({
      label: `${axis} sizing`,
      value: mode,
      options: [
        { value: "fixed", label: "Fixed", title: `Fixed ${axis}` },
        { value: "hug", label: "Hug", title: `Hug contents (${HUG})` },
        { value: "fill", label: "Fill", title: `Fill container (${FILL})` },
      ],
      onCommit: (next) => {
        if (next === "hug") write(axis, HUG, `Hug ${axis}`)
        else if (next === "fill") write(axis, FILL, `Fill ${axis}`)
        else write(axis, `${Math.round(measured)}px`, `Fixed ${axis}`)
      },
    })

    return { field, modes }
  }

  const width = axisFields("width", "W", rect.width)
  const height = axisFields("height", "H", rect.height)

  const body = el("div", { class: "de-stack" }, [
    el("div", { class: "de-row--split" }, [width.field, height.field]),
    el("div", { class: "de-row--split" }, [width.modes, height.modes]),
  ])

  return section("Size", body)
}
