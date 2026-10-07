"""Soundtrack for «الدولار الخارق»: synthesized cinematic-electronic score,
timed sound effects and the processed Arabic voice-over, mixed to 48 kHz stereo.
Usage: python3 audio.py out.wav"""
import sys, wave, subprocess
import numpy as np

SR = 48000
DUR = 64.0
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

# ------------------------------------------------------------- music
music = np.zeros(N)
def mput(s, at, g=1):
    i = int(at * SR); j = min(N, i + len(s))
    if j > i: music[i:j] += s[: j - i] * g
def pl(f, d=.2, bright=2600, dec=.09):
    seg = t_(d); s = saw(f, seg) * .6 + np.sin(2 * np.pi * f * seg) * .5
    return lp_fast(s, bright) * env(len(seg), .003, dec)
def kick():
    seg = t_(.4); f = 45 + 110 * np.exp(-seg * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .001, .16)
def hat(): seg = t_(.05); return hp_fast(rng.standard_normal(len(seg)), 7000) * env(len(seg), .001, .015) * .2
def snare(): seg = t_(.25); return bp_fast(rng.standard_normal(len(seg)), 900, 6000) * env(len(seg), .001, .06) * .4
KK, HH, SN = kick(), hat(), snare()
tt = np.arange(N) / SR
# (1) 0–4.95 serious economic news bed: Am pulse + ticking clock
for k in range(int(4.95 / .3)):
    st = k * .3; mput(lp_fast(saw(note(45), t_(.28)), 300) * env(int(.28 * SR), .005, .15), st, .5)
    mput(click(3500, .25), st)
pad = sum(saw(note(n) * (1 + d), tt) for n in (57, 60, 64) for d in (-.004, .004)) / 6
pad = lp_fast(pad, 1400) * np.interp(tt, [0, 1, 4.9, 4.95], [0, .18, .22, 0])
music += pad
# (2) 5.9–10.2 quirky pizzicato walk (comedy)
SCALE = [60, 62, 64, 65, 67, 69, 71, 72]
for k in range(int((10.2 - 5.9) / .25)):
    st = 5.9 + k * .25; n = SCALE[[0, 2, 4, 2, 5, 4, 2, 0][k % 8]]
    mput(pl(note(n), .18, 3000, .05), st, .5); mput(pl(note(n - 24), .2, 600, .08), st, .45 if k % 2 == 0 else 0)
