# design-editor

A visual editor for a running Next.js dev server. It proxies your app, lets you
select an element in the page, edit its Tailwind classes and inline styles, and
writes the change back into the component source.

Nothing in your app imports it, and nothing in it imports your app. It attaches
from the outside, at the proxy, so adopting it is additive and dropping it
leaves no trace in your source tree.

## Requirements

- Node >= 20.9
- A Next.js app with a dev server you can start yourself
- `react-rewrite-cli@0.1.1` exactly. The runtime patches that build's minified
  bundle at serve time against 22 pinned anchors; a different version will not
  patch, and the launcher tells you so instead of starting.

## Install

The package is not published yet, so adopting it means copying the directory.

1. Copy `design-editor/` into your project root.
2. Add the dependencies:

   ```sh
   npm i -D react-rewrite-cli@0.1.1 ws esbuild
   ```

3. Add the scripts:

   ```json
   {
     "scripts": {
       "design": "node design-editor/cli.mjs --no-open 3000",
       "design:build": "node design-editor/build.mjs",
       "verify:design-editor": "node design-editor/cli.mjs --verify"
     }
   }
   ```

4. Build the editor's own UI bundle once (and after any change under `src/`):

   ```sh
   npm run design:build
   ```

5. Ignore the state directory:

   ```
   .local/design-editor/
   ```

## Use

```sh
npm run dev          # your app, on 3000
npm run design       # in a second terminal
```

Open the **proxy** URL the launcher prints — not your dev server. The line to
trust is the one prefixed `[design-editor]`; the vendored CLI prints a banner
just above it that reports the ports it asked for rather than the ones it got.

```
design-editor [appPort] [options]

  appPort                 Dev server port
  --config <path>         Config file (default: nearest one above cwd)
  --proxy-port <n>        Port for the editing proxy the browser loads
  --ws-port <n>           Port for the source-edit WebSocket
  --host <host>           Dev server host (default: localhost)
  --open / --no-open      Open a browser on start (default: no)
  --verify                Check the vendor patch still applies, then exit
  --print-config          Print the resolved config as JSON, then exit
```

`--verify` is worth running in CI. It is the check that fails loudly when a
dependency bump moves the vendored bundle out from under the patch.

## Configure

Optional. With no config file the tool runs against the defaults, which assume
a stock Next.js + Tailwind + shadcn/ui app.

Copy `design-editor/design-editor.config.example.mjs` to
`design-editor.config.mjs` in your project root and delete everything you do
not need. The file is discovered by walking up from the working directory, and
all its paths resolve against the directory holding it.

The three settings most likely to matter:

- **`tailwind.version`** — on Tailwind v4, set `4` and
  `spacingScale: "v4-linear"`, or the editor writes arbitrary values for
  spacing tokens that do exist in your build.
- **`tailwind.colorWords`** — your palette stems, so `bg-brand-500` is written
  as a class rather than as an arbitrary colour.
- **`source.roots`** — the directories the agent may edit.

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
  right: calc(var(--react-rewrite-leva-offset, 0px) + 1rem);
}
```

Both variable names are configurable. Leave the whole `chrome` block out if you
have no dev GUI — an empty selector list is legal and correct.

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

## Testing

```sh
node design-editor/test/ui-change-cases.mjs
```

Levels 1, 2, and 4 run offline against throwaway fixtures. Level 3 needs a
running editor and edits one real component, then asserts the file is restored
byte for byte. Ports and the API prefix come from the same config the launcher
used, via `endpoint.json`.

## Layout

```
cli.mjs                     argv contract and entry point
config.mjs                  defaults, discovery, resolution, browser prelude
build.mjs                   bundles src/ into dist/design-editor.js
runtime/launcher.mjs        vendor resolution, monkey-patches, route mount
runtime/vendor-patch.mjs    the 22 splices against react-rewrite-cli 0.1.1
server/routes.mjs           loopback-guarded HTTP routes
server/options-store.mjs    saved option sets
server/agent.mjs            AI edit transport
src/                        the editor UI, bundled to an IIFE
test/ui-change-cases.mjs    the harness
```

`runtime/` is the only part that knows the vendored CLI exists. Everything the
patches need about your app arrives as resolved config, so replacing the vendor
later is a change confined to those two files.
