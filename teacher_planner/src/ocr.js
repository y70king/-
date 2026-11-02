// تعرّف ضوئي على الحروف العربية بدون إنترنت (للكتب المصوّرة) باستخدام tesseract.js
import { createWorker } from "tesseract.js";

let workerPromise = null;

function simdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

function getWorker() {
  if (!workerPromise) {
    const base = new URL("./ocr/", document.baseURI).href;
    workerPromise = createWorker("ara", 1, {
      workerPath: base + "worker.min.js",
      corePath: base + (simdSupported() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"),
      langPath: base,
      gzip: false,
      workerBlobURL: false,
      cacheMethod: "none",
    }).catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/**
 * يقرأ نص صورة الصفحة. canvas مرسوم بمقياس scale.
 * يرجع أسطراً بإحداثيات الصفحة (scale = 1): [{ text, x0, x1, top, bottom, size, conf }]
 */
export async function ocrLines(canvas, scale) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const text = (l.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const { x0, y0, x1, y1 } = l.bbox;
    out.push({ text, x0: x0 / scale, x1: x1 / scale, top: y0 / scale, bottom: y1 / scale, size: (y1 - y0) / scale, conf: l.confidence });
  }
  return out.sort((a, b) => a.top - b.top);
}
