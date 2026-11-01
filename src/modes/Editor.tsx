//! Board Editor: set up any position, then analyse it or play it.

import { useCallback, useMemo, useState } from "react";
import { START_FEN, type Side } from "../bridge";
import { boardFromFen, inCheck, load } from "../lib/chess";
import { useSettings } from "../lib/settings";
import { Eraser, Hand } from "../icons";
import { PieceImg, type EditEvent, type EditTool } from "../components/Board";
import { Segmented } from "../components/ui";

type Castle = { K: boolean; Q: boolean; k: boolean; q: boolean };
export type EditorState = { board: (string | null)[]; turn: Side; castle: Castle; tool: EditTool };

const PIECES = ["K", "Q", "R", "B", "N", "P"];

function stateFromFen(fen: string): EditorState | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2 || (parts[0].match(/\//g) ?? []).length !== 7) return null;
  const rights = parts[2] ?? "-";
  return {
    board: boardFromFen(parts[0]),
    turn: parts[1] === "b" ? "b" : "w",
    castle: { K: rights.includes("K"), Q: rights.includes("Q"), k: rights.includes("k"), q: rights.includes("q") },
    tool: "hand",
  };
}

/** Which castling rights the pieces on the board still allow. */
function possible(board: (string | null)[]): Castle {
  return {
    K: board[4] === "wK" && board[7] === "wR",
    Q: board[4] === "wK" && board[0] === "wR",
    k: board[60] === "bK" && board[63] === "bR",
    q: board[60] === "bK" && board[56] === "bR",
  };
}

export function fenOf(st: EditorState): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[r * 8 + f];
      if (!p) gap++;
      else {
        if (gap) row += gap;
        gap = 0;
        row += p[0] === "w" ? p[1] : p[1].toLowerCase();
      }
    }
    if (gap) row += gap;
    rows.push(row);
  }
  const can = possible(st.board);
  const rights = (["K", "Q", "k", "q"] as const).filter((k) => st.castle[k] && can[k]).join("") || "-";
  return `${rows.join("/")} ${st.turn} ${rights} - 0 1`;
}

/** Why a position cannot be played or analysed, or null when it can. */
export function problem(st: EditorState): string | null {
  const count = (code: string) => st.board.filter((p) => p === code).length;
  if (count("wK") !== 1) return "White needs exactly one king";
  if (count("bK") !== 1) return "Black needs exactly one king";
  for (let f = 0; f < 8; f++) {
    if (st.board[f]?.[1] === "P" || st.board[56 + f]?.[1] === "P") return "Pawns can’t stand on the first or last rank";
  }
  const fen = fenOf(st);
  const flipped = fen.replace(/ [wb] /, ` ${st.turn === "w" ? "b" : "w"} `);
  if (inCheck(flipped)) return st.turn === "w" ? "Black is in check — Black must be to move" : "White is in check — White must be to move";
  if (!load(fen)) return "Not a legal position";
  return null;
}

export function useEditor() {
  const [st, setSt] = useState<EditorState>(() => stateFromFen(START_FEN)!);
  const edit = useCallback(
    (e: EditEvent) =>
      setSt((s) => {
        const board = s.board.slice();
        if (e.type === "place" && s.tool.length === 2) board[e.sq] = s.tool;
        if (e.type === "remove") board[e.sq] = null;
        if (e.type === "move") {
          board[e.to] = board[e.from];
          board[e.from] = null;
        }
        return { ...s, board };
      }),
    [],
  );
  const setFen = useCallback((fen: string) => {
    const next = stateFromFen(fen);
    if (next) setSt((s) => ({ ...next, tool: s.tool }));
    return !!next;
  }, []);
  return { st, setSt, edit, setFen };
}

export function EditorPanel({
  editor,
  onAnalyze,
  onPlay,
}: {
  editor: ReturnType<typeof useEditor>;
  onAnalyze: (fen: string) => void;
  onPlay: (fen: string) => void;
}) {
  const s = useSettings();
  const { st, setSt, setFen } = editor;
  const fen = useMemo(() => fenOf(st), [st]);
  const issue = useMemo(() => problem(st), [st]);
  const [draft, setDraft] = useState<string | null>(null);
  const can = possible(st.board);

  const tool = (t: EditTool, body: React.ReactNode, label: string) => (
    <button
      key={t}
      type="button"
      role="radio"
      aria-checked={st.tool === t}
      aria-label={label}
      title={label}
      className="palette__tool"
      onClick={() => setSt((x) => ({ ...x, tool: t }))}
    >
      {body}
    </button>
  );

  return (
    <div className="ng">
      <div className="ng__body">
      <div className="palette" role="radiogroup" aria-label="Tool">
        {tool("hand", <Hand size={21} />, "Move pieces")}
        {PIECES.map((p) => tool("w" + p, <PieceImg code={"w" + p} set={s.pieceSet} />, `White ${p}`))}
        {tool("erase", <Eraser size={21} />, "Remove pieces")}
        {PIECES.map((p) => tool("b" + p, <PieceImg code={"b" + p} set={s.pieceSet} />, `Black ${p}`))}
      </div>

      <div className="editor__row">
        <button type="button" className="btn" onClick={() => setFen(START_FEN)}>
          Starting Position
        </button>
        <button type="button" className="btn" onClick={() => setSt((x) => ({ ...x, board: Array(64).fill(null), castle: { K: false, Q: false, k: false, q: false } }))}>
          Clear Board
        </button>
      </div>

      <div className="field">
        <span className="field__label">To move</span>
        <Segmented
          label="To move"
          value={st.turn}
          onChange={(v) => setSt((x) => ({ ...x, turn: v }))}
          options={[
            { value: "w", label: "White" },
            { value: "b", label: "Black" },
          ]}
        />
      </div>

      <div className="field">
        <span className="field__label">Castling</span>
        <div className="castle">
          {(
            [
              ["K", "White O-O"],
              ["Q", "White O-O-O"],
              ["k", "Black O-O"],
              ["q", "Black O-O-O"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="checkbox"
              aria-checked={st.castle[k] && can[k]}
              disabled={!can[k]}
              className="toggle"
              onClick={() => setSt((x) => ({ ...x, castle: { ...x.castle, [k]: !x.castle[k] } }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field field--stack">
        <span className="field__label">FEN</span>
        <input
          className="input input--mono"
          value={draft ?? fen}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) setFen(draft);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(null);
          }}
          aria-invalid={draft !== null && !draft.trim().match(/^\S+\/\S+ [wb]/)}
        />
      </div>

      {issue && <p className="editor__issue" role="alert">{issue}</p>}
      </div>
      <footer className="ng__foot">
        <div className="editor__row">
          <button type="button" className="btn btn--primary btn--hero" disabled={!!issue} onClick={() => onAnalyze(fen)}>
            Analyze
          </button>
          <button type="button" className="btn btn--hero" disabled={!!issue} onClick={() => onPlay(fen)}>
            Play from Here
          </button>
        </div>
      </footer>
    </div>
  );
}
