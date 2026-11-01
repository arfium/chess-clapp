//! Chess arithmetic the window needs on its own: positions it is only LOOKING at (the
//! history, a variation, an imported game, an engine line). The live game's rules belong
//! to the Rust core; everything here is read-only analysis on top of chess.js.

import { Chess, type Move } from "chess.js";
import { squareIndex, squareName, type Side } from "../bridge";

/** One half-move of a line the window can display: the live game, a variation, an import. */
export type Ply = {
  san: string;
  uci: string;
  /** The position AFTER the move. */
  fen: string;
  from: number;
  to: number;
  color: Side;
};

export type Line = { startFen: string; plies: Ply[] };

/** chess.js, or null when the FEN is not a position it accepts (chaos mode can make those). */
export function load(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

export const turnOf = (fen: string): Side => (fen.split(" ")[1] === "b" ? "b" : "w");

/** The first four FEN fields — what makes two positions "the same" for openings/caches. */
export const fenKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** index 0 = a1 … 63 = h8, codes like "wP" — the same shape as the core's `board`. */
export function boardFromFen(fen: string): (string | null)[] {
  const out: (string | null)[] = Array(64).fill(null);
  const rows = (fen.split(" ")[0] ?? "").split("/");
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else if (file < 8 && rank >= 0) {
        const white = ch === ch.toUpperCase();
        out[rank * 8 + file] = (white ? "w" : "b") + ch.toUpperCase();
        file++;
      }
    }
  });
  return out;
}

/**
 * Can Stockfish be handed this position without crashing? The WASM build aborts — and
 * takes its worker down — on a position with a missing king, pawns on a back rank, or
 * the side NOT to move in check. Chaos mode produces all three.
 */
export function engineSafe(fen: string): boolean {
  const board = boardFromFen(fen);
  let wk = 0;
  let bk = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === "wK") wk++;
    if (p === "bK") bk++;
    if (p && p[1] === "P" && (sq < 8 || sq >= 56)) return false;
  }
  if (wk !== 1 || bk !== 1) return false;
  const g = load(fen);
  if (!g) return false;
  // The side that just moved must not be in check: flip the turn and ask.
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  const flipped = load(parts.join(" "));
  return !!flipped && !flipped.inCheck();
}

export function uciOf(m: Pick<Move, "from" | "to" | "promotion">): string {
  return m.from + m.to + (m.promotion ?? "");
}

/** Play one UCI move on `fen`; null when it is not legal there. */
export function playUci(fen: string, uci: string): Ply | null {
  const g = load(fen);
  if (!g) return null;
  try {
    const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return {
      san: m.san,
      uci: uciOf(m),
      fen: g.fen(),
      from: squareIndex(m.from),
      to: squareIndex(m.to),
      color: m.color,
    };
  } catch {
    return null;
  }
}

/** An engine PV (UCI) as plies, stopping at the first move that does not apply. */
export function pvToPlies(fen: string, pv: string[], max = 99): Ply[] {
  const out: Ply[] = [];
  let at = fen;
  for (const u of pv.slice(0, max)) {
    const p = playUci(at, u);
    if (!p) break;
    out.push(p);
    at = p.fen;
  }
  return out;
}

/** Legal destination squares from `sq` in `fen` (for the analysis board). */
export function legalTargets(fen: string, sq: number): number[] {
  const g = load(fen);
  if (!g) return [];
  try {
    return g
      .moves({ square: squareName(sq) as never, verbose: true })
      .map((m) => squareIndex(m.to));
  } catch {
    return [];
  }
}

export type GameEnd = { over: true; mate: boolean; winner: Side | null; reason: string } | { over: false };

export function gameEnd(fen: string): GameEnd {
  const g = load(fen);
  if (!g) return { over: false };
  if (g.isCheckmate()) return { over: true, mate: true, winner: g.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (g.isStalemate()) return { over: true, mate: false, winner: null, reason: "stalemate" };
  if (g.isInsufficientMaterial()) return { over: true, mate: false, winner: null, reason: "insufficient material" };
  return { over: false };
}

export function inCheck(fen: string): boolean {
  return load(fen)?.inCheck() ?? false;
}

// MARK: - Material

const VALUE: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const START_COUNT: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
const ORDER = ["Q", "R", "B", "N", "P"];

export type Material = {
  /** Pieces this side has CAPTURED (the opponent's missing pieces), most valuable first. */
  captured: Record<Side, string[]>;
  /** White's material minus Black's. */
  diff: number;
};

export function material(board: (string | null)[]): Material {
  const count: Record<string, number> = {};
  let diff = 0;
  for (const p of board) {
    if (!p) continue;
    count[p] = (count[p] ?? 0) + 1;
    diff += (p[0] === "w" ? 1 : -1) * VALUE[p[1]];
  }
  const missing = (side: Side) => {
    const out: string[] = [];
    for (const r of ORDER) {
      const n = Math.max(0, START_COUNT[r] - (count[side + r] ?? 0));
      for (let i = 0; i < n; i++) out.push(side + r);
    }
    return out;
  };
  return { captured: { w: missing("b"), b: missing("w") }, diff };
}

// MARK: - Notation

const FIGURINE: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };

