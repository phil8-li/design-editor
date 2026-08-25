/**
 * Alignment guides and snapping during drag/resize.
 *
 * Candidate geometry is captured once, when the drag crosses its threshold: the
 * moving element is translated rather than reflowed, so its neighbours cannot
 * shift under it, and re-measuring every sibling would cost a layout pass on
 * each pointermove.
 */

import { isCanvasElement } from "../core/dom"
import type { EditorContext } from "../core/context"
import type { LayerElement } from "../core/types"
import { createNodePool, placeBadge, placeNode } from "./selection"
import { isAltDown, onDragEnd, onDragStart, onDragUpdate } from "./transform"

const THRESHOLD = 5

type Axis = "x" | "y"

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** A line to snap to: `value` on its own axis, spanning `from`..`to` on the other. */
interface Guide {
  value: number
  from: number
  to: number
}

interface Candidates {
  x: Guide[]
  y: Guide[]
  siblings: Box[]
}

interface AlignSnap {
  delta: number
  /** 0 = start edge, 1 = centre, 2 = end edge. */
  edge: number
  guide: Guide
}

interface SpacingSnap {
  delta: number
  gap: number
  before: Box
  after: Box
}

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function collect(element: LayerElement): Candidates {
  const x: Guide[] = []
  const y: Guide[] = []
  const siblings: Box[] = []

  const addBox = (box: Box) => {
    x.push(
      { value: box.left, from: box.top, to: box.bottom },
      { value: (box.left + box.right) / 2, from: box.top, to: box.bottom },
      { value: box.right, from: box.top, to: box.bottom }
    )
    y.push(
      { value: box.top, from: box.left, to: box.right },
      { value: (box.top + box.bottom) / 2, from: box.left, to: box.right },
      { value: box.bottom, from: box.left, to: box.right }
    )
  }

  const parent = element.parentElement
  if (parent && isCanvasElement(parent)) addBox(boxOf(parent))

  for (const child of parent ? Array.from(parent.children) : []) {
    if (child === element || !isCanvasElement(child)) continue
    const box = boxOf(child)
    if (box.right <= box.left || box.bottom <= box.top) continue
    siblings.push(box)
    addBox(box)
  }

  x.push({ value: window.innerWidth / 2, from: 0, to: window.innerHeight })
  y.push({ value: window.innerHeight / 2, from: 0, to: window.innerWidth })
  return { x, y, siblings }
}

function alignSnap(edges: Array<number | null>, guides: Guide[]): AlignSnap | null {
  let best: AlignSnap | null = null
  for (let edge = 0; edge < edges.length; edge += 1) {
    const position = edges[edge]
    if (position === null) continue
    for (const guide of guides) {
      const delta = guide.value - position
      if (Math.abs(delta) > THRESHOLD) continue
      if (best && Math.abs(delta) >= Math.abs(best.delta)) continue
      best = { delta, edge, guide }
    }
  }
  return best
}

/** The position where the moving box sits equidistant between two neighbours. */
function spacingSnap(
  boxes: Box[],
  axis: Axis,
  start: number,
  size: number,
  bandStart: number,
  bandEnd: number
): SpacingSnap | null {
  const lo = (box: Box) => (axis === "x" ? box.left : box.top)
  const hi = (box: Box) => (axis === "x" ? box.right : box.bottom)
  const crossLo = (box: Box) => (axis === "x" ? box.top : box.left)
  const crossHi = (box: Box) => (axis === "x" ? box.bottom : box.right)

  const band = boxes
    .filter((box) => crossHi(box) > bandStart && crossLo(box) < bandEnd)
    .sort((a, b) => lo(a) - lo(b))

  let best: SpacingSnap | null = null
  for (let index = 0; index + 1 < band.length; index += 1) {
    const before = band[index]
    const after = band[index + 1]
    const free = lo(after) - hi(before) - size
    if (free < 0) continue
    const delta = hi(before) + free / 2 - start
    if (Math.abs(delta) > THRESHOLD) continue
    if (best && Math.abs(delta) >= Math.abs(best.delta)) continue
    best = { delta, gap: free / 2, before, after }
  }
  return best
}

