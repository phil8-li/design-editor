/**
 * The one surface that answers "what options do we already have?".
 *
 * Two tabs, because the word "option" covers two unrelated things in this
 * codebase and putting them on one list is what made them undiscoverable:
 *
 *   Built controls  — leva's live inventory (sections, folders, controls) and,
 *                     per select control, the literal named variants somebody
 *                     built. Read through `inventory.ts`, editable in place.
 *   Saved variants  — this editor's own per-element style snapshots, the only
 *                     concept that can be deleted and written to source.
 *
 * It mounts its own root rather than a slot so it survives deselection: the
 * inspector unmounts every section when nothing is selected, and a list of
 * everything you have built must not require picking something first.
 */

import { clear, el } from "../core/dom"
import { elementKey, getState } from "../core/store"
import { createWriter } from "../core/writer"
import type { EditorContext } from "../core/context"
import type { ElementOption, ElementOptionSet, Selection } from "../core/types"
import { filterTree, readInventory, setControlValue, subscribeToLeva } from "./inventory"
import type { LevaControl, LevaFolder } from "./inventory"
import { optionsStore, visibleOptions } from "./store"

/** Why each concept can or cannot be written back to source. Shown verbatim. */
const WHY_NOT: Record<string, string> = {
  control:
    "Deleting a leva control means removing its schema entry in " +
    "src/components/workspace/project-shell.tsx, its save-as-default button, every " +
    "consumer of the value, and its BUNDLED_LEVA_DEFAULTS entry. That is a structural " +
    "TypeScript edit; this editor's writer only rewrites Tailwind class strings inside " +
    "JSX, so it would leave the app in a half-edited state. Use the AI panel or open the " +
    "file instead.",
  variant:
    "Removing a named variant (a member of hoverPresetOrder, workspaceThemePresets, " +
    "headerLayoutOptions, …) means editing the options array, its matching defaults map, " +
    "and every switch that consumes it. A partial edit compiles and then throws at " +
    "runtime, so this editor will not attempt it.",
  value:
    "Changing a control here is live and real, but it has no source target: leva values " +
    "feed React props and CSS custom properties, not classNames, and the writer only " +
    "emits Tailwind utilities. The durable target is BUNDLED_LEVA_DEFAULTS — see below.",
  bundled:
    "src/lib/leva-saved-defaults.ts is a plain object literal and could be rewritten, but " +
    "there is no server route for it yet, and the file is digest-locked in " +
    "docs/design-system/source-lock.json — writing it breaks `npm run build` until the " +
    "lock is regenerated. Until that route exists, leva's own `save as default` button is " +
    "the only path, and see the origin warning above.",
}

let mounted: { root: HTMLElement; open(): void; toggle(): void; refresh(): void } | null = null

function note(text: string): HTMLElement {
  return el("p", { class: "de-opt-note" }, [text])
}

/** A dim, always-present "why can't I…" toggle. Never hidden until hover. */
function explainer(label: string, body: string): HTMLElement {
  const text = el("p", { class: "de-opt-why", hidden: true }, [body])
  const button = el(
    "button",
    {
      class: "de-opt-link",
      type: "button",
      "aria-expanded": "false",
      onclick: () => {
        const next = text.hidden
        text.hidden = !next
        button.setAttribute("aria-expanded", String(next))
      },
    },
    [label]
  )
  return el("div", { class: "de-opt-whywrap" }, [button, text])
}

function chips(control: LevaControl, editor: EditorContext): HTMLElement {
  const names = control.variants ?? []
  const values = control.variantValues ?? []
  const buttons: HTMLElement[] = names.map((name, index) =>
    el(
      "button",
      {
        class: "de-opt-chip",
        type: "button",
        "aria-pressed": String(values[index] === control.value),
        title: `Set ${control.path} to "${name}"`,
        onclick: () => {
          if (!setControlValue(control.path, values[index])) {
            editor.toast(`Leva rejected "${name}" for ${control.key}`, "error")
            return
          }
          // Repaint the pressed state in place rather than re-rendering: a
          // rebuild would drop the focus the user just put on this chip.
          for (const [other, button] of buttons.entries()) {
            button.setAttribute("aria-pressed", String(other === index))
          }
        },
      },
      [name]
    )
  )
  return el(
    "div",
    { class: "de-opt-chips", role: "group", "aria-label": `${control.label} variants` },
    buttons
  )
}

