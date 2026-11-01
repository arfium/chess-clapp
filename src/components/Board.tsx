//! The board. Squares, pieces, and the layers on top of them — last move, selection,
//! check, legal-move hints, arrows (yours and the engine's), the review badge on the
//! move being looked at, and the promotion picker.
//!
//! Pieces keep an identity across positions, so a piece that moves SLIDES instead of
//! blinking out and in: on every new board, each piece that appeared is matched to the
//! nearest piece of the same kind that disappeared. A piece you dropped by hand is placed
//! instantly — it is already where you put it.
//!
//! Left button: click or drag to move. Right button: drag for an arrow, click for a
//! circle (Shift red, Alt blue, Ctrl/⌘ yellow). Any left click clears what you drew.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fileOf, rankOf, type Side } from "../bridge";
import type { Classification } from "../engine/review";
import { VerdictIcon } from "./VerdictIcon";
import { frameOf, pieceUrl, type BoardTheme } from "../lib/themes";
import { shade } from "../lib/oklch";

export type Brush = "green" | "red" | "blue" | "yellow" | "engine" | "engine2" | "engine3" | "best";
export type Arrow = { from: number; to: number; brush: Brush };
export type Circle = { sq: number; brush: Brush };

const GLYPH: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

/** Display (row, column from the top-left) → square index, for the side at the bottom. */
export function squareAt(row: number, col: number, bottom: Side): number {
  return bottom === "w" ? (7 - row) * 8 + col : row * 8 + (7 - col);
}
function displayOf(sq: number, bottom: Side): { row: number; col: number } {
  return bottom === "w" ? { row: 7 - rankOf(sq), col: fileOf(sq) } : { row: rankOf(sq), col: 7 - fileOf(sq) };
}

