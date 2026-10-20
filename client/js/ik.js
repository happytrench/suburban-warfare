// Two-bone arm IK that puts a character's hands on a gun (shared by first- and third-person).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpM = new THREE.Matrix4();

function basis(f, p) { // orthonormal frame from finger direction f and palm normal p
  const x = f.clone().normalize(), z = p.clone().sub(x.clone().multiplyScalar(p.dot(x))).normalize(), y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(x, y, z));
}
const worldQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const worldP = (o) => o.getWorldPosition(new THREE.Vector3());
function setWorldQ(bone, q) {
  bone.parent.getWorldQuaternion(tmpQ).invert();
  bone.quaternion.copy(tmpQ.multiply(q));
  bone.updateMatrixWorld(true);
}
// rotate bone so the direction to its child joint points at target
function aim(bone, child, target) {
  const from = worldP(child).sub(worldP(bone)).normalize();
  const to = target.clone().sub(worldP(bone)).normalize();
  tmpQ2.setFromUnitVectors(from, to);
  setWorldQ(bone, tmpQ2.multiply(worldQ(bone)));
}

/** Rest-pose hand frames; call on a freshly bound skeleton in T-pose (palms down). */
export function measureHands(B) {
  const rest = {};
  for (const s of ['Left', 'Right']) {
    const f = worldP(B[`${s}HandMiddle1`]).sub(worldP(B[`${s}Hand`]));
    rest[s] = { frame: basis(f, V(0, -1, 0)), q: worldQ(B[`${s}Hand`]) };
  }
  return rest;
}
function solve(B, rest, s, wrist, f, p, pole, blend = 1) {
  const up = B[`${s}Arm`], fore = B[`${s}ForeArm`], hand = B[`${s}Hand`];
  const S = worldP(up), a = worldP(fore).distanceTo(S), b = worldP(hand).distanceTo(worldP(fore));
  const d = Math.min(wrist.distanceTo(S), (a + b) * 0.999);
  const dir = wrist.clone().sub(S).normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(a * cosA)).add(side.multiplyScalar(a * Math.sqrt(Math.max(0, 1 - cosA * cosA))));
  aim(up, fore, elbow);
  aim(fore, hand, wrist);
  const target = basis(f, p).multiply(rest[s].frame.clone().invert()).multiply(rest[s].q);
  setWorldQ(hand, blend >= 1 ? target : worldQ(hand).slerp(target, blend));
}
/** Where the wrists go on a gun (world space). */
export function gunTargets(gun, reach = 0.24) {
  const ud = gun.userData;
  if (!ud.grip) return null;
  gun.updateMatrixWorld(true);
  const W = (v) => gun.localToWorld(v.clone());
  const gq = worldQ(gun);
  const dirW = (v) => v.clone().applyQuaternion(gq).normalize();
  return {
    Right: { wrist: W(ud.grip.clone().add(V(-0.032, 0.035, -0.04))), f: dirW(V(0, -0.55, 1)), p: dirW(V(1, 0, 0)), pole: dirW(V(-1, -1, 0)) },
    Left: { wrist: W(ud.fore.clone().add(V(0.035, -0.04, -0.03)).setZ(Math.min(ud.fore.z, (ud.reach || reach) + (ud.pump ? ud.pump.position.z : 0)))), f: dirW(V(-1, 0.15, 0.35)), p: dirW(V(0, 1, 0)), pole: dirW(V(1, -1.2, 0)) },
  };
}
/** Arm length (shoulder -> wrist when straight), world units. */
export function armReach(B, s) {
  const S = worldP(B[`${s}Arm`]), E = worldP(B[`${s}ForeArm`]), H = worldP(B[`${s}Hand`]);
  return S.distanceTo(E) + E.distanceTo(H);
}
export const shoulderPos = (B, s) => worldP(B[`${s}Arm`]);
/** Right hand on the pistol grip, left under the handguard / pump. gun: model with userData.grip/fore. */
export function holdGun(B, rest, gun, reach = 0.24) {
  const t = gunTargets(gun, reach);
  if (!t) return;
  for (const s of ['Right', 'Left']) solve(B, rest, s, t[s].wrist, t[s].f, t[s].p, t[s].pole);
}
