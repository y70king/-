"use strict";
/* رادار الذهب: شموع 5 دقائق لـ PAXGUSDT من Binance، تحليل سمارت موني (smc.js)، تصحيح على الذهب الفوري، ومتابعة نتيجة كل إشارة. بدون إعدادات */

const API = "https://data-api.binance.vision/api/v3/klines";
const SYMBOL = "PAXGUSDT";
const INTERVAL_MS = 30 * 1000;   // تحديث مضمون كل نص دقيقة
const HISTORY = 1000;            // الهيكل الرئيسي يحتاج تاريخ طويل
const TZ = "Asia/Baghdad";
const MAX_LOG = 100;
const GRADES = { 3: "ذهبية 🥇", 2: "جيدة", 1: "خطرة ⚠️" };
const TAGS = { BOS: "استمرار الاتجاه", CHoCH: "تغيّر الاتجاه" };
const gradeBadge = g => g ? `<span class="badge g${g}">${GRADES[g]}</span>` : "";

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين غير متاح */ } },
};

let running = false, timer = null, busy = false, audio = null, wakeLock = null;
// تصحيح الأسعار على سعر الذهب الفوري: الشموع من رمز PAXG، والفرق بينه وبين الذهب الفوري يتعدّل كل نص دقيقة
const SPOT_URL = "https://api.gold-api.com/price/XAU";
let spotOff = store.get("spotOff", 0), spotHist = store.get("spotHist", []);
const SHIFT_KEYS = ["entry", "sl", "tp1", "tp2", "obTop", "obBottom"];
// كل إشارة تنقفل أول ما تطلع: الدخول والوقف والأهداف والدرجة والتصحيح ما يتغيرون إلا بكسر جديد
let frozen = store.get("smcFrozen", {});
function freeze(s) {
  if (!s.has) return s;
  if (!frozen[s.id]) {
    const keep = { off: spotOff, grade: s.grade };
    for (const k of ["risk", ...SHIFT_KEYS]) keep[k] = s[k];
    frozen[s.id] = keep;
    const ids = Object.keys(frozen); if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete frozen[id];
    store.set("smcFrozen", frozen);
  }
  return Object.assign({}, s, frozen[s.id]);
}
const shift = (s, off) => { const o = Object.assign({}, s); for (const k of SHIFT_KEYS) if (typeof o[k] === "number") o[k] += off; return o; };
async function updateSpot() {
  try {
    const r = await fetch(SPOT_URL, { cache: "no-store" });
    const spot = (await r.json()).price;
    const paxg = bars && bars[bars.length - 1].close;
    if (spot > 0 && paxg > 0 && Math.abs(spot - paxg) < 60) {
      // وسيط آخر 20 قراءة (حوالي 10 دقائق) حتى ما يرجف التصحيح مع كل تحديث
      spotHist = spotHist.concat(spot - paxg).slice(-20);
      const sorted = [...spotHist].sort((a, b) => a - b), m = sorted.length >> 1;
      spotOff = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
      store.set("spotOff", spotOff); store.set("spotHist", spotHist);
    }
  } catch { /* نبقى على آخر فرق معروف */ }
}
let log = store.get("smcLog", []);
const seen = new Set(store.get("smcSeen", []));

const px = x => Number(x).toFixed(2);
const usd = x => `<span class="num">${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}$</span>`;
const usdText = x => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(2)}$`;   // للإشعارات (نص عادي)
const fmtTime = ms => new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(ms);

function marketOpen(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours();
  return !(day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 22));
}

async function klines(interval, limit) {
  const r = await fetch(`${API}?symbol=${SYMBOL}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

function signalBlock(s) {
  const buy = s.dir === 1;
  return `
    <div class="side"><span class="dir ${buy ? "buy" : "sell"}">${buy ? "شراء ▲" : "بيع ▼"} ${gradeBadge(s.grade)}</span>
      <span class="order">${s.state === "active" ? "الصفقة شغالة" : buy ? "أمر شراء معلّق" : "أمر بيع معلّق"}</span></div>
    <div class="grid">
      <div class="cell entry"><span>الدخول</span><div class="num">${px(s.entry)}</div></div>
      <div class="cell sl"><span>وقف الخسارة</span><div class="num">${px(s.sl)}</div></div>
      <div class="cell tp"><span>الهدف 1</span><div class="num">${px(s.tp1)}</div></div>
      <div class="cell tp"><span>الهدف النهائي</span><div class="num">${px(s.tp2)}</div></div>
    </div>
    <div class="extra">${TAGS[s.tag]} · بلوك الأوامر <span class="num">${px(s.obBottom)} – ${px(s.obTop)}</span> · ${fmtTime(s.time + 5 * 60e3)}<br>
      إذا ضرب الوقف تخسر <span class="num">${px(s.risk)}$</span> بلوت 0.01</div>`;
}

