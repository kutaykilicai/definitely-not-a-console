// Frame test (FAKE_VISUAL=1, run by tools/frame_test.sh): launch -> hold Esc -> Devam Et -> quit,
// with real windows on screen while ffmpeg records it. Writes the times of each step; the frames
// are checked by tools/frame_check.py.
const fs = require('fs');
const { BrowserWindow } = require('electron');
module.exports = ({ app, getWin, FILES, readJson, getPhase }) => {
  const F = require(process.env.PS5MENU_FAKE_HELPER);
  const OUT = process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-visual.json';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => getWin().webContents.executeJavaScript(code);
  const marks = {}; const notes = [];
  const mark = (k) => { marks[k] = Date.now(); console.log('[visual]', k); save(); };
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ marks, notes, events: F.events }, null, 1));
  const waitFor = async (fn, ms, step = 50) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const windows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
  const ready = () => waitFor(async () => getWin() && !getWin().webContents.isLoading() && await js('!!(window.__ps5 && window.__ps5.items.length)'), 8000);
  getWin().webContents.once('did-finish-load', async () => {
    try {
      F.reset('auto');
      const doc = readJson(FILES.games); const g = doc.games.find((x) => x.id === 'ornek-oyun');
      g.args = '60'; g.losslessScaling = true; fs.writeFileSync(FILES.games, JSON.stringify(doc, null, 2));
      // A profile the menu made earlier with a 5 s Auto Scale delay: the menu must shorten it to 1 s.
      F.writeSettings(g.exe, true, { title: 'Örnek Oyun (PS5 Menu)', delay: 1, fileDelay: 5 });
      await ready(); await sleep(1500);
      mark('launch');
      await js('(() => { const i = window.__ps5.items.findIndex((x) => x.id === "ornek-oyun"); window.__ps5.nav.row = i; window.__ps5.dispatch("select"); return i; })()');
      await waitFor(() => getPhase() === 'playing', 15000); mark('launch_playing');
      await waitFor(() => windows() === 0, 12000); mark('launch_cover_gone');
      const xml = fs.readFileSync(F.ls.settingsPath(), 'utf8');
      notes.push(`profile delay after launch: ${(xml.match(/PS5 Menu\)<\/Title>[\s\S]*?<AutoScaleDelay>(\d+)/) || [])[1]}`);
      notes.push(`LS scaling after launch: ${F.lsOut}`);
      await sleep(2500);
      mark('hold'); F.hold('esc');
      await waitFor(() => getPhase() === 'paused', 8000); mark('hold_paused');
      await ready(); await sleep(2000);
      mark('resume');
      await js('(() => { window.__ps5.dispatch("select"); return true; })()');
      await waitFor(() => getPhase() === 'playing', 8000); mark('resume_playing');
      await waitFor(() => windows() === 0, 8000); mark('resume_cover_gone');
      notes.push(`LS scaling after resume: ${F.lsOut}; hotkeys: ${F.events.filter((e) => /^keys/.test(e[1])).length}`);
      await sleep(2500);
      mark('hold2'); F.hold('esc');
      await waitFor(() => getPhase() === 'paused', 8000); await ready(); await sleep(1500);
      mark('quit'); getWin().close(); await sleep(700);
      await js('(() => { window.__ps5.dispatch("select"); return true; })()');
    } catch (e) { notes.push(`ERROR ${e.stack}`); save(); }
  });
  app.on('will-quit', () => { mark('quit_done'); if (F.visual) F.visual.stop(); });
};
