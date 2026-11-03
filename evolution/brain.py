"""
العقل المحترف 🧠 + محاكي السوق.

العقل = شبكة عصبية بذاكرة (recurrent):
    المدخلات = حواس السوق (هيكل، فجوات، زخم، تذبذب، وقت...)
             + حالة صفقته (اتجاهه، حجمه، ربحه/خسارته الحالية، كم له بالصفقة، بعده عن الوقف والهدف)
             + ذاكرته من الشموع اللي فاتت
    المخرجات (كلها يقررها العقل بنفسه، ما فيه ولا رقم ثابت):
        1. الاتجاه: بيع / بدون صفقة / شراء
        2. حجم الصفقة: من 25% لـ 100% من الحساب حسب ثقته
        3. وقف الخسارة: من 0.5 لـ 4 × ATR
        4. الهدف: من 0.5 لـ 8 × ATR
    وأي وقت يقدر يطلع من الصفقة قبل الوقف أو الهدف إذا شاف شي ما عجبه.

الجينوم = كل أوزان الشبكة بمتجه واحد، والتطور يغيره.
"""
import json

import numpy as np

from . import config as C
from .features import N_FEATURES

F = N_FEATURES
H = C.HIDDEN
N_STATE = 6     # حالة الصفقة اللي يحس فيها العقل
N_OUT = 6       # بيع/بدون/شراء + حجم + وقف + هدف

SIZE_MIN, SIZE_MAX = 0.25, 1.0
SL_MIN, SL_MAX = 0.5, 4.0
TP_MIN, TP_MAX = 0.5, 8.0

_SHAPES = [("W1", (F, H)), ("U", (H, H)), ("Ws", (N_STATE, H)), ("b1", (H,)),
           ("W2", (H, N_OUT)), ("b2", (N_OUT,))]
GENOME_SIZE = sum(int(np.prod(s)) for _, s in _SHAPES)


def random_genomes(n: int, rng: np.random.Generator) -> np.ndarray:
    scale = {"W1": 1 / np.sqrt(F), "U": 0.5 / np.sqrt(H), "Ws": 0.5, "b1": 0.5,
             "W2": 1 / np.sqrt(H), "b2": 0.5}
    parts = [rng.normal(0, scale[name], (n, int(np.prod(shape)))) for name, shape in _SHAPES]
    return np.concatenate(parts, axis=1).astype(np.float32)


def unpack(genomes: np.ndarray) -> dict:
    P = genomes.shape[0]
    out, i = {}, 0
    for name, shape in _SHAPES:
        k = int(np.prod(shape))
        out[name] = genomes[:, i: i + k].reshape((P,) + shape)
        i += k
    return out


def _sig(x):
    return 1 / (1 + np.exp(-x))


