/**
 * The single object every lane receives. Lanes never import each other; they
 * read state from the store, act through `select`/`commands`, and mount their
 * own DOM into the slot they are handed.
 */

import { config } from "./config"
import { elementKey, getState, primarySelection, setState, subscribe } from "./store"
import { resolveElementSource, toSourceRef, type RewriteBridge } from "./bridge"
import type { LayerElement, Selection, ToolId } from "./types"

export interface EditorSlots {
  /** Fixed layer above the app, below the panels — canvas chrome lives here. */
  overlay: HTMLElement
  /** Top toolbar strip. */
  toolbar: HTMLElement
  /** Scrollable body of the left (layers) panel. */
  left: HTMLElement
  /** Scrollable body of the right (inspector) panel. */
  right: HTMLElement
}

export interface EditorContext {
  bridge: RewriteBridge
  slots: EditorSlots
  getState: typeof getState
  setState: typeof setState
  subscribe: typeof subscribe
  primarySelection: typeof primarySelection
  /** Selects an element (or clears selection with `null`). */
  select(el: LayerElement | null, options?: { additive?: boolean }): void
  /** Replaces the selection in one store write — one repaint, not one per element. */
  selectMany(els: LayerElement[]): void
  setTool(tool: ToolId): void
  /**
   * Enters or leaves pass-through mode. Entering it drops the hover target as
   * well: the highlight is suppressed either way, but a stale `hovered` would
   * keep the chrome's frame loop awake for a canvas nobody is painting.
   */
  setInteractive(interactive: boolean): void
  /** Rebuilds every registered panel. Cheap: panels diff internally. */
  refresh(): void
  onRefresh(fn: () => void): () => void
  toast(message: string, kind?: "info" | "error"): void
  /** Base URL for design-editor server routes, e.g. `/__design-editor`. */
  apiBase: string
}

const refreshListeners = new Set<() => void>()

export function createContext(bridge: RewriteBridge, slots: EditorSlots): EditorContext {
  /**
   * React 19 dropped `fiber._debugSource`, so the synchronous walk behind
   * `toSourceRef` answers `null` for every element in this app — measured 0/12
   * on a live page, against 12/12 for the owner-stack resolver. The writer
   * already copes by resolving lazily at Apply time, but a Selection built here
   * is also what the inspector header reads, which is why it showed a component
   * name and no file. Nothing else may re-derive an element's source: this
   * patches the stored Selection in place when the resolver lands, so the panel
   * repaints from the one answer rather than asking a second time.
   *
   * Only the element the inspector is actually describing is primed. A marquee
   * over fifty nodes would otherwise pay fifty owner-stack walks to fill a
   * header that shows one of them.
   */
  const primeSource = (element: LayerElement): void => {
    void resolveElementSource(bridge, element)
      .then((source) => {
        if (!source) return
        const current = getState().selection
        const index = current.findIndex((entry) => entry.element === element)
        // Gone, or already answered by a later selection: leave it alone.
        if (index === -1 || current[index].source) return
        const selection = current.slice()
        selection[index] = { ...selection[index], source }
        setState({ selection })
      })
      .catch(() => null)
  }

  const describe = (element: LayerElement): Selection => {
    const info = bridge.elementInfo(element)
    const componentName = info?.componentName || element.tagName.toLowerCase()
    return {
      element,
      tagName: element.tagName.toLowerCase(),
      componentName,
      source: toSourceRef(info),
      key: elementKey(element, componentName, info?.lineNumber ?? 0),
    }
  }

  const context: EditorContext = {
    bridge,
    slots,
    getState,
    setState,
    subscribe,
    primarySelection,
    apiBase: config.apiBase,

    select(element, options = {}) {
      if (!element) {
        setState({ selection: [] })
        return
      }
      const selection = describe(element)
      if (!selection.source) primeSource(element)
      const current = getState().selection
      if (options.additive) {
        const existing = current.findIndex((entry) => entry.element === element)
        setState({
          selection:
            existing === -1
              ? [...current, selection]
              : current.filter((_, index) => index !== existing),
        })
        return
      }
      // No identity early-return. The same element can need a fresh Selection:
      // a source edit moves the line it was described from, and drilling
      // re-selects it at a different depth. Skipping the write leaves both
      // stale, and the object is cheap to rebuild.
      setState({ selection: [selection] })
    },

    selectMany(elements) {
      const seen = new Set<LayerElement>()
      const selection: Selection[] = []
      for (const element of elements) {
        if (seen.has(element)) continue
        seen.add(element)
        selection.push(describe(element))
      }
      if (selection.length && !selection[0].source) primeSource(selection[0].element)
      setState({ selection })
    },

    setTool(tool) {
      setState({ tool })
    },

    setInteractive(interactive) {
      setState(interactive ? { interactive, hovered: null } : { interactive })
    },

    refresh() {
      for (const listener of refreshListeners) listener()
    },

    onRefresh(fn) {
      refreshListeners.add(fn)
      return () => refreshListeners.delete(fn)
    },

    toast(message, kind = "info") {
      bridge.toast(message, kind)
    },
  }

  return context
}
