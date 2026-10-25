// Render the film to video, frame-exact, using headless Chromium.
// usage: node tools/render.js [--scale 2] [--fps 30] [--workers 3] [--out out/film-4k.mp4] [--from 0 --to 158]
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..');
const scale = +arg('scale', 2), fps = +arg('fps', 30), workers = +arg('workers', 3);
const out = path.resolve(ROOT, arg('out', `out/film-${scale >= 2 ? '4k' : '1080p'}.mp4`));
const crf = arg('crf', scale >= 2 ? '20' : '18');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json'), 'utf8'));
const from = +arg('from', 0), to = Math.min(+arg('to', TL.total), TL.total);
const f0 = Math.round(from * fps), f1 = Math.floor(to * fps);
const tmp = path.join(path.dirname(out), '.parts'); fs.mkdirSync(tmp, { recursive: true });

function ffmpeg(args) {
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'inherit'] });
  return { p, done: new Promise((res, rej) => p.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res())) };
}

async function worker(browser, w, a, b) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.error('page error', e.message));
  await page.goto('file://' + path.join(ROOT, `index.html?render=1&scale=${scale}`));
  await page.waitForFunction(() => window.renderFrame);
  const file = path.join(tmp, `part${w}.mp4`);
  const enc = ffmpeg(['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'animation', file]);
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const b64 = await page.evaluate(async t => { await window.renderFrame(t); return document.getElementById('film').toDataURL('image/jpeg', .95).split(',')[1]; }, f / fps);
    const buf = Buffer.from(b64, 'base64');
    if (!enc.p.stdin.write(buf)) await new Promise(r => enc.p.stdin.once('drain', r));
    if ((f - a) % 150 === 0) console.log(`worker ${w}: ${f - a}/${b - a} frames, ${((Date.now() - t0) / 1000 / Math.max(1, f - a)).toFixed(2)}s/frame`);
  }
  enc.p.stdin.end(); await enc.done; await page.close();
  return file;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
  const n = f1 - f0, per = Math.ceil(n / workers);
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => worker(browser, w, f0 + w * per, Math.min(f1, f0 + (w + 1) * per))));
  await browser.close();
  fs.writeFileSync(path.join(tmp, 'list.txt'), parts.map(p => `file '${p}'`).join('\n'));
  const audio = path.join(ROOT, 'audio/soundtrack.wav');
  const args = ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt')];
  if (fs.existsSync(audio)) args.push('-ss', String(from), '-t', String(to - from), '-i', audio, '-map', '0:v', '-map', '1:a', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
  args.push('-c:v', 'copy', '-movflags', '+faststart', out);
  await ffmpeg(args).done;
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('wrote', out);
})();
