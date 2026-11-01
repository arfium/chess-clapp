//! The window: the rail of modes, the board, and the sheet beside it.
//!
//! Four modes, each with its own position and its own move tree:
//!   play      the live game (the core's) — New Game, the game, its result
//!   analysis  a free board with the engine on, variations, PGN/FEN
//!   editor    set up a position, then analyse it or play it
//!   review    a finished line, judged move by move
//! Only a move on the live position in Play reaches the core; everything else is local.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  cmd,
  EMPTY,
  fileOf,
  normalize,
  prefetchAssets,
  rankOf,
  squareIndex,
  squareName,
  START_FEN,
  useSnapshot,
  type ChessState,
  type Player,
  type Req,
  type Side,
} from "./bridge";
import { Board, type Arrow, type Promotion } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { EvalBar } from "./components/EvalBar";
import { ImportDialog } from "./components/ImportDialog";
import { MoveTree } from "./components/MoveTree";
import { PlayerStrip } from "./components/PlayerStrip";
import { Rail, type Mode } from "./components/Rail";
import { ResultCard, resultMark, resultWords } from "./components/ResultCard";
import { SettingsDialog } from "./components/SettingsDialog";
import { IconButton } from "./components/ui";
import { analysisEngine, withHistory } from "./engine/engine";
import { headline, useAnalysis } from "./engine/useAnalysis";
import { useEnginePlayer } from "./engine/useEnginePlayer";
import { CLASS_META, reviewFits, startReview, type Classification, type Review, type ReviewJob, type ReviewProgress } from "./engine/review";
import { boardFromFen, inCheck, legalTargets, load, material, playUci, toPgn, turnOf, type Line } from "./lib/chess";
import { openingOf, useBook } from "./lib/openings";
import { ANIMATION_MS, setSettings, useSettings, type AppTheme } from "./lib/settings";
import { play, soundFor, unlockAudio } from "./lib/sound";
import { boardTheme } from "./lib/themes";
import {
  addPly,
  continuation,
  cut,
  depthOf,
  emptyTree,
  isMainline,
  lineTo,
  liveTip,
  mainAt,
  mainLine,
  pathTo,
  promote,
  syncLive,
  treeFromLine,
  type Tree,
} from "./lib/tree";
import { EditorPanel, fenOf, useEditor } from "./modes/Editor";
import { NewGame, SpeedIcon, type Start } from "./modes/NewGame";
import { TIME_CONTROLS, tcLabel } from "./lib/timecontrol";
import { ReviewMode } from "./modes/Review";
import { Bulb, ChevronLeft, ChevronRight, Copy, Editor as EditorIcon, Engine, Flag, Flip, Import, Stop, ToEnd, ToStart, Undo } from "./icons";

// Layout measures — Fibonacci, like the spacing scale in styles.css.
const PHI = (1 + Math.sqrt(5)) / 2;
const PLATE_H = 55;
const EVAL_BAR = 21;
const GAP_13 = 13;
const GAP_34 = 34;
const SHEET_MIN = 322;
const SHEET_MAX = 466;
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const macOverlay = isTauri && /Mac/.test(navigator.userAgent);
const TERMINAL = new Set(["checkmate", "stalemate", "draw", "resigned", "ended", "timeout"]);

// MARK: - Helpers

function lineFromState(s: ChessState): Line {
  return {
    startFen: s.startFen,
    plies: s.plies.map((p, i) => ({
      san: s.moves[i]?.san ?? "?",
      uci: p.uci,
      fen: p.fen,
      from: p.from,
      to: p.to,
      color: s.moves[i]?.color ?? (i % 2 ? "b" : "w"),
    })),
  };
}

/** The live board right after a move we sent, before the core's snapshot comes back. */
function optimisticBoard(board: (string | null)[], from: number, to: number, promo: string | null) {
  const b = board.slice();
  const p = b[from];
  if (!p) return b;
  b[from] = null;
  if (p[1] === "P" && fileOf(from) !== fileOf(to) && !b[to]) b[rankOf(from) * 8 + fileOf(to)] = null;
  if (p[1] === "K" && Math.abs(fileOf(to) - fileOf(from)) === 2) {
    const r = rankOf(from) * 8;
    if (fileOf(to) === 6) [b[r + 5], b[r + 7]] = [b[r + 7], null];
    else [b[r + 3], b[r]] = [b[r], null];
  }
  b[to] = promo ? p[0] + promo.toUpperCase() : p;
  return b;
}

function kingSquare(board: (string | null)[], side: Side): number | null {
  const i = board.indexOf(side + "K");
  return i < 0 ? null : i;
}

function playerName(p: Player): string {
  if (p.kind === "human") return "You";
  if (p.kind === "engine") return `Stockfish ${p.level ?? ""}`.trim();
  if (p.kind === "agent") return p.name ?? "Agent";
  return "—";
}

