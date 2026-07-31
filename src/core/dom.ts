/**
 * DOM helpers for the overlay chrome.
 *
 * The overlay is plain DOM on purpose: it renders inside the same document as
 * the app, and mounting a second React tree there would fight the app's own
 * reconciler and Motion layout animations.
 */

export const CHROME_ATTR = "data-design-editor"

type Props = Record<string, string | number | boolean | EventListener | undefined>

/** Creates a chrome element. Handlers are any `on*` prop; the rest are attrs. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Array<Node | string | null | undefined> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.setAttribute(CHROME_ATTR, "")

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
      continue
    }
    if (key === "class") {
      node.className = String(value)
      continue
    }
    if (key === "style") {
      node.setAttribute("style", String(value))
      continue
    }
    node.setAttribute(key, value === true ? "" : String(value))
  }

  for (const child of children) {
    if (child === null || child === undefined) continue
    node.append(typeof child === "string" ? document.createTextNode(child) : child)
  }

  return node
}

/** True when the node belongs to our chrome, Leva, or the vendor overlay. */
export function isChrome(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false
  return Boolean(
    node.closest(
      `[${CHROME_ATTR}],#react-rewrite-root,#leva__root,[data-leva-chrome],[data-agentation-root]`
    )
  )
}

/**
 * True when the element is part of the app under edit (not chrome).
 *
 * `Element`, not `HTMLElement`: every lucide icon is an `SVGElement`, and under
 * a component-boundary model each one is an instance root. Narrowing here used
 * to make a click on an icon *clear* the selection and let the app navigate.
 * Read classes off these with `getAttribute("class")` — `SVGElement.className`
 * is an `SVGAnimatedString`, not a string.
 */
export function isCanvasElement(node: EventTarget | null): node is Element {
  if (!(node instanceof Element)) return false
  if (isChrome(node)) return false
  return node !== document.documentElement && node !== document.body
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Rounds to at most `places` decimals and drops trailing zeroes. */
export function round(value: number, places = 2): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