export function PieceImg({ code, set, className }: { code: string; set: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [code, set]);
  if (failed) {
    return (
      <span className={"piece-glyph " + (code[0] === "w" ? "piece-glyph--w" : "piece-glyph--b") + (className ? " " + className : "")}>
        {GLYPH[code] ?? ""}
      </span>
    );
  }
  return (
    <img
      className={"piece-img" + (className ? " " + className : "")}
      src={pieceUrl(set, code)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// MARK: - Piece identity (for the slide animation)

type Item = { id: number; code: string; sq: number };
let nextId = 1;

function usePieceItems(board: (string | null)[]): Item[] {
  const prev = useRef<Item[]>([]);
  const sig = board.map((p) => p ?? ".").join(",");
  return useMemo(() => {
    const old = prev.current;
    const byOld = new Map(old.map((it) => [it.sq, it]));
    const out: Item[] = [];
    const fresh: { sq: number; code: string }[] = [];
    const used = new Set<number>();
    board.forEach((code, sq) => {
      if (!code) return;
      const o = byOld.get(sq);
      if (o && o.code === code) {
        out.push(o);
        used.add(o.id);
      } else fresh.push({ sq, code });
    });
    const gone = old.filter((o) => !used.has(o.id));
    for (const f of fresh) {
      let best: Item | null = null;
      let bestD = Infinity;
      for (const g of gone) {
        if (g.code !== f.code || used.has(g.id)) continue;
        const d = Math.hypot(fileOf(g.sq) - fileOf(f.sq), rankOf(g.sq) - rankOf(f.sq));
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (best) {
        used.add(best.id);
        out.push({ id: best.id, code: f.code, sq: f.sq });
      } else out.push({ id: nextId++, code: f.code, sq: f.sq });
    }
    prev.current = out;
    return out;
    // `sig` is the board's identity; `board` itself is a fresh array every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

// MARK: - Board

export type Promotion = { from: number; to: number; color: Side };

/** The Board Editor's hand: a piece to place ("wQ"), the eraser, or the hand that moves. */
export type EditTool = string | "hand" | "erase";
export type EditEvent = { type: "place"; sq: number } | { type: "remove"; sq: number } | { type: "move"; from: number; to: number };

export function Board({
  size,
  board,
  bottom,
  theme,
  pieceSet,
  coords,
  animationMs,
  showLegal,
  lastMove,
  checkSq,
  selected,
  targets,
  movable,
  canDrop,
  onSelect,
  onMove,
  promotion,
  onPromote,
  arrows,
  badge,
  positionKey,
  overlay,
  edit,
  premove,
}: {
  size: number;
  board: (string | null)[];
  bottom: Side;
  theme: BoardTheme;
  pieceSet: string;
  coords: boolean;
  animationMs: number;
  showLegal: boolean;
  lastMove: { from: number; to: number } | null;
  checkSq: number | null;
  selected: number | null;
  targets: Set<number>;
  movable: (sq: number) => boolean;
  canDrop: (from: number, to: number) => boolean;
  onSelect: (sq: number | null) => void;
  /** `dragged` = placed by hand, so the piece must not slide. */
  onMove: (from: number, to: number, dragged: boolean) => void;
  promotion: Promotion | null;
  onPromote: (role: string | null) => void;
  arrows: Arrow[];
  badge: { sq: number; cls: Classification } | null;
  /** Changes whenever the position on the board does — drawn shapes are cleared then. */
  positionKey: string;
  overlay?: ReactNode;
  /** Board Editor mode: squares take pieces instead of moves. */
  edit?: { tool: EditTool; onEdit: (e: EditEvent) => void };
  /** A move queued for when it is your turn. */
  premove?: { from: number; to: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = usePieceItems(board);
  const sqPx = size / 8;

  const [drag, setDrag] = useState<{ from: number; code: string; x: number; y: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [instant, setInstant] = useState<number | null>(null);
  const [shapes, setShapes] = useState<{ arrows: Arrow[]; circles: Circle[] }>({ arrows: [], circles: [] });
  const [drawing, setDrawing] = useState<{ from: number; to: number; brush: Brush } | null>(null);
  const downSelected = useRef(false);

  useEffect(() => {
    setShapes({ arrows: [], circles: [] });
  }, [positionKey]);

  // A hand-placed piece is instant for exactly one render of the new board.
  useEffect(() => {
    if (instant === null) return;
    const t = window.setTimeout(() => setInstant(null), 30);
    return () => window.clearTimeout(t);
  }, [instant, board]);

  const sqFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return null;
      const col = Math.floor(((clientX - r.left) / r.width) * 8);
      const row = Math.floor(((clientY - r.top) / r.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return squareAt(row, col, bottom);
    },
    [bottom],
  );

  const brushFor = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Brush =>
    e.shiftKey ? "red" : e.altKey ? "blue" : e.ctrlKey || e.metaKey ? "yellow" : "green";

  const onPointerDown = (e: React.PointerEvent) => {
    if (promotion) return;
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (sq === null) return;
    if (edit) {
      e.preventDefault();
      if (e.button === 2 || edit.tool === "erase") {
        if (board[sq]) edit.onEdit({ type: "remove", sq });
        return;
      }
      if (e.button !== 0) return;
      if (edit.tool !== "hand") {
        edit.onEdit(board[sq] === edit.tool ? { type: "remove", sq } : { type: "place", sq });
        return;
      }
      if (board[sq]) {
        const r = ref.current!.getBoundingClientRect();
        setDrag({ from: sq, code: board[sq]!, x: e.clientX - r.left, y: e.clientY - r.top, moved: false });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      setDrawing({ from: sq, to: sq, brush: brushFor(e) });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    setShapes({ arrows: [], circles: [] });
    // A click on a square the selected piece may go to moves it — unless it is another of
    // your own pieces that is not a capture target, which re-selects instead.
    const reselect = movable(sq) && !targets.has(sq) && board[sq]?.[0] === board[selected ?? -1]?.[0];
    if (selected !== null && sq !== selected && canDrop(selected, sq) && !reselect) {
      onMove(selected, sq, false);
      onSelect(null);
      return;
    }
    if (movable(sq) && board[sq]) {
      downSelected.current = selected === sq;
      onSelect(sq);
      const r = ref.current!.getBoundingClientRect();
      setDrag({ from: sq, code: board[sq]!, x: e.clientX - r.left, y: e.clientY - r.top, moved: false });
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      onSelect(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drawing) {
      const sq = sqFromPoint(e.clientX, e.clientY);
      if (sq !== null && sq !== drawing.to) setDrawing({ ...drawing, to: sq });
      return;
    }
    if (!drag) return;
    const r = ref.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const moved = drag.moved || Math.hypot(x - drag.x, y - drag.y) > 3;
    setDrag({ ...drag, x, y, moved });
    if (moved) setHover(sqFromPoint(e.clientX, e.clientY));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drawing) {
      const { from, to, brush } = drawing;
      setDrawing(null);
      setShapes((s) => {
        if (from === to) {
          const has = s.circles.find((c) => c.sq === from);
          return {
            ...s,
            circles: has
              ? s.circles.filter((c) => c.sq !== from || c.brush !== brush)
              : [...s.circles, { sq: from, brush }],
          };
        }
        const has = s.arrows.find((a) => a.from === from && a.to === to);
        return {
          ...s,
          arrows: has
            ? s.arrows.filter((a) => !(a.from === from && a.to === to && a.brush === brush))
            : [...s.arrows.filter((a) => !(a.from === from && a.to === to)), { from, to, brush }],
        };
      });
      return;
    }
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setHover(null);
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (edit) {
      if (!d.moved) return;
      if (sq === null) edit.onEdit({ type: "remove", sq: d.from });
      else if (sq !== d.from) {
        setInstant(sq);
        edit.onEdit({ type: "move", from: d.from, to: sq });
      }
      return;
    }
    if (d.moved) {
      if (sq !== null && sq !== d.from && canDrop(d.from, sq)) {
        setInstant(sq);
        onMove(d.from, sq, true);
        onSelect(null);
      } else if (sq === null) onSelect(null);
    } else if (downSelected.current) {
      onSelect(null);
    }
  };

  // MARK: render

  const squares: ReactNode[] = [];
  for (let display = 0; display < 64; display++) {
    const row = Math.floor(display / 8);
    const col = display % 8;
    const sq = squareAt(row, col, bottom);
    const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
    const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
    const piece = board[sq];
    squares.push(
      <div
        key={display}
        className={"sq " + (light ? "sq--l" : "sq--d")}
        style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%` }}
      >
        {isLast && <span className="sq__last" />}
        {premove && (premove.from === sq || premove.to === sq) && <span className="sq__pre" />}
        {selected === sq && <span className="sq__sel" />}
        {checkSq === sq && <span className="sq__check" />}
        {hover === sq && drag?.moved && <span className="sq__hover" />}
        {showLegal && targets.has(sq) && (piece ? <span className="sq__ring" /> : <span className="sq__dot" />)}
      </div>,
    );
  }

  const allArrows = [...arrows, ...shapes.arrows];
  if (drawing && drawing.from !== drawing.to) allArrows.push(drawing);

  // The frame band holds the coordinates, printed on the border like a club board's.
  // Its radius is the board's corner plus the band (styles.css: concentric by construction).
  const pad = coords ? 21 : 8;
  const { frame, ink } = frameOf(theme);
  const files = Array.from({ length: 8 }, (_, c) => (bottom === "w" ? "abcdefgh"[c] : "hgfedcba"[c]));
  const ranks = Array.from({ length: 8 }, (_, r) => (bottom === "w" ? 8 - r : r + 1));

  return (
    <div
      className="frame"
      style={
        {
          "--frame-pad": `${pad}px`,
          "--frame": frame,
          "--frame-ink": ink,
          "--sqpx": `${sqPx}px`,
        } as React.CSSProperties
      }
    >
      {coords &&
        files.map((f, c) => (
          <span key={f} className="frame__coord frame__coord--file" style={{ left: pad + c * sqPx }}>
            {f}
          </span>
        ))}
      {coords &&
        ranks.map((r, i) => (
          <span key={r} className="frame__coord frame__coord--rank" style={{ top: pad + i * sqPx }}>
            {r}
          </span>
        ))}
      <div
        ref={ref}
        className={"board" + (drag?.moved ? " board--dragging" : "") + (edit ? " board--edit" : "")}
        style={
          {
            width: size,
            height: size,
            "--sq-light": theme.light,
            "--sq-dark": theme.dark,
            "--hint": theme.hint ?? shade(theme.dark, -0.28, 1, 0.42),
            "--anim": `${animationMs}ms`,
          } as React.CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDrag(null);
          setDrawing(null);
          setHover(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {squares}

        <div className="pieces">
          {items.map((it) => {
            const { row, col } = displayOf(it.sq, bottom);
            const lifted = drag?.moved && drag.from === it.sq;
            return (
              <div
                key={it.id}
                className={"pc" + (lifted ? " pc--lifted" : "") + (instant === it.sq ? " pc--instant" : "")}
                style={{ transform: `translate(${col * 100}%, ${row * 100}%)` }}
              >
                <PieceImg code={it.code} set={pieceSet} />
              </div>
            );
          })}
        </div>

        <Shapes arrows={allArrows} circles={shapes.circles} bottom={bottom} />

        {badge && <Badge sq={badge.sq} cls={badge.cls} bottom={bottom} />}

        {drag?.moved && (
          <div className="pc pc--ghost" style={{ transform: `translate(${drag.x - sqPx / 2}px, ${drag.y - sqPx / 2}px)` }}>
            <PieceImg code={drag.code} set={pieceSet} />
          </div>
        )}

        {promotion && <PromotionPicker promotion={promotion} bottom={bottom} pieceSet={pieceSet} onPick={onPromote} />}

        {overlay}
      </div>
    </div>
  );
}

// MARK: - Arrows and circles

// Lichess's four brushes (green, red, blue, yellow) for your own marks; the engine draws
// in the pen colour, fading with each lower-ranked line.
const BRUSH: Record<Brush, { color: string; opacity: number; width: number }> = {
  green: { color: "var(--brush-green)", opacity: 0.82, width: 0.17 },
  red: { color: "var(--brush-red)", opacity: 0.82, width: 0.17 },
  blue: { color: "var(--brush-blue)", opacity: 0.82, width: 0.17 },
  yellow: { color: "var(--brush-yellow)", opacity: 0.85, width: 0.17 },
  engine: { color: "var(--pen)", opacity: 0.72, width: 0.19 },
  engine2: { color: "var(--pen)", opacity: 0.42, width: 0.14 },
  engine3: { color: "var(--pen)", opacity: 0.26, width: 0.11 },
  best: { color: "var(--v-best)", opacity: 0.85, width: 0.18 },
};

function Shapes({ arrows, circles, bottom }: { arrows: Arrow[]; circles: Circle[]; bottom: Side }) {
  if (arrows.length === 0 && circles.length === 0) return null;
  return (
    <svg className="shapes" viewBox="0 0 8 8" aria-hidden="true">
      {circles.map((c, i) => {
        const { row, col } = displayOf(c.sq, bottom);
        const b = BRUSH[c.brush];
        return (
          <circle
            key={`c${i}`}
            cx={col + 0.5}
            cy={row + 0.5}
            r={0.45}
            fill="none"
            stroke={b.color}
            strokeOpacity={b.opacity}
            strokeWidth={0.075}
          />
        );
      })}
      {arrows.map((a, i) => (
        <ArrowPath key={`a${i}-${a.from}-${a.to}-${a.brush}`} arrow={a} bottom={bottom} />
      ))}
    </svg>
  );
}

function ArrowPath({ arrow, bottom }: { arrow: Arrow; bottom: Side }) {
  const b = BRUSH[arrow.brush];
  const s = displayOf(arrow.from, bottom);
  const e = displayOf(arrow.to, bottom);
  const x1 = s.col + 0.5;
  const y1 = s.row + 0.5;
  const x2 = e.col + 0.5;
  const y2 = e.row + 0.5;
  const dx = Math.abs(e.col - s.col);
  const dy = Math.abs(e.row - s.row);
  const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  // Knights travel in an L: along the long leg first, then turn.
  const pts: [number, number][] = knight
    ? dy > dx
      ? [[x1, y1], [x1, y2], [x2, y2]]
      : [[x1, y1], [x2, y1], [x2, y2]]
    : [[x1, y1], [x2, y2]];
  const [px, py] = pts[pts.length - 2];
  const len = Math.hypot(x2 - px, y2 - py) || 1;
  const ux = (x2 - px) / len;
  const uy = (y2 - py) / len;
  const head = b.width * 2.4;
  const hw = b.width * 1.55;
  // Stop the shaft where the head begins; the tip lands a little short of the centre.
  const tipX = x2 - ux * 0.12;
  const tipY = y2 - uy * 0.12;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  const shaft = [...pts.slice(0, -1), [baseX, baseY]] as [number, number][];
  const startTrim = 0.18;
  const [sx, sy] = shaft[0];
  const [nx, ny] = shaft[1];
  const sl = Math.hypot(nx - sx, ny - sy) || 1;
  shaft[0] = [sx + ((nx - sx) / sl) * startTrim, sy + ((ny - sy) / sl) * startTrim];
  return (
    <g opacity={b.opacity}>
      <polyline
        points={shaft.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={b.color}
        strokeWidth={b.width}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <polygon
        points={`${tipX},${tipY} ${baseX - uy * hw},${baseY + ux * hw} ${baseX + uy * hw},${baseY - ux * hw}`}
        fill={b.color}
      />
    </g>
  );
}

// MARK: - Review badge

function Badge({ sq, cls, bottom }: { sq: number; cls: Classification; bottom: Side }) {
  const { row, col } = displayOf(sq, bottom);
  return (
    <div
      className={`badge badge--${cls}`}
      style={{ left: `${(col + 1) * 12.5}%`, top: `${row * 12.5}%` }}
    >
      <VerdictIcon cls={cls} className="badge__icon" />
    </div>
  );
}

// MARK: - Promotion picker

function PromotionPicker({
  promotion,
  bottom,
  pieceSet,
  onPick,
}: {
  promotion: Promotion;
  bottom: Side;
  pieceSet: string;
  onPick: (role: string | null) => void;
}) {
  const { row, col } = displayOf(promotion.to, bottom);
  const down = row === 0;
  const roles = ["Q", "N", "R", "B"];
  return (
    <div
      className="promo"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onPick(null);
      }}
    >
      {roles.map((r, i) => (
        <button
          key={r}
          type="button"
          className="promo__cell"
          style={{ left: `${col * 12.5}%`, top: `${(down ? i : 7 - i) * 12.5}%` }}
          onClick={() => onPick(r.toLowerCase())}
          aria-label={{ Q: "Queen", N: "Knight", R: "Rook", B: "Bishop" }[r]}
        >
          <PieceImg code={promotion.color + r} set={pieceSet} />
        </button>
      ))}
    </div>
  );
}
