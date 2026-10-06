/* مطبعة ألوان — motion graphics ad (1080x1920, deterministic: render(t) draws frame at time t seconds) */
'use strict';
const cv = document.getElementById('c');
let ctx = cv.getContext('2d'); // swapped temporarily by offscreen()
const W = 1080, H = 1920;
const COL = { C: '#00AEEF', M: '#EC008C', Y: '#FFE100', K: '#15151C', W: '#FFFFFF' };
const CMYK = [COL.C, COL.M, COL.Y, COL.K];
const PHONE = '07719287567';
const ADDRESS = 'بيجي – الشارع العام – عمارة وطبان';

/* ---------------------------------------------------------------- utils */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const TAU = Math.PI * 2;
const E = {
  out: x => 1 - Math.pow(1 - x, 3),
  out5: x => 1 - Math.pow(1 - x, 5),
  in: x => x * x * x,
  io: x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inBack: x => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
  elastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1),
  expo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  bounce: x => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  },
};
function rng(seed) { let s = (seed * 9301 + 49297) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
function shake(t, t0, dur, amp) {
  const p = P(t, t0, t0 + dur); if (p <= 0 || p >= 1) return [0, 0];
  const a = amp * Math.pow(1 - p, 2);
  return [Math.sin(t * 91.7) * a, Math.cos(t * 77.3) * a];
}
function rr(x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, .01), Math.max(ry, .01), rot, 0, TAU); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(r, .01), 0, TAU); }
function fillC(x, y, r, c) { circle(x, y, r); ctx.fillStyle = c; ctx.fill(); }
function glow(x, y, r, c, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function withT(x, y, s, rot, fn, sy) { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s, sy ?? s); fn(); ctx.restore(); }
/* draw fn() into a cleared full-frame layer (all helpers draw to it) and return that canvas */
const OFF = document.createElement('canvas'); OFF.width = W; OFF.height = H;
const OFFCTX = OFF.getContext('2d');
function offscreen(fn) {
  const main = ctx; ctx = OFFCTX;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  try { fn(); } finally { ctx = main; }
  return OFF;
}

/* ---------------------------------------------------------------- text */
function font(size, fam = 'Lalezar', weight = '') { return `${weight} ${size}px ${fam === 'Lalezar' ? 'Lalezar' : fam === 'Kufi' ? "'Reem Kufi'" : 'Cairo'}`; }
function txt(str, x, y, size, o = {}) {
  ctx.save();
  ctx.globalAlpha *= (o.alpha ?? 1);
  ctx.font = font(size, o.fam, o.weight ?? (o.fam === 'Cairo' ? '900' : ''));
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.direction = o.dir || 'rtl';
  if (o.stroke) { ctx.lineWidth = o.sw; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#000'; ctx.fillText(str, x, y);
  ctx.restore();
}
function measure(str, size, fam = 'Lalezar', weight) {
  ctx.save(); ctx.font = font(size, fam, weight ?? (fam === 'Cairo' ? '900' : '')); ctx.direction = 'rtl';
  const w = ctx.measureText(str).width; ctx.restore(); return w;
}
/* text with CMYK plates that converge into registration (d -> 0) */
function regText(str, x, y, size, d, o = {}) {
  const plates = [[COL.C, -1, -0.5], [COL.M, 1, -0.25], [COL.Y, 0.3, 1]];
  ctx.save();
  if (o.blend) ctx.globalCompositeOperation = o.blend;
  for (const [c, ox, oy] of plates) txt(str, x + ox * d, y + oy * d, size, { ...o, color: c, stroke: null });
  ctx.restore();
  txt(str, x, y, size, o);
}
/* extruded logo-style text */
function extrude(str, x, y, size, o = {}) {
  const depth = o.depth ?? 14;
  txt(str, x + depth, y + depth, size, { ...o, color: o.c2 || COL.C });
  txt(str, x + depth / 2, y + depth / 2, size, { ...o, color: o.c1 || COL.M });
  txt(str, x, y, size, o);
}
/* lay out words right-to-left; anim(i) returns {dy, s, a, rot} */
function wordsRTL(list, cx, y, size, o, anim) {
  const sp = size * (o.space ?? 0.26);
  const ws = list.map(w => measure(w.w, size, o.fam, o.weight));
  const total = ws.reduce((a, b) => a + b, 0) + sp * (list.length - 1);
  let xr = cx + total / 2;
  list.forEach((w, i) => {
    const cx2 = xr - ws[i] / 2;
    const an = anim ? anim(i) : {};
    if ((an.a ?? 1) > 0.001) {
      ctx.save(); ctx.translate(cx2, y + (an.dy || 0)); ctx.rotate(an.rot || 0); ctx.scale(an.s ?? 1, an.s ?? 1);
      if (an.reg) regText(w.w, 0, 0, size, an.reg, { ...o, color: w.color || o.color, alpha: an.a ?? 1 });
      else txt(w.w, 0, 0, size, { ...o, color: w.color || o.color, alpha: an.a ?? 1 });
      ctx.restore();
    }
    xr -= ws[i] + sp;
  });
  return total;
}

/* ---------------------------------------------------------------- shapes */
function blobPath(x, y, r, n, seed, wob = 0.25, t = 0) {
  const R = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.3;
    const rad = r * (1 - wob / 2 + R() * wob + Math.sin(t * 3 + i * 1.7) * wob * 0.15);
    pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
  }
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p0 = pts[i % n], p1 = pts[(i + 1) % n];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  ctx.closePath();
}
function splat(x, y, r, col, seed, p, o = {}) {
  if (p <= 0) return;
  const R = rng(seed + 7);
  const g = E.out5(clamp(p));
  ctx.save(); ctx.fillStyle = col; ctx.globalAlpha *= (o.alpha ?? 1);
  blobPath(x, y, r * g, 11, seed, 0.45); ctx.fill();
  const n = o.n ?? 12;
  for (let k = 0; k < n; k++) {
    const a = R() * TAU, d = r * (1.05 + R() * 1.3) * g, s = r * (0.07 + R() * 0.14) * (o.dropShrink ? (1 - p * 0.5) : 1);
    fillC(x + Math.cos(a) * d, y + Math.sin(a) * d, s, col);
    // streak towards the drop
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.08) * r * 0.7 * g, y + Math.sin(a - 0.08) * r * 0.7 * g);
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.lineTo(x + Math.cos(a + 0.08) * r * 0.7 * g, y + Math.sin(a + 0.08) * r * 0.7 * g); ctx.fill();
  }
  ctx.restore();
}
function star(x, y, r1, r2, n, rot, col) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1; const a = rot + (i / (n * 2)) * TAU - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
function sparkle(x, y, s, col = '#fff', a = 1) {
  if (s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s); ctx.fill();
  ctx.restore();
}
function halftone(col, spacing, rMax, t, alpha, fnR) {
  ctx.save(); ctx.fillStyle = col; ctx.globalAlpha *= alpha;
  for (let y = -spacing; y < H + spacing; y += spacing) {
    const off = ((y / spacing) % 2) * spacing / 2;
    for (let x = -spacing; x < W + spacing; x += spacing) {
      const r = fnR(x + off, y, t) * rMax;
      if (r > 0.6) { ctx.beginPath(); ctx.arc(x + off, y, r, 0, TAU); ctx.fill(); }
    }
  }
  ctx.restore();
}
function cropMarks(a, col = '#fff') {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = 3;
  const m = 70, L = 60 * a;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x - sx * 30, y); ctx.lineTo(x + sx * L, y); ctx.moveTo(x, y - sy * 30); ctx.lineTo(x, y + sy * L); ctx.stroke();
  }
  ctx.restore();
}
function regMark(x, y, r, col, a = 1, lw = 3) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = lw;
  circle(x, y, r); ctx.stroke(); circle(x, y, r * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 1.4, y); ctx.lineTo(x + r * 1.4, y); ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x, y + r * 1.4); ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- brand emblem + logo */
function dropPath(r) { // teardrop, tip up, centred at origin
  ctx.beginPath(); ctx.moveTo(0, -r * 1.45);
  ctx.bezierCurveTo(r * 0.35, -r * 0.9, r, -r * 0.35, r, r * 0.2);
  ctx.arc(0, r * 0.2, r, 0, Math.PI, false);
  ctx.bezierCurveTo(-r, -r * 0.35, -r * 0.35, -r * 0.9, 0, -r * 1.45);
  ctx.closePath();
}
function emblem(x, y, r, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
  if (o.ring !== false) regMark(0, -r * 0.1, r * 1.55, o.ringCol || 'rgba(255,255,255,.55)', o.ringA ?? 1, Math.max(2, r * 0.025));
  dropPath(r); ctx.save(); ctx.clip();
  const bands = [COL.C, COL.M, COL.Y, COL.K];
  ctx.rotate(-0.5);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(-r * 2 + i * r, -r * 3, r * 1.02, r * 6); }
  ctx.restore();
  // gloss
  ctx.save(); dropPath(r); ctx.clip();
  const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  ell(-r * 0.42, -r * 0.05, r * 0.16, r * 0.34, 0.3); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
  ctx.restore();
  ctx.restore();
}
function logo(cx, cy, s, o = {}) {
  const a = o.alpha ?? 1;
  ctx.save(); ctx.globalAlpha *= a;
  emblem(cx, cy - 300 * s, 118 * s, { ringCol: o.ringCol, ringA: o.ringA });
  txt('مطبعة', cx, cy - 55 * s, 92 * s, { fam: 'Cairo', weight: '900', color: o.sub || '#fff', stroke: '#111118', sw: 16 * s });
  txt('ألوان', cx + 6 * s, cy + 141 * s, 280 * s, { fam: 'Lalezar', color: '#111118', stroke: '#111118', sw: 30 * s });
  extrude('ألوان', cx, cy + 135 * s, 280 * s, { fam: 'Lalezar', color: o.main || '#fff', depth: 13 * s, c1: o.c1, c2: o.c2 });
  ctx.restore();
}

