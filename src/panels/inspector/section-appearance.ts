/**
 * Appearance — Figma's Layer section: opacity and corner radius.
 *
 * Paint lives in its own Fill / Stroke / Effects sections below, the way Figma
 * splits them, so a row-list affordance never has to share a header with a
 * scalar field.
 */

import { el, round } from "../../core/dom"
import { iconButton, isExpanded, numberField, section, setExpanded } from "./field"
import type { InspectorSection } from "./index"

const CORNERS = [
  { key: "top-left", label: "TL" },
  { key: "top-right", label: "TR" },
  { key: "bottom-right", label: "BR" },
  { key: "bottom-left", label: "BL" },
] as const

const RADIUS_EXPANDER = "appearance.radius"

export const appearanceSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const apply = (property: string, value: string) => {
    writer.applyStyles(selection, [{ property, value }], `Set ${property}`)
  }
  const preview = (property: string, value: string) => {
    selection.element.style.setProperty(property, value)
  }

  const radii = CORNERS.map(
    (corner) => Number.parseFloat(computed.getPropertyValue(`border-${corner.key}-radius`)) || 0
  )
  const perCorner = isExpanded(RADIUS_EXPANDER)
  const radiusToggle = iconButton({
    label: perCorner ? "Link all corners" : "Set each corner",
    glyph: perCorner ? "⊟" : "⊞",
    pressed: perCorner,
    onClick: () => {
      setExpanded(RADIUS_EXPANDER, !perCorner)
      invalidate()
    },
  })

  const uniformRadius = radii.every((value) => value === radii[0]) ? radii[0] : null
  const radiusField = numberField({
    id: "appearance.radius",
    label: "R",
    title: "Corner radius",
    value: uniformRadius,
    placeholder: uniformRadius === null ? "Mixed" : undefined,
    min: 0,
    onPreview: (value) => preview("border-radius", `${round(value)}px`),
    onCommit: (value) => apply("border-radius", `${round(value)}px`),
  })
  radiusField.style.flex = "1"

  const radiusControls = perCorner
    ? el("div", { class: "de-row" }, [
        el(
          "div",
          { class: "de-row--quad", style: "flex:1" },
          CORNERS.map((corner, index) =>
            numberField({
              id: `appearance.radius.${corner.key}`,
              label: corner.label,
              title: `Radius ${corner.key.replace("-", " ")}`,
              value: radii[index],
              min: 0,
              onPreview: (value) => preview(`border-${corner.key}-radius`, `${round(value)}px`),
              onCommit: (value) => apply(`border-${corner.key}-radius`, `${round(value)}px`),
            })
          )
        ),
        radiusToggle,
      ])
    : el("div", { class: "de-row" }, [radiusField, radiusToggle])

  const body = el("div", { class: "de-stack" }, [
    numberField({
      id: "appearance.opacity",
      label: "Opacity",
      title: "Opacity (%)",
      value: (Number.parseFloat(computed.opacity) || 0) * 100,
      min: 0,
      max: 100,
      suffix: "%",
      onPreview: (value) => preview("opacity", String(round(value / 100, 3))),
      onCommit: (value) => apply("opacity", String(round(value / 100, 3))),
    }),
    radiusControls,
  ])

  return section("Appearance", body)
}
