#!/usr/bin/env python3
"""أداة تجميع فيلم «وردة غيّرت عمرنا».

الأوامر:
  python3 build.py check      يتحقق من التوقيتات ويطبع الجدول الزمني
  python3 build.py prompts    يولّد prompts.md (برومبت كامل لكل لقطة)
  python3 build.py animatic   معاينة 720p للتوقيت (بطاقات ملونة بدل اللقطات الناقصة)
  python3 build.py final      الفيلم النهائي 4K / 24fps من مجلد clips/ و audio/

اللقطات: ضع ملف كل لقطة باسم رقمها داخل clips/ مثل clips/06d.mp4
(يقبل mp4/mov/webm/mkv أو صورة png/jpg تتحرك بحركة كاميرا بطيئة).
الصوت: audio/voiceover.* و audio/music.* (wav/mp3/m4a/flac) — كلاهما اختياري.
يحتاج ffmpeg مبني مع libass.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
AUDIO_EXT = (".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg")


def load():
    return json.loads((ROOT / "shots.json").read_text(encoding="utf-8"))


def timeline(data):
    t = 0.0
    for s in data["shots"]:
        yield t, s
        t += s["dur"]


def ts(sec):
    m, s = divmod(sec, 60)
    return f"{int(m):02d}:{s:05.2f}"


def ass_ts(sec):
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def check(data):
    fps = data["fps"]
    errors = []
    ids = [s["id"] for s in data["shots"]]
    if len(ids) != len(set(ids)):
        errors.append("أرقام لقطات مكررة")
    for _, s in timeline(data):
        if abs(s["dur"] * fps - round(s["dur"] * fps)) > 1e-6:
            errors.append(f"{s['id']}: المدة {s['dur']} لا تساوي عدداً صحيحاً من الإطارات")
        for name in ("BRIDE", "MOHAMMED", "FRIEND"):
            if "{%s}" % name in s["prompt"] and name not in data["outfits"][s["phase"]]:
                errors.append(f"{s['id']}: لا توجد ملابس لـ {name} في مرحلة {s['phase']}")
    total = sum(s["dur"] for s in data["shots"])
    if abs(total - data["total_seconds"]) > 1e-6:
        errors.append(f"مجموع المدد {total} ثانية بدل {data['total_seconds']}")
    return errors


def expand(data, shot):
    text = shot["prompt"]
    outfits = data["outfits"][shot["phase"]]
    for name, base in data["characters"].items():
        if name in outfits:
            text = text.replace("{%s}" % name, f"{base}, wearing {outfits[name]}")
    return text


def cmd_check(data):
    scene = None
    for start, s in timeline(data):
        if s["scene"] != scene:
            scene = s["scene"]
            print(f"\n— المشهد {scene}")
        print(f"  {s['id']}  {ts(start)} → {ts(start + s['dur'])}  ({s['dur']}ث)  {s['desc_ar']}")
    errors = check(data)
    print()
    for e in errors:
        print("خطأ:", e)
    if not errors:
        print("التوقيتات سليمة ✓")
    return 1 if errors else 0


def cmd_prompts(data):
    out = ["# برومبتات اللقطات — «%s»\n" % data["title"],
           "> ملف مولَّد تلقائياً من `shots.json` عبر `python3 build.py prompts` — لا تعدّله يدوياً.\n",
           "انسخ لكل لقطة: **Style + Prompt** في خانة الوصف، و **Negative** في خانة البرومبت السلبي "
           "(إن وجدت). اضبط الأداة على 16:9، 24fps، وأعلى دقة متاحة. استخدم صور مرجعية ثابتة "
           "للشخصيات (انظر README) لضمان ثبات الملامح.\n",
           "## Style (يُلصق مع كل لقطة)\n", "```text", data["style"], "```\n",
           "## Negative\n", "```text", data["negative"], "```\n"]
    scene = None
    for start, s in timeline(data):
        if s["scene"] != scene:
            scene = s["scene"]
            out.append(f"## المشهد {scene}\n")
        out.append(f"### {s['id']} — {ts(start)} → {ts(start + s['dur'])} ({s['dur']} ث)\n")
        out.append(f"{s['desc_ar']}\n")
        out.append(f"الملف المطلوب: `clips/{s['id']}.mp4`\n")
        out.append("```text\n" + expand(data, s) + "\n```\n")
    (ROOT / "prompts.md").write_text("\n".join(out), encoding="utf-8")
    print("تم إنشاء prompts.md")
    return 0


def find(folder, stem, exts):
    for ext in exts:
        p = ROOT / folder / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def run(args):
    print("$", " ".join(str(a) for a in args[:6]), "…")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)],
                   check=True, cwd=ROOT)


def render_shot(data, shot, w, h, out):
    fps = data["fps"]
    dur = shot["dur"]
    frames = round(dur * fps)
    norm = (f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"setsar=1,fps={fps},format=yuv420p")
    enc = ["-c:v", "libx264", "-preset", "fast", "-crf", "16", "-an", "-frames:v", frames, out]
    if src := find("clips", shot["id"], VIDEO_EXT):
        # إذا كانت اللقطة أقصر من المطلوب يُجمَّد آخر إطار بدل القطع
        run(["-i", src, "-vf", f"{norm},tpad=stop_mode=clone:stop_duration={dur}", *enc])
        return True
    if src := find("clips", shot["id"], IMAGE_EXT):
        zoom = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                f"zoompan=z='1+0.06*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'"
                f":d={frames}:s={w}x{h}:fps={fps},setsar=1,format=yuv420p")
        run(["-loop", "1", "-i", src, "-vf", zoom, *enc])
        return True
    run(["-f", "lavfi", "-i", f"color=c={shot['color']}:s={w}x{h}:r={fps}",
         "-vf", "format=yuv420p", *enc])
    return False


def placeholder_labels(data, missing, path):
    """بطاقات تعريف للّقطات غير الجاهزة (رقم اللقطة + وصفها)."""
    lines = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "",
             "[V4+ Styles]",
             "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
             "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
             "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
             "Style: Id,DejaVu Sans,44,&H00FFFFFF,&H00FFFFFF,&H80000000,&H00000000,0,0,0,0,"
             "100,100,0,0,1,2,0,7,60,60,50,-1",
             "Style: Desc,DejaVu Sans,40,&H00FFFFFF,&H00FFFFFF,&H90000000,&H00000000,0,0,0,0,"
             "100,100,0,0,1,2,0,5,160,160,0,-1", "",
             "[Events]",
             "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    for start, s in timeline(data):
        if s["id"] in missing:
            a, b = ass_ts(start), ass_ts(start + s["dur"])
            lines.append(f"Dialogue: 0,{a},{b},Id,,0,0,0,,لقطة {s['id']} · مشهد {s['scene']}")
            lines.append(f"Dialogue: 0,{a},{b},Desc,,0,0,0,,{{\\pos(960,620)}}{s['desc_ar']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def audio_inputs(total):
    vo = find("audio", "voiceover", AUDIO_EXT)
    music = find("audio", "music", AUDIO_EXT)
    args, chain = [], None
    if vo and music:
        args = ["-i", vo, "-i", music]
        chain = ("[1:a]aformat=channel_layouts=stereo,asplit=2[vo][vosc];"
                 f"[2:a]aformat=channel_layouts=stereo,volume=0.55,"
                 f"afade=t=out:st={total - 3}:d=3[mus];"
                 "[mus][vosc]sidechaincompress=threshold=0.04:ratio=6:attack=40:release=600[duck];"
                 "[duck][vo]amix=inputs=2:normalize=0[aout]")
    elif vo or music:
        args = ["-i", vo or music]
        fade = "" if vo else f",afade=t=out:st={total - 3}:d=3"
        chain = f"[1:a]aformat=channel_layouts=stereo{fade}[aout]"
    else:
        args = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        chain = "[1:a]anull[aout]"
    return args, chain


def cmd_render(data, final):
    errors = check(data)
    if errors:
        print("\n".join(errors))
        return 1
    if not shutil.which("ffmpeg"):
        print("ffmpeg غير مثبت")
        return 1
    w, h = data["resolution"] if final else (1280, 720)
    total = data["total_seconds"]
    tmp = BUILD / ("final" if final else "animatic")
    tmp.mkdir(parents=True, exist_ok=True)

    missing = []
    with open(tmp / "list.txt", "w", encoding="utf-8") as lst:
        for _, s in timeline(data):
            part = tmp / f"{s['id']}.mp4"
            if not render_shot(data, s, w, h, part):
                missing.append(s["id"])
            lst.write(f"file '{part.name}'\n")
    run(["-f", "concat", "-safe", "0", "-i", tmp / "list.txt", "-c", "copy", tmp / "joined.mp4"])

    rel = lambda p: p.relative_to(ROOT).as_posix()
    fonts = ":fontsdir=fonts" if (ROOT / "fonts").is_dir() else ""
    vf = []
    if missing:
        placeholder_labels(data, set(missing), tmp / "labels.ass")
        vf.append(f"ass={rel(tmp / 'labels.ass')}{fonts}")
    vf.append(f"ass=titles.ass{fonts}")
    if not final:
        vf.append("subtitles=voiceover.srt:force_style='FontName=DejaVu Sans,FontSize=17,"
                  "PrimaryColour=&H00C8F0FF,Outline=1,MarginV=18,Encoding=-1'" + fonts)

    a_args, a_chain = audio_inputs(total)
    out = ROOT / ("wardah-final-4k.mp4" if final else "wardah-animatic.mp4")
    v_enc = (["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high",
              "-level", "5.1", "-pix_fmt", "yuv420p"] if final else
             ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p"])
    run(["-i", tmp / "joined.mp4", *a_args,
         "-filter_complex", f"[0:v]{','.join(vf)}[vout];{a_chain}",
         "-map", "[vout]", "-map", "[aout]", *v_enc,
         "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-t", total,
         "-movflags", "+faststart", out])
    print(f"\nتم: {out.name}")
    if missing:
        print(f"لقطات ناقصة ({len(missing)}) ظهرت كبطاقات: {' '.join(missing)}")
    return 0


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    data = load()
    actions = {"check": cmd_check, "prompts": cmd_prompts,
               "animatic": lambda d: cmd_render(d, False),
               "final": lambda d: cmd_render(d, True)}
    if cmd not in actions:
        print(__doc__)
        return 1
    return actions[cmd](data)


if __name__ == "__main__":
    sys.exit(main())
