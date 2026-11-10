"""
استراتيجيات من مؤشرات ترندنك فيو — "الجينوم" بدل الشبكة العصبية.

كل استراتيجية = إشارة دخول (مؤشر + إعداداته) + فلتر (اختياري) + خروج (وقف/هدف ATR،
عكس الإشارة، مدة قصوى) + نسبة مخاطرة + اتجاه التداول.
التطور يغير المؤشرات والإعدادات لين يوصل لأحسن تركيبة، والبطل يطلع كود Pine Script جاهز.
"""
import copy
import json

import numpy as np

from . import tv_indicators as ta

# اسم المؤشر → مجال كل إعداد (أقل، أكثر، نوع)
ENTRIES = {
    "ema_cross":   {"fast": (3, 50, int), "slow": (10, 200, int)},
    "macd_cross":  {"fast": (5, 20, int), "slow": (15, 50, int), "signal": (3, 15, int)},
    "rsi_revert":  {"length": (2, 30, int), "low": (10, 45, int), "high": (55, 90, int)},
    "rsi_mid":     {"length": (3, 30, int), "band": (0, 15, int)},
    "stoch_cross": {"k": (5, 21, int), "smooth": (1, 5, int), "d": (2, 5, int), "low": (10, 40, int), "high": (60, 90, int)},
    "bb_revert":   {"length": (10, 50, int), "mult": (1.0, 3.0, float)},
    "bb_breakout": {"length": (10, 50, int), "mult": (1.0, 3.0, float)},
    "supertrend":  {"atr_len": (5, 30, int), "factor": (1.0, 5.0, float)},
    "donchian":    {"length": (5, 100, int)},
    "cci":         {"length": (10, 50, int), "level": (50, 200, int)},
    "ichimoku_tk": {"tenkan": (5, 20, int), "kijun": (20, 60, int)},
    "willr":       {"length": (5, 30, int), "low": (-95, -60, int), "high": (-40, -5, int)},
}
FILTERS = {
    "none":        {},
    "ema_trend":   {"length": (20, 300, int)},
    "adx":         {"length": (7, 30, int), "threshold": (15, 40, int)},
    "supertrend":  {"atr_len": (5, 30, int), "factor": (1.0, 5.0, float)},
    "session":     {"start": (0, 23, int), "hours": (4, 20, int)},
    "rsi_side":    {"length": (5, 30, int)},
}
EXITS = {
    "sl_atr": (0.3, 6.0, float), "tp_atr": (0.3, 10.0, float), "max_bars": (0, 96, int),
    "risk": (0.01, 0.10, float),
}
AR = {
    "ema_cross": "تقاطع متوسطين EMA", "macd_cross": "تقاطع MACD", "rsi_revert": "ارتداد RSI من التشبع",
    "rsi_mid": "RSI يقطع خط 50", "stoch_cross": "تقاطع Stochastic بالتشبع", "bb_revert": "ارتداد من حدود Bollinger",
    "bb_breakout": "اختراق Bollinger", "supertrend": "انقلاب Supertrend", "donchian": "اختراق قناة Donchian",
    "cci": "CCI يرجع من التطرف", "ichimoku_tk": "تقاطع Tenkan/Kijun (إيشيموكو)", "willr": "ارتداد Williams %R",
    "none": "بدون فلتر", "ema_trend": "مع اتجاه EMA", "adx": "بس إذا الترند قوي (ADX)",
    "session": "بساعات معينة باليوم", "rsi_side": "مع جهة RSI",
}


def _rand_params(spec, rng):
    out = {}
    for k, (lo, hi, t) in spec.items():
        out[k] = int(rng.integers(lo, hi + 1)) if t is int else round(float(rng.uniform(lo, hi)), 2)
    return out


def _fix(g):
    e = g["entry"]
    if e["type"] in ("ema_cross", "macd_cross") and e["p"]["fast"] >= e["p"]["slow"]:
        e["p"]["fast"], e["p"]["slow"] = min(e["p"]["fast"], e["p"]["slow"] - 1), max(e["p"]["slow"], e["p"]["fast"] + 1)
    if e["type"] == "ichimoku_tk" and e["p"]["tenkan"] >= e["p"]["kijun"]:
        e["p"]["tenkan"] = max(5, e["p"]["kijun"] - 1)
    return g


def random_genome(rng):
    et = rng.choice(list(ENTRIES))
    ft = rng.choice(list(FILTERS))
    g = {
        "entry": {"type": str(et), "p": _rand_params(ENTRIES[et], rng)},
        "filter": {"type": str(ft), "p": _rand_params(FILTERS[ft], rng)},
        "exit": _rand_params(EXITS, rng),
        "reverse": bool(rng.random() < 0.6),     # الإشارة العكسية تقلب الصفقة
        "side": str(rng.choice(["both", "both", "long", "short"])),
    }
    return _fix(g)


