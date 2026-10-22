'use strict';
// The picture of a Switch game, from the user's own dump (.nsp / .xci) and the user's own keys, the
// way the console shows it on its HOME Menu: the control NCA's RomFS has icon_<language>.dat (a JPEG)
// and control.nacp (the name). Done here with Node's own AES (no extra tool): only the NCA headers
// (0xC00 bytes each) and the control NCA's small RomFS are read and decrypted in memory; the game
// itself is never copied. Keys are read from Eden's user\keys (prod.keys, title.keys*) and the dump's
// own ticket; nothing is written except the icon.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LANGS = ['AmericanEnglish', 'BritishEnglish', 'Japanese', 'French', 'German', 'LatinAmericanSpanish', 'Spanish', 'Italian', 'Dutch', 'CanadianFrench', 'Portuguese', 'Russian', 'Korean', 'TraditionalChinese', 'SimplifiedChinese', 'BrazilianPortuguese'];

function readAt(fd, pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return b.subarray(0, n); }

// PFS0 (.nsp) and HFS0 (.xci partitions): [{ name, offset (absolute), size }]
function readFs0(fd, base) {
  const h = readAt(fd, base, 16);
  const magic = h.toString('latin1', 0, 4);
  if (magic !== 'PFS0' && magic !== 'HFS0') return null;
  const n = h.readUInt32LE(4), strSize = h.readUInt32LE(8);
  const es = magic === 'PFS0' ? 24 : 64;
  if (n > 4096 || strSize > 1 << 20) return null;
  const t = readAt(fd, base + 16, n * es + strSize);
  const strs = t.subarray(n * es);
  const data = base + 16 + n * es + strSize;
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = t.subarray(i * es, (i + 1) * es);
    const off = Number(e.readBigUInt64LE(0)), size = Number(e.readBigUInt64LE(8)), no = e.readUInt32LE(16);
    const end = strs.indexOf(0, no);
    out.push({ name: strs.toString('utf8', no, end < 0 ? strs.length : end), offset: data + off, size });
  }
  return out;
}

// Files of a dump: an .nsp is one PFS0; an .xci has a root HFS0 whose "secure" partition holds the NCAs.
function listFiles(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const p = readFs0(fd, 0);
    if (p) return p;
    const hdr = readAt(fd, 0x100, 0x40);
    if (hdr.toString('latin1', 0, 4) !== 'HEAD') throw new Error('NSP ya da XCI değil');
    const root = readFs0(fd, Number(readAt(fd, 0x130, 8).readBigUInt64LE(0)));
    if (!root) throw new Error('XCI bölümleri okunamadı');
    const files = [];
    for (const part of root.filter((x) => /^(secure|normal)$/.test(x.name))) files.push(...(readFs0(fd, part.offset) || []));
    return files;
  } finally { fs.closeSync(fd); }
}

// "name = hex" lines (prod.keys, title.keys); lower-case names, Buffers
function parseKeys(text) {
  const m = new Map();
  for (const line of String(text || '').split(/\r?\n/)) { const r = /^\s*([0-9A-Za-z_]+)\s*[=,]\s*([0-9A-Fa-f]+)\s*$/.exec(line); if (r && r[2].length % 2 === 0) m.set(r[1].toLowerCase(), Buffer.from(r[2], 'hex')); }
  return m;
}

// Title keys (still encrypted, like title.keys) from the dump's own common tickets:
// rights id at body+0x160, title key block at body+0x40 (body after the signature).
function ticketKeys(file, files) {
  const fd = fs.openSync(file, 'r'); const keys = new Map();
  try {
    for (const t of files.filter((x) => /\.tik$/i.test(x.name) && x.size >= 0x2C0 && x.size < 0x1000)) {
      const b = readAt(fd, t.offset, t.size);
      const sigLen = { 0x10000: 0x200, 0x10001: 0x100, 0x10002: 0x3C, 0x10003: 0x200, 0x10004: 0x100, 0x10005: 0x3C }[b.readUInt32LE(0)];
      if (!sigLen) continue;
      const body = 4 + sigLen + ((0x40 - ((4 + sigLen) % 0x40)) % 0x40);
      if (b.length < body + 0x170) continue;
      keys.set(b.subarray(body + 0x160, body + 0x170).toString('hex'), Buffer.from(b.subarray(body + 0x40, body + 0x50)));
    }
  } finally { fs.closeSync(fd); }
  return keys;
}

