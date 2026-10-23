// Builds a printable A4 HTML version of the register (same pages as the Word file).
// Android prints it to PDF through the system print service; browsers through window.print().
// Depends on register.js (planMonthPages, yearImageBase64, esc, TW and colour constants).

const NOTES = [
  '1- تبليغ الإدارة عن الطالب المجاز ( المدير ، المعاون ) .',
  '2- <u>المادة 23 من نظام المدارس الابتدائية رقم 30 لسنة 1978</u> : يسمح للتلاميذ غير المسلمين بالتغيب عن المدرسة في أيام أعيادهم الدينية الرسمية .',
  '3- <u>المادة 25 من نظام المدارس الابتدائية رقم 30 لسنة 1978 : أولا</u> : تعمل الهيئة التعليمية على انتظام دوام التلاميذ وذلك بالتعاون مع أولياء أمورهم ويخبر هؤلاء بغياب أولادهم اذا بلغ اسبوعا، ويستدعون الى المدرسة اذا بلغ الغياب اسبوعين للمداولة معهم بقصد التغلب على المعوقات التي تسبب ذلك . ويكون ما تجاوز خمسين يوما من الغيابات مخلا بمستوى تعليم التلميذ ويعتبر راسبا ضمن معدل النسب المعينة للرسوب .',
  '<u>4- المادة 14 من نظام المدارس الثانوية رقم 2 المعدل لسنة 1977 : أولا :</u> تعمل الهيئة التدريسية على انتظام دوام الطلاب وذلك بالتعاون مع أولياء أمورهم ويبلغ هؤلاء بالغياب إذا تيسرت وسائل التبليغ ويتحتم إذا بلغ أسبوعا ، ويستدعون إلى المدرسة إذا بلغ الغياب أسبوعين للمداولة معهم للتغلب على المعوقات التي تسبب ذلك .',
  '5- المادة 45 من نظام المدارس الثانوية رقم 2 المعدل لسنة 1977 :',
  'أولا : لا يجوز أن يتغيب الطالب من المدرسة إلا بعذر مشروع تقبله إدارة المدرسة .',
  'ثانيا : تعتبر درجة الدوام الكامل مادة في كل سنة وتخصم درجتان من درجات الدوام عن كل يوم يغيب فيه الطالب دون عذر مشروع ويعتبر غياب الطالب عن كل أربعة دروس متفرقة معادلا لغياب يوم واحد عن المدرسة ويعتبر الطالب راسبا في صفه إذا خصم من دوامه إحدى وخمسون درجة فأكثر وعلى إدارة المدرسة ان تبلغ ولي أمره وفقا لما جاء في الفقرة (أولا) من المادة 14 من هذا النظام ولا يجوز اشتراك الطالب في الامتحان النهائي إذا تجاوزت غياباته خمسة وأربعين يوما دراسيا مهما كانت الأعذار .',
  '6- يكتب في حقل التلميذ الغائب بغير عذر ( غ ) والغائب بعذر او المجاز ( م ) .',
  '7- الأيام التي تقر عطلة رسمية سواء كانت أعياد او امطار او أي حدث يخط جدول ذلك اليوم باللون البرتقالي او الأصفر .',
  '8- اذا تم توكيل مسك سجل الغيابات للكاتب من الأفضل توزيع الشعب والصفوف على الكتاب بحيث يثبت كل صف او شعبة على كاتب معين الى نهاية السنة حتى يكون مسؤولا عن صحة ادخال الغيابات في السجل .',
];

const C_BLUE = '#BDD6EE', C_PINK = '#FBE4D5', C_GREEN = '#E2EFD9';
const mm = tw => (tw / 56.6929).toFixed(2) + 'mm';

