/**
 * A design system that lives at a URL instead of in the project.
 *
 * Every other library kind names a file this process can open. This one names a
 * page somebody published — a Storybook, a documentation site, a token file
 * served over HTTP — and the whole of the designer's input is a URL they
 * pasted out of their address bar. That single difference drives everything
 * below, because the address bar is not a file picker: the URL is almost never
 * the catalog, it is a page NEAR the catalog, and this module's job is to work
 * out what the catalog is from a deep link into a component's docs.
 *
 * THE URL IS CARRIED IN `source.path`, NOT IN A NEW FIELD. A library's source
 * is `{ kind, path }` everywhere — the client reads `library.source.path` into
 * the row, `libraries.mjs` dedupes on it, `libraryId` slugs it, and the removal
 * path matches on it. Giving a URL library a `source.url` would mean touching
 * every one of those for a value that is already a string identifying where the
 * library came from. So a URL library spells itself `{ kind: "url", path: "<the
 * url>" }` and no existing consumer had to learn anything. The next reader will
 * want to "fix" this; the fix is four files of churn and one new way for a row
 * to go missing.
 *
 * SIGN-IN IS THE NORMAL CASE, NOT AN EDGE CASE. Most component catalogs worth
 * pointing this at are internal to some organisation, and a refused request
 * mostly does not fail the way a refused request is supposed to. A plain
 * `fetch` that follows redirects gets HTTP 200 and a body — and the body is a
 * login page. Parsed, that is a "library" containing somebody's sign-in form,
 * installed with a green checkmark, and the designer has no way to see what
 * went wrong. `looksLikeSsoWall` exists for exactly that failure, and it reads
 * the BODY as well as the redirect because following the redirect is what hides
 * the 302 in the first place. `library-auth.mjs` owns the rules, all of which
 * are HTTP or OAuth standards rather than facts about one vendor.
 *
 * EVERY NETWORK CALL IS INJECTABLE. `fetchImpl` and `runHelper` are options with
 * real defaults rather than imports, so the test suite runs offline against
 * fakes. A module that reached for `globalThis.fetch` directly could only be
 * tested by a suite that was allowed to talk to the internet, which is a suite
 * that fails on a plane and passes when the site it points at changes.
 *
 * Nothing here touches the filesystem or the store. Reading a catalog out of
 * text is `library-sources.mjs`'s job and it is reused rather than
 * reimplemented — a second DTCG parser is how a token file served over HTTP
 * comes to be understood differently from the same file on disk.
 */

import { execFile } from "node:child_process"

import {
  describeLibrary,
  detectLibraryKind,
  emptyCatalog,
  libraryCounts,
  parseLibrary,
  slug,
} from "./library-sources.mjs"

export const URL_SOURCE_KIND = "url"

/** Long enough for a cold Cloud Run instance, short enough not to hang a panel. */
const DEFAULT_TIMEOUT_MS = 15000
/**
 * Probes get a tighter bound than the page does. There are up to a dozen of
 * them and most are expected to 404, so the full timeout applied to each would
 * turn one unreachable host into three minutes of a blocked route.
 */
const PROBE_TIMEOUT_MS = 5000
/** A login page can run to a megabyte; a catalog worth reading is smaller. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
/** How many path prefixes are probed before the bare origin. */
const MAX_PROBE_DEPTH = 4
const MAX_PROBES = 12
const MAX_REDIRECTS = 5
/** Guards on a document nobody in this process wrote, not product limits. */
const MAX_COMPONENTS = 2000
const MAX_VARIANTS = 200

const ACCEPT = "application/json, text/html;q=0.9, */*;q=0.1"

import { classifyWall, credentialHeaders, originOf } from "./library-auth.mjs"

/** What the panel shows when the URL is real and the editor is not signed in. */
const SSO_SENTENCE =
  "Needs sign-in: this site refused the editor. " +
  "Sign in to it below, or paste a public URL."
/** What it shows when the URL answered and had no design system on it. */
const NOTHING_SENTENCE =
  "Nothing at this URL read as a design system. " +
  "Paste a Storybook URL, a token file, or a page documenting one component."
/** Appended to an HTTP failure, which states a fact and suggests nothing. */
const CHECK_SENTENCE = "Check the address, or paste a page that documents a component."

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/* ------------------------------------------------------------------------- */
/* Naming                                                                     */
/* ------------------------------------------------------------------------- */

