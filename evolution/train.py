"""
مصنع العقول 🧠 — التطور الجيني (Neuroevolution)

كل جيل:
  1. كل عقل يتداول بألف دولار وهمية على فترات عشوائية من أسواق مختلفة
     (مع إخفاء جزء من المعلومات + ضجيج عشان ما يحفظ)
  2. اللي يخسر "يموت"، وأفضل العقول تعيش وتتكاثر (تزاوج + طفرات)
  3. كل 25 جيل: أفضل العقول تنختبر على بيانات تحقق ما شافتها أبداً
     + اختبار القرود. العقل اللي ينجح ينحفظ كـ "بطل" (champion).

الاستخدام:
    python -m evolution.train --minutes 60        # يدرب ساعة ويوقف (ويكمل من وين وقف المرة الجاية)
    python -m evolution.train --generations 500
    python -m evolution.train --fresh             # يبدأ من الصفر
"""
import os
import csv
import json
import time
import argparse

import numpy as np

from . import config as C
from . import brain, monkey, notify
from .dataset import load_all

CHECKPOINT = os.path.join(C.MODELS_DIR, "checkpoint.npz")
CHAMPION = os.path.join(C.MODELS_DIR, "champion.npz")
HISTORY = os.path.join(C.MODELS_DIR, "history.csv")


# ------------------------------------------------------------------ التقييم

def window_score(res, ret):
    """درجة العقل بفترة وحدة، مقسومة على تذبذب الفترة عشان البيتكوين ما يطغى على اليورو."""
    scale = ret.std() * np.sqrt(len(ret)) + 1e-12
    dd_log = -np.log1p(-np.minimum(res["max_dd"], 0.999))
    score = (res["log_return"] - 0.5 * dd_log) / scale
    score = np.where(res["trades"] < 4, score - 0.5, score)       # الكسلان اللي ما يتداول ما يفوز
    score = np.where(res["alive"], score, score - 1.0)             # اللي مات يتعاقب
    return score


def evaluate(pop, train, weights, rng):
    total = np.zeros(len(pop))
    for _ in range(C.WINDOWS_PER_GEN):
        s = train[rng.choice(len(train), p=weights)]
        a = rng.integers(0, len(s.ret) - C.WINDOW_BARS)
        X = s.X[a: a + C.WINDOW_BARS].copy()
        ret = s.ret[a: a + C.WINDOW_BARS]
        px = {k: v[a: a + C.WINDOW_BARS] for k, v in s.px.items()}
        # إخفاء معلومات: نطفي بعض الحواس كاملة لهالفترة + ضجيج على الباقي
        mask = rng.random(X.shape[1]) >= C.FEATURE_DROPOUT
        X = X * mask + rng.normal(0, C.FEATURE_NOISE, X.shape).astype(np.float32)
        res = brain.simulate(pop, X, px, s.cost_bps)
        total += window_score(res, ret)
    return total / C.WINDOWS_PER_GEN


def validate(genomes, valid):
    res = brain.simulate(genomes, valid.X, valid.px, valid.cost_bps, death_level=1e-9)
    return window_score(res, valid.ret), res


# ------------------------------------------------------------------ التكاثر

