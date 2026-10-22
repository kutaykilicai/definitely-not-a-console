#!/bin/bash
# Records test/demo-150.js on a virtual screen: tools/demo_video.sh <out.mp4>
# Sound only when PulseAudio is installed (null sink); otherwise a silent video.
R="$(cd "$(dirname "$0")/.." && pwd)"; OUT=${1:-/tmp/demo-150.mp4}; D=:97
QR=$(node "$R/test/setup-qa-root.js" theme);
python3 - "$QR" <<'PY'
import json,sys,time,os
qr=sys.argv[1]; sp=os.path.join(qr,'data','state.json'); st=json.load(open(sp)) if os.path.exists(sp) else {}
now=time.time()*1000; H=3600e3; D=86400e3
st.update({'console':'ps5','focusId':'muz-a','lastPlayed':{'muz-a':now-2*H,'muz-b':now-D,'muz-x':now-3*D},'playSeconds':{'muz-a':12*3600,'muz-b':3*3600,'muz-x':5400},
  'sessions':[{'id':'muz-a','end':now-3*D,'sec':7200},{'id':'muz-b','end':now-D,'sec':3600},{'id':'muz-a','end':now-2*H,'sec':5400},{'id':'muz-x','end':now-3*D,'sec':5400}]})
json.dump(st,open(sp,'w'))
PY
Xvfb $D -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 & XP=$!; sleep 1
AUD=(); if command -v pulseaudio >/dev/null; then pulseaudio --daemonize=yes --exit-idle-time=-1 >/dev/null 2>&1; pactl load-module module-null-sink sink_name=demo >/dev/null 2>&1; pactl set-default-sink demo; AUD=(-f pulse -i demo.monitor); fi
cd "$R/app"
DISPLAY=$D PS5MENU_FFMPEG=$R/test/fake-ffmpeg.sh PS5MENU_ROOT="$QR" PS5MENU_FAKE_HELPER=$R/test/fake-helper.js PS5MENU_SELFTEST=$R/test/demo-150.js ./node_modules/.bin/electron . --no-sandbox --windowed --size=1920x1080 > /tmp/demo-150.log 2>&1 & EP=$!
until grep -q "\[demo\] start" /tmp/demo-150.log 2>/dev/null; do sleep 0.2; kill -0 $EP 2>/dev/null || break; done
ffmpeg -loglevel error -y -f x11grab -framerate 30 -video_size 1920x1080 -i $D "${AUD[@]}" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p ${AUD:+-c:a aac -b:a 160k} "$OUT" & FP=$!
wait $EP; sleep 0.5; kill -INT $FP; wait $FP; kill $XP
grep "\[demo\]" /tmp/demo-150.log
