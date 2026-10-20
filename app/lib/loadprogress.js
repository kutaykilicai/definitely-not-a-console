// Progress of a game's own loading before its first picture (for example a shader cache that is
// rebuilt at start), shown on the menu's launch screen. Some games or ports print it nowhere
// visible while their window is still blank; the menu reads it from what they do leave behind:
//
//   games.json, per game:  "loadProgress": "sotc-port"                     (a preset below)
//                     or:  "loadProgress": { "log": "...", "ready": "...", ... }   (own source)
//                     or:  "loadProgress": false                           (off, also for presets
//                                                                            found on their own)
// Fields of a source (paths are relative to the game's working folder, or absolute):
//   log      text file the game writes while it starts (read from the start of this launch only)
//   ready    regex: the line that says loading is over (the menu then hands over to the game)
//   percent  regex with one group: a percentage the game prints (0-100), used as is
//   counter  regex with two groups: "done / total" the game prints
//   count    { dir, ext }: number of cached items (files with that extension in the newest
//            sub folder of dir), for an estimate from earlier launches when the game prints no
//            numbers; msPerItem is the first guess before anything was measured
//   label    'shaders' (Shader'lar hazırlanıyor) | 'loading' (Yükleniyor)
//   stallMs  loading should be over (the estimate ran out, or the game's own numbers stopped) and
//            for this long since then the log has not grown: the menu stops waiting and shows
//            the game (default 20 s)
//   maxMs    the menu never waits longer than this for the ready line (default 3 minutes, less
//            when the expected time is known: twice that plus 30 s, at least a minute)
//   graceMs  when set: no ready line yet this long after the estimate ran out, the game is shown
//   settleMs after the ready line, time for the game's first picture (default 800 ms)
// log, count.dir: one path or a list of candidates (the first one written by this launch is
// used); %NAME% is replaced with that environment variable (%APPDATA%).
// No numbers at all: an indeterminate bar. No log after 25 s: the source is dropped and the
// normal launch goes on. The menu also stops waiting when the game's window stops responding.
const fs = require('fs'); const path = require('path');

const PRESETS = {
  // Shadow of the Colossus PC port (AjncSystem/ShadowOfTheColossus-PC, shadPS4 based). Its own
  // "Loading shaders… %" bar cannot show at start: the pipeline cache is rebuilt inside the
  // presenter's construction, before anything is drawn. The launcher (--play) writes the port's
  // output to user/last_run.log as it comes; the "presenter ready" line follows the rebuild.
  'sotc-port': {
    log: 'user/last_run.log',
    ready: 'GPU: window and Vulkan presenter ready',
    fail: '^\\[exit code ',
    count: { dir: 'user/cache', ext: '.key' },
    msPerItem: 28,
    label: 'shaders',
  },
  // shadPS4 builds for inFAMOUS Second Son / First Light (and other shadPS4 games when chosen in
  // games.json). shadPS4 rebuilds its pipeline cache at start (PipelineCache::WarmUp) and logs to
  // user/log/shad_log.txt next to the exe (portable, written anew each start) or
  // %APPDATA%/shadPS4/log. Mainline and the inFAMOUS builds print
  // "Preloaded N pipelines" (or the stale/incompatible cache warnings) when it is over; a build
  // that prints a percentage or "done / total" for shaders or pipelines is followed as well. The
  // cache folder holds one .key file per pipeline.
  'shadps4': {
    log: ['user/log/shad_log.txt', '%APPDATA%/shadPS4/log/shad_log.txt'],
    ready: "Preloaded \\d+ pipelines|stale pipelines were found|Pipeline cache isn't compatible|Ignoring the cache",
    percent: '(?:shader|pipeline|cache)[^\\n%]*?(\\d{1,3})(?:[.,]\\d+)?\\s*%',
    counter: '(?:shader|pipeline)s?[^\\n]*?\\b(\\d+)\\s*/\\s*(\\d+)\\b',
    fail: 'Emulator closed|Exiting the emulator',
    count: { dir: ['user/cache', '%APPDATA%/shadPS4/cache'], ext: '.key' },
    // Measured on the inFAMOUS build (branch second-son, v0.17.0-747): the warm-up builds the
    // pipelines on 8 threads, 5192 of 5831 cached in 7.7 s, then logs "WarmUp: Preloaded 5192
    // pipelines". No percentage in the log (the build draws its own in its window).
    msPerItem: 2.5,
    // Its log keeps growing once the game runs, and builds differ in what they print: when no
    // ready line came, the game is shown 5 s after the estimate ran out, and after 90 s at most.
    graceMs: 5000,
    maxMs: 90e3,
    label: 'shaders',
  },
};

