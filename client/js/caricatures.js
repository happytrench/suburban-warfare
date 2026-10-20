// The six playable caricatures, built onto the motion-capture skeleton.
// Exaggerated cartoon proportions so each one reads at a glance from across the map.
//   Backroad Boys:       Bubba, Cletus, Darlene
//   Pristine Pines HOA:  Chad, Karen, Golf Dad
import * as THREE from 'three';
import * as TX from './textures.js';

export const ARCHETYPES = { country: ['bubba', 'cletus', 'darlene'], suburban: ['chad', 'karen', 'golfdad'] };
export const pickArchetype = (outfit, id) => { const l = ARCHETYPES[outfit] || ARCHETYPES.suburban; return l[id % l.length]; };
export const DISPLAY = { bubba: 'Bubba', cletus: 'Cletus', darlene: 'Darlene', chad: 'Chad', karen: 'Karen', golfdad: 'Golf Dad' };

const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...extra });
const tex = (map, c = '#ffffff', extra = {}) => new THREE.MeshStandardMaterial({ color: c, map, roughness: 0.85, ...extra });

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
  g.add(at(sph(0.12, skin, [w, h, 1]), 0, 0.1, 0));
  if (jaw) g.add(at(sph(0.1, skin, [w * 1.05, 0.7, 0.95]), 0, 0.03, 0.01 + jaw * 0.01));
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.1215, 18, 12, Math.PI * 0.5 - 0.75, 1.5, Math.PI * 0.22, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ map: TX.face(faceKind), transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false }),
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

