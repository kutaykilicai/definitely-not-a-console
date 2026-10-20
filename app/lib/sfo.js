'use strict';
// PS4 param.sfo reader (TITLE, TITLE_ID, APP_VER, CONTENT_ID).
const fs = require('fs');
function readSfo(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46535000) throw new Error('bad sfo');
  const keyTable = b.readUInt32LE(8), dataTable = b.readUInt32LE(12), n = b.readUInt32LE(16);
  const out = {};
  for (let i = 0; i < n; i++) {
    const e = 20 + i * 16;
    const kOff = b.readUInt16LE(e), fmt = b.readUInt16LE(e + 2), len = b.readUInt32LE(e + 4), dOff = b.readUInt32LE(e + 12);
    let k = keyTable + kOff, ke = k; while (b[ke]) ke++;
    const key = b.subarray(k, ke).toString('utf8');
    const d = dataTable + dOff;
    if (fmt === 0x0404) out[key] = b.readUInt32LE(d);
    else out[key] = b.subarray(d, d + len).toString('utf8').replace(/\0+$/, '');
  }
  return out;
}
module.exports = { readSfo };
