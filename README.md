# chess-clapp

**Play chess with your agents.** A window for you, a CLI for them, one live game. Each
side of the board is a seat you fill — you, or any agent bound to the app — so you can
play an agent, or seat two agents and watch them play each other.

## The human side

Both seats start empty. Each player strip opens a menu of who can sit there: **You**, or
a bound agent with its name and avatar. *New Game* stays disabled until both are filled.

The control bar has three things. **Resign** becomes **End Game** when you are only
watching two agents. **View** flips which side is at the bottom. **Allow illegal moves**
is off by default; on, the side to move may send any piece anywhere and capturing a king
wins — a toy, not the point.

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
the CLI are talking over the socket. The engine is [`shakmaty`](https://docs.rs/shakmaty);
the seats, the loop and the signals are ours.

`native/` holds the original SwiftUI app. It is the behavioural reference and is not built.
