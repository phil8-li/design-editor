/**
 * Entry point for the Figma-style design editor overlay.
 *
 * Loaded by the dev proxy on :3456 after the vendored React Rewrite bundle,
 * which we drive headlessly for fiber -> source resolution and source writes.
 * Nothing here runs on :3000.
 */

import { whenBridgeReady } from "./core/bridge"
import { createContext } from "./core/context"
import { mountShell } from "./shell/shell"
import { installToolbar } from "./shell/toolbar"
import { installCanvas } from "./canvas"
import { installLayersPanel } from "./panels/layers"
import { installInspector } from "./panels/inspector"

async function boot(): Promise<void> {
  let bridge
  try {
    bridge = await whenBridgeReady()
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

  context.refresh()
  console.info("[design-editor] Figma-style overlay ready")
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot())
} else {
  void boot()
}
