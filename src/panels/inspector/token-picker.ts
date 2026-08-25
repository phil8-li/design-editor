/**
 * The design-system token field and the picker it opens.
 *
 * Its own module because a picker is a surface, not a control: it owns a
 * popover, a filter, roving keyboard state and a way back to the field. In
 * `field.ts` it would sit in front of every other inspector section; in the
 * design-system section it would be buried under the catalog logic that decides
 * what the choices are.
 *
 * Nothing here knows what a token is. It takes choices that are already human —
 * a group, a leaf name, a preview — so "no machine spelling reaches the screen"
 * is a property of the type rather than something to re-remember per call site.
 */

import { clamp, clear, el } from "../../core/dom"
import { icon } from "../../core/icons"

/** What the leading 16px slot draws. `none` keeps the name column aligned. */
export type TokenPreview =
  | { kind: "color"; css: string }
  | { kind: "text"; fontSize: number }
  | { kind: "radius"; px: number }
  | { kind: "none" }

export interface TokenChoice {
  id: string
  /** The path prefix, shown once as a sticky header rather than on every row. */
  group: string
  /** The segment after that prefix — the only name a row carries. */
  leaf: string
  /** The whole path, which is what the closed field reads. */
  name: string
  preview: TokenPreview
  /** A text style's `16/20`. Empty on every other axis. */
  detail: string
  /** Offered but inert. The row says so before the click, not a toast after it. */
  disabled: boolean
}

export interface TokenFieldOptions {
  /** Stable identity so focus survives the panel rebuild a commit causes. */
  id: string
  title: string
  choices: TokenChoice[]
  /** Empty when nothing is bound, or when the binding is not certain. */
  selectedId: string
  /** The element's own value, in the plain spelling, for when nothing is bound. */
  fallback: { preview: TokenPreview; text: string }
  onCommit(id: string): void
}

const POPOVER_WIDTH = 264
const EDGE = 8
const SWATCH = 16

/** One picker at a time: opening a second closes the first. */
let dismiss: ((restoreFocus: boolean) => void) | null = null

/**
 * The leading slot.
 *
 * A text style previews its own face rather than describing it, clamped to the
 * slot: a 40px display style would otherwise set the height of every row in the
 * list it appears in.
 */
function previewNode(preview: TokenPreview): HTMLElement {
  if (preview.kind === "color") {
    return el("span", {
      class: "de-token-swatch de-token-swatch--color",
      style: `background:${preview.css}`,
    })
  }
  if (preview.kind === "text") {
    return el(
      "span",
      {
        class: "de-token-swatch de-token-swatch--text",
        style: `font-size:${Math.min(preview.fontSize, SWATCH - 3)}px`,
      },
      ["Ag"]
    )
  }
  if (preview.kind === "radius") {
    return el("span", {
      class: "de-token-swatch de-token-swatch--radius",
      style: `border-radius:${Math.min(preview.px, SWATCH / 2)}px`,
    })
  }
  return el("span", { class: "de-token-swatch" })
}

/** Groups in first-appearance order; the catalog interleaves its paths. */
function grouped(choices: readonly TokenChoice[]): Array<[string, TokenChoice[]]> {
  const groups = new Map<string, TokenChoice[]>()
  for (const choice of choices) {
    const bucket = groups.get(choice.group)
    if (bucket) bucket.push(choice)
    else groups.set(choice.group, [choice])
  }
  return [...groups]
}

export function tokenField(options: TokenFieldOptions): HTMLElement {
  const selected = options.choices.find((choice) => choice.id === options.selectedId) ?? null
  const field = el(
    "button",
    {
      class: "de-token-field",
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-label": `${options.title} token`,
      "data-de-field": options.id,
    },
    [
      previewNode(selected ? selected.preview : options.fallback.preview),
      el(
        "span",
        { class: selected ? "de-token-field-name" : "de-token-field-name de-token-field-name--plain" },
        [selected ? selected.name : options.fallback.text]
      ),
    ]
  )
  field.addEventListener("click", () => openPicker(field, options))
  return field
}

