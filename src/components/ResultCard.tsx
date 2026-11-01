//! The end of a game: a slip of paper laid on the board — the score in the pen, who won
//! and how, who played, and the two things you are likely to want next.

import type { ChessState } from "../bridge";
import { Close } from "../icons";
import { IconButton } from "./ui";

export function resultWords(s: ChessState): { title: string; detail: string } {
  const side = (c: string | null) => (c === "b" ? "Black" : "White");
  switch (s.status) {
    case "checkmate":
      return { title: `${side(s.winner)} wins`, detail: s.chaos ? "The king was captured" : "Checkmate" };
    case "resigned":
      return { title: `${side(s.winner)} wins`, detail: `${side(s.winner === "w" ? "b" : "w")} resigned` };
    case "timeout":
      return { title: `${side(s.winner)} wins`, detail: "On time" };
    case "stalemate":
      return { title: "Drawn", detail: "Stalemate" };
    case "draw":
      return {
        title: "Drawn",
        detail:
          s.drawReason === "repetition"
            ? "Threefold repetition"
            : s.drawReason === "fifty"
              ? "Fifty moves without a capture or a pawn move"
              : s.drawReason === "timeout"
                ? "Timeout vs insufficient material"
                : s.drawReason === "insufficient"
                ? "Neither side can still checkmate"
                : "Drawn game",
      };
    case "ended":
      return { title: "Game stopped", detail: "No result" };
    default:
      return { title: "", detail: "" };
  }
}

/** "1-0" → "1–0", "1/2-1/2" → "½–½" — the way a result is written on the sheet. */
export const resultMark = (r: string | null) => (r ? r.replaceAll("1/2", "½").replace("-", "–") : "–");

export function ResultCard({
  state,
  names,
  onReview,
  onRematch,
  onNewGame,
  onClose,
}: {
  state: ChessState;
  names: { w: string; b: string };
  onReview: () => void;
  onRematch: () => void;
  onNewGame: () => void;
  onClose: () => void;
}) {
  const { title, detail } = resultWords(state);
  return (
    <div className="result" role="dialog" aria-label="Game over">
      <div className="result__slip">
        <IconButton label="Close" onClick={onClose} className="result__close">
          <Close size={15} />
        </IconButton>
        <div className="result__score">{resultMark(state.result)}</div>
        <h2 className="result__title">{title}</h2>
        <p className="result__detail">{detail}</p>
        <dl className="result__players">
          <dt>
            <i className="side side--w" /> White
          </dt>
          <dd>{names.w}</dd>
          <dt>
            <i className="side side--b" /> Black
          </dt>
          <dd>{names.b}</dd>
        </dl>
        <button type="button" className="btn btn--primary btn--hero" onClick={onReview} disabled={state.moves.length === 0}>
          Game Review
        </button>
        <div className="result__actions">
          <button type="button" className="btn" onClick={onRematch} disabled={!state.seatsReady}>
            Rematch
          </button>
          <button type="button" className="btn" onClick={onNewGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
