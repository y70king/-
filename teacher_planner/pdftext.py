"""استخراج نص عربي سليم من ملفات PDF.

كثير من ملفات PDF العربية تخزّن النص بالترتيب المرئي (من اليسار لليمين)، فتخرج الكلمات معكوسة،
وتخرج ليغاتشر "لا" مقلوبة ("خالل" بدل "خلال"). هنا نعيد ترتيب الكلمات حسب موقعها على الصفحة
ونصلح "لا" اعتماداً على مواقع الحروف. يستخدم PyMuPDF إن توفر، وإلا يرجع إلى pypdf.
"""

from __future__ import annotations

import re
import unicodedata

ALEFS = "اأإآ"
LAM = "ل"
_ARABIC = re.compile(r"[؀-ۿ]")
_LEAD_PUNCT = re.compile(r"^([\.\،\,\:\;\!\?؟؛\)\(«»\"']+)(.+)$")


def _is_arabic(text: str) -> bool:
    ar = len(_ARABIC.findall(text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return ar > latin


def _fix_word(chars: list[dict], rtl: bool) -> str:
    # 1) إصلاح "لا": ألف بعرض صفري تليها لام = ليغاتشر مقلوبة
    cs = [dict(c) for c in chars]
    i = 0
    while i < len(cs) - 1:
        a, b = cs[i], cs[i + 1]
        if a["c"] in ALEFS and b["c"] == LAM and (a["bbox"][2] - a["bbox"][0]) < 0.5:
            cs[i], cs[i + 1] = b, a
            i += 2
        else:
            i += 1
    word = "".join(c["c"] for c in cs)
    # 2) إذا كانت حروف الكلمة العربية مرتبة من اليسار لليمين فاعكسها
    xs = [c["bbox"][0] for c in cs if _ARABIC.match(c["c"]) and (c["bbox"][2] - c["bbox"][0]) >= 0.5]
    if rtl and len(xs) >= 2 and xs[0] < xs[-1]:
        word = word[::-1]
    # 3) علامات الترقيم/التنوين التي ظهرت في بداية الكلمة مكانها النهاية
    if rtl:
        k = 0
        while k < len(word) - 1 and (unicodedata.combining(word[k]) or _LEAD_PUNCT.match(word[k] + "x")):
            k += 1
        lead = word[:k]
        marks = "".join(c for c in lead if unicodedata.combining(c))
        punct = "".join(c for c in lead if not unicodedata.combining(c))
        word = word[k:] + marks + punct
    return word


def _line_text(chars: list[dict]) -> str:
    raw = "".join(c["c"] for c in chars)
    rtl = _is_arabic(raw)
    words, cur = [], []
    for c in chars:
        if c["c"].isspace():
            if cur:
                words.append(cur)
            cur = []
        else:
            cur.append(c)
    if cur:
        words.append(cur)
    # ترتيب الكلمات حسب موقعها: من اليمين لليسار للعربية
    words.sort(key=lambda w: (min(c["bbox"][0] for c in w) + max(c["bbox"][2] for c in w)) / 2, reverse=rtl)
    return " ".join(_fix_word(w, rtl) for w in words)


def _extract_pymupdf(path: str, start_page: int, end_page: int) -> str:
    import pymupdf

    out = []
    with pymupdf.open(path) as doc:
        for pno in range(start_page - 1, min(end_page, doc.page_count)):
            lines = []
            for block in doc[pno].get_text("rawdict", sort=True)["blocks"]:
                for line in block.get("lines", []):
                    chars = [c for s in line["spans"] for c in s["chars"]]
                    if chars:
                        lines.append(_line_text(chars))
                lines.append("")
            out.append("\n".join(lines).strip())
    return unicodedata.normalize("NFKC", "\n\n".join(out))


def _extract_pypdf(path: str, start_page: int, end_page: int) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    out = []
    for i in range(start_page - 1, min(end_page, len(reader.pages))):
        try:
            out.append(reader.pages[i].extract_text() or "")
        except Exception:
            out.append("")
    return unicodedata.normalize("NFKC", "\n\n".join(out))


def extract_text(path: str, start_page: int, end_page: int) -> str:
    try:
        return _extract_pymupdf(path, start_page, end_page)
    except ImportError:
        return _extract_pypdf(path, start_page, end_page)
