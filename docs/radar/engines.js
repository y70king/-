/*
 * رادار الذهب — يقرأ الاتجاه من الفريمات العالية (4 ساعات، ساعة، 15 دقيقة) ويعطي الإشارة على فريم 5 دقائق.
 * محركان مستقلان:
 *   1) محرك الفجوات (FVG): آخر فجوة سعرية غير مملوءة باتجاه الترند ← أمر معلق على حافتها.
 *   2) محرك نقطة التحكم (POC): آخر موجة اندفاع ← أعلى سعر تداولاً (Volume Profile) ← أمر معلق عليه.
 * كل محرك يعطي إشارته على حدة. يعمل في المتصفح (window.Radar) وفي Node للاختبار.
 */
(function (root) {
  "use strict";

  const Defaults = {
    trendEma: 50,          // اتجاه كل فريم: الإغلاق فوق/تحت EMA50 مع ميلها
    minGrade: 1,           // أقل درجة تُعرض: 3 ذهبية · 2 جيدة · 1 خطرة (الكل)
    trendSlopeBars: 4,
    atrPeriod: 14,
    // الفجوات
    fvgMinAtr: 0.6,        // أصغر فجوة مقبولة × ATR (الفجوات الصغيرة خسرت في الاختبار)
    fvgLookback: 48,       // آخر 4 ساعات على فريم 5 دقائق
    fvgSlPadAtr: 0.15,     // هامش الوقف خلف شمعة الفجوة × ATR
    fvgTp1R: 1.0,
    fvgTp2R: 1.5,
    // POC
    swingN: 3,             // قمة/قاع = أعلى/أدنى من 3 شموع على كل جانب
    legMinAtr: 3.0,        // أقل حجم لموجة الاندفاع × ATR
    pocBin: 0.5,           // دقة توزيع الفوليوم بالدولار
    pocSlUsd: 0,           // وقف POC بالدولار (0 = خلف بداية الموجة)
    // وقف/هدف ثابتان للمحركين (0 = المستويات الهيكلية)
    fixedSl: 0,
    fixedTp: 0,
  };

  function ema(values, period) {
    const k = 2 / (period + 1), out = new Array(values.length);
    let prev = values[0];
    for (let i = 0; i < values.length; i++) { prev = i ? values[i] * k + prev * (1 - k) : values[i]; out[i] = prev; }
    return out;
  }

  function atr(bars, period) {
    const tr = bars.map((b, i) => i
      ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))
      : b.high - b.low);
    const out = new Array(bars.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < tr.length; i++) {
      sum += tr[i];
      if (i >= period) sum -= tr[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function trendOf(bars, cfg) {
    if (!bars || bars.length < cfg.trendEma + cfg.trendSlopeBars + 2) return 0;
    const closed = bars.slice(0, -1);                         // الشمعة الحالية لم تُغلق بعد
    const e = ema(closed.map(b => b.close), cfg.trendEma);
    const n = closed.length - 1, c = closed[n].close;
    const slope = e[n] - e[n - cfg.trendSlopeBars];
    if (c > e[n] && slope > 0) return 1;
    if (c < e[n] && slope < 0) return -1;
    return 0;
  }

  function withFixed(sig, cfg) {
    const d = sig.dir;
    if (cfg.fixedSl > 0) sig.sl = sig.entry - d * cfg.fixedSl;
    if (cfg.fixedTp > 0) { sig.tp2 = sig.entry + d * cfg.fixedTp; sig.tp1 = sig.entry + d * cfg.fixedTp / 2; }
    sig.risk = Math.abs(sig.entry - sig.sl);
    return sig;
  }

  // ───────── محرك الفجوات ─────────
  // اتجاه الإشارة: أقرب فريم عنده اتجاه (15د ثم ساعة ثم 4س)
  function bias(t) { return t.m15 || t.h1 || t.h4 || 0; }

  // درجة الإشارة حسب اتفاق الفريمات العالية مع اتجاهها
  //   3 ذهبية: الثلاثة متفقة · 2 جيدة: اثنين متفقين والثالث محايد · 1 خطرة: غير ذلك
  function grade(t, dir) {
    const v = [t.h4, t.h1, t.m15];
    const agree = v.filter(x => x === dir).length, oppose = v.filter(x => x === -dir).length;
    if (agree === 3) return 3;
    if (agree === 2 && oppose === 0) return 2;
    return 1;
  }
  const NO_BIAS = "كل الفريمات العالية محايدة، ماكو اتجاه";

  function fvgEngine(bars5, dir, cfg = Defaults) {
    if (!dir) return { has: false, reason: NO_BIAS };
    const a = atr(bars5, cfg.atrPeriod);
    const n = bars5.length - 1;                    // الشمعة الحالية (قيد التكوين)
    const price = bars5[n].close, A = a[n - 1];
    if (!(A > 0)) return { has: false, reason: "بيانات غير كافية" };

    for (let i = n - 1; i >= Math.max(2, n - cfg.fvgLookback); i--) {
      const c0 = bars5[i - 2], c1 = bars5[i - 1], c2 = bars5[i];
      let top, bottom;
      if (dir === 1) { bottom = c0.high; top = c2.low; }
      else { top = c0.low; bottom = c2.high; }
      if (top - bottom < cfg.fvgMinAtr * A) continue;

      // هل امتلأت أو كُسرت بعد تكوّنها؟ وهل لمسها السعر (حافة الدخول) بعد تكوّنها؟
      let broken = false, touched = false;
      for (let j = i + 1; j <= n; j++) {
        if (dir === 1) { if (bars5[j].low < bottom) broken = true; if (bars5[j].low <= top) touched = true; }
        else { if (bars5[j].high > top) broken = true; if (bars5[j].high >= bottom) touched = true; }
      }
      if (broken) continue;
      const entry = dir === 1 ? top : bottom;
      if (touched) return { has: false, reason: "السعر رجع للفجوة الأخيرة، بانتظار فجوة جديدة" };

      const extreme = dir === 1 ? Math.min(c0.low, c1.low) : Math.max(c0.high, c1.high);
      const sl = extreme - dir * cfg.fvgSlPadAtr * A;
      const risk = Math.abs(entry - sl);
      return {
        has: true, engine: "fvg", dir, entry, sl, risk,
        tp1: entry + dir * risk * cfg.fvgTp1R, tp2: entry + dir * risk * cfg.fvgTp2R,
        zoneTop: top, zoneBottom: bottom, time: c2.time,
        id: `fvg-${dir}-${c2.time}`, price,
      };
    }
    return { has: false, reason: `لا توجد فجوة ${dir === 1 ? "صاعدة" : "هابطة"} غير مملوءة حالياً` };
  }

  // ───────── محرك نقطة التحكم POC ─────────
  function swings(bars, k) {
    const hi = [], lo = [];
    for (let i = k; i < bars.length - k; i++) {
      let isH = true, isL = true;
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (bars[j].high >= bars[i].high) isH = false;
        if (bars[j].low <= bars[i].low) isL = false;
      }
      if (isH) hi.push(i); if (isL) lo.push(i);
    }
    return { hi, lo };
  }

  function volumeProfilePoc(bars, from, to, bin) {
    let lo = Infinity, hi = -Infinity;
    for (let i = from; i <= to; i++) { lo = Math.min(lo, bars[i].low); hi = Math.max(hi, bars[i].high); }
    const base = Math.floor(lo / bin) * bin, nb = Math.max(1, Math.ceil((hi - base) / bin) + 1);
    const vol = new Array(nb).fill(0);
    for (let i = from; i <= to; i++) {
      const b = bars[i], v = b.volume || 1;
      const s = Math.floor((b.low - base) / bin), e = Math.floor((b.high - base) / bin);
      for (let x = s; x <= e; x++) vol[x] += v / (e - s + 1);
    }
    let best = 0;
    for (let x = 1; x < nb; x++) if (vol[x] > vol[best]) best = x;
    return base + (best + 0.5) * bin;
  }

  function pocEngine(bars5, dir, cfg = Defaults) {
    if (!dir) return { has: false, reason: NO_BIAS };
    const a = atr(bars5, cfg.atrPeriod);
    const n = bars5.length - 1, price = bars5[n].close, A = a[n - 1];
    const { hi, lo } = swings(bars5.slice(0, n), cfg.swingN);   // قمم وقيعان مؤكدة من شموع مغلقة
    if (!hi.length || !lo.length || !(A > 0)) return { has: false, reason: "بيانات غير كافية" };

    // الموجة: من آخر قاع إلى القمة التي بعده (صعود) أو العكس (هبوط)
    let start, end;
    if (dir === 1) {
      end = hi[hi.length - 1];
      const before = lo.filter(i => i < end);
      if (!before.length) return { has: false, reason: "لا توجد موجة صاعدة مكتملة" };
      start = before[before.length - 1];
    } else {
      end = lo[lo.length - 1];
      const before = hi.filter(i => i < end);
      if (!before.length) return { has: false, reason: "لا توجد موجة هابطة مكتملة" };
      start = before[before.length - 1];
    }
    const legHi = dir === 1 ? bars5[end].high : bars5[start].high;
    const legLo = dir === 1 ? bars5[start].low : bars5[end].low;
    if (legHi - legLo < cfg.legMinAtr * A) return { has: false, reason: "آخر موجة ضعيفة (أصغر من الحد المطلوب)" };

    const poc = volumeProfilePoc(bars5, start, end, cfg.pocBin);
    // هل رجع السعر للـ POC بعد نهاية الموجة؟ وهل كُسرت الموجة؟
    for (let j = end + 1; j <= n; j++) {
      if (dir === 1 && bars5[j].low <= poc) return { has: false, reason: "السعر رجع لنقطة التحكم، بانتظار موجة جديدة" };
      if (dir === -1 && bars5[j].high >= poc) return { has: false, reason: "السعر رجع لنقطة التحكم، بانتظار موجة جديدة" };
    }
    const entry = poc;
    const sl = cfg.pocSlUsd > 0 ? entry - dir * cfg.pocSlUsd : (dir === 1 ? legLo : legHi) - dir * 0.15 * A;
    const tp2 = dir === 1 ? legHi : legLo;
    if (dir * (tp2 - entry) <= 0) return { has: false, reason: "الهدف غير صالح" };
    return {
      has: true, engine: "poc", dir, entry, sl, risk: Math.abs(entry - sl),
      tp1: entry + (tp2 - entry) / 2, tp2, legHi, legLo, time: bars5[end].time,
      id: `poc-${dir}-${bars5[start].time}-${bars5[end].time}`, price,
    };
  }

  // frames = { m15, h1, h4 } شموع الفريمات العالية
  function analyze(bars5, frames, cfg) {
    const c = Object.assign({}, Defaults, cfg || {});
    const trends = { h4: trendOf(frames.h4, c), h1: trendOf(frames.h1, c), m15: trendOf(frames.m15, c) };
    const dir = bias(trends), g = dir ? grade(trends, dir) : 0;
    const f = fvgEngine(bars5, dir, c), p = pocEngine(bars5, dir, c);
    for (const s of [f, p]) {
      if (!s.has) continue;
      withFixed(s, c); s.grade = g;
      if (g < c.minGrade) Object.assign(s, { has: false, reason: "الإشارة أقل من الدرجة المختارة بالإعدادات" });
    }
    return { trends, bias: dir, grade: g, fvg: f, poc: p };
  }

  // متابعة إشارة محفوظة على الشموع اللاحقة: انتظار الدخول ← دخلت ← هدف/وقف
  function track(sig, bars5, expiryMs = 12 * 3600e3) {
    let state = sig.state || "pending", enteredAt = sig.enteredAt || null, closedAt = null, result = null;
    if (state === "win" || state === "loss" || state === "expired") return sig;
    for (const b of bars5) {
      if (b.time <= sig.time) continue;
      if (state === "active" && enteredAt && b.time < enteredAt) continue;   // متابعة صفقة دخلت سابقاً
      if (state === "pending") {
        const hitEntry = sig.dir === 1 ? b.low <= sig.entry : b.high >= sig.entry;
        const ranAway = sig.dir === 1 ? b.high >= sig.tp2 : b.low <= sig.tp2;
        if (hitEntry) { state = "active"; enteredAt = b.time; }
        else if (ranAway || b.time - sig.time > expiryMs) { state = "expired"; closedAt = b.time; break; }
        else continue;
      }
      if (state === "active") {
        const hitSl = sig.dir === 1 ? b.low <= sig.sl : b.high >= sig.sl;          // الوقف أولاً (تقدير متحفظ)
        const hitTp = sig.dir === 1 ? b.high >= sig.tp2 : b.low <= sig.tp2;
        if (hitSl) { state = "loss"; result = -Math.abs(sig.entry - sig.sl); closedAt = b.time; break; }
        if (hitTp) { state = "win"; result = Math.abs(sig.tp2 - sig.entry); closedAt = b.time; break; }
      }
    }
    return Object.assign({}, sig, { state, enteredAt, closedAt, result });
  }

  const api = { Defaults, ema, atr, trendOf, bias, grade, swings, volumeProfilePoc, fvgEngine, pocEngine, analyze, track };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Radar = api;
})(typeof self !== "undefined" ? self : this);
