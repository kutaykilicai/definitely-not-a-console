'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, shell, screen, globalShortcut, powerSaveBlocker, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { resolveArt, emuBadge, readShortcut, readSceSys } = require('./lib/detect');
const library = require('./lib/library');
const { GameRunner } = require('./lib/proc');
const { WinHelper, helperPath, hwndOf, pickMain, waitForGameWindow, coversMonitor } = require('./lib/winwatch');
const lossless = require('./lib/lossless');

const isWin = process.platform === 'win32';
const argv = process.argv.slice(1);
const flag = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const flagVal = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };

// Per-user data: %APPDATA%\Definitely Not PS5 Menu (games.json, settings.json, state.json, assets\).
// PS5MENU_ROOT (tests, developers) keeps everything under one folder instead.
const ROOT_ENV = process.env.PS5MENU_ROOT || null;
const APP_NAME = 'Definitely Not PS5 Menu';
const DATA = ROOT_ENV ? path.join(ROOT_ENV, 'data') : path.join(app.getPath('appData'), APP_NAME);
const USER_ASSETS = ROOT_ENV ? path.join(ROOT_ENV, 'assets', 'user') : path.join(DATA, 'assets');
const ROOT = ROOT_ENV || DATA;
const BUILTIN = path.join(__dirname, 'assets');
for (const d of [DATA, USER_ASSETS, path.join(USER_ASSETS, 'fonts'), path.join(USER_ASSETS, 'sounds'), path.join(USER_ASSETS, 'games')]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* read-only is fine */ }
}
// Earlier builds were called "PS5 Menu": first %APPDATA%\PS5 Menu, before that data\ next to the
// exe (portable zip). Bring the newest of those over once so existing libraries keep working.
let migration = { migrated: false };
if (!ROOT_ENV) {
  try {
    migration = library.migrateConfigDir({ fromDir: path.join(app.getPath('appData'), 'PS5 Menu'), configDir: DATA });
    if (!migration.migrated && app.isPackaged) migration = library.migrateLegacy({ legacyRoot: path.dirname(process.execPath), configDir: DATA, assetsDir: USER_ASSETS });
  } catch (e) { migration = { migrated: false, error: e.message }; }
}
app.setPath('userData', path.join(DATA, 'electron'));

const FILES = { games: path.join(DATA, 'games.json'), settings: path.join(DATA, 'settings.json'), state: path.join(DATA, 'state.json') };
const DEFAULT_SETTINGS = {
  language: 'tr',
  intro: 'press',            // press | fade | none
  sounds: true,
  music: true,               // only plays if assets/user/sounds/ambient.* exists
  volume: 0.6,
  fullscreen: true,
  autostart: false,
  hideOnLaunch: true,
  clock24h: true,
  playLabel: 'Oyna',
  username: '',              // empty: the Windows user name
  rowStart: 'desktop',       // desktop | none
  rowOrder: 'recent',        // recent (like the console) | manual (the order set in Oyunları Yönet)
  dumpRoots: [],             // extra folders to search for PS4 dumps (sce_sys) by title ID
};

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8'); return true; } catch { return false; } };

let settings = { ...DEFAULT_SETTINGS, ...readJson(FILES.settings, {}) };
const OS_USER = (() => { try { return require('os').userInfo().username; } catch { return ''; } })();
let state = readJson(FILES.state, { lastPlayed: {}, playSeconds: {}, focusId: null });
state.lastPlayed ||= {}; state.playSeconds ||= {}; state.windowModes ||= {};

async function loadGames() {
  const doc = readJson(FILES.games, null) || { version: 1, games: [] };
  if (!Array.isArray(doc.games)) doc.games = [];
  return doc;
}
const saveGames = (doc) => writeJson(FILES.games, doc);

