/**
 * Prefs mirror over the plugin's own `/sidebar-hover/api` route: reads the
 * plugin's settings namespace through the node half (which calls the host
 * `settings` service in-process) and writes via the same round-trip. The
 * renderer's `ctx.remote.settings` is NOT used: on the desktop deployment it
 * answers an empty namespace list, which left the settings switch
 * permanently unavailable (fixed in 0.1.3). Persistence itself stays the host
 * settings mechanism (volatile fields in the profile patch layer) — the
 * snapshot store below is baseline `dsh-client-store`, an in-memory cache,
 * not a persistence layer.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Context } from '@deepseek-ai/cordis'
import {
  coerceHoverDelayMs,
  PREFS_DEFAULTS,
  PREFS_NAMESPACE,
  type SidebarHoverPrefs,
} from '../shared/prefs.ts'

export type PrefsStatus = 'pending' | 'ready' | 'unavailable'

export interface PrefsSnapshot extends SidebarHoverPrefs {
  readonly status: PrefsStatus
  /** Human-readable reason when not ready (shown in the settings row). */
  readonly detail?: string
}

/** {value, revision}; both undefined when the namespace is not configurable. */
interface PrefsView {
  readonly value?: unknown
  readonly revision?: number | undefined
}

type Envelope<T> = { ok: true; value: T } | { ok: false; error?: { code?: string; message?: string } }

export interface PrefsController {
  readonly store: ReturnType<typeof createSnapshotStore<PrefsSnapshot>>
  setPrefs(patch: Partial<SidebarHoverPrefs>): Promise<void>
  dispose(): void
}

/** One JSON POST to the plugin route, envelope-unwrapped. */
async function call<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/sidebar-hover/api/${encodeURIComponent(method)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
  const parsed = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!response.ok || parsed === null || parsed.ok !== true) {
    const message = parsed !== null && parsed.ok === false ? parsed.error?.message : undefined
    if (message !== undefined) throw new Error(message)
    // An unshaped answer (plain 404/405 from the SPA fallback) means the node
    // half serving this request predates the route — the app caches plugin
    // code per process, so an update needs a full restart to take effect.
    throw new Error(`HTTP ${response.status} — plugin route not served; fully restart the app`)
  }
  return parsed.value
}

export function createPrefsController(ctx: Context): PrefsController {
  const events = ctx as unknown as {
    remote?: { $on?(event: string, fn: (...args: unknown[]) => void): () => void }
    on(event: string, fn: (...args: unknown[]) => void): () => void
  }
  const store = createSnapshotStore<PrefsSnapshot>({
    status: 'pending',
    ...PREFS_DEFAULTS,
  })
  let revision: number | undefined
  let disposed = false
  let warned = false
  /** Backoff retry: the entry's settings row may not be describable yet at
   * apply time, and nothing else emits an invalidation when it activates. */
  let retryTimer: number | null = null
  let retryDelayMs = 500
  const RETRY_MAX_MS = 5000

  function scheduleRetry(): void {
    if (disposed || retryTimer !== null) return
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS)
      void reload()
    }, retryDelayMs)
  }

  function clearRetry(): void {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function adopt(view: PrefsView): void {
    if (view.value === null || typeof view.value !== 'object') {
      if (!warned) {
        warned = true
        console.warn(
          `[dsh-sidebar-hover] settings namespace "${PREFS_NAMESPACE}" is not configurable on this host; ` +
            'is the node half mounted with its volatile Config? Feature stays off.',
        )
      }
      store.set({
        status: 'unavailable',
        detail: 'entry not configurable — retrying',
        ...PREFS_DEFAULTS,
      })
      scheduleRetry()
      return
    }
    clearRetry()
    revision = view.revision
    const value = view.value as Record<string, unknown>
    store.set({
      status: 'ready',
      enabled: value.enabled !== false,
      hoverDelayMs: coerceHoverDelayMs(value.hoverDelayMs),
      historyArrows: value.historyArrows !== false,
    })
  }

  async function reload(): Promise<void> {
    if (disposed) return
    try {
      adopt(await call<PrefsView>('prefs.get'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!disposed) console.warn('[dsh-sidebar-hover] prefs.get failed:', error)
      if (!disposed) {
        store.set({ status: 'unavailable', detail: `prefs.get failed: ${message}`, ...PREFS_DEFAULTS })
        scheduleRetry()
      }
    }
  }

  async function setPrefs(patch: Partial<SidebarHoverPrefs>): Promise<void> {
    if (disposed || store.getSnapshot().status === 'unavailable') return
    const body: Record<string, unknown> = {}
    if (patch.enabled !== undefined) body.enabled = patch.enabled
    if (patch.hoverDelayMs !== undefined) body.hoverDelayMs = coerceHoverDelayMs(patch.hoverDelayMs)
    if (patch.historyArrows !== undefined) body.historyArrows = patch.historyArrows
    if (Object.keys(body).length === 0) return
    try {
      const view = await call<PrefsView>('prefs.update', { patch: body, expectedRevision: revision })
      // Adopt the echoed view immediately so repeated clicks do not race the
      // revision; a host-side invalidation reload confirms later.
      adopt(view)
    } catch (error) {
      // Stale revision or refused write: re-read once and surface the reason.
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[dsh-sidebar-hover] prefs.update failed:', error)
      store.set({ ...store.getSnapshot(), detail: `update failed: ${message}` })
      await reload()
    }
  }

  const offDocument = events.remote?.$on?.('settings/document-updated', () => {
    void reload()
  })
  const offReset = events.on('connection/reset', () => {
    void reload()
  })

  void reload()

  return {
    store,
    setPrefs,
    dispose() {
      disposed = true
      clearRetry()
      offDocument?.()
      offReset()
    },
  }
}
