// Motion-captured characters: a standard humanoid skeleton (Mixamo rig from the three.js example
// "Xbot") drives segmented, outfitted bodies built for each faction — the classic console-era
// technique. The mannequin mesh itself is hidden; only its bones and animations are used.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as TX from './textures.js';
import { buildGunModel } from './characters.js';
import { loadMixamo, skeletonTemplate, mixamoClips } from './mixamo.js';
import { buildCaricature, buildHumanGear, pickArchetype, ARCHETYPES } from './caricatures.js';
import { loadHuman, attachHuman } from './humans.js';
import { measureHands, holdGun } from './ik.js';

const humans = new Map(); // archetype -> generated human asset, once loaded

let template = null;      // Xbot: animation source + fallback skeleton
let bodyTemplate = null;  // textured, skinned character body (same Mixamo skeleton)
let clips = {};
const bodyClips = {};
let loading = null;

const loadGltf = (url) => new Promise((resolve) => new GLTFLoader().load(url, resolve, undefined, () => resolve(null)));

export function loadRig(base = 'vendor/models/') {
  if (loading) return loading;
  loading = (async () => {
    // A textured body can be dropped in here once a rig-compatible character with matching animations is available.
    // preferred: Mixamo rifle animations (their skeleton comes with them)
    if (await loadMixamo(base)) {
      template = skeletonTemplate; clips = mixamoClips;
      // realistic bodies stream in behind; until one arrives that archetype uses its cartoon build
      for (const a of [...ARCHETYPES.country, ...ARCHETYPES.suburban]) loadHuman(a).then((h) => { if (h) humans.set(a, h); });
      return true;
    }
    const [xbot, body] = [await loadGltf(`${base}Xbot.glb`), null];
    if (!xbot) return false;
    template = xbot.scene;
    for (const a of xbot.animations) {
      a.tracks = a.tracks.filter((t) => !/Hips\.position/.test(t.name));
      clips[a.name.toLowerCase()] = a;
    }
    if (body) {
      bodyTemplate = body.scene;
      bodyTemplate.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.frustumCulled = false; } });
      // retarget the mocap clips onto the body's own skeleton (rest poses differ between rigs)
      let src = null, dst = null;
      xbot.scene.traverse((c) => { if (c.isSkinnedMesh && !src) src = c; });
      bodyTemplate.traverse((c) => { if (c.isSkinnedMesh && !dst) dst = c; });
      try {
        for (const name of ['idle', 'walk', 'run']) {
          if (!clips[name]) continue;
          const rc = SkeletonUtils.retargetClip(dst, src, clips[name], { hip: 'mixamorigHips', useFirstFramePosition: true, fps: 30 });
          rc.tracks = rc.tracks.filter((t) => !/Hips\.position/.test(t.name));
          bodyClips[name] = rc;
        }
        dst.skeleton.pose();
      } catch (e) { console.warn('retarget failed', e); bodyTemplate = null; }
    }
    return true;
  })();
  return loading;
}
export const rigReady = () => !!template;

const B = (root, name) => root.getObjectByName(`mixamorig${name}`) || root.getObjectByName(`mixamorig:${name}`);

const SKIN = ['#f2c9a8', '#eab991', '#f5d2b8', '#e3ad8a', '#efc4a0'];
const SUNBURN = '#e08a74';

function M(c, extra = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra }); }

function outfitMaterials(id, color, outfit) {
  const country = outfit === 'country';
  const female = id % 2 === 1;
  const skinColor = SKIN[id % SKIN.length];
  const skin = M(skinColor, { roughness: 0.65 });
  const burnt = M(country ? SUNBURN : skinColor, { roughness: 0.65 });
  let shirt, pants, shoes, shins, upperArm;
  if (country) {
    shirt = female ? M('#ffffff', { map: TX.camo(), roughness: 0.9 }) : M('#ffffff', { map: TX.flannel(color), roughness: 0.9 });
    pants = M('#ffffff', { map: TX.denim(), roughness: 0.9 });
    shoes = M(female ? '#7c4a1e' : '#4a2f18', { roughness: 0.6 });
    shins = skin; upperArm = burnt;
  } else {
    shirt = M('#ffffff', { map: TX.knit(female ? '#f9a8d4' : color), roughness: 0.9 });
    pants = M(female ? '#f8fafc' : '#d9c9a3');
    shoes = M(female ? '#e7e5e4' : '#8b5a2b', { roughness: 0.5 });
    shins = female ? pants : skin;
    upperArm = female ? M('#e7e5e4') : shirt;
  }
  return { country, female, skinColor, skin, burnt, shirt, pants, shoes, shins, upperArm, forearm: country ? burnt : skin };
}

