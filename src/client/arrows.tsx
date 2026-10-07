/**
 * Titlebar back/forward arrows (shell.overlay list entry). Positioned by the
 * navigator's stylesheet next to the sidebar toggle; darwin desktop only (the
 * seat geometry they align to exists only there).
 */
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { HistoryState } from './history.ts'
import type { PrefsSnapshot } from './prefs-store.ts'
import { ARROWS_ATTR, ARROWS_FRAME_ATTR } from './navigator.ts'
import type { HoverRevealStrings } from './locale.ts'

export interface HistoryArrowsProps {
  useHistory: (selector: (state: HistoryState) => HistoryState) => HistoryState
  usePrefs: (selector: (snapshot: PrefsSnapshot) => PrefsSnapshot) => PrefsSnapshot
  back: () => void
  forward: () => void
  t: (key: string) => HoverRevealStrings[keyof HoverRevealStrings] | string
}

export function HistoryArrows({ useHistory, usePrefs, back, forward, t }: HistoryArrowsProps): ReactNode {
  const history = useHistory((state) => state)
  const prefs = usePrefs((snapshot) => snapshot)
  const ref = useRef<HTMLDivElement | null>(null)
  const shown = document.documentElement.getAttribute('data-platform') === 'darwin' && prefs.historyArrows
  // Mark the AppFrame (parent of the shell overlay layer we render in) so the
  // seat/clearance rules apply exactly while the arrows are on screen.
  useLayoutEffect(() => {
    if (!shown) return
    const frame = ref.current?.closest('[data-shell-overlay]')?.parentElement
    if (!frame) return
    frame.setAttribute(ARROWS_FRAME_ATTR, '')
    return () => frame.removeAttribute(ARROWS_FRAME_ATTR)
  }, [shown])
  if (!shown) return null
  const strings = t('arrows') as HoverRevealStrings['arrows']
  return (
    <div ref={ref} {...{ [ARROWS_ATTR]: '' }}>
      <button
        type="button"
        aria-label={strings.back}
        title={`${strings.back} (⌘[)`}
        disabled={!history.canBack}
        onClick={back}
      >
        <IconChevronLeftOutlineRegular size={16} />
      </button>
      <button
        type="button"
        aria-label={strings.forward}
        title={`${strings.forward} (⌘])`}
        disabled={!history.canForward}
        onClick={forward}
      >
        <IconChevronRightOutlineRegular size={16} />
      </button>
    </div>
  )
}
