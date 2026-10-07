"""Soundtrack for «مطبعة ألوان»: synthesized cinematic-electronic score,
timed sound effects and the processed Arabic voice-over, mixed to 48 kHz stereo.
Usage: python3 audio.py out.wav"""
import sys, wave, subprocess
import numpy as np

SR = 48000
WARP = 1.25  # everything is scheduled on the 45.6 s story clock, then stretched
DUR = 45.6 * WARP
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


# ------------------------------------------------------------- music
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
# Dm – Bb – F – C
CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]]

# 1) dark drone 0–38 (mysterious, swells)
tt = t_(DUR)
drone = sum(saw(note(n) * (1 + d), tt) for n in (38, 45) for d in (-.003, .003))
drone = lp_fast(drone, 380) * .10
sw = np.interp(tt, np.array([0, 4, 10, 10.8, 38.2, 40.3, 44.85, 45.6]) * WARP, [.25, .55, .8, 1, 1, .8, 1, 0])
L += drone * sw; R += drone * sw * .97

# 2) chord pads from 5s, brighter after 11.5
pad = np.zeros(N)
for b in range(int(5 * WARP / BAR), int(45 * WARP / BAR) + 1):
    st = b * BAR; ch = CHORDS[b % 4]; d = BAR + .6
    seg = t_(d)
    s = sum(saw(note(n) * (1 + dt), seg) for n in ch for dt in (-.004, .004)) / 8
    e = np.minimum(1, seg / .6) * np.minimum(1, (d - seg) / .6)
    i = int(st * SR); j = min(N, i + len(seg))
    pad[i:j] += (s * e)[: j - i]
pad_lo = lp_fast(pad, 900); pad_hi = lp_fast(pad, 3200)
mixp = np.interp(tt, np.array([0, 10.7, 10.9, 45.6]) * WARP, [0, 0, 1, 1])
pad = pad_lo * (1 - mixp) + pad_hi * mixp
pg = np.interp(tt, np.array([0, 5, 8.1, 8.2, 8.35, 9.8, 10.8, 34.5, 37.3, 38.2, 40.3, 44.85, 45.6]) * WARP, [0, 0, .5, 0, .6, .8, 1, 1, 1.2, .9, .8, 1, 0])
pad = reverb(pad * pg * .22, 3, .35, 3)
L += pad; R += np.roll(pad, 240)

# 3) arp plucks 5–8.1 and 22–36.7
def pluck(f, d=.22):
    seg = t_(d); s = saw(f, seg) * .6 + np.sin(2 * np.pi * f * seg) * .5
    return lp_fast(s, 2600) * env(len(seg), .003, .09)
arp = np.zeros(N)
for k in range(int(DUR / (BEAT / 2))):
    st = k * BEAT / 2
    s0 = st / WARP
    if not (5.0 <= s0 < 8.1 or 10.8 <= s0 < 44.8):
        continue
    ch = CHORDS[int(st / BAR) % 4]
    n = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3], ch[2] + 24][k % 8]
    s = pluck(note(n)); i = int(st * SR); j = min(N, i + len(s)); arp[i:j] += s[: j - i]
ag = np.interp(tt, np.array([5, 8, 10.8, 15, 20.4, 24, 30, 34.5, 37.3, 40.3, 44.8]) * WARP, [.15, .45, .25, .4, .3, .45, .6, .35, .6, .45, .6])
arp = reverb(arp * ag * .35, 1.6, .4, 5)
L += arp; R += np.roll(arp, 600)

# 4) drums
def kick():
    seg = t_(.5); f = 45 + 110 * np.exp(-seg * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(seg), .001, .18) * 1.0
def clap():
    seg = t_(.3); n = bp_fast(rng.standard_normal(len(seg)), 900, 5000)
    e = env(len(seg), .001, .06) + .5 * np.concatenate([np.zeros(int(.012 * SR)), env(len(seg) - int(.012 * SR), .001, .05)])
    return n * e * .35
