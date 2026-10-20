// node test/winwatch.test.js -- game window wait logic and Lossless Scaling helpers (no Windows needed)
const assert = require('assert');
const W = require('../app/lib/winwatch.js');
const LS = require('../app/lib/lossless.js');
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };

const MON = { x: 0, y: 0, w: 2560, h: 1440 };
const win = (o = {}) => ({ hwnd: 100, pid: 10, exe: 'game.exe', cls: 'SDL_app', visible: true, minimized: false, cloaked: false, tool: false, owned: false, x: 0, y: 0, w: 2560, h: 1440, mon: MON, ...o });
const snap = (windows, fg = 0) => ({ ok: true, fg, pids: [10], windows });

// Simulated clock + scripted snapshots: script(t) returns the snapshot at time t.
async function run(script, opts) {
  let t = 0;
  return W.waitForGameWindow(async () => script(t), opts, { now: () => t, sleep: async (ms) => { t += ms; } });
}

(async () => {
  await ok('coversMonitor: borderless yes, 1280x720 no, other monitor yes', () => {
    assert.equal(W.coversMonitor(win()), true);
    assert.equal(W.coversMonitor(win({ x: 640, y: 360, w: 1280, h: 720 })), false);
    assert.equal(W.coversMonitor(win({ x: -1920, y: 236, w: 1920, h: 1080, mon: { x: -1920, y: 236, w: 1920, h: 1080 } })), true);
  });
  await ok('pickMain ignores consoles, tool/owned/tiny/cloaked windows, prefers foreground', () => {
    const s = snap([win({ hwnd: 1, cls: 'ConsoleWindowClass' }), win({ hwnd: 2, tool: true }), win({ hwnd: 3, w: 100, h: 50 }), win({ hwnd: 4, cloaked: true }), win({ hwnd: 5, w: 800, h: 600 }), win({ hwnd: 6, w: 1280, h: 720 })]);
    assert.equal(W.pickMain(s).hwnd, 6);
    assert.equal(W.pickMain({ ...s, fg: 5 }).hwnd, 5);
    assert.equal(W.pickMain(snap([])), null);
    assert.equal(W.pickMain(null), null);
  });
  await ok('fullscreen window: ready after 500 ms of stable size', async () => {
    const r = await run((t) => (t < 1000 ? snap([]) : snap([win()])));
    assert.equal(r.status, 'ready'); assert.equal(r.fullscreen, true);
    assert.ok(r.waited >= 1500 && r.waited <= 1700, r.waited);
  });
  await ok('GoW style: windowed first, fullscreen 2 s later -> waits for fullscreen', async () => {
    const r = await run((t) => (t < 500 ? snap([]) : t < 2500 ? snap([win({ x: 640, y: 360, w: 1280, h: 720 })]) : snap([win()])));
    assert.equal(r.status, 'ready'); assert.equal(r.fullscreen, true); assert.ok(r.waited >= 3000, r.waited);
  });
  await ok('size keeps changing -> not ready until it settles', async () => {
    const r = await run((t) => (t < 3000 ? snap([win({ w: 2000 + (Math.floor(t / 200) % 2) * 560 })]) : snap([win()])));
    assert.equal(r.status, 'ready'); assert.ok(r.waited >= 3500, r.waited);
  });
  await ok('windowed game (SotC 1280x720): ready after the windowed hold, not 500 ms', async () => {
    const r = await run(() => snap([win({ x: 640, y: 360, w: 1280, h: 720 })]));
    assert.equal(r.status, 'ready'); assert.equal(r.fullscreen, false); assert.ok(r.waited >= 4000 && r.waited < 4300, r.waited);
  });
  await ok('learned "window": short hold; learned "fullscreen": long fallback', async () => {
    const w = () => snap([win({ x: 640, y: 360, w: 1280, h: 720 })]);
    const a = await run(w, { expect: 'window' }); assert.ok(a.waited >= 1500 && a.waited < 1700, a.waited);
    const b = await run(w, { expect: 'fullscreen' }); assert.ok(b.waited >= 15000 && b.waited < 15200, b.waited);
  });
  await ok('window replaced by a new one (launcher -> game) resets the hold', async () => {
    const r = await run((t) => (t < 400 ? snap([win({ hwnd: 1 })]) : snap([win({ hwnd: 2 })])));
    assert.equal(r.win.hwnd, 2); assert.ok(r.waited >= 900, r.waited);
  });
  await ok('no window at all: timeout after 60 s with win=null', async () => {
    const r = await run(() => snap([]));
    assert.equal(r.status, 'timeout'); assert.equal(r.win, null); assert.ok(r.waited >= 60000 && r.waited < 60200);
  });
  await ok('helper failure (null snapshots) is survivable', async () => {
    const r = await run((t) => (t < 700 ? null : snap([win()])));
    assert.equal(r.status, 'ready');
  });
  await ok('shouldStop cancels (game exited while loading)', async () => {
    let t = 0;
    const r = await W.waitForGameWindow(async () => snap([]), {}, { now: () => t, sleep: async (ms) => { t += ms; }, shouldStop: () => t > 2000 });
    assert.equal(r.status, 'cancelled');
  });

  const XML = `<?xml version="1.0" encoding="utf-8"?>
<Settings>
  <Hotkey>S</Hotkey>
  <HotkeyModifierKeys>Alt Control</HotkeyModifierKeys>
  <GameProfiles>
    <Profile>
      <Title>Varsayılan</Title>
      <AutoScale>false</AutoScale>
      <AutoScaleDelay>0</AutoScaleDelay>
      <LSFG3Mode1>ADAPTIVE</LSFG3Mode1>
      <LSFG3Target>120</LSFG3Target>
      <FrameGeneration>LSFG3</FrameGeneration>
    </Profile>
  </GameProfiles>
</Settings>`;
  const EXE = 'C:\\Emulators\\shadPS4\\shadPS4.exe';
  await ok('LS hotkey parse: Ctrl+Alt+S', () => { assert.deepEqual(LS.hotkey(XML), { mods: 'ca', vk: 0x53, label: 'Alt+Control+S' }); assert.equal(LS.hotkey('<Hotkey>F10</Hotkey><HotkeyModifierKeys>Control</HotkeyModifierKeys>').vk, 0x79); });
  await ok('LS filters: full path, exe name, *title*', () => {
    assert.ok(LS.filterMatches(EXE.toUpperCase(), EXE));
    assert.ok(LS.filterMatches('foo.exe; shadps4.exe', EXE));
    assert.ok(LS.filterMatches('*oyun*', 'x.exe', 'Örnek Oyun'));
    assert.ok(!LS.filterMatches('C:\\other\\shadPS4.exe', EXE));
    assert.ok(!LS.filterMatches('', EXE));
  });
  await ok('LS addProfile clones Varsayılan, binds the exe, Auto Scale on, delay set', () => {
    assert.equal(LS.profileFor(XML, EXE), null);
    const out = LS.addProfile(XML, { title: 'Örnek Oyun (Definitely Not PS5 Menu)', exePath: EXE, delay: 5, template: 'Varsayılan' });
    const ps = LS.parseProfiles(out);
    assert.equal(ps.length, 2); assert.equal(ps[0].title, 'Varsayılan'); assert.equal(ps[0].autoScale, false);
    assert.deepEqual([ps[1].title, ps[1].filter, ps[1].autoScale, ps[1].autoScaleDelay, ps[1].frameGeneration], ['Örnek Oyun (Definitely Not PS5 Menu)', EXE, true, 5, 'LSFG3']);
    assert.ok(out.includes('<LSFG3Target>120</LSFG3Target>\n      <FrameGeneration>LSFG3</FrameGeneration>\n    </Profile>\n    <Profile>'));
    assert.equal(LS.profileFor(out, EXE).title, 'Örnek Oyun (Definitely Not PS5 Menu)');
    assert.equal(out.match(/<Settings>/g).length, 1);
  });
  console.log(`${n} winwatch/lossless tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
