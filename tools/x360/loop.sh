#!/bin/sh
# Render the reference scene and score it against ref01. usage: loop.sh [tag]
cd /workspace/ps5-menu
O=shots/x360/loop; mkdir -p $O
tools/render.sh test/root-x360ref $O/ours_ref01.png '{"intro":"none","console":"x360","wait":1500}' >/dev/null 2>&1
.venv/bin/python tools/x360/compare360.py reference/x360/ref01_home_ign.png $O/ours_ref01.png $O/ref01 
.venv/bin/python tools/x360/maskcap.py reference/x360/ref01_home_ign.png $O/ours_ref01.png $O/ours_ref01_m.png
.venv/bin/python tools/x360/compare360.py reference/x360/ref01_home_ign.png $O/ours_ref01_m.png $O/ref01m | cut -c1-60
