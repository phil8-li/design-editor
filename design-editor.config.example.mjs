/**
 * Copy to `design-editor.config.mjs` in your project root.
 *
 * Every key is optional. The tool runs with no config file at all; a key is
 * worth setting only where your app differs from the defaults below, which
 * target a stock Next.js + Tailwind + shadcn/ui app.
 *
 * Paths are resolved against the directory holding this file, so the project
 * root travels with the config rather than with the installed package.
 */

const config = {
  app: {
    // Dev server port. Omit to pass one on the command line instead.
    port: 3000,
    host: "127.0.0.1",
    open: false,
  },

  // "auto" lets the tool take the first free port near the vendor's defaults.
  // Pin these when something else needs to know where the editor lives; a
  // pinned port that is busy stops the launch instead of moving silently.
  ports: { proxy: "auto", ws: "auto" },

  // Where the editor keeps saved option sets, agent handoffs, and the
  // endpoint file. Add it to .gitignore.
  stateDir: ".local/design-editor",

  // Route prefix for the editor's own endpoints, served on the proxy origin.
  // Change it only if it collides with one of your app's routes.
  apiPrefix: "/__design-editor",

  // Optional canonical token manifest. Keep `manifest` null for a generic
  // install. CSS sources let the editor connect authored custom properties and
  // Tailwind theme aliases back to the manifest without exposing these paths
  // to the browser.
  designSystem: {
    manifest: null, // e.g. "docs/design-tokens.json"
    cssSources: [], // e.g. ["app/globals.css"]
  },

  chrome: {
    // Elements the editor must treat as its own furniture rather than as
    // canvas: your dev GUI, debug bars, anything that is not the product.
    // Leave the array empty if you have none.
    trustedSelectors: ["[data-my-dev-toolbar]"],

    // A dev panel the editor should sit beside instead of overlapping. The
    // two CSS variables are the contract: your stylesheet reads them to make
    // room. Drop this block entirely if you have no such panel.
    dockedPanel: {
      selector: "[data-my-dev-panel]",
      fallbackSelector: "",
      chromeSelectors: ["[data-my-dev-panel]"],
      offsetVar: "--design-editor-dev-panel-offset",
      widthVar: "--design-editor-dev-panel-width",
      minWidth: 260,
      maxWidth: 380,
      gap: 12,
      edgeGap: 8,
    },
  },

  // Optional. Without this block the package does not look for Leva at all.
  controls: {
    leva: {
      // Window property containing Leva's dev store.
      storeGlobal: "__STORE",

      // Optional source-backed defaults. The export must be an object literal
      // whose groups are object literals and whose editable values are literals.
      sourceDefaults: {
        file: "src/design-defaults.ts",
        exportName: "DESIGN_DEFAULTS",
      },

      // First match wins. Selectors and relationships are explicit: the editor
      // never guesses affected elements from a control's path.
      bindings: [
        {
          pathPattern: "Cards.Spacing.*",
          selectors: ["[data-card]"],
          relationship: "spacing within",
          defaultGroup: "Card spacing",
          // Omit to use the control's leaf key; "$key" is also supported.
          defaultKey: "$key",
        },
      ],
    },
  },

  tailwind: {
    // 3 uses Tailwind's discrete spacing table. 4 resolves every multiple of
    // `spacingBase`, so set `spacingScale: "v4-linear"` there to stop the
    // editor writing arbitrary values for tokens that now exist.
    version: 3,
    spacingScale: "v3-default",
    spacingBase: 4,
    breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 },

    // Your own colour stems, ADDED to Tailwind's palette and the shadcn
    // semantic tokens. A stem listed here is written as `bg-brand-500`; a
    // stem omitted is written as an arbitrary value, which is safe but ugly.
    colorWords: [],

    fontSizes: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"],
    fontFamilies: ["sans", "serif", "mono"],
  },

  source: {
    // Directories the agent may edit. An empty array means the whole project
    // root, minus the extension allowlist and a denylist you cannot widen
    // (.env*, *.config.*, node_modules, .git). Narrow this if the tool is
    // pointed at a repo holding anything you would not paste into a prompt.
    roots: ["src", "app", "components"],
    extensions: [".tsx", ".jsx", ".ts", ".js"],
  },

  agent: {
    // "auto" uses the Claude CLI when it is on PATH and otherwise writes a
    // handoff file under stateDir. "handoff" never shells out.
    transport: "auto",
    model: "claude-sonnet-4-6-20250514",
    maxTokens: 4096,
    systemPrompt: null,
  },
}

export default config