export function isLibraryUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false
  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    return false
  }
  // Only the two schemes this module can actually fetch. `file:` would be a
  // filesystem read wearing a URL, which is the one thing `resolveSource` in
  // `libraries.mjs` exists to prevent.
  return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0
}

function words(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Sentence case, so "cloud-design-system" reads as a name and not as a title. */
function humanize(parts) {
  if (parts.length === 0) return ""
  const [first, ...rest] = parts
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ")
}

/**
 * A word a deployment tool minted rather than a word a person chose.
 *
 * Every managed host generates names like `storybook-k4f9x2n-uc.example.app`,
 * and naming a library after one would put a deployment hash in the panel.
 * Letters mixed with digits over a few characters is the whole test: it catches
 * the hash without catching `m3`, `v2` or `web3`, which are names people do
 * choose.
 */
function looksGenerated(word) {
  return word.length >= 5 && /[0-9]/.test(word) && /[a-z]/.test(word)
}

/** Host labels that describe the hosting rather than the design system. */
const GENERIC_HOST_LABELS = new Set([
  "www",
  "docs",
  "doc",
  "storybook",
  "design",
  "ui",
  "app",
  "apps",
  "web",
  "dev",
  "staging",
  "demo",
  "preview",
  "site",
  "go",
])

/**
 * A human name for the thing at this URL.
 *
 * The host wins when it says something. A system published at
 * `<its-own-name>.example.com/<product>/components/<thing>` is named by the
 * hostname, and the first path segment there is one product inside it. The host
 * loses when it is a deployment artefact or a generic word — a Cloud Run
 * service is `storybook-<hash>-uc.a.run.app`, which will never say what it is
 * serving — and then the first path segment is the only name available.
 *
 * Either way this is a STARTING name. `update(id, { name })` exists, and a
 * designer who dislikes the guess renames the row in one click — which is why
 * guessing is better here than asking for a name the designer does not yet know
 * they will want to change.
 */
export function libraryNameFromUrl(url) {
  let parsed
  try {
    parsed = new URL(String(url).trim())
  } catch {
    return ""
  }

  const labels = parsed.hostname.split(".").filter(Boolean)
  while (labels.length > 1 && labels[0] === "www") labels.shift()
  const hostWords = words(labels[0] ?? "")
  const hostSpeaks =
    hostWords.length > 0 &&
    !hostWords.some(looksGenerated) &&
    !(hostWords.length === 1 && GENERIC_HOST_LABELS.has(hostWords[0]))
  if (hostSpeaks) return humanize(hostWords)

  for (const segment of parsed.pathname.split("/").filter(Boolean)) {
    let decoded = segment
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      // A segment that is not valid percent-encoding is still a string a
      // designer can read; the raw form is a better name than no name.
    }
    const segmentWords = words(decoded)
    if (segmentWords.length && !segmentWords.some(looksGenerated)) return humanize(segmentWords)
  }

  return humanize(hostWords) || parsed.hostname
}

/* ------------------------------------------------------------------------- */
/* Sign-in walls                                                              */
/* ------------------------------------------------------------------------- */

function headerReader(headers) {
  if (headers && typeof headers.get === "function") return (name) => headers.get(name) ?? ""
  const entries = isPlainObject(headers) ? Object.entries(headers) : []
  const lower = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value]))
  return (name) => lower.get(name.toLowerCase()) ?? ""
}

/**
 * Whether this response is a sign-in wall wearing the clothes of an answer.
 *
 * A thin reading of `classifyWall`, which owns every rule. Kept as its own name
 * because most callers only need the boolean, and because the question reads
 * better at a branch than `classifyWall(...) !== null` does.
 *
 * The case worth knowing about is the 200. `fetch` follows redirects by
 * default, so by the time a caller sees a response the 302 that explains it is
 * gone and all that is left is a successful-looking page of login HTML. Parsed
 * as a library, that page installs a design system made of somebody's sign-in
 * form — so the body evidence is not belt-and-braces, it is the check that
 * stops the failure this whole module was written around.
 */
export function looksLikeSsoWall(response, url = "") {
  if (!isPlainObject(response)) return false
  return classifyWall(response, url) !== null
}

