# Development log

History, current state and open items for `dsh-sidebar-hover`. The behavior
spec is [dsh-sidebar-hover-plugin-task.md](./dsh-sidebar-hover-plugin-task.md);
the integration analysis is [FINDINGS.md](./FINDINGS.md).

## Current state (2026-10-06)

- **Version:** 0.1.22 on branch `release/0.1.22` (chain `release/0.1.13` → … → `0.1.22`; `main` is at 0.1.12). New versions go to their own branch. Not published to npm.
- **Repo:** `~/git/dsh-sidebar-hover`. Until 2026-10-06 the code lived in
  `~/Documents/deepseek-harness/default-workspace/dsh-sidebar-hover/`; the
  packed tarballs 0.1.0–0.1.11 are still there.
- **Installed:** desktop profile `~/.dsh/profiles/desktop` via
  `dsh plugin --profile desktop add file:<tarball>`. The profile's
  `package.json` / `pnpm-lock.yaml` point at a tarball inside the *old*
  workspace folder; do not delete it until the profile is re-pointed at a
  tarball packed from this repo.
- **Status:** 0.1.11 looks good in the user's first everyday use (desktop
  macOS); 0.1.15 (overlay, pin, toggle position) confirmed working by the
  user; 0.1.18 (history arrows placement, toggle-only reopen zone, own
  settings page) confirmed working, in extended testing since 2026-10-06. The
  [QA matrix](./QA-CHECKLIST.md) has not been run item by item.
- **Tests:** 47 vitest cases — state machine (36) + session history (11) (`npm test`),
  `tsc --noEmit` clean. The DOM controller has no automated tests — it is
  covered only by manual QA.

## Version history

Reconstructed from the packed tarballs (sources embedded in the source maps);
times are 2026-10-06 local.

