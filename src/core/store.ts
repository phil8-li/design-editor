/**
 * Editor state. A tiny observable store so every panel reads one source of
 * truth for selection and tool — the same rule the app itself follows for
 * continuous gestures (one live value, many followers).
 */

import type { ElementOptionSet, LayerElement, Selection, ToolId } from "./types"

export interface EditorState {
  tool: ToolId
  /**
   * Hands the page back to the app: clicks, keys and drags reach the product
   * instead of the editor, and the canvas paints nothing over it.
   *
   * Default `false`, because the editor's whole reason to exist is that a click
   * selects rather than navigates. This is a MODE rather than a tool — a tool
   * changes what a canvas gesture means, this decides whether there is a canvas
   * gesture at all — so it lives beside `tool` instead of inside it.
   */
  interactive: boolean
  /** Primary selection is `selection[0]`. */
  selection: Selection[]
  /**
   * The container the user has drilled into. Plain clicks resolve against it,
   * so "select the parent" has one answer instead of "which parent?". `null`
   * means the scope root, which is where a click on the background returns it.
   */
  scope: Element | null
  /** Already resolved: the painter must never re-run the resolver per frame. */
  hovered: Element | null
  /**
   * Elements the user has locked from the layers tree.
   *
   * A lock is a property of THIS EDITING SESSION, not of the user's app. It
   * says "stop letting me grab this on the canvas", which is a fact about the
   * pointer and not about the product — there is nothing in the JSX it could
   * correspond to. That is exactly why it is never written to source and never
   * reaches the change ledger, and it is the one row affordance that differs
   * from the eye beside it, which is a real edit.
   *
   * It lives in the store rather than in the layers panel because the canvas
   * lane is the one that has to honour it, and lanes read each other only
   * through here. Keyed by the element, the same way the tree keys its rows.
   *
   * Replaced rather than mutated on every toggle: `setState` compares by
   * identity, so a Set edited in place would notify nobody.
   */
  locked: ReadonlySet<Element>
  layersOpen: boolean
  inspectorOpen: boolean
  /** Option sets keyed by `Selection.key`. */
  optionSets: Record<string, ElementOptionSet>
  dirty: boolean
}

type Listener = (state: EditorState, previous: EditorState) => void

const state: EditorState = {
  tool: "move",
  interactive: false,
  selection: [],
  scope: null,
  hovered: null,
  locked: new Set<Element>(),
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

/**
 * Whether a canvas gesture belongs to the editor at all.
 *
 * Every pointer and key handler in the canvas lane asks this one function
 * rather than reading `interactive` for itself. Interactive mode is only
 * trustworthy if it is airtight: a mode that leaks through a single handler —
 * the double-click that still drills, the pointerdown that still starts a drag
 * — is worse than no mode, because the user has already stopped expecting the
 * editor to intercept anything.
 */
export function editorOwnsInput(): boolean {
  return !state.interactive
}

/**
 * Whether the canvas should refuse to hit-test `element`.
 *
 * Asked as a function for the same reason as `editorOwnsInput`: the lock is
 * only worth anything if every path that can grab an element asks the same
 * question. The tree deliberately does NOT ask it — a locked layer stays
 * selectable from the panel, which is the only way back out of the lock.
 */
export function isLocked(element: Element | null): boolean {
  return Boolean(element && state.locked.has(element))
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
export function elementKey(el: LayerElement, componentName: string, line: number): string {
  const path: string[] = []
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    path.unshift(step(node))
    if (path.length === 6) break
  }
  return `${componentName || "?"}:${line}:${path.join("/")}`
}
