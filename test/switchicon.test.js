// node test/switchicon.test.js — Switch game pictures from a dump (PFS0/XCI parsing, the dump's
// ticket, NCA header/title key/RomFS decryption with made-up keys), and pictures left in the old data folder.
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const S = require('../app/lib/switchicon.js');
const M = require('../app/lib/migrate.js');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nswicon-'));

// a PFS0 with the given files [{name, data}]
function pfs0(files) {
  const names = Buffer.concat(files.map((f) => Buffer.from(f.name + '\0')));
  const strSize = Math.ceil(names.length / 16) * 16 + 16;
  const h = Buffer.alloc(16 + files.length * 24 + strSize);
  h.write('PFS0', 0, 'latin1'); h.writeUInt32LE(files.length, 4); h.writeUInt32LE(strSize, 8);
  let off = 0, no = 0;
  files.forEach((f, i) => { const e = 16 + i * 24; h.writeBigUInt64LE(BigInt(off), e); h.writeBigUInt64LE(BigInt(f.data.length), e + 8); h.writeUInt32LE(no, e + 16); off += f.data.length; no += Buffer.byteLength(f.name) + 1; });
  names.copy(h, 16 + files.length * 24);
  return Buffer.concat([h, ...files.map((f) => f.data)]);
}
// a common ticket (RSA-2048 signature) with this rights id and title key
function ticket(rights, key) {
  const b = Buffer.alloc(0x2C0); b.writeUInt32LE(0x10004, 0);
  Buffer.from(key, 'hex').copy(b, 0x180); Buffer.from(rights, 'hex').copy(b, 0x2A0); return b;
}
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 0xFF, 0xD9]);
const RID = '0100f2c0115b60000000000000000000', TK = '00112233445566778899aabbccddeeff';

