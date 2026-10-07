/** Unit tests for SessionHistory — back/forward semantics of the titlebar arrows. */
import { describe, expect, it } from 'vitest'
import { entryOf, SessionHistory, type HistoryEntry } from './history.ts'

const e = (id: string): HistoryEntry => ({ key: id, target: id })

/** Simulate the workspace opening what step() returned. */
function go(h: SessionHistory, dir: -1 | 1): string | null {
  const entry = h.step(dir)
  if (entry === null) return null
  h.observe(entry)
  return entry.key
}

describe('SessionHistory', () => {
  it('starts empty: nowhere to go', () => {
    const h = new SessionHistory()
    expect(h.state).toEqual({ canBack: false, canForward: false })
    expect(h.step(-1)).toBeNull()
  })

  it('back and forward walk visited sessions in order', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(e('b'))
    h.observe(e('c'))
    expect(go(h, -1)).toBe('b')
    expect(go(h, -1)).toBe('a')
    expect(h.state).toEqual({ canBack: false, canForward: true })
    expect(go(h, 1)).toBe('b')
    expect(go(h, 1)).toBe('c')
    expect(h.state).toEqual({ canBack: true, canForward: false })
  })

  it('a new selection after going back truncates the forward branch', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(e('b'))
    h.observe(e('c'))
    go(h, -1) // b
    h.observe(e('d'))
    expect(h.state.canForward).toBe(false)
    expect(go(h, -1)).toBe('b')
    expect(go(h, -1)).toBe('a')
  })

  it('re-selecting the current session is not a new entry', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(e('a'))
    expect(h.state.canBack).toBe(false)
  })

  it('ignores an empty selection', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(null)
    h.observe(e('b'))
    expect(go(h, -1)).toBe('a')
  })

  it('a different selection while a step is in flight wins and is pushed', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(e('b'))
    h.step(-1) // asked for a ...
    h.observe(e('x')) // ... but the user clicked x first
    expect(go(h, -1)).toBe('b')
  })

  it('drop() removes an unopenable entry and the next step skips it', () => {
    const h = new SessionHistory()
    h.observe(e('a'))
    h.observe(e('gone'))
    h.observe(e('c'))
    const dead = h.step(-1)!
    expect(dead.key).toBe('gone')
    h.drop(dead)
    expect(go(h, -1)).toBe('a')
    expect(go(h, 1)).toBe('c')
  })

  it('caps the stack at max entries, dropping the oldest', () => {
    const h = new SessionHistory(3)
    for (const id of ['a', 'b', 'c', 'd']) h.observe(e(id))
    expect(go(h, -1)).toBe('c')
    expect(go(h, -1)).toBe('b')
    expect(h.state.canBack).toBe(false)
  })
})

describe('entryOf', () => {
  it('maps a plain session selection', () => {
    expect(entryOf({ sessionId: 's1' })).toEqual({ key: 's1', target: 's1' })
  })

  it('keys subagent selections apart from their parent session', () => {
    const sub = { sessionId: 's1', agentId: 'x' }
    const entry = entryOf({ sessionId: 's1', subagentAddress: sub })!
    expect(entry.target).toBe(sub)
    expect(entry.key).not.toBe('s1')
  })

  it('returns null for an empty selection', () => {
    expect(entryOf({})).toBeNull()
    expect(entryOf(null)).toBeNull()
  })
})
