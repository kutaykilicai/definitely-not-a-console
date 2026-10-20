#!/bin/sh
# Dummy "game" for the launch/return test: runs for $1 seconds.
# With FAKE_VISUAL=1 it also shows a real full-screen window (bright green) for the frame test.
# Loading before the first picture (like a shader cache rebuilt at start), extra arguments:
#   log=<file>  writes a log there as it goes (the previous one becomes <file>.1)
#   warm=<s>    seconds of loading; the window is dark red meanwhile (must never be seen)
#   mode=marker the log only says "GPU: window and Vulkan presenter ready" at the end
#   mode=percent the log also prints "Compiling shaders NN%" ten times on the way
#   mode=stall  the log stops after its first line and the game never gets ready (runs $1 s)
#   die=<s>     the game ends after that many seconds of loading
echo "dummy game started $$ args: $*" >> /tmp/ps5menu-dummy.log
SECS=${1:-3}; LOG=; WARM=0; MODE=marker; DIE=
for a in "$@"; do case "$a" in log=*) LOG=${a#log=};; warm=*) WARM=${a#warm=};; mode=*) MODE=${a#mode=};; die=*) DIE=${a#die=};; esac; done
FF=
show() {   # $1 colour
  [ -n "$FAKE_VISUAL" ] || return 0
  OLD=$FF
  # Opened off screen and moved in place once the harness has put it below the menu (X has no
  # always-on-top; on Windows a new window never covers the topmost menu).
  ffplay -loglevel quiet -an -noborder -left 4000 -top 0 -x 1920 -y 1080 -window_title "dummy-game-$$" -f lavfi "color=c=$1:s=320x180:r=30" &
  FF=$!
  sleep 0.5; xdotool search --name "^dummy-game-$$\$" 2>/dev/null | while read -r W; do xdotool windowmove "$W" 0 0; done
  if [ -n "$OLD" ]; then sleep 0.4; kill "$OLD" 2>/dev/null; fi
}
trap 'kill $FF 2>/dev/null; exit 0' TERM INT
if [ -n "$LOG" ]; then
  mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] && mv "$LOG" "$LOG.1"
  echo "Settings: dummy" > "$LOG"
  show 0x800000
  if [ -n "$DIE" ]; then sleep "$DIE" & wait $!; kill $FF 2>/dev/null; echo "dummy game exit $$" >> /tmp/ps5menu-dummy.log; exit 3; fi
  if [ "$MODE" = stall ]; then sleep "$SECS" & wait $!; kill $FF 2>/dev/null; echo "dummy game exit $$" >> /tmp/ps5menu-dummy.log; exit 0; fi
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
