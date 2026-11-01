//! A nameplate: who sits on this side, whose move it is, what they have taken. The note
//! an agent leaves with `chess say` hangs off its own plate.

import { agentTint, useAsset, type AgentRow, type Player, type Side } from "../bridge";
import { levelInfo } from "../engine/levels";
import { Fish, PersonFill } from "../icons";
import { PieceImg } from "./Board";
import { useEffect, useState } from "react";
import { Clock as ClockIcon } from "../icons";
import { fmtClock } from "../lib/timecontrol";

/** A clock face: counts down locally between snapshots while it runs. */
function ClockFace({ ms, running, at }: { ms: number; running: boolean; at: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = window.setTimeout(loop, 100) as unknown as number;
    };
    loop();
    return () => window.clearTimeout(raf);
  }, [running, at]);
  const left = running ? Math.max(0, ms - (now - at)) : ms;
  const low = left < 20_000;
  return (
    <div className={"clock" + (running ? " is-running" : "") + (low ? " is-low" : "")} role="timer" aria-live="off">
      {running && <ClockIcon size={16} />}
      <span className="clock__time">{fmtClock(left)}</span>
    </div>
  );
}

export function PlayerStrip({
  color,
  player,
  agents,
  isTurn,
  thinking,
  captured,
  advantage,
  pieceSet,
  note,
  noteUp,
  nameOverride,
  clock,
}: {
  color: Side;
  player: Player;
  agents: AgentRow[];
  isTurn: boolean;
  thinking: boolean;
  captured: string[];
  advantage: number;
  pieceSet: string;
  note: string | null;
  noteUp: boolean;
  /** Analysis and review show the names from the game, not the seats. */
  nameOverride?: string;
  /** This side's clock: ms left as of `at` (performance.now()), and whether it is running. */
  clock?: { ms: number; running: boolean; at: number } | null;
}) {
  const row = player.kind === "agent" ? agents.find((a) => a.id === player.id) : undefined;
  let name: string;
  let meta = "";
  if (nameOverride !== undefined) name = nameOverride;
  else if (player.kind === "human") name = "You";
  else if (player.kind === "agent") {
    name = row?.name || player.name || "Agent";
    meta = !row ? "Offline" : row.model ?? row.backend ?? "";
  } else if (player.kind === "engine") {
    const lv = levelInfo(player.level);
    name = `Stockfish ${lv.level}`;
    meta = lv.elo;
  } else name = color === "w" ? "White" : "Black";
  const sideLabel = name === "White" || name === "Black";
  if (thinking) meta = "Thinking";

  return (
    <div className={"plate" + (isTurn ? " plate--turn" : "")}>
      <Avatar player={nameOverride !== undefined ? { kind: "empty" } : player} row={row} label={nameOverride === undefined && player.kind === "empty" ? (color === "w" ? "White" : "Black") : name} />
      <div className="plate__who">
        <div className="plate__name">
          <span>{name}</span>
          {!sideLabel && <i className={"side side--" + color} aria-label={color === "w" ? "White" : "Black"} />}
        </div>
        {meta && <div className={"plate__meta" + (thinking ? " thinking" : "")}>{meta}</div>}
      </div>
      <div className="plate__caps" aria-label="Captured pieces">
        {captured.map((code, i) => (
          <span key={i} className={"cap cap--" + code[0] + (i > 0 && captured[i - 1] === code ? " cap--stack" : "")}>
            <PieceImg code={code} set={pieceSet} />
          </span>
        ))}
        {advantage > 0 && <span className="plate__adv">+{advantage}</span>}
      </div>
      {clock && <ClockFace {...clock} />}
      {note && (
        <div className={"note-bubble " + (noteUp ? "note-bubble--up" : "note-bubble--down")} role="status">
          {note}
        </div>
      )}
    </div>
  );
}

function Avatar({ player, row, label }: { player: Player; row?: AgentRow; label: string }) {
  const photo = useAsset(player.kind === "agent" ? row?.avatar ?? player.avatar : null);
  if (player.kind === "human")
    return (
      <div className="avatar">
        <PersonFill size={17} />
      </div>
    );
  if (player.kind === "engine")
    return (
      <div className="avatar avatar--engine">
        <Fish size={21} />
      </div>
    );
  if (player.kind === "agent")
    return (
      <div className="avatar" style={{ background: photo ? "transparent" : row ? agentTint(player.id ?? "") : undefined }}>
        {photo ? <img src={photo} alt="" draggable={false} /> : <span className="avatar__mono">{label.slice(0, 1).toUpperCase()}</span>}
      </div>
    );
  if (label === "White" || label === "Black") return <div className={"avatar avatar--side avatar--side-" + (label === "White" ? "w" : "b")} />;
  return (
    <div className="avatar avatar--blank">
      <span className="avatar__mono">{label.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
