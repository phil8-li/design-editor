/**
 * Shared contracts for the Figma-style design editor overlay.
 *
 * Every lane (canvas, panels, options, ai) talks through these types so the
 * modules stay disjoint: nothing imports another lane's internals.
 */

/** Source coordinates React Rewrite resolved for a DOM node. */
export interface SourceRef {
  filePath: string
  lineNumber: number
  columnNumber: number
  componentName: string
}

/** One selectable thing on the canvas. */
export interface Selection {
  element: HTMLElement
  tagName: string
  componentName: string
  source: SourceRef | null
  /** Stable-ish key used by the layers panel and the options store. */
  key: string
}

export type ToolId = "move" | "select" | "text" | "hand" | "comment"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A single className mutation queued for the source writer. */
export interface ClassEdit {
  /** Classes to strip (exact match). */
  remove: string[]
  /** Classes to add. */
  add: string[]
}

/** Inline style mutation, applied live and mirrored into source on commit. */
export interface StyleEdit {
  [cssProperty: string]: string
}

/** One saved variation of an element's styling. */
export interface ElementOption {
  id: string
  name: string
  /** Full className string for this option. */
  className: string
  /** Inline styles captured with the option. */
  style: StyleEdit
  /** Text content, when the option also changes copy. */
  text?: string
  createdAt: number
}

export interface ElementOptionSet {
  /** Element key (see `Selection.key`). */
  key: string
  label: string
  activeOptionId: string | null
  options: ElementOption[]
}

/** Layers-panel node projected from the React fiber tree. */
export interface LayerNode {
  id: string
  element: HTMLElement
  name: string
  tagName: string
  isComponent: boolean
  depth: number
  children: LayerNode[]
}

/** Context handed to the AI agent alongside the user's prompt. */
export interface AgentRequest {
  prompt: string
  selection: {
    tagName: string
    componentName: string
    className: string
    text: string
    rect: Rect
    source: SourceRef | null
  } | null
  /** Sibling/parent context so the agent can locate the node in source. */
  ancestry: Array<{ tagName: string; className: string; componentName: string }>
  url: string
}

export interface AgentResponse {
  ok: boolean
  /** Human-readable result shown in the AI panel. */
  message: string
  /** Where the request was handed off, when no API key is configured. */
  handoffPath?: string
  /** Files the agent edited, when it applied changes directly. */
  filesChanged?: string[]
}
