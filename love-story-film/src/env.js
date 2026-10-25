// Environments: skies, the Law Center gate, corridor, campus, map, Baghdad,
// Tikrit, interiors. All in 1920x1080 world units.
'use strict';

function cloud(ctx, x, y, s, a = .85, col = '#ffffff') {
  ctx.fillStyle = rgba(col, a);
  [[0, 0, 60], [52, -22, 52], [104, 0, 56], [-52, 8, 40], [154, 10, 38], [50, 18, 50]].forEach(([dx, dy, r]) => {
    ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill();
  });
}
function frond(ctx, a, len, col) {
  ctx.save(); ctx.rotate(a); if (Math.cos(a) < 0) ctx.scale(1, -1);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .5, -len * .2, len, len * .3);
  ctx.quadraticCurveTo(len * .45, len * .06, 0, 0); ctx.fill();
  ctx.restore();
}
function palm(ctx, x, y, h, t, o = {}) {
  ctx.save(); ctx.translate(x, y);
  const sway = Math.sin(t * .8 + x * .01) * .025;
  const tx = h * .05 + sway * h;
  ctx.strokeStyle = o.sil || o.trunk || '#7a5a3a'; ctx.lineWidth = h * .055; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(h * .1, -h * .5, tx, -h); ctx.stroke();
  if (!o.sil) {
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2;
    for (let i = 1; i < 10; i++) { const u = i / 10, px = lerp(0, tx, u) + Math.sin(u * 3) * h * .03, py = -h * u; ctx.beginPath(); ctx.moveTo(px - h * .025, py); ctx.lineTo(px + h * .025, py - 3); ctx.stroke(); }
  }
  ctx.translate(tx, -h);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i - 4.5) * .36 + Math.sin(t * 1.1 + i + x) * .045;
    frond(ctx, a, h * (.38 + R(i, 3) * .1), o.sil || (i % 2 ? (o.col || '#2f5d34') : (o.col2 || '#3d7440')));
  }
  if (!o.sil) { ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(0, 4, h * .03, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function treeRound(ctx, x, y, h, t, cols = ['#5e8a3a', '#7aa44a', '#9cbf5a'], trunk = '#6b4c34') {
  ctx.fillStyle = trunk; ctx.fillRect(x - h * .035, y - h * .5, h * .07, h * .5);
  const blobs = [[0, -.7, .3], [-.22, -.58, .22], [.22, -.6, .24], [-.1, -.86, .22], [.14, -.84, .2]];
  blobs.forEach(([dx, dy, r], i) => {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.arc(x + dx * h + Math.sin(t * 1.2 + i + x) * 3, y + dy * h, r * h, 0, TAU); ctx.fill();
  });
}
function lamp(ctx, x, y, h, on = 0, col = '#ffd27a') {
  ctx.fillStyle = '#2e2a2c'; ctx.fillRect(x - 4, y - h, 8, h);
  ctx.fillRect(x - 14, y - h - 6, 28, 8);
  ctx.fillStyle = on ? '#fff1c4' : '#e8e2d2'; rrect(ctx, x - 11, y - h - 34, 22, 30, 6); ctx.fill();
  if (on) glow(ctx, x, y - h - 20, 120, col, .55 * on);
}

// ---------------------------------------------------------------- scene 1-2
function skyDay(ctx, t) {
  fillRect(ctx, vgrad(ctx, 0, 700, [[0, '#78b7e3'], [.55, '#bfe0f2'], [1, '#fde9cf']]));
  glow(ctx, 1560, 120, 560, '#fff6dc', .95);
  for (let i = 0; i < 6; i++) {
    const x = (R(i, 5) * 2600 + t * 9 * (.5 + R(i, 6))) % 2600 - 300, y = 80 + R(i, 7) * 200;
    cloud(ctx, x, y, .55 + R(i, 8) * .7, .78);
  }
}
const LC = { stone: '#ecdcbc', stoneSh: '#d6c19a', trim: '#c9b088', glass: '#8fb4c9' };
function lawCenter(ctx, t) {
  // wings
  ctx.fillStyle = LC.stone; ctx.fillRect(170, 330, 1580, 312);
  ctx.fillStyle = LC.trim; ctx.fillRect(158, 316, 1604, 20); ctx.fillRect(170, 466, 1580, 8);
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(170, 336, 1580, 10);
  // windows
  for (const side of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
    const x = side < 0 ? 220 + c * 92 : 1268 + c * 92, y = 362 + r * 130;
    ctx.fillStyle = '#c3ab83'; ctx.fillRect(x - 6, y - 6, 62, 92);
    const g = ctx.createLinearGradient(x, y, x + 50, y + 80); g.addColorStop(0, '#cfe6f2'); g.addColorStop(.5, LC.glass); g.addColorStop(1, '#5d7f96');
    ctx.fillStyle = g; ctx.fillRect(x, y, 50, 80);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 4, y + 4, 8, 72);
    ctx.fillStyle = '#c3ab83'; ctx.fillRect(x + 23, y, 4, 80);
  }
  // central block
  ctx.fillStyle = LC.stone; ctx.fillRect(690, 196, 540, 446);
  ctx.fillStyle = LC.trim; ctx.fillRect(676, 182, 568, 22);
  ctx.beginPath(); ctx.moveTo(676, 184); ctx.lineTo(960, 120); ctx.lineTo(1244, 184); ctx.closePath(); ctx.fillStyle = LC.stone; ctx.fill();
  ctx.strokeStyle = LC.trim; ctx.lineWidth = 8; ctx.stroke();
  // columns
  for (const x of [712, 790, 1100, 1178]) {
    ctx.fillStyle = '#f4e8d0'; ctx.fillRect(x, 300, 30, 340);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + 20, 300, 10, 340);
    ctx.fillStyle = LC.trim; ctx.fillRect(x - 6, 292, 42, 12); ctx.fillRect(x - 6, 628, 42, 12);
  }
  // arch gate
  ctx.fillStyle = '#c7ad83';
  ctx.beginPath(); ctx.moveTo(846, 642); ctx.lineTo(846, 470); ctx.arc(960, 470, 114, Math.PI, 0); ctx.lineTo(1074, 642); ctx.closePath(); ctx.fill();
  const ig = ctx.createLinearGradient(0, 360, 0, 642); ig.addColorStop(0, '#5b4636'); ig.addColorStop(1, '#2a1f1a');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.moveTo(862, 642); ctx.lineTo(862, 472); ctx.arc(960, 472, 98, Math.PI, 0); ctx.lineTo(1058, 642); ctx.closePath(); ctx.fill();
  glow(ctx, 960, 560, 160, '#ffcf8a', .35);
  ctx.strokeStyle = 'rgba(255,220,170,.35)'; ctx.lineWidth = 3;
  for (const x of [912, 960, 1008]) { ctx.beginPath(); ctx.moveTo(x, 470); ctx.lineTo(x, 642); ctx.stroke(); }
  // plaque
  ctx.fillStyle = '#21324f'; rrect(ctx, 742, 222, 436, 70, 10); ctx.fill();
  ctx.strokeStyle = GOLD[1]; ctx.lineWidth = 3; rrect(ctx, 750, 230, 420, 54, 7); ctx.stroke();
  textAR(ctx, 'سنتر القانون', 960, 258, { size: 40, font: FONT_BODY, color: '#f6e3a8', shadow: false });
  // steps
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#e2cfac' : '#d7c29c'; ctx.fillRect(820 - i * 20, 642 + i * 9, 280 + i * 40, 9); }
}
function walkway(ctx, t, speed) {
  fillRect(ctx, '#a3c477', 0, 640, W, 440);
  ctx.fillStyle = '#93b86a'; ctx.fillRect(0, 640, W, 30);
  // perspective path
  ctx.fillStyle = '#e6d6b6';
  ctx.beginPath(); ctx.moveTo(780, 668); ctx.lineTo(1140, 668); ctx.lineTo(2300, 1090); ctx.lineTo(-380, 1090); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(150,120,80,.35)'; ctx.lineWidth = 2;
  const f = (t * speed) % 1, N = 12;
  for (let k = 0; k < N + 1; k++) {
    const u = (k + f) / N, y = 668 + 422 * Math.pow(u, 2.1);
    ctx.lineWidth = 1 + u * 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = -6; i <= 6; i++) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(960 + i * 30, 668); ctx.lineTo(960 + i * 225, 1090); ctx.stroke(); }
  ctx.restore();
  // hedges
  ctx.fillStyle = '#5f8a44';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(960 + s * 190, 668); ctx.lineTo(960 + s * 1250, 1090); ctx.lineTo(960 + s * 1500, 1090); ctx.lineTo(960 + s * 240, 662); ctx.closePath(); ctx.fill();
  }
}
// side-view pavement used in scene 2
function pavementSide(ctx, y0 = 860) {
  fillRect(ctx, vgrad(ctx, y0, H, [[0, '#e3d2b0'], [1, '#d2bd96']]), 0, y0, W, H - y0 + 60);
  ctx.strokeStyle = 'rgba(140,110,70,.25)'; ctx.lineWidth = 2;
  for (let x = -200; x < W + 200; x += 140) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - 120, H); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, y0 + 70); ctx.lineTo(W, y0 + 70); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, y0, W, 4);
}

