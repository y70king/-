"""
بوت إشارات الذهب (XAUUSD) - ICT / SMC Multi-Timeframe
========================================================
- فريم الساعة (1H)  : تحديد الهيكل العام (Bias) عبر BOS / CHoCH
- فريم 15 دقيقة (15m): تأكيد الهيكل + تحديد مناطق الدخول (FVG / Order Block)
- فريم 5 دقائق (5m)  : زناد الدخول (Entry Trigger) داخل المنطقة المحددة

ملاحظة: يفنانس (yfinance) لا يعطي بيانات فريم 1 دقيقة موثوقة لأكثر من
بضعة أيام، لذلك استُخدم فريم 5 دقائق كفريم تنفيذ بدل 1 دقيقة. إذا تحب
فريم 1 دقيقة فعلاً، غيّر ENTRY_INTERVAL بالأسفل إلى "1m" (البيانات
راح تكون محدودة بآخر 7 أيام فقط وقد تنقطع أحياناً).

يعمل بالكامل من GitHub Actions (بدون VPS أو لابتوب) ويرسل الإشارات
على تيليجرام.
"""

import os
import sys
import json
import hashlib
import datetime as dt

import numpy as np
import pandas as pd
import requests
import yfinance as yf


# ============================== الإعدادات ==============================

class Config:
    # رمز الذهب في يفنانس
    SYMBOL = "GC=F"          # عقود الذهب الآجلة (بديل موثوق لـ XAUUSD=X)
    FALLBACK_SYMBOL = "XAUUSD=X"

    STRUCT_INTERVAL = "1h"   # فريم تحديد الهيكل
    STRUCT_PERIOD = "30d"

    CONFIRM_INTERVAL = "15m" # فريم التأكيد وتحديد المنطقة
    CONFIRM_PERIOD = "10d"

    ENTRY_INTERVAL = "5m"    # فريم الدخول (زناد الدخول)
    ENTRY_PERIOD = "3d"

    SWING_LEFT = 2            # عدد الشموع يسار/يمين لتحديد القمة/القاع (fractal)
    SWING_RIGHT = 2

    ATR_PERIOD = 14
    SL_ATR_BUFFER = 0.35      # هامش إضافي فوق/تحت المنطقة لوقف الخسارة (× ATR)

    RR_TARGETS = [1.5, 2.5, 4.0]   # نسب المخاطرة/العائد لـ TP1, TP2, TP3

    # عدم التشدد: أقل عدد شموع لازم يمر بعد الـ CHoCH عشان نعتبر المنطقة صالحة
    MAX_ZONE_AGE_BARS = 40     # أقصى عمر للمنطقة (15m) قبل إهمالها
    FVG_MIN_SIZE_ATR = 0.15    # أصغر حجم فجوة سعرية (FVG) مقبول (× ATR على 15m)

    STATE_FILE = os.path.join(os.path.dirname(__file__), "state.json")

    TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "")
    TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


# ============================== أدوات عامة ==============================

def fetch_data(interval: str, period: str) -> pd.DataFrame:
    """يجلب بيانات الشموع مع خطة بديلة إذا فشل الرمز الأساسي."""
    for symbol in (Config.SYMBOL, Config.FALLBACK_SYMBOL):
        try:
            df = yf.download(
                symbol, period=period, interval=interval,
                progress=False, auto_adjust=False,
            )
            if df is not None and len(df) > 30:
                df = df.rename(columns=str.lower)
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = [c[0].lower() for c in df.columns]
                df.index = pd.to_datetime(df.index, utc=True)
                return df[["open", "high", "low", "close", "volume"]].dropna()
        except Exception as e:
            print(f"[WARN] فشل جلب {symbol} ({interval}): {e}")
    raise RuntimeError(f"تعذر جلب بيانات فريم {interval} من أي مصدر")


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def find_swings(df: pd.DataFrame, left: int, right: int):
    """يحدد القمم والقيعان (swing highs/lows) بطريقة الـ fractal."""
    highs, lows = df["high"].values, df["low"].values
    n = len(df)
    swing_high = np.full(n, False)
    swing_low = np.full(n, False)
    for i in range(left, n - right):
        window_h = highs[i - left: i + right + 1]
        window_l = lows[i - left: i + right + 1]
        if highs[i] == window_h.max() and (window_h == highs[i]).sum() == 1:
            swing_high[i] = True
        if lows[i] == window_l.min() and (window_l == lows[i]).sum() == 1:
            swing_low[i] = True
    return swing_high, swing_low


