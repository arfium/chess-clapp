//! Preferences, as a small preferences window: the pages down the side, one page at a
//! time. The Board page shows the real board — every choice on it lands there first.

import type { ReactNode } from "react";
import { ANIMATION_MS, setSettings, useSettings, type AppTheme, type Settings } from "../lib/settings";
import { BOARD_THEMES, PIECE_SETS, boardTheme, pieceSet } from "../lib/themes";
import { boardFromFen } from "../lib/chess";
import { play } from "../lib/sound";
import { Board as BoardIcon, Engine, Info, Window } from "../icons";
import { Board, PieceImg } from "./Board";
import { Check, Dialog, Segmented } from "./ui";

type Page = Settings["settingsTab"];

const PAGES: { id: Page; label: string; Icon: typeof Engine }[] = [
  { id: "board", label: "Board", Icon: BoardIcon },
  { id: "interface", label: "Interface", Icon: Window },
  { id: "analysis", label: "Analysis", Icon: Engine },
  { id: "about", label: "About", Icon: Info },
];

const APP_THEMES: { id: AppTheme; name: string }[] = [
  { id: "system", name: "Match System" },
  { id: "scoresheet", name: "Scoresheet" },
  { id: "night", name: "Night" },
  { id: "walnut", name: "Walnut" },
];

// The preview: the Ruy Lopez after 3.Bb5, Black's knight in hand.
const PREVIEW = boardFromFen("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3");
const PREVIEW_TARGETS = new Set([57, 52, 32, 25, 27]);
const PREVIEW_LAST = { from: 5, to: 33 };
const nothing = () => {};
const never = () => false;

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const page = s.settingsTab;

  return (
    <Dialog title="Settings" onClose={onClose} className="dialog--prefs">
      <div className="prefs">
        <nav className="prefs__nav" role="tablist" aria-orientation="vertical" aria-label="Settings">
          {PAGES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={page === id}
              className="prefs__tab"
              onClick={() => setSettings({ settingsTab: id })}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="prefs__page" role="tabpanel" aria-label={PAGES.find((p) => p.id === page)?.label} key={page}>
          {page === "board" && <BoardPage s={s} />}
          {page === "interface" && <InterfacePage s={s} />}
          {page === "analysis" && <AnalysisPage s={s} />}
          {page === "about" && <AboutPage s={s} />}
        </div>
      </div>
    </Dialog>
  );
}

function BoardPage({ s }: { s: Settings }) {
  const theme = boardTheme(s.boardTheme);
  return (
    <>
      <div className="prefs__stage">
        <div className="prefs__preview" aria-hidden="true">
          <Board
            size={200}
            board={PREVIEW}
            bottom="w"
            theme={theme}
            pieceSet={s.pieceSet}
            coords={s.coords === "inside"}
            animationMs={0}
            showLegal={s.showLegal}
            lastMove={s.highlightLast ? PREVIEW_LAST : null}
            checkSq={null}
            selected={42}
            targets={PREVIEW_TARGETS}
            movable={never}
            canDrop={never}
            onSelect={nothing}
            onMove={nothing}
            promotion={null}
            onPromote={nothing}
            arrows={[]}
            badge={null}
            positionKey="preview"
          />
        </div>
        <div>
          <h4>Board</h4>
          <div className="picks picks--boards" role="radiogroup" aria-label="Board colours">
            {BOARD_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={s.boardTheme === t.id}
                aria-label={t.name}
                title={t.name}
                className="pick"
                onClick={() => setSettings({ boardTheme: t.id })}
              >
                <span
                  className="pick__art pick__art--board"
                  style={{ "--l": t.light, "--d": t.dark } as React.CSSProperties}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <h4>Pieces</h4>
      <div className="picks picks--sets" role="radiogroup" aria-label="Piece set">
        {PIECE_SETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={s.pieceSet === p.id}
            className="pick"
            onClick={() => setSettings({ pieceSet: p.id })}
          >
            <span className="pick__art pick__art--set" style={{ background: theme.light }}>
              <PieceImg code="wN" set={p.id} />
              <PieceImg code="bN" set={p.id} />
            </span>
            <span className="pick__name">{p.name}</span>
          </button>
        ))}
      </div>

      <h4>Play</h4>
      <Row label="Coordinates">
        <Check label="Coordinates" checked={s.coords === "inside"} onChange={(on) => setSettings({ coords: on ? "inside" : "none" })} />
      </Row>
      <Row label="Legal Moves">
        <Check label="Legal Moves" checked={s.showLegal} onChange={(on) => setSettings({ showLegal: on })} />
      </Row>
      <Row label="Last Move Highlight">
        <Check label="Last Move Highlight" checked={s.highlightLast} onChange={(on) => setSettings({ highlightLast: on })} />
      </Row>
      <Row label="Auto-Queen">
        <Check label="Auto-Queen" checked={s.autoQueen} onChange={(on) => setSettings({ autoQueen: on })} />
      </Row>
      <Row label="Piece Animation">
        <Segmented
          label="Piece Animation"
          value={s.animation}
          onChange={(v) => setSettings({ animation: v })}
          options={(["off", "fast", "normal", "slow"] as const).map((v) => ({
            value: v,
            label: v === "off" ? "Instant" : v[0].toUpperCase() + v.slice(1),
            title: v === "off" ? undefined : `${ANIMATION_MS[v]} ms`,
          }))}
        />
      </Row>
    </>
  );
}

