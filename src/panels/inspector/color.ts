/**
 * Colour parsing and the swatch+hex pair every paint row is built from.
 *
 * Its own module because four sections need it and none of them should own it:
 * computed colours arrive as `rgb()` and a designer thinks in hex, so the
 * conversion has to happen in exactly one place or the rows disagree.
 */

import { clamp, el } from "../../core/dom"
import { tokens as t } from "../../core/tokens"

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

/** Alpha channel of an `rgba()`/`hsla()` string, 0–1. Opaque when absent. */
export function alphaOf(color: string): number {
  const match = color.trim().match(/^(?:rgba|hsla)\(([^)]+)\)$/i)
  if (!match) return 1
  const parts = match[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 4) return 1
  const alpha = Number.parseFloat(parts[3])
  return Number.isNaN(alpha) ? 1 : clamp(alpha, 0, 1)
}

const SWATCH_STYLE = [
  "width:20px",
  "height:20px",
  "flex:none",
  "padding:0",
  "cursor:pointer",
  "background:transparent",
  `border:1px solid ${t.color.border}`,
  `border-radius:${t.radius.sm}`,
].join(";")

/** Standalone colour well, for a row that composes its own layout. */
export function swatch(value: string, label: string, onCommit: (hex: string) => void): HTMLInputElement {
  const node = el("input", {
    type: "color",
    "aria-label": label,
    value: toHex(value) ?? "#000000",
    style: SWATCH_STYLE,
  }) as HTMLInputElement
  node.addEventListener("input", () => onCommit(node.value))
  return node
}

export interface ColorFieldOptions {
  id?: string
  label: string
  /** Computed colour string; anything unparseable still shows as raw text. */
  value: string
  onCommit(value: string): void
}

export function colorField(options: ColorFieldOptions): HTMLElement {
  const hex = toHex(options.value)
  const text = el("input", {
    type: "text",
    "aria-label": options.label,
    value: hex ?? options.value,
    "data-de-field": options.id,
  }) as HTMLInputElement

  const well = swatch(options.value, `${options.label} swatch`, (next) => {
    text.value = next
    options.onCommit(next)
  })

  const commitText = () => {
    const next = text.value.trim()
    if (!next) return
    const parsed = toHex(next)
    if (parsed) well.value = parsed
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
  return el("div", { class: "de-row" }, [well, field])
}
