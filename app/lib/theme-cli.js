// Read-only: what the 1.5.0 menu would pick as music / background for each game on this PC.
// ELECTRON_RUN_AS_NODE=1 "<menu exe>" resources\app\lib\theme-cli.js "<data dir>" "<out.json>"  (writes only out.json)
const fs = require('fs'); const path = require('path');
const { resolveArt } = require('./detect'); const theme = require('./theme');
const data = process.argv[2]; const out = process.argv[3];
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };
const games = (rd(path.join(data, 'games.json'), { games: [] }).games) || []; const settings = rd(path.join(data, 'settings.json'), {});
const ug = path.join(data, 'assets', 'games');
const res = { ffmpeg: theme.findFfmpeg({ setting: settings.ffmpegPath, dataDir: data }), games: [] };
for (const g of games) {
  const art = resolveArt(g, ug, settings.dumpRoots || []);
  const m = theme.resolveMusic(g, art, { userGamesDir: ug, cacheDir: path.join(data, 'cache', 'theme') });
  const st = (f) => { try { const s = fs.statSync(f); return s.size; } catch { return null; } };
  res.games.push({ id: g.id, title: g.title, console: g.console || 'ps5', hidden: !!g.hidden, sceSys: art.sceSys || g.sceSys || null, icon: art.icon, background: art.background, cover: art.cover, logo: art.logo,
    music: m.source, musicFiles: m.files, at9: m.at9 || null, at9Size: m.at9 ? st(m.at9) : null });
}
fs.writeFileSync(out, JSON.stringify(res, null, 2));
