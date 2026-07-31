/**
 * Inspector control primitives.
 *
 * One place for every control so a change to focus, drag-scrub, or commit
 * behaviour lands everywhere at once instead of drifting section by section.
 */

import { el, round } from "../../core/dom"

export interface NumberFieldOptions {
  label: string
  title?: string
  value: number | null
  suffix?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onCommit(value: number): void
}

/** Figma-style scrubbable number input: drag the label, or type a value. */
export function numberField(options: NumberFieldOptions): HTMLElement {
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    "aria-label": options.title ?? options.label,
    value: options.value === null ? "" : String(round(options.value)),
    disabled: options.disabled,
  }) as HTMLInputElement

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    if (Number.isNaN(parsed)) return
    const min = options.min ?? Number.NEGATIVE_INFINITY
    const max = options.max ?? Number.POSITIVE_INFINITY
    options.onCommit(Math.min(max, Math.max(min, parsed)))
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      commit(input.value)
      input.blur()
      return
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const step = (options.step ?? 1) * (event.shiftKey ? 10 : 1)
    const current = Number.parseFloat(input.value) || 0
    const next = event.key === "ArrowUp" ? current + step : current - step
    input.value = String(round(next))
    commit(input.value)
  })
  input.addEventListener("blur", () => commit(input.value))

  const label = el("span", { class: "de-field-label", title: options.title ?? options.label }, [
    options.label,
  ])

  // Drag the label to scrub, the way Figma and Leva both behave.
  label.addEventListener("pointerdown", (event) => {
    if (options.disabled) return
    event.preventDefault()
    label.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startValue = Number.parseFloat(input.value) || 0
    const onMove = (move: PointerEvent) => {
      const step = (options.step ?? 1) * (move.shiftKey ? 10 : 1)
      const next = startValue + (move.clientX - startX) * step
      input.value = String(round(next))
      commit(input.value)
    }
    const onUp = () => {
      label.releasePointerCapture(event.pointerId)
      label.removeEventListener("pointermove", onMove)
      label.removeEventListener("pointerup", onUp)
    }
    label.addEventListener("pointermove", onMove)
    label.addEventListener("pointerup", onUp)
  })

  return el("div", { class: "de-field" }, [
    label,
    input,
    options.suffix ? el("span", { class: "de-field-label" }, [options.suffix]) : null,
  ])
}

export interface TextFieldOptions {
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
  }) as HTMLInputElement
  input.addEventListener("change", () => options.onCommit(input.value))
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    options.onCommit(input.value)
    input.blur()
  })
  return el("div", { class: "de-field" }, [
    el("span", { class: "de-field-label", title: options.label }, [options.label]),
    input,
  ])
}

export interface SelectFieldOptions {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onCommit(value: string): void
}

export function selectField(options: SelectFieldOptions): HTMLElement {
  const select = el("select", { class: "de-select", "aria-label": options.label }) as HTMLSelectElement
  for (const option of options.options) {
    const node = el("option", { value: option.value }, [option.label]) as HTMLOptionElement
    if (option.value === options.value) node.selected = true
    select.append(node)
  }
  select.addEventListener("change", () => options.onCommit(select.value))
  return select
}

export interface IconButtonOptions {
  label: string
  glyph: string
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

export function section(title: string, body: HTMLElement, actions?: HTMLElement): HTMLElement {
  return el("div", { class: "de-section" }, [
    el("div", { class: "de-section-header" }, [el("span", {}, [title]), actions ?? null]),
    el("div", { class: "de-section-body" }, [body]),
  ])
}
