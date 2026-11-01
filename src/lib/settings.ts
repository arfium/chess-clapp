//! The viewer's preferences. Per-window conveniences, nothing the game depends on, so
//! localStorage is the right home — and every access is guarded, because a webview with
//! storage disabled must still render with the defaults.

import { useSyncExternalStore } from "react";

export type AppTheme = "system" | "scoresheet" | "night" | "walnut";
const APP_THEMES: AppTheme[] = ["system", "scoresheet", "night", "walnut"];
export type Coords = "inside" | "none";
export type Speed = "off" | "fast" | "normal" | "slow";

export type Settings = {
  appTheme: AppTheme;
  boardTheme: string;
  pieceSet: string;
  coords: Coords;
  animation: Speed;
  showLegal: boolean;
  highlightLast: boolean;
  figurines: boolean;
  /** Live engine analysis while playing (off by default — it is your game). */
  engineOn: boolean;
  /** Live engine analysis on the Analysis board (on by default). */
  engineInAnalysis: boolean;
  evalBar: boolean;
  bestArrow: boolean;
  multiPv: number;
  /** 0 = no limit (search until the position changes). */
  maxDepth: number;
  reviewDepth: number;
  sound: boolean;
  volume: number;
  autoQueen: boolean;
  /** The Stockfish level the seat menu and quick setup offer first. */
  engineLevel: number;
  panelTab: "moves" | "review";
  /** The Settings page last open. */
  settingsTab: "board" | "interface" | "analysis" | "about";
  /** New Game, remembered between games. */
  ngTab: "play" | "watch";
  ngOpponent: string;
  ngColor: "w" | "random" | "b";
  ngWatchW: string;
  ngWatchB: string;
  /** A time-control id ("3+2") or "none". */
  ngTime: string;
};

export const DEFAULTS: Settings = {
  appTheme: "system",
  boardTheme: "tournament",
  pieceSet: "cburnett",
  coords: "inside",
  animation: "normal",
  showLegal: true,
  highlightLast: true,
  figurines: true,
  engineOn: false,
  engineInAnalysis: true,
  evalBar: true,
  bestArrow: true,
  multiPv: 3,
  maxDepth: 0,
  reviewDepth: 14,
  sound: true,
  volume: 0.6,
  autoQueen: false,
  engineLevel: 3,
  panelTab: "moves",
  settingsTab: "board",
  ngTab: "play",
  ngOpponent: "engine",
  ngColor: "w",
  ngWatchW: "",
  ngWatchB: "engine:5",
  ngTime: "10+0",
};

const KEY = "chess.settings.v1";

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
      // A theme from an older build that no longer exists falls back to the system's.
      if (!APP_THEMES.includes(s.appTheme)) s.appTheme = "system";
      return s;
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return DEFAULTS;
}

let current: Settings = read();
const subs = new Set<() => void>();

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* not persisted this time; still applied */
  }
  for (const s of subs) s();
}

export function getSettings(): Settings {
  return current;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}

export const ANIMATION_MS: Record<Speed, number> = { off: 0, fast: 120, normal: 200, slow: 320 };
