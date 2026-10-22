'use strict';
// "Home" during a game, like the PS button on a console: hold Esc or the controller's Guide button
// (or Back+Start), the game is paused and the menu comes up; from there the game continues where it
// was, or is closed when another game is started. Pure decisions here (no Electron, no Win32) so
// they can be tested; main.js does the talking to the window helper.

const HOLD_STEPS = [600, 1000, 1500, 2000];
const DEFAULT_HOLD = 1000;

const holdMs = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 200 && n <= 5000 ? Math.round(n) : DEFAULT_HOLD; };
const nextHold = (v) => { const cur = holdMs(v); const i = HOLD_STEPS.findIndex((x) => x > cur); return HOLD_STEPS[i < 0 ? 0 : i]; };
const holdLabel = (v) => `${(holdMs(v) / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`;

// What the helper should watch for while a game runs.
// pad: 0 off | 1 hold the Xbox button or View+Menu (as before 1.5.1) | 2 hold View+Menu, the Xbox
// button is dnac-padwatch's (one press, also when the menu is closed) | 3 hold View+Menu and one press
// of the Xbox button, read by the window helper (padwatch is off).
// guideByPadwatch: the controller watcher runs and handles the Xbox button.
function triggers(settings = {}, { guideByPadwatch = false } = {}) {
  const hold = settings.homePad !== false, guide = settings.homeGuide !== false;
  const pad = guide ? (guideByPadwatch ? (hold ? 2 : 0) : 3) : (hold ? 1 : 0);
  return { esc: settings.homeEsc !== false, escMs: holdMs(settings.homeEscMs), pad, padMs: holdMs(settings.homePadMs) };
}

// Per-game: pause (suspend) the game while the menu is up. Since 1.5.1 off unless switched on for
// that game: the game keeps running behind the menu, like on a console.
const suspendWanted = (game) => !!game && game.suspendInMenu === true;

// Never paused, whatever a game's folder happens to contain: Windows itself, the shell, Steam,
// Lossless Scaling and this menu.
const NEVER_PAUSE = new Set(['system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe',
  'svchost.exe', 'dwm.exe', 'explorer.exe', 'sihost.exe', 'fontdrvhost.exe', 'ctfmon.exe', 'audiodg.exe', 'conhost.exe', 'openconsole.exe',
  'windowsterminal.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'steam.exe', 'steamwebhelper.exe', 'steamservice.exe', 'gameoverlayui.exe',
  'losslessscaling.exe', 'electron.exe', 'definitely not ps5 menu.exe', 'definitely not a console.exe', 'ps5winhelper.exe', 'dnac-padwatch.exe', 'gamebar.exe', 'gamebarftserver.exe']);

// Processes to pause: the game's process tree (plus same-folder exes), minus the never-pause list
// and the given pids (our own, Lossless Scaling's).
function pausePids(snap, excludePids = []) {
  if (!snap || !Array.isArray(snap.pids)) return [];
  const ex = new Set(excludePids.map(Number));
  return snap.pids.filter((pid, i) => {
    const exe = String((snap.exes && snap.exes[i]) || '').toLowerCase();
    return pid > 4 && !ex.has(pid) && !NEVER_PAUSE.has(exe);
  });
}

// The Xbox button (src "guide") always counts: it is meant to bring the menu up from anywhere.
// A hold only counts while the game is the active window (or Lossless Scaling's output on top of
// it), so holding Esc in a browser next to a running game does nothing.
function triggerAccepted(gameSnap, gameHwnd, lsSnap) {
  if (!gameSnap) return false;
  const fg = gameSnap.fg, fgpid = gameSnap.fgpid;
  if (!fg) return false;
  if (gameHwnd && String(fg) === String(gameHwnd)) return true;
  if (fgpid && Array.isArray(gameSnap.pids) && gameSnap.pids.includes(fgpid)) return true;
  return !!(fgpid && lsSnap && Array.isArray(lsSnap.pids) && lsSnap.pids.includes(fgpid));
}

// After un-minimizing: put the window back if it filled its monitor before and no longer does.
function placeBack(before, after) {
  if (!before || !before.mon) return null;
  const covers = (w) => !!w && !!w.mon && w.x <= w.mon.x + 1 && w.y <= w.mon.y + 1 && w.x + w.w >= w.mon.x + w.mon.w - 1 && w.y + w.h >= w.mon.y + w.mon.h - 1;
  if (!covers(before) || covers(after)) return null;
  return { x: before.x, y: before.y, w: before.w, h: before.h };
}

// Close the running game like its own close button would: resume it (a paused game cannot close),
// WM_CLOSE to its main window, wait up to waitMs for the whole process set to go away, and only
// then end what is left.
async function closeGracefully({ helper, snapFn, hwnd, pickMain, waitMs = 5000, pollMs = 250, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, log = () => {} }) {
  let snap = await snapFn();
  let pids = (snap && snap.pids) || [];
  if (!pids.length) return { how: 'gone' };
  await helper.resume(pids);
  const main = (pickMain && pickMain(snap)) || null;
  const target = main ? main.hwnd : hwnd;
  if (target) { await helper.closeWindow(target); log('WM_CLOSE sent'); }
  const end = now() + waitMs;
  while (now() < end) {
    await sleep(pollMs);
    snap = await snapFn();
    pids = (snap && snap.pids) || [];
    if (!pids.length) return { how: 'closed' };
  }
  log('still running after close, ending', pids);
  await helper.term(pids);
  for (let i = 0; i < 8; i++) {
    await sleep(pollMs);
    snap = await snapFn();
    if (!snap || !(snap.pids || []).length) return { how: 'killed' };
  }
  return { how: 'stuck', pids: (snap && snap.pids) || [] };
}

module.exports = { HOLD_STEPS, DEFAULT_HOLD, holdMs, nextHold, holdLabel, triggers, suspendWanted, pausePids, triggerAccepted, placeBack, closeGracefully, NEVER_PAUSE };