/* ------------------------------------------------------------------------- */
/* Storybook                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * A Storybook story index read as a component catalog, or null.
 *
 * Two dialects, because Storybook renamed the file and its keys at v7 and both
 * are still deployed: v4+ keys a `title` off `entries`, v3 keys a `kind` off
 * `stories`. They are the same fact under two spellings, so they collapse here
 * rather than in two branches of the caller.
 *
 * The grouping is what turns an index into a catalog. A story index is a flat
 * list of STORIES — `Primitives/Avatar` appears once per variant — and a
 * designer thinks in components. So stories collapse onto their title, and the
 * story names become a variant axis on the component rather than a dozen
 * near-duplicate rows. Docs entries are dropped when the same title also has
 * stories, because "Docs" is not a variant of anything; a title with only docs
 * still yields a component, with no variant axis, since a documented component
 * is a component.
 */
export function parseStorybookIndex(json) {
  if (!isPlainObject(json)) return null
  const rows = isPlainObject(json.entries)
    ? json.entries
    : isPlainObject(json.stories)
      ? json.stories
      : null
  if (!rows) return null

  const byTitle = new Map()
  for (const raw of Object.values(rows)) {
    if (!isPlainObject(raw)) continue
    // `title` is v4's word and `kind` is v3's word for the same string.
    const title = String(raw.title ?? raw.kind ?? "").trim()
    if (!title) continue
    if (!byTitle.has(title) && byTitle.size >= MAX_COMPONENTS) continue

    let entry = byTitle.get(title)
    if (!entry) {
      entry = { title, stories: [], file: "" }
      byTitle.set(title, entry)
    }
    if (!entry.file && typeof raw.importPath === "string" && raw.importPath.trim()) {
      entry.file = raw.importPath.trim()
    }

    const docs = raw.type === "docs" || raw.parameters?.docsOnly === true
    const story = String(raw.name ?? "").trim()
    if (docs || !story) continue
    if (!entry.stories.includes(story) && entry.stories.length < MAX_VARIANTS) {
      entry.stories.push(story)
    }
  }
  if (byTitle.size === 0) return null

  const components = []
  for (const entry of byTitle.values()) {
    // "Primitives/Forms/Avatar": everything before the last segment is where a
    // designer would look for it, the last segment is what they would call it.
    const segments = entry.title
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
    const name = segments.length ? segments[segments.length - 1] : entry.title
    const group = segments.slice(0, -1).join("/")
    components.push({
      id: `component:${slug(entry.title)}`,
      name,
      ...(group ? { group } : {}),
      ...(entry.file ? { file: entry.file } : {}),
      ...(entry.stories.length
        ? {
            props: [
              {
                name: "Story",
                type: "variant",
                values: entry.stories,
                default: entry.stories[0],
              },
            ],
          }
        : {}),
    })
  }
  return { components }
}

/* ------------------------------------------------------------------------- */
/* The page itself                                                            */
/* ------------------------------------------------------------------------- */

const HTML_HINT = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i
const META_DESCRIPTION = /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i
const META_CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i
/** A segment that names the page's plumbing rather than its subject. */
const PAGE_NOISE = /^(index|default|home)(\.[a-z0-9]+)?$/i
const PAGE_EXTENSION = /\.(html?|php|aspx?|jsp)$/i
const MAX_DESCRIPTION = 400

function metaDescription(html) {
  const tag = META_DESCRIPTION.exec(html)
  if (!tag) return ""
  const content = META_CONTENT.exec(tag[0])
  const value = (content?.[1] ?? content?.[2] ?? "").trim()
  return value.slice(0, MAX_DESCRIPTION)
}

/**
 * One component, read off the URL of the page documenting it.
 *
 * A single-component library looks thin, and it is the honest answer: a deep
 * link into `…/components/split-button` is a page ABOUT one component, and
 * reporting one component is what that page contains. It is also the thing that
 * makes pasting a deep link useful at all — a designer who copies the URL they
 * are reading gets the component they were reading about, instead of an error
 * telling them to go and find a story index they have never heard of.
 *
 * The URL is the evidence, not the markup. Every documentation site renders its
 * own chrome, its own nav and its own search box, and no scrape of the DOM
 * survives a redesign; the path segments are the site's own information
 * architecture and they are stable. The description is the one thing taken from
 * the markup, because `<meta name="description">` is written for exactly this.
 */
