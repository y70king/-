# -*- coding: utf-8 -*-
"""
رادار الذهب — برنامج الحاسبة
يقرأ شموع الذهب مباشرة من MT5 (4 ساعات، ساعة، 15 دقيقة، 5 دقائق)، يشغّل محرك الفجوات ومحرك نقطة التحكم،
ويرسل التحليل لتطبيق الهاتف كل 30 ثانية (وفوراً عند سكرة كل شمعة 5 دقائق).
والإشارات الجديدة ونتائجها توصل كإشعار للهاتف عن طريق تطبيق ntfy حتى لو الهاتف مقفول.

التشغيل:  python radar_pc.py            (من MT5)
          python radar_pc.py --demo     (تجربة بدون MT5: سعر الذهب من الإنترنت)
"""
import argparse
import json
import os
import random
import string
import sys
import time

import requests

import radar_engines as R

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(HERE, "radar_settings.json")
LOG_FILE = os.path.join(HERE, "radar_log.json")

ANALYZE_EVERY = 30          # ثانية
LOG_KEEP = 100
NAMES = {"fvg": "الفجوات", "poc": "نقطة التحكم"}
GRADES = {3: "ذهبية", 2: "جيدة", 1: "خطرة"}
LIMITS = {"m5": 600, "m15": 300, "h1": 300, "h4": 300}


# ───────── الإعدادات ─────────
def load_settings():
    s = {}
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                s = json.load(f)
        except Exception:
            s = {}
    changed = False
    if not s.get("code"):
        # رمز الربط: يكتبه المستخدم بالتطبيق. عشوائي وطويل حتى ما يخمّنه أحد
        s["code"] = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(10))
        changed = True
    defaults = {
        "symbol": "",                       # فارغ = يلقى رمز الذهب عند الوسيط تلقائياً
        "broker_host": "broker.hivemq.com",  # وسيط MQTT مجاني لنقل التحليل للتطبيق
        "broker_port": 1883,
        "ntfy": True,                       # إشعارات الهاتف عن طريق تطبيق ntfy
        "ntfy_min_grade": 1,                # أقل درجة يوصل إشعارها: 3 ذهبية · 2 جيدة · 1 الكل
        "fixedSl": 0, "fixedTp": 0,
    }
    for k, v in defaults.items():
        if k not in s:
            s[k] = v
            changed = True
    if changed:
        save_json(SETTINGS_FILE, s)
    return s


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def load_log():
    try:
        with open(LOG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"log": [], "seen": []}


# ───────── مصادر البيانات ─────────
class MT5Source:
    """شموع حقيقية من منصة MT5 المفتوحة على الحاسبة"""

    def __init__(self, symbol=""):
        import MetaTrader5 as mt5
        self.mt5 = mt5
        if not mt5.initialize():
            raise SystemExit("ما كدرت أتصل بـ MT5. افتح منصة MetaTrader 5 وسجّل دخول، وبعدين شغّل البرنامج مرة ثانية.\n"
                             "التفاصيل: %s" % (mt5.last_error(),))
        self.symbol = symbol or self._find_gold()
        if not mt5.symbol_select(self.symbol, True):
            raise SystemExit("الرمز %s مو موجود عند الوسيط. اكتب الرمز الصحيح بملف radar_settings.json" % self.symbol)
        self.tf = {"m5": mt5.TIMEFRAME_M5, "m15": mt5.TIMEFRAME_M15, "h1": mt5.TIMEFRAME_H1, "h4": mt5.TIMEFRAME_H4}
        self.name = "MT5 · %s" % self.symbol

    def _find_gold(self):
        mt5 = self.mt5
        for name in ("XAUUSD", "XAUUSDm", "XAUUSD.", "XAUUSDc", "XAUUSD.a", "GOLD", "XAUUSD+"):
            if mt5.symbol_info(name) is not None:
                return name
        found = [s.name for s in (mt5.symbols_get("*XAU*") or [])] + [s.name for s in (mt5.symbols_get("*GOLD*") or [])]
        if found:
            return sorted(found, key=len)[0]
        raise SystemExit("ما لكيت رمز الذهب عند الوسيط. اكتبه بملف radar_settings.json بخانة symbol")

    def frames(self):
        out = {}
        for key, tf in self.tf.items():
            rates = self.mt5.copy_rates_from_pos(self.symbol, tf, 0, LIMITS[key])
            if rates is None or len(rates) == 0:
                raise RuntimeError("MT5 ما رجّع شموع %s (%s)" % (key, self.mt5.last_error()))
            out[key] = [{"time": int(r["time"]) * 1000, "open": float(r["open"]), "high": float(r["high"]),
                         "low": float(r["low"]), "close": float(r["close"]), "volume": float(r["tick_volume"])}
                        for r in rates]
        return out

    def market_open(self):
        # السوق مفتوح إذا السعر تحرّك خلال آخر 5 دقائق (ساعة الوسيط تختلف عن الساعة الحقيقية فما نعتمد عليها)
        tick = self.mt5.symbol_info_tick(self.symbol)
        if not tick:
            return False
        stamp = (tick.time_msc, tick.bid, tick.ask)
        if stamp != getattr(self, "_last_stamp", None):
            self._last_stamp, self._moved_at = stamp, time.time()
        return time.time() - self._moved_at < 300

    def last_bar_time(self):
        r = self.mt5.copy_rates_from_pos(self.symbol, self.tf["m5"], 0, 1)
        return int(r[0]["time"]) if r is not None and len(r) else 0