// Exe icon for games without art (the tile shows it on a generated background).
const iconCache = new Map();
async function exeIcon(exe) {
  if (!exe || !fs.existsSync(exe)) return null;
  if (iconCache.has(exe)) return iconCache.get(exe);
  let url = null;
  try { const img = await app.getFileIcon(exe, { size: 'large' }); if (img && !img.isEmpty()) url = img.toDataURL(); } catch { /* none */ }
  iconCache.set(exe, url);
  return url;
}

const fileUrl = (p) => (p ? `ps5file://local/${encodeURIComponent(p)}` : null);

function listUserAssets() {
  const fonts = []; const sounds = {};
  const fdir = path.join(USER_ASSETS, 'fonts');
  try {
    for (const n of fs.readdirSync(fdir)) {
      if (!/\.(ttf|otf|woff2?)$/i.test(n)) continue;
      const l = n.toLowerCase();
      let weight = 400;
      if (/thin|hairline/.test(l)) weight = 100; else if (/extralight|ultralight/.test(l)) weight = 200;
      else if (/light/.test(l)) weight = 300; else if (/semibold|demibold/.test(l)) weight = 600;
      else if (/extrabold|heavy|black/.test(l)) weight = 800; else if (/bold/.test(l)) weight = 700;
      else if (/medium/.test(l)) weight = 500;
      fonts.push({ name: n, weight, url: fileUrl(path.join(fdir, n)), variable: /var|\[/.test(l) });
    }
  } catch { /* none */ }
  const sdir = path.join(USER_ASSETS, 'sounds');
  try {
    for (const n of fs.readdirSync(sdir)) {
      const m = n.toLowerCase().match(/^(focus|move|select|back|launch|start|ambient|music|error|menu)\.(wav|mp3|ogg|m4a|flac)$/);
      if (m) {
        const key = { move: 'focus', start: 'launch', music: 'ambient' }[m[1]] || m[1];
        sounds[key] = fileUrl(path.join(sdir, n));
      }
    }
  } catch { /* none */ }
  const pick = (base) => { for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) { const f = path.join(USER_ASSETS, `${base}.${ext}`); if (fs.existsSync(f)) return fileUrl(f); } return null; };
  return { fonts, sounds, avatar: pick('avatar'), boot: pick('boot'), dir: USER_ASSETS };
}

async function buildInit() {
  const doc = await loadGames();
  const all = [];
  for (const [i, g] of doc.games.entries()) {
    const art = resolveArt(g, path.join(USER_ASSETS, 'games'), settings.dumpRoots || []);
    all.push({
      ...g, order: i,
      art: { icon: fileUrl(art.icon), background: fileUrl(art.background), logo: fileUrl(art.logo), cover: fileUrl(art.cover), exeIcon: art.icon ? null : await exeIcon(g.exe) },
      artPaths: art,
      installed: !!(g.exe && (fs.existsSync(g.exe) || process.env.PS5MENU_DEMO)),
      lastPlayed: state.lastPlayed[g.id] || 0,
      playSeconds: state.playSeconds[g.id] || 0,
    });
  }
  return {
    games: all.filter((g) => !g.hidden), allGames: all, settings: { ...settings, username: settings.username || OS_USER }, state, user: listUserAssets(), platform: process.platform,
    paths: { root: ROOT, data: DATA, games: FILES.games, userAssets: USER_ASSETS },
    running: runner.running ? runner.current.game.id : null,
    version: app.getVersion(),
    lossless: { installed: !!((isWin || FAKE) && lsOps.findExe(settings.losslessScalingExe)) || !!process.env.PS5MENU_FAKE_LS },
    migration,
  };
}

const runner = new GameRunner();
let win = null;

