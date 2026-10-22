# Compare a Switch HOME render with a reference at 1920x1080: SSIM and mean error, globally and per
# UI region, with masks for things that are not part of the HOME Menu (video overlays) or that we
# draw differently on purpose (our own button glyphs). usage: compare_nsw.py ref ours outprefix refname
import sys, json
import numpy as np
from PIL import Image, ImageDraw
from skimage.metrics import structural_similarity as ssim
ref_p, our_p, out, name = sys.argv[1:5]
R = Image.open(ref_p).convert('RGB').resize((1920, 1080), Image.LANCZOS); O = Image.open(our_p).convert('RGB').resize((1920, 1080), Image.LANCZOS)
r = np.asarray(R).astype(np.float32); o = np.asarray(O).astype(np.float32)
MASK = {'ref01': [(630, 30, 1440, 205), (800, 985, 1160, 1062)], 'ref02': [(630, 30, 1440, 205), (800, 985, 1160, 1062)]}.get(name, [])
GLYPH = [(368 + i * 135 + 18, 762 + 18, 368 + i * 135 + 90, 762 + 90) for i in range(9)]
if name == 'ref03':
    # same darkening as the still (everything but the focused button and its label), same rounded corners
    k = 159 / 235; keep = np.zeros(o.shape[:2], bool); yy, xx = np.ogrid[:1080, :1920]
    cx, cy = int(sys.argv[5]) if len(sys.argv) > 5 else 1176, 815
    keep |= (xx - cx) ** 2 + (yy - cy) ** 2 <= 68 ** 2
    o = np.where(keep[..., None], o, o * k)
    MASK += [(0, 0, 40, 40), (1880, 0, 1920, 40), (0, 1040, 40, 1080), (1880, 1040, 1920, 1080), (980, 880, 1380, 945), (300, 740, 1600, 960)]
for (x0, y0, x1, y1) in MASK: o[y0:y1, x0:x1] = r[y0:y1, x0:x1]
og = o.copy()
for (x0, y0, x1, y1) in GLYPH: og[y0:y1, x0:x1] = r[y0:y1, x0:x1]
g = lambda x: (0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2])
REG = {'users': (80, 40, 640, 200), 'status': (1400, 60, 1880, 140), 'title': (140, 200, 1800, 270), 'tiles': (140, 270, 1920, 700), 'icons': (350, 740, 1570, 960), 'sep': (30, 960, 1890, 980), 'bottom': (40, 985, 1880, 1065)}
res = {'global_ssim': round(float(ssim(g(r), g(o), data_range=255)), 4), 'global_mae': round(float(np.abs(r - o).mean()), 2), 'no_glyph_mae': round(float(np.abs(r - og).mean()), 2)}
for k, (x0, y0, x1, y1) in REG.items():
    res[k] = {'ssim': round(float(ssim(g(r[y0:y1, x0:x1]), g(og[y0:y1, x0:x1]), data_range=255)), 4), 'mae': round(float(np.abs(r[y0:y1, x0:x1] - og[y0:y1, x0:x1]).mean()), 2)}
diff = np.abs(g(r) - g(o)); heat = np.zeros_like(r); heat[..., 0] = np.clip(diff * 3, 0, 255); heat[..., 1] = np.clip(diff * 1.2, 0, 255) * 0.4
blend = r * 0.5 + o * 0.5
canvas = Image.new('RGB', (1920, 1080 + 40), (20, 20, 20)); d = ImageDraw.Draw(canvas)
for i, (t, l) in enumerate(zip([R, Image.fromarray(o.astype(np.uint8)), Image.fromarray(blend.astype(np.uint8)), Image.fromarray(heat.astype(np.uint8))], ['Switch reference', 'ours', '50% overlay', 'luma diff x3'])):
    x, y = (i % 2) * 960, (i // 2) * 540 + 40
    canvas.paste(t.resize((960, 540), Image.LANCZOS), (x, y)); d.text((x + 10, y - 30 if i < 2 else y + 8), l, fill=(255, 255, 0))
d.text((1000, 8), f"SSIM {res['global_ssim']:.3f}  MAE {res['global_mae']:.1f}", fill=(255, 255, 0))
canvas.save(out + '_compare.jpg', quality=88); json.dump(res, open(out + '_scores.json', 'w'), indent=1)
print(json.dumps(res))
