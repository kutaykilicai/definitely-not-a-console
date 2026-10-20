'use strict';
// Starts a game and reports when it (and anything it spawned from its own folder) has exited.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const isWin = process.platform === 'win32';
const P = isWin ? path.win32 : path;

function splitArgs(s) {
  const out = []; let cur = ''; let q = false; let any = false;
  for (let i = 0; i < (s || '').length; i++) {
    const c = s[i];
    if (c === '"') { q = !q; any = true; continue; }
    if (!q && /\s/.test(c)) { if (any || cur) { out.push(cur); cur = ''; any = false; } continue; }
    cur += c; any = true;
  }
  if (any || cur) out.push(cur);
  return out;
}

function exeNamesIn(dir, depth = 2) {
  const names = new Set();
  // Never sweep a whole Desktop, user folder or drive root: only the game's own folder tree.
  if (dir && (/^[a-z]:\\?$/i.test(dir) || /[\\/](desktop|masaüstü|users|program files( \(x86\))?)[\\/]?$/i.test(dir) || /[\\/]users[\\/][^\\/]+[\\/]?$/i.test(dir))) depth = 0;
  const walk = (d, lvl) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isFile() && /\.exe$/i.test(e.name)) names.add(e.name.toLowerCase());
      else if (e.isDirectory() && lvl < depth && !/^(user|logs?|cache|shader|saves?|data)$/i.test(e.name)) walk(P.join(d, e.name), lvl + 1);
    }
  };
  if (dir) walk(dir, 0);
  return names;
}

function runningNames() {
  return new Promise((resolve) => {
    if (isWin) {
      execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10000, maxBuffer: 8 << 20 }, (err, out) => {
        if (err) return resolve(null);
        const set = new Set();
        for (const line of out.toString().split(/\r?\n/)) { const m = line.match(/^"([^"]+)"/); if (m) set.add(m[1].toLowerCase()); }
        resolve(set);
      });
    } else {
      execFile('ps', ['-eo', 'comm='], { timeout: 5000 }, (err, out) => {
        if (err) return resolve(null);
        resolve(new Set(out.toString().split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean)));
      });
    }
  });
}

class GameRunner extends EventEmitter {
  constructor() { super(); this.current = null; }

  get running() { return !!this.current; }

  launch(game, ownExe) {
    if (this.current) return { ok: false, error: 'Zaten bir oyun açık.' };
    if (!game.exe) return { ok: false, error: 'Bu oyun için çalıştırılacak dosya tanımlı değil.' };
    if (!fs.existsSync(game.exe)) return { ok: false, error: `Dosya bulunamadı: ${game.exe}` };
    const cwd = game.workingDir && fs.existsSync(game.workingDir) ? game.workingDir : P.dirname(game.exe);
    const argv = Array.isArray(game.args) ? game.args : (isWin ? (game.args ? [game.args] : []) : splitArgs(game.args));
    let child;
    try {
      child = spawn(game.exe, argv, {
        cwd, detached: false, stdio: 'ignore', windowsHide: false,
        // Verbatim: the args string goes through exactly as in the shortcut. argv0 must then be
        // quoted by hand, otherwise a path with spaces ("Program Files") splits the command line.
        windowsVerbatimArguments: isWin && !Array.isArray(game.args),
        ...(isWin && !Array.isArray(game.args) ? { argv0: `"${game.exe}"` } : {}),
      });
    } catch (e) { return { ok: false, error: e.message }; }
    const startedAt = Date.now();
    const watchNames = new Set([...(game.watch || []).map((s) => s.toLowerCase()), ...exeNamesIn(cwd), ...exeNamesIn(P.dirname(game.exe))]);
    if (ownExe) watchNames.delete(P.basename(ownExe).toLowerCase());
    for (const n of ['electron.exe', 'definitely not ps5 menu.exe', 'ps5 menu.exe', 'ps5-menu.exe', 'crashpad_handler.exe', 'unins000.exe']) watchNames.delete(n);
    const cur = { game, child, startedAt, pid: child.pid, watchNames: [...watchNames] };
    this.current = cur;
    child.once('error', (e) => { this.emit('error', game, e); this._finish(cur, true); });
    child.once('spawn', () => this.emit('started', game, child.pid));
    child.once('exit', () => this._afterMainExit(watchNames, cur));
    return { ok: true, pid: child.pid };
  }

  async _afterMainExit(watchNames, cur) {
    const { startedAt } = cur;
    // Launchers (a launcher exe with --play, batch files) often start the real game and quit at once.
    // Keep waiting while any exe from the game's own folders is still running.
    let misses = 0;
    // A launcher that quit within 15 s probably handed over to the real game: give it time to appear.
    const quick = Date.now() - startedAt < 15000;
    const grace = Date.now() + (quick ? 4000 : 0);
    while (this.current === cur) {
      const names = await runningNames();
      const alive = names && [...watchNames].some((n) => names.has(n) || names.has(n.replace(/\.exe$/, '')));
      if (alive) misses = 0; else misses++;
      if (!alive && misses >= 2 && Date.now() > grace) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    this._finish(cur, false);
  }

  _finish(cur, failed) {
    if (!this.current || this.current !== cur) return;
    const { game, startedAt } = cur;
    this.current = null;
    this.emit('exited', game, { seconds: Math.round((Date.now() - startedAt) / 1000), failed });
  }

  // The window helper saw the whole process tree gone: no need to wait for the next tasklist poll.
  finishNow() { if (this.current) this._finish(this.current, false); }

  kill() {
    if (!this.current) return;
    const pid = this.current.pid;
    if (isWin) execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
    else try { process.kill(pid, 'SIGTERM'); } catch { /* */ }
  }
}

module.exports = { GameRunner, splitArgs, exeNamesIn };
