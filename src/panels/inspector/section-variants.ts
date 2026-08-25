/**
 * The variants section: which variant of this component the selected instance
 * is, and the other options its source declares.
 *
 * Figma's instance-properties block. It sits directly under the icon section
 * for the same reason Figma puts the main-component swap above the property
 * rows: "which symbol is this" is answered first, and "which of its declared
 * options is it set to" second.
 *
 * A couple of things this section deliberately does NOT do:
 *
 * - It does not write the `variant` prop. That is the Figma-correct semantic and
 *   the one a designer expects, but the pinned rewrite engine
 *   (react-rewrite-cli@0.1.1) has exactly four source operations —
 *   `updateClass`, `updateText`, `reorder`, `moveSpacing` — and none of them
 *   edits a JSX attribute. So choosing an option swaps the classes that option
 *   contributes, which the existing class operation does land on disk, and the
 *   note under the axes says so rather than letting the panel imply otherwise.
 * - It does not guess. An instance whose class list matches none of an axis's
 *   options reads as "Mixed", because a call site that overrode the variant's
 *   classes is a real state and calling it "Default" would be a lie the next
 *   click acts on.
 */

import { loadVariants, loadedVariants, matchDeclaration, currentOption, variantClassWrite, type VariantAxis } from "../../core/variants"
import { el } from "../../core/dom"
import { section, selectField } from "./field"
import { tokenField, type TokenChoice } from "./token-picker"
import type { InspectorSection, SectionContext } from "./index"

/**
 * Above this many options an axis gets the searchable picker, below it a plain
 * select. A three-option axis in a popover with a search box is worse than a
 * list you can see all of, and a fifteen-option one is worse without it.
 */
const PICKER_THRESHOLD = 6
const MIXED = ""

function choiceFor(axis: VariantAxis, index: number): TokenChoice {
  const option = axis.options[index]
  return {
    id: option.name,
    group: axis.name,
    leaf: option.name,
    name: option.name,
    preview: { kind: "none" },
    detail: option.name === axis.defaultOption ? "default" : "",
    // An option whose classes are built at runtime can be named but not applied.
    disabled: !option.resolved,
  }
}

function axisControl(
  context: SectionContext,
  axis: VariantAxis,
  selected: string | null
): HTMLElement {
  const id = `variants.${axis.name}`
  const commit = (name: string) => {
    if (!name || name === selected) return
    const write = variantClassWrite(context.selection.element, axis, name)
    if (!write) return
    context.writer.applyClasses(context.selection, write, `Set ${axis.name} to ${name}`)
    context.invalidate()
  }

  if (axis.options.length >= PICKER_THRESHOLD) {
    return tokenField({
      id,
      title: axis.name,
      selectedId: selected ?? MIXED,
      choices: axis.options.map((_, index) => choiceFor(axis, index)),
      fallback: { preview: { kind: "none" }, text: "Mixed" },
      onCommit: commit,
    })
  }

  return selectField({
    id,
    label: axis.name,
    value: selected ?? MIXED,
    // The Mixed row is offered only while the instance is actually mixed: it is
    // a reading of the element, not a state you can choose to put it into.
    options: [
      ...(selected === null ? [{ value: MIXED, label: "Mixed" }] : []),
      ...axis.options.map((option) => ({
        value: option.name,
        label: option.name === axis.defaultOption ? `${option.name} (default)` : option.name,
      })),
    ],
    onCommit: commit,
  })
}

export const variantsSection: InspectorSection = (context) => {
  // Empty until lane 2 restores source resolution for React 19. Returning null
  // rather than an explanatory row on purpose: with no file path there is no way
  // to tell an instance from a plain <div>, and the row would then appear under
  // every selection in the app.
  const filePath = context.selection.source?.filePath ?? ""
  if (!filePath) return null

  const declarations = loadedVariants(filePath)
  if (declarations === null) {
    // One request per file, and a re-render only when it found something — a
    // file with no variants must not schedule a rebuild it has nothing to add to.
    void loadVariants(context.editor.apiBase, filePath).then((loaded) => {
      if (loaded.length) context.invalidate()
    })
    return null
  }

  const declaration = matchDeclaration(context.selection.element, declarations)
  if (!declaration) return null

  const rows: HTMLElement[] = []
  for (const axis of declaration.axes) {
    const selected = currentOption(context.selection.element, axis)
    rows.push(
      el("div", { class: "de-variant-axis" }, [
        el("span", { class: "de-variant-axis-name", title: axis.name }, [axis.name]),
        axisControl(context, axis, selected),
      ])
    )
  }
  if (!rows.length) return null

  rows.push(
    el("div", { class: "de-variant-note" }, [
      `Writes the classes ${declaration.name || "this component"} gives the option, not its prop.`,
    ])
  )

  return section("Variants", el("div", { class: "de-stack" }, rows))
}
