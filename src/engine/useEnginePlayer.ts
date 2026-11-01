//! A Stockfish seat, played from the window. The core only keeps the seat; when the side
//! to move is one, this hook searches at that seat's level and sends the move back with
//! `engine: true` — the one actor the core lets move an engine seat.
//!
//! Exactly one search per position: the key is (ply count, FEN), and a snapshot that
//! moves on before the search returns (a takeback, a new game, the seat changed) cancels
//! it — the late answer is never sent.

import { useEffect, useRef, useState } from "react";
import type { ChessState, Req } from "../bridge";
import { engineSafe } from "../lib/chess";
import { playerEngine, withHistory } from "./engine";
import { levelInfo } from "./levels";

/** The least time a move takes, so even level 1 reads as a reply and not a reflex. */
const MIN_THINK_MS = 450;

export function useEnginePlayer(state: ChessState, run: (r: Req) => void): { thinking: boolean; stuck: boolean } {
  const seat = state.turn === "w" ? state.white : state.black;
  const active = state.status === "playing" && seat.kind === "engine";
  const key = active ? `${state.plies.length}|${state.fen}|${seat.level}` : "";
  const [thinking, setThinking] = useState(false);
  const [stuck, setStuck] = useState(false);
  const sent = useRef("");

  useEffect(() => {
    if (!key || sent.current === key) {
      setThinking(false);
      return;
    }
    if (!engineSafe(state.fen)) {
      setStuck(true);
      setThinking(false);
      return;
    }
    setStuck(false);
    setThinking(true);
    let live = true;
    const lv = levelInfo(seat.level);
    const started = performance.now();
    void playerEngine()
      .search({
        fen: state.fen,
        history: withHistory(state.fen, state.startFen, state.plies.map((p) => p.uci)),
        skill: lv.skill,
        depth: lv.depth,
        // On a clock, never spend more than a fair share of what is left.
        movetime: state.clock
          ? Math.max(
              60,
              Math.min(
                lv.movetime,
                (state.turn === "w" ? state.clock.white : state.clock.black) / 40 + state.clock.increment * 0.8,
              ),
            )
          : lv.movetime,
      })
      .then((res) => {
        if (!live || !res?.bestmove) return;
        const wait = Math.max(0, MIN_THINK_MS - (performance.now() - started));
        window.setTimeout(() => {
          if (!live) return;
          sent.current = key;
          run({ cmd: "move", uci: res.bestmove!, engine: true });
        }, wait);
      });
    return () => {
      live = false;
      playerEngine().cancel();
    };
    // `key` captures fen + ply + level; the rest is read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { thinking: active && thinking, stuck: active && stuck };
}
