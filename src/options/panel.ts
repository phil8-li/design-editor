/**
 * The selected element's design options, in the right panel.
 *
 * Two things wear that name and this file shows both for one element: the leva
 * controls actually BOUND to it, and the style snapshots saved against it. What
 * it deliberately does not show is everything else the app can be tuned with —
 * that is the browser in `inventory-panel.ts`, one click away, and putting the
 * whole inventory in a panel scoped to a selection is what made the relevant
 * part unfindable.
 *
 * The list and the actions are two sections, and the split is the point. The
 * LIST is absent when the element has no options — a heading over an empty box
 * is a question the panel asks the user instead of answering. The ACTIONS are
 * not, because "save this element's state as an option" is how the first option
 * ever comes to exist, and hanging it off the list means it disappears in
 * exactly the state you need it.
 */

import { el } from "../core/dom"
import { icon } from "../core/icons"
import { section } from "../panels/inspector/field"
import { controlRow, openOptionsBrowser } from "./inventory-panel"
import { isControlRelevantToElement, readInventory } from "./inventory"
import type { LevaControl, LevaFolder } from "./inventory"
import { optionsStore, visibleOptions } from "./store"
import type { InspectorSection, SectionContext } from "../panels/inspector/index"
import type { ElementOption, ElementOptionSet } from "../core/types"

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
    [icon("X", 12)]
  )

  name.addEventListener("dblclick", (event) => {
    event.stopPropagation()
    startRename(name, option, (value) => store.rename(selection.key, option.id, value))
  })

  return el("div", { class: "de-option-row" }, [choice, remove])
}

/**
 * What this element has, asked once.
 *
 * Both sections below turn on the same answer — the list appears exactly when
 * the actions' Update and Revert have something to act on — so asking twice
 * would be two derivations of one fact and the first place they could disagree
 * is a panel that shows an empty list or hides a full one.
 */
interface DesignOptions {
  set: ElementOptionSet | null
  saved: ElementOption[]
  relevant: LevaControl[]
}

function designOptionsFor(context: SectionContext): DesignOptions {
  const store = optionsStore(context.editor)
  void store.ready()
  const set = store.get(context.selection.key)
  const inventory = readInventory()
  return {
    set,
    saved: visibleOptions(set),
    relevant: inventory.available
      ? controlsIn(inventory.sections).filter((control) =>
          isControlRelevantToElement(control, context.selection.element)
        )
      : [],
  }
}

export const optionsSection: InspectorSection = (context) => {
  const { set, saved: options, relevant } = designOptionsFor(context)

  // Nothing bound and nothing saved: no section at all. The alternative is a
  // heading, an empty radiogroup and a line of prose apologising for them, on
  // every element in the app that nobody has tuned — which is most of them, and
  // it pushes Appearance and the rest of the property stack down the panel to
  // make room for an absence.
  if (!relevant.length && !options.length) return null

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

  return section(
    `Design options (${relevant.length + options.length})`,
    el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [contextual, list])
  )
}

/**
 * The footer: what you can DO with options here, and the way out to all of them.
 *
 * Last in the stack and outside the list on purpose. Save is the only path by
 * which an element's first option is ever created, so it cannot live inside a
 * section that is absent until one exists. Update and Revert sit with it because
 * a split action cluster — Save at the foot, Update in a fold halfway up — is
 * harder to read than three buttons that are sometimes disabled.
 */
export const optionsActionsSection: InspectorSection = (context) => {
  const store = optionsStore(context.editor)
  const { set } = designOptionsFor(context)

  return el("div", { class: "de-inspector-footer" }, [
    el("div", { class: "de-row" }, [
      el(
        "button",
        {
          class: "de-button",
          type: "button",
          title: "Save this element's current state as a named option",
          onclick: () => store.saveCurrent(context.selection, context.writer),
        },
        ["Save as option"]
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
    ]),
    el(
      "button",
      {
        class: "de-opt-link",
        type: "button",
        title: "Every control, variant and saved option in one list",
        onclick: () => openOptionsBrowser(context.editor),
      },
      ["All design options"]
    ),
  ])
}
