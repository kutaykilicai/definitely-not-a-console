// The real launch chain with a scripted window helper (test/fake-helper.js), as on Windows:
// launch screen -> game window -> menu window destroyed -> LS minimized, auto scale (or hotkey
// fallback) -> game keeps focus -> game exits -> menu made again, game focused.
// Also: Ctrl+Alt+Home brings the menu up during a game (game paused) and Devam Et closes it again;
// closing the shown menu quits the app.
const fs = require('fs'); const path = require('path');
const { BrowserWindow } = require('electron');
module.exports = ({ app, getWin, runner, FILES, readJson, getPhase, homeShortcut }) => {
  const F = require(process.env.PS5MENU_FAKE_HELPER);
  const log = (...a) => console.log('[e2e]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => getWin().webContents.executeJavaScript(code);
  const results = [];
  const check = (name, cond, extra = '') => { results.push([name, !!cond]); log(cond ? 'PASS' : 'FAIL', name, extra); };
  const waitFor = async (fn, ms, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const has = (e) => F.events.some((x) => x[1] === e);
  const windows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
  const setGame = (patch) => { const doc = readJson(FILES.games, { games: [] }); Object.assign(doc.games.find((g) => g.id === 'ornek-oyun'), patch); fs.writeFileSync(FILES.games, JSON.stringify(doc, null, 2)); };
  const ready = () => waitFor(async () => getWin() && !getWin().webContents.isLoading() && await js('!!(window.__ps5 && window.__ps5.items.length)'), 8000);

  async function playCase(label, mode, seconds) {
    F.reset(mode);
    setGame({ args: String(seconds), losslessScaling: true });
    F.writeSettings(readJson(FILES.games).games.find((g) => g.id === 'ornek-oyun').exe, mode === 'auto');
    await ready();
    const id = await js('window.__ps5.items.find((x) => x.kind === "game").id');
    const t0 = Date.now();
    await js(`(() => { const i = window.__ps5.items.findIndex((x) => x.id === "ornek-oyun"); window.__ps5.nav.row = i; window.__ps5.dispatch("select"); })()`);
    const closed = await waitFor(() => !getWin() && windows() === 0 && getPhase() === 'playing', 15000);
    check(`${label}: menu window destroyed after handoff (0 windows)`, closed, `${((Date.now() - t0) / 1000).toFixed(1)}s phase=${getPhase()}`);
    check(`${label}: LS started before the game window was handed over`, has('ls-start'));
    await waitFor(() => has('ls-minimized'), 6000);
    check(`${label}: LS window minimized (it came up maximized)`, has('ls-window-shown') && has('ls-minimized'));
    const scaled = await waitFor(() => F.lsOut, 15000);
    check(`${label}: LS is scaling`, scaled, mode);
    if (mode === 'auto') check(`${label}: no hotkey sent when auto scale worked`, !F.events.some((x) => /^keys/.test(x[1])));
    else check(`${label}: hotkey sent exactly once`, F.events.filter((x) => /^keys/.test(x[1])).length === 1);
    check(`${label}: scaling never switched off`, !has('ls-scale-OFF-by-hotkey'));
    await sleep(800);
    const g = (await F.snap(0, [])).pids[0];
    check(`${label}: game is the foreground window`, g && F.fg === g, `fg=${F.fg} game=${g}`);
    check(`${label}: still no menu window while playing`, windows() === 0);
    const back = await waitFor(() => getWin() && getWin().isVisible() && getPhase() === 'home', 30000, 200);
    check(`${label}: menu made again after the game exited`, back, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
    check(`${label}: exactly one menu window`, windows() === 1);
    await ready(); await sleep(900);
    check(`${label}: focus on the game that was played`, (await js('window.__ps5.items[window.__ps5.nav.row].id')) === 'ornek-oyun');
    check(`${label}: no intro screen on return`, !(await js('document.getElementById("intro").classList.contains("on")')));
    return id;
  }

  async function overlayCase() {
    F.reset('auto'); setGame({ args: '9', losslessScaling: false });
    await ready();
    await js(`(() => { const i = window.__ps5.items.findIndex((x) => x.id === "ornek-oyun"); window.__ps5.nav.row = i; window.__ps5.dispatch("select"); })()`);
    await waitFor(() => !getWin() && getPhase() === 'playing', 15000);
    homeShortcut();
    const up = await waitFor(() => getWin() && getWin().isVisible() && getPhase() === 'paused', 6000);   // 1.3.0: the game is paused behind the menu
    check('Ctrl+Alt+Home during a game shows the menu', up, getPhase());
    await ready(); await sleep(600);
    check('menu knows the game is running', (await js('window.__ps5.items[window.__ps5.nav.row].id')) === 'ornek-oyun');
    await js('setTimeout(() => window.ps5.window("hide"), 0), true');   // what Devam Et does; that window goes away
    const gone = await waitFor(() => !getWin() && getPhase() === 'playing', 6000);
    check('Devam Et closes the menu window again', gone, getPhase());
    const back = await waitFor(() => getWin() && getPhase() === 'home', 20000, 200);
    check('menu back once after that game exits', back && windows() === 1);
  }

  const first = getWin();
  first.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1500);
      await playCase('auto scale', 'auto', 10);
      await playCase('hotkey fallback', 'never', 12);
      await overlayCase();
    } catch (e) { log('ERROR', e.stack); results.push(['exception', false]); }
    const failed = results.filter((r) => !r[1]).length;
    log(`${results.length - failed}/${results.length} checks passed`);
    fs.writeFileSync(process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-seamless.json', JSON.stringify(results, null, 1));
    // Last: closing the shown menu (Alt+F4) must quit the whole app by itself.
    log('closing the menu window; the app must exit on its own');
    getWin().close();
  });
};
