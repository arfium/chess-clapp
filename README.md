# chess-clapp

**Play chess with your agents.** A window for you, a CLI for them, one live game. Each
side of the board is a seat you fill — you, or any agent bound to the app — so you can
play an agent, or seat two agents and watch them play each other.

## The human side

The rail on the left switches between four modes.

- **Play.** New Game sets up the whole game — Bullet, Blitz, Rapid or no clock, then play Stockfish (eight levels, ≈800 to
  3000+), any agent bound to the app, or a friend on the same board, as White, Black or
  at random — or watch any two of them. Start from the usual position or one from the
  Board Editor. In the game: drag or click to move, premove while the opponent thinks,
  Takeback, Hint, Resign, New Game.
- **Analysis.** Stockfish 18 runs inside the app (WebAssembly — nothing to install): eval
  bar, up to five lines, arrows. Every move you try becomes a variation in a real move
  tree; right-click to promote or delete. Load any PGN or FEN.
- **Board Editor.** Place pieces, choose the side to move and castling rights, paste a
  FEN; then Analyze or Play from Here.
- **Game Review.** Accuracy for both sides, every move judged, the evaluation graph, and
  the better move one click away.

Keys: ←/→ step, ↑/↓ start/end, **F** flip, **E** engine. Right-drag draws arrows. Themes:
Scoresheet, Night, Walnut (or the system's), twelve boards, twelve piece sets, recorded
board sounds. *Chaos Mode* (in New Game) lets any piece go anywhere; taking the king wins.

## The agent side

```sh
chess board                  # the position, and which colour you are
chess move e7e5              # UCI
chess legal e7               # what may move, and where
chess say "fighting for the centre"
chess new white              # also: fen · resign · takeback [n] · focus · close
```

`chess --help` is the whole manual, and it documents exactly the verbs `clatch.json`
declares. An undeclared verb can never be granted — `connector.commands` is the
permission grain.

## The loop, in one rule

On every move the app emits a `move` signal **targeted at the agent whose turn it now
is**. That is all there is to it: each move hands the turn to the other seat, so two
agents play on unattended. A human's turn is played in the window instead.

The signal carries no position. The agent reads the truth from `chess board`, always.

**A side can be moved only by its own occupant**, so in an agent-vs-agent game neither
side can move for the other, and an agent that wakes out of turn is told so.

## Build

```sh
npm run pack
```

`npm run verify` does the whole gate: build, package, validate, and prove the window and
the CLI are talking over the socket. `npm run dev:mock` opens the window in a browser
against a stand-in core, for working on the GUI. The engine is [`shakmaty`](https://docs.rs/shakmaty);
the seats, the loop and the signals are ours.

`native/` holds the original SwiftUI app. It is the behavioural reference and is not built.
