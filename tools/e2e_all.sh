#!/bin/bash
# Runs every test: unit tests, then each Electron end-to-end test under Xvfb with the environment it
# needs (fresh test roots each time). Prints one line per suite and exits non-zero if any failed.
# usage: tools/e2e_all.sh [suite ...]   (default: all)
R="$(cd "$(dirname "$0")/.." && pwd)"; O=${E2E_OUT:-/tmp/e2e-all}; mkdir -p "$O"
ALL="unit e2e-launch e2e-home e2e-seamless e2e-progress e2e-x360 qa-corrupt qa-baddata qa-single qa-bootoff qa-empty qa-many qa-flow qa-close qa-close360 qa-trim qa-beyond qa-lists qa-theme migrate boot-synth boot-logo boot-video"
SUITES="${*:-$ALL}"; FAIL=0
X() { timeout ${TMO:-240} xvfb-run -a -s "-screen 0 ${SCREEN:-1920x1080x24}" "$@"; }
fresh() { node "$R/test/setup-root.js" >/dev/null; rm -f "$R/test/root/data/state.json"; echo '{"intro":"none","bootIntro":"off","dumpRoots":[]}' > "$R/test/root/data/settings.json"; }
res() { # name log pattern-ok
  if grep -aq "$3" "$2" && ! grep -aq "\] FAIL\|\] ERROR" "$2"; then echo "PASS $1 $(grep -ao "$3" "$2" | tail -1)"; else echo "FAIL $1 $(grep -a "\] FAIL\|\] ERROR\|checks\|done" "$2" | head -4 | tr '\n' ' ')"; FAIL=1; fi; }
cd "$R/app"
for S in $SUITES; do
  L="$O/$S.log"
  case $S in
    unit) : > "$L"; for t in unit x360 homeflow loadprogress winwatch qa; do [ -f "$R/test/$t.test.js" ] && node "$R/test/$t.test.js" >> "$L" 2>&1 || { [ -f "$R/test/$t.test.js" ] && echo "FAIL $t" >> "$L"; }; done
          if grep -q "FAIL\|Error" "$L"; then echo "FAIL unit"; FAIL=1; else echo "PASS unit $(grep -c passed "$L") files"; fi; continue;;
    e2e-launch) fresh; PS5MENU_ROOT=$R/test/root PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/$S.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --windowed > "$L" 2>&1;;
    e2e-home|e2e-progress|e2e-seamless) fresh; FAKE_VISUAL=1 PS5MENU_DEBUG=1 PS5MENU_ROOT=$R/test/root PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/$S.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --size=1920x1080 > "$L" 2>&1;;
    e2e-x360) node "$R/test/setup-x360-root.js" >/dev/null; PS5MENU_ROOT=$R/test/root-x360 PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/e2e-x360.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --windowed > "$L" 2>&1;;
    qa-close360) QR=$(node "$R/test/setup-qa-root.js" close); QA_CLOSE_AT=x360 QA_MODE=close PS5MENU_ROOT="$QR" PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/e2e-qa.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --windowed > "$L" 2>&1;;
    qa-*) M=${S#qa-}; if [ "$M" = soak ] || [ "$M" = fuzz ]; then export TMO=900; else export TMO=240; fi; QR=$(node "$R/test/setup-qa-root.js" $M); rm -f "$O/$S-ffmpeg.log"; PS5MENU_FFMPEG=$R/test/fake-ffmpeg.sh FAKE_FFMPEG_LOG=$O/$S-ffmpeg.log QA_MODE=$M PS5MENU_ROOT="$QR" PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/e2e-qa.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --windowed --size=${QA_SIZE:-1920x1080} > "$L" 2>&1;;
    migrate) MB=$(node "$R/test/setup-migrate-root.js"); (cd "$MB/Definitely Not PS5 Menu" && find . -type f | sort | while read f; do echo "$f"; done) >/dev/null
             python3 -c "import hashlib,os,sys
b=sys.argv[1]; h=hashlib.sha1()
def walk(p):
  for n in sorted(os.listdir(p)):
    f=os.path.join(p,n); h.update(f.encode())
    if os.path.isdir(f): walk(f)
    else: h.update(open(f,'rb').read())
walk(b+'/Definitely Not PS5 Menu'); open(b+'/old.sha1','w').write(h.hexdigest())" "$MB"
             : > "$L"; for st in 1 2; do [ $st = 2 ] && python3 -c "import json,sys;f=sys.argv[1];d=json.load(open(f));d['games'].append({'id':'sonradan','title':'S','exe':'/x'});json.dump(d,open(f,'w'))" "$MB/Definitely Not PS5 Menu/games.json"
               MIG_STEP=$st XDG_CONFIG_HOME="$MB" PS5MENU_FAKE_REG="$MB/run.json" PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/e2e-migrate.js PS5MENU_SELFTEST_OUT=$O/$S-$st.json X ./node_modules/.bin/electron . --no-sandbox --windowed >> "$L" 2>&1; done
             n=$(grep -ao "\] done [0-9]*/[0-9]*" "$L" | awk -F'[ /]' '{p+=$3; t+=$4} END {print p"/"t}'); grep -aq "\] FAIL" "$L" || [ $(grep -ac "\] done" "$L") -ne 2 ] && { echo "FAIL migrate $(grep -a '\] FAIL' "$L" | head -3 | tr '\n' ' ')"; FAIL=1; } || echo "PASS migrate done $n"; continue;;
    boot-*) M=${S#boot-}; BR=$(node "$R/test/setup-boot-root.js" $M); BOOT_E2E=$M PS5MENU_ROOT=$BR PS5MENU_SELFTEST=$R/test/e2e-boot.js PS5MENU_SELFTEST_OUT=$O/$S.json X ./node_modules/.bin/electron . --no-sandbox --windowed > "$L" 2>&1;;
  esac
  case $S in boot-*|qa-*) res $S "$L" "done [0-9]*/[0-9]*";; *) res $S "$L" "[0-9]*/[0-9]* checks passed";; esac
done
fresh
exit $FAIL
