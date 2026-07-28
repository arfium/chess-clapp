import { useEffect, useMemo, useState } from "react";
import { cmd, onState, type ChessState, type Player } from "./bridge";

const GLYPH: Record<string, string> = {
  wP: "♙", wN: "♘", wB: "♗", wR: "♖", wQ: "♕", wK: "♔",
  bP: "♟", bN: "♞", bB: "♝", bR: "♜", bQ: "♛", bK: "♚",
};

const EMPTY: ChessState = {
  fen: "", turn: "w", status: "idle", result: null, winner: null, inCheck: false,
  board: Array(64).fill(null), white: { kind: "empty" }, black: { kind: "empty" },
  yourColor: null, last: null, legal: [], moves: [], seatsReady: false, hasHuman: false, agents: [],
};

export default function App() {
  const [s, setS] = useState<ChessState>(EMPTY);
  const [sel, setSel] = useState<number | null>(null);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    let un: (() => void) | undefined;
    onState(setS).then((f) => (un = f));
    cmd({ cmd: "state" }).then(setS).catch(() => {});
    return () => un?.();
  }, []);

  const run = (req: unknown) => cmd(req).then(setS).catch(() => {});

  const bottom = flip ? "b" : "w";
  const top = flip ? "w" : "b";
  const humanTurn = s.status === "playing" && (s.turn === "w" ? s.white : s.black).kind === "human";

  const targets = useMemo(() => new Set(sel === null ? [] : s.legal.filter((m) => m.from === sel).map((m) => m.to)), [sel, s.legal]);

  function clickSquare(sq: number) {
    if (sel !== null && targets.has(sq)) {
      const piece = s.board[sel];
      const promo = piece && piece[1] === "P" && (sq >= 56 || sq < 8) ? "q" : "";
      run({ cmd: "move", uci: name(sel) + name(sq) + promo });
      setSel(null);
      return;
    }
    const p = s.board[sq];
    if (humanTurn && p && p[0] === s.turn) setSel(sq);
    else setSel(null);
  }

  function newGame() {
    if (s.white.kind === "human" && s.black.kind !== "human") setFlip(false);
    else if (s.black.kind === "human" && s.white.kind !== "human") setFlip(true);
    run({ cmd: "new" });
  }

  return (
    <div className="app">
      <Strip color={top} player={top === "w" ? s.white : s.black} turn={s.turn} status={s.status} agents={s.agents} onSeat={(who) => run({ cmd: "seat", color: top, who })} />
      <Board state={s} bottom={bottom} sel={sel} targets={targets} onClick={clickSquare} />
      <Strip color={bottom} player={bottom === "w" ? s.white : s.black} turn={s.turn} status={s.status} agents={s.agents} onSeat={(who) => run({ cmd: "seat", color: bottom, who })} />
      <div className="controls">
        <span className="status">{statusText(s)}</span>
        <div className="btns">
          <button className="primary" disabled={!s.seatsReady} onClick={newGame}>New Game</button>
          <button onClick={() => setFlip((f) => !f)} title="Flip board">⇅</button>
          <button className="danger" disabled={s.status !== "playing"} onClick={() => run({ cmd: s.hasHuman ? "resign" : "end" })}>
            {s.hasHuman ? "Resign" : "End"}
          </button>
        </div>
      </div>
      <MoveList moves={s.moves} />
    </div>
  );
}

function Board({ state, bottom, sel, targets, onClick }: { state: ChessState; bottom: string; sel: number | null; targets: Set<number>; onClick: (sq: number) => void }) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rank = bottom === "w" ? 7 - r : r;
      const file = bottom === "w" ? c : 7 - c;
      const sq = rank * 8 + file;
      const light = (rank + file) % 2 === 1;
      const piece = state.board[sq];
      const isSel = sel === sq;
      const isTarget = targets.has(sq);
      const isLast = state.last && (state.last.from === sq || state.last.to === sq);
      rows.push(
        <div
          key={sq}
          className={"sq" + (light ? " light" : " dark") + (isSel ? " sel" : "") + (isLast ? " last" : "")}
          onClick={() => onClick(sq)}
        >
          {piece && <span className="pc">{GLYPH[piece] ?? ""}</span>}
          {isTarget && <span className={piece ? "cap" : "dot"} />}
        </div>
      );
    }
  }
  return <div className="board">{rows}</div>;
}

function Strip({ color, player, turn, status, agents, onSeat }: { color: string; player: Player; turn: string; status: string; agents: { id: string; name: string }[]; onSeat: (who: string) => void }) {
  const isTurn = status === "playing" && turn === color;
  const label = player.kind === "empty" ? "Choose player" : player.kind === "human" ? "You" : player.name ?? "Agent";
  const value = player.kind === "empty" ? "empty" : player.kind === "human" ? "human" : player.id ?? "";
  const mono = (player.kind === "agent" ? player.name : player.kind === "human" ? "You" : "?")?.[0]?.toUpperCase() ?? "?";
  return (
    <div className={"strip" + (isTurn ? " on" : "")}>
      <div className={"ava " + player.kind}>{player.kind === "empty" ? "+" : mono}</div>
      <div className="who">
        <div className="nm">{label}</div>
        <div className="sub">{isTurn ? "to move" : player.kind === "agent" ? "agent" : player.kind === "human" ? "human" : " "}</div>
      </div>
      <span className={"chip " + (color === "w" ? "wc" : "bc")}>{color === "w" ? "White" : "Black"}</span>
      <select value={value} onChange={(e) => onSeat(e.target.value)}>
        <option value="empty">Empty</option>
        <option value="human">You</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}

function MoveList({ moves }: { moves: string[] }) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([i / 2 + 1, moves[i], moves[i + 1]]);
  return (
    <div className="movelist">
      {pairs.length === 0 && <span className="empty">Moves will appear here</span>}
      {pairs.map(([n, w, b]) => (
        <span key={n as number} className="mv"><b>{n}.</b> {w} {b ?? ""}</span>
      ))}
    </div>
  );
}

function name(sq: number): string {
  return String.fromCharCode(97 + (sq % 8)) + (Math.floor(sq / 8) + 1);
}

function statusText(s: ChessState): string {
  switch (s.status) {
    case "idle": return s.seatsReady ? "Ready — press New Game" : "Pick both players";
    case "checkmate": return `Checkmate — ${s.winner === "w" ? "White" : "Black"} wins`;
    case "resigned": return `${s.winner === "w" ? "White" : "Black"} wins`;
    case "stalemate": return "Stalemate — draw";
    case "draw": return "Draw";
    case "ended": return "Game ended";
    default: return s.inCheck ? `${s.turn === "w" ? "White" : "Black"} — check` : `${s.turn === "w" ? "White" : "Black"} to move`;
  }
}
