/**
 * Design-editor HTTP routes, mounted in front of the Next app by the dev proxy.
 *
 * Everything sits under one configured prefix so the proxy can hand off with a
 * single check, and every route is loopback-only: this process writes project
 * files, so a page on another origin must never be able to reach it.
 *
 * The prefix is the same value the browser reads as `apiBase` from the injected
 * config, so the two halves of the contract cannot drift apart.
 */

import { resolveConfig } from "../config.mjs"
import { createAgent } from "./agent.mjs"
import { createControlDefaults } from "./control-defaults.mjs"
import { createIconSet } from "./icon-set.mjs"
import { createOptionsStore, normalizeOptionSet } from "./options-store.mjs"
import { createVariantCatalog } from "./variants.mjs"

const MAX_BODY_BYTES = 1024 * 1024
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
// Option keys are `Component:line:step/step/…` — `elementKey()` joins up to six
// DOM steps with `/`, so the separator has to be legal or every real element is
// refused. The key is only ever an object key in one JSON file, never a path,
// so `/` cannot traverse; `..` is rejected anyway to keep the guard meaningful.
const KEY_PATTERN = /^[A-Za-z0-9_.:?@/-]{1,200}$/
const TRAVERSAL_PATTERN = /(^|\/)\.\.(\/|$)/

function badRequest(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function hostnameOf(value) {
  if (typeof value !== "string" || value.length === 0) return ""
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`)
    return url.hostname.replace(/^\[|\]$/g, "")
  } catch {
    return ""
  }
}

function isLoopbackHost(value) {
  const host = hostnameOf(value)
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
}

/**
 * `"null"` is NOT an exemption. It is the Origin a sandboxed iframe, a
 * `data:`/`blob:` document, or a redirected cross-origin form sends, and those
 * are precisely the contexts an attacker controls. Treating it as "no origin"
 * let any page reach these routes with a CORS-preflight-free request.
 *
 * A genuinely absent header still passes: curl and the test harness send none,
 * and a non-browser client carries no ambient credentials to abuse.
 */
function isLocalRequest(req) {
  if (!LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress ?? "")) return false
  if (!isLoopbackHost(req.headers.host)) return false
  const origin = req.headers.origin
  if (origin !== undefined && !isLoopbackHost(origin)) return false
  return true
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
  })
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw badRequest("Request body is too large", 413)
    chunks.push(chunk)
  }
  if (size === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw badRequest("Request body is not valid JSON")
  }
}

function optionKey(segment) {
  let decoded
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (!KEY_PATTERN.test(decoded)) return null
  return TRAVERSAL_PATTERN.test(decoded) ? null : decoded
}

function controlTarget(searchParams) {
  const group = searchParams.get("group")?.trim() ?? ""
  const key = searchParams.get("key")?.trim() ?? ""
  if (!group || !key || group.length > 200 || key.length > 200) {
    throw badRequest("Control default needs a group and key")
  }
  return { group, key }
}

async function route(store, defaults, agent, icons, variants, prefix, req, res, url) {
  const { pathname, searchParams } = url
  const rest = pathname.slice(prefix.length)

  if (rest === "/options" && req.method === "GET") {
    sendJson(res, 200, await store.readOptionSets())
    return
  }

  if (rest === "/control-default") {
    const { group, key } = controlTarget(searchParams)
    if (req.method === "GET") {
      sendJson(res, 200, await defaults.read(group, key))
      return
    }
    if (req.method === "PUT") {
      const body = await readJsonBody(req)
      if (!body || typeof body !== "object" || !("value" in body)) {
        throw badRequest("Control default PUT needs a value")
      }
      sendJson(res, 200, await defaults.write(group, key, body.value))
      return
    }
    if (req.method === "DELETE") {
      sendJson(res, 200, await defaults.remove(group, key))
      return
    }
  }

  const keyed = /^\/options\/([^/]+)$/.exec(rest)
  if (keyed) {
    const key = optionKey(keyed[1])
    if (!key) throw badRequest("Invalid option key")

    if (req.method === "PUT") {
      const set = normalizeOptionSet(await readJsonBody(req), key)
      if (!set) throw badRequest("Invalid option set")
      sendJson(res, 200, await store.writeOptionSet(set))
      return
    }
    if (req.method === "DELETE") {
      sendJson(res, 200, { ok: await store.deleteOptionSet(key) })
      return
    }
  }

  if (rest === "/icons" && req.method === "GET") {
    sendJson(res, 200, icons.read())
    return
  }

  // The variant axes a component declares. Read-only, and behind the same
  // loopback guard as everything else: it reads a project file, which is
  // exactly the capability the guard exists to keep on this machine.
  if (rest === "/variants" && req.method === "GET") {
    sendJson(res, 200, variants.read(searchParams.get("file") ?? ""))
    return
  }

  if (rest === "/agent" && req.method === "POST") {
    sendJson(res, 200, await agent.runAgent((await readJsonBody(req)) ?? {}))
    return
  }

  throw badRequest(`No design-editor route for ${req.method} ${pathname}`, 404)
}

/** `config` is the resolved object from `config.mjs`; defaults apply without it. */
export function createDesignEditorRoutes(config = resolveConfig()) {
  const prefix = config.apiPrefix
  const store = createOptionsStore({ stateDir: config.stateDir })
  const defaults = createControlDefaults(config)
  const agent = createAgent(config)
  const icons = createIconSet(config)
  const variants = createVariantCatalog(config)

  return {
    prefix,

    /** Returns true when this handler owns the request. */
    handle(req, res) {
      let url
      try {
        url = new URL(req.url ?? "/", "http://localhost")
      } catch {
        sendJson(res, 400, { ok: false, message: "Invalid request URL" })
        return true
      }
      const { pathname } = url
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false

      if (!isLocalRequest(req)) {
        sendJson(res, 403, { ok: false, message: "Design editor routes are loopback-only" })
        return true
      }

      route(store, defaults, agent, icons, variants, prefix, req, res, url).catch((error) => {
        if (res.headersSent) {
          res.end()
          return
        }
        sendJson(res, Number(error?.statusCode) || 500, {
          ok: false,
          message: error?.message ?? "Design editor route failed",
        })
      })

      return true
    },
  }
}
