'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, shell, screen, globalShortcut, powerSaveBlocker, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { resolveArt, emuBadge, readShortcut, readSceSys } = require('./lib/detect');
const library = require('./lib/library');
const { GameRunner } = require('./lib/proc');
const { WinHelper, helperPath, hwndOf, pickMain, waitForGameWindow, coversMonitor } = require('./lib/winwatch');
const lossless = require('./lib/lossless');
const homeflow = require('./lib/homeflow');
const loadprogress = require('./lib/loadprogress.js');
const theme = require('./lib/theme');
const { Updater } = require('./lib/updater');
const { PadWatch } = require('./lib/padwatch');

const isWin = process.platform === 'win32';
const argv = process.argv.slice(1);
const flag = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const flagVal = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };

// Per-user data: %APPDATA%\Definitely Not a Console (games.json, settings.json, state.json, assets\).
// PS5MENU_ROOT (tests, developers) keeps everything under one folder instead.
const ROOT_ENV = process.env.PS5MENU_ROOT || null;
const APP_NAME = 'Definitely Not a Console';
const migrate = require('./lib/migrate');
const DATA = ROOT_ENV ? path.join(ROOT_ENV, 'data') : path.join(app.getPath('appData'), APP_NAME);
const USER_ASSETS = ROOT_ENV ? path.join(ROOT_ENV, 'assets', 'user') : path.join(DATA, 'assets');
const ROOT = ROOT_ENV || DATA;
const BUILTIN = path.join(__dirname, 'assets');
// Console boot intros: the user's own files go here (%APPDATA%\Definitely Not a Console\intro).
const INTRO_DIR = path.join(ROOT, 'intro');
for (const d of [DATA, INTRO_DIR, USER_ASSETS, path.join(USER_ASSETS, 'fonts'), path.join(USER_ASSETS, 'sounds'), path.join(USER_ASSETS, 'games')]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* read-only is fine */ }
}
// Earlier builds were called "PS5 Menu": first %APPDATA%\PS5 Menu, before that data\ next to the
// exe (portable zip). Bring the newest of those over once so existing libraries keep working.
let migration = { migrated: false };
// 1.5.0 rename: %APPDATA%\Definitely Not PS5 Menu -> %APPDATA%\Definitely Not a Console (copied, the
// old folder stays). PS5MENU_OLD_DATA points tests at an old folder of their own.
const OLD_DATA = process.env.PS5MENU_OLD_DATA || (ROOT_ENV ? null : path.join(app.getPath('appData'), migrate.OLD_NAME));
try { if (OLD_DATA) migration = migrate.migrateRename({ fromDir: OLD_DATA, dataDir: DATA }); } catch (e) { migration = { migrated: false, error: e.message }; }
if (!ROOT_ENV && !migration.migrated) {
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
  bootIntro: 'once',         // once (console boot intro once per app start, per console) | off
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
  homeEsc: true,             // hold Esc during a game: pause it and go to the menu
  homeEscMs: 1000,
  homePad: true,             // same with the controller's Xbox button (or View+Menu together)
  homePadMs: 1000,
  // 1.5: the focused game's own music and picture, like a console
  themeMusic: true,
  switchTheme: 'white',      // Switch HOME Menu: white | black (like the console's Basic White / Basic Black)
  themeVolume: 0.5,
  theme: true,
  ffmpegPath: '',            // empty: <data>\tools\ffmpeg.exe or ffmpeg on PATH
  padOpen: true,             // dnac-padwatch.exe opens the menu when a controller connects (HKCU Run)
  padBattery: true,          // wireless controller battery in the corner
  consoleMode: false,        // with Windows, straight into the menu; saved settings come back when off
};

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8'); return true; } catch { return false; } };
// A data file that exists but cannot be read (cut off, edited by hand, not an object) is kept as
// <name>.bozuk-<time> before the menu goes on with defaults, so a later save cannot wipe it for good.
const kept = new Set();
const readObj = (f, d) => {
  let raw = null; try { raw = fs.readFileSync(f, 'utf8'); } catch { return d; }
  let v; try { v = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { v = undefined; }
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (raw.trim() && !kept.has(f)) { kept.add(f); try { fs.copyFileSync(f, `${f}.bozuk-${new Date().toISOString().replace(/[:.]/g, '-')}`); } catch { /* read-only */ } }
  return d;
};

let settings = { ...DEFAULT_SETTINGS, ...readObj(FILES.settings, {}) };
const os = require('os');
const OS_USER = (() => { try { return require('os').userInfo().username; } catch { return ''; } })();
let state = readObj(FILES.state, { lastPlayed: {}, playSeconds: {}, focusId: null });
for (const k of ['lastPlayed', 'playSeconds', 'windowModes', 'loadStats']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};

async function loadGames() {
  const doc = readObj(FILES.games, null) || { version: 1, games: [] };
  // PowerShell 5's ConvertTo-Json can turn a one-game list into a bare object
  if (doc.games && typeof doc.games === 'object' && !Array.isArray(doc.games) && (doc.games.id || doc.games.exe)) doc.games = [doc.games];
  if (!Array.isArray(doc.games)) doc.games = [];
  doc.games = doc.games.filter((g) => g && typeof g === 'object' && !Array.isArray(g));
  // hand-edited entries: a missing id or a non-text title used to stop the whole menu from loading
  const taken = new Set(doc.games.map((g) => (typeof g.id === 'string' && g.id ? g.id : null)).filter(Boolean));
  for (const g of doc.games) {
    if (g.title != null && typeof g.title !== 'string') g.title = String(g.title);
    if (typeof g.id !== 'string' || !g.id) { g.id = library.makeId(g.title || (typeof g.exe === 'string' && path.basename(g.exe, path.extname(g.exe))) || 'oyun', taken); taken.add(g.id); }
    if (!g.title) g.title = typeof g.exe === 'string' && g.exe ? path.basename(g.exe, path.extname(g.exe)) : g.id;
    if (g.exe != null && typeof g.exe !== 'string') g.exe = '';
  }
  return doc;
}
let padwatch = null;   // set below once the Run key is known
const saveGames = (doc) => { const ok = writeJson(FILES.games, doc); if (padwatch) padwatch.writeList(doc.games); return ok; };

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

// Boot intro files, in this order: <kind>-boot.mp4/.webm (played full screen with its own sound,
// instead of the drawn animation); otherwise the drawn animation with <kind>-boot.wav/.mp3/.ogg as
// its sound and <kind>-logo.png as its mark; files that are missing fall back to the original ones.
// Logos go to the page as data URLs: the page reads their pixels (to split sphere/word or symbol/word),
// which a ps5file:// picture (another origin) would not allow.
const pngData = (f) => { try { const b = fs.readFileSync(f); return b.length < 8 * 1024 * 1024 ? `data:image/png;base64,${b.toString('base64')}` : null; } catch { return null; } };
function listIntroFiles() {
  const find = (base, exts) => { for (const ext of exts) { for (const n of [`${base}.${ext}`, `${base}.${ext.toUpperCase()}`]) { const f = path.join(INTRO_DIR, n); if (fs.existsSync(f)) return fileUrl(f); } } return null; };
  // intro.json (optional) trims a video without changing the file: {"ps5": {"start": 1.02, "end": 13.8}}
  // in seconds; end is where the fade into the menu starts (the video keeps playing under it).
  let trim = {};
  try { trim = JSON.parse(fs.readFileSync(path.join(INTRO_DIR, 'intro.json'), 'utf8')) || {}; } catch { /* none */ }
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const one = (k) => {
    const tr = trim[k] || trim[`${k}-boot`] || {};
    return { video: find(`${k}-boot`, ['mp4', 'webm']), audio: find(`${k}-boot`, ['wav', 'mp3', 'ogg']), logo: pngData(path.join(INTRO_DIR, `${k}-logo.png`)), start: num(tr.start), end: num(tr.end) };
  };
  return { dir: INTRO_DIR, ps5: one('ps5'), x360: one('x360'), switch: one('switch') };
}
// Which boot intros already played since the app started. Kept here, not in the window, because the
// window is made again after a game and that must not count as a new start.
const bootShown = { ps5: false, x360: false, switch: false };

// ---------- theme: the game's music and picture (lib/theme.js) ----------
const THEME_CACHE = path.join(DATA, 'cache', 'theme');
const ffmpegExe = () => theme.findFfmpeg({ setting: settings.ffmpegPath, dataDir: DATA });
const converter = new theme.Converter({ ffmpeg: ffmpegExe, busy: () => runner.running, log: (...a) => log(...a) });
const accentCache = new Map();
function accentOf(file) {
  if (!file) return null;
  let key = file; try { key += '|' + fs.statSync(file).mtimeMs; } catch { return null; }
  if (accentCache.has(key)) return accentCache.get(key);
  let c = null;
  try {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) { const sm = img.resize({ width: 32, quality: 'good' }); c = theme.accentFromPixels(sm.toBitmap(), { bgra: true }); }
  } catch { c = null; }
  accentCache.set(key, c);
  return c;
}
function themeOf(g, art) {
  const m = theme.resolveMusic(g, art, { userGamesDir: path.join(USER_ASSETS, 'games'), cacheDir: THEME_CACHE });
  if (m.source === 'sce-pending') {
    const queued = converter.add({ id: g.id, at9: m.at9, cache: m.cache }, (ok) => { if (ok) send('theme-update', { id: g.id, music: [fileUrl(m.cache)], source: 'sce' }); });
    if (!queued && !ffmpegExe()) m.source = 'sce-noffmpeg';
  }
  const pic = art.background || art.cover || art.icon || null;
  return {
    music: m.files.map(fileUrl), musicSource: m.source, musicFiles: m.files, shuffle: !!g.musicShuffle,
    accent: g.accent || accentOf(pic), accentAuto: !g.accent,
  };
}

