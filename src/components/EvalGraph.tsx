//! The game's tide: White's winning chances across every position, ivory below the line
//! and ebony above, the same two materials as the eval bar. Mistakes and blunders are
//! marked where they happened; click anywhere to go to that move.

import { useMemo, useRef, useState } from "react";
import { winPercent } from "../engine/engine";
import type { Review } from "../engine/review";
import { formatScore, type Line } from "../lib/chess";

export function EvalGraph({
  review,
  line,
  cursor,
  onJump,
  height = 55,
}: {
  review: Review;
  line: Line;
  /** Position index on the mainline (0 = start). */
  cursor: number;
  onJump: (ply: number) => void;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = review.evals.length;
  const W = 1000;
  const H = 100;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (w: number) => H - (w / 100) * H;

  const path = useMemo(() => {
    const pts: string[] = [];
    let last = 50;
    review.evals.forEach((e, i) => {
      const w = e ? winPercent(e.score) : last;
      last = w;
      pts.push(`${x(i).toFixed(1)},${y(w).toFixed(2)}`);
    });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, n]);

  if (n < 2) return null;
  const area = `M0,${H} L${path.join(" L")} L${W},${H} Z`;
  const linePath = `M${path.join(" L")}`;

  const indexAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(t * (n - 1));
  };

  const marks = review.plies
    .map((p, i) => (p && (p.cls === "mistake" || p.cls === "blunder" || p.cls === "inaccuracy" || p.cls === "brilliant") ? { i: i + 1, cls: p.cls } : null))
    .filter(Boolean) as { i: number; cls: string }[];

  const hv = hover !== null ? review.evals[hover] : null;
  const hoverPly = hover !== null && hover > 0 ? line.plies[hover - 1] : null;

  return (
    <div className="graph" style={{ height }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={(e) => setHover(indexAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          const i = indexAt(e.clientX);
          if (i !== null) onJump(i);
        }}
        role="img"
        aria-label="Evaluation over the game"
      >
        <rect x="0" y="0" width={W} height={H} className="graph__ebony" />
        <path d={area} className="graph__ivory" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="graph__mid" />
        <path d={linePath} className="graph__line" vectorEffect="non-scaling-stroke" />
        <line x1={x(cursor)} x2={x(cursor)} y1="0" y2={H} className="graph__cursor" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="graph__hover" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {marks.map((m) => {
        const e = review.evals[m.i];
        const w = e ? winPercent(e.score) : 50;
        return (
          <span
            key={m.i}
            className={`graph__mark graph__mark--${m.cls}`}
            style={{ left: `${(x(m.i) / W) * 100}%`, top: `${(y(w) / H) * 100}%` }}
          />
        );
      })}
      {hover !== null && (
        <div className="graph__tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          {hoverPly ? (
            <>
              <b>
                {Math.ceil(hover / 2)}
                {hoverPly.color === "w" ? "." : "…"} {hoverPly.san}
              </b>{" "}
            </>
          ) : (
            <b>Start </b>
          )}
          {formatScore(hv?.score)}
        </div>
      )}
    </div>
  );
}
