import sys, re
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = "Arial"
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")

def L(s):  # left-to-right embedding for formulas/numbers inside Arabic text
    return "\u2066" + s + "\u2069"

def set_rtl(p):
    pPr = p._p.get_or_add_pPr()
    b = OxmlElement("w:bidi"); b.set(qn("w:val"), "1"); pPr.append(b)

def run(p, text, bold=False, size=13, color=None, underline=False, ltr=False):
    r = p.add_run(text)
    r.bold = bold; r.underline = underline
    r.font.size = Pt(size); r.font.name = FONT
    rPr = r._r.get_or_add_rPr()
    fonts = rPr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts"); rPr.insert(0, fonts)
    for a in ("w:ascii", "w:hAnsi", "w:cs"):
        fonts.set(qn(a), FONT)
    if not ltr:
        rtl = OxmlElement("w:rtl"); rtl.set(qn("w:val"), "1"); rPr.append(rtl)
    szcs = OxmlElement("w:szCs"); szcs.set(qn("w:val"), str(size * 2)); rPr.append(szcs)
    if bold:
        bcs = OxmlElement("w:bCs"); rPr.append(bcs)
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r

def para(doc_or_cell, text="", bold=False, size=13, align=WD_ALIGN_PARAGRAPH.RIGHT,
         space_after=4, indent=0, color=None, underline=False):
    p = doc_or_cell.add_paragraph()
    set_rtl(p)
    # in a bidi (RTL) paragraph Word/LibreOffice mirror left/right
    flip = {WD_ALIGN_PARAGRAPH.RIGHT: WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT: WD_ALIGN_PARAGRAPH.RIGHT}
    p.alignment = flip.get(align, align)
    pf = p.paragraph_format
    pf.space_after = Pt(space_after); pf.space_before = Pt(0)
    pf.line_spacing = 1.05
    if indent:
        pf.left_indent = Cm(indent)  # mirrored to the right side in RTL
    if text:
        # **bold** segments
        for i, seg in enumerate(re.split(r"\*\*", text)):
            for j, part in enumerate(re.split("[\u2066\u2069]", seg)):
                if not part: continue
                b = bold or (i % 2 == 1)
                if j % 2 == 0:
                    run(p, part, bold=b, size=size, color=color, underline=underline)
                    continue
                part = "\u200e" + part.replace(" ", "\u00a0").replace("×", "\u2060×\u2060").replace("−", "−\u2060") + "\u200e"
                for k, piece in enumerate(re.split("([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)", part)):
                    if not piece: continue
                    if k % 2 == 1:
                        r = run(p, piece.translate(SUP), bold=b, size=size, color=color, underline=underline, ltr=True)
                        r.font.superscript = True
                    else:
                        run(p, piece, bold=b, size=size, color=color, underline=underline, ltr=True)
    return p

def page_break(doc):
    p = doc.add_paragraph(); p.add_run().add_break(WD_BREAK.PAGE)

def header(doc, model):
    t = doc.add_table(rows=1, cols=3)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = t._tbl.tblPr
    bv = OxmlElement("w:bidiVisual"); tblPr.append(bv)
    c = t.rows[0].cells
    c[0]._tc.remove(c[0].paragraphs[0]._p)
    para(c[0], "وزارة التربية", bold=True, size=12)
    para(c[0], "المديرية العامة للتربية في ..........", size=11)
    para(c[0], "مدرسة ..........................", size=11)
    c[1]._tc.remove(c[1].paragraphs[0]._p)
    para(c[1], "الامتحان الشهري الأول", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER)
    para(c[1], f"النموذج ({model})", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER, color="1F4E79")
    para(c[1], "الفصل الأول: الكهربائية الساكنة", size=11, align=WD_ALIGN_PARAGRAPH.CENTER)
    c[2]._tc.remove(c[2].paragraphs[0]._p)
    para(c[2], "المادة: الفيزياء", bold=True, size=12)
    para(c[2], "الصف: الثالث المتوسط", size=11)
    para(c[2], "الزمن: ساعة واحدة", size=11)
    para(doc, "اسم الطالب: ........................................    الشعبة: ( ...... )    التاريخ:    /    / 2026", size=12, space_after=2)
    para(doc, "ملاحظة: أجب عن جميع الأسئلة، ولكل سؤال (25) درجة.   ثابت كولوم: " + L("k = 9×10⁹ N.m²/C²"), bold=True, size=11, space_after=2)
    p = para(doc, "ـ" * 60, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)

def q_title(doc, num, text, marks):
    para(doc, f"س{num}/ {text}", bold=True, size=13, space_after=2, color="000000")
    doc.paragraphs[-1].runs[-1].add_text(f"   ({marks} درجة)")

def items(doc, lst, letters=False, size=12.5):
    marks = "abcdef" if letters else None
    for i, t in enumerate(lst, 1):
        lab = f"{i}- "
        para(doc, lab + t, size=12.5, indent=0.6, space_after=2)

def footer(doc):
    para(doc, "مع تمنياتنا لكم بالنجاح والتوفيق", bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    para(doc, "مدرّسة المادة: ياسمين خلف", bold=True, size=12, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=0)

def key_title(doc, model):
    para(doc, f"نموذج الإجابة – النموذج ({model})  (لمدرّسة المادة)", bold=True, size=15,
         align=WD_ALIGN_PARAGRAPH.CENTER, color="1F4E79", space_after=6)

def build(path, exams):
    doc = Document()
    for s in doc.sections:
        s.top_margin = Cm(1.5); s.bottom_margin = Cm(1.5)
        s.left_margin = Cm(1.8); s.right_margin = Cm(1.8)
    first = True
    for ex in exams:
        if not first: page_break(doc)
        first = False
        header(doc, ex["name"])
        for kind, *rest in ex["body"]:
            if kind == "q": q_title(doc, *rest)
            elif kind == "sub": para(doc, rest[0], bold=True, size=12.5, indent=0.3, space_after=2, underline=True)
            elif kind == "items": items(doc, rest[0])
            elif kind == "p": para(doc, rest[0], size=13, indent=0.6, space_after=3)
            elif kind == "gap": para(doc, "", space_after=rest[0] if rest else 4)
        footer(doc)
    for ex in exams:
        page_break(doc)
        key_title(doc, ex["name"])
        for kind, *rest in ex["key"]:
            if kind == "h": para(doc, rest[0], bold=True, size=13, space_after=2, color="C00000")
            elif kind == "p": para(doc, rest[0], size=12, indent=0.5, space_after=2)
    doc.save(path)