def _jitter(params, spec, rng, k=1):
    for name in rng.choice(list(spec), size=min(k, len(spec)), replace=False):
        lo, hi, t = spec[name]
        span = (hi - lo) * 0.15
        v = params[name] + rng.normal(0, span)
        params[name] = int(np.clip(round(v), lo, hi)) if t is int else round(float(np.clip(v, lo, hi)), 2)


def mutate(g, rng):
    g = copy.deepcopy(g)
    r = rng.random()
    if r < 0.10:
        et = str(rng.choice(list(ENTRIES))); g["entry"] = {"type": et, "p": _rand_params(ENTRIES[et], rng)}
    elif r < 0.20:
        ft = str(rng.choice(list(FILTERS))); g["filter"] = {"type": ft, "p": _rand_params(FILTERS[ft], rng)}
    elif r < 0.50:
        _jitter(g["entry"]["p"], ENTRIES[g["entry"]["type"]], rng)
    elif r < 0.60 and FILTERS[g["filter"]["type"]]:
        _jitter(g["filter"]["p"], FILTERS[g["filter"]["type"]], rng)
    elif r < 0.92:
        _jitter(g["exit"], EXITS, rng)
    elif r < 0.96:
        g["reverse"] = not g["reverse"]
    else:
        g["side"] = str(rng.choice(["both", "long", "short"]))
    return _fix(g)


def crossover(a, b, rng):
    c = copy.deepcopy(a)
    for part in ("entry", "filter", "exit", "reverse", "side"):
        if rng.random() < 0.5:
            c[part] = copy.deepcopy(b[part])
    return _fix(c)


def key(g):
    return json.dumps(g, sort_keys=True)


# ------------------------------------------------------------------ الإشارات
def entry_signal(e, o, h, l, c):
    p, t = e["p"], e["type"]
    if t == "ema_cross":
        f, s = ta.ema(c, p["fast"]), ta.ema(c, p["slow"]); L, S = ta.crossover(f, s), ta.crossunder(f, s)
    elif t == "macd_cross":
        m, sg = ta.macd(c, p["fast"], p["slow"], p["signal"]); L, S = ta.crossover(m, sg), ta.crossunder(m, sg)
    elif t == "rsi_revert":
        r = ta.rsi(c, p["length"]); L, S = ta.crossover(r, np.full_like(r, p["low"])), ta.crossunder(r, np.full_like(r, p["high"]))
    elif t == "rsi_mid":
        r = ta.rsi(c, p["length"]); L, S = ta.crossover(r, np.full_like(r, 50 + p["band"])), ta.crossunder(r, np.full_like(r, 50 - p["band"]))
    elif t == "stoch_cross":
        k, d = ta.stoch(c, h, l, p["k"], p["smooth"], p["d"])
        L, S = ta.crossover(k, d) & (k < p["low"]), ta.crossunder(k, d) & (k > p["high"])
    elif t == "bb_revert":
        _, up, lo = ta.bbands(c, p["length"], p["mult"]); L, S = ta.crossover(c, lo), ta.crossunder(c, up)
    elif t == "bb_breakout":
        _, up, lo = ta.bbands(c, p["length"], p["mult"]); L, S = ta.crossover(c, up), ta.crossunder(c, lo)
    elif t == "supertrend":
        _, d = ta.supertrend(h, l, c, p["factor"], p["atr_len"]); pd_ = np.r_[np.nan, d[:-1]]
        L, S = (d < 0) & (pd_ > 0), (d > 0) & (pd_ < 0)
    elif t == "donchian":
        hh, ll = ta.donchian(h, l, p["length"]); L, S = ta.crossover(c, hh), ta.crossunder(c, ll)
    elif t == "cci":
        x = ta.cci(h, l, c, p["length"]); L, S = ta.crossover(x, np.full_like(x, -p["level"])), ta.crossunder(x, np.full_like(x, p["level"]))
    elif t == "ichimoku_tk":
        tk, kj = ta.ichimoku(h, l, p["tenkan"], p["kijun"]); L, S = ta.crossover(tk, kj), ta.crossunder(tk, kj)
    elif t == "willr":
        x = ta.willr(h, l, c, p["length"]); L, S = ta.crossover(x, np.full_like(x, p["low"])), ta.crossunder(x, np.full_like(x, p["high"]))
    else:
        raise ValueError(t)
    return np.nan_to_num(L).astype(bool), np.nan_to_num(S).astype(bool)


