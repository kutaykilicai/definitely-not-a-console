# Generic placeholder art for the demo/test games and the README screenshot. Everything is drawn
# here from gradients and shapes; the game names are made up.
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
FONT = os.path.join(os.path.dirname(__file__), '..', 'app', 'assets', 'fonts', 'NotoSans-Variable.ttf')
def font(sz, w=800):
    f = ImageFont.truetype(FONT, sz)
    try: f.set_variation_by_axes([w, 100])
    except Exception: pass
    return f
def grad(w, h, c0, c1):
    im = Image.new('RGB', (w, h)); px = im.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
        for x in range(w): px[x, y] = c
    return im
def scene(w, h, seed, c0, c1, accent):
    rnd = random.Random(seed)
    im = grad(w, h, c0, c1).convert('RGBA')
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(glow)
    for _ in range(14):
        r = rnd.randint(h // 12, h // 3); x = rnd.randint(0, w); y = rnd.randint(0, h)
        d.ellipse((x - r, y - r, x + r, y + r), fill=accent + (rnd.randint(25, 70),))
    glow = glow.filter(ImageFilter.GaussianBlur(h // 18)); im = Image.alpha_composite(im, glow)
    hills = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(hills)
    for k in range(3):
        base = h * (0.62 + 0.12 * k); amp = h * 0.06; ph = rnd.random() * 6
        pts = [(x, base + amp * math.sin(x / w * 6.3 * (1 + k * 0.6) + ph)) for x in range(0, w + 10, 10)]
        shade = tuple(int(v * (0.5 - 0.15 * k)) for v in c1)
        d.polygon(pts + [(w, h), (0, h)], fill=shade + (235,))
    return Image.alpha_composite(im, hills).convert('RGB')
GAMES = [
    ('ornek-oyun', 'Örnek Oyun', 1, (40, 70, 140), (10, 14, 32), (120, 170, 255)),
    ('gece-surusu', 'Gece Sürüşü', 2, (90, 30, 110), (12, 8, 24), (255, 110, 190)),
    ('kiyi-kasabasi', 'Kıyı Kasabası', 3, (30, 120, 120), (8, 26, 30), (255, 210, 140)),
    ('dag-yolu', 'Dağ Yolu', 4, (150, 80, 40), (24, 12, 8), (255, 180, 90)),
    ('yildiz-limani', 'Yıldız Limanı', 5, (20, 40, 90), (2, 4, 14), (160, 220, 255)),
    ('son-istasyon', 'Son İstasyon', 6, (60, 90, 50), (8, 14, 8), (210, 255, 160)),
]
def main(out, n=3):
    for gid, title, seed, c0, c1, acc in GAMES[:n]:
        d = os.path.join(out, gid); os.makedirs(d, exist_ok=True)
        scene(1920, 1080, seed, c0, c1, acc).save(os.path.join(d, 'background.jpg'), quality=88)
        ic = scene(512, 512, seed + 10, c0, c1, acc)
        ic.save(os.path.join(d, 'icon.jpg'), quality=90)
if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'test/root/assets/user/games', int(sys.argv[2]) if len(sys.argv) > 2 else 3)
