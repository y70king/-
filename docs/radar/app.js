"use strict";
/* رادار الذهب: يجلب شموع 5 و15 دقيقة لـ PAXGUSDT من Binance كل دقيقة، يشغّل محركي الفجوات وPOC، ويتابع نتيجة كل إشارة */

const API = "https://data-api.binance.vision/api/v3/klines";
const SYMBOL = "PAXGUSDT";
const INTERVAL_MS = 30 * 1000;   // تحديث مضمون كل نص دقيقة
const TZ = "Asia/Baghdad";
const MAX_LOG = 100;
const NAMES = { fvg: "الفجوات", poc: "نقطة التحكم" };
const GRADES = { 3: "ذهبية 🥇", 2: "جيدة", 1: "خطرة ⚠️" };
const gradeBadge = g => g ? `<span class="badge g${g}">${GRADES[g]}</span>` : "";

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين غير متاح */ } },
};

let running = false, timer = null, busy = false, audio = null, wakeLock = null, filter = "all";
let pcClient = null, pcConnected = false, pcLast = null;   // وضع الحاسبة: التحليل يجي من برنامج MT5
const PC_BROKER = store.get("radarBroker", "wss://broker.hivemq.com:8884/mqtt");
const MQTT_LIB = "https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js";
const src = () => $("optSrc").value;
const pcCode = () => $("optCode").value.trim().toLowerCase();
let log = store.get("radarLog", []);
const seen = new Set(store.get("radarSeen", []));

const px = x => Number(x).toFixed(2);
const usd = x => `<span class="num">${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}$</span>`;
const usdText = x => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(2)}$`;   // للإشعارات (نص عادي)
const fmtTime = ms => new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(ms);
const fmtClock = ms => new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(ms);

function marketOpen(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours();
  return !(day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 22));
}

async function klines(interval, limit) {
  const r = await fetch(`${API}?symbol=${SYMBOL}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

function cfg() {
  return { fixedSl: Math.max(0, parseFloat($("optSl").value) || 0), fixedTp: Math.max(0, parseFloat($("optTp").value) || 0), minGrade: parseInt($("optGrade")?.value, 10) || 1 };
}

function signalBlock(s) {
  const buy = s.dir === 1;
  const extra = s.engine === "fvg"
    ? `الفجوة ${px(s.zoneBottom)} – ${px(s.zoneTop)}`
    : `الموجة ${px(s.legLo)} – ${px(s.legHi)} · نقطة التحكم ${px(s.entry)}`;
  return `
    <div class="side"><span class="dir ${buy ? "buy" : "sell"}">${buy ? "شراء ▲" : "بيع ▼"} ${gradeBadge(s.grade)}</span>
      <span class="order">${buy ? "أمر شراء معلّق" : "أمر بيع معلّق"}</span></div>
    <div class="grid">
      <div class="cell entry"><span>الدخول</span><div class="num">${px(s.entry)}</div></div>
      <div class="cell sl"><span>وقف الخسارة</span><div class="num">${px(s.sl)}</div></div>
      <div class="cell tp"><span>الهدف 1</span><div class="num">${px(s.tp1)}</div></div>
      <div class="cell tp"><span>الهدف النهائي</span><div class="num">${px(s.tp2)}</div></div>
    </div>
    <div class="extra">${extra}<br>إذا ضرب الوقف تخسر <span class="num">${px(s.risk)}$</span> بلوت 0.01</div>`;
}

function renderEngine(key, res) {
  const box = $(key === "fvg" ? "engFvg" : "engPoc");
  if (!$(key === "fvg" ? "optFvg" : "optPoc").checked) { box.innerHTML = '<div class="idle">المحرك مطفأ من الإعدادات</div>'; return; }
  if (!res.has) { box.innerHTML = ""; const d = document.createElement("div"); d.className = "idle"; d.textContent = res.reason; box.append(d); return; }
  box.innerHTML = signalBlock(res);
}

