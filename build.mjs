#!/usr/bin/env node
/**
 * Bundles the design-editor overlay, and the tokens the start screen needs.
 *
 * The overlay output is concatenated onto the vendored React Rewrite bundle by
 * the package runtime, so it must be a self-contained IIFE with no imports and
 * no globals beyond the bridge it reads from `window`.
 *
 * The tokens output exists because `src/core/tokens.ts` is the only source of
 * colour in this package and the start screen is served by plain ESM, before
 * any bundling happens and with no TypeScript loader in the process. Emitting
 * the same module twice — once into the browser IIFE, once as ESM Node can
 * import — is what lets the front door wear the chrome without a second copy
 * of the values.
 */

import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const tsconfig = path.join(root, "tsconfig.json")
const watch = process.argv.includes("--watch")
const check = process.argv.includes("--check")

const shared = {
  absWorkingDir: root,
  bundle: true,
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
  tsconfig,
}

const TARGETS = [
  {
    label: "design-editor bundle",
    outfile: path.join(root, "dist", "design-editor.js"),
    options: {
      ...shared,
      entryPoints: [path.join(root, "src", "index.ts")],
      format: "iife",
      platform: "browser",
      target: ["chrome110", "safari16"],
    },
  },
  {
    label: "token module",
    outfile: path.join(root, "dist", "tokens.mjs"),
    options: {
      ...shared,
      entryPoints: [path.join(root, "src", "core", "tokens.ts")],
      format: "esm",
      platform: "neutral",
    },
  },
]

async function run() {
  for (const target of TARGETS) {
    const result = await build({
      ...target.options,
      outfile: target.outfile,
      write: !check,
    })

    if (!check) {
      console.log(`Built ${path.relative(process.cwd(), target.outfile)}`)
      continue
    }

    const fresh = Buffer.from(result.outputFiles?.[0]?.contents ?? new Uint8Array())
    if (!fs.existsSync(target.outfile)) {
      console.error(`FAIL ${target.label} is missing — run \`npm run design:build\``)
      process.exit(1)
    }
    // Compiling proves the source is valid; it does not prove `dist/` matches it.
    // The launcher serves whatever is on disk, so a stale bundle means the running
    // editor is older than the reviewed source — and every other check passes.
    const onDisk = fs.readFileSync(target.outfile)
    if (!fresh.equals(onDisk)) {
      console.error(
        `FAIL ${target.label} is stale — dist/ is ${onDisk.length} bytes, ` +
          `src/ compiles to ${fresh.length}. Run \`npm run design:build\`.`
      )
      process.exit(1)
    }
    console.log(`PASS ${target.label} compiles and matches dist/ (${fresh.length} bytes)`)
  }
}

if (watch) {
  const { context } = await import("esbuild")
  for (const target of TARGETS) {
    const ctx = await context({ ...target.options, outfile: target.outfile })
    await ctx.watch()
  }
  console.log("Watching design-editor sources…")
} else {
  await run()
}
