'use strict';
// Port update tracker: which version of each PC port is installed, what its GitHub releases say,
// whether a new release is safe to install yet, and a full-backup -> install -> verify -> roll back
// update. ports.json (next to games.json) holds the ports; ports-state.json the cache (ETags, last
// results). No token: GitHub's anonymous API (60 requests/hour), with ETags so unchanged answers
// do not count. Original code.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const unzip = require('./unzip');

const isWin = process.platform === 'win32';
const P = isWin ? path.win32 : path;
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(P.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(t, f); };

const DEFAULTS = {
  checkHours: 24, waitDays: 3, keepBackups: 2,
  keywords: ['crash', 'crashes', 'broken', 'regression', 'black screen', 'does not start', "doesn't start", 'won\'t start', 'freeze', 'amd', 'radeon', 'save', 'corrupt'],
  feed: { url: 'https://thegamingemporium.com/rss.xml', category: 'decompilations-recompilations', page: 'https://thegamingemporium.com/categories/decompilations-recompilations/' },
};

// ---------- versions ----------
// "second-son-v1.0.2" with tagPattern "^second-son-v(.+)$" -> "1.0.2"; "v0.60.5" -> "0.60.5"
function versionOfTag(tag, pattern) {
  if (pattern) { const m = new RegExp(pattern).exec(tag || ''); if (!m) return null; return m[1] || (tag || '').replace(/^v/i, ''); }
  return String(tag || '').replace(/^[^0-9]*/, '') || null;
}
// numeric parts compared as numbers; a pre-release (1.0-beta.2) is lower than the release (1.0)
function cmpVersion(a, b) {
  const split = (v) => { const [main, pre] = String(v || '').split(/-(.+)/); return { main: main.split(/[._]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x)), pre: pre || null }; };
  const A = split(a), B = split(b);
  for (let i = 0; i < Math.max(A.main.length, B.main.length); i++) {
    const x = A.main[i] ?? 0, y = B.main[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return String(x) < String(y) ? -1 : 1;
  }
  if (A.pre === B.pre) return 0; if (!A.pre) return 1; if (!B.pre) return -1;
  const pa = A.pre.split('.'), pb = B.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i]; if (x === y) continue; if (x == null) return -1; if (y == null) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1; return x < y ? -1 : 1;
  }
  return 0;
}

// ---------- installed version ----------
// detect: { type: 'marker' } (.dnac-port.json written by our own update), 'file' (a version file),
// 'text' (regex over a README/CHANGELOG), 'exe-version' (file version), 'mtime' (closest release
// published before the exe's date; only an estimate).
const MARKER = '.dnac-port.json';
function detectInstalled(port, { releases = null, fileVersion = null } = {}) {
  const dir = port.installDir;
  if (!dir || !exists(dir)) return { version: null, how: 'missing' };
  const mk = readJson(P.join(dir, MARKER), null);
  if (mk && mk.version) return { version: mk.version, how: 'marker', tag: mk.tag };
  for (const d of [].concat(port.detect || [])) {
    try {
      if (d.type === 'file' || d.type === 'text') {
        const f = P.join(dir, d.file); if (!exists(f)) continue;
        const txt = fs.readFileSync(f, 'utf8');
        const m = new RegExp(d.regex || '([0-9]+(?:\\.[0-9]+)+(?:-[0-9A-Za-z.]+)?)', d.flags || 'm').exec(txt);
        if (m) return { version: m[1].trim(), how: d.type, file: d.file };
      }
      if (d.type === 'exe-version' && fileVersion) { const v = fileVersion(P.join(dir, d.file)); if (v) return { version: v, how: 'exe-version', file: d.file }; }
      if (d.type === 'mtime' && releases) {
        const f = P.join(dir, d.file); if (!exists(f)) continue;
        const t = fs.statSync(f).mtimeMs; const re = port.tagPattern ? new RegExp(port.tagPattern) : null;
        const before = releases.filter((r) => !r.draft && (port.prerelease || !r.prerelease) && (!re || re.test(r.tag_name))).filter((r) => Date.parse(r.published_at) <= t + 6 * 3600e3).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
        if (before[0]) return { version: versionOfTag(before[0].tag_name, port.tagPattern), how: 'mtime', estimate: true, file: d.file };
      }
    } catch { /* next */ }
  }
  return { version: null, how: 'unknown' };
}

