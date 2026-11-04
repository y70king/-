"""
العقل المحترف 🧠 + محاكي السوق.

العقل = شبكة عصبية بذاكرة (recurrent):
    المدخلات = حواس السوق (هيكل، فجوات، زخم، تذبذب، وقت...)
             + حالة صفقته (اتجاهه، حجمه، ربحه/خسارته الحالية، كم له بالصفقة، بعده عن الوقف والهدف)
             + ذاكرته من الشموع اللي فاتت
    المخرجات (كلها يقررها العقل بنفسه، ما فيه ولا رقم ثابت):
        1. الاتجاه: بيع / بدون صفقة / شراء
        2. نسبة المخاطرة: من 1% لـ 10% من الحساب حسب ثقته (ومنها ينحسب اللوت)
        3. وقف الخسارة: من 0.2 لـ 4 × ATR
        4. الهدف: من 0.3 لـ 8 × ATR
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
N_OUT = 6       # بيع/بدون/شراء + مخاطرة + وقف + هدف

SL_MIN, SL_MAX = 0.2, 4.0
TP_MIN, TP_MAX = 0.3, 8.0

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
    حساب تداول حقيقي (بالدولار) لـ P عقل بنفس الوقت، شمعة بشمعة.
    نفس الكود يُستخدم بالتدريب وبالتداول التجريبي الحي.

    مثل الوسيط بالضبط:
      - الحجم باللوت: أقل شي 0.01 لوت (= 1 أونصة ذهب، كل 1$ حركة = 1$ ربح/خسارة)
      - العقل يختار نسبة المخاطرة (1%–10%) ووقفه، ومنها ينحسب اللوت.
        إذا الحساب صغير والوقف بعيد، مجبور على 0.01 لوت (يعني مخاطرة أكبر من اللي يبيها)
      - رافعة بلا حدود: الهامش ما يمنع أي صفقة، بس إذا الرصيد خلص يصير Stop Out
      - السبريد (20–30 سنت للأونصة) ينخصم: نصه بالدخول ونصه بالخروج
    """

    def __init__(self, genomes, spread_usd, death_level=C.DEATH_LEVEL, record=False, start=C.START_CAPITAL):
        self.w = unpack(genomes)
        self.P = P = genomes.shape[0]
        self.half_spread = spread_usd / 2.0   # السبريد (دولار لكل أونصة) — نصه بالدخول ونصه بالخروج
        self.log_death = np.log(death_level)
        self.record = record
        self.start = float(start)
        self.h = np.zeros((P, H), dtype=np.float32)
        self.dir = np.zeros(P)
        self.lots = np.zeros(P)
        self.entry = np.zeros(P)
        self.sl = np.zeros(P)
        self.tp = np.zeros(P)
        self.bars = np.zeros(P)
        self.cash = np.full(P, self.start)      # الرصيد المحقق بالدولار
        self.entry_cash = np.full(P, self.start)
        self.log_eq = np.zeros(P)
        self.peak = np.zeros(P)
        self.max_dd = np.zeros(P)
        self.trades = np.zeros(P, dtype=np.int64)
        self.in_market = np.zeros(P, dtype=np.int64)
        self.n_bars = 0
        self.alive = np.ones(P, dtype=bool)
        self.events = []      # (لعقل واحد) سجل الصفقات

    # ---------------------------------------------------------------- حفظ/استرجاع (للتداول الحي)
    STATE_KEYS = ("h", "dir", "lots", "entry", "sl", "tp", "bars", "cash", "entry_cash", "log_eq")

    def state_dict(self):
        return {k: np.asarray(getattr(self, k))[0].tolist() for k in self.STATE_KEYS}

    def load_state(self, d):
        for k in self.STATE_KEYS:
            if k in d:
                getattr(self, k)[0] = np.asarray(d[k])

    def equity(self, price):
        return self.cash + self.dir * self.lots * C.CONTRACT_SIZE * (price - self.entry)

    def _update_log_eq(self, price):
        self.log_eq = np.log(np.maximum(self.equity(price), 1e-6) / self.start)

    # ---------------------------------------------------------------- منطق التداول
    def _close(self, mask, price, reason, t):
        mask = mask & (self.dir != 0)
        if not mask.any():
            return
        pnl = self.dir * self.lots * C.CONTRACT_SIZE * (price - self.entry)
        fee = self.lots * C.CONTRACT_SIZE * self.half_spread
        # حماية من الرصيد السالب (مثل أغلب الوسطاء): أقل شي صفر
        self.cash = np.where(mask, np.maximum(self.cash + pnl - fee, 0.0), self.cash)
        if self.record and mask[0]:
            usd = float(self.cash[0] - self.entry_cash[0])
            self.events.append({
                "type": "close", "t": t, "reason": reason, "dir": int(self.dir[0]),
                "lots": float(self.lots[0]), "entry": float(self.entry[0]), "exit": float(price[0]),
                "sl": float(self.sl[0]), "tp": float(self.tp[0]), "bars": int(self.bars[0]),
                "pnl_usd": usd, "pnl_pct": usd / max(float(self.entry_cash[0]), 1e-9) * 100,
                "balance": float(self.cash[0]),
            })
        self.dir = np.where(mask, 0.0, self.dir)
        self.lots = np.where(mask, 0.0, self.lots)

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
        self._close(hit_sl, px_end, "sl", t)
        self._close(hit_tp, px_end, "tp", t)
        cpx = np.full(self.P, c)
        # Stop Out: الرصيد نزل تحت نص الهامش المستخدم → الوسيط يقفل الصفقة
        margin = self.lots * C.CONTRACT_SIZE * c / C.LEVERAGE
        self._close((self.dir != 0) & (self.equity(c) <= C.STOPOUT_LEVEL * margin), cpx, "stopout", t)

        # 2) العقل يفكر عند إغلاق الشمعة
        a = max(atr, 1e-9)
        eq_now = np.maximum(self.equity(c), 1e-9)
        open_ = self.dir != 0
        real_risk = self.lots * C.CONTRACT_SIZE * np.abs(self.entry - self.sl) / eq_now
        st = np.stack([
            self.dir,
            np.clip(real_risk / C.RISK_MAX, 0, 3) * open_,                    # المخاطرة الفعلية بالصفقة
            np.clip(self.dir * (c - self.entry) / a, -5, 5) * open_,         # ربحه/خسارته الحالية
            np.minimum(self.bars / 48.0, 3.0),
            np.clip(np.abs(c - self.sl) / a, 0, 6) * open_,
            np.clip(np.log(eq_now / self.start), -3, 3),                     # حجم حسابه (كبر ولا صغر)
        ], axis=1).astype(np.float32)
        w = self.w
        z = pre_t + np.matmul(self.h[:, None, :], w["U"])[:, 0, :] \
            + np.matmul(st[:, None, :], w["Ws"])[:, 0, :]
        self.h = np.tanh(z)
        out = np.matmul(self.h[:, None, :], w["W2"])[:, 0, :] + w["b2"]
        target = (out[:, :3].argmax(axis=1) - 1).astype(np.float64)
        target[~self.alive] = 0.0
        risk = C.RISK_MIN + (C.RISK_MAX - C.RISK_MIN) * _sig(out[:, 3])
        sl_atr = SL_MIN + (SL_MAX - SL_MIN) * _sig(out[:, 4])
        tp_atr = TP_MIN + (TP_MAX - TP_MIN) * _sig(out[:, 5])

        change = target != self.dir
        self._close(change, cpx, "brain", t)
        opening = change & (target != 0)
        if opening.any():
            eq = self.cash
            sl_dist = sl_atr * a
            step = C.LOT_STEP
            want = np.floor(eq * risk / (sl_dist * C.CONTRACT_SIZE) / step + 1e-9) * step
            max_lots = np.floor(eq * C.LEVERAGE / (c * C.CONTRACT_SIZE) / step + 1e-9) * step
            lots = np.minimum(np.maximum(want, C.MIN_LOT), max_lots)
            opening &= (lots >= C.MIN_LOT - 1e-12) & (eq > 0)
            fee = lots * C.CONTRACT_SIZE * self.half_spread
            self.entry_cash = np.where(opening, self.cash, self.entry_cash)
            self.cash = np.where(opening, self.cash - fee, self.cash)
            self.dir = np.where(opening, target, self.dir)
            self.lots = np.where(opening, lots, self.lots)
            self.entry = np.where(opening, c, self.entry)
            self.sl = np.where(opening, c - target * sl_dist, self.sl)
            self.tp = np.where(opening, c + target * tp_atr * a, self.tp)
            self.bars = np.where(opening, 0, self.bars)
            self.trades += opening
            if self.record and opening[0]:
                self.events.append({
                    "type": "open", "t": t, "dir": int(target[0]), "lots": float(lots[0]),
                    "entry": float(c), "sl": float(self.sl[0]), "tp": float(self.tp[0]),
                    "sl_atr": float(sl_atr[0]), "tp_atr": float(tp_atr[0]),
                    "risk_pct": float(lots[0] * C.CONTRACT_SIZE * sl_dist[0] / max(eq[0], 1e-9) * 100),
                    "balance": float(eq[0]),
                })
        self.bars += self.dir != 0
        self.in_market += self.dir != 0
        self.n_bars += 1
        self._update_log_eq(c)

        # 3) المخاطر: أقصى تراجع + موت العقل اللي خسر كثير
        np.maximum(self.peak, self.log_eq, out=self.peak)
        np.maximum(self.max_dd, self.peak - self.log_eq, out=self.max_dd)
        died = self.alive & (self.log_eq < self.log_death)
        if died.any():
            self.alive &= ~died
            self._close(died, cpx, "dead", t)
            self._update_log_eq(c)


