//! One player strip — 56 pt tall, `HStack(spacing: 13)` inset by the 24 pt gutter.
//!
//! The avatar + name row is ALWAYS VISIBLE (it is not a menu label), so the name and the
//! monogram background always render. The seat picker is a separate little dropdown on
//! the right. Ported 1:1 from `playerStrip` / `seatInfo` / `AvatarView` in BoardView.swift.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { agentTint, useAsset, type AgentRow, type Player, type Side } from "./bridge";
import { ChevronDown, PersonFill, PersonSlash, Plus } from "./icons";

export type AvatarSpec =
  | { kind: "empty" }
  | { kind: "person" }
  | { kind: "monogram"; text: string; tint: string }
  | { kind: "agent"; text: string; tint: string; path?: string | null };

const HUMAN_AVATAR = "#545860";
const OFFLINE_AVATAR = "#84827E";

type SeatInfo = {
  title: string;
  titleClass: string;
  subtitle: string | null;
  subtitleClass: string;
  avatar: AvatarSpec;
};

/** The seat as the `seat` verb wants it: "empty" | "human" | "<agentId>". */
export function seatValue(p: Player): string {
  if (p.kind === "human") return "human";
  if (p.kind === "agent") return p.id ?? "";
  return "empty";
}

function seatInfo(p: Player, agents: AgentRow[], isTurn: boolean): SeatInfo {
  if (p.kind === "human") {
    return {
      title: "You",
      titleClass: "t-text",
      subtitle: isTurn ? "your move" : "human",
      subtitleClass: isTurn ? "t-active" : "t-secondary",
      avatar: { kind: "person" },
    };
  }
  if (p.kind === "agent") {
    const id = p.id ?? "";
    const row = agents.find((a) => a.id === id);
    if (!row) {
      // Seated, but the id is no longer in the roster — Swift renders it "offline".
      return {
        title: "Agent",
        titleClass: "t-text",
        subtitle: "offline",
        subtitleClass: "t-tertiary",
        avatar: { kind: "monogram", text: "?", tint: OFFLINE_AVATAR },
      };
    }
    const name = row.name || p.name || "Agent";
    return {
      title: name,
      titleClass: "t-text",
      subtitle: isTurn ? "thinking…" : row.model ?? row.backend ?? p.model ?? p.backend ?? null,
      subtitleClass: isTurn ? "t-active" : "t-secondary",
      avatar: {
        kind: "agent",
        text: (name.slice(0, 1) || "?").toUpperCase(),
        tint: agentTint(id),
        path: row.avatar ?? p.avatar ?? null,
      },
    };
  }
  return {
    title: "Choose player",
    titleClass: "t-tertiary",
    subtitle: "no one seated",
    subtitleClass: "t-tertiary",
    avatar: { kind: "empty" },
  };
}

export function PlayerStrip({
  color,
  player,
  agents,
  isTurn,
  menuUp,
  onSeat,
}: {
  color: Side;
  player: Player;
  agents: AgentRow[];
  isTurn: boolean;
  menuUp: boolean;
  onSeat: (who: string) => void;
}) {
  const info = seatInfo(player, agents, isTurn);
  return (
    <div className={"strip" + (isTurn ? " strip--turn" : "")}>
      <Avatar spec={info.avatar} ring={isTurn} />
      <div className="strip__name">
        <div className={"strip__title " + info.titleClass}>{info.title}</div>
        {info.subtitle !== null && (
          <div className={"strip__sub " + info.subtitleClass}>{info.subtitle}</div>
        )}
      </div>
      <div className="strip__spacer" />
      <ColorChip color={color} />
      <SeatPicker seat={seatValue(player)} agents={agents} menuUp={menuUp} onSeat={onSeat} />
    </div>
  );
}

// MARK: - Avatar (40 pt)

function Avatar({ spec, ring }: { spec: AvatarSpec; ring: boolean }) {
  const photo = useAsset(spec.kind === "agent" ? spec.path : null);

  let fill = "transparent";
  let body: ReactNode = null;

  if (spec.kind === "person") {
    fill = HUMAN_AVATAR;
    body = (
      // AvatarView: `.font(.system(size: size * 0.42))` → 40 × 0.42
      <span className="avatar__glyph avatar__glyph--white">
        <PersonFill size={16.8} />
      </span>
    );
  } else if (spec.kind === "monogram") {
    fill = spec.tint;
    body = <span className="avatar__mono">{spec.text}</span>;
  } else if (spec.kind === "agent") {
    fill = photo ? "#e6e6e6" : spec.tint;
    body = photo ? (
      <img className="avatar__photo" src={photo} alt="" draggable={false} />
    ) : (
      <span className="avatar__mono">{spec.text}</span>
    );
  } else {
    body = (
      <span className="avatar__glyph t-tertiary">
        <Plus size={13.6} />
      </span>
    );
  }

  return (
    <div className="avatar">
      <div className="avatar__fill" style={{ background: fill }}>
        {body}
      </div>
      {spec.kind === "empty" ? (
        <svg className="avatar__dash" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r="19.25"
            fill="none"
            stroke="rgba(150,146,139,0.7)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </svg>
      ) : (
        <div className="avatar__border" />
      )}
      {ring && <div className="avatar__ring" />}
    </div>
  );
}

// MARK: - Colour chip (reflects the SIDE, never the occupant)

function ColorChip({ color }: { color: Side }) {
  return (
    <div className="chip">
      <span className={"chip__dot " + (color === "w" ? "chip__dot--w" : "chip__dot--b")} />
      <span className="chip__label">{color === "w" ? "White" : "Black"}</span>
    </div>
  );
}

// MARK: - Seat picker
//
// A fixed 50×28 pill (never a native bezel) plus a menu: You · agents · Empty seat.
// Always enabled, mid-game included. The bottom strip opens upward so the menu can
// never fall out of the fixed-size window.

function SeatPicker({
  seat,
  agents,
  menuUp,
  onSeat,
}: {
  seat: string;
  agents: AgentRow[];
  menuUp: boolean;
  onSeat: (who: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const pick = (who: string) => {
    setOpen(false);
    onSeat(who);
  };

  return (
    <div className="picker" ref={root}>
      <button
        type="button"
        className="picker__pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choose who sits here"
        onClick={() => setOpen((o) => !o)}
      >
        <PersonFill size={11} />
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className={"picker__menu " + (menuUp ? "picker__menu--up" : "picker__menu--down")} role="menu">
          <button type="button" className="picker__item" role="menuitem" onClick={() => pick("human")}>
            <span className="picker__icon">
              <PersonFill size={13} />
            </span>
            <span className="picker__text">You</span>
          </button>
          {agents.length > 0 && <div className="picker__sep" />}
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              className="picker__item"
              role="menuitem"
              onClick={() => pick(a.id)}
            >
              <span className="picker__icon" />
              <span className="picker__text">{a.name}</span>
            </button>
          ))}
          {seat !== "empty" && (
            <>
              <div className="picker__sep" />
              <button
                type="button"
                className="picker__item picker__item--danger"
                role="menuitem"
                onClick={() => pick("empty")}
              >
                <span className="picker__icon">
                  <PersonSlash size={13} />
                </span>
                <span className="picker__text">Empty seat</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
