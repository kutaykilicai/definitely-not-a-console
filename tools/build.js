// Builds the Windows installer (NSIS, per-user) and the portable zip into dist/.
// Needs dl/electron-v<ver>-win32-x64.zip (from github.com/electron/electron/releases) and
// tools/node/node_modules (resedit, pe-library). Run: node tools/build.js
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ver = require(path.join(ROOT, 'app/node_modules/electron/package.json')).version;
const zip = path.join(ROOT, 'dl', `electron-v${ver}-win32-x64.zip`);
const dist = path.join(ROOT, 'dist', 'electron-win');
if (!fs.existsSync(zip)) { console.error('missing', zip); process.exit(1); }
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist, { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', dist]);
execFileSync(path.join(ROOT, 'app/node_modules/.bin/electron-builder'), ['--win', '--x64', '--publish', 'never'], { cwd: path.join(ROOT, 'app'), stdio: 'inherit' });