// ---------- NCA ----------
const xtsTweak = (sector) => { const t = Buffer.alloc(16); t.writeBigUInt64BE(BigInt(sector), 8); return t; };
function xts(key, data, firstSector, decrypt = true) {
  const out = Buffer.alloc(data.length);
  for (let s = 0; s * 0x200 < data.length; s++) {
    const c = (decrypt ? crypto.createDecipheriv : crypto.createCipheriv)('aes-128-xts', key, xtsTweak(firstSector + s));
    c.setAutoPadding(false);
    const part = data.subarray(s * 0x200, (s + 1) * 0x200);
    Buffer.concat([c.update(part), c.final()]).copy(out, s * 0x200);
  }
  return out;
}
const ecb = (key, data, decrypt = true) => { const c = (decrypt ? crypto.createDecipheriv : crypto.createCipheriv)('aes-128-ecb', key, null); c.setAutoPadding(false); return Buffer.concat([c.update(data), c.final()]); };
// AES-CTR of an NCA section: the upper 8 bytes are the section's counter (reversed), the lower 8 the
// absolute offset in the NCA / 16.
function ctrIv(sectionCtr, absOffset) { const iv = Buffer.alloc(16); for (let j = 0; j < 8; j++) iv[j] = sectionCtr[7 - j]; iv.writeBigUInt64BE(BigInt(Math.floor(absOffset / 16)), 8); return iv; }
const ctr = (key, iv, data) => { const c = crypto.createDecipheriv('aes-128-ctr', key, iv); return Buffer.concat([c.update(data), c.final()]); };

// Decrypted NCA header (0xC00) or null when this is not an NCA3 under this header key.
function ncaHeader(fd, offset, headerKey) {
  const raw = readAt(fd, offset, 0xC00); if (raw.length < 0xC00) return null;
  const h = xts(headerKey, raw, 0);
  return h.toString('latin1', 0x200, 0x204) === 'NCA3' ? h : null;
}
const hx = (n) => n.toString(16).padStart(2, '0');

// The RomFS of the control NCA: { name -> Buffer } of its root files (small; read whole).
function controlRomfs(fd, nca, h, keys, titleKeys) {
  const keygen = Math.max(h[0x206], h[0x220]); const mk = keygen ? keygen - 1 : 0;
  const rights = h.subarray(0x230, 0x240);
  let key;
  if (rights.some((x) => x)) {
    const enc = titleKeys.get(rights.toString('hex')); const kek = keys.get(`titlekek_${hx(mk)}`);
    if (!enc) throw new Error('no-titlekey'); if (!kek) throw new Error('no-titlekek');
    key = ecb(kek, enc);
  } else {
    const kak = keys.get(`key_area_key_application_${hx(mk)}`); if (!kak) throw new Error('no-key-area-key');
    key = ecb(kak, h.subarray(0x300, 0x340)).subarray(0x20, 0x30);
  }
  for (let i = 0; i < 4; i++) {
    const start = h.readUInt32LE(0x240 + i * 16) * 0x200, end = h.readUInt32LE(0x244 + i * 16) * 0x200;
    if (!end) continue;
    const fsh = h.subarray(0x400 + i * 0x200, 0x600 + i * 0x200);
    if (fsh[2] !== 0 || fsh[3] !== 3 || fsh[4] !== 3) continue;   // RomFS, IVFC hashes, AES-CTR
    if (fsh.toString('latin1', 0x8, 0xC) !== 'IVFC') continue;
    const lv = 0x8 + 0x10 + 0x18 * 5;                            // level 6: the RomFS itself
    const lofs = Number(fsh.readBigUInt64LE(lv)), lsize = Number(fsh.readBigUInt64LE(lv + 8));
    if (!lsize || lsize > 16 << 20) continue;
    const abs = start + lofs, pad = abs % 16;
    const enc = readAt(fd, nca.offset + abs - pad, lsize + pad);
    const rom = ctr(key, ctrIv(fsh.subarray(0x140, 0x148), abs - pad), enc).subarray(pad);
    return readRomfs(rom);
  }
  throw new Error('no-romfs');
}
// RomFS: header (0x50), then the file entry table: parent, sibling, data offset, size, hash, name length, name.
function readRomfs(rom) {
  const hsize = Number(rom.readBigUInt64LE(0));
  if (hsize !== 0x50) throw new Error('bad-romfs');
  const fmOff = Number(rom.readBigUInt64LE(0x38)), fmSize = Number(rom.readBigUInt64LE(0x40)), dataOff = Number(rom.readBigUInt64LE(0x48));
  const files = new Map();
  for (let p = fmOff; p + 0x20 <= fmOff + fmSize;) {
    const off = Number(rom.readBigUInt64LE(p + 8)), size = Number(rom.readBigUInt64LE(p + 16)), nl = rom.readUInt32LE(p + 28);
    const name = rom.toString('utf8', p + 32, p + 32 + nl);
    files.set(name, rom.subarray(dataOff + off, dataOff + off + size));
    p += 32 + Math.ceil(nl / 4) * 4;
  }
  return files;
}

