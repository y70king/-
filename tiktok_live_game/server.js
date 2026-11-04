// سيرفر لعبة بث تيك توك المباشر.
//
// يرتبط ببث تيك توك (عن طريق اليوزر)، ويحوّل اللايكات والهدايا والتعليقات
// إلى أحداث للعبة، ويرسلها عبر WebSocket لصفحة اللعبة (public/index.html).
//
// التشغيل:
//   node server.js                 -> يستخدم اليوزر من config.json
//   node server.js some_username   -> يرتبط بـ @some_username
//   node server.js --demo          -> مشاهدين وهميين للتجربة
//   node server.js --open          -> يفتح اللعبة بنافذة مستقلة
// وتكدر تكتب اليوزر من صفحة اللعبة نفسها.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const cleanUser = u => String(u || '').trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
let username = cleanUser(args.find(a => !a.startsWith('--')) || process.env.TIKTOK_USERNAME || config.tiktokUsername);
if (username.startsWith('PUT_YOUR')) username = '';
const PORT = Number(process.env.PORT || config.port || 3000);
const LIKES_PER_SPAWN = Math.max(1, Number(config.likesPerSpawn) || 20);
const JOIN_COMMAND = String(config.joinCommand || '').trim().toLowerCase();

// أسماء الهدايا المشهورة بالعربي (تيك توك يرسلها بالإنكليزي)
const GIFT_AR = {
  'rose': 'وردة', 'tiktok': 'تيك توك', 'finger heart': 'قلب بالأصابع', 'heart me': 'قلبي', 'gg': 'جي جي',
  'ice cream cone': 'آيس كريم', 'doughnut': 'دونات', 'perfume': 'عطر', 'hand hearts': 'قلوب بالإيد',
  'sunglasses': 'نظارات شمسية', 'corgi': 'جرو', 'money gun': 'مسدس فلوس', 'galaxy': 'مجرة', 'lion': 'أسد',
  'universe': 'الكون', 'tiktok universe': 'كون تيك توك', 'rocket': 'صاروخ', 'drama queen': 'ملكة الدراما',
  'love you': 'أحبك', 'heart': 'قلب', 'hearts': 'قلوب', 'cap': 'كاب', 'hat and mustache': 'قبعة وشارب',
  'mic': 'مايك', 'confetti': 'قصاصات ملونة', 'swan': 'بجعة', 'train': 'قطار', 'mirror': 'مراية',
  'whale diving': 'حوت', 'motorcycle': 'دراجة نارية', 'sports car': 'سيارة رياضية', 'private jet': 'طيارة خاصة',
  'interstellar': 'بين النجوم', 'falcon': 'صقر', 'castle': 'قلعة', 'gold mine': 'منجم ذهب', 'diamond': 'ماسة',
  'teddy bear': 'دبدوب', 'coffee': 'قهوة', 'cake': 'كيكة', 'balloon': 'بالون', 'fireworks': 'ألعاب نارية',
  'crown': 'تاج', 'star': 'نجمة', 'kiss': 'بوسة', 'panda': 'باندا', 'unicorn': 'يونيكورن',
  'test gift': 'هدية تجربة',
};
const giftAr = name => GIFT_AR[String(name || '').trim().toLowerCase()] || name || 'هدية';

// ---------------------------------------------------------------- web server
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/config') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ...config, likesPerSpawn: LIKES_PER_SPAWN, username, demo: !!demoTimers.length }));
  }
  if (urlPath === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('غير موجود'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('error', () => {});            // أخطاء المنفذ تنعالج تحت بـ server.on('error')
let lastStatus = { type: 'status', state: 'idle', text: 'اكتب يوزرك بتيك توك واضغط ابدأ' };

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
function status(state, text) {
  lastStatus = { type: 'status', state, text, username, demo: !!demoTimers.length };
  console.log(`[الحالة] ${state}: ${text}`);
  broadcast(lastStatus);
}

wss.on('connection', ws => {
  ws.send(JSON.stringify(lastStatus));
  ws.send(JSON.stringify({ type: 'likeProgress', bank: likeBank, needed: LIKES_PER_SPAWN }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'connect') {
      const u = cleanUser(m.username);
      if (!u) return status('error', 'اكتب اليوزر صحيح');
      if (u === username && !demoTimers.length && ['connected', 'connecting'].includes(lastStatus.state)) {
        return ws.send(JSON.stringify(lastStatus));
      }
      stopAll(); username = u; connectTikTok();
    } else if (m.type === 'demo') {
      stopAll(); startDemo();
    } else if (m.type === 'stop') {
      stopAll(); status('idle', 'متوقف');
    } else if (m.type === 'simulate') {
      const user = fakeUser(m.name);
      if (m.kind === 'like') handleLike(user, Number(m.count) || 1);
      else if (m.kind === 'gift') handleGift(user, m.giftName || 'Test gift', Number(m.diamonds) || 1, 1, '');
      else if (m.kind === 'join') handleChat(user, JOIN_COMMAND || 'join');
      else if (m.kind === 'follow') emit('follow', user);
      else if (m.kind === 'share') emit('share', user);
    }
  });
});

// ------------------------------------------------------------- game pipeline
let likeBank = 0;

function emit(type, user, extra = {}) {
  broadcast({ type, user, ...extra, at: Date.now() });
}

function handleLike(user, count) {
  likeBank += count;
  // كل LIKES_PER_SPAWN لايك، الشخص اللي كمّل العدد يدخل الساحة باسمه.
  while (likeBank >= LIKES_PER_SPAWN) {
    likeBank -= LIKES_PER_SPAWN;
    emit('spawn', user, { reason: 'likes' });
  }
  broadcast({ type: 'likeProgress', bank: likeBank, needed: LIKES_PER_SPAWN, lastUser: user });
}

function giftTier(diamonds) {
  const tiers = Object.entries(config.giftTiers || {})
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => b.minDiamonds - a.minDiamonds);
  return tiers.find(t => diamonds >= t.minDiamonds) || tiers[tiers.length - 1] || { name: 'small', effect: 'shield' };
}

