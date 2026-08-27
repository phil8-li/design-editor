/**
 * Right-hand inspector.
 *
 * Three tabs over one selection. **Design** is the historical panel: a stack
 * of collapsible sections, each owning one file, each returning `null` when it
 * has nothing to say about the current selection — which keeps the panel as
 * short as the element is simple. **Code** shows that same selection as
 * source, and **Change prompts** holds the queue of edits the writer cannot
 * express as classes.
 *
 * They are tabs rather than three more sections because they are not more to
 * scroll past: each is a different thing to be looking at, and two of them own
 * a footer that has to stay put while their body scrolls.
 */

import { onPreviewOnlyChange } from "../../core/change-prompt"
import { clear, el } from "../../core/dom"
import { icon, type IconName } from "../../core/icons"
import { createWriter, type Writer } from "../../core/writer"
import type { EditorContext } from "../../core/context"
import type { Selection } from "../../core/types"

import { codeTab, type InspectorTab } from "./tab-code"
import { promptsTab } from "./tab-prompts"
import { iconSection } from "./section-icon"
import { variantsSection } from "./section-variants"
import { positionSection } from "./section-position"
import { unifiedLayoutSection } from "./section-unified-layout"
import { designSystemSection } from "./section-design-system"
import { responsiveSection } from "./section-responsive"
import { appearanceSection } from "./section-appearance"
import { fillSection } from "./section-fill"
import { strokeSection } from "./section-stroke"
import { effectsSection } from "./section-effects"
import { typographySection } from "./section-typography"
import { classesSection } from "./section-classes"
import { optionsActionsSection, optionsSection } from "../../options/panel"
import { openOptionsBrowser } from "../../options/inventory-panel"
import { aiSection } from "../../ai/panel"

export interface SectionContext {
  editor: EditorContext
  writer: Writer
  selection: Selection
  /** Computed style of the selected element, read once per render. */
  computed: CSSStyleDeclaration
  /** Re-renders the inspector after a write. */
  invalidate(): void
}

export type InspectorSection = (context: SectionContext) => HTMLElement | null

/** Figma's own top-to-bottom order, minus the sections with no DOM analogue. */
const SECTIONS: InspectorSection[] = [
  // First, like Figma's instance properties: the first question about a placed
  // symbol is which symbol it is.
  iconSection,
  // Directly under it, the way Figma stacks an instance's block: the main
  // component swap first, then the variant properties that component declares.
  variantsSection,
  optionsSection,
  designSystemSection,
  responsiveSection,
  // Above layout, the way every editor stacks it: where the thing sits and how
  // it lines up with its siblings is the first question, and it is answerable
  // without knowing anything about the box's own internals.
  positionSection,
  unifiedLayoutSection,
  appearanceSection,
  fillSection,
  strokeSection,
  effectsSection,
  typographySection,
  classesSection,
  aiSection,
  // Last, and always drawn: the options actions outlive the options list, which
  // is absent until the element has one. See `options/panel.ts`.
  optionsActionsSection,
]

interface FocusMemory {
  /** `data-de-field` identity, when the control declared one. */
  field: string | null
  /** Child-index path from the panel host — the fallback for controls without one. */
  path: number[]
  start: number | null
  end: number | null
}

function indexPath(host: HTMLElement, node: Element): number[] {
  const path: number[] = []
  for (let step: Element | null = node; step && step !== host; step = step.parentElement) {
    const parent = step.parentElement
    if (!parent) return []
    path.unshift(Array.prototype.indexOf.call(parent.children, step))
  }
  return path
}

function nodeAtPath(host: HTMLElement, path: number[]): HTMLElement | null {
  let node: Element | undefined = host
  for (const index of path) {
    node = node?.children[index]
    if (!node) return null
  }
  return node instanceof HTMLElement ? node : null
}

function captureFocus(host: HTMLElement): FocusMemory | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !host.contains(active)) return null
  const text = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  return {
    field: active.getAttribute("data-de-field"),
    path: indexPath(host, active),
    start: text ? active.selectionStart : null,
    end: text ? active.selectionEnd : null,
  }
}

/**
 * Puts the caret back after a rebuild.
 *
 * Every commit re-renders the whole panel, so without this the field you just
 * typed into is a detached node and focus has fallen to `<body>` — which makes
 * Tab-between-fields, Enter-to-commit, and repeated arrow nudges all impossible.
 */
function restoreFocus(host: HTMLElement, memory: FocusMemory | null): void {
  if (!memory) return
  // Matched by string compare rather than an attribute selector: field ids are
  // dotted (`appearance.radius.tl`), and building a selector from them means
  // escaping, which is one more thing to get wrong for no gain at this size.
  const byField = memory.field
    ? [...host.querySelectorAll<HTMLElement>("[data-de-field]")].find(
        (node) => node.getAttribute("data-de-field") === memory.field
      ) ?? null
    : null
  const target = byField ?? nodeAtPath(host, memory.path)
  if (!target || !target.isConnected) return
  target.focus({ preventScroll: true })
  if (memory.start === null) return
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
  const limit = target.value.length
  target.setSelectionRange(Math.min(memory.start, limit), Math.min(memory.end ?? memory.start, limit))
}

interface TabDefinition {
  id: string
  label: string
  glyph: IconName
  tab: InspectorTab
}

