// Writes test/root/data/games.json with paths for this checkout (kept out of git).
// Run before the e2e test: node test/setup-root.js
const fs = require('fs'); const path = require('path');
const bin = path.join(__dirname, 'bin');
const g = (id, title, exe, args, description) => ({ id, title, badge: 'PC', description, exe: path.join(bin, exe), args, workingDir: bin, source: 'manual', watch: ['dummy-game.sh'] });
const doc = { version: 1, games: [
  g('ornek-oyun', 'Örnek Oyun', 'dummy-game.sh', '3', 'Menünün nasıl göründüğünü gösteren örnek bir giriş.'),
  g('gece-surusu', 'Gece Sürüşü', 'stub-launcher.sh', '4', 'Başlatıcısı hemen kapanıp asıl oyunu açan bir örnek.'),
  g('kiyi-kasabasi', 'Kıyı Kasabası', 'dummy-game.sh', '2', 'Üçüncü örnek oyun.'),
] };
fs.mkdirSync(path.join(__dirname, 'root', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'root', 'data', 'games.json'), JSON.stringify(doc, null, 2) + '\n');
console.log('test/root/data/games.json written');
