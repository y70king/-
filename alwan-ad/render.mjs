// Usage: node render.mjs <outDir> <scale> <fps> <worker> <workers> [t1,t2,...]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const [outDir, scale = '2', fps = '30', wk = '0', wks = '1', list] = process.argv.slice(2);
const S = +scale, FPS = +fps, DUR = 38.0;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-gpu', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1080 * S, height: 1920 * S }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.log('[err]', e.message));
await page.goto('file://' + path.resolve('ad.html') + '?s=' + S);
await page.evaluate(() => window.ready);
const times = list ? list.split(',').map(Number) : [...Array(Math.round(DUR * FPS)).keys()].filter(i => i % +wks === +wk).map(i => i / FPS);
for (const t of times) {
  const f = list ? `t${t.toFixed(2)}` : String(Math.round(t * FPS)).padStart(5, '0');
  const file = path.join(outDir, f + (list ? '.png' : '.jpg'));
  if (!list && fs.existsSync(file)) continue;
  await page.evaluate(t => window.render(t), t);
  await page.screenshot({ path: file, type: list ? 'png' : 'jpeg', quality: list ? undefined : 96, clip: { x: 0, y: 0, width: 1080 * S, height: 1920 * S } });
}
await browser.close();
