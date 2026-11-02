// ترتيب حروف وكلمات السطر من مواقعها على الصفحة (عربي + إنجليزي + أرقام + معادلات)

const STRONG_R = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const STRONG_L = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/; // بدون × و ÷
const countRe = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;

/**
 * يجمع عناصر السطر بالترتيب المنطقي الصحيح (خوارزمية ثنائية الاتجاه مبسطة):
 * الحروف المتلاصقة تكوّن كلمة، الكلمات العربية تُقرأ من اليمين، والإنجليزية والأرقام والمعادلات من اليسار.
 */
export function joinLine(items) {
  items = items.filter((i) => i.str.trim()).map((i) => ({ ...i })).sort((a, b) => a.x0 - b.x0);
  // الحركات (الشدة، التنوين...) تُلصق بالحرف الأقرب إليها
  const MARK = /^[\u064B-\u065F\u0670\uFE70-\uFE7F\s]+$/;
  const marks = items.filter((i) => MARK.test(i.str) && !/^\s+$/.test(i.str));
  if (marks.length) {
    items = items.filter((i) => !marks.includes(i));
    for (const m of marks) {
      const c = (m.x0 + m.x1) / 2;
      let best = null, bd = Infinity;
      for (const it of items) { if (!STRONG_R.test(it.str)) continue; const d = c < it.x0 ? it.x0 - c : c > it.x1 ? c - it.x1 : 0; if (d < bd) { bd = d; best = it; } }
      if (best) best.str += m.str.trim();
    }
  }
  const chunks = [];
  let cur = null;
  for (const it of items) {
    if (cur && it.x0 - cur.x1 <= it.h * 0.2) { cur.items.push(it); cur.x1 = Math.max(cur.x1, it.x1); }
    else chunks.push((cur = { items: [it], x1: it.x1 }));
  }
  const tokens = chunks.map((c) => {
    const raw = c.items.map((i) => i.str).join("");
    const dir = STRONG_R.test(raw) ? "R" : STRONG_L.test(raw) ? "L" : "N";
    return { dir, text: (dir === "R" ? c.items.slice().reverse().map((i) => i.str).join("") : raw).trim() };
  });
  const all = tokens.map((t) => t.text).join("");
  // اتجاه السطر: عربي إلا إذا كان معادلة (فيها = وحروف لاتينية) ولا يغلب عليها النص العربي
  const r = countRe(all, STRONG_R), l = countRe(all, STRONG_L);
  const rtl = /[=√×÷]/.test(all) && l > 0 ? r > l * 2 : r >= l;
  const out = rtl ? tokens.slice().reverse() : tokens.slice();
  // إعادة ترتيب المقاطع ذات الاتجاه المعاكس داخل السطر
  const opposite = (t) => (rtl ? t.dir !== "R" : t.dir === "R");
  for (let i = 0; i < out.length; ) {
    if (!opposite(out[i])) { i++; continue; }
    let j = i;
    while (j + 1 < out.length && (opposite(out[j + 1]) || (!rtl && out[j + 1].dir === "N" && j + 2 < out.length && opposite(out[j + 2])))) j++;
    out.splice(i, j - i + 1, ...out.slice(i, j + 1).reverse());
    i = j + 1;
  }
  // الأقواس في السطر العربي تظهر معكوسة بصرياً
  const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };
  const mirror = (x) => x.replace(/[()[\]{}<>]/g, (ch) => MIRROR[ch]);
  if (rtl) for (const t of out) {
    if (t.dir === "R") t.text = mirror(t.text);
    else if (t.dir === "N") { // رقم أو رمز: علامات الترقيم على الطرفين تنتقل للجهة المقابلة
      const m = t.text.match(/^([^0-9\u0660-\u0669A-Za-z]*)(.*?)([^0-9\u0660-\u0669A-Za-z]*)$/);
      if (m) t.text = mirror(m[3].split("").reverse().join("")) + m[2] + mirror(m[1].split("").reverse().join(""));
    }
  }
  return out.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim().normalize("NFKC");
}
