//! Stockfish 18 (lite, single-threaded WASM) in a Web Worker, spoken to in UCI.
//!
//! One `Engine` is one worker and runs ONE search at a time. A new `search` supersedes
//! the running one: it sends `stop`, waits for that search's `bestmove` (the engine is
//! not ready for a new `position` until it has answered), and only then starts — so the
//! caller never has to sequence anything, and a stale `info` line can never be credited
//! to the new position. Searches queued behind a superseded one are dropped.
//!
//! The WASM build ABORTS on an impossible position and takes the worker with it. Callers
//! check `engineSafe` first; if it dies anyway the worker is rebuilt on the next search.

import { fenKey, pvToPlies, turnOf } from "../lib/chess";

/**
 * Always from WHITE's point of view. Exactly one of cp / mate is set. `mate: 0` is a
 * position that IS checkmate, and then `won` says who delivered it.
 */
export type Score = { cp?: number; mate?: number; won?: "w" | "b" };

export type PvLine = {
  multipv: number;
  depth: number;
  score: Score;
  /** UCI moves. */
  pv: string[];
};

export type SearchInfo = {
  fen: string;
  depth: number;
  seldepth: number;
  nodes: number;
  nps: number;
  time: number;
  /** Sorted by multipv rank; a rank missing at this depth keeps its last value. */
  lines: PvLine[];
};

export type SearchResult = SearchInfo & { bestmove: string | null };

export type SearchOptions = {
  fen: string;
  /**
   * How the game reached `fen`, when known: the engine then sees repetitions (and so
   * stops shuffling into a threefold draw in a won game). Use `withHistory` to build it.
   */
  history?: { startFen: string; moves: string[] };
  multiPv?: number;
  depth?: number;
  movetime?: number;
  /** Stockfish's own handicap, 0–20. Omitted = full strength. */
  skill?: number;
  onInfo?: (info: SearchInfo) => void;
};

const ENGINE_URL = "/engine/stockfish.js";

type Job = SearchOptions & {
  resolve: (r: SearchResult | null) => void;
  info: SearchInfo;
  started: boolean;
  /** Stopped by a newer search or `cancel`: it resolves null, not with a half result. */
  dropped?: boolean;
};

export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private onLine: ((line: string) => void) | null = null;
  private running: Job | null = null;
  private queue: Job[] = [];
  private options = new Map<string, string>();
  dead = false;

  /** Spin up (or re-spin after a crash) the worker and complete the UCI handshake. */
  private boot(): Promise<void> {
    if (this.ready && this.worker && !this.dead) return this.ready;
    this.dead = false;
    this.options.clear();
    const w = new Worker(ENGINE_URL);
    this.worker = w;
    w.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === "string" ? e.data : String(e.data);
      for (const line of text.split("\n")) if (line) this.onLine?.(line);
    };
    w.onerror = () => this.crash();
    this.ready = new Promise<void>((resolve) => {
      let phase = 0;
      this.onLine = (line) => {
        if (phase === 0 && line === "uciok") {
          phase = 1;
          this.send("setoption name Hash value 32");
          this.send("isready");
        } else if (phase === 1 && line === "readyok") {
          phase = 2;
          this.onLine = (l) => this.handle(l);
          resolve();
        }
      };
      this.send("uci");
    });
    return this.ready;
  }

  private crash() {
    this.dead = true;
    try {
      this.worker?.terminate();
    } catch {
      /* already gone */
    }
    this.worker = null;
    this.ready = null;
    const jobs = [this.running, ...this.queue].filter(Boolean) as Job[];
    this.running = null;
    this.queue = [];
    for (const j of jobs) j.resolve(null);
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private setOption(name: string, value: string | number) {
    const v = String(value);
    if (this.options.get(name) === v) return;
    this.options.set(name, v);
    this.send(`setoption name ${name} value ${v}`);
  }

  /**
   * Start a search, superseding whatever is running or queued. Resolves with the final
   * result, or null if it was superseded / cancelled / the engine died.
   */
  search(opts: SearchOptions): Promise<SearchResult | null> {
    return new Promise((resolve) => {
      const job: Job = {
        ...opts,
        resolve,
        started: false,
        info: { fen: opts.fen, depth: 0, seldepth: 0, nodes: 0, nps: 0, time: 0, lines: [] },
      };
      for (const q of this.queue) q.resolve(null);
      this.queue = [job];
      if (this.running && !this.running.dropped) {
        this.running.dropped = true;
        this.send("stop");
      }
      void this.boot().then(() => this.pump());
    });
  }

  /** Stop the running search and drop the queue; every pending promise resolves null. */
  cancel(): void {
    for (const q of this.queue) q.resolve(null);
    this.queue = [];
    if (this.running && !this.running.dropped) {
      this.running.dropped = true;
      this.send("stop");
    }
  }

  /** Forget everything learned (hash, history) — before an unrelated game. */
  newGame(): void {
    if (this.worker && !this.running) this.send("ucinewgame");
  }

  terminate(): void {
    this.cancel();
    try {
      this.worker?.terminate();
    } catch {
      /* gone */
    }
    this.worker = null;
    this.ready = null;
    this.dead = true;
  }

  private pump() {
    if (this.running || this.dead) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = job;
    job.started = true;
    this.setOption("MultiPV", job.multiPv ?? 1);
    this.setOption("Skill Level", job.skill ?? 20);
    this.send(
      job.history && job.history.moves.length
        ? `position fen ${job.history.startFen} moves ${job.history.moves.join(" ")}`
        : `position fen ${job.fen}`,
    );
    const limits: string[] = [];
    if (job.depth) limits.push(`depth ${job.depth}`);
    if (job.movetime) limits.push(`movetime ${job.movetime}`);
    this.send(limits.length ? `go ${limits.join(" ")}` : "go infinite");
  }

  private handle(line: string) {
    const job = this.running;
    if (line.startsWith("bestmove")) {
      if (!job) return;
      this.running = null;
      const best = line.split(" ")[1];
      job.resolve(job.dropped ? null : { ...job.info, bestmove: best && best !== "(none)" ? best : null });
      this.pump();
      return;
    }
    if (!job || job.dropped || !line.startsWith("info ") || !line.includes(" pv ")) return;
    if (line.includes(" lowerbound") || line.includes(" upperbound")) return;
    const parsed = parseInfo(line, turnOf(job.fen) === "b");
    if (!parsed) return;
    const info = job.info;
    info.depth = Math.max(info.depth, parsed.depth);
    info.seldepth = parsed.seldepth || info.seldepth;
    info.nodes = parsed.nodes || info.nodes;
    info.nps = parsed.nps || info.nps;
    info.time = parsed.time || info.time;
    const lines = info.lines.filter((l) => l.multipv !== parsed.line.multipv);
    lines.push(parsed.line);
    lines.sort((a, b) => a.multipv - b.multipv);
    info.lines = lines.slice(0, job.multiPv ?? 1);
    job.onInfo?.({ ...info, lines: [...info.lines] });
  }
}

