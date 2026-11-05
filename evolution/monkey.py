"""
اختبار القرود 🐒

نخلي العقل يتداول فترة ما شافها، وبنفس الفترة نطلق 1000 "قرد": متداولين
عشوائيين يغيرون مركزهم (شراء/بيع/بدون) بشكل عشوائي وبنفس معدل تداول العقل
تقريباً، ويدفعون نفس التكاليف.

إذا العقل ما تفوق على 95% من القرود ← ربحه حظ، مو ذكاء.
"""
import numpy as np

from . import config as C
from .brain import simulate, personality, describe


def trading_days(index) -> int:
    """عدد أيام التداول (من الاثنين للجمعة) بالفترة."""
    d = index[index.dayofweek < 5].normalize().unique()
    return max(len(d), 1)


def _account_paths(pos, close, lots, spread):
    """رصيد (دولار) لكل مسار مراكز pos=(M,T) بلوت ثابت: يرجع الرصيد النهائي، وصفر إذا انضرب الحساب."""
    dp = np.diff(close, append=close[-1])                       # حركة السعر للشمعة الجاية
    pnl = pos * lots * C.CONTRACT_SIZE * dp
    dpos = np.abs(np.diff(pos, axis=1, prepend=0.0))
    fees = dpos * lots * C.CONTRACT_SIZE * spread / 2
    eq = C.START_CAPITAL + np.cumsum(pnl - fees, axis=1)
    blown = (eq <= 0).any(axis=1)
    final = eq[:, -1] - np.abs(pos[:, -1]) * lots * C.CONTRACT_SIZE * spread / 2
    return np.where(blown, 0.0, np.maximum(final, 0.0))


def monkeys(close, spread, change_prob, n, rng, side_probs=(1 / 3, 1 / 3, 1 / 3), lots=C.MIN_LOT):
    """
    القرود: يفتحون ويقفلون عشوائياً بنفس معدل تداول العقل ونفس ميوله ونفس اللوت،
    بحساب 35$ وبنفس السبريد. يرجع العائد اللوغاريتمي النهائي لكل قرد (الحساب المنضرب = خسارة كاملة).
    """
    T = len(close)
    out = np.empty(n)
    chunk = 100
    for s in range(0, n, chunk):
        m = min(chunk, n - s)
        change = rng.random((m, T)) < change_prob
        change[:, 0] = True
        choice = (rng.choice(3, (m, T), p=side_probs) - 1).astype(np.float64)
        idx = np.where(change, np.arange(T)[None, :], 0)
        np.maximum.accumulate(idx, axis=1, out=idx)
        pos = np.take_along_axis(choice, idx, axis=1)
        out[s: s + m] = np.log(np.maximum(_account_paths(pos, close, lots, spread), 1e-6) / C.START_CAPITAL)
    return out


def trading_days(index) -> int:
    """عدد أيام التداول (من الاثنين للجمعة) بالفترة."""
    d = index[index.dayofweek < 5].normalize().unique()
    return max(len(d), 1)


def test(genome: np.ndarray, series, n_monkeys: int = C.MONKEYS, seed: int = 0) -> dict:
    """يشغل العقل والقرود على نفس البيانات (series من dataset) ويرجع النتيجة."""
    rng = np.random.default_rng(seed)
    X, ret, cost_bps = series.X, series.ret, series.cost_bps
    close = series.px["close"]
    r = simulate(genome[None], X, series.px, cost_bps, death_level=1e-9, record=True)
    brain_ret = float(r["log_return"][0])
    trades = int(r["trades"][0])
    held = r["positions"][:, 0]
    pos = np.sign(held)
    lots = float(np.mean(np.abs(held[held != 0]))) if (held != 0).any() else C.MIN_LOT
    side_probs = np.array([(pos == -1).mean(), (pos == 0).mean(), (pos == 1).mean()]) + 1e-3
    side_probs /= side_probs.sum()
    change_prob = max(trades / len(ret), 1.0 / len(ret))
    m = monkeys(close, cost_bps, change_prob, n_monkeys, rng, side_probs, lots)
    pct = float((m < brain_ret).mean() * 100)
    # أبسط استراتيجية ممكنة: شراء (أو بيع) والاحتفاظ طول الفترة — نأخذ الأحسن منهم
    # مقارنة عادلة: الاحتفاظ بنفس متوسط تعرّض العقل للسوق (حجمه × وقته بالسوق)، مو بحجمه الكامل طول الوقت
    hold_lots = max(float(np.mean(np.abs(held))), 1e-9)
    hold_paths = _account_paths(np.stack([np.ones(len(close)), -np.ones(len(close))]), close, hold_lots, cost_bps)
    hold = float(np.log(max(hold_paths.max(), 1e-6) / C.START_CAPITAL))
    tpd = trades / trading_days(series.index)
    final_usd = C.START_CAPITAL * np.exp(brain_ret)
    return {
        "brain_return_pct": float(np.expm1(brain_ret) * 100),
        "final_balance": float(final_usd),
        "brain_max_dd_pct": float(r["max_dd"][0] * 100),
        "trades": trades,
        "exposure_pct": float(r["exposure"][0] * 100),
        "monkey_median_pct": float(np.expm1(np.median(m)) * 100),
        "monkey_best_pct": float(np.expm1(m.max()) * 100),
        "monkeys_blown_pct": float((m <= np.log(1e-6 / C.START_CAPITAL) + 1e-9).mean() * 100),
        "beats_monkeys_pct": pct,
        "hold_pct": float(np.expm1(hold) * 100),
        "market_pct": float((close[-1] / close[0] - 1) * 100),
        "beats_hold": brain_ret > hold,
        "trades_per_day": float(tpd),
        "passed": bool(pct >= C.MONKEY_PASS_PERCENTILE and trades >= 10 and brain_ret > hold
                       and tpd >= C.MIN_TRADES_PER_DAY and r["alive"][0]),
        "bars": int(len(ret)),
        "personality": personality(r["events"]),
    }


def report(name: str, res: dict) -> str:
    verdict = "✅ نجح — أفضل من القرود" if res["passed"] else "❌ فشل — ما يختلف عن الحظ"
    return (
        f"🐒 اختبار القرود — {name}\n"
        f"  العقل: {C.START_CAPITAL:.0f}$ ← {res.get('final_balance', 0):.2f}$ ({res['brain_return_pct']:+.1f}%)  (أقصى تراجع {res['brain_max_dd_pct']:.1f}%، "
        f"{res['trades']} صفقة = {res.get('trades_per_day', 0):.1f} باليوم، بالسوق {res['exposure_pct']:.0f}% من الوقت)\n"
        f"  القرود: الوسط {res['monkey_median_pct']:+.1f}% | أفضل قرد {res['monkey_best_pct']:+.1f}% | "
        f"انضرب حسابهم {res.get('monkeys_blown_pct', 0):.0f}%\n"
        f"  السوق نفسه بهالفترة: {res.get('market_pct', 0):+.2f}% "
        f"({'طلع' if res.get('market_pct', 0) > 0 else 'نزل'})\n"
        f"  أحسن احتفاظ (شراء أو بيع طول الفترة): {res['hold_pct']:+.2f}% → "
        f"{'العقل أفضل ✅' if res['beats_hold'] else 'العقل أسوأ ❌'}\n"
        f"  العقل تفوق على {res['beats_monkeys_pct']:.1f}% من القرود → {verdict}\n"
        + describe(res.get("personality", {}))
    )
