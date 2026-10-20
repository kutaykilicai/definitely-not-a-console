'use strict';
// The user's game list: where it lives, first-run migration from the old portable layout,
// and the edits the in-app manager makes (add, edit, move, delete). No Electron here.
const fs = require('fs');
const path = require('path');
const { findSceSys } = require('./detect');

const P = path.win32; // Windows paths (also handles /), so tests on Linux behave the same

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8'); return true; };

function slug(s) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  return String(s || '').replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => map[c]).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'oyun';
}

function makeId(title, taken) {
  const base = slug(title); let id = base; let i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  return id;
}

// Fields the manager is allowed to write; everything else on an entry is kept as it was.
const EDITABLE = ['title', 'exe', 'args', 'workingDir', 'sceSys', 'losslessScaling', 'hidden', 'badge', 'description', 'section'];

function saveEntry(doc, draft) {
  const games = doc.games || (doc.games = []);
  const title = String(draft.title || '').trim() || (draft.exe ? P.basename(draft.exe).replace(/\.(exe|bat|cmd|lnk)$/i, '') : '');
  if (!title) throw new Error('Oyunun adı boş olamaz.');
  if (!draft.exe) throw new Error('Çalıştırılacak programı seç.');
  let g = draft.id && games.find((x) => x.id === draft.id);
  if (!g) { g = { id: makeId(title, new Set(games.map((x) => x.id))), source: 'manual', added: new Date().toISOString() }; games.push(g); }
  for (const k of EDITABLE) if (k in draft) g[k] = draft[k];
  g.title = title;
  g.args = String(g.args || '');
  if (!g.workingDir) delete g.workingDir;
  if (!g.sceSys) delete g.sceSys;
  if (!g.losslessScaling) delete g.losslessScaling;
  if (!g.hidden) delete g.hidden;
  return g;
}

function moveEntry(doc, id, delta) {
  const a = doc.games || []; const i = a.findIndex((g) => g.id === id); const j = i + delta;
  if (i < 0 || j < 0 || j >= a.length) return false;
  [a[i], a[j]] = [a[j], a[i]]; return true;
}

function deleteEntry(doc, id) {
  const a = doc.games || []; const i = a.findIndex((g) => g.id === id);
  if (i < 0) return null; return a.splice(i, 1)[0];
}

// Folders worth searching for a PS4 dump next to the user's own games: the two levels above each
// exe and above any path in its arguments. Derived from the user's data, never hard-coded.
function deriveRoots(games) {
  const out = new Set();
  for (const g of games) {
    const paths = [g.exe, g.workingDir];
    for (const m of String(g.args || '').matchAll(/"([A-Za-z]:\\[^"]+)"|([A-Za-z]:\\\S+)/g)) paths.push(m[1] || m[2]);
    for (const p of paths) {
      if (!p || !/^[A-Za-z]:\\/.test(p)) continue;
      const d1 = P.dirname(P.dirname(p)); const d2 = P.dirname(d1);
      for (const d of [d1, d2]) if (d && !/^[A-Za-z]:\\?$/.test(d) && !/\\users\\[^\\]+$/i.test(d) && !/\\users$/i.test(d)) out.add(d);
    }
  }
  return [...out];
}

function copyDir(src, dst) {
  let n = 0;
  let ents = []; try { ents = fs.readdirSync(src, { withFileTypes: true }); } catch { return 0; }
  fs.mkdirSync(dst, { recursive: true });
  for (const e of ents) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d);
    else if (!/^BENIOKU\.txt$/i.test(e.name) && !fs.existsSync(d)) { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

// First run of the per-user layout: bring over an old portable install (data\ and assets\user\
// next to the exe) so existing setups keep working. Art found through the old dump folders is
// written into each entry (sceSys), because the new defaults have no dump folders.
function migrateLegacy({ legacyRoot, configDir, assetsDir }) {
  const res = { migrated: false, games: 0, assets: 0 };
  const target = path.join(configDir, 'games.json');
  if (!legacyRoot || fs.existsSync(target)) return res;
  const old = path.join(legacyRoot, 'data');
  const oldGames = readJson(path.join(old, 'games.json'), null);
  if (!oldGames || !Array.isArray(oldGames.games)) return res;
  fs.mkdirSync(configDir, { recursive: true });
  for (const f of ['settings.json', 'state.json']) {
    const s = path.join(old, f);
    if (fs.existsSync(s) && !fs.existsSync(path.join(configDir, f))) fs.copyFileSync(s, path.join(configDir, f));
  }
  res.assets = copyDir(path.join(legacyRoot, 'assets', 'user'), assetsDir);
  const oldSettings = readJson(path.join(old, 'settings.json'), {});
  const roots = [...new Set([...(oldSettings.dumpRoots || []), ...deriveRoots(oldGames.games)])];
  for (const g of oldGames.games) {
    if (g.sceSys || g.icon) continue;
    try { const s = findSceSys(g, roots); if (s) g.sceSys = s; } catch { /* art is optional */ }
  }
  oldGames.migratedFrom = old;
  oldGames.migratedAt = new Date().toISOString();
  delete oldGames.lastScan;
  writeJson(target, oldGames);
  res.migrated = true; res.games = oldGames.games.length;
  return res;
}

// Copy a whole previous per-user folder (games.json, settings, state, assets) into the new one,
// skipping the Electron cache. Nothing is removed from the old folder.
function migrateConfigDir({ fromDir, configDir }) {
  const res = { migrated: false, games: 0, assets: 0 };
  if (!fromDir || fs.existsSync(path.join(configDir, 'games.json'))) return res;
  const doc = readJson(path.join(fromDir, 'games.json'), null);
  if (!doc || !Array.isArray(doc.games)) return res;
  fs.mkdirSync(configDir, { recursive: true });
  for (const f of ['settings.json', 'state.json']) {
    const s = path.join(fromDir, f);
    if (fs.existsSync(s) && !fs.existsSync(path.join(configDir, f))) fs.copyFileSync(s, path.join(configDir, f));
  }
  res.assets = copyDir(path.join(fromDir, 'assets'), path.join(configDir, 'assets'));
  doc.migratedFrom = fromDir; doc.migratedAt = new Date().toISOString();
  writeJson(path.join(configDir, 'games.json'), doc);
  res.migrated = true; res.games = doc.games.length;
  return res;
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// Copy a picked image into the user's art folder for this game (icon or background).
function storeArt(assetsDir, id, kind, file) {
  if (!IMAGE_EXT.test(file || '')) throw new Error('PNG, JPG ya da WEBP bir resim seç.');
  const dir = path.join(assetsDir, 'games', id);
  fs.mkdirSync(dir, { recursive: true });
  for (const n of fs.readdirSync(dir)) if (new RegExp(`^${kind}\\.(png|jpe?g|webp)$`, 'i').test(n)) fs.unlinkSync(path.join(dir, n));
  const dst = path.join(dir, kind + path.extname(file).toLowerCase());
  fs.copyFileSync(file, dst);
  return dst;
}

function clearArt(assetsDir, id) {
  const dir = path.join(assetsDir, 'games', id);
  try { for (const n of fs.readdirSync(dir)) if (/^(icon|tile|background|bg|cover|logo)\.(png|jpe?g|webp)$/i.test(n)) fs.unlinkSync(path.join(dir, n)); } catch { /* none */ }
}

module.exports = { readJson, writeJson, slug, makeId, saveEntry, moveEntry, deleteEntry, deriveRoots, migrateLegacy, migrateConfigDir, storeArt, clearArt, EDITABLE };