function renderRecord() {
  for (const key of ["fvg", "poc"]) {
    const done = log.filter(s => s.engine === key && (s.state === "win" || s.state === "loss"));
    const w = done.filter(s => s.state === "win").length, l = done.length - w;
    const net = done.reduce((a, s) => a + (s.result || 0), 0);
    $(key === "fvg" ? "recFvg" : "recPoc").innerHTML = done.length ? `${w} ربح · ${l} خسارة · ${usd(net)}` : "لا نتائج بعد";
  }
}

function renderGrades() {
  const rows = [3, 2, 1].map(g => {
    const cell = key => {
      const done = log.filter(s => s.engine === key && s.grade === g && (s.state === "win" || s.state === "loss"));
      if (!done.length) return "—";
      const w = done.filter(s => s.state === "win").length;
      return `${w}/${done.length} · ${usd(done.reduce((a, s) => a + (s.result || 0), 0))}`;
    };
    return `<tr><td class="g${g}">${GRADES[g]}</td><td>${cell("fvg")}</td><td>${cell("poc")}</td></tr>`;
  });
  $("gradeTable").innerHTML = rows.join("");
}

const STATE_TXT = { pending: "بانتظار الدخول", active: "الصفقة شغالة", win: "ربح", loss: "خسارة", expired: "انتهت بدون دخول" };

function logItem(s, example = false) {
  const el = document.createElement("article");
  el.className = `item ${s.engine}${example ? " example" : ""}`;
  const st = s.state || "pending";
  const res = st === "win" || st === "loss" ? ` ${usd(s.result)}` : "";
  el.innerHTML = `
    <div class="row1"><span class="what">${gradeBadge(s.grade)} ${NAMES[s.engine]} · ${s.dir === 1 ? "شراء" : "بيع"} عند <span class="num">${px(s.entry)}</span></span>
      <span class="state ${st}">${example ? "مثال" : STATE_TXT[st] + res}</span></div>
    <div class="row2"><span>وقف <span class="num">${px(s.sl)}</span></span><span>هدف <span class="num">${px(s.tp2)}</span></span><span>${fmtTime(s.firedAt)}</span></div>`;
  return el;
}

const EXAMPLE = { engine: "poc", grade: 3, dir: 1, entry: 4148.25, sl: 4141.6, tp2: 4163.9, firedAt: Date.now() - 40 * 60000 };

function renderLog() {
  const box = $("log"); box.replaceChildren();
  const items = log.filter(s => filter === "all" || s.engine === filter);
  if (!items.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.textContent = "لا توجد إشارات بعد. كل إشارة جديدة تنحفظ هنا ويتابع التطبيق إذا دخلت وضربت الهدف أو الوقف. هذا شكلها:";
    box.append(e, logItem(EXAMPLE, true));
    return;
  }
  items.forEach(s => box.append(logItem(s)));
}

let toastTimer = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }

function beep() {
  if (!$("optSound").checked || !audio) return;
  const now = audio.currentTime;
  [0, 0.2, 0.4].forEach((dt, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = [660, 880, 1100][i];
    g.gain.setValueAtTime(0.0001, now + dt); g.gain.exponentialRampToValueAtTime(0.3, now + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.18);
    o.connect(g).connect(audio.destination); o.start(now + dt); o.stop(now + dt + 0.2);
  });
}

async function notify(title, body, tag) {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  beep();
  if (!$("optNotify").checked || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag, lang: "ar", dir: "rtl" });
    new Notification(title, { body, icon: "icon-192.png" });
  } catch { /* الصوت والاهتزاز يكفيان */ }
}

// ───────── البيانات: تحميل التاريخ مرة، وبعدها بث مباشر لحظة بلحظة ─────────
const WS_URL = "wss://data-stream.binance.vision/stream?streams=" + ["5m", "15m", "1h", "4h"].map(i => `paxgusdt@kline_${i}`).join("/");
const KEYS = { "5m": "m5", "15m": "m15", "1h": "h1", "4h": "h4" };
const LIMITS = { m5: 600, m15: 300, h1: 300, h4: 300 };
let frames = null, ws = null, wsRetry = 0, live = false, lastTick = 0, lastAnalyze = 0, resyncTimer = null, clockTimer = null;

