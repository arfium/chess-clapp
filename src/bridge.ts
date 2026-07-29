//! The only seam between the React UI and the Rust core.
//!
//! Two channels, exactly as the Swift app has one `Game` object:
//!   invoke("run_cmd", { req })  ->  the state snapshot (the return value of every verb)
//!   listen("state", …)          ->  the same snapshot, pushed when an agent moves
//! plus `invoke("asset", { path })` for avatar images, which are absolute FILE paths in
//! the snapshot and have to be read by Rust and handed back as a data: URI.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

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

export async function cmd(req: Req): Promise<ChessState> {
  return (await invoke("run_cmd", { req })) as ChessState;
}

export function onState(cb: (s: ChessState) => void): Promise<UnlistenFn> {
  return listen<ChessState>("state", (e) => cb(e.payload));
}

// MARK: - Avatar images
//
// Mirrors Swift's `AvatarCache`: read once per path, keep it forever. The cache lives at
// module scope so a re-render never re-reads a file, and concurrent mounts of the same
// path share one in-flight request.

const assetCache = new Map<string, string | null>();
const assetPending = new Map<string, Promise<string | null>>();
/** Everyone waiting on ANY path — one re-render per component when a load resolves. */
const assetWaiters = new Set<() => void>();

function loadAsset(path: string): Promise<string | null> {
  if (assetCache.has(path)) return Promise.resolve(assetCache.get(path) ?? null);
  const hit = assetPending.get(path);
  if (hit) return hit;
  const p = invoke<string | null>("asset", { path })
    .then((v) => v ?? null)
    .catch(() => null)
    .then((v) => {
      // Even a failure is cached (as null): a missing file is asked for exactly once.
      assetCache.set(path, v);
      assetPending.delete(path);
      for (const w of assetWaiters) w();
      return v;
    });
  assetPending.set(path, p);
  return p;
}

/**
 * Warm the cache for paths the UI is ABOUT to need — every roster avatar arrives in the
 * snapshot long before that agent is seated, so by the time the strip draws one the
 * data: URI is already in hand and the monogram never flashes first.
 */
export function prefetchAssets(paths: (string | null | undefined)[]): void {
  for (const p of paths) {
    if (p && p.length > 0 && !assetCache.has(p) && !assetPending.has(p)) void loadAsset(p);
  }
}

/** Resolve an absolute file path to a data: URI (null while loading, or on failure). */
export function useAsset(path?: string | null): string | null {
  const key = path && path.length > 0 ? path : "";
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key || assetCache.has(key)) return;
    // Subscribe for the whole mount, not per path: a load that resolves between this
    // render and the next `key` change still repaints exactly once.
    const wake = () => bump((n) => n + 1);
    assetWaiters.add(wake);
    void loadAsset(key);
    return () => {
      assetWaiters.delete(wake);
    };
  }, [key]);

  // Read-through: once cached, EVERY later render is synchronous — no refetch, no flash.
  return key ? assetCache.get(key) ?? null : null;
}

// MARK: - Squares (Chess.swift: 0 = a1, 7 = h1, 56 = a8, 63 = h8)

export const fileOf = (sq: number) => sq % 8;
export const rankOf = (sq: number) => Math.floor(sq / 8);
export const squareName = (sq: number) => "abcdefgh"[fileOf(sq)] + (rankOf(sq) + 1);

// MARK: - Agent avatar tint
//
// djb2 over the id's UTF-8 bytes in 64-bit SIGNED two's-complement arithmetic — exactly
// what Swift's `Int` does with `<<` and `&+`. A 32-bit `|0` djb2 picks different colours.

const AGENT_TINTS = ["#45548C", "#267369", "#784D82", "#996138", "#4D6178"];

export function agentTint(id: string): string {
  const bytes = new TextEncoder().encode(id);
  let h = 5381n;
  for (const b of bytes) {
    h = BigInt.asIntN(64, BigInt.asIntN(64, h << 5n) + h);
    h = BigInt.asIntN(64, h + BigInt(b));
  }
  const abs = h < 0n ? -h : h;
  return AGENT_TINTS[Number(abs % BigInt(AGENT_TINTS.length))];
}