def filter_mask(f, o, h, l, c, hours):
    """يرجع (مسموح شراء، مسموح بيع)."""
    p, t = f["p"], f["type"]
    T = len(c)
    if t == "none":
        return np.ones(T, bool), np.ones(T, bool)
    if t == "ema_trend":
        e = ta.ema(c, p["length"]); return c > e, c < e
    if t == "adx":
        _, _, a = ta.dmi(h, l, c, p["length"], p["length"]); ok = a > p["threshold"]; return ok, ok
    if t == "supertrend":
        _, d = ta.supertrend(h, l, c, p["factor"], p["atr_len"]); return d < 0, d > 0
    if t == "session":
        ok = ((hours - p["start"]) % 24) < p["hours"]; return ok, ok
    if t == "rsi_side":
        r = ta.rsi(c, p["length"]); return r > 50, r < 50
    raise ValueError(t)


def signals(g, o, h, l, c, hours, cache=None):
    """إشارة الدخول النهائية لكل شمعة: 1 شراء، -1 بيع، 0 لا شي."""
    ck = None
    if cache is not None:
        ck = ("E", key(g["entry"]))
        if ck not in cache:
            cache[ck] = entry_signal(g["entry"], o, h, l, c)
        L, S = cache[ck]
        fk = ("F", key(g["filter"]))
        if fk not in cache:
            cache[fk] = filter_mask(g["filter"], o, h, l, c, hours)
        fl, fs = cache[fk]
    else:
        L, S = entry_signal(g["entry"], o, h, l, c)
        fl, fs = filter_mask(g["filter"], o, h, l, c, hours)
    L = L & fl
    S = S & fs
    if g["side"] == "long":
        S = np.zeros_like(S)
    elif g["side"] == "short":
        L = np.zeros_like(L)
    sig = np.zeros(len(c), np.int8)
    sig[L] = 1
    sig[S & ~L] = -1
    return sig


# ------------------------------------------------------------------ الوصف و Pine Script
def describe(g):
    e, f, x = g["entry"], g["filter"], g["exit"]
    ps = "، ".join(f"{k}={v}" for k, v in e["p"].items())
    fs = "، ".join(f"{k}={v}" for k, v in f["p"].items())
    side = {"both": "شراء وبيع", "long": "شراء بس", "short": "بيع بس"}[g["side"]]
    return (f"الدخول: {AR[e['type']]} ({ps})\n"
            f"الفلتر: {AR[f['type']]}" + (f" ({fs})" if fs else "") + "\n"
            f"الوقف {x['sl_atr']}×ATR | الهدف {x['tp_atr']}×ATR | مخاطرة {x['risk'] * 100:.1f}% | "
            f"{'يقلب الصفقة مع الإشارة العكسية' if g['reverse'] else 'ما يقلب'} | "
            f"{'مدة قصوى ' + str(x['max_bars']) + ' شمعة' if x['max_bars'] else 'بدون مدة قصوى'} | {side}")


