// Rename to "Definitely Not a Console": the old data folder is copied on the first start, the old
// one is left as it was, the Run entry moves, and the second start does not copy again.
// MIG_STEP=1 (first start) | 2 (second start). Logs "[e2e-mig] done n/m".
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
module.exports = ({ app, win, FILES }) => {
  const STEP = process.env.MIG_STEP || '1';
  const base = process.env.XDG_CONFIG_HOME;
  const OLD = path.join(base, 'Definitely Not PS5 Menu'), NEW = path.join(base, 'Definitely Not a Console');
  const OUT = process.env.PS5MENU_SELFTEST_OUT || '/tmp/e2e-mig.json';
  const results = []; const log = (...a) => console.log('[e2e-mig]', ...a);
  const check = (n, c, x = '') => { results.push([n, !!c, String(x)]); log(c ? 'PASS' : 'FAIL', n, x); };
  const hashTree = (d) => { const h = crypto.createHash('sha1'); const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(p, e.name); h.update(f); if (e.isDirectory()) walk(f); else h.update(fs.readFileSync(f)); } }; walk(d); return h.digest('hex'); };
  const js = (c) => win.webContents.executeJavaScript(c);
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1200));
      check('data folder is the new name', FILES.games === path.join(NEW, 'games.json'), FILES.games);
      if (STEP === '1') {
        const oldHash = fs.readFileSync(path.join(base, 'old.sha1'), 'utf8');
        check('old folder unchanged (not moved, not deleted)', hashTree(OLD) === oldHash);
        for (const f of ['games.json', 'settings.json', 'state.json', 'assets/games/eski-oyun/icon.png', 'intro/intro.json', 'games.json.bak-20261022-104650']) check(`copied: ${f}`, fs.existsSync(path.join(NEW, f)));
        check('Chromium cache of the old app is not copied', !fs.existsSync(path.join(NEW, 'electron', 'Cache', 'data_0')));
        const mark = JSON.parse(fs.readFileSync(path.join(NEW, 'migrated-from.json'), 'utf8'));
        check('marker lists the copied files and the old folder', mark.from === OLD && mark.files.includes('games.json') && mark.files.length >= 6, mark.files.length);
        const ids = await js('window.__ps5.items.filter((x) => x.kind === "game").map((x) => x.id)');
        check('the old games are in the menu', ids.includes('eski-oyun'), ids.join(','));
        const pt = await js('(window.__ps5.items.find((x) => x.id === "eski-oyun") || {}).g.playSeconds');
        check('play time came along', pt === 7260, pt);
        const run = JSON.parse(fs.readFileSync(process.env.PS5MENU_FAKE_REG, 'utf8'));
        check('Run entry of the old exe removed, other entries kept', !run['io.github.kutaykilicai.definitelynotps5menu'] && run.Steam, Object.keys(run).join(','));
        check('a Run entry for the new exe', Object.values(run).some((v) => v === process.execPath), JSON.stringify(run));
      } else {
        const g = JSON.parse(fs.readFileSync(path.join(NEW, 'games.json'), 'utf8'));
        check('second start: nothing copied again (a game added to the old folder stays out)', !g.games.some((x) => x.id === 'sonradan'), g.games.map((x) => x.id).join(','));
        check('second start: old folder still there', fs.existsSync(path.join(OLD, 'games.json')));
      }
    } catch (e) { check('no exception', false, e.stack); }
    fs.writeFileSync(OUT, JSON.stringify({ results }, null, 1));
    log('done', `${results.filter((r) => r[1]).length}/${results.length}`);
    setTimeout(() => app.exit(results.every((r) => r[1]) ? 0 : 1), 200);
  });
};
