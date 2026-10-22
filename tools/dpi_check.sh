#!/bin/bash
# Renders PS5 and Xbox 360 home screens at other resolutions / Windows scaling and compares each one,
# scaled to 1920x1080, with the 1920x1080 @100 % render (layout must be the same, only sharper/softer).
# usage: tools/dpi_check.sh [outdir]
R=/workspace/ps5-menu; O=${1:-$R/shots/dpi}; mkdir -p "$O"; cd "$R/app"
node "$R/test/setup-x360-root.js" >/dev/null
ROOT=$R/test/root-x360
shot() { # name size dpr state
  PS5MENU_SHOT_DPR=$3 PS5MENU_ROOT=$ROOT timeout 60 xvfb-run -a -s "-screen 0 4000x2400x24" ./node_modules/.bin/electron . --no-sandbox --screenshot="$O/$1.png" --size="$2" --state="$4" >/dev/null 2>&1; }
P='{"intro":"none","row":1,"zone":"row","clock":"12:00","wait":1500}'
X='{"intro":"none","console":"x360","clock":"12:00","wait":1800}'
# name: physical resolution and Windows scaling; size is the logical window size
for c in "1080p_100 1920x1080 1" "1080p_125 1536x864 1.25" "1080p_150 1280x720 1.5" "1440p_100 2560x1440 1" "1440p_125 2048x1152 1.25" "1440p_150 1707x960 1.5"; do
  set -- $c; shot ps5_$1 $2 $3 "$P"; shot x360_$1 $2 $3 "$X"
done
# other screen shapes: the Xbox 360 frame must be centred and fully visible
for c in "21x9 2560x1080" "16x10 1920x1200" "5x4 1280x1024"; do set -- $c; shot x360_$1 $2 1 "$X"; done
python3 - "$O" <<'PY'
import sys, os
from PIL import Image, ImageChops, ImageStat
o = sys.argv[1]; bad = 0
for k in ('ps5', 'x360'):
    ref = Image.open(f'{o}/{k}_1080p_100.png').convert('RGB')
    for n in ('1080p_125', '1080p_150', '1440p_100', '1440p_125', '1440p_150'):
        im = Image.open(f'{o}/{k}_{n}.png').convert('RGB')
        sz = im.size; im = im.resize(ref.size, Image.LANCZOS)
        d = ImageChops.difference(ref, im).convert('L')
        mean = ImageStat.Stat(d).mean[0]; big = sum(d.point(lambda v: 255 if v > 64 else 0).histogram()[255:]) / (ref.size[0] * ref.size[1]) * 100
        ok = mean < 4 and big < 1.5; bad += not ok
        print(f"{'OK  ' if ok else 'DIFF'} {k} {n} {sz[0]}x{sz[1]} mean {mean:.2f} >64: {big:.2f} %")
for n in ('21x9', '16x10', '5x4'):
    im = Image.open(f'{o}/x360_{n}.png').convert('RGB'); W, H = im.size; px = im.load()
    xs = [x for x in range(0, W, 2) for y in (int(H * 0.45), int(H * 0.6)) if (lambda p: p[1] > 110 and p[0] < 40 and p[2] < 40)(px[x, y])]
    l, r = (min(xs), max(xs)) if xs else (0, 0)
    ok = bool(xs) and l > 4 and r < W - 4; bad += not ok
    print(f"{'OK  ' if ok else 'DIFF'} x360 {n} {W}x{H} home tiles x {l}..{r}")
sys.exit(1 if bad else 0)
PY
