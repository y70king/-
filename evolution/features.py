"""
تحويل الشموع إلى "حواس" العقل.

كل المدخلات نسبية (عوائد مقسومة على التذبذب، مواقع داخل النطاق...) وما فيها
سعر خام أبداً، عشان نفس العقل يقدر يتداول الذهب والبيتكوين واليورو بنفس الطريقة،
وعشان ما يقدر يحفظ "الذهب كان 2600 بتاريخ كذا".

كل الحسابات سببية (تستخدم الماضي فقط) — ما فيه نظر للمستقبل.
"""
import numpy as np
import pandas as pd

WARMUP = 300  # أول 300 شمعة تنحذف لأن المؤشرات تحتاج تاريخ


def _atr(df, n):
    pc = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(span=n, adjust=False).mean()


def _rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def build(df: pd.DataFrame, return_prices: bool = False):
    """
    يرجع:
        X     : مصفوفة (T, F) float32 — المدخلات عند إغلاق كل شمعة
        ret   : (T,) العائد اللوغاريتمي من إغلاق هذي الشمعة لإغلاق اللي بعدها
        index : أوقات الشموع
        px    : (اختياري) أسعار open/high/low/close + ATR — للوقف والهدف
    """
    c, o, h, l = df["close"], df["open"], df["high"], df["low"]
    lr = np.log(c).diff()
    vol = lr.ewm(span=288, adjust=False).std().replace(0, np.nan)  # تذبذب يوم كامل
    atr14 = _atr(df, 14)
    atr288 = _atr(df, 288)

    f = {}
    for k in (1, 3, 6, 12, 24, 48, 96, 288):
        f[f"ret_{k}"] = np.log(c / c.shift(k)) / (vol * np.sqrt(k))
    f["body"] = (c - o) / atr14
    f["wick_up"] = (h - np.maximum(o, c)) / atr14
    f["wick_dn"] = (np.minimum(o, c) - l) / atr14
    for n in (48, 288):
        hi, lo = h.rolling(n).max(), l.rolling(n).min()
        f[f"range_{n}"] = 2 * (c - lo) / (hi - lo).replace(0, np.nan) - 1
    f["rsi"] = (_rsi(c) - 50) / 25
    f["vol_regime"] = np.log(atr14 / atr288)
    f["ema50"] = (c - c.ewm(span=50, adjust=False).mean()) / atr288
    f["ema200"] = (c - c.ewm(span=200, adjust=False).mean()) / atr288
    # --- هيكل السوق (نفس مفاهيم بوت الإشارات، بس العقل يقرر وزنها بنفسه) ---
    a = atr14.replace(0, np.nan)
    sh_lvl, sl_lvl = _confirmed_swings(df, 3)
    f["dist_swing_high"] = (sh_lvl - c) / a           # المسافة لآخر قمة مؤكدة
    f["dist_swing_low"] = (c - sl_lvl) / a            # المسافة لآخر قاع مؤكد
    brk = pd.Series(np.where(c > sh_lvl.shift(1), 1.0, np.where(c < sl_lvl.shift(1), -1.0, np.nan)), index=df.index)
    f["structure_bias"] = brk.ffill().fillna(0.0)     # اتجاه آخر كسر هيكل (BOS/CHoCH)
    grp = brk.notna().cumsum()
    f["bars_since_bos"] = (grp.groupby(grp).cumcount() / 50.0)
    f["fvg_bull"] = ((l - h.shift(2)).clip(lower=0) / a).rolling(12).max()   # فجوة سعرية صاعدة حديثة
    f["fvg_bear"] = ((l.shift(2) - h).clip(lower=0) / a).rolling(12).max()   # فجوة سعرية هابطة حديثة
    dow = df.index.dayofweek
    f["dow_sin"] = pd.Series(np.sin(2 * np.pi * dow / 7), index=df.index)
    f["dow_cos"] = pd.Series(np.cos(2 * np.pi * dow / 7), index=df.index)
    hour = df.index.hour + df.index.minute / 60
    f["hour_sin"] = pd.Series(np.sin(2 * np.pi * hour / 24), index=df.index)
    f["hour_cos"] = pd.Series(np.cos(2 * np.pi * hour / 24), index=df.index)

    X = pd.DataFrame(f).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(-4, 4)
    ret = np.log(c.shift(-1) / c).fillna(0.0)

    assert list(X.columns) == FEATURE_NAMES, list(X.columns)
    X, ret = X.iloc[WARMUP:], ret.iloc[WARMUP:]
    px = {k: df[k].iloc[WARMUP:].values.astype(np.float64) for k in ("open", "high", "low", "close")}
    px["atr"] = atr14.iloc[WARMUP:].bfill().values.astype(np.float64)
    if return_prices:
        return X.values.astype(np.float32), ret.values.astype(np.float64), X.index, px
    return X.values.astype(np.float32), ret.values.astype(np.float64), X.index


def _confirmed_swings(df, k):
    """آخر قمة/قاع (fractal) — تنعرف بس بعد ما تمر k شموع بعدها (بدون نظر للمستقبل)."""
    h, l = df["high"], df["low"]
    win = 2 * k + 1
    is_h = h == h.rolling(win, center=True).max()
    is_l = l == l.rolling(win, center=True).min()
    sh = h.where(is_h).shift(k).ffill()
    sl = l.where(is_l).shift(k).ffill()
    return sh, sl


FEATURE_NAMES = [
    *(f"ret_{k}" for k in (1, 3, 6, 12, 24, 48, 96, 288)),
    "body", "wick_up", "wick_dn", "range_48", "range_288", "rsi",
    "vol_regime", "ema50", "ema200",
    "dist_swing_high", "dist_swing_low", "structure_bias", "bars_since_bos", "fvg_bull", "fvg_bear",
    "dow_sin", "dow_cos", "hour_sin", "hour_cos",
]
N_FEATURES = len(FEATURE_NAMES)
