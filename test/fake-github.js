'use strict';
// Fake GitHub (API + release downloads + an RSS feed) for the updater tests. Not a copy of GitHub:
// only the fields the updater reads. state: { repos: { 'o/r': { releases: [...], issues: [...] } },
// files: { '/dl/x.zip': Buffer }, rss: '<rss…>', remaining: 60 }
const http = require('http');
const crypto = require('crypto');
function start(state, port = 0) {
  state.log = state.log || [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); state.log.push(`${req.method} ${u.pathname}${u.search}`);
    const send = (code, body, h = {}) => { res.writeHead(code, h); res.end(body); };
    let m;
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/(releases|issues)$/.exec(u.pathname))) {
      const repo = (state.repos || {})[m[1]]; if (!repo) return send(404, '{}');
      const data = m[2] === 'releases' ? repo.releases : (repo.issues || []).filter((i) => !u.searchParams.get('since') || i.updated_at >= u.searchParams.get('since') || i.created_at >= u.searchParams.get('since'));
      const body = JSON.stringify(data); const etag = `"${crypto.createHash('sha1').update(body).digest('hex')}"`;
      if (req.headers['if-none-match'] === etag) return send(304, '', { ETag: etag, 'x-ratelimit-remaining': String(state.remaining ?? 60), 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) });
      if ((state.remaining ?? 60) <= 0) return send(403, '{"message":"API rate limit exceeded"}', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) });
      state.remaining = (state.remaining ?? 60) - 1;
      return send(200, body, { 'Content-Type': 'application/json', ETag: etag, 'x-ratelimit-remaining': String(state.remaining), 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) });
    }
    if ((m = /^\/download\/(.+)$/.exec(u.pathname))) return send(302, '', { Location: `/cdn/${m[1]}` });
    if ((m = /^\/cdn\/(.+)$/.exec(u.pathname))) { const f = (state.files || {})[`/${decodeURIComponent(m[1])}`]; if (!f) return send(404, 'no'); if (state.slowMs) return setTimeout(() => send(200, f, { 'Content-Length': f.length }), state.slowMs); return send(200, f, { 'Content-Length': f.length }); }
    if (u.pathname === '/rss.xml') return send(200, state.rss || '<rss><channel></channel></rss>', { 'Content-Type': 'application/rss+xml' });
    send(404, 'not found');
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((c) => srv.close(c)) })));
}
// a release with one zip asset (digest included unless noDigest)
function release(base, { tag, name, files, published, prerelease = false, noDigest = false, body = '', sidecar = false }) {
  const zipw = require('./zipw'); const buf = zipw(files); const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const assets = [{ name, size: buf.length, browser_download_url: `${base}/download/${tag}/${name}`, ...(noDigest ? {} : { digest: `sha256:${sha}` }) }];
  const extra = { [`/${tag}/${name}`]: buf };
  if (sidecar) { assets.push({ name: `${name}.sha256`, size: 90, browser_download_url: `${base}/download/${tag}/${name}.sha256` }); extra[`/${tag}/${name}.sha256`] = Buffer.from(`${sha}  ${name}\n`); }
  return { rel: { tag_name: tag, name: tag, draft: false, prerelease, published_at: published, html_url: `${base}/r/${tag}`, body, assets }, files: extra, sha };
}
module.exports = { start, release };
if (require.main === module) {
  // standalone: node fake-github.js state.json [port] -> prints the url
  const fs = require('fs'); const st = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (const [k, v] of Object.entries(st.filesB64 || {})) { st.files = st.files || {}; st.files[k] = Buffer.from(v, 'base64'); }
  start(st, Number(process.argv[3] || 0)).then((s) => console.log(s.url));
}