class DemoSource:
    """تجربة بدون MT5: شموع رمز ذهب (PAXG) من Binance"""
    API = "https://data-api.binance.vision/api/v3/klines"

    def __init__(self):
        self.symbol = "PAXGUSDT"
        self.name = "تجربة · سعر من الإنترنت"
        self.iv = {"m5": "5m", "m15": "15m", "h1": "1h", "h4": "4h"}

    def _get(self, iv, n):
        r = requests.get(self.API, params={"symbol": self.symbol, "interval": iv, "limit": n}, timeout=20)
        r.raise_for_status()
        return [{"time": k[0], "open": float(k[1]), "high": float(k[2]), "low": float(k[3]),
                 "close": float(k[4]), "volume": float(k[5])} for k in r.json()]

    def frames(self):
        return {k: self._get(iv, LIMITS[k]) for k, iv in self.iv.items()}

    def market_open(self):
        t = time.gmtime()
        return not (t.tm_wday == 5 or (t.tm_wday == 4 and t.tm_hour >= 21) or (t.tm_wday == 6 and t.tm_hour < 22))

    def last_bar_time(self):
        return self._get("5m", 1)[0]["time"] // 1000


# ───────── الإرسال للهاتف ─────────
class Publisher:
    def __init__(self, s):
        import paho.mqtt.client as mqtt
        self.topic = "goldradar/%s/state" % s["code"]
        self.ntfy_topic = "goldradar-%s" % s["code"]
        self.s = s
        self.ok = False
        self.c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="radar-pc-" + s["code"])
        self.c.on_connect = lambda c, u, f, rc, p=None: setattr(self, "ok", not rc.is_failure)
        self.c.on_disconnect = lambda c, u, f, rc, p=None: setattr(self, "ok", False)
        self.c.reconnect_delay_set(1, 30)
        self.c.connect_async(s["broker_host"], int(s["broker_port"]), keepalive=60)
        self.c.loop_start()

    def state(self, payload):
        # retain: التطبيق يستلم آخر تحليل أول ما يفتح، حتى لو فتح بين تحديثين
        self.c.publish(self.topic, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), qos=1, retain=True)

    def notify(self, title, body, tags, priority=4):
        if not self.s.get("ntfy"):
            return
        try:
            requests.post("https://ntfy.sh/", timeout=15, json={
                "topic": self.ntfy_topic, "title": title, "message": body,
                "tags": tags, "priority": priority})
        except Exception as e:
            print("  ! ما وصل الإشعار:", e)


# ───────── الحلقة الرئيسية ─────────
def compact(sig):
    if not sig.get("has"):
        return {"has": False, "reason": sig.get("reason", "")}
    keep = ("has", "engine", "dir", "entry", "sl", "tp1", "tp2", "risk", "grade",
            "zoneTop", "zoneBottom", "legHi", "legLo", "id")
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in sig.items() if k in keep}


