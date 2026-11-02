// تصدير الخطة إلى PDF و Word بتنسيق رسمي
import {
  AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { PLAN_TYPES } from "./schedule.js";

export const FONTS = {
  "Simplified Arabic": { label: "Simplified Arabic — الخط الرسمي للمخاطبات", web: "'Simplified Arabic', 'Noto Naskh Arabic', serif" },
  "Traditional Arabic": { label: "Traditional Arabic — نسخ تقليدي", web: "'Traditional Arabic', 'Amiri', serif" },
  "Amiri": { label: "Amiri — أميري", web: "'Amiri', serif" },
  "Noto Naskh Arabic": { label: "Noto Naskh — نسخ حديث", web: "'Noto Naskh Arabic', serif" },
};

const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("ar-IQ", { day: "numeric", month: "long", year: "numeric" });
const fmtMonth = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });
const pagesLabel = (l) => (l.startPage === l.endPage ? `${l.startPage}` : `${l.startPage} – ${l.endPage}`);

/** نموذج موحّد للمستند (يُستخدم للـ PDF والوورد) */
export function buildDocModel({ teacher, lessons, summaries, planType, scopeLabel, bookName, includeDetails }) {
  const t = teacher || {};
  const first = lessons[0], last = lessons[lessons.length - 1];
  const period = first.date === last.date ? fmtDate(first.date) : `من ${fmtDate(first.date)} إلى ${fmtDate(last.date)}`;
  const letterhead = (t.letterhead || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (t.school) letterhead.push(t.school);
  return {
    title: `الخطة ${PLAN_TYPES[planType] || ""} لمادة ${t.subject || "........"}`,
    subtitle: [scopeLabel, period].filter(Boolean).join(" — "),
    right: letterhead,
    left: [
      ["المادة", t.subject], ["الصف والشعبة", t.grade], ["العام الدراسي", t.year],
      ["اسم المدرس", t.name], ["الكتاب", bookName], ["الصفحات", `${first.startPage} – ${last.endPage}`],
    ].filter(([, v]) => v),
    rows: lessons.map((l) => {
      const s = summaries[l.index] || {};
      return {
        l, s,
        cells: [String(l.index), l.dayName, fmtDate(l.date), pagesLabel(l), s.title || "",
          (s.objectives || []).slice(0, 3), (s.activities || []).slice(0, 2), (s.questions || []).slice(0, 2), ""],
      };
    }),
    headers: ["ت", "اليوم", "التاريخ", "الصفحات", "عنوان الدرس", "الأهداف", "طرائق التدريس والأنشطة", "التقويم", "الملاحظات"],
    widths: [4, 7, 11, 7, 15, 20, 14, 15, 7], // نسب مئوية
    includeDetails,
    signatures: ["توقيع مدرس المادة", "توقيع المشرف التربوي", "توقيع مدير المدرسة"],
    teacherName: t.name || "",
  };
}

export function monthLabel(ym) { return fmtMonth(ym); }

// ====================================================================== Word
const BORDER = { style: BorderStyle.SINGLE, size: 6, color: "333333" };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const ALL = (b) => ({ top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b });

function run(text, font, { size = 13, bold = false, color } = {}) {
  return new TextRun({ text, rightToLeft: true, bold, boldComplexScript: bold, color,
    font: { ascii: font, hAnsi: font, cs: font, eastAsia: font }, size: size * 2, sizeComplexScript: size * 2 });
}
function para(text, font, opts = {}) {
  return new Paragraph({ bidirectional: true, alignment: opts.align || AlignmentType.RIGHT, spacing: { after: opts.after ?? 40, line: 276 },
    children: [run(text, font, opts)] });
}
function cellParas(v, font, size) {
  if (Array.isArray(v)) return v.length ? v.map((x) => para("• " + x, font, { size, after: 0 })) : [para("", font, { size })];
  return [para(v ?? "", font, { size, after: 0, align: AlignmentType.CENTER })];
}

export async function toWord(model, font) {
  const size = 11;
  const header = new Table({
    visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL(NO_BORDER),
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, borders: ALL(NO_BORDER),
        children: model.right.length ? model.right.map((l) => para(l, font, { size: 13, bold: true, after: 0 })) : [para("", font)] }),
      new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, borders: ALL(NO_BORDER), verticalAlign: VerticalAlign.CENTER,
        children: [para(model.title, font, { size: 18, bold: true, align: AlignmentType.CENTER, after: 60 }),
          para(model.subtitle, font, { size: 13, align: AlignmentType.CENTER })] }),
      new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, borders: ALL(NO_BORDER),
        children: model.left.map(([k, v]) => new Paragraph({ bidirectional: true, spacing: { after: 0 },
          children: [run(k + ": ", font, { size: 12, bold: true }), run(String(v), font, { size: 12 })] })) }),
    ] })],
  });
  const line = new Paragraph({ border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: "1F2D50", space: 1 } }, spacing: { after: 160 } });

  const headRow = new TableRow({ tableHeader: true, children: model.headers.map((h, i) => new TableCell({
    width: { size: model.widths[i], type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: "DCE3F0", color: "auto" },
    children: [para(h, font, { size, bold: true, align: AlignmentType.CENTER, after: 0 })] })) });
  const bodyRows = model.rows.map((r) => new TableRow({ cantSplit: true, children: r.cells.map((c, i) => new TableCell({
    width: { size: model.widths[i], type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: cellParas(c, font, size) })) }));
  const table = new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL(BORDER), rows: [headRow, ...bodyRows] });

  const details = [];
  if (model.includeDetails) {
    details.push(para("", font), para("شرح الدروس", font, { size: 16, bold: true, align: AlignmentType.CENTER, after: 120 }));
    for (const { l, s } of model.rows) {
      details.push(para(`الدرس ${l.index}: ${s.title || ""}  (${l.dayName} ${fmtDate(l.date)} — الصفحات ${pagesLabel(l)})`, font, { size: 14, bold: true, color: "1F2D50", after: 80 }));
      const sec = (title, val) => {
        if (!val || (Array.isArray(val) && !val.length)) return;
        details.push(para(title, font, { size: 12, bold: true, after: 20 }));
        if (Array.isArray(val)) val.forEach((x) => details.push(para("• " + x, font, { size: 12, after: 0 })));
        else String(val).split(/\n+/).forEach((p) => details.push(para(p, font, { size: 12 })));
      };
      sec("الأهداف:", s.objectives); sec("الشرح:", s.explanation || "لم يُنشأ الشرح بعد."); sec("أهم النقاط:", s.key_points);
      sec("المصطلحات:", s.keywords?.length ? [s.keywords.join("، ")] : null); sec("الأنشطة:", s.activities); sec("أسئلة التقويم:", s.questions);
      details.push(para("", font));
    }
  }

  const sigs = new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL(NO_BORDER),
    rows: [new TableRow({ children: model.signatures.map((s, i) => new TableCell({ borders: ALL(NO_BORDER), children: [
      para(s, font, { size: 12, bold: true, align: AlignmentType.CENTER, after: 300 }),
      para(i === 0 && model.teacherName ? model.teacherName : "..............................", font, { size: 12, align: AlignmentType.CENTER }),
    ] })) })] });

  const doc = new Document({
    styles: { default: { document: { run: { font, rightToLeft: true } } } },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        run("صفحة ", font, { size: 10 }), new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) },
      children: [header, line, table, ...details, para("", font), para("", font), sigs],
    }],
  });
  return await Packer.toBlob(doc);
}

