/** Responsive utilities authored directly on the selected element. */

import { config } from "../../core/config"
import { el } from "../../core/dom"
import {
  activeBreakpoint,
  breakpointSteps,
  containerBreakpointSteps,
  responsiveClassBindings,
  type ResponsiveClassBinding,
} from "../../core/responsive"
import { isExpanded, miniButton, section, setExpanded, textField } from "./field"
import type { InspectorSection } from "./index"

const CONTAINER_EXPANDER = "responsive.container-breakpoints"

function utilities(raw: string): string[] {
  return [...new Set(raw.trim().split(/\s+/).filter(Boolean))]
}

/** Any box that already holds a layout can carry a breakpoint utility. */
function isLayoutBox(element: HTMLElement, computed: CSSStyleDeclaration): boolean {
  return (
    element.childElementCount > 0 &&
    ["block", "flex", "grid", "inline-flex", "inline-grid"].includes(computed.display.trim())
  )
}

interface ContainerScope {
  /** `@container/sidebar` names its scope; a bare `@container` does not. */
  name: string | null
  /** True when the selected element is the container, not merely inside one. */
  self: boolean
  /** Border-box width when layout has produced one. */
  width: number | null
}

/**
 * The nearest container-query scope the selection sits in.
 *
 * Tailwind writes the scope as a class, so the class is the reliable signal;
 * `container-type` is the second read for a host that declared the scope in its
 * own CSS instead. Walking up matters because a `@md:` utility on the SELECTED
 * element resolves against an ancestor's width, not its own.
 */
function containerScope(element: HTMLElement): ContainerScope | null {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const named = Array.from(node.classList).find(
      (name) => name === "@container" || name.startsWith("@container/")
    )
    const style = getComputedStyle(node)
    if (!named) {
      const declared = style.getPropertyValue("container-type").trim()
      if (["", "normal"].includes(declared)) continue
    }
    const cssName = style.getPropertyValue("container-name").trim()
    const measured = node.getBoundingClientRect().width || node.clientWidth
    return {
      name: named?.split("/")[1] ?? (!["", "none"].includes(cssName) ? cssName.split(/\s+/)[0] : null),
      self: node === element,
      width: measured > 0 ? measured : null,
    }
  }
  return null
}

/** Container variants on descendants, so the subtree's own scale is visible from here. */
function descendantContainerUtilities(element: HTMLElement): string[] {
  const found = new Set<string>()
  let visited = 0
  for (const node of Array.from(element.querySelectorAll<HTMLElement>("*"))) {
    if (visited++ >= 2000 || found.size >= 12) break
    for (const name of Array.from(node.classList)) {
      if (name.startsWith("@") && name.includes(":")) found.add(name)
      if (found.size >= 12) break
    }
  }
  return [...found]
}

interface RowSpec {
  id: string
  label: string
  title: string
  usage?: string
  owner?: string
  note?: string
  /** What every utility typed into this row is prefixed with. */
  prefix: string
  bindings: ResponsiveClassBinding[]
  summary: string
}

