// The playable caricatures, built onto the motion-capture skeleton.
// Exaggerated cartoon proportions so each one reads at a glance from across the map,
// dressed in photo-scanned materials (Poly Haven CC0 denim, jersey, linen, leather, velour)
// plus generated skin, hair, straw and woodland camo — all with normal + roughness maps.
//   Backroad Boys:       Bubba, Cletus, Darlene, Hank, Jimbo
//   Pristine Pines HOA:  Chad, Karen, Golf Dad, Brad, Todd
import * as THREE from 'three';
import * as TX from './textures.js';

export const ARCHETYPES = { country: ['bubba', 'cletus', 'darlene', 'hank', 'jimbo'], suburban: ['chad', 'karen', 'golfdad', 'brad', 'todd'] };
export const pickArchetype = (outfit, id) => { const l = ARCHETYPES[outfit] || ARCHETYPES.suburban; return l[id % l.length]; };
export const DISPLAY = { bubba: 'Bubba', cletus: 'Cletus', darlene: 'Darlene', hank: 'Hank', jimbo: 'Jimbo', chad: 'Chad', karen: 'Karen', golfdad: 'Golf Dad', brad: 'Brad', todd: 'Todd' };

// ---------------------------------------------------------------- materials
const TBASE = new URL('../vendor/textures/char/', import.meta.url).href;
const loader = new THREE.TextureLoader();
const texCache = new Map();
const pending = [];
function T(file, rep, srgb) {
  const key = file + rep;
  if (texCache.has(key)) return texCache.get(key);
  let res;
  pending.push(new Promise((r) => { res = r; }));
  const t = loader.load(TBASE + file + '.jpg', () => res(), undefined, () => res());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
// kind → [diffuse, normal, roughness map, normal strength, sheen]
const SETS = {
  denim: ['denim_fabric', 'denim_fabric', 'denim_fabric', 1.0, 0.6],
  jersey: ['cotton_jersey', 'cotton_jersey', 'cotton_jersey', 0.9, 0.8],
  linen: ['rough_linen', 'rough_linen', 'rough_linen', 1.0, 0.7],
  knit: ['velour_velvet', 'velour_velvet', 'velour_velvet', 1.2, 1.0],
  leather: ['brown_leather', 'brown_leather', 'brown_leather', 0.8, 0],
  wleather: ['leather_white', 'leather_white', 'leather_white', 0.8, 0],
  camo: ['camo', 'cotton_jersey', 'cotton_jersey', 0.9, 0.6],
  skin: ['skin', 'skin', 'skin', 0.6, 0],
  hair: ['hair', 'hair', null, 1.0, 1.0],
  straw: ['straw', 'straw', null, 1.2, 0],
};
const matCache = new Map();
/** Realistic material: kind from SETS, tinted by color; rep = texture tiling per UV unit. */
function R(kind, color = '#ffffff', { rep = 2, rough = 1, metal = 0, map = null, tag = '' } = {}) {
  const key = `${kind}|${color}|${rep}|${rough}|${tag}`;
  if (matCache.has(key)) return matCache.get(key);
  const [d, n, r, ns, sheen] = SETS[kind];
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: metal,
    map: map || T(d + '_diff', rep, true), normalMap: T(n + '_nor_gl', rep, false),
    roughnessMap: r ? T(r + '_rough', rep, false) : null,
  });
  m.normalScale.set(ns, ns);
  if (sheen) { m.sheen = sheen; m.sheenRoughness = 0.7; m.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5); }
  if (kind === 'skin') { m.sheen = 0.12; m.sheenRoughness = 0.4; m.sheenColor = new THREE.Color('#ffb59c'); m.roughness = 1; m.emissive = new THREE.Color(color).multiply(new THREE.Color('#5a1a10')); m.emissiveIntensity = 0.2; } // fake subsurface: shadows go warm, not grey
  if (kind === 'hair') { m.roughness = 0.5; }
  matCache.set(key, m);
  return m;
}
let _plaid = null;
const plaid = () => { if (!_plaid) { _plaid = TX.buffalo().clone(); _plaid.wrapS = _plaid.wrapT = THREE.RepeatWrapping; _plaid.repeat.set(3, 3); _plaid.needsUpdate = true; } return _plaid; };
const SKIN = (c) => R('skin', c, { rep: 2.5 });
const HAIR = (c) => R('hair', c, { rep: 1 });
// Materials for the generated humans (tools/humans.py): their UVs are MakeHuman's body atlas,
// where one UV unit spans roughly the whole body, so fabrics tile much more.
const ATLAS_REP = { denim: 16, jersey: 22, linen: 16, knit: 14, leather: 10, wleather: 10, camo: 6, flannel: 9 };
export function clothMaterial(kind, color) {
  if (kind === 'flannel') {
    const t = TX.buffalo().clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ATLAS_REP.flannel, ATLAS_REP.flannel); t.needsUpdate = true;
    const m = R('jersey', '#ffffff', { rep: ATLAS_REP.jersey, map: t, tag: 'atlasflannel' });
    return m;
  }
  return R(kind, color, { rep: ATLAS_REP[kind] || 14, tag: 'atlas' });
}
export function skinDetail(mat) {
  mat.normalMap = T('skin_nor_gl', 40, false); mat.normalScale.set(0.35, 0.35);
  mat.roughnessMap = T('skin_rough', 40, false);
}
/** Resolves once every character texture has loaded (or failed). */
export const charTexturesReady = () => Promise.all(pending);
// plain materials for small hard bits (lenses, buckles, plastic)
const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...extra });

