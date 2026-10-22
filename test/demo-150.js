// Demo recording for 1.5.0 (tools/demo_video.sh): theme music and pictures on the PS5 and Xbox 360
// menus, the settings rows and the statistics screen. Not a test; just drives the menu at human pace.
module.exports = ({ app, win }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => win.webContents.executeJavaScript(c);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  const mark = (s) => console.log(`[demo] ${((Date.now() - T0) / 1000).toFixed(1)} ${s}`);
  let T0 = Date.now();
  const goTo = async (id, gap = 450) => { const items = await js('window.__ps5.items.map((x) => x.id)'); const want = items.indexOf(id); let row = await js('window.__ps5.nav.row'); while (row !== want) { await press(row < want ? 'right' : 'left'); await sleep(gap); row = await js('window.__ps5.nav.row'); } };
  const focusX = (id) => js(`(() => { const d = window.__ps5.xdash; for (let p = 0; p < d.panels.length; p++) { const i = d.panels[p].tiles.findIndex((t) => (t.game ? t.game.id : t.kind) === ${JSON.stringify(id)}); if (i >= 0) { d.nav.panel = p; d.nav.focus[p] = i; d.layout(false); return true; } } return false; })()`);
  win.webContents.once('did-finish-load', async () => {
    await sleep(Number(process.env.DEMO_LEAD_MS || 2500)); T0 = Date.now(); console.log('[demo] start');
    mark('PS5 home'); await sleep(1500);
    await goTo('muz-a'); mark('muz-a: own music + background'); await sleep(4500);
    await goTo('muz-b'); mark('muz-b: PS4 snd0.at9 converted, icon tint'); await sleep(4500);
    mark('fast browsing: no music on the way'); for (let i = 0; i < 4; i++) { await press('right'); await sleep(160); } for (let i = 0; i < 4; i++) { await press('left'); await sleep(160); }
    await sleep(2500);
    await goTo('muz-c'); mark('muz-c: no music'); await sleep(2500);
    await goTo('muz-a'); await sleep(2500);
    mark('settings'); await js('window.__ps5.openList("settings")'); await sleep(900);
    for (let i = 0; i < 6; i++) { await press('down'); await sleep(380); } await sleep(1500);
    const rows = await js('[...document.querySelectorAll("#overlay .full .panel .it")].map((e) => e.textContent)');
    const k = rows.findIndex((r) => /^Oynama istatistikleri/.test(r)); const cur = 6;
    for (let i = cur; i < k; i++) { await press('down'); await sleep(300); }
    await press('select'); mark('statistics'); await sleep(3500); await press('back'); await sleep(500); await press('back'); await sleep(1200);
    mark('to Xbox 360'); await press('consoleNext'); await sleep(2500);
    await focusX('muz-x'); mark('X360: cover becomes the theme, music'); await sleep(5000);
    await press('right'); await sleep(2000); await press('left'); await sleep(3500);
    mark('end'); await sleep(800);
    app.exit(0);
  });
};
