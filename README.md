# dsh-sidebar-hover

Hover-reveal sidebar for DeepSeek Harness — a runtime client plugin (client-UI
extension), modeled on Claude Code's sidebar. Hovering the collapsed sidebar
rail (or the macOS titlebar reopen zone) peeks the sidebar open **over the
content** after a short intent delay; leaving dismisses it after a grace
period; activating a session, workspace, New Session, or Settings collapses it
immediately. Clicking the sidebar toggle during a peek **pins** it open; a
sidebar opened or pinned by click ignores hover until it is closed by click.
Mod+B during a peek closes it.

Also adds Claude Code's **session history arrows** (← →) next to the sidebar
toggle on macOS, with ⌘[ / ⌘].

Settings live in their own page: **Settings → Sidebar hover**.

- "Hover to reveal sidebar" — ON by default; hover delay 50–1000 ms.
- "Session history arrows" — ON by default.

Tested on the DeepSeek Harness **desktop app for macOS**, `0.2.0-rc.2`.

| | Desktop (macOS) | Web (`dsh web`, browser) |
| --- | --- | --- |
| Hover peek | hover the sidebar toggle next to the traffic lights | hover the collapsed 56 px rail — **not tested live** |
| History arrows ← → | yes | no (macOS desktop only) |
| ⌘[ / ⌘] | yes | no (the browser owns them) |
| Settings → Sidebar hover | yes | same client code — **not tested live** |

Windows / Linux desktop builds are untested.
Current version **0.1.22**.

Docs:

- [DEVELOPMENT.md](./DEVELOPMENT.md) — version history, current state, open items;
- [FINDINGS.md](./FINDINGS.md) — integration analysis and the host seams the plugin rides on;
- [QA-CHECKLIST.md](./QA-CHECKLIST.md) — manual pass matrix;
- [dsh-sidebar-hover-plugin-task.md](./dsh-sidebar-hover-plugin-task.md) — original task spec.

## Behavior (rules → implementation)

