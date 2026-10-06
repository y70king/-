"""Sound design for the «مطبعة ألوان» ad: synthesized electronic score + SFX + Iraqi VO mix.
usage: python3 audio.py <vo_wav_dir> <out.wav>
The VO wavs (l1..l6.wav, mono 48k, silence-trimmed) are produced from vo/*.mp3 by build.sh.
"""
import sys
import numpy as np
from scipy import signal

SR = 48000
DUR = 35.0
N = int(SR * DUR)
rng = np.random.default_rng(7)


def T(sec):
    return np.arange(int(sec * SR)) / SR


def place(buf, x, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf):
        return
    x = x[: len(buf) - i]
    if buf.ndim == 2 and x.ndim == 1:
        x = np.stack([x, x], 1)
    buf[i:i + len(x)] += x * gain


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def sweep_lp(x, f0, f1):
    """time-varying one-pole lowpass (cutoff glides exponentially f0->f1)."""
    n = len(x)
    fc = f0 * (f1 / f0) ** (np.arange(n) / n)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty(n)
    s = 0.0
    for i in range(n):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def env_exp(sec, decay, attack=0.002):
    t = T(sec)
    e = np.exp(-t / decay)
    a = np.clip(t / attack, 0, 1)
    return e * a


def saw(freq, t, detune=0.0):
    ph = (freq * (1 + detune)) * t + rng.random()
    return 2 * (ph % 1) - 1


def reverb(x, sec=1.6, wet=0.25, damp=5000):
    ir = noise(sec) * np.exp(-T(sec) / (sec / 5))
    ir = lp(ir, damp)
    ir /= np.sqrt(np.sum(ir ** 2))
    out = np.zeros((len(x) + len(ir) - 1, 2))
    for c in range(2):
        irc = np.roll(ir, c * 113)
        src = x[:, c] if x.ndim == 2 else x
        out[:, c] = signal.fftconvolve(src, irc)
    dry = np.zeros_like(out)
    dry[: len(x)] = x if x.ndim == 2 else np.stack([x, x], 1)
    return (dry * (1 - wet) + out * wet)[: len(x)]


# ------------------------------------------------------------------ instruments
def kick(gain=1.0):
    t = T(0.45)
    f = 45 + 120 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.16)
    x += 0.4 * hp(noise(0.45), 3000) * np.exp(-t / 0.004)
    return np.tanh(x * 1.6) * gain


def clap():
    t = T(0.3)
    e = np.zeros_like(t)
    for d in (0, 0.011, 0.022):
        e += np.where(t >= d, np.exp(-(t - d) / 0.008), 0)
    e += 0.6 * np.exp(-t / 0.09)
    return bp(noise(0.3), 900, 5000) * e * 0.55


def hat(open_=False):
    sec = 0.25 if open_ else 0.06
    return hp(noise(sec), 7000) * env_exp(sec, 0.07 if open_ else 0.014) * (0.22 if open_ else 0.16)


def snare():
    t = T(0.25)
    return (bp(noise(0.25), 1200, 8000) * np.exp(-t / 0.06) * 0.5 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.4)


def supersaw(freqs, sec, cutoff=3500, decay=0.35):
    t = T(sec)
    x = np.zeros_like(t)
    for f in freqs:
        for d in (-0.012, -0.006, 0, 0.006, 0.012):
            x += saw(f, t, d)
    x = lp(x / (len(freqs) * 5), cutoff)
    e = np.exp(-t / decay) * np.clip(t / 0.005, 0, 1)
    return x * e


def pluck(f, sec=0.35):
    t = T(sec)
    x = lp(saw(f, t) + 0.5 * saw(f * 2, t, 0.003), 2500 + 3000 * 0) * np.exp(-t / 0.12)
    return x * 0.5


def bass(f, sec):
    t = T(sec)
    x = lp(saw(f, t) + saw(f, t, 0.004), 420)
    e = np.clip(t / 0.004, 0, 1) * np.clip((sec - t) / 0.02, 0, 1)
    return np.tanh(2 * x * e) * 0.5


def pad(freqs, sec):
    t = T(sec)
    x = np.zeros_like(t)
    for f in freqs:
        for d in (-0.008, 0, 0.008):
            x += np.sin(2 * np.pi * f * (1 + d) * t + rng.random() * 6) + 0.3 * saw(f, t, d)
    x = lp(x / (len(freqs) * 3), 1800)
    e = np.clip(t / 0.6, 0, 1) * np.clip((sec - t) / 0.8, 0, 1)
    return x * e


