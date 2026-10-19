// Low-poly character models for both factions, plus first-person weapon models.
import * as THREE from 'three';
import * as TX from './textures.js';

const M = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673d'];
const FFA_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export function playerColor(id, team, mode) {
  if (mode === 'tdm') return team === 2 ? '#c2410c' : '#3b82f6';
  return FFA_COLORS[id % FFA_COLORS.length];
}

// outfit: 'suburban' (polo, khakis, visor, golf vibes) or 'country' (flannel, overalls, trucker cap)
// quality 'high' builds rounded, human-proportioned models; 'low' builds cheap blocky ones.
export function buildCharacter({ id, color, outfit, quality = 'high' }) {
  const hi = quality !== 'low';
  const Mat = (c, extra = {}) => (hi
    ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra })
    : new THREE.MeshLambertMaterial({ color: c }));
  // limb: capsule (high) or box (low); length along -y from the pivot
  const limb = (r, len, m) => {
    const mesh = hi
      ? new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10), m)
      : new THREE.Mesh(new THREE.BoxGeometry(r * 2, len, r * 2), m);
    mesh.position.y = -len / 2;
    return mesh;
  };
  const root = new THREE.Group();
  const skinColor = SKIN[id % SKIN.length];
  const skin = Mat(skinColor, { roughness: 0.65 });
  const isCountry = outfit === 'country';
  const shirt = hi
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: isCountry ? TX.flannel(color) : TX.knit(color), roughness: 0.9 })
    : Mat(color);
  const pants = hi
    ? new THREE.MeshStandardMaterial({ color: isCountry ? '#ffffff' : '#cdb894', map: isCountry ? TX.denim() : null, roughness: 0.9 })
    : Mat(isCountry ? '#2f4f7a' : '#cdb894');
  const shoes = Mat(isCountry ? '#4a2f18' : '#f1f5f9', { roughness: 0.6 });
  const accent = Mat(isCountry ? '#6b1414' : '#ffffff');
  const dark = Mat('#1b1d21');

  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0, 0);
    leg.add(limb(0.11, 0.48, pants));
    const knee = new THREE.Group(); knee.position.y = -0.46; leg.add(knee);
    knee.add(limb(0.095, 0.44, pants));
    const f = hi ? new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), shoes) : box(0.2, 0.12, 0.3, shoes);
    if (hi) f.rotation.x = Math.PI / 2;
    f.position.set(0, -0.44, 0.06); knee.add(f);
    hips.add(leg); legs.push(leg);
  }
  // torso: tapered (wider shoulders)
  const torso = hi
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.62, 12), shirt)
    : box(0.5, 0.62, 0.3, shirt);
  torso.scale.z = hi ? 0.62 : 1;
  torso.position.y = 0.34; hips.add(torso);
  const pelvis = hi ? new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.16, 12), pants) : box(0.42, 0.16, 0.28, pants);
  pelvis.scale.z = hi ? 0.7 : 1; pelvis.position.y = 0.02; hips.add(pelvis);
  if (isCountry) {
    const bib = box(0.3, 0.3, 0.03, pants); bib.position.set(0, 0.26, 0.15); hips.add(bib);
    for (const sx of [-1, 1]) { const st = box(0.05, 0.36, 0.03, pants); st.position.set(sx * 0.12, 0.5, 0.135); st.rotation.x = -0.08; hips.add(st); }
    for (let i = 0; i < 3; i++) { const band = box(0.47, 0.03, 0.33, accent); band.position.y = 0.16 + i * 0.17; hips.add(band); }
  } else {
    const collar = box(0.3, 0.06, 0.24, accent); collar.position.y = 0.66; hips.add(collar);
    const belt = box(0.4, 0.06, 0.29, Mat('#3b2a1a')); belt.position.y = 0.06; hips.add(belt);
  }

  const head = new THREE.Group(); head.position.y = 0.72; hips.add(head);
  const neck = limb(0.07, 0.12, skin); neck.position.y = 0.06; head.add(neck);
  const h = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin) : box(0.34, 0.36, 0.34, skin);
  if (hi) h.scale.set(0.95, 1.12, 1);
  h.position.y = 0.24; head.add(h);
  const eyeM = Mat('#141414', { roughness: 0.3 });
  if (hi) {
    // painted face on a curved patch hugging the front of the head
    const faceGeo = new THREE.SphereGeometry(0.172, 16, 12, Math.PI * 0.5 - 0.75, 1.5, Math.PI * 0.22, Math.PI * 0.6);
    const faceM = new THREE.MeshStandardMaterial({ map: TX.face(isCountry ? 'beard' : 'clean', skinColor), transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false });
    const f = new THREE.Mesh(faceGeo, faceM); f.scale.set(0.95, 1.12, 1); f.position.y = 0.24; f.rotation.y = 0; head.add(f);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.165, 0.24, 0); head.add(ear); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.22, 0.185); head.add(nose);
  } else {
    for (const sx of [-1, 1]) { const e = box(0.05, 0.05, 0.02, eyeM); e.position.set(sx * 0.06, 0.27, 0.155); head.add(e); }
  }
  if (isCountry) {
    const cap = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), Mat('#f1f5f9')) : box(0.38, 0.14, 0.38, Mat('#f1f5f9'));
    cap.position.y = 0.33; head.add(cap);
    const front = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.182, 14, 8, -0.9, 1.8, 0, Math.PI / 2), shirt) : box(0.38, 0.14, 0.04, shirt);
    front.position.y = 0.33; if (!hi) front.position.z = 0.18; head.add(front);
    const brim = box(0.3, 0.025, 0.2, shirt); brim.position.set(0, 0.35, 0.22); brim.rotation.x = 0.12; head.add(brim);
    if (!hi) { const beard = box(0.32, 0.12, 0.06, Mat('#5a3a1e')); beard.position.set(0, 0.06, 0.18); head.add(beard); }
  } else {
    const hair = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), Mat('#b8902a', { roughness: 0.9 })) : box(0.36, 0.08, 0.36, Mat('#b8902a'));
    hair.position.y = 0.27; head.add(hair);
    const visor = hi ? new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 6, 20), Mat('#ffffff')) : box(0.38, 0.05, 0.38, Mat('#ffffff'));
    if (hi) visor.rotation.x = Math.PI / 2;
    visor.position.y = 0.33; head.add(visor);
    const brim = box(0.28, 0.02, 0.18, Mat('#ffffff')); brim.position.set(0, 0.33, 0.22); brim.rotation.x = 0.15; head.add(brim);
    const shades = box(0.24, 0.05, 0.03, Mat('#111827', { roughness: 0.15, metalness: 0.5 })); shades.position.set(0, 0.27, 0.17); head.add(shades);
  }

  // arms hold the gun pointing forward (+z in model space)
  const armR = new THREE.Group(); armR.position.set(0.28, 0.6, 0); hips.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.28, 0.6, 0); hips.add(armL);
  for (const a of [armR, armL]) {
    a.add(limb(0.075, 0.3, shirt));
    const elbow = new THREE.Group(); elbow.position.y = -0.28; a.add(elbow);
    elbow.add(limb(0.06, 0.28, skin));
    const hand = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin) : box(0.12, 0.12, 0.12, skin);
    hand.position.y = -0.3; elbow.add(hand);
    a.userData.elbow = elbow;
  }
  armR.rotation.set(-1.15, 0, 0.15); armR.userData.elbow.rotation.x = -0.35;
  armL.rotation.set(-1.25, 0, -0.45); armL.userData.elbow.rotation.x = -0.25;
  const gun = new THREE.Group(); gun.position.set(0.1, 0.48, 0.4); hips.add(gun);
  const rifle = buildGunModel('rifle', quality); rifle.scale.setScalar(0.9); gun.add(rifle);
  const shotgun = buildGunModel('shotgun', quality); shotgun.scale.setScalar(0.9); shotgun.visible = false; gun.add(shotgun);
  void dark;

  const body = new THREE.Group();
  body.add(root);
  root.rotation.y = Math.PI; // model faces +z; the game's forward is -z
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  body.userData = { legs, head, hips, gun, rifle, shotgun, armR, armL };
  return body;
}

