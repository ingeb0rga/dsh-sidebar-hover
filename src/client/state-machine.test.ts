/**
 * Unit tests for HoverRevealMachine — pure time-driven behavior, ManualClock
 * stands in for timers. Coverage maps to the task's required unit-test list:
 * hover intent, grace dismiss, select-collapse, Mod+B override, plus the
 * hold rules and reduced-motion irrelevance (machine has no motion state).
 */
import { describe, expect, it, vi } from 'vitest'
import { HoverRevealMachine, MACHINE_CONSTANTS, type TimerEnv } from './state-machine.ts'

class ManualClock implements TimerEnv {
  private t = 0
  private seq = 0
  readonly timers = new Map<unknown, { at: number; fn: () => void }>()

  now(): number {
    return this.t
  }

  set(ms: number, fn: () => void): unknown {
    const handle = ++this.seq
    this.timers.set(handle, { at: this.t + ms, fn })
    return handle
  }

  clear(handle: unknown): void {
    this.timers.delete(handle)
  }

  advance(ms: number): void {
    const target = this.t + ms
    for (;;) {
      let next: { at: number; fn: () => void; handle: unknown } | null = null
      for (const [handle, timer] of this.timers) {
        if (timer.at <= target && (next === null || timer.at < next.at)) {
          next = { ...timer, handle }
        }
      }
      if (next === null) break
      this.timers.delete(next.handle)
      this.t = Math.max(this.t, next.at)
      next.fn()
    }
    this.t = target
  }
}

interface Rig {
  clock: ManualClock
  machine: HoverRevealMachine
  expands: ReturnType<typeof vi.fn>
  collapses: ReturnType<typeof vi.fn>
}

function rig(delayMs = 180): Rig {
  const clock = new ManualClock()
  const machine = new HoverRevealMachine(clock)
  const expands = vi.fn()
  const collapses = vi.fn()
  machine.requestExpand = expands
  machine.requestCollapse = collapses
  machine.setDelay(delayMs)
  machine.setActive(true)
  return { clock, machine, expands, collapses }
}

/** Drive a full peek open: hover zone → intent → requestExpand → DOM echo. */
function peekOpen(rig: Rig, delayMs = 180): void {
  rig.machine.pointerMove(true)
  rig.clock.advance(delayMs)
  expect(rig.expands).toHaveBeenCalledTimes(1)
  rig.machine.observeExpanded(true, 'self')
}

describe('feature gating', () => {
  it('is fully inert while disabled', () => {
    const clock = new ManualClock()
    const machine = new HoverRevealMachine(clock)
    const expands = vi.fn()
    machine.requestExpand = expands
    machine.setActive(false)
    machine.pointerMove(true)
    clock.advance(10_000)
    machine.focusChange(true, true)
    machine.escape()
    machine.activationClick()
    expect(expands).not.toHaveBeenCalled()
    expect(machine.state).toBe('dormant')
  })

  it('toggles to dormant on a too-narrow window and collapses an owned peek', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    // The production gate is setActive(enabled && wideViewport && anchors).
    r.machine.setActive(false)
    expect(r.collapses).toHaveBeenCalledTimes(1)
    r.machine.observeExpanded(false, 'self')
    expect(r.machine.state).toBe('dormant')
  })

  it('never adopts an open sidebar as its own peek when enabled mid-session', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external')
    expect(r.machine.state).toBe('inert')
    r.machine.pointerMove(true)
    r.clock.advance(10_000)
    expect(r.expands).not.toHaveBeenCalled()
  })
})

describe('hover intent (rule 1)', () => {
  it('fires one expand after the configured delay', () => {
    const r = rig(180)
    r.machine.pointerMove(true)
    expect(r.machine.state).toBe('intent')
    r.clock.advance(179)
    expect(r.expands).not.toHaveBeenCalled()
    r.clock.advance(1)
    expect(r.expands).toHaveBeenCalledTimes(1)
    expect(r.machine.state).toBe('collapsed') // until the DOM echo arrives
    r.machine.observeExpanded(true, 'self')
    expect(r.machine.state).toBe('peek')
  })

  it('honors a custom hoverDelayMs from settings', () => {
    const r = rig()
    r.machine.setDelay(400)
    r.machine.pointerMove(true)
    r.clock.advance(399)
    expect(r.expands).not.toHaveBeenCalled()
    r.clock.advance(1)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })

  it('cancels intent when the pointer leaves before the delay (rule 1)', () => {
    const r = rig()
    r.machine.pointerMove(true)
    r.clock.advance(100)
    r.machine.pointerMove(false)
    r.clock.advance(10_000)
    expect(r.expands).not.toHaveBeenCalled()
  })

  it('requires a fresh rising edge: no re-peek while the pointer never leaves', () => {
    const r = rig()
    peekOpen(r)
    r.machine.activationClick() // select-collapse while pointer stays inside
    r.machine.observeExpanded(false, 'self')
    r.clock.advance(10_000)
    expect(r.expands).toHaveBeenCalledTimes(1) // only the original peek
    // Leaving and re-entering re-arms.
    r.machine.pointerMove(false)
    r.machine.pointerMove(true)
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(2)
  })
})