function findKeys(edenDir) {
  const k = edenDir && path.join(edenDir, 'user', 'keys');
  const pk = k && path.join(k, 'prod.keys');
  if (!pk || !fs.existsSync(pk)) return null;
  const tks = ['title.keys', 'title.keys_autogenerated'].map((n) => path.join(k, n)).filter((f) => fs.existsSync(f));
  return { prod: pk, title: tks };
}

// -> { ok, file (the stored icon), title?, from } or { ok: false, reason }
async function extractIcon({ game, outDir, keys, maxNca = 64 << 20 }) {
  if (!keys) return { ok: false, reason: 'no-keys' };
  let pk, tk;
  try { pk = parseKeys(fs.readFileSync(keys.prod, 'utf8')); } catch { return { ok: false, reason: 'no-keys' }; }
  const headerKey = pk.get('header_key'); if (!headerKey || headerKey.length !== 32) return { ok: false, reason: 'no-header-key' };
  let files; try { files = listFiles(game); } catch (e) { return { ok: false, reason: e.message }; }
  tk = new Map(); for (const f of keys.title || []) { try { for (const [k, v] of parseKeys(fs.readFileSync(f, 'utf8'))) tk.set(k, v); } catch { /* */ } }
  for (const [k, v] of ticketKeys(game, files)) tk.set(k, v);
  const ncas = files.filter((f) => /\.nca$/i.test(f.name) && !/\.cnmt\.nca$/i.test(f.name) && f.size < maxNca).sort((a, b) => a.size - b.size);
  if (!ncas.length) return { ok: false, reason: 'no-small-nca' };
  const fd = fs.openSync(game, 'r'); let last = 'no-control-nca';
  try {
    // control NCAs (content type 2; 0x204 is the distribution type); a dump with its update
    // merged in has two: the newer one (higher key generation) first
    const controls = [];
    for (const n of ncas) {
      const h = ncaHeader(fd, n.offset, headerKey);
      if (!h) { last = 'bad-header-key'; continue; }
      if (h[0x205] === 2) controls.push({ n, h, gen: Math.max(h[0x206], h[0x220]) });
    }
    controls.sort((a, b) => b.gen - a.gen);
    for (const { n, h } of controls) {
      let rom; try { rom = controlRomfs(fd, n, h, pk, tk); } catch (e) { last = e.message; continue; }
      const best = LANGS.map((l) => `icon_${l}.dat`).find((x) => rom.has(x)) || [...rom.keys()].find((x) => /^icon_.+\.dat$/.test(x));
      if (!best) { last = 'no-icon'; continue; }
      const jpg = rom.get(best);
      if (jpg[0] !== 0xFF || jpg[1] !== 0xD8) { last = 'bad-icon'; continue; }
      let title = null; const nacp = rom.get('control.nacp');
      if (nacp) { const li = Math.max(0, LANGS.indexOf(best.slice(5, -4))); const s = nacp.toString('utf8', li * 0x300, li * 0x300 + 0x200).replace(/\0[\s\S]*$/, '').trim(); if (s) title = s; }
      fs.mkdirSync(outDir, { recursive: true });
      for (const x of fs.readdirSync(outDir)) if (/^icon\.(png|jpe?g|webp)$/i.test(x)) fs.unlinkSync(path.join(outDir, x));
      const dst = path.join(outDir, 'icon.jpg');
      fs.writeFileSync(dst, jpg);
      return { ok: true, file: dst, title, from: n.name };
    }
  } finally { fs.closeSync(fd); }
  return { ok: false, reason: last };
}

module.exports = { readFs0, listFiles, parseKeys, ticketKeys, ncaHeader, readRomfs, extractIcon, findKeys, LANGS, _crypto: { xts, ecb, ctrIv } };
