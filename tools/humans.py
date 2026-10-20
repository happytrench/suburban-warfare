#!/usr/bin/env python3
"""Generates the game's realistic characters from the CC0 MakeHuman base mesh.

    python3 -I tools/humans.py <makehuman/data dir> <out dir> [archetype ...]

For each archetype:
  1. morph the base mesh with MakeHuman targets (gender/age/muscle/weight macros + body/face detail)
  2. rig it to the Mixamo skeleton the game's mocap uses: bone lengths come from the morphed body,
     bone orientations from the mocap rest pose, so the animation clips play on it unchanged
  3. pose the mesh from MakeHuman's rest pose into the mocap T-pose with linear blend skinning
  4. cut clothing shells (pants, shirts, boots, hair, beards...) from the body surface
  5. paint a per-character skin texture in the body's UV atlas (brows, lips, stubble, blush)
  6. write <arch>.json (bones, primitives, metrics) + <arch>.bin + <arch>_skin.jpg

MakeHuman assets: CC0 (released September 2020 by Data Collection AB).
"""
import json, os, sys, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
MH = sys.argv[1]
OUT = sys.argv[2]
ONLY = set(sys.argv[3:])
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------------ base mesh
def load_obj(path):
    V, VT, F, FT, G = [], [], [], [], []
    g = None
    for l in open(path):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('g '): g = l.split()[1]
        elif l.startswith('f '):
            p = [q.split('/') for q in l.split()[1:]]
            F.append([int(q[0]) - 1 for q in p]); FT.append([int(q[1]) - 1 if len(q) > 1 and q[1] else 0 for q in p]); G.append(g)
    return np.array(V), np.array(VT), F, FT, G

BV, BVT, BF, BFT, BG = load_obj(f'{MH}/3dobjs/base.obj')
NV = len(BV)

_tcache = {}
def target(rel):
    if rel in _tcache: return _tcache[rel]
    d = np.zeros((NV, 3))
    p = f'{MH}/targets/{rel}.target'
    for l in open(p):
        if not l.strip() or l[0] == '#': continue
        s = l.split(); d[int(s[0])] = [float(s[1]), float(s[2]), float(s[3])]
    _tcache[rel] = d
    return d

def tverts(rel, frac=0.3):
    d = np.linalg.norm(target(rel), axis=1)
    return d > d.max() * frac

def macro(gender, age, muscle, weight, height=0.5):
    """MakeHuman macro modifier blend (caucasian)."""
    gw = {'female': 1 - gender, 'male': gender}
    a = age
    # age value: 1y=0, 11y=0.1875, 25y=0.5, 90y=1
    av = (a - 1) / (11 - 1) * 0.1875 if a < 11 else 0.1875 + (a - 11) / 14 * 0.3125 if a < 25 else 0.5 + (a - 25) / 65 * 0.5
    if av < 0.1875: aw = {'baby': 1 - av / 0.1875, 'child': av / 0.1875}
    elif av < 0.5: aw = {'child': 1 - (av - 0.1875) / 0.3125, 'young': (av - 0.1875) / 0.3125}
    else: aw = {'young': 1 - (av - 0.5) * 2, 'old': (av - 0.5) * 2}
    def tri(v, lo, mid, hi):
        return {lo: 1 - v * 2, mid: v * 2} if v < 0.5 else {mid: 1 - (v - 0.5) * 2, hi: (v - 0.5) * 2}
    mw = tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle')
    ww = tri(weight, 'minweight', 'averageweight', 'maxweight')
    d = np.zeros((NV, 3))
    for g, gv in gw.items():
        for ag, agv in aw.items():
            if gv * agv <= 0: continue
            d += gv * agv * target(f'macrodetails/caucasian-{g}-{ag}')
            for m, mv in mw.items():
                for w, wv in ww.items():
                    k = gv * agv * mv * wv
                    if k <= 0: continue
                    d += k * target(f'macrodetails/universal-{g}-{ag}-{m}-{w}')
                    if height != 0.5:
                        hk = 'maxheight' if height > 0.5 else 'minheight'
                        d += k * abs(height - 0.5) * 2 * target(f'macrodetails/height/{g}-{ag}-{m}-{w}-{hk}')
    return d

# ------------------------------------------------------------------ skeletons
SK = json.load(open(f'{MH}/rigs/default.mhskel'))
WT = json.load(open(f'{MH}/rigs/default_weights.mhw'))['weights']
TPL = json.load(open(os.path.join(HERE, 'mixamo_skeleton.json')))
TB = {b['name'][9:]: b for b in TPL['bones']}  # strip 'mixamorig'
TNAMES = [b['name'][9:] for b in TPL['bones']]

def joint(V, name):
    return V[SK['joints'][name]].mean(axis=0)

def bhead(V, b): return joint(V, SK['bones'][b]['head'])
def btail(V, b): return joint(V, SK['bones'][b]['tail'])

FING = {1: 'Thumb', 2: 'Index', 3: 'Middle', 4: 'Ring', 5: 'Pinky'}
def mixamo_of(mh):
    """MakeHuman bone -> Mixamo bone that should carry its skin weights."""
    side = 'Left' if mh.endswith('.L') else 'Right' if mh.endswith('.R') else ''
    n = mh[:-2] if side else mh
    if n in ('root', 'spine05') or n.startswith('pelvis'): return 'Hips'
    if n == 'spine04': return 'Spine'
    if n == 'spine03': return 'Spine1'
    if n in ('spine02', 'spine01') or n.startswith('breast'): return 'Spine2'
    if n in ('neck01', 'neck02'): return 'Neck'
    if n.startswith('upperleg'): return side + 'UpLeg'
    if n.startswith('lowerleg'): return side + 'Leg'
    if n == 'foot': return side + 'Foot'
    if n.startswith('toe'): return side + 'ToeBase'
    if n in ('clavicle', 'shoulder01'): return side + 'Shoulder'
    if n.startswith('upperarm'): return side + 'Arm'
    if n.startswith('lowerarm'): return side + 'ForeArm'
    if n == 'wrist' or n.startswith('metacarpal'): return side + 'Hand'
    if n.startswith('finger'):
        f, s = n[6:].split('-'); return f'{side}Hand{FING[int(f)]}{s}'
    return 'Head'  # neck03, head, jaw, eyes, all face bones

