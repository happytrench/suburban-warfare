// Realistic trees: procedurally grown with ez-tree (MIT, Daniel Greenheck) using photo bark
// (ambientCG CC0) and alpha-cut leaf textures. A few variants per species are grown once,
// then every tree on a map is an instance of one of them (one draw call per variant).
import * as THREE from 'three';
import { Tree } from '../vendor/eztree/index.js';

const TEX = new URL('../vendor/eztree/textures/', import.meta.url).href;
const tl = new THREE.TextureLoader();
const cache = {};
const pending = [];
const tex = (n, srgb) => {
  if (!cache[n]) {
    let done; pending.push(new Promise((r) => { done = r; }));
    const t = tl.load(TEX + n, () => done(), undefined, () => done());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cache[n] = t;
  }
  return cache[n];
};
/** Start loading every bark/leaf texture; resolves when all have arrived (or failed). */
export function loadTreeTextures() {
  for (const b of ['Bark001', 'Bark007', 'Bark013']) { tex(`${b}_Color.jpg`, true); tex(`${b}_NormalGL.jpg`); }
  for (const l of ['oak', 'ash', 'aspen', 'pine']) tex(`${l}.png`, true);
  return Promise.all(pending);
}
const BARK = { Bark001: 'Bark001', Bark007: 'Bark007', Bark013: 'Bark013' };

// species -> [preset, bark]
const SPECIES = {
  oak: ['Oak Medium', 'Bark001'],
  ash: ['Ash Medium', 'Bark007'],
  aspen: ['Aspen Medium', 'Bark013'],
  pine: ['Pine Medium', 'Bark013'],
  bush1: ['Bush 1', 'Bark001'],
  bush2: ['Bush 2', 'Bark001'],
  bush3: ['Bush 3', 'Bark001'],
};

const variants = new Map(); // species -> [{ branches, leaves, height, radius }]
function grow(species, seed, lite = false) {
  const [preset, barkName] = SPECIES[species];
  const t = new Tree();
  t.loadPreset(preset);
  t.options.seed = seed;
  const bark = BARK[barkName] || 'Bark001';
  t.options.bark.maps = { color: tex(`${bark}_Color.jpg`, true), normal: tex(`${bark}_NormalGL.jpg`), ao: null, roughness: null };
  t.options.leaves.map = tex(`${t.options.leaves.type}.png`, true);
  // trimmed for a game: fewer, larger leaf cards and lighter branch meshes
  t.options.leaves.count = Math.max(4, Math.round(t.options.leaves.count * (lite ? 0.3 : 0.55)));
  t.options.leaves.size *= lite ? 1.7 : 1.35;
  if (lite) for (const k of Object.keys(t.options.branch.sections)) { t.options.branch.sections[k] = Math.max(1, Math.round(t.options.branch.sections[k] * 0.5)); t.options.branch.segments[k] = Math.max(3, Math.round(t.options.branch.segments[k] * 0.6)); }
  t.generate();
  t.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(t);
  const size = box.getSize(new THREE.Vector3());
  const out = { branches: t.branchesMesh, leaves: t.leavesMesh, height: size.y, radius: Math.max(size.x, size.z) / 2, tree: t };
  for (const m of [out.branches, out.leaves]) { m.castShadow = true; m.receiveShadow = true; }
  return out;
}
export function treeVariants(species, lite = false) {
  const k = species + (lite ? ':lite' : '');
  if (!variants.has(k)) variants.set(k, lite ? [grow(species, 77, true), grow(species, 5151, true)] : [grow(species, 11), grow(species, 4271), grow(species, 90917)]);
  return variants.get(k);
}

/**
 * Instanced trees. items: [{ x, z, r, species }]; r = canopy radius the map asked for (sets the scale).
 * Returns a Group; call group.userData.update(t) each frame for leaf sway.
 */
export function buildForest(items) {
  const g = new THREE.Group();
  const groups = new Map();
  items.forEach((it, i) => {
    const vs = treeVariants(it.species, !!it.lite);
    const k = `${it.species}|${it.lite ? 1 : 0}|${i % vs.length}`;
    if (!groups.has(k)) groups.set(k, { v: vs[i % vs.length], list: [] });
    groups.get(k).list.push(it);
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const trees = [];
  for (const { v, list } of groups.values()) {
    for (const src of [v.branches, v.leaves]) {
      const im = new THREE.InstancedMesh(src.geometry, src.material, list.length);
      im.castShadow = src === v.branches && !list[0].lite; im.receiveShadow = false;
      list.forEach((it, j) => {
        const want = it.h || (it.species === 'pine' ? it.r * 4.2 : it.r * 3.1 + 2.5);   // overall height in metres
        const sc = want / v.height;
        q.setFromAxisAngle(Y, (it.x * 12.9898 + it.z * 78.233) % (Math.PI * 2));
        m4.compose(p.set(it.x, 0, it.z), q, s.setScalar(sc * (0.9 + ((j * 37) % 20) / 100)));
        im.setMatrixAt(j, m4);
      });
      im.computeBoundingSphere();
      g.add(im);
    }
    trees.push(v.tree);
  }
  g.userData.update = (t) => { for (const tr of trees) tr.update(t); };
  return g;
}
