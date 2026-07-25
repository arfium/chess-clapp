# AGENTS.md — working on the chess clapp

You're a coding agent in the **chess** clapp repo: a Clatch app with a native
SwiftUI **GUI** (for the human) and a **CLI** (for the agent) over **one shared,
`@MainActor` game state**. This file is your orientation. (`CLAUDE.md` points here.)

## Orient in 30 seconds

- macOS Swift/SwiftUI. `chess app` is the GUI process; `chess <verb>` is the CLI a
  Clatch agent drives. **No TCP port.**
- Two channels: the app's own **GUI↔CLI Unix socket** (`IPC.swift`) and the
  **Clatch↔App control pipe** (`ControlPipe.swift`). Both are wired and done.
- The state is the game: `Game` holds a `Position` (see `Chess.swift`), whose
  turn it is, and the move history. The GUI and the CLI mutate it through the SAME
  methods, so they never drift.

## Commands

| goal | command |
|---|---|
| build | `npm run build` |
| **prove it works** | `npm run verify` — build + package + validate + socket round-trip |
| package for Clatch | `npm run package` → `dist/` |
| validate the contract | `npm run validate` *(needs `clatch` on PATH)* |
| build a `.clapp` depot | `npm run pack` |

## The contract you must keep (Clapp v1)

- **Manifest** `clatch.json`: `connector.cli` is **mandatory**; `connector.signals`
  are typed — `{ "id", "type" }`, type ∈ **run | context | buffered**.
- **`app.toAgent`** carries `{id, type, target, payload}`. The `type` is stamped from
  your declaration (explicit intent on the wire); Clatch re-validates it against the
  manifest and **drops** a mismatch or an undeclared id.
- **The three that must agree:** `AppInfo.id` (`com.arfium.chess`) == manifest `id`;
  `AppInfo.cli` (`chess`) == `connector.cli` == the `bin/chess` name;
  `AppInfo.signals` (`move`, `position`, `game.over`) == `connector.signals`
  (id+type) == what you actually `emitSignal`. `clatch validate` checks the manifest;
  **nothing checks that the Swift matches it** — `npm run verify` is the guard.

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

## File map — the app vs the transport

| generic transport + design (keep as-is) | the chess app |
|---|---|
| `Bootstrap`, `ControlPipe`, `IPC` (transport) | `Chess` (engine), `Game` (state), `BoardView` (the board GUI), `Resources/pieces`, `Protocol` (wire shape), `main` (verbs), `AppInfo` (identity) — the app is ArfChess |

## Conventions & gotchas

- **macOS only.** `launch` has no cross-OS fallback; a Swift executable is macOS.
- **Seats + ownership, server-side:** each side is a `Seat` (`.empty` | `.human` |
  `.agent(id)`), filled from the player strips. Both start **empty**; a game can't start
  until both are filled (`seatsReady`). `Game.move(by:callerId:)` lets a side be moved
  only by its occupant — a real agent (its `CLATCH_AGENT_ID`) is held to its own seat;
  the standalone dev hatch (no id) may move either side. Roster + avatars arrive on the
  control pipe's `app.agents` push (`Game.setAgents`).
- **Chaos toggle** (`Game.allowIllegal`, default off): a GUI switch. When on, `move`
  skips legality/check (any of the mover's pieces to any square; a captured king wins)
  and `StateDTO.chaos` is true so `board` warns. Seat ownership is still enforced.
  `endGame()` stops a game with no winner (the human's *End Game* while agents play).
- **Sandbox-aware CLI errors** (in `IPC.swift`): `ENOENT`/`ECONNREFUSED` → "app is
  not running"; `EPERM`/`EACCES` → "blocked by the sandbox".
- **The board** (`BoardView`) renders cburnett **PNG** pieces
  (`Resources/pieces/cburnett`, `PieceArt` with a Unicode fallback) on a
  lichess-style green/cream Canvas board with a light native control bar.
- The **frozen, normative** contract (manifest + control pipe) is
  [docs/protocol.md](docs/protocol.md) — The Clapp Protocol. Protocol wins. (Clatch's
  own [`reference/`](https://github.com/arfium/clatch) specs cover launcher internals.)

## Operating the running app (the end-user's agent)

`chess --help` is the only manual. The human seats you on a side in the window; a
`move` signal (run) means it's your turn. `chess board` prints *"you are White/Black"*
and the position; then `chess move <uci>` to play. You may move only your seat's color
— the app enforces it, so in an agent-vs-agent game neither side can move for the
other. Verbs: `board` · `fen` · `legal [square]` · `move <uci>` · `say "<text>"` ·
`new [white|black|random]` · `resign` · `takeback [n]` · `focus` · `close`.
