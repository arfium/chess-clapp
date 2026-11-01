//! What a Stockfish seat's level means. Each level is a handicap Stockfish applies to
//! itself (`Skill Level`, which picks weaker moves on purpose) plus a search budget. The
//! Elo figures are rough guides for a human choosing an opponent, not measurements.

export type Level = { level: number; skill: number; depth: number; movetime: number; elo: string };

export const LEVELS: Level[] = [
  { level: 1, skill: 0, depth: 1, movetime: 60, elo: "≈ 800" },
  { level: 2, skill: 3, depth: 2, movetime: 100, elo: "≈ 1100" },
  { level: 3, skill: 6, depth: 4, movetime: 150, elo: "≈ 1400" },
  { level: 4, skill: 9, depth: 6, movetime: 250, elo: "≈ 1700" },
  { level: 5, skill: 12, depth: 8, movetime: 400, elo: "≈ 2000" },
  { level: 6, skill: 15, depth: 11, movetime: 600, elo: "≈ 2300" },
  { level: 7, skill: 18, depth: 15, movetime: 900, elo: "≈ 2600" },
  { level: 8, skill: 20, depth: 22, movetime: 1500, elo: "≈ 3000+" },
];

export const levelInfo = (n: number | null | undefined) =>
  LEVELS[Math.min(LEVELS.length, Math.max(1, n ?? 4)) - 1];