function openPicker(field: HTMLElement, options: TokenFieldOptions): void {
  dismiss?.(false)

  const list = el("div", { class: "de-token-list", role: "listbox", "aria-label": options.title })
  const search = el("input", {
    class: "de-token-search-input",
    type: "text",
    placeholder: "Search",
    "aria-label": `Search ${options.title}`,
  }) as HTMLInputElement
  // No `+` beside the close: Figma's picker creates a style there, and this one
  // has nothing to create. A control that cannot do anything is worse than none.
  const closeButton = el(
    "button",
    { class: "de-mini", type: "button", title: "Close", "aria-label": "Close" },
    [icon("X", 12)]
  )
  const popover = el("div", { class: "de-token-popover", role: "dialog", "aria-label": options.title }, [
    el("div", { class: "de-token-popover-header" }, [
      el("span", { class: "de-token-popover-title" }, [options.title]),
      closeButton,
    ]),
    el("div", { class: "de-token-search" }, [icon("Search", 12), search]),
    list,
  ])

  let visible: TokenChoice[] = []
  let rows: HTMLElement[] = []
  let active = -1

  const setActive = (next: number) => {
    if (!rows.length) {
      active = -1
      return
    }
    active = (next + rows.length) % rows.length
    for (const [index, row] of rows.entries()) row.setAttribute("data-active", String(index === active))
    // jsdom has no scroller, and neither does a list short enough to fit.
    rows[active].scrollIntoView?.({ block: "nearest" })
  }

  const close = (restoreFocus: boolean) => {
    if (dismiss !== close) return
    dismiss = null
    window.removeEventListener("pointerdown", onPointerDown, true)
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("scroll", onScroll, true)
    popover.remove()
    field.setAttribute("aria-expanded", "false")
    if (restoreFocus) field.focus()
  }

  const commit = (choice: TokenChoice) => {
    if (choice.disabled) return
    // Focus goes back to the field BEFORE the write, not after: a commit rebuilds
    // the whole inspector, and the panel restores focus by `data-de-field`. From
    // a row inside a popover it is about to remove, there is nothing to restore.
    close(true)
    options.onCommit(choice.id)
  }

  const rowNode = (choice: TokenChoice): HTMLElement => {
    const chosen = choice.id === options.selectedId
    const row = el(
      "button",
      {
        class: "de-token-row",
        type: "button",
        role: "option",
        tabindex: "-1",
        "aria-selected": String(chosen),
        "aria-disabled": choice.disabled ? "true" : undefined,
        "data-de-choice": choice.id,
      },
      [
        previewNode(choice.preview),
        el("span", { class: "de-token-row-name" }, [choice.leaf]),
        choice.detail ? el("span", { class: "de-token-row-detail" }, [choice.detail]) : null,
        chosen ? el("span", { class: "de-token-row-check" }, [icon("Check", 12)]) : null,
      ]
    )
    row.addEventListener("click", () => commit(choice))
    return row
  }

  const render = (query: string) => {
    const needle = query.trim().toLowerCase()
    const groups = grouped(options.choices.filter((choice) => choice.name.toLowerCase().includes(needle)))
    // Flattened through the grouping, so arrow keys walk the rows in the order
    // they are painted rather than the order the catalog happens to store.
    visible = groups.flatMap(([, entries]) => entries)
    clear(list)
    rows = []
    for (const [group, entries] of groups) {
      list.append(el("div", { class: "de-token-group" }, [group]))
      for (const entry of entries) {
        const row = rowNode(entry)
        rows.push(row)
        list.append(row)
      }
    }
    if (!visible.length) list.append(el("div", { class: "de-token-empty" }, ["No matches"]))
    const chosen = visible.findIndex((choice) => choice.id === options.selectedId)
    setActive(chosen < 0 ? 0 : chosen)
  }

  const onPointerDown = (event: Event) => {
    if (!popover.contains(event.target as Node) && !field.contains(event.target as Node)) close(false)
  }
  const onScroll = () => close(false)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close(true)
    else if (event.key === "ArrowDown") setActive(active + 1)
    else if (event.key === "ArrowUp") setActive(active - 1)
    else if (event.key === "Home") setActive(0)
    else if (event.key === "End") setActive(rows.length - 1)
    else if (event.key === "Enter" && visible[active]) commit(visible[active])
    else return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  closeButton.addEventListener("click", () => close(true))
  search.addEventListener("input", () => render(search.value))

  document.body.append(popover)
  field.setAttribute("aria-expanded", "true")
  render("")
  place(field, popover)
  dismiss = close
  window.addEventListener("pointerdown", onPointerDown, true)
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("scroll", onScroll, true)
  search.focus()
}

/**
 * Anchored to the field, flipped above it when the list would run off the
 * bottom. Measured after mount rather than estimated: the height depends on how
 * many tokens the axis has, and a picker whose last rows are past the viewport
 * edge is a picker those tokens cannot be chosen from.
 */
function place(field: HTMLElement, popover: HTMLElement): void {
  const anchor = field.getBoundingClientRect()
  popover.style.left = `${clamp(anchor.left, EDGE, Math.max(EDGE, window.innerWidth - POPOVER_WIDTH - EDGE))}px`
  const height = popover.getBoundingClientRect().height
  const below = anchor.bottom + 4
  popover.style.top =
    below + height + EDGE <= window.innerHeight
      ? `${below}px`
      : `${Math.max(EDGE, anchor.top - 4 - height)}px`
}
