# AGENTS.md — working on the chess clapp

You're a coding agent in the **chess** clapp repo: a Clatch app with a native
SwiftUI **GUI** (for the human) and a **CLI** (for the agent) over **one shared,
`@MainActor` game state**. This file is your orientation. (`CLAUDE.md` points here.)

## Orient in 30 seconds

- macOS Swift/SwiftUI. `chess app` is the GUI process; `chess <verb>` is the CLI a
  Clatch agent drives. **No TCP port.**
- Two channels: the app's own **GUI↔CLI Unix socket** (`IPC.swift`) and the
  **Clatch↔App control pipe** (`ControlPipe.swift`). Both are wired and done.
- The state is the game: `AppState` holds a `Position` (see `Chess.swift`), whose
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

| id | type | when | payload |
|---|---|---|---|
| `move` | `run` | the **human** makes a move → wakes the agent to respond | `{san}` |
| `position` | `buffered` | **every** move (human or agent) → the live board in the agent's chat buffer | `{fen, last}` |
| `game.over` | `context` | the game ends on a human action | `{status, result}` |

`move`/`game.over` fire only on USER (GUI) actions — the agent knows its own moves.
`position` rides every move so the buffer always holds the current board (the FEN);
the agent can also read the truth via `chess board`.

## File map — the app vs the transport

| generic transport + design (keep as-is) | the chess app |
|---|---|
| `Bootstrap`, `ControlPipe`, `IPC`, `Resources/pieces` | `Chess` (engine), `AppState` (the game), `ContentView` (the board GUI), `Protocol` (wire shape), `main` (the verbs), `AppInfo` (identity) |

## Conventions & gotchas

- **macOS only.** `launch` has no cross-OS fallback; a Swift executable is macOS.
- **Ownership is server-side:** `AppState.move(by:)` rejects a move that isn't the
  actor's color or isn't its turn. The GUI is the human; the socket is the agent.
- **Sandbox-aware CLI errors** (in `IPC.swift`): `ENOENT`/`ECONNREFUSED` → "app is
  not running"; `EPERM`/`EACCES` → "blocked by the sandbox".
- **The board** (`ContentView`) renders cburnett **PNG** pieces
  (`Resources/pieces/cburnett`, `PieceArt` with a Unicode fallback) on a
  lichess-style green/cream board with a light native control bar.
- The **frozen, normative** contract (manifest + control pipe) is
  [docs/protocol.md](docs/protocol.md) — The Clapp Protocol. Protocol wins. (Clatch's
  own [`reference/`](https://github.com/arfium/clatch) specs cover launcher internals.)

## Operating the running app (the end-user's agent)

`chess --help` is the only manual. You own the color the human did **not** pick and
may move only on your turn. A `move` signal (run) means it's your turn: `chess board`
to read the position, then `chess move <uci>` to play. Verbs: `board` · `fen` ·
`legal [square]` · `move <uci>` · `say "<text>"` · `new [white|black|random]` ·
`resign` · `takeback [n]` · `focus` · `close`.
