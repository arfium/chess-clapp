//! Game Review: accuracy for both sides, the evaluation graph, and the move on the board
//! judged — with the better move one click away.

import { CLASS_META, CLASSES, type Classification, type Review } from "../engine/review";
import { fenBefore, formatScore, playUci, type Line } from "../lib/chess";
import { San } from "../components/San";
import { VerdictIcon } from "../components/VerdictIcon";
import { EvalGraph } from "../components/EvalGraph";
import type { ReviewProgress } from "../engine/review";

const PHRASE: Record<Classification, string> = {
  brilliant: "is brilliant",
  great: "is a great move",
  best: "is best",
  excellent: "is excellent",
  good: "is good",
  book: "is a book move",
  inaccuracy: "is an inaccuracy",
  mistake: "is a mistake",
  blunder: "is a blunder",
};

export function ReviewMode({
  line,
  review,
  progress,
  ply,
  inVariation,
  names,
  figurines,
  pieceSet,
  onJump,
  onShowBest,
  onRun,
}: {
  line: Line;
  review: Review | null;
  progress: ReviewProgress;
  /** Main-line position on the board (0 = start). */
  ply: number;
  inVariation: boolean;
  names: { w: string; b: string };
  figurines: boolean;
  pieceSet: string;
  onJump: (ply: number) => void;
  onShowBest: (ply: number, uci: string) => void;
  onRun: () => void;
}) {
  if (line.plies.length === 0) {
    return (
      <div className="review">
        <p className="empty">No moves to review</p>
      </div>
    );
  }

  const sides = review?.sides;
  const r = ply > 0 ? review?.plies[ply - 1] : null;
  const p = ply > 0 ? line.plies[ply - 1] : null;
  const after = review?.evals[ply]?.score;
  const best = r?.best && p ? playUci(fenBefore(line, ply - 1), r.best) : null;
  const showBest = r && best && !["best", "great", "book"].includes(r.cls) && best.uci !== p?.uci;

  return (
    <div className="review">
      <div className="acc">
        {(["w", "b"] as const).map((c) => (
          <div key={c} className="acc__side">
            <span className="acc__who">
              <i className={"side side--" + c} />
              {names[c]}
            </span>
            <div className="acc__num">{sides?.[c].accuracy != null ? `${sides[c].accuracy!.toFixed(1)}` : "–"}</div>
          </div>
        ))}
      </div>

      {progress && (
        <div className="review__progress" role="status" aria-label="Reviewing">
          <div className="bar">
            <div className="bar__fill" style={{ transform: `scaleX(${progress.done / Math.max(1, progress.total)})` }} />
          </div>
        </div>
      )}

      {review && review.evals.length > 1 && <EvalGraph review={review} line={line} cursor={ply} onJump={onJump} />}

      {!progress && !review && (
        <button type="button" className="btn btn--primary btn--hero" onClick={onRun}>
          Start Review
        </button>
      )}

      {review && ply === 0 && (
        <table className="tally">
          <tbody>
            {CLASSES.map((cls) => {
              const w = review.sides.w.counts[cls];
              const b = review.sides.b.counts[cls];
              return (
                <tr key={cls} className={w + b === 0 ? "tally--zero" : ""}>
                  <td>{w}</td>
                  <td>
                    <span className="tally__label">
                      <VerdictIcon cls={cls} size={20} />
                      {CLASS_META[cls].label}
                    </span>
                  </td>
                  <td>{b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {r && p && !inVariation && (
        <div className={`verdict verdict--${r.cls}`}>
          <VerdictIcon cls={r.cls} size={34} />
          <div className="verdict__text">
            <div className="verdict__line">
              <b>
                <San san={p.san} figurines={figurines} set={pieceSet} />
              </b>{" "}
              {PHRASE[r.cls]}
            </div>
            {after && <div className="verdict__eval">{formatScore(after)}</div>}
          </div>
          {showBest && (
            <button type="button" className="btn btn--small" onClick={() => onShowBest(ply - 1, r.best!)}>
              Best <San san={best!.san} figurines={figurines} set={pieceSet} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
