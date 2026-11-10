"""
مصنع الاستراتيجيات 📈 — تطوير مؤشرات ترندنك فيو (بدل العقول العشوائية).

كل جيل: كل استراتيجية تتداول فترات عشوائية من 10 سنين ذهب (+ نسخة مقلوبة) بحساب سنت 20$.
أفضلها تعيش وتتزاوج (تبادل مؤشرات/فلاتر/خروج) وتتطفر (تغيير إعدادات).
البطل لازم ينجح بنفس شروط العقول: ثبات بـ 3 من 4 أجزاء التحقق، يتفوق على 75% من القرود
وعلى الاحتفاظ، 4 صفقات باليوم على الأقل — وبعدين الامتحان النهائي على سنة ما شافها.

    python -m evolution.tv_train --minutes 60
    python -m evolution.tv_train --exam          # الامتحان النهائي للبطل + كود Pine Script
"""
import os
import csv
import json
import time
import argparse

import numpy as np

from . import config as C
from . import tv_indicators as ta, tv_strategy as S, monkey, notify
from .tv_backtest import backtest
from .dataset import load_all

DIR = os.path.join(C.ROOT, "models", f"tv_{C.BAR_MINUTES}m")
CHECKPOINT = os.path.join(DIR, "checkpoint.json")
CHAMPION = os.path.join(DIR, "champion.json")
PINE = os.path.join(DIR, "champion.pine")
HISTORY = os.path.join(DIR, "history.csv")
EXAM = os.path.join(DIR, "exam.json")

POP = 150
ELITE = 8
WINDOWS = 8
VALIDATE_EVERY = 10


def prep(s):
    """نضيف ATR ترندنك فيو + الساعة لكل سلسلة، وكاش للإشارات."""
    s.px["atr_tv"] = ta.atr(s.px["high"], s.px["low"], s.px["close"], 14)
    s.hours = s.index.hour.values
    s.cache = {}
    return s


def sig_for(g, s):
    if len(s.cache) > 4000:
        s.cache.clear()
    return S.signals(g, s.px["open"], s.px["high"], s.px["low"], s.px["close"], s.hours, s.cache)


def window_fitness(res, idx):
    dd_log = -np.log1p(-min(res["max_dd"], 0.999))
    score = res["log_return"] - 0.5 * dd_log
    rate = res["trades"] / monkey.trading_days(idx)
    score -= 4.0 * max(0.0, (C.MIN_TRADES_PER_DAY - rate) / C.MIN_TRADES_PER_DAY)
    if not res["alive"]:
        score -= 1.0
    return score


def evaluate(pop, train, weights, rng):
    fit = np.zeros(len(pop))
    for _ in range(WINDOWS):
        s = train[rng.choice(len(train), p=weights)]
        a = int(rng.integers(300, len(s.ret) - C.WINDOW_BARS))
        b = a + C.WINDOW_BARS
        px = {k: v[a:b] for k, v in s.px.items()}
        spread = rng.uniform(*C.SPREAD_USD_TRAIN)
        for i, g in enumerate(pop):
            sig = sig_for(g, s)[a:b]
            fit[i] += window_fitness(backtest(g, px, sig, spread), s.index[a:b])
    return fit / WINDOWS