(async () => {
  const nsp = path.join(tmp, 'Game [0100F2C0115B6000][v0].nsp');
  const program = Buffer.alloc(40000, 7), control = Buffer.from('CONTROL-NCA'), legal = Buffer.from('LEGAL-NCA-LONGER-THAN-CONTROL');
  fs.writeFileSync(nsp, pfs0([{ name: 'aaaa.nca', data: program }, { name: 'bbbb.cnmt.nca', data: Buffer.from('M') }, { name: 'cccc.nca', data: legal }, { name: 'dddd.nca', data: control }, { name: `${RID}.tik`, data: ticket(RID, TK) }]));

  await ok('PFS0: names, sizes and absolute offsets', () => {
    const f = S.listFiles(nsp);
    assert.deepEqual(f.map((x) => x.name), ['aaaa.nca', 'bbbb.cnmt.nca', 'cccc.nca', 'dddd.nca', `${RID}.tik`]);
    const fd = fs.openSync(nsp, 'r'); const d = f[3]; const b = Buffer.alloc(d.size); fs.readSync(fd, b, 0, d.size, d.offset); fs.closeSync(fd);
    assert.equal(b.toString(), 'CONTROL-NCA');
  });
  await ok('XCI: root HFS0 -> secure partition', () => {
    // HFS0 entries are 0x40 bytes; root holds "secure", which holds one NCA
    const hfs0 = (files) => { const names = Buffer.concat(files.map((f) => Buffer.from(f.name + '\0'))); const h = Buffer.alloc(16 + files.length * 64 + names.length); h.write('HFS0', 0, 'latin1'); h.writeUInt32LE(files.length, 4); h.writeUInt32LE(names.length, 8); let off = 0, no = 0; files.forEach((f, i) => { const e = 16 + i * 64; h.writeBigUInt64LE(BigInt(off), e); h.writeBigUInt64LE(BigInt(f.data.length), e + 8); h.writeUInt32LE(no, e + 16); off += f.data.length; no += f.name.length + 1; }); names.copy(h, 16 + files.length * 64); return Buffer.concat([h, ...files.map((f) => f.data)]); };
    const secure = hfs0([{ name: 'eeee.nca', data: Buffer.from('X') }]);
    const root = hfs0([{ name: 'update', data: Buffer.alloc(0) }, { name: 'secure', data: secure }]);
    const head = Buffer.alloc(0xF000); head.write('HEAD', 0x100, 'latin1'); head.writeBigUInt64LE(0xF000n, 0x130);
    const x = path.join(tmp, 'g.xci'); fs.writeFileSync(x, Buffer.concat([head, root]));
    assert.deepEqual(S.listFiles(x).map((f) => f.name), ['eeee.nca']);
    assert.throws(() => S.listFiles(__filename));
  });
  await ok('ticket: rights id -> (encrypted) title key', () => {
    const k = S.ticketKeys(nsp, S.listFiles(nsp));
    assert.equal(k.get(RID).toString('hex'), TK);
  });
  await ok('keys files: name = hex lines', () => {
    const k = S.parseKeys('header_key = 00ff\r\n; comment\nTitleKek_00 = 0102\nbad = xyz\n0100aa = abcd');
    assert.equal(k.get('header_key').toString('hex'), '00ff'); assert.equal(k.get('titlekek_00').toString('hex'), '0102'); assert.ok(!k.has('bad')); assert.ok(k.has('0100aa'));
  });

  // A real-shaped dump made with made-up keys: NCA3 header (AES-XTS), a control NCA with a title key
  // from the ticket (AES-ECB with titlekek_00) and an AES-CTR RomFS; a program NCA next to it.
  const C = S._crypto; const rnd = (n) => require('crypto').randomBytes(n);
  const headerKey = rnd(32), kek = rnd(16), titleKey = rnd(16), sectionCtr = rnd(8);
  const encTitleKey = C.ecb(kek, titleKey, false);
  function romfs(files) {
    const ents = []; const datas = []; let off = 0;
    for (const [name, data] of files) { const nb = Buffer.from(name); const e = Buffer.alloc(32 + Math.ceil(nb.length / 4) * 4); e.writeUInt32LE(0, 0); e.writeUInt32LE(0xFFFFFFFF, 4); e.writeBigUInt64LE(BigInt(off), 8); e.writeBigUInt64LE(BigInt(data.length), 16); e.writeUInt32LE(nb.length, 28); nb.copy(e, 32); ents.push(e); datas.push(data, Buffer.alloc((16 - data.length % 16) % 16)); off += data.length + (16 - data.length % 16) % 16; }
    const meta = Buffer.concat(ents); const h = Buffer.alloc(0x50); h.writeBigUInt64LE(0x50n, 0);
    h.writeBigUInt64LE(0x50n, 0x38); h.writeBigUInt64LE(BigInt(meta.length), 0x40); const dataOff = 0x50 + meta.length + (16 - (0x50 + meta.length) % 16) % 16; h.writeBigUInt64LE(BigInt(dataOff), 0x48);
    return Buffer.concat([h, meta, Buffer.alloc(dataOff - 0x50 - meta.length), ...datas]);
  }
  function nca(type, rights, rom) {
    const h = Buffer.alloc(0xC00); h.write('NCA3', 0x200, 'latin1'); h[0x205] = type; h[0x206] = 0; h[0x220] = 0;
    if (rights) Buffer.from(rights, 'hex').copy(h, 0x230);
    const body = Buffer.concat([rom, Buffer.alloc((0x200 - rom.length % 0x200) % 0x200)]);
    h.writeUInt32LE(6, 0x240); h.writeUInt32LE(6 + body.length / 0x200, 0x244);
    const f = 0x400; h[f + 2] = 0; h[f + 3] = 3; h[f + 4] = 3; h.write('IVFC', f + 8, 'latin1');
    h.writeBigUInt64LE(0n, f + 0x90); h.writeBigUInt64LE(BigInt(rom.length), f + 0x98); sectionCtr.copy(h, f + 0x140);
    const c = require('crypto').createCipheriv('aes-128-ctr', titleKey, C.ctrIv(sectionCtr, 0xC00));
    return Buffer.concat([C.xts(headerKey, h, 0, false), c.update(body), c.final()]);
  }
  const nacp = Buffer.alloc(0x4000); nacp.write('The Legend of Zelda: Tears of the Kingdom', 0, 'utf8');
  const ctl = nca(2, RID, romfs([['control.nacp', nacp], ['icon_Japanese.dat', Buffer.from([0xFF, 0xD8, 9, 9])], ['icon_AmericanEnglish.dat', JPEG]]));
  const prog = nca(0, RID, romfs([['x', Buffer.from('game')]]));
  const real = path.join(tmp, 'Real [0100F2C0115B6000][v393216].nsp');
  fs.writeFileSync(real, pfs0([{ name: 'big.nca', data: Buffer.concat([prog, Buffer.alloc(300000)]) }, { name: 'm.cnmt.nca', data: Buffer.from('M') }, { name: 'ctl.nca', data: ctl }, { name: `${RID}.tik`, data: ticket(RID, encTitleKey.toString('hex')) }]));
  const keyDir = path.join(tmp, 'keys'); fs.mkdirSync(keyDir);
  fs.writeFileSync(path.join(keyDir, 'prod.keys'), `header_key = ${headerKey.toString('hex')}\ntitlekek_00 = ${kek.toString('hex')}\n`);

  await ok('extract: control NCA found by its header, title key from the ticket, RomFS icon (English first) and name', async () => {
    const out = path.join(tmp, 'out'); fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'icon.png'), 'old');
    const r = await S.extractIcon({ game: real, outDir: out, keys: { prod: path.join(keyDir, 'prod.keys'), title: [] } });
    assert.equal(r.ok, true, r.reason); assert.equal(r.from, 'ctl.nca'); assert.equal(r.title, 'The Legend of Zelda: Tears of the Kingdom');
    assert.deepEqual(fs.readFileSync(path.join(out, 'icon.jpg')), JPEG); assert.ok(!fs.existsSync(path.join(out, 'icon.png')));
  });
  await ok('extract: title key from title.keys when the dump has no ticket; clear reasons otherwise', async () => {
    const noTik = path.join(tmp, 'notik.nsp'); fs.writeFileSync(noTik, pfs0([{ name: 'ctl.nca', data: ctl }]));
    const out = path.join(tmp, 'out2');
    assert.equal((await S.extractIcon({ game: noTik, outDir: out, keys: { prod: path.join(keyDir, 'prod.keys'), title: [] } })).reason, 'no-titlekey');
    fs.writeFileSync(path.join(keyDir, 'title.keys'), `${RID} = ${encTitleKey.toString('hex')}\n`);
    assert.equal((await S.extractIcon({ game: noTik, outDir: out, keys: { prod: path.join(keyDir, 'prod.keys'), title: [path.join(keyDir, 'title.keys')] } })).ok, true);
    fs.writeFileSync(path.join(tmp, 'wrong.keys'), `header_key = ${rnd(32).toString('hex')}\n`);
    assert.equal((await S.extractIcon({ game: noTik, outDir: out, keys: { prod: path.join(tmp, 'wrong.keys'), title: [] } })).reason, 'bad-header-key');
    assert.equal((await S.extractIcon({ game: noTik, outDir: out, keys: null })).reason, 'no-keys');
    assert.ok(!fs.readdirSync(tmp).some((x) => /^dnac-nsw-/.test(x)));
  });
  await ok('keys in Eden\\user\\keys', () => {
    const eden = path.join(tmp, 'Eden');
    assert.equal(S.findKeys(eden), null);
    fs.mkdirSync(path.join(eden, 'user', 'keys'), { recursive: true }); fs.writeFileSync(path.join(eden, 'user', 'keys', 'prod.keys'), ''); fs.writeFileSync(path.join(eden, 'user', 'keys', 'title.keys_autogenerated'), '');
    assert.deepEqual(S.findKeys(eden), { prod: path.join(eden, 'user', 'keys', 'prod.keys'), title: [path.join(eden, 'user', 'keys', 'title.keys_autogenerated')] });
  });
  await ok('old data folder pictures: copied to the new folder, entries relinked, old file kept', () => {
    const o = path.join(tmp, 'Definitely Not PS5 Menu'), d = path.join(tmp, 'Definitely Not a Console');
    fs.mkdirSync(path.join(o, 'assets', 'games', 'naruto'), { recursive: true }); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(o, 'assets', 'games', 'naruto', 'icon.png'), 'i'); fs.writeFileSync(path.join(o, 'assets', 'games', 'naruto', 'cover.jpg'), 'c');
    const doc = { games: [{ id: 'naruto', icon: path.join(o, 'assets', 'games', 'naruto', 'icon.png'), cover: path.join(o, 'assets', 'games', 'naruto', 'cover.jpg') }, { id: 'x', icon: '/somewhere/else.png' }, { id: 'y', cover: path.join(o, 'assets', 'gone.jpg') }] };
    assert.equal(M.relinkArt(doc, { fromDir: o, dataDir: d }), 2);
    assert.equal(doc.games[0].icon, path.join(d, 'assets', 'games', 'naruto', 'icon.png')); assert.equal(fs.readFileSync(doc.games[0].cover, 'utf8'), 'c');
    assert.equal(doc.games[1].icon, '/somewhere/else.png'); assert.equal(doc.games[2].cover, path.join(o, 'assets', 'gone.jpg'));
    assert.ok(fs.existsSync(path.join(o, 'assets', 'games', 'naruto', 'icon.png')));
    assert.equal(M.relinkArt(doc, { fromDir: o, dataDir: d }), 0);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${n} switchicon tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
