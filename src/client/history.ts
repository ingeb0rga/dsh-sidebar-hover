/**
 * SessionHistory — browser-style back/forward over the sessions shown in the
 * main view (Claude Code's titlebar arrows). Pure and DOM-free: the navigator
 * feeds it every main-view selection and asks it where to go.
 *
 *  - a new selection truncates the forward branch and is pushed;
 *  - a selection that lands on the entry we navigated to only moves the
 *    cursor (no push), so back/forward never rewrites the stack;
 *  - an entry that cannot be opened any more (deleted session) is dropped and
 *    the step continues past it.
 */

export interface HistoryEntry {
  /** Identity: session id + subagent address. */
  readonly key: string
  /** What `uiWorkspace.openSession()` takes: a session id or subagent address. */
  readonly target: unknown
}

export interface HistoryState {
  readonly canBack: boolean
  readonly canForward: boolean
}

export const HISTORY_MAX_ENTRIES = 100

export class SessionHistory {
  private entries: HistoryEntry[] = []
  private index = -1
  /** In-flight back/forward: the entry index we asked the workspace to open. */
  private pending: { index: number; key: string } | null = null
  private readonly max: number

  constructor(max = HISTORY_MAX_ENTRIES) {
    this.max = max
  }

  get state(): HistoryState {
    return { canBack: this.index > 0, canForward: this.index < this.entries.length - 1 }
  }

  /** The main view now shows `entry` (null = nothing selected: ignored). */
  observe(entry: HistoryEntry | null): void {
    if (entry === null) return
    if (this.pending !== null) {
      const { index, key } = this.pending
      this.pending = null
      if (key === entry.key && this.entries[index]?.key === key) {
        this.index = index
        return
      }
    }
    if (this.entries[this.index]?.key === entry.key) return
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(entry)
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max)
    this.index = this.entries.length - 1
  }

  /** The entry one step back/forward, marked as the pending destination. */
  step(direction: -1 | 1): HistoryEntry | null {
    const target = this.index + direction
    const entry = this.entries[target]
    if (entry === undefined) return null
    this.pending = { index: target, key: entry.key }
    return entry
  }

  /** The pending destination could not be opened: forget it. */
  drop(entry: HistoryEntry): void {
    const at = this.entries.indexOf(entry)
    if (at < 0) return
    this.entries.splice(at, 1)
    if (at < this.index) this.index -= 1
    this.pending = null
  }
}

/** Selection snapshot (`uiWorkspace.selection`) → history entry. */
export function entryOf(selection: { sessionId?: unknown; subagentAddress?: unknown } | null | undefined): HistoryEntry | null {
  if (!selection || typeof selection.sessionId !== 'string') return null
  const sub = selection.subagentAddress
  return {
    key: sub === undefined ? selection.sessionId : `${selection.sessionId}\u0000${JSON.stringify(sub)}`,
    target: sub ?? selection.sessionId,
  }
}
