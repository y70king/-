# -*- coding: utf-8 -*-
"""
محركات رادار الذهب — نسخة بايثون مطابقة حرفياً لـ docs/radar/engines.js
(الاتجاه من 4 ساعات / ساعة / 15 دقيقة، والإشارة على 5 دقائق: محرك الفجوات ومحرك نقطة التحكم).

الشمعة: dict فيها time (ميلي ثانية) و open و high و low و close و volume — الأقدم أولاً،
وآخر شمعة هي الشمعة الحالية قيد التكوين.
"""
import math

DEFAULTS = {
    "trendEma": 50, "minGrade": 1, "trendSlopeBars": 4, "atrPeriod": 14,
    "fvgMinAtr": 0.6, "fvgLookback": 48, "fvgSlPadAtr": 0.15, "fvgTp1R": 1.0, "fvgTp2R": 1.5,
    "swingN": 3, "legMinAtr": 3.0, "pocBin": 0.5, "pocSlUsd": 0,
    "fixedSl": 0, "fixedTp": 0,
}

NO_BIAS = "كل الفريمات العالية محايدة، ماكو اتجاه"


def ema(values, period):
    k = 2 / (period + 1)
    out, prev = [], values[0]
    for i, v in enumerate(values):
        prev = v * k + prev * (1 - k) if i else v
        out.append(prev)
    return out


