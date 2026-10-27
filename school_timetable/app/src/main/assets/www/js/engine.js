/* محرك إنشاء الجدول.
   المرحلة 1: تلوين حواف الرسم الثنائي (صف ↔ مدرس) بـ S لون = جدول بلا تعارض (مبرهنة كونيغ).
   المرحلة 2: محاكاة التلدين لتحسين التوزيع (تكرار المادة في اليوم، الفراغات بين الدروس). */
var TT = self.TT || (self.TT = {});

(function (TT) {
  'use strict';

  var W_CONFLICT = 100, W_REPEAT = 6, W_GAP = 2;
  var T_START = 3.0, T_DECAY = 0.99995, T_MIN = 0.05;
  var RESTART_AFTER = 150000, STOP_AFTER = 60000;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* تحويل اللقطة إلى مسألة رقمية */
  TT.prepareProblem = function (snap) {
    var info = TT.slotInfo(snap.periods);
    var S = info.S, D = snap.periods.length, C = snap.classes.length;
    var tid = {}, T = 0;
    var subjTeacher = [], off = [], lim = [], lessons = [];
    var nSub = 0;
    snap.classes.forEach(function (c) {
      c.subjects.forEach(function (s) {
        if (s.teacher && tid[s.teacher] === undefined) tid[s.teacher] = T++;
      });
    });
    var realT = T;
    snap.classes.forEach(function (c, ci) {
      off.push(nSub);
      var list = [];
      c.subjects.forEach(function (s, j) {
        // المادة بدون مدرس تُربط بمدرس وهمي خاص بها
        subjTeacher.push(s.teacher ? tid[s.teacher] : T++);
        lim.push(D ? Math.ceil(s.count / D) : 0);
        for (var k = 0; k < s.count; k++) list.push(j);
        nSub++;
      });
      lessons.push(list);
    });
    var tLoad = new Array(T).fill(0);
    snap.classes.forEach(function (c, ci) {
      c.subjects.forEach(function (s, j) { tLoad[subjTeacher[off[ci] + j]] += s.count; });
    });
    return {
      S: S, D: D, C: C, T: T, realT: realT, info: info, dayLen: snap.periods.slice(),
      subjTeacher: subjTeacher, off: off, lim: lim, lessons: lessons, tLoad: tLoad, nSub: nSub
    };
  };

  TT.validateProblem = function (P) {
    if (!P.S) return 'لا توجد حصص في الأسبوع.';
    for (var c = 0; c < P.C; c++) if (P.lessons[c].length > P.S) return 'صف حصصه أكثر من المتاح.';
    for (var t = 0; t < P.T; t++) if (P.tLoad[t] > P.S) return 'مدرس نصابه أكثر من المتاح.';
    return null;
  };

  /* المرحلة 1: تلوين الحواف */
  TT.edgeColoring = function (P) {
    var S = P.S, C = P.C, T = P.T;
    var cls = new Int32Array(C * S).fill(-1);
    var tch = new Int32Array(T * S).fill(-1);
    var eu = [], ev = [], ej = [];
    for (var c = 0; c < C; c++) {
      P.lessons[c].forEach(function (j) {
        eu.push(c); ev.push(P.subjTeacher[P.off[c] + j]); ej.push(j);
      });
    }
    var E = eu.length;
    var col = new Int32Array(E).fill(-1);
    var order = shuffle(Array.from({ length: E }, function (_, i) { return i; }));
    var perm = shuffle(Array.from({ length: S }, function (_, i) { return i; }));

    function freeAt(arr, x) {
      var start = (Math.random() * S) | 0;
      for (var k = 0; k < S; k++) {
        var color = perm[(start + k) % S];
        if (arr[x * S + color] < 0) return color;
      }
      return -1;
    }
    function set(e, color) {
      col[e] = color; cls[eu[e] * S + color] = e; tch[ev[e] * S + color] = e;
    }

    for (var oi = 0; oi < E; oi++) {
      var e = order[oi], u = eu[e], v = ev[e];
      var a = freeAt(cls, u), b = freeAt(tch, v);
      if (a < 0 || b < 0) return null;
      if (tch[v * S + a] >= 0) {
        // قلب ألوان المسار المتناوب (a/b) الذي يبدأ من المدرس v
        var path = [], x = v, isT = true, cc = a;
        while (true) {
          var f = isT ? tch[x * S + cc] : cls[x * S + cc];
          if (f < 0) break;
          path.push(f);
          x = isT ? eu[f] : ev[f];
          isT = !isT;
          cc = cc === a ? b : a;
        }
        var olds = path.map(function (f) { return col[f]; });
        path.forEach(function (f) {
          cls[eu[f] * S + col[f]] = -1; tch[ev[f] * S + col[f]] = -1;
        });
        path.forEach(function (f, k) { set(f, olds[k] === a ? b : a); });
      }
      set(e, a);
    }

    var grid = new Int16Array(C * S).fill(-1);
    for (var i = 0; i < E; i++) grid[eu[i] * S + col[i]] = ej[i];
    return grid;
  };

  /* المرحلة 2: الباحث (محاكاة التلدين) — يعمل على دفعات حتى لا تتجمد الواجهة */
  TT.createSolver = function (snap, seconds) {
    var P = TT.prepareProblem(snap);
    var err = TT.validateProblem(P);
    if (err) return { error: err };

    var S = P.S, C = P.C, D = P.D;
    var slotDay = P.info.day, dayStart = P.info.start, dayLen = P.dayLen;
    var subjT = P.subjTeacher, off = P.off, lim = P.lim;
    var nSubOf = snap.classes.map(function (c) { return c.subjects.length; });
    var movable = [];
    for (var c0 = 0; c0 < C; c0++) if (P.lessons[c0].length > 0 && S > 1) movable.push(c0);

    var g, occ, dayCnt, conf, cost, temp, runBest, noImpRun;
    var best = null, bestConf = Infinity, bestCost = Infinity, noImpGlobal = 0;
    var steps = 0, restarts = 0;
    var t0 = Date.now(), limitMs = Math.max(1, seconds) * 1000;
    var done = false;

    function tOf(c, j) { return subjT[off[c] + j]; }

    function dayPen(c, d) {
      var p = 0, base = off[c];
      for (var j = 0; j < nSubOf[c]; j++) {
        var x = dayCnt[(base + j) * D + d] - lim[base + j];
        if (x > 0) p += x;
      }
      return W_REPEAT * p;
    }
    function gapPen(c, d) {
      var st = c * S + dayStart[d], n = dayLen[d], last = -1, k;
      for (k = n - 1; k >= 0; k--) if (g[st + k] >= 0) { last = k; break; }
      var blanks = 0;
      for (k = 0; k < last; k++) if (g[st + k] < 0) blanks++;
      return W_GAP * blanks;
    }

    function init() {
      var grid = null;
      for (var tries = 0; tries < 5 && !grid; tries++) grid = TT.edgeColoring(P);
      if (!grid) return false;
      g = grid;
      occ = new Int16Array(P.T * S);
      dayCnt = new Int16Array(P.nSub * D);
      for (var c = 0; c < C; c++) {
        for (var s = 0; s < S; s++) {
          var j = g[c * S + s];
          if (j < 0) continue;
          occ[tOf(c, j) * S + s]++;
          dayCnt[(off[c] + j) * D + slotDay[s]]++;
        }
      }
      conf = 0;
      for (var i = 0; i < occ.length; i++) if (occ[i] > 1) conf += occ[i] - 1;
      cost = 0;
      for (c = 0; c < C; c++) for (var d = 0; d < D; d++) cost += dayPen(c, d) + gapPen(c, d);
      temp = T_START;
      runBest = W_CONFLICT * conf + cost;
      noImpRun = 0;
      consider();
      return true;
    }

    function consider() {
      if (conf < bestConf || (conf === bestConf && cost < bestCost)) {
        bestConf = conf; bestCost = cost; best = new Int16Array(g); noImpGlobal = 0;
        return true;
      }
      return false;
    }

    function confAt(t, s) { var o = occ[t * S + s]; return o > 1 ? o - 1 : 0; }

    function pickConflictCell() {
      var n = occ.length, start = (Math.random() * n) | 0;
      for (var k = 0; k < n; k++) {
        var i = (start + k) % n;
        if (occ[i] > 1) {
          var t = (i / S) | 0, s = i % S;
          var cand = [];
          for (var c = 0; c < C; c++) { var j = g[c * S + s]; if (j >= 0 && tOf(c, j) === t) cand.push(c); }
          if (cand.length) return [cand[(Math.random() * cand.length) | 0], s];
        }
      }
      return null;
    }

    function localConf(pairs) {
      var sum = 0;
      for (var i = 0; i < pairs.length; i += 2) sum += confAt(pairs[i], pairs[i + 1]);
      return sum;
    }

    function swap(c, s1, s2) {
      var a = g[c * S + s1], b = g[c * S + s2], d1 = slotDay[s1], d2 = slotDay[s2];
      if (a >= 0) {
        occ[tOf(c, a) * S + s1]--; occ[tOf(c, a) * S + s2]++;
        dayCnt[(off[c] + a) * D + d1]--; dayCnt[(off[c] + a) * D + d2]++;
      }
      if (b >= 0) {
        occ[tOf(c, b) * S + s2]--; occ[tOf(c, b) * S + s1]++;
        dayCnt[(off[c] + b) * D + d2]--; dayCnt[(off[c] + b) * D + d1]++;
      }
      g[c * S + s1] = b; g[c * S + s2] = a;
    }

    /* حركة سلسلة كمبه: تبديل الخانتين s1 و s2 في كل الصفوف المترابطة عبر المدرسين.
       تحافظ على عدم التعارض، فتسمح بالتحسين حتى لو كان المدرسون ممتلئين. */
    function classWith(t, s) {
      for (var c = 0; c < C; c++) { var j = g[c * S + s]; if (j >= 0 && tOf(c, j) === t) return c; }
      return -1;
    }
    function kempe(c, s1, s2) {
      var inChain = new Uint8Array(C), chain = [c], q = [c];
      inChain[c] = 1;
      while (q.length) {
        var x = q.pop();
        for (var k = 0; k < 2; k++) {
          var sa = k ? s2 : s1, sb = k ? s1 : s2, j = g[x * S + sa];
          if (j < 0) continue;
          var y = classWith(tOf(x, j), sb);
          if (y >= 0 && !inChain[y]) { inChain[y] = 1; chain.push(y); q.push(y); }
        }
      }
      var d1 = slotDay[s1], d2 = slotDay[s2];
      function pen() {
        var p = 0;
        for (var i = 0; i < chain.length; i++) {
          var cc = chain[i];
          p += dayPen(cc, d1) + gapPen(cc, d1);
          if (d2 !== d1) p += dayPen(cc, d2) + gapPen(cc, d2);
        }
        return p;
      }
      var kb = pen();
      chain.forEach(function (cc) { swap(cc, s1, s2); });
      var dCost = pen() - kb;
      if (dCost <= 0 || Math.random() < Math.exp(-dCost / temp)) cost += dCost;
      else chain.forEach(function (cc) { swap(cc, s1, s2); });
    }

    function step() {
      steps++;
      var c, s1, s2;
      if (conf === 0 && movable.length && Math.random() < 0.5) {
        c = movable[(Math.random() * movable.length) | 0];
        s1 = (Math.random() * S) | 0;
        s2 = (Math.random() * (S - 1)) | 0;
        if (s2 >= s1) s2++;
        if (g[c * S + s1] !== g[c * S + s2]) kempe(c, s1, s2);
        temp = Math.max(T_MIN, temp * T_DECAY);
        afterStep();
        return;
      }
      if (conf > 0 && Math.random() < 0.8) {
        var pc = pickConflictCell();
        if (!pc) return;
        c = pc[0]; s1 = pc[1];
      } else {
        if (!movable.length) return;
        c = movable[(Math.random() * movable.length) | 0];
        s1 = (Math.random() * S) | 0;
      }
      s2 = (Math.random() * (S - 1)) | 0;
      if (s2 >= s1) s2++;
      var a = g[c * S + s1], b = g[c * S + s2];
      if (a === b) return;

      var pairs = [];
      var ta = a >= 0 ? tOf(c, a) : -1, tb = b >= 0 ? tOf(c, b) : -1;
      if (ta >= 0) pairs.push(ta, s1, ta, s2);
      if (tb >= 0 && tb !== ta) pairs.push(tb, s1, tb, s2);
      var d1 = slotDay[s1], d2 = slotDay[s2];

      var cb = localConf(pairs);
      var kb = dayPen(c, d1) + gapPen(c, d1) + (d2 !== d1 ? dayPen(c, d2) + gapPen(c, d2) : 0);
      swap(c, s1, s2);
      var ca = localConf(pairs);
      var ka = dayPen(c, d1) + gapPen(c, d1) + (d2 !== d1 ? dayPen(c, d2) + gapPen(c, d2) : 0);

      var dConf = ca - cb, dCost = ka - kb;
      var delta = W_CONFLICT * dConf + dCost;
      if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
        conf += dConf; cost += dCost;
      } else {
        swap(c, s1, s2);
      }
      temp = Math.max(T_MIN, temp * T_DECAY);
      afterStep();
    }

    function afterStep() {
      var e = W_CONFLICT * conf + cost;
      if (e < runBest) { runBest = e; noImpRun = 0; } else noImpRun++;
      if (!consider()) noImpGlobal++;
    }

    if (!init()) return { error: 'تعذر إنشاء جدول أولي.' };

    function finished() {
      if (bestConf === 0 && bestCost === 0) return 'optimal';
      if (bestConf === 0 && noImpGlobal >= STOP_AFTER) return 'converged';
      if (Date.now() - t0 >= limitMs) return 'timeout';
      return null;
    }

    return {
      /* تشغيل دفعة لمدة budgetMs تقريباً. ترجع true عند الانتهاء */
      run: function (budgetMs) {
        if (done) return true;
        var end = Date.now() + budgetMs;
        while (Date.now() < end) {
          for (var i = 0; i < 2000; i++) step();
          if (noImpRun >= RESTART_AFTER) { restarts++; init(); }
          var why = finished();
          if (why) { done = why; return true; }
        }
        return false;
      },
      progress: function () {
        return {
          steps: steps, restarts: restarts, elapsed: (Date.now() - t0) / 1000,
          bestConflicts: bestConf, bestCost: bestCost, temp: temp, done: done
        };
      },
      result: function () {
        var grids = [];
        for (var c = 0; c < C; c++) grids.push(Array.prototype.slice.call(best.subarray(c * S, (c + 1) * S)));
        return { grids: grids, conflicts: bestConf, cost: bestCost };
      }
    };
  };
})(TT);
