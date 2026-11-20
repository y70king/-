(function () {
  'use strict';
  var KEY = 'examSeating.v1';
  var DEFAULTS = {
    perHall: 21, customCounts: '', startHall: 1, cols: 3, fill: 'rows', order: 'entry', numMode: 'same',
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
    document.body.classList.toggle('show-sheets', name === 'sheets');
    if (name === 'sheets') renderSheets();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  window.onAndroidBack = function () {
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
      toast('تمت الإضافة (' + state.students.length + ')');
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
    $('numHint').textContent = '';
    window.scrollTo(0, 0); $('fName').focus();
  }
  function cancelEdit() {
    editingId = null;
    $('fName').value = ''; $('fNum').value = ''; numAuto = true;
    $('formTitle').textContent = 'إضافة طالب';
    $('btnAdd').textContent = 'إضافة';
    $('btnCancelEdit').classList.add('hidden');
    onSchoolChosen(false);
  }
  $('btnCancelEdit').addEventListener('click', cancelEdit);

  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.dataset.id, arr = state.students;
    var i = arr.findIndex(function (s) { return s.id === id; });
    if (i < 0) return;
    var act = b.dataset.act;
    if (act === 'edit') return startEdit(id);
    if (act === 'del') {
      if (!confirm('حذف الطالب: ' + arr[i].name + '؟')) return;
      arr.splice(i, 1);
      if (editingId === id) cancelEdit();
    } else if (act === 'up' && i > 0) {
      var t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t;
    } else if (act === 'down' && i < arr.length - 1) {
      var t2 = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t2;
    }
    save(); renderAll();
  });
  $('search').addEventListener('input', renderList);

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
  function hallCounts() {
    return String(state.settings.customCounts || '').split(/[,،\s]+/).map(function (x) { return parseInt(toLatinDigits(x), 10); })
      .filter(function (x) { return x > 0; });
  }
  function buildHalls() {
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

  // ---------------- Render ----------------
  function renderStats() {
    var halls = buildHalls();
    $('stats').textContent = 'عدد الطلاب: ' + state.students.length + '  •  عدد القاعات: ' + halls.length +
      '  •  عدد المدارس: ' + schoolNames().length;
  }
  function renderList() {
    var q = norm($('search').value), arr = state.students;
    if (!arr.length) { $('list').innerHTML = '<li class="empty">لا يوجد طلاب بعد</li>'; return; }
    var html = '';
    arr.forEach(function (s, i) {
      if (q && (s.name + ' ' + s.num + ' ' + s.school).indexOf(q) < 0) return;
      html += '<li><span class="idx">' + (i + 1) + '</span><div class="info"><div class="nm">' + esc(s.name) +
        '</div><div class="sub"><b>' + esc(s.num) + '</b> — ' + esc(s.school) + '</div></div>' +
        '<div class="acts"><button data-act="up" data-id="' + s.id + '">▲</button>' +
        '<button data-act="down" data-id="' + s.id + '">▼</button>' +
        '<button data-act="edit" data-id="' + s.id + '">✎</button>' +
        '<button data-act="del" data-id="' + s.id + '">🗑</button></div></li>';
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
  window.addEventListener('resize', function () { if (currentTab === 'sheets') fitSheets(); });

  // ---------------- Settings ----------------
  var FIELDS = ['perHall', 'customCounts', 'startHall', 'cols', 'fill', 'order', 'numMode', 'line1', 'line2', 'center',
    'level', 'building', 'subject', 'year', 'round', 'director', 'showLogo'];
  FIELDS.forEach(function (k) {
    var el = $('s_' + k);
    if (el.type === 'checkbox') el.checked = !!state.settings[k]; else el.value = state.settings[k];
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', function () {
      state.settings[k] = el.type === 'checkbox' ? el.checked : el.value;
      save(); renderStats();
    });
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
      var bytes = DocxWriter.build(halls, state.settings, b64ToBytes(window.LOGO_B64));
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
    state.students = []; save(); cancelEdit(); renderAll(); toast('تم الحذف');
  });

  renderAll();
})();
