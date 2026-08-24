/** Responsive utilities authored directly on the selected element. */

import { el } from "../../core/dom"
import {
  activeBreakpoint,
  breakpointSteps,
  responsiveClassBindings,
  type ResponsiveClassBinding,
} from "../../core/responsive"
import { section, textField } from "./field"
import type { InspectorSection } from "./index"

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
    if (!named) {
      const declared = getComputedStyle(node).getPropertyValue("container-type").trim()
      if (["", "normal"].includes(declared)) continue
    }
    return { name: named?.split("/")[1] ?? null, self: node === element }
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

  const steps = breakpointSteps()
  const viewport = window.innerWidth
  const active = activeBreakpoint(viewport, steps)
  const nested = bindings.filter((binding) => !binding.direct)
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

  const viewportRows = steps.map((step) =>
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

  const containerRows = scope
    ? steps.map((step) => {
        const rowBindings = authored("container", step.name)
        return row({
          id: `responsive.@${step.name}`,
          label: `@${step.name} container utilities`,
          title: `@${step.name} · container width`,
          // The first existing variant's own prefix wins, so a row authored
          // against a NAMED container keeps its name instead of being silently
          // retargeted at the nearest one.
          prefix: rowBindings[0]?.prefix ?? `@${step.name}${scope.name ? `/${scope.name}` : ""}:`,
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

  const containerNotes: HTMLElement[] = scope
    ? [
        el("div", { class: "de-layout-group-title" }, ["Container queries"]),
        el("div", { class: "de-hint" }, [
          `${scope.self ? "This element is" : "Inside"} @container${scope.name ? `/${scope.name}` : ""}. These steps measure that container's width, not the window's.`,
        ]),
      ]
    : []
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

  return section(
    "Responsive",
    el("div", { class: "de-stack" }, [
      ...notes,
      ...viewportRows,
      ...containerNotes,
      ...containerRows,
    ])
  )
}