def run(source, pub, s):
    store = load_log()
    log, seen = store["log"], set(store["seen"])
    frozen = store.get("frozen", {})      # كل إشارة تنقفل أول ما تطلع: مستوياتها ما تتغير إلا بفجوة أو موجة جديدة

    def freeze(sig):
        if not sig["has"]:
            return sig
        if sig["id"] not in frozen:
            frozen[sig["id"]] = {k: sig[k] for k in ("entry", "sl", "tp1", "tp2", "risk", "zoneTop", "zoneBottom", "legHi", "legLo") if k in sig}
            for old in list(frozen)[:-200]:
                del frozen[old]
        return dict(sig, **frozen[sig["id"]])
    cfg = {"fixedSl": float(s.get("fixedSl") or 0), "fixedTp": float(s.get("fixedTp") or 0)}
    last_analyze, last_bar = 0, 0
    print("\n  المصدر:", source.name)
    print("  رمز الربط للتطبيق:  %s\n" % s["code"])
    print("  اكتب هذا الرمز بالتطبيق (الإعدادات ← مصدر الإشارات ← الحاسبة)")
    print("  وللإشعارات والهاتف مقفول: نزّل تطبيق ntfy واشترك بالموضوع:  %s\n" % pub.ntfy_topic)

    while True:
        try:
            bar = source.last_bar_time()
            new_bar = last_bar and bar != last_bar          # انسكرت شمعة 5 دقائق وبدت جديدة
            last_bar = bar or last_bar
            if not (new_bar or time.time() - last_analyze >= ANALYZE_EVERY):
                time.sleep(1)
                continue
            last_analyze = time.time()
            fr = source.frames()
            m5 = fr["m5"]
            r = R.analyze(m5, fr, cfg)
            r["fvg"], r["poc"] = freeze(r["fvg"]), freeze(r["poc"])
            is_open = source.market_open()

            # إشارات جديدة
            for key in ("fvg", "poc"):
                sig = r[key]
                if not sig["has"] or sig["id"] in seen:
                    continue
                seen.add(sig["id"])
                if not is_open:
                    continue
                rec = {"id": sig["id"], "engine": key, "dir": sig["dir"], "entry": sig["entry"], "sl": sig["sl"],
                       "tp1": sig["tp1"], "tp2": sig["tp2"], "risk": sig["risk"], "grade": sig["grade"],
                       "time": m5[-2]["time"], "firedAt": int(time.time() * 1000), "state": "pending"}
                log.insert(0, rec)
                print("  ★ إشارة %s · %s · %s عند %.2f" % (GRADES[sig["grade"]], NAMES[key],
                                                        "شراء" if sig["dir"] == 1 else "بيع", sig["entry"]))
                if sig["grade"] >= int(s.get("ntfy_min_grade", 1)):
                    pub.notify("%s · %s: %s عند %.2f" % (GRADES[sig["grade"]], NAMES[key],
                                                          "شراء ▲" if sig["dir"] == 1 else "بيع ▼", sig["entry"]),
                               "وقف %.2f · هدف %.2f · خسارة محتملة %.2f$ بلوت 0.01" % (sig["sl"], sig["tp2"], sig["risk"]),
                               ["moneybag"] if sig["grade"] == 3 else (["green_circle"] if sig["grade"] == 2 else ["warning"]),
                               5 if sig["grade"] == 3 else 4)

            # متابعة النتائج
            new_log = []
            for rec in log:
                if rec.get("state") in ("win", "loss", "expired"):
                    new_log.append(rec)
                    continue
                t = R.track(rec, m5)
                if t["state"] != rec.get("state") and t["state"] in ("win", "loss"):
                    pub.notify("%s: %s" % (NAMES[t["engine"]], "ضربت الهدف ✅" if t["state"] == "win" else "ضربت الوقف ❌"),
                               "%+.2f$ على لوت 0.01" % t["result"], ["chart_with_upwards_trend" if t["state"] == "win" else "x"], 3)
                new_log.append(t)
            log = new_log[:LOG_KEEP]
            save_json(LOG_FILE, {"log": log, "seen": list(seen)[-300:], "frozen": frozen})

            payload = {"v": 1, "t": int(time.time() * 1000), "src": source.name, "sym": source.symbol,
                       "price": round(m5[-1]["close"], 2), "open": is_open, "trends": r["trends"],
                       "grade": r["grade"], "fvg": compact(r["fvg"]), "poc": compact(r["poc"]),
                       "log": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in e.items()
                                if k in ("id", "engine", "dir", "entry", "sl", "tp2", "risk", "grade", "firedAt", "state", "result")}
                               for e in log[:25]]}
            pub.state(payload)
            arrow = {1: "صاعد", -1: "هابط", 0: "محايد"}
            print("  [%s] %.2f | 4س %s · ساعة %s · 15د %s | الدرجة %s | الإرسال للتطبيق %s" % (
                time.strftime("%H:%M:%S"), m5[-1]["close"], arrow[r["trends"]["h4"]], arrow[r["trends"]["h1"]],
                arrow[r["trends"]["m15"]], GRADES.get(r["grade"], "ماكو اتجاه"), "✓" if pub.ok else "✗ (ينتظر الاتصال)"))
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print("  ! خطأ مؤقت، يعيد المحاولة:", e)
            time.sleep(5)


def main():
    ap = argparse.ArgumentParser(description="رادار الذهب — برنامج الحاسبة")
    ap.add_argument("--demo", action="store_true", help="تجربة بدون MT5")
    ap.add_argument("--broker", help="وسيط MQTT بديل (للاختبار)")
    ap.add_argument("--no-ntfy", action="store_true", help="بدون إشعارات ntfy")
    a = ap.parse_args()
    s = load_settings()
    if a.broker:
        s["broker_host"] = a.broker
    if a.no_ntfy:
        s["ntfy"] = False
    source = DemoSource() if a.demo else MT5Source(s.get("symbol", ""))
    pub = Publisher(s)
    try:
        run(source, pub, s)
    except KeyboardInterrupt:
        print("\n  توقف البرنامج.")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
