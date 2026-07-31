/** Saved options/variants for the selected element. Lane C owns this. */

import { el } from "../core/dom"
import { section } from "../panels/inspector/field"
import { optionsStore } from "./store"
import type { InspectorSection, SectionContext } from "../panels/inspector/index"
import type { ElementOption } from "../core/types"

/** Swaps the name for an input in place; Enter commits, Escape reverts. */
function startRename(
  name: HTMLElement,
  option: ElementOption,
  commit: (value: string) => void
): void {
  const input = el("input", {
    type: "text",
    value: option.name,
    "aria-label": "Option name",
  }) as HTMLInputElement
  const field = el("div", { class: "de-field", style: "flex:1;height:18px;padding:0 4px" }, [input])
  // The row itself applies the option on click; renaming must not trigger that.
  field.addEventListener("click", (event) => event.stopPropagation())
  field.addEventListener("dblclick", (event) => event.stopPropagation())

  name.replaceWith(field)
  input.focus()
  input.select()

  let settled = false
  const finish = (keep: boolean) => {
    if (settled) return
    settled = true
    const value = input.value.trim()
    field.replaceWith(name)
    if (keep && value && value !== option.name) commit(value)
  }

  input.addEventListener("blur", () => finish(true))
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      finish(true)
    }
    if (event.key === "Escape") {
      event.preventDefault()
      finish(false)
    }
  })
}

function optionRow(context: SectionContext, option: ElementOption, active: boolean): HTMLElement {
  const store = optionsStore(context.editor)
  const { selection, writer } = context

  const name = el("span", { class: "de-option-name", title: "Double-click to rename" }, [
    option.name,
  ])

  const remove = el(
    "button",
    {
      class: "de-option-delete",
      type: "button",
      title: "Delete option",
      "aria-label": `Delete ${option.name}`,
      onclick: (event: Event) => {
        event.stopPropagation()
        store.remove(selection, writer, option.id)
      },
    },
    ["×"]
  )

  const apply = () => store.apply(selection, writer, option)

  const row = el(
    "div",
    {
      class: "de-option",
      role: "radio",
      tabindex: "0",
      "aria-checked": String(active),
      onclick: apply,
      onkeydown: (event: Event) => {
        const key = (event as KeyboardEvent).key
        if (key !== "Enter" && key !== " ") return
        event.preventDefault()
        apply()
      },
    },
    [name, remove]
  )

  name.addEventListener("dblclick", (event) => {
    event.stopPropagation()
    startRename(name, option, (value) => store.rename(selection.key, option.id, value))
  })

  return row
}

export const optionsSection: InspectorSection = (context) => {
  const store = optionsStore(context.editor)
  void store.ready()

  const set = store.get(context.selection.key)
  const options = set?.options ?? []

  const list = el(
    "div",
    { role: "radiogroup", "aria-label": "Saved options", style: "display:flex;flex-direction:column" },
    options.length
      ? options.map((option) => optionRow(context, option, option.id === set?.activeOptionId))
      : [
          el("div", { class: "de-empty", style: "padding:2px 6px 6px;text-align:left" }, [
            "No saved options yet. Style the element, then save it as an option.",
          ]),
        ]
  )

  const actions = el("div", { class: "de-row" }, [
    el(
      "button",
      {
        class: "de-button",
        type: "button",
        onclick: () => store.saveCurrent(context.selection, context.writer),
      },
      ["Save current as option"]
    ),
    el(
      "button",
      {
        class: "de-button",
        type: "button",
        disabled: !set?.activeOptionId,
        title: "Overwrite the active option with the element's current state",
        onclick: () => store.updateActive(context.selection),
      },
      ["Update"]
    ),
  ])

  return section(
    "Options",
    el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [list, actions])
  )
}