// ---------------------------------------------------------------- scene 4 corridor
function corridor(ctx, t, doorOpen = 0) {
  fillRect(ctx, '#f5efe4', 0, 0, W, 130);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fffdf6'; rrect(ctx, 160 + i * 460, 44, 220, 26, 6); ctx.fill(); glow(ctx, 270 + i * 460, 70, 260, '#fff4d8', .35); }
  fillRect(ctx, vgrad(ctx, 120, 820, [[0, '#efe5d2'], [1, '#e2d3b8']]), 0, 120, W, 700);
  ctx.fillStyle = '#d9c7a6'; ctx.fillRect(0, 120, W, 12);
  // wainscot
  ctx.fillStyle = '#b08f6c'; ctx.fillRect(0, 650, W, 170);
  ctx.fillStyle = '#9c7b59'; ctx.fillRect(0, 650, W, 10);
  ctx.strokeStyle = 'rgba(70,45,25,.25)'; ctx.lineWidth = 2;
  for (let x = 20; x < W; x += 150) { ctx.strokeRect(x, 676, 120, 120); }
  // windows with light shafts (left)
  for (let i = 0; i < 2; i++) {
    const x = 120 + i * 250;
    ctx.fillStyle = '#c9b493'; ctx.fillRect(x - 10, 200, 190, 380);
    const g = ctx.createLinearGradient(x, 210, x + 170, 570); g.addColorStop(0, '#e6f4fb'); g.addColorStop(1, '#a9cfe2');
    ctx.fillStyle = g; ctx.fillRect(x, 210, 170, 360);
    ctx.fillStyle = '#c9b493'; ctx.fillRect(x + 82, 210, 6, 360); ctx.fillRect(x, 380, 170, 6);
  }
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 2; i++) {
    const x = 120 + i * 250, a = .16 + .04 * Math.sin(t * .7 + i);
    const g = ctx.createLinearGradient(x, 300, x + 500, 1080); g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 210); ctx.lineTo(x + 170, 210); ctx.lineTo(x + 720, 1080); ctx.lineTo(x + 300, 1080); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // notice board
  ctx.fillStyle = '#7a5838'; ctx.fillRect(690, 320, 290, 210);
  ctx.fillStyle = '#c99a63'; ctx.fillRect(700, 330, 270, 190);
  [[720, 350, '#ffffff'], [800, 345, '#fff4b8'], [880, 360, '#ffffff'], [740, 430, '#d8ecff'], [850, 440, '#ffffff']].forEach(([x, y, c], i) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate((R(i, 2) - .5) * .12); ctx.fillStyle = c; ctx.fillRect(0, 0, 66, 70);
    ctx.fillStyle = 'rgba(60,60,90,.35)'; for (let k = 0; k < 4; k++) ctx.fillRect(8, 14 + k * 12, 48 - (k % 2) * 14, 3);
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(33, 4, 4, 0, TAU); ctx.fill(); ctx.restore();
  });
  // exam hall door
  ctx.fillStyle = '#6a4a32'; ctx.fillRect(1170, 290, 340, 530);
  const dg = ctx.createLinearGradient(1180, 0, 1500, 0); dg.addColorStop(0, '#8a603f'); dg.addColorStop(1, '#6e4a30');
  const op = easeIO(doorOpen);
  glow(ctx, 1340, 560, 300 * op, '#fff1cc', op);
  ctx.fillStyle = `rgba(255,243,214,${op})`; ctx.fillRect(1184, 304, 312, 516);
  ctx.fillStyle = dg;
  ctx.fillRect(1184, 304, 154 * (1 - op * .8), 516);
  ctx.fillRect(1342 + 154 * op * .8, 304, 154 * (1 - op * .8), 516);
  ctx.fillStyle = '#d7e9f3';
  if (op < .5) { ctx.fillRect(1214, 340, 90, 120); ctx.fillRect(1376, 340, 90, 120); }
  ctx.fillStyle = GOLD[2]; ctx.fillRect(1318, 560, 8, 40); ctx.fillRect(1356, 560, 8, 40);
  ctx.fillStyle = '#1f2f4f'; rrect(ctx, 1160, 210, 360, 64, 8); ctx.fill();
  ctx.strokeStyle = GOLD[1]; ctx.lineWidth = 2; rrect(ctx, 1166, 216, 348, 52, 6); ctx.stroke();
  textAR(ctx, 'قاعة الامتحان', 1340, 243, { size: 34, font: FONT_BODY, color: '#f6e3a8', shadow: false });
  // floor
  fillRect(ctx, vgrad(ctx, 820, H, [[0, '#d2bf9f'], [1, '#b9a07c']]), 0, 820, W, 300);
  ctx.strokeStyle = 'rgba(120,90,60,.25)'; ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) { const y = 820 + Math.pow(k / 6, 1.6) * 260; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let i = -8; i < 9; i++) { ctx.beginPath(); ctx.moveTo(960 + i * 140, 820); ctx.lineTo(960 + i * 260, H); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(1184, 830, 312, 60);
}

