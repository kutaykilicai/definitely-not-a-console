#!/bin/sh
# Renders the README screenshots into docs/screenshots/ (Linux box, xvfb).
# Demo games use generated art (tools/make_demo_art.py). If ART_DIR points at folders with
# icon0.png/pic0.png/pic1.png (gow3, sotc, infamous), those covers are used for three tiles.
# Nothing from ART_DIR is copied into the repo; it only ends up inside the PNGs.
set -e
R=$(cd "$(dirname "$0")/.." && pwd); O=${SHOTS_OUT:-$R/docs/screenshots}; mkdir -p "$O"
D=$(mktemp -d); mkdir -p "$D/data" "$D/assets/user/games"
"$R/.venv/bin/python" "$R/tools/make_demo_art.py" "$D/assets/user/games" 6 >/dev/null
echo '{"intro":"none","username":"Emre"}' > "$D/data/settings.json"
NOW=$(date +%s)000
A=${ART_DIR:-/nonexistent}
node -e '
const [D, A, now] = process.argv.slice(1); const fs = require("fs"); const n = Number(now), h = 3600000;
const art = (k) => fs.existsSync(A + "/" + k + "/icon0.png") ? { sceSys: A + "/" + k } : null;
const real = [
  ["infamous-second-son", "inFAMOUS Second Son", "PS4", "infamous", "D:\\Games\\Emulators\\shadPS4\\shadPS4.exe", "-g \"D:\\Games\\PS4\\CUSA00004\\eboot.bin\"", true],
  ["god-of-war-3", "God of War III Remastered", "PS4", "gow3", "D:\\Games\\God of War III\\GoW3.exe", "", false],
  ["shadow-of-the-colossus", "Shadow of the Colossus", "PS4", "sotc", "D:\\Games\\SotC\\SotC.exe", "--play", false],
].filter((g) => art(g[3])).map(([id, title, badge, k, exe, args, ls]) => ({ id, title, badge, exe, args, ...art(k), ...(ls ? { losslessScaling: true } : {}) }));
const demo = [
  { id: "gece-surusu", title: "Gece Sürüşü", badge: "PC", description: "Örnek bir oyun. Kapak ve arka plan menünün kendi demo görselleri.", exe: "D:\\Games\\Gece Surusu\\GeceSurusu.exe", args: "" },
  { id: "kiyi-kasabasi", title: "Kıyı Kasabası", badge: "PC", exe: "D:\\Games\\Kiyi\\Kiyi.exe", args: "" },
  { id: "bulmaca-kutusu", title: "Bulmaca Kutusu", badge: "PC", exe: "D:\\Games\\Bulmaca\\Bulmaca.exe", args: "" },
];
if (!real.length) demo.unshift({ id: "ornek-oyun", title: "Örnek Oyun", badge: "PC", exe: "D:\\Games\\Ornek\\Ornek.exe", args: "--fullscreen", losslessScaling: true }, { id: "dag-yolu", title: "Dağ Yolu", badge: "PC", exe: "D:\\Games\\Dag Yolu\\DagYolu.exe", args: "" });
const games = [...real, ...demo];
const st = { lastPlayed: {}, playSeconds: {} };
games.forEach((g, i) => { st.lastPlayed[g.id] = n - (i + 1) * 26 * h; st.playSeconds[g.id] = Math.round((40 - i * 6) * 3600 * (0.6 + (i % 3) * 0.3)); });
st.lastPlayed[games[0].id] = n - 2 * h;
fs.writeFileSync(D + "/data/games.json", JSON.stringify({ version: 1, games }, null, 2));
fs.writeFileSync(D + "/data/state.json", JSON.stringify(st));
' "$D" "$A" "$NOW"
rm -rf "$D/assets/user/games/ornek-oyun" "$D/assets/user/games/bulmaca-kutusu"   # one tile without art -> generated tile
[ -f "$D/data/games.json" ] && grep -q ornek-oyun "$D/data/games.json" && "$R/.venv/bin/python" "$R/tools/make_demo_art.py" "$D/assets/user/games" 1 >/dev/null || true
E=$(mktemp -d); mkdir -p "$E/data"; echo '{"intro":"none","username":"Emre"}' > "$E/data/settings.json"
cd "$R/app"
run() { PS5MENU_ROOT="$1" PS5MENU_DEMO=1 PS5MENU_FAKE_LS=1 PS5MENU_SELFTEST="$R/tools/readme_shots.js" SHOTS_DIR="$O" SHOTS_PLAN="$2" CI_NOFOCUS=1 \
  timeout 180 xvfb-run -a -s "-screen 0 1920x1080x24" ./node_modules/.bin/electron . --no-sandbox --windowed --size=1920x1080 2>&1 | grep '\[shot\]' || true; }
run "$E" '[{"name":"ilk-acilis.png"}]'
G1=$(node -e 'console.log(require(process.argv[1]).games[0].id)' "$D/data/games.json")
run "$D" '[
 {"name":"nav","frames":46,"every":90,"gap":650,"keys":["right","right","right","left","left","left"]},
 {"name":"ana-ekran.png","wait":2200},
 {"name":"oyun-detay.png","keys":["down","down"],"wait":1200,"after":"window.__ps5.dispatch(\"back\")"},
 {"name":"baslatma.png","js":"window.__ps5.launchScreen(\"art\", \"'"$G1"'\")","wait":120,"after":"window.__ps5.launchScreen(\"off\")"},
 {"name":"oyun-duzenle.png","keys":["options"],"js":"document.querySelectorAll(\"#overlay .it\")[2].click()","wait":1200,"after":"window.__ps5.dispatch(\"back\")"},
 {"name":"ayarlar.png","js":"document.querySelector(\".tb[data-t=\\\"3\\\"]\").click()","wait":1200},
 {"name":"oyunlari-yonet.png","js":"document.querySelectorAll(\"#overlay .it\")[0].click()","wait":1200,"after":"window.__ps5.dispatch(\"home\")"},
 {"name":"kutuphane.png","js":"window.__ps5.dispatch(\"home\"); const i = window.__ps5.items.findIndex((x) => x.kind === \"library\"); document.querySelectorAll(\"#row .tile\")[i].dispatchEvent(new MouseEvent(\"mousedown\")); document.querySelectorAll(\"#row .tile\")[i].dispatchEvent(new MouseEvent(\"mousedown\"))","wait":1500}
]'
rm -rf "$D" "$E"
