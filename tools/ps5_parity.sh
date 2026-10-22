#!/bin/bash
# PS5 screens pixel parity with 1.3: renders tools/x360/ps5_regress.sh with 1.3 (worktree of OLD,
# default 3677683) and with this checkout from the same test root, then compares every image.
R="$(cd "$(dirname "$0")/.." && pwd)"; OLD=${OLD:-3677683}; W=/tmp/navparity-wt
[ -d $W ] || { git -C "$R" worktree add -f $W $OLD >/dev/null 2>&1; ln -sfn "$R/app/node_modules" $W/app/node_modules; }
O=${1:-$R/shots/parity}; rm -rf "$O"; mkdir -p "$O/old" "$O/new"
fresh() { node "$R/test/setup-root.js" >/dev/null; rm -f "$R/test/root/data/state.json"; echo '{"intro":"none","bootIntro":"off","dumpRoots":[]}' > "$R/test/root/data/settings.json"; }
fresh; APPDIR=$W/app "$R/tools/x360/ps5_regress.sh" "$O/old" >/dev/null 2>&1
fresh; "$R/tools/x360/ps5_regress.sh" "$O/new" >/dev/null 2>&1; fresh
"$R/.venv/bin/python" - "$O" <<'PY'
import sys, os, numpy as np
from PIL import Image
o = sys.argv[1]; bad = 0
for f in sorted(os.listdir(f'{o}/old')):
    a = np.asarray(Image.open(f'{o}/old/{f}').convert('RGB'), int); b = np.asarray(Image.open(f'{o}/new/{f}').convert('RGB'), int)
    d = np.abs(a - b).max(2); n = int((d > 0).sum())
    print(('SAME ' if n == 0 else 'DIFF ') + f + ('' if n == 0 else f' px={n} max={d.max()}'))
    if n and f != 'tr_06_settings.png': bad += 1
print('PASS ps5 parity (settings row expected)' if not bad else f'FAIL ps5 parity: {bad} screens differ'); sys.exit(1 if bad else 0)
PY
