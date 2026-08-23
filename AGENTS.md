# AGENTS.md — working on the chess clapp

You're a coding agent in the **chess** clapp repo: a Clatch app with a desktop **GUI**
(for the human) and a **CLI** (for the agent) over **one shared game state**. This file
is your orientation. (`CLAUDE.md` points here.)

## Orient in 30 seconds

- **Rust + Tauri v2 + [`clappkit`](../clappkit)**, with a React/TypeScript webview.
  `chess app` is the GUI process; `chess <verb>` is the CLI a Clatch agent drives.
  **No TCP port.** The chess engine is `shakmaty`.
- `src-tauri/src/main.rs` is 19 lines: it hands argv to `clappkit::role::main_dispatch`,
  which runs the CLI on a fresh runtime or bootstraps into the GUI.
- **Two channels, neither of them app-owned code:** the app's own **GUI↔CLI** channel is
  `clappkit::ipc` (a Unix socket at `~/.chess/chess.sock`, a named pipe on Windows) and
  the **Clatch↔App control pipe** is `clappkit::control`. Both are wired and done.
- The state is the game: `Game` (`src-tauri/src/game.rs`) holds the position, whose turn
  it is, and the move history. The GUI and the CLI mutate it through the SAME
  `Game::handle`, so they never drift.
- `native/` is the **original SwiftUI app**, kept as the behavioural reference the port is
  checked against. It is not built and not shipped. Don't edit it to change behaviour;
  read it to learn what the behaviour is.

## Commands

