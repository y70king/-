import sys, re
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = "Noto Sans Arabic"
SCALE = 1.1  # Noto Sans Arabic runs large
LATIN = "Arial"
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")

def L(s):  # left-to-right embedding for formulas/numbers inside Arabic text
    return "\u2066" + s + "\u2069"

def set_rtl(p):
    pPr = p._p.get_or_add_pPr()
    b = OxmlElement("w:bidi"); b.set(qn("w:val"), "1"); pPr.append(b)

def run(p, text, bold=False, size=13, color=None, underline=False, ltr=False):
    r = p.add_run(text)
    r.bold = bold; r.underline = underline
    size = size * SCALE
    r.font.size = Pt(size)
    rPr = r._r.get_or_add_rPr()
    fonts = rPr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts"); rPr.insert(0, fonts)
    for a in ("w:ascii", "w:hAnsi"):
        fonts.set(qn(a), LATIN)
    fonts.set(qn("w:cs"), FONT)
    if not ltr:
        rtl = OxmlElement("w:rtl"); rtl.set(qn("w:val"), "1"); rPr.append(rtl)
    szcs = OxmlElement("w:szCs"); szcs.set(qn("w:val"), str(int(size * 2))); rPr.append(szcs)
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
    pf.line_spacing = Pt(size * SCALE * 1.45)
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
                part = "\u200e" + part.replace(" ", "\u200e\u00a0\u200e") + "\u200e"
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
    p.paragraph_format.space_after = Pt(0)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd"); sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), fill)
    tcPr.append(sh)

def borders(table, sz=8, color="000000", inside=True):
    tblPr = table._tbl.tblPr
    b = OxmlElement("w:tblBorders")
    edges = ["top", "left", "bottom", "right"] + (["insideH", "insideV"] if inside else [])
    for e in edges:
        el = OxmlElement(f"w:{e}"); el.set(qn("w:val"), "single"); el.set(qn("w:sz"), str(sz))
        el.set(qn("w:space"), "0"); el.set(qn("w:color"), color); b.append(el)
    tblPr.append(b)

def rtl_table(doc, rows, cols, widths):
    t = doc.add_table(rows=rows, cols=cols)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    tblPr = t._tbl.tblPr
    tblPr.append(OxmlElement("w:bidiVisual"))
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); tblPr.append(lay)
    tw = tblPr.find(qn("w:tblW"))
    if tw is None:
        tw = OxmlElement("w:tblW"); tblPr.append(tw)
    tw.set(qn("w:type"), "dxa"); tw.set(qn("w:w"), str(int(sum(widths) * 567)))
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths):
        gc.set(qn("w:w"), str(int(w * 567)))
    for row in t.rows:
        for c, w in zip(row.cells, widths):
            c.width = Cm(w)
            c._tc.remove(c.paragraphs[0]._p)
    return t

def vcenter(cell):
    v = OxmlElement("w:vAlign"); v.set(qn("w:val"), "center"); cell._tc.get_or_add_tcPr().append(v)

C = WD_ALIGN_PARAGRAPH.CENTER
NAVY = "1F3864"

