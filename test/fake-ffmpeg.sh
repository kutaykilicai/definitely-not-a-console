#!/bin/bash
# Test stand-in for ffmpeg: "converts" snd0.at9 by writing a sine tone to the output (last argument).
# It logs every call to $FAKE_FFMPEG_LOG.
out="${@: -1}"; echo "$*" >> "${FAKE_FFMPEG_LOG:-/tmp/fake-ffmpeg.log}"
sleep "${FAKE_FFMPEG_DELAY:-0.5}"
case " $* " in *" libopus "*) [ -n "$FAKE_FFMPEG_NOOPUS" ] && exit 1;; esac
exec ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=660:duration=20" -c:a libvorbis -f ogg "$out"
