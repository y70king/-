"""Soundtrack for «تيربو للتوصيل السريع»: synthesized cinematic-electronic score,
timed sound effects and the processed Arabic voice-over, mixed to 48 kHz stereo.
Usage: python3 audio.py out.wav"""
import sys, wave, subprocess
import numpy as np

SR = 48000
DUR = 89.5
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



# ------------------------------------------------------------- vehicle / UI sfx
def engine(d, f0, f1, g=1):            # scooter engine: buzzy single-cylinder rev
    seg = t_(d); f = np.geomspace(f0 * 1.9, f1 * 1.9, len(seg)) * (1 + .04 * np.sin(2 * np.pi * 23 * seg))
    s = sum(saw(f * h, seg) / h for h in (1, 2, 3)) * (1 + .3 * np.sin(2 * np.pi * f * .5 * seg))
    s = lp_fast(s, 1800) + .4 * lp_fast(rng.standard_normal(len(seg)), 300)
    return np.tanh(s * 1.5) * np.minimum(1, seg / .3) * np.minimum(1, (d - seg) / .25) * g
def passby(d=1.6, g=1):                # doppler pass of the van
    seg = t_(d); u = seg / d; f = 260 * (1 + .22 * np.tanh((.5 - u) * 6))
    s = lp_fast(sum(saw(f * h, seg) / h for h in (1, 2)), 1500) + .6 * whoosh(d, 300, 5000, 1)[:len(seg)]
    return s * np.exp(-((u - .5) / .22) ** 2) * g
def notif(g=1):                        # two-tone app notification
    out = np.zeros(int(.5 * SR))
    for i, f in enumerate((1318, 1760)):
        seg = t_(.22); s = np.sin(2 * np.pi * f * seg) * env(len(seg), .003, .09); j = int(i * .11 * SR); out[j:j + len(s)] += s
    return out * g
def tick(g=1): return click(5000, g)

# ------------------------------------------------------------- music: driving, low under the voice
music = np.zeros(N); tt = np.arange(N) / SR
def mput(s, at, g=1):
    i = int(at * SR); j = min(N, i + len(s))
    if j > i: music[i:j] += s[: j - i] * g
def kick():
    seg = t_(.35); f = 48 + 110 * np.exp(-seg * 32); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .001, .14)
def hat(): seg = t_(.04); return hp_fast(rng.standard_normal(len(seg)), 7500) * env(len(seg), .001, .012) * .2
def snare(): seg = t_(.22); return bp_fast(rng.standard_normal(len(seg)), 1000, 6000) * env(len(seg), .001, .06) * .35
KK, HH, SN = kick(), hat(), snare()
BPM = 124; B = 60 / BPM; BAR = 4 * B
CH = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]]   # Am F G E
for b in range(int(DUR / BAR) + 1):
    st = b * BAR; ch = CH[b % 4]; d = BAR + .4; seg = t_(d)
    s = sum(saw(note(n + 12) * (1 + dt), seg) for n in ch for dt in (-.004, .004)) / 8
    mput(lp_fast(s, 1400) * np.minimum(1, seg / .3) * np.minimum(1, (d - seg) / .4), st, .35)
for k in range(int(DUR / (B / 4))):
    st = k * B / 4
    if st < 2.0 or st > 87.4: continue
    sub = k % 4; beat = k // 4; ch = CH[int(st / BAR) % 4]
    if sub == 0: mput(KK, st, .8 if st > 7.5 else .45)
    if sub == 0 and beat % 2 == 1 and st > 7.5: mput(SN, st, .8)
    mput(HH, st, 1 if sub == 2 else .45)
    if sub in (0, 2, 3) and st > 7.5:   # pulsing 16th bass
        f = note(ch[0] - 12); mput(lp_fast(saw(f, t_(B / 4)), 420) * env(int(B / 4 * SR), .003, .05, .3), st, .5)
    if sub == 2 and st > 15.3:
        n = ch[[1, 2, 3, 2][beat % 4]] + 24; mput(lp_fast(saw(note(n), t_(.14)) + np.sin(2 * np.pi * note(n) * t_(.14)), 3000) * env(int(.14 * SR), .003, .05), st, .22)
music = reverb(music, 1.4, .2, 3)
music *= np.interp(tt, [0, 1.5, 2.0, 7.4, 7.6, 87.4, 88.4, 89.5], [0, .3, .8, .8, 1, 1, .6, 0])

# ------------------------------------------------------------- sfx timeline
FX = []
fx = lambda s, at, g=1: FX.append((s, at, g))
fx(engine(2.0, 40, 95, .6), 0.0)                 # engine approaches out of the black
fx(riser(1.0, .4), 1.0); fx(boom(.9, 2.2), 2.0); fx(whoosh(.8, 300, 8000, .5), 1.9)
fx(chime(.2), 2.7)
fx(passby(1.8, .9), 5.6); fx(engine(1.2, 70, 160, .35), 5.6)
fx(whoosh(.5, 200, 8000, .35), 7.5)
fx(click(1800, .6), 8.6); fx(notif(.6), 9.2); fx(boom(.35, .8), 9.2)
for i in range(18): fx(tick(.12), 10.05 + i * .25)
for t0 in [11.99, 12.82, 13.67]: fx(pop(700, .25), t0)
fx(whoosh(.6, 200, 8000, .4), 14.9)
fx(whoosh(1.4, 150, 3000, .35), 15.3)           # map rises
fx(riser(.8, .2), 17.5)
for i in range(6): fx(whoosh(.35, 800, 9000, .15), 18.27 + i * .12)
for t0 in [20.84, 21.83, 22.8, 23.98, 24.93, 26.08]:
    fx(whoosh(.5, 400, 7000, .3), t0 - .6); fx(pop(820, .3), t0); fx(chime(.08), t0)