// Capsule from a bone to its child joint. r in metres; r2 optional end radius (tapers via scale).
function seg(bone, child, r, mat, unit, { r2 = null, sx = 1, sz = 1 } = {}) {
  if (!bone || !child) return null;
  const to = child.position.clone();
  const len = to.length();
  const rr = r / unit;
  const geo = r2 == null
    ? new THREE.CapsuleGeometry(rr, Math.max(0.001, len - rr * 0.6), 4, 12)
    : new THREE.CylinderGeometry(r2 / unit, rr, len, 12);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().normalize());
  m.scale.set(sx, 1, sz);
  m.castShadow = true;
  bone.add(m);
  return m;
}
// Attach an object authored in metres to a bone (bone space is in armature units).
function put(bone, obj, unit, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  if (!bone) return obj;
  obj.scale.multiplyScalar(scale / unit);
  obj.position.set(pos[0] / unit, pos[1] / unit, pos[2] / unit);
  obj.rotation.set(rot[0], rot[1], rot[2]);
  obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  bone.add(obj);
  return obj;
}
const sph = (r, m, s = [1, 1, 1], seg = 16) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m); o.scale.set(...s); return o; };
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, segs = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), m);
const grp = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; };
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };

// ---------------------------------------------------------------- heads (big cartoon heads, +z = face)
function headBase(skin, faceKind, { w = 1, h = 1.12, jaw = 0 } = {}) {
  const g = new THREE.Group();
  g.add(at(sph(0.12, skin, [w, h, 1], 28), 0, 0.1, 0));
  if (jaw) g.add(at(sph(0.1, skin, [w * 1.05, 0.7, 0.95]), 0, 0.03, 0.01 + jaw * 0.01));
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.1215, 18, 12, Math.PI * 0.5 - 0.75, 1.5, Math.PI * 0.22, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ map: TX.face(faceKind), transparent: true, alphaTest: 0.02, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  face.scale.set(w, h, 1); face.position.y = 0.1; g.add(face);
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), skin), 0, 0.085, 0.125, Math.PI / 2));
  for (const sx of [-1, 1]) g.add(at(sph(0.028, skin, [0.5, 1, 0.8], 10), sx * 0.118 * w, 0.095, 0));
  return g;
}
function aviators(color = '#111111', frame = '#b8860b', big = 1) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(at(sph(0.026 * big, M(color, { roughness: 0.1, metalness: 0.6 }), [1.25, 1, 0.35]), sx * 0.045 * big, 0, 0));
  g.add(box(0.03, 0.006, 0.006, M(frame, { metalness: 0.8, roughness: 0.3 })));
  return g;
}
function wayfarers() {
  const g = new THREE.Group();
  const m = M('#0b0b0b', { roughness: 0.15, metalness: 0.4 });
  for (const sx of [-1, 1]) g.add(at(box(0.05, 0.03, 0.012, m), sx * 0.032, 0, 0));
  g.add(box(0.12, 0.012, 0.012, m));
  return g;
}
function truckerCap(front, mesh = '#f1f5f9', backwards = false) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(mesh)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.132, 18, 8, -0.95, 1.9, 0, Math.PI / 2), front));
  g.add(at(box(0.2, 0.014, 0.15, front), 0, 0.005, 0.15, 0.12));
  g.add(at(sph(0.012, front), 0, 0.13, 0));
  if (backwards) g.rotation.y = Math.PI;
  return g;
}

