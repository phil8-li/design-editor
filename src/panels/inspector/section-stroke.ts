/**
 * Stroke — the border, as Figma's paint row plus weight and style.
 *
 * One row, because CSS carries one border colour. The eye parks the stroke by
 * zeroing its width and remembering what it was, which is the affordance the
 * old single "border width" field had no way to offer.
 */

import { el, round } from "../../core/dom"
import { swatch, toHex } from "./color"
import { miniButton, numberField, section, selectField } from "./field"
import type { InspectorSection } from "./index"

const STYLES = ["solid", "dashed", "dotted", "double"] as const
const STYLE_CLASSES = STYLES.map((style) => `border-${style}`)
const DEFAULT_STROKE = "#000000"

/** Widths parked by the eye, keyed by element — see the Fill section's note. */
const parked = new Map<string, number>()

export const strokeSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const width = Number.parseFloat(computed.borderTopWidth) || 0
  const style = computed.borderTopStyle
  const visible = width > 0 && style !== "none"
  const stored = parked.get(selection.key)

  const applyStyles = (writes: Array<{ property: string; value: string }>, summary: string) => {
    writer.applyStyles(selection, writes, summary)
    invalidate()
  }

  const add = miniButton({
    label: visible || stored ? "Stroke already set" : "Add stroke",
    glyph: "+",
    onClick: () => {
      parked.delete(selection.key)
      applyStyles(
        [
          { property: "border-width", value: "1px" },
          { property: "border-color", value: toHex(computed.borderTopColor) ?? DEFAULT_STROKE },
        ],
        "Add stroke"
      )
    },
  })
  if (visible || stored) add.setAttribute("disabled", "")

  if (!visible && !stored) {
    return section("Stroke", el("div", { class: "de-hint" }, ["No stroke."]), add)
  }

  const shown = visible ? width : (stored as number)

  /*
   * `border-style` has no entry in `core/tailwind.ts` (another lane owns that
   * file), so a style write there would be dropped on "Apply to code". The
   * class write reaches source; the inline style is only the live preview.
   */
  const setStyle = (next: string) => {
    selection.element.style.setProperty("border-style", next)
    writer.applyClasses(
      selection,
      { remove: STYLE_CLASSES, add: [`border-${next}`] },
      `Set border style ${next}`
    )
    invalidate()
  }

  const row = el("div", { class: "de-paint-row" }, [
    swatch(computed.borderTopColor, "Stroke colour", (hex) =>
      applyStyles([{ property: "border-color", value: hex }], "Set stroke colour")
    ),
    el("span", { class: "de-paint-value" }, [toHex(computed.borderTopColor) ?? computed.borderTopColor]),
    numberField({
      id: "stroke.width",
      label: "W",
      title: "Stroke width",
      value: shown,
      min: 0,
      disabled: !visible,
      onPreview: (value) => selection.element.style.setProperty("border-width", `${round(value)}px`),
      onCommit: (value) => applyStyles([{ property: "border-width", value: `${round(value)}px` }], "Set stroke width"),
    }),
    miniButton({
      label: visible ? "Hide stroke" : "Show stroke",
      glyph: visible ? "◉" : "◎",
      pressed: !visible,
      onClick: () => {
        if (visible) {
          parked.set(selection.key, width)
          applyStyles([{ property: "border-width", value: "0px" }], "Hide stroke")
          return
        }
        parked.delete(selection.key)
        applyStyles([{ property: "border-width", value: `${round(shown)}px` }], "Show stroke")
      },
    }),
    miniButton({
      label: "Remove stroke",
      glyph: "−",
      danger: true,
      onClick: () => {
        parked.delete(selection.key)
        applyStyles([{ property: "border-width", value: "0px" }], "Remove stroke")
      },
    }),
  ])

  const body = el("div", { class: "de-stack" }, [
    row,
    selectField({
      id: "stroke.style",
      label: "Stroke style",
      value: STYLES.includes(style as (typeof STYLES)[number]) ? style : "solid",
      options: STYLES.map((value) => ({ value, label: value })),
      onCommit: setStyle,
    }),
  ])

  return section("Stroke", body, add)
}
