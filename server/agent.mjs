/**
 * "Ask AI about this element", with two transports chosen per call.
 *
 * With an API key we edit source through the same SEARCH/REPLACE contract the
 * vendored CLI uses, so both paths into the codebase behave identically.
 * Without one we write a handoff brief for whichever coding agent the designer
 * already runs — that is the default on purpose: no key must never mean no
 * answer, only a slower one.
 */

import fs from "node:fs/promises"
import path from "node:path"

import { isEditableSourcePath } from "../config.mjs"

const DEFAULT_SYSTEM_PROMPT = `You are a precision frontend code modifier for a React application using Tailwind CSS.

A designer selected one element in a visual editor and described the change they want. Reproduce their intent in the source file.

## Critical Rules
- Change only the selected element (and its children when the request requires it)
- Preserve all existing code structure, formatting, and whitespace
- Prefer Tailwind utility classes already used in the file over new inline styles
- Never refactor, rename, or "improve" code the request did not ask about

## Element Location Strategy
1. **className string** — most reliable, find it as an exact substring in the JSX
2. **Text content** — disambiguates elements with the same tag and classes
3. **Ancestry** — parent tags and classNames narrow the search
4. **Component name** — which React component to look in
5. **Line hint** — approximate, may be stale, do not rely on it exclusively

## Response Format

For each file you modify, respond with one or more SEARCH/REPLACE blocks:

\`\`\`
FILE: path/to/file.tsx
\`\`\`
\`\`\`
LINES: 42-48
<<<<<<< SEARCH
exact lines to find in the original file
=======
replacement lines
>>>>>>> REPLACE
\`\`\`
\`\`\`
DESCRIPTION: path/to/file.tsx
Brief description of what was changed.
\`\`\`

Rules for SEARCH/REPLACE blocks:
- Every SEARCH/REPLACE block MUST start with a LINES: start-end directive
- SEARCH content must match the original file EXACTLY (including whitespace)
- Each block should be the minimal change needed
- Order blocks from top-of-file to bottom-of-file
- Do NOT include line numbers in SEARCH/REPLACE content
- If the request cannot be satisfied in this file, reply with a one-sentence explanation and no blocks`

function describeSelection(request) {
  const selection = request?.selection
  if (!selection) return "No element was selected."

  const lines = [
    `- Tag: <${selection.tagName}>`,
    `- Component: ${selection.componentName || "unknown"}`,
    `- className: ${selection.className || "(none)"}`,
    `- Text: ${selection.text ? JSON.stringify(selection.text) : "(none)"}`,
  ]
  if (selection.rect) {
    const { width, height, x, y } = selection.rect
    lines.push(`- Rendered box: ${width}x${height} at (${x}, ${y})`)
  }
  if (selection.source) {
    lines.push(`- Source: ${selection.source.filePath}:${selection.source.lineNumber}`)
  }
  if (Array.isArray(request.ancestry) && request.ancestry.length > 0) {
    const chain = request.ancestry
      .map((node) => `<${node.tagName}${node.className ? ` class="${node.className}"` : ""}>`)
      .join(" < ")
    lines.push(`- Ancestors (closest first): ${chain}`)
  }
  if (request.url) lines.push(`- Page: ${request.url}`)
  return lines.join("\n")
}

function buildUserMessage(prompt, request, source, filePath) {
  const numbered = source
    .split("\n")
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n")

  return [
    `## File: ${filePath}`,
    "```tsx",
    numbered,
    "```",
    "",
    "## Selected element",
    describeSelection(request),
    "",
    "## Requested change",
    prompt,
  ].join("\n")
}

/**
 * These two paths are unpublished internals of the pinned vendor and resolve
 * only because its package.json declares no `exports` map. Degrade to the
 * handoff transport rather than crashing the route if that ever changes.
 */
async function loadVendorApplier(config) {
  const pkg = config.vendor.package
  try {
    const shared = await import(`${pkg}/dist/claude-shared.js`)
    const resolver = await import(`${pkg}/dist/path-resolver.js`)
    return { ...shared, ...resolver }
  } catch {
    return null
  }
}

