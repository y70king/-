#!/usr/bin/env bash
# Rebuilds alwan_ad.mp4 from source: frames (Chromium canvas) + synthesized audio + Iraqi VO.
set -euo pipefail
cd "$(dirname "$0")"
WORK=${WORK:-build}
mkdir -p "$WORK/frames"
export PW=${PW:-/opt/node-tools/node_modules/playwright}
# 1) frames: 35s @ 60fps = 2100, four parallel workers
for w in 0 1 2 3; do node render.js "$WORK/frames" 60 $((w*525)) $(((w+1)*525)) & done; wait
# 2) voice-over: trim silences (regenerate mp3s with tts.py if needed)
for i in 1 2 3 4 5 6; do
  ffmpeg -v error -y -i vo/l$i.mp3 -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse" -ar 48000 -ac 1 "$WORK/l$i.wav"
done
# 3) music + sfx + vo mix
python3 audio.py "$WORK" "$WORK/mix.wav"
# 4) encode for TikTok / Reels / Facebook (1080x1920, 60fps, -14 LUFS)
ffmpeg -v error -y -framerate 60 -i "$WORK/frames/f_%05d.jpg" -i "$WORK/mix.wav" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p -r 60 \
  -c:a aac -b:a 192k -af "loudnorm=I=-14:TP=-1.0:LRA=11" -ar 48000 -movflags +faststart -shortest alwan_ad.mp4
echo "done: alwan_ad.mp4"
