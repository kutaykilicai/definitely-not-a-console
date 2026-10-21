// Loaded by main.js when PS5MENU_SELFTEST points here (root: test/root-x360).
// Drives the console switch PS5 <-> Xbox 360 with up and with down, rapid presses and held-key
// repeats, checks the frame pacing of the switch animation, the remembered menu, and that A on
// the Naruto tile in the Xbox 360 menu starts the right exe.
const fs = require('fs');
module.exports = ({ app, win, runner, FILES, readJson }) => {
  const log = (...a) => console.log('[e2e-x360]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = [];
  const check = (name, cond, extra = '') => { results.push([name, !!cond, String(extra)]); log(cond ? 'PASS' : 'FAIL', name, extra); };
  const waitFor = async (fn, ms, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(step); } return false; };
  const state = () => js('({ c: window.__ps5.console, sw: window.__ps5.switching, n: window.__ps5switches || 0, x: window.__ps5.x360 && window.__ps5.x360.tile && (window.__ps5.x360.tile.game ? window.__ps5.x360.tile.game.id : window.__ps5.x360.tile.kind), zone: window.__ps5.nav.zone, row: window.__ps5.nav.row })');
  const vis = () => js(`(() => { const a = getComputedStyle(document.querySelector('#x360')); const b = getComputedStyle(document.querySelector('#ps5view')); return { x: a.display !== 'none' && a.visibility !== 'hidden', p: b.display !== 'none' && b.visibility !== 'hidden' }; })()`);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  const settle = () => waitFor(async () => !(await state()).sw, 3000, 30);

  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1500);
      let s = await state();
      check('starts in the PS5 menu (default)', s.c === 'ps5', s.c);
      const ps5ids = await js('window.__ps5.items.filter((x) => x.kind === "game").map((x) => x.g.id).join(",")');
      check('PS5 row has only PlayStation/PC games', ps5ids === 'ornek-oyun,gece-surusu,kiyi-kasabasi' || (!ps5ids.includes('naruto') && ps5ids.split(',').length === 3), ps5ids);

      // Frame pacing during the switch: collect rAF deltas in the page.
      await js('window.__fr = []; (function f(t) { if (window.__fr.length < 200) { window.__fr.push(t); requestAnimationFrame(f); } })(performance.now())');
      await press('down');
      s = await state();
      check('down on the PS5 row starts the switch', s.sw === true && s.c === 'x360', JSON.stringify(s));
      const mid = await vis();
      check('both menus are on screen during the animation', mid.x && mid.p, JSON.stringify(mid));
      await settle();
      const fr = await js('window.__fr.slice()');
      const d = fr.slice(1).map((t, i) => t - fr[i]).filter((x) => x > 0).slice(0, 40);
      const worst = Math.max(...d); const avg = d.reduce((a, b) => a + b, 0) / d.length;
      check('switch animation frame pacing recorded', d.length > 10, `avg ${avg.toFixed(1)} ms, worst ${worst.toFixed(1)} ms over ${d.length} frames (Xvfb, software GL)`);
      let v = await vis();
      check('after the switch only the Xbox 360 menu is visible', v.x && !v.p, JSON.stringify(v));
      s = await state();
      check('X360 home focuses the Naruto tile', s.x === 'naruto-rise-of-a-ninja', s.x);
      await sleep(400);
      check('last menu is saved (state.console = x360)', readJson(FILES.state, {}).console === 'x360', JSON.stringify(readJson(FILES.state, {}).console));

      // X360 -> PS5 with up (featured tile is on the top row: up leaves the grid)
      await press('up'); await settle(); s = await state(); v = await vis();
      check('up at the top of the X360 grid goes back to PS5', s.c === 'ps5' && v.p && !v.x, JSON.stringify(s));
      check('PS5 row focus kept after the round trip', s.zone === 'row', s.zone);
      // PS5 -> X360 with up
      await sleep(250); await press('up'); await settle(); s = await state();
      check('up on the PS5 row also switches to X360', s.c === 'x360', s.c);
      // X360 -> PS5 with down: first down moves inside the grid, the next one leaves it
      await sleep(250); await press('down'); await sleep(250); s = await state();
      check('down inside the X360 grid moves focus, no switch', s.c === 'x360' && s.x !== 'naruto-rise-of-a-ninja', s.x);
      await press('down'); await settle(); s = await state();
      check('down at the bottom of the X360 grid goes back to PS5', s.c === 'ps5', s.c);

      // Rapid presses: 8 downs 40 ms apart -> exactly one switch
      await sleep(300);
      let n0 = (await state()).n;
      for (let i = 0; i < 8; i++) { await press('down'); await sleep(40); }
      await settle(); s = await state();
      check('rapid presses: one switch only', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c}`);
      // Held key: first press, then pad repeats at 400 ms and every 120 ms -> no second switch
      await sleep(300); await press('up'); await settle(); s = await state(); // back to ps5 by up from featured? focus may be elsewhere
      if (s.c !== 'ps5') { for (let i = 0; i < 4 && (await state()).c !== 'ps5'; i++) { await sleep(250); await press('up'); await settle(); } }
      s = await state(); check('back on PS5 before the hold test', s.c === 'ps5', s.c);
      await sleep(300); n0 = (await state()).n;
      const t0 = Date.now(); await press('down'); await sleep(400);
      while (Date.now() - t0 < 1600) { await press('down'); await sleep(120); }
      await settle(); s = await state();
      check('held down key: a single switch, repeats ignored', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c}`);

      // Launch Naruto from the X360 menu: back/home returns focus to the default tile (Naruto)
      await sleep(300); await press('back'); await sleep(300); s = await state();
      if (s.x !== 'naruto-rise-of-a-ninja') { await press('back'); await sleep(300); s = await state(); }
      check('back returns to the Naruto tile', s.x === 'naruto-rise-of-a-ninja', s.x);
      let exited = null; runner.once('exited', (g, info) => { exited = { id: g.id, ...info }; });
      await press('select');
      const hid = await waitFor(() => !win.isVisible(), 5000);
      check('A on Naruto launches (window hides)', hid);
      const cur = runner.current && runner.current.game;
      check('runner tracks the Naruto entry', cur && cur.id === 'naruto-rise-of-a-ninja', cur && cur.id);
      const exe = cur && cur.exe; const titleIds = cur && cur.titleIds;
      check('launch uses the Naruto exe from games.json', exe && /dummy-game\.sh$/.test(exe) && exe === readJson(FILES.games, { games: [] }).games.find((g) => g.id === 'naruto-rise-of-a-ninja').exe, exe);
      check('titleIds kept on the entry', Array.isArray(titleIds) && titleIds[0] === '555307E5', JSON.stringify(titleIds));
      const back = await waitFor(() => win.isVisible() && exited, 20000, 200);
      check('menu returns after the game exits', back);
      await sleep(1200); s = await state(); v = await vis();
      check('returns into the Xbox 360 menu', s.c === 'x360' && v.x && !v.p, JSON.stringify(s));
      const dummy = fs.existsSync('/tmp/ps5menu-dummy.log') ? fs.readFileSync('/tmp/ps5menu-dummy.log', 'utf8').trim().split('\n').pop() : '';
      check('dummy game saw the launch', /dummy/i.test(dummy) || dummy.length > 0, dummy);

      // Switch back and launch a PS5 game: PS5 behaviour unchanged
      await press('up'); await settle(); s = await state();
      if (s.c !== 'ps5') { await sleep(250); await press('up'); await settle(); s = await state(); }
      check('back to PS5 for a PS5 launch', s.c === 'ps5', s.c);
      exited = null; runner.once('exited', (g, info) => { exited = { id: g.id, ...info }; });
      const want = await js('window.__ps5.items[window.__ps5.nav.row].id');
      await press('select');
      check('A on the PS5 row still launches', await waitFor(() => !win.isVisible(), 5000), want);
      check('PS5 launch tracks a PS5 game', runner.current && runner.current.game.id === want && want !== 'naruto-rise-of-a-ninja', runner.current && runner.current.game.id);
      check('PS5 game returns', await waitFor(() => win.isVisible() && exited, 20000, 200));
      await sleep(800); s = await state();
      check('returns into the PS5 menu', s.c === 'ps5', s.c);
    } catch (e) { log('ERROR', e.stack); results.push(['exception', false, e.message]); }
    const failed = results.filter((r) => !r[1]).length;
    log(`${results.length - failed}/${results.length} checks passed`);
    fs.writeFileSync(process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-x360.json', JSON.stringify(results, null, 1));
    app.exit(failed ? 1 : 0);
  });
};