def mh_points(V):
    """Joint positions (MakeHuman space) for every Mixamo bone."""
    P = {'Hips': bhead(V, 'root'), 'Spine': bhead(V, 'spine04'), 'Spine1': bhead(V, 'spine03'), 'Spine2': bhead(V, 'spine02'),
         'Neck': bhead(V, 'neck01'), 'Head': bhead(V, 'head'), 'HeadTop_End': btail(V, 'head')}
    for S, s in (('Left', 'L'), ('Right', 'R')):
        P[S + 'Shoulder'] = bhead(V, f'clavicle.{s}'); P[S + 'Arm'] = bhead(V, f'upperarm01.{s}')
        P[S + 'ForeArm'] = bhead(V, f'lowerarm01.{s}'); P[S + 'Hand'] = bhead(V, f'wrist.{s}')
        for f, nm in FING.items():
            for k in (1, 2, 3): P[f'{S}Hand{nm}{k}'] = bhead(V, f'finger{f}-{k}.{s}')
            P[f'{S}Hand{nm}4'] = btail(V, f'finger{f}-3.{s}')
        P[S + 'UpLeg'] = bhead(V, f'upperleg01.{s}'); P[S + 'Leg'] = bhead(V, f'lowerleg01.{s}')
        P[S + 'Foot'] = bhead(V, f'foot.{s}'); P[S + 'ToeBase'] = btail(V, f'foot.{s}')
        P[S + 'Toe_End'] = btail(V, f'toe3-2.{s}') if f'toe3-2.{s}' in SK['bones'] else btail(V, f'toe1-2.{s}')
    return P

PRIMARY = {'Hips': 'Spine', 'Spine2': 'Neck', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1'}
CHILDREN = {}
for n in TNAMES:
    p = TB[n]['parent']
    if p: CHILDREN.setdefault(p[9:], []).append(n)

def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])
def qrot(q, v):
    u = np.array(q[:3]); w = q[3]
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)
def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def arc(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    c = np.cross(a, b); d = np.dot(a, b)
    if d < -0.9999: return np.array([0, 0, 1.0, 0])
    q = np.array([c[0], c[1], c[2], 1 + d]); return q / np.linalg.norm(q)

# ------------------------------------------------------------------ build one character
def build(spec):
    V = BV + macro(**spec['macro'])
    for rel, w in spec.get('targets', []): V = V + w * target(rel)
    P = mh_points(V)
    # uniform scale (MakeHuman decimetres -> mocap units) so hip height above the soles matches the mocap
    body_idx = np.array(sorted({v for f, g in zip(BF, BG) if g == 'body' for v in f}))
    sole = V[body_idx, 1].min()
    s = TB['Hips']['world'][1] / (P['Hips'][1] - sole)
    V = V * s; P = {k: v * s for k, v in P.items()}
    sole *= s
    # new skeleton: mocap rest orientations, MakeHuman bone lengths
    local, world, wq = {}, {}, {}
    for n in TNAMES:
        b = TB[n]; par = b['parent'][9:] if b['parent'] else None
        if par is None:
            local[n] = np.array(b['pos']); world[n] = np.array([0, P['Hips'][1] - sole, 0.0]); local[n] = world[n].copy()
            wq[n] = np.array(b['quat'])
        else:
            tp = np.array(b['pos']); L = np.linalg.norm(P[n] - P[par]) if n in P and par in P else np.linalg.norm(tp)
            local[n] = tp / (np.linalg.norm(tp) + 1e-9) * L
            world[n] = world[par] + qrot(wq[par], local[n])
            wq[n] = qmul(wq[par], np.array(b['quat']))
    # per-bone rigid transforms MakeHuman rest -> mocap T-pose
    Q, T0, T1 = {}, {}, {}
    for n in TNAMES:
        if n not in P: continue
        kids = [c for c in CHILDREN.get(n, []) if c in P]
        c = PRIMARY.get(n) or (kids[0] if kids else None)
        Q[n] = arc(P[c] - P[n], world[c] - world[n]) if c and n not in ('Hips', 'Spine', 'Spine1') else np.array([0, 0, 0, 1.0])
        T0[n] = P[n]; T1[n] = world[n]
    # skin weights in mixamo bones
    names = [n for n in TNAMES if n in Q]
    bi = {n: i for i, n in enumerate(names)}
    W = np.zeros((NV, len(names)))
    for mhb, lst in WT.items():
        j = bi[mixamo_of(mhb)]
        for v, w in lst: W[v, j] += w
    ws = W.sum(1); orphan = ws < 1e-6
    W[orphan, bi['Head']] = 1; W /= W.sum(1, keepdims=True)
    # LBS into T-pose
    Vt = np.zeros_like(V)
    for n in names:
        j = bi[n]; m = W[:, j] > 0
        if not m.any(): continue
        Vt[m] += W[m, j:j + 1] * ((V[m] - T0[n]) @ qmat(Q[n]).T + T1[n])
    return dict(V=Vt, W=W, names=names, bones={n: local[n].tolist() for n in TNAMES}, world=world, s=s)

# ------------------------------------------------------------------ geometry helpers
def body_faces(groups=('body',)):
    return [(f, ft) for f, ft, g in zip(BF, BFT, BG) if g in groups]

def vnormals(V, faces):
    N = np.zeros_like(V)
    for f, _ in faces:
        for k in range(1, len(f) - 1):
            a, b, c = V[f[0]], V[f[k]], V[f[k + 1]]
            n = np.cross(b - a, c - a); N[f[0]] += n; N[f[k]] += n; N[f[k + 1]] += n
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9)

