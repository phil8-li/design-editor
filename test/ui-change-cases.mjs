/**
 * End-to-end UI-change cases for the design editor.
 *
 * Level 1 checks the CSS -> Tailwind translation in isolation. Level 2 drives
 * the real engine over its WebSocket protocol against throwaway fixtures. Level
 * 3 does the same against a real app component and restores it byte-for-byte.
 *
 * Every case that touches a file snapshots it first and restores in a `finally`,
 * so a failure mid-run still leaves the tree exactly as it was found. Run with
 * `npm run design:test` while `npm run design` is up.
 *
 * Usage: node design-editor/test/ui-change-cases.mjs [--keep]
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocket } from "ws"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const FIXTURE_DIR = path.join(ROOT, "design-editor/test/.fixtures")
const WS_URL = "ws://127.0.0.1:3457"
const KEEP = process.argv.includes("--keep")

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

async function checkAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

// ── Level 1: translation ───────────────────────────────────────────────────

async function translationCases() {
  console.log("\nLevel 1 — CSS to Tailwind translation")

  // The translation table is TypeScript. esbuild is already the bundler for
  // this package, so reuse it to load the real module rather than testing a
  // copy that could drift.
  const { build } = await import("esbuild")
  const bundled = await build({
    entryPoints: [path.join(ROOT, "design-editor/src/core/tailwind.ts")],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
  const { toClassUpdate } = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
  )

  check("px on the spacing scale becomes a token", () => {
    assert.deepEqual(toClassUpdate("padding-left", "16px").tailwindToken, "4")
  })
  check("off-scale px becomes an arbitrary value", () => {
    const update = toClassUpdate("padding-left", "13px")
    assert.equal(update.tailwindToken, null)
    assert.equal(update.value, "13px")
  })
  check("padding side declares its shorthand parents", () => {
    assert.deepEqual(toClassUpdate("padding-left", "16px").relatedPrefixes, ["p", "px"])
  })
  check("display maps to a standalone keyword class", () => {
    const update = toClassUpdate("display", "flex")
    assert.equal(update.standalone, true)
    assert.equal(update.tailwindToken, "flex")
  })
  check("display pattern cannot match flex-direction classes", () => {
    const update = toClassUpdate("display", "flex")
    assert.equal(new RegExp(update.classPattern).test("flex-col"), false)
    assert.equal(new RegExp(update.classPattern).test("flex"), true)
  })
  check("font-size and color do not share a match pattern", () => {
    const size = new RegExp(toClassUpdate("font-size", "14px").classPattern)
    const color = new RegExp(toClassUpdate("color", "#ff0000").classPattern)
    assert.equal(size.test("text-red-500"), false)
    assert.equal(color.test("text-lg"), false)
    assert.equal(size.test("text-lg"), true)
    assert.equal(color.test("text-red-500"), true)
  })
  check("arbitrary values have spaces replaced with underscores", () => {
    assert.equal(
      toClassUpdate("box-shadow", "0 1px 2px rgba(0,0,0,.1)").value,
      "0_1px_2px_rgba(0,0,0,.1)"
    )
  })
  check("unknown properties are refused rather than guessed", () => {
    assert.equal(toClassUpdate("mix-blend-mode", "multiply"), null)
  })
}

// ── engine transport ───────────────────────────────────────────────────────

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL)
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error(`no engine on ${WS_URL} — start it with \`npm run design\``))
    }, 4000)
    socket.on("open", () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function request(socket, message, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${expected}`)),
      8000
    )
    const onMessage = (data) => {
      let parsed
      try {
        parsed = JSON.parse(String(data))
      } catch {
        return
      }
      if (parsed.type !== expected) return
      clearTimeout(timer)
      socket.off("message", onMessage)
      resolve(parsed)
    }
    socket.on("message", onMessage)
    socket.send(JSON.stringify(message))
  })
}

/** Runs `fn` with a file snapshotted, restoring the exact bytes afterwards. */
async function withRestored(filePath, fn) {
  const existed = fs.existsSync(filePath)
  const original = existed ? fs.readFileSync(filePath) : null
  try {
    return await fn()
  } finally {
    if (KEEP) return
    if (existed) fs.writeFileSync(filePath, original)
    else fs.rmSync(filePath, { force: true })
  }
}