// The preset found from the game itself, when games.json says nothing.
function detect(game) {
  const exe = game && game.exe ? path.basename(String(game.exe).replace(/\\/g, '/')) : '';
  const args = String(game.args || '');
  if (/^sotc\.exe$/i.test(exe) && /(^|\s)--play(\s|$)/.test(args)) return 'sotc-port';
  // shadPS4 starting inFAMOUS Second Son (CUSA00004 and its other regions) or First Light.
  const infamous = /CUSA0000[49]|CUSA00223|CUSA01200|CUSA00812|CUSA0141[0-9]|CUSA00956|infamous/i;
  if (/^shadps4\.exe$/i.test(exe) && (infamous.test(args) || infamous.test(String(game.workingDir || '')) || /infamous/i.test(String(game.exe)) || /infamous/i.test(String(game.title || '')))) return 'shadps4';
  return null;
}
const envPath = (p) => String(p).replace(/%([A-Za-z0-9_]+)%/g, (m, k) => process.env[k] || process.env[k.toUpperCase()] || m);

function resolve(game) {
  if (!game) return null;
  let src = game.loadProgress;
  if (src === false || src === 'off' || src === 'none') return null;
  if (src == null || src === '' || src === 'auto') src = detect(game);
  if (!src) return null;
  const base = typeof src === 'string' ? PRESETS[src] : src;
  if (!base || typeof base !== 'object' || !base.log) return null;
  const dir = game.workingDir || (game.exe ? path.dirname(String(game.exe)) : process.cwd());
  const abs1 = (p) => { if (!p) return null; const e = envPath(p); return path.isAbsolute(e) || /^[A-Za-z]:[\\/]/.test(e) ? e : path.join(dir, e); };
  const abs = (p) => (Array.isArray(p) ? p.map(abs1).filter(Boolean) : abs1(p));
  const re = (s, flags = 'm') => { if (!s) return null; try { return new RegExp(s, flags); } catch { return null; } };
  return {
    preset: typeof src === 'string' ? src : null,
    logs: [].concat(abs(base.log)),
    log: [].concat(abs(base.log))[0],
    ready: re(base.ready),
    fail: re(base.fail),
    percent: re(base.percent, 'gmi'),
    counter: re(base.counter, 'gmi'),
    count: base.count && base.count.dir ? { dir: abs(base.count.dir), ext: String(base.count.ext || '') } : null,
    msPerItem: Number(base.msPerItem) > 0 ? Number(base.msPerItem) : 0,
    label: base.label === 'loading' ? 'loading' : 'shaders',
    maxMs: Number(base.maxMs) > 0 ? Number(base.maxMs) : 180e3,
    fixedMax: Number(base.maxMs) > 0,
    stallMs: Number(base.stallMs) > 0 ? Number(base.stallMs) : 20e3,
    graceMs: Number(base.graceMs) > 0 ? Number(base.graceMs) : 0,
    settleMs: Number(base.settleMs) >= 0 && base.settleMs != null ? Number(base.settleMs) : 800,
    noLogMs: Number(base.noLogMs) > 0 ? Number(base.noLogMs) : 25e3,
  };
}