def test(g, s, n_monkeys=C.MONKEYS, seed=0):
    """مثل monkey.test بس للاستراتيجية: القرود بنفس معدل التداول والميول واللوت."""
    rng = np.random.default_rng(seed)
    sig = sig_for(g, s)
    r = backtest(g, s.px, sig, C.SPREAD_USD_EVAL, death=1e-9, record=True)
    close = s.px["close"]
    held = r["positions"]
    pos = np.sign(held)
    lots = float(np.mean(np.abs(held[held != 0]))) if (held != 0).any() else C.MIN_LOT
    sp = np.array([(pos == -1).mean(), (pos == 0).mean(), (pos == 1).mean()]) + 1e-3
    sp /= sp.sum()
    m = monkey.monkeys(close, C.SPREAD_USD_EVAL, max(r["trades"] / len(close), 1 / len(close)), n_monkeys, rng, sp, lots)
    pct = float((m < r["log_return"]).mean() * 100)
    hold_lots = max(float(np.mean(np.abs(held))), 1e-9)
    hp = monkey._account_paths(np.stack([np.ones(len(close)), -np.ones(len(close))]), close, hold_lots, C.SPREAD_USD_EVAL)
    hold = float(np.log(max(hp.max(), 1e-6) / C.START_CAPITAL))
    tpd = r["trades"] / monkey.trading_days(s.index)
    ev = r["events"]
    wins = float((ev[:, 4] > 0).mean() * 100) if len(ev) else 0.0
    return {
        "final_balance": r["final"], "return_pct": (r["final"] / C.START_CAPITAL - 1) * 100,
        "max_dd_pct": r["max_dd"] * 100, "trades": r["trades"], "trades_per_day": tpd,
        "exposure_pct": r["exposure"] * 100, "win_rate": wins,
        "beats_monkeys_pct": pct, "monkey_median_pct": float(np.expm1(np.median(m)) * 100),
        "hold_pct": float(np.expm1(hold) * 100), "market_pct": float((close[-1] / close[0] - 1) * 100),
        "passed": bool(pct >= C.MONKEY_PASS_PERCENTILE and r["trades"] >= 10 and r["log_return"] > hold
                       and tpd >= C.MIN_TRADES_PER_DAY and r["alive"]),
    }


def report(name, t):
    return (f"{name}: 20$ ← {t['final_balance']:.2f}$ ({t['return_pct']:+.1f}%) | {t['trades_per_day']:.1f} صفقة/يوم | "
            f"رابحة {t['win_rate']:.0f}% | أقصى تراجع {t['max_dd_pct']:.0f}% | تفوق على {t['beats_monkeys_pct']:.0f}% من القرود | "
            f"السوق {t['market_pct']:+.1f}% → {'✅ نجح' if t['passed'] else '❌ ما نجح'}")


def segments_ok(g, valid, k=4):
    n = len(valid.ret)
    rets = []
    sig = sig_for(g, valid)
    for i in range(k):
        a, b = i * n // k, (i + 1) * n // k
        px = {kk: v[a:b] for kk, v in valid.px.items()}
        rets.append(backtest(g, px, sig[a:b], C.SPREAD_USD_EVAL, death=1e-9)["log_return"])
    return int(sum(r > 0 for r in rets)), float(np.median(rets))


