"use strict";
/* واجهة تطبيق إشارات الذهب: يجلب الشموع من Binance (PAXGUSDT) كل دقيقة ويشغّل نفس محرك gold_signal_bot.py */

const API = "https://data-api.binance.vision/api/v3/klines";
const SYMBOL = "PAXGUSDT";
const FRAMES = { h1: ["1h", 720], m15: ["15m", 960], m5: ["5m", 864] }; // نفس فترات البوت: 30 يوم / 10 أيام / 3 أيام
const INTERVAL_MS = 60 * 1000;
const TZ = "Asia/Baghdad";
const MAX_SAVED = 50;

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين غير متاح */ } },
};

let running = false, timer = null, busy = false, audio = null, wakeLock = null;
let signals = store.get("signals", []);
const seen = new Set(store.get("seen", []));

const fmtTime = ms => new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(ms);
const fmtClock = ms => new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(ms);
const fmtPx = x => Number(x).toFixed(2);

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return h < 24 ? `منذ ${h} ساعة` : `منذ ${Math.floor(h / 24)} يوم`;
}

// سوق الذهب عند الوسطاء مغلق من مساء الجمعة حتى مساء الأحد (بتوقيت UTC تقريباً)؛ PAXG يتداول 24/7 فنوقف الإشارات وقتها
function marketOpen(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 21) return false;
  if (day === 0 && h < 22) return false;
  return true;
}

