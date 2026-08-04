/**
 * The shell stylesheet.
 *
 * Scoped under `[data-design-editor]` so it can never leak into the app being
 * edited, and the app's own cascade can never reach in.
 */

import { baseCss, vendorChromeCss } from "./css/base"
import { toolbarCss } from "./css/toolbar"
import { panelsCss } from "./css/panels"
import { layersCss } from "./css/layers"
import { optionsCss } from "./css/options"
import { canvasCss } from "./css/canvas"

/**
 * Concatenated in source order so the cascade is unchanged. Each module is
 * owned by the lane that owns the surface it styles; joining here keeps the
 * single `shellCss` export the shell already imports.
 */
export const shellCss = baseCss + toolbarCss + panelsCss + layersCss + optionsCss + canvasCss

export { vendorChromeCss }
