// node poster.mjs <outDir>  → turbo_poster_story.png (2160×3840) + turbo_poster_post.png (2160×2700)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'path';
const out = process.argv[2] || '.'; const S = 2;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--force-color-profile=srgb'] });
const p = await b.newPage({ viewport: { width: 1080 * S, height: 1920 * S } });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('file://' + path.resolve('poster.html') + '?s=' + S);
await p.evaluate(() => window.posterReady);
await p.evaluate(() => posterRender('story'));
await p.screenshot({ path: path.join(out, 'turbo_poster_story.png'), clip: { x: 0, y: 0, width: 1080 * S, height: 1920 * S } });
await p.evaluate(() => posterRender('post'));
await p.screenshot({ path: path.join(out, 'turbo_poster_post.png'), clip: { x: 0, y: 0, width: 1080 * S, height: 1350 * S } });
await b.close();
