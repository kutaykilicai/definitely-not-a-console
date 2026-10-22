#!/bin/sh
# Render the Switch reference scenes and score them. usage: tools/switch/loop.sh [ref01 ref02]
cd /workspace/ps5-menu; O=shots/switch/loop; mkdir -p $O
for R in ${@:-ref01 ref02}; do
  ROOT=$(.venv/bin/python tools/switch/make_refscene.py $R)
  tools/render.sh $ROOT $O/ours_$R.png '{"intro":"none","console":"switch","wait":1200}' >/dev/null 2>&1
  REF=$(ls reference/switch/${R}_*.png | head -1)
  .venv/bin/python tools/switch/compare_nsw.py $REF $O/ours_$R.png $O/$R $R
done
