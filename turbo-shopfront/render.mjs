// node render.mjs  → shopfront_night.png, shopfront_day.png, shopfront_spec.png (3840×2160)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'path';
const S = 2;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--force-color-profile=srgb'] });
const p = await b.newPage({ viewport: { width: 1920 * S, height: 1080 * S } });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('file://' + path.resolve('shopfront.html') + '?s=' + S);
await p.evaluate(() => window.ready);
for (const [name, fn] of [['night', "facade('night')"], ['day', "facade('day')"], ['spec', 'spec()']]) {
  await p.evaluate(fn);
  await p.screenshot({ path: `shopfront_${name}.png`, clip: { x: 0, y: 0, width: 1920 * S, height: 1080 * S } });
}
await b.close();