# ============================== الهيكل (1H) ==============================

def detect_bias(df: pd.DataFrame) -> dict:
    """
    يحدد الاتجاه العام عبر آخر BOS/CHoCH على فريم الساعة.
    Bullish  : كسر آخر قمة مؤكدة صعوداً
    Bearish  : كسر آخر قاع مؤكد هبوطاً
    """
    sh, sl = find_swings(df, Config.SWING_LEFT, Config.SWING_RIGHT)
    highs_idx = np.where(sh)[0]
    lows_idx = np.where(sl)[0]

    if len(highs_idx) < 2 or len(lows_idx) < 2:
        return {"bias": None, "reason": "swings غير كافية"}

    close = df["close"].values
    last_swing_high = df["high"].values[highs_idx[-1]]
    last_swing_low = df["low"].values[lows_idx[-1]]

    bias, event_idx, event_type = None, None, None

    # امسح من النهاية للخلف نبحث عن أول كسر واضح
    for i in range(len(df) - 1, max(highs_idx[-1], lows_idx[-1]), -1):
        if close[i] > last_swing_high:
            bias, event_idx, event_type = "bullish", i, "BOS/CHoCH صاعد"
            break
        if close[i] < last_swing_low:
            bias, event_idx, event_type = "bearish", i, "BOS/CHoCH هابط"
            break

    if bias is None:
        return {"bias": None, "reason": "لا يوجد كسر هيكلي حديث"}

    return {
        "bias": bias,
        "event_type": event_type,
        "event_time": df.index[event_idx],
        "broken_level": last_swing_high if bias == "bullish" else last_swing_low,
    }


# ============================== التأكيد + المنطقة (15m) ==============================

def find_fvg_zones(df: pd.DataFrame, bias: str, min_size: float):
    """
    يبحث عن Fair Value Gap (فجوة سعرية) بثلاث شموع متتالية تتوافق مع الاتجاه.
    Bullish FVG: low الشمعة الثالثة > high الشمعة الأولى
    Bearish FVG: high الشمعة الثالثة < low الشمعة الأولى
    """
    zones = []
    h, l = df["high"].values, df["low"].values
    for i in range(2, len(df)):
        if bias == "bullish":
            gap = l[i] - h[i - 2]
            if gap > min_size:
                zones.append({
                    "index": i, "top": l[i], "bottom": h[i - 2],
                    "time": df.index[i], "type": "FVG صاعد",
                })
        else:
            gap = l[i - 2] - h[i]
            if gap > min_size:
                zones.append({
                    "index": i, "top": l[i - 2], "bottom": h[i],
                    "time": df.index[i], "type": "FVG هابط",
                })
    return zones


def find_order_block(df: pd.DataFrame, bias: str, before_index: int):
    """آخر شمعة معاكسة قبل اندفاعة قوية (Order Block) قبل موقع معين."""
    lookback_start = max(0, before_index - 15)
    o, c = df["open"].values, df["close"].values
    h, l = df["high"].values, df["low"].values
    for i in range(before_index - 1, lookback_start, -1):
        bearish_candle = c[i] < o[i]
        bullish_candle = c[i] > o[i]
        if bias == "bullish" and bearish_candle:
            return {"top": h[i], "bottom": l[i], "time": df.index[i], "type": "Order Block صاعد"}
        if bias == "bearish" and bullish_candle:
            return {"top": h[i], "bottom": l[i], "time": df.index[i], "type": "Order Block هابط"}
    return None


