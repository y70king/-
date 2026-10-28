#!/usr/bin/env python3
"""توليد صور من وصف نصي عبر أكثر من خدمة.

الخدمات:
    pollinations  (الافتراضي) مجاني بدون مفتاح، صورة كل ~45 ثانية تقريباً
    huggingface   مجاني بمفتاح HF_TOKEN (رصيد شهري محدود)، موديل FLUX.1-schnell
    openai        مدفوع بمفتاح OPENAI_API_KEY، نفس محرك صور ChatGPT

الاستخدام:
    python generate_image.py "golden bull logo, black background" -o images/bull.png
    python generate_image.py "..." --provider huggingface --size 1536x1024
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

SIZES = ["1024x1024", "1536x1024", "1024x1536"]


def http(url, body=None, headers=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def pollinations(prompt, width, height, seed):
    params = {"width": width, "height": height, "nologo": "true", "model": "flux"}
    if seed is not None:
        params["seed"] = seed
    url = ("https://image.pollinations.ai/prompt/"
           + urllib.parse.quote(prompt) + "?" + urllib.parse.urlencode(params))
    headers = {}
    if os.environ.get("POLLINATIONS_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['POLLINATIONS_TOKEN']}"
    # الخدمة المجانية محدودة بصورة كل ~45 ثانية، فنعيد المحاولة عند 402/429/503
    for attempt in range(4):
        try:
            return http(url, headers=headers)
        except urllib.error.HTTPError as e:
            if e.code not in (402, 429, 503) or attempt == 3:
                raise
            print(f"الخدمة مشغولة ({e.code})، إعادة المحاولة بعد 50 ثانية...", file=sys.stderr)
            time.sleep(50)


def huggingface(prompt, width, height, seed):
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN غير موجود. سوي توكن مجاني من huggingface.co/settings/tokens")
    params = {"width": width, "height": height}
    if seed is not None:
        params["seed"] = seed
    return http(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        body={"inputs": prompt, "parameters": params},
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )


def openai(prompt, width, height, seed):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("OPENAI_API_KEY غير موجود.")
    raw = http(
        "https://api.openai.com/v1/images/generations",
        body={
            "model": os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1"),
            "prompt": prompt,
            "size": f"{width}x{height}",
            "quality": "high",
        },
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    return base64.b64decode(json.loads(raw)["data"][0]["b64_json"])


PROVIDERS = {"pollinations": pollinations, "huggingface": huggingface, "openai": openai}


def main():
    parser = argparse.ArgumentParser(description="توليد صور من وصف نصي")
    parser.add_argument("prompt", help="وصف الصورة (يفضّل بالإنكليزي)")
    parser.add_argument("-o", "--output", help="مسار حفظ الصورة")
    parser.add_argument("--size", choices=SIZES, default="1024x1024")
    parser.add_argument("--provider", choices=PROVIDERS,
                        default=os.environ.get("IMAGE_PROVIDER", "pollinations"))
    parser.add_argument("--seed", type=int, help="رقم ثابت لإعادة نفس النتيجة")
    args = parser.parse_args()

    width, height = map(int, args.size.split("x"))
    try:
        image = PROVIDERS[args.provider](args.prompt, width, height, args.seed)
    except urllib.error.HTTPError as e:
        sys.exit(f"خطأ من {args.provider} ({e.code}): {e.read().decode(errors='replace')[:500]}")
    except urllib.error.URLError as e:
        sys.exit(f"فشل الاتصال بـ {args.provider}: {e.reason}")

    path = args.output or os.path.join(
        "generated-images", f"image-{datetime.now():%Y%m%d-%H%M%S}.png")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(image)
    print(os.path.abspath(path))


if __name__ == "__main__":
    main()
