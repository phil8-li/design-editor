/**
 * The single object every lane receives. Lanes never import each other; they
 * read state from the store, act through `select`/`commands`, and mount their
 * own DOM into the slot they are handed.
 */

import { config } from "./config"
import { elementKey, getState, primarySelection, setState, subscribe } from "./store"
import { toSourceRef, type RewriteBridge } from "./bridge"
import type { Selection, ToolId } from "./types"

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
  select(el: HTMLElement | null, options?: { additive?: boolean }): void
  /** Replaces the selection in one store write — one repaint, not one per element. */
  selectMany(els: HTMLElement[]): void
  setTool(tool: ToolId): void
  /** Rebuilds every registered panel. Cheap: panels diff internally. */
  refresh(): void
  onRefresh(fn: () => void): () => void
  toast(message: string, kind?: "info" | "error"): void
  /** Base URL for design-editor server routes, e.g. `/__design-editor`. */
  apiBase: string
}

const refreshListeners = new Set<() => void>()

export function createContext(bridge: RewriteBridge, slots: EditorSlots): EditorContext {
  const describe = (element: HTMLElement): Selection => {
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
      const seen = new Set<HTMLElement>()
      const selection: Selection[] = []
      for (const element of elements) {
        if (seen.has(element)) continue
        seen.add(element)
        selection.push(describe(element))
      }
      setState({ selection })
    },

    setTool(tool) {
      setState({ tool })
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
