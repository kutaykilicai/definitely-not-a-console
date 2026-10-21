'use strict';
// Reads Windows shortcuts and finds game art (PS4 sce_sys folders, user images).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { parseLnk } = require('./lnk');
const { readSfo } = require('./sfo');

const isWin = process.platform === 'win32';
const P = isWin ? path.win32 : path;

// On Windows the shell itself is the most reliable .lnk reader. The JS parser is the fallback.
function readShortcutsPowerShell(files) {
  return new Promise((resolve) => {
    if (!isWin || !files.length) return resolve(null);
    const list = files.map((f) => f.replace(/'/g, "''"));
    const script = [
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
      '$sh=New-Object -ComObject WScript.Shell',
      '$r=@()',
      ...list.map((f) => `try{$s=$sh.CreateShortcut('${f}');$r+=[pscustomobject]@{file='${f}';target=$s.TargetPath;args=$s.Arguments;workingDir=$s.WorkingDirectory;iconLocation=$s.IconLocation}}catch{}`),
      'ConvertTo-Json -InputObject @($r) -Compress',
    ].join('\r\n');
    // A temp .ps1 (UTF-8 with BOM) instead of -EncodedCommand: the command line limit would
    // cap the number of shortcuts at about 40.
    const tmp = P.join(os.tmpdir(), `ps5menu-lnk-${process.pid}.ps1`);
    try { fs.writeFileSync(tmp, '\uFEFF' + script, 'utf8'); } catch { return resolve(null); }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp],
      { windowsHide: true, timeout: 30000, maxBuffer: 8 << 20 }, (err, stdout) => {
        try { fs.unlinkSync(tmp); } catch { /* */ }
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout.toString('utf8').trim() || '[]')); } catch { resolve(null); }
      });
  });
}

async function readShortcuts(files) {
  const ps = await readShortcutsPowerShell(files);
  if (ps) return ps;
  return files.map((f) => { try { return { file: f, ...parseLnk(f) }; } catch { return null; } }).filter(Boolean);
}

// Pull "-g <path>" or any quoted path to eboot.bin out of the arguments.
function ebootFromArgs(args) {
  if (!args) return null;
  const m = args.match(/"([^"]*eboot\.bin)"/i) || args.match(/(\S*eboot\.bin)/i);
  return m ? m[1] : null;
}

function exists(p) { try { return !!p && fs.existsSync(p); } catch { return false; } }

function findSceSys(game, extraRoots = []) {
  const tried = [];
  const eboot = ebootFromArgs(game.args);
  if (eboot) tried.push(P.join(P.dirname(eboot), 'sce_sys'));
  if (game.workingDir) tried.push(P.join(game.workingDir, 'sce_sys'));
  // ini-driven launchers keep the game path in an ini next to the exe
  const dir = game.workingDir || (game.exe ? P.dirname(game.exe) : '');
  for (const ini of ['sotc.ini', 'config.ini', 'launcher.ini']) {
    const f = dir && P.join(dir, ini);
    if (exists(f)) {
      try {
        const txt = fs.readFileSync(f, 'utf8');
        for (const m of txt.matchAll(/=\s*"?([A-Za-z]:[\\/][^"\r\n]+)"?/g)) {
          const v = m[1].trim();
          tried.push(P.join(v, 'sce_sys'), P.join(P.dirname(v), 'sce_sys'));
        }
      } catch { /* ignore */ }
    }
  }
  for (const t of tried) if (exists(P.join(t, 'icon0.png'))) return t;
  // Ports and wrappers sometimes keep the PS4 sce_sys folder a level or two below the exe.
  const walk = (d, lvl) => {
    if (!d || lvl > 2) return null;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const sub = P.join(d, e.name);
      if (/^sce_sys$/i.test(e.name) && exists(P.join(sub, 'icon0.png'))) return sub;
    }
    for (const e of ents) if (e.isDirectory() && !/^(user|shader|cache|logs?|saves?|sce_sys)$/i.test(e.name)) { const r = walk(P.join(d, e.name), lvl + 1); if (r) return r; }
    return null;
  };
  const deep = dir && !/[\\/](desktop|masaüstü)[\\/]?$/i.test(dir) ? walk(dir, 0) : null;
  if (deep) return deep;
  // Search known dump folders for one of the title IDs, two levels deep
  const ids = (game.titleIds || []).map((s) => s.toUpperCase());
  const roots = [...extraRoots];
  for (const root of roots) {
    let l1 = [];
    try { l1 = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const d1 of l1) {
      const p1 = P.join(root, d1.name);
      const cands = [p1];
      try { for (const d2 of fs.readdirSync(p1, { withFileTypes: true })) if (d2.isDirectory()) cands.push(P.join(p1, d2.name)); } catch { /* */ }
      for (const c of cands) {
        const s = P.join(c, 'sce_sys');
        if (!exists(P.join(s, 'param.sfo'))) continue;
        let sfo = null; try { sfo = readSfo(P.join(s, 'param.sfo')); } catch { /* */ }
        const tid = (sfo && sfo.TITLE_ID || '').toUpperCase();
        const nameHit = ids.some((id) => c.toUpperCase().includes(id));
        if ((tid && ids.includes(tid)) || nameHit) return s;
      }
    }
  }
  return null;
}