// ---------------------------------------------------------------- the cast
const gold = () => M('#d4a63a', { metalness: 0.9, roughness: 0.25 });
function buildBubba(b, u, team) {
  const skin = SKIN('#efb894'), tan = SKIN('#cf7a58'), tank = R('jersey', '#f1efe6', { rep: 3 }), jeans = R('denim', '#ffffff', { rep: 2.5 }), boots = R('leather', '#a07050', { rep: 2 });
  const camo = R('camo', '#ffffff', { rep: 1.5 });
  legs(b, u, jeans, jeans, boots, { thigh: 0.115, shin: 0.095, foot: 0.075 });
  boots2(b, u, boots, 0.085, 0.18);
  torso(b, u, tank, tank, tank, { hip: 0.18, mid: 0.2, chest: 0.21, neck: tan });
  put(b.Spine, sph(0.27, tank, [1.05, 0.95, 0.95], 24), u, [0, 0.0, 0.13]);             // the beer belly
  put(b.Hips, sph(0.2, tank, [1.1, 0.7, 0.95], 20), u, [0, 0.03, 0.1]);
  put(b.Hips, at(box(0.44, 0.06, 0.34, R('leather', '#6b4a33')), 0, 0, 0), u, [0, 0.07, 0.02]);  // belt
  put(b.Hips, box(0.11, 0.075, 0.02, gold()), u, [0, 0.07, 0.205]);                     // buckle
  arms(b, u, tan, tan, tan, skin, { up: 0.07, fore: 0.058 });                          // sleeveless, farmer's tan
  put(b.Neck, sph(0.08, tan, [1.3, 0.8, 1.2]), u, [0, 0.02, 0]);
  const h = headBase(skin, 'beard+brown', { w: 1.08, jaw: 1 });
  h.add(at(sph(0.11, HAIR('#6b4423'), [1.05, 0.95, 0.75]), 0, 0.02, 0.06));               // big beard
  h.add(at(box(0.2, 0.2, 0.09, HAIR('#7a4f2a')), 0, 0.03, -0.11));                         // mullet
  h.add(at(truckerCap(camo, '#f1f5f9'), 0, 0.15, 0));
  h.add(at(aviators('#1a1a1a', '#c0c0c0', 1.1), 0, 0.22, 0.12, -0.5));                      // shades parked on the cap
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.32);
}
function buildCletus(b, u, team) {
  const skin = SKIN('#e8b08c'), over = R('denim', '#c9d6e6', { rep: 2.5 }), boots = R('leather', '#7a5638'), straw = R('straw', '#ffffff', { rep: 3 });
  legs(b, u, over, over, boots, { thigh: 0.07, shin: 0.06, foot: 0.07 });
  boots2(b, u, boots, 0.07, 0.14);
  torso(b, u, over, skin, skin, { hip: 0.13, mid: 0.12, chest: 0.13, neck: skin });   // shirtless, skinny
  put(b.Spine1, box(0.22, 0.24, 0.03, over), u, [0, 0.0, 0.11]);                         // overall bib
  put(b.Spine1, at(box(0.035, 0.33, 0.02, over), 0, 0, 0, -0.15), u, [-0.07, 0.17, 0.08]); // one strap up...
  put(b.Spine, at(box(0.035, 0.28, 0.02, over), 0, 0, 0, 0.3, 0, 0.5), u, [0.11, -0.02, 0.12]); // ...one strap hanging
  for (const sx of [-1, 1]) put(b.Spine1, sph(0.012, M('#c0c0c0', { metalness: 0.9, roughness: 0.3 })), u, [sx * 0.07, 0.11, 0.13]);
  arms(b, u, skin, skin, skin, skin, { up: 0.045, fore: 0.04 });
  const h = headBase(skin, 'stubble+blue', { w: 0.92, h: 1.25 });
  for (const sx of [-1, 1]) h.add(at(box(0.024, 0.032, 0.01, M('#f3eed8', { roughness: 0.3 })), sx * 0.014, 0.035, 0.122)); // buck teeth
  h.add(at(cyl(0.25, 0.25, 0.012, straw, 32), 0, 0.17, 0));                                // straw hat brim
  h.add(at(cyl(0.11, 0.125, 0.11, straw, 24), 0, 0.22, 0));
  h.add(at(cyl(0.126, 0.126, 0.025, R('jersey', '#7f1d1d'), 24), 0, 0.185, 0));
  h.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), M('#e8c547')), 0.04, 0.02, 0.14, 1.2, 0, 0.3)); // piece of straw in his teeth
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildDarlene(b, u, team) {
  const skin = SKIN('#f0c0a0'), jorts = R('denim', '#e2ecf5', { rep: 2.5 }), camo = R('camo', '#ffffff', { rep: 1.5 }), boot = R('leather', '#c98a5a'), hair = HAIR('#e8c26e');
  legs(b, u, jorts, skin, boot, { thigh: 0.085, shin: 0.065, foot: 0.06, thighTo: 0.35 });
  boots2(b, u, boot, 0.07, 0.3);                                                          // tall cowboy boots
  torso(b, u, jorts, skin, camo, { hip: 0.15, mid: 0.125, chest: 0.15, neck: skin });   // camo crop top, bare midriff
  arms(b, u, skin, skin, skin, skin, { up: 0.045, fore: 0.04 });
  const h = headBase(skin, 'green', { w: 0.95 });
  h.add(at(sph(0.16, hair, [1.25, 1.0, 0.95], 22), 0, 0.19, -0.075));                     // big teased hair
  h.add(at(sph(0.1, hair, [1, 1.4, 0.8], 18), 0, 0.02, -0.12));
  for (const sx of [-1, 1]) h.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 16), gold()), sx * 0.125, 0.04, 0, 0, Math.PI / 2));
  h.add(at(box(0.16, 0.012, 0.012, R('jersey', '#c81e1e')), 0, 0.2, 0.08));             // red bandana band
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.28);
}
function buildHank(b, u, team) {
  // long-haul trucker: red buffalo-check flannel, handlebar mustache, dip in his lip
  const skin = SKIN('#e3a684'), flannel = R('jersey', '#ffffff', { rep: 1.5, map: plaid(), tag: 'flannel' }), jeans = R('denim', '#9fb0c4', { rep: 2.5 }), boots = R('leather', '#8a6040');
  legs(b, u, jeans, jeans, boots, { thigh: 0.11, shin: 0.09, foot: 0.075 });
  boots2(b, u, boots, 0.085, 0.22);
  torso(b, u, jeans, flannel, flannel, { hip: 0.18, mid: 0.19, chest: 0.2, neck: skin });
  put(b.Spine, sph(0.25, flannel, [1.05, 0.95, 0.95], 24), u, [0, 0.0, 0.12]);
  put(b.Hips, at(box(0.43, 0.06, 0.33, R('leather', '#4a3222')), 0, 0, 0), u, [0, 0.07, 0.02]);
  put(b.Hips, box(0.1, 0.07, 0.02, M('#c0c0c0', { metalness: 0.9, roughness: 0.25 })), u, [0, 0.07, 0.2]);
  for (const sx of [-1, 1]) put(b.Hips, at(box(0.04, 0.34, 0.015, R('jersey', '#2a2a2a')), 0, 0, 0, -0.18), u, [sx * 0.09, 0.27, 0.19]); // suspenders over the gut
  arms(b, u, flannel, flannel, flannel, skin, { up: 0.068, fore: 0.056 });
  const h = headBase(skin, 'handlebar+stubble+brown+old', { w: 1.06, jaw: 1.2 });
  h.add(at(sph(0.022, skin), 0.05, 0.035, 0.1));                                           // the dip
  h.add(at(truckerCap(R('jersey', team, { rep: 2 }), '#1f2937'), 0, 0.15, 0));
  h.add(at(box(0.07, 0.03, 0.004, M('#f8fafc')), 0, 0.2, 0.127, -0.3));
  for (const sx of [-1, 1]) h.add(at(sph(0.04, HAIR('#8c8680'), [0.6, 1, 1]), sx * 0.11, 0.1, -0.04));
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildJimbo(b, u, team) {
  // bass fisherman: khaki vest full of lures, bucket hat, cargo shorts, white rubber "redneck Reeboks"
  const skin = SKIN('#e9b28e'), tee = R('camo', '#ffffff', { rep: 1.5 }), vest = R('linen', '#b9a77a', { rep: 2 }), shorts = R('linen', '#6b6a4a', { rep: 2 }), rubber = M('#eeeeea', { roughness: 0.35 });
  legs(b, u, shorts, skin, rubber, { thigh: 0.095, shin: 0.075, foot: 0.072, thighTo: 0.6 });
  boots2(b, u, rubber, 0.085, 0.3);
  torso(b, u, shorts, tee, tee, { hip: 0.16, mid: 0.17, chest: 0.18, neck: skin });
  put(b.Spine, sph(0.21, tee, [1.02, 0.9, 0.95], 22), u, [0, 0.02, 0.09]);
  for (const sx of [-1, 1]) {                                                              // open vest panels with pockets
    put(b.Spine1, at(box(0.13, 0.3, 0.03, vest), 0, 0, 0, 0, sx * 0.25), u, [sx * 0.1, 0.06, 0.15]);
    for (const y of [-0.02, 0.1]) put(b.Spine1, box(0.08, 0.06, 0.02, vest), u, [sx * 0.1, y, 0.175]);
  }
  for (const [x, y, c] of [[-0.11, 0.17, '#e11d48'], [0.1, 0.15, '#facc15'], [-0.08, 0.0, '#22c55e']]) put(b.Spine1, sph(0.014, M(c, { roughness: 0.3, metalness: 0.2 }), [1, 2, 1]), u, [x, y, 0.19]); // lures
  arms(b, u, tee, skin, skin, skin, { up: 0.062, fore: 0.052 });
  const h = headBase(skin, 'goatee+stubble+blue', { w: 1.04, jaw: 0.8 });
  const hat = R('linen', '#7c7a52', { rep: 3 });
  h.add(at(cyl(0.12, 0.13, 0.1, hat, 24), 0, 0.2, 0));
  h.add(at(cyl(0.2, 0.2, 0.012, hat, 32), 0, 0.15, 0, 0.12, 0, 0));
  h.add(at(aviators('#0f3b2e', '#111111', 1.1), 0, 0.105, 0.122));                          // green-mirror fishing shades
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildChad(b, u, team) {
  const skin = SKIN('#e9b48c'), shorts = R('linen', '#f4978e', { rep: 2 }), polo = R('jersey', '#9fd3f0', { rep: 3 }), shoe = R('leather', '#b07a4a'), sweater = R('knit', '#fde68a', { rep: 2 });
  legs(b, u, shorts, skin, shoe, { thigh: 0.09, shin: 0.07, foot: 0.07, thighTo: 0.55 });
  for (const s of ['Left', 'Right']) put(b[`${s}Foot`], box(0.1, 0.02, 0.28, M('#f5f5f0', { roughness: 0.6 })), u, [0, -0.03, 0.06]);   // boat-shoe soles
  torso(b, u, shorts, polo, polo, { hip: 0.16, mid: 0.17, chest: 0.21, neck: skin });    // broad chest, gym bro
  arms(b, u, polo, skin, skin, skin, { up: 0.07, fore: 0.055 });
  for (const sx of [-1, 1]) put(b.Spine2, at(box(0.09, 0.11, 0.015, R('jersey', '#ffffff')), 0, 0, 0, -0.25, 0, sx * 0.35), u, [sx * 0.07, 0.25, 0.09]); // POPPED collar
  put(b.Spine2, at(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.042, 10, 24, Math.PI), sweater), 0, 0, 0, -Math.PI / 2.3), u, [0, 0.2, 0.0]); // sweater over the shoulders
  put(b.Spine2, sph(0.05, sweater), u, [0, 0.1, 0.17]);
  const h = headBase(skin, 'grin+blue', { w: 1.05, jaw: 1.5 });
  const gel = R('hair', '#d9b45a', { rep: 1, tag: 'gel' }); gel.roughness = 0.3;
  h.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.126, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), gel), 0, 0.11, -0.01)); // slicked-back hair
  h.add(at(sph(0.06, gel, [1.6, 0.55, 1.1]), 0, 0.21, 0.04));
  h.add(at(wayfarers(), 0, 0.11, 0.122));
  for (const sx of [-1, 1]) h.add(at(sph(0.012, M('#ffffff', { roughness: 0.2 })), sx * 0.12, 0.08, 0.02)); // AirPods
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildKaren(b, u, team) {
  const skin = SKIN('#f3cfb5'), legg = R('jersey', '#26262c', { rep: 3, rough: 0.8 }), top = R('knit', '#c4b5fd', { rep: 2 }), shoe = R('wleather', '#ffffff'), hair = HAIR('#ead7a2');
  legs(b, u, legg, legg, shoe, { thigh: 0.08, shin: 0.06, foot: 0.06 });
  torso(b, u, legg, top, top, { hip: 0.15, mid: 0.13, chest: 0.15, neck: skin });
  arms(b, u, top, top, skin, skin, { up: 0.048, fore: 0.042 });
  const h = headBase(skin, 'blue', { w: 0.95, h: 1.15 });
  h.add(at(sph(0.14, hair, [1.15, 0.8, 0.95], 22), 0, 0.16, -0.05));                  // the bob...
  h.add(at(box(0.05, 0.17, 0.13, hair), 0.125, 0.04, 0.0, 0, 0, -0.1));                 // ...long on one side
  h.add(at(box(0.04, 0.1, 0.12, hair), -0.125, 0.08, 0.0, 0, 0, 0.1));                  // ...short on the other
  h.add(at(aviators('#0b0b0b', '#c9a227', 1.45), 0, 0.105, 0.122));                     // GIANT sunglasses
  h.add(at(box(0.012, 0.13, 0.065, M('#111827', { roughness: 0.2, metalness: 0.3 })), 0.13, 0.08, 0.02)); // phone glued to her ear
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildGolfDad(b, u, team) {
  const skin = SKIN('#eab995'), polo = R('jersey', '#1e3a5f', { rep: 3 }), khaki = R('linen', '#d6c7a1', { rep: 2.5 }), shoe = R('wleather', '#ffffff'), cap = R('jersey', '#f8fafc', { rep: 2 });
  legs(b, u, khaki, khaki, shoe, { thigh: 0.095, shin: 0.075, foot: 0.07 });
  for (const s of ['Left', 'Right']) put(b[`${s}Foot`], box(0.11, 0.025, 0.26, M('#9ca3af', { roughness: 0.6 })), u, [0, -0.03, 0.05]);
  torso(b, u, khaki, polo, polo, { hip: 0.17, mid: 0.18, chest: 0.18, neck: skin });
  put(b.Spine, sph(0.22, polo, [1.02, 0.9, 0.95], 22), u, [0, 0.02, 0.09]);             // dad gut
  put(b.Hips, box(0.42, 0.05, 0.32, R('leather', '#3a3a3a')), u, [0, 0.07, 0.02]);
  arms(b, u, polo, skin, skin, skin, { up: 0.062, fore: 0.05 });
  put(b.LeftHand, sph(0.05, R('wleather', '#ffffff', { rep: 1 }), [0.95, 1.35, 0.65]), u, [0, 0.05, 0]); // golf glove
  const h = headBase(skin, 'mustache+old+blue', { w: 1.02, jaw: 0.8 });
  for (const sx of [-1, 1]) h.add(at(sph(0.04, HAIR('#a3a3a3'), [0.6, 1, 1]), sx * 0.11, 0.1, -0.03));
  h.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap), 0, 0.14, 0));
  h.add(at(box(0.2, 0.012, 0.13, cap), 0, 0.145, 0.15, 0.1));
  h.add(at(box(0.05, 0.03, 0.005, M('#1e3a5f')), 0, 0.2, 0.125, -0.3));                 // club logo
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.28);
}
function buildBrad(b, u, team) {
  // tech bro: navy fleece vest over a blue oxford, slim chinos, white sneakers, man bun
  const skin = SKIN('#ecbd98'), oxford = R('linen', '#bcd4ee', { rep: 3 }), vest = R('knit', '#1f2a44', { rep: 2 }), chinos = R('linen', '#4b5563', { rep: 2.5 }), shoe = R('wleather', '#ffffff');
  legs(b, u, chinos, chinos, shoe, { thigh: 0.08, shin: 0.06, foot: 0.068 });
  for (const s of ['Left', 'Right']) put(b[`${s}Foot`], box(0.105, 0.03, 0.27, M('#f4f4f2', { roughness: 0.5 })), u, [0, -0.03, 0.06]);
  torso(b, u, chinos, vest, vest, { hip: 0.15, mid: 0.16, chest: 0.18, neck: skin });
  put(b.Spine2, at(box(0.012, 0.3, 0.012, M('#c0c0c0', { metalness: 0.9, roughness: 0.3 })), 0, 0, 0), u, [0, 0.05, 0.155]); // vest zipper
  put(b.Spine2, box(0.05, 0.02, 0.005, M('#e5e7eb')), u, [0.07, 0.12, 0.152]);          // little logo patch
  arms(b, u, oxford, oxford, oxford, skin, { up: 0.055, fore: 0.046 });
  put(b.LeftForeArm, cyl(0.05, 0.05, 0.04, M('#111111', { roughness: 0.3 }), 16), u, [0, 0.21, 0]); // smart watch
  const h = headBase(skin, 'stubble+brown', { w: 0.98, jaw: 1.2 });
  const hair = HAIR('#3b2a1e');
  h.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.125, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), hair), 0, 0.12, -0.005));
  h.add(at(sph(0.045, hair), 0, 0.235, -0.07));                                            // man bun
  for (const sx of [-1, 1]) h.add(at(sph(0.012, M('#ffffff', { roughness: 0.2 })), sx * 0.12, 0.08, 0.02));
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.28);
}
function buildTodd(b, u, team) {
  // HOA president: tan cardigan, pleated khakis, loafers, horseshoe bald spot, rimless glasses, lanyard
  const skin = SKIN('#efc2a2'), cardigan = R('knit', '#a68a64', { rep: 2.5 }), shirt = R('linen', '#f1f5f9', { rep: 3 }), khaki = R('linen', '#cbbd94', { rep: 2.5 }), loafer = R('leather', '#7a4a2c');
  legs(b, u, khaki, khaki, loafer, { thigh: 0.1, shin: 0.075, foot: 0.066 });
  torso(b, u, khaki, cardigan, cardigan, { hip: 0.18, mid: 0.18, chest: 0.17, neck: skin });
  put(b.Spine, sph(0.23, cardigan, [1.02, 0.92, 0.95], 22), u, [0, 0.02, 0.09]);
  put(b.Spine2, box(0.07, 0.2, 0.02, shirt), u, [0, 0.1, 0.14]);                         // shirt placket under the cardigan
  for (let i = 0; i < 4; i++) put(b.Spine1, sph(0.01, M('#5b3a1e', { roughness: 0.4 })), u, [0.04, 0.12 - i * 0.07, 0.205 - i * 0.01]);
  put(b.Spine2, at(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 24), R('jersey', team, { rep: 1 })), 0, 0, 0, Math.PI / 2 + 0.4), u, [0, 0.16, 0.06]); // lanyard
  put(b.Spine1, box(0.06, 0.08, 0.006, M('#f8fafc', { roughness: 0.3 })), u, [0, 0.1, 0.19]);   // HOA badge
  arms(b, u, cardigan, cardigan, cardigan, skin, { up: 0.06, fore: 0.05 });
  const h = headBase(skin, 'old+green', { w: 1.04, h: 1.18, jaw: 0.6 });
  for (const sx of [-1, 1]) h.add(at(sph(0.045, HAIR('#6b5a48'), [0.55, 0.9, 1.2]), sx * 0.11, 0.1, -0.04)); // the horseshoe
  h.add(at(sph(0.09, HAIR('#6b5a48'), [1.3, 0.6, 0.6]), 0, 0.09, -0.1));
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.35 });
  for (const sx of [-1, 1]) h.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 16), glass), sx * 0.04, 0.115, 0.124, Math.PI / 2));
  h.add(at(box(0.026, 0.004, 0.004, gold()), 0, 0.118, 0.126));
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}

