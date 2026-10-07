# dsh-sidebar-hover — Manual QA checklist

Status 2026-10-06: 0.1.11 looks good in the user's first everyday use on
desktop macOS; this matrix has not been run item by item yet.

Prereqs: plugin installed and **enabled** in Settings → Plugins; on the
plugin's page Settings → Sidebar hover the
toggle "Hover to reveal sidebar" **ON**. Default state of the toggle is ON —
verify that first (A0). `perf` notes reference the console (only one warning
line ever, and only on anchor failure).

## A. Gates

- [ ] **A0 Fresh default** — after install with no prior use: Settings →
  Sidebar hover exists in the nav and shows "Hover to reveal sidebar"
  **off**, delay 180 ms, "Session history arrows" **on**. General has no
  plugin rows. Hovering the
  collapsed rail does nothing (feature fully off: no listeners fire).
- [ ] **A1 Enable** — flip the toggle ON: no restart needed; hovering the rail
  now peeks.
- [ ] **A2 Disable mid-flight** — peek open, then flip the toggle OFF: the
  peek collapses immediately and hover does nothing afterwards.
- [ ] **A3 Delay input** — set 400 ms: peek now waits noticeably longer
  (boundary checks: 50 accepted, 50 → clamps/rounds per step 50, 1000 max;
  typing garbage leaves the last valid value).
- [ ] **A4 Persistence** — enable + set delay, restart the app: toggle still
  ON, delay retained (host settings document, survives restart).

## B. Desktop macOS (darwin: hidden ↔ peek ↔ rail)

Darwin collapses to **zero width** — the reopen zone is the titlebar leading
seat next to the traffic lights (`--dsh-frame-leading-clearance`).

- [ ] **B1a Zone** — collapsed: hovering New Session or the history arrows
  does NOT peek; only the sidebar toggle icon does.
- [ ] **B1 Hidden → peek** — hover the sidebar toggle icon in the leading seat: after ~180 ms the
  sidebar slides in OVER the content (opaque, shadow); the chat/center column
  and its header do not move or reflow; no jump of the titlebar drag strip.
- [ ] **B2 Peek → hidden** — move the pointer into the page and leave it
  there: sidebar closes after ~250 ms.
- [ ] **B3 Grace cancel** — leave and re-enter within 250 ms: stays open.
- [ ] **B4 Pin** — while peeked, click the sidebar's toggle button: the
  sidebar stays open and the content slides over to make room (pushed
  layout). Hover/leave/session clicks no longer close it. Click the toggle
  again: it closes; hovering the seat peeks again.