function pick(dir, names) {
  for (const n of names) for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const f = P.join(dir, `${n}.${ext}`);
    if (exists(f)) return f;
  }
  return null;
}

// Fill in icon/background/logo from (in order): games.json, assets/user/games/<id>, sce_sys.
function resolveArt(game, userGamesDir, dumpRoots) {
  const art = { icon: game.icon || null, background: game.background || null, logo: game.logo || null, sceSys: null };
  const ud = P.join(userGamesDir, game.id);
  if (!art.icon || !exists(art.icon)) art.icon = pick(ud, ['icon', 'tile', 'icon0']) || null;
  if (!art.background || !exists(art.background)) art.background = pick(ud, ['background', 'bg', 'hero', 'pic1', 'pic0']) || null;
  if (!art.logo || !exists(art.logo)) art.logo = pick(ud, ['logo']) || null;
  art.cover = (game.cover && exists(game.cover) && game.cover) || pick(ud, ['cover', 'card', 'keyart']) || null;
  if (!art.icon || !art.background) {
    const s = (game.sceSys && exists(P.join(game.sceSys, 'icon0.png')) && game.sceSys) || findSceSys(game, dumpRoots);
    if (s) {
      art.sceSys = s;
      if (!art.icon) art.icon = pick(s, ['icon0']);
      if (!art.background) art.background = pick(s, ['pic1', 'pic0']);
    }
  }
  return art;
}

// Platform badge from the emulator a game runs through (the user can change it).
function emuBadge(target) {
  const t = P.basename(target || '').toLowerCase();
  if (/shadps4|spine|obliteration/.test(t)) return 'PS4';
  if (/rpcs3/.test(t)) return 'PS3';
  if (/pcsx2/.test(t)) return 'PS2';
  if (/duckstation|epsxe|mednafen/.test(t)) return 'PS1';
  if (/xenia/.test(t)) return 'X360';
  return null;
}

// A picked .lnk becomes exe + arguments + working folder.
async function readShortcut(file) {
  const [sc] = await readShortcuts([file]);
  if (!sc || !sc.target) throw new Error('Kısayolun hedefi okunamadı.');
  return { exe: sc.target, args: sc.args || '', workingDir: sc.workingDir || '', name: P.basename(file).replace(/\.lnk$/i, '') };
}

// A picked sce_sys folder (or the dump folder that holds it): title and ID from param.sfo.
function readSceSys(dir) {
  let s = dir;
  if (!exists(P.join(s, 'icon0.png')) && exists(P.join(s, 'sce_sys', 'icon0.png'))) s = P.join(s, 'sce_sys');
  if (!exists(P.join(s, 'icon0.png')) && !exists(P.join(s, 'param.sfo'))) throw new Error('Bu klasörde icon0.png ya da param.sfo yok. PS4 dökümündeki sce_sys klasörünü seç.');
  let sfo = null; try { sfo = readSfo(P.join(s, 'param.sfo')); } catch { /* optional */ }
  return { sceSys: s, title: (sfo && sfo.TITLE) || '', titleId: (sfo && sfo.TITLE_ID) || '' };
}

module.exports = { resolveArt, findSceSys, ebootFromArgs, emuBadge, readShortcut, readShortcuts, readSceSys };
