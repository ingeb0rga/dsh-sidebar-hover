/**
 * Node half of dsh-sidebar-hover.
 *
 * Declares the volatile `Config` fields (`enabled`, `hoverDelayMs`,
 * `historyArrows`) under the
 * entry namespace and serves the preference round-trip the client half needs.
 *
 * Why a plugin-owned HTTP route instead of `ctx.remote.settings`: on the
 * desktop deployment the renderer's `remote.settings.describe()` answers an
 * EMPTY namespace list (observed on 0.2.0-rc.2), so the client cannot reach
 * the settings service directly. dsh-better-sidebar solves the same problem
 * the same way: the client POSTs to a plugin prefix route, and the node half —
 * running inside the host process — calls the real `settings` service
 * (`describe`/`update`). Persistence stays the host settings mechanism (the
 * volatile values live in the profile patch layer); no new store, no
 * localStorage.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  HOVER_DELAY_DEFAULT_MS,
  HOVER_DELAY_MAX_MS,
  HOVER_DELAY_MIN_MS,
} from '../shared/prefs.ts'

export const name = 'dsh-sidebar-hover'

const PACKAGE_NAME = 'dsh-sidebar-hover'
const API_PREFIX = '/sidebar-hover/api'
/** Any honest prefs body is far below this; the cap just bounds a bad client. */
const MAX_BODY_BYTES = 64 * 1024

/** Every field must be `.volatile()` — only volatile paths accept live writes. */
export const Config = z
  .object({
    enabled: z.boolean().default(true).volatile().description('Hover-to-reveal sidebar (Settings → Sidebar hover).'),
    hoverDelayMs: z
      .number()
      // schemastery `.step(N)` validates "multiple of N" (not "offset by N"),
      // so the 50 ms UI granularity is enforced by the settings-page input and
      // `coerceHoverDelayMs` rounding — NOT here. `.step(1)` = any number.
      .step(1)
      .min(HOVER_DELAY_MIN_MS)
      .max(HOVER_DELAY_MAX_MS)
      .default(HOVER_DELAY_DEFAULT_MS)
      .volatile()
      .description('Hover intent delay before the sidebar peeks open (ms).'),
    historyArrows: z
      .boolean()
      .default(true)
      .volatile()
      .description('Back/forward session history arrows next to the sidebar toggle (Settings → Sidebar hover).'),
  })
  .description('Hover-to-reveal sidebar preferences (edited on the Settings → Sidebar hover page).')

// Cordis guards direct service-property access on ctx: every service the node
// half touches on the MAIN context must be declared here (`ctx.webServer`,
// `ctx.webRuntime`). `settings` is reached through a dynamic `ctx.inject`
// child context instead, exactly like dsh-better-sidebar does, so the
// settings service can come up later without blocking activation.
export const inject = ['webServer', 'webRuntime']

interface EntryLike {
  options?: { id?: unknown; name?: unknown }
  fiber?: unknown
  disabled?: unknown
}

/**
 * The loader row id this package is mounted under — also the settings
 * namespace. Prefers the row whose fiber is ours; falls back to the first
 * enabled same-name row (the moment before our fiber attaches).
 */
function ownEntryId(ctx: Context): string | undefined {
  let fallback: string | undefined
  try {
    const host = ctx as unknown as {
      loader?: { entries?: () => Iterable<EntryLike> }
      fiber?: unknown
    }
    for (const entry of host.loader?.entries?.() ?? []) {
      const id = entry.options?.id
      if (entry.options?.name !== PACKAGE_NAME || typeof id !== 'string' || id === '') continue
      if (entry.fiber === host.fiber) return id
      if (entry.disabled !== true && fallback === undefined) fallback = id
    }
  } catch {
    return undefined
  }
  return fallback
}

/** The host `dsh-settings` service face (only what this plugin uses). */
interface SettingsFace {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void
  describe(options?: { redactSecrets?: boolean }): Array<{
    ns: string
    value?: unknown
    revision?: number
  }>
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
}

/** The resolved {face, namespace} pair, once the settings service is up. */
interface PrefsRoute {
  face: SettingsFace
  ns: string
}

interface RegisterRequestLike {
  url?: string
  headers: Record<string, string | string[] | undefined>
  on(event: string, listener: (chunk?: Buffer) => void): unknown
}

interface RegisterResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

function singleHeader(headers: RegisterRequestLike['headers'], name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue
    return Array.isArray(value) ? value[0] : value
  }
  return undefined
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

/**
 * Whether one request may reach the plugin route: the Host must be loopback
 * or a trusted authority of this deployment, and browser markers must be
 * same-origin (no cross-site fetch). Same contract better-sidebar applies to
 * its /sidebar routes.
 */
