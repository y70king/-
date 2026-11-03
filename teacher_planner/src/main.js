import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "./style.css";

import { buildPlan, DAY_NAMES, PLAN_TYPES, periodEnd, studyDates, toISO, fromISO } from "./schedule.js";
import { openBook, rangeText, extractPagesBase64 } from "./pdfbook.js";
import { analyzeLesson } from "./analyzer.js";
import { explainWithClaude, friendlyError, DEFAULT_MODEL } from "./ai.js";
import { explainWithGemini, pickGeminiModel } from "./gemini.js";
import { buildDocModel, FONTS, monthLabel, toPdf, toWord } from "./export.js";
import { store, saveBookBytes, loadBookBytes, saveFile, idbGet, idbSet } from "./storage.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("ar-IQ", { weekday: undefined, day: "numeric", month: "long", year: "numeric" });
const fmtHijri = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
const pages = (l) => (l.startPage === l.endPage ? `ص ${l.startPage}` : `ص ${l.startPage} – ${l.endPage}`);
const img = (x) => (x?.img ? `<img src="${x.img}" alt="" width="${Math.round(x.w * 1.4)}" height="${Math.round(x.h * 1.4)}">` : "");
const list = (a) => (a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
const groupBy = (arr, key) => { const m = new Map(); for (const x of arr) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); } return [...m.entries()]; };

const DEFAULT_LETTERHEAD = "جمهورية العراق\nوزارة التربية\nالمديرية العامة للتربية في ......";

const state = {
  teacher: store.get("teacher", { letterhead: DEFAULT_LETTERHEAD }),
  settings: { theme: "auto", provider: "", apiKey: "", model: DEFAULT_MODEL, geminiKey: "", geminiModel: "", ...store.get("settings", {}) },
  book: store.get("book", null), // {name, pages}
  plan: store.get("plan", null), // {planType, lessons, opts}
  summaries: {}, // تُحمَّل من IndexedDB (فيها صور)
  view: "weekly",
  cursor: { daily: 0, weekly: 0, monthly: 0 },
  bytes: null, doc: null,
};

// ================================================================ بيانات المدرس
const TF = { tName: "name", tSubject: "subject", tGrade: "grade", tSchool: "school", tYear: "year", tLetterhead: "letterhead" };
function loadTeacher() {
  for (const [id, k] of Object.entries(TF)) $(id).value = state.teacher[k] || "";
  const t = state.teacher;
  $("teacherSummary").textContent = [t.name, t.subject, t.grade].filter(Boolean).join(" • ");
  if (t.name && t.subject) $("teacherCard").open = false;
}
$("saveTeacher").onclick = () => {
  for (const [id, k] of Object.entries(TF)) state.teacher[k] = $(id).value.trim();
  store.set("teacher", state.teacher);
  $("teacherSaved").textContent = "✔ تم الحفظ";
  setTimeout(() => ($("teacherSaved").textContent = ""), 2000);
  loadTeacher();
};

// ================================================================ الكتاب
function showBook() {
  if (!state.book) return;
  $("dropText").textContent = `📕 ${state.book.name}`;
  $("bookInfo").innerHTML = `عدد الصفحات: <b>${state.book.pages}</b>` +
    (state.book.hasText === false ? " — ⚠️ الكتاب مصوّر (بدون نص)، الشرح يحتاج مفتاح Claude." : "");
  $("toPage").max = $("fromPage").max = state.book.pages;
  if (!$("toPage").value) $("toPage").value = state.book.pages;
}
async function ensureDoc() {
  if (state.doc) return state.doc;
  if (!state.bytes) state.bytes = await loadBookBytes();
  if (!state.bytes) throw new Error("ارفع ملف الكتاب من جديد");
  state.doc = await openBook(state.bytes);
  return state.doc;
}
$("bookFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("dropText").textContent = "⏳ جاري قراءة الكتاب...";
  try {
    state.bytes = new Uint8Array(await file.arrayBuffer());
    state.doc = await openBook(state.bytes);
    const sample = await rangeText(state.doc, 1, Math.min(5, state.doc.numPages));
    state.book = { name: file.name, pages: state.doc.numPages, hasText: sample.trim().length > 50 };
    store.set("book", state.book);
    await saveBookBytes(state.bytes);
    $("fromPage").value = 1; $("toPage").value = state.book.pages;
    showBook();
  } catch (err) {
    $("dropText").textContent = "❌ تعذّر قراءة الملف: " + (err.message || err);
  }
};