export function componentFromPage(url, html) {
  const text = typeof html === "string" ? html : ""
  if (!HTML_HINT.test(text)) return null

  let parsed
  try {
    parsed = new URL(String(url).trim())
  } catch {
    return null
  }

  const segments = parsed.pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .filter((segment) => segment && !PAGE_NOISE.test(segment))
  if (segments.length === 0) return null

  const last = segments[segments.length - 1].replace(PAGE_EXTENSION, "")
  const name = humanize(words(last))
  if (!name) return null
  const group = humanize(words(segments[segments.length - 2] ?? ""))
  const description = metaDescription(text)

  return {
    id: `component:${slug(last)}`,
    name,
    ...(group ? { group } : {}),
    ...(description ? { description } : {}),
    // The URL itself: there is no project file behind this component, and a
    // consumer that wants to go and look at it wants the page.
    file: parsed.toString(),
  }
}

/* ------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Where a catalog might be, given a URL somebody pasted, best guess first.
 *
 * A designer pastes the page they are looking at, which is several levels below
 * the story index that describes the whole system. So the path is walked from
 * the deepest prefix outwards and the bare origin is tried last — a Storybook
 * mounted under a sub-path is found at `<that path>/index.json` long before the
 * origin is reached, and a Storybook at the root is still found. Both filenames
 * are emitted at every level because the index was renamed at v7 and both are
 * live on the internet.
 */
export function catalogProbes(url) {
  let parsed
  try {
    parsed = new URL(String(url).trim())
  } catch {
    return []
  }

  const probes = []
  const push = (value) => {
    if (probes.length < MAX_PROBES && !probes.includes(value)) probes.push(value)
  }

  // A URL that already names a JSON file is not a hint about where the catalog
  // is; it IS the catalog, and probing around it first would be perverse.
  if (/\.json$/i.test(parsed.pathname)) push(parsed.toString())

  const segments = parsed.pathname.split("/").filter(Boolean)
  const prefixes = []
  for (let depth = segments.length; depth > 0; depth -= 1) {
    prefixes.push(`/${segments.slice(0, depth).join("/")}`)
  }
  for (const prefix of [...prefixes.slice(0, MAX_PROBE_DEPTH), ""]) {
    push(new URL(`${prefix}/index.json`, parsed.origin).toString())
    push(new URL(`${prefix}/stories.json`, parsed.origin).toString())
  }
  return probes
}

/**
 * A helper command the PROJECT configures, for a site this process cannot
 * authenticate to on its own.
 *
 * This is the generic replacement for what would otherwise be a hardcoded
 * vendor integration. Plenty of organisations front their internal docs with a
 * proxy that has a command-line client — a signed-request tool, a VPN-aware
 * curl wrapper, a credential helper — and the editor has no business knowing
 * which. So it knows none of them: the project names a command in its config,
 * the editor runs it when a fetch is refused, and the command's job is to print
 * an HTTP response.
 *
 *   libraries: { fetchCommand: ["my-auth-curl", "--dump-header", "-", "{url}"] }
 *
 * `{url}` is substituted per argument. The command must print a full HTTP
 * response — status line, headers, blank line, body — which is what
 * `curl -i` and most such tools already emit, and what `parseHttpResponse`
 * below reads back. A bare body would be indistinguishable from an error page,
 * which is the same "install the login screen as a library" failure the wall
 * detection exists to prevent.
 *
 * Unset by default, so out of the box the editor does no such thing. When it is
 * set, `execFile` with an argv array and never a shell: the URL is input that
 * arrived from a web page, and a shell here would make that a command
 * injection.
 */
function runFetchCommand(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchCommand = null } = {}) {
  const argv = Array.isArray(fetchCommand) ? fetchCommand.filter((part) => typeof part === "string") : []
  if (argv.length < 1) return Promise.resolve(null)

  const [binary, ...rest] = argv.map((part) => part.split("{url}").join(url))
  return new Promise((resolve) => {
    execFile(
      binary,
      rest,
      { timeout: timeoutMs, maxBuffer: MAX_RESPONSE_BYTES, encoding: "utf8" },
      (error, stdout) => {
        // A missing binary is the ordinary case for a config carried between
        // machines: there is no helper here, so there is no second route, and
        // the caller reports the wall.
        if (error?.code === "ENOENT") {
          resolve(null)
          return
        }
        // A non-zero exit is NOT a reason to discard the output. These tools
        // conventionally exit non-zero on any HTTP error while still printing
        // the response, and a 401 is exactly what the caller needs to see.
        resolve(parseHttpResponse(typeof stdout === "string" ? stdout : ""))
      }
    )
  })
}

