"""
اختبار القرود 🐒

نخلي العقل يتداول فترة ما شافها، وبنفس الفترة نطلق 1000 "قرد": متداولين
عشوائيين يغيرون مركزهم (شراء/بيع/بدون) بشكل عشوائي وبنفس معدل تداول العقل
تقريباً، ويدفعون نفس التكاليف.

إذا العقل ما تفوق على 95% من القرود ← ربحه حظ، مو ذكاء.
"""
import numpy as np

from . import config as C
from .brain import simulate


def monkeys(ret: np.ndarray, cost_bps: float, change_prob: float, n: int, rng: np.random.Generator,
            side_probs=(1 / 3, 1 / 3, 1 / 3)):
    """
    يرجع العائد اللوغاريتمي النهائي لكل قرد.
    side_probs = احتمال (بيع، بدون، شراء) — نعطي القرود نفس ميول العقل، عشان عقل
    "يشتري دايماً" بسوق صاعد ما يطلع ذكي بس لأن السوق طلع.
    """
    T = len(ret)
    cost = cost_bps / 1e4
    simple = np.expm1(ret)
    out = np.empty(n)
    chunk = 100  # نقسم القرود دفعات عشان الذاكرة
    for s in range(0, n, chunk):
        m = min(chunk, n - s)
        change = rng.random((m, T)) < change_prob
        change[:, 0] = True
        choice = (rng.choice(3, (m, T), p=side_probs) - 1).astype(np.float32)
        # نعبي المركز للأمام: كل قرد يكمل على آخر قرار لين يغيّر
        idx = np.where(change, np.arange(T)[None, :], 0)
        np.maximum.accumulate(idx, axis=1, out=idx)
        pos = np.take_along_axis(choice, idx, axis=1)
        dpos = np.abs(np.diff(pos, axis=1, prepend=0.0))
        out[s: s + m] = (np.log1p(pos * simple) - dpos * cost).sum(axis=1)
    return out


def test(genome: np.ndarray, X: np.ndarray, ret: np.ndarray, cost_bps: float,
         n_monkeys: int = C.MONKEYS, seed: int = 0) -> dict:
    """يشغل العقل والقرود على نفس البيانات ويرجع النتيجة."""
    rng = np.random.default_rng(seed)
    r = simulate(genome[None], X, ret, cost_bps, death_level=1e-9, record=True)
    brain_ret = float(r["log_return"][0])
    trades = int(r["trades"][0])
    pos = r["positions"][:, 0]
    side_probs = np.array([(pos == -1).mean(), (pos == 0).mean(), (pos == 1).mean()]) + 1e-3
    side_probs /= side_probs.sum()
    change_prob = max(trades / len(ret), 1.0 / len(ret))
    m = monkeys(ret, cost_bps, change_prob, n_monkeys, rng, side_probs)
    pct = float((m < brain_ret).mean() * 100)
    # أبسط استراتيجية ممكنة: شراء (أو بيع) والاحتفاظ طول الفترة
    hold = float(np.abs(np.sum(np.log1p(np.expm1(ret)))) - 2 * cost_bps / 1e4)
    return {
        "brain_return_pct": float(np.expm1(brain_ret) * 100),
        "brain_max_dd_pct": float(r["max_dd"][0] * 100),
        "trades": trades,
        "exposure_pct": float(r["exposure"][0] * 100),
        "monkey_median_pct": float(np.expm1(np.median(m)) * 100),
        "monkey_best_pct": float(np.expm1(m.max()) * 100),
        "beats_monkeys_pct": pct,
        "hold_pct": float(np.expm1(hold) * 100),
        "beats_hold": brain_ret > hold,
        "passed": bool(pct >= C.MONKEY_PASS_PERCENTILE and trades >= 10 and brain_ret > hold),
        "bars": int(len(ret)),
    }


def report(name: str, res: dict) -> str:
    verdict = "✅ نجح — أفضل من القرود" if res["passed"] else "❌ فشل — ما يختلف عن الحظ"
    return (
        f"🐒 اختبار القرود — {name}\n"
        f"  العقل: {res['brain_return_pct']:+.2f}%  (أقصى تراجع {res['brain_max_dd_pct']:.1f}%، "
        f"{res['trades']} صفقة، بالسوق {res['exposure_pct']:.0f}% من الوقت)\n"
        f"  القرود: الوسط {res['monkey_median_pct']:+.2f}%  | أفضل قرد {res['monkey_best_pct']:+.2f}%\n"
        f"  شراء/بيع واحتفاظ طول الفترة: {res['hold_pct']:+.2f}% → "
        f"{'العقل أفضل ✅' if res['beats_hold'] else 'العقل أسوأ ❌'}\n"
        f"  العقل تفوق على {res['beats_monkeys_pct']:.1f}% من القرود → {verdict}"
    )
