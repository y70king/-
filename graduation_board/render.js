// Renders board.svg to a true-size PDF and a PNG preview using Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const svgPath = path.join(__dirname, 'board.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const [W, H] = [parseFloat(m[1]), parseFloat(m[2])]; // mm
  const html = `<!doctype html><html><head><style>
    @page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0}
    svg{display:block;width:${W}mm;height:${H}mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(__dirname, 'board.pdf'), width: `${W}mm`, height: `${H}mm`, printBackground: true });
  const pxW = 2400, pxH = Math.round(pxW * H / W);
  await page.setViewportSize({ width: pxW, height: pxH });
  await page.addStyleTag({ content: `svg{width:${pxW}px!important;height:${pxH}px!important}` });
  await page.screenshot({ path: path.join(__dirname, 'board_preview.png') });
  await browser.close();
})();
