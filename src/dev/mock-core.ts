//! DEV ONLY (`npm run dev:mock`): a stand-in for `@tauri-apps/api/core` so the window can
//! be designed in a plain browser. It answers `run_cmd` with a snapshot shaped exactly
//! like the Rust core's, from a chess.js game, and plays the agent seats with random
//! legal moves. Never part of a build: vite.config.ts aliases it in `--mode mock` only.

import { Chess } from "chess.js";
import { emit } from "./mock-event";

type Seat = { kind: "empty" } | { kind: "human" } | { kind: "agent"; id: string } | { kind: "engine"; level: number };

const AGENTS = [
  { id: "a-claude", name: "Claude", model: "claude-opus-5-5", backend: "claude-code", avatar: null },
  { id: "a-codex", name: "Codex", model: "gpt-5-codex", backend: "codex", avatar: null },
];

let g = new Chess();
let white: Seat = { kind: "empty" };
let black: Seat = { kind: "empty" };
let status = "idle";
let result: string | null = null;
let winner: string | null = null;
let drawReason: string | null = null;
let chaos = false;
let rev = 1;
let coach: string | null = null;
let coachFrom: string | null = null;
// the clock (ms): left per side, increment, who runs since when
let clock: { initial: number; inc: number; w: number; b: number; running: "w" | "b" | null; since: number; started: boolean } | null = null;
const leftOf = (c: "w" | "b") => (clock ? Math.max(0, clock[c] - (clock.running === c ? Date.now() - clock.since : 0)) : 0);
function press(mover: "w" | "b", on: boolean) {
  if (!clock) return;
  if (clock.running) clock[clock.running] = leftOf(clock.running);
  if (clock.started) clock[mover] += clock.inc;
  clock.started = true;
  clock.running = on ? (mover === "w" ? "b" : "w") : null;
  clock.since = Date.now();
}
function stopClock() {
  if (clock?.running) clock[clock.running] = leftOf(clock.running);
  if (clock) clock.running = null;
}
setInterval(() => {
  if (status !== "playing" || !clock?.running || leftOf(clock.running) > 0) return;
  const side = clock.running;
  stopClock();
  clock[side] = 0;
  status = "timeout";
  winner = side === "w" ? "b" : "w";
  result = winner === "w" ? "1-0" : "0-1";
  emit("state", snapshot());
}, 100);

const sqi = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const seatOf = (c: string) => (c === "w" ? white : black);

function player(s: Seat) {
  if (s.kind === "human") return { kind: "human", name: "You" };
  if (s.kind === "engine") return { kind: "engine", name: "Stockfish", level: s.level };
  if (s.kind === "agent") {
    const a = AGENTS.find((x) => x.id === s.id);
    return { kind: "agent", id: s.id, name: a?.name ?? "Agent", model: a?.model ?? null, backend: a?.backend ?? null, avatar: null };
  }
  return { kind: "empty" };
}

function snapshot() {
  const board: (string | null)[] = Array(64).fill(null);
  g.board().forEach((row, i) =>
    row.forEach((p, j) => {
      if (p) board[(7 - i) * 8 + j] = p.color + p.type.toUpperCase();
    }),
  );
  const hist = g.history({ verbose: true });
  const last = hist[hist.length - 1];
  return {
    ok: true,
    rev: rev++,
    fen: g.fen(),
    turn: g.turn(),
    status,
    drawReason,
    result,
    winner,
    inCheck: status === "playing" && g.inCheck(),
    clock: clock ? { initial: clock.initial, increment: clock.inc, white: leftOf("w"), black: leftOf("b"), running: clock.running } : null,
    chaos,
    board,
    white: player(white),
    black: player(black),
    yourColor: null,
    last: last ? { from: sqi(last.from), to: sqi(last.to) } : null,
    legal: status === "playing" ? g.moves({ verbose: true }).map((m) => ({ from: sqi(m.from), to: sqi(m.to), promo: m.promotion ?? null })) : [],
    moves: hist.map((m) => ({ san: m.san, color: m.color })),
    plies: hist.map((m) => ({ uci: m.from + m.to + (m.promotion ?? ""), fen: m.after, from: sqi(m.from), to: sqi(m.to) })),
    startFen: hist[0]?.before ?? g.fen(),
    coach,
    coachFrom,
    seatsReady: white.kind !== "empty" && black.kind !== "empty",
    hasHuman: white.kind === "human" || black.kind === "human",
    agents: AGENTS,
  };
}

