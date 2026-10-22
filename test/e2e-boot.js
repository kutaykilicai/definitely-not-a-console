// Loaded by main.js when PS5MENU_SELFTEST points here (root made by test/setup-boot-root.js).
// Console boot intros: PS5 at start, Xbox 360 on the first switch, once per app start, input
// swallowed / skipped, no intro after a game, the menus underneath unchanged. BOOT_E2E=video also
// checks the user's video files (trim from intro.json, the fade into the menu without a black frame).
const fs = require('fs');
module.exports = ({ win, runner }) => {
  const MODE = process.env.BOOT_E2E || 'synth';
  const OUT = process.env.PS5MENU_SELFTEST_OUT || `/tmp/e2e-boot-${MODE}.json`;
  const log = (...a) => console.log('[e2e-boot]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = []; const info = {};
  const check = (name, cond, extra = '') => { results.push([name, !!cond, String(extra)]); log(cond ? 'PASS' : 'FAIL', name, extra); fs.writeFileSync(OUT, JSON.stringify({ results, info }, null, 1)); };
  const waitFor = async (fn, ms, step = 50) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const st = () => js(`({ c: window.__ps5.console, b: window.__ps5.boot, sw: window.__ps5.switching, n: window.__ps5switches || 0, intro: document.getElementById('intro').classList.contains('on'),
    v: (() => { const v = document.querySelector('#boot video'); return v ? { t: v.currentTime, paused: v.paused, w: v.videoWidth, muted: v.muted } : null; })(), op: getComputedStyle(document.getElementById('boot')).opacity })`);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  // Mean luma of the window (sampled), to see a black frame between intro and menu.
  const luma = async () => { const img = await win.webContents.capturePage(); const s = img.resize({ width: 192, height: 108 }); const b = s.toBitmap(); let t = 0; for (let i = 0; i < b.length; i += 4) t += 0.114 * b[i] + 0.587 * b[i + 1] + 0.299 * b[i + 2]; return t / (b.length / 4); };
  const lumaTrace = async (ms) => { const out = []; const end = Date.now() + ms; while (Date.now() < end) { out.push([Date.now(), Math.round(await luma())]); } return out; };

  win.webContents.once('did-finish-load', async () => {
    try {
      await waitFor(async () => (await st()).b, 3000);
      let s = await st();
      check('app start: PS5 boot intro plays', s.b === 'ps5' && s.c === 'ps5', JSON.stringify(s));
      if (MODE === 'video') {
        await waitFor(async () => { const x = await st(); return x.v && x.v.t > 1.1; }, 4000);
        s = await st();
        check('PS5: the user video plays (1080p) from the trim start', s.v && s.v.w === 1920 && s.v.t >= 1.0 && !s.v.paused, JSON.stringify(s.v));
      }
      for (const k of ['down', 'up', 'consoleNext', 'consolePrev', 'left', 'tabNext']) await press(k); await sleep(150); s = await st();
      check('directions and L3/R3 during the intro are swallowed (no switch)', s.c === 'ps5' && s.b === 'ps5' && s.n === 0, JSON.stringify(s));
      if (MODE === 'video') {
        // Let the PS5 video run to its trim end and watch the fade into the home screen.
        await waitFor(async () => { const x = await st(); return x.v && x.v.t > 13.3; }, 16000, 100);
        const tr = await lumaTrace(1400); info.ps5Fade = tr;
        s = await st();
        const min = Math.min(...tr.map((x) => x[1])); const last = tr[tr.length - 1][1];
        check('PS5 video hands over to the home screen (no intro layer left)', !s.b, JSON.stringify(s));
        check('no black frame in the PS5 fade (luma never below the menu or 8)', min >= Math.min(8, last - 2), `min ${min}, menu ${last}`);
        check('PS5 press screen not shown twice after the video', !s.intro, s.intro);
      } else {
        await press('select');
        check('A skips the PS5 intro', await waitFor(async () => !(await st()).b, 800), '');
        check('then the menu (press screen off in this root)', !(await st()).intro);
      }
      await sleep(400);
      info.shownAfterPs5 = (await js('window.ps5.init()')).boot.shown;
      check('main process marks the PS5 intro as shown', info.shownAfterPs5.ps5 === true && info.shownAfterPs5.x360 === false, JSON.stringify(info.shownAfterPs5));

      // First switch to the Xbox 360 menu: its boot intro covers the switch.
      const pre = MODE === 'video' ? Math.round(await luma()) : 0;
      await press('consoleNext');
      if (MODE === 'video') {
        const tr = await lumaTrace(900); info.x360In = [pre, ...tr];
        const lo = Math.min(...tr.map((x) => x[1]));
        check('menu fades into the X360 video without a dark dip', lo >= pre - 3, `menu ${pre}, min ${lo}, end ${tr[tr.length - 1][1]}`);
      }
      check('first R3: X360 boot intro starts', await waitFor(async () => (await st()).b === 'x360', 1500), '');
      check('menu switched to X360 under the intro', await waitFor(async () => (await st()).c === 'x360', 3500), JSON.stringify(await st()));
      for (let i = 0; i < 6; i++) { await press(i % 2 ? 'consolePrev' : 'consoleNext'); await sleep(40); }
      s = await st();
      check('switch input during the X360 intro is swallowed', s.c === 'x360' && s.b === 'x360' && s.n === 1, JSON.stringify(s));
      if (MODE === 'video') {
        s = await st();
        check('X360: the user video plays from the trim start', s.v && s.v.w === 1920 && !s.v.paused && s.v.t >= 0.1, JSON.stringify(s.v));
        await waitFor(async () => { const x = await st(); return x.v && x.v.t > 7.2; }, 9000, 100);
        const tr = await lumaTrace(1300); info.x360Fade = tr;
        const min = Math.min(...tr.map((x) => x[1]));
        check('X360 video fades into the dashboard without a black frame', min > 60, `min luma ${min}`);
      } else {
        // Let the drawn X360 intro run to its end (7.7 s) and fade into the dashboard.
        const t0 = Date.now();
        await waitFor(async () => !(await st()).b, 11000, 100);
        info.x360Seconds = (Date.now() - t0) / 1000;
        check('drawn X360 intro ends by itself (~7.7 s + fade)', info.x360Seconds > 6.5 && info.x360Seconds < 10.5, info.x360Seconds);
      }
      check('X360 intro gone, dashboard shown', await waitFor(async () => !(await st()).b && !(await st()).sw, 3000), JSON.stringify(await st()));

      // 1.5: the third menu. First R3 from the Xbox 360 dashboard: the Switch intro, once.
      await sleep(300);
      await press('consoleNext');
      check('next from X360: Switch boot intro starts', await waitFor(async () => (await st()).b === 'switch', 1500), JSON.stringify(await st()));
      check('menu switched to Switch under the intro', await waitFor(async () => (await st()).c === 'switch', 3500), JSON.stringify(await st()));
      if (MODE === 'video') {
        s = await st();
        check('Switch: the user video plays from the trim start', s.v && s.v.w > 0 && !s.v.paused && s.v.t >= 1.1, JSON.stringify(s.v));
        await waitFor(async () => { const x = await st(); return x.v && x.v.t > 6.6; }, 9000, 60);
        const tr = await lumaTrace(1100); info.switchFade = tr;
        const min = Math.min(...tr.map((x) => x[1]));
        check('Switch video fades into the HOME Menu without a dark frame', min > 180, `min luma ${min}`);
      } else {
        const t0 = Date.now();
        await waitFor(async () => !(await st()).b, 9000, 100);
        info.switchSeconds = (Date.now() - t0) / 1000;
        check('drawn Switch intro ends by itself (~4.3 s + fade)', info.switchSeconds > 3.4 && info.switchSeconds < 6.5, info.switchSeconds);
      }
      check('Switch intro gone, HOME Menu shown', await waitFor(async () => !(await st()).b && !(await st()).sw, 3000), JSON.stringify(await st()));
      await sleep(300);
      await press('consolePrev'); await sleep(60); s = await st();
      check('back to X360 (L3): no intro, normal slide', !s.b && s.sw && s.c === 'x360', JSON.stringify(s));
      await waitFor(async () => !(await st()).sw, 2000);

      // Later switches: no intro, the normal slide.
      await sleep(300);
      await press('consolePrev'); await sleep(60); s = await st();
      check('second switch (to PS5): no intro, normal animation', !s.b && s.sw && s.c === 'ps5', JSON.stringify(s));
      await waitFor(async () => !(await st()).sw, 2000); await sleep(300);
      await press('consoleNext'); await sleep(60); s = await st();
      check('third switch (to X360): no intro', !s.b && s.c === 'x360', JSON.stringify(s));
      await waitFor(async () => !(await st()).sw, 2000);

      // A game: no intro when the menu comes back.
      let exited = false; runner.once('exited', () => { exited = true; });
      await js('(() => { const x = window.__ps5.x360; return x && x.tile && x.tile.game && x.tile.game.id; })()');
      await press('select');
      const back = await waitFor(() => exited && win.isVisible(), 25000, 200);
      await sleep(800); s = await st();
      check('after a game: menu back without a boot intro', back && !s.b, JSON.stringify(s));
      info.shownEnd = (await js('window.ps5.init()')).boot.shown;
      check('all three intros recorded as shown for this run', info.shownEnd.ps5 && info.shownEnd.x360 && info.shownEnd.switch, JSON.stringify(info.shownEnd));
    } catch (e) { check('no exception', false, e.stack); }
    log('done', results.filter((r) => r[1]).length + '/' + results.length);
    setTimeout(() => process.exit(0), 300);
  });
};
