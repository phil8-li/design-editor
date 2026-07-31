/**
 * Editor state. A tiny observable store so every panel reads one source of
 * truth for selection and tool — the same rule the app itself follows for
 * continuous gestures (one live value, many followers).
 */

import type { ElementOptionSet, Selection, ToolId } from "./types"

export interface EditorState {
  tool: ToolId
  /** Primary selection is `selection[0]`. */
  selection: Selection[]
  hovered: HTMLElement | null
  layersOpen: boolean
  inspectorOpen: boolean
  /** Option sets keyed by `Selection.key`. */
  optionSets: Record<string, ElementOptionSet>
  dirty: boolean
}

type Listener = (state: EditorState, previous: EditorState) => void

const state: EditorState = {
  tool: "move",
  selection: [],
  hovered: null,
  layersOpen: true,
  inspectorOpen: true,
  optionSets: {},
  dirty: false,
}

const listeners = new Set<Listener>()

export function getState(): Readonly<EditorState> {
  return state
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setState(patch: Partial<EditorState>): void {
  const previous = { ...state }
  let changed = false
  for (const [key, value] of Object.entries(patch)) {
    if (state[key as keyof EditorState] === value) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(state as any)[key] = value
    changed = true
  }
  if (!changed) return
  for (const listener of listeners) listener(state, previous)
}

export function primarySelection(): Selection | null {
  return state.selection[0] ?? null
}

/** `tag` plus index among same-tag siblings — one step of a DOM path. */
function step(el: Element): string {
  let index = 0
  for (const sibling of Array.from(el.parentElement?.children ?? [])) {
    if (sibling === el) break
    if (sibling.tagName === el.tagName) index += 1
  }
  return `${el.tagName.toLowerCase()}${index}`
}

/**
 * Stable identity for an element across re-renders: component + source line +
 * a short ancestor path. Good enough to key saved options without writing
 * anything into the app's DOM.
 *
 * The path matters: the engine reports one source line per JSX element, so
 * every item rendered from a `.map()` — and every element the engine cannot
 * resolve at all, which reports line 0 — would otherwise collapse onto one key
 * and share another element's saved options.
 */
export function elementKey(el: HTMLElement, componentName: string, line: number): string {
  const path: string[] = []
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    path.unshift(step(node))
    if (path.length === 6) break
  }
  return `${componentName || "?"}:${line}:${path.join("/")}`
}
