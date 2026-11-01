#!/usr/bin/env node
// Regenerate public/openings.json from lichess-org/chess-openings (CC0).
//
// The window names the opening by POSITION, not by move order, so transpositions land
// on the right name: every line in the five TSVs is replayed with chess.js and keyed by
// the first four FEN fields (pieces, side to move, castling, en passant). Where two lines
// reach one position, the later (deeper, more specific) name wins — the TSVs are sorted
// by ECO, so that is also the more established name.
//
// usage: node scripts/build-openings.mjs [dir-with-a..e.tsv]
// Without a directory the five files are fetched from GitHub.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/";
const dir = process.argv[2];

const tsv = async (f) =>
  dir ? fs.readFileSync(path.join(dir, f), "utf8") : (await fetch(SRC + f)).text();

const out = {};
let lines = 0;
for (const f of ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"]) {
  for (const row of (await tsv(f)).split("\n").slice(1)) {
    const [eco, name, pgn] = row.split("\t");
    if (!pgn) continue;
    const g = new Chess();
    g.loadPgn(pgn);
    const key = g.fen().split(" ").slice(0, 4).join(" ");
    const prev = out[key];
    if (!prev || pgn.length >= prev[2]) out[key] = [eco, name, pgn.length];
    lines++;
  }
}
const slim = Object.fromEntries(Object.entries(out).map(([k, [eco, name]]) => [k, [eco, name]]));
fs.writeFileSync(path.join(ROOT, "public/openings.json"), JSON.stringify(slim));
console.error(`${lines} lines → ${Object.keys(slim).length} positions`);