function renderSignal(s) {
  const box = $("signal");
  if (!s.has) { box.replaceChildren(); const d = document.createElement("div"); d.className = "idle"; d.textContent = s.reason; box.append(d); return; }
  box.innerHTML = signalBlock(s);
}

const closedOf = g => log.filter(s => (g === undefined || s.grade === g) && (s.state === "win" || s.state === "loss"));
function renderRecord() {
  const done = closedOf(), w = done.filter(s => s.state === "win").length;
  $("record").innerHTML = done.length ? `${w} ربح · ${done.length - w} خسارة · ${usd(done.reduce((a, s) => a + (s.result || 0), 0))}` : "لا نتائج بعد";
  $("gradeTable").innerHTML = [3, 2, 1].map(g => {
    const d = closedOf(g);
    return `<tr><td class="g${g}">${GRADES[g]}</td><td>${d.length ? `${d.filter(s => s.state === "win").length}/${d.length}` : "—"}</td><td>${d.length ? usd(d.reduce((a, s) => a + (s.result || 0), 0)) : "—"}</td></tr>`;
  }).join("");
}

const STATE_TXT = { pending: "بانتظار الدخول", active: "الصفقة شغالة", win: "ربح", loss: "خسارة", expired: "انتهت بدون دخول" };

function logItem(s, example = false) {
  const el = document.createElement("article");
  el.className = `item${example ? " example" : ""}`;
  const st = s.state || "pending", o = s.off || 0;   // الأسعار المعروضة مصححة على الذهب الفوري وقت الإشارة
  const res = st === "win" || st === "loss" ? ` ${usd(s.result)}` : "";
  el.innerHTML = `
    <div class="row1"><span class="what">${gradeBadge(s.grade)} ${s.dir === 1 ? "شراء" : "بيع"} عند <span class="num">${px(s.entry + o)}</span></span>
      <span class="state ${st}">${example ? "مثال" : STATE_TXT[st] + res}</span></div>
    <div class="row2"><span>وقف <span class="num">${px(s.sl + o)}</span></span><span>هدف <span class="num">${px(s.tp2 + o)}</span></span><span>${TAGS[s.tag] || ""}</span><span>${fmtTime(s.firedAt)}</span></div>`;
  return el;
}

const EXAMPLE = { grade: 3, dir: 1, tag: "BOS", entry: 4148.25, sl: 4141.6, tp2: 4161.55, firedAt: Date.now() - 40 * 60000 };

function renderLog() {
  const box = $("log"); box.replaceChildren();
  if (!log.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.textContent = "لا توجد إشارات بعد. كل إشارة جديدة تنحفظ هنا ويتابع التطبيق إذا دخلت وضربت الهدف أو الوقف. هذا شكلها:";
    box.append(e, logItem(EXAMPLE, true));
    return;
  }
  log.forEach(s => box.append(logItem(s)));
}

let toastTimer = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }

function beep() {
  if (!audio) return;
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
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag, lang: "ar", dir: "rtl" });
    new Notification(title, { body, icon: "icon-192.png" });
  } catch { /* الصوت والاهتزاز يكفيان */ }
}

// ───────── البيانات: تحميل التاريخ، وبعدها بث مباشر لشمعة 5 دقائق ─────────
const WS_URL = "wss://data-stream.binance.vision/ws/paxgusdt@kline_5m";
let bars = null, ws = null, wsRetry = 0, live = false, lastAnalyze = 0, resyncTimer = null, clockTimer = null;

async function loadHistory() { bars = await klines("5m", HISTORY); }