// The menu window exists only while the menu is on screen. During a game it is destroyed (nothing
// left for Lossless Scaling or the compositor to pick up) and made again when the game ends or on
// Ctrl+Alt+Home. reopen: null (app start) | 'exit' | 'returning' | 'home'.
function createWindow(reopen = null) {
  const windowed = flag('windowed') || flag('screenshot') || settings.fullscreen === false;
  const size = (flagVal('size') || '1920x1080').split('x').map(Number);
  win = new BrowserWindow({
    width: size[0], height: size[1], show: false, frame: false, fullscreen: !windowed,
    backgroundColor: '#000000', autoHideMenuBar: true, title: APP_NAME,
    useContentSize: true, enableLargerThanScreen: true,
    icon: path.join(BUILTIN, 'icons', 'app.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, spellcheck: false,
      offscreen: flag('offscreen'),
    },
  });
  win.removeMenu();
  const q = {};
  if (flagVal('state')) q.state = flagVal('state');
  if (flag('screenshot')) q.capture = '1';
  if (reopen) q.reopen = reopen;
  const me = win;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: q });
  win.webContents.on('did-finish-load', () => { const p = pending.splice(0); for (const [ch, d] of p) if (!me.isDestroyed()) me.webContents.send(ch, d); });
  win.once('ready-to-show', () => {
    if (me.isDestroyed()) return;
    if (reopen) me.setOpacity(0);
    if (!flag('offscreen')) me.show();
    pinTop(true); me.focus(); me.moveTop();
    if (reopen) fadeWindow(0, 1, 320);
  });
  startBlocker();
  // While the menu is the active app it stays above always-on-top desktop widgets and the
  // taskbar. During a game it sits right below the game window as a black backdrop, so when the game
  // closes there is no desktop in between.
  win.on('focus', () => onMenuFocus());
  win.on('blur', () => onMenuBlur());
  if (flag('screenshot')) win.webContents.on('console-message', (e) => console.log('[renderer]', e.message));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control) win.webContents.toggleDevTools();
  });
  // Alt+F4 / closing the window quits the whole app (helper included). Nothing restarts it.
  // Only closeMenuForGame() closes it without quitting.
  win.on('close', () => { if (me.forGame) return; quitting = true; helper.close(); });
  win.on('closed', () => { if (win === me) win = null; if (!me.forGame) app.quit(); });
}

// Game is up: take the menu off the screen completely. The main process (and the window helper)
// keeps running without any window and waits for the game to end.
function closeMenuForGame() {
  const w = win; if (!w || w.isDestroyed()) return;
  w.forGame = true; win = null; pending.length = 0;
  try { w.setAlwaysOnTop(false); } catch { /* */ }
  w.destroy();
  stopBlocker();
}

// Show the menu again (made fresh if it was closed for the game).
function openMenu(reopen) {
  if (quitting) return;
  if (win && !win.isDestroyed()) { showLauncher(); return; }
  createWindow(reopen);
}

let blockerId = null;
function startBlocker() { if (blockerId === null) try { blockerId = powerSaveBlocker.start('prevent-display-sleep'); } catch { /* */ } }
function stopBlocker() { if (blockerId !== null) { try { powerSaveBlocker.stop(blockerId); } catch { /* */ } blockerId = null; } }

const canTop = () => !(flag('windowed') || flag('screenshot') || settings.fullscreen === false);
function pinTop(on) {
  if (!win || !canTop()) return;
  win.setAlwaysOnTop(!!on, 'screen-saver');
}
// Messages for a window that is still loading wait until it has loaded.
const pending = [];
const send = (ch, d) => {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) pending.push([ch, d]); else win.webContents.send(ch, d);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { if (process.env.PS5MENU_DEBUG) console.log('[launch]', ...a); };

function showLauncher() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (win.getOpacity() < 1) win.setOpacity(1);
  win.show();
  if (canTop()) win.setFullScreen(true);
  // Windows may refuse to hand focus to a background process; topmost keeps the menu visible anyway.
  pinTop(true); win.focus(); win.moveTop();
}

