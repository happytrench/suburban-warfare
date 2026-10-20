// Keyframed first-person weapon animations: full reloads with the support hand pulling and
// seating magazines / feeding shells / pushing rounds, driven through the arm IK.
// All positions are in the gun's own space (+z muzzle, metres); gun offsets are added to the viewmodel.
import * as THREE from 'three';

const ease = (t) => t * t * (3 - 2 * t);
// keys: [[u, [values...]], ...] sorted by u; returns smoothly interpolated array
function track(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, a] = keys[i - 1], [u1, b] = keys[i];
      const t = ease((u - u0) / (u1 - u0));
      return a.map((v, j) => v + (b[j] - v) * t);
    }
  }
  return keys[keys.length - 1][1];
}
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// hand grabs the magazine this far from its origin (top of the mag)
const MAG_GRAB = [0.045, -0.075, 0.045];
const RIFLE = {
  // lifted, pulled in and rolled so the magwell faces you
  gun: [[0, [0, 0, 0, 0, 0, 0]], [0.12, [-0.035, 0.04, 0.05, 0.14, 0.3, 0.6]], [0.3, [-0.04, 0.035, 0.05, 0.2, 0.34, 0.66]], [0.58, [-0.04, 0.035, 0.05, 0.22, 0.34, 0.64]],
    [0.66, [-0.035, 0.05, 0.05, 0.1, 0.28, 0.48]], [0.72, [-0.035, 0.042, 0.05, 0.13, 0.28, 0.5]], [0.86, [-0.01, 0.01, 0.01, -0.03, 0.08, 0.12]], [1, [0, 0, 0, 0, 0, 0]]],
  k: [[0, [0]], [0.1, [1]], [0.84, [1]], [0.97, [0]]],
  // seat is (0,-0.025,0.059); hand on the mag there = seat + MAG_GRAB = (0.045,-0.1,0.104)
  lh: [[0.08, [0.07, -0.06, 0.2]], [0.16, [0.045, -0.1, 0.104]], [0.24, [0.045, -0.17, 0.1]], [0.32, [0.14, -0.42, 0.04]], [0.44, [0.12, -0.48, 0.06]],
    [0.56, [0.05, -0.2, 0.1]], [0.64, [0.045, -0.1, 0.104]], [0.7, [0.045, -0.115, 0.104]], [0.82, [0.06, -0.03, 0.22]], [0.92, [0.04, -0.015, 0.27]]],
};
const SHOTGUN = {
  gun: [[0, [0, 0, 0, 0, 0, 0]], [0.1, [-0.035, 0.04, 0.05, 0.28, 0.3, 0.7]], [0.86, [-0.035, 0.04, 0.05, 0.3, 0.3, 0.7]], [1, [0, 0, 0, 0, 0, 0]]],
  k: [[0, [0]], [0.1, [1]], [0.86, [1]], [0.96, [0]]],
  lh: (() => { // three trips: down to the shell belt, up to the loading port, push the shell in
    const keys = [[0.08, [0.06, -0.06, 0.3]]];
    for (let i = 0; i < 3; i++) {
      const s = 0.12 + i * 0.24;
      keys.push([s, [0.1, -0.3, 0.02]], [s + 0.09, [0.03, -0.085, 0.07]], [s + 0.15, [0.02, -0.07, 0.13]], [s + 0.2, [0.05, -0.12, 0.09]]);
    }
    keys.push([0.9, [0.04, -0.03, 0.3]]);
    return keys;
  })(),
};
const PISTOL = { // tilt, hand to the grip's base, mag swap (the scanned mag is inside the grip), slide release
  gun: [[0, [0, 0, 0, 0, 0, 0]], [0.12, [-0.03, 0.05, 0.04, 0.25, 0.25, 0.5]], [0.7, [-0.03, 0.05, 0.04, 0.3, 0.25, 0.55]], [0.82, [-0.01, 0.03, 0.02, -0.15, 0.1, 0.1]], [1, [0, 0, 0, 0, 0, 0]]],
  k: [[0, [0]], [0.1, [1]], [0.85, [1]], [0.97, [0]]],
  lh: [[0.1, [0.04, -0.1, -0.06]], [0.25, [0.1, -0.4, -0.05]], [0.45, [0.08, -0.35, -0.04]], [0.6, [0.03, -0.13, -0.07]], [0.72, [0.02, 0.045, -0.02]], [0.82, [0.03, -0.07, -0.05]]],
};
const DEER = {
  gun: [[0, [0, 0, 0, 0, 0, 0]], [0.1, [-0.03, 0.035, 0.05, 0.16, 0.28, 0.42]], [0.85, [-0.03, 0.035, 0.05, 0.18, 0.28, 0.44]], [1, [0, 0, 0, 0, 0, 0]]],
  k: [[0, [0]], [0.1, [1]], [0.86, [1]], [0.96, [0]]],
  lh: [[0.08, [0.06, -0.04, 0.2]], [0.2, [0.09, -0.3, -0.05]], [0.3, [0.02, 0.1, -0.06]], [0.38, [0.0, 0.08, -0.04]], [0.46, [0.09, -0.3, -0.05]],
    [0.56, [0.02, 0.1, -0.06]], [0.64, [0.0, 0.08, -0.04]], [0.74, [0.05, 0.05, 0.05]], [0.9, [0.04, -0.01, 0.28]]],
  bolt: [[0, [0]], [0.08, [0]], [0.18, [1]], [0.72, [1]], [0.8, [0]]],
};

