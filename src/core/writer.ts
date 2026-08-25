/**
 * The one path from "user changed something in the UI" to "the app shows it and
 * the source will too".
 *
 * Every section writes through here so live preview and the queued source
 * operation can never disagree — the failure mode that makes visual editors
 * untrustworthy is a preview that the code write silently drops.
 */

import type { RewriteBridge, UpdateClassOperation } from "./bridge"
import { record } from "./history"
import { iconAttribute, type IconVariant } from "./icon-set"
import { drawIcon } from "./icons"
import { propertyKey, toClassUpdate, type ClassUpdate } from "./tailwind"
import type { LayerElement, Selection } from "./types"

export interface StyleWrite {
  /** CSS property in kebab-case, e.g. `padding-left`. */
  property: string
  value: string
}

export interface ClassWrite {
  remove: string[]
  add: string[]
}

export interface Writer {
  /** Applies inline styles now and queues the equivalent utilities for source. */
  applyStyles(selection: Selection, writes: StyleWrite[], summary: string): void
  /** Swaps utility classes now and queues them for the source writer. */
  applyClasses(selection: Selection, write: ClassWrite, summary: string): void
  /** Replaces the element's text content. */
  applyText(selection: Selection, text: string): void
  /** Redraws a selected `<svg>` as another variant from the host's icon set. */
  applyIcon(selection: Selection, variant: IconVariant): void
  /** CSS properties the source writer cannot express, newest first. */
  untranslated(): string[]
}

/** Index among preceding siblings of the same tag — an AST disambiguator. */
function nthOfType(element: LayerElement): number {
  let index = 0
  let sibling = element.previousElementSibling
  while (sibling) {
    if (sibling.tagName === element.tagName) index += 1
    sibling = sibling.previousElementSibling
  }
  return index
}

/**
 * Module-scoped, not per-writer. The canvas, the inspector and the options
 * panel each build their own writer, so a per-instance list could only ever
 * report the drops made through one of them — and the drop the user most needs
 * warned about (drag/nudge writing `transform`) happens in the canvas while the
 * button that must warn about it lives in the toolbar.
 */
const skipped: string[] = []

/** CSS properties this session previewed but could not express as utilities. */
export function untranslatedProperties(): string[] {
  return [...skipped]
}

/**
 * What undo has to put back.
 *
 * The computed value when nothing is set inline, not the empty string: an empty
 * string reverts the preview correctly but is not a value the translator can
 * turn into a utility, so the pending source operation would keep the change
 * the user just took back. Re-asserting the value the element already had is
 * visually identical and *is* expressible, which keeps the two halves of a
 * write — what you see and what will be committed — saying the same thing.
 */
function currentValue(element: LayerElement, property: string): string {
  return (
    element.style.getPropertyValue(property) ||
    getComputedStyle(element).getPropertyValue(property)
  )
}

/**
 * The attributes `drawIcon` decides, and therefore the ones a swap owns.
 *
 * `width`, `height` and `class` are deliberately absent: the size and the
 * colour of an icon belong to the call site that placed it, and a variant swap
 * that resized the glyph would be answering a question the user did not ask.
 */
const ICON_ROOT_ATTRIBUTES = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]

/** Enough of an `<svg>` to put a swap back exactly as it was. */
interface IconState {
  name: string | null
  markup: string
  root: Array<[string, string | null]>
}

function readIconState(element: SVGSVGElement, attribute: string): IconState {
  return {
    name: element.getAttribute(attribute),
    markup: element.innerHTML,
    root: ICON_ROOT_ATTRIBUTES.map((name) => [name, element.getAttribute(name)]),
  }
}

function iconStateOf(variant: IconVariant): IconState {
  const drawn = drawIcon(variant)
  return {
    name: variant.name,
    markup: drawn.innerHTML,
    root: ICON_ROOT_ATTRIBUTES.map((name) => [name, drawn.getAttribute(name)]),
  }
}

