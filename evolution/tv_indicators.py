"""
مؤشرات ترندنك فيو — بنفس معادلات ta.* في Pine Script بالضبط.

كل الدوال تاخذ مصفوفات numpy وترجع مصفوفة بنفس الطول (القيم الأولى NaN لين يكتمل الحساب).
"""
import numpy as np
import pandas as pd


def _s(x):
    return pd.Series(x)


def sma(x, n):                       # ta.sma
    return _s(x).rolling(n).mean().values


def ema(x, n):                       # ta.ema  (alpha = 2/(n+1)، يبدأ بـ SMA)
    s = _s(x)
    out = s.ewm(span=n, adjust=False).mean()
    out.iloc[: n - 1] = np.nan
    return out.values


def rma(x, n):                       # ta.rma  (Wilder: alpha = 1/n)
    s = _s(x)
    out = s.ewm(alpha=1.0 / n, adjust=False).mean()
    out.iloc[: n - 1] = np.nan
    return out.values


def wma(x, n):                       # ta.wma
    w = np.arange(1, n + 1, dtype=float)
    return _s(x).rolling(n).apply(lambda a: np.dot(a, w) / w.sum(), raw=True).values


def tr(h, l, c):                     # ta.tr
    pc = np.r_[np.nan, c[:-1]]
    return np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)


def atr(h, l, c, n=14):              # ta.atr
    return rma(tr(h, l, c), n)


def rsi(c, n=14):                    # ta.rsi
    d = np.diff(c, prepend=np.nan)
    up = rma(np.where(d > 0, d, 0.0), n)
    dn = rma(np.where(d < 0, -d, 0.0), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = up / dn
        out = 100 - 100 / (1 + rs)
    out[dn == 0] = 100.0
    return out


def macd(c, fast=12, slow=26, sig=9):   # ta.macd
    m = ema(c, fast) - ema(c, slow)
    s = _s(m).ewm(span=sig, adjust=False).mean().values
    return m, s


def stoch(c, h, l, k=14, smooth_k=3, d=3):   # ta.stoch + ta.sma (مثل مؤشر Stoch الافتراضي)
    hh = _s(h).rolling(k).max().values
    ll = _s(l).rolling(k).min().values
    with np.errstate(divide="ignore", invalid="ignore"):
        raw = 100 * (c - ll) / (hh - ll)
    kk = sma(raw, smooth_k)
    return kk, sma(kk, d)


def bbands(c, n=20, mult=2.0):       # ta.bb (الانحراف المعياري للمجتمع مثل ترندنك فيو)
    basis = sma(c, n)
    dev = _s(c).rolling(n).std(ddof=0).values * mult
    return basis, basis + dev, basis - dev


def supertrend(h, l, c, factor=3.0, n=10):   # ta.supertrend → (القيمة، الاتجاه: -1 صاعد، 1 نازل مثل Pine)
    a = atr(h, l, c, n)
    hl2 = (h + l) / 2
    up = hl2 - factor * a
    dn = hl2 + factor * a
    T = len(c)
    st = np.full(T, np.nan)
    direction = np.ones(T)
    fu, fd = up.copy(), dn.copy()
    for i in range(1, T):
        if np.isnan(a[i]):
            continue
        fu[i] = up[i] if (np.isnan(fu[i - 1]) or c[i - 1] < fu[i - 1]) else max(up[i], fu[i - 1])
        fd[i] = dn[i] if (np.isnan(fd[i - 1]) or c[i - 1] > fd[i - 1]) else min(dn[i], fd[i - 1])
        if np.isnan(st[i - 1]):
            direction[i] = 1
        elif st[i - 1] == fd[i - 1]:
            direction[i] = -1 if c[i] > fd[i] else 1
        else:
            direction[i] = 1 if c[i] < fu[i] else -1
        st[i] = fu[i] if direction[i] == -1 else fd[i]
    return st, direction


def dmi(h, l, c, n=14, adx_smooth=14):   # ta.dmi → (+DI, -DI, ADX)
    up = np.diff(h, prepend=np.nan)
    dn = -np.diff(l, prepend=np.nan)
    plus_dm = np.where((up > dn) & (up > 0), up, 0.0)
    minus_dm = np.where((dn > up) & (dn > 0), dn, 0.0)
    trur = rma(tr(h, l, c), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        plus = 100 * rma(plus_dm, n) / trur
        minus = 100 * rma(minus_dm, n) / trur
        dx = 100 * np.abs(plus - minus) / (plus + minus)
    return plus, minus, rma(np.nan_to_num(dx), adx_smooth)


def donchian(h, l, n):               # ta.highest / ta.lowest للشموع اللي قبل
    hh = _s(h).rolling(n).max().shift(1).values
    ll = _s(l).rolling(n).min().shift(1).values
    return hh, ll


def cci(h, l, c, n=20):              # ta.cci على hlc3
    tp = (h + l + c) / 3
    m = sma(tp, n)
    md = _s(tp).rolling(n).apply(lambda a: np.mean(np.abs(a - a.mean())), raw=True).values
    with np.errstate(divide="ignore", invalid="ignore"):
        return (tp - m) / (0.015 * md)


def willr(h, l, c, n=14):            # ta.wpr
    hh = _s(h).rolling(n).max().values
    ll = _s(l).rolling(n).min().values
    with np.errstate(divide="ignore", invalid="ignore"):
        return 100 * (c - hh) / (hh - ll)


def ichimoku(h, l, tenkan=9, kijun=26):
    def mid(n):
        return (_s(h).rolling(n).max().values + _s(l).rolling(n).min().values) / 2
    return mid(tenkan), mid(kijun)


def crossover(a, b):                 # ta.crossover
    pa, pb = np.r_[np.nan, a[:-1]], np.r_[np.nan, b[:-1]]
    return (a > b) & (pa <= pb)


def crossunder(a, b):                # ta.crossunder
    pa, pb = np.r_[np.nan, a[:-1]], np.r_[np.nan, b[:-1]]
    return (a < b) & (pa >= pb)
