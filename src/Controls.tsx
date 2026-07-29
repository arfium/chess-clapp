//! The 132 pt control block: status + buttons, the moves rail, the options row.
//! Layout is `VStack(spacing: 10)` with 12 pt top padding inside the 24 pt gutter, over a
//! full-bleed 1 pt hairline at y = 0.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ChessState, MoveRow } from "./bridge";
import { UturnBackward } from "./icons";

const colorName = (c: string | null) => (c === "b" ? "Black" : "White");

export function statusText(s: ChessState): string {
  switch (s.status) {
    case "idle":
      return s.seatsReady ? "Ready to start" : "Pick both players";
    case "checkmate":
      return `Checkmate — ${colorName(s.winner)} wins`;
    case "resigned":
      return `${colorName(s.winner)} wins`;
    case "stalemate":
      return "Stalemate — draw";
    case "draw":
      return "Draw";
    case "ended":
      return "Game ended";
    default:
      return s.inCheck ? `${colorName(s.turn)} — check` : `${colorName(s.turn)} to move`;
  }
}

function statusClass(s: ChessState): string {
  switch (s.status) {
    case "idle":
      return s.seatsReady ? "t-text" : "t-secondary";
    case "checkmate":
    case "resigned":
    case "stalemate":
    case "draw":
    case "ended":
      return "t-text";
    default:
      return s.inCheck ? "t-danger" : "t-secondary";
  }
}

/**
 * One chip per move PAIR: [number, white SAN, black SAN] — `BoardView.movePairs`.
 * The half is chosen by the move's COLOUR, not by index parity, so a history that opens
 * on Black (a takeback, a chaos game) still lands in the right column and the missing
 * White half renders as "…".
 */
function movePairs(moves: MoveRow[]): [number, string, string][] {
  const pairs: [number, string, string][] = [];
  moves.forEach((move, index) => {
    const pair = Math.floor(index / 2);
    if (pair >= pairs.length) pairs.push([pair + 1, "", ""]);
    if (move.color === "w") pairs[pair][1] = move.san;
    else pairs[pair][2] = move.san;
  });
  return pairs;
}

/**
 * SwiftUI's `.minimumScaleFactor(f)`: a one-line label shrinks (down to `f`) rather than
 * truncating. CSS has no equivalent, so measure the natural width against the box and
 * scale the text — the box itself never moves.
 */
function FitText({
  min,
  origin,
  className,
  children,
}: {
  min: number;
  origin: "left" | "center";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    el.style.transform = ""; // measure unscaled
    const natural = el.getBoundingClientRect().width;
    const room = box.clientWidth;
    if (natural <= room || natural === 0) return;
    el.style.transform = `scale(${Math.max(min, room / natural)})`;
  });

  return (
    <span
      ref={ref}
      className={"fit" + (className ? " " + className : "")}
      style={{ transformOrigin: `${origin} center` }}
    >
      {children}
    </span>
  );
}

export function Controls({
  state,
  chaos,
  orientationWhite,
  onNewGame,
  onTakeback,
  onResign,
  onEndGame,
  onChaos,
  onOrientation,
}: {
  state: ChessState;
  chaos: boolean;
  orientationWhite: boolean;
  onNewGame: () => void;
  onTakeback: () => void;
  onResign: () => void;
  onEndGame: () => void;
  onChaos: (on: boolean) => void;
  onOrientation: (white: boolean) => void;
}) {
  const pairs = movePairs(state.moves);
  const notPlaying = state.status !== "playing";

  return (
    <div className="controls">
      <div className="controls__row1">
        <div className={"status " + statusClass(state)}>
          <FitText min={0.7} origin="left">
            {statusText(state)}
          </FitText>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--new"
          disabled={!state.seatsReady}
          onClick={onNewGame}
        >
          <FitText min={0.85} origin="center">
            New Game
          </FitText>
        </button>

        <button
          type="button"
          className="btn btn--neutral btn--icon"
          title="Take back a move"
          aria-label="Take back a move"
          disabled={state.moves.length === 0}
          onClick={onTakeback}
        >
          <UturnBackward size={13.5} />
        </button>

        {state.hasHuman ? (
          <button
            type="button"
            className="btn btn--danger btn--resign"
            disabled={notPlaying}
            onClick={onResign}
          >
            <FitText min={0.85} origin="center">
              Resign
            </FitText>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--danger btn--end"
            disabled={notPlaying}
            onClick={onEndGame}
          >
            <FitText min={0.85} origin="center">
              End Game
            </FitText>
          </button>
        )}
      </div>

      <div className="moves">
        {pairs.length === 0 ? (
          <span className="moves__empty">
            {state.status === "idle" ? "Moves will appear here" : "No moves yet"}
          </span>
        ) : (
          pairs.map(([number, white, black]) => (
            <span className="mv" key={number}>
              <span className="mv__n">{number}.</span>
              <span>{white === "" ? "…" : white}</span>
              {black !== "" && <span>{black}</span>}
            </span>
          ))
        )}
      </div>

      <div className="controls__row3">
        <div className="switchwrap">
          <button
            type="button"
            role="switch"
            aria-checked={chaos}
            aria-label="Allow illegal moves"
            className={"switch" + (chaos ? " switch--on" : "")}
            onClick={() => onChaos(!chaos)}
          >
            <span className="switch__knob" />
          </button>
          <span className="switch__label">Allow illegal moves</span>
        </div>

        <div className="controls__spacer" />

        <span className="viewlabel">View</span>
        <div className="seg" role="group" aria-label="View">
          <button
            type="button"
            className={"seg__cell" + (orientationWhite ? " seg__cell--sel" : "")}
            aria-pressed={orientationWhite}
            onClick={() => onOrientation(true)}
          >
            White
          </button>
          <button
            type="button"
            className={"seg__cell" + (!orientationWhite ? " seg__cell--sel" : "")}
            aria-pressed={!orientationWhite}
            onClick={() => onOrientation(false)}
          >
            Black
          </button>
        </div>
      </div>
    </div>
  );
}
