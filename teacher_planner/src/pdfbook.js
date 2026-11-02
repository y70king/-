// قراءة كتاب PDF داخل الجهاز: عدد الصفحات، نص الصفحات، واقتطاع صفحات لإرسالها إلى Claude
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ARABIC = /[؀-ۿ]/;

export async function openBook(bytes) {
  // pdf.js ينقل الـ buffer للعامل، لذا نعطيه نسخة
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  return doc;
}

/** يرتب عناصر السطر حسب موضعها (من اليمين لليسار للعربية) ويضيف المسافات حسب الفراغات */
function fixLine(items) {
  const raw = items.map((i) => i.str).join("");
  const ar = (raw.match(/[\u0600-\u06FF]/g) || []).length;
  const la = (raw.match(/[A-Za-z]/g) || []).length;
  const rtl = ar > la;
  items.sort((a, b) => (rtl ? b.x0 - a.x0 : a.x0 - b.x0));
  let text = "", prev = null;
  for (const it of items) {
    if (prev) {
      const gap = rtl ? prev.x0 - it.x1 : it.x0 - prev.x1;
      if (gap > it.h * 0.2 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
    }
    text += it.str;
    prev = it;
  }
  return text.replace(/\s+/g, " ").trim();
}

export async function pageText(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const lines = [];
  for (const it of tc.items) {
    if (!it.str) continue;
    const [, , , , x, y] = it.transform;
    const h = it.height || Math.abs(it.transform[3]) || 10;
    let line = lines.find((l) => Math.abs(l.y - y) < Math.max(2, h * 0.4));
    if (!line) lines.push((line = { y, items: [] }));
    line.items.push({ str: it.str, x0: x, x1: x + (it.width || 0), h });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => fixLine(l.items)).filter(Boolean).join("\n").normalize("NFKC");
}

export async function rangeText(doc, from, to) {
  const parts = [];
  for (let p = from; p <= Math.min(to, doc.numPages); p++) parts.push(await pageText(doc, p));
  return parts.join("\n\n");
}

/** ينسخ الصفحات [from..to] إلى ملف PDF صغير (base64) لإرساله إلى Claude */
export async function extractPagesBase64(bytes, from, to) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const idx = [];
  for (let p = from; p <= Math.min(to, src.getPageCount()); p++) idx.push(p - 1);
  (await out.copyPages(src, idx)).forEach((pg) => out.addPage(pg));
  return await out.saveAsBase64();
}

export const hasArabic = (s) => ARABIC.test(s);
