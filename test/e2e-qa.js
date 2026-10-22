// QA scenarios (root from test/setup-qa-root.js <mode>, QA_MODE): broken user files, odd games.json
// entries, input spam during intros and switches, launches around switches, settings, Alt+F4 during
// an intro, many / no Xbox 360 games, and a long switch soak that watches heap, DOM nodes and
// listeners. Writes PS5MENU_SELFTEST_OUT and logs "[e2e-qa] done n/m".
const fs = require('fs');
const { BrowserWindow } = require('electron');
module.exports = ({ app, win, runner, FILES, readJson }) => {
  const MODE = process.env.QA_MODE || 'corrupt';
  const OUT = process.env.PS5MENU_SELFTEST_OUT || `/tmp/e2e-qa-${MODE}.json`;
  const log = (...a) => console.log('[e2e-qa]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = []; const info = { mode: MODE }; const errors = [];
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ results, info, errors }, null, 1));
  const check = (name, cond, extra = '') => { results.push([name, !!cond, String(extra)]); log(cond ? 'PASS' : 'FAIL', name, extra); save(); };
  const waitFor = async (fn, ms, step = 50) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* */ } await sleep(step); } return false; };
  const st = () => js(`({ c: window.__ps5.console, b: window.__ps5.boot, sw: window.__ps5.switching, n: window.__ps5switches || 0, ov: window.__ps5.overlays,
    x: (() => { const x = window.__ps5.x360; return x && x.tile ? (x.tile.game ? x.tile.game.id : x.tile.kind) : null; })(), toast: !!document.querySelector('.toast.on, #toast.on, .toast') })`);
  const press = (k) => js(`window.__ps5.dispatch(${JSON.stringify(k)})`);
  const settle = () => waitFor(async () => { const s = await st(); return !s.sw && !s.b; }, 15000, 40);
  const focusX = (id) => js(`(() => { const d = window.__ps5.xdash; if (!d) return false; for (let p = 0; p < d.panels.length; p++) { const i = d.panels[p].tiles.findIndex((t) => (t.game ? t.game.id : t.kind) === ${JSON.stringify(id)}); if (i >= 0) { d.nav.panel = p; d.nav.focus[p] = i; d.layout(true); return true; } } return false; })()`);
  win.webContents.on('console-message', (...a) => { const e = a[0] && a[0].level !== undefined ? a[0] : { level: a[1], message: a[2] }; if (e.level === 'error' || e.level === 3) errors.push(String(e.message).slice(0, 300)); });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('render-process-gone ' + JSON.stringify(d)));
  process.on('uncaughtException', (e) => errors.push('main: ' + (e && e.stack || e)));
  const finish = (code) => { log('done', `${results.filter((r) => r[1]).length}/${results.length}`); save(); setTimeout(() => app.exit(code), 200); };

  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(600);
      if (MODE === 'corrupt') {
        let s = await st();
        check('starts despite a broken state.json (PS5 menu, default)', s.c === 'ps5', JSON.stringify(s));
        check('PS5 boot plays (bootIntro once)', s.b === 'ps5', s.b);
        const t0 = Date.now();
        await waitFor(async () => !(await st()).b, 15000, 100);
        info.ps5BootSeconds = (Date.now() - t0) / 1000;
        check('0-byte ps5-boot.mp4: falls back to the drawn intro and ends by itself', info.ps5BootSeconds < 11, info.ps5BootSeconds);
        const ids = await js('window.__ps5.items.filter((x) => x.kind === "game").map((x) => x.g.id)');
        check('invalid / numeric / null console values stay in the PS5 menu', ['bad-console', 'num-console', 'nul-console'].every((i) => ids.includes(i)) && !ids.includes('x-noexe'), ids.join(','));
        await press('consoleNext');
        check('first switch: X360 intro starts', await waitFor(async () => (await st()).b === 'x360', 1500));
        const t1 = Date.now();
        await waitFor(async () => !(await st()).b, 16000, 100);
        info.x360BootSeconds = (Date.now() - t1) / 1000;
        check('garbage x360-boot.webm + broken x360-logo.png: drawn intro, ends by itself', info.x360BootSeconds < 13, info.x360BootSeconds);
        s = await st(); check('then the X360 dashboard', s.c === 'x360' && !s.sw, JSON.stringify(s));
        check('X360 tiles exist for the exe-less games', await focusX('x-noexe') && await focusX('x-missing'));
        const toastTxt = () => js('(() => { const t = document.querySelector("#toast"); return t.classList.contains("on") ? t.textContent.trim() : ""; })()');
        await focusX('x-noexe'); await press('select'); await sleep(700);
        let tt = await toastTxt();
        check('A on an X360 game without exe: no launch, a message, menu stays', !runner.running && win.isVisible() && tt, tt);
        await js('document.querySelector("#toast").classList.remove("on")');
        await focusX('x-missing'); await press('select'); await sleep(1500);
        tt = await toastTxt(); s = await st();
        check('A on an X360 game whose exe is missing: no launch, a message, menu stays', !runner.running && win.isVisible() && tt && s.c === 'x360' && !(await js('document.querySelector("#launch").classList.contains("on")')), tt);
        await press('right'); await sleep(200); s = await st();
        check('and the X360 menu still responds', s.x !== 'x-missing', s.x);
        await sleep(500);
        const stt = readJson(FILES.state, null);
        check('state.json is rewritten as valid JSON with the console', stt && stt.console === 'x360', JSON.stringify(stt && stt.console));
      }
      if (MODE === 'baddata' || MODE === 'corrupt') {
        const dir = require('path').dirname(FILES.state);
        const bad = fs.readdirSync(dir).filter((f) => f.includes('.bozuk-'));
        check('unreadable data files are kept as *.bozuk-<time>', MODE === 'corrupt' ? bad.some((f) => f.startsWith('state.json')) : ['state.json', 'settings.json'].every((n) => bad.some((f) => f.startsWith(n))), bad.join(','));
      }
      if (MODE === 'baddata') {
        let s = await st();
        check('junk games.json entries and wrong-type state/settings: menu starts', s.c === 'ps5', JSON.stringify(s));
        const ids = await js('window.__ps5.items.filter((x) => x.kind === "game").map((x) => x.g.id + ":" + x.g.title)');
        check('valid games still listed', ids.some((x) => x.startsWith('ornek-oyun')), ids.join(','));
        const introOn = await js('document.querySelector("#intro").classList.contains("on")');
        check('settings.json of the wrong type: defaults (press-a-button start screen)', introOn);
        await press('consoleNext'); await sleep(300);
        check('menu switch is ignored on the start screen', (await st()).n === 0);
        // default settings: the boot intro, then the start screen; B gets past both
        for (let i = 0; i < 6 && ((await st()).b || await js('document.querySelector("#intro").classList.contains("on")')); i++) { await press('back'); await sleep(900); }
        for (const k of ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left']) { await press(k); await sleep(40); }
        await press('consoleNext'); await settle(); s = await st();
        check('X360 menu opens with them', s.c === 'x360', JSON.stringify(s) + await js('JSON.stringify({ g: window.__ps5.guardInfo, intro: document.querySelector("#intro").className, launch: document.querySelector("#launch").className, stage: document.querySelector("#stage").className })'));
        for (const k of ['right', 'right', 'tabNext', 'right', 'down', 'tabPrev', 'tabPrev']) { await press(k); await sleep(40); }
        await press('consolePrev'); await settle(); await sleep(400);
        const stt = readJson(FILES.state, null);
        check('state.json is valid again', stt && typeof stt === 'object' && stt.console === 'ps5', JSON.stringify(stt).slice(0, 80));
      }
      if (MODE === 'bootoff') {
        check('Konsol Açılış İntrosu off: no intro at start', !(await st()).b);
        await press('consoleNext'); await sleep(100); let s = await st();
        check('no intro on the first switch either, just the slide', !s.b && s.sw, JSON.stringify(s));
        await settle(); s = await st(); check('X360 menu', s.c === 'x360');
        win.setSize(1600, 900); await sleep(500);
        const v = await js('(() => { const f = document.querySelector("#x360 .x-panel.cur .x-tile.focus"); const r = f.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()');
        check('window resized while on X360: focus still on screen', v);
      }
      if (MODE === 'single') {
        await press('consoleNext'); await settle(); const s = await st();
        check('games.json with BOM and a bare one-game object (PowerShell 5): the game is there', s.c === 'x360' && s.x === 'naruto-rise-of-a-ninja', JSON.stringify(s));
      }
      if (MODE === 'trim' || MODE === 'beyond') {
        const timeBoot = async () => { const t0 = Date.now(); await waitFor(async () => !(await st()).b, 30000, 100); return (Date.now() - t0) / 1000; };
        check('PS5 video intro starts', (await st()).b === 'ps5');
        info.ps5 = await timeBoot();
        if (MODE === 'trim') check('cut-off ps5 video: intro still ends (no frozen frame over the menu)', info.ps5 < 12, info.ps5);
        else check('start past the end of the video: trim ignored, the whole video plays and ends', info.ps5 > 12 && info.ps5 < 19, info.ps5);
        if (MODE === 'trim') {
          await press('consoleNext');
          await waitFor(async () => (await st()).b === 'x360', 1500);
          info.x360 = await timeBoot();
          // start 5 of 8.5 s, end 2 ignored: about 3.5 s of video + fade
          check('x360 intro with end before start: plays from start to the natural end', info.x360 > 2.5 && info.x360 < 7, info.x360);
          check('then the X360 dashboard', (await st()).c === 'x360');
        }
      }
      if (MODE === 'empty' || MODE === 'many') {
        await press('consoleNext'); await settle();
        let s = await st();
        check(`X360 menu with ${MODE === 'empty' ? 'no' : '300'} Xbox 360 games opens`, s.c === 'x360', JSON.stringify(s));
        const tiles = await js('window.__ps5.xdash.panels.map((p) => p.id + ":" + p.tiles.length).join(" ")');
        info.panels = tiles;
        const seq = ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'down', 'down', 'up', 'tabNext', 'tabNext', 'tabPrev', 'tabPrev', 'tabPrev', 'back', 'home'];
        const t0 = Date.now(); for (const k of seq) { await press(k); await sleep(30); }
        info.navMs = Date.now() - t0;
        s = await st();
        check('navigating every panel works (no exception, focus somewhere)', s.c === 'x360' && s.x != null, `${tiles} focus ${s.x}`);
        if (MODE === 'many') {
          await press('tabNext'); await sleep(200);
          const lib = await js('(() => { const d = window.__ps5.xdash; const p = d.panels.find((q) => q.id === "games" || q.id === "oyunlar"); return p ? p.tiles.length : -1; })()');
          check('the games panel lists them', lib !== 0, lib);
          // walk deep into the games panel: the focused tile must stay on screen
          await js('(() => { const d = window.__ps5.xdash; d.nav.panel = d.panels.findIndex((p) => p.id === "games"); d.nav.focus[d.nav.panel] = 0; d.layout(true); })()');
          await sleep(300);
          const vis = () => js('(() => { const f = document.querySelector("#x360 .x-panel.cur .x-tile.focus"); if (!f) return null; const r = f.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: innerWidth, h: innerHeight, k: f.dataset.k }; })()');
          const curK = () => js('(() => { const d = window.__ps5.xdash; return d.panels[d.nav.panel].id + ":" + d.focusIndex(); })()');
          const t0 = Date.now(); for (let i = 0; i < 60; i++) { await press('right'); await sleep(8); } info.right60Ms = Date.now() - t0;
          await sleep(700); let v = await vis(); info.deep = v; info.deepK = await curK();
          check('60 x right in the games panel: column 60, focused tile on screen', info.deepK === 'games:180' && v && v.l >= 0 && v.r <= v.w && v.t >= 0 && v.b <= v.h, `${info.deepK} ${JSON.stringify(v)}`);
          for (let i = 0; i < 39; i++) { await press('right'); await sleep(8); } await press('down'); await press('down'); await sleep(700); v = await vis(); info.endK = await curK();
          check('last column: last game reachable and on screen', info.endK === 'games:299' && v && v.l >= 0 && v.r <= v.w, `${info.endK} ${JSON.stringify(v)}`);
          await press('right'); await sleep(700); v = await vis(); info.addK = await curK();
          check('then "add" (or the next panel) is on screen', v && v.l >= 0 && v.r <= v.w, `${info.addK} ${JSON.stringify(v)}`);
          await press('left'); await sleep(100);
          for (let i = 0; i < 99; i++) { await press('left'); await sleep(8); } await sleep(700); v = await vis(); info.backK = await curK();
          check('all the way back left: first column on screen', /^games:[0-2]$/.test(info.backK) && v && v.l >= 0 && v.r <= v.w, `${info.backK} ${JSON.stringify(v)}`);
          for (let i = 0; i < 3; i++) { await press('down'); await press('up'); } await sleep(500); v = await vis();
          check('up/down at the end keep a visible focus', v && v.l >= 0 && v.r <= v.w, JSON.stringify(v));
          await js('(() => { const d = window.__ps5.xdash; d.nav.panel = d.panels.findIndex((p) => p.id === "home"); d.layout(true); })()'); await sleep(300);
          const nodes = await js('document.querySelectorAll("#x360 *").length'); info.x360Nodes = nodes;
          check('DOM stays reasonable with 300 games', nodes < 20000, nodes);
        }
        await press('consolePrev'); await settle(); s = await st();
        check('and back to PS5', s.c === 'ps5', s.c);
      }
      if (MODE === 'flow') {
        let s = await st();
        check('PS5 intro at start', s.b === 'ps5');
        for (let i = 0; i < 60; i++) { await press(['up', 'down', 'left', 'right', 'consoleNext', 'consolePrev', 'tabNext', 'tabPrev', 'up', 'down'][i % 10]); await sleep(10); }
        s = await st();
        check('spam of directions / L3 / R3 / tabs during the intro: swallowed', s.b === 'ps5' && s.c === 'ps5' && s.n === 0, JSON.stringify(s));
        await press('home'); await sleep(450); s = await st();
        check('Guide (home) skips the intro', !s.b, JSON.stringify(s));
        const nav0 = await js('JSON.stringify(window.__ps5.nav)');
        check('PS5 navigation untouched by the intro spam', JSON.parse(nav0).zone === 'row', nav0);
        // Switch, and A right away: A goes to the intro (skip), never to a game
        await press('consoleNext'); await sleep(80); await press('select'); await sleep(50); await press('select');
        await settle(); await sleep(300); s = await st();
        check('A during the first switch / X360 intro does not start a game', !runner.running && s.c === 'x360', JSON.stringify(s));
        // Normal switch, A in the middle of the slide: ignored
        await press('consolePrev'); await sleep(150); await press('select'); await settle(); await sleep(200); s = await st();
        check('A during the slide is ignored', !runner.running && s.c === 'ps5', JSON.stringify(s));
        await press('consoleNext'); await settle(); await sleep(300);
        // Launch Naruto, then R3 / L3 / PageDown while it starts: no switch
        await focusX('naruto-rise-of-a-ninja');
        let exited = false; runner.once('exited', () => { exited = true; });
        const n0 = (await st()).n;
        await press('select'); await sleep(60); await press('consoleNext'); await sleep(60); await press('consolePrev');
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageDown' });
        await sleep(200); s = await st().catch(() => ({}));
        check('switch keys while a game starts: no switch', s.n === n0 && s.c === 'x360', JSON.stringify(s));
        const back = await waitFor(() => exited && win.isVisible(), 30000, 200);
        await sleep(1000); s = await st();
        check('after the game: back in X360 on the same tile, no intro', back && s.c === 'x360' && s.x === 'naruto-rise-of-a-ninja' && !s.b, JSON.stringify(s));
        // Settings: switch the boot intro off from the X360 menu
        await focusX('settings'); await press('select'); await waitFor(async () => (await st()).ov > 0, 2000);
        const rows = await js('[...document.querySelectorAll(".full .panel .it")].map((e) => e.textContent.trim())');
        const want = rows.findIndex((r) => /Açılış İntrosu/.test(r));
        info.settingsRows = rows.length;
        if (want >= 0) { for (let i = 0; i < want; i++) { await press('down'); await sleep(60); } await press('select'); await sleep(500); }
        const shown = () => js('(() => { const f = document.querySelector(".full .panel .it.focus .val"); return f ? f.textContent : null; })()');
        info.shownAfterOff = await shown();
        const set = readJson(FILES.settings, {});
        check('Ayarlar > Açılış introsu toggles and is saved', want >= 0 && set.bootIntro === 'off', `row ${want}, bootIntro ${set.bootIntro}`);
        check('the row shows Kapalı right away', info.shownAfterOff === 'Kapalı', info.shownAfterOff);
        if (want >= 0) { await press('select'); await sleep(400); }
        info.shownAfterOnce = await shown();
        check('and shows the new value again', info.shownAfterOnce === 'Her açılışta bir kez', info.shownAfterOnce);
        check('and back to once', readJson(FILES.settings, {}).bootIntro === 'once', readJson(FILES.settings, {}).bootIntro);
        // language from the X360 menu: the dashboard follows at once, and back
        const tabs = () => js('[...document.querySelectorAll("#x360 .x-tab")].map((e) => e.textContent).join("|")');
        const tabsTr = await tabs();
        const langRow = rows.findIndex((r) => /Dil \/ Language/.test(r));
        const go = async (to) => { const cur = await js('(() => { const f = document.querySelector(".full .panel .it.focus"); return f ? +f.dataset.i : 0; })()'); for (let i = 0; i < Math.abs(to - cur); i++) { await press(to > cur ? 'down' : 'up'); await sleep(50); } };
        await go(langRow); await press('select'); await sleep(600);
        const tabsEn = await tabs();
        check('language to English from the X360 menu: tabs follow', langRow >= 0 && tabsEn !== tabsTr && /home/.test(tabsEn), `${tabsTr} -> ${tabsEn}`);
        await press('select'); await sleep(600);
        check('and back to Turkish', (await tabs()) === tabsTr, await tabs());
        await press('back'); await sleep(400);
        s = await st(); check('settings closed, still X360', s.ov === 0 && s.c === 'x360', JSON.stringify(s));
      }
      if (MODE === 'flow') {
        // focus is kept on both sides across switches
        await focusX('settings'); await sleep(100);
        await press('consolePrev'); await settle(); await sleep(200);
        await press('right'); await press('right'); await sleep(200);
        const nav1 = await js('JSON.stringify(window.__ps5.nav)');
        await press('consoleNext'); await settle(); await sleep(200);
        let s2 = await st();
        check('X360 focus kept across a switch', s2.x === 'settings', s2.x);
        await press('consoleNext'); await settle(); await sleep(200);
        check('PS5 focus kept across a switch', (await js('JSON.stringify(window.__ps5.nav)')) === nav1, nav1);
      }
      if (MODE === 'close') {
        // Alt+F4 while the PS5 intro plays: the app quits and does not come back by itself.
        let quit = false; app.once('will-quit', () => { quit = true; info.windowsAtQuit = BrowserWindow.getAllWindows().length; check('Alt+F4 during the intro: the app quits', true); finish(results.every((r) => r[1]) ? 0 : 1); });
        check('intro playing', (await st()).b === 'ps5');
        if (process.env.QA_CLOSE_AT === 'x360') {
          // skip the PS5 intro, start the switch to X360 and close in the middle of its intro
          await press('select'); await waitFor(async () => !(await st()).b, 3000); await press('consoleNext');
          check('X360 intro playing', await waitFor(async () => (await st()).b === 'x360', 2000));
          await sleep(700);
        }
        win.close();
        await sleep(6000);
        check('Alt+F4 during the intro: the app quits', quit, `windows ${BrowserWindow.getAllWindows().length}`);
      }
      if (MODE === 'fuzz') {
        // Random input (every menu action, with A), several thousand steps. File dialogs, folder
        // opening and quitting are stubbed. Every 150 steps: B until nothing is open, then the menu
        // must be settled, visible and answering.
        const E = require('electron');
        E.dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
        E.shell.openPath = async () => ''; E.shell.showItemInFolder = () => {}; E.shell.openExternal = async () => {};
        // quitting is stubbed: the menu's own quit (with or without the game) is answered as "cancel",
        // so the app's quitting state is never entered half-way
        let quits = 0; app.quit = () => { quits++; };
        E.ipcMain.removeHandler('quit'); E.ipcMain.handle('quit', () => { quits++; return false; });
        const trail = []; const T = (x) => { trail.push(`${(Date.now() % 100000)} ${x}`); if (trail.length > 60) trail.shift(); };
        const send0 = win.webContents.send.bind(win.webContents); win.webContents.send = (ch, ...r) => { T('ipc ' + ch + ' ' + JSON.stringify(r[0] || '').slice(0, 60)); return send0(ch, ...r); };
        runner.on('started', (g) => T('runner started ' + g.id)); runner.on('exited', (g) => T('runner exited ' + g.id));
        const h0 = win.hide.bind(win); win.hide = () => { T('win.hide'); h0(); };
        let seed = Number(process.env.QA_SEED || 1); const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const W = [['up', 8], ['down', 8], ['left', 10], ['right', 10], ['select', 5], ['back', 5], ['tabNext', 3], ['tabPrev', 3], ['tabToggle', 2], ['options', 3], ['home', 2], ['x', 1], ['y', 1], ['consoleNext', 3], ['consolePrev', 3]];
        const tot = W.reduce((a, b) => a + b[1], 0);
        const pick = () => { let r = rnd() * tot; for (const [k, w] of W) { if ((r -= w) < 0) return k; } return 'right'; };
        const N = Number(process.env.QA_FUZZ || 2000); let bad = 0; const stuck = [];
        for (let i = 1; i <= N; i++) {
          if (!win.isVisible() || win.isMinimized()) { if (runner.running) await waitFor(() => !runner.running, 20000, 200); win.restore(); win.show(); await sleep(400); }
          const k = pick();
          T('press ' + k); await press(k).catch(() => {});
          await sleep(rnd() < 0.3 ? 0 : Math.floor(rnd() * 90));
          if (i % 150 === 0 || i === N) {
            // a launch may still be on its way (the game starts ~0.3 s after A): let it run and end
            await sleep(900);
            await waitFor(async () => !runner.running && !(await js('window.__ps5.guardInfo')).launching, 30000, 200);
            await sleep(800); if (!win.isVisible() || win.isMinimized()) { win.restore(); win.show(); await sleep(600); }
            for (let j = 0; j < 8 && (await st()).ov > 0; j++) { await press('back'); await sleep(250); }
            await waitFor(async () => { const q = await st(); return !q.sw && !q.b; }, 15000, 50);
            const q = await st();
            const g = await js('window.__ps5.guardInfo');
            const ok = q.ov === 0 && !q.sw && !q.b && !g.launching && !(await js('document.querySelector("#launch").classList.contains("on")'));
            // the menu still answers: a switch goes through and comes back
            // quiet = no slide and no intro for 500 ms in a row (an intro can start right after a slide)
            const quiet = async () => { let since = 0; await waitFor(async () => { const z = await st(); if (z.sw || z.b) { since = 0; return false; } since = since || Date.now(); return Date.now() - since > 500; }, 20000, 40); };
            const n0 = q.n; await press('consoleNext'); await waitFor(async () => (await st()).n !== n0, 1500, 20); await quiet();
            const n1 = (await st()).n; await press('consolePrev'); await waitFor(async () => (await st()).n !== n1, 1500, 20); await quiet();
            const answers = (await st()).n === n0 + 2;
            const sync = !ok || !answers ? await js('(() => { const n = window.__ps5switches; const l = document.querySelector("#launch").className; window.__ps5.dispatch("consoleNext"); return JSON.stringify({ before: n, after: window.__ps5switches, launch: l, sw: window.__ps5.switching }); })()') : '';
            if (sync) { log('sync', sync); log('trail\n' + trail.join('\n')); }
            const more = !ok || !answers ? await js('JSON.stringify({ intro: document.querySelector("#intro").className, dlg: [...document.querySelectorAll(".dialog")].map((d) => d.parentElement.id + ":" + d.textContent.slice(0, 40)), nav: window.__ps5.nav, n: window.__ps5switches, ov: window.__ps5.overlays, stage: document.querySelector("#stage").className, vis: document.visibilityState, focus: document.hasFocus() })') : '';
            if (!ok || !answers) { bad++; stuck.push({ i, q, g, answers, more }); log('stuck', i, JSON.stringify(q), JSON.stringify(g)); }
          }
        }
        info.quits = quits; info.stuck = stuck;
        check(`fuzz ${N} random inputs (seed ${process.env.QA_SEED || 1}): menu always comes back to a settled, answering state`, bad === 0, JSON.stringify(stuck.slice(0, 3)));
      }
      if (MODE === 'soak') {
        const N = Number(process.env.QA_SOAK || 500);
        const dbg = win.webContents.debugger; dbg.attach('1.3');
        const measure = async () => { await dbg.sendCommand('HeapProfiler.collectGarbage'); await sleep(200); await dbg.sendCommand('HeapProfiler.collectGarbage'); const h = await dbg.sendCommand('Runtime.getHeapUsage'); const c = await dbg.sendCommand('Memory.getDOMCounters'); const dom = await js('document.getElementsByTagName("*").length'); const pm = await js('performance.memory ? performance.memory.usedJSHeapSize : 0'); return { heapMB: +(h.usedSize / 1048576).toFixed(2), pmMB: +(pm / 1048576).toFixed(2), nodes: c.nodes, dom, listeners: c.jsEventListeners, docs: c.documents }; };
        await press('consoleNext'); await settle(); await press('consolePrev'); await settle(); await sleep(500);
        const m0 = await measure(); info.start = m0; info.samples = [];
        const t0 = Date.now(); let n = 0;
        for (let i = 0; i < N; i++) {
          await press(i % 2 ? 'consolePrev' : 'consoleNext');
          await waitFor(async () => !(await js('window.__ps5.switching')), 3000, 15); await sleep(160);
          if (i % 4 === 1) { await press('right'); await press('left'); }
          n++;
          if ((i + 1) % 100 === 0) { const m = await measure(); info.samples.push({ i: i + 1, ...m }); log('soak', i + 1, JSON.stringify(m)); }
        }
        info.seconds = (Date.now() - t0) / 1000;
        const m1 = info.samples[info.samples.length - 1];
        const s = await st();
        check(`${N} switches done, ends on PS5`, n === N && s.c === 'ps5' && s.n >= N, JSON.stringify(s));
        check('heap does not grow (≤ +3 MB after GC)', m1.heapMB - m0.heapMB <= 3, `${m0.heapMB} -> ${m1.heapMB} MB`);
        check('DOM nodes stable (≤ +2 %)', m1.nodes <= m0.nodes * 1.02 + 50 && m1.dom <= m0.dom * 1.02 + 20, `nodes ${m0.nodes} -> ${m1.nodes}, elements ${m0.dom} -> ${m1.dom}`);
        check('event listeners stable', m1.listeners <= m0.listeners + 20, `${m0.listeners} -> ${m1.listeners}`);
        dbg.detach();
      }
      check('no errors in the page or the main process', errors.length === 0, errors.slice(0, 5).join(' | '));
    } catch (e) { check('no exception', false, e.stack); }
    finish(results.every((r) => r[1]) ? 0 : 1);
  });
};
