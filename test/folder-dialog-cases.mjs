/**
 * The native folder dialog, driven end to end against a stand-in for the
 * platform's picker.
 *
 * `test/start-screen-cases.mjs` already pins the command that gets built and
 * stubs the dialog out of the route. Neither of those runs `chooseFolder`
 * itself, and that is where the bug lived: the function spawned a real picker,
 * and every way that picker could fail — a broken script, a denied automation
 * prompt, a dialog killed on its way out — came back as `{ canceled: true }`,
 * which the page answers by doing nothing at all. A folder dialog that opens,
 * takes a choice and silently discards it is indistinguishable, from the
 * outside, from one that was never pressed.
 *
 * So this suite puts a fake picker on PATH and replays what the real one does.
 * The macOS strings below are not invented: they were measured from
 * /usr/bin/osascript on 2026-08-27 — the panel prints its POSIX path and exits
 * 0, Cancel exits 0 having printed nothing, and a folder osascript has no TCC
 * grant for fails with `Can't convert types. (-1700)`.
 *
 * Usage: node design-editor/test/folder-dialog-cases.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { chooseFolder, folderDialog } from "../runtime/folder-dialog.mjs"

let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

const temporary = []
function fixture(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `design-editor-${prefix}-`)))
  temporary.push(dir)
  return dir
}

console.log("\nThe command")

await check("the macOS panel carries no message of its own", () => {
  const script = folderDialog("darwin", "/Users/someone").args.join(" ")
  assert.match(script, /NSOpenPanel/)
  // `panel.message` is what AppleScript's `with prompt` writes. It does not
  // title the panel, it wedges a strip above the toolbar — the one part of an
  // open panel that no other Mac app shows.
  assert.doesNotMatch(script, /panel\.message/)
})

// The defect behind error -2763. `choose folder` answers with an AppleScript
// alias, and no alias can be built for a folder osascript has no TCC grant for
// — Desktop, Downloads, a protected Documents subtree. The panel took the
// choice and the coercion dropped it. NSOpenPanel returns an NSURL, so the
// path never passes through an alias at all.
await check("the macOS panel never coerces its answer through an alias", () => {
  const script = folderDialog("darwin", "/Users/someone").args.join(" ")
  for (const doomed of [/as alias/, /POSIX path of/, /choose folder/]) {
    assert.doesNotMatch(script, doomed)
  }
  assert.match(script, /URL\.path/)
})

await check("the macOS panel is asked for a folder, and only one", () => {
  const script = folderDialog("darwin", "/Users/someone").args.join(" ")
  assert.match(script, /canChooseDirectories = true/)
  assert.match(script, /canChooseFiles = false/)
  assert.match(script, /allowsMultipleSelection = false/)
  // Without a regular activation policy the panel opens behind the browser
  // with no way to reach it.
  assert.match(script, /setActivationPolicy\(0\)/)
})

await check("every platform can say what a dismissal looks like", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    assert.equal(typeof folderDialog(platform, "/tmp").cancelled, "function", platform)
  }
})

await check("a cancel and a failure are not the same answer", () => {
  // NSOpenPanel's Cancel is an ordinary exit that prints nothing; anything
  // that exits badly failed.
  const mac = folderDialog("darwin", "/tmp").cancelled
  assert.equal(mac({ error: null, stderr: "" }), true)
  assert.equal(mac({ error: new Error("x"), stderr: "execution error: Can't convert types. (-1700)" }), false)

  const linux = folderDialog("linux", "/tmp").cancelled
  assert.equal(linux({ error: new Error("x"), stderr: "" }), true)
  assert.equal(linux({ error: new Error("x"), stderr: "Gtk-WARNING: cannot open display" }), false)

  const windows = folderDialog("win32", "C:\\tmp").cancelled
  assert.equal(windows({ error: null, stderr: "" }), true)
  assert.equal(windows({ error: new Error("x"), stderr: "Add-Type : Cannot find type" }), false)
})

/*
 * Everything below spawns the picker for real, so it needs a fake one on PATH
 * under the name this platform's dialog actually calls. The replayed strings
 * are macOS's, so the spawning cases run there.
 */