function valueEditor(control: LevaControl, editor: EditorContext): HTMLElement {
  const commit = (value: unknown) => {
    if (setControlValue(control.path, value)) return
    editor.toast(`Leva rejected that value for ${control.key}`, "error")
  }

  if (control.type === "BOOLEAN") {
    const input = el("input", { type: "checkbox", "aria-label": control.label }) as HTMLInputElement
    input.checked = control.value === true
    input.addEventListener("change", () => commit(input.checked))
    return el("label", { class: "de-opt-check" }, [input, control.value === true ? "on" : "off"])
  }

  if (control.type === "NUMBER" || control.type === "STRING" || control.type === "COLOR") {
    const numeric = control.type === "NUMBER"
    const input = el("input", {
      class: "de-opt-input",
      type: "text",
      inputmode: numeric ? "decimal" : undefined,
      "aria-label": `${control.label} value`,
      value: control.valueText,
    }) as HTMLInputElement
    const send = () => {
      if (!numeric) return commit(input.value)
      const parsed = Number.parseFloat(input.value)
      if (!Number.isNaN(parsed)) commit(parsed)
    }
    input.addEventListener("change", send)
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return
      event.preventDefault()
      send()
      input.blur()
    })
    return input
  }

  return el("span", { class: "de-opt-value" }, [control.valueText])
}

function controlRow(control: LevaControl, editor: EditorContext): HTMLElement {
  return el("div", { class: "de-opt-row", "data-hidden": control.visible ? undefined : "" }, [
    el("div", { class: "de-opt-head" }, [
      el("span", { class: "de-opt-label", title: control.label }, [control.label]),
      el("span", { class: "de-opt-type" }, [control.type.toLowerCase()]),
      control.visible ? null : el("span", { class: "de-opt-tag" }, ["hidden now"]),
    ]),
    el("code", { class: "de-opt-path", title: "Leva path" }, [control.path]),
    control.variants ? chips(control, editor) : valueEditor(control, editor),
    explainer("Delete this control?", WHY_NOT.control),
  ])
}

function folderNode(
  folder: LevaFolder,
  editor: EditorContext,
  depth: number,
  expand: boolean
): HTMLElement {
  const summary = el("summary", { class: "de-opt-summary" }, [
    el("span", { class: "de-opt-folder-name" }, [folder.name]),
    el("span", { class: "de-opt-count" }, [
      `${folder.controlCount} control${folder.controlCount === 1 ? "" : "s"}` +
        (folder.variantCount ? ` · ${folder.variantCount} variants` : ""),
    ]),
    folder.hasSaveDefault
      ? el("span", { class: "de-opt-tag de-opt-tag--saved", title: WHY_NOT.bundled }, ["default"])
      : null,
  ])

  const body = el("div", { class: "de-opt-folder-body" }, [
    ...folder.controls.map((control) => controlRow(control, editor)),
    ...folder.folders.map((child) => folderNode(child, editor, depth + 1, expand)),
  ])

  return el("details", { class: "de-opt-folder", open: expand || depth > 0 }, [summary, body])
}

function levaTab(editor: EditorContext, query: string): HTMLElement {
  const inventory = readInventory()
  if (!inventory.available) {
    return el("div", { class: "de-opt-body" }, [el("div", { class: "de-empty" }, [inventory.reason])])
  }

  const sections = filterTree(inventory.sections, query)
  return el("div", { class: "de-opt-body" }, [
    note(
      `${inventory.controlCount} controls in ${inventory.sections.length} sections, ` +
        `${inventory.selectCount} of them variant pickers offering ${inventory.variantCount} ` +
        `named variants. Changing anything here is live, exactly as if you moved the ` +
        `control in Leva's own panel.`
    ),
    note(
      `Leva's own "save as default" writes localStorage for ${location.origin}. The design ` +
        `editor is a proxy origin, so anything saved that way is invisible to the app's own ` +
        `origin and to the deploy snapshot. This panel never uses localStorage.`
    ),
    ...(sections.length
      ? sections.map((section) => folderNode(section, editor, 0, query.trim().length > 0))
      : [el("div", { class: "de-empty" }, [`Nothing matches "${query}".`])]),
    explainer("Why can't I save a control's value to code?", WHY_NOT.value),
    explainer("Why can't I delete a named variant?", WHY_NOT.variant),
  ])
}

