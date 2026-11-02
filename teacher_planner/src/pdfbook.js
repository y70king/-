// قراءة كتاب PDF داخل الجهاز: الأسطر مع مواقعها، رسم الصفحات، واقتطاع صفحات لإرسالها إلى Claude
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import { joinLine } from "./bidi.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openBook(bytes) {
  // pdf.js ينقل الـ buffer للعامل، لذا نعطيه نسخة
  return await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
}

/**
 * أسطر الصفحة مع مواقعها بإحداثيات الصفحة (scale = 1، الأصل أعلى اليسار).
 * يرجع { width, height, lines: [{ text, x0, x1, top, bottom, size }] } مرتبة من الأعلى للأسفل.
 */
export async function pageLines(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const rows = [];
  for (const it of tc.items) {
    if (!it.str) continue;
    const h = Math.abs(it.height || it.transform[3]) || 10;
    const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); // خط القاعدة
    const x1 = vp.convertToViewportPoint(it.transform[4] + (it.width || 0), it.transform[5])[0];
    let row = rows.find((r) => Math.abs(r.base - y) < Math.max(2, Math.min(r.h, h) * 0.35));
    if (!row) rows.push((row = { base: y, h, items: [] }));
    row.h = Math.max(row.h, h);
    row.items.push({ str: it.str, x0: Math.min(x, x1), x1: Math.max(x, x1), top: y - h * 0.85, bottom: y + h * 0.25, h });
  }
  const lines = rows
    .map((r) => {
      const text = joinLine(r.items);
      const solid = r.items.filter((i) => i.str.trim());
      if (!text || !solid.length) return null;
      return {
        text,
        x0: Math.min(...solid.map((i) => i.x0)), x1: Math.max(...solid.map((i) => i.x1)),
        top: Math.min(...solid.map((i) => i.top)), bottom: Math.max(...solid.map((i) => i.bottom)),
        size: Math.max(...solid.map((i) => i.h)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.top - b.top);
  return { width: vp.width, height: vp.height, lines };
}

/** يرسم الصفحة على canvas بالمقياس المطلوب */
export async function renderPage(doc, pageNo, scale = 2) {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas;
}

export async function pageText(doc, pageNo) {
  return (await pageLines(doc, pageNo)).lines.map((l) => l.text).join("\n");
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
