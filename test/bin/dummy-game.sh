#!/bin/sh
# Dummy "game" for the launch/return test: runs for $1 seconds.
# With FAKE_VISUAL=1 it also shows a real full-screen window (bright green) for the frame test.
echo "dummy game started $$ args: $*" >> /tmp/ps5menu-dummy.log
if [ -n "$FAKE_VISUAL" ]; then
  ffplay -loglevel quiet -an -noborder -left 0 -top 0 -x 1920 -y 1080 -window_title "dummy-game-$$" -f lavfi "color=c=0x00FF00:s=320x180:r=30" &
  FF=$!
  trap 'kill $FF 2>/dev/null; exit 0' TERM INT
  sleep "${1:-3}" & wait $!
  kill $FF 2>/dev/null
else
  sleep "${1:-3}"
fi
echo "dummy game exit $$" >> /tmp/ps5menu-dummy.log
