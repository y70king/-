"""
تجهيز بيانات التدريب / التحقق / الاختبار.

بيانات الذهب تنقسم زمنياً:
    [ ............ تدريب ............ | تحقق | اختبار نهائي ]
والأسواق الثانية تنقص عند بداية فترة التحقق، عشان العقل ما يشوف أي شي
من المستقبل ولا حتى عن طريق سوق ثاني (مثلاً الفضة تتحرك مع الذهب).
"""
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config as C
from . import data, features


@dataclass
class Series:
    name: str
    X: np.ndarray
    ret: np.ndarray
    index: pd.DatetimeIndex
    cost_bps: float
    px: dict = None                              # open/high/low/close/atr
    others: list = field(default_factory=list)  # (للتحقق) نفس الفترة من الأسواق الثانية

    def slice(self, a, b):
        return Series(self.name, self.X[a:b], self.ret[a:b], self.index[a:b], self.cost_bps,
                      {k: v[a:b] for k, v in self.px.items()})


def mirror(df: pd.DataFrame) -> pd.DataFrame:
    """
    نسخة "مقلوبة" من السوق: كل صعود يصير هبوط والعكس (السعر → ثابت ÷ السعر).
    بيانات التدريب أغلبها صعود قوي للذهب، فبدون هذا العقل يتعلم "اشتري دايماً"
    ويخسر أول ما ينزل السوق. مع النسخة المقلوبة يشوف هبوط بقدر الصعود.
    """
    k = float(df["close"].median()) ** 2   # المقلوب يتحرك بنفس مستوى الأسعار تقريباً
    return pd.DataFrame({"open": k / df["open"], "high": k / df["low"], "low": k / df["high"],
                         "close": k / df["close"], "volume": df["volume"]}, index=df.index)


def _train_series(name, df, cost, end=None):
    X, r, idx, px = features.build(df, return_prices=True)
    keep = np.ones(len(idx), dtype=bool) if end is None else idx < end
    return Series(name, X[keep], r[keep], idx[keep], cost, {k: v[keep] for k, v in px.items()})


def load_all(verbose=True):
    gold_df = data.load(C.TARGET_MARKET)
    gX, gr, gi, gpx = features.build(gold_df, return_prices=True)
    gold = Series(C.TARGET_MARKET, gX, gr, gi, C.SPREAD_USD_EVAL, gpx)   # الحقل cost_bps = السبريد بالدولار

    n = len(gr)
    v0 = int(n * (1 - C.VALID_FRACTION - C.TEST_FRACTION))
    t0 = int(n * (1 - C.TEST_FRACTION))
    train_gold, valid, test = gold.slice(0, v0), gold.slice(v0, t0), gold.slice(t0, n)
    cutoff = gold.index[v0]
    test_start = gold.index[t0]

    gw = C.MARKETS[C.TARGET_MARKET]["weight"]
    train = [train_gold]
    weights = [gw]
    if C.MIRROR_TRAINING:
        train.append(_train_series(C.TARGET_MARKET + "~", mirror(gold_df), gold.cost_bps, cutoff))
        weights.append(gw)
    for sym, cfg in C.MARKETS.items():
        if sym == C.TARGET_MARKET or C.TRAIN_ONLY_TARGET:
            continue
        try:
            X, r, idx, px = features.build(data.load(sym), return_prices=True)
        except FileNotFoundError:
            if verbose:
                print(f"[WARN] ما فيه بيانات {sym}، نتخطاه")
            continue
        vmask = (idx >= cutoff) & (idx < test_start)
        if vmask.sum() > 1000:
            valid.others.append(Series(sym, X[vmask], r[vmask], idx[vmask], cfg["cost_bps"],
                                       {k: v[vmask] for k, v in px.items()}))
        keep = idx < cutoff
        if keep.sum() < C.WINDOW_BARS + 10:
            continue
        train.append(Series(sym, X[keep], r[keep], idx[keep], cfg["cost_bps"],
                            {k: v[keep] for k, v in px.items()}))
        weights.append(cfg["weight"])
        if C.MIRROR_TRAINING:
            train.append(_train_series(sym + "~", mirror(data.load(sym)), cfg["cost_bps"], cutoff))
            weights.append(cfg["weight"])

    if verbose:
        for s in train:
            print(f"  تدريب  {s.name:14s} {len(s.ret):>7,} شمعة  ({s.index[0]:%Y-%m-%d} → {s.index[-1]:%Y-%m-%d})")
        print(f"  تحقق   {valid.name:14s} {len(valid.ret):>7,} شمعة  ({valid.index[0]:%Y-%m-%d} → {valid.index[-1]:%Y-%m-%d})")
        print(f"  تحقق إضافي على نفس الفترة: {', '.join(o.name for o in valid.others)}")
        print(f"  اختبار {test.name:14s} {len(test.ret):>7,} شمعة  ({test.index[0]:%Y-%m-%d} → {test.index[-1]:%Y-%m-%d})")

    w = np.array(weights, dtype=float)
    return train, w / w.sum(), valid, test
