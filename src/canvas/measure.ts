/**
 * Alt-hover measurement: the distance between the selection and whatever the
 * pointer is over, plus the selection's own padding.
 *
 * It paints on the shared frame loop rather than on pointermove so the numbers
 * stay true while the app animates underneath them.
 */

import { createNodePool, onFrame, placeBadge, placeNode } from "./selection"
import { isAltDown } from "./transform"
import type { EditorContext } from "../core/context"

/** Below a pixel the number is noise, and the label would cover the gap. */
const MIN_DISTANCE = 1

export function installMeasure(context: EditorContext): void {
  const layer = context.slots.overlay
  const lines = createNodePool(layer, "de-guide")
  const badges = createNodePool(layer, "de-badge de-badge--measure")

  const spanX = (from: number, to: number, y: number) => {
    if (to - from < MIN_DISTANCE) return
    placeNode(lines.take(), from, y, to - from, 1)
    placeBadge(badges.take(), (from + to) / 2, y - 9, `${Math.round(to - from)}`)
  }

  const spanY = (from: number, to: number, x: number) => {
    if (to - from < MIN_DISTANCE) return
    placeNode(lines.take(), x, from, 1, to - from)
    placeBadge(badges.take(), x + 14, (from + to) / 2, `${Math.round(to - from)}`)
  }

  /** Draws the measurement across the overlap of the two rects when there is
   * one, so the line reads as the gap between them rather than a stray tick. */
  const crossAt = (aLow: number, aHigh: number, bLow: number, bHigh: number) => {
    const low = Math.max(aLow, bLow)
    const high = Math.min(aHigh, bHigh)
    return high > low ? (low + high) / 2 : (aLow + aHigh) / 2
  }

  const measureGap = (a: DOMRect, b: DOMRect) => {
    const y = crossAt(a.top, a.bottom, b.top, b.bottom)
    if (b.left > a.right) spanX(a.right, b.left, y)
    else if (b.right < a.left) spanX(b.right, a.left, y)

    const x = crossAt(a.left, a.right, b.left, b.right)
    if (b.top > a.bottom) spanY(a.bottom, b.top, x)
    else if (b.bottom < a.top) spanY(b.bottom, a.top, x)
  }

  const measurePadding = (element: HTMLElement, rect: DOMRect) => {
    // Only read while Alt is held: this is a gesture, not a steady-state cost.
    const style = getComputedStyle(element)
    const px = (value: string) => Number.parseFloat(value) || 0
    const left = rect.left + px(style.borderLeftWidth)
    const right = rect.right - px(style.borderRightWidth)
    const top = rect.top + px(style.borderTopWidth)
    const bottom = rect.bottom - px(style.borderBottomWidth)

    const padLeft = px(style.paddingLeft)
    const padRight = px(style.paddingRight)
    const padTop = px(style.paddingTop)
    const padBottom = px(style.paddingBottom)

    const midX = (left + padLeft + right - padRight) / 2
    const midY = (top + padTop + bottom - padBottom) / 2

    spanX(left, left + padLeft, midY)
    spanX(right - padRight, right, midY)
    spanY(top, top + padTop, midX)
    spanY(bottom - padBottom, bottom, midX)
  }

  onFrame(() => {
    const state = context.getState()
    const selected = state.selection[0]?.element ?? null
    if (!isAltDown() || !selected || !selected.isConnected) {
      lines.flush()
      badges.flush()
      return
    }

    const rect = selected.getBoundingClientRect()
    const hovered = state.hovered
    if (hovered && hovered !== selected && hovered.isConnected) {
      measureGap(rect, hovered.getBoundingClientRect())
    }
    measurePadding(selected, rect)

    lines.flush()
    badges.flush()
  })
}
