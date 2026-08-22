# chess

**Play chess with your agents.** A desktop window for you, a CLI for them,
one live game. Each side of the board is a **seat** you fill from the window —
**You**, or any bound **agent** (shown with its avatar) — so you can play an agent,
or seat two agents and **watch them play each other**. Whoever's turn it is gets
woken to move; your board updates instantly.

A Clatch app has two faces over **one shared state**: a **GUI** for the human and a
**CLI** for the agents. Clatch launches the app, gives it an identity, and carries its
signals to the agents — but it is **blind to the app's insides**. Keeping the two faces
in sync is the app's job, over its own private socket (a Unix socket on macOS/Linux, a
named pipe on Windows — never a TCP port).

```
        ┌──── GUI ───────┐   you click pieces
        │                │
   one live game ────────┤   ← single source of truth (Game)
        │                │
        └──── CLI ───────┘   the agent runs `chess …` in a shell
```

## How a game flows

1. **Fill the seats.** Both sides start **empty**. Each player strip — opponent on top,
   you on the bottom — opens a menu: **You**, or any agent bound to the app (with its
   name and avatar). Seat two agents for agent-vs-agent. *New Game* stays disabled until
   both seats are filled.
2. **Start** with *New Game* (or `chess new white`). If an agent sits on the side to
   move, it is woken to play at once.
3. On every move the app fires a **`move` signal** — declared `run` in `clatch.json`
   — **targeted at the agent whose turn it now is**. A human's turn is played in the
   window; an agent's is played over the CLI. This one rule *is* the whole loop:
   each move hands the turn to the other seat, so two agents play on unattended.
