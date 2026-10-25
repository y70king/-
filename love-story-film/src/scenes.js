// The ten scenes. Each scene is a pure function of its local time `lt`
// (seconds since the scene started; may be slightly negative or past the end
// during transitions). Story beats are pinned to narration word cues.
'use strict';

const TL = window.TIMELINE;
const SC = TL.scenes;
const CUE = (name, i) => TL.cues[name] - SC[i].start;
const D = i => SC[i].dur;

// ---- engine-provided scratch buffer for in-scene dissolves
let BUF2 = null, B2 = null;
function crossfade(ctx, k, fa, fb) {
  k = clamp(k);
  if (k <= 0) return fa(ctx);
  if (k >= 1) return fb(ctx);
  fa(ctx);
  B2.save(); B2.setTransform(ctx.getTransform()); B2.fillStyle = '#000'; B2.fillRect(-50, -50, W + 100, H + 100);
  fb(B2); B2.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = k; ctx.drawImage(BUF2, 0, 0); ctx.restore();
}
function toLocal(p, x, y, s, key, dir) { const k = s * CAST[key].h; return { x: (p.x - x) / (k * dir), y: (p.y - y) / k }; }
function mixPt(a, b, k) { return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }; }
const REST = { x: 36, y: -224 };

// ================================================================ 1. the rose
function scene1(ctx, lt) {
  const pushZ = 1 + Math.max(0, lt - 2) * .011;
  ctx.save(); cam(ctx, 960, 560, pushZ);
  skyDay(ctx, lt);
  palm(ctx, 120, 650, 420, lt); palm(ctx, 1800, 650, 440, lt + 2);
  lawCenter(ctx, lt);
  palm(ctx, 560, 652, 300, lt + 1); palm(ctx, 1360, 652, 310, lt + 3);
  walkway(ctx, lt, .55);
  // students far away near the gate
  for (let i = 0; i < 4; i++) {
    const dir = i % 2 ? 1 : -1, x = 960 + dir * (-420 + ((lt * 26 + i * 230) % 840));
    drawPerson(ctx, ['guy', 'friend', 'girl', 'guy'][i], { x, y: 668, s: .2, dir, walk: lt * 6 + i, t: lt, sil: '#8d8577', alpha: .75 });
  }
  ctx.restore();
  // the two friends walking towards the gate, seen from behind
  const ph = lt * 5.4;
  drawPerson(ctx, 'girl', { x: 850, y: 1046, s: 1.08, back: true, walk: ph, walkAmp: .9, t: lt, handF: { x: -52, y: -300 }, holdF: (c, x, y) => roseSide(c, x, y, 1.05, -.25) });
  drawPerson(ctx, 'friend', { x: 1072, y: 1046, s: 1.08, back: true, walk: ph + .9, walkAmp: .9, t: lt, handN: { x: 52, y: -300 }, holdN: (c, x, y) => roseSide(c, x, y, 1.05, .25) });
  lightLeak(ctx, lt, .28);
  caption(ctx, '14 فبراير 2023 — عيد الحب', null, 1490, 905, lt, 4.6, D(0) - .2, 56);

  // ---- opening: darkness, a gust of petals and a golden glow that opens the world
  const open = easeIO(seg(lt, 1.9, 4.6));
  if (open < 1) {
    const r = open * 1500;
    const g = ctx.createRadialGradient(960, 540, r * .55, 960, 540, r + 1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = open > 0 ? g : '#000'; ctx.fillRect(0, 0, W, H);
  }
  const ga = win(lt, .2, 4.8, 1.2, 1.4);
  if (ga > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    glow(ctx, 960, 540, 520 + lt * 60, '#f4c56a', .55 * ga);
    ctx.restore();
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * TAU + lt * (.35 + R(i, 1) * .25);
      const out = Math.pow(seg(lt, 1.8 + R(i, 2) * .6, 4.6), 1.6);
      const rad = 70 + R(i, 3) * 260 + lt * 26 + out * 1300;
      const x = 960 + Math.cos(a) * rad * 1.3, y = 540 + Math.sin(a) * rad * .8 + Math.sin(lt + i) * 14;
      drawPetal(ctx, x, y, 14 + R(i, 4) * 18, a + lt, Math.cos(lt * 2 + i), R(i, 5) > .82 ? GOLD[1] : '#b3122e', ga * ss(lt, .1 + R(i, 6) * .8, 1.2 + R(i, 6)));
    }
  }
}