// ---------------------------------------------------------------- scene 5
function campus(ctx, t, camX, blue) {
  fillRect(ctx, vgrad(ctx, 0, 760, [[0, mix('#f3c27f', '#2c4a7a', blue)], [.7, mix('#fbe2b8', '#7f9cc6', blue)], [1, mix('#ffeccc', '#a9bcd8', blue)]]));
  glow(ctx, 1500, 260, 520, mix('#fff2cc', '#cfe0ff', blue), .8 - blue * .4);
  // far buildings
  const bx = -camX * .2;
  for (let i = 0; i < 9; i++) {
    const x = ((bx + i * 300) % 2700 + 2700) % 2700 - 400, h = 180 + R(i, 3) * 160, w = 220 + R(i, 4) * 80;
    ctx.fillStyle = mix('#e7d1a8', '#5e7397', blue); ctx.fillRect(x, 700 - h, w, h);
    ctx.fillStyle = mix('#cdb184', '#4b5f82', blue);
    for (let r = 0; r < Math.floor(h / 60) - 1; r++) for (let c = 0; c < 4; c++) ctx.fillRect(x + 20 + c * (w - 40) / 4, 700 - h + 30 + r * 60, 24, 34);
    if (i % 4 === 1) { ctx.fillStyle = mix('#e7d1a8', '#5e7397', blue); ctx.fillRect(x + w / 2 - 30, 700 - h - 140, 60, 140); ctx.beginPath(); ctx.arc(x + w / 2, 700 - h - 140, 30, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff7e2'; ctx.beginPath(); ctx.arc(x + w / 2, 700 - h - 90, 18, 0, TAU); ctx.fill(); }
  }
  // lawn + path
  fillRect(ctx, mix('#9cbf62', '#3e5a6e', blue), 0, 700, W, 400);
  fillRect(ctx, vgrad(ctx, 840, H, [[0, mix('#e8d6b2', '#7b8aa6', blue)], [1, mix('#d6be95', '#5d6a86', blue)]]), 0, 850, W, 240);
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2;
  for (let x = ((-camX) % 160 + 160) % 160 - 160; x < W + 160; x += 160) { ctx.beginPath(); ctx.moveTo(x, 850); ctx.lineTo(x - 70, H); ctx.stroke(); }
  // trees mid
  const tx = -camX * .55;
  for (let i = 0; i < 7; i++) {
    const x = ((tx + i * 380) % 2660 + 2660) % 2660 - 300;
    treeRound(ctx, x, 860, 430 + R(i, 9) * 80, t, [mix('#6f9a3e', '#2f4b63', blue), mix('#8db352', '#3c5f7a', blue), mix('#b5c95e', '#4d7090', blue)], mix('#6b4c34', '#2d3446', blue));
  }
}
// ---------------------------------------------------------------- map of Iraq
const IRAQ = [[42.35, 37.1], [43.2, 37.35], [44.2, 37.25], [44.8, 37.15], [45.0, 36.75], [45.45, 36.3], [45.9, 35.85], [46.15, 35.3], [45.95, 35.05], [45.65, 34.6], [45.5, 34.05], [45.8, 33.6], [46.1, 33.05], [46.95, 32.65], [47.5, 32.3], [47.85, 31.75], [47.7, 31.0], [48.05, 30.45], [48.55, 29.95], [48.0, 29.95], [47.6, 30.05], [47.15, 29.95], [46.55, 29.1], [44.7, 29.2], [42.1, 31.1], [40.4, 31.95], [39.2, 32.15], [38.8, 33.38], [40.0, 33.85], [41.0, 34.4], [41.25, 35.4], [41.35, 36.4], [41.85, 36.8], [42.35, 37.1]];
const TIGRIS = [[42.45, 37.1], [42.9, 36.7], [43.13, 36.34], [43.28, 35.6], [43.45, 35.1], [43.69, 34.6], [43.87, 34.2], [44.2, 33.7], [44.39, 33.32], [44.9, 32.9], [45.8, 32.5], [46.5, 32.1], [47.15, 31.85], [47.43, 31.0], [47.8, 30.5], [48.5, 29.95]];
const CITY = { tikrit: [43.68, 34.6], baghdad: [44.36, 33.31] };
function geo(p) { return [960 + (p[0] - 43.7) * 98, 540 + (33.25 - p[1]) * 98 * 1.18]; }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = geo(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); }

// ---------------------------------------------------------------- scene 6 Baghdad sunset
const SKY_SUNSET = [[0, '#26214d'], [.45, '#76386c'], [.78, '#e57249'], [1, '#ffc477']];
function baghdadSunset(ctx, t) {
  fillRect(ctx, vgrad(ctx, 0, 650, SKY_SUNSET), 0, 0, W, 660);
  glow(ctx, 1300, 590, 900, '#ff9a55', .55);
  ctx.fillStyle = '#ffe0a8'; ctx.beginPath(); ctx.arc(1300, 600, 62, 0, TAU); ctx.fill();
  glow(ctx, 1300, 600, 240, '#fff0c8', .7);
  for (let i = 0; i < 5; i++) { const x = (R(i, 41) * 2400 + t * 6) % 2400 - 250; ctx.fillStyle = rgba('#ffb38a', .25); ellipse(ctx, x, 180 + R(i, 42) * 260, 220 + R(i, 43) * 160, 14 + R(i, 44) * 10); ctx.fill(); }
  // skyline
  ctx.fillStyle = '#3e2340';
  ctx.fillRect(0, 586, W, 56);
  for (let i = 0; i < 42; i++) {
    const x = i * 48 - 20 + R(i, 51) * 20, w = 30 + R(i, 52) * 50, h = 70 + R(i, 53) * 110;
    ctx.fillRect(x, 640 - h, w, h + 2);
  }
  // domes & minarets
  [[300, 70], [880, 90], [1620, 64]].forEach(([x, r]) => { ctx.fillRect(x - r, 640 - r * 1.1, r * 2, r * 1.1); ctx.beginPath(); ctx.arc(x, 640 - r * 1.1, r * .9, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 2, 640 - r * 2.25, 4, 30); });
  [[200, 240], [410, 220], [800, 260], [990, 250], [1700, 230]].forEach(([x, h]) => { ctx.fillRect(x - 7, 640 - h, 14, h); ctx.fillRect(x - 11, 640 - h * .78, 22, 8); ctx.beginPath(); ctx.moveTo(x - 7, 640 - h); ctx.lineTo(x, 640 - h - 26); ctx.lineTo(x + 7, 640 - h); ctx.fill(); });
  // Baghdad tower
  ctx.fillRect(560, 340, 12, 300); ctx.beginPath(); ctx.ellipse(566, 360, 28, 20, 0, 0, TAU); ctx.fill(); ctx.fillRect(564, 290, 4, 60);
  // city lights
  for (let i = 0; i < 90; i++) {
    const x = R(i, 61) * W, y = 560 + R(i, 62) * 76, tw = .5 + .5 * Math.sin(t * (1 + R(i, 63) * 2) + i);
    ctx.fillStyle = rgba(R(i, 64) > .5 ? '#ffd38a' : '#fff1d0', .55 + .4 * tw); ctx.fillRect(x, y, 3, 3);
  }
}
function tigrisWater(ctx, t, y0 = 640, y1 = 900, sunX = 1300) {
  fillRect(ctx, vgrad(ctx, y0, y1, [[0, '#d9764e'], [.35, '#7a3f62'], [1, '#2a1f45']]), 0, y0, W, y1 - y0);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 70; i++) {
    const y = y0 + 6 + Math.pow(R(i, 71), 1.4) * (y1 - y0 - 10);
    const w = 20 + R(i, 72) * 140 * (1 - (y - y0) / (y1 - y0) * .4);
    const x = sunX + (R(i, 73) - .5) * 260 * (1 + (y - y0) / 200) + Math.sin(t * 1.4 + i) * 16;
    ctx.fillStyle = rgba('#ffd59a', (.35 + .35 * Math.sin(t * 3 + i * 1.7)) * (1 - (y - y0) / (y1 - y0) * .6));
    ctx.fillRect(x - w / 2, y, w, 3);
  }
  for (let i = 0; i < 40; i++) {
    const x = R(i, 81) * W, y = y0 + 8 + R(i, 82) * 60;
    ctx.fillStyle = rgba('#ffcf80', .28 + .2 * Math.sin(t * 2 + i));
    ctx.fillRect(x + Math.sin(t * 2 + i) * 3, y, 2.5, 18 + R(i, 83) * 40);
  }
  ctx.restore();
}
function ahrarBridge(ctx, t, tw) {
  const deck = 548;
  ctx.fillStyle = '#3a2138';
  for (let x = 40; x < W; x += 330) { ctx.fillRect(x - 13, deck + 14, 26, 112); }
  // arches
  ctx.strokeStyle = '#7b6e98'; ctx.lineWidth = 7;
  for (let x = 40; x < W; x += 330) {
    ctx.beginPath(); ctx.moveTo(x, deck); ctx.quadraticCurveTo(x + 165, deck - 120, x + 330, deck); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (let k = 1; k < 8; k++) { const u = k / 8, ax = x + u * 330, ay = deck - 4 * 60 * u * (1 - u) * 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, deck); ctx.stroke(); }
    ctx.lineWidth = 7;
  }
  ctx.fillStyle = '#4a2f4a'; ctx.fillRect(-20, deck, W + 40, 18);
  ctx.fillStyle = '#6b4f78'; ctx.fillRect(-20, deck - 4, W + 40, 5);
  // lamps
  for (let x = 95; x < W; x += 110) { ctx.fillStyle = '#2b1a2c'; ctx.fillRect(x - 2, deck - 34, 4, 34); glow(ctx, x, deck - 36, 34, '#ffc070', .8); ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(x, deck - 36, 3.5, 0, TAU); ctx.fill(); }
  // traffic
  for (let i = 0; i < 12; i++) {
    const x1 = ((R(i, 91) * 2300 + tw * (120 + R(i, 92) * 60)) % 2300) - 180;
    glow(ctx, x1, deck - 6, 26, '#fff4dc', .7); ctx.fillStyle = '#ffffff'; ctx.fillRect(x1 - 3, deck - 8, 6, 3);
    const x2 = 2120 - ((R(i, 93) * 2300 + tw * (110 + R(i, 94) * 60)) % 2300);
    glow(ctx, x2, deck - 4, 22, '#ff4b3a', .7); ctx.fillStyle = '#ff6b5a'; ctx.fillRect(x2 - 3, deck - 6, 6, 3);
  }
  // pedestrians
  for (let i = 0; i < 6; i++) {
    const x = ((R(i, 95) * 2100 + tw * (18 + R(i, 96) * 10) * (i % 2 ? 1 : -1)) % 2100 + 2100) % 2100 - 90;
    drawPerson(ctx, i % 3 === 0 ? 'friend' : i % 3 === 1 ? 'guy' : 'girl', { x, y: deck - 2, s: .085, sil: '#2a1730', walk: tw * 5 + i, dir: i % 2 ? 1 : -1, t: tw });
  }
}
function promenade(ctx, y = 880) {
  fillRect(ctx, vgrad(ctx, y + 30, H, [[0, '#6e4148'], [1, '#3b2430']]), 0, y + 30, W, H - y);
  ctx.fillStyle = 'rgba(255,190,120,.12)'; ctx.fillRect(0, y + 30, W, 30);
  // balustrade
  ctx.fillStyle = '#b3876f';
  for (let x = -10; x < W + 20; x += 38) { ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.quadraticCurveTo(x - 8, y + 10, x, y - 6); ctx.lineTo(x + 14, y - 6); ctx.quadraticCurveTo(x + 22, y + 10, x + 14, y + 30); ctx.fill(); }
  fillRect(ctx, vgrad(ctx, y - 30, y - 6, [[0, '#f0b98a'], [1, '#9c6b5c']]), 0, y - 28, W, 24);
  ctx.fillStyle = '#7c5550'; ctx.fillRect(0, y + 26, W, 8);
}

