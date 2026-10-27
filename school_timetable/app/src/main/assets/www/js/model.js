/* نموذج البيانات: القيم الافتراضية، توزيع الحصص التلقائي، التحليل، لقطة الجدول.
   يعمل في الواجهة وفي Web Worker معاً. */
var TT = self.TT || (self.TT = {});

(function (TT) {
  'use strict';

  TT.ALL_DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

  TT.DEFAULT_SUBJECTS = [
    'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنكليزية', 'الرياضيات', 'العلوم',
    'الاجتماعيات', 'التاريخ', 'الجغرافية', 'الفيزياء', 'الكيمياء', 'الأحياء', 'الحاسوب',
    'التربية الفنية', 'التربية الرياضية', 'الاقتصاد', 'الوطنية', 'اللغة الفرنسية'
  ];

  TT.GRADES = [
    'الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي',
    'الخامس الابتدائي', 'السادس الابتدائي', 'الأول المتوسط', 'الثاني المتوسط',
    'الثالث المتوسط', 'الرابع الإعدادي', 'الخامس الإعدادي', 'السادس الإعدادي'
  ];

  TT.SECTIONS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل'];

  TT.PERIOD_NAMES = [
    'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة',
    'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'
  ];

  TT.CLASS_COLORS = [
    'D6EAF8', 'D5F5E3', 'FCF3CF', 'FADBD8', 'E8DAEF', 'D1F2EB', 'FDEBD0', 'D4E6F1',
    'F9E79F', 'ABEBC6', 'F5CBA7', 'AED6F1', 'F5B7B1', 'D2B4DE', 'A3E4D7', 'F8C471',
    'EAEDED', 'FAD7A0', 'C39BD3', '7FB3D5'
  ];

  TT.MAX_PERIODS = 12;

  TT.uid = function () {
    return Math.random().toString(16).slice(2, 8);
  };

  TT.clean = function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  };

  TT.classTitle = function (c) {
    return c.section ? c.grade + ' - ' + c.section : c.grade;
  };

  TT.colorOf = function (i) {
    return TT.CLASS_COLORS[i % TT.CLASS_COLORS.length];
  };

  TT.defaultProject = function () {
    return {
      school_name: '',
      search_seconds: 30,
      timetable: {
        days: TT.ALL_DAYS.map(function (n) {
          return { name: n, enabled: n !== 'السبت' && n !== 'الجمعة', periods: 6 };
        }),
        teachers: [],
        teacher_specialty: {},
        subject_catalog: TT.DEFAULT_SUBJECTS.slice(),
        classes: [],
        schedule: null
      }
    };
  };

  function clampInt(v, lo, hi, def) {
    v = parseInt(v, 10);
    if (isNaN(v)) return def;
    return Math.max(lo, Math.min(hi, v));
  }
  TT.clampInt = clampInt;

  /* يكمل أي حقول ناقصة في ملف محمّل ويصحح القيم الخاطئة */
  TT.normalize = function (p) {
    var d = TT.defaultProject();
    if (!p || typeof p !== 'object') return d;
    var t = p.timetable && typeof p.timetable === 'object' ? p.timetable : {};
    var out = {
      school_name: TT.clean(p.school_name),
      search_seconds: clampInt(p.search_seconds, 5, 300, 30),
      timetable: {}
    };
    var o = out.timetable;

    var given = Array.isArray(t.days) ? t.days : null;
    if (given && given.length) {
      var byName = {};
      given.forEach(function (x) { if (x && x.name) byName[TT.clean(x.name)] = x; });
      o.days = TT.ALL_DAYS.map(function (n) {
        var x = byName[n];
        return x ? { name: n, enabled: !!x.enabled, periods: clampInt(x.periods, 1, TT.MAX_PERIODS, 6) }
                 : { name: n, enabled: false, periods: 6 };
      });
    } else {
      o.days = d.timetable.days;
    }

    o.teachers = [];
    (Array.isArray(t.teachers) ? t.teachers : []).forEach(function (n) {
      n = TT.clean(n);
      if (n && o.teachers.indexOf(n) < 0) o.teachers.push(n);
    });
    o.teacher_specialty = {};
    var sp = t.teacher_specialty && typeof t.teacher_specialty === 'object' ? t.teacher_specialty : {};
    Object.keys(sp).forEach(function (k) {
      var n = TT.clean(k), s = TT.clean(sp[k]);
      if (n && s) o.teacher_specialty[n] = s;
    });

    o.subject_catalog = [];
    (Array.isArray(t.subject_catalog) ? t.subject_catalog : d.timetable.subject_catalog).forEach(function (n) {
      n = TT.clean(n);
      if (n && o.subject_catalog.indexOf(n) < 0) o.subject_catalog.push(n);
    });

    o.classes = [];
    var ids = {};
    (Array.isArray(t.classes) ? t.classes : []).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var id = TT.clean(c.id) || TT.uid();
      while (ids[id]) id = TT.uid();
      ids[id] = 1;
      var cls = { id: id, grade: TT.clean(c.grade) || 'صف', section: TT.clean(c.section), subjects: [] };
      var seen = {};
      (Array.isArray(c.subjects) ? c.subjects : []).forEach(function (s) {
        if (!s) return;
        var name = TT.clean(s.name);
        if (!name || seen[name]) return;
        seen[name] = 1;
        var teacher = TT.clean(s.teacher);
        if (teacher && o.teachers.indexOf(teacher) < 0) o.teachers.push(teacher);
        if (o.subject_catalog.indexOf(name) < 0) o.subject_catalog.push(name);
        cls.subjects.push({ name: name, teacher: teacher, periods: clampInt(s.periods, 0, 99, 0) });
      });
      o.classes.push(cls);
    });

    o.schedule = normalizeSchedule(t.schedule);
    return out;
  };

  function normalizeSchedule(s) {
    if (!s || typeof s !== 'object') return null;
    if (!Array.isArray(s.days) || !Array.isArray(s.periods) || !Array.isArray(s.classes) || !Array.isArray(s.grids)) return null;
    if (s.days.length !== s.periods.length || s.classes.length !== s.grids.length) return null;
    var S = 0;
    s.periods.forEach(function (p) { S += clampInt(p, 0, TT.MAX_PERIODS, 0); });
    var ok = true;
    var classes = s.classes.map(function (c, i) {
      var subs = (Array.isArray(c.subjects) ? c.subjects : []).map(function (x) {
        return { name: TT.clean(x.name), teacher: TT.clean(x.teacher), count: clampInt(x.count, 0, 99, 0) };
      });
      var g = s.grids[i];
      if (!Array.isArray(g) || g.length !== S) ok = false;
      return { title: TT.clean(c.title), subjects: subs };
    });
    if (!ok) return null;
    var grids = s.grids.map(function (g, i) {
      var n = classes[i].subjects.length;
      return g.map(function (v) { v = parseInt(v, 10); return (isNaN(v) || v < 0 || v >= n) ? -1 : v; });
    });
    var out = {
      days: s.days.map(TT.clean),
      periods: s.periods.map(function (p) { return clampInt(p, 0, TT.MAX_PERIODS, 0); }),
      classes: classes,
      grids: grids
    };
    if (Array.isArray(s.class_ids) && s.class_ids.length === classes.length) out.class_ids = s.class_ids.slice();
    return out;
  }

  TT.enabledDays = function (tt) {
    return tt.days.filter(function (d) { return d.enabled; });
  };

  TT.weekSlots = function (tt) {
    var S = 0;
    TT.enabledDays(tt).forEach(function (d) { S += d.periods; });
    return S;
  };

  /* حساب العدد الفعلي لحصص كل مادة.
     الثابتة تأخذ عددها. التلقائية تقتسم الباقي حصة حصة وبالتناوب بين الصفوف
     (كل صف يعطي حصة لمادته التلقائية الأقل عدداً) دون أن يتجاوز نصاب المدرس S. */
  TT.computeCounts = function (tt) {
    var S = TT.weekSlots(tt);
    var counts = {}, load = {}, total = {};
    tt.teachers.forEach(function (t) { load[t] = 0; });

    tt.classes.forEach(function (c) {
      var arr = [], sum = 0;
      c.subjects.forEach(function (s) {
        var n = s.periods > 0 ? s.periods : 0;
        arr.push(n);
        sum += n;
        if (s.teacher) load[s.teacher] = (load[s.teacher] || 0) + n;
      });
      counts[c.id] = arr;
      total[c.id] = sum;
    });

    var progress = true;
    while (progress) {
      progress = false;
      for (var i = 0; i < tt.classes.length; i++) {
        var c = tt.classes[i];
        if (total[c.id] >= S) continue;
        var arr = counts[c.id], best = -1;
        for (var j = 0; j < c.subjects.length; j++) {
          var s = c.subjects[j];
          if (s.periods > 0) continue;
          if (s.teacher && load[s.teacher] >= S) continue;
          if (best < 0 || arr[j] < arr[best]) best = j;
        }
        if (best < 0) continue;
        arr[best]++;
        total[c.id]++;
        var tn = c.subjects[best].teacher;
        if (tn) load[tn]++;
        progress = true;
      }
    }
    return { S: S, counts: counts, teacherLoad: load, classTotal: total };
  };

  /* لقطة البيانات التي يُبنى عليها الجدول */
  TT.buildSnapshot = function (tt, cc) {
    cc = cc || TT.computeCounts(tt);
    var days = TT.enabledDays(tt);
    return {
      days: days.map(function (d) { return d.name; }),
      periods: days.map(function (d) { return d.periods; }),
      class_ids: tt.classes.map(function (c) { return c.id; }),
      classes: tt.classes.map(function (c) {
        return {
          title: TT.classTitle(c),
          subjects: c.subjects.map(function (s, j) {
            return { name: s.name, teacher: s.teacher, count: cc.counts[c.id][j] };
          })
        };
      })
    };
  };

  function snapKey(s) {
    return JSON.stringify([s.days, s.periods, s.classes.map(function (c) {
      return [c.title, c.subjects.map(function (x) { return [x.name, x.teacher, x.count]; })];
    })]);
  }

  TT.isStale = function (tt) {
    if (!tt.schedule) return false;
    return snapKey(tt.schedule) !== snapKey(TT.buildSnapshot(tt));
  };

  /* معلومات الخانات: كل خانة = (يوم، حصة)، مرتبة يوماً بعد يوم */
  TT.slotInfo = function (periods) {
    var day = [], per = [], start = [];
    var s = 0;
    periods.forEach(function (p, d) {
      start.push(s);
      for (var k = 0; k < p; k++) { day.push(d); per.push(k); s++; }
    });
    return { S: s, day: day, per: per, start: start };
  };

  /* حساب التعارضات في جدول محفوظ: map "c,s" -> [أسماء الصفوف الأخرى] */
  TT.findConflicts = function (sch) {
    var info = TT.slotInfo(sch.periods);
    var res = { count: 0, cells: {} };
    for (var s = 0; s < info.S; s++) {
      var byT = {};
      for (var c = 0; c < sch.classes.length; c++) {
        var j = sch.grids[c][s];
        if (j < 0) continue;
        var t = sch.classes[c].subjects[j].teacher;
        if (!t) continue;
        (byT[t] = byT[t] || []).push(c);
      }
      Object.keys(byT).forEach(function (t) {
        var list = byT[t];
        if (list.length < 2) return;
        res.count += list.length - 1;
        list.forEach(function (c) {
          res.cells[c + ',' + s] = { teacher: t, others: list.filter(function (x) { return x !== c; }) };
        });
      });
    }
    return res;
  };

  /* تحليل البيانات قبل الإنشاء */
  TT.analyze = function (tt) {
    var cc = TT.computeCounts(tt), S = cc.S;
    var errors = [], warnings = [];
    var days = TT.enabledDays(tt);

    if (!days.length) errors.push('لا توجد أيام دوام مفعّلة.');
    if (!tt.classes.length) errors.push('لا توجد صفوف.');

    var classRows = tt.classes.map(function (c) {
      var tot = cc.classTotal[c.id];
      var st;
      if (!c.subjects.length) st = 'بلا مواد';
      else if (tot > S) st = 'زائد';
      else if (tot === S) st = 'مكتمل';
      else st = 'فيه فراغ';
      return { id: c.id, title: TT.classTitle(c), total: tot, empty: Math.max(0, S - tot), status: st };
    });

    classRows.forEach(function (r) {
      if (r.total > S) errors.push('الصف (' + r.title + ') مجموع حصصه ' + r.total + ' أكبر من المتاح ' + S + '.');
    });

    var teacherRows = tt.teachers.map(function (t) {
      var l = cc.teacherLoad[t] || 0, st;
      if (l > S) st = 'أكبر من المتاح';
      else if (l === 0) st = 'لا يدرّس';
      else if (l === S) st = 'ممتلئ';
      else st = 'مناسب';
      return { name: t, load: l, status: st };
    });
    teacherRows.forEach(function (r) {
      if (r.load > S) errors.push('المدرس (' + r.name + ') نصابه ' + r.load + ' أكبر من المتاح ' + S + '.');
    });

    tt.classes.forEach(function (c, ci) {
      var title = TT.classTitle(c);
      if (!c.subjects.length) { warnings.push('الصف (' + title + ') بلا مواد.'); return; }
      c.subjects.forEach(function (s, j) {
        if (!s.teacher) warnings.push('مادة (' + s.name + ') في الصف (' + title + ') بلا مدرس.');
        if (cc.counts[c.id][j] === 0) warnings.push('مادة (' + s.name + ') في الصف (' + title + ') لم يبق لها حصص.');
      });
      var r = classRows[ci];
      if (r.total < S) warnings.push('الصف (' + title + ') فيه ' + r.empty + ' حصة فارغة.');
    });

    return {
      S: S, cc: cc, errors: errors, warnings: warnings,
      classRows: classRows, teacherRows: teacherRows,
      suggestions: TT.suggest(tt, S)
    };
  };

  /* اقتراح تعديلات: إنقاص 1 من المادة الأكبر عدداً حتى يصبح المجموع ≤ S */
  TT.suggest = function (tt, S) {
    var newP = {}; // "classId|j" -> رقم مقترح
    var involved = {};
    function key(c, j) { return c.id + '|' + j; }
    tt.classes.forEach(function (c) {
      c.subjects.forEach(function (s, j) { if (s.periods > 0) newP[key(c, j)] = s.periods; });
    });

    function reduce(items) { // items: [{c, j}]
      var sum = 0;
      items.forEach(function (it) { sum += newP[key(it.c, it.j)]; });
      while (sum > S) {
        var best = null;
        items.forEach(function (it) {
          var v = newP[key(it.c, it.j)];
          if (v > 1 && (!best || v > newP[key(best.c, best.j)])) best = it;
        });
        if (!best) break;
        newP[key(best.c, best.j)]--;
        sum--;
      }
    }

    tt.classes.forEach(function (c) {
      var items = [], sum = 0;
      c.subjects.forEach(function (s, j) { if (s.periods > 0) { items.push({ c: c, j: j }); sum += s.periods; } });
      if (sum > S) { items.forEach(function (it) { involved[key(it.c, it.j)] = it; }); reduce(items); }
    });

    tt.teachers.forEach(function (t) {
      var items = [], sum = 0;
      tt.classes.forEach(function (c) {
        c.subjects.forEach(function (s, j) {
          if (s.teacher === t && s.periods > 0) { items.push({ c: c, j: j }); sum += newP[key(c, j)]; }
        });
      });
      if (sum > S) { items.forEach(function (it) { involved[key(it.c, it.j)] = it; }); reduce(items); }
    });

    return Object.keys(involved).map(function (k) {
      var it = involved[k], s = it.c.subjects[it.j];
      return {
        classId: it.c.id, classTitle: TT.classTitle(it.c), index: it.j,
        subject: s.name, teacher: s.teacher, current: s.periods, suggested: newP[k]
      };
    });
  };

  /* تغيير اسم مدرس في كل مكان */
  TT.renameTeacher = function (tt, oldName, newName) {
    var i = tt.teachers.indexOf(oldName);
    if (i >= 0) tt.teachers[i] = newName;
    if (tt.teacher_specialty[oldName] !== undefined) {
      tt.teacher_specialty[newName] = tt.teacher_specialty[oldName];
      delete tt.teacher_specialty[oldName];
    }
    tt.classes.forEach(function (c) {
      c.subjects.forEach(function (s) { if (s.teacher === oldName) s.teacher = newName; });
    });
    if (tt.schedule) {
      tt.schedule.classes.forEach(function (c) {
        c.subjects.forEach(function (s) { if (s.teacher === oldName) s.teacher = newName; });
      });
    }
  };

  TT.deleteTeacher = function (tt, name) {
    tt.teachers = tt.teachers.filter(function (t) { return t !== name; });
    delete tt.teacher_specialty[name];
    tt.classes.forEach(function (c) {
      c.subjects.forEach(function (s) { if (s.teacher === name) s.teacher = ''; });
    });
  };

  /* المدرسون مرتبين: المختصون بالمادة أولاً */
  TT.teachersFor = function (tt, subject) {
    var a = [], b = [];
    tt.teachers.forEach(function (t) {
      (tt.teacher_specialty[t] === subject ? a : b).push(t);
    });
    return { specialists: a, others: b };
  };
})(TT);
