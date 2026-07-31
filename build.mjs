#!/usr/bin/env node
/**
 * Bundles the design-editor overlay.
 *
 * The output is concatenated onto the vendored React Rewrite bundle by
 * `scripts/run-design-editor.mjs`, so it must be a self-contained IIFE with no
 * imports and no globals beyond the bridge it reads from `window`.
 */

import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const outfile = path.join(root, "dist", "design-editor.js")
const watch = process.argv.includes("--watch")
const check = process.argv.includes("--check")

async function run() {
  const result = await build({
    entryPoints: [path.join(root, "src", "index.ts")],
    outfile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome110", "safari16"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
    write: !check,
  })

  if (check) {
    const bytes = result.outputFiles?.[0]?.contents.length ?? 0
    const onDisk = fs.existsSync(outfile) ? fs.statSync(outfile).size : -1
    if (onDisk === -1) {
      console.error("FAIL design-editor bundle is missing — run `npm run design:build`")
      process.exit(1)
    }
    console.log(`PASS design-editor bundle compiles (${bytes} bytes)`)
    return
  }

  console.log(`Built ${path.relative(process.cwd(), outfile)}`)
}

if (watch) {
  const { context } = await import("esbuild")
  const ctx = await context({
    entryPoints: [path.join(root, "src", "index.ts")],
    outfile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome110", "safari16"],
    logLevel: "info",
  })
  await ctx.watch()
  console.log("Watching design-editor sources…")
} else {
  await run()
}
