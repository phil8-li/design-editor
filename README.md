# design-editor

A visual editor for a running Next.js dev server. It proxies your app, lets you
select an element in the page, edit its Tailwind classes and inline styles, and
writes the change back into the component source.

Nothing in your app imports it, and nothing in it imports your app. It attaches
from the outside, at the proxy, so adopting it is additive and dropping it
leaves no trace in your source tree.

## Requirements

- Node >= 20.9
- A Next.js app with a dev script (the start screen and `--dev` both run it for
  you; with neither, start the dev server yourself first)
- App Router and Pages Router are both supported, and neither requires a
  `next.config` file. The overlay can inspect any Next app; durable layout and
  appearance edits currently write Tailwind utilities, so full visual editing
  requires Tailwind. Text edits do not.
- The package installs `react-rewrite-cli@0.1.1` exactly. The runtime patches
  that build's minified bundle at serve time against 23 pinned anchors; a
  different version will not patch, and the launcher tells you so instead.

## Install

The package is currently distributed privately. Install the directory or a
packed tarball as a development dependency; its prepare script builds the
browser bundle when installing from source.

1. Install it from a sibling checkout:

   ```sh
   npm i -D ../design-editor
   ```

   To hand off one immutable artifact instead, run `npm pack` in this package
   and install the resulting `.tgz` file.

2. Optionally add the scripts. The start screen needs neither — they are the
   shortcut for a project you open every day:

   ```json
   {
     "scripts": {
       "design": "design-editor --dev --open 3000",
       "verify:design-editor": "design-editor --verify"
     }
   }
   ```

3. When developing the package itself, rebuild after a change under its `src/`:

   ```sh
   npm run build
   ```

4. Ignore the state directory:

   ```
   .local/design-editor/
   ```

## Use

```sh
npx design-editor
```

With no arguments it opens a start screen in your browser and asks two
questions: which app, and where its source is.

- **Which app.** It scans the usual dev-server ports and lists what answered, by
  page title, so `Workspaces` is what you click rather than `127.0.0.1:3000`.
  Nothing running yet is fine — type the URL you want and it will start the app
  for you.
- **Where its source is.** Paste a folder path, or browse to one. It reads that
  folder's `package.json` to confirm it is the right project and to find the dev
  script, and tells you what it is about to run before you commit to it.

Press the button and it does the rest: starts the dev server if it has to, waits
for the app to answer, mounts the editing proxy in front of it, and puts the tab
you are already in onto the editor. The page you land on is your app — the
editor is the chrome around it.

The two answers are the whole flow, so nothing about your project has to change
first. There is no config file to write, no script to add, and no dependency to
install into the app you are editing.

### From the command line instead

If you already know the port, name it and the start screen is skipped:

```sh
npm run design            # design-editor --dev --open 3000
```

If a dev server is already up on the port, it attaches to that one instead and
leaves it alone, including on the way out: `Ctrl+C` only stops a server this
command started.

Without `--dev` the app has to be running already, and the launcher says so
rather than failing inside the vendor's health check. Without `--open`, open the
**proxy** URL it prints — not your dev server. The line to trust is the one
prefixed `[design-editor]`; the vendored CLI prints a banner just above it that
reports the ports it asked for rather than the ones it bound.

```
design-editor [appPort] [options]

  (no arguments)          Open the start screen: pick a running app and its folder
  appPort                 Dev server port
  --start / --no-start    Force or skip the start screen (default: when no port is known)
  --dev                   Start the app's dev server too, and attach when it is up
  --dev-script <name>     npm script --dev runs (default: app.devScript, "dev")
  --config <path>         Config file (default: nearest one above cwd)
  --proxy-port <n>        Port for the editing proxy the browser loads
  --ws-port <n>           Port for the source-edit WebSocket
  --host <host>           Dev server host (default: 127.0.0.1)
  --open / --no-open      Open the editing URL on start (default: no)
  --verify                Check the vendor patch still applies, then exit
  --print-config          Print the resolved config as JSON, then exit
```

`--dev` runs your own npm script with `PORT` set, so whatever that script
already does — env files, wrappers, extra flags — keeps happening. The start
screen takes the same path: the script it names in the hint is the one it runs.

Because the folder you choose is the project root, the config file is discovered
from there rather than from wherever you happened to be standing when you typed
the command.

`--verify` is worth running in CI. It is the check that fails loudly when a
dependency bump moves the vendored bundle out from under the patch.