// ---------------------------------------------------------------- shared body parts
function legs(b, u, thighM, shinM, footM, { thigh = 0.09, shin = 0.07, foot = 0.065, thighTo = 1 } = {}) {
  for (const s of ['Left', 'Right']) {
    if (thighTo < 1) {
      // shorts / cutoffs: cloth covers the top of the thigh, skin below
      seg(b[`${s}UpLeg`], b[`${s}Leg`], thigh * 0.9, shinM, u);
      const to = b[`${s}Leg`].position.clone().multiplyScalar(thighTo);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(thigh * 1.15 / u, thigh * 1.25 / u, to.length(), 14), thighM);
      m.position.copy(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().normalize()); m.castShadow = true;
      b[`${s}UpLeg`].add(m);
    } else seg(b[`${s}UpLeg`], b[`${s}Leg`], thigh, thighM, u);
    seg(b[`${s}Leg`], b[`${s}Foot`], shin, shinM, u);
    seg(b[`${s}Foot`], b[`${s}ToeBase`], foot, footM, u, { sx: 1.1 });
  }
}
function boots2(b, u, m, r, h) {
  for (const s of ['Left', 'Right']) {
    const leg = b[`${s}Leg`], foot = b[`${s}Foot`];
    if (!leg || !foot) continue;
    const ankle = foot.position.clone();
    const top = ankle.clone().multiplyScalar(1 - h / (ankle.length() * u));
    const len = ankle.distanceTo(top);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r / u, r * 1.05 / u, len, 12), m);
    c.position.copy(top.clone().add(ankle).multiplyScalar(0.5));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ankle.clone().normalize());
    c.castShadow = true;
    leg.add(c);
  }
}
function torso(b, u, hipM, midM, chestM, { hip = 0.16, mid = 0.16, chest = 0.17, neck = SKIN('#e3ad8a') } = {}) {
  seg(b.Hips, b.Spine, hip, hipM, u, { sz: 0.8 });
  seg(b.Spine, b.Spine1, mid, midM, u, { sz: 0.8 });
  seg(b.Spine1, b.Spine2, mid * 1.02, midM === chestM ? chestM : midM, u, { sz: 0.8 });
  seg(b.Spine2, b.Neck, chest, chestM, u, { sz: 0.75 });
  seg(b.Neck, b.Head, 0.055, neck, u);
}
function arms(b, u, shoulderM, upperM, foreM, handM, { up = 0.055, fore = 0.045 } = {}) {
  for (const s of ['Left', 'Right']) {
    seg(b[`${s}Shoulder`], b[`${s}Arm`], up * 1.15, shoulderM, u);
    seg(b[`${s}Arm`], b[`${s}ForeArm`], up, upperM, u);
    seg(b[`${s}ForeArm`], b[`${s}Hand`], fore, foreM, u);
    put(b[`${s}Hand`], sph(0.05, handM, [0.95, 1.3, 0.65]), u, [0, 0.05, 0]);
  }
}

