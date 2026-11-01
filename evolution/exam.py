"""
الامتحان النهائي 🎓

يختبر البطل على آخر فترة من بيانات الذهب — فترة ما شافها العقل أبداً، لا
بالتدريب ولا وقت اختيار البطل. هذا أصدق اختبار عندنا قبل التداول الحي.

    python -m evolution.exam
    python -m evolution.exam --notify
"""
import os
import json
import argparse

from . import brain, monkey, notify
from .dataset import load_all
from .train import CHAMPION
from . import config as C

EXAM_FILE = os.path.join(C.MODELS_DIR, "exam.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--notify", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(CHAMPION):
        msg = "ما فيه بطل محفوظ بعد. درّب أكثر (ما نجح أي عقل باختبار القرود حتى الآن)."
        print(msg)
        if args.notify:
            notify.send(msg)
        return

    genome, meta = brain.load(CHAMPION)
    _train, _w, valid, test = load_all(verbose=False)
    lines = [f"🎓 الامتحان النهائي — بطل الجيل {meta['generation']}"]
    lines.append(monkey.report(f"تحقق ({valid.index[0]:%Y-%m-%d} → {valid.index[-1]:%Y-%m-%d})",
                               monkey.test(genome, valid.X, valid.ret, valid.cost_bps)))
    res = monkey.test(genome, test.X, test.ret, test.cost_bps, seed=123)
    lines.append(monkey.report(f"اختبار لم يُرَ ({test.index[0]:%Y-%m-%d} → {test.index[-1]:%Y-%m-%d})", res))
    lines.append("الخلاصة: " + ("العقل جاهز للتداول التجريبي (فلوس وهمية) 👍" if res["passed"]
                                else "العقل ما نجح بالامتحان النهائي — لا تعتمد عليه، كمّل تدريب."))
    with open(EXAM_FILE, "w", encoding="utf-8") as f:
        json.dump({"generation": meta["generation"], "passed": bool(res["passed"]), "test": res},
                  f, ensure_ascii=False, indent=2)
    text = "\n\n".join(lines)
    print(text)
    if args.notify:
        notify.send(text)


if __name__ == "__main__":
    main()
