/* التصدير إلى Excel (xlsx) و Word (docx) — كل الملفات من اليمين لليسار */
var TT = self.TT || (self.TT = {});

(function (TT) {
  'use strict';

  var HEAD = '2E86C1', DAYCOL = 'D6EAF8', UNUSED = 'E5E7E9', FONT = 'Arial';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- بناء الجداول المجردة ---------- */

  TT.teacherLoads = function (sch) {
    var load = {};
    sch.grids.forEach(function (g, c) {
      g.forEach(function (j) {
        if (j < 0) return;
        var t = sch.classes[c].subjects[j].teacher;
        if (t) load[t] = (load[t] || 0) + 1;
      });
    });
    return load;
  };

  TT.scheduleTeachers = function (tt) {
    var sch = tt.schedule, seen = {}, out = [];
    var load = TT.teacherLoads(sch);
    tt.teachers.concat(Object.keys(load)).forEach(function (t) {
      if (load[t] && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out;
  };

  function lesson(l1, l2, fill, thick) {
    return { lines: l2 ? [l1, l2] : [l1], fill: fill, thick: thick };
  }

  function fullTable(tt) {
    var sch = tt.schedule, info = TT.slotInfo(sch.periods);
    var h1 = [{ lines: ['الصف والشعبة'], head: true, rs: 2 }];
    var h2 = [{ covered: true, vcont: true, head: true }];
    sch.days.forEach(function (d, di) {
      h1.push({ lines: [d], head: true, cs: sch.periods[di], thick: true });
      for (var k = 1; k < sch.periods[di]; k++) h1.push({ covered: true, head: true });
      for (k = 0; k < sch.periods[di]; k++) h2.push({ lines: [String(k + 1)], head: true, thick: k === 0 });
    });
    var body = sch.classes.map(function (c, ci) {
      var col = TT.colorOf(ci);
      var row = [{ lines: [c.title], fill: col, bold: true }];
      for (var s = 0; s < info.S; s++) {
        var j = sch.grids[ci][s], thick = info.per[s] === 0;
        if (j < 0) row.push(lesson('', '', col, thick));
        else row.push(lesson(c.subjects[j].name, c.subjects[j].teacher, col, thick));
      }
      return row;
    });
    return {
      name: 'الجدول الكامل (الصفوف)', title: 'جدول الدروس الأسبوعي - جميع الصفوف', paper: 'A3',
      header: [h1, h2], body: body, firstWidth: 2.2, wide: true
    };
  }

  /* الجدول الكامل بالشكل الورقي المعتاد: الأيام والحصص أسطر،
     ولكل صف عمودان (المادة | المدرس) بلون الصف، وخط سميك بين الأيام وبين الصفوف */
  function fullTableDays(tt) {
    var sch = tt.schedule, info = TT.slotInfo(sch.periods);
    var h1 = [{ lines: ['اليوم'], head: true, rs: 2 }, { lines: ['ت'], head: true, rs: 2 }];
    var h2 = [{ covered: true, vcont: true, head: true }, { covered: true, vcont: true, head: true }];
    var widths = [0.55, 0.35], xw = [6, 4];
    sch.classes.forEach(function (c) {
      h1.push({ lines: [c.title], head: true, cs: 2, thick: true }, { covered: true, head: true });
      h2.push({ lines: ['المادة'], head: true, thick: true }, { lines: ['المدرس'], head: true });
      widths.push(1.15, 1);
      xw.push(13, 11);
    });
    var body = [];
    sch.days.forEach(function (d, di) {
      for (var k = 0; k < sch.periods[di]; k++) {
        var s = info.start[di] + k, top = k === 0 && di > 0;
        var row = [k === 0 ?
          { lines: [d], fill: DAYCOL, bold: true, rs: sch.periods[di], rot: true, thickTop: di > 0 } :
          { covered: true, vcont: true, fill: DAYCOL, bold: true }];
        row.push({ lines: [String(k + 1)], fill: DAYCOL, bold: true, thickTop: top });
        sch.classes.forEach(function (c, ci) {
          var col = TT.colorOf(ci), j = sch.grids[ci][s];
          row.push({ lines: [j < 0 ? '' : c.subjects[j].name], fill: col, bold: true, thick: true, thickTop: top });
          row.push({ lines: [j < 0 ? '' : c.subjects[j].teacher], fill: col, thickTop: top });
        });
        body.push(row);
      }
    });
    return {
      name: 'الجدول الكامل', title: 'جدول الدروس الأسبوعي - جميع الصفوف', paper: 'A3',
      header: [h1, h2], body: body, widths: widths, xwidths: xw, freeze: 2, fitPage: true, dense: true
    };
  }

  function dayGrid(sch, cellFn) {
    var info = TT.slotInfo(sch.periods);
    var maxP = Math.max.apply(null, sch.periods.concat([1]));
    var head = [{ lines: ['اليوم'], head: true }];
    for (var k = 0; k < maxP; k++) head.push({ lines: [TT.PERIOD_NAMES[k]], head: true });
    var body = sch.days.map(function (d, di) {
      var row = [{ lines: [d], fill: DAYCOL, bold: true }];
      for (var k = 0; k < maxP; k++) {
        if (k >= sch.periods[di]) row.push({ lines: [''], fill: UNUSED });
        else row.push(cellFn(info.start[di] + k));
      }
      return row;
    });
    return { header: [head], body: body };
  }

  function classTable(tt, ci) {
    var sch = tt.schedule, c = sch.classes[ci], col = TT.colorOf(ci);
    var t = dayGrid(sch, function (s) {
      var j = sch.grids[ci][s];
      if (j < 0) return { lines: ['فراغ'] };
      return lesson(c.subjects[j].name, c.subjects[j].teacher, col);
    });
    t.name = c.title;
    t.title = 'جدول الدروس الأسبوعي - ' + c.title;
    t.paper = 'A4';
    t.firstWidth = 1.2;
    return t;
  }

  function teacherTable(tt, name) {
    var sch = tt.schedule, load = TT.teacherLoads(sch)[name] || 0;
    var t = dayGrid(sch, function (s) {
      for (var ci = 0; ci < sch.classes.length; ci++) {
        var j = sch.grids[ci][s];
        if (j >= 0 && sch.classes[ci].subjects[j].teacher === name) {
          return lesson(sch.classes[ci].title, sch.classes[ci].subjects[j].name, TT.colorOf(ci));
        }
      }
      return { lines: [''] };
    });
    t.name = name;
    t.title = 'جدول المدرس: ' + name + ' (النصاب ' + load + ' حصة)';
    t.paper = 'A4';
    t.firstWidth = 1.2;
    return t;
  }

  /* kind: full | class | teacher | all */
  TT.exportTables = function (tt, kind, arg) {
    if (kind === 'full') return [fullTableDays(tt)];
    if (kind === 'fullc') return [fullTable(tt)];
    if (kind === 'class') return [classTable(tt, arg)];
    if (kind === 'teacher') return [teacherTable(tt, arg)];
    var out = [fullTableDays(tt)];
    tt.schedule.classes.forEach(function (c, ci) { out.push(classTable(tt, ci)); });
    TT.scheduleTeachers(tt).forEach(function (t) { out.push(teacherTable(tt, t)); });
    return out;
  };

  function colCount(t) {
    var n = 0;
    t.header[0].forEach(function () { n++; });
    return n;
  }

  /* ---------- Excel ---------- */

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = ((i - 1) / 26) | 0; }
    return s;
  }

  function sheetName(name, used) {
    var base = name.replace(/[\[\]:*?\/\\']/g, ' ').trim().slice(0, 28) || 'ورقة';
    var n = base, k = 2;
    while (used[n]) n = base.slice(0, 26) + ' ' + (k++);
    used[n] = 1;
    return n;
  }

  TT.buildXlsx = function (tables, school) {
    var fills = ['none', 'gray125'], fillIdx = {};
    function fillId(hex) {
      if (!hex) return 0;
      if (fillIdx[hex] === undefined) { fillIdx[hex] = fills.length; fills.push(hex); }
      return fillIdx[hex];
    }
    // الخطوط: 0 عادي، 1 عريض، 2 عنوان عمود أبيض، 3 عنوان الصفحة
    var xfs = [], xfIdx = {};
    function style(font, fill, border, title, rot) {
      var k = font + '|' + fill + '|' + border + '|' + (title ? 1 : 0) + '|' + (rot ? 1 : 0);
      if (xfIdx[k] === undefined) { xfIdx[k] = xfs.length; xfs.push([font, fillId(fill), border, title, rot]); }
      return xfIdx[k];
    }
    style(0, null, 0); // النمط الافتراضي

    var used = {}, sheets = [], names = [];
    tables.forEach(function (t) {
      var name = sheetName(t.name, used);
      names.push(name);
      var ncol = colCount(t), rows = [], merges = [];
      var title = (school ? school + '\n' : '') + t.title;
      var titleStyle = style(3, null, 0, true);
      var r1 = '<row r="1" ht="' + (school ? 42 : 26) + '" customHeight="1"><c r="A1" s="' + titleStyle + '" t="inlineStr"><is><t xml:space="preserve">' + esc(title) + '</t></is></c></row>';
      rows.push(r1);
      merges.push('A1:' + colName(ncol - 1) + '1');

      var all = t.header.map(function (r) { return { cells: r, head: true }; })
        .concat(t.body.map(function (r) { return { cells: r }; }));
      all.forEach(function (r, ri) {
        var rn = ri + 2, xml = [];
        var two = r.cells.some(function (c) { return c.lines && c.lines.length > 1; });
        r.cells.forEach(function (c, ci) {
          var ref = colName(ci) + rn;
          var font = c.head ? 2 : (c.bold ? 1 : 0);
          // الحدود: 1 رفيع، 2 سميك على البداية، 3 سميك من الأعلى، 4 كلاهما
          var s = style(font, c.head ? HEAD : c.fill, 1 + (c.thick ? 1 : 0) + (c.thickTop ? 2 : 0), false, c.rot);
          if (c.covered) { xml.push('<c r="' + ref + '" s="' + s + '"/>'); return; }
          var lines = c.lines || [''];
          var content;
          if (lines.length > 1) {
            content = '<is><r><rPr><rFont val="' + FONT + '"/><b/><sz val="10"/></rPr><t>' + esc(lines[0]) + '</t></r>' +
              '<r><rPr><rFont val="' + FONT + '"/><color rgb="FF424949"/><sz val="8"/></rPr><t xml:space="preserve">&#10;' + esc(lines[1]) + '</t></r></is>';
          } else {
            content = '<is><t xml:space="preserve">' + esc(lines[0]) + '</t></is>';
          }
          xml.push('<c r="' + ref + '" s="' + s + '" t="inlineStr">' + content + '</c>');
          if ((c.cs || 1) > 1 || (c.rs || 1) > 1) {
            merges.push(ref + ':' + colName(ci + (c.cs || 1) - 1) + (rn + (c.rs || 1) - 1));
          }
        });
        var ht = r.head ? 20 : (two ? 34 : (t.dense ? 20 : 24));
        rows.push('<row r="' + rn + '" ht="' + ht + '" customHeight="1">' + xml.join('') + '</row>');
      });

      var nHead = t.header.length;
      var cols;
      if (t.xwidths) {
        cols = '<cols>' + t.xwidths.map(function (w, i) {
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join('') + '</cols>';
      } else {
        var firstW = t.wide ? 18 : 14, otherW = t.wide ? 12 : 17;
        cols = '<cols><col min="1" max="1" width="' + firstW + '" customWidth="1"/>' +
          (ncol > 1 ? '<col min="2" max="' + ncol + '" width="' + otherW + '" customWidth="1"/>' : '') + '</cols>';
      }
      var fz = t.freeze || 1;
      var lastRow = all.length + 1;
      var paper = t.paper === 'A3' ? 8 : 9;
      sheets.push(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
        '<dimension ref="A1:' + colName(ncol - 1) + lastRow + '"/>' +
        '<sheetViews><sheetView rightToLeft="1" workbookViewId="0">' +
        '<pane xSplit="' + fz + '" ySplit="' + (nHead + 1) + '" topLeftCell="' + colName(fz) + (nHead + 2) + '" activePane="bottomRight" state="frozen"/>' +
        '</sheetView></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' + cols +
        '<sheetData>' + rows.join('') + '</sheetData>' +
        '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' +
        '<printOptions horizontalCentered="1"/>' +
        '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>' +
        '<pageSetup paperSize="' + paper + '" orientation="landscape" fitToWidth="1" fitToHeight="' + (t.fitPage ? 1 : 0) + '"/>' +
        '</worksheet>');
      t._printRows = '$2:$' + (nHead + 1);
    });

    var fontsXml = '<fonts count="4">' +
      '<font><sz val="10"/><name val="' + FONT + '"/></font>' +
      '<font><b/><sz val="10"/><name val="' + FONT + '"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="' + FONT + '"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF1B4F72"/><name val="' + FONT + '"/></font></fonts>';
    var fillsXml = '<fills count="' + fills.length + '">' + fills.map(function (f) {
      if (f === 'none' || f === 'gray125') return '<fill><patternFill patternType="' + f + '"/></fill>';
      return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + f + '"/><bgColor indexed="64"/></patternFill></fill>';
    }).join('') + '</fills>';
    var thin = '<color rgb="FF7F8C8D"/>';
    var THICK = '<color rgb="FF000000"/>';
    function border(left, top) {
      return '<border>' + (left ? '<left style="thick">' + THICK + '</left>' : '<left style="thin">' + thin + '</left>') +
        '<right style="thin">' + thin + '</right>' +
        (top ? '<top style="thick">' + THICK + '</top>' : '<top style="thin">' + thin + '</top>') +
        '<bottom style="thin">' + thin + '</bottom><diagonal/></border>';
    }
    var bordersXml = '<borders count="5"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      border(false, false) + border(true, false) + border(false, true) + border(true, true) + '</borders>';
    var xfsXml = '<cellXfs count="' + xfs.length + '">' + xfs.map(function (x) {
      return '<xf numFmtId="0" fontId="' + x[0] + '" fillId="' + x[1] + '" borderId="' + x[2] + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"' + (x[4] ? ' textRotation="90"' : '') + '/></xf>';
    }).join('') + '</cellXfs>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      fontsXml + fillsXml + bordersXml +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      xfsXml + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets><definedNames>' +
      names.map(function (n, i) {
        return '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + esc(n) + '\'!' + tables[i]._printRows + '</definedName>';
      }).join('') + '</definedNames></workbook>';

    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map(function (n, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map(function (n, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

    var files = [
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
      { name: 'xl/styles.xml', data: styles }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s }); });
    return TT.zip(files);
  };

  /* ---------- Word ---------- */

  var PAGES = { A3: { w: 23811, h: 16838 }, A4: { w: 16838, h: 11906 } };
  var MARGIN = 567;

  function run(text, o) {
    o = o || {};
    return '<w:r><w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' +
      (o.bold ? '<w:b/><w:bCs/>' : '') +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
      '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/><w:rtl/></w:rPr>' +
      '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }
  function para(text, o) {
    return '<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="' + (o.after || 0) + '"/><w:jc w:val="center"/></w:pPr>' +
      (text ? run(text, o) : '') + '</w:p>';
  }
  function sectPr(paper) {
    var p = PAGES[paper];
    return '<w:sectPr><w:pgSz w:w="' + p.w + '" w:h="' + p.h + '" w:orient="landscape"/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '" w:header="300" w:footer="300" w:gutter="0"/>' +
      '<w:bidi/></w:sectPr>';
  }

  function wordTable(t) {
    var ncol = colCount(t), p = PAGES[t.paper];
    var avail = p.w - 2 * MARGIN;
    var widths, i;
    if (t.widths) {
      var sum = t.widths.reduce(function (a, b) { return a + b; }, 0);
      widths = t.widths.map(function (w) { return Math.floor(avail * w / sum); });
    } else {
      var first = Math.round(avail * t.firstWidth / (t.firstWidth + ncol - 1));
      var other = Math.floor((avail - first) / Math.max(1, ncol - 1));
      widths = [first];
      for (i = 1; i < ncol; i++) widths.push(other);
    }
    var size, size2;
    if (t.dense) { size = ncol > 26 ? 12 : 15; size2 = size; }
    else if (t.wide) { size = ncol > 25 ? 12 : 14; size2 = ncol > 25 ? 10 : 12; }
    else { size = 20; size2 = 16; }
    var bd = '<w:top w:val="single" w:sz="4" w:color="7F8C8D"/><w:left w:val="single" w:sz="4" w:color="7F8C8D"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="7F8C8D"/><w:right w:val="single" w:sz="4" w:color="7F8C8D"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="7F8C8D"/><w:insideV w:val="single" w:sz="4" w:color="7F8C8D"/>';
    var xml = '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="' + avail + '" w:type="dxa"/><w:jc w:val="center"/>' +
      '<w:tblBorders>' + bd + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>' +
      widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';

    var rows = t.header.map(function (r) { return { cells: r, head: true }; })
      .concat(t.body.map(function (r) { return { cells: r }; }));
    rows.forEach(function (r, ri) {
      xml += '<w:tr><w:trPr><w:cantSplit/>' + (r.head ? '<w:tblHeader/>' : '') + '</w:trPr>';
      for (var ci = 0; ci < r.cells.length; ci++) {
        var c = r.cells[ci];
        var cs = c.cs || 1;
        if (c.covered) {
          // خلية مغطاة: جزء من دمج أفقي (تُتخطى) أو استمرار دمج عمودي (vMerge)
          if (c.vcont) {
            xml += '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/><w:vMerge/>' +
              '<w:shd w:val="clear" w:color="auto" w:fill="' + (c.head ? HEAD : (c.fill || 'FFFFFF')) + '"/></w:tcPr><w:p><w:pPr><w:bidi/></w:pPr></w:p></w:tc>';
          }
          continue;
        }
        var w = 0;
        for (var k = 0; k < cs; k++) w += widths[ci + k];
        var fill = c.head ? HEAD : (c.fill || 'FFFFFF');
        xml += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' +
          (cs > 1 ? '<w:gridSpan w:val="' + cs + '"/>' : '') +
          ((c.rs || 1) > 1 ? '<w:vMerge w:val="restart"/>' : '') +
          (c.thick || c.thickTop ? '<w:tcBorders>' +
            (c.thickTop ? '<w:top w:val="single" w:sz="18" w:color="000000"/>' : '') +
            (c.thick ? '<w:left w:val="single" w:sz="18" w:color="000000"/>' : '') + '</w:tcBorders>' : '') +
          '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' +
          '<w:vAlign w:val="center"/></w:tcPr>';
        var lines = c.lines || [''];
        if (c.head) xml += para(lines[0], { bold: true, size: size + 2, color: 'FFFFFF' });
        else {
          xml += para(lines[0], { bold: c.bold || lines.length > 1, size: size });
          if (lines.length > 1) xml += para(lines[1], { size: size2, color: '424949' });
        }
        xml += '</w:tc>';
      }
      xml += '</w:tr>';
    });
    return xml + '</w:tbl>';
  }

  TT.buildDocx = function (tables, school) {
    var body = '';
    tables.forEach(function (t, i) {
      if (school) body += para(school, { bold: true, size: 32, color: '1B4F72' });
      body += para(t.title, { bold: true, size: 28, color: '1B4F72', after: 120 });
      body += wordTable(t);
      if (i < tables.length - 1) {
        body += '<w:p><w:pPr><w:bidi/>' + sectPr(t.paper) + '</w:pPr></w:p>';
      } else {
        body += '<w:p><w:pPr><w:bidi/></w:pPr></w:p>' + sectPr(t.paper);
      }
    });
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ' + NS + '><w:body>' + body + '</w:body></w:document>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ' + NS + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ar-SA" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:bidiVisual/><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return TT.zip([
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'word/document.xml', data: doc },
      { name: 'word/_rels/document.xml.rels', data: docRels },
      { name: 'word/styles.xml', data: styles }
    ]);
  };
})(TT);
