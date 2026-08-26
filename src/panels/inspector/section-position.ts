/**
 * Position — where the box sits, how it lines up, and its order among siblings.
 *
 * Four groups that answer one question each: align (written on the parent as
 * flex placement — `section-align.ts` holds the reasoning for why not
 * `transform`), distribute (the same write path, spreading the parent's main
 * axis), arrange (the element's order among its JSX siblings, which is what
 * "front" and "back" mean in a document flow — see `core/arrange.ts`), and the
 * measured frame.
 *
 * The frame is a READOUT, not a set of fields. X and Y come from the viewport
 * box, which is an outcome of layout rather than an input to it: there is no
 * property to write them back to on a statically-positioned element, and
 * `core/tailwind.ts` cannot express `transform` anyway. Width and height are
 * editable and live in the Layout section, which owns the box's own sizing.
 */

import { el, round } from "../../core/dom"
import { icon, type IconName } from "../../core/icons"
import {
  arrange,
  arrangeRef,
  canArrange,
  siblingLines,
  type ArrangeMove,
  type ArrangeRef,
} from "../../core/arrange"
import { iconButton, section } from "./field"
import { parentAlignment, type Axis, type ParentAlignment, type Place } from "./section-align"
import type { InspectorSection, SectionContext } from "./index"

/** One size for every mark in the section, so the three strips read as one. */
const GLYPH = 14

interface AlignButton {
  axis: Axis
  place: Place
  label: string
  glyph: IconName
}

/*
 * Read as a pair of triples, the way every editor draws it: three marks that
 * place the child along the inline axis, three along the block axis. The glyph
 * names run the other way round from the axis they serve — aligning to the LEFT
 * is a rule drawn vertically — which is why the pairing is spelled out here
 * once rather than derived at each call site.
 */
const ALIGN_BUTTONS: AlignButton[] = [
  { axis: "horizontal", place: "flex-start", label: "Align left", glyph: "AlignStartVertical" },
  { axis: "horizontal", place: "center", label: "Align horizontal centers", glyph: "AlignCenterVertical" },
  { axis: "horizontal", place: "flex-end", label: "Align right", glyph: "AlignEndVertical" },
  { axis: "vertical", place: "flex-start", label: "Align top", glyph: "AlignStartHorizontal" },
  { axis: "vertical", place: "center", label: "Align vertical centers", glyph: "AlignCenterHorizontal" },
  { axis: "vertical", place: "flex-end", label: "Align bottom", glyph: "AlignEndHorizontal" },
]

const ARRANGE_BUTTONS: Array<{ move: ArrangeMove; label: string; glyph: IconName }> = [
  { move: "front", label: "Bring to front", glyph: "ArrowUpToLine" },
  { move: "forward", label: "Bring forward", glyph: "ArrowUp" },
  { move: "backward", label: "Send backward", glyph: "ArrowDown" },
  { move: "back", label: "Send to back", glyph: "ArrowDownToLine" },
]

/**
 * `iconButton` with a drawn mark and a disabled state.
 *
 * `field.ts` has no `disabled` option and does not need one for its own sake —
 * every other caller's button is always live. Setting it on the returned node
 * keeps that primitive as small as it is, and `.de-tool[disabled]` is already
 * styled, so nothing new lands in the stylesheet either.
 */
function tool(options: {
  label: string
  glyph: IconName
  pressed?: boolean
  disabled?: boolean
  onClick(): void
}): HTMLElement {
  const button = iconButton({
    label: options.label,
    glyph: icon(options.glyph, GLYPH),
    pressed: options.pressed,
    onClick: options.onClick,
  })
  if (options.disabled) (button as HTMLButtonElement).disabled = true
  return button
}

/** Pushes the groups either side of it apart, so the row reads as groups. */
const spacer = () => el("div", { style: "flex:1" })

const strip = (label: string, children: Array<Node | null>) =>
  el("div", { class: "de-row", role: "toolbar", "aria-label": label, style: "gap:2px" }, children)