const seatOf = (p: Player) => (p.kind === "human" ? "human" : p.kind === "engine" ? `engine:${p.level}` : p.id ?? "human");

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function useAppTheme(theme: AppTheme) {
  // One query for the app's life: a fresh one each render would re-subscribe on every engine update.
  const [media] = useState(() => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null));
  const [osDark, setOsDark] = useState(media?.matches ?? false);
  useEffect(() => {
    if (!media) return;
    const f = () => setOsDark(media.matches);
    media.addEventListener("change", f);
    return () => media.removeEventListener("change", f);
  }, [media]);
  const resolved = theme === "system" ? (osDark ? "night" : "scoresheet") : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    if (!isTauri) return;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setTheme(theme === "system" ? null : resolved === "scoresheet" ? "light" : "dark"),
      )
      .catch(() => {});
  }, [resolved, theme]);
}

/** A tree and the node on the board — for Analysis and Review. */
function useTreeState() {
  const [tree, setTree] = useState<Tree>(() => emptyTree(START_FEN));
  const [cur, setCur] = useState(0);
  return { tree, setTree, cur, setCur };
}

/** Is `fen` a position a new game can start from? */
function playable(fen: string): boolean {
  const g = load(fen);
  return !!g && !g.isGameOver();
}

// MARK: - App