def pine(g, title="Gold Evolved Strategy"):
    """كود Pine Script v5 جاهز للصق في ترندنك فيو (Strategy على فريم الساعة)."""
    e, f, x = g["entry"], g["filter"], g["exit"]
    p = e["p"]
    lines = [
        "//@version=5",
        f'strategy("{title}", overlay=true, initial_capital=20, currency=currency.USD, '
        'default_qty_type=strategy.fixed, default_qty_value=0.01, process_orders_on_close=true)',
        "// تطورت بالخوارزمية الجينية على 10 سنين ذهب (XAUUSD، فريم الساعة). حساب سنت 20$.",
        "atr = ta.atr(14)",
    ]
    t = e["type"]
    if t == "ema_cross":
        lines += [f"f = ta.ema(close, {p['fast']})", f"s = ta.ema(close, {p['slow']})",
                  "longSig = ta.crossover(f, s)", "shortSig = ta.crossunder(f, s)",
                  "plot(f, color=color.teal)", "plot(s, color=color.orange)"]
    elif t == "macd_cross":
        lines += [f"[m, sg, _] = ta.macd(close, {p['fast']}, {p['slow']}, {p['signal']})",
                  "longSig = ta.crossover(m, sg)", "shortSig = ta.crossunder(m, sg)"]
    elif t == "rsi_revert":
        lines += [f"r = ta.rsi(close, {p['length']})", f"longSig = ta.crossover(r, {p['low']})",
                  f"shortSig = ta.crossunder(r, {p['high']})"]
    elif t == "rsi_mid":
        lines += [f"r = ta.rsi(close, {p['length']})", f"longSig = ta.crossover(r, {50 + p['band']})",
                  f"shortSig = ta.crossunder(r, {50 - p['band']})"]
    elif t == "stoch_cross":
        lines += [f"k = ta.sma(ta.stoch(close, high, low, {p['k']}), {p['smooth']})", f"d = ta.sma(k, {p['d']})",
                  f"longSig = ta.crossover(k, d) and k < {p['low']}", f"shortSig = ta.crossunder(k, d) and k > {p['high']}"]
    elif t in ("bb_revert", "bb_breakout"):
        lines += [f"[mid, up, lo] = ta.bb(close, {p['length']}, {p['mult']})"]
        lines += (["longSig = ta.crossover(close, lo)", "shortSig = ta.crossunder(close, up)"] if t == "bb_revert"
                  else ["longSig = ta.crossover(close, up)", "shortSig = ta.crossunder(close, lo)"])
        lines += ["plot(up, color=color.gray)", "plot(lo, color=color.gray)"]
    elif t == "supertrend":
        lines += [f"[st, dir] = ta.supertrend({p['factor']}, {p['atr_len']})",
                  "longSig = dir < 0 and dir[1] > 0", "shortSig = dir > 0 and dir[1] < 0", "plot(st, color=dir < 0 ? color.green : color.red)"]
    elif t == "donchian":
        lines += [f"hh = ta.highest(high, {p['length']})[1]", f"ll = ta.lowest(low, {p['length']})[1]",
                  "longSig = ta.crossover(close, hh)", "shortSig = ta.crossunder(close, ll)"]
    elif t == "cci":
        lines += [f"x = ta.cci(hlc3, {p['length']})", f"longSig = ta.crossover(x, -{p['level']})",
                  f"shortSig = ta.crossunder(x, {p['level']})"]
    elif t == "ichimoku_tk":
        lines += [f"tk = (ta.highest(high, {p['tenkan']}) + ta.lowest(low, {p['tenkan']})) / 2",
                  f"kj = (ta.highest(high, {p['kijun']}) + ta.lowest(low, {p['kijun']})) / 2",
                  "longSig = ta.crossover(tk, kj)", "shortSig = ta.crossunder(tk, kj)"]
    elif t == "willr":
        lines += [f"x = ta.wpr({p['length']})", f"longSig = ta.crossover(x, {p['low']})",
                  f"shortSig = ta.crossunder(x, {p['high']})"]
    fp, ft = f["p"], f["type"]
    if ft == "none":
        lines += ["okL = true", "okS = true"]
    elif ft == "ema_trend":
        lines += [f"tr = ta.ema(close, {fp['length']})", "okL = close > tr", "okS = close < tr", "plot(tr, color=color.purple)"]
    elif ft == "adx":
        lines += [f"[dp, dm, adx] = ta.dmi({fp['length']}, {fp['length']})", f"okL = adx > {fp['threshold']}", "okS = okL"]
    elif ft == "supertrend":
        lines += [f"[st2, dir2] = ta.supertrend({fp['factor']}, {fp['atr_len']})", "okL = dir2 < 0", "okS = dir2 > 0"]
    elif ft == "session":
        lines += [f"okL = (hour(time, 'UTC') - {fp['start']} + 24) % 24 < {fp['hours']}", "okS = okL"]
    elif ft == "rsi_side":
        lines += [f"rr = ta.rsi(close, {fp['length']})", "okL = rr > 50", "okS = rr < 50"]
    if g["side"] == "long":
        lines += ["okS := false"]
    elif g["side"] == "short":
        lines += ["okL := false"]
    lines += [
        "goLong = longSig and okL",
        "goShort = shortSig and okS and not goLong",
        f"slA = {x['sl_atr']} * atr",
        f"tpA = {x['tp_atr']} * atr",
        f"// المخاطرة اللي اختارها التطور: {x['risk'] * 100:.1f}% من الحساب (بحساب السنت الحجم 0.01 لوت أو أكثر)",
    ]
    if g["reverse"]:
        lines += ['if goLong', '    strategy.entry("L", strategy.long)', 'if goShort', '    strategy.entry("S", strategy.short)']
    else:
        lines += ['if goLong and strategy.position_size == 0', '    strategy.entry("L", strategy.long)',
                  'if goShort and strategy.position_size == 0', '    strategy.entry("S", strategy.short)']
    lines += [
        'if strategy.position_size > 0',
        '    strategy.exit("xL", "L", stop=strategy.position_avg_price - slA, limit=strategy.position_avg_price + tpA)',
        'if strategy.position_size < 0',
        '    strategy.exit("xS", "S", stop=strategy.position_avg_price + slA, limit=strategy.position_avg_price - tpA)',
    ]
    if x["max_bars"]:
        lines += [f"if strategy.position_size != 0 and bar_index - strategy.opentrades.entry_bar_index(0) >= {x['max_bars']}",
                  '    strategy.close_all("time")']
    lines += ['plotshape(goLong, style=shape.triangleup, location=location.belowbar, color=color.green, size=size.tiny)',
              'plotshape(goShort, style=shape.triangledown, location=location.abovebar, color=color.red, size=size.tiny)']
    return "\n".join(lines) + "\n"