export const responsiveSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const bindings = responsiveClassBindings(Array.from(selection.element.classList))
  const scope = containerScope(selection.element)
  if (!scope && !isLayoutBox(selection.element, computed) && bindings.length === 0) return null

  const viewportSteps = breakpointSteps()
  const containerSteps = containerBreakpointSteps()
  const viewport = window.innerWidth
  const active = activeBreakpoint(viewport, viewportSteps)
  const activeContainer = scope?.width ? activeBreakpoint(scope.width, containerSteps) : null
  const nested = bindings.filter((binding) => !binding.direct)
  const containerBindings = bindings.filter((binding) => binding.context === "container")
  const authored = (context: ResponsiveClassBinding["context"], name: string) =>
    bindings.filter(
      (binding) => binding.context === context && binding.direct && binding.breakpoint === name
    )

  const row = (spec: RowSpec) =>
    el("div", { class: "de-stack" }, [
      el("div", { class: "de-layout-group-title" }, [spec.title]),
      spec.usage ? el("div", { class: "de-hint" }, [spec.usage]) : null,
      spec.owner ? el("div", { class: "de-source" }, [spec.owner]) : null,
      spec.note ? el("div", { class: "de-hint" }, [spec.note]) : null,
      textField({
        id: spec.id,
        label: spec.label,
        value: spec.bindings.map((binding) => binding.utility).join(" "),
        placeholder: "e.g. grid-cols-2 gap-6",
        onCommit: (raw) => {
          const next = utilities(raw).map((utility) => `${spec.prefix}${utility}`)
          const remove = spec.bindings.map((binding) => binding.original)
          if (
            remove.length === next.length &&
            remove.every((name, index) => name === next[index])
          ) {
            return
          }
          writer.applyClasses(selection, { remove, add: next }, spec.summary)
          invalidate()
        },
      }),
    ])

  const viewportRows = viewportSteps.map((step) =>
    row({
      id: `responsive.${step.name}`,
      label: `${step.name} breakpoint utilities`,
      title: `${step.name} · ${step.px}px and up${active?.name === step.name ? " · active now" : ""}`,
      usage: step.usage,
      owner: step.owner,
      // An undocumented prefix is still offered — it compiles, and hiding it
      // would make the panel lie about what the source can say — but it is not
      // dressed up as a decision the design system made.
      note: step.documented ? undefined : "Compiles, but this design system declares no step here.",
      prefix: step.prefix,
      bindings: authored("viewport", step.name),
      summary: `Set ${step.name} responsive utilities`,
    })
  )

  const containerContext = Boolean(scope || containerBindings.length)
  const showAllContainers = isExpanded(CONTAINER_EXPANDER)
  const defaultContainerSteps = containerSteps.filter(
    (step) => step.documented || authored("container", step.name).length > 0
  )
  const visibleContainerSteps = showAllContainers ? containerSteps : defaultContainerSteps
  const containerRows = containerContext
    ? visibleContainerSteps.map((step) => {
        const rowBindings = authored("container", step.name)
        const basePrefix = step.prefix.endsWith(":") ? step.prefix.slice(0, -1) : step.prefix
        return row({
          id: `responsive.@${step.name}`,
          label: `@${step.name} container utilities`,
          title: `@${step.name} · ${step.px}px and up${activeContainer?.name === step.name ? " · active now" : ""}`,
          usage: step.usage,
          owner: step.owner,
          note: step.documented ? undefined : "Compiles, but this design system declares no container step here.",
          // The first existing variant's own prefix wins, so a row authored
          // against a NAMED container keeps its name instead of being silently
          // retargeted at the nearest one.
          prefix: rowBindings[0]?.prefix ?? `${basePrefix}${scope?.name ? `/${scope.name}` : ""}:`,
          bindings: rowBindings,
          summary: `Set @${step.name} container utilities`,
        })
      })
    : []

  const descendants = descendantContainerUtilities(selection.element)
  const notes: HTMLElement[] = [
    el("div", { class: "de-hint" }, [
      `Viewport ${viewport}px · ${active ? `${active.name} is the active step` : "below every step"}. Base classes and every other breakpoint stay untouched.`,
    ]),
  ]
  if (nested.length) {
    notes.push(
      el("div", { class: "de-hint" }, [
        `Nested/state variants stay unchanged: ${nested.map((binding) => binding.original).join(" · ")}`,
      ])
    )
  }

  const containerToggle = containerContext && containerSteps.length > defaultContainerSteps.length
    ? miniButton({
        label: showAllContainers ? "Show documented and authored container steps" : "Show all container steps",
        glyph: showAllContainers ? "⊟" : "⊞",
        pressed: showAllContainers,
        onClick: () => {
          setExpanded(CONTAINER_EXPANDER, !showAllContainers)
          invalidate()
        },
      })
    : null
  const containerNotes: HTMLElement[] = containerContext
    ? [
        el("div", { class: "de-row" }, [
          el("div", { class: "de-layout-group-title", style: "flex:1" }, ["Container queries"]),
          containerToggle,
        ]),
      ]
    : []
  if (scope) {
    containerNotes.push(
      el("div", { class: "de-hint" }, [
        `${scope.self ? "This element is" : "Inside"} @container${scope.name ? `/${scope.name}` : ""}. These steps measure that container's width, not the window's.`,
      ]),
      el("div", { class: "de-hint" }, [
        scope.width === null
          ? "Nearest container width is not measurable in this preview."
          : `Nearest container width: ${Math.round(scope.width)}px · ${activeContainer ? `${activeContainer.name} is the active container step` : "below every container step"}.`,
      ])
    )
  } else if (containerBindings.length) {
    containerNotes.push(
      el("div", { class: "de-hint" }, [
        "Container-query utilities are authored, but no container scope was found in this preview.",
      ])
    )
  }
  if (descendants.length) {
    containerNotes.push(
      el("div", { class: "de-hint" }, [
        `Container variants in this subtree: ${descendants.join(" · ")}`,
      ])
    )
  } else if (scope?.self) {
    containerNotes.push(
      el("div", { class: "de-hint" }, [
        "This container has no descendant container-query utilities yet.",
      ])
    )
  }

  const measureRows = config.designSystem.responsiveMeasures.map((measure) =>
    el("div", { class: "de-stack", "data-de-responsive-measure": measure.id }, [
      el("div", { class: "de-layout-group-title" }, [measure.name]),
      el("div", { class: "de-source" }, [measure.formula]),
      el("div", { class: "de-hint" }, [measure.usage]),
      el("div", { class: "de-source" }, [measure.owner]),
    ])
  )

  return section(
    "Responsive",
    el("div", { class: "de-stack" }, [
      ...notes,
      ...viewportRows,
      ...containerNotes,
      ...containerRows,
      ...(measureRows.length
        ? [
            el("div", { class: "de-layout-group" }, [
              el("div", { class: "de-layout-group-title" }, ["Responsive measures"]),
              ...measureRows,
            ]),
          ]
        : []),
    ])
  )
}
