'use strict';
// Dry run of the port updater (reads only): node ports-cli.js --games <games.json> [--ports <ports.json>] [--out result.json]
// Prints, per port: installed version (and how it was found), latest release, status, hold reasons,
// what a backup would copy and which protected files exist. Writes nothing except --out.
const fs = require('fs');
const path = require('path');
const PT = require('./ports');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };

function sizeOf(dir, prot) {
  const files = PT.walk(dir); let bytes = 0; const keep = [];
  for (const f of files) { try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* */ } if (prot(f)) keep.push(f); }
  return { files: files.length, bytes, protectedFiles: keep.length, protectedSample: keep.slice(0, 8) };
}
(async () => {
  const games = (PT.readJson(arg('games'), { games: [] }).games) || [];
  const doc = arg('ports') ? PT.readJson(arg('ports'), null) : { settings: {}, ports: PT.seedFromGames(games) };
  const cache = {}; const gh = new PT.GitHub({ fetchFn: globalThis.fetch, cache, api: process.env.PS5MENU_GH_API || 'https://api.github.com' });
  const res = await PT.checkAll(doc, { gh });
  const out = { at: new Date().toISOString(), rate: cache._rate || null, apiCalls: gh.calls, ports: [] };
  for (const r of res) {
    const p = doc.ports.find((x) => x.id === r.id);
    const plan = p && fs.existsSync(p.installDir) && arg('sizes') !== 'no' ? sizeOf(p.installDir, PT.protectedBy(p.protect)) : null;
    out.ports.push({ ...r, plan, mode: p.mode || 'notify', protect: p.protect });
  }
  const txt = JSON.stringify(out, null, 2);
  if (arg('out')) fs.writeFileSync(arg('out'), txt); else process.stdout.write(txt + '\n');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
