/**
 * DOM controller: binds the pure HoverRevealMachine to the live sidebar.
 *
 * Binding rules (from the task + FINDINGS.md):
 *  - pointer tracking is window-level pointermove + rect math (never element
 *    hover listeners — the darwin leading seat unmounts on expand and would
 *    flicker-loop);
 *  - our expand/collapse is a `ctx.layout.toggleSidebar()` PAIR, tagged so the
 *    resulting DOM flip is attributed to us; untagged flips are the user
 *    (Mod'B / toggle button) and go to the machine as external;
 *  - all listeners are bound once here; the machine's active gate implements
 *    the settings toggle and the window-width rule (≥ 1/3 of the screen,
 *    re-checked on resize and on pointer ticks — moving the window to another
 *    display changes the screen without a resize);
 *  - no aria-expanded on the sidebar container: it is not a disclosure
 *    control, and the attribute made every click look like a toggle click;
 *  - activation clicks are read on `document` in the bubble phase, AFTER
 *    React (which dispatches at its root container) — so row controls that
 *    stopPropagation (session "..." menu, row actions) never select-collapse;
 *  - open menus/dialogs (portaled to <body>) hold the peek;
 *  - a peek is an OVERLAY (overlay.ts): the layout really expands, but the
 *    grid keeps its collapsed tracks so the content never moves;
 *  - the sidebar toggle clicked during a peek PINS it (Claude Code style):
 *    the click is swallowed before React, the overlay settles into the
 *    pushed layout and hover goes inert until the user collapses;
 *  - with the feature on at startup, the sidebar DSH always opens with is
 *    collapsed once, so hover works right after launch;
 *  - reduced motion needs nothing: upstream CSS kills the transitions.
 */
import type { Context } from '@deepseek-ai/cordis'
import { isViewportWide, isSidebarToggle, findFrame, findSidebarCol, findSidebarRoot, readZones, rectContains } from './dom.ts'
import { createOverlayPeek } from './overlay.ts'
import { HoverRevealMachine, type ExpandOrigin, type TimerEnv } from './state-machine.ts'
import type { PrefsController } from './prefs-store.ts'

/** Window around a programmatic toggle in which the matching DOM flip is ours. */
const TOGGLE_TAG_MS = 300
/** pointermove coalescing interval. */
const POINTER_TICK_MS = 16
/**
 * Zone hysteresis: entering the reopen zone needs a firm overlap (the darwin
 * seat is only ~30px, so a zero-slop test flickers on hand jitter and keeps
 * resetting the 180ms intent), leaving it needs a clearly wider exit so the
 * intent is never cancelled by boundary noise.
 */
const ENTER_SLOP_PX = 8
const EXIT_SLOP_PX = 24
/** Popups opened from the sidebar; all portal to <body>, outside the zone. */
const OVERLAY_SELECTOR = '[role="menu"], [role="dialog"], [role="alertdialog"]'

interface PendingToggle {
  dir: 'expand' | 'collapse'
  until: number
}

export interface HoverController {
  dispose(): void
}