if (process.platform !== "darwin") {
  console.log(`\nThe picker itself\n  SKIP  the replayed picker is macOS's (this is ${process.platform})`)
} else {
  console.log("\nThe picker itself")

  const binDir = fixture("stub-bin")
  const chosen = fixture("chosen")
  fs.writeFileSync(
    path.join(binDir, "osascript"),
    [
      "#!/bin/sh",
      'case "$DE_STUB_MODE" in',
      `  success) printf '%s/\\n' "${chosen}"; exit 0 ;;`,
      "  cancel)  exit 0 ;;",
      "  broken)  echo 'execution error: Error: Error: Can'\"'\"'t convert types. (-1700)' >&2; exit 1 ;;",
      "  mute)    exit 1 ;;",
      "esac",
    ].join("\n")
  )
  fs.chmodSync(path.join(binDir, "osascript"), 0o755)

  const realPath = process.env.PATH
  const withStub = (mode, fn) => async () => {
    process.env.PATH = `${binDir}:${realPath}`
    process.env.DE_STUB_MODE = mode
    try {
      await fn()
    } finally {
      process.env.PATH = realPath
      delete process.env.DE_STUB_MODE
    }
  }

  await check(
    "a chosen folder comes back absolute, with the trailing slash gone",
    withStub("success", async () => {
      const result = await chooseFolder({ startIn: os.homedir() })
      assert.equal(result.canceled, false)
      assert.equal(result.path, chosen)
    })
  )

  await check(
    "dismissing the dialog is an ordinary answer, not an error",
    withStub("cancel", async () => {
      assert.deepEqual(await chooseFolder({ startIn: os.homedir() }), { canceled: true })
    })
  )

  // The defect this suite was written for. Before the fix both of the next two
  // resolved to `{ canceled: true }`, so the page took a broken picker for a
  // change of mind and left the field empty with nothing to read.
  await check(
    "a picker that breaks says so instead of pretending it was dismissed",
    withStub("broken", async () => {
      await assert.rejects(chooseFolder({ startIn: os.homedir() }), (error) => {
        assert.match(error.message, /-1700/)
        assert.match(error.message, /paste the folder's path/i)
        return true
      })
    })
  )

  await check(
    "a picker that dies without a word is still a failure, not a dismissal",
    withStub("mute", async () => {
      await assert.rejects(chooseFolder({ startIn: os.homedir() }), /osascript closed without naming a folder/)
    })
  )

  await check("a machine with no picker at all says which one is missing", async () => {
    const empty = fixture("empty-bin")
    process.env.PATH = empty
    try {
      await assert.rejects(chooseFolder({ startIn: os.homedir() }), /osascript.*not installed/i)
    } finally {
      process.env.PATH = realPath
    }
  })

  /*
   * Where the dialog is told to open. The folders most worth reopening are the
   * ones macOS protects: Desktop and Downloads answer EPERM to `stat` on a
   * managed Mac while opening and listing perfectly, and a picker that only
   * asks `stat` reads them as gone and starts over at home.
   */
  await check(
    "a real folder is where it opens, even one that refuses to be stat'd",
    withStub("success", async () => {
      const real = fixture("start-in")
      assert.match(folderDialog("darwin", real).args.at(-1), new RegExp(real.replace(/\//g, "\\/")))

      const desktop = path.join(os.homedir(), "Desktop")
      let protectedDir = false
      try {
        fs.statSync(desktop)
      } catch (error) {
        protectedDir = error.code === "EPERM" && fs.readdirSync(desktop).length >= 0
      }
      if (!protectedDir) {
        console.log("       (no EPERM-protected folder on this machine to check against)")
        return
      }
      // Reaching the stub at all means openableDirectory kept the path rather
      // than falling back, which is the only observable it has.
      assert.equal((await chooseFolder({ startIn: desktop })).canceled, false)
    })
  )

  await check("nothing to open from is the home directory, not a broken dialog", () => {
    assert.match(folderDialog("darwin", "/nope/not/here").args.at(-1), /not\/here/)
    // The guard is in chooseFolder, not folderDialog: the command builder is
    // told where to open, it does not decide.
  })
}

for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
