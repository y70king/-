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
const TW = 10985;               // table width (dxa)
const ROWS_PER_PAGE = 32;       // like the new template: 32 numbered rows, spare ones stay blank for transfers
const ROW_H = 430;              // twips; title 480 + header 440 + 32 rows fit an A4 page with the top spacer

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
    shd + '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
    '<w:jc w:val="' + (name ? 'right' : 'center') + '"/>' + rpr(sz, bold, SULTAN) + '</w:pPr>' + run + '</w:p></w:tc>';
}
function row(cells, h) {
  return '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + h + '" w:hRule="exact"/><w:jc w:val="center"/></w:trPr>' +
    cells.join('') + '</w:tr>';
}

let docPrId = 700000;
function backgroundParagraph() {
  const i = ++docPrId;
  return '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:after="0" w:line="560" w:lineRule="exact"/><w:jc w:val="center"/></w:pPr>' +
    '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (251600000 + i) +
    '" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
    '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="7560310" cy="10692130"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + i + '" name="bg' + i + '"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + i + '" name="bg' + i + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rId13"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="7560310" cy="10692130"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:anchor></w:drawing></w:r></w:p>';
}

// One page: title row, header row, and the given students (numbered from `start`).
function monthTable(title, days, isOff, firstHalf, students, start, rowH, nameSz) {
  let widths;
  if (firstHalf) {
    widths = Array(days.length + 1).fill(368).concat([1000, 2700, 1000, 397]);
    widths[0] += TW - widths.reduce((a, b) => a + b, 0);
  } else {
    const rest = TW - 2830 - 397, n = days.length + 1, dw = Math.floor(rest / n);
    widths = Array(n).fill(dw);
    widths[0] += rest - dw * n;
    widths = widths.concat([2830, 397]);
  }
  const nameW = firstHalf ? 2700 : 2830;
  const grid = widths.map(x => '<w:gridCol w:w="' + x + '"/>').join('');
  const dd = days.slice().reverse(); // right-to-left: day 1 on the right
  const rows = [row([cell(TW, { text: title, shd: BLUE, span: widths.length, sz: 22, bold: true })], 480)];
  const hdr = [cell(widths[0], { text: 'م', shd: BLUE })];
  dd.forEach((d, k) => hdr.push(cell(widths[k + 1], { text: String(d), sz: 18, shd: isOff(d) ? PINK : BLUE })));
  if (firstHalf) hdr.push(cell(1000, { text: 'التولد', shd: BLUE }), cell(nameW, { text: 'اسم الطالبـ/ ـة', shd: BLUE }),
    cell(1000, { text: 'رقم القيد', shd: BLUE }), cell(397, { text: 'ت', shd: BLUE }));
  else hdr.push(cell(nameW, { text: 'اسم الطالبـ/ ـة', shd: BLUE }), cell(397, { text: 'ت', shd: BLUE }));
  rows.push(row(hdr, 440));
  students.forEach((nm, j) => {
    const cs = [cell(widths[0])];
    dd.forEach((d, k) => cs.push(cell(widths[k + 1], { shd: isOff(d) ? PINK : '' })));
    const sz = nm.length > 30 ? Math.min(nameSz, 16) : nameSz;
    const nameCell = cell(nameW, { text: nm, sz, bold: true, name: true });
    const num = cell(397, { text: String(start + j), shd: GREEN, sz: nameSz });
    if (firstHalf) cs.push(cell(1000), nameCell, cell(1000), num);
    else cs.push(nameCell, num);
    rows.push(row(cs, rowH));
  });
  return '<w:tbl><w:tblPr><w:tblStyle w:val="a3"/><w:tblW w:w="' + TW + '" w:type="dxa"/><w:jc w:val="center"/>' +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
    '<w:tblGrid>' + grid + '</w:tblGrid>' + rows.join('') + '</w:tbl>';
}

// extraHolidays: array of Date objects (local) to shade in addition to Fri/Sat and fixed holidays.
// The month pages of the register, shared by the Word and PDF outputs.
function planMonthPages(names, startYear, extraHolidays) {
  const extra = new Set(extraHolidays.map(d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()));
  // Students 1-32 get a full year of pages, then 33-64 another full year, and so on (as in the template).
  const sets = Math.max(1, Math.ceil(names.length / ROWS_PER_PAGE));
  const out = [];
  for (let set = 0; set < sets; set++) {
    const start = set * ROWS_PER_PAGE + 1;
    const students = [];
    for (let i = 0; i < ROWS_PER_PAGE; i++) students.push(names[start - 1 + i] || '');
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
        let title = 'شهر  ' + mName + '  -  ' + ordinal + '  ' + m + '  /  ' + y + '     ( من ' + a + ' إلى ' + b + ' )';
        if (sets > 1) title += '   -   الطلاب ' + start + ' - ' + (start + ROWS_PER_PAGE - 1);
        out.push({ title, days, isOff, firstHalf, students, start, rowH: ROW_H, nameSz: 20 });
      }
    }
  }
  return out;
}

function buildMonths(names, startYear, extraHolidays) {
  return planMonthPages(names, startYear, extraHolidays).map(pg => backgroundParagraph() +
    monthTable(pg.title, pg.days, pg.isOff, pg.firstHalf, pg.students, pg.start, pg.rowH, pg.nameSz)).join('');
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
