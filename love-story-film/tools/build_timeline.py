"""Build timeline.json from narration durations and word timings.

Every scene lasts lead + narration + tail, so the picture always follows the
voice. Named cues (e.g. the moment he takes her hand) are pinned to words.
"""
import json, re, subprocess

LEAD = [2.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.7, 0.6, 0.6, 0.7]
TAIL = [0.6, 1.4, 0.6, 0.8, 0.9, 1.6, 0.9, 0.7, 1.4, 7.0]

# cue name -> (scene, word prefix, occurrence, 'start'|'end')
CUES = {
    "s2_turn":     (1, "وقال", 0, "start"),
    "s2_give":     (1, "فأعطته", 0, "start"),
    "s2_photo":    (1, "تلك", 0, "start"),
    "s3_friend":   (2, "صداقة", 0, "start"),
    "s3_hide":     (2, "تخب", 0, "start"),
    "s4_meet":     (3, "ومع", 0, "start"),
    "s5_but":      (4, "لكن", 0, "start"),
    "s5_baghdad":  (4, "بغداد", 0, "start"),
    "s5_part":     (4, "وجاء", 0, "start"),
    "s6_came":     (5, "فجاء", 0, "start"),
    "s6_saw":      (5, "رأته", 0, "start"),
    "s6_hand":     (5, "وأمسك", 0, "start"),
    "s6_heart":    (5, "وكأن", 0, "start"),
    "s7_date":     (6, "السادس", 0, "start"),
    "s7_walk":     (6, "بل", 0, "start"),
    "s8_but":      (7, "لكن", 0, "start"),
    "s8_chose":    (7, "اختار", 0, "start"),
    "s9_complete": (8, "اكتملت", 0, "start"),
    "s9_turned":   (8, "وتحو", 0, "start"),
    "s10_road":    (9, "واجتازت", 0, "start"),
    "s10_today":   (9, "حتى", 0, "start"),
}

DIAC = re.compile("[ً-ْٰـ]")
def plain(s): return DIAC.sub("", s)

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "csv=p=0", path]))

lines = json.load(open("narration.json"))
scenes, t = [], 0.0
words_all = []
for i in range(len(lines)):
    words = json.load(open(f"audio/vo/{i:02d}.words.json"))
    words_all.append(words)
    speech = words[-1]["t"] + words[-1]["d"]
    d = LEAD[i] + speech + TAIL[i]
    scenes.append({"id": i + 1, "start": round(t, 3), "dur": round(d, 3),
                   "vo": round(t + LEAD[i], 3), "voLen": round(dur(f"audio/vo/{i:02d}.mp3"), 3),
                   "speechEnd": round(t + LEAD[i] + speech, 3)})
    t += d

cues = {}
for name, (si, pre, occ, edge) in CUES.items():
    hits = [w for w in words_all[si] if plain(w["w"]).startswith(plain(pre))]
    w = hits[occ]
    cues[name] = round(scenes[si]["vo"] + w["t"] + (w["d"] if edge == "end" else 0), 3)

out = {"total": round(t, 3), "scenes": scenes, "cues": cues}
json.dump(out, open("timeline.json", "w"), ensure_ascii=False, indent=1)
open("timeline.js", "w").write("window.TIMELINE = " + json.dumps(out, ensure_ascii=False) + ";\n")
print(json.dumps(out, ensure_ascii=False, indent=1))