def hat(o=False):
    seg = t_(.25 if o else .06); n = hp_fast(rng.standard_normal(len(seg)), 7000)
    return n * env(len(seg), .001, .08 if o else .018) * .18
K_, CL, HT = kick(), clap(), hat()
drums = np.zeros(N)
def put(s, at, g=1):
    i = int(at * SR); j = min(N, i + len(s)); drums[i:j] += s[: j - i] * g
def zone(st, segs): return any(x * WARP <= st < y * WARP for x, y in segs)
HALF = [(10.8, 15.2), (20.4, 22.1)]
FULL = [(15.2, 20.4), (22.1, 34.5), (37.3, 38.2), (40.3, 44.8)]
LIGHT = [(38.2, 40.3)]
for k in range(int(DUR / (BEAT / 4))):
    st = k * BEAT / 4; beat = k // 4; sub = k % 4
    if zone(st, HALF):
        if sub == 0 and beat % 2 == 0: put(K_, st, .9)
        if sub == 0 and beat % 4 == 2: put(CL, st, .7)
        if sub == 2: put(HT, st, .6)
    elif zone(st, FULL):
        if sub == 0: put(K_, st, 1)
        if sub == 0 and beat % 2 == 1: put(CL, st)
        put(HT, st, 1 if sub == 2 else .45)
    elif zone(st, LIGHT):
        if sub == 0 and beat % 2 == 0: put(K_, st, .7)
        if sub == 2: put(HT, st, .4)
L += drums * .8; R += drums * .8

# 5) sub bass 11.5–36.6 (eighths, sidechained)
bass = np.zeros(N)
for k in range(int(DUR / (BEAT / 2))):
    st = k * BEAT / 2
    s0 = st / WARP
    if not (10.8 <= s0 < 44.8) or (34.5 <= s0 < 37.3) or (38.2 <= s0 < 39.2): continue
    f = note(CHORDS[int(st / BAR) % 4][0] - 12)
    seg = t_(BEAT / 2); s = np.tanh(2 * (saw(f, seg) * .5 + np.sin(2 * np.pi * f * seg)))
    s = lp_fast(s, 420) * env(len(seg), .004, .2, .3) * (np.minimum(1, seg / .06))
    i = int(st * SR); j = min(N, i + len(s)); bass[i:j] += s[: j - i]
L += bass * .2; R += bass * .2

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

FX = []
fx = lambda s, at, g=1, pan=0.: FX.append((s, at * WARP, g, pan))
_riser, _hum = riser, hum
riser = lambda d, g=1: _riser(d * WARP, g)
hum = lambda d, g=1: _hum(d * WARP, g)
# S1 idea
fx(blip(220, .9, .35), .25); fx(blip(330, 1.0, .55), 1.0); fx(blip(440, .8, .3), 1.45, 1, .2)
fx(whoosh(1.4, 300, 4000, .25), 2.6)
for i in range(10): fx(click(3000 + i * 300, .12), 2.75 + i * .09, 1, (i % 3 - 1) * .5)
# S2 grey designs
for i in range(8): fx(pop(380 + i * 40, .25), 5.5 + i * .17, 1, (i % 2) * .6 - .3)
fx(riser(2.0, .18), 6.2); fx(click(1800, .8), 8.13); fx(boom(.9, 2.2), 8.3); fx(whoosh(.6, 200, 2500, .35), 8.22)
# S3 ink + machine
fx(whoosh(.9, 800, 3000, .12), 9.8); fx(drip(.55), 10.35); fx(riser(1.2, .35), 9.6)
fx(drip(.9), 10.78); fx(boom(1.0, 3), 10.8); fx(splashs(.6), 10.8)
for i in range(4): fx(whoosh(1.0, 300 + i * 200, 6000, .25), 10.8 + i * .24, 1, [-.6, .6, -.3, .3][i])
fx(chime(.12), 11.3); fx(whoosh(1.0, 150, 5000, .55), 11.75)
for k in range(7): fx(clack(.35 if k % 2 == 0 else .2), 12.2 + k * .2, 1, .3 * np.sin(k))
fx(paper(.5, .35), 12.2)
for i in range(9):
    fx([pop(700, .45), whoosh(.4, 600, 6000, .35), paper(.3, .45)][i % 3], 13.28 + i * .16, 1, [-.5, .5, .2, -.3, .6, -.6, 0, .4, -.4][i])
    fx(click(2600, .25), 13.25 + i * .16)
