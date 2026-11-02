"""تطبيق "مُخطِّط المعلم": رفع كتاب PDF، توزيعه على خطة يومية/أسبوعية/شهرية/سنوية، وشرح كل درس.

التشغيل:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=...   # اختياري: لتفعيل الشرح الذكي
    python app.py
ثم افتح http://localhost:5000
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import date

from flask import Flask, jsonify, render_template, request
from pypdf import PdfReader

import ai
from planner import build_schedule, local_summary

BASE = os.path.dirname(os.path.abspath(__file__))
UPLOADS = os.path.join(BASE, "uploads")
os.makedirs(UPLOADS, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200MB
app.json.ensure_ascii = False

BOOK_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def book_path(book_id: str) -> str:
    if not BOOK_ID_RE.match(book_id or ""):
        raise ValueError("معرّف الكتاب غير صالح")
    path = os.path.join(UPLOADS, f"{book_id}.pdf")
    if not os.path.exists(path):
        raise FileNotFoundError("الكتاب غير موجود، ارفعه من جديد")
    return path


@app.errorhandler(ValueError)
@app.errorhandler(FileNotFoundError)
def bad_request(err):
    return jsonify(error=str(err)), 400


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/status")
def status():
    return jsonify(ai_enabled=ai.ai_enabled(), model=ai.MODEL if ai.ai_enabled() else None)


@app.post("/api/upload")
def upload():
    f = request.files.get("book")
    if not f or not f.filename.lower().endswith(".pdf"):
        raise ValueError("ارفع ملف كتاب بصيغة PDF")
    book_id = uuid.uuid4().hex
    path = os.path.join(UPLOADS, f"{book_id}.pdf")
    f.save(path)
    try:
        reader = PdfReader(path)
        pages = len(reader.pages)
        sample = "".join((reader.pages[i].extract_text() or "") for i in range(min(pages, 5)))
    except Exception:
        os.remove(path)
        raise ValueError("تعذّر قراءة ملف PDF، تأكد أنه غير تالف أو محمي بكلمة مرور")
    return jsonify(book_id=book_id, filename=f.filename, pages=pages, has_text=len(sample.strip()) > 50)


@app.post("/api/plan")
def plan():
    p = request.get_json(force=True)
    path = book_path(p.get("book_id"))
    total = len(PdfReader(path).pages)
    start_page = max(1, int(p.get("start_page") or 1))
    end_page = min(total, int(p.get("end_page") or total))
    holidays = set()
    for line in re.split(r"[\s,،]+", p.get("holidays") or ""):
        if line:
            holidays.add(date.fromisoformat(line))
    lessons = build_schedule(
        start_page=start_page,
        end_page=end_page,
        pages_per_day=int(p.get("pages_per_day") or 1),
        start_date=date.fromisoformat(p.get("start_date") or date.today().isoformat()),
        study_days=[int(d) for d in p.get("study_days") or [0, 1, 2, 3, 4]],
        holidays=holidays,
    )
    return jsonify(lessons=lessons, total_pages=total)


@app.post("/api/summarize")
def summarize():
    p = request.get_json(force=True)
    path = book_path(p.get("book_id"))
    start, end = int(p["start_page"]), int(p["end_page"])
    if end - start + 1 > 100:
        raise ValueError("الحد الأقصى 100 صفحة للدرس الواحد")
    if ai.ai_enabled() and p.get("use_ai", True):
        try:
            return jsonify(ai.summarize_with_claude(path, start, end, p.get("subject", ""), p.get("grade", "")))
        except Exception as e:  # نرجع للتلخيص المحلي مع توضيح السبب
            result = local_summary(ai.extract_text(path, start, end))
            result["warning"] = f"تعذّر الشرح الذكي ({e.__class__.__name__}: {e}) — تم استخدام التلخيص المحلي."
            return jsonify(result)
    return jsonify(local_summary(ai.extract_text(path, start, end)))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