describe('grace dismiss (rule 2)', () => {
  it('collapses after the grace period when the pointer leaves peek', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    expect(r.machine.state).toBe('grace')
    r.clock.advance(249)
    expect(r.collapses).not.toHaveBeenCalled()
    r.clock.advance(1)
    expect(r.collapses).toHaveBeenCalledTimes(1)
  })

  it('cancels grace when the pointer re-enters (rule 2)', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    r.clock.advance(100)
    r.machine.pointerMove(true)
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
    expect(r.machine.state).toBe('peek')
  })

  it('a scroll gesture holds the peek and drops pending grace (rule 4)', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    r.clock.advance(200)
    r.machine.gesture()
    r.clock.advance(MACHINE_CONSTANTS.graceMs + 10)
    expect(r.collapses).not.toHaveBeenCalled()
    // After the gesture hold expires the next leave can grace-dismiss again.
    r.clock.advance(MACHINE_CONSTANTS.gestureHoldMs + 1)
    expect(r.collapses).toHaveBeenCalledTimes(1)
  })

  it('right panel opening cancels pending grace (rule 4)', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    r.machine.rightPanelOpened()
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })
})

describe('select-collapse (rule 3)', () => {
  it('collapses immediately on activation click while peeking', () => {
    const r = rig()
    peekOpen(r)
    r.machine.activationClick()
    expect(r.collapses).toHaveBeenCalledTimes(1)
    expect(r.machine.state).toBe('peek') // until the DOM echo
    r.machine.observeExpanded(false, 'self')
    expect(r.machine.state).toBe('collapsed')
  })

  it('collapses immediately on Escape while peeking', () => {
    const r = rig()
    peekOpen(r)
    r.machine.escape()
    expect(r.collapses).toHaveBeenCalledTimes(1)
    r.machine.observeExpanded(false, 'self')
    expect(r.machine.state).toBe('collapsed')
  })

  it('never collapses the user\'s own expansion', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external')
    r.machine.activationClick()
    r.machine.escape()
    r.machine.pointerMove(false)
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })
})

describe('Mod+B / explicit toggle override (rule 4)', () => {
  it('external expand makes hover rules inert until the user collapses', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external')
    expect(r.machine.state).toBe('inert')
    r.machine.pointerMove(false)
    r.machine.pointerMove(true)
    r.clock.advance(10_000)
    expect(r.expands).not.toHaveBeenCalled()
  })

  it('external expand while peeking ends our peek bookkeeping without collapse', () => {
    const r = rig()
    peekOpen(r)
    r.machine.observeExpanded(false, 'external') // user hit Mod+B mid-peek
    expect(r.machine.state).toBe('collapsed')
    expect(r.collapses).not.toHaveBeenCalled()
  })

  it('user collapse with the pointer resting in the zone: no re-peek until it leaves and returns', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external') // toggle open
    r.machine.pointerMove(true) // pointer on the toggle
    r.machine.observeExpanded(false, 'external') // toggle close, pointer stays
    r.clock.advance(10_000)
    expect(r.expands).not.toHaveBeenCalled()
    r.machine.pointerMove(false)
    r.machine.pointerMove(true)
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })

  it('no timed lockout: hover peeks right after a user collapse', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external') // Mod+B open
    r.machine.observeExpanded(false, 'external') // Mod+B close, pointer elsewhere
    r.machine.pointerMove(true)
    expect(r.machine.state).toBe('intent')
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })

  it('ignores activation/escape after a user toggle (nothing of ours is open)', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external')
    r.machine.observeExpanded(false, 'external')
    r.machine.escape()
    r.machine.activationClick()
    expect(r.collapses).not.toHaveBeenCalled()
  })
})

describe('keyboard focus rules (rule 4 + a11y)', () => {
  it('reveals immediately on keyboard focus of a rail control (no intent delay)', () => {
    const r = rig()
    r.machine.focusChange(true, true)
    expect(r.expands).toHaveBeenCalledTimes(1)
    r.machine.observeExpanded(true, 'self')
    expect(r.machine.state).toBe('peek')
  })

  it('does not reveal on mouse-driven focus', () => {
    const r = rig()
    r.machine.focusChange(true, false)
    r.clock.advance(10_000)
    expect(r.expands).not.toHaveBeenCalled()
  })

  it('holds the peek while keyboard focus stays inside, even with the pointer away', () => {
    const r = rig()
    r.machine.focusChange(true, true)
    r.machine.observeExpanded(true, 'self')
    r.machine.pointerMove(true)
    r.machine.pointerMove(false) // pointer leaves during peek
    r.clock.advance(10_000) // focusHold must keep the grace from arming
    expect(r.collapses).not.toHaveBeenCalled()
    expect(r.machine.state).toBe('peek')
  })

  it('focus leave collapses after grace; pointer hold prevents it', () => {
    const r = rig()
    r.machine.focusChange(true, true)
    r.machine.observeExpanded(true, 'self')
    // Pointer still inside: focus leave must NOT start grace.
    r.machine.pointerMove(true)
    r.machine.focusChange(false, false)
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
    // Pointer leaves → grace fires.
    r.machine.pointerMove(false)
    r.clock.advance(250)
    expect(r.collapses).toHaveBeenCalledTimes(1)
  })

  it('keyboard focus entered during grace cancels the dismiss', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    r.clock.advance(100)
    r.machine.focusChange(true, true)
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })

  it('keyboard-reveals right after a user collapse (no lockout)', () => {
    const r = rig()
    r.machine.observeExpanded(true, 'external')
    r.machine.observeExpanded(false, 'external')
    r.machine.focusChange(true, true)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })
})

