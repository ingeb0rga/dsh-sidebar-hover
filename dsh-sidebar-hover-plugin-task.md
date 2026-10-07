# Task: Hover-reveal sidebar for DeepSeek Harness (DSH) web client

You are implementing a client-UI extension for **DeepSeek Harness 0.2.0-rc.2** (Electron desktop app + web GUI). Goal: Claude-Code-style sidebar — hover over the collapsed rail reveals it, selecting a session collapses it again.

## Verified background (from shipped package READMEs — trust these, re-verify in code)

- App bundle: `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`; runtime under `/dsh/node_modules/@deepseek-ai/…` inside the asar.
- Relevant packages:
  - `@deepseek-ai/dsh-client-ui-layout` — owns the three-column AppFrame and **sidebar collapse state** (`ctx.layout`). Sidebar spans 264–420px (default 280px), collapsed state is a **56px rail**; below 1024px viewport it collapses automatically; layout state resets on reload.
  - `@deepseek-ai/dsh-client-ui-sidebar` — sidebar shell: brand row, New Session, collapse toggle, bottom-pinned Settings; seats `sidebar.workspaces` (ui-workspace) and `sidebar.settings`. Supports composition via `slots.inject()` ("a replacing package activate before or after the sidebar").
  - On macOS desktop (`html[data-platform='darwin']`, set by the desktop preload) a **collapsed sidebar hides the column entirely**; a `shell.leading` seat mounts reopen + New Session controls beside the traffic lights; frame publishes `--dsh-frame-leading-clearance`.
  - Toggle shortcut: **Mod+B** (Mod = Cmd on macOS). "Opening the right panel collapses a manually expanded sidebar" is the only existing auto-collapse rule.
  - `@deepseek-ai/dsh-web-frontend` ships **dist only** (built bundle; no sources in the asar).

## Step 0 — Integration investigation (do this FIRST, report before implementing)

Determine how a third party can add client-UI behavior. Investigate, then pick one route and document it:

- **Route A (expected): private frontend build.** Fork/rebuild the web composition: does the repo/composition allow adding or injecting an extra client package (`slots.inject()` before/after sidebar)? Find how `dsh-web-frontend` composes `dsh-client-ui-*` packages and whether a local build can be pointed at (dsh web / desktop host serves the built bundle; `dsh-host-frontend-static`).
- **Route B: runtime client plugin.** Check whether the client supports externally loaded UI modules at runtime (`dsh-client-modules`, plugin bundles patching client composition). If it exists, prefer it.
- Deliver a short findings note: chosen route, exact mechanism, where the code plugs in, build/deploy steps. Do NOT start feature coding before this note.

## Behavior specification

State machine with three sidebar states: `hidden` (darwin fully-collapsed), `rail` (56px), `expanded`. Add a transient `peek` = expanded-by-hover over a previously collapsed state.

1. **Hover reveal.** Pointer enters the collapsed rail (or, on darwin, the `shell.leading` reopen control zone) → after an intent delay of **180 ms** (configurable) transition to `peek` (expanded). Moving out before the delay elapses does nothing.
2. **Hover dismiss.** Pointer leaves the expanded sidebar while in `peek` → after a **250 ms** grace delay collapse back to the pre-peek state (`rail`, or `hidden` on darwin). Re-entering cancels the pending collapse.
3. **Select-collapses.** While in `peek`, these interactions collapse immediately (no delay): session row activated, workspace row activated, New Session activated, Settings opened. Implementation should hook the activation events, not simulate clicks. Escape hatch list must be easy to extend.
4. **Do NOT auto-collapse when:** pointer is back over the sidebar; keyboard focus is inside the sidebar (focus-visible counts as reveal trigger too — expand on rail control focus, collapse on focus leaving + blur); a sidebar drag/scroll gesture is in progress; the right panel just opened (leave the existing layout rule in charge); the user explicitly toggled with **Mod+B** within the last 5 s (explicit toggle wins; while explicitly expanded, hover rules are inert until the user collapses).
5. **Reduced motion.** Respect `prefers-reduced-motion` (the layout already disables transitions there — match it).
6. **Accessibility.** Rail controls keep existing tooltips/`aria-keyshortcuts`; expose the sidebar container state as `aria-expanded` in both states; `Esc` while in `peek` collapses.
7. **Settings.** Add "Hover to reveal sidebar" toggle (default **off**) plus hover-delay numeric input to Settings → General. Persist with the same settings mechanism the client already uses (preferences/`dsh.keybindings`-style storage — reuse, don't invent a store). No persistence of peek state across reloads needed (layout resets on reload by design).

## Constraints

- Do not modify collapse geometry, rail width, or the darwin titlebar/traffic-light contract (`data-window-drag`, `--dsh-frame-leading-clearance`).
- No changes to server-side packages; this is client-UI only.
- Keep the existing keyboard shortcut behavior untouched.
- Code style: match the surrounding `dsh-client-ui-*` packages (TypeScript, slot/`ctx` patterns). No new heavyweight deps.

## Deliverables

1. Findings note from Step 0 (route decision + integration steps).
2. Extension source (new client package or patch set), with the state machine isolated and unit-tested (hover intent, grace dismiss, select-collapse, Mod+B override, reduced-motion).
3. Build + install instructions for: (a) `dsh web`, (b) DSH desktop (macOS).
4. README describing behavior, settings, and known limitations.
5. Manual QA checklist covering: darwin hidden↔peek↔rail, web rail↔peek, right-panel interplay, <1024px viewport, keyboard-only navigation.

## Acceptance criteria

- Hover over collapsed rail opens sidebar within ~180 ms; leaving closes it after grace; clicking a session both switches AND collapses.
- Mod+B explicit toggle always wins over hover logic.
- No regression: rail geometry, Mod+B, right-panel auto-collapse, darwin titlebar controls all behave as before.
- Feature fully off when the new setting is disabled (default).