export function createWriter(bridge: RewriteBridge): Writer {

  const operationFor = (
    selection: Selection,
    updates: ClassUpdate[],
    identity?: { className: string; parentClassName: string | undefined }
  ): UpdateClassOperation | null => {
    const source = selection.source
    if (!source?.filePath) return null
    const element = selection.element
    const parent = element.parentElement

    return {
      op: "updateClass",
      file: source.filePath,
      line: source.lineNumber,
      col: source.columnNumber ?? 0,
      componentName: source.componentName,
      tagName: element.tagName.toLowerCase(),
      className: identity
        ? identity.className || undefined
        : element.getAttribute("class") || undefined,
      parentTagName: parent?.tagName.toLowerCase(),
      parentClassName:
        identity?.parentClassName ?? parent?.getAttribute("class") ?? undefined,
      nthOfType: nthOfType(element),
      updates,
    }
  }

  const queue = (
    selection: Selection,
    updates: ClassUpdate[],
    keys: string[],
    identity?: { className: string; parentClassName: string | undefined }
  ) => {
    const operation = operationFor(selection, updates, identity)
    if (!operation) return
    try {
      bridge.store.addPendingPropertyOperation(selection.key, operation, keys)
    } catch {
      // The engine rejects operations it cannot locate in source; the live
      // preview still stands, and "Apply to code" reports the shortfall.
    }
  }

  /**
   * Apply and queue, with no toast and no history entry of its own.
   *
   * Both directions of the timeline replay through here rather than through
   * `applyStyles`, so undoing a change neither announces itself twice nor
   * records an inverse of the inverse.
   */
  const writeStyles = (selection: Selection, writes: StyleWrite[]): string[] => {
    const updates: ClassUpdate[] = []
    const keys: string[] = []
    const dropped: string[] = []

    for (const write of writes) {
      selection.element.style.setProperty(write.property, write.value)

      const update = toClassUpdate(write.property, write.value)
      if (!update) {
        // Preview-only. Surfaced rather than swallowed so the toolbar can say
        // which properties will not survive "Apply to code".
        if (!skipped.includes(write.property)) skipped.unshift(write.property)
        dropped.push(write.property)
        continue
      }
      updates.push(update)
      keys.push(propertyKey(write.property))
    }

    if (updates.length) queue(selection, updates, keys)
    return dropped
  }

  const writeClasses = (selection: Selection, write: ClassWrite): void => {
    const element = selection.element
    // Source resolution must see the element that exists in JSX, not the
    // already-mutated preview. A large removal can otherwise erase enough of
    // the identity for the vendor's overlap matcher to lose the node.
    const identity = {
      className: element.getAttribute("class") ?? "",
      parentClassName: element.parentElement?.getAttribute("class") ?? undefined,
    }
    for (const name of write.remove) element.classList.remove(name)
    for (const name of write.add) element.classList.add(name)

    const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const additions = [...new Set(write.add.filter((name) => !write.remove.includes(name)))]
    const removals = [...new Set(write.remove)]
    const updates: ClassUpdate[] = []
    const keys: string[] = []

    // The pinned writer has no remove verb. Replacing an exact class with an
    // empty standalone token removes it; pairing a removal with an addition
    // also avoids the double-space the empty token necessarily leaves behind.
    for (const removed of removals) {
      const replacement = additions.shift() ?? ""
      updates.push({
        tailwindPrefix: removed,
        tailwindToken: replacement,
        value: replacement,
        standalone: true,
        classPattern: `^${escape(removed)}$`,
      })
      keys.push(`class:${removed}`)
    }
    for (const added of additions) {
      updates.push({
        tailwindPrefix: added,
        tailwindToken: added,
        value: added,
        standalone: true,
        classPattern: `^${escape(added)}$`,
      })
      keys.push(`class:${added}`)
    }
    if (updates.length) {
      queue(selection, updates, keys, identity)
    }
  }

  const writeText = (selection: Selection, text: string): void => {
    const element = selection.element
    const originalText = element.textContent ?? ""
    element.textContent = text
    if (!selection.source?.filePath) return
    bridge.send({
      type: "updateText",
      filePath: selection.source.filePath,
      lineNumber: selection.source.lineNumber,
      columnNumber: selection.source.columnNumber ?? 0,
      componentName: selection.source.componentName,
      tagName: element.tagName.toLowerCase(),
      className: element.className || undefined,
      parentTagName: element.parentElement?.tagName.toLowerCase(),
      parentClassName: element.parentElement?.className || undefined,
      nthOfType: nthOfType(element),
      originalText,
      newText: text,
    })
  }

  /**
   * Both directions of a swap, with no toast and no history entry — the same
   * split as `writeStyles`, for the same reason.
   *
   * A `null` in `root` means the variant does not set that attribute, so it is
   * removed rather than blanked: a stroke-drawn glyph swapped for a filled one
   * must lose `stroke-width`, not carry it as an empty string.
   */
  const writeIcon = (element: SVGSVGElement, attribute: string, state: IconState): void => {
    if (state.name === null) element.removeAttribute(attribute)
    else element.setAttribute(attribute, state.name)
    element.innerHTML = state.markup
    for (const [name, value] of state.root) {
      if (value === null) element.removeAttribute(name)
      else element.setAttribute(name, value)
    }
  }

  return {
    applyStyles(selection, writes, summary) {
      // Read before the write, or the "before" is the value we are about to set.
      const before = writes.map((write) => ({
        property: write.property,
        value: currentValue(selection.element, write.property),
      }))
      const dropped = writeStyles(selection, writes)

      // A write that changed nothing is not a step. A numeric field commits on
      // both Enter and `change`, so one edit arrives here twice; recording the
      // second would make the first Cmd+Z a no-op — measured as exactly that
      // before this guard. Reading the "after" back through `currentValue`
      // rather than comparing to `write.value` keeps the two sides in the same
      // serialization: the browser rewrites `rgb(0,0,255)` as `rgb(0, 0, 255)`,
      // and a string compare against the input would call that a change.
      const changed = before.some(
        (entry) => currentValue(selection.element, entry.property) !== entry.value
      )
      if (changed) {
        record({
          label: summary,
          undo: () => writeStyles(selection, before),
          redo: () => writeStyles(selection, writes),
        })
      }

      // An unqualified success toast on a partly-dropped write is worse than no
      // toast: the change is on screen, so the only thing that could tell the
      // user it will not reach source is this message. Drag and arrow-nudge
      // both land here, and both write `transform`, which has no utility.
      if (dropped.length === 0) {
        bridge.toast(summary, "info")
      } else if (dropped.length === writes.length) {
        bridge.toast(`${summary} — preview only (${dropped.join(", ")})`, "error")
      } else {
        bridge.toast(`${summary} — ${dropped.join(", ")} is preview only`, "error")
      }
    },

    applyClasses(selection, write, summary) {
      const before = selection.element.getAttribute("class") ?? ""
      writeClasses(selection, write)
      // Same rule as `applyStyles`: re-picking the radius already applied is
      // not a step, and the class list is the honest reading of whether the
      // add/remove pair moved anything.
      if ((selection.element.getAttribute("class") ?? "") !== before) {
        record({
          label: summary,
          undo: () => writeClasses(selection, { remove: write.add, add: write.remove }),
          redo: () => writeClasses(selection, write),
        })
      }
      bridge.toast(summary, "info")
    },

    applyText(selection, text) {
      const before = selection.element.textContent ?? ""
      if (text === before) return
      writeText(selection, text)
      record({
        label: "Edit text",
        undo: () => writeText(selection, before),
        redo: () => writeText(selection, text),
      })
    },

    applyIcon(selection, variant) {
      const attribute = iconAttribute()
      const element = selection.element
      if (!attribute || !(element instanceof SVGSVGElement)) return
      const before = readIconState(element, attribute)
      if (before.name === variant.name) return
      const after = iconStateOf(variant)

      writeIcon(element, attribute, after)
      record({
        label: `Swap icon to ${variant.name}`,
        undo: () => writeIcon(element, attribute, before),
        redo: () => writeIcon(element, attribute, after),
      })
      // Preview only, and said so every time rather than once in a hint the
      // user scrolled past: the source writer speaks in classes and text, and
      // an icon is neither — the JSX still names the component it always did.
      bridge.toast(`Swapped to ${variant.name} — preview only`, "info")
    },

    untranslated() {
      return [...skipped]
    },
  }
}
