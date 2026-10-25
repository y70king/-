"""Original score (piano + strings, synthesised), sound effects and the final
mix with the narration. Music ducks under the voice.

Usage: python3 tools/audio.py   (from love-story-film/, after build_timeline.py)
Writes audio/soundtrack.wav and audio/soundtrack.m4a
"""
import json, subprocess, wave
import numpy as np

SR = 44100
TL = json.load(open("timeline.json"))
SC, CUE, TOTAL = TL["scenes"], TL["cues"], TL["total"]
N = int((TOTAL + 1) * SR)
rng = np.random.default_rng(7)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0: return
    a, b = max(0, i), min(buf.shape[1], i + len(sig))
    s = sig[a - i:b - i] * gain
    buf[0, a:b] += s * np.sqrt(0.5 * (1 - pan))
    buf[1, a:b] += s * np.sqrt(0.5 * (1 + pan))

# ------------------------------------------------------------------ instruments
def piano(f, dur, vel=1.0):
    n = int((dur + 2.2) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.00035
    for k in range(1, 11):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > SR / 2.2: break
        out += (1 / k ** 1.5) * np.exp(-t * (0.7 + 0.5 * k) * (f / 260) ** 0.3) * np.sin(2 * np.pi * fk * t + k)
    env = (1 - np.exp(-t * 400)) * np.where(t < dur, 1.0, np.exp(-(t - dur) * 6))
    ham = rng.standard_normal(n) * np.exp(-t * 120) * 0.02
    return (out * env + ham) * vel * 0.18

def strings(f, dur, vel=1.0, att=0.7, vib=0.004, bright=1.0):
    n = int((dur + 1.4) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-5, 0, 5):
        fd = f * 2 ** (d / 1200)
        v = 1 + vib * np.sin(2 * np.pi * (5.2 + d * .02) * t + d) * np.clip((t - .35) * 2, 0, 1)
        ph = 2 * np.pi * fd * np.cumsum(v) / SR
        for k in range(1, 13):
            if fd * k > SR / 2.3: break
            amp = (1 / k ** 1.15) * (0.72 ** max(0, k - 5 * bright))
            out += amp * np.sin(k * ph + k * d)
    env = np.clip(t / att, 0, 1) ** 1.6 * np.where(t < dur, 1.0, np.exp(-(t - dur) * 3.2))
    return out * env * vel * 0.05

def pluck(f, vel=1.0):
    n = int(0.6 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 14) * vel * 0.3

# ------------------------------------------------------------------ harmony
BAR = 3.2; BEAT = BAR / 4
MAJ, MIN = (0, 4, 7), (0, 3, 7)
D, A, Bm, G, Em, Fsm = (50, MAJ), (45, MAJ), (47, MIN), (43, MAJ), (40, MIN), (42, MIN)
s5, s7, s9, s10 = SC[4]["start"], SC[6]["start"], SC[8]["start"], SC[9]["start"]
def chord_at(t):
    bar = int(t // BAR)
    if t < s5 - 0.3: prog = [D, A, Bm, G]
    elif t < s7 - 0.3: prog = [Bm, G, D, A] if t < CUE["s6_hand"] else [G, A, Bm, A]
    elif t < s9: prog = [D, A, Bm, G]
    elif t < s10: prog = [G, A, D, Bm]
    else: prog = [D, G, Em, A] if t < TOTAL - 9 else [G, A, D, D]
    return prog[bar % 4]

def intensity(t):
    """0..1 overall energy curve following the story."""
    pts = [(0, .25), (15, .35), (31, .45), (46, .5), (63, .42), (76, .45), (88.5, .7), (96, .75), (111, .7),
           (123, .85), (137, 1.0), (150, .9), (TOTAL, .5)]
    xs, ys = zip(*pts); return float(np.interp(t, xs, ys))

music = np.zeros((2, N))
nbars = int(TOTAL // BAR) + 1
mel_prev = 74
for b in range(nbars):
    t0 = b * BAR
    root, q = chord_at(t0 + .01)
    I = intensity(t0)
    # piano arpeggio (eighths)
    pat = [0, 7, 12, 12 + q[1], 19, 12 + q[1], 12, 7]
    for i, iv in enumerate(pat):
        tt = t0 + i * BEAT / 2
        place(music, piano(mtof(root + iv), BEAT * .9, (.55 + .25 * I) * (1.0 if i == 0 else .75)), tt, pan=-.25 + i * .06)
    place(music, piano(mtof(root - 12), BAR, .6 + .3 * I), t0, pan=-.3)
    # piano melody: stepwise through chord tones, in the warm sections
    if I < .8 and (t0 < s5 or s7 <= t0 < s9):
        tones = sorted({root + 24 + iv + o for iv in q for o in (0, 12) if 66 <= root + 24 + iv + o <= 86})
        rhythm = [(0, 1.5), (1.5, .5), (2, 1), (3, 1)] if b % 2 == 0 else [(0, 2), (2, 2)]
        for j, (st, du) in enumerate(rhythm):
            c = min(tones, key=lambda x: abs(x - mel_prev) + (0 if x != mel_prev else 2.5) + rng.random())
            mel_prev = c
            place(music, piano(mtof(c), du * BEAT, .55 + .2 * I), t0 + st * BEAT, pan=.2)
    # string pad from the second scene on
    if t0 > 14:
        for iv in q:
            place(music, strings(mtof(root + 12 + iv), BAR, .5 + .9 * I), t0, pan=(iv - 4) * .08)
    # cello
    if t0 > 44:
        place(music, strings(mtof(root - 12), BAR, .7 + .8 * I, att=.4, bright=.6), t0, pan=-.1)
    # violin line once they meet again
    if t0 >= CUE["s6_hand"] + 0.8 or (s10 <= t0):
        top = root + 24 + q[(b % 3)] + (12 if I > .9 else 0)
        place(music, strings(mtof(top), BAR * .55, 1.6 * I, att=.35, vib=.006, bright=1.4), t0, pan=.25)
        place(music, strings(mtof(root + 24 + q[(b + 1) % 3]), BAR * .4, 1.4 * I, att=.3, vib=.006, bright=1.4), t0 + BAR * .55, pan=.25)

# violin swell right after the held breath at the bridge
th = CUE["s6_hand"] + 1.0
for m, d0, vel in ((66, 0, 1.4), (69, 1.6, 1.5), (74, 3.2, 1.7)):
    place(music, strings(mtof(m), 2.2, vel, att=1.0, vib=.007, bright=1.5), th + d0, pan=.2)

# ------------------------------------------------------------------ reverb
def reverb(x, secs=2.8, wet=.28):
    n = int(secs * SR); t = np.arange(n) / SR
    out = np.zeros_like(x)
    L = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 6.9 / secs); ir[:int(.02 * SR)] *= np.linspace(0, 1, int(.02 * SR))
        ir /= np.sqrt((ir ** 2).sum())
        out[c] = np.fft.irfft(np.fft.rfft(x[c], L) * np.fft.rfft(ir, L), L)[:x.shape[1]]
    return x * (1 - wet) + out * wet * 1.6
music = reverb(music)

# held breaths: the comic pause and the moment he takes her hand
def gate(t0, t1, fade=.08):
    t = np.arange(N) / SR
    g = np.ones(N)
    g -= np.clip((t - t0) / fade, 0, 1) * np.clip((t1 - t) / fade + 0, 0, 1)
    return np.clip(g, 0, 1)
gain = gate(CUE["s2_give"] + .35, CUE["s2_give"] + .95) * gate(CUE["s6_hand"], CUE["s6_hand"] + 1.0, .12)
tt = np.arange(N) / SR
gain *= np.clip(tt / 3.0, 0, 1) * np.clip((TOTAL - tt) / 3.5, 0, 1)
music *= gain

# ------------------------------------------------------------------ sfx
sfx = np.zeros((2, N))
def noise_sweep(dur, f0, f1, vel):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # crude moving lowpass whose window shrinks -> rising sweep
    out = np.zeros(n); acc = 0.0
    a = np.exp(-2 * np.pi * np.linspace(f0, f1, n) / SR)
    for i in range(n):
        acc = a[i] * acc + (1 - a[i]) * x[i]; out[i] = acc
    return out * np.sin(np.pi * t / dur) ** 2 * vel
for i in range(len(SC) - 1):
    place(sfx, noise_sweep(1.6, 300, 2500, .35), SC[i + 1]["start"] - .8, pan=-.3 + i * .07)
def click(vel=1):
    n = int(.05 * SR); return rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 120) * vel
def chime(f, vel=1, dur=2.5):
    n = int(dur * SR); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2 + k)) / k for k in (1, 2.76, 5.4)) * vel * .25
