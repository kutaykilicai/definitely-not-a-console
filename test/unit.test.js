// node test/unit.test.js  -- navigation, controller mapping, keyboard, args, .lnk parsing, game library
const assert = require('assert');
const path = require('path');
const NAV = require('../app/renderer/nav.js');
const INPUT = require('../app/renderer/input.js');
const { splitArgs } = require('../app/lib/proc.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

// Row items: [desktop, game, game, game, library]
const kinds = ['desktop', 'game', 'game', 'game', 'library'];
const ctx = { rowLen: 5, kind: (i) => kinds[i], cardsLen: 3 };
const run = (s, acts) => { const fx = []; for (const a of acts) { const r = NAV.reduce(s, a, ctx); s = r.state; fx.push(...r.fx); } return { s, fx }; };

ok('starts on first game (slot x=172)', () => { const s = NAV.initial(1); assert.equal(s.row, 1); assert.equal(NAV.tileX(1, 1), 172); assert.equal(NAV.tileX(0, 1), 48); assert.equal(NAV.tileX(2, 1), 357); assert.equal(NAV.tileX(3, 1), 471); });
ok('item 0 focused sits at x=48', () => { assert.equal(NAV.tileX(0, 0), 48); assert.equal(NAV.tileX(1, 0), 233); });
ok('left/right clamp, no wrap', () => { const { s, fx } = run(NAV.initial(1), ['left', 'left', 'right', 'right', 'right', 'right', 'right']); assert.equal(s.row, 4); assert.ok(fx.some((f) => f.type === 'bump')); });
ok('down to Oyna, right to dots, down to cards, up back', () => {
  let { s } = run(NAV.initial(1), ['down']); assert.equal(s.zone, 'actions'); assert.equal(s.action, 0);
  ({ s } = run(s, ['right'])); assert.equal(s.action, 1);
  ({ s } = run(s, ['right'])); assert.equal(s.action, 1);
  ({ s } = run(s, ['down'])); assert.equal(s.zone, 'cards');
  ({ s } = run(s, ['right', 'right', 'right'])); assert.equal(s.card, 2);
  ({ s } = run(s, ['up', 'up'])); assert.equal(s.zone, 'row');
});
ok('A on row launches focused game', () => { const { fx } = run(NAV.initial(1), ['right', 'select']); assert.deepEqual(fx.pop(), { type: 'activate', index: 2 }); });
ok('A on Oyna launches, A on dots opens menu', () => {
  let r = run(NAV.initial(1), ['down', 'select']); assert.deepEqual(r.fx.pop(), { type: 'activate', index: 1 });
  r = run(NAV.initial(1), ['down', 'right', 'select']); assert.deepEqual(r.fx.pop(), { type: 'menu', index: 1 });
});
ok('Menu button opens options on a game, not on library', () => {
  assert.equal(run(NAV.initial(1), ['options']).fx.pop().type, 'menu');
  assert.equal(run(NAV.initial(1), ['right', 'right', 'right', 'options']).fx.filter((f) => f.type === 'menu').length, 0);
});
ok('B goes back: cards->actions->row->first game', () => { const { s } = run(NAV.initial(1), ['right', 'right', 'down', 'down', 'back', 'back', 'back']); assert.equal(s.zone, 'row'); assert.equal(s.row, 1); });
ok('desktop tile has one action and no cards', () => { const { s } = run(NAV.initial(1), ['left', 'down', 'right', 'down']); assert.equal(s.zone, 'actions'); assert.equal(s.action, 0); });
ok('up to top bar, select settings', () => { const { s, fx } = run(NAV.initial(1), ['up', 'right', 'right', 'right', 'select']); assert.equal(s.zone, 'top'); assert.deepEqual(fx.pop(), { type: 'open', what: 'settings' }); });
ok('LB/RB/View switch tabs; Guide returns home', () => {
  let { s } = run(NAV.initial(1), ['tabNext']); assert.equal(s.tab, 'media');
  ({ s } = run(s, ['tabToggle'])); assert.equal(s.tab, 'games');
  ({ s } = run(s, ['tabNext', 'home'])); assert.equal(s.tab, 'games'); assert.equal(s.row, 1); assert.equal(s.zone, 'row');
});
ok('list/grid helpers', () => { assert.equal(NAV.listMove(0, 'up', 3), 0); assert.equal(NAV.listMove(2, 'down', 3), 2); assert.equal(NAV.gridMove(5, 'right', 8, 6), 5); assert.equal(NAV.gridMove(2, 'down', 8, 6), 7); assert.equal(NAV.gridMove(7, 'up', 8, 6), 1); });

// Xbox controller (standard mapping)
const B = INPUT.BUTTONS;
const pad = (on) => { const b = Array.from({ length: 17 }, () => ({ pressed: false })); for (const i of on) b[i] = { pressed: true }; return b; };
ok('A=select B=back LB/RB=tabs Guide=home X/Y passthrough', () => {
  const m = new INPUT.PadMapper();
  assert.deepEqual(m.update(pad([B.A]), [0, 0], 0), ['select']);
  assert.deepEqual(m.update(pad([B.A]), [0, 0], 16), []);
  assert.deepEqual(m.update(pad([B.B]), [0, 0], 32), ['back']);
  assert.deepEqual(m.update(pad([B.LB]), [0, 0], 48), ['tabPrev']);
  assert.deepEqual(m.update(pad([B.RB]), [0, 0], 64), ['tabNext']);
  assert.deepEqual(m.update(pad([B.GUIDE]), [0, 0], 80), ['home']);
});
ok('Menu fires options on release; View toggles tab on release', () => {
  const m = new INPUT.PadMapper();
  assert.deepEqual(m.update(pad([B.MENU]), [0, 0], 0), []);
  assert.deepEqual(m.update(pad([]), [0, 0], 16), ['options']);
  assert.deepEqual(m.update(pad([B.VIEW]), [0, 0], 32), []);
  assert.deepEqual(m.update(pad([]), [0, 0], 48), ['tabToggle']);
});
ok('View+Menu together = home, without options/tab side effects', () => {
  const m = new INPUT.PadMapper();
  m.update(pad([B.VIEW]), [0, 0], 0);
  assert.deepEqual(m.update(pad([B.VIEW, B.MENU]), [0, 0], 16), ['home']);
  assert.deepEqual(m.update(pad([B.VIEW]), [0, 0], 32), []);
  assert.deepEqual(m.update(pad([]), [0, 0], 48), []);
});
ok('D-pad and stick repeat: 400 ms then 120 ms, deadzone/hysteresis', () => {
  const m = new INPUT.PadMapper(); const got = [];
  for (let t = 0; t <= 1000; t += 16) got.push(...m.update(pad([B.RIGHT]), [0, 0], t).map((a) => `${a}@${t}`));
  assert.equal(got[0], 'right@0'); assert.ok(/right@40\d/.test(got[1])); assert.equal(got.length, 6);
  const s = new INPUT.PadMapper();
  assert.deepEqual(s.update(pad([]), [0.3, 0], 0), []);
  assert.deepEqual(s.update(pad([]), [0, 0.8], 16), ['down']);
  assert.deepEqual(s.update(pad([]), [0, 0.4], 32), []);
  assert.deepEqual(s.update(pad([]), [0, 0.2], 48), []);
  assert.deepEqual(s.update(pad([]), [0, 0.6], 64), ['down']);
});
ok('keyboard mapping', () => {
  const k = (key, extra = {}) => INPUT.keyAction({ key, ...extra });
  assert.equal(k('ArrowLeft'), 'left'); assert.equal(k('Enter'), 'select'); assert.equal(k('Escape'), 'back'); assert.equal(k('Backspace'), 'back');
  assert.equal(k('Tab'), 'tabToggle'); assert.equal(k('q'), 'tabPrev'); assert.equal(k('E'), 'tabNext'); assert.equal(k('ContextMenu'), 'options'); assert.equal(k('Home'), 'home');
  assert.equal(k('q', { ctrlKey: true }), null);
});
ok('args splitting (Linux path); Windows passes args verbatim', () => {
  assert.deepEqual(splitArgs('-g "D:\\Oyunlar\\Bir Döküm\\CUSA00000\\eboot.bin"'), ['-g', 'D:\\Oyunlar\\Bir Döküm\\CUSA00000\\eboot.bin']);
  assert.deepEqual(splitArgs('--play'), ['--play']); assert.deepEqual(splitArgs(''), []);
});

// .lnk parsing with a shortcut built here (MS-SHLLINK: LinkInfo + working dir + arguments, Unicode)
function makeLnk(target, workingDir, args) {
  const hdr = Buffer.alloc(76); hdr.writeUInt32LE(0x4c, 0); hdr.writeUInt32LE(0x2 | 0x10 | 0x20 | 0x80, 20);
  const base = Buffer.from(target + '\0', 'latin1');
  const li = Buffer.alloc(28 + 17 + base.length + 1); li.writeUInt32LE(li.length, 0); li.writeUInt32LE(0x1c, 4); li.writeUInt32LE(1, 8);
  li.writeUInt32LE(28, 12); li.writeUInt32LE(28 + 17, 16); li.writeUInt32LE(28 + 17 + base.length, 24);
  li.writeUInt32LE(17, 28); base.copy(li, 28 + 17);
  const str = (v) => { const b = Buffer.from(v, 'utf16le'); const n = Buffer.alloc(2); n.writeUInt16LE(v.length); return Buffer.concat([n, b]); };
  return Buffer.concat([hdr, li, str(workingDir), str(args), Buffer.alloc(4)]);
}
ok('.lnk parser reads target, working folder and arguments', () => {
  const { parseLnk } = require('../app/lib/lnk.js');
  const r = parseLnk(makeLnk('C:\\Games\\Örnek\\game.exe', 'C:\\Games\\Örnek', '--play -x "a b"'));
  assert.equal(r.target, 'C:\\Games\\Örnek\\game.exe'); assert.equal(r.workingDir, 'C:\\Games\\Örnek'); assert.equal(r.args, '--play -x "a b"');
});

// Game manager: add, edit, reorder, delete, ids
ok('library: add/edit/move/delete keep other fields, ids are unique slugs', () => {
  const L = require('../app/lib/library.js');
  const doc = { version: 1, games: [] };
  const a = L.saveEntry(doc, { title: 'Şehir Işıkları', exe: 'C:\\g\\a.exe', args: '', losslessScaling: true });
  const b = L.saveEntry(doc, { title: 'Şehir Işıkları', exe: 'C:\\g\\b.exe' });
  assert.equal(a.id, 'sehir-isiklari'); assert.equal(b.id, 'sehir-isiklari-2'); assert.equal(a.losslessScaling, true);
  doc.games[0].titleIds = ['CUSA00000'];
  L.saveEntry(doc, { id: a.id, title: 'Yeni Ad', exe: 'C:\\g\\a.exe', losslessScaling: false, workingDir: '' });
  assert.equal(doc.games[0].title, 'Yeni Ad'); assert.deepEqual(doc.games[0].titleIds, ['CUSA00000']);
  assert.ok(!('losslessScaling' in doc.games[0]) && !('workingDir' in doc.games[0]));
  assert.equal(L.saveEntry(doc, { exe: 'C:\\x\\Oyun.exe' }).title, 'Oyun');
  assert.throws(() => L.saveEntry(doc, { title: 'x' }));
  assert.ok(L.moveEntry(doc, b.id, -1)); assert.equal(doc.games[0].id, b.id);
  assert.ok(!L.moveEntry(doc, b.id, -1));
  assert.equal(L.deleteEntry(doc, b.id).id, b.id); assert.equal(doc.games.length, 2);
});
ok('library: migration from the old portable data folder and from an older config folder', () => {
  const fs = require('fs'); const os = require('os'); const L = require('../app/lib/library.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps5m-mig-'));
  const legacy = path.join(tmp, 'portable'); fs.mkdirSync(path.join(legacy, 'data'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'assets', 'user', 'games', 'x'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'assets', 'user', 'games', 'x', 'icon.png'), 'png');
  fs.writeFileSync(path.join(legacy, 'assets', 'user', 'BENIOKU.txt'), 'old readme');
  fs.writeFileSync(path.join(legacy, 'data', 'games.json'), JSON.stringify({ version: 1, games: [{ id: 'x', title: 'X', exe: '/nope/x.exe' }], lastScan: {} }));
  fs.writeFileSync(path.join(legacy, 'data', 'state.json'), '{"lastPlayed":{"x":1}}');
  const cfg = path.join(tmp, 'PS5 Menu');
  const r = L.migrateLegacy({ legacyRoot: legacy, configDir: cfg, assetsDir: path.join(cfg, 'assets') });
  assert.ok(r.migrated); assert.equal(r.games, 1);
  assert.ok(fs.existsSync(path.join(cfg, 'assets', 'games', 'x', 'icon.png')) && !fs.existsSync(path.join(cfg, 'assets', 'BENIOKU.txt')));
  assert.equal(L.readJson(path.join(cfg, 'state.json')).lastPlayed.x, 1);
  assert.ok(!L.migrateLegacy({ legacyRoot: legacy, configDir: cfg, assetsDir: path.join(cfg, 'assets') }).migrated, 'runs once');
  const cfg2 = path.join(tmp, 'Definitely Not PS5 Menu');
  const r2 = L.migrateConfigDir({ fromDir: cfg, configDir: cfg2 });
  assert.ok(r2.migrated); assert.equal(L.readJson(path.join(cfg2, 'games.json')).games[0].id, 'x');
  assert.ok(fs.existsSync(path.join(cfg2, 'assets', 'games', 'x', 'icon.png')));
  assert.ok(fs.existsSync(path.join(cfg, 'games.json')), 'old folder left as it was');
  fs.rmSync(tmp, { recursive: true, force: true });
});
ok('library: "pause in menu" is on by default, only off is stored', () => {
  const L = require('../app/lib/library.js'); const doc = { version: 1, games: [] };
  const g = L.saveEntry(doc, { title: 'A', exe: 'C:\\g\\a.exe', suspendInMenu: true }); assert.ok(!('suspendInMenu' in g));
  L.saveEntry(doc, { id: g.id, title: 'A', exe: 'C:\\g\\a.exe', suspendInMenu: false }); assert.strictEqual(doc.games[0].suspendInMenu, false);
  L.saveEntry(doc, { id: g.id, title: 'A', exe: 'C:\\g\\a.exe', suspendInMenu: true }); assert.ok(!('suspendInMenu' in doc.games[0]));
});
ok('library: dump search roots come from the user\'s own paths', () => {
  const { deriveRoots } = require('../app/lib/library.js');
  const r = deriveRoots([{ exe: 'C:\\Users\\a\\Emu\\shadPS4\\shadPS4.exe', args: '-g "E:\\Oyunlar\\Dump-CUSA1\\CUSA1\\eboot.bin"' }]);
  assert.ok(r.includes('E:\\Oyunlar\\Dump-CUSA1') && r.includes('E:\\Oyunlar'));
  assert.ok(!r.some((x) => /^[A-Z]:\\?$/i.test(x) || /\\Users\\a$/i.test(x)));
});
console.log(`\n${n} tests passed`);
