# chess

**Play chess against your agent.** A native macOS window for you, a CLI for the
agent, one live game. You pick a side; the agent takes the other. When you move,
the app wakes the agent to respond — it reads the real board and plays back, and
your board updates instantly.

A Clatch app has two faces over **one shared state**: a native **GUI** for the
human and a **CLI** for the agent. Clatch launches the app, gives it an identity,
and carries its signals to the agent — but it is **blind to the app's insides**.
Keeping the two faces in sync is the app's job, over a private Unix socket.

```
        ┌── native GUI ──┐   you click pieces
        │                │
   one live game ────────┤   ← single source of truth (AppState)
        │                │
        └──── CLI ───────┘   the agent runs `chess …` in a shell
```

## How a game flows

1. You (or the agent) start a game: **Play White / Play Black**, or `chess new white`.
2. You make a move in the window. The app fires a **`move` signal** — declared
   `run` in `clatch.json`, so Clatch **starts an agent turn**.
3. The agent reads the real position with `chess board`, thinks, and plays with
   `chess move e7e5`. Your board animates the reply.
4. The agent may drop you a note with `chess say "solid — I'll fight for the center"`.

The signal carries no game state — only that a move happened. The agent always
reads the truth from the CLI. (Ownership is enforced: each side may move only its
own color, only on its turn.)

## What's inside

- **One binary, two roles.** `chess app` is the GUI process; `chess <verb>` is a
  CLI client that talks to it. No second process, **no TCP port**.
- **The two channels, wired and working:**
  - the app's own **GUI↔CLI** Unix-domain socket (`IPC.swift`) — private to the app;
  - the **Clatch↔App control pipe** (`ControlPipe.swift`) — register, signal, ping, shutdown.
- **Typed signals** (the type lives in `clatch.json`, never on the wire):
  `move` (declared `run` — wakes the agent to take its turn) and `game.over`
  (declared `context` — queued into the agent's next turn).
- **The Steam-exact bootstrap** (`clatch_init`) so the app runs only under Clatch,
  plus the `CLATCH_STANDALONE=1` dev hatch.

The chess engine is self-contained (`Chess.swift`): legal moves, check/mate,
FEN, SAN — no dependencies.

## Quickstart (macOS)

```sh
npm run build                        # build the release binary
npm run verify                       # build + package + validate + socket test → one green check

# Try it without Clatch (the dev hatch):
CLATCH_STANDALONE=1 bin/chess app &  # opens the window (backgrounded)
bin/chess new white                  # you are White; agent is Black
bin/chess board                      # the agent's view of the position
bin/chess move e2e4                  # (as the side to move) make a move
bin/chess help                       # the agent's manual
```

### Install it for real (end users)

No source checkout — install from a published GitHub release:

```sh
clatch install github:arfium/chess-clapp          # latest release
clatch install github:arfium/chess-clapp@v0.1.0   # a specific version
```

(Or download `com.arfium.chess-macos-arm64.clapp` from the repo's **Releases** and
`clatch install <that file>`.) Then hand it to an agent:

```sh
clatch run com.arfium.chess
clatch agent grant <agent-name> app:com.arfium.chess
clatch agent send <agent-name> "you're playing chess with me — check chess --help, then respond to my moves"
```

(Dev-from-source path: `clatch install dist` after `npm run package`.)

| command | does |
|---|---|
| `npm run build` | compile the release binary |
| `npm run verify` | build + package + validate + prove the two surfaces talk |
| `npm run package` · `npm run validate` · `npm run pack` | dist folder · conformance oracle · `.clapp` depot |

## The agent's verbs

`chess --help` is the agent's only manual. Verbs: `board` · `fen` · `legal [square]`
· `move <uci>` · `say "<text>"` · `new [white|black|random]` · `resign` ·
`takeback [n]` · `focus` · `close`.

## Layout

```
chess/
├── clatch.json              the manifest (identity, launch, connector surface)
├── bin/chess                dev entrypoint (build-if-needed → exec); the compiled binary inside dist/
├── assets/icon.png          generated icon
├── scripts/                 verify.sh · package.sh · macos-*.sh · render-icon.swift
├── docs/                    ARCHITECTURE.md
├── AGENTS.md · CLAUDE.md    how an agent operates the app
└── native/
    ├── Package.swift
    └── Sources/chess/
        ├── AppInfo.swift    identity in ONE place (id, cli, signals)
        ├── Bootstrap.swift  clatch_init: run only under Clatch
        ├── ControlPipe.swift  Clatch↔App control pipe
        ├── IPC.swift          GUI↔CLI Unix socket
        ├── Theme.swift        the Clatch design system in SwiftUI
        ├── Chess.swift        the chess engine (rules, FEN, SAN)
        ├── Protocol.swift     the GUI↔CLI request/response + state DTOs
        ├── AppState.swift     the game — the single source of truth
        ├── ContentView.swift  the SwiftUI board (the human's face)
        ├── main.swift         dispatch + app delegate + CLI client
        └── Resources/fonts/   Plus Jakarta Sans (the Clatch UI typeface)
```

The window's chrome uses the **Clatch design system** (`Theme.swift`): the dark
"space" ground, the volt (`#e1ff00`) accent, Plus Jakarta Sans. The board keeps
its own classic green/cream.

## The three that must agree

`clatch.json`, `AppInfo.swift`, and the code agree on the app **id**
(`com.arfium.chess`), the CLI **name** (`chess`), and the **signal** vocabulary
(`move`, `position`, `game.over`, each with its type). `clatch validate` checks the
manifest; keep the code in lockstep.

> The frozen contract between Clatch and this clapp — the manifest and the control
> pipe — is **[docs/protocol.md](docs/protocol.md)** (The Clapp Protocol). It is the
> single normative source; Clatch implements it. Clatch's own
> [`reference/`](https://github.com/arfium/clatch) specs cover the launcher internals.