// ---------- seamless launch ----------
// phase: home (no game) | launching (launch screen up, waiting for the game window) | playing (menu
// is a black backdrop below the game) | overlay (home shown over a running game) | returning (game
// window closed, waiting for the process to end)
const helper = process.env.PS5MENU_FAKE_HELPER ? require(process.env.PS5MENU_FAKE_HELPER) : new WinHelper(helperPath(__dirname));
const FAKE = !!process.env.PS5MENU_FAKE_HELPER;   // tests: a scripted helper stands in for the Win32 one
const lsOps = (FAKE && helper.ls) || lossless;   // LS process/file operations (scripted in tests)
const seamless = () => !quitting && (isWin || FAKE) && helper.available && canTop() && settings.seamless !== false;
let phase = 'home';
let quitting = false;
let session = null;

async function fadeWindow(from, to, ms) {
  if (!win) return;
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) { if (!win) return; win.setOpacity(from + (to - from) * (i / steps)); await sleep(16); }
}

// Create an LS profile for this game (exe filter + Auto Scale) when the toggle is on and none
// matches yet. Only while LS is closed (it rewrites Settings.xml on exit), after a backup.
async function ensureLsProfile(g) {
  if (!(isWin || FAKE) || !g || !g.losslessScaling || !g.exe) return { ok: false, reason: 'off' };
  const xp = lsOps.settingsPath();
  let xml; try { xml = fs.readFileSync(xp, 'utf8'); } catch { return { ok: false, reason: 'no-settings' }; }
  if (lossless.profileFor(xml, g.exe, g.title)) return { ok: true, existed: true };
  const snap = await helper.snap(0, [lossless.EXE]);
  if (snap && snap.pids && snap.pids.length) return { ok: false, reason: 'running' };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  try {
    fs.copyFileSync(xp, `${xp}.bak-ps5menu-${stamp}`);
    fs.writeFileSync(xp, lossless.addProfile(xml, { title: `${g.title} (${APP_NAME})`, exePath: g.exe, delay: 5 }), 'utf8');
    return { ok: true, created: true };
  } catch (e) { return { ok: false, reason: e.message }; }
}

async function prepareLossless(g) {
  const exe = lsOps.findExe(settings.losslessScalingExe);
  if (!exe) return { mode: null, error: 'Lossless Scaling bulunamadı' };
  await ensureLsProfile(g);
  let xml = ''; try { xml = fs.readFileSync(lsOps.settingsPath(), 'utf8'); } catch { /* */ }
  const prof = lossless.profileFor(xml, g.exe, g.title);
  const snap = await helper.snap(0, [lossless.EXE]);
  const running = !!(snap && snap.pids && snap.pids.length);
  if (!running) {
    // Start LS before the game and put its window away while the launch screen still covers
    // everything, so it can never come up in front of the game or take its focus. (LS remembers
    // "maximized" and may ignore the minimized start.)
    await lsOps.startMinimized(exe);
    for (let i = 0; i < 40; i++) {           // up to ~6 s for LS to show its window
      await sleep(150);
      const w = await lsMainWindow();
      if (w && !w.minimized) { await helper.minimize(w.hwnd); await sleep(200); break; }
      if (w && w.minimized) break;
    }
  } else await hideLsWindow();
  // A profile bound to the game's exe with Auto Scale on: LS scales by itself after its delay.
  // Otherwise (or if it did not) we press LS's own scale hotkey once the game is in front.
  return { mode: prof && prof.autoScale ? 'profile' : 'hotkey', hotkey: lossless.hotkey(xml), profile: prof && prof.title, delay: prof ? prof.autoScaleDelay : 0, startedByUs: !running };
}

// LS's own main window (title "Lossless Scaling"), if any. Its scaling output is a separate window.
const isLsMain = (x) => /lossless scaling/i.test(x.title || '') && !x.tool;
async function lsMainWindow() {
  const snap = await helper.snap(0, [lossless.EXE]);
  const ws = ((snap && snap.windows) || []).filter((x) => x.visible && x.w > 200 && x.h > 150);
  return ws.find(isLsMain) || ws.filter((x) => !x.tool && !coversMonitor(x)).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
}
async function hideLsWindow() {
  const w = await lsMainWindow();
  if (w && !w.minimized) { await helper.minimize(w.hwnd); return true; }
  return false;
}
// While LS scales it shows its output in a window of its own over the whole screen.
async function lsScaling() {
  const snap = await helper.snap(0, [lossless.EXE]);
  return ((snap && snap.windows) || []).some((x) => x.visible && !x.minimized && coversMonitor(x) && !isLsMain(x));
}
// The game must stay the foreground window: the controller only drives the focused window.
async function keepGameFocused(s) {
  const a = await helper.alive(s.hwnd);
  if (a && a.alive && !a.isfg) { await helper.foreground(s.hwnd); log('focus back to game'); }
  return a;
}

