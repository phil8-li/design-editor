/** Saved options/variants for the selected element. Lane C owns this. */

import { el } from "../core/dom"
import { section } from "../panels/inspector/field"
import { controlRow, installOptionsBrowser, openOptionsBrowser } from "./inventory-panel"
import { isControlRelevantToElement, readInventory } from "./inventory"
import type { LevaControl, LevaFolder } from "./inventory"
import { optionsStore, visibleOptions } from "./store"
import type { InspectorSection, SectionContext } from "../panels/inspector/index"
import type { ElementOption } from "../core/types"

function controlsIn(folders: readonly LevaFolder[]): LevaControl[] {
  const controls: LevaControl[] = []
  const visit = (folder: LevaFolder) => {
    controls.push(...folder.controls)
    folder.folders.forEach(visit)
  }
  folders.forEach(visit)
  return controls
}

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

  const apply = () => store.apply(selection, writer, option)

  // The radio is the choice itself. The delete button used to be nested inside
  // it, which is invalid ARIA (a `radio` may not own a control) and made the
  // whole row ambiguous to a keyboard user.
  const choice = el(
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
    [name]
  )

  const remove = el(
    "button",
    {
      class: "de-option-delete",
      type: "button",
      title: "Delete this saved variant",
      "aria-label": `Delete ${option.name}`,
      onclick: () => store.remove(selection, writer, option.id),
    },
    ["×"]
  )

  name.addEventListener("dblclick", (event) => {
    event.stopPropagation()
    startRename(name, option, (value) => store.rename(selection.key, option.id, value))
  })

  return el("div", { class: "de-option-row" }, [choice, remove])
}

export const optionsSection: InspectorSection = (context) => {
  const store = optionsStore(context.editor)
  void store.ready()
  // Mount the browser here so its launcher outlives the selection: this section
  // is the only place in the app that is guaranteed to run, and the inspector
  // tears every section down the moment nothing is selected.
  installOptionsBrowser(context.editor)

  const set = store.get(context.selection.key)
  const options = visibleOptions(set)
  const inventory = readInventory()
  const relevant = inventory.available
    ? controlsIn(inventory.sections).filter((control) =>
        isControlRelevantToElement(control, context.selection.element)
      )
    : []

  // Relevance counts a control whose selector matches anything *inside* the
  // element, so selecting a container binds most of the app's inventory — 177
  // controls at ~188px each once pushed Appearance 33,000px down the panel.
  // The modifier caps this list so the property sections below stay reachable.
  const contextual = relevant.length
    ? el("details", { class: "de-opt-folder de-opt-folder--inline", open: true }, [
        el("summary", { class: "de-opt-summary" }, [
          el("span", { class: "de-opt-folder-name" }, ["Relevant controls"]),
          el("span", { class: "de-opt-count" }, [`${relevant.length} bound`]),
        ]),
        el(
          "div",
          { class: "de-opt-folder-body" },
          relevant.map((control) => controlRow(control, context.editor))
        ),
      ])
    : null

  const list = el(
    "div",
    {
      role: "radiogroup",
      "aria-label": "Saved options",
      style: "display:flex;flex-direction:column",
    },
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
    el(
      "button",
      {
        class: "de-button",
        type: "button",
        disabled: !store.hasBaseline(context.selection.key),
        title: "Restore this element's state from before its first option",
        onclick: () => store.revert(context.selection, context.writer),
      },
      ["Revert"]
    ),
  ])

  const browse = el(
    "button",
    {
      class: "de-opt-link",
      type: "button",
      title: "Every control, variant and saved option in one list",
      onclick: () => openOptionsBrowser(context.editor),
    },
    ["Browse all…"]
  )

  return section(
    `Controls & options (${options.length})`,
    el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      contextual,
      list,
      actions,
    ]),
    browse
  )
}