// Items in the newest sub folder of dir (or in dir itself when it has none) with that extension.
function countItems(c, fsx = fs) {
  if (!c || !c.dir) return 0;
  if (Array.isArray(c.dir)) { for (const d of c.dir) { const n = countItems({ ...c, dir: d }, fsx); if (n) return n; } return 0; }
  const count = (d) => { try { return fsx.readdirSync(d).filter((n) => !c.ext || n.toLowerCase().endsWith(c.ext.toLowerCase())).length; } catch { return 0; } };
  let subs = [];
  try { subs = fsx.readdirSync(c.dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(c.dir, e.name)); } catch { return 0; }
  if (!subs.length) return count(c.dir);
  let best = null; let bestT = -1;
  for (const s of subs) { let t = 0; try { t = fsx.statSync(s).mtimeMs; } catch { /* */ } if (t > bestT) { bestT = t; best = s; } }
  return count(best);
}

// Expected time to the ready line: learned per item (or in total) from earlier launches, else the
// source's first guess. null: nothing to go on (indeterminate).
function expectedMs(cfg, items, learned) {
  if (cfg.count && !items) return null;   // nothing cached: nothing to rebuild, no guess
  if (learned && learned.msPerItem > 0 && items > 0) return learned.msPerItem * items;
  if (learned && learned.ms > 0) return learned.ms;
  if (cfg.msPerItem > 0 && items > 0) return cfg.msPerItem * items;
  return null;
}

// An estimate never claims to be done: up to 97 % on time, then slowly towards 99 %.
function estimatePct(elapsed, expected) {
  if (!(expected > 0)) return null;
  const f = elapsed / expected;
  if (f <= 1) return Math.max(0, 97 * f);
  return 97 + 2 * (1 - Math.exp(-(elapsed - expected) / 15000));
}

// What was learned after a launch: averaged with earlier launches (newer counts more).
function learn(prev, ms, items) {
  if (!(ms > 0)) return prev || null;
  const per = items > 0 ? ms / items : 0;
  const mix = (a, b) => (a > 0 ? Math.round((a + b * 2) / 3 * 100) / 100 : b);
  return { ms: Math.round(mix(prev && prev.ms, ms)), msPerItem: per ? mix(prev && prev.msPerItem, per) : (prev && prev.msPerItem) || 0, items, at: Date.now() };
}

