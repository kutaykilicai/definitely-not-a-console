// Demo recording for the 1.5.0 Switch HOME Menu (tools/demo_video.sh with DEMO=switch). Not a test.
// PS5 intro (skipped), R3: X360 intro (skipped), R3: the Switch intro in full, then the HOME Menu:
// the software row and its scroll, the round buttons, the user row, the black theme, and the
// three-way cycle again without intros.
module.exports = ({ app, win }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => win.webContents.executeJavaScript(c);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  let T0 = Date.now();
  const mark = (s) => console.log(`[demo] ${((Date.now() - T0) / 1000).toFixed(1)} ${s}`);
  const boot = () => js('window.__ps5.boot');
  const waitBoot = async (ms) => { const end = Date.now() + ms; while (Date.now() < end && await boot()) await sleep(100); };
  const keys = async (k, n, gap) => { for (let i = 0; i < n; i++) { await press(k); await sleep(gap); } };
  win.webContents.once('did-finish-load', async () => {
    T0 = Date.now(); console.log('[demo] start');
    mark('PS5 intro (skipped after 2 s)'); await sleep(2000); if (await boot()) await press('select'); await sleep(2200);
    mark('R3: X360 intro (skipped after 2 s)'); await press('consoleNext'); await sleep(2000); if (await boot()) await press('select'); await sleep(2200);
    mark('R3: Switch intro'); await press('consoleNext'); await sleep(300); await waitBoot(9000); await sleep(1500);
    mark('Switch HOME: software row'); await keys('right', 5, 550); await sleep(800); await keys('left', 5, 300); await sleep(800);
    mark('round buttons'); await press('down'); await sleep(700); await keys('right', 8, 450); await sleep(600); await keys('left', 8, 200); await sleep(600);
    mark('user row'); await press('up'); await sleep(500); await press('up'); await sleep(1500); await press('down'); await sleep(1000);
    mark('black theme'); await js('(() => { const d = window.__ps5.ndash; d.data.settings.switchTheme = "black"; d.render(); })()'); await sleep(3000);
    await js('(() => { const d = window.__ps5.ndash; d.data.settings.switchTheme = "white"; d.render(); })()'); await sleep(1200);
    mark('cycle: R3 PS5, R3 X360, R3 Switch (no intros)'); for (let i = 0; i < 3; i++) { await press('consoleNext'); await sleep(2300); }
    mark('L3 twice: X360, then PS5'); await press('consolePrev'); await sleep(2300); await press('consolePrev'); await sleep(2300);
    mark('PageUp: wraps to Switch'); await press('consolePrev'); await sleep(2600);
    mark('end'); await sleep(600);
    app.exit(0);
  });
};