fx(riser(.5, .35), 14.6); fx(whoosh(.5, 200, 8000, .6), 14.95)
# S4 receipts / cutter
fx(paper(.5, .5), 15.15); fx(scan(.55, .22), 15.38)
for i in range(8): fx(paper(.18, .3), 16.18 + i * .06, 1, (i % 3 - 1) * .5)
for i in range(9): fx(paper(.2, .25), 16.95 + i * .07, 1, (i % 3 - 1) * .4)
fx(chime(.14), 17.0)
fx(whoosh(.5, 150, 3000, .45), 17.85); fx(boom(.35, .6), 18.3)
for i in range(9): fx(whoosh(.3, 800, 6000, .12), 18.2 + i * .05, 1, (i % 3 - 1) * .5)
for c in (18.85, 19.2, 19.55):
    fx(clack(1.0), c - .02); fx(boom(.35, .5), c); fx(hp_fast(whoosh(.25, 3000, 9000, .5), 2500), c - .07)
    for k in range(3): fx(pop(500 + k * 120, .3), c + .05 + k * .05, 1, (k - 1) * .6)
fx(whoosh(.5, 200, 8000, .55), 20.15)
# S5 stamp
fx(metal(.35), 20.5); fx(whoosh(1.0, 300, 3000, .2), 20.45)
fx(whoosh(.45, 500, 5000, .3), 21.35); fx(paper(.45, .5), 21.45)
fx(whoosh(.25, 300, 3000, .4), 21.9)
fx(boom(1.0, 1.4), 22.12); fx(clack(1.4), 22.11); fx(click(900, 1.0), 22.12)   # stamp impact
fx(whoosh(.35, 300, 4000, .3), 22.32)
for i in range(3): fx(pop(420 + i * 90, .45), 23.1 + i * .1, 1, [.6, 0, -.6][i])
fx(whoosh(.5, 200, 8000, .55), 23.95)
# S6 neon shop-front
fx(whoosh(.7, 200, 4000, .4), 24.1)
for i in range(4): fx(riser(.6, .12), 24.75 + i * .17, 1, (i - 1.5) * .3)
fx(hum(3.4, .05), 25.9)
for i in range(4):
    for j in range(4): fx(click(1500 + j * 400, .35), 25.95 + i * .15 + j * .07, 1, (i - 1.5) * .3)
fx(chime(.18), 26.4); fx(whoosh(.5, 400, 7000, .35), 27.7); fx(blip(520, .6, .3), 27.8)
for j in range(4): fx(click(1200, .4), 28.4 + j * .06, 1, .6)
fx(boom(.4, .6), 28.55); fx(chime(.15), 28.55)
fx(whoosh(.5, 200, 8000, .55), 29.4)
# S7 product rush + extras
for i in range(4): fx(whoosh(.5, 300, 6000, .35), 29.7 + i * .3, 1, [-.6, .6, -.3, .3][i])
for i in range(8):
    fx(whoosh(.28, 600, 8000, .3), 31.08 + i * .43, 1, .4)
    fx(pop(560 + (i % 4) * 70, .35), 31.18 + i * .43, 1, 0)
