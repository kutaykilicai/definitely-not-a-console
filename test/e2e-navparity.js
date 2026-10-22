// PS5 navigation must behave exactly as in 1.3: a fixed sequence of menu actions (pad and keyboard
// names) is dispatched on the PS5 home and the navigation state after every step is written out.
// Run it on 1.3 and on this version (tools/navparity.sh) and compare the two traces.
const fs = require('fs');
module.exports = ({ app, win }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const SEQ = ['right', 'right', 'down', 'right', 'right', 'left', 'down', 'down', 'up', 'up', 'up', 'right', 'right', 'left', 'down', 'y', 'x', 'up', 'down',
    'left', 'left', 'left', 'left', 'down', 'down', 'right', 'up', 'tabNext', 'down', 'up', 'tabPrev', 'up', 'left', 'right', 'down', 'down', 'down', 'up', 'up', 'up', 'up', 'right', 'right', 'right', 'right', 'right', 'down', 'x', 'y', 'back', 'up', 'back'];
  win.webContents.once('did-finish-load', async () => {
    const out = [];
    try {
      await sleep(1500);
      const snap = () => js(`(() => { const n = window.__ps5.nav; return JSON.stringify({ tab: n.tab, zone: n.zone, row: n.row, top: n.top, action: n.action, card: n.card, ov: window.__ps5.overlays, cls: [...document.querySelectorAll('.focus, .focused')].filter((e) => !e.closest('#x360') && !e.closest('#nsw')).map((e) => e.className).join('|') }); })()`);
      out.push(['start', await snap()]);
      for (const a of SEQ) { await js(`window.__ps5.dispatch(${JSON.stringify(a)})`); await sleep(160); out.push([a, await snap()]); }
      // Real key presses, including letters that were free in 1.3 (x, y) and must stay free.
      for (const k of ['ArrowDown', 'ArrowRight', 'x', 'y', 'X', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'e', 'ArrowDown', 'q', 'ArrowDown', 'ArrowDown', 'Escape']) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k });
        await sleep(160); out.push(['key ' + k, await snap()]);
      }
    } catch (e) { out.push(['error', String(e.stack || e)]); }
    fs.writeFileSync(process.env.PS5MENU_SELFTEST_OUT || '/tmp/navparity.json', JSON.stringify(out, null, 1));
    console.log('[navparity] steps', out.length);
    app.exit(0);
  });
};