function alignStrip(alignment: ParentAlignment, invalidate: () => void): HTMLElement {
  const button = ({ axis, place, label, glyph }: AlignButton) =>
    tool({
      label,
      glyph,
      pressed: alignment.currentFor(axis) === place,
      onClick: () => {
        alignment.write(alignment.propertyFor(axis), place, label)
        invalidate()
      },
    })

  const forAxis = (axis: Axis) => ALIGN_BUTTONS.filter((entry) => entry.axis === axis).map(button)
  return strip("Align", [...forAxis("horizontal"), spacer(), ...forAxis("vertical")])
}

/**
 * Distribute is one button, not two: `space-between` only exists on the main
 * axis, so a row parent and a column parent are the same control wearing a
 * different mark. It is also not a toggle — the three align marks on that same
 * axis already write the way back out of it, and a fourth state that only this
 * button can leave would be a trap.
 */
function distributeStrip(alignment: ParentAlignment, invalidate: () => void): HTMLElement {
  const label = alignment.column ? "Distribute vertically" : "Distribute horizontally"
  return strip("Distribute", [
    tool({
      label,
      glyph: alignment.column ? "SpaceBetweenVertical" : "SpaceBetweenHorizontal",
      pressed: alignment.distributed,
      onClick: () => {
        alignment.write("justify-content", "space-between", label)
        invalidate()
      },
    }),
  ])
}

function arrangeStrip(context: SectionContext): HTMLElement {
  const { editor, selection, invalidate } = context
  const ref: ArrangeRef | null = arrangeRef(editor.bridge, selection.element)
  // Asking costs a round trip, so it is only worth asking once we know there is
  // something to move; the answer arrives by re-render, not by mutation.
  const lines = ref ? siblingLines(editor.bridge, ref, invalidate) : null

  return strip(
    "Arrange",
    ARRANGE_BUTTONS.map(({ move, label, glyph }) =>
      tool({
        label,
        glyph,
        disabled: !canArrange(lines, ref, move),
        onClick: () => {
          if (ref) arrange(editor.bridge, ref, lines, move)
        },
      })
    )
  )
}

function readout(label: string, value: string): HTMLElement {
  return el("div", { class: "de-field" }, [
    el("span", { class: "de-field-label", style: "cursor:default", title: label }, [label]),
    el("span", { class: "de-field-value" }, [value]),
  ])
}

/**
 * The rows above the frame, in the order the questions get asked. Alignment is
 * skipped entirely at the top of the tree — a child of `<body>` has no authored
 * parent to lay it out in — while arrange and the frame always draw, because
 * neither of them depends on the parent being a flex container.
 */
function controls(context: SectionContext): Array<HTMLElement | null> {
  const alignment = parentAlignment(context)
  if (!alignment) return [arrangeStrip(context)]

  if (!alignment.isFlex) {
    return [
      el("div", { class: "de-hint" }, [
        `<${alignment.target.tagName}> is not a flex container, so alignment has nothing to act on.`,
      ]),
      el(
        "button",
        {
          class: "de-button",
          type: "button",
          onclick: () => {
            alignment.write("display", "flex", "Auto layout on parent")
            context.invalidate()
          },
        },
        ["Make parent auto layout"]
      ),
      arrangeStrip(context),
    ]
  }

  return [
    alignStrip(alignment, context.invalidate),
    // Distribute and arrange share a line: one spreads the parent's children,
    // the other moves this child among them, and side by side they read as the
    // two halves of "where in the parent does this sit".
    el("div", { class: "de-row" }, [
      distributeStrip(alignment, context.invalidate),
      spacer(),
      arrangeStrip(context),
    ]),
    el("div", { class: "de-hint" }, [
      `Aligns every child of <${alignment.target.tagName}> — that is what flex alignment means.`,
    ]),
  ]
}

export const positionSection: InspectorSection = (context) => {
  const box = context.selection.element.getBoundingClientRect()

  const body = el("div", { class: "de-stack" }, [
    ...controls(context),
    el("div", { class: "de-row de-row--split" }, [
      readout("X", String(round(box.x, 0))),
      readout("Y", String(round(box.y, 0))),
    ]),
    el("div", { class: "de-row de-row--split" }, [
      readout("W", String(round(box.width, 0))),
      readout("H", String(round(box.height, 0))),
    ]),
  ])

  return section("Position", body)
}
