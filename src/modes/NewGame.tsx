//! New Game: who plays, which colour, from which position — then Start Game.

import { useEffect, useRef, useState } from "react";
import { agentTint, useAsset, type AgentRow, type Side } from "../bridge";
import { LEVELS, levelInfo } from "../engine/levels";
import { boardFromFen } from "../lib/chess";
import { setSettings, useSettings } from "../lib/settings";
import { boardTheme } from "../lib/themes";
import { ChevronDown, Close, Fish, PersonFill, Clock as ClockIcon } from "../icons";
// The speed marks: Noto Emoji's ⚡ and ⏱ (Apache-2.0) and a bullet drawn in the same style
// (Unicode has no bullet emoji) — full-colour SVG, drawn as plain images.
import blitzMark from "../assets/speed/blitz.svg";
import bulletMark from "../assets/speed/bullet.svg";
import rapidMark from "../assets/speed/rapid.svg";
import { SPEEDS, TIME_CONTROLS, tcLabel, timeControl, type Speed } from "../lib/timecontrol";
import { PieceImg } from "../components/Board";
import { Check, IconButton } from "../components/ui";

export type Start = {
  white: string;
  black: string;
  fen: string | null;
  chaos: boolean;
  humanSide: Side | null;
  /** Seconds; null for an untimed game. */
  clock: { initial: number; increment: number } | null;
};