async function loadHistory() {
  const [m5, m15, h1, h4] = await Promise.all([klines("5m", LIMITS.m5), klines("15m", LIMITS.m15), klines("1h", LIMITS.h1), klines("4h", LIMITS.h4)]);
  frames = { m5, m15, h1, h4 };
  lastTick = Date.now();
}

// تحديث كامل (عند التشغيل، بعد انقطاع، أو كل 10 دقائق للاحتياط)
async function check() {
  if (busy) return; busy = true;
  try { await loadHistory(); analyzeNow(); }
  catch (e) { showError(e); }
  finally { busy = false; }
}

function showError(e) {
  $("lastcheck").textContent = e instanceof TypeError && /fetch|network|load/i.test(e.message) || /^HTTP/.test(e.message) ? "تعذر جلب الأسعار. تأكد من الإنترنت، وراح يعيد المحاولة تلقائياً." : "صار خلل بالتطبيق. سكّره وافتحه مرة ثانية حتى يتحدّث.";
}

// شمعة جديدة أو تحديث لشمعة قائمة من البث المباشر
function onKline(k) {
  const key = KEYS[k.i]; if (!frames || !key) return;
  const arr = frames[key], bar = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
  const last = arr[arr.length - 1];
  if (bar.time === last.time) arr[arr.length - 1] = bar;
  else if (bar.time > last.time) { arr.push(bar); if (arr.length > LIMITS[key]) arr.shift(); }
  else return;
  lastTick = Date.now();
  if (key === "m5") $("price").textContent = px(bar.close);   // السعر يتحرك مباشرة
  // التحليل: فوراً عند سكرة شمعة 5 دقائق (وقت تكوّن الإشارات)، وغير ذلك كل نص دقيقة
  if ((key === "m5" && k.x) || Date.now() - lastAnalyze >= INTERVAL_MS) analyzeNow();
}

function connect() {
  if (!running || ws) return;
  try { ws = new WebSocket(WS_URL); } catch { ws = null; return scheduleReconnect(); }
  ws.onopen = async () => { wsRetry = 0; live = true; setStateChip(); try { await loadHistory(); analyzeNow(); } catch (e) { showError(e); } };
  ws.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.data && m.data.k) onKline(m.data.k); } catch { /* رسالة غير مفهومة */ } };
  ws.onclose = () => { ws = null; live = false; setStateChip(); scheduleReconnect(); };
  ws.onerror = () => { try { ws && ws.close(); } catch { /* مغلق أصلاً */ } };
}

function scheduleReconnect() {
  if (!running) return;
  const wait = Math.min(30, 2 ** wsRetry++) * 1000;
  setTimeout(() => { if (running && !ws) { connect(); if (!live) check(); } }, wait);   // نحدّث بالطريقة العادية لحين رجوع البث
}

function analyzeNow() {
  if (!frames) return;
  lastAnalyze = Date.now();
  const { m5, m15, h1, h4 } = frames;
  try {
    const price = m5[m5.length - 1].close, open = marketOpen();
    $("price").textContent = px(price);
    $("market").textContent = open ? "السوق مفتوح" : "السوق مغلق (عطلة)";

    const r = Radar.analyze(m5, { m15, h1, h4 }, cfg());
    const show = (id, d, none) => { const el = $(id); el.textContent = d === 1 ? "صاعد ▲" : d === -1 ? "هابط ▼" : none; el.className = "trend " + (d === 1 ? "up" : d === -1 ? "down" : ""); };
    show("tfH4", r.trends.h4, "محايد"); show("tfH1", r.trends.h1, "محايد"); show("tfM15", r.trends.m15, "محايد");
    const gb = $("tfBias"); gb.textContent = r.grade ? GRADES[r.grade] : "ماكو اتجاه"; gb.className = r.grade ? "g" + r.grade : "";
    renderEngine("fvg", r.fvg); renderEngine("poc", r.poc);

    // إشارات جديدة
    for (const key of ["fvg", "poc"]) {
      const s = r[key];
      if (!s.has || seen.has(s.id) || !$(key === "fvg" ? "optFvg" : "optPoc").checked) continue;
      seen.add(s.id);
      if (!open) continue;
      const rec = { id: s.id, engine: key, dir: s.dir, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, risk: s.risk, grade: s.grade, time: m5[m5.length - 2].time, firedAt: Date.now(), state: "pending" };
      log.unshift(rec);
      notify(`${GRADES[s.grade]} · ${NAMES[key]}: ${s.dir === 1 ? "شراء ▲" : "بيع ▼"} عند ${px(s.entry)}`, `وقف ${px(s.sl)} · هدف ${px(s.tp2)} · خسارة محتملة ${px(s.risk)}$`, s.id);
    }

    // متابعة نتائج الإشارات المفتوحة
    log = log.map(s => {
      if (s.state === "win" || s.state === "loss" || s.state === "expired") return s;
      const t = Radar.track(s, m5);
      if (t.state !== s.state && (t.state === "win" || t.state === "loss"))
        notify(`${NAMES[s.engine]}: ${t.state === "win" ? "ضربت الهدف ✅" : "ضربت الوقف ❌"}`, `${usdText(t.result)} على لوت 0.01`, s.id + "-r");
      return t;
    }).slice(0, MAX_LOG);
    store.set("radarLog", log); store.set("radarSeen", [...seen].slice(-300));
    renderLog(); renderRecord(); renderGrades(); setStateChip();
  } catch (e) { showError(e); }
}