const FIXTURE = `export function Fixture() {
  return (
    <div className="flex gap-2 p-4">
      <span className="text-sm text-gray-500">Plain string</span>
      <button className={\`rounded px-3 \${active ? "bg-blue-500" : ""}\`}>Template</button>
    </div>
  )
}
`

async function engineCases(socket) {
  console.log("\nLevel 2 — source writes against throwaway fixtures")
  fs.mkdirSync(FIXTURE_DIR, { recursive: true })
  const fixture = path.join(FIXTURE_DIR, "fixture.tsx")

  await withRestored(fixture, async () => {
    fs.writeFileSync(fixture, FIXTURE)

    await checkAsync("replaces a utility in a plain string className", async () => {
      const result = await request(
        socket,
        {
          type: "commitBatch",
          operations: [
            {
              op: "updateClass",
              file: fixture,
              line: 3,
              col: 5,
              tagName: "div",
              className: "flex gap-2 p-4",
              updates: [
                { tailwindPrefix: "gap", tailwindToken: "6", value: "24px" },
              ],
            },
          ],
        },
        "commitBatchComplete"
      )
      assert.equal(result.success, true, JSON.stringify(result.results ?? result))
      const after = fs.readFileSync(fixture, "utf8")
      assert.match(after, /className="flex gap-6 p-4"/)
      assert.doesNotMatch(after, /gap-2/)
    })

    await checkAsync("adds a utility that was not present", async () => {
      const result = await request(
        socket,
        {
          type: "commitBatch",
          operations: [
            {
              op: "updateClass",
              file: fixture,
              line: 4,
              col: 7,
              tagName: "span",
              className: "text-sm text-gray-500",
              updates: [
                {
                  tailwindPrefix: "opacity",
                  tailwindToken: null,
                  value: "0.5",
                },
              ],
            },
          ],
        },
        "commitBatchComplete"
      )
      assert.equal(result.success, true, JSON.stringify(result.results ?? result))
      assert.match(fs.readFileSync(fixture, "utf8"), /opacity-\[0\.5\]/)
    })

    await checkAsync("font-size does not clobber the text colour", async () => {
      const result = await request(
        socket,
        {
          type: "commitBatch",
          operations: [
            {
              op: "updateClass",
              file: fixture,
              line: 4,
              col: 7,
              tagName: "span",
              className: "text-sm text-gray-500",
              updates: [
                {
                  tailwindPrefix: "text",
                  tailwindToken: "lg",
                  value: "18px",
                  classPattern:
                    "^text-(\\[[^\\]]*(px|rem|em|ch|%)\\]|xs|sm|base|lg|[2-9]?xl)$",
                },
              ],
            },
          ],
        },
        "commitBatchComplete"
      )
      assert.equal(result.success, true, JSON.stringify(result.results ?? result))
      const after = fs.readFileSync(fixture, "utf8")
      assert.match(after, /text-lg/)
      assert.match(after, /text-gray-500/, "colour class must survive a size edit")
    })

    await checkAsync("writes into a template-literal className", async () => {
      const result = await request(
        socket,
        {
          type: "commitBatch",
          operations: [
            {
              op: "updateClass",
              file: fixture,
              line: 5,
              col: 7,
              tagName: "button",
              updates: [
                { tailwindPrefix: "px", tailwindToken: "6", value: "24px" },
              ],
            },
          ],
        },
        "commitBatchComplete"
      )
      assert.equal(result.success, true, JSON.stringify(result.results ?? result))
      assert.match(fs.readFileSync(fixture, "utf8"), /px-6/)
    })

    await checkAsync("rejects a path outside the project root", async () => {
      const result = await request(
        socket,
        {
          type: "updateProperties",
          filePath: "/etc/hosts",
          lineNumber: 1,
          columnNumber: 1,
          updates: [{ tailwindPrefix: "p", tailwindToken: "4", value: "16px" }],
        },
        "updatePropertyComplete"
      )
      assert.equal(result.success, false)
    })
  })

  if (!KEEP) fs.rmSync(FIXTURE_DIR, { recursive: true, force: true })
}

// ── Level 3: a real component, restored byte-for-byte ──────────────────────

/** First JSX element in the tree with an editable plain-string className. */
function findEditableJsx(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findEditableJsx(full)
      if (nested) return nested
      continue
    }
    if (!entry.name.endsWith(".tsx")) continue

    const source = fs.readFileSync(full, "utf8")
    const match = /<([a-z]+) className="([^"{}]*\bp[xy]?-\d\b[^"{}]*)"/.exec(source)
    if (!match) continue

    const upTo = source.slice(0, match.index)
    return {
      target: full,
      match: { tagName: match[1], className: match[2] },
      line: upTo.split("\n").length,
      // jscodeshift columns are 0-based from the start of the line.
      col: match.index - (upTo.lastIndexOf("\n") + 1),
    }
  }
  return null
}

