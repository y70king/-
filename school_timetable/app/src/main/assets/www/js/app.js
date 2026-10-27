/* واجهة «صانع الجدول المدرسي» */
(function () {
  'use strict';

  var STORE_KEY = 'school_timetable_data';
  var bridge = window.AndroidBridge || null;

  var P;            // المشروع كاملاً
  var tt;           // P.timetable
  var ui = {
    tab: 'days',
    teacher: null,                 // المدرس المختار في الخطوة ٢
    classId: null,                 // الصف المختار في الخطوة ٣
    view: 'full', viewClass: 0, viewTeacher: null, viewDay: -1,
    sel: null                      // الخانة المختارة للتبديل {c, s}
  };

  /* ================= أدوات عامة ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, isErr ? 4500 : 2600);
  }

  /* ---------- النوافذ ---------- */
  var modalStack = [];

  /* opts: {title, body (html|element), wide, buttons:[{text, cls, value, onClick(close) -> false يبقيها مفتوحة}], onOpen(root)} */
  function modal(opts) {
    return new Promise(function (resolve) {
      var ov = el('<div class="overlay"><div class="modal' + (opts.wide ? ' wide' : '') + '">' +
        '<header><span>' + esc(opts.title || '') + '</span><button class="x" aria-label="إغلاق">✕</button></header>' +
        '<div class="body"></div><footer></footer></div></div>');
      var body = $('.body', ov), foot = $('footer', ov);
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else if (opts.body) body.appendChild(opts.body);
      var closed = false;
      function close(v) {
        if (closed) return;
        closed = true;
        ov.remove();
        modalStack.splice(modalStack.indexOf(entry), 1);
        resolve(v);
      }
      function cancel() {
        if (opts.onCancel) opts.onCancel();
        else close(opts.cancelValue);
      }
      var entry = { close: close, cancel: cancel };
      (opts.buttons || []).forEach(function (b) {
        var btn = el('<button class="btn ' + (b.cls || '') + '">' + esc(b.text) + '</button>');
        if (b.id) btn.id = b.id;
        btn.onclick = function () {
          if (b.onClick && b.onClick(close, ov) === false) return;
          close(b.value);
        };
        foot.appendChild(btn);
      });
      if (!foot.children.length) foot.remove();
      $('.x', ov).onclick = cancel;
      document.getElementById('modals').appendChild(ov);
      modalStack.push(entry);
      if (opts.onOpen) opts.onOpen(ov, close);
    });
  }

  function alertBox(msg, title) {
    return modal({ title: title || 'تنبيه', body: '<p>' + esc(msg).replace(/\n/g, '<br>') + '</p>', buttons: [{ text: 'حسناً', cls: 'primary' }] });
  }
  function confirmBox(msg, okText, title) {
    return modal({
      title: title || 'تأكيد', body: '<p>' + esc(msg).replace(/\n/g, '<br>') + '</p>', cancelValue: false,
      buttons: [{ text: okText || 'نعم', cls: 'primary', value: true }, { text: 'إلغاء', value: false }]
    });
  }
  function promptBox(title, label, value) {
    var body = el('<div><div class="field"><label>' + esc(label) + '</label><input type="text" value="' + esc(value || '') + '"></div></div>');
    var inp = $('input', body);
    return modal({
      title: title, body: body, cancelValue: null,
      buttons: [{ text: 'موافق', cls: 'primary', onClick: function (close) { close(TT.clean(inp.value)); return false; } },
                { text: 'إلغاء', value: null }],
      onOpen: function (ov, close) {
        inp.focus();
        inp.onkeydown = function (e) { if (e.key === 'Enter') close(TT.clean(inp.value)); };
      }
    });
  }

  /* زر الرجوع في أندرويد: يغلق النافذة العلوية */
  window.handleBack = function () {
    if (modalStack.length) {
      modalStack[modalStack.length - 1].cancel();
      return true;
    }
    if (ui.sel) { ui.sel = null; renderGrid(); return true; }
    if (ui.tab !== 'days') { showTab(prevTab()); return true; }
    return false;
  };
  function prevTab() {
    var order = ['days', 'teachers', 'classes', 'schedule'];
    return order[Math.max(0, order.indexOf(ui.tab) - 1)];
  }

  /* ================= الحفظ ================= */

  function serialize() { return JSON.stringify(P); }

  function persist() {
    var json = serialize();
    try { localStorage.setItem(STORE_KEY, json); } catch (e) { /* تجاهل */ }
    if (bridge && bridge.saveData) {
      try { bridge.saveData(json); } catch (e) { /* تجاهل */ }
    }
  }

  function loadStored() {
    var json = null;
    if (bridge && bridge.loadData) { try { json = bridge.loadData(); } catch (e) { json = null; } }
    if (!json) { try { json = localStorage.getItem(STORE_KEY); } catch (e) { json = null; } }
    if (json) {
      try { return TT.normalize(JSON.parse(json)); } catch (e) { /* ملف تالف */ }
    }
    return TT.defaultProject();
  }

  function setProject(p) {
    P = p;
    tt = P.timetable;
    ui.teacher = null; ui.classId = null; ui.sel = null;
    ui.viewClass = 0; ui.viewTeacher = null; ui.viewDay = -1;
    $('#schoolName').value = P.school_name || '';
  }

  /* يحفظ ثم يعيد رسم التبويب الحالي */
  function changed(noRender) {
    persist();
    if (!noRender) renderTab();
  }

  function bytesToBase64(bytes) {
    var bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  function saveFile(name, mime, bytes) {
    if (bridge && bridge.saveFile) {
      var res = String(bridge.saveFile(name, mime, bytesToBase64(bytes)) || '');
      var msg;
      if (res.indexOf('saved:') === 0) {
        var path = res.slice(6), cut = path.lastIndexOf('/');
        msg = 'تم حفظ الملف في المجلد:<br><b dir="ltr">' + esc(path.slice(0, cut)) + '</b><br>باسم: <b>' + esc(path.slice(cut + 1)) + '</b>';
      }
      else if (res.indexOf('shareonly:') === 0) msg = 'تعذر الحفظ في مجلد التنزيلات، لكن يمكنك مشاركة الملف أو فتحه.';
      else { alertBox(res || 'تعذر حفظ الملف.'); return; }
      modal({
        title: 'تم التصدير', body: '<p>' + msg + '</p>',
        buttons: [
          { text: '📤 مشاركة', cls: 'primary', onClick: function () { bridge.shareLast(); } },
          { text: '📄 فتح', onClick: function () { bridge.openLast(); } },
          { text: 'إغلاق' }
        ]
      });
      return;
    }
    var blob = new Blob([bytes], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('تم حفظ الملف: ' + name);
  }

  /* ================= التبويبات ================= */

  function showTab(name) {
    ui.tab = name;
    $$('#steps button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    renderTab();
    window.scrollTo(0, 0);
  }

  function renderTab() {
    refreshDatalists();
    if (ui.tab === 'days') renderDays();
    else if (ui.tab === 'teachers') renderTeachers();
    else if (ui.tab === 'classes') renderClasses();
    else renderSchedule();
  }

  function refreshDatalists() {
    $('#dlSubjects').innerHTML = tt.subject_catalog.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
    $('#dlGrades').innerHTML = TT.GRADES.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
  }

  /* ================= ١. الأيام والحصص ================= */

  function renderDays() {
    var root = $('#tab-days');
    root.innerHTML =
      '<div class="card"><h3>أيام الدوام وعدد الحصص</h3>' +
      '<p class="muted">فعّل أيام الدوام وحدد عدد الحصص في كل يوم (1–12).</p>' +
      '<div class="day-list">' + tt.days.map(function (d, i) {
        return '<div class="day-item' + (d.enabled ? '' : ' off') + '" data-i="' + i + '">' +
          '<label class="row"><input type="checkbox" class="en"' + (d.enabled ? ' checked' : '') + '> <span class="name">' + esc(d.name) + '</span></label>' +
          '<span class="muted grow">' + (d.enabled ? 'دوام' : 'عطلة') + '</span>' +
          '<div class="stepper"><button class="dec">−</button><input type="number" min="1" max="12" class="per" value="' + d.periods + '"' + (d.enabled ? '' : ' disabled') + '><button class="inc">+</button></div>' +
          '</div>';
      }).join('') + '</div></div>' +
      '<div class="card"><h3>توحيد عدد الحصص لكل الأيام</h3><div class="row">' +
      '<input type="number" id="unifyN" min="1" max="12" value="6"> <button class="btn primary" id="unifyBtn">تطبيق على كل الأيام</button></div></div>' +
      '<div class="card"><h3>الملخص</h3><div class="summary" id="daysSummary"></div></div>' +
      '<div class="row"><span class="grow"></span><button class="btn primary" data-go="teachers">التالي: المدرسون ←</button></div>';

    $$('.day-item', root).forEach(function (row) {
      var i = +row.dataset.i, d = tt.days[i], inp = $('.per', row);
      $('.en', row).onchange = function (e) { d.enabled = e.target.checked; changed(); };
      function setP(v) { d.periods = TT.clampInt(v, 1, 12, d.periods); inp.value = d.periods; changed(true); updateDaysSummary(); }
      inp.onchange = function () { setP(inp.value); };
      $('.dec', row).onclick = function () { if (d.enabled) setP(d.periods - 1); };
      $('.inc', row).onclick = function () { if (d.enabled) setP(d.periods + 1); };
    });
    $('#unifyBtn').onclick = function () {
      var n = TT.clampInt($('#unifyN').value, 1, 12, 6);
      tt.days.forEach(function (d) { d.periods = n; });
      changed();
      toast('تم توحيد عدد الحصص: ' + n);
    };
    bindGo(root);
    updateDaysSummary();
  }

  function updateDaysSummary() {
    var days = TT.enabledDays(tt), S = TT.weekSlots(tt);
    var box = $('#daysSummary');
    if (!box) return;
    box.innerHTML =
      '<div class="stat"><b>' + days.length + '</b>أيام الدوام</div>' +
      '<div class="stat"><b>' + S + '</b>مجموع الحصص الأسبوعية لكل صف (S)</div>' +
      '<div class="stat"><b>' + (days.length ? Math.max.apply(null, days.map(function (d) { return d.periods; })) : 0) + '</b>أكبر عدد حصص في يوم</div>';
  }

  function bindGo(root) {
    $$('[data-go]', root).forEach(function (b) { b.onclick = function () { showTab(b.dataset.go); }; });
  }

  /* ================= ٢. المدرسون ================= */

  function renderTeachers() {
    var root = $('#tab-teachers');
    var cc = TT.computeCounts(tt), S = cc.S;
    if (ui.teacher && tt.teachers.indexOf(ui.teacher) < 0) ui.teacher = null;

    var rows = tt.teachers.map(function (t, i) {
      var load = cc.teacherLoad[t] || 0;
      return '<tr class="clickable' + (ui.teacher === t ? ' selected' : '') + '" data-t="' + esc(t) + '">' +
        '<td class="num">' + (i + 1) + '</td><td>' + esc(t) + '</td><td>' + esc(tt.teacher_specialty[t] || '—') + '</td>' +
        '<td class="num' + (load > S ? ' over' : '') + '">' + load + (load > S ? ' ⚠' : '') + '</td>' +
        '<td class="actions"><button class="btn small edit">✎</button> <button class="btn small danger del">🗑</button></td></tr>';
    }).join('');

    root.innerHTML =
      '<div class="two-col"><div>' +
      '<div class="card"><div class="row spread"><h3>المدرسون (' + tt.teachers.length + ')</h3>' +
      '<button class="btn primary" id="addTeachers">➕ إضافة مدرسين</button></div>' +
      '<p class="muted">النصاب الأسبوعي يظهر بالأحمر إذا تجاوز عدد حصص الأسبوع (' + S + '). اضغط على مدرس لعرض مواده وإسنادها.</p>' +
      (tt.teachers.length ?
        '<div class="table-wrap"><table class="list"><thead><tr><th>#</th><th>الاسم</th><th>الاختصاص</th><th>النصاب</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
        '<div class="empty">لا يوجد مدرسون بعد. اضغط «إضافة مدرسين».</div>') +
      '</div></div><div id="teacherPanel"></div></div>' +
      '<div class="row"><button class="btn" data-go="days">→ السابق</button><span class="grow"></span><button class="btn primary" data-go="classes">التالي: الصفوف والمواد ←</button></div>';

    $('#addTeachers').onclick = addTeachersDialog;
    $$('tr[data-t]', root).forEach(function (tr) {
      var t = tr.dataset.t;
      tr.onclick = function (e) {
        if (e.target.closest('.edit')) { editTeacherDialog(t); return; }
        if (e.target.closest('.del')) { deleteTeacher(t); return; }
        ui.teacher = ui.teacher === t ? null : t;
        renderTeachers();
        if (ui.teacher) setTimeout(function () { var p = $('#teacherPanel'); if (p && window.innerWidth < 900) p.scrollIntoView({ behavior: 'smooth' }); }, 50);
      };
    });
    bindGo(root);
    renderTeacherPanel(cc);
  }

  function teacherAssignments(t, cc) {
    var out = [];
    tt.classes.forEach(function (c) {
      c.subjects.forEach(function (s, j) {
        if (s.teacher === t) out.push({ cls: c, j: j, s: s, count: cc.counts[c.id][j] });
      });
    });
    return out;
  }

  function renderTeacherPanel(cc) {
    var box = $('#teacherPanel');
    var t = ui.teacher;
    if (!t) {
      box.innerHTML = tt.teachers.length ? '<div class="card muted">اختر مدرساً من القائمة لعرض المواد والصفوف التي يدرّسها.</div>' : '';
      return;
    }
    var list = teacherAssignments(t, cc);
    var load = cc.teacherLoad[t] || 0;
    box.innerHTML = '<div class="card"><h3>' + esc(t) + '</h3>' +
      '<p class="muted">الاختصاص: ' + esc(tt.teacher_specialty[t] || '—') + ' — النصاب: <b class="' + (load > cc.S ? 'over' : '') + '">' + load + '</b> من ' + cc.S + '</p>' +
      (list.length ?
        '<div class="table-wrap"><table class="list"><thead><tr><th>المادة</th><th>الصف</th><th>الحصص</th><th></th></tr></thead><tbody>' +
        list.map(function (a, k) {
          return '<tr><td>' + esc(a.s.name) + '</td><td>' + esc(TT.classTitle(a.cls)) + '</td>' +
            '<td class="num">' + a.count + (a.s.periods ? '' : ' <span class="muted">(تلقائي)</span>') + '</td>' +
            '<td class="actions"><button class="btn small danger" data-k="' + k + '">إلغاء الإسناد</button></td></tr>';
        }).join('') + '</tbody></table></div>' :
        '<div class="empty">لا توجد مواد مسندة لهذا المدرس.</div>') +
      '<div class="row" style="margin-top:8px"><button class="btn primary" id="assignBtn">📌 إسناد مادة وصفوف</button></div></div>';
    $('#assignBtn').onclick = function () { assignDialog(t); };
    $$('button[data-k]', box).forEach(function (b) {
      b.onclick = function () { unassign(list[+b.dataset.k]); };
    });
  }

  function unassign(a) {
    modal({
      title: 'إلغاء الإسناد',
      body: '<p>إلغاء إسناد مادة <b>' + esc(a.s.name) + '</b> في الصف <b>' + esc(TT.classTitle(a.cls)) + '</b> عن المدرس <b>' + esc(a.s.teacher) + '</b>:</p>',
      cancelValue: null,
      buttons: [
        { text: 'إبقاء المادة في الصف بدون مدرس', cls: 'primary', value: 'keep' },
        { text: 'حذف المادة من الصف', cls: 'danger', value: 'remove' },
        { text: 'إلغاء', value: null }
      ]
    }).then(function (v) {
      if (v === 'keep') a.s.teacher = '';
      else if (v === 'remove') a.cls.subjects.splice(a.cls.subjects.indexOf(a.s), 1);
      else return;
      changed();
      toast('تم إلغاء الإسناد');
    });
  }

  function addTeachersDialog() {
    var body = el('<div><p class="muted">اكتب اسم كل مدرس في حقل مستقل. Enter ينقلك للحقل التالي. الاختصاص اختياري.</p><div class="rows"></div>' +
      '<button class="btn small" id="addRow">➕ إضافة حقل</button></div>');
    var rowsBox = $('.rows', body);
    function renumber() { $$('.entry-row', rowsBox).forEach(function (r, i) { $('.n', r).textContent = i + 1; }); }
    function addRow(focus) {
      var r = el('<div class="entry-row"><span class="n"></span><input class="name" placeholder="اسم المدرس" autocomplete="off">' +
        '<input class="spec" list="dlSubjects" placeholder="الاختصاص" autocomplete="off"><button class="del" title="حذف الحقل">✕</button></div>');
      rowsBox.appendChild(r);
      var onEnter = function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var all = $$('.entry-row', rowsBox), idx = all.indexOf(r);
        if (idx === all.length - 1) addRow(true);
        else $('.name', all[idx + 1]).focus();
      };
      $('.name', r).onkeydown = onEnter;
      $('.spec', r).onkeydown = onEnter;
      $('.del', r).onclick = function () {
        r.remove();
        if (!$$('.entry-row', rowsBox).length) addRow();
        renumber();
      };
      renumber();
      if (focus) $('.name', r).focus();
      return r;
    }
    for (var i = 0; i < 5; i++) addRow();
    $('#addRow', body).onclick = function () { addRow(true); };

    modal({
      title: 'إضافة مدرسين', body: body,
      buttons: [{
        text: 'حفظ', cls: 'primary', onClick: function () {
          var added = 0, dup = 0;
          $$('.entry-row', rowsBox).forEach(function (r) {
            var n = TT.clean($('.name', r).value), sp = TT.clean($('.spec', r).value);
            if (!n) return;
            if (tt.teachers.indexOf(n) >= 0) { dup++; return; }
            tt.teachers.push(n);
            if (sp) {
              tt.teacher_specialty[n] = sp;
              if (tt.subject_catalog.indexOf(sp) < 0) tt.subject_catalog.push(sp);
            }
            added++;
          });
          changed();
          toast('تمت إضافة ' + added + ' مدرس' + (dup ? ' (تم تجاهل ' + dup + ' مكرر)' : ''));
        }
      }, { text: 'إلغاء' }],
      onOpen: function () { $('.name', rowsBox).focus(); }
    });
  }

  function editTeacherDialog(t) {
    var body = el('<div><div class="field"><label>الاسم</label><input type="text" class="nm"></div>' +
      '<div class="field"><label>الاختصاص (اختياري)</label><input type="text" class="sp" list="dlSubjects"></div></div>');
    $('.nm', body).value = t;
    $('.sp', body).value = tt.teacher_specialty[t] || '';
    modal({
      title: 'تعديل المدرس', body: body,
      buttons: [{
        text: 'حفظ', cls: 'primary', onClick: function () {
          var n = TT.clean($('.nm', body).value), sp = TT.clean($('.sp', body).value);
          if (!n) { toast('الاسم مطلوب', true); return false; }
          if (n !== t && tt.teachers.indexOf(n) >= 0) { toast('يوجد مدرس بنفس الاسم', true); return false; }
          if (n !== t) TT.renameTeacher(tt, t, n);
          if (sp) {
            tt.teacher_specialty[n] = sp;
            if (tt.subject_catalog.indexOf(sp) < 0) tt.subject_catalog.push(sp);
          } else delete tt.teacher_specialty[n];
          if (ui.teacher === t) ui.teacher = n;
          if (ui.viewTeacher === t) ui.viewTeacher = n;
          changed();
          toast('تم الحفظ');
        }
      }, { text: 'إلغاء' }]
    });
  }

  function deleteTeacher(t) {
    confirmBox('حذف المدرس «' + t + '»؟\nستصبح مواده «بدون مدرس».', 'حذف').then(function (ok) {
      if (!ok) return;
      TT.deleteTeacher(tt, t);
      if (ui.teacher === t) ui.teacher = null;
      changed();
      toast('تم حذف المدرس');
    });
  }

  function subjectOptionsFor(t) {
    var sp = tt.teacher_specialty[t];
    var list = tt.subject_catalog.slice();
    if (sp) {
      list = list.filter(function (s) { return s !== sp; });
      list.unshift(sp);
    }
    return list;
  }

  function assignDialog(t) {
    if (!tt.classes.length) { alertBox('أضف صفوفاً أولاً من الخطوة ٣.'); return; }
    var subjects = subjectOptionsFor(t);
    var body = el('<div>' +
      '<div class="field"><label>المادة</label><select class="subj">' + subjects.map(function (s) {
        return '<option>' + esc(s) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>عدد الحصص في الأسبوع (0 = تلقائي)</label><input type="number" class="per" min="0" max="40" value="0"></div>' +
      '<div class="field"><div class="lbl">الصفوف</div><div class="row" style="margin-bottom:6px">' +
      '<button class="btn small all">تحديد الكل</button><button class="btn small none">إلغاء التحديد</button></div>' +
      '<div class="checks"></div></div></div>');
    var sel = $('.subj', body), per = $('.per', body), checks = $('.checks', body);
    var initial = {};

    function draw() {
      var name = sel.value, perVal = null;
      initial = {};
      checks.innerHTML = tt.classes.map(function (c) {
        var s = c.subjects.filter(function (x) { return x.name === name; })[0];
        var mine = s && s.teacher === t, other = s && s.teacher && s.teacher !== t;
        if (mine) { initial[c.id] = true; if (perVal === null) perVal = s.periods; }
        return '<label class="check' + (other ? ' warn' : '') + '"><input type="checkbox" data-id="' + c.id + '"' + (mine ? ' checked' : '') + '>' +
          '<span>' + esc(TT.classTitle(c)) + (other ? '<small>⚠ (الحالي: ' + esc(s.teacher) + ')</small>' : '') +
          (s && !s.teacher ? '<small style="color:var(--muted)">(بدون مدرس)</small>' : '') + '</span></label>';
      }).join('');
      per.value = perVal || 0;
    }
    sel.onchange = draw;
    $('.all', body).onclick = function () { $$('input', checks).forEach(function (i) { i.checked = true; }); };
    $('.none', body).onclick = function () { $$('input', checks).forEach(function (i) { i.checked = false; }); };
    draw();

    modal({
      title: 'إسناد مادة وصفوف — ' + t, body: body, wide: true,
      buttons: [{
        text: 'حفظ', cls: 'primary', onClick: function (close) {
          var name = sel.value, n = TT.clampInt(per.value, 0, 40, 0);
          var moves = [], checked = {};
          $$('input', checks).forEach(function (i) { if (i.checked) checked[i.dataset.id] = true; });
          tt.classes.forEach(function (c) {
            if (!checked[c.id]) return;
            var s = c.subjects.filter(function (x) { return x.name === name; })[0];
            if (s && s.teacher && s.teacher !== t) moves.push(TT.classTitle(c) + ' (من ' + s.teacher + ')');
          });
          var go = moves.length ?
            confirmBox('سيتم نقل مادة «' + name + '» إلى المدرس ' + t + ' في:\n' + moves.join('\n'), 'نقل') :
            Promise.resolve(true);
          go.then(function (ok) {
            if (!ok) return;
            tt.classes.forEach(function (c) {
              var s = c.subjects.filter(function (x) { return x.name === name; })[0];
              if (checked[c.id]) {
                if (s) { s.teacher = t; s.periods = n; }
                else c.subjects.push({ name: name, teacher: t, periods: n });
              } else if (initial[c.id] && s) {
                s.teacher = '';
              }
            });
            close();
            changed();
            toast('تم الإسناد');
          });
          return false;
        }
      }, { text: 'إلغاء' }]
    });
  }

  /* ================= ٣. الصفوف والمواد ================= */

  function findClass(id) {
    for (var i = 0; i < tt.classes.length; i++) if (tt.classes[i].id === id) return tt.classes[i];
    return null;
  }

  function renderClasses() {
    var root = $('#tab-classes');
    if (ui.classId && !findClass(ui.classId)) ui.classId = null;
    if (!ui.classId && tt.classes.length) ui.classId = tt.classes[0].id;
    var c = ui.classId ? findClass(ui.classId) : null;

    root.innerHTML =
      '<div class="card"><div class="row spread"><h3>الصفوف والشعب (' + tt.classes.length + ')</h3></div>' +
      (tt.classes.length ?
        '<div class="class-chips">' + tt.classes.map(function (x) {
          return '<button class="chip' + (x.id === ui.classId ? ' selected' : '') + '" data-id="' + x.id + '">' + esc(TT.classTitle(x)) + '</button>';
        }).join('') + '</div>' :
        '<div class="empty">لا توجد صفوف بعد. اضغط «إضافة صف».</div>') +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn primary" id="addClass">➕ إضافة صف</button>' +
      '<button class="btn" id="editClass"' + (c ? '' : ' disabled') + '>✎ تعديل الصف ومواده</button>' +
      '<button class="btn danger" id="delClass"' + (c ? '' : ' disabled') + '>🗑 حذف</button>' +
      '<button class="btn" id="copyClass"' + (c && tt.classes.length > 1 ? '' : ' disabled') + '>⧉ نسخ المواد إلى صفوف أخرى</button>' +
      '</div></div>' +
      '<div id="classSubjects"></div>' +
      '<div class="row"><button class="btn" data-go="teachers">→ السابق</button><span class="grow"></span><button class="btn primary" data-go="schedule">التالي: الجدول ←</button></div>';

    $$('.chip', root).forEach(function (b) {
      b.onclick = function () { ui.classId = b.dataset.id; renderClasses(); };
    });
    $('#addClass').onclick = function () { classDialog(null); };
    $('#editClass').onclick = function () { if (c) classDialog(c); };
    $('#delClass').onclick = function () {
      confirmBox('حذف الصف «' + TT.classTitle(c) + '» مع مواده؟', 'حذف').then(function (ok) {
        if (!ok) return;
        tt.classes.splice(tt.classes.indexOf(c), 1);
        ui.classId = null;
        changed();
        toast('تم حذف الصف');
      });
    };
    $('#copyClass').onclick = function () { copySubjectsDialog(c); };
    bindGo(root);
    renderClassSubjects(c);
  }

  function teacherSelectHtml(subject, current) {
    var g = TT.teachersFor(tt, subject);
    var h = '<option value="">بدون مدرس</option>';
    if (g.specialists.length) h += '<optgroup label="المختصون بالمادة">' + g.specialists.map(opt).join('') + '</optgroup>';
    if (g.others.length) h += '<optgroup label="' + (g.specialists.length ? 'مدرسون آخرون' : 'المدرسون') + '">' + g.others.map(opt).join('') + '</optgroup>';
    if (current && tt.teachers.indexOf(current) < 0) h += opt(current);
    h += '<option value="__new__">+ مدرس جديد...</option>';
    return h;
    function opt(t) { return '<option value="' + esc(t) + '"' + (t === current ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  }

  /* عند اختيار «+ مدرس جديد...» من قائمة */
  function handleNewTeacher(selectEl, subject, prev, after) {
    promptBox('مدرس جديد', 'اسم المدرس').then(function (n) {
      if (!n) { selectEl.value = prev || ''; return; }
      if (tt.teachers.indexOf(n) < 0) {
        tt.teachers.push(n);
        if (subject && !tt.teacher_specialty[n]) tt.teacher_specialty[n] = subject;
      }
      persist();
      after(n);
    });
  }

  function renderClassSubjects(c) {
    var box = $('#classSubjects');
    if (!c) { box.innerHTML = ''; return; }
    var cc = TT.computeCounts(tt), S = cc.S, counts = cc.counts[c.id], total = cc.classTotal[c.id];
    var cls = total > S ? 'err' : (total === S ? 'ok' : 'warn');
    var msg = total > S ? ' — زائد ' + (total - S) : (total < S ? ' — فيه ' + (S - total) + ' حصة فارغة' : ' — مكتمل');
    box.innerHTML = '<div class="card"><h3>مواد الصف: ' + esc(TT.classTitle(c)) + '</h3>' +
      (c.subjects.length ?
        '<div class="table-wrap"><table class="list"><thead><tr><th>المادة</th><th>المدرس</th><th>الحصص/أسبوع</th><th>الفعلي</th><th>ترتيب</th></tr></thead><tbody>' +
        c.subjects.map(function (s, j) {
          return '<tr data-j="' + j + '"><td>' + esc(s.name) + '</td>' +
            '<td><select class="tch">' + teacherSelectHtml(s.name, s.teacher) + '</select></td>' +
            '<td class="num"><input type="number" class="per auto-input" min="0" max="40" placeholder="تلقائي" value="' + (s.periods || '') + '"></td>' +
            '<td class="num"><b>' + counts[j] + '</b></td>' +
            '<td class="actions"><button class="btn small up"' + (j ? '' : ' disabled') + '>▲</button> <button class="btn small down"' + (j < c.subjects.length - 1 ? '' : ' disabled') + '>▼</button></td></tr>';
        }).join('') + '</tbody></table></div>' :
        '<div class="empty">لا توجد مواد. اضغط «تعديل الصف ومواده».</div>') +
      '<div class="total-line ' + cls + '">مجموع حصص الصف ' + total + ' من ' + S + msg + '</div>' +
      '<p class="muted">اترك عدد الحصص فارغاً (تلقائي) لتقتسم المادة الحصص المتبقية في الصف.</p></div>';

    $$('tr[data-j]', box).forEach(function (tr) {
      var j = +tr.dataset.j, s = c.subjects[j];
      var tsel = $('.tch', tr);
      tsel.onchange = function () {
        if (tsel.value === '__new__') {
          handleNewTeacher(tsel, s.name, s.teacher, function (n) { s.teacher = n; changed(); });
          return;
        }
        s.teacher = tsel.value;
        changed();
      };
      $('.per', tr).onchange = function (e) { s.periods = TT.clampInt(e.target.value, 0, 40, 0); changed(); };
      $('.up', tr).onclick = function () { move(j, -1); };
      $('.down', tr).onclick = function () { move(j, 1); };
    });
    function move(j, d) {
      var a = c.subjects, k = j + d;
      if (k < 0 || k >= a.length) return;
      var x = a[j]; a[j] = a[k]; a[k] = x;
      changed();
    }
  }

  function nextFreeSection(grade) {
    var used = tt.classes.filter(function (c) { return c.grade === grade; }).map(function (c) { return c.section; });
    for (var i = 0; i < TT.SECTIONS.length; i++) if (used.indexOf(TT.SECTIONS[i]) < 0) return TT.SECTIONS[i];
    return 'أ';
  }

  /* نافذة إضافة/تعديل صف مع مختار المواد */
  function classDialog(cls) {
    var editing = !!cls;
    var state = {}; // اسم المادة -> {on, teacher, periods}
    if (editing) {
      cls.subjects.forEach(function (s) {
        if (tt.subject_catalog.indexOf(s.name) < 0) tt.subject_catalog.push(s.name);
        state[s.name] = { on: true, teacher: s.teacher, periods: s.periods };
      });
    }

    var body = el('<div>' +
      '<div class="field"><label>اسم الصف</label><input type="text" class="grade" list="dlGrades" placeholder="مثال: الأول المتوسط" autocomplete="off"></div>' +
      (editing ?
        '<div class="field"><label>اسم الشعبة</label><input type="text" class="secname"></div>' :
        '<div class="row"><div class="field"><label>عدد الشعب</label><input type="number" class="secn" min="1" max="12" value="1"></div>' +
        '<div class="field grow secname-box"><label>اسم الشعبة</label><input type="text" class="secname" value="أ"></div>' +
        '<div class="field grow secprev muted" style="display:none"></div></div>') +
      '<div class="field"><label>نسخ المواد من صف (اختياري)</label><select class="copyfrom"><option value="">— بدون —</option>' +
      tt.classes.filter(function (x) { return x !== cls; }).map(function (x) {
        return '<option value="' + x.id + '">' + esc(TT.classTitle(x)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><div class="lbl">المواد</div><div class="row" style="margin-bottom:6px">' +
      '<button class="btn small newsub">➕ مادة جديدة</button><button class="btn small all">تحديد الكل</button><button class="btn small none">إلغاء التحديد</button></div>' +
      '<div class="table-wrap"><table class="list picker"><thead><tr><th></th><th>المادة</th><th>المدرس</th><th>الحصص<br><small>0 = تلقائي</small></th><th></th></tr></thead><tbody></tbody></table></div></div>' +
      '</div>');

    var gradeIn = $('.grade', body), secName = $('.secname', body), secN = $('.secn', body);
    if (editing) { gradeIn.value = cls.grade; secName.value = cls.section; }

    function updateSec() {
      if (editing) return;
      var n = TT.clampInt(secN.value, 1, 12, 1);
      $('.secname-box', body).style.display = n === 1 ? '' : 'none';
      var prev = $('.secprev', body);
      prev.style.display = n === 1 ? 'none' : '';
      prev.innerHTML = '<div class="lbl">الشعب</div>' + TT.SECTIONS.slice(0, n).join('، ');
    }
    if (!editing) {
      secN.oninput = updateSec;
      gradeIn.onchange = function () { secName.value = nextFreeSection(TT.clean(gradeIn.value)); };
      updateSec();
    }

    var tbody = $('tbody', body);
    function drawPicker() {
      tbody.innerHTML = tt.subject_catalog.map(function (name, i) {
        var st = state[name] || { on: false, teacher: '', periods: 0 };
        return '<tr data-i="' + i + '" class="' + (st.on ? 'on' : '') + '">' +
          '<td><input type="checkbox" class="on"' + (st.on ? ' checked' : '') + '></td>' +
          '<td class="subj">' + esc(name) + '</td>' +
          '<td><select class="tch">' + teacherSelectHtml(name, st.teacher) + '</select></td>' +
          '<td class="num"><input type="number" class="per" min="0" max="40" value="' + (st.periods || 0) + '"></td>' +
          '<td><button class="btn small danger rm" title="حذف المادة من القائمة">✕</button></td></tr>';
      }).join('');
      $$('tr', tbody).forEach(function (tr) {
        var name = tt.subject_catalog[+tr.dataset.i];
        function st() { return state[name] || (state[name] = { on: false, teacher: '', periods: 0 }); }
        $('.on', tr).onchange = function (e) { st().on = e.target.checked; tr.classList.toggle('on', e.target.checked); };
        var tsel = $('.tch', tr);
        tsel.onchange = function () {
          if (tsel.value === '__new__') {
            handleNewTeacher(tsel, name, st().teacher, function (n) { st().teacher = n; st().on = true; drawPicker(); });
            return;
          }
          st().teacher = tsel.value;
          if (tsel.value) { st().on = true; $('.on', tr).checked = true; tr.classList.add('on'); }
        };
        $('.per', tr).onchange = function (e) {
          st().periods = TT.clampInt(e.target.value, 0, 40, 0);
          if (st().periods) { st().on = true; $('.on', tr).checked = true; tr.classList.add('on'); }
        };
        $('.rm', tr).onclick = function () {
          confirmBox('حذف مادة «' + name + '» من قائمة المواد؟\n(لن تُحذف من الصفوف التي تدرسها حالياً)', 'حذف').then(function (ok) {
            if (!ok) return;
            tt.subject_catalog.splice(tt.subject_catalog.indexOf(name), 1);
            delete state[name];
            persist();
            refreshDatalists();
            drawPicker();
          });
        };
      });
    }
    drawPicker();

    $('.copyfrom', body).onchange = function (e) {
      var src = findClass(e.target.value);
      if (!src) return;
      state = {};
      src.subjects.forEach(function (s) {
        if (tt.subject_catalog.indexOf(s.name) < 0) tt.subject_catalog.push(s.name);
        state[s.name] = { on: true, teacher: s.teacher, periods: s.periods };
      });
      drawPicker();
      toast('تم نسخ مواد ' + TT.classTitle(src));
    };
    $('.newsub', body).onclick = function () {
      promptBox('مادة جديدة', 'اسم المادة').then(function (n) {
        if (!n) return;
        if (tt.subject_catalog.indexOf(n) < 0) tt.subject_catalog.push(n);
        state[n] = state[n] || { on: true, teacher: '', periods: 0 };
        state[n].on = true;
        persist();
        refreshDatalists();
        drawPicker();
      });
    };
    $('.all', body).onclick = function () {
      tt.subject_catalog.forEach(function (n) { (state[n] = state[n] || { teacher: '', periods: 0 }).on = true; });
      drawPicker();
    };
    $('.none', body).onclick = function () {
      Object.keys(state).forEach(function (n) { state[n].on = false; });
      drawPicker();
    };

    function buildSubjects(existing) {
      var out = [];
      (existing || []).forEach(function (s) {
        var st = state[s.name];
        if (st && st.on) out.push({ name: s.name, teacher: st.teacher, periods: st.periods });
      });
      tt.subject_catalog.forEach(function (n) {
        var st = state[n];
        if (st && st.on && !out.some(function (x) { return x.name === n; })) out.push({ name: n, teacher: st.teacher, periods: st.periods });
      });
      return out;
    }

    modal({
      title: editing ? 'تعديل الصف ومواده' : 'إضافة صف', body: body, wide: true,
      buttons: [{
        text: 'حفظ', cls: 'primary', onClick: function () {
          var grade = TT.clean(gradeIn.value);
          if (!grade) { toast('اكتب اسم الصف', true); return false; }
          var titles = tt.classes.filter(function (x) { return x !== cls; }).map(TT.classTitle);
          if (editing) {
            var sec = TT.clean(secName.value);
            if (titles.indexOf(TT.classTitle({ grade: grade, section: sec })) >= 0) { toast('يوجد صف بنفس الاسم والشعبة', true); return false; }
            cls.grade = grade; cls.section = sec;
            cls.subjects = buildSubjects(cls.subjects);
            changed();
            toast('تم حفظ الصف');
            return;
          }
          var n = TT.clampInt(secN.value, 1, 12, 1);
          var secs = n === 1 ? [TT.clean(secName.value)] : TT.SECTIONS.slice(0, n);
          var clash = secs.filter(function (s) { return titles.indexOf(TT.classTitle({ grade: grade, section: s })) >= 0; });
          if (clash.length) { toast('موجود مسبقاً: ' + clash.map(function (s) { return TT.classTitle({ grade: grade, section: s }); }).join('، '), true); return false; }
          var subs = buildSubjects();
          var first = null;
          secs.forEach(function (s) {
            var c = { id: TT.uid(), grade: grade, section: s, subjects: subs.map(function (x) { return { name: x.name, teacher: x.teacher, periods: x.periods }; }) };
            while (findClass(c.id)) c.id = TT.uid();
            tt.classes.push(c);
            if (!first) first = c;
          });
          ui.classId = first.id;
          changed();
          toast('تمت إضافة ' + secs.length + ' شعبة');
        }
      }, { text: 'إلغاء' }],
      onOpen: function () { if (!editing) gradeIn.focus(); }
    });
  }

  function copySubjectsDialog(src) {
    var others = tt.classes.filter(function (x) { return x !== src; });
    var body = el('<div><p>نسخ مواد <b>' + esc(TT.classTitle(src)) + '</b> (' + src.subjects.length + ' مادة) إلى الصفوف المحددة. ستُستبدل موادها الحالية.</p>' +
      '<div class="row" style="margin-bottom:6px"><button class="btn small all">تحديد الكل</button><button class="btn small none">إلغاء التحديد</button></div>' +
      '<div class="checks">' + others.map(function (x) {
        return '<label class="check"><input type="checkbox" data-id="' + x.id + '"> ' + esc(TT.classTitle(x)) + '</label>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:10px"><label class="row"><input type="radio" name="wt" value="1" checked> مع أسماء المدرسين</label>' +
      '<label class="row"><input type="radio" name="wt" value="0"> بدون أسماء المدرسين</label></div></div>');
    $('.all', body).onclick = function () { $$('.checks input', body).forEach(function (i) { i.checked = true; }); };
    $('.none', body).onclick = function () { $$('.checks input', body).forEach(function (i) { i.checked = false; }); };
    modal({
      title: 'نسخ المواد إلى صفوف أخرى', body: body, wide: true,
      buttons: [{
        text: 'نسخ', cls: 'primary', onClick: function () {
          var withT = $('input[name=wt]:checked', body).value === '1';
          var n = 0;
          $$('.checks input', body).forEach(function (i) {
            if (!i.checked) return;
            var c = findClass(i.dataset.id);
            c.subjects = src.subjects.map(function (s) { return { name: s.name, teacher: withT ? s.teacher : '', periods: s.periods }; });
            n++;
          });
          if (!n) { toast('لم تحدد أي صف', true); return false; }
          changed();
          toast('تم النسخ إلى ' + n + ' صف');
        }
      }, { text: 'إلغاء' }]
    });
  }

  /* ================= التحليل ================= */

  function analysisDialog(autoGenerate) {
    var a, current = 'issues';
    var body = el('<div><div class="subtabs">' +
      '<button data-t="issues">المشاكل والتنبيهات</button><button data-t="fix">التعديلات المقترحة</button>' +
      '<button data-t="teachers">نصاب المدرسين</button><button data-t="classes">حصص الصفوف</button></div><div class="content"></div></div>');
    var content = $('.content', body);

    function badge(text, kind) { return '<span class="badge ' + kind + '">' + esc(text) + '</span>'; }

    function draw() {
      a = TT.analyze(tt);
      $$('.subtabs button', body).forEach(function (b) {
        var label = { issues: 'المشاكل والتنبيهات (' + (a.errors.length + a.warnings.length) + ')', fix: 'التعديلات المقترحة (' + a.suggestions.length + ')', teachers: 'نصاب المدرسين', classes: 'حصص الصفوف' }[b.dataset.t];
        b.textContent = label;
        b.classList.toggle('active', b.dataset.t === current);
        b.onclick = function () { current = b.dataset.t; draw(); };
      });
      var gen = document.getElementById('anGen');
      if (gen) gen.disabled = a.errors.length > 0;

      if (current === 'issues') {
        content.innerHTML =
          (a.errors.length ? '<h4>أخطاء تمنع الإنشاء</h4>' + a.errors.map(function (m) { return '<div class="msg err">✖ ' + esc(m) + '</div>'; }).join('') : '') +
          (a.warnings.length ? '<h4>تنبيهات (لا تمنع الإنشاء)</h4>' + a.warnings.map(function (m) { return '<div class="msg warn">⚠ ' + esc(m) + '</div>'; }).join('') : '') +
          (!a.errors.length && !a.warnings.length ? '<div class="msg ok">✔ البيانات سليمة ولا توجد تنبيهات.</div>' : '');
      } else if (current === 'fix') {
        if (!a.suggestions.length) { content.innerHTML = '<div class="msg ok">لا توجد مواد تحتاج تعديلاً.</div>'; return; }
        content.innerHTML = '<p class="muted">المواد المسببة لتجاوز المتاح (S = ' + a.S + '). عدّل «الحصص الجديدة» (0 = تلقائي) أو غيّر المدرس ثم اضغط «تطبيق التعديلات».</p>' +
          '<div class="table-wrap"><table class="list"><thead><tr><th>الصف / المادة</th><th>الحالي</th><th>الحصص الجديدة</th><th>المدرس</th></tr></thead><tbody>' +
          a.suggestions.map(function (s, k) {
            return '<tr data-k="' + k + '"><td>' + esc(s.classTitle) + '<br><b>' + esc(s.subject) + '</b></td>' +
              '<td class="num">' + s.current + '</td><td class="num"><input type="number" class="np" min="0" max="40" value="' + s.suggested + '"></td>' +
              '<td><select class="tch">' + teacherSelectHtml(s.subject, s.teacher) + '</select></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="row" style="margin-top:8px"><button class="btn" id="allAuto">جعل كل هذه المواد تلقائي</button>' +
          '<button class="btn primary" id="applyFix">تطبيق التعديلات</button></div>';
        $$('select.tch', content).forEach(function (sel) {
          sel.onchange = function () {
            if (sel.value === '__new__') {
              var s = a.suggestions[+sel.closest('tr').dataset.k];
              handleNewTeacher(sel, s.subject, s.teacher, function (n) {
                var opt = document.createElement('option');
                opt.value = n; opt.textContent = n; sel.insertBefore(opt, sel.lastElementChild); sel.value = n;
              });
            }
          };
        });
        $('#allAuto').onclick = function () { $$('.np', content).forEach(function (i) { i.value = 0; }); };
        $('#applyFix').onclick = function () {
          $$('tr[data-k]', content).forEach(function (tr) {
            var s = a.suggestions[+tr.dataset.k], c = findClass(s.classId);
            if (!c || !c.subjects[s.index]) return;
            c.subjects[s.index].periods = TT.clampInt($('.np', tr).value, 0, 40, 0);
            var tv = $('.tch', tr).value;
            if (tv !== '__new__') c.subjects[s.index].teacher = tv;
          });
          changed(true);
          toast('تم تطبيق التعديلات');
          current = 'issues';
          draw();
        };
      } else if (current === 'teachers') {
        content.innerHTML = '<div class="table-wrap"><table class="list"><thead><tr><th>المدرس</th><th>النصاب</th><th>S</th><th>الحالة</th></tr></thead><tbody>' +
          a.teacherRows.map(function (r) {
            var k = { 'أكبر من المتاح': 'err', 'ممتلئ': 'warn', 'مناسب': 'ok', 'لا يدرّس': 'muted' }[r.status];
            return '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.load + '</td><td class="num">' + a.S + '</td><td>' + badge(r.status, k) + '</td></tr>';
          }).join('') + '</tbody></table></div>' + (a.teacherRows.length ? '' : '<div class="empty">لا يوجد مدرسون.</div>');
      } else {
        content.innerHTML = '<div class="table-wrap"><table class="list"><thead><tr><th>الصف</th><th>المجموع من S</th><th>الفارغ</th><th>الحالة</th></tr></thead><tbody>' +
          a.classRows.map(function (r) {
            var k = { 'زائد': 'err', 'مكتمل': 'ok', 'فيه فراغ': 'warn', 'بلا مواد': 'muted' }[r.status];
            return '<tr><td>' + esc(r.title) + '</td><td class="num">' + r.total + ' / ' + a.S + '</td><td class="num">' + r.empty + '</td><td>' + badge(r.status, k) + '</td></tr>';
          }).join('') + '</tbody></table></div>' + (a.classRows.length ? '' : '<div class="empty">لا توجد صفوف.</div>');
      }
    }

    modal({
      title: 'تحليل البيانات', body: body, wide: true,
      buttons: [
        { text: '⚙ إنشاء الجدول', cls: 'primary', id: 'anGen', value: 'gen' },
        { text: 'إغلاق', value: null }
      ],
      onOpen: function () { if (TT.analyze(tt).errors.length) current = 'issues'; draw(); }
    }).then(function (v) {
      renderTab();
      if (v === 'gen') runGenerator();
    });
  }

  /* ================= الإنشاء ================= */

  function startGenerate() {
    var a = TT.analyze(tt);
    if (a.errors.length || a.warnings.length) analysisDialog(true);
    else runGenerator();
  }

  function runGenerator() {
    var a = TT.analyze(tt);
    if (a.errors.length) { analysisDialog(); return; }
    var snap = TT.buildSnapshot(tt, a.cc);
    var seconds = P.search_seconds || 30;
    var worker = null, fallbackTimer = null, stopped = false, fallbackSolver = null;

    var body = el('<div><p>جارٍ البحث عن أفضل جدول بدون تعارض...</p>' +
      '<div class="progress"><div></div></div>' +
      '<div class="kv"><span>الوقت</span><b class="el">0</b><span>عدد الخطوات</span><b class="st">0</b>' +
      '<span>التعارضات</span><b class="cf">—</b><span>تكلفة الجودة</span><b class="co">—</b><span>إعادة البدء</span><b class="rs">0</b></div></div>');

    var closeDlg;
    modal({
      title: 'إنشاء الجدول', body: body, onCancel: stop,
      buttons: [{ text: '■ إيقاف', cls: 'danger', onClick: function () { stop(); return false; } }],
      onOpen: function (ov, close) { closeDlg = close; }
    });

    function update(p) {
      $('.el', body).textContent = p.elapsed.toFixed(1) + ' / ' + seconds + ' ث';
      $('.st', body).textContent = p.steps.toLocaleString('ar');
      $('.cf', body).textContent = p.bestConflicts === Infinity ? '—' : p.bestConflicts;
      $('.co', body).textContent = p.bestCost === Infinity ? '—' : p.bestCost;
      $('.rs', body).textContent = p.restarts;
      $('.progress div', body).style.width = Math.min(100, p.elapsed / seconds * 100) + '%';
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      if (worker) worker.postMessage({ cmd: 'stop' });
    }
    function finish(result, progress) {
      if (worker) { worker.terminate(); worker = null; }
      closeDlg();
      snap.grids = result.grids;
      tt.schedule = snap;
      ui.sel = null;
      if (ui.viewClass >= snap.classes.length) ui.viewClass = 0;
      persist();
      showTab('schedule');
      var msg = result.conflicts === 0 ? '✔ تم إنشاء الجدول بدون تعارضات' : '✖ تم إنشاء الجدول مع ' + result.conflicts + ' تعارض';
      toast(msg + ' (' + progress.elapsed.toFixed(1) + ' ث)', result.conflicts > 0);
    }
    function fail(msg) {
      if (worker) { worker.terminate(); worker = null; }
      closeDlg();
      alertBox(msg, 'تعذر الإنشاء');
    }

    function runInPage() {
      // احتياط: إذا لم تعمل Web Workers نشغل البحث على دفعات في الصفحة نفسها
      fallbackSolver = TT.createSolver(snap, seconds);
      if (fallbackSolver.error) { fail(fallbackSolver.error); return; }
      (function loop() {
        var done = fallbackSolver.run(60);
        var p = fallbackSolver.progress();
        update(p);
        if (done || stopped) finish(fallbackSolver.result(), p);
        else fallbackTimer = setTimeout(loop, 0);
      })();
    }

    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'progress') update(m.progress);
        else if (m.type === 'done') finish(m.result, m.progress);
        else if (m.type === 'error') fail(m.message);
      };
      worker.onerror = function (e) {
        e.preventDefault();
        if (worker) { worker.terminate(); worker = null; }
        runInPage();
      };
      worker.postMessage({ cmd: 'start', snapshot: snap, seconds: seconds });
    } catch (e) {
      worker = null;
      runInPage();
    }
  }

  /* ================= ٤. الجدول ================= */

  function renderSchedule() {
    var root = $('#tab-schedule');
    var sch = tt.schedule;
    var S = TT.weekSlots(tt);

    var html = '<div class="card"><div class="sched-bar">' +
      '<button class="btn primary" id="genBtn">⚙ إنشاء الجدول</button>' +
      '<button class="btn" id="anBtn">🔍 تحليل البيانات</button>' +
      '<label class="row muted">مدة البحث <input type="number" id="secs" min="5" max="300" value="' + (P.search_seconds || 30) + '"> ثانية</label>' +
      (sch ? '<button class="btn" id="expBtn">⬇ تصدير Excel / Word</button>' : '') +
      '</div></div>';

    if (!sch) {
      html += '<div class="card empty">لم يُنشأ الجدول بعد.<br>عدد الصفوف: ' + tt.classes.length + ' — حصص الأسبوع: ' + S + '<br><br>اضغط «إنشاء الجدول».</div>';
      root.innerHTML = html;
      bindScheduleBar();
      return;
    }

    if (ui.viewClass >= sch.classes.length) ui.viewClass = 0;
    var teachers = TT.scheduleTeachers(tt);
    if (ui.view === 'teacher' && (!ui.viewTeacher || teachers.indexOf(ui.viewTeacher) < 0)) ui.viewTeacher = teachers[0] || null;

    html += (TT.isStale(tt) ? '<div class="banner">⚠ تم تعديل البيانات بعد إنشاء الجدول، أعد الإنشاء.</div>' : '') +
      '<div class="card"><div class="sched-bar">' +
      '<label class="row">عرض جدول <select id="viewSel">' +
      '<option value="full"' + (ui.view === 'full' ? ' selected' : '') + '>الجدول الكامل (كل الصفوف والشعب)</option>' +
      '<option value="class"' + (ui.view === 'class' ? ' selected' : '') + '>صف / شعبة معينة</option>' +
      '<option value="teacher"' + (ui.view === 'teacher' ? ' selected' : '') + '>مدرس معين</option></select></label>';
    if (ui.view === 'full') {
      html += '<label class="row">اليوم <select id="daySel"><option value="-1">كل الأيام</option>' +
        sch.days.map(function (d, i) { return '<option value="' + i + '"' + (ui.viewDay === i ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label>';
    } else if (ui.view === 'class') {
      html += '<select id="clsSel">' + sch.classes.map(function (c, i) {
        return '<option value="' + i + '"' + (ui.viewClass === i ? ' selected' : '') + '>' + esc(c.title) + '</option>';
      }).join('') + '</select>';
    } else {
      html += '<select id="tchSel">' + teachers.map(function (t) {
        return '<option' + (ui.viewTeacher === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>';
    }
    html += '<span class="grow"></span><span id="indicator"></span></div>' +
      '<p class="muted" id="hint" style="margin:6px 0 0"></p></div>' +
      '<div class="grid-wrap" id="gridWrap"></div>';
    root.innerHTML = html;
    bindScheduleBar();

    $('#viewSel').onchange = function (e) { ui.view = e.target.value; ui.sel = null; renderSchedule(); };
    if ($('#daySel')) $('#daySel').onchange = function (e) { ui.viewDay = +e.target.value; renderGrid(); };
    if ($('#clsSel')) $('#clsSel').onchange = function (e) { ui.viewClass = +e.target.value; ui.sel = null; renderGrid(); };
    if ($('#tchSel')) $('#tchSel').onchange = function (e) { ui.viewTeacher = e.target.value; renderGrid(); };
    $('#gridWrap').onclick = onGridClick;
    renderGrid();
  }

  function bindScheduleBar() {
    $('#genBtn').onclick = startGenerate;
    $('#anBtn').onclick = function () { analysisDialog(); };
    $('#secs').onchange = function (e) {
      P.search_seconds = TT.clampInt(e.target.value, 5, 300, 30);
      e.target.value = P.search_seconds;
      persist();
    };
    if ($('#expBtn')) $('#expBtn').onclick = exportDialog;
  }

  function renderGrid() {
    var wrap = $('#gridWrap');
    var sch = tt.schedule;
    if (!wrap || !sch) return;
    var conf = TT.findConflicts(sch);
    var ind = $('#indicator');
    ind.className = 'indicator ' + (conf.count ? 'err' : 'ok');
    ind.textContent = conf.count ? '✖ عدد التعارضات: ' + conf.count : '✔ لا توجد تعارضات';
    var hint = $('#hint');
    if (ui.view === 'teacher') {
      var load = TT.teacherLoads(sch)[ui.viewTeacher] || 0;
      hint.textContent = ui.viewTeacher ? 'جدول المدرس: ' + ui.viewTeacher + ' — النصاب ' + load + ' حصة' : 'لا يوجد مدرسون في الجدول.';
    } else {
      hint.textContent = ui.sel ? 'اضغط على حصة أخرى لنفس الصف لتبديلهما، أو على نفس الحصة لإلغاء الاختيار.' :
        'للتعديل اليدوي: اضغط على حصة ثم على حصة أخرى لنفس الصف لتبديلهما.';
    }
    if (ui.view === 'full') wrap.innerHTML = fullGridHtml(sch, conf);
    else if (ui.view === 'class') wrap.innerHTML = classGridHtml(sch, conf, ui.viewClass);
    else wrap.innerHTML = teacherGridHtml(sch, ui.viewTeacher);
  }

  function cellHtml(sch, conf, c, s, extraCls, bg) {
    var j = sch.grids[c][s];
    var k = c + ',' + s, cf = conf.cells[k];
    var cls = 'cell' + (extraCls || '') + (j < 0 ? ' blank' : '') +
      (cf ? ' conflict' : '') + (ui.sel && ui.sel.c === c && ui.sel.s === s ? ' sel' : '');
    var title = cf ? ' title="تعارض: ' + esc(cf.teacher) + ' عنده حصة في ' + esc(cf.others.map(function (o) { return sch.classes[o].title; }).join('، ')) + '"' : '';
    var inner = j < 0 ? '<span class="s">فراغ</span>' :
      '<span class="s">' + esc(sch.classes[c].subjects[j].name) + '</span><span class="t">' + esc(sch.classes[c].subjects[j].teacher || '—') + '</span>';
    return '<td class="' + cls + '" data-c="' + c + '" data-s="' + s + '" style="background:#' + bg + '"' + title + '>' + inner + '</td>';
  }

  function fullGridHtml(sch, conf) {
    var info = TT.slotInfo(sch.periods);
    var days = ui.viewDay >= 0 && ui.viewDay < sch.days.length ? [ui.viewDay] : sch.days.map(function (_, i) { return i; });
    var h = '<table class="grid"><thead><tr><th class="rowhead" rowspan="2">الصف والشعبة</th>';
    days.forEach(function (d) { h += '<th class="daystart" colspan="' + sch.periods[d] + '">' + esc(sch.days[d]) + '</th>'; });
    h += '</tr><tr>';
    days.forEach(function (d) {
      for (var k = 0; k < sch.periods[d]; k++) h += '<th' + (k === 0 ? ' class="daystart"' : '') + '>' + (k + 1) + '</th>';
    });
    h += '</tr></thead><tbody>';
    sch.classes.forEach(function (c, ci) {
      var col = TT.colorOf(ci);
      h += '<tr><td class="rowhead" style="background:#' + col + '">' + esc(c.title) + '</td>';
      days.forEach(function (d) {
        for (var k = 0; k < sch.periods[d]; k++) {
          var s = info.start[d] + k;
          h += cellHtml(sch, conf, ci, s, k === 0 ? ' daystart' : '', col);
        }
      });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  var SUBJ_COLORS = ['AED6F1', 'ABEBC6', 'F9E79F', 'F5B7B1', 'D2B4DE', 'A3E4D7', 'F8C471', 'D6EAF8', 'FAD7A0', 'C39BD3', '7FB3D5', 'D5F5E3', 'FCF3CF', 'FADBD8', 'E8DAEF', 'F5CBA7'];

  function subjectColor(name) {
    var i = tt.subject_catalog.indexOf(name);
    if (i < 0) { i = 0; for (var k = 0; k < name.length; k++) i = (i * 31 + name.charCodeAt(k)) >>> 0; }
    return SUBJ_COLORS[i % SUBJ_COLORS.length];
  }

  function dayGridHtml(sch, cellFn) {
    var maxP = Math.max.apply(null, sch.periods.concat([1]));
    var info = TT.slotInfo(sch.periods);
    var h = '<table class="grid big"><thead><tr><th class="rowhead">اليوم</th>';
    for (var k = 0; k < maxP; k++) h += '<th>' + TT.PERIOD_NAMES[k] + '</th>';
    h += '</tr></thead><tbody>';
    sch.days.forEach(function (d, di) {
      h += '<tr><td class="rowhead" style="background:#D6EAF8">' + esc(d) + '</td>';
      for (var k = 0; k < maxP; k++) {
        if (k >= sch.periods[di]) h += '<td class="cell unused"></td>';
        else h += cellFn(info.start[di] + k);
      }
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  function classGridHtml(sch, conf, ci) {
    return dayGridHtml(sch, function (s) {
      var j = sch.grids[ci][s];
      return cellHtml(sch, conf, ci, s, '', j < 0 ? 'FFFFFF' : subjectColor(sch.classes[ci].subjects[j].name));
    });
  }

  function teacherGridHtml(sch, name) {
    if (!name) return '<div class="empty">لا يوجد مدرسون في الجدول.</div>';
    return dayGridHtml(sch, function (s) {
      var hits = [];
      sch.classes.forEach(function (c, ci) {
        var j = sch.grids[ci][s];
        if (j >= 0 && c.subjects[j].teacher === name) hits.push(ci);
      });
      if (!hits.length) return '<td class="cell blank"><span class="s"></span></td>';
      var ci = hits[0], j = sch.grids[ci][s];
      var title = hits.length > 1 ? ' title="تعارض: ' + esc(hits.map(function (x) { return sch.classes[x].title; }).join('، ')) + '"' : '';
      return '<td class="cell' + (hits.length > 1 ? ' conflict' : '') + '" style="background:#' + TT.colorOf(ci) + '"' + title + '>' +
        '<span class="s">' + esc(hits.map(function (x) { return sch.classes[x].title; }).join(' + ')) + '</span>' +
        '<span class="t">' + esc(sch.classes[ci].subjects[j].name) + '</span></td>';
    });
  }

  function slotLabel(sch, s) {
    var info = TT.slotInfo(sch.periods);
    return 'يوم ' + sch.days[info.day[s]] + ' الحصة ' + TT.PERIOD_NAMES[info.per[s]];
  }

  function onGridClick(e) {
    var td = e.target.closest('td.cell[data-c]');
    if (!td || ui.view === 'teacher') return;
    var c = +td.dataset.c, s = +td.dataset.s;
    var sch = tt.schedule;
    var conf = TT.findConflicts(sch).cells[c + ',' + s];
    if (!ui.sel) {
      ui.sel = { c: c, s: s };
      if (conf) toast('تعارض: ' + conf.teacher + ' عنده حصة في ' + conf.others.map(function (o) { return sch.classes[o].title; }).join('، '), true);
    } else if (ui.sel.c === c && ui.sel.s === s) {
      ui.sel = null;
    } else if (ui.sel.c === c) {
      trySwap(c, ui.sel.s, s);
      ui.sel = null;
    } else {
      ui.sel = { c: c, s: s };
    }
    renderGrid();
  }

  /* التبديل اليدوي: يُرفض إذا جعل مدرساً في صفين بنفس الوقت */
  function trySwap(c, s1, s2) {
    var sch = tt.schedule, g = sch.grids[c];
    var a = g[s1], b = g[s2];
    if (a === b) return;
    function teacherAt(j) { return j >= 0 ? sch.classes[c].subjects[j].teacher : ''; }
    function clash(t, slot) {
      if (!t) return -1;
      for (var x = 0; x < sch.classes.length; x++) {
        if (x === c) continue;
        var j = sch.grids[x][slot];
        if (j >= 0 && sch.classes[x].subjects[j].teacher === t) return x;
      }
      return -1;
    }
    var checks = [[teacherAt(a), s2], [teacherAt(b), s1]];
    for (var i = 0; i < checks.length; i++) {
      var t = checks[i][0], slot = checks[i][1];
      if (t && t === teacherAt(i === 0 ? b : a)) continue; // نفس المدرس في الخانتين
      var x = clash(t, slot);
      if (x >= 0) {
        alertBox('لا يمكن التبديل: المدرس ' + t + ' عنده حصة في (' + sch.classes[x].title + ') ' + slotLabel(sch, slot) + '.', 'تعارض');
        return;
      }
    }
    g[s1] = b; g[s2] = a;
    persist();
    toast('تم التبديل');
  }

  /* ================= التصدير ================= */

  function exportDialog() {
    var sch = tt.schedule;
    if (!sch) return;
    var teachers = TT.scheduleTeachers(tt);
    var body = el('<div><div class="field"><div class="lbl">ماذا تريد أن تصدّر؟</div>' +
      '<label class="row"><input type="radio" name="ek" value="full" checked> الجدول الكامل (A3 بالعرض)</label>' +
      '<label class="row"><input type="radio" name="ek" value="class"> جدول صف / شعبة معينة (A4 بالعرض)</label>' +
      '<select class="ecls" style="margin:4px 28px 8px 0">' + sch.classes.map(function (c, i) { return '<option value="' + i + '">' + esc(c.title) + '</option>'; }).join('') + '</select>' +
      '<label class="row"><input type="radio" name="ek" value="teacher"> جدول مدرس معين (A4 بالعرض)</label>' +
      '<select class="etch" style="margin:4px 28px 8px 0">' + teachers.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label class="row"><input type="radio" name="ek" value="all"> كل الجداول (الكامل + كل صف + كل مدرس)</label>' +
      '</div>' + (TT.isStale(tt) ? '<div class="msg warn">⚠ تم تعديل البيانات بعد إنشاء الجدول. سيُصدَّر الجدول كما أُنشئ.</div>' : '') + '</div>');
    $('.ecls', body).value = String(ui.viewClass);
    if (ui.viewTeacher) $('.etch', body).value = ui.viewTeacher;

    function doExport(fmt) {
      var kind = $('input[name=ek]:checked', body).value, arg = null, label;
      if (kind === 'class') { arg = +$('.ecls', body).value; label = sch.classes[arg].title; }
      else if (kind === 'teacher') {
        arg = $('.etch', body).value;
        if (!arg) { toast('لا يوجد مدرسون', true); return false; }
        label = 'المدرس ' + arg;
      } else label = kind === 'full' ? 'الكامل' : 'كل الجداول';
      try {
        var tables = TT.exportTables(tt, kind, arg);
        var name = ('جدول الدروس - ' + label).replace(/[\\\/:*?"<>|]/g, '-');
        if (fmt === 'xlsx') saveFile(name + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', TT.buildXlsx(tables, P.school_name));
        else saveFile(name + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', TT.buildDocx(tables, P.school_name));
      } catch (err) {
        alertBox('حدث خطأ أثناء التصدير: ' + err.message);
      }
      return false;
    }

    modal({
      title: 'تصدير الجدول', body: body,
      buttons: [
        { text: '📗 Excel', cls: 'ok', onClick: function () { return doExport('xlsx'); } },
        { text: '📘 Word', cls: 'primary', onClick: function () { return doExport('docx'); } },
        { text: 'إغلاق' }
      ]
    });
  }

  /* ================= المشروع ================= */

  function projectMenu() {
    var body = el('<div class="menu-list">' +
      '<button class="btn" data-a="new">🆕 مشروع جديد</button>' +
      '<button class="btn" data-a="open">📂 فتح ملف...</button>' +
      '<button class="btn" data-a="save">💾 حفظ نسخة...</button>' +
      '<p class="muted">يُحفظ عملك تلقائياً بعد كل تغيير. استخدم «حفظ نسخة» لنقل البيانات إلى جهاز آخر (ملف JSON يعمل على الحاسوب والهاتف).</p></div>');
    modal({
      title: 'المشروع', body: body,
      onOpen: function (ov, close) {
        $$('[data-a]', body).forEach(function (b) {
          b.onclick = function () { close(); projectAction(b.dataset.a); };
        });
      }
    });
  }

  function projectAction(a) {
    if (a === 'new') {
      confirmBox('بدء مشروع جديد؟ ستُحذف كل البيانات الحالية (احفظ نسخة أولاً إن أردت).', 'مشروع جديد').then(function (ok) {
        if (!ok) return;
        setProject(TT.defaultProject());
        persist();
        showTab('days');
        toast('تم إنشاء مشروع جديد');
      });
    } else if (a === 'open') {
      var inp = $('#fileInput');
      inp.value = '';
      inp.click();
    } else if (a === 'save') {
      var name = (P.school_name ? P.school_name + ' - ' : '') + 'الجدول المدرسي.json';
      saveFile(name.replace(/[\\\/:*?"<>|]/g, '-'), 'application/json', new TextEncoder().encode(JSON.stringify(P, null, 1)));
    }
  }

  function openFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = JSON.parse(String(r.result).replace(/^﻿/, '')); } catch (e) {
        alertBox('الملف ليس ملف JSON صالحاً.');
        return;
      }
      if (!data || typeof data !== 'object' || !data.timetable) {
        alertBox('الملف لا يحتوي على بيانات جدول مدرسي.');
        return;
      }
      setProject(TT.normalize(data));
      persist();
      showTab(tt.schedule ? 'schedule' : 'days');
      toast('تم فتح الملف');
    };
    r.onerror = function () { alertBox('تعذرت قراءة الملف.'); };
    r.readAsText(file, 'utf-8');
  }

  /* ================= البدء ================= */

  function init() {
    setProject(loadStored());
    $$('#steps button').forEach(function (b) { b.onclick = function () { showTab(b.dataset.tab); }; });
    $('#menuBtn').onclick = projectMenu;
    $('#schoolName').onchange = function (e) { P.school_name = TT.clean(e.target.value); persist(); };
    $('#fileInput').onchange = function (e) { if (e.target.files[0]) openFile(e.target.files[0]); };
    showTab(tt.schedule ? 'schedule' : 'days');
  }

  // لاستخدام الاختبارات
  window.TTApp = {
    get project() { return P; },
    setProject: function (p) { setProject(TT.normalize(p)); persist(); renderTab(); },
    showTab: showTab
  };

  document.addEventListener('DOMContentLoaded', init);
})();