let dropped = null; // falling empty magazine (viewmodel scene)
/**
 * Evaluate a reload at phase u (0..1). Mutates the gun's parts (mag / bolt / carried shell) and returns
 * { gun: [px,py,pz,rx,ry,rz], ov: IK override for the left hand }.
 */
export function reloadPose(kind, gun, u, scene, viewmodel) {
  const ud = gun.userData;
  const A = kind === 'shotgun' ? SHOTGUN : kind === 'deer' ? DEER : kind === 'pistol' ? PISTOL : RIFLE;
  const magKind = ['rifle', 'ak', 'smg', 'pistol'].includes(kind);
  const g = track(A.gun, u), k = track(A.k, u)[0], lh = V(track(A.lh, u));
  const ov = { Left: { pos: lh, k, f: new THREE.Vector3(0.2, -1, 0.3), p: new THREE.Vector3(-1, 0.1, 0) } };
  if (magKind && ud.mag) {
    const seat = ud.magSeat;
    if (u < 0.17 || u >= 0.64) { ud.mag.visible = true; ud.mag.position.copy(seat); ud.mag.rotation.set(0, 0, 0); }
    else if (u < 0.25 || u >= 0.42) { ud.mag.visible = true; ud.mag.position.copy(lh).sub(V(MAG_GRAB)); ud.mag.rotation.set((u < 0.25 ? 0.1 : -0.15) * k, 0, 0); }
    else {
      ud.mag.visible = false;
      if (!dropped && scene) { // toss the empty: a copy falls out of view
        viewmodel.updateMatrixWorld(true);
        dropped = ud.mag.clone(); dropped.visible = true;
        ud.mag.parent.add(dropped); dropped.position.copy(lh).sub(V(MAG_GRAB));
        const wp = dropped.getWorldPosition(new THREE.Vector3()), wq = dropped.getWorldQuaternion(new THREE.Quaternion()), ws = dropped.getWorldScale(new THREE.Vector3());
        scene.attach(dropped); dropped.position.copy(wp); dropped.quaternion.copy(wq); dropped.scale.copy(ws);
        dropped.userData.v = new THREE.Vector3(0.15, -0.4, 0.05); dropped.userData.t = 0.8;
      }
    }
    if (u >= 0.42) dropped = dropped && dropped.userData.t > 0 ? dropped : null;
  }
  if (kind === 'deer' && ud.bolt) { const b = track(DEER.bolt, u)[0]; for (const x of ud.bolt) x.o.position.x = x.x0 - 0.075 * b; }
  // a round / shell carried in the hand
  if (!magKind) {
    if (!ud.carry) {
      const shell = kind === 'shotgun'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.045, 10), new THREE.MeshStandardMaterial({ color: '#9b1c1c', roughness: 0.55 }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#c9a24d', metalness: 1, roughness: 0.3 }));
      shell.rotation.x = Math.PI / 2; ud.carry = shell; gun.add(shell);
    }
    const carrying = k > 0.9 && u > 0.12 && u < 0.84 && lh.y > -0.29;
    ud.carry.visible = carrying;
    if (carrying) ud.carry.position.copy(lh).add(V(-0.03, 0.03, 0.03));
  }
  return { gun: g, ov };
}
/** Reset parts after a reload ends or is interrupted. */
export function endReload(gun) {
  const ud = gun.userData;
  if (ud.mag) { ud.mag.visible = true; ud.mag.position.copy(ud.magSeat); ud.mag.rotation.set(0, 0, 0); }
  if (ud.carry) ud.carry.visible = false;
  if (ud.bolt) for (const x of ud.bolt) x.o.position.x = x.x0;
}
export function updateDropped(dt) {
  if (!dropped) return;
  const u = dropped.userData;
  u.v.y -= 7 * dt; dropped.position.addScaledVector(u.v, dt); dropped.rotation.x += dt * 3;
  if ((u.t -= dt) <= 0) { dropped.parent.remove(dropped); dropped = null; }
}

/** Weapon draw (u: 1 -> 0 as the swap finishes): comes up from below, rolled in. */
export function drawPose(u) {
  const e = ease(Math.min(1, u));
  return [0.02 * e, -0.22 * e, 0.05 * e, -0.9 * e, 0.25 * e, 0.5 * e];
}
/** Sprint carry: muzzle down and across the body. */
export const SPRINT_POSE = [-0.03, -0.045, 0.02, -0.38, 0.75, 0.42];