async function realComponentCase(socket) {
  console.log("\nLevel 3 — real app component, restored byte-for-byte")
  // Any real component with a plain-string className will do; searching for one
  // keeps the case working as the app is refactored.
  const found = findEditableJsx(path.join(ROOT, "src/components"))
  if (!found) {
    console.log("  skip (no plain-string utility className found in src/components)")
    return
  }

  const { target, match, line, col } = found
  const before = fs.readFileSync(target)

  await withRestored(target, async () => {
    await checkAsync("edits a real component and reverts to identical bytes", async () => {
      const result = await request(
        socket,
        {
          type: "commitBatch",
          operations: [
            {
              op: "updateClass",
              file: target,
              line,
              col,
              tagName: match.tagName,
              className: match.className,
              updates: [
                { tailwindPrefix: "opacity", tailwindToken: "50", value: "0.5" },
              ],
            },
          ],
        },
        "commitBatchComplete"
      )
      assert.equal(result.success, true, JSON.stringify(result.results ?? result))
      assert.notEqual(
        fs.readFileSync(target).toString("utf8"),
        before.toString("utf8"),
        "the engine reported success but the file did not change"
      )
    })
  })

  check("real component is byte-identical after revert", () => {
    assert.equal(Buffer.compare(fs.readFileSync(target), before), 0)
  })
}

// ── Level 4: server route guards ───────────────────────────────────────────

const API = "http://127.0.0.1:3456/__design-editor"

/**
 * These routes write project files on behalf of whatever the page sends, so
 * their refusals are the security boundary — worth asserting, not assuming.
 */
async function serverGuardCases() {
  console.log("\nLevel 4 — server route guards")

  const reachable = await fetch(`${API}/options`)
    .then((response) => response.ok)
    .catch(() => false)
  if (!reachable) {
    console.log("  skip (proxy not serving /__design-editor — start `npm run design`)")
    return
  }

  await checkAsync("option keys outside the allowed shape are refused", async () => {
    const response = await fetch(`${API}/options/${encodeURIComponent("../../etc/hosts")}`, {
      method: "DELETE",
    })
    assert.equal(response.status, 400)
  })

  await checkAsync("a __proto__ option key cannot reach the prototype", async () => {
    const key = "__proto__"
    const put = await fetch(`${API}/options/${key}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "polluted", options: [] }),
    })
    assert.equal(put.status, 200)

    const sets = await (await fetch(`${API}/options`)).json()
    // The key must land as ordinary data, and no unrelated key may inherit it.
    assert.equal(sets[key]?.label, "polluted")
    assert.equal({}.label, undefined, "Object.prototype was polluted")
    assert.equal(sets.someOtherKey, undefined)

    await fetch(`${API}/options/${key}`, { method: "DELETE" })
  })

  await checkAsync("the agent refuses a non-source file", async () => {
    const response = await fetch(`${API}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "read this",
        selection: { tagName: "div", source: { filePath: ".env.local", lineNumber: 1 } },
      }),
    })
    const result = await response.json()
    // Without a key the handoff path answers; with one the extension gate must.
    if (process.env.ANTHROPIC_API_KEY) {
      assert.equal(result.ok, false)
      assert.match(result.message, /component source files/)
    } else {
      assert.equal(result.handoffPath?.startsWith(".local/design-editor/"), true)
    }
  })

  await checkAsync("an unknown route 404s instead of falling through to the app", async () => {
    const response = await fetch(`${API}/nope`)
    assert.equal(response.status, 404)
  })
}

// ── run ────────────────────────────────────────────────────────────────────

await translationCases()

let socket
try {
  socket = await connect()
} catch (error) {
  console.log(`\nLevel 2/3 skipped — ${error.message}`)
}

if (socket) {
  try {
    await engineCases(socket)
    await realComponentCase(socket)
  } finally {
    socket.close()
  }
}

await serverGuardCases()

console.log(`\n${passed} passed, ${failed} failed`)
if (KEEP) console.log("--keep: fixtures and edits were NOT reverted")
process.exit(failed === 0 ? 0 : 1)
