/*
 * محرك إشارات الذهب — نسخة JavaScript من gold_signal_bot.py (نفس المنطق حرفياً)
 * 1H: الهيكل (BOS/CHoCH) · 15m: تأكيد + منطقة FVG/Order Block · 5m: زناد الدخول
 * يعمل في المتصفح (window.GoldEngine) وفي Node (module.exports) للاختبار.
 */
(function (root) {
  "use strict";

  const Config = {
    SWING_LEFT: 2,
    SWING_RIGHT: 2,
    ATR_PERIOD: 14,
    SL_ATR_BUFFER: 0.35,
    RR_TARGETS: [1.5, 2.5, 4.0],
    MAX_ZONE_AGE_BARS: 40,
    FVG_MIN_SIZE_ATR: 0.15,
  };

  // bars: [{time(ms), open, high, low, close}] الأقدم أولاً

  function atr(bars, period) {
    const n = bars.length, tr = new Array(n), out = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      tr[i] = i === 0
        ? b.high - b.low                                   // pandas max(skipna) مع prev_close = NaN
        : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += tr[i];
      if (i >= period) sum -= tr[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function findSwings(bars, left, right) {
    const n = bars.length, sh = new Array(n).fill(false), sl = new Array(n).fill(false);
    for (let i = left; i < n - right; i++) {
      let maxH = -Infinity, minL = Infinity;
      for (let j = i - left; j <= i + right; j++) {
        if (bars[j].high > maxH) maxH = bars[j].high;
        if (bars[j].low < minL) minL = bars[j].low;
      }
      let cH = 0, cL = 0;
      for (let j = i - left; j <= i + right; j++) {
        if (bars[j].high === bars[i].high) cH++;
        if (bars[j].low === bars[i].low) cL++;
      }
      if (bars[i].high === maxH && cH === 1) sh[i] = true;
      if (bars[i].low === minL && cL === 1) sl[i] = true;
    }
    return [sh, sl];
  }

  function detectBias(bars) {
    const [sh, sl] = findSwings(bars, Config.SWING_LEFT, Config.SWING_RIGHT);
    const hi = [], lo = [];
    sh.forEach((v, i) => v && hi.push(i));
    sl.forEach((v, i) => v && lo.push(i));
    if (hi.length < 2 || lo.length < 2) return { bias: null, reason: "قمم وقيعان غير كافية" };

    const lastHigh = bars[hi[hi.length - 1]].high;
    const lastLow = bars[lo[lo.length - 1]].low;
    const stop = Math.max(hi[hi.length - 1], lo[lo.length - 1]);
    for (let i = bars.length - 1; i > stop; i--) {
      if (bars[i].close > lastHigh)
        return { bias: "bullish", eventType: "كسر هيكلي صاعد", eventTime: bars[i].time, brokenLevel: lastHigh };
      if (bars[i].close < lastLow)
        return { bias: "bearish", eventType: "كسر هيكلي هابط", eventTime: bars[i].time, brokenLevel: lastLow };
    }
    return { bias: null, reason: "لا يوجد كسر هيكلي حديث" };
  }

  function findFvgZones(bars, bias, minSize) {
    const zones = [];
    for (let i = 2; i < bars.length; i++) {
      if (bias === "bullish") {
        const gap = bars[i].low - bars[i - 2].high;
        if (gap > minSize) zones.push({ index: i, top: bars[i].low, bottom: bars[i - 2].high, time: bars[i].time, type: "فجوة صاعدة" });
      } else {
        const gap = bars[i - 2].low - bars[i].high;
        if (gap > minSize) zones.push({ index: i, top: bars[i - 2].low, bottom: bars[i].high, time: bars[i].time, type: "فجوة هابطة" });
      }
    }
    return zones;
  }

  function findOrderBlock(bars, bias, beforeIndex) {
    const start = Math.max(0, beforeIndex - 15);
    for (let i = beforeIndex - 1; i > start; i--) {
      const b = bars[i];
      if (bias === "bullish" && b.close < b.open) return { top: b.high, bottom: b.low, time: b.time, type: "أوردر بلوك صاعد" };
      if (bias === "bearish" && b.close > b.open) return { top: b.high, bottom: b.low, time: b.time, type: "أوردر بلوك هابط" };
    }
    return null;
  }

  function confirmAndGetZone(bars15, bias, atr15) {
    const r15 = detectBias(bars15);
    const confirmed = r15.bias === bias;
    const lastAtr = atr15.length ? atr15[atr15.length - 1] : 0;
    const minGap = Config.FVG_MIN_SIZE_ATR * (lastAtr && !Number.isNaN(lastAtr) ? lastAtr : 1.0);
    const recent = findFvgZones(bars15, bias, minGap)
      .filter(z => bars15.length - 1 - z.index <= Config.MAX_ZONE_AGE_BARS);
    const zone = recent.length ? recent[recent.length - 1] : null;
    const ob = zone ? findOrderBlock(bars15, bias, zone.index) : null;
    return { confirmed15m: confirmed, confirmBias: r15.bias, zone, orderBlock: ob, atr15: lastAtr };
  }

  function entryTrigger(bars5, zone, bias) {
    if (!zone) return null;
    const { top, bottom } = zone;
    for (let i = bars5.length - 1; i > Math.max(0, bars5.length - 30); i--) {
      const { open: o, close: c, high: h, low: l } = bars5[i];
      if (!(l <= top && h >= bottom)) continue;
      const bullConfirm = c > o && c >= bottom;
      const bearConfirm = c < o && c <= top;
      const rejectUp = (c - l) > 1.5 * Math.abs(c - o) && c > o;
      const rejectDown = (h - c) > 1.5 * Math.abs(c - o) && c < o;
      if (bias === "bullish" && (bullConfirm || rejectUp)) return { index: i, time: bars5[i].time, entryPrice: c };
      if (bias === "bearish" && (bearConfirm || rejectDown)) return { index: i, time: bars5[i].time, entryPrice: c };
    }
    return null;
  }

  const round2 = x => Math.round(x * 100) / 100;

  // نفس build_signal في البايثون، لكن يستقبل البيانات بدل جلبها
  function buildSignal(bars1h, bars15, bars5) {
    const struct = detectBias(bars1h);
    if (struct.bias === null) return { status: "no_bias", detail: struct };
    const bias = struct.bias;
    const atr15 = atr(bars15, Config.ATR_PERIOD);
    const confirm = confirmAndGetZone(bars15, bias, atr15);
    if (!confirm.confirmed15m || !confirm.zone) return { status: "no_zone", bias, detail: confirm };
    const trig = entryTrigger(bars5, confirm.zone, bias);
    if (!trig) return { status: "no_trigger", bias, detail: confirm };

    const zone = confirm.zone, ob = confirm.orderBlock;
    const last15 = bars15[bars15.length - 1];
    const lastAtr = confirm.atr15 || (last15.high - last15.low);
    const entry = trig.entryPrice, buf = Config.SL_ATR_BUFFER * lastAtr;
    let sl, risk, tps;
    if (bias === "bullish") {
      sl = zone.bottom - buf;
      if (ob) sl = Math.min(sl, ob.bottom - buf);
      risk = entry - sl;
      tps = Config.RR_TARGETS.map(rr => entry + risk * rr);
    } else {
      sl = zone.top + buf;
      if (ob) sl = Math.max(sl, ob.top + buf);
      risk = sl - entry;
      tps = Config.RR_TARGETS.map(rr => entry - risk * rr);
    }
    if (!(risk > 0)) return { status: "invalid_risk", bias };
    return {
      status: "signal",
      signalId: `${bias}-${zone.time}-${trig.time}`,
      bias,
      structureEvent: struct.eventType,
      structureTime: struct.eventTime,
      zoneType: zone.type,
      zoneTime: zone.time,
      orderBlock: ob,
      entryTime: trig.time,
      entryPrice: round2(entry),
      stopLoss: round2(sl),
      takeProfits: tps.map(round2),
      riskPoints: round2(risk),
    };
  }

  const api = { Config, atr, findSwings, detectBias, findFvgZones, findOrderBlock, confirmAndGetZone, entryTrigger, buildSignal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GoldEngine = api;
})(typeof self !== "undefined" ? self : this);