export function installSnapping(context: EditorContext): void {
  const layer = context.slots.overlay
  const lines = createNodePool(layer, "de-guide")
  const badges = createNodePool(layer, "de-badge de-badge--measure")

  let candidates: Candidates | null = null
  let mode: "move" | "resize" = "move"

  const clearGuides = () => {
    lines.flush()
    badges.flush()
  }

  /** One line per snapped axis, spanning every candidate that shares the value:
   * three boxes on the same edge read as one relationship, not three. */
  const drawGuide = (guides: Guide[], value: number, from: number, to: number, axis: Axis) => {
    let low = from
    let high = to
    for (const guide of guides) {
      if (Math.abs(guide.value - value) > 0.01) continue
      if (guide.from < low) low = guide.from
      if (guide.to > high) high = guide.to
    }
    if (axis === "x") placeNode(lines.take(), value, low, 1, high - low)
    else placeNode(lines.take(), low, value, high - low, 1)
  }

  const gapX = (from: number, to: number, y: number, gap: number) => {
    placeNode(lines.take(), from, y, Math.max(0, to - from), 1)
    placeBadge(badges.take(), (from + to) / 2, y - 9, `${Math.round(gap)}`)
  }

  const gapY = (from: number, to: number, x: number, gap: number) => {
    placeNode(lines.take(), x, from, 1, Math.max(0, to - from))
    placeBadge(badges.take(), x + 14, (from + to) / 2, `${Math.round(gap)}`)
  }

  onDragStart((info) => {
    candidates = collect(info.element)
    mode = info.mode
  })

  onDragEnd(() => {
    candidates = null
    clearGuides()
  })

  onDragUpdate(({ rect, proposed }) => {
    // Alt is the escape hatch: sometimes the right answer is 3px off the grid.
    if (!candidates || isAltDown()) {
      clearGuides()
      return proposed
    }

    const moving = mode === "move"
    const right = proposed.left + proposed.width
    const bottom = proposed.top + proposed.height

    const snapX = alignSnap(
      [
        moving || Math.abs(proposed.left - rect.left) > 0.01 ? proposed.left : null,
        moving ? (proposed.left + right) / 2 : null,
        moving || Math.abs(right - rect.right) > 0.01 ? right : null,
      ],
      candidates.x
    )
    const snapY = alignSnap(
      [
        moving || Math.abs(proposed.top - rect.top) > 0.01 ? proposed.top : null,
        moving ? (proposed.top + bottom) / 2 : null,
        moving || Math.abs(bottom - rect.bottom) > 0.01 ? bottom : null,
      ],
      candidates.y
    )

    const spaceX = moving
      ? spacingSnap(candidates.siblings, "x", proposed.left, proposed.width, proposed.top, bottom)
      : null
    const spaceY = moving
      ? spacingSnap(candidates.siblings, "y", proposed.top, proposed.height, proposed.left, right)
      : null

    // Equal spacing only wins when it is the closer answer; alignment is the
    // relationship people reach for first.
    const useSpaceX = spaceX !== null && (!snapX || Math.abs(spaceX.delta) < Math.abs(snapX.delta))
    const useSpaceY = spaceY !== null && (!snapY || Math.abs(spaceY.delta) < Math.abs(snapY.delta))

    if (useSpaceX && spaceX) {
      proposed.left += spaceX.delta
    } else if (snapX) {
      if (moving || snapX.edge === 1) proposed.left += snapX.delta
      else if (snapX.edge === 0) {
        proposed.left += snapX.delta
        proposed.width = Math.max(1, proposed.width - snapX.delta)
      } else proposed.width = Math.max(1, proposed.width + snapX.delta)
    }

    if (useSpaceY && spaceY) {
      proposed.top += spaceY.delta
    } else if (snapY) {
      if (moving || snapY.edge === 1) proposed.top += snapY.delta
      else if (snapY.edge === 0) {
        proposed.top += snapY.delta
        proposed.height = Math.max(1, proposed.height - snapY.delta)
      } else proposed.height = Math.max(1, proposed.height + snapY.delta)
    }

    const finalRight = proposed.left + proposed.width
    const finalBottom = proposed.top + proposed.height

    if (!useSpaceX && snapX) {
      drawGuide(candidates.x, snapX.guide.value, proposed.top, finalBottom, "x")
    }
    if (!useSpaceY && snapY) {
      drawGuide(candidates.y, snapY.guide.value, proposed.left, finalRight, "y")
    }

    if (useSpaceX && spaceX) {
      const centre = (proposed.top + finalBottom) / 2
      gapX(spaceX.before.right, proposed.left, centre, spaceX.gap)
      gapX(finalRight, spaceX.after.left, centre, spaceX.gap)
    }
    if (useSpaceY && spaceY) {
      const centre = (proposed.left + finalRight) / 2
      gapY(spaceY.before.bottom, proposed.top, centre, spaceY.gap)
      gapY(finalBottom, spaceY.after.top, centre, spaceY.gap)
    }

    lines.flush()
    badges.flush()
    return proposed
  })
}
