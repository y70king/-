// Characters, hands, roses and props.
// One model per character, reused in every scene so faces, hair and clothes
// stay identical: the girl (long open hair), her friend (hijab), the young man.
'use strict';

const CAST = {
  girl: {
    h: 1, sw: 31, hem: -105, headR: 33,
    skin: '#f3cfb4', skinSh: '#e2b294', hair: '#2b1812', hairHi: '#5a3324',
    coat: '#f0e3cd', coatSh: '#d8c3a3', top: '#e7aeb1', pants: '#3b4764', shoe: '#f5efe8', lips: '#b4525a',
  },
  friend: {
    h: .97, sw: 30, hem: -30, headR: 32,
    skin: '#e9c1a0', skinSh: '#d4a582', hijab: '#9a87b6', hijabSh: '#7b6a9a',
    coat: '#6f7d5c', coatSh: '#5a6649', top: '#efe7da', pants: '#4a4038', shoe: '#5b4131', lips: '#a4505a',
  },
  guy: {
    h: 1.07, sw: 38, hem: -228, headR: 34,
    skin: '#dcab88', skinSh: '#c48f6b', hair: '#17110e', hairHi: '#3a2a22',
    coat: '#2d4163', coatSh: '#21304d', top: '#f3f1ec', pants: '#686d78', shoe: '#2a2422', lips: '#94584f',
  },
};
// formal look for the engagement
CAST.groom = Object.assign({}, CAST.guy, { coat: '#1d1f27', coatSh: '#121319', pants: '#1d1f27', shoe: '#0e0e10', tie: '#8e1b2a', hem: -222 });
CAST.bride = Object.assign({}, CAST.girl, { coat: '#f7efe3', coatSh: '#e5d6bf', hem: -12 });

const PANTS_W = 25, L1 = 76, L2 = 72; // arm segment lengths

function limb(ctx, pts, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function ik(sx, sy, tx, ty, l1, l2, bend) {
  const dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1), l1 + l2 - .5);
  const a = Math.atan2(dy, dx);
  const off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ea = a - bend * off;
  const ex = sx + Math.cos(ea) * l1, ey = sy + Math.sin(ea) * l1;
  const ha = Math.atan2(ty - ey, tx - ex);
  return { ex, ey, hx: ex + Math.cos(ha) * l2, hy: ey + Math.sin(ha) * l2, ha };
}
function lerpPt(a, b, t) { return a && b ? { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) } : (t < .5 ? a : b); }

