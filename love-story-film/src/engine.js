// Engine: composes scenes + transitions for any time t (seconds).
// Deterministic: the same t always produces the same frame, so the film can
// be played live in a browser or rendered frame-by-frame to video.
'use strict';

const FILM = (() => {
  let canvas, ctx, buf, bctx, scale = 1;
  function init(c, s = 1) {
    canvas = c; scale = s;
    canvas.width = Math.round(W * s); canvas.height = Math.round(H * s);
    ctx = canvas.getContext('2d');
    buf = document.createElement('canvas'); buf.width = canvas.width; buf.height = canvas.height; bctx = buf.getContext('2d');
    BUF2 = document.createElement('canvas'); BUF2.width = canvas.width; BUF2.height = canvas.height; B2 = BUF2.getContext('2d');
  }
  function drawScene(c, i, t) {
    c.save(); c.setTransform(scale, 0, 0, scale, 0, 0);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    SCENES[i](c, t - SC[i].start, t);
    c.restore();
  }
  function overlay(i, k) { // transition effect across boundary i -> i+1
    const tr = TRANSITIONS[i];
    ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (tr.type === 'petals') petalSweep(ctx, k, 7 + i, tr.color);
    if (tr.type === 'flare') goldFlare(ctx, k);
    if (tr.type === 'lines') { goldLines(ctx, k, 3 + i); goldFlare(ctx, k * .6 + .2); }
    ctx.restore();
  }
  function render(t) {
    t = clamp(t, 0, TL.total - 1e-3);
    let i = SC.findIndex(s => t < s.start + s.dur); if (i < 0) i = SC.length - 1;
    const end = SC[i].start + SC[i].dur, start = SC[i].start;
    let a = -1, k = 0;
    if (i < SC.length - 1 && t > end - TRANSITIONS[i].d) { a = i; k = (t - (end - TRANSITIONS[i].d)) / (2 * TRANSITIONS[i].d); }
    else if (i > 0 && t < start + TRANSITIONS[i - 1].d) { a = i - 1; k = (t - (start - TRANSITIONS[i - 1].d)) / (2 * TRANSITIONS[i - 1].d); }
    if (a < 0) drawScene(ctx, i, t);
    else {
      const tr = TRANSITIONS[a];
      const mixK = tr.type === 'match' ? easeIO(k) : ss(k, .3, .7);
      drawScene(ctx, a, t);
      if (mixK > 0) {
        drawScene(bctx, a + 1, t);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = mixK; ctx.drawImage(buf, 0, 0); ctx.restore();
      }
      overlay(a, k);
    }
    ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0); vignette(ctx, .42); ctx.restore();
  }
  return { init, render, get total() { return TL.total; } };
})();
