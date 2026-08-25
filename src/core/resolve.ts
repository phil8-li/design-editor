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
import { iconNameOf } from "./icon-set"
import type { LayerElement } from "./types"
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
 *
 * `aria-hidden` is deliberately NOT part of this test. It says "do not announce
 * this", not "do not paint this", and a decorative glyph is the canonical thing
 * that is correctly both: every one of this app's 70 live icons carries
 * `aria-hidden="true"`, and reading that as hidden dropped all of them out of
 * the stack menu while the layers tree — which does not consult this — went on
 * listing them. Two surfaces, one question, two answers.
 */
export function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true
  const rect = element.getBoundingClientRect()
  return rect.width <= 0 || rect.height <= 0
}

/**
 * An `<svg>` is a layer; the geometry inside it is not.
 *
 * A `<path>` has no independent identity in the authored source — it is one
 * clause of the icon's shape — so a click on it resolves UP to the `<svg>`,
 * which is the node the JSX actually names. Everything else climbs to its
 * nearest HTML host as before.
 *
 * This used to stop at the HTML host in every case, which meant an icon could
 * not be selected at all: clicking one landed on whatever `<span>` or `<button>`
 * happened to wrap it, and the inspector described the wrapper. Hover, click,
 * marquee and the stack menu all pass through here, so widening it here is what
 * makes the preview outline and the click agree on an icon.
 */
export function toSelectable(element: Element | null): LayerElement | null {
  let svg: SVGSVGElement | null = null
  for (let node: Element | null = element; node; node = node.parentElement) {
    // Innermost wins: a nested `<svg>` is the layer, not the sheet holding it.
    if (!svg && node instanceof SVGSVGElement && isCanvasElement(node)) svg = node
    if (node instanceof HTMLElement && isCanvasElement(node)) return svg ?? node
  }
  return svg
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
  layerChildren(container: Element): LayerElement[]
  layerParent(element: Element): LayerElement | null
  layerSiblings(element: Element): LayerElement[]
  /** The Figma rule: highest layer under `hit` that lives inside `scope`. */
  resolve(hit: Element, scope: Element | null, deep?: boolean): LayerElement | null
  /** Selectable layers under the point, deduped in Layers-panel order. */
  hitStack(x: number, y: number): LayerElement[]
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
    // An icon names itself, and that name beats every other candidate: the row
    // for a glyph should read "Compass", not "svg" and not the name of whatever
    // component happened to render it.
    const icon = iconNameOf(element)
    const name =
      icon || (isRoot && info ? info.componentName : label || text || element.tagName.toLowerCase())
    const value: LayerMeta = { info, name, isRoot }
    metaCache.set(element, value)
    return value
  }

  const isLayerRoot = (element: Element) => meta(element).isRoot

  const scopeRoot = () => document.body

  const children = (element: Element): Element[] =>
    Array.from(element.children).filter((child): child is Element => isLayerCandidate(child))

  const layerParent = (element: Element): LayerElement | null => {
    let node = element.parentElement
    while (node) {
      const parent = node.parentElement
      if (isLayerCandidate(node)) return node
      node = parent
    }
    return null
  }

  // Every row here is a node a click can land on, because both go through
  // `toSelectable`: the tree lists an `<svg>` icon exactly when clicking one
  // selects it, and never lists the geometry inside it.
  //
  // A child that resolves to something OTHER than itself resolves upward — that
  // is what `<rect>` inside an icon does — so it is not a layer of its own. The
  // identity test is what keeps that case out: mapping instead of filtering made
  // `layerChildren(svg)` answer `[svg]`, and the tree walk recursed until the
  // stack blew.
  const layerChildren = (container: Element): LayerElement[] =>
    children(container).filter((child): child is LayerElement => toSelectable(child) === child)

  const layerSiblings = (element: Element): LayerElement[] => {
    const siblings = layerChildren(layerParent(element) ?? scopeRoot())
    return siblings.includes(element as LayerElement) ? siblings : []
  }

  const resolve = (hit: Element, scope: Element | null, deep = false): LayerElement | null => {
    if (!isLayerCandidate(hit)) return null
    const target = toSelectable(hit)
    if (!target) return null
    if (deep) return target

    // A click outside the scope leaves it: the alternative is a click that
    // selects nothing, with no visible reason why.
    // `scope` is whatever the last drill landed on, and that can now be an
    // `<svg>`. Testing it for `HTMLElement` here sent every click inside a
    // drilled icon back to the scope root, which read as the whole page
    // selecting itself: containment is the question, not which DOM class.
    const inScope = Boolean(scope && scope.isConnected && scope.contains(target))
    const container = inScope && scope ? scope : scopeRoot()
    if (container === target) return target

    // Climb the shared graph until `node` is a direct child of the active
    // scope. This is the exact node Enter/Tab/Layers can reach later.
    let node: LayerElement | null = target
    while (node) {
      const parent = layerParent(node)
      if (parent === container || (!parent && node.parentElement === container)) return node
      node = parent
    }
    return null
  }

  const hitStack = (x: number, y: number): LayerElement[] => {
    const seen = new Set<LayerElement>()
    const stack: LayerElement[] = []
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
