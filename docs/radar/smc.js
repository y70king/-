/*
 * محرك سمارت موني — نقل سطر بسطر لمنطق مؤشر "Smart Money Concepts [LuxAlgo]" (الهيكل، الكسور، بلوكات الأوامر الداخلية، القمم والقيعان الرئيسية).
 * المصدر الأصلي: © LuxAlgo — مرخّص تحت CC BY-NC-SA 4.0  https://creativecommons.org/licenses/by-nc-sa/4.0/
 * هذا الملف عمل مشتق ومرخّص بنفس الرخصة (استخدام غير تجاري، مع ذكر المصدر، وبنفس شروط المشاركة).
 *
 * الإعدادات نفس افتراضيات المؤشر: هيكل رئيسي بطول 50، هيكل داخلي بطول 5، بلوكات أوامر داخلية،
 * فلتر التقلب ATR(200)، وإلغاء البلوك عند كسر القمة/القاع (High/Low).
 *
 * قاعدة الإشارة (إضافة على المؤشر، لأنه يرسم فقط وما يعطي دخول):
 *   كسر هيكل داخلي (BOS أو CHoCH) على شمعة مغلقة ← أمر معلق على بلوك الأوامر الداخلي اللي انحفظ وية الكسر،
 *   الوقف خلف البلوك بمسافة ATR(200) واحد، والهدف ضعف المخاطرة (هذا الأثبت باختبار 39 يوم على الذهب).
 *   الدرجة: 3 ذهبية = باتجاه الهيكل الرئيسي وبمنطقة الخصم (شراء) أو العلاوة (بيع) · 2 جيدة = باتجاه الهيكل الرئيسي · 1 خطرة = عكسه.
 */