function parseInfo(line: string, blackToMove: boolean) {
  const t = line.split(" ");
  let depth = 0;
  let seldepth = 0;
  let multipv = 1;
  let nodes = 0;
  let nps = 0;
  let time = 0;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case "depth":
        depth = Number(t[++i]);
        break;
      case "seldepth":
        seldepth = Number(t[++i]);
        break;
      case "multipv":
        multipv = Number(t[++i]);
        break;
      case "nodes":
        nodes = Number(t[++i]);
        break;
      case "nps":
        nps = Number(t[++i]);
        break;
      case "time":
        time = Number(t[++i]);
        break;
      case "score": {
        const kind = t[++i];
        const v = Number(t[++i]);
        const sign = blackToMove ? -1 : 1;
        score = kind === "mate" ? { mate: sign * v } : { cp: sign * v };
        break;
      }
      case "pv":
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (!score || pv.length === 0) return null;
  return { depth, seldepth, nodes, nps, time, line: { multipv, depth, score, pv } };
}

/**
 * The game's moves as engine history — only when every one of them is legal chess from
 * `startFen` and they really arrive at `fen` (a chaos move anywhere breaks the chain, and
 * then the engine gets the bare position instead). Only the moves since the last capture
 * or pawn move matter for repetition, so that is all that is sent.
 */
export function withHistory(fen: string, startFen: string, moves: string[]): SearchOptions["history"] {
  if (moves.length === 0) return undefined;
  const plies = pvToPlies(startFen, moves);
  if (plies.length !== moves.length || fenKey(plies[plies.length - 1].fen) !== fenKey(fen)) return undefined;
  let from = 0;
  plies.forEach((p, i) => {
    if (/x|^[a-h]/.test(p.san)) from = i + 1;
  });
  if (from >= moves.length) return undefined;
  return { startFen: from === 0 ? startFen : plies[from - 1].fen, moves: moves.slice(from) };
}

// MARK: - Win probability (lichess's model)

/** White's winning chances, 0–100, from a White-POV score. */
export function winPercent(s: Score | null | undefined): number {
  if (!s) return 50;
  if (s.mate !== undefined) {
    if (s.mate === 0) return s.won === "w" ? 100 : s.won === "b" ? 0 : 50;
    return s.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** A comparable centipawn number (mates pinned to ±10000, nearer mates bigger). */
export function cpOf(s: Score): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return s.won === "w" ? 10000 : s.won === "b" ? -10000 : 0;
    return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  }
  return s.cp ?? 0;
}

// MARK: - Shared instances

let analysis: Engine | null = null;
let player: Engine | null = null;

/** The engine behind the eval bar and the analysis lines. */
export function analysisEngine(): Engine {
  analysis ??= new Engine();
  return analysis;
}

/** The engine that plays a Stockfish seat — separate, so analysis never steals its turn. */
export function playerEngine(): Engine {
  player ??= new Engine();
  return player;
}
