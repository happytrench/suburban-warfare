// First-person gun effects: star-shaped muzzle flash, smoke puffs, ejected brass and shotgun shells.
// Everything lives in the viewmodel scene (camera at the origin looking down -z).
import * as THREE from 'three';

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.18, 'rgba(255,220,140,0.95)'); gr.addColorStop(0.45, 'rgba(255,140,40,0.45)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) { // spikes
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4, l = 40 + Math.random() * 22;
    g.save(); g.translate(64, 64); g.rotate(a);
    const sg = g.createLinearGradient(0, 0, l, 0); sg.addColorStop(0, 'rgba(255,230,160,0.9)'); sg.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(0, -5); g.lineTo(l, 0); g.lineTo(0, 5); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(200,200,200,0.55)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Muzzle flash: three crossed additive cards (side view + front star). */
export function createMuzzleFlash() {
  const mat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat); g.add(front);
  for (const r of [0, Math.PI / 2]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), mat);
    side.rotation.set(Math.PI / 2, 0, r); side.position.z = -0.17; g.add(side);
  }
  g.visible = false; g.userData.t = 0;
  return g;
}

const shells = [];
const smoke = [];
let shellGeo = null, shotGeo = null, brass = null, red = null, smokeMat = null;
/** Spawn an ejected case. pos: viewmodel-scene position; kind 'brass'|'shell'. */
export function spawnShell(scene, pos, kind = 'brass') {
  if (!shellGeo) {
    shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.026, 8); shotGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.04, 10);
    brass = new THREE.MeshStandardMaterial({ color: '#c9a24d', metalness: 1, roughness: 0.28 });
    red = new THREE.MeshStandardMaterial({ color: '#9b1c1c', roughness: 0.55 });
  }
  const m = new THREE.Mesh(kind === 'shell' ? shotGeo : shellGeo, kind === 'shell' ? red : brass);
  m.position.copy(pos);
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.PI / 2);
  m.userData = { v: new THREE.Vector3(0.9 + Math.random() * 0.5, 0.9 + Math.random() * 0.4, 0.15 + Math.random() * 0.2), spin: new THREE.Vector3(8 + Math.random() * 8, 2, 14 + Math.random() * 8), t: 0.7 };
  scene.add(m); shells.push(m);
}
/** A puff of gun smoke drifting off the muzzle. */
export function spawnSmoke(scene, pos, amount = 1) {
  if (!smokeMat) smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < amount; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    s.position.copy(pos); s.scale.setScalar(0.05);
    s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.1, -0.1 - Math.random() * 0.2), t: 0.9, grow: 0.25 + Math.random() * 0.2 };
    scene.add(s); smoke.push(s);
  }
}
export function updateGunFx(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const m = shells[i], u = m.userData;
    u.v.y -= 6 * dt; m.position.addScaledVector(u.v, dt);
    m.rotation.x += u.spin.x * dt; m.rotation.z += u.spin.z * dt;
    if ((u.t -= dt) <= 0) { m.parent.remove(m); shells.splice(i, 1); }
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s = smoke[i], u = s.userData;
    s.position.addScaledVector(u.v, dt); s.scale.addScalar(u.grow * dt);
    s.material.opacity = Math.max(0, u.t / 0.9) * 0.4;
    if ((u.t -= dt) <= 0) { s.parent.remove(s); s.material.dispose(); smoke.splice(i, 1); }
  }
}
