/**
 * Waits until the host React tree has claimed its server-rendered DOM.
 *
 * The editor is injected outside the app, so it cannot use a host component's
 * effect as a hydration signal. Next's `afterInteractive` contract also allows
 * a script to run after only part of the page has hydrated. React does attach a
 * Fiber/props expando to each claimed host element in both development and
 * production builds, so that is the narrow signal we need before changing
 * attributes on `<html>` or adding editor chrome to `<body>`.
 */

const REACT_HOST_PREFIXES = ["__reactFiber$", "__reactProps$"]
const MAX_ELEMENTS_TO_SCAN = 128
const DEFAULT_TIMEOUT_MS = 10_000

function isEditorTree(element: Element): boolean {
  return (
    element.matches("[data-design-editor], #react-rewrite-root, nextjs-portal") ||
    Boolean(element.closest("[data-design-editor], #react-rewrite-root, nextjs-portal"))
  )
}

function hasReactHostMarker(element: Element): boolean {
  return Object.getOwnPropertyNames(element).some((name) =>
    REACT_HOST_PREFIXES.some((prefix) => name.startsWith(prefix))
  )
}

/** True once a host-owned React element has been hydrated or client-rendered. */
export function hasHydratedReactHost(root: Document = document): boolean {
  const queue: Element[] = [root.documentElement]

  for (let index = 0; index < queue.length && index < MAX_ELEMENTS_TO_SCAN; index += 1) {
    const element = queue[index]
    if (isEditorTree(element)) continue
    if (hasReactHostMarker(element)) return true
    queue.push(...element.children)
  }

  return false
}

function afterTwoPaints(resolve: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(resolve))
}

/**
 * Resolves after React claims host markup and completes two paint turns. The
 * bounded fallback keeps the editor available if React changes its private
 * marker names; by then the document has long since passed normal hydration.
 */
export function whenHostHydrated(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now()

    const poll = () => {
      if (hasHydratedReactHost() || performance.now() - started >= timeoutMs) {
        afterTwoPaints(resolve)
        return
      }
      requestAnimationFrame(poll)
    }

    poll()
  })
}
