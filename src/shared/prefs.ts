/**
 * Shared preference vocabulary for both halves — kept free of schemastery so
 * the browser bundle never pulls the schema runtime in (same split
 * better-sidebar uses). The node half wraps these bounds into the volatile
 * schemastery Config; the client half clamps with the same constants.
 */

/** Settings namespace == loader entry id (SettingsForms names it after entry.options.id). */
export const PREFS_NAMESPACE = 'dsh-sidebar-hover'

export const HOVER_DELAY_DEFAULT_MS = 180
export const HOVER_DELAY_MIN_MS = 50
export const HOVER_DELAY_MAX_MS = 1000
export const HOVER_DELAY_STEP_MS = 50

export const GRACE_DISMISS_MS = 250
export const GESTURE_HOLD_MS = 300
export const RIGHTBAR_HOLD_MS = 1000

export interface SidebarHoverPrefs {
  readonly enabled: boolean
  readonly hoverDelayMs: number
  /** Back/forward session history arrows next to the sidebar toggle (darwin). */
  readonly historyArrows: boolean
}

export const PREFS_DEFAULTS: SidebarHoverPrefs = {
  enabled: true,
  hoverDelayMs: HOVER_DELAY_DEFAULT_MS,
  historyArrows: true,
}

/** Clamp + default an untrusted settings value into a valid delay. */
export function coerceHoverDelayMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return HOVER_DELAY_DEFAULT_MS
  const stepped = Math.round(n / HOVER_DELAY_STEP_MS) * HOVER_DELAY_STEP_MS
  return Math.min(HOVER_DELAY_MAX_MS, Math.max(HOVER_DELAY_MIN_MS, stepped))
}