class Engine:
    """
    يشغّل P عقل بنفس الوقت، شمعة بشمعة. نفس الكود يُستخدم بالتدريب وبالتداول التجريبي الحي.
    لكل شمعة: process_bar() — أول شي يشيك هل ضرب الوقف/الهدف داخل الشمعة،
    وبعدين العقل يقرر عند الإغلاق.
    """

    def __init__(self, genomes, cost_bps, death_level=C.DEATH_LEVEL, record=False):
        self.w = unpack(genomes)
        self.P = genomes.shape[0]
        self.cost = cost_bps / 1e4
        self.log_death = np.log(death_level)
        self.record = record
        P = self.P
        self.h = np.zeros((P, H), dtype=np.float32)
        self.dir = np.zeros(P)
        self.size = np.zeros(P)
        self.entry = np.zeros(P)
        self.sl = np.zeros(P)
        self.tp = np.zeros(P)
        self.bars = np.zeros(P)
        self.log_eq = np.zeros(P)
        self.peak = np.zeros(P)
        self.max_dd = np.zeros(P)
        self.trades = np.zeros(P, dtype=np.int64)
        self.in_market = np.zeros(P, dtype=np.int64)
        self.n_bars = 0
        self.alive = np.ones(P, dtype=bool)
        self.events = []      # (لعقل واحد) سجل الصفقات
        self.entry_eq = np.zeros(P)

    # ---------------------------------------------------------------- حفظ/استرجاع (للتداول الحي)
    STATE_KEYS = ("h", "dir", "size", "entry", "sl", "tp", "bars", "log_eq", "entry_eq")

    def state_dict(self):
        return {k: np.asarray(getattr(self, k))[0].tolist() for k in self.STATE_KEYS}

    def load_state(self, d):
        for k in self.STATE_KEYS:
            if k in d:
                getattr(self, k)[0] = np.asarray(d[k])

    # ---------------------------------------------------------------- منطق التداول
    def _close(self, mask, price, reason, t):
        if not mask.any():
            return
        self.log_eq[mask] += np.log1p(-self.cost * self.size[mask])
        if self.record and mask[0]:
            self.events.append({
                "type": "close", "t": t, "reason": reason, "dir": int(self.dir[0]),
                "size": float(self.size[0]), "entry": float(self.entry[0]), "exit": float(price[0]),
                "sl": float(self.sl[0]), "tp": float(self.tp[0]), "bars": int(self.bars[0]),
                "pnl_pct": float((np.exp(self.log_eq[0] - self.entry_eq[0]) - 1) * 100),
            })
        self.dir[mask] = 0.0
        self.size[mask] = 0.0

    def process_bar(self, t, pre_t, o, hi, lo, c, atr):
        """pre_t = (P, H) مساهمة الحواس لهالشمعة (محسوبة مسبقاً). الأسعار أرقام عادية."""
        # 1) هل ضرب الوقف أو الهدف داخل هالشمعة؟
        long_, short_ = self.dir > 0, self.dir < 0
        hit_sl = (long_ & (lo <= self.sl)) | (short_ & (hi >= self.sl))
        hit_tp = ~hit_sl & ((long_ & (hi >= self.tp)) | (short_ & (lo <= self.tp)))
        # إذا فتحت الشمعة بعد الوقف/الهدف (فجوة) نطلع بسعر الافتتاح
        sl_px = np.where(long_, np.minimum(o, self.sl), np.maximum(o, self.sl))
        tp_px = np.where(long_, np.maximum(o, self.tp), np.minimum(o, self.tp))
        px_end = np.where(hit_sl, sl_px, np.where(hit_tp, tp_px, c))
        open_ = self.dir != 0
        if open_.any():
            # صفقة بحجم ثابت من الدخول للخروج: الرصيد = رصيد الدخول × (1 + اتجاه × حجم × تغير السعر)
            ratio = self.dir * self.size * (px_end / np.where(open_, self.entry, 1.0) - 1)
            self.log_eq = np.where(open_, self.entry_eq + np.log1p(np.maximum(ratio, -0.99)), self.log_eq)
            self._close(hit_sl, px_end, "sl", t)
            self._close(hit_tp, px_end, "tp", t)

        # 2) العقل يفكر عند إغلاق الشمعة
        a = max(atr, 1e-9)
        st = np.stack([
            self.dir,
            self.size,
            np.clip(self.dir * (c - self.entry) / a, -5, 5) * (self.dir != 0),
            np.minimum(self.bars / 48.0, 3.0),
            np.clip(np.abs(c - self.sl) / a, 0, 6) * (self.dir != 0),
            np.clip(np.abs(self.tp - c) / a, 0, 10) * (self.dir != 0),
        ], axis=1).astype(np.float32)
        w = self.w
        z = pre_t + np.matmul(self.h[:, None, :], w["U"])[:, 0, :] \
            + np.matmul(st[:, None, :], w["Ws"])[:, 0, :]
        self.h = np.tanh(z)
        out = np.matmul(self.h[:, None, :], w["W2"])[:, 0, :] + w["b2"]
        target = (out[:, :3].argmax(axis=1) - 1).astype(np.float64)
        target[~self.alive] = 0.0
        size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * _sig(out[:, 3])
        sl_atr = SL_MIN + (SL_MAX - SL_MIN) * _sig(out[:, 4])
        tp_atr = TP_MIN + (TP_MAX - TP_MIN) * _sig(out[:, 5])

        change = target != self.dir
        cpx = np.full(self.P, c)
        self._close(change & (self.dir != 0), cpx, "brain", t)
        opening = change & (target != 0)
        if opening.any():
            self.dir = np.where(opening, target, self.dir)
            self.size = np.where(opening, size, self.size)
            self.entry = np.where(opening, c, self.entry)
            self.sl = np.where(opening, c - target * sl_atr * a, self.sl)
            self.tp = np.where(opening, c + target * tp_atr * a, self.tp)
            self.bars = np.where(opening, 0, self.bars)
            self.log_eq[opening] += np.log1p(-self.cost * size[opening])
            self.entry_eq = np.where(opening, self.log_eq, self.entry_eq)
            self.trades += opening
            if self.record and opening[0]:
                self.events.append({
                    "type": "open", "t": t, "dir": int(target[0]), "size": float(size[0]),
                    "entry": float(c), "sl": float(self.sl[0]), "tp": float(self.tp[0]),
                    "sl_atr": float(sl_atr[0]), "tp_atr": float(tp_atr[0]),
                })
        self.bars += self.dir != 0
        self.in_market += self.dir != 0
        self.n_bars += 1

        # 3) المخاطر: أقصى تراجع + موت العقل اللي خسر كثير
        np.maximum(self.peak, self.log_eq, out=self.peak)
        np.maximum(self.max_dd, self.peak - self.log_eq, out=self.max_dd)
        died = self.alive & (self.log_eq < self.log_death)
        if died.any():
            self.alive &= ~died
            self._close(died & (self.dir != 0), cpx, "dead", t)


