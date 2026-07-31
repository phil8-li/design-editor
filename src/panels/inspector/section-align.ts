/**
 * Align & distribute.
 *
 * Alignment is written as a translate offset rather than as position or margin:
 * the app under edit is a flow layout, so moving a box with layout properties
 * would shove every sibling as a side effect.
 */

import { el, round } from "../../core/dom"
import type { Writer } from "../../core/writer"
import type { Selection } from "../../core/types"
import { iconButton, section } from "./field"
import type { InspectorSection } from "./index"

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"

function offsetOf(element: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 0, y: 0 }
  const matrix = new DOMMatrixReadOnly(transform)
  return { x: matrix.m41, y: matrix.m42 }
}

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

/** Padding box of the offset parent — the frame a single element aligns inside. */
function frameOf(element: HTMLElement): Box {
  const parent = (element.offsetParent as HTMLElement | null) ?? document.documentElement
  const rect = parent.getBoundingClientRect()
  const left = rect.left + parent.clientLeft
  const top = rect.top + parent.clientTop
  return { left, top, right: left + parent.clientWidth, bottom: top + parent.clientHeight }
}

function unionOf(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  }
}

function deltaFor(kind: AlignKind, item: Box, frame: Box): { dx: number; dy: number } {
  switch (kind) {
    case "left":
      return { dx: frame.left - item.left, dy: 0 }
    case "right":
      return { dx: frame.right - item.right, dy: 0 }
    case "hcenter":
      return { dx: (frame.left + frame.right - item.left - item.right) / 2, dy: 0 }
    case "top":
      return { dx: 0, dy: frame.top - item.top }
    case "bottom":
      return { dx: 0, dy: frame.bottom - item.bottom }
    case "vcenter":
      return { dx: 0, dy: (frame.top + frame.bottom - item.top - item.bottom) / 2 }
  }
}

function nudge(writer: Writer, target: Selection, dx: number, dy: number, summary: string): void {
  if (dx === 0 && dy === 0) return
  const offset = offsetOf(target.element)
  const value = `translate(${round(offset.x + dx)}px, ${round(offset.y + dy)}px)`
  writer.applyStyles(target, [{ property: "transform", value }], summary)
}

export const alignSection: InspectorSection = ({ editor, writer, invalidate }) => {
  const targets = editor.getState().selection
  if (targets.length === 0) return null

  const align = (kind: AlignKind, label: string) => {
    const boxes = targets.map((target) => boxOf(target.element))
    const frame = targets.length > 1 ? unionOf(boxes) : frameOf(targets[0].element)
    targets.forEach((target, index) => {
      const delta = deltaFor(kind, boxes[index], frame)
      nudge(writer, target, delta.dx, delta.dy, label)
    })
    invalidate()
  }

  /** Equalises the gaps between boxes, leaving the outermost two anchored. */
  const distribute = (axis: "x" | "y", label: string) => {
    const size = (box: Box) => (axis === "x" ? box.right - box.left : box.bottom - box.top)
    const start = (box: Box) => (axis === "x" ? box.left : box.top)
    const entries = targets
      .map((target) => ({ target, box: boxOf(target.element) }))
      .sort((a, b) => start(a.box) - start(b.box))
    const last = entries[entries.length - 1]
    const span = start(last.box) + size(last.box) - start(entries[0].box)
    const gap = (span - entries.reduce((total, entry) => total + size(entry.box), 0)) / (entries.length - 1)
    let cursor = start(entries[0].box)
    for (const entry of entries) {
      const delta = cursor - start(entry.box)
      nudge(writer, entry.target, axis === "x" ? delta : 0, axis === "x" ? 0 : delta, label)
      cursor += size(entry.box) + gap
    }
    invalidate()
  }

  const buttons: HTMLElement[] = [
    iconButton({ label: "Align left", glyph: "⇤", onClick: () => align("left", "Align left") }),
    iconButton({ label: "Align horizontal centers", glyph: "↔", onClick: () => align("hcenter", "Align centers") }),
    iconButton({ label: "Align right", glyph: "⇥", onClick: () => align("right", "Align right") }),
    iconButton({ label: "Align top", glyph: "⤒", onClick: () => align("top", "Align top") }),
    iconButton({ label: "Align vertical centers", glyph: "↕", onClick: () => align("vcenter", "Align middles") }),
    iconButton({ label: "Align bottom", glyph: "⤓", onClick: () => align("bottom", "Align bottom") }),
  ]

  // Distributing needs an inner box to move, so it only appears from three up.
  if (targets.length > 2) {
    buttons.push(
      el("div", { style: "flex:1" }),
      iconButton({
        label: "Distribute horizontal spacing",
        glyph: "⋯",
        onClick: () => distribute("x", "Distribute horizontally"),
      }),
      iconButton({
        label: "Distribute vertical spacing",
        glyph: "⋮",
        onClick: () => distribute("y", "Distribute vertically"),
      })
    )
  }

  const title = targets.length > 1 ? `Align · ${targets.length} selected` : "Align"
  return section(title, el("div", { class: "de-row", style: "gap:2px;flex-wrap:wrap" }, buttons))
}