Every edit is undoable with the platform's own pair — `⌘Z` and `⇧⌘Z` on macOS,
`Ctrl+Z` and `Shift+Ctrl+Z` elsewhere — and with the two toolbar buttons, which
run the same call. The timeline lives on the writer rather than on the panels,
so a section added later is undoable without being wired up for it, and it
covers the preview and the queued source operation together: undoing a change
also takes back what "Apply to code" would have written.

## Configure

Optional. With no config file the tool runs against generic defaults for a
stock Next.js + Tailwind + shadcn/ui app. It does not look for Leva,
Agentation, or any host dev panel unless the host opts in.

Copy `design-editor/design-editor.config.example.mjs` to
`design-editor.config.mjs` in your project root and delete everything you do
not need. The file is discovered by walking up from the working directory, and
all its paths resolve against the directory holding it.

The settings most likely to matter:

- **`tailwind.version`** — on Tailwind v4, set `4` and
  `spacingScale: "v4-linear"`, or the editor writes arbitrary values for
  spacing tokens that do exist in your build.
- **`tailwind.breakpoints`** — the responsive prefixes the inspector offers;
  the default is Tailwind's `sm` through `2xl` scale.
- **`tailwind.containerBreakpoints`** — the separate container-query scale.
  It is empty by default because container variants are host-dependent.
- **`tailwind.colorWords`** — your palette stems, so `bg-brand-500` is written
  as a class rather than as an arbitrary colour.
- **`designSystem.manifest`** — the canonical token catalog displayed beside
  the selected element. Add `designSystem.cssSources` to map authored CSS and
  Tailwind aliases back to those tokens.
- **`icons`** — your icon set, so a selected `<svg>` names itself and the
  inspector can offer the other drawings as variants.
- **`source.roots`** — the directories the agent may edit.

### Design-system catalog

The optional catalog keeps the package generic while letting a host expose its
real token vocabulary in the inspector:

```js
designSystem: {
  manifest: "docs/design-tokens.json",
  cssSources: ["app/globals.css"],
},
```

The manifest may contain `Color`, `Spacing`, and `Radius` collections plus
`textStyles`, `uiTextStyles`, `effectStyles`, `iconScale`, and `motion` arrays.
Every one of them is optional. A design system with no motion tokens and no
text styles simply omits those keys; the axis resolves empty and the inspector
drops the row rather than drawing a picker with nothing in it. What the launcher
validates is the groups you did supply — a group that is present and the wrong
shape fails at startup with its field name, so a stale generated manifest is
caught, while a smaller design system is not mistaken for a broken one.

`designSystem.trackingUnit` — `"em"` or `"px"` — states the unit your text
styles express letter-spacing in. It is declared rather than inferred: `-0.5` is
a plausible em and a plausible px, and guessing by magnitude makes a text style
stop matching the moment a host writes tracking the other way. A manifest may
carry its own `trackingUnit`; the config's value wins.

### A design system that is not a manifest

Some hosts keep tokens in a TypeScript module, a Style Dictionary build, or a
CMS. `designSystem.adapter` is the escape hatch — one function, called with
`{ projectRoot }`, returning the same token groups the manifest path produces:

```js
designSystem: {
  adapter: () => ({
    name: "Lattice",
    colors: Object.entries(palette).map(([name, light]) => ({
      id: `color:${name}`, name, category: "color",
      cssVar: `--lattice-${name}`, values: { light },
    })),
  }),
  cssSources: ["app/globals.css"],
},
```

Everything downstream — alias resolution, the pickers, the inspector rows — is
identical, because the adapter produces the catalog rather than a second kind of
catalog. `manifest` and `adapter` are mutually exclusive; supplying both is
refused at startup instead of silently ranked.

### Tailwind aliases, v4 and v3

On Tailwind v4 the theme lives in the stylesheet, so the editor reads
`@theme` custom properties and traces them back to tokens.
`tailwind.themeNamespaces` says which namespaces your app declares; the default
is Tailwind's own `color`, `radius`, `text`, and `shadow`. Extend it for
anything else you compile, and note that a longer name wins over a shorter
prefix — listing `"text-shadow"` keeps `--text-shadow-lift` out of the
typography axis.

On Tailwind v3 there is no theme block to read, so point the editor at the
config file, or hand it the scale directly:

```js
designSystem: {
  tailwindConfig: "tailwind.config.js",   // or
  tailwindTheme: { color: { ink: "var(--ink)" }, radius: { card: "6px" } },
},
```

`colors`, `borderRadius`, `fontSize`, and `boxShadow` map onto the catalog's
colour, radius, text, and shadow axes. A scale entry may be a `var()`, which is
traced like a v4 alias, or a literal, which is matched against the token's own
value — so `brand: "#0b7285"` still resolves to the token that holds that
colour. Without either key a v3 host resolves no Tailwind aliases at all.