// Capsule spanning from the bone origin to its child joint, in the bone's local (scaled) units.
function segment(bone, child, radiusM, mat, unit) {
  const to = child.position.clone();
  const len = to.length();
  const r = radiusM / unit;
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 0.6), 4, 10);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().normalize());
  mesh.castShadow = true;
  bone.add(mesh);
  return mesh;
}

function attach(bone, obj, unit, pos = [0, 0, 0], rot = [0, 0, 0]) {
  obj.scale.multiplyScalar(1 / unit);
  obj.position.set(pos[0] / unit, pos[1] / unit, pos[2] / unit);
  obj.rotation.set(rot[0], rot[1], rot[2]);
  obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  bone.add(obj);
  return obj;
}

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const sph = (r, m, sx = 1, sy = 1, sz = 1) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); s.scale.set(sx, sy, sz); return s; };

function buildHead(o, color) {
  const g = new THREE.Group();
  const { country, female, skin, burnt } = o;
  const h = sph(0.115, skin, 0.95, 1.12, 1); h.position.y = 0.09; g.add(h);
  const faceKind = country ? (female ? 'clean' : 'beard') : (female ? 'clean' : 'grin');
  const faceGeo = new THREE.SphereGeometry(0.117, 16, 12, Math.PI * 0.5 - 0.75, 1.5, Math.PI * 0.22, Math.PI * 0.6);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: TX.face(faceKind, o.skinColor), transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false }));
  face.scale.set(0.95, 1.12, 1); face.position.y = 0.09; g.add(face);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.045, 6), country ? burnt : skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.075, 0.122); g.add(nose);
  for (const sx of [-1, 1]) { const ear = sph(0.027, skin, 0.5, 1, 0.8); ear.position.set(sx * 0.112, 0.085, 0); g.add(ear); }
  if (country && !female) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.123, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#f1f5f9')); cap.position.y = 0.15; g.add(cap);
    const front = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 8, -0.9, 1.8, 0, Math.PI / 2), M(color)); front.position.y = 0.15; g.add(front);
    const brim = box(0.2, 0.015, 0.13, M(color)); brim.position.set(0, 0.16, 0.15); brim.rotation.x = 0.12; g.add(brim);
    const mullet = box(0.2, 0.2, 0.07, M('#6b4423', { roughness: 1 })); mullet.position.set(0, 0.03, -0.1); g.add(mullet);
    const beard = sph(0.1, M('#5a3a1e', { roughness: 1 }), 1, 0.9, 0.8); beard.position.set(0, 0.01, 0.06); g.add(beard);
  } else if (country && female) {
    const hair = sph(0.14, M('#b8762e', { roughness: 0.95 }), 1.1, 0.95, 1.05); hair.position.set(0, 0.13, -0.02); g.add(hair);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), M('#b8762e')); tail.position.set(0, 0.03, -0.14); tail.rotation.x = 0.4; g.add(tail);
  } else if (!country && !female) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), M('#d4b04c', { roughness: 0.9 })); hair.position.y = 0.11; g.add(hair);
    const swoop = sph(0.06, M('#e2c56a'), 1.4, 0.6, 1); swoop.position.set(0.035, 0.19, 0.05); g.add(swoop);
    const visor = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.016, 6, 20), M('#ffffff')); visor.rotation.x = Math.PI / 2; visor.position.y = 0.15; g.add(visor);
    const brim = box(0.19, 0.014, 0.12, M('#ffffff')); brim.position.set(0, 0.15, 0.145); brim.rotation.x = 0.15; g.add(brim);
    const shades = box(0.175, 0.038, 0.02, M('#b8860b', { roughness: 0.1, metalness: 0.9 })); shades.position.set(0, 0.105, 0.117); g.add(shades);
  } else {
    const bob = sph(0.138, M('#e9d8a6', { roughness: 0.85 }), 1.12, 0.85, 1.05); bob.position.set(0, 0.11, -0.02); g.add(bob);
    const longSide = box(0.05, 0.15, 0.13, M('#e9d8a6')); longSide.position.set(0.115, 0.03, 0.03); g.add(longSide);
    for (const sx of [-1, 1]) { const lens = sph(0.034, M('#111111', { roughness: 0.1, metalness: 0.5 }), 1.1, 0.9, 0.3); lens.position.set(sx * 0.044, 0.105, 0.117); g.add(lens); }
  }
  return g;
}

