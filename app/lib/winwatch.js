'use strict';
// Game window tracking for seamless launches: talks to bin/ps5winhelper.exe (Win32 queries) and
// holds the pure decision logic (which window is the game, when it has settled) so it can be tested.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';

// ---------- pure logic ----------
const MIN_W = 320, MIN_H = 200;

function candidates(snap, excludePids = []) {
  if (!snap || !Array.isArray(snap.windows)) return [];
  return snap.windows.filter((w) => w.visible && !w.cloaked && !w.tool && !w.owned && !w.minimized
    && w.w >= MIN_W && w.h >= MIN_H && !excludePids.includes(w.pid)
    && !/^(ConsoleWindowClass|CASCADIA_HOSTING_WINDOW_CLASS|tooltips_class32|#32770)$/.test(w.cls || ''));
}

// The game's main window: the foreground one if it belongs to the game, else the biggest.
function pickMain(snap, excludePids) {
  const c = candidates(snap, excludePids);
  if (!c.length) return null;
  const fg = c.find((w) => w.hwnd === snap.fg);
  if (fg) return fg;
  return c.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
}

// Borderless/exclusive fullscreen: the window covers its whole monitor (1 px slack for DWM bounds).
function coversMonitor(w) {
  if (!w || !w.mon) return false;
  const m = w.mon, s = 1;
  return w.x <= m.x + s && w.y <= m.y + s && w.x + w.w >= m.x + m.w - s && w.y + w.h >= m.y + m.h - s;
}

const sameRect = (a, b) => !!a && !!b && a.hwnd === b.hwnd && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

// How long a window must keep the same rect before we call it final.
//  - covering the monitor: stableMs (500 ms)
//  - smaller than the monitor: windowedMs, longer, because many games open windowed and only then
//    switch to fullscreen. If we learned the game ends up fullscreen, wait for that instead (up to
//    windowedFallbackMs, in case the user switched it to windowed).
function requiredStable(win, expect, o) {
  if (coversMonitor(win)) return o.stableMs;
  if (expect === 'window') return o.stableMs * 3;
  if (expect === 'fullscreen') return o.windowedFallbackMs;
  return o.windowedMs;
}

const DEFAULTS = { stableMs: 500, windowedMs: 4000, windowedFallbackMs: 15000, timeoutMs: 60000, pollMs: 100 };

// Step function: feed it a snapshot and the time, it tells you what to do. Keeps no timers itself.
class WindowWaiter {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.expect = opts.expect || null;
    this.excludePids = opts.excludePids || [];
    this.start = null; this.last = null; this.since = 0;
  }
  step(snap, now) {
    if (this.start === null) this.start = now;
    const w = pickMain(snap, this.excludePids);
    if (!w) { this.last = null; this.since = 0; }
    else if (!sameRect(w, this.last)) { this.last = w; this.since = now; }
    else this.last = w;
    if (w) {
      const need = requiredStable(w, this.expect, this.o);
      if (now - this.since >= need) return { status: 'ready', win: w, fullscreen: coversMonitor(w), waited: now - this.start };
    }
    if (now - this.start >= this.o.timeoutMs) return { status: 'timeout', win: w, fullscreen: coversMonitor(w), waited: now - this.start };
    return { status: 'wait', win: w };
  }
}

// Drive a WindowWaiter with an async snapshot function. Resolves with the final step result,
// or { status: 'cancelled' } when shouldStop() turns true (game exited, user went home...).
async function waitForGameWindow(snapFn, opts = {}, { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), shouldStop = () => false } = {}) {
  const w = new WindowWaiter(opts);
  for (;;) {
    if (shouldStop()) return { status: 'cancelled' };
    let snap = null; try { snap = await snapFn(); } catch { snap = null; }
    if (shouldStop()) return { status: 'cancelled' };
    const r = w.step(snap, now());
    if (r.status !== 'wait') return r;
    await sleep(w.o.pollMs);
  }
}

// ---------- helper process ----------
class WinHelper {
  constructor(exe) {
    this.exe = exe; this.proc = null; this.queue = []; this.buf = '';
  }
  get available() { return isWin && !!this.exe && fs.existsSync(this.exe); }
  _ensure() {
    if (this.closed) return false; // quitting: never start it again
    if (this.proc || !this.available) return !!this.proc;
    try {
      this.proc = spawn(this.exe, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch { this.proc = null; return false; }
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => {
      this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        const q = this.queue.shift(); if (!q) continue;
        clearTimeout(q.t);
        try { q.resolve(JSON.parse(line)); } catch { q.resolve(null); }
      }
    });
    const dead = () => { this.proc = null; this.buf = ''; for (const q of this.queue.splice(0)) { clearTimeout(q.t); q.resolve(null); } };
    this.proc.on('exit', dead); this.proc.on('error', dead);
    this.proc.stdin.on('error', () => {});
    return true;
  }
  request(line, timeoutMs = 3000) {
    if (!this._ensure()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const q = { resolve, t: setTimeout(() => { const i = this.queue.indexOf(q); if (i >= 0) this.queue.splice(i, 1); resolve(null); this._restart(); }, timeoutMs) };
      this.queue.push(q);
      try { this.proc.stdin.write(line.replace(/[\r\n]/g, ' ') + '\n'); } catch { resolve(null); }
    });
  }
  _restart() { try { this.proc && this.proc.kill(); } catch { /* */ } this.proc = null; }
  snap(rootPid, names = []) { return this.request(`snap ${rootPid || 0} ${names.map((n) => n.toLowerCase()).join('|')}`); }
  alive(hwnd) { return this.request(`alive ${hwnd}`); }
  foreground(hwnd) { return this.request(`fg ${hwnd}`); }
  below(hwnd, after) { return this.request(`below ${hwnd} ${after}`); }
  minimize(hwnd) { return this.request(`minimize ${hwnd}`); }
  keys(mods, vk) { return this.request(`keys ${mods || '-'} ${vk}`); }
  close() {
    this.closed = true;
    const p = this.proc; this.proc = null;
    if (p) { try { p.stdin.end('quit\n'); } catch { /* */ } try { p.kill(); } catch { /* */ } }
  }
}

function hwndOf(browserWindow) {
  const b = browserWindow.getNativeWindowHandle();
  return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0));
}

function helperPath(appDir) { return path.join(appDir, 'bin', 'ps5winhelper.exe'); }

module.exports = { candidates, pickMain, coversMonitor, requiredStable, WindowWaiter, waitForGameWindow, WinHelper, hwndOf, helperPath, DEFAULTS };
