/**
 * Saved option sets: client cache plus HTTP persistence.
 *
 * Editor state is the only cache — panels read `optionSets` from the store they
 * already subscribe to, so a variant saved in the inspector cannot disagree
 * with what another lane sees. The server file is the durable copy.
 */

import { getState, setState } from "../core/store"
import type { EditorContext } from "../core/context"
import type { StyleWrite, Writer } from "../core/writer"
import type { ElementOption, ElementOptionSet, Selection, StyleEdit } from "../core/types"

/** The element state an option captures and restores. */
export interface OptionSnapshot {
  className: string
  style: StyleEdit
  text?: string
}

export interface OptionsStore {
  /** Loads persisted sets once. Later calls resolve against the same load. */
  ready(): Promise<void>
  get(key: string): ElementOptionSet | null
  apply(selection: Selection, writer: Writer, option: ElementOption): void
  saveCurrent(selection: Selection, writer: Writer): void
  updateActive(selection: Selection): void
  rename(key: string, id: string, name: string): void
  remove(selection: Selection, writer: Writer, id: string): void
}

/**
 * The element's state before the first option was applied to it. Deleting the
 * active option restores this instead of leaving a half-applied element.
 */
const baselines = new Map<string, OptionSnapshot>()

let cached: OptionsStore | null = null

/** Captures what an option needs to reproduce the element's current look. */
export function captureSnapshot(element: HTMLElement): OptionSnapshot {
  const style: StyleEdit = {}
  for (const property of Array.from(element.style)) {
    style[property] = element.style.getPropertyValue(property)
  }
  // `className` is not a string on SVG nodes, and icons are SVG nodes.
  const snapshot: OptionSnapshot = { className: element.getAttribute("class") ?? "", style }
  if (element.children.length === 0) snapshot.text = element.textContent ?? ""
  return snapshot
}

function applySnapshot(
  selection: Selection,
  writer: Writer,
  snapshot: OptionSnapshot,
  summary: string
): void {
  const element = selection.element
  const current = Array.from(element.classList)
  const next = snapshot.className.split(/\s+/).filter(Boolean)
  const remove = current.filter((name) => !next.includes(name))
  const add = next.filter((name) => !current.includes(name))
  if (remove.length || add.length) writer.applyClasses(selection, { remove, add }, summary)

  const writes: StyleWrite[] = []
  // An empty value removes the declaration, which is how an option drops a
  // property the element picked up after the option was saved.
  for (const property of Array.from(element.style)) {
    if (!(property in snapshot.style)) writes.push({ property, value: "" })
  }
  for (const [property, value] of Object.entries(snapshot.style)) {
    if (element.style.getPropertyValue(property) !== value) writes.push({ property, value })
  }
  if (writes.length) writer.applyStyles(selection, writes, summary)

  if (snapshot.text !== undefined && element.textContent !== snapshot.text) {
    writer.applyText(selection, snapshot.text)
  }
}

function snapshotOf(option: ElementOption): OptionSnapshot {
  return { className: option.className, style: option.style, text: option.text }
}

function nextName(set: ElementOptionSet | null): string {
  return `Option ${(set?.options.length ?? 0) + 1}`
}

function createStore(editor: EditorContext): OptionsStore {
  let loading: Promise<void> | null = null

  const url = (key?: string) =>
    key === undefined
      ? `${editor.apiBase}/options`
      : `${editor.apiBase}/options/${encodeURIComponent(key)}`

  const load = async () => {
    try {
      const response = await fetch(url(), { headers: { accept: "application/json" } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState({ optionSets: (await response.json()) as Record<string, ElementOptionSet> })
    } catch (error) {
      console.warn("[design-editor] could not load saved options", error)
    }
  }

  const commit = (set: ElementOptionSet) => {
    setState({ optionSets: { ...getState().optionSets, [set.key]: set } })
    void fetch(url(set.key), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(set),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      })
      .catch(() => editor.toast("Could not save this option", "error"))
  }

  const drop = (key: string) => {
    const sets = { ...getState().optionSets }
    delete sets[key]
    setState({ optionSets: sets })
    void fetch(url(key), { method: "DELETE" }).catch(() => {
      editor.toast("Could not remove these options", "error")
    })
  }

  const setFor = (selection: Selection): ElementOptionSet => {
    return (
      getState().optionSets[selection.key] ?? {
        key: selection.key,
        label: selection.componentName,
        activeOptionId: null,
        options: [],
      }
    )
  }

  return {
    ready() {
      loading ??= load()
      return loading
    },

    get(key) {
      return getState().optionSets[key] ?? null
    },

    apply(selection, writer, option) {
      const set = setFor(selection)
      if (!baselines.has(selection.key)) {
        baselines.set(selection.key, captureSnapshot(selection.element))
      }
      applySnapshot(selection, writer, snapshotOf(option), `Apply option "${option.name}"`)
      commit({ ...set, activeOptionId: option.id })
    },

    saveCurrent(selection, writer) {
      const set = setFor(selection)
      if (!baselines.has(selection.key)) {
        baselines.set(selection.key, captureSnapshot(selection.element))
      }
      const snapshot = captureSnapshot(selection.element)
      const option: ElementOption = {
        id: crypto.randomUUID(),
        name: nextName(set),
        className: snapshot.className,
        style: snapshot.style,
        text: snapshot.text,
        createdAt: Date.now(),
      }
      // Saving is not an edit, but it is the moment the element becomes a
      // variant — re-apply so the queued source write matches what is shown.
      applySnapshot(selection, writer, snapshot, `Save option "${option.name}"`)
      commit({ ...set, activeOptionId: option.id, options: [...set.options, option] })
    },

    updateActive(selection) {
      const set = setFor(selection)
      const active = set.options.find((option) => option.id === set.activeOptionId)
      if (!active) return
      const snapshot = captureSnapshot(selection.element)
      commit({
        ...set,
        options: set.options.map((option) =>
          option.id === active.id ? { ...option, ...snapshot } : option
        ),
      })
    },

    rename(key, id, name) {
      const set = getState().optionSets[key]
      if (!set) return
      commit({
        ...set,
        options: set.options.map((option) => (option.id === id ? { ...option, name } : option)),
      })
    },

    remove(selection, writer, id) {
      const set = setFor(selection)
      const options = set.options.filter((option) => option.id !== id)
      if (set.activeOptionId === id) {
        const baseline = baselines.get(selection.key)
        if (baseline) applySnapshot(selection, writer, baseline, "Remove option")
      }
      if (options.length === 0) {
        baselines.delete(selection.key)
        drop(selection.key)
        return
      }
      commit({
        ...set,
        activeOptionId: set.activeOptionId === id ? null : set.activeOptionId,
        options,
      })
    },
  }
}

/** One store per session; the inspector rebuilds its DOM on every render. */
export function optionsStore(editor: EditorContext): OptionsStore {
  cached ??= createStore(editor)
  return cached
}