/** A printed HTTP response — status line, headers, body — as a record. */
function parseHttpResponse(dump) {
  const status = /^HTTP\/[\d.]+ (\d{3})/.exec(dump)
  if (!status) return null

  const crlf = dump.indexOf("\r\n\r\n")
  const lf = dump.indexOf("\n\n")
  const split =
    crlf !== -1 && (lf === -1 || crlf < lf)
      ? { at: crlf, width: 4 }
      : lf !== -1
        ? { at: lf, width: 2 }
        : null
  if (!split) return null

  const headers = {}
  for (const line of dump.slice(0, split.at).split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
  }
  return {
    status: Number(status[1]),
    contentType: headers["content-type"] ?? "",
    text: dump.slice(split.at + split.width, split.at + split.width + MAX_RESPONSE_BYTES),
    location: headers.location ?? "",
    headers,
  }
}

function failed(error, url) {
  const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
    ? "took too long to answer"
    : `could not be reached (${error?.message ?? "network error"})`
  return { ok: false, status: 0, contentType: "", text: "", viaHelper: false, sso: false, error: `${url} ${reason}` }
}

function normalizeHeaders(headers) {
  if (!headers) return {}
  const pairs =
    typeof headers.entries === "function" ? [...headers.entries()] : Object.entries(headers)
  return Object.fromEntries(pairs.map(([key, value]) => [String(key).toLowerCase(), value]))
}

async function readResponse(response) {
  const header = headerReader(response?.headers)
  let text = ""
  try {
    text = String(await response.text())
  } catch {
    // A body that cannot be read is a body with nothing in it for the parsers.
  }
  return {
    status: Number(response?.status) || 0,
    contentType: String(header("content-type") ?? ""),
    text: text.length > MAX_RESPONSE_BYTES ? text.slice(0, MAX_RESPONSE_BYTES) : text,
    location: String(header("location") ?? ""),
    // The whole header set, because `classifyWall` reads `www-authenticate`
    // and `location` and must not be limited to what this function anticipated.
    /*
     * The whole header set, lowercased, from either shape a response can carry
     * them in. `classifyWall` reads `www-authenticate` and `location`, and a
     * `fetchImpl` that hands back a plain object — every test fake, and some
     * polyfills — would otherwise silently lose both.
     */
    headers: normalizeHeaders(response?.headers),
  }
}

/**
 * One URL fetched, with sign-in walls detected and, where possible, walked
 * through.
 *
 * `redirect: "manual"` on purpose. The default would follow the 302 to the
 * login service and hand back a 200 with no trace of the hop, which is the
 * shape this module cannot afford to be handed. So redirects are followed here
 * instead — an http-to-https hop and a trailing-slash hop are ordinary and must
 * keep working — and the chain stops the moment a hop points at a login page.
 *
 * `sso` is what the probe chain reads: it separates "this host refused us" from
 * "there is nothing at that path", and only the first is worth abandoning the
 * whole chain over. `viaHelper` records that the answer came back through the
 * project's configured helper command rather than through `fetch`, which is a
 * fact worth having when a response looks different from a browser's.
 */