async function afterHandoffLossless(s) {
  const ls = s.ls; if (!ls || !ls.mode) return;
  const live = () => session === s && phase === 'playing';
  // Profile: LS scales by itself after its Auto Scale delay. Watch that time: keep LS's window
  // away and the game focused. Then check that scaling really started.
  const wait = (ls.mode === 'profile' ? Number(ls.delay || 0) + 4 : Number(s.game.losslessScalingDelay || 3)) * 1000;
  const end = Date.now() + wait;
  while (live() && Date.now() < end) {
    if (await hideLsWindow()) log('LS window minimized');
    await keepGameFocused(s);
    if (ls.mode === 'profile' && await lsScaling()) { log('LS auto scale is on'); break; }
    await sleep(500);
  }
  if (!live() || !ls.hotkey) return;
  if (await lsScaling()) return;
  // Not scaling. Press LS's hotkey (a global hotkey, it toggles scaling) only when nothing of LS is
  // on screen, so a scaling window we failed to recognise is never switched off, and only when the
  // game is in front and fills the screen.
  await hideLsWindow();
  const snap = await helper.snap(0, [lossless.EXE]);
  const lsVisible = ((snap && snap.windows) || []).some((x) => x.visible && !x.minimized && x.w > 200 && x.h > 150);
  const a = await keepGameFocused(s);
  const g = a && a.alive ? await helper.alive(s.hwnd) : null;
  if (!live() || lsVisible || !g || !g.isfg || !coversMonitor(g.win)) { log('LS hotkey skipped', { lsVisible, fg: g && g.isfg, full: g && coversMonitor(g.win) }); return; }
  await helper.keys(ls.hotkey.mods, ls.hotkey.vk);
  log('LS hotkey sent', ls.hotkey.label);
  await sleep(700);
  await keepGameFocused(s);
}

async function handoff(s) {
  const expect = s.game.windowMode || state.windowModes[s.game.id] || null;
  const stop = () => session !== s || !runner.running || phase !== 'launching';
  let r = await waitForGameWindow(() => helper.snap(s.pid, s.watchNames), { expect }, { shouldStop: stop });
  log('wait', r.status, r.win && `${r.win.exe} ${r.win.w}x${r.win.h}`, r.waited);
  if (r.status === 'cancelled') return;
  if (!r.win) {
    // No window after a minute: stop covering everything, keep the launch screen and keep looking.
    pinTop(false);
    r = await waitForGameWindow(() => helper.snap(s.pid, s.watchNames), { expect: 'window', timeoutMs: 30 * 60e3, pollMs: 500 }, { shouldStop: stop });
    if (r.status === 'cancelled' || !r.win) return;
  }
  const w = r.win;
  s.hwnd = w.hwnd; s.fullscreen = r.fullscreen;
  if (state.windowModes[s.game.id] !== (r.fullscreen ? 'fullscreen' : 'window')) { state.windowModes[s.game.id] = r.fullscreen ? 'fullscreen' : 'window'; writeJson(FILES.state, state); }
  // The game goes to the front while the launch screen still covers it, then the screen fades away.
  await helper.foreground(w.hwnd);
  send('game-handoff', { id: s.game.id, fullscreen: r.fullscreen });
  await fadeWindow(1, 0, 260);
  if (stop()) { if (win) win.setOpacity(1); return; }
  phase = 'playing';
  closeMenuForGame();
  await keepGameFocused(s);
  afterHandoffLossless(s);
  watchPlaying(s);
}

