/**
 * Overlay peek: while a hover peek is open the sidebar floats OVER the
 * content instead of pushing it (Claude Code style).
 *
 * The layout store still really expands (that is what makes the sidebar
 * render its wide content), but the frame's grid is pinned to the tracks it
 * had while collapsed, so the center/right columns never move. The sidebar
 * column keeps its collapsed width (0 on darwin, 56 px rail on web) and the
 * wide sidebar root overflows it on top of the content.
 *
 * Everything is attribute + stylesheet driven, so React re-renders never
 * fight it: our attributes are not React props, and the grid override is a
 * `!important` stylesheet rule on a CSS variable we keep in sync.
 *
 * Mirrors the layout CSS keyed on `[data-sidebar-collapsed]` (darwin leading
 * clearance, center border) so the content area renders exactly as collapsed.
 *
 * Window drag regions: Electron builds the `-webkit-app-region` map in DOM
 * order and ignores stacking. The center/right columns come after the
 * sidebar, so their `[data-window-drag]` titlebar strips would override the
 * overlaid sidebar's no-drag controls (its toggle became unclickable: clicks
 * turned into window drags). While overlaying, those strips are no-drag.
 *
 * Toggle position (darwin): collapsed, the reopen toggle sits in the
 * leading seat next to the traffic lights (`left: 88px; top: 11px`); the
 * expanded sidebar right-aligns it in its top strip, so the icon jumped
 * across on every peek. While the feature is on, the top strip left-aligns
 * at the seat's offset — the icon stays put in every state (Claude Code).
 */

const PEEK_ATTR = 'data-dsh-hover-peek'
const SETTLING_ATTR = 'data-dsh-hover-settling'
const COL_ATTR = 'data-dsh-hover-col'
const ROOT_ATTR = 'data-dsh-hover-root'
const ENABLED_ATTR = 'data-dsh-hover-on'
const COLS_VAR = '--dsh-hover-peek-cols'
const STYLE_ID = 'dsh-sidebar-hover-overlay'
/** Pin hand-off: the grid animates from the overlay tracks to the pushed layout. */
const SETTLE_MS = 400

const CSS = `
[${PEEK_ATTR}] { grid-template-columns: var(${COLS_VAR}) !important; }
[${PEEK_ATTR}] > [${COL_ATTR}] { overflow: visible; position: relative; z-index: 12; }
[${PEEK_ATTR}] [${ROOT_ATTR}] {
  position: relative;
  background: var(--dsw-specific-sidebar-fill) !important;
  box-shadow: 0 0 24px rgb(0 0 0 / 18%), 0.5px 0 0 var(--dsw-alias-border-l3);
  animation: dsh-hover-peek-in var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
[${PEEK_ATTR}] > [data-side="sidebar"] { display: none; }
[${PEEK_ATTR}] > :not([${COL_ATTR}]) [data-window-drag] { -webkit-app-region: no-drag !important; }
[data-platform=darwin] [${PEEK_ATTR}] { --dsh-frame-leading-clearance: 160px; }
[data-platform=darwin][data-fullscreen] [${PEEK_ATTR}] { --dsh-frame-leading-clearance: 84px; }
[data-platform=darwin] [${PEEK_ATTR}] > [class*="_centerCol"] { border-left: none; }
[${SETTLING_ATTR}] {
  transition: grid-template-columns var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease) !important;
}
html[data-platform=darwin]:not([data-fullscreen]) [${ENABLED_ATTR}] [class*="_topStrip"] {
  justify-content: flex-start;
  padding-left: 88px;
}
@keyframes dsh-hover-peek-in {
  from { transform: translateX(-16px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  [${PEEK_ATTR}] [${ROOT_ATTR}] { animation: none; }
  [${SETTLING_ATTR}] { transition: none !important; }
}
`