/**
 * Finds the live element a saved set belongs to. Only the tag of the key's last
 * step is used as a pre-filter, because asking the engine to resolve a fiber for
 * every node in the document is far more expensive than a querySelector.
 */
function findElement(editor: EditorContext, key: string): HTMLElement | null {
  const current = editor.primarySelection()
  if (current?.key === key) return current.element

  const lastStep = key.split("/").pop() ?? ""
  const tag = /^([a-z][a-z0-9-]*)\d+$/.exec(lastStep)?.[1]
  if (!tag) return null

  for (const node of Array.from(document.body.querySelectorAll<HTMLElement>(tag))) {
    const info = editor.bridge.elementInfo(node)
    const name = info?.componentName || node.tagName.toLowerCase()
    if (elementKey(node, name, info?.lineNumber ?? 0) === key) return node
  }
  return null
}

/** The toolbar's commit, reachable from here so a variant is one click away. */
function applyToCode(editor: EditorContext): void {
  const store = editor.bridge.store
  if (!store.hasChanges()) {
    editor.toast("Nothing to apply — apply an option first")
    return
  }
  const operations = store.buildBatchOperations()
  if (!operations.length) {
    editor.toast("Could not resolve source files for these changes", "error")
    return
  }
  editor.bridge.send({ type: "commitBatch", operations })
  editor.toast(`Writing ${operations.length} change${operations.length === 1 ? "" : "s"} to source…`)
}

function variantRow(
  editor: EditorContext,
  set: ElementOptionSet,
  option: ElementOption,
  resolve: () => Selection | null
): HTMLElement {
  const store = optionsStore(editor)
  const writer = createWriter(editor.bridge)
  const act = (fn: (selection: Selection) => void) => {
    const selection = resolve()
    if (!selection) {
      editor.toast("That element is not on this page right now", "error")
      return
    }
    fn(selection)
  }

  return el("div", { class: "de-opt-row de-opt-row--variant" }, [
    el("div", { class: "de-opt-head" }, [
      el("span", { class: "de-opt-label" }, [option.name]),
      option.id === set.activeOptionId ? el("span", { class: "de-opt-tag" }, ["active"]) : null,
    ]),
    el("div", { class: "de-opt-actions" }, [
      el(
        "button",
        { class: "de-button", type: "button", onclick: () => act((s) => store.apply(s, writer, option)) },
        ["Apply"]
      ),
      el(
        "button",
        {
          class: "de-button de-button--primary",
          type: "button",
          title: "Apply this option, then write its classes into the JSX",
          onclick: () =>
            act((s) => {
              store.apply(s, writer, option)
              applyToCode(editor)
            }),
        },
        ["Apply to code"]
      ),
      el(
        "button",
        {
          class: "de-button de-button--danger",
          type: "button",
          title: "Delete this saved variant and restore the element's pre-option state",
          onclick: () => act((s) => store.remove(s, writer, option.id)),
        },
        ["Delete"]
      ),
    ]),
  ])
}

function variantsTab(editor: EditorContext, query: string): HTMLElement {
  const store = optionsStore(editor)
  const writer = createWriter(editor.bridge)
  const needle = query.trim().toLowerCase()
  const sets = Object.values(getState().optionSets).filter((set) => {
    if (!needle) return true
    if (set.key.toLowerCase().includes(needle) || set.label.toLowerCase().includes(needle)) return true
    return visibleOptions(set).some((option) => option.name.toLowerCase().includes(needle))
  })

  if (sets.length === 0) {
    return el("div", { class: "de-opt-body" }, [
      el("div", { class: "de-empty" }, [
        needle
          ? `No saved variants match "${query}".`
          : "No saved variants yet. Select an element, restyle it, then press " +
            "“Save current as option” in the inspector.",
      ]),
    ])
  }

  return el("div", { class: "de-opt-body" }, [
    note(
      "These are this editor's own per-element style snapshots — the only kind of option " +
        "that can be deleted and written back to source, because they are just Tailwind " +
        "classes on one JSX element. They persist through the loopback server, not " +
        "localStorage, so they are the same on every origin."
    ),
    ...sets.map((set) => {
      let cachedElement: HTMLElement | null = null
      const resolve = (): Selection | null => {
        cachedElement ??= findElement(editor, set.key)
        if (!cachedElement?.isConnected) cachedElement = findElement(editor, set.key)
        if (!cachedElement) return null
        editor.select(cachedElement)
        return editor.primarySelection()
      }

      return el("details", { class: "de-opt-folder", open: true }, [
        el("summary", { class: "de-opt-summary" }, [
          el("span", { class: "de-opt-folder-name" }, [set.label]),
          el("span", { class: "de-opt-count" }, [`${visibleOptions(set).length} saved`]),
          store.hasBaseline(set.key)
            ? el("span", { class: "de-opt-tag de-opt-tag--saved", title: "Revert point is stored" }, [
                "revertable",
              ])
            : null,
        ]),
        el("div", { class: "de-opt-folder-body" }, [
          el("code", { class: "de-opt-path" }, [set.key]),
          ...visibleOptions(set).map((option) => variantRow(editor, set, option, resolve)),
          el("div", { class: "de-opt-actions" }, [
            el(
              "button",
              {
                class: "de-button",
                type: "button",
                title: "Restore the element's state from before its first option",
                onclick: () => {
                  const selection = resolve()
                  if (!selection) {
                    editor.toast("That element is not on this page right now", "error")
                    return
                  }
                  if (!store.revert(selection, writer)) editor.toast("No baseline stored", "error")
                },
              },
              ["Revert element"]
            ),
          ]),
        ]),
      ])
    }),
  ])
}

