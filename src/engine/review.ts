//! Game review: Stockfish looks at every position of a line, and every move is judged by
//! how much of the mover's winning chances it threw away (lichess's win-% model, which
//! is why a pawn dropped at +9 costs nothing and a pawn dropped at 0.0 costs a lot).
//!
//! Evaluations are cached per position and depth, so reviewing again after a few more
//! moves only looks at the new ones.

import { engineSafe, fenBefore, fenKey, gameEnd, load, type Line } from "../lib/chess";
import { lookup, type Opening } from "../lib/openings";
import { Engine, cpOf, winPercent, type Score } from "./engine";
import { isSacrifice, takesFreePiece } from "./sacrifice";

export type Classification =
  | "brilliant"
  | "book"
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export const CLASSES: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
];

export const CLASS_META: Record<Classification, { label: string; glyph: string; nag: string }> = {
  brilliant: { label: "Brilliant", glyph: "!!", nag: "!!" },
  great: { label: "Great", glyph: "!", nag: "!" },
  best: { label: "Best", glyph: "★", nag: "" },
  excellent: { label: "Excellent", glyph: "✓", nag: "" },
  good: { label: "Good", glyph: "·", nag: "" },
  book: { label: "Book", glyph: "≡", nag: "" },
  inaccuracy: { label: "Inaccuracy", glyph: "?!", nag: "?!" },
  mistake: { label: "Mistake", glyph: "?", nag: "?" },
  blunder: { label: "Blunder", glyph: "??", nag: "??" },
};

export type PosEval = { score: Score; best: string | null; second: Score | null };

export type PlyReview = {
  cls: Classification;
  /** Winning chances the move gave away, 0–100. */
  loss: number;
  accuracy: number;
  /** The engine's choice in the position before the move (UCI). */
  best: string | null;
};

export type SideSummary = {
  accuracy: number | null;
  acpl: number | null;
  counts: Record<Classification, number>;
};

export type Review = {
  depth: number;
  /** One per position: index 0 is the start, i + 1 is after ply i. */
  evals: (PosEval | null)[];
  plies: (PlyReview | null)[];
  sides: { w: SideSummary; b: SideSummary };
  /** Signature of the line reviewed — a review of another line never shows. */
  signature: string;
  complete: boolean;
};

const cache = new Map<string, PosEval>();

export const lineSignature = (line: Line) => line.startFen + "|" + line.plies.map((p) => p.uci).join(" ");

/** Is `review` about `line` (or a prefix of it, i.e. it can be extended)? */
export function reviewFits(review: Review | null, line: Line): boolean {
  if (!review) return false;
  const sig = lineSignature(line);
  return sig === review.signature || sig.startsWith(review.signature + " ");
}

export type ReviewJob = { cancel: () => void; done: Promise<Review | null> };

export function startReview(
  line: Line,
  depth: number,
  book: Record<string, [string, string]> | null,
  onProgress: (r: Review, done: number, total: number) => void,
): ReviewJob {
  const engine = new Engine();
  let cancelled = false;
  const fens = [line.startFen, ...line.plies.map((p) => p.fen)];
  const evals: (PosEval | null)[] = fens.map((f) => cache.get(fenKey(f) + "|" + depth) ?? null);

  const done = (async () => {
    engine.newGame();
    for (let i = 0; i < fens.length; i++) {
      if (cancelled) return null;
      if (!evals[i]) evals[i] = await evaluate(engine, fens[i], depth);
      if (cancelled) return null;
      if (evals[i]) cache.set(fenKey(fens[i]) + "|" + depth, evals[i]!);
      onProgress(summarise(line, evals, depth, book, false), i + 1, fens.length);
    }
    engine.terminate();
    return summarise(line, evals, depth, book, true);
  })();

  return {
    cancel: () => {
      cancelled = true;
      engine.terminate();
    },
    done,
  };
}

async function evaluate(engine: Engine, fen: string, depth: number): Promise<PosEval | null> {
  const end = gameEnd(fen);
  if (end.over) {
    return { score: end.mate ? { mate: 0, won: end.winner ?? undefined } : { cp: 0 }, best: null, second: null };
  }
  if (!engineSafe(fen)) return null;
  const r = await engine.search({ fen, depth, multiPv: 2 });
  if (!r || !r.lines[0]) return null;
  return { score: r.lines[0].score, best: r.bestmove, second: r.lines[1]?.score ?? null };
}

/** The mover's winning chances, 0–100. */
const moverWin = (s: Score, mover: "w" | "b") => (mover === "w" ? winPercent(s) : 100 - winPercent(s));

/** The mover's view of a score in centipawns (mate is ±10000). */
const moverCp = (s: Score, mover: "w" | "b") => cpOf(s) * (mover === "w" ? 1 : -1);

const sacrifices = new Map<string, boolean>();

/** `isSacrifice`, remembered — a running review re-judges every ply on each update. */
function sacrifice(fen: string, uci: string): boolean {
  const key = fen + " " + uci;
  let hit = sacrifices.get(key);
  if (hit === undefined) sacrifices.set(key, (hit = isSacrifice(fen, uci)));
  return hit;
}

/**
 * How bad a move that is not the engine's choice was. Between two centipawn scores it is
 * the winning chances lost, in chess.com's bands (2 / 5 / 10 / 20 of 100). A forced mate
 * on either side is judged by what is left instead: going from a mate to +8 is still
 * excellent, whatever the win-% curve says, and walking into a mate is graded by how soon.
 */
