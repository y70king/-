"""
باك تست سريع (numba) لاستراتيجية مؤشرات — نفس قواعد حساب السنت 20$ اللي يستخدمها العقل.

الترتيب بكل شمعة: (1) هل ضرب الوقف/الهدف داخل الشمعة؟ (2) المدة القصوى (3) الإشارة عند الإغلاق.
"""
import numpy as np

try:
    from numba import njit
except ImportError:          # بدون numba يشتغل بس أبطأ
    def njit(*a, **k):
        return (lambda f: f) if not a or not callable(a[0]) else a[0]

from . import config as C


@njit(cache=True)
def _bt(o, h, l, c, atr, sig, sl_atr, tp_atr, max_bars, risk, reverse,
        half_spread, start, contract, min_lot, step, death, record):
    T = len(c)
    cash = start
    d = 0.0; lots = 0.0; entry = 0.0; sl = 0.0; tp = 0.0; bars = 0
    peak = start; maxdd = 0.0; trades = 0; inmk = 0; alive = True
    pos = np.zeros(T) if record else np.zeros(1)
    ev = np.zeros((T, 6)) if record else np.zeros((1, 6))   # t_exit, dir, entry, exit, pnl, reason
    ne = 0
    for t in range(T):
        # 1) الوقف والهدف داخل الشمعة
        if d != 0.0:
            ex = -1.0; why = 0.0
            if d > 0:
                if l[t] <= sl:
                    ex = min(o[t], sl); why = 1.0
                elif h[t] >= tp:
                    ex = max(o[t], tp); why = 2.0
            else:
                if h[t] >= sl:
                    ex = max(o[t], sl); why = 1.0
                elif l[t] <= tp:
                    ex = min(o[t], tp); why = 2.0
            if ex < 0 and max_bars > 0 and bars >= max_bars:
                ex = c[t]; why = 3.0
            if ex >= 0:
                pnl = d * lots * contract * (ex - entry) - lots * contract * half_spread
                cash = max(cash + pnl, 0.0)
                if record:
                    ev[ne, 0] = t; ev[ne, 1] = d; ev[ne, 2] = entry; ev[ne, 3] = ex; ev[ne, 4] = pnl; ev[ne, 5] = why; ne += 1
                d = 0.0; lots = 0.0
        # 2) الإشارة عند الإغلاق
        s = sig[t]
        if alive and s != 0 and s != d and not np.isnan(atr[t]):
            if d != 0.0:
                if not reverse:
                    s = 0
                else:
                    pnl = d * lots * contract * (c[t] - entry) - lots * contract * half_spread
                    cash = max(cash + pnl, 0.0)
                    if record:
                        ev[ne, 0] = t; ev[ne, 1] = d; ev[ne, 2] = entry; ev[ne, 3] = c[t]; ev[ne, 4] = pnl; ev[ne, 5] = 4.0; ne += 1
                    d = 0.0; lots = 0.0
            if s != 0 and cash > 0:
                sd = sl_atr * atr[t]
                lt = np.floor(cash * risk / (sd * contract) / step + 1e-9) * step
                if lt < min_lot:
                    lt = min_lot
                cash -= lt * contract * half_spread
                d = float(s); lots = lt; entry = c[t]; bars = 0
                sl = c[t] - d * sd; tp = c[t] + d * tp_atr * atr[t]
                trades += 1
        if d != 0.0:
            bars += 1; inmk += 1
        eq = cash + d * lots * contract * (c[t] - entry)
        if eq > peak:
            peak = eq
        dd = 1.0 - eq / peak if peak > 0 else 1.0
        if dd > maxdd:
            maxdd = dd
        if alive and eq < start * death:
            alive = False
            if d != 0.0:
                cash = max(cash + d * lots * contract * (c[t] - entry) - lots * contract * half_spread, 0.0)
                d = 0.0; lots = 0.0
        if record:
            pos[t] = d * lots
    if d != 0.0:
        cash = max(cash + d * lots * contract * (c[T - 1] - entry) - lots * contract * half_spread, 0.0)
    return cash, maxdd, trades, inmk, alive, pos, ev[:ne]


def backtest(g, px, sig, spread=C.SPREAD_USD_EVAL, death=C.DEATH_LEVEL, record=False):
    x = g["exit"]
    cash, dd, trades, inmk, alive, pos, ev = _bt(
        px["open"], px["high"], px["low"], px["close"], px["atr_tv"], sig.astype(np.int64),
        float(x["sl_atr"]), float(x["tp_atr"]), int(x["max_bars"]), float(x["risk"]), bool(g["reverse"]),
        spread / 2.0, float(C.START_CAPITAL), float(C.CONTRACT_SIZE), float(C.MIN_LOT), float(C.LOT_STEP),
        float(death), bool(record))
    return {"final": float(cash), "log_return": float(np.log(max(cash, 1e-6) / C.START_CAPITAL)),
            "max_dd": float(dd), "trades": int(trades), "exposure": inmk / max(len(sig), 1),
            "alive": bool(alive), "positions": pos if record else None, "events": ev if record else None}