// سطر الحالة: كم ثانية مرّت على آخر سعر
function tickClock() {
  if (!running) return;
  if (src() === "pc") {
    if (!pcConnected) { $("lastcheck").textContent = "🟡 يحاول يتصل بالحاسبة..."; return; }
    if (!pcLast) { $("lastcheck").textContent = "🟡 متصل، ينتظر أول تحليل من الحاسبة. تأكد إن برنامج الرادار شغال"; return; }
    const age = Math.round((Date.now() - pcLast.t) / 1000);
    $("lastcheck").textContent = age > 90
      ? `🟡 الحاسبة ما أرسلت من ${Math.round(age / 60)} دقيقة. تأكد إن برنامج الرادار وMT5 شغالين`
      : `🟢 متصل بالحاسبة · ${pcLast.src} · آخر تحليل قبل ${age} ثانية`;
    return;
  }
  const sec = Math.max(0, Math.round((Date.now() - lastAnalyze) / 1000));
  const next = Math.max(0, Math.round((INTERVAL_MS - (Date.now() - lastAnalyze)) / 1000));
  $("lastcheck").textContent = `${live ? "🟢 السعر مباشر" : "🟡 السعر كل نص دقيقة"} · آخر تحليل قبل ${sec} ثانية · التالي بعد ${next} ثانية`;
}

function setStateChip() {
  const c = $("state");
  if (!running) { c.textContent = "متوقف"; c.className = "chip"; return; }
  const isOpen = src() === "pc" ? (pcLast ? pcLast.open : true) : marketOpen();
  if (!isOpen) { c.textContent = "يعمل · السوق مغلق"; c.className = "chip closed"; return; }
  c.textContent = src() === "pc" ? (pcConnected ? "متصل بالحاسبة" : "يتصل...") : (live ? "مباشر" : "يعمل"); c.className = "chip on";
}

