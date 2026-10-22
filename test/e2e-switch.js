// Loaded by main.js when PS5MENU_SELFTEST points here (root: test/setup-qa-root.js switch|switchmany).
// 1.5 Nintendo Switch HOME Menu: only console='switch' games, the HOME navigation (user row, the
// software row with its scroll, the round buttons), A starts the right exe, the three-way cycle
// PS5 -> X360 -> Switch with L3/R3 and PageUp/PageDown, the Eden template in the add screen (file
// dialogs answered by PS5MENU_FAKE_PICK), the Switch theme setting. SW_MODE=many: 15 games.
const fs = require('fs');
module.exports = ({ win, runner, FILES, readJson }) => {
  const MANY = process.env.SW_MODE === 'many';
  const OUT = process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-switch.json';
  const log = (...a) => console.log('[e2e-switch]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = [];
  const check = (name, cond, extra = '') => { results.push([name, !!cond, String(extra)]); log(cond ? 'PASS' : 'FAIL', name, extra); fs.writeFileSync(OUT, JSON.stringify({ results }, null, 1)); };
  const waitFor = async (fn, ms, step = 50) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const st = () => js(`(() => { const p = window.__ps5; const n = p.nsw; const d = p.ndash; return { c: p.console, sw: p.switching, n: window.__ps5switches || 0, ov: p.overlays, row: n && n.row, i: n && n.index, kind: n && n.kind, id: n && n.game ? n.game.id : null, scroll: d && d.nav ? d.nav.scroll : null }; })()`);
  const vis = () => js(`(() => { const v = (s) => { const c = getComputedStyle(document.querySelector(s)); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.01; }; return { p: v('#ps5view'), x: v('#x360'), s: v('#nsw') }; })()`);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  const settle = () => waitFor(async () => !(await st()).sw, 4000, 30);
  const rowsText = () => js('[...document.querySelectorAll(".full .panel .it")].map((e) => e.textContent.trim())');
  const focusRow = async (re) => { const rows = await rowsText(); const want = rows.findIndex((r) => re.test(r)); const cur = await js('[...document.querySelectorAll(".full .panel .it")].findIndex((e) => e.classList.contains("focus"))'); for (let i = cur; i < want; i++) { await press('down'); await sleep(50); } for (let i = cur; i > want; i--) { await press('up'); await sleep(50); } return want; };

  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1500);
      let s = await st(); let v = await vis();
      check('starts in the Switch menu (state.console = switch)', s.c === 'switch' && v.s && !v.p && !v.x, JSON.stringify({ s, v }));
      const ids = await js('window.__ps5.ndash.tiles.filter((x) => x.kind === "game").map((x) => x.game.id)');
      const N = MANY ? 15 : 5;
      check('Switch row: only console=switch games, most recent first', ids.every((x) => /^sw-/.test(x)) && ids[0] === 'sw-1' && ids.length === Math.min(N, 12), ids.join(','));
      check('focus starts on the first software tile', s.row === 'games' && s.i === 0 && s.id === 'sw-1', JSON.stringify(s));
      const title = await js('(document.querySelector("#nsw .n-title") || {}).textContent');
      check('the focused title is shown over the tile', title === 'Switch Oyunu 1', title);
      const ring = await js('(() => { const r = document.querySelector("#nsw .n-track .n-tl.focus"); return !!r && r.dataset.i === "0"; })()');
      check('focus ring on tile 0', ring);
      await press('left'); await sleep(150); s = await st();
      check('left at the first tile: bump, focus stays', s.i === 0, JSON.stringify(s));
      for (let k = 0; k < 4; k++) { await press('right'); await sleep(120); }
      s = await st();
      check('right x4: tile 4, the row scrolled by one (4 tiles fit)', s.i === 4 && s.scroll === 1, JSON.stringify(s));
      const tx = await js('getComputedStyle(document.querySelector("#nsw .n-track")).transform');
      check('the software row slides (transform set)', tx && tx !== 'none', tx);
      if (MANY) {
        for (let k = 0; k < 20; k++) { await press('right'); await sleep(60); }
        s = await st();
        check('15 games: 12 tiles and then the all-software tile', s.i === 12 && s.kind === 'all', JSON.stringify(s));
        await press('select'); await waitFor(async () => (await st()).ov > 0, 2000);
        const lib = await js('(document.querySelector(".full") || {}).className || ""');
        check('all-software opens the library', (await st()).ov > 0, lib);
        await press('back'); await waitFor(async () => (await st()).ov === 0, 2000);
        for (let k = 0; k < 20; k++) { await press('left'); await sleep(40); }
      } else {
        await press('right'); await sleep(150); s = await st();
        check('right at the last tile: bump', s.i === 4, JSON.stringify(s));
      }
      // rows
      await press('down'); await sleep(150); s = await st();
      check('down: the round buttons row', s.row === 'icons', JSON.stringify(s));
      const lbl = await js('(document.querySelector("#nsw .n-label.on") || {}).textContent || ""');
      check('the focused button shows its label', lbl.trim().length > 0, lbl);
      for (let k = 0; k < 12; k++) { await press('right'); await sleep(40); }
      s = await st();
      check('last button is power', s.kind === 'power' && s.i === 8, JSON.stringify(s));
      await press('down'); await sleep(120); s = await st();
      check('down at the buttons: bump', s.row === 'icons', JSON.stringify(s));
      await press('up'); await sleep(120); await press('up'); await sleep(150); s = await st();
      check('up twice: the user row', s.row === 'user', JSON.stringify(s));
      await press('down'); await sleep(150); s = await st();
      check('down: back on the software row, same tile', s.row === 'games', JSON.stringify(s));
      for (let k = 0; k < 20; k++) { await press('left'); await sleep(30); }
      s = await st();
      check('left back to tile 0, scroll 0', s.i === 0 && s.scroll === 0, JSON.stringify(s));

      // A starts the right exe; the menu comes back into Switch on the same tile
      let exited = false; let started = null; runner.once('exited', () => { exited = true; });
      runner.once('started', (x) => { started = x; });
      await press('select');
      const back = await waitFor(() => exited && win.isVisible(), 25000, 200);
      await sleep(900); s = await st();
      check('A on a Switch tile starts that game', back, JSON.stringify(started && (started.id || started.title || started)));
      check('menu back in Switch on the same tile', s.c === 'switch' && s.id === 'sw-1', JSON.stringify(s));
      const last = readJson(FILES.state, {}).lastPlayed || {};
      check('lastPlayed updated for the Switch game', last['sw-1'] > Date.now() - 60e3, String(last['sw-1']));

      // Cycle: Switch -R3-> PS5 -R3-> X360 -R3-> Switch, and L3 the other way
      const n0 = (await st()).n;
      await press('consoleNext'); await sleep(200); v = await vis(); s = await st();
      check('R3 on Switch: to PS5 (mid-switch the X360 layer stays hidden)', s.c === 'ps5' && !v.x, JSON.stringify({ s, v }));
      await settle(); await sleep(250); v = await vis();
      check('PS5 shown, Switch hidden', v.p && !v.s && !v.x, JSON.stringify(v));
      const ps5ids = await js('window.__ps5.items.filter((x) => x.kind === "game").map((x) => x.g.id)');
      check('PS5 row has no Switch games', ps5ids.length > 0 && !ps5ids.some((x) => /^sw-/.test(x)), ps5ids.join(','));
      await press('consoleNext'); await settle(); await sleep(250); s = await st(); v = await vis();
      check('R3 on PS5: X360', s.c === 'x360' && v.x && !v.s && !v.p, JSON.stringify({ s, v }));
      await press('consoleNext'); await sleep(200); v = await vis();
      check('X360 -> Switch: the PS5 layer stays hidden during the switch', !v.p, JSON.stringify(v));
      await settle(); await sleep(250); s = await st(); v = await vis();
      check('R3 on X360: Switch, focus kept', s.c === 'switch' && v.s && !v.x && !v.p && s.id === 'sw-1', JSON.stringify({ s, v }));
      await press('consolePrev'); await settle(); await sleep(250); s = await st();
      check('L3 on Switch: X360', s.c === 'x360', s.c);
      await press('consolePrev'); await settle(); await sleep(250); s = await st();
      check('L3 on X360: PS5', s.c === 'ps5', s.c);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageUp' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageUp' });
      await waitFor(async () => (await st()).c === 'switch', 1500, 20); await settle(); await sleep(250); s = await st();
      check('PageUp on PS5 wraps to Switch', s.c === 'switch', s.c);
      check('six switches counted', s.n - n0 === 6, s.n - n0);
      check('last menu saved as switch', readJson(FILES.state, {}).console === 'switch', readJson(FILES.state, {}).console);
      const sp = await js('JSON.stringify(window.__ps5.guardInfo.bootWanted)');
      check('boot intros off in this root: none wanted', !/true/.test(sp), sp);

      if (!MANY) {
        // Add a game from the Switch menu: the console is preset, the Eden template fills the rest
        await press('down'); await sleep(120);
        for (let k = 0; k < 12; k++) { await press('left'); await sleep(30); }
        await press('right'); await sleep(60); await press('right'); await sleep(100); s = await st();
        check('the add button', s.kind === 'add', JSON.stringify(s));
        await press('select'); await waitFor(async () => (await st()).ov > 0, 2000);
        let rows = await rowsText();
        check('the add screen has the Eden template row', rows.some((r) => /Eden/.test(r)), rows.join(' | '));
        await focusRow(/Eden/); await press('select');
        await waitFor(async () => /Mario Kart/.test((await rowsText()).join('|')), 3000);
        rows = await rowsText();
        check('Eden template fills exe, args and the title', rows.some((r) => /eden\.exe/.test(r)) && rows.some((r) => /-f -g "/.test(r)) && rows.some((r) => /Mario Kart 8 Deluxe/.test(r) && !/\[0100/.test(r)), rows.join(' | '));
        await focusRow(/^Kaydet/); await press('select');
        await waitFor(async () => (await st()).ov === 0, 3000); await sleep(500);
        const doc = readJson(FILES.games, { games: [] }); const g = doc.games.find((x) => /Mario Kart/.test(x.title));
        const set = readJson(FILES.settings, {});
        check('saved: console switch, eden.exe, -f -g "<file>", Eden folder', g && g.console === 'switch' && /eden\.exe$/.test(g.exe) && g.args === `-f -g "${process.env.SW_GAME}"` && g.workingDir === set.edenDir, JSON.stringify(g));
        const ids2 = await js('window.__ps5.ndash.tiles.filter((x) => x.kind === "game").map((x) => x.game.id)');
        check('the new game is on the Switch row', g && ids2.includes(g.id), ids2.join(','));

        // Settings: Switch theme white -> black
        await press('up'); await sleep(100); await press('down'); await sleep(100);
        for (let k = 0; k < 12; k++) { await press('right'); await sleep(30); }
        await press('left'); await sleep(100); s = await st();
        check('the settings button', s.kind === 'settings', JSON.stringify(s));
        await press('select'); await waitFor(async () => (await st()).ov > 0, 2000);
        const want = await focusRow(/Switch teması/i); await press('select'); await sleep(500);
        const th = readJson(FILES.settings, {}).switchTheme;
        const dt = await js('document.querySelector("#nsw").dataset.theme');
        check('Ayarlar > Switch teması: black, saved and applied', want >= 0 && th === 'black' && dt === 'black', `row ${want} ${th} ${dt}`);
        await press('back'); await waitFor(async () => (await st()).ov === 0, 2000);
      }
    } catch (e) { check('no exception', false, e.stack); }
    log('done', results.filter((r) => r[1]).length + '/' + results.length);
    setTimeout(() => process.exit(0), 300);
  });
};
