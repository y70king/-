"""
مجلس العقول 🏛️ — عدة عقول تتداول بحساب واحد بالتصويت.

كل عضو يشوف نفس السوق ونفس صفقة المجلس، ويعطي رأيه (شراء/بيع/بدون + مخاطرة + وقف + هدف).
  - الاتجاه: متوسط الأصوات؛ ما نفتح إلا إذا الأغلبية متفقة (|المتوسط| >= العتبة)
  - المخاطرة والوقف والهدف: متوسط آراء الأعضاء اللي صوتوا لنفس الاتجاه
عقل واحد ممكن يكون محظوظ أو حافظ، بس صعب أغلب المجلس يغلط بنفس الوقت.
"""
import numpy as np

from . import config as C
from .brain import unpack, H, _sig, SL_MIN, SL_MAX, TP_MIN, TP_MAX, precompute, personality

QUORUM = 0.5   # لازم صافي الأصوات يكون نص المجلس على الأقل بنفس الاتجاه


class Council:
    def __init__(self, genomes, spread_usd, record=False, start=C.START_CAPITAL, quorum=QUORUM):
        self.g = genomes
        self.w = unpack(genomes)
        self.K = genomes.shape[0]
        self.half_spread = spread_usd / 2.0
        self.record = record
        self.start = float(start)
        self.quorum = quorum
        self.h = np.zeros((self.K, H), dtype=np.float32)
        self.dir = 0.0; self.lots = 0.0; self.entry = 0.0; self.sl = 0.0; self.tp = 0.0; self.bars = 0
        self.cash = self.start; self.entry_cash = self.start
        self.trades = 0; self.in_market = 0; self.events = []
        self.peak = self.start; self.max_dd = 0.0

    def equity(self, price):
        return self.cash + self.dir * self.lots * C.CONTRACT_SIZE * (price - self.entry)

    def _close(self, price, reason, t):
        if self.dir == 0:
            return
        pnl = self.dir * self.lots * C.CONTRACT_SIZE * (price - self.entry)
        self.cash = max(self.cash + pnl - self.lots * C.CONTRACT_SIZE * self.half_spread, 0.0)
        if self.record:
            usd = self.cash - self.entry_cash
            self.events.append({"type": "close", "t": t, "reason": reason, "dir": int(self.dir), "lots": self.lots,
                                "entry": self.entry, "exit": float(price), "sl": self.sl, "tp": self.tp,
                                "bars": int(self.bars), "pnl_usd": usd,
                                "pnl_pct": usd / max(self.entry_cash, 1e-9) * 100, "balance": self.cash})
        self.dir = 0.0; self.lots = 0.0

    def process_bar(self, t, pre_t, o, hi, lo, c, atr):
        if self.dir > 0:
            if lo <= self.sl: self._close(min(o, self.sl), "sl", t)
            elif hi >= self.tp: self._close(max(o, self.tp), "tp", t)
        elif self.dir < 0:
            if hi >= self.sl: self._close(max(o, self.sl), "sl", t)
            elif lo <= self.tp: self._close(min(o, self.tp), "tp", t)
        if self.dir != 0 and self.equity(c) <= 0:
            self._close(c, "stopout", t)

        a = max(atr, 1e-9)
        eq_now = max(self.equity(c), 1e-9)
        op = float(self.dir != 0)
        real_risk = self.lots * C.CONTRACT_SIZE * abs(self.entry - self.sl) / eq_now
        st1 = np.array([self.dir, np.clip(real_risk / C.RISK_MAX, 0, 3) * op,
                        np.clip(self.dir * (c - self.entry) / a, -5, 5) * op, min(self.bars / 48.0, 3.0),
                        np.clip(abs(c - self.sl) / a, 0, 6) * op,
                        np.clip(np.log(eq_now / self.start), -3, 3)], dtype=np.float32)
        st = np.repeat(st1[None], self.K, axis=0)
        w = self.w
        z = pre_t + np.matmul(self.h[:, None, :], w["U"])[:, 0, :] + np.matmul(st[:, None, :], w["Ws"])[:, 0, :]
        self.h = np.tanh(z)
        out = np.matmul(self.h[:, None, :], w["W2"])[:, 0, :] + w["b2"]
        votes = out[:, :3].argmax(axis=1) - 1
        m = votes.mean()
        target = float(np.sign(m)) if abs(m) >= self.quorum else 0.0
        # إذا المجلس منقسم وهو داخل صفقة: يكمل عليها (ما يطلع إلا إذا الأغلبية قالت طلعة أو عكس)
        if target == 0 and self.dir != 0 and (votes == self.dir).mean() >= 0.5:
            target = self.dir
        if target != self.dir:
            self._close(c, "brain", t)
            if target != 0:
                agree = votes == target
                risk = float(np.mean(C.RISK_MIN + (C.RISK_MAX - C.RISK_MIN) * _sig(out[agree, 3])))
                sl_atr = float(np.mean(SL_MIN + (SL_MAX - SL_MIN) * _sig(out[agree, 4])))
                tp_atr = float(np.mean(TP_MIN + (TP_MAX - TP_MIN) * _sig(out[agree, 5])))
                eq = self.cash; sd = sl_atr * a; step = C.LOT_STEP
                lots = max(np.floor(eq * risk / (sd * C.CONTRACT_SIZE) / step + 1e-9) * step, C.MIN_LOT)
                if eq > 0:
                    self.entry_cash = self.cash
                    self.cash -= lots * C.CONTRACT_SIZE * self.half_spread
                    self.dir, self.lots, self.entry, self.bars = target, lots, c, 0
                    self.sl, self.tp = c - target * sd, c + target * tp_atr * a
                    self.trades += 1
                    if self.record:
                        self.events.append({"type": "open", "t": t, "dir": int(target), "lots": lots, "entry": float(c),
                                            "sl": self.sl, "tp": self.tp, "sl_atr": sl_atr, "tp_atr": tp_atr,
                                            "risk_pct": lots * C.CONTRACT_SIZE * sd / max(eq, 1e-9) * 100,
                                            "balance": eq, "votes": f"{int((votes == target).sum())}/{self.K}"})
        self.bars += self.dir != 0
        self.in_market += self.dir != 0
        e = self.equity(c)
        self.peak = max(self.peak, e)
        self.max_dd = max(self.max_dd, 1 - e / max(self.peak, 1e-9))


