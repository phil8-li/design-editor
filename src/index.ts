/**
 * Entry point for the Figma-style design editor overlay.
 *
 * Loaded by the dev proxy on :3456 after the vendored React Rewrite bundle,
 * which we drive headlessly for fiber -> source resolution and source writes.
 * Nothing here runs on :3000.
 */

import { whenBridgeReady } from "./core/bridge"
import { createContext } from "./core/context"
import { whenHostHydrated } from "./core/host-readiness"
import { mountShell } from "./shell/shell"
import { installToolbar } from "./shell/toolbar"
import { installCanvas } from "./canvas"
import { installLayersPanel } from "./panels/layers"
import { installInspector } from "./panels/inspector"
import { installOptionsBrowser } from "./options/inventory-panel"

async function boot(): Promise<void> {
  let bridge
  try {
    ;[bridge] = await Promise.all([whenBridgeReady(), whenHostHydrated()])
  } catch (error) {
    console.warn("[design-editor]", error)
    return
  }

  const shell = mountShell()
  const context = createContext(bridge, shell.slots)

  installToolbar(context)
  installLayersPanel(context)
  installInspector(context)
  installCanvas(context)
  // Eagerly, not from the inspector's options section: browsing what controls
  // exist is the answer to "I cannot tell what options we have", and that
  // question is asked before anything is selected.
  installOptionsBrowser(context)

  context.refresh()
  console.info("[design-editor] Figma-style overlay ready")
}

void boot()
