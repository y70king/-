"""
التداول التجريبي (فلوس وهمية) 💵 — يشتغل على GitHub Actions مع بوت الإشارات.

البطل (champion) يقرأ شموع الذهب الحية، ويقرر بنفسه: الاتجاه، الحجم، الوقف، الهدف،
ومتى يطلع. ذاكرته وصفقته المفتوحة تنحفظ بين كل تشغيل والثاني، وكل صفقة توصلك على
تيليجرام مع ملخص يومي. الحالة بملف evolution/paper_state_<الفريم>m.json

    python -m evolution.paper_trade
"""
import os
import json

import numpy as np
import pandas as pd
import yfinance as yf

from . import config as C
from . import brain, features, notify
from .train import CHAMPION

SYMBOLS = ("GC=F", "XAUUSD=X")
SIDE = {1: "شراء 🟢", -1: "بيع 🔴", 0: "بدون صفقة ⚪"}
REASON = {"tp": "🎯 ضرب الهدف", "sl": "🛑 ضرب الوقف", "brain": "🧠 العقل قرر يطلع",
          "dead": "☠️ خسارة كبيرة", "end": "إغلاق", "stopout": "⚠️ Stop Out (الهامش ما كفى)"}
WARMUP_BARS = 200   # شموع يمر عليها العقل قبل ما يبدأ، عشان تتكون ذاكرته


def fetch():
    for sym in SYMBOLS:
        try:
            df = yf.download(sym, period="10d" if C.BAR_MINUTES <= 5 else "90d",
                             interval=f"{C.BAR_MINUTES}m", progress=False, auto_adjust=False)
            if df is None or len(df) < features.WARMUP + WARMUP_BARS:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0] for c in df.columns]
            df = df.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
            df.index = pd.to_datetime(df.index, utc=True)
            return df
        except Exception as e:
            print(f"[WARN] فشل جلب {sym}: {e}")
    raise RuntimeError("تعذر جلب بيانات الذهب")