def precompute(genomes, X):
    w = unpack(genomes)
    return np.tensordot(X, w["W1"], axes=([1], [1])) + w["b1"][None]   # (T, P, H)


def simulate(genomes, X, px, spread_usd, death_level=C.DEATH_LEVEL, record=False):
    """
    يخلي كل العقول تتداول نفس البيانات.
    X  : (T, F) الحواس ، px : dict فيه open/high/low/close/atr بطول T
    """
    eng = Engine(genomes, spread_usd, death_level, record)
    pre = precompute(genomes, X)
    o, hi, lo, c, at = px["open"], px["high"], px["low"], px["close"], px["atr"]
    T = X.shape[0]
    positions = np.zeros((T, eng.P), dtype=np.float32) if record else None
    for t in range(T):
        eng.process_bar(t, pre[t], o[t], hi[t], lo[t], c[t], at[t])
        if record:
            positions[t] = eng.dir * eng.lots
    # نقفل أي صفقة مفتوحة بالنهاية (تكلفة الخروج) عشان المقارنة عادلة
    eng._close(eng.dir != 0, np.full(eng.P, c[-1]), "end", T - 1)
    eng._update_log_eq(c[-1])
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
    reasons = {r: sum(e["reason"] == r for e in closes) for r in ("tp", "sl", "brain", "end", "dead", "stopout")}
    return {
        "trades": len(closes),
        "win_rate": float((pnl > 0).mean() * 100),
        "avg_win_pct": float(wins.mean()) if len(wins) else 0.0,
        "avg_loss_pct": float(losses.mean()) if len(losses) else 0.0,
        # نسبة الشراء حسب الوقت داخل السوق (مو عدد الصفقات)
        "long_pct": float(sum(e["bars"] for e in closes if e["dir"] > 0)
                          / max(sum(e["bars"] for e in closes), 1) * 100),
        "avg_lots": float(np.mean([e["lots"] for e in opens])),
        "avg_risk_pct": float(np.mean([e["risk_pct"] for e in opens])),
        "avg_win_usd": float(np.mean([e["pnl_usd"] for e in closes if e["pnl_usd"] > 0] or [0])),
        "avg_loss_usd": float(np.mean([e["pnl_usd"] for e in closes if e["pnl_usd"] <= 0] or [0])),
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
        f"     اللوت ~{p['avg_lots']:.2f}، مخاطرة فعلية ~{p['avg_risk_pct']:.0f}% من الحساب بالصفقة، مدة الصفقة {p['avg_hold_hours']:.1f} ساعة\n"
        f"     نسبة الربح {p['win_rate']:.0f}% | متوسط الربح {p['avg_win_usd']:+.2f}$ | متوسط الخسارة {p['avg_loss_usd']:+.2f}$\n"
        f"     طريقة الخروج: هدف {ex['tp']} | وقف {ex['sl']} | قرار العقل {ex['brain']}"
        + (f" | Stop Out {ex['stopout']}" if ex.get("stopout") else "")
    )


def save(path: str, genome: np.ndarray, meta: dict):
    np.savez_compressed(path, genome=genome.astype(np.float32),
                        meta=np.array([json.dumps(meta, ensure_ascii=False, default=float)]))


def load(path: str):
    d = np.load(path, allow_pickle=False)
    return d["genome"], json.loads(str(d["meta"][0]))
