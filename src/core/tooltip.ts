/**
 * The chrome's tooltip, placed against the viewport it is actually in.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS JAVASCRIPT
 *
 * A `::after` carrying `content: attr(data-de-tip)` is the cheapest tooltip
 * there is and this chrome had three of them. They are all the same program:
 * draw a card at a fixed offset from the control and hope the screen is big
 * enough. None of them can ask how wide the window is, where the control sits
 * in it, or how wide the label came out — so none of them can do the one thing
 * a tooltip has to do, which is be readable at the edge of the screen.
 *
 * Both of the panel ones are already bent around that hole. The help dot's card
 * is anchored to the whole ROW rather than to the 14px dot, because hung off
 * the dot it ran off the left edge of a 260px panel and cut the first two words
 * of every hint in half. The row actions' card is hung off the RIGHT edge of
 * its button and grown leftward, because the actions live in the row's
 * top-right corner and any other direction leaves the panel. Both are correct,
 * both are invisible as constraints, and both stop being true the moment the
 * surface moves — which is the actual argument for one primitive rather than
 * three: a rule you can only obey by remembering it is a rule nobody will obey.
 *
 * So: one element, `getBoundingClientRect()` against `window.innerWidth` and
 * `innerHeight`, and the standard three-step — PREFER a side, FLIP to the other
 * when the preferred one overflows, SHIFT along the cross axis to stay inside.
 * `placeTip` below is that arithmetic as a pure function, so it can be checked
 * against synthetic rects without a browser.
 *
 * ---------------------------------------------------------------------------
 * VIEWPORT, NOT THE APP INSET
 *
 * `annotations/canvas.ts` clamps its composer against `--de-left`/`--de-right`
 * rather than the window, because a composer that slides under the inspector
 * has a Save button nobody can press. This does the opposite and the difference
 * is stacking: the composer is painted below the panels, the tooltip is painted
 * above everything (`css/tooltip.ts` pins it over the shortcuts sheet). A tip
 * overlapping a panel is a tip sitting on top of a panel, which is what a
 * tooltip is for. The viewport is the only edge it has.
 *
 * ---------------------------------------------------------------------------
 * ACCESSIBILITY: THE CARD IS DECORATION, AND IS MARKED AS SUCH
 *
 * `aria-hidden="true"` on the card; the control keeps its own `aria-label`.
 * The alternative — pointing `aria-describedby` at the card — is the wrong
 * trade here, for three reasons that are all about what the call sites already
 * say. Every tipped control in this chrome is named with the same words as its
 * tip: `shell/toolbar.ts` emits `data-de-tip` and `aria-label` from one helper,
 * and `test/annotation-cases.mjs` asserts the two attributes are EQUAL on the
 * row actions. A description would therefore read the label back a second time
 * ("Undo, button, Undo"). Second, one shared card means one id pointed at by
 * whichever control is hovered, re-pointed on every pointer move — a moving
 * target in the accessibility tree for a surface that exists only for a
 * pointer. Third, the three implementations this replaces were pseudo-elements,
 * which are not in the accessibility tree at all, so hiding the card keeps the
 * announced experience byte-for-byte what it is today.
 *
 * The one thing that is genuinely not announced either way is the toolbar's
 * shortcut suffix — the tip says "Undo · ⌘Z" and the label says "Undo". That is
 * unchanged from the pseudo-elements, and the fix for it is a real
 * `aria-keyshortcuts` on the control, not a description on a hover card.
 */

import { TIP_WRAP_WIDTH } from "./css/tooltip"
import { el } from "./dom"
import { tokens as t } from "./tokens"

// ─────────────────────────────────────────────────────── the contract ──────

/** The label. Read from the control, or written by `tip()` / `tipAttrs()`. */
export const TIP_ATTR = "data-de-tip"
/**
 * Which side to try FIRST — `"above"` or `"below"`. Optional, and read from the
 * nearest ancestor that carries it, so a container can set it for its children
 * (the toolbar strip, a row of actions) instead of every button repeating it.
 */
