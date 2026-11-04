// ساحة البث — كل مشاهد يدز لايكات أو هدايا يدخل الساحة كمقاتل باسمه.
// المقاتلين يتصادمون، وآخر واحد يبقى يفوز بالجولة.
// الصوت يعلّق بالعربي على الهدايا ودخول اللاعبين، والتعليق يظهر مكتوب على الشاشة.
(() => {
  const W = 1080, H = 1920;
  const ARENA = { x: 40, y: 430, w: W - 80, h: 1180 };
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  if (params.has('transparent')) document.body.classList.add('transparent');
  const FONT = '"Cairo", system-ui, sans-serif';

  let cfg = { likesPerSpawn: 20, maxFighters: 60, roundSeconds: 180, joinCommand: '!join', giftTiers: {} };
  fetch('/config').then(r => r.json()).then(c => { cfg = { ...cfg, ...c }; roundLeft = cfg.roundSeconds; }).catch(() => {});

  // ------------------------------------------------------------------ state
  const fighters = new Map();          // id -> fighter
  const particles = [];
  const floaters = [];                 // floating texts
  const banners = [];                  // big gift announcements (queue)
  const feed = [];                     // small event log
  const wins = new Map();              // name -> wins this session
  let likeBank = 0, likeLast = null;
  let phase = 'play', phaseT = 0, roundLeft = 180, round = 1, joinedThisRound = 0, winner = null;
  let shake = 0, statusMsg = { state: 'starting', text: 'دا نتصل بالسيرفر…' }, statusAt = 0;
  const pending = [];                  // events that arrive during the winner screen

  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now() / 1000;
  const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };

  // ------------------------------------------------- التعليق الصوتي والمكتوب
  const settings = { voiceOn: true, vol: 1, rate: 1, sayJoins: true, testOn: false, clean: false, user: '' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('arena-settings') || '{}')); } catch {}
  const saveSettings = () => { try { localStorage.setItem('arena-settings', JSON.stringify(settings)); } catch {} };

  const synth = window.speechSynthesis;
  let arVoice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    arVoice = vs.find(v => /^ar[-_]IQ/i.test(v.lang)) || vs.find(v => /^ar[-_]SA/i.test(v.lang))
      || vs.find(v => /^ar/i.test(v.lang)) || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  const speechQ = [];                  // {text, prio}
  let speaking = false, speakStarted = 0;
  const captions = [];                 // التعليق المكتوب: {text, color, life}

  // prio: 2 = هدية / فائز (ما تنحذف)، 1 = دخول لاعب (تنحذف إذا الطابور زحمة)
  function announce(text, prio = 1, color = '#fff') {
    captions.push({ text, color, life: 4 });
    if (captions.length > 3) captions.shift();
    if (!settings.voiceOn || !synth) return;
    if (prio < 2 && !settings.sayJoins) return;
    if (prio < 2 && speechQ.length >= 2) return;           // زحمة: نسكت عن الدخول
    if (speechQ.length >= 6) speechQ.splice(speechQ.findIndex(q => q.prio < 2) >>> 0, 1);
    speechQ.push({ text, prio });
    pumpSpeech();
  }
  function pumpSpeech() {
    if (!synth) return;
    // بعض المتصفحات تعلگ؛ إذا صار أكثر من 12 ثانية نعيد التشغيل
    if (speaking && now() - speakStarted > 12) { synth.cancel(); speaking = false; }
    if (speaking || !speechQ.length) return;
    const { text } = speechQ.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = arVoice ? arVoice.lang : 'ar-SA';
    if (arVoice) u.voice = arVoice;
    u.volume = settings.vol; u.rate = settings.rate; u.pitch = 1;
    u.onend = u.onerror = () => { speaking = false; setTimeout(pumpSpeech, 150); };
    speaking = true; speakStarted = now();
    synth.speak(u);
  }
  setInterval(pumpSpeech, 1000);

  const imgCache = new Map();
  function loadImg(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.src = url;
    imgCache.set(url, im);
    return im;
  }

  // --------------------------------------------------------------- fighters
  function radiusOf(f) { return f.r * (f.giantUntil > now() ? 1.8 : 1) * (f.king ? 1.9 : 1); }

  function getOrSpawn(user, reason) {
    let f = fighters.get(user.id);
    if (f) {
      if (reason) { // returning viewer: level up instead of a duplicate
        f.level++; f.r = Math.min(f.r + 4, 70); f.power += 3;
        f.maxHp += 15; f.hp = f.maxHp;
        floatText(f.x, f.y - 80, `مستوى ${f.level} ⬆`, '#7CFFB2');
      }
      return f;
    }
    if (fighters.size >= (cfg.maxFighters || 60)) {
      // arena full: replace the weakest fighter
      const weakest = [...fighters.values()].sort((a, b) => a.hp - b.hp)[0];
      if (weakest) fighters.delete(weakest.id);
    }
    f = {
      id: user.id, name: user.name || user.id, avatar: loadImg(user.avatar),
      x: rand(ARENA.x + 80, ARENA.x + ARENA.w - 80), y: rand(ARENA.y + 80, ARENA.y + ARENA.h - 80),
      vx: rand(-150, 150), vy: rand(-150, 150), r: 40, dr: 0,
      hp: 100, maxHp: 100, power: 12, kills: 0, level: 1,
      shieldUntil: now() + 2, giantUntil: 0, king: false, flash: 0, born: now(), hue: hue(user.id),
    };
    fighters.set(f.id, f);
    joinedThisRound++;
    burst(f.x, f.y, `hsl(${f.hue},90%,65%)`, 26);
    return f;
  }

  function damage(target, amount, attacker) {
    if (target.shieldUntil > now() || target.dead) return;
    target.hp -= amount; target.flash = 0.15;
    if (target.hp <= 0) kill(target, attacker);
  }

  function kill(f, by) {
    f.dead = true;
    fighters.delete(f.id);
    burst(f.x, f.y, `hsl(${f.hue},90%,60%)`, 50);
    shake = Math.max(shake, 10);
    if (by && fighters.has(by.id)) {
      by.kills++; by.hp = Math.min(by.maxHp, by.hp + 25); by.r = Math.min(by.r + 2, 70);
      floatText(by.x, by.y - 70, '+1 💀', '#FFD84D');
      log(`💀 ${by.name} ← ${f.name}`);
    }
  }

  // ---------------------------------------------------------------- effects
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(150, 650);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), max: 1.1, color, size: rand(4, 11) });
    }
  }
  function floatText(x, y, text, color) { floaters.push({ x, y, text, color, life: 1.6 }); }
  function log(text) { feed.unshift({ text, t: now() }); feed.length = Math.min(feed.length, 5); }

  const EFFECT_AR = { shield: '🛡️ درع حماية', giant: '🦍 صار عملاق', bomb: '💣 فجّر قنبلة', king: '👑 صار الملك' };
  const EFFECT_SAY = { shield: 'وأخذ درع حماية', giant: 'وصار عملاق', bomb: 'وفجّر قنبلة', king: 'وصار الملك' };
  const timesAr = n => n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`;

  function applyEvent(m) {
    if (phase === 'winner' && ['spawn', 'gift', 'follow', 'share'].includes(m.type)) { pending.push(m); return; }
    const u = m.user;
    switch (m.type) {
      case 'spawn': {
        const isNew = !fighters.has(u.id);
        const f = getOrSpawn(u, isNew ? null : m.reason);
        floatText(f.x, f.y - 90, isNew ? 'دخل الساحة' : '', '#fff');
        log(m.reason === 'likes' ? `❤ ${u.name} جاب ${cfg.likesPerSpawn} لايك` : `💬 ${u.name} انضم`);
        if (isNew) announce(m.reason === 'likes' ? `دخل ${u.name} للعبة بـ ${cfg.likesPerSpawn} لايك` : `دخل ${u.name} للعبة`, 1, '#7CFFB2');
        else announce(`${u.name} صار أقوى، مستوى ${f.level}`, 1, '#7CFFB2');
        break;
      }
      case 'follow': getOrSpawn(u, 'follow'); log(`➕ ${u.name} تابع`); announce(`${u.name} تابع البث ودخل للعبة`, 1, '#7CFFB2'); break;
      case 'share': {
        const f = getOrSpawn(u, 'share'); f.vx *= 2; f.vy *= 2; f.shieldUntil = Math.max(f.shieldUntil, now() + 3);
        log(`↗ ${u.name} شارك البث`); announce(`${u.name} شارك البث`, 1, '#7CFFB2'); break;
      }
      case 'gift': {
        const f = getOrSpawn(u, null);
        const t = now();
        if (m.effect === 'shield') { f.shieldUntil = t + 8; f.hp = f.maxHp; }
        else if (m.effect === 'giant') { f.giantUntil = t + 15; f.power += 10; f.hp = f.maxHp = f.maxHp + 60; }
        else if (m.effect === 'bomb') { explode(f, 420, 70); }
        else if (m.effect === 'king') { f.king = true; f.power += 25; f.hp = f.maxHp = 450; f.shieldUntil = t + 4; explode(f, 300, 40); }
        banners.push({ user: u, gift: m.giftName, repeat: m.repeat, img: loadImg(m.image), effect: m.effect, tier: m.tier, life: 3.5 });
        log(`🎁 ${u.name}: ${m.giftName}${m.repeat > 1 ? ' ×' + m.repeat : ''}`);
        announce(`أرسل ${u.name} ${m.giftName}${m.repeat > 1 ? ' ' + timesAr(m.repeat) : ''}، ${EFFECT_SAY[m.effect] || ''}`, 2, '#FFD84D');
        break;
      }
    }
  }

  function explode(src, radius, dmg) {
    burst(src.x, src.y, '#FFB020', 90); burst(src.x, src.y, '#FF4D4D', 60);
    shake = 28;
    for (const f of [...fighters.values()]) {
      if (f === src) continue;
      const dx = f.x - src.x, dy = f.y - src.y, d = Math.hypot(dx, dy) || 1;
      if (d < radius + radiusOf(f)) {
        f.vx += dx / d * 900; f.vy += dy / d * 900;
        damage(f, dmg * (1 - d / (radius * 1.5)), src);
      }
    }
  }

  // ------------------------------------------------------------- simulation
  const pairHit = new Map();
  function step(dt) {
    const t = now();
    const list = [...fighters.values()];
    for (const f of list) {
      // seek the nearest enemy a little, plus some wandering
      let best = null, bd = Infinity;
      for (const o of list) if (o !== f) { const d = (o.x - f.x) ** 2 + (o.y - f.y) ** 2; if (d < bd) { bd = d; best = o; } }
      if (best) { const d = Math.sqrt(bd) || 1; f.vx += (best.x - f.x) / d * 160 * dt; f.vy += (best.y - f.y) / d * 160 * dt; }
      f.vx += rand(-80, 80) * dt; f.vy += rand(-80, 80) * dt;
      const sp = Math.hypot(f.vx, f.vy), max = f.king ? 300 : 380;
      if (sp > max) { f.vx *= 0.96; f.vy *= 0.96; }
      if (sp < 90) { f.vx *= 1.05; f.vy *= 1.05; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      const r = radiusOf(f);
      f.dr += (r - f.dr) * Math.min(1, dt * 6);
      if (f.x < ARENA.x + r) { f.x = ARENA.x + r; f.vx = Math.abs(f.vx); }
      if (f.x > ARENA.x + ARENA.w - r) { f.x = ARENA.x + ARENA.w - r; f.vx = -Math.abs(f.vx); }
      if (f.y < ARENA.y + r) { f.y = ARENA.y + r; f.vy = Math.abs(f.vy); }
      if (f.y > ARENA.y + ARENA.h - r) { f.y = ARENA.y + ARENA.h - r; f.vy = -Math.abs(f.vy); }
      f.flash = Math.max(0, f.flash - dt);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.dr + b.dr;
      if (d >= min) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const ma = a.dr * a.dr, mb = b.dr * b.dr;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const j2 = -1.9 * rel / (1 / ma + 1 / mb);
        a.vx -= j2 * nx / ma; a.vy -= j2 * ny / ma; b.vx += j2 * nx / mb; b.vy += j2 * ny / mb;
      }
      const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if ((pairHit.get(key) || 0) < t) {
        pairHit.set(key, t + 0.45);
        burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#fff', 6);
        damage(b, a.power * rand(0.8, 1.2), a);
        damage(a, b.power * rand(0.8, 1.2), b);
      }
    }
    if (pairHit.size > 4000) pairHit.clear();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y -= 60 * dt; if (f.life <= 0) floaters.splice(i, 1); }
    if (banners.length) { banners[0].life -= dt * (banners.length > 3 ? 2 : 1); if (banners[0].life <= 0) banners.shift(); }
    shake = Math.max(0, shake - dt * 40);
    for (let i = captions.length - 1; i >= 0; i--) { captions[i].life -= dt; if (captions[i].life <= 0) captions.splice(i, 1); }

    // rounds
    if (phase === 'play') {
      if (fighters.size >= 2) roundLeft -= dt;
      const alive = fighters.size;
      if ((alive === 1 && joinedThisRound >= 2) || (roundLeft <= 0 && alive > 0)) {
        const w = [...fighters.values()].sort((a, b) => b.kills - a.kills || b.hp - a.hp)[0];
        winner = { name: w.name, kills: w.kills, avatar: w.avatar, hue: w.hue };
        wins.set(w.name, (wins.get(w.name) || 0) + 1);
        announce(`انتهت الجولة! الفائز هو ${w.name}`, 2, '#FFD84D');
        phase = 'winner'; phaseT = 7;
        for (let k = 0; k < 6; k++) setTimeout(() => burst(rand(200, 880), rand(500, 1300), `hsl(${rand(0, 360)},90%,60%)`, 60), k * 300);
      }
    } else if (phase === 'winner') {
      phaseT -= dt;
      if (phaseT <= 0) {
        fighters.clear(); pairHit.clear();
        phase = 'play'; round++; roundLeft = cfg.roundSeconds || 180; joinedThisRound = 0; winner = null;
        pending.splice(0).forEach(applyEvent);
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function text(s, x, y, size, color, align = 'center', weight = 800) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function fit(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function drawAvatarCircle(im, x, y, r, h, label) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = `hsl(${h},70%,45%)`; ctx.fill(); ctx.clip();
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
    else text((label || '?').slice(0, 1).toUpperCase(), x, y + 2, r * 1.1, '#fff');
    ctx.restore();
  }

  function drawFighter(f) {
    const t = now(), r = f.dr || f.r;
    const pop = Math.min(1, (t - f.born) * 4);
    const R = r * (0.3 + 0.7 * pop);
    if (f.shieldUntil > t) {
      ctx.beginPath(); ctx.arc(f.x, f.y, R + 12 + Math.sin(t * 10) * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90,200,255,.18)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(120,220,255,.9)'; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(f.x, f.y, R + 5, 0, Math.PI * 2);
    ctx.fillStyle = f.king ? '#FFD84D' : `hsl(${f.hue},90%,60%)`; ctx.fill();
    drawAvatarCircle(f.avatar, f.x, f.y, R, f.hue, f.name);
    if (f.flash > 0) { ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,60,60,.55)'; ctx.fill(); }
    if (f.king) text('👑', f.x, f.y - R - 26, R * 0.9, '#FFD84D');
    // name + hp
    const ny = f.y + R + 26;
    text(fit(f.name, 14), f.x, ny, Math.max(26, Math.min(40, R * 0.65)), '#fff');
    const bw = Math.max(70, R * 1.8), bx = f.x - bw / 2, by = f.y - R - (f.king ? 60 : 22);
    rr(bx, by, bw, 10, 5); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    const pct = Math.max(0, f.hp / f.maxHp);
    rr(bx, by, bw * pct, 10, 5); ctx.fillStyle = pct > .5 ? '#3DFF8A' : pct > .25 ? '#FFC93D' : '#FF4D4D'; ctx.fill();
    if (f.kills) text(`💀${f.kills}`, f.x + R * 0.8, f.y - R * 0.8, 26, '#FFD84D');
  }

  function drawHUD() {
    // title + round
    rr(30, 30, W - 60, 120, 28); ctx.fillStyle = 'rgba(20,22,48,.85)'; ctx.fill();
    text('⚔️ ساحة البث ⚔️', W / 2, 72, 52, '#fff');
    const mm = Math.max(0, Math.ceil(roundLeft)), timer = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
    text(`الجولة ${round}`, W - 70, 122, 30, '#9fb0ff', 'right', 600);
    text(`⏱ ${timer}`, W / 2, 122, 30, '#fff', 'center', 600);
    text(`👥 ${fighters.size}`, 70, 122, 30, '#9fb0ff', 'left', 600);

    // like progress
    const need = cfg.likesPerSpawn || 20;
    rr(30, 170, W - 60, 110, 28); ctx.fillStyle = 'rgba(20,22,48,.85)'; ctx.fill();
    text(`❤️ كل ${need} لايك = اسمك يدخل الساحة`, W / 2, 205, 34, '#FF7AA8');
    rr(60, 236, W - 120, 26, 13); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    const p = Math.min(1, likeBank / need);
    if (p > 0) { rr(60, 236, (W - 120) * p, 26, 13); ctx.fillStyle = '#FF3D7F'; ctx.fill(); }
    text(`${likeBank} من ${need}`, W / 2, 249, 22, '#fff', 'center', 800);

    // gift legend
    const tiers = Object.values(cfg.giftTiers || {}).sort((a, b) => a.minDiamonds - b.minDiamonds);
    const icon = { shield: '🛡️', giant: '🦍', bomb: '💣', king: '👑' };
    const parts = tiers.map(t => `${icon[t.effect] || '🎁'} ${t.minDiamonds}+💎`);
    rr(30, 298, W - 60, 110, 28); ctx.fillStyle = 'rgba(20,22,48,.85)'; ctx.fill();
    text('🎁 الهدايا: درع · عملاق · قنبلة · ملك', W / 2, 330, 30, '#FFD84D');
    text(parts.join('   '), W / 2, 378, 28, '#fff', 'center', 600);

    // leaderboard (bottom)
    const top = [...fighters.values()].sort((a, b) => b.kills - a.kills || b.hp - a.hp).slice(0, 3);
    const champs = [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    rr(30, ARENA.y + ARENA.h + 20, W / 2 - 40, 250, 24); ctx.fillStyle = 'rgba(20,22,48,.85)'; ctx.fill();
    rr(W / 2 + 10, ARENA.y + ARENA.h + 20, W / 2 - 40, 250, 24); ctx.fill();
    const by = ARENA.y + ARENA.h + 55;
    text('🔥 الأقوى هسه', W / 4 + 5, by, 30, '#FFD84D');
    top.forEach((f, i) => text(`${i + 1}. ${fit(f.name, 12)}  💀${f.kills}`, W / 4 + 5, by + 50 + i * 50, 28, '#fff', 'center', 600));
    text('🏆 الفائزين', W * 3 / 4 - 5, by, 30, '#FFD84D');
    champs.forEach(([n, c], i) => text(`${i + 1}. ${fit(n, 12)}  🏆${c}`, W * 3 / 4 - 5, by + 50 + i * 50, 28, '#fff', 'center', 600));
    if (!champs.length) text('—', W * 3 / 4 - 5, by + 60, 28, '#9fb0ff');
  }

  function drawFeed() {
    let y = ARENA.y + 30;
    for (const e of feed) {
      const a = Math.max(0, 1 - (now() - e.t) / 8);
      if (!a) continue;
      ctx.globalAlpha = a; text(fit(e.text, 30), ARENA.x + ARENA.w - 24, y, 26, '#fff', 'right', 600); ctx.globalAlpha = 1;
      y += 38;
    }
  }

  function drawBanner() {
    const b = banners[0]; if (!b) return;
    const k = Math.min(1, (3.5 - b.life) * 5, b.life * 4);
    const y = ARENA.y + 330;
    ctx.save(); ctx.globalAlpha = Math.max(0, k); ctx.translate(W / 2, y); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
    const col = { small: '#3D8BFF', medium: '#B04DFF', large: '#FF7A1A', huge: '#FFC400' }[b.tier] || '#B04DFF';
    rr(-470, -110, 940, 220, 40); ctx.fillStyle = 'rgba(10,10,25,.92)'; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = col; ctx.stroke();
    if (b.img && b.img.complete && b.img.naturalWidth) ctx.drawImage(b.img, -440, -80, 160, 160);
    else text('🎁', -360, 0, 110, '#fff');
    text(fit(b.user.name, 16), 70, -52, 56, '#fff');
    text(`أرسل ${b.gift}${b.repeat > 1 ? ' ×' + b.repeat : ''}`, 70, 8, 38, '#FFD84D', 'center', 600);
    text(EFFECT_AR[b.effect] || '', 70, 62, 40, col);
    ctx.restore();
  }

  function drawCaptions() {
    let y = ARENA.y + ARENA.h - 60;
    for (let i = captions.length - 1; i >= 0; i--) {
      const c = captions[i], a = Math.min(1, c.life * 2, (4 - c.life) * 6);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `800 40px ${FONT}`;
      const s = fit(c.text, 34), w = Math.min(ARENA.w - 40, ctx.measureText(s).width + 60);
      rr(W / 2 - w / 2, y - 34, w, 68, 34); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fill();
      text(s, W / 2, y, 40, c.color);
      y -= 80;
    }
    ctx.globalAlpha = 1;
  }

  function drawWinner() {
    if (phase !== 'winner' || !winner) return;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    text('🏆 الفائز 🏆', W / 2, 700, 90, '#FFD84D');
    drawAvatarCircle(winner.avatar, W / 2, 900, 120, winner.hue, winner.name);
    text(fit(winner.name, 18), W / 2, 1090, 80, '#fff');
    text(`💀 ${winner.kills} قتلات`, W / 2, 1180, 44, '#FFD84D', 'center', 600);
    text(`الجولة الجاية بعد ${Math.ceil(phaseT)}…`, W / 2, 1270, 36, '#9fb0ff', 'center', 600);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!document.body.classList.contains('transparent')) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#11143a'); g.addColorStop(1, '#070812');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    rr(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 40); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(140,160,255,.45)'; ctx.stroke();
    if (fighters.size === 0 && phase === 'play') {
      text('الساحة فاضية', W / 2, ARENA.y + ARENA.h / 2 - 50, 64, '#fff');
      text(`دز لايكات أو اكتب ${cfg.joinCommand || ''} حتى تدخل`, W / 2, ARENA.y + ARENA.h / 2 + 30, 38, '#FF7AA8', 'center', 600);
    }
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    [...fighters.values()].sort((a, b) => a.dr - b.dr).forEach(drawFighter);
    for (const f of floaters) { ctx.globalAlpha = Math.min(1, f.life); if (f.text) text(f.text, f.x, f.y, 36, f.color); }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHUD(); drawFeed(); drawCaptions(); drawBanner(); drawWinner();
    if (statusMsg.state !== 'connected' || now() - statusAt < 4) {
      const c = { connected: '#3DFF8A', error: '#FF4D4D', ended: '#FFC93D' }[statusMsg.state] || '#9fb0ff';
      text(fit(statusMsg.text, 60), W / 2, H - 22, 24, c, 'center', 600);
    }
  }

  let last = now();
  function loop() {
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    step(dt); draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // -------------------------------------------------------------- websocket
  let ws;
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'status') { statusMsg = m; statusAt = now(); showStatus(); }
      else if (m.type === 'likeProgress') { likeBank = m.bank; likeLast = m.lastUser || likeLast; if (m.needed) cfg.likesPerSpawn = m.needed; }
      else applyEvent(m);
    };
    ws.onopen = () => { if (wantStart) ws.send(JSON.stringify(wantStart)); };
    ws.onclose = () => { statusMsg = { state: 'error', text: 'انقطع الاتصال بالسيرفر… دا نعيد المحاولة' }; setTimeout(connect, 2000); };
  }
  connect();

  // ------------------------------------------------- شاشة البداية والإعدادات
  const $ = id => document.getElementById(id);
  const setup = $('setup'), testPanel = $('test');
  let wantStart = null;               // آخر أمر بدأ بيه (حتى نعيده إذا انقطع السيرفر ورجع)

  $('user').value = params.get('user') || settings.user || '';
  for (const k of ['voiceOn', 'sayJoins', 'testOn', 'clean']) $(k).checked = !!settings[k];
  $('vol').value = settings.vol; $('rate').value = settings.rate;

  function applySettings() {
    for (const k of ['voiceOn', 'sayJoins', 'testOn', 'clean']) settings[k] = $(k).checked;
    settings.vol = Number($('vol').value); settings.rate = Number($('rate').value);
    testPanel.classList.toggle('on', settings.testOn && !setup.classList.contains('on'));
    document.body.classList.toggle('clean', settings.clean);
    if (!settings.voiceOn && synth) { synth.cancel(); speechQ.length = 0; speaking = false; }
    saveSettings();
  }
  setup.addEventListener('change', applySettings);

  function showStatus() {
    $('status').textContent = statusMsg.text || '';
    $('status').style.color = { connected: '#3DFF8A', error: '#FF6B6B', ended: '#FFC93D' }[statusMsg.state] || '#FFD84D';
  }

  // التلفون يحتاج ضغطة حتى يشغل الصوت، فنشغل كلمة فاضية بأول ضغطة
  function unlockAudio() {
    if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'ar-SA'; synth.speak(u); }
  }
  async function keepScreenOn() {
    try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !setup.classList.contains('on')) keepScreenOn(); });

  function enterGame() {
    unlockAudio(); keepScreenOn();
    const el = document.documentElement;
    try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } catch {}
    setup.classList.remove('on'); applySettings();
  }
  function send(msg) { wantStart = msg; if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

  $('go').onclick = () => {
    const u = $('user').value.trim();
    if (!u) { $('status').textContent = 'اكتب يوزرك أول'; return; }
    settings.user = u; saveSettings();
    send({ type: 'connect', username: u }); enterGame();
    announce('بدت اللعبة! دزوا لايكات حتى تدخلون الساحة', 2, '#FF7AA8');
  };
  $('demo').onclick = () => { send({ type: 'demo' }); enterGame(); announce('وضع التجربة', 2, '#FF7AA8'); };
  $('close').onclick = enterGame;
  $('testVoice').onclick = () => { unlockAudio(); applySettings(); announce('أرسل علي وردة، وأخذ درع حماية', 2, '#FFD84D'); };
  $('gear').onclick = () => { setup.classList.add('on'); testPanel.classList.remove('on'); };

  // ضغطتين على العنوان (أعلى الشاشة) تفتح الإعدادات
  let lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    if ((e.clientY - r.top) / r.height * H > 300) return;
    const t = Date.now();
    if (t - lastTap < 400) $('gear').onclick();
    lastTap = t;
  });

  testPanel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'simulate', kind: b.dataset.k, count: b.dataset.c, diamonds: b.dataset.d,
      giftName: b.dataset.g, name: $('tname').value.trim() || undefined }));
  });

  // إذا الرابط بيه ?user=... أو ?demo نبدأ مباشرة (مفيد للكمبيوتر و OBS)
  if (params.has('demo')) { setup.classList.remove('on'); send({ type: 'demo' }); applySettings(); }
  else if (params.get('user')) { setup.classList.remove('on'); send({ type: 'connect', username: params.get('user') }); applySettings(); }
  else applySettings();
  if (params.has('test')) { $('testOn').checked = true; applySettings(); }
})();
