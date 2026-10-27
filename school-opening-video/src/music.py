"""Synthesised epic orchestral score + voiceover mix for the opening film.
Writes mix.wav (48 kHz stereo)."""
import numpy as np, subprocess
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
TL = dict(T2=12.3, T3=23.2, T4=35.2, T5=47.6, T6=64.0,
          V1=2.6, V2=12.8, V3=23.7, V4=35.8, V5=48.2, V6=64.6, HIT=72.5, END=77.0)
N = int(TL['END'] * SR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(3)

def hz(n): return 440.0 * 2 ** ((n - 69) / 12)
NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
def m(name, octv): return 12 * (octv + 1) + NOTE[name]

def add(sig, t0, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N: return
    if sig.ndim == 1: sig = np.stack([sig, sig])
    n = min(sig.shape[1], N - max(i0, 0))
    gl, gr = gain * np.sqrt(0.5 * (1 - pan)), gain * np.sqrt(0.5 * (1 + pan))
    L[i0:i0 + n] += sig[0, :n] * gl * 1.414
    R[i0:i0 + n] += sig[1, :n] * gr * 1.414

def env_adsr(n, a, r, sus=1.0):
    t = np.arange(n) / SR; d = n / SR
    e = np.minimum(1, t / max(a, 1e-3)) * sus
    e *= np.clip((d - t) / max(r, 1e-3), 0, 1)
    return e

def saw(f, n, harm_cut=7000, bright=None, ph=0.0, vib=0.0):
    t = np.arange(n) / SR
    fm = f * (1 + vib * np.sin(2 * np.pi * 5.2 * t + ph))
    phase = 2 * np.pi * np.cumsum(fm) / SR + ph
    out = np.zeros(n); K = int(min(40, harm_cut // f))
    for k in range(1, K + 1):
        amp = 1.0 / k
        if bright is not None: amp = amp * np.clip(bright * K / k - 0.0, 0, 1) if np.ndim(bright) else amp
        out += amp * np.sin(k * phase)
    return out

def lowpass(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'low', output='sos'), x)
def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'high', output='sos'), x)
def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)

# ------------------------------------------------------------- string ensemble pad
def strings(notes, t0, dur, gain=0.1, a=2.0, r=2.5, cut=2600, vib=0.004):
    n = int((dur + r) * SR); outL = np.zeros(n); outR = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        for v in range(5):
            det = (v - 2) * 0.0035 * f
            s = saw(f + det, n, harm_cut=cut * 2, ph=rng.random() * 6, vib=vib)
            if v % 2: outL += s
            else: outR += s
    e = env_adsr(n, a, r)
    sig = np.stack([lowpass(outL, cut), lowpass(outR, cut)]) * e / (len(notes) * 3)
    add(sig, t0, gain)

# ------------------------------------------------------------- brass swell (filter opens)
def brass(notes, t0, dur, gain=0.12, a=1.2, r=1.0):
    n = int((dur + r) * SR); out = np.zeros(n)
    t = np.arange(n) / SR
    for nt in notes:
        f = hz(nt)
        for v in range(3):
            out += saw(f * (1 + (v - 1) * 0.002), n, harm_cut=5000, ph=rng.random() * 6, vib=0.003)
    e = env_adsr(n, a, r)
    # time-varying brightness: blend dark & bright versions
    dark, bright = lowpass(out, 500), lowpass(out, 3200)
    k = np.clip(t / (a * 1.3), 0, 1) ** 1.5
    sig = (dark * (1 - k) + bright * k) * e / (len(notes) * 3)
    add(np.stack([sig, np.roll(sig, 240)]), t0, gain)

# ------------------------------------------------------------- choir-ish "ah" (formant-filtered saws)
def choir(notes, t0, dur, gain=0.06, a=2.5, r=3.0):
    n = int((dur + r) * SR); out = np.zeros(n)
    for nt in notes:
        for v in range(4):
            out += saw(hz(nt) * (1 + (v - 1.5) * 0.004), n, harm_cut=6000, ph=rng.random() * 6, vib=0.006)
    sig = bandpass(out, 600, 1100) * 1.2 + bandpass(out, 1000, 1400) * .8 + bandpass(out, 2400, 3000) * .3
    sig *= env_adsr(n, a, r) / (len(notes) * 4)
    add(np.stack([sig, np.roll(sig, 480)]), t0, gain)

# ------------------------------------------------------------- percussion
def impact(t0, gain=0.9, f0=75, f1=32, dec=2.2):
    n = int((dec + 2.5) * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 6)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / dec * 2.2)
    sub = np.sin(2 * np.pi * 38 * t) * np.exp(-t * 1.2) * 0.6
    noise = lowpass(rng.standard_normal(n), 1800) * np.exp(-t * 14) * 0.6
    crack = highpass(rng.standard_normal(n), 3000) * np.exp(-t * 45) * 0.25
    sig = np.tanh((body + sub + noise + crack) * 1.4)
    add(sig, t0, gain)

