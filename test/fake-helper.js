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
const V = process.env.FAKE_VISUAL ? require('./fake-visual') : null;
F.visual = V;
const setLsOut = (on) => { if (F.lsOut !== on) { F.lsOut = on; if (V) V.lsOut(on); } };
function games() {
  let out = ''; try { out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }); } catch { return []; }
  return out.split('\n').filter((l) => /dummy-game\.sh/.test(l) && !/\bps\b/.test(l)).map((l) => parseInt(l.trim(), 10)).filter(Boolean);
}
// Home during a game: minimized windows, paused (SIGSTOP) processes, the hold-to-home watcher.
F.min = new Set(); F.stopped = new Set(); F.hung = new Set(); F.watching = null; F.ignoreClose = false; F.onEvent = null;
const gameWin = (pid) => ({ hwnd: pid, pid, exe: 'dummy-game.sh', cls: 'Game', visible: true, minimized: F.min.has(pid), x: 0, y: 0, w: 1920, h: 1080, mon: MON });
const sig = (pid, s) => { try { process.kill(pid, s); return true; } catch { return false; } };
F.procState = (pid) => { try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0]; } catch { return null; } };
F.watch = async (o) => { F.watching = o; ev(`watch esc=${o.esc} pad=${o.pad}`); return { ok: true, esc: o.esc, pad: o.pad, xinput: 'fake', guide: true }; };
F.unwatch = async () => { if (F.watching) ev('unwatch'); F.watching = null; return { ok: true }; };
// What the real helper reports after Esc / the Xbox button was held long enough (once per arming).
F.hold = (src = 'esc') => { if (!F.watching || !F.onEvent) return false; F.watching = null; ev(`hold ${src}`); F.onEvent({ event: 'home', src }); return true; };
F.suspend = async (pids) => { let n = 0; for (const p of pids) if (!F.stopped.has(p) && sig(p, 'SIGSTOP')) { F.stopped.add(p); n++; } ev(`suspend ${pids.length}`); return { ok: n > 0, suspended: n }; };
F.resume = async (pids) => { const list = pids === 'all' ? [...F.stopped] : pids; for (const p of list) { sig(p, 'SIGCONT'); F.stopped.delete(p); } ev('resume'); return { ok: true, resumed: list.length }; };
F.term = async (pids) => { for (const p of pids) { sig(p, 'SIGCONT'); sig(p, 'SIGKILL'); F.stopped.delete(p); } ev('term'); return { ok: true, ended: pids.length }; };
F.closeWindow = async (h) => { ev('close'); if (!F.ignoreClose) sig(h, 'SIGTERM'); return { ok: true }; };
F.restore = async (h) => { F.min.delete(h); ev('restore'); if (V) V.restore(h); return { ok: true }; };
F.place = async () => ({ ok: true });
function tick() {
  // LS auto scale: the game has been in front for `delay` seconds.
  const g = games();
  // (once per activation of the game window, like LS: switching it off by hotkey keeps it off)
  // (its timer runs once per activation; if LS is already scaling by then, nothing happens)
  if (F.lsRunning && F.mode === 'auto' && g.includes(F.fg) && F.fgSince && F.autoAt !== F.fgSince && Date.now() - F.fgSince >= F.delay * 1000) { F.autoAt = F.fgSince; if (!F.lsOut) { setLsOut(true); ev('ls-autoscale'); } }
  if (F.lsOut && !g.length) setLsOut(false);
}
setInterval(tick, 100).unref();
function setFg(h) { if (F.fg !== h) { F.fg = h; F.fgSince = Date.now(); } }
F.focusGame = setFg;
F.snap = async (root, names) => {
  tick();
  if (names && names.some((n) => /lossless/i.test(n))) {
    const windows = [];
    if (F.lsMain) windows.push({ hwnd: LS_MAIN, pid: 1, exe: 'LosslessScaling.exe', title: 'Lossless Scaling', visible: true, minimized: F.lsMain === 'min', x: -8, y: -8, w: F.lsMain === 'min' ? 160 : 1936, h: F.lsMain === 'min' ? 28 : 1096, mon: MON });   // maximized + auto-hide taskbar: covers the monitor
    if (F.lsOut) windows.push({ hwnd: LS_OUT, pid: 1, exe: 'LosslessScaling.exe', title: '', visible: true, tool: true, x: 0, y: 0, w: 1920, h: 1080, mon: MON });
    return { pids: F.lsRunning ? [1] : [], exes: F.lsRunning ? ['losslessscaling.exe'] : [], windows, fg: F.fg, fgpid: F.fg };
  }
  const g = games();
  return { pids: g, exes: g.map(() => 'dummy-game.sh'), windows: g.map(gameWin), fg: F.fg, fgpid: F.fg };
};
F.alive = async (h) => {
  tick();
  if (h === LS_MAIN) return { alive: !!F.lsMain, isfg: F.fg === LS_MAIN };
  const ok = games().includes(h);
  return { alive: ok, minimized: ok && F.min.has(h), hung: ok && F.hung.has(h), isfg: ok && F.fg === h, win: ok ? gameWin(h) : null };
};
F.foreground = async (h) => { ev(`fg ${h === LS_MAIN ? 'ls' : 'game'}`); setFg(h); if (V && h !== LS_MAIN) V.raise(h); return { ok: true }; };
F.below = async () => ({ ok: true });
F.minimize = async (h) => {
  if (h === LS_MAIN && F.lsMain) { F.lsMain = 'min'; ev('ls-minimized'); if (F.fg === LS_MAIN) F.fg = 0; }
  else if (games().includes(h)) { F.min.add(h); ev('game-minimized'); if (F.fg === h) F.fg = 0; if (V) V.minimize(h); }
  return { ok: true };
};
F.keys = async (mods, vk) => { ev(`keys ${mods}+${vk}`); if (F.lsRunning && !F.lsOut) { setLsOut(true); ev('ls-scale-by-hotkey'); } else if (F.lsOut) { setLsOut(false); ev('ls-scale-OFF-by-hotkey'); } return { ok: true }; };
F.close = () => {};
// LS process + Settings.xml
const XML = path.join(os.tmpdir(), `fake-ls-${process.pid}.xml`);
F.writeSettings = (gameExe, autoScale = true, o = {}) => { if (o.delay != null) F.delay = o.delay; return fs.writeFileSync(XML, `<?xml version="1.0" encoding="utf-8"?>
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
      <Title>${o.title || 'Örnek Oyun (test)'}</Title>
      <Path>${gameExe}</Path>
      <AutoScale>${autoScale}</AutoScale>
      <AutoScaleDelay>${o.fileDelay != null ? o.fileDelay : F.delay}</AutoScaleDelay>
    </Profile>
  </GameProfiles>
</Settings>
`); };
F.ls = {
  findExe: () => '/fake/LosslessScaling.exe',
  settingsPath: () => XML,
  startMinimized: async () => {
    ev('ls-start'); F.lsRunning = true;
    if (V) await V.startLs();
    // Like LS with WindowMaximized=true: its window shows up maximized and takes the focus.
    setTimeout(() => { F.lsMain = 'max'; setFg(LS_MAIN); ev('ls-window-shown'); }, 800);
  },
};
F.reset = (mode) => { F.mode = mode; F.lsRunning = false; F.lsMain = null; setLsOut(false); F.events = []; F.min.clear(); F.hung.clear(); F.ignoreClose = false; };
module.exports = F;