def atr(bars, period):
    tr = []
    for i, b in enumerate(bars):
        if i:
            p = bars[i - 1]["close"]
            tr.append(max(b["high"] - b["low"], abs(b["high"] - p), abs(b["low"] - p)))
        else:
            tr.append(b["high"] - b["low"])
    out, s = [math.nan] * len(bars), 0.0
    for i, t in enumerate(tr):
        s += t
        if i >= period:
            s -= tr[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def trend_of(bars, cfg):
    if not bars or len(bars) < cfg["trendEma"] + cfg["trendSlopeBars"] + 2:
        return 0
    closed = bars[:-1]                      # الشمعة الحالية لم تُغلق بعد
    e = ema([b["close"] for b in closed], cfg["trendEma"])
    n = len(closed) - 1
    c = closed[n]["close"]
    slope = e[n] - e[n - cfg["trendSlopeBars"]]
    if c > e[n] and slope > 0:
        return 1
    if c < e[n] and slope < 0:
        return -1
    return 0


def with_fixed(sig, cfg):
    d = sig["dir"]
    if cfg["fixedSl"] > 0:
        sig["sl"] = sig["entry"] - d * cfg["fixedSl"]
    if cfg["fixedTp"] > 0:
        sig["tp2"] = sig["entry"] + d * cfg["fixedTp"]
        sig["tp1"] = sig["entry"] + d * cfg["fixedTp"] / 2
    sig["risk"] = abs(sig["entry"] - sig["sl"])
    return sig


def bias(t):
    return t["m15"] or t["h1"] or t["h4"] or 0


def grade(t, d):
    v = [t["h4"], t["h1"], t["m15"]]
    agree = sum(1 for x in v if x == d)
    oppose = sum(1 for x in v if x == -d)
    if agree == 3:
        return 3
    if agree == 2 and oppose == 0:
        return 2
    return 1


def fvg_engine(bars5, d, cfg):
    if not d:
        return {"has": False, "reason": NO_BIAS}
    a = atr(bars5, cfg["atrPeriod"])
    n = len(bars5) - 1
    price, A = bars5[n]["close"], a[n - 1]
    if not (A > 0):
        return {"has": False, "reason": "بيانات غير كافية"}
    for i in range(n - 1, max(2, n - cfg["fvgLookback"]) - 1, -1):
        c0, c1, c2 = bars5[i - 2], bars5[i - 1], bars5[i]
        if d == 1:
            bottom, top = c0["high"], c2["low"]
        else:
            top, bottom = c0["low"], c2["high"]
        if top - bottom < cfg["fvgMinAtr"] * A:
            continue
        broken = touched = False
        for j in range(i + 1, n + 1):
            b = bars5[j]
            if d == 1:
                broken = broken or b["low"] < bottom
                touched = touched or b["low"] <= top
            else:
                broken = broken or b["high"] > top
                touched = touched or b["high"] >= bottom
        if broken:
            continue
        entry = top if d == 1 else bottom
        if touched:
            return {"has": False, "reason": "السعر رجع للفجوة الأخيرة، بانتظار فجوة جديدة"}
        extreme = min(c0["low"], c1["low"]) if d == 1 else max(c0["high"], c1["high"])
        sl = extreme - d * cfg["fvgSlPadAtr"] * A
        risk = abs(entry - sl)
        return {"has": True, "engine": "fvg", "dir": d, "entry": entry, "sl": sl, "risk": risk,
                "tp1": entry + d * risk * cfg["fvgTp1R"], "tp2": entry + d * risk * cfg["fvgTp2R"],
                "zoneTop": top, "zoneBottom": bottom, "time": c2["time"],
                "id": "fvg-%d-%d" % (d, c2["time"]), "price": price}
    return {"has": False, "reason": "لا توجد فجوة %s غير مملوءة حالياً" % ("صاعدة" if d == 1 else "هابطة")}


def swings(bars, k):
    hi, lo = [], []
    for i in range(k, len(bars) - k):
        is_h = is_l = True
        for j in range(i - k, i + k + 1):
            if j == i:
                continue
            if bars[j]["high"] >= bars[i]["high"]:
                is_h = False
            if bars[j]["low"] <= bars[i]["low"]:
                is_l = False
        if is_h:
            hi.append(i)
        if is_l:
            lo.append(i)
    return hi, lo


def volume_profile_poc(bars, frm, to, bin_):
    lo = min(bars[i]["low"] for i in range(frm, to + 1))
    hi = max(bars[i]["high"] for i in range(frm, to + 1))
    base = math.floor(lo / bin_) * bin_
    nb = max(1, math.ceil((hi - base) / bin_) + 1)
    vol = [0.0] * nb
    for i in range(frm, to + 1):
        b = bars[i]
        v = b.get("volume") or 1
        s = math.floor((b["low"] - base) / bin_)
        e = math.floor((b["high"] - base) / bin_)
        for x in range(s, e + 1):
            vol[x] += v / (e - s + 1)
    best = 0
    for x in range(1, nb):
        if vol[x] > vol[best]:
            best = x
    return base + (best + 0.5) * bin_


def poc_engine(bars5, d, cfg):
    if not d:
        return {"has": False, "reason": NO_BIAS}
    a = atr(bars5, cfg["atrPeriod"])
    n = len(bars5) - 1
    price, A = bars5[n]["close"], a[n - 1]
    hi, lo = swings(bars5[:n], cfg["swingN"])     # قمم وقيعان مؤكدة من شموع مغلقة
    if not hi or not lo or not (A > 0):
        return {"has": False, "reason": "بيانات غير كافية"}
    if d == 1:
        end = hi[-1]
        before = [i for i in lo if i < end]
        if not before:
            return {"has": False, "reason": "لا توجد موجة صاعدة مكتملة"}
    else:
        end = lo[-1]
        before = [i for i in hi if i < end]
        if not before:
            return {"has": False, "reason": "لا توجد موجة هابطة مكتملة"}
    start = before[-1]
    leg_hi = bars5[end]["high"] if d == 1 else bars5[start]["high"]
    leg_lo = bars5[start]["low"] if d == 1 else bars5[end]["low"]
    if leg_hi - leg_lo < cfg["legMinAtr"] * A:
        return {"has": False, "reason": "آخر موجة ضعيفة (أصغر من الحد المطلوب)"}
    poc = volume_profile_poc(bars5, start, end, cfg["pocBin"])
    for j in range(end + 1, n + 1):
        if (d == 1 and bars5[j]["low"] <= poc) or (d == -1 and bars5[j]["high"] >= poc):
            return {"has": False, "reason": "السعر رجع لنقطة التحكم، بانتظار موجة جديدة"}
    entry = poc
    sl = entry - d * cfg["pocSlUsd"] if cfg["pocSlUsd"] > 0 else (leg_lo if d == 1 else leg_hi) - d * 0.15 * A
    tp2 = leg_hi if d == 1 else leg_lo
    if d * (tp2 - entry) <= 0:
        return {"has": False, "reason": "الهدف غير صالح"}
    return {"has": True, "engine": "poc", "dir": d, "entry": entry, "sl": sl, "risk": abs(entry - sl),
            "tp1": entry + (tp2 - entry) / 2, "tp2": tp2, "legHi": leg_hi, "legLo": leg_lo,
            "time": bars5[end]["time"],
            "id": "poc-%d-%d-%d" % (d, bars5[start]["time"], bars5[end]["time"]), "price": price}


def analyze(bars5, frames, cfg=None):
    c = dict(DEFAULTS, **(cfg or {}))
    trends = {"h4": trend_of(frames.get("h4"), c), "h1": trend_of(frames.get("h1"), c),
              "m15": trend_of(frames.get("m15"), c)}
    d = bias(trends)
    g = grade(trends, d) if d else 0
    f, p = fvg_engine(bars5, d, c), poc_engine(bars5, d, c)
    for s in (f, p):
        if not s["has"]:
            continue
        with_fixed(s, c)
        s["grade"] = g
        if g < c["minGrade"]:
            s.update({"has": False, "reason": "الإشارة أقل من الدرجة المختارة بالإعدادات"})
    return {"trends": trends, "bias": d, "grade": g, "fvg": f, "poc": p}


def track(sig, bars5, expiry_ms=12 * 3600e3):
    """متابعة إشارة محفوظة: انتظار الدخول ← دخلت ← هدف/وقف"""
    state = sig.get("state") or "pending"
    entered = sig.get("enteredAt")
    closed_at, result = None, None
    if state in ("win", "loss", "expired"):
        return sig
    for b in bars5:
        if b["time"] <= sig["time"]:
            continue
        if state == "active" and entered and b["time"] < entered:
            continue
        if state == "pending":
            hit_entry = b["low"] <= sig["entry"] if sig["dir"] == 1 else b["high"] >= sig["entry"]
            ran_away = b["high"] >= sig["tp2"] if sig["dir"] == 1 else b["low"] <= sig["tp2"]
            if hit_entry:
                state, entered = "active", b["time"]
            elif ran_away or b["time"] - sig["time"] > expiry_ms:
                state, closed_at = "expired", b["time"]
                break
            else:
                continue
        if state == "active":
            hit_sl = b["low"] <= sig["sl"] if sig["dir"] == 1 else b["high"] >= sig["sl"]
            hit_tp = b["high"] >= sig["tp2"] if sig["dir"] == 1 else b["low"] <= sig["tp2"]
            if hit_sl:
                state, result, closed_at = "loss", -abs(sig["entry"] - sig["sl"]), b["time"]
                break
            if hit_tp:
                state, result, closed_at = "win", abs(sig["tp2"] - sig["entry"]), b["time"]
                break
    out = dict(sig)
    out.update({"state": state, "enteredAt": entered, "closedAt": closed_at, "result": result})
    return out
