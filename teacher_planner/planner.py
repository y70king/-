"""منطق توزيع صفحات الكتاب على أيام الدراسة + التلخيص المحلي (بدون ذكاء اصطناعي)."""

from __future__ import annotations

import re
from collections import Counter
from datetime import date, timedelta

# أيام الأسبوع بترقيم JavaScript: الأحد = 0 ... السبت = 6
DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]


def js_weekday(d: date) -> int:
    """يحوّل ترقيم بايثون (الاثنين=0) إلى ترقيم JS (الأحد=0)."""
    return (d.weekday() + 1) % 7


def build_schedule(
    start_page: int,
    end_page: int,
    pages_per_day: int,
    start_date: date,
    study_days: list[int],
    holidays: set[date] | None = None,
) -> list[dict]:
    """يوزّع الصفحات [start_page..end_page] على أيام الدراسة بدءاً من start_date.

    يرجع قائمة دروس، لكل درس: رقم، تاريخ، اسم اليوم، رقم الأسبوع، الشهر، ونطاق الصفحات.
    """
    if pages_per_day < 1:
        raise ValueError("عدد الصفحات اليومية يجب أن يكون 1 أو أكثر")
    if end_page < start_page:
        raise ValueError("صفحة النهاية يجب أن تكون بعد صفحة البداية")
    days = {d % 7 for d in study_days}
    if not days:
        raise ValueError("اختر يوماً دراسياً واحداً على الأقل")
    holidays = holidays or set()

    lessons: list[dict] = []
    current = start_date
    page = start_page
    week_start = None
    week_no = 0
    while page <= end_page:
        if js_weekday(current) in days and current not in holidays:
            # الأسبوع الدراسي يبدأ يوم الأحد
            sunday = current - timedelta(days=js_weekday(current))
            if sunday != week_start:
                week_start = sunday
                week_no += 1
            last = min(page + pages_per_day - 1, end_page)
            lessons.append(
                {
                    "index": len(lessons) + 1,
                    "date": current.isoformat(),
                    "day_name": DAY_NAMES[js_weekday(current)],
                    "week": week_no,
                    "week_start": sunday.isoformat(),
                    "month": current.strftime("%Y-%m"),
                    "start_page": page,
                    "end_page": last,
                }
            )
            page = last + 1
        current += timedelta(days=1)
    return lessons


# ---------------------------------------------------------------- تلخيص محلي

_AR_STOP = set(
    """في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين اللذان هو هي هم هن أن إن ان كان كانت
    يكون تكون ما لا لم لن قد ثم أو او و ف ب ل ك كل بعض عند بين حتى إذا اذا كما أي اي غير بل لكن
    نحن أنت انت أنا انا وهو وهي وقد ولا وما فإن فان به بها له لها منه منها فيه فيها عليه عليها""".split()
)
_EN_STOP = set("the a an of to in and or is are was were be for on with as by that this it at from".split())


def _clean(text: str) -> str:
    text = text.replace("ـ", "")  # التطويل
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _sentences(text: str) -> list[str]:
    flat = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[\.\!\?؟:])\s+|\s(?=[•●▪◦]\s)", flat)
    out = []
    for p in parts:
        p = p.strip(" •●▪◦-")
        if 25 <= len(p) <= 400:
            out.append(p)
    return out


def local_summary(text: str, max_points: int = 6) -> dict:
    """تلخيص استخلاصي بسيط: يختار الجمل الأكثر احتواءً على الكلمات المتكررة المهمة."""
    text = _clean(text)
    if len(text) < 40:
        return {
            "title": "",
            "explanation": "لم يتم العثور على نص قابل للقراءة في هذه الصفحات (قد يكون الكتاب صوراً ممسوحة ضوئياً). "
            "فعّل الذكاء الاصطناعي (ANTHROPIC_API_KEY) ليتمكن التطبيق من قراءة الصفحات المصورة وشرحها.",
            "objectives": [],
            "key_points": [],
            "activities": [],
            "questions": [],
            "source": "local",
        }

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    title = next((l for l in lines if 3 <= len(l) <= 80 and not l.isdigit()), "")

    words = re.findall(r"[؀-ۿA-Za-z]{3,}", text)
    freq = Counter(w for w in words if w not in _AR_STOP and w.lower() not in _EN_STOP)
    sents = _sentences(text)
    scored = []
    for i, s in enumerate(sents):
        toks = re.findall(r"[؀-ۿA-Za-z]{3,}", s)
        if not toks:
            continue
        score = sum(freq.get(t, 0) for t in toks) / (len(toks) ** 0.7)
        scored.append((score, i, s))
    top = sorted(scored, reverse=True)[:max_points]
    key_points = [s for _, _, s in sorted(top, key=lambda x: x[1])]
    keywords = [w for w, _ in freq.most_common(8)]

    explanation = " ".join(key_points[:3]) if key_points else text[:600]
    return {
        "title": title,
        "explanation": explanation,
        "objectives": [],
        "key_points": key_points,
        "keywords": keywords,
        "activities": [],
        "questions": [],
        "source": "local",
    }
