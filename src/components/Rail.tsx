//! The rail: the window's modes. Play, Analysis, Board Editor, Game Review — and Settings.

import { Analysis, Editor, Gear, Pawn, Star } from "../icons";

export type Mode = "play" | "analysis" | "editor" | "review";

const ITEMS: { mode: Mode; label: string; Icon: typeof Pawn }[] = [
  { mode: "play", label: "Play", Icon: Pawn },
  { mode: "analysis", label: "Analysis", Icon: Analysis },
  { mode: "editor", label: "Editor", Icon: Editor },
  { mode: "review", label: "Review", Icon: Star },
];

export function Rail({
  mode,
  onMode,
  onSettings,
  settingsOpen,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  onSettings: () => void;
  settingsOpen: boolean;
}) {
  return (
    <nav className="rail" aria-label="Modes">
      {ITEMS.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          type="button"
          className="rail__item"
          aria-current={mode === m ? "page" : undefined}
          onClick={() => onMode(m)}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <span className="rail__gap" />
      <button type="button" className="rail__item" aria-pressed={settingsOpen} onClick={onSettings}>
        <Gear size={21} />
        <span>Settings</span>
      </button>
    </nav>
  );
}
