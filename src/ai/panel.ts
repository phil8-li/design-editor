/** Prompt the agent about the current selection. Lane C owns this. */

import { el, isCanvasElement, round } from "../core/dom"
import { section } from "../panels/inspector/field"
import { requestAgent } from "./transport"
import type { InspectorSection, SectionContext } from "../panels/inspector/index"
import type { AgentRequest, AgentResponse } from "../core/types"

const MAX_ANCESTORS = 5
const MAX_TEXT = 400

/**
 * Draft and result outlive the inspector's DOM: it re-renders on every state
 * change, and losing a half-typed prompt to a stray selection is unforgivable.
 */
let draft = ""
let pending = false
let result: { message: string; ok: boolean } | null = null
let resultKey = ""

function buildRequest(context: SectionContext, prompt: string): AgentRequest {
  const { editor, selection } = context
  const box = selection.element.getBoundingClientRect()

  const ancestry: AgentRequest["ancestry"] = []
  let node = selection.element.parentElement
  while (node && ancestry.length < MAX_ANCESTORS && isCanvasElement(node)) {
    ancestry.push({
      tagName: node.tagName.toLowerCase(),
      className: node.getAttribute("class") ?? "",
      componentName: editor.bridge.elementInfo(node)?.componentName ?? "",
    })
    node = node.parentElement
  }

  return {
    prompt,
    selection: {
      tagName: selection.tagName,
      componentName: selection.componentName,
      className: selection.element.getAttribute("class") ?? "",
      text: selection.element.textContent?.trim().slice(0, MAX_TEXT) ?? "",
      rect: {
        x: round(box.left),
        y: round(box.top),
        width: round(box.width),
        height: round(box.height),
      },
      source: selection.source,
    },
    ancestry,
    url: window.location.href,
  }
}

function describe(response: AgentResponse): string {
  const lines = [response.message]
  if (response.handoffPath) lines.push(response.handoffPath)
  if (response.filesChanged?.length) lines.push(response.filesChanged.join("\n"))
  return lines.join("\n")
}

export const aiSection: InspectorSection = (context) => {
  // A result describes one element; carrying it to the next selection would
  // claim work that was never done there.
  if (resultKey !== context.selection.key && !pending) result = null

  const input = el("textarea", {
    class: "de-ai-input",
    placeholder: "Describe the change you want for this element…",
    "aria-label": "Ask AI about this element",
  }) as HTMLTextAreaElement
  input.value = draft

  const status = el("div", { class: "de-ai-status", role: "status" })
  const submit = el("button", { class: "de-button de-button--primary", type: "button" }, [
    "Ask",
  ]) as HTMLButtonElement

  const paint = () => {
    submit.disabled = pending || input.value.trim().length === 0
    submit.textContent = pending ? "Asking…" : "Ask"
    status.textContent = pending
      ? "Sending this element and your prompt to the agent…"
      : result?.message ?? ""
    status.hidden = status.textContent.length === 0
    if (!pending && result && !result.ok) status.setAttribute("data-state", "error")
    else status.removeAttribute("data-state")
  }

  const send = async () => {
    const prompt = input.value.trim()
    if (!prompt || pending) return
    draft = prompt
    pending = true
    paint()

    const response = await requestAgent(context.editor.apiBase, buildRequest(context, prompt))

    pending = false
    result = { message: describe(response), ok: response.ok }
    resultKey = context.selection.key
    if (response.ok) draft = ""
    context.invalidate()
  }

  input.addEventListener("input", () => {
    draft = input.value
    paint()
  })
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    void send()
  })
  submit.addEventListener("click", () => void send())

  paint()

  return section(
    "Ask AI",
    el("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      input,
      el("div", { class: "de-row" }, [
        submit,
        el("span", { class: "de-ai-status" }, ["⌘⏎"]),
      ]),
      status,
    ])
  )
}
