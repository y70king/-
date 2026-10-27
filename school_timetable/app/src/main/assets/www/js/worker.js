/* يشغّل البحث في الخلفية على دفعات قصيرة حتى تصل رسالة «إيقاف» بين الدفعات */
importScripts('model.js', 'engine.js');

var solver = null, stopFlag = false;

self.onmessage = function (e) {
  var m = e.data;
  if (m.cmd === 'start') {
    stopFlag = false;
    solver = TT.createSolver(m.snapshot, m.seconds);
    if (solver.error) { self.postMessage({ type: 'error', message: solver.error }); return; }
    loop();
  } else if (m.cmd === 'stop') {
    stopFlag = true;
  }
};

function loop() {
  var finished = solver.run(150);
  self.postMessage({ type: 'progress', progress: solver.progress() });
  if (finished || stopFlag) {
    self.postMessage({ type: 'done', result: solver.result(), progress: solver.progress() });
    solver = null;
  } else {
    setTimeout(loop, 0);
  }
}
