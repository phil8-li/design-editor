/**
 * Fill — Figma's paint row list, at the one row CSS actually supports.
 *
 * `background-color` holds a single paint, so the section shows one row rather
 * than pretending a stack exists. What the row model buys is real: a per-fill
 * eye that parks the colour without losing it, and an explicit add/remove
 * instead of "type transparent and hope".
 */

import { el, round } from "../../core/dom"
import { alphaOf, swatch, toHex } from "./color"
import { miniButton, numberField, section } from "./field"
import type { InspectorSection } from "./index"

const DEFAULT_FILL = "#d9d9d9"

/**
 * Colours parked by the eye, keyed by element. Panel-level, not DOM-level: the
 * inspector is rebuilt on every write, and the whole point of the affordance is
 * that the value survives being switched off.
 */
const parked = new Map<string, string>()

function isPainted(color: string): boolean {
  return color !== "transparent" && alphaOf(color) > 0
}

/** `rgb()`/hex plus an alpha, as the shortest string that still round-trips. */
function withAlpha(color: string, alpha: number): string {
  const hex = toHex(color) ?? "#000000"
  if (alpha >= 1) return hex
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
  return `rgba(${r},${g},${b},${round(alpha, 3)})`
}

export const fillSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const current = computed.backgroundColor
  const painted = isPainted(current)
  const stored = parked.get(selection.key)

  const apply = (value: string, summary: string) => {
    writer.applyStyles(selection, [{ property: "background-color", value }], summary)
    invalidate()
  }

  const add = miniButton({
    label: painted || stored ? "Fill already set" : "Add fill",
    glyph: "+",
    onClick: () => {
      parked.delete(selection.key)
      apply(DEFAULT_FILL, "Add fill")
    },
  })
  if (painted || stored) add.setAttribute("disabled", "")

  if (!painted && !stored) {
    return section("Fill", el("div", { class: "de-hint" }, ["No fill."]), add)
  }

  const value = painted ? current : (stored as string)
  const alpha = alphaOf(value)

  const row = el("div", { class: "de-paint-row" }, [
    swatch(value, "Fill colour", (hex) => apply(withAlpha(hex, alpha), "Set fill")),
    el("span", { class: "de-paint-value" }, [toHex(value) ?? value]),
    numberField({
      id: "fill.alpha",
      label: "A",
      title: "Fill opacity (%)",
      value: alpha * 100,
      min: 0,
      max: 100,
      suffix: "%",
      disabled: !painted,
      onPreview: (next) => selection.element.style.setProperty("background-color", withAlpha(value, next / 100)),
      onCommit: (next) => apply(withAlpha(value, next / 100), "Set fill opacity"),
    }),
    miniButton({
      label: painted ? "Hide fill" : "Show fill",
      glyph: painted ? "◉" : "◎",
      pressed: !painted,
      onClick: () => {
        if (painted) {
          parked.set(selection.key, value)
          apply("transparent", "Hide fill")
          return
        }
        parked.delete(selection.key)
        apply(value, "Show fill")
      },
    }),
    miniButton({
      label: "Remove fill",
      glyph: "−",
      danger: true,
      onClick: () => {
        parked.delete(selection.key)
        apply("transparent", "Remove fill")
      },
    }),
  ])

  return section("Fill", row, add)
}