def tris_of(faces):
    out = []
    for f, ft in faces:
        for k in range(1, len(f) - 1): out.append(((f[0], f[k], f[k + 1]), (ft[0], ft[k], ft[k + 1])))
    return out

class Prim:
    """Collects triangles with split (vertex, uv) corners."""
    def __init__(self, name, mat): self.name, self.mat, self.key, self.pos, self.nrm, self.uv, self.sk, self.idx, self.ao = name, mat, {}, [], [], [], [], [], []
    def add(self, tri, uvt, P, N, UV, W, off=None, A=None):
        for v, t in zip(tri, uvt):
            k = (v, t)
            if k not in self.key:
                self.key[k] = len(self.pos)
                p = P[v] + (N[v] * (off[v] if off is not None else 0))
                self.pos.append(p); self.nrm.append(N[v]); self.uv.append(UV[t]); self.sk.append(W[v]); self.ao.append(1.0 if A is None else A[v])
            self.idx.append(self.key[k])
    def raw(self, p, n, uv, w, ao=1.0):
        self.pos.append(p); self.nrm.append(n); self.uv.append(uv); self.sk.append(w); self.ao.append(ao)
        return len(self.pos) - 1

def bake_ao(V, N, faces, nbs, mask=None):
    """Cheap ambient occlusion: concavity over a few rings + nearby surface in front of each vertex."""
    from scipy.spatial import cKDTree
    used = np.zeros(len(V), bool)
    for f, _ in faces: used[f] = True
    idx = np.nonzero(used)[0]
    P = V.copy()
    cav = np.zeros(len(V))
    for _ in range(3):  # multi-ring average position
        P2 = P.copy()
        for i in idx:
            n = nbs[i]
            if len(n): P2[i] = P[n].mean(0)
        P = P2
    cav[idx] = ((P[idx] - V[idx]) * N[idx]).sum(1)          # >0: vertex sits in a dent / crease
    tree = cKDTree(V[idx])
    prox = np.zeros(len(V))
    for j, i in enumerate(idx):
        near = tree.query_ball_point(V[i], 6.0)
        if len(near) < 2: continue
        d = V[idx[near]] - V[i]
        front = (d @ N[i]) > 0.8
        dist = np.linalg.norm(d[front], axis=1) if front.any() else np.array([])
        prox[i] = np.clip((1 - dist / 6.0), 0, 1).sum() / 25.0
    ao = 1 - np.clip(cav * 0.9, 0, 0.45) - np.clip(prox, 0, 0.45)
    return np.clip(ao, 0.35, 1.0)

def top4(w):
    i = np.argsort(-w)[:4]; ww = w[i]; ww = ww / ww.sum()
    q = np.round(ww * 255).astype(int); q[0] += 255 - q.sum()
    return i, q

# ------------------------------------------------------------------ painting the skin atlas
TEX = 1024
def paint(img, tris, VT, val, color):
    """Fill each atlas triangle with color at alpha = mean vertex value."""
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for (v, t) in tris:
        a = (val[v[0]] + val[v[1]] + val[v[2]]) / 3
        if a <= 0.01: continue
        pts = [(VT[k][0] * TEX, (1 - VT[k][1]) * TEX) for k in t]
        d.polygon(pts, fill=color + (int(min(1, a) * 255),))
    return lay

def speckle(lay, density, seed):
    """Break a flat paint layer into hair-like speckles."""
    a = np.asarray(lay).astype(np.float32)
    r = np.random.default_rng(seed).random(a.shape[:2])
    a[..., 3] *= (r < density)
    return Image.fromarray(a.astype(np.uint8))

def eye_tex(path, iris):
    n = 256; yy, xx = np.mgrid[0:n, 0:n] / (n - 1) - 0.5; r = np.hypot(xx, yy)
    rgb = np.stack([np.full((n, n), 236.0), np.full((n, n), 230.0), np.full((n, n), 222.0)], 2)
    rgb -= (r > 0.3)[..., None] * np.clip((r - 0.3) * 120, 0, 40)[..., None] * np.array([0.3, 1, 1])   # pinkish edge
    ic = np.array(hexc(iris), float); ang = np.arctan2(yy, xx)
    fib = 0.75 + 0.25 * np.sin(ang * 40 + r * 30) * np.cos(ang * 13)
    ir = 0.245; m = r < ir
    shade = np.clip(1.15 - r / ir * 0.6, 0.4, 1.2)[..., None] * fib[..., None]
    rgb[m] = (ic * shade[m].reshape(-1, 1))[...]
    rgb[(r > ir - 0.012) & (r < ir)] = 40           # limbal ring
    rgb[r < 0.095] = 8                               # pupil
    hl = np.hypot(xx + 0.05, yy - 0.06) < 0.03; rgb[hl] = 250
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(path, quality=90)