export async function fetchLibraryUrl(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    runHelper = runFetchCommand,
    fetchCommand = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    /*
     * A credential for this URL's origin, when the designer has signed this
     * editor in to it. Sent on the FIRST request rather than after a refusal:
     * a wall costs a round trip to discover and the answer is already known
     * here, so re-learning it per probe would multiply the slowest path in the
     * module by the number of probes.
     */
    credential = null,
  } = options
  const authHeaders = credentialHeaders(credential)
  // The origin the credential belongs to. Empty when there is none, which can
  // never equal a real origin, so the guard below simply sends nothing.
  const credentialOrigin = credential ? originOf(credential.origin ?? url) : ""

  let target = String(url)
  let record = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response
    try {
      response = await fetchImpl(target, {
        redirect: "manual",
        /*
         * The credential goes ONLY to the origin it was stored for.
         *
         * A redirect can point anywhere, including at a host the designer has
         * never heard of, and a bearer token forwarded across that hop is a
         * token handed to a third party. Browsers strip `Authorization` on a
         * cross-origin redirect for exactly this reason and `fetch` cannot do
         * it for us here, because following redirects by hand is what the
         * `manual` mode above exists for — so the check is ours to make.
         *
         * Recomputed per hop rather than once, since a chain can leave the
         * origin and come back.
         */
        headers: { accept: ACCEPT, ...(originOf(target) === credentialOrigin ? authHeaders : {}) },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      return failed(error, target)
    }

    record = await readResponse(response)
    if (looksLikeSsoWall(record, target)) break
    if (record.status >= 300 && record.status < 400 && record.location) {
      try {
        target = new URL(record.location, target).toString()
      } catch {
        break
      }
      continue
    }

    const ok = record.status >= 200 && record.status < 300
    return {
      ok,
      status: record.status,
      contentType: record.contentType,
      text: record.text,
      viaHelper: false,
      sso: false,
      error: ok ? "" : `${target} answered HTTP ${record.status}`,
    }
  }

  /*
   * `target`, not nothing — and the omission here was a real bug.
   *
   * Every cross-origin rule in `classifyWall` needs the request URL to compare
   * the redirect against, so testing without it read every OAuth bounce and
   * every sign-in handoff as "not a wall". The loop above breaks on a wall and
   * this then denied there was one, so the caller got `sso: false` and the
   * store installed the login page instead of refusing it.
   */
  if (!record || !looksLikeSsoWall(record, target)) {
    return {
      ok: false,
      status: record?.status ?? 0,
      contentType: record?.contentType ?? "",
      text: record?.text ?? "",
      viaHelper: false,
      sso: false,
      error: `${url} redirected more times than this editor will follow`,
    }
  }

  const rescued = await runHelper(String(url), { timeoutMs, fetchCommand })
  if (
    isPlainObject(rescued) &&
    Number(rescued.status) >= 200 &&
    Number(rescued.status) < 300 &&
    !looksLikeSsoWall(rescued, url)
  ) {
    return {
      ok: true,
      status: Number(rescued.status),
      contentType: String(rescued.contentType ?? ""),
      text: typeof rescued.text === "string" ? rescued.text : "",
      viaHelper: true,
      sso: false,
      error: "",
    }
  }

  /*
   * The refusal, read rather than merely reported.
   *
   * `sso: true` is the flag the probe chain has always branched on. `wall` is
   * the new half: which kind of sign-in this is, and — for OAuth — the
   * client id pulled out of the redirect, which is the audience an identity
   * token has to be minted for. Nothing else in the exchange names it, so a
   * refusal that throws it away leaves the designer needing a string they have
   * no way to look up.
   */
  return {
    ok: false,
    status: record.status,
    contentType: record.contentType,
    text: "",
    viaHelper: false,
    sso: true,
    wall: classifyWall(record, url),
    error: SSO_SENTENCE,
  }
}

/* ------------------------------------------------------------------------- */
/* The whole job                                                              */
/* ------------------------------------------------------------------------- */

/** "38 components · 210 variants" — what the row says before anyone expands it. */
function describeComponents(components) {
  const variants = components.reduce(
    (total, component) => total + (component.props?.[0]?.values?.length ?? 0),
    0
  )
  const parts = [`${components.length} ${components.length === 1 ? "component" : "components"}`]
  if (variants > 0) parts.push(`${variants} ${variants === 1 ? "variant" : "variants"}`)
  return parts.join(" · ")
}

/**
 * JSON that is not a story index, read by the parsers the file path already
 * uses.
 *
 * Reused rather than reimplemented, and the reuse is the point: a DTCG file
 * served over HTTP and the same file on disk have to produce the same catalog,
 * or a designer who switches from one to the other silently loses tokens.
 */
function catalogFromTokenText(url, text, name) {
  const kind = detectLibraryKind(url, text)
  // `css` cannot appear (this branch only sees JSON) and `components` is a
  // directory scan; neither is reachable from a URL.
  if (!kind || kind === "css" || kind === "components") return null
  let catalog
  try {
    catalog = parseLibrary(kind, text, { name })
  } catch {
    return null
  }
  const counts = libraryCounts(catalog)
  if (Object.values(counts).every((value) => value === 0)) return null
  return { catalog, detail: describeLibrary(kind, catalog) }
}

/**
 * Everything at a URL, as a catalog — or as a sentence explaining why not.
 *
 * Three probes in decreasing order of how much they know: a story index
 * describes a whole system, a token file describes a whole scale, and a page
 * describes one component. The first that yields anything wins, because a
 * system that publishes a story index has already answered the question better
 * than its HTML ever will.
 *
 * A FAILURE IS RETURNED, NEVER THROWN. `add` installs the row anyway, with the
 * sentence on it — the same rule `libraries.mjs` applies to a file that has
 * gone missing, and for the same reason: the row carries the only control that
 * can remove the library, so refusing to create it leaves a designer with a
 * failure and nothing to click.
 */
