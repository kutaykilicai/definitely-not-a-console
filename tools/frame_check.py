#!/usr/bin/env python3
"""Checks the frames recorded by tools/frame_test.sh. Every frame is sorted by what fills it:
game (green), lsout (blue, Lossless Scaling's output), black (cover), menu, and LEAK when the
desktop (magenta) or another app (orange) shows, UNREADY for a game window
that is still loading (dark red, progress test). "white" is an Electron window mapped on
Xvfb before its first frame (no compositor there); it is reported separately. Prints the sequence for launch, hold and resume."""
import json, re, sys
import numpy as np

d = sys.argv[1]
W, H = 192, 108
raw = np.fromfile(f'{d}/frames.rgb', dtype=np.uint8)
n = raw.size // (W * H * 3)
frames = raw[: n * W * H * 3].reshape(n, H, W, 3).astype(int)
ts = [float(m) * 1000 for m in re.findall(r'pts_time:([0-9.]+)', open(f'{d}/ffmpeg.log').read())][:n]
info = json.load(open(f'{d}/visual.json'))
marks = info['marks']

def classify(f):
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    frac = lambda m: float(m.mean())
    c = {
        'leak': frac((r > 190) & (g < 70) & (b > 190)) + frac((r > 190) & (g > 90) & (g < 170) & (b < 70)),
        'game': frac((r < 70) & (g > 190) & (b < 70)),
        'lsout': frac((r < 70) & (g < 70) & (b > 190)),
        'black': frac((r < 16) & (g < 16) & (b < 16)),
        # the progress test's game window while it still loads (dark red): must never be seen
        'unready': frac((r > 100) & (r < 160) & (g < 30) & (b < 30)),
        # a freshly mapped Electron window on Xvfb (no compositor) is white until its first frame
        'white': frac((r > 235) & (g > 235) & (b > 235)),
    }
    if c['leak'] > 0.005: return 'LEAK', c
    if c['unready'] > 0.005: return 'UNREADY', c
    for k in ('lsout', 'game', 'black', 'white'):
        if c[k] > 0.97: return k, c
    return 'menu', c

labels = [classify(f) for f in frames]
def segment(name, a, b, final=None):
    idx = [i for i, t in enumerate(ts) if a <= t <= b]
    seq = []
    for i in idx:
        l = labels[i][0]
        if seq and seq[-1][0] == l: seq[-1][1] += 1
        else: seq.append([l, 1])
    leaks = sum(1 for i in idx if labels[i][0] in ('LEAK', 'UNREADY'))
    gaps = [ts[j] - ts[i] for i, j in zip(idx, idx[1:])]
    print(f'{name}: {len(idx)} frames, {leaks} leak frames, max frame gap {max(gaps or [0]):.0f} ms')
    print('   ' + ' -> '.join(f'{l} x{c}' for l, c in seq))
    if final:
        hit = next((ts[i] for i in idx if labels[i][0] == final), None)
        print(f'   first "{final}" frame {hit - a:.0f} ms after the action' if hit else f'   no "{final}" frame')
    return leaks

print(f'{n} frames recorded ({(ts[-1] - ts[0]) / 1000:.1f} s)' if ts else 'no frames')
total = 0
if 'p_launch' in marks:   # tools/frame_test.sh progress
    total += segment('launch with loading progress', marks['p_launch'], marks['p_cover_gone'] + 1500, 'game')
    for note in info.get('notes', []): print('note:', note)
    for r in info.get('results', []): print('check:', 'PASS' if r[1] else 'FAIL', r[0])
    print('RESULT:', 'no leak frames' if total == 0 else f'{total} LEAK/UNREADY frames')
    sys.exit(1 if total else 0)
total += segment('launch', marks['launch'], marks['launch_cover_gone'] + 1500, 'lsout')
total += segment('hold Esc', marks['hold'], marks['hold_paused'] + 1500, 'menu')
total += segment('Devam Et', marks['resume'], marks['resume_cover_gone'] + 1500, 'lsout')
if 'hold2' in marks: total += segment('hold Esc again', marks['hold2'], marks['hold2'] + 2500, 'menu')
for note in info.get('notes', []): print('note:', note)
print('RESULT:', 'no leak frames' if total == 0 else f'{total} LEAK frames')
sys.exit(1 if total else 0)
