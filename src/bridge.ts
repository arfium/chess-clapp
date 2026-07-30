//! The only seam between the React UI and the Rust core.
//!
//! Two channels, exactly as the Swift app has one `Game` object:
//!   invoke("run_cmd", { req })  ->  the state snapshot (the return value of every verb)
//!   listen("state", …)          ->  the same snapshot, pushed when an agent moves
//! plus `invoke("asset", { path })` for avatar images, which are absolute FILE paths in
//! the snapshot and have to be read by Rust and handed back as a data: URI.
//!
//! Both channels, the avatar cache, the rev-ordered snapshot wiring and the agent tint
//! are IDENTICAL in every clapp, so they live in `@clappkit` (clappkit/web, resolved by
//! a Vite alias — no npm dependency) and are re-exported here. What stays in this file is
//! chess: its snapshot shape, its command envelope, and the square arithmetic.

export { agentTint, prefetchAssets, useAsset, useSnapshot } from "@clappkit";

export type Side = "w" | "b";
export type SeatKind = "empty" | "human" | "agent";

/** Who sits on one side of the board, as the snapshot describes them. */
export type Player = {
  kind: SeatKind;
  name?: string | null;
  id?: string | null;
  model?: string | null;
  backend?: string | null;
  /** ABSOLUTE FILE PATH (or null) — not an image. Resolve it with `useAsset`. */
  avatar?: string | null;
};

export type AgentRow = {
  id: string;
  name: string;
  model?: string | null;
  backend?: string | null;
  avatar?: string | null;
};

export type Legal = { from: number; to: number; promo: string | null };

/** One played half-move. The colour is what the move rail pairs on (never the index). */
export type MoveRow = { san: string; color: Side };

export type ChessState = {
  ok?: boolean;
  /** Monotonic snapshot revision — a snapshot older than the held one is DISCARDED. */
  rev?: number;
  fen: string;
  turn: Side;
  status: string; // idle | playing | checkmate | stalemate | draw | resigned | ended
  result: string | null;
  winner: Side | null;
  inCheck: boolean;
  chaos: boolean;
  /** index 0 = a1 … 63 = h8, values like "wP" / "bK". */
  board: (string | null)[];
  white: Player;
  black: Player;
  yourColor: Side | null;
  last: { from: number; to: number } | null;
  legal: Legal[];
  moves: MoveRow[]; // SAN + colour, in order
  /** A short note an agent left with `chess say` (cleared by `new` and by every move). */
  coach?: string | null;
  seatsReady: boolean;
  hasHuman: boolean;
  agents: AgentRow[];
};

export type Req =
  | { cmd: "state" }
  | { cmd: "seat"; color: Side; who: string }
  | { cmd: "new" }
  | { cmd: "move"; uci: string }
  | { cmd: "resign" }
  | { cmd: "end" }
  | { cmd: "takeback"; n: number }
  | { cmd: "chaos"; on: boolean };

export const EMPTY: ChessState = {
  ok: true,
  rev: 0,
  fen: "",
  turn: "w",
  status: "idle",
  result: null,
  winner: null,
  inCheck: false,
  chaos: false,
  board: Array(64).fill(null),
  white: { kind: "empty" },
  black: { kind: "empty" },
  yourColor: null,
  last: null,
  legal: [],
  moves: [],
  coach: null,
  seatsReady: false,
  hasHuman: false,
  agents: [],
};

// MARK: - Squares (Chess.swift: 0 = a1, 7 = h1, 56 = a8, 63 = h8)

export const fileOf = (sq: number) => sq % 8;
export const rankOf = (sq: number) => Math.floor(sq / 8);
export const squareName = (sq: number) => "abcdefgh"[fileOf(sq)] + (rankOf(sq) + 1);
