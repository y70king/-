import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/schedule.js";

const SUN_THU = [0, 1, 2, 3, 4];

test("خطة أسبوعية من ص2 إلى ص10 تتوزع على أيام الأسبوع الخمسة", () => {
  const L = buildPlan({ planType: "weekly", mode: "auto", fromPage: 2, toPage: 10, startDate: "2026-11-08", studyDays: SUN_THU });
  assert.equal(L.length, 5);
  assert.deepEqual(L.map((l) => [l.startPage, l.endPage]), [[2, 3], [4, 5], [6, 7], [8, 9], [10, 10]]);
  assert.deepEqual(L.map((l) => l.dayName), ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
});

test("الخطة الأسبوعية تبدأ من منتصف الأسبوع وتتخطى العطل", () => {
  const L = buildPlan({ planType: "weekly", mode: "auto", fromPage: 1, toPage: 6, startDate: "2026-11-10", studyDays: SUN_THU, holidays: ["2026-11-11"] });
  assert.deepEqual(L.map((l) => l.date), ["2026-11-10", "2026-11-12"]);
  assert.deepEqual(L.map((l) => [l.startPage, l.endPage]), [[1, 3], [4, 6]]);
});

test("صفحات أقل من الأيام: صفحة واحدة لكل يوم", () => {
  const L = buildPlan({ planType: "monthly", mode: "auto", fromPage: 5, toPage: 7, startDate: "2026-11-01", studyDays: SUN_THU });
  assert.deepEqual(L.map((l) => [l.startPage, l.endPage]), [[5, 5], [6, 6], [7, 7]]);
});

test("الخطة اليومية: كل الصفحات في يوم واحد", () => {
  const L = buildPlan({ planType: "daily", mode: "auto", fromPage: 12, toPage: 15, startDate: "2026-11-08", studyDays: SUN_THU });
  assert.equal(L.length, 1);
  assert.deepEqual([L[0].startPage, L[0].endPage], [12, 15]);
});

test("الشهرية تغطي أيام الدراسة المتبقية من الشهر", () => {
  const L = buildPlan({ planType: "monthly", mode: "auto", fromPage: 1, toPage: 100, startDate: "2026-11-01", studyDays: SUN_THU });
  assert.equal(L.length, 22); // أيام الأحد–الخميس في تشرين الثاني 2026
  assert.equal(L.at(-1).date, "2026-11-30");
  assert.equal(L.at(-1).endPage, 100);
});

test("عدد صفحات ثابت يستمر حتى نهاية النطاق", () => {
  const L = buildPlan({ planType: "yearly", mode: "fixed", pagesPerDay: 3, fromPage: 1, toPage: 10, startDate: "2026-11-05", studyDays: SUN_THU });
  assert.deepEqual(L.map((l) => [l.startPage, l.endPage]), [[1, 3], [4, 6], [7, 9], [10, 10]]);
  assert.deepEqual(L.map((l) => l.week), [1, 2, 2, 2]);
});

test("أخطاء الإدخال", () => {
  assert.throws(() => buildPlan({ fromPage: 10, toPage: 2, startDate: "2026-11-08", studyDays: SUN_THU }), /صفحة النهاية/);
  assert.throws(() => buildPlan({ fromPage: 1, toPage: 2, startDate: "2026-11-08", studyDays: [] }), /يوماً دراسياً/);
});