async function buildInit() {
  const doc = await loadGames();
  const all = [];
  for (const [i, g] of doc.games.entries()) {
    const art = resolveArt(g, path.join(USER_ASSETS, 'games'), settings.dumpRoots || []);
    if (g.themeBg === 'off') art.background = null;
    all.push({
      ...g, order: i,
      art: { icon: fileUrl(art.icon), background: fileUrl(art.background), logo: fileUrl(art.logo), cover: fileUrl(art.cover), exeIcon: art.icon ? null : await exeIcon(g.exe) },
      artPaths: art,
      installed: !!(g.exe && (fs.existsSync(g.exe) || process.env.PS5MENU_DEMO)),
      lastPlayed: state.lastPlayed[g.id] || 0,
      playSeconds: state.playSeconds[g.id] || 0,
      theme: themeOf(g, art),
    });
  }
  // x360Scene: a fixed Xbox 360 dashboard scene used only by the reference comparison (tools/x360).
  const scene = settings.x360Scene ? JSON.parse(JSON.stringify(settings.x360Scene)) : null;
  if (scene) {
    if (scene.avatar) scene.avatar = fileUrl(scene.avatar);
    for (const p of scene.panels || []) for (const t of p.tiles || []) if (t.image) t.image = fileUrl(t.image);
  }
  // switchScene: the same for the Switch HOME Menu (tools/switch).
  const nscene = settings.switchScene ? JSON.parse(JSON.stringify(settings.switchScene)) : null;
  if (nscene) {
    if (nscene.avatar) nscene.avatar = fileUrl(nscene.avatar);
    for (const t of nscene.tiles || []) if (t.image) t.image = fileUrl(t.image);
  }
  return {
    games: all.filter((g) => !g.hidden), allGames: all, settings: { ...settings, username: settings.username || OS_USER, x360Scene: scene, switchScene: nscene }, state, user: listUserAssets(), boot: { files: listIntroFiles(), shown: { ...bootShown } }, platform: process.platform,
    paths: { root: ROOT, data: DATA, games: FILES.games, userAssets: USER_ASSETS },
    running: runner.running ? runner.current.game.id : null,
    paused: !!(session && (phase === 'paused' || phase === 'pausing' || phase === 'overlay')),
    suspended: !!(session && session.suspended),
    version: app.getVersion(),
    ffmpeg: !!ffmpegExe(),
    lossless: { installed: !!((isWin || FAKE) && lsOps.findExe(settings.losslessScalingExe)) || !!process.env.PS5MENU_FAKE_LS },
    migration,
  };
}

