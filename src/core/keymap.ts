/**
 * One keymap for the editor chrome.
 *
 * The guards used to be re-derived in every listener, so a new shortcut was one
 * forgotten `isChrome` away from moving the selected element while the user was
 * arrowing through the layers tree.
 */

import { isChrome } from "./dom"

export type CanvasAction =
  | "deselect"
  | "select-child"
  | "select-parent"
  | "next-sibling"
  | "prev-sibling"
  | "nudge"

/** Arrow deltas in px. Shift multiplies. */
export const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

/**
 * Deep select is Cmd on Mac and Ctrl everywhere else — never both. On macOS
 * Ctrl+click is the system context-menu gesture, so accepting it here deep
 * selects and opens a menu on the same press.
 */
export function isDeepSelect(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac() ? event.metaKey : event.ctrlKey
}

/** Editing text is editing text: the canvas keeps its hands off those keys. */
export function isTextEntry(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.isContentEditable) return true
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT"
}

/**
 * Keys pressed inside our own chrome belong to that control. Without this the
 * layers tree's arrows would nudge the selected element, and Tab on `window`
 * capture would make every panel unreachable by keyboard.
 */
export function ownsCanvasKeys(event: KeyboardEvent): boolean {
  return !isChrome(event.target) && !isTextEntry(event.target)
}

/**
 * Enter selects the child and Shift+Enter the parent. That direction surprises
 * people and is nonetheless what Figma does; Escape only ever deselects.
 */
export function canvasAction(event: KeyboardEvent): CanvasAction | null {
  if (event.key === "Escape") return "deselect"
  if (event.key === "Enter") return event.shiftKey ? "select-parent" : "select-child"
  if (event.key === "Tab") return event.shiftKey ? "prev-sibling" : "next-sibling"
  if (event.key in NUDGE) return "nudge"
  return null
}
