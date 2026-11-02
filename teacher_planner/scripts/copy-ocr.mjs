// ينسخ ملفات التعرف الضوئي (OCR) إلى public/ocr حتى تعمل بدون إنترنت داخل التطبيق
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const out = "public/ocr";
mkdirSync(out, { recursive: true });
for (const [from, to] of [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
]) copyFileSync(from, `${out}/${to}`);
// بدون ضغط: بناء أندرويد يفك ملفات .gz تلقائياً فيتغير اسمها
writeFileSync(`${out}/ara.traineddata`, gunzipSync(readFileSync("node_modules/@tesseract.js-data/ara/4.0.0/ara.traineddata.gz")));
rmSync(`${out}/ara.traineddata.gz`, { force: true });
console.log("OCR assets copied to", out);