export function installHoverController(ctx: Context, prefs: PrefsController): HoverController {
  const timers: TimerEnv = {
    now: () => performance.now(),
    set: (ms, fn) => window.setTimeout(fn, ms),
    clear: (handle) => window.clearTimeout(handle as number),
  }
  const machine = new HoverRevealMachine(timers)

  const layout = ctx.layout as { toggleSidebar(): void }
  const overlay = createOverlayPeek()
  let frame: HTMLElement | null = null
  let sidebarCol: HTMLElement | null = null
  let sidebarRoot: HTMLElement | null = null
  let pendingToggle: PendingToggle | null = null
  let pointerRaf = 0
  let lastPointer = { x: -1, y: -1 }
  let zoneInside = false
  let lastWide = isViewportWide()
  let anchorsWarned = false
  let disposed = false
  /**
   * Startup collapse: DSH always launches with the sidebar open. 'unknown'
   * until prefs first load; 'pending' if the feature was on at that moment;
   * 'done' once handled (or skipped). Enabling the feature later in the
   * session never collapses the sidebar under the user.
   */
  let startupCollapse: 'unknown' | 'pending' | 'done' = 'unknown'

  // ------------------------------------------------------------- outputs --

  machine.requestExpand = () => {
    if (!frame) return
    if (!frame.hasAttribute('data-sidebar-collapsed')) {
      // Same-tick race (user toggle landed first): adopt the open sidebar.
      machine.observeExpanded(true, 'self')
      return
    }
    pendingToggle = { dir: 'expand', until: timers.now() + TOGGLE_TAG_MS }
    // Overlay first: the expanded render must never push the content.
    overlay.begin(frame, sidebarCol, sidebarRoot)
    layout.toggleSidebar()
  }

  /** Drop the overlay once the open sidebar is no longer our peek. */
  function syncOverlay(): void {
    if (!overlay.active) return
    const expandInFlight =
      pendingToggle !== null && pendingToggle.dir === 'expand' && timers.now() <= pendingToggle.until
    if (machine.isExpandedByUs || expandInFlight) return
    overlay.end()
  }

  machine.requestCollapse = () => {
    if (!frame) return
    if (frame.hasAttribute('data-sidebar-collapsed')) {
      machine.observeExpanded(false, 'self')
      return
    }
    pendingToggle = { dir: 'collapse', until: timers.now() + TOGGLE_TAG_MS }
    layout.toggleSidebar()
  }

  machine.overlayOpen = () => {
    for (const el of document.querySelectorAll(OVERLAY_SELECTOR)) {
      if (el.getClientRects().length > 0) return true
    }
    return false
  }

  // --------------------------------------------------------- anchor sync --

  function refreshAnchors(): boolean {
    const nextFrame = findFrame()
    if (nextFrame !== frame) {
      if (frameObserver) frameObserver.disconnect()
      frame = nextFrame
      if (frame) {
        sidebarCol = findSidebarCol(frame)
        frameObserver = new MutationObserver(onFrameAttributes)
        frameObserver.observe(frame, {
          attributes: true,
          attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-collapsed', 'data-rightbar-fullscreen'],
        })
        // First sight of this frame: feed the machine the sidebar state that
        // predates us, so an open sidebar is observed ('inert') instead of
        // being adoptable as our own peek on the first hover.
        machine.observeExpanded(!frame.hasAttribute('data-sidebar-collapsed'), 'init')
        syncOverlay()
      }
    } else if (frame) {
      sidebarCol = findSidebarCol(frame)
    }
    if (frame && sidebarCol) sidebarRoot = findSidebarRoot(sidebarCol)
    overlay.retarget(sidebarCol, sidebarRoot)
    return frame !== null && sidebarCol !== null
  }

  function anchorsMissing(): boolean {
    if (anchorsWarned) return true
    anchorsWarned = true
    console.warn(
      '[dsh-sidebar-hover] sidebar DOM anchors not found (AppFrame/sidebarCol); ' +
        'hover reveal stays dormant. The installed DSH build may be incompatible.',
    )
    return true
  }

  function recomputeGate(): void {
    const anchorsOk = refreshAnchors()
    const enabled = prefs.store.getSnapshot().enabled
    lastWide = isViewportWide()
    if (!anchorsOk && enabled && lastWide) anchorsMissing()
    machine.setActive(enabled && lastWide && anchorsOk)
    overlay.setEnabled(frame, machine.state !== 'dormant')
    maybeStartupCollapse()
  }

  function maybeStartupCollapse(): void {
    if (startupCollapse === 'unknown') {
      const snap = prefs.store.getSnapshot()
      if (snap.status === 'pending') return
      startupCollapse = snap.status === 'ready' && snap.enabled ? 'pending' : 'done'
    }
    if (startupCollapse !== 'pending') return
    if (machine.state === 'dormant' || !frame) return // anchors/viewport not there yet
    startupCollapse = 'done'
    if (frame.hasAttribute('data-sidebar-collapsed')) return
    pendingToggle = { dir: 'collapse', until: timers.now() + TOGGLE_TAG_MS }
    layout.toggleSidebar()
  }

  // ---------------------------------------------------- DOM observation --

  let frameObserver: MutationObserver | null = null
  let lastExternalLog = 0

  function onFrameAttributes(mutations: MutationRecord[]): void {
    for (const m of mutations) {
      if (m.attributeName === 'data-sidebar-collapsed' && frame) {
        const collapsed = frame.hasAttribute('data-sidebar-collapsed')
        const now = timers.now()
        const ours =
          pendingToggle !== null &&
          now <= pendingToggle.until &&
          pendingToggle.dir === (collapsed ? 'collapse' : 'expand')
        if (pendingToggle !== null && now > pendingToggle.until) pendingToggle = null
        if (ours) pendingToggle = null
        if (!ours && now - lastExternalLog > 2000) {
          // Diagnostic: visible trace of user-attributed flips (Mod+B, toggle
          // button, or a MISSED attribution — the latter shows up as these
          // lines appearing while the user only hovered).
          lastExternalLog = now
          console.info(
            collapsed
              ? '[dsh-sidebar-hover] sidebar collapsed by user'
              : '[dsh-sidebar-hover] sidebar expanded by user; hover inert until it is collapsed',
          )
        }
        machine.observeExpanded(!collapsed, ours ? 'self' : 'external')
        if (collapsed) overlay.end()
        else syncOverlay()
      } else if (m.attributeName === 'data-rightbar-collapsed' && frame) {
        const opened = !frame.hasAttribute('data-rightbar-collapsed')
        if (opened) machine.rightPanelOpened()
        overlay.refresh()
      } else if (m.attributeName === 'data-rightbar-fullscreen') {
        overlay.refresh()
      }
    }
  }

  // ---------------------------------------------------------- listeners --

  function onPointerMove(event: PointerEvent): void {
    lastPointer = { x: event.clientX, y: event.clientY }
    if (pointerRaf) return
    pointerRaf = window.setTimeout(() => {
      pointerRaf = 0
      if (disposed) return
      if (isViewportWide() !== lastWide) recomputeGate()
      if (!frame && !recomputeGateSilently()) return
      const { zones } = readZones(frame!, sidebarCol, overlay.active ? sidebarRoot : null)
      const slop = zoneInside ? EXIT_SLOP_PX : ENTER_SLOP_PX
      let inside = false
      for (const zone of zones) {
        if (rectContains(zone, lastPointer.x, lastPointer.y, slop)) {
          inside = true
          break
        }
      }
      zoneInside = inside
      machine.pointerMove(inside)
    }, POINTER_TICK_MS) as unknown as number
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (machine.state === 'peek' || machine.state === 'grace') {
      machine.escape()
    }
  }

  function onFocusIn(event: FocusEvent): void {
    const target = event.target
    const viaKeyboard =
      target instanceof Element && target.matches(':focus-visible')
    machine.focusChange(true, viaKeyboard)
  }

  function onFocusOut(event: FocusEvent): void {
    if (!sidebarRoot) return
    const next = event.relatedTarget
    if (next instanceof Node && sidebarRoot.contains(next)) return
    machine.focusChange(false, false)
  }

  function onScrollCapture(): void {
    machine.gesture()
  }

  /**
   * Pin: the sidebar toggle clicked while our peek is open. Runs in the
   * document capture phase — before React's root listener — and swallows the
   * click so the native toggle does not collapse the sidebar.
   */
  function onDocumentClickCapture(event: MouseEvent): void {
    if (!sidebarRoot || !overlay.active || !machine.isExpandedByUs) return
    const path = event.composedPath()
    if (!path.includes(sidebarRoot)) return
    if (!path.some(isSidebarToggle)) return
    event.preventDefault()
    event.stopPropagation()
    if (machine.pin()) overlay.settle()
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!sidebarRoot) return
    // composedPath is fixed at dispatch: still valid if React re-rendered or
    // detached the clicked node while handling the click.
    const path = event.composedPath()
    if (!path.includes(sidebarRoot)) return
    for (const node of path) {
      if (node === sidebarRoot) break
      if (!(node instanceof Element)) continue
      // Drag strips carry the darwin toggle + brand row: the native toggle
      // owns those clicks (and Mod+B) — never select-collapse for them.
      if (node.hasAttribute('data-window-drag')) return
      // Disclosure toggles (workspace row expands/collapses its session list,
      // overflow + search toggles — all carry aria-expanded) restate the
      // list, not a session: expanding a list must survive the peek.
      if (node.hasAttribute('aria-expanded') || node.hasAttribute('aria-haspopup')) return
    }
    machine.activationClick()
  }

  function onResize(): void {
    recomputeGate()
  }

  /** Anchor retry on pointer activity (the app frame mounts after our apply). */
  function recomputeGateSilently(): boolean {
    const ok = refreshAnchors()
    const enabled = prefs.store.getSnapshot().enabled
    lastWide = isViewportWide()
    machine.setActive(enabled && lastWide && ok)
    overlay.setEnabled(frame, machine.state !== 'dormant')
    if (ok) rebindSidebarListeners()
    maybeStartupCollapse()
    return ok
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('resize', onResize)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('click', onDocumentClickCapture, true)

  // --------------------------------------------------------- prefs feed --

  const unsubscribe = prefs.store.subscribe(() => {
    const snap = prefs.store.getSnapshot()
    machine.setDelay(snap.hoverDelayMs)
    recomputeGate()
    rebindSidebarListeners()
  })
  machine.setDelay(prefs.store.getSnapshot().hoverDelayMs)

  let sidebarListenersBound: HTMLElement | null = null

  /** Re-bind sidebar-scope listeners when the root element changes (mount/unmount). */
  function rebindSidebarListeners(): void {
    if (!frame || !sidebarCol) {
      sidebarListenersBound = null
      return
    }
    const root = findSidebarRoot(sidebarCol) ?? sidebarCol
    if (root === sidebarListenersBound) return
    if (sidebarListenersBound) {
      sidebarListenersBound.removeEventListener('focusin', onFocusIn, true)
      sidebarListenersBound.removeEventListener('focusout', onFocusOut, true)
      sidebarListenersBound.removeEventListener('scroll', onScrollCapture, true)
    }
    root.addEventListener('focusin', onFocusIn, true)
    root.addEventListener('focusout', onFocusOut, true)
    root.addEventListener('scroll', onScrollCapture, true)
    sidebarListenersBound = root
    sidebarRoot = root
    overlay.retarget(sidebarCol, sidebarRoot)
  }

  refreshAnchors()
  recomputeGate()
  rebindSidebarListeners()

  return {
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      machine.setActive(false)
      if (pointerRaf) {
        window.clearTimeout(pointerRaf)
        pointerRaf = 0
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('click', onDocumentClick)
      document.removeEventListener('click', onDocumentClickCapture, true)
      overlay.dispose()
      frameObserver?.disconnect()
      if (sidebarListenersBound) {
        sidebarListenersBound.removeEventListener('focusin', onFocusIn, true)
        sidebarListenersBound.removeEventListener('focusout', onFocusOut, true)
        sidebarListenersBound.removeEventListener('scroll', onScrollCapture, true)
      }
    },
  }
}