def precompute(genomes, X):
    w = unpack(genomes)
    return np.tensordot(X, w["W1"], axes=([1], [1])) + w["b1"][None]   # (T, P, H)


def simulate(genomes, X, px, cost_bps, death_level=C.DEATH_LEVEL, record=False):
    """
    يخلي كل العقول تتداول نفس البيانات.
    X  : (T, F) الحواس ، px : dict فيه open/high/low/close/atr بطول T
    """
    eng = Engine(genomes, cost_bps, death_level, record)
    pre = precompute(genomes, X)
    o, hi, lo, c, at = px["open"], px["high"], px["low"], px["close"], px["atr"]
    T = X.shape[0]
    positions = np.zeros((T, eng.P), dtype=np.float32) if record else None
    for t in range(T):
        eng.process_bar(t, pre[t], o[t], hi[t], lo[t], c[t], at[t])
        if record:
            positions[t] = eng.dir * eng.size
    # نقفل أي صفقة مفتوحة بالنهاية (تكلفة الخروج) عشان المقارنة عادلة
    eng._close(eng.dir != 0, np.full(eng.P, c[-1]), "end", T - 1)
    res = {
        "log_return": eng.log_eq.copy(),
        "max_dd": 1 - np.exp(-eng.max_dd),
        "trades": eng.trades,
        "exposure": eng.in_market / max(T, 1),
        "alive": eng.alive,
    }
    if record:
        res["positions"] = positions
        res["events"] = eng.events
    return res


def personality(events, bar_minutes=C.BAR_MINUTES) -> dict:
    """يوصف "أسلوب" العقل من صفقاته: هو اللي اخترعه، مو احنا."""
    opens = [e for e in events if e["type"] == "open"]
    closes = [e for e in events if e["type"] == "close"]
    if not opens or not closes:
        return {}
    pnl = np.array([e["pnl_pct"] for e in closes])
    wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
    reasons = {r: sum(e["reason"] == r for e in closes) for r in ("tp", "sl", "brain", "end", "dead")}
    return {
        "trades": len(closes),
        "win_rate": float((pnl > 0).mean() * 100),
        "avg_win_pct": float(wins.mean()) if len(wins) else 0.0,
        "avg_loss_pct": float(losses.mean()) if len(losses) else 0.0,
        # نسبة الشراء حسب الوقت داخل السوق (مو عدد الصفقات)
        "long_pct": float(sum(e["bars"] for e in closes if e["dir"] > 0)
                          / max(sum(e["bars"] for e in closes), 1) * 100),
        "avg_size_pct": float(np.mean([e["size"] for e in opens]) * 100),
        "avg_sl_atr": float(np.mean([e["sl_atr"] for e in opens])),
        "avg_tp_atr": float(np.mean([e["tp_atr"] for e in opens])),
        "avg_hold_hours": float(np.mean([e["bars"] for e in closes]) * bar_minutes / 60),
        "exits": reasons,
    }


def describe(p: dict) -> str:
    if not p:
        return "  (ما تداول كفاية عشان نوصف أسلوبه)"
    style = "يمسك الصفقة طويل" if p["avg_hold_hours"] > 24 else "سريع (مضاربة)" if p["avg_hold_hours"] < 4 else "متوسط المدة"
    side = "يميل للشراء" if p["long_pct"] > 65 else "يميل للبيع" if p["long_pct"] < 35 else "متوازن شراء/بيع"
    ex = p["exits"]
    return (
        f"  🧬 أسلوب العقل (هو اللي اخترعه):\n"
        f"     {style}، {side} ({p['long_pct']:.0f}% من وقته بالسوق شراء)\n"
        f"     يحط الوقف ~{p['avg_sl_atr']:.1f}×ATR والهدف ~{p['avg_tp_atr']:.1f}×ATR "
        f"(عائد/مخاطرة ~{p['avg_tp_atr'] / max(p['avg_sl_atr'], 1e-9):.1f})\n"
        f"     حجم الصفقة ~{p['avg_size_pct']:.0f}% من الحساب، متوسط مدة الصفقة {p['avg_hold_hours']:.1f} ساعة\n"
        f"     نسبة الربح {p['win_rate']:.0f}% | متوسط الربح {p['avg_win_pct']:+.2f}% | متوسط الخسارة {p['avg_loss_pct']:+.2f}%\n"
        f"     طريقة الخروج: هدف {ex['tp']} | وقف {ex['sl']} | قرار العقل {ex['brain']}"
    )


def save(path: str, genome: np.ndarray, meta: dict):
    np.savez_compressed(path, genome=genome.astype(np.float32),
                        meta=np.array([json.dumps(meta, ensure_ascii=False, default=float)]))


def load(path: str):
    d = np.load(path, allow_pickle=False)
    return d["genome"], json.loads(str(d["meta"][0]))
