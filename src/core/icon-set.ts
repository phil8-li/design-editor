/**
 * The host's icon set in the browser: what a selected `<svg>` is called, and
 * which other drawings it can be swapped for.
 *
 * Fetched rather than injected. The set this package was built against is 114KB
 * of path data, and a page load that never opens the inspector should not pay
 * for it. One in-flight promise is shared, so ten icon selections in a row make
 * one request.
 *
 * Nothing here knows the host's attribute name — `config.icons.attribute` does.
 * A host with no icon set configured gets an empty list and the icon section
 * never renders.
 */

import { config } from "./config"
import type { IconData } from "./icons"

export interface IconVariant extends IconData {
  name: string
}

let cache: IconVariant[] | null = null
let inFlight: Promise<IconVariant[]> | null = null

/** The attribute an icon names itself with, or "" when the host declared none. */
export function iconAttribute(): string {
  return config.icons.attribute
}

/**
 * The icon this element IS, not the icon it contains.
 *
 * Only an `<svg>` answers: a button wrapping an icon is a button, and letting
 * the wrapper answer would offer a variant swap that rewrote a child the user
 * did not select.
 */
export function iconNameOf(element: Element | null): string {
  const attribute = iconAttribute()
  if (!attribute || !(element instanceof SVGSVGElement)) return ""
  return element.getAttribute(attribute)?.trim() ?? ""
}

/** The set, loaded once. Empty when the host configured none, or on failure. */
export function loadIconSet(apiBase: string): Promise<IconVariant[]> {
  if (cache) return Promise.resolve(cache)
  if (!config.icons.available) return Promise.resolve([])
  inFlight ??= fetch(`${apiBase}/icons`, { headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as { icons?: IconVariant[] }
      cache = Array.isArray(payload.icons) ? payload.icons : []
      return cache
    })
    .catch((error) => {
      console.warn("[design-editor] could not load the icon set", error)
      // Not cached: a dev server that was still starting should be asked again.
      inFlight = null
      return []
    })
  return inFlight
}

/** What is already loaded, for a synchronous render that must not wait. */
export function loadedIconSet(): IconVariant[] {
  return cache ?? []
}
