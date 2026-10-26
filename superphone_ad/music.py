"""Synthesises the electronic music bed + SFX for the ad (23 s, 120 BPM, A minor).
Writes audio/music.wav (stereo, 48 kHz). Event times mirror the timeline in scene.html."""
import numpy as np
import wave

SR = 48000
DUR = 23.0
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
rng = np.random.default_rng(3)

# timeline (keep in sync with T in scene.html)
S2, CONV, FLASH, S4, LOGO, END_FX = 4.5, 10.0, 11.5, 16.0, 16.85, 22.0
MUSIC_END = END_FX  # beat stops on the final hit

L = np.zeros(N)
Rch = np.zeros(N)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    Rch[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * np.exp(-t / d)
    return e


def lowpass(x, cutoff):
    """one-pole lowpass; cutoff may be scalar or per-sample array"""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = (t * freq * (1 + d)) % 1
        out += 2 * ph - 1
    return out / 3


def note(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------- drums ----------
def kick():
    n = int(.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / .035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, .001, .16) * 1.1 + rng.standard_normal(n) * env(n, .0005, .004) * .3


def hat(open_=False):
    n = int((.25 if open_ else .06) * SR)
    x = rng.standard_normal(n)
    x = x - lowpass(x, 7000)
    return x * env(n, .0005, .08 if open_ else .018)


def clap():
    n = int(.3 * SR)
    x = rng.standard_normal(n)
    x = lowpass(x - lowpass(x, 900), 5000)
    e = np.zeros(n)
    for o in (0, .011, .022):
        i = int(o * SR)
        e[i:] += env(n - i, .0005, .012)
    e += env(n, .02, .09) * .6
    return x * e


K, HH, OH, CL = kick(), hat(), hat(True), clap()

beats = int(MUSIC_END / BEAT)
for b in range(beats):
    t = b * BEAT
    # intro (scene 1): kick from beat 2, no claps; pre-price: drums drop out for the riser
    in_drop = CONV + .2 <= t < FLASH
    in_s4_drop = S4 - .1 <= t < S4 + 2 * BEAT
    if not in_drop and not in_s4_drop and t >= BEAT * 1:
        add(K, t, .9)
    if t >= S2 - .01 and not in_drop and not in_s4_drop and b % 2 == 1:
        add(CL, t, .45, .1)
    for h in range(2):
        th = t + h * BEAT / 2
        if not in_drop and th >= .5:
            add(HH if h == 0 else OH, th, .14 if h == 0 else .10, -.3 if h else .3)
    if t >= S2 and not in_drop:
        add(HH, t + BEAT / 4, .07, .4)
        add(HH, t + 3 * BEAT / 4, .07, -.4)

# ---------- harmony: Am - F - C - G, one chord per bar ----------
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
bar = 4 * BEAT
nbars = int(np.ceil(MUSIC_END / bar))

# sidechain pump curve
pump = np.ones(N)
for b in range(int(MUSIC_END / BEAT)):
    i = int(b * BEAT * SR)
    n = int(BEAT * SR)
    seg = 1 - .75 * np.exp(-np.arange(n) / SR / .09)
    pump[i:i + n] = np.minimum(pump[i:i + n], seg[: max(0, min(n, N - i))])

pad = np.zeros(N)
bass = np.zeros(N)
arp = np.zeros(N)
for k in range(nbars):
    root, chord = prog[k % 4]
    t0 = k * bar
    n = int(bar * SR)
    i = int(t0 * SR)
    if i >= N:
        break
    n = min(n, N - i)
    # pad
    p = sum(saw(note(m + 12), n, .006) for m in chord) / 3
    p = p * np.minimum(1, np.arange(n) / SR / .25) * np.minimum(1, (n - np.arange(n)) / SR / .1)
    pad[i:i + n] += p
    # bass: 8th notes with octave bounce
    for e8 in range(8):
        ts = t0 + e8 * BEAT / 2
        j = int(ts * SR)
        m = int(BEAT / 2 * SR * .9)
        if j + m > N:
            break
        f = note(root - 12 + (12 if e8 % 2 else 0))
        bs = saw(f, m, .004) * env(m, .003, .18)
        bass[j:j + m] += bs
    # pluck arpeggio 16ths (from scene 2 on)
    if t0 >= S2 - .01:
        pattern = chord + [chord[0] + 12, chord[1] + 12, chord[2], chord[1], chord[0] + 12]
        for s16 in range(16):
            ts = t0 + s16 * BEAT / 4
            j = int(ts * SR)
            m = int(.18 * SR)
            if j + m > N:
                break
            f = note(pattern[s16 % len(pattern)] + 12)
            tt = np.arange(m) / SR
            pl = (np.sign(np.sin(2 * np.pi * f * tt)) * .35 + np.sin(2 * np.pi * f * tt)) * env(m, .002, .06)
            arp[j:j + m] += pl * (.9 if s16 % 4 == 0 else .6)

t_axis = np.arange(N) / SR
# filter sweep: scene 1 opens up, drop section around price darker
cut_pad = np.interp(t_axis, [0, S2, CONV, FLASH, FLASH + .2, S4, END_FX, DUR], [500, 1800, 2200, 600, 2600, 2200, 3000, 3000])
pad = lowpass(pad, cut_pad)
bass = lowpass(bass, np.interp(t_axis, [0, 1.0, S2, DUR], [200, 400, 900, 900]))
arp = lowpass(arp, 4200)

# mute music sections
gate = np.ones(N)
gate[t_axis >= MUSIC_END] = 0
drop = (t_axis >= CONV + .2) & (t_axis < FLASH)
bass_gate = gate.copy(); bass_gate[drop] = 0
arp_gate = gate.copy(); arp_gate[drop] = 0
bass_gate[(t_axis >= S4 - .1) & (t_axis < S4 + 2 * BEAT)] = 0

mus = pad * .22 * pump * gate + bass * .38 * pump * bass_gate + arp * .09 * pump * arp_gate
# simple stereo widening: delayed arp to the right
d = int(.1875 * SR)
L += mus + np.concatenate([np.zeros(d), arp[:-d] * .04 * arp_gate[:-d]])
Rch += mus + np.concatenate([np.zeros(d * 2), arp[:-2 * d] * .04 * arp_gate[:-2 * d]])

# ---------- SFX ----------
def whoosh(dur, up=True, f0=300, f1=6000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    tt = np.arange(n) / n
    cut = f0 + (f1 - f0) * (tt ** 2 if up else (1 - tt) ** 2)
    y = lowpass(x, cut) - lowpass(x, cut * .25)
    e = (tt ** 2) if up else np.exp(-tt * 5)
    return y * e


def riser(dur):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = 200 * 2 ** (tt / dur * 3)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .4 + saw(1, n) * 0
    return (s + whoosh(dur) * 1.5) * (tt / dur) ** 1.5


def impact():
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    f = 38 + 90 * np.exp(-tt / .08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .001, .7)
    noise = lowpass(rng.standard_normal(n), 3000) * env(n, .001, .25) * .6
    return boom * 1.2 + noise


def shimmer(dur=2.0):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = np.zeros(n)
    for m, dl in zip([81, 84, 88, 93, 96], [0, .04, .08, .12, .16]):
        i = int(dl * SR)
        s[i:] += np.sin(2 * np.pi * note(m) * tt[: n - i]) * env(n - i, .002, .6)
    return s * .25


def pop(f=900):
    n = int(.12 * SR)
    tt = np.arange(n) / SR
    fr = f * (1 + 1.5 * np.exp(-tt / .015))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, .001, .04)


def big_chord(dur=1.8):
    n = int(dur * SR)
    root, chord = 57, [57, 60, 64, 69, 72]
    s = sum(saw(note(m), n, .008) for m in chord) / len(chord)
    s = lowpass(s, np.linspace(5000, 800, n)) * env(n, .003, .55)
    tt = np.arange(n) / SR
    sub = np.sin(2 * np.pi * note(33) * tt) * env(n, .002, .5)
    return s * 1.1 + sub * .7


add(whoosh(.7), S2 - .6, .55)                        # transition 1 -> 2
add(shimmer(1.2), S2 + .55, .5, .2)                  # light-writing of the brand
add(riser(FLASH - CONV), CONV, .5)                   # build-up into price
add(whoosh(1.2, False, 6000, 200), FLASH, .5)
add(impact(), FLASH, .9)                             # gold flash
add(shimmer(2.2), FLASH + .05, .8, -.2)
add(pop(1100), 14.0, .5)                             # "every two days" badge
add(whoosh(.6), S4 - .5, .5)                         # transition 3 -> 4
for i in range(5):                                   # orbit icon pops (scene 1 & 4)
    add(pop(800 + i * 120), .9 + i * .12, .22, (i - 2) / 3)
    add(pop(800 + i * 120), S4 + .15 + i * .12, .18, (i - 2) / 3)
add(shimmer(1.5), LOGO, .55)
for i in range(4):                                   # end-card list items
    add(pop(700 + i * 150), 18.3 + i * .38, .25, .3 if i % 2 else -.3)
add(whoosh(.5), END_FX - .5, .45)
add(big_chord(1.8), END_FX, .55)                     # final hit, then music stops
add(impact()[: int(1 * SR)], END_FX, .5)
add(shimmer(1.0), END_FX, .5)

# master: fade-in, soft limit
fade = np.minimum(1, t_axis / .3) * np.minimum(1, (DUR - t_axis) / .25)
st = np.stack([L, Rch], 1) * fade[:, None]
st = np.tanh(st * 1.2) / np.tanh(1.2)
st = st / np.max(np.abs(st)) * .89
pcm = (st * 32767).astype('<i2')
with wave.open('audio/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok')