/* ---------------------------------------------------------------- character (Iraqi guy) */
const SK = '#C98A5B', SK2 = '#A9693F', HAIR = '#1C1411', JEANS = '#2C3768';
function limb(x0, y0, a1, l1, a2, l2, side, w, col, hand) {
  const x1 = x0 + side * Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
  const x2 = x1 + side * Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2;
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (hand) fillC(x2, y2, w * 0.6, SK);
  return [x2, y2];
}
function guy(o) {
  const g = Object.assign({ x: 540, y: 1650, s: 1, rot: 0, armL: [.35, -.9], armR: [.35, -.9], lookX: 0, lookY: 0, browL: 0, browR: 0,
    mouth: 'smile', blink: 0, squash: 0, tilt: 0, paper: false, shadow: true, legL: 0, legR: 0 }, o);
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.scale(g.s * (1 + g.squash * .14), g.s * (1 - g.squash * .14));
  if (g.shadow) { ell(0, 6, 190, 28); ctx.fillStyle = 'rgba(20,20,40,.13)'; ctx.fill(); }
  // legs
  const leg = (sx, a) => {
    ctx.save(); ctx.translate(sx * 42, -300); ctx.rotate(a);
    rr(-34, 0, 68, 270, 30); ctx.fillStyle = JEANS; ctx.fill();
    rr(-50 + sx * 6, 250, 112, 52, 26); ctx.fillStyle = '#fff'; ctx.fill();
    rr(-50 + sx * 6, 286, 112, 16, 8); ctx.fillStyle = COL.M; ctx.fill();
    ctx.restore();
  };
  leg(-1, g.legL); leg(1, g.legR);
  // torso: yellow tee + open cyan overshirt
  rr(-118, -585, 236, 300, 70); ctx.fillStyle = COL.Y; ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sx * 128, -540); ctx.quadraticCurveTo(sx * 135, -585, sx * 70, -590); ctx.lineTo(sx * 44, -470);
    ctx.lineTo(sx * 58, -282); ctx.lineTo(sx * 128, -282); ctx.closePath(); ctx.fillStyle = COL.C; ctx.fill();
  }
  // CMYK dots print on tee
  [COL.C, COL.M, COL.K].forEach((c, i) => fillC(-20 + i * 20, -420, 9, c));
  ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(-118, -300, 236, 18, 9); ctx.fill();
  // neck
  rr(-30, -625, 60, 60, 20); ctx.fillStyle = SK2; ctx.fill();
  // arms
  const hL = limb(-114, -545, g.armL[0], 140, g.armL[1], 128, -1, 60, COL.C, true);
  const hR = limb(114, -545, g.armR[0], 140, g.armR[1], 128, 1, 60, COL.C, true);
  if (g.paper) {
    const mx = (hL[0] + hR[0]) / 2, my = (hL[1] + hR[1]) / 2;
    ctx.save(); ctx.translate(mx, my - 60); ctx.rotate(Math.atan2(hR[1] - hL[1], hR[0] - hL[0]) * 0.5);
    rr(-95, -125, 190, 250, 6); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.translate(6, 6); ctx.fill(); ctx.translate(-6, -6);
    rr(-95, -125, 190, 250, 6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E3E3EA'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    fillC(hL[0], hL[1], 36, SK); fillC(hR[0], hR[1], 36, SK);
  }
  // head
  ctx.save(); ctx.translate(0, -720); ctx.rotate(g.tilt);
  fillC(-120, 10, 26, SK2); fillC(120, 10, 26, SK2);
  ell(0, 0, 120, 132); ctx.fillStyle = SK; ctx.fill();
  // beard ring (short, well-groomed)
  ctx.save(); ell(0, 0, 120, 132); ctx.clip();
  ell(0, 52, 128, 112); ctx.fillStyle = HAIR; ctx.fill();
  ell(0, 2, 100, 78); ctx.fillStyle = SK; ctx.fill();
  ctx.restore();
  // mustache
  ctx.beginPath(); ctx.moveTo(-52, 58); ctx.quadraticCurveTo(0, 30, 52, 58); ctx.quadraticCurveTo(0, 50, -52, 58); ctx.fillStyle = HAIR; ctx.fill();
  rr(-46, 44, 92, 24, 12); ctx.fill();
  // mouth
  ctx.fillStyle = '#5A1B22';
  if (g.mouth === 'o') { ell(0, 88, 20, 24); ctx.fill(); ell(0, 98, 12, 8); ctx.fillStyle = '#E86A7A'; ctx.fill(); }
  else if (g.mouth === 'grin') { ctx.beginPath(); ctx.moveTo(-40, 76); ctx.quadraticCurveTo(0, 130, 40, 76); ctx.closePath(); ctx.fill(); rr(-30, 76, 60, 12, 4); ctx.fillStyle = '#fff'; ctx.fill(); }
  else if (g.mouth === 'hmm') { rr(-10, 82, 34, 10, 5); ctx.fill(); }
  else { ctx.strokeStyle = '#5A1B22'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-26, 80); ctx.quadraticCurveTo(0, 98, 26, 80); ctx.stroke(); }
  // nose
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-26, 30, -6, 38); ctx.quadraticCurveTo(14, 40, 18, 30); ctx.closePath(); ctx.fillStyle = SK2; ctx.fill();
  // eyes
  for (const sx of [-1, 1]) {
    const ex = sx * 46, ey = -22;
    ell(ex, ey, 25, Math.max(2, 29 * (1 - g.blink))); ctx.fillStyle = '#fff'; ctx.fill();
    if (g.blink < 0.8) { fillC(ex + g.lookX * 9, ey + g.lookY * 11, 14, '#20140F'); fillC(ex + g.lookX * 9 + 5, ey + g.lookY * 11 - 5, 4.5, '#fff'); }
  }
  // brows (thick)
  ctx.strokeStyle = HAIR; ctx.lineWidth = 17; ctx.lineCap = 'round';
  for (const [sx, b] of [[-1, g.browL], [1, g.browR]]) {
    ctx.beginPath(); ctx.moveTo(sx * 72, -66 - b * 16); ctx.quadraticCurveTo(sx * 48, -84 - b * 22, sx * 22, -70 - b * 6); ctx.stroke();
  }
  // hair: tidy fade with volume on top
  ctx.beginPath(); ctx.moveTo(-122, -6); ctx.bezierCurveTo(-140, -110, -70, -170, 10, -165);
  ctx.bezierCurveTo(90, -168, 140, -110, 122, -6); ctx.bezierCurveTo(110, -60, 90, -88, 40, -96);
  ctx.bezierCurveTo(0, -80, -50, -104, -90, -84); ctx.bezierCurveTo(-110, -64, -112, -40, -122, -6); ctx.fillStyle = HAIR; ctx.fill();
  ell(30, -150, 84, 34, -0.15); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---------------------------------------------------------------- products (drawn at origin, ~360px) */
