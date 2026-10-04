"""Common $30 / 0.01-lot live-like simulator on Dukascopy M15 mid + recorded spread.

Rules (same for every bot):
  * start equity $30, fixed 0.01 lot (1 oz -> $1 per $1 move), no compounding of size
  * decisions are made on a bar's CLOSE and filled at the NEXT bar's OPEN
    (buy at ask = mid + spread/2, sell at bid = mid - spread/2), +$0.05 slippage
  * SL/TP checked intrabar on bid/ask, stop first when both are touched in one bar
  * margin at 1:500 leverage (~$8.3 for 1 oz at $4,140); broker stop-out when
    equity < 50% of used margin -> position force-closed; account is "blown" when
    equity can no longer cover the margin of a new 0.01 trade
  * daily target: once realised P/L for the UTC day reaches +$30, no new trades that day
"""
from __future__ import annotations
import pandas as pd, numpy as np

LOT_OZ = 1.0
SLIP = 0.05
LEVERAGE = 500
STOPOUT = 0.5
DAILY_TARGET = 30.0
START = 30.0

def load(path="/home/user/eval/tradingbot/data_store/xauusd_M15.parquet"):
    m = pd.read_parquet(path)[["open", "high", "low", "close", "volume", "spread"]]
    m.index = m.index.tz_convert(None)
    return m

def simulate(m: pd.DataFrame, decide, start, end, name=""):
    """decide(i) -> None | ("bracket", dir, sl_price, tp_price) | ("target", -1/0/1)
    i is the integer position of the bar whose close we are deciding on.
    decide may only look at m.iloc[: i + 1]."""
    idx = m.index
    i0 = idx.searchsorted(pd.Timestamp(start)); i1 = idx.searchsorted(pd.Timestamp(end))
    eq = START; pos = None; trades = []; daily = {}; blown = None; curve = []
    pending = None
    for i in range(i0, i1):
        bar = m.iloc[i]; t = idx[i]; day = t.date(); half = bar.spread / 2
        # 1) fill pending decision at this bar's open
        if pending is not None and blown is None:
            kind = pending[0]
            want = pending[1] if kind == "bracket" else pending[1]
            if kind == "target" and pos is not None and want != pos["dir"]:
                px = bar.open - half - SLIP if pos["dir"] > 0 else bar.open + half + SLIP
                eq += close_pos(pos, px, t, trades, daily, "signal")
                pos = None
            if pos is None and want != 0 and daily.get(day, 0) < DAILY_TARGET \
                    and eq >= m.open.iloc[i] * LOT_OZ / LEVERAGE:
                px = bar.open + half + SLIP if want > 0 else bar.open - half - SLIP
                pos = dict(dir=want, entry=px, t=t,
                           sl=pending[2] if kind == "bracket" else None,
                           tp=pending[3] if kind == "bracket" else None)
            pending = None
        # 2) manage open position intrabar
        if pos is not None:
            d = pos["dir"]
            lo_exit = bar.low - half if d > 0 else bar.low + half    # price we can exit at
            hi_exit = bar.high - half if d > 0 else bar.high + half
            worst = lo_exit if d > 0 else hi_exit
            margin = bar.close * LOT_OZ / LEVERAGE
            # broker stop-out on the worst price of the bar
            if eq + d * (worst - pos["entry"]) * LOT_OZ < STOPOUT * margin:
                so_px = pos["entry"] + d * ((STOPOUT * margin - eq) / LOT_OZ)
                eq += close_pos(pos, so_px, t, trades, daily, "STOP-OUT"); pos = None
            else:
                hit = None
                if pos["sl"] is not None and ((d > 0 and lo_exit <= pos["sl"]) or (d < 0 and hi_exit >= pos["sl"])):
                    hit = (pos["sl"] - d * SLIP, "SL")
                elif pos["tp"] is not None and ((d > 0 and hi_exit >= pos["tp"]) or (d < 0 and lo_exit <= pos["tp"])):
                    hit = (pos["tp"], "TP")
                if hit:
                    eq += close_pos(pos, hit[0], t, trades, daily, hit[1]); pos = None
        float_eq = eq + (pos["dir"] * ((bar.close - half * pos["dir"]) - pos["entry"]) * LOT_OZ if pos else 0)
        curve.append((t, float_eq))
        if blown is None and pos is None and eq < bar.close * LOT_OZ / LEVERAGE:
            blown = t
        # 3) decide on this bar's close
        if blown is None:
            dec = decide(i)
            if dec is not None:
                if dec[0] == "bracket" and pos is None:
                    pending = dec
                elif dec[0] == "target":
                    if pos is None and dec[1] == 0:
                        pending = None
                    elif pos is None or dec[1] != pos["dir"]:
                        pending = dec
    if pos is not None:
        bar = m.iloc[i1 - 1]; px = bar.close - bar.spread / 2 * pos["dir"]
        eq += close_pos(pos, px, idx[i1 - 1], trades, daily, "end")
    return dict(name=name, final=round(eq, 2), trades=trades, daily=daily, blown=blown,
                curve=pd.Series(dict(curve)))

def close_pos(pos, px, t, trades, daily, why):
    pnl = pos["dir"] * (px - pos["entry"]) * LOT_OZ
    trades.append(dict(entry_t=pos["t"], exit_t=t, dir=pos["dir"], entry=round(pos["entry"], 2),
                       exit=round(px, 2), pnl=round(pnl, 2), why=why))
    daily[t.date()] = daily.get(t.date(), 0) + pnl
    return pnl

def report(r):
    t = pd.DataFrame(r["trades"])
    days = pd.Series(r["daily"]).sort_index()
    out = dict(bot=r["name"], final=r["final"], pnl=round(r["final"] - START, 2),
               trades=len(t), win_rate=round((t.pnl > 0).mean() * 100, 1) if len(t) else 0,
               worst_trade=round(t.pnl.min(), 2) if len(t) else 0,
               min_equity=round(r["curve"].min(), 2),
               days_hit_30=int((days >= DAILY_TARGET).sum()),
               stopouts=int((t.why == "STOP-OUT").sum()) if len(t) else 0,
               blown=str(r["blown"])[:16] if r["blown"] is not None else "-")
    return out, days.round(2)
