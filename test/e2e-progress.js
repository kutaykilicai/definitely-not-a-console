// The game's own loading before its first picture (lib/loadprogress.js), with the scripted helper:
// the dummy game's window exists at once but "loads" for a few seconds and writes a log. The launch
// screen must show the progress, keep covering the game until the log says it is ready, then hand
// over as usual. Cases: percent printed by the game, estimate from the cache size (learned for the
// next launch), and a log that never comes (the launch goes on after a short wait).
// Visual run (tools/frame_test.sh progress): the window is dark red while loading, and must never
// be on screen.
const fs = require('fs'); const path = require('path');
const { BrowserWindow } = require('electron');
module.exports = ({ app, getWin, FILES, readJson, getPhase }) => {
  const F = require(process.env.PS5MENU_FAKE_HELPER);
  const OUT = process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-progress.json';
  const D = '/tmp/ps5menu-load';
  const log = (...a) => console.log('[e2e]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => getWin().webContents.executeJavaScript(code);
  const results = []; const marks = {}; const notes = [];
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ results, marks, notes, events: F.events }, null, 1));
  const mark = (k) => { marks[k] = Date.now(); save(); };
  const check = (name, cond, extra = '') => { results.push([name, !!cond]); log(cond ? 'PASS' : 'FAIL', name, extra); save(); };
  const waitFor = async (fn, ms, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const windows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
  const setGame = (id, patch) => { const doc = readJson(FILES.games, { games: [] }); const g = doc.games.find((x) => x.id === id); Object.assign(g, patch); for (const k of Object.keys(patch)) if (patch[k] === undefined) delete g[k]; fs.writeFileSync(FILES.games, JSON.stringify(doc, null, 2)); };
  const ready = () => waitFor(async () => getWin() && !getWin().webContents.isLoading() && await js('!!(window.__ps5 && window.__ps5.items.length)'), 10000);
  const pick = (id) => js(`(() => { const i = window.__ps5.items.findIndex((x) => x.id === "${id}"); window.__ps5.nav.zone = "row"; window.__ps5.nav.row = i; window.__ps5.dispatch("select"); return i; })()`);
  const SHOT = process.env.FAKE_VISUAL && process.env.PS5MENU_SELFTEST_OUT ? path.join(path.dirname(process.env.PS5MENU_SELFTEST_OUT), 'progress.png') : null; let shot = false;
  const readyInLog = (f) => { try { return /presenter ready/.test(fs.readFileSync(f, 'utf8')); } catch { return false; } };

  // Launch and sample the launch screen until the game is playing: [ms, phase, shown, pct, label, readyInLog]
  async function run(id, logFile) {
    await ready(); await sleep(500);
    const t0 = Date.now(); const seen = [];
    await pick(id);
    while (Date.now() - t0 < 30000) {
      const p = getPhase();
      let v = null;
      if (getWin()) v = await js('(() => { const l = document.querySelector("#launch"); const p = l.querySelector(".prog"); return [l.classList.contains("prog"), p.dataset.pct || "", p.querySelector(".lb").textContent]; })()').catch(() => null);
      seen.push([Date.now() - t0, p, v && v[0], v && v[1], v && v[2], logFile ? readyInLog(logFile) : null]);
      if (SHOT && !shot && v && Number(v[1]) >= 50) { shot = true; try { require('child_process').execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1920x1080', '-i', process.env.DISPLAY, '-frames:v', '1', SHOT]); notes.push(`screenshot at ${v[1]} %: ${SHOT}`); } catch (e) { notes.push(`screenshot failed ${e.message}`); } }
      if (p === 'playing') break;
      await sleep(120);
    }
    return { t0, seen };
  }
  const waitExit = () => waitFor(() => getPhase() === 'home' && getWin(), 30000);

  async function percentCase() {
    F.reset('auto');
    const lf = `${D}/a/last_run.log`;
    setGame('ornek-oyun', { args: `3 log=${lf} warm=4 mode=percent`, losslessScaling: undefined, loadProgress: { log: lf, ready: 'presenter ready', percent: 'shaders (\\d+)%' } });
    mark('p_launch');
    const { seen } = await run('ornek-oyun', lf);
    mark('p_playing');
    const shown = seen.filter((x) => x[2]);
    const pcts = shown.map((x) => x[3]).filter(Boolean).map(Number);
    const playingAt = seen.find((x) => x[1] === 'playing');
    check('percent: progress shown on the launch screen', shown.length >= 5, `${shown.length} samples`);
    check('percent: numbers from the game, rising', pcts.length >= 3 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]) && pcts.some((p) => p > 0 && p < 100), pcts.join(','));
    check('percent: Turkish label', shown.some((x) => /^Shader'lar hazırlanıyor %\d+$/.test(x[4])), (shown.find((x) => /%/.test(x[4] || '')) || [])[4]);
    check('percent: the game is shown only after its ready line', !!playingAt && playingAt[5] && seen.filter((x) => x[1] !== 'playing').every((x) => x[1] === 'launching' || (x[1] === 'home' && x[0] < 1000)) && seen.filter((x) => x[1] === 'launching').every((x) => !x[5] || x[0] > 0), playingAt && `${playingAt[0]} ms`);
    check('percent: handed over within 2.5 s of ready', !!playingAt && playingAt[0] < 4000 + 2500 + 1500, playingAt && `${playingAt[0]} ms`);
    await waitFor(() => windows() === 0, 8000); mark('p_cover_gone');
    check('percent: back in the menu after the game', await waitExit());
  }

  async function estimateCase() {
    F.reset('auto');
    const lf = `${D}/b/last_run.log`; const cache = `${D}/b/cache/CUSA00000`;
    fs.mkdirSync(cache, { recursive: true });
    for (let i = 0; i < 100; i++) fs.writeFileSync(path.join(cache, `${i}.key`), '');
    const src = { log: lf, ready: 'presenter ready', count: { dir: `${D}/b/cache`, ext: '.key' }, msPerItem: 40 };
    setGame('kiyi-kasabasi', { args: `2 log=${lf} warm=3`, loadProgress: src });
    const st0 = readJson(FILES.state, {}); delete (st0.loadStats || {})['kiyi-kasabasi']; fs.writeFileSync(FILES.state, JSON.stringify(st0));
    const { seen } = await run('kiyi-kasabasi', lf);
    const pcts = seen.filter((x) => x[2] && x[3] && !x[5]).map((x) => Number(x[3]));
    check('estimate: percent from the cache size while the game prints none', pcts.length >= 5 && pcts.some((p) => p >= 20 && p <= 97), pcts.join(','));
    check('estimate: never 100 % before the ready line', pcts.every((p) => p < 100));
    await waitFor(() => windows() === 0, 8000);
    await waitExit();
    const st = readJson(FILES.state, {}); const ls = st.loadStats && st.loadStats['kiyi-kasabasi'];
    check('estimate: time per item learned for the next launch', ls && ls.items === 100 && ls.msPerItem > 25 && ls.msPerItem < 60, JSON.stringify(ls));
    notes.push(`learned ${JSON.stringify(ls)}`);
  }

  async function noLogCase() {
    F.reset('auto');
    setGame('kiyi-kasabasi', { args: '2', loadProgress: { log: `${D}/none/never.log`, ready: 'presenter ready', noLogMs: 1500 } });
    const { seen } = await run('kiyi-kasabasi', null);
    const playingAt = seen.find((x) => x[1] === 'playing');
    check('no log: the launch goes on (indeterminate at most)', !!playingAt && playingAt[0] < 6000 && seen.every((x) => !x[3]), playingAt && `${playingAt[0]} ms`);
    await waitFor(() => windows() === 0, 8000); await waitExit();
    setGame('kiyi-kasabasi', { args: '2', loadProgress: undefined });
  }

  getWin().webContents.once('did-finish-load', async () => {
    try {
      fs.rmSync(D, { recursive: true, force: true });
      await sleep(1500);
      await percentCase();
      if (!process.env.E2E_ONLY_PERCENT) { await estimateCase(); await noLogCase(); }
    } catch (e) { log('ERROR', e.stack); results.push(['exception', false]); save(); }
    const failed = results.filter((r) => !r[1]).length;
    log(`${results.length - failed}/${results.length} checks passed`);
    mark('done');
    setGame('ornek-oyun', { args: '3', loadProgress: undefined });
    setTimeout(() => app.exit(failed ? 1 : 0), 300);
  });
  app.on('will-quit', () => { if (F.visual) F.visual.stop(); });
};