function mediaResponse(p, range) {
  let size; try { size = fs.statSync(p).size; } catch { return new Response('not found', { status: 404 }); }
  const type = /\.webm$/i.test(p) ? 'video/webm' : 'video/mp4';
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0, end = size - 1, status = 200;
  if (m) {
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); } else { start = Number(m[1] || 0); if (m[2] !== '') end = Math.min(size - 1, Number(m[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    status = 206;
  }
  const body = Readable.toWeb(fs.createReadStream(p, { start, end }));
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status, headers });
}

const runner = new GameRunner();
// Controller connects -> menu (bin/dnac-padwatch.exe). Tests use a JSON file for the Run key.
const runKey = process.env.PS5MENU_FAKE_REG ? migrate.fileRun(process.env.PS5MENU_FAKE_REG) : isWin ? migrate.regRun(require('child_process').execFileSync) : null;
padwatch = runKey ? new PadWatch({ binDir: path.join(__dirname, 'bin'), menuExe: process.execPath, dataDir: DATA, reg: runKey, isWin, log: (...a) => log(...a) }) : null;
// Konsol modu: start with Windows, no "press A" screen, controller opens the menu. Turning it off
// puts back exactly what was there before.
function setConsoleMode(on) {
  if (on && !settings.consoleMode) {
    settings.consoleModePrev = { autostart: !!settings.autostart, padOpen: settings.padOpen !== false, intro: settings.intro };
    Object.assign(settings, { autostart: true, padOpen: true, intro: 'none' });
  } else if (!on && settings.consoleMode) {
    Object.assign(settings, settings.consoleModePrev || { autostart: false });
    delete settings.consoleModePrev;
  }
}
// Wireless controller battery: asked every 30 s while the menu is up (not during a game).
let lastBattery = null;
async function pollBattery() {
  if (settings.padBattery === false || runner.running || !win || win.isDestroyed() || !win.isVisible() || !helper.available || !helper.battery || !(isWin || FAKE)) return;
  try { const b = await helper.battery(); const k = JSON.stringify(b && b.pads); if (k !== lastBattery) { lastBattery = k; send('pad-battery', b); } } catch { /* */ }
}
// Port updates (Ayarlar > Güncellemeler). Tests point it at a fake GitHub; other tests stay offline.
const robocopy = (src, dst) => { try { require('child_process').execFileSync('robocopy.exe', [src, dst, '/E', '/COPY:DAT', '/DCOPY:T', '/R:1', '/W:1', '/MT:8', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true, stdio: 'ignore' }); } catch (e) { if (!(e.status >= 0 && e.status < 8)) throw new Error(`robocopy ${e.status}`); } };
const updater = new Updater({
  dataDir: DATA, games: async () => (await loadGames()).games, busy: () => runner.running,
  api: process.env.PS5MENU_GH_API || 'https://api.github.com', feedUrl: process.env.PS5MENU_FEED_URL || undefined,
  net: !!process.env.PS5MENU_GH_API || !(process.env.PS5MENU_SELFTEST || flag('screenshot') || ROOT_ENV),
  copyTree: isWin ? robocopy : null, log: (...a) => log('[updates]', ...a), onChange: () => send('updates-changed', updater.view()),
  ...(process.env.PS5MENU_FAKE_PROCS ? { names: async () => new Set(readJson(process.env.PS5MENU_FAKE_PROCS, [])) } : {}),
});
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
  me.ready = new Promise((res) => me.once('ready-to-show', () => setTimeout(res, reopen ? 340 : 0)));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: q });
  win.webContents.on('did-finish-load', () => { const p = pending.splice(0); for (const [ch, d] of p) if (!me.isDestroyed()) me.webContents.send(ch, d); });
  win.once('ready-to-show', () => {
    if (me.isDestroyed()) return;
    if (reopen) me.setOpacity(0);
    if (!flag('offscreen')) me.show();
    pinTop(true); me.focus(); me.moveTop();
    // From a game (hold Esc / Xbox button) Windows may keep the focus on the game; the helper takes it.
    if (reopen === 'home' && seamless() && !FAKE) helper.foreground(hwndOf(me)).catch(() => {});
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
  // Only closeMenuForGame() closes it without quitting. With a game still open the menu first asks
  // whether the game goes too.
  win.on('close', (e) => {
    if (me.forGame) return;
    if (needsQuitQuestion()) { e.preventDefault(); askQuit(); return; }
    quitting = true; helper.close();
  });
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
  const prof = lossless.profileFor(xml, g.exe, g.title);
  // A profile the menu made earlier with a longer Auto Scale delay: shorten it to 1 s (the menu now
  // waits for the game window itself, so LS does not have to wait on top).
  const tune = prof && lossless.isMenuProfile(prof.title) && prof.autoScale && prof.autoScaleDelay > lossless.MENU_DELAY;
  if (prof && !tune) return { ok: true, existed: true };
  const snap = await helper.snap(0, [lossless.EXE]);
  if (snap && snap.pids && snap.pids.length) return { ok: !!prof, existed: !!prof, reason: 'running' };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  try {
    fs.copyFileSync(xp, `${xp}.bak-ps5menu-${stamp}`);
    if (tune) { fs.writeFileSync(xp, lossless.setAutoScaleDelay(xml, prof.title, lossless.MENU_DELAY), 'utf8'); return { ok: true, existed: true, tuned: true }; }
    fs.writeFileSync(xp, lossless.addProfile(xml, { title: `${g.title} (${APP_NAME})`, exePath: g.exe, delay: lossless.MENU_DELAY }), 'utf8');
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

// ---------- black cover ----------
// A plain black window per monitor, always on top, never focusable and click-through, so it never
// takes input from the game. It hides every switch (menu <-> game, Lossless Scaling on/off) so that
// no other window or the desktop is ever seen in between. A watchdog removes it in any case.
let covers = []; let coverDog = null;
function displaysFor(rects) {
  const all = screen.getAllDisplays();
  const rs = (rects || []).filter((r) => r && r.w > 0 && r.h > 0);
  if (!rs.length) return all;
  const hit = all.filter((d) => rs.some((r) => {
    const q = isWin ? screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h }) : { x: r.x, y: r.y, width: r.w, height: r.h };
    const b = d.bounds;
    return q.x < b.x + b.width && q.x + q.width > b.x && q.y < b.y + b.height && q.y + q.height > b.y;
  }));
  return hit.length ? hit : all;
}
function armCoverDog(ms) { clearTimeout(coverDog); coverDog = setTimeout(() => { log('cover watchdog'); hideCover(150); }, ms); }
async function showCover(rects = [], { fadeInMs = 0, watchdogMs = 6000 } = {}) {
  if (!canTop()) return false;
  armCoverDog(watchdogMs);
  if (covers.length) { for (const c of covers) if (!c.isDestroyed()) { c.setOpacity(1); c.setAlwaysOnTop(true, 'screen-saver'); c.moveTop(); } return true; }
  const list = displaysFor(rects).map((d) => {
    const c = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, show: false, frame: false,
      backgroundColor: '#000000', focusable: false, skipTaskbar: true, resizable: false, movable: false, minimizable: false,
      enableLargerThanScreen: true, hasShadow: false, title: `${APP_NAME} cover`,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    c.isCover = true;
    c.setIgnoreMouseEvents(true);
    c.setAlwaysOnTop(true, 'screen-saver');
    return c;
  });
  covers = list;
  await Promise.all(list.map((c) => new Promise((res) => { c.once('ready-to-show', res); setTimeout(res, 1500); c.loadURL('data:text/html,<html style="background:%23000;cursor:none"></html>').catch(res); })));
  for (const c of list) {
    if (c.isDestroyed()) continue;
    if (fadeInMs) c.setOpacity(0);
    c.showInactive(); c.setAlwaysOnTop(true, 'screen-saver'); c.moveTop();
  }
  if (fadeInMs) {
    const steps = Math.max(1, Math.round(fadeInMs / 16));
    for (let i = 1; i <= steps; i++) { for (const c of list) if (!c.isDestroyed()) c.setOpacity(i / steps); await sleep(16); }
  }
  await sleep(50);   // a few compositor frames: the black is on screen before anything moves behind it
  log('cover up', list.length);
  return true;
}
async function hideCover(fadeMs = 250) {
  const list = covers; covers = []; clearTimeout(coverDog);
  if (!list.length) return;
  const steps = Math.max(1, Math.round(fadeMs / 16));
  if (fadeMs) for (let i = steps - 1; i >= 0; i--) { for (const c of list) if (!c.isDestroyed()) c.setOpacity(i / steps); await sleep(16); }
  for (const c of list) if (!c.isDestroyed()) c.destroy();
  log('cover down');
}
const lsOutputRects = async () => { const snap = await helper.snap(0, [lossless.EXE]); return ((snap && snap.windows) || []).filter((x) => x.visible && !x.minimized && coversMonitor(x) && !isLsMain(x)); };

// Lossless Scaling after the game is in front (launch and Devam Et). The game first gets a moment to
// paint. At launch a short Auto Scale (the menu's own profiles use 1 s) is waited for; otherwise, and
// always on Devam Et, LS's hotkey is pressed at once, but only when LS is not scaling already, so it
// is never toggled off. If Auto Scale then switches it off again (double toggle), it is pressed once
// more. Returns when LS's output is up or it gave up.
async function engageLossless(s, why) {
  const ls = s.ls; const live = () => session === s && phase === 'playing';
  await sleep(400);
  if (!ls || !ls.mode || !live()) return 'off';
  const delay = ls.mode === 'profile' ? Number(ls.delay || 0) : 0;
  const t0 = Date.now();
  if (why === 'launch' && ls.mode === 'profile' && delay <= 2) {
    while (live() && Date.now() - t0 < delay * 1000 + 900) {
      if (await lsScaling()) { log('LS auto scale is on'); return 'auto'; }
      await hideLsWindow(); await keepGameFocused(s); await sleep(120);
    }
  }
  if (!live()) return 'off';
  if (await lsScaling()) return 'already';
  if (!ls.hotkey) return 'nohotkey';
  if (!await pressLsHotkey(s)) return 'skipped';
  for (let i = 0; i < 20 && live(); i++) { if (await lsScaling()) break; await sleep(100); }
  if (ls.mode === 'profile') guardScaling(s, delay * 1000 + 2500);
  return 'hotkey';
}
async function pressLsHotkey(s) {
  // Only when nothing of LS is on screen (a scaling window we failed to recognise is never switched
  // off) and the game is in front and fills the screen.
  await hideLsWindow();
  const snap = await helper.snap(0, [lossless.EXE]);
  const lsVisible = ((snap && snap.windows) || []).some((x) => x.visible && !x.minimized && x.w > 200 && x.h > 150);
  const a = await keepGameFocused(s);
  const g = a && a.alive ? await helper.alive(s.hwnd) : null;
  if (lsVisible || !g || !g.isfg || !coversMonitor(g.win)) { log('LS hotkey skipped', { lsVisible, fg: g && g.isfg, full: g && coversMonitor(g.win) }); return false; }
  await helper.keys(s.ls.hotkey.mods, s.ls.hotkey.vk);
  log('LS hotkey sent', s.ls.hotkey.label);
  return true;
}
async function guardScaling(s, ms) {
  const live = () => session === s && phase === 'playing';
  const end = Date.now() + ms; let was = await lsScaling();
  while (live() && Date.now() < end) {
    await sleep(150);
    const now = await lsScaling();
    if (was && !now && live()) {
      const a = await helper.alive(s.hwnd);
      if (a && a.alive && a.isfg) { log('LS went off right after our hotkey (Auto Scale toggled it), pressing once more'); await helper.keys(s.ls.hotkey.mods, s.ls.hotkey.vk); }
      return;
    }
    was = now;
  }
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
  // A game that loads for long before its first picture (shader cache): the launch screen shows its
  // progress, and the game is shown only when that is over.
  if (s.load) { await s.load.done; if (stop()) return; }
  const w = r.win;
  s.hwnd = w.hwnd; s.fullscreen = r.fullscreen;
  if (state.windowModes[s.game.id] !== (r.fullscreen ? 'fullscreen' : 'window')) { state.windowModes[s.game.id] = r.fullscreen ? 'fullscreen' : 'window'; writeJson(FILES.state, state); }
  // The menu fades to black (a cover over everything), the menu window goes, the game comes to the
  // front behind the cover and paints; with Lossless Scaling the cover stays until LS's output is
  // up. Then the cover fades out (250 ms). Without a cover (windowed mode) the old fade is used.
  send('game-handoff', { id: s.game.id, fullscreen: r.fullscreen });
  const covered = await showCover([w], { fadeInMs: 200, watchdogMs: 9000 });
  if (!covered) { await helper.foreground(w.hwnd); await fadeWindow(1, 0, 260); }
  if (stop()) { if (win) win.setOpacity(1); hideCover(0); return; }
  phase = 'playing';
  closeMenuForGame();
  await helper.foreground(w.hwnd);
  await keepGameFocused(s);
  armHome(s);
  watchPlaying(s);
  const how = await engageLossless(s, 'launch');
  log('launch LS', how);
  await hideCover(250);
}

// Loading progress of the game (lib/loadprogress.js) on the launch screen, while the game's own
// window is still blank. s.load.done resolves when it is over, could not be followed, or the
// launch ended; the handoff waits for it.
function trackLoad(s) {
  let cfg = null; try { cfg = loadprogress.resolve(s.game); } catch (e) { log('load progress', e.message); }
  if (!cfg) return;
  const id = s.game.id;
  const w = new loadprogress.Watcher(cfg, { t0: s.t0, learned: state.loadStats[id] || null });
  log('load progress', cfg.preset || 'custom', cfg.log, `items ${w.items}`, `expected ${w.expected ? Math.round(w.expected) + ' ms' : '-'}`, `limit ${Math.round(w.maxMs / 1000)} s`);
  const live = () => session === s && runner.running && (phase === 'launching' || phase === 'overlay');
  s.load = { cfg, w, done: (async () => {
    let last = ''; let checked = 0; let hungSince = 0; let goneCount = 0;
    while (live()) {
      let v; try { v = w.poll(); } catch (e) { log('load progress', e.message); break; }
      // About once a second: is the game still there, and does its window still respond?
      if (Date.now() - checked > 1000 && !w.finished()) {
        checked = Date.now();
        const snap = await helper.snap(s.pid, s.watchNames).catch(() => null);
        if (snap && Array.isArray(snap.pids) && snap.pids.length === 0) { if (++goneCount >= 3) w.abort('exited'); } else goneCount = 0;
        const mw = snap && pickMain(snap);
        const a = mw ? await helper.alive(mw.hwnd).catch(() => null) : null;
        if (a && a.alive && a.hung) { hungSince ||= Date.now(); if (Date.now() - hungSince >= HUNG_MS) w.abort('hung'); } else hungSince = 0;
        v = w.view();
      }
      const msg = JSON.stringify(v);
      if (msg !== last) { last = msg; send('launch-progress', { id, ...v }); }
      if (w.finished()) break;
      await sleep(200);
    }
    const v = w.view();
    log('load progress end', v.state, w.measured() ? `${w.measured()} ms` : '', `${Math.round((Date.now() - s.t0) / 1000)} s`);
    if (v.state === 'ready') {
      state.loadStats[id] = loadprogress.learn(state.loadStats[id], w.measured(), w.items); writeJson(FILES.state, state);
      await sleep(cfg.settleMs);
      return;
    }
    if (v.state === 'exited') { await sleep(1500); return; }   // the runner reports the exit
    if (!live()) return;   // the game ended (the runner brings the menu back) or the launch was left
    // The estimate ran out for a game whose log is buffered (the ready line comes late): a normal end.
    if (v.state === 'due' && cfg.graceQuiet) {
      send('launch-progress', { id, ...v, state: 'ready', pct: 100 });
      await sleep(cfg.settleMs);
      return;
    }
    // Waiting any longer would not help: say why on the launch screen for a moment, then show the
    // game as it is (holding Esc / the Xbox button brings the menu back, where it can be closed).
    send('launch-progress', { id, ...v });
    if (['stalled', 'hung', 'timeout', 'due', 'failed'].includes(v.state)) await sleep(LOAD_NOTICE_MS);
  })() };
}
const HUNG_MS = Number(process.env.PS5MENU_HUNG_MS) || 10e3;
const LOAD_NOTICE_MS = Number(process.env.PS5MENU_LOAD_NOTICE_MS) || 2500;

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
    if (s.closing) return;
    disarmHome();
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

// ---------- home during a game: pause, menu, continue ----------
// phase 'paused': the menu is up over a running game that is minimized and (per game, default on)
// suspended. 'overlay' is the same for a game that is still starting (no window yet).
function armHome(s) {
  if (!seamless() || !helper.watch || session !== s) return;
  const t = homeflow.triggers(settings);
  if (!t.esc && !t.pad) { helper.unwatch(); return; }
  helper.watch(t).then((r) => { s.watchInfo = r; log('watch', r); });
}
function disarmHome() { if (helper.unwatch && (isWin || FAKE)) helper.unwatch(); }
helper.onEvent = (e) => { if (e && e.event === 'home') onHomeTrigger(e.src); };

async function onHomeTrigger(src) {
  const s = session;
  if (!s || phase !== 'playing' || s.busy) return;
  const snap = await helper.snap(s.pid, s.watchNames);
  const ls = await helper.snap(0, [lossless.EXE]);
  if (!homeflow.triggerAccepted(snap, s.hwnd, ls)) { log('home ignored: the game is not in front', src); armHome(s); return; }
  log('home from', src);
  goHome(s);
}

// LS is scaling (its output window covers the screen): press its hotkey once to stop it.
const readLsXml = () => { try { return fs.readFileSync(lsOps.settingsPath(), 'utf8'); } catch { return ''; } };
async function stopLossless(s) {
  if (!(isWin || FAKE) || !await lsScaling()) return false;
  const hk = (s.ls && s.ls.hotkey) || lossless.hotkey(readLsXml());
  if (!hk) return false;
  await helper.keys(hk.mods, hk.vk);
  for (let i = 0; i < 10 && await lsScaling(); i++) await sleep(100);
  log('LS stopped for the menu');
  return true;
}

async function goHome(s) {
  if (session !== s || s.busy) return;
  s.busy = true;
  phase = 'pausing';
  disarmHome();
  try {
    const a = await helper.alive(s.hwnd);
    if (a && a.win) s.rect = a.win;
    // Black first, on every monitor the game or LS's output is on, before anything changes.
    await showCover([s.rect, ...(await lsOutputRects())], { watchdogMs: 8000 });
    s.lsWasOn = await stopLossless(s);
    openMenu('home');
    send('show-home', { id: s.game.id, paused: true, suspended: homeflow.suspendWanted(s.game) });
    const w = win;
    if (w) await Promise.race([w.ready, sleep(4000)]);
    if (session !== s) return;
    // The menu covers everything now: put the game away, then freeze it (its sound stops with it).
    await helper.minimize(s.hwnd);
    for (let i = 0; i < 12; i++) { const b = await helper.alive(s.hwnd); if (!b || !b.alive || b.minimized) break; await sleep(50); }
    if (homeflow.suspendWanted(s.game)) {
      const snap = await helper.snap(s.pid, s.watchNames);
      const lsSnap = await helper.snap(0, [lossless.EXE]);
      const pids = homeflow.pausePids(snap, [process.pid, ...((lsSnap && lsSnap.pids) || [])]);
      const r = pids.length ? await helper.suspend(pids) : null;
      s.suspended = r && r.suspended ? pids : null;
      log('paused', pids, r);
    }
    if (session === s) { phase = 'paused'; send('game-paused', { id: s.game.id, suspended: !!s.suspended }); }
  } finally { s.busy = false; hideCover(0); }
}

async function resumeGame() {
  const s = session; if (!s || s.busy) return;
  if (!s.hwnd) { phase = 'launching'; send('game-returning', { id: s.game.id }); pinTop(true); handoff(s); return; }
  s.busy = true;
  let covered = false;
  try {
    phase = 'resuming';
    send('game-resumed', { id: s.game.id });
    // The menu fades to black, the cover takes over; the game comes back behind it.
    covered = await showCover([s.rect], { fadeInMs: 160, watchdogMs: 8000 });
    if (s.suspended) { await helper.resume(s.suspended); s.suspended = null; }
    await helper.restore(s.hwnd);
    let a = null;
    for (let i = 0; i < 30; i++) { a = await helper.alive(s.hwnd); if (!a || !a.alive || !a.minimized) break; await sleep(50); }
    const fix = homeflow.placeBack(s.rect, a && a.win);
    if (fix) { await helper.place(s.hwnd, fix); log('window put back', fix); }
    await helper.foreground(s.hwnd);
    phase = 'playing';
    if (!covered) await fadeWindow(1, 0, 200);
    if (phase === 'playing' && session === s) closeMenuForGame();
    else if (win) win.setOpacity(1);
  } finally { s.busy = false; }
  if (session !== s || phase !== 'playing') { hideCover(0); return; }
  await keepGameFocused(s);
  armHome(s);
  // Lossless Scaling again at once (hotkey, only if it is not scaling), under the cover.
  if ((!s.ls || !s.ls.mode) && s.lsWasOn) s.ls = { mode: 'hotkey', hotkey: lossless.hotkey(readLsXml()) };
  const how = await engageLossless(s, 'resume');
  log('resume LS', how);
  await hideCover(250);
}

// Close the running game: resume, WM_CLOSE, ~5 s, then end it. quiet: the menu is already up and
// stays as it is (switching games, quitting).
async function closeRunningGame({ quiet = false } = {}) {
  if (!runner.running) return { ok: true, how: 'none' };
  const cur = runner.current; const s = session;
  if (s) { s.quiet = quiet; s.closing = true; }
  disarmHome();
  const exited = new Promise((res) => { const f = (g) => { if (g === cur.game) { runner.off('exited', f); res(true); } }; runner.on('exited', f); });
  let r;
  if ((isWin || FAKE) && helper.available) {
    r = await homeflow.closeGracefully({ helper, pickMain, hwnd: s && s.hwnd, snapFn: () => helper.snap(cur.pid, cur.watchNames), log });
    if (s) s.suspended = null;
    if (r.how !== 'stuck') runner.finishNow();
  } else { runner.kill(); r = { how: 'kill' }; }
  await Promise.race([exited, sleep(8000)]);
  log('game closed', r);
  return { ok: !runner.running, how: r.how };
}

// ---------- quitting while a game is open ----------
let quitConfirmed = false;
const needsQuitQuestion = () => runner.running && !quitConfirmed && !quitting && !!win && !win.isDestroyed() && !win.webContents.isLoading();
function askQuit() {
  const g = runner.current && runner.current.game;
  if (win) showLauncher();
  send('confirm-quit', { id: g && g.id, title: g && g.title });
}
async function quitApp(mode) {
  quitting = true; quitConfirmed = true;        // from here on nothing opens the menu again
  disarmHome();
  if (mode === 'both') await closeRunningGame({ quiet: true });
  else if (session && session.hwnd) {
    // Only the menu goes: the game continues on its own, in front.
    if (session.suspended) { await helper.resume(session.suspended); session.suspended = null; }
    await helper.restore(session.hwnd); await sleep(150); await helper.foreground(session.hwnd);
  }
  app.quit();
}

async function onMenuFocus() {
  if (phase === 'playing' && session && session.hwnd && !session.busy) {
    // Clicked the backdrop or Alt+Tab to the menu: show home over the game, like the PS button.
    const a = await helper.alive(session.hwnd);
    if (a && a.alive && phase === 'playing') { phase = 'overlay'; send('show-home', { id: session.game.id }); pinTop(true); }
    return;
  }
  if (phase === 'home' || phase === 'overlay' || phase === 'paused' || phase === 'returning') pinTop(true);
}
function onMenuBlur() {
  if (phase === 'home') { pinTop(false); return; }
  if (phase === 'paused' && session && session.suspended) { pinTop(false); return; }   // a frozen game cannot come to the front
  if (phase === 'paused' && session && session.hwnd) {
    // Not frozen (switched off for this game) and the user went back to it by hand: continue.
    helper.alive(session.hwnd).then((a) => { if (phase === 'paused' && a && a.alive && a.isfg && !a.minimized) resumeGame(); else if (phase === 'paused') pinTop(false); });
    return;
  }
  if (phase === 'overlay' && session && session.hwnd) {
    // Went back to the game (clicked it, Alt+Tab): the menu turns black and slides behind it.
    helper.alive(session.hwnd).then((a) => { if (phase === 'overlay' && a && a.alive && a.isfg) resumeGame(); else if (phase === 'overlay') pinTop(false); });
  }
}

function homeShortcut() {
  if (session && phase === 'playing' && seamless() && session.hwnd) { goHome(session); return; }
  if (session && phase === 'paused') { openMenu(null); return; }
  if (session && phase === 'launching') {
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
  const t0 = Date.now();
  const res = runner.launch(g, process.execPath);
  if (!res.ok) { phase = 'home'; return res; }
  session = { game: g, pid: res.pid, watchNames: runner.current.watchNames, hwnd: null, ls, t0 };
  if (smooth) { trackLoad(session); handoff(session); }
  return { ...res, seamless: smooth, lossless: ls && ls.mode };
}

runner.on('started', (game) => {
  if (padwatch) padwatch.gameState(true);
  if (!win) return;
  send('game-started', { id: game.id, seamless: seamless() });
  // No window helper (not Windows, or the helper is missing): the old way, hide the menu.
  if (!seamless() && settings.hideOnLaunch !== false) setTimeout(() => { if (runner.running && win) { pinTop(false); win.setFullScreen(false); win.hide(); } }, 700);
});
runner.on('error', (game, e) => { phase = 'home'; session = null; openMenu('exit'); send('game-error', { id: game.id, message: e.message }); });
runner.on('exited', (game, info) => {
  if (padwatch) padwatch.gameState(false);
  lastBattery = null; setTimeout(pollBattery, 1500);
  state.lastPlayed[game.id] = Date.now();
  state.playSeconds[game.id] = (state.playSeconds[game.id] || 0) + (info.failed ? 0 : info.seconds);
  if (!info.failed && info.seconds > 0) {
    // session log for the statistics screen (last 400 sessions)
    state.sessions = (Array.isArray(state.sessions) ? state.sessions : []).concat([{ id: game.id, end: Date.now(), sec: Math.round(info.seconds) }]).slice(-400);
  }
  state.focusId = game.id;
  writeJson(FILES.state, state);
  const quiet = session && session.game === game && session.quiet;
  phase = 'home'; session = null;
  disarmHome();
  if (quiet) return;  // closed from the menu to start another game or to quit: the menu is already up
  openMenu('exit');   // once per game session; only games launched from the menu get here
  send('game-exited', { id: game.id, seconds: info.seconds, failed: info.failed });
});

// IPC
ipcMain.handle('init', () => buildInit());
ipcMain.handle('updates', async (_e, cmd, id, arg) => {
  if (cmd === 'view') { await updater.doc(); return updater.view(); }
  if (cmd === 'check') return updater.check({ force: true });
  if (cmd === 'update') return updater.update(id);
  if (cmd === 'rollback') return updater.rollback(id);
  if (cmd === 'set') return updater.setPort(id, arg || {});
  if (cmd === 'add') return updater.addPort(arg || {});
  if (cmd === 'open') { const r = updater.view().feed.items.find((x) => x.link === id) || updater.view().results.find((x) => x.url === id); if (r) shell.openExternal(id); return !!r; }
  return null;
});
ipcMain.handle('launch', async (_e, id, opts = {}) => {
  const doc = await loadGames();
  const g = doc.games.find((x) => x.id === id);
  if (!g) return { ok: false, error: 'Oyun bulunamadı.' };
  if (runner.running && runner.current.game.id !== id && opts && opts.replace) {
    // Another game is open (paused behind the menu): close it first, like a console does.
    const c = await closeRunningGame({ quiet: true });
    if (!c.ok) return { ok: false, error: 'Açık olan oyun kapatılamadı.' };
  }
  state.lastPlayed[id] = Date.now(); state.focusId = id; writeJson(FILES.state, state);
  return launchGame(g);
});
ipcMain.handle('kill', async () => { await closeRunningGame(); return true; });
ipcMain.handle('quit', (_e, mode) => { if (mode === 'cancel') return false; quitApp(mode === 'menu' ? 'menu' : 'both'); return true; });
// ---------- game manager ----------
// Eden (Nintendo Switch emulator): where it is expected, for the "Eden şablonu" in Oyun Ekle.
// settings.edenDir wins; otherwise Desktop\Ai projeler\Eden (the real and the redirected Desktop).
function edenInfo() {
  const dirs = [settings.edenDir, path.join(os.homedir(), 'Desktop', 'Ai projeler', 'Eden'), path.join(app.getPath('desktop'), 'Ai projeler', 'Eden')].filter(Boolean);
  for (const d of dirs) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    const n = names.find((x) => /^eden(-cli)?\.exe$/i.test(x) && !/cli/i.test(x)) || names.find((x) => /^eden.*\.exe$/i.test(x) && !/cli|cmd/i.test(x));
    if (n) return { dir: d, exe: path.join(d, n), exists: true };
  }
  return { dir: dirs[1], exe: path.join(dirs[1], 'eden.exe'), exists: false };
}
const switchTitle = (f) => path.basename(f).replace(/\.(nsp|xci|nsz|xcz|nca|nro|nso)$/i, '').replace(/\s*[[(][^\])]*[\])]/g, '').replace(/[_]+/g, ' ').trim() || path.basename(f);
ipcMain.handle('pick', async (_e, kind, current) => {
  if (kind === 'edenInfo') return edenInfo();
  const filters = {
    exe: [{ name: 'Program ya da kısayol', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
    image: [{ name: 'Resim', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    audio: [{ name: 'Müzik', extensions: ['mp3', 'ogg', 'm4a', 'opus', 'wav', 'flac', 'aac', 'webm'] }],
    switchgame: [{ name: 'Switch oyunu', extensions: ['nsp', 'xci', 'nsz', 'xcz', 'nca', 'nro', 'nso'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
    eden: [{ name: 'Eden', extensions: ['exe'] }],
  }[kind];
  const props = kind === 'folder' || kind === 'scesys' ? ['openDirectory'] : kind === 'audio' ? ['openFile', 'multiSelections'] : ['openFile'];
  const titles = { switchgame: 'Switch oyun dosyasını seç (.nsp, .xci …)', eden: 'eden.exe dosyasını seç', exe: 'Oyunu ya da kısayolunu seç', folder: 'Çalışma klasörünü seç', image: 'Resim seç', scesys: 'PS4 dökümündeki sce_sys klasörünü seç', audio: 'Oyunun müziğini seç (birden fazla seçilebilir)' };
  // tests: PS5MENU_FAKE_PICK = {"<kind>": "<path>"} answers the file dialog
  let fake = null; try { fake = process.env.PS5MENU_FAKE_PICK ? JSON.parse(process.env.PS5MENU_FAKE_PICK) : null; } catch { /* */ }
  pinTop(false);
  const r = fake ? (fake[kind] ? { canceled: false, filePaths: [].concat(fake[kind]) } : { canceled: true, filePaths: [] })
    : await dialog.showOpenDialog(win, { title: titles[kind], properties: props, filters, defaultPath: current && fs.existsSync(current) ? current : undefined });
  if (phase === 'home' && win && win.isFocused()) pinTop(true);
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0];
  try {
    if (kind === 'exe') {
      if (/\.lnk$/i.test(f)) { const sc = await readShortcut(f); return { ...sc, badge: emuBadge(sc.exe) }; }
      return { exe: f, args: '', workingDir: '', name: path.basename(f).replace(/\.(exe|bat|cmd)$/i, ''), badge: emuBadge(f) };
    }
    if (kind === 'scesys') return readSceSys(f);
    if (kind === 'audio') return { paths: r.filePaths.slice() };
    if (kind === 'switchgame') return { path: f, title: switchTitle(f) };
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
    if (draft.themeBg === 'off' || draft.themeBg === 'auto' && draft.clearBg) { /* the picture stays on disk; themeBg off hides it */ }
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
ipcMain.handle('boot-shown', (_e, kind) => { if (kind in bootShown) bootShown[kind] = true; return { ...bootShown }; });
ipcMain.handle('save-state', (_e, patch) => { Object.assign(state, patch || {}); writeJson(FILES.state, state); return true; });
ipcMain.handle('set-setting', (_e, key, value) => {
  if (key === 'consoleMode') setConsoleMode(!!value);
  settings[key] = value; writeJson(FILES.settings, settings);
  if ((key === 'autostart' || key === 'consoleMode') && isWin) app.setLoginItemSettings({ openAtLogin: !!settings.autostart, path: process.execPath });
  if ((key === 'padOpen' || key === 'consoleMode') && padwatch) padwatch.sync(settings.padOpen !== false);
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
  // back to the game; if no game is actually running any more, say so and keep the menu up
  if (cmd === 'hide' && !runner.running) return 'none';
  if (cmd === 'hide') { if (session && seamless()) return resumeGame(); pinTop(false); win.setFullScreen(false); win.hide(); }
  if (cmd === 'quit') { if (needsQuitQuestion()) askQuit(); else app.quit(); }
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
if (flag('screenshot') || process.env.PS5MENU_SHOT_DPR) app.commandLine.appendSwitch('force-device-scale-factor', process.env.PS5MENU_SHOT_DPR || '1'); // tests: render at 125 % / 150 %

app.whenReady().then(() => {
  protocol.handle('ps5file', (req) => {
    const u = new URL(req.url);
    const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
    // Videos (boot intros) need byte ranges to seek (start trim); everything else as before.
    if (/\.(mp4|webm|m4v)$/i.test(p)) return mediaResponse(p, req.headers.get('range'));
    return net.fetch(pathToFileURL(p).toString());
  });
  createWindow();
  if (process.env.PS5MENU_SELFTEST) require(process.env.PS5MENU_SELFTEST)({ app, win, getWin: () => win, runner, FILES, readJson, getPhase: () => phase, homeShortcut, getSession: () => session });
  // Start the window helper early so the first launch does not wait for it.
  if (seamless()) helper.snap(0, []).catch(() => {});
  updater.start(Number(process.env.PS5MENU_UPDATE_DELAY_MS) || 45e3);
  if (padwatch) { loadGames().then((d) => padwatch.writeList(d.games)).catch(() => {}); padwatch.gameState(false); try { padwatch.sync(settings.padOpen !== false); } catch (e) { log('padwatch', e.message); } }
  setTimeout(pollBattery, 2500); setInterval(pollBattery, Number(process.env.PS5MENU_BATTERY_MS) || 30e3);
  // Bring the menu back from anywhere (keyboard). Controller PS button is handled in the renderer.
  try { globalShortcut.register('CommandOrControl+Alt+Home', () => homeShortcut()); } catch { /* */ }
  if (isWin && settings.autostart) app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  // After the rename: a "start with Windows" entry for the old exe now starts the new one.
  if (migration.migrated && (isWin || process.env.PS5MENU_FAKE_REG)) {
    try {
      const reg = process.env.PS5MENU_FAKE_REG ? migrate.fileRun(process.env.PS5MENU_FAKE_REG) : migrate.regRun(require('child_process').execFileSync);
      migration.runMoved = migrate.moveRunEntry({ reg, setNew: () => { if (isWin) app.setLoginItemSettings({ openAtLogin: true, path: process.execPath }); else reg.set(APP_NAME, process.execPath); settings.autostart = true; writeJson(FILES.settings, settings); } });
    } catch (e) { migration.runError = e.message; }
  }
});
app.on('before-quit', (e) => {
  if (needsQuitQuestion()) { e.preventDefault(); askQuit(); return; }
  quitting = true; helper.close();
  if (padwatch) { padwatch.closedByUser(); padwatch.gameState(false); }
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); helper.close(); });
// The menu window is closed on purpose during a game; only quit when that is not the case.
app.on('window-all-closed', () => { if (quitting || !session) app.quit(); });
