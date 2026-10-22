// Home during a game (1.3.0), with the scripted helper (test/fake-helper.js): holding Esc pauses the
// game (SIGSTOP stands in for NtSuspendProcess) and brings the menu; Devam Et continues it; picking
// another game asks first, closes the open one and starts the new one; Alt+F4 with a game open asks
// whether to close the game too. E2E_QUIT=menu: only the menu goes, the game must keep running.
const fs = require('fs');
const { BrowserWindow } = require('electron');
module.exports = ({ app, getWin, FILES, readJson, getPhase, getSession }) => {
  const F = require(process.env.PS5MENU_FAKE_HELPER);
  const OUT = process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-home.json';
  const log = (...a) => console.log('[e2e]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => getWin().webContents.executeJavaScript(code);
  const results = []; const info = {};
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ results, info }, null, 1));
  const check = (name, cond, extra = '') => { results.push([name, !!cond]); log(cond ? 'PASS' : 'FAIL', name, extra); save(); };
  const waitFor = async (fn, ms, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const has = (e) => F.events.some((x) => x[1] === e);
  const count = (re) => F.events.filter((x) => re.test(x[1])).length;
  const windows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
  const setGame = (id, patch) => { const doc = readJson(FILES.games, { games: [] }); const g = doc.games.find((x) => x.id === id); Object.assign(g, patch); for (const k of Object.keys(patch)) if (patch[k] === undefined) delete g[k]; fs.writeFileSync(FILES.games, JSON.stringify(doc, null, 2)); };
  const ready = () => waitFor(async () => getWin() && !getWin().webContents.isLoading() && await js('!!(window.__ps5 && window.__ps5.items.length)'), 8000);
  const pick = (id) => js(`(() => { const i = window.__ps5.items.findIndex((x) => x.id === "${id}"); window.__ps5.nav.zone = "row"; window.__ps5.nav.row = i; window.__ps5.dispatch("select"); return i; })()`);
  const gamePid = async () => (await F.snap(0, [])).pids[0];
  const playing = () => waitFor(() => !getWin() && windows() === 0 && getPhase() === 'playing', 15000);

  async function start(id, args, extra = {}) {
    setGame(id, { args: String(args), ...extra });
    await ready(); await sleep(400);
    await pick(id);
    return playing();
  }

  async function pauseCase() {
    F.reset('auto');
    F.writeSettings(readJson(FILES.games).games.find((g) => g.id === 'ornek-oyun').exe, true);
    check('game starts, menu window closed', await start('ornek-oyun', 90, { losslessScaling: true, suspendInMenu: true }));
    check('LS scaling after start', await waitFor(() => F.lsOut, 15000));
    check('hold watcher armed while playing', await waitFor(() => !!F.watching, 3000));
    check('watcher: Back+Start hold plus a single Guide press (pad mode 3, no padwatch)', F.watching && F.watching.pad === 3, F.watching && F.watching.pad);
    const pid = await gamePid(); info.firstPid = pid;
    await sleep(500);
    F.hold('esc');
    check('hold Esc: menu window made again', await waitFor(() => getWin() && getWin().isVisible(), 6000));
    check('hold Esc: phase paused', await waitFor(() => getPhase() === 'paused', 6000), getPhase());
    check('LS switched off with its hotkey before the menu', has('ls-scale-OFF-by-hotkey') && !F.lsOut);
    check('game window minimized', F.min.has(pid));
    check('game process suspended (state T)', F.procState(pid) === 'T', F.procState(pid));
    check('watcher off while the menu is up', !F.watching);
    await ready(); await sleep(700);
    check('focus on the paused game, label Devam Et', (await js('window.__ps5.items[window.__ps5.nav.row].id')) === 'ornek-oyun' && (await js('document.querySelector(".btn.primary .label").textContent')) === 'Devam Et');
    check('tile shows the paused mark', await js('!!document.querySelector(".tile .run.paused")'));
    check('side card says Duraklatıldı', (await js('document.querySelector("#side .status").textContent')) === 'Duraklatıldı');
    // Devam Et
    F.events = [];
    await js('(() => { window.__ps5.dispatch("select"); return true; })()');
    check('Devam Et: menu window closed again', await playing(), getPhase());
    check('game resumed (not stopped)', await waitFor(() => F.procState(pid) && F.procState(pid) !== 'T', 3000), F.procState(pid));
    check('game window restored and in front', !F.min.has(pid) && F.fg === pid);
    check('LS scaling again after resume (auto scale)', await waitFor(() => F.lsOut, 12000));
    check('watcher armed again', !!F.watching);
    check('same game process continued', (await gamePid()) === pid);
  }

  async function noSuspendCase() {
    delete getSession().game.suspendInMenu;   // default since 1.5.1: the game keeps running behind the menu
    F.events = [];
    const pid = await gamePid();
    F.hold('guide');
    check('single Xbox (Guide) press: menu over the game', await waitFor(() => getPhase() === 'paused', 6000), getPhase());
    check('default: game process keeps running (not suspended)', F.procState(pid) !== 'T' && !has('suspend 1'), F.procState(pid));
    await ready(); await sleep(500);
    await js('(() => { window.__ps5.dispatch("select"); return true; })()');
    check('resume without suspension works', await playing());
    check('same game process (no relaunch)', (await gamePid()) === pid);
  }

  // Share button (dnac-padwatch.exe shows the desktop and tells the running menu "--desktop"): the
  // game goes to the taskbar and keeps running, nothing is suspended, no refocus pulls it back.
  async function desktopCase() {
    F.events = [];
    const pid = await gamePid();
    app.emit('second-instance', {}, ['dnac.exe', '--from-pad', '--desktop']);
    check('Share: the game window is minimized', await waitFor(() => F.min.has(pid), 3000));
    await sleep(2500);
    check('Share: the game keeps running (not suspended), still the playing phase', F.procState(pid) !== 'T' && !has('suspend 1') && getPhase() === 'playing', `${F.procState(pid)} ${getPhase()}`);
    check('Share: nothing brings the game back by itself', F.min.has(pid) && !has('restore'));
    check('Share: no menu window made', !getWin());
    await F.restore(pid); F.focusGame(pid);   // the taskbar button
  }

  async function switchCase() {
    F.events = [];
    const old = await gamePid();
    F.hold('esc');
    await waitFor(() => getPhase() === 'paused', 6000);
    await ready(); await sleep(600);
    setGame('kiyi-kasabasi', { args: '120' });
    await pick('kiyi-kasabasi');
    await sleep(500);
    const q = await js('(() => { const d = document.querySelector(".dialog.choice"); return d ? d.querySelector(".q").textContent + "|" + document.querySelector("#hints").textContent : null; })()');
    check('another game: confirm dialog first', q && /kapatılacak/.test(q), q);
    check('dialog hints: A Tamam-ish, B İptal', q && /İptal/.test(q));
    check('nothing closed before confirming', F.procState(old) !== null && !has('close'));
    const t0 = Date.now();
    await js('(() => { window.__ps5.dispatch("select"); return true; })()');
    check('old game closed gracefully (WM_CLOSE, no kill)', await waitFor(() => F.procState(old) === null || F.procState(old) === 'Z', 8000) && has('close') && !has('term'), `${Date.now() - t0} ms`);
    check('new game started and menu gone', await playing());
    const nw = await gamePid(); info.secondPid = nw;
    check('new game is a different process', nw && nw !== old);
  }

  async function quitBothCase() {
    F.events = []; F.ignoreClose = true;   // a game that ignores WM_CLOSE: must be ended after ~5 s
    const pid = await gamePid(); info.quitPid = pid;
    F.hold('esc');
    await waitFor(() => getPhase() === 'paused', 6000);
    await ready(); await sleep(600);
    getWin().close();   // Alt+F4
    await sleep(600);
    const q = await js('(() => { const d = document.querySelector(".dialog.choice"); return d ? [...d.querySelectorAll(".btn")].map((b) => (b.classList.contains("focus") ? "*" : "") + b.textContent).join("|") : null; })()').catch(() => null);
    check('Alt+F4 with a game open: asks first, app still up', !!q && windows() === 1, q);
    check('default is closing both', q && /\*İkisini de kapat/.test(q));
    info.quitAsked = Date.now();
    save();
    await js('(() => { window.__ps5.dispatch("select"); return true; })()');
    // the app quits after the game is gone; the outer script checks the pid and that nothing reopened
  }

  async function quitMenuOnlyCase() {
    F.reset('auto');
    check('game starts', await start('ornek-oyun', 40, { losslessScaling: false }));
    const pid = await gamePid(); info.quitPid = pid;
    F.hold('esc');
    await waitFor(() => getPhase() === 'paused', 6000);
    check('paused (stopped)', F.procState(pid) === 'T');
    await ready(); await sleep(600);
    getWin().close();
    await sleep(600);
    await js('(() => { window.__ps5.dispatch("left"); window.__ps5.dispatch("select"); return true; })()');   // Yalnızca menüyü kapat
    save();
  }

  const first = getWin();
  first.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1500);
      if (process.env.E2E_QUIT === 'menu') await quitMenuOnlyCase();
      else { await pauseCase(); await noSuspendCase(); await desktopCase(); await switchCase(); await quitBothCase(); }
    } catch (e) { log('ERROR', e.stack); results.push(['exception', false]); save(); }
    const failed = results.filter((r) => !r[1]).length;
    log(`${results.length - failed}/${results.length} checks passed (before quit)`);
  });
  app.on('will-quit', () => { info.quitAt = Date.now(); save(); log('app quitting'); });
};
