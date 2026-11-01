# Changelog

All notable changes to chess. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: pre-1.0, minor
bumps may break (SemVer 0.x rules).

## [Unreleased]

### Added
- **Modes:** a rail with Play, Analysis, Board Editor and Game Review.
  - **New Game** chooses everything up front: Play (Stockfish 1–8, any agent, Pass and
    Play) with White / Random / Black, or Watch (any two of agents and Stockfish levels);
    a set-up position; chaos mode. Start Game seats both sides and starts.
  - **In the game:** Takeback, Hint (Stockfish's best move as an arrow), Resign, New
    Game; **premoves** while the opponent thinks.
  - **Board Editor:** piece palette, eraser, drag to move, side to move, castling
    rights, FEN in and out; Analyze or Play from Here.
  - **Analysis:** a real move tree — variations nest under the move they replace;
    right-click to promote or delete.
  - **Game Review** opens on the finished game, runs by itself, and judges each move
    ("Qxd4 is a blunder") with the better move one click away. **Brilliant** marks a sound
    sacrifice; every verdict has its own mark — a coloured disc with !!, !, ★, 👍, ✓, a book, ?!,
    ? or ?? — on the board, in the move list and in the tally.
- **Clocks and speeds:** Bullet (1, 1|1, 2|1), Blitz (3, 3|2, 5), Rapid (10, 15|10, 30) or
  no clock, chosen in New Game; clock faces on the nameplates; a flag ends the game
  (`timeout`, or a draw against a bare king). The clock runs in the core, so agents see
  it in `chess board`. Stockfish budgets its thinking time on a clock.
- **Core:** `new` accepts `fen` to start from a set-up position; `chess board` numbers
  moves from that position.
- **Stockfish 18 in the window** (lite single-threaded WASM, in a Worker): an eval bar,
  up to five engine lines with clickable moves, best-move arrows.
- **Stockfish as a player.** A seat can be `engine:<1-8>`; the window plays it. You vs
  Stockfish, an agent vs Stockfish, Stockfish vs Stockfish.
- **Game review:** per-side accuracy and ACPL, a verdict on every move (best, great,
  excellent, good, book, inaccuracy, mistake, blunder), the evaluation graph, turning
  points with the engine's alternative, and a PGN export that carries the verdicts.
- **An analysis board:** step through the moves, branch into variations, paste any PGN
  or FEN; opening names (lichess-org/chess-openings, CC0) for every position.
- **A designed window:** the framed board and a FIDE-style scoresheet side by side in the
  golden ratio; moves written in ballpoint, the form printed in graphite; Fibonacci
  spacing, concentric corners, Newsreader + IBM Plex (bundled). Window themes
  Scoresheet, Night and Walnut (or follow the system); twelve board colours with
  matching frames and coordinates on the frame; twelve piece sets; figurine notation;
  drag & drop with sliding pieces; right-click arrows and circles; captured material on
  the nameplates; a result slip; one-click pairings; keyboard navigation.
- **Recorded board sounds** (CC0 wooden pieces), conformed to lichess's standard set
  and played on lichess's cues.
- **Core:** threefold repetition is a draw (`drawReason`: `repetition` | `fifty` |
  `insufficient`); SAN carries `+`/`#`; the snapshot gains `plies` (UCI + FEN per
  half-move), `startFen`, `coachFrom`, and `level` on an engine seat. `chess board`
  names the engine's level and the reason for a draw.
- `npm run dev:mock` — the window in a browser against a chess.js stand-in for the core.

### Changed
- The window is resizable (1180 × 820 by default, 900 × 640 at least) with a
  full-height layout and, on macOS, an inset title bar. It is no longer a pixel copy of
  the Swift original.
- Taking back a move on your own turn against an agent or Stockfish undoes their reply
  too, so the turn comes back to you.

### Fixed
- **Settings drew empty previews** — in WebKit the window and board swatches collapsed to
  nothing. Settings is now a preferences window: pages down the side, and the Board page
  opens on a live board that shows every colour, piece and highlight choice as it is made.
- **The window re-subscribed to the system theme on every render** — dozens of times a
  second while the engine ran.
- **Dialogs lost focus while the engine ran** — every depth update re-ran the dialog's
  focus handling, pulling the cursor out of the PGN/FEN box mid-paste. Focus is now taken
  once, when the dialog opens.
- **The eval graph filled a straight wedge** instead of the area under the curve.
- **Brilliant now matches chess.com's rule** — "a good piece sacrifice" from the best
  move. The old check only counted material the engine's first reply took, so it missed
  pieces left en prise that the opponent must not take (Legal's 5.Nxe5) and counted ones
  that were lost anyway. Sacrifices are now read off the board (attackers, x-rays,
  recapturers, poisoned and trapped pieces), and "completely winning anyway" is judged by
  the next-best move, as chess.com does. Great follows the same gate.
- **Letting a mate go was a blunder** even when +8 was left (Morphy's 15.Bxd7+). A
  forced mate is now graded by what remains, not by the win-% curve.
- **Captured black pieces vanished on the dark themes** — on Night and Walnut they now
  carry a one-pixel light outline, so they read against the desk.
- **A PGN without player tags showed "?" for both names** — chess.js's placeholder tags
  are now dropped on import, so the plates read White and Black.

## [0.3.0] - 2026-08-23

### Changed
- **Ported from macOS Swift/SwiftUI to Rust + Tauri v2 on the shared `clappkit` crate.**
  Same app, same window, same verbs, same signals — a different implementation. The GUI
  is a Tauri webview (React + TypeScript) rendering the same board 1:1; the engine is
  now [`shakmaty`](https://docs.rs/shakmaty) instead of the hand-written `Chess.swift`;
  the code lives in `src-tauri/src/{main,app,cli,game}.rs` and `src/`. `clatch.json`
  gained `launch.windows` / `launch.linux` — the app is cross-platform now (macOS is
  what has been built and run; the other two are reasoned, not yet exercised).
  **`native/` stays in the repo** as the behavioural reference the port is checked
  against, not as the build.
- **The plumbing moved to `clappkit`** — one shared implementation instead of a copy per
  clapp. Deleted here and adopted from there: the role dispatch in `main.rs`
  (`role::main_dispatch`), the Dock/taskbar icon (`app::apply_icon`), the `asset`
  data-URI bridge (`asset::data_uri`, which also removes the `base64` dependency), the
  `ping`/`focus`/`close` window verbs (`window` + `app::window_cmd`), the
  `run_cmd`→`state` relay (`app::spawn_ipc`), the roster projection
  (`Control::roster()`, `AgentRow`), the signal batch (`Emit`, `Control::emit_all`), the
  snapshot revision (`snapshot::next_rev`), and — in the webview — the invoke/listen
  seam, the avatar cache and the rev-ordered snapshot wiring (`@clappkit`: `useSnapshot`,
  `useAsset`, `prefetchAssets`, `agentTint`).
- **`chess focus` now prints `window shown`** instead of `ok`, and the answer-then-exit
  grace on `close` is 150 ms (was 120 ms) — both from the shared window policy. Cosmetic;
  no verb changed shape.
- **`chess state` is gone**; use `chess board` (it was an undocumented alias that
  `clatch.json` never declared, so no agent could ever have been granted it). `--help`
  now documents exactly the ten declared verbs, and `node scripts/check-manifest.mjs`
  enforces that agreement.
- The response and the pushed snapshot are now taken under **one lock** (`app.rs`'s
  `apply` returns both), so the window can never be handed state from a different moment
  than the caller's reply.
- The depot is **`pkg/`**, not `dist/` — `dist/` is Vite's output, and the two used to
  overwrite each other. `npm run package` / `validate` / `pack` all target `pkg/`.

### Fixed
- **`assets/icon.png` and `src-tauri/icons/icon.ico` were stale renders** of
  `assets/icon.svg` — the pawn filled 66% × 81% of the canvas where the SVG says
  80% × 99%, so chess read visibly undersized next to the other clapps on the shelf, on
  every platform. Both are regenerated from the SVG by the new `scripts/render-icon.sh`.
- Removed the template-only `scripts/rename.sh`, `scripts/render-icon.swift` and the
  `/fork` command: in a shipped app the first renames it and the second overwrites its
  mark with a generic monogram plate.

### Added
- **Players are seats — you-vs-agent *or* agent-vs-agent.** Each side of the board is
  a seat you fill from the window (a player strip on top and bottom): **You**, or any
  bound agent shown with its **name and avatar** (from the control pipe's `app.agents`
  roster). The `move` (run) signal is now **targeted at the side-to-move's agent by
  id**, so seating two agents lets them play each other unattended — each move hands
  the turn to the other seat. **Ownership is enforced:** a side can be moved only by
  its occupant (a real agent is held to its `CLATCH_AGENT_ID`), and `chess board`
  reports the caller's own color. The window is a little smaller to make room for the
  strips. New: `Seat`/`AgentRow` in `Game`, `Game.setAgents` fed from `onAgents`, and
  a `chess render` subcommand for offscreen GUI previews.
  - Seats **start empty** (a dashed "Choose player" placeholder — no phantom "You"),
    and *New Game* stays disabled until both are filled.
  - **End Game** replaces **Resign** when no human is seated (you're watching two
    agents) — it stops the game with no winner (`Game.endGame`, status `ended`).
  - **Allow illegal moves** — a switch, **off by default**. On, the side to move may
    send any piece to any square (legality/check ignored; capturing a king wins);
    `StateDTO.chaos` surfaces it to the CLI. Strict chess remains the default.
  - **UI redesign** to expert standards: a compact **fixed-size** window pinned to a
    **light appearance** (never the system dark/light theme, which was flipping native
    controls and text to white-on-white); one shared gutter so the board, avatars,
    status and buttons align in a single column; a warm, theme-consistent palette
    (charcoal primary + an amber side-to-move accent — no green, no blue); robust
    no-photo avatar fallbacks (monogram / person / dashed-empty) on an opaque backing;
    a right-sized Dock icon; and native controls — a `Toggle(.switch)` for chaos and a
    `Picker(.segmented)` for board perspective (View: White / Black).

### Changed
- **Adopt the frozen Clapp Protocol** ([clappkit/docs/protocol.md](clappkit/docs/protocol.md)). The
  control pipe is now `app.toAgent {id, type, target, payload}` (the type is stamped
  from the declaration and re-validated by Clatch), `app.register {instanceToken}`,
  and `app.toAgentRefused {id, agent, reason}`; framing is fail-fast; a wired app
  exits when the pipe drops. `connector.signals` are `{id, type}`. `ControlPipe.swift`
  is the template's final transport verbatim.
- **The app IS [ArfChess](https://github.com/arfium/arfchess)**, pulled wholesale:
  its chess engine (`Chess.swift`), game state (`Game.swift`), and cburnett-PNG board
  (`BoardView.swift`; `PieceArt` with a Unicode fallback), plus the designed pawn icon.
  The board is a lichess-style green/cream Canvas with a light native control bar;
  self-styled (no Clatch Phosphor theme, no bundled fonts). `AppInfo` is the single
  identity source; only the transport (`ControlPipe`/`Bootstrap`/`IPC`) is the template's.

### Added
- **Release workflow** (`.github/workflows/release.yml`): pushing a `v*` tag builds
  the host `<id>-macos-arm64.clapp` depot + a `.sha256` and publishes them as a GitHub
  Release, so end users install with `clatch install arfium/chess-clapp[@vX]`
  (no source checkout).
- **`position` signal** (declared `buffered`): after **every** move — human or agent —
  the live board (FEN) rides the agent's chat buffer, so a "best move?" prompt arrives
  with the current position attached. This is the third signal type end to end
  (`move`=run, `position`=buffered, `game.over`=context).
- **`scripts/rename.sh`** — fork the template into your own app in one command
  (`scripts/rename.sh <cli> <id> "<Name>"`): renames the Sources dir, `bin/`,
  `AppInfo`, manifest, `Package.swift`, scripts, and the icon.
- **`scripts/verify.sh`** (`npm run verify`) — build + package + `clatch validate`
  + a GUI↔CLI socket round-trip, one PASS/FAIL. New npm scripts: `verify`, `rename`,
  `validate`, `pack`.
- **`.claude/`** vibe-coding helpers: a command allowlist (fewer permission prompts)
  and `/verify` + `/fork` slash commands. Plus `.editorconfig`.
- AGENTS.md is now the coding-agent's build/fork brain (orientation, commands, the
  Clapp v1 contract, the edit-vs-keep file map, conventions) with a short
  operate-the-demo section.

### Changed
- App-name strings in the Swift (`ContentView` header/monogram, `AppState`
  greeting) now read from `AppInfo.cli` — identity has ONE source, and the rename
  touches less.
- **Clapp v1 contract** (tracks Clatch #133): the manifest's `agent` block is now
  `connector`, and `connector.signals` declares each signal as `{name, type}`
  (`run` | `context` | `buffered`). The `app.toAgent` envelope is
  `{id, type, target, payload}` — `SignalMode`/`SignalKind` are gone from the
  Swift wire and `emitSignal` drops its `mode:`/`kind:` parameters; a signal's
  type is fixed by its declaration and can never be chosen at emission. `changed`
  is declared `context` (ordered, lossless queue), `poke` is declared `run`. The
  new `buffered` type (the agent's chat-buffer strip) is documented in
  ARCHITECTURE § Signals. Docs also drop the removed app-autostart mechanic and
  reflect that `connector.cli` is mandatory (`<cli> -h` is the floor).
- Design tokens track Clatch's **Phosphor** theme (its `design.css` default): the
  accent moves `#d2f900 → #e1ff00` (bright) and `#a8c900 → #378c69` (deep), the
  destructive `#ff4d2e → #ff0d00` (Blood), plus new `hazard2`/`accentInk` tokens.
  The app icon is regenerated on the Phosphor gradient. Workspace/dark tokens,
  radii, spacing, and the type scale are unchanged.

### Added
- Signal **targeting** (tracks Clatch #77): `ControlPipe.emitSignal` takes an
  optional `target: [String]` — empty broadcasts (unchanged), non-empty delivers
  only to the named agents (still bounded by the cut matrix). The CLI now forwards
  its `CLATCH_AGENT_ID` to the app (`Request.agent`), and `AppState` records the caller
  as `lastAgent`, so a fork can target the agent who invoked it. Documented in
  ARCHITECTURE § Targeting; the clock example uses it to wake exactly the agent who
  set each alarm.

## [0.1.0] - 2026-07-15

### Added
- Initial template: a one-binary, two-role Swift/SwiftUI Clatch app — a native GUI
  (the human) and an agent CLI over one `@MainActor` shared state
  ("don't imitate the screen, share the state").
- Both Clatch channels wired: the GUI↔CLI Unix socket (`IPC.swift`) and the
  Clatch↔App control pipe (`ControlPipe.swift`), plus the `clatch_init` bootstrap
  (run only under Clatch) and the `CLATCH_STANDALONE` dev hatch (`Bootstrap.swift`).
- Both signal modes demonstrated: `run` (wakes the agent now) and `context`/`log`
  (informs it).
- The Clatch design system in SwiftUI (`Theme.swift`), ported from the launcher's
  `design.css`: the dark "space" ground, the volt `#d2f900` accent, Plus Jakarta
  Sans (bundled TTF), and the `Panel`/`Eyebrow`/`Badge`/`VoltButtonStyle`/
  `ClatchFieldStyle` atoms.
- Packaging (`scripts/package.sh` → `dist/`) that passes `clatch validate`.
- Docs: README, ARCHITECTURE, TEMPLATE (fork guide), AGENTS/CLAUDE.
- Repo governance: Apache-2.0 license, `.github/` (CONTRIBUTING, SECURITY,
  CODEOWNERS), and macOS CI (`swift build`).

[Unreleased]: https://github.com/arfium/chess/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arfium/chess/releases/tag/v0.1.0
