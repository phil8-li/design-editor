/**
 * Fill, border, radius, opacity, shadow.
 *
 * Colour is edited through a swatch and a hex string at once, because computed
 * colours arrive as `rgb()` and a designer thinks in hex.
 */

import { clamp, el, round } from "../../core/dom"
import { tokens as t } from "../../core/tokens"
import { iconButton, numberField, section, selectField, textField } from "./field"
import type { InspectorSection } from "./index"

const CORNERS = [
  { key: "top-left", label: "TL" },
  { key: "top-right", label: "TR" },
  { key: "bottom-right", label: "BR" },
  { key: "bottom-left", label: "BL" },
] as const

/** Product-facing shadow values, not chrome styling — hence not from tokens. */
const SHADOWS = [
  { label: "None", value: "none" },
  { label: "S", value: "0 1px 2px rgba(0,0,0,0.08)" },
  { label: "M", value: "0 4px 12px rgba(0,0,0,0.12)" },
  { label: "L", value: "0 12px 32px rgba(0,0,0,0.18)" },
]

const BORDER_STYLES = ["none", "solid", "dashed", "dotted"].map((value) => ({ value, label: value }))

let radiusExpanded = false

/** `#abc`, `#aabbcc` and `rgb()/rgba()` in; six-digit hex or null out. */
export function toHex(color: string): string | null {
  const value = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split("").map((digit) => digit + digit).join("").toLowerCase()}`
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/i)
  if (!match) return null
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number.parseFloat)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return `#${parts.map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("")}`
}

export interface ColorFieldOptions {
  label: string
  /** Computed colour string; anything unparseable still shows as raw text. */
  value: string
  onCommit(value: string): void
}

/**
 * Lives here rather than in `field.ts` so the shared primitives stay free of
 * colour-space knowledge; typography imports it for text colour.
 */
export function colorField(options: ColorFieldOptions): HTMLElement {
  const hex = toHex(options.value)
  const swatch = el("input", {
    type: "color",
    "aria-label": `${options.label} swatch`,
    value: hex ?? "#000000",
    style: `width:20px;height:20px;flex:none;padding:0;cursor:pointer;background:transparent;border:1px solid ${t.color.border};border-radius:${t.radius.sm}`,
  })
  const text = el("input", { type: "text", "aria-label": options.label, value: hex ?? options.value })

  swatch.addEventListener("input", () => {
    text.value = swatch.value
    options.onCommit(swatch.value)
  })
  const commitText = () => {
    const next = text.value.trim()
    if (!next) return
    const parsed = toHex(next)
    if (parsed) swatch.value = parsed
    options.onCommit(next)
  }
  text.addEventListener("change", commitText)
  text.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    commitText()
    text.blur()
  })

  const field = el("div", { class: "de-field", style: "flex:1" }, [
    el("span", { class: "de-field-label", style: "cursor:default" }, [options.label]),
    text,
  ])
  return el("div", { class: "de-row" }, [swatch, field])
}

export const appearanceSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const apply = (property: string, value: string) => {
    writer.applyStyles(selection, [{ property, value }], `Set ${property}`)
  }

  const radii = CORNERS.map((corner) => Number.parseFloat(computed.getPropertyValue(`border-${corner.key}-radius`)) || 0)
  const radiusToggle = iconButton({
    label: radiusExpanded ? "Link all corners" : "Set each corner",
    glyph: radiusExpanded ? "⊟" : "⊞",
    pressed: radiusExpanded,
    onClick: () => {
      radiusExpanded = !radiusExpanded
      invalidate()
    },
  })

  const uniformRadius = radii.every((value) => value === radii[0]) ? radii[0] : null
  const radiusField = numberField({
    label: "R",
    title: "Corner radius",
    value: uniformRadius,
    min: 0,
    onCommit: (value) => apply("border-radius", `${round(value)}px`),
  })
  radiusField.style.flex = "1"

  const radiusControls = radiusExpanded
    ? el("div", { class: "de-row" }, [
        el(
          "div",
          { class: "de-row--quad", style: "flex:1" },
          CORNERS.map((corner, index) =>
            numberField({
              label: corner.label,
              title: `Radius ${corner.key.replace("-", " ")}`,
              value: radii[index],
              min: 0,
              onCommit: (value) => apply(`border-${corner.key}-radius`, `${round(value)}px`),
            })
          )
        ),
        radiusToggle,
      ])
    : el("div", { class: "de-row" }, [radiusField, radiusToggle])

  const borderWidth = Number.parseFloat(computed.borderTopWidth) || 0
  const borderStyle = computed.borderTopStyle
  const widthField = numberField({
    label: "W",
    title: "Border width",
    value: borderWidth,
    min: 0,
    onCommit: (value) => {
      // A width with no style paints nothing, so give a new border a style too.
      const writes = [{ property: "border-width", value: `${round(value)}px` }]
      if (value > 0 && borderStyle === "none") writes.push({ property: "border-style", value: "solid" })
      writer.applyStyles(selection, writes, "Set border width")
    },
  })

  const rawShadow = computed.boxShadow === "none" ? "" : computed.boxShadow
  const shadowPresets = el(
    "div",
    { class: "de-row", style: "gap:2px" },
    SHADOWS.map((preset) =>
      el(
        "button",
        {
          class: "de-button",
          type: "button",
          style: "flex:1;justify-content:center;padding:0",
          title: `Shadow: ${preset.label}`,
          onclick: () => {
            apply("box-shadow", preset.value)
            invalidate()
          },
        },
        [preset.label]
      )
    )
  )

  const body = el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
    numberField({
      label: "Opacity",
      title: "Opacity (%)",
      value: (Number.parseFloat(computed.opacity) || 0) * 100,
      min: 0,
      max: 100,
      suffix: "%",
      onCommit: (value) => apply("opacity", String(round(value / 100, 3))),
    }),
    radiusControls,
    colorField({
      label: "Fill",
      value: computed.backgroundColor,
      onCommit: (value) => apply("background-color", value),
    }),
    el("div", { class: "de-row--split" }, [
      widthField,
      selectField({
        label: "Border style",
        value: borderStyle,
        options: BORDER_STYLES,
        onCommit: (value) => {
          apply("border-style", value)
          invalidate()
        },
      }),
    ]),
    colorField({
      label: "Stroke",
      value: computed.borderTopColor,
      onCommit: (value) => apply("border-color", value),
    }),
    shadowPresets,
    textField({
      label: "Shadow",
      value: rawShadow,
      placeholder: "0 2px 8px rgba(0,0,0,.15)",
      onCommit: (value) => apply("box-shadow", value.trim() || "none"),
    }),
  ])

  return section("Appearance", body)
}
