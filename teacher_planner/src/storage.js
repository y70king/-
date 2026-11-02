// تخزين: إعدادات صغيرة في localStorage، وملف الكتاب في IndexedDB، وحفظ/مشاركة الملفات المصدّرة
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("tp_" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tp_" + k, JSON.stringify(v)); } catch {} },
};

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("teacher-planner", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveBookBytes(bytes) {
  try {
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(bytes, "book"); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch {}
}
export async function loadBookBytes() {
  try {
    const db = await idb();
    return await new Promise((res) => { const r = db.transaction("files").objectStore("files").get("book"); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch { return null; }
}

const blobToBase64 = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1]);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});

/** يحفظ الملف: على الهاتف يُحفظ في مجلد المستندات ثم تفتح نافذة المشاركة، وفي المتصفح يُنزَّل مباشرة */
export async function saveFile(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    let saved = null;
    try {
      saved = await Filesystem.writeFile({ path: `مخطط المعلم/${filename}`, data, directory: Directory.Documents, recursive: true });
    } catch { /* بعض الأجهزة تمنع الكتابة في المستندات */ }
    const tmp = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title: filename, files: [tmp.uri], dialogTitle: "حفظ أو إرسال الخطة" }).catch(() => {});
    return saved ? "تم الحفظ في: المستندات/مخطط المعلم" : "تم إنشاء الملف";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
  return "تم تنزيل الملف";
}
