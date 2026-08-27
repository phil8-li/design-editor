/**
 * The machine's own folder picker, opened from the start screen.
 *
 * A page in a browser cannot name a path on the machine it is talking to —
 * `<input webkitdirectory>` and `showDirectoryPicker()` both hand back a folder
 * NAME and nothing above it — so the start screen used to walk the filesystem
 * itself, one round trip per directory. This server sits on the same machine as
 * the files, so it can put the real dialog on screen instead: Finder's sidebar,
 * its favourites, its search, its keyboard shortcuts, and one absolute path
 * back. Every platform's dialog is a different program, so each is one entry in
 * `DIALOGS` and everything else here is shared.
 *
 * Cancelling is the ordinary way out of a file dialog, not a failure: it is
 * reported as `{ canceled: true }` and the caller leaves the field alone.
 */

import { execFile } from "node:child_process"
import os from "node:os"

import { isDirectory } from "./local-apps.mjs"

/** Long enough to find a folder, short enough that a lost dialog is not forever. */
const TIMEOUT_MS = 10 * 60 * 1000

const PROMPT = "Choose your project folder"

const powershellString = (value) => `'${value.replace(/'/g, "''")}'`

/**
 * The macOS panel, as Cocoa rather than as AppleScript.
 *
 * `NSApplication.setActivationPolicy(0)` promotes osascript to a regular app
 * for the life of the panel, which is what lets it come forward over the
 * browser. `runModal` answers 1 for the Choose button, and `URL.path` is
 * already a POSIX path — see DIALOGS for why that last part is the whole point.
 */
const openPanelScript = (startIn) => `
ObjC.import('AppKit')
const app = $.NSApplication.sharedApplication
app.setActivationPolicy(0)
app.activateIgnoringOtherApps(true)
const panel = $.NSOpenPanel.openPanel
panel.canChooseFiles = false
panel.canChooseDirectories = true
panel.allowsMultipleSelection = false
panel.prompt = 'Choose'
panel.directoryURL = $.NSURL.fileURLWithPath(${JSON.stringify(startIn)})
panel.runModal === 1 ? ObjC.unwrap(panel.URL.path) : ''
`

/**
 * One dialog per platform, each already the native one for that desktop, and
 * each with its own reading of what "the user dismissed it" looks like.
 *
 * That second half matters as much as the first. All three say "cancelled" by
 * printing no path, and so does a dialog that broke — so without a per-platform
 * `cancelled`, every failure arrives looking exactly like a person changing
 * their mind, and the page answers a broken picker by doing nothing at all.
 *
 * macOS: NSOpenPanel driven straight through JXA's ObjC bridge, not
 * AppleScript's `choose folder`. It is the same Cocoa panel either way —
 * Finder's sidebar, favourites, search, the path bar, ⇧⌘G — so this is not
 * about how it looks. It is about what comes back.
 *
 * `choose folder` returns an AppleScript *alias*, and an alias cannot be built
 * for a folder osascript holds no TCC grant for. On a managed Mac that is most
 * of the interesting ones: Desktop, Downloads and anything under a protected
 * Documents subtree answer `Can't make file ... into type alias (-1700)`. When
 * the alias cannot be made the panel's answer is simply dropped, so the
 * enclosing `POSIX path of` receives nothing and fails with -2763 — the choice
 * was taken and thrown away. NSOpenPanel hands back an NSURL instead, whose
 * `path` is already a POSIX string, so no alias is ever built and every folder
 * the panel is willing to show is a folder it can return.
 *
 * No `message` is set on the panel. That is the property `with prompt` writes,
 * and it is not a title — it is a strip wedged above the toolbar, the one part
 * of an open panel that no other Mac app shows. Dismissing exits cleanly with
 * nothing on stdout.
 *
 * Windows: FolderBrowserDialog needs a single-threaded apartment, which
 * PowerShell only enters when told to (`-STA`). A dismissed dialog is a clean
 * exit with nothing on stdout.
 *
 * Linux: GTK's chooser through zenity, which is what a desktop session has if
 * it has anything. Its absence throws, and the page falls back to the field.
 * Dismissing it exits 1 and says nothing; a zenity that failed exits 1 and
 * complains on the way out.
 */
