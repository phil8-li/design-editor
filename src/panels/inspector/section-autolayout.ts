/**
 * Auto layout — Figma's stack panel, expressed as CSS flexbox.
 *
 * Only shown for elements that actually contain something: auto layout on a
 * leaf node is a control with no observable effect.
 */

import { el, round } from "../../core/dom"
import { iconButton, isExpanded, numberField, section, segmented, setExpanded } from "./field"
import type { InspectorSection, SectionContext } from "./index"

type Direction = "none" | "horizontal" | "vertical" | "wrap"
type Place = "flex-start" | "center" | "flex-end"

const PLACES: Place[] = ["flex-start", "center", "flex-end"]

const PADDING_EXPANDER = "autolayout.padding"

function directionOf(computed: CSSStyleDeclaration): Direction {
  const display = computed.display
  if (display !== "flex" && display !== "inline-flex") return "none"
  if (computed.flexWrap === "wrap" || computed.flexWrap === "wrap-reverse") return "wrap"
  return computed.flexDirection.startsWith("column") ? "vertical" : "horizontal"
}

function placeOf(value: string): Place {
  if (value === "center") return "center"
  if (value === "flex-end" || value === "end" || value === "right") return "flex-end"
  return "flex-start"
}

/** Figma's 3x3 alignment pad, mapped onto justify-content + align-items. */
function alignmentPad(options: {
  vertical: boolean
  justify: Place
  align: Place
  onPick(justify: Place, align: Place): void
}): HTMLElement {
  const cells: HTMLElement[] = []
  for (const row of PLACES) {
    for (const column of PLACES) {
      const justify = options.vertical ? row : column
      const align = options.vertical ? column : row
      cells.push(
        iconButton({
          label: `${justify.replace("flex-", "")} / ${align.replace("flex-", "")}`,
          glyph: "•",
          pressed: justify === options.justify && align === options.align,
          onClick: () => options.onPick(justify, align),
        })
      )
    }
  }
  for (const cell of cells) cell.setAttribute("style", "width:100%;height:18px")
  return el("div", { style: "display:grid;grid-template-columns:repeat(3,20px);gap:2px" }, cells)
}

function paddingControls(
  context: SectionContext,
  apply: (property: string, value: string) => void,
  preview: (property: string, value: string) => void
): HTMLElement {
  const { computed, invalidate } = context
  const sides = ["top", "right", "bottom", "left"] as const
  const values = sides.map((side) => Number.parseFloat(computed.getPropertyValue(`padding-${side}`)) || 0)
  const perSide = isExpanded(PADDING_EXPANDER)
  const toggle = iconButton({
    label: perSide ? "Link all sides" : "Set each side",
    glyph: perSide ? "⊟" : "⊞",
    pressed: perSide,
    onClick: () => {
      setExpanded(PADDING_EXPANDER, !perSide)
      invalidate()
    },
  })

  if (!perSide) {
    const uniform = values.every((value) => value === values[0]) ? values[0] : null
    const field = numberField({
      id: "autolayout.padding",
      label: "P",
      title: "Padding",
      value: uniform,
      placeholder: uniform === null ? "Mixed" : undefined,
      min: 0,
      onPreview: (value) => preview("padding", `${round(value)}px`),
      onCommit: (value) => apply("padding", `${round(value)}px`),
    })
    field.style.flex = "1"
    return el("div", { class: "de-row" }, [field, toggle])
  }

  const grid = el(
    "div",
    { class: "de-row--quad", style: "flex:1" },
    sides.map((side, index) =>
      numberField({
        id: `autolayout.padding.${side}`,
        label: side[0].toUpperCase(),
        title: `Padding ${side}`,
        value: values[index],
        min: 0,
        onPreview: (value) => preview(`padding-${side}`, `${round(value)}px`),
        onCommit: (value) => apply(`padding-${side}`, `${round(value)}px`),
      })
    )
  )
  return el("div", { class: "de-row" }, [grid, toggle])
}

