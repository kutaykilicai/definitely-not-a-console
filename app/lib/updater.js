'use strict';
// The menu's side of the port updater: ports.json + cache files, the daily background check
// (never while a game runs), the 'Yeni portlar' feed, and the Güncelle / Geri al actions.
const fs = require('fs');
const path = require('path');
const PT = require('./ports');
const { exeNamesIn, runningNames } = require('./proc');

class Updater {
  // dataDir: the menu's data folder. games(): games.json entries. busy(): a game is running.
  constructor({ dataDir, games, busy, api = 'https://api.github.com', feedUrl = PT.DEFAULTS.feed.url, fetchFn = globalThis.fetch, now = () => Date.now(), log = () => {}, onChange = () => {}, copyTree = null, names = runningNames, net = true }) {
    Object.assign(this, { dataDir, games, busy, api, feedUrl, fetchFn, now, log, onChange, copyTree, names, net });
    this.file = path.join(dataDir, 'ports.json');
    this.stateFile = path.join(dataDir, 'cache', 'ports-state.json');
    this.backups = path.join(dataDir, 'port-backups');
    this.work = path.join(dataDir, 'cache', 'port-dl');
    this.logFile = path.join(dataDir, 'logs', 'updates.log');
    this.state = PT.readJson(this.stateFile, { cache: {}, results: [], lastCheck: 0, feed: { items: [], at: 0, etag: null }, installs: [] });
    this.job = null; this.timer = null;
  }
  logLine(...a) { const line = `${new Date(this.now()).toISOString()} ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`; this.log(line); try { fs.mkdirSync(path.dirname(this.logFile), { recursive: true }); fs.appendFileSync(this.logFile, line + '\n'); } catch { /* */ } }
  save() { try { PT.writeJson(this.stateFile, this.state); } catch { /* */ } }
  // ports.json; created from games.json the first time (known ports only, mode 'notify')
  async doc() {
    let d = PT.readJson(this.file, null);
    if (!d || !Array.isArray(d.ports)) {
      const seed = PT.seedFromGames(await this.games(), []);
      d = { version: 1, settings: { waitDays: PT.DEFAULTS.waitDays, keepBackups: PT.DEFAULTS.keepBackups, checkHours: PT.DEFAULTS.checkHours, feed: true }, ports: seed };
      PT.writeJson(this.file, d); this.logLine('ports.json created', seed.map((p) => p.id));
    }
    return d;
  }
  async setPort(id, patch) {
    const d = await this.doc(); const p = d.ports.find((x) => x.id === id); if (!p) return null;
    for (const k of ['mode', 'waitDays', 'installDir', 'disabled']) if (k in patch) p[k] = patch[k];
    PT.writeJson(this.file, d); this.onChange(); return p;
  }
  async addPort(p) {
    const d = await this.doc();
    const known = PT.KNOWN.find((k) => k.repo.toLowerCase() === String(p.repo || '').toLowerCase());
    const id = (p.id || (known && known.id) || String(p.repo).split('/').pop()).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (d.ports.some((x) => x.id === id)) return { ok: false, error: 'exists' };
    const { match, ...k } = known || {}; void match;
    d.ports.push({ ...k, id, title: p.title || (known && known.title) || id, repo: p.repo, tagPattern: p.tagPattern || (known && known.tagPattern) || null, assetPattern: p.assetPattern || (known && known.assetPattern) || '\\.zip$', installDir: p.installDir, protect: p.protect || (known && known.protect) || ['user/**', 'saves/**', '*.ini', '*.toml', '*.cfg', 'config*.json'], exeCheck: p.exeCheck || (known && known.exeCheck) || [], detect: (known && known.detect) || [{ type: 'file', file: 'version.txt' }], mode: 'notify' });
    PT.writeJson(this.file, d); this.onChange(); return { ok: true, id };
  }
  gh() { return new PT.GitHub({ fetchFn: this.fetchFn, cache: this.state.cache, api: this.api, now: this.now, log: this.log }); }
  // a port's game or emulator is open (menu-launched or not)
  async portRunning(port) {
    if (this.busy()) return true;
    const names = await this.names(); if (!names) return true; // cannot tell: treat as running
    for (const n of exeNamesIn(port.installDir, 1)) if (names.has(n)) return true;
    return false;
  }
  view() {
    const d = PT.readJson(this.file, { ports: [] });
    return { ports: d.ports || [], settings: d.settings || {}, results: this.state.results || [], lastCheck: this.state.lastCheck || 0, feed: this.state.feed || { items: [] }, job: this.job, backups: Object.fromEntries((d.ports || []).map((p) => [p.id, PT.listBackups(this.backups, p.id).map((b) => ({ name: b.name, version: b.meta.version, at: b.meta.at }))])), rate: this.state.cache && this.state.cache._rate };
  }
  async check({ force = false } = {}) {
    if (!this.net || this.job) return this.view();
    if (this.busy()) { this.logLine('check skipped: game running'); return this.view(); }
    const d = await this.doc(); const hours = (d.settings && d.settings.checkHours) || 24;
    if (!force && this.now() - (this.state.lastCheck || 0) < hours * 3600e3) return this.view();
    this.job = { kind: 'check' }; this.onChange();
    try {
      const results = await PT.checkAll({ ...d, ports: d.ports.filter((p) => !p.disabled) }, { gh: this.gh(), now: this.now() });
      this.state.results = results; this.state.lastCheck = this.now();
      this.logLine('check', results.map((r) => `${r.id}: ${r.installed || '?'} -> ${r.latest || '?'} ${r.status}${r.hold && r.hold.length ? ` (${r.hold.map((h) => h.kind === 'wait' ? `wait ${h.days}/${h.waitDays}d` : `issue #${h.number}`).join(', ')})` : ''}`));
      if (d.settings && d.settings.feed !== false) await this.feed(force).catch((e) => this.logLine('feed error', e.message));
    } catch (e) { this.logLine('check error', e.message); }
    this.job = null; this.save(); this.onChange();
    this.autoInstall().catch((e) => this.logLine('auto error', e.message));
    return this.view();
  }
  // 'Yeni portlar': the site's RSS (once a day; ETag so an unchanged feed costs nothing)
  async feed(force) {
    const f = this.state.feed || (this.state.feed = { items: [] });
    if (!force && this.now() - (f.at || 0) < 24 * 3600e3) return f;
    const h = { 'User-Agent': 'DefinitelyNotAConsole-updates (once a day)' }; if (f.etag) h['If-None-Match'] = f.etag;
    const r = await this.fetchFn(this.feedUrl, { headers: h });
    f.at = this.now();
    if (r.status === 304) return f;
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const items = PT.parseRss(await r.text(), { category: PT.DEFAULTS.feed.category });
    const d = await this.doc(); const names = [...d.ports.map((p) => p.title.replace(/\(.*?\)/g, '')), ...(await this.games()).map((g) => g.title)].filter(Boolean);
    f.items = PT.markInstalled(items, names).slice(0, 30); f.etag = (r.headers.get && r.headers.get('etag')) || null;
    return f;
  }
  result(id) { return (this.state.results || []).find((r) => r.id === id); }
  async update(id, { auto = false } = {}) {
    if (this.job) return { ok: false, error: 'busy' };
    const d = await this.doc(); const port = d.ports.find((p) => p.id === id); const res = this.result(id);
    if (!port || !res || !res.asset) return { ok: false, error: 'no update' };
    if (auto && res.status !== 'update') return { ok: false, error: res.status };
    const g = (await this.games()).find((x) => x.id === port.gameId);
    this.job = { kind: 'update', id }; this.onChange();
    let out;
    try {
      out = await PT.install(port, res, { workDir: this.work, backupsDir: this.backups, running: () => this.portRunning(port), fetchFn: this.fetchFn, copyTree: this.copyTree, keepBackups: (d.settings && d.settings.keepBackups) || 2, log: (...a) => this.logLine(...a), now: () => new Date(this.now()),
        verifyExtra: async () => { if (g && g.exe && !fs.existsSync(g.exe)) throw new Error(`oyunun başlatma dosyası yok: ${g.exe}`); } });
    } catch (e) { out = { ok: false, error: e.message }; this.logLine('update error', id, e.message); }
    this.job = null;
    if (out.ok) { res.installed = res.latest; res.status = 'current'; res.detectedBy = 'marker'; }
    (this.state.installs || (this.state.installs = [])).push({ id, at: this.now(), ok: !!out.ok, version: res.latest, auto, error: out.error || out.blocked || null });
    this.save(); this.onChange();
    return out;
  }
  async rollback(id) {
    if (this.job) return { ok: false, error: 'busy' };
    const d = await this.doc(); const port = d.ports.find((p) => p.id === id); if (!port) return { ok: false, error: 'no port' };
    this.job = { kind: 'rollback', id }; this.onChange();
    let out; try { out = await PT.rollback(port, { backupsDir: this.backups, running: () => this.portRunning(port), log: (...a) => this.logLine(...a) }); } catch (e) { out = { ok: false, error: e.message }; }
    this.job = null;
    const res = this.result(id);
    if (out.ok && res) { const v = PT.detectInstalled(port); res.installed = v.version || out.version; res.status = res.installed && res.latest && PT.cmpVersion(res.installed, res.latest) < 0 ? 'update' : 'current'; }
    this.logLine('rollback', id, out); this.save(); this.onChange();
    return out;
  }
  // per-game "otomatik": only releases past the wait rule with no suspicious issues, only while closed
  async autoInstall() {
    const d = await this.doc();
    for (const p of d.ports) {
      const r = this.result(p.id);
      if (p.mode !== 'auto' || !r || r.status !== 'update') continue;
      if (await this.portRunning(p)) { this.logLine('auto: waiting, game open', p.id); continue; }
      await this.update(p.id, { auto: true });
    }
  }
  // daily background check: first one shortly after start, then every hour asks "is it time?"
  start(delayMs = 45e3) {
    if (!this.net) return;
    const tick = () => this.check().catch(() => {});
    this.timer = setTimeout(function again() { tick(); this.timer = setTimeout(again.bind(this), 3600e3); }.bind(this), delayMs);
  }
  stop() { clearTimeout(this.timer); }
}
module.exports = { Updater };
