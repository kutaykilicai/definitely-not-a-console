// node test/x360.test.js  -- console menus: which games go where, switch guard, Xbox 360 dashboard navigation
const assert = require('assert');
const CONS = require('../app/renderer/consoles.js');
const NAVX = require('../app/renderer/x360/x360nav.js');
const LIB = require('../app/lib/library.js');
const { emuBadge } = require('../app/lib/detect.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

ok('old entries without console stay in the PS5 menu', () => {
  for (const g of [{}, { badge: 'PS4' }, { badge: 'PS3' }, { badge: 'PC' }, { badge: '' }, { title: 'God of War III' }]) assert.equal(CONS.consoleOf(g), 'ps5');
});
ok('console field and X360 badge pick the Xbox 360 menu', () => {
  assert.equal(CONS.consoleOf({ console: 'x360' }), 'x360');
  assert.equal(CONS.consoleOf({ console: 'Xbox 360' }), 'x360');
  assert.equal(CONS.consoleOf({ badge: 'X360' }), 'x360');
  assert.equal(CONS.consoleOf({ badge: 'X360', console: 'ps5' }), 'ps5');
  assert.equal(CONS.consoleOf({ console: 'nonsense' }), 'ps5');
});
ok('renderer and library agree on consoleOf', () => {
  const cases = [{}, { badge: 'X360' }, { console: 'x360' }, { console: 'ps5', badge: 'X360' }, { badge: 'PS3' }, { console: 'xbox360' }];
  for (const g of cases) assert.equal(LIB.consoleOf(g), CONS.consoleOf(g), JSON.stringify(g));
});
ok('up/down wrap between the two menus', () => {
  assert.equal(CONS.neighbour('ps5', 'up'), 'x360'); assert.equal(CONS.neighbour('ps5', 'down'), 'x360');
  assert.equal(CONS.neighbour('x360', 'up'), 'ps5'); assert.equal(CONS.neighbour('x360', 'down'), 'ps5');
  assert.equal(CONS.normalize(undefined), 'ps5'); assert.equal(CONS.normalize('x360'), 'x360'); assert.equal(CONS.normalize('dc'), 'ps5');
});
ok('switch guard: held key repeats and presses during the animation do not switch', () => {
  const g = new CONS.SwitchGuard();
  assert.equal(g.press(1000), true); g.start(1000, 520);
  assert.equal(g.press(1100), false, 'during animation');
  // Pad auto-repeat: first repeat after 400 ms, then every 120 ms
  assert.equal(g.press(1500), false, 'still busy (520 + 140 cooldown)');
  assert.equal(g.press(1620), false, 'repeat 120 ms later is not fresh');
  assert.equal(g.press(1740), false);
  assert.equal(g.press(2000), true, 'fresh press after release');
});
ok('switch guard: rapid double tap only switches once', () => {
  const g = new CONS.SwitchGuard(); let sw = 0;
  for (const t of [0, 60, 120, 180, 240]) if (g.press(t)) { sw++; g.start(t, 520); }
  assert.equal(sw, 1);
});

ok('saveEntry stores console only when the badge does not already imply it', () => {
  const doc = { games: [] };
  const a = LIB.saveEntry(doc, { title: 'Naruto', exe: 'F:\\X360 Oyunlar\\NarutoRisePC\\narutorise_launcher.exe', console: 'x360' });
  assert.equal(a.console, 'x360');
  const b = LIB.saveEntry(doc, { title: 'Halo', exe: 'C:\\h.exe', badge: 'X360', console: 'x360' });
  assert.equal('console' in b, false);
  const c = LIB.saveEntry(doc, { title: 'GoW', exe: 'C:\\rpcs3.exe', badge: 'PS3', console: 'ps5' });
  assert.equal('console' in c, false);
  const d = LIB.saveEntry(doc, { id: a.id, title: 'Naruto', exe: a.exe, console: 'ps5' });
  assert.equal('console' in d, false, 'moving back to PS5 drops the field');
  assert.equal(LIB.consoleOf(d), 'ps5');
});
ok('xenia shortcuts get the X360 badge, PlayStation emulators unchanged', () => {
  assert.equal(emuBadge('C:\\emu\\xenia_canary.exe'), 'X360');
  assert.equal(emuBadge('C:\\emu\\rpcs3.exe'), 'PS3');
  assert.equal(emuBadge('C:\\emu\\pcsx2-qt.exe'), 'PS2');
  assert.equal(emuBadge('C:\\games\\narutorise_launcher.exe'), null);
});

// Dashboard grid like the home panel: 3 columns + featured block
const COL = 261, ROW = 195, RY = [267, 468, 669];
const home = { id: 'home', defaultFocus: 3, tiles: [
  { x: 0, y: RY[0], w: COL, h: ROW }, { x: 0, y: RY[1], w: COL, h: ROW }, { x: 0, y: RY[2], w: COL, h: ROW },
  { x: 267, y: RY[0], w: 699, h: 396 }, { x: 972, y: RY[0], w: COL, h: ROW }, { x: 972, y: RY[1], w: COL, h: ROW },
  { x: 267, y: RY[2], w: 345, h: ROW }, { x: 618, y: RY[2], w: 348, h: ROW }, { x: 972, y: RY[2], w: COL, h: ROW }] };
const panels = [{ id: 'search', tiles: [{ x: 0, y: 446, w: 95, h: 95 }] }, home, { id: 'games', tiles: [{ x: 0, y: RY[0], w: COL, h: ROW }, { x: 0, y: RY[1], w: COL, h: ROW }] }];
const runX = (s, acts) => { const fx = []; for (const a of acts) { const r = NAVX.reduce(s, a, panels); s = r.state; fx.push(...r.fx); } return { s, fx }; };
const start = () => NAVX.initial(1, { 1: 3 });

ok('x360: starts on the featured tile of home', () => { const s = start(); assert.equal(s.panel, 1); assert.equal(NAVX.focusOf(s, panels), 3); });
ok('x360: grid moves spatially', () => {
  let { s } = runX(start(), ['left']); assert.equal(NAVX.focusOf(s, panels), 0);
  ({ s } = runX(s, ['down'])); assert.equal(NAVX.focusOf(s, panels), 1);
  ({ s } = runX(s, ['down'])); assert.equal(NAVX.focusOf(s, panels), 2);
  ({ s } = runX(s, ['right'])); assert.equal(NAVX.focusOf(s, panels), 6);
  ({ s } = runX(s, ['right', 'right'])); assert.equal(NAVX.focusOf(s, panels), 8);
  ({ s } = runX(s, ['up'])); assert.equal(NAVX.focusOf(s, panels), 5);
});
ok('x360: up at the top edge and down at the bottom edge hand over to the console switch', () => {
  let r = runX(start(), ['up']); assert.deepEqual(r.fx.pop(), { type: 'console', dir: 'up' }); assert.equal(NAVX.focusOf(r.s, panels), 3);
  r = runX(start(), ['down', 'down']); assert.deepEqual(r.fx.pop(), { type: 'console', dir: 'down' });
});
ok('x360: leaving sideways changes panel, back returns home', () => {
  let { s, fx } = runX(start(), ['left', 'left']); assert.equal(s.panel, 0); assert.equal(fx.pop().type, 'panel');
  ({ s } = runX(s, ['back'])); assert.equal(s.panel, 1);
  ({ s } = runX(s, ['right', 'right', 'right'])); assert.equal(s.panel, 2);
  const r = runX(s, ['right']); assert.equal(r.s.panel, 2); assert.equal(r.fx.pop().type, 'bump');
});
ok('x360: A activates the focused tile', () => { const r = runX(start(), ['select']); assert.deepEqual(r.fx.pop(), { type: 'activate', panel: 1, index: 3 }); });

console.log(`${n} x360 tests passed`);