// ====================================================================== PDF
const PAGE = { w: 1123, h: 794, pad: 40 }; // A4 أفقي بدقة 96

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cellHtml = (v) => (Array.isArray(v) ? v.map((x) => `<div class="fp-li">• ${esc(x)}</div>`).join("") : esc(v));

function pdfCss(fontCss) {
  return `
  .fp-page{width:${PAGE.w}px;height:${PAGE.h}px;padding:${PAGE.pad}px;box-sizing:border-box;background:#fff;color:#111;direction:rtl;
    font-family:${fontCss};font-size:14px;line-height:1.55;position:relative;overflow:hidden}
  .fp-page *{box-sizing:border-box}
  .fp-head{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:12px;align-items:center;border-bottom:3px double #1f2d50;padding-bottom:8px;margin-bottom:12px}
  .fp-right div{font-weight:700;font-size:15px}
  .fp-center{text-align:center}.fp-center h1{font-size:22px;margin:0 0 4px;color:#1f2d50}.fp-center p{margin:0;font-size:14px}
  .fp-left div{font-size:13.5px}.fp-left b{color:#1f2d50}
  .fp-mini{display:flex;justify-content:space-between;border-bottom:1px solid #1f2d50;margin-bottom:8px;font-size:12px;color:#333}
  table.fp{width:100%;border-collapse:collapse;table-layout:fixed}
  table.fp th,table.fp td{border:1px solid #333;padding:4px 6px;vertical-align:middle;font-size:13px;word-wrap:break-word}
  table.fp th{background:#dce3f0;font-weight:700;text-align:center}
  table.fp td{text-align:center}.fp-li{text-align:right;padding-inline-start:10px;text-indent:-10px}
  .fp-h2{text-align:center;font-size:19px;font-weight:700;color:#1f2d50;margin:6px 0 10px}
  .fp-lesson{font-size:16px;font-weight:700;color:#1f2d50;border-bottom:1px solid #c9d2e3;margin:10px 0 4px}
  .fp-sec{font-weight:700;margin-top:4px}.fp-p{margin:0 0 4px;text-align:justify}
  .fp-sigs{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;margin-top:28px;font-weight:700}
  .fp-sigs span{display:block;font-weight:400;margin-top:30px}
  .fp-num{position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:12px;color:#555}`;
}