s2, s3, s4 = SC[1]["start"], SC[2]["start"], SC[3]["start"]
tP = CUE["s2_photo"] - .12
place(sfx, click(.6), tP); place(sfx, click(.4), tP + .06)
place(sfx, pluck(mtof(79), .9), CUE["s2_give"] + .35); place(sfx, pluck(mtof(84), .8), CUE["s2_give"] + .55)
place(sfx, chime(mtof(88), .7, 1.2), s3 + 1.25); place(sfx, chime(mtof(93), .5, 1.2), s3 + 1.38)
for tm in (3.7, 4.4, 5.1, 5.8, 7.2, 7.8): place(sfx, pluck(mtof(91), .25), s3 + tm, pan=.2)
place(sfx, chime(mtof(81), .5), s3 + 6.5)
t0 = CUE["s4_meet"] + 1.3; tk = t0
while tk < s4 + 12.6:
    place(sfx, click(.18), tk, pan=.1); tk += max(.07, .5 - (tk - t0) * .12)
def thump():
    n = int(.35 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 55 * t) * np.exp(-t * 18) * .9
for k in range(2):
    place(sfx, thump(), CUE["s6_heart"] + k * .9); place(sfx, thump() * .7, CUE["s6_heart"] + k * .9 + .22)
for c, f in (("s7_date", 86), ("s9_complete", 93)): place(sfx, chime(mtof(f), .6), CUE[c] + .3)
place(sfx, chime(mtof(91), .5), SC[8]["start"] + 3.9)
place(sfx, chime(mtof(88), .4), CUE["s10_road"] + 1.3)
sfx = reverb(sfx, 1.8, .3)