async function watchPlaying(s) {
  let misses = 0;
  while (session === s && runner.running) {
    await sleep(150);
    if (phase !== 'playing' || session !== s) continue;
    const a = await helper.alive(s.hwnd);
    if (a && a.alive && a.win && coversMonitor(a.win) && state.windowModes[s.game.id] !== 'fullscreen') {
      // It went fullscreen after the handoff: next time wait for that before fading out.
      state.windowModes[s.game.id] = 'fullscreen'; writeJson(FILES.state, state);
    }
    if (!a || a.alive) { misses = 0; continue; }
    // Window gone. Same game with a new window (launcher -> game, renderer restart)?
    const snap = await helper.snap(s.pid, s.watchNames);
    const w = pickMain(snap);
    if (w) { misses = 0; s.hwnd = w.hwnd; continue; }
    if (++misses < 2) continue;
    // The game is closing: bring the menu back right away; the runner reports the exit.
    phase = 'returning';
    openMenu('returning');
    send('game-returning', { id: s.game.id });
    if (snap && Array.isArray(snap.pids) && snap.pids.length === 0) runner.finishNow();
    // If it opens a window again (some games restart themselves), hand off again.
    await sleep(1500);
    if (session === s && runner.running && phase === 'returning') { phase = 'launching'; handoff(s); }
    return;
  }
}

async function resumeGame() {
  const s = session; if (!s) return;
  if (!s.hwnd) { phase = 'launching'; send('game-returning', { id: s.game.id }); pinTop(true); handoff(s); return; }
  phase = 'playing';
  send('game-resumed', { id: s.game.id });
  await sleep(60);
  await helper.foreground(s.hwnd);
  await fadeWindow(1, 0, 200);
  if (phase === 'playing' && session === s) closeMenuForGame();
  else if (win) win.setOpacity(1);
}

async function onMenuFocus() {
  if (phase === 'playing' && session && session.hwnd) {
    // Clicked the backdrop or Alt+Tab to the menu: show home over the game, like the PS button.
    const a = await helper.alive(session.hwnd);
    if (a && a.alive && phase === 'playing') { phase = 'overlay'; send('show-home', { id: session.game.id }); pinTop(true); }
    return;
  }
  if (phase === 'home' || phase === 'overlay' || phase === 'returning') pinTop(true);
}
function onMenuBlur() {
  if (phase === 'home') { pinTop(false); return; }
  if (phase === 'overlay' && session && session.hwnd) {
    // Went back to the game (clicked it, Alt+Tab): the menu turns black and slides behind it.
    helper.alive(session.hwnd).then((a) => { if (phase === 'overlay' && a && a.alive && a.isfg) resumeGame(); else if (phase === 'overlay') pinTop(false); });
  }
}

function homeShortcut() {
  if (session && (phase === 'playing' || phase === 'launching')) {
    phase = 'overlay';
    if (!win) { openMenu('home'); return; }
    send('show-home', { id: session.game.id });
  }
  openMenu(null);
}

async function launchGame(g) {
  if (runner.running) return { ok: false, error: 'Zaten bir oyun açık.' };
  const smooth = seamless();
  if (smooth) { phase = 'launching'; pinTop(true); }
  let ls = null;
  if (g.losslessScaling && (isWin || FAKE)) { try { ls = await prepareLossless(g); } catch (e) { ls = { mode: null, error: e.message }; } }
  const res = runner.launch(g, process.execPath);
  if (!res.ok) { phase = 'home'; return res; }
  session = { game: g, pid: res.pid, watchNames: runner.current.watchNames, hwnd: null, ls };
  if (smooth) handoff(session);
  return { ...res, seamless: smooth, lossless: ls && ls.mode };
}