function handleGift(user, giftName, diamondEach, repeat, image) {
  const diamonds = Math.max(1, diamondEach) * Math.max(1, repeat);
  const tier = giftTier(diamonds);
  const nameAr = giftAr(giftName);
  console.log(`[هدية] ${user.name} -> ${nameAr} x${repeat} (${diamonds} ماسة) => ${tier.effect}`);
  emit('gift', user, { giftName: nameAr, repeat, diamonds, image, tier: tier.name, effect: tier.effect });
}

function handleChat(user, comment) {
  const text = String(comment || '').trim().toLowerCase();
  const cmds = [JOIN_COMMAND, JOIN_COMMAND.replace(/^!/, ''), 'join', 'دخول', 'ادخل', 'انضم'].filter(Boolean);
  if (cmds.includes(text)) emit('spawn', user, { reason: 'join' });
}

// ------------------------------------------- normalise TikTok event payloads
// أسماء الحقول تختلف بين نسخ المكتبة، فنجرب أكثر من مسار.
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
const img = m => m && first(m.url?.[0], m.urlList?.[0], m.url_list?.[0], typeof m === 'string' ? m : undefined);

function normUser(d) {
  const u = d.user || d;
  const id = first(u.uniqueId, u.displayId, u.userId, u.id, d.uniqueId, 'viewer');
  return {
    id: String(id),
    name: String(first(u.nickname, d.nickname, id)).slice(0, 24),
    avatar: first(img(u.profilePicture), img(u.avatarThumb), img(u.avatarMedium), d.profilePictureUrl, '') || '',
  };
}

let fakeN = 0;
function fakeUser(name) {
  const names = ['علي', 'زهراء', 'حسين', 'نور', 'مصطفى', 'فاطمة', 'أحمد', 'سارة', 'عباس', 'مريم',
    'كرار', 'رقية', 'حيدر', 'زينب', 'مرتضى', 'حوراء', 'سجاد', 'آيات', 'منتظر', 'دعاء'];
  const n = name || names[(fakeN++) % names.length] + (fakeN > names.length ? ' ' + fakeN : '');
  return { id: 'demo_' + n, name: n, avatar: '' };
}

// ------------------------------------------------------------ TikTok connect
let connection = null;
let retryDelay = 5000;
let retryTimer = null;
let generation = 0;            // يزيد كل مرة نغير اليوزر، حتى نتجاهل الاتصالات القديمة

function stopAll() {
  generation++;
  clearTimeout(retryTimer); retryTimer = null;
  demoTimers.forEach(clearInterval); demoTimers = [];
  if (connection) {
    connection.removeAllListeners?.();
    try { connection.disconnect?.(); } catch {}
    connection = null;
  }
  retryDelay = 5000;
}

