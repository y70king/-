"""شرح وتلخيص صفحات الكتاب باستخدام Claude (يقرأ ملف PDF مباشرة، بما فيه الصفحات المصورة)."""

from __future__ import annotations

import base64
import io
import json
import os

from pypdf import PdfReader, PdfWriter

from pdftext import extract_text  # noqa: F401  (يُستخدم من app.py)

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")

LESSON_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "explanation": {"type": "string"},
        "objectives": {"type": "array", "items": {"type": "string"}},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "activities": {"type": "array", "items": {"type": "string"}},
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "explanation", "objectives", "key_points", "keywords", "activities", "questions"],
    "additionalProperties": False,
}

SYSTEM = (
    "أنت مساعد تربوي خبير يساعد المعلمين في إعداد خطط الدروس. "
    "ستُعطى صفحات من كتاب مدرسي بصيغة PDF تمثل درس يوم واحد. "
    "اقرأ الصفحات بعناية واكتب باللغة العربية الفصحى المبسطة المناسبة لمستوى الصف المذكور:\n"
    "- title: عنوان الدرس أو الموضوع كما يظهر في الصفحات.\n"
    "- explanation: شرح واضح ومتسلسل لمحتوى الصفحات كأن المعلم يشرحه للطلاب (فقرتان إلى أربع فقرات)، "
    "مع أمثلة من الكتاب عند وجودها.\n"
    "- objectives: أهداف تعليمية سلوكية قابلة للقياس (3-5).\n"
    "- key_points: أهم الأفكار والمفاهيم والقوانين في الصفحات.\n"
    "- keywords: المصطلحات الجديدة.\n"
    "- activities: أنشطة صفية أو استراتيجيات تدريس مقترحة (2-3).\n"
    "- questions: أسئلة تقويم ختامية متنوعة (3-5).\n"
    "اعتمد على محتوى الصفحات فقط ولا تخترع معلومات غير موجودة. "
    "إذا كانت الصفحات فهرساً أو غلافاً أو لا تحتوي درساً، فاذكر ذلك في الشرح باختصار."
)


def ai_enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def extract_pages_pdf(pdf_path: str, start_page: int, end_page: int) -> bytes:
    """ينسخ الصفحات المطلوبة (ترقيم يبدأ من 1) إلى ملف PDF صغير."""
    reader = PdfReader(pdf_path)
    writer = PdfWriter()
    for i in range(start_page - 1, min(end_page, len(reader.pages))):
        writer.add_page(reader.pages[i])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def summarize_with_claude(pdf_path: str, start_page: int, end_page: int, subject: str = "", grade: str = "") -> dict:
    import anthropic

    client = anthropic.Anthropic()
    data = base64.standard_b64encode(extract_pages_pdf(pdf_path, start_page, end_page)).decode()
    context = f"المادة: {subject or 'غير محددة'} — الصف: {grade or 'غير محدد'} — الصفحات من {start_page} إلى {end_page}."

    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": LESSON_SCHEMA},
        },
        system=SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}},
                    {"type": "text", "text": context + "\nاكتب شرح وتلخيص هذه الصفحات."},
                ],
            }
        ],
    )

    if response.stop_reason == "refusal":
        raise RuntimeError("رفض النموذج معالجة هذه الصفحات.")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("الرد كان أطول من المسموح؛ قلّل عدد الصفحات اليومية.")

    text = "".join(b.text for b in response.content if b.type == "text")
    result = json.loads(text)
    result["source"] = "ai"
    return result
