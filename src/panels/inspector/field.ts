/**
 * Inspector control primitives.
 *
 * One place for every control so a change to focus, drag-scrub, or commit
 * behaviour lands everywhere at once instead of drifting section by section.
 */

import { el, round } from "../../core/dom"
import { icon } from "../../core/icons"

/**
 * Panel-level memory. Collapse and expander state belong to the *panel*, not to
 * the selected element: the inspector is torn down and rebuilt on every write,
 * so anything held in the DOM or in a section-local variable would reset the
 * moment you typed into the control you just opened.
 */
const collapsedSections = new Map<string, boolean>()
const expanders = new Map<string, boolean>()

export function isExpanded(key: string): boolean {
  return expanders.get(key) === true
}

export function setExpanded(key: string, value: boolean): void {
  expanders.set(key, value)
}

/* ---------- numeric expressions ---------- */

interface Cursor {
  text: string
  at: number
}

function skipSpace(cursor: Cursor): void {
  while (cursor.at < cursor.text.length && /\s/.test(cursor.text[cursor.at])) cursor.at += 1
}

function readPrimary(cursor: Cursor): number | null {
  skipSpace(cursor)
  if (cursor.text[cursor.at] === "(") {
    cursor.at += 1
    const inner = readSum(cursor)
    skipSpace(cursor)
    if (inner === null || cursor.text[cursor.at] !== ")") return null
    cursor.at += 1
    return inner
  }
  const match = /^\d*\.?\d+/.exec(cursor.text.slice(cursor.at))
  if (!match) return null
  cursor.at += match[0].length
  // Units are display sugar in Figma-style fields; the field's glyph already
  // says what the number means, so a typed `px`/`%`/`rem` is stripped, not an error.
  const unit = /^(px|%|rem|em|ch|vh|vw|deg|pt)/i.exec(cursor.text.slice(cursor.at))
  if (unit) cursor.at += unit[0].length
  return Number.parseFloat(match[0])
}

function readSigned(cursor: Cursor): number | null {
  skipSpace(cursor)
  const sign = cursor.text[cursor.at]
  if (sign === "-" || sign === "+") {
    cursor.at += 1
    const value = readSigned(cursor)
    return value === null ? null : sign === "-" ? -value : value
  }
  return readPrimary(cursor)
}

function readProduct(cursor: Cursor): number | null {
  let left = readSigned(cursor)
  if (left === null) return null
  for (;;) {
    skipSpace(cursor)
    const operator = cursor.text[cursor.at]
    if (operator !== "*" && operator !== "/") return left
    cursor.at += 1
    const right = readSigned(cursor)
    if (right === null) return null
    if (operator === "/" && right === 0) return null
    left = operator === "*" ? left * right : left / right
  }
}

function readSum(cursor: Cursor): number | null {
  let left = readProduct(cursor)
  if (left === null) return null
  for (;;) {
    skipSpace(cursor)
    const operator = cursor.text[cursor.at]
    if (operator !== "+" && operator !== "-") return left
    cursor.at += 1
    const right = readProduct(cursor)
    if (right === null) return null
    left = operator === "+" ? left + right : left - right
  }
}

/**
 * Arithmetic-only evaluator for numeric fields, so `(240-16)/2` is a value.
 *
 * Hand-rolled rather than `eval`/`new Function`: the editor runs inside the
 * app's own document, and a field that executes arbitrary text is a script
 * injection point one paste away.
 */
export function evaluateNumeric(raw: string): number | null {
  const cursor: Cursor = { text: raw.trim(), at: 0 }
  if (!cursor.text) return null
  const value = readSum(cursor)
  skipSpace(cursor)
  if (value === null || cursor.at !== cursor.text.length || !Number.isFinite(value)) return null
  return value
}

/* ---------- controls ---------- */

export interface NumberFieldOptions {
  /** Stable identity so focus survives the panel rebuild after a write. */
  id?: string
  label: string
  title?: string
  value: number | null
  /** Shown when `value` is null — `Mixed` across a multi-selection, say. */
  placeholder?: string
  suffix?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  /**
   * Live value during a scrub. Sections wire this to an inline style so the
   * drag is visible without queueing a source write (and a toast) per frame.
   */
  onPreview?(value: number): void
  onCommit(value: number): void
}