def timpani(t0, note, gain=0.35):
    n = int(2.0 * SR); t = np.arange(n) / SR; f = hz(note)
    sig = (np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t * 6) + .3 * np.sin(2 * np.pi * f * 1.98 * t) * np.exp(-t * 5)) * np.exp(-t * 3.2)
    sig += lowpass(rng.standard_normal(n), 900) * np.exp(-t * 30) * .5
    add(sig, t0, gain, pan=-0.15)

def roll(t0, t1, note, g0=0.05, g1=0.35):
    t = t0; i = 0
    while t < t1:
        k = (t - t0) / (t1 - t0)
        timpani(t, note, g0 + (g1 - g0) * k ** 2)
        t += 0.11 - 0.05 * k + rng.random() * 0.01; i += 1

def riser(t0, dur, gain=0.18):
    n = int(dur * SR); t = np.arange(n) / SR; k = t / dur
    noise = rng.standard_normal(n); out = np.zeros(n)
    # piecewise bandpass sweep
    seg = int(0.05 * SR)
    for s in range(0, n, seg):
        kk = s / n; c = 300 + 6000 * kk ** 2
        out[s:s + seg] = bandpass(noise[max(0, s - 2000):s + seg], c * .7, c * 1.3)[-len(out[s:s + seg]):]
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * k ** 2) / SR) * 0.15
    sig = (out * 0.8 + tone) * k ** 2.2
    add(np.stack([sig, np.roll(sig, 300)]), t0, gain)

def bell(t0, note, gain=0.08, pan=0.0):
    n = int(4.5 * SR); t = np.arange(n) / SR; f = hz(note)
    sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 1.1), (2.0, .5, 1.6), (2.76, .35, 2.2), (5.4, .2, 3.5), (8.9, .1, 5)])
    sig *= np.minimum(1, t / .003)
    add(sig, t0, gain, pan)

def shimmer(t0, notes, gain=0.05, step=0.09):
    for i, nt in enumerate(notes): bell(t0 + i * step, nt, gain, pan=((i % 5) - 2) * .3)

def pulse(t0, t1, note, bpm=100, gain=0.16):
    step = 60 / bpm / 2; t = t0; i = 0
    while t < t1:
        n = int(0.45 * SR); tt = np.arange(n) / SR; f = hz(note)
        s = lowpass(saw(f, n, 3000) + 0.6 * saw(f * 2, n, 3000), 900) * np.exp(-tt * 9) * np.minimum(1, tt / 0.004)
        acc = 1.0 if i % 4 == 0 else 0.7
        add(s, t, gain * acc, pan=0.2 if i % 2 else -0.2)
        t += step; i += 1

# ------------------------------------------------------------- the score  (D minor -> D major)
D2, A2, D3, F3, A3, D4 = m('D', 2), m('A', 2), m('D', 3), m('F', 3), m('A', 3), m('D', 4)
chord = {
    'Dm': [m('D', 2), m('A', 2), m('D', 3), m('F', 3), m('A', 3)],
    'Bb': [m('Bb', 1), m('F', 2), m('Bb', 2), m('D', 3), m('F', 3)],
    'F':  [m('F', 2), m('C', 3), m('F', 3), m('A', 3), m('C', 4)],
    'C':  [m('C', 2), m('G', 2), m('C', 3), m('E', 3), m('G', 3)],
    'Gm': [m('G', 1), m('D', 2), m('G', 2), m('Bb', 2), m('D', 3)],
    'D':  [m('D', 2), m('A', 2), m('D', 3), m('Gb', 3), m('A', 3)],
}
up = lambda c, o=12: [x + o for x in c]

