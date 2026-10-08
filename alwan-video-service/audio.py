"""Soundtrack for the «مطبعة ألوان» video-ad service spot: synthesized cinematic-electronic score,
timed sound effects and the processed Arabic voice-over, mixed to 48 kHz stereo.
Usage: python3 audio.py out.wav"""
import sys, wave, subprocess
import numpy as np

SR = 48000
DUR = 124.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)


def t_(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    r = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    L[i:i + len(sig)] += sig * gain * l
    R[i:i + len(sig)] += sig * gain * r


def lp(x, cutoff):
    """one-pole low-pass, cutoff may be an array"""
    a = np.exp(-2 * np.pi * np.broadcast_to(cutoff, x.shape) / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def lp_fast(x, cutoff):
    # FFT brick-ish low-pass with soft knee (static cutoff)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def hp_fast(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (cutoff / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))


def bp_fast(x, lo, hi):
    return hp_fast(lp_fast(x, hi), lo)


def env(n, a, d, sustain=0.0):
    e = np.ones(n) * sustain
    na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    nd = n - na
    e[na:] = sustain + (1 - sustain) * np.exp(-np.arange(nd) / SR / max(d, 1e-4))
    return e


def saw(f, tt):
    ph = np.cumsum(np.broadcast_to(f, tt.shape) / SR)
    return 2 * (ph % 1) - 1


def note(n):
    return 440 * 2 ** ((n - 69) / 12)


def reverb(x, secs=2.5, mix=.3, seed=1):
    r = np.random.default_rng(seed)
    n = int(secs * SR); ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / secs)
    ir = lp_fast(ir, 6000); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return x * (1 - mix) + y * mix * 1.2


# ------------------------------------------------------------- sfx
def whoosh(d, f0, f1, g=1):
    seg = t_(d); n = rng.standard_normal(len(seg)); out = np.zeros_like(n)
    cuts = np.geomspace(f0, f1, 8)
    for c0, c1, a, b in zip(cuts[:-1], cuts[1:], range(7), range(1, 8)):
        i0, i1 = int(len(seg) * a / 7), int(len(seg) * b / 7)
        out[i0:i1] = bp_fast(n, c0 * .6, c0 * 1.8)[i0:i1]
    e = np.sin(np.pi * np.linspace(0, 1, len(seg))) ** 1.5
    return out * e * g
def riser(d, g=1):
    seg = t_(d); n = rng.standard_normal(len(seg))
    s = lp(n, np.geomspace(200, 9000, len(seg))) + .3 * saw(np.geomspace(110, 880, len(seg)), seg)
    return s * (seg / d) ** 2 * g
def boom(g=1, d=2.5):
    seg = t_(d); f = 32 + 90 * np.exp(-seg * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .002, .8)
    s += lp_fast(rng.standard_normal(len(seg)), 1500) * env(len(seg), .001, .12) * .5
    return np.tanh(s * 1.4) * g
def blip(f, d=.5, g=1):  # electronic pulse
    seg = t_(d); s = np.sin(2 * np.pi * f * seg + 2 * np.sin(2 * np.pi * f * .5 * seg) * np.exp(-seg * 8))
    return s * env(len(seg), .003, .18) * g
def drip(g=1):
    seg = t_(.35); f = 600 + 1400 * np.exp(-seg * 22)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .001, .06) * g
def splashs(g=1):
    seg = t_(1.4); n = bp_fast(rng.standard_normal(len(seg)), 300, 7000)
    return n * env(len(seg), .002, .35) * g
def click(f=2500, g=1):
    seg = t_(.06); return bp_fast(rng.standard_normal(len(seg)), f * .5, f * 1.5) * env(len(seg), .0005, .012) * g
def clack(g=1):  # machine mechanical clack
    seg = t_(.12); s = bp_fast(rng.standard_normal(len(seg)), 400, 3000) * env(len(seg), .001, .025)
    s += np.sin(2 * np.pi * 180 * seg) * env(len(seg), .001, .03) * .6
    return s * g
def paper(d=.35, g=1):
    seg = t_(d); n = bp_fast(rng.standard_normal(len(seg)), 1500, 9000)
    grit = (rng.random(len(seg)) < .02) * rng.standard_normal(len(seg)) * 3
    return (n + hp_fast(grit, 2000)) * np.sin(np.pi * np.linspace(0, 1, len(seg))) * g
def pop(f=500, g=1):
    seg = t_(.18); fr = f * (1 + 2 * np.exp(-seg * 40))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(len(seg), .001, .04) * g
