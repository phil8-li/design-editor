/**
 * The one path from "user changed something in the UI" to "the app shows it and
 * the source will too".
 *
 * Every section writes through here so live preview and the queued source
 * operation can never disagree — the failure mode that makes visual editors
 * untrustworthy is a preview that the code write silently drops.
 */

import { resolveElementSource, type RewriteBridge, type UpdateClassOperation } from "./bridge"
import { previewOnlyChanges, recordPreviewOnly } from "./change-prompt"
import { record } from "./history"
import { iconAttribute, type IconVariant } from "./icon-set"
import { drawIcon } from "./icons"
import { propertyKey, toClassUpdate, type ClassUpdate } from "./tailwind"
import type { LayerElement, Selection, SourceRef } from "./types"

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
 * CSS properties this session previewed but could not express as utilities,
 * newest first.
 *
 * Derived rather than kept: the full record of what could not be written lives
 * in `change-prompt.ts`, because the toolbar needs the property names for its
 * toast and the copy button needs the file, the element and the values. Two
 * lists would let the warning and the prompt disagree about what was lost.
 *
 * Filtered to CSS properties on purpose. An icon swap is in the ledger — it is
 * exactly the kind of change that needs an agent — but it announces itself as
 * preview-only at the moment it happens, and repeating it in the Apply toast
 * would report the same loss twice.
 */
export function untranslatedProperties(): string[] {
  const seen = new Set<string>()
  for (const change of previewOnlyChanges()) {
    if (change.property === "icon") continue
    seen.add(change.property)
  }
  return [...seen]
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

  /**
   * The source ref for a selection, resolving it if selection time could not.
   *
   * Under React 19 selection time never can: `bridge.elementInfo` is a walk over
   * `fiber._debugSource`, which React 19.2 removed, so every `Selection` this
   * editor builds arrives with `source: null`. That is what made "Apply to code"
   * a permanently disabled button — the operation was dropped here, quietly, and
   * `hasChanges()` stayed false, so nothing downstream could report it.
   *
   * The answer is written back onto the selection so the inspector and the
   * layers panel see the same file the queue used, and so a second edit to the
   * same element does not pay for the round trip again.
   */
  const ensureSource = async (selection: Selection) => {
    if (selection.source?.filePath) return selection.source
    const resolved = await resolveElementSource(bridge, selection.element)
    if (resolved) selection.source = resolved
    return resolved
  }

  const operationFor = (
    selection: Selection,
    source: SourceRef,
    updates: ClassUpdate[],
    identity?: { className: string; parentClassName: string | undefined }
  ): UpdateClassOperation | null => {
    if (!source.filePath) return null
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

  const dispatch = (
    selection: Selection,
    source: SourceRef,
    updates: ClassUpdate[],
    keys: string[],
    identity?: { className: string; parentClassName: string | undefined }
  ) => {
    const operation = operationFor(selection, source, updates, identity)
    if (!operation) return
    try {
      bridge.store.addPendingPropertyOperation(selection.key, operation, keys)
    } catch {
      // The engine rejects operations it cannot locate in source; the live
      // preview still stands, and "Apply to code" reports the shortfall.
    }
  }

  /**
   * Synchronous when the file is known, deferred only when it is not.
   *
   * The wait is not free — it is a sourcemap fetch and sometimes a `grep` — so
   * it is paid once per element and never on a path that already has an answer.
   * When it is paid, nothing awaits it: the preview is already on screen, and
   * the engine's `addPendingPropertyOperation` fires its own state-change
   * listeners when the entry lands, which is what takes the toolbar's Apply
   * button out of its disabled state. Awaiting here would stall a drag instead.
   */
  const queue = (
    selection: Selection,
    updates: ClassUpdate[],
    keys: string[],
    identity?: { className: string; parentClassName: string | undefined }
  ) => {
    const known = selection.source
    if (known?.filePath) {
      dispatch(selection, known, updates, keys, identity)
      return
    }
    void ensureSource(selection).then((source) => {
      if (source) dispatch(selection, source, updates, keys, identity)
    })
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
      // Read before the write: a preview-only change is only actionable as
      // "from this, to that", and after `setProperty` the "from" is gone.
      const before = currentValue(selection.element, write.property)
      selection.element.style.setProperty(write.property, write.value)

      const update = toClassUpdate(write.property, write.value)
      if (!update) {
        // Preview-only. Recorded rather than swallowed so the toolbar can say
        // which properties will not survive "Apply to code", and so the change
        // prompt can hand the agent the one edit this editor cannot make.
        //
        // Recorded synchronously with whatever file is known now, because the
        // toast reads the list on the very next line. The path is patched in
        // when resolution lands, which is usually a few hundred milliseconds
        // after that and always long before anyone presses copy.
        const entry = recordPreviewOnly({
          filePath: selection.source?.filePath ?? null,
          componentName: selection.componentName,
          tagName: selection.element.tagName.toLowerCase(),
          className: selection.element.getAttribute("class") ?? "",
          property: write.property,
          from: before,
          to: write.value,
        })
        void ensureSource(selection).then((source) => {
          if (source && !entry.filePath) entry.filePath = source.filePath
        })
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
    // The identity the AST matcher needs is read here, before the await: by the
    // time source resolves, a re-render may have replaced the classes we would
    // otherwise send, and the matcher scores JSX against them.
    const className = element.getAttribute("class") || undefined
    const parentClassName = element.parentElement?.getAttribute("class") || undefined
    const post = (source: SourceRef) => {
      bridge.send({
        type: "updateText",
        filePath: source.filePath,
        lineNumber: source.lineNumber,
        columnNumber: source.columnNumber ?? 0,
        componentName: source.componentName,
        tagName: element.tagName.toLowerCase(),
        className,
        parentTagName: element.parentElement?.tagName.toLowerCase(),
        parentClassName,
        nthOfType: nthOfType(element),
        originalText,
        newText: text,
      })
    }
    // Same split as `queue`: immediate when the file is known, and only then.
    if (selection.source?.filePath) {
      post(selection.source)
      return
    }
    void ensureSource(selection).then((source) => {
      if (source) post(source)
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
      // Preview only, and said so every time rather than once in a hint the
      // user scrolled past: the source writer speaks in classes and text, and
      // an icon is neither — the JSX still names the component it always did.
      //
      // Which makes it the clearest case for the change prompt: the only way
      // this reaches source is an agent editing the import and the tag, so the
      // swap is recorded with both names for it to act on.
      //
      // BEFORE `record`, which is the ordering `writeStyles` already has and
      // this had backwards: pushing the history entry repaints the toolbar, and
      // the toolbar decides whether "Copy change prompts" is live by reading
      // this ledger. Recorded after, the swap left the one button that could
      // act on it disabled until some later, unrelated repaint.
      const entry = recordPreviewOnly({
        filePath: selection.source?.filePath ?? null,
        componentName: selection.componentName,
        tagName: element.tagName.toLowerCase(),
        className: element.getAttribute("class") ?? "",
        property: "icon",
        from: before.name ?? "",
        to: variant.name,
      })
      void ensureSource(selection).then((source) => {
        if (source && !entry.filePath) entry.filePath = source.filePath
      })
      record({
        label: `Swap icon to ${variant.name}`,
        undo: () => writeIcon(element, attribute, before),
        redo: () => writeIcon(element, attribute, after),
      })
      bridge.toast(`Swapped to ${variant.name} — preview only`, "info")
    },

    untranslated() {
      return untranslatedProperties()
    },
  }
}