// ---------------------------------------------------------------- dusk river (scene 7)
function duskRiver(ctx, t, camX) {
  fillRect(ctx, vgrad(ctx, 0, 620, [[0, '#1b1636'], [.5, '#55305d'], [.85, '#d0704f'], [1, '#f2a564']]), 0, 0, W, 630);
  glow(ctx, 960, 620, 700, '#ff9b5c', .5);
  for (let i = 0; i < 60; i++) { const x = R(i, 31) * W, y = R(i, 32) * 300; ctx.fillStyle = rgba('#fff4dc', .5 * (.5 + .5 * Math.sin(t * 2 + i))); ctx.fillRect(x, y, 2, 2); }
  // far bank
  ctx.fillStyle = '#2b1730'; ctx.fillRect(0, 590, W, 34);
  const fx = -camX * .2;
  for (let i = 0; i < 16; i++) { const x = ((fx + i * 160) % 2560 + 2560) % 2560 - 320; palm(ctx, x, 612, 90 + R(i, 33) * 50, t, { sil: '#2b1730' }); }
  fillRect(ctx, vgrad(ctx, 620, 830, [[0, '#c9694e'], [.4, '#5d3058'], [1, '#1d1430']]), 0, 620, W, 210);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 40; i++) { const y = 626 + R(i, 34) * 190, x = 960 + (R(i, 35) - .5) * 700 + Math.sin(t + i) * 10; ctx.fillStyle = rgba('#ffc58a', .3 * (1 - (y - 620) / 210)); ctx.fillRect(x, y, 30 + R(i, 36) * 120, 2.5); }
  ctx.restore();
  // near bank
  ctx.fillStyle = '#120a14'; ctx.fillRect(0, 820, W, 280);
  const nx = -camX;
  ctx.beginPath(); ctx.moveTo(0, 830);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 822 + Math.sin((x - nx) * .02) * 6);
  ctx.lineTo(W, 900); ctx.lineTo(0, 900); ctx.fill();
  for (let i = 0; i < 6; i++) { const x = ((nx * 1.3 + i * 520) % 3120 + 3120) % 3120 - 400; palm(ctx, x, 850, 230 + R(i, 37) * 80, t, { sil: '#1a0f1c' }); }
  glow(ctx, 960, 760, 380, '#ff9b5c', .35);
}

