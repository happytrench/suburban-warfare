// First-person arms: the player's own generated human (sleeves, skin, fingers) holding the gun.
// The body is posed from the rifle mocap (for the finger grip), then both arms are solved with
// two-bone IK so the right hand sits on the pistol grip and the left on the handguard / pump.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { skeletonTemplate, mixamoClips } from './mixamo.js';
import { attachHuman } from './humans.js';

import { measureHands, holdGun } from './ik.js';

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
  B.Head.scale.setScalar(0.001);            // the camera is where the head would be
  for (const n of ['LeftUpLeg', 'RightUpLeg']) B[n].scale.setScalar(0.001);
  // place the body: shoulders a little below and behind the camera (viewmodel-local camera ~ (-0.36, 0.35, 0.76))
  // rifle stance: body bladed so the support (left) shoulder leads
  holder.rotation.y = Math.PI + 0.75;
  root.updateMatrixWorld(true);
  const neck = root.worldToLocal(worldP(B.Neck)).sub(holder.position);
  holder.position.copy(camLocal).add(V(0.02, -0.2, -0.07)).sub(neck);

  /** Put the hands on a gun (a child of the same parent as root). */
  const pose = (gun) => { root.parent.updateMatrixWorld(true); holdGun(B, rest, gun); };
  return { root, pose, model };
}
