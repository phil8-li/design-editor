/**
 * The shell stylesheet.
 *
 * Scoped under `[data-design-editor]` so it can never leak into the app being
 * edited, and the app's own cascade can never reach in.
 */

import { baseCss, vendorChromeCss } from "./css/base"
import { toolbarCss } from "./css/toolbar"
import { panelsCss } from "./css/panels"
import { inspectorCss } from "./css/inspector"
import { codeCss } from "./css/code"
import { promptsCss } from "./css/prompts"
import { layersCss } from "./css/layers"
import { optionsCss } from "./css/options"
import { canvasCss } from "./css/canvas"
import { tokenPickerCss } from "./css/token-picker"
import { variantsCss } from "./css/variants"

/**
 * Concatenated in source order so the cascade is unchanged. Each module is
 * owned by the lane that owns the surface it styles; joining here keeps the
 * single `shellCss` export the shell already imports.
 */
export const shellCss =
  baseCss +
  toolbarCss +
  panelsCss +
  // After `panels`, because the tab host re-lays out `.de-panel-body` for the
  // right panel only and has to win on equal specificity.
  inspectorCss +
  codeCss +
  promptsCss +
  layersCss +
  optionsCss +
  canvasCss +
  tokenPickerCss +
  variantsCss

export { vendorChromeCss }