const DIALOGS = {
  darwin: (startIn) => ({
    command: "osascript",
    args: ["-l", "JavaScript", "-e", openPanelScript(startIn)],
    cancelled: ({ error }) => !error,
  }),
  win32: (startIn) => ({
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-STA",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms;" +
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;" +
        `$dialog.Description = ${powershellString(PROMPT)};` +
        `$dialog.SelectedPath = ${powershellString(startIn)};` +
        "if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath }",
    ],
    cancelled: ({ error }) => !error,
  }),
  linux: (startIn) => ({
    command: "zenity",
    args: [
      "--file-selection",
      "--directory",
      `--title=${PROMPT}`,
      // The trailing separator is what makes zenity open INSIDE the folder
      // rather than opening its parent with the folder selected.
      `--filename=${startIn.endsWith("/") ? startIn : `${startIn}/`}`,
    ],
    cancelled: ({ stderr }) => stderr.trim() === "",
  }),
}

/** The picker for this platform, or `null` where there is no known one. */
export function folderDialog(platform, startIn) {
  return DIALOGS[platform]?.(startIn) ?? null
}

/**
 * A dialog that opens somewhere that no longer exists is a dialog that fails on
 * arrival, so the last stop before spawning is the home directory.
 *
 * `isDirectory` rather than `statSync`, because the folders most worth
 * reopening are the ones macOS protects — Desktop and Downloads answer EPERM to
 * `stat` on this machine while opening and listing perfectly, and read as
 * "gone" to anything that only asks the one question.
 */
function openableDirectory(startIn) {
  if (typeof startIn === "string" && startIn !== "" && isDirectory(startIn)) return startIn
  return os.homedir()
}

/**
 * Spawns the dialog and sorts its three endings apart: a path, a person who
 * changed their mind, and a picker that broke.
 *
 * Only the middle one is silent. The whole point of separating the third is
 * that a broken picker used to be indistinguishable from a cancelled one, and
 * the page's answer to a cancel is to do nothing — so any failure at all
 * arrived as a folder dialog that opened, took a choice, and threw it away
 * without a word.
 */
function run({ command, args, cancelled }) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      const output = String(stdout ?? "").trim()
      const complaint = String(stderr ?? "").trim()
      if (output !== "") return resolve(output)
      if (error?.code === "ENOENT") return reject(error)
      if (error?.killed) {
        return reject(new Error(`The folder picker was still open after ${TIMEOUT_MS / 60000} minutes, so it was closed.`))
      }
      if (cancelled({ error, stderr: complaint })) return resolve("")
      reject(new Error(complaint || `${command} closed without naming a folder.`))
    })
  })
}

/**
 * Opens the platform's folder dialog and waits for it. Resolves to the absolute
 * path chosen, or `{ canceled: true }` if the dialog was dismissed.
 */
export async function chooseFolder({ startIn } = {}) {
  const dialog = folderDialog(process.platform, openableDirectory(startIn))
  if (!dialog) {
    throw new Error(`There is no folder picker for ${process.platform}. Paste the folder's path instead.`)
  }

  let output
  try {
    output = await run(dialog)
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `The folder picker (${dialog.command}) is not installed on this machine. Paste the folder's path instead.`
      )
    }
    // Whatever the picker said on its way out, said here rather than swallowed.
    throw new Error(`The folder picker failed: ${error.message} Paste the folder's path instead.`)
  }

  if (output === "") return { canceled: true }
  // `choose folder` returns a POSIX path with a trailing slash; nothing else
  // downstream expects one, and `/` itself must keep it.
  const chosen = output.length > 1 ? output.replace(/[/\\]+$/, "") : output
  return { canceled: false, path: chosen }
}
