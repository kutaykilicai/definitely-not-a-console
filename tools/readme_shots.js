// README screenshots. Used as PS5MENU_SELFTEST by tools/readme_shots.sh.
// Plan steps: { name, keys[], js, wait } -> one PNG; { name, frames, every, keys[] } -> PNG frames for a GIF.
const fs = require('fs'); const path = require('path');
module.exports = ({ app, win }) => {
  const out = process.env.SHOTS_DIR; const plan = JSON.parse(process.env.SHOTS_PLAN || '[]');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => win.webContents.executeJavaScript(c);
  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(2500);
      for (const step of plan) {
        if (step.frames) {
          const dir = path.join(out, step.name); fs.mkdirSync(dir, { recursive: true });
          const keys = [...(step.keys || [])]; let next = Date.now() + (step.lead || 400);
          for (let i = 0; i < step.frames; i++) {
            const t0 = Date.now();
            if (keys.length && t0 >= next) { const k = keys.shift(); if (k.startsWith('js:')) await js(k.slice(3)); else await js(`window.__ps5.dispatch(${JSON.stringify(k)})`); next = t0 + (step.gap || 700); }
            const img = await win.webContents.capturePage();
            fs.writeFileSync(path.join(dir, `${String(i).padStart(3, '0')}.png`), img.resize({ width: 960 }).toPNG());
            await sleep(Math.max(0, (step.every || 80) - (Date.now() - t0)));
          }
          console.log('[shot]', step.name, step.frames, 'frames');
          continue;
        }
        for (const k of step.keys || []) { await js(`window.__ps5.dispatch(${JSON.stringify(k)})`); await sleep(350); }
        if (step.js) await js(step.js);
        await sleep(step.wait ?? 1500);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(out, step.name), img.toPNG());
        console.log('[shot]', step.name);
        if (step.after) { await js(step.after); await sleep(600); }
      }
    } catch (e) { console.log('[shot] ERROR', e.stack); }
    app.exit(0);
  });
};