// ================================================================ إعدادات الخطة
const form = store.get("form", { planType: "weekly", mode: "auto", ppd: 2, days: [0, 1, 2, 3, 4], startDate: toISO(new Date()), endDate: "", holidays: "" });
$("studyDays").innerHTML = DAY_NAMES.map((n, i) => `<label><input type="checkbox" value="${i}" ${form.days.includes(i) ? "checked" : ""}>${n}</label>`).join("");
$("ppd").value = form.ppd; $("startDate").value = form.startDate; $("endDate").value = form.endDate; $("holidays").value = form.holidays;
document.querySelector(`input[name=mode][value=${form.mode}]`).checked = true;
setSeg("planType", form.planType);

function setSeg(id, v) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("active", b.dataset.v === v)); }
const segVal = (id) => document.querySelector(`#${id} button.active`)?.dataset.v;
document.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
  if (e.target.dataset.v) { setSeg(seg.id, e.target.dataset.v); updateHint(); }
}));
document.querySelectorAll("input[name=mode], #fromPage, #toPage, #startDate, #endDate, #ppd, #studyDays input")
  .forEach((el) => el.addEventListener("input", updateHint));

function readForm() {
  return {
    planType: segVal("planType"),
    mode: document.querySelector("input[name=mode]:checked").value,
    fromPage: +$("fromPage").value, toPage: +$("toPage").value,
    ppd: +$("ppd").value, startDate: $("startDate").value, endDate: $("endDate").value, holidays: $("holidays").value,
    days: [...document.querySelectorAll("#studyDays input:checked")].map((c) => +c.value),
  };
}
function updateHint() {
  const f = readForm();
  $("endDateWrap").hidden = !(f.planType === "yearly" && f.mode === "auto");
  $("ppd").disabled = f.mode !== "fixed";
  const n = f.toPage - f.fromPage + 1;
  if (!(n > 0) || !f.startDate) return ($("modeHint").textContent = "");
  if (f.mode === "auto") {
    const start = fromISO(f.startDate);
    const end = periodEnd(f.planType, start, f.endDate ? fromISO(f.endDate) : null);
    const days = f.planType === "daily" ? 1 : studyDates(start, end, f.days, new Set()).length;
    $("modeHint").textContent = days
      ? `ستُوزَّع ${n} صفحة (من ${f.fromPage} إلى ${f.toPage}) على ${days} يوم دراسي — حوالي ${(n / days).toFixed(1)} صفحة يومياً`
      : "لا توجد أيام دراسة في هذه الفترة";
  } else {
    $("modeHint").textContent = `${n} صفحة ÷ ${f.ppd || 1} صفحة يومياً = ${Math.ceil(n / (f.ppd || 1))} يوم دراسي`;
  }
}

