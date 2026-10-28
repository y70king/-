#!/usr/bin/env python3
"""توليد صور عبر OpenAI Images API (نفس محرك صور ChatGPT).

الاستخدام:
    python generate_image.py "وصف الصورة" -o images/cat.png
    python generate_image.py "logo for a gold trading bot" --size 1024x1024 --quality high

يحتاج متغير البيئة OPENAI_API_KEY.
اختياري: OPENAI_IMAGE_MODEL لتغيير الموديل (الافتراضي gpt-image-1).
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime

API_URL = "https://api.openai.com/v1/images/generations"
SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"]
QUALITIES = ["low", "medium", "high", "auto"]


def generate(prompt, size, quality, n, model, api_key):
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "n": n,
    }).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"خطأ من OpenAI ({e.code}): {e.read().decode(errors='replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"فشل الاتصال بـ OpenAI: {e.reason}")
    return [base64.b64decode(item["b64_json"]) for item in data["data"]]


def output_paths(output, n):
    if not output:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output = os.path.join("generated-images", f"image-{stamp}.png")
    if n == 1:
        return [output]
    root, ext = os.path.splitext(output)
    return [f"{root}-{i + 1}{ext or '.png'}" for i in range(n)]


def main():
    parser = argparse.ArgumentParser(description="توليد صور عبر OpenAI")
    parser.add_argument("prompt", help="وصف الصورة")
    parser.add_argument("-o", "--output", help="مسار حفظ الصورة (PNG)")
    parser.add_argument("--size", choices=SIZES, default="1024x1024")
    parser.add_argument("--quality", choices=QUALITIES, default="high")
    parser.add_argument("-n", type=int, default=1, help="عدد الصور (1-4)")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("OPENAI_API_KEY غير موجود. أضفه كمتغير بيئة أولاً.")
    if not 1 <= args.n <= 4:
        sys.exit("عدد الصور لازم يكون بين 1 و 4")

    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
    images = generate(args.prompt, args.size, args.quality, args.n, model, api_key)

    for path, img in zip(output_paths(args.output, args.n), images):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            f.write(img)
        print(os.path.abspath(path))


if __name__ == "__main__":
    main()