export default function App() {
  const settings = useSettings();
  useAppTheme(settings.appTheme);
  const book = useBook();
  const { state, apply } = useSnapshot<ChessState, Req>(EMPTY, { normalize });

  // MARK: the core

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [optimistic, setOptimistic] = useState<{ rev: number; board: (string | null)[] } | null>(null);

  const send = useCallback(
    async (req: Req): Promise<boolean> => {
      try {
        const r = await cmd<ChessState, Req>(req);
        if (r && r.ok === false) {
          setOptimistic(null);
          const msg = (r as unknown as { error?: string }).error ?? "Not allowed";
          setToast(msg.charAt(0).toUpperCase() + msg.slice(1));
          if (req.cmd === "move") play("error");
          return false;
        }
        apply(r);
        return true;
      } catch {
        setOptimistic(null);
        setToast("The game isn’t responding");
        return false;
      }
    },
    [apply],
  );
  const run = useCallback((req: Req) => void send(req), [send]);
  const runSeq = useCallback(
    async (reqs: Req[]) => {
      for (const r of reqs) if (!(await send(r))) return false;
      return true;
    },
    [send],
  );

  useEffect(() => {
    prefetchAssets([...state.agents.map((a) => a.avatar), state.white.avatar, state.black.avatar]);
  }, [state.agents, state.white.avatar, state.black.avatar]);

  const engineSeat = useEnginePlayer(state, run);

  // The clock as of the snapshot, and when that snapshot arrived — the faces count down
  // from there between snapshots.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clockAt = useMemo(() => performance.now(), [state.rev]);

  // MARK: modes and their trees

  const [mode, setModeRaw] = useState<Mode>("play");
  const [setup, setSetup] = useState(false);
  const [startFen, setStartFen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"settings" | "import" | null>(null);

  // Play: the live game as a tree (the live moves are its main line).
  const liveSig = state.startFen + "|" + state.plies.map((p) => p.uci).join(" ");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveLine = useMemo(() => lineFromState(state), [liveSig, state.moves]);
  const [playTree, setPlayTree] = useState<Tree>(() => syncLive(emptyTree(START_FEN), lineFromState(EMPTY)));
  const [playCur, setPlayCur] = useState<number | null>(null); // null: follow the game
  useEffect(() => {
    setPlayTree((t) => {
      const next = syncLive(t, liveLine);
      setPlayCur((c) => (c !== null && !next.nodes[c] ? null : c));
      return next;
    });
  }, [liveLine]);
  const tip = liveTip(playTree);

  const ana = useTreeState();
  const [anaNames, setAnaNames] = useState({ w: "White", b: "Black" });
  const rev = useTreeState();
  const [revNames, setRevNames] = useState({ w: "White", b: "Black" });
  const editor = useEditor();

  const tree = mode === "play" ? playTree : mode === "analysis" ? ana.tree : rev.tree;
  const cur = mode === "play" ? (playCur ?? tip) : mode === "analysis" ? ana.cur : rev.cur;

  /** Put a tree and a node on the board for the current mode. */
  const place = useCallback(
    (t: Tree | null, id: number) => {
      if (mode === "play") {
        if (t) setPlayTree(t);
        setPlayCur(id === liveTip(t ?? playTree) ? null : id);
      } else if (mode === "analysis") {
        if (t) ana.setTree(t);
        ana.setCur(id);
      } else {
        if (t) rev.setTree(t);
        rev.setCur(id);
      }
    },
    [mode, playTree, ana, rev],
  );
  const setCur = useCallback((id: number) => place(null, id), [place]);

  const viewFen = mode === "editor" ? fenOf(editor.st) : tree.nodes[cur]?.fen ?? START_FEN;
  const viewNode = mode === "editor" ? null : tree.nodes[cur];
  const atLiveTip = mode === "play" && cur === tip;
  const names = { w: playerName(state.white), b: playerName(state.black) };

  // MARK: game state

  const seat = (c: Side): Player => (c === "w" ? state.white : state.black);
  const playing = state.status === "playing";
  const over = TERMINAL.has(state.status);
  const humanTurn = playing && seat(state.turn).kind === "human";
  const humanSide: Side | null =
    state.white.kind === "human" && state.black.kind !== "human" ? "w" : state.black.kind === "human" && state.white.kind !== "human" ? "b" : null;
  const premoveOk = playing && atLiveTip && humanSide !== null && state.turn !== humanSide;

  // MARK: orientation, selection, premove, hint

  const [bottom, setBottom] = useState<Side>("w");
  const [selected, setSelected] = useState<number | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [premove, setPremove] = useState<{ from: number; to: number; promo: string | null } | null>(null);
  const [hint, setHint] = useState<{ fen: string; uci: string } | null>(null);
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [viewFen, mode]);

  // MARK: the board

  const sandboxOk = mode !== "editor" && !(mode === "play" && (setup || (atLiveTip && playing))) && load(viewFen) !== null;

  const preview = mode === "play" && (setup || (state.status === "idle" && state.moves.length === 0));
  const board = useMemo(() => {
    if (mode === "editor") return editor.st.board;
    if (preview) return boardFromFen(startFen ?? START_FEN);
    if (atLiveTip) return optimistic && optimistic.rev === state.rev ? optimistic.board : state.board;
    return boardFromFen(viewFen);
  }, [mode, editor.st.board, preview, startFen, atLiveTip, optimistic, state.rev, state.board, viewFen]);

  /** Where the piece on `sq` may go now (premoves: where it could go on your next turn). */
  const targetsFrom = useCallback(
    (sq: number): number[] => {
      if (mode === "play" && atLiveTip && humanTurn) return state.legal.filter((m) => m.from === sq).map((m) => m.to);
      if (premoveOk) {
        const f = viewFen.split(" ");
        f[1] = humanSide!;
        f[3] = "-";
        return legalTargets(f.join(" "), sq);
      }
      if (sandboxOk) return legalTargets(viewFen, sq);
      return [];
    },
    [mode, atLiveTip, humanTurn, state.legal, premoveOk, viewFen, humanSide, sandboxOk],
  );

  const targets = useMemo(() => new Set(selected === null ? [] : targetsFrom(selected)), [selected, targetsFrom]);

  const movable = useCallback(
    (sq: number) => {
      const p = board[sq];
      if (!p || mode === "editor") return false;
      if (mode === "play" && atLiveTip && humanTurn) return p[0] === state.turn;
      if (premoveOk) return p[0] === humanSide;
      if (sandboxOk) return p[0] === turnOf(viewFen);
      return false;
    },
    [board, mode, atLiveTip, humanTurn, state.turn, premoveOk, humanSide, sandboxOk, viewFen],
  );

  const canDrop = useCallback(
    (from: number, to: number) => {
      if (mode === "play" && atLiveTip && humanTurn && state.chaos) return from !== to;
      return targetsFrom(from).includes(to);
    },
    [mode, atLiveTip, humanTurn, state.chaos, targetsFrom],
  );

  /** Add moves at the node on the board (a variation, or the main line of a fresh board). */
  const branch = useCallback(
    (ucis: string[]) => {
      let t = tree;
      let id = cur;
      let fen = viewFen;
      for (const u of ucis) {
        const p = playUci(fen, u);
        if (!p) break;
        [t, id] = addPly(t, id, p);
        fen = p.fen;
        if (u === ucis[0]) play(soundFor(p.san));
      }
      if (id !== cur) place(t, id);
    },
    [tree, cur, viewFen, place],
  );

  const commit = useCallback(
    (from: number, to: number, promo: string | null) => {
      unlockAudio();
      const uci = squareName(from) + squareName(to) + (promo ?? "");
      if (mode === "play" && atLiveTip && humanTurn) {
        setOptimistic({ rev: state.rev ?? 0, board: optimisticBoard(state.board, from, to, promo) });
        setHint(null);
        run({ cmd: "move", uci });
        return;
      }
      if (premoveOk) {
        const pawnToEnd = board[from]?.[1] === "P" && (rankOf(to) === 7 || rankOf(to) === 0);
        setPremove({ from, to, promo: promo ?? (pawnToEnd ? "q" : null) });
        return;
      }
      branch([uci]);
    },
    [mode, atLiveTip, humanTurn, state.rev, state.board, run, premoveOk, board, branch],
  );

  const onMove = useCallback(
    (from: number, to: number) => {
      const piece = board[from];
      const lastRank = rankOf(to) === 7 || rankOf(to) === 0;
      if (piece?.[1] === "P" && lastRank && !premoveOk) {
        if (settings.autoQueen) commit(from, to, "q");
        else setPromotion({ from, to, color: piece[0] as Side });
        return;
      }
      commit(from, to, null);
    },
    [board, settings.autoQueen, commit, premoveOk],
  );

  // A premove plays the moment the turn comes back — if it is still legal.
  useEffect(() => {
    if (!premove) return;
    if (!playing) {
      setPremove(null);
      return;
    }
    if (state.turn !== humanSide) return;
    const ok = state.legal.some((m) => m.from === premove.from && m.to === premove.to);
    setPremove(null);
    if (ok) {
      setOptimistic({ rev: state.rev ?? 0, board: optimisticBoard(state.board, premove.from, premove.to, premove.promo) });
      run({ cmd: "move", uci: squareName(premove.from) + squareName(premove.to) + (premove.promo ?? "") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rev]);

  // MARK: engine

  const engineOn = mode === "analysis" ? settings.engineInAnalysis : mode === "editor" || preview ? false : settings.engineOn;
  const setEngineOn = (on: boolean) => setSettings(mode === "analysis" ? { engineInAnalysis: on } : { engineOn: on });
  const viewPath = useMemo(
    () => (viewNode ? { startFen: tree.nodes[tree.root].fen, moves: lineTo(tree, cur).plies.map((p) => p.uci) } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewFen],
  );
  const analysis = useAnalysis(viewFen, engineOn, settings.multiPv, settings.maxDepth, viewPath);

  const askHint = useCallback(() => {
    const fen = viewFen;
    void analysisEngine()
      .search({ fen, depth: 14, history: withHistory(fen, state.startFen, state.plies.map((p) => p.uci)) })
      .then((r) => r?.bestmove && setHint({ fen, uci: r.bestmove }));
  }, [viewFen, state.startFen, state.plies]);

  // MARK: review

  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<ReviewProgress>(null);
  const job = useRef<ReviewJob | null>(null);
  const revLine = useMemo(() => mainLine(rev.tree), [rev.tree]);
  const revFits = reviewFits(review, revLine);

  const runReview = useCallback(
    (line: Line) => {
      if (line.plies.length === 0) return;
      job.current?.cancel();
      setProgress({ done: 0, total: line.plies.length + 1 });
      const j = startReview(line, settings.reviewDepth, book, (r, done, total) => {
        if (job.current !== j) return;
        setReview(r);
        setProgress({ done, total });
      });
      job.current = j;
      void j.done.then((r) => {
        if (job.current !== j) return;
        job.current = null;
        setProgress(null);
        if (r) setReview(r);
      });
    },
    [settings.reviewDepth, book],
  );
  useEffect(() => () => job.current?.cancel(), []);

  /** Open Review on a line (the live game, or the Analysis main line). */
  const openReview = useCallback(
    (line: Line, who: { w: string; b: string }) => {
      const t = treeFromLine(line);
      rev.setTree(t);
      rev.setCur(t.root);
      setRevNames(who);
      setModeRaw("review");
      if (!(reviewFits(review, line) && review?.complete && review.plies.length === line.plies.length)) runReview(line);
    },
    [rev, review, runReview],
  );

  const revVerdicts = useMemo(() => {
    const out: Record<number, Classification> = {};
    if (!revFits || !review) return out;
    continuation(rev.tree, rev.tree.root).forEach((id, i) => {
      const r = review.plies[i];
      if (r) out[id] = r.cls;
    });
    return out;
  }, [revFits, review, rev.tree]);

  const revOnMain = mode === "review" && isMainline(rev.tree, rev.cur);
  const revPly = revOnMain ? depthOf(rev.tree, rev.cur) : -1;
  const plyReview = revPly > 0 && revFits ? review?.plies[revPly - 1] ?? null : null;

  // MARK: switching modes

  const toAnalysis = useCallback(
    (line?: Line, who?: { w: string; b: string }, at?: number) => {
      if (line) {
        const t = treeFromLine(line);
        ana.setTree(t);
        ana.setCur(at !== undefined ? mainAt(t, at) : continuation(t, t.root).pop() ?? t.root);
        setAnaNames(who ?? { w: "White", b: "Black" });
      } else if (ana.tree.nodes[ana.tree.root].children.length === 0 && ana.tree.nodes[ana.tree.root].fen === START_FEN && liveLine.plies.length) {
        const t = treeFromLine(liveLine);
        ana.setTree(t);
        ana.setCur(mainAt(t, depthOf(playTree, playCur ?? tip)));
        setAnaNames(names);
      }
      setModeRaw("analysis");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ana, liveLine, playTree, playCur, tip, names.w, names.b],
  );

  const setMode = useCallback(
    (m: Mode) => {
      unlockAudio();
      if (m === mode) return;
      if (m === "analysis") toAnalysis();
      else if (m === "review") {
        if (mode === "analysis") openReview(mainLine(ana.tree), anaNames);
        else openReview(liveLine, names);
      } else if (m === "editor") {
        editor.setFen(viewFen);
        setModeRaw("editor");
      } else setModeRaw("play");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, toAnalysis, openReview, ana.tree, liveLine, anaNames, names.w, names.b, editor, viewFen],
  );

  // MARK: game actions

  const [resultOpen, setResultOpen] = useState(false);
  const prevStatus = useRef(state.status);
  const prevPlies = useRef(state.plies.length);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state.status;
    const n = state.plies.length;
    const before = prevPlies.current;
    prevPlies.current = n;
    if (n === before + 1 && state.moves[n - 1] && playCur === null && mode === "play") play(soundFor(state.moves[n - 1].san));
    if (was !== "playing" && state.status === "playing") play("notify");
    if (was === "playing" && TERMINAL.has(state.status)) {
      play("notify");
      setResultOpen(true);
    }
    if (state.status === "playing") setResultOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.plies.length]);

  const startGame = useCallback(
    async (s: Start) => {
      unlockAudio();
      setBottom(s.humanSide ?? "w");
      setPlayCur(null);
      setPremove(null);
      setHint(null);
      setResultOpen(false);
      const reqs: Req[] = [];
      if (s.chaos !== state.chaos) reqs.push({ cmd: "chaos", on: s.chaos });
      reqs.push({ cmd: "seat", color: "w", who: s.white }, { cmd: "seat", color: "b", who: s.black });
      reqs.push({ cmd: "new", ...(s.fen ? { fen: s.fen } : {}), ...(s.clock ? { clock: s.clock } : {}) });
      if (await runSeq(reqs)) {
        setSetup(false);
        setStartFen(null);
        setModeRaw("play");
      }
    },
    [state.chaos, runSeq],
  );

  const rematch = useCallback(async () => {
    const w = state.black;
    const b = state.white;
    await startGame({
      white: seatOf(w),
      black: seatOf(b),
      fen: state.startFen === START_FEN ? null : state.startFen,
      chaos: state.chaos,
      humanSide: w.kind === "human" && b.kind !== "human" ? "w" : b.kind === "human" && w.kind !== "human" ? "b" : null,
      clock: state.clock ? { initial: state.clock.initial / 1000, increment: state.clock.increment / 1000 } : null,
    });
  }, [state.white, state.black, state.startFen, state.chaos, state.clock, startGame]);

  const takeback = useCallback(() => {
    const opp = seat(state.turn === "w" ? "b" : "w");
    const n = humanTurn && opp.kind !== "human" && state.moves.length >= 2 ? 2 : 1;
    setPlayCur(null);
    setPremove(null);
    setHint(null);
    run({ cmd: "takeback", n });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.white, state.black, humanTurn, state.moves.length, run]);

  // MARK: export

  const currentNames = mode === "analysis" ? anaNames : mode === "review" ? revNames : names;
  const exportPgn = useCallback(async () => {
    const line = mode === "play" ? liveLine : mode === "analysis" ? mainLine(ana.tree) : revLine;
    const notes =
      mode === "review" && revFits
        ? line.plies.map((_, i) => {
            const r = review?.plies[i];
            return r ? { glyph: CLASS_META[r.cls].nag || undefined } : null;
          })
        : undefined;
    const opening = openingOf(book, [line.startFen, ...line.plies.map((p) => p.fen)]);
    const pgn = toPgn(line, {
      white: currentNames.w,
      black: currentNames.b,
      result: mode === "play" ? state.result : null,
      notes,
      opening: opening ? `${opening.eco} ${opening.name}` : null,
    });
    setToast((await copyText(pgn)) ? "PGN copied" : "Couldn’t copy");
  }, [mode, liveLine, ana.tree, revLine, revFits, review, book, currentNames.w, currentNames.b, state.result]);

  const exportFen = useCallback(async () => {
    setToast((await copyText(viewFen)) ? "FEN copied" : "Couldn’t copy");
  }, [viewFen]);

  // MARK: navigation

  const nav = useMemo(() => {
    if (mode === "editor") return null;
    const node = tree.nodes[cur];
    const next = node?.children[0];
    const hasPrev = node?.parent !== null && node?.parent !== undefined;
    return {
      first: () => setCur(tree.root),
      prev: () => hasPrev && setCur(node.parent!),
      next: () => {
        if (next === undefined) return;
        play(soundFor(tree.nodes[next].ply!.san));
        setCur(next);
      },
      last: () => setCur(continuation(tree, cur).pop() ?? cur),
      hasPrev,
      hasNext: next !== undefined,
    };
  }, [mode, tree, cur, setCur]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (dialog || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      switch (e.key) {
        case "ArrowLeft":
          nav?.prev();
          break;
        case "ArrowRight":
          nav?.next();
          break;
        case "ArrowUp":
        case "Home":
          nav?.first();
          break;
        case "ArrowDown":
        case "End":
          nav?.last();
          break;
        case "f":
          setBottom((b) => (b === "w" ? "b" : "w"));
          break;
        case "e":
          if (mode !== "editor") setEngineOn(!engineOn);
          break;
        case "Escape":
          setSelected(null);
          setPromotion(null);
          setPremove(null);
          setResultOpen(false);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, nav, mode, engineOn]);

  // MARK: layout — two objects on a desk, in the golden ratio

  const deskRef = useRef<HTMLDivElement>(null);
  const [desk, setDesk] = useState({ w: 1100, h: 760 });
  useLayoutEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDesk({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reviewScore = mode === "review" && revFits && revPly >= 0 ? review?.evals[revPly]?.score ?? null : null;
  const evalScore = engineOn ? headline(analysis) : reviewScore;
  // The bar's slot is always reserved: showing or hiding it never moves the board.
  const showBar = settings.evalBar && (engineOn || (mode === "review" && revFits));
  const evalW = EVAL_BAR + GAP_13;
  const framePad = settings.coords === "inside" ? 21 : 8;
  const byHeight = desk.h - 2 * PLATE_H;
  const byWidth = (desk.w - evalW - GAP_34) / (1 + 1 / PHI);
  let frameOuter = Math.min(byHeight, byWidth, desk.w - evalW - GAP_34 - SHEET_MIN);
  const boardSize = Math.max(232, Math.floor((frameOuter - 2 * framePad) / 8) * 8);
  frameOuter = boardSize + 2 * framePad;
  const sheetW = Math.round(Math.min(SHEET_MAX, Math.max(SHEET_MIN, frameOuter / PHI)));
  const tableH = frameOuter + 2 * PLATE_H;

  // MARK: what the board shows

  const top: Side = bottom === "w" ? "b" : "w";
  const mat = material(board);
  const checkSq =
    mode === "editor" || preview ? null : atLiveTip ? (state.inCheck ? kingSquare(board, state.turn) : null) : inCheck(viewFen) ? kingSquare(board, turnOf(viewFen)) : null;
  const lastMove =
    !settings.highlightLast || mode === "editor" || preview ? null : atLiveTip ? state.last : viewNode?.ply ? { from: viewNode.ply.from, to: viewNode.ply.to } : null;

  const arrows = useMemo(() => {
    const out: Arrow[] = [];
    const sq = (u: string) => ({ from: squareIndex(u.slice(0, 2)), to: squareIndex(u.slice(2, 4)) });
    if (engineOn && settings.bestArrow && analysis.info) {
      analysis.info.lines.slice(0, 3).forEach((l, k) => {
        if (!l.pv[0]) return;
        const a = sq(l.pv[0]);
        if (!out.some((x) => x.from === a.from && x.to === a.to)) out.push({ ...a, brush: k === 0 ? "engine" : k === 1 ? "engine2" : "engine3" });
      });
    }
    if (plyReview?.best && ["inaccuracy", "mistake", "blunder"].includes(plyReview.cls)) out.push({ ...sq(plyReview.best), brush: "best" });
    if (hint && hint.fen === viewFen && !preview) out.push({ ...sq(hint.uci), brush: "best" });
    return out;
  }, [engineOn, settings.bestArrow, analysis.info, plyReview, hint, viewFen, preview]);

  const opening = mode === "editor" ? null : openingOf(book, pathTo(tree, cur).map((id) => tree.nodes[id].fen));

  const agentNote = (c: Side) => {
    const p = seat(c);
    return mode === "play" && state.coach && p.kind === "agent" && p.id === state.coachFrom ? state.coach : null;
  };

  const neverPlayed = state.status === "idle" && state.moves.length === 0;
  // The game's time control, named the way New Game offers it (3 | 2 · Blitz).
  const gameTc = state.clock
    ? TIME_CONTROLS.find((t) => t.minutes * 60_000 === state.clock!.initial && t.increment * 1000 === state.clock!.increment) ?? null
    : null;
  const showSetup = mode === "play" && (setup || neverPlayed);
  const showResult = resultOpen && mode === "play" && !showSetup && atLiveTip && over;

  const plate = (pos: "top" | "bottom") => {
    const c = pos === "top" ? top : bottom;
    const lead = c === "w" ? mat.diff : -mat.diff;
    const inGame = mode === "play" && !showSetup;
    const p = inGame ? seat(c) : ({ kind: "empty" } as Player);
    const turn = inGame ? playing && state.turn === c : mode !== "editor" && mode !== "play" && turnOf(viewFen) === c;
    return (
      <PlayerStrip
        color={c}
        player={p}
        agents={state.agents}
        isTurn={turn}
        thinking={inGame && playing && state.turn === c && (p.kind === "agent" || (p.kind === "engine" && engineSeat.thinking))}
        captured={mode === "editor" ? [] : mat.captured[c]}
        advantage={mode === "editor" ? 0 : lead}
        pieceSet={settings.pieceSet}
        note={agentNote(c)}
        noteUp={pos === "bottom"}
        nameOverride={inGame ? undefined : mode === "play" || mode === "editor" ? (c === "w" ? "White" : "Black") : currentNames[c]}
        clock={
          inGame && state.clock
            ? { ms: c === "w" ? state.clock.white : state.clock.black, running: state.clock.running === c && playing, at: clockAt }
            : null
        }
      />
    );
  };

  // MARK: the sheet

  const title = mode === "editor" ? "Board Editor" : mode === "analysis" ? "Analysis" : mode === "review" ? "Game Review" : showSetup ? "New Game" : "Game";

  const tools =
    mode === "analysis" ? (
      <>
        <IconButton label="Load PGN or FEN" onClick={() => setDialog("import")}>
          <Import size={18} />
        </IconButton>
        <IconButton label="Board Editor" onClick={() => setMode("editor")}>
          <EditorIcon size={18} />
        </IconButton>
      </>
    ) : null;

  const navRow = nav && (
    <nav className="nav" aria-label="Moves">
      <IconButton label="First move" onClick={nav.first} disabled={!nav.hasPrev}>
        <ToStart size={18} />
      </IconButton>
      <IconButton label="Previous move" onClick={nav.prev} disabled={!nav.hasPrev}>
        <ChevronLeft size={18} />
      </IconButton>
      <IconButton label="Next move" onClick={nav.next} disabled={!nav.hasNext}>
        <ChevronRight size={18} />
      </IconButton>
      <IconButton label="Last move" onClick={nav.last} disabled={!nav.hasNext}>
        <ToEnd size={18} />
      </IconButton>
      <span className="nav__gap" />
      {mode !== "review" && (
        <IconButton label={engineOn ? "Hide engine" : "Show engine"} onClick={() => setEngineOn(!engineOn)} className={engineOn ? "is-on" : ""}>
          <Engine size={18} />
        </IconButton>
      )}
      <IconButton label="Flip board" onClick={() => setBottom((b) => (b === "w" ? "b" : "w"))}>
        <Flip size={18} />
      </IconButton>
      <IconButton label="Copy PGN" onClick={() => void exportPgn()} disabled={tree.nodes[tree.root].children.length === 0}>
        <Copy size={18} />
      </IconButton>
      <button type="button" className="btn btn--small" onClick={() => void exportFen()}>
        FEN
      </button>
    </nav>
  );

  const moves = mode !== "editor" && (
    <MoveTree
      tree={tree}
      current={cur}
      onJump={setCur}
      verdicts={mode === "review" ? revVerdicts : undefined}
      figurines={settings.figurines}
      pieceSet={settings.pieceSet}
      names={currentNames}
      onPromote={mode === "play" ? undefined : (id) => place(promote(tree, id), cur)}
      onDelete={(id) => {
        const parent = tree.nodes[id].parent!;
        const onPath = pathTo(tree, cur).includes(id);
        place(cut(tree, id), onPath ? parent : cur);
      }}
      locked={mode === "play" ? (id) => !!playTree.nodes[id]?.live : mode === "review" ? (id) => isMainline(rev.tree, id) : undefined}
    />
  );

  const engineBlock = engineOn && mode !== "editor" && (
    <EnginePanel
      on={engineOn}
      onToggle={setEngineOn}
      analysis={analysis}
      multiPv={tableH < 640 ? 1 : tableH < 720 ? Math.min(2, settings.multiPv) : settings.multiPv}
      figurines={settings.figurines}
      pieceSet={settings.pieceSet}
      onPlayLine={(plies) => branch(plies.map((p) => p.uci))}
    />
  );

  const openingRow = opening ? (
    <div className="opening">
      <span className="opening__eco">{opening.eco}</span>
      <span className="opening__name" title={opening.name}>
        {opening.name}
      </span>
    </div>
  ) : (
    <div className="opening" />
  );

  let body: React.ReactNode;
  let foot: React.ReactNode = null;

  if (mode === "editor") {
    body = (
      <EditorPanel
        editor={editor}
        onAnalyze={(fen) => toAnalysis({ startFen: fen, plies: [] }, { w: "White", b: "Black" })}
        onPlay={(fen) => {
          setStartFen(fen);
          setSetup(true);
          setModeRaw("play");
        }}
      />
    );
  } else if (showSetup) {
    body = (
      <NewGame
        agents={state.agents}
        chaos={state.chaos}
        startFen={startFen}
        onClearFen={() => setStartFen(null)}
        onStart={(s) => void startGame(s)}
        onBack={neverPlayed ? undefined : () => setSetup(false)}
      />
    );
  } else if (mode === "play") {
    body = (
      <>
        {openingRow}
        {engineBlock}
        <div className="page">{moves}</div>
      </>
    );
    foot = (
      <>
        {navRow}
        <footer className="game">
          {over && (
            <div className="result-line">
              <span className="result-line__mark">{resultMark(state.result)}</span>
              <span>{resultWords(state).detail}</span>
            </div>
          )}
          {playing ? (
            <div className="game__row">
              <button type="button" className="btn" onClick={takeback} disabled={state.moves.length === 0}>
                <Undo size={16} /> Takeback
              </button>
              {humanSide && (
                <button type="button" className="btn" onClick={askHint} disabled={!humanTurn || !atLiveTip}>
                  <Bulb size={16} /> Hint
                </button>
              )}
              {state.hasHuman ? (
                <button type="button" className="btn btn--flag" onClick={() => run({ cmd: "resign" })}>
                  <Flag size={16} /> Resign
                </button>
              ) : (
                <button type="button" className="btn btn--flag" onClick={() => run({ cmd: "end" })}>
                  <Stop size={16} /> Stop
                </button>
              )}
            </div>
          ) : (
            <div className="game__row">
              <button type="button" className="btn btn--primary" onClick={() => openReview(liveLine, names)} disabled={state.moves.length === 0}>
                Game Review
              </button>
              <button type="button" className="btn" onClick={() => void rematch()} disabled={!state.seatsReady}>
                Rematch
              </button>
            </div>
          )}
          <div className="game__row">
            <button type="button" className={"btn" + (playing ? "" : " btn--quiet")} onClick={() => setSetup(true)}>
              New Game
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => toAnalysis(liveLine, names, depthOf(playTree, cur))} disabled={state.moves.length === 0}>
              Analysis
            </button>
          </div>
        </footer>
      </>
    );
  } else if (mode === "analysis") {
    body = (
      <>
        {openingRow}
        {engineBlock}
        <div className="page">{moves}</div>
      </>
    );
    foot = (
      <>
        {navRow}
        <footer className="game">
          <div className="game__row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={ana.tree.nodes[ana.tree.root].children.length === 0}
              onClick={() => openReview(mainLine(ana.tree), anaNames)}
            >
              Game Review
            </button>
            <button
              type="button"
              className="btn"
              disabled={!playable(viewFen)}
              onClick={() => {
                setStartFen(viewFen === START_FEN ? null : viewFen);
                setSetup(true);
                setModeRaw("play");
              }}
            >
              Play from Here
            </button>
          </div>
        </footer>
      </>
    );
  } else {
    const lastMain = pathTo(rev.tree, rev.cur).filter((id) => isMainline(rev.tree, id)).pop() ?? rev.tree.root;
    body = (
      <>
        <ReviewMode
          line={revLine}
          review={revFits ? review : null}
          progress={progress}
          ply={revPly < 0 ? depthOf(rev.tree, lastMain) : revPly}
          inVariation={revPly < 0}
          names={revNames}
          figurines={settings.figurines}
          pieceSet={settings.pieceSet}
          onJump={(ply) => rev.setCur(mainAt(rev.tree, ply))}
          onShowBest={(ply, uci) => {
            const at = mainAt(rev.tree, ply);
            const p = playUci(rev.tree.nodes[at].fen, uci);
            if (!p) return;
            const [t, id] = addPly(rev.tree, at, p);
            rev.setTree(t);
            rev.setCur(id);
          }}
          onRun={() => runReview(revLine)}
        />
        <div className="page">{moves}</div>
      </>
    );
    foot = (
      <>
        {navRow}
        <footer className="game">
          <button type="button" className="btn btn--primary btn--hero" onClick={() => nav?.next()} disabled={!nav?.hasNext}>
            Next Move
          </button>
          <div className="game__row">
            <button type="button" className="btn" onClick={() => toAnalysis(revLine, revNames, Math.max(0, revPly))}>
              Analysis
            </button>
            <button type="button" className="btn" onClick={() => runReview(revLine)} disabled={!!progress || revLine.plies.length === 0}>
              Review Again
            </button>
          </div>
        </footer>
      </>
    );
  }

  return (
    <div className={"app" + (macOverlay ? " app--mac" : "")} onPointerDown={unlockAudio}>
      {macOverlay && <div className="titlebar" data-tauri-drag-region />}
      <Rail mode={mode} onMode={setMode} onSettings={() => setDialog("settings")} settingsOpen={dialog === "settings"} />

      <div ref={deskRef} className="desk">
        <main className="table" style={{ "--evalw": `${evalW}px` } as React.CSSProperties}>
          {plate("top")}
          <div className="boardrow">
            <EvalBar score={evalScore} bottom={bottom} height={boardSize} visible={showBar} />
            <Board
              size={boardSize}
              board={board}
              bottom={bottom}
              theme={boardTheme(settings.boardTheme)}
              pieceSet={settings.pieceSet}
              coords={settings.coords === "inside"}
              animationMs={ANIMATION_MS[settings.animation]}
              showLegal={settings.showLegal}
              lastMove={lastMove}
              checkSq={checkSq}
              selected={selected}
              targets={targets}
              movable={movable}
              canDrop={canDrop}
              onSelect={setSelected}
              onMove={onMove}
              promotion={promotion}
              onPromote={(role) => {
                const p = promotion;
                setPromotion(null);
                if (p && role) commit(p.from, p.to, role);
              }}
              arrows={arrows}
              badge={plyReview && viewNode?.ply ? { sq: viewNode.ply.to, cls: plyReview.cls } : null}
              positionKey={viewFen}
              premove={preview ? null : premove}
              edit={mode === "editor" ? { tool: editor.st.tool, onEdit: editor.edit } : undefined}
              overlay={
                showResult ? (
                  <ResultCard
                    state={state}
                    names={names}
                    onClose={() => setResultOpen(false)}
                    onRematch={() => void rematch()}
                    onNewGame={() => {
                      setResultOpen(false);
                      setSetup(true);
                    }}
                    onReview={() => {
                      setResultOpen(false);
                      openReview(liveLine, names);
                    }}
                  />
                ) : null
              }
            />
          </div>
          {plate("bottom")}
        </main>

        <aside className="sheet" style={{ width: sheetW, height: tableH }} aria-label={title}>
          <header className="sheet__head">
            <h1 className="sheet__title">
              {title}
              {mode === "play" && !showSetup && gameTc && (
                <span className="sheet__tc">
                  <SpeedIcon speed={gameTc.speed} size={16} />
                  {tcLabel(gameTc)}
                </span>
              )}
            </h1>
            <div className="sheet__tools">{tools}</div>
          </header>
          {body}
          {foot}
        </aside>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "import" && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onImport={(g) => {
            setDialog(null);
            toAnalysis(g.line, { w: g.headers.White || "White", b: g.headers.Black || "Black" }, 0);
          }}
        />
      )}
    </div>
  );
}
