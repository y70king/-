"""
التداول التجريبي (فلوس وهمية) 💵 — يشتغل على GitHub Actions كل 5 دقائق.

البطل (champion) يقرأ آخر شموع الذهب 5 دقائق ويقرر: شراء / بيع / بدون صفقة.
الرصيد الوهمي يبدأ بألف دولار، وكل صفقة تنرسل على تيليجرام مع ملخص يومي.
الحالة تنحفظ بملف evolution/paper_state.json.

    python -m evolution.paper_trade
"""
import os
import json
import datetime as dt

import numpy as np
import pandas as pd
import yfinance as yf

from . import config as C
from . import brain, features, notify
from .train import CHAMPION

SYMBOLS = ("GC=F", "XAUUSD=X")
SIDE = {1: "شراء 🟢", -1: "بيع 🔴", 0: "بدون صفقة ⚪"}


def fetch():
    for sym in SYMBOLS:
        try:
            df = yf.download(sym, period="10d" if C.BAR_MINUTES <= 5 else "90d",
                             interval=f"{C.BAR_MINUTES}m",
                             progress=False, auto_adjust=False)
            if df is None or len(df) < features.WARMUP + 50:
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


def main():
    if not os.path.exists(CHAMPION):
        print("[INFO] ما فيه بطل مدرّب بعد (evolution/models/champion.npz) — التداول التجريبي متوقف.")
        return
    genome, meta = brain.load(CHAMPION)
    exam_file = os.path.join(C.MODELS_DIR, "exam.json")
    exam = json.load(open(exam_file, encoding="utf-8")) if os.path.exists(exam_file) else {}
    if C.PAPER_REQUIRE_EXAM and not (exam.get("passed") and exam.get("generation") == meta["generation"]):
        print(f"[INFO] بطل الجيل {meta['generation']} ما نجح بالامتحان النهائي بعد — التداول التجريبي متوقف.")
        return
    cost = C.MARKETS[C.TARGET_MARKET]["cost_bps"] / 1e4

    df = fetch()
    X, _ret, idx = features.build(df)
    close = df["close"].reindex(idx).values
    now = pd.Timestamp.now(tz="UTC")
    closed = np.where(idx + pd.Timedelta(minutes=C.BAR_MINUTES) <= now)[0]
    if len(closed) == 0:
        return

    st = load_state()
    if st.get("champion_generation") != meta["generation"]:
        if st:
            notify.send(f"🔄 بطل جديد (الجيل {meta['generation']}) استلم الحساب التجريبي.")
        # البطل الجديد يكمل بنفس الرصيد، بس يبدأ بدون مركز مفتوح
        st = {
            "champion_generation": meta["generation"],
            "started": st.get("started", str(now)),
            "start_price": st.get("start_price", float(close[closed[-1]])),
            "equity": st.get("equity", C.START_CAPITAL),
            "position": 0, "entry_price": None, "entry_time": None, "entry_equity": None,
            "last_bar": str(idx[closed[-2]]) if len(closed) > 1 else None,
            "last_close": float(close[closed[-2]]) if len(closed) > 1 else None,
            "trades": st.get("trades", []),
            "last_summary": st.get("last_summary"),
        }

    last_bar = pd.Timestamp(st["last_bar"]) if st.get("last_bar") else None
    todo = [i for i in closed if last_bar is None or idx[i] > last_bar]
    messages = []

    for i in todo:
        price = float(close[i])
        pos = st["position"]
        if st.get("last_close"):
            st["equity"] *= 1 + pos * (price / st["last_close"] - 1)

        new = int(brain.decide(genome[None], X[i], np.array([pos], dtype=np.float32))[0])
        if new != pos:
            st["equity"] *= 1 - abs(new - pos) * cost
            if pos != 0:
                pnl = (st["equity"] / st["entry_equity"] - 1) * 100
                st["trades"].append({
                    "side": pos, "entry_time": st["entry_time"], "exit_time": str(idx[i]),
                    "entry": st["entry_price"], "exit": price, "pnl_pct": round(pnl, 3),
                })
                st["trades"] = st["trades"][-200:]
                messages.append(f"{'✅' if pnl > 0 else '❌'} إغلاق {SIDE[pos]} @ {price:.2f} "
                                f"({fmt_time(idx[i])}) → {pnl:+.2f}%")
            if new != 0:
                st.update(entry_price=price, entry_time=str(idx[i]), entry_equity=st["equity"])
                messages.append(f"🧠 فتح {SIDE[new]} @ {price:.2f} ({fmt_time(idx[i])})")
            else:
                st.update(entry_price=None, entry_time=None, entry_equity=None)
        st["position"] = new
        st["last_bar"], st["last_close"] = str(idx[i]), price

    if messages:
        notify.send("💵 تداول تجريبي — ذهب\n" + "\n".join(messages) +
                    f"\n\nالرصيد الوهمي: ${st['equity']:.2f}")

    # ملخص يومي بعد الساعة 21:00 UTC
    today = now.strftime("%Y-%m-%d")
    if now.hour >= 21 and st.get("last_summary") != today:
        tr = st["trades"]
        wins = sum(t["pnl_pct"] > 0 for t in tr)
        gold_chg = (float(close[closed[-1]]) / st["start_price"] - 1) * 100
        notify.send(
            f"📊 ملخص يومي — العقل التجريبي (بطل الجيل {st['champion_generation']})\n"
            f"الرصيد: ${st['equity']:.2f} ({(st['equity'] / C.START_CAPITAL - 1) * 100:+.2f}%)\n"
            f"الذهب من البداية: {gold_chg:+.2f}%\n"
            f"الصفقات: {len(tr)} (رابحة {wins})\n"
            f"المركز الحالي: {SIDE[st['position']]}\n"
            f"منذ: {st['started'][:10]}"
        )
        st["last_summary"] = today

    save_state(st)
    print(f"[INFO] الرصيد ${st['equity']:.2f} | المركز {st['position']} | شموع جديدة {len(todo)}")


if __name__ == "__main__":
    main()
