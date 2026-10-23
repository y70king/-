// Builds the absence register (.docx) from the bundled template.
// Template markers: @@MONTHS@@ (paragraph), @@CLASSLINE@@, @@SCHOOL@@, @@GOV@@.

const MONTHS = [
  [9, 'أيلــــــول', 'التاســـع'], [10, 'تشرين الأول', 'العاشــر'], [11, 'تشرين الثاني', 'الحادي عشر'],
  [12, 'كانون الأول', 'الثاني عشر'], [1, 'كانون الثاني', 'الأول'], [2, 'شباط', 'الثاني'],
  [3, 'آذار', 'الثالث'], [4, 'نيسان', 'الرابع'], [5, 'أيار', 'الخامس'],
];
// Fixed-date official holidays in Iraq that fall in the school months (month, day).
const FIXED_HOLIDAYS = [[10, 3], [12, 10], [12, 25], [1, 1], [1, 6], [3, 21], [5, 1]];

const BLUE = '<w:shd w:val="clear" w:color="auto" w:fill="BDD6EE" w:themeFill="accent5" w:themeFillTint="66"/>';
const PINK = '<w:shd w:val="clear" w:color="auto" w:fill="FBE4D5" w:themeFill="accent2" w:themeFillTint="33"/>';
const GREEN = '<w:shd w:val="clear" w:color="auto" w:fill="E2EFD9" w:themeFill="accent6" w:themeFillTint="33"/>';
// Month-page layout copied from the user's template: September 1-15 is a full-width page with the names;
// every other half-month is a half-width table on its own page (1-15 on the left, 16-end on the right).
const TW = 10886;               // full table width = page width minus the 510 margins (dxa)
const HALF_TW = 5310;           // half table width (dxa)
const DAY_W = 295;              // day / serial column width in half tables (dxa)
const ROWS_PER_PAGE = 32;       // 32 numbered rows; spare ones stay blank for transferred students
const ROW_H = 454;              // row height, as in the template
const MONTH_MARGIN = 510;       // month pages use the template's 510-twip page margins (own section)
const PAGE_W = 7560310, PAGE_H = 10692130;   // A4 in EMU

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function arDigits(s) { return String(s).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function rpr(sz, bold, font) {
  return '<w:rPr>' + font + (bold ? '<w:b/><w:bCs/>' : '') +
    '<w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz +
    '"/><w:rtl/><w:lang w:bidi="ar-IQ"/></w:rPr>';
}
const SULTAN = '<w:rFonts w:cs="Sultan Medium" w:hint="cs"/>';
const MAJOR = '<w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi" w:hint="cs"/>';

function cell(width, o = {}) {
  const { text = '', shd = '', span = 1, sz = 20, bold = false, name = false } = o;
  const font = name ? MAJOR : SULTAN;
  const run = text ? '<w:r>' + rpr(sz, bold, font) + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>' : '';
  return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
    shd + '<w:noWrap/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
    '<w:jc w:val="' + (name ? 'right' : 'center') + '"/>' + rpr(sz, bold, SULTAN) + '</w:pPr>' + run + '</w:p></w:tc>';
}
function row(cells, h) {
  return '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + h + '" w:hRule="exact"/><w:jc w:val="center"/></w:trPr>' +
    cells.join('') + '</w:tr>';
}

let docPrId = 700000;
function picture(rid, x, y, cx, cy) {
  const i = ++docPrId;
  return '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (251600000 + i) +
    '" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
    '<wp:positionH relativeFrom="page"><wp:posOffset>' + x + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + y + '</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + i + '" name="bg' + i + '"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + i + '" name="bg' + i + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:anchor></w:drawing></w:r>';
}
// The template's black thick-thin page frame.
function frame(x, y, cx, cy) {
  const i = ++docPrId;
  return '<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (252600000 + i) +
    '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
    '<wp:positionH relativeFrom="page"><wp:posOffset>' + x + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + y + '</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="19050" t="19050" r="40005" b="46355"/><wp:wrapNone/><wp:docPr id="' + i + '" name="frame' + i + '"/><wp:cNvGraphicFramePr/>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>' +
    '<a:ln w="60325" cmpd="thickThin"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></wps:spPr>' +
    '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr"><a:noAutofit/></wps:bodyPr></wps:wsp>' +
    '</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>';
}
// Paragraph that starts a month page and carries its background and frame.
function pageParagraph(layout, breakBefore) {
  let art;
  if (layout === 'full') {
    art = picture('rId13', 0, 0, PAGE_W, PAGE_H) + frame((PAGE_W - 7146025) >> 1, (PAGE_H - 10223595) >> 1, 7146025, 10223595);
  } else {
    const bgW = 4023995, frW = 3541594, frH = 10203123, m = 323850; // m = 510-twip margin in EMU
    const right = layout === 'right';
    art = picture('rId17', right ? PAGE_W - bgW : 0, 0, bgW, PAGE_H) +
      frame(right ? PAGE_W - m - frW + 87000 : m - 87000, (PAGE_H - frH) >> 1, frW, frH);
  }
  return '<w:p><w:pPr>' + (breakBefore ? '<w:pageBreakBefore/>' : '') +
    '<w:spacing w:after="0" w:line="20" w:lineRule="exact"/><w:jc w:val="center"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>' + art + '</w:p>';
}

// pg: one entry of planMonthPages.
function monthTable(pg) {
  const n = pg.days.length;
  let widths;
  if (pg.layout === 'full') {
    widths = Array(n + 1).fill(329).concat([1247, 2830, 1247, 397]);
    widths[0] += TW - widths.reduce((a, b) => a + b, 0);
  } else {
    widths = [HALF_TW - DAY_W * (n + 1)].concat(Array(n + 1).fill(DAY_W)); // م takes what is left
  }
  const total = widths.reduce((a, b) => a + b, 0);
  // Half tables are padded to the full page width with a borderless empty column, so they sit on their
  // half of the page in every viewer (some phone viewers ignore table alignment and centre the table).
  const half = pg.layout !== 'full', spW = TW - total;
  const spacer = () => '<w:tc><w:tcPr><w:tcW w:w="' + spW + '" w:type="dxa"/><w:tcBorders><w:top w:val="nil"/>' + // schema order: top, left, bottom, right
    (pg.layout === 'right' ? '<w:left w:val="nil"/><w:bottom w:val="nil"/>' : '<w:bottom w:val="nil"/><w:right w:val="nil"/>') +
    '</w:tcBorders></w:tcPr><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p></w:tc>';
  const pad = cells => !half ? cells : pg.layout === 'right' ? [spacer()].concat(cells) : cells.concat([spacer()]);
  const allW = !half ? widths : pg.layout === 'right' ? [spW].concat(widths) : widths.concat([spW]);
  const grid = allW.map(x => '<w:gridCol w:w="' + x + '"/>').join('');
  const dd = pg.days.slice().reverse(); // right-to-left: first day on the right
  const daySz = 18; // 9pt keeps two-digit days on one line in the narrow columns
  const rows = [row(pad([cell(total, { text: pg.title, shd: BLUE, span: widths.length, sz: 24, bold: true })]), ROW_H)];
  const hdr = [cell(widths[0], { text: 'م', shd: BLUE, sz: daySz })];
  dd.forEach((d, k) => hdr.push(cell(widths[k + 1], { text: String(d), sz: daySz, shd: pg.isOff(d) ? PINK : BLUE })));
  if (pg.layout === 'full') hdr.push(cell(1247, { text: 'التولد', shd: BLUE, sz: 24 }), cell(2830, { text: 'اسم الطالبـ/ ـة', shd: BLUE, sz: 24 }),
    cell(1247, { text: 'رقم القيد', shd: BLUE, sz: 24 }), cell(397, { text: 'ت', shd: BLUE, sz: 24 }));
  else hdr.push(cell(DAY_W, { text: 'ت', shd: BLUE, sz: daySz }));
  rows.push(row(pad(hdr), ROW_H));
  pg.students.forEach((nm, j) => {
    const cs = [cell(widths[0])];
    dd.forEach((d, k) => cs.push(cell(widths[k + 1], { shd: pg.isOff(d) ? PINK : '' })));
    const num = cell(pg.layout === 'full' ? 397 : DAY_W, { text: String(pg.start + j), shd: GREEN, sz: daySz });
    if (pg.layout === 'full') {
      const sz = pg.rowH < ROW_H ? (nm.length > 26 ? 16 : 18) : (nm.length > 26 ? 18 : 22);
      cs.push(cell(1247), cell(2830, { text: nm, sz, bold: true, name: true }), cell(1247), num);
    } else cs.push(num);
    rows.push(row(pad(cs), pg.rowH));
  });
  return '<w:tbl><w:tblPr><w:tblStyle w:val="a3"/><w:tblW w:w="' + TW + '" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="0" w:type="dxa"/>' +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="28" w:type="dxa"/><w:right w:w="28" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
    '<w:tblGrid>' + grid + '</w:tblGrid>' + rows.join('') + '</w:tbl>';
}

// extraHolidays: array of Date objects (local) to shade in addition to Fri/Sat and fixed holidays.
// The month pages of the register, shared by the Word and PDF outputs.
function planMonthPages(names, startYear, extraHolidays) {
  const extra = new Set(extraHolidays.map(d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()));
  // As in the template: rows 1-32 get the whole year (September to May), then students 33-64 get
  // their own lists for the whole year, and so on. The template always has both lists.
  const perPage = ROWS_PER_PAGE;
  const sets = Math.max(2, Math.ceil(names.length / perPage));
  const out = [];
  for (let set = 0; set < sets; set++) {
    const start = set * perPage + 1, students = [];
    for (let i = 0; i < perPage; i++) students.push(names[start - 1 + i] || '');
    for (const [m, mName, ordinal] of MONTHS) {
      const y = m >= 9 ? startYear : startYear + 1;
      const isOff = d => {
        const wd = new Date(y, m - 1, d).getDay();
        return wd === 5 || wd === 6 || FIXED_HOLIDAYS.some(([hm, hd]) => hm === m && hd === d) || extra.has(y + '-' + m + '-' + d);
      };
      const last = daysInMonth(y, m);
      for (const [firstHalf, a, b] of [[true, 1, 15], [false, 16, last]]) {
        const days = [];
        for (let d = a; d <= b; d++) days.push(d);
        const layout = m === 9 && firstHalf ? 'full' : firstHalf ? 'left' : 'right';
        let title = 'شهر  ' + mName + '  -  ' + ordinal + '  ' + m + '  /  ' + y;
        if (layout === 'full') title += '     ( من ' + a + ' إلى ' + b + ' )';
        out.push({ title, days, isOff, layout, students, start, rowH: ROW_H });
      }
    }
  }
  return out;
}

// Month pages get their own section with the template's margins; the earlier pages keep theirs.
const FRONT_SECTION = '<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>' +
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="0" w:right="510" w:bottom="1276" w:left="510" w:header="0" w:footer="0" w:gutter="0"/>' +
  '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p>';
const BODY_MARGINS_OLD = '<w:pgMar w:top="0" w:right="510" w:bottom="1276" w:left="510" w:header="0" w:footer="0" w:gutter="0"/>';
const BODY_MARGINS_NEW = '<w:pgMar w:top="' + MONTH_MARGIN + '" w:right="510" w:bottom="' + MONTH_MARGIN + '" w:left="510" w:header="0" w:footer="0" w:gutter="0"/>';

function buildMonths(names, startYear, extraHolidays) {
  return FRONT_SECTION + planMonthPages(names, startYear, extraHolidays)
    .map((pg, i) => pageParagraph(pg.layout, i > 0) + monthTable(pg)).join('');
}

// Draws the green "٢٠٢٦ – ٢٠٢٧" cover image (390x250 like the template image) and returns base64 PNG.
function yearImageBase64(startYear) {
  const S = 3, W = 390 * S, H = 250 * S;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const right = arDigits(startYear), left = arDigits(startYear + 1);
  const fontPx = 110 * S;
  g.font = 'bold ' + fontPx + 'px "Noto Naskh Arabic", "Noto Sans Arabic", "Droid Arabic Naskh", sans-serif';
  g.textBaseline = 'middle';
  g.direction = 'ltr';
  const wR = g.measureText(right).width, wL = g.measureText(left).width, dash = 70 * S, gap = 22 * S;
  let total = wL + gap + dash + gap + wR;
  const scaleX = Math.min(1, (W - 20 * S) / total);
  const cy = H / 2;
  const grad = g.createLinearGradient(0, cy - fontPx * 0.45, 0, cy + fontPx * 0.45);
  grad.addColorStop(0, '#78d78c');
  grad.addColorStop(1, '#28732a');
  g.save();
  g.translate(W / 2, 0);
  g.scale(scaleX, 1);
  g.translate(-total / 2, 0);
  const draw = (fn) => {
    g.shadowColor = 'rgba(60,60,60,0.55)'; g.shadowBlur = 10 * S; g.shadowOffsetX = 3 * S; g.shadowOffsetY = 4 * S;
    g.lineWidth = 3 * S; g.strokeStyle = '#c8a028'; fn(true);
    g.shadowColor = 'transparent'; g.fillStyle = grad; fn(false);
  };
  draw(stroke => {
    if (stroke) { g.strokeText(left, 0, cy); g.strokeText(right, wL + gap * 2 + dash, cy); g.strokeRect(wL + gap, cy - 7 * S, dash, 14 * S); }
    else { g.fillText(left, 0, cy); g.fillText(right, wL + gap * 2 + dash, cy); g.fillRect(wL + gap, cy - 7 * S, dash, 14 * S); }
  });
  g.restore();
  const small = document.createElement('canvas');
  small.width = 390; small.height = 250;
  small.getContext('2d').drawImage(c, 0, 0, 390, 250);
  return small.toDataURL('image/png').split(',')[1];
}

// Empty fields become dotted lines to fill in by hand, as on the blank template.
function coverTexts(o) {
  return {
    classLine: 'الصف  ' + (o.className || '.................') + '  -  الشعبة  ' + (o.section ? '( ' + o.section + ' )' : '.........'),
    school: o.school || '.................................................',
    gov: o.gov || '....................................',
  };
}

async function buildRegister(templateBytes, opts) {
  const zip = await JSZip.loadAsync(templateBytes);
  let doc = await zip.file('word/document.xml').async('string');
  const c = coverTexts(opts);
  doc = doc.split('@@CLASSLINE@@').join(esc(c.classLine))
    .split('@@SCHOOL@@').join(esc(c.school))
    .split('@@GOV@@').join(esc(c.gov));
  const months = buildMonths(opts.names, opts.startYear, opts.extraHolidays || []);
  const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?@@MONTHS@@[\s\S]*?<\/w:p>/;
  if (!re.test(doc)) throw new Error('template marker missing');
  doc = doc.replace(re, () => months);
  if (doc.split(BODY_MARGINS_OLD).length !== 3) throw new Error('template margins changed');
  const k = doc.lastIndexOf(BODY_MARGINS_OLD); // the body's final sectPr = the month section
  doc = doc.slice(0, k) + BODY_MARGINS_NEW + doc.slice(k + BODY_MARGINS_OLD.length);
  zip.file('word/document.xml', doc);
  zip.file('word/media/image4.png', yearImageBase64(opts.startYear), { base64: true });
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// ---------- reading name lists ----------
const HEADER_WORDS = new Set(['اسم', 'الاسم', 'الطالب', 'الطالبة', 'الطالبـ', 'التولد', 'المواليد', 'القيد', 'الصف', 'الشعبة',
  'المدرسة', 'ثانوية', 'متوسطة', 'اعدادية', 'إعدادية', 'ابتدائية', 'المديرية', 'ملاحظات', 'الملاحظات', 'قائمة', 'أسماء', 'اسماء',
  'المجموع', 'التسلسل', 'الرقم', 'العام', 'الدراسي', 'الطلبة', 'الطلاب', 'تربية', 'لتربية', 'ادارة', 'إدارة', 'التوقيع', 'المواد',
  'الدرجة', 'الدرجات', 'السعي', 'النتيجة', 'المعدل', 'رقم', 'تاريخ', 'الولادة', 'التلاميذ', 'جدول', 'الغيابات', 'شهر',
  'المادة', 'مادة', 'عشر', 'الهيئة', 'للتلاميذ', 'يوما', 'باللون', 'نظام', 'المدارس', 'الدوام', 'الغياب', 'المجاز', 'المنقولين', 'المعاون', 'المدير', 'مدير', 'معاون', 'شؤون']);

function cleanName(s) {
  s = s.replace(/ـ/g, '')                                   // tatweel
    .replace(/^[\s\d٠-٩]+[\s\-–.)\/\\:]*/, '')                   // leading numbering "12- " "١٢)"
    .replace(/[0-9٠-٩]+/g, ' ')
    .replace(/[؟?!.,،؛;:_*•●▪◦"«»\-–|\/\\]+/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*\(\s*/g, ' (').replace(/\s*\)/g, ')')
    .replace(/\s+/g, ' ').trim();
  return s;
}
function looksLikeName(s) {
  const words = s.replace(/[()]/g, ' ').split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if ((s.match(/[ء-ي]/g) || []).length < 5) return false;
  if (/[A-Za-z]/.test(s)) return false;
  return !words.some(w => HEADER_WORDS.has(w));
}
function namesFromLines(lines) {
  const out = [], seen = new Set();
  for (const raw of lines) {
    const n = cleanName(raw);
    if (!looksLikeName(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

async function linesFromDocx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const inside = (node, test) => { for (let a = node.parentNode; a; a = a.parentNode) if (test(a)) return true; return false; };
  const tableLines = [], otherLines = [];
  for (const p of dom.getElementsByTagNameNS(W, 'p')) {
    // text boxes and VML fallbacks hold titles/duplicates, not student names
    if (inside(p, a => a.localName === 'txbxContent' || a.localName === 'Fallback')) continue;
    const target = inside(p, a => a.namespaceURI === W && a.localName === 'tc') ? tableLines : otherLines;
    let t = '';
    for (const n of p.getElementsByTagNameNS(W, '*')) {
      let owner = n.parentNode;
      while (owner && !(owner.namespaceURI === W && owner.localName === 'p')) owner = owner.parentNode;
      if (owner !== p) continue; // belongs to a nested paragraph (e.g. inside a drawing)
      if (n.localName === 't') t += n.textContent;
      else if (n.localName === 'tab') t += ' ';
      else if (n.localName === 'br') { target.push(t); t = ''; }
    }
    target.push(t);
  }
  // A list kept in a table is the usual layout; if the tables hold enough names, ignore the rest of the page.
  return namesFromLines(tableLines).length >= 5 ? tableLines : tableLines.concat(otherLines);
}

// Arabic presentation-form ligatures (lam-alef etc.) must be decomposed by us: pdf.js's own
// normalization runs after its bidi reordering and turns "لا" into "ال" (e.g. صلاح -> صالح).
function normalizePdfText(s) { return s.normalize('NFKC'); }

async function linesFromPdf(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const numbered = [], all = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent({ disableNormalization: true }); // worker is patched: multi-char Arabic glyphs (lam-alef) keep their order through bidi
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find(r => Math.abs(r.y - y) < 4);
      if (!r) rows.push(r = { y, items: [] });
      r.items.push({ x, s: normalizePdfText(it.str) });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => b.x - a.x); // right-to-left
      // split a row into cells at numeric-only items (serial numbers / number columns)
      let cur = [], hasNumber = false;
      const segs = [];
      const flush = () => { if (cur.length) segs.push(cur.join(' ')); cur = []; };
      for (const it of r.items) {
        if (/^[\s\d٠-٩.\-/]+$/.test(it.s)) { hasNumber = true; flush(); continue; }
        cur.push(it.s);
      }
      flush();
      all.push(...segs);
      if (hasNumber) numbered.push(...segs);
    }
  }
  // Rows with a serial number are the list itself; fall back to every line when there are too few.
  return namesFromLines(numbered).length >= 5 ? numbered : all;
}

if (typeof module !== 'undefined') module.exports = { cleanName, looksLikeName, namesFromLines };
