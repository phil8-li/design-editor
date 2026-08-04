/**
 * Mounts the editor chrome: a floating toolbar, a layers rail on the left, an
 * inspector on the right, and a transparent overlay layer for canvas chrome.
 *
 * The app is inset with padding on a border-box <html> rather than a transform,
 * because a transformed ancestor would break the app's own `layoutId`
 * shared-element morphs (see docs/agent-rules/card-reader-morph.md).
 */

import { config } from "../core/config"
import { shellCss, vendorChromeCss } from "../core/css"
import { CHROME_ATTR, el } from "../core/dom"
import { tokens } from "../core/tokens"
import type { EditorSlots } from "../core/context"
import { getState, subscribe } from "../core/store"

const STYLE_ID = "design-editor-shell-style"
const VENDOR_STYLE_ID = "design-editor-vendor-suppression"

export interface Shell {
  slots: EditorSlots
  root: HTMLElement
  destroy(): void
}

/**
 * Puts the vendor-chrome suppression inside the vendor's own shadow root.
 *
 * The root is attached when the vendor mounts, which can be after us, and
 * `attachShadow` emits no mutation record — so this retries on a bounded timer
 * rather than observing. Failing to land is not fatal: it only means the
 * vendor's panel stays visible, which is what happened before this existed.
 */
function suppressVendorChrome(): () => void {
  let timer = 0

  const inject = (): boolean => {
    const root = document.getElementById("react-rewrite-root")?.shadowRoot
    if (!root) return false
    if (!root.getElementById(VENDOR_STYLE_ID)) {
      const style = document.createElement("style")
      style.id = VENDOR_STYLE_ID
      style.textContent = vendorChromeCss
      root.append(style)
    }
    return true
  }

  if (!inject()) {
    let attempts = 0
    timer = window.setInterval(() => {
      attempts += 1
      if (inject() || attempts > 60) {
        window.clearInterval(timer)
        timer = 0
      }
    }, 250)
  }

  return () => {
    if (timer) window.clearInterval(timer)
    document.getElementById("react-rewrite-root")?.shadowRoot?.getElementById(VENDOR_STYLE_ID)?.remove()
  }
}

/**
 * Gives our own controls their focus back.
 *
 * The vendor guards the document against the app stealing a gesture: one of its
 * `mousedown` listeners on `document` (capture) calls `preventDefault()` for
 * anything that is not its own shadow chrome. Focus is a *default action* of
 * mousedown, so the caret never lands in our inspector — every field reads as
 * decorative, and typing goes nowhere. Its guard cannot be reordered: it is
 * registered when the vendor boots, which is before our bundle is even parsed.
 *
 * `window` capture runs before `document` capture, so focusing here happens
 * while the event is still untouched. `preventDefault()` afterwards suppresses
 * the default focus move, not a focus already applied by script.
 */
function restoreChromeFocus(): () => void {
  /**
   * Declaw the guard for our own gestures.
   *
   * `window` capture is the first stop in the propagation path, so by the time
   * the vendor's `document`-capture listener calls these, they do nothing: the
   * event keeps descending to our controls and its default action survives.
   * Only events aimed at our chrome are touched, so the vendor keeps its guard
   * everywhere it actually means it — over the app being edited.
   */
  const declaw = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest(`[${CHROME_ATTR}]`)) return
    event.stopPropagation = () => {}
    event.stopImmediatePropagation = () => {}
    event.preventDefault = () => {}

    if (event.type !== "pointerdown") return
    // Belt and braces for focus, which is the one default action that has to
    // survive even if a guard we have not seen yet calls the native methods
    // off a retained reference.
    const focusable = target.closest<HTMLElement>("input, textarea, select, button, [tabindex]")
    // `preventScroll`: the panel is a scroll container, and letting the browser
    // scroll a just-focused field into view would jump the list under the cursor.
    focusable?.focus({ preventScroll: true })
  }

  const types = ["pointerdown", "mousedown", "click", "pointerup", "mouseup", "dblclick"]
  for (const type of types) window.addEventListener(type, declaw, true)
  return () => {
    for (const type of types) window.removeEventListener(type, declaw, true)
  }
}

export function mountShell(): Shell {
  if (!document.getElementById(STYLE_ID)) {
    const style = el("style", { id: STYLE_ID })
    style.textContent = shellCss
    document.head.append(style)
  }

  const overlay = el("div", { class: "de-overlay-layer" })
  const toolbar = el("div", { class: "de-toolbar", role: "toolbar", "aria-label": "Design editor" })

  const left = el("div", { class: "de-panel-body" })
  const leftPanel = el("aside", { class: "de-panel de-panel--left", "aria-label": "Layers" }, [left])

  const right = el("div", { class: "de-panel-body" })
  const rightPanel = el(
    "aside",
    { class: "de-panel de-panel--right", "aria-label": "Inspector" },
    [right]
  )

  const root = el("div", { class: "de-root" }, [overlay, toolbar, leftPanel, rightPanel])
  document.body.append(root)
  document.documentElement.classList.add("design-editor-active")
  const releaseVendorChrome = suppressVendorChrome()
  const releaseChromeFocus = restoreChromeFocus()

  const syncInsets = () => {
    const { layersOpen, inspectorOpen } = getState()
    const style = document.documentElement.style
    leftPanel.hidden = !layersOpen
    rightPanel.hidden = !inspectorOpen
    const panelGutter = tokens.size.panelInset * 2
    style.setProperty(
      "--de-left",
      layersOpen ? `${tokens.size.panelWidth + panelGutter}px` : "0px"
    )
    style.setProperty(
      "--de-right",
      inspectorOpen ? `${tokens.size.inspectorWidth + panelGutter}px` : "0px"
    )
    style.setProperty("--de-top", "0px")
    // The host's docked panel (Leva here) sits against the right edge; keep it
    // clear of the inspector. The property name is the host's to choose.
    style.setProperty(
      config.chrome.dockedPanel.offsetVar,
      inspectorOpen ? `-${tokens.size.inspectorWidth + panelGutter}px` : "0px"
    )
  }

  syncInsets()
  // Only the two panel toggles move the insets. `hovered` changes on every
  // pointermove, so an unguarded subscription would write inline custom
  // properties — and force a style recalc of the whole app — on mouse motion.
  const unsubscribe = subscribe((next, previous) => {
    if (
      next.layersOpen === previous.layersOpen &&
      next.inspectorOpen === previous.inspectorOpen
    ) {
      return
    }
    syncInsets()
  })

  return {
    slots: { overlay, toolbar, left, right },
    root,
    destroy() {
      unsubscribe()
      releaseVendorChrome()
      releaseChromeFocus()
      root.remove()
      document.documentElement.classList.remove("design-editor-active")
      document.documentElement.style.removeProperty("--de-left")
      document.documentElement.style.removeProperty("--de-right")
      document.documentElement.style.removeProperty("--de-top")
      document.documentElement.style.removeProperty(config.chrome.dockedPanel.offsetVar)
      document.getElementById(STYLE_ID)?.remove()
    },
  }
}