async function keepAwake() {
  if (!running || !$("optAwake").checked || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch { wakeLock = null; }
}

async function start() {
  if (running) return;
  running = true; store.set("radarRunning", true);   // يتذكر إنه شغال حتى بعد تحديث الصفحة
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { audio = null; }   // بدون انتظار: الصوت يتفعّل مع أول لمسة
  $("toggle").textContent = "■ إيقاف"; $("toggle").classList.add("running");
  setStateChip(); keepAwake();
  clockTimer = setInterval(tickClock, 1000);
  if (src() === "pc") return startPc();
  await check();
  connect();
  timer = setInterval(check, INTERVAL_MS);                                // تحديث كامل مضمون كل نص دقيقة
  resyncTimer = setInterval(check, 10 * 60 * 1000);                       // مزامنة كاملة كل 10 دقائق
}

function stop() {
  running = false; live = false; store.set("radarRunning", false);
  [timer, resyncTimer, clockTimer].forEach(clearInterval); timer = resyncTimer = clockTimer = null;
  if (ws) { ws.onclose = null; try { ws.close(); } catch { /* مغلق */ } ws = null; }
  if (pcClient) { try { pcClient.end(true); } catch { /* مغلق */ } pcClient = null; pcConnected = false; }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $("toggle").textContent = "▶ تشغيل"; $("toggle").classList.remove("running");
  setStateChip(); $("lastcheck").textContent = "متوقف. اضغط تشغيل لبدء المتابعة المباشرة";
}

// ───────── وضع الحاسبة: يستلم تحليل MT5 من برنامج الرادار عن طريق MQTT ─────────
function loadMqtt() {
  if (window.mqtt) return Promise.resolve();
  return new Promise((ok, fail) => {
    const sc = document.createElement("script"); sc.src = MQTT_LIB; sc.onload = ok; sc.onerror = () => fail(new Error("mqtt"));
    document.head.append(sc);
  });
}

async function startPc() {
  if (!pcCode()) { $("lastcheck").textContent = "اكتب رمز الربط بالإعدادات (يطلع على شاشة برنامج الحاسبة)"; return; }
  try { await loadMqtt(); } catch { $("lastcheck").textContent = "تعذر تحميل أداة الاتصال. تأكد من الإنترنت وافتح التطبيق مرة ثانية"; return; }
  if (!running || src() !== "pc") return;
  const topic = `goldradar/${pcCode()}/state`;
  pcClient = window.mqtt.connect(PC_BROKER, { reconnectPeriod: 3000, connectTimeout: 15000, clientId: "radar-phone-" + Math.random().toString(16).slice(2, 10), clean: true });
  pcClient.on("connect", () => { pcConnected = true; pcClient.subscribe(topic, { qos: 1 }); setStateChip(); tickClock(); });
  pcClient.on("close", () => { pcConnected = false; setStateChip(); });
  pcClient.on("message", (t, buf) => {
    try { const p = JSON.parse(new TextDecoder().decode(buf)); if (p && p.v === 1) renderPc(p); } catch { /* رسالة غير مفهومة */ }
  });
}

function renderPc(p) {
  const prev = new Map(log.map(s => [s.id, s.state]));
  pcLast = p;
  $("price").textContent = px(p.price);
  $("market").textContent = `${p.src} · ${p.open ? "السوق مفتوح" : "السوق مغلق"}`;
  const show = (id, d, none) => { const el = $(id); el.textContent = d === 1 ? "صاعد ▲" : d === -1 ? "هابط ▼" : none; el.className = "trend " + (d === 1 ? "up" : d === -1 ? "down" : ""); };
  show("tfH4", p.trends.h4, "محايد"); show("tfH1", p.trends.h1, "محايد"); show("tfM15", p.trends.m15, "محايد");
  const gb = $("tfBias"); gb.textContent = p.grade ? GRADES[p.grade] : "ماكو اتجاه"; gb.className = p.grade ? "g" + p.grade : "";
  const minG = parseInt($("optGrade").value, 10) || 1;
  for (const key of ["fvg", "poc"]) {
    const s = Object.assign({ engine: key }, p[key]);
    if (s.has && s.grade < minG) Object.assign(s, { has: false, reason: "الإشارة أقل من الدرجة المختارة بالإعدادات" });
    renderEngine(key, s);
  }
  // السجل يجي من الحاسبة (هي اللي تتابع النتائج على أسعار MT5)
  log = p.log.map(e => Object.assign({}, e, { tp1: e.tp2 }));
  for (const s of log) {
    const was = prev.get(s.id);
    const on = $(s.engine === "fvg" ? "optFvg" : "optPoc").checked && s.grade >= minG;
    if (!on) continue;
    if (was === undefined && !seen.has(s.id) && Date.now() - s.firedAt < 10 * 60e3) {
      seen.add(s.id);
      notify(`${GRADES[s.grade]} · ${NAMES[s.engine]}: ${s.dir === 1 ? "شراء ▲" : "بيع ▼"} عند ${px(s.entry)}`, `وقف ${px(s.sl)} · هدف ${px(s.tp2)} · خسارة محتملة ${px(s.risk)}$`, s.id);
    } else if (was && was !== s.state && (s.state === "win" || s.state === "loss")) {
      notify(`${NAMES[s.engine]}: ${s.state === "win" ? "ضربت الهدف ✅" : "ضربت الوقف ❌"}`, `${usdText(s.result)} على لوت 0.01`, s.id + "-r");
    }
  }
  store.set("radarLog", log); store.set("radarSeen", [...seen].slice(-300));
  renderLog(); renderRecord(); renderGrades(); setStateChip(); tickClock();
}

function applySource() {
  const pc = src() === "pc";
  $("codeRow").hidden = !pc;
  document.querySelectorAll(".netOnly").forEach(el => { el.hidden = pc; });
  $("codeHint").textContent = pcCode()
    ? `للإشعارات والهاتف مقفول: اشترك بتطبيق ntfy بـ goldradar-${pcCode()}`
    : "يطلع على شاشة برنامج الحاسبة";
}
["optSrc", "optCode"].forEach(id => $(id).addEventListener("change", () => {
  store.set(id, $(id).value); applySource();
  if (running) { stop(); start(); }          // نعيد التشغيل على المصدر الجديد
}));
["optSrc", "optCode"].forEach(id => { const v = store.get(id, null); if (v !== null) $(id).value = v; });
applySource();

$("toggle").addEventListener("click", () => (running ? stop() : start()));
$("clear").addEventListener("click", () => { log = []; store.set("radarLog", []); renderLog(); renderRecord(); renderGrades(); toast("تم مسح السجل"); });
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  renderLog();
}));

