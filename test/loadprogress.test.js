// node test/loadprogress.test.js — the game's loading progress on the launch screen (lib/loadprogress.js)
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const L = require('../app/lib/loadprogress.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exit(1); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps5lp-'));
const game = (extra = {}) => ({ id: 'g', title: 'G', exe: path.join(tmp, 'SotC.exe'), args: '--play', workingDir: tmp, ...extra });

ok('SotC port is found on its own (SotC.exe --play); off with false; other games have none', () => {
  const c = L.resolve(game());
  assert.equal(c.preset, 'sotc-port'); assert.equal(c.log, path.join(tmp, 'user', 'last_run.log'));
  assert.ok(c.ready.test('GPU: window and Vulkan presenter ready; SDK 0x04508101, 327 HLE symbols'));
  assert.equal(L.resolve(game({ loadProgress: false })), null);
  assert.equal(L.resolve(game({ args: '' })), null);
  assert.equal(L.resolve({ id: 'x', exe: 'C:\\Games\\other.exe' }), null);
  assert.equal(L.resolve(game({ exe: 'C:\\x\\shadPS4.exe', loadProgress: 'sotc-port' })).preset, 'sotc-port');
  assert.equal(L.resolve(game({ loadProgress: { log: 'a.log', percent: '(' } })).percent, null);   // bad regex: ignored
});

ok('cache items: newest sub folder, by extension', () => {
  const d = path.join(tmp, 'user', 'cache');
  fs.mkdirSync(path.join(d, 'OLD'), { recursive: true }); fs.mkdirSync(path.join(d, 'NEW'), { recursive: true });
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(d, 'OLD', `${i}.key`), '');
  for (let i = 0; i < 3; i++) { fs.writeFileSync(path.join(d, 'NEW', `${i}.key`), ''); fs.writeFileSync(path.join(d, 'NEW', `${i}.spv`), ''); }
  const past = new Date(Date.now() - 60e3); fs.utimesSync(path.join(d, 'OLD'), past, past);
  assert.equal(L.countItems({ dir: d, ext: '.key' }), 3);
  assert.equal(L.countItems({ dir: path.join(tmp, 'nope'), ext: '.key' }), 0);
});

ok('estimate: learned per item first, then the first guess; never 100 on its own', () => {
  const cfg = L.resolve(game());
  assert.equal(L.expectedMs(cfg, 1658, null), 1658 * 28);
  assert.equal(L.expectedMs(cfg, 1000, { msPerItem: 30, ms: 1 }), 30000);
  assert.equal(L.expectedMs(cfg, 0, { msPerItem: 30 }), null);   // empty cache: nothing to rebuild
  assert.equal(L.expectedMs({ ...cfg, count: null }, 0, { ms: 9000 }), 9000);
  assert.equal(L.estimatePct(5000, 10000), 48.5);
  assert.ok(L.estimatePct(10000, 10000) === 97 && L.estimatePct(60000, 10000) < 99 && L.estimatePct(60000, 10000) > 98);
  assert.equal(L.estimatePct(1000, null), null);
  const a = L.learn(null, 46000, 1658); assert.equal(a.ms, 46000); assert.ok(Math.abs(a.msPerItem - 27.74) < 0.01);
  const b = L.learn(a, 40000, 1658); assert.equal(b.ms, 42000);
  assert.equal(L.learn(a, 0, 5), a);
});

function fakeClock(t) { const c = () => c.t; c.t = t; return c; }
ok('watcher: only this launch\'s log, percent lines, ready line', () => {
  const log = path.join(tmp, 'p.log'); const now = fakeClock(Date.now());
  fs.writeFileSync(log, 'old run\nGPU: window and Vulkan presenter ready\n');
  const old = new Date(now.t - 30e3); fs.utimesSync(log, old, old);
  const cfg = L.resolve(game({ loadProgress: { log, ready: 'presenter ready', percent: 'shaders (\\d+)%', noLogMs: 5000 } }));
  const w = new L.Watcher(cfg, { t0: now.t, now });
  assert.equal(w.poll().state, 'nolog');   // the previous launch's log is not read
  fs.writeFileSync(log, 'Settings: x\nCompiling shaders 10%\nCompiling shad');
  now.t += 500; let v = w.poll(); assert.equal(v.state, 'run'); assert.equal(v.pct, 10); assert.equal(v.estimate, false);
  fs.appendFileSync(log, 'ers 40%\n'); now.t += 500; assert.equal(w.poll().pct, 40);
  fs.appendFileSync(log, 'GPU: window and Vulkan presenter ready\n'); now.t += 500;
  v = w.poll(); assert.equal(v.state, 'ready'); assert.equal(v.pct, 100); assert.equal(w.measured(), 1500); assert.ok(w.finished());
});

ok('watcher: estimate from the cache size, counter lines, no log, failure, time limit', () => {
  const log = path.join(tmp, 'e.log'); const now = fakeClock(Date.now());
  const cfg = L.resolve(game({ loadProgress: 'sotc-port' })); cfg.log = log;
  const w = new L.Watcher(cfg, { t0: now.t, now });   // 3 items x 28 ms
  fs.writeFileSync(log, 'Settings: x\n'); now.t += 42; let v = w.poll();
  assert.equal(v.state, 'run'); assert.equal(v.estimate, true); assert.equal(v.pct, 49); assert.equal(v.items, 3);
  fs.appendFileSync(log, '[exit code 3 = 0x3]\n'); now.t += 10; assert.equal(w.poll().state, 'failed');
  const c2 = { ...cfg, log: path.join(tmp, 'c.log'), counter: /(\d+) \/ (\d+)/gm, ready: null, maxMs: 1000 };
  fs.writeFileSync(c2.log, 'pipelines 50 / 200\n');
  const w2 = new L.Watcher(c2, { t0: now.t, now }); v = w2.poll(); assert.equal(v.pct, 25); assert.equal(v.total, 200);
  now.t += 2000; assert.equal(w2.poll().state, 'timeout');
  const w3 = new L.Watcher({ ...cfg, log: path.join(tmp, 'none.log'), noLogMs: 1000 }, { t0: now.t, now });
  assert.equal(w3.poll().state, 'nolog'); now.t += 1500; assert.equal(w3.poll().state, 'gone');
  const w4 = new L.Watcher({ ...cfg, log: path.join(tmp, 'q.log'), percent: /(\d+)%/gm, ready: null }, { t0: Date.now(), now });
  fs.writeFileSync(path.join(tmp, 'q.log'), '99%\n100%\n'); assert.equal(w4.poll().state, 'ready');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${n} loadprogress tests passed`);