| Rule | Implementation |
| --- | --- |
| Hover rail / darwin sidebar toggle icon → 180 ms intent → peek (New Session and the arrows next to it don't peek) | Window-level `pointermove` + zone rect math; intent delay configurable (50–1000 ms). |
| Peek floats over the content (no reflow) | `src/client/overlay.ts`: the layout really expands (so the sidebar renders wide), but the frame grid is pinned to its collapsed tracks via a `!important` rule on a CSS variable; the wide sidebar root overflows its collapsed column with an opaque fill + shadow. Layout CSS keyed on `[data-sidebar-collapsed]` (darwin leading clearance, center border) is mirrored. |
| Toggle icon stays next to the traffic lights (darwin) | While the feature is on, the sidebar's top strip left-aligns its toggle at the leading seat's offset (88 px; fullscreen already 12 px), so collapsed, peek and pinned all show it in one spot. |
| Toggle clicked during a peek → pinned | Document capture-phase `click` swallows the toggle click before React; the machine hands the expansion to the user (inert) and the grid animates from overlay to the pushed layout. Closing it by click (or Mod+B) re-enables hover. |
| Leave peek → 250 ms grace → collapse; re-enter cancels | Pure state machine (`src/client/state-machine.ts`), grace armed only when no hold applies. |
| Select-collapse (session/workspace row, New Session, Settings click), Esc in peek | Bubble-phase `click` on `document` (after React, so row controls that `stopPropagation` — session `...` menu, row actions — never collapse) + capture `keydown` Esc; never touches the user's own expansion. |
| Mod+B / toggle button wins | Frame `data-sidebar-collapsed` flips not initiated by us are reported to the machine as *external*. No timed lockout: peeks are edge-triggered, so a pointer still resting on the toggle gets no re-peek until it leaves and returns. |
| Startup | DSH always launches with the sidebar open; if the feature is on when prefs first load, the plugin collapses it once so hover works right away. Enabling the feature mid-session never collapses it. |
| Holds: pointer inside, keyboard focus, drag/scroll, right panel just opened, open menu/dialog (`[role=menu\|dialog\|alertdialog]`, portaled outside the sidebar) | All encoded as machine hold rules; `focus-visible` reveals immediately with no intent delay. |
| `prefers-reduced-motion` | Upstream CSS already disables frame/sidebar transitions — nothing for the plugin to do. |
| a11y | Rail tooltips/aria kept untouched; no `aria-expanded` on the sidebar container (it is not a disclosure control); Esc collapses a peek. |
| Session history arrows ← → (darwin) + ⌘[ / ⌘] | `navigator.ts`: DSH keeps no navigation history, so the plugin records every main-view selection (`uiWorkspace.selection`) in a browser-style back/forward stack (`history.ts`, max 100, session-scoped) and steps with `uiWorkspace.openSession()`. Arrows are a `shell.overlay` entry placed right of the toggle (left 124 px / fullscreen 48 px); collapsed, the seat's New Session and the content's leading clearance shift right by 68 px. Unopenable (deleted) entries are dropped. Shortcuts via `ctx.shortcuts` (desktop only), passed through when there is nowhere to go. |
| Own settings page "Sidebar hover" (toggle + delay, arrows toggle) | Host settings namespace `dsh-sidebar-hover` with volatile fields; reached through the plugin's own `/sidebar-hover/api` route (see "Persistence" below), no new store, no localStorage. |

Out of scope by design: collapse geometry, rail width, darwin titlebar
contract (`data-window-drag`, `--dsh-frame-leading-clearance`), Mod+B binding,
and anything outside the client UI.

## Layout of the package

```
src/
  shared/prefs.ts        namespaced constants + defaults + coercion
  node/index.ts          node half: schemastery Config (volatile) + settings-page suppression + /sidebar-hover/api route
  client/
    state-machine.ts     pure hover state machine (no DOM, injected clock)
    state-machine.test.ts  36 vitest cases: intent, grace, select-collapse, Mod+B, keyboard, holds, init, overlay, pin
    controller.ts        binds the machine to the live sidebar (DOM anchors, listeners)
    overlay.ts           overlay peek: frozen grid tracks + injected stylesheet, pin hand-off
    dom.ts               hash-agnostic DOM anchors + hover-zone geometry
    prefs-store.ts       prefs mirror over the plugin HTTP route (+ backoff retry, invalidations)
    settings-row.tsx     "Sidebar hover" settings section (hover toggle + delay, arrows toggle)
    history.ts           pure back/forward session history
    history.test.ts      11 vitest cases
    navigator.ts         history feed from uiWorkspace.selection, ⌘[ / ⌘] shortcuts, arrows CSS
    arrows.tsx           titlebar ← → buttons (shell.overlay entry)
    locale.ts            typed en/zh dictionaries
    index.ts             client glue (slots + effects only)
  types/dsh.d.ts         ambient service faces (compiled standalone)
```

## Persistence

The toggle and delay are **volatile fields** (`enabled`, `hoverDelayMs`) of the
plugin entry's own Config, under the settings namespace `dsh-sidebar-hover`
(the loader row id). Writes go through the host settings service and are
committed by the loader into the profile patch layer
(`~/.dsh/profiles/<name>/cordis.patch.yml`, `config:` block of the plugin row),
so they survive app restarts. The renderer cannot call the settings remote
directly here (on the desktop deployment `ctx.remote.settings.describe()`
answers an empty namespace list), so the node half — running inside the host
process — exposes two methods over a plugin-owned HTTP prefix route:

- `POST /sidebar-hover/api/prefs.get` → `{ok, value: {value, revision}}`;
- `POST /sidebar-hover/api/prefs.update` with `{payload: {patch, expectedRevision}}` → echoed view.

The route is fenced the same way dsh-better-sidebar fences its `/sidebar`
routes: Host must be loopback or a trusted authority of the deployment,
`sec-fetch-site: cross-site` is rejected, and a present `Origin` must match the
Host hostname. Revision mismatches surface as `settings/conflict` and the
client re-reads once.

## Build

Requirements: Node 20+ (developed on 26), npm. No pnpm needed.

```bash
cd ~/git/dsh-sidebar-hover
npm install          # esbuild install-script may need: npm install-scripts approve esbuild
npm run typecheck    # tsc --noEmit
npm test             # vitest run — state machine suite
npm run build        # lib/index.js (node half, ESM) + lib/client.js (client bundle)
npm pack             # dsh-sidebar-hover-<version>.tgz (git-ignored)
```

`lib/client.js` is a `window.__ModuleLoader__.load({ id, factory })`
closure-factory bundle with all `@deepseek-ai/*` + React externals left to the
host module table — the same shape the stock `tsdown.client.ts` produces.

## Install (desktop app, macOS)

From npm, through the profile's plugin manager (it runs pnpm in
`~/.dsh/profiles/desktop`):

```bash
dsh plugin --profile desktop add dsh-sidebar-hover
```

or from the Plugin Market. A local build installs the same way from the packed
tarball:

