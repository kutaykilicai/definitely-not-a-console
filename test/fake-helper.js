// Scripted stand-in for bin/ps5winhelper.exe + Lossless Scaling, for testing the launch chain on
// Linux. Game windows: one 1920x1080 window per running dummy-game.sh process (hwnd = pid).
// LS: a main window that comes up maximized and in front (like LS with WindowMaximized=true),
// a full-screen scaling window when auto scale fires or the hotkey is pressed.
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const MON = { x: 0, y: 0, w: 1920, h: 1080 };
const LS_MAIN = 9001, LS_OUT = 9002;
const F = {
  available: true, events: [], fg: 0,
  mode: process.env.FAKE_LS_MODE || 'auto',      // auto: LS scales by itself | never: only the hotkey works
  ls: null, lsRunning: false, lsMain: null, lsOut: false, fgSince: 0, delay: 2,
};
const ev = (e) => { F.events.push([Date.now(), e]); };
function games() {
  let out = ''; try { out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }); } catch { return []; }
  return out.split('\n').filter((l) => /dummy-game\.sh/.test(l) && !/\bps\b/.test(l)).map((l) => parseInt(l.trim(), 10)).filter(Boolean);
}
const gameWin = (pid) => ({ hwnd: pid, pid, exe: 'dummy-game.sh', cls: 'Game', visible: true, x: 0, y: 0, w: 1920, h: 1080, mon: MON });
function tick() {
  // LS auto scale: the game has been in front for `delay` seconds.
  const g = games();
  if (F.lsRunning && F.mode === 'auto' && !F.lsOut && g.includes(F.fg) && F.fgSince && Date.now() - F.fgSince >= F.delay * 1000) { F.lsOut = true; ev('ls-autoscale'); }
  if (F.lsOut && !g.length) F.lsOut = false;
}
setInterval(tick, 100).unref();
function setFg(h) { if (F.fg !== h) { F.fg = h; F.fgSince = Date.now(); } }
F.snap = async (root, names) => {
  tick();
  if (names && names.some((n) => /lossless/i.test(n))) {
    const windows = [];
    if (F.lsMain) windows.push({ hwnd: LS_MAIN, pid: 1, exe: 'LosslessScaling.exe', title: 'Lossless Scaling', visible: true, minimized: F.lsMain === 'min', x: -8, y: -8, w: F.lsMain === 'min' ? 160 : 1936, h: F.lsMain === 'min' ? 28 : 1096, mon: MON });   // maximized + auto-hide taskbar: covers the monitor
    if (F.lsOut) windows.push({ hwnd: LS_OUT, pid: 1, exe: 'LosslessScaling.exe', title: '', visible: true, tool: true, x: 0, y: 0, w: 1920, h: 1080, mon: MON });
    return { pids: F.lsRunning ? [1] : [], windows, fg: F.fg };
  }
  const g = games();
  return { pids: g, windows: g.map(gameWin), fg: F.fg };
};
F.alive = async (h) => {
  tick();
  if (h === LS_MAIN) return { alive: !!F.lsMain, isfg: F.fg === LS_MAIN };
  const ok = games().includes(h);
  return { alive: ok, isfg: ok && F.fg === h, win: ok ? gameWin(h) : null };
};
F.foreground = async (h) => { ev(`fg ${h === LS_MAIN ? 'ls' : 'game'}`); setFg(h); return { ok: true }; };
F.below = async () => ({ ok: true });
F.minimize = async (h) => { if (h === LS_MAIN && F.lsMain) { F.lsMain = 'min'; ev('ls-minimized'); if (F.fg === LS_MAIN) F.fg = 0; } return { ok: true }; };
F.keys = async (mods, vk) => { ev(`keys ${mods}+${vk}`); if (F.lsRunning && !F.lsOut) { F.lsOut = true; ev('ls-scale-by-hotkey'); } else if (F.lsOut) { F.lsOut = false; ev('ls-scale-OFF-by-hotkey'); } return { ok: true }; };
F.close = () => {};
// LS process + Settings.xml
const XML = path.join(os.tmpdir(), `fake-ls-${process.pid}.xml`);
F.writeSettings = (gameExe, autoScale = true) => fs.writeFileSync(XML, `<?xml version="1.0" encoding="utf-8"?>
<Settings>
  <Hotkey>S</Hotkey>
  <HotkeyModifierKeys>Alt Control</HotkeyModifierKeys>
  <GameProfiles>
    <Profile>
      <Title>Varsayılan</Title>
      <AutoScale>false</AutoScale>
      <AutoScaleDelay>0</AutoScaleDelay>
    </Profile>
    <Profile>
      <Title>Örnek Oyun (test)</Title>
      <Path>${gameExe}</Path>
      <AutoScale>${autoScale}</AutoScale>
      <AutoScaleDelay>${F.delay}</AutoScaleDelay>
    </Profile>
  </GameProfiles>
</Settings>
`);
F.ls = {
  findExe: () => '/fake/LosslessScaling.exe',
  settingsPath: () => XML,
  startMinimized: async () => {
    ev('ls-start'); F.lsRunning = true;
    // Like LS with WindowMaximized=true: its window shows up maximized and takes the focus.
    setTimeout(() => { F.lsMain = 'max'; setFg(LS_MAIN); ev('ls-window-shown'); }, 800);
  },
};
F.reset = (mode) => { F.mode = mode; F.lsRunning = false; F.lsMain = null; F.lsOut = false; F.events = []; };
module.exports = F;