export function NewGame({
  agents,
  chaos,
  startFen,
  onClearFen,
  onStart,
  onBack,
}: {
  agents: AgentRow[];
  chaos: boolean;
  startFen: string | null;
  onClearFen: () => void;
  onStart: (s: Start) => void;
  /** Present while a game is in progress: return to it without starting another. */
  onBack?: () => void;
}) {
  const s = useSettings();
  const [chaosOn, setChaosOn] = useState(chaos);
  const tab = s.ngTab;
  const opponent = s.ngOpponent === "engine" || s.ngOpponent === "friend" || agents.some((a) => a.id === s.ngOpponent) ? s.ngOpponent : "engine";
  const valid = (v: string) => v.startsWith("engine:") || agents.some((a) => a.id === v);
  const watchW = valid(s.ngWatchW) ? s.ngWatchW : agents[0]?.id ?? `engine:${s.engineLevel}`;
  const watchB = valid(s.ngWatchB) ? s.ngWatchB : `engine:${s.engineLevel}`;

  const tc = timeControl(s.ngTime);
  const clock = tc ? { initial: tc.minutes * 60, increment: tc.increment } : null;
  const [tcOpen, setTcOpen] = useState(false);

  const start = () => {
    if (tab === "watch") {
      onStart({ white: watchW, black: watchB, fen: startFen, chaos: chaosOn, humanSide: null, clock });
      return;
    }
    const opp = opponent === "engine" ? `engine:${s.engineLevel}` : opponent === "friend" ? "human" : opponent;
    const me: Side = s.ngColor === "random" ? (Math.random() < 0.5 ? "w" : "b") : s.ngColor;
    onStart({
      white: me === "w" ? "human" : opp,
      black: me === "b" ? "human" : opp,
      fen: startFen,
      chaos: chaosOn,
      humanSide: opponent === "friend" ? null : me,
      clock,
    });
  };

  return (
    <div className="ng">
      <div className="ng__body">
      <div className="pages" role="tablist" aria-label="Game type">
        {(["play", "watch"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="pages__tab" onClick={() => setSettings({ ngTab: t })}>
            {t === "play" ? "Play" : "Watch"}
          </button>
        ))}
      </div>

      <div className="ng__label">Time Control</div>
      <button type="button" className="select__btn tc__current" aria-expanded={tcOpen} onClick={() => setTcOpen((o) => !o)}>
        <SpeedIcon speed={tc?.speed ?? null} size={21} />
        <span className="choice__title">{tc ? tcLabel(tc) : "No Clock"}</span>
        <span className="choice__meta">{tc ? SPEEDS.find((x) => x.speed === tc.speed)!.label : ""}</span>
        <ChevronDown size={16} />
      </button>
      {tcOpen && (
        <div className="tc" role="radiogroup" aria-label="Time control">
          {SPEEDS.map(({ speed, label }) => (
            <div key={speed} className="tc__row">
              <span className="tc__speed">
                <SpeedIcon speed={speed} size={21} />
                {label}
              </span>
              {TIME_CONTROLS.filter((t) => t.speed === speed).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={s.ngTime === t.id}
                  className="tc__opt"
                  onClick={() => {
                    setSettings({ ngTime: t.id });
                    setTcOpen(false);
                  }}
                >
                  {tcLabel(t)}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={s.ngTime === "none"}
            className="tc__opt tc__none"
            onClick={() => {
              setSettings({ ngTime: "none" });
              setTcOpen(false);
            }}
          >
            No Clock
          </button>
        </div>
      )}

      {tab === "play" ? (
        <>
          <div className="ng__label">Opponent</div>
          <div className="choices" role="radiogroup" aria-label="Opponent">
            <Choice on={opponent === "engine"} onPick={() => setSettings({ ngOpponent: "engine" })} avatar={<EngineAvatar />} title="Stockfish" meta={`Level ${s.engineLevel} · ${levelInfo(s.engineLevel).elo}`}>
              {opponent === "engine" && <LevelPicker level={s.engineLevel} onLevel={(l) => setSettings({ engineLevel: l })} />}
            </Choice>
            {agents.map((a) => (
              <Choice key={a.id} on={opponent === a.id} onPick={() => setSettings({ ngOpponent: a.id })} avatar={<AgentAvatar agent={a} />} title={a.name} meta={a.model ?? a.backend ?? ""} />
            ))}
            <Choice on={opponent === "friend"} onPick={() => setSettings({ ngOpponent: "friend" })} avatar={<HumanAvatar />} title="Pass and Play" meta="" />
          </div>

          {opponent !== "friend" && (
            <>
              <div className="ng__label">Play as</div>
              <div className="sides" role="radiogroup" aria-label="Play as">
                {(["w", "random", "b"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={s.ngColor === c} className="sides__opt" onClick={() => setSettings({ ngColor: c })}>
                    <span className="sides__piece">
                      {c === "random" ? (
                        <span className="sides__random">
                          <PieceImg code="wK" set={s.pieceSet} />
                          <PieceImg code="bK" set={s.pieceSet} />
                        </span>
                      ) : (
                        <PieceImg code={c + "K"} set={s.pieceSet} />
                      )}
                    </span>
                    {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="ng__label">White</div>
          <SeatSelect value={watchW} agents={agents} onChange={(v) => setSettings({ ngWatchW: v })} />
          <div className="ng__label">Black</div>
          <SeatSelect value={watchB} agents={agents} onChange={(v) => setSettings({ ngWatchB: v })} />
        </>
      )}

      {startFen && (
        <>
          <div className="ng__label">Position</div>
          <div className="ng__pos">
            <MiniBoard fen={startFen} />
            <span className="ng__fen">{startFen.split(" ")[1] === "w" ? "White to move" : "Black to move"}</span>
            <IconButton label="Use the starting position" onClick={onClearFen}>
              <Close size={16} />
            </IconButton>
          </div>
        </>
      )}

      <label className="ng__row" title="Any piece may move to any square; capturing the king wins.">
        <Check checked={chaosOn} onChange={setChaosOn} label="Chaos mode" />
        <span>Chaos Mode</span>
      </label>

      </div>
      <footer className="ng__foot">
        <button type="button" className="btn btn--primary btn--hero" onClick={start}>
          Start Game
        </button>
        {onBack && (
          <button type="button" className="btn btn--quiet btn--block" onClick={onBack}>
            Back to Game
          </button>
        )}
      </footer>
    </div>
  );
}

function Choice({
  on,
  onPick,
  avatar,
  title,
  meta,
  children,
}: {
  on: boolean;
  onPick: () => void;
  avatar: React.ReactNode;
  title: string;
  meta: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={"choice" + (on ? " is-on" : "")}>
      <button type="button" role="radio" aria-checked={on} className="choice__main" onClick={onPick}>
        {avatar}
        <span className="choice__title">{title}</span>
        <span className="choice__meta">{meta}</span>
      </button>
      {children}
    </div>
  );
}

function LevelPicker({ level, onLevel }: { level: number; onLevel: (l: number) => void }) {
  return (
    <div className="levels" role="radiogroup" aria-label="Stockfish level">
      {LEVELS.map((l) => (
        <button key={l.level} type="button" role="radio" aria-checked={level === l.level} className="lvl" title={l.elo} onClick={() => onLevel(l.level)}>
          {l.level}
        </button>
      ))}
    </div>
  );
}

export function EngineAvatar({ small }: { small?: boolean }) {
  return (
    <span className={"avatar avatar--engine" + (small ? " avatar--sm" : "")}>
      <Fish size={small ? 15 : 21} />
    </span>
  );
}

export function HumanAvatar({ small }: { small?: boolean }) {
  return (
    <span className={"avatar" + (small ? " avatar--sm" : "")}>
      <PersonFill size={small ? 12 : 17} />
    </span>
  );
}

export function AgentAvatar({ agent, small }: { agent: AgentRow; small?: boolean }) {
  const photo = useAsset(agent.avatar);
  return (
    <span className={"avatar" + (small ? " avatar--sm" : "")} style={{ background: photo ? "transparent" : agentTint(agent.id) }}>
      {photo ? <img src={photo} alt="" draggable={false} /> : <span className="avatar__mono">{agent.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function seatLabel(v: string, agents: AgentRow[]): { title: string; meta: string; avatar: React.ReactNode } {
  if (v.startsWith("engine:")) {
    const lv = levelInfo(Number(v.slice(7)));
    return { title: `Stockfish ${lv.level}`, meta: lv.elo, avatar: <EngineAvatar small /> };
  }
  const a = agents.find((x) => x.id === v);
  return a ? { title: a.name, meta: a.model ?? a.backend ?? "", avatar: <AgentAvatar agent={a} small /> } : { title: "—", meta: "", avatar: null };
}

/** A seat for Watch: any agent, or Stockfish at a level. */
function SeatSelect({ value, agents, onChange }: { value: string; agents: AgentRow[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const cur = seatLabel(value, agents);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="select" ref={root}>
      <button type="button" className="select__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {cur.avatar}
        <span className="choice__title">{cur.title}</span>
        <span className="choice__meta">{cur.meta}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu menu--down menu--full" role="listbox">
          {agents.map((a) => (
            <button key={a.id} type="button" role="option" aria-selected={value === a.id} className="menu__item" onClick={() => pick(a.id)}>
              <AgentAvatar agent={a} small />
              <span className="menu__text">
                {a.name}
                {(a.model || a.backend) && <small>{a.model ?? a.backend}</small>}
              </span>
            </button>
          ))}
          <div className="menu__group">Stockfish</div>
          <div className="menu__levels">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                role="option"
                aria-selected={value === `engine:${l.level}`}
                className="lvl"
                title={l.elo}
                onClick={() => pick(`engine:${l.level}`)}
              >
                {l.level}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MiniBoard({ fen, size = 89 }: { fen: string; size?: number }) {
  const s = useSettings();
  const t = boardTheme(s.boardTheme);
  const b = boardFromFen(fen);
  const cells = [];
  for (let r = 7; r >= 0; r--)
    for (let f = 0; f < 8; f++) {
      const sq = r * 8 + f;
      cells.push(
        <span key={sq} style={{ background: (r + f) % 2 ? t.light : t.dark }}>
          {b[sq] && <PieceImg code={b[sq]!} set={s.pieceSet} />}
        </span>,
      );
    }
  return (
    <span className="mini" style={{ width: size, height: size }} aria-label="Position">
      {cells}
    </span>
  );
}

export function SpeedIcon({ speed, size = 18 }: { speed: Speed | null; size?: number }) {
  if (!speed) {
    return (
      <span className="speed">
        <ClockIcon size={size} />
      </span>
    );
  }
  const url = speed === "bullet" ? bulletMark : speed === "blitz" ? blitzMark : rapidMark;
  return <img className="speed speed--img" src={url} width={size} height={size} alt="" draggable={false} />;
}
