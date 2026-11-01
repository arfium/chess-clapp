// Positions the sacrifice detector (src/engine/sacrifice.ts) must judge right — the
// static half of Brilliant; whether the engine approves is decided in review.ts.
// usage: node scripts/test-sacrifice.mjs   (part of npm test)

import { build } from "esbuild";
import { Chess } from "chess.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "chess-sac-"));
const out = join(dir, "sacrifice.mjs");
await build({
  entryPoints: [new URL("../src/engine/sacrifice.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "warning",
});
const { isSacrifice, takesFreePiece } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5";
const LEGAL = "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6";

// [name, moves before, move, sacrifice?]
const CASES = [
  ["Opera 10.Nxb5 — knight into a pawn", OPERA, "Nxb5", true],
  ["Opera 13.Rxd7 — the exchange", `${OPERA} Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8`, "Rxd7", true],
  ["Opera 16.Qb8+ — the queen", `${OPERA} Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7`, "Qb8+", true],
  ["Opera 11...Nbd7 — a block, not a gift", `${OPERA} Nxb5 cxb5 Bxb5+`, "Nbd7", false],
  ["Legal 5.Nxe5 — the queen left to the bishop", LEGAL, "Nxe5", true],
  ["Legal 6.Bxf7+ — a defended capture", `${LEGAL} Nxe5 Bxd1`, "Bxf7+", false],
  ["Fried Liver 6.Nxf7", "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5", "Nxf7", true],
  ["Bishop for knight is a trade", "e4 e5 Nf3 Nc6 Bb5 a6", "Bxc6", false],
  ["The recapture", "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6", "dxc6", false],
  ["A developing move", "e4 e5", "Nf3", false],
  ["A retreat to safety", "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5", "Nf3", false],
  ["A check that hangs nothing", "e4 d5", "Bb5+", false],
];

let failed = 0;
const check = (ok, name, got) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  (got ${got})`}`);
};

for (const [name, before, san, want] of CASES) {
  const game = new Chess();
  for (const m of before.split(" ")) game.move(m);
  const m = new Chess(game.fen()).move(san);
  const got = isSacrifice(game.fen(), m.from + m.to + (m.promotion ?? ""));
  check(got === want, name, got);
}

const greek = "r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8";
check(isSacrifice(greek, "d3h7") === true, "Greek gift Bxh7+", false);
const hangs = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
check(takesFreePiece(hangs, "e4d5") === false, "exd5 takes a defended pawn", true);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