// ---------------------------------------------------------------- scene 8
function car(ctx, x, y, t, o = {}) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ellipse(ctx, 0, 6, 210, 12); ctx.fill();
  ctx.fillStyle = o.col || '#ece6dc';
  ctx.beginPath(); ctx.moveTo(-200, -20); ctx.quadraticCurveTo(-204, -62, -170, -66); ctx.lineTo(-100, -70); ctx.quadraticCurveTo(-70, -122, -10, -124); ctx.lineTo(70, -122); ctx.quadraticCurveTo(110, -118, 140, -72); ctx.lineTo(190, -64); ctx.quadraticCurveTo(212, -58, 210, -20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-200, -40, 410, 20);
  // windows
  const wg = ctx.createLinearGradient(0, -118, 0, -72); wg.addColorStop(0, '#5a6c8f'); wg.addColorStop(1, '#2a3550');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.moveTo(-86, -74); ctx.quadraticCurveTo(-62, -114, -14, -116); ctx.lineTo(18, -116); ctx.lineTo(18, -74); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(28, -74); ctx.lineTo(28, -116); ctx.lineTo(66, -115); ctx.quadraticCurveTo(100, -110, 124, -74); ctx.closePath(); ctx.fill();
  // passenger (her silhouette with long hair) in rear window
  if (o.girl) {
    ctx.save(); ctx.beginPath(); ctx.moveTo(-86, -74); ctx.quadraticCurveTo(-62, -114, -14, -116); ctx.lineTo(18, -116); ctx.lineTo(18, -74); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#1a1420'; ctx.beginPath(); ctx.arc(-24, -92, 15, 0, TAU); ctx.fill(); ctx.fillRect(-42, -92, 34, 30);
    ctx.fillStyle = '#e9c6ad'; ctx.beginPath(); ctx.arc(-18, -90, 11, -.6, 1.3); ctx.fill();
    ctx.restore();
  }
  // lights
  ctx.fillStyle = '#ffe9b0'; ctx.fillRect(196, -54, 12, 10); glow(ctx, 230, -48, 90, '#fff0c0', .6);
  ctx.fillStyle = '#d7263d'; ctx.fillRect(-204, -54, 10, 12); glow(ctx, -210, -48, 50, '#ff3045', .5);
  // wheels
  for (const wx of [-122, 128]) {
    ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(wx, -18, 34, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9ea3ad'; ctx.beginPath(); ctx.arc(wx, -18, 18, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a5f6a'; ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) { const a = -t * 9 + k * TAU / 5; ctx.beginPath(); ctx.moveTo(wx, -18); ctx.lineTo(wx + Math.cos(a) * 17, -18 + Math.sin(a) * 17); ctx.stroke(); }
  }
  ctx.restore();
}
function roadDusk(ctx, t, camX) {
  fillRect(ctx, vgrad(ctx, 0, 700, [[0, '#2f3d6e'], [.6, '#8a6a8c'], [1, '#f0a36a']]), 0, 0, W, 710);
  glow(ctx, 1600, 690, 700, '#ffb26b', .55);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = rgba('#ffffff', .4 * (.5 + .5 * Math.sin(t * 2 + i))); ctx.fillRect(R(i, 21) * W, R(i, 22) * 260, 2, 2); }
  // hills
  ctx.fillStyle = '#5b4660';
  ctx.beginPath(); ctx.moveTo(0, 700);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 650 - Math.sin((x + camX * .08) * .004) * 40 - Math.sin((x + camX * .08) * .011) * 16);
  ctx.lineTo(W, 720); ctx.lineTo(0, 720); ctx.fill();
  fillRect(ctx, vgrad(ctx, 690, 780, [[0, '#a2756a'], [1, '#6e4d55']]), 0, 690, W, 90);
  for (let i = 0; i < 12; i++) { const x = ((-camX * .45 + i * 230) % 2760 + 2760) % 2760 - 300; palm(ctx, x, 740, 150 + R(i, 23) * 80, t, { sil: '#3a2a3e' }); }
  // road
  fillRect(ctx, vgrad(ctx, 770, 930, [[0, '#4a4350'], [1, '#2b2731']]), 0, 770, W, 170);
  ctx.fillStyle = '#e8d9b0';
  for (let x = ((-camX) % 180 + 180) % 180 - 180; x < W + 180; x += 180) ctx.fillRect(x, 846, 90, 6);
  fillRect(ctx, '#3d2f36', 0, 930, W, 160);
}
function roadSign(ctx, x, y) {
  ctx.fillStyle = '#5b5f66'; ctx.fillRect(x - 70, y, 8, 150); ctx.fillRect(x + 62, y, 8, 150);
  ctx.fillStyle = '#0f6b3f'; rrect(ctx, x - 120, y - 92, 240, 100, 10); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; rrect(ctx, x - 112, y - 84, 224, 84, 7); ctx.stroke();
  textAR(ctx, 'تكريت', x - 24, y - 44, { size: 44, font: FONT_BODY, color: '#ffffff', shadow: false });
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x + 92, y - 44); ctx.lineTo(x + 64, y - 64); ctx.lineTo(x + 64, y - 24); ctx.closePath(); ctx.fill(); ctx.fillRect(x + 40, y - 50, 26, 12);
}
function tikritPanorama(ctx, t, camX) {
  fillRect(ctx, vgrad(ctx, 0, 650, [[0, '#7b4f7d'], [.5, '#e98a5a'], [1, '#ffd08a']]), 0, 0, W, 660);
  glow(ctx, 760, 600, 900, '#ffb066', .6);
  ctx.fillStyle = '#fff0c6'; ctx.beginPath(); ctx.arc(760, 590, 56, 0, TAU); ctx.fill();
  const fx = -camX * .3;
  ctx.save(); ctx.translate(fx, 0);
  ctx.fillStyle = '#6a3d4f';
  for (let i = 0; i < 40; i++) { const x = i * 60 - 200, h = 24 + R(i, 11) * 50, w = 40 + R(i, 12) * 40; ctx.fillRect(x, 630 - h, w, h + 6); }
  ctx.fillRect(1180, 520, 120, 110); ctx.beginPath(); ctx.arc(1240, 520, 56, Math.PI, 0); ctx.fill(); ctx.fillRect(1238, 440, 4, 30);
  ctx.fillRect(1330, 400, 16, 230); ctx.fillRect(1324, 450, 28, 8); ctx.beginPath(); ctx.moveTo(1330, 400); ctx.lineTo(1338, 372); ctx.lineTo(1346, 400); ctx.fill();
  for (let i = 0; i < 26; i++) palm(ctx, i * 95 - 150 + R(i, 13) * 30, 640, 90 + R(i, 14) * 70, t, { sil: '#4e2c40' });
  ctx.restore();
  fillRect(ctx, vgrad(ctx, 636, 900, [[0, '#f0a066'], [.5, '#a2577a'], [1, '#3b2848']]), 0, 636, W, 270);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 60; i++) { const y = 640 + Math.pow(R(i, 15), 1.3) * 250, x = 760 + (R(i, 16) - .5) * 420 + Math.sin(t * 1.3 + i) * 12; ctx.fillStyle = rgba('#ffe0a8', .35 * (1 - (y - 640) / 260)); ctx.fillRect(x, y, 20 + R(i, 17) * 110, 3); }
  ctx.restore();
  ctx.fillStyle = '#26162a'; ctx.beginPath(); ctx.moveTo(0, 900); for (let x = 0; x <= W; x += 30) ctx.lineTo(x, 890 + Math.sin(x * .013) * 10); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  for (let i = 0; i < 4; i++) palm(ctx, [80, 330, 1620, 1860][i] - camX * .9, 1080, 520 + i * 30, t, { sil: '#1a0f1e' });
}
function tikritStreet(ctx, t, camX, lightK) {
  fillRect(ctx, vgrad(ctx, 0, 400, [[0, '#f2a96a'], [1, '#ffd9a0']]), 0, 0, W, 420);
  ctx.save(); ctx.translate(-camX, 0);
  // facades
  for (let i = 0; i < 6; i++) {
    const x = i * 420 - 300;
    ctx.fillStyle = i % 2 ? '#e3be8e' : '#d9b07f'; ctx.fillRect(x, 220, 420, 640);
    ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(x, 220, 420, 18);
    ctx.fillStyle = '#b48a5c'; ctx.fillRect(x, 220, 420, 8);
    for (let k = 0; k < 2; k++) { const wx = x + 70 + k * 200; ctx.fillStyle = '#7d5a3c'; ctx.fillRect(wx, 330, 90, 120); ctx.fillStyle = rgba('#ffd690', .6 + .2 * lightK); ctx.fillRect(wx + 8, 338, 74, 104); ctx.fillStyle = '#7d5a3c'; ctx.fillRect(wx + 42, 338, 6, 104); }
  }
  // the house door
  const dx = 1560;
  ctx.fillStyle = '#c9a272'; ctx.fillRect(dx - 150, 420, 300, 440);
  ctx.fillStyle = '#5b3a24'; ctx.beginPath(); ctx.moveTo(dx - 100, 860); ctx.lineTo(dx - 100, 560); ctx.arc(dx, 560, 100, Math.PI, 0); ctx.lineTo(dx + 100, 860); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba('#ffe2a6', .5 + .5 * lightK); ctx.beginPath(); ctx.moveTo(dx - 84, 860); ctx.lineTo(dx - 84, 566); ctx.arc(dx, 566, 84, Math.PI, 0); ctx.lineTo(dx + 84, 860); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6b4428'; ctx.fillRect(dx - 84, 566, 84 - 8 + (1 - lightK) * 8, 294);
  for (const lx of [dx - 190, dx + 190]) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(lx - 3, 520, 6, 40); ctx.fillStyle = '#ffcf7a'; rrect(ctx, lx - 16, 560, 32, 44, 8); ctx.fill(); glow(ctx, lx, 582, 120, '#ffbf5a', .6); }
  for (const px of [dx - 240, dx + 240]) { ctx.fillStyle = '#8a5a3a'; ctx.fillRect(px - 24, 800, 48, 60); treeRound(ctx, px, 812, 160, t, ['#4f7a3a', '#6a9a46', '#88b358'], '#5a3e28'); }
  glow(ctx, dx, 700, 500 + 700 * lightK, '#ffd27a', .35 + .45 * lightK);
  ctx.restore();
  fillRect(ctx, vgrad(ctx, 860, H, [[0, '#cfa679'], [1, '#a77f58']]), 0, 860, W, 240);
  ctx.strokeStyle = 'rgba(90,60,30,.2)'; ctx.lineWidth = 2;
  for (let x = ((-camX) % 120 + 120) % 120 - 120; x < W + 120; x += 120) { ctx.beginPath(); ctx.moveTo(x, 860); ctx.lineTo(x - 60, H); ctx.stroke(); }
}

