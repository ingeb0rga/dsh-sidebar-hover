/**
 * HoverRevealMachine — the complete peek/sidebar behavior as a pure,
 * DOM-free state machine. All time flows through the injected {@link TimerEnv},
 * all sidebar movement flows through the two output callbacks
 * {@link HoverRevealMachine.requestExpand} / {@link HoverRevealMachine.requestCollapse};
 * the DOM controller only reports events.
 *
 * Task behavior map (dsh-sidebar-hover-plugin-task.md):
 *  - hidden / rail → hover reopen zone → 180 ms intent → peek (1)
 *  - leave peek → 250 ms grace → collapse; re-enter cancels (2)
 *  - select-collapse: activation click / Esc → immediate (3)
 *  - pin: the sidebar toggle clicked during a peek keeps it open as the
 *    user's own expansion (inert until they collapse it) — Claude Code style
 *  - holds: pointer inside, keyboard focus inside, gesture, right panel just
 *    opened, an open menu/dialog (overlay probe) (4)
 *  - explicit user collapse (Mod+B / toggle) wins: a pointer resting in the
 *    reopen zone must leave and re-enter before the next peek (4)
 *  - explicit user expansion → hover rules inert until the user collapses (4)
 *  - disabled / window < 1/3 of the screen → fully dormant (5, feature gate)
 */

/** Timer + clock seam so tests drive time manually. */
export interface TimerEnv {
  now(): number
  set(ms: number, fn: () => void): unknown
  clear(handle: unknown): void
}

export type MachineState =
  | 'dormant'
  | 'collapsed'
  | 'intent'
  | 'peek'
  | 'grace'
  | 'inert'

export type ExpandOrigin = 'self' | 'external' | 'init'

/** Behavior constants (task-fixed except the configurable intent delay). */
export const MACHINE_CONSTANTS = {
  graceMs: 250,
  gestureHoldMs: 300,
  rightbarHoldMs: 1000,
} as const

export class HoverRevealMachine {
  requestExpand: () => void = () => {}
  requestCollapse: () => void = () => {}
  /**
   * Overlay hold probe: true while a menu/dialog opened from the peek is up
   * (they portal outside the sidebar, so the pointer "leaves" to use them).
   * Grace dismiss and Esc wait for it to clear.
   */
  overlayOpen: () => boolean = () => false

  private readonly env: TimerEnv
  private readonly graceMs: number
  private readonly gestureHoldMs: number
  private readonly rightbarHoldMs: number

  private active = false
  private delayMs = 180
  private expandedActual = false
  /** True while the expanded state is ours (peek) and not yet undone. */
  private weExpanded = false
  private pointerInside = false
  private focusHold = false
  private gestureUntil = 0
  private rightbarHoldUntil = 0
  private intentTimer: unknown = null
  private graceTimer: unknown = null

  constructor(env: TimerEnv, constants: Partial<typeof MACHINE_CONSTANTS> = {}) {
    this.env = env
    this.graceMs = constants.graceMs ?? MACHINE_CONSTANTS.graceMs
    this.gestureHoldMs = constants.gestureHoldMs ?? MACHINE_CONSTANTS.gestureHoldMs
    this.rightbarHoldMs = constants.rightbarHoldMs ?? MACHINE_CONSTANTS.rightbarHoldMs
  }

  /** Coarse state label, primarily for tests and one-line logging. */
  get state(): MachineState {
    if (!this.active) return 'dormant'
    if (this.expandedActual && !this.weExpanded) return 'inert'
    if (this.intentTimer !== null) return 'intent'
    if (this.weExpanded && this.expandedActual) {
      return this.graceTimer !== null ? 'grace' : 'peek'
    }
    return 'collapsed'
  }

  get isExpandedByUs(): boolean {
    return this.weExpanded && this.expandedActual
  }

  // ---------------------------------------------------------------- events --

  /** Feature gate: settings toggle AND window ≥ 1/3 of the screen AND anchors found. */
  setActive(on: boolean): void {
    if (this.active === on) return
    this.active = on
    this.pointerInside = false
    this.focusHold = false
    if (on) {
      // Fresh arming: the machine never adopts an already-open sidebar as its
      // own peek; if it is open the state is 'inert' until the user collapses.
      this.weExpanded = false
      return
    }
    this.cancelIntent()
    this.cancelGrace()
    this.weExpanded = false
    if (this.expandedActual) this.requestCollapse()
  }

  setDelay(ms: number): void {
    this.delayMs = ms
  }

  /**
   * Observed sidebar expansion flip. `origin: 'self'` flips are the DOM echo
   * of our own toggle pair; `'external'` flips are the user (Mod+B, toggle
   * button, drag) and always win over us; `'init'` is the first observation
   * of an already-mounted sidebar (never claims ownership, never locks).
   */
  observeExpanded(actual: boolean, origin: ExpandOrigin): void {
    this.expandedActual = actual
    if (origin === 'init') {
      // Pure observation: an open sidebar belongs to the user ('inert' via
      // state), a hidden one is plain 'collapsed'. No timers, no lock.
      this.cancelIntent()
      this.cancelGrace()
      this.weExpanded = false
      return
    }
    if (origin === 'self') {
      if (!actual) {
        // Our collapse landed (grace/select/Esc/disable paths).
        this.weExpanded = false
        this.cancelGrace()
      } else {
        // Our expand landed (or the controller adopted a same-tick expansion);
        // the open sidebar is ours to dismiss. Pointer inside the now expanded
        // sidebar is level-true — no new intent must arm.
        this.weExpanded = true
        this.cancelIntent()
      }
      return
    }
    // External flip: the user toggled. Cancel anything pending; hover rules
    // stay inert while they keep it open. After a user collapse no timed
    // lockout: peeks are edge-triggered, so a pointer still resting in the
    // reopen zone (it just clicked the toggle) gets no peek until it leaves
    // and comes back — the user's collapse wins without a dead window.
    this.cancelIntent()
    this.cancelGrace()
    this.weExpanded = false
  }