# (3) 10.4–18.4 chase: accelerating tempo
st = 10.45; k = 0
while st < 18.35:
    bpm = 110 if st < 12.7 else lerp(130, 150, P(st, 12.7, 14.7)) if st < 14.7 else lerp(160, 190, P(st, 14.7, 15.6))
    beat = 60 / bpm / 2
    n = [57, 60, 64, 67, 64, 60, 69, 67][k % 8] + (5 if st > 14.7 and (k // 8) % 2 else 0)
    mput(pl(note(n), beat * .9, 3200, .06), st, .45)
    if k % 2 == 0: mput(KK, st, .8)
    if k % 4 == 2: mput(SN, st, .7)
    mput(HH, st + beat / 2, .8)
    mput(lp_fast(saw(note(n - 24), t_(beat)), 500) * env(int(beat * SR), .004, beat * .6), st, .35)
    st += beat; k += 1
# (4) 18.4–21.4 tension under the calculator
mput(riser(3.0, .25), 18.4)
for k in range(int(3.0 / .25)): mput(KK, 18.6 + k * .5, .5) if k % 2 == 0 else None
# (5) 27.2–36.1 light thinking groove (bassoon-ish)
for k in range(int((36.0 - 27.2) / .3)):
    st = 27.2 + k * .3; n = [48, 55, 52, 55, 50, 57, 53, 57][k % 8]
    mput(lp_fast(saw(note(n), t_(.26)) + saw(note(n) * 1.005, t_(.26)), 700) * env(int(.26 * SR), .01, .12), st, .35)
    if k % 2: mput(pl(note(n + 24), .15, 2400, .04), st, .2)
# (6) 36.3–42.2 split: calm pad on top, uneasy pulse
padb = sum(saw(note(n) * (1 + d), t_(5.9)) for n in (50, 57, 62, 65) for d in (-.004, .004)) / 8
mput(lp_fast(padb, 1100) * np.minimum(1, t_(5.9) / .6) * np.minimum(1, (5.9 - t_(5.9)) / .5), 36.3, .3)
for k in range(int(5.8 / .25)): mput(lp_fast(saw(note(38), t_(.2)), 250) * env(int(.2 * SR), .004, .1), 36.4 + k * .25, .35)
# (7) 42.3–51.3 lounge "elevator music"
CH = [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71], [57, 60, 64, 67]]
for b in range(5):
    st = 42.5 + b * 1.8; ch = CH[b % 4]
    for n in ch: mput(lp_fast(np.sin(2 * np.pi * note(n) * t_(1.7)) + .2 * saw(note(n), t_(1.7)), 2200) * env(int(1.7 * SR), .02, .9), st, .1)
    for k in range(6): mput(pl(note(ch[[0, 2, 1, 3, 2, 1][k]] + 12), .25, 3500, .12), st + k * .3, .18)
    mput(lp_fast(np.sin(2 * np.pi * note(ch[0] - 24) * t_(.5)), 300) * env(int(.5 * SR), .01, .3), st, .5)
    mput(lp_fast(np.sin(2 * np.pi * note(ch[2] - 24) * t_(.5)), 300) * env(int(.5 * SR), .01, .3), st + .9, .5)
music[int(51.3 * SR):int(51.8 * SR)] *= np.linspace(1, 0, int(.5 * SR))
music[int(51.8 * SR):int(51.9 * SR)] = 0
# (8) 51.9–64 elegant ending pad + piano-ish notes
pad2 = sum(np.sin(2 * np.pi * note(n) * tt) for n in (50, 57, 62, 65, 69)) / 5
music += lp_fast(pad2, 2000) * np.interp(tt, [0, 51.9, 53.5, 61.6, 62.0, 63.6, 64], [0, 0, .16, .16, .12, .1, 0])
for k, (n, at) in enumerate([(74, 52.4), (72, 53.4), (69, 54.4), (67, 55.4), (74, 57.0), (76, 58.6)]):
    seg = t_(1.6); mput((np.sin(2 * np.pi * note(n) * seg) + .3 * np.sin(4 * np.pi * note(n) * seg)) * env(len(seg), .004, .5), at, .22)
music = reverb(music, 1.6, .25, 3)

# ------------------------------------------------------------- sfx timeline
FX = []
fx = lambda s, at, g=1, pan=0.: FX.append((s, at, g, pan))
fx(whoosh(.8, 300, 3000, .2), .1)
fx(boom(1.0, 2.0), 5.2); fx(slide(400, 1800, .45, .35), 5.2); fx(click(1500, .8), 5.2)
for i in range(6): fx(steps(6, .07, .15, 1400), 5.75 + i * .4, 1, (i % 2) - .5)
fx(boing(.6), 6.0)
fx(whoosh(.5, 200, 7000, .5), 10.0)
fx(steps(10, .28, .35), 10.6); fx(steps(14, .13, .35), 12.7); fx(steps(30, .07, .35), 14.7)
fx(slide(500, 2200, .7, .3), 14.7); fx(whoosh(1.2, 200, 8000, .5), 14.8)
fx(clack(.6), 15.55); fx(click(3000, .5), 15.6)        # gauge glass cracks
fx(whoosh(.4, 200, 8000, .4), 18.2)
for k in range(11): fx(beep(2400 if k % 4 else 1800, .07, .35), 18.7 + k * .25)
for k, at in enumerate([18.7, 19.2, 19.7, 20.2, 20.7]): fx(slide(500 + k * 120, 900 + k * 160, .2, .2), at)
for k in range(10): fx(beep(3000 + k * 200, .04, .3), 20.9 + k * .05)
fx(siren(1.2, .45), 21.4); fx(boom(.4, .8), 21.4)
fx(boing(.5), 22.6); fx(whoosh(1.5, 300, 2000, .2), 22.7)
fx(trombone(.5), 26.65)
fx(whoosh(.4, 300, 6000, .4), 26.9)
for w in (27.7, 28.7, 29.7, 30.6):
    fx(paper(.35, .35), w); fx(ding(.25), w + .15); fx(slide(700, 1300, .15, .15), w + .15)
fx(pop(500, .4), 31.4)
fx(whoosh(.5, 300, 6000, .45), 36.2); fx(whoosh(.5, 300, 6000, .45), 36.4, 1, .4)
fx(paper(.5, .25), 36.9)
for k in range(12): fx(lp_fast(saw(70, t_(.18)), 600) * env(int(.18 * SR), .005, .08), 37.6 + k * .37, .25, .3)   # tiny car putters
fx(chime(.25), 38.25)
fx(whoosh(.5, 300, 6000, .4), 42.2)
fx(steps(14, .32, .3, 700), 42.6)
fx(whoosh(1.2, 150, 9000, .55), 43.2); fx(ding(.6), 44.4)
fx(steps(10, .45, .25, 650), 47.2 - 4.5)
fx(pop(700, .4), 47.4); fx(boing(.3), 47.45)
fx(scratch(.8), 51.25)
fx(whoosh(.8, 300, 3000, .2), 51.8)
fx(pop(600, .35), 57.3)
fx(slide(1800, 300, .5, .3), 59.0); fx(boing(.5), 59.45); fx(pop(800, .35), 59.5)
fx(rimshot(.8), 62.0)
fxbus = np.zeros(N)
for s, at, g, pan in FX:
    i = int(at * SR); s = s[: N - i]; fxbus[i:i + len(s)] += s * g
fxbus = reverb(fxbus, 1.2, .18, 9)

# ------------------------------------------------------------- voices
def readwav(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
def polish(v, low=.9):
    n = len(v); X = np.fft.rfft(v); f = np.fft.rfftfreq(n, 1 / SR)
    X *= 1 + low / (1 + (f / 180) ** 2) + .25 * np.exp(-((f - 3500) / 1500) ** 2)
    X *= 1 / (1 + (70 / np.maximum(f, 1)) ** 4)
    v = np.fft.irfft(X, n); v = np.tanh(v * 2.2) / 2.2
    return v / (np.abs(v).max() + 1e-9)
def robot(v):  # calculator voice: ring-mod + bit crush + band-limit
    tt2 = np.arange(len(v)) / SR
    v = v * (.6 + .4 * np.sin(2 * np.pi * 55 * tt2))
    v = np.round(v * 24) / 24
    v = bp_fast(v, 300, 5000)
    return v / (np.abs(v).max() + 1e-9)
VO = [('n1', .6, 0), ('n2', 5.95, 0), ('n3', 10.8, 0), ('calc', 22.9, 1), ('cit', 31.45, 0), ('n4', 38.3, 0), ('n5', 47.6, 0), ('n6', 52.3, 0), ('n7', 57.0, 0)]
vo = np.zeros(N)
for name, at, rob in VO:
    v = readwav(f'vo/{name}.wav'); v = robot(polish(v, .4)) * .9 if rob else polish(v, .9 if name.startswith('n') else .5)
    i = int(at * SR); vo[i:i + len(v)] += v[: N - i]
vo = reverb(vo, .8, .1, 11)
act = np.convolve((np.abs(vo) > .02).astype(float), np.ones(int(.25 * SR)) / int(.25 * SR), 'same')
duck = 1 - .5 * np.clip(act * 3, 0, 1)
mix = music * duck * .6 + fxbus * .55 + vo * .95
mixR = np.roll(music, 300) * duck * .6 + fxbus * .55 + vo * .95
fade = np.interp(tt, [0, DUR - .6, DUR], [1, 1, 0]); mix *= fade; mixR *= fade
peak = max(np.abs(mix).max(), np.abs(mixR).max())
mix, mixR = np.tanh(mix / peak * 1.3) * .89, np.tanh(mixR / peak * 1.3) * .89
out = (np.stack([mix, mixR], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'mix.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