| Version | Time | Change |
| --- | --- | --- |
| 0.1.0 | 08:10 | First build: pure `HoverRevealMachine`, DOM controller, `settings.general.item` row, prefs mirror over `ctx.remote.settings`, node half with volatile `Config`. |
| 0.1.1 | 08:35 | `'init'` origin: an already-open sidebar at startup is observed as the user's (inert), never adopted as a peek. Tolerate duplicate locale/slot registration when the plugin manager re-applies the client module. |
| 0.1.2 | 08:47 | Prefs: backoff retry while the entry is not yet visible to `describe`; settings row shows a `prefs: <detail>` diagnostic. |
| 0.1.3 | 09:08 | Prefs moved to a plugin-owned HTTP route (`/sidebar-hover/api`): on desktop `ctx.remote.settings.describe()` returns no namespaces. Node half calls `settings` in-process (dsh-better-sidebar pattern), host/origin fenced. |
| 0.1.4 | 09:24 | Route takes the method from the path (`/sidebar-hover/api/<method>`); clear "fully restart the app" error when an old node half answers 404. Settings row spacing. |
| 0.1.5–0.1.7 | 09:35–09:58 | Node-half fixes: declare `webServer`/`webRuntime` in `inject` (cordis guards service access), dispatch on the path method, `await` the handler. |
| 0.1.8 | 10:07 | Clicks on disclosure toggles (`aria-expanded`) no longer select-collapse. **Regression:** the controller itself set `aria-expanded` on the sidebar root, so every click matched and select-collapse never fired. |
| 0.1.9 | 16:05 | Zone hysteresis (enter 8 px / exit 24 px) against seat-edge jitter; all `[data-shell-leading]` seats are zones (better-sidebar mounts its own); console trace for user-attributed flips. |
| 0.1.10 | 21:19 | Fix the 0.1.8 regression: stop writing `aria-expanded` on the sidebar container. |
| 0.1.22 | 2026-10-07 | Publish prep: hover **on by default** (patch, node `Config`, client defaults); npm metadata (`repository`/`homepage`/`bugs`/`keywords`, author `ingeb0rga`), MIT `LICENSE`, `prepublishOnly` (typecheck + test + build); `@deepseek-ai/*` peers widened from exact `0.2.0-rc.2` to `>=0.2.0-rc.2 <0.3.0-0`. |
| 0.1.21 | 2026-10-07 | Settings nav icon: Lucide `panel-left` instead of the shell's fallback gear (`nav-icon.ts`, marker + mask, dsh-better-sidebar's technique). Hover row copy names the sidebar toggle, not the rail. |
| 0.1.20 | 2026-10-07 | Settings page restyled to the shipped General rows (14/20 title, 12/18 secondary description, centered controls, `border-l2` dividers). Hover delay is its own row with the primitives `Input` on the right, shown only while hover is on. Shortcut hint dropped from the arrows description (the shortcuts are listed in Keyboard shortcuts). |
| 0.1.19 | 2026-10-07 | Settings: the history-arrows shortcut hint (⌘[ / ⌘]) is its own no-wrap chunk, so it no longer splits across lines. |
| 0.1.18 | 2026-10-06 | Darwin reopen zone narrowed to the sidebar toggle icon (first button of the leading seat): hovering New Session no longer peeks. Replaces the 0.1.16 arrows-only exclusion. |
| 0.1.17 | 2026-10-06 | Fix 0.1.16: with the sidebar collapsed the back arrow overlapped New Session — the seat shift / clearance rules keyed on a `:has()` frame match that did not apply in the app. The arrows component now marks its AppFrame (`data-dsh-arrows-on`) while mounted; New Session matched by descendant `button:nth-of-type(2)`. |
| 0.1.16 | 2026-10-06 | Claude Code session history arrows ← → next to the sidebar toggle (darwin) + ⌘[ / ⌘]: plugin-kept back/forward stack over `uiWorkspace.selection`, navigation via `uiWorkspace.openSession()`. New `historyArrows` pref (default on). Settings moved from General rows to the plugin's own "Sidebar hover" settings page. |
| 0.1.15 | 2026-10-06 | Darwin: the sidebar toggle stays next to the traffic lights in every state (expanded top strip left-aligned at the seat offset, 88 px) instead of jumping to the sidebar's right edge on peek. |
| 0.1.14 | 2026-10-06 | Fix 0.1.13: the sidebar toggle was unclickable during a peek — Electron applies `-webkit-app-region` in DOM order regardless of z-index, so the chat header's drag strip (later in the DOM) covered the overlaid toggle. Center/right `[data-window-drag]` strips are no-drag while the overlay is up. |
| 0.1.13 | 2026-10-06 | Claude Code behavior: peek is an overlay (content never reflows); clicking the sidebar toggle during a peek pins it (inert until closed by click); Mod+B in a peek still closes. Console trace wording fixed. |
| 0.1.12 | 2026-10-06 | Width gate: hover off only when the window is < 1/3 of its screen's usable width (was a fixed 1024 px — a window tiled to half of a 1728 pt screen had no hover). Gate re-checked on pointer ticks for display changes. |
| 0.1.11 | 21:30 | Session `...` and other row controls no longer collapse the peek: activation click read on `document` in the bubble phase, after React's `stopPropagation`. Open menu/dialog (`[role=menu\|dialog\|alertdialog]`) holds the peek; Esc closes the menu first. 5 s lockout after a user toggle removed — re-peek is edge-triggered. Startup collapse when the feature is on. |

### 2026-10-06 debugging notes

- **Wrong upstream assumption.** An earlier agent session believed the
  installed package was a third-party market plugin (and looked at an
  unrelated GitHub repo, `qq-24/dsh-sidebar-hover`). It is this package; the
  "upstream report" idea was dropped.
- **Manual patches don't survive.** The 0.1.10 fix was first hand-patched into
  `~/.dsh/profiles/desktop/node_modules/dsh-sidebar-hover/lib/client.js`; a
  profile re-sync at 21:11 pruned the whole folder. Install only via
  `dsh plugin ... add file:<tarball>`.
