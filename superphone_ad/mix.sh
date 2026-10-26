#!/usr/bin/env bash
# Mix narration + music and mux with the rendered frames.
set -euo pipefail
cd "$(dirname "$0")"
# narration start times (seconds) — aligned with the scene timeline in scene.html
D1=450; D2=4700; D3=10400; D4=16700
ffmpeg -y -v error \
  -i audio/vo1.wav -i audio/vo2.wav -i audio/vo3.wav -i audio/vo4.wav -i audio/music.wav \
  -filter_complex "
    [0]adelay=${D1}|${D1}[a];[1]adelay=${D2}|${D2}[b];[2]adelay=${D3}|${D3}[c];[3]adelay=${D4}|${D4}[d];
    [a][b][c][d]amix=inputs=4:normalize=0,aformat=channel_layouts=stereo,
      highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=1.6,apad=whole_dur=23[vo];
    [vo]asplit[vo1][vo2];
    [4]volume=0.8[m];
    [m][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck];
    [duck][vo2]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:23[out]" \
  -map "[out]" -ar 48000 audio/final_mix.wav
ffmpeg -y -v error -i video_silent.mp4 -i audio/final_mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart super_phone_tiktok_ad.mp4
echo done
