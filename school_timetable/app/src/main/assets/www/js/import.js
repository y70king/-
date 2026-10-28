/* استيراد المدرسين والصفوف من ملفات Excel (xlsx) و Word (docx) و PDF و CSV/TXT.
   كل ملف يتحول إلى «مصادر» (ورقة، جدول، نص) وكل مصدر = أسطر من خلايا نصية،
   ثم نكتشف دور كل عمود (اسم المدرس، الاختصاص، الصف، الشعبة، عدد الشعب) تلقائياً. */
var TT = self.TT || (self.TT = {});

(function (TT) {
  'use strict';

  /* ---------- تطبيع النص العربي للمقارنة ---------- */
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    return s.replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function stripAl(w) { return w.length > 3 && w.indexOf('ال') === 0 ? w.slice(2) : w; }
  function words(s) {
    return norm(s).split(/[\s\-–—_\/\\|،,;:.()\[\]{}«»"']+/).filter(Boolean).map(stripAl);
  }
  TT.normText = norm;

  function cleanCell(v) {
    v = String(v == null ? '' : v);
    if (v.normalize) v = v.normalize('NFKC');
    return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------- قراءة الملفات ---------- */

  function unzip(bytes) {
    if (!self.fflate) throw new Error('مكتبة فك الضغط غير متوفرة');
    return self.fflate.unzipSync(bytes);
  }
  function xml(bytes) {
    var text = new TextDecoder('utf-8').decode(bytes);
    return new DOMParser().parseFromString(text, 'application/xml');
  }
  function byTag(node, name) {
    // يعمل مع البادئات (w:p) ومن دونها
    var list = node.getElementsByTagName(name);
    if (!list.length && name.indexOf(':') > 0) list = node.getElementsByTagNameNS('*', name.split(':')[1]);
    return Array.prototype.slice.call(list);
  }
  function local(n) { return n.localName || n.nodeName.replace(/^.*:/, ''); }

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ''), n = 0;
    if (!m) return -1;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function tidy(rows) {
    rows = rows.map(function (r) { return r.map(cleanCell); })
      .filter(function (r) { return r.some(function (c) { return c; }); });
    var w = 0;
    rows.forEach(function (r) {
      for (var i = r.length - 1; i >= 0; i--) if (r[i]) { w = Math.max(w, i + 1); break; }
    });
    // حذف الأعمدة الفارغة تماماً
    var keep = [];
    for (var c = 0; c < w; c++) if (rows.some(function (r) { return r[c]; })) keep.push(c);
    return rows.map(function (r) { return keep.map(function (c) { return r[c] || ''; }); });
  }

  function readXlsx(bytes) {
    var files = unzip(bytes);
    var shared = [];
    if (files['xl/sharedStrings.xml']) {
      byTag(xml(files['xl/sharedStrings.xml']), 'si').forEach(function (si) {
        shared.push(byTag(si, 't').filter(function (t) {
          return local(t.parentNode) !== 'rPh';
        }).map(function (t) { return t.textContent; }).join(''));
      });
    }
    var wb = xml(files['xl/workbook.xml']);
    var rels = {};
    if (files['xl/_rels/workbook.xml.rels']) {
      byTag(xml(files['xl/_rels/workbook.xml.rels']), 'Relationship').forEach(function (r) {
        var t = r.getAttribute('Target');
        t = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t;
        rels[r.getAttribute('Id')] = t;
      });
    }
    var sources = [];
    byTag(wb, 'sheet').forEach(function (sh, i) {
      var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var path = rels[rid] || ('xl/worksheets/sheet' + (i + 1) + '.xml');
      if (!files[path]) return;
      var doc = xml(files[path]), rows = [];
      byTag(doc, 'row').forEach(function (row) {
        var r = [], next = 0;
        Array.prototype.forEach.call(row.childNodes, function (c) {
          if (c.nodeType !== 1 || local(c) !== 'c') return;
          var idx = colIndex(c.getAttribute('r'));
          if (idx < 0) idx = next;
          next = idx + 1;
          var t = c.getAttribute('t'), v = '';
          var vEl = byTag(c, 'v')[0];
          if (t === 's') v = vEl ? (shared[+vEl.textContent] || '') : '';
          else if (t === 'inlineStr') v = byTag(c, 't').map(function (x) { return x.textContent; }).join('');
          else if (vEl) v = vEl.textContent;
          r[idx] = v;
        });
        for (var k = 0; k < r.length; k++) if (r[k] === undefined) r[k] = '';
        rows.push(r);
      });
      // قيم الخلايا المدموجة تُكرر في كل الخلايا المغطاة
      byTag(doc, 'mergeCell').forEach(function (m) {
        var p = (m.getAttribute('ref') || '').split(':');
        if (p.length !== 2) return;
        var c1 = colIndex(p[0]), c2 = colIndex(p[1]);
        var r1 = parseInt(p[0].replace(/^[A-Z]+/, ''), 10) - 1, r2 = parseInt(p[1].replace(/^[A-Z]+/, ''), 10) - 1;
        if (c1 !== c2) return; // الدمج الأفقي غالباً عناوين
        var val = rows[r1] && rows[r1][c1];
        for (var rr = r1 + 1; rr <= r2; rr++) {
          if (!rows[rr]) continue;
          if (!rows[rr][c1]) rows[rr][c1] = val || '';
        }
      });
      rows = tidy(rows);
      if (rows.length) sources.push({ name: 'ورقة: ' + (sh.getAttribute('name') || (i + 1)), rows: rows });
    });
    return sources;
  }

  function readDocx(bytes) {
    var files = unzip(bytes);
    var doc = xml(files['word/document.xml']);
    var body = byTag(doc, 'w:body')[0];
    var sources = [], lines = [], tableNo = 0;

    function textOf(node) {
      var out = '';
      (function walk(n) {
        Array.prototype.forEach.call(n.childNodes, function (c) {
          if (c.nodeType !== 1) return;
          var ln = local(c);
          if (ln === 't') out += c.textContent;
          else if (ln === 'tab') out += '\t';
          else if (ln === 'br' || ln === 'cr') out += ' ';
          else if (ln === 'p' && out && !/\s$/.test(out)) { walk(c); out += ' '; return; }
          else walk(c);
        });
      })(node);
      return out;
    }

    function readTable(tbl) {
      var rows = [];
      Array.prototype.forEach.call(tbl.childNodes, function (tr) {
        if (tr.nodeType !== 1 || local(tr) !== 'tr') return;
        var r = [], col = 0;
        Array.prototype.forEach.call(tr.childNodes, function (tc) {
          if (tc.nodeType !== 1 || local(tc) !== 'tc') return;
          var span = 1, vcont = false;
          var pr = byTag(tc, 'w:tcPr')[0];
          if (pr) {
            var gs = byTag(pr, 'w:gridSpan')[0];
            if (gs) span = parseInt(gs.getAttribute('w:val'), 10) || 1;
            var vm = byTag(pr, 'w:vMerge')[0];
            if (vm && vm.getAttribute('w:val') !== 'restart') vcont = true;
          }
          var txt = textOf(tc);
          if (vcont && !cleanCell(txt) && rows.length) txt = rows[rows.length - 1][col] || '';
          r[col] = txt;
          for (var k = 1; k < span; k++) r[col + k] = '';
          col += span;
        });
        rows.push(r);
      });
      return rows;
    }

    Array.prototype.forEach.call(body.childNodes, function (n) {
      if (n.nodeType !== 1) return;
      var ln = local(n);
      if (ln === 'tbl') {
        var rows = tidy(readTable(n));
        if (rows.length) sources.push({ name: 'جدول ' + (++tableNo), rows: rows });
      } else if (ln === 'p') {
        var t = textOf(n);
        if (cleanCell(t)) lines.push(t);
      }
    });
    if (lines.length) sources.push({ name: 'النص (الفقرات)', rows: tidy(splitLines(lines)) });
    return sources;
  }

  function splitLines(lines) {
    return lines.map(function (l) {
      var parts = l.split(/\t+|\s*\|\s*|\s{3,}/);
      return parts;
    });
  }

  function decodeText(bytes) {
    var t = new TextDecoder('utf-8').decode(bytes);
    if (t.indexOf('�') >= 0) {
      try { t = new TextDecoder('windows-1256').decode(bytes); } catch (e) { /* يبقى UTF-8 */ }
    }
    return t.replace(/^﻿/, '');
  }

  function readCsv(bytes) {
    var text = decodeText(bytes);
    var first = text.split(/\r?\n/)[0] || '';
    var delim = '\t';
    [['\t', /\t/g], [';', /;/g], [',', /,/g], ['،', /،/g]].some(function (d) {
      if ((first.match(d[1]) || []).length) { delim = d[0]; return true; }
      return false;
    });
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && !cell) q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (rows.every(function (r) { return r.length <= 1; })) rows = splitLines(rows.map(function (r) { return r[0] || ''; }));
    return [{ name: 'الملف', rows: tidy(rows) }];
  }

  var pdfLoading = null;
  function loadPdfJs() {
    if (self.pdfjsLib) return Promise.resolve(self.pdfjsLib);
    if (pdfLoading) return pdfLoading;
    pdfLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'lib/pdf.min.js';
      s.onload = function () {
        var lib = self.pdfjsLib || self['pdfjs-dist/build/pdf'];
        if (!lib) { reject(new Error('تعذر تحميل قارئ PDF')); return; }
        lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
        self.pdfjsLib = lib;
        resolve(lib);
      };
      s.onerror = function () { pdfLoading = null; reject(new Error('تعذر تحميل قارئ PDF')); };
      document.head.appendChild(s);
    });
    return pdfLoading;
  }

  var ARABIC = /[؀-ۿ]/;

  /* PDF: نجمع النصوص في أسطر حسب الارتفاع، ونقسم السطر إلى خلايا حسب الفراغات الكبيرة */
  function readPdf(bytes) {
    return loadPdfJs().then(function (lib) {
      return lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    }).then(function (pdf) {
      var all = [], chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) {
        (function (pn) {
          chain = chain.then(function () { return pdf.getPage(pn); })
            .then(function (page) { return page.getTextContent(); })
            .then(function (tc) { all = all.concat(pageRows(tc.items)); });
        })(p);
      }
      return chain.then(function () {
        if (!all.length) throw new Error('لم يُعثر على نص في ملف PDF (قد يكون صورة ممسوحة ضوئياً).');
        return [{ name: 'كل الصفحات', rows: tidy(all.map(fixPdfRow)), pdf: true }];
      });
    });
  }

  /* إصلاحات لأخطاء استخراج النص العربي من PDF */
  function fixPdfRow(cells) {
    cells = cells.map(function (c) {
      // «لا» المركبة تُستخرج معكوسة «ال»، و«اال» لا تأتي في العربية
      return cleanCell(c).replace(/اال/g, 'الا').replace(/ااأل/g, 'الأ').replace(/ااإل/g, 'الإ');
    });
    // رقم التسلسل الملتصق بالاسم: «1 أحمد علي» → «1» | «أحمد علي»
    var m = cells.length && /^([0-9\u0660-\u0669]{1,3})[\s\-.)]+([^0-9\u0660-\u0669].*)$/.exec(cells[0]);
    if (m) cells.splice(0, 1, m[1], m[2]);
    return cells;
  }

  function pageRows(items) {
    var its = items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var h = Math.abs(it.height) || Math.hypot(it.transform[2], it.transform[3]) || 10;
      return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: h };
    });
    its.sort(function (a, b) { return b.y - a.y; });
    var lines = [];
    its.forEach(function (it) {
      var ln = lines.length ? lines[lines.length - 1] : null;
      if (ln && Math.abs(ln.y - it.y) <= Math.max(2, it.h * 0.4)) ln.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    return lines.map(function (ln) {
      var rtl = ln.items.filter(function (i) { return ARABIC.test(i.s); }).length * 2 >= ln.items.length;
      ln.items.sort(function (a, b) { return rtl ? (b.x + b.w) - (a.x + a.w) : a.x - b.x; });
      var cells = [], cur = null, edge = null;
      ln.items.forEach(function (it) {
        var gap;
        if (cur === null) gap = 0;
        else gap = rtl ? edge - (it.x + it.w) : it.x - edge;
        if (cur !== null && gap > it.h * 1.2) { cells.push(cur); cur = null; }
        if (cur === null) cur = it.s;
        else cur += (gap > it.h * 0.15 && !/\s$/.test(cur) ? ' ' : '') + it.s;
        edge = rtl ? it.x : it.x + it.w;
      });
      if (cur !== null) cells.push(cur);
      return cells;
    });
  }

  /* file: File → Promise<{sources}> */
  TT.readImportFile = function (file) {
    var name = (file.name || '').toLowerCase();
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;
      var isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (isPdf || /\.pdf$/.test(name)) return readPdf(bytes);
      if (isZip) {
        var files = unzip(bytes);
        if (files['xl/workbook.xml']) return readXlsx(bytes);
        if (files['word/document.xml']) return readDocx(bytes);
        throw new Error('ملف مضغوط غير معروف. استخدم ملف Excel (xlsx) أو Word (docx).');
      }
      if (/\.(xls|doc)$/.test(name) || (bytes[0] === 0xD0 && bytes[1] === 0xCF)) {
        throw new Error('هذه صيغة قديمة (xls/doc). افتح الملف واحفظه بصيغة xlsx أو docx ثم أعد المحاولة.');
      }
      return readCsv(bytes);
    });
  };

  /* ---------- اكتشاف أدوار الأعمدة ---------- */

  TT.IMPORT_ROLES = [
    { id: '', label: 'تجاهل' },
    { id: 'teacher', label: 'اسم المدرس' },
    { id: 'spec', label: 'الاختصاص / المادة' },
    { id: 'grade', label: 'الصف' },
    { id: 'section', label: 'الشعبة' },
    { id: 'count', label: 'عدد الشعب' }
  ];

  var KW = {
    count: [['عدد', 'شعب'], ['عدد', 'شعبه']],
    teacher: [['اسم'], ['اسماء'], ['مدرس'], ['مدرسه'], ['مدرسين'], ['مدرسون'], ['معلم'], ['معلمه'], ['معلمين'], ['استاذ'], ['استاذه'], ['تدريسي'], ['تدريسيه'], ['name'], ['teacher']],
    spec: [['اختصاص'], ['تخصص'], ['ماده'], ['مواد'], ['subject'], ['specialty']],
    grade: [['صف'], ['صفوف'], ['مرحله'], ['class'], ['grade']],
    section: [['شعبه'], ['شعب'], ['section']],
    ignore: [['ت'], ['#'], ['تسلسل'], ['رقم'], ['no'], ['م'], ['ر.ت'], ['ملاحظات']]
  };

  function headerRole(cell) {
    var w = words(cell);
    if (!w.length || w.length > 4) return null;
    var order = ['count', 'section', 'grade', 'spec', 'teacher', 'ignore'];
    for (var i = 0; i < order.length; i++) {
      var sets = KW[order[i]];
      for (var k = 0; k < sets.length; k++) {
        if (sets[k].every(function (x) { return w.indexOf(x) >= 0; })) return order[i];
      }
    }
    return null;
  }

  var ORD = { 'اول': 0, 'ثاني': 1, 'ثالث': 2, 'رابع': 3, 'خامس': 4, 'سادس': 5 };
  var STAGE = { 'ابتدائي': 0, 'متوسط': 6, 'اعدادي': 9 };
  var SEC_NORM = TT.SECTIONS.map(function (s) { return norm(s); });

  function secLetter(w) {
    var i = SEC_NORM.indexOf(w);
    if (i < 0 && w.length === 1) i = SEC_NORM.indexOf(norm(w));
    return i >= 0 ? TT.SECTIONS[i] : null;
  }

  function isGradeLike(v) {
    var w = words(v);
    return w.some(function (x) { return ORD[x] !== undefined || STAGE[x] !== undefined || x === 'صف'; }) && w.length <= 6;
  }

  /* «الأول المتوسط - أ» → {grade: 'الأول المتوسط', sections: ['أ']} */
  TT.parseClassCell = function (raw) {
    var rawTokens = cleanCell(raw).split(/[\s\-–—_\/\\|،,;:()\[\]{}«»"']+/).filter(Boolean);
    var gradeTokens = [], secs = [];
    rawTokens.forEach(function (t) {
      var n = stripAl(norm(t));
      if (n === 'شعبه' || n === 'شعب' || n === 'صف') return;
      var sl = t.length <= 2 ? secLetter(norm(t)) : null;
      if (sl && gradeTokens.length) { if (secs.indexOf(sl) < 0) secs.push(sl); return; }
      gradeTokens.push(t);
    });
    if (!gradeTokens.length) return null;
    var ord = null, stage = null;
    gradeTokens.forEach(function (t) {
      var n = stripAl(norm(t));
      if (ORD[n] !== undefined) ord = ORD[n];
      if (STAGE[n] !== undefined) stage = STAGE[n];
    });
    var grade = gradeTokens.join(' ');
    if (ord !== null && stage !== null) {
      var gi = stage === 9 ? 9 + ord - 3 : stage + ord;
      var ok = stage === 0 || (stage === 6 && ord < 3) || (stage === 9 && ord >= 3);
      if (ok && TT.GRADES[gi]) grade = TT.GRADES[gi];
    }
    return { grade: grade, sections: secs };
  };

  TT.parseSections = function (raw) {
    var out = [];
    cleanCell(raw).split(/[\s\-–—_\/\\|،,;:()]+/).filter(Boolean).forEach(function (t) {
      var n = stripAl(norm(t));
      if (n === 'شعبه' || n === 'شعب') return;
      var sl = secLetter(norm(t));
      out.push(sl || t);
    });
    return out;
  };

  /* أسماء مختصرة شائعة للمواد */
  var SUBJECT_ALIASES = {
    'عربي': 'اللغة العربية', 'عربيه': 'اللغة العربية', 'لغه عربيه': 'اللغة العربية',
    'انكليزي': 'اللغة الإنكليزية', 'انجليزي': 'اللغة الإنكليزية', 'انكليزيه': 'اللغة الإنكليزية', 'انجليزيه': 'اللغة الإنكليزية', 'e': 'اللغة الإنكليزية', 'english': 'اللغة الإنكليزية',
    'اسلاميه': 'التربية الإسلامية', 'تربيه اسلاميه': 'التربية الإسلامية', 'دين': 'التربية الإسلامية',
    'رياضيات': 'الرياضيات', 'رياضه': 'التربية الرياضية', 'تربيه رياضيه': 'التربية الرياضية',
    'فيزياء': 'الفيزياء', 'كيمياء': 'الكيمياء', 'احياء': 'الأحياء', 'علوم': 'العلوم',
    'حاسوب': 'الحاسوب', 'حاسبات': 'الحاسوب', 'اجتماعيات': 'الاجتماعيات', 'تاريخ': 'التاريخ',
    'جغرافيه': 'الجغرافية', 'جغرافيا': 'الجغرافية', 'فنيه': 'التربية الفنية', 'تربيه فنيه': 'التربية الفنية', 'رسم': 'التربية الفنية',
    'وطنيه': 'الوطنية', 'فرنسي': 'اللغة الفرنسية', 'فرنسيه': 'اللغة الفرنسية', 'اقتصاد': 'الاقتصاد'
  };

  TT.matchSubject = function (raw, catalog) {
    var v = cleanCell(raw);
    if (!v) return '';
    var n = norm(v), n2 = words(v).join(' ');
    for (var i = 0; i < catalog.length; i++) {
      var c = norm(catalog[i]);
      if (c === n || words(catalog[i]).join(' ') === n2) return catalog[i];
    }
    var a = SUBJECT_ALIASES[n] || SUBJECT_ALIASES[n2];
    if (a) {
      // نعيد الاسم كما هو في القائمة إن وُجد
      for (i = 0; i < catalog.length; i++) if (norm(catalog[i]) === norm(a)) return catalog[i];
      return a;
    }
    return v;
  };

  function isSubjectLike(v, catalog) {
    var m = TT.matchSubject(v, catalog);
    return m && m !== cleanCell(v) || catalog.some(function (c) { return norm(c) === norm(v); });
  }

  function isNumber(v) { return /^[0-9٠-٩]+(\.0+)?$/.test(cleanCell(v)); }
  function toInt(v) {
    v = cleanCell(v).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
    return parseInt(v, 10);
  }

  /* يحدد سطر العناوين (إن وجد) ودور كل عمود */
  TT.detectRoles = function (rows, catalog) {
    var ncol = 0;
    rows.forEach(function (r) { ncol = Math.max(ncol, r.length); });
    var headerRow = -1, best = 0, roles = [];
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var rr = [], kinds = {};
      for (var c = 0; c < ncol; c++) {
        var role = rows[i][c] ? headerRole(rows[i][c]) : null;
        rr.push(role);
        if (role && role !== 'ignore') kinds[role] = 1;
      }
      var cellKinds = Object.keys(kinds).length;
      // سطر عناوين ملتصق في خلية واحدة (يحدث في PDF): «ت اسم المدرس الاختصاص»
      var w = words(rows[i].join(' ')), found = {};
      if (w.length <= 10) {
        Object.keys(KW).forEach(function (rl) {
          if (rl === 'ignore') return;
          KW[rl].forEach(function (set) { if (set.every(function (x) { return w.indexOf(x) >= 0; })) found[rl] = 1; });
        });
      }
      var rowKinds = Object.keys(found).length;
      // العنوان الذي فيه كلمة واحدة مثل «أسماء» لا يكفي إن وُجد سطر أفضل
      var score = Math.max(cellKinds, rowKinds >= 2 ? rowKinds : 0);
      if (score > best) { best = score; headerRow = i; roles = cellKinds >= rowKinds ? rr : []; }
    }
    var data = rows.slice(headerRow + 1);
    function col(c) { return data.map(function (r) { return r[c] || ''; }).filter(Boolean); }
    var out = [];
    for (var c2 = 0; c2 < ncol; c2++) {
      var r = roles[c2];
      out.push(r && r !== 'ignore' ? r : (r === 'ignore' ? '' : null));
    }
    // تحليل المحتوى للأعمدة غير المعروفة
    var taken = {};
    out.forEach(function (r) { if (r) taken[r] = true; });
    for (c2 = 0; c2 < ncol; c2++) {
      if (out[c2] !== null) continue;
      var vals = col(c2);
      if (!vals.length) { out[c2] = ''; continue; }
      var frac = function (fn) { return vals.filter(fn).length / vals.length; };
      if (!taken.grade && frac(isGradeLike) >= 0.5) { out[c2] = 'grade'; taken.grade = true; }
      else if (!taken.section && frac(function (v) { return !!secLetter(norm(v)); }) >= 0.6) { out[c2] = 'section'; taken.section = true; }
      else if (frac(isNumber) >= 0.8) {
        var maxv = Math.max.apply(null, vals.map(toInt));
        out[c2] = taken.grade && !taken.count && maxv <= 12 && !isSequence(vals) ? 'count' : '';
        if (out[c2]) taken.count = true;
      }
      else if (!taken.spec && frac(function (v) { return isSubjectLike(v, catalog); }) >= 0.5) { out[c2] = 'spec'; taken.spec = true; }
      else out[c2] = 'pending';
    }
    // أول عمود نصي متبقٍ = اسم المدرس (إن لم يكن هناك صف في الملف)
    for (c2 = 0; c2 < ncol; c2++) {
      if (out[c2] !== 'pending') continue;
      var vs = col(c2);
      var textual = vs.filter(function (v) { return !isNumber(v) && v.length >= 2; }).length / Math.max(1, vs.length);
      if (!taken.teacher && !taken.grade && textual >= 0.6) { out[c2] = 'teacher'; taken.teacher = true; }
      else out[c2] = '';
    }
    return { headerRow: headerRow, roles: out };
  };

  function isSequence(vals) {
    var n = vals.map(toInt);
    for (var i = 1; i < n.length; i++) if (n[i] !== n[i - 1] + 1) return false;
    return n.length > 1;
  }

  /* يبني قائمة المدرسين والصفوف من الأسطر المحددة */
  TT.buildImport = function (rows, roles, selected, tt) {
    var idx = {};
    roles.forEach(function (r, i) { if (r && idx[r] === undefined) idx[r] = i; });
    var teachers = [], classes = [], dupT = 0, dupC = 0;
    var tSeen = {}, cSeen = {};
    tt.teachers.forEach(function (t) { tSeen[norm(t)] = true; });
    tt.classes.forEach(function (c) { cSeen[norm(TT.classTitle(c))] = true; });
    var lastGrade = null;

    rows.forEach(function (r, ri) {
      if (!selected[ri]) return;
      if (idx.teacher !== undefined) {
        var name = cleanCell(r[idx.teacher]).replace(/^[\(\[]?[0-9٠-٩]+[\)\]\-.:،]*\s*/, '').trim();
        name = TT.clean(name);
        if (name && !isNumber(name) && !headerRole(name)) {
          if (tSeen[norm(name)]) dupT++;
          else {
            tSeen[norm(name)] = true;
            var spec = idx.spec !== undefined ? TT.matchSubject(r[idx.spec], tt.subject_catalog) : '';
            teachers.push({ name: name, spec: spec });
          }
        }
      }
      if (idx.grade !== undefined) {
        var g = cleanCell(r[idx.grade]);
        var parsed = g ? TT.parseClassCell(g) : null;
        if (parsed && headerRole(g)) parsed = null;
        if (parsed) lastGrade = parsed.grade;
        else if (!g && lastGrade && (idx.section !== undefined && r[idx.section])) parsed = { grade: lastGrade, sections: [] };
        if (!parsed) return;
        var secs = idx.section !== undefined && cleanCell(r[idx.section]) ? TT.parseSections(r[idx.section]) : parsed.sections;
        if (!secs.length && idx.count !== undefined) {
          var n = toInt(r[idx.count]);
          if (n > 0) secs = TT.SECTIONS.slice(0, Math.min(12, n));
        }
        if (!secs.length) secs = ['أ'];
        secs.forEach(function (s) {
          var key = norm(TT.classTitle({ grade: parsed.grade, section: s }));
          if (cSeen[key]) { dupC++; return; }
          cSeen[key] = true;
          classes.push({ grade: parsed.grade, section: s });
        });
      }
    });
    return { teachers: teachers, classes: classes, dupT: dupT, dupC: dupC };
  };

  /* نموذج Excel فارغ للتعبئة */
  TT.importTemplate = function () {
    function head(t) { return { lines: [t], head: true }; }
    function blank(n) { var r = []; for (var i = 0; i < n; i++) r.push({ lines: [''] }); return r; }
    var tRows = [], cRows = [];
    for (var i = 0; i < 40; i++) tRows.push([{ lines: [String(i + 1)], fill: 'D6EAF8', bold: true }].concat(blank(2)));
    for (i = 0; i < 20; i++) cRows.push(blank(2));
    return TT.buildXlsx([
      { name: 'المدرسون', title: 'قائمة المدرسين', paper: 'A4', header: [[head('ت'), head('اسم المدرس'), head('الاختصاص')]], body: tRows, xwidths: [6, 30, 24], freeze: 1 },
      { name: 'الصفوف', title: 'قائمة الصفوف', paper: 'A4', header: [[head('الصف'), head('عدد الشعب')]], body: cRows, xwidths: [30, 14], freeze: 1 }
    ], '');
  };
})(TT);