// Faction gear worn over the textured body: HOA = white visor + pastel sweater over the shoulders;
// Backroad Boys = trucker cap + blaze-orange vest.
function addFactionGear(bones, o, color, unit) {
  if (o.country) {
    const cap = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#f1f5f9')); cap.add(crown);
    const front = new THREE.Mesh(new THREE.SphereGeometry(0.117, 14, 8, -0.9, 1.8, 0, Math.PI / 2), M(color)); cap.add(front);
    const brim = box(0.19, 0.014, 0.13, M(color)); brim.position.set(0, 0.01, 0.15); brim.rotation.x = 0.12; cap.add(brim);
    attach(bones.Head, cap, unit, [0, 0.16, 0.01]);
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.3, 14, 1, true), M('#ff6a00', { side: THREE.DoubleSide, roughness: 0.7 }));
    vest.scale.z = 0.8;
    attach(bones.Spine2, vest, unit, [0, 0.0, 0.0]);
  } else {
    const visor = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 6, 22), M('#ffffff')); band.rotation.x = Math.PI / 2; visor.add(band);
    const brim = box(0.18, 0.012, 0.12, M('#ffffff')); brim.position.set(0, 0, 0.14); brim.rotation.x = 0.15; visor.add(brim);
    attach(bones.Head, visor, unit, [0, 0.14, 0.01]);
    const sweater = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 16, Math.PI), M(color === '#3b82f6' ? '#fde68a' : '#fbcfe8'));
    attach(bones.Spine2, sweater, unit, [0, 0.13, 0.01], [-Math.PI / 2.4, 0, 0]);
  }
}

/**
 * Build a rigged, animated character. Returns a Group compatible with the game's remote-player code:
 * userData: { legs, head, hips, gun, rifle, shotgun, deer, armR, armL, rig: { mixer, actions, bones, setPose } }
 */
