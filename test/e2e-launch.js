// Loaded by main.js when PS5MENU_SELFTEST points here. Drives the real UI:
// launch -> window hides -> dummy game exits -> window returns focused on that game.
const fs = require('fs');
module.exports = ({ app, win, runner, FILES, readJson }) => {
  const log = (...a) => console.log('[e2e]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = [];
  const check = (name, cond, extra = '') => { results.push([name, !!cond]); log(cond ? 'PASS' : 'FAIL', name, extra); };
  const waitFor = async (fn, ms, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(step); } return false; };

  async function launchCase(label, keys, gameId, expectMinSec) {
    const t0 = Date.now();
    let exitedInfo = null;
    const onExit = (g, info) => { exitedInfo = { id: g.id, ...info }; };
    runner.once('exited', onExit);
    for (const k of keys) { await js(`window.__ps5.dispatch(${JSON.stringify(k)})`); await sleep(300); }
    const hid = await waitFor(() => !win.isVisible(), 4000);
    check(`${label}: launcher hides after launch`, hid);
    check(`${label}: runner tracks ${gameId}`, runner.current && runner.current.game.id === gameId, runner.current && runner.current.game.id);
    const back = await waitFor(() => win.isVisible() && exitedInfo, 20000, 200);
    const dt = (Date.now() - t0) / 1000;
    check(`${label}: launcher returns after game exit`, back, `after ${dt.toFixed(1)}s`);
    check(`${label}: waited for the real game (>= ${expectMinSec}s)`, dt >= expectMinSec, `${dt.toFixed(1)}s`);
    check(`${label}: window focused`, win.isFocused() || process.env.CI_NOFOCUS, String(win.isFocused()));
    await sleep(900);
    const focused = await js('window.__ps5.items[window.__ps5.nav.row].id');
    check(`${label}: focus returns to ${gameId}`, focused === gameId, focused);
    const st = readJson(FILES.state, {});
    check(`${label}: last played + play time saved`, st.lastPlayed && st.lastPlayed[gameId] > 0 && st.playSeconds && st.playSeconds[gameId] >= 1, JSON.stringify(st.playSeconds));
  }

  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1500);
      fs.writeFileSync('/tmp/ps5menu-dummy.log', '');
      // Row order at start: [Desktop, games..., Add, Library]; focus on the first game.
      const order = await js('window.__ps5.items.map((x) => x.id).join(",")');
      log('row', order);
      await launchCase('direct exe (first game via A on row)', ['select'], 'ornek-oyun', 3);
      // After return the played game is first; the launcher-stub game comes next. Use the Oyna button.
      const ids = (await js('window.__ps5.items.map((x) => x.id)'));
      const idx = ids.indexOf('gece-surusu'); const cur = await js('window.__ps5.nav.row');
      const moves = Array(Math.abs(idx - cur)).fill(idx > cur ? 'right' : 'left');
      // Down on the game row now switches to the Xbox 360 menu; X (keyboard x) goes to the Oyna button.
      await launchCase('launcher stub that exits at once ', [...moves, 'x', 'select'], 'gece-surusu', 4);
      const missing = await js('(async () => { const r = await window.ps5.launch("nope"); return r.ok; })()');
      check('unknown game id is rejected', missing === false);
      // Game manager through the same IPC the edit screen uses (the file pickers are native dialogs).
      const ids0 = await js('window.__ps5.items.map((x) => x.kind).join(",")');
      check('row has the Add Game tile before the library', /add,library$/.test(ids0), ids0);
      const saved = await js('window.ps5.saveGame({ title: "Eklenen Oyun", exe: "/bin/true", args: "" })');
      check('saveGame adds an entry', saved.ok && saved.init.allGames.some((g) => g.id === 'eklenen-oyun'), saved.error || '');
      const moved = await js('window.ps5.moveGame("eklenen-oyun", -1)');
      const ord = moved.allGames.map((g) => g.id);
      check('moveGame reorders and switches to manual order', ord.indexOf('eklenen-oyun') === ord.length - 2 && moved.settings.rowOrder === 'manual', ord.join(','));
      const del = await js('window.ps5.deleteGame("eklenen-oyun")');
      check('deleteGame removes it', !del.allGames.some((g) => g.id === 'eklenen-oyun'));
      check('games.json on disk matches', !readJson(FILES.games, { games: [] }).games.some((g) => g.id === 'eklenen-oyun'));
      await js('window.ps5.setSetting("rowOrder", "recent")');
      log(fs.readFileSync('/tmp/ps5menu-dummy.log', 'utf8').trim().replace(/\n/g, ' | '));
    } catch (e) { log('ERROR', e.stack); results.push(['exception', false]); }
    const failed = results.filter((r) => !r[1]).length;
    log(`${results.length - failed}/${results.length} checks passed`);
    fs.writeFileSync(process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e.json', JSON.stringify(results, null, 1));
    app.exit(failed ? 1 : 0);
  });
};