# ------------------------------------------------------------------ voice + mix
voice = np.zeros(N)
for i, s in enumerate(SC):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", f"audio/vo/{i:02d}.mp3", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"])
    v = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
    a = int(s["vo"] * SR); voice[a:a + len(v)] += v[:N - a]
# warmth: gentle low-shelf-ish boost via smoothing blend
k = int(SR * .0012); sm = np.convolve(voice, np.ones(k) / k, "same")
voice = voice + .25 * sm
env = np.abs(voice); w = int(.25 * SR)
env = np.convolve(env, np.ones(w) / w, "same")
duck = 1 - .7 * np.clip(env / (env.max() * .25 + 1e-9), 0, 1)
duck = np.convolve(duck, np.ones(int(.3 * SR)) / int(.3 * SR), "same")

def norm(x, peak): return x * (peak / (np.abs(x).max() + 1e-9))
music = norm(music, .42) * duck; sfx = norm(sfx, .35) * (.6 + .4 * duck)
voice = norm(voice, .9)
mix = music + sfx + voice[None, :] * np.array([[1.0], [1.0]])
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = norm(mix, .93)[:, :int(TOTAL * SR)]
pcm = (mix.T * 32767).astype(np.int16)
with wave.open("audio/soundtrack.wav", "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "audio/soundtrack.wav", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar", "48000", "-c:a", "aac", "-b:a", "256k", "audio/soundtrack.m4a"], check=True)
print("ok", TOTAL)