// ---------------------------------------------------------------- person
// o: x,y,s, dir(+1 faces right), t, walk(phase|null), walkAmp, back(bool),
//    expr, headDir, headTilt, look, blink, handN/handF {x,y} local targets,
//    holdN/holdF (ctx,hx,hy,angle)=>void, sil (silhouette colour), kneel 0..1,
//    wind, tears 0..1, shake, gown
function drawPerson(ctx, key, o) {
  const P = CAST[key];
  const sil = o.sil;
  const C = c => sil || c;
  const t = o.t || 0;
  ctx.save();
  ctx.translate(o.x, o.y);
  const s = (o.s || 1) * P.h;
  ctx.scale(s * (o.dir || 1), s);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;

  const walking = o.walk != null;
  const ph = walking ? o.walk : 0;
  const amp = walking ? (o.walkAmp ?? 1) : 0;
  const kneel = o.kneel || 0;
  const bob = -Math.abs(Math.sin(ph)) * 7 * amp + Math.sin(t * 1.7) * 1.2 + (o.shake ? Math.sin(t * 24) * 1.6 * o.shake : 0);
  const hipY = -245 + kneel * 92;
  const wind = o.wind ?? .5;
  const sway = Math.sin(t * 1.3 + (o.x || 0) * .01) * 5 * wind + Math.sin(ph) * 4 * amp - amp * 6;
  const isGirl = key === 'girl' || key === 'bride', isFriend = key === 'friend', isGuy = key === 'guy' || key === 'groom';
  const back = !!o.back;

  // ---------- legs
  const legs = [];
  for (let j = 0; j < 2; j++) {
    const side = j === 0 ? -1 : 1; // 0 = far, 1 = near
    const lp = ph + (j === 0 ? Math.PI : 0);
    let hip = { x: side * 10, y: hipY }, knee, foot;
    if (back) {
      const lift = Math.max(0, Math.sin(lp)) * 20 * amp;
      hip = { x: side * 13, y: hipY };
      knee = { x: side * 14, y: hipY + 124 - lift * .4 };
      foot = { x: side * 15, y: -lift };
    } else {
      const a = Math.sin(lp) * .44 * amp;
      const bend = Math.max(0, Math.sin(lp + Math.PI / 2)) * .55 * amp;
      knee = { x: hip.x + Math.sin(a) * 124, y: hip.y + Math.cos(a) * 124 };
      foot = { x: knee.x + Math.sin(a - bend) * 124, y: knee.y + Math.cos(a - bend) * 124 };
      if (kneel > 0) { // near leg forward with foot planted, far knee on the ground
        const kn = j === 1 ? { x: 112, y: hipY + 6 } : { x: -6, y: -14 };
        const ft = j === 1 ? { x: 118, y: -2 } : { x: -128, y: -8 };
        knee = lerpPt(knee, kn, kneel); foot = lerpPt(foot, ft, kneel);
      }
    }
    legs.push({ hip, knee, foot, j });
  }

  const shoulderY = hipY - 127 + bob, neckY = shoulderY - 20, headY = shoulderY - 60;
  const swN = P.sw * (back ? 1 : .92), swF = P.sw * (back ? 1 : .78);
  const shN = { x: back ? P.sw : swN, y: shoulderY + 8 }, shF = { x: back ? -P.sw : -swF, y: shoulderY + 8 };

  // ---------- arms (computed now, drawn in order)
  function arm(sh, target, phase, bendDir) {
    if (target) {
      const r = ik(sh.x, sh.y, target.x, target.y, L1, L2, bendDir);
      return { e: [r.ex, r.ey], h: [r.hx, r.hy], a: r.ha };
    }
    const sw = Math.sin(phase) * .42 * amp + (back ? 0 : .05) + Math.sin(t * 1.1 + sh.x) * .02;
    const ex = sh.x + Math.sin(sw) * L1, ey = sh.y + Math.cos(sw) * L1;
    const la = sw + .22 + amp * .15;
    return { e: [ex, ey], h: [ex + Math.sin(la) * L2, ey + Math.cos(la) * L2], a: Math.PI / 2 - la };
  }
  const armN = arm(shN, o.handN, ph + Math.PI, o.bendN ?? 1);
  const armF = arm(shF, o.handF, ph, o.bendF ?? 1);
  function drawArm(sh, A, hold, far) {
    const sleeve = far && !back ? C(P.coatSh) : C(P.coat);
    limb(ctx, [[sh.x, sh.y], A.e, A.h], 21, sleeve);
    ctx.fillStyle = C(isGuy ? P.top : P.coat);
    if (isGuy && !sil) { ctx.beginPath(); ctx.arc(A.h[0] - Math.cos(A.a) * 6, A.h[1] - Math.sin(A.a) * 6, 9.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = C(far ? P.skinSh : P.skin);
    ellipse(ctx, A.h[0] + Math.cos(A.a) * 3, A.h[1] + Math.sin(A.a) * 3, 11, 9.5, A.a); ctx.fill();
    if (hold) hold(ctx, A.h[0] + Math.cos(A.a) * 5, A.h[1] + Math.sin(A.a) * 5, A.a);
  }

  const hx = (back ? 0 : 3) + (o.headX || 0), hy = headY;
  const R0 = P.headR;

  // ---------- back layers
  if (isGirl && !back) drawGirlBackHair(ctx, P, C, hx, hy, sway, t);
  if (isFriend && !back) { ctx.fillStyle = C(P.hijabSh); drapePath(ctx, hx, hy, shoulderY, 1); ctx.fill(); }
  if (o.gown && !back) drawVeil(ctx, C, hx, hy, sway);
  if (!back && !o.handsFront) drawArm(shF, armF, o.holdF, true);

  // legs
  if (!o.gown) {
    legs.forEach(L => {
      const col = L.j === 0 && !back ? C(mix(P.pants, '#000000', .18)) : C(P.pants);
      limb(ctx, [[L.hip.x, L.hip.y + bob * .3], [L.knee.x, L.knee.y], [L.foot.x, L.foot.y - 8]], PANTS_W, col);
      ctx.fillStyle = C(P.shoe);
      if (back) { ellipse(ctx, L.foot.x, L.foot.y - 6, 12, 8); ctx.fill(); }
      else { ellipse(ctx, L.foot.x + 9, L.foot.y - 6, 17, 8); ctx.fill(); }
    });
  }

  // ---------- torso
  ctx.save();
  ctx.translate(0, bob);
  const sY = shoulderY - bob; // coordinates below are relative to translated frame
  const hem = o.gown ? -4 : (kneel ? Math.max(P.hem, hipY + 20) : P.hem);
  const hemY = hem - bob;
  const flare = isGuy ? 4 : (o.gown ? 120 : (isFriend ? 26 : 16));
  const swing = sway * (isGuy ? .2 : .6);
  ctx.beginPath();
  ctx.moveTo(-P.sw + 2, sY - 2);
  ctx.quadraticCurveTo(0, sY - 12, P.sw - 2, sY - 2);
  ctx.quadraticCurveTo(P.sw + 9, sY + 6, P.sw + 6, sY + 40);
  if (o.gown) ctx.quadraticCurveTo(P.sw - 4, sY + 105, P.sw - 2, sY + 125);
  ctx.lineTo(P.sw + flare + swing, hemY);
  ctx.quadraticCurveTo(swing, hemY + 10, -P.sw - flare + swing, hemY);
  if (o.gown) ctx.lineTo(-P.sw + 2, sY + 125), ctx.quadraticCurveTo(-P.sw + 4, sY + 105, -P.sw - 6, sY + 40);
  else ctx.lineTo(-P.sw - 6, sY + 40);
  ctx.quadraticCurveTo(-P.sw - 9, sY + 6, -P.sw + 2, sY - 2);
  ctx.closePath();
  ctx.fillStyle = C(P.coat); ctx.fill();
  if (!sil) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = rgba(P.coatSh, .9); ctx.fillRect(-P.sw - 140, sY - 20, P.sw * .7 + 140, 600);
    if (!back) {
      // neckline / shirt / tie
      ctx.fillStyle = P.top;
      ctx.beginPath(); ctx.moveTo(-12, sY - 8); ctx.lineTo(12, sY - 8); ctx.lineTo(isGuy ? 3 : 0, sY + (isGuy ? 70 : 34)); ctx.closePath(); ctx.fill();
      if (P.tie) { ctx.fillStyle = P.tie; ctx.beginPath(); ctx.moveTo(-4, sY - 4); ctx.lineTo(5, sY - 4); ctx.lineTo(7, sY + 52); ctx.lineTo(1, sY + 62); ctx.lineTo(-4, sY + 52); ctx.closePath(); ctx.fill(); }
      // lapels / front edge
      ctx.strokeStyle = rgba('#000000', .14); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(3, sY + (isGuy ? 70 : 34)); ctx.lineTo(4 + swing * .5, hemY); ctx.stroke();
      if (isGuy) { ctx.fillStyle = rgba('#ffffff', .25); ctx.beginPath(); ctx.arc(8, sY + 92, 2.4, 0, TAU); ctx.arc(8, sY + 118, 2.4, 0, TAU); ctx.fill(); }
      if (isFriend) { ctx.fillStyle = rgba(P.coatSh, .8); ctx.fillRect(-P.sw - 20, sY + 120, 2 * P.sw + 50, 7); }
    } else {
      ctx.strokeStyle = rgba('#000000', .12); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, sY + 30); ctx.lineTo(swing * .5, hemY); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  if (back) { drawArm(shF, armF, o.holdF, false); drawArm(shN, armN, o.holdN, false); }

  // ---------- neck + head
  ctx.save();
  ctx.translate(hx, neckY + 6);
  ctx.rotate((o.headTilt || 0));
  ctx.translate(-hx, -(neckY + 6));
  ctx.fillStyle = C(P.skinSh); ctx.fillRect(hx - 8, neckY - 12, 16, 26);
  if (back) {
    if (isGirl) drawGirlBackView(ctx, P, C, hx, hy, sway, t);
    else if (isFriend) { ctx.fillStyle = C(P.hijab); drapePath(ctx, hx, hy, shoulderY, 1.06); ctx.fill(); ctx.beginPath(); ctx.arc(hx, hy - 2, R0 + 9, 0, TAU); ctx.fill(); if (!sil) { ctx.fillStyle = rgba(P.hijabSh, .6); ctx.beginPath(); ctx.arc(hx - 10, hy + 4, R0 + 2, Math.PI * .6, Math.PI * 1.4); ctx.fill(); } }
    else { ctx.fillStyle = C(P.skin); ctx.beginPath(); ctx.arc(hx, hy, R0, 0, TAU); ctx.fill(); ctx.fillStyle = C(P.hair); ctx.beginPath(); ctx.arc(hx, hy - 3, R0 + 2, Math.PI * .85, Math.PI * 2.15); ctx.quadraticCurveTo(hx, hy + 24, hx - R0 - 1, hy + 8); ctx.fill(); }
  } else {
    const hd = o.headDir || 1;
    ctx.save();
    if (hd < 0) { ctx.translate(hx * 2, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = C(P.skin); ctx.beginPath(); ctx.arc(hx, hy, R0, 0, TAU); ctx.fill();
    // jaw / chin
    ctx.beginPath(); ctx.ellipse(hx + 6, hy + 10, R0 * .86, R0 * .84, -.15, 0, TAU); ctx.fill();
    if (isFriend) drawHijab(ctx, P, C, hx, hy, shoulderY);
    if (!sil) {
      if (!isFriend) { ctx.fillStyle = P.skinSh; ellipse(ctx, hx - 19, hy + 4, 6, 9); ctx.fill(); }
      if (isGuy) { ctx.fillStyle = rgba('#2a1a12', .22); ctx.beginPath(); ctx.moveTo(hx - 22, hy + 6); ctx.quadraticCurveTo(hx - 12, hy + 38, hx + 12, hy + 40); ctx.quadraticCurveTo(hx + 30, hy + 36, hx + 34, hy + 18); ctx.quadraticCurveTo(hx + 16, hy + 26, hx - 8, hy + 18); ctx.closePath(); ctx.fill(); }
      drawFace(ctx, P, key, hx, hy, o, t);
    }
    if (isGirl) drawGirlFrontHair(ctx, P, C, hx, hy, sway, t);
    if (isGuy) drawGuyHair(ctx, P, C, hx, hy);
    ctx.restore();
  }
  ctx.restore();

  if (!back && o.handsFront) drawArm(shF, armF, o.holdF, true);
  if (!back) drawArm(shN, armN, o.holdN, false);
  ctx.restore();
  // expose hand positions (world) for interactions
  const toW = (p) => ({ x: o.x + p[0] * s * (o.dir || 1), y: o.y + p[1] * s });
  return { handN: toW(armN.h), handF: toW(armF.h), head: toW([hx, hy]) };
}

function drapePath(ctx, hx, hy, shoulderY, k) {
  ctx.beginPath();
  ctx.moveTo(hx - 40 * k, hy - 4);
  ctx.quadraticCurveTo(hx - 56 * k, shoulderY - 10, hx - 50 * k, shoulderY + 34);
  ctx.quadraticCurveTo(hx, shoulderY + 60, hx + 54 * k, shoulderY + 30);
  ctx.quadraticCurveTo(hx + 58 * k, shoulderY - 10, hx + 42 * k, hy - 4);
  ctx.closePath();
}
function drawHijab(ctx, P, C, hx, hy, shoulderY) {
  ctx.save();
  ctx.fillStyle = C(P.hijab);
  // outer wrap with face opening (even-odd)
  ctx.beginPath();
  ctx.arc(hx, hy - 3, P.headR + 10, 0, TAU);
  ctx.ellipse(hx + 8, hy + 5, 24, 30, -.08, 0, TAU);
  ctx.fill('evenodd');
  // fold under the chin falling on the chest
  ctx.beginPath();
  ctx.moveTo(hx - 34, hy + 14);
  ctx.quadraticCurveTo(hx + 4, hy + 50, hx + 36, hy + 18);
  ctx.quadraticCurveTo(hx + 52, hy + 40, hx + 44, shoulderY + 40);
  ctx.quadraticCurveTo(hx, shoulderY + 62, hx - 44, shoulderY + 36);
  ctx.quadraticCurveTo(hx - 50, hy + 34, hx - 34, hy + 14);
  ctx.fill();
  ctx.strokeStyle = C(P.hijabSh); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx - 20, hy + 40); ctx.quadraticCurveTo(hx + 6, hy + 58, hx + 34, hy + 38); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx + 8, hy + 5, 31, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
  ctx.restore();
}
function drawGirlBackHair(ctx, P, C, hx, hy, sway, t) {
  ctx.fillStyle = C(P.hair);
  const w2 = Math.sin(t * 2.1) * 3;
  ctx.beginPath();
  ctx.moveTo(hx - 34, hy - 8);
  ctx.bezierCurveTo(hx - 52, hy + 60, hx - 54 + sway * .6, hy + 150, hx - 46 + sway * 1.3, hy + 196);
  ctx.quadraticCurveTo(hx - 20 + sway * 1.5, hy + 210 + w2, hx + 6 + sway * 1.5, hy + 200);
  ctx.quadraticCurveTo(hx + 28 + sway * 1.4, hy + 212 - w2, hx + 44 + sway * 1.2, hy + 190);
  ctx.bezierCurveTo(hx + 50 + sway * .6, hy + 140, hx + 46, hy + 60, hx + 36, hy - 8);
  ctx.arc(hx, hy - 4, 37, -.1, Math.PI + .1, true);
  ctx.fill();
}
function drawGirlFrontHair(ctx, P, C, hx, hy, sway, t) {
  ctx.fillStyle = C(P.hair);
  ctx.beginPath();
  ctx.moveTo(hx - 36, hy + 10);
  ctx.arc(hx, hy - 3, 37, Math.PI * .96, Math.PI * 2.02);
  ctx.quadraticCurveTo(hx + 34, hy - 24, hx + 10, hy - 22);
  ctx.quadraticCurveTo(hx - 12, hy - 16, hx - 22, hy + 6);
  ctx.quadraticCurveTo(hx - 26, hy + 36, hx - 36, hy + 56);
  ctx.closePath();
  ctx.fill();
  // long strand over the near shoulder
  ctx.beginPath();
  ctx.moveTo(hx + 26, hy - 18);
  ctx.bezierCurveTo(hx + 48, hy + 10, hx + 40 + sway * .5, hy + 80, hx + 42 + sway, hy + 140);
  ctx.lineTo(hx + 30 + sway, hy + 138);
  ctx.bezierCurveTo(hx + 28 + sway * .5, hy + 80, hx + 36, hy + 20, hx + 20, hy - 6);
  ctx.closePath(); ctx.fill();
  if (P.hairHi && C(P.hair) === P.hair) {
    ctx.strokeStyle = rgba(P.hairHi, .8); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx + 2, hy - 4, 31, Math.PI * 1.2, Math.PI * 1.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 36, hy + 10); ctx.quadraticCurveTo(hx + 40 + sway * .3, hy + 60, hx + 37 + sway * .8, hy + 110); ctx.stroke();
    // small earring
    ctx.fillStyle = '#f2cf73'; ctx.beginPath(); ctx.arc(hx - 18, hy + 17, 2.6, 0, TAU); ctx.fill();
  }
}
function drawGirlBackView(ctx, P, C, hx, hy, sway, t) {
  ctx.fillStyle = C(P.hair);
  ctx.beginPath(); ctx.arc(hx, hy - 2, 37, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 36, hy);
  ctx.bezierCurveTo(hx - 50, hy + 60, hx - 52 + sway * .6, hy + 150, hx - 44 + sway * 1.3, hy + 198);
  ctx.quadraticCurveTo(hx + sway * 1.5, hy + 214, hx + 44 + sway * 1.3, hy + 198);
  ctx.bezierCurveTo(hx + 52 + sway * .6, hy + 150, hx + 50, hy + 60, hx + 36, hy);
  ctx.closePath(); ctx.fill();
  if (C(P.hair) === P.hair) {
    ctx.strokeStyle = rgba(P.hairHi, .7); ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(hx + i * 14, hy - 20); ctx.bezierCurveTo(hx + i * 20, hy + 60, hx + i * 18 + sway, hy + 130, hx + i * 16 + sway * 1.3, hy + 190); ctx.stroke(); }
  }
}
function drawVeil(ctx, C, hx, hy, sway) {
  ctx.fillStyle = C('#ffffff');
  ctx.beginPath();
  ctx.moveTo(hx - 20, hy - 30);
  ctx.bezierCurveTo(hx - 90, hy + 80, hx - 120 + sway, hy + 260, hx - 150 + sway * 2, hy + 420);
  ctx.lineTo(hx - 30 + sway, hy + 420);
  ctx.bezierCurveTo(hx - 10, hy + 200, hx + 10, hy + 40, hx + 20, hy - 30);
  ctx.closePath(); ctx.fill();
}
function drawGuyHair(ctx, P, C, hx, hy) {
  ctx.fillStyle = C(P.hair);
  ctx.beginPath();
  ctx.moveTo(hx - 34, hy + 8);
  ctx.arc(hx, hy - 3, 36, Math.PI * .93, Math.PI * 1.98);
  ctx.quadraticCurveTo(hx + 38, hy - 18, hx + 28, hy - 20);
  ctx.quadraticCurveTo(hx + 4, hy - 26, hx - 16, hy - 14);
  ctx.quadraticCurveTo(hx - 22, hy - 2, hx - 26, hy + 12);
  ctx.closePath(); ctx.fill();
  ellipse(ctx, hx + 6, hy - 34, 30, 10, -.12); ctx.fill();
  ctx.fillRect(hx - 30, hy - 4, 7, 20); // sideburn
  if (C(P.hair) === P.hair) { ctx.strokeStyle = rgba(P.hairHi, .9); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx + 4, hy - 8, 30, Math.PI * 1.25, Math.PI * 1.6); ctx.stroke(); }
}