// تحديث كامل (عند التشغيل، بعد انقطاع، وكل نص دقيقة)
async function check() {
  if (busy) return; busy = true;
  try { await loadHistory(); await updateSpot(); analyzeNow(); }
  catch (e) { showError(e); }
  finally { busy = false; }
}

function showError(e) {
  $("lastcheck").textContent = e instanceof TypeError && /fetch|network|load/i.test(e.message) || /^HTTP/.test(e.message) ? "تعذر جلب الأسعار. تأكد من الإنترنت، وراح يعيد المحاولة تلقائياً." : "صار خلل بالتطبيق. سكّره وافتحه مرة ثانية حتى يتحدّث.";
}

function onKline(k) {
  if (!bars) return;
  const bar = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
  const last = bars[bars.length - 1];
  if (bar.time === last.time) bars[bars.length - 1] = bar;
  else if (bar.time > last.time) { bars.push(bar); if (bars.length > HISTORY) bars.shift(); }
  else return;
  $("price").textContent = px(bar.close + spotOff);   // السعر يتحرك مباشرة (مصحح على الذهب الفوري)
  // التحليل: فوراً عند سكرة الشمعة (وقت تكوّن الكسور)، وغير ذلك كل نص دقيقة
  if (k.x || Date.now() - lastAnalyze >= INTERVAL_MS) analyzeNow();
}

function connect() {
  if (!running || ws) return;
  try { ws = new WebSocket(WS_URL); } catch { ws = null; return scheduleReconnect(); }
  ws.onopen = () => { wsRetry = 0; live = true; setStateChip(); check(); };
  ws.onmessage = ev => { try { const m = JSON.parse(ev.data); const k = m.k || (m.data && m.data.k); if (k) onKline(k); } catch { /* رسالة غير مفهومة */ } };
  ws.onclose = () => { ws = null; live = false; setStateChip(); scheduleReconnect(); };
  ws.onerror = () => { try { ws && ws.close(); } catch { /* مغلق أصلاً */ } };
}

function scheduleReconnect() {
  if (!running) return;
  const wait = Math.min(30, 2 ** wsRetry++) * 1000;
  setTimeout(() => { if (running && !ws) connect(); }, wait);
}

const showTrend = (id, d) => { const el = $(id); el.textContent = d === 1 ? "صاعد ▲" : d === -1 ? "هابط ▼" : "—"; el.className = "trend " + (d === 1 ? "up" : d === -1 ? "down" : ""); };

function analyzeNow() {
  if (!bars || bars.length < 3) return;
  lastAnalyze = Date.now();
  try {
    const price = bars[bars.length - 1].close, open = marketOpen();
    $("price").textContent = px(price + spotOff);
    $("market").textContent = `الذهب الفوري · ${open ? "السوق مفتوح" : "السوق مغلق (عطلة)"}`;

    const closed = bars.slice(0, -1);   // التحليل على الشموع المغلقة فقط مثل المؤشر
    const r = SMC.run(closed);
    showTrend("stSwing", r.swingTrend); showTrend("stInternal", r.internalTrend);
    const z = $("stZone"); z.textContent = r.zone === "discount" ? "خصم (رخيص)" : r.zone === "premium" ? "علاوة (غالي)" : "—";
    z.className = r.zone === "discount" ? "trend up" : r.zone === "premium" ? "trend down" : "";

    const cur = freeze(SMC.current(r, closed));
    const gb = $("stGrade"); gb.textContent = cur.has ? GRADES[cur.grade] : "ماكو إشارة"; gb.className = cur.has ? "g" + cur.grade : "";
    renderSignal(cur.has ? shift(cur, cur.off) : cur);

    // إشارات جديدة: الإشارة الحالية، أو أي كسر سكرت شمعته خلال آخر 10 دقائق
    const fresh = r.events.filter(e => Date.now() - (e.time + 5 * 60e3) < 10 * 60e3).map(e => freeze(Object.assign({ has: true }, e)));
    if (cur.has) fresh.push(cur);
    for (const s of fresh) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (!open) continue;
      log.unshift({ id: s.id, dir: s.dir, tag: s.tag, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, risk: s.risk, grade: s.grade, time: s.time, firedAt: Date.now(), state: "pending", off: s.off });
      notify(`${GRADES[s.grade]} · ${s.dir === 1 ? "شراء ▲" : "بيع ▼"} عند ${px(s.entry + s.off)}`, `${TAGS[s.tag]} · وقف ${px(s.sl + s.off)} · هدف ${px(s.tp2 + s.off)} · خسارة محتملة ${px(s.risk)}$`, s.id);
    }

    // متابعة نتائج الإشارات المفتوحة
    log = log.map(s => {
      if (s.state === "win" || s.state === "loss" || s.state === "expired") return s;
      const t = SMC.track(s, bars);
      if (t.state !== s.state && (t.state === "win" || t.state === "loss"))
        notify(t.state === "win" ? "ضربت الهدف ✅" : "ضربت الوقف ❌", `${usdText(t.result)} على لوت 0.01`, s.id + "-r");
      return t;
    }).slice(0, MAX_LOG);
    store.set("smcLog", log); store.set("smcSeen", [...seen].slice(-300));
    renderLog(); renderRecord(); setStateChip();
  } catch (e) { showError(e); }
}