function isTrustedApiRequest(request: RegisterRequestLike, trustedHosts: readonly string[]): boolean {
  const host = singleHeader(request.headers, 'host')
  if (host === undefined) return false
  const bracketEnd = host.indexOf(']')
  const separator = host.lastIndexOf(':')
  const rawHostname =
    bracketEnd !== -1 ? host.slice(1, bracketEnd) : separator === -1 ? host : host.slice(0, separator)
  const hostname = rawHostname.toLowerCase()
  if (!isLoopbackHostname(hostname)) {
    const authority = host.toLowerCase()
    if (!trustedHosts.some((candidate) => candidate.toLowerCase() === authority)) return false
  }
  if (singleHeader(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = singleHeader(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostname
  } catch {
    return false
  }
}

function readBody(request: RegisterRequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''))
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        return
      }
      chunks.push(buffer)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function sendJson(res: RegisterResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function errorOf(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const conflict = /settings\/conflict|revision/i.test(message)
  return { code: conflict ? 'settings/conflict' : 'settings/rejected', message }
}

/** Redacted view of one namespace: {value, revision} (both undefined when absent). */
function viewOf(face: SettingsFace, ns: string): { value: unknown; revision: number | undefined } {
  const view = face.describe({ redactSecrets: true }).find((row) => row.ns === ns)
  return view === undefined
    ? { value: undefined, revision: undefined }
    : { value: view.value, revision: view.revision }
}

/** POST /sidebar-hover/api[/<method>] body {method?, payload} → {ok,value}|{ok:false,error}. */
export async function handleApiRequest(
  resolve: () => PrefsRoute | undefined,
  req: RegisterRequestLike,
  res: RegisterResponseLike,
): Promise<void> {
  let payload: { method?: unknown; payload?: Record<string, unknown> }
  try {
    payload = JSON.parse((await readBody(req)) || '{}') as typeof payload
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'body is not JSON' } })
    return
  }
  // Method from the path suffix first (the dsh-better-sidebar shape), body
  // fallback for plain POSTs to the prefix itself.
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  const pathMethod = pathname.startsWith(`${API_PREFIX}/`)
    ? decodeURIComponent(pathname.slice(API_PREFIX.length + 1))
    : undefined
  const method = pathMethod ?? (typeof payload.method === 'string' ? payload.method : undefined)
  const route = resolve()
  if (route === undefined) {
    sendJson(res, 503, { ok: false, error: { code: 'unavailable', message: 'settings service is not mounted' } })
    return
  }
  try {
    if (method === 'prefs.get') {
      sendJson(res, 200, { ok: true, value: viewOf(route.face, route.ns) })
      return
    }
    if (method === 'prefs.update') {
      const body = (payload.payload ?? {}) as { patch?: unknown; expectedRevision?: unknown }
      const patch = body.patch
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
        sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'patch must be an object' } })
        return
      }
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
      await route.face.update(route.ns, patch as Record<string, unknown>, expectedRevision)
      sendJson(res, 200, { ok: true, value: viewOf(route.face, route.ns) })
      return
    }
    sendJson(res, 404, {
      ok: false,
      error: { code: 'not-found', message: `unknown method: ${String(method)}` },
    })
  } catch (error) {
    sendJson(res, 409, { ok: false, error: errorOf(error) })
  }
}

/** Register the settings presentation (no auto page) + the prefs API route. */
export function apply(ctx: Context): void {
  let route: PrefsRoute | undefined
  ctx.inject(['settings'], (sctx: Context) => {
    const settings = (sctx as unknown as { settings?: SettingsFace }).settings
    if (settings === undefined) return
    const ns = ownEntryId(ctx)
    if (ns === undefined) {
      ctx.logger?.warn?.('dsh-sidebar-hover: no loader row for this package; preferences stay at defaults')
      return
    }
    ctx.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      'dsh-sidebar-hover: suppress auto settings page',
    )
    route = { face: settings, ns }
  })

  const host = ctx as unknown as {
    webServer?: { register(options: { kind: string; path: string; handler: unknown }): () => void }
    webRuntime?: { trustedHosts?: readonly string[] }
  }
  const registerRoute = (): void => {
    if (host.webServer === undefined) {
      ctx.logger?.warn?.('dsh-sidebar-hover: webServer service absent; the settings page stays unavailable')
      return
    }
    const trustedHosts = host.webRuntime?.trustedHosts ?? []
    ctx.effect(
      () =>
        host.webServer?.register({
          kind: 'prefix',
          path: API_PREFIX,
          handler: async (req: RegisterRequestLike, res: RegisterResponseLike) => {
            if (!isTrustedApiRequest(req, trustedHosts)) {
              sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'untrusted request' } })
              return
            }
            await handleApiRequest(() => route, req, res)
          },
        }),
      'dsh-sidebar-hover: prefs api route',
    )
  }
  registerRoute()
}
