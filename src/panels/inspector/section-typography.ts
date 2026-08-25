/**
 * Type controls, shown only for elements that render text themselves.
 *
 * A wrapper whose text lives in a child gets no type panel: editing it there
 * would set an inherited value the child may quietly override.
 */

import { el, round } from "../../core/dom"
import { colorField } from "./color"
import { iconButton, numberField, section, selectField, textField } from "./field"
import type { InspectorSection } from "./index"
import type { LayerElement } from "../../core/types"

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

function rendersText(element: LayerElement): boolean {
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
  const preview = (property: string, value: string) => {
    selection.element.style.setProperty(property, value)
  }

  const fontSize = Number.parseFloat(computed.fontSize) || 0
  const lineHeight = Number.parseFloat(computed.lineHeight)
  const letterSpacing = Number.parseFloat(computed.letterSpacing)
  const weight = String(Number.parseInt(computed.fontWeight, 10) || 400)
  const textAlign = computed.textAlign === "start" ? "left" : computed.textAlign

  const body = el("div", { class: "de-stack" }, [
    textField({
      id: "type.family",
      label: "Font",
      value: primaryFamily(computed.fontFamily),
      placeholder: "Inter",
      onCommit: (value) => apply("font-family", value.trim()),
    }),
    el("div", { class: "de-row--split" }, [
      numberField({
        id: "type.size",
        label: "Size",
        title: "Font size",
        value: fontSize,
        min: 1,
        onPreview: (value) => preview("font-size", `${round(value)}px`),
        onCommit: (value) => apply("font-size", `${round(value)}px`),
      }),
      selectField({
        id: "type.weight",
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
        id: "type.lineheight",
        label: "LH",
        title: "Line height",
        // `normal` has no number to show; leave the field empty rather than lie.
        value: Number.isNaN(lineHeight) ? null : lineHeight,
        placeholder: Number.isNaN(lineHeight) ? "normal" : undefined,
        min: 0,
        onPreview: (value) => preview("line-height", `${round(value)}px`),
        onCommit: (value) => apply("line-height", `${round(value)}px`),
      }),
      numberField({
        id: "type.letterspacing",
        label: "LS",
        title: "Letter spacing",
        value: Number.isNaN(letterSpacing) ? 0 : letterSpacing,
        step: 0.1,
        onPreview: (value) => preview("letter-spacing", `${round(value)}px`),
        onCommit: (value) => apply("letter-spacing", `${round(value)}px`),
      }),
    ]),
    colorField({
      id: "type.color",
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
