//! Opening names, by position. `public/openings.json` is lichess-org/chess-openings (CC0)
//! keyed by the first four FEN fields — `scripts/build-openings.mjs` regenerates it. It is
//! fetched once, on first use, so the 450 KB never sits on the startup path.

import { useEffect, useState } from "react";
import { fenKey } from "./chess";

export type Opening = { eco: string; name: string };
type Book = Record<string, [string, string]>;

let book: Book | null = null;
let loading: Promise<Book | null> | null = null;
const waiters = new Set<() => void>();

function loadBook(): Promise<Book | null> {
  if (book) return Promise.resolve(book);
  loading ??= fetch("/openings.json")
    .then((r) => (r.ok ? (r.json() as Promise<Book>) : null))
    .catch(() => null)
    .then((b) => {
      book = b ?? {};
      for (const w of waiters) w();
      return book;
    });
  return loading;
}

/** The book, once loaded (null until then). Re-renders the caller when it arrives. */
export function useBook(): Book | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (book) return;
    const wake = () => bump((n) => n + 1);
    waiters.add(wake);
    void loadBook();
    return () => {
      waiters.delete(wake);
    };
  }, []);
  return book;
}

export function lookup(b: Book | null, fen: string): Opening | null {
  const hit = b?.[fenKey(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : null;
}

/** The deepest named position among `fens` (ply 0 … n): the opening the game is in. */
export function openingOf(b: Book | null, fens: string[]): Opening | null {
  if (!b) return null;
  for (let i = fens.length - 1; i >= 0; i--) {
    const o = lookup(b, fens[i]);
    if (o) return o;
  }
  return null;
}