def simulate(genomes, X, px, spread_usd, record=True, warmup=0):
    """يشغل المجلس على البيانات. warmup = شموع بالبداية تبني الذاكرة بدون تداول."""
    cn = Council(genomes, spread_usd, record=record)
    pre = precompute(genomes, X)
    o, hi, lo, c, at = px["open"], px["high"], px["low"], px["close"], px["atr"]
    if warmup:
        tmp = Council(genomes, spread_usd)
        for t in range(warmup):
            tmp.process_bar(t, pre[t], o[t], hi[t], lo[t], c[t], at[t])
        cn.h = tmp.h
    for t in range(warmup, len(c)):
        cn.process_bar(t, pre[t], o[t], hi[t], lo[t], c[t], at[t])
    cn._close(c[-1], "end", len(c) - 1)
    return cn


def select(pop, valid, k=7, segments=4, min_ok=3):
    """يختار أقوى k عقول ثابتة: يربحون بـ min_ok أجزاء من segments، مرتبين بالوسيط."""
    from .brain import simulate as sim
    n = len(valid.ret)
    R = []
    for s in range(segments):
        part = valid.slice(s * n // segments, (s + 1) * n // segments)
        R.append(sim(pop, part.X, part.px, part.cost_bps, death_level=1e-9)["log_return"])
    R = np.stack(R, 1)
    ok = (R > 0).sum(1) >= min_ok
    med = np.median(R, 1)
    order = [i for i in np.argsort(-med) if ok[i]][:k]
    return pop[order], R[order]


# ---------------------------------------------------------------- حفظ/استرجاع للتداول الحي
_KEYS = ("dir", "lots", "entry", "sl", "tp", "bars", "cash", "entry_cash", "peak", "max_dd", "trades")


def state_dict(cn):
    d = {k: float(getattr(cn, k)) for k in _KEYS}
    d["h"] = cn.h.tolist()
    return d


def load_state(cn, d):
    for k in _KEYS:
        if k in d:
            setattr(cn, k, d[k])
    cn.h = np.asarray(d["h"], dtype=np.float32)


def load(path):
    import json
    z = np.load(path)
    return z["genomes"], json.loads(str(z["meta"][0]))
