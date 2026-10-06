// usage: node render.js <outDir> <fps> [start end] | node render.js --stills t1,t2,... <outDir>
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const args = process.argv.slice(2);
  const stills = args[0] === '--stills' ? args[1].split(',').map(Number) : null;
  const out = stills ? args[2] : args[0];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.evaluate(() => window.ready);
  const shot = async (t, file) => {
    const data = await page.evaluate(t => { window.render(t); return document.getElementById('c').toDataURL('image/jpeg', 0.95); }, t);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  };
  if (stills) { for (const t of stills) await shot(t, path.join(out, `s_${t.toFixed(2)}.jpg`)); }
  else {
    const fps = +args[1], dur = 35, a = +(args[2] ?? 0), b = +(args[3] ?? Math.round(dur * fps));
    for (let f = a; f < b; f++) await shot(f / fps, path.join(out, `f_${String(f).padStart(5, '0')}.jpg`));
  }
  await browser.close();
})();
