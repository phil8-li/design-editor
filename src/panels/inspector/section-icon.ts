/**
 * The icon section: which icon this `<svg>` is, and the set it can be swapped
 * for.
 *
 * Figma puts an instance's variant properties directly under the layer name,
 * before paint and box — the first question about a placed symbol is which
 * symbol it is. This section is registered in the same position, and it is the
 * only reason an `<svg>` is selectable at all.
 *
 * One field, one list of names, one glyph each. No file, no import, no
 * component spelling: a designer picking an icon is choosing a mark.
 */

import { loadIconSet, loadedIconSet, iconNameOf, type IconVariant } from "../../core/icon-set"
import { drawIcon } from "../../core/icons"
import { el } from "../../core/dom"
import { section } from "./field"
import { tokenField, type TokenChoice } from "./token-picker"
import type { InspectorSection } from "./index"

/** Every icon is one flat set, so the picker's group headers stay out of the way. */
const GROUP = ""

function choiceFor(variant: IconVariant): TokenChoice {
  return {
    id: variant.name,
    group: GROUP,
    leaf: variant.name,
    name: variant.name,
    // 16px on the 24 grid: the same size the row's other previews occupy, and
    // the size the app draws most of these at.
    preview: { kind: "glyph", draw: () => drawIcon(variant, 16) },
    detail: "",
    disabled: false,
  }
}

export const iconSection: InspectorSection = (context) => {
  const current = iconNameOf(context.selection.element)
  if (!current) return null

  const variants = loadedIconSet()
  if (!variants.length) {
    // The set is 114KB, so it is fetched on the first icon selection rather than
    // at page load. Re-render when it lands: the field below is honest in the
    // meantime — it names the icon, it just cannot offer the others yet.
    void loadIconSet(context.editor.apiBase).then((loaded) => {
      if (loaded.length) context.invalidate()
    })
  }

  const field = tokenField({
    id: "icon.name",
    title: "Icon",
    selectedId: variants.some((variant) => variant.name === current) ? current : "",
    choices: variants.map(choiceFor),
    fallback: {
      preview: { kind: "none" },
      text: current,
    },
    onCommit: (id) => {
      const variant = variants.find((entry) => entry.name === id)
      if (!variant) return
      context.writer.applyIcon(context.selection, variant)
      context.invalidate()
    },
  })

  return section("Icon", el("div", { class: "de-stack" }, [field]))
}
