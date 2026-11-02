// المحلل التلقائي بدون إنترنت:
// يقرأ صفحات الدرس ويستخرج العنوان، التعاريف، القوانين، الأمثلة المحلولة، والتمارين من الكتاب نفسه.
// القوانين والمعادلات والأمثلة تُقص كصور من الصفحة كما هي، فتبقى مطابقة للكتاب 100%.
import { pageLines, renderPage } from "./pdfbook.js";
import { ocrLines } from "./ocr.js";
import { localSummary } from "./summary.js";

const SCALE = 2.5; // دقة رسم الصفحة للقص والتعرف الضوئي

const KW = {
  lesson: /^(الدرس|الدّرس|الوحدة|الفصل|الموضوع|درس)/,
  law: /^(ال)?(قانون|قوانين|نظرية|نظريّة|مبرهنة|قاعدة|علاقة|صيغة|خاصية|خاصيّة|خواص|معادلة|نتيجة|ملاحظة مهمة)/,
  def: /^(ال)?(تعريف|مفهوم)/,
  example: /^(ال)?(مثال|أمثلة|امثلة)/,
  exercise: /^(ال)?(تمارين|تمرين|أسئلة|اسئلة|تدرب|تدرّب|اختبر نفسك|مسائل|حل ما يأ|حل التمارين|أجب|اجب|تقويم|نشاط بيتي|واجب)/,
  activity: /^(ال)?(نشاط|تجربة|فكر|فكّر)/,
  item: /^\s*([\(\)]?\s*[0-9٠-٩]{1,2}\s*[\)\(\-–.:/]|س\s*[0-9٠-٩]+|[•●▪◦\-–]\s|\(?[أابجدهـو]\s*[\)\-–]\s)/,
};

const count = (s, re) => (s.match(re) || []).length;

/** نوع السطر: "math" معادلة، "frag" جزء صغير من معادلة (أس، بسط، مقام)، أو false نص عادي */
export function mathKind(line, ocr = false) {
  const t = line.text.replace(/\s+/g, "");
  if (!t) return false;
  const ar = count(t, /[ء-ي]/g);
  const la = count(t, /[A-Za-z]/g);
  const dg = count(t, /[0-9٠-٩]/g);
  const op = count(t, /[=+\-−×÷*/^√∑∏∫π≤≥≠≈<>()|²³°%∆Δθαβλμσω]/g);
  const len = t.length;
  if (ocr) {
    // التعرف الضوئي لا يقرأ المعادلات، فتظهر برموز غريبة أو بثقة منخفضة
    if (ar < len * 0.55 && (op + la + dg) >= 2) return "math";
    if ((line.conf ?? 100) < 50 && ar < len * 0.75) return "math";
    if (len <= 4 && (line.conf ?? 100) < 65) return "frag"; // بسط/مقام/أس مقروء خطأً
    return false;
  }
  if (/[=√∑∫≤≥≠≈]/.test(t) && ar < len * 0.5) return "math";
  if (op >= 2 && la + dg + op > ar) return "math";
  if (len <= 8 && ar === 0 && la + dg + op > 0) return "frag";
  return false;
}

