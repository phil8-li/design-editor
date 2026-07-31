/**
 * Effects — the one genuinely stackable paint in CSS.
 *
 * `box-shadow` is a comma list, so this is Figma's row model for real: add,
 * reorder-free stacking, a per-row eye that parks an effect without losing its
 * values, and a remove. Everything is serialised back into one declaration.
 */

import { el, round } from "../../core/dom"
import { swatch, toHex } from "./color"
import { miniButton, numberField, section, selectField } from "./field"
import type { InspectorSection } from "./index"

interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

const DEFAULT_SHADOW: Shadow = { inset: false, x: 0, y: 2, blur: 8, spread: 0, color: "#00000026" }

/** Effects parked by the eye, keyed by element — see the Fill section's note. */
const parked = new Map<string, Array<{ index: number; shadow: Shadow }>>()

/** Splits on commas that are not inside `rgb()`/`hsl()`/`var()`. */
function splitLayers(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < value.length; at += 1) {
    const char = value[at]
    if (char === "(") depth += 1
    else if (char === ")") depth -= 1
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, at))
      start = at + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseShadow(raw: string): Shadow | null {
  const inset = /\binset\b/.test(raw)
  let rest = raw.replace(/\binset\b/, " ")
  const colorMatch = rest.match(/(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/i)
  const color = colorMatch ? colorMatch[0] : "#000000"
  if (colorMatch) rest = rest.replace(colorMatch[0], " ")
  const lengths = rest.match(/-?\d*\.?\d+px/g)
  if (!lengths || lengths.length < 2) return null
  const [x, y, blur = "0px", spread = "0px"] = lengths
  return {
    inset,
    x: Number.parseFloat(x),
    y: Number.parseFloat(y),
    blur: Number.parseFloat(blur),
    spread: Number.parseFloat(spread),
    color,
  }
}

function serialize(shadow: Shadow): string {
  const lengths = `${round(shadow.x)}px ${round(shadow.y)}px ${round(shadow.blur)}px ${round(shadow.spread)}px`
  return `${shadow.inset ? "inset " : ""}${lengths} ${shadow.color}`
}

export const effectsSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const visible =
    computed.boxShadow === "none" ? [] : splitLayers(computed.boxShadow).map(parseShadow).filter((s): s is Shadow => s !== null)

  // Re-seat the parked rows at the positions they were switched off from, so
  // hiding the middle effect of three does not shuffle the other two.
  const rows: Array<{ shadow: Shadow; hidden: boolean }> = visible.map((shadow) => ({ shadow, hidden: false }))
  for (const entry of parked.get(selection.key) ?? []) {
    rows.splice(Math.min(entry.index, rows.length), 0, { shadow: entry.shadow, hidden: true })
  }

  const commit = (next: Array<{ shadow: Shadow; hidden: boolean }>, summary: string) => {
    const held = next.map((row, index) => ({ index, shadow: row.shadow })).filter((_, index) => next[index].hidden)
    if (held.length) parked.set(selection.key, held)
    else parked.delete(selection.key)

    const painted = next.filter((row) => !row.hidden).map((row) => serialize(row.shadow))
    writer.applyStyles(selection, [{ property: "box-shadow", value: painted.join(", ") || "none" }], summary)
    invalidate()
  }

  const replace = (index: number, patch: Partial<Shadow>, summary: string) => {
    const next = rows.map((row, at) => (at === index ? { ...row, shadow: { ...row.shadow, ...patch } } : row))
    commit(next, summary)
  }

  const add = miniButton({
    label: "Add effect",
    glyph: "+",
    onClick: () => commit([...rows, { shadow: DEFAULT_SHADOW, hidden: false }], "Add effect"),
  })

  if (rows.length === 0) {
    return section("Effects", el("div", { class: "de-hint" }, ["No effects."]), add)
  }

  const cards = rows.map((row, index) => {
    const preview = (patch: Partial<Shadow>) => {
      if (row.hidden) return
      const drafted = rows.map((entry, at) => (at === index ? { ...entry, shadow: { ...entry.shadow, ...patch } } : entry))
      selection.element.style.setProperty(
        "box-shadow",
        drafted.filter((entry) => !entry.hidden).map((entry) => serialize(entry.shadow)).join(", ") || "none"
      )
    }

    const scalar = (key: "x" | "y" | "blur" | "spread", label: string, title: string) => {
      const patch = (value: number): Partial<Shadow> => {
        const draft: Partial<Shadow> = {}
        draft[key] = value
        return draft
      }
      return numberField({
        id: `effects.${index}.${key}`,
        label,
        title,
        value: row.shadow[key],
        disabled: row.hidden,
        onPreview: (value) => preview(patch(value)),
        onCommit: (value) => replace(index, patch(value), `Set effect ${title.toLowerCase()}`),
      })
    }

    return el("div", { class: "de-paint-card" }, [
      el("div", { class: "de-paint-row" }, [
        swatch(row.shadow.color, "Effect colour", (hex) => replace(index, { color: hex }, "Set effect colour")),
        selectField({
          id: `effects.${index}.type`,
          label: "Effect type",
          value: row.shadow.inset ? "inner" : "drop",
          options: [
            { value: "drop", label: "Drop shadow" },
            { value: "inner", label: "Inner shadow" },
          ],
          onCommit: (value) => replace(index, { inset: value === "inner" }, "Set effect type"),
        }),
        miniButton({
          label: row.hidden ? "Show effect" : "Hide effect",
          glyph: row.hidden ? "◎" : "◉",
          pressed: row.hidden,
          onClick: () =>
            commit(
              rows.map((entry, at) => (at === index ? { ...entry, hidden: !entry.hidden } : entry)),
              row.hidden ? "Show effect" : "Hide effect"
            ),
        }),
        miniButton({
          label: "Remove effect",
          glyph: "−",
          danger: true,
          onClick: () => commit(rows.filter((_, at) => at !== index), "Remove effect"),
        }),
      ]),
      el("div", { class: "de-row--split" }, [scalar("x", "X", "Offset X"), scalar("y", "Y", "Offset Y")]),
      el("div", { class: "de-row--split" }, [scalar("blur", "B", "Blur"), scalar("spread", "S", "Spread")]),
      el("div", { class: "de-hint" }, [toHex(row.shadow.color) ?? row.shadow.color]),
    ])
  })

  return section("Effects", el("div", { class: "de-stack" }, cards), add)
}
