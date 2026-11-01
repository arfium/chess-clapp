//! A game as a tree of moves: the main line is every node's first child, and every other
//! child is a variation. Plain data (a record of nodes) so React state can hold it; every
//! operation returns a new tree.

import type { Line, Ply } from "./chess";

export type TNode = {
  id: number;
  parent: number | null;
  /** The move that led here; null at the root. */
  ply: Ply | null;
  fen: string;
  children: number[];
  /** Played in the live game (only the Play board has these): the main line it must keep. */
  live?: boolean;
};

export type Tree = { root: number; nodes: Record<number, TNode>; next: number };

export function emptyTree(startFen: string): Tree {
  return { root: 0, nodes: { 0: { id: 0, parent: null, ply: null, fen: startFen, children: [] } }, next: 1 };
}

export function treeFromLine(line: Line): Tree {
  let t = emptyTree(line.startFen);
  let at = t.root;
  for (const p of line.plies) [t, at] = addPly(t, at, p);
  return t;
}

/** Add a move under `parent` (reusing the child that already plays it). */
export function addPly(t: Tree, parent: number, ply: Ply, asMain = false): [Tree, number] {
  const p = t.nodes[parent];
  const existing = p.children.find((c) => t.nodes[c].ply?.uci === ply.uci);
  if (existing !== undefined) {
    if (!asMain || p.children[0] === existing) return [t, existing];
    const children = [existing, ...p.children.filter((c) => c !== existing)];
    return [{ ...t, nodes: { ...t.nodes, [parent]: { ...p, children } } }, existing];
  }
  const id = t.next;
  const node: TNode = { id, parent, ply, fen: ply.fen, children: [] };
  const children = asMain ? [id, ...p.children] : [...p.children, id];
  return [{ root: t.root, next: id + 1, nodes: { ...t.nodes, [id]: node, [parent]: { ...p, children } } }, id];
}

/** Add a run of moves; returns the tree and the last node. */
export function addPlies(t: Tree, parent: number, plies: Ply[]): [Tree, number] {
  let at = parent;
  for (const p of plies) [t, at] = addPly(t, at, p);
  return [t, at];
}

/** root … id */
export function pathTo(t: Tree, id: number): number[] {
  const out: number[] = [];
  for (let n: TNode | undefined = t.nodes[id]; n; n = n.parent === null ? undefined : t.nodes[n.parent]) out.push(n.id);
  return out.reverse();
}

/** The main line below `id` (excluding it). */
export function continuation(t: Tree, id: number): number[] {
  const out: number[] = [];
  for (let n = t.nodes[id]; n && n.children.length; n = t.nodes[n.children[0]]) out.push(n.children[0]);
  return out;
}

export const mainline = (t: Tree) => continuation(t, t.root);

export function isMainline(t: Tree, id: number): boolean {
  return pathTo(t, id).every((n, i, all) => i === 0 || t.nodes[all[i - 1]].children[0] === n);
}

/** The line from the root to `id`. */
export function lineTo(t: Tree, id: number): Line {
  const path = pathTo(t, id);
  return { startFen: t.nodes[t.root].fen, plies: path.slice(1).map((n) => t.nodes[n].ply!) };
}

/** The main line as a Line. */
export function mainLine(t: Tree): Line {
  return { startFen: t.nodes[t.root].fen, plies: mainline(t).map((n) => t.nodes[n].ply!) };
}

/** Remove `id` and everything after it. */
export function cut(t: Tree, id: number): Tree {
  const n = t.nodes[id];
  if (n.parent === null) return t;
  const nodes = { ...t.nodes };
  const drop = (x: number) => {
    for (const c of nodes[x].children) drop(c);
    delete nodes[x];
  };
  drop(id);
  const p = nodes[n.parent];
  nodes[n.parent] = { ...p, children: p.children.filter((c) => c !== id) };
  return { ...t, nodes };
}

/** Make the variation through `id` the main line at every fork on its way up. */
export function promote(t: Tree, id: number): Tree {
  const nodes = { ...t.nodes };
  for (let n = nodes[id]; n.parent !== null; n = nodes[n.parent]) {
    const p = nodes[n.parent];
    if (p.children[0] !== n.id) nodes[p.id] = { ...p, children: [n.id, ...p.children.filter((c) => c !== n.id)] };
  }
  return { ...t, nodes };
}

/** The main-line node `ply` half-moves from the root (clamped). */
export function mainAt(t: Tree, ply: number): number {
  const m = mainline(t);
  return ply <= 0 ? t.root : m[Math.min(ply, m.length) - 1];
}

/** Half-moves from the root to `id`. */
export const depthOf = (t: Tree, id: number) => pathTo(t, id).length - 1;

/**
 * Make the live moves equal `line` — the game as the core has it — and keep them as the
 * main line, while every variation the viewer added stays where it hangs. Moves the game
 * added are appended (merging a variation that had already guessed them); a takeback or a
 * different game trims the live moves that are no longer true.
 */
export function syncLive(t: Tree, line: Line): Tree {
  if (t.nodes[t.root].fen !== line.startFen) {
    t = emptyTree(line.startFen);
  }
  let at = t.root;
  let i = 0;
  const liveChild = (x: number) => t.nodes[x].children.find((c) => t.nodes[c].live);
  for (; i < line.plies.length; i++) {
    const c = liveChild(at);
    if (c === undefined || t.nodes[c].ply?.uci !== line.plies[i].uci) break;
    at = c;
  }
  const stale = liveChild(at);
  if (stale !== undefined) t = cut(t, stale);
  for (; i < line.plies.length; i++) {
    const [t2, id] = addPly(t, at, line.plies[i], true);
    t = { ...t2, nodes: { ...t2.nodes, [id]: { ...t2.nodes[id], live: true } } };
    at = id;
  }
  return t;
}

/** The deepest live node: the position the game is in. */
export function liveTip(t: Tree): number {
  let at = t.root;
  for (;;) {
    const c = t.nodes[at].children.find((x) => t.nodes[x].live);
    if (c === undefined) return at;
    at = c;
  }
}