export const TIP_PLACEMENT_ATTR = "data-de-tip-placement"
/** Present = no wait. Also inherited from an ancestor. See `DELAY`. */
export const TIP_INSTANT_ATTR = "data-de-tip-instant"
/** Present = the label is a sentence and may take more than one line. */
export const TIP_WRAP_ATTR = "data-de-tip-wrap"
/** Written on the card itself while it is visible. */
const OPEN_ATTR = "data-de-tip-open"

export type TipSide = "above" | "below"

export interface TipOptions {
  /** Try this side first. Default `"below"`; see `DEFAULT_SIDE`. */
  side?: TipSide
  /** Skip the wait. For a control the pointer cannot arrive on by accident. */
  instant?: boolean
  /** The label is prose. Let it wrap rather than run as one line. */
  wrap?: boolean
  /** Appended after a `·`, for what the name cannot say: a shortcut, a result. */
  second?: string
}

/** Enough of a `DOMRect` to place against, so a test can hand over a literal. */
export interface TipRect {
  left: number
  top: number
  width: number
  height: number
}

export interface TipSize {
  width: number
  height: number
}

export interface TipPlacement {
  /** Viewport pixels, ready for `style.left` / `style.top`. */
  left: number
  top: number
  /** Which side it ended up on. */
  side: TipSide
  /** True when `side` is not the side that was asked for. */
  flipped: boolean
  /** True when the cross axis had to move off the control's centre. */
  shifted: boolean
  /**
   * True when the card does not fit the viewport at all and was parked at the
   * margin — the last resort, and the only outcome where it may cover its own
   * control.
   */
  clamped: boolean
}

// ──────────────────────────────────────────────────────── the numbers ──────

/**
 * BELOW by default, and the bottom toolbar does not need to say otherwise.
 *
 * Figma hangs its tooltips under the control inside a panel and over it on the
 * bottom bar, which sounds like two rules and is one: below, unless below is
 * off the screen. The bar is pinned `panelInset` (12px) from the bottom of the
 * viewport and stands 36 tall, so a card needing ~33px plus an 8px gap cannot
 * fit under it and `placeTip` flips it above on its own. The attribute exists
 * for a surface that wants to declare the intent rather than inherit it from
 * the geometry — it costs nothing and it survives the bar being moved.
 */
const DEFAULT_SIDE: TipSide = "below"

/** Between the control and the card. The gap the toolbar's tip already used. */
const GAP = t.space.md

/**
 * How close to the edge of the window the card may come.
 *
 * The same 8 that `token-picker.ts`, `app-chooser.ts`, `layer-menu.ts` and
 * `annotations/canvas.ts` each call `EDGE`. A card flush to the edge reads as
 * clipped even when it is whole.
 */
const MARGIN = t.space.md

/**
 * The wait, and it is the toolbar's 400ms rather than a new number.
 *
 * `css/toolbar.ts` states the reason and it generalises: the bar is a strip of
 * ten controls you sweep the pointer across on the way somewhere else, and
 * without a wait that sweep fires ten labels. The same is true of a column of
 * panel rows. The wait is what separates "the pointer passed over this" from
 * "the pointer stopped on this", and it is the whole difference between a
 * tooltip and a flicker.
 */
const DELAY = 400

/**
 * How long the primitive stays WARM after a tip closes.
 *
 * The argument, and it is ours: once a tooltip is already up, the reader has
 * declared they are reading tooltips, and making them wait another 400ms to
 * learn what the button NEXT to it does is the wait doing the opposite of its
 * job. So the first tip in a run waits and every tip after it is instant —
 * while one is open, and for a moment after the pointer leaves, because
 * crossing a 4px gap between two buttons closes the first one. It is also the
 * reason the row actions in `css/annotations.ts` were given no delay at all.
 *
 * This note used to attribute the warm period to Figma. It should not have:
 * Figma publishes nothing about tooltip timing, and the behaviour was not
 * measured either — it was inferred from using the app, which is not evidence.
 * The nearest thing to a source is `figui3`, a UI3 replica by a Figma designer,
 * which uses a flat 500ms delay and no warm period at all. The mechanism stays
 * because the argument above stands on its own; only the citation was false.
 *
 * 300ms is short enough that coming back to the strip a second later is a fresh
 * run and waits again, which is what keeps the guard against sweeping intact.
 */
