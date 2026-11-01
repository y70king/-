"""إرسال رسائل تيليجرام (نفس الأسرار المستخدمة في بوت الإشارات)."""
import os

import requests


def send(text: str) -> bool:
    token = os.environ.get("TELEGRAM_TOKEN", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat:
        print("[INFO] تيليجرام غير مضبوط، الرسالة:\n" + text)
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          json={"chat_id": chat, "text": text}, timeout=20)
        if r.status_code != 200:
            print(f"[WARN] فشل تيليجرام: {r.status_code} {r.text}")
        return r.status_code == 200
    except requests.RequestException as e:
        print(f"[WARN] فشل تيليجرام: {e}")
        return False