// ---------------------------------------------------------------- the six
function buildBubba(b, u, team) {
  const skin = M('#efb894'), tan = M('#d9805f'), tank = M('#f4f4ee'), jeans = tex(TX.denim()), boots = M('#5a3519', { roughness: 0.6 });
  const camo = tex(TX.camo());
  legs(b, u, jeans, jeans, boots, { thigh: 0.115, shin: 0.095, foot: 0.075 });
  boots2(b, u, boots, 0.085, 0.18);
  torso(b, u, tank, tank, tank, { hip: 0.18, mid: 0.2, chest: 0.21 });
  put(b.Spine, sph(0.27, tank, [1.05, 0.95, 0.95]), u, [0, 0.0, 0.13]);             // the beer belly
  put(b.Hips, sph(0.2, tank, [1.1, 0.7, 0.95]), u, [0, 0.03, 0.1]);
  put(b.Hips, at(box(0.44, 0.06, 0.34, M('#3b2412')), 0, 0, 0), u, [0, 0.07, 0.02]);  // belt
  put(b.Hips, box(0.11, 0.075, 0.02, M('#e0b13b', { metalness: 0.8, roughness: 0.3 })), u, [0, 0.07, 0.205]); // buckle
  arms(b, u, tan, tan, tan, skin, { up: 0.07, fore: 0.058 });                          // sleeveless, farmer's tan
  put(b.Neck, sph(0.08, tan, [1.3, 0.8, 1.2]), u, [0, 0.02, 0]);
  const h = headBase(skin, 'beard', { w: 1.08, jaw: 1 });
  h.add(at(sph(0.11, M('#6b4423', { roughness: 1 }), [1.05, 0.95, 0.75]), 0, 0.02, 0.06));   // big beard
  h.add(at(box(0.2, 0.2, 0.09, M('#7a4f2a', { roughness: 1 })), 0, 0.03, -0.11));              // mullet
  h.add(at(truckerCap(camo, '#f1f5f9'), 0, 0.15, 0));
  h.add(at(aviators('#1a1a1a', '#c0c0c0', 1.1), 0, 0.22, 0.12, -0.5));                          // shades parked on the cap
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.32);
}
function buildCletus(b, u, team) {
  const skin = M('#e8b08c'), over = tex(TX.denim()), boots = M('#4a2f18', { roughness: 0.6 }), straw = M('#d8b46a', { roughness: 0.95 });
  legs(b, u, over, over, boots, { thigh: 0.07, shin: 0.06, foot: 0.07 });
  boots2(b, u, boots, 0.07, 0.14);
  torso(b, u, over, skin, skin, { hip: 0.13, mid: 0.12, chest: 0.13 });                 // shirtless, skinny
  put(b.Spine1, box(0.22, 0.24, 0.03, over), u, [0, 0.0, 0.11]);                         // overall bib
  put(b.Spine1, at(box(0.035, 0.33, 0.02, over), 0, 0, 0, -0.15), u, [-0.07, 0.17, 0.08]); // one strap up...
  put(b.Spine, at(box(0.035, 0.28, 0.02, over), 0, 0, 0, 0.3, 0, 0.5), u, [0.11, -0.02, 0.12]); // ...one strap hanging
  arms(b, u, skin, skin, skin, skin, { up: 0.045, fore: 0.04 });
  const h = headBase(skin, 'clean', { w: 0.92, h: 1.25 });
  for (const sx of [-1, 1]) h.add(at(box(0.024, 0.032, 0.01, M('#fffbe6')), sx * 0.014, 0.035, 0.122)); // buck teeth
  h.add(at(cyl(0.25, 0.25, 0.012, straw, 24), 0, 0.17, 0));                                // straw hat brim
  h.add(at(cyl(0.11, 0.125, 0.11, straw, 18), 0, 0.22, 0));
  h.add(at(cyl(0.126, 0.126, 0.025, M('#7f1d1d'), 18), 0, 0.185, 0));
  h.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), M('#e8c547')), 0.04, 0.02, 0.14, 1.2, 0, 0.3)); // piece of straw in his teeth
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildDarlene(b, u, team) {
  const skin = M('#f0c0a0'), jorts = tex(TX.denim()), camo = tex(TX.camo()), boot = M('#8a4b1f', { roughness: 0.5 }), hair = M('#e8c26e', { roughness: 0.95 });
  legs(b, u, jorts, skin, boot, { thigh: 0.085, shin: 0.065, foot: 0.06, thighTo: 0.35 });
  boots2(b, u, boot, 0.07, 0.3);                                                          // tall cowboy boots
  torso(b, u, jorts, skin, camo, { hip: 0.15, mid: 0.125, chest: 0.15 });                // camo crop top, bare midriff
  arms(b, u, skin, skin, skin, skin, { up: 0.045, fore: 0.04 });
  const h = headBase(skin, 'clean', { w: 0.95 });
  h.add(at(sph(0.16, hair, [1.25, 1.0, 0.95]), 0, 0.19, -0.075));                         // big teased hair
  h.add(at(sph(0.1, hair, [1, 1.4, 0.8]), 0, 0.02, -0.12));
  for (const sx of [-1, 1]) h.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 16), M('#e0b13b', { metalness: 0.9, roughness: 0.2 })), sx * 0.125, 0.04, 0, 0, Math.PI / 2));
  h.add(at(box(0.16, 0.012, 0.012, M('#c81e1e')), 0, 0.2, 0.08));                       // red bandana band
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.28);
}
function buildChad(b, u, team) {
  const skin = M('#e9b48c'), shorts = M('#f4978e'), polo = tex(TX.knit('#9fd3f0')), shoe = M('#8b5a2b', { roughness: 0.4 }), sweater = M('#fde68a');
  legs(b, u, shorts, skin, shoe, { thigh: 0.09, shin: 0.07, foot: 0.07, thighTo: 0.55 });
  for (const s of ['Left', 'Right']) put(b[`${s}Foot`], box(0.1, 0.02, 0.28, M('#f5f5f0')), u, [0, -0.03, 0.06]);   // boat-shoe soles
  torso(b, u, shorts, polo, polo, { hip: 0.16, mid: 0.17, chest: 0.21 });               // broad chest, gym bro
  arms(b, u, polo, skin, skin, skin, { up: 0.07, fore: 0.055 });
  for (const sx of [-1, 1]) put(b.Spine2, at(box(0.09, 0.11, 0.015, M('#ffffff')), 0, 0, 0, -0.25, 0, sx * 0.35), u, [sx * 0.07, 0.25, 0.09]); // POPPED collar
  put(b.Spine2, at(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.042, 8, 20, Math.PI), sweater), 0, 0, 0, -Math.PI / 2.3), u, [0, 0.2, 0.0]); // sweater over the shoulders
  put(b.Spine2, sph(0.05, sweater), u, [0, 0.1, 0.17]);
  const h = headBase(skin, 'grin', { w: 1.05, jaw: 1.5 });
  h.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.126, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), M('#d9b45a', { roughness: 0.35 })), 0, 0.11, -0.01)); // slicked-back hair
  h.add(at(sph(0.06, M('#d9b45a', { roughness: 0.35 }), [1.6, 0.55, 1.1]), 0, 0.21, 0.04));
  h.add(at(wayfarers(), 0, 0.11, 0.122));
  for (const sx of [-1, 1]) h.add(at(sph(0.012, M('#ffffff')), sx * 0.12, 0.08, 0.02)); // AirPods
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildKaren(b, u, team) {
  const skin = M('#f3cfb5'), legg = M('#1f1f24', { roughness: 0.5 }), top = tex(TX.knit('#c4b5fd')), shoe = M('#f8fafc'), hair = M('#ead7a2', { roughness: 0.9 });
  legs(b, u, legg, legg, shoe, { thigh: 0.08, shin: 0.06, foot: 0.06 });
  torso(b, u, legg, top, top, { hip: 0.15, mid: 0.13, chest: 0.15 });
  arms(b, u, top, top, skin, skin, { up: 0.048, fore: 0.042 });
  const h = headBase(skin, 'clean', { w: 0.95, h: 1.15 });
  h.add(at(sph(0.14, hair, [1.15, 0.8, 0.95]), 0, 0.16, -0.05));                      // the bob...
  h.add(at(box(0.05, 0.17, 0.13, hair), 0.125, 0.04, 0.0, 0, 0, -0.1));                 // ...long on one side
  h.add(at(box(0.04, 0.1, 0.12, hair), -0.125, 0.08, 0.0, 0, 0, 0.1));                  // ...short on the other
  h.add(at(aviators('#0b0b0b', '#c9a227', 1.45), 0, 0.105, 0.122));                     // GIANT sunglasses
  h.add(at(box(0.012, 0.13, 0.065, M('#111827', { roughness: 0.2 })), 0.13, 0.08, 0.02)); // phone glued to her ear
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.3);
}
function buildGolfDad(b, u, team) {
  const skin = M('#eab995'), polo = tex(TX.knit('#1e3a5f')), khaki = M('#d6c7a1'), shoe = M('#f8fafc', { roughness: 0.4 }), cap = M('#f8fafc');
  legs(b, u, khaki, khaki, shoe, { thigh: 0.095, shin: 0.075, foot: 0.07 });
  for (const s of ['Left', 'Right']) put(b[`${s}Foot`], box(0.11, 0.025, 0.26, M('#9ca3af')), u, [0, -0.03, 0.05]);
  torso(b, u, khaki, polo, polo, { hip: 0.17, mid: 0.18, chest: 0.18 });
  put(b.Spine, sph(0.22, polo, [1.02, 0.9, 0.95]), u, [0, 0.02, 0.09]);                // dad gut
  put(b.Hips, box(0.42, 0.05, 0.32, M('#1f2937')), u, [0, 0.07, 0.02]);
  arms(b, u, polo, skin, skin, skin, { up: 0.062, fore: 0.05 });
  put(b.LeftHand, sph(0.05, M('#ffffff'), [0.95, 1.35, 0.65]), u, [0, 0.05, 0]);       // golf glove
  const h = headBase(skin, 'clean', { w: 1.02, jaw: 0.8 });
  h.add(at(box(0.07, 0.016, 0.015, M('#8a8a8a')), 0, 0.055, 0.12));                      // grey mustache
  for (const sx of [-1, 1]) h.add(at(sph(0.04, M('#9ca3af', { roughness: 1 }), [0.6, 1, 1]), sx * 0.11, 0.1, -0.03));
  h.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap), 0, 0.14, 0));
  h.add(at(box(0.2, 0.012, 0.13, cap), 0, 0.145, 0.15, 0.1));
  h.add(at(box(0.05, 0.03, 0.005, M('#1e3a5f')), 0, 0.2, 0.125, -0.3));                 // club logo
  put(b.Head, h, u, [0, 0, 0.01], [0, 0, 0], 1.28);
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
function torso(b, u, hipM, midM, chestM, { hip = 0.16, mid = 0.16, chest = 0.17 } = {}) {
  seg(b.Hips, b.Spine, hip, hipM, u, { sz: 0.8 });
  seg(b.Spine, b.Spine1, mid, midM, u, { sz: 0.8 });
  seg(b.Spine1, b.Spine2, mid * 1.02, midM === chestM ? chestM : midM, u, { sz: 0.8 });
  seg(b.Spine2, b.Neck, chest, chestM, u, { sz: 0.75 });
  seg(b.Neck, b.Head, 0.055, M('#e3ad8a'), u);
}
function arms(b, u, shoulderM, upperM, foreM, handM, { up = 0.055, fore = 0.045 } = {}) {
  for (const s of ['Left', 'Right']) {
    seg(b[`${s}Shoulder`], b[`${s}Arm`], up * 1.15, shoulderM, u);
    seg(b[`${s}Arm`], b[`${s}ForeArm`], up, upperM, u);
    seg(b[`${s}ForeArm`], b[`${s}Hand`], fore, foreM, u);
    put(b[`${s}Hand`], sph(0.05, handM, [0.95, 1.3, 0.65]), u, [0, 0.05, 0]);
  }
}

const BUILDERS = { bubba: buildBubba, cletus: buildCletus, darlene: buildDarlene, chad: buildChad, karen: buildKaren, golfdad: buildGolfDad };
export function buildCaricature(bones, unit, archetype, teamColor) {
  (BUILDERS[archetype] || buildChad)(bones, unit, teamColor);
}
