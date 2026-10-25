// Core helpers: math, colour, text, particles, overlays.
// The whole film is drawn on a 1920x1080 logical canvas; the engine scales it
// to the output resolution (2x for 4K).
'use strict';

const W = 1920, H = 1080;
const TAU = Math.PI * 2;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ss = (t, a, b) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = t => Math.pow(clamp(t), 3);
const easeIO = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeBack = t => { t = clamp(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// fade in over [a,a+fi], hold, fade out over [b-fo,b]
const win = (t, a, b, fi = .5, fo = .5) => Math.min(ss(t, a, a + fi), 1 - ss(t, b - fo, b));
// deterministic pseudo random in [0,1)
const R = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 17.13) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- colour
function hex(c) {
  if (c.startsWith('rgb')) return c.replace(/[^\d.,]/g, '').split(',').slice(0, 3).map(Number);
  c = c.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function mix(a, b, t, alpha = 1) {
  const A = hex(a), B = hex(b);
  return `rgba(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))},${alpha})`;
}
function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }

const GOLD = ['#fff3c4', '#f4d27a', '#d9a441', '#a8741f'];
function goldGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD[0]); g.addColorStop(.35, GOLD[1]); g.addColorStop(.7, GOLD[2]); g.addColorStop(1, GOLD[3]);
  return g;
}

// ---------------------------------------------------------------- drawing
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function fillRect(ctx, style, x = -50, y = -50, w = W + 100, h = H + 100) { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); }
function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(.4, rgba(color, a * .35)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); }
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function heartPath(ctx, x, y, s) { // heart centred on (x,y), size s ~ half width
  ctx.beginPath();
  ctx.moveTo(x, y + s * .95);
  ctx.bezierCurveTo(x - s * 1.25, y + s * .1, x - s * 1.05, y - s * 1.0, x, y - s * .45);
  ctx.bezierCurveTo(x + s * 1.05, y - s * 1.0, x + s * 1.25, y + s * .1, x, y + s * .95);
  ctx.closePath();
}
// parametric heart, u in [0,1]
function heartPt(u, s) {
  const a = u * TAU;
  const x = 16 * Math.pow(Math.sin(a), 3);
  const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
  return [x * s / 16, y * s / 16];
}
function cam(ctx, cx, cy, z, rot = 0) { ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(z, z); ctx.translate(-cx, -cy); }

// ---------------------------------------------------------------- text
const FONT_TITLE = '"Aref Ruqaa", "Amiri", serif';
const FONT_BODY = '"Amiri", serif';

