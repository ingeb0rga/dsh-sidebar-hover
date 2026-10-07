# Findings note — hover-reveal sidebar for DeepSeek Harness 0.2.0-rc.2

**Step 0 deliverable** (task: [dsh-sidebar-hover-plugin-task.md](./dsh-sidebar-hover-plugin-task.md)).
Written before implementation; inline notes mark where shipped code later
diverged (see [DEVELOPMENT.md](./DEVELOPMENT.md)). Question: which integration
route ships a hover-reveal sidebar? Answer: **Route B — runtime client plugin.** Verified against
the installed app (`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`) and the
public repo (github.com/deepseek-ai/deepseek-harness @ 5badb150).

## Route A (private frontend build) — rejected

- `dsh-host-frontend-static` serves a prebuilt SPA from a `distIndex` path
  (`dsh-host-frontend-static/lib/index.js`, `Config = z.object({ distIndex: … })`). Route A means
  rebuilding the whole `dsh-web-frontend` dist and pointing the config at it.
- Why not: it forks the entire upstream UI (5.7 MB dist), must be rebuilt on every DSH update,
  risks drift against `window.__DSH_BOOT__` wiring, and touches deploy config rather than a
  supported extension surface. Nothing about hover-reveal needs upstream sources.

## Route B (runtime client plugin) — selected, all seams verified in rc.2

1. **Manifest + loader.** `dsh.client = { platform: 'web', inject?, external?, immediately? }`,
   entry `exports['./client']`; validator `parseDshClient` — `dsh-client-modules/lib/client.js:61-75`.
   Bundle contract (confirmed verbatim in the working third-party plugin
   `~/.dsh/profiles/desktop/node_modules/dsh-better-sidebar/lib/client.js`):
   `window.__ModuleLoader__.load({ id, factory: (require) => { …; return module.exports; } })`.
2. **Module table (require externals).** Seed = `react`, `react/jsx-runtime`, `react-dom`,
   `react-dom/client`, `@deepseek-ai/cordis`, `dsh-client-store`, `dsh-client-ui-slots`,
   `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`
   (`dsh-web-frontend/dist/assets/index-5SrrfWpU.js:126`). Everything we import at runtime is in
   the seed. Feature-package services are *waited on*, never imported (`apply.inject`).
3. **Mount + install.** `dsh plugin --profile <name> add <pkg>@<version>` reconciles
   `dsh.profile.bundles` and auto-appends the package's `dsh.bundle.patch` (single `insert` row,
   same shape as better-sidebar's `cordis.patch.yml`). Entry id doubles as the settings namespace
   (`SettingsForms` names its namespace from `entry.options.id`).
4. **Layout control.** `ctx.layout` is a provided service (`ctx.reflect.provide("layout", …)`,
   `dsh-client-ui-layout/lib/client.js:600`) exposing `toggleSidebar()` — the same call Mod+B's
   registered command runs (`sidebar.left.toggle`, repo `ui-layout/src/client/index.ts:191-200`).
   `<1024px` it flips `narrowExpanded` instead (still a grid column, not an overlay). The original
   design disabled the feature below 1024px; since 0.1.12 the cutoff is 1/3 of the screen width. The store
   keeps no persisted sidebar width, so a toggle *pair* (expand then later collapse) is
   net-zero pref drift. No `layoutInfo` observable is exposed to plugins, so state observation is
   DOM-side (see 6).