def chime(g=1):
    seg = t_(1.6); s = sum(np.sin(2 * np.pi * note(n) * seg) * a for n, a in ((86, 1), (93, .6), (98, .35)))
    return s * env(len(seg), .002, .45) * g

def reverse_swell(d, g=1):
    return riser(d, g)[::-1][::-1]

def hum(d, g=1):
    seg = t_(d); s = sum(np.sin(2 * np.pi * 100 * h * seg) / h for h in (1, 2, 3, 5))
    s += .3 * bp_fast(rng.standard_normal(len(seg)), 2000, 6000)
    return s * np.minimum(1, seg / .1) * np.minimum(1, (d - seg) / .4) * g
def metal(g=1):
    seg = t_(2.0); s = sum(np.sin(2 * np.pi * f * seg) * a * np.exp(-seg * dk) for f, a, dk in ((523, 1, 2.5), (1371, .6, 3.5), (2389, .4, 5), (3720, .25, 7)))
    return s * g
def scan(d, g=1):
    seg = t_(d); n = bp_fast(rng.standard_normal(len(seg)), 1500, 4000) * (1 + .6 * np.sign(np.sin(2 * np.pi * 38 * seg)))
    return n * np.sin(np.pi * np.linspace(0, 1, len(seg))) * g


lerp = lambda a, b, t: a + (b - a) * t
P = lambda t, a, b: min(1, max(0, (t - a) / (b - a)))

# ------------------------------------------------------------- comedy sfx
def beep(f=2200, d=.07, g=1):
    seg = t_(d); return np.sign(np.sin(2 * np.pi * f * seg)) * .3 * env(len(seg), .002, d * .6, .4) * g
def siren(d, g=1):
    seg = t_(d); f = np.where((seg * 4) % 1 < .5, 880, 660)
    return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * .25 * g
def slide(f0, f1, d, g=1):  # slide whistle
    seg = t_(d); f = np.geomspace(f0, f1, len(seg)) * (1 + .015 * np.sin(2 * np.pi * 6 * seg))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, seg / .03) * np.minimum(1, (d - seg) / .05) * g
def boing(g=1):
    seg = t_(.6); f = 180 + 120 * np.sin(2 * np.pi * 9 * seg) * np.exp(-seg * 5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .002, .25) * g
def steps(n, gap, g=1, f=900):
    out = np.zeros(int((n * gap + .2) * SR))
    for i in range(n):
        s = bp_fast(rng.standard_normal(int(.06 * SR)), f * .5, f * 2) * env(int(.06 * SR), .001, .015)
        j = int(i * gap * SR); out[j:j + len(s)] += s * (1 if i % 2 else .7)
    return out * g
def trombone(g=1):  # sad "wah wah wah waaah"
    out = []
    for k, (n, d) in enumerate([(55, .38), (54, .38), (53, .38), (52, 1.2)]):
        seg = t_(d); f = note(n) * (1 + (.03 * np.sin(2 * np.pi * 5 * seg) if k == 3 else 0))
        s = lp_fast(saw(f, seg) + .5 * saw(f * 2.002, seg), 900) * np.minimum(1, seg / .05) * np.minimum(1, (d - seg) / .1)
        s *= .55 + .45 * np.sin(np.pi * np.minimum(seg / d, 1)) ** .5
        out.append(s)
    return np.concatenate(out) * g
def ding(g=1):
    seg = t_(1.5); return (np.sin(2 * np.pi * 1318 * seg) + .6 * np.sin(2 * np.pi * 1046 * seg)) * np.exp(-seg * 3) * g
def scratch(g=1):
    seg = t_(.45); f = 300 + 900 * np.abs(np.sin(2 * np.pi * 3 * seg))
    n = bp_fast(rng.standard_normal(len(seg)), 400, 4000) * (.5 + .5 * np.sin(2 * np.pi * np.cumsum(f) / SR))
    return n * env(len(seg), .002, .2) * g
def kaching(g=1):
    return (click(4000, 1) if False else np.zeros(1)) * 0 + np.concatenate([np.zeros(int(.06 * SR)), chime(1)[: int(1.2 * SR)]]) * g