$("makePlan").onclick = () => {
  const f = readForm();
  store.set("form", f);
  $("planMsg").className = "msg";
  try {
    if (state.book && f.toPage > state.book.pages) throw new Error(`الكتاب فيه ${state.book.pages} صفحة فقط`);
    const holidays = f.holidays.split(/[\s,،]+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    const lessons = buildPlan({ planType: f.planType, mode: f.mode, fromPage: f.fromPage, toPage: f.toPage, startDate: f.startDate,
      endDate: f.endDate, studyDays: f.days, holidays, pagesPerDay: f.ppd });
    // نحتفظ بالشروح السابقة للصفحات نفسها
    const old = {};
    for (const l of state.plan?.lessons || []) if (state.summaries[l.index]) old[`${l.startPage}-${l.endPage}`] = state.summaries[l.index];
    state.summaries = {};
    for (const l of lessons) { const k = `${l.startPage}-${l.endPage}`; if (old[k]) state.summaries[l.index] = old[k]; }
    state.plan = { planType: f.planType, lessons, fromPage: f.fromPage, toPage: f.toPage };
    store.set("plan", state.plan); saveSummaries();
    state.cursor = { daily: 0, weekly: 0, monthly: 0 };
    state.view = { daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "all" }[f.planType];
    const last = lessons[lessons.length - 1];
    $("planMsg").textContent = `✔ تم إنشاء خطة ${PLAN_TYPES[f.planType]}: ${lessons.length} درس، تنتهي ${fmtDate(last.date)}`;
    render();
    $("planCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    $("planMsg").className = "msg err";
    $("planMsg").textContent = "❌ " + e.message;
  }
};

// ================================================================ الشرح
function saveSummaries() { idbSet("summaries", state.summaries); }

/** شرح الدرس: التحليل التلقائي بدون إنترنت دائماً، ثم Claude (إن وُجد مفتاح) لكتابة شرح أوسع */
async function summarize(lesson, onStatus) {
  const doc = await ensureDoc();
  const offline = await analyzeLesson(doc, lesson.startPage, lesson.endPage, onStatus);
  let s = offline;
  const st = state.settings;
  const provider = st.provider || (st.apiKey ? "claude" : "");
  if (provider === "claude" && st.apiKey || provider === "gemini" && st.geminiKey) {
    onStatus?.("كتابة الشرح بالذكاء الاصطناعي...");
    try {
      const pdfBase64 = await extractPagesBase64(state.bytes, lesson.startPage, lesson.endPage);
      const args = { pdfBase64, startPage: lesson.startPage, endPage: lesson.endPage, subject: state.teacher.subject, grade: state.teacher.grade };
      const ai = provider === "gemini"
        ? await explainWithGemini({ apiKey: st.geminiKey, model: st.geminiModel, ...args })
        : await explainWithClaude({ apiKey: st.apiKey, model: st.model, ...args });
      // صور القوانين والأمثلة تبقى من الكتاب نفسه
      s = { ...ai, laws: offline.laws, examples: offline.examples, source: provider === "gemini" ? "gemini" : "ai" };
    } catch (e) {
      s = { ...offline, warning: `تعذّر الشرح بالذكاء الاصطناعي (${friendlyError(e)}) — تم استخدام التحليل التلقائي.` };
    }
  }
  state.summaries[lesson.index] = s;
  saveSummaries();
  return s;
}
window.summarizeOne = async (idx, btn) => {
  btn.disabled = true; btn.textContent = "⏳ جاري التحليل...";
  try { await summarize(state.plan.lessons.find((l) => l.index === idx), (m) => (btn.textContent = "⏳ " + m)); render(); }
  catch (e) { btn.disabled = false; btn.textContent = "❌ " + (e.message || e); }
};
window.redo = (idx, btn) => { delete state.summaries[idx]; window.summarizeOne(idx, btn); };

$("summarizeAll").onclick = async () => {
  const todo = state.plan.lessons.filter((l) => !state.summaries[l.index]);
  if (!todo.length) return alert("كل الدروس مشروحة بالفعل");
  const btn = $("summarizeAll"); btn.disabled = true;
  const bar = $("progress"); bar.hidden = false;
  let done = 0, failed = 0;
  for (const l of todo) {
    bar.querySelector("span").textContent = `جاري شرح الدرس ${l.index} (${done}/${todo.length})`;
    try { await summarize(l, (m) => (bar.querySelector("span").textContent = `الدرس ${l.index} (${done}/${todo.length}): ${m}`)); }
    catch (e) { console.error(e); failed++; }
    done++;
    bar.querySelector("div").style.width = `${(100 * done) / todo.length}%`;
    if (done % 3 === 0) render();
  }
  bar.querySelector("span").textContent = `✔ اكتمل (${done - failed}/${todo.length})` + (failed ? ` — فشل ${failed}` : "");
  btn.disabled = false; render();
};

// ================================================================ العرض
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { state.view = b.dataset.view; render(); }));
window.moveCursor = (v, d) => { state.cursor[v] += d; render(); };

