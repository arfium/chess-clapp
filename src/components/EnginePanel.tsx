//! The engine's block on the sheet: whether it is looking, how deep it has looked, and
//! its best lines in the position on the board. Engine output is printed matter — graphite,
//! never the pen. A click on any move of a line plays the line up to it, as a variation.

import { headline, type Analysis } from "../engine/useAnalysis";
import { formatScore, moveLabel, pvToPlies, type Ply } from "../lib/chess";
import { San } from "./San";

function fmtNps(nps: number): string {
  if (nps >= 1e6) return `${(nps / 1e6).toFixed(1)} M nodes/s`;
  if (nps >= 1e3) return `${Math.round(nps / 1e3)} k nodes/s`;
  return `${nps} nodes/s`;
}

export function EnginePanel({
  on,
  onToggle,
  analysis,
  multiPv,
  figurines,
  pieceSet,
  onPlayLine,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  analysis: Analysis;
  multiPv: number;
  figurines: boolean;
  pieceSet: string;
  onPlayLine: (plies: Ply[]) => void;
}) {
  const info = analysis.info;
  const score = headline(analysis);

  return (
    <section className="engine" aria-label="Engine">
      <div className="engine__head">
        <div className="engine__id">
          <div className="engine__name">Stockfish 18</div>
          <div className="engine__meta">
            {!on
              ? "Not analysing"
              : analysis.unavailable
                ? "Can’t read this position"
                : analysis.terminal
                  ? `No moves — ${analysis.terminal.reason}`
                  : info && info.depth > 0
                    ? `Depth ${info.depth} · ${fmtNps(info.nps)}`
                    : "Starting…"}
          </div>
        </div>
        {on && <div className="engine__score">{formatScore(score)}</div>}
        <button type="button" className="btn btn--small" aria-pressed={on} onClick={() => onToggle(!on)}>
          {on ? "Stop" : "Analyse"}
          <kbd className="btn__key">E</kbd>
        </button>
      </div>
      {on && (
        <div className="engine__lines">
          {analysis.unavailable && <p className="engine__msg">{analysis.unavailable}</p>}
          {!analysis.unavailable &&
            !analysis.terminal &&
            Array.from({ length: multiPv }).map((_, k) => {
              const l = info?.lines[k];
              if (!l) return <div key={k} className="pv pv--empty" />;
              const plies = pvToPlies(analysis.fen, l.pv, 14);
              const white = (l.score.mate ?? l.score.cp ?? 0) >= 0;
              return (
                <div key={k} className="pv">
                  <span className={"pv__score " + (white ? "pv__score--w" : "pv__score--b")}>{formatScore(l.score)}</span>
                  <span className="pv__moves">
                    {plies.map((p, j) => {
                      const before = j === 0 ? analysis.fen : plies[j - 1].fen;
                      const showNo = j === 0 || p.color === "w";
                      return (
                        <button key={j} type="button" className="pv__mv" onClick={() => onPlayLine(plies.slice(0, j + 1))}>
                          {showNo && <span className="pv__no">{moveLabel(before, p.color)}</span>}
                          <San san={p.san} color={p.color} figurines={figurines} set={pieceSet} />
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