  /** Pointer zone crossing report from the controller (edge-triggered inside). */
  pointerMove(inside: boolean): void {
    if (inside === this.pointerInside) return
    this.pointerInside = inside
    if (!this.active) return
    if (inside) {
      this.onZoneEntered()
    } else {
      this.onZoneLeft()
    }
  }

  /** Keyboard (focus-visible) focus entered/left the sidebar. */
  focusChange(inside: boolean, viaKeyboard: boolean): void {
    if (inside) {
      if (viaKeyboard) {
        this.focusHold = true
        this.cancelGrace()
      }
      // Keyboard reveal: rail control focused while collapsed → peek now.
      if (viaKeyboard && this.active && !this.expandedActual) {
        this.cancelIntent()
        this.requestExpand()
      }
      return
    }
    this.focusHold = false
    // Focus left: like a pointer leave — but the pointer may still hold it.
    if (this.active && this.weExpanded && this.expandedActual && !this.pointerInside) {
      this.armGraceIfFree()
    }
  }

  /** Scroll/drag gesture inside the sidebar: hold the peek, drop pending grace. */
  gesture(): void {
    this.gestureUntil = this.env.now() + this.gestureHoldMs
    if (this.graceTimer !== null) this.cancelGrace()
    // Pointer already left while the peek is ours: when the gesture hold ends,
    // the peek goes with it (no further leave event will arrive).
    if (
      this.weExpanded &&
      this.expandedActual &&
      !this.pointerInside &&
      !this.focusHold &&
      this.graceTimer === null
    ) {
      this.graceTimer = this.env.set(this.gestureHoldMs, () => {
        this.graceTimer = null
        if (!this.weExpanded || !this.expandedActual) return
        if (this.pointerInside || this.focusHold) return
        const t = this.env.now()
        if (t < this.gestureUntil || t < this.rightbarHoldUntil) return
        if (this.overlayOpen()) {
          this.armGraceIfFree()
          return
        }
        this.requestCollapse()
      })
    }
  }

  /** The right panel just opened (not via our surfaces): existing rule stays in charge. */
  rightPanelOpened(): void {
    this.rightbarHoldUntil = this.env.now() + this.rightbarHoldMs
    if (this.graceTimer !== null) this.cancelGrace()
  }

  /** Escape pressed while peeking: immediate collapse. */
  escape(): void {
    if (!this.active || !this.weExpanded || !this.expandedActual) return
    // Esc closes the open menu/dialog first; the peek stays.
    if (this.overlayOpen()) return
    this.cancelIntent()
    this.cancelGrace()
    this.requestCollapse()
  }

  /**
   * Activation click inside the sidebar (session row, workspace row,
   * New Session, Settings trigger): immediate select-collapse. When the
   * expansion is the user's (inert), we never collapse for them.
   */
  activationClick(): void {
    if (!this.active || !this.weExpanded || !this.expandedActual) return
    this.cancelIntent()
    this.cancelGrace()
    this.requestCollapse()
  }

  /**
   * The user clicked the sidebar toggle while our peek is open: the peek
   * becomes their pinned expansion. Hover rules go inert until they collapse
   * it themselves (next collapse is an external flip).
   */
  pin(): boolean {
    if (!this.active || !this.weExpanded || !this.expandedActual) return false
    this.cancelIntent()
    this.cancelGrace()
    this.weExpanded = false
    return true
  }

  // ------------------------------------------------------------- internals --

  private onZoneEntered(): void {
    if (this.expandedActual) {
      // Back inside during grace → cancel the dismiss.
      this.cancelGrace()
      return
    }
    // Collapsed: rising edge into the reopen zone.
    this.armIntent()
  }

  /** Arm the intent window: expand after `delayMs` unless the pointer leaves. */
  private armIntent(): void {
    this.cancelIntent()
    this.intentTimer = this.env.set(this.delayMs, () => {
      this.intentTimer = null
      if (!this.active || this.expandedActual) return
      this.requestExpand()
    })
  }

  private onZoneLeft(): void {
    this.cancelIntent()
    if (this.weExpanded && this.expandedActual) {
      this.armGraceIfFree()
    }
  }

  /**
   * Start the 250 ms grace dismiss unless a hold rule covers the peek. An open
   * overlay does not block arming: the timer re-arms itself until it closes.
   */
  private armGraceIfFree(): void {
    if (this.focusHold) return
    const now = this.env.now()
    if (now < this.gestureUntil || now < this.rightbarHoldUntil) return
    this.cancelGrace()
    this.graceTimer = this.env.set(this.graceMs, () => {
      this.graceTimer = null
      if (!this.weExpanded || !this.expandedActual) return
      if (this.focusHold) return
      const t = this.env.now()
      if (t < this.gestureUntil || t < this.rightbarHoldUntil) return
      if (this.overlayOpen()) {
        this.armGraceIfFree()
        return
      }
      this.requestCollapse()
    })
  }

  private cancelIntent(): void {
    if (this.intentTimer !== null) {
      this.env.clear(this.intentTimer)
      this.intentTimer = null
    }
  }

  private cancelGrace(): void {
    if (this.graceTimer !== null) {
      this.env.clear(this.graceTimer)
      this.graceTimer = null
    }
  }
}