// ---------------------------------------------------------------- scenes 9-10 interiors
function fairyLights(ctx, t, y0, n = 4, alpha = 1) {
  for (let s = 0; s < n; s++) {
    const x0 = -40 + s * (W + 80) / n, x1 = x0 + (W + 80) / n, sag = 70 + s % 2 * 30;
    ctx.strokeStyle = rgba('#5a4030', .6 * alpha); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0); ctx.stroke();
    for (let k = 1; k < 12; k++) {
      const u = k / 12, x = lerp(x0, x1, u), y = y0 + 4 * sag * u * (1 - u);
      const tw = .6 + .4 * Math.sin(t * 2 + k + s * 3);
      glow(ctx, x, y + 6, 26, '#ffd27a', .6 * tw * alpha);
      ctx.fillStyle = rgba('#fff2c8', alpha); ctx.beginPath(); ctx.arc(x, y + 6, 3.2, 0, TAU); ctx.fill();
    }
  }
}
function flowerArch(ctx, cx, base, r, t, k = 1) {
  ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx - r, base); ctx.lineTo(cx - r, base - r * .8); ctx.arc(cx, base - r * .8, r, Math.PI, 0); ctx.lineTo(cx + r, base); ctx.stroke();
  const n = 34;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let x, y;
    const L1 = r * .8, L2 = Math.PI * r, tot = L1 * 2 + L2, d = u * tot;
    if (d < L1) { x = cx - r; y = base - d; }
    else if (d < L1 + L2) { const a = Math.PI + (d - L1) / r; x = cx + Math.cos(a) * r; y = base - r * .8 + Math.sin(a) * r; }
    else { x = cx + r; y = base - r * .8 + (d - L1 - L2); }
    if (i % 2) leaf(ctx, x, y, 40, i * 1.7);
    roseTop(ctx, x, y, 22 + R(i, 7) * 8, .9, i, ss(k, u * .5, u * .5 + .5));
  }
}
function chandelier(ctx, x, y, s, t, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = GOLD[2]; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -200); ctx.lineTo(0, 0); ctx.stroke();
  for (let i = 0; i < 3; i++) { ellipse(ctx, 0, 20 + i * 34, 120 - i * 30, 20 - i * 4); ctx.stroke(); }
  for (let i = 0; i < 18; i++) {
    const a2 = i / 18 * TAU, px = Math.cos(a2) * 120, py = 20 + Math.sin(a2) * 20;
    const len = 30 + (i % 3) * 14;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + len); ctx.stroke();
    const tw = .6 + .4 * Math.sin(t * 3 + i);
    glow(ctx, px, py + len, 22, '#fff0c0', .7 * tw);
    ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(px, py + len, 3, 0, TAU); ctx.fill();
  }
  glow(ctx, 0, 40, 260, '#ffd27a', .5);
  ctx.restore();
}
