//! Time controls: chess.com's three speeds and their usual presets, plus an untimed game.

export type Speed = "bullet" | "blitz" | "rapid";
export type TimeControl = { id: string; speed: Speed; minutes: number; increment: number };

export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", speed: "bullet", minutes: 1, increment: 0 },
  { id: "1+1", speed: "bullet", minutes: 1, increment: 1 },
  { id: "2+1", speed: "bullet", minutes: 2, increment: 1 },
  { id: "3+0", speed: "blitz", minutes: 3, increment: 0 },
  { id: "3+2", speed: "blitz", minutes: 3, increment: 2 },
  { id: "5+0", speed: "blitz", minutes: 5, increment: 0 },
  { id: "10+0", speed: "rapid", minutes: 10, increment: 0 },
  { id: "15+10", speed: "rapid", minutes: 15, increment: 10 },
  { id: "30+0", speed: "rapid", minutes: 30, increment: 0 },
];

export const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: "bullet", label: "Bullet" },
  { speed: "blitz", label: "Blitz" },
  { speed: "rapid", label: "Rapid" },
];

export const timeControl = (id: string) => TIME_CONTROLS.find((t) => t.id === id) ?? null;

/** "3 min", "3 | 2" — chess.com's way of writing a time control. */
export const tcLabel = (t: TimeControl) => (t.increment ? `${t.minutes} | ${t.increment}` : `${t.minutes} min`);

/** 1:05:03 · 4:07 · 0:09.4 — tenths only when it gets close. */
export function fmtClock(ms: number): string {
  const t = Math.max(0, ms);
  const s = Math.floor(t / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  if (t < 10_000) return `0:${String(s).padStart(2, "0")}.${Math.floor((t % 1000) / 100)}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
