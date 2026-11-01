# Cut the CC0 recordings into the four board sounds, each conformed to the lichess
# "standard" reference it replaces: same file length, same onset position, same overall
# loudness (RMS over the file), a fade that ends where the reference ends.
import sys, subprocess, numpy as np
sys.path.insert(0, sys.argv[1]); from feat import load, SR, db
SP = sys.argv[2]; OUT = sys.argv[3]

def ref(name):
    y = load(f"{SP}/ref/{name}.mp3")
    H = SR // 1000; n = len(y) // H
    fr = np.sqrt((y[:n*H].reshape(n, H) ** 2).mean(1)) + 1e-9
    onset = int(np.argmax(db(fr / fr.max()) > -30)) * H
    return dict(len=len(y), onset=onset, rms=float(np.sqrt((y ** 2).mean())))

def cut(src, t0, r, pre=0.003):
    x = load(src); s = int((t0 - pre) * SR); seg = x[max(0, s): max(0, s) + r["len"] - r["onset"]]
    out = np.zeros(r["len"], dtype=np.float32); out[r["onset"]: r["onset"] + len(seg)] = seg
    return out

def hp(x, f=70.0):  # one-pole high-pass: rumble from handling noise
    a = np.exp(-2 * np.pi * f / SR); y = np.zeros_like(x); prev_x = prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = a * (prev_y + v - prev_x); prev_x = v; y[i] = prev_y
    return y

def finish(x, r, fade_frac=0.4, name=""):
    n = len(x); f = int(n * fade_frac)
    x = x.copy(); x[n - f:] *= np.linspace(1, 0, f) ** 2
    x[: int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    x *= r["rms"] / max(float(np.sqrt((x ** 2).mean())), 1e-9)
    peak = float(np.abs(x).max()); lim = 10 ** (-0.5 / 20)
    if peak > lim: x *= lim / peak
    wav = f"{OUT}/{name}.f32"; x.astype(np.float32).tofile(wav)
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", wav,
                    "-c:a", "libmp3lame", "-b:a", "128k", f"{OUT}/{name}.mp3"], check=True)
    print(name, "ms", round(n / SR * 1000), "peak dBFS", round(float(db(np.abs(x).max())), 1),
          "rms dB", round(float(db(np.sqrt((x ** 2).mean()))), 1), "ref rms", round(float(db(r["rms"])), 1))

JJ = f"{SP}/snd/733927_15803939.mp3"
r = ref("Move"); finish(hp(cut(JJ, 38.528 + 0.004, r)), r, 0.45, "move")
r = ref("Capture"); finish(hp(cut(JJ, 41.042 + 0.004, r)), r, 0.45, "capture")

# GenericNotify: a struck tone, then a second, quieter strike 295 ms later (measured).
r = ref("GenericNotify"); x = load(f"{SP}/snd3/504183.mp3")
H = SR // 1000; on = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05))
strike = x[max(0, on - int(0.003 * SR)):]
out = np.zeros(r["len"], dtype=np.float32)
a = strike[: r["len"] - r["onset"]]; out[r["onset"]: r["onset"] + len(a)] += a
o2 = r["onset"] + int(0.295 * SR); b = strike[: r["len"] - o2] * 10 ** (-20 / 20); out[o2: o2 + len(b)] += b
finish(out, r, 0.35, "notify")

r = ref("Error"); x = load(f"{SP}/snd3/523702.mp3")
on = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05))
finish(cut(f"{SP}/snd3/523702.mp3", on / SR, r, 0.002), r, 0.5, "error")