### Host icon set

Separate from `designSystem.iconScale`, which is the icon *size* scale. This is
the drawing data, and it turns a selected `<svg>` into a layer with a name and a
list of alternatives:

```js
icons: {
  attribute: "data-instagram-icon",
  data: "src/components/icons/instagram-icon-data.json",
},
```

`attribute` is the DOM attribute your icon factory stamps each glyph with — that
is how a selection names itself. `data` is a JSON map of name to
`{ nodes: [[tag, attrs, children?]], rootFill, rootStroke? }`, the shape a React
icon factory already stores, so a host points at the file its components render
and writes no adapter. Both halves or neither: an attribute with no data names
icons the picker cannot offer, and data with no attribute cannot be matched to a
selection. Leave the block out and the inspector's icon section never renders.

The set is served on request by `GET {apiPrefix}/icons` rather than shipped in
the browser prelude, because it is path data measured in hundreds of kilobytes
and most sessions never open the panel. Only the attribute and a boolean cross
into the browser at load.

A swap redraws the glyph in place and says "preview only" every time: the source
writer speaks in classes and text, and the JSX still names the component it
always did. Width, height, and class are left alone — size and colour belong to
the call site that placed the icon, not to the drawing.

### Responsive metadata

Two facts, deliberately kept apart. `tailwind.breakpoints` says which variant
prefixes your build **compiles**; the optional `designSystem.breakpoints` says
which of those steps your design system has a **meaning** for:

```js
tailwind: {
  breakpoints: { sm: 640, md: 768, lg: 1024 },
  containerBreakpoints: { md: 448, lg: 512, xl: 576 },
},
designSystem: {
  breakpoints: {
    md: { usage: "Sheet: the nav stops docking and floats over the canvas.",
          owner: "src/hooks/use-mobile.ts" },
  },
  containerBreakpoints: {
    xl: { usage: "Cards: switch to two columns.", owner: "src/cards.tsx" },
  },
  responsiveMeasures: {
    contentFits: {
      formula: "viewport - navigation >= 720px",
      usage: "Whether the reading column keeps its minimum measure.",
      owner: "src/layout.ts",
    },
  },
},
```

Viewport and container pixels keep separate owners in `tailwind.breakpoints`
and `tailwind.containerBreakpoints`; annotations may only add prose. Naming a
step its corresponding map does not define fails at startup. A prefix you leave
unannotated still appears in the inspector because it compiles, but it is marked
as outside the design system rather than presented as a decision someone made.
Responsive measures are read-only metadata: they describe product layout rules
that cannot be represented honestly as one editable CSS declaration.

CSS sources are scanned for custom-property chains and Tailwind `@theme`
aliases. Resolution stops at a manifest-owned custom property: for example,
`--color-background` may point through `--background` to
`--sem-background-primary`. Conflicting declarations are retained as ambiguous
aliases rather than assigned to one token. Only the normalized catalog enters
the browser prelude; manifest and stylesheet paths remain server-side.

### Dev chrome

If your app renders a dev-only GUI, list its selectors in
`chrome.trustedSelectors` so the editor treats it as furniture rather than as
something you meant to restyle. `chrome.dockedPanel` goes one step further and
keeps the editor's inspector beside that panel instead of on top of it: the
editor publishes the panel's width and its own offset as two CSS variables, and
your stylesheet reads them to make room.

```css
/* only if you set chrome.dockedPanel */
.my-dev-panel {
  right: calc(var(--design-editor-dev-panel-offset, 0px) + 1rem);
}
```

Both variable names are configurable. Leave the whole `chrome` block out if you
have no dev GUI — an empty selector list is legal and correct.

### Contextual controls and source defaults

Leva integration is optional and explicit. Configure `controls.leva.storeGlobal`
to inventory the live controls. A binding connects a path pattern to the DOM
elements it affects; first match wins, `*` matches one path segment, and `**`
matches any suffix. The editor never infers relationships from names.

```js
controls: {
  leva: {
    storeGlobal: "__STORE",
    sourceDefaults: {
      file: "src/design-defaults.ts",
      exportName: "DESIGN_DEFAULTS",
    },
    bindings: [{
      pathPattern: "Cards.Spacing.*",
      selectors: ["[data-card]"],
      relationship: "spacing within",
      defaultGroup: "Card spacing",
    }],
  },
}
```

`sourceDefaults` must name an exported object literal. Its groups must also be
object literals, and editable values must be string, finite-number, boolean, or
null literals. Dynamic expressions and files outside `source.roots` are refused.
Writes replace only the target literal; unrelated comments and formatting stay
untouched.