async function klines(interval, limit) {
  const r = await fetch(`${API}?symbol=${SYMBOL}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
}

function setStep(n, text, cls) { $("s" + n).textContent = text; $("d" + n).className = "dot " + (cls || ""); }

function renderPipeline(res) {
  if (res.status === "no_bias") {
    setStep(1, res.detail?.reason || "لا يوجد اتجاه واضح", "bad");
    setStep(2, "بانتظار اتجاه الساعة", ""); setStep(3, "—", "");
    return;
  }
  const biasAr = res.bias === "bullish" ? "صاعد" : "هابط";
  setStep(1, `اتجاه ${biasAr}`, "ok");
  const c = res.detail || {};
  if (res.status === "no_zone") {
    if (!c.confirmed15m) setStep(2, c.confirmBias ? `15 دقيقة عكس الاتجاه (${c.confirmBias === "bullish" ? "صاعد" : "هابط"})` : "15 دقيقة بدون كسر هيكلي بعد", "bad");
    else setStep(2, "لا توجد فجوة سعرية حديثة", "wait");
    setStep(3, "—", "");
    return;
  }
  if (res.status === "no_trigger") {
    const z = c.zone;
    setStep(2, `${z.type} ${fmtPx(z.bottom)} – ${fmtPx(z.top)}`, "ok");
    setStep(3, "بانتظار رجوع السعر للمنطقة وشمعة تأكيد", "wait");
    return;
  }
  if (res.status === "signal") {
    setStep(2, `${res.zoneType}`, "ok");
    setStep(3, `إشارة ${res.bias === "bullish" ? "شراء" : "بيع"} عند ${fmtPx(res.entryPrice)}`, "ok");
    return;
  }
  setStep(3, "مخاطرة غير صالحة، تم تجاهل الإشارة", "bad");
}

function sigCard(s, example = false) {
  const buy = s.bias === "bullish";
  const el = document.createElement("article");
  el.className = `sig ${buy ? "buy" : "sell"}${example ? " example" : ""}`;
  const lv = (cls, label, v) => `<div class="lv ${cls}"><span>${label}</span><div class="num">${fmtPx(v)}</div></div>`;
  el.innerHTML = `
    <div class="top"><span class="dir">${buy ? "شراء ▲" : "بيع ▼"}</span>
      <span class="age">${example ? '<span class="tag">مثال</span>' : ago(s.entryTime)}</span></div>
    <div class="levels">${lv("", "الدخول", s.entryPrice)}${lv("sl", "وقف الخسارة", s.stopLoss)}</div>
    <div class="levels tps">${s.takeProfits.map((t, i) => lv("tp", `الهدف ${i + 1}`, t)).join("")}</div>
    <div class="foot"><span>${s.zoneType} · المخاطرة <span class="num">${fmtPx(s.riskPoints)}</span>$ · ${fmtTime(s.entryTime)}</span>
      ${example ? "" : '<button type="button">نسخ</button>'}</div>`;
  const btn = el.querySelector(".foot button");
  if (btn) btn.addEventListener("click", () => copySignal(s));
  return el;
}

const EXAMPLE = { bias: "bullish", entryPrice: 4152.4, stopLoss: 4146.1, takeProfits: [4161.85, 4168.15, 4177.6], riskPoints: 6.3, zoneType: "فجوة صاعدة", entryTime: Date.now() - 12 * 60000 };

function renderSignals() {
  const box = $("signals"); box.replaceChildren();
  if (!signals.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.textContent = "لا توجد إشارات بعد. اضغط تشغيل وأي إشارة جديدة تظهر هنا مع إشعار. هذا شكلها:";
    box.append(e, sigCard(EXAMPLE, true));
    return;
  }
  signals.forEach(s => box.append(sigCard(s)));
}

function signalText(s) {
  const buy = s.bias === "bullish";
  return [`إشارة ذهب ${buy ? "شراء" : "بيع"}`, `الدخول: ${fmtPx(s.entryPrice)}`, `وقف الخسارة: ${fmtPx(s.stopLoss)}`,
    ...s.takeProfits.map((t, i) => `الهدف ${i + 1}: ${fmtPx(t)}`), `الوقت: ${fmtTime(s.entryTime)}`].join("\n");
}

async function copySignal(s) {
  try { await navigator.clipboard.writeText(signalText(s)); toast("تم نسخ الإشارة"); }
  catch { toast("تعذر النسخ، انسخ الأرقام يدوياً"); }
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function beep() {
  if (!$("optSound").checked || !audio) return;
  const now = audio.currentTime;
  [0, 0.22].forEach((dt, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = i ? 1046 : 784; o.type = "sine";
    g.gain.setValueAtTime(0.0001, now + dt); g.gain.exponentialRampToValueAtTime(0.35, now + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.2);
    o.connect(g).connect(audio.destination); o.start(now + dt); o.stop(now + dt + 0.22);
  });
}

async function notify(s) {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  beep();
  if (!$("optNotify").checked || !("Notification" in window) || Notification.permission !== "granted") return;
  const title = `ذهب: ${s.bias === "bullish" ? "شراء ▲" : "بيع ▼"} عند ${fmtPx(s.entryPrice)}`;
  const body = `وقف ${fmtPx(s.stopLoss)} · أهداف ${s.takeProfits.map(fmtPx).join(" / ")}`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: s.signalId, lang: "ar", dir: "rtl" });
    new Notification(title, { body, icon: "icon-192.png" });
  } catch { /* الإشعارات غير مدعومة هنا؛ الصوت والاهتزاز يكفيان */ }
}

async function check() {
  if (busy) return; busy = true;
  try {
    const [h1, m15, m5] = await Promise.all(Object.values(FRAMES).map(([iv, n]) => klines(iv, n)));
    const last = m5[m5.length - 1];
    $("price").textContent = fmtPx(last.close);
    const open = marketOpen();
    $("market").textContent = open ? "السوق مفتوح" : "السوق مغلق (عطلة نهاية الأسبوع)";
    const res = GoldEngine.buildSignal(h1, m15, m5);
    renderPipeline(res);
    if (res.status === "signal" && !seen.has(res.signalId)) {
      seen.add(res.signalId); store.set("seen", [...seen].slice(-200));
      if (open) {
        signals.unshift(res); signals = signals.slice(0, MAX_SAVED); store.set("signals", signals);
        renderSignals();
        if (Date.now() - res.entryTime <= 30 * 60000) notify(res);   // لا ننبّه على إشارة قديمة ظهرت عند أول تشغيل
      }
    }
    setStateChip();
    $("lastcheck").textContent = `آخر فحص ${fmtClock(Date.now())} · الفحص التالي بعد دقيقة`;
  } catch (e) {
    $("lastcheck").textContent = e instanceof TypeError && /fetch|network|load/i.test(e.message) || /^HTTP/.test(e.message) ? "تعذر جلب الأسعار. تأكد من الإنترنت، وراح يعيد المحاولة تلقائياً." : "صار خلل بالتطبيق. سكّره وافتحه مرة ثانية حتى يتحدّث.";
  } finally { busy = false; }
}

function setStateChip() {
  const c = $("state");
  if (!running) { c.textContent = "متوقف"; c.className = "chip"; return; }
  if (!marketOpen()) { c.textContent = "يعمل · السوق مغلق"; c.className = "chip closed"; return; }
  c.textContent = "يعمل"; c.className = "chip on";
}

async function keepAwake() {
  if (!running || !$("optAwake").checked || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch { wakeLock = null; }
}

async function start() {
  running = true;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch { audio = null; }
  $("toggle").textContent = "■ إيقاف"; $("toggle").classList.add("running");
  setStateChip(); keepAwake();
  await check();
  timer = setInterval(check, INTERVAL_MS);
}

function stop() {
  running = false; clearInterval(timer); timer = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $("toggle").textContent = "▶ تشغيل"; $("toggle").classList.remove("running");
  setStateChip();
  $("lastcheck").textContent = "متوقف. اضغط تشغيل لبدء الفحص";
}

$("toggle").addEventListener("click", () => (running ? stop() : start()));

$("clear").addEventListener("click", () => { signals = []; store.set("signals", []); renderSignals(); toast("تم مسح السجل"); });

$("optNotify").addEventListener("change", async e => {
  store.set("optNotify", e.target.checked);
  if (!e.target.checked) return;
  if (!("Notification" in window)) { e.target.checked = false; toast("هذا المتصفح لا يدعم الإشعارات. ثبّت التطبيق على الشاشة الرئيسية أولاً"); return; }
  const p = await Notification.requestPermission();
  if (p !== "granted") { e.target.checked = false; store.set("optNotify", false); toast("الإشعارات مرفوضة. فعّلها من إعدادات المتصفح"); }
  else toast("تم تفعيل الإشعارات");
});
["optSound", "optAwake"].forEach(id => $(id).addEventListener("change", e => {
  store.set(id, e.target.checked);
  if (id === "optAwake") e.target.checked ? keepAwake() : (wakeLock?.release().catch(() => {}), wakeLock = null);
}));
["optNotify", "optSound", "optAwake"].forEach(id => { const v = store.get(id, null); if (v !== null) $(id).checked = v; });
if ($("optNotify").checked && (!("Notification" in window) || Notification.permission !== "granted")) $("optNotify").checked = false;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && running) { keepAwake(); check(); }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
setInterval(() => { if (signals.length) renderSignals(); }, 60 * 1000);   // تحديث "منذ كم دقيقة"
renderSignals();
$("market").textContent = marketOpen() ? "السوق مفتوح" : "السوق مغلق (عطلة نهاية الأسبوع)";
klines("5m", 1).then(k => { $("price").textContent = fmtPx(k[0].close); }).catch(() => {});
