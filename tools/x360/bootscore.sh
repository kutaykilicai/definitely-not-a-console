#!/bin/sh
# Render boot intro frames at fixed player times and score them against the user's video frames.
# usage: bootscore.sh <kind> <outdir> <root> t1 t2 ...
KIND=$1; OUT=$2; ROOTD=$3; shift 3
mkdir -p "$OUT"
n=0
for t in "$@"; do /workspace/ps5-menu/tools/render.sh "$ROOTD" "$OUT/${KIND}_$t.png" "{\"boot\":{\"kind\":\"$KIND\",\"t\":$t},\"wait\":200}" >/dev/null 2>&1 & n=$((n+1)); if [ $n -ge 6 ]; then wait; n=0; fi; done; wait
/workspace/ps5-menu/.venv/bin/python /workspace/ps5-menu/tools/x360/bootscore.py "$KIND" "$OUT" "$@"