# ------------------------------------------------------------------ sfx
def pop(f0=900, f1=280, sec=0.09, g=0.5):
    t = T(sec)
    f = f1 + (f0 - f1) * np.exp(-t / (sec / 4))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (sec / 3)) * g


def whoosh(sec=0.6, f0=300, f1=6000, g=0.5):
    x = sweep_lp(noise(sec), f0, f1)
    x = hp(x, 150)
    t = T(sec)
    e = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 2
    x = x * e
    return x / (np.abs(x).max() + 1e-9) * g


def riser(sec, g=0.5):
    t = T(sec)
    x = sweep_lp(noise(sec), 200, 12000) * (t / sec) ** 2
    f = 200 * (8 ** (t / sec))
    x = x / (np.abs(x).max() + 1e-9) + 0.35 * np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / sec) ** 1.5
    return x * g


def impact(g=1.0, sec=2.2, sub=48):
    t = T(sec)
    f = sub + 80 * np.exp(-t / 0.06)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    crash = hp(noise(sec), 2500) * np.exp(-t / 0.5) * 0.35
    snap = bp(noise(sec), 500, 4000) * np.exp(-t / 0.03) * 0.8
    return np.tanh((boom * 1.4 + crash + snap) * 1.2) * g


def splat(g=0.5):
    t = T(0.35)
    x = lp(noise(0.35), 1800) * np.exp(-t / 0.06)
    x += 0.5 * np.sin(2 * np.pi * (120 + 300 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.05)
    return x / (np.abs(x).max() + 1e-9) * g


def boing(f0=220, f1=520, sec=0.35, g=0.35):
    t = T(sec)
    f = f0 + (f1 - f0) * (1 - np.exp(-t / 0.08)) + 18 * np.sin(2 * np.pi * 22 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.14) * g


def shimmer(sec=1.0, g=0.25, base=1800):
    t = T(sec)
    x = np.zeros_like(t)
    for k in range(9):
        f = base * (1 + k * 0.37) + rng.random() * 200
        x += np.sin(2 * np.pi * f * t + rng.random() * 6) * (0.5 + 0.5 * np.sin(2 * np.pi * (6 + k) * t))
    e = np.sin(np.pi * t / sec)
    return x / 9 * e * g


def machine_chunk(g=0.45):
    t = T(0.25)
    x = bp(noise(0.25), 200, 1500) * np.exp(-t / 0.04) + 0.6 * np.sin(2 * np.pi * 80 * t) * np.exp(-t / 0.06)
    clk = hp(noise(0.25), 4000) * np.exp(-((t - 0.07) % 1) / 0.006) * (t > 0.07)
    return (x + clk * 0.5) * g


def tick(f=2400, g=0.18):
    t = T(0.04)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) * g


# ------------------------------------------------------------------ score
BPM = 128
B = 60 / BPM
# A minor: Am F C G
CH = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]]
ROOT = [110.0, 87.31, 130.81, 98.0]

music = np.zeros((N, 2))
side = np.ones(N)  # sidechain gain curve


def duck_at(t0, depth=0.65, rel=0.18):
    i = int(t0 * SR)
    n = int(rel * 1.6 * SR)
    if i >= N:
        return
    n = min(n, N - i)
    tt = np.arange(n) / SR
    side[i:i + n] = np.minimum(side[i:i + n], 1 - depth * np.exp(-tt / (rel / 2.2)))