export const autoLayoutSection: InspectorSection = (context) => {
  const { selection, computed, writer, invalidate } = context
  if (selection.element.childElementCount === 0) return null

  const direction = directionOf(computed)
  const vertical = direction === "vertical"
  const justify = placeOf(computed.justifyContent)
  const align = placeOf(computed.alignItems)
  const spaceBetween = computed.justifyContent === "space-between"

  // Numeric commits deliberately skip `invalidate`: the inspector rebuilds on
  // the next frame, which would tear the field out from under a drag-scrub.
  const apply = (property: string, value: string) => {
    writer.applyStyles(selection, [{ property, value }], `Set ${property}`)
  }
  const preview = (property: string, value: string) => {
    selection.element.style.setProperty(property, value)
  }

  const setDirection = (next: Direction) => {
    const writes =
      next === "none"
        ? [{ property: "display", value: "block" }]
        : [
            { property: "display", value: "flex" },
            { property: "flex-direction", value: next === "vertical" ? "column" : "row" },
            { property: "flex-wrap", value: next === "wrap" ? "wrap" : "nowrap" },
          ]
    writer.applyStyles(selection, writes, "Set auto layout")
    invalidate()
  }

  const directionRow = el("div", { class: "de-row", style: "gap:2px" }, [
    iconButton({ label: "No auto layout", glyph: "⊘", pressed: direction === "none", onClick: () => setDirection("none") }),
    iconButton({ label: "Horizontal", glyph: "→", pressed: direction === "horizontal", onClick: () => setDirection("horizontal") }),
    iconButton({ label: "Vertical", glyph: "↓", pressed: direction === "vertical", onClick: () => setDirection("vertical") }),
    iconButton({ label: "Wrap", glyph: "⤶", pressed: direction === "wrap", onClick: () => setDirection("wrap") }),
  ])

  if (direction === "none") {
    return section("Auto layout", el("div", { class: "de-stack" }, [directionRow]))
  }

  const gapField = numberField({
    id: "autolayout.gap",
    label: "Gap",
    title: "Gap between children",
    value: Number.parseFloat(computed.columnGap) || 0,
    min: 0,
    disabled: spaceBetween,
    onPreview: (value) => preview("gap", `${round(value)}px`),
    onCommit: (value) => apply("gap", `${round(value)}px`),
  })
  gapField.style.flex = "1"

  // Wrapping splits the gap in two: the cross-axis gap is its own declaration,
  // and without it a wrapped stack has rows touching.
  const rowGapField = numberField({
    id: "autolayout.rowgap",
    label: "Row",
    title: "Gap between wrapped rows",
    value: Number.parseFloat(computed.rowGap) || 0,
    min: 0,
    onPreview: (value) => preview("row-gap", `${round(value)}px`),
    onCommit: (value) => apply("row-gap", `${round(value)}px`),
  })
  rowGapField.style.flex = "1"

  const pad = alignmentPad({
    vertical,
    justify,
    align,
    onPick: (nextJustify, nextAlign) => {
      writer.applyStyles(
        selection,
        [
          // Space-between owns the main axis; the pad only moves the cross axis
          // while it is on, so picking a cell cannot silently repack the stack.
          { property: "justify-content", value: spaceBetween ? "space-between" : nextJustify },
          { property: "align-items", value: nextAlign },
        ],
        "Set alignment"
      )
      invalidate()
    },
  })

  const spacingMode = segmented({
    label: "Spacing mode",
    value: spaceBetween ? "between" : "packed",
    options: [
      { value: "packed", label: "Packed", title: "Children sit together at the gap" },
      { value: "between", label: "Space between", title: "Gap absorbs the free space" },
    ],
    onCommit: (next) => {
      writer.applyStyles(
        selection,
        [{ property: "justify-content", value: next === "between" ? "space-between" : justify }],
        "Set distribution"
      )
      invalidate()
    },
  })

  const body = el("div", { class: "de-stack" }, [
    directionRow,
    el("div", { class: "de-row" }, [pad, el("div", { class: "de-stack", style: "flex:1" }, [spacingMode])]),
    el("div", { class: "de-row" }, [gapField, ...(direction === "wrap" ? [rowGapField] : [])]),
    paddingControls(context, apply, preview),
  ])

  return section("Auto layout", body)
}