```bash
npm run build && npm pack
dsh plugin --profile desktop add file:$PWD/dsh-sidebar-hover-<version>.tgz
```

That records the `file:` spec in the profile `package.json` + `pnpm-lock.yaml`
and adds the package to `dsh.profile.bundles`. The bundle patch layer from
[cordis.patch.yml](./cordis.patch.yml) mounts the plugin row
(`id: dsh-sidebar-hover`, hover `enabled: true` by default).

- **Keep the tarball** at the recorded path: every profile re-sync re-resolves
  it, and a missing tarball breaks the sync.
- **Do not copy files into `node_modules` by hand**: the next re-sync prunes
  anything not listed in the profile `package.json` (this removed a manually
  patched 0.1.9 on 2026-10-06).
- Version bump = `npm pack` + the same `add` with the new tarball path.

Restart the app (plugin code is cached per process), then check
**Settings → Plugins** (`dsh-sidebar-hover` enabled) and
**Settings → Sidebar hover** (the plugin's own page).

## Install (web / `dsh web`)

Not tested live — see the support table at the top. Same commands against
the web profile:

```bash
dsh plugin --profile web add dsh-sidebar-hover
```

The web template
additionally has the `dev:web` watcher (`dsh-client-hmr`); with it running,
edits to `lib/client.js` hot-swap on reload thanks to the `/plugins` revision
route (`rev` = mtime/ctime/size hash).

## Uninstall / disable

- Runtime: Settings → Plugins → toggle the plugin off (writes `disabled` into
  the profile patch layer) — or just leave the "Hover to reveal sidebar" toggle OFF, which keeps
  the plugin mounted but fully dormant (no listeners, no DOM writes).
- Full removal: `dsh plugin --profile desktop remove dsh-sidebar-hover`, or
  delete the `- insert:` row + bundle entry manually.

## Known constraints

- DOM anchors are resolved hash-agnostically (`_[hash]_frame`,
  `_[hash]_sidebarCol`, `data-sidebar-collapsed`, `[data-shell-leading]`). If
  a future DSH build renames them the plugin fails **dormant** with one
  console warning — it never guesses twice or fights the UI.
- The overlay relies on DSH rc.2 internals: the frame's inline
  `grid-template-columns` (first track = sidebar), the sidebar toggle's
  `_toggle` class token and the drag handle's `data-side="sidebar"`. If these
  change, the peek may push the layout again or the pin click may fall
  through to the native toggle (collapse) — no hard failure.
- While a peek is open, the center/right column titlebar strips are not
  window-drag regions (Electron orders drag regions by DOM, not by stacking,
  so they would swallow clicks on the overlaid sidebar). Drag the window by
  an uncovered strip, or after the peek closes.
- Session history is in-memory: it starts empty on every app launch (seeded
  with the restored session) and is not shared between windows.
- The arrows render on macOS only (they align to the macOS leading seat).
  The ⌘[ / ⌘] (Ctrl+[ / Ctrl+]) shortcuts are registered for desktop builds
  only — not for the web template, where the browser owns them.
- Overlay geometry is frozen at peek start; it is re-read only when the right
  panel opens/closes/goes fullscreen.
- Hover reveal is off while the window is narrower than **1/3 of its
  screen's usable width** (`screen.availWidth`) — relative, so it holds for
  any resolution, scaling or display. Re-checked on resize and on pointer
  movement (moving to another display). Below 1024 px DSH's own sidebar
  stays a grid column (`narrowExpanded` toggle) — the plugin works there; DSH
  closes it itself when the right panel opens or the window crosses 1024 px,
  which the plugin treats as a user collapse.
- Select-collapse covers click activations that reach `document` (session
  rows, New Session, Settings trigger). Excluded on purpose:
  - disclosure / popup controls (`aria-expanded`, `aria-haspopup`) — a
    workspace row expanding its session list leaves the peek alive;
  - controls whose React handler calls `stopPropagation` — session/workspace
    `...` menus, unarchive, search clear, **and the per-workspace "+" (new
    session)**: that one no longer collapses the peek (known trade-off).
- Opening Settings or a new session via keyboard shortcuts while a peek is up
  is not intercepted — the peek then dismisses via grace like any other leave.
- Select-collapse only applies to a peek the plugin opened. A sidebar the
  user expanded (toggle, Mod+B) is never collapsed by clicks — by design.
- Overlay hold matches any visible `[role=menu|dialog|alertdialog]` in the
  document, not only ones opened from the sidebar.