function shadowRR(x, y, w, h, r, a = .18) { ctx.save(); rr(x + 10, y + 14, w, h, r); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fill(); ctx.restore(); }
function lines(x, y, w, n, gap, col, lw = 10) { ctx.fillStyle = col; for (let i = 0; i < n; i++) { rr(x - (i === n - 1 ? w * 0.6 : w), y + i * gap, i === n - 1 ? w * 0.6 : w, lw, lw / 2); ctx.fill(); } }
function pCard(u) {
  const ang = E.io(clamp(u)) * TAU; const sx = Math.cos(ang); const front = sx >= 0;
  ctx.save(); ctx.scale(Math.max(Math.abs(sx), 0.03), 1);
  shadowRR(-190, -115, 380, 230, 22);
  rr(-190, -115, 380, 230, 22); ctx.fillStyle = front ? '#fff' : COL.M; ctx.fill();
  if (front) {
    ctx.save(); rr(-190, -115, 380, 230, 22); ctx.clip(); ctx.fillStyle = COL.C; ctx.fillRect(-190, 80, 380, 35); ctx.fillStyle = COL.Y; ctx.fillRect(-190, 80, 120, 35); ctx.fillStyle = COL.M; ctx.fillRect(-70, 80, 90, 35); ctx.restore();
    emblem(125, -20, 34, { ring: false });
    txt('مطبعة ألوان', -10, -45, 40, { fam: 'Cairo', color: COL.K });
    lines(80, 0, 170, 2, 26, '#C9CAD3', 10);
  } else txt('ألوان', 0, 8, 120, { color: '#fff' });
  ctx.restore();
}
function pSticker(u, t) {
  const st = E.out(clamp(u * 2.5));
  ctx.save(); ctx.scale(1 + (1 - st) * 0.7, 1 + (1 - st) * 0.7); ctx.rotate(-0.12 + (1 - st) * 0.5);
  circle(8, 12, 165); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fill();
  circle(0, 0, 165); ctx.fillStyle = '#fff'; ctx.fill();
  circle(0, 0, 148); ctx.fillStyle = COL.Y; ctx.fill();
  star(0, 0, 135, 105, 14, t * 0.4, COL.M);
  circle(0, 0, 100); ctx.fillStyle = COL.Y; ctx.fill();
  txt('ألوان', 0, 10, 92, { color: COL.K });
  // peel corner
  const peel = (1 - clamp(u * 1.5)) * 60 + 22;
  ctx.beginPath(); ctx.moveTo(116, 60); ctx.quadraticCurveTo(116 + peel * .2, 60 + peel * .9, 60, 116); ctx.quadraticCurveTo(100, 110, 116, 60);
  ctx.fillStyle = '#F2F2F6'; ctx.fill();
  ctx.restore();
}
function pBrochure(u) {
  const s = E.back(clamp(u * 1.4));
  const pw = 125, ph = 300;
  ctx.save();
  shadowRR(-pw / 2 - pw * s, -ph / 2, pw + 2 * pw * s, ph, 8);
  const panel = (x0, w, fillTop, i) => {
    ctx.save(); ctx.translate(x0, 0); ctx.scale(w, 1);
    rr(0, -ph / 2, 1, ph, 0); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    if (Math.abs(w) > 20) {
      const xl = Math.min(x0, x0 + w), ww = Math.abs(w);
      ctx.fillStyle = fillTop; ctx.fillRect(xl, -ph / 2, ww, 110);
      circle(xl + ww / 2, -ph / 2 + 110, ww * 0.32); ctx.fill();
      lines(xl + ww - 14, 20, ww - 28, 3, 28, '#CFD0D8', 9);
      ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(i === 0 ? xl + ww - 6 : xl, -ph / 2, 6, ph);
    }
  };
  panel(-pw / 2, -pw * s, COL.M, 1);
  panel(-pw / 2, pw, COL.C, 0);
  panel(pw / 2, pw * s, COL.Y, 2);
  if (s > .6) emblem(0, -ph / 2 + 70, 30, { ring: false });
  ctx.restore();
}
function pBag(u) {
  const b = u <= 0 ? 0 : E.bounce(clamp(u * 1.3));
  const yo = -380 * (1 - b);
  const land = clamp(u * 1.3) > .36 && clamp(u * 1.3) < .55 ? 0.12 : 0;
  ctx.save(); ctx.translate(0, yo + 150); ctx.scale(1 + land, 1 - land); ctx.translate(0, -150);
  ell(0, 158, 160 * (0.6 + b * 0.4), 18); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
  ctx.strokeStyle = COL.K; ctx.lineWidth = 12;
  const sw = Math.sin(u * 14) * 0.2 * (1 - clamp(u));
  for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * 60, -120); ctx.rotate(sw); ctx.beginPath(); ctx.arc(0, 0, 46, Math.PI, 0); ctx.stroke(); ctx.restore(); }
  ctx.beginPath(); ctx.moveTo(-130, -120); ctx.lineTo(130, -120); ctx.lineTo(150, 150); ctx.lineTo(-150, 150); ctx.closePath(); ctx.fillStyle = COL.C; ctx.fill();
  ctx.beginPath(); ctx.moveTo(90, -120); ctx.lineTo(130, -120); ctx.lineTo(150, 150); ctx.lineTo(108, 150); ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fill();
  emblem(-10, -30, 34, { ring: false });
  txt('ألوان', -10, 70, 92, { color: '#fff' });
  ctx.restore();
}
function pPoster(u) {
  const w = 270, h = 390, k = E.out(clamp(u * 1.3));
  ctx.save();
  shadowRR(-w / 2, -h / 2, w, h * k, 6);
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2 - 5, -h / 2, w + 10, h * k); ctx.clip();
  ctx.fillStyle = COL.Y; ctx.fillRect(-w / 2, -h / 2, w, h);
  fillC(30, -40, 105, COL.M);
  ctx.beginPath(); ctx.moveTo(-w / 2, 90); ctx.lineTo(40, 20); ctx.lineTo(w / 2, 130); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.fillStyle = COL.C; ctx.fill();
  txt('ألوان', 0, -125, 74, { color: COL.K });
  lines(90, 150, 180, 2, 26, COL.K, 10);
  ctx.restore();
  if (k < 1) { const ry = -h / 2 + h * k; rr(-w / 2 - 12, ry - 16, w + 24, 32, 16); const g = ctx.createLinearGradient(0, ry - 16, 0, ry + 16); g.addColorStop(0, '#fff'); g.addColorStop(1, '#C8C8D2'); ctx.fillStyle = g; ctx.fill(); }
  ctx.restore();
}
function pNotebook(u) {
  const w = 250, h = 330;
  const a = Math.sin(Math.PI * clamp(u)) * 0.93 * Math.PI; const sx = Math.cos(a);
  ctx.save();
  shadowRR(-w / 2, -h / 2, w, h, 16);
  rr(-w / 2, -h / 2, w, h, 16); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.save(); rr(-w / 2, -h / 2, w, h, 16); ctx.clip();
  ctx.strokeStyle = '#D5D7E2'; ctx.lineWidth = 4; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 20, -h / 2 + 50 + i * 32); ctx.lineTo(w / 2 - 30, -h / 2 + 50 + i * 32); ctx.stroke(); }
  ctx.restore();
  // cover hinged at right (Arabic binding)
  ctx.save(); ctx.translate(w / 2, 0); ctx.scale(sx, 1);
  rr(-w, -h / 2, w, h, 16); ctx.fillStyle = sx > 0 ? COL.K : '#EDEDF3'; ctx.fill();
  if (sx > 0.25) {
    ctx.save(); rr(-w, -h / 2, w, h, 16); ctx.clip(); ctx.rotate(-0.6);
    [COL.C, COL.M, COL.Y].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-w * 1.6, 40 + i * 38, w * 2.4, 26); });
    ctx.restore();
    emblem(-w / 2, -60, 40, { ring: false });
  }
  ctx.restore();
  // spiral
  ctx.strokeStyle = '#9A9CAB'; ctx.lineWidth = 7;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(w / 2, -h / 2 + 28 + i * 35, 14, 9, 0, 0, TAU); ctx.stroke(); }
  ctx.restore();
}
function pBanner(u) {
  const w = 250, h = 440, k = E.out(clamp(u * 1.3));
  ctx.save();
  ell(0, 238, 190, 20); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
  const top = 205 - h * k;
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, top, w, h * k); ctx.clip();
  ctx.translate(0, top);
  ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, 0, w, h);
  ctx.fillStyle = COL.M; ctx.fillRect(-w / 2, 0, w, 120);
  fillC(70, 120, 60, COL.Y);
  txt('مطبعة', 0, 180, 46, { fam: 'Cairo', color: COL.K });
  txt('ألوان', 0, 255, 96, { color: COL.K });
  ctx.beginPath(); ctx.moveTo(-w / 2, 340); ctx.quadraticCurveTo(0, 300, w / 2, 350); ctx.lineTo(w / 2, h); ctx.lineTo(-w / 2, h); ctx.fillStyle = COL.C; ctx.fill();
  ctx.restore();
  rr(-w / 2 - 14, top - 10, w + 28, 16, 8); ctx.fillStyle = '#B9BBC8'; ctx.fill();
  rr(-w / 2 - 25, 200, w + 50, 40, 14); ctx.fillStyle = '#5B5E70'; ctx.fill();
  rr(-w / 2 - 25, 200, w + 50, 12, 6); ctx.fillStyle = '#8D90A3'; ctx.fill();
  ctx.restore();
}
const PRODUCTS = [
  { name: 'كارت شخصي', fn: pCard },
  { name: 'ستكر', fn: pSticker },
  { name: 'بروشور', fn: pBrochure },
  { name: 'كيس', fn: pBag },
  { name: 'بوستر', fn: pPoster },
  { name: 'دفتر', fn: pNotebook },
  { name: 'لافتة', fn: pBanner },
];
function product(i, x, y, s, u, t, rot = 0) { withT(x, y, s, rot, () => PRODUCTS[i].fn(u, t)); }