/** Figma-style scrubbable number input: drag the label, or type a value. */
export function numberField(options: NumberFieldOptions): HTMLElement {
  const initial = options.value === null ? "" : String(round(options.value))
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    "aria-label": options.title ?? options.label,
    value: initial,
    placeholder: options.placeholder ?? "",
    disabled: options.disabled,
    "data-de-field": options.id,
  }) as HTMLInputElement

  const clampValue = (value: number) =>
    Math.min(options.max ?? Number.POSITIVE_INFINITY, Math.max(options.min ?? Number.NEGATIVE_INFINITY, value))

  const commit = (raw: string) => {
    const parsed = evaluateNumeric(raw)
    if (parsed === null) return
    const next = clampValue(parsed)
    // Show the result, not the expression — the field is now the value again.
    input.value = String(round(next))
    options.onCommit(next)
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      commit(input.value)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      input.value = initial
      input.blur()
      return
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const step = (options.step ?? 1) * modifierScale(event)
    const current = evaluateNumeric(input.value) ?? 0
    commit(String(round(event.key === "ArrowUp" ? current + step : current - step)))
  })
  input.addEventListener("blur", () => commit(input.value))

  const label = el("span", { class: "de-field-label", title: options.title ?? options.label }, [
    options.label,
  ])

  // Drag the label to scrub, the way Figma and Leva both behave. The commit is
  // deferred to pointerup: committing per pointermove queues a source write and
  // fires the engine toast dozens of times for one gesture.
  label.addEventListener("pointerdown", (event) => {
    if (options.disabled) return
    event.preventDefault()
    label.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startValue = evaluateNumeric(input.value) ?? 0
    let latest = startValue
    let frame = 0

    const onMove = (move: PointerEvent) => {
      latest = clampValue(startValue + (move.clientX - startX) * (options.step ?? 1) * modifierScale(move))
      input.value = String(round(latest))
      if (!options.onPreview || frame) return
      // One preview per frame: the value changes faster than the app can paint.
      frame = requestAnimationFrame(() => {
        frame = 0
        options.onPreview?.(latest)
      })
    }
    const onUp = () => {
      if (frame) cancelAnimationFrame(frame)
      // `pointercancel` has already dropped the capture; releasing twice throws.
      if (label.hasPointerCapture(event.pointerId)) label.releasePointerCapture(event.pointerId)
      label.removeEventListener("pointermove", onMove)
      label.removeEventListener("pointerup", onUp)
      label.removeEventListener("pointercancel", onUp)
      if (latest !== startValue) options.onCommit(latest)
    }
    label.addEventListener("pointermove", onMove)
    label.addEventListener("pointerup", onUp)
    label.addEventListener("pointercancel", onUp)
  })

  // `--numeric` rather than styling every `.de-field input`: tabular figures
  // stop the digits walking sideways under a scrub, but the same treatment on
  // a text field would space out prose that has no columns to keep.
  return el("div", { class: "de-field de-field--numeric" }, [
    label,
    input,
    options.suffix ? el("span", { class: "de-field-suffix" }, [options.suffix]) : null,
  ])
}

/** Shift coarsens, Alt/Cmd refines — Figma's two scrub gears. */
function modifierScale(event: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): number {
  if (event.shiftKey) return 10
  if (event.altKey || event.metaKey || event.ctrlKey) return 0.1
  return 1
}

export interface TextFieldOptions {
  id?: string
  label: string
  value: string
  placeholder?: string
  onCommit(value: string): void
}

export function textField(options: TextFieldOptions): HTMLElement {
  const input = el("input", {
    type: "text",
    "aria-label": options.label,
    value: options.value,
    placeholder: options.placeholder ?? "",
    "data-de-field": options.id,
  }) as HTMLInputElement
  input.addEventListener("change", () => options.onCommit(input.value))
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    options.onCommit(input.value)
    input.blur()
  })
  return el("div", { class: "de-field" }, [
    el("span", { class: "de-field-label", style: "cursor:default", title: options.label }, [options.label]),
    input,
  ])
}

export interface SelectFieldOptions {
  id?: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onCommit(value: string): void
}