export interface OverlayPeek {
  /** Freeze the current (collapsed) grid and enter overlay mode. Call BEFORE expanding. */
  begin(frame: HTMLElement, col: HTMLElement | null, root: HTMLElement | null): void
  /** Re-tag a remounted sidebar root while overlaying. */
  retarget(col: HTMLElement | null, root: HTMLElement | null): void
  /** The right panel changed under an open overlay: re-freeze its tracks. */
  refresh(): void
  /** Leave overlay mode instantly (the sidebar collapsed underneath). */
  end(): void
  /** Leave overlay mode animating into the pushed layout (peek became pinned). */
  settle(): void
  /** Mark the frame while the feature is live (keeps the toggle at the seat). */
  setEnabled(frame: HTMLElement | null, on: boolean): void
  readonly active: boolean
  dispose(): void
}

/** Grid track list → [first track, rest] (first track = the sidebar column). */
function splitFirstTrack(cols: string): [string, string] {
  const trimmed = cols.trim()
  const match = /^(\S+)\s+(.*)$/.exec(trimmed)
  return match ? [match[1] ?? '', match[2] ?? ''] : [trimmed, '']
}

export function createOverlayPeek(): OverlayPeek {
  let frame: HTMLElement | null = null
  let col: HTMLElement | null = null
  let root: HTMLElement | null = null
  /** Collapsed sidebar track captured at begin (0px darwin, 56px web rail). */
  let collapsedTrack = '0px'
  let settleTimer = 0
  let enabledFrame: HTMLElement | null = null

  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  function tag(nextCol: HTMLElement | null, nextRoot: HTMLElement | null): void {
    if (col !== nextCol) {
      col?.removeAttribute(COL_ATTR)
      col = nextCol
    }
    if (root !== nextRoot) {
      root?.removeAttribute(ROOT_ATTR)
      root = nextRoot
    }
    col?.setAttribute(COL_ATTR, '')
    root?.setAttribute(ROOT_ATTR, '')
  }

  function untag(): void {
    col?.removeAttribute(COL_ATTR)
    root?.removeAttribute(ROOT_ATTR)
    col = null
    root = null
  }

  function clearSettle(): void {
    if (settleTimer) {
      window.clearTimeout(settleTimer)
      settleTimer = 0
    }
    frame?.removeAttribute(SETTLING_ATTR)
  }

  const api: OverlayPeek = {
    get active() {
      return frame !== null && frame.hasAttribute(PEEK_ATTR)
    },

    begin(nextFrame, nextCol, nextRoot) {
      ensureStyle()
      clearSettle()
      frame = nextFrame
      const [first, rest] = splitFirstTrack(frame.style.gridTemplateColumns)
      collapsedTrack = first || '0px'
      frame.style.setProperty(COLS_VAR, rest ? `${collapsedTrack} ${rest}` : collapsedTrack)
      frame.setAttribute(PEEK_ATTR, '')
      tag(nextCol, nextRoot)
    },

    retarget(nextCol, nextRoot) {
      if (!api.active) return
      tag(nextCol, nextRoot)
    },

    refresh() {
      if (!frame || !api.active) return
      const [, rest] = splitFirstTrack(frame.style.gridTemplateColumns)
      frame.style.setProperty(COLS_VAR, rest ? `${collapsedTrack} ${rest}` : collapsedTrack)
    },

    end() {
      clearSettle()
      if (frame) {
        frame.removeAttribute(PEEK_ATTR)
        frame.style.removeProperty(COLS_VAR)
      }
      untag()
    },

    settle() {
      if (!frame || !api.active) return
      const settling = frame
      api.end()
      // Same task as the overlay removal, so the grid change below is
      // computed with the transition already in place.
      settling.setAttribute(SETTLING_ATTR, '')
      settleTimer = window.setTimeout(() => {
        settleTimer = 0
        settling.removeAttribute(SETTLING_ATTR)
      }, SETTLE_MS)
    },

    setEnabled(nextFrame, on) {
      const target = on ? nextFrame : null
      if (enabledFrame !== target) {
        enabledFrame?.removeAttribute(ENABLED_ATTR)
        enabledFrame = target
      }
      if (enabledFrame) {
        ensureStyle()
        enabledFrame.setAttribute(ENABLED_ATTR, '')
      }
    },

    dispose() {
      api.setEnabled(null, false)
      api.end()
      document.getElementById(STYLE_ID)?.remove()
      frame = null
    },
  }
  return api
}