const WARM = 300

// ───────────────────────────────────────────────────────── the geometry ────

/**
 * Where the card goes: prefer, flip, shift, clamp — in that order.
 *
 * Pure, and exported, because this is the part that is worth being sure about
 * and the part a browser makes hard to see. Everything it needs is an argument;
 * nothing it does touches the DOM.
 *
 * The order is not interchangeable. FLIP first, because the main axis is where
 * a tooltip can actually be rescued — there is usually a whole screen on the
 * other side of the control. SHIFT second, because sliding along the cross axis
 * keeps the card touching its control even when it is no longer centred on it.
 * CLAMP last and only when the card is bigger than the space that exists, which
 * is the one case with no good answer: park it at the margin and let it overlap
 * rather than let it leave the screen.
 */
export function placeTip(input: {
  anchor: TipRect
  tip: TipSize
  viewport: TipSize
  /** Default `DEFAULT_SIDE`. */
  prefer?: TipSide
  /** Default `GAP`. */
  gap?: number
  /** Default `MARGIN`. */
  margin?: number
}): TipPlacement {
  const { anchor, tip, viewport } = input
  const prefer = input.prefer ?? DEFAULT_SIDE
  const gap = input.gap ?? GAP
  const margin = input.margin ?? MARGIN

  const topFor = (side: TipSide): number =>
    side === "above" ? anchor.top - gap - tip.height : anchor.top + anchor.height + gap
  const fits = (side: TipSide): boolean => {
    const top = topFor(side)
    return top >= margin && top + tip.height <= viewport.height - margin
  }

  const other: TipSide = prefer === "above" ? "below" : "above"
  let side = prefer
  if (!fits(prefer)) {
    if (fits(other)) {
      side = other
    } else {
      /*
       * Neither side fits — a short window, or a control taller than the room
       * around it. Take whichever has more space and let the clamp below deal
       * with the remainder, rather than honouring a preference that puts the
       * card further off-screen than the alternative would.
       */
      const above = anchor.top - margin
      const below = viewport.height - margin - (anchor.top + anchor.height)
      side = below > above ? "below" : "above"
    }
  }

  // ---- cross axis: centred on the control, then slid back inside ----
  const centred = anchor.left + anchor.width / 2 - tip.width / 2
  const minLeft = margin
  const maxLeft = viewport.width - tip.width - margin
  let left = centred
  let shifted = false
  let clamped = false
  if (maxLeft < minLeft) {
    // Wider than the whole band. Nothing to shift to; start at the margin and
    // let the overflow fall off the far side, where less of the label is lost.
    left = minLeft
    clamped = true
  } else if (centred < minLeft) {
    left = minLeft
    shifted = true
  } else if (centred > maxLeft) {
    left = maxLeft
    shifted = true
  }

  // ---- main axis: the chosen side, then the last resort ----
  let top = topFor(side)
  const minTop = margin
  const maxTop = viewport.height - tip.height - margin
  if (maxTop < minTop) {
    top = minTop
    clamped = true
  } else if (top < minTop) {
    top = minTop
    clamped = true
  } else if (top > maxTop) {
    top = maxTop
    clamped = true
  }

  /*
   * Rounded, because a card at a half pixel is a card with a soft edge and
   * blurred text — the one rendering artefact a 12px label cannot carry.
   */
  return { left: Math.round(left), top: Math.round(top), side, flipped: side !== prefer, shifted, clamped }
}

// ───────────────────────────────────────────────────────── the runtime ─────

