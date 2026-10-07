/**
 * Session history navigator: Claude Code's back/forward titlebar arrows.
 *
 * DSH has no navigation history of its own (no URL routing, no pushState), so
 * the plugin keeps one: every main-view selection published by
 * `uiWorkspace.selection` (the persisted `dsh.sessions.current` store) is fed
 * to a {@link SessionHistory}; the arrows and Cmd+[ / Cmd+] step through it via
 * `uiWorkspace.openSession()` — the same call the sidebar rows make.
 *
 * Placement (darwin): the arrows sit right of the sidebar toggle at the
 * leading seat's offset, in every sidebar state. Collapsed, the seat's
 * New Session button and the content's leading clearance move right to make
 * room. The arrows component marks its own frame (`data-dsh-arrows-on`) while
 * mounted; the stylesheet keys on that attribute (an earlier `:has()` match
 * did not apply in the app).
 */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { entryOf, SessionHistory, type HistoryState } from './history.ts'
import type { PrefsController } from './prefs-store.ts'

export const ARROWS_ATTR = 'data-dsh-history-arrows'
/** Set on the AppFrame by the mounted arrows component. */
export const ARROWS_FRAME_ATTR = 'data-dsh-arrows-on'
const STYLE_ID = 'dsh-sidebar-hover-arrows'

/** Seat geometry (layout rc.2): left 88 / fullscreen 12, top 11, 28 px buttons, 8 px gaps. */
const ARROWS_CSS = (() => {
  const frame = `[${ARROWS_FRAME_ATTR}]`
  const darwin = 'html[data-platform=darwin]'
  // back 28 + 4 gap + forward 28 + 8 gap before New Session
  const shift = 68
  return `
${darwin} [${ARROWS_ATTR}] {
  position: absolute; top: 11px; left: 124px; z-index: 16;
  display: flex; align-items: center; gap: 4px;
  pointer-events: auto; -webkit-app-region: no-drag;
}
${darwin}[data-fullscreen] [${ARROWS_ATTR}] { left: 48px; }
[${ARROWS_ATTR}] > button {
  width: 28px; height: 28px; padding: 0; border: none; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--dsw-radius-sm); background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary); -webkit-app-region: no-drag;
}
[${ARROWS_ATTR}] > button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
[${ARROWS_ATTR}] > button:disabled { opacity: 0.35; cursor: default; }
[${ARROWS_ATTR}] > button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
/* New Session = second BUTTON (Tooltip renders its bubble as a sibling span). */
${darwin} ${frame} > [data-shell-leading] button:nth-of-type(2) { margin-left: ${shift}px !important; }
${darwin} ${frame}[data-sidebar-collapsed],
${darwin} ${frame}[data-dsh-hover-peek] { --dsh-frame-leading-clearance: ${160 + shift}px !important; }
${darwin}[data-fullscreen] ${frame}[data-sidebar-collapsed],
${darwin}[data-fullscreen] ${frame}[data-dsh-hover-peek] { --dsh-frame-leading-clearance: ${84 + shift}px !important; }
${darwin}:not([data-fullscreen]) ${frame} [class*="_topStrip"] { justify-content: flex-start; padding-left: 88px; }
`
})()

interface SelectionStore {
  getSnapshot(): { sessionId?: unknown; subagentAddress?: unknown }
  subscribe(listener: () => void): () => void
}

interface WorkspaceFace {
  readonly selection?: SelectionStore
  openSession?(target: unknown): void
}

interface ShortcutsFace {
  register(definition: Record<string, unknown>): () => void
}

export interface HistoryNavigator {
  readonly store: ReturnType<typeof createSnapshotStore<HistoryState>>
  back(): void
  forward(): void
  dispose(): void
}

export function installHistoryNavigator(ctx: Context, prefs: PrefsController): HistoryNavigator {
  const history = new SessionHistory()
  const store = createSnapshotStore<HistoryState>(history.state)
  let workspace: WorkspaceFace | null = null

  function publish(): void {
    const next = history.state
    const prev = store.getSnapshot()
    if (prev.canBack !== next.canBack || prev.canForward !== next.canForward) store.set(next)
  }

  function go(direction: -1 | 1): boolean {
    const open = workspace?.openSession
    if (!workspace || typeof open !== 'function') return false
    for (;;) {
      const entry = history.step(direction)
      if (entry === null) {
        publish()
        return false
      }
      try {
        open.call(workspace, entry.target)
        return true
      } catch (error) {
        // Deleted/unknown session: forget it and keep stepping.
        console.warn('[dsh-sidebar-hover] history entry no longer opens; dropped:', error)
        history.drop(entry)
      }
    }
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = ARROWS_CSS
  document.getElementById(STYLE_ID)?.remove()
  document.head.appendChild(style)

  ctx.inject(['uiWorkspace'], (wctx: Context) => {
    const face = wctx.get<WorkspaceFace>('uiWorkspace')
    const selection = face?.selection
    if (!face || !selection || typeof selection.subscribe !== 'function') {
      console.warn('[dsh-sidebar-hover] uiWorkspace.selection not available; history arrows stay inert')
      return
    }
    workspace = face
    const feed = (): void => {
      history.observe(entryOf(selection.getSnapshot()))
      publish()
    }
    feed()
    wctx.effect(() => {
      const off = selection.subscribe(feed)
      return () => {
        off()
        workspace = null
      }
    }, 'dsh-sidebar-hover: session history feed')
  })

  const shortcut = (id: string, label: string, code: string, direction: -1 | 1) => ({
    id,
    label: () => label,
    aliases: [label.toLowerCase()],
    defaults: {
      'desktop:macos': { code, modifiers: ['primary'] },
      'desktop:windows': { code, modifiers: ['primary'] },
      'desktop:linux': { code, modifiers: ['primary'] },
    },
    regions: ['page', 'editable'],
    modals: [],
    resolve: () => {
      const state = history.state
      const possible = direction < 0 ? state.canBack : state.canForward
      if (!prefs.store.getSnapshot().historyArrows || !possible || workspace === null) return { status: 'pass' }
      return { status: 'handled', run: () => void go(direction) }
    },
  })

  ctx.inject(['shortcuts'], (sctx: Context) => {
    const shortcuts = sctx.get<ShortcutsFace>('shortcuts')
    if (!shortcuts || typeof shortcuts.register !== 'function') return
    sctx.effect(
      () => shortcuts.register(shortcut('session.history.back', 'Go back', 'BracketLeft', -1)),
      'dsh-sidebar-hover: history back shortcut',
    )
    sctx.effect(
      () => shortcuts.register(shortcut('session.history.forward', 'Go forward', 'BracketRight', 1)),
      'dsh-sidebar-hover: history forward shortcut',
    )
  })

  return {
    store,
    back: () => void go(-1),
    forward: () => void go(1),
    dispose() {
      workspace = null
      style.remove()
    },
  }
}
