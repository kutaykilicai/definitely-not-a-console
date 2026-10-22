'use strict';
// 1.5.0 renamed the app from "Definitely Not PS5 Menu" to "Definitely Not a Console". On the first
// start the old data folder (%APPDATA%\Definitely Not PS5 Menu) is copied into the new one: games,
// settings, state, the user's art and sounds, the intro folder, backups. Chromium's own cache
// (electron\) is left behind. The old folder is not changed or deleted; a later version lists and
// removes it. A Windows "start with Windows" entry that still points at the old exe moves to the
// new one.
const fs = require('fs');
const path = require('path');

const OLD_NAME = 'Definitely Not PS5 Menu';
const MARK = 'migrated-from.json';
const SKIP = new Set(['electron']);

function copyTree(src, dst, list, rel = '') {
  let n = 0;
  let ents = []; try { ents = fs.readdirSync(src, { withFileTypes: true }); } catch { return 0; }
  fs.mkdirSync(dst, { recursive: true });
  for (const e of ents) {
    if (!rel && SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) n += copyTree(s, d, list, r);
    else if (e.isFile()) { if (!fs.existsSync(d)) { fs.copyFileSync(s, d); try { const st = fs.statSync(s); fs.utimesSync(d, st.atime, st.mtime); } catch { /* */ } list.push(r); n++; } }
  }
  return n;
}

// fromDir: the old data folder, dataDir: the new one. Runs once: not when the new folder already
// has a games.json (a fresh 1.5 install that was used already) or the marker.
function migrateRename({ fromDir, dataDir, now = () => new Date() }) {
  const res = { migrated: false, from: fromDir, files: 0 };
  if (!fromDir || !fs.existsSync(fromDir)) return res;
  if (fs.existsSync(path.join(dataDir, MARK)) || fs.existsSync(path.join(dataDir, 'games.json'))) return res;
  const hasData = ['games.json', 'settings.json', 'state.json', 'assets', 'intro'].some((n) => fs.existsSync(path.join(fromDir, n)));
  if (!hasData) return res;
  const list = [];
  // games.json last: if the copy is cut short the next start tries again
  const tmpSkip = path.join(fromDir, 'games.json');
  const hadGames = fs.existsSync(tmpSkip);
  SKIP.add('games.json');
  try { res.files = copyTree(fromDir, dataDir, list); } finally { SKIP.delete('games.json'); }
  if (hadGames) { fs.copyFileSync(tmpSkip, path.join(dataDir, 'games.json')); list.push('games.json'); res.files++; }
  fs.writeFileSync(path.join(dataDir, MARK), JSON.stringify({ from: fromDir, at: now().toISOString(), files: list, note: 'Eski klasör silinmedi. Sonraki sürüm listeleyip temizler.' }, null, 2) + '\n');
  res.migrated = true;
  return res;
}

// Run-key entries (HKCU\Software\Microsoft\Windows\CurrentVersion\Run) that start the old exe.
// reg: { list() -> [{name, data}], remove(name) } (reg.exe on Windows, a fake in tests).
function moveRunEntry({ reg, oldExeRe = /definitely-not-ps5-menu\\|Definitely Not PS5 Menu\.exe/i, setNew }) {
  const found = (reg.list() || []).filter((v) => oldExeRe.test(v.data || ''));
  for (const v of found) reg.remove(v.name);
  if (found.length && setNew) setNew();
  return found.map((v) => v.name);
}

// reg.exe based Run key access (no admin rights: HKCU only).
function regRun(execFileSync) {
  const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  return {
    list() {
      let out = ''; try { out = execFileSync('reg.exe', ['query', KEY], { windowsHide: true, encoding: 'utf8' }); } catch { return []; }
      return out.split(/\r?\n/).map((l) => l.match(/^\s{4}(.+?)\s{4}REG_(?:EXPAND_)?SZ\s{4}(.*)$/)).filter(Boolean).map((m) => ({ name: m[1], data: m[2] }));
    },
    remove(name) { try { execFileSync('reg.exe', ['delete', KEY, '/v', name, '/f'], { windowsHide: true }); } catch { /* */ } },
    set(name, data) { try { execFileSync('reg.exe', ['add', KEY, '/v', name, '/t', 'REG_SZ', '/d', data, '/f'], { windowsHide: true }); return true; } catch { return false; } },
  };
}

// Tests: the Run key as a JSON file {name: data}.
function fileRun(file) {
  const rd = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const wr = (o) => fs.writeFileSync(file, JSON.stringify(o, null, 1));
  return { list: () => Object.entries(rd()).map(([name, data]) => ({ name, data })), remove(name) { const o = rd(); delete o[name]; wr(o); }, set(name, data) { const o = rd(); o[name] = data; wr(o); return true; } };
}

module.exports = { OLD_NAME, MARK, migrateRename, moveRunEntry, regRun, fileRun };
