/**
 * Runtime launcher: five monkey-patches over `react-rewrite-cli@0.1.1`, the
 * overlay+chrome concatenation, and the loopback route mount.
 *
 * The patches fix defects in the pinned vendor build — an unauthenticated
 * all-interfaces bind, a `content-length` + `transfer-encoding` conflict
 * browsers reject, and React 19's percent-encoded owner-stack paths. None of
 * them know anything about the host app, so they ship verbatim.
 *
 * Everything that DID know about one host is now read from the resolved config:
 * the project root, the ports, the API prefix, and the chrome selectors handed
 * to the vendor patch.
 */

import fs from "node:fs"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { Readable } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"

import { browserPrelude } from "../config.mjs"
import { patchOverlay } from "./vendor-patch.mjs"

const LOOPBACK = "127.0.0.1"

// The pinned vendor probes upward from these two constants and never exposes
// them as options, so a configured port is applied by remapping the probe.
const VENDOR_WS_PORT = 3457
const VENDOR_PROXY_PORT = 3456

const CHROME_BUNDLE = fileURLToPath(
  new URL("../dist/design-editor.js", import.meta.url)
)

/**
 * Mirrors `isLoopbackHost` in server/routes.mjs. Not imported from there: that
 * module pulls in the agent and the options store, and this file is loaded
 * before the vendor boots, when neither exists yet.
 */
function isLoopbackOrigin(value) {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "")
    return host === "localhost" || host === "127.0.0.1" || host === "::1"
  } catch {
    return false
  }
}

/**
 * Prefers the HOST's copy of the vendor, so an app that already pins
 * `react-rewrite-cli` wins over the one installed beside this package. The 22
 * splices are only valid against 0.1.1 either way, which is why the dependency
 * is exact-pinned rather than a peer.
 */
export function resolveVendor(config) {
  const specifier = config.vendor.package
  let entry
  try {
    entry = createRequire(path.join(config.projectRoot, "package.json")).resolve(specifier)
  } catch {
    entry = fileURLToPath(import.meta.resolve(specifier))
  }

  return {
    entry,
    overlay: config.vendor.overlayPath
      ? path.resolve(config.projectRoot, config.vendor.overlayPath)
      : path.join(path.dirname(entry), "overlay.js"),
  }
}

export function readOverlaySource(config) {
  return fs.readFileSync(resolveVendor(config).overlay, "utf8")
}

/**
 * React Rewrite 0.1.1 identifies Next only by the presence of a next.config
 * file. A valid create-next-app project does not need one, so its detector
 * rejects the framework before it ever looks at the installed `next` package.
 * Report one virtual config path only during that synchronous detection pass;
 * nothing is written into the host project and every other filesystem probe
 * keeps its real answer.
 */
function virtualNextConfig(config) {
  const manifestPath = path.join(config.projectRoot, "package.json")
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  } catch {
    return null
  }
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
  if (!dependencies.next) return null

  const names = ["next.config.js", "next.config.ts", "next.config.mjs"]
  if (names.some((name) => fs.existsSync(path.join(config.projectRoot, name)))) return null
  return path.join(config.projectRoot, "next.config.mjs")
}

function readChromeBundle() {
  try {
    return fs.readFileSync(CHROME_BUNDLE, "utf8")
  } catch {
    console.warn(
      "[design-editor] chrome bundle missing — run `npm run build` in the package"
    )
    return ""
  }
}

async function loadRoutes(config) {
  try {
    const { createDesignEditorRoutes } = await import("../server/routes.mjs")
    return createDesignEditorRoutes(config)
  } catch (error) {
    console.warn(
      `[design-editor] routes unavailable — options and AI will be disabled (${error.message})`
    )
    return null
  }
}