export async function parseUrlLibrary(url, options = {}) {
  const name = libraryNameFromUrl(url)
  if (!isLibraryUrl(url)) {
    return {
      name,
      catalog: emptyCatalog(name),
      detail: "",
      error: "A library URL has to start with http:// or https://",
    }
  }

  const probeOptions = {
    ...options,
    timeoutMs: Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, PROBE_TIMEOUT_MS),
  }

  /*
   * Every probe, and the page, go out AT ONCE — and the answers are then read
   * strictly in probe order.
   *
   * The two halves of that matter for different reasons. Concurrency is a
   * latency fix with a measurement behind it: run sequentially against a real
   * documentation site behind corp sign-in, where every request is refused and
   * re-issued through a helper command, the chain took sixteen seconds — and sixteen
   * seconds is not a button press. In parallel it is one round trip.
   *
   * Reading them in order is what keeps "best first" meaning anything. Whoever
   * answers first is a fact about the network; whoever is EARLIEST IN THE LIST
   * is the guess this module actually made, and a story index under the pasted
   * URL's own sub-path must win over one at the origin however the timings fell.
   */
  const probes = catalogProbes(url)
  const [responses, page] = await Promise.all([
    Promise.all(probes.map((probe) => fetchLibraryUrl(probe, probeOptions))),
    fetchLibraryUrl(url, options),
  ])

  let wall = false
  // The first classified refusal wins. Every probe is the same host, so they
  // all hit the same wall; keeping the first means the audience reported is the
  // one belonging to the URL the designer actually pasted.
  let challenge = null
  for (let index = 0; index < probes.length; index += 1) {
    const response = responses[index]
    if (response.sso) {
      wall = true
      challenge ??= response.wall ?? null
      continue
    }
    if (!response.ok || !response.text.trim()) continue

    let json
    try {
      json = JSON.parse(response.text)
    } catch {
      // A probe that answered with HTML is a site serving its app shell for
      // every path. It is not a catalog, and it is not an error either.
      continue
    }

    const parsed = parseStorybookIndex(json)
    if (parsed && parsed.components.length) {
      return {
        name,
        catalog: { ...emptyCatalog(name), components: parsed.components },
        detail: describeComponents(parsed.components),
        error: "",
      }
    }

    const tokens = catalogFromTokenText(probes[index], response.text, name)
    if (tokens) return { name, catalog: tokens.catalog, detail: tokens.detail, error: "" }
  }

  if (page.sso) {
    wall = true
    // The page's own reading is preferred over a probe's: the probes are paths
    // this module guessed at, and a 404 behind the wall can classify
    // differently from the document the designer named.
    challenge = page.wall ?? challenge
  }
  if (page.ok) {
    const component = componentFromPage(url, page.text)
    if (component) {
      return {
        name,
        catalog: { ...emptyCatalog(name), components: [component] },
        detail: describeComponents([component]),
        error: "",
      }
    }
  }

  // Three different failures, and a designer can act on each of them only if
  // they are told apart: signed out, unreachable, or reachable and empty.
  /*
   * `auth` is what separates "signed out" from the other two failures for a
   * CALLER, where `error` only separates them for a reader.
   *
   * It matters because the two are acted on differently: an unreachable or
   * empty URL is a row the designer can retry or remove, and a walled one is
   * not a library at all until somebody signs in. `libraries.mjs` refuses to
   * install the second kind, and it can only do that if the distinction
   * survives the trip out of here as data rather than as a sentence.
   */
  return {
    name,
    catalog: emptyCatalog(name),
    detail: "",
    /*
     * A classified challenge, or the weakest honest one.
     *
     * The fallback is only reached when a probe reported a wall and the reading
     * of it was lost — so it claims the least: a sign-in redirect, this origin,
     * and nothing it cannot back up. It deliberately does NOT invent an
     * audience or a realm, because the panel offers a copy button for each and
     * a button that copies an empty string is worse than an absent row.
     */
    auth: wall
      ? challenge ?? { kind: "redirect", origin: originOf(url), audience: "", realm: "", hint: "" }
      : null,
    error: wall
      ? SSO_SENTENCE
      : page.ok || !page.error
        ? NOTHING_SENTENCE
        : `${page.error}. ${CHECK_SENTENCE}`,
  }
}
