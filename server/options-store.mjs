/**
 * Durable storage for saved option sets.
 *
 * One JSON file under `.local/`, written atomically and read back through the
 * same normaliser the routes use. Everything the editor persists lives in this
 * directory so nothing it writes can be mistaken for product source.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const STORE_DIR = fileURLToPath(new URL("../../.local/design-editor/", import.meta.url))

const OPTIONS_FILE = path.join(STORE_DIR, "options.json")
const MAX_OPTIONS_PER_SET = 40
const MAX_NAME = 120
const MAX_VALUE = 2000

// Reads and writes are serialised: two panels saving at once must not both
// read the same file and clobber each other's set.
let queue = Promise.resolve()

function serial(task) {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function normalizeOption(value) {
  if (!value || typeof value !== "object") return null
  if (typeof value.id !== "string" || value.id.length === 0) return null

  const style = {}
  if (value.style && typeof value.style === "object" && !Array.isArray(value.style)) {
    for (const [property, raw] of Object.entries(value.style)) {
      if (typeof raw === "string") style[property] = raw.slice(0, MAX_VALUE)
    }
  }

  const name = typeof value.name === "string" ? value.name.trim() : ""
  const option = {
    id: value.id.slice(0, 64),
    name: name ? name.slice(0, MAX_NAME) : "Option",
    className: typeof value.className === "string" ? value.className.slice(0, MAX_VALUE) : "",
    style,
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
  }
  if (typeof value.text === "string") option.text = value.text.slice(0, MAX_VALUE)
  return option
}

/** Returns a stored-shaped set, or null when the payload is unusable. */
export function normalizeOptionSet(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const options = Array.isArray(value.options)
    ? value.options.map(normalizeOption).filter(Boolean).slice(0, MAX_OPTIONS_PER_SET)
    : []
  const active =
    typeof value.activeOptionId === "string" &&
    options.some((option) => option.id === value.activeOptionId)
      ? value.activeOptionId
      : null

  return {
    key,
    label: typeof value.label === "string" && value.label ? value.label.slice(0, MAX_NAME) : key,
    activeOptionId: active,
    options,
  }
}

async function readFileSets() {
  let parsed
  try {
    parsed = JSON.parse(await fs.readFile(OPTIONS_FILE, "utf8"))
  } catch {
    // Missing or corrupt: the editor keeps working and the next write heals it.
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  // Null-prototype: element keys come from the page, and a key of `__proto__`
  // on a plain object would reassign the prototype instead of storing a set.
  const sets = Object.create(null)
  for (const [key, value] of Object.entries(parsed)) {
    const set = normalizeOptionSet(value, key)
    if (set) sets[key] = set
  }
  return sets
}

async function writeFileSets(sets) {
  await fs.mkdir(STORE_DIR, { recursive: true })
  const temp = `${OPTIONS_FILE}.${process.pid}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(sets, null, 2)}\n`, "utf8")
  await fs.rename(temp, OPTIONS_FILE)
}

export function readOptionSets() {
  return serial(readFileSets)
}

export function writeOptionSet(set) {
  return serial(async () => {
    const sets = await readFileSets()
    sets[set.key] = set
    await writeFileSets(sets)
    return set
  })
}

export function deleteOptionSet(key) {
  return serial(async () => {
    const sets = await readFileSets()
    if (!Object.hasOwn(sets, key)) return false
    delete sets[key]
    await writeFileSets(sets)
    return true
  })
}
