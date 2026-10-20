// First-person arms: the player's own generated human (sleeves, skin, fingers) holding the gun.
// The body is posed from the rifle mocap (for the finger grip), then both arms are solved with
// two-bone IK so the right hand sits on the pistol grip and the left on the handguard / pump.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { skeletonTemplate, mixamoClips } from './mixamo.js';
import { attachHuman } from './humans.js';

import { measureHands, holdGun, gunTargets, armReach, shoulderPos } from './ik.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const worldP = (o) => o.getWorldPosition(new THREE.Vector3());

/**
 * Build arms for a generated human asset. Returns { root, pose(gun) }.
 * root goes inside the viewmodel group (same space as the gun models, metres before viewmodel scale).
 */
export function buildFPArms(asset, camLocal = V(-0.24, 0.24, 0.4)) {
  const model = SkeletonUtils.clone(skeletonTemplate);
  attachHuman(model, asset);
  const B = {};
  model.traverse((o) => { if (o.isBone) B[o.name.replace(/^mixamorig/, '')] = o; if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  const root = new THREE.Group();
  const holder = new THREE.Group(); holder.rotation.y = Math.PI; // body faces -z like the camera
  holder.add(model); root.add(holder);
  // rest-pose hand frames (T-pose: palms down, fingers along the arm)
  root.updateMatrixWorld(true);
  const rest = measureHands(B);
  // finger grip + shoulders from the mocap idle
  if (mixamoClips.idle) {
    const mx = new THREE.AnimationMixer(model);
    mx.clipAction(mixamoClips.idle).play(); mx.update(0.3); mx.stopAllAction();
  }
  // finger grip: curl each finger joint toward the palm (right: around the pistol grip, index on the trigger)
  const ax = V(0, 0, 1), sgn = 1; // Mixamo finger bones curl about local +z
  const q = new THREE.Quaternion();
  for (const s of ['Left', 'Right']) {
    const side = s === 'Left' ? 1 : -1;
    for (const [f, ang] of [['Index', s === 'Right' ? 0.5 : 1.1], ['Middle', 1.25], ['Ring', 1.3], ['Pinky', 1.35]]) {
      for (let k = 1; k <= 3; k++) {
        const b = B[`${s}Hand${f}${k}`]; if (!b) continue;
        b.quaternion.copy(q.setFromAxisAngle(ax, sgn * side * ang * (k === 1 ? 0.8 : 1.0)));
      }
    }
    for (let k = 1; k <= 3; k++) { const b = B[`${s}HandThumb${k}`]; if (b) b.quaternion.multiply(q.setFromAxisAngle(ax, sgn * side * 0.35)); }
  }
  // first-person cheat every shooter uses: longer forearms so the support hand reaches the handguard
  for (const s of ['Left', 'Right']) { B[`${s}ForeArm`].position.multiplyScalar(1.12); B[`${s}Hand`].position.multiplyScalar(1.12); }
  // draw only the arms (sleeves, hands): drop every triangle that belongs to the torso, legs or head
  const armBone = (n) => /(ForeArm|Hand)/.test(n);
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const names = o.skeleton.bones.map((b) => b.name.replace(/^mixamorig/, ''));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, idx = o.geometry.index;
    const dom = (v) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } } return names[best]; };
    const keep = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      if (armBone(dom(a)) && armBone(dom(b)) && armBone(dom(c)) && !/Shoulder/.test(dom(a) + dom(b) + dom(c))) keep.push(a, b, c);
    }
    const g = o.geometry.clone(); g.setIndex(keep); o.geometry = g;
    // open cut edges near the shoulder: draw back faces too so the sleeve never turns see-through
    o.material = o.material.clone(); o.material.side = THREE.DoubleSide;
    if (!keep.length) o.visible = false;
  });
  // place the body: shoulders a little below and behind the camera (viewmodel-local camera ~ (-0.36, 0.35, 0.76))
  // rifle stance: body bladed so the support (left) shoulder leads
  holder.rotation.y = Math.PI + 0.45;
  root.updateMatrixWorld(true);
  const neck = root.worldToLocal(worldP(B.Neck)).sub(holder.position);
  holder.position.copy(camLocal).add(V(0.0, -0.21, 0.06)).sub(neck);

  /** Put the hands on a gun (a child of the same parent as root). */
  const base = holder.position.clone();
  const pose = (gun, ov = null) => {
    // slide the body toward the gun until both hands can reach comfortably (88% of arm length)
    holder.position.copy(base);
    for (let it = 0; it < 6; it++) {
      root.parent.updateMatrixWorld(true);
      const t = gunTargets(gun, 0.2);
      if (!t) return;
      let worst = null, over = 0;
      for (const s of ['Right', 'Left']) {
        const S = shoulderPos(B, s), d = t[s].wrist.distanceTo(S) - armReach(B, s) * 0.88;
        if (d > over) { over = d; worst = t[s].wrist.clone().sub(S).normalize().multiplyScalar(d); }
      }
      if (!worst) break;
      const a = root.worldToLocal(new THREE.Vector3()), b2 = root.worldToLocal(worst.clone());
      holder.position.add(b2.sub(a).multiplyScalar(1.05));
    }
    root.parent.updateMatrixWorld(true);
    holdGun(B, rest, gun, 0.2, ov);
  };
  return { root, pose, model };
}