// ---------- GitHub ----------
class GitHub {
  // fetchFn(url, {headers}) -> { status, headers: {get}, json() } (global fetch, or a fake in tests)
  constructor({ fetchFn, cache, api = 'https://api.github.com', now = () => Date.now(), log = () => {} }) { this.fetch = fetchFn; this.cache = cache || {}; this.api = api.replace(/\/$/, ''); this.now = now; this.log = log; this.calls = 0; }
  async get(pathq) {
    const url = `${this.api}${pathq}`; const c = this.cache[url];
    const rl = this.cache._rate;
    if (rl && rl.remaining === 0 && rl.reset * 1000 > this.now()) { if (c) return { data: c.data, cached: true, limited: true }; throw Object.assign(new Error('GitHub rate limit'), { code: 'rate', reset: rl.reset }); }
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'DefinitelyNotAConsole-updates', 'X-GitHub-Api-Version': '2022-11-28' };
    if (c && c.etag) headers['If-None-Match'] = c.etag;
    this.calls++;
    const r = await this.fetch(url, { headers });
    const h = (k) => (r.headers && (r.headers.get ? r.headers.get(k) : r.headers[k])) || null;
    if (h('x-ratelimit-remaining') != null) this.cache._rate = { remaining: Number(h('x-ratelimit-remaining')), reset: Number(h('x-ratelimit-reset')) };
    if (r.status === 304 && c) return { data: c.data, cached: true };
    if (r.status === 403 || r.status === 429) { if (c) return { data: c.data, cached: true, limited: true }; throw Object.assign(new Error(`GitHub ${r.status}`), { code: 'rate' }); }
    if (r.status < 200 || r.status >= 300) throw new Error(`GitHub ${r.status} ${pathq}`);
    const data = await r.json();
    this.cache[url] = { etag: h('etag'), data, at: this.now() };
    return { data };
  }
  releases(repo) { return this.get(`/repos/${repo}/releases?per_page=30`).then((x) => x.data); }
  issuesSince(repo, iso) { return this.get(`/repos/${repo}/issues?state=open&per_page=50&since=${encodeURIComponent(iso)}`).then((x) => x.data); }
}

function pickRelease(releases, port) {
  const re = port.tagPattern ? new RegExp(port.tagPattern) : null;
  const ok = (releases || []).filter((r) => !r.draft && (port.prerelease || !r.prerelease) && (!re || re.test(r.tag_name)) && assetOf(r, port));
  ok.sort((a, b) => cmpVersion(versionOfTag(b.tag_name, port.tagPattern), versionOfTag(a.tag_name, port.tagPattern)) || Date.parse(b.published_at) - Date.parse(a.published_at));
  return ok[0] || null;
}
function assetOf(rel, port) {
  const re = new RegExp(port.assetPattern || '\\.zip$', 'i');
  return (rel.assets || []).find((a) => re.test(a.name)) || null;
}

function sideOf(rel, asset) {
  const a = (rel.assets || []).find((x) => x.name === `${asset.name}.sha256`) || (rel.assets || []).find((x) => /^sha256sums/i.test(x.name));
  return a ? a.browser_download_url : null;
}
// The wait rule: a release younger than waitDays, or one with open issues filed after it that
// name crash/broken/AMD/regression etc. (and do not belong to an older version), is "on hold".
function holdReasons(rel, { issues = [], now = Date.now(), waitDays = 3, keywords = DEFAULTS.keywords, version, port } = {}) {
  const out = [];
  const age = (now - Date.parse(rel.published_at)) / 86400e3;
  if (age < waitDays) out.push({ kind: 'wait', days: Math.round(age * 10) / 10, waitDays });
  const pub = Date.parse(rel.published_at);
  const kw = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
  for (const it of issues || []) {
    if (it.pull_request) continue;
    if (Date.parse(it.created_at) < pub) continue;
    const text = `${it.title || ''}\n${it.body || ''}`;
    if (!kw.test(text)) continue;
    // an issue that names another version is about that one
    const vers = [...text.matchAll(/v?(\d+\.\d+(?:\.\d+)?(?:-[0-9a-z.]+)?)/gi)].map((m) => m[1]);
    if (vers.length && version && !vers.some((v) => cmpVersion(v, version) === 0) && !text.includes(rel.tag_name)) continue;
    out.push({ kind: 'issue', number: it.number, title: String(it.title || '').slice(0, 120), url: it.html_url });
  }
  void port;
  return out;
}

