'use strict';
// Per-game theme like on a console: the game's own music and background while it is focused.
// Everything comes from the user's own files at run time; nothing is shipped with the app.
//   music, in this order: off (game.music === 'off') | files picked in Oyunu Düzenle (game.music)
//     | assets\games\<id>\music*.{mp3,ogg,m4a,opus,wav,flac} (several = a playlist)
//     | the PS4 dump's sce_sys\snd0.at9 (ATRAC9, turned into Ogg Opus once with the user's ffmpeg,
//       kept in <data>\cache\theme) | a theme/menu/music/bgm file in the game's own folder
//     | the sound of the game's attract/title video (Attract.bik ...), converted once like snd0.at9
//   accent colour: picked by hand (game.accent) or taken from the background/cover picture.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

const isWin = process.platform === 'win32';
const P = isWin ? path.win32 : path;
const AUDIO = /\.(mp3|ogg|oga|m4a|aac|opus|wav|flac|webm)$/i;
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const listDir = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

// assets\games\<id>\music.mp3, music-1.ogg, music 2.m4a ... sorted by name
function userMusic(userGamesDir, id) {
  const d = P.join(userGamesDir, id);
  return listDir(d).filter((n) => /^music([ _.-].*)?\.[a-z0-9]+$/i.test(n) && AUDIO.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((n) => P.join(d, n));
}
// The game's own folder (and its assets\ / music\ subfolder): files that are obviously theme music.
function folderMusic(game) {
  const dir = game.workingDir || (game.exe ? P.dirname(game.exe) : '');
  if (!dir || /[\\/](desktop|masaüstü)[\\/]?$/i.test(dir)) return [];
  const out = [];
  for (const sub of ['', 'assets', 'music', 'launcher', 'assets/music']) {
    const d = sub ? P.join(dir, sub) : dir;
    for (const n of listDir(d)) if (AUDIO.test(n) && /^(theme|menu|title|music|bgm|soundtrack|ost)([ _.-].*)?\.[a-z0-9]+$/i.test(n)) out.push(P.join(d, n));
    if (out.length) break;
  }
  return out;
}
// The game's attract-mode / title video (what the game plays on its own title screen), whose sound
// track is the closest thing to a theme a game without one has (Naruto: Rise of a Ninja PC:
// game\Attract.bik). Its audio is turned into Ogg once, like snd0.at9.
const VIDEO = /\.(bik|bk2|mp4|wmv|webm|usm)$/i;
function attractVideo(game) {
  const dir = game.workingDir || (game.exe ? P.dirname(game.exe) : '');
  if (!dir || /[\\/](desktop|masaüstü)[\\/]?$/i.test(dir)) return null;
  for (const sub of ['', 'game', 'movies', 'movie', 'video', 'videos', 'data']) {
    const d = sub ? P.join(dir, sub) : dir;
    const n = listDir(d).filter((x) => VIDEO.test(x) && /^(attract|title|menu)([ _.-].*)?\.[a-z0-9]+$/i.test(x)).sort()[0];
    if (n) return P.join(d, n);
  }
  return null;
}
function sceSysOf(game, art) {
  const s = (art && art.sceSys) || game.sceSys || null;
  return s && exists(P.join(s, 'snd0.at9')) ? s : null;
}

// ffmpeg: settings.ffmpegPath, <data>\tools\ffmpeg.exe, then PATH (winget puts it there).
function findFfmpeg({ setting, dataDir, envPath = process.env.PATH || '' } = {}) {
  if (process.env.PS5MENU_FFMPEG) return process.env.PS5MENU_FFMPEG;
  const exe = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const c = [setting, dataDir && P.join(dataDir, 'tools', exe)];
  for (const d of envPath.split(isWin ? ';' : ':')) if (d) c.push(P.join(d.replace(/^"|"$/g, ''), exe));
  return c.find((f) => f && exists(f)) || null;
}

const cacheName = (id, src) => { let st = null; try { st = fs.statSync(src); } catch { /* */ } return `${id}-${crypto.createHash('sha1').update(`${src}|${st ? st.size : 0}|${st ? st.mtimeMs : 0}`).digest('hex').slice(0, 10)}.ogg`; };

// What plays for this game. Returns { files: [paths], source, at9?, cache? }.
function resolveMusic(game, art, { userGamesDir, cacheDir }) {
  if (game.music === 'off') return { files: [], source: 'off' };
  const picked = (Array.isArray(game.music) ? game.music : typeof game.music === 'string' && game.music && game.music !== 'auto' ? [game.music] : []).filter(exists);
  if (picked.length) return { files: picked, source: 'picked' };
  const u = userMusic(userGamesDir, game.id);
  if (u.length) return { files: u, source: 'user' };
  const s = sceSysOf(game, art);
  if (s) {
    const at9 = P.join(s, 'snd0.at9'); const cache = P.join(cacheDir, cacheName(game.id, at9));
    if (exists(cache)) return { files: [cache], source: 'sce', at9 };
    return { files: [], source: 'sce-pending', at9, cache };
  }
  const f = folderMusic(game);
  if (f.length) return { files: f, source: 'folder' };
  const v = attractVideo(game);
  if (v) {
    const cache = P.join(cacheDir, cacheName(game.id, v));
    if (exists(cache)) return { files: [cache], source: 'video', at9: v };
    return { files: [], source: 'video-pending', at9: v, cache };
  }
  return { files: [], source: null };
}

// One conversion at a time, in the background; never while a game runs (busy()).
class Converter {
  constructor({ ffmpeg, busy = () => false, log = () => {} }) { this.ffmpeg = ffmpeg; this.busy = busy; this.log = log; this.q = []; this.on = false; this.failed = new Map(); this.done = new Set(); }
  add(job, cb) {
    if (!this.ffmpeg() || this.failed.has(job.cache) || this.q.some((j) => j.cache === job.cache)) return false;
    this.q.push({ ...job, cb }); this.pump(); return true;
  }
  async pump() {
    if (this.on) return; this.on = true;
    try {
      while (this.q.length) {
        while (this.busy()) await new Promise((r) => setTimeout(r, 2000));
        const j = this.q.shift();
        const ok = await this.convert(j.at9, j.cache);
        if (ok) this.done.add(j.cache); else this.failed.set(j.cache, true);
        try { j.cb && j.cb(ok, j); } catch { /* */ }
      }
    } finally { this.on = false; }
  }
  convert(src, dst) {
    const ff = this.ffmpeg(); if (!ff) return Promise.resolve(false);
    try { fs.mkdirSync(P.dirname(dst), { recursive: true }); } catch { /* */ }
    const tmp = `${dst}.part`;
    const run = (codec) => new Promise((res) => execFile(ff, ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-i', src, '-vn', '-c:a', codec, ...(codec === 'libopus' ? ['-b:a', '128k'] : ['-q:a', '5']), '-f', 'ogg', tmp],
      { windowsHide: true, timeout: 120000 }, (err) => res(!err && exists(tmp) && fs.statSync(tmp).size > 1000)));
    return (async () => {
      let ok = await run('libopus'); if (!ok) ok = await run('libvorbis');
      if (ok) { try { fs.renameSync(tmp, dst); } catch { ok = false; } } else { try { fs.unlinkSync(tmp); } catch { /* */ } }
      this.log('theme music', ok ? 'converted' : 'failed', src);
      return ok;
    })();
  }
}

// Accent colour from an RGBA (or BGRA with bgra=true) pixel buffer: the most common saturated hue,
// brightened to stay readable on dark backgrounds. Returns '#rrggbb' or null (grey pictures).
function accentFromPixels(buf, { bgra = false, step = 4 } = {}) {
  const bins = new Map();
  for (let i = 0; i + 3 < buf.length; i += step) {
    const r = buf[bgra ? i + 2 : i], g = buf[i + 1], b = buf[bgra ? i : i + 2], a = buf[i + 3];
    if (a < 128) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = (mx - mn) / 255;
    if (d < 0.18 || l < 0.12 || l > 0.92) continue;
    let h; if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
    const k = Math.floor(h * 4) % 24;               // 15° bins
    const e = bins.get(k) || { n: 0, w: 0, r: 0, g: 0, b: 0 };
    const w = d * (1 - Math.abs(l - 0.5));
    e.n++; e.w += w; e.r += r * w; e.g += g * w; e.b += b * w; bins.set(k, e);
  }
  let best = null; for (const e of bins.values()) if (!best || e.w > best.w) best = e;
  if (!best || best.n < 6) return null;
  let r = best.r / best.w, g = best.g / best.w, b = best.b / best.w;
  // lift dark colours so a focus ring / glow in this colour stays visible on a dark screen
  const mx = Math.max(r, g, b); if (mx < 170) { const f = 170 / Math.max(1, mx); r *= f; g *= f; b *= f; }
  const hx = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

module.exports = { resolveMusic, userMusic, folderMusic, findFfmpeg, Converter, accentFromPixels, cacheName, AUDIO };