runner.on('started', (game) => {
  if (!win) return;
  send('game-started', { id: game.id, seamless: seamless() });
  // No window helper (not Windows, or the helper is missing): the old way, hide the menu.
  if (!seamless() && settings.hideOnLaunch !== false) setTimeout(() => { if (runner.running && win) { pinTop(false); win.setFullScreen(false); win.hide(); } }, 700);
});
runner.on('error', (game, e) => { phase = 'home'; session = null; openMenu('exit'); send('game-error', { id: game.id, message: e.message }); });
runner.on('exited', (game, info) => {
  state.lastPlayed[game.id] = Date.now();
  state.playSeconds[game.id] = (state.playSeconds[game.id] || 0) + (info.failed ? 0 : info.seconds);
  state.focusId = game.id;
  writeJson(FILES.state, state);
  phase = 'home'; session = null;
  openMenu('exit');   // once per game session; only games launched from the menu get here
  send('game-exited', { id: game.id, seconds: info.seconds, failed: info.failed });
});

// IPC
ipcMain.handle('init', () => buildInit());
ipcMain.handle('launch', async (_e, id) => {
  const doc = await loadGames();
  const g = doc.games.find((x) => x.id === id);
  if (!g) return { ok: false, error: 'Oyun bulunamadı.' };
  state.lastPlayed[id] = Date.now(); state.focusId = id; writeJson(FILES.state, state);
  return launchGame(g);
});
ipcMain.handle('kill', () => { runner.kill(); return true; });
// ---------- game manager ----------
ipcMain.handle('pick', async (_e, kind, current) => {
  const filters = {
    exe: [{ name: 'Program ya da kısayol', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
    image: [{ name: 'Resim', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  }[kind];
  const props = kind === 'folder' || kind === 'scesys' ? ['openDirectory'] : ['openFile'];
  const titles = { exe: 'Oyunu ya da kısayolunu seç', folder: 'Çalışma klasörünü seç', image: 'Resim seç', scesys: 'PS4 dökümündeki sce_sys klasörünü seç' };
  pinTop(false);
  const r = await dialog.showOpenDialog(win, { title: titles[kind], properties: props, filters, defaultPath: current && fs.existsSync(current) ? current : undefined });
  if (phase === 'home' && win && win.isFocused()) pinTop(true);
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0];
  try {
    if (kind === 'exe') {
      if (/\.lnk$/i.test(f)) { const sc = await readShortcut(f); return { ...sc, badge: emuBadge(sc.exe) }; }
      return { exe: f, args: '', workingDir: '', name: path.basename(f).replace(/\.(exe|bat|cmd)$/i, ''), badge: emuBadge(f) };
    }
    if (kind === 'scesys') return readSceSys(f);
    return { path: f };
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('game-save', async (_e, draft) => {
  const doc = await loadGames();
  let g;
  try { g = library.saveEntry(doc, draft); } catch (e) { return { ok: false, error: e.message }; }
  try {
    if (draft.clearArt) library.clearArt(USER_ASSETS, g.id);
    if (draft.iconFile) library.storeArt(USER_ASSETS, g.id, 'icon', draft.iconFile);
    if (draft.backgroundFile) library.storeArt(USER_ASSETS, g.id, 'background', draft.backgroundFile);
  } catch (e) { saveGames(doc); return { ok: false, error: e.message, id: g.id, init: await buildInit() }; }
  saveGames(doc);
  const ls = g.losslessScaling ? await ensureLsProfile(g) : null;
  return { ok: true, id: g.id, ls, init: await buildInit() };
});
ipcMain.handle('game-move', async (_e, id, delta) => {
  const doc = await loadGames();
  if (library.moveEntry(doc, id, delta)) { saveGames(doc); if (settings.rowOrder !== 'manual') { settings.rowOrder = 'manual'; writeJson(FILES.settings, settings); } }
  return buildInit();
});
ipcMain.handle('game-delete', async (_e, id) => {
  const doc = await loadGames();
  if (runner.running && runner.current.game.id === id) return buildInit();
  if (library.deleteEntry(doc, id)) { saveGames(doc); library.clearArt(USER_ASSETS, id); delete state.lastPlayed[id]; delete state.playSeconds[id]; writeJson(FILES.state, state); }
  return buildInit();
});
ipcMain.handle('save-state', (_e, patch) => { Object.assign(state, patch || {}); writeJson(FILES.state, state); return true; });
ipcMain.handle('set-setting', (_e, key, value) => {
  settings[key] = value; writeJson(FILES.settings, settings);
  if (key === 'autostart' && isWin) app.setLoginItemSettings({ openAtLogin: !!value, path: process.execPath });
  if (key === 'fullscreen' && win) win.setFullScreen(!!value);
  return { ...settings, username: settings.username || OS_USER };
});
ipcMain.handle('hide-game', async (_e, id) => {
  const doc = await loadGames();
  const g = doc.games.find((x) => x.id === id); if (g) g.hidden = true;
  saveGames(doc); return buildInit();
});
ipcMain.handle('open', (_e, what, id) => {
  pinTop(false);
  if (what === 'games-json') return shell.openPath(FILES.games);
  if (what === 'user-assets') return shell.openPath(USER_ASSETS);
  if (what === 'game-folder') {
    const doc = readJson(FILES.games, { games: [] }); const g = doc.games.find((x) => x.id === id);
    if (g && g.exe && fs.existsSync(g.exe)) { shell.showItemInFolder(g.exe); return ''; }
    return 'Klasör bulunamadı';
  }
  return '';
});
ipcMain.handle('window', (_e, cmd) => {
  if (!win) return;
  if (cmd === 'minimize') { pinTop(false); win.setFullScreen(false); win.minimize(); }
  if (cmd === 'hide') { if (session && seamless()) return resumeGame(); pinTop(false); win.setFullScreen(false); win.hide(); }
  if (cmd === 'quit') app.quit();
  if (cmd === 'devtools') win.webContents.toggleDevTools();
});
ipcMain.handle('power', (_e, cmd) => {
  if (!isWin) return false;
  if (cmd === 'shutdown') execFile('shutdown.exe', ['/s', '/t', '0'], { windowsHide: true });
  if (cmd === 'restart') execFile('shutdown.exe', ['/r', '/t', '0'], { windowsHide: true });
  if (cmd === 'sleep') execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true });
  return true;
});
ipcMain.handle('capture', async (_e, file) => {
  if (!win) return null;
  const img = await win.webContents.capturePage();
  const out = file || flagVal('screenshot');
  fs.writeFileSync(out, img.toPNG());
  return out;
});
ipcMain.on('capture-done', () => { if (flag('screenshot') && !flag('keep')) setTimeout(() => app.quit(), 100); });

protocol.registerSchemesAsPrivileged([{ scheme: 'ps5file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }]);

const single = flag('screenshot') || app.requestSingleInstanceLock();
if (!single) app.quit();
app.on('second-instance', () => homeShortcut());

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (flag('screenshot')) app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(() => {
  protocol.handle('ps5file', (req) => {
    const u = new URL(req.url);
    const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
    return net.fetch(pathToFileURL(p).toString());
  });
  createWindow();
  if (process.env.PS5MENU_SELFTEST) require(process.env.PS5MENU_SELFTEST)({ app, win, getWin: () => win, runner, FILES, readJson, getPhase: () => phase, homeShortcut });
  // Start the window helper early so the first launch does not wait for it.
  if (seamless()) helper.snap(0, []).catch(() => {});
  // Bring the menu back from anywhere (keyboard). Controller PS button is handled in the renderer.
  try { globalShortcut.register('CommandOrControl+Alt+Home', () => homeShortcut()); } catch { /* */ }
  if (isWin && settings.autostart) app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
});
app.on('before-quit', () => { quitting = true; helper.close(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); helper.close(); });
// The menu window is closed on purpose during a game; only quit when that is not the case.
app.on('window-all-closed', () => { if (quitting || !session) app.quit(); });
