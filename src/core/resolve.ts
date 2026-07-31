/**
 * The one definition of "a layer", shared by the canvas and the layers panel.
 *
 * Figma's selection model is a rule over (hit, scope, modifiers), and it only
 * holds together while every surface asks the same question. The moment the
 * canvas and the tree each decide for themselves what a click means, the hover
 * outline starts lying about what a click will do.
 *
 * A Figma layer is authored hierarchy — a group exists because a designer said
 * those things move together. The DOM analogue is the component instance root:
 * the element whose enclosing-component path differs from its parent's.
 * Everything below it is markup nobody named, and a Tailwind app stacks 8-20 of
 * those at any pixel, which is why "deepest hit" is the wrong default here for
 * the same reason it is wrong in Figma.
 */

import { isCanvasElement } from "./dom"
import type { RewriteElementInfo } from "./bridge"

/** Only the vendor member the resolver needs, so a stub can stand in for tests. */
export interface LayerBridge {
  elementInfo(el: HTMLElement): RewriteElementInfo | null
}

export interface LayerMeta {
  info: RewriteElementInfo | null
  /** Component name at an instance root; a label, its text, or the tag below one. */
  name: string
  /** True at the outermost DOM node of a React component instance. */
  isRoot: boolean
}

const NAME_MAX = 28
/** A branch this deep with no component boundary is machine-generated markup. */
const DESCEND_LIMIT = 8
const NON_VISUAL = /^(SCRIPT|STYLE|LINK|META|TEMPLATE)$/

/** Dev-tool portals are custom elements; neither they nor `<script>` are design. */
export function isLayerCandidate(node: Node | null): node is Element {
  if (!isCanvasElement(node)) return false
  return !node.tagName.includes("-") && !NON_VISUAL.test(node.tagName)
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
  /** Selectable DOM children, in document order. */
  children(element: Element): Element[]
  layerChildren(container: Element): Element[]
  layerParent(element: Element): Element | null
  layerSiblings(element: Element): Element[]
  /** The Figma rule: highest layer under `hit` that lives inside `scope`. */
  resolve(hit: Element, scope: Element | null, deep?: boolean): Element | null
  /** Everything under the point, frontmost first — the stack menu's contents. */
  hitStack(x: number, y: number): Element[]
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
    // The engine resolves any host node; its published signature is narrower
    // than the runtime contract, and SVG roots are exactly the icons we name.
    const info = bridge.elementInfo(element as HTMLElement)
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

  const layerParent = (element: Element): Element | null => {
    for (let node = element.parentElement; node && isLayerCandidate(node); node = node.parentElement) {
      if (isLayerRoot(node)) return node
    }
    return null
  }

  /**
   * The first layer root along each branch. A branch that crosses no component
   * boundary contributes its direct child instead — the literal Figma rule,
   * kept as the fallback because that is where its predictability pays.
   */
  const layerChildren = (container: Element): Element[] => {
    const found: Element[] = []
    const descend = (element: Element, depth: number): boolean => {
      if (isLayerRoot(element)) {
        found.push(element)
        return true
      }
      if (depth >= DESCEND_LIMIT) return false
      let hit = false
      for (const child of children(element)) if (descend(child, depth + 1)) hit = true
      return hit
    }
    for (const child of children(container)) if (!descend(child, 0)) found.push(child)
    return found
  }

  const layerSiblings = (element: Element): Element[] => {
    const siblings = layerChildren(layerParent(element) ?? scopeRoot())
    if (siblings.includes(element)) return siblings
    // A deep-selected node is not a layer root, so the layer tree does not list
    // it; its DOM siblings are the only honest answer to "next one along".
    const parent = element.parentElement
    return parent ? children(parent) : [element]
  }

  const resolve = (hit: Element, scope: Element | null, deep = false): Element | null => {
    if (!isLayerCandidate(hit)) return null
    if (deep) return hit

    // A click outside the scope leaves it: the alternative is a click that
    // selects nothing, with no visible reason why.
    const inScope = Boolean(scope && scope.isConnected && scope.contains(hit))
    if (inScope && scope === hit) return hit
    const container = inScope && scope ? scope : scopeRoot()

    const chain: Element[] = []
    for (let node: Element | null = hit; node && node !== container; node = node.parentElement) {
      chain.unshift(node)
    }
    if (!chain.length) return hit
    for (const node of chain) if (isLayerCandidate(node) && isLayerRoot(node)) return node
    return chain[0]
  }

  const hitStack = (x: number, y: number): Element[] =>
    Array.from(document.elementsFromPoint(x, y)).filter(
      (node) => isLayerCandidate(node) && !isHidden(node)
    )

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