$("optNotify").addEventListener("change", async e => {
  store.set("optNotify", e.target.checked);
  if (!e.target.checked) return;
  if (!("Notification" in window)) { e.target.checked = false; toast("المتصفح لا يدعم الإشعارات. ثبّت التطبيق على الشاشة الرئيسية أولاً"); return; }
  const p = await Notification.requestPermission();
  if (p !== "granted") { e.target.checked = false; store.set("optNotify", false); toast("الإشعارات مرفوضة. فعّلها من إعدادات المتصفح"); }
  else toast("تم تفعيل الإشعارات");
});
["optFvg", "optPoc", "optSound", "optAwake"].forEach(id => $(id).addEventListener("change", e => {
  store.set(id, e.target.checked);
  if (id === "optAwake") e.target.checked ? keepAwake() : (wakeLock?.release().catch(() => {}), wakeLock = null);
  if ((id === "optFvg" || id === "optPoc") && running) src() === "pc" ? (pcLast && renderPc(pcLast)) : analyzeNow();
}));
["optSl", "optTp", "optGrade"].forEach(id => $(id).addEventListener("change", e => { store.set(id, e.target.value); if (running) src() === "pc" ? (pcLast && renderPc(pcLast)) : analyzeNow(); }));
["optFvg", "optPoc", "optNotify", "optSound", "optAwake"].forEach(id => { const v = store.get(id, null); if (v !== null) $(id).checked = v; });
["optSl", "optTp", "optGrade"].forEach(id => { const v = store.get(id, null); if (v !== null) $(id).value = v; });
if ($("optNotify").checked && (!("Notification" in window) || Notification.permission !== "granted")) $("optNotify").checked = false;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && running) { keepAwake(); if (src() !== "pc") { check(); if (!ws) connect(); } }   // نعوّض أي شموع فاتت والهاتف مقفول
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
renderLog(); renderRecord(); renderGrades();
$("market").textContent = marketOpen() ? "السوق مفتوح" : "السوق مغلق (عطلة)";
klines("5m", 1).then(k => { if (!running) $("price").textContent = px(k[0].close); }).catch(() => {});

// إذا جان شغال قبل ما ينسكر أو تتحدث الصفحة، يرجع يشتغل لوحده
if (store.get("radarRunning", false)) start();
// المتصفح ما يسمح بالصوت قبل أول لمسة، فنفعّله عند أول لمسة على الشاشة
document.addEventListener("pointerdown", () => {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
}, { once: true });
