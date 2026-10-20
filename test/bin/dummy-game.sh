#!/bin/sh
# Dummy "game" for the launch/return test: runs for $1 seconds.
# With FAKE_VISUAL=1 it also shows a real full-screen window (bright green) for the frame test.
# Loading before the first picture (like a shader cache rebuilt at start), extra arguments:
#   log=<file>  writes a log there as it goes (the previous one becomes <file>.1)
#   warm=<s>    seconds of loading; the window is dark red meanwhile (must never be seen)
#   mode=marker the log only says "GPU: window and Vulkan presenter ready" at the end
#   mode=percent the log also prints "Compiling shaders NN%" ten times on the way
echo "dummy game started $$ args: $*" >> /tmp/ps5menu-dummy.log
SECS=${1:-3}; LOG=; WARM=0; MODE=marker
for a in "$@"; do case "$a" in log=*) LOG=${a#log=};; warm=*) WARM=${a#warm=};; mode=*) MODE=${a#mode=};; esac; done
FF=
show() {   # $1 colour
  [ -n "$FAKE_VISUAL" ] || return 0
  OLD=$FF
  ffplay -loglevel quiet -an -noborder -left 0 -top 0 -x 1920 -y 1080 -window_title "dummy-game-$$" -f lavfi "color=c=$1:s=320x180:r=30" &
  FF=$!
  if [ -n "$OLD" ]; then sleep 0.4; kill "$OLD" 2>/dev/null; fi
}
trap 'kill $FF 2>/dev/null; exit 0' TERM INT
if [ -n "$LOG" ]; then
  mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] && mv "$LOG" "$LOG.1"
  echo "Settings: dummy" > "$LOG"
  show 0x800000
  i=1
  while [ "$i" -le 10 ]; do
    sleep "$(awk "BEGIN{print $WARM/10}")" & wait $!
    [ "$MODE" = percent ] && echo "Compiling shaders $((i * 10))%" >> "$LOG"
    i=$((i + 1))
  done
  echo "GPU: window and Vulkan presenter ready; dummy" >> "$LOG"
fi
show 0x00FF00
sleep "$SECS" & wait $!
kill $FF 2>/dev/null
[ -n "$LOG" ] && echo "[exit code 0 = 0x0]" >> "$LOG"
echo "dummy game exit $$" >> /tmp/ps5menu-dummy.log