const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "Sultan Medium", "Traditional Arabic", Tahoma, sans-serif; color: #000; }
.page { position: relative; width: 210mm; height: 296.8mm; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.bg { position: absolute; left: 0; top: 0; width: 210mm; height: 297mm; z-index: 0; }
.abs { position: absolute; z-index: 1; }
.center { left: 0; right: 0; margin: auto; text-align: center; }
.cover-head { right: 14mm; top: 34mm; width: 72mm; text-align: center; font-size: 17pt; line-height: 1.55; }
.cover-head .school { font-size: 13pt; font-weight: bold; }
.cover-title { top: 128mm; font-size: 46pt; font-weight: bold; color: #0070C0; -webkit-text-stroke: 1.2px #0a3f78;
  text-shadow: 0 2px 0 #fff, 0 4px 6px rgba(0,0,0,.35); }
.cover-class { top: 166mm; font-size: 22pt; font-weight: bold; color: #0070C0; -webkit-text-stroke: .5px #0a3f78; }
.frame { border: 3px solid #000; }
.notes { right: 12mm; left: 12mm; top: 29mm; font-size: 12.4pt; line-height: 1.5; text-align: justify; direction: rtl; }
.notes p { margin: 0 0 2.2mm; }
.titlebox { top: 5mm; width: 97.7mm; height: 21.2mm; overflow: hidden; }
.titlebox img { position: absolute; left: 0.99mm; top: -3.09mm; width: 95.9mm; height: 48.9mm; } /* Word's crop of image5 */
.titlebox span { position: absolute; left: 0; right: 0; top: 6.6mm; color: #ff0000; font-size: 15pt; font-weight: bold; }
.sign { bottom: 21mm; width: 70mm; height: 23mm; border: 2.5px solid #f4b183; background: #dce9f5; text-align: center; font-size: 12pt; padding-top: 3mm; }
.sign .dots { letter-spacing: 1px; margin-bottom: 2mm; }
table { border-collapse: collapse; table-layout: fixed; direction: ltr; }
td { border: 0.6pt solid #000; padding: 0 1mm; text-align: center; vertical-align: middle; overflow: hidden; white-space: nowrap; direction: rtl; }
td.name { text-align: right; font-weight: bold; }
`;

function htmlCell(widthTw, text, o = {}) {
  const st = ['width:' + mm(widthTw)];
  if (o.bg) st.push('background:' + o.bg);
  if (o.pt) st.push('font-size:' + o.pt + 'pt');
  if (o.bold) st.push('font-weight:bold');
  return '<td' + (o.span ? ' colspan="' + o.span + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') +
    ' style="' + st.join(';') + '">' + (text === '' || text == null ? '' : esc(text)) + '</td>';
}
function colgroup(widths) { return '<colgroup>' + widths.map(x => '<col style="width:' + mm(x) + '">').join('') + '</colgroup>'; }
function htmlRow(cells, hTw) { return '<tr style="height:' + mm(hTw) + '">' + cells.join('') + '</tr>'; }

function coverPage(o, yearB64) {
  return '<div class="page"><img class="bg" src="img/image1.png">' +
    '<div class="abs cover-head"><div>المديرية العامة</div><div>لتربية</div><div>' + esc(o.gov) + '</div>' +
    '<div style="margin-top:3mm">إدارة</div><div class="school">' + esc(o.school) + '</div></div>' +
    '<img class="abs center" src="img/image2.png" style="top:94mm;width:50.3mm;height:35.2mm">' +
    '<div class="abs center cover-title">غيابات الطلاب</div>' +
    '<div class="abs center cover-class">الصف  ' + esc(o.className) + '  -  الشعبة  ( ' + esc(o.section) + ' )</div>' +
    '<img class="abs center" src="img/image3.png" style="top:186mm;width:47.9mm;height:33.5mm">' +
    '<img class="abs center" src="data:image/png;base64,' + yearB64 + '" style="top:211mm;width:67.1mm;height:28.4mm">' +
    '</div>';
}

function notesPage() {
  return '<div class="page"><img class="bg" src="img/image6.png">' +
    '<div class="abs frame" style="left:7mm;right:7mm;top:3.5mm;bottom:7mm"></div>' +
    '<div class="abs center titlebox"><img src="img/image5.png"><span>ملاحظات حول مسك سجل الغيابات</span></div>' +
    '<div class="abs notes">' + NOTES.map(n => '<p>' + n + '</p>').join('') + '</div>' +
    '<div class="abs sign" style="right:12mm"><div class="dots">..................................</div>معاونـ/ ـة   شؤون الطلبة</div>' +
    '<div class="abs sign" style="left:12mm"><div class="dots">..................................</div>مدير/ ة   المدرسة</div>' +
    '</div>';
}

function transfersPage() {
  const w = [1417, 2381, 1020, 624, 1417, 2381, 1020, 624];
  const total = w.reduce((a, b) => a + b, 0);
  const rows = [htmlRow([
    htmlCell(w[0] + w[1] + w[2] + w[3], 'المنقولين مـــــن المدرسة', { span: 4, bg: C_BLUE, pt: 11 }),
    htmlCell(w[4] + w[5] + w[6] + w[7], 'المنقولين الـــى المدرسة', { span: 4, bg: C_BLUE, pt: 11 })], 510)];
  const hdr = ['تاريخ النقل', 'اسم الطالبـ/ ـة', 'رقم القيد', 'ت'];
  rows.push(htmlRow(hdr.concat(hdr).map((t, i) => htmlCell(w[i], t, { bg: C_BLUE, pt: 10 })), 600));
  for (let i = 1; i <= 23; i++) {
    rows.push(htmlRow([htmlCell(w[0], ''), htmlCell(w[1], ''), htmlCell(w[2], ''), htmlCell(w[3], i + 23, { bg: C_BLUE, pt: 10 }),
      htmlCell(w[4], ''), htmlCell(w[5], ''), htmlCell(w[6], ''), htmlCell(w[7], i, { bg: C_BLUE, pt: 10 })], 470));
  }
  return '<div class="page"><img class="bg" src="img/image7.png">' +
    '<div class="abs frame" style="left:7mm;right:7mm;top:8mm;bottom:9mm"></div>' +
    '<div class="abs center" style="top:24mm;width:73.5mm;height:28.8mm;overflow:hidden">' +
    '<img src="img/image8.png" style="position:absolute;left:-3.76mm;top:-25.37mm;width:78.6mm;height:78.7mm"></div>' +
    '<div class="abs" style="top:34.5mm;left:90mm;width:50mm;text-align:center;color:#00B050;font-size:13.5pt;line-height:1.3">الطلاب المنقولين<br>من والى المدرسة</div>' +
    '<table class="abs center" style="top:57mm;width:' + mm(total) + '">' + colgroup(w) + rows.join('') + '</table>' +
    '</div>';
}

function monthPage(pg) {
  let widths;
  if (pg.firstHalf) {
    widths = Array(pg.days.length + 1).fill(368).concat([1000, 2700, 1000, 397]);
    widths[0] += TW - widths.reduce((a, b) => a + b, 0);
  } else {
    const rest = TW - 2830 - 397, n = pg.days.length + 1, dw = Math.floor(rest / n);
    widths = Array(n).fill(dw);
    widths[0] += rest - dw * n;
    widths = widths.concat([2830, 397]);
  }
  const nameW = pg.firstHalf ? 2700 : 2830;
  const dd = pg.days.slice().reverse();
  const namePt = pg.nameSz / 2;
  const rows = [htmlRow([htmlCell(TW, pg.title, { span: widths.length, bg: C_BLUE, pt: 11, bold: true })], 480)];
  const hdr = [htmlCell(widths[0], 'م', { bg: C_BLUE, pt: 10 })];
  dd.forEach((d, k) => hdr.push(htmlCell(widths[k + 1], d, { bg: pg.isOff(d) ? C_PINK : C_BLUE, pt: 9 })));
  if (pg.firstHalf) hdr.push(htmlCell(1000, 'التولد', { bg: C_BLUE, pt: 10 }), htmlCell(nameW, 'اسم الطالبـ/ ـة', { bg: C_BLUE, pt: 10 }),
    htmlCell(1000, 'رقم القيد', { bg: C_BLUE, pt: 10 }), htmlCell(397, 'ت', { bg: C_BLUE, pt: 10 }));
  else hdr.push(htmlCell(nameW, 'اسم الطالبـ/ ـة', { bg: C_BLUE, pt: 10 }), htmlCell(397, 'ت', { bg: C_BLUE, pt: 10 }));
  rows.push(htmlRow(hdr, 440));
  pg.students.forEach((nm, j) => {
    const cs = [htmlCell(widths[0], '')];
    dd.forEach((d, k) => cs.push(htmlCell(widths[k + 1], '', { bg: pg.isOff(d) ? C_PINK : '' })));
    const nameCell = htmlCell(nameW, nm, { cls: 'name', pt: +(namePt * Math.min(1, 24 / nm.length)).toFixed(1) }); // shrink long names to fit
    const num = htmlCell(397, pg.start + j, { bg: C_GREEN, pt: namePt });
    if (pg.firstHalf) cs.push(htmlCell(1000, ''), nameCell, htmlCell(1000, ''), num);
    else cs.push(nameCell, num);
    rows.push(htmlRow(cs, pg.rowH));
  });
  return '<div class="page"><img class="bg" src="img/image6.png">' +
    '<table class="abs center" style="top:10mm;width:' + mm(TW) + '">' + colgroup(widths) + rows.join('') + '</table></div>';
}

// opts: same as buildRegister. baseHref: where img/ lives (omit inside the app).
function buildRegisterHtml(opts, baseHref) {
  const pages = [coverPage(opts, yearImageBase64(opts.startYear)), notesPage(), transfersPage()]
    .concat(planMonthPages(opts.names, opts.startYear, opts.extraHolidays || []).map(monthPage));
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    (baseHref ? '<base href="' + esc(baseHref) + '">' : '') +
    '<title>' + esc(opts.title || 'سجل الغيابات') + '</title><style>' + PRINT_CSS + '</style></head><body>' +
    pages.join('') + '</body></html>';
}