const BUILDERS = { bubba: buildBubba, cletus: buildCletus, darlene: buildDarlene, hank: buildHank, jimbo: buildJimbo, chad: buildChad, karen: buildKaren, golfdad: buildGolfDad, brad: buildBrad, todd: buildTodd };
export function buildCaricature(bones, unit, archetype, teamColor) {
  (BUILDERS[archetype] || buildChad)(bones, unit, teamColor);
}

// ---------------------------------------------------------------- gear for the generated humans
// Hats, glasses and props placed from the head measurements tools/humans.py exports (cm, mocap rest pose).
export function buildHumanGear(b, u, arch, team, mt) {
  const hd = mt.head, cm = (v) => v / 100;
  const r = cm(mt.earX) * 1.08;                                   // head half-width
  const browY = cm(mt.brow - hd[1]), faceZ = cm(mt.faceZ - hd[2]), topY = cm(mt.headTop[1] - hd[1]);
  const cz = faceZ - r * 1.05;                                     // skull centre (z)
  const eyeY = mt.eye != null ? cm(mt.eye - hd[1]) - 0.006 : browY - 0.018, glassZ = mt.eyeZ != null ? cm(mt.eyeZ - hd[2]) + 0.012 : faceZ - 0.012;
  const k = r / 0.125;                                             // cartoon gear was built for r = 0.125
  const H = (o, x, y, z, s = 1, rot = [0, 0, 0]) => put(b.Head, o, u, [x, y, z], rot, s);
  const cap = (front, mesh = '#f1f5f9', back = false) => H(truckerCap(front, mesh, back), 0, browY + 0.012, cz + 0.005, k * 1.02);
  const shades = (lens, frame, big) => H(aviators(lens, frame, big), 0, eyeY, glassZ, k * 0.9);
  switch (arch) {
    case 'bubba':
      cap(R('camo', '#ffffff', { rep: 1.5 }));
      H(aviators('#1a1a1a', '#c0c0c0', 1), 0, browY + 0.08, cz + r * 0.95, k * 0.95, [-0.5, 0, 0]);
      break;
    case 'cletus': {
      const straw = R('straw', '#ffffff', { rep: 3 });
      const hat = grp(cyl(0.25, 0.25, 0.012, straw, 32), at(cyl(0.11, 0.125, 0.11, straw, 24), 0, 0.05, 0), at(cyl(0.126, 0.126, 0.025, R('jersey', '#7f1d1d'), 24), 0, 0.015, 0));
      H(hat, 0, browY + 0.02, cz, k);
      H(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.08, 4), M('#e8c547')), 0.02, browY - 0.085, faceZ + 0.01, 1, [1.25, 0, 0.35]);
      break;
    }
    case 'darlene':
      for (const sx of [-1, 1]) H(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0025, 6, 20), gold()), sx * r * 0.98, browY - 0.07, cz + 0.01, 1, [0, Math.PI / 2, 0]);
      H(grp(at(new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.008, 6, 28), R('jersey', '#c81e1e')), 0, 0, 0, Math.PI / 2 - 0.25)), 0, browY + 0.035, cz, 1);
      break;
    case 'hank':
      cap(R('jersey', team, { rep: 2 }), '#1f2937');
      break;
    case 'jimbo': {
      const hat = R('linen', '#7c7a52', { rep: 3 });
      H(grp(at(cyl(0.12, 0.13, 0.1, hat, 24), 0, 0.05, 0), at(cyl(0.2, 0.2, 0.012, hat, 32), 0, 0, 0, 0.1)), 0, browY + 0.015, cz, k * 0.95);
      shades('#0f3b2e', '#111111', 1);
      break;
    }
    case 'chad':
      H(wayfarers(), 0, eyeY, glassZ, k * 0.85);
      for (const sx of [-1, 1]) H(sph(0.007, M('#ffffff', { roughness: 0.2 })), sx * r * 0.97, eyeY - 0.04, cz + 0.01);
      break;
    case 'karen':
      shades('#0b0b0b', '#c9a227', 1.35);
      H(box(0.008, 0.13, 0.065, M('#111827', { roughness: 0.2, metalness: 0.3 })), r * 0.9, eyeY - 0.05, cz + 0.02);
      break;
    case 'golfdad': {
      const c = R('jersey', '#f8fafc', { rep: 2 });
      H(grp(new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), c), at(box(0.2, 0.012, 0.13, c), 0, 0.005, 0.15, 0.1), at(box(0.05, 0.03, 0.004, M('#1e3a5f')), 0, 0.06, 0.125, -0.3)), 0, browY + 0.012, cz + 0.005, k * 1.02);
      break;
    }
    case 'brad':
      for (const sx of [-1, 1]) H(sph(0.007, M('#ffffff', { roughness: 0.2 })), sx * r * 0.97, eyeY - 0.04, cz + 0.01);
      put(b.LeftHand, cyl(0.03, 0.03, 0.02, M('#111111', { roughness: 0.3 }), 16), u, [0, -0.03, 0], [0, 0, Math.PI / 2]);
      break;
    case 'todd': {
      const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.3 });
      const g = grp(...[-1, 1].map((sx) => at(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.003, 18), glass), sx * 0.033, 0, 0, Math.PI / 2)), box(0.022, 0.003, 0.003, gold()));
      H(g, 0, eyeY, glassZ + 0.004);
      put(b.Spine2, box(0.06, 0.08, 0.004, M('#f8fafc', { roughness: 0.3 })), u, [0, 0.0, 0.17]);
      break;
    }
  }
  void topY;
}