async function connectTikTok() {
  const gen = generation;
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
  const conn = new TikTokLiveConnection(username, {
    enableExtendedGiftInfo: true,
    processInitialData: false,
    ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {}),
  });
  connection = conn;
  const live = fn => (...a) => { if (gen === generation) fn(...a); };

  conn.on(WebcastEvent.LIKE, live(d => handleLike(normUser(d), Number(first(d.likeCount, d.count, 1)) || 1)));

  conn.on(WebcastEvent.GIFT, live(d => {
    const gd = d.giftDetails || {}, g = d.gift || {}, ex = d.extendedGiftInfo || {};
    const giftType = first(gd.giftType, g.type, d.giftType);
    // الهدايا المتكررة (نوع 1) توصل أكثر من مرة؛ نحسب بس الأخيرة.
    if (giftType === 1 && !d.repeatEnd) return;
    handleGift(
      normUser(d),
      String(first(gd.giftName, g.name, ex.name, d.giftName, 'Gift')),
      Number(first(gd.diamondCount, g.diamondCount, ex.diamond_count, ex.diamondCount, d.diamondCount, 1)),
      Number(first(d.repeatCount, d.comboCount, 1)),
      first(img(gd.giftImage), img(g.image), img(ex.image), d.giftPictureUrl, '') || ''
    );
  }));

  conn.on(WebcastEvent.CHAT, live(d => handleChat(normUser(d), d.comment || d.content)));
  conn.on(WebcastEvent.FOLLOW, live(d => emit('follow', normUser(d))));
  conn.on(WebcastEvent.SHARE, live(d => emit('share', normUser(d))));
  conn.on(WebcastEvent.STREAM_END, live(() => status('ended', 'البث انتهى')));
  conn.on(ControlEvent.DISCONNECTED, live(() => { status('disconnected', 'انقطع الاتصال… دا نعيد المحاولة'); scheduleRetry(gen); }));
  conn.on(ControlEvent.ERROR, e => console.error('[خطأ تيك توك]', e?.message || e));

  try {
    status('connecting', `دا نرتبط ببث @${username} …`);
    const state = await conn.connect();
    if (gen !== generation) { try { conn.disconnect(); } catch {} return; }
    retryDelay = 5000;
    status('connected', `مرتبط ببث @${username}`);
    console.log(`room ${state.roomId}`);
  } catch (err) {
    if (gen !== generation) return;
    console.error(err?.message || err);
    status('error', `ما كدرنا نرتبط بـ @${username}. تأكد إنك لايف هسه وإن اليوزر صحيح. نعيد المحاولة…`);
    scheduleRetry(gen);
  }
}

function scheduleRetry(gen) {
  if (retryTimer || gen !== generation) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (gen !== generation) return;
    if (connection) { connection.removeAllListeners?.(); try { connection.disconnect?.(); } catch {} }
    connectTikTok();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}

// --------------------------------------------------------------- demo mode
let demoTimers = [];
function startDemo() {
  demoTimers = [
    setInterval(() => handleLike(fakeUser(), 1 + Math.floor(Math.random() * 8)), 500),
    setInterval(() => {
      const r = Math.random();
      const g = r < 0.6 ? ['Rose', 1] : r < 0.85 ? ['Finger Heart', 5] : r < 0.95 ? ['Perfume', 20] : r < 0.99 ? ['Galaxy', 1000] : ['Lion', 29999];
      handleGift(fakeUser(), g[0], g[1], 1 + Math.floor(Math.random() * 3), '');
    }, 6000),
    setInterval(() => handleChat(fakeUser(), JOIN_COMMAND || 'join'), 4000),
  ];
  status('connected', 'وضع التجربة — مشاهدين وهميين');
}

// ---------------------------------------------------- فتح اللعبة بنافذة مستقلة
// نفتحها كنافذة تطبيق (بدون شريط عناوين) حتى تلتقطها بسهولة بـ OBS أو TikTok LIVE Studio.
// نفضّل Edge لأن بيه أصوات عربية طبيعية (منها عراقية)، وإذا ماكو نستخدم Chrome.
function openBrowser(url) {
  const { spawn } = require('child_process');
  const appArgs = [`--app=${url}`, '--window-size=560,1000', '--autoplay-policy=no-user-gesture-required'];
  const run = (cmd, a) => {
    try {
      const child = spawn(cmd, a, { detached: true, stdio: 'ignore' });
      child.on('error', () => console.log(`افتح المتصفح على: ${url}`));
      child.unref(); return true;
    } catch { return false; }
  };
  const env = process.env;
  if (process.platform === 'win32') {
    const candidates = [
      `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    const exe = candidates.find(c => fs.existsSync(c));
    if (!(exe && run(exe, appArgs))) run('cmd', ['/c', 'start', '', url]);
  } else if (process.platform === 'darwin') {
    const apps = ['/Applications/Microsoft Edge.app', '/Applications/Google Chrome.app'];
    const app = apps.find(a => fs.existsSync(a));
    if (!(app && run('open', ['-na', app, '--args', ...appArgs]))) run('open', [url]);
  } else {
    run('xdg-open', [url]);
  }
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    // اللعبة شغالة من قبل: بس نفتح النافذة
    console.log(`اللعبة شغالة من قبل على المنفذ ${PORT}. دا نفتح النافذة…`);
    if (args.includes('--open')) openBrowser(`http://localhost:${PORT}/`);
    setTimeout(() => process.exit(0), 1500);
  } else throw err;
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  ✅ اللعبة شغالة:  ${url}`);
  console.log('  لا تسد هاي النافذة طول ما انت تبث.\n');
  if (args.includes('--open')) openBrowser(url);
  if (args.includes('--demo')) startDemo();
  else if (username) connectTikTok();
});
