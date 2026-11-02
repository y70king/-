// مُخطِّط المعلم — واجهة المستخدم
const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const VIEW_TITLES = { daily: "الخطة اليومية", weekly: "الخطة الأسبوعية", monthly: "الخطة الشهرية", yearly: "الخطة السنوية" };

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("tp_" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tp_" + k, JSON.stringify(v)); } catch {} },
};

const state = {
  teacher: store.get("teacher", {}),
  book: store.get("book", null),
  lessons: store.get("lessons", []),
  summaries: store.get("summaries", {}),
  view: "daily",
  cursor: { daily: 0, weekly: 0, monthly: 0 },
  ai: false,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
const fmtHijri = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
const fmtMonth = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
const pages = (l) => (l.start_page === l.end_page ? `ص ${l.start_page}` : `ص ${l.start_page} – ${l.end_page}`);
const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ في الخادم");
  return data;
}

// ------------------------------------------------------------ بيانات المدرس
const TEACHER_FIELDS = { tName: "name", tSubject: "subject", tGrade: "grade", tSchool: "school", tYear: "year" };
function loadTeacher() { for (const [id, k] of Object.entries(TEACHER_FIELDS)) $(id).value = state.teacher[k] || ""; }
$("saveTeacher").onclick = () => {
  for (const [id, k] of Object.entries(TEACHER_FIELDS)) state.teacher[k] = $(id).value.trim();
  store.set("teacher", state.teacher);
  $("teacherSaved").textContent = "✔ تم الحفظ";
  setTimeout(() => ($("teacherSaved").textContent = ""), 2000);
  render();
};

// ------------------------------------------------------------ رفع الكتاب
function showBook() {
  if (!state.book) return;
  $("dropText").textContent = `📕 ${state.book.filename}`;
  $("bookInfo").innerHTML = `عدد الصفحات: <b>${state.book.pages}</b>` +
    (state.book.has_text ? "" : " — ⚠️ الكتاب يبدو مصوّراً (بدون نص)، الشرح يحتاج تفعيل الذكاء الاصطناعي.");
  if (!$("endPage").value) $("endPage").value = state.book.pages;
}
async function uploadBook(file) {
  if (!file) return;
  $("dropText").textContent = "⏳ جاري رفع الكتاب وتحليله...";
  const fd = new FormData(); fd.append("book", file);
  try {
    state.book = await api("/api/upload", { method: "POST", body: fd });
    store.set("book", state.book);
    $("endPage").value = state.book.pages;
    showBook();
  } catch (e) { $("dropText").textContent = "❌ " + e.message; }
}
$("bookFile").onchange = (e) => uploadBook(e.target.files[0]);
const drop = $("drop");
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); uploadBook(e.dataTransfer.files[0]); };

// ------------------------------------------------------------ إعدادات الخطة
const settings = store.get("settings", { ppd: 2, startPage: 1, endPage: "", startDate: new Date().toISOString().slice(0, 10), days: [0, 1, 2, 3, 4], holidays: "" });
$("studyDays").innerHTML = DAY_NAMES.map((n, i) => `<label><input type="checkbox" value="${i}" ${settings.days.includes(i) ? "checked" : ""}>${n}</label>`).join("");
$("ppd").value = settings.ppd; $("startPage").value = settings.startPage; $("endPage").value = settings.endPage;
$("startDate").value = settings.startDate; $("holidays").value = settings.holidays;

