// Writes /tmp/ps5menu-boot-<mode>: a copy of test/root-x360 with the boot intros on. mode "video"
// also copies the user's own intro videos from BOOT_FILES (never part of the repo) and intro.json.
const fs = require('fs'); const path = require('path');
const mode = process.argv[2] || 'synth';
const src = path.join(__dirname, 'root-x360'); const dst = `/tmp/ps5menu-boot-${mode}`;
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.includes(`${path.sep}electron`) });
const set = path.join(dst, 'data', 'settings.json'); const s = JSON.parse(fs.readFileSync(set, 'utf8'));
Object.assign(s, { bootIntro: 'once', intro: 'none', sounds: true }); delete s.x360Scene;
fs.writeFileSync(set, JSON.stringify(s, null, 2));
fs.writeFileSync(path.join(dst, 'data', 'state.json'), JSON.stringify({ console: 'ps5' }));
const intro = path.join(dst, 'intro'); fs.mkdirSync(intro, { recursive: true });
// video: the user's videos + logos; logo: only the logos (drawn intros with the user's marks).
const from = process.env.BOOT_FILES || '/workspace/ps5-menu-intro-user';
const files = { video: ['ps5-boot.mp4', 'x360-boot.mp4', 'switch-boot.mp4', 'ps5-logo.png', 'x360-logo.png', 'switch-logo.png'], logo: ['ps5-logo.png', 'x360-logo.png', 'switch-logo.png'] }[mode] || [];
for (const f of files) if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(intro, f));
if (mode === 'video') fs.copyFileSync(path.join(__dirname, '..', 'install', 'intro.json'), path.join(intro, 'intro.json'));
console.log(dst);
