//! The move list. The main line is the scoresheet — number, White, Black — and every
//! variation is set in under the move it replaces, nested in parentheses the way chess
//! books print them. Right-click a move for its actions.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Classification } from "../engine/review";
import { VerdictIcon } from "./VerdictIcon";
import { moveLabel } from "../lib/chess";
import { continuation, type TNode, type Tree } from "../lib/tree";
import { San } from "./San";

const NOTABLE = new Set<Classification>(["brilliant", "great", "inaccuracy", "mistake", "blunder", "book"]);

export type MoveTreeProps = {
  tree: Tree;
  current: number;
  onJump: (id: number) => void;
  /** Verdicts by main-line node id (a review). */
  verdicts?: Record<number, Classification>;
  figurines: boolean;
  pieceSet: string;
  names: { w: string; b: string };
  /** Context actions; omitted ones are not offered. */
  onPromote?: (id: number) => void;
  onDelete?: (id: number) => void;
  /** Nodes that may not be promoted or deleted (the live game). */
  locked?: (id: number) => boolean;
};

type Menu = { id: number; x: number; y: number } | null;

export function MoveTree(props: MoveTreeProps) {
  const { tree, current, onJump, verdicts, figurines, pieceSet, names } = props;
  const active = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu>(null);

  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" });
  }, [current, tree]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const node = (id: number) => tree.nodes[id];
  const before = (n: TNode) => node(n.parent!).fen;

  const move = (n: TNode, opts: { cell?: boolean; number?: boolean }) => {
    const p = n.ply!;
    const on = n.id === current;
    const v = verdicts?.[n.id];
    const cls = v && NOTABLE.has(v) ? v : null;
    return (
      <button
        key={n.id}
        type="button"
        ref={on ? active : undefined}
        className={(opts.cell ? "mv" : "vm") + (on ? " is-on" : "") + (cls ? ` is-${cls}` : "")}
        aria-current={on ? "step" : undefined}
        onClick={() => onJump(n.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!props.onDelete && !props.onPromote) return;
          if (props.locked?.(n.id)) return;
          const r = box.current!.getBoundingClientRect();
          setMenu({ id: n.id, x: e.clientX - r.left, y: e.clientY - r.top + box.current!.scrollTop });
        }}
      >
        {opts.number && <span className="vm__no">{moveLabel(before(n), p.color)}</span>}
        <San san={p.san} figurines={figurines} set={pieceSet} />
        {cls && <VerdictIcon cls={cls} size={16} className="mv__verdict" />}
      </button>
    );
  };

  /** One variation, inline: its own main line, with deeper variations in parentheses. */
  const inline = (startId: number): ReactNode[] => {
    const out: ReactNode[] = [];
    const ids = [startId, ...continuation(tree, startId)];
    let numbered = true;
    ids.forEach((id, k) => {
      const n = node(id);
      out.push(move(n, { number: numbered || n.ply!.color === "w" }));
      numbered = false;
      const parent = node(n.parent!);
      if (k > 0 && parent.children[0] === id && parent.children.length > 1) {
        for (const alt of parent.children.slice(1)) {
          out.push(
            <span key={`p${alt}`} className="paren">
              {inline(alt)}
            </span>,
          );
        }
        numbered = true;
      }
    });
    return out;
  };

  // Main line rows. A White move with alternatives closes its row early, so Black's reply
  // starts a fresh row after the variations — as printed scoresheets do.
  const rows: ReactNode[] = [];
  let row: { no: string; w: TNode | null; b: TNode | null } | null = null;
  const flush = () => {
    if (!row) return;
    const r = row;
    rows.push(
      <div key={`r${rows.length}`} className="grid__row" role="listitem">
        <span className="grid__no">{r.no}</span>
        {r.w ? move(r.w, { cell: true }) : <span className="mv mv--blank">…</span>}
        {r.b ? move(r.b, { cell: true }) : <span className="mv mv--blank" />}
      </div>,
    );
    row = null;
  };

  for (const id of continuation(tree, tree.root)) {
    const n = node(id);
    const parent = node(n.parent!);
    const no = moveLabel(parent.fen, "w").replace(".", "");
    if (n.ply!.color === "w") {
      flush();
      row = { no, w: n, b: null };
    } else if (row && !row.b && row.w) {
      row.b = n;
    } else {
      flush();
      row = { no, w: null, b: n };
    }
    if (parent.children.length > 1) {
      flush();
      rows.push(
        <div key={`v${id}`} className="vars">
          {parent.children.slice(1).map((alt) => (
            <div key={alt} className="var">
              {inline(alt)}
            </div>
          ))}
        </div>,
      );
    }
  }
  flush();

  const empty = tree.nodes[tree.root].children.length === 0;

  return (
    <div className="grid" role="list" aria-label="Moves" ref={box}>
      <div className="grid__head" aria-hidden="true">
        <span />
        <span>{names.w}</span>
        <span>{names.b}</span>
      </div>
      {!empty && rows}
      {empty && <div className="grid__row grid__row--empty" />}
      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
          {props.onPromote && tree.nodes[tree.nodes[menu.id].parent!].children[0] !== menu.id && (
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => {
                props.onPromote!(menu.id);
                setMenu(null);
              }}
            >
              Promote Variation
            </button>
          )}
          {props.onDelete && (
            <button
              type="button"
              role="menuitem"
              className="menu__item menu__item--flag"
              onClick={() => {
                props.onDelete!(menu.id);
                setMenu(null);
              }}
            >
              Delete From Here
            </button>
          )}
        </div>
      )}
    </div>
  );
}
