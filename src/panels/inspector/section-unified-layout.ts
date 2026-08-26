/** Current Figma UI3 groups sizing and auto layout into one Layout section. */

import { el } from "../../core/dom"
import { section } from "./field"
import { layoutSection } from "./section-layout"
import { autoLayoutSection } from "./section-autolayout"
import type { InspectorSection, SectionContext } from "./index"

function group(title: string, node: HTMLElement | null): HTMLElement | null {
  if (!node) return null
  const wrapped = node.lastElementChild
  const content = wrapped?.firstElementChild
  if (!(content instanceof HTMLElement)) return null
  return el("div", { class: "de-layout-group" }, [
    el("div", { class: "de-layout-group-title" }, [title]),
    content,
  ])
}

export const unifiedLayoutSection: InspectorSection = (context: SectionContext) => {
  // Alignment used to lead this stack. It is one of the questions the Position
  // section asks now, next to arrange, which is where it belongs: it describes
  // where the box sits among its siblings, not how the box is sized.
  const groups = [
    group("Size", layoutSection(context)),
    group("Auto layout", autoLayoutSection(context)),
  ].filter((node): node is HTMLElement => node !== null)

  return section("Layout", el("div", { class: "de-stack" }, groups))
}
