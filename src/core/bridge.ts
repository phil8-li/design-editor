/**
 * Typed access to the React Rewrite engine.
 *
 * `scripts/run-design-editor.mjs` patches the vendored overlay bundle to hang
 * this object off `window`. We never import the vendor bundle directly — it is
 * a pinned, minified artifact — so every internal we depend on is listed here
 * and shape-checked by the patch's `requiredFragments` gate.
 */

import type { ClassUpdate } from "./tailwind"
import type { SourceRef } from "./types"

/**
 * The only source-write shape the engine's batch transformer understands for
 * style changes. Everything beyond `updates` is resolution context: the more of
 * it we supply, the more reliably the AST walker finds the right JSX node.
 */
export interface UpdateClassOperation {
  op: "updateClass"
  file: string
  line: number
  col: number
  componentName?: string
  tagName?: string
  className?: string
  parentTagName?: string
  parentClassName?: string
  nthOfType?: number
  updates: ClassUpdate[]
}

export interface RewriteStack {
  componentName: string
  filePath: string
  lineNumber: number
  columnNumber: number
}

export interface RewriteElementInfo {
  tagName: string
  componentName: string
  filePath: string
  lineNumber: number
  columnNumber: number
  stack: RewriteStack[]
}

/** Subset of the vendor store we rely on. */
export interface RewriteStore {
  getActiveTool(): string
  setActiveTool(tool: string): void
  onToolChange(fn: (tool: string, previous: string) => void): () => void
  onStateChange(fn: () => void): () => void
  getCanvasTransform(): { x: number; y: number; scale: number }
  setCanvasTransform(t: { x: number; y: number; scale: number }): void
  onCanvasTransformChange(fn: (t: { x: number; y: number; scale: number }) => void): () => void
  viewportToPage(x: number, y: number): { x: number; y: number }
  pageToViewport(x: number, y: number): { x: number; y: number }
  /**
   * `mergeKey` identifies the element so repeated edits accumulate into one
   * operation; `propertyKeys` runs parallel to `operation.updates` so a second
   * edit to the same property replaces the first instead of appending a class.
   */
  addPendingPropertyOperation(
    mergeKey: string,
    operation: UpdateClassOperation,
    propertyKeys: string[]
  ): void
  buildBatchOperations(): unknown[]
  hasChanges(): boolean
  canUndo(): boolean
  canvasUndo(): string | null
  addMove(move: unknown): unknown
  updateMoveDelta(id: string, delta: { x: number; y: number }): void
  getMoveForElement(el: Element): unknown
  resetCanvas(): void
}

export interface RewriteBridge {
  version: number
  tokens: {
    colors: Record<string, string>
    shadows: Record<string, string>
    radii: Record<string, string>
    font: string
  }
  send(message: unknown): void
  subscribe(fn: (message: Record<string, unknown>) => void): () => void
  discoverFile(componentName: string): Promise<string | null>
  elementInfo(el: HTMLElement): RewriteElementInfo | null
  resolveSourceAt(x: number, y: number): Promise<RewriteElementInfo | null>
  hitTest(x: number, y: number): HTMLElement | null
  selectedElement(): HTMLElement | null
  refreshGeometry(): void
  toast(message: string, kind?: "info" | "error"): void
  root(): HTMLElement | null
  store: RewriteStore
}

declare global {
  interface Window {
    __DESIGN_EDITOR_BRIDGE__?: RewriteBridge
    __DESIGN_EDITOR_WS_PORT__?: number
  }
}

const BRIDGE_TIMEOUT_MS = 10_000

/** Resolves once the patched vendor overlay has installed the bridge. */
export function whenBridgeReady(): Promise<RewriteBridge> {
  if (window.__DESIGN_EDITOR_BRIDGE__) {
    return Promise.resolve(window.__DESIGN_EDITOR_BRIDGE__)
  }

  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = () => {
      const bridge = window.__DESIGN_EDITOR_BRIDGE__
      if (bridge) {
        resolve(bridge)
        return
      }
      if (Date.now() - started > BRIDGE_TIMEOUT_MS) {
        reject(new Error("Design editor bridge never installed"))
        return
      }
      requestAnimationFrame(poll)
    }
    poll()
  })
}

/** Normalizes the vendor's element info into our `SourceRef`. */
export function toSourceRef(info: RewriteElementInfo | null): SourceRef | null {
  if (!info || !info.filePath) return null
  return {
    filePath: info.filePath,
    lineNumber: info.lineNumber,
    columnNumber: info.columnNumber,
    componentName: info.componentName,
  }
}