def confirm_and_get_zone(df15: pd.DataFrame, bias: str, atr15: pd.Series) -> dict:
    """يتأكد من انسجام فريم 15 دقيقة مع الهيكل، ويرجع أفضل منطقة دخول حديثة."""
    result15 = detect_bias(df15)
    confirmed = result15["bias"] == bias

    last_atr = atr15.iloc[-1] if not atr15.empty else 0
    min_gap = Config.FVG_MIN_SIZE_ATR * (last_atr if last_atr and not np.isnan(last_atr) else 1.0)

    fvg_zones = find_fvg_zones(df15, bias, min_gap)
    # نخلي بس أحدث المناطق ضمن حد العمر المسموح
    recent_zones = [z for z in fvg_zones if (len(df15) - 1 - z["index"]) <= Config.MAX_ZONE_AGE_BARS]

    zone = recent_zones[-1] if recent_zones else None
    ob = None
    if zone:
        ob = find_order_block(df15, bias, zone["index"])

    return {
        "confirmed_15m": confirmed,
        "confirm_bias": result15.get("bias"),
        "zone": zone,
        "order_block": ob,
        "atr15": last_atr,
    }


# ============================== زناد الدخول (5m) ==============================

def entry_trigger(df_entry: pd.DataFrame, zone: dict, bias: str):
    """
    يبحث في فريم الدخول عن رجوع السعر لمنطقة الـ FVG وشمعة تأكيد
    (ابتلاعية أو شمعة رفض بفتيل واضح).
    """
    if zone is None:
        return None

    top, bottom = zone["top"], zone["bottom"]
    o, c = df_entry["open"].values, df_entry["close"].values
    h, l = df_entry["high"].values, df_entry["low"].values

    for i in range(len(df_entry) - 1, max(0, len(df_entry) - 30), -1):
        touched = l[i] <= top and h[i] >= bottom
        if not touched:
            continue

        bullish_confirm = c[i] > o[i] and c[i] >= bottom
        bearish_confirm = c[i] < o[i] and c[i] <= top

        wick_reject_up = (c[i] - l[i]) > 1.5 * abs(c[i] - o[i]) and c[i] > o[i]
        wick_reject_down = (h[i] - c[i]) > 1.5 * abs(c[i] - o[i]) and c[i] < o[i]

        if bias == "bullish" and (bullish_confirm or wick_reject_up):
            return {"index": i, "time": df_entry.index[i], "entry_price": c[i]}
        if bias == "bearish" and (bearish_confirm or wick_reject_down):
            return {"index": i, "time": df_entry.index[i], "entry_price": c[i]}

    return None


# ============================== بناء الإشارة ==============================

def build_signal():
    df1h = fetch_data(Config.STRUCT_INTERVAL, Config.STRUCT_PERIOD)
    df15 = fetch_data(Config.CONFIRM_INTERVAL, Config.CONFIRM_PERIOD)
    df_entry = fetch_data(Config.ENTRY_INTERVAL, Config.ENTRY_PERIOD)

    struct = detect_bias(df1h)
    if struct["bias"] is None:
        return {"status": "no_bias", "detail": struct}

    bias = struct["bias"]
    atr15 = atr(df15, Config.ATR_PERIOD)
    confirm = confirm_and_get_zone(df15, bias, atr15)

    if not confirm["confirmed_15m"] or confirm["zone"] is None:
        return {"status": "no_zone", "bias": bias, "detail": confirm}

    trigger = entry_trigger(df_entry, confirm["zone"], bias)
    if trigger is None:
        return {"status": "no_trigger", "bias": bias, "detail": confirm}

    zone = confirm["zone"]
    ob = confirm["order_block"]
    last_atr = confirm["atr15"] or (df15["high"].iloc[-1] - df15["low"].iloc[-1])

    entry_price = trigger["entry_price"]
    sl_buffer = Config.SL_ATR_BUFFER * last_atr

    if bias == "bullish":
        stop_loss = zone["bottom"] - sl_buffer
        if ob:
            stop_loss = min(stop_loss, ob["bottom"] - sl_buffer)
        risk = entry_price - stop_loss
        take_profits = [entry_price + risk * rr for rr in Config.RR_TARGETS]
    else:
        stop_loss = zone["top"] + sl_buffer
        if ob:
            stop_loss = max(stop_loss, ob["top"] + sl_buffer)
        risk = stop_loss - entry_price
        take_profits = [entry_price - risk * rr for rr in Config.RR_TARGETS]

    if risk <= 0:
        return {"status": "invalid_risk", "bias": bias}

    signal_id = hashlib.sha1(
        f"{bias}-{zone['time']}-{trigger['time']}".encode()
    ).hexdigest()[:12]

    return {
        "status": "signal",
        "signal_id": signal_id,
        "bias": bias,
        "structure_event": struct["event_type"],
        "structure_time": struct["event_time"],
        "zone_type": zone["type"],
        "zone_time": zone["time"],
        "order_block": ob,
        "entry_time": trigger["time"],
        "entry_price": round(entry_price, 2),
        "stop_loss": round(stop_loss, 2),
        "take_profits": [round(tp, 2) for tp in take_profits],
        "risk_points": round(risk, 2),
    }


