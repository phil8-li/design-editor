/**
 * Fill — Figma's paint row list, at the one row CSS actually supports.
 *
 * `background-color` holds a single paint, so the section shows one row rather
 * than pretending a stack exists. What the row model buys is real: a per-fill
 * eye that parks the colour without losing it, and an explicit add/remove
 * instead of "type transparent and hope".
 *
 * ## The token binding is IN the paint row now
 *
 * `fill-color` and `svg-fill` used to be two more rows in a `Design system`
 * section thirty rows further down the panel. That meant the background colour
 * of the selected box was asked about twice — once here as a hex, once there as
 * a token name — in two shapes, neither mentioning the other, and which of them
 * wrote a token was not discoverable from either. Figma has no such section
 * because a token is not a category of decision: it is the ANSWER this row
 * already asks for, printed where the hex would be.
 *
 * So the row's middle cell is the token field. It was an inert `<span>` holding
 * the hex, which is exactly the slot Figma fills with the bound style's name,
 * and the field prints the plain hex itself when nothing is bound — so the swap
 * costs the row nothing and stops the panel asking twice. The swatch beside it
 * still edits the literal. One row, both ways in.
 *
 * `svg-fill` cannot join it. It paints the `<svg>` INSIDE the selected button
 * rather than the button, so it writes to a different element; a single row
 * whose swatch and whose token field disagreed about what they were editing
 * would be worse than two rows.
 */

import { el, round } from "../../core/dom"
import { icon } from "../../core/icons"
import { tokens } from "../../core/tokens"
import { alphaOf, swatch, toHex } from "./color"
import { miniButton, numberField, section } from "./field"
import { svgTarget, tokenControl, tokenHints, tokenRow } from "./token-row"
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

export const fillSection: InspectorSection = (context) => {
  const { selection, computed, writer, invalidate } = context
  const current = computed.backgroundColor
  const painted = isPainted(current)
  const stored = parked.get(selection.key)

  const apply = (value: string, summary: string) => {
    writer.applyStyles(selection, [{ property: "background-color", value }], summary)
    invalidate()
  }

  const add = miniButton({
    label: painted || stored ? "Fill already set" : "Add fill",
    glyph: icon("Plus", tokens.icon.row),
    onClick: () => {
      parked.delete(selection.key)
      apply(DEFAULT_FILL, "Add fill")
    },
  })
  if (painted || stored) add.setAttribute("disabled", "")

  /*
   * The glyph inside the selected button, when there is one.
   *
   * Built before the no-fill return and drawn in BOTH states on purpose: an
   * icon button almost never has a background, so gating this on the button's
   * own paint would hide the `<svg>`'s fill picker from exactly the elements
   * that have one. Its applicability is `svgTarget`, and nothing else.
   */
  const svg = svgTarget(context)
  const svgFill = svg
    ? tokenRow(context, "svg-fill", "SVG fill", {
        target: svg,
        computed: getComputedStyle(svg.element),
      })
    : null

  if (!painted && !stored) {
    /*
     * No paint, and so no fill-colour binding either.
     *
     * The one affordance for "there is no fill, give it one" is the `+` in the
     * header. A token field here would be a second one wearing a picker's
     * clothes: it would read "—", and the first pick would INVENT the paint
     * rather than name it — the same question asked twice in two shapes, which
     * is the defect this merge exists to remove. Stroke answers identically,
     * where the other answer costs more: a stroke colour on a zero-width border
     * writes source and paints nothing at all.
     *
     * The price is one extra click. `+` gives the box a fill and the row —
     * binding included — is here on the next render.
     */
    return section(
      "Fill",
      el("div", { class: "de-stack" }, [el("div", { class: "de-hint" }, ["No fill."]), svgFill]),
      add
    )
  }

  const value = painted ? current : (stored as string)
  const alpha = alphaOf(value)

  /*
   * While the fill is parked, the row's value is not the element's.
   *
   * The eye writes `transparent` and remembers the colour, so the element
   * genuinely has no background — and a field reading the element would print
   * "—" beside a swatch still showing the colour it is holding. Handing the
   * parked colour over as the evidence keeps both cells describing the same
   * paint, which is what the row promises the eye is keeping. Empty inline
   * value because the only inline declaration there is the `transparent` the
   * eye wrote, and that is not what the designer parked.
   */
  const evidence = painted ? {} : { inlineValue: "", computedValue: value }
  const binding = tokenControl(context, "fill-color", "Fill color", { ...evidence, hidePreview: true })
  /*
   * Sized by `.de-paint-row .de-token-field` in `css/panels.ts`, beside the
   * rules for the row's `.de-field` and `.de-select` cells.
   *
   * It needed a rule of its own rather than inheriting either of theirs: the
   * field is a button carrying `width: 100%`, which as a flex basis claims the
   * whole row and shrinks the alpha field next to it to nothing. `flex: 1`
   * restores exactly the split the `.de-paint-value` span it replaces had.
   */
  const row = el("div", { class: "de-paint-row" }, [
    swatch(value, "Fill colour", (hex) => apply(withAlpha(hex, alpha), "Set fill")),
    binding ?? el("span", { class: "de-paint-value" }, [toHex(value) ?? value]),
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
      glyph: icon("Minus", tokens.icon.row),
      danger: true,
      onClick: () => {
        parked.delete(selection.key)
        apply("transparent", "Remove fill")
      },
    }),
  ])

  /*
   * The two sentences the captioned block would have printed under the field.
   *
   * Folding a picker into someone else's row is exactly where they get dropped,
   * and they are the honest half: "could be Background/Card or Surface/Raised —
   * the theme decides" is the difference between a designer trusting the name
   * above and knowing it is a guess. They sit under the row rather than in it,
   * because a sentence has nowhere to go between a swatch and an alpha field.
   */
  const body = el("div", { class: "de-stack" }, [
    row,
    tokenHints(context, "fill-color", "Fill color", evidence),
    svgFill,
  ])

  return section("Fill", body, add)
}