const summarize = (md, n = 280) => String(md || '').replace(/\r/g, '').replace(/^#+\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n{2,}/g, '\n').trim().slice(0, n);

// Check every port. Returns [{ id, title, installed, latest, status, hold, notes, asset, release }].
async function checkAll(doc, { gh, now = Date.now(), fileVersion, skipIssues = false } = {}) {
  const s = { ...DEFAULTS, ...(doc.settings || {}) };
  const out = [];
  for (const port of doc.ports || []) {
    const r = { id: port.id, title: port.title, repo: port.repo, mode: port.mode || 'notify', installDir: port.installDir };
    try {
      const rels = await gh.releases(port.repo);
      const rel = pickRelease(rels, port);
      const inst = detectInstalled(port, { releases: rels, fileVersion });
      r.installed = inst.version; r.detectedBy = inst.how; r.estimate = !!inst.estimate;
      if (!rel) { r.status = 'error'; r.error = 'no matching release'; out.push(r); continue; }
      const latest = versionOfTag(rel.tag_name, port.tagPattern);
      const asset = assetOf(rel, port);
      Object.assign(r, { latest, tag: rel.tag_name, published: rel.published_at, url: rel.html_url, notes: summarize(rel.body), asset: asset && { name: asset.name, size: asset.size, url: asset.browser_download_url, digest: asset.digest || null, sidecar: sideOf(rel, asset) } });
      if (inst.how === 'missing') { r.status = 'missing'; out.push(r); continue; }
      if (!inst.version) { r.status = 'unknown'; out.push(r); continue; }
      if (cmpVersion(inst.version, latest) >= 0) { r.status = 'current'; out.push(r); continue; }
      let issues = [];
      if (!skipIssues) { try { issues = await gh.issuesSince(port.repo, rel.published_at); } catch (e) { r.issueError = e.message; } }
      r.hold = holdReasons(rel, { issues, now, waitDays: port.waitDays ?? s.waitDays, keywords: s.keywords, version: latest, port });
      r.status = r.hold.length ? 'hold' : 'update';
    } catch (e) { r.status = 'error'; r.error = e.message; }
    out.push(r);
  }
  return out;
}

// ---------- files ----------
// protect: glob-ish patterns relative to the install folder ("user/**", "*.ini", "settings.json").
function globRe(p) {
  const s = p.replace(/\\/g, '/').replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
  return new RegExp(`^${s}$`, 'i');
}
const protectedBy = (patterns) => { const res = (patterns || []).map(globRe); return (rel) => { const r = rel.replace(/\\/g, '/'); return res.some((re) => re.test(r) || re.test(r + '/')); }; };

function walk(dir, rel = '', out = []) {
  let ents = []; try { ents = fs.readdirSync(P.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const r = rel ? P.join(rel, e.name) : e.name; if (e.isDirectory()) walk(dir, r, out); else if (e.isFile()) out.push(r); }
  return out;
}
function copyFile(src, dst) { fs.mkdirSync(P.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); try { const st = fs.statSync(src); fs.utimesSync(dst, st.atime, st.mtime); } catch { /* */ } }
function sha256File(f) { const h = crypto.createHash('sha256'); const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(1 << 20); let n; try { while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest('hex'); }

// Full backup of the install folder (protected files included). copyTree: a faster copier (robocopy)
// may be passed; it must copy everything. Returns the backup folder.
function backup(port, { backupsDir, stamp, version, copyTree = null }) {
  const dst = P.join(backupsDir, port.id, `${stamp}-${String(version || 'bilinmiyor').replace(/[^0-9A-Za-z.-]/g, '_')}`);
  fs.mkdirSync(dst, { recursive: true });
  const files = walk(port.installDir);
  if (copyTree) copyTree(port.installDir, P.join(dst, 'files'));
  else for (const f of files) copyFile(P.join(port.installDir, f), P.join(dst, 'files', f));
  // check: every file there with the same size
  for (const f of files) { const a = fs.statSync(P.join(port.installDir, f)).size, b = exists(P.join(dst, 'files', f)) ? fs.statSync(P.join(dst, 'files', f)).size : -1; if (a !== b) throw new Error(`yedek eksik: ${f}`); }
  writeJson(P.join(dst, 'backup.json'), { id: port.id, version: version || null, at: new Date().toISOString(), from: port.installDir, files: files.length, added: [] });
  return dst;
}
function listBackups(backupsDir, id) {
  const d = P.join(backupsDir, id);
  let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return []; }
  return ents.map((e) => ({ dir: P.join(d, e.name), name: e.name, meta: readJson(P.join(d, e.name, 'backup.json'), null) })).filter((b) => b.meta).sort((a, b) => b.name.localeCompare(a.name));
}
// Put a backup back: files the update added (not in the backup) go, every backed-up file returns.
function restore(port, bdir, { log = () => {} } = {}) {
  const meta = readJson(P.join(bdir, 'backup.json'), {});
  const files = new Set(walk(P.join(bdir, 'files')).map((f) => f.toLowerCase()));
  for (const a of meta.added || []) if (!files.has(a.toLowerCase())) { try { fs.unlinkSync(P.join(port.installDir, a)); } catch { /* */ } }
  for (const f of walk(P.join(bdir, 'files'))) copyFile(P.join(bdir, 'files', f), P.join(port.installDir, f));
  log('restored', port.id, bdir);
  return meta;
}
// Old backups beyond keep: listed in the log first, then removed.
function pruneBackups(backupsDir, id, keep, log = () => {}) {
  const all = listBackups(backupsDir, id); const gone = all.slice(keep);
  if (gone.length) log('backups to remove', id, gone.map((b) => b.name));
  for (const b of gone) fs.rmSync(b.dir, { recursive: true, force: true });
  return gone.map((b) => b.name);
}

// The release zip's top folder, when everything sits in one folder (port.zipRoot can name it).
function zipRootOf(stage, port) {
  if (port.zipRoot) return P.join(stage, port.zipRoot);
  const top = fs.readdirSync(stage, { withFileTypes: true });
  if (top.length === 1 && top[0].isDirectory()) return P.join(stage, top[0].name);
  return stage;
}

// The update. steps: running() -> true stops before anything; download(url, file, asset) puts the
// asset on disk. Every step is logged; any failure after the backup puts the backup back.
async function install(port, result, { workDir, backupsDir, running = () => false, download, fetchFn = globalThis.fetch, copyTree = null, log = () => {}, now = () => new Date(), keepBackups = 2, verifyExtra = null }) {
  const steps = []; const step = (s, x) => { steps.push([s, x == null ? '' : String(x)]); log('update', port.id, s, x == null ? '' : x); };
  if (!result || !result.asset) throw new Error('indirilecek dosya yok');
  if (await running()) { step('blocked', 'game running'); return { ok: false, blocked: 'running', steps }; }
  if (!exists(port.installDir)) throw new Error('kurulum klasörü yok');
  const stamp = now().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const tmp = P.join(workDir, `${port.id}-${stamp}`); fs.mkdirSync(tmp, { recursive: true });
  const zip = P.join(tmp, result.asset.name);
  // 1. download and check before touching the game
  await (download || ((u, f) => downloadTo(u, f, { fetchFn })))(result.asset.url, zip, result.asset);
  const size = fs.statSync(zip).size;
  if (result.asset.size && size !== result.asset.size) throw new Error(`boyut tutmuyor: ${size} / ${result.asset.size}`);
  step('downloaded', size);
  const sha = sha256File(zip);
  let want = result.asset.digest && /^sha256:/i.test(result.asset.digest) ? result.asset.digest.slice(7).toLowerCase() : (result.asset.sha256 || null);
  if (!want && result.asset.sidecar) want = await sidecarSha(result.asset, { fetchFn });
  if (want && want !== sha) throw new Error(`sha256 tutmuyor: ${sha}`);
  step(want ? 'sha256 ok' : 'sha256 (GitHub vermedi, boyut kontrol edildi)', sha);
  const stage = P.join(tmp, 'stage'); unzip.extract(zip, stage); const root = zipRootOf(stage, port);
  const newFiles = walk(root);
  const exes = [].concat(port.exeCheck || []);
  for (const e of exes) if (!newFiles.some((f) => f.replace(/\\/g, '/').toLowerCase() === e.toLowerCase())) throw new Error(`paket beklenen dosyayı içermiyor: ${e}`);
  step('extracted', newFiles.length);
  if (await running()) { step('blocked', 'game started during download'); fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, blocked: 'running', steps }; }
  // 2. full backup
  const bdir = backup(port, { backupsDir, stamp, version: result.installed, copyTree });
  step('backup', bdir);
  const prot = protectedBy(port.protect);
  const before = new Set(walk(port.installDir).map((f) => f.toLowerCase()));
  const added = [];
  try {
    // 3. new files over the old ones; protected files that exist stay as they are
    for (const f of newFiles) {
      const dst = P.join(port.installDir, f);
      if (prot(f) && exists(dst)) continue;
      copyFile(P.join(root, f), dst);
      if (!before.has(f.toLowerCase())) added.push(f);
    }
    const meta = readJson(P.join(bdir, 'backup.json'), {}); meta.added = added; writeJson(P.join(bdir, 'backup.json'), meta);
    // 4. protected files back from the backup, exactly as they were
    for (const f of walk(P.join(bdir, 'files'))) if (prot(f)) copyFile(P.join(bdir, 'files', f), P.join(port.installDir, f));
    step('installed', `${newFiles.length} files, ${added.length} new`);
    // 5. verify
    for (const e of exes) if (!exists(P.join(port.installDir, e))) throw new Error(`kurulumdan sonra yok: ${e}`);
    if (verifyExtra) await verifyExtra(port);
    writeJson(P.join(port.installDir, MARKER), { id: port.id, version: result.latest, tag: result.tag, at: now().toISOString(), from: result.asset.url, sha256: sha, backup: bdir });
    step('verified');
  } catch (e) {
    step('failed', e.message);
    restore(port, bdir, { log });
    step('rolled back', bdir);
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: false, error: e.message, rolledBack: true, backup: bdir, steps };
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const pruned = pruneBackups(backupsDir, port.id, keepBackups, log);
  if (pruned.length) step('old backups removed', pruned.join(', '));
  return { ok: true, version: result.latest, backup: bdir, steps };
}
async function rollback(port, { backupsDir, running = () => false, log = () => {} }) {
  if (await running()) return { ok: false, blocked: 'running' };
  const b = listBackups(backupsDir, port.id)[0];
  if (!b) return { ok: false, error: 'no backup' };
  restore(port, b.dir, { log });
  // the marker of the version we just removed must go (the backup's own copy, if any, came back)
  if (!exists(P.join(b.dir, 'files', MARKER))) { try { fs.unlinkSync(P.join(port.installDir, MARKER)); } catch { /* */ } }
  return { ok: true, version: b.meta.version, backup: b.dir };
}

// ---------- new ports feed (RSS) ----------
function parseRss(xml, { category } = {}) {
  const items = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1]; const tag = (n) => { const r = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(x); return r ? r[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : ''; };
    const cats = [...x.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((c) => c[1].trim());
    if (category && !cats.includes(category)) continue;
    const dec = (s) => s.replace(/&#43;/g, '+').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    items.push({ title: dec(tag('title')), link: dec(tag('link')), date: new Date(dec(tag('pubDate'))).toISOString() });
  }
  return items;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|of|a|pc|port|recomp|recompilation|decompilation|native|remastered)\b/g, ' ').replace(/\s+/g, ' ').trim();
function markInstalled(items, names) {
  const ns = names.map(norm).filter(Boolean);
  return items.map((it) => { const t = norm(it.title); return { ...it, installed: ns.some((n) => t.includes(n) || n.includes(t)) }; });
}

// Download with fetch (follows GitHub's redirect to its CDN) into file.part, then rename.
async function downloadTo(url, file, { fetchFn = globalThis.fetch, onProgress = null } = {}) {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'DefinitelyNotAConsole-updates', Accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`indirme ${r.status}`);
  const part = `${file}.part`; const fd = fs.openSync(part, 'w'); let got = 0;
  const total = Number((r.headers.get && r.headers.get('content-length')) || 0);
  try {
    if (r.body && r.body.getReader) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; fs.writeSync(fd, Buffer.from(value)); got += value.length; if (onProgress) onProgress(got, total); } }
    else { const b = Buffer.from(await r.arrayBuffer()); fs.writeSync(fd, b); got = b.length; }
  } finally { fs.closeSync(fd); }
  fs.renameSync(part, file); return got;
}
// A release's sha256 for an asset when GitHub's digest is missing: <asset>.sha256 or SHA256SUMS*.
async function sidecarSha(asset, { fetchFn = globalThis.fetch } = {}) {
  if (!asset.sidecar) return null;
  try { const r = await fetchFn(asset.sidecar, { headers: { 'User-Agent': 'DefinitelyNotAConsole-updates' }, redirect: 'follow' }); if (!r.ok) return null; const t = await r.text();
    for (const line of t.split(/\r?\n/)) { const m = /^([0-9a-f]{64})\s+\*?(.+)?$/i.exec(line.trim()); if (m && (!m[2] || m[2].trim() === asset.name)) return m[1].toLowerCase(); } } catch { /* */ }
  return null;
}

