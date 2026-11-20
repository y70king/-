/* Reads a .docx (one exported by this app, or an older hand-made one) back into app data. */
(function () {
  'use strict';

  function latin(s) {
    return String(s || '').replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x06F0; });
  }
  function clean(s) { return String(s || '').replace(/ـ/g, '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim(); }
  function kids(el, name) {
    var out = [];
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === name) out.push(c);
    return out;
  }
  function ptext(p) {
    var t = '', ts = p.getElementsByTagName('w:t');
    for (var i = 0; i < ts.length; i++) t += ts[i].textContent;
    return clean(t);
  }
  function cellParas(tc) { return kids(tc, 'w:p').map(ptext).filter(Boolean); }
  function cellText(tc) { return cellParas(tc).join(' '); }
  function parseXml(bytes) {
    return new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  }
  function allParas(doc) {
    var ps = doc.getElementsByTagName('w:p'), out = [];
    for (var i = 0; i < ps.length; i++) {
      // skip paragraphs that only wrap nested ones (text boxes) to avoid duplicates
      if (ps[i].getElementsByTagName('w:p').length) continue;
      var t = ptext(ps[i]); if (t) out.push(t);
    }
    return out;
  }
  function isNum(s) { return /^\d{6,}$/.test(latin(s).replace(/\s+/g, '')); }

  function parseStudentCell(tc) {
    var ps = cellParas(tc);
    if (!ps.length) return null;
    var k = -1;
    for (var i = 0; i < ps.length; i++) if (isNum(ps[i])) { k = i; break; }
    if (k >= 0) {
      return { name: clean(ps.slice(0, k).join(' ')), num: latin(ps[k]).replace(/\s+/g, ''), school: clean(ps.slice(k + 1).join(' ')) };
    }
    var all = ps.join(' '), m = /(.*?)([\d٠-٩][\d٠-٩\s]{5,}[\d٠-٩])(.*)/.exec(all);
    if (!m) return null;
    return { name: clean(m[1]), num: latin(m[2]).replace(/\s+/g, ''), school: clean(m[3]) };
  }

  function readSettings(paras) {
    var s = {}, txt = paras.join('\n'), m;
    if ((m = /المركز الامتحاني\s*رقم\s*\(\s*([^)]+?)\s*\)/.exec(txt))) s.center = clean(m[1]);
    if ((m = /للدراسة\s*\(\s*([^)]+?)\s*\)/.exec(txt))) s.level = clean(m[1]);
    paras.forEach(function (p, i) {
      var mm;
      if (!s.line1 && /المديرية العامة/.test(p)) s.line1 = p;
      if (!s.line2 && /اللجنة/.test(p)) s.line2 = p;
      if (!s.building && (mm = /في بناية مدرسة\s*:?\s*-?\s*(.+)$/.exec(p))) s.building = clean(mm[1]);
      if (!s.subject && (mm = /^المادة\s*\/\s*(.+)$/.exec(p))) s.subject = clean(mm[1]);
      if (!s.year && (mm = /للعام الدراسي\s*(\d{4})\s*[–\-\/]\s*(\d{4})/.exec(latin(p).replace(/(\d)\s+(?=\d)/g, '$1')))) {
        s.year = mm[1] + ' – ' + mm[2];
        var r = /(الدور\s+\S+)\s*$/.exec(p); if (r) s.round = clean(r[1]);
      }
      if (!s.director && p === 'مدير المركز' && paras[i + 1]) s.director = paras[i + 1];
    });
    return s;
  }

  // ---- seating map ("اسم الطالب / رقمه الامتحاني / مدرسته" in each cell)
  function parseSeating(doc) {
    var tbls = doc.getElementsByTagName('w:tbl'), halls = [], hallNo = null, seen = {};
    for (var t = 0; t < tbls.length; t++) {
      var rows = kids(tbls[t], 'w:tr');
      if (!rows.length) continue;
      var first = kids(rows[0], 'w:tc').map(cellText);
      // hall box: "رقم القاعة | N"
      rows.forEach(function (r) {
        var cs = kids(r, 'w:tc').map(cellText);
        var i = cs.indexOf('رقم القاعة');
        if (i >= 0) for (var j = 0; j < cs.length; j++) if (j !== i && /^\d+$/.test(latin(cs[j]))) hallNo = parseInt(latin(cs[j]), 10);
      });
      var isGrid = first.length && first.every(function (c) { return /اسم الطالب/.test(c) && /مدرس/.test(c); });
      if (!isGrid) continue;
      var grid = [], nums = [];
      rows.slice(1).forEach(function (r) {
        var row = kids(r, 'w:tc').map(parseStudentCell);
        row.forEach(function (st) { if (st) nums.push(st.num); });
        grid.push(row);
      });
      if (!nums.length) continue;
      if (nums.every(function (n) { return seen[n]; })) continue; // duplicated page
      nums.forEach(function (n) { seen[n] = 1; });
      halls.push({ number: hallNo, grid: grid });
    }
    return halls;
  }

  // ---- dispatch list (ت | الرقم الامتحاني | اسم الطالب | اسم المدرسة | ...)
  function parseDispatch(doc, extraDocs) {
    var tbls = doc.getElementsByTagName('w:tbl'), rowsOut = [], info = {};
    for (var t = 0; t < tbls.length; t++) {
      var rows = kids(tbls[t], 'w:tr');
      if (!rows.length) continue;
      var head = kids(rows[0], 'w:tc').map(cellText), col = {};
      head.forEach(function (h, i) {
        if (/الرقم/.test(h)) col.num = i;
        else if (/اسم الطالب/.test(h)) col.name = i;
        else if (/اسم المدرسة|المدرسة/.test(h)) col.school = i;
        else if (/الغياب/.test(h)) col.absent = i;
        else if (/المنقول/.test(h)) col.moved = i;
        else if (/الملاحظات/.test(h)) col.note = i;
      });
      if (col.num == null || col.name == null) continue;
      rows.slice(1).forEach(function (r) {
        var cs = kids(r, 'w:tc').map(cellText);
        var num = latin(cs[col.num] || '').replace(/\s+/g, ''), name = clean(cs[col.name]);
        if (!name || !/^\d{4,}$/.test(num)) return;
        rowsOut.push({
          name: name, num: num, school: clean(cs[col.school]),
          absent: col.absent != null && !!clean(cs[col.absent]),
          moved: col.moved != null ? clean(cs[col.moved]) : '', note: col.note != null ? clean(cs[col.note]) : ''
        });
      });
    }
    // info table (label | value pairs) — in the page header or the body
    [doc].concat(extraDocs).forEach(function (d) {
      var ts = d.getElementsByTagName('w:tbl');
      for (var i = 0; i < ts.length; i++) kids(ts[i], 'w:tr').forEach(function (r) {
        var cs = kids(r, 'w:tc').map(cellText);
        for (var j = 0; j + 1 < cs.length; j += 2) if (cs[j] && !(cs[j] in info)) info[cs[j]] = cs[j + 1];
      });
    });
    return { rows: rowsOut, info: info };
  }

  function readDispatchInfo(info, paras) {
    var d = {}, s = {}, txt = paras.join('\n'), m;
    function get(re) { for (var k in info) if (re.test(k)) return clean(info[k]); return ''; }
    var v;
    if ((v = get(/^المديرية$/))) d.directorate = v;
    if ((v = get(/^الدراسة$/))) s.level = v;
    if ((v = get(/^الدور$/))) s.round = /^الدور/.test(v) ? v : 'الدور ' + v;
    if ((v = get(/^رقم المركز$/))) s.center = v;
    if ((v = get(/^المادة$/))) d.subject = v;
    if ((v = get(/^اسم المركز$/))) s.building = v;
    if ((v = get(/^اليوم$/))) d.day = v;
    if ((v = get(/^عنوان المركز$/))) d.address = v;
    if ((v = get(/^التأريخ$|^التاريخ$/)) && (m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(latin(v).replace(/(\d)\s+(?=\d)/g, '$1')))) {
      d.date = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    if ((m = /مركز فحص.*?\/\s*([^\s\/]+)\s+للعام/.exec(txt))) d.examCenter = clean(m[1]);
    if ((m = /للعام الدراسي\s*(\d{4})\s*\/\s*(\d{4})/.exec(latin(txt).replace(/(\d)\s+(?=\d)/g, '$1')))) s.year = m[1] + ' – ' + m[2];
    if ((m = /اسم مدير المركز\s*\/\s*(.+?)\s*(?:التوقيع|رقم|\n|$)/.exec(txt))) s.director = clean(m[1]);
    if ((m = /موبايل مدير المركز\s*\/\s*([\d٠-٩]+)/.exec(txt))) d.directorPhone = latin(m[1]);
    if ((m = /اسم معاون مدير المركز\s*\/\s*(.+?)\s*(?:التوقيع|رقم|\n|$)/.exec(txt))) d.deputy = clean(m[1]);
    if ((m = /موبايل معاون مدير المركز\s*\/\s*([\d٠-٩]+)/.exec(txt))) d.deputyPhone = latin(m[1]);
    return { dispatch: d, settings: s };
  }

  /** Returns {kind:'embedded', data} | {kind:'seating', halls, settings} | {kind:'dispatch', rows, dispatch, settings} */
  function readDocx(buf) {
    var files = DocxWriter.readZip(buf), name;
    for (name in files) {
      if (!/^customXml\/item\d*\.xml$/.test(name) || !files[name]) continue;
      var x = new TextDecoder().decode(files[name]);
      if (x.indexOf(DocxWriter.DATA_NS) < 0) continue;
      var b = /<examSeating[^>]*>([^<]+)<\/examSeating>/.exec(x);
      if (b) {
        var bin = atob(b[1].trim()), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { return { kind: 'embedded', data: JSON.parse(new TextDecoder().decode(u)) }; } catch (e) { /* fall through */ }
      }
    }
    if (!files['word/document.xml']) throw new Error('الملف ليس ملف Word (docx) صالحاً');
    var doc = parseXml(files['word/document.xml']), extra = [];
    for (name in files) if (/^word\/(header|footer)\d*\.xml$/.test(name) && files[name]) extra.push(parseXml(files[name]));
    var paras = allParas(doc);
    extra.forEach(function (d) { paras = paras.concat(allParas(d)); });

    var halls = parseSeating(doc);
    if (halls.length) return { kind: 'seating', halls: halls, settings: readSettings(paras) };
    var dp = parseDispatch(doc, extra);
    if (dp.rows.length) {
      var di = readDispatchInfo(dp.info, paras);
      return { kind: 'dispatch', rows: dp.rows, dispatch: di.dispatch, settings: di.settings };
    }
    throw new Error('لم أجد في الملف جدول جلوس أو قائمة طالبات');
  }

  window.DocxReader = { read: readDocx };
})();