function navBar(label, view, max) {
  const c = state.cursor[view];
  $("nav").innerHTML = `<button class="btn small" ${c <= 0 ? "disabled" : ""} onclick="moveCursor('${view}',-1)">→</button>
    <strong>${label}</strong>
    <button class="btn small" ${c >= max - 1 ? "disabled" : ""} onclick="moveCursor('${view}',1)">←</button>`;
}

function lessonCard(l) {
  const s = state.summaries[l.index];
  const body = !s
    ? `<p class="empty">لم يُنشأ الشرح بعد. <button class="btn small" onclick="summarizeOne(${l.index}, this)">✨ اشرح هذا الدرس</button></p>`
    : `${s.warning ? `<p class="warn">${esc(s.warning)}</p>` : ""}
      ${s.objectives?.length ? `<h4>🎯 الأهداف</h4>${list(s.objectives)}` : ""}
      <h4>📖 الشرح</h4><div class="explain">${esc(s.explanation)}</div>
      ${s.laws?.length ? `<h4>📐 القوانين والعلاقات (من الكتاب)</h4>${s.laws.map((x) => `<figure class="crop"><figcaption>${esc(x.label)}</figcaption>${img(x)}${x.note ? `<small>${esc(x.note)}</small>` : ""}</figure>`).join("")}` : ""}
      ${s.examples?.length ? `<h4>✏️ أمثلة محلولة (من الكتاب)</h4>${s.examples.map((x) => `<figure class="crop"><figcaption>${esc(x.label)}</figcaption>${img(x)}</figure>`).join("")}` : ""}
      ${s.key_points?.length ? `<h4>📌 أهم النقاط</h4>${list(s.key_points)}` : ""}
      ${s.keywords?.length ? `<h4>🔑 المصطلحات</h4><div>${s.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div>` : ""}
      ${s.activities?.length ? `<h4>🧩 أنشطة مقترحة</h4>${list(s.activities)}` : ""}
      ${s.questions?.length ? `<h4>❓ أسئلة التقويم</h4><ul>${s.questions.map((q) => `<li>${typeof q === "string" ? esc(q) : img(q)}</li>`).join("")}</ul>` : ""}
      <p class="src">${{ ai: "شرح بكلود + صور من الكتاب", gemini: "شرح بجيميناي + صور من الكتاب", "offline-ocr": "تحليل تلقائي بدون إنترنت (مع قراءة الصفحات المصوّرة)" }[s.source] || "تحليل تلقائي بدون إنترنت"}
      <button class="btn small" onclick="redo(${l.index}, this)">🔄 إعادة</button></p>`;
  return `<article class="lesson"><h3>الدرس ${l.index}${s?.title ? ": " + esc(s.title) : ""}</h3>
    <div class="meta">📅 ${l.dayName} ${fmtDate(l.date)} <small>(${fmtHijri(l.date)})</small> — 📄 ${pages(l)}</div>${body}</article>`;
}

function lessonsTable(ls) {
  return `<div class="tablewrap"><table><thead><tr><th>ت</th><th>اليوم</th><th>الصفحات</th><th>عنوان الدرس</th><th></th></tr></thead><tbody>
    ${ls.map((l) => { const s = state.summaries[l.index] || {}; return `<tr><td>${l.index}</td><td>${l.dayName}<br><small>${fmtDate(l.date)}</small></td>
      <td>${pages(l)}</td><td>${esc(s.title || "—")}</td>
      <td>${s.explanation ? `<button class="btn small" onclick="openDay(${l.index})">عرض</button>` : `<button class="btn small" onclick="summarizeOne(${l.index}, this)">✨ اشرح</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>`;
}
window.openDay = (idx) => { state.cursor.daily = state.plan.lessons.findIndex((l) => l.index === idx); state.view = "daily"; render(); };

/** الدروس المعروضة حالياً + وصفها (يُستخدم للتصدير أيضاً) */
function currentSlice() {
  const L = state.plan.lessons;
  if (state.view === "daily") {
    const c = (state.cursor.daily = Math.max(0, Math.min(state.cursor.daily, L.length - 1)));
    return { lessons: [L[c]], label: `${L[c].dayName} ${fmtDate(L[c].date)}`, count: L.length, idx: c };
  }
  if (state.view === "weekly") {
    const g = groupBy(L, "week"); const c = (state.cursor.weekly = Math.max(0, Math.min(state.cursor.weekly, g.length - 1)));
    return { lessons: g[c][1], label: `الأسبوع ${c + 1}`, count: g.length, idx: c };
  }
  if (state.view === "monthly") {
    const g = groupBy(L, "month"); const c = (state.cursor.monthly = Math.max(0, Math.min(state.cursor.monthly, g.length - 1)));
    return { lessons: g[c][1], label: `شهر ${monthLabel(g[c][0])}`, count: g.length, idx: c };
  }
  return { lessons: L, label: "", count: 1, idx: 0 };
}

function render() {
  if (!state.plan?.lessons?.length) { $("planCard").hidden = true; return; }
  $("planCard").hidden = false;
  const p = state.plan;
  $("planTitle").textContent = `الخطة ${PLAN_TYPES[p.planType]} — الصفحات ${p.fromPage} إلى ${p.toPage}`;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  const sl = currentSlice();
  const v = $("view");
  if (state.view === "daily") {
    navBar(`${sl.label} (${sl.idx + 1}/${sl.count})`, "daily", sl.count);
    v.innerHTML = lessonCard(sl.lessons[0]);
  } else if (state.view === "all") {
    $("nav").innerHTML = "";
    const L = p.lessons;
    v.innerHTML = `<div class="tablewrap"><table><thead><tr><th>الشهر</th><th>الدروس</th><th>الصفحات</th><th>الموضوعات</th></tr></thead><tbody>
      ${groupBy(L, "month").map(([m, ls]) => `<tr><td>${monthLabel(m)}</td><td>${ls.length}</td><td>${ls[0].startPage} – ${ls[ls.length - 1].endPage}</td>
        <td>${[...new Set(ls.map((l) => state.summaries[l.index]?.title).filter(Boolean))].map((t) => `<span class="tag">${esc(t)}</span>`).join("") || "—"}</td></tr>`).join("")}
      </tbody><tfoot><tr><th>المجموع</th><th>${L.length}</th><th>${L[0].startPage} – ${L[L.length - 1].endPage}</th><th>${L[L.length - 1].week} أسبوع</th></tr></tfoot></table></div>
      <h3 class="sub">كل الدروس</h3>${lessonsTable(L)}`;
  } else {
    const ls = sl.lessons;
    navBar(`${sl.label}: ${fmtDate(ls[0].date)} – ${fmtDate(ls[ls.length - 1].date)}`, state.view, sl.count);
    v.innerHTML = lessonsTable(ls);
  }
}

// تكبير صور الكتاب عند الضغط عليها
$("view").addEventListener("click", (e) => {
  if (e.target.tagName === "IMG") { $("zoomImg").src = e.target.src; $("zoomDlg").showModal(); }
});
$("zoomDlg").addEventListener("click", (e) => { if (e.target.id !== "zoomImg") $("zoomDlg").close(); });

// ================================================================ التصدير
$("expFont").innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join("");
$("expFont").value = store.get("expFont", "Simplified Arabic");
$("openExport").onclick = () => {
  const sl = currentSlice();
  const opts = [["all", `الخطة كاملة (${state.plan.lessons.length} درس)`]];
  if (state.view !== "all") opts.unshift(["current", `المعروض الآن: ${sl.label} (${sl.lessons.length} درس)`]);
  $("expScope").innerHTML = opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
  $("expMsg").textContent = "";
  $("exportDlg").showModal();
};
$("doExport").onclick = async () => {
  const btn = $("doExport"); btn.disabled = true;
  const fmt = segVal("expFormat"), font = $("expFont").value;
  store.set("expFont", font);
  try {
    const scope = $("expScope").value;
    const sl = scope === "current" ? currentSlice() : { lessons: state.plan.lessons, label: "" };
    const model = buildDocModel({ teacher: state.teacher, lessons: sl.lessons, summaries: state.summaries, planType: state.plan.planType,
      scopeLabel: sl.label, bookName: state.book?.name, includeDetails: $("expDetails").checked });
    const name = `خطة ${PLAN_TYPES[state.plan.planType]} - ${state.teacher.subject || "المادة"} - ص${sl.lessons[0].startPage}-${sl.lessons[sl.lessons.length - 1].endPage}`;
    $("expMsg").textContent = "⏳ جاري إنشاء الملف...";
    const blob = fmt === "pdf"
      ? await toPdf(model, font, (i, n) => ($("expMsg").textContent = `⏳ جاري إنشاء الصفحة ${i} من ${n}...`))
      : await toWord(model, font);
    $("expMsg").textContent = "✔ " + (await saveFile(blob, `${name}.${fmt}`));
  } catch (e) {
    $("expMsg").textContent = "❌ " + (e.message || e);
  } finally { btn.disabled = false; }
};

// ================================================================ الإعدادات
function applyTheme() {
  const t = state.settings.theme || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0f1626" : "#1f2d50";
  $("themeBtn").textContent = dark ? "☀️" : "🌙";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
$("themeBtn").onclick = () => {
  const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.hasAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  state.settings.theme = dark ? "light" : "dark"; store.set("settings", state.settings); applyTheme();
};
function showProvider() {
  const v = $("provider").value;
  $("claudeBox").hidden = v !== "claude"; $("geminiBox").hidden = v !== "gemini";
}
$("provider").onchange = showProvider;
$("openSettings").onclick = () => {
  const st = state.settings;
  $("provider").value = st.provider || (st.apiKey ? "claude" : "");
  $("apiKey").value = st.apiKey || ""; $("model").value = st.model || DEFAULT_MODEL;
  $("geminiKey").value = st.geminiKey || ""; $("geminiMsg").textContent = st.geminiModel ? `النموذج: ${st.geminiModel}` : "";
  $("theme").value = st.theme || "auto"; showProvider(); $("settingsDlg").showModal();
};
$("saveSettings").onclick = async (e) => {
  e.preventDefault();
  const gk = $("geminiKey").value.trim();
  const next = { ...state.settings, theme: $("theme").value, provider: $("provider").value,
    apiKey: $("apiKey").value.trim(), model: $("model").value.trim() || DEFAULT_MODEL, geminiKey: gk };
  if (next.provider === "gemini") {
    const msg = (t, err) => { $("geminiMsg").textContent = t; $("geminiMsg").className = err ? "msg err" : "msg"; };
    if (!gk) return msg("❌ اكتب مفتاح جيميناي أولاً", true);
    msg("⏳ جاري التحقق من المفتاح...");
    try { next.geminiModel = await pickGeminiModel(gk); }
    catch (err) { return msg("❌ " + err.message, true); }
  }
  state.settings = next; store.set("settings", next); applyTheme();
  $("settingsDlg").close();
};
$("resetAll").onclick = async () => {
  if (!confirm("سيتم حذف بيانات المدرس والكتاب والخطة والشروح. متابعة؟")) return;
  localStorage.clear(); indexedDB.deleteDatabase("teacher-planner"); location.reload();
};

// ================================================================ البدء
applyTheme(); loadTeacher(); showBook(); updateHint();
(async () => {
  state.summaries = (await idbGet("summaries")) || store.get("summaries", {}) || {};
  try { localStorage.removeItem("tp_summaries"); } catch {}
  render();
})();