// ---------- known ports ----------
// What we know about the ports Kutay uses. seedFromGames() turns games.json entries whose exe
// matches into ports.json entries (install folder = the exe's folder). More can be added from the
// menu or by editing ports.json.
const KNOWN = [
  { id: 'infamous-second-son', title: 'inFAMOUS Second Son (shadPS4 build)', repo: 'axylpup/shadPS4', tagPattern: '^second-son-v(\\d[\\w.-]*)$', assetPattern: '^inFAMOUS-SecondSon-shadPS4-.*-win64\\.zip$',
    match: { exe: 'shadps4.exe', pathHas: 'infamous' }, exeCheck: ['shadPS4.exe'],
    detect: [{ type: 'text', file: 'README.md', regex: 'build v(\\d+(?:\\.\\d+)+)' }],
    protect: ['user/**', 'keys.json', 'shadps4-flags*.txt', '*.bak*', '*.orig', '*-test'] },
  { id: 'sotc-pc', title: 'Shadow of the Colossus PC', repo: 'AjncSystem/ShadowOfTheColossus-PC', tagPattern: '^v(\\d[\\w.-]*)$', assetPattern: '^SotC-PC\\.zip$',
    match: { exe: 'sotc.exe' }, exeCheck: ['SotC.exe'],
    detect: [{ type: 'text', file: 'CHANGELOG.md', regex: '^##\\s*(\\d+(?:\\.\\d+)+)' }],
    protect: ['user/**', 'out/**', 'out_modecheck/**', 'sotc.ini', '*.bak*'] },
  { id: 'gow3-spartanport', title: 'God of War III (SpartanPort)', repo: 'FelipePrado0/SpartanPort', tagPattern: '^windows-v(\\d+(?:\\.\\d+)+)$', assetPattern: '^(spartanport|gow3)-windows\\.zip$',
    match: { exe: ['play god of war iii.exe', 'spartanport.exe', 'play spartanport.exe', 'god of war iii.exe'] }, exeCheck: ['SpartanPort.exe'],
    detect: [{ type: 'mtime', file: 'SpartanPort.exe' }, { type: 'mtime', file: 'God of War III.exe' }],
    protect: ['user/**', 'out/**', '*.ini', 'settings.json', '*.bak*'],
    note: 'SpartanPort has its own "Check for updates"; use one or the other.' },
  { id: 'naruto-rise', title: 'Naruto: Rise of a Ninja (recomp)', repo: 'jorjbarbosa/naruto-rise-recomp', tagPattern: '^v(\\d[\\w.-]*)$', assetPattern: '^naruto-rise-recomp-win-amd64\\.zip$',
    match: { exe: ['narutorise.exe', 'narutorise_launcher.exe'] }, exeCheck: ['narutorise.exe'],
    detect: [{ type: 'file', file: 'narutorise.version' }],
    protect: ['game/**', 'narutorise.toml', 'logs/**', 'shader_cache/**', 'unins000.*'] },
];
function seedFromGames(games, existing = []) {
  const have = new Set(existing.map((p) => p.id)); const out = [];
  for (const k of KNOWN) {
    if (have.has(k.id)) continue;
    const exes = [].concat(k.match.exe);
    const g = (games || []).find((x) => x && x.exe && exes.includes(path.win32.basename(String(x.exe)).toLowerCase()) && (!k.match.pathHas || `${x.exe} ${x.args || ''} ${x.title || ''}`.toLowerCase().includes(k.match.pathHas)));
    if (!g) continue;
    const { match, ...rest } = k; void match;
    out.push({ ...rest, gameId: g.id, installDir: (/\\/.test(String(g.exe)) ? path.win32 : path).dirname(String(g.exe)), mode: 'notify' });
  }
  return out;
}

module.exports = { KNOWN, seedFromGames, downloadTo, sidecarSha, DEFAULTS, MARKER, versionOfTag, cmpVersion, detectInstalled, GitHub, pickRelease, assetOf, holdReasons, summarize, checkAll, protectedBy, globRe, walk, backup, listBackups, restore, pruneBackups, install, rollback, parseRss, markInstalled, sha256File, readJson, writeJson };
