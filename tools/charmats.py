# Builds character material textures into client/vendor/textures/char/.
# Photo-scanned cloth/leather (Poly Haven, CC0) are resized to 512 and the tintable ones neutralised to grey;
# skin, hair, straw and camo are generated (no CC0 scans of those exist on Poly Haven).
import os, sys
import numpy as np
from PIL import Image, ImageFilter

D = sys.argv[1]
N = 512
rng = np.random.default_rng(7)

def save(a, name, q=84):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(D, name), quality=q)

# --- photo scans ---------------------------------------------------------
TINT = {'cotton_jersey', 'rough_linen', 'leather_white', 'velour_velvet'}
for s in ['denim_fabric', 'cotton_jersey', 'rough_linen', 'brown_leather', 'leather_white', 'velour_velvet']:
    for m in ['diff', 'nor_gl', 'rough']:
        p = os.path.join(D, f'{s}_{m}.jpg')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('L' if m == 'rough' else 'RGB').resize((N, N), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32)
        if m == 'diff' and s in TINT:  # grey with the weave contrast kept, mean ~0.86 so material colour drives the hue
            g = a.mean(axis=2)
            g = (g - g.mean()) / (g.std() + 1e-6) * 22 + 220
            a = np.stack([g, g, g], axis=2)
        if m == 'rough': a = a  # keep
        save(a, f'{s}_{m}.jpg')

# --- helpers --------------------------------------------------------------
def noise(scale, octaves=5, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((N, N), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        n = max(2, int(scale * 2 ** o))
        g = r.random((n, n)).astype(np.float32)
        g = np.tile(g, (2, 2))  # tileable by wrapping
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((2 * N, 2 * N), Image.BICUBIC)
        a = np.asarray(im).astype(np.float32)[:N, :N] / 255
        out += a * amp; tot += amp; amp *= 0.5
    return out / tot

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + 1)
    return np.stack([(-dx / l) * 127.5 + 127.5, (dy / l) * 127.5 + 127.5, (nz / l) * 127.5 + 127.5], 2)

# --- skin: mottling, freckles/pores, slight redness; height = pores + fine wrinkles ---------------
mott = noise(6, 5, 1)
red = noise(3, 4, 2)
pores = (rng.random((N, N)) < 0.035).astype(np.float32)
pores = np.asarray(Image.fromarray((pores * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9))).astype(np.float32) / 255
fine = noise(48, 3, 3)
L = 226 + (mott - 0.5) * 44 - pores * 30
skin = np.stack([L + (red - 0.5) * 30, L - 10 - (red - 0.5) * 26, L - 14 - (red - 0.5) * 20], 2)
save(skin, 'skin_diff.jpg')
save(normal_from_height(fine * 0.6 - pores * 1.2 + mott * 0.3, 3.5), 'skin_nor_gl.jpg')
save(175 + (fine - 0.5) * 60 + pores * 40, 'skin_rough.jpg')

# --- hair: long strands along V, clumped, with highlights --------------------------------------
cols = rng.random(N).astype(np.float32)
cols = np.asarray(Image.fromarray((cols * 255).astype(np.uint8)[None, :].repeat(4, 0)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)[0] / 255
clump = noise(5, 3, 4)
strand = np.tile(cols[None, :], (N, 1)) * 0.65 + noise(4, 2, 5) * 0.35
h = strand * 0.8 + clump * 0.2
save(np.stack([150 + (h - 0.5) * 190] * 3, 2), 'hair_diff.jpg')
save(normal_from_height(strand, 6), 'hair_nor_gl.jpg')

# --- woven straw ---------------------------------------------------------------------------
y, x = np.mgrid[0:N, 0:N].astype(np.float32)
cell = 32
u = (x % cell) / cell; v = (y % cell) / cell
checker = ((x // cell + y // cell) % 2).astype(np.float32)
ribH = np.sin(v * np.pi) ** 0.6; ribV = np.sin(u * np.pi) ** 0.6
hgt = np.where(checker > 0, ribH, ribV)
fib = noise(40, 2, 6)
s = hgt * 0.75 + fib * 0.25
straw = np.stack([150 + s * 95, 118 + s * 82, 62 + s * 48], 2)
save(straw, 'straw_diff.jpg')
save(normal_from_height(hgt + fib * 0.2, 5), 'straw_nor_gl.jpg')

# --- woodland hunting camo (bark + branches + leaves), cloth normal comes from cotton_jersey -------
base = noise(3, 5, 8)
img = np.stack([118 + (base - .5) * 40, 104 + (base - .5) * 36, 78 + (base - .5) * 30], 2)
im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
from PIL import ImageDraw
dr = ImageDraw.Draw(im)
for _ in range(26):  # bark trunks / branches
    x0 = rng.integers(0, N); w = rng.integers(10, 34); c = tuple(int(v) for v in rng.integers([60, 50, 38], [92, 78, 58]))
    pts = [(x0 + int(np.sin(t / 40 + x0) * 18), t) for t in range(-20, N + 40, 20)]
    dr.line(pts, fill=c, width=int(w), joint='curve')
    for _b in range(3):
        sy = rng.integers(0, N); ang = rng.uniform(-1, 1)
        dr.line([(x0, sy), (x0 + int(np.cos(ang) * 90), sy - int(abs(np.sin(ang)) * 90 + 30))], fill=c, width=max(3, int(w // 3)))
for _ in range(700):  # leaves
    cx, cy = rng.integers(0, N, 2); r = rng.integers(5, 15); a = rng.uniform(0, np.pi)
    c = [(52, 64, 34), (88, 92, 48), (124, 102, 60), (38, 34, 26), (148, 132, 92)][rng.integers(0, 5)]
    pts = [(cx + np.cos(a) * r * 1.7, cy + np.sin(a) * r * 1.7), (cx + np.cos(a + 1.57) * r * .6, cy + np.sin(a + 1.57) * r * .6),
           (cx - np.cos(a) * r * 1.7, cy - np.sin(a) * r * 1.7), (cx - np.cos(a + 1.57) * r * .6, cy - np.sin(a + 1.57) * r * .6)]
    dr.polygon(pts, fill=c)
im = im.filter(ImageFilter.GaussianBlur(0.7))
im.save(os.path.join(D, 'camo_diff.jpg'), quality=84)
print('ok')
