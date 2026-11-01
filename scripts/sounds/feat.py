import numpy as np, subprocess, sys, json
SR = 44100
def load(path):
    raw = subprocess.run(["ffmpeg","-v","quiet","-i",path,"-ac","1","-ar",str(SR),"-f","f32le","-"],capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
def env(x, win=0.003):
    n = max(1,int(SR*win)); k = np.ones(n)/n
    return np.sqrt(np.convolve(x*x, k, mode="same"))
def db(v): return 20*np.log10(np.maximum(v,1e-9))
def features(x):
    e = env(x); pk = e.max(); edb = db(e/pk)
    i0 = int(np.argmax(edb > -30)); ipk = int(np.argmax(e))
    above = np.where(edb > -40)[0]; i1 = above[-1] if len(above) else ipk
    seg = x[i0:i1+1]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=8192)); f = np.fft.rfftfreq(8192, 1/SR)
    cen = float((spec*f).sum()/spec.sum())
    # low/high energy ratio
    lo = spec[f<800].sum(); hi = spec[f>=800].sum()
    # count transients: peaks in env derivative over -12 dB separated by >25ms
    d = np.diff(e); thr = pk*0.25; peaks=[]; last=-10**9
    for i in range(1,len(e)-1):
        if e[i] > thr and e[i]>=e[i-1] and e[i]>=e[i+1] and i-last > SR*0.025: peaks.append(i); last=i
    # decay: time from peak to -20 dB
    after = np.where(edb[ipk:] < -20)[0]; dec = (after[0] if len(after) else len(edb)-ipk)/SR
    return dict(dur=round((i1-i0)/SR,3), attack_ms=round((ipk-i0)/SR*1000,1), decay20_ms=round(dec*1000,1),
                centroid=round(cen), lo_hi=round(float(lo/hi),2), transients=len(peaks),
                peak_db=round(float(db(np.abs(x).max())),1), rms_db=round(float(db(np.sqrt((seg**2).mean()))),1))
if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p.split("/")[-1], json.dumps(features(load(p))))
