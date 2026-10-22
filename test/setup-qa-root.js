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
if (mode === 'bootoff') { settings.bootIntro = 'off'; fs.copyFileSync(path.join(process.env.BOOT_FILES || '/workspace/ps5-menu-intro-user', 'ps5-boot.mp4'), path.join(intro, 'ps5-boot.mp4')); }
if (mode === 'fuzz') settings.bootIntro = 'once';
if (mode === 'empty') doc.games = doc.games.filter((x) => x.console !== 'x360');
if (mode === 'lists') for (let i = 0; i < 40; i++) doc.games.push(g(`list-${i}`, `Liste Oyunu ${i} İğüşçö`, i % 2 ? { console: 'x360' } : {}));
if (mode === 'theme') {
  // music and pictures made here (sine tones, plain colours); nothing from a real game
  const { execFileSync } = require('child_process');
  const tone = (f, hz, sec) => { fs.mkdirSync(path.dirname(f), { recursive: true }); execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${sec}`, '-c:a', 'libvorbis', '-f', 'ogg', f]); };
  const png = (f, rgb) => { fs.mkdirSync(path.dirname(f), { recursive: true }); execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x${rgb}:s=320x180`, '-frames:v', '1', f]); };
  const UG = path.join(dst, 'assets', 'user', 'games');
  doc.games.push(g('muz-a', 'Müzikli Oyun A', {}), g('muz-b', 'PS4 Temalı B', { badge: 'PS4' }), g('muz-c', 'Sessiz Oyun C', {}), g('muz-x', 'Xbox Temalı', { console: 'x360' }));
  tone(path.join(UG, 'muz-a', 'music.ogg'), 440, 30); tone(path.join(UG, 'muz-a', 'music-2.ogg'), 550, 30);
  png(path.join(UG, 'muz-a', 'background.png'), '304050');
  // B: a PS4 dump folder with snd0.at9 (fake bytes: the test's ffmpeg stand-in "converts" it) and an icon only
  const sce = path.join(base, 'Dump B', 'CUSA99999', 'sce_sys'); fs.mkdirSync(sce, { recursive: true });
  fs.writeFileSync(path.join(sce, 'snd0.at9'), Buffer.alloc(4096, 7)); png(path.join(sce, 'icon0.png'), 'c03020');
  doc.games.find((x) => x.id === 'muz-b').sceSys = sce;
  png(path.join(UG, 'muz-x', 'cover.png'), '2050c0'); tone(path.join(UG, 'muz-x', 'music.ogg'), 330, 30);
  settings.themeVolume = 0.5;
}
if (mode === 'updates') {
  // two "ports" in folders with Turkish letters, and a fake GitHub (test/fake-github.js) state for them
  const FG = require('./fake-github.js'); const GH = process.env.FAKE_GH || 'http://127.0.0.1:47811';
  const PD = path.join(base, 'Portlar'); fs.rmSync(PD, { recursive: true, force: true });
  const mkPort = (dir, ver) => { fs.mkdirSync(path.join(dir, 'user', 'saves'), { recursive: true }); fs.writeFileSync(path.join(dir, 'Game.exe'), `exe ${ver}`); fs.writeFileSync(path.join(dir, 'version.txt'), ver); fs.writeFileSync(path.join(dir, 'user', 'saves', 'slot1.sav'), 'KAYIT'); fs.writeFileSync(path.join(dir, 'oyun.ini'), 'ayar=1'); };
  const A = path.join(PD, 'Örnek Port'), B = path.join(PD, 'Taze Port'); mkPort(A, '1.0'); mkPort(B, '2.0');
  const day = 86400e3; const isoAgo = (d) => new Date(Date.now() - d * day).toISOString().replace(/\.\d+Z$/, 'Z');
  const ra = FG.release(GH, { tag: 'v1.1', name: 'ornek-win.zip', published: isoAgo(6), body: '## Düzeltmeler\n- Ses cızırtısı giderildi\n- Yükleme ekranı hızlandı', files: { 'Game.exe': 'exe 1.1', 'version.txt': '1.1', 'yeni.dll': 'yeni', 'oyun.ini': 'VARSAYILAN', 'user/saves/slot1.sav': 'BOŞ' } });
  const rb = FG.release(GH, { tag: 'v2.1', name: 'taze-win.zip', published: isoAgo(1), body: 'Yeni sürüm', files: { 'Game.exe': 'exe 2.1', 'version.txt': '2.1' } });
  const files = { ...ra.files, ...rb.files }; const filesB64 = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.toString('base64')]));
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Örnek Port Recompilation</title><link>https://example.invalid/ornek/</link><pubDate>Thu, 22 Oct 2026 00:00:00 +0000</pubDate><category>decompilations-recompilations</category></item><item><title>Başka Bir Oyun PC Port</title><link>https://example.invalid/baska/</link><pubDate>Wed, 21 Oct 2026 00:00:00 +0000</pubDate><category>decompilations-recompilations</category></item><item><title>Tarayıcı Oyunu</title><link>https://example.invalid/web/</link><pubDate>Wed, 21 Oct 2026 00:00:00 +0000</pubDate><category>browser-based</category></item></channel></rss>`;
  fs.writeFileSync(path.join(base, 'fakegh.json'), JSON.stringify({ repos: { 'test/ornek': { releases: [ra.rel], issues: [] }, 'test/taze': { releases: [rb.rel], issues: [] } }, filesB64, rss, remaining: 60 }));
  doc.games.push(g('port-a', 'Örnek Port', { exe: path.join(A, 'Game.exe'), workingDir: A }), g('port-b', 'Taze Port', { exe: path.join(B, 'Game.exe'), workingDir: B }));
  const port = (id, title, repo, dir, asset) => ({ id, title, repo, gameId: `port-${id === 'ornek' ? 'a' : 'b'}`, tagPattern: '^v(\\d[\\w.-]*)$', assetPattern: asset, installDir: dir, exeCheck: ['Game.exe'], detect: [{ type: 'file', file: 'version.txt' }], protect: ['user/**', '*.ini'], mode: 'notify' });
  fs.writeFileSync(path.join(D, 'ports.json'), JSON.stringify({ version: 1, settings: { waitDays: 3, keepBackups: 2, checkHours: 24, feed: true }, ports: [port('ornek', 'Örnek Port', 'test/ornek', A, '^ornek-win\\.zip$'), port('taze', 'Taze Port', 'test/taze', B, '^taze-win\\.zip$')] }, null, 2));
  fs.writeFileSync(path.join(base, 'procs.json'), '[]');
}
if (mode === 'many') for (let i = 0; i < 300; i++) doc.games.push(g(`x360-${i}`, `Xbox Oyunu ${i} İğüşçö`, { console: 'x360', args: '1' }));
if (mode === 'flow' || mode === 'close') settings.bootIntro = 'once';
if (mode === 'single') doc.games = doc.games.find((x) => x.console === 'x360');   // one game, not a list
fs.writeFileSync(gj, '\uFEFF' + JSON.stringify(doc, null, 2));
fs.writeFileSync(path.join(D, 'settings.json'), mode === 'baddata' ? '[1, 2]' : JSON.stringify(settings, null, 2));
fs.writeFileSync(path.join(D, 'state.json'), mode === 'baddata' ? 'null' : typeof state === 'string' ? state : JSON.stringify(state));
process.stdout.write(dst);
