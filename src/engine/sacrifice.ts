//! Is a move a piece sacrifice? chess.com calls a Brilliant "a good piece sacrifice" and
//! publishes nothing more; this follows the reading WintrChess reverse-engineered from its
//! results (GPL-3.0 — the method, not the code): look at the board after the move and ask
//! whether one of the mover's pieces is now left en prise — whether or not the opponent's
//! best reply takes it — with the cases that are not real sacrifices taken out:
//!
//! - the move *rescued* material (fewer pieces hanging than before),
//! - taking the piece would cost the taker as much or more (a counter-threat, or mate),
//! - the piece was lost anyway (trapped), or the move only cashes in a trapped piece.
//!
//! Safety is a static count on the square — attackers (x-rays included) against the
//! recapturers left after the cheapest capture — not a search; the engine has already
//! said the move is good, this only says whether it *gives something*.

import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

type Unit = { type: PieceSymbol; color: Color; square: Square };
type Hit = { from: Square; to: Square; piece: PieceSymbol; color: Color; promotion?: PieceSymbol };

const other = (c: Color): Color => (c === "w" ? "b" : "w");

/** The same position with `side` to move — what that side could do if it were its turn. */
function turnTo(board: Chess, side: Color): Chess {
  const f = board.fen().split(" ");
  f[1] = side;
  f[3] = "-";
  return new Chess(f.join(" "), { skipValidation: true });
}

/** The enemy pieces that can take `u` right now (one per square), the king included. */
function takers(board: Chess, u: Unit): Hit[] {
  const enemy = other(u.color);
  const b = turnTo(board, enemy);
  const seen = new Set<Square>();
  const hits: Hit[] = [];
  for (const m of b.moves({ verbose: true })) {
    if (m.to !== u.square || seen.has(m.from)) continue;
    seen.add(m.from);
    hits.push({ from: m.from, to: m.to, piece: m.piece, color: enemy, promotion: m.promotion });
  }
  // A king still "attacks" a defended square, even though it may not legally take there.
  for (const sq of b.attackers(u.square, enemy)) {
    if (b.get(sq)?.type === "k" && !seen.has(sq)) hits.push({ from: sq, to: u.square, piece: "k", color: enemy });
  }
  return hits;
}

/** Every enemy piece bearing on `u`: the direct takers and those lined up behind them. */
function attackers(board: Chess, u: Unit): Hit[] {
  const all = takers(board, u);
  const seen = new Set(all.map((h) => h.from));
  const queue = all.map((h) => ({ fen: board.fen(), hit: h }));
  while (queue.length) {
    const { fen, hit } = queue.pop()!;
    if (hit.piece === "k") continue;
    const b = new Chess(fen, { skipValidation: true });
    b.remove(hit.from);
    for (const h of takers(b, u)) {
      if (seen.has(h.from)) continue;
      seen.add(h.from);
      all.push(h);
      queue.push({ fen: b.fen(), hit: h });
    }
  }
  return all;
}

/** Who would recapture on `u`'s square — after the capture that leaves the fewest. */
function defenders(board: Chess, u: Unit): Hit[] {
  let fewest: Hit[] | null = null;
  for (const t of takers(board, u)) {
    const b = turnTo(board, t.color);
    try {
      b.move({ from: t.from, to: t.to, promotion: t.promotion });
    } catch {
      continue; // the king's "capture" of a defended square
    }
    const back = attackers(b, { type: t.piece, color: t.color, square: t.to });
    if (!fewest || back.length < fewest.length) fewest = back;
  }
  if (fewest) return fewest;
  // No capture can be played: count the friends that would answer if it were an enemy piece.
  const b = new Chess(board.fen(), { skipValidation: true });
  b.put({ type: u.type, color: other(u.color) }, u.square);
  return attackers(b, { ...u, color: other(u.color) });
}

function isSafe(board: Chess, u: Unit, played?: Move): boolean {
  const direct = takers(board, u);
  const all = attackers(board, u);
  const guards = defenders(board, u);

  // Rook for two minors: a rook that just took a minor, hit once by a minor and defended.
  if (
    played?.captured &&
    u.type === "r" &&
    VALUE[played.captured] === 3 &&
    all.length === 1 &&
    VALUE[all[0].piece] === 3 &&
    guards.length > 0
  ) return true;

  if (direct.some((h) => VALUE[h.piece] < VALUE[u.type])) return false;
  if (all.length <= guards.length) return true;
  if (direct.length === 0) return true;
  const cheapest = Math.min(...direct.map((h) => VALUE[h.piece]));
  if (VALUE[u.type] < cheapest && guards.some((g) => VALUE[g.piece] < cheapest)) return true;
  // Held by a pawn: taking costs at least the piece that takes.
  return guards.some((g) => g.piece === "p");
}