4. The woken agent reads the real position with `chess board` (it prints *"you are
   White/Black"*), thinks, and plays with `chess move e7e5` — your board animates the
   reply. It may drop you a note with `chess say "I'll fight for the center"`.

The signal carries no game state — the agent always reads the truth from the CLI.
**Ownership is enforced:** a side can be moved only by its own occupant, so in an
agent-vs-agent game neither side can ever move for the other.

### Options in the control bar

- **Resign / End Game** — you get *Resign* when you're at the board; when you're only
  watching two agents it becomes *End Game* (stop with no winner).
- **View: White / Black** — a segmented control that flips which side is at the bottom.
- **Allow illegal moves** — a switch, **off by default**. On, the side to move may send
  any of its pieces to any square (legality and check are ignored — capturing a king
  wins). Meant as a toy; strict chess is the default.

## What's inside

- **Rust + [Tauri v2](https://tauri.app) on [`clappkit`](../clappkit)**, the shared crate
  every clapp is built from. The engine is [`shakmaty`](https://docs.rs/shakmaty) (legal
  moves, SAN, FEN, mate/stalemate); the seats, the agent-vs-agent loop, the signals and
  chaos mode are ours. The UI is React + TypeScript in the app's webview.
- **One binary, two roles.** `chess app` is the GUI process; `chess <verb>` is a CLI
  client that talks to it. No second process, **no TCP port**.
- **The two channels, both from clappkit** — neither is app-owned code any more:
  - the app's own **GUI↔CLI** channel (`clappkit::ipc`) — a Unix socket at
    `~/.chess/chess.sock`, a named pipe on Windows; private to the app, Clatch never
    sees it;
  - the **Clatch↔App control pipe** (`clappkit::control`) — register, roster, signal,
    ping, shutdown.
- **Typed signals** (the type lives in `clatch.json`, and clappkit stamps it on the wire):
  `move` (`run` — wakes the agent to take its turn), `position` (`buffered` — the live
  board in each agent's chat buffer) and `game.over` (`context`).
- **The Steam-exact bootstrap** (`clatch_init`, via `clappkit::role::main_dispatch`) so
  the app runs only under Clatch, plus the `CLATCH_STANDALONE=1` dev hatch.

`native/` still holds the original macOS **SwiftUI** implementation. It is no longer
built or shipped — it is kept as the **behavioural reference** the Rust port is checked
against (the parity tests in `src-tauri/src/game.rs` cite it).

**Platform honesty:** the code is cross-platform and `clatch.json` advertises macOS,
Windows and Linux. macOS is the platform this has actually been built and run on;
`scripts/package.sh` produces a correct Windows/Linux depot (including the `.exe` binary
and `.exe` `cliBin`), but nobody has yet run it on those.

## Quickstart

```sh
npm ci
npm run build                        # build the shippable binary (frontend embedded)
npm run verify                       # build + package + validate + socket test → one green check

# Try it without Clatch (the dev hatch):
CLATCH_STANDALONE=1 bin/chess app &  # opens the window (backgrounded)
bin/chess new white                  # you are White; agent is Black
bin/chess board                      # the agent's view of the position
bin/chess move e2e4                  # (as the side to move) make a move
bin/chess help                       # the agent's manual
```

> Build with `npm run build`, never a bare `cargo build --release`: the Tauri CLI is what
> enables the `custom-protocol` feature that embeds the frontend in the binary. A plain
> cargo build points the webview at the dev server and opens a white window on any
> machine that is not running `npm run dev` (scripts/lib.sh spells this out, and
> `scripts/package.sh` asserts the frontend really is embedded before packaging).

### Install it for real (end users)

No source checkout — install from a published GitHub release:

```sh
clatch install arfium/chess-clapp          # latest release
clatch install arfium/chess-clapp@v0.2.0   # a specific version
```

(Or download `com.arfium.chess-macos-arm64.clapp` from the repo's **Releases** and
`clatch install <that file>`.) Then hand it to an agent:

```sh
clatch run com.arfium.chess
clatch agent grant <agent-name> app:com.arfium.chess
clatch agent send <agent-name> "you're playing chess with me — check chess --help, then respond to my moves"
```

(Dev-from-source path: `clatch install pkg` after `npm run package`.)

| command | does |
|---|---|
| `npm run dev` | Vite dev server (with `npm run tauri dev` for the window) |
| `npm run build` | build the shippable binary — frontend embedded |
| `npm run verify` | build + package + validate + prove the two surfaces talk |
| `npm run package` · `npm run validate` · `npm run pack` | assemble `pkg/` · conformance oracle · `.clapp` depot |
| `node scripts/check-manifest.mjs` | the manifest and the code still agree (CI's gate) |
| `sh scripts/render-icon.sh` | re-render `assets/icon.png` + `src-tauri/icons/icon.ico` from `assets/icon.svg` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | the parity tests against the Swift original |

## The agent's verbs

`chess --help` is the agent's only manual, and it documents **exactly** the ten verbs
`clatch.json` declares — nothing more (an undeclared verb can never be granted, since
`connector.commands` is the permission grain). Verbs: `board` · `fen` · `legal [square]`
· `move <uci>` · `say "<text>"` · `new [white|black|random]` · `resign` ·
`takeback [n]` · `focus` · `close`.

## Layout

```
chess-clapp/
├── clatch.json              the manifest (identity, launch, connector surface)
├── bin/chess                dev entrypoint (build-if-needed → exec); the compiled binary inside pkg/
├── assets/icon.{svg,png}    the mark — icon.svg is the source, icon.png the render
├── scripts/                 build · package · validate · pack · verify (shared lib.sh) ·
│                            check-manifest.mjs · render-icon.sh · macos-*.sh
├── docs/                    protocol.md (normative) · ARCHITECTURE.md
├── AGENTS.md · CLAUDE.md    how an agent operates the app / orients in the repo
├── index.html · src/        the webview: App.tsx · Board.tsx · PlayerStrip.tsx · Controls.tsx
│                            · bridge.ts (the seam; the shared half is @clappkit)
├── src-tauri/
│   ├── Cargo.toml           depends on clappkit (features = ["tauri"]) + shakmaty
│   ├── tauri.conf.json      the window (576×772, fixed) + the .ico for Windows
│   ├── capabilities/        what the webview is allowed to call
│   └── src/
│       ├── main.rs          19 lines: clappkit::role::main_dispatch(APP_ID, …)
│       ├── app.rs           the GUI process — the Game behind a mutex, and `apply`
│       ├── cli.rs           the agent's CLI: verbs → the IPC envelope, and `--help`
│       └── game.rs          the game — the single source of truth, and its parity tests
└── native/                  the ORIGINAL SwiftUI app: the behavioural reference, not built
```

The board is ArfChess's own: a lichess-style green/cream board with cburnett pieces and
a light native control bar, ported 1:1 from the SwiftUI original. It is self-styled — no
Clatch Phosphor theme, no bundled fonts.

## The three that must agree

`clatch.json`, the Rust, and `--help` agree on the app **id** (`com.arfium.chess`), the
CLI **name** (`chess`), the **verbs**, and the **signal** vocabulary (`move`, `position`,
`game.over`, each with its type). `clatch validate` checks the manifest against the files;
**`node scripts/check-manifest.mjs` checks it against the code** — that it declares every
verb `cli.rs` answers, documents each one in `--help`, declares every signal `game.rs`
emits, and that the version is the same string in all four places it is written.

> The frozen contract between Clatch and this clapp — the manifest and the control
> pipe — is **[clappkit/docs/protocol.md](clappkit/docs/protocol.md)** (The Clapp Protocol). It is the
> single normative source; Clatch implements it. Clatch's own
> [`reference/`](https://github.com/arfium/clatch) specs cover the launcher internals.