export function installInspector(editor: EditorContext): void {
  const writer = createWriter(editor.bridge)
  const host = el("div")

  /*
   * Design is a tab like the other two, but its body is built by `render()`
   * rather than by a controller — so it hands over the same `{node, update}`
   * shape and the strip below never has to know which is which.
   */
  const design: InspectorTab = { node: host, update: () => render() }
  const tabs: TabDefinition[] = [
    { id: "design", label: "Design", glyph: "SlidersHorizontal", tab: design },
    { id: "code", label: "Code", glyph: "Code", tab: codeTab(editor) },
    { id: "prompts", label: "Prompts", glyph: "Sparkles", tab: promptsTab(editor) },
  ]

  let activeId = tabs[0].id
  const buttons = new Map<string, HTMLElement>()
  const panels = new Map<string, HTMLElement>()

  const strip = el("div", { class: "de-tabs", role: "tablist", "aria-label": "Inspector views" })
  for (const definition of tabs) {
    const button = el(
      "button",
      {
        class: "de-tab",
        type: "button",
        role: "tab",
        id: `de-tab-${definition.id}`,
        "aria-controls": `de-tabpanel-${definition.id}`,
        "aria-selected": String(definition.id === activeId),
        onclick: () => activate(definition.id),
      },
      [icon(definition.glyph, 13), definition.label]
    )
    buttons.set(definition.id, button)
    strip.append(button)

    const panel = el(
      "div",
      {
        class: "de-tabpanel",
        role: "tabpanel",
        id: `de-tabpanel-${definition.id}`,
        "aria-labelledby": `de-tab-${definition.id}`,
      },
      [definition.tab.node]
    )
    panel.hidden = definition.id !== activeId
    panels.set(definition.id, panel)
  }

  editor.slots.right.append(strip, ...panels.values())

  /**
   * Switching tabs updates the tab you switch TO, and only that one.
   *
   * The hidden panes keep their DOM — losing the code view's scroll position
   * every time you glance at the design tab would make the pair unusable — but
   * a hidden pane is not re-read on every write either, which is what keeps the
   * ledger and the code view off the hot path of a scrub.
   */
  function activate(id: string): void {
    activeId = id
    for (const definition of tabs) {
      const selected = definition.id === id
      buttons.get(definition.id)?.setAttribute("aria-selected", String(selected))
      const panel = panels.get(definition.id)
      if (panel) panel.hidden = !selected
    }
    tabs.find((definition) => definition.id === id)?.tab.update()
  }

  let scheduled = 0
  const invalidate = () => {
    if (scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      tabs.find((definition) => definition.id === activeId)?.tab.update()
    })
  }

  function render(): void {
    const focus = captureFocus(host)
    clear(host)
    const selection = editor.primarySelection()

    // Nothing selected is not nothing to do. With no element to scope them to,
    // the panel cannot show the relevant options — so it offers all of them, in
    // one press. This calls the browser directly rather than announcing an
    // intention on `window`: the listener only exists once the browser has been
    // mounted, and the browser is mounted lazily, so on a cold load the event
    // went nowhere and the button did nothing.
    if (!selection) {
      host.append(
        el("div", { class: "de-empty" }, [
          el("div", {}, ["Select an element on the canvas, or pick a layer, to edit it here."]),
          el(
            "button",
            {
              class: "de-button",
              type: "button",
              style: "margin-top:10px",
              onclick: () => openOptionsBrowser(editor),
            },
            ["Browse all design options"]
          ),
        ])
      )
      return
    }

    host.append(
      el("div", { class: "de-section" }, [
        el("div", { class: "de-section-header" }, [
          el("span", {}, [selection.componentName]),
          el("span", { class: "de-tagname" }, [`<${selection.tagName}>`]),
        ]),
        selection.source
          ? el("div", { class: "de-section-body de-source" }, [
              `${selection.source.filePath.split("/").slice(-2).join("/")}:${selection.source.lineNumber}`,
            ])
          : null,
      ])
    )

    const context: SectionContext = {
      editor,
      writer,
      selection,
      computed: getComputedStyle(selection.element),
      invalidate,
    }

    for (const section of SECTIONS) {
      let node: HTMLElement | null = null
      try {
        node = section(context)
      } catch (error) {
        console.warn("[design-editor] inspector section failed", error)
      }
      if (node) host.append(node)
    }

    restoreFocus(host, focus)
  }

  // Rebuild only when what the inspector shows actually changed. `hovered` is
  // written on every pointermove; rebuilding on it would tear the focused
  // control out of the DOM mid-edit and drop a drag-scrub's pointer capture.
  editor.subscribe((next, previous) => {
    if (
      next.selection === previous.selection &&
      next.optionSets === previous.optionSets
    ) {
      return
    }
    invalidate()
  })
  editor.onRefresh(invalidate)
  /*
   * The ledger keeps its own time, and it is nobody else's.
   *
   * A write that turns out to have no file to land in reaches the ledger from
   * `ensureSource(...).then(...)` in the writer, long after the store settled
   * and long after the edit that caused it. Neither the subscription above nor
   * `onRefresh` fires for that, so the Prompts tab could be sitting open,
   * already rendered from an empty ledger, insisting there was nothing to hand
   * over while the change was on screen behind it.
   *
   * Only when Prompts is the tab being looked at. `invalidate()` repaints
   * whichever tab is active, and a ledger write says nothing whatsoever about
   * the Design or Code views — repainting either of them on a write they do not
   * show is exactly the hot-path cost `activate()` is written to avoid. A
   * hidden Prompts pane needs nothing: switching to it updates it.
   *
   * Routed through `invalidate()` rather than rendering here so the repaint
   * lands on the next frame. A commit carrying four properties records four
   * times, and the recording happens mid-write — a synchronous render would
   * rebuild the panel three times for nothing and do it inside the writer's own
   * loop, with the element half-styled.
   */
  onPreviewOnlyChange(() => {
    if (activeId === "prompts") invalidate()
  })
  // Every tab once at boot, so a tab that is switched to before the first write
  // is not empty. After this, only the visible one is kept current.
  for (const definition of tabs) definition.tab.update()
}
