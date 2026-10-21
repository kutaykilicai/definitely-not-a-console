// PS5MENU_SELFTEST helper: captures the PS5 -> Xbox 360 switch frame by frame. The switch's Web
// Animations are paused and stepped with currentTime, so every frame is exact (no capture lag).
// env: FRAMES_DIR (output), FRAMES_DIR_STEP (ms, default 1000/60), FRAMES_KEY (down|up)
const fs = require('fs'); const path = require('path');
module.exports = ({ app, win }) => {
  const js = (c) => win.webContents.executeJavaScript(c);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dir = process.env.FRAMES_DIR; const step = +(process.env.FRAMES_STEP || 1000 / 60); const key = process.env.FRAMES_KEY || 'down';
  win.webContents.once('did-finish-load', async () => {
    fs.mkdirSync(dir, { recursive: true });
    await sleep(2500);
    const hold = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, `f${String(n).padStart(3, '0')}.png`), img.toPNG()); };
    let n = 0;
    for (let i = 0; i < 6; i++) await hold(n++);
    await js(`window.__ps5.dispatch(${JSON.stringify(key)}); window.__anims = document.getAnimations().filter((a) => a.effect && a.effect.target && ['ps5view', 'x360'].includes(a.effect.target.id)); window.__anims.forEach((a) => a.pause()); window.__anims.length`);
    for (let t = 0; t <= 520; t += step) {
      await js(`window.__anims.forEach((a) => { a.currentTime = ${t}; })`); await sleep(60); await hold(n++);
    }
    await js('window.__anims.forEach((a) => a.play())'); await sleep(800);
    for (let i = 0; i < 12; i++) await hold(n++);
    console.log('[frames]', n);
    app.exit(0);
  });
};