def next_gen(pop, fit, rng):
    order = np.argsort(-fit)
    elite = [pop[i] for i in order[:ELITE]]
    pool = [pop[i] for i in order[: max(ELITE * 2, len(pop) * 2 // 5)]]
    pf = fit[order[: len(pool)]]
    kids = list(elite)
    kids += [S.random_genome(rng) for _ in range(max(2, len(pop) // 30))]   # دم جديد
    while len(kids) < len(pop):
        def pick():
            idx = rng.integers(0, len(pool), 3)
            return pool[idx[np.argmax(pf[idx])]]
        child = S.crossover(pick(), pick(), rng) if rng.random() < 0.5 else pick()
        kids.append(S.mutate(child, rng))
    return kids


def load_data():
    train, weights, valid, test_s = load_all(verbose=False)
    for s in train + [valid, test_s]:
        prep(s)
    return train, weights, valid, test_s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=None)
    ap.add_argument("--generations", type=int, default=None)
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--exam", action="store_true", help="الامتحان النهائي للبطل فقط")
    ap.add_argument("--notify", action="store_true")
    args = ap.parse_args()
    os.makedirs(DIR, exist_ok=True)
    train, weights, valid, test_s = load_data()

    if args.exam:
        return exam(valid, test_s, args.notify)

    if os.path.exists(CHECKPOINT) and not args.fresh:
        ck = json.load(open(CHECKPOINT, encoding="utf-8"))
        pop, gen, champ = ck["pop"], ck["gen"], ck["champ_score"]
        rng = np.random.default_rng(); rng.bit_generator.state = ck["rng"]
        print(f"♻️  استكمال من الجيل {gen}")
    else:
        rng = np.random.default_rng(args.seed)
        pop = [S.random_genome(rng) for _ in range(POP)]
        gen, champ = 0, -1e9
        if os.path.exists(HISTORY):
            os.remove(HISTORY)
        print(f"🌱 {POP} استراتيجية عشوائية من {len(S.ENTRIES)} مؤشر دخول و{len(S.FILTERS)} فلاتر")
    if not os.path.exists(CHAMPION):
        champ = -1e9

    t0, g0 = time.time(), gen
    while True:
        if args.generations is not None and gen - g0 >= args.generations:
            break
        if args.minutes is not None and time.time() - t0 > args.minutes * 60:
            break
        fit = evaluate(pop, train, weights, rng)
        gen += 1
        if gen % VALIDATE_EVERY == 0:
            order = np.argsort(-fit)[:10]
            best = None
            for i in order:
                t = test(pop[i], valid, n_monkeys=300, seed=gen)
                if not t["passed"] or t["trades"] < C.CHAMP_MIN_TRADES or t["exposure_pct"] < C.CHAMP_MIN_EXPOSURE_PCT:
                    continue
                ok, med = segments_ok(pop[i], valid)
                if ok >= C.CONSISTENCY_MIN_OK and med > champ and (best is None or med > best[1]):
                    best = (i, med, t, ok)
            top = test(pop[order[0]], valid, n_monkeys=300, seed=gen)
            new = best is not None
            if new:
                i, champ, t, ok = best
                json.dump({"generation": gen, "genome": pop[i], "valid": t, "segments_ok": ok},
                          open(CHAMPION, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
                open(PINE, "w", encoding="utf-8").write(S.pine(pop[i], f"Gold Evolved #{gen}"))
            new_file = not os.path.exists(HISTORY)
            with open(HISTORY, "a", newline="") as f:
                w = csv.writer(f)
                if new_file:
                    w.writerow(["generation", "best_fitness", "mean_fitness", "top_valid_balance", "top_beats_monkeys", "top_tpd", "champion"])
                w.writerow([gen, f"{fit.max():.3f}", f"{fit.mean():.3f}", f"{top['final_balance']:.2f}",
                            f"{top['beats_monkeys_pct']:.0f}", f"{top['trades_per_day']:.1f}", int(new)])
            print(f"🧪 جيل {gen:4d} | أفضل بالتحقق: 20$ ← {top['final_balance']:.2f}$ | {top['trades_per_day']:.1f}/يوم | "
                  f"قرود {top['beats_monkeys_pct']:.0f}%" + (f"  🏆 بطل جديد (20$ ← {best[2]['final_balance']:.2f}$)" if new else ""))
            json.dump({"pop": pop, "gen": gen, "champ_score": champ, "rng": rng.bit_generator.state},
                      open(CHECKPOINT, "w", encoding="utf-8"))
        pop = next_gen(pop, fit, rng)

    json.dump({"pop": pop, "gen": gen, "champ_score": champ, "rng": rng.bit_generator.state},
              open(CHECKPOINT, "w", encoding="utf-8"))
    print(f"\n📈 انتهى: الأجيال {g0} → {gen} ({(time.time() - t0) / 60:.0f} دقيقة)")


def exam(valid, test_s, notify_=False):
    if not os.path.exists(CHAMPION):
        print("ما فيه بطل بعد.")
        return
    ch = json.load(open(CHAMPION, encoding="utf-8"))
    g = ch["genome"]
    tv, tt = test(g, valid), test(g, test_s, seed=123)
    json.dump({"generation": ch["generation"], "passed": tt["passed"], "test": tt, "valid": tv, "genome": g},
              open(EXAM, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    text = (f"📈 الامتحان النهائي — استراتيجية الجيل {ch['generation']}\n{S.describe(g)}\n\n"
            + report("التحقق", tv) + "\n" + report("سنة ما شافها", tt))
    print(text)
    if notify_:
        notify.send(text)


if __name__ == "__main__":
    main()