export function installOptionsBrowser(editor: EditorContext): void {
  if (mounted) return

  let tab: "leva" | "variants" = "leva"
  let query = ""

  const body = el("div", { class: "de-opt-scroll" })
  const filter = el("input", {
    class: "de-opt-filter",
    type: "search",
    placeholder: "Filter by name, path, value or variant…",
    "aria-label": "Filter options",
  }) as HTMLInputElement

  const levaButton = el("button", { class: "de-opt-tab", type: "button" }, ["Built controls"])
  const variantButton = el("button", { class: "de-opt-tab", type: "button" }, ["Saved variants"])

  const render = () => {
    levaButton.setAttribute("aria-pressed", String(tab === "leva"))
    variantButton.setAttribute("aria-pressed", String(tab === "variants"))
    clear(body)
    body.append(tab === "leva" ? levaTab(editor, query) : variantsTab(editor, query))
  }

  const setTab = (next: "leva" | "variants") => {
    tab = next
    render()
  }
  levaButton.addEventListener("click", () => setTab("leva"))
  variantButton.addEventListener("click", () => setTab("variants"))
  filter.addEventListener("input", () => {
    query = filter.value
    render()
  })

  const panel = el("section", { class: "de-opt-window", role: "dialog", "aria-label": "Design options", hidden: true }, [
    el("header", { class: "de-opt-header" }, [
      el("span", { class: "de-opt-title" }, ["Design options"]),
      el(
        "button",
        { class: "de-opt-close", type: "button", "aria-label": "Close", onclick: () => close() },
        ["×"]
      ),
    ]),
    el("div", { class: "de-opt-tabs", role: "group", "aria-label": "Option kind" }, [
      levaButton,
      variantButton,
    ]),
    filter,
    body,
  ])

  const launcher = el(
    "button",
    {
      class: "de-opt-launcher",
      type: "button",
      "aria-expanded": "false",
      title: "Browse everything this app can be tuned with",
    },
    ["Design options"]
  )

  const root = el("div", { class: "de-options-root" }, [panel, launcher])
  document.body.append(root)

  function open(): void {
    panel.hidden = false
    launcher.setAttribute("aria-expanded", "true")
    render()
    filter.focus()
  }
  function close(): void {
    panel.hidden = true
    launcher.setAttribute("aria-expanded", "false")
  }
  launcher.addEventListener("click", () => (panel.hidden ? open() : close()))

  const refresh = () => {
    // Invariant 5: never rebuild a surface out from under a focused control.
    // Leva fires on every drag frame, and the filter box lives in here.
    if (panel.hidden || root.contains(document.activeElement)) return
    render()
  }

  let scheduled = 0
  const schedule = () => {
    if (scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      refresh()
    })
  }
  subscribeToLeva(schedule)
  editor.subscribe((next, previous) => {
    if (next.optionSets === previous.optionSets) return
    schedule()
  })

  mounted = { root, open, toggle: () => (panel.hidden ? open() : close()), refresh: schedule }
  void optionsStore(editor).ready()
}

/** Mounts on first use so the browser exists even before anything is selected. */
export function openOptionsBrowser(editor: EditorContext): void {
  installOptionsBrowser(editor)
  mounted?.open()
}