export function selectField(options: SelectFieldOptions): HTMLElement {
  const select = el("select", {
    class: "de-select",
    "aria-label": options.label,
    "data-de-field": options.id,
  }) as HTMLSelectElement
  for (const option of options.options) {
    const node = el("option", { value: option.value }, [option.label]) as HTMLOptionElement
    if (option.value === options.value) node.selected = true
    select.append(node)
  }
  select.addEventListener("change", () => options.onCommit(select.value))
  return select
}

export interface SegmentedOptions {
  label: string
  value: string
  options: Array<{ value: string; label: string; title?: string }>
  onCommit(value: string): void
}

/** Two or three mutually exclusive words — Figma's `Packed | Space between`. */
export function segmented(options: SegmentedOptions): HTMLElement {
  return el(
    "div",
    { class: "de-segmented", role: "group", "aria-label": options.label },
    options.options.map((option) =>
      el(
        "button",
        {
          class: "de-segment",
          type: "button",
          title: option.title ?? option.label,
          "aria-pressed": String(option.value === options.value),
          onclick: () => options.onCommit(option.value),
        },
        [option.label]
      )
    )
  )
}

export interface IconButtonOptions {
  label: string
  /**
   * A unicode mark or a drawn one.
   *
   * It was `string` while every caller had a `⇤` to hand. The align strip draws
   * real glyphs now, and a caller that has an `<svg>` should not have to build
   * the button itself just to pass one in — that is how a second, subtly
   * different button gets written.
   */
  glyph: string | Node
  pressed?: boolean
  onClick(): void
}

export function iconButton(options: IconButtonOptions): HTMLElement {
  return el(
    "button",
    {
      class: "de-tool",
      type: "button",
      title: options.label,
      "aria-label": options.label,
      "aria-pressed": options.pressed === undefined ? undefined : String(options.pressed),
      onclick: options.onClick,
    },
    [options.glyph]
  )
}

/** Small trailing affordance on a list row or a section header: `+`, eye, `−`. */
export function miniButton(options: {
  label: string
  glyph: string | Node
  pressed?: boolean
  danger?: boolean
  onClick(): void
}): HTMLElement {
  return el(
    "button",
    {
      class: options.danger ? "de-mini de-mini--danger" : "de-mini",
      type: "button",
      title: options.label,
      "aria-label": options.label,
      "aria-pressed": options.pressed === undefined ? undefined : String(options.pressed),
      onclick: options.onClick,
    },
    [options.glyph]
  )
}

/**
 * A collapsible section. The header folds the body in place rather than asking
 * the panel to re-render: a rebuild here would drop focus from whatever the
 * user was editing two controls down.
 */
export function section(title: string, body: HTMLElement, actions?: HTMLElement): HTMLElement {
  const collapsed = collapsedSections.get(title) === true
  const wrapped = el("div", { class: "de-section-body" }, [body])
  wrapped.hidden = collapsed

  // The toggle is a sibling of the actions, not their parent: a `+` nested
  // inside the fold button would be a button inside a button, which is invalid
  // and leaves the inner one unreachable by keyboard.
  const toggle = el(
    "button",
    {
      class: "de-section-toggle",
      type: "button",
      "aria-expanded": String(!collapsed),
      title: `${collapsed ? "Expand" : "Collapse"} ${title}`,
    },
    [el("span", { class: "de-chevron", "aria-hidden": "true" }, [icon("ChevronRight", 10)]), title]
  )

  toggle.addEventListener("click", () => {
    const next = !(collapsedSections.get(title) === true)
    collapsedSections.set(title, next)
    wrapped.hidden = next
    toggle.setAttribute("aria-expanded", String(!next))
    toggle.setAttribute("title", `${next ? "Expand" : "Collapse"} ${title}`)
    toggle.classList.toggle("de-section-toggle--collapsed", next)
  })
  toggle.classList.toggle("de-section-toggle--collapsed", collapsed)

  return el("div", { class: "de-section" }, [
    el("div", { class: "de-section-header de-section-header--collapsible" }, [
      toggle,
      actions ? el("span", { class: "de-section-actions" }, [actions]) : null,
    ]),
    wrapped,
  ])
}