| goal | command |
|---|---|
| build the shippable binary | `npm run build` (**not** `cargo build --release` — see below) |
| **prove it works** | `npm run verify` — build + package + validate + socket round-trip |
| package for Clatch | `npm run package` → `pkg/` (the depot; `dist/` is Vite's) |
| validate the contract | `npm run validate` *(needs `clatch` on PATH or `CLATCH_BIN`)* |
| build a `.clapp` depot | `npm run pack` |
| manifest ⇄ code agreement | `node scripts/check-manifest.mjs` (what CI runs) |
| the parity tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| re-render the icon | `sh scripts/render-icon.sh` (from `assets/icon.svg`) |

> **Never ship a bare `cargo build --release`.** The Tauri CLI is what turns on the
> `custom-protocol` feature that embeds the frontend; without it the release binary
> points the webview at `devUrl` and opens a white window. `scripts/lib.sh` explains it
> and `scripts/package.sh` asserts against it.

## The contract you must keep (Clapp Protocol 2)

The protocol major is whatever `clatch.json`'s `protocol` field says — today **2**.

- **Manifest** `clatch.json`: `connector.cli` is **mandatory**; `connector.signals`
  are typed — `{ "id", "type" }`, type ∈ **run | context | buffered**.
- **`app.toAgent`** carries `{id, type, target, payload}`. The `type` is stamped from
  your declaration (explicit intent on the wire); Clatch re-validates it against the
  manifest and **drops** a mismatch or an undeclared id.
- **`connector.commands` is the permission grain** (`Bash(chess <name>:*)`), so a verb
  the CLI answers but the manifest does not declare can never be granted — and one the
  manifest declares but `--help` does not document does not exist as far as the agent is
  concerned. Keep the three in step: manifest ⇄ `cli.rs` ⇄ `HELP`.
- **The things that must agree:** `main.rs` `APP_ID` == manifest `id` == `tauri.conf.json`
  `identifier`; `connector.cli` == the `[[bin]]` name == the `bin/chess` name; the signal
  ids in `game.rs` == `connector.signals`. `clatch validate` checks the manifest against
  the files on disk; **`scripts/check-manifest.mjs` checks it against the code** — run it.

## Signals this app emits

| id | type | when | target | payload |
|---|---|---|---|---|
| `move` | `run` | after any move, the side to move is an agent → wake it to play | **that agent's id** | `{san?, fen, turn}` |
| `position` | `buffered` | **every** move → the live board in each agent's chat buffer | broadcast | `{fen, last}` |
| `game.over` | `context` | the game ends (a move or a resignation) | broadcast | `{status, result[, winner]}` |

`move` is **targeted** at whoever must answer — by agent **id**, resolved from the
seat (`CLATCH_AGENT_ID` on the roster). A human seat is never woken (it plays in the
window), and the mover is never re-woken by its own move — so this one signal drives
both you-vs-agent and agent-vs-agent. `position`/`game.over` broadcast; the agent can
always read the truth via `chess board`.

## File map — the app vs the shared plumbing

| clappkit owns it (do not re-implement) | chess owns it |
|---|---|
| role dispatch (`role::main_dispatch`), the control pipe + roster (`Control`, `AgentRow`, `Emit`), the GUI↔CLI IPC (`ipc`), the window verbs `ping`/`focus`/`close` (`window` + `app::window_cmd`), the icon (`app::apply_icon`), the `asset` data-URI bridge, the `run_cmd`→`state` relay (`app::spawn_ipc`), the snapshot `rev` (`snapshot::next_rev`), and the front-end half — `useSnapshot` / `useAsset` / `prefetchAssets` / `agentTint` (`@clappkit`, a Vite alias onto `clappkit/web`) | `game.rs` (the game, the seats, chaos mode, the parity tests), `cli.rs` (the verbs, `--help`, the board printer), `app.rs`'s `apply` (one command → response + snapshot + signals), and the whole webview: `App.tsx`, `Board.tsx`, `PlayerStrip.tsx`, `Controls.tsx`, `styles.css` |

If you find yourself writing plumbing that is not about chess, it probably belongs in
clappkit — look there first. clappkit is a sibling directory shared by all five clapps,
so a change there is a change to all of them.

## Conventions & gotchas

- **Cross-platform, honestly.** `clatch.json` declares `macos` and `windows`, and those
  are the two the release builds — an OS key is a promise a release has to keep, so the
  manifest names no platform we do not ship. The code has no platform-specific paths;
  macOS is what has been built and run, Windows is reasoned. **Do not** add
  `windows_subsystem = "windows"` to `main.rs` — this one image is two roles, and that
  attribute silently kills the CLI role (no console, and the `.cmd` shim Clatch links onto
  the agent's PATH does not wait for a GUI-subsystem process). The comment at the top of
  `main.rs` is there to stop it being re-added.
- **Seats + ownership, server-side:** each side is a `Seat` (`Empty` | `Human` |
  `Agent(id)`), filled from the player strips. Both start **empty**; a game can't start
  until both are filled (`seatsReady`). `Game::play` lets a side be moved only by its
  occupant — a real agent (its `CLATCH_AGENT_ID`) is held to its own seat; the standalone
  dev hatch (no id) may move either side. Roster + avatars arrive on the control pipe's
  `app.agents` push, projected by `Control::roster()`.
- **Chaos toggle** (`Game.chaos`, default off): a GUI switch. When on, `move` skips
  legality/check (any of the mover's pieces to any square; a captured king wins) and the
  snapshot's `chaos` is true so `board` warns. Seat ownership is still enforced. The
  `end` command stops a game with no winner (the human's *End Game* while agents play).
- **The snapshot carries a `rev`** (`clappkit::snapshot::next_rev()`). Two writers feed
  the window — the `run_cmd` response and the pushed `state` event — and they race; the
  front end (`useSnapshot`) drops whichever is older. Keep stamping it in `snapshot()`,
  and keep taking the response and the pushed snapshot from the SAME lock (`app.rs`'s
  `apply` returns both in one `Reply`).
- **Sandbox-aware CLI errors** come from `clappkit::ipc`: "the app is not running" when
  nothing is listening, and a distinct message when the sandbox blocks the socket.
- **The board** renders cburnett pieces on a lichess-style green/cream board with a light
  native control bar — a 1:1 port of `BoardView.swift`. Visual parity with the Swift
  original has been audited and signed off: don't restyle it.
- The **frozen, normative** contract (manifest + control pipe) is
  [clappkit/docs/protocol.md](clappkit/docs/protocol.md) — The Clapp Protocol. Protocol wins. (Clatch's
  own [`reference/`](https://github.com/arfium/clatch) specs cover launcher internals.)
  The house standards for the icon and the release drill live once, in the template
  repo beside this one: `clappkit/docs/icons.md` and
  `clappkit/docs/playbook.md`. They are deliberately not copied here — one
  standard, one file. `scripts/render-icon.sh` implements the icon rule for this app.

## Operating the running app (the end-user's agent)

`chess --help` is the only manual. The human seats you on a side in the window; a
`move` signal (run) means it's your turn. `chess board` prints *"you are White/Black"*
and the position; then `chess move <uci>` to play. You may move only your seat's color
— the app enforces it, so in an agent-vs-agent game neither side can move for the
other. Verbs: `board` · `fen` · `legal [square]` · `move <uci>` · `say "<text>"` ·
`new [white|black|random]` · `resign` · `takeback [n]` · `focus` · `close`.