function updateStatus() {
  if (g.isCheckmate()) {
    status = "checkmate";
    winner = g.turn() === "w" ? "b" : "w";
    result = winner === "w" ? "1-0" : "0-1";
  } else if (g.isStalemate()) {
    status = "stalemate";
    result = "1/2-1/2";
  } else if (g.isDraw()) {
    status = "draw";
    result = "1/2-1/2";
    drawReason = g.isThreefoldRepetition() ? "repetition" : g.isInsufficientMaterial() ? "insufficient" : "fifty";
  }
}

let agentTimer: number | undefined;
function kickAgent() {
  window.clearTimeout(agentTimer);
  const s = seatOf(g.turn());
  if (status !== "playing" || s.kind !== "agent") return;
  agentTimer = window.setTimeout(() => {
    const moves = g.moves();
    if (status !== "playing" || moves.length === 0) return;
    g.move(moves[Math.floor(Math.random() * moves.length)]);
    coach = Math.random() < 0.25 ? "Going for the centre." : null;
    coachFrom = coach ? (s as { id: string }).id : null;
    updateStatus();
    press(g.turn() === "w" ? "b" : "w", status === "playing");
    emit("state", snapshot());
    kickAgent();
  }, 1200);
}

function parseSeat(who: string): Seat {
  if (who === "human") return { kind: "human" };
  if (who === "empty") return { kind: "empty" };
  if (who.startsWith("engine")) return { kind: "engine", level: Number(who.split(":")[1] ?? 4) };
  return { kind: "agent", id: who };
}

function handle(req: Record<string, unknown>) {
  switch (req.cmd) {
    case "state":
      return snapshot();
    case "seat":
      if (req.color === "b") black = parseSeat(String(req.who));
      else white = parseSeat(String(req.who));
      kickAgent();
      return snapshot();
    case "chaos":
      chaos = !!req.on;
      return snapshot();
    case "new":
      if (white.kind === "empty" || black.kind === "empty") return { ok: false, error: "both seats must be filled first" };
      try {
        g = req.fen ? new Chess(String(req.fen)) : new Chess();
      } catch {
        return { ok: false, error: "that position is not legal" };
      }
      status = "playing";
      result = winner = drawReason = coach = coachFrom = null;
      {
        const c = req.clock as { initial: number; increment: number } | undefined;
        clock = c ? { initial: c.initial * 1000, inc: (c.increment ?? 0) * 1000, w: c.initial * 1000, b: c.initial * 1000, running: null, since: 0, started: false } : null;
      }
      kickAgent();
      return snapshot();
    case "move": {
      if (status !== "playing") return { ok: false, error: "no game in progress — start one with `new`" };
      const s = seatOf(g.turn());
      const ok = (req.engine && s.kind === "engine") || (!req.engine && s.kind === "human");
      if (!ok) return { ok: false, error: "not your turn" };
      const u = String(req.uci);
      try {
        g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      } catch {
        return { ok: false, error: "illegal move" };
      }
      coach = null;
      updateStatus();
      press(g.turn() === "w" ? "b" : "w", status === "playing");
      kickAgent();
      return snapshot();
    }
    case "takeback": {
      const n = Number(req.n ?? 1);
      for (let i = 0; i < n; i++) g.undo();
      status = "playing";
      result = winner = drawReason = null;
      return snapshot();
    }
    case "resign":
      if (status === "playing") {
        const me = white.kind === "human" && black.kind !== "human" ? "w" : black.kind === "human" && white.kind !== "human" ? "b" : g.turn();
        stopClock();
        status = "resigned";
        winner = me === "w" ? "b" : "w";
        result = winner === "w" ? "1-0" : "0-1";
      }
      return snapshot();
    case "end":
      if (status === "playing") {
        stopClock();
        status = "ended";
      }
      return snapshot();
    default:
      return { ok: false, error: `unknown command: ${String(req.cmd)}` };
  }
}

export async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 15));
  if (name === "run_cmd") return handle((args?.req ?? {}) as Record<string, unknown>) as T;
  if (name === "asset") return null as T;
  throw new Error(`mock: no command ${name}`);
}

export const isTauri = () => false;