export async function toPdf(model, fontKey, onProgress) {
  const fontCss = FONTS[fontKey]?.web || FONTS.Amiri.web;
  await Promise.all(["400", "700"].map((w) => document.fonts.load(`${w} 16px ${fontCss.split(",")[0]}`).catch(() => {})));

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;";
  host.innerHTML = `<style>${pdfCss(fontCss)}</style>`;
  document.body.appendChild(host);

  const pages = [];
  const limit = PAGE.h - PAGE.pad - 30; // نترك مكاناً لرقم الصفحة
  const newPage = (first) => {
    const p = document.createElement("div"); p.className = "fp-page";
    p.innerHTML = first
      ? `<div class="fp-head"><div class="fp-right">${model.right.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
         <div class="fp-center"><h1>${esc(model.title)}</h1><p>${esc(model.subtitle)}</p></div>
         <div class="fp-left">${model.left.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}</div></div>`
      : `<div class="fp-mini"><span>${esc(model.title)}</span><span>${esc(model.subtitle)}</span></div>`;
    host.appendChild(p); pages.push(p); return p;
  };
  const fits = (p) => [...p.children].every((c) => c.tagName === "STYLE" || c.offsetTop + c.offsetHeight <= limit);
  let page = newPage(true);
  const place = (el) => { // يضيف عنصراً وينقله لصفحة جديدة إذا لم يتسع
    page.appendChild(el);
    if (!fits(page) && page.children.length > 1) { el.remove(); page = newPage(false); page.appendChild(el); }
    return el;
  };

  // الجدول، صفاً صفاً مع تكرار رأس الجدول في كل صفحة
  const colgroup = `<colgroup>${model.widths.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>`;
  const thead = `<thead><tr>${model.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  let table = null;
  const freshTable = () => { table = document.createElement("table"); table.className = "fp"; table.innerHTML = colgroup + thead + "<tbody></tbody>"; page.appendChild(table); };
  freshTable();
  for (const r of model.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = r.cells.map((c) => `<td>${cellHtml(c)}</td>`).join("");
    table.tBodies[0].appendChild(tr);
    if (!fits(page) && table.tBodies[0].rows.length > 1) { tr.remove(); page = newPage(false); freshTable(); table.tBodies[0].appendChild(tr); }
  }

  if (model.includeDetails) {
    const div = (cls, html) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; };
    page = newPage(false);
    place(div("fp-h2", "شرح الدروس"));
    for (const { l, s } of model.rows) {
      place(div("fp-lesson", `الدرس ${l.index}: ${esc(s.title || "")} <small style="font-weight:400;color:#444">(${esc(l.dayName)} ${esc(fmtDate(l.date))} — الصفحات ${pagesLabel(l)})</small>`));
      const sec = (title, val) => {
        if (!val || (Array.isArray(val) && !val.length)) return;
        place(div("fp-sec", esc(title)));
        if (Array.isArray(val)) val.forEach((x) => place(div("fp-li", `• ${esc(x)}`)));
        else String(val).split(/\n+/).forEach((p) => place(div("fp-p", esc(p))));
      };
      sec("الأهداف:", s.objectives); sec("الشرح:", s.explanation || "لم يُنشأ الشرح بعد."); sec("أهم النقاط:", s.key_points);
      sec("المصطلحات:", s.keywords?.length ? [s.keywords.join("، ")] : null); sec("الأنشطة:", s.activities); sec("أسئلة التقويم:", s.questions);
    }
  }
  place((() => { const d = document.createElement("div"); d.className = "fp-sigs";
    d.innerHTML = model.signatures.map((s, i) => `<div>${esc(s)}<span>${i === 0 && model.teacherName ? esc(model.teacherName) : "............................"}</span></div>`).join("");
    return d; })());

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const num = document.createElement("div"); num.className = "fp-num"; num.textContent = `صفحة ${i + 1} من ${pages.length}`;
    pages[i].appendChild(num);
    const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff", logging: false });
    if (i) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
    onProgress?.(i + 1, pages.length);
  }
  host.remove();
  return pdf.output("blob");
}