async function loadAnthropic() {
  try {
    const sdk = await import("@anthropic-ai/sdk")
    return sdk.default ?? sdk.Anthropic ?? null
  } catch {
    // The SDK is optional here; without it the handoff path still answers.
    return null
  }
}

/**
 * The page names the file to send. Confining it to the project root is not
 * enough — `.env.local` lives there too — so `isEditableSourcePath` applies the
 * host's extension allowlist AND a denylist the host cannot widen, before
 * anything is read, uploaded, or echoed back in a response.
 *
 * Returns null when this transport cannot run, so the caller can hand off.
 */
async function applyWithClaude(config, prompt, request) {
  const projectRoot = config.projectRoot
  const filePath = request?.selection?.source?.filePath
  if (!filePath) return null

  const Anthropic = await loadAnthropic()
  if (!Anthropic) return null

  const vendor = await loadVendorApplier(config)
  if (!vendor) return null
  const { readSourceFiles, parseDiffResponse, validateDiffChange, applyReplacements } = vendor
  const { resolveProjectFilePath } = vendor

  const target = resolveProjectFilePath(filePath, projectRoot)
  if (!target) return null
  if (!isEditableSourcePath(config, target, path.relative(projectRoot, target))) {
    return {
      ok: false,
      message: `Only component source files can be edited (got ${path.basename(filePath)}).`,
    }
  }

  const { sources } = readSourceFiles([filePath], projectRoot)
  const original = sources.get(filePath)
  if (!original) return null

  let responseText
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: config.agent.model,
      max_tokens: config.agent.maxTokens,
      system: config.agent.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserMessage(prompt, request, original, filePath) },
      ],
    })
    responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error"
    return { ok: false, message: `Claude could not be reached: ${detail}` }
  }

  const parsed = parseDiffResponse(responseText)
  if (parsed.length === 0) {
    return { ok: false, message: responseText.trim().slice(0, 600) || "The agent proposed no edits." }
  }

  for (const diff of parsed) {
    // Only the file we sent, and only inside the project root.
    if (resolveProjectFilePath(diff.filePath, projectRoot) !== target) continue

    const invalid = validateDiffChange(diff, original, target)
    if (invalid) return { ok: false, message: invalid }

    const next = applyReplacements(original, diff.replacements)
    if (next === original) break

    await fs.writeFile(target, next, "utf8")
    const relative = path.relative(projectRoot, target)
    return {
      ok: true,
      message: diff.description || `Applied the change to ${relative}.`,
      filesChanged: [relative],
    }
  }

  return { ok: false, message: "The agent's edits did not match the current source." }
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "request"
}

async function writeHandoff(config, prompt, request) {
  const requestsDir = path.join(config.stateDir, "requests")
  await fs.mkdir(requestsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const file = path.join(requestsDir, `${stamp}-${slugify(prompt)}.md`)

  const body = [
    `# Design editor request`,
    "",
    `Captured ${new Date().toISOString()}`,
    "",
    "## Requested change",
    "",
    prompt,
    "",
    "## Selected element",
    "",
    describeSelection(request),
    "",
  ].join("\n")

  await fs.writeFile(file, body, "utf8")
  return {
    ok: true,
    message: "Queued for your coding agent — no ANTHROPIC_API_KEY is set, so nothing was edited.",
    handoffPath: path.relative(config.projectRoot, file),
  }
}

export function createAgent(config) {
  return {
    async runAgent(request) {
      const prompt = typeof request?.prompt === "string" ? request.prompt.trim() : ""
      if (!prompt) return { ok: false, message: "Describe the change you want first." }

      if (config.agent.transport !== "handoff" && process.env.ANTHROPIC_API_KEY) {
        const applied = await applyWithClaude(config, prompt, request)
        if (applied) return applied
      }

      return writeHandoff(config, prompt, request)
    },
  }
}
