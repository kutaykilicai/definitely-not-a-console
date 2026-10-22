// node test/ports.test.js -- port updater against a fake GitHub: check, wait rule, issues, ETag,
// rate limit, download + sha256, install with protected files, failed install -> rollback,
// rollback button, game running -> blocked, keep 2 backups, RSS feed. No network.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PT = require('../app/lib/ports.js');
const UZ = require('../app/lib/unzip.js');
const FG = require('./fake-github.js');
const zipw = require('./zipw.js');
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const DAY = 86400e3; const NOW = Date.parse('2026-10-22T09:00:00Z');
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dnac-ports-'));
  const st = { repos: {}, files: {}, remaining: 60 };
  const gh0 = await FG.start(st); const B = gh0.url;
  const mk = (o) => { const r = FG.release(B, o); Object.assign(st.files, r.files); return r; };
  // the "game": v1.0 installed, a user save and a config that must survive
  const game = path.join(tmp, 'Games', 'Örnek Port'); fs.mkdirSync(path.join(game, 'user', 'saves'), { recursive: true });
  fs.writeFileSync(path.join(game, 'Game.exe'), 'v1.0 exe'); fs.writeFileSync(path.join(game, 'data.pak'), 'v1.0 data'); fs.writeFileSync(path.join(game, 'CHANGELOG.md'), '# Changelog\n## 1.0 - 2026-10-01\n');
  fs.writeFileSync(path.join(game, 'user', 'saves', 'slot1.sav'), 'MY SAVE'); fs.writeFileSync(path.join(game, 'game.ini'), 'fullscreen=1');
  const port = { id: 'ornek', title: 'Örnek Port', repo: 'me/ornek', tagPattern: '^v(\\d[\\w.-]*)$', assetPattern: '^Ornek-win\\.zip$', installDir: game, exeCheck: ['Game.exe'],
    detect: [{ type: 'text', file: 'CHANGELOG.md', regex: '^##\\s*(\\d+(?:\\.\\d+)+)' }], protect: ['user/**', '*.ini'], mode: 'notify' };
  const v11 = mk({ tag: 'v1.1', name: 'Ornek-win.zip', published: iso(NOW - 5 * DAY), body: '## Fixes\n- **Audio** crackle fixed\n- [link](http://x) text',
    files: { 'Ornek/Game.exe': 'v1.1 exe', 'Ornek/data.pak': 'v1.1 data', 'Ornek/new.dll': 'new', 'Ornek/CHANGELOG.md': '## 1.1 - x\n', 'Ornek/game.ini': 'DEFAULTS', 'Ornek/user/saves/slot1.sav': 'EMPTY' } });
  const test = mk({ tag: 'v1.2-test1', name: 'Ornek-win.zip', published: iso(NOW - 1 * DAY), prerelease: true, files: { 'Game.exe': 'x' } });
  st.repos['me/ornek'] = { releases: [test.rel, v11.rel], issues: [] };
  const doc = { settings: { waitDays: 3 }, ports: [port] };
  const cache = {}; const gh = new PT.GitHub({ fetchFn: fetch, cache, api: B, now: () => NOW });
  const work = path.join(tmp, 'work'), backups = path.join(tmp, 'backups');

  await ok('versions: compare, tags, pre-releases', () => {
    assert.equal(PT.cmpVersion('0.60.4', '0.60.5'), -1); assert.equal(PT.cmpVersion('2.10.0', '2.9.9'), 1); assert.equal(PT.cmpVersion('0.2.0-beta.2', '0.2.0'), -1);
    assert.equal(PT.cmpVersion('0.2.0-beta.10', '0.2.0-beta.2'), 1); assert.equal(PT.cmpVersion('1.0', '1.0.0'), 0);
    assert.equal(PT.versionOfTag('second-son-v1.0.2', '^second-son-v(\\d[\\w.-]*)$'), '1.0.2'); assert.equal(PT.versionOfTag('windows-v2.6.0-startup-test1', '^windows-v(\\d+(?:\\.\\d+)+)$'), null);
  });
  await ok('KNOWN ports: tag/asset patterns pick the right GitHub release (Kasa data shapes)', () => {
    const k = Object.fromEntries(PT.KNOWN.map((x) => [x.id, x]));
    const rel = (tag, names, pre = false, at = '2026-10-20T00:00:00Z') => ({ tag_name: tag, prerelease: pre, draft: false, published_at: at, assets: names.map((nm) => ({ name: nm })) });
    const gow = [rel('windows-v2.6.0-startup-test1', ['spartanport-windows.zip'], true), rel('windows-v2.7.0', ['spartanport-windows.zip', 'spartanport-windows.zip.sha256']), rel('windows-v2.5.0', ['gow3-windows.zip']), rel('macos-v2.6.0-apple-silicon-test2', ['spartanport-macos.dmg'], true)];
    assert.equal(PT.pickRelease(gow, k['gow3-spartanport']).tag_name, 'windows-v2.7.0');
    assert.equal(PT.pickRelease([rel('second-son-v1.0.2', ['inFAMOUS-SecondSon-shadPS4-v1.0.2-win64.zip']), rel('second-son-v1.1', ['inFAMOUS-SecondSon-shadPS4-v1.1-win64.zip'])], k['infamous-second-son']).tag_name, 'second-son-v1.1');
    assert.equal(PT.pickRelease([rel('v0.60.4', ['SotC-PC.zip']), rel('v0.60.5', ['SotC-PC.zip'])], k['sotc-pc']).tag_name, 'v0.60.5');
    assert.equal(PT.pickRelease([rel('v0.2.0-beta.2', ['naruto-rise-recomp-win-amd64.zip', 'NarutoRiseInstaller.exe', 'SHA256SUMS.txt'])], k['naruto-rise']).tag_name, 'v0.2.0-beta.2');
  });
  await ok('seedFromGames: games.json entries become ports (install folder = exe folder)', () => {
    const games = [{ id: 'inf', exe: 'C:\\Users\\Kutay\\Desktop\\Ai projeler\\inFAMOUS-AxylPup-v1.0\\shadPS4.exe', args: '-g "F:\\PS4 Oyunlar\\inFAMOUS-CUSA00004-v1.07\\CUSA00004\\eboot.bin"' },
      { id: 'other-shad', exe: 'D:\\emu\\shadPS4.exe', args: '-g bloodborne' }, { id: 'sotc', exe: 'F:\\PS4 Oyunlar\\SotC-PC\\SotC.exe' },
      { id: 'gow', exe: 'F:\\PS4 Oyunlar\\GoW3\\gow3-windows\\Play God of War III.exe' }, { id: 'nar', exe: 'F:\\X360 Oyunlar\\NarutoRisePC\\narutorise.exe' }];
    const s = PT.seedFromGames(games); assert.deepEqual(s.map((p) => p.id), ['infamous-second-son', 'sotc-pc', 'gow3-spartanport', 'naruto-rise']);
    assert.ok(s.every((p) => p.mode === 'notify')); assert.equal(PT.seedFromGames(games, s).length, 0);
  });
  await ok('zip: extract, refuses ../ paths', () => {
    const z = path.join(tmp, 'a.zip'); fs.writeFileSync(z, zipw({ 'a/b.txt': 'hi', 'c.txt': 'ç' })); const d = path.join(tmp, 'ax'); UZ.extract(z, d);
    assert.equal(fs.readFileSync(path.join(d, 'a', 'b.txt'), 'utf8'), 'hi');
    fs.writeFileSync(z, zipw({ '../evil.txt': 'x' })); assert.throws(() => UZ.extract(z, path.join(tmp, 'ay')), /unsafe/); assert.ok(!fs.existsSync(path.join(tmp, 'evil.txt')));
  });
  let res;
  await ok('check: installed 1.0 from CHANGELOG, latest 1.1 (test pre-release ignored), notes summarised', async () => {
    [res] = await PT.checkAll(doc, { gh, now: NOW });
    assert.equal(res.installed, '1.0'); assert.equal(res.latest, '1.1'); assert.equal(res.status, 'update', JSON.stringify(res)); assert.ok(/Audio crackle fixed/.test(res.notes) && !/\*\*/.test(res.notes));
  });
  await ok('ETag: a second check gets 304 and uses no rate limit', async () => {
    const before = st.remaining; await PT.checkAll(doc, { gh, now: NOW }); assert.equal(st.remaining, before);
  });
  await ok('wait rule: a 1-day-old release is "hold" (beklemede)', async () => {
    const r = await PT.checkAll(doc, { gh: new PT.GitHub({ fetchFn: fetch, cache: {}, api: B, now: () => NOW - 4 * DAY }), now: NOW - 4 * DAY });
    assert.equal(r[0].status, 'hold'); assert.equal(r[0].hold[0].kind, 'wait');
  });
  await ok('issues: an open "crash on AMD" issue after the release holds it; one about an older version does not', async () => {
    st.repos['me/ornek'].issues = [{ number: 7, title: 'v1.0 crashes on start', body: 'old one', created_at: iso(NOW - 4 * DAY), updated_at: iso(NOW - 4 * DAY), html_url: 'x' }];
    let r = await PT.checkAll(doc, { gh, now: NOW }); assert.equal(r[0].status, 'update', JSON.stringify(r[0].hold));
    st.repos['me/ornek'].issues.push({ number: 9, title: 'Feature: quick save', body: 'Steps to reproduce / does it crash? (template)', created_at: iso(NOW - 2 * DAY), updated_at: iso(NOW - 2 * DAY), html_url: 'x' });
    r = await PT.checkAll(doc, { gh, now: NOW }); assert.equal(r[0].status, 'update', 'a feature request with template words is not a problem report');
    st.repos['me/ornek'].issues.push({ number: 8, title: 'Black screen on AMD after update', body: 'Radeon 6700, 1.1', created_at: iso(NOW - 2 * DAY), updated_at: iso(NOW - 2 * DAY), html_url: `${B}/i/8` });
    r = await PT.checkAll(doc, { gh, now: NOW }); assert.equal(r[0].status, 'hold'); assert.deepEqual(r[0].hold.map((h) => h.number), [8]);
    st.repos['me/ornek'].issues = [];
  });
  await ok('rate limit: 403 falls back to the cached answer, no crash', async () => {
    const save = st.remaining; st.remaining = 0; const g2 = new PT.GitHub({ fetchFn: fetch, cache: JSON.parse(JSON.stringify(cache)), api: B, now: () => NOW });
    for (const k of Object.keys(g2.cache)) if (g2.cache[k] && g2.cache[k].etag) g2.cache[k].etag = '"stale"';
    const r = await PT.checkAll(doc, { gh: g2, now: NOW, skipIssues: true }); assert.equal(r[0].latest, '1.1'); st.remaining = save;
  });
  await ok('blocked while the game runs: nothing downloaded, nothing changed', async () => {
    const r = await PT.install(port, res, { workDir: work, backupsDir: backups, running: () => true });
    assert.equal(r.blocked, 'running'); assert.equal(fs.readFileSync(path.join(game, 'Game.exe'), 'utf8'), 'v1.0 exe'); assert.ok(!fs.existsSync(backups));
  });
  await ok('bad download (size/sha256 mismatch) stops before the backup', async () => {
    const bad = JSON.parse(JSON.stringify(res)); bad.asset.digest = 'sha256:' + '0'.repeat(64);
    await assert.rejects(PT.install(port, bad, { workDir: work, backupsDir: backups }), /sha256/); assert.equal(fs.readFileSync(path.join(game, 'Game.exe'), 'utf8'), 'v1.0 exe'); assert.ok(!fs.existsSync(backups));
  });
  await ok('install: backup, new files, saves/config untouched, exe verified, marker written', async () => {
    const r = await PT.install(port, res, { workDir: work, backupsDir: backups, now: () => new Date(NOW) });
    assert.ok(r.ok, JSON.stringify(r)); assert.equal(fs.readFileSync(path.join(game, 'Game.exe'), 'utf8'), 'v1.1 exe'); assert.equal(fs.readFileSync(path.join(game, 'new.dll'), 'utf8'), 'new');
    assert.equal(fs.readFileSync(path.join(game, 'user', 'saves', 'slot1.sav'), 'utf8'), 'MY SAVE'); assert.equal(fs.readFileSync(path.join(game, 'game.ini'), 'utf8'), 'fullscreen=1');
    assert.equal(PT.detectInstalled(port).version, '1.1'); assert.equal(PT.listBackups(backups, 'ornek').length, 1);
    assert.equal(fs.readFileSync(path.join(PT.listBackups(backups, 'ornek')[0].dir, 'files', 'Game.exe'), 'utf8'), 'v1.0 exe');
  });
  await ok('Geri al: one step back to 1.0 (new.dll removed, save kept)', async () => {
    fs.writeFileSync(path.join(game, 'user', 'saves', 'slot1.sav'), 'MY SAVE'); // same as at backup time
    const r = await PT.rollback(port, { backupsDir: backups }); assert.ok(r.ok);
    assert.equal(fs.readFileSync(path.join(game, 'Game.exe'), 'utf8'), 'v1.0 exe'); assert.ok(!fs.existsSync(path.join(game, 'new.dll'))); assert.equal(PT.detectInstalled(port).version, '1.0');
    assert.equal(fs.readFileSync(path.join(game, 'user', 'saves', 'slot1.sav'), 'utf8'), 'MY SAVE');
  });
  await ok('failed install (verify fails after copying) rolls back automatically', async () => {
    const r = await PT.install(port, res, { workDir: work, backupsDir: backups, now: () => new Date(NOW + 1000), verifyExtra: () => { throw new Error('launch exe missing'); } });
    assert.equal(r.ok, false); assert.ok(r.rolledBack); assert.equal(fs.readFileSync(path.join(game, 'Game.exe'), 'utf8'), 'v1.0 exe'); assert.ok(!fs.existsSync(path.join(game, 'new.dll')));
    assert.equal(fs.readFileSync(path.join(game, 'data.pak'), 'utf8'), 'v1.0 data');
  });
  await ok('package without the exe is refused before touching the game; sidecar .sha256 used when there is no digest', async () => {
    const broken = mk({ tag: 'v1.3', name: 'Ornek-win.zip', published: iso(NOW - 4 * DAY), files: { 'readme.txt': 'oops' }, noDigest: true, sidecar: true });
    st.repos['me/ornek'].releases.unshift(broken.rel);
    const [r3] = await PT.checkAll(doc, { gh, now: NOW }); assert.equal(r3.latest, '1.3'); assert.ok(r3.asset.sidecar);
    const nb = PT.listBackups(backups, 'ornek').length;
    await assert.rejects(PT.install(port, r3, { workDir: work, backupsDir: backups }), /beklenen/); assert.equal(PT.listBackups(backups, 'ornek').length, nb);
    st.repos['me/ornek'].releases.shift();
  });
  await ok('keeps 2 backups: a third update lists then removes the oldest', async () => {
    const logs = [];
    for (let i = 2; i < 5; i++) { await PT.rollback(port, { backupsDir: backups }); await PT.install(port, res, { workDir: work, backupsDir: backups, now: () => new Date(NOW + i * 60e3), log: (...a) => logs.push(a.join(' ')), keepBackups: 2 }); }
    assert.equal(PT.listBackups(backups, 'ornek').length, 2); assert.ok(logs.some((l) => /backups to remove/.test(l)), logs.join('\n'));
  });
  await ok('RSS: decompilation items only, installed ones marked', () => {
    const xml = `<rss><channel><item><title>Shadow of the Colossus PC Port</title><link>https://e/x/</link><pubDate>Thu, 22 Oct 2026 00:00:00 &#43;0000</pubDate><category>decompilations-recompilations</category></item>
      <item><title>Some Browser Game</title><link>https://e/y/</link><pubDate>Wed, 21 Oct 2026 00:00:00 +0000</pubDate><category>browser-based</category></item>
      <item><title>Gran Turismo 4 PC Port</title><link>https://e/z/</link><pubDate>Wed, 21 Oct 2026 00:00:00 +0000</pubDate><category>decompilations-recompilations</category></item></channel></rss>`;
    const items = PT.markInstalled(PT.parseRss(xml, { category: 'decompilations-recompilations' }), ['Shadow of the Colossus', 'Naruto: Rise of a Ninja']);
    assert.equal(items.length, 2); assert.equal(items[0].installed, true); assert.equal(items[1].installed, false); assert.equal(items[0].date, '2026-10-22T00:00:00.000Z');
  });
  await gh0.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${n} ports tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