/** `side`'s pieces (no pawns, no king) left en prise — beyond anything `played` just took. */
function hanging(board: Chess, side: Color, played?: Move): Unit[] {
  const took = played?.captured ? VALUE[played.captured] : 0;
  const out: Unit[] = [];
  for (const row of board.board()) {
    for (const p of row) {
      if (!p || p.color !== side || p.type === "p" || p.type === "k" || VALUE[p.type] <= took) continue;
      if (!isSafe(board, p, played)) out.push(p);
    }
  }
  return out;
}

/** Captures on `side`'s hanging pieces worth at least `worth`, other than the one on `skip`. */
function threats(board: Chess, side: Color, worth: number, skip: Square, played?: Move): string[] {
  return hanging(board, side, played)
    .filter((p) => p.square !== skip && VALUE[p.type] >= worth)
    .flatMap((p) => takers(board, p).map((h) => h.from + h.to));
}

const mateInOne = (b: Chess) => b.moves().some((san) => san.endsWith("#"));

/** After `move` (made by the side that owns or takes `u`), is something worth as much left open? */
function costsMore(board: Chess, u: Unit, move: Hit, onlyNew: boolean): boolean {
  const b = turnTo(board, move.color);
  const worth = VALUE[u.type];
  const before = onlyNew ? new Set(threats(b, move.color, worth, u.square)) : new Set<string>();
  let made: Move;
  try {
    made = b.move({ from: move.from, to: move.to, promotion: move.promotion });
  } catch {
    return false;
  }
  if (threats(b, move.color, worth, u.square, onlyNew ? made : undefined).some((t) => !before.has(t))) return true;
  // Taking a lesser piece walks into mate: the piece was never really on offer.
  return worth < VALUE.q && mateInOne(b);
}

/** Lost wherever it stands: unsafe here, and every move away is unsafe or costs more. */
function trapped(board: Chess, u: Unit): boolean {
  const b = turnTo(board, u.color);
  if (isSafe(b, u)) return false;
  return b.moves({ square: u.square, verbose: true }).every((m) => {
    if (m.captured === "k") return false;
    if (costsMore(b, u, { from: m.from, to: m.to, piece: m.piece, color: m.color, promotion: m.promotion }, true)) return true;
    const after = turnTo(b, u.color);
    const made = after.move({ from: m.from, to: m.to, promotion: m.promotion });
    return !isSafe(after, { ...u, square: made.to }, made);
  });
}

/** Does the move `uci`, played in `fen`, leave material en prise as a real sacrifice? */
export function isSacrifice(fen: string, uci: string): boolean {
  let before: Chess;
  let after: Chess;
  let move: Move;
  try {
    before = new Chess(fen);
    after = new Chess(fen);
    move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return false;
  }
  if (move.promotion) return false;
  const me = move.color;

  const was = hanging(before, me);
  const now = hanging(after, me, move);
  if (now.length === 0) return false;
  // Saving material is not giving it.
  if (!after.inCheck() && now.length < was.length) return false;

  // Every hanging piece is poisoned: whatever takes it leaves as much or more behind.
  if (now.every((u) => takers(after, u).every((t) => costsMore(after, u, t, false)))) return false;

  const wasTrapped = was.filter((u) => trapped(before, u));
  const nowTrapped = now.filter((u) => trapped(after, u));
  if (nowTrapped.length === now.length) return false;
  if (wasTrapped.some((u) => u.square === move.from)) return false;
  if (nowTrapped.length < wasTrapped.length) return false;
  return true;
}

/** Does the move `uci`, played in `fen`, just pick up a piece that was hanging? */
export function takesFreePiece(fen: string, uci: string): boolean {
  try {
    const board = new Chess(fen);
    const move = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!move.captured) return false;
    // En passant takes on a square the pawn does not stand on.
    const square = (move.flags.includes("e") ? move.to[0] + move.from[1] : move.to) as Square;
    return !isSafe(board, { type: move.captured, color: other(move.color), square });
  } catch {
    return false;
  }
}