- [ ] **B4c Toggle position** — collapsed → peek → pin → close: the toggle
  icon stays in the same spot next to the green traffic light the whole time
  (windowed); fullscreen: stays at the left edge. Feature OFF: stock layout
  (icon at the sidebar's right edge when expanded).
- [ ] **B4b Drag regions** — while peeked, every sidebar control in the top
  strip (toggle, New Session) is clickable; after the peek closes, the chat
  header drags the window again.
- [ ] **B4a Mod+B in peek** — while peeked, Mod+B: sidebar closes; no
  re-peek while the pointer stays put; leave + re-enter peeks again.
- [ ] **B5 Leading seat flicker** — hover the leading seat and hold: the seat
  unmounts on expand — no flicker-loop, the pointer counts as inside the
  expanded sidebar.
- [ ] **B6 Fullscreen** — repeat B1 in fullscreen (leading clearance is
  smaller): zone still reachable.

## C. Web template (rail ↔ peek)

Web collapses to the **56 px rail**.

- [ ] **C1 Rail → peek** — hover the rail: peek after the delay.
- [ ] **C2 Peek → rail** — leave: closes after grace.
- [ ] **C3 Rail tooltips** — hover a rail control *briefly*: the stock
  tooltip still appears (tooltips untouched); moving into the tooltip area
  counts as inside (no premature collapse).
- [ ] **C4 Mod+B round-trip** — Mod+B (web: Mod+Alt+B) to open, hover rules
  stay inert until you Mod+B again; then hovering peeks.

## D. Select-collapse (both platforms)

- [ ] **D1 Session row** — peek open, click a session: session opens in the
  main panel AND the sidebar collapses immediately (no 250 ms wait).
- [ ] **D2 Workspace row** — activate a workspace from the workspace area:
  same immediate collapse.
- [ ] **D3 New Session** — click New Session (sidebar header) while peeked:
  new session + immediate collapse. The per-workspace "+" button stops
  propagation and does NOT collapse (known trade-off, see README).
- [ ] **D4 Settings** — open Settings from the sidebar footer while peeked:
  panel switches AND sidebar collapses.
- [ ] **D5 Esc** — Esc while peeking: collapses at once (and does not close
  anything else).
- [ ] **D6 User expansion respected** — with the sidebar pinned open by the
  user (not peeked), clicking rows / Esc must NOT collapse it.

## E. Holds and overrides

- [ ] **E1 Pointer hold** — pointer parked inside the open peek: never
  collapses, regardless of time.
- [ ] **E2 Keyboard focus hold** — Tab into the sidebar while collapsed:
  reveals immediately (no intent delay). Focus stays → stays open even if the
  pointer is away. Tab out (focus leaves the container) → grace dismiss.
- [ ] **E3 Mouse focus** — click into the sidebar with the mouse: no
  auto-reveal of a collapsed sidebar.
- [ ] **E4 Drag/scroll** — while peeked, scroll or drag inside the sidebar:
  no dismissal during the gesture; after the gesture ends with the pointer
  away, it dismisses.
- [ ] **E5 Right panel** — open the right panel (e.g. agent panel) while a
  peek is pending/open: our rules stand down (no fight); after ~1 s hover
  works normally again.
- [ ] **E6 Mod+B mid-peek** — hit Mod+B while our peek is open: sidebar
  collapses (user wins) and stays closed until the pointer leaves the zone
  and re-enters.
- [ ] **E7 Drag resize** — drag the sidebar edge wider while expanded (user
  action): hover rules don't interfere.
- [ ] **E8 Row menu** — while peeked, click a session's `...`: sidebar stays
  open, menu opens; move into the menu, Archive/Delete works; the confirm
  dialog keeps the peek; after the menu/dialog closes with the pointer
  outside, the peek collapses after ~250 ms. Esc closes the menu, not the
  peek.
- [ ] **E10 Click-opened sidebar** — collapsed, click the seat's open button
  before the hover delay: sidebar opens pushed (not overlay); hover rules
  inert until you close it by click.
- [ ] **E11 Right panel + overlay** — right panel open, peek: right panel
  keeps its width under the overlay; open/close the right panel during a
  peek: no broken grid.
- [ ] **E9 Startup** — feature ON, restart DSH: sidebar comes up collapsed,
  hover peeks immediately. Feature OFF: sidebar stays as DSH opens it.

## F. Environment matrix

- [ ] **F1 Right panel open + peek** — right panel docked, hover-peek the
  sidebar: both coexist, no geometry fight.
- [ ] **F2 Window width** — tile the window to 1/2 of the screen: hover
  works. Shrink below 1/3 of the screen: hover switches off and an owned peek
  collapses; widening re-arms it. Repeat on another display / resolution.
  In a < 1024 px window, opening the right panel closes the peek (DSH rule).
- [ ] **F3 Keyboard-only pass** — no mouse at all: Tab to the rail controls →
  reveal; activate a row with Enter → collapse; Esc works.
- [ ] **F4 Reduced motion** — macOS *reduce motion* ON: peeks/collapses snap
  without animation, timing rules unchanged.
- [ ] **F5 Full disable** — plugin disabled in Settings → Plugins: zero
  console warnings, Mod+B stock behavior.
- [ ] **F6 Plugin enable/disable live** — toggle the plugin in Settings →
  Plugins while the app runs: mounts/unmounts without restart, feature gate
  follows.

## G. Regression sweep

- [ ] **G1 Stock sidebar** — Mod+B, toggle button, drag-resize, rail
  tooltips, New Session, session switching, Settings open, right panel: all
  behave exactly as without the plugin (toggle OFF compare pass).
- [ ] **G2 Titlebar drag** — darwin: dragging the window via the top strip
  (including while hover zones are active) unaffected.
- [ ] **G3 Other plugins** — with better-sidebar (or any installed plugin)
  also enabled: no slot or service conflicts (our "Sidebar hover" page
  appears once, after "Side card").

## H. Session history arrows (darwin)

- [ ] **H1 Placement** — ← → sit right of the sidebar toggle, same spot when
  collapsed, peeking and pinned; collapsed, New Session sits right of them
  and the chat header does not overlap them (fullscreen too).
- [ ] **H2 Back/forward** — open A, B, C; ← goes B, A; → goes B, C. Open D
  after going back: → is disabled (forward branch dropped).
- [ ] **H3 Disabled state** — fresh launch: ← and → dimmed until you switch
  sessions.
- [ ] **H4 Shortcuts** — ⌘[ / ⌘] do the same, also with focus in the
  composer; at the ends they do nothing.
- [ ] **H5 Hover interplay** — hovering the arrows while collapsed does NOT
  peek; clicking them works; arrows stay clickable during a peek.
- [ ] **H6 Deleted session** — delete a session that is in history: ← skips
  it.
- [ ] **H7 Toggle off** — Settings → Sidebar hover → arrows OFF: arrows gone,
  seat/New Session back at stock positions, ⌘[ / ⌘] pass through.
