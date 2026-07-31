/**
 * The one definition of "a layer", shared by the canvas and the layers panel.
 *
 * Figma's selection model is a rule over (hit, scope, modifiers), and it only
 * holds together while every surface asks the same question. The moment the
 * canvas and the tree each decide for themselves what a click means, the hover
 * outline starts lying about what a click will do.
 *
 * The DOM is the authored hierarchy for a live web page. React component
 * boundaries enrich rows with source names and drag metadata, but they do not
 * form a second tree: click, keyboard navigation, marquee, the overlap menu and
 * Layers all walk the same filtered HTML graph.
 */

import { isCanvasElement } from "./dom"
import type { RewriteElementInfo } from "./bridge"

/** Only the vendor member the resolver needs, so a stub can stand in for tests. */
export interface LayerBridge {
  elementInfo(el: Element): RewriteElementInfo | null
}

export interface LayerMeta {
  info: RewriteElementInfo | null
  /** Component name at an instance root; a label, its text, or the tag below one. */
  name: string
  /** True at the outermost DOM node of a React component instance. */
  isRoot: boolean
}

const NAME_MAX = 28
const NON_VISUAL = /^(SCRIPT|STYLE|LINK|META|TEMPLATE)$/

/** Chrome is excluded by `isCanvasElement`; only non-visual document nodes remain. */
export function isLayerCandidate(node: Node | null): node is Element {
  if (!isCanvasElement(node)) return false
  return !NON_VISUAL.test(node.tagName)
}

/**
 * Hidden layers are excluded from hit-testing *and* from the stack menu, which
 * is what separates them from locked ones. Zero area covers `display:none`
 * without paying a `getComputedStyle` per candidate per gesture.
 */
export function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true
  const rect = element.getBoundingClientRect()
  return rect.width <= 0 || rect.height <= 0
}

/**
 * `EditorContext.select` still takes an `HTMLElement`, so an SVG layer root
 * resolves to its nearest HTML host. Hover, click, marquee and the stack menu
 * all pass through here, so the preview can never promise something a click
 * cannot deliver.
 */
export function toSelectable(element: Element | null): HTMLElement | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node instanceof HTMLElement && isCanvasElement(node)) return node
  }
  return null
}

export interface Resolver {
  bridge: LayerBridge
  meta(element: Element): LayerMeta
  isLayerRoot(element: Element): boolean
  /** Outermost container. Clicking here, or Escape, returns the scope to it. */
  scopeRoot(): Element
  /** Candidate DOM children, in document order. */
  children(element: Element): Element[]
  /** The direct selectable children in the one shared layer graph. */
  layerChildren(container: Element): HTMLElement[]
  layerParent(element: Element): HTMLElement | null
  layerSiblings(element: Element): HTMLElement[]
  /** The Figma rule: highest layer under `hit` that lives inside `scope`. */
  resolve(hit: Element, scope: Element | null, deep?: boolean): HTMLElement | null
  /** Selectable layers under the point, deduped in Layers-panel order. */
  hitStack(x: number, y: number): HTMLElement[]
}

/**
 * Comparing the whole enclosing-component chain, not just the innermost name,
 * is what keeps a component that renders a same-named child from reading as one
 * layer. The line numbers ride along so two call sites of one component are two
 * layers even when the names match.
 */
function ownerPath(info: RewriteElementInfo | null): string {
  if (!info) return ""
  if (!info.stack.length) return info.componentName
  return info.stack.map((frame) => `${frame.componentName}@${frame.lineNumber}`).join(">")
}

function createResolver(bridge: LayerBridge): Resolver {
  const metaCache = new WeakMap<Element, LayerMeta>()

  const meta = (element: Element): LayerMeta => {
    const cached = metaCache.get(element)
    if (cached) return cached
    const info = bridge.elementInfo(element)
    const parent = element.parentElement
    const outer = parent && isLayerCandidate(parent) ? meta(parent).info : null
    const isRoot = Boolean(info?.componentName && ownerPath(info) !== ownerPath(outer))
    const label = element.getAttribute("aria-label")?.trim()
    const text = element.children.length ? "" : element.textContent?.trim().slice(0, NAME_MAX)
    const name = isRoot && info ? info.componentName : label || text || element.tagName.toLowerCase()
    const value: LayerMeta = { info, name, isRoot }
    metaCache.set(element, value)
    return value
  }

  const isLayerRoot = (element: Element) => meta(element).isRoot

  const scopeRoot = () => document.body

  const children = (element: Element): Element[] =>
    Array.from(element.children).filter((child): child is Element => isLayerCandidate(child))

  const layerParent = (element: Element): HTMLElement | null => {
    let node = element.parentElement
    while (node) {
      const parent = node.parentElement
      if (isLayerCandidate(node)) return node
      node = parent
    }
    return null
  }

  // SVG geometry stays part of its nearest HTML host. `EditorContext.select`
  // cannot represent an SVGElement, so listing one would let hover/menu promise
  // a target that click could not select. Every HTML result here is selectable.
  const layerChildren = (container: Element): HTMLElement[] =>
    children(container).filter((child): child is HTMLElement => child instanceof HTMLElement)

  const layerSiblings = (element: Element): HTMLElement[] => {
    const siblings = layerChildren(layerParent(element) ?? scopeRoot())
    return element instanceof HTMLElement && siblings.includes(element) ? siblings : []
  }

  const resolve = (hit: Element, scope: Element | null, deep = false): HTMLElement | null => {
    if (!isLayerCandidate(hit)) return null
    const target = toSelectable(hit)
    if (!target) return null
    if (deep) return target

    // A click outside the scope leaves it: the alternative is a click that
    // selects nothing, with no visible reason why.
    const inScope = Boolean(scope && scope.isConnected && scope.contains(target))
    const container = inScope && scope instanceof HTMLElement ? scope : scopeRoot()
    if (container === target) return target

    // Climb the shared graph until `node` is a direct child of the active
    // scope. This is the exact node Enter/Tab/Layers can reach later.
    let node: HTMLElement | null = target
    while (node) {
      const parent = layerParent(node)
      if (parent === container || (!parent && node.parentElement === container)) return node
      node = parent
    }
    return null
  }

  const hitStack = (x: number, y: number): HTMLElement[] => {
    const seen = new Set<HTMLElement>()
    const stack: HTMLElement[] = []
    for (const raw of document.elementsFromPoint(x, y)) {
      if (!isLayerCandidate(raw) || isHidden(raw)) continue
      const node = toSelectable(raw)
      if (!node || seen.has(node) || isHidden(node)) continue
      seen.add(node)
      stack.push(node)
    }
    // The Select layer menu follows Layers order. Within a nested stack that
    // means parent before child; disjoint overlaps retain document order too.
    stack.sort((a, b) => {
      const relation = a.compareDocumentPosition(b)
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
    return stack
  }

  return {
    bridge,
    meta,
    isLayerRoot,
    scopeRoot,
    children,
    layerChildren,
    layerParent,
    layerSiblings,
    resolve,
    hitStack,
  }
}

let active: Resolver | null = null

/**
 * One resolver per bridge. The canvas and the layers panel must share the memo
 * as well as the definition: a second cache re-walks the fiber tree for every
 * node the other one already resolved.
 */
export function getResolver(bridge: LayerBridge): Resolver {
  if (!active || active.bridge !== bridge) active = createResolver(bridge)
  return active
}
