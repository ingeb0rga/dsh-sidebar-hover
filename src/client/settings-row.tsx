/**
 * The plugin's own Settings section ("Sidebar hover" in the settings nav,
 * list slot `settings.section`): the "Hover to reveal sidebar" toggle, the
 * hover delay (only while hover is on) and the session history arrows
 * toggle. Row geometry and type copy the shipped General rows
 * (ui-settings-general: 16 px padding, 24 px gap, 14/20 title, 12/18
 * secondary description, 0.5 px `border-l2` under every row but the last);
 * reads/writes go through the prefs controller, which reaches the host
 * settings service via the plugin's own `/sidebar-hover/api` route —
 * no new store, no localStorage.
 */
import { Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import {
  HOVER_DELAY_MAX_MS,
  HOVER_DELAY_MIN_MS,
  HOVER_DELAY_STEP_MS,
} from '../shared/prefs.ts'
import type { PrefsSnapshot } from './prefs-store.ts'
import type { HoverRevealStrings } from './locale.ts'

export interface HoverRevealRowProps {
  usePrefs: (selector: (snapshot: PrefsSnapshot) => PrefsSnapshot) => PrefsSnapshot
  setPrefs: (patch: { enabled?: boolean; hoverDelayMs?: number; historyArrows?: boolean }) => void
  t: (key: string) => HoverRevealStrings[keyof HoverRevealStrings] | string
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 24,
  padding: '16px 0',
  borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
}

const lastRowStyle: CSSProperties = { ...rowStyle, borderBottom: 'none' }

const titleStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: '20px',
}

const descriptionStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
}

const detailStyle: CSSProperties = {
  ...descriptionStyle,
  color: 'var(--dsw-alias-label-tertiary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const controlStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 'none',
}

const unitStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-tertiary)',
}

function Row({ title, description, detail, last, children }: {
  title: string
  description: string
  detail?: string | undefined
  last?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <div style={last ? lastRowStyle : rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={titleStyle}>{title}</div>
        <div style={descriptionStyle}>{description}</div>
        {detail !== undefined && <div style={detailStyle}>prefs: {detail}</div>}
      </div>
      <div style={controlStyle}>{children}</div>
    </div>
  )
}

/** `settings.section` page: hover toggle, hover delay, history arrows toggle. */
export function SidebarHoverSection({ usePrefs, setPrefs, t }: HoverRevealRowProps): ReactNode {
  const prefs = usePrefs((snapshot) => snapshot)
  const row = t('row') as HoverRevealStrings['row']
  const arrows = t('arrowsRow') as HoverRevealStrings['arrowsRow']
  const unavailable = prefs.status === 'unavailable'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Row title={row.title} description={row.subtitle} detail={prefs.detail}>
        <Switch
          checked={prefs.enabled}
          disabled={unavailable}
          label={row.title}
          onChange={(next) => setPrefs({ enabled: next })}
        />
      </Row>
      {prefs.enabled && (
        <Row title={row.delayLabel} description={row.delayHint}>
          <Input
            type="number"
            aria-label={row.delayLabel}
            min={HOVER_DELAY_MIN_MS}
            max={HOVER_DELAY_MAX_MS}
            step={HOVER_DELAY_STEP_MS}
            value={prefs.hoverDelayMs}
            disabled={unavailable}
            style={{ width: 56 }}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next)) setPrefs({ hoverDelayMs: next })
            }}
          />
          <span style={unitStyle}>{row.delayUnit}</span>
        </Row>
      )}
      <Row title={arrows.title} description={arrows.subtitle} last>
        <Switch
          checked={prefs.historyArrows}
          disabled={unavailable}
          label={arrows.title}
          onChange={(next) => setPrefs({ historyArrows: next })}
        />
      </Row>
    </div>
  )
}
