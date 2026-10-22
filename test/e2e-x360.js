// Loaded by main.js when PS5MENU_SELFTEST points here (root: test/root-x360).
// Up/down navigate as in 1.3; the console switch PS5 <-> Xbox 360 goes with L3/R3 (a fake pad in
// the page) and PageUp/PageDown (real key events), spam, key repeat, overlay, unplugged pad; checks the frame pacing of the switch animation, the remembered menu, and that A on
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

      // 1.4.1: up/down navigate exactly as in 1.3 (no switch); the menus switch with L3 / R3 on the
      // pad and PageUp / PageDown on the keyboard.
      await press('down'); await sleep(250); s = await state();
      check('down on the PS5 row moves to the actions (1.3), no switch', s.c === 'ps5' && s.zone === 'actions' && s.n === 0, JSON.stringify(s));
      await press('up'); await sleep(250); await press('up'); await sleep(250); s = await state();
      check('up from the row goes to the top bar (1.3), no switch', s.c === 'ps5' && s.zone === 'top' && s.n === 0, JSON.stringify(s));
      await press('down'); await sleep(250); s = await state();
      check('down from the top bar back to the row', s.zone === 'row', s.zone);

      // Frame pacing during the switch: collect rAF deltas in the page.
      await js('window.__fr = []; (function f(t) { if (window.__fr.length < 200) { window.__fr.push(t); requestAnimationFrame(f); } })(performance.now())');
      await press('consoleNext');
      s = await state();
      check('R3 / PageDown starts the switch', s.sw === true && s.c === 'x360', JSON.stringify(s));
      const mid = await vis();
      check('both menus are on screen during the animation', mid.x && mid.p, JSON.stringify(mid));
      await sleep(120);
      const ty = await js(`(() => { const m = getComputedStyle(document.querySelector('#x360')).transform; return m === 'none' ? 0 : Number(m.replace(/[^0-9.,eE-]/g, '').split(',')[5]); })()`);
      check('next: the new menu comes up from below', ty > 0, ty);
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

      // Up/down inside the X360 grid never leave the menu
      let n0 = (await state()).n;
      for (const k of ['up', 'up', 'up', 'down', 'down', 'down', 'down', 'down']) { await press(k); await sleep(120); }
      s = await state();
      check('up/down at the X360 grid edges do not switch', s.c === 'x360' && s.n === n0, JSON.stringify(s));
      await press('back'); await sleep(300); if ((await state()).x !== 'naruto-rise-of-a-ninja') { await press('back'); await sleep(300); }

      // L3 / PageUp: previous menu in the cycle PS5 -> X360 -> Switch, the new menu comes from above
      await press('consolePrev');
      // sampled over the first 500 ms (a single sample can land before the first animation frame)
      let ty2 = 0; for (let k = 0; k < 25 && ty2 <= 0; k++) { await sleep(20); ty2 = Math.max(ty2, await js(`(() => { const m = getComputedStyle(document.querySelector('#x360')).transform; return m === 'none' ? 0 : Number(m.replace(/[^0-9.,eE-]/g, '').split(',')[5]); })()`)); }
      check('prev: the outgoing X360 menu moves down (new one from above)', ty2 > 0, ty2);
      await settle(); s = await state(); v = await vis();
      check('L3 goes back to PS5', s.c === 'ps5' && v.p && !v.x, JSON.stringify(s));
      check('PS5 row focus kept after the round trip', s.zone === 'row', s.zone);
      await sleep(250); await press('consolePrev'); await settle(); s = await state();
      check('L3 on PS5 wraps to Switch (three menus: PS5, X360, Switch)', s.c === 'switch', s.c);
      await sleep(250); await press('consoleNext'); await settle(); s = await state();
      check('R3 on Switch wraps to PS5', s.c === 'ps5', s.c);

      // Spam: 8 presses 40 ms apart -> exactly one switch
      await sleep(300); n0 = (await state()).n;
      for (let i = 0; i < 8; i++) { await press(i % 2 ? 'consolePrev' : 'consoleNext'); await sleep(40); }
      await settle(); s = await state();
      check('L3/R3 spam: one switch only', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c}`);
      await sleep(300); await press('consolePrev'); await settle();

      // Real keyboard: PageDown switches, a held PageDown (key repeat) does not switch again
      await sleep(300); n0 = (await state()).n;
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown' });
      for (let i = 0; i < 12; i++) { await sleep(60); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown', modifiers: ['isAutoRepeat'] }); }
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageDown' });
      await settle(); await sleep(300); s = await state();
      check('held PageDown: a single switch', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c}`);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageUp' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageUp' });
      await waitFor(async () => (await state()).c === 'ps5', 1500, 20); await settle(); await sleep(300); s = await state();
      check('PageUp switches back', s.c === 'ps5', s.c);

      // Not while an overlay is open
      const preOv = JSON.stringify(await state());
      await press('options'); await waitFor(async () => (await js('window.__ps5.overlays')) > 0, 2000);
      log('before options', preOv, await js('JSON.stringify({z: window.__ps5.nav.zone, r: window.__ps5.nav.row, intro: document.getElementById("intro").classList.contains("on"), boot: window.__ps5.boot})'));
      const ov = await js('window.__ps5.overlays');
      n0 = (await state()).n; await press('consoleNext'); await sleep(300); s = await state();
      check('no switch while an overlay is open', ov > 0 && s.n === n0 && s.c === 'ps5', `overlays ${ov}, switches ${s.n - n0} ${JSON.stringify(s)} ${await js('JSON.stringify(window.__ps5.items.map((x) => x.kind))')}`);
      await press('back'); await waitFor(async () => (await js('window.__ps5.overlays')) === 0, 2000); await sleep(200);
      check('overlay closed again', (await js('window.__ps5.overlays')) === 0);

      // Pad: a fake controller in the page (navigator.getGamepads) drives the real PadMapper.
      await js(`(() => { const p = { index: 0, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }; window.__pad = p; navigator.getGamepads = () => [p]; window.__keys = []; window.__padlog = []; window.addEventListener('keydown', (e) => window.__keys.push(e.key), true); })()`);
      await sleep(150);   // let the menu see the pad once (a pad is primed on first sight)
      const pad = (code) => js(`(() => { const p = window.__pad; ${code} })()`);
      const btn = (i, on) => pad(`p.buttons[${i}] = { pressed: ${on}, value: ${on ? 1 : 0} };`);
      n0 = (await state()).n;
      await btn(11, true); await sleep(120); await btn(11, false); await waitFor(async () => (await state()).n !== n0, 800, 20); await settle(); await sleep(200); s = await state();
      check('pad R3 click switches', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c}`);
      await sleep(300); n0 = (await state()).n;
      // L3 pressed while steering the left stick: navigation, not a switch
      await btn(10, true); await pad('p.axes[0] = 0.9;'); await sleep(200); await pad('p.axes[0] = 0;'); await btn(10, false); await sleep(400); s = await state();
      check('L3 while moving the stick: no switch', s.n === n0 && s.c === 'x360', `switches ${s.n - n0}`);
      // A long L3 hold: no switch
      await btn(10, true); await sleep(1100); await btn(10, false); await sleep(400); s = await state();
      check('long L3 hold: no switch', s.n === n0, `switches ${s.n - n0}`);
      // L3 click: switch back
      await btn(10, true); await sleep(100); await btn(10, false); await waitFor(async () => (await state()).n !== n0, 800, 20); await settle(); await sleep(400); s = await state();
      check('pad L3 click switches back', s.n - n0 === 1 && s.c === 'ps5', `switches ${s.n - n0}, console ${s.c}`);
      // Keyboard and pad at once: PageDown + R3 in the same moment -> one switch
      await sleep(300); n0 = (await state()).n;
      await btn(11, true); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageDown' }); await sleep(60); await btn(11, false);
      await waitFor(async () => (await state()).n !== n0, 800, 20); await settle(); await sleep(300); s = await state();
      check('keyboard + pad together: one switch', s.n - n0 === 1 && s.c === 'x360', `switches ${s.n - n0}, console ${s.c} ${await js(`JSON.stringify({ k: window.__keys, ov: window.__ps5.overlays, l: document.querySelector('#launch').className, b: window.__ps5.boot, focus: document.hasFocus(), g: window.__ps5.guardInfo, now: Math.round(performance.now()) })`)}`);
      // Unplug while R3 is down, plug back in: no ghost switch
      n0 = (await state()).n;
      await btn(11, true); await sleep(60); await pad('p.connected = false;'); await sleep(200); await btn(11, false); await pad('p.connected = true;'); await sleep(400); s = await state();
      check('pad unplugged mid-press: no ghost switch on reconnect', s.n === n0, `switches ${s.n - n0}`);
      // A pad that shows up with R3 already down (plugged in mid-press, or the menu reopening while
      // it is held): the release does not switch
      await pad('p.connected = false;'); await sleep(150); n0 = (await state()).n;
      await btn(11, true); await pad('p.connected = true;'); await sleep(150); await btn(11, false); await sleep(400); s = await state();
      check('pad first seen with R3 held: release does not switch', s.n === n0, `switches ${s.n - n0}`);
      await js('delete navigator.getGamepads');

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
      await press('consolePrev'); await settle(); s = await state();
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
