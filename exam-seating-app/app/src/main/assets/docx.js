/* Minimal .docx writer (no external libraries): a stored ZIP + WordprocessingML. */
(function () {
  'use strict';

  // ---------- ZIP (store, no compression) ----------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(d) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]);
    var total = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  // ---------- WordprocessingML helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function run(text, o) {
    o = o || {};
    var sz = (o.sz || 12) * 2;
    return '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' +
      (o.b ? '<w:b/><w:bCs/>' : '') +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
      '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:rtl/></w:rPr>' +
      '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }
  function para(runs, o) {
    o = o || {};
    return '<w:p><w:pPr>' + (o.keepNext ? '<w:keepNext/>' : '') + '<w:bidi/>' +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '" w:line="' + (o.line || 240) + '" w:lineRule="auto"/>' +
      '<w:jc w:val="' + (o.jc || 'center') + '"/></w:pPr>' + (runs || '') + '</w:p>';
  }
  function borders(tag, on) {
    var v = on ? 'w:val="single" w:sz="8" w:space="0" w:color="000000"' : 'w:val="nil"';
    return '<w:' + tag + '><w:top ' + v + '/><w:left ' + v + '/><w:bottom ' + v + '/><w:right ' + v + '/>' +
      (tag === 'tblBorders' ? '<w:insideH ' + v + '/><w:insideV ' + v + '/>' : '') + '</w:' + tag + '>';
  }
  function tbl(widths, rowsXml, o) {
    o = o || {};
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    return '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="' + total + '" w:type="dxa"/>' +
      '<w:jc w:val="center"/>' + borders('tblBorders', !!o.borders) +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>' +
      widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') +
      '</w:tblGrid>' + rowsXml + '</w:tbl>';
  }
  function tr(cellsXml, o) {
    o = o || {};
    return '<w:tr><w:trPr><w:cantSplit/>' + (o.header ? '<w:tblHeader/>' : '') + '</w:trPr>' + cellsXml + '</w:tr>';
  }
  function tc(w, content, o) {
    o = o || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' +
      (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') +
      '<w:vAlign w:val="center"/></w:tcPr>' + content + '</w:tc>';
  }
  function image(rid, emu, id) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + emu + '" cy="' + emu + '"/><wp:docPr id="' + id + '" name="Logo ' + id + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emu + '" cy="' + emu + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r>';
  }


  // ---------- Embedded app data (lets the app re-open its own exports exactly) ----------
  var DATA_NS = 'urn:examseating:data';
  function b64(bytes) {
    var bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function embedParts(payload) {
    if (!payload) return { files: [], rel: '', ct: '' };
    var item = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><examSeating xmlns="' + DATA_NS + '" v="1">' +
      b64(utf8(JSON.stringify(payload))) + '</examSeating>';
    var props = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
      '<ds:datastoreItem ds:itemID="{6E3A4C1B-2F7D-4B8E-9A61-3C5D7E9F1A2B}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">' +
      '<ds:schemaRefs><ds:schemaRef ds:uri="' + DATA_NS + '"/></ds:schemaRefs></ds:datastoreItem>';
    var itemRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>';
    return {
      files: [
        { name: 'customXml/item1.xml', data: utf8(item) },
        { name: 'customXml/itemProps1.xml', data: utf8(props) },
        { name: 'customXml/_rels/item1.xml.rels', data: utf8(itemRels) }
      ],
      rel: '<Relationship Id="rIdData" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>',
      ct: '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>'
    };
  }
  function withEmbed(files, payload) {
    var e = embedParts(payload);
    if (!e.files.length) return files;
    files.forEach(function (f) {
      if (f.name === 'word/_rels/document.xml.rels' || f.name === '[Content_Types].xml') {
        var txt = new TextDecoder().decode(f.data);
        txt = f.name[0] === '[' ? txt.replace('</Types>', e.ct + '</Types>') : txt.replace('</Relationships>', e.rel + '</Relationships>');
        f.data = utf8(txt);
      }
    });
    return files.concat(e.files);
  }

  // ---------- ZIP reader (stored + deflate) ----------
  function readZip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('الملف ليس ملف Word (docx) صالحاً');
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u8.subarray(ds, ds + csize);
      out[name] = method === 0 ? raw : method === 8 ? window.pako.inflateRaw(raw) : null;
      p += 46 + nl + el + cl;
    }
    return out;
  }

  // ---------- Document ----------
  var PAGE_W = 11906, PAGE_H = 16838, MARGIN = 720, CONTENT_W = PAGE_W - 2 * MARGIN;

  function hallXml(h, idx, s, hasLogo) {
    var x = '';
    // --- header block: info (right) | logo | hall box (left)
    var info = [s.line1, s.line2,
      'المركز الامتحاني رقم ( ' + s.center + ' ) للدراسة ( ' + s.level + ' )',
      'في بناية مدرسة :- ' + s.building].filter(function (t) { return t && t.trim(); })
      .map(function (t) { return para(run(t, { sz: 10, b: true }), { after: 40 }); }).join('');
    var box = tbl([1900, 800],
      tr(tc(1900, para(run('رقم القاعة', { sz: 14, b: true })), { fill: 'FFFF00' }) +
         tc(800, para(run(String(h.number), { sz: 14, b: true })))) +
      tr(tc(1900, para(run('العدد', { sz: 14, b: true })), { fill: 'FF0000' }) +
         tc(800, para(run(String(h.students.length), { sz: 14, b: true })))),
      { borders: true }) + para('');
    var wR = 4300, wM = 2400, wL = CONTENT_W - wR - wM;
    x += tbl([wR, wM, wL], tr(
      tc(wR, info) +
      tc(wM, para(hasLogo ? image('rIdLogo', 1005840, idx + 1) : '')) +
      tc(wL, box)));

    // --- titles
    x += para(run('خارطة جلوس الطلبة للامتحانات العامة للدراسة ( ' + s.level + ' )', { sz: 16, b: true }), { before: 120 });
    if (s.subject && s.subject.trim()) x += para(run('المادة / ' + s.subject, { sz: 16, b: true }));
    x += para(run('للعام الدراسي ' + s.year + ' م', { sz: 16, b: true }) +
      (s.round ? run(' – ', { sz: 16, b: true }) + run(s.round, { sz: 16, b: true, color: 'FF0000' }) : ''), { after: 160 });

    // --- seating grid
    var cols = h.grid[0] ? h.grid[0].length : s.cols;
    var cw = Math.floor(CONTENT_W / cols), widths = [];
    for (var i = 0; i < cols; i++) widths.push(cw);
    var head = '';
    for (i = 0; i < cols; i++) {
      head += tc(cw, para(run('اسم الطالب', { sz: 12, b: true })) +
        para(run('رقمه الامتحاني', { sz: 12, b: true })) +
        para(run('مدرسته', { sz: 12, b: true })), { fill: 'FF99CC' });
    }
    var rows = tr(head, { header: true });
    h.grid.forEach(function (r, ri) {
      var fill = ri % 2 === 0 ? 'FFFF99' : 'FFFFFF', cells = '';
      r.forEach(function (st) {
        cells += tc(cw, st
          ? para(run(st.name, { sz: 12, b: true })) + para(run(st.num, { sz: 12, b: true })) + para(run(st.school, { sz: 11, b: true }))
          : para(''), { fill: fill });
      });
      rows += tr(cells);
    });
    x += tbl(widths, rows, { borders: true });

    // --- footer (left side)
    x += para('', { before: 240 });
    var half = Math.floor(CONTENT_W / 2);
    x += tbl([half, CONTENT_W - half], tr(tc(half, para('')) +
      tc(CONTENT_W - half, para(run('مدير المركز', { sz: 12, b: true }), { after: 120 }) +
        para(run(s.director || '', { sz: 12, b: true })))));
    return x;
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>' +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '<w:lang w:val="en-US" w:bidi="ar-IQ"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

  function buildDocx(halls, s, logoBytes, payload) {
    var hasLogo = !!(logoBytes && s.showLogo);
    var body = halls.map(function (h, i) {
      var pre = i === 0 ? '' :
        '<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
      return pre + hallXml(h, i, s, hasLogo);
    }).join('');
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + body +
      '<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>' +
      '<w:sectPr><w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '" w:code="9"/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '" w:header="400" w:footer="400" w:gutter="0"/>' +
      '<w:bidi/></w:sectPr></w:body></w:document>';

    var styles = STYLES;

    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (hasLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : '') +
      '</Relationships>';

    var files = [
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'word/document.xml', data: utf8(doc) },
      { name: 'word/styles.xml', data: utf8(styles) },
      { name: 'word/_rels/document.xml.rels', data: utf8(docRels) }
    ];
    if (hasLogo) files.push({ name: 'word/media/logo.png', data: logoBytes });
    return zip(withEmbed(files, payload));
  }


  // ---------- Dispatch form (header + footer repeat on every page) ----------
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  function scaleW(arr, total) {
    var sum = arr.reduce(function (a, b) { return a + b; }, 0), out = arr.map(function (w) { return Math.floor(w * total / sum); });
    out[out.length - 1] += total - out.reduce(function (a, b) { return a + b; }, 0);
    return out;
  }
  function buildDispatch(x, payload) {
    var BLUE = '002060';
    // header: title + info table (6 columns: label, value, label, value, label, value)
    var iw = scaleW([1503, 2250, 2070, 2700, 974, 1726], CONTENT_W);
    var info = '';
    x.info.forEach(function (r) {
      info += tr(r.map(function (v, i) {
        var small = i % 2 === 1 && String(v || '').length > 16;
        return tc(iw[i], para(run(v || '', { sz: small ? 10 : 12, b: true, color: BLUE })), { fill: i % 2 ? '' : 'FFFF99' });
      }).join(''));
    });
    var hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '>' +
      para(run(x.title, { sz: 16, b: true, color: BLUE }), { after: 80 }) +
      tbl(iw, info, { borders: true }) + para('', { after: 60 }) + '</w:hdr>';

    // footer: two lines (name | signature | mobile)
    var fw = scaleW([4, 2, 4], CONTENT_W);
    var frows = x.foot.map(function (r) {
      return tr(tc(fw[0], para(run(r[0], { sz: 12, b: true, color: BLUE }), { after: 120 })) +
        tc(fw[1], para(run(r[1], { sz: 12, b: true, color: BLUE }), { after: 120 })) +
        tc(fw[2], para(run(r[2], { sz: 12, b: true, color: BLUE }), { after: 120 })));
    }).join('');
    var ftr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' + tbl(fw, frows) + para('') + '</w:ftr>';

    // body: list table with repeating header row
    var lw = scaleW([448, 2732, 2845, 1154, 872, 938, 1091, 1073], CONTENT_W);
    var rows = tr(x.heads.map(function (h, i) { return tc(lw[i], para(run(h, { sz: 10, b: true }))); })
      .join('').replace(/<w:tcPr>/g, '<w:tcPr>').replace(/(<w:tcW [^>]*\/>)/g, '$1<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>'), { header: true });
    var sizes = [12, 14, 14, 10, 11, 11, 10, 10];
    x.rows.forEach(function (r) {
      rows += tr(r.map(function (v, i) { return tc(lw[i], para(run(v, { sz: sizes[i], b: i < 3 || i === 5 }))); }).join(''));
    });
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' +
      tbl(lw, rows, { borders: true }) + para('') +
      '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>' +
      '<w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '" w:code="9"/>' +
      '<w:pgMar w:top="3300" w:right="' + MARGIN + '" w:bottom="1500" w:left="' + MARGIN + '" w:header="360" w:footer="300" w:gutter="0"/>' +
      '<w:bidi/></w:sectPr></w:body></w:document>';

    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="' + R + 'styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdHdr" Type="' + R + 'header" Target="header1.xml"/>' +
      '<Relationship Id="rIdFtr" Type="' + R + 'footer" Target="footer1.xml"/>' +
      '</Relationships>';
    return zip(withEmbed([
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'word/document.xml', data: utf8(doc) },
      { name: 'word/styles.xml', data: utf8(STYLES) },
      { name: 'word/header1.xml', data: utf8(hdr) },
      { name: 'word/footer1.xml', data: utf8(ftr) },
      { name: 'word/_rels/document.xml.rels', data: utf8(docRels) }
    ], payload));
  }

  window.DocxWriter = { build: buildDocx, buildDispatch: buildDispatch, readZip: readZip, DATA_NS: DATA_NS };
})();