// سطر الحالة: كم ثانية مرّت على آخر تحليل
function tickClock() {
  if (!running) return;
  const sec = Math.max(0, Math.round((Date.now() - lastAnalyze) / 1000));
  const next = Math.max(0, Math.round((INTERVAL_MS - (Date.now() - lastAnalyze)) / 1000));
  $("lastcheck").textContent = lastAnalyze ? `${live ? "🟢 السعر مباشر" : "🟡 السعر كل نص دقيقة"} · آخر تحليل قبل ${sec} ثانية · التالي بعد ${next} ثانية` : "🟡 يجلب الأسعار...";
}

function setStateChip() {
  const c = $("state");
  if (!running) { c.textContent = "متوقف"; c.className = "chip"; return; }
  if (!marketOpen()) { c.textContent = "يعمل · السوق مغلق"; c.className = "chip closed"; return; }
  c.textContent = live ? "مباشر" : "يعمل"; c.className = "chip on";
}

async function keepAwake() {
  if (!running || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch { wakeLock = null; }
}

function askNotify() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  Notification.requestPermission().then(p => { if (p === "granted") toast("تم تفعيل الإشعارات"); }).catch(() => {});
}

async function start() {
  if (running) return;
  running = true; store.set("radarRunning", true);   // يتذكر إنه شغال حتى بعد تحديث الصفحة
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { audio = null; }   // بدون انتظار: الصوت يتفعّل مع أول لمسة
  $("toggle").textContent = "■ إيقاف"; $("toggle").classList.add("running");
  setStateChip(); keepAwake(); tickClock();
  clockTimer = setInterval(tickClock, 1000);
  timer = setInterval(check, INTERVAL_MS);                                // تحديث كامل مضمون كل نص دقيقة
  await check();
  connect();
}

function stop() {
  running = false; live = false; store.set("radarRunning", false);
  [timer, resyncTimer, clockTimer].forEach(clearInterval); timer = resyncTimer = clockTimer = null;
  if (ws) { ws.onclose = null; try { ws.close(); } catch { /* مغلق */ } ws = null; }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $("toggle").textContent = "▶ تشغيل"; $("toggle").classList.remove("running");
  setStateChip(); $("lastcheck").textContent = "متوقف. اضغط تشغيل لبدء المتابعة المباشرة";
}

$("toggle").addEventListener("click", () => { if (running) stop(); else { askNotify(); start(); } });
$("clear").addEventListener("click", () => { log = []; store.set("smcLog", []); renderLog(); renderRecord(); toast("تم مسح السجل"); });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && running) { keepAwake(); check(); if (!ws) connect(); }   // نعوّض أي شموع فاتت والهاتف مقفول
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
renderLog(); renderRecord();
$("market").textContent = marketOpen() ? "السوق مفتوح" : "السوق مغلق (عطلة)";
klines("5m", 1).then(k => { if (!running) $("price").textContent = px(k[0].close + spotOff); }).catch(() => {});

// إذا جان شغال قبل ما ينسكر أو تتحدث الصفحة، يرجع يشتغل لوحده
if (store.get("radarRunning", false)) start();
// المتصفح ما يسمح بالصوت قبل أول لمسة، فنفعّله عند أول لمسة على الشاشة
document.addEventListener("pointerdown", () => {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
}, { once: true });
