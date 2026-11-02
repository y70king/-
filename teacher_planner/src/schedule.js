// توزيع صفحات الكتاب على أيام الدراسة
// الأيام بترقيم JavaScript: الأحد = 0 ... السبت = 6

export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const PLAN_TYPES = { daily: "يومية", weekly: "أسبوعية", monthly: "شهرية", yearly: "سنوية" };

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** آخر يوم في فترة الخطة حسب نوعها */
export function periodEnd(planType, start, customEnd) {
  if (planType === "daily") return start;
  if (planType === "weekly") return addDays(start, 6 - start.getDay() + (start.getDay() === 6 ? 7 : 0)); // حتى السبت
  if (planType === "monthly") return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return customEnd || new Date(start.getFullYear() + (start.getMonth() >= 6 ? 1 : 0), 5, 30); // نهاية العام الدراسي (حزيران)
}

/** أيام الدراسة بين تاريخين (مع استبعاد العطل) */
export function studyDates(start, end, studyDays, holidays = new Set()) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (studyDays.includes(d.getDay()) && !holidays.has(toISO(d))) out.push(d);
  }
  return out;
}

/**
 * يبني الخطة.
 * opts: { planType, fromPage, toPage, startDate, endDate?, studyDays, holidays, mode: "auto"|"fixed", pagesPerDay }
 *  - auto : توزيع نطاق الصفحات بالتساوي على أيام الفترة (مثلاً خطة أسبوعية من ص2 إلى ص10)
 *  - fixed: عدد صفحات ثابت لكل يوم حتى نهاية النطاق
 */
export function buildPlan(opts) {
  const { planType = "weekly", mode = "auto", studyDays = [0, 1, 2, 3, 4] } = opts;
  const fromPage = Math.floor(+opts.fromPage), toPage = Math.floor(+opts.toPage);
  if (!(fromPage >= 1)) throw new Error("صفحة البداية غير صحيحة");
  if (!(toPage >= fromPage)) throw new Error("صفحة النهاية يجب أن تكون بعد صفحة البداية أو مساوية لها");
  if (!studyDays.length) throw new Error("اختر يوماً دراسياً واحداً على الأقل");
  const holidays = new Set(opts.holidays || []);
  const start = typeof opts.startDate === "string" ? fromISO(opts.startDate) : opts.startDate;
  const totalPages = toPage - fromPage + 1;

  let slots; // [{date, pages}]
  if (mode === "fixed") {
    const ppd = Math.max(1, Math.floor(+opts.pagesPerDay || 1));
    slots = [];
    let left = totalPages;
    for (let d = start, guard = 0; left > 0 && guard < 3660; d = addDays(d, 1), guard++) {
      if (studyDays.includes(d.getDay()) && !holidays.has(toISO(d))) {
        const n = Math.min(ppd, left); slots.push({ date: d, pages: n }); left -= n;
      }
    }
    if (left > 0) throw new Error("الخطة تتجاوز عشر سنوات، راجع الإعدادات");
  } else {
    const end = periodEnd(planType, start, opts.endDate ? fromISO(opts.endDate) : null);
    let dates = planType === "daily" ? [start] : studyDates(start, end, studyDays, holidays);
    if (!dates.length) throw new Error("لا توجد أيام دراسة في هذه الفترة، غيّر تاريخ البداية أو أيام الدراسة");
    if (dates.length > totalPages) dates = dates.slice(0, totalPages); // صفحة واحدة على الأقل لكل يوم
    const base = Math.floor(totalPages / dates.length), extra = totalPages % dates.length;
    slots = dates.map((date, i) => ({ date, pages: base + (i < extra ? 1 : 0) }));
  }

  const lessons = [];
  let page = fromPage, weekStart = null, week = 0;
  for (const { date, pages } of slots) {
    const sunday = toISO(addDays(date, -date.getDay()));
    if (sunday !== weekStart) { weekStart = sunday; week++; }
    lessons.push({
      index: lessons.length + 1,
      date: toISO(date),
      dayName: DAY_NAMES[date.getDay()],
      week,
      month: toISO(date).slice(0, 7),
      startPage: page,
      endPage: page + pages - 1,
    });
    page += pages;
  }
  return lessons;
}