def groove(t0, t1, energy=1.0, chords=True, kick_on=True):
    nbeats = int(round((t1 - t0) / B))
    for b in range(nbeats):
        tb = t0 + b * B
        bar = b // 4
        ci = (bar // 1) % 4 if True else 0
        if kick_on:
            place(music, kick(0.95), tb)
            duck_at(tb)
        if b % 2 == 1:
            place(music, clap(), tb, 0.8 * energy)
        place(music, hat(True), tb + B / 2, 0.9)
        for s in (0.25, 0.75):
            place(music, hat(), tb + B * s, 0.8)
        place(music, bass(ROOT[ci], B / 2 * 0.9), tb + B / 2, 0.9)
        if chords and b % 4 in (0, 2):
            st = supersaw([f * 2 for f in CH[ci]], B * 1.5, cutoff=2200 + 2500 * energy, decay=0.28)
            st2 = np.stack([st, np.roll(st, 300)], 1)
            place(music, st2, tb, 0.55 * energy)
        if b % 4 == 3 and chords:
            place(music, supersaw([f * 4 for f in CH[ci]], B * 0.6, cutoff=5000, decay=0.12), tb + B / 2, 0.25 * energy)


# intro 0–5: plucked arpeggio, light hats
for k in range(int(5.0 / (B / 2))):
    tb = 0.15 + k * B / 2
    ci = (k // 8) % 4
    f = CH[ci][[0, 1, 2, 1][k % 4]] * 2
    p = pluck(f)
    place(music, np.stack([p * (0.6 + 0.4 * (k % 2)), p * (1 - 0.4 * (k % 2))], 1), tb, 0.42)
    if k % 2:
        place(music, hat(), tb, 0.6)
place(music, pad([220, 261.63, 329.63], 5.2), 0.0, 0.22)
# build 5–8.5: snare roll + riser
place(music, riser(3.45, 0.55), 5.05)
rt = 5.6
step = B / 2
while rt < 8.45:
    place(music, snare(), rt, 0.25 + 0.5 * (rt - 5.6) / 2.9)
    rt += step
    if rt > 6.9:
        step = B / 4
    if rt > 7.8:
        step = B / 8
place(music, pad([220, 261.63, 329.63, 440], 3.6), 5.0, 0.18)
# drop 1: 8.5–16.75
groove(8.5, 16.75, 1.0)
# section 2: 17.25–23.8 (lighter, playful plucks + groove without big chords for first half)
groove(17.25, 20.25, 0.6, chords=False)
for k in range(int(6.5 / (B / 2))):
    tb = 17.25 + k * B / 2
    ci = (k // 8) % 4
    place(music, pluck(CH[ci][[0, 2, 1, 2][k % 4]] * 4, 0.25), tb, 0.22)
groove(20.25, 23.0, 0.9)
place(music, riser(1.0, 0.5), 22.95)
for k in range(8):
    place(music, snare(), 23.0 + k * B / 8 * 1.6, 0.3 + k * 0.06)
# drop 2: 24.0–29.0
groove(24.0, 29.0, 1.15)
# hard stop at 29.0, then tension pad with soft heartbeat until the finale
music[int(29.0 * SR):] = 0
side[int(29.0 * SR):] = 1
place(music, pad([110, 220, 329.63, 440], 4.7), 29.05, 0.28)
for k in range(8):
    place(music, kick(0.35), 29.6 + k * B, 1.0)
place(music, riser(1.2, 0.35), 32.35)
# finale chord after the boom
fin = supersaw([220, 261.63, 329.63, 440, 523.25], 1.6, cutoff=4500, decay=0.6)
place(music, np.stack([fin, np.roll(fin, 500)], 1), 33.55, 0.7)

music *= side[:, None]
music = reverb(music, 1.2, 0.15)

# ------------------------------------------------------------------ sfx timeline (mirrors anim.js)
sfx = np.zeros((N, 2))


def S(x, t0, g=1.0, pan=0.0):
    if x.ndim == 1:
        x = np.stack([x * (1 - max(pan, 0)), x * (1 + min(pan, 0))], 1)
    place(sfx, x, t0, g)


# scene 1
S(pop(700, 250, 0.1), 0.42, 0.6)
S(pop(1100, 400), 0.3, 0.5); S(pop(1200, 420), 0.62, 0.5)
for i in range(6):
    S(pop(1300 + i * 120, 500, 0.1), 0.95 + i * 0.32, 0.55, pan=-0.6 + i * 0.24)
S(boing(300, 650), 2.75, 0.6, 0.4)
for i in range(4):
    S(pop(1000, 380), 2.8 + i * 0.27, 0.35)
# scene 2
S(whoosh(0.35, 400, 3000, 0.5), 4.95)
S(whoosh(0.55, 500, 9000, 0.7), 5.35)
S(shimmer(1.2, 0.35, 1500), 5.95)
S(impact(0.35, 1.0, 70), 6.0)
S(boing(200, 700, 0.5, 0.5), 7.25)
S(whoosh(0.7, 300, 12000, 0.8), 7.9)
S(impact(1.0), 8.5)
S(splat(0.6), 8.72, pan=0.5); S(splat(0.6), 8.82, pan=-0.5); S(splat(0.5), 8.97)
S(whoosh(0.3, 800, 6000, 0.4), 8.85)
# scene 3
S(whoosh(0.5, 120, 2000, 0.6), 9.95)
S(impact(0.45, 0.8, 60), 10.5)
PT = [10.75 + i * 0.86 for i in range(7)]
for i, p in enumerate(PT):
    S(whoosh(0.3, 1500, 8000, 0.25), p - 0.4, pan=-0.5)
    S(machine_chunk(0.55), p - 0.02)
    S(splat(0.4), p + 0.08)
    S(pop(900 + i * 90, 350, 0.08), p + 0.14, 0.4)
    S(whoosh(0.32, 600, 5000, 0.35), p + 0.84, pan=0.4 - i * 0.12)
    S(tick(1800), p + 1.15, 1.0)
S(boing(500, 900, 0.25, 0.2), 10.2 + 0.4)  # bag bounce flavour
for t0 in (10.45, 12.35, 14.35):
    S(pop(1400, 600, 0.09), t0, 0.5)
S(whoosh(0.5, 300, 10000, 0.7), 16.72)
# scene 4
for i in range(4):
    S(boing(260 + i * 60, 520 + i * 80, 0.3, 0.3), 17.4 + i * 0.12, pan=[-0.6, 0.6, -0.6, 0.6][i])
JT = [18.25 + i * 0.6 for i in range(4)]
for i, j in enumerate(JT):
    S(boing(240 + i * 50, 800, 0.35, 0.4), j, pan=[-0.4, 0.4, -0.4, 0.4][i])
    S(splat(0.75), j + 0.33)
S(shimmer(1.0, 0.3, 2400), 20.75)
S(shimmer(0.8, 0.25, 3000), 21.2)
S(pop(800, 300, 0.12, 0.5), 21.3); S(pop(850, 300, 0.12, 0.5), 21.58)
S(impact(0.8, 1.4, 55), 22.0)
for i in range(4):
    S(pop(1500 + i * 150, 600), 22.05 + i * 0.07, 0.35, pan=[-0.7, -0.3, 0.3, 0.7][i])
S(whoosh(0.4, 500, 12000, 0.6), 23.75)
S(impact(0.5, 0.9, 65), 24.02)
# scene 5
for k in range(6):
    S(whoosh(0.4, 400 + k * 150, 6000, 0.25 + k * 0.04), 24.1 + k * 0.42, pan=(-1) ** k * 0.6)
S(riser(0.8, 0.35), 25.75)
S(impact(1.0), 26.55)
S(splat(0.6), 26.6, pan=-0.5); S(splat(0.6), 26.66, pan=0.5)
for t0 in (26.85, 27.45, 28.05):
    S(pop(1200, 500, 0.09), t0, 0.45)
# scene 6
S(impact(0.85, 1.5, 40), 29.0)
S(shimmer(0.6, 0.2, 3500), 29.05)
S(whoosh(0.5, 600, 7000, 0.3), 29.5)
S(whoosh(0.35, 1000, 8000, 0.3), 30.45)
S(pop(900, 300, 0.1, 0.5), 30.75)
for i in range(11):
    S(tick(2200 + i * 60, 0.22), 30.8 + i * 0.07)
S(impact(1.2, 2.4, 38), 33.55)
S(splat(0.8), 33.57, pan=-0.6); S(splat(0.8), 33.62, pan=0.6); S(splat(0.6), 33.7)
S(shimmer(1.0, 0.3, 2800), 34.0)
sfx = reverb(sfx, 0.9, 0.12)

# ------------------------------------------------------------------ VO
vo = np.zeros(N)
VO_AT = [0.12, 6.0, 10.45, 18.4, 24.2, 29.9]
vodir = sys.argv[1]
import wave
for k, t0 in enumerate(VO_AT, 1):
    with wave.open(f'{vodir}/l{k}.wav') as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    x = hp(x, 90)
    x = x / (np.abs(x).max() + 1e-9)
    # warmth + presence, then gentle compression so every syllable is clear
    x = x + 0.2 * lp(x, 250) + 0.25 * bp(x, 2000, 5000)
    x = np.tanh(x * 2.2) / np.tanh(2.2)
    place(vo, x, t0)
# smooth speech envelope (fast attack, slow release) for ducking the bed
lvl = np.abs(vo)
lvl = np.convolve(lvl, np.ones(int(0.03 * SR)) / int(0.03 * SR), 'same')
gate = (lvl > 0.02).astype(float)
k = int(0.35 * SR)
gate = np.convolve(gate, np.ones(k) / k, 'same')
vo_env = np.clip(gate * 3, 0, 1)
music *= (1 - 0.76 * vo_env)[:, None]   # bed drops ~15 dB under speech
sfx *= (1 - 0.6 * vo_env)[:, None]
vo_st = reverb(np.stack([vo, vo], 1), 0.5, 0.035)

bed = music * 0.42 + sfx * 0.4
voice = vo_st * 1.35
spk = vo_env > 0.9
def db(x): return 10 * np.log10(np.mean(x ** 2) + 1e-12)
print('voice vs bed during speech: %.1f dB' % (db(voice[spk]) - db(bed[spk])))
mix = bed + voice
fade = np.clip((DUR - T(DUR)[:N]) / 0.5, 0, 1)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1)
mix = mix / np.abs(mix).max() * 0.93
out = sys.argv[2]
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('wrote', out)