def rimshot(g=1):
    sn = bp_fast(rng.standard_normal(int(.3 * SR)), 800, 6000) * env(int(.3 * SR), .001, .07)
    k = np.sin(2 * np.pi * np.cumsum(60 + 90 * np.exp(-t_(.3) * 30)) / SR) * env(int(.3 * SR), .001, .12)
    cym = hp_fast(rng.standard_normal(int(1.6 * SR)), 5000) * env(int(1.6 * SR), .002, .5) * .45
    out = np.zeros(int(2.2 * SR))
    out[:len(sn)] += sn * .6; out[int(.18 * SR):int(.18 * SR) + len(k)] += k + sn * .8; out[int(.45 * SR):int(.45 * SR) + len(cym)] += cym
    return out * g


# ------------------------------------------------------------- music (kept low, under the voice)
music = np.zeros(N); tt = np.arange(N) / SR
def mput(s, at, g=1):
    i = int(at * SR); j = min(N, i + len(s))
    if j > i: music[i:j] += s[: j - i] * g
def pl(f, d=.25, bright=2400, dec=.12):
    seg = t_(d); s = saw(f, seg) * .5 + np.sin(2 * np.pi * f * seg) * .6
    return lp_fast(s, bright) * env(len(seg), .004, dec)
def kick():
    seg = t_(.4); f = 45 + 100 * np.exp(-seg * 30); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .001, .16)
def hat(): seg = t_(.05); return hp_fast(rng.standard_normal(len(seg)), 7000) * env(len(seg), .001, .015) * .18
def clap():
    seg = t_(.25); return bp_fast(rng.standard_normal(len(seg)), 900, 5000) * env(len(seg), .001, .05) * .3
KK, HH, CL = kick(), hat(), clap()
BPM = 100; B = 60 / BPM; BAR = 4 * B
CH = [[50, 57, 62, 65], [46, 53, 58, 62], [53, 60, 65, 69], [48, 55, 60, 64]]   # Dm Bb F C
# pads all through, darker in the "problem" intro
for b in range(int(DUR / BAR) + 1):
    st = b * BAR; ch = CH[b % 4]; d = BAR + .5; seg = t_(d)
    s = sum(saw(note(n) * (1 + dt), seg) for n in ch for dt in (-.004, .004)) / 8
    s = lp_fast(s, 700 if st < 12 else 1600) * np.minimum(1, seg / .5) * np.minimum(1, (d - seg) / .5)
    mput(s, st, .5)
# arp + groove from the brand reveal on
for k in range(int(DUR / (B / 2))):
    st = k * B / 2
    if st < 12.9 or st > 119.4: continue
    ch = CH[int(st / BAR) % 4]
    n = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 24, ch[3], ch[2] + 12][k % 8]
    mput(pl(note(n)), st, .3)
    beat = k // 2
    if k % 2 == 0: mput(KK, st, .55 if beat % 2 == 0 else .35)
    if k % 4 == 2: mput(CL, st, .5)
    mput(HH, st + B / 4, .7)
    if k % 2 == 0: mput(lp_fast(saw(note(ch[0] - 12), t_(B)), 380) * env(int(B * SR), .005, .25, .2), st, .4)
# intro: soft clock pulse
for k in range(int(11.6 / .6)): mput(click(3200, .18), .4 + k * .6)
music = reverb(music, 2.2, .3, 3)
musicEnv = np.interp(tt, [0, 1, 11.7, 12.0, 12.6, 119.4, 120.5, 124], [0, .7, .7, .1, 1, 1, .8, 0])
music *= musicEnv

# ------------------------------------------------------------- subtle sfx
FX = []
fx = lambda s, at, g=1: FX.append((s, at, g))
fx(whoosh(1.0, 200, 3000, .25), .1)
for i in range(3): fx(pop(420 + i * 60, .2), .3 + i * .25)
fx(whoosh(.6, 300, 4000, .25), 5.8)
fx(click(1200, .4), 11.75); fx(blip(180, .5, .25), 11.8)                  # screen switches off
fx(boom(.7, 2.5), 12.94); fx(chime(.25), 12.98)                              # brand reveal
for i in range(6): fx(pop(500 + i * 50, .15), 13.5 + i * .25)
fx(whoosh(.6, 300, 6000, .3), 16.0); fx(whoosh(.8, 200, 5000, .3), 19.0)
for t0 in [25.72, 26.78, 28.11, 29.24, 30.24, 31.21, 32.29, 32.9]:
    fx(whoosh(.35, 600, 7000, .18), t0 - .2); fx(pop(650, .2), t0 + .55)
