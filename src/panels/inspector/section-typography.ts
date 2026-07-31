/**
 * Type controls, shown only for elements that render text themselves.
 *
 * A wrapper whose text lives in a child gets no type panel: editing it there
 * would set an inherited value the child may quietly override.
 */

import { el, round } from "../../core/dom"
import { colorField } from "./section-appearance"
import { iconButton, numberField, section, selectField, textField } from "./field"
import type { InspectorSection } from "./index"

const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"].map((value) => ({
  value,
  label: value,
}))

const ALIGNMENTS = [
  { value: "left", label: "Align text left", glyph: "◧" },
  { value: "center", label: "Align text center", glyph: "▣" },
  { value: "right", label: "Align text right", glyph: "◨" },
  { value: "justify", label: "Justify text", glyph: "▤" },
]

function rendersText(element: HTMLElement): boolean {
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") return true
  }
  return false
}

/** First family in the stack — what the user typed, not the fallback chain. */
function primaryFamily(fontFamily: string): string {
  return fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "")
}

export const typographySection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  if (!rendersText(selection.element)) return null

  const apply = (property: string, value: string) => {
    writer.applyStyles(selection, [{ property, value }], `Set ${property}`)
  }

  const fontSize = Number.parseFloat(computed.fontSize) || 0
  const lineHeight = Number.parseFloat(computed.lineHeight)
  const letterSpacing = Number.parseFloat(computed.letterSpacing)
  const weight = String(Number.parseInt(computed.fontWeight, 10) || 400)
  const textAlign = computed.textAlign === "start" ? "left" : computed.textAlign

  const body = el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
    textField({
      label: "Font",
      value: primaryFamily(computed.fontFamily),
      placeholder: "Inter",
      onCommit: (value) => apply("font-family", value.trim()),
    }),
    el("div", { class: "de-row--split" }, [
      numberField({
        label: "Size",
        title: "Font size",
        value: fontSize,
        min: 1,
        onCommit: (value) => apply("font-size", `${round(value)}px`),
      }),
      selectField({
        label: "Font weight",
        value: weight,
        options: WEIGHTS,
        onCommit: (value) => {
          apply("font-weight", value)
          invalidate()
        },
      }),
    ]),
    el("div", { class: "de-row--split" }, [
      numberField({
        label: "LH",
        title: "Line height",
        // `normal` has no number to show; leave the field empty rather than lie.
        value: Number.isNaN(lineHeight) ? null : lineHeight,
        min: 0,
        onCommit: (value) => apply("line-height", `${round(value)}px`),
      }),
      numberField({
        label: "LS",
        title: "Letter spacing",
        value: Number.isNaN(letterSpacing) ? 0 : letterSpacing,
        step: 0.1,
        onCommit: (value) => apply("letter-spacing", `${round(value)}px`),
      }),
    ]),
    colorField({
      label: "Color",
      value: computed.color,
      onCommit: (value) => apply("color", value),
    }),
    el(
      "div",
      { class: "de-row", style: "gap:2px" },
      ALIGNMENTS.map((alignment) =>
        iconButton({
          label: alignment.label,
          glyph: alignment.glyph,
          pressed: textAlign === alignment.value,
          onClick: () => {
            apply("text-align", alignment.value)
            invalidate()
          },
        })
      )
    ),
  ])

  return section("Typography", body)
}
