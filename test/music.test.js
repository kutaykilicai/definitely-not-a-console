'use strict';
// The theme player shared by the PS5, Xbox 360 and Switch menus (renderer/music.js), with a stand-in
// Audio element: a new focus (another menu's tile, a tile without music) ends the old track at once.
const assert = require('assert');
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok', name); };
const made = [];
global.performance = global.performance || { now: () => Date.now() };
global.Audio = class { constructor() { this.paused = true; this.volume = 0; this.currentTime = 0; this.src = ''; made.push(this); } addEventListener() {} removeAttribute(k) { if (k === 'src') this.src = ''; } load() {} pause() { this.paused = true; } play() { this.paused = false; return Promise.resolve(); } };
require('../app/renderer/music.js');
const M = globalThis.ThemeMusic;
const realST = global.setTimeout;
const mk = () => new M({ sound: { enabled: true }, delayMs: 0, fadeOutMs: 100 });

(async () => {
  const m = mk(); m.focus('gow3', ['ps5file://gow.ogg'], true);
  await new Promise((r) => realST(r, 20));
  assert.strictEqual(m.state().id, 'gow3'); assert.ok(m.state().playing);
  ok('focus a game with music: it starts', () => {});
  const gow = m.cur.el;
  // the menu switches to the Xbox 360 one and its focused tile (Naruto) has no music
  m.focus('naruto', [], false);
  assert.strictEqual(m.state().id, null, 'old track no longer current right after the switch');
  assert.ok(m.events.some((e) => e[1] === 'stop'), 'stop event at once');
  await new Promise((r) => realST(r, 300));
  assert.ok(gow.paused, 'GoW element paused after the fade');
  ok('menu switch to a tile without music: the old track stops at once and is paused after the fade', () => {});
  m.focus('naruto', ['ps5file://naruto.ogg'], false);
  await new Promise((r) => realST(r, 20));
  assert.strictEqual(m.state().id, 'naruto'); const nar = m.cur.el;
  m.focus('totk', ['ps5file://totk.ogg'], false);
  assert.notStrictEqual(m.state().id, 'naruto');
  await new Promise((r) => realST(r, 300));
  assert.ok(nar.paused); assert.strictEqual(m.state().id, 'totk');
  ok('tile to tile on another menu: crossfade, one track at a time', () => {});
  m.hold(true); await new Promise((r) => realST(r, 200));
  assert.ok(m.state().level < 0.05 && m.state().held === 1);
  m.hold(false);
  ok('an intro holds the music; it comes back after', () => {});
  {
    const fs = require('fs'), os = require('os'), path = require('path');
    const T = require('../app/lib/theme.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dnac-theme-'));
    const gdir = path.join(root, 'NarutoRisePC'); fs.mkdirSync(path.join(gdir, 'game'), { recursive: true });
    fs.writeFileSync(path.join(gdir, 'game', 'Attract.bik'), Buffer.alloc(64)); fs.writeFileSync(path.join(gdir, 'game', '101_Ninja_Chase.bik'), Buffer.alloc(64));
    const game = { id: 'naruto', exe: path.join(gdir, 'narutorise.exe'), workingDir: gdir };
    const o = { userGamesDir: path.join(root, 'assets', 'games'), cacheDir: path.join(root, 'cache') };
    let m = T.resolveMusic(game, {}, o);
    assert.strictEqual(m.source, 'video-pending'); assert.ok(/Attract\.bik$/.test(m.at9) && m.cache.startsWith(o.cacheDir));
    fs.mkdirSync(o.cacheDir, { recursive: true }); fs.writeFileSync(m.cache, 'ogg');
    m = T.resolveMusic(game, {}, o); assert.strictEqual(m.source, 'video'); assert.strictEqual(m.files.length, 1);
    fs.mkdirSync(path.join(o.userGamesDir, 'naruto'), { recursive: true }); fs.writeFileSync(path.join(o.userGamesDir, 'naruto', 'music.ogg'), 'x');
    assert.strictEqual(T.resolveMusic(game, {}, o).source, 'user');
    assert.strictEqual(T.resolveMusic({ ...game, music: 'off' }, {}, o).source, 'off');
    fs.rmSync(root, { recursive: true, force: true });
    ok('no theme file: the sound of the game\'s Attract video (converted once); a music file of the user wins', () => {});
  }
  console.log(`\n${n} music tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