def load_state():
    if os.path.exists(C.PAPER_STATE):
        with open(C.PAPER_STATE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_state(st):
    with open(C.PAPER_STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=2)


def fmt_time(ts):
    return pd.Timestamp(ts).tz_convert("Asia/Baghdad").strftime("%m-%d %H:%M")


def step(eng, genome, X, px, i):
    pre = brain.precompute(genome[None], X[i: i + 1])[0]
    eng.process_bar(i, pre, px["open"][i], px["high"][i], px["low"][i], px["close"][i], px["atr"][i])


def main():
    # البطل "المثبّت" للتداول الحي: ما يتغير لحاله مع التدريب، عشان تجربة السوق الحي تبقى نظيفة
    live = os.path.join(C.MODELS_DIR, "live_champion.npz")
    path = live if os.path.exists(live) else CHAMPION
    if not os.path.exists(path):
        print("[INFO] ما فيه بطل مدرّب بعد — التداول التجريبي متوقف.")
        return
    genome, meta = brain.load(path)
    if genome.shape[0] != brain.GENOME_SIZE:
        print("[INFO] البطل المحفوظ من نسخة قديمة من العقل — التداول التجريبي متوقف.")
        return
    exam_file = os.path.join(C.MODELS_DIR, "live_exam.json" if path == live else "exam.json")
    exam = json.load(open(exam_file, encoding="utf-8")) if os.path.exists(exam_file) else {}
    if C.PAPER_REQUIRE_EXAM and not (exam.get("passed") and exam.get("generation") == meta["generation"]):
        print(f"[INFO] بطل الجيل {meta['generation']} ما نجح بالامتحان النهائي بعد — التداول التجريبي متوقف.")
        return
    cost = C.SPREAD_USD_EVAL   # السبريد بالدولار لكل أونصة

    df = fetch()
    X, _ret, idx, px = features.build(df, return_prices=True)
    now = pd.Timestamp.now(tz="UTC")
    closed = np.where(idx + pd.Timedelta(minutes=C.BAR_MINUTES) <= now)[0]
    if len(closed) < WARMUP_BARS:
        return

    st = load_state()
    eng = brain.Engine(genome[None], cost, death_level=1e-9, record=True)
    messages = []

    if st.get("champion_generation") != meta["generation"]:
        # عقل جديد يستلم الحساب: يمر على آخر الشموع عشان تتكون ذاكرته، وبعدين يبدأ بدون صفقة
        last = closed[-1]
        for i in range(last - WARMUP_BARS, last + 1):
            step(eng, genome, X, px, i)
        keep_h = eng.h.copy()
        eng = brain.Engine(genome[None], cost, death_level=1e-9, record=True)
        eng.h = keep_h
        equity = st.get("equity", C.START_CAPITAL)
        eng.cash[0] = eng.entry_cash[0] = equity      # البطل الجديد يكمل بنفس الرصيد
        if st:
            messages.append(f"🔄 بطل جديد (الجيل {meta['generation']}) استلم الحساب التجريبي.")
        st = {
            "champion_generation": meta["generation"],
            "started": st.get("started", str(now)),
            "start_price": st.get("start_price", float(px["close"][last])),
            "equity": equity,
            "engine": eng.state_dict(),
            "last_bar": str(idx[last]),
            "trades": st.get("trades", []),
            "last_summary": st.get("last_summary"),
        }
        todo = []
    else:
        eng.load_state(st["engine"])
        last_bar = pd.Timestamp(st["last_bar"])
        todo = [i for i in closed if idx[i] > last_bar]

    for i in todo:
        step(eng, genome, X, px, i)
        st["last_bar"] = str(idx[i])

    for e in eng.events:
        t = fmt_time(idx[e["t"]])
        if e["type"] == "open":
            messages.append(
                f"🧠 فتح {SIDE[e['dir']]} @ {e['entry']:.2f} ({t})\n"
                f"   اللوت: {e['lots']:.2f} (مخاطرة {e['risk_pct']:.0f}% من الرصيد)\n"
                f"   🛑 الوقف: {e['sl']:.2f} ({e['sl_atr']:.1f}×ATR)\n"
                f"   🎯 الهدف: {e['tp']:.2f} ({e['tp_atr']:.1f}×ATR)")
        else:
            messages.append(f"{'✅' if e['pnl_usd'] > 0 else '❌'} إغلاق {SIDE[e['dir']]} @ {e['exit']:.2f} ({t}) — "
                            f"{REASON.get(e['reason'], e['reason'])} → {e['pnl_usd']:+.2f}$ (الرصيد {e['balance']:.2f}$)")
            st["trades"].append({k: e[k] for k in ("dir", "lots", "entry", "exit", "reason", "pnl_usd", "pnl_pct", "bars")}
                                | {"exit_time": str(idx[e["t"]])})
    st["trades"] = st["trades"][-300:]
    st["engine"] = eng.state_dict()
    st["equity"] = float(eng.equity(px["close"][closed[-1]])[0])

    if messages:
        notify.send("💵 تداول تجريبي — ذهب\n\n" + "\n\n".join(messages) +
                    f"\n\nالرصيد الوهمي: ${st['equity']:.2f}")

    # ملخص يومي بعد الساعة 21:00 UTC
    today = now.strftime("%Y-%m-%d")
    if now.hour >= 21 and st.get("last_summary") != today:
        tr = st["trades"]
        wins = sum(t.get("pnl_usd", t["pnl_pct"]) > 0 for t in tr)
        gold_chg = (float(px["close"][closed[-1]]) / st["start_price"] - 1) * 100
        d = int(np.sign(eng.dir[0]))
        notify.send(
            f"📊 ملخص يومي — العقل التجريبي (بطل الجيل {st['champion_generation']})\n"
            f"الرصيد: ${st['equity']:.2f} ({(st['equity'] / C.START_CAPITAL - 1) * 100:+.2f}%)\n"
            f"الذهب من البداية: {gold_chg:+.2f}%\n"
            f"الصفقات: {len(tr)} (رابحة {wins})\n"
            f"المركز الحالي: {SIDE[d]}" + (f" — وقف {eng.sl[0]:.2f} / هدف {eng.tp[0]:.2f}" if d else "") + "\n"
            f"منذ: {st['started'][:10]}"
        )
        st["last_summary"] = today

    save_state(st)
    print(f"[INFO] الرصيد ${st['equity']:.2f} | المركز {int(eng.dir[0])} | شموع جديدة {len(todo)}")


if __name__ == "__main__":
    main()