let card: HTMLElement | null = null
/** The control the card is showing for, or is about to. */
let anchored: HTMLElement | null = null
let timer: number | null = null
let open = false
/** When the last tip closed, for `WARM`. */
let closedAt = 0
let release: (() => void) | null = null

/**
 * A `title` taken off its control for as long as its tip is up.
 *
 * `css/annotations.ts` documents the residual this closes: while the markup
 * keeps a `title`, the browser paints ITS tooltip over ours about a second
 * later, in operating-system chrome, saying the same thing twice. The attribute
 * cannot be styled and cannot be suppressed, only removed — so it is removed
 * while our card is up and put back when it goes, which leaves the DOM exactly
 * as the call site wrote it any time a test or a screen reader looks at it.
 *
 * A call site moving `title` to `data-de-tip` gets the same result with no
 * mutation at all, and should.
 */
let borrowed: { node: HTMLElement; value: string } | null = null

/** The nearest ancestor carrying `attribute`, including the control itself. */
const inherited = (node: HTMLElement, attribute: string): string | null =>
  node.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null

const restoreTitle = (): void => {
  if (!borrowed) return
  if (borrowed.node.isConnected) borrowed.node.setAttribute("title", borrowed.value)
  borrowed = null
}

const clearTimer = (): void => {
  if (timer === null) return
  clearTimeout(timer)
  timer = null
}

/** The card, made once. */
function ensureCard(): HTMLElement {
  if (card?.isConnected) return card
  card =
    card ??
    el("div", {
      class: "de-tip",
      // Decoration. The control keeps its own name — see the header.
      "aria-hidden": "true",
    })
  document.body.append(card)
  return card
}

/**
 * The label, and where it came from.
 *
 * `data-de-tip` wins over `title` where both are present, which is the same
 * precedence `css/annotations.ts` already established so that a call site can
 * add the attribute before taking the other one away without doubling up.
 */
function labelOf(node: HTMLElement): { text: string; fromTitle: boolean } | null {
  const tip = node.getAttribute(TIP_ATTR)
  if (tip) return { text: tip, fromTitle: false }
  const title = node.getAttribute("title")
  if (title) return { text: title, fromTitle: true }
  return null
}

/** The tipped control at or above `target`, if any. */
function anchorFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const node = target.closest<HTMLElement>(`[${TIP_ATTR}], [title]`)
  if (!node || !labelOf(node)) return null
  return node
}

/**
 * Draw and place the card for `node`.
 *
 * Measured with the text already in it and the wrap already decided, because
 * the whole point of doing this in JavaScript is that the size is a fact rather
 * than an estimate. The card sits in the document at `opacity: 0` between
 * shows, so it has a box to measure without ever being seen.
 */
function reveal(node: HTMLElement): void {
  timer = null
  if (!node.isConnected) return
  const label = labelOf(node)
  if (!label) return

  restoreTitle()
  if (label.fromTitle) {
    borrowed = { node, value: label.text }
    node.removeAttribute("title")
  }

  const tip = ensureCard()
  tip.textContent = label.text

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const wraps = node.closest(`[${TIP_WRAP_ATTR}]`) !== null
  if (wraps) tip.setAttribute(TIP_WRAP_ATTR, "")
  else tip.removeAttribute(TIP_WRAP_ATTR)

  let box = tip.getBoundingClientRect()
  /*
   * One line that cannot fit becomes several, and this is the case no CSS-only
   * tip could ever reach: `white-space: nowrap` consults neither the stylesheet
   * nor the window, so a long label at the edge of a narrow window was simply
   * cut off. Re-measured after the switch, because wrapping is exactly the
   * thing that changes both dimensions.
   *
   * Against the SMALLER of the two limits. `TIP_WRAP_WIDTH` is where the sheet
   * says a label has become prose; the viewport band is where the screen says
   * it has run out of room. A tip past either one wants a second line.
   */
  const widest = Math.min(TIP_WRAP_WIDTH, viewport.width - MARGIN * 2)
  if (!wraps && box.width > widest) {
    tip.setAttribute(TIP_WRAP_ATTR, "")
    box = tip.getBoundingClientRect()
  }

  const declared = inherited(node, TIP_PLACEMENT_ATTR)
  const placement = placeTip({
    anchor: node.getBoundingClientRect(),
    tip: { width: box.width, height: box.height },
    viewport,
    prefer: declared === "above" || declared === "below" ? declared : DEFAULT_SIDE,
  })
  tip.style.left = `${placement.left}px`
  tip.style.top = `${placement.top}px`
  tip.setAttribute(OPEN_ATTR, "")
  open = true
}

