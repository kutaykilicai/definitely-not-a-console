#!/bin/sh
# usage: boot_e2e.sh synth|video  — fresh root each run, then test/e2e-boot.js
M=${1:-synth}
cd /workspace/ps5-menu/app && R=$(node ../test/setup-boot-root.js $M) && \
BOOT_E2E=$M PS5MENU_ROOT=$R PS5MENU_SELFTEST=/workspace/ps5-menu/test/e2e-boot.js PS5MENU_SELFTEST_OUT=/workspace/ps5-menu/shots/x360/e2e-boot-$M.json \
  timeout 120 xvfb-run -a -s "-screen 0 1920x1080x24" ./node_modules/.bin/electron . --no-sandbox --windowed 2>&1 | grep "e2e-boot"