export function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Rubik, sans-serif';
  const w = Math.min(250, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(15,25,15,.7)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 46, 10); g.fill();
  g.fillStyle = color; g.fillRect((256 - w) / 2, 50, w, 4);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

// Weapon models (forward = +z). Used both third-person and as viewmodels.
export function buildGunModel(kind, quality = 'high') {
  const g = new THREE.Group();
  const M = (color, extra = {}) => (quality === 'low' ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...extra }));
  if (kind === 'shotgun') {
    const wood = M('#7c4a1e'), metal = M('#2b2f36'), gold = M('#eab308');
    const stock = box(0.09, 0.14, 0.32, wood); stock.position.set(0, -0.03, -0.18); g.add(stock);
    const recv = box(0.1, 0.12, 0.22, metal); recv.position.set(0, 0, 0.08); g.add(recv);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), metal);
      b.rotation.x = Math.PI / 2; b.position.set(s * 0.032, 0.03, 0.47); g.add(b);
    }
    const pump = box(0.1, 0.07, 0.2, wood); pump.position.set(0, -0.03, 0.4); g.add(pump);
    const badge = box(0.02, 0.06, 0.06, gold); badge.position.set(0.06, 0.01, 0.06); g.add(badge);
  } else {
    // Leaf Blaster 3000: orange body, black nozzle, fuel tank
    const orange = M('#f97316'), black = M('#1f2328'), grey = M('#9ca3af');
    const body = box(0.12, 0.16, 0.36, orange); body.position.set(0, 0, 0.02); g.add(body);
    const grip = box(0.07, 0.16, 0.08, black); grip.position.set(0, -0.13, -0.06); grip.rotation.x = 0.3; g.add(grip);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), grey);
    tank.rotation.z = Math.PI / 2; tank.position.set(0, 0.11, -0.04); g.add(tank);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10), black);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.02, 0.4); g.add(nozzle);
    const stock = box(0.07, 0.1, 0.18, black); stock.position.set(0, -0.02, -0.24); g.add(stock);
  }
  return g;
}

export function muzzleOffset(kind) {
  return kind === 'shotgun' ? new THREE.Vector3(0, 0.03, 0.8) : new THREE.Vector3(0, 0.02, 0.62);
}