def next_generation(pop, fitness, rng):
    P = len(pop)
    order = np.argsort(-fitness)
    n_elite = max(1, int(P * C.ELITE_FRACTION))
    n_surv = max(n_elite + 1, int(P * C.SURVIVE_FRACTION))
    survivors = pop[order[:n_surv]]
    surv_fit = fitness[order[:n_surv]]

    children = [pop[order[:n_elite]]]
    n_immigrants = max(1, P // 50)  # دم جديد: عقول عشوائية تمنع ركود الجينات
    children.append(brain.random_genomes(n_immigrants, rng))

    n_kids = P - n_elite - n_immigrants

    def tournament():
        idx = rng.integers(0, n_surv, (n_kids, C.TOURNAMENT))
        return idx[np.arange(n_kids), surv_fit[idx].argmax(axis=1)]

    ma, pa = survivors[tournament()], survivors[tournament()]
    cross = rng.random(ma.shape) < 0.5
    kids = np.where(cross, ma, pa)
    mut = rng.random(kids.shape) < C.MUTATION_RATE
    kids = kids + mut * rng.normal(0, C.MUTATION_SIGMA, kids.shape).astype(np.float32)
    children.append(kids.astype(np.float32))
    return np.concatenate(children)


# ------------------------------------------------------------------ الحفظ والاستكمال

def save_checkpoint(pop, gen, champ_score, rng, era=None):
    os.makedirs(C.MODELS_DIR, exist_ok=True)
    tmp = CHECKPOINT + ".tmp.npz"
    np.savez_compressed(tmp, pop=pop, gen=gen, champ_score=champ_score,
                        rng=np.array([json.dumps(rng.bit_generator.state)]),
                        era=np.array([json.dumps(era or {})]))
    os.replace(tmp, CHECKPOINT)


def load_checkpoint():
    d = np.load(CHECKPOINT)
    rng = np.random.default_rng()
    rng.bit_generator.state = json.loads(str(d["rng"][0]))
    era = json.loads(str(d["era"][0])) if "era" in d.files else {}
    return d["pop"], int(d["gen"]), float(d["champ_score"]), rng, era


def new_era():
    return {"n": 1, "best": -1e9, "ema": None, "since_best": 0, "started_gen": 0}


def log_history(row):
    new = not os.path.exists(HISTORY)
    with open(HISTORY, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["generation", "best_fitness", "mean_fitness", "valid_score",
                        "valid_return_pct", "beats_monkeys_pct", "passed", "champion"])
        w.writerow(row)


# ------------------------------------------------------------------ التشغيل

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=None, help="أقصى مدة تدريب بالدقائق")
    ap.add_argument("--generations", type=int, default=None, help="عدد الأجيال لهالتشغيل")
    ap.add_argument("--fresh", action="store_true", help="ابدأ من الصفر وتجاهل نقطة الاستكمال")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--notify", action="store_true", help="أرسل ملخص على تيليجرام بالنهاية")
    args = ap.parse_args()
    if args.minutes is None and args.generations is None:
        args.generations = 100

    print("📂 تحميل البيانات...")
    train, weights, valid, _test = load_all()

    os.makedirs(C.MODELS_DIR, exist_ok=True)
    if args.fresh and os.path.exists(HISTORY):
        os.remove(HISTORY)
    if os.path.exists(CHECKPOINT) and not args.fresh:
        pop, gen, champ_score, rng, era = load_checkpoint()
        if not os.path.exists(CHAMPION):
            champ_score = -np.inf   # البطل انحذف (مثلاً ما كان يطابق الشروط) → نبدأ من جديد بالمقارنة
        if not era or (pop.shape[1] != brain.GENOME_SIZE):
            era = new_era()
        print(f"♻️  استكمال من الجيل {gen} (أفضل بطل حتى الآن: {champ_score:.3f})")
    else:
        rng = np.random.default_rng(args.seed)
        pop = brain.random_genomes(C.POPULATION, rng)
        gen, champ_score = 0, -np.inf
        era = new_era()
        print(f"🌱 جيل جديد: {C.POPULATION} عقل، كل عقل فيه {brain.GENOME_SIZE} وزن")

    start = time.time()
    start_gen = gen
    new_champions = []
    last_valid = None

    while True:
        if args.generations is not None and gen - start_gen >= args.generations:
            break
        if args.minutes is not None and time.time() - start > args.minutes * 60:
            break

        fitness = evaluate(pop, train, weights, rng)
        fitness -= C.COMPLEXITY_PENALTY * np.mean(pop.astype(np.float64) ** 2, axis=1)
        gen += 1

        if gen % C.VALIDATE_EVERY == 0:
            top = pop[np.argsort(-fitness)[:10]]
            vscore, _ = validate(top, valid)
            best = int(np.argmax(vscore))
            mres = monkey.test(top[best], valid, seed=gen)
            others_ok = 0
            if mres["passed"] and vscore[best] > champ_score and mres["trades"] >= C.CHAMP_MIN_TRADES \
                    and mres["exposure_pct"] >= C.CHAMP_MIN_EXPOSURE_PCT:
                for o in (valid.others if C.OTHERS_PASS_FRACTION > 0 else []):
                    r = monkey.test(top[best], o, n_monkeys=300, seed=gen)
                    others_ok += r["beats_monkeys_pct"] >= C.OTHERS_PASS_PERCENTILE and r["brain_return_pct"] > 0
            need = int(np.ceil(len(valid.others) * C.OTHERS_PASS_FRACTION))
            mres["other_markets_passed"] = f"{others_ok}/{len(valid.others)}"
            active = mres["trades"] >= C.CHAMP_MIN_TRADES and mres["exposure_pct"] >= C.CHAMP_MIN_EXPOSURE_PCT
            is_champ = bool(mres["passed"] and active and vscore[best] > champ_score and others_ok >= need)
            if is_champ:
                champ_score = float(vscore[best])
                meta = {"generation": gen, "valid_score": champ_score, "valid": mres,
                        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")}
                os.makedirs(C.MODELS_DIR, exist_ok=True)
                brain.save(CHAMPION, top[best], meta)
                new_champions.append((gen, mres))
            last_valid = mres
            log_history([gen, f"{fitness.max():.4f}", f"{fitness.mean():.4f}", f"{vscore[best]:.4f}",
                         f"{mres['brain_return_pct']:.3f}", f"{mres['beats_monkeys_pct']:.1f}",
                         int(mres["passed"]), int(is_champ)])
            print(f"🧪 جيل {gen:5d} | تحقق: {mres['brain_return_pct']:+6.2f}% | "
                  f"تفوق على {mres['beats_monkeys_pct']:5.1f}% من القرود | "
                  f"{mres['trades']} صفقة" +
                  (f" | أسواق ثانية {mres['other_markets_passed']}" if mres["passed"] and C.OTHERS_PASS_FRACTION > 0 else "") +
                  ("  🏆 بطل جديد!" if is_champ else ""))
            # هل العصر الحالي للحين يتحسن على بيانات ما شافها؟
            v = float(vscore[best])
            era["ema"] = v if era["ema"] is None else 0.8 * era["ema"] + 0.2 * v
            if era["ema"] > era["best"]:
                era["best"], era["since_best"] = era["ema"], 0
            else:
                era["since_best"] += 1
            if era["since_best"] >= C.ERA_PATIENCE:
                print(f"🔁 العصر {era['n']} وقف يتحسن (بدأ يحفظ) — عصر جديد بعقول جديدة")
                pop = brain.random_genomes(C.POPULATION, rng)
                era = {"n": era["n"] + 1, "best": -1e9, "ema": None, "since_best": 0, "started_gen": gen}
                save_checkpoint(pop, gen, champ_score, rng, era)
                continue
            save_checkpoint(pop, gen, champ_score, rng, era)
        elif gen % 5 == 0:
            print(f"   جيل {gen:5d} | أفضل {fitness.max():+.3f} | متوسط {fitness.mean():+.3f} | "
                  f"{(time.time() - start) / max(gen - start_gen, 1):.1f} ثانية/جيل")

        pop = next_generation(pop, fitness, rng)

    save_checkpoint(pop, gen, champ_score, rng, era)
    elapsed = (time.time() - start) / 60
    summary = [f"🧠 انتهى التدريب: الأجيال {start_gen} → {gen} ({elapsed:.0f} دقيقة، وصل العصر {era['n']})"]
    if new_champions:
        g, m = new_champions[-1]
        summary.append(f"🏆 بطل جديد من الجيل {g}")
        summary.append(monkey.report("بيانات التحقق", m))
    else:
        summary.append("ما طلع بطل جديد بهالتشغيل" + (f" (آخر نتيجة تحقق {last_valid['brain_return_pct']:+.2f}%، "
                       f"تفوق على {last_valid['beats_monkeys_pct']:.0f}% من القرود)" if last_valid else ""))
    text = "\n".join(summary)
    print("\n" + text)
    if args.notify:
        notify.send(text)


if __name__ == "__main__":
    main()
