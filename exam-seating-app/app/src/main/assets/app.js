(function () {
  'use strict';
  var KEY = 'examSeating.v1';
  var DEFAULTS = {
    perHall: 21, customCounts: '', startHall: 1, cols: 3, fill: 'cols', order: 'entry', numMode: 'same',
    line1: 'المديرية العامة لتربية صلاح الدين',
    line2: 'اللجنة الفرعية للامتحانات العامة',
    center: '9', level: 'المتوسطة', building: 'السماحة الابتدائية للبنات',
    subject: 'الأجتماعيات', year: '2025 – 2026', round: 'الدور الثالث',
    director: 'هديل علي حمود', showLogo: true
  };

  var state = load();
  var editingId = null;
  var numAuto = true; // the number field currently holds an auto-filled value

  function load() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
    st = st || {};
    st.settings = Object.assign({}, DEFAULTS, st.settings || {});
    if (!st.settings.v || st.settings.v < 2) { // v2: default = entry order, filled column by column from the right
      st.settings.fill = 'cols'; st.settings.order = 'entry'; st.settings.v = 2;
    }
    st.students = st.students || [];
    st.schools = st.schools || {}; // school name -> last exam number used
    return st;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('تعذر الحفظ'); }
  }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function toLatinDigits(s) {
    return String(s || '').replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x06F0; });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2500);
  }

  // increments the trailing number while keeping the total length (e.g. 0099 -> 0100)
  function incNum(n) {
    var m = /^(.*?)(\d+)$/.exec(n || '');
    if (!m) return n || '';
    var d = m[2].split(''), i = d.length - 1;
    while (i >= 0) {
      if (d[i] === '9') { d[i] = '0'; i--; } else { d[i] = String(+d[i] + 1); break; }
    }
    if (i < 0) d.unshift('1');
    return m[1] + d.join('');
  }

  // ---------------- Tabs ----------------
  var currentTab = 'students';
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + name); });
    document.body.classList.toggle('show-dispatch', name === 'dispatch');
    if (name === 'sheets') renderSheetsTab(); else { document.body.classList.remove('show-sheets'); clearSel(); }
    if (name === 'dispatch') renderDispatchTab();
    if (name === 'settings') renderSchoolsCard();
    syncSettingsUI();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  window.onAndroidBack = function () {
    if (sel) { clearSel(); renderEditor(); return true; }
    if (editingId) { cancelEdit(); return true; }
    if (currentTab !== 'students') { showTab('students'); return true; }
    return false;
  };

  // ---------------- Schools ----------------
  function schoolNames() {
    var names = Object.keys(state.schools);
    state.students.forEach(function (s) { if (names.indexOf(s.school) < 0) names.push(s.school); });
    return names;
  }
  function lastNumFor(school) {
    if (!editingId && state.schools[school]) return state.schools[school]; // saved / prepared number (updated on every add)
    for (var i = state.students.length - 1; i >= 0; i--) {
      if (state.students[i].school === school && state.students[i].id !== editingId) return state.students[i].num;
    }
    return state.schools[school] || '';
  }
  function renderSchools() {
    var names = schoolNames();
    $('schoolList').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('schoolChips').innerHTML = names.map(function (n) {
      return '<button class="chip" data-school="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
  }
  $('schoolChips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    $('fSchool').value = b.dataset.school;
    onSchoolChosen(true);
  });

  function onSchoolChosen(focusNum) {
    var school = norm($('fSchool').value);
    var last = state.schools.hasOwnProperty(school) || schoolNames().indexOf(school) >= 0 ? lastNumFor(school) : '';
    if (last) {
      $('numHint').textContent = 'آخر رقم امتحاني لهذه المدرسة: ' + last;
      if (numAuto || !$('fNum').value) {
        $('fNum').value = state.settings.numMode === 'plus' ? incNum(last) : last;
        numAuto = true;
      }
      if (focusNum) focusNumber();
    } else {
      $('numHint').textContent = school ? 'مدرسة جديدة: اكتب الرقم الامتحاني كاملاً' : '';
    }
  }
  function focusNumber() {
    var f = $('fNum');
    f.focus();
    try { var l = f.value.length; f.setSelectionRange(l, l); } catch (e) { /* ignore */ }
  }
  $('fSchool').addEventListener('change', function () { onSchoolChosen(true); });
  $('fSchool').addEventListener('input', function () {
    var v = norm($('fSchool').value);
    if (schoolNames().indexOf(v) >= 0) onSchoolChosen(false);
  });
  $('fNum').addEventListener('input', function () { numAuto = false; });

  // ---------------- Add / edit ----------------
  function readForm() {
    return {
      name: norm($('fName').value),
      school: norm($('fSchool').value),
      num: toLatinDigits($('fNum').value).replace(/\s+/g, '')
    };
  }
  function addOrUpdate() {
    var f = readForm();
    if (!f.name) { toast('اكتب اسم الطالب'); $('fName').focus(); return; }
    if (!f.school) { toast('اكتب اسم المدرسة'); $('fSchool').focus(); return; }
    if (!f.num) { toast('اكتب الرقم الامتحاني'); $('fNum').focus(); return; }
    var dup = state.students.filter(function (s) { return s.num === f.num && s.id !== editingId; })[0];
    if (dup && !confirm('الرقم الامتحاني ' + f.num + ' مستخدم للطالب: ' + dup.name + '\nهل تريد الإضافة رغم ذلك؟')) return;

    if (editingId) {
      var st = state.students.filter(function (s) { return s.id === editingId; })[0];
      if (st) { st.name = f.name; st.school = f.school; st.num = f.num; }
      toast('تم حفظ التعديل');
      cancelEdit();
    } else {
      state.students.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name, school: f.school, num: f.num });
      toast(state.layout ? 'تمت الإضافة — الجدول معدل يدوياً، ستجدها في «غير الموزعين» بتبويب الجدول' : 'تمت الإضافة (' + state.students.length + ')');
      // keep school, prepare the next number, focus the name
      $('fName').value = '';
      numAuto = true; $('fNum').value = '';
      state.schools[f.school] = f.num;
      save();
      onSchoolChosen(false);
      $('fName').focus();
    }
    state.schools[f.school] = lastNumFor(f.school) || f.num;
    save();
    renderAll();
  }
  $('btnAdd').addEventListener('click', addOrUpdate);
  $('fNum').addEventListener('keydown', function (e) { if (e.key === 'Enter') addOrUpdate(); });
  $('fName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('fSchool').focus(); });
  $('fSchool').addEventListener('keydown', function (e) { if (e.key === 'Enter') { onSchoolChosen(true); if (!$('fNum').value) $('fNum').focus(); } });

  function startEdit(id) {
    var st = state.students.filter(function (s) { return s.id === id; })[0]; if (!st) return;
    editingId = id;
    $('fName').value = st.name; $('fSchool').value = st.school; $('fNum').value = st.num; numAuto = false;
    $('formTitle').textContent = 'تعديل طالب';
    $('btnAdd').textContent = 'حفظ التعديل';
    $('btnCancelEdit').classList.remove('hidden');
    $('btnDelEdit').classList.remove('hidden');
    $('numHint').textContent = '';
    window.scrollTo(0, 0); $('fName').focus();
  }
  function cancelEdit() {
    editingId = null;
    $('fName').value = ''; $('fNum').value = ''; numAuto = true;
    $('formTitle').textContent = 'إضافة طالب';
    $('btnAdd').textContent = 'إضافة';
    $('btnCancelEdit').classList.add('hidden');
    $('btnDelEdit').classList.add('hidden');
    onSchoolChosen(false);
  }
  $('btnCancelEdit').addEventListener('click', cancelEdit);
  $('btnDelEdit').addEventListener('click', function () {
    var st = state.students.filter(function (s) { return s.id === editingId; })[0]; if (!st) return;
    if (!confirm('حذف الطالبة نهائياً؟\n' + st.name + ' — ' + st.num)) return;
    deleteStudent(st.id); cancelEdit(); toast('تم الحذف');
  });

  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.dataset.id, arr = state.students;
    var i = arr.findIndex(function (s) { return s.id === id; });
    if (i < 0) return;
    var act = b.dataset.act;
    if (act === 'edit') return startEdit(id);
    if (act === 'del') {
      if (!confirm('حذف الطالبة نهائياً؟\n' + arr[i].name + ' — ' + arr[i].num + '\n' + arr[i].school)) return;
      deleteStudent(id); toast('تم الحذف'); return;
    } else if (act === 'up' && i > 0) {
      var t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t;
    } else if (act === 'down' && i < arr.length - 1) {
      var t2 = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t2;
    }
    save(); renderAll();
  });
  $('search').addEventListener('input', renderList);

  function deleteStudent(id) {
    state.students = state.students.filter(function (s) { return s.id !== id; });
    if (state.layout) state.layout.halls.forEach(function (h) { h.seats = h.seats.map(function (x) { return x === id ? null : x; }); });
    if (editingId === id) cancelEdit();
    save(); renderAll();
  }

  // ---------------- Halls ----------------
  function orderedStudents() {
    var s = state.settings, list = state.students.slice();
    if (s.order === 'num') {
      list.sort(function (a, b) { return a.num.length - b.num.length || (a.num < b.num ? -1 : a.num > b.num ? 1 : 0); });
    } else if (s.order === 'mix') {
      var groups = {}, keys = [];
      list.forEach(function (st) { if (!groups[st.school]) { groups[st.school] = []; keys.push(st.school); } groups[st.school].push(st); });
      keys.sort(function (a, b) { return groups[b].length - groups[a].length; });
      var out = [], prev = null;
      while (out.length < list.length) {
        // pick the largest remaining group that differs from the previous school
        var best = null;
        keys.forEach(function (k) {
          if (!groups[k].length || k === prev) return;
          if (!best || groups[k].length > groups[best].length) best = k;
        });
        if (!best) best = prev;
        out.push(groups[best].shift()); prev = best;
      }
      list = out;
    }
    return list;
  }
  // per-hall counts by position; 0 = use the default count
  function hallCounts() {
    var str = String(state.settings.customCounts || '').trim();
    if (!str) return [];
    return str.split(/[,،]/).map(function (x) { var v = parseInt(toLatinDigits(x), 10); return v > 0 ? v : 0; });
  }
  function autoHalls() {
    var s = state.settings, list = orderedStudents(), custom = hallCounts();
    var per = Math.max(1, parseInt(s.perHall, 10) || 21), cols = Math.max(1, parseInt(s.cols, 10) || 3);
    var halls = [], pos = 0, h = 0, start = parseInt(s.startHall, 10) || 1;
    while (pos < list.length) {
      var n = custom[h] || per, chunk = list.slice(pos, pos + n);
      pos += n;
      var rows = Math.ceil(chunk.length / cols), grid = [];
      for (var r = 0; r < rows; r++) { grid.push(new Array(cols).fill(null)); }
      chunk.forEach(function (st, k) {
        var r2, c2;
        if (s.fill === 'cols') { r2 = k % rows; c2 = Math.floor(k / rows); } else { r2 = Math.floor(k / cols); c2 = k % cols; }
        grid[r2][c2] = st;
      });
      halls.push({ number: start + h, students: chunk, grid: grid });
      h++;
    }
    return halls;
  }


  // ---------------- Manual layout ----------------
  // state.layout = { halls: [ { seats: [studentId | null, ...] } ] }   (seats in reading order, row by row)
  function cols() { return Math.max(1, parseInt(state.settings.cols, 10) || 3); }
  function studentMap() { var m = {}; state.students.forEach(function (s) { m[s.id] = s; }); return m; }
  function freezeLayout() {
    if (state.layout) return;
    state.layout = {
      halls: autoHalls().map(function (h) {
        var seats = [];
        h.grid.forEach(function (r) { r.forEach(function (st) { seats.push(st ? st.id : null); }); });
        return { seats: seats };
      })
    };
    save();
  }
  function cleanLayout() {
    if (!state.layout) return;
    var m = studentMap(), seen = {}, c = cols();
    state.layout.halls.forEach(function (h) {
      h.seats = h.seats.map(function (id) {
        if (!id || !m[id] || seen[id]) return null;
        seen[id] = 1; return id;
      });
      while (h.seats.length % c) h.seats.push(null);
      if (!h.seats.length) for (var i = 0; i < c; i++) h.seats.push(null);
    });
  }
  function reflowLayout() { cleanLayout(); }
  function unassigned() {
    if (!state.layout) return [];
    var used = {};
    state.layout.halls.forEach(function (h) { h.seats.forEach(function (id) { if (id) used[id] = 1; }); });
    return state.students.filter(function (s) { return !used[s.id]; });
  }
  function buildHalls() {
    if (!state.layout) return autoHalls();
    cleanLayout();
    var m = studentMap(), c = cols(), start = parseInt(state.settings.startHall, 10) || 1;
    return state.layout.halls.map(function (h, i) {
      var seats = h.seats.map(function (id) { return id ? m[id] : null; }), grid = [];
      for (var k = 0; k < seats.length; k += c) grid.push(seats.slice(k, k + c));
      return { number: start + i, students: seats.filter(Boolean), grid: grid };
    });
  }

  // ---------------- Render ----------------
  function renderStats() {
    var halls = buildHalls();
    $('stats').textContent = 'عدد الطلاب: ' + state.students.length + '  •  عدد القاعات: ' + halls.length +
      '  •  عدد المدارس: ' + schoolNames().length +
      (state.layout && unassigned().length ? '  •  غير موزعين على القاعات: ' + unassigned().length : '');
  }
  var selMode = false, picked = {};
  function pickedCount() { return Object.keys(picked).length; }
  function renderList() {
    var q = norm($('search').value), arr = state.students;
    $('selBar').classList.toggle('hidden', !selMode);
    $('btnSelMode').classList.toggle('hidden', selMode);
    if (selMode) {
      $('selDelete').textContent = 'حذف المحدد (' + pickedCount() + ')';
      $('selSchool').innerHTML = '<option value="">تحديد طالبات مدرسة...</option>' + schoolNames().filter(function (n) {
        return arr.some(function (s) { return s.school === n; });
      }).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
      $('selSchool').value = '';
    }
    if (!arr.length) { $('list').innerHTML = '<li class="empty">لا يوجد طلاب بعد</li>'; return; }
    var html = '';
    arr.forEach(function (s, i) {
      if (q && (s.name + ' ' + s.num + ' ' + s.school).indexOf(q) < 0) return;
      if (selMode) {
        html += '<li class="' + (picked[s.id] ? 'picked' : '') + '" data-pick="' + s.id + '"><input class="pick" type="checkbox"' + (picked[s.id] ? ' checked' : '') +
          '><span class="idx">' + (i + 1) + '</span><div class="info"><div class="nm">' + esc(s.name) +
          '</div><div class="sub"><b>' + esc(s.num) + '</b> — ' + esc(s.school) + '</div></div></li>';
        return;
      }
      html += '<li><span class="idx">' + (i + 1) + '</span><div class="info"><div class="nm">' + esc(s.name) +
        '</div><div class="sub"><b>' + esc(s.num) + '</b> — ' + esc(s.school) + '</div></div>' +
        '<div class="acts"><button data-act="up" data-id="' + s.id + '">▲</button>' +
        '<button data-act="down" data-id="' + s.id + '">▼</button>' +
        '<button data-act="edit" data-id="' + s.id + '">✎</button>' +
        '<button class="delbtn" data-act="del" data-id="' + s.id + '">حذف</button></div></li>';
    });
    $('list').innerHTML = html || '<li class="empty">لا توجد نتائج</li>';
  }
  function renderAll() { renderSchools(); renderStats(); renderList(); }

  function logoSrc() { return 'data:image/png;base64,' + window.LOGO_B64; }
  function sheetHtml(h) {
    var s = state.settings;
    var info = [s.line1, s.line2, 'المركز الامتحاني رقم ( ' + s.center + ' ) للدراسة ( ' + s.level + ' )', 'في بناية مدرسة :- ' + s.building]
      .filter(function (t) { return norm(t); }).map(esc).join('<br>');
    var head = '';
    for (var c = 0; c < h.grid[0].length; c++) head += '<th>اسم الطالب<br>رقمه الامتحاني<br>مدرسته</th>';
    var body = h.grid.map(function (row, ri) {
      return '<tr class="' + (ri % 2 === 0 ? 'alt' : '') + '">' + row.map(function (st) {
        return st ? '<td>' + esc(st.name) + '<br><span class="n">' + esc(st.num) + '</span><br>' + esc(st.school) + '</td>' : '<td></td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="sheet">' +
      '<table class="hdr"><tr><td class="hdr-r">' + info + '</td>' +
      '<td class="hdr-m">' + (s.showLogo ? '<img src="' + logoSrc() + '">' : '') + '</td>' +
      '<td class="hdr-l"><table class="hallbox"><tr><td class="y">رقم القاعة</td><td>' + h.number + '</td></tr>' +
      '<tr><td class="r">العدد</td><td>' + h.students.length + '</td></tr></table></td></tr></table>' +
      '<div class="title">خارطة جلوس الطلبة للامتحانات العامة للدراسة ( ' + esc(s.level) + ' )</div>' +
      (norm(s.subject) ? '<div class="title">المادة / ' + esc(s.subject) + '</div>' : '') +
      '<div class="title">للعام الدراسي ' + esc(s.year) + ' م' + (norm(s.round) ? ' – <span class="red">' + esc(s.round) + '</span>' : '') + '</div>' +
      '<table class="grid"><tr>' + head + '</tr>' + body + '</table>' +
      '<table class="foot"><tr><td style="width:50%"></td><td>مدير المركز<br>' + esc(s.director) + '</td></tr></table>' +
      '</div>';
  }
  function renderSheets() {
    var halls = buildHalls();
    $('sheets').innerHTML = halls.length ? halls.map(sheetHtml).join('') :
      '<div class="card empty">أضف الطلاب أولاً من تبويب «الطلاب»</div>';
    fitSheets();
  }
  function fitSheets() {
    var el = $('sheets');
    if (!el.querySelector('.sheet')) { el.style.transform = ''; el.style.height = ''; return; }
    var avail = $('sheetsWrap').clientWidth - 24;
    var scale = Math.min(1, avail / 794);
    el.style.width = '794px';
    el.style.transform = 'scale(' + scale + ')';
    el.style.height = '';
    el.style.height = (el.scrollHeight * scale) + 'px';
    el.style.marginRight = '0';
  }
  window.addEventListener('resize', function () { if (currentTab === 'sheets') fitSheets(); if (currentTab === 'dispatch') renderDispatchPreview(); });

  // ---------------- Sheets tab: preview / edit ----------------
  var sheetMode = 'preview';
  var sel = null; // {h, k} seat  or  {id} from the unassigned tray
  function clearSel() { sel = null; $('actionBar').classList.add('hidden'); document.body.classList.remove('has-bar'); }
  function setMode(m) {
    sheetMode = m;
    $('modePreview').classList.toggle('active', m === 'preview');
    $('modeEdit').classList.toggle('active', m === 'edit');
    $('previewPanel').classList.toggle('hidden', m !== 'preview');
    $('editPanel').classList.toggle('hidden', m !== 'edit');
    clearSel();
    renderSheetsTab();
  }
  $('modePreview').addEventListener('click', function () { setMode('preview'); });
  $('modeEdit').addEventListener('click', function () {
    if (!state.students.length) { toast('أضف الطلاب أولاً'); return; }
    setMode('edit');
  });
  function renderSheetsTab() {
    var preview = sheetMode === 'preview';
    document.body.classList.toggle('show-sheets', preview);
    if (preview) renderSheets(); else { freezeLayout(); renderEditor(); }
    renderHallCounts();
  }

  function seatClash(h, k) {
    var seats = state.layout.halls[h].seats, c = cols(), id = seats[k];
    if (!id) return false;
    var m = studentMap(), me = m[id]; if (!me) return false;
    var nb = [];
    if (k % c > 0) nb.push(k - 1);
    if (k % c < c - 1) nb.push(k + 1);
    nb.push(k - c, k + c);
    return nb.some(function (j) { return j >= 0 && j < seats.length && seats[j] && m[seats[j]] && m[seats[j]].school === me.school; });
  }

  function renderEditor() {
    cleanLayout(); save();
    var m = studentMap(), c = cols(), start = parseInt(state.settings.startHall, 10) || 1;
    // unassigned tray
    var un = unassigned();
    var tray = $('tray');
    if (un.length) {
      tray.classList.remove('hidden');
      tray.innerHTML = '<div class="row between"><h3>غير موزعين على القاعات (' + un.length + ')</h3>' +
        '<button id="btnAutoPlace" class="ghost" style="padding:6px 10px;font-size:13px">توزيعهم تلقائياً</button></div>' +
        '<div class="hint" style="margin:0 0 8px">اضغط على الاسم ثم اضغط على مكان في أي قاعة.</div><div class="chips">' +
        un.map(function (s) {
          return '<button class="chip' + (sel && sel.id === s.id ? ' sel' : '') + '" data-un="' + s.id + '">' + esc(s.name) + '</button>';
        }).join('') + '</div>';
    } else { tray.classList.add('hidden'); tray.innerHTML = ''; }

    var html = '';
    state.layout.halls.forEach(function (h, hi) {
      var n = h.seats.filter(Boolean).length;
      html += '<div class="hallcard" id="hall-' + hi + '"><div class="hallhead"><div class="ttl">قاعة ' + (start + hi) +
        ' <small>— ' + n + ' طالب / ' + h.seats.length + ' مكان</small></div><div class="hb">' +
        '<button data-hact="addrow" data-h="' + hi + '">+ صف</button>' +
        '<button data-hact="delrow" data-h="' + hi + '">− صف</button>' +
        (un.length && n < h.seats.length ? '<button data-hact="fill" data-h="' + hi + '">ملء الفراغات</button>' : '') +
        '<button data-hact="up" data-h="' + hi + '">▲</button>' +
        '<button data-hact="down" data-h="' + hi + '">▼</button>' +
        '<button class="del" data-hact="del" data-h="' + hi + '">حذف</button></div></div>' +
        '<div class="seats" style="grid-template-columns:repeat(' + c + ',1fr)">';
      h.seats.forEach(function (id, k) {
        var st = id ? m[id] : null, row = Math.floor(k / c);
        var cls = 'seat' + (row % 2 === 0 ? ' alt' : '') + (st ? '' : ' empty') +
          (sel && sel.h === hi && sel.k === k ? ' sel' : '') + (sel && !st ? ' target' : '') + (st && seatClash(hi, k) ? ' clash' : '');
        html += '<div class="' + cls + '" data-h="' + hi + '" data-k="' + k + '">' +
          (st ? '<div class="sn">' + esc(st.name) + '</div><div class="ss">' + esc(st.school) + '</div>' : '<span>فارغ</span>') + '</div>';
      });
      html += '</div></div>';
    });
    $('editor').innerHTML = html || '<div class="card empty">لا توجد قاعات</div>';
    $('jumpHall').innerHTML = '<option value="">الانتقال إلى قاعة...</option>' + state.layout.halls.map(function (h, hi) {
      return '<option value="' + hi + '">قاعة ' + (start + hi) + ' (' + h.seats.filter(Boolean).length + ')</option>';
    }).join('');
    renderActionBar();
    renderStats();
  }

  function renderActionBar() {
    var bar = $('actionBar');
    if (!sel) { clearSel(); return; }
    var m = studentMap(), start = parseInt(state.settings.startHall, 10) || 1;
    var id = sel.id || state.layout.halls[sel.h].seats[sel.k], st = m[id];
    if (!st) { clearSel(); return; }
    var opts = state.layout.halls.map(function (h, hi) {
      var free = h.seats.filter(function (x) { return !x; }).length;
      return '<option value="' + hi + '">قاعة ' + (start + hi) + (free ? ' (فارغ ' + free + ')' : ' (ممتلئة)') + '</option>';
    }).join('');
    bar.innerHTML = '<div class="who">المحددة: ' + esc(st.name) + ' <small style="color:#667085;font-weight:normal">— اضغط على مكان آخر للنقل/التبديل</small></div>' +
      '<div class="row"><select id="moveTo" class="grow">' + opts + '</select><button id="btnMoveTo" class="primary" style="flex:0 0 auto">نقل للقاعة</button></div>' +
      '<div class="row" style="margin-top:6px">' +
      (sel.id ? '' : '<button id="btnUnseat" class="ghost">إخراج من القاعة</button>') +
      '<button id="btnSelDelete" class="danger">حذف الطالبة</button>' +
      '<button id="btnSelCancel" class="ghost">إلغاء</button></div>';
    bar.classList.remove('hidden'); document.body.classList.add('has-bar');
    $('btnMoveTo').onclick = function () { moveToHall(parseInt($('moveTo').value, 10)); };
    $('btnSelCancel').onclick = function () { clearSel(); renderEditor(); };
    $('btnSelDelete').onclick = function () {
      if (!confirm('حذف الطالبة نهائياً من القائمة؟\n' + st.name + ' — ' + st.num)) return;
      deleteStudent(st.id);
      clearSel(); renderEditor(); toast('تم حذف ' + st.name);
    };
    if ($('btnUnseat')) $('btnUnseat').onclick = function () {
      state.layout.halls[sel.h].seats[sel.k] = null; clearSel(); save(); renderEditor(); toast('أُخرجت إلى «غير الموزعين»');
    };
  }

  function moveToHall(hi) {
    var h = state.layout.halls[hi], c = cols();
    var id = sel.id || state.layout.halls[sel.h].seats[sel.k];
    if (!sel.id && sel.h === hi) { toast('الطالبة في نفس القاعة'); return; }
    var firstFree = function () { var o = seatOrder(h.seats.length); for (var j = 0; j < o.length; j++) if (!h.seats[o[j]]) return o[j]; return -1; };
    var k = firstFree();
    if (k < 0) {
      if (!confirm('القاعة ممتلئة. إضافة صف جديد لها؟')) return;
      for (var i = 0; i < c; i++) h.seats.push(null);
      k = h.seats.indexOf(null);
    }
    if (!sel.id) state.layout.halls[sel.h].seats[sel.k] = null;
    h.seats[k] = id;
    clearSel(); save(); renderEditor();
    toast('تم النقل إلى قاعة ' + ((parseInt(state.settings.startHall, 10) || 1) + hi));
  }

  $('editor').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-hact]');
    if (b) return hallAction(b.dataset.hact, parseInt(b.dataset.h, 10));
    var cell = e.target.closest('.seat'); if (!cell) return;
    var h = parseInt(cell.dataset.h, 10), k = parseInt(cell.dataset.k, 10), seats = state.layout.halls[h].seats;
    if (!sel) {
      if (!seats[k]) return;
      sel = { h: h, k: k };
    } else if (sel.id) {
      seats[k] = sel.id; // previous occupant (if any) goes to the unassigned tray
      clearSel(); save();
    } else if (sel.h === h && sel.k === k) {
      clearSel();
    } else {
      var from = state.layout.halls[sel.h].seats, t = from[sel.k];
      from[sel.k] = seats[k]; seats[k] = t;
      clearSel(); save();
    }
    renderEditor();
  });
  $('tray').addEventListener('click', function (e) {
    if (e.target.id === 'btnAutoPlace') return autoPlace();
    var b = e.target.closest('[data-un]'); if (!b) return;
    sel = sel && sel.id === b.dataset.un ? null : { id: b.dataset.un };
    renderEditor();
  });
  $('jumpHall').addEventListener('change', function () {
    var el = $('hall-' + this.value); if (el) el.scrollIntoView({ behavior: 'smooth' });
    this.value = '';
  });

  // seat indexes (row-major storage) in the configured filling order
  function seatOrder(len) {
    var c = cols(), rows = Math.ceil(len / c), out = [];
    if (state.settings.fill === 'cols') {
      for (var cc = 0; cc < c; cc++) for (var r = 0; r < rows; r++) out.push(r * c + cc);
    } else for (var k = 0; k < len; k++) out.push(k);
    return out;
  }
  function newSeats(n, list) {
    var c = cols(), rows = Math.ceil(n / c), seats = new Array(rows * c).fill(null), placed = 0;
    if (state.settings.fill === 'cols') {
      // same shape as the automatic layout: n seats spread column by column
      for (var k = 0; k < n && list.length; k++) { seats[(k % rows) * c + Math.floor(k / rows)] = list.shift().id; placed++; }
    } else for (var k2 = 0; k2 < n && list.length; k2++) { seats[k2] = list.shift().id; placed++; }
    return { seats: seats, placed: placed };
  }
  function fillHall(h, list) {
    seatOrder(h.seats.length).forEach(function (k) { if (!h.seats[k] && list.length) h.seats[k] = list.shift().id; });
  }
  function autoPlace() {
    var list = unassigned();
    state.layout.halls.forEach(function (h) { fillHall(h, list); });
    var per = Math.max(1, parseInt(state.settings.perHall, 10) || 21), c = cols(), added = 0;
    while (list.length) {
      state.layout.halls.push({ seats: newSeats(per, list).seats }); added++;
    }
    clearSel(); save(); renderEditor();
    toast(added ? 'تم التوزيع وفُتحت ' + added + ' قاعة جديدة' : 'تم التوزيع على الأماكن الفارغة');
  }

  function hallAction(act, hi) {
    var halls = state.layout.halls, h = halls[hi], c = cols();
    clearSel();
    if (act === 'addrow') { for (var i = 0; i < c; i++) h.seats.push(null); }
    else if (act === 'delrow') {
      if (h.seats.length <= c) { toast('لا يمكن حذف آخر صف، استخدم «حذف» لحذف القاعة'); return; }
      var last = h.seats.slice(-c), cnt = last.filter(Boolean).length;
      if (cnt && !confirm('آخر صف فيه ' + cnt + ' طالب، سينتقلون إلى «غير الموزعين». متابعة؟')) return;
      h.seats.length -= c;
    }
    else if (act === 'fill') fillHall(h, unassigned());
    else if (act === 'up' && hi > 0) { halls[hi] = halls[hi - 1]; halls[hi - 1] = h; }
    else if (act === 'down' && hi < halls.length - 1) { halls[hi] = halls[hi + 1]; halls[hi + 1] = h; }
    else if (act === 'del') {
      var n = h.seats.filter(Boolean).length;
      if (!confirm('حذف القاعة' + (n ? '؟ طلابها (' + n + ') سينتقلون إلى «غير الموزعين».' : '؟'))) return;
      halls.splice(hi, 1);
    }
    save(); renderEditor();
  }

  $('btnAddHall').addEventListener('click', function () {
    var def = String(state.settings.perHall || 21);
    var v = prompt('عدد الطلاب في القاعة الجديدة:', def);
    if (v == null) return;
    var n = parseInt(toLatinDigits(v), 10);
    if (!(n > 0)) { toast('عدد غير صالح'); return; }
    var ns = newSeats(n, unassigned()), placed = ns.placed;
    state.layout.halls.push({ seats: ns.seats });
    clearSel(); save(); renderEditor();
    var el = $('hall-' + (state.layout.halls.length - 1)); if (el) el.scrollIntoView({ behavior: 'smooth' });
    toast('فُتحت قاعة جديدة بـ ' + n + ' مكان' + (placed ? ' ووُضع فيها ' + placed + ' من غير الموزعين' : '، انقل إليها الطلاب'));
  });
  $('btnReAuto').addEventListener('click', function () {
    if (!confirm('سيتم حذف كل التعديلات اليدوية وإعادة توزيع الطلاب حسب الإعدادات. متابعة؟')) return;
    state.layout = null; save(); freezeLayout(); clearSel(); renderEditor(); syncSettingsUI();
    toast('تمت إعادة التوزيع');
  });

  // ---------------- Settings ----------------
  var FIELDS = ['startHall', 'cols', 'fill', 'order', 'numMode', 'line1', 'line2', 'center',
    'level', 'building', 'subject', 'year', 'round', 'director', 'showLogo'];
  function setEl(el, v) {
    if (el.type === 'checkbox') { el.checked = !!v; return; }
    if (el.tagName === 'SELECT' && v != null && !Array.prototype.some.call(el.options, function (o) { return o.value === String(v); })) {
      var o = document.createElement('option'); o.textContent = v; el.appendChild(o);
    }
    el.value = v;
  }
  function syncSettingsUI() {
    FIELDS.forEach(function (k) {
      document.querySelectorAll('[data-set="' + k + '"]').forEach(function (el) { if (el !== document.activeElement) setEl(el, state.settings[k]); });
    });
    $('manualNote').classList.toggle('hidden', !state.layout);
    renderHallCounts();
  }
  FIELDS.forEach(function (k) {
    document.querySelectorAll('[data-set="' + k + '"]').forEach(function (el) {
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', function () {
        state.settings[k] = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'cols' && state.layout) reflowLayout();
        document.querySelectorAll('[data-set="' + k + '"]').forEach(function (o) { if (o !== el) setEl(o, state.settings[k]); });
        save(); renderStats();
        if (currentTab === 'sheets') renderSheetsTab();
        if (currentTab === 'dispatch') renderDispatchTab();
      });
    });
  });


  // ---------------- Students per hall editor ----------------
  function setCounts(arr) {
    var per = parseInt(state.settings.perHall, 10) || 21;
    arr = arr.map(function (v) { return v === per ? 0 : v; });
    while (arr.length && !arr[arr.length - 1]) arr.pop();
    state.settings.customCounts = arr.join(',');
  }
  function renderHallCounts() {
    var per = parseInt(state.settings.perHall, 10) || 21, custom = hallCounts();
    var n = state.layout ? state.layout.halls.length : autoHalls().length;
    var start = parseInt(state.settings.startHall, 10) || 1;
    var html = '<label>العدد الافتراضي لكل قاعة <input class="hcDefault" type="number" min="1" inputmode="numeric" value="' + per + '"></label>';
    if (state.layout) {
      html += '<div class="hint">الجدول معدَّل يدوياً. غيّر عدد الطالبات في قاعة من «تعديل الجدول» (+ صف / − صف / فتح قاعة جديدة)، أو اضغط «إعادة التوزيع التلقائي» لتطبيق الأعداد هنا.</div>';
    } else if (n) {
      html += '<div class="hint" style="margin:0 0 6px">ويمكنك تغيير عدد أي قاعة بمفردها:</div><div class="hcGrid">';
      for (var i = 0; i < n; i++) {
        html += '<label class="hc">قاعة ' + (start + i) + '<input type="number" min="1" inputmode="numeric" data-hc="' + i + '" value="' + (custom[i] || per) + '"></label>';
      }
      html += '</div><div class="hint" style="margin:6px 0 0">عدد القاعات: ' + n + ' — تتغير القاعات تلقائياً حسب الأعداد.' +
        (custom.some(Boolean) ? ' <a href="#" class="hcReset">إرجاع الكل إلى ' + per + '</a>' : '') + '</div>';
    } else html += '<div class="hint">أضف الطلاب لتظهر القاعات.</div>';
    document.querySelectorAll('.hallCountsBox').forEach(function (b) { b.innerHTML = html; });
  }
  document.addEventListener('change', function (e) {
    var t = e.target, v = parseInt(toLatinDigits(t.value), 10);
    if (t.classList.contains('hcDefault')) {
      if (!(v > 0)) { renderHallCounts(); return; }
      state.settings.perHall = v; setCounts(hallCounts());
    } else if (t.dataset && t.dataset.hc != null) {
      var i = parseInt(t.dataset.hc, 10), arr = hallCounts(), per = parseInt(state.settings.perHall, 10) || 21;
      if (!(v > 0)) { renderHallCounts(); return; }
      while (arr.length < i) arr.push(0);
      arr[i] = v; setCounts(arr);
    } else return;
    save(); renderHallCounts(); renderStats();
    if (currentTab === 'sheets' && sheetMode === 'preview') renderSheets();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.classList.contains('hcReset')) return;
    e.preventDefault(); state.settings.customCounts = ''; save(); renderHallCounts(); renderStats();
    if (currentTab === 'sheets' && sheetMode === 'preview') renderSheets();
  });
  // ---------------- Export ----------------
  function bytesToB64(bytes) {
    var bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  function saveBytes(bytes, name, mime) {
    if (window.Android && Android.saveFile) {
      var err = Android.saveFile(bytesToB64(bytes), name, mime);
      if (err) { alert(err); return false; }
      $('afterSave').classList.remove('hidden');
      document.querySelectorAll('.afterSaveD').forEach(function (x) { x.classList.remove('hidden'); });
      return true;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  $('btnWord').addEventListener('click', function () {
    var halls = buildHalls();
    if (!halls.length) { toast('لا يوجد طلاب'); return; }
    try {
      var bytes = DocxWriter.build(halls, state.settings, b64ToBytes(window.LOGO_B64), exportPayload('seating'));
      saveBytes(bytes, 'خارطة_الجلوس_' + stamp() + '.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch (e) { alert('خطأ: ' + e.message); }
  });
  $('btnPdf').addEventListener('click', function () {
    if (!buildHalls().length) { toast('لا يوجد طلاب'); return; }
    renderSheets();
    if (window.Android && Android.printPdf) Android.printPdf('خارطة_الجلوس_' + stamp());
    else window.print();
  });
  $('btnOpen').addEventListener('click', function () { if (window.Android) Android.openLast(); });
  $('btnShare').addEventListener('click', function () { if (window.Android) Android.shareLast(); });


  // ---------------- Dispatch form (استمارة إرسال الرزمة) ----------------
  var D_DEFAULTS = { subject: '', date: '', day: '', directorate: 'صلاح الدين', examCenter: 'الكرخ', address: 'بيجي / المركز',
    participants: '', absentCount: '', booklets: '', title: '', directorPhone: '', deputy: '', deputyPhone: '', hall: 'all', marks: {} };
  state.dispatch = Object.assign({}, D_DEFAULTS, state.dispatch || {});
  state.dispatch.marks = state.dispatch.marks || {};
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  // students in seating order: each hall, right column top→bottom, then the next column, then the next hall
  function dispatchRows() {
    var d = state.dispatch, out = [];
    buildHalls().forEach(function (h, hi) {
      if (d.hall !== 'all' && String(hi) !== String(d.hall)) return;
      var c = h.grid.length ? h.grid[0].length : 0;
      for (var cc = 0; cc < c; cc++) for (var r = 0; r < h.grid.length; r++) {
        var st = h.grid[r][cc];
        if (st) out.push({ st: st, hall: h.number, mark: d.marks[st.id] || {} });
      }
    });
    return out;
  }
  function stripPrefix(s, p) { s = norm(s); return s.indexOf(p) === 0 ? norm(s.slice(p.length)) : s; }
  function dispatchData() {
    var d = state.dispatch, s = state.settings, rows = dispatchRows();
    var absent = rows.filter(function (r) { return r.mark.absent; }).length;
    var part = norm(d.participants) || String(rows.length);
    var abs = norm(d.absentCount) || String(absent);
    var book = norm(d.booklets) || String((parseInt(toLatinDigits(part), 10) || 0) - (parseInt(toLatinDigits(abs), 10) || 0));
    var date = '';
    if (d.date) { var p = d.date.split('-'); date = (+p[2]) + ' / ' + (+p[1]) + ' / ' + p[0]; }
    var lvl = norm(s.level);
    return {
      title: norm(d.title) || ('استمارة ارسال الرزمة إلى مركز فحص الدراسة ' + lvl + (norm(d.examCenter) ? ' / ' + norm(d.examCenter) : '') +
        ' للعام الدراسي ' + norm(s.year).replace(/\s*[–-]\s*/, ' / ') + 'م'),
      info: [
        ['المديرية', d.directorate, 'الدراسة', lvl, 'الدور', stripPrefix(s.round, 'الدور')],
        ['رقم المركز', s.center, 'مجموع المشاركين', part, 'المادة', norm(d.subject) || norm(s.subject)],
        ['اسم المركز', s.building, 'عدد الغياب', abs, 'اليوم', d.day],
        ['عنوان المركز', d.address, 'مجموع الدفاتر المرسلة', book, 'التأريخ', date]
      ],
      heads: ['ت', 'الرقم الامتحاني', 'اسم الطالب', 'اسم المدرسة', 'اسم المديرية', 'الغياب', 'الطالب المنقول مركزه', 'الملاحظات'],
      rows: rows.map(function (r, i) {
        return [String(i + 1), r.st.num, r.st.name, r.st.school, d.directorate, r.mark.absent ? 'غائبة' : '', r.mark.moved || '', r.mark.note || ''];
      }),
      foot: [
        ['اسم مدير المركز/ ' + norm(s.director), 'التوقيع', 'رقم موبايل مدير المركز/ ' + norm(d.directorPhone)],
        ['اسم معاون مدير المركز/ ' + norm(d.deputy), 'التوقيع', 'رقم موبايل معاون مدير المركز/ ' + norm(d.deputyPhone)]
      ]
    };
  }

  function renderDispatchPreview() {
    var x = dispatchData(), info = '<table class="dinfo">' + x.info.map(function (r) {
      return '<tr>' + r.map(function (v, i) { return '<td class="' + (i % 2 ? '' : 'l') + '">' + esc(v) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table>';
    var head = '<tr><td colspan="8" style="border:0;padding:0"><div class="dtitle">' + esc(x.title) + '</div>' + info + '<div style="height:10px"></div></td></tr>' +
      '<tr>' + x.heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
    var cls = ['', 'n', '', 'sc', 'dr', 'sm', 'sm', 'sm'];
    var body = x.rows.map(function (r) {
      return '<tr>' + r.map(function (v, i) { return '<td class="' + cls[i] + '">' + esc(v) + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="8">لا يوجد طلاب</td></tr>';
    var foot = '<tr><td colspan="8" style="border:0;padding:8px 0 0"><table class="dfoot">' + x.foot.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td class="c">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
    }).join('') + '</table></td></tr>';
    $('dispatch').innerHTML = '<div class="dsheet"><table class="dlist"><colgroup>' +
      [4, 19, 26, 13, 9, 7, 11, 11].map(function (w) { return '<col style="width:' + w + '%">'; }).join('') + '</colgroup>' +
      '<thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
    var el = $('dispatch'), scale = Math.min(1, ($('dispatchWrap').clientWidth - 24) / 794);
    el.style.width = '794px'; el.style.transform = 'scale(' + scale + ')'; el.style.height = '';
    el.style.height = (el.scrollHeight * scale) + 'px';
  }

  function renderDispatchList() {
    var q = norm($('dSearch').value), html = '';
    dispatchRows().forEach(function (r, i) {
      var st = r.st;
      if (q && (st.name + ' ' + st.num + ' ' + st.school).indexOf(q) < 0) return;
      html += '<li class="' + (r.mark.absent ? 'absent' : '') + '"><span class="idx">' + (i + 1) + '</span><div class="info"><div class="nm">' + esc(st.name) +
        '</div><div class="sub"><b>' + esc(st.num) + '</b> — قاعة ' + r.hall + '</div>' +
        (r.mark.moved || r.mark.note ? '<div class="note">' + esc([r.mark.moved, r.mark.note].filter(Boolean).join(' • ')) + '</div>' : '') +
        '</div><div class="acts"><label class="chk"><input type="checkbox" data-abs="' + st.id + '"' + (r.mark.absent ? ' checked' : '') + '>غائبة</label>' +
        '<button data-dnote="' + st.id + '">✎</button></div></li>';
    });
    $('dList').innerHTML = html || '<li class="empty">لا يوجد طلاب</li>';
  }

  function renderDispatchTab() {
    var d = state.dispatch, start = parseInt(state.settings.startHall, 10) || 1, n = buildHalls().length;
    if (d.hall !== 'all' && !(parseInt(d.hall, 10) < n)) d.hall = 'all';
    $('dHalls').innerHTML = '<option value="all">جميع القاعات</option>' + Array.apply(null, Array(n)).map(function (_, i) {
      return '<option value="' + i + '">قاعة ' + (start + i) + ' فقط</option>';
    }).join('');
    $('dHalls').value = d.hall;
    document.querySelectorAll('[data-d]').forEach(function (el) {
      if (el !== document.activeElement) el.value = d[el.dataset.d] || '';
    });
    var x = dispatchData();
    document.querySelectorAll('[data-d="participants"],[data-d="absentCount"],[data-d="booklets"],[data-d="subject"],[data-d="title"]').forEach(function (el) {
      var k = el.dataset.d;
      el.placeholder = k === 'participants' ? 'تلقائي: ' + x.info[1][3] : k === 'absentCount' ? 'تلقائي: ' + x.info[2][3] :
        k === 'booklets' ? 'تلقائي: ' + x.info[3][3] : k === 'subject' ? (norm(state.settings.subject) || '') : 'تلقائي';
    });
    renderDispatchPreview();
    if (!$('dMarks').classList.contains('hidden')) renderDispatchList();
  }

  document.querySelectorAll('[data-d]').forEach(function (el) {
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', function () {
      var k = el.dataset.d;
      state.dispatch[k] = el.value;
      if (k === 'date' && el.value) { // fill the weekday automatically
        var p = el.value.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
        state.dispatch.day = DAYS[dt.getDay()];
      }
      save(); renderDispatchTab();
    });
  });
  $('dHalls').addEventListener('change', function () { state.dispatch.hall = this.value; save(); renderDispatchTab(); });
  $('dToggle').addEventListener('click', function () {
    $('dMarks').classList.toggle('hidden');
    if (!$('dMarks').classList.contains('hidden')) { renderDispatchList(); $('dMarks').scrollIntoView({ behavior: 'smooth' }); }
  });
  $('dSearch').addEventListener('input', renderDispatchList);
  $('dList').addEventListener('change', function (e) {
    var id = e.target.dataset.abs; if (!id) return;
    var m = state.dispatch.marks[id] = state.dispatch.marks[id] || {};
    m.absent = e.target.checked;
    save(); renderDispatchTab();
  });
  $('dList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-dnote]'); if (!b) return;
    var id = b.dataset.dnote, m = state.dispatch.marks[id] = state.dispatch.marks[id] || {};
    var mv = prompt('الطالب المنقول مركزه (اتركه فارغاً إن لم يوجد):', m.moved || ''); if (mv == null) return;
    var nt = prompt('الملاحظات:', m.note || ''); if (nt == null) return;
    m.moved = norm(mv); m.note = norm(nt);
    save(); renderDispatchTab();
  });
  $('dWord').addEventListener('click', function () {
    var x = dispatchData();
    if (!x.rows.length) { toast('لا يوجد طلاب'); return; }
    try {
      saveBytes(DocxWriter.buildDispatch(x, exportPayload('dispatch')), 'ارسالية_' + (norm(state.dispatch.subject) || norm(state.settings.subject) || '') + '_' + stamp() + '.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch (e) { alert('خطأ: ' + e.message); }
  });
  $('dPdf').addEventListener('click', function () {
    if (!dispatchRows().length) { toast('لا يوجد طلاب'); return; }
    renderDispatchPreview();
    if (window.Android && Android.printPdf) Android.printPdf('ارسالية_' + stamp()); else window.print();
  });
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('btnOpenAny') && window.Android) Android.openLast();
    if (e.target.classList.contains('btnShareAny') && window.Android) Android.shareLast();
  });




  // ---------------- Bulk delete: students ----------------
  function deleteStudents(ids) {
    var set = {}; ids.forEach(function (id) { set[id] = 1; });
    state.students = state.students.filter(function (s) { return !set[s.id]; });
    if (state.layout) state.layout.halls.forEach(function (h) { h.seats = h.seats.map(function (x) { return set[x] ? null : x; }); });
    if (state.dispatch && state.dispatch.marks) ids.forEach(function (id) { delete state.dispatch.marks[id]; });
    if (editingId && set[editingId]) cancelEdit();
    save();
  }
  function visibleIds() {
    var q = norm($('search').value);
    return state.students.filter(function (s) { return !q || (s.name + ' ' + s.num + ' ' + s.school).indexOf(q) >= 0; }).map(function (s) { return s.id; });
  }
  $('btnSelMode').addEventListener('click', function () { selMode = true; picked = {}; renderList(); });
  $('selExit').addEventListener('click', function () { selMode = false; picked = {}; renderList(); });
  $('selAll').addEventListener('click', function () { visibleIds().forEach(function (id) { picked[id] = 1; }); renderList(); });
  $('selNone').addEventListener('click', function () { picked = {}; renderList(); });
  $('selSchool').addEventListener('change', function () {
    var sc = this.value; if (!sc) return;
    state.students.forEach(function (s) { if (s.school === sc) picked[s.id] = 1; });
    renderList();
  });
  $('list').addEventListener('click', function (e) {
    if (!selMode) return;
    var li = e.target.closest('[data-pick]'); if (!li) return;
    var id = li.dataset.pick;
    if (picked[id]) delete picked[id]; else picked[id] = 1;
    li.classList.toggle('picked', !!picked[id]);
    li.querySelector('.pick').checked = !!picked[id];
    $('selDelete').textContent = 'حذف المحدد (' + pickedCount() + ')';
  });
  $('selDelete').addEventListener('click', function () {
    var ids = Object.keys(picked);
    if (!ids.length) { toast('لم تحدد أي طالبة'); return; }
    if (!confirm('حذف ' + ids.length + ' طالبة نهائياً؟')) return;
    deleteStudents(ids); picked = {}; selMode = false;
    renderAll(); toast('تم حذف ' + ids.length + ' طالبة');
  });

  // ---------------- Bulk delete: schools ----------------
  var sSelMode = false, sPicked = {};
  $('sSelMode').addEventListener('click', function () { sSelMode = true; sPicked = {}; renderSchoolsCard(); });
  $('sSelExit').addEventListener('click', function () { sSelMode = false; sPicked = {}; renderSchoolsCard(); });
  $('sSelAll').addEventListener('click', function () { Object.keys(state.schools).forEach(function (n) { sPicked[n] = 1; }); renderSchoolsCard(); });
  $('sSelNone').addEventListener('click', function () { sPicked = {}; renderSchoolsCard(); });
  $('sSelDelete').addEventListener('click', function () {
    var names = Object.keys(sPicked);
    if (!names.length) { toast('لم تحدد أي مدرسة'); return; }
    if (!confirm('حذف ' + names.length + ' مدرسة من قائمة المدارس؟')) return;
    var set = {}; names.forEach(function (n) { set[n] = 1; delete state.schools[n]; });
    var theirs = state.students.filter(function (s) { return set[s.school]; }).map(function (s) { return s.id; });
    if (theirs.length && confirm('لهذه المدارس ' + theirs.length + ' طالبة في قائمة الطلاب.\nهل تريد حذف طالباتها أيضاً؟\n(إذا اخترت «إلغاء» تبقى الطالبات وتبقى أسماء مدارسهن ظاهرة)')) {
      deleteStudents(theirs);
    }
    save(); sPicked = {}; sSelMode = false;
    renderSchoolsCard(); renderAll(); toast('تم حذف ' + names.length + ' مدرسة');
  });

  // ---------------- Schools & exam numbers (prepare from an old Word file) ----------------
  function numCmp(a, b) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); }
  function renderSchoolsCard() {
    var names = Object.keys(state.schools);
    $('sSelBar').classList.toggle('hidden', !sSelMode);
    $('sSelMode').classList.toggle('hidden', sSelMode || !names.length);
    $('sSelDelete').textContent = 'حذف المحدد (' + Object.keys(sPicked).length + ')';
    $('schoolsList').innerHTML = names.length ? names.map(function (n) {
      if (sSelMode) return '<li class="' + (sPicked[n] ? 'picked' : '') + '" data-spick="' + esc(n) + '"><input class="pick" type="checkbox"' +
        (sPicked[n] ? ' checked' : '') + '><div class="info"><div class="nm">' + esc(n) + '</div><div class="sub"><b>' + esc(state.schools[n] || '') + '</b></div></div></li>';
      return '<li><div class="info"><div class="nm">' + esc(n) + '</div><input type="text" inputmode="numeric" dir="ltr" data-sn="' + esc(n) +
        '" value="' + esc(state.schools[n] || '') + '"></div><div class="acts"><button class="delbtn" data-sdel="' + esc(n) + '">حذف</button></div></li>';
    }).join('') : '<li class="empty">لا توجد مدارس محفوظة بعد</li>';
  }
  $('schoolsList').addEventListener('change', function (e) {
    var n = e.target.dataset.sn; if (n == null) return;
    state.schools[n] = toLatinDigits(e.target.value).replace(/\s+/g, ''); save(); renderSchools();
  });
  $('schoolsList').addEventListener('click', function (e) {
    var li = sSelMode && e.target.closest('[data-spick]');
    if (li) {
      var k = li.dataset.spick;
      if (sPicked[k]) delete sPicked[k]; else sPicked[k] = 1;
      li.classList.toggle('picked', !!sPicked[k]); li.querySelector('.pick').checked = !!sPicked[k];
      $('sSelDelete').textContent = 'حذف المحدد (' + Object.keys(sPicked).length + ')';
      return;
    }
    var n = e.target.dataset.sdel; if (n == null) return;
    if (!confirm('حذف المدرسة «' + n + '» من القائمة؟')) return;
    delete state.schools[n]; save(); renderSchoolsCard(); renderAll();
    if (state.students.some(function (s) { return s.school === n; })) toast('ستبقى ظاهرة لأن لها طالبات في القائمة');
  });
  $('btnAddSchool').addEventListener('click', function () {
    var n = norm($('newSchoolName').value), num = toLatinDigits($('newSchoolNum').value).replace(/\s+/g, '');
    if (!n) { toast('اكتب اسم المدرسة'); return; }
    state.schools[n] = num; save();
    $('newSchoolName').value = ''; $('newSchoolNum').value = '';
    renderSchoolsCard(); renderAll(); toast('تمت إضافة المدرسة');
  });

  document.querySelectorAll('.btnPrepSchools').forEach(function (b) {
    b.addEventListener('click', function () { $('schoolsFile').click(); });
  });
  var foundSchools = [];
  $('schoolsFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var res = DocxReader.read(r.result), list = [];
        if (res.kind === 'embedded') list = (res.data.students || []).map(function (s) { return { school: s.school, num: s.num }; });
        else if (res.kind === 'seating') res.halls.forEach(function (h) { h.grid.forEach(function (row) { row.forEach(function (st) { if (st) list.push(st); }); }); });
        else list = res.rows;
        var map = {}, order = [];
        list.forEach(function (x) {
          var sc = norm(x.school), num = toLatinDigits(x.num || '').replace(/\s+/g, '');
          if (!sc || !num) return;
          if (!map[sc]) { map[sc] = { school: sc, nums: [] }; order.push(sc); }
          map[sc].nums.push(num);
        });
        foundSchools = order.map(function (sc) {
          var m = map[sc]; m.nums.sort(numCmp); m.num = m.nums[m.nums.length - 1]; return m;
        });
        if (!foundSchools.length) throw new Error('لم أجد أسماء مدارس وأرقاماً امتحانية في الملف');
        showSchoolsReview();
      } catch (e) { alert('تعذر قراءة الملف: ' + e.message); }
    };
    r.readAsArrayBuffer(f);
  });
  function showSchoolsReview() {
    if (currentTab !== 'settings') showTab('settings');
    var box = $('schoolsReview');
    box.innerHTML = '<h3 style="margin:0 0 4px">وُجدت ' + foundSchools.length + ' مدرسة في الملف</h3>' +
      '<div class="hint" style="margin:0 0 6px">الرقم المقترح هو آخر (أكبر) رقم امتحاني لكل مدرسة في الملف، ويمكنك تعديله. ألغِ تحديد أي مدرسة لا تريدها.</div>' +
      '<ol class="list">' + foundSchools.map(function (m, i) {
        var exists = state.schools.hasOwnProperty(m.school) || schoolNames().indexOf(m.school) >= 0;
        return '<li><input type="checkbox" data-ri="' + i + '" checked><div class="info"><div class="nm">' + esc(m.school) + '</div>' +
          '<div class="cnt">' + m.nums.length + ' طالبة في الملف' + (exists ? ' — موجودة مسبقاً وسيُحدَّث رقمها' : '') + '</div>' +
          '<input type="text" inputmode="numeric" dir="ltr" data-rn="' + i + '" value="' + esc(m.num) + '"></div></li>';
      }).join('') + '</ol><div class="row" style="margin-top:8px"><button id="btnSaveSchools" class="primary">حفظ المدارس المحددة</button>' +
      '<button id="btnCancelSchools" class="ghost">إلغاء</button></div>';
    box.classList.remove('hidden');
    $('schoolsCard').scrollIntoView({ behavior: 'smooth' });
    $('btnCancelSchools').onclick = function () { box.classList.add('hidden'); box.innerHTML = ''; };
    $('btnSaveSchools').onclick = function () {
      var n = 0;
      foundSchools.forEach(function (m, i) {
        if (!box.querySelector('[data-ri="' + i + '"]').checked) return;
        state.schools[m.school] = toLatinDigits(box.querySelector('[data-rn="' + i + '"]').value).replace(/\s+/g, '');
        n++;
      });
      save(); box.classList.add('hidden'); box.innerHTML = '';
      renderSchoolsCard(); renderAll();
      toast('تم حفظ ' + n + ' مدرسة — اخترها عند إدخال الطالبات');
    };
  }

  // ---------------- Open a previously exported Word file ----------------
  var PREV_KEY = 'examSeating.beforeOpen';
  function exportPayload(kind) {
    return { app: 'examSeating', v: 1, kind: kind, savedAt: new Date().toISOString(),
      students: state.students, layout: state.layout || null, settings: state.settings, schools: state.schools, dispatch: state.dispatch };
  }
  function newId(i) { return 'i' + Date.now().toString(36) + '_' + i; }
  function schoolsFrom(students) {
    var m = {}; students.forEach(function (s) { if (s.school) m[s.school] = s.num; }); return m;
  }
  function applyOpened(res) {
    var next, desc;
    if (res.kind === 'embedded') {
      var d = res.data || {};
      if (!Array.isArray(d.students)) throw new Error('بيانات غير صالحة داخل الملف');
      next = { students: d.students, layout: d.layout || null, settings: d.settings || state.settings,
        schools: d.schools || schoolsFrom(d.students), dispatch: d.dispatch || state.dispatch };
      desc = 'ملف من هذا التطبيق: ' + d.students.length + ' طالبة' + (d.layout ? '، ' + d.layout.halls.length + ' قاعة' : '');
    } else if (res.kind === 'seating') {
      var students = [], halls = [], c = 0, k = 0;
      res.halls.forEach(function (h) { h.grid.forEach(function (r) { c = Math.max(c, r.length); }); });
      res.halls.forEach(function (h) {
        var ids = h.grid.map(function (r) { return r.map(function (st) { if (!st) return null; st.id = newId(k++); return st.id; }); });
        // entry order = column by column from the right, top to bottom
        for (var cc = 0; cc < c; cc++) for (var r = 0; r < h.grid.length; r++) {
          var st = h.grid[r][cc]; if (st) students.push({ id: st.id, name: st.name, num: st.num, school: st.school });
        }
        var seats = [];
        ids.forEach(function (r) { for (var j = 0; j < c; j++) seats.push(r[j] || null); });
        halls.push({ seats: seats });
      });
      var firstNo = res.halls[0].number;
      next = { students: students, layout: { halls: halls },
        settings: Object.assign({}, state.settings, res.settings, { cols: c, fill: 'cols', order: 'entry' }, firstNo ? { startHall: firstNo } : {}),
        schools: schoolsFrom(students), dispatch: Object.assign({}, state.dispatch, { marks: {}, hall: 'all' }) };
      desc = 'خارطة جلوس: ' + students.length + ' طالبة في ' + halls.length + ' قاعة';
    } else {
      var marks = {}, st2 = res.rows.map(function (r, i) {
        var id = newId(i);
        if (r.absent || r.moved || r.note) marks[id] = { absent: r.absent, moved: r.moved, note: r.note };
        return { id: id, name: r.name, num: r.num, school: r.school };
      });
      next = { students: st2, layout: null, settings: Object.assign({}, state.settings, res.settings, { fill: 'cols', order: 'entry' }),
        schools: schoolsFrom(st2), dispatch: Object.assign({}, state.dispatch, res.dispatch, { marks: marks, hall: 'all' }) };
      desc = 'إرسالية: ' + st2.length + ' طالبة (تُوزَّع على القاعات حسب العدد المحدد لكل قاعة)';
    }
    var msg = desc + '\n\nسيتم استبدال البيانات الحالية' + (state.students.length ? ' (' + state.students.length + ' طالبة)' : '') +
      ' بمحتوى الملف. يمكنك التراجع من تبويب «المعلومات». متابعة؟';
    if (!confirm(msg)) return;
    try { localStorage.setItem(PREV_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem('examSeating.openedTab', res.kind === 'dispatch' || (res.data && res.data.kind === 'dispatch') ? 'dispatch' : 'sheets');
    location.reload();
  }
  $('btnOpenDocx').addEventListener('click', function () { $('docxFile').click(); });
  $('docxFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { applyOpened(DocxReader.read(r.result)); }
      catch (e) { alert('تعذر فتح الملف: ' + e.message); }
    };
    r.readAsArrayBuffer(f);
  });
  try { if (localStorage.getItem(PREV_KEY)) $('btnUndoOpen').classList.remove('hidden'); } catch (e) { /* ignore */ }
  $('btnUndoOpen').addEventListener('click', function () {
    var prev = localStorage.getItem(PREV_KEY); if (!prev) return;
    if (!confirm('إرجاع البيانات كما كانت قبل آخر فتح ملف؟')) return;
    localStorage.setItem(KEY, prev); localStorage.removeItem(PREV_KEY); location.reload();
  });

  // ---------------- Backup ----------------
  $('btnBackup').addEventListener('click', function () {
    saveBytes(new TextEncoder().encode(JSON.stringify(state, null, 1)), 'نسخة_خارطة_الجلوس_' + stamp() + '.json', 'application/json');
  });
  $('btnRestore').addEventListener('click', function () { $('restoreFile').click(); });
  $('restoreFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.students)) throw new Error('ملف غير صالح');
        if (!confirm('سيتم استبدال البيانات الحالية بـ ' + d.students.length + ' طالب. متابعة؟')) return;
        localStorage.setItem(KEY, JSON.stringify(d));
        location.reload();
      } catch (e) { alert('تعذر قراءة الملف: ' + e.message); }
    };
    r.readAsText(f);
    this.value = '';
  });
  $('btnClear').addEventListener('click', function () {
    if (!state.students.length) return;
    if (!confirm('حذف جميع الطلاب (' + state.students.length + ')؟ لا يمكن التراجع.')) return;
    if (!confirm('تأكيد نهائي: حذف جميع الطلاب؟')) return;
    state.students = []; state.layout = null; save(); cancelEdit(); renderAll(); toast('تم الحذف');
  });

  renderAll();
  syncSettingsUI();
  try {
    var openedTab = localStorage.getItem('examSeating.openedTab');
    if (openedTab) { localStorage.removeItem('examSeating.openedTab'); showTab(openedTab); toast('تم فتح الملف — يمكنك التعديل ثم التصدير من جديد'); }
  } catch (e) { /* ignore */ }
})();