function decodeSourcePath(value) {
  if (typeof value !== "string" || !value.includes("%")) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function writeEndpointFile(config, runtime) {
  try {
    fs.mkdirSync(config.stateDir, { recursive: true })
    fs.writeFileSync(
      config.endpointFile,
      `${JSON.stringify(
        {
          pid: process.pid,
          appPort: runtime.appPort ?? null,
          proxyPort: runtime.proxyPort,
          wsPort: runtime.wsPort,
          apiPrefix: config.apiPrefix,
          apiBase: `http://${LOOPBACK}:${runtime.proxyPort}${config.apiPrefix}`,
          wsUrl: `ws://${LOOPBACK}:${runtime.wsPort}`,
          projectRoot: config.projectRoot,
        },
        null,
        2
      )}\n`,
      "utf8"
    )
  } catch (error) {
    // Port discovery is a convenience for the harness, never a launch blocker.
    console.warn(`[design-editor] could not write endpoint file (${error.message})`)
  }
}

/**
 * Installs every patch, then hands control to the vendor CLI.
 *
 * `argv` must already be in the vendor's own shape: commander parses
 * `process.argv` at module scope and aborts on any flag it does not declare,
 * so every first-party flag has to be consumed before this point.
 */
export async function launch(config, { appPort, host, open, verbose = false }) {
  const vendor = resolveVendor(config)

  // The WebSocket patch below rewrites `WebSocket.prototype.on`, which only
  // reaches the vendor if both resolve to the SAME `ws` instance. Resolve it
  // through the vendor so a nested install cannot silently split them.
  let wsSpecifier = "ws"
  try {
    wsSpecifier = pathToFileURL(createRequire(vendor.entry).resolve("ws")).href
  } catch {
    // Falls back to this package's own `ws`, which is the hoisted copy.
  }
  // `ws` is CommonJS, and its named exports are only statically detectable when
  // it is imported by package specifier — not by resolved path.
  const wsModule = await import(wsSpecifier)
  const WebSocket = wsModule.WebSocket ?? wsModule.default?.WebSocket ?? wsModule.default
  if (!WebSocket?.prototype) throw new Error(`Could not load 'ws' from ${wsSpecifier}`)
  const WebSocketServer =
    wsModule.WebSocketServer ??
    wsModule.Server ??
    wsModule.default?.WebSocketServer ??
    wsModule.default?.Server
  if (!WebSocketServer?.prototype?.handleUpgrade) {
    throw new Error(`Could not load 'ws' WebSocketServer from ${wsSpecifier}`)
  }

  const originalCreateReadStream = fs.createReadStream
  const originalExistsSync = fs.existsSync
  const originalCreateServer = http.createServer
  const originalListen = net.Server.prototype.listen
  const originalWriteHead = http.ServerResponse.prototype.writeHead
  const originalWebSocketOn = WebSocket.prototype.on
  const originalHandleUpgrade = WebSocketServer.prototype.handleUpgrade

  const runtime = { appPort, proxyPort: null, wsPort: null }
  let patchedOverlay

  // Keep the package immutable on disk. The pinned bundle is patched only when
  // the development proxy serves it, and every replacement is shape-checked.
  // The path compare is exact, so a fork, a rename, or pnpm's non-flat layout
  // cannot make an unrelated `overlay.js` look like the vendor's.
  fs.createReadStream = function createPatchedOverlayReadStream(filePath, ...args) {
    if (path.resolve(String(filePath)) === vendor.overlay) {
      patchedOverlay ??= patchOverlay(fs.readFileSync(vendor.overlay, "utf8"), config)
      return Readable.from([
        `${browserPrelude(config, runtime)}\n${patchedOverlay}\n;\n${readChromeBundle()}`,
      ])
    }

    return originalCreateReadStream.call(this, filePath, ...args)
  }
  syncBuiltinESMExports()

  // The vendor constructs its WebSocketServer with no `verifyClient`, and the
  // browser same-origin policy does not cover WebSockets: any page in any tab
  // could open `ws://127.0.0.1:<wsPort>` and send `updateProperty` /
  // `commitBatch`, which write project source. Binding to loopback does not
  // help — the victim's own browser is on loopback.
  //
  // The handshake is the only chokepoint the vendor leaves reachable, so the
  // origin is checked there. `undefined` passes (non-browser clients send no
  // Origin and carry no ambient authority); `"null"` does not, for the same
  // reason as in server/routes.mjs.
  WebSocketServer.prototype.handleUpgrade = function handleLoopbackUpgrade(
    request,
    socket,
    head,
    callback
  ) {
    const origin = request?.headers?.origin
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      socket.destroy()
      return
    }
    return originalHandleUpgrade.call(this, request, socket, head, callback)
  }

  // React 19 owner stacks URL-encode spaces in absolute source paths. Normalize
  // only path-bearing editor messages before React Rewrite applies its existing
  // project-root validation; otherwise it treats the encoded absolute path as a
  // relative path and prepends the workspace twice.
  WebSocket.prototype.on = function onNormalizedEditorMessage(event, listener) {
    if (event !== "message") {
      return originalWebSocketOn.call(this, event, listener)
    }

    return originalWebSocketOn.call(this, event, function normalizedMessage(data, ...args) {
      try {
        const message = JSON.parse(String(data))
        if (message && typeof message === "object") {
          message.filePath = decodeSourcePath(message.filePath)
          message.file = decodeSourcePath(message.file)
          if (Array.isArray(message.operations)) {
            message.operations = message.operations.map((operation) => ({
              ...operation,
              file: decodeSourcePath(operation?.file),
            }))
          }
          data = Buffer.from(JSON.stringify(message))
        }
      } catch {
        // Non-JSON WebSocket traffic is unrelated to editor source operations.
      }

      return listener.call(this, data, ...args)
    })
  }

  // The published proxy buffers Next's streamed HTML, sets Content-Length, but
  // leaves Transfer-Encoding: chunked in place. Browsers reject that conflicting
  // response even though curl accepts it. Normalize only this CLI process.
  http.ServerResponse.prototype.writeHead = function writeValidHeaders(statusCode, ...args) {
    const headers = args.find((arg) => arg && typeof arg === "object" && !Array.isArray(arg))
    if (headers?.["content-length"] && headers["transfer-encoding"]) {
      delete headers["transfer-encoding"]
    }

    return originalWriteHead.call(this, statusCode, ...args)
  }

  function configuredPort(port) {
    if (config.ports.ws !== "auto" && port === VENDOR_WS_PORT) return config.ports.ws
    if (config.ports.proxy !== "auto" && port === VENDOR_PROXY_PORT) return config.ports.proxy
    return port
  }

  // Both long-lived servers are http.Servers and the pinned vendor starts the
  // WebSocket one first, so recording them in order names the ports without
  // guessing at 3456/3457 — which the vendor abandons the moment either is busy.
  function recordBoundPort(server) {
    if (!(server instanceof http.Server)) return
    server.once("listening", () => {
      const address = server.address()
      if (!address || typeof address !== "object") return
      if (runtime.wsPort === null) runtime.wsPort = address.port
      else if (runtime.proxyPort === null) {
        runtime.proxyPort = address.port
        writeEndpointFile(config, runtime)
        // The vendor's own banner reports the port it asked for, not the one it
        // got, so this line has to land after it to be the one a reader trusts.
        setImmediate(() => {
          console.log(
            `[design-editor] proxy http://${LOOPBACK}:${runtime.proxyPort} — ws ://${LOOPBACK}:${runtime.wsPort} — api ${config.apiPrefix}`
          )
        })
      }
    })
  }

  // React Rewrite can write project files, but its published CLI binds the proxy
  // and WebSocket to every interface. Keep both servers local until upstream adds
  // an authenticated, loopback-only binding option.
  net.Server.prototype.listen = function listenOnLoopback(...args) {
    recordBoundPort(this)

    if (typeof args[0] === "number") {
      args[0] = configuredPort(args[0])
      const hasExplicitHost = typeof args[1] === "string"
      if (!hasExplicitHost) {
        const [port, ...rest] = args
        return originalListen.call(this, port, LOOPBACK, ...rest)
      }
    } else if (args[0] && typeof args[0] === "object") {
      const options = { ...args[0] }
      if (typeof options.port === "number") options.port = configuredPort(options.port)
      if (!("host" in options)) options.host = LOOPBACK
      args[0] = options
    }

    return originalListen.apply(this, args)
  }

  // The chrome needs a few endpoints the vendor WebSocket protocol has no verb
  // for — saved element options and the AI handoff. Mounting them by wrapping the
  // proxy's own request handler keeps them on the same loopback origin as the
  // page, so no CORS or second port is involved.
  const routes = await loadRoutes(config)
  if (routes) {
    http.createServer = function createRoutedServer(...args) {
      const handler = args.find((arg) => typeof arg === "function")
      if (!handler) return originalCreateServer.apply(this, args)

      const routed = (req, res) => {
        if (routes.handle(req, res)) return
        return handler(req, res)
      }

      return originalCreateServer.apply(
        this,
        args.map((arg) => (arg === handler ? routed : arg))
      )
    }
    syncBuiltinESMExports()
  }

  // The vendor derives its own project root from `process.cwd()`. Aligning the
  // two derivations is what keeps its "outside the project root" refusal and
  // ours from ever disagreeing about which files are in scope.
  if (path.resolve(process.cwd()) !== config.projectRoot) process.chdir(config.projectRoot)

  const virtualConfig = virtualNextConfig(config)
  if (virtualConfig) {
    fs.existsSync = function existsWithConfig(filePath) {
      return path.resolve(String(filePath)) === virtualConfig || originalExistsSync.call(this, filePath)
    }
    syncBuiltinESMExports()
  }

  process.argv = [
    process.argv[0],
    vendor.entry,
    ...(appPort ? [String(appPort)] : []),
    ...(open ? [] : ["--no-open"]),
    ...(host ? ["--host", host] : []),
    ...(verbose ? ["--verbose"] : []),
  ]

  try {
    await import(pathToFileURL(vendor.entry).href)
  } finally {
    if (virtualConfig) {
      fs.existsSync = originalExistsSync
      syncBuiltinESMExports()
    }
  }
}
