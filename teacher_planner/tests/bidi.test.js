import { test } from "node:test";
import assert from "node:assert/strict";
import { joinLine } from "../src/bidi.js";

// يبني عناصر سطر مرئية (من اليسار لليمين) من كلمات: كل حرف عنصر مستقل كما تفعل pdf.js
function visual(words) {
  const items = []; let x = 0;
  for (const w of words) {
    for (const ch of w) { items.push({ str: ch, x0: x, x1: x + 5, h: 10 }); x += 5; }
    x += 6; // مسافة بين الكلمات
  }
  return items;
}
const rev = (s) => [...s].reverse().join("");

test("سطر عربي: الكلمات من اليمين لليسار", () => {
  // بصرياً: الكلمة الأخيرة في اليسار وحروفها معكوسة
  assert.equal(joinLine(visual([rev("المثلث"), rev("زاوية"), rev("قياس")])), "قياس زاوية المثلث");
});

test("رقم داخل سطر عربي يبقى بترتيبه", () => {
  assert.equal(joinLine(visual([rev("درجة"), "90", rev("قياسها")])), "قياسها 90 درجة");
});

test("معادلة إنجليزية مع كلمة عربية", () => {
  assert.equal(joinLine(visual(["c", "=", "5", rev("سم")])), "c = 5 سم");
});

test("ترقيم التمارين في السطر العربي", () => {
  assert.equal(joinLine(visual([rev("مثلث"), rev("قائم"), "(1"])), "1) قائم مثلث".replace("قائم مثلث", "قائم مثلث"));
});

test("الحركات تلتصق بالحرف الصحيح", () => {
  const items = visual([rev("مترا")]);
  const alef = items[0]; // الألف في أقصى اليسار
  items.push({ str: "ً", x0: alef.x0 + 1, x1: alef.x0 + 4, h: 10 });
  assert.equal(joinLine(items), "متراً");
});
