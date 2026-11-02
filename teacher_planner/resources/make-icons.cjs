// يولّد أيقونات وشاشات بداية أندرويد من ملفات SVG: node resources/make-icons.cjs
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const RES = path.join(__dirname, "../android/app/src/main/res");
const icon = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const fg = fs.readFileSync(path.join(__dirname, "icon-foreground.svg"), "utf8");
const pngSize = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (html, w, h, out, transparent) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:${transparent ? "transparent" : "#1f2d50"}">${html}</body></html>`);
    await p.screenshot({ path: out, omitBackground: !!transparent });
  };
  for (const d of fs.readdirSync(RES).filter((d) => d.startsWith("mipmap-") && !d.includes("anydpi"))) {
    for (const [name, svg, round, transparent] of [["ic_launcher.png", icon, false, true], ["ic_launcher_round.png", icon, true, true], ["ic_launcher_foreground.png", fg, false, true]]) {
      const f = path.join(RES, d, name); if (!fs.existsSync(f)) continue;
      const [w] = pngSize(f);
      const s = round ? svg.replace('rx="24"', 'rx="54"') : svg;
      await shot(s.replace("<svg ", `<svg width="${w}" height="${w}" `), w, w, f, transparent);
    }
  }
  for (const d of fs.readdirSync(RES).filter((d) => d.startsWith("drawable"))) {
    const f = path.join(RES, d, "splash.png"); if (!fs.existsSync(f)) continue;
    const [w, h] = pngSize(f); const s = Math.round(Math.min(w, h) * 0.32);
    await shot(`<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.12}px">
      ${icon.replace("<svg ", `<svg width="${s}" height="${s}" `)}
      <div style="color:#fff;font:700 ${Math.round(s * 0.2)}px 'Noto Naskh Arabic','Noto Sans Arabic',sans-serif">مُخطِّط المعلم</div></div>`, w, h, f);
  }
  await b.close();
})();