/** يقص منطقة من الصفحة ويعيدها صورة */
function crop(canvas, box, pad = 6) {
  const x = Math.max(0, (box.x0 - pad) * SCALE), y = Math.max(0, (box.top - pad) * SCALE);
  const w = Math.min(canvas.width - x, (box.x1 - box.x0 + pad * 2) * SCALE);
  const h = Math.min(canvas.height - y, (box.bottom - box.top + pad * 2) * SCALE);
  if (w < 4 || h < 4) return null;
  const c = document.createElement("canvas");
  c.width = Math.round(w); c.height = Math.round(h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return { img: c.toDataURL("image/png"), w: Math.round(w / SCALE), h: Math.round(h / SCALE) };
}

const union = (ls) => ({
  x0: Math.min(...ls.map((l) => l.x0)), x1: Math.max(...ls.map((l) => l.x1)),
  top: Math.min(...ls.map((l) => l.top)), bottom: Math.max(...ls.map((l) => l.bottom)),
});

const clean = (s) => s.replace(/[:：.\s]+$/, "").replace(/^[\s\-–•●]+/, "").replace(/^(ال)?(تعريف|مفهوم)\s*[:\-–]?\s*/, "").trim();
const topicOf = (title) => clean(title.includes(":") ? title.split(":").slice(1).join(":") : title.replace(KW.lesson, "").replace(/^\s*\S+\s*[:\-–]?\s*/, "")) || clean(title);

/**
 * يحلل الصفحات [from..to] ويرجع شرح الدرس بنفس شكل شرح Claude مع حقول إضافية:
 * laws: [{label, img, w, h, note}], examples: [{label, img, w, h}], questions: [string | {text, img, w, h}]
 */
export async function analyzeLesson(doc, from, to, onStatus) {
  // 1) الأسطر من كل صفحة (نص الـ PDF أو التعرف الضوئي للصفحات المصوّرة)
  const pages = [];
  let usedOcr = false;
  for (let p = from; p <= Math.min(to, doc.numPages); p++) {
    onStatus?.(`قراءة الصفحة ${p}...`);
    const { lines, width, height } = await pageLines(doc, p);
    const canvas = await renderPage(doc, p, SCALE);
    const chars = lines.reduce((a, l) => a + l.text.replace(/\s/g, "").length, 0);
    let ls = lines, ocr = false;
    if (chars < 30) {
      onStatus?.(`التعرف على نص الصفحة المصوّرة ${p}... (قد يأخذ بضع ثوانٍ)`);
      try { ls = await ocrLines(canvas, SCALE); ocr = usedOcr = true; } catch (e) { console.warn("OCR failed", e); ls = []; }
    }
    ls.forEach((l) => { l.page = p; l.kind = mathKind(l, ocr); });
    pages.push({ p, canvas, width, height, lines: ls, ocr });
  }
  onStatus?.("تحليل محتوى الدرس...");
  if (globalThis.__tpDebug) for (const pg of pages) for (const l of pg.lines) console.log(`[p${pg.p}] ${l.size.toFixed(1)} ${l.kind || "-"} ${l.conf ? Math.round(l.conf) : ""} ${l.text}`);
  const all = pages.flatMap((pg) => pg.lines);
  const textSizes = all.filter((l) => !l.kind).flatMap((l) => Array(Math.min(80, l.text.length)).fill(l.size)).sort((a, b) => a - b);
  const median = textSizes[Math.floor(textSizes.length / 2)] || 12;
  const pageOf = (n) => pages.find((pg) => pg.p === n);

  // 2) تجميع أسطر المعادلات المتتالية (مع الأسس والكسور) في كتل
  for (const pg of pages) {
    const L = pg.lines;
    for (let i = 0; i < L.length; i++) {
      if (L[i].kind !== "frag") continue;
      const near = (j) => j >= 0 && j < L.length && L[j].kind === "math" && Math.abs(L[j].top - L[i].top) < Math.max(L[i].size, L[j].size) * 1.6;
      L[i].kind = near(i - 1) || near(i + 1) || near(i - 2) || near(i + 2) ? "math" : false;
    }
  }

  // 3) المرور على الأسطر وتقسيمها إلى أقسام
  const headings = [], bodyLines = [], laws = [], examples = [], exItems = [], activities = [], defs = [];
  let section = "body", current = null, pendingLaw = null, pendingLawAge = 0, pendingDef = false;
  const closeExample = () => { if (current?.type === "example" && current.lines.length) examples.push(current); };
  const startSection = (type, l) => {
    closeExample();
    section = type;
    current = type === "example" ? { type, label: clean(l.text), lines: [l] } : null;
  };

  for (let i = 0; i < all.length; i++) {
    const l = all[i];
    const t = l.text.trim();
    const isHead = !l.kind && t.length < 90 && !KW.item.test(t) && (l.size >= median * 1.12 || KW.lesson.test(t) || (t.length < 25 && KW.def.test(t)));
    if (!l.kind) {
      if (KW.example.test(t) && t.length < 60) { startSection("example", l); continue; }
      if (KW.exercise.test(t) && t.length < 70) { startSection("exercise", l); continue; }
      // سؤال مرقّم مثل "س1:" حتى لو لم يُقرأ عنوان "الأسئلة"
      if (section !== "exercise" && /^س\s*[0-9٠-٩]+\s*[:\-–)]/.test(t)) { closeExample(); section = "exercise"; current = null; }
      if (KW.activity.test(t) && t.length < 70) { startSection("activity", l); activities.push(clean(t)); continue; }
      if (isHead) {
        if (KW.def.test(t)) { pendingDef = true; startSection("body", l); continue; }
        if (KW.law.test(t)) { pendingLaw = clean(t); pendingLawAge = 0; startSection("body", l); continue; }
        headings.push(l); startSection("body", l); continue;
      }
    }
    if (section === "example") {
      // المثال يستمر حتى عنوان جديد أو قسم جديد
      current.lines.push(l);
      continue;
    }
    if (section === "exercise") {
      const last = exItems[exItems.length - 1];
      const prevLine = last?.lines[last.lines.length - 1];
      const cont = last && prevLine && prevLine.page === l.page && !KW.item.test(t) && (l.top - prevLine.bottom) < l.size * 0.9;
      if (cont) last.lines.push(l); else exItems.push({ lines: [l] });
      continue;
    }
    if (section === "activity") { if (!l.kind && t.length > 15 && activities.length < 4) activities[activities.length - 1] += " — " + t; section = "body"; continue; }

    // نص الدرس
    if (l.kind === "math") {
      const block = [l];
      while (i + 1 < all.length && all[i + 1].kind === "math" && all[i + 1].page === l.page &&
        all[i + 1].top - block[block.length - 1].bottom < l.size * 1.2) block.push(all[++i]);
      const note = i + 1 < all.length && /^(حيث|إذ|اذ|علماً|علما)/.test(all[i + 1].text.trim()) ? all[i + 1].text.trim() : "";
      if (note) i++; // سطر الشرح "حيث ..." يُعرض مع القانون
      // في الصفحات المصوّرة نقص سطر "حيث" مع القانون لأن التعرف الضوئي يخطئ في الرموز داخله
      const ocrPage = pageOf(l.page).ocr;
      if (note && ocrPage) block.push(all[i]);
      laws.push({ label: pendingLaw || "", block, note: ocrPage ? "" : note, page: l.page });
      pendingLaw = null;
      continue;
    }
    if (!l.kind && t.length < 45 && KW.law.test(t)) { pendingLaw = clean(t); pendingLawAge = 0; continue; }
    if (pendingLaw && ++pendingLawAge > 3) pendingLaw = null;
    if (pendingDef && t.length > 10) { defs.push(t); pendingDef = false; }
    bodyLines.push(l);
  }
  closeExample();

  // 4) قص الصور من الصفحات
  const lawsOut = [];
  for (const law of laws) {
    const pg = pageOf(law.page);
    const im = crop(pg.canvas, union(law.block), 8);
    if (im) lawsOut.push({ label: law.label || "علاقة رياضية", note: law.note, ...im });
  }
  const examplesOut = [];
  for (const ex of examples) {
    for (const pg of pages) { // المثال قد يمتد على صفحتين
      const ls = ex.lines.filter((x) => x.page === pg.p);
      if (!ls.length) continue;
      const pageLinesAll = pg.lines;
      const box = union(ls);
      box.x0 = Math.min(box.x0, ...pageLinesAll.map((x) => x.x0)); // عرض النص الكامل
      box.x1 = Math.max(box.x1, ...pageLinesAll.map((x) => x.x1));
      box.bottom = Math.min(box.bottom, box.top + pg.height * 0.7);
      const im = crop(pg.canvas, box, 6);
      if (im) examplesOut.push({ label: ex.label, ...im });
    }
  }
  const questions = [];
  for (const it of exItems) {
    const text = it.lines.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim();
    if (text.length < 3) continue;
    const hasMath = it.lines.some((x) => x.kind) || pageOf(it.lines[0].page).ocr && it.lines.some((x) => (x.conf ?? 100) < 70);
    if (hasMath) {
      const pg = pageOf(it.lines[0].page);
      const im = crop(pg.canvas, union(it.lines.filter((x) => x.page === pg.p)), 4);
      questions.push(im ? { text, ...im } : text);
    } else questions.push(text);
    if (questions.length >= 8) break;
  }

  // 5) العنوان والتعاريف والمصطلحات
  const lessonHeads = headings.filter((h) => KW.lesson.test(h.text));
  const titleLines = (lessonHeads.length ? lessonHeads : headings.slice(0, 1)).map((h) => h.text.trim());
  const title = titleLines.join(" / ") || (bodyLines[0]?.text || "").slice(0, 70);
  const topics = titleLines.map(topicOf).filter(Boolean);

  const bodyText = bodyLines.map((x) => x.text).join("\n");
  const flat = bodyText.replace(/\s+/g, " ");
  const terms = new Set();
  for (const d of [...defs, ...bodyLines.map((x) => x.text)]) {
    const m = d.match(/^([^:.؟]{2,40}?)\s*:\s*(?:هو|هي|هما|هم)?\s/);
    if (m && (defs.includes(d) || /:\s*(هو|هي|هما|هم)\s/.test(d))) terms.add(clean(m[1]));
  }
  for (const m of flat.matchAll(/(?:^|[.؟!]\s*)([^.:؟!]{2,35}?)\s*:\s*(?:هو|هي|هما|هم)\s/g)) terms.add(clean(m[1]));
  for (const m of flat.matchAll(/(?:تعرف|يعرف|تعرّف|يعرّف|تُعرَّف|يُعرَّف)\s+([^\s.،]+(?:\s[^\s.،]+)?)\s+(?:بأنه|بأنها|بانه|بانها)/g)) terms.add(clean(m[1]));
  for (const m of flat.matchAll(/(?:^|[.؟!]\s+)(ال[^\s.،:]{2,}(?:\s+ال[^\s.،:]{2,})?)\s+(?:هو|هي)\s/g)) terms.add(clean(m[1]));
  for (const m of flat.matchAll(/(?:يسمى|تسمى|يسمّى|تسمّى|يدعى|تدعى)\s+[^.]{0,40}?\s(ال[^\s.،]+)\s*[.،]/g)) terms.add(clean(m[1]));
  const defSentences = flat.split(/(?<=[.؟!])\s+/).filter((s) => /(هو|هي)\s|بأنه|بأنها|يسمى|تسمى|تعرف|يعرف/.test(s) && s.length < 300).slice(0, 4);

  const base = localSummary(bodyText, 6);
  const lawNames = lawsOut.map((x) => x.label).filter((x) => x && x !== "علاقة رياضية");
  const freqWords = (base.keywords || []).filter((w) => /^ال\S{3,}/.test(w)).slice(0, 4);
  const keywords = [...new Set([...terms, ...lawNames, ...freqWords])].filter((k) => k.length > 1).slice(0, 8);

  // 6) الشرح
  const parts = [];
  if (topics.length) parts.push(`يتناول هذا الدرس ${topics.join(" و")}.`);
  const keySents = [];
  for (const x of [...defSentences, ...(base.key_points || [])]) {
    const n = x.replace(/^(ال)?(تعريف|مفهوم)\s*/, "").trim();
    if (!keySents.some((k) => k.includes(n) || n.includes(k))) keySents.push(n);
    if (keySents.length >= 6) break;
  }
  if (keySents.length) parts.push(keySents.join(" "));
  const extra = [];
  if (lawsOut.length) extra.push(lawsOut.length === 1 ? "قانوناً/علاقةً رياضية واحدة" : `${lawsOut.length} من القوانين والعلاقات الرياضية`);
  if (examples.length) extra.push(examples.length === 1 ? "مثالاً محلولاً" : `${examples.length} من الأمثلة المحلولة`);
  if (questions.length) extra.push(`${questions.length} من التمارين`);
  if (extra.length) parts.push(`ويتضمن الدرس ${extra.join(" و")} (منقولة من الكتاب كما هي أدناه).`);

  // 7) الأهداف والأنشطة (قوالب تربوية حسب المحتوى المكتشف)
  const topic = topics[0] || keywords[0] || "موضوع الدرس";
  const objectives = [];
  for (const term of [...terms].slice(0, 2)) objectives.push(`أن يعرّف الطالب ${term} تعريفاً صحيحاً.`);
  for (const name of lawNames.slice(0, 2)) objectives.push(`أن يكتب الطالب صيغة ${name.replace(/^(ال)?قانون\s*/, "قانون ")} ويطبقها في حل المسائل.`);
  if (lawsOut.length && !lawNames.length) objectives.push(`أن يستخدم الطالب العلاقات الرياضية الواردة في الدرس لحل المسائل.`);
  if (examples.length || questions.length) objectives.push(`أن يحل الطالب مسائل وتمارين على ${topic}.`);
  objectives.push(`أن يوضح الطالب مفهوم ${topic} بأسلوبه الخاص.`);
  if (objectives.length < 3) objectives.push(`أن يذكر الطالب أهم الأفكار الواردة في ${topic}.`);

  const acts = [...activities.slice(0, 2)];
  if (lawsOut.length) acts.push("استنتاج القانون مع الطلبة تدريجياً من خلال مثال عددي على السبورة.");
  if (examples.length) acts.push("حل الأمثلة خطوة بخطوة بمشاركة الطلبة، ثم حل مثال مشابه.");
  if (questions.length) acts.push("تقسيم الطلبة إلى مجموعات لحل تمارين الدرس ومناقشة الحلول.");
  if (acts.length < 2) acts.push("الحوار والمناقشة وطرح الأسئلة لربط الدرس بحياة الطالب اليومية.");

  if (!questions.length) {
    for (const term of [...terms].slice(0, 2)) questions.push(`عرّف ${term}.`);
    for (const name of lawNames.slice(0, 2)) questions.push(`اكتب صيغة ${name}، ووضح معنى كل رمز فيها.`);
    if (questions.length < 2) questions.push(`وضح بأسلوبك ما تعلمته عن ${topic}.`);
  }

  const noText = !all.length;
  return {
    title,
    explanation: noText ? "لم يتمكن التطبيق من قراءة هذه الصفحات. تأكد أن ملف الكتاب واضح." : parts.join("\n"),
    objectives: objectives.slice(0, 5),
    key_points: keySents,
    keywords,
    activities: acts.slice(0, 3),
    questions,
    laws: lawsOut,
    examples: examplesOut,
    source: usedOcr ? "offline-ocr" : "offline",
  };
}