function textAR(ctx, str, x, y, o = {}) {
  const size = o.size || 60, alpha = o.alpha ?? 1;
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.font = `${o.weight || 700} ${size}px ${o.font || FONT_TITLE}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(str).width;
  const reveal = o.reveal ?? 1;
  if (reveal < 1) { // right-to-left wipe, as Arabic is read
    ctx.beginPath();
    const right = x + w / 2 + size * .3, span = w + size * .6;
    ctx.rect(right - span * easeIO(reveal) - 2, y - size * 1.2, span * easeIO(reveal) + 4, size * 2.4);
    ctx.clip();
  }
  ctx.globalAlpha = alpha;
  if (o.shadow !== false) {
    ctx.shadowColor = o.shadowColor || 'rgba(0,0,0,.55)'; ctx.shadowBlur = o.shadowBlur ?? size * .25; ctx.shadowOffsetY = size * .04;
  }
  ctx.fillStyle = o.color || goldGrad(ctx, x, y - size * .6, x + w * .1, y + size * .6);
  ctx.fillText(str, x, y);
  if (o.glow) { ctx.shadowColor = rgba('#f4d27a', .8 * o.glow); ctx.shadowBlur = size * .6; ctx.shadowOffsetY = 0; ctx.fillText(str, x, y); }
  ctx.restore();
  return w;
}
// ornamental gold rule with a small diamond in the middle
function goldRule(ctx, x, y, w, k, alpha = 1) {
  if (k <= 0 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const ww = w * easeIO(k);
  const g = ctx.createLinearGradient(x - ww / 2, 0, x + ww / 2, 0);
  g.addColorStop(0, 'rgba(244,210,122,0)'); g.addColorStop(.5, 'rgba(244,210,122,1)'); g.addColorStop(1, 'rgba(244,210,122,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - ww / 2, y); ctx.lineTo(x + ww / 2, y); ctx.stroke();
  ctx.fillStyle = '#f4d27a'; ctx.translate(x, y); ctx.rotate(Math.PI / 4); const d = 6 * easeOut(k); ctx.fillRect(-d, -d, d * 2, d * 2);
  ctx.restore();
}
// date caption: date line + rule + optional subtitle
function caption(ctx, main, sub, x, y, t, a, b, size = 64) {
  const al = win(t, a, b, .8, .8);
  if (al <= 0) return;
  const k = seg(t, a, a + 1.4);
  ctx.save();
  ctx.globalAlpha = al;
  glow(ctx, x, y + size * .3, size * 4.5, '#000000', .35);
  ctx.restore();
  textAR(ctx, main, x, y - (1 - easeOut(k)) * 18, { size, reveal: k, alpha: al, glow: .25 });
  goldRule(ctx, x, y + size * .78, size * 6.5, seg(t, a + .3, a + 1.6), al);
  if (sub) textAR(ctx, sub, x, y + size * 1.45, { size: size * .58, font: FONT_BODY, weight: 400, reveal: seg(t, a + .7, a + 2), alpha: al, color: '#fbf1dc' });
}

// ---------------------------------------------------------------- particles
function drawPetal(ctx, x, y, s, rot, flip, col = '#b3122e', alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.max(.08, Math.abs(flip)), 1); ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, mix(col, '#ff6b7f', .35)); g.addColorStop(.6, col); g.addColorStop(1, mix(col, '#3a0010', .5));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, s);
  ctx.bezierCurveTo(-s * .95, s * .35, -s * .8, -s * .85, 0, -s * .7);
  ctx.bezierCurveTo(s * .8, -s * .85, s * .95, s * .35, 0, s);
  ctx.fill();
  ctx.restore();
}
// falling petals, screen space; density n, t in seconds
function petalRain(ctx, t, n, seed = 1, o = {}) {
  const speed = o.speed || 1, alpha = o.alpha ?? 1, col = o.color || '#b3122e';
  for (let i = 0; i < n; i++) {
    const r1 = R(i, seed), r2 = R(i, seed + 1), r3 = R(i, seed + 2), r4 = R(i, seed + 3);
    const sz = 9 + r3 * 16 * (o.size || 1);
    const life = (t * speed * (40 + r2 * 50) + r1 * (H + 200));
    const y = (life % (H + 200)) - 100;
    const x = (r4 * (W + 300) - 150 + Math.sin(t * (.6 + r2) + i) * 60 - y * .25 + W) % (W + 300) - 150;
    drawPetal(ctx, x, y, sz, t * (r1 - .5) * 2 + i, Math.cos(t * (1 + r3 * 2) + i), r3 > .85 ? GOLD[1] : col, alpha * (.65 + r2 * .35));
  }
}
function sparkles(ctx, t, n, seed, o = {}) {
  const ox = o.x || 0, oy = o.y || 0, w = o.w || W, h = o.h || H, col = o.color || '#ffe9a8', a0 = o.alpha ?? 1;
  for (let i = 0; i < n; i++) {
    const x = ox + R(i, seed) * w + Math.sin(t * .3 + i) * 12;
    const y = oy + ((R(i, seed + 1) * h - t * (8 + R(i, seed + 4) * 20)) % h + h) % h;
    const tw = .5 + .5 * Math.sin(t * (1.5 + R(i, seed + 2) * 3) + i * 2);
    const r = (1 + R(i, seed + 3) * 2.5) * (o.size || 1);
    ctx.fillStyle = rgba(col, a0 * tw * .9);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (tw > .85 && r > 2.5) glow(ctx, x, y, r * 6, col, a0 * (tw - .85) * 3);
  }
}
function bokeh(ctx, t, n, seed, o = {}) {
  const cols = o.colors || ['#ffd27a', '#ffb36b', '#fff0c8'];
  for (let i = 0; i < n; i++) {
    const r = (o.rmin || 20) + R(i, seed + 2) * ((o.rmax || 70) - (o.rmin || 20));
    const x = ((o.x || 0) + R(i, seed) * (o.w || W) + t * (o.drift || 6) * (R(i, seed + 5) - .3) * 10) % ((o.w || W) + 200) - 100;
    const y = (o.y || 0) + R(i, seed + 1) * (o.h || H) + Math.sin(t * .4 + i) * 10;
    const a = (o.alpha ?? .35) * (.5 + .5 * Math.sin(t * (.5 + R(i, seed + 3)) + i));
    const c = cols[i % cols.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a * .9)); g.addColorStop(.75, rgba(c, a * .55)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- overlays
function vignette(ctx, a = .5, col = '#000000') {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function grade(ctx, col, a, mode = 'soft-light') {
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = mode; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function lightLeak(ctx, t, a = .25, col = '#ffb347') {
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const x = W * (.15 + .1 * Math.sin(t * .23)), y = H * (.1 + .05 * Math.cos(t * .31));
  glow(ctx, x, y, 900, col, a);
  glow(ctx, W * (.9 + .05 * Math.sin(t * .17)), H * .95, 700, '#ff7b5a', a * .5);
  ctx.restore();
}
function flash(ctx, a, col = '#ffffff') { if (a > 0) { ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); } }

// transition: a gust of rose petals crossing the screen right-to-left, k in [0,1]
function petalSweep(ctx, k, seed = 7, col = '#b3122e') {
  if (k <= 0 || k >= 1) return;
  const n = 140;
  for (let i = 0; i < n; i++) {
    const d = R(i, seed), lane = R(i, seed + 1), sz = 14 + R(i, seed + 2) * 30;
    const x = lerp(W + 200, -300, clamp(k * 1.6 - d * .6)) + Math.sin(i + k * 9) * 40;
    const y = lane * (H + 200) - 100 + Math.sin(k * 6 + i) * 50 - (k - .5) * 160;
    const a = Math.sin(clamp(k * 1.6 - d * .6) * Math.PI);
    drawPetal(ctx, x, y, sz, k * 8 * (R(i, seed + 3) - .5) + i, Math.cos(k * 12 + i), R(i, seed + 4) > .8 ? GOLD[1] : col, a);
  }
}
function goldFlare(ctx, k) {
  if (k <= 0 || k >= 1) return;
  const a = Math.sin(k * Math.PI);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  glow(ctx, W / 2, H / 2, 1400 * (.6 + k * .6), '#f4c56a', a * .95);
  glow(ctx, W * (.2 + k * .6), H * .45, 500, '#fff2c8', a * .8);
  // anamorphic streak
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,220,150,0)'); g.addColorStop(.5, `rgba(255,236,190,${a * .7})`); g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, H / 2 - 6 - a * 10, W, 12 + a * 20);
  ctx.restore();
}
// flowing gold lines drawn across the screen
function goldLines(ctx, k, seed = 3) {
  if (k <= 0 || k >= 1) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y0 = H * (.15 + .7 * R(i, seed)), amp = 80 + R(i, seed + 1) * 140;
    const head = clamp(k * 1.5 - i * .04), tail = clamp(k * 1.5 - .45 - i * .04);
    ctx.strokeStyle = rgba(GOLD[1], .65 * Math.sin(k * Math.PI)); ctx.lineWidth = 1.5 + R(i, seed + 2) * 3;
    ctx.beginPath();
    for (let u = tail; u <= head; u += .01) {
      const x = lerp(-100, W + 100, u), y = y0 + Math.sin(u * 6 + i) * amp;
      u === tail ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