/* ---------------------------------------------------------------- small props */
function teaGlass(x, y, s, t) { // Iraqi istikan on a saucer
  withT(x, y, s, 0, () => {
    ell(0, 0, 70, 16); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#D7D8E2'; ctx.lineWidth = 4; ctx.stroke();
    ell(0, -4, 44, 9); ctx.fillStyle = COL.C; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-34, -110); ctx.quadraticCurveTo(-14, -60, -30, -8); ctx.lineTo(30, -8); ctx.quadraticCurveTo(14, -60, 34, -110); ctx.closePath();
    ctx.fillStyle = 'rgba(220,235,245,.7)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-30, -92); ctx.quadraticCurveTo(-14, -58, -29, -10); ctx.lineTo(29, -10); ctx.quadraticCurveTo(14, -58, 30, -92); ctx.closePath();
    ctx.fillStyle = '#B5420F'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; rr(-24, -88, 8, 60, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(160,165,185,.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.7 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * .8;
      ctx.beginPath(); const bx = -18 + k * 18, by = -125 - ph * 70;
      ctx.moveTo(bx, by + 40); ctx.bezierCurveTo(bx - 14, by + 25, bx + 14, by + 15, bx, by); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}
function bubble(x, y, r, ringCol, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  circle(6, 10, r); ctx.fillStyle = 'rgba(20,20,40,.10)'; ctx.fill();
  circle(0, 0, r); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = ringCol; ctx.stroke();
  ctx.restore();
}
function droplet(x, y, s, col, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(s * (1 + (o.sq || 0) * .25), s * (1 - (o.sq || 0) * .25));
  ell(0, 118, 70, 12); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
  const fc = col === COL.K ? '#2A2A36' : col;
  ell(-32, 108, 22, 12); ctx.fillStyle = fc; ctx.fill(); ell(32, 108, 22, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -115); ctx.bezierCurveTo(30, -70, 82, -20, 82, 30); ctx.arc(0, 30, 82, 0, Math.PI, false); ctx.bezierCurveTo(-82, -20, -30, -70, 0, -115);
  ctx.fillStyle = col; ctx.fill();
  if (col === COL.K) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 4; ctx.stroke(); }
  ell(-38, -4, 12, 26, 0.35); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
  for (const sx of [-1, 1]) {
    ell(sx * 26, 26, 18, 20 * (1 - (o.blink || 0))); ctx.fillStyle = '#fff'; ctx.fill();
    fillC(sx * 26 + (o.lx || 0) * 6, 28 + (o.ly || 0) * 6, 9, '#111');
  }
  ctx.strokeStyle = col === COL.K ? '#fff' : '#111'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); if (o.happy) { ctx.arc(0, 56, 18, 0.1, Math.PI - 0.1); } else { ctx.moveTo(-10, 62); ctx.quadraticCurveTo(0, 70, 10, 62); } ctx.stroke();
  ctx.restore();
}

/* ================================================================ SCENE 1+2 : white studio → throw → portal */
const PORTAL = [540, 760];
function bgWhite(t) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(540, 1100, 100, 540, 1100, 1100); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(225,228,240,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  halftone('#E9EBF3', 34, 9, t, 1, (x, y) => clamp(1 - Math.hypot(x - 1080, y - 0) / 520));
  halftone('#EEF0F6', 34, 9, t, 1, (x, y) => clamp(1 - Math.hypot(x, y - 1920) / 560));
}
const IDEAS = [ // thought-bubble icons
  (s) => withT(0, 0, s, 0, () => emblem(0, 18, 34, { ring: false })),
  (s) => withT(0, 0, s * 0.32, -0.15, () => pCard(0)),
  (s) => withT(0, 0, s * 0.28, 0.1, () => pPoster(1)),
  (s) => withT(0, 6, s * 0.3, 0, () => pBag(1)),
  (s) => withT(0, 0, s * 0.33, 0, () => pSticker(1, 0)),
  (s) => withT(0, 6, s * 0.24, 0, () => pBanner(1)),
];
function scene12(t) {
  bgWhite(t);
  // camera zoom into portal at the end
  const zp = E.in(P(t, 7.95, 8.75));
  ctx.save();
  ctx.translate(PORTAL[0], PORTAL[1]); ctx.scale(1 + zp * 7, 1 + zp * 7); ctx.translate(-PORTAL[0], -PORTAL[1]);
  const [shx, shy] = shake(t, 5.55, .35, 10); ctx.translate(shx, shy);

  // side table + istikan
  const tblIn = E.back(P(t, 0.35, 1.0));
  if (t < 5.2) {
    withT(200, 1650, 1, 0, () => {
      ctx.globalAlpha = clamp(tblIn * 2);
      ell(0, 4, 90, 14); ctx.fillStyle = 'rgba(20,20,40,.1)'; ctx.fill();
      rr(-12, -270 * tblIn, 24, 270 * tblIn, 10); ctx.fillStyle = COL.K; ctx.fill();
      rr(-70, -10, 140, 18, 9); ctx.fill();
      ell(0, -270 * tblIn, 105, 22); ctx.fillStyle = COL.M; ctx.fill();
      ctx.globalAlpha = 1;
    });
    if (tblIn > 0.5) teaGlass(200, 1650 - 286 * tblIn, 0.95 * E.back(P(t, 0.7, 1.2)), t);
  } else {
    // table slides away during the throw
    const k = E.inBack(P(t, 5.2, 5.8));
    withT(200 - k * 500, 1650, 1, 0, () => { rr(-12, -270, 24, 270, 10); ctx.fillStyle = COL.K; ctx.fill(); rr(-70, -10, 140, 18, 9); ctx.fill(); ell(0, -270, 105, 22); ctx.fillStyle = COL.M; ctx.fill(); });
    teaGlass(200 - k * 500, 1650 - 286, 0.95, t);
  }

  // ---- character
  const gx = 590, gy = 1650;
  const enter = E.back(P(t, 0, 0.55));
  const blink = (t > 2.05 && t < 2.2) || (t > 4.1 && t < 4.22) ? 1 : 0;
  let pose;
  if (t < 5.0) {
    const scratch = P(t, 2.6, 2.9) * (1 - P(t, 4.3, 4.6));
    const sc = Math.sin(t * 22) * 0.18 * scratch;
    pose = {
      x: gx, y: gy, s: 0.92 * enter, tilt: Math.sin(t * 1.6) * 0.06 - 0.05, lookY: 0.9 - scratch * 1.2, lookX: -0.2 + scratch * 0.6,
      browL: 0.7 * P(t, 0.6, 1) , browR: -0.2, mouth: t > 2.6 ? 'hmm' : 'smile', blink, paper: true,
      armL: [.35, -.9], armR: [lerp(.35, 2.35, E.io(scratch)), lerp(-.9, -2.55 + sc, E.io(scratch))],
    };
    if (scratch > 0.01) pose.paper = false;
  } else {
    const crouch = Math.sin(Math.PI * P(t, 5.0, 5.5));
    const up = E.out(P(t, 5.3, 5.55));
    const jump = P(t, 7.25, 8.05);
    pose = {
      x: gx, y: gy, s: 0.92, squash: crouch * 0.8 - up * 0.15 * (1 - P(t, 5.6, 6)), lookY: lerp(0.6, -1, E.out(P(t, 5.2, 5.6))), lookX: -0.3,
      browL: 0.9, browR: 0.9, mouth: t > 5.6 ? (t > 6.6 ? 'grin' : 'o') : 'hmm', blink: 0, paper: t < 5.38,
      armL: [lerp(.35, 2.9, up), lerp(-.9, 3.0, up)], armR: [lerp(.35, 2.9, up), lerp(-.9, 3.0, up)],
    };
    if (t > 6.6) { // excited: fists pumping
      const pump = Math.sin((t - 6.6) * 14) * 0.25;
      pose.armL = [2.5 + pump, 3.1]; pose.armR = [2.5 - pump, 3.1];
    }
    if (jump > 0) {
      const j = E.io(jump);
      const sy = gy, ey = PORTAL[1] + 40;
      pose.x = lerp(gx, PORTAL[0], j);
      pose.y = lerp(sy, ey, j) - Math.sin(Math.PI * j) * 380;
      pose.s = lerp(0.92, 0.05, E.in(jump));
      pose.rot = -TAU * E.in(jump);
      pose.shadow = false; pose.armL = [2.9, 3]; pose.armR = [2.9, 3]; pose.legL = .3; pose.legR = -.3;
    }
  }
  // portal behind character once he jumps
  drawPortal(t);
  if (t < 8.05) guy(pose);

  // ---- thought bubbles (scene 1)
  if (t < 5.6) {
    const out = E.inBack(P(t, 4.85, 5.3));
    const hx = gx, hy = gy - 0.92 * 820;
    for (let i = 0; i < 6; i++) {
      const a = lerp(-Math.PI * 0.92, -Math.PI * 0.08, i / 5);
      const bx = 540 + Math.cos(a) * 395, by = 830 + Math.sin(a) * 420 + Math.sin(t * 2 + i) * 10;
      const k = E.elastic(P(t, 0.9 + i * 0.32, 1.9 + i * 0.32)) * (1 - out);
      if (k <= 0.001) continue;
      // trail dots to head
      if (i === 2 || i === 3) for (let d = 1; d <= 2; d++) fillC(lerp(hx - 40, bx, d / 3.4), lerp(hy - 60, by + 90, d / 3.4), 10 + d * 6 * k, `rgba(200,203,220,${0.8 * k})`);
      bubble(bx, by, 92, CMYK[i % 4] === COL.K ? COL.M : CMYK[i % 4], k);
      withT(bx, by, k, Math.sin(t * 3 + i) * 0.08, () => IDEAS[i](1));
    }
    // question mark
    const q = E.elastic(P(t, 2.7, 3.5)) * (1 - out);
    if (q > 0) txt('؟', hx + 170, hy - 120 + Math.sin(t * 6) * 8, 150 * q, { color: COL.M });
  }

  // ---- paper flight → portal
  if (t >= 5.38 && t < 6.5) {
    const k = P(t, 5.38, 6.05);
    const px = lerp(gx, PORTAL[0], E.out(k)), py = lerp(gy - 0.92 * 900, PORTAL[1], E.out(k));
    const morph = P(t, 5.95, 6.4);
    const sz = lerp(1, 2.4, morph);
    withT(px, py, sz * (1 - E.in(morph) * 0.4), k * TAU * 1.5 * (1 - morph), () => {
      ctx.globalAlpha = 1 - E.in(morph);
      rr(-90, -120 + morph * 30, 180, 240 - morph * 60, 6 + morph * 90); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#DDDEE6'; ctx.lineWidth = 4; ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // motion streaks
    if (k < 1) { ctx.strokeStyle = 'rgba(0,174,239,.35)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; for (let s2 = -1; s2 <= 1; s2++) { ctx.beginPath(); ctx.moveTo(px + s2 * 40, py + 140); ctx.lineTo(px + s2 * 40, py + 140 + 160 * (1 - k)); ctx.stroke(); } }
  }
  ctx.restore();

  // ---- typography (outside camera)
  if (t < 5.3) {
    const outT = E.inBack(P(t, 4.95, 5.3));
    wordsRTL([{ w: 'عندك', color: COL.K }, { w: 'فكرة؟', color: COL.M }], 540, 230 - outT * 400, 150, { fam: 'Lalezar' }, i => {
      const k = E.back(P(t, 0.25 + i * 0.32, 0.75 + i * 0.32));
      return { dy: (1 - k) * 80, s: k, a: clamp(k * 3) };
    });
    const w2 = ['بس', 'شلون', 'تخليها', 'تنشاف؟'];
    wordsRTL(w2.map((w, i) => ({ w, color: i === 3 ? COL.C : COL.K })), 540, 1800 + outT * 300, 84, { fam: 'Cairo', weight: '900' }, i => {
      const k = E.back(P(t, 2.75 + i * 0.27, 3.15 + i * 0.27));
      return { dy: (1 - k) * 60, s: lerp(0.6, 1, k), a: clamp(k * 2) };
    });
  }
}
function drawPortal(t) {
  const k = P(t, 5.95, 6.9);
  if (k <= 0) return;
  const [x, y] = PORTAL;
  const R = 330 * E.back(k) * (1 + Math.sin(t * 5) * 0.015);
  glow(x, y, R * 1.9, 'rgba(236,0,140,.35)', clamp(k * 2));
  // swirl rings
  for (let ring = 0; ring < 5; ring++) {
    const rr2 = R * (1 - ring * 0.17);
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const a0 = t * (2.2 + ring * 0.9) * (ring % 2 ? -1 : 1) + s * TAU / segs + ring;
      ctx.beginPath(); ctx.arc(x, y, rr2, a0, a0 + TAU / segs * 0.82);
      ctx.strokeStyle = CMYK[(s + ring) % 4]; ctx.lineWidth = R * 0.13; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.55);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, '#FFF6B0'); g.addColorStop(1, 'rgba(255,225,0,0)');
  ctx.fillStyle = g; circle(x, y, R * 0.55); ctx.fill();
  // particles being sucked in
  const R2 = rng(5);
  for (let i = 0; i < 40; i++) {
    const ph = (t * 0.8 + R2()) % 1; const a = R2() * TAU + ph * 3; const d = R * (2.2 - ph * 1.8);
    fillC(x + Math.cos(a) * d, y + Math.sin(a) * d, (3 + R2() * 7) * (1 - ph * 0.6) * clamp(k * 2), CMYK[i % 3]);
  }
}

/* ================================================================ WORLD (scene 2 end + 3) */
function bgWorld(t, base = COL.C) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,40,120,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  halftone('rgba(255,255,255,1)', 46, 14, t, 0.16, (x, y, tt) => 0.5 + 0.5 * Math.sin(x * 0.006 + y * 0.004 - tt * 2.2));
  // floating confetti shapes
  const R = rng(11);
  for (let i = 0; i < 26; i++) {
    const sx = R() * W, sy = R() * H, sp = 30 + R() * 60, typ = Math.floor(R() * 4), c = [COL.M, COL.Y, '#fff', COL.K][i % 4], sz = 12 + R() * 22;
    const y = ((sy - t * sp) % (H + 200) + H + 200) % (H + 200) - 100;
    const x = sx + Math.sin(t + i) * 30, rot = t * (R() - .5) * 3;
    withT(x, y, 1, rot, () => {
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.lineCap = 'round';
      if (typ === 0) { circle(0, 0, sz * .6); ctx.fill(); }
      else if (typ === 1) { ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * .9, sz * .6); ctx.lineTo(-sz * .9, sz * .6); ctx.closePath(); ctx.fill(); }
      else if (typ === 2) { ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); ctx.moveTo(0, -sz); ctx.lineTo(0, sz); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.bezierCurveTo(-sz / 2, -sz, sz / 2, sz, sz, 0); ctx.stroke(); }
    });
  }
}
function press(x, y, s, t, kick) {
  withT(x, y, s, 0, () => {
    ctx.translate(Math.sin(t * 60) * kick * 6, -kick * 10);
    ell(0, 270, 420, 40); ctx.fillStyle = 'rgba(0,30,80,.35)'; ctx.fill();
    // 2.5D side + top faces
    ctx.beginPath(); ctx.moveTo(380, -200); ctx.lineTo(440, -250); ctx.lineTo(440, 190); ctx.lineTo(380, 240); ctx.closePath(); ctx.fillStyle = '#10121A'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-380, -200); ctx.lineTo(-320, -250); ctx.lineTo(440, -250); ctx.lineTo(380, -200); ctx.closePath(); ctx.fillStyle = '#3B3F52'; ctx.fill();
    // feed tray (right)
    ctx.save(); ctx.translate(430, -40); ctx.rotate(-0.35);
    rr(0, -10, 200, 26, 8); ctx.fillStyle = '#B7BAC9'; ctx.fill();
    for (let i = 0; i < 4; i++) { rr(10 + i * 3, -26 - i * 7, 170, 8, 3); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.restore();
    // body
    rr(-380, -230, 760, 470, 50);
    const g = ctx.createLinearGradient(0, -230, 0, 240); g.addColorStop(0, '#30344A'); g.addColorStop(1, '#1A1C27');
    ctx.fillStyle = g; ctx.fill();
    rr(-380, -230, 760, 18, 9); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    // ink tanks on top
    for (let i = 0; i < 4; i++) {
      const tx = -255 + i * 170, ty = -330;
      rr(tx - 52, ty - 75, 104, 150, 30); ctx.fillStyle = '#222533'; ctx.fill();
      rr(tx - 42, ty - 65, 84, 130, 24); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
      ctx.save(); rr(tx - 42, ty - 65, 84, 130, 24); ctx.clip();
      const lvl = ty + 65 - 130 * (0.62 + 0.08 * Math.sin(t * 2 + i));
      ctx.beginPath(); ctx.moveTo(tx - 50, lvl);
      for (let k = 0; k <= 10; k++) ctx.lineTo(tx - 50 + k * 10, lvl + Math.sin(t * 9 + k * 0.9 + i) * 5 * (1 + kick * 3));
      ctx.lineTo(tx + 50, ty + 80); ctx.lineTo(tx - 50, ty + 80); ctx.closePath(); ctx.fillStyle = CMYK[i] === COL.K ? '#0A0A0E' : CMYK[i]; ctx.fill();
      ctx.restore();
      rr(tx - 30, ty - 55, 10, 90, 5); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
      txt('CMYK'[i], tx, ty + 105, 34, { fam: 'Cairo', color: '#fff', dir: 'ltr' });
    }
    // window with rollers
    rr(-320, -170, 560, 200, 34); ctx.fillStyle = '#0B0C12'; ctx.fill();
    ctx.save(); rr(-320, -170, 560, 200, 34); ctx.clip();
    // paper strip running through
    ctx.fillStyle = '#fff'; ctx.fillRect(-320, -78, 560, 20);
    for (let k = 0; k < 8; k++) { const xx = ((k * 90 - t * 600) % 720 + 720) % 720 - 360; ctx.fillStyle = CMYK[k % 4]; ctx.fillRect(xx, -78, 40, 20); }
    for (let i = 0; i < 4; i++) {
      const rx = -250 + i * 140;
      for (const ry of [-118, -18]) {
        circle(rx, ry, 42); ctx.fillStyle = '#3A3E52'; ctx.fill();
        circle(rx, ry, 34); ctx.fillStyle = CMYK[i] === COL.K ? '#555A70' : CMYK[i]; ctx.fill();
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(t * 9 * (ry < -60 ? 1 : -1));
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    rr(-320, -170, 560, 200, 34); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 5; ctx.stroke();
    // control panel
    rr(262, -170, 92, 200, 22); ctx.fillStyle = '#12141C'; ctx.fill();
    rr(276, -152, 64, 50, 10); ctx.fillStyle = '#0EE6A0'; ctx.globalAlpha = .85; ctx.fill(); ctx.globalAlpha = 1;
    rr(282, -120, 52 * ((t * 1.15) % 1), 10, 5); ctx.fillStyle = '#0B3A2C'; ctx.fill();
    for (let i = 0; i < 3; i++) fillC(290 + i * 18, -70, 7, Math.floor(t * 6 + i) % 3 === 0 ? '#FF4D6D' : '#3B3F52');
    circle(308, -18, 26); ctx.fillStyle = COL.M; ctx.fill(); circle(308, -18, 15); ctx.fillStyle = '#fff'; ctx.fill();
    // brand plate
    txt('ألوان', -40, 110, 92, { color: '#fff' });
    emblem(150, 100, 30, { ring: false });
    // output slot
    rr(-240, 170, 480, 36, 18); ctx.fillStyle = '#07080C'; ctx.fill();
    rr(-240, 170, 480, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
  });
}
const PRESS = { x: 540, y: 820, s: 0.95 };
const SLOT = [540, 820 + 188 * 0.95];
const SHOW = [540, 1360];
const PT = i => 10.75 + i * 0.86; // product eject times
const trayX = i => 1000 - i * 153, TRAY_Y = 1745;
function sceneWorld(t) {
  bgWorld(t);
  // intro title 8.5–10.3
  if (t < 10.4) {
    const out = E.inBack(P(t, 9.95, 10.35));
    const k1 = E.back(P(t, 8.55, 8.95)), k2 = E.out(P(t, 8.85, 9.5));
    txt('هنا يجي دور', 540, 620 - out * 700, 96, { fam: 'Cairo', weight: '900', color: '#fff', alpha: clamp(k1 * 2) * (1 - out) });
    ctx.save(); ctx.translate(540, 860 - out * 700); ctx.scale(lerp(1.6, 1, k2), lerp(1.6, 1, k2));
    // backing block
    const bw = 860 * E.out(P(t, 8.75, 9.2));
    rr(-bw / 2, -140, bw, 270, 40); ctx.fillStyle = COL.K; ctx.fill();
    regText('مطبعة ألوان', 0, 0, 175, 60 * (1 - k2), { color: '#fff', alpha: clamp(k2 * 3), blend: 'screen' });
    ctx.restore();
    // ink splats framing
    splat(220, 1250 + out * 500, 110, COL.M, 3, P(t, 8.7, 9.1));
    splat(860, 1350 + out * 500, 140, COL.Y, 4, P(t, 8.8, 9.2));
    splat(540, 1520 + out * 500, 90, COL.K, 6, P(t, 8.95, 9.3));
  }
  // printing press rises
  const rise = E.back(P(t, 9.95, 10.6));
  if (rise > 0) {
    let kick = 0;
    for (let i = 0; i < 7; i++) kick = Math.max(kick, 1 - P(t, PT(i), PT(i) + 0.22));
    const kk = t >= PT(0) && t < PT(6) + 0.25 ? kick : 0;
    press(PRESS.x, PRESS.y + (1 - rise) * 1300, PRESS.s, t, kk);
    // paper sheets feeding in from the right
    for (let i = 0; i < 7; i++) {
      const f = P(t, PT(i) - 0.45, PT(i) - 0.05);
      if (f <= 0 || f >= 1) continue;
      const fx = lerp(1250, 980, E.out(f)), fy = lerp(380, 700, E.out(f));
      withT(fx, fy, 1 - f * 0.5, -0.35 + Math.sin(f * 6) * 0.1, () => { rr(-80, -55, 160, 110, 4); ctx.fillStyle = '#fff'; ctx.fill(); });
    }
  }
  // products eject → showcase → tray
  for (let i = 0; i < 7; i++) {
    const t0 = PT(i);
    if (t < t0) continue;
    const ej = P(t, t0, t0 + 0.22), hold = P(t, t0 + 0.2, t0 + 0.84), fly = P(t, t0 + 0.84, t0 + 1.18);
    let x, y, s, rot = 0;
    if (fly <= 0) {
      const e = E.back(ej);
      x = lerp(SLOT[0], SHOW[0], e); y = lerp(SLOT[1], SHOW[1], e); s = lerp(0.2, 1, e);
      rot = Math.sin(hold * Math.PI) * 0.04;
    } else {
      const e = E.io(fly);
      x = lerp(SHOW[0], trayX(i), e); y = lerp(SHOW[1], TRAY_Y, e) - Math.sin(Math.PI * e) * 120; s = lerp(1, 0.34, e); rot = Math.sin(Math.PI * e) * 0.4;
    }
    // ink burst behind on eject
    if (ej < 1 || hold < 0.4) splat(SHOW[0], SHOW[1], 210, CMYK[i % 4] === COL.K ? COL.Y : CMYK[(i + 1) % 4], 30 + i, P(t, t0 + 0.08, t0 + 0.4), { alpha: 1 - P(t, t0 + 0.55, t0 + 0.84) });
    product(i, x, y, s, hold, t, rot);
    // label
    if (fly < 0.5) {
      const la = E.back(P(t, t0 + 0.12, t0 + 0.32)) * (1 - E.in(clamp(fly * 2)));
      if (la > 0.01) {
        const nm = PRODUCTS[i].name; const w = measure(nm, 64, 'Cairo') + 70;
        withT(540, 1600, la, 0, () => { rr(-w / 2, -50, w, 100, 50); ctx.fillStyle = COL.K; ctx.fill(); txt(nm, 0, 4, 64, { fam: 'Cairo', color: '#fff' }); });
      }
    }
  }
  // idea → design → tangible chips (VO line 3)
  if (t > 10.3) {
    const chips = [{ w: 'فكرة براسك', bg: COL.Y, c: COL.K, t: 10.45 }, { w: 'تصميم', bg: COL.M, c: '#fff', t: 12.35 }, { w: 'شي ملموس', bg: COL.K, c: '#fff', t: 14.35 }];
    const fs = 46; const ws = chips.map(c => measure(c.w, fs, 'Cairo') + 44); const arrow = 56;
    const total = ws.reduce((a, b) => a + b, 0) + arrow * 2;
    let xr = 540 + total / 2;
    chips.forEach((c, i) => {
      const k = E.back(P(t, c.t, c.t + 0.35));
      const cx = xr - ws[i] / 2;
      if (k > 0.01) withT(cx, 250, k, 0, () => { rr(-ws[i] / 2, -46, ws[i], 92, 46); ctx.fillStyle = c.bg; ctx.fill(); txt(c.w, 0, 4, fs, { fam: 'Cairo', color: c.c }); });
      xr -= ws[i];
      if (i < 2) {
        const ka = E.out(P(t, chips[i + 1].t - 0.15, chips[i + 1].t + 0.1));
        if (ka > 0) txt('←', xr - arrow / 2, 250, 50, { fam: 'Cairo', color: '#fff', alpha: ka });
        xr -= arrow;
      }
    });
  }
}

/* ================================================================ SCENE 4 : CMYK droplets */
const POST = { x: 540, y: 820, w: 520, h: 720 };
const DROPS = [
  { c: COL.C, from: [-150, 300], wait: [165, 430], hit: [640, 640] },
  { c: COL.M, from: [1230, 300], wait: [915, 430], hit: [430, 760] },
  { c: COL.Y, from: [-150, 1350], wait: [165, 1230], hit: [560, 960] },
  { c: COL.K, from: [1230, 1350], wait: [915, 1230], hit: [540, 1060] },
];
const JT = i => 18.25 + i * 0.6;
function posterPlates(t, revealFn) {
  const { x, y, w, h } = POST;
  ctx.save(); rr(x - w / 2, y - h / 2, w, h, 10); ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  const plate = (i, draw) => { const r = revealFn(i); if (r <= 0) return; ctx.save(); const [hx, hy] = DROPS[i].hit; blobPath(hx, hy, r, 12, 50 + i, 0.3, t); ctx.clip(); draw(); ctx.restore(); };
  plate(0, () => { ctx.fillStyle = COL.C; fillC(x + 120, y - 170, 190, COL.C); ctx.beginPath(); ctx.moveTo(x - w / 2, y + 170); ctx.quadraticCurveTo(x, y + 90, x + w / 2, y + 200); ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.fill(); });
  plate(1, () => { fillC(x - 90, y - 40, 170, COL.M); for (let k = 0; k < 6; k++) fillC(x - 85 + k * 34, y + 300, 10, COL.M); });
  plate(2, () => { fillC(x + 40, y - 120, 115, COL.Y); ctx.save(); ctx.translate(x, y + 60); ctx.rotate(-0.35); ctx.fillStyle = COL.Y; ctx.fillRect(-400, -40, 800, 80); ctx.restore(); });
  plate(3, () => {
    txt('ألوان', x, y + 205, 150, { color: COL.K });
    txt('مطبعة', x, y + 95, 52, { fam: 'Cairo', color: COL.K });
    ctx.strokeStyle = COL.K; ctx.lineWidth = 6; rr(x - w / 2 + 26, y - h / 2 + 26, w - 52, h - 52, 6); ctx.stroke();
  });
  ctx.restore();
}
function scene4(t) {
  ctx.fillStyle = '#101017'; ctx.fillRect(0, 0, W, H);
  halftone('#ffffff', 40, 4, t, 0.08, () => 1);
  glow(540, 820, 900, 'rgba(0,174,239,.20)');
  glow(540, 1350, 700, 'rgba(236,0,140,.16)');
  const lux = E.io(P(t, 20.75, 21.45));
  const [shx, shy] = shake(t, 22.0, .4, 14);
  ctx.save(); ctx.translate(shx, shy);
  // poster
  const pin = E.back(P(t, 17.3, 17.8));
  ctx.save();
  const py = lerp(POST.y, 610, lux), ps = lerp(1, 0.66, lux) * pin, prot = lerp(0, -0.06, lux) + Math.sin(t * 1.5) * 0.01 * lux;
  ctx.translate(540, py); ctx.rotate(prot); ctx.scale(ps, ps); ctx.translate(-POST.x, -POST.y);
  const { x, y, w, h } = POST;
  glow(x, y, 560, 'rgba(255,255,255,.22)', lux);
  rr(x - w / 2 + 18, y - h / 2 + 26, w, h, 10); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
  rr(x - w / 2, y - h / 2, w, h, 10); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  // sketch guide lines before ink
  const sketchA = 1 - P(t, 20.2, 20.6);
  if (sketchA > 0) {
    ctx.save(); ctx.globalAlpha = sketchA * 0.6; ctx.setLineDash([14, 12]); ctx.strokeStyle = '#9EA2B5'; ctx.lineWidth = 4;
    circle(x + 120, y - 170, 190); ctx.stroke(); circle(x - 90, y - 40, 170); ctx.stroke(); circle(x + 40, y - 120, 115); ctx.stroke();
    rr(x - 170, y + 160, 340, 100, 10); ctx.stroke(); ctx.restore();
  }
  posterPlates(t, i => 900 * E.out(P(t, JT(i) + 0.32, JT(i) + 0.9)));
  // gold foil shine
  if (lux > 0) {
    ctx.save(); rr(x - w / 2, y - h / 2, w, h, 10); ctx.clip();
    const sp = P(t, 21.2, 21.9); const sx = lerp(x - w, x + w, sp);
    const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.translate(sx, y); ctx.rotate(0.35); ctx.translate(-sx, -y); ctx.fillRect(sx - 140, y - h, 280, h * 2);
    ctx.restore();
    ctx.strokeStyle = '#E8C46A'; ctx.lineWidth = 10 * lux; rr(x - w / 2, y - h / 2, w, h, 10); ctx.stroke();
  }
  ctx.restore();
  // sparkles around luxe poster
  if (lux > 0) {
    const R = rng(77);
    for (let i = 0; i < 9; i++) { const a = R() * TAU, d = 300 + R() * 120, ph = (t * 1.2 + R()) % 1; sparkle(540 + Math.cos(a) * d * 0.9, 610 + Math.sin(a) * d * 1.2, 26 * Math.sin(ph * Math.PI) * lux, i % 2 ? '#FFE9A8' : '#fff'); }
  }
  // droplets: enter, wait, jump into the design
  DROPS.forEach((d, i) => {
    const en = P(t, 17.35 + i * 0.12, 17.95 + i * 0.12);
    const jt = JT(i); const j = P(t, jt, jt + 0.36);
    let x2, y2, s = 0.85, sq = 0, rot = 0;
    if (j <= 0) {
      const e = E.out(en);
      x2 = lerp(d.from[0], d.wait[0], e); y2 = lerp(d.from[1], d.wait[1], e) - Math.abs(Math.sin(en * Math.PI * 3)) * 70 * (1 - e * 0.3);
      sq = Math.sin(t * 8 + i) * 0.15; if (t > jt - 0.2) sq = 0.5 * P(t, jt - 0.2, jt); // anticipation
      droplet(x2, y2, s, d.c, { sq, lx: (540 - x2) / 400, ly: 0, blink: (t * 1.3 + i * .3) % 3 < .08 ? 1 : 0 });
    } else if (j < 1) {
      const e = E.io(j);
      x2 = lerp(d.wait[0], d.hit[0], e); y2 = lerp(d.wait[1], d.hit[1], e) - Math.sin(Math.PI * e) * 260;
      droplet(x2, y2, s * (1 - e * 0.5), d.c, { sq: -0.6 * Math.sin(Math.PI * e), rot: (d.hit[0] - d.wait[0]) / 900 * Math.sin(Math.PI * e) });
    }
    // splat on impact (over poster)
    const sp = P(t, jt + 0.33, jt + 0.6);
    if (sp > 0 && sp < 1 && t < 20.9) splat(d.hit[0], d.hit[1], 85, d.c, 90 + i, sp, { alpha: 1 - sp });
  });
  // happy droplets pop back out around the headline
  const pop = t > 22.05;
  if (pop) {
    const spots = [[150, 1630], [330, 1730], [750, 1730], [930, 1630]];
    DROPS.forEach((d, i) => {
      const k = E.back(P(t, 22.05 + i * 0.07, 22.45 + i * 0.07));
      const hop = Math.abs(Math.sin((t - 22.4) * 7 + i)) * 40 * P(t, 22.4, 22.6);
      droplet(spots[i][0], spots[i][1] - hop, 0.62 * k, d.c, { happy: true, sq: -hop / 200, lx: (540 - spots[i][0]) / 500, ly: -0.6 });
    });
  }
  ctx.restore();
  // headline
  if (t > 21.25) {
    wordsRTL([{ w: 'فكرتك', color: '#fff' }, { w: 'تستاهل', color: '#fff' }], 540, 1210, 150, { fam: 'Lalezar' }, i => {
      const k = E.back(P(t, 21.3 + i * 0.28, 21.7 + i * 0.28));
      return { dy: (1 - k) * 90, s: k, a: clamp(k * 3), reg: 26 * (1 - E.out(P(t, 21.3 + i * .28, 21.9 + i * .28))) };
    });
    const k3 = E.out5(P(t, 21.95, 22.15));
    if (k3 > 0) {
      ctx.save(); ctx.translate(540, 1430); const sc = lerp(2.6, 1, k3); ctx.scale(sc, sc);
      ctx.globalCompositeOperation = 'source-over';
      regText('تنشاف', 0, 0, 260, 40 * (1 - E.out(P(t, 22.0, 22.6))) + 9, { color: COL.Y, alpha: clamp(k3 * 2), blend: 'screen' });
      ctx.restore();
      // flash
      const fl = 1 - P(t, 22.0, 22.25); if (fl > 0 && fl < 1) { ctx.fillStyle = `rgba(255,255,255,${fl * 0.45})`; ctx.fillRect(0, 0, W, H); }
    }
  }
}

/* ================================================================ SCENE 5 : products orbit → logo */
const LOGO5 = [540, 1000];
// end-card lockup sits higher so the tagline, phone and address clear the TikTok/Reels UI
const LOGO = [540, 780], LOGO_S = 0.9, EMBLEM_Y = LOGO[1] - 300 * LOGO_S;
function bgMagenta(t, spin = 1) {
  const g = ctx.createRadialGradient(540, 900, 50, 540, 900, 1300); g.addColorStop(0, '#FF2FA6'); g.addColorStop(1, '#8A0057');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(540, 820); ctx.rotate(t * 0.25 * spin); ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -1500); ctx.lineTo(90, -1500); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  halftone('#ffffff', 42, 7, t, 0.1, (x, y) => clamp(Math.hypot(x - 540, y - 900) / 1000));
}
function inkBurst(cx, cy, p, seed, scale = 1, t = 0) {
  if (p <= 0) return;
  const R = rng(seed);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.3, c = CMYK[i % 4] === COL.K ? (seed % 2 ? '#111118' : COL.C) : CMYK[i % 4];
    const d = (180 + R() * 300) * scale * E.out5(p), r = (60 + R() * 90) * scale * (0.3 + 0.7 * E.out(p));
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a + 0.25) * 60 * scale, cy + Math.sin(a + 0.25) * 60 * scale); ctx.lineTo(x, y); ctx.lineTo(cx + Math.cos(a - 0.25) * 60 * scale, cy + Math.sin(a - 0.25) * 60 * scale); ctx.fill();
    blobPath(x, y, r, 9, seed * 13 + i, 0.4, t); ctx.fill();
    for (let k = 0; k < 2; k++) { const dd = d * (1.25 + R() * .4) ; fillC(cx + Math.cos(a + (R() - .5) * .3) * dd, cy + Math.sin(a + (R() - .5) * .3) * dd * 1.1, r * (0.15 + R() * .15), c); }
  }
}
function scene5(t) {
  bgMagenta(t, 1 + P(t, 24, 26.6) * 4);
  const merge = P(t, 25.75, 26.6);
  const spinSpeed = 1.2 + E.in(P(t, 24, 26.6)) * 9;
  const angBase = (t - 24) * spinSpeed;
  const items = [];
  if (merge < 1) {
    for (let i = 0; i < 7; i++) {
      const a = angBase + i * TAU / 7 - Math.PI / 2;
      const intro = E.out(P(t, 24.0, 24.45));
      const rx = 400 * (1 - E.inBack(merge)) * lerp(1.6, 1, intro), ry = 230 * (1 - E.inBack(merge)) * lerp(1.6, 1, intro);
      const z = Math.sin(a);
      items.push({ i, a, x: LOGO5[0] + Math.cos(a) * rx, y: 900 + Math.sin(a) * ry, z, s: (0.5 + 0.18 * z) * (1 - merge * 0.85) });
    }
    items.sort((p, q) => p.z - q.z);
    for (const it of items) {
      // motion trail
      for (let g = 3; g >= 1; g--) {
        const a2 = it.a - g * 0.09 * spinSpeed / 3;
                ctx.globalAlpha = 0.12 * (4 - g) / 3;
        const ex = LOGO5[0] + Math.cos(a2) * 400 * (1 - E.inBack(merge)), ey = 900 + Math.sin(a2) * 230 * (1 - E.inBack(merge));
        fillC(ex, ey, 90 * it.s, '#fff');
      }
      ctx.globalAlpha = 1;
      product(it.i, it.x, it.y, it.s, 1, t, Math.cos(it.a) * 0.2);
    }
  }
  // flash + logo pop
  const lp = P(t, 26.55, 27.1);
  inkBurst(LOGO5[0], 700, P(t, 26.55, 27.2), 4, 0.95, 26.6);
  if (lp > 0) {
    glow(540, 760, 700, 'rgba(255,255,255,.35)');
    const k = E.back(lp);
    ctx.save(); ctx.translate(LOGO5[0], LOGO5[1]); ctx.scale(k, k); ctx.translate(-LOGO5[0], -LOGO5[1]);
    logo(LOGO5[0], LOGO5[1], 1, { c1: COL.K, c2: COL.C });
    ctx.restore();
  }
  const fl = 1 - P(t, 26.55, 26.8); if (fl > 0 && fl < 1) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
  // from idea → colour → result
  if (t > 26.8) {
    const ws = [{ w: 'من الفكرة', color: '#fff' }, { w: '←', color: COL.Y }, { w: 'للون', color: '#fff' }, { w: '←', color: COL.Y }, { w: 'للنتيجة', color: '#fff' }];
    const times = [26.85, 27.35, 27.45, 27.95, 28.05];
    wordsRTL(ws, 540, 1440, 66, { fam: 'Cairo', weight: '900', space: 0.3 }, i => { const k = E.back(P(t, times[i], times[i] + 0.3)); return { s: k, a: clamp(k * 2), dy: (1 - k) * 40 }; });
  }
}

