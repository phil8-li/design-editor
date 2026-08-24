/** Responsive utilities authored directly on the selected element. */

import { config } from "../../core/config"
import { el } from "../../core/dom"
import { responsiveClassBindings } from "../../core/responsive"
import { section, textField } from "./field"
import type { InspectorSection } from "./index"

function utilities(raw: string): string[] {
  return [...new Set(raw.trim().split(/\s+/).filter(Boolean))]
}

function isContainer(element: HTMLElement, computed: CSSStyleDeclaration): boolean {
  const names = Array.from(element.classList)
  const display = computed.display.trim()
  return (
    names.some((name) => name === "@container" || name.startsWith("@container/")) ||
    !["", "normal"].includes(computed.getPropertyValue("container-type").trim()) ||
    (element.childElementCount > 0 &&
      ["block", "flex", "grid", "inline-flex", "inline-grid"].includes(display))
  )
}

/** Container variants belong to descendants, so show them without pretending their thresholds are viewport steps. */
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

export const responsiveSection: InspectorSection = ({ selection, computed, writer, invalidate }) => {
  const classNames = Array.from(selection.element.classList)
  const bindings = responsiveClassBindings(classNames)
  const container = isContainer(selection.element, computed)
  if (!container && bindings.length === 0) return null

  const breakpoints = Object.entries(config.tailwind.breakpoints).sort((a, b) => a[1] - b[1])
  const viewport = window.innerWidth
  const active = [...breakpoints].reverse().find(([, px]) => viewport >= px)?.[0] ?? "base"
  const nested = bindings.filter((binding) => !binding.direct)
  const containerVariants = container ? descendantContainerUtilities(selection.element) : []

  const rows = breakpoints.map(([breakpoint, px]) => {
    const direct = bindings.filter(
      (binding) =>
        binding.context === "viewport" && binding.direct && binding.breakpoint === breakpoint
    )
    const value = direct.map((binding) => binding.utility).join(" ")
    return el("div", { class: "de-stack" }, [
      el("div", { class: "de-layout-group-title" }, [
        `${breakpoint} · ${px}px${active === breakpoint ? " · current" : ""}`,
      ]),
      textField({
        id: `responsive.${breakpoint}`,
        label: `${breakpoint} breakpoint utilities`,
        value,
        placeholder: "e.g. grid-cols-2 gap-6",
        onCommit: (raw) => {
          const next = utilities(raw).map((utility) => `${breakpoint}:${utility}`)
          const remove = direct.map((binding) => binding.original)
          if (
            remove.length === next.length &&
            remove.every((name, index) => name === next[index])
          ) {
            return
          }
          writer.applyClasses(
            selection,
            { remove, add: next },
            `Set ${breakpoint} responsive utilities`
          )
          invalidate()
        },
      }),
    ])
  })

  const notes: HTMLElement[] = [
    el("div", { class: "de-hint" }, [
      `Current viewport: ${viewport}px · ${active}. Base classes and every other breakpoint stay untouched.`,
    ]),
  ]
  if (container) {
    notes.push(
      el("div", { class: "de-hint" }, [
        containerVariants.length
          ? `Container variants in this subtree: ${containerVariants.join(" · ")}`
          : "This layout container has no descendant container-query utilities yet.",
      ])
    )
  }
  if (nested.length) {
    notes.push(
      el("div", { class: "de-hint" }, [
        `Nested/state variants stay unchanged: ${nested.map((binding) => binding.original).join(" · ")}`,
      ])
    )
  }

  return section("Responsive", el("div", { class: "de-stack" }, [...notes, ...rows]))
}
