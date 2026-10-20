// Real X windows for the fake helper (FAKE_VISUAL=1), so the screen can be recorded and checked
// frame by frame: game = green window of dummy-game.sh, LS output = blue window, "other app" =
// orange window, desktop = magenta root. Electron windows (menu, cover) count as always-on-top,
// like on Windows: raising the game never puts it above them.
const { execFileSync, spawn } = require('child_process');
const x = (...a) => { try { return execFileSync('xdotool', a, { encoding: 'utf8', timeout: 3000 }).trim(); } catch { return ''; } };
const ids = (name) => x('search', '--name', name).split('\n').filter(Boolean);
const gameWin = (pid) => ids(`^dummy-game-${pid}$`)[0] || null;
let lsWin = null; let lsProc = null;

function stackOrder() {   // bottom -> top, decimal ids (xwininfo lists top first)
  let out = ''; try { out = execFileSync('xwininfo', ['-root', '-children'], { encoding: 'utf8' }); } catch { return []; }
  return [...out.matchAll(/^\s+(0x[0-9a-f]+) "([^"]*)"/gm)].map((m) => [String(parseInt(m[1], 16)), m[2]]).reverse();
}
const isTop = ([, name]) => /^Definitely Not PS5 Menu|^fake-ls-output$/.test(name);

// Windows keeps always-on-top windows above all others; X without a window manager does not. A new
// or raised normal window is put back below them right away (checked every 15 ms).
function keepTopmost() {
  const st = stackOrder(); let lastNormal = -1;
  st.forEach((w, i) => { if (!isTop(w) && /^dummy-game-|^other-app$/.test(w[1])) lastNormal = i; });
  const tops = st.map((w, i) => [w, i]).filter(([w, i]) => isTop(w) && i < lastNormal);
  if (tops.length) for (const w of st.filter(isTop)) x('windowraise', w[0]);
}
const timer = setInterval(keepTopmost, 15); timer.unref();

module.exports = {
  raise(pid) {
    const w = gameWin(pid); if (!w) return;
    const tops = stackOrder().filter(isTop).map(([id]) => id);
    x('windowraise', w);
    for (const id of tops) x('windowraise', id);   // keep topmost windows above, in their order
  },
  minimize(pid) { const w = gameWin(pid); if (w) x('windowunmap', w); },
  restore(pid) { const w = gameWin(pid); if (w) x('windowmap', w); },
  async startLs() {
    if (lsProc) return;
    lsProc = spawn('ffplay', ['-loglevel', 'quiet', '-an', '-noborder', '-left', '4000', '-top', '0', '-x', '1920', '-y', '1080', '-window_title', 'fake-ls-output', '-f', 'lavfi', 'color=c=0x0000FF:s=320x180:r=30'], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !lsWin; i++) { await new Promise((r) => setTimeout(r, 100)); lsWin = ids('^fake-ls-output$')[0] || null; }
    if (lsWin) { x('windowunmap', lsWin); x('windowmove', lsWin, '0', '0'); }   // made off screen, then put in place hidden
  },
  lsOut(on) { if (!lsWin) return; if (on) { x('windowmap', lsWin); x('windowraise', lsWin); } else x('windowunmap', lsWin); },
  stop() { try { lsProc && lsProc.kill(); } catch { /* */ } },
};