/* ================================================================ SCENE 6 : freeze → hero end card */
function pinGlyph(x, y, s, col, hole) { // map pin, tip at (x, y + 44s)
  withT(x, y, s, 0, () => {
    ctx.beginPath(); ctx.moveTo(0, 44); ctx.bezierCurveTo(-8, 28, -32, 6, -32, -14); ctx.arc(0, -14, 32, Math.PI, 0); ctx.bezierCurveTo(32, 6, 8, 28, 0, 44); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    circle(0, -14, 12); ctx.fillStyle = hole; ctx.fill();
  });
}
function addressChip(t, y) {
  const ap = E.back(P(t, 31.5, 31.9));
  if (ap <= 0) return;
  const fs = Math.min(50, 50 * 680 / measure(ADDRESS, 50, 'Cairo', '800'));
  const tw = measure(ADDRESS, fs, 'Cairo', '800');
  const aw = tw + 160, ah = 116, right = 540 + aw / 2;
  // chip
  ctx.save(); ctx.translate(540, y); ctx.scale(ap, ap);
  rr(-aw / 2, -ah / 2, aw, ah, ah / 2); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke();
  ctx.restore();
  if (ap < 0.7) return;
  // pin bubble at the start of the (RTL) line; the pin drops in and bounces
  const ik = E.back(P(t, 31.6, 31.95));
  const drop = 1 - E.bounce(P(t, 31.65, 32.15));
  withT(right - 62, y, ik, 0, () => {
    circle(0, 0, 44); ctx.fillStyle = COL.M; ctx.fill();
    ctx.save(); circle(0, 0, 44); ctx.clip();
    pinGlyph(0, -4 - drop * 70, 0.72, '#fff', COL.M);
    ctx.restore();
  });
  // address reveals right → left, the Arabic reading direction
  const rv = E.io(P(t, 31.75, 32.3));
  if (rv > 0) {
    const tr = right - 118;
    ctx.save(); ctx.beginPath(); ctx.rect(tr - tw * rv - 4, y - ah / 2, tw * rv + 8, ah); ctx.clip();
    txt(ADDRESS, tr, y + 3, fs, { fam: 'Cairo', weight: '800', color: '#fff', align: 'right' });
    ctx.restore();
  }
}
function scene6(t) {
  ctx.fillStyle = '#0B0B10'; ctx.fillRect(0, 0, W, H);
  glow(540, EMBLEM_Y + 120, 800, 'rgba(236,0,140,.22)');
  glow(540, 1380, 700, 'rgba(0,174,239,.14)');
  halftone('#ffffff', 38, 3.2, t, 0.07, () => 1);
  cropMarks(E.out(P(t, 29.25, 29.8)), 'rgba(255,255,255,.5)');
  // CMYK registration swatches on the edge
  const sw = E.out(P(t, 29.4, 29.9));
  CMYK.forEach((c, i) => { rr(70, 640 + i * 70 - (1 - sw) * 60, 26, 50, 6); ctx.globalAlpha = sw; ctx.fillStyle = c === COL.K ? '#fff' : c; ctx.fill(); ctx.globalAlpha = 1; });
  // final ink burst from behind the logo
  const bp = P(t, 33.55, 34.25);
  const [shx, shy] = shake(t, 33.55, .45, 18);
  ctx.save(); ctx.translate(shx, shy);
  if (bp > 0) {
    const layer = offscreen(() => {
      inkBurst(540, EMBLEM_Y + 60, bp, 9, 1.25, 33.55 + bp * 0.2);
      inkBurst(540, EMBLEM_Y + 60, P(t, 33.62, 34.35), 12, 0.85, 33.6);
      // ink fades out under the wordmark so the tagline, phone and address stay readable
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createLinearGradient(0, 960, 0, 1060); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g; ctx.fillRect(0, 960, W, H - 960);
    });
    ctx.drawImage(layer, 0, 0);
  }
  logo(LOGO[0], LOGO[1], LOGO_S, { c1: COL.M, c2: COL.C, ringCol: 'rgba(255,255,255,.4)' });
  // shine across the wordmark
  const sh = P(t, 34.05, 34.6);
  if (sh > 0 && sh < 1) {
    const sx = lerp(260, 820, sh); sparkle(sx, LOGO[1] + 120 * LOGO_S, 40 * Math.sin(sh * Math.PI), '#fff');
  }
  ctx.restore();
  // tagline
  const tw = [{ w: 'نطبع' }, { w: 'فكرتك...' }, { w: 'ونخليها' }, { w: 'تنشاف.', color: COL.Y }];
  wordsRTL(tw, 540, 1100, 70, { fam: 'Cairo', weight: '800', color: '#fff' }, i => {
    const k = E.out(P(t, 29.55 + i * 0.16, 29.95 + i * 0.16)); return { dy: (1 - k) * 50, a: k };
  });
  // underline in CMYK
  const ul = E.io(P(t, 30.2, 30.7));
  if (ul > 0) CMYK.forEach((c, i) => { ctx.fillStyle = c === COL.K ? '#fff' : c; ctx.fillRect(540 - 220 + i * 110, 1158, 110 * clamp(ul * 4 - i), 8); });
  addressChip(t, 1495);
  // phone pill
  const pp = E.back(P(t, 30.5, 30.95));
  if (pp > 0) {
    const pw = 860, ph = 190, py = 1295;
    ctx.save(); ctx.translate(540, py); ctx.scale(pp, 1);
    rr(-pw / 2 + 12, -ph / 2 + 14, pw, ph, ph / 2); ctx.fillStyle = COL.M; ctx.fill();
    rr(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    if (pp > 0.8) {
      // phone icon bubble
      const ik = E.back(P(t, 30.75, 31.1));
      withT(540 - pw / 2 + 95, py, ik, Math.sin(Math.max(0, t - 31.2) * 18) * 0.15 * (1 - P(t, 31.2, 32)), () => {
        circle(0, 0, 70); ctx.fillStyle = COL.C; ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-26, -34); ctx.quadraticCurveTo(-38, 10, 20, 38); ctx.lineTo(32, 22); ctx.lineTo(14, 8); ctx.lineTo(4, 16); ctx.quadraticCurveTo(-12, 4, -14, -12); ctx.lineTo(-4, -20); ctx.lineTo(-12, -40); ctx.closePath(); ctx.fill();
      });
      // digits type on, left-to-right
      const digits = PHONE.split('');
      ctx.save(); ctx.font = font(104, 'Cairo', '900'); ctx.direction = 'ltr';
      const widths = digits.map(d => ctx.measureText(d).width); const tot = widths.reduce((a, b) => a + b, 0);
      ctx.restore();
      let xx = 540 + 80 - tot / 2;
      digits.forEach((d, i) => {
        const k = E.back(P(t, 30.8 + i * 0.07, 31.05 + i * 0.07));
        if (k > 0) withT(xx + widths[i] / 2, py + 6, k, 0, () => txt(d, 0, 0, 104, { fam: 'Cairo', weight: '900', color: COL.K, dir: 'ltr' }));
        xx += widths[i];
      });
    }
  }
  // fade-in from freeze flash
  const fl = 1 - P(t, 29.0, 29.25); if (fl > 0 && fl < 1) { ctx.fillStyle = `rgba(255,255,255,${fl * 0.9})`; ctx.fillRect(0, 0, W, H); }
  // final white flash on the burst
  const f2 = 1 - P(t, 33.55, 33.8); if (f2 > 0 && f2 < 1) { ctx.fillStyle = `rgba(255,255,255,${f2 * 0.5})`; ctx.fillRect(0, 0, W, H); }
}