// expr: neutral | smile | laugh | surprised | shy | cry | crysmile | joy | shock
function drawFace(ctx, P, key, hx, hy, o, t) {
  const fx = hx + 8, expr = o.expr || 'smile';
  const look = o.look || 0;
  const bl = (() => { const b = ((t + (o.x || 0) * .003) % 3.7); return b < .12 ? Math.abs(b - .06) / .06 : 1; })();
  const closed = expr === 'laugh' || expr === 'shy' || expr === 'cry' || expr === 'joy';
  const sad = expr === 'sad';
  const girlish = key !== 'guy' && key !== 'groom';
  ctx.save();
  // blush
  const blush = expr === 'shy' ? .55 : expr === 'cry' || expr === 'crysmile' || expr === 'joy' ? .45 : .28;
  glow(ctx, fx - 16, hy + 13, 13, '#ff8a8a', blush);
  glow(ctx, fx + 21, hy + 13, 11, '#ff8a8a', blush * .9);
  const eyes = [[fx - 9, hy + 1, .85], [fx + 12, hy + 1, 1]];
  ctx.strokeStyle = '#2a1b17'; ctx.fillStyle = '#2a1b17'; ctx.lineCap = 'round';
  eyes.forEach(([ex, ey, k]) => {
    ex += look * 2;
    if (closed) {
      ctx.lineWidth = 2.6; ctx.beginPath();
      if (expr === 'cry') ctx.arc(ex, ey + 3, 4.5 * k, Math.PI * 1.1, Math.PI * 1.9);
      else ctx.arc(ex, ey + 2, 4.8 * k, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else {
      const big = expr === 'surprised' || expr === 'shock' ? 1.25 : 1;
      ellipse(ctx, ex, ey, 3.3 * k * big, 4.6 * big * bl); ctx.fill();
      if (bl > .5) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + 1, ey - 1.5, 1.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a1b17'; }
      if (expr === 'crysmile') { ctx.fillStyle = rgba('#bfe6ff', .9); ellipse(ctx, ex, ey + 4.5, 3.4 * k, 1.6); ctx.fill(); ctx.fillStyle = '#2a1b17'; }
    }
    if (girlish && !closed) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ex + 3 * k, ey - 3); ctx.lineTo(ex + 6 * k, ey - 6); ctx.stroke(); }
    // brows
    const raise = expr === 'surprised' || expr === 'shock' ? -5 : expr === 'cry' ? -2 : 0;
    const tilt = expr === 'cry' || expr === 'crysmile' || sad ? -.25 : 0;
    ctx.lineWidth = girlish ? 2 : 3; ctx.strokeStyle = girlish ? '#3a2219' : '#1d130f';
    ctx.save(); ctx.translate(ex, ey - 10 + raise); ctx.rotate(tilt * (k < 1 ? 1 : -1));
    ctx.beginPath(); ctx.moveTo(-4.5 * k, 1); ctx.quadraticCurveTo(0, -2, 4.5 * k, .5); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#2a1b17';
  });
  // nose
  ctx.strokeStyle = rgba('#7a4a3a', .55); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx + 16, hy + 3); ctx.quadraticCurveTo(fx + 21, hy + 10, fx + 15, hy + 12); ctx.stroke();
  // mouth
  const mx = fx + 4, my = hy + 20;
  ctx.strokeStyle = P.lips; ctx.fillStyle = '#7a2b2e'; ctx.lineWidth = 2.6;
  if (expr === 'laugh' || expr === 'joy') {
    ctx.beginPath(); ctx.moveTo(mx - 8, my - 2); ctx.quadraticCurveTo(mx + 1, my + 13, mx + 10, my - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 5, my - 2, 12, 2.5);
  } else if (expr === 'surprised' || expr === 'shock') {
    ellipse(ctx, mx + 1, my + 2, expr === 'shock' ? 4.5 : 3.2, expr === 'shock' ? 6 : 4); ctx.fill();
  } else if (expr === 'neutral') {
    ctx.beginPath(); ctx.moveTo(mx - 5, my); ctx.quadraticCurveTo(mx + 1, my + 2, mx + 7, my); ctx.stroke();
  } else if (expr === 'cry' || sad) {
    ctx.beginPath(); ctx.moveTo(mx - 5, my + 2); ctx.quadraticCurveTo(mx + 1, my - 2, mx + 7, my + 2); ctx.stroke();
  } else {
    const w = expr === 'shy' ? 5 : 7;
    ctx.beginPath(); ctx.moveTo(mx - w, my - 1); ctx.quadraticCurveTo(mx + 1, my + 7, mx + w + 2, my - 2); ctx.stroke();
  }
  // tears
  const tears = o.tears || 0;
  if (tears > 0) {
    eyes.forEach(([ex, ey], i) => {
      for (let d = 0; d < 2; d++) {
        const p = ((t * .55 + i * .37 + d * .5) % 1);
        const y = ey + 6 + p * 26;
        ctx.fillStyle = rgba('#d6f0ff', tears * (1 - p) * .95);
        ctx.beginPath(); ctx.moveTo(ex + 1, y - 4); ctx.quadraticCurveTo(ex + 4, y + 2, ex + 1, y + 3); ctx.quadraticCurveTo(ex - 2, y + 2, ex + 1, y - 4); ctx.fill();
      }
      ctx.strokeStyle = rgba('#e8f7ff', tears * .5); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex + 1, ey + 6); ctx.lineTo(ex + 1.5, ey + 22); ctx.stroke();
    });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- roses
