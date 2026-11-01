//! Board sounds. Recorded, not synthesised: wooden chess pieces on a wooden board
//! (JJTaynos, Freesound #733927, CC0), a struck xylophone bar (rabbydaw, #504183, CC0) and
//! a short low beep (PostRobcore, #523702, CC0), each cut and levelled to match the lichess
//! "standard" sound it stands in for — same length, onset, loudness and spectral balance
//! (scripts/sounds/). Which sound plays when is lichess's mapping too: a move, a capture,
//! nothing extra for check, one notification for the start and the end of a game.

import { getSettings } from "./settings";

export type SoundKind = "move" | "capture" | "notify" | "error";

let ctx: AudioContext | null = null;
const buffers = new Map<SoundKind, AudioBuffer>();
let loading: Promise<void> | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

function load(): Promise<void> {
  const a = audio();
  if (!a) return Promise.resolve();
  loading ??= Promise.all(
    (["move", "capture", "notify", "error"] as SoundKind[]).map((k) =>
      fetch(`/sounds/${k}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise<AudioBuffer>((ok, bad) => a.decodeAudioData(b, ok, bad)))
        .then((buf) => void buffers.set(k, buf))
        .catch(() => {}),
    ),
  ).then(() => {});
  return loading;
}

/** Audio starts suspended until a gesture; call this from any click. */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
  void load();
}

export function play(kind: SoundKind): void {
  const s = getSettings();
  if (!s.sound) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const go = () => {
    const buf = buffers.get(kind);
    if (!buf) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = s.volume;
    src.connect(g).connect(a.destination);
    src.start();
  };
  if (buffers.size) go();
  else void load().then(go);
}

/** lichess: a capture sounds like a capture; every other move — check included — is a move. */
export function soundFor(san: string): SoundKind {
  return san.includes("x") ? "capture" : "move";
}