/* ================================================================ transitions + master */
function inkWipe(t, t0, dur) { // four CMYK diagonal bands sweep across
  const cols = [COL.C, COL.M, COL.Y, '#101017'];
  cols.forEach((c, i) => {
    const p = E.io(P(t, t0 + i * 0.07, t0 + i * 0.07 + dur));
    if (p <= 0) return;
    ctx.save(); ctx.translate(540, 960); ctx.rotate(-0.4);
    const x = lerp(1700, -1700 * (i === 3 ? 0 : 1), p);
    ctx.fillStyle = c; ctx.fillRect(x - 1100, -1600, 2200, 3200);
    ctx.restore();
  });
}
function render(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
  if (t < 8.75) scene12(t);
  if (t >= 8.2 && t < 17.25) {
    if (t < 8.75) { // iris open from portal centre
      const r = 1500 * E.in(P(t, 8.2, 8.75));
      ctx.save(); circle(PORTAL[0], PORTAL[1], r); ctx.clip(); sceneWorld(t); ctx.restore();
      ctx.save(); ctx.lineWidth = 40; CMYK.forEach((c, i) => { circle(PORTAL[0], PORTAL[1], r + i * 40); ctx.strokeStyle = c; ctx.stroke(); }); ctx.restore();
    } else sceneWorld(t);
    if (t > 16.75) inkWipe(t, 16.75, 0.45);
  }
  if (t >= 17.25 && t < 24.05) scene4(t);
  if (t >= 23.8 && t < 24.25) { // radial burst transition
    const p = P(t, 23.8, 24.15);
    if (t >= 24.05) scene5(t);
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const r = 1500 * E.out(P(t, 23.84, 24.2));
    CMYK.forEach((c, i) => { if (r - i * 110 < 60) return; ctx.lineWidth = 120; circle(540, 1000, r - i * 110); ctx.strokeStyle = c === COL.K ? '#fff' : c; ctx.globalAlpha = 1 - P(t, 24.05, 24.25); ctx.stroke(); });
    ctx.restore();
  } else if (t >= 24.05 && t < 29.0) scene5(t);
  if (t >= 29.0) scene6(t);
}
window.render = render;
window.ready = (async () => {
  await Promise.all(['Lalezar', 'Cairo'].flatMap(f => [
    document.fonts.load(`900 50px ${f}`, 'ألوان مطبعة تحچي 0123456789'),
    document.fonts.load(`800 50px ${f}`, 'ألوان'), document.fonts.load(`50px ${f}`, 'ألوان ABC 07719287567'),
  ]));
  await document.fonts.load('800 50px Cairo', ADDRESS + ' 0123');
  await document.fonts.ready;
  return true;
})();