# S1 — darkness, gold threads
strings([m('D', 1), m('D', 2), m('A', 2)], 0.0, 12.5, gain=0.22, a=4.0, r=2.0, cut=900)
riser(0.3, 2.0, 0.10)
impact(2.3, 0.95)
choir([m('D', 4), m('A', 4)], 3.0, 9.0, gain=0.05, a=4)
strings(up(chord['Dm']), 6.0, 6.6, gain=0.08, a=3.0, r=1.5, cut=2200)
riser(TL['T2'] - 2.2, 2.2, 0.16)
# S2 — knowledge
impact(TL['T2'], 0.55, 60, 30, 1.6)
strings(up(chord['Dm']), TL['T2'], 5.6, gain=0.13, a=0.6, r=1.5, cut=2600)
strings(up(chord['Bb']), TL['T2'] + 5.4, 5.6, gain=0.13, a=1.0, r=1.5, cut=2800)
strings([m('D', 2), m('D', 1)], TL['T2'], 5.6, gain=0.12, a=.6, r=1.5, cut=500)
strings([m('Bb', 1), m('Bb', 0)], TL['T2'] + 5.4, 5.6, gain=0.12, a=1., r=1.5, cut=500)
shimmer(TL['T2'] + .2, [m('A', 5), m('D', 6), m('F', 6), m('A', 6), m('D', 7)], 0.035, 0.12)
choir([m('F', 4), m('A', 4), m('D', 5)], TL['T2'] + 1, 9.5, gain=0.05)
riser(TL['T3'] - 2.2, 2.2, 0.16)
# S3 — the school (driving pulse)
impact(TL['T3'], 0.6, 65, 30, 1.8)
pulse(TL['T3'] + .2, TL['T3'] + 6.0, m('F', 2), gain=0.12)
pulse(TL['T3'] + 6.0, TL['T4'] - .6, m('C', 2), gain=0.13)
strings(up(chord['F']), TL['T3'], 6.0, gain=0.12, a=1.0, r=1.2, cut=3000)
strings(up(chord['C']), TL['T3'] + 6.0, 6.0, gain=0.13, a=1.0, r=1.0, cut=3200)
brass(chord['F'][1:], TL['T3'] + .5, 5.4, gain=0.09, a=2.0)
brass(chord['C'][1:], TL['T3'] + 6.2, 5.2, gain=0.10, a=2.0)
roll(TL['T4'] - 2.4, TL['T4'] - .05, m('A', 1))
riser(TL['T4'] - 2.4, 2.4, 0.2)
# S4 — the gate, "with pride" and the name
impact(TL['T4'], 0.75)
strings(up(chord['Bb']), TL['T4'], 3.6, gain=0.12, a=.4, r=.8, cut=3200)
strings(up(chord['C']), TL['V4'] + 0.0, 3.0, gain=0.11, a=1.0, r=.5, cut=3600)
choir([m('Bb', 4), m('D', 5), m('F', 5)], TL['T4'], 3.4, gain=0.05, a=1.0, r=1.0)
roll(TL['V4'] + 1.2, TL['V4'] + 2.93, m('D', 2), 0.05, 0.4)
riser(TL['V4'] + .9, 2.05, 0.2)
NAME = TL['V4'] + 2.95
impact(NAME, 1.0, 80, 30, 2.6)
shimmer(NAME + .05, [m('D', 6), m('Gb', 6), m('A', 6), m('D', 7), m('A', 6), m('D', 7)], 0.05, 0.07)
strings(up(chord['D']), NAME, TL['T5'] - NAME + 1, gain=0.15, a=.2, r=1.5, cut=4200)
strings([m('D', 1), m('D', 2)], NAME, TL['T5'] - NAME + 1, gain=0.13, a=.2, r=1.5, cut=600)
brass(chord['D'][1:], NAME, 4.5, gain=0.14, a=.25, r=2)
choir([m('D', 4), m('Gb', 4), m('A', 4), m('D', 5)], NAME, 8.5, gain=0.07, a=.5)
# S5 — the message (gentle pulse, Bb-F-C-Dm)
prog = ['Bb', 'F', 'C', 'Dm']; seg = (TL['T6'] - TL['T5']) / 4
for i, c in enumerate(prog):
    t0 = TL['T5'] + i * seg
    strings(up(chord[c]), t0, seg + .2, gain=0.11, a=1.0, r=1.2, cut=3000)
    strings(chord[c][:2], t0, seg + .2, gain=0.1, a=1.0, r=1.2, cut=500)
    pulse(t0, t0 + seg, chord[c][0] + 12, bpm=100, gain=0.08 + 0.015 * i)
for i, w in enumerate([TL['V5'] + 1.0, TL['V5'] + 4.4, TL['V5'] + 8.4]):
    shimmer(w, [m('A', 5) + 2 * i, m('D', 6) + 2 * i, m('F', 6) + 2 * i], 0.04, 0.08)
    timpani(w, m('D', 2), 0.25)