# ------------------------------------------------------------------ characters
CHAR = {
    'bubba': dict(height=1.83, belt=True, macro=dict(gender=1, age=38, muscle=0.55, weight=1.0), targets=[('stomach/stomach-pregnant-incr', 0.9), ('bodyshapes/bodyshapes-elvs-man-apple', 0.8), ('neck/neck-double-incr', 1), ('head/head-fat-incr', 0.6)],
                  skin='#e8b08f', flush=0.55, hair=('mullet', '#6b4423'), beard=('full', '#6b4423'), brows='#5a3a20',
                  clothes=[('tank', 'jersey', '#ece9df', 0.35), ('pants', 'denim', '#ffffff', 0.55), ('boots', 'leather', '#9a6a48', 0.9)]),
    'cletus': dict(height=1.93, macro=dict(gender=1, age=29, muscle=0.35, weight=0.0, height=0.9), targets=[('stomach/stomach-pregnant-decr', 0.4), ('l-ear', 0), ('ears/l-ear-wing-incr', 1), ('ears/r-ear-wing-incr', 1), ('chin/chin-prominent-decr', 0.6), ('nose/nose-hump-incr', 0.8)],
                   skin='#e6ae8a', flush=0.4, tan=True, hair=('short', '#a0703e'), stubble=0.5, brows='#7a5530',
                   clothes=[('overalls', 'denim', '#c9d6e6', 0.6), ('boots', 'leather', '#7a5638', 0.9)]),
    'darlene': dict(height=1.65, macro=dict(gender=0, age=33, muscle=0.5, weight=0.6), targets=[],
                    skin='#efc0a2', flush=0.3, lips='#b0505a', hair=('teased', '#e2bd6c'), brows='#8a6a40',
                    clothes=[('crop', 'camo', '#ffffff', 0.35), ('jorts', 'denim', '#e2ecf5', 0.5), ('boots_high', 'leather', '#c98a5a', 0.8)]),
    'hank': dict(height=1.8, macro=dict(gender=1, age=56, muscle=0.6, weight=0.85), targets=[('stomach/stomach-pregnant-incr', 0.8), ('bodyshapes/bodyshapes-elvs-man-apple', 0.5), ('neck/neck-double-incr', 0.7), ('nose/nose-scale-horiz-incr', 0.6)],
                 skin='#dda083', flush=0.7, hair=('short', '#8c8680'), mustache=('handlebar', '#8a7f74'), stubble=0.6, brows='#6f665e',
                 clothes=[('shirt_long', 'flannel', '#ffffff', 0.45), ('pants', 'denim', '#9fb0c4', 0.55), ('boots', 'leather', '#8a6040', 0.9)]),
    'jimbo': dict(height=1.78, sole='#dcdcd6', macro=dict(gender=1, age=44, muscle=0.5, weight=0.75), targets=[('stomach/stomach-pregnant-incr', 0.55), ('bodyshapes/bodyshapes-elvs-man-apple', 0.4)],
                  skin='#e6ac88', flush=0.5, hair=('short', '#5a4030'), beard=('goatee', '#5a4030'), stubble=0.6, brows='#4a3020',
                  clothes=[('shirt_short', 'camo', '#ffffff', 0.4), ('shorts', 'linen', '#6b6a4a', 0.55), ('boots_high', 'rubber', '#eeeeea', 0.9)]),
    'chad': dict(height=1.86, collar=True, sole='#f2efe8', macro=dict(gender=1, age=26, muscle=1.0, weight=0.45), targets=[('torso/torso-vshape-incr', 1), ('torso/torso-muscle-pectoral-incr', 0.6), ('chin/chin-prominent-incr', 0.8), ('chin/chin-width-incr', 0.6), ('head/head-square', 0.6)],
                 skin='#e9b48c', flush=0.25, tan=True, hair=('slick', '#d2ad55'), brows='#a07a3a',
                 clothes=[('shirt_short', 'jersey', '#9fd3f0', 0.4), ('shorts', 'linen', '#f4978e', 0.5), ('shoes', 'leather', '#b07a4a', 0.7)]),
    'karen': dict(height=1.68, belt=False, sole='#f2f2f2', macro=dict(gender=0, age=46, muscle=0.45, weight=0.4), targets=[('chin/chin-triangle', 0.4)],
                  skin='#f2cdb4', flush=0.25, lips='#b4636c', hair=('bob', '#e6cf96'), brows='#9a8050',
                  clothes=[('shirt_long', 'knit', '#c4b5fd', 0.45), ('leggings', 'jersey', '#26262c', 0.25), ('shoes', 'wleather', '#ffffff', 0.7)]),
    'golfdad': dict(height=1.78, collar=True, sole='#d8d8d8', beltColor='#1f2937', macro=dict(gender=1, age=58, muscle=0.5, weight=0.72), targets=[('stomach/stomach-pregnant-incr', 0.6), ('neck/neck-double-incr', 0.4)],
                    skin='#e6b494', flush=0.6, hair=('horseshoe', '#a3a3a3'), mustache=('push', '#8f8f8f'), brows='#8a8a8a',
                    clothes=[('shirt_short', 'jersey', '#1e3a5f', 0.4), ('pants', 'linen', '#d6c7a1', 0.5), ('shoes', 'wleather', '#ffffff', 0.7)]),
    'brad': dict(height=1.8, sole='#f5f5f5', macro=dict(gender=1, age=29, muscle=0.6, weight=0.35), targets=[('chin/chin-width-incr', 0.4)],
                 skin='#ecbd98', flush=0.25, hair=('bun', '#3b2a1e'), stubble=0.75, brows='#3b2a1e',
                 clothes=[('shirt_long', 'linen', '#bcd4ee', 0.4), ('vest', 'knit', '#1f2a44', 0.9), ('pants', 'linen', '#4b5563', 0.45), ('shoes', 'wleather', '#ffffff', 0.7)]),
    'todd': dict(height=1.7, macro=dict(gender=1, age=62, muscle=0.4, weight=0.8, height=0.3), targets=[('stomach/stomach-pregnant-incr', 0.75), ('neck/neck-double-incr', 0.8), ('head/head-round', 0.5)],
                 skin='#eec1a2', flush=0.55, hair=('horseshoe', '#6b5a48'), brows='#6b5a48',
                 clothes=[('shirt_long', 'knit', '#a68a64', 0.6), ('pants', 'linen', '#cbbd94', 0.5), ('shoes', 'leather', '#7a4a2c', 0.7)]),
}