// Follows one launch. poll() returns { state, pct, done, total, estimate, label }:
// state 'nolog' (no log of this launch yet) | 'run' | 'ready' | 'failed' | 'timeout' | 'gone'.
class Watcher {
  constructor(cfg, { t0 = Date.now(), learned = null, fsx = fs, now = Date.now } = {}) {
    this.cfg = cfg; this.t0 = t0; this.learned = learned; this.fs = fsx; this.now = now;
    this.offset = 0; this.buf = ''; this.lines = 0; this.state = 'nolog'; this.readyAt = 0;
    this.pct = null; this.done = 0; this.total = 0; this.real = false; this.grewAt = 0; this.realAt = 0;
    this.items = countItems(cfg.count, fsx);
    this.expected = expectedMs(cfg, this.items, learned);
    // The limit: the source's own, else twice the expected time plus 30 s (at least a minute).
    this.maxMs = cfg.fixedMax || !this.expected ? cfg.maxMs : Math.min(cfg.maxMs, Math.max(60e3, this.expected * 2 + 30e3));
    this.logPath = null;
  }
  _pick() {
    // The first candidate written by this launch.
    const list = this.cfg.logs && this.cfg.logs[0] === this.cfg.log ? this.cfg.logs : [this.cfg.log];
    for (const p of list) { try { if (this.fs.statSync(p).mtimeMs >= this.t0 - 1000) return p; } catch { /* */ } }
    return null;
  }
  _read() {
    if (!this.logPath) this.logPath = this._pick();
    if (!this.logPath) return null;
    let st; try { st = this.fs.statSync(this.logPath); } catch { return null; }
    // Only this launch's log: written after the launch (the previous one is older), and from its
    // start again when it was replaced (smaller than what was read).
    if (st.mtimeMs < this.t0 - 1000) return null;
    if (st.size < this.offset) { this.offset = 0; this.buf = ''; }
    if (st.size === this.offset) return '';
    const fd = this.fs.openSync(this.logPath, 'r');
    try {
      const len = Math.min(st.size - this.offset, 4 << 20);
      const b = Buffer.alloc(len); const n = this.fs.readSync(fd, b, 0, len, this.offset);
      this.offset += n; return b.slice(0, n).toString('utf8');
    } finally { this.fs.closeSync(fd); }
  }
  poll() {
    if (this.finished()) return this.view();
    const t = this.now(); const elapsed = t - this.t0;
    const chunk = this._read();
    if (chunk != null && this.state === 'nolog') { this.state = 'run'; this.grewAt = t; }
    if (chunk) {
      this.grewAt = t;
      this.buf += chunk;
      const cut = this.buf.lastIndexOf('\n');
      const text = cut >= 0 ? this.buf.slice(0, cut + 1) : '';
      this.buf = cut >= 0 ? this.buf.slice(cut + 1) : this.buf;
      if (text) this._scan(text);
    }
    if (this.state === 'run' && !this.real) this.pct = estimatePct(elapsed, this.expected);
    if (this.state === 'nolog' && elapsed > this.cfg.noLogMs) this.state = 'gone';
    if (this.state === 'run') {
      // Should be over by now (the estimate is at 97 %, or the game's numbers stopped moving) and the
      // log has not grown for stallMs: something is wrong; the menu stops waiting.
      // (counted from when it should have been over: a run a little slower than the estimate is fine)
      const from = this.real ? this.realAt : this.expected ? this.t0 + this.expected : Infinity;
      if (t - Math.max(this.grewAt, from) >= this.cfg.stallMs) this.state = 'stalled';
      else if (!this.real && this.cfg.graceMs && this.expected && elapsed >= this.expected + this.cfg.graceMs) this.state = 'due';
      else if (elapsed > this.maxMs) this.state = 'timeout';
    }
    return this.view();
  }
  _scan(text) {
    const c = this.cfg;
    if (c.percent) { let m; c.percent.lastIndex = 0; while ((m = c.percent.exec(text))) { const p = Number(m[1]); if (p >= 0 && p <= 100) { if (p !== this.pct || !this.real) this.realAt = this.now(); this.pct = p; this.real = true; } } }
    if (c.counter) { let m; c.counter.lastIndex = 0; while ((m = c.counter.exec(text))) { const d = Number(m[1]), n = Number(m[2]); if (n > 0 && d >= 0) { if (Math.min(d, n) !== this.done || n !== this.total || !this.real) this.realAt = this.now(); this.done = Math.min(d, n); this.total = n; this.pct = (this.done / n) * 100; this.real = true; } } }
    if (c.ready && c.ready.test(text)) { this.state = 'ready'; this.readyAt = this.now(); this.pct = 100; return; }
    if (this.real && this.pct >= 100 && !c.ready) { this.state = 'ready'; this.readyAt = this.now(); return; }
    if (c.fail && c.fail.test(text)) { this.state = 'failed'; }
  }
  view() {
    // Never backwards on screen (an estimate shown before the game's first number may be ahead).
    if (this.pct != null) this.shown = Math.max(this.shown || 0, Math.round(this.pct));
    return { state: this.state, pct: this.pct == null ? null : this.shown, estimate: !this.real, done: this.done, total: this.total, items: this.items, label: this.cfg.label };
  }
  // For learn(): time from the launch to the ready line, when it came.
  measured() { return this.state === 'ready' && this.readyAt ? this.readyAt - this.t0 : 0; }
  finished() { return this.state !== 'nolog' && this.state !== 'run'; }
  // The menu saw the game's window stop responding, or the game end.
  abort(state) { if (!this.finished()) this.state = state; }
}

module.exports = { PRESETS, detect, resolve, countItems, expectedMs, estimatePct, learn, Watcher };