export function buildRiggedCharacter({ id, color, outfit }) {
  const o = outfitMaterials(id, color, outfit);
  const skinned = !!bodyTemplate;
  const model = SkeletonUtils.clone(skinned ? bodyTemplate : template);
  if (skinned) {
    // each player gets their own material so hit-flashes don't light up everyone
    model.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.castShadow = true; c.frustumCulled = false; } });
  } else {
    model.traverse((c) => { if (c.isSkinnedMesh) c.visible = false; });
  }
  model.updateMatrixWorld(true);
  const bones = {};
  for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']) bones[n] = B(model, n);
  const unit = bones.Hips.getWorldScale(new THREE.Vector3()).x; // armature units → metres

  const archetype = pickArchetype(outfit, id);
  let meshesForFlash = null, pendingHuman = null, handRest = null, headRest = null;
  const allBones = {};
  if (skinned) {
    addFactionGear(bones, o, color, unit);
  } else if (clips.back && humans.has(archetype)) {
    const h = humans.get(archetype);
    meshesForFlash = attachHuman(model, h);
    model.updateMatrixWorld(true);
    model.traverse((o) => { if (o.isBone) allBones[o.name.replace(/^mixamorig\d*[:_]?/, '')] = o; });
    handRest = measureHands(allBones);
    headRest = bones.Head.getWorldQuaternion(new THREE.Quaternion()); // model space == holder space at build time (no parent yet)
    buildHumanGear(bones, bones.Hips.getWorldScale(new THREE.Vector3()).x, archetype, color, h.h.metrics);
  } else if (clips.back) {
    buildCaricature(bones, unit, archetype, color);
    pendingHuman = archetype;
  } else {
  // legs
  for (const s of ['Left', 'Right']) {
    segment(bones[`${s}UpLeg`], bones[`${s}Leg`], 0.085, o.pants, unit);
    segment(bones[`${s}Leg`], bones[`${s}Foot`], 0.065, o.shins, unit);
    segment(bones[`${s}Foot`], bones[`${s}ToeBase`], 0.055, o.shoes, unit);
    if (o.country) {
      // boot shaft over the lower shin, just above the ankle joint
      const ankle = bones[`${s}Foot`].position.clone().multiplyScalar(0.78);
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 / unit, 0.16 / unit, 4, 10), o.shoes);
      boot.position.copy(ankle); boot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ankle.clone().normalize()); boot.castShadow = true;
      bones[`${s}Leg`].add(boot);
    }
  }
  // torso: hips → spine → chest, belly for Bubba, shoulders
  segment(bones.Hips, bones.Spine, 0.15, o.pants, unit);
  segment(bones.Spine, bones.Spine1, 0.15, o.shirt, unit);
  segment(bones.Spine1, bones.Spine2, 0.16, o.shirt, unit);
  segment(bones.Spine2, bones.Neck, 0.17, o.shirt, unit);
  segment(bones.Neck, bones.Head, 0.055, o.burnt, unit);
  if (o.country && !o.female) attach(bones.Spine1, sph(0.17, o.shirt, 1.05, 0.95, 0.95), unit, [0, 0.02, 0.07]);
  if (o.country && o.female) attach(bones.Spine2, new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.175, 0.32, 12, 1, true), M('#ff6a00', { side: THREE.DoubleSide })), unit, [0, 0.02, 0], [0, 0, 0]);
  if (!o.country && !o.female) {
    const sweater = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 16, Math.PI), M('#fde68a'));
    attach(bones.Spine2, sweater, unit, [0, 0.16, 0.02], [-Math.PI / 2.4, 0, 0]);
    attach(bones.Spine2, sph(0.045, M('#fde68a')), unit, [0, 0.05, 0.15]);
    for (const sx of [-1, 1]) attach(bones.Spine2, box(0.07, 0.08, 0.02, M('#ffffff')), unit, [sx * 0.06, 0.24, 0.07], [0, 0, sx * 0.3]);
  }
  // arms
  for (const s of ['Left', 'Right']) {
    segment(bones[`${s}Shoulder`], bones[`${s}Arm`], 0.075, o.shirt, unit);
    segment(bones[`${s}Arm`], bones[`${s}ForeArm`], o.country && !o.female ? 0.062 : 0.052, o.upperArm, unit);
    segment(bones[`${s}ForeArm`], bones[`${s}Hand`], 0.045, o.forearm, unit);
    attach(bones[`${s}Hand`], sph(0.045, o.skin, 0.9, 1.3, 0.6), unit, [0, 0.05, 0]);
  }
  // head + accessories
  attach(bones.Head, buildHead(o, color), unit, [0, 0, 0.01]);
  }

  // gun: carried at the chest, aimed with the body
  const gun = new THREE.Group();
  const rifle = buildGunModel('rifle'); gun.add(rifle);
  const shotgun = buildGunModel('shotgun'); shotgun.visible = false; gun.add(shotgun);
  const deer = buildGunModel('deer'); deer.visible = false; gun.add(deer);
  for (const g of [rifle, shotgun, deer]) g.traverse((c) => { if (c.isMesh) c.castShadow = true; });

  // animation: idle / walk / run blended by speed; arms overridden into a rifle hold
  let mixerRoot = model;
  if (skinned) model.traverse((c) => { if (c.isSkinnedMesh && mixerRoot === model) mixerRoot = c; });
  const mixer = new THREE.AnimationMixer(mixerRoot);
  const actions = {};
  const rifleMocap = !!clips.back;   // full Mixamo rifle set available
  for (const name of Object.keys(clips)) {
    const clip = skinned ? bodyClips[name] : clips[name];
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (/death|hit|jump/.test(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = /death/.test(name); }
    else { a.play(); a.setEffectiveWeight(name === 'idle' ? 1 : 0); }
    actions[name] = a;
  }
  mixer.update(Math.random());

  // Mixamo characters face +z; the game's forward is -z.
  const body = new THREE.Group();
  const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.add(model); body.add(holder);
  holder.add(gun);
  const chest = new THREE.Vector3();

  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const restDir = {};
  for (const n of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) {
    const child = { LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand' }[n];
    restDir[n] = bones[child].position.clone().normalize();
  }
  // point a bone (its child direction) along a direction given in the character's own space (+z = forward)
  const aimBone = (name, dir) => {
    const bone = bones[name];
    bone.parent.getWorldQuaternion(tmpQ);
    model.parent.getWorldQuaternion(new THREE.Quaternion()); // ensure matrices are fresh
    tmpV.copy(dir).normalize().applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
    tmpV.applyQuaternion(tmpQ.invert());
    bone.quaternion.setFromUnitVectors(restDir[name], tmpV);
    bone.updateMatrixWorld(true);
  };
  const pose = (pitch) => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (x, y, z) => new THREE.Vector3(x, y * cp + z * sp, -y * sp + z * cp);
    // spine bends with aim
    bones.Spine2.rotation.x += -pitch * 0.5;
    bones.Spine2.updateMatrixWorld(true);
    // gun sits in front of the chest, pitched with the aim (character space: +z forward, -x = right side)
    bones.Spine2.getWorldPosition(chest); holder.worldToLocal(chest);
    gun.position.set(chest.x - 0.12, chest.y + 0.02 + sp * 0.25, chest.z + 0.32 * cp);
    gun.rotation.set(-pitch, 0, 0);
    aimBone('RightArm', rot(-0.25, -0.55, 0.55));
    aimBone('RightForeArm', rot(0.35, 0.1, 1));
    aimBone('LeftArm', rot(0.3, -0.35, 0.9));
    aimBone('LeftForeArm', rot(-0.35, 0.12, 1));
  };
  // with rifle mocap the hands already hold an aim pose: the gun follows the right hand, aimed forward
  const hand = new THREE.Vector3(), lhand = new THREE.Vector3();
  const shoulder = new THREE.Vector3(), hq = new THREE.Quaternion(), pq = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  const placeGunHuman = (pitch) => {
    // gun butt in the right shoulder pocket, aimed where the player looks; hands solved onto it
    holder.updateMatrixWorld(true);
    bones.RightArm.getWorldPosition(shoulder); holder.worldToLocal(shoulder);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), ox = 0.07, oy = -0.08, oz = 0.34;
    gun.position.set(shoulder.x + ox, shoulder.y + oy * cp + oz * sp, shoulder.z + oz * cp - oy * sp);
    gun.rotation.set(-pitch, 0, 0);
    const active = [rifle, shotgun, deer].find((g) => g.visible) || rifle;
    holdGun(allBones, handRest, active);
    // head looks down the sights instead of at the floor
    holder.getWorldQuaternion(hq);
    pq.setFromAxisAngle(X, -pitch * 0.8);
    const want = hq.multiply(pq).multiply(headRest);
    bones.Head.parent.getWorldQuaternion(pq).invert();
    bones.Head.quaternion.slerp(pq.multiply(want), 0.85);
    bones.Head.updateMatrixWorld(true);
  };
  const placeGun = (pitch) => {
    if (handRest) { placeGunHuman(pitch); return; }
    bones.RightHand.getWorldPosition(hand); holder.worldToLocal(hand);
    bones.LeftHand.getWorldPosition(lhand); holder.worldToLocal(lhand);
    // aim along the line from the right hand toward the left (support) hand, levelled to the player's pitch
    gun.position.copy(hand);
    const dir = lhand.sub(hand); dir.y = 0; const yaw = Math.atan2(dir.x, dir.z);
    gun.rotation.set(-pitch, Math.abs(yaw) < 0.6 ? yaw : 0, 0, 'YXZ');
    gun.position.y -= 0.02;
  };
  const rig = rifleMocap
    ? { mixamo: true, mixer, actions, bones, model, placeGun, dead: false, deathAct: null, jumping: 0, w: { idle: 1, walk: 0, run: 0, back: 0, left: 0, right: 0 } }
    : { mixer, actions, bones, pose, model };
  body.userData = {
    legs: [new THREE.Object3D(), new THREE.Object3D()], head: bones.Head, hips: holder, gun, rifle, shotgun, deer,
    armR: new THREE.Object3D(), armL: new THREE.Object3D(), rig, mocap: rifleMocap, archetype, human: !!meshesForFlash, pendingHuman,
  };
  // own material instances per player so hit flashes only light up the one who got hit
  const mc = new Map();
  body.traverse((c) => { if (c.isMesh && c.material && !Array.isArray(c.material)) { if (!mc.has(c.material)) mc.set(c.material, c.material.clone()); c.material = mc.get(c.material); } });
  void Y;
  return body;
}

// Blend idle/walk/run by speed (m/s) and advance the animation.
export function animateRig(rig, speed, dt, pitch, alive) {
  const { actions, mixer } = rig;
  const w = { idle: 0, walk: 0, run: 0 };
  if (speed < 0.6) w.idle = 1;
  else if (speed < 6.5) { const k = Math.min(1, (speed - 0.6) / 2); w.idle = 1 - k; w.walk = k; }
  else { const k = Math.min(1, (speed - 6.5) / 2); w.walk = 1 - k; w.run = k; }
  for (const n of Object.keys(actions)) actions[n].setEffectiveWeight(w[n]);
  if (actions.walk) actions.walk.setEffectiveTimeScale(Math.max(0.6, speed / 2.2));
  if (actions.run) actions.run.setEffectiveTimeScale(Math.max(0.8, speed / 7.5));
  mixer.update(dt);
  if (alive) rig.pose(pitch);
}

/** True once the realistic body for this archetype has loaded (remotes built before then can be rebuilt). */
export const humanReady = (archetype) => humans.has(archetype);
export const humanFor = (archetype) => humans.get(archetype) || null;
