// An old "Definitely Not PS5 Menu" data folder in a fresh XDG_CONFIG_HOME (what %APPDATA% is on
// Windows), plus a fake Run key with the old exe. Prints the config folder. usage: node test/setup-migrate-root.js
const fs = require('fs'); const path = require('path');
const base = '/tmp/qa İndirilenler/mig-config';
fs.rmSync(base, { recursive: true, force: true });
const old = path.join(base, 'Definitely Not PS5 Menu');
const w = (rel, data) => { const f = path.join(old, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const bin = path.join(__dirname, 'bin');
w('games.json', JSON.stringify({ version: 1, games: [
  { id: 'eski-oyun', title: 'Eski Oyun Ğüş', exe: path.join(bin, 'dummy-game.sh'), args: '1', workingDir: bin, watch: ['dummy-game.sh'] },
  { id: 'eski-360', title: 'Eski 360', console: 'x360', exe: path.join(bin, 'dummy-game.sh'), args: '1', workingDir: bin, watch: ['dummy-game.sh'] },
] }, null, 2));
w('settings.json', JSON.stringify({ intro: 'none', bootIntro: 'off', language: 'tr', autostart: true, username: 'Kutay', dumpRoots: [] }));
w('state.json', JSON.stringify({ console: 'ps5', focusId: 'eski-oyun', lastPlayed: { 'eski-oyun': 1760000000000 }, playSeconds: { 'eski-oyun': 7260 } }));
w('assets/games/eski-oyun/icon.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a2a1b6a40000000049454e44ae426082', 'hex'));
w('intro/intro.json', '{"ps5":{"start":1}}');
w('games.json.bak-20261022-104650', '{"version":1,"games":[]}');
w('electron/Cache/data_0', 'chromium cache');
fs.writeFileSync(path.join(base, 'run.json'), JSON.stringify({ Steam: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', 'io.github.kutaykilicai.definitelynotps5menu': 'C:\\Users\\Kutay\\AppData\\Local\\Programs\\definitely-not-ps5-menu\\Definitely Not PS5 Menu.exe' }));
console.log(base);