function InterfacePage({ s }: { s: Settings }) {
  const theme = boardTheme(s.boardTheme);
  const board = { "--l": theme.light, "--d": theme.dark } as React.CSSProperties;
  return (
    <>
      <h4>Theme</h4>
      <div className="picks picks--windows" role="radiogroup" aria-label="Window theme">
        {APP_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={s.appTheme === t.id}
            className="pick"
            onClick={() => setSettings({ appTheme: t.id })}
          >
            <span className="pick__art pick__art--window">
              {(t.id === "system" ? (["scoresheet", "night"] as const) : [t.id]).map((id) => (
                <span key={id} className="mini" data-theme-preview={id} style={board}>
                  <span className="mini__board" />
                  <span className="mini__sheet">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
              ))}
            </span>
            <span className="pick__name">{t.name}</span>
          </button>
        ))}
      </div>

      <h4>Notation</h4>
      <Row label="Figurines">
        <Check label="Figurines" checked={s.figurines} onChange={(on) => setSettings({ figurines: on })} />
      </Row>

      <h4>Sound</h4>
      <Row label="Sound">
        <Check label="Sound" checked={s.sound} onChange={(on) => setSettings({ sound: on })} />
      </Row>
      <Row label="Volume">
        <input
          className="range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.volume}
          disabled={!s.sound}
          onChange={(e) => setSettings({ volume: Number(e.target.value) })}
          onPointerUp={() => play("capture")}
          aria-label="Volume"
        />
      </Row>
    </>
  );
}

function AnalysisPage({ s }: { s: Settings }) {
  return (
    <>
      <h4>Engine</h4>
      <Row label="Engine While Playing">
        <Check label="Engine While Playing" checked={s.engineOn} onChange={(on) => setSettings({ engineOn: on })} />
      </Row>
      <Row label="Evaluation Bar">
        <Check label="Evaluation Bar" checked={s.evalBar} onChange={(on) => setSettings({ evalBar: on })} />
      </Row>
      <Row label="Engine Arrows">
        <Check label="Engine Arrows" checked={s.bestArrow} onChange={(on) => setSettings({ bestArrow: on })} />
      </Row>
      <Row label="Engine Lines">
        <Segmented
          label="Engine Lines"
          value={s.multiPv}
          onChange={(v) => setSettings({ multiPv: v })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n }))}
        />
      </Row>
      <Row label="Search Depth">
        <Segmented
          label="Search Depth"
          value={s.maxDepth}
          onChange={(v) => setSettings({ maxDepth: v })}
          options={[
            { value: 16, label: "16" },
            { value: 20, label: "20" },
            { value: 24, label: "24" },
            { value: 0, label: "∞", title: "Unlimited" },
          ]}
        />
      </Row>

      <h4>Game Review</h4>
      <Row label="Depth">
        <Segmented
          label="Review Depth"
          value={s.reviewDepth}
          onChange={(v) => setSettings({ reviewDepth: v })}
          options={[
            { value: 10, label: "Quick" },
            { value: 14, label: "Standard" },
            { value: 18, label: "Deep" },
          ]}
        />
      </Row>
    </>
  );
}

function AboutPage({ s }: { s: Settings }) {
  const set = pieceSet(s.pieceSet);
  return (
    <>
      <h4>Credits</h4>
      <dl className="credits">
        <dt>Engine</dt>
        <dd>Stockfish 18 · stockfish.js · GPL-3.0</dd>
        <dt>Pieces</dt>
        <dd>
          {set.name} · {set.credit} · {set.license}
        </dd>
        <dt>Sounds</dt>
        <dd>JJTaynos · rabbydaw · PostRobcore · CC0</dd>
        <dt>Openings</dt>
        <dd>lichess-org/chess-openings · CC0</dd>
      </dl>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div className="srow__label">{label}</div>
      {children}
    </div>
  );
}
