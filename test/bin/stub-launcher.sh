#!/bin/sh
# Launcher stub: starts the real game in the background and exits at once (like SotC.exe --play).
D=$(dirname "$0")
nohup "$D/dummy-game.sh" "${1:-4}" >/dev/null 2>&1 &
exit 0