describe('initial observation (origin: init)', () => {
  it('an already-open sidebar is inert: hover never adopts it as our peek', () => {
    const r = rig()
    r.machine.setActive(true)
    r.machine.observeExpanded(true, 'init')
    expect(r.machine.state).toBe('inert')
    // Hovering the open sidebar must not expand "for us".
    r.machine.pointerMove(true)
    r.clock.advance(1_000)
    expect(r.expands).not.toHaveBeenCalled()
    // Leaving must not collapse the user's sidebar either.
    r.machine.pointerMove(false)
    r.clock.advance(1_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })

  it('an already-hidden sidebar is collapsed: hover peeks normally', () => {
    const r = rig()
    r.machine.setActive(true)
    r.machine.observeExpanded(false, 'init')
    expect(r.machine.state).toBe('collapsed')
    r.machine.pointerMove(true)
    expect(r.machine.state).toBe('intent')
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })

  it('init does not start the explicit-toggle lockout', () => {
    const r = rig()
    r.machine.setActive(true)
    r.machine.observeExpanded(true, 'init')
    r.machine.observeExpanded(false, 'init')
    r.machine.pointerMove(true)
    expect(r.machine.state).toBe('intent')
  })

  it('after init-inert, a user collapse restores normal hover behavior', () => {
    const r = rig()
    r.machine.setActive(true)
    r.machine.observeExpanded(true, 'init')
    r.machine.observeExpanded(false, 'external')
    r.machine.pointerMove(true)
    expect(r.machine.state).toBe('intent')
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(1)
  })
})

describe('pin (toggle clicked during a peek)', () => {
  it('turns the peek into the user\'s expansion: no grace, no select-collapse', () => {
    const r = rig()
    peekOpen(r)
    expect(r.machine.pin()).toBe(true)
    expect(r.machine.state).toBe('inert')
    r.machine.pointerMove(false)
    r.machine.activationClick()
    r.machine.escape()
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })

  it('cancels a pending grace dismiss', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pointerMove(false)
    r.clock.advance(100)
    r.machine.pin()
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
  })

  it('is a no-op when nothing of ours is open', () => {
    const r = rig()
    expect(r.machine.pin()).toBe(false)
    r.machine.observeExpanded(true, 'external')
    expect(r.machine.pin()).toBe(false)
  })

  it('after the user closes a pinned sidebar, hover peeks again', () => {
    const r = rig()
    peekOpen(r)
    r.machine.pin()
    r.machine.observeExpanded(false, 'external') // user clicks the toggle again
    r.machine.pointerMove(false)
    r.machine.pointerMove(true)
    r.clock.advance(180)
    expect(r.expands).toHaveBeenCalledTimes(2)
  })
})

describe('overlay hold (menu / dialog opened from the peek)', () => {
  it('grace waits while a menu is open, then collapses once it closes', () => {
    const r = rig()
    let menu = false
    r.machine.overlayOpen = () => menu
    peekOpen(r)
    menu = true // row "..." menu portals outside the sidebar
    r.machine.pointerMove(false) // pointer moves into the menu
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
    expect(r.machine.state).toBe('grace')
    menu = false
    r.clock.advance(MACHINE_CONSTANTS.graceMs)
    expect(r.collapses).toHaveBeenCalledTimes(1)
  })

  it('pointer back inside while the menu is open cancels the pending dismiss', () => {
    const r = rig()
    let menu = true
    r.machine.overlayOpen = () => menu
    peekOpen(r)
    r.machine.pointerMove(false)
    r.clock.advance(1_000)
    r.machine.pointerMove(true)
    menu = false
    r.clock.advance(10_000)
    expect(r.collapses).not.toHaveBeenCalled()
    expect(r.machine.state).toBe('peek')
  })

  it('Escape closes the menu first, not the peek', () => {
    const r = rig()
    let menu = true
    r.machine.overlayOpen = () => menu
    peekOpen(r)
    r.machine.escape()
    expect(r.collapses).not.toHaveBeenCalled()
    menu = false
    r.machine.escape()
    expect(r.collapses).toHaveBeenCalledTimes(1)
  })
})