// ================================================================ 2. the request
const S2 = (() => {
  const tT = CUE('s2_turn', 1), tG = CUE('s2_give', 1), tP = CUE('s2_photo', 1);
  const tR = tG + .35;           // the rose changes hands
  const tF = tP - .12;           // shutter
  const PH = { x: 1100 - 500, y: 566 - 281, w: 1000, h: 562 };
  return { tT, tG, tP, tR, tF, PH };
})();
function s2World(ctx, lt) {
  const { tT, tG, tR } = S2;
  ctx.save(); cam(ctx, 1010, 470, 1.5);
  skyDay(ctx, lt * .5);
  palm(ctx, 470, 650, 420, lt); palm(ctx, 1500, 650, 430, lt + 1);
  lawCenter(ctx, lt);
  ctx.restore();
  fillRect(ctx, 'rgba(255,244,226,.28)');
  pavementSide(ctx, 860);
  // girls walk a few steps then stop
  const gk = easeOut(seg(lt, -.9, tT + .2));
  const gx = 610 + gk * 130, walking = lt < tT + .1;
  const amp = 1 - ss(lt, tT - .9, tT + .1);
  // expressions
  let gExpr = 'smile', fExpr = 'smile', gLook = 0;
  if (lt > tT + .25) gExpr = 'surprised';
  if (lt > tT + 3) gExpr = 'shy';
  if (lt > tR - .1) gExpr = 'surprised';
  if (lt > tR + 1) gExpr = 'laugh';
  if (lt > tT + .4) fExpr = 'surprised';
  if (lt > tT + 2.6) fExpr = 'smile';
  if (lt > tR) fExpr = 'shock';
  if (lt > tR + 1.4) fExpr = 'laugh';
  // girl's rose arm
  const give = easeIO(seg(lt, tG - .7, tG));
  const back = easeIO(seg(lt, tR + .1, tR + .8));
  let gHand = mixPt({ x: 40, y: -298 }, { x: 128, y: -330 }, give);
  if (lt > tR) gHand = mixPt({ x: 128, y: -330 }, REST, back);
  drawPerson(ctx, 'friend', { x: gx - 200, y: 972, s: .98, walk: walking ? lt * 4.6 + 1 : null, walkAmp: amp, t: lt, expr: fExpr, handN: { x: 40, y: -298 }, holdN: (c, x, y) => roseSide(c, x, y, .95, -.2) });
  const girl = drawPerson(ctx, 'girl', { x: gx, y: 980, s: 1, walk: walking ? lt * 4.6 : null, walkAmp: amp, t: lt, expr: gExpr, look: gLook, handN: gHand, holdN: lt < tR ? (c, x, y) => roseSide(c, x, y, 1, -.2 + give * .3) : null });

  // the young man
  const gs = 1.03;
  let x = lerp(80, 1180, easeOut(seg(lt, -.9, tT - .15) * 1));
  const turned = lt > tT - .05;
  const hop = lt > tR && lt < tR + .4 ? Math.sin(seg(lt, tR, tR + .4) * Math.PI) * 22 : 0;
  const reach = easeIO(seg(lt, tG - .45, tG + .25));
  const point = win(lt, tT + .5, tG - .4, .5, .4);
  const pose = easeOut(seg(lt, tR + .3, tR + 1.1));
  let hand = REST;
  if (point > 0) hand = mixPt(REST, { x: 122, y: -350 }, point);
  if (reach > 0 && lt < tR) {
    const rose = girl.handN; // world position of the rose
    hand = mixPt(hand, toLocal({ x: rose.x + 18, y: rose.y - 10 }, x, 996, gs, 'guy', -1), reach);
  }
  if (lt >= tR) hand = mixPt({ x: 70, y: -300 }, { x: 74, y: -318 }, pose);
  let gExpr2 = turned ? 'smile' : 'smile';
  if (lt > tR && lt < tR + .5) gExpr2 = 'joy';
  if (lt > tR + .9) gExpr2 = 'joy';
  const guy = drawPerson(ctx, 'guy', {
    x, y: 996 - hop, s: gs, dir: turned ? -1 : 1, walk: turned ? null : lt * 5.6, t: lt, expr: gExpr2,
    handN: hand, holdN: lt >= tR ? (c, hx, hy) => roseSide(c, hx, hy, 1.1, .35 - pose * .3) : null,
    handF: { x: 26, y: -284 }, holdF: (c, hx, hy, a) => propPaper(c, hx, hy, a, 1.1),
  });
  // comic beats
  if (lt > tT + .35 && lt < tT + 2.8) { // a question mark pops above her head
    const k = easeBack(seg(lt, tT + .35, tT + .7)), al = 1 - ss(lt, tT + 2.3, tT + 2.8);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(girl.head.x + 44, girl.head.y - 70); ctx.scale(k, k); ctx.rotate(Math.sin(lt * 6) * .1);
    ctx.font = '700 56px "Amiri", serif'; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 6; ctx.textAlign = 'center';
    ctx.strokeText('?', 0, 0); ctx.fillText('?', 0, 0); ctx.restore();
  }
  if (lt > tR - .1 && lt < tR + .6) { // whoosh lines + sparkle at the snatch
    const k = seg(lt, tR - .1, tR + .6);
    ctx.save(); ctx.strokeStyle = rgba('#ffffff', 1 - k); ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const yy = guy.handN.y - 30 + i * 16; ctx.beginPath(); ctx.moveTo(guy.handN.x - 40 - i * 10, yy); ctx.lineTo(guy.handN.x - 120 - i * 18 - k * 60, yy); ctx.stroke(); }
    ctx.restore();
    star(ctx, guy.handN.x + 6, guy.handN.y - 70, 40 * (1 - k), 1 - k);
  }
  if (fExpr === 'shock') { // sweat drop on the friend
    const k = seg(lt, tR, tR + 1.2);
    ctx.fillStyle = rgba('#bfe6ff', 1 - k * .6);
    const sx = gx - 200 - 40, sy = 972 - 470 + k * 16;
    ctx.beginPath(); ctx.moveTo(sx, sy - 14); ctx.quadraticCurveTo(sx + 10, sy, sx, sy + 6); ctx.quadraticCurveTo(sx - 10, sy, sx, sy - 14); ctx.fill();
  }
  return { girl, guy };
}
function drawPhoto(ctx, d) {
  const { PH, tF } = S2;
  ctx.save();
  ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.clip();
  ctx.translate(d.x, d.y); ctx.scale(d.w / PH.w, d.h / PH.h); ctx.translate(-PH.x, -PH.y);
  s2World(ctx, tF);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,190,120,.55)'; ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.restore();
  const b = Math.max(6, d.w * .016);
  ctx.save();
  ctx.strokeStyle = goldGrad(ctx, d.x, d.y, d.x + d.w, d.y + d.h); ctx.lineWidth = b;
  ctx.strokeRect(d.x - b / 2, d.y - b / 2, d.w + b, d.h + b);
  ctx.lineWidth = Math.max(1, b * .18); ctx.strokeStyle = rgba('#fff3c4', .8);
  ctx.strokeRect(d.x + b * .7, d.y + b * .7, d.w - b * 1.4, d.h - b * 1.4);
  ctx.restore();
}
const PHOTO_FULL = { x: 60, y: 34, w: 1800, h: 1012 };
function scene2(ctx, lt) {
  const { tP, tF, PH } = S2;
  if (lt < tF) {
    s2World(ctx, lt);
    // viewfinder
    const v = win(lt, tP - 1.6, tF + .1, .35, .05);
    if (v > 0) {
      ctx.save(); ctx.globalAlpha = v; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
      const L = 60, { x, y, w, h } = PH, inset = (1 - easeOut(seg(lt, tP - 1.6, tP - 1.1))) * 60;
      [[x + inset, y + inset, 1, 1], [x + w - inset, y + inset, -1, 1], [x + inset, y + h - inset, 1, -1], [x + w - inset, y + h - inset, -1, -1]].forEach(([cx, cy, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(cx, cy + L * sy); ctx.lineTo(cx, cy); ctx.lineTo(cx + L * sx, cy); ctx.stroke();
      });
      ctx.fillStyle = '#ff4b4b'; ctx.beginPath(); ctx.arc(x + 40, y + 40, 8 * (.6 + .4 * Math.sin(lt * 8)), 0, TAU); ctx.fill();
      ctx.restore();
    }
    lightLeak(ctx, lt, .2);
    return;
  }
  // frozen moment becomes a golden photograph that fills the screen
  s2World(ctx, tF);
  fillRect(ctx, `rgba(20,10,8,${.65 * ss(lt, tF, tF + .8)})`);
  sparkles(ctx, lt, 40, 9, { alpha: ss(lt, tF + .3, tF + 1.2) });
  const z = easeIO(seg(lt, tF + .5, D(1) - .1));
  const d = { x: lerp(PH.x, PHOTO_FULL.x, z), y: lerp(PH.y, PHOTO_FULL.y, z), w: lerp(PH.w, PHOTO_FULL.w, z), h: lerp(PH.h, PHOTO_FULL.h, z) };
  drawPhoto(ctx, d);
  flash(ctx, 1 - seg(lt, tF, tF + .45));
}

// ================================================================ 3. instagram
const PHONE = { x: 960 - 235, y: 70, w: 470, h: 940, r: 64 };
const SCR = { x: PHONE.x + 18, y: PHONE.y + 18, w: PHONE.w - 36, h: PHONE.h - 36 };
const POST = { x: SCR.x, y: SCR.y + 150, w: SCR.w, h: SCR.w * 9 / 16 };
const MSGS = [
  { side: 1, t: 3.7, kind: 'text', w: .62 }, { side: -1, t: 4.4, kind: 'rose' }, { side: 1, t: 5.1, kind: 'text', w: .5, lines: 2 },
  { side: -1, t: 5.8, kind: 'smile' }, { side: 0, t: 6.5, kind: 'heart' }, { side: 1, t: 7.2, kind: 'text', w: .7 }, { side: -1, t: 7.8, kind: 'text', w: .45 },
];
function emojiSmile(ctx, x, y, r) {
  ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5b3a1a'; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .2, r * .12, 0, TAU); ctx.arc(x + r * .35, y - r * .2, r * .12, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = r * .12; ctx.beginPath(); ctx.arc(x, y + r * .05, r * .5, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
  glow(ctx, x - r * .55, y + r * .25, r * .3, '#ff8a8a', .6); glow(ctx, x + r * .55, y + r * .25, r * .3, '#ff8a8a', .6);
}
function phoneUI(ctx, lt) {
  // screen bg
  ctx.save();
  rrect(ctx, SCR.x, SCR.y, SCR.w, SCR.h, 48); ctx.clip();
  fillRect(ctx, vgrad(ctx, SCR.y, SCR.y + SCR.h, [[0, '#fffaf3'], [1, '#f6eadc']]), SCR.x, SCR.y, SCR.w, SCR.h);
  const chat = easeIO(seg(lt, 3.0, 3.6));
  // header
  ctx.fillStyle = '#ffffff'; ctx.fillRect(SCR.x, SCR.y, SCR.w, 120);
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(SCR.x, SCR.y + 119, SCR.w, 2);
  const ig = ctx.createLinearGradient(SCR.x + 30, SCR.y + 60, SCR.x + 80, SCR.y + 100);
  ig.addColorStop(0, '#f9a03f'); ig.addColorStop(.5, '#e1306c'); ig.addColorStop(1, '#833ab4');
  ctx.strokeStyle = ig; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(SCR.x + 60, SCR.y + 80, 24, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#f3d6d6'; ctx.beginPath(); ctx.arc(SCR.x + 60, SCR.y + 80, 19, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(SCR.x + 60, SCR.y + 84); rosebud(ctx, .55, .8); ctx.restore();
  ctx.fillStyle = '#2b2b33'; rrect(ctx, SCR.x + 100, SCR.y + 66, 150, 12, 6); ctx.fill();
  ctx.fillStyle = '#b9b2a8'; rrect(ctx, SCR.x + 100, SCR.y + 88, 90, 9, 5); ctx.fill();
  glow(ctx, SCR.x + SCR.w - 54, SCR.y + 80, 30 * (1 + chat), '#e1306c', .0);
  // feed (post) slides away when the chat starts
  ctx.save(); ctx.translate(0, -chat * 520); ctx.globalAlpha = 1 - chat;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(POST.x, POST.y + POST.h, POST.w, 120);
  const like = easeBack(seg(lt, 2.3, 2.7));
  ctx.save(); ctx.translate(POST.x + 40, POST.y + POST.h + 40); ctx.scale(1 + .25 * Math.sin(seg(lt, 2.3, 2.9) * Math.PI), 1 + .25 * Math.sin(seg(lt, 2.3, 2.9) * Math.PI));
  heartPath(ctx, 0, 0, 16); ctx.lineWidth = 3; ctx.strokeStyle = '#2b2b33'; ctx.stroke();
  if (like > 0) { ctx.fillStyle = '#e8364f'; heartPath(ctx, 0, 0, 16 * like); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#d8d0c6'; rrect(ctx, POST.x + 24, POST.y + POST.h + 76, 260, 10, 5); ctx.fill(); rrect(ctx, POST.x + 24, POST.y + POST.h + 96, 180, 10, 5); ctx.fill();
  ctx.restore();
  // chat bubbles
  if (chat > 0) {
    ctx.save(); ctx.globalAlpha = chat;
    let y = SCR.y + 150;
    MSGS.forEach(m => {
      const k = easeBack(seg(lt, m.t, m.t + .35));
      const typing = win(lt, m.t - .55, m.t, .1, .05);
      const h = m.kind === 'text' ? (m.lines === 2 ? 74 : 52) : m.kind === 'heart' ? 110 : 76;
      if (m.side === 0) {
        if (k > 0) { const pulse = 1 + .08 * Math.sin(lt * 6); glow(ctx, SCR.x + SCR.w / 2, y + h / 2, 140 * k, '#ff5a7a', .5 * k); ctx.fillStyle = '#e8364f'; heartPath(ctx, SCR.x + SCR.w / 2, y + h / 2, 40 * k * pulse); ctx.fill(); }
      } else {
        const bw = m.kind === 'text' ? SCR.w * m.w : 96;
        const bx = m.side > 0 ? SCR.x + SCR.w - 24 - bw : SCR.x + 24;
        if (typing > 0 && k <= 0) {
          ctx.save(); ctx.globalAlpha = chat * typing; ctx.fillStyle = m.side > 0 ? '#f2c6b4' : '#ffffff'; rrect(ctx, m.side > 0 ? SCR.x + SCR.w - 24 - 84 : SCR.x + 24, y, 84, 44, 22); ctx.fill();
          ctx.fillStyle = '#9b8f86'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((m.side > 0 ? SCR.x + SCR.w - 24 - 84 : SCR.x + 24) + 24 + i * 18, y + 22 - Math.max(0, Math.sin(lt * 10 - i)) * 5, 5, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
        if (k > 0) {
          ctx.save(); ctx.translate(m.side > 0 ? bx + bw : bx, y + h); ctx.scale(k, k); ctx.translate(-(m.side > 0 ? bx + bw : bx), -(y + h));
          ctx.fillStyle = m.side > 0 ? '#f2c6b4' : '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,.08)'; ctx.shadowBlur = 8; rrect(ctx, bx, y, bw, h, 24); ctx.fill(); ctx.shadowBlur = 0;
          if (m.kind === 'text') { ctx.fillStyle = m.side > 0 ? 'rgba(120,60,50,.35)' : 'rgba(80,80,90,.25)'; rrect(ctx, bx + 20, y + 20, bw - 40, 11, 6); ctx.fill(); if (m.lines === 2) { rrect(ctx, bx + 20, y + 44, (bw - 40) * .6, 11, 6); ctx.fill(); } }
          if (m.kind === 'rose') { ctx.save(); ctx.translate(bx + 48, y + 52); rosebud(ctx, 1.05, .9); ctx.restore(); }
          if (m.kind === 'smile') emojiSmile(ctx, bx + 48, y + h / 2, 24);
          ctx.restore();
        }
      }
      if (lt > m.t - .55) y += h + 16;
    });
    ctx.restore();
  }
  // follow notification
  const n = win(lt, 1.2, 3.1, .45, .4);
  if (n > 0) {
    const ny = SCR.y + 56 - (1 - easeOut(seg(lt, 1.2, 1.65))) * 140 - (1 - (1 - ss(lt, 2.7, 3.1))) * 140;
    ctx.save(); ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffffff'; rrect(ctx, SCR.x + 16, ny, SCR.w - 32, 104, 22); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = ig; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(SCR.x + SCR.w - 70, ny + 52, 28, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#e8e4f2'; ctx.beginPath(); ctx.arc(SCR.x + SCR.w - 70, ny + 52, 23, 0, TAU); ctx.fill();
    ctx.fillStyle = CAST.guy.hair; ctx.beginPath(); ctx.arc(SCR.x + SCR.w - 70, ny + 46, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = CAST.guy.skin; ctx.beginPath(); ctx.arc(SCR.x + SCR.w - 70, ny + 50, 9, 0, Math.PI); ctx.fill();
    ctx.fillStyle = CAST.guy.coat; ctx.beginPath(); ctx.arc(SCR.x + SCR.w - 70, ny + 74, 15, Math.PI, 0); ctx.fill();
    textAR(ctx, 'بدأ بمتابعتك', SCR.x + SCR.w - 190, ny + 50, { size: 30, font: FONT_BODY, color: '#26262e', shadow: false });
    ctx.fillStyle = '#3897f0'; rrect(ctx, SCR.x + 36, ny + 32, 96, 40, 12); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(SCR.x + 70, ny + 52); ctx.lineTo(SCR.x + 80, ny + 62); ctx.lineTo(SCR.x + 98, ny + 42); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function splitRooms(ctx, lt) {
  const tF = CUE('s3_friend', 2), tH = CUE('s3_hide', 2);
  // left: her room (warm)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 960, H); ctx.clip();
  fillRect(ctx, vgrad(ctx, 0, H, [[0, '#4a2d2c'], [1, '#2a1a1c']]), 0, 0, 960, H);
  glow(ctx, 170, 380, 420, '#ffb46a', .55); ctx.fillStyle = '#ffe2b0'; rrect(ctx, 130, 330, 80, 60, 20); ctx.fill();
  ctx.fillStyle = '#28323f'; ctx.fillRect(620, 140, 260, 300); ctx.fillStyle = '#3b4a66'; ctx.fillRect(632, 152, 236, 276);
  for (let i = 0; i < 20; i++) { ctx.fillStyle = rgba('#fff4cc', .6 * (.5 + .5 * Math.sin(lt * 2 + i))); ctx.fillRect(640 + R(i, 1) * 220, 160 + R(i, 2) * 250, 2.5, 2.5); }
  bokeh(ctx, lt, 6, 33, { x: 0, w: 900, rmin: 30, rmax: 70, alpha: .18 });
  const shy = lt > tF;
  drawPerson(ctx, 'girl', { x: 470, y: 1270, s: 1.95, t: lt, expr: shy ? 'shy' : 'smile', headTilt: .1, look: 1, handN: { x: 50, y: -318 }, handF: { x: 40, y: -312 }, bendN: -1, bendF: -1, holdN: (c, x, y) => propPhone(c, x - 4, y - 18, 0, 1) });
  ctx.restore();
  // right: his room (cool, evening)
  ctx.save(); ctx.beginPath(); ctx.rect(960, 0, 960, H); ctx.clip();
  fillRect(ctx, vgrad(ctx, 0, H, [[0, '#26304a'], [1, '#161c2c']]), 960, 0, 960, H);
  glow(ctx, 1760, 420, 380, '#ffcf8a', .45); ctx.fillStyle = '#3a3a3a'; ctx.fillRect(1740, 420, 10, 220); ctx.fillStyle = '#ffd99a'; ctx.beginPath(); ctx.moveTo(1700, 420); ctx.lineTo(1790, 420); ctx.lineTo(1770, 370); ctx.lineTo(1720, 370); ctx.fill();
  ctx.fillStyle = '#2d3a56'; ctx.fillRect(1020, 130, 230, 170); for (let i = 0; i < 4; i++) { ctx.fillStyle = '#e8d8b8'; ctx.fillRect(1040 + i * 50, 150 + (i % 2) * 8, 34, 130 - (i % 2) * 8); }
  const type = Math.sin(lt * 14) * 3;
  drawPerson(ctx, 'guy', { x: 1430, y: 1300, s: 1.9, dir: -1, t: lt, expr: lt > tF - .5 ? 'smile' : 'smile', headTilt: .12, look: 1, handN: { x: 50, y: -318 + type }, handF: { x: 40, y: -312 - type }, bendN: -1, bendF: -1, holdN: (c, x, y) => propPhone(c, x - 4, y - 18, 0, 1) });
  ctx.restore();
  // golden thread between them with travelling messages
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const g = ctx.createLinearGradient(960, 0, 960, H); g.addColorStop(0, 'rgba(244,210,122,0)'); g.addColorStop(.5, 'rgba(244,210,122,.9)'); g.addColorStop(1, 'rgba(244,210,122,0)');
  ctx.fillStyle = g; ctx.fillRect(958, 0, 4, H);
  ctx.restore();
  for (let i = 0; i < 6; i++) {
    const p = (lt * .55 + i / 6) % 1, dir = i % 2 ? -1 : 1;
    const x = dir > 0 ? lerp(1290, 640, p) : lerp(640, 1290, p), y = 470 - Math.sin(p * Math.PI) * 170;
    const a = Math.sin(p * Math.PI) * .9;
    if (i % 3 === 2) { ctx.fillStyle = rgba('#ff6b86', a); heartPath(ctx, x, y, 14); ctx.fill(); }
    else { ctx.fillStyle = rgba('#ffffff', a); rrect(ctx, x - 22, y - 14, 44, 28, 12); ctx.fill(); ctx.fillStyle = rgba('#c9a27a', a); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 10 + k * 10, y, 3, 0, TAU); ctx.fill(); } }
  }
  // a heart quietly forms on the thread
  const hk = seg(lt, tH, tH + 1.6);
  if (hk > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    glow(ctx, 960, 480, 260 * easeOut(hk), '#ff7a8a', .45 * easeOut(hk));
    ctx.strokeStyle = goldGrad(ctx, 800, 340, 1120, 640); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); for (let u = 0; u <= easeIO(hk); u += .01) { const [px, py] = heartPt(u, 130); u === 0 ? ctx.moveTo(960 + px, 470 + py) : ctx.lineTo(960 + px, 470 + py); } ctx.stroke();
    ctx.restore();
  }
}
function scene3(ctx, lt) {
  const split = ss(lt, 8.5, 9.4);
  crossfade(ctx, split, c => {
    fillRect(c, vgrad(c, 0, H, [[0, '#2b1a20'], [1, '#120a0e']]));
    bokeh(c, lt, 14, 21, { alpha: .22, rmin: 40, rmax: 110 });
    const m = easeIO(seg(lt, 0, 1.3));
    const body = ss(lt, .3, 1.2);
    // phone body
    c.save(); c.globalAlpha = body;
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 60; c.fillStyle = '#121216'; rrect(c, PHONE.x, PHONE.y, PHONE.w, PHONE.h, PHONE.r); c.fill(); c.shadowBlur = 0;
    c.strokeStyle = '#3a3a44'; c.lineWidth = 3; rrect(c, PHONE.x + 2, PHONE.y + 2, PHONE.w - 4, PHONE.h - 4, PHONE.r - 2); c.stroke();
    phoneUI(c, lt);
    c.fillStyle = '#0a0a0c'; rrect(c, 960 - 60, PHONE.y + 28, 120, 30, 15); c.fill();
    c.restore();
    // the photograph shrinking into the post
    const chat = easeIO(seg(lt, 3.0, 3.6));
    const d = { x: lerp(PHOTO_FULL.x, POST.x, m), y: lerp(PHOTO_FULL.y, POST.y, m) - chat * 520, w: lerp(PHOTO_FULL.w, POST.w, m), h: lerp(PHOTO_FULL.h, POST.h, m) };
    if (chat < 1) {
      c.save(); c.globalAlpha = 1 - chat;
      if (m >= 1) { rrect(c, SCR.x, SCR.y + 121, SCR.w, SCR.h - 121, 0); c.clip(); }
      drawPhoto(c, d);
      c.restore();
    }
    // heart glow between messages
    const hg = win(lt, 6.4, 8.6, .4, .8);
    if (hg > 0) { c.save(); c.globalCompositeOperation = 'screen'; glow(c, 960, 540, 600, '#ff6a85', .25 * hg); c.restore(); }
  }, c => splitRooms(c, lt));
  lightLeak(ctx, lt, .15);
}

// ================================================================ 4. exam hall
function scene4(ctx, lt) {
  const tM = CUE('s4_meet', 3), d = D(3);
  const after = lt > 12.0; // time has passed: they stand closer
  const zoomDoor = ss(lt, tM, tM + 2.2) * (1 - ss(lt, 11.6, 12.4));
  const zx = lerp(960, 1340, zoomDoor), zy = lerp(540, 560, zoomDoor), z = lerp(1, 1.7, zoomDoor) * (after ? lerp(1.08, 1.16, seg(lt, 12, d)) : 1);
  ctx.save(); cam(ctx, after ? 1010 : zx, after ? 590 : zy, z);
  corridor(ctx, lt, after ? 0 : ss(lt, tM + .8, tM + 2.4) * .0);
  if (!after) {
    // she arrives with her papers; he waits by the door with a small note
    const gx = lerp(-150, 760, easeOut(seg(lt, -.8, 2.6))), walking = lt < 2.5;
    const lean = ss(lt, 3.2, 4.0);
    const look = lt > 5.6 && lt < 7.6;
    drawPerson(ctx, 'girl', { x: gx + lean * 60, y: 1000, s: 1, t: lt, walk: walking ? lt * 5 : null, walkAmp: 1 - ss(lt, 2, 2.6), expr: look ? 'shy' : 'smile', headTilt: look ? -.04 : .1 * lean, handN: { x: 34, y: -316 }, handF: { x: 22, y: -306 }, holdN: (c, x, y) => propPapers(c, x - 10, y + 6) });
    const talk = lt > 3 && lt < 5.6 && Math.sin(lt * 9) > .2;
    drawPerson(ctx, 'guy', { x: 1090, y: 1004, s: 1.02, dir: -1, t: lt, expr: look ? 'smile' : talk ? 'laugh' : 'smile', headTilt: look ? 0 : .08, handN: { x: 62, y: -318 }, holdN: (c, x, y, a) => propPaper(c, x - 4, y - 8, a, 1.3), handF: { x: 80 + Math.sin(lt * 5) * 4, y: -336 }, bendF: -1 });
    const hk = win(lt, 6.0, 8.0, .4, .6);
    if (hk > 0) for (let i = 0; i < 3; i++) { const p = seg(lt, 6 + i * .3, 7.8); ctx.fillStyle = rgba('#ff6b86', hk * (1 - p)); heartPath(ctx, 960 + (i - 1) * 30, 560 - p * 120, 10 + i * 3); ctx.fill(); }
  } else {
    // weeks later: the distance between them has disappeared
    const k = easeOut(seg(lt, 12.2, 14.5));
    drawPerson(ctx, 'girl', { x: lerp(900, 985, k), y: 1000, s: 1, t: lt, expr: 'shy', headTilt: -.04, handN: { x: 34, y: -316 }, handF: { x: 22, y: -306 }, holdN: (c, x, y) => propPapers(c, x - 10, y + 6) });
    drawPerson(ctx, 'guy', { x: 1130, y: 1004, s: 1.02, dir: -1, t: lt, expr: 'smile', handN: REST });
    for (let i = 0; i < 5; i++) { const p = ((lt - 12.5) * .35 + i / 5) % 1; if (lt > 12.5) { ctx.fillStyle = rgba('#ff6b86', .8 * Math.sin(p * Math.PI)); heartPath(ctx, 1050 + Math.sin(p * 6 + i) * 30, 520 - p * 200, 9 + (i % 3) * 3); ctx.fill(); } }
  }
  ctx.restore();
  grade(ctx, '#ffb35c', after ? .35 : .2);
  lightLeak(ctx, lt, after ? .3 : .15);
  // passing time: a clock whose hands race
  const ck = win(lt, tM + 1.3, 12.8, .8, .8);
  if (ck > 0) {
    fillRect(ctx, `rgba(18,10,6,${.78 * ck})`);
    ctx.save(); ctx.globalAlpha = ck; ctx.translate(960, 520);
    const r = 250;
    glow(ctx, 0, 0, r * 1.8, '#f4c56a', .25);
    ctx.fillStyle = 'rgba(255,248,232,.06)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = goldGrad(ctx, -r, -r, r, r); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r - 18, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, l = i % 5 ? 8 : 22; ctx.lineWidth = i % 5 ? 2 : 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 30), Math.sin(a) * (r - 30)); ctx.lineTo(Math.cos(a) * (r - 30 - l), Math.sin(a) * (r - 30 - l)); ctx.stroke(); }
    const tt = Math.max(0, lt - tM - 1.3), spin = tt * tt * 1.6 + tt * .5;
    const hand = (a, len, w) => { ctx.save(); ctx.rotate(a); ctx.fillStyle = GOLD[1]; rrect(ctx, -w / 2, -len, w, len + 20, w / 2); ctx.fill(); ctx.restore(); };
    hand(spin / 12, r * .5, 12); hand(spin, r * .78, 7);
    ctx.fillStyle = GOLD[0]; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
    // orbiting days
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + spin * .08, rr = r + 70 + Math.sin(i + lt) * 14; ctx.fillStyle = rgba('#f4d27a', .5 + .4 * Math.sin(lt * 3 + i)); ctx.beginPath(); ctx.arc(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * .9, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
    sparkles(ctx, lt, 50, 4, { alpha: ck });
  }
}

// ================================================================ 5. before the parting
function scene5(ctx, lt) {
  const tBut = CUE('s5_but', 4);
  const mapK = ss(lt, 6.1, 6.9);
  crossfade(ctx, mapK, c => {
    const dep = ss(lt, 3.7, 4.4);
    crossfade(c, dep, c2 => {
      // golden days on campus
      const camX = lt * 170, blue = ss(lt, 2.6, 4.2) * .55;
      campus(c2, lt, camX, blue);
      const ph = lt * 5.2;
      const laugh = (lt % 2.4) < 1.2;
      drawPerson(c2, 'girl', { x: 860, y: 1000, s: 1, t: lt, walk: ph, expr: laugh ? 'laugh' : 'smile', handN: { x: 30, y: -262 }, holdN: (cc, x, y) => propPapers(cc, x - 6, y - 26) });
      drawPerson(c2, 'guy', { x: 1020, y: 1006, s: 1.02, t: lt, walk: ph + 1.4, expr: laugh ? 'laugh' : 'smile', headDir: laugh ? -1 : 1 });
      for (let i = 0; i < 18; i++) { // falling leaves
        const p = (lt * .15 + R(i, 3)) % 1, x = (R(i, 4) * 2200 - p * 300 + Math.sin(lt + i) * 40) - 100, y = p * 1150 - 60;
        c2.save(); c2.translate(x, y); c2.rotate(lt * 2 + i); c2.fillStyle = mix(['#d8a03a', '#c7782e', '#9cbf5a'][i % 3], '#6f8fc0', blue); ellipse(c2, 0, 0, 9, 4.5); c2.fill(); c2.restore();
      }
      lightLeak(c2, lt, .3 * (1 - blue));
      grade(c2, '#3b6fd1', blue * .6);
    }, c2 => {
      // departure: blue dusk, she leaves with a suitcase and looks back
      const z = lerp(1.14, 1.0, easeIO(seg(lt, 3.7, 6.6)));
      c2.save(); cam(c2, 980, 640, z);
      fillRect(c2, vgrad(c2, 0, 860, [[0, '#1d2c4f'], [.7, '#4f6a98'], [1, '#8aa3c8']]));
      for (let i = 0; i < 8; i++) { c2.fillStyle = '#2a3a5e'; const bx = i * 260 - 120, bh = 200 + R(i, 7) * 200; c2.fillRect(bx, 760 - bh, 220, bh); c2.fillStyle = 'rgba(255,224,150,.35)'; for (let k = 0; k < 6; k++) c2.fillRect(bx + 20 + (k % 3) * 64, 760 - bh + 30 + Math.floor(k / 3) * 60, 30, 34); }
      for (const lx of [380, 1500]) lamp(c2, lx, 880, 300, 1, '#cfe0ff');
      fillRect(c2, vgrad(c2, 860, H, [[0, '#5b6c8f'], [1, '#2c3754']]), 0, 860, W, 260);
      drawPerson(c2, 'guy', { x: 520, y: 1000, s: .95, t: lt, expr: 'sad' });
      const gx = lerp(880, 1330, easeOut(seg(lt, 3.8, 5.8))), walking = lt < 5.6;
      const lookBack = lt > 5.3;
      drawPerson(c2, 'girl', { x: gx, y: 1000, s: 1, t: lt, walk: walking ? lt * 5 : null, walkAmp: 1 - ss(lt, 5.2, 5.7), expr: 'sad', headDir: lookBack ? -1 : 1, handN: { x: 6, y: -236 }, holdN: (cc, x, y) => propSuitcase(cc, x, y, 1) });
      c2.restore();
      for (let i = 0; i < 26; i++) { const p = (lt * .12 + R(i, 8)) % 1; c2.fillStyle = rgba('#cfe0ff', .35); ellipse(c2, R(i, 9) * W, p * H, 3, 3); c2.fill(); }
      vignette(c2, .5, '#0a1430');
    });
  }, c => {
    // the map: Tikrit -> Baghdad
    const z = lerp(1.0, 1.9, easeIO(seg(lt, 6.4, D(4))));
    const [tx, ty] = geo(CITY.tikrit), [bx, by] = geo(CITY.baghdad);
    fillRect(c, vgrad(c, 0, H, [[0, '#0d1a33'], [1, '#050b18']]));
    c.save(); cam(c, lerp(960, (tx + bx) / 2, easeIO(seg(lt, 6.4, D(4)))), lerp(540, (ty + by) / 2, easeIO(seg(lt, 6.4, D(4)))), z);
    c.strokeStyle = 'rgba(120,160,220,.08)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    poly(c, IRAQ); c.fillStyle = 'rgba(70,110,180,.22)'; c.fill();
    c.shadowColor = '#6fa8ff'; c.shadowBlur = 18; c.strokeStyle = '#8fbcff'; c.lineWidth = 2.5; c.stroke(); c.shadowBlur = 0;
    poly(c, TIGRIS); c.strokeStyle = 'rgba(90,170,255,.55)'; c.lineWidth = 3; c.stroke();
    // journey line
    const k = easeIO(seg(lt, 6.8, 8.8));
    const cx = (tx + bx) / 2 + 60, cy = (ty + by) / 2 - 30;
    c.setLineDash([10, 9]); c.lineDashOffset = -lt * 20; c.strokeStyle = GOLD[1]; c.lineWidth = 4;
    c.beginPath(); c.moveTo(tx, ty);
    let px = tx, py = ty;
    for (let u = 0; u <= k; u += .01) { px = (1 - u) * (1 - u) * tx + 2 * (1 - u) * u * cx + u * u * bx; py = (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * cy + u * u * by; c.lineTo(px, py); }
    c.stroke(); c.setLineDash([]);
    if (k > 0 && k < 1) { glow(c, px, py, 40, '#ffd27a', .9); }
    [[tx, ty, 'تكريت', 6.5, -1], [bx, by, 'بغداد', 8.6, 1]].forEach(([x, y, name, t0, side]) => {
      const a = ss(lt, t0, t0 + .5);
      if (a <= 0) return;
      for (let i = 0; i < 2; i++) { const p = ((lt - t0) * .7 + i * .5) % 1; c.strokeStyle = rgba('#ffd27a', a * (1 - p)); c.lineWidth = 2; c.beginPath(); c.arc(x, y, 8 + p * 40, 0, TAU); c.stroke(); }
      glow(c, x, y, 30, '#ffd27a', a); c.fillStyle = rgba('#fff3c4', a); c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
      textAR(c, name, x + side * 70, y - 6, { size: 30, font: FONT_BODY, color: '#f7ecd6', alpha: a });
    });
    c.restore();
    vignette(c, .6, '#000000');
  });
}

// ================================================================ 6. Al-Ahrar bridge
const S6 = (() => {
  const came = CUE('s6_came', 5), saw = CUE('s6_saw', 5), hand = CUE('s6_hand', 5), heart = CUE('s6_heart', 5);
  const G = { x: 600, y: 1052, s: 1.12 }, Y = { y: 1058, s: 1.1 };
  const M = { x: 712, y: 770 }; // where their hands meet
  return { came, saw, hand, heart, G, Y, M, slow: hand - .5 };
})();
function s6Time(lt) { return lt < S6.slow ? lt : S6.slow + (lt - S6.slow) * .3; }
function scene6(ctx, lt) {
  const { came, saw, hand, heart, G, Y, M } = S6;
  const tw = s6Time(lt);
  const push1 = easeIO(seg(lt, saw - .2, hand - .3)), push2 = easeIO(seg(lt, hand, D(5) + .3));
  const cx = lerp(lerp(960, 820, push1), M.x, push2), cy = lerp(lerp(540, 720, push1), M.y, push2);
  const z = lerp(lerp(1, 1.3, push1), 3.1, push2);
  ctx.save(); cam(ctx, cx, cy, z);
  baghdadSunset(ctx, tw);
  tigrisWater(ctx, tw, 640, 900);
  ahrarBridge(ctx, tw, tw);
  promenade(ctx, 880);
  // him: arrives, pauses when she sees him, then closes the distance
  let yx;
  if (lt < saw) yx = lerp(2150, 1300, easeOut(seg(lt, came - .4, saw - .1)) * .999);
  else yx = lerp(1300, 812, easeIO(seg(lt, saw + .6, hand - .2)));
  const yWalk = (lt > came - .4 && lt < saw - .15) || (lt > saw + .6 && lt < hand - .25);
  const reach = easeIO(seg(lt, hand - .7, hand));
  const yHand = mixPt(REST, toLocal(M, yx, Y.y, Y.s, 'guy', -1), reach);
  // her: smile at the river -> sees him -> tears -> hands on her face -> his hand
  const cover = ss(lt, saw + .5, saw + 1.2) * (1 - ss(lt, hand - .6, hand));
  const gHandN0 = lt < saw ? REST : mixPt(REST, { x: 60, y: -300 }, ss(lt, saw, saw + .4));
  let gHandN = mixPt(gHandN0, { x: 26, y: -420 }, cover), gHandF = mixPt(REST, { x: 6, y: -422 }, cover);
  if (lt > hand - .6) { const k = ss(lt, hand - .6, hand); gHandN = mixPt({ x: 26, y: -420 }, toLocal(M, G.x, G.y, G.s, 'girl', 1), k); gHandF = mixPt({ x: 6, y: -422 }, { x: 30, y: -316 }, k); }
  let gExpr = 'smile', tears = 0;
  if (lt > saw) gExpr = 'surprised';
  if (lt > saw + .5) { gExpr = 'cry'; tears = ss(lt, saw + .4, saw + 1.2); }
  if (lt > hand + .3) { gExpr = 'crysmile'; tears = .85; }
  const lookUp = ss(lt, hand + .2, hand + 1.4);
  drawPerson(ctx, 'guy', { x: yx, y: Y.y, s: Y.s, dir: -1, t: tw, walk: yWalk ? lt * 5.2 : null, expr: lt > hand ? 'smile' : 'smile', headTilt: lt > hand ? .06 : 0, handN: yHand, bendN: -1 });
  drawPerson(ctx, 'girl', {
    x: G.x, y: G.y, s: G.s, t: tw, expr: gExpr, tears, wind: 1, look: lt > saw ? 1 : 0,
    headTilt: -.12 * lookUp + (cover > .5 ? .1 : 0), shake: lt > saw + .6 && lt < hand ? .7 : 0,
    handsFront: cover > 0, handN: gHandN, handF: gHandF, bendN: -1, bendF: cover > 0 ? -1 : 1,
  });
  // heartbeat glow where their hands meet
  if (lt > hand) {
    const hb = Math.pow(Math.max(0, Math.sin((lt - heart) * 5.5)), 6) * ss(lt, heart - .2, heart + .3);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    glow(ctx, M.x, M.y, 120, '#ffcf7a', .5 * ss(lt, hand, hand + .8) + hb * .5);
    ctx.restore();
    sparkles(ctx, tw, 30, 61, { x: M.x - 160, y: M.y - 260, w: 320, h: 320, alpha: ss(lt, hand, hand + 1), size: .6 });
  }
  ctx.restore();
  bokeh(ctx, tw, 9, 44, { alpha: .14 + push2 * .25, rmin: 40, rmax: 120, colors: ['#ffb36b', '#ff8a6a', '#ffd9a0'] });
  lightLeak(ctx, tw, .3, '#ff9a55');
}

// ================================================================ 7. the sixth of December
function scene7(ctx, lt) {
  const tD = CUE('s7_date', 6), tWalk = CUE('s7_walk', 6);
  const sil = ss(lt, 9.3, 10.4);
  crossfade(ctx, sil, c => {
    const dark = ss(lt, .4, 2.2);
    fillRect(c, vgrad(c, 0, H, [[0, mix('#c8644e', '#1a0b10', dark)], [1, mix('#5e2a4a', '#070305', dark)]]));
    bokeh(c, lt, 16, 71, { alpha: .35 * (1 - dark * .6), rmin: 50, rmax: 140, colors: ['#ffb36b', '#ff8a6a', '#ffd9a0'] });
    sparkles(c, lt, 60, 72, { alpha: dark });
    const hz = lerp(2.4, 2.1, easeIO(seg(lt, 0, 2)));
    claspedHands(c, 960, 548, hz, lt, 1 - ss(lt, .9, 2.0));
    // golden threads drawing a heart around them
    const k = easeIO(seg(lt, .1, 2.4));
    c.save(); c.globalCompositeOperation = 'screen'; c.lineCap = 'round';
    for (let s = 0; s < 5; s++) {
      const sc = 300 + s * 9 + Math.sin(lt * 1.5 + s) * 4;
      c.strokeStyle = rgba(GOLD[s % 3], .75 - s * .1); c.lineWidth = 3 - s * .3;
      c.beginPath();
      for (let u = 0; u <= k; u += .005) { const [px, py] = heartPt(u + s * .013, sc); const x = 960 + px + Math.sin(u * 40 + s + lt) * 3, y = 520 + py; u === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.stroke();
    }
    c.restore();
    const da = ss(lt, tD + .2, tD + 1.2);
    textAR(c, '6 ديسمبر 2024', 960, 520, { size: 124, reveal: seg(lt, tD + .2, tD + 1.8), alpha: da, glow: .5 });
    goldRule(c, 960, 612, 420, seg(lt, tD + .8, tD + 2.2), da);
  }, c => {
    const camX = lt * 120;
    duskRiver(c, lt, camX);
    const ph = lt * 4.6;
    const gx = 880, yx = 1030, gy = 990;
    const meet = { x: 958, y: gy - 250 };
    drawPerson(c, 'girl', { x: gx, y: gy, s: 1.02, t: lt, walk: ph, sil: '#120a12', handN: toLocal(meet, gx, gy, 1.02, 'girl', 1) });
    drawPerson(c, 'guy', { x: yx, y: gy + 4, s: 1.02, t: lt, walk: ph + 1.6, sil: '#120a12', handF: toLocal(meet, yx, gy + 4, 1.02, 'guy', 1) });
    const b = i => seg(lt, tWalk - .6 + i * .35, tWalk + 2.4 + i * .35);
    bloomCorner(c, 40, 1090, 1.5, b(0), .15);
    c.save(); c.translate(W, 0); c.scale(-1, 1); bloomCorner(c, 40, 1090, 1.5, b(1), .15); c.restore();
    c.save(); c.translate(0, H); c.scale(1, -1); bloomCorner(c, 60, 1090, 1.0, b(2), .25); c.restore();
    c.save(); c.translate(W, H); c.scale(-1, -1); bloomCorner(c, 60, 1090, 1.0, b(3), .25); c.restore();
    lightLeak(c, lt, .25, '#ff9a55');
  });
}

// ================================================================ 8. back to Tikrit
function scene8(ctx, lt) {
  const tChose = CUE('s8_chose', 7);
  const k1 = ss(lt, 3.6, 4.3), k2 = ss(lt, 6.2, 6.9);
  crossfade(ctx, k2, c => crossfade(c, k1, c2 => {
    const camX = lt * 900;
    roadDusk(c2, lt, camX);
    const sx = lerp(2300, -300, seg(lt, .6, 3.8));
    if (sx > -300 && sx < 2300) roadSign(c2, sx, 720);
    car(c2, 900, 900, lt, { girl: true });
    for (let i = 0; i < 4; i++) { const x = ((-camX * 1.5 + i * 700) % 2800 + 2800) % 2800 - 300; c2.fillStyle = '#2a2026'; c2.fillRect(x, 520, 12, 420); c2.fillRect(x - 40, 540, 92, 8); }
    vignette(c2, .45, '#120a1a');
  }, c2 => {
    tikritPanorama(c2, lt, (lt - 3.6) * 22);
    lightLeak(c2, lt, .35);
  }), c => {
    const lightK = ss(lt, tChose - .6, D(7));
    const camX = lerp(0, 260, easeIO(seg(lt, 6.2, D(7))));
    tikritStreet(c, lt, camX, lightK);
    const x = lerp(200, 1130, seg(lt, 6.0, D(7) + .4));
    drawPerson(c, 'groom', { x, y: 1010, s: 1.04, t: lt, walk: lt * 4.8, walkAmp: .85, expr: 'smile', handN: { x: 48, y: -300 }, holdN: (cc, hx, hy) => bouquet(cc, hx + 10, hy - 10, .5, lt, .25) });
    lightLeak(c, lt, .3 + lightK * .3);
    grade(c, '#ffb347', .25 + lightK * .25);
  });
}

// ================================================================ 9. the engagement
function scene9(ctx, lt) {
  const tC = CUE('s9_complete', 8), tTurn = CUE('s9_turned', 8);
  const kA = ss(lt, 2.0, 2.6), kB = ss(lt, tC - .4, tC + .2), kC = ss(lt, tTurn - .3, tTurn + .4);
  const A = c => { // bouquet in golden light
    fillRect(c, vgrad(c, 0, H, [[0, '#3a1a0e'], [1, '#160805']]));
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * .35 + Math.sin(lt * .3) * .05; c.save(); c.translate(960, -100); c.rotate(a); const g = c.createLinearGradient(0, 0, 0, 1300); g.addColorStop(0, 'rgba(255,210,130,.22)'); g.addColorStop(1, 'rgba(255,210,130,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.lineTo(120, 1300); c.lineTo(-120, 1300); c.fill(); c.restore(); }
    c.restore();
    bokeh(c, lt, 18, 81, { alpha: .35 });
    bouquet(c, 960, 640 + Math.sin(lt) * 6, 3.4 + lt * .05, lt, Math.sin(lt * .6) * .03);
    sparkles(c, lt, 40, 82);
  };
  const B = c => { // the ring box opens
    fillRect(c, vgrad(c, 0, H, [[0, '#2a0a10'], [1, '#0d0306']]));
    bokeh(c, lt, 14, 83, { alpha: .25, colors: ['#ffd27a', '#ff9a6a'] });
    const open = easeIO(seg(lt, 2.8, 4.0));
    glow(c, 960, 560, 500, '#ffcf7a', .25 + open * .35);
    ringBox(c, 960, 640, 3.2 + (lt - 2) * .06, open, win(lt, 3.9, 5, .25, .6));
    sparkles(c, lt, 30, 84, { alpha: open });
  };
  const Cc = c => { // the proposal
    fillRect(c, vgrad(c, 0, 860, [[0, '#f6e4c6'], [1, '#e9cfa6']]));
    glow(c, 960, 520, 700, '#fff3d6', .6);
    fairyLights(c, lt, 40, 4);
    flowerArch(c, 960, 860, 330, lt, seg(lt, tC - .4, tC + 1.8));
    fillRect(c, vgrad(c, 860, H, [[0, '#cfa77c'], [1, '#a67e58']]), 0, 860, W, 230);
    for (const x of [200, 1720]) { c.fillStyle = '#f7eedd'; c.fillRect(x - 14, 800, 28, 70); glow(c, x, 790, 90, '#ffcf7a', .7 + .2 * Math.sin(lt * 7 + x)); c.fillStyle = '#ffe9a8'; ellipse(c, x, 788, 6, 12); c.fill(); }
    const toHer = ss(lt, tC + 2.2, tC + 3.0);
    drawPerson(c, 'groom', { x: 800, y: 1010, s: 1.02, t: lt, kneel: 1, expr: 'joy', handN: { x: 112, y: -232 }, holdN: (cc, hx, hy) => ringBox(cc, hx + 18, hy - 8, .42, 1, .6 + .4 * Math.sin(lt * 4)) });
    drawPerson(c, 'bride', {
      x: 1110, y: 1010, s: 1, dir: -1, t: lt, expr: toHer > .5 ? 'joy' : 'crysmile', tears: .6, handsFront: true,
      handN: mixPt({ x: 18, y: -404 }, { x: 96, y: -300 }, toHer), handF: { x: 4, y: -406 }, bendN: toHer > .5 ? 1 : -1, bendF: -1,
    });
    petalRain(c, lt, 46, 91, { speed: .9 });
  };
  const Dd = c => { // close-up of her hand and the ring, with the date
    fillRect(c, vgrad(c, 0, H, [[0, '#3a1c10'], [1, '#120704']]));
    bokeh(c, lt, 20, 85, { alpha: .35 });
    drawHand(c, 820, 470, 3.4, -.22, { ring: .7 + .3 * Math.sin(lt * 4), sleeve: CAST.bride.coat, skin: CAST.girl.skin, shade: CAST.girl.skinSh });
    petalRain(c, lt, 40, 92, { speed: .7, size: 1.4 });
    caption(c, '5 ديسمبر 2025 — يوم الخطوبة', null, 960, 900, lt, tTurn + .5, D(8) + 1, 70);
  };
  crossfade(ctx, kC, c => crossfade(c, kB, c2 => crossfade(c2, kA, A, B), Cc), Dd);
  lightLeak(ctx, lt, .3);
}

// ================================================================ 10. finale
function scene10(ctx, lt) {
  const d = D(9), tRoad = CUE('s10_road', 9), tToday = CUE('s10_today', 9);
  const tTitle = SC[9].speechEnd - SC[9].start + .3;
  fillRect(ctx, (() => { const g = ctx.createRadialGradient(960, 520, 50, 960, 540, 1100); g.addColorStop(0, '#2a1012'); g.addColorStop(1, '#050203'); return g; })());
  const hall = ss(lt, tToday - .6, tToday + .8) * (1 - ss(lt, tTitle - .6, tTitle + .8));
  // the hall
  if (hall > 0) {
    ctx.save(); ctx.globalAlpha = hall;
    glow(ctx, 960, 600, 900, '#ffcf7a', .35);
    bokeh(ctx, lt, 22, 101, { alpha: .35, rmin: 30, rmax: 90 });
    [480, 960, 1440].forEach((x, i) => chandelier(ctx, x, 150 + (i === 1 ? -30 : 0), i === 1 ? 1.1 : .85, lt, 1));
    fillRect(ctx, vgrad(ctx, 900, H, [[0, 'rgba(60,30,20,.0)'], [1, 'rgba(255,200,120,.15)']]), 0, 900, W, 200);
    glow(ctx, 960, 760, 360, '#ffe0a0', .55);
    const meet = { x: 962, y: 1006 - 250 * 1.16 };
    drawPerson(ctx, 'bride', { x: 885, y: 1006, s: 1.16, t: lt, gown: true, sil: '#140a0c', handN: toLocal(meet, 885, 1006, 1.16, 'bride', 1) });
    drawPerson(ctx, 'groom', { x: 1040, y: 1010, s: 1.16, dir: -1, t: lt, sil: '#140a0c', handN: toLocal(meet, 1040, 1010, 1.16, 'groom', -1) });
    ctx.restore();
  }
  // the first rose, circled by golden petals, becomes a heart with two rings
  const morph = easeIO(seg(lt, tRoad - .3, tRoad + 2.2));
  const up = easeIO(seg(lt, tToday - .6, tToday + 1.2));
  const hx = 960, hy = lerp(520, 330, up), hs = lerp(1, .5, up);
  const objA = 1 - ss(lt, tTitle - .8, tTitle + .2);
  if (objA > 0) {
    ctx.save(); ctx.globalAlpha = objA;
    const orbit = (front) => {
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * TAU + lt * .55, z = Math.sin(a);
        if ((z > 0) !== front) continue;
        const x = hx + Math.cos(a) * 400 * hs, y = hy + Math.sin(a) * 110 * hs - Math.cos(a) * 60 * hs;
        drawPetal(ctx, x, y, (16 + R(i, 5) * 10) * (.75 + .35 * z) * hs, a * 2 + lt, Math.cos(lt * 2 + i), GOLD[1 + (i % 2)], (.55 + .45 * z) * (1 - up * .5));
      }
    };
    orbit(false);
    glow(ctx, hx, hy, 420 * hs, '#ff6a6a', .25);
    roseTop(ctx, hx, hy, 200 * (1 - morph * .6), 1, lt * .06, 1 - morph);
    if (morph > 0) {
      const s = 175 * easeBack(morph) * hs;
      ctx.save();
      const g = ctx.createRadialGradient(hx - s * .3, hy - s * .4, s * .1, hx, hy, s * 1.3);
      g.addColorStop(0, '#e8364f'); g.addColorStop(.7, '#9e0f28'); g.addColorStop(1, '#5a0614');
      heartPath(ctx, hx, hy + s * .05, s); ctx.fillStyle = g; ctx.globalAlpha = objA * morph; ctx.fill();
      ctx.lineWidth = 6 * hs; ctx.strokeStyle = goldGrad(ctx, hx - s, hy - s, hx + s, hy + s); ctx.stroke();
      ctx.restore();
      goldRings(ctx, hx, hy + 8 * hs, 70 * hs, ss(lt, tRoad + 1.2, tRoad + 2.4) * objA, lt);
    }
    orbit(true);
    ctx.restore();
  }
  // closing card
  const cardA = ss(lt, tTitle - .2, tTitle + .8) * (1 - ss(lt, d - 2.0, d - .2));
  if (cardA > 0) {
    sparkles(ctx, lt, 70, 103, { alpha: cardA * .8 });
    glow(ctx, 960, 520, 700, '#3a2410', cardA * .6);
    const hk = ss(lt, tTitle + 2.6, tTitle + 3.4);
    if (hk > 0) {
      ctx.save(); ctx.globalAlpha = cardA * hk;
      const pulse = 1 + .06 * Math.sin(lt * 3);
      glow(ctx, 960, 330, 90, '#f4c56a', .6);
      heartPath(ctx, 960, 332, 24 * easeBack(hk) * pulse); ctx.fillStyle = goldGrad(ctx, 930, 300, 990, 360); ctx.fill();
      ctx.restore();
    }
    textAR(ctx, 'من أول وردة... إلى خاتم العمر', 960, 470, { size: 104, reveal: seg(lt, tTitle, tTitle + 1.8), alpha: cardA, glow: .45 });
    goldRule(ctx, 960, 560, 640, seg(lt, tTitle + 1, tTitle + 2.4), cardA);
    textAR(ctx, 'بعض الصدف يكتبها القدر لتصبح أجمل حكاية حب', 960, 620, { size: 46, font: FONT_BODY, weight: 400, color: '#fbf1dc', reveal: seg(lt, tTitle + 1.4, tTitle + 3), alpha: cardA });
    if (window.FILM_NAMES) textAR(ctx, window.FILM_NAMES, 960, 760, { size: 64, alpha: cardA * ss(lt, tTitle + 3, tTitle + 4) });
  }
  fillRect(ctx, `rgba(0,0,0,${ss(lt, d - 1.8, d - .1)})`);
}

const SCENES = [scene1, scene2, scene3, scene4, scene5, scene6, scene7, scene8, scene9, scene10];
// how each cut is bridged: rose petals, golden flare, or a matched dissolve
const TRANSITIONS = [
  { type: 'petals', d: .9 }, { type: 'match', d: .3 }, { type: 'flare', d: .8 }, { type: 'lines', d: .9 }, { type: 'petals', d: .9, color: '#7b1630' },
  { type: 'match', d: .5 }, { type: 'petals', d: .9 }, { type: 'flare', d: .9 }, { type: 'petals', d: 1.0 },
];