5. **Settings (General page).** *Since 0.1.16 the plugin registers its own `settings.section`
   page ("Sidebar hover", order 110, same pattern as better-sidebar's "Side card") instead of
   General rows.* General = list slot `settings.general.item`
   (`GeneralSection.tsx:17-20`); third-party rows are supported — exact shipped pattern at
   `dsh-client-ui-settings-general/lib/client.js:941-977` (`slots.inject` → `slots.register`
   with `id`, `order`, `locale`, `inject` → props; `hooks.X` becomes `useX`). Persistence = the
   host settings service, **not** a new store: node half declares `Config` fields with
   `.volatile()` (DSH's `@deepseek-ai/schemastery` fork — public schemastery drops the volatile
   wrapper and live writes silently fail), client half reads/writes through
   `ctx.remote.settings.describe()/update(ns, patch, revision)`. **Superseded in 0.1.3:** on the
   desktop deployment `remote.settings.describe()` answers an empty namespace list, so the node
   half serves `POST /sidebar-hover/api/<method>` and calls `settings` in-process (the
   dsh-better-sidebar pattern; see README "Persistence"). Live invalidation:
   `ctx.remote.$on('settings/document-updated')` + `ctx.on('connection/reset')` — the same pair
   `ui-settings` uses for its mirror (`ui-settings/lib/client.js:1511-1521`). Node half calls
   `ctx.settings.configure({ auto: false })` (rc.2 `lib/index.js:370`) so no duplicate
   auto-generated settings page appears next to our General row.
6. **State observation (the one gap).** Plugins can't read `layoutInfo`, so peek logic observes
   the DOM contract of `AppFrame` (`dsh-client-ui-layout/lib/client.js:300-370`): frame carries
   `data-sidebar-collapsed`, `data-rightbar-collapsed`, `data-dragging`, `data-animating`; the
   darwin reopen seat is `[data-shell-leading]`, mounted only when darwin ∧ collapsed. Hashed
   CSS-module tokens (`_6Qf49G_frame`, `_3WPZCG_root`) are matched by suffix regex
   (`/_frame$/`, `/_root$/` inside the sidebar column), not hardcoded hashes, and the plugin
   fails dormant (warn once) if the anchors ever disappear.
7. **Activation clicks + keyboard.** No activation events exist upstream, so select-collapse uses
   a bubble-phase `click` listener on `document` (runs after React's root dispatch, so row
   controls that `stopPropagation` are skipped); clicks inside `[data-window-drag]`
   strips (darwin toggle, brand row) are excluded — the native toggle handles those.
   Keyboard: `focusin`/`focusout` with `:focus-visible` matching for the reveal/hold rules; Esc
   while peeking is a capture-phase `keydown`.
8. **a11y / motion.** Rail tooltips are upstream (`Tooltip` wraps rail buttons) and untouched.
   No `aria-expanded` on the sidebar container (removed in 0.1.10: it is not a disclosure control,
   and `closest('[aria-expanded]')` matched it for every click). Reduced motion is
   already handled by upstream CSS (`prefers-reduced-motion: reduce` kills frame transitions) —
   our width flips ride those transitions, so nothing to do in JS.
9. **Constraints honored.** No collapse geometry / rail width / darwin titlebar contract is
   modified (`data-window-drag`, `--dsh-frame-leading-clearance` untouched); client-UI only (the
   node half declares `Config`, suppresses the auto settings page and serves the prefs route —
   no other server behavior); Mod+B is upstream's command, we only observe its effect; single-seat slots
   (`sidebar.workspaces`, `sidebar.settings`) are never fought — we only add a `settings.general.item`
   list row. No new heavyweight deps: esbuild + vitest + typescript as devDeps; runtime imports
   are all seed modules.

## Locked design (short)

- Package `dsh-sidebar-hover`; entry id == settings namespace `dsh-sidebar-hover`.
- Config: `enabled: boolean = false (volatile)`, `hoverDelayMs: number = 180, min 50, max 1000 (volatile)`.
- Client: pure `HoverRevealMachine` (unit-tested, injected clock) + thin DOM controller
  (pointer zones by rect math, MutationObserver on frame attrs, focus/scroll/click/Esc listeners)
  + `settings.general.item` row (Switch + number input) + prefs mirror over the plugin's
  `/sidebar-hover/api` route (originally `ctx.remote.settings`, see 5).
- Toggle pairs through `ctx.layout.toggleSidebar()`; programmatic flips are tagged so external
  flips (Mod+B) route to the machine's explicit-toggle handling: inert while expanded; after a
  user collapse, re-peek is edge-triggered (pointer must leave and re-enter). The spec's 5 s
  lockout was dropped in 0.1.11 by user decision.

## Risks

| Risk | Mitigation |
| --- | --- |
| Hashed class anchors change in a future build | Suffix-regex anchors + fail-dormant with one console warning; version-pinned peer range |
| Module table seed changes | Only seed modules imported; services waited via `apply.inject` |
| Settings write conflicts | Revision-checked `update`, re-describe + one retry on `settings/conflict` |
| Hover loop on darwin (seat unmounts on expand) | Window-level pointermove + rect math, no element hover listeners |
