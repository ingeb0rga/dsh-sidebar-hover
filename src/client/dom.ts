/**
 * DOM anchors and hover-zone geometry for the sidebar.
 *
 * Everything here reads the *published* rc.2 DOM contract (see FINDINGS.md §6):
 * the AppFrame carries `data-sidebar-collapsed` / `data-rightbar-collapsed`,
 * the darwin reopen seat is `[data-shell-leading]`, and CSS-module class
 * tokens end in `_<local>` (`_6Qf49G_frame`, `_3WPZCG_root`). Tokens are
 * matched by suffix so the hash prefix never matters; if an anchor ever
 * disappears the controller fails dormant with a single warning.
 */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Web rail width when collapsed (darwin/windows-titlebar collapse to 0). */
export const WEB_RAIL_WIDTH = 56
/**
 * Feature cutoff relative to the screen, not in pixels: a window narrower than
 * this share of its screen's usable width (e.g. tiled into a thin strip) gets
 * no hover reveal. Resolution- and display-independent.
 */
export const MIN_WINDOW_SCREEN_RATIO = 1 / 3

const FRAME_TOKEN = /(?:^|\s)_?[A-Za-z0-9]+_frame$/
const SIDEBAR_COL_TOKEN = /(?:^|\s)_?[A-Za-z0-9]+_sidebarCol$/
const ROOT_TOKEN = /(?:^|\s)_?[A-Za-z0-9]+_root$/
const TOGGLE_TOKEN = /(?:^|\s)_?[A-Za-z0-9]+_toggle$/

export function isDarwinPlatform(): boolean {
  return document.documentElement.getAttribute('data-platform') === 'darwin'
}

export function isWindowsTitlebar(): boolean {
  return document.documentElement.hasAttribute('data-windows-titlebar')
}

/** Window wide enough for hover reveal (≥ 1/3 of the current screen). */
export function isViewportWide(): boolean {
  const screenWidth = window.screen?.availWidth ?? 0
  // No usable screen metrics (headless/odd embeds): don't block the feature.
  if (!(screenWidth > 0)) return true
  return window.innerWidth >= screenWidth * MIN_WINDOW_SCREEN_RATIO
}

/** Locate the AppFrame element (grid frame owning the sidebar column). */
export function findFrame(): HTMLElement | null {
  const byAttr = document.querySelector<HTMLElement>('[data-sidebar-collapsed]')
  if (byAttr && matchesToken(byAttr, FRAME_TOKEN)) return byAttr
  const candidates = document.querySelectorAll<HTMLElement>('div[class*="frame"]')
  for (const el of candidates) {
    if (matchesToken(el, FRAME_TOKEN)) return el
  }
  return null
}

function matchesToken(el: Element, token: RegExp): boolean {
  for (const cls of el.classList) {
    if (token.test(` ${cls}`)) return true
  }
  return false
}

/** The layout column that hosts the sidebar slot (first grid child of the frame). */
export function findSidebarCol(frame: HTMLElement): HTMLElement | null {
  for (const el of frame.children) {
    if (el instanceof HTMLElement && matchesToken(el, SIDEBAR_COL_TOKEN)) return el
  }
  const first = frame.firstElementChild
  return first instanceof HTMLElement ? first : null
}

/** The rendered sidebar root inside the column (sidebar-scope listener target). */
export function findSidebarRoot(col: HTMLElement): HTMLElement | null {
  const candidates = col.querySelectorAll<HTMLElement>('div[class]')
  for (const el of candidates) {
    if (matchesToken(el, ROOT_TOKEN)) {
      const collapsed = el.className.includes('_collapsed') || [...el.classList].some((c) => c.endsWith('_collapsed'))
      const hasDragStrip = el.querySelector('[data-window-drag]') !== null
      if (collapsed || hasDragStrip) return el
    }
  }
  return null
}

/** The sidebar's own collapse/expand toggle button (SidebarRoot `toggle`). */
export function isSidebarToggle(node: EventTarget): boolean {
  return node instanceof HTMLButtonElement && matchesToken(node, TOGGLE_TOKEN)
}

export function elementRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

export function rectContains(rect: Rect, x: number, y: number, slop = 0): boolean {
  return (
    x >= rect.left - slop && x <= rect.right + slop && y >= rect.top - slop && y <= rect.bottom + slop
  )
}

/**
 * Reopen/hover zones for the CURRENT sidebar state.
 *  - expanded: the sidebar column, or the wider sidebar root when it
 *    overlays the content (overlay peek keeps the column collapsed).
 *  - collapsed + web rail: a thin strip along the frame's left edge.
 *  - collapsed + darwin: the sidebar toggle in the leading seat(s)
 *    (`[data-shell-leading]`, first button) — only the toggle, as in Claude
 *    Code: New Session and the history arrows next to it must not peek. ALL
 *    seats are read, because plugins may mount their own seat next to the
 *    stock one; when fullscreen the shell repositions it and we simply read
 *    the live rects. A seat without a button counts as a whole.
 *  - collapsed + windows titlebar (0-width rail): no zone — Mod+B only,
 *    matching the upstream contract.
 */
export function readZones(
  frame: HTMLElement,
  col: HTMLElement | null,
  root: HTMLElement | null = null,
): { zones: Rect[]; expanded: boolean } {
  const expanded = !frame.hasAttribute('data-sidebar-collapsed')
  if (expanded) {
    const zones = [elementRect(col ?? frame)]
    if (root) zones.push(elementRect(root))
    return { zones, expanded }
  }
  if (isDarwinPlatform()) {
    const zones: Rect[] = []
    for (const seat of document.querySelectorAll<HTMLElement>('[data-shell-leading]')) {
      zones.push(elementRect(seat.querySelector<HTMLElement>('button') ?? seat))
    }
    // Seat(s) not mounted (e.g. mid-transition): no reopen zone this tick.
    return { zones, expanded }
  }
  if (isWindowsTitlebar()) return { zones: [], expanded }
  const frameRect = elementRect(frame)
  return {
    zones: [
      {
        left: frameRect.left,
        top: frameRect.top,
        right: frameRect.left + WEB_RAIL_WIDTH,
        bottom: frameRect.bottom,
      },
    ],
    expanded,
  }
}