# regions that never get hair or clothes
EAR = tverts('ears/l-ear-scale-incr', 0.15) | tverts('ears/r-ear-scale-incr', 0.15)
BROW = tverts('eyebrows/eyebrows-trans-up', 0.7)
LIPS = tverts('mouth/mouth-lowerlip-volume-incr', 0.35) | tverts('mouth/mouth-upperlip-volume-incr', 0.35)
NOSE = tverts('nose/nose-scale-horiz-incr', 0.3)

def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def make_char(arch, spec):
    R = build(spec)
    V, W, names, world = R['V'], R['W'], R['names'], R['world']
    bi = {n: i for i, n in enumerate(names)}
    G = lambda *ns: sum(W[:, bi[n]] for n in ns if n in bi)
    faces = body_faces(); N = vnormals(V, faces)
    y, x, z = V[:, 1], V[:, 0], V[:, 2]
    ax = np.abs(x)
    J = {k: np.array(v) for k, v in world.items()}
    waist = (J['Spine'][1] + J['Hips'][1]) / 2 + 2
    knee, ankle = J['LeftLeg'][1], J['LeftFoot'][1]
    neck, chest = J['Neck'][1], J['Spine2'][1]
    sh, el, wr = abs(J['LeftArm'][0]), abs(J['LeftForeArm'][0]), abs(J['LeftHand'][0])
    head = J['Head']; top = J['HeadTop_End']
    armish = G('LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm') > 0.5
    handish = G(*[n for n in names if 'Hand' in n]) > 0.3
    headish = G('Head') > 0.5
    legish = y < waist
    torso_band = (~legish) & (y < neck - 1.5) & ~headish
    # hair/beard geometry helpers (head-local, +z face)
    hz = z - head[2]; hy = y - head[1]
    face_front = hz > 4
    brow_y = V[BROW, 1].mean() if BROW.any() else head[1] + 9
    mouth_y = V[LIPS, 1].mean() if LIPS.any() else head[1] + 2
    nose_y = V[NOSE, 1].mean() if NOSE.any() else head[1] + 5
    ear_z = V[EAR, 2].mean() - head[2] if EAR.any() else 0
    EYEV = np.array(sorted({v for f, g in zip(BF, BG) if g in ('helper-l-eye', 'helper-r-eye') for v in f}))
    eye_y, eye_z = V[EYEV, 1].mean(), V[EYEV, 2].max()
    BR = BROW & (y > eye_y + 1.2) & (y < eye_y + 5)

    sel = {}
    def region(kind):
        if kind == 'pants': return legish & (y > ankle + 4) & ~handish
        if kind == 'leggings': return legish & (y > ankle + 2) & ~handish
        if kind == 'shorts': return legish & (y > knee + 7) & ~handish
        if kind == 'jorts': return legish & (y > knee + 17) & ~handish
        if kind == 'boots': return y < ankle + 12
        if kind == 'boots_high': return y < ankle + 26
        if kind == 'shoes': return y < ankle + 3.5
        sleeves = {'shirt_long': wr - 2, 'shirt_short': sh + (el - sh) * 0.55, 'tank': 0, 'crop': sh + (el - sh) * 0.15, 'vest': 0}.get(kind)
        if sleeves is not None:
            t = (y > waist - 7) & (y < neck - 1.5) & ~headish & ~handish
            if kind == 'crop': t &= y > waist + 12
            if kind in ('tank', 'vest'):
                t &= ax < sh - (4 if kind == 'tank' else 1.5)
                if kind == 'tank':
                    cz = J['Spine2'][2]
                    t &= ~((ax > 10.5) & (y > chest - 3))                                  # arm holes
                    t &= ~((ax < 6.5) & (y > chest + 6) & (z > cz))                        # front scoop
                    t &= ~((ax < 6.5) & (y > chest + 10) & (z < cz))                       # back scoop
            else: t &= ~armish | (ax < sleeves)
            return t
        if kind == 'overalls':
            bib = (~legish) & (y < chest + 7) & (z > J['Spine1'][2]) & (ax < 11) & ~armish
            straps = (~legish) & (np.abs(ax - 8) < 2.2) & (y < neck - 2) & ~armish & ~headish
            return (legish & (y > ankle + 4) & ~handish) | bib | straps
        raise KeyError(kind)

    CL = {
        'pants': [('ymin', ankle + 4)], 'leggings': [('ymin', ankle + 2)], 'shorts': [('ymin', knee + 7)], 'jorts': [('ymin', knee + 17)], 'overalls': [('ymin', ankle + 4)],
        'boots': [('ymax', ankle + 12)], 'boots_high': [('ymax', ankle + 26)], 'shoes': [('ymax', ankle + 4)],
        'shirt_long': [('ymin', waist - 7), ('axmax', wr - 2)], 'shirt_short': [('ymin', waist - 7), ('axmax', sh + (el - sh) * 0.55)],
        'crop': [('ymin', waist + 12), ('axmax', sh + (el - sh) * 0.15)], 'tank': [('ymin', waist - 7)], 'vest': [('ymin', waist - 7)],
    }
    SMOOTH = {'pants': 7, 'shorts': 7, 'jorts': 6, 'overalls': 8, 'leggings': 5, 'boots': 12, 'boots_high': 12, 'shoes': 14,
              'shirt_long': 9, 'shirt_short': 9, 'crop': 7, 'tank': 7, 'vest': 8}
    prims = []
    covered = np.zeros(len(V), bool)
    garments = []
    THICK = {'pants': 0.9, 'shorts': 1.1, 'jorts': 0.9, 'overalls': 1.1, 'leggings': 0.45, 'boots': 1.1, 'boots_high': 1.1, 'shoes': 1.3,
             'shirt_long': 1.3, 'shirt_short': 1.3, 'crop': 0.6, 'tank': 1.05, 'vest': 2.1}
    for kind, mat, color, thick in spec['clothes']:
        thick = THICK.get(kind, thick)
        m = region(kind)
        off = np.full(len(V), thick)
        if kind in ('boots', 'boots_high'): off = thick + np.clip((y - ankle) / 30, 0, 1) * 0.6
        garments.append((kind, mat, color, m, off))
        if kind != 'vest': covered |= m  # vest goes over a shirt, don't hide what is below
    # hair & beard shells
    hair_kind, hair_col = spec.get('hair', ('none', '#000'))
    scalp = headish & ~EAR & ~(face_front & (y < brow_y + 2.5)) & (hy > -4 + np.clip(-hz, 0, 9) * -0.6)
    scalp &= ~((hz > -2) & (y < brow_y + 1))
    hair_m = np.zeros(len(V), bool); hair_off = np.zeros(len(V))
    if hair_kind in ('short', 'slick', 'mullet', 'bun', 'bob', 'teased'):
        hair_m = scalp.copy(); hair_off[:] = {'short': 0.55, 'slick': 0.75, 'mullet': 0.6, 'bun': 0.6, 'bob': 1.2, 'teased': 1.0}[hair_kind]
        hair_off += np.clip((y - brow_y) / 10, 0, 1) * {'slick': 0.6, 'teased': 4.0, 'bob': 1.0}.get(hair_kind, 0.2)
        if hair_kind == 'mullet':
            back = (hz < ear_z - 1) & (y > neck - 8) & ~armish & (G('Neck', 'Head', 'Spine2') > 0.5) & (z < J['Neck'][2])
            hair_m |= back; hair_off = np.where(back & ~scalp, 1.4, hair_off)
        if hair_kind in ('bob', 'teased'):
            sides = headish & (hz < 2) & (y > mouth_y - (3 if hair_kind == 'bob' else 8)) & ~face_front
            hair_m |= sides; hair_off = np.where(sides & ~scalp, 1.6 if hair_kind == 'bob' else 2.6, hair_off)
    elif hair_kind == 'horseshoe':
        hair_m = scalp & (z < eye_z - 7) & (y < brow_y + 3.5); hair_off[:] = 0.5
    hair_off *= 0.8 + 0.4 * np.random.default_rng(len(arch)).random(len(V))   # clumpy, not a helmet
    beard_kind, beard_col = spec.get('beard', ('none', '#000'))
    beard_m = np.zeros(len(V), bool); beard_off = np.zeros(len(V))
    lowface = (headish | (G('Neck') > 0.4)) & (y < nose_y - 1) & (hz > ear_z + 1) & ~LIPS
    if beard_kind == 'full':
        beard_m = lowface & (y > neck - 4); beard_off = 0.8 + np.clip((mouth_y - y) / 12, 0, 1) * 2.8
    elif beard_kind == 'goatee':
        beard_m = lowface & (np.abs(x) < 3.2) & (y < mouth_y + 2.5) & (y > mouth_y - 7.5); beard_off[:] = 0.55
    must_kind, must_col = spec.get('mustache', ('none', '#000'))
    if must_kind != 'none':
        mm = headish & (y > mouth_y + 0.6) & (y < nose_y - 0.4) & (np.abs(x) < 3.4) & face_front & ~LIPS
        if must_kind == 'handlebar': mm |= headish & face_front & (np.abs(x) > 2.5) & (np.abs(x) < 4.6) & (y > mouth_y - 4.5) & (y < mouth_y + 1.5) & ~LIPS
        beard_m |= mm; beard_off = np.where(mm, 0.6, beard_off); beard_col = must_col
    # --- primitives
    tris = tris_of(faces)
    nb = [[] for _ in range(len(V))]
    for f, _ in faces:
        for a in f:
            nb[a].extend(f)
    hide = covered.copy()
    for _ in range(2): hide = np.array([hide[i] and all(hide[j] for j in nb[i]) for i in range(len(V))])
    covered = hide
    nbs = [np.array(sorted(set(n) - {i}), dtype=int) for i, n in enumerate(nb)]
    AO = bake_ao(V, N, faces, nbs)
    skin_p = Prim('skin', {'kind': 'skinatlas'})
    for tri, uvt in tris:
        if covered[list(tri)].all(): continue
        skin_p.add(tri, uvt, V, N, BVT, W, A=AO)
    prims.append(skin_p)
    def shell(name, mat, m, off, clamps=(), smooth=0, hem=True, aoMul=1.0):
        """Offset copy of the body surface: grown one ring past the cut, smoothed so cloth hangs instead of
        hugging every muscle, then cut clean along the garment's hem planes."""
        ext = m.copy()
        if clamps:
            for i in np.nonzero(m)[0]: ext[nbs[i]] = True
        idx = np.nonzero(ext)[0]
        Ps = V + N * off[:, None]
        nbl = [nbs[i][ext[nbs[i]]] for i in idx]
        for it in range(smooth * 2):                            # Taubin smoothing: removes small bumps without shrinking
            lam = 0.55 if it % 2 == 0 else -0.58
            avg = np.array([Ps[n].mean(0) if len(n) else Ps[i] for i, n in zip(idx, nbl)])
            Ps[idx] = Ps[idx] + lam * (avg - Ps[idx])
        if name in ('shoes', 'boots', 'boots_high', 'sole'):
            # real shoe volume instead of shrink-wrapped toes: push every foot vertex out onto a
            # rounded shoe hull built along the foot (heel -> toe), flat sole on the ground
            for S in ('Left', 'Right'):
                a0, a1 = J[f'{S}Foot'], J[f'{S}Toe_End']
                ax2 = a1 - a0; ax2[1] = 0; L = np.linalg.norm(ax2); ax2 /= L
                heel = a0 - ax2 * 6.5
                side = np.cross([0, 1, 0], ax2)
                sel = idx[(Ps[idx, 1] < a0[1] + 3) & (((Ps[idx] - a0) @ side) * (1 if S == 'Left' else -1) > -40) & (np.sign(Ps[idx, 0]) == (1 if S == 'Left' else -1))]
                for i in sel:
                    q = Ps[i]
                    t = np.clip(((q - heel) @ ax2) / (L + 8.5), 0, 1)       # 0 heel .. 1 toe tip
                    Wd = 4.3 + 1.2 * np.sin(np.pi * np.clip(t * 1.25, 0, 1)) - 1.6 * max(0, t - 0.8) / 0.2
                    Ht = (a0[1] + 2.5) * (1 - 0.55 * t) + 0.6
                    c = heel + ax2 * t * (L + 8.5); c = np.array([c[0], Ht * 0.5, c[2]])
                    d = q - c; d -= ax2 * (d @ ax2)
                    dl = np.linalg.norm(d)
                    if dl < 1e-6: continue
                    u = d / dl
                    sx, sy = abs(u @ side), abs(u[1])
                    grow = 0.35 if name == 'sole' else 0.0
                    r = 1 / ((sx / (Wd + 0.4 + grow)) ** 4 + (sy / (Ht * 0.5 + 0.3 + grow)) ** 4) ** 0.25   # superellipse: boxy-round
                    Ps[i] = c + ax2 * ((q - c) @ ax2) + u * r
                    if t > 0.97: Ps[i] = Ps[i] - ax2 * (t - 0.97) * 30 * 0          # keep tip rounded
                    Ps[i][1] = max(Ps[i][1], 0.0)
        for kind, val in clamps:
            if kind == 'ymin': Ps[idx, 1] = np.maximum(Ps[idx, 1], val)
            elif kind == 'ymax': Ps[idx, 1] = np.minimum(Ps[idx, 1], val)
            elif kind == 'axmax': Ps[idx, 0] = np.clip(Ps[idx, 0], -val, val)
        p = Prim(name, mat)
        sf = [(f, ft) for f, ft in faces if ext[f].all()]
        Ns = vnormals(Ps, sf)                                    # shade the cloth surface, not the skin under it
        A = np.clip(AO * aoMul + (1 - aoMul), 0, 1)
        st = [(tri, uvt) for tri, uvt in tris if ext[list(tri)].all()]
        for tri, uvt in st: p.add(tri, uvt, Ps, Ns, BVT, W, A=A)
        if hem and st:
            # cloth thickness: close every open edge back down to the skin (no paper-thin hems)
            cnt, v2t = {}, {}
            for tri, uvt in st:
                for a, b, ta in ((tri[0], tri[1], uvt[0]), (tri[1], tri[2], uvt[1]), (tri[2], tri[0], uvt[2])):
                    k = (min(a, b), max(a, b)); cnt[k] = cnt.get(k, 0) + 1
                for v, t in zip(tri, uvt): v2t.setdefault(v, t)
            for (a, b), c in cnt.items():
                if c != 1: continue
                ia = [p.raw(Ps[v], -Ns[v] * 0 + (Ps[v] - V[v]) / (np.linalg.norm(Ps[v] - V[v]) + 1e-6) * 0, BVT[v2t[v]], W[v], A[v] * 0.92) for v in (a, b)]
                ib = [p.raw(V[v] + N[v] * 0.08, Ns[v], BVT[v2t[v]], W[v], A[v] * 0.8) for v in (a, b)]
                e = Ps[b] - Ps[a]; dn = np.cross(e, (Ps[a] - V[a])); dn = dn / (np.linalg.norm(dn) + 1e-9)
                for k in ia + ib: p.nrm[k] = dn
                p.idx += [ia[0], ia[1], ib[1], ia[0], ib[1], ib[0], ia[0], ib[1], ia[1], ia[0], ib[0], ib[1]]  # both windings
        if p.idx: prims.append(p)
    for kind, mat, color, m, off in garments: shell(kind, {'kind': mat, 'color': color}, m, off, CL.get(kind, ()), SMOOTH.get(kind, 0))
    # belt over the waistband
    lower = next((g for g in garments if g[0] in ('pants', 'shorts', 'jorts')), None)
    if lower and spec.get('belt', False):
        bm = (y > waist - 3.2) & (y < waist + 1.0) & ~handish & ~armish & ~headish
        shell('belt', {'kind': 'leather', 'color': spec.get('beltColor', '#6a4a32')}, bm, np.full(len(V), lower[4].max() + 0.3), (('ymin', waist - 2.9), ('ymax', waist + 0.7)), 4)
    # polo collar standing up around the neck
    if spec.get('collar'):
        tg = next((g for g in garments if g[0].startswith('shirt')), None)
        if tg:
            cm = (y > neck - 7) & (y < neck + 0.5) & ~headish & ~armish & (ax < 9)
            coff = tg[4].max() + 0.35 + np.clip((y - (neck - 7)) / 7, 0, 1) * 1.6
            shell('collar', {'kind': tg[1], 'color': spec.get('collarColor', tg[2])}, cm, coff, (('ymin', neck - 6.5),), 3)
    # rubber soles under shoes and boots
    foot = next((g for g in garments if g[0] in ('shoes', 'boots', 'boots_high')), None)
    if foot:
        sm = y < 2.6
        shell('sole', {'kind': 'rubber', 'color': spec.get('sole', '#2b2724')}, sm, np.full(len(V), foot[4].max() + 0.4), (('ymax', 2.0), ('ymin', 0.0)), 14, aoMul=0.5)
    if hair_m.any(): shell('hair', {'kind': 'hair', 'color': hair_col}, hair_m, hair_off, (), 6)
    if beard_m.any(): shell('beard', {'kind': 'hair', 'color': beard_col}, beard_m, beard_off, (), 3)
    # eyes, eyelashes from helper groups
    ex = body_faces(('helper-l-eye', 'helper-r-eye'))
    if ex:
        pe = Prim('eyes', {'kind': 'eye', 'tex': f'{arch}_eye.jpg'}); NE = vnormals(V, ex)
        euv = np.zeros((len(V), 2))
        for side in ('helper-l-eye', 'helper-r-eye'):
            vs = np.array(sorted({v for f, g in zip(BF, BG) if g == side for v in f}))
            c = V[vs].mean(0); rr = np.abs(V[vs, 0] - c[0]).max()
            euv[vs, 0] = 0.5 + (V[vs, 0] - c[0]) / (2 * rr); euv[vs, 1] = 0.5 + (V[vs, 1] - c[1]) / (2 * rr)
            euv[vs[V[vs, 2] < c[2]]] = 0.02  # back of the eyeball: sclera
        for tri, uvt in tris_of(ex): pe.add(tri, tri, V, NE, euv, W)
        prims.append(pe)
        eye_tex(f'{OUT}/{arch}_eye.jpg', spec.get('iris', '#5a7896'))
    lx = body_faces(('helper-l-eyelashes-1', 'helper-r-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-2'))
    if lx:
        pl = Prim('lashes', {'kind': 'lash'}); NL = vnormals(V, lx)
        for tri, uvt in tris_of(lx): pl.add(tri, uvt, V, NL, BVT, W)
        prims.append(pl)
    # --- skin atlas
    base = Image.new('RGB', (TEX, TEX), hexc(spec['skin']))
    img = base.convert('RGBA')
    def lay(mask_or_val, color, blur=1.5, speck=None, seed=1):
        val = mask_or_val.astype(float) if mask_or_val.dtype == bool else mask_or_val
        L = paint(img, tris, BVT, val, hexc(color))
        if speck: L = speckle(L, speck, seed)
        return L.filter(ImageFilter.GaussianBlur(blur)) if blur else L
    # tone: warm cheeks/nose/ears, farmer's tan, darker knuckles
    flush = spec.get('flush', 0.4)
    cheeks = headish & face_front & (y < brow_y - 1) & (y > mouth_y) & (np.abs(x) > 2.5)
    img = Image.alpha_composite(img, lay(cheeks * flush * 0.7 + NOSE * flush * 0.8 + EAR * flush * 0.6, '#d0705a', 6))
    if spec.get('tan'): img = Image.alpha_composite(img, lay((headish | (G('Neck') > 0.3) | (ax > sh + 4)) * 0.35, '#a9603d', 4))
    img = Image.alpha_composite(img, lay(handish * 0.25, '#c9806a', 3))
    lips = spec.get('lips', '#a8615a')
    img = Image.alpha_composite(img, lay(LIPS * 0.85, lips, 1.2))
    img = Image.alpha_composite(img, lay(BR * 1.0, spec.get('brows', '#5a3a20'), 0.5, speck=0.75, seed=3))
    img = Image.alpha_composite(img, lay(BR * 0.6, spec.get('brows', '#5a3a20'), 2.5))
    st = spec.get('stubble', 0) + (0.6 if beard_kind != 'none' else 0)
    if st: img = Image.alpha_composite(img, lay(lowface * min(1, st) * 0.8, spec.get('brows', '#40302a'), 0.4, speck=0.35, seed=5))
    if hair_m.any(): img = Image.alpha_composite(img, lay(hair_m * 0.9, hair_col, 1.5))
    img.convert('RGB').save(f'{OUT}/{arch}_skin.jpg', quality=88)
    # --- write
    header = {'version': 2, 'posScale': 0.01, 'unitScale': 0.01, 'bones': R['bones'], 'skinBones': names, 'prims': [], 'skin': f'{arch}_skin.jpg',
              'metrics': {'height': spec.get('height', 1.78), 'eye': float(eye_y), 'eyeZ': float(eye_z), 'head': head.tolist(), 'headTop': top.tolist(), 'brow': float(brow_y), 'mouth': float(mouth_y), 'faceZ': float(V[headish, 2].max()),
                          'earX': float(np.abs(V[EAR, 0]).max()) if EAR.any() else 8.0, 'hips': J['Hips'].tolist()}}
    blob = bytearray()
    for p in prims:
        pos = np.array(p.pos, np.float32); nrm = np.array(p.nrm, np.float32); uv = np.array(p.uv, np.float32)
        si = np.zeros((len(pos), 4), np.uint8); sw = np.zeros((len(pos), 4), np.uint8)
        for k, w in enumerate(p.sk): i, q = top4(w); si[k] = i; sw[k] = q
        aoa = np.round(np.clip(np.array(p.ao, np.float32), 0, 1) * 255).astype(np.uint8)
        idx = np.array(p.idx, np.uint16 if len(pos) < 65536 else np.uint32)
        ent = {'name': p.name, 'mat': p.mat, 'count': len(pos), 'indexCount': len(idx), 'index32': idx.dtype == np.uint32}
        for key, arr in (('pos', np.round(pos * 100).astype(np.int16)), ('nrm', (np.clip(nrm, -1, 1) * 32767).astype(np.int16)), ('uv', np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16)), ('si', si), ('sw', sw), ('ao', aoa), ('idx', idx)):
            while len(blob) % 4: blob.append(0)
            ent[key] = len(blob); blob += arr.tobytes()
        header['prims'].append(ent)
    json.dump(header, open(f'{OUT}/{arch}.json', 'w'))
    open(f'{OUT}/{arch}.bin', 'wb').write(bytes(blob))
    tris_total = sum(len(p.idx) // 3 for p in prims)
    print(f'{arch}: {tris_total} tris, {len(blob) // 1024} KB, scale {R["s"]:.2f}')

for arch, spec in CHAR.items():
    if ONLY and arch not in ONLY: continue
    spec['targets'] = [(r, w) for r, w in spec.get('targets', []) if '/' in r]
    make_char(arch, spec)
