// QA roots for test/e2e-qa.js, under a folder with Turkish letters and spaces (like
// C:\Users\Kutay\İndirilenler\...), so paths are exercised the way Windows users have them.
// usage: node test/setup-qa-root.js <mode>   modes: corrupt | empty | many | soak | flow
const fs = require('fs'); const path = require('path');
const mode = process.argv[2] || process.env.QA_MODE || 'corrupt';
const base = '/tmp/qa İndirilenler'; const dst = path.join(base, `Definitely Not PS5 Menu ${mode}`);
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, 'root-x360'), dst, { recursive: true, filter: (p) => !p.includes(`${path.sep}electron`) });
// the dummy games live in a folder with spaces and Turkish letters too
const bin = path.join(base, 'Oyun Klasörü (şğüıöç)'); fs.mkdirSync(bin, { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, 'bin'))) { fs.copyFileSync(path.join(__dirname, 'bin', f), path.join(bin, f)); fs.chmodSync(path.join(bin, f), 0o755); }
const D = path.join(dst, 'data'); const gj = path.join(D, 'games.json');
const doc = JSON.parse(fs.readFileSync(gj, 'utf8'));
for (const g of doc.games) { g.exe = path.join(bin, path.basename(g.exe)); g.workingDir = bin; }
const g = (id, title, extra) => ({ id, title, exe: path.join(bin, 'dummy-game.sh'), args: '2', workingDir: bin, source: 'manual', watch: ['dummy-game.sh'], ...extra });
const settings = { intro: 'none', bootIntro: 'off', language: 'tr', sounds: true, username: 'Kutay', dumpRoots: [] };
let state = { console: 'ps5' };
const intro = path.join(dst, 'intro'); fs.mkdirSync(intro, { recursive: true });
if (mode === 'corrupt') {
  settings.bootIntro = 'once';
  doc.games.push(g('bad-console', 'Geçersiz Konsol', { console: 'gamecube' }), g('num-console', 'Sayı Konsol', { console: 123 }), g('nul-console', 'Boş Konsol', { console: null }),
    g('x-noexe', 'Exe Yok 360', { console: 'x360', exe: '' }), g('x-missing', 'Kayıp Exe 360', { console: 'x360', exe: path.join(bin, 'yok böyle bir dosya.exe') }));
  fs.writeFileSync(path.join(intro, 'ps5-boot.mp4'), '');                       // 0 bytes
  fs.writeFileSync(path.join(intro, 'x360-boot.webm'), 'bu bir video değil');   // wrong format
  fs.writeFileSync(path.join(intro, 'x360-logo.png'), 'PNG değil');             // broken PNG
  fs.writeFileSync(path.join(intro, 'ps5-logo.png'), Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f80f00000101000518d84e0000000049454e44ae426082', 'hex')); // 1x1 transparent
  fs.writeFileSync(path.join(intro, 'x360-boot.ogg'), '');                       // 0-byte sound (video wins anyway)
  fs.writeFileSync(path.join(intro, 'intro.json'), '{ "ps5": { "start": 5, "end": ');  // cut off
  state = '{"console": "x360", "lastPlayed": {';                                  // cut off
}
if (mode === 'trim') {
  // the user's videos (not in the repo): ps5 cut to 30 % of its bytes (plays, then the data ends),
  // x360 with start after end (end must be ignored), and a start far past the end in "beyond"
  settings.bootIntro = 'once';
  const from = process.env.BOOT_FILES || '/workspace/ps5-menu-intro-user';
  const v = fs.readFileSync(path.join(from, 'ps5-boot.mp4'));
  fs.writeFileSync(path.join(intro, 'ps5-boot.mp4'), v.subarray(0, Math.floor(v.length * 0.3)));
  fs.copyFileSync(path.join(from, 'x360-boot.mp4'), path.join(intro, 'x360-boot.mp4'));
  fs.writeFileSync(path.join(intro, 'intro.json'), JSON.stringify({ ps5: { start: 1.02, end: 13.8 }, x360: { start: 5, end: 2 } }));
}
if (mode === 'beyond') {
  settings.bootIntro = 'once';
  const from = process.env.BOOT_FILES || '/workspace/ps5-menu-intro-user';
  fs.copyFileSync(path.join(from, 'ps5-boot.mp4'), path.join(intro, 'ps5-boot.mp4'));
  fs.writeFileSync(path.join(intro, 'intro.json'), JSON.stringify({ ps5: { start: 9999, end: 10000 } }));
}
if (mode === 'baddata') {
  // junk entries in games.json and data files that parse to the wrong type
  doc.games.push(null, 5, 'metin', [], {}, { id: 'num-title', title: 12345, exe: path.join(bin, 'dummy-game.sh') }, { id: 'no-title', exe: path.join(bin, 'dummy-game.sh'), console: 'x360' }, { title: 'Kimliksiz Oyun', exe: path.join(bin, 'dummy-game.sh') });
}
if (mode === 'empty') doc.games = doc.games.filter((x) => x.console !== 'x360');
if (mode === 'many') for (let i = 0; i < 300; i++) doc.games.push(g(`x360-${i}`, `Xbox Oyunu ${i} İğüşçö`, { console: 'x360', args: '1' }));
if (mode === 'flow' || mode === 'close') settings.bootIntro = 'once';
fs.writeFileSync(gj, JSON.stringify(doc, null, 2));
fs.writeFileSync(path.join(D, 'settings.json'), mode === 'baddata' ? '[1, 2]' : JSON.stringify(settings, null, 2));
fs.writeFileSync(path.join(D, 'state.json'), mode === 'baddata' ? 'null' : typeof state === 'string' ? state : JSON.stringify(state));
process.stdout.write(dst);
