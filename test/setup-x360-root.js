// Writes test/root-x360: three PS games and one Xbox 360 game (Naruto: Rise of a Ninja, art from
// the recomp project's launcher assets in test/root-x360/ext, kept out of git). Exes are the
// dummy game scripts, so a launch from the Xbox 360 menu can be checked end to end.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, 'root-x360'); const bin = path.join(__dirname, 'bin'); const ext = path.join(root, 'ext');
const g = (id, title, badge, exe, args, extra = {}) => ({ id, title, badge, exe: path.join(bin, exe), args, workingDir: bin, source: 'manual', watch: ['dummy-game.sh'], ...extra });
const doc = { version: 1, games: [
  g('ornek-oyun', 'Örnek Oyun', 'PS4', 'dummy-game.sh', '3'),
  g('gece-surusu', 'Gece Sürüşü', 'PS4', 'stub-launcher.sh', '4'),
  g('kiyi-kasabasi', 'Kıyı Kasabası', 'PC', 'dummy-game.sh', '2'),
  g('naruto-rise-of-a-ninja', 'Naruto: Rise of a Ninja', 'X360', 'dummy-game.sh', '3', {
    console: 'x360', titleIds: ['555307E5'], description: 'Konoha\'da Naruto\'nun hikâyesi.',
    icon: path.join(ext, 'narutorise.ico'), cover: path.join(ext, 'cover.jpg'),
  }),
] };
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'games.json'), JSON.stringify(doc, null, 2) + '\n');
// A fresh run every time: no console/focus left over from an earlier test.
fs.rmSync(path.join(root, 'data', 'state.json'), { force: true });
const set = path.join(root, 'data', 'settings.json');
if (!fs.existsSync(set)) fs.writeFileSync(set, JSON.stringify({ intro: 'none', bootIntro: 'off', language: 'tr', sounds: false, username: 'Kutay', dumpRoots: [] }, null, 2) + '\n');
// art for the PS games: reuse the demo art of test/root
for (const id of ['ornek-oyun', 'gece-surusu', 'kiyi-kasabasi']) {
  const s = path.join(__dirname, 'root', 'assets', 'user', 'games', id); const d = path.join(root, 'assets', 'user', 'games', id);
  if (fs.existsSync(s)) { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) fs.copyFileSync(path.join(s, f), path.join(d, f)); }
}
console.log('test/root-x360 written');
