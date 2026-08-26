/**
 * The ledger of changes "Apply to code" cannot write, and the prompt that hands
 * them to an agent instead.
 *
 * Two paths leave this editor. "Apply to code" is the real one: a class change
 * or a text change goes down the wire, jscodeshift rewrites the JSX, the file
 * on disk changes, and no agent is involved. But the translator only speaks in
 * utility classes and text — an icon swap renames nothing in the JSX, and a CSS
 * property with no Tailwind equivalent has nowhere to land. Those changes are
 * real, they are on screen, and the next hot reload eats them.
 *
 * Before this file they were reported as a count in a toast and then lost. Now
 * they accumulate here with enough context to be acted on — file, element,
 * property, from, to — and "Copy change prompts" puts that on the clipboard as
 * markdown an agent can execute. That is the honest split: everything that can
 * be written is written, and only the remainder becomes a prompt.
 */

import { isProjectSourcePath } from "./bridge"

export interface PreviewOnlyChange {
  /**
   * Filled in late. The change is recorded the moment it is previewed, but
   * source resolution is a round trip, so the writer patches this in when it
   * lands rather than holding the toast until it does.
   */
  filePath: string | null
  componentName: string
  tagName: string
  className: string
  /** A CSS property in kebab-case, or `icon` for a glyph swap. */
  property: string
  from: string
  to: string
}

/**
 * Module-scoped for the same reason `writer.ts` keeps its skip list here: the
 * canvas, the inspector and the options panel each build their own writer, and
 * the button that copies the prompt belongs to none of them.
 */
const ledger: PreviewOnlyChange[] = []

/** Same element, same property — one entry, keeping the original `from`. */
function identityOf(change: PreviewOnlyChange): string {
  return [change.componentName, change.tagName, change.className, change.property].join("|")
}

/**
 * Records a change that will not reach source, and hands back the stored record
 * so a caller that learns the file path afterwards can fill it in.
 */
export function recordPreviewOnly(change: PreviewOnlyChange): PreviewOnlyChange {
  const identity = identityOf(change)
  const index = ledger.findIndex((entry) => identityOf(entry) === identity)
  if (index !== -1) {
    // Dragging an element writes `transform` on every pointermove. What the
    // user needs in the prompt is where it started and where it ended up, not
    // three hundred intermediate steps.
    const existing = ledger[index]
    existing.to = change.to
    if (!existing.filePath) existing.filePath = change.filePath
    ledger.splice(index, 1)
    ledger.unshift(existing)
    return existing
  }
  ledger.unshift(change)
  return change
}

/** Everything previewed but not writable this session, newest first. */
export function previewOnlyChanges(): PreviewOnlyChange[] {
  return [...ledger]
}

export function clearPreviewOnly(): void {
  ledger.length = 0
}

/**
 * Drops one entry, so a row in the Prompts tab can retract just itself.
 *
 * Matched by `identityOf` rather than by object reference on purpose. The two
 * have to agree: `recordPreviewOnly` COLLAPSES a re-edit of the same element
 * and property onto the stored record, so the object a caller recorded second
 * is not the object in the ledger, while the row the user is looking at is
 * exactly the one that survived the collapse. Identity is the only thing both
 * ends can name, and it is what the row is showing.
 */
export function removePreviewOnly(change: PreviewOnlyChange): boolean {
  const identity = identityOf(change)
  const index = ledger.findIndex((entry) => identityOf(entry) === identity)
  if (index === -1) return false
  ledger.splice(index, 1)
  return true
}

function describe(change: PreviewOnlyChange): string {
  const element = change.className
    ? `\`<${change.tagName} class="${change.className}">\``
    : `\`<${change.tagName}>\``
  if (change.property === "icon") {
    return `- ${element} — swap the icon to \`${change.to}\` (currently \`${change.from || "unknown"}\`)`
  }
  const from = change.from ? ` (currently \`${change.from}\`)` : ""
  return `- ${element} — set \`${change.property}\` to \`${change.to}\`${from}`
}

const UNKNOWN_FILE = "File not resolved"

/**
 * Agent-ready markdown, grouped by file because that is the unit of work.
 *
 * Deliberately not a chat message. It states what is true, where, and what to
 * change it to, and it says nothing about why — an agent reading this needs the
 * edit, and the person pasting it already knows why they made it.
 */
export function buildChangePrompt(changes: PreviewOnlyChange[] = previewOnlyChanges()): string {
  if (changes.length === 0) {
    return "No changes are waiting. Everything edited so far can be written by Apply to code."
  }

  const byFile = new Map<string, PreviewOnlyChange[]>()
  for (const change of changes) {
    const file =
      change.filePath && isProjectSourcePath(change.filePath) ? change.filePath : UNKNOWN_FILE
    const bucket = byFile.get(file)
    if (bucket) bucket.push(change)
    else byFile.set(file, [change])
  }

  const count = changes.length
  const lines: string[] = [
    "# Design editor changes to apply by hand",
    "",
    `${count} visual ${count === 1 ? "change is" : "changes are"} showing in the browser that Apply to code cannot write. Apply ${count === 1 ? "it" : "them"} in the files below.`,
  ]

  for (const [file, entries] of byFile) {
    lines.push("", `## ${file}`)
    if (file === UNKNOWN_FILE) {
      // Naming the component is the whole value of the section: without a path
      // this is the only thing that tells the agent where to look.
      const components = [...new Set(entries.map((entry) => entry.componentName))].filter(Boolean)
      if (components.length) {
        lines.push("", `Search for ${components.map((name) => `\`${name}\``).join(", ")}.`)
      }
    }
    lines.push("")
    for (const entry of entries) lines.push(describe(entry))
  }

  return `${lines.join("\n")}\n`
}

/**
 * What is safe to put on someone's clipboard.
 *
 * Two rules, both borrowed from the app's own agentation copy path, which
 * sanitizes for exactly these reasons. A `**Source:**` line is attribution the
 * resolver is only half-right about — the same overlay that gave us
 * `button.tsx:57` gave us a compiled chunk for the element beside it — so it
 * gets dropped rather than pasted into a prompt as fact. And an absolute path
 * carries the user's home directory and their name; the tail from `src/` is
 * what an agent working in the repo can actually use.
 */
const SOURCE_LINE = /^\*\*Source:\*\*[^\r\n]*(?:\r?\n|$)/gm
// Anchored on the leading slash so it only ever shortens an ABSOLUTE path:
// `packages/ui/src/x.tsx` has an `src/` too, and must survive untouched.
const ABSOLUTE_PREFIX = /(^|[\s`])\/(?:[^\n`]*\/)?(?=src\/)/gm

export function sanitizeChangePrompt(markdown: string): string {
  return markdown.replace(SOURCE_LINE, "").replace(ABSOLUTE_PREFIX, "$1")
}

/**
 * One clipboard write, no fallback.
 *
 * Modelled on the app's agentation Copy: the vendor component's own copy is
 * turned off and this runs in its place, synchronously inside the click task so
 * the transient user activation the Clipboard API requires still holds. There
 * is no `document.execCommand` fallback and the catch is empty on purpose — the
 * only browsers that reject this are ones that have already told the user why.
 */
export async function copyChangePrompt(markdown?: string): Promise<void> {
  const text = sanitizeChangePrompt(markdown ?? buildChangePrompt())
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Denied or unavailable. The change is still on screen and still listed.
  }
}