shimmer(TL['V5'] + 11.3, [m('D', 6), m('F', 6), m('A', 6), m('D', 7), m('F', 7)], 0.04, 0.1)
riser(TL['T6'] - 2.0, 2.0, 0.14)
# S6 — royal finale
impact(TL['T6'], 0.5, 60, 30, 1.5)
strings(up(chord['Bb']), TL['T6'], 3.6, gain=0.12, a=1.2, r=1, cut=3000)
strings(up(chord['C']), TL['T6'] + 3.5, TL['HIT'] - TL['T6'] - 3.5, gain=0.13, a=1.2, r=.3, cut=3400)
brass(chord['Bb'][1:], TL['T6'] + .3, 3.2, gain=0.09, a=1.6)
brass(chord['C'][1:], TL['T6'] + 3.5, TL['HIT'] - TL['T6'] - 3.6, gain=0.11, a=2.5, r=.2)
choir([m('C', 4), m('E', 4), m('G', 4)], TL['T6'] + 3.5, TL['HIT'] - TL['T6'] - 3.5, gain=0.05, a=2, r=.3)
roll(TL['HIT'] - 2.2, TL['HIT'] - .03, m('A', 1), 0.05, 0.45)
riser(TL['HIT'] - 2.4, 2.4, 0.2)
impact(TL['HIT'], 1.0, 85, 28, 3.0)
tail = TL['END'] - TL['HIT']
strings(up(chord['D']) + [m('D', 5)], TL['HIT'], tail - 1.5, gain=0.17, a=.15, r=1.5, cut=4500)
strings([m('D', 1), m('D', 2), m('A', 2)], TL['HIT'], tail - 1.5, gain=0.15, a=.15, r=1.5, cut=700)
brass(chord['D'][1:] + [m('D', 4)], TL['HIT'], tail - 2.0, gain=0.15, a=.15, r=1.8)
choir([m('D', 4), m('Gb', 4), m('A', 4), m('D', 5)], TL['HIT'], tail - 1.5, gain=0.07, a=.3, r=1.5)
shimmer(TL['HIT'] + .05, [m('D', 6), m('A', 6), m('D', 7), m('Gb', 7), m('A', 7)], 0.05, 0.06)

# ------------------------------------------------------------- reverb
def ir(sec, seed):
    g = np.random.default_rng(seed); n = int(sec * SR); t = np.arange(n) / SR
    x = g.standard_normal(n) * np.exp(-t * 6.9 / sec); x = lowpass(x, 6000)
    x[:int(.012 * SR)] = 0; return x / np.sqrt(np.sum(x ** 2))
wetL = fftconvolve(L, ir(3.2, 1))[:N]; wetR = fftconvolve(R, ir(3.2, 2))[:N]
L = L * 0.75 + wetL * 0.55; R = R * 0.75 + wetR * 0.55
music = np.stack([highpass(L, 28), highpass(R, 28)])
# bus compressor: tame the impacts so the orchestral bed sits higher
mono = 0.5 * (np.abs(music[0]) + np.abs(music[1]))
envm = lowpass(mono, 6) .clip(1e-6)
thr = np.percentile(envm, 70)
gc = np.where(envm > thr, (thr / envm) ** 0.65, 1.0)
music = music * gc

# ------------------------------------------------------------- voiceover
vo = np.zeros(N)
def load(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.float32).astype(np.float64)
for i, k in enumerate(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']):
    s = load(f'vo/s{i + 1}.wav'); i0 = int(TL[k] * SR); n = min(len(s), N - i0); vo[i0:i0 + n] += s[:n]
# voice chain: presence EQ + gentle compression + short room
vo = highpass(vo, 70) + 0.25 * bandpass(vo, 2500, 5000) + 0.15 * lowpass(vo, 180)
envv = np.sqrt(lowpass(vo ** 2, 8) .clip(0)) + 1e-6
target = np.percentile(envv[envv > 1e-3], 90)
comp = np.where(envv > target * .5, (target * .5 / envv) ** 0.4, 1.0)
vo = vo * comp
vo = vo / np.max(np.abs(vo)) * 0.85
room = fftconvolve(vo, ir(0.9, 9))[:N]
voL = vo + room * 0.08; voR = vo + np.roll(room, 200) * 0.08
# ducking
act = lowpass((np.abs(vo) > 0.02).astype(float), 3)
duck = 1 - 0.5 * np.clip(act * 3, 0, 1)
music = music / np.max(np.abs(music)) * 0.9
mixL = music[0] * duck * 0.8 + voL * 0.95
mixR = music[1] * duck * 0.8 + voR * 0.95
# fade out tail & soft limit
t = np.arange(N) / SR; fo = np.clip((TL['END'] - t) / 1.2, 0, 1); fi = np.clip(t / 0.05, 0, 1)
mix = np.stack([mixL, mixR]) * fo * fi
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix = mix / np.max(np.abs(mix)) * 0.94
pcm = (mix.T * 32767).astype(np.int16)
import wave
with wave.open('mix.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
with wave.open('music_only.wav', 'wb') as w:
    mo = (np.stack([music[0], music[1]]) * fo).T
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mo / np.max(np.abs(mo)) * .9 * 32767).astype(np.int16).tobytes())
print('ok', N / SR)
