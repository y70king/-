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


def build(df: pd.DataFrame):
    """
    يرجع:
        X     : مصفوفة (T, F) float32 — المدخلات عند إغلاق كل شمعة
        ret   : (T,) العائد اللوغاريتمي من إغلاق هذي الشمعة لإغلاق اللي بعدها
        index : أوقات الشموع
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
    hour = df.index.hour + df.index.minute / 60
    f["hour_sin"] = pd.Series(np.sin(2 * np.pi * hour / 24), index=df.index)
    f["hour_cos"] = pd.Series(np.cos(2 * np.pi * hour / 24), index=df.index)

    X = pd.DataFrame(f).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(-4, 4)
    ret = np.log(c.shift(-1) / c).fillna(0.0)

    X, ret = X.iloc[WARMUP:], ret.iloc[WARMUP:]
    return X.values.astype(np.float32), ret.values.astype(np.float64), X.index


FEATURE_NAMES = [
    *(f"ret_{k}" for k in (1, 3, 6, 12, 24, 48, 96, 288)),
    "body", "wick_up", "wick_dn", "range_48", "range_288", "rsi",
    "vol_regime", "ema50", "ema200", "hour_sin", "hour_cos",
]
N_FEATURES = len(FEATURE_NAMES)