/** Take the card down, from any of the seven things that should take it down. */
export function hideTip(): void {
  clearTimer()
  restoreTitle()
  anchored = null
  if (!open) return
  open = false
  closedAt = Date.now()
  card?.removeAttribute(OPEN_ATTR)
}

/**
 * Arrive on a control: wait, or don't.
 *
 * The three ways to skip the wait, in the order they are asked: the call site
 * said so, a tip is already up, or one was up a moment ago. See `WARM`.
 */
function schedule(node: HTMLElement): void {
  if (node === anchored) return
  clearTimer()
  anchored = node
  const instant =
    node.closest(`[${TIP_INSTANT_ATTR}]`) !== null || open || Date.now() - closedAt < WARM
  if (instant) {
    reveal(node)
    return
  }
  timer = setTimeout(() => {
    if (anchored === node) reveal(node)
  }, DELAY)
}

/**
 * True when the focus that just landed is the kind a tooltip answers.
 *
 * `:focus-visible`, the same test the three stylesheets used, so clicking a
 * toolbar button does not leave a label hanging over the bar after the pointer
 * has gone. Guarded because a `matches()` with a selector the engine does not
 * know throws, and the suites drive this chrome under jsdom — where the honest
 * answer to "is this focus visible" is that there is nothing to see, so the
 * tip is allowed and the test can assert on it.
 */
function focusIsVisible(node: HTMLElement): boolean {
  try {
    return node.matches(":focus-visible")
  } catch {
    return true
  }
}

/**
 * Mount the one tooltip. Idempotent; returns the teardown.
 *
 * Delegated from `document` rather than from the editor root, and that is the
 * reason ~40 call sites need no change: every one of them already writes
 * `data-de-tip` or `title`, and four separate chrome roots are mounted on
 * `<body>` (the editor, the options window, the token popover, the inspector's
 * probe). One listener set at the document covers all of them and covers
 * anything mounted later, which a per-surface install cannot.
 *
 * `pointerover` rather than `mouseenter`: it bubbles, so one listener sees
 * every control, and it reports its `pointerType`, so a touch — which has no
 * hover and cannot dismiss a card — is ignored outright.
 */