# ============================== تيليجرام ==============================

def send_telegram(message: str):
    if not Config.TELEGRAM_TOKEN or not Config.TELEGRAM_CHAT_ID:
        print("[ERROR] لم يتم ضبط TELEGRAM_TOKEN أو TELEGRAM_CHAT_ID كمتغيرات بيئة.")
        return False
    url = f"https://api.telegram.org/bot{Config.TELEGRAM_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": Config.TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
    }, timeout=20)
    if resp.status_code != 200:
        print(f"[ERROR] فشل إرسال تيليجرام: {resp.status_code} {resp.text}")
        return False
    return True


def format_message(sig: dict) -> str:
    direction_ar = "شراء (BUY) 🟢" if sig["bias"] == "bullish" else "بيع (SELL) 🔴"
    tps = "\n".join(
        f"  🎯 TP{idx+1}: <b>{tp}</b>" for idx, tp in enumerate(sig["take_profits"])
    )
    entry_time_local = sig["entry_time"].tz_convert("Asia/Baghdad").strftime("%Y-%m-%d %H:%M")
    struct_time_local = sig["structure_time"].tz_convert("Asia/Baghdad").strftime("%Y-%m-%d %H:%M")

    return (
        f"📊 <b>إشارة ذهب XAUUSD</b>\n"
        f"الاتجاه: {direction_ar}\n\n"
        f"🕐 هيكل الساعة: {sig['structure_event']} ({struct_time_local})\n"
        f"📐 منطقة الدخول (15m): {sig['zone_type']}\n"
        f"⏱️ توقيت الدخول (5m): {entry_time_local}\n\n"
        f"➡️ الدخول: <b>{sig['entry_price']}</b>\n"
        f"🛑 وقف الخسارة: <b>{sig['stop_loss']}</b>\n"
        f"{tps}\n\n"
        f"📏 المخاطرة: {sig['risk_points']} نقطة\n"
        f"🆔 {sig['signal_id']}"
    )


# ============================== الحالة (Dedup) ==============================

def load_state() -> dict:
    if os.path.exists(Config.STATE_FILE):
        try:
            with open(Config.STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_state(state: dict):
    with open(Config.STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, default=str)


# ============================== التشغيل الرئيسي ==============================

def main():
    print(f"[{dt.datetime.utcnow()}] بدء فحص إشارة الذهب...")
    try:
        sig = build_signal()
    except Exception as e:
        print(f"[ERROR] فشل توليد الإشارة: {e}")
        sys.exit(0)  # لا نفشل الـ workflow، فقط نسجل الخطأ

    state = load_state()
    last_id = state.get("last_signal_id")

    if sig["status"] != "signal":
        print(f"[INFO] لا توجد إشارة جاهزة الآن. الحالة: {sig['status']}")
        return

    print(f"[INFO] آخر إشارة موجودة: {sig['signal_id']} | {sig['bias']} | دخول {sig['entry_price']}")

    if sig["signal_id"] == last_id:
        print("[INFO] نفس الإشارة السابقة، لا داعي لإرسالها مرة ثانية.")
        return

    message = format_message(sig)
    sent = send_telegram(message)
    if sent:
        print("[INFO] تم إرسال الإشارة على تيليجرام.")
        state["last_signal_id"] = sig["signal_id"]
        state["last_signal_time"] = str(sig["entry_time"])
        save_state(state)
    else:
        print("[WARN] لم يتم إرسال الإشارة (تحقق من التوكن/الـ Chat ID).")


if __name__ == "__main__":
    main()
