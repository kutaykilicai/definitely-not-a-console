#!/bin/bash
# Records the screen while test/e2e-visual.js runs the launch / hold Esc / Devam Et flow with real
# windows (Linux, Xvfb, ffmpeg, ffplay, xdotool), then checks every frame: tools/frame_check.py.
# Usage: tools/frame_test.sh [outdir]
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"; O="${1:-/tmp/ps5menu-frames}"; mkdir -p "$O"
node "$R/test/setup-root.js" >/dev/null
cat > "$O/inner.sh" <<INNER
#!/bin/bash
xsetroot -solid magenta
ffplay -loglevel quiet -an -noborder -left 200 -top 150 -x 1400 -y 750 -window_title other-app -f lavfi "color=c=0xFF8000:s=320x180:r=30" & OTHER=\$!
sleep 1.5
ffmpeg -loglevel info -y -use_wallclock_as_timestamps 1 -f x11grab -framerate 30 -video_size 1920x1080 -i "\$DISPLAY" -vf scale=192:108,showinfo -copyts -fps_mode passthrough -f rawvideo -pix_fmt rgb24 "$O/frames.rgb" 2> "$O/ffmpeg.log" & REC=\$!
sleep 0.5; date +%s%3N > "$O/rec_start"
cd "$R/app" && FAKE_VISUAL=1 PS5MENU_DEBUG=1 PS5MENU_ROOT="$R/test/root" PS5MENU_FAKE_HELPER="$R/test/fake-helper.js" PS5MENU_SELFTEST="$R/test/e2e-visual.js" PS5MENU_SELFTEST_OUT="$O/visual.json" timeout 120 ./node_modules/.bin/electron . --no-sandbox --size=1920x1080 > "$O/app.log" 2>&1
sleep 1; kill -INT \$REC; wait \$REC; kill \$OTHER; pkill -f "window_title dummy-game" ; pkill -f fake-ls-output; true
INNER
chmod +x "$O/inner.sh"
xvfb-run -a -s "-screen 0 1920x1080x24" "$O/inner.sh"
python3 "$R/tools/frame_check.py" "$O"