function byLoss(before: Score, after: Score, mover: "w" | "b", loss: number): Classification {
  const sign = mover === "w" ? 1 : -1;
  const pre = before.mate !== undefined && before.mate !== 0 ? before.mate * sign : null;
  const post = after.mate !== undefined && after.mate !== 0 ? after.mate * sign : null;
  const cp = moverCp(after, mover);

  if (pre !== null && post !== null) {
    if (pre > 0 && post < 0) return post < -3 ? "mistake" : "blunder";
    // The winner should get one move closer; the loser holding the distance is best.
    const slower = post - pre;
    if (slower < 0 || (slower === 0 && post < 0)) return "best";
    return slower < 2 ? "excellent" : slower < 7 ? "good" : "inaccuracy";
  }
  if (pre !== null && pre > 0) {
    // Let a mate go: what is left of the win?
    return cp >= 800 ? "excellent" : cp >= 400 ? "good" : cp >= 200 ? "inaccuracy" : cp >= 0 ? "mistake" : "blunder";
  }
  if (post !== null) {
    if (post > 0) return "best";
    return post >= -2 ? "blunder" : post >= -5 ? "mistake" : "inaccuracy";
  }
  return loss < 2 ? "excellent" : loss < 5 ? "good" : loss < 10 ? "inaccuracy" : loss < 20 ? "mistake" : "blunder";
}

/**
 * Could this move be Great or Brilliant at all? Not when it was forced (in check, or the
 * only move), not when the mover is worse after it, and not when the mover would have been
 * completely winning (+7 or a mate) with the next-best move anyway.
 */
function critical(fen: string, alt: Score | null, after: Score, mover: "w" | "b", promo: boolean): boolean {
  const board = load(fen);
  if (!board || board.inCheck() || board.moves().length <= 1) return false;
  if (promo) return false;
  if (moverCp(after, mover) < 0) return false;
  const fallback = moverCp(alt ?? after, mover);
  return fallback < 700;
}

function classify(
  line: Line,
  i: number,
  evals: (PosEval | null)[],
  book: Record<string, [string, string]> | null,
): PlyReview | null {
  const before = evals[i];
  const after = evals[i + 1];
  if (!before || !after) return null;
  const ply = line.plies[i];
  const mover = ply.color;
  const wb = moverWin(before.score, mover);
  const wa = moverWin(after.score, mover);
  const loss = Math.max(0, wb - wa);
  const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
  const opening: Opening | null = i < 40 ? lookup(book, ply.fen) : null;

  const fen = fenBefore(line, i);
  const top = !!before.best && ply.uci === before.best;
  // The best thing the mover had other than this move.
  const alt = top ? before.second : before.score;
  const end = gameEnd(ply.fen);
  const mates = end.over && end.mate;
  const open = !mates && critical(fen, alt, after.score, mover, ply.uci.length > 4);

  let cls: Classification;
  // A named opening position is "book" — unless the move still threw away a lot, which
  // a dubious gambit can (the name records that people play it, not that it is good).
  if (opening && loss < 20) cls = "book";
  else if ((top || loss < 1) && open && sacrifice(fen, ply.uci)) {
    // chess.com: "a good piece sacrifice" — the best move (or as good), leaving material
    // en prise, from a position that was neither lost after it nor already won without it.
    cls = "brilliant";
  } else if (top) {
    // The only good move: the next best would have thrown away a tenth of the game or
    // more — and this is not just taking a piece that was simply hanging, nor a mate.
    const gap = before.second ? wb - moverWin(before.second, mover) : 0;
    cls = open && gap >= 10 && moverCp(after.score, mover) < 9000 && !takesFreePiece(fen, ply.uci) ? "great" : "best";
  } else if (mates) cls = "best";
  else cls = byLoss(before.score, after.score, mover, loss);

  return { cls, loss, accuracy, best: before.best };
}

const emptyCounts = (): Record<Classification, number> => ({
  brilliant: 0,
  book: 0,
  best: 0,
  great: 0,
  excellent: 0,
  good: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
});

function summarise(
  line: Line,
  evals: (PosEval | null)[],
  depth: number,
  book: Record<string, [string, string]> | null,
  complete: boolean,
): Review {
  const plies = line.plies.map((_, i) => classify(line, i, evals, book));
  const wins = evals.map((e) => (e ? winPercent(e.score) : null));
  const n = line.plies.length;
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));

  const side = (color: "w" | "b"): SideSummary => {
    const counts = emptyCounts();
    let wSum = 0;
    let wAcc = 0;
    let hSum = 0;
    let k = 0;
    let cplSum = 0;
    plies.forEach((r, i) => {
      if (!r || line.plies[i].color !== color) return;
      counts[r.cls]++;
      // Weight each move by how volatile the game was around it (lichess's accuracy).
      const win = wins.slice(Math.max(0, i + 2 - windowSize), i + 2).filter((x): x is number => x !== null);
      const mean = win.reduce((a, b) => a + b, 0) / Math.max(1, win.length);
      const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, win.length));
      const weight = Math.max(0.5, Math.min(12, sd));
      wSum += weight;
      wAcc += r.accuracy * weight;
      hSum += 1 / Math.max(r.accuracy, 0.5);
      k++;
      const sign = color === "w" ? 1 : -1;
      const clamp = (s: Score) => Math.max(-1000, Math.min(1000, cpOf(s))) * sign;
      cplSum += Math.max(0, clamp(evals[i]!.score) - clamp(evals[i + 1]!.score));
    });
    if (k === 0) return { accuracy: null, acpl: null, counts };
    const weighted = wAcc / wSum;
    const harmonic = k / hSum;
    return { accuracy: (weighted + harmonic) / 2, acpl: Math.round(cplSum / k), counts };
  };

  return {
    depth,
    evals: [...evals],
    plies,
    sides: { w: side("w"), b: side("b") },
    signature: lineSignature(line),
    complete,
  };
}

/** How far a running review has got (null when none is running). */
export type ReviewProgress = { done: number; total: number } | null;
