"""
تجهيز بيانات التدريب / التحقق / الاختبار.

بيانات الذهب تنقسم زمنياً:
    [ ............ تدريب ............ | تحقق | اختبار نهائي ]
والأسواق الثانية تنقص عند بداية فترة التحقق، عشان العقل ما يشوف أي شي
من المستقبل ولا حتى عن طريق سوق ثاني (مثلاً الفضة تتحرك مع الذهب).
"""
from dataclasses import dataclass

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

    def slice(self, a, b):
        return Series(self.name, self.X[a:b], self.ret[a:b], self.index[a:b], self.cost_bps)


def load_all(verbose=True):
    gold_df = data.load(C.TARGET_MARKET)
    gX, gr, gi = features.build(gold_df)
    gold = Series(C.TARGET_MARKET, gX, gr, gi, C.MARKETS[C.TARGET_MARKET]["cost_bps"])

    n = len(gr)
    v0 = int(n * (1 - C.VALID_FRACTION - C.TEST_FRACTION))
    t0 = int(n * (1 - C.TEST_FRACTION))
    train_gold, valid, test = gold.slice(0, v0), gold.slice(v0, t0), gold.slice(t0, n)
    cutoff = gold.index[v0]

    train = [train_gold]
    weights = [C.MARKETS[C.TARGET_MARKET]["weight"]]
    for sym, cfg in C.MARKETS.items():
        if sym == C.TARGET_MARKET:
            continue
        try:
            X, r, idx = features.build(data.load(sym))
        except FileNotFoundError:
            if verbose:
                print(f"[WARN] ما فيه بيانات {sym}، نتخطاه")
            continue
        keep = idx < cutoff
        if keep.sum() < C.WINDOW_BARS + 10:
            continue
        train.append(Series(sym, X[keep], r[keep], idx[keep], cfg["cost_bps"]))
        weights.append(cfg["weight"])

    if verbose:
        for s in train:
            print(f"  تدريب  {s.name:14s} {len(s.ret):>7,} شمعة  ({s.index[0]:%Y-%m-%d} → {s.index[-1]:%Y-%m-%d})")
        print(f"  تحقق   {valid.name:14s} {len(valid.ret):>7,} شمعة  ({valid.index[0]:%Y-%m-%d} → {valid.index[-1]:%Y-%m-%d})")
        print(f"  اختبار {test.name:14s} {len(test.ret):>7,} شمعة  ({test.index[0]:%Y-%m-%d} → {test.index[-1]:%Y-%m-%d})")

    w = np.array(weights, dtype=float)
    return train, w / w.sum(), valid, test
