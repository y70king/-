"""
تنزيل البيانات التاريخية المجانية من Dukascopy (شموع دقيقة) وتحويلها لفريم 5 دقائق.

الاستخدام:
    python -m evolution.data            # ينزل/يحدث كل الأسواق
    python -m evolution.data XAUUSD     # سوق واحد

البيانات تنحفظ كاش بمجلد evolution/data/ وكل تشغيل ينزل الأيام الناقصة فقط.
"""
import os
import sys
import lzma
import time
import struct
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import requests

from . import config as C

URL = "https://datafeed.dukascopy.com/datafeed/{sym}/{y}/{m:02d}/{d:02d}/BID_candles_min_1.bi5"
_session = requests.Session()
FAILED = "failed"


def _fetch_day(sym: str, day: dt.date, scale: float):
    """يرجع شموع دقيقة ليوم واحد كـ DataFrame، أو None إذا اليوم عطلة/غير متوفر."""
    url = URL.format(sym=sym, y=day.year, m=day.month - 1, d=day.day)  # الشهر يبدأ من 0
    for attempt in range(8):
        try:
            r = _session.get(url, timeout=30)
        except requests.RequestException:
            time.sleep(min(2 ** attempt, 30))
            continue
        if r.status_code == 200:
            break
        if r.status_code == 404:
            return None
        time.sleep(min(2 ** attempt, 30))  # 429 (ضغط على السيرفر) → انتظر وحاول مرة ثانية
    else:
        return FAILED

    if not r.content:
        return None
    try:
        raw = lzma.decompress(r.content)
    except lzma.LZMAError:
        return None
    n = len(raw) // 24
    if n == 0:
        return None
    rec = np.frombuffer(raw[: n * 24], dtype=">i4").reshape(n, 6)
    vol = np.frombuffer(raw[: n * 24], dtype=">f4").reshape(n, 6)[:, 5]
    base = pd.Timestamp(day, tz="UTC")
    df = pd.DataFrame({
        "open": rec[:, 1] / scale,
        "close": rec[:, 2] / scale,
        "low": rec[:, 3] / scale,
        "high": rec[:, 4] / scale,
        "volume": vol.astype(float),
    }, index=base + pd.to_timedelta(rec[:, 0], unit="s"))
    return df[df["volume"] > 0]  # Dukascopy يعبي العطل بشموع ثابتة حجمها صفر


def resample(df: pd.DataFrame, minutes: int) -> pd.DataFrame:
    rule = f"{minutes}min"
    out = pd.DataFrame({
        "open": df["open"].resample(rule).first(),
        "high": df["high"].resample(rule).max(),
        "low": df["low"].resample(rule).min(),
        "close": df["close"].resample(rule).last(),
        "volume": df["volume"].resample(rule).sum(),
    })
    return out.dropna()


def cache_path(sym: str) -> str:
    return os.path.join(C.DATA_DIR, f"{sym}_{C.BASE_MINUTES}m_{C.DATA_SOURCE}.csv.gz")


def load_raw(sym: str) -> pd.DataFrame:
    df = pd.read_csv(cache_path(sym), index_col=0)
    df.index = pd.to_datetime(df.index, utc=True)
    return df


def load(sym: str) -> pd.DataFrame:
    path = cache_path(sym)
    if not os.path.exists(path):
        raise FileNotFoundError(f"ما فيه بيانات لـ {sym}. شغّل: python -m evolution.data")
    df = pd.read_csv(path, index_col=0)
    df.index = pd.to_datetime(df.index, utc=True)
    if C.BAR_MINUTES != C.BASE_MINUTES:
        df = resample(df, C.BAR_MINUTES)
    return df


def update_yahoo(sym: str) -> pd.DataFrame:
    import yfinance as yf
    os.makedirs(C.DATA_DIR, exist_ok=True)
    df = yf.download(C.YAHOO_SYMBOLS[sym], period="60d", interval=f"{C.BASE_MINUTES}m",
                     progress=False, auto_adjust=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df = df.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
    df.index = pd.to_datetime(df.index, utc=True)
    new = df
    if os.path.exists(cache_path(sym)):  # نجمع مع القديم عشان التاريخ يكبر مع الوقت
        df = pd.concat([load_raw(sym), new])
        df = df[~df.index.duplicated(keep="last")].sort_index()
    df.to_csv(cache_path(sym), float_format="%.8g", compression="gzip")
    print(f"[{sym}] yahoo: {len(df):,} شمعة ({df.index[0]:%Y-%m-%d} → {df.index[-1]:%Y-%m-%d})")
    return df


def _download_days(sym, days_list, scale, workers):
    with ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(lambda d: _fetch_day(sym, d, scale), days_list))
    # الأيام اللي فشلت بسبب الضغط → نعيد محاولتها وحدة وحدة
    for i, (d, r) in enumerate(zip(days_list, results)):
        if isinstance(r, str):
            time.sleep(1)
            results[i] = _fetch_day(sym, d, scale)
            if isinstance(results[i], str):
                print(f"[WARN] فشل تنزيل {sym} {d}")
    return [p for p in results if p is not None and not isinstance(p, str)]


def update(sym: str, days: int = C.HISTORY_DAYS, workers: int = 3, deadline: float = None):
    """ينزل الأيام الناقصة على دفعات، ويحفظ بعد كل دفعة (لو انقطع يكمل من وين وقف)."""
    if C.DATA_SOURCE == "yahoo":
        return update_yahoo(sym)
    os.makedirs(C.DATA_DIR, exist_ok=True)
    scale = C.MARKETS[sym]["scale"]
    today = dt.datetime.now(dt.timezone.utc).date()
    first_day = today - dt.timedelta(days=days)

    df = load_raw(sym) if os.path.exists(cache_path(sym)) else None
    # نعيد تنزيل آخر يومين احتياطاً (ممكن كانوا ناقصين)
    start = first_day if df is None else max(first_day, df.index[-1].date() - dt.timedelta(days=2))
    all_days = [start + dt.timedelta(days=i) for i in range((today - start).days)]
    print(f"[{sym}] تنزيل {len(all_days)} يوم...")

    for c in range(0, len(all_days), 60):
        if deadline and time.time() > deadline:
            print(f"[{sym}] انتهى الوقت المسموح للتنزيل — يكمل بالتشغيل الجاي")
            break
        parts = _download_days(sym, all_days[c: c + 60], scale, workers)
        if not parts:
            continue
        new = resample(pd.concat(parts), C.BASE_MINUTES)
        df = new if df is None else pd.concat([df, new])
        df = df[~df.index.duplicated(keep="last")].sort_index()
        df = df[df.index >= pd.Timestamp(first_day, tz="UTC")]
        df.to_csv(cache_path(sym), float_format="%.8g", compression="gzip")

    if df is None:
        print(f"[WARN] ما قدرنا ننزل أي بيانات لـ {sym}")
        return None
    print(f"[{sym}] {len(df):,} شمعة ({df.index[0]:%Y-%m-%d} → {df.index[-1]:%Y-%m-%d})")
    return df


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("symbols", nargs="*", default=list(C.MARKETS))
    ap.add_argument("--max-minutes", type=float, default=None, help="أقصى مدة للتنزيل")
    args = ap.parse_args()
    dl = time.time() + args.max_minutes * 60 if args.max_minutes else None
    for s in args.symbols:
        update(s, deadline=dl)