Activating “Show affected” dispatches
`design-editor:highlight-elements` on `window`. The event detail is
`{ path, relationship, selectors, elements }`; a canvas integration may draw
those elements without coupling the options inventory to canvas state.

## What it writes, and where

- **Your component source**, only through an explicit edit, and only for files
  that pass both the extension allowlist and a denylist you cannot widen
  (`.env*`, `*.config.*`, `node_modules`, `.git`). If `source.roots` is set,
  files outside those roots are refused as well.
- **`<stateDir>/options.json`** — saved option sets, written atomically.
- **`<stateDir>/requests/`** — AI handoff files, when no Claude CLI is on PATH.
- **`<stateDir>/endpoint.json`** — the ports actually bound, so tooling can find
  a running instance without guessing.

## Security model

This process edits files in your project, so it is a development tool and
nothing else. Ship it nowhere near production.

- Every route refuses a request that is not loopback, by peer address, `Host`,
  and `Origin`.
- Both servers are forced to bind `127.0.0.1`, overriding the vendored CLI,
  which binds every interface.
- The file allowlist above is the only thing standing between the browser and
  `.env.local`, which lives in the same project root as your components. Keep
  `source.extensions` restrictive.

## Performance boundary

The host application never imports this package. A normal development server
and every production build therefore ship zero editor JavaScript; the editor
bundle is injected only by the separate proxy started with `design-editor`.

While that proxy is active, selection geometry is tracked only while an element
is selected, hovered, or highlighted. The shared animation-frame loop stops
when idle, batches layout reads before overlay writes, and reads computed styles
only while Option/Alt measurement is active.

## Testing

```sh
npm test                                        # no host needed
DESIGN_EDITOR_HOST=../Workspaces npm test       # plus the host-pinned suites
npm run test:standalone-next                    # needs a host
```

Most of the suite runs against this repository alone. Four suites —
`token-cases`, `responsive-cases`, `picker-cases`, `icon-set-cases` — pin a real
app's own catalog, breakpoints and icon set, deliberately: they are the net that
catches a change to the tool silently changing what a real app sees. They find
that app through `test/host.mjs`, which is the single owner of "where is the
host": `DESIGN_EDITOR_HOST` if set, otherwise a `Workspaces` checkout beside
this one. With neither present they print a skip and exit 0, so a bare clone is
green and a skip never reads as a pass.

The package suite covers its npm-bin entry point, options, selection, shell,
hydration readiness, and offline source translation.
`test/host-agnostic-cases.mjs` is the decoupling proof: three synthetic hosts
under `test/fixtures` — a Tailwind v4 app whose `@theme` namespaces are spelled
differently from this repo's, a Tailwind v3 app with a classic config scale and
no motion or text tokens at all, and an adapter-only app with no manifest — each
resolving a catalog, aliases, and inspector rows. It never reads the repository
the package sits in. The standalone test packs
the package, installs it into a throwaway config-free Next app, and verifies the
isolated proxy and source-write path in both the App and Pages Routers. To
exercise the live write path against the current app, run
`node test/ui-change-cases.mjs` while the editor is running. Its live levels use
throwaway fixtures and restore the one real component they touch byte for byte.
Ports and the API prefix come from the launcher's `endpoint.json`.

## Layout

```
cli.mjs                     argv contract and entry point
config.mjs                  defaults, discovery, resolution, browser prelude
build.mjs                   bundles src/ into dist/design-editor.js and dist/tokens.mjs
runtime/start-screen.mjs    the loopback server behind the no-arguments flow
runtime/start-screen-page.mjs   its document, and the script that drives it
runtime/start-screen-style.mjs  its stylesheet, built from the editor's tokens
runtime/local-apps.mjs      port scan, project inspection, folder listing
runtime/launcher.mjs        vendor resolution, monkey-patches, route mount
runtime/vendor-patch.mjs    the 23 splices against react-rewrite-cli 0.1.1
server/design-system-config.mjs token manifest and authored-alias normalization
server/icon-set.mjs         the host icon set, read once and served on request
server/routes.mjs           loopback-guarded HTTP routes
server/options-store.mjs    saved option sets
server/control-defaults.mjs configured literal default reader/writer
server/agent.mjs            AI edit transport
src/                        the editor UI, bundled to an IIFE
test/host.mjs               where this package is, and where a host app is
test/ui-change-cases.mjs    the harness
```

`runtime/` is the only part that knows the vendored CLI exists. Everything the
patches need about your app arrives as resolved config, so replacing the vendor
later is a change confined to those two files.