/** "Nf3" → "♘f3" (figurine algebraic notation); promotions too: "e8=Q" → "e8=♕". */
export function figurine(san: string): string {
  return san.replace(/[KQRBN]/g, (c) => FIGURINE[c] ?? c);
}

/** "+0.4", "−1.2", "#3", "#−2" — always from White's point of view. */
export function formatScore(
  s: { cp?: number; mate?: number; won?: Side } | null | undefined,
  plain = false,
): string {
  if (!s) return "–";
  const minus = plain ? "-" : "−";
  if (s.mate !== undefined) {
    if (s.mate === 0) return s.won === "w" ? "1-0" : s.won === "b" ? "0-1" : "#";
    return s.mate > 0 ? `#${s.mate}` : `#${minus}${-s.mate}`;
  }
  const v = (s.cp ?? 0) / 100;
  if (Math.abs(v) < 0.05) return "0.0";
  return (v > 0 ? "+" : minus) + Math.abs(v).toFixed(1);
}

// MARK: - Import / export

export type Imported = { line: Line; headers: Record<string, string> };

/** Read a pasted FEN or PGN. Returns null when it is neither. */
export function parseImport(text: string): Imported | null {
  const t = text.trim();
  if (!t) return null;
  // A FEN is one line of six (or four) space-separated fields with seven slashes.
  if (!t.includes("\n") && (t.match(/\//g) ?? []).length === 7) {
    const fen = t.split(/\s+/).length === 4 ? t + " 0 1" : t;
    if (load(fen)) return { line: { startFen: load(fen)!.fen(), plies: [] }, headers: {} };
    return null;
  }
  const g = new Chess();
  try {
    g.loadPgn(t);
  } catch {
    return null;
  }
  // chess.js fills the seven-tag roster with "?" placeholders; an unknown tag is no tag.
  const headers = Object.fromEntries(
    Object.entries(g.getHeaders() as Record<string, string>).filter(([, v]) => v && v !== "?" && v !== "????.??.??"),
  );
  const verbose = g.history({ verbose: true });
  const startFen = verbose[0]?.before ?? g.fen();
  const plies: Ply[] = verbose.map((m) => ({
    san: m.san,
    uci: uciOf(m),
    fen: m.after,
    from: squareIndex(m.from),
    to: squareIndex(m.to),
    color: m.color,
  }));
  if (plies.length === 0 && !headers.FEN) return null;
  return { line: { startFen, plies }, headers };
}

export type PgnInfo = {
  white: string;
  black: string;
  result: string | null;
  /** Per-ply suffix annotation (NAG glyph like "?!") and a comment. */
  notes?: ({ glyph?: string; comment?: string } | null)[];
  opening?: string | null;
};

export function toPgn(line: Line, info: PgnInfo): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
  const head: [string, string][] = [
    ["Event", "Casual game"],
    ["Site", "Clatch Chess"],
    ["Date", date],
    ["White", info.white],
    ["Black", info.black],
    ["Result", info.result ?? "*"],
  ];
  if (info.opening) head.push(["Opening", info.opening]);
  if (line.startFen !== new Chess().fen()) {
    head.push(["SetUp", "1"], ["FEN", line.startFen]);
  }
  const body: string[] = [];
  const firstBlack = turnOf(line.startFen) === "b";
  let moveNo = Number(line.startFen.split(" ")[5] ?? "1") || 1;
  line.plies.forEach((p, i) => {
    if (p.color === "w") body.push(`${moveNo}.`);
    else if (i === 0 && firstBlack) body.push(`${moveNo}...`);
    const note = info.notes?.[i];
    body.push(p.san + (note?.glyph ?? ""));
    if (note?.comment) body.push(`{ ${note.comment} }`);
    if (p.color === "b") moveNo++;
  });
  body.push(info.result ?? "*");
  // Wrap at 80 columns, the way PGN readers expect.
  const lines: string[] = [];
  let cur = "";
  for (const tok of body) {
    if (cur.length + tok.length + 1 > 80) {
      lines.push(cur);
      cur = tok;
    } else cur = cur ? `${cur} ${tok}` : tok;
  }
  if (cur) lines.push(cur);
  return head.map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join("\n") + "\n\n" + lines.join("\n") + "\n";
}

/** "12." before a White move, "12…" before Black's — from the FEN the move was played in. */
export function moveLabel(fenBefore: string, color: Side): string {
  const n = Number(fenBefore.split(" ")[5] ?? "1") || 1;
  return color === "w" ? `${n}.` : `${n}…`;
}

/** The FEN a ply was played FROM. */
export function fenBefore(line: Line, i: number): string {
  return i === 0 ? line.startFen : line.plies[i - 1].fen;
}
