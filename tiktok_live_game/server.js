// TikTok LIVE interactive game server.
//
// Connects to a TikTok LIVE stream (by username), turns likes / gifts / chat
// into simple game events, and pushes them over a WebSocket to the game page
// (public/index.html). Add that page to TikTok LIVE Studio or OBS as a
// "Browser Source" / "Link" so viewers see it on the stream.
//
// Usage:
//   node server.js                 -> uses tiktokUsername from config.json
//   node server.js some_username   -> connect to @some_username
//   node server.js --demo          -> no TikTok, fake viewers (for testing)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const username = (args.find(a => !a.startsWith('--')) || config.tiktokUsername || '').replace(/^@/, '');
const PORT = Number(process.env.PORT || config.port || 3000);
const LIKES_PER_SPAWN = Math.max(1, Number(config.likesPerSpawn) || 20);
const JOIN_COMMAND = String(config.joinCommand || '').trim().toLowerCase();

// ---------------------------------------------------------------- web server
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/config') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    return res.end(JSON.stringify({ ...config, likesPerSpawn: LIKES_PER_SPAWN, demo: DEMO, username }));
  }
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
let lastStatus = { type: 'status', state: 'starting', text: 'Starting...' };

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
function status(state, text) {
  lastStatus = { type: 'status', state, text };
  console.log(`[status] ${state}: ${text}`);
  broadcast(lastStatus);
}

wss.on('connection', ws => {
  ws.send(JSON.stringify(lastStatus));
  ws.send(JSON.stringify({ type: 'likeProgress', bank: likeBank, needed: LIKES_PER_SPAWN }));
  // The game page's test panel can inject fake events through the same pipeline.
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type !== 'simulate') return;
    const user = fakeUser(m.name);
    if (m.kind === 'like') handleLike(user, Number(m.count) || 1);
    else if (m.kind === 'gift') handleGift(user, m.giftName || 'Test gift', Number(m.diamonds) || 1, 1, '');
    else if (m.kind === 'join') handleChat(user, JOIN_COMMAND || 'join');
    else if (m.kind === 'follow') emit('follow', user);
    else if (m.kind === 'share') emit('share', user);
  });
});

// ------------------------------------------------------------- game pipeline
let likeBank = 0;

function emit(type, user, extra = {}) {
  broadcast({ type, user, ...extra, at: Date.now() });
}

function handleLike(user, count) {
  likeBank += count;
  // Every LIKES_PER_SPAWN likes, the viewer whose like completed the batch
  // gets their name on screen as a fighter.
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
  console.log(`[gift] ${user.name} -> ${giftName} x${repeat} (${diamonds} diamonds) => ${tier.effect}`);
  emit('gift', user, { giftName, repeat, diamonds, image, tier: tier.name, effect: tier.effect });
}

function handleChat(user, comment) {
  const text = String(comment || '').trim().toLowerCase();
  if (JOIN_COMMAND && (text === JOIN_COMMAND || text === JOIN_COMMAND.replace(/^!/, ''))) {
    emit('spawn', user, { reason: 'join' });
  }
}

// ------------------------------------------- normalise TikTok event payloads
// Field names differ between library versions, so try several paths.
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
  const names = ['Ali', 'Zahraa', 'Hussein', 'Noor', 'Mustafa', 'Fatima', 'Ahmed', 'Sara', 'Abbas', 'Maryam',
    'Karrar', 'Ruqaya', 'Haider', 'Zainab', 'Murtadha', 'Hawraa', 'Sajjad', 'Ayat', 'Muntadhar', 'Duaa'];
  const n = name || names[(fakeN++) % names.length] + (fakeN > names.length ? fakeN : '');
  return { id: 'demo_' + n, name: n, avatar: '' };
}

// ------------------------------------------------------------ TikTok connect
let connection = null;
let retryDelay = 5000;

async function connectTikTok() {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
  connection = new TikTokLiveConnection(username, {
    enableExtendedGiftInfo: true,
    processInitialData: false,
    ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {}),
  });

  connection.on(WebcastEvent.LIKE, d => handleLike(normUser(d), Number(first(d.likeCount, d.count, 1)) || 1));

  connection.on(WebcastEvent.GIFT, d => {
    const gd = d.giftDetails || {}, g = d.gift || {}, ex = d.extendedGiftInfo || {};
    const giftType = first(gd.giftType, g.type, d.giftType);
    // Streakable gifts (type 1) fire many times; only count the final one.
    if (giftType === 1 && !d.repeatEnd) return;
    handleGift(
      normUser(d),
      String(first(gd.giftName, g.name, ex.name, d.giftName, 'Gift')),
      Number(first(gd.diamondCount, g.diamondCount, ex.diamond_count, ex.diamondCount, d.diamondCount, 1)),
      Number(first(d.repeatCount, d.comboCount, 1)),
      first(img(gd.giftImage), img(g.image), img(ex.image), d.giftPictureUrl, '') || ''
    );
  });

  connection.on(WebcastEvent.CHAT, d => handleChat(normUser(d), d.comment || d.content));
  connection.on(WebcastEvent.FOLLOW, d => emit('follow', normUser(d)));
  connection.on(WebcastEvent.SHARE, d => emit('share', normUser(d)));
  connection.on(WebcastEvent.STREAM_END, () => status('ended', 'The LIVE has ended'));
  connection.on(ControlEvent.DISCONNECTED, () => { status('disconnected', 'Disconnected — reconnecting...'); scheduleRetry(); });
  connection.on(ControlEvent.ERROR, e => console.error('[tiktok error]', e?.message || e));

  try {
    status('connecting', `Connecting to @${username} ...`);
    const state = await connection.connect();
    retryDelay = 5000;
    status('connected', `Connected to @${username} (room ${state.roomId})`);
  } catch (err) {
    status('error', `Could not connect to @${username}: ${err?.message || err}. Are you LIVE right now? Retrying...`);
    scheduleRetry();
  }
}

let retryTimer = null;
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    try { connection?.disconnect?.(); } catch {}
    connection?.removeAllListeners?.();
    connectTikTok();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}

// --------------------------------------------------------------- demo mode
function startDemo() {
  status('connected', 'DEMO mode — fake viewers');
  setInterval(() => handleLike(fakeUser(), 1 + Math.floor(Math.random() * 8)), 400);
  setInterval(() => {
    const r = Math.random();
    const g = r < 0.6 ? ['Rose', 1] : r < 0.85 ? ['Finger Heart', 5] : r < 0.95 ? ['Perfume', 20] : r < 0.99 ? ['Galaxy', 1000] : ['Lion', 29999];
    handleGift(fakeUser(), g[0], g[1], 1 + Math.floor(Math.random() * 3), '');
  }, 3500);
  setInterval(() => handleChat(fakeUser(), JOIN_COMMAND || 'join'), 2500);
}

server.listen(PORT, () => {
  console.log(`\n  Game page:  http://localhost:${PORT}/`);
  console.log(`  Test panel: http://localhost:${PORT}/?test=1\n`);
  if (DEMO) startDemo();
  else if (!username || username.startsWith('PUT_YOUR')) {
    status('error', 'Set your TikTok username in config.json (or run: node server.js your_username). Test panel: /?test=1');
  } else connectTikTok();
});
