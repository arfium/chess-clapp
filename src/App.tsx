//! ArfChess — the window. A 1:1 port of `BoardView.swift`: a fixed 576 × 772 column of
//! player strip · board · player strip · controls, pinned to the light palette.
//!
//! View-local state (selection, orientation, the promotion sheet) lives here exactly as
//! it does in SwiftUI; everything else is the snapshot the Rust core hands back.

import { useEffect, useMemo, useState } from "react";
import {
  EMPTY,
  prefetchAssets,
  rankOf,
  squareName,
  useSnapshot,
  type ChessState,
  type Player,
  type Req,
  type Side,
} from "./bridge";
import { Board, PieceIcon } from "./Board";
import { Controls } from "./Controls";
import { PlayerStrip } from "./PlayerStrip";

const PROMO_TYPES: { letter: string; role: string }[] = [
  { letter: "q", role: "Q" },
  { letter: "r", role: "R" },
  { letter: "b", role: "B" },
  { letter: "n", role: "N" },
];

export default function App() {
  // Two writers feed this window: the return value of our own `run_cmd`, and the `state`
  // event the core pushes when an agent moves. They race — an invoke response that
  // resolves late is OLDER than a snapshot that has already been pushed — so every
  // snapshot carries a monotonic `rev` and `useSnapshot` (clappkit/web) drops the stale
  // one. Subscribe, first snapshot on mount, clean unsubscribe: all of it is in there.
  const { state, run } = useSnapshot<ChessState, Req>(EMPTY);
  const [selected, setSelected] = useState<number | null>(null);
  const [orientationWhite, setOrientationWhite] = useState(true);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [chaos, setChaos] = useState(false);

  // The core owns the chaos flag. Optimistic on click, but reconciled against EVERY
  // snapshot — a dropped or refused command can never leave the switch lying.
  useEffect(() => {
    setChaos(state.chaos === true);
  }, [state]);

  // Warm every roster avatar as it arrives, so seating an agent never flashes a monogram.
  useEffect(() => {
    prefetchAssets([
      ...state.agents.map((a) => a.avatar),
      state.white.avatar,
      state.black.avatar,
    ]);
  }, [state]);

  const player = (c: Side): Player => (c === "w" ? state.white : state.black);
  const bottomColor: Side = orientationWhite ? "w" : "b";
  const topColor: Side = orientationWhite ? "b" : "w";
  const isTurn = (c: Side) => state.status === "playing" && state.turn === c;
  const interactive = state.status === "playing" && player(state.turn).kind === "human";

  // ALWAYS the real legal moves — even in chaos, where you may land on a square with no dot.
  const targets = useMemo(() => {
    const out = new Set<number>();
    if (selected === null) return out;
    for (const m of state.legal) if (m.from === selected) out.add(m.to);
    return out;
  }, [selected, state.legal]);

  const play = (from: number, to: number, promoLetter: string | null) => {
    run({ cmd: "move", uci: squareName(from) + squareName(to) + (promoLetter ?? "") });
  };

  // BoardView.tap(_:) — ported line for line.
  const tap = (sq: number) => {
    if (selected !== null) {
      const canLand = chaos ? sq !== selected : targets.has(sq);
      if (canLand) {
        const piece = state.board[selected];
        if (piece && piece[1] === "P" && (rankOf(sq) === 7 || rankOf(sq) === 0)) {
          setPromo({ from: selected, to: sq });
          setSelected(null);
          return;
        }
        play(selected, sq, null);
        setSelected(null);
        return;
      }
    }
    const piece = state.board[sq];
    if (interactive && piece && piece[0] === state.turn) setSelected(sq);
    else setSelected(null);
  };

  const startNewGame = () => {
    const w = state.white.kind;
    const b = state.black.kind;
    if (w === "human" && b !== "human") setOrientationWhite(true);
    else if (b === "human" && w !== "human") setOrientationWhite(false);
    run({ cmd: "new" });
  };

  return (
    <div className="win">
      <PlayerStrip
        color={topColor}
        player={player(topColor)}
        agents={state.agents}
        isTurn={isTurn(topColor)}
        menuUp={false}
        onSeat={(who) => run({ cmd: "seat", color: topColor, who })}
      />

      <Board
        state={state}
        orientationWhite={orientationWhite}
        selected={selected}
        targets={targets}
        onTap={tap}
      />

      <PlayerStrip
        color={bottomColor}
        player={player(bottomColor)}
        agents={state.agents}
        isTurn={isTurn(bottomColor)}
        menuUp
        onSeat={(who) => run({ cmd: "seat", color: bottomColor, who })}
      />

      <Controls
        state={state}
        chaos={chaos}
        orientationWhite={orientationWhite}
        onNewGame={startNewGame}
        onTakeback={() => run({ cmd: "takeback", n: 1 })}
        onResign={() => run({ cmd: "resign" })}
        onEndGame={() => run({ cmd: "end" })}
        onChaos={(on) => {
          setChaos(on);
          run({ cmd: "chaos", on });
        }}
        onOrientation={setOrientationWhite}
      />

      {promo && (
        <div className="sheet">
          <div className="sheet__panel">
            {PROMO_TYPES.map((t) => (
              <button
                key={t.letter}
                type="button"
                className="promo"
                aria-label={t.role}
                onClick={() => {
                  play(promo.from, promo.to, t.letter);
                  setPromo(null);
                }}
              >
                <PieceIcon code={state.turn + t.role} side={64} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
