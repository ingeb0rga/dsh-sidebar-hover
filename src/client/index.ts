/**
 * Client half of dsh-sidebar-hover — glue only:
 *  1. register the locale dictionaries;
 *  2. mirror the volatile prefs from the host settings service;
 *  3. add the plugin's own Settings section ("Sidebar hover");
 *  4. run the pure state machine against the live sidebar;
 *  5. session history arrows + Cmd+[ / Cmd+] (navigator.ts, arrows.tsx).
 * Everything else lives in state-machine.ts / controller.ts / prefs-store.ts.
 */
import type { Context } from '@deepseek-ai/cordis'
import { installHoverController } from './controller.ts'
import { createPrefsController } from './prefs-store.ts'
import { SidebarHoverSection } from './settings-row.tsx'
import { installHistoryNavigator } from './navigator.ts'
import { installSettingsNavIcon } from './nav-icon.ts'
import { HistoryArrows } from './arrows.tsx'
import { LOCALE_NS, localeDict } from './locale.ts'

/** Services waited on before apply runs (feature packages, never imported). */
export const inject = ['slots', 'locale', 'layout', 'remote']

/**
 * The plugin manager re-syncs client modules on this page without a guaranteed
 * teardown of the previous generation, so `apply` must tolerate remnants of an
 * earlier application in the same realm. Both registries throw on duplicates:
 *  - locale: `locale namespace "<ns>" already has locale "<locale>"`;
 *  - slots:  `list slot "<slot>" already has an entry with id "<id>"`.
 * A duplicate means the same bundle version is already live — keeping the
 * existing registration is exactly right. Any other error still fails loud.
 */
function isDuplicateRegistrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('already has locale') || message.includes('already has an entry with id')
}

/** Run the client plugin. */
export function apply(ctx: Context): void {
  try {
    ctx.locale.register(LOCALE_NS, localeDict)
  } catch (error) {
    if (!isDuplicateRegistrationError(error)) throw error
  }

  const prefs = createPrefsController(ctx)
  ctx.effect(() => () => prefs.dispose(), 'dsh-sidebar-hover: prefs mirror')

  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () => {
        try {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-sidebar-hover',
              order: 110,
              label: () => String(ctx.locale.bind(LOCALE_NS)('nav')),
              locale: LOCALE_NS,
              inject: () => ({
                hooks: { prefs: prefs.store },
                setPrefs: (patch: { enabled?: boolean; hoverDelayMs?: number; historyArrows?: boolean }) => {
                  void prefs.setPrefs(patch)
                },
              }),
            },
            SidebarHoverSection,
          )
        } catch (error) {
          if (!isDuplicateRegistrationError(error)) throw error
          return () => {}
        }
      }),
    'dsh-sidebar-hover: settings section',
  )
  ctx.effect(
    () => installSettingsNavIcon(() => String(ctx.locale.bind(LOCALE_NS)('nav'))),
    'dsh-sidebar-hover: settings nav icon',
  )

  const navigator = installHistoryNavigator(ctx, prefs)
  ctx.effect(() => () => navigator.dispose(), 'dsh-sidebar-hover: history navigator')

  ctx.effect(
    () =>
      ctx.slots.inject('shell.overlay', () => {
        try {
          return ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-sidebar-hover.history-arrows',
              locale: LOCALE_NS,
              inject: () => ({
                hooks: { history: navigator.store, prefs: prefs.store },
                back: navigator.back,
                forward: navigator.forward,
              }),
            },
            HistoryArrows,
          )
        } catch (error) {
          if (!isDuplicateRegistrationError(error)) throw error
          return () => {}
        }
      }),
    'dsh-sidebar-hover: history arrows',
  )

  ctx.effect(() => {
    const controller = installHoverController(ctx, prefs)
    return () => controller.dispose()
  }, 'dsh-sidebar-hover: hover controller')
}