fx(whoosh(.4, 200, 8000, .5), 34.45)
# S8 freeze, character, CMYK, logo
fx(click(1500, .9), 34.55); fx(boom(.4, .8), 34.6)
fx(metal(.15), 34.9); fx(whoosh(.4, 400, 3000, .25), 35.35)
fx(chime(.3), 35.75); fx(blip(660, .6, .35), 35.75)
fx(riser(1.2, .5), 36.1)
for i in range(4): fx(whoosh(.5, 300, 6000, .25), 36.2 + i * .28, 1, [-.6, .6, -.3, .3][i])
fx(boom(1.0, 2.5), 37.25); fx(chime(.3), 37.27)
# S9 map + end card
fx(whoosh(.5, 300, 6000, .4), 38.0); fx(blip(660, .6, .3), 38.6)
fx(whoosh(.8, 150, 9000, .5), 38.88); fx(boom(.35, .8), 39.38); fx(click(1200, .8), 39.4); fx(chime(.25), 39.42)
fx(pop(520, .35), 39.6); fx(whoosh(.6, 200, 6000, .45), 40.2)
fx(boom(.7, 2), 40.38); fx(chime(.25), 40.4)
fx(pop(600, .3), 41.0); fx(pop(480, .3), 41.42); fx(pop(720, .35), 41.85)
for i in range(4): fx(whoosh(.7, 500 + i * 300, 5000, .2), 42.55 + i * .06, 1, [-.7, .7, -.35, .35][i])
fx(chime(.22), 43.4); fx(riser(1.3, .3), 43.55)
fx(boom(1.25, 3.5), 44.85); fx(chime(.35), 44.85)
fxbus_L = np.zeros(N); fxbus_R = np.zeros(N)
for s, at, g, pan in FX:
    i = int(at * SR); s = s[: N - i]
    fxbus_L[i:i + len(s)] += s * g * np.cos((pan + 1) * np.pi / 4) * 1.41
    fxbus_R[i:i + len(s)] += s * g * np.sin((pan + 1) * np.pi / 4) * 1.41
fxbus_L = reverb(fxbus_L, 1.8, .22, 9); fxbus_R = reverb(fxbus_R, 1.8, .22, 10)

# ------------------------------------------------------------- voice-over
VO = [(k, at * WARP) for k, at in [(1, .7), (2, 5.0), (3, 10.85), (4, 15.35), (5, 20.55), (6, 24.3), (7, 29.75), (8, 34.8), (9, 40.05)]]
def readwav(p):
    with wave.open(p) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    return a
vo = np.zeros(N)
for k, at in VO:
    v = readwav(f'vo/l{k}.wav')
    i = int(at * SR); vo[i:i + len(v)] += v[: N - i]
# deepen & polish: low-shelf warmth, presence, gentle compression, short room
X = np.fft.rfft(vo); f = np.fft.rfftfreq(N, 1 / SR)
X *= 1 + .9 / (1 + (f / 180) ** 2) + .25 * np.exp(-((f - 3500) / 1500) ** 2)
X *= 1 / (1 + (70 / np.maximum(f, 1)) ** 4)
vo = np.fft.irfft(X, N)
vo = np.tanh(vo * 2.2) / 2.2
vo = reverb(vo, .9, .12, 11)
vo /= np.abs(vo).max() + 1e-9

# ducking envelope for music under VO
act = np.convolve((np.abs(vo) > .02).astype(float), np.ones(int(.25 * SR)) / int(.25 * SR), 'same')
duck = 1 - .45 * np.clip(act * 3, 0, 1)

music_L, music_R = L * duck, R * duck
mL = music_L * .55 + fxbus_L * .5 + vo * .95
mR = music_R * .55 + fxbus_R * .5 + vo * .95
# end fade
fade = np.interp(np.arange(N) / SR, [0, 45.0 * WARP, DUR], [1, 1, 0])
mL *= fade; mR *= fade
peak = max(np.abs(mL).max(), np.abs(mR).max())
mL, mR = np.tanh(mL / peak * 1.3) * .89, np.tanh(mR / peak * 1.3) * .89
out = (np.stack([mL, mR], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'mix.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
