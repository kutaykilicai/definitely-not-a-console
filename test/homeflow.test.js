// node test/homeflow.test.js — home during a game: settings, which processes get paused, when a
// hold counts, putting the window back, closing a game (graceful, then forced), helper events.
const assert = require('assert');
const H = require('../app/lib/homeflow.js');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };

(async () => {
  await ok('settings: both triggers on by default, 1 s hold, bad values fall back', () => {
    // 1.5.1: the Xbox button is one press; the helper reads it (3) unless dnac-padwatch runs (2: hold View+Menu only)
    assert.deepEqual(H.triggers({}), { esc: true, escMs: 1000, pad: 3, padMs: 1000 });
    assert.deepEqual(H.triggers({}, { guideByPadwatch: true }), { esc: true, escMs: 1000, pad: 2, padMs: 1000 });
    assert.deepEqual(H.triggers({ homePad: false }, { guideByPadwatch: true }).pad, 0);
    assert.deepEqual(H.triggers({ homePad: false }).pad, 3);
    assert.deepEqual(H.triggers({ homeGuide: false }).pad, 1);   // as before 1.5.1: hold Xbox or View+Menu
    assert.deepEqual(H.triggers({ homeEsc: false, homeEscMs: 1500, homePad: false, homeGuide: false, homePadMs: 'x' }), { esc: false, escMs: 1500, pad: 0, padMs: 1000 });
    assert.equal(H.holdMs(50), 1000); assert.equal(H.holdMs(99999), 1000);
    assert.deepEqual([600, 1000, 1500, 2000].map(H.nextHold), [1000, 1500, 2000, 600]);
  });
  await ok('per-game pause toggle defaults to off (1.5.1: the game keeps running behind the menu)', () => {
    assert.equal(H.suspendWanted({}), false); assert.equal(H.suspendWanted({ suspendInMenu: true }), true);
    assert.equal(H.suspendWanted({ suspendInMenu: false }), false); assert.equal(H.suspendWanted(null), false);
  });
  await ok('pause list: the game tree only, never Windows/Steam/LS/the menu', () => {
    const snap = { pids: [4, 100, 200, 300, 400, 500, 600], exes: ['system', 'shadps4.exe', 'explorer.exe', 'losslessscaling.exe', 'conhost.exe', 'game.exe', 'Steam.exe'] };
    assert.deepEqual(H.pausePids(snap, []), [100, 500]);
    assert.deepEqual(H.pausePids(snap, [500]), [100]);
    assert.deepEqual(H.pausePids({ pids: [7, 8] }, []), [7, 8]);   // no names reported: by pid only
    assert.deepEqual(H.pausePids(null), []);
  });
  await ok('a hold counts only with the game (or LS output) in front', () => {
    const g = { fg: 111, fgpid: 10, pids: [10, 11] };
    assert.ok(H.triggerAccepted(g, 111, null));
    assert.ok(H.triggerAccepted({ ...g, fg: 222 }, 111, null));            // another window of the game
    assert.ok(!H.triggerAccepted({ fg: 333, fgpid: 99, pids: [10] }, 111, { pids: [50] }));   // a browser
    assert.ok(H.triggerAccepted({ fg: 333, fgpid: 50, pids: [10] }, 111, { pids: [50] }));    // LS output window
    assert.ok(!H.triggerAccepted({ fg: 0, fgpid: 0, pids: [10] }, 111, null));
    assert.ok(H.triggerAccepted({ fg: '111', fgpid: 0, pids: [] }, 111, null));               // hwnd as string
  });
  await ok('window put back only when it filled the screen before and does not now', () => {
    const mon = { x: 0, y: 0, w: 2560, h: 1440 };
    const full = { x: 0, y: 0, w: 2560, h: 1440, mon };
    assert.deepEqual(H.placeBack(full, { x: 100, y: 100, w: 1280, h: 720, mon }), { x: 0, y: 0, w: 2560, h: 1440 });
    assert.equal(H.placeBack(full, full), null);
    assert.equal(H.placeBack({ x: 10, y: 10, w: 800, h: 600, mon }, { x: 300, y: 300, w: 800, h: 600, mon }), null);   // windowed game: left alone
    assert.equal(H.placeBack(null, full), null);
  });

  // closeGracefully with a scripted helper and a virtual clock
  const rig = ({ closesAfter = null, dies = true } = {}) => {
    let t = 0; let alive = [10, 11]; const calls = [];
    const helper = {
      resume: async (p) => { calls.push(`resume ${p}`); },
      closeWindow: async (h) => { calls.push(`close ${h}`); if (closesAfter != null) setT = t + closesAfter; },
      term: async (p) => { calls.push(`term ${p}`); if (dies) alive = []; },
    };
    let setT = null;
    const snapFn = async () => { if (setT != null && t >= setT) alive = []; return { pids: alive, windows: alive.length ? [{ hwnd: 77, pid: 10 }] : [] }; };
    return { calls, opts: { helper, snapFn, hwnd: 55, pickMain: (s) => s.windows[0] || null, sleep: async (ms) => { t += ms; }, now: () => t } };
  };
  await ok('close: resume first, WM_CLOSE to the main window, done when the tree is gone', async () => {
    const r = rig({ closesAfter: 1200 });
    const res = await H.closeGracefully(r.opts);
    assert.equal(res.how, 'closed'); assert.deepEqual(r.calls, ['resume 10,11', 'close 77']);
  });
  await ok('close: still running after 5 s -> ended', async () => {
    const r = rig({ closesAfter: null });
    const res = await H.closeGracefully(r.opts);
    assert.equal(res.how, 'killed'); assert.deepEqual(r.calls, ['resume 10,11', 'close 77', 'term 10,11']);
  });
  await ok('close: nothing running -> nothing sent', async () => {
    const r = rig(); const res = await H.closeGracefully({ ...r.opts, snapFn: async () => ({ pids: [] }) });
    assert.equal(res.how, 'gone'); assert.deepEqual(r.calls, []);
  });
  await ok('close: cannot end it -> reported as stuck', async () => {
    const r = rig({ dies: false }); const res = await H.closeGracefully(r.opts);
    assert.equal(res.how, 'stuck'); assert.deepEqual(res.pids, [10, 11]);
  });

  await ok('LS: the menu shortens only its own profiles\' Auto Scale delay', () => {
    const L = require('../app/lib/lossless.js');
    const x = '<GameProfiles><Profile><Title>Varsayılan</Title><AutoScaleDelay>0</AutoScaleDelay></Profile><Profile><Title>inFAMOUS (PS5 Menu)</Title><AutoScale>true</AutoScale><AutoScaleDelay>5</AutoScaleDelay></Profile></GameProfiles>';
    const y = L.setAutoScaleDelay(x, 'inFAMOUS (PS5 Menu)', L.MENU_DELAY);
    assert.equal(L.parseProfiles(y)[1].autoScaleDelay, 1); assert.equal(L.parseProfiles(y)[0].autoScaleDelay, 0);
    assert.equal(L.setAutoScaleDelay(x, 'yok', 1), x);
    assert.ok(L.isMenuProfile('inFAMOUS (PS5 Menu)') && L.isMenuProfile('X (Definitely Not PS5 Menu)') && !L.isMenuProfile('Varsayılan'));
  });
  await ok('helper protocol: event lines go to onEvent, replies stay in order', async () => {
    const { WinHelper } = require('../app/lib/winwatch.js');
    const { PassThrough } = require('stream'); const EventEmitter = require('events');
    const h = new WinHelper('x'); const written = [];
    const proc = new EventEmitter(); proc.stdout = new PassThrough(); proc.stdin = { write: (l) => written.push(l), on() {}, end() {} }; proc.kill = () => {};
    h._attach(proc); h._ensure = () => true;
    const events = []; h.onEvent = (e) => events.push(e);
    const p1 = h.request('a'); const p2 = h.request('b');
    proc.stdout.write('{"ok":true,"n":1}\n{"event":"home","src":"esc"}\n'); proc.stdout.write('{"ok":true,"n":2}\n');
    assert.equal((await p1).n, 1); assert.equal((await p2).n, 2);
    assert.deepEqual(events, [{ event: 'home', src: 'esc' }]);
    h.watch({ esc: true, escMs: 1500, pad: false }); h.watch({ esc: false, pad: 2, padMs: 600 }); h.watch({ esc: true, pad: true }); h.suspend([5, 6]); h.resume('all'); h.place(9, { x: 0, y: 0, w: 2560, h: 1440 });
    assert.deepEqual(written, ['a\n', 'b\n', 'watch 1 1500 0 1000\n', 'watch 0 1000 2 600\n', 'watch 1 1000 1 1000\n', 'suspend 5,6\n', 'resume all\n', 'place 9 0 0 2560 1440\n']);
    proc.stdout.write('{"ok":true}\n{"ok":true}\n{"ok":true}\n{"ok":true}\n{"ok":true}\n{"ok":true}\n');
  });
  console.log(`\n${n} homeflow tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
