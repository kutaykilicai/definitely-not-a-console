'use strict';
// Minimal Windows Shell Link (.lnk) parser, written from the MS-SHLLINK spec.
// Returns { target, args, workingDir, iconLocation, name, relativePath } or throws.
const fs = require('fs');
const path = require('path');

const F = {
  HasLinkTargetIDList: 0x1, HasLinkInfo: 0x2, HasName: 0x4, HasRelativePath: 0x8,
  HasWorkingDir: 0x10, HasArguments: 0x20, HasIconLocation: 0x40, IsUnicode: 0x80,
  HasExpString: 0x200,
};

function ansi(buf) {
  try { return new TextDecoder('windows-1254').decode(buf); } catch { return buf.toString('latin1'); }
}
function cstr(buf, off) {
  let end = off; while (end < buf.length && buf[end] !== 0) end++;
  return ansi(buf.subarray(off, end));
}
function wstr(buf, off) {
  let end = off; while (end + 1 < buf.length && (buf[end] | buf[end + 1]) !== 0) end += 2;
  return buf.subarray(off, end).toString('utf16le');
}

function parseLnk(input) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  if (buf.length < 76 || buf.readUInt32LE(0) !== 0x4c) throw new Error('not a .lnk file');
  const flags = buf.readUInt32LE(20);
  let off = 76;
  let idTarget = '';
  if (flags & F.HasLinkTargetIDList) {
    const n = buf.readUInt16LE(off);
    try { idTarget = parseIdList(buf.subarray(off + 2, off + 2 + n)); } catch { idTarget = ''; }
    off += 2 + n;
  }
  let target = '';
  if (flags & F.HasLinkInfo) {
    const liStart = off;
    const liSize = buf.readUInt32LE(off);
    const liHeader = buf.readUInt32LE(off + 4);
    const liFlags = buf.readUInt32LE(off + 8);
    const localBaseOff = buf.readUInt32LE(off + 16);
    const suffixOff = buf.readUInt32LE(off + 24);
    let base = '', suffix = '';
    if (liHeader >= 0x24) {
      const ub = buf.readUInt32LE(off + 28), us = buf.readUInt32LE(off + 32);
      if ((liFlags & 1) && ub) base = wstr(buf, liStart + ub);
      if (us) suffix = wstr(buf, liStart + us);
    }
    if (!base && (liFlags & 1) && localBaseOff) base = cstr(buf, liStart + localBaseOff);
    if (!suffix && suffixOff) suffix = cstr(buf, liStart + suffixOff);
    target = base + (suffix && !base.endsWith('\\') && base ? '\\' : '') + suffix;
    if (!base) target = suffix;
    off = liStart + liSize;
  }
  const unicode = !!(flags & F.IsUnicode);
  const readStr = () => {
    if (off + 2 > buf.length) return '';
    const n = buf.readUInt16LE(off); off += 2;
    const bytes = Math.min(unicode ? n * 2 : n, buf.length - off);
    const s = unicode ? buf.subarray(off, off + bytes).toString('utf16le') : ansi(buf.subarray(off, off + bytes));
    off += bytes; return s;
  };
  const out = { target, args: '', workingDir: '', iconLocation: '', name: '', relativePath: '' };
  if (flags & F.HasName) out.name = readStr();
  if (flags & F.HasRelativePath) out.relativePath = readStr();
  if (flags & F.HasWorkingDir) out.workingDir = readStr();
  if (flags & F.HasArguments) out.args = readStr();
  if (flags & F.HasIconLocation) out.iconLocation = readStr();
  // ExtraData: EnvironmentVariableDataBlock gives the target when paths use %VARS%
  while (off + 8 <= buf.length) {
    const size = buf.readUInt32LE(off);
    if (size < 4) break;
    const sig = buf.readUInt32LE(off + 4);
    if (off + size > buf.length) break;
    if (sig === 0xa0000001 && size >= 0x314) {
      const uni = wstr(buf, off + 8 + 260);
      const env = uni || cstr(buf, off + 8);
      if (env && (!out.target || (flags & F.HasExpString))) out.target = expandEnv(env);
    }
    off += size;
  }
  if (!out.target && idTarget) out.target = idTarget;
  if (!out.target && out.relativePath && typeof input === 'string') {
    out.target = path.win32.resolve(path.win32.dirname(input), out.relativePath);
  }
  out.workingDir = expandEnv(out.workingDir);
  out.iconLocation = expandEnv(out.iconLocation);
  return out;
}

// Shell item ID list: My Computer -> drive -> folders -> file (MS-SHLLINK + libfwsi notes)
function parseIdList(b) {
  const parts = [];
  let o = 0;
  while (o + 2 <= b.length) {
    const size = b.readUInt16LE(o);
    if (size === 0) break;
    const item = b.subarray(o + 2, o + size);
    o += size;
    if (!item.length) continue;
    const type = item[0];
    if (type === 0x1f) continue; // root folder (GUID)
    if ((type & 0x70) === 0x20) { // volume
      let s = cstr(item, 1).replace(/\\?$/, '');
      if (s) parts.push(s);
      continue;
    }
    if ((type & 0x70) === 0x30) { // file entry
      const unicodeShort = !!(type & 0x04);
      let p = 12, shortName;
      if (unicodeShort) { shortName = wstr(item, p); p += (shortName.length + 1) * 2; }
      else { shortName = cstr(item, p); p += shortName.length + 1; if (p % 2) p++; }
      let longName = '';
      // extension block 0xBEEF0004
      for (let q = p; q + 8 <= item.length; q += 2) {
        if (item.readUInt32LE(q + 4) === 0xbeef0004) {
          const ver = item.readUInt16LE(q + 2);
          let lo = 18;
          if (ver >= 7) lo = 36;
          if (ver >= 3) lo += 2;
          if (ver >= 9) lo += 4;
          if (ver >= 8) lo += 4;
          if (q + lo < item.length) longName = wstr(item, q + lo);
          break;
        }
      }
      parts.push(longName || shortName);
    }
  }
  if (!parts.length) return '';
  return parts.join('\\');
}

function expandEnv(s) {
  return (s || '').replace(/%([^%]+)%/g, (m, k) => {
    const key = Object.keys(process.env).find((e) => e.toLowerCase() === k.toLowerCase());
    return key ? process.env[key] : m;
  });
}

module.exports = { parseLnk };