$("makePlan").onclick = async () => {
  if (!state.book) return ($("planMsg").textContent = "ارفع الكتاب أولاً");
  const s = {
    ppd: +$("ppd").value, startPage: +$("startPage").value, endPage: +$("endPage").value || state.book.pages,
    startDate: $("startDate").value, holidays: $("holidays").value,
    days: [...document.querySelectorAll("#studyDays input:checked")].map((c) => +c.value),
  };
  store.set("settings", s);
  try {
    const r = await api("/api/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: state.book.book_id, pages_per_day: s.ppd, start_page: s.startPage, end_page: s.endPage, start_date: s.startDate, study_days: s.days, holidays: s.holidays }),
    });
    // نحتفظ بالشروح السابقة إذا كان نطاق الصفحات نفسه
    const old = {}; for (const l of state.lessons) if (state.summaries[l.index]) old[`${l.start_page}-${l.end_page}`] = state.summaries[l.index];
    state.lessons = r.lessons; state.summaries = {};
    for (const l of state.lessons) { const k = `${l.start_page}-${l.end_page}`; if (old[k]) state.summaries[l.index] = old[k]; }
    store.set("lessons", state.lessons); store.set("summaries", state.summaries);
    state.cursor = { daily: 0, weekly: 0, monthly: 0 };
    const last = state.lessons[state.lessons.length - 1];
    $("planMsg").textContent = `✔ ${state.lessons.length} درساً، تنتهي في ${fmtDate(last.date)}`;
    render();
    $("planCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) { $("planMsg").textContent = "❌ " + e.message; }
};

// ------------------------------------------------------------ الشرح والتلخيص
async function summarize(lesson) {
  const s = await api("/api/summarize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: state.book.book_id, start_page: lesson.start_page, end_page: lesson.end_page, subject: state.teacher.subject, grade: state.teacher.grade }),
  });
  state.summaries[lesson.index] = s;
  store.set("summaries", state.summaries);
  return s;
}
window.summarizeOne = async (idx, btn) => {
  btn.disabled = true; btn.textContent = "⏳ جاري الشرح...";
  try { await summarize(state.lessons.find((l) => l.index === idx)); render(); }
  catch (e) { btn.disabled = false; btn.textContent = "❌ " + e.message; }
};
$("summarizeAll").onclick = async () => {
  const todo = state.lessons.filter((l) => !state.summaries[l.index]);
  if (!todo.length) return alert("كل الدروس مشروحة بالفعل");
  const btn = $("summarizeAll"); btn.disabled = true;
  const bar = $("progress"); bar.hidden = false;
  let done = 0, failed = 0;
  for (const l of todo) {
    bar.querySelector("span").textContent = `جاري شرح الدرس ${l.index} (${done}/${todo.length})`;
    try { await summarize(l); } catch { failed++; }
    done++;
    bar.querySelector("div").style.width = `${(100 * done) / todo.length}%`;
    if (done % 3 === 0) render();
  }
  bar.querySelector("span").textContent = `✔ اكتمل (${done - failed}/${todo.length})` + (failed ? ` — فشل ${failed}` : "");
  btn.disabled = false; render();
};

// ------------------------------------------------------------ العرض
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  state.view = b.dataset.view; render();
}));

function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); }
  return [...m.entries()];
}
function navBar(label, view, max) {
  const c = state.cursor[view];
  $("nav").innerHTML = `<button class="btn small" ${c <= 0 ? "disabled" : ""} onclick="moveCursor('${view}',-1)">→ السابق</button>
    <strong>${label}</strong>
    <button class="btn small" ${c >= max - 1 ? "disabled" : ""} onclick="moveCursor('${view}',1)">التالي ←</button>`;
}
window.moveCursor = (view, d) => { state.cursor[view] += d; render(); };

function printHeader(subtitle) {
  const t = state.teacher;
  $("printHeader").innerHTML = `<h1>${VIEW_TITLES[state.view]}${subtitle ? " — " + esc(subtitle) : ""}</h1>
    <table><tr><td><b>المدرسة:</b> ${esc(t.school)}</td><td><b>المدرس:</b> ${esc(t.name)}</td><td><b>المادة:</b> ${esc(t.subject)}</td></tr>
    <tr><td><b>الصف:</b> ${esc(t.grade)}</td><td><b>العام/الفصل:</b> ${esc(t.year)}</td><td><b>الكتاب:</b> ${esc(state.book?.filename)}</td></tr></table>`;
}