def header(doc, model):
    t = rtl_table(doc, 1, 3, [6.0, 5.6, 6.0])
    borders(t, sz=12, color=NAVY, inside=False)
    c = t.rows[0].cells
    for cell in c: vcenter(cell)
    para(c[0], "وزارة التربية", bold=True, size=12, space_after=0)
    para(c[0], "قسم تربية بيجي", bold=True, size=11.5, space_after=0)
    para(c[0], "ثانوية حي النفط للبنين", bold=True, size=11.5, space_after=0)
    para(c[1], "بسم الله الرحمن الرحيم", bold=True, size=11, align=C, space_after=0, color=NAVY)
    para(c[1], "الامتحان الشهري الأول", bold=True, size=13.5, align=C, space_after=0)
    para(c[1], "الفصل الأول: الكهربائية الساكنة", size=11, align=C, space_after=0)
    para(c[2], "المادة: الفيزياء", bold=True, size=12, space_after=0, align=WD_ALIGN_PARAGRAPH.LEFT)
    para(c[2], "الصف: الثالث المتوسط", size=11, space_after=0, align=WD_ALIGN_PARAGRAPH.LEFT)
    para(c[2], "الزمن: ساعة واحدة", size=11, space_after=0, align=WD_ALIGN_PARAGRAPH.LEFT)

    band = rtl_table(doc, 1, 1, [17.6])
    borders(band, sz=12, color=NAVY, inside=False)
    shade(band.rows[0].cells[0], NAVY)
    para(band.rows[0].cells[0], f"النموذج ( {model} )", bold=True, size=14, align=C, space_after=0, color="FFFFFF")

    info = rtl_table(doc, 1, 3, [9.0, 4.0, 4.6])
    borders(info, sz=6, color="7F7F7F")
    ic = info.rows[0].cells
    para(ic[0], "اسم الطالب: ........................................", size=11.5, space_after=0)
    para(ic[1], "الشعبة: (  ......  )", size=11.5, space_after=0, align=C)
    para(ic[2], "الدرجة:  ........ / 100", bold=True, size=11.5, space_after=0, align=C)

    para(doc, "ملاحظة: أجب عن جميع الأسئلة.      ثابت كولوم: " + L("k = 9×10⁹ N.m²/C²"),
         bold=True, size=11, space_after=4, color="C00000")

def q_title(doc, num, text, marks=None):
    t = rtl_table(doc, 1, 1, [17.6])
    borders(t, sz=6, color=NAVY)
    a = t.rows[0].cells[0]
    shade(a, "DEEAF6")
    para(a, f"السؤال {ORD[num]}: {text}", bold=True, size=13, space_after=0, color=NAVY)
    para(doc, "", size=3, space_after=0)

ORD = {1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع"}

def items(doc, lst, letters=False, size=12.5):
    for i, t in enumerate(lst, 1):
        para(doc, f"{i}- " + t, size=12.5, indent=0.8, space_after=1)

def footer(doc):
    para(doc, "", size=6, space_after=0)
    para(doc, "مع تمنياتنا لكم بالنجاح والتوفيق", bold=True, size=12, space_after=0, align=C, color=NAVY)

def key_title(doc, model):
    band = rtl_table(doc, 1, 1, [17.6])
    shade(band.rows[0].cells[0], NAVY)
    para(band.rows[0].cells[0], f"نموذج الإجابة – النموذج ( {model} ) – خاص بالمدرّس", bold=True, size=14, align=C, space_after=0, color="FFFFFF")
    para(doc, "", size=4, space_after=0)

def page_border(section):
    sectPr = section._sectPr
    pb = OxmlElement("w:pgBorders"); pb.set(qn("w:offsetFrom"), "page")
    for e in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{e}"); el.set(qn("w:val"), "double"); el.set(qn("w:sz"), "6")
        el.set(qn("w:space"), "20"); el.set(qn("w:color"), NAVY); pb.append(el)
    sectPr.append(pb)

def build(path, exams):
    doc = Document()
    for s in doc.sections:
        s.top_margin = Cm(1.3); s.bottom_margin = Cm(1.2)
        s.left_margin = Cm(1.7); s.right_margin = Cm(1.7)
        page_border(s)
    first = True
    for ex in exams:
        if not first: page_break(doc)
        first = False
        header(doc, ex["name"])
        for kind, *rest in ex["body"]:
            if kind == "q": q_title(doc, *rest)
            elif kind == "sub": para(doc, rest[0], bold=True, size=12.5, indent=0.3, space_after=1)
            elif kind == "items": items(doc, rest[0])
            elif kind == "inline": para(doc, "      ".join(f"{i}- {t}" for i, t in enumerate(rest[0], 1)), size=12.5, indent=0.8, space_after=1)
            elif kind == "p": para(doc, rest[0], size=12.5, indent=0.8, space_after=1)
            elif kind == "gap": para(doc, "", size=5, space_after=0)
        footer(doc)
    for ex in exams:
        page_break(doc)
        key_title(doc, ex["name"])
        for kind, *rest in ex["key"]:
            if kind == "h": para(doc, rest[0], bold=True, size=12.5, space_after=1, color=NAVY)
            elif kind == "p": para(doc, rest[0], size=11, indent=0.5, space_after=1)
    st = doc.settings.element
    e = OxmlElement("w:embedTrueTypeFonts"); st.insert(0, e)
    doc.save(path)