// side view rose held by the stem; (x,y) is the grip, angle = hand direction
function roseSide(ctx, x, y, s = 1, tilt = 0, open = .7) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s, s);
  ctx.strokeStyle = '#2f6b33'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 28); ctx.quadraticCurveTo(3, -10, 0, -62); ctx.stroke();
  ctx.fillStyle = '#3d7d3a';
  ellipse(ctx, 10, -22, 12, 5, -.5); ctx.fill();
  ellipse(ctx, -9, -38, 10, 4.5, .6); ctx.fill();
  ctx.translate(0, -74);
  rosebud(ctx, 1, open);
  ctx.restore();
}
function rosebud(ctx, s, open = .7) {
  ctx.save(); ctx.scale(s, s);
  ctx.fillStyle = '#2f6b33';
  ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(0, 16); ctx.lineTo(12, 10); ctx.lineTo(0, 4); ctx.fill();
  const w = 15 + open * 7;
  const g = ctx.createRadialGradient(-4, -6, 2, 0, 0, 26);
  g.addColorStop(0, '#e2364d'); g.addColorStop(.6, '#b3122e'); g.addColorStop(1, '#6e0a1c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-w, -6); ctx.quadraticCurveTo(-w - 2, 14, 0, 14); ctx.quadraticCurveTo(w + 2, 14, w, -6);
  ctx.quadraticCurveTo(w * .6, -2, w * .3, -14 - open * 4); ctx.quadraticCurveTo(0, -22, -w * .3, -14 - open * 4); ctx.quadraticCurveTo(-w * .6, -2, -w, -6); ctx.fill();
  ctx.fillStyle = '#8f0c24';
  ctx.beginPath(); ctx.moveTo(-w * .55, -8); ctx.quadraticCurveTo(0, 6, w * .55, -8); ctx.quadraticCurveTo(0, -18, -w * .55, -8); ctx.fill();
  ctx.strokeStyle = rgba('#ff8a9a', .55); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-w * .8, -2); ctx.quadraticCurveTo(-w * .4, 10, w * .2, 6); ctx.stroke();
  ctx.restore();
}
// top view blooming rose; open in [0,1]
function roseTop(ctx, x, y, r, open = 1, rot = 0, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
  const layers = 5;
  for (let L = layers - 1; L >= 0; L--) {
    const n = 5 + L;
    const lr = r * (.25 + .75 * (L / (layers - 1))) * (L === layers - 1 ? lerp(.35, 1, open) : lerp(.5, 1, open));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + L * .55;
      ctx.save(); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, 0, -lr);
      const dark = L / layers;
      g.addColorStop(0, mix('#4a0614', '#8a0c22', 1 - dark * .3));
      g.addColorStop(.75, mix('#b3122e', '#d8243f', 1 - dark));
      g.addColorStop(1, mix('#e33a55', '#ff7186', .3 * (1 - dark)));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-lr * .62, -lr * .25, -lr * .55, -lr * 1.02, 0, -lr);
      ctx.bezierCurveTo(lr * .55, -lr * 1.02, lr * .62, -lr * .25, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,0,10,.25)'; ctx.lineWidth = r * .012; ctx.stroke();
      ctx.restore();
    }
  }
  // tight centre spiral
  ctx.strokeStyle = 'rgba(70,0,15,.6)'; ctx.lineWidth = r * .03;
  ctx.beginPath();
  for (let u = 0; u < 1; u += .02) { const a = u * 14, rr = r * .22 * u; u === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.stroke();
  ctx.restore();
}
function leaf(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const g = ctx.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#1f4d24'); g.addColorStop(1, '#3f8a3f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * .5, -s * .35, s, 0); ctx.quadraticCurveTo(s * .5, s * .35, 0, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(200,255,200,.25)'; ctx.lineWidth = s * .03; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * .9, 0); ctx.stroke();
  ctx.restore();
}
// a rose growing from a screen edge
function bloomCorner(ctx, x, y, s, k, rot) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const g = easeOut(k);
  ctx.strokeStyle = '#2b5f2e'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(60 * s, -60 * s * g, 120 * s * g, -150 * s * g); ctx.stroke();
  leaf(ctx, 50 * s * g, -50 * s * g, 70 * s * g, -1.1);
  leaf(ctx, 90 * s * g, -110 * s * g, 60 * s * g, .3);
  roseTop(ctx, 120 * s * g, -150 * s * g, 70 * s * ss(k, .3, 1), ss(k, .4, 1), k * .8, 1);
  ctx.restore();
}

