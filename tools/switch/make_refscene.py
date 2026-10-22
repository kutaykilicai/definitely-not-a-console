# Builds test/root-switchref<N>: a fixed Switch HOME scene that re-creates a reference frame, so
# our renderer can be diffed against it. Tile and user pictures are cut from the frame itself
# (inside the focus ring, so nothing of the ring comes along). usage: make_refscene.py ref01|ref02
import json, os, sys, shutil
import numpy as np
from PIL import Image
which = sys.argv[1] if len(sys.argv) > 1 else 'ref01'
REF = {'ref01': 'reference/switch/ref01_dark_tile_gc.png', 'ref02': 'reference/switch/ref02_dark_user_gc.png', 'ref03': 'reference/switch/ref03_white_empty_vgc_nintendo.png'}[which]
root = f'test/root-switchref-{which}'
shutil.rmtree(root, ignore_errors=True)
art = os.path.join(root, 'assets/user/scene'); os.makedirs(art); os.makedirs(os.path.join(root, 'data'))
im = Image.open(REF).convert('RGB')
def cut(name, box, size=None):
    t = im.crop(box)
    if size: t = t.resize(size, Image.LANCZOS)
    f = os.path.join(art, name + '.png'); t.save(f); return os.path.abspath(f)
X0, Y0, T, ST = 161, 291, 384, 405
tiles = []
for i in range(5):
    x = X0 + i * ST
    if x + T <= 1920: tiles.append({'image': cut(f't{i}', (x, Y0, x + T, Y0 + T)), 'title': ''})
    else:
        # the last tile runs off the screen: keep what is visible, pad the rest
        t = Image.new('RGB', (T, T), (0, 0, 0)); t.paste(im.crop((x, Y0, 1920, Y0 + T)), (0, 0)); f = os.path.join(art, f't{i}.png'); t.save(f); tiles.append({'image': os.path.abspath(f), 'title': ''})
users = []
for i in range(5):
    x = 91 + i * 108
    users.append({'image': cut(f'u{i}', (x + 4, 52 + 4, x + 87, 52 + 87), (91, 91))})
if which == 'ref03':
    # the marketing still is darkened to 159/235 everywhere but the focused button: undo it for the cut
    a = np.asarray(im).astype(np.float32) / (159 / 235); im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    users = [{'image': cut('u0', (91 + 4, 52 + 4, 91 + 87, 52 + 87), (91, 91))}]
    scene = {'theme': 'white', 'tiles': [], 'users': users, 'clock': '11:17', 'wifi': True, 'pads': 1, 'focus': {'row': 'icons', 'index': 6}, 'emptyText': 'Insert a game card or download software from Nintendo eShop.', 'hints': [['A', 'OK']]}
    settings = {'intro': 'none', 'bootIntro': 'off', 'language': 'en', 'sounds': False, 'username': 'Andy', 'switchScene': scene, 'switchTheme': 'white', 'theme': False}
    json.dump(settings, open(os.path.join(root, 'data/settings.json'), 'w'), indent=1); json.dump({'games': []}, open(os.path.join(root, 'data/games.json'), 'w')); json.dump({'console': 'switch'}, open(os.path.join(root, 'data/state.json'), 'w'))
    print(root); sys.exit(0)
scene = {'theme': 'black', 'tiles': tiles, 'users': users, 'clock': '11:59', 'battery': 0.95, 'charging': True, 'wifi': True, 'pads': 1}
if which == 'ref01':
    tiles[3]['title'] = 'YouTube'; scene['focus'] = {'row': 'games', 'index': 3}
else:
    scene['focus'] = {'row': 'user', 'index': 3}; scene['userLabel'] = "Ivan's Page"; scene['hints'] = [['A', 'OK']]
if which == 'ref01': scene['hints'] = [['menu', 'Options'], ['A', 'Start']]
settings = {'intro': 'none', 'bootIntro': 'off', 'language': 'en', 'sounds': False, 'username': 'Ivan', 'switchScene': scene, 'switchTheme': 'black', 'theme': False}
json.dump(settings, open(os.path.join(root, 'data/settings.json'), 'w'), indent=1)
json.dump({'games': []}, open(os.path.join(root, 'data/games.json'), 'w'))
json.dump({'console': 'switch'}, open(os.path.join(root, 'data/state.json'), 'w'))
print(root)
