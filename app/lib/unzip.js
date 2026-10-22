'use strict';
// Minimal ZIP reader for port updates (stored and deflate entries, ZIP64 sizes). Original code.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function findEocd(fd, size) {
  const n = Math.min(size, 65557 + 22); const buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, size - n);
  for (let i = n - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return { buf, i, base: size - n };
  throw new Error('zip: end of central directory not found');
}
function entries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const { buf, i, base } = findEocd(fd, size);
    let count = buf.readUInt16LE(i + 10), cdSize = buf.readUInt32LE(i + 12), cdOff = buf.readUInt32LE(i + 16);
    if (cdOff === 0xffffffff || count === 0xffff) {
      // ZIP64 end of central directory locator just before the EOCD
      const loc = i - 20;
      if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
        const z64 = Number(buf.readBigUInt64LE(loc + 8)); const h = Buffer.alloc(56); fs.readSync(fd, h, 0, 56, z64);
        count = Number(h.readBigUInt64LE(32)); cdSize = Number(h.readBigUInt64LE(40)); cdOff = Number(h.readBigUInt64LE(48));
      }
    }
    void base;
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = []; let p = 0;
    for (let k = 0; k < count; k++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory');
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      let off = cd.readUInt32LE(p + 42);
      const name = cd.slice(p + 46, p + 46 + nl).toString(flags & 0x800 ? 'utf8' : 'latin1');
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2); let q = x + 4;
        if (id === 1) { if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; } if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; } if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); } }
        x += 4 + len;
      }
      out.push({ name, method, csize, usize, off, dir: name.endsWith('/'), encrypted: !!(flags & 1) });
      p = xe + cl;
    }
    return out;
  } finally { fs.closeSync(fd); }
}
// Safe relative path inside the target (no "..", no drive letters, no absolute paths).
function safeRel(name) {
  const parts = name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
  if (parts.some((s) => s === '..' || /:/.test(s))) return null;
  return parts.join(path.sep);
}
function extract(file, dest) {
  const list = entries(file); const fd = fs.openSync(file, 'r'); const written = [];
  try {
    for (const e of list) {
      const rel = safeRel(e.name); if (!rel) throw new Error(`zip: unsafe path ${e.name}`);
      const out = path.join(dest, rel);
      if (e.dir) { fs.mkdirSync(out, { recursive: true }); continue; }
      if (e.encrypted) throw new Error(`zip: encrypted entry ${e.name}`);
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, e.off);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('zip: bad local header');
      const start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const data = Buffer.alloc(e.csize); if (e.csize) fs.readSync(fd, data, 0, e.csize, start);
      let body;
      if (e.method === 0) body = data; else if (e.method === 8) body = zlib.inflateRawSync(data); else throw new Error(`zip: method ${e.method} not supported (${e.name})`);
      if (body.length !== e.usize) throw new Error(`zip: size mismatch ${e.name}`);
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, body); written.push(rel);
    }
  } finally { fs.closeSync(fd); }
  return written;
}
module.exports = { entries, extract, safeRel };