// ---------------------------------------------------------------- hands (close-ups)
// stylised elegant hand, palm down, fingers pointing to +x. Unit ~ 100px long.
function drawHand(ctx, x, y, s, rot, o = {}) {
  const skin = o.skin || '#f3cfb4', sh = o.shade || '#e0b091';
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s * (o.flip || 1));
  if (o.sleeve) {
    ctx.fillStyle = o.sleeve; rrect(ctx, -165, -38, 125, 76, 22); ctx.fill();
    ctx.fillStyle = rgba('#000000', .1); ctx.fillRect(-165, 12, 125, 26);
  }
  // hand + fingers as one soft shape (no claw-like gaps)
  const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, mix(skin, '#ffffff', .12)); g.addColorStop(1, sh);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-50, -24);
  ctx.quadraticCurveTo(-6, -32, 30, -27);
  ctx.quadraticCurveTo(70, -26, 92, -17);
  ctx.quadraticCurveTo(104, -12, 98, -4);
  ctx.quadraticCurveTo(104, 2, 97, 7);
  ctx.quadraticCurveTo(100, 14, 90, 17);
  ctx.quadraticCurveTo(78, 24, 66, 22);
  ctx.quadraticCurveTo(40, 26, 28, 24);
  ctx.quadraticCurveTo(-10, 30, -50, 24);
  ctx.closePath(); ctx.fill();
  // finger separations
  ctx.strokeStyle = rgba('#a8705a', .35); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  [[-11, 95], [0, 97], [11, 88]].forEach(([fy, end]) => { ctx.beginPath(); ctx.moveTo(44, fy * .9); ctx.quadraticCurveTo(70, fy, end - 6, fy * 1.05); ctx.stroke(); });
  // knuckles
  ctx.fillStyle = rgba('#c58f72', .16); ellipse(ctx, 34, 0, 9, 22); ctx.fill();
  // nails
  ctx.fillStyle = rgba('#ffffff', .5);
  [[-13, 92], [-3, 96], [7, 93], [15, 84]].forEach(([ny, nx]) => { ellipse(ctx, nx - 5, ny, 5, 3.4); ctx.fill(); });
  if (o.ring != null) ringBand(ctx, 60, 6, 11, o.ring);
  // thumb along the near edge
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.moveTo(-26, -20); ctx.quadraticCurveTo(10, -44, 42, -36); ctx.quadraticCurveTo(52, -32, 44, -26); ctx.quadraticCurveTo(14, -24, -8, -12); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function ringBand(ctx, x, y, w, k) {
  ctx.save();
  ctx.fillStyle = goldGrad(ctx, x - 4, y - w, x + 4, y + w);
  rrect(ctx, x - 3.5, y - w / 2 - 2, 7, w + 4, 3); ctx.fill();
  // diamond
  ctx.translate(x, y - w / 2 - 6);
  ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(160,200,255,.7)'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 0); ctx.fill();
  if (k > 0) star(ctx, 0, -2, 22 * k, k);
  ctx.restore();
}
function star(ctx, x, y, r, a = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(a);
  glow(ctx, x, y, r * 1.6, '#fff6d8', .9);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * .18, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * .18, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y, x, y + r * .18); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y - r * .18); ctx.quadraticCurveTo(x, y, x - r, y); ctx.fill();
  ctx.restore();
}
// two hands holding: his from below-right, hers resting from the left
function claspedHands(ctx, x, y, s, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(s, s);
  const br = Math.sin(t * 1.2) * 2;
  // his hand from the right, palm up, underneath
  drawHand(ctx, 78, 16 + br, 1, Math.PI - .06, { skin: CAST.guy.skin, shade: CAST.guy.skinSh, sleeve: CAST.guy.coat, flip: -1 });
  // her hand from the left resting on his palm
  drawHand(ctx, -70, -4 - br, .92, .06, { skin: CAST.girl.skin, shade: CAST.girl.skinSh, sleeve: CAST.girl.coat });
  // his thumb closing over her hand
  ctx.fillStyle = CAST.guy.skin;
  ctx.beginPath(); ctx.moveTo(62, -2 + br); ctx.quadraticCurveTo(30, -34 + br, -4, -26 + br); ctx.quadraticCurveTo(-14, -22 + br, -4, -16 + br); ctx.quadraticCurveTo(26, -14 + br, 52, 12 + br); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// ---------------------------------------------------------------- props
function propPaper(ctx, x, y, a, s = 1, folded = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a * .2 - .3); ctx.scale(s, s);
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(-4, -34, 34, 44);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-4, -34, 34, 4);
  ctx.strokeStyle = 'rgba(60,70,110,.45)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(1, -24 + i * 7); ctx.lineTo(24 - (i % 2) * 6, -24 + i * 7); ctx.stroke(); }
  if (folded) { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(13, -34, 17, 44); }
  ctx.restore();
}
function propPapers(ctx, x, y) { // a stack hugged against the chest
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.06);
  for (let i = 2; i >= 0; i--) { ctx.fillStyle = i ? '#ece8de' : '#ffffff'; ctx.fillRect(-36 + i * 3, -56 + i * 2, 62, 80); }
  ctx.fillStyle = '#3e5f8a'; ctx.fillRect(-36, -56, 62, 9);
  ctx.strokeStyle = 'rgba(60,70,110,.35)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-28, -36 + i * 9); ctx.lineTo(16, -36 + i * 9); ctx.stroke(); }
  ctx.restore();
}
function propPhone(ctx, x, y, a, glowA = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.2);
  ctx.fillStyle = '#16171c'; rrect(ctx, -14, -26, 28, 48, 5); ctx.fill();
  const g = ctx.createLinearGradient(0, -22, 0, 18); g.addColorStop(0, '#fff2d6'); g.addColorStop(1, '#ffc9a8');
  ctx.fillStyle = g; rrect(ctx, -11, -22, 22, 40, 3); ctx.fill();
  ctx.restore();
  glow(ctx, x, y - 20, 80, '#ffe1b0', .35 * glowA);
}
function propSuitcase(ctx, hx, hy, dir = 1) {
  ctx.save(); ctx.translate(hx, hy);
  ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30 * dir, 92); ctx.stroke();
  ctx.translate(-30 * dir, 92);
  ctx.rotate(-.35 * dir);
  ctx.fillStyle = '#8a3b46'; rrect(ctx, -40, 0, 80, 120, 10); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-40, 54, 80, 6);
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 22, 8); ctx.lineTo(i * 22, 112); ctx.stroke(); }
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-28, 124, 7, 0, TAU); ctx.arc(28, 124, 7, 0, TAU); ctx.fill();
  ctx.restore();
}
function bouquet(ctx, x, y, s, t, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  // wrap
  const g = ctx.createLinearGradient(-50, 0, 50, 0); g.addColorStop(0, '#d9c7a7'); g.addColorStop(.5, '#f6ecd8'); g.addColorStop(1, '#cdb894');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-58, -40); ctx.lineTo(58, -40); ctx.lineTo(10, 90); ctx.lineTo(-10, 90); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8e1b2a'; ctx.fillRect(-13, 40, 26, 11);
  ellipse(ctx, -14, 45, 13, 7, -.3); ctx.fill(); ellipse(ctx, 14, 45, 13, 7, .3); ctx.fill();
  ctx.fillStyle = '#6e1220'; ctx.beginPath(); ctx.arc(0, 45, 5, 0, TAU); ctx.fill();
  // leaves + roses
  for (let i = 0; i < 6; i++) leaf(ctx, -40 + i * 16, -40, 34, -2.2 + i * .5);
  const P = [[-34, -52], [0, -60], [34, -52], [-18, -80], [18, -80], [0, -98], [-44, -76], [44, -76]];
  P.forEach(([px, py], i) => roseTop(ctx, px, py + Math.sin(t * 1.3 + i) * 1.2, 21, .9, i * 1.3));
  ctx.restore();
}
function ringBox(ctx, x, y, s, open, sparkle) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // base
  const g = ctx.createLinearGradient(0, -10, 0, 60); g.addColorStop(0, '#9a1830'); g.addColorStop(1, '#4e0814');
  ctx.fillStyle = g; rrect(ctx, -60, -6, 120, 64, 10); ctx.fill();
  ctx.fillStyle = '#2a040b'; rrect(ctx, -52, -6, 104, 22, 6); ctx.fill();
  // ring in the slot
  if (open > .2) {
    ctx.save(); ctx.globalAlpha = ss(open, .2, .6);
    ctx.strokeStyle = goldGrad(ctx, -20, -40, 20, 0); ctx.lineWidth = 6;
    ellipse(ctx, 0, -8, 18, 22); ctx.stroke();
    ctx.fillStyle = '#eef8ff'; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(10, -34); ctx.lineTo(0, -24); ctx.lineTo(-10, -34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,190,255,.7)'; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(10, -34); ctx.lineTo(0, -34); ctx.fill();
    ctx.restore();
    star(ctx, 2, -36, 46 * sparkle, sparkle);
  }
  // lid hinged at the back edge
  ctx.save(); ctx.translate(0, -6);
  const k = Math.cos(open * Math.PI * .62); // 1 closed -> negative open
  ctx.scale(1, k);
  const lg = ctx.createLinearGradient(0, -50, 0, 0); lg.addColorStop(0, '#b62040'); lg.addColorStop(1, '#6e0c1e');
  ctx.fillStyle = lg; rrect(ctx, -60, -46, 120, 46, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-52, -40, 104, 6);
  ctx.restore();
  ctx.restore();
}
function goldRings(ctx, x, y, r, a = 1, t = 0) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.lineWidth = r * .16;
  [[-r * .42, 0], [r * .42, 0]].forEach(([dx, dy], i) => {
    ctx.strokeStyle = goldGrad(ctx, x + dx - r, y - r, x + dx + r, y + r);
    ellipse(ctx, x + dx, y + dy, r * .72, r * .72); ctx.stroke();
  });
  star(ctx, x - r * .9, y - r * .5, r * .5 * (.6 + .4 * Math.sin(t * 3)), .9);
  ctx.restore();
}