function lessonCard(l) {
  const s = state.summaries[l.index];
  let body;
  if (!s) {
    body = `<p class="empty">لم يتم إنشاء الشرح بعد. <button class="btn small" onclick="summarizeOne(${l.index}, this)">✨ اشرح هذا الدرس</button></p>`;
  } else {
    body = `${s.warning ? `<p class="warn">${esc(s.warning)}</p>` : ""}
      ${s.objectives?.length ? `<h4>🎯 الأهداف</h4>${list(s.objectives)}` : ""}
      <h4>📖 الشرح</h4><div class="explain">${esc(s.explanation)}</div>
      ${s.key_points?.length ? `<h4>📌 أهم النقاط</h4>${list(s.key_points)}` : ""}
      ${s.keywords?.length ? `<h4>🔑 المصطلحات</h4><div>${s.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div>` : ""}
      ${s.activities?.length ? `<h4>🧩 أنشطة مقترحة</h4>${list(s.activities)}` : ""}
      ${s.questions?.length ? `<h4>❓ أسئلة التقويم</h4>${list(s.questions)}` : ""}
      <p class="src">${s.source === "ai" ? "شرح بالذكاء الاصطناعي" : "تلخيص تلقائي محلي"}
      <button class="btn small" onclick="redo(${l.index}, this)">🔄 إعادة</button></p>`;
  }
  return `<article class="lesson">
    <h3>الدرس ${l.index}${s?.title ? ": " + esc(s.title) : ""}</h3>
    <div class="meta">📅 ${l.day_name} ${fmtDate(l.date)} <small>(${fmtHijri(l.date)})</small> — 📄 ${pages(l)} — الأسبوع ${l.week}</div>
    ${body}</article>`;
}
window.redo = (idx, btn) => { delete state.summaries[idx]; summarizeOne(idx, btn); };

function lessonsTable(ls, withDetails) {
  return `<table><thead><tr><th>#</th><th>اليوم والتاريخ</th><th>الصفحات</th><th>عنوان الدرس</th>${withDetails ? "<th>الأهداف</th><th>التقويم</th>" : ""}<th class="no-print">ملاحظات</th></tr></thead><tbody>
    ${ls.map((l) => { const s = state.summaries[l.index] || {}; return `<tr><td>${l.index}</td><td>${l.day_name}<br><small>${fmtDate(l.date)}</small></td><td>${pages(l)}</td>
      <td>${esc(s.title || "—")}</td>${withDetails ? `<td>${list((s.objectives || []).slice(0, 3))}</td><td>${list((s.questions || []).slice(0, 2))}</td>` : ""}
      <td class="no-print">${s.explanation ? "✔ مشروح" : `<button class="btn small" onclick="summarizeOne(${l.index}, this)">✨ اشرح</button>`}</td></tr>`; }).join("")}
    </tbody></table>`;
}

function render() {
  if (!state.lessons.length) { $("planCard").hidden = true; return; }
  $("planCard").hidden = false;
  const L = state.lessons, v = $("view");
  if (state.view === "daily") {
    const c = Math.min(state.cursor.daily, L.length - 1); state.cursor.daily = c;
    const l = L[c];
    navBar(`${l.day_name} ${fmtDate(l.date)} (${c + 1}/${L.length})`, "daily", L.length);
    printHeader(`${l.day_name} ${fmtDate(l.date)}`);
    v.innerHTML = lessonCard(l);
  } else if (state.view === "weekly") {
    const weeks = groupBy(L, "week"); const c = Math.min(state.cursor.weekly, weeks.length - 1); state.cursor.weekly = c;
    const [w, ls] = weeks[c];
    const label = `الأسبوع ${w}: ${fmtDate(ls[0].date)} – ${fmtDate(ls[ls.length - 1].date)}`;
    navBar(label, "weekly", weeks.length); printHeader(label);
    v.innerHTML = lessonsTable(ls, true);
  } else if (state.view === "monthly") {
    const months = groupBy(L, "month"); const c = Math.min(state.cursor.monthly, months.length - 1); state.cursor.monthly = c;
    const [m, ls] = months[c];
    navBar(`${fmtMonth(m)} — ${ls.length} درساً`, "monthly", months.length); printHeader(fmtMonth(m));
    v.innerHTML = lessonsTable(ls, false);
  } else {
    $("nav").innerHTML = ""; printHeader("");
    const months = groupBy(L, "month");
    v.innerHTML = `<table><thead><tr><th>الشهر</th><th>عدد الدروس</th><th>الأسابيع</th><th>الصفحات</th><th>الموضوعات</th></tr></thead><tbody>
      ${months.map(([m, ls]) => `<tr><td>${fmtMonth(m)}</td><td>${ls.length}</td><td>${ls[0].week} – ${ls[ls.length - 1].week}</td>
        <td>${ls[0].start_page} – ${ls[ls.length - 1].end_page}</td>
        <td>${[...new Set(ls.map((l) => state.summaries[l.index]?.title).filter(Boolean))].map((t) => `<span class="tag">${esc(t)}</span>`).join("") || "—"}</td></tr>`).join("")}
      </tbody><tfoot><tr><th>المجموع</th><th>${L.length}</th><th>${L[L.length - 1].week} أسبوعاً</th><th>${L[0].start_page} – ${L[L.length - 1].end_page}</th><th></th></tr></tfoot></table>`;
  }
}

$("printBtn").onclick = () => window.print();
$("csvBtn").onclick = () => {
  const t = state.teacher;
  const rows = [["المدرسة", t.school], ["المدرس", t.name], ["المادة", t.subject], ["الصف", t.grade], ["العام/الفصل", t.year], [],
    ["#", "اليوم", "التاريخ", "الأسبوع", "من صفحة", "إلى صفحة", "عنوان الدرس", "الأهداف", "الشرح", "أهم النقاط", "أسئلة التقويم"]];
  for (const l of state.lessons) {
    const s = state.summaries[l.index] || {};
    rows.push([l.index, l.day_name, l.date, l.week, l.start_page, l.end_page, s.title || "", (s.objectives || []).join(" | "),
      s.explanation || "", (s.key_points || []).join(" | "), (s.questions || []).join(" | ")]);
  }
  const csv = "﻿" + rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `خطة-${t.subject || "المادة"}-${t.grade || ""}.csv`; a.click();
};

// ------------------------------------------------------------ البدء
(async () => {
  loadTeacher(); showBook(); render();
  try {
    const s = await api("/api/status"); state.ai = s.ai_enabled;
    $("aiBadge").textContent = s.ai_enabled ? "✨ الشرح الذكي مفعّل" : "تلخيص محلي (الذكاء الاصطناعي غير مفعّل)";
  } catch { $("aiBadge").textContent = "⚠️ الخادم غير متصل"; }
})();
