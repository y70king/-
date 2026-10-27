// usage: node render.js <outdir> <fps> <start> <end> [step] [times...]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, fps, f0, f1, ...extra] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
  const times = extra.length ? extra.map(Number) : null;
  const list = times ? times.map((t, i) => [i, t]) : [];
  if (!times) for (let f = +f0; f < +f1; f++) list.push([f, f / +fps]);
  const t0 = Date.now();
  for (const [f, t] of list) {
    await page.evaluate(t => window.renderFrame(t), t);
    await page.screenshot({ path: `${out}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
    if (f % 50 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
})();