(function (root) {
  "use strict";

  const BULLISH = 1, BEARISH = -1, BULLISH_LEG = 1, BEARISH_LEG = 0;
  const SWING_LEN = 50, INTERNAL_LEN = 5, ATR_LEN = 200, MAX_OB = 100;
  const SL_PAD_ATR = 1.0;        // الوقف خلف البلوك بمسافة × ATR(200)
  const TP_R = 2;                // الهدف = ضعف المخاطرة
  const SETUP_MAX_BARS = 48;     // الإشارة تبقى صالحة 4 ساعات على فريم 5 دقائق
  const isNum = x => typeof x === "number" && !Number.isNaN(x);

  const pivot = () => ({ currentLevel: NaN, lastLevel: NaN, crossed: false, barTime: 0, barIndex: 0 });

  // bars: شموع مغلقة فقط، الأقدم أولاً — { time, open, high, low, close }
  function run(bars) {
    const swingHigh = pivot(), swingLow = pivot(), internalHigh = pivot(), internalLow = pivot();
    const swingTrend = { bias: 0 }, internalTrend = { bias: 0 };
    const trailing = { top: NaN, bottom: NaN, barTime: 0, barIndex: 0, lastTopTime: 0, lastBottomTime: 0 };
    const internalOBs = [];
    const parsedHighs = [], parsedLows = [];
    const legs = { [SWING_LEN]: { leg: 0, prev: 0 }, [INTERNAL_LEN]: { leg: 0, prev: 0 } };
    const prevLevel = { ih: NaN, il: NaN, sh: NaN, sl: NaN };
    const events = [];
    let atr = NaN, trSum = 0, prevClose = NaN;

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      // ATR(200) بطريقة RMA مثل ta.atr
      const tr = i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low;
      if (i < ATR_LEN) { trSum += tr; if (i === ATR_LEN - 1) atr = trSum / ATR_LEN; }
      else atr = (atr * (ATR_LEN - 1) + tr) / ATR_LEN;
      const highVol = isNum(atr) && (b.high - b.low) >= 2 * atr;
      parsedHighs.push(highVol ? b.low : b.high);
      parsedLows.push(highVol ? b.high : b.low);

      // updateTrailingExtremes
      trailing.top = Math.max(b.high, trailing.top);
      if (trailing.top === b.high) trailing.lastTopTime = b.time;
      trailing.bottom = Math.min(b.low, trailing.bottom);
      if (trailing.bottom === b.low) trailing.lastBottomTime = b.time;

      // getCurrentStructure(50) ثم getCurrentStructure(5, internal)
      for (const [size, internal] of [[SWING_LEN, false], [INTERNAL_LEN, true]]) {
        const L = legs[size];
        if (i >= size) {
          let hh = -Infinity, ll = Infinity;
          for (let j = i - size + 1; j <= i; j++) { if (bars[j].high > hh) hh = bars[j].high; if (bars[j].low < ll) ll = bars[j].low; }
          const p = bars[i - size];
          if (p.high > hh) L.leg = BEARISH_LEG;
          else if (p.low < ll) L.leg = BULLISH_LEG;
        }
        const change = i ? L.leg - L.prev : 0;
        if (change !== 0) {
          const src = bars[i - size];
          if (change === 1) {           // بداية رجل صاعدة = قاع
            const pv = internal ? internalLow : swingLow;
            pv.lastLevel = pv.currentLevel; pv.currentLevel = src.low; pv.crossed = false;
            pv.barTime = src.time; pv.barIndex = i - size;
            if (!internal) { trailing.bottom = pv.currentLevel; trailing.barTime = pv.barTime; trailing.barIndex = pv.barIndex; trailing.lastBottomTime = pv.barTime; }
          } else {                       // بداية رجل هابطة = قمة
            const pv = internal ? internalHigh : swingHigh;
            pv.lastLevel = pv.currentLevel; pv.currentLevel = src.high; pv.crossed = false;
            pv.barTime = src.time; pv.barIndex = i - size;
            if (!internal) { trailing.top = pv.currentLevel; trailing.barTime = pv.barTime; trailing.barIndex = pv.barIndex; trailing.lastTopTime = pv.barTime; }
          }
        }
        L.prev = L.leg;
      }

      // displayStructure(true) ثم displayStructure()
      for (const internal of [true, false]) {
        const t = internal ? internalTrend : swingTrend;
        // كسر صاعد
        let pv = internal ? internalHigh : swingHigh, key = internal ? "ih" : "sh";
        let extra = internal ? (isNum(internalHigh.currentLevel) && isNum(swingHigh.currentLevel) && internalHigh.currentLevel !== swingHigh.currentLevel) : true;
        let lvl = pv.currentLevel, pl = prevLevel[key];
        const crossUp = isNum(lvl) && isNum(pl) && isNum(prevClose) && b.close > lvl && prevClose <= pl;
        prevLevel[key] = lvl;
        if (crossUp && !pv.crossed && extra) {
          const tag = t.bias === BEARISH ? "CHoCH" : "BOS";
          pv.crossed = true; t.bias = BULLISH;
          if (internal) { storeOB(pv, BULLISH, i); events.push(makeEvent(BULLISH, tag, i)); }
        }
        // كسر هابط
        pv = internal ? internalLow : swingLow; key = internal ? "il" : "sl";
        extra = internal ? (isNum(internalLow.currentLevel) && isNum(swingLow.currentLevel) && internalLow.currentLevel !== swingLow.currentLevel) : true;
        lvl = pv.currentLevel; pl = prevLevel[key];
        const crossDn = isNum(lvl) && isNum(pl) && isNum(prevClose) && b.close < lvl && prevClose >= pl;
        prevLevel[key] = lvl;
        if (crossDn && !pv.crossed && extra) {
          const tag = t.bias === BULLISH ? "CHoCH" : "BOS";
          pv.crossed = true; t.bias = BEARISH;
          if (internal) { storeOB(pv, BEARISH, i); events.push(makeEvent(BEARISH, tag, i)); }
        }
      }

      // deleteOrderBlocks(true) — الإلغاء بالقمة/القاع
      for (let k = internalOBs.length - 1; k >= 0; k--) {
        const ob = internalOBs[k];
        if ((ob.bias === BEARISH && b.high > ob.barHigh) || (ob.bias === BULLISH && b.low < ob.barLow)) internalOBs.splice(k, 1);
      }
      prevClose = b.close;
    }

    function storeOB(pv, bias, i) {
      const from = pv.barIndex, src = bias === BEARISH ? parsedHighs : parsedLows;
      let idx = from;
      for (let j = from; j < i; j++) if (bias === BEARISH ? src[j] > src[idx] : src[j] < src[idx]) idx = j;
      internalOBs.unshift({ barHigh: parsedHighs[idx], barLow: parsedLows[idx], barTime: bars[idx].time, bias });
      if (internalOBs.length > MAX_OB) internalOBs.pop();
    }

    function makeEvent(dir, tag, i) {
      const ob = internalOBs[0], b = bars[i];
      const top = Math.max(ob.barHigh, ob.barLow), bottom = Math.min(ob.barHigh, ob.barLow);
      const pad = isNum(atr) ? SL_PAD_ATR * atr : 0;
      const entry = dir === BULLISH ? top : bottom;
      const sl = dir === BULLISH ? bottom - pad : top + pad;
      const risk = Math.abs(entry - sl);
      const tp2 = entry + dir * TP_R * risk;
      const eq = (trailing.top + trailing.bottom) / 2;
      const inZone = isNum(eq) && (dir === BULLISH ? b.close < eq : b.close > eq);
      const grade = swingTrend.bias === dir ? (inZone ? 3 : 2) : 1;
      return {
        id: `smc-${dir}-${b.time}`, dir, tag, barIndex: i, time: b.time,
        obTop: top, obBottom: bottom, obTime: ob.barTime, entry, sl, risk, tp1: entry + (tp2 - entry) / 2, tp2,
        grade, swing: swingTrend.bias, atr, zone: !isNum(eq) ? "" : b.close < eq ? "discount" : "premium",
      };
    }

    const last = bars[bars.length - 1];
    const eq = (trailing.top + trailing.bottom) / 2;
    return {
      swingTrend: swingTrend.bias, internalTrend: internalTrend.bias,
      top: trailing.top, bottom: trailing.bottom, eq,
      zone: !isNum(eq) || !last ? "" : last.close < eq ? "discount" : "premium",
      events, internalOBs, atr,
    };
  }

  // متابعة إشارة على الشموع اللاحقة: انتظار الدخول ← دخلت ← هدف/وقف
  function track(sig, bars, expiryMs = 12 * 3600e3) {
    let state = sig.state || "pending", enteredAt = sig.enteredAt || null, closedAt = null, result = null;
    if (state === "win" || state === "loss" || state === "expired") return sig;
    for (const b of bars) {
      if (b.time <= sig.time) continue;
      if (state === "active" && enteredAt && b.time < enteredAt) continue;
      if (state === "pending") {
        const hitEntry = sig.dir === 1 ? b.low <= sig.entry : b.high >= sig.entry;
        const ranAway = sig.dir === 1 ? b.high >= sig.tp2 : b.low <= sig.tp2;
        if (hitEntry) { state = "active"; enteredAt = b.time; }
        else if (ranAway || b.time - sig.time > expiryMs) { state = "expired"; closedAt = b.time; break; }
        else continue;
      }
      if (state === "active") {
        const hitSl = sig.dir === 1 ? b.low <= sig.sl : b.high >= sig.sl;
        const hitTp = sig.dir === 1 ? b.high >= sig.tp2 : b.low <= sig.tp2;
        if (hitSl) { state = "loss"; result = -Math.abs(sig.entry - sig.sl); closedAt = b.time; break; }
        if (hitTp) { state = "win"; result = Math.abs(sig.tp2 - sig.entry); closedAt = b.time; break; }
      }
    }
    return Object.assign({}, sig, { state, enteredAt, closedAt, result });
  }

  // الإشارة الحالية: آخر كسر داخلي بلوكه بعده موجود، وعمره أقل من 4 ساعات، وما خلصت (بانتظار الدخول أو شغالة)
  function current(res, bars) {
    const ev = res.events[res.events.length - 1];
    if (!ev) return { has: false, reason: "بانتظار أول كسر هيكل داخلي" };
    const alive = res.internalOBs.some(o => o.barTime === ev.obTime && o.bias === ev.dir);
    const age = bars.length - 1 - ev.barIndex;
    const st = track(ev, bars).state;
    if (!alive || age > SETUP_MAX_BARS || (st !== "pending" && st !== "active"))
      return { has: false, reason: "بانتظار كسر هيكل داخلي جديد" };
    return Object.assign({ has: true, state: st }, ev);
  }

  const api = { run, track, current, BULLISH, BEARISH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SMC = api;
})(typeof self !== "undefined" ? self : this);