fx(whoosh(1.2, 150, 4000, .35), 28.6)            # zoom out
fx(engine(2.2, 80, 200, .35), 32.6); fx(whoosh(1.6, 300, 7000, .3), 32.8); fx(boom(.5, 1.2), 34.5); fx(chime(.2), 34.6)
fx(whoosh(.5, 200, 8000, .35), 35.7)
for i in range(6): fx(pop(560 + i * 70, .25), 36.4 + i * .52); fx(tick(.3), 36.45 + i * .52)
for i in range(16): fx(tick(.1), 36.2 + i * .2)
for t0 in [42.03, 42.85, 43.75]: fx(boom(.3, .6), t0); fx(chime(.12), t0)
fx(whoosh(.5, 200, 8000, .35), 45.0)
for i in range(6): fx(pop(500 + i * 60, .22), 46.1 + i * .18)
fx(click(900, .5), 47.2)                          # cargo door
for i in range(6): fx(whoosh(.4, 600, 6000, .18), 48.1 + i * .28)
fx(click(900, .5), 51.1); fx(chime(.2), 51.7)
fx(passby(1.4, .7), 51.6)
fx(whoosh(.8, 200, 4000, .3), 53.4)
for i in range(12): fx(whoosh(.3, 1000, 9000, .1), 54.45 + i * .06)
fx(whoosh(1.2, 150, 4000, .3), 57.6); fx(chime(.15), 59.2)
fx(whoosh(.8, 150, 3000, .3), 60.4); fx(boom(.3, .8), 61.6); fx(notif(.35), 61.7)
fx(engine(2.0, 90, 210, .3), 63.3); fx(chime(.2), 65.3)
fx(whoosh(.6, 200, 8000, .4), 66.7); fx(boom(.8, 2.4), 67.1); fx(chime(.25), 67.15)
fx(passby(1.2, .5), 66.8)
fx(chime(.15), 72.2)
fx(whoosh(.5, 200, 8000, .35), 73.8); fx(notif(.6), 74.25)
fx(pop(600, .25), 75.0)
fx(whoosh(.6, 300, 6000, .4), 79.1); fx(engine(2.0, 90, 220, .35), 79.3)
fx(whoosh(1.2, 150, 4000, .3), 81.3)
fx(boom(.9, 2.6), 82.6); fx(chime(.3), 82.65)
for i in range(3): fx(pop(560 + i * 80, .2), 83.6 + i * .6)
fx(engine(.9, 120, 300, .55), 86.7); fx(passby(1.2, .8), 86.9)  # final launch
fx(boom(1.1, 3.0), 87.2); fx(chime(.3), 87.25)
fxbus = np.zeros(N)
for s, at, g in FX:
    i = int(at * SR); s = s[: N - i]; fxbus[i:i + len(s)] += s * g
fxbus = reverb(fxbus, 1.2, .18, 9)

# ------------------------------------------------------------- voice-over
def readwav(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
VO = {1: 3.0, 2: 8.0, 3: 15.6, 4: 28.9, 5: 36.2, 6: 45.6, 7: 53.7, 8: 60.6, 9: 67.0, 10: 74.0, 11: 82.5}
vo = np.zeros(N)
for k, at in VO.items():
    v = readwav(f'vo/t{k}.wav'); i = int(at * SR); vo[i:i + len(v)] += v[: N - i]
X = np.fft.rfft(vo); f = np.fft.rfftfreq(N, 1 / SR)
X *= 1 + .45 / (1 + (f / 200) ** 2) + .22 * np.exp(-((f - 3200) / 1400) ** 2)
X *= 1 / (1 + (80 / np.maximum(f, 1)) ** 4)
vo = np.fft.irfft(X, N)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(int(.03 * SR)) / int(.03 * SR), 'same')) + 1e-6
thr = np.percentile(envv[envv > 1e-3], 75); vo = vo * np.where(envv > thr, (thr / envv) ** .5, 1.0)
vo = reverb(vo, .5, .06, 11); vo /= np.abs(vo).max() + 1e-9
act = np.convolve((np.abs(vo) > .02).astype(float), np.ones(int(.3 * SR)) / int(.3 * SR), 'same')
duck = 1 - .55 * np.clip(act * 3, 0, 1)
bed = music / (np.abs(music).max() + 1e-9); fxn = fxbus / (np.abs(fxbus).max() + 1e-9)
mixL = vo + bed * duck * .2 + fxn * .3
mixR = vo + np.roll(bed, 300) * duck * .2 + fxn * .3
fade = np.interp(tt, [0, DUR - .7, DUR], [1, 1, 0]); mixL *= fade; mixR *= fade
peak = max(np.abs(mixL).max(), np.abs(mixR).max()); mixL, mixR = mixL / peak * .9, mixR / peak * .9
out = (np.stack([mixL, mixR], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'mix.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