fx(chime(.18), 34.5); fx(whoosh(.5, 200, 8000, .35), 37.2)
for t0 in [38.75, 41.0, 42.55, 44.16, 45.1]: fx(paper(.3, .25), t0); fx(pop(560, .18), t0 + .1)
fx(chime(.25), 46.0); fx(whoosh(.5, 200, 8000, .35), 49.2)
fx(chime(.15), 52.3); fx(chime(.15), 54.1)
for i in range(4): fx(click(4200, .2), 53.9 + i * .15)
fx(boing(.15) if 'boing' in dir() else pop(300, .2), 59.0)
fx(whoosh(.5, 200, 8000, .35), 61.4)
fx(whoosh(1.2, 300, 6000, .3), 66.3)
for i in range(6): fx(pop(600 + i * 70, .15), 66.5 + i * .15)
fx(whoosh(.5, 200, 8000, .35), 72.0)
fx(whoosh(.8, 200, 1500, .25), 75.4); fx(boom(.4, 1.2), 76.0)
for t0 in [76.99, 79.7, 82.46]: fx(chime(.2), t0); fx(pop(700, .2), t0)
fx(whoosh(.5, 200, 8000, .35), 84.4)
for i in range(6): fx(pop(500 + i * 40, .15), 86.6 + i * .7); fx(click(2600, .2), 86.6 + i * .7)
fx(chime(.2), 93.6); fx(whoosh(.5, 200, 8000, .35), 95.7)
fx(whoosh(.8, 300, 4000, .3), 96.1)
for i in range(6): fx(blip(880, .25, .12), 100.9 + i * .35)                   # phone ringing
fx(chime(.25), 102.9)
fx(pop(500, .3), 107.6); fx(pop(600, .3), 108.4); fx(boom(.3, .8), 109.9); fx(click(1200, .5), 109.95)
fx(whoosh(.6, 200, 6000, .35), 111.8)
fx(riser(1.4, .25), 113.3); fx(boom(.8, 2.5), 114.78); fx(chime(.3), 114.8)
for i in range(3): fx(pop(560 + i * 80, .2), 117.4 + i * .3)
for i in range(4): fx(whoosh(.6, 500 + i * 300, 5000, .15), 118.6 + i * .08)
fx(boom(1.0, 3.5), 119.5); fx(chime(.35), 119.5)
fxbus = np.zeros(N)
for s, at, g in FX:
    i = int(at * SR); s = s[: N - i]; fxbus[i:i + len(s)] += s * g
fxbus = reverb(fxbus, 1.4, .2, 9)

# ------------------------------------------------------------- voice-over (natural, lightly polished)
def readwav(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
VO = {1: 1.0, 2: 12.6, 3: 24.2, 4: 38.0, 5: 50.0, 6: 62.1, 7: 72.7, 8: 85.2, 9: 96.5, 10: 105.0, 11: 112.5}
vo = np.zeros(N)
for k, at in VO.items():
    v = readwav(f'vo/v{k}.wav'); i = int(at * SR); vo[i:i + len(v)] += v[: N - i]
X = np.fft.rfft(vo); f = np.fft.rfftfreq(N, 1 / SR)
X *= 1 + .35 / (1 + (f / 200) ** 2) + .18 * np.exp(-((f - 3200) / 1400) ** 2)   # warmth + presence
X *= 1 / (1 + (80 / np.maximum(f, 1)) ** 4)
vo = np.fft.irfft(X, N)
# gentle compression (soft knee, slow-ish envelope)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(int(.03 * SR)) / int(.03 * SR), 'same')) + 1e-6
thr = np.percentile(envv[envv > 1e-3], 80); gain = np.where(envv > thr, (thr / envv) ** .45, 1.0)
vo = vo * gain
vo = reverb(vo, .5, .06, 11)
vo /= np.abs(vo).max() + 1e-9
act = np.convolve((np.abs(vo) > .02).astype(float), np.ones(int(.3 * SR)) / int(.3 * SR), 'same')
duck = 1 - .55 * np.clip(act * 3, 0, 1)
bed = music / (np.abs(music).max() + 1e-9)
fxn = fxbus / (np.abs(fxbus).max() + 1e-9)
mixL = vo * 1.0 + bed * duck * .16 + fxn * .22
mixR = vo * 1.0 + np.roll(bed, 300) * duck * .16 + fxn * .22
fade = np.interp(tt, [0, DUR - .8, DUR], [1, 1, 0]); mixL *= fade; mixR *= fade
peak = max(np.abs(mixL).max(), np.abs(mixR).max()); mixL, mixR = mixL / peak * .9, mixR / peak * .9
out = (np.stack([mixL, mixR], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'mix.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
