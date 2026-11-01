//! The eval bar: White's winning chances rising from White's side of the board, as tall
//! as the squares so its midline is the board's. The score is written inside the bar at
//! the winning end, in the opposite colour of the part it sits on.
//!
//! It always keeps its place: with nothing to show it fades out, but the slot stays, so
//! turning the engine on or off never moves the board.

import { winPercent, type Score } from "../engine/engine";
import { formatScore } from "../lib/chess";
import type { Side } from "../bridge";

export function EvalBar({ score, bottom, height, visible }: { score: Score | null; bottom: Side; height: number; visible: boolean }) {
  const white = score ? winPercent(score) : 50;
  const whiteBetter = white >= 50;
  const label = score
    ? score.mate !== undefined && score.mate !== 0
      ? `M${Math.abs(score.mate)}`
      : formatScore(score).replace(/^[+−]/, "")
    : "";
  const labelAtBottom = whiteBetter === (bottom === "w");
  return (
    <div
      className={"evalbar" + (visible ? "" : " evalbar--hidden")}
      style={{ height }}
      role="meter"
      aria-hidden={!visible}
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={score ? formatScore(score) : "no evaluation"}
    >
      <div className={"evalbar__w" + (bottom === "w" ? "" : " evalbar__w--top")} style={{ transform: `scaleY(${white / 100})` }} />
      <div className="evalbar__mid" />
      {label && (
        <span
          className={
            "evalbar__label " +
            (labelAtBottom ? "evalbar__label--bottom" : "evalbar__label--top") +
            (whiteBetter ? " evalbar__label--on-w" : " evalbar__label--on-b") +
            (label.length > 3 ? " evalbar__label--long" : "")
          }
        >
          {label}
        </span>
      )}
    </div>
  );
}
