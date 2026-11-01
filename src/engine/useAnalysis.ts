//! Live analysis of whatever position is on the board: the eval bar, the engine lines,
//! the best-move arrow. Debounced so scrubbing through a game does not thrash the
//! engine, and every result is tagged with the FEN it belongs to.

import { useEffect, useState } from "react";
import { engineSafe, gameEnd } from "../lib/chess";
import { analysisEngine, withHistory, type SearchInfo, type Score } from "./engine";

export type Analysis = {
  fen: string;
  info: SearchInfo | null;
  /** Set when the engine cannot or need not search: game over, or an impossible position. */
  terminal: { score: Score; reason: string } | null;
  unavailable: string | null;
  running: boolean;
};

const idle = (fen: string): Analysis => ({ fen, info: null, terminal: null, unavailable: null, running: false });

/** `path` is how the board got to `fen` (start FEN + UCI moves), for repetition-aware lines. */
export function useAnalysis(
  fen: string,
  enabled: boolean,
  multiPv: number,
  maxDepth: number,
  path?: { startFen: string; moves: string[] },
): Analysis {
  const [a, setA] = useState<Analysis>(() => idle(fen));

  useEffect(() => {
    if (!enabled) {
      analysisEngine().cancel();
      setA(idle(fen));
      return;
    }
    const end = gameEnd(fen);
    if (end.over) {
      const s: Score = end.mate ? { mate: 0, won: end.winner ?? undefined } : { cp: 0 };
      setA({ fen, info: null, terminal: { score: s, reason: end.reason }, unavailable: null, running: false });
      analysisEngine().cancel();
      return;
    }
    if (!engineSafe(fen)) {
      analysisEngine().cancel();
      setA({ ...idle(fen), unavailable: "Stockfish can’t read this position — it isn’t legal chess." });
      return;
    }
    let live = true;
    setA((prev) => (prev.fen === fen ? { ...prev, running: true } : { ...idle(fen), running: true }));
    const t = window.setTimeout(() => {
      void analysisEngine()
        .search({
          fen,
          history: path ? withHistory(fen, path.startFen, path.moves) : undefined,
          multiPv,
          depth: maxDepth || undefined,
          onInfo: (info) => {
            if (live) setA({ fen, info, terminal: null, unavailable: null, running: true });
          },
        })
        .then((res) => {
          if (live && res) setA({ fen, info: res, terminal: null, unavailable: null, running: false });
        });
    }, 90);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // `path` only ever changes together with `fen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, enabled, multiPv, maxDepth]);

  return a.fen === fen ? a : idle(fen);
}

/** The headline score of an analysis, White POV, or null when there is none yet. */
export function headline(a: Analysis): Score | null {
  if (a.terminal) return a.terminal.score;
  return a.info?.lines[0]?.score ?? null;
}