- **"Hover doesn't work after restart" (fixed in 0.1.11).** DSH's layout store
  always starts with the sidebar open (`sidebar: 280`). The plugin saw it as
  the user's expansion (inert). Collapsing it by hand was an external flip and
  triggered the 5 s lockout, so hover appeared to need a long hold.
- **`...` closed the sidebar (fixed in 0.1.11).** The row-actions wrapper in
  `dsh-client-ui-workspace` calls `e.stopPropagation()`, but a capture-phase
  listener on the sidebar root runs before React's root dispatch. The menu
  portals to `<body>`, so moving into it also counted as leaving the peek.

### Deviations from the task spec

- **Mod+B 5 s lockout** (spec rule 4) — replaced by edge-triggered re-peek in
  0.1.11 (user decision). Explicit expansion still makes hover inert.
- **Startup collapse** — not in the spec; added in 0.1.11 (user decision).
- **Overlay peek + pin** — spec: peek expands the layout; toggle during a
  peek was "user wins" (collapse). Since 0.1.13: overlay, and the toggle pins
  (user decision: match Claude Code).
- **History arrows + own settings page** — not in the spec; added in 0.1.16
  (user request). Spec asked for a Settings → General row.
- **Width gate** — spec: off below 1024 px. Since 0.1.12: off below 1/3 of
  the screen width, resolution-independent (user decision).
- **Activation hooks** — no upstream activation events exist; select-collapse
  is a filtered `click` listener (see FINDINGS §7).
- **Per-workspace "+" (new session)** stops propagation, so it does not
  select-collapse since 0.1.11.

## Open items

- Run the full [QA-CHECKLIST](./QA-CHECKLIST.md), especially E8 (row menu,
  archive/delete confirm dialog), E9 (startup), D2–D4, B4/E6 (no lockout).
- Check that `dsh-better-sidebar` session rows do not `stopPropagation` on
  click (that would silently disable select-collapse for them).
- Decide whether the per-workspace "+" should select-collapse (would need an
  explicit allow-list, e.g. by `aria-keyshortcuts` / label).
- The overlay hold matches any visible menu/dialog on the page; consider
  scoping it to overlays opened while the peek is up.
- Re-point the profile at a tarball packed from this repo, then remove the
  old workspace folder (tarballs) and the abandoned
  `default-workspace/dsh-hover-sidebar/` skeleton.
- Overlay is untested live: check B1/B4/E10/E11 first (darwin vibrancy
  under an opaque fill, center header position, toggle pin).
- DOM controller, overlay and navigator have no automated tests (no jsdom
  in devDeps).
- History arrows untested live: QA H1–H7 (seat shift, header clearance,
  shortcut registration, `uiWorkspace.selection` subscription).
- The `dsh-better-sidebar` WebSocket `agent-opens` failures seen in the console
  are unrelated to this plugin.

## Publishing

Target: npm package `dsh-sidebar-hover` + GitHub `ingeb0rga/dsh-sidebar-hover`
+ an entry in the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
catalog, which feeds the dsh-market Plugin Market (see its `contributing.md`).

1. Public GitHub repo with the `dsh-plugin` topic; push `main`. The catalog CI
   requires the repo to be at least one day old.
2. `npm publish` from `main` (`prepublishOnly` typechecks, tests and builds
   `lib/`). The market links the package to the repo through `repository`.
   Since 0.1.22 later versions are published by CI: push a `v<version>` tag
   matching `package.json` and `.github/workflows/publish.yml` publishes via
   npm trusted publishing (GitHub OIDC, provenance attached, no token).
3. PR to awesome-dsh-plugin adding one file,
   `data/plugins/ingeb0rga__dsh-sidebar-hover.yml`:

   ```yaml
   url: https://github.com/ingeb0rga/dsh-sidebar-hover
   name: ingeb0rga/dsh-sidebar-hover
   category: ui
   description:
     en: Claude Code-style sidebar for the macOS desktop app — hovering the collapsed sidebar toggle peeks the sidebar over the content, selecting a session collapses it, clicking the toggle pins it; plus back/forward session history arrows (⌘[ / ⌘]).
   ```
