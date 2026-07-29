//! The 528×528 board: 64 squares of 66 pt, the coordinate overlay, and the four
//! per-square layers in the Swift z-order (last-move wash → piece → target → selection).

import { useState } from "react";
import { fileOf, rankOf, type ChessState } from "./bridge";

export const BOARD_SIDE = 528;
export const SQUARE = BOARD_SIDE / 8; // 66

const GLYPH: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

/** BoardView.squareFor(row:column:) — row/column count from the top-left of the display. */
export function squareFor(row: number, column: number, orientationWhite: boolean): number {
  const rank = orientationWhite ? 7 - row : row;
  const file = orientationWhite ? column : 7 - column;
  return rank * 8 + file;
}

/** The cburnett art, at the Swift scale (86 %) and vertical nudge (+1.2 % of the side). */
export function PieceIcon({ code, side }: { code: string; side: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="glyph"
        style={{ fontSize: side * 0.88, color: code[0] === "w" ? "#fff" : "#000" }}
      >
        {GLYPH[code] ?? ""}
      </span>
    );
  }
  return (
    <img
      className="piece"
      src={`/pieces/${code}.png`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{
        width: side * 0.86,
        height: side * 0.86,
        transform: `translate(-50%, -50%) translateY(${side * 0.012}px)`,
      }}
    />
  );
}

export function Board({
  state,
  orientationWhite,
  selected,
  targets,
  onTap,
}: {
  state: ChessState;
  orientationWhite: boolean;
  selected: number | null;
  targets: Set<number>;
  onTap: (sq: number) => void;
}) {
  const cells = [];
  for (let display = 0; display < 64; display++) {
    const row = Math.floor(display / 8);
    const column = display % 8;
    const sq = squareFor(row, column, orientationWhite);
    const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
    const piece = state.board[sq] ?? null;
    const isSelected = selected === sq;
    const isTarget = targets.has(sq);
    const isLast = state.last ? state.last.from === sq || state.last.to === sq : false;
    const coordColor = light ? "rgba(111,143,80,0.90)" : "rgba(236,237,208,0.92)";

    cells.push(
      <div
        key={display}
        className={"sq " + (light ? "sq--light" : "sq--dark")}
        style={{ left: column * SQUARE, top: row * SQUARE }}
        onClick={() => onTap(sq)}
      >
        {isLast && <span className="sq__last" />}
        {piece && <PieceIcon key={piece} code={piece} side={SQUARE} />}
        {isTarget && (piece ? <span className="sq__ring" /> : <span className="sq__dot" />)}
        {isSelected && <span className="sq__sel" />}
        {fileOf(sq) === (orientationWhite ? 0 : 7) && (
          <span className="coord coord--rank" style={{ color: coordColor }}>
            {rankOf(sq) + 1}
          </span>
        )}
        {rankOf(sq) === (orientationWhite ? 0 : 7) && (
          <span className="coord coord--file" style={{ color: coordColor }}>
            {"abcdefgh"[fileOf(sq)]}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="boardwrap">
      <div className="board">
        {cells}
        <div className="board__edge" />
      </div>
    </div>
  );
}