export function installTooltips(): () => void {
  if (release) return release

  const onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return
    const node = anchorFor(event.target)
    if (node) schedule(node)
    else hideTip()
  }
  /* Leaving the window entirely: `relatedTarget` is null and no `pointerover`
     will follow to close it. */
  const onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) hideTip()
  }
  const onFocusIn = (event: FocusEvent): void => {
    const node = anchorFor(event.target)
    if (node && focusIsVisible(node)) schedule(node)
    else hideTip()
  }
  /*
   * Only the control the card is FOR. A `focusout` anywhere else in the
   * document — a field the reader left, a panel that took focus as it opened —
   * says nothing about a tip the pointer is still resting on, and hiding on it
   * unconditionally made a hover tip vanish for a reason on the other side of
   * the screen.
   */
  const onFocusOut = (event: FocusEvent): void => {
    if (anchorFor(event.target) === anchored) hideTip()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") hideTip()
  }
  /*
   * A press is an answer. The reader stopped asking what the control does and
   * did it — and on a control that opens a menu, the card would otherwise sit
   * over the menu it just opened.
   */
  const onPointerDown = (): void => hideTip()
  /*
   * Scroll and resize move the control out from under a card that was placed
   * against numbers that are no longer true. Re-placing on every scroll frame
   * is the other option and it is the wrong one: the card is anchored to
   * something the reader is now moving away from.
   *
   * Capturing, because a scroll inside a panel does not bubble to the window.
   * Passive, because this never calls `preventDefault` and a non-passive
   * scroll listener on the document taxes every scroll in the app being edited.
   */
  const onScroll = (): void => hideTip()

  document.addEventListener("pointerover", onPointerOver, true)
  document.addEventListener("pointerout", onPointerOut, true)
  document.addEventListener("focusin", onFocusIn, true)
  document.addEventListener("focusout", onFocusOut, true)
  document.addEventListener("keydown", onKeyDown, true)
  document.addEventListener("pointerdown", onPointerDown, true)
  document.addEventListener("scroll", onScroll, { capture: true, passive: true })
  window.addEventListener("resize", hideTip)
  window.addEventListener("blur", hideTip)

  release = () => {
    document.removeEventListener("pointerover", onPointerOver, true)
    document.removeEventListener("pointerout", onPointerOut, true)
    document.removeEventListener("focusin", onFocusIn, true)
    document.removeEventListener("focusout", onFocusOut, true)
    document.removeEventListener("keydown", onKeyDown, true)
    document.removeEventListener("pointerdown", onPointerDown, true)
    document.removeEventListener("scroll", onScroll, true)
    window.removeEventListener("resize", hideTip)
    window.removeEventListener("blur", hideTip)
    hideTip()
    card?.remove()
    card = null
    release = null
  }
  return release
}

// ───────────────────────────────────────────────────── the call sites ──────

/**
 * The attribute bag for an `el()` call — the shape the chrome already builds.
 *
 * `shell/toolbar.ts` has a private helper of exactly this signature, down to
 * the ` · ` separator, and its comment argues the case: one parameter rather
 * than two "because the tip has one shape, and a second overload would be how
 * the separator ends up spelled two ways". That is now true of the whole
 * chrome rather than of one file, which is why the helper moves here.
 *
 * `aria-label` comes with it and is not optional. A card marked `aria-hidden`
 * is not a name, so a control given only a tip is a control with no accessible
 * name at all — the thing this pairing exists to make unspellable.
 */
export function tipAttrs(label: string, options: TipOptions = {}): Record<string, string> {
  const attrs: Record<string, string> = {
    [TIP_ATTR]: options.second ? `${label} · ${options.second}` : label,
    "aria-label": label,
  }
  if (options.side) attrs[TIP_PLACEMENT_ATTR] = options.side
  if (options.instant) attrs[TIP_INSTANT_ATTR] = ""
  if (options.wrap) attrs[TIP_WRAP_ATTR] = ""
  return attrs
}

/**
 * The same thing for an element that already exists.
 *
 * Writes attributes and nothing else — there is no per-element listener and no
 * registry, so a control built this way behaves identically to one built with
 * `tipAttrs`, and removing the attribute is all it takes to remove the tip.
 *
 * It does NOT touch `aria-label`: a control may well be named by its own text
 * and overwriting that with the tip's wording is how a "Save" button comes to
 * announce "Save · ⌘S". Pass the name through `tipAttrs` at construction, or
 * set it at the call site.
 */
export function tip(node: HTMLElement, label: string, options: TipOptions = {}): void {
  node.setAttribute(TIP_ATTR, options.second ? `${label} · ${options.second}` : label)
  if (options.side) node.setAttribute(TIP_PLACEMENT_ATTR, options.side)
  if (options.instant) node.setAttribute(TIP_INSTANT_ATTR, "")
  if (options.wrap) node.setAttribute(TIP_WRAP_ATTR, "")
  /* A `title` left behind would paint the OS tip over ours a second later. */
  node.removeAttribute("title")
}
