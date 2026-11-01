# Conform a cut sound to its lichess reference: (1) match EQ — the reference's spectral
# balance in third-octave bands, clamped to ±15 dB, as a linear-phase FIR; (2) envelope
# transplant — attenuate wherever the cut rings longer than the reference does; (3) the
# reference's loudness (RMS over the file), peak-limited to -0.5 dBFS.
import sys, subprocess, numpy as np
sys.path.insert(0, sys.argv[1]); from feat import load, SR, db
SP, OUT = sys.argv[2], sys.argv[3]

def bands_gain(ref, x):
    n = 1 << 14
    R = np.abs(np.fft.rfft(ref * np.hanning(len(ref)), n)) ** 2
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    centers = 60 * 2 ** (np.arange(0, 28) / 3)
    g = []
    for c in centers:
        m = (f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))
        g.append(10 * np.log10((R[m].sum() + 1e-12) / (X[m].sum() + 1e-12)))
    g = np.array(g); g -= np.median(g)  # level is matched later; shape only
    return centers, np.clip(g, -9, 9)

def fir(centers, gdb, taps=1023):
    f = np.fft.rfftfreq(2048, 1 / SR)
    gi = np.interp(np.log(np.maximum(f, 1)), np.log(centers), gdb, left=gdb[0], right=gdb[-1])
    h = np.fft.irfft(10 ** (gi / 20), 2048); h = np.roll(h, taps // 2)[:taps] * np.hanning(taps)
    return h

def env(x, ms=3):
    n = max(1, int(SR * ms / 1000)); return np.sqrt(np.convolve(x * x, np.ones(n) / n, "same")) + 1e-7

def active(y):
    e = env(y); edb = db(e / e.max()); idx = np.where(edb > -40)[0]; return y[idx[0]: idx[-1] + 1]

for name, refname in [("move", "Move"), ("capture", "Capture"), ("notify", "GenericNotify"), ("error", "Error")]:
    ref = load(f"{SP}/ref/{refname}.mp3"); x = np.fromfile(f"{OUT}/{name}.f32", dtype=np.float32)
    n = min(len(ref), len(x)); ref, x = ref[:n], x[:n]
    c, g = bands_gain(active(ref), active(x))
    y = np.convolve(x, fir(c, g), "same")
    # envelope transplant, aligned on the onsets
    def onset(z):
        e = env(z); return int(np.argmax(db(e / e.max()) > -30))
    shift = onset(ref) - onset(y)
    y = np.roll(y, shift)
    er, ey = env(ref, 1), env(y, 1)
    gain = np.minimum(1.0, (er / er.max()) / (ey / ey.max()))
    if name == "notify": gain = np.ones_like(gain)  # tonal: keep its own ring
    gain = np.convolve(gain, np.ones(int(SR * 0.001)) / int(SR * 0.001), "same")
    y = y * gain
    y *= np.sqrt((ref ** 2).mean()) / np.sqrt((y ** 2).mean())
    pk = np.abs(y).max(); lim = 10 ** (-0.5 / 20)
    if pk > lim: y *= lim / pk
    raw = f"{OUT}/{name}.c.f32"; y.astype(np.float32).tofile(raw)
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", raw,
                    "-c:a", "libmp3lame", "-b:a", "128k", f"{OUT}/final-{name}.mp3"], check=True)
    print(name, "eq dB per band:", " ".join(f"{v:+.0f}" for v in g[::3]))
