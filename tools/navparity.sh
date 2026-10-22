#!/bin/bash
# PS5 navigation parity with 1.3: runs test/e2e-navparity.js on 1.3 (a worktree of OLD, default
# 3677683) and on this checkout with the same test root and compares the traces step by step.
R="$(cd "$(dirname "$0")/.." && pwd)"; OLD=${OLD:-3677683}; W=/tmp/navparity-wt
[ -d $W ] || { git -C "$R" worktree add -f $W $OLD >/dev/null 2>&1; ln -sfn "$R/app/node_modules" $W/app/node_modules; }
run() { node "$R/test/setup-root.js" >/dev/null; rm -f "$R/test/root/data/state.json"; echo '{"intro":"none","bootIntro":"off","dumpRoots":[]}' > "$R/test/root/data/settings.json"
  (cd "$1" && PS5MENU_ROOT=$R/test/root PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/e2e-navparity.js PS5MENU_SELFTEST_OUT=$2 timeout 120 xvfb-run -a -s "-screen 0 1920x1080x24" ./node_modules/.bin/electron . --no-sandbox --windowed >/dev/null 2>&1); }
run $W/app /tmp/nav-old.json; run "$R/app" /tmp/nav-new.json
node -e '
const a = require("/tmp/nav-old.json"), b = require("/tmp/nav-new.json"); let bad = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || [], y = b[i] || []; if (x[0] !== y[0] || x[1] !== y[1]) { bad++; console.log("DIFF step", i, x[0], "\n  1.3:", x[1], "\n  now:", y[1]); } }
console.log(bad ? `FAIL navparity: ${bad} of ${a.length} steps differ` : `PASS navparity: ${a.length} steps identical`); process.exit(bad ? 1 : 0);'
