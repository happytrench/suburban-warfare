// Low-poly character models for both factions, plus first-person weapon models.
import * as THREE from 'three';
import * as TX from './textures.js';
import { realGun } from './guns.js';

const M = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

// Caricature skin tones; the Backroad Boys get the namesake sunburn.
const SKIN = ['#f2c9a8', '#eab991', '#f5d2b8', '#e3ad8a', '#efc4a0'];
const SUNBURN = '#e08a74';
const FFA_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export function playerColor(id, team, mode) {
  if (mode === 'tdm') return team === 2 ? '#c2410c' : '#3b82f6';
  return FFA_COLORS[id % FFA_COLORS.length];
}

// Over-the-top caricatures of both sides of the culture war:
//  suburban / Pristine Pines HOA — "Chad": pastel polo with popped collar, sweater tied over the shoulders,
//    khaki shorts, boat shoes, visor, aviators, lanyard with an HOA badge.
//                                 — "Karen": asymmetrical bob, giant sunglasses, cardigan, white capris, phone in hand.
//  country / Backroad Boys       — "Bubba": mullet, trucker cap, sleeveless flannel, beer belly, jorts, work boots,
//    big beard, sunburned neck and arms.
//                                 — "Darlene": teased hair, camo tank top, cutoffs, cowboy boots, blaze-orange vest.
export function buildCharacter({ id, color, outfit, quality = 'high' }) {
  const hi = quality !== 'low';
  const Mat = (c, extra = {}) => (hi
    ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra })
    : new THREE.MeshLambertMaterial({ color: c }));
  const limb = (r, len, m) => {
    const mesh = hi
      ? new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10), m)
      : new THREE.Mesh(new THREE.BoxGeometry(r * 2, len, r * 2), m);
    mesh.position.y = -len / 2;
    return mesh;
  };
  const sph = (r, m, sx = 1, sy = 1, sz = 1, seg = 14) => {
    const mesh = new THREE.Mesh(hi ? new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)) : new THREE.BoxGeometry(r * 2, r * 2, r * 2), m);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  };
  const country = outfit === 'country';
  const female = id % 2 === 1;
  const skinColor = SKIN[id % SKIN.length];
  const skin = Mat(skinColor, { roughness: 0.65 });
  const burnt = Mat(country ? SUNBURN : skinColor, { roughness: 0.65 });

  // ---- outfit materials
  let shirt, pants, shoes, legSkin = false;
  if (country) {
    shirt = female
      ? (hi ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: TX.camo(), roughness: 0.9 }) : Mat('#5b6b3a'))
      : (hi ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: TX.flannel(color), roughness: 0.9 }) : Mat(color));
    pants = hi ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: TX.denim(), roughness: 0.9 }) : Mat('#2f4f7a');
    shoes = Mat(female ? '#7c4a1e' : '#4a2f18', { roughness: 0.6 });
    legSkin = true; // jorts / cutoffs
  } else {
    shirt = hi ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: TX.knit(female ? '#f9a8d4' : color), roughness: 0.9 }) : Mat(color);
    pants = Mat(female ? '#f8fafc' : '#d9c9a3');
    shoes = Mat(female ? '#e7e5e4' : '#8b5a2b', { roughness: 0.5 });
    legSkin = !female; // khaki shorts
  }

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.13, 0, 0);
    leg.add(limb(0.115, 0.48, pants));                                  // thigh (shorts/jeans)
    const knee = new THREE.Group(); knee.position.y = -0.46; leg.add(knee);
    knee.add(limb(0.09, 0.44, legSkin ? skin : pants));                 // shin
    if (country && !female) { const boot = limb(0.1, 0.22, shoes); boot.position.y = -0.33; knee.add(boot); }
    if (country && female) { const boot = limb(0.1, 0.3, shoes); boot.position.y = -0.29; knee.add(boot); }
    const f = hi ? new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), shoes) : box(0.2, 0.12, 0.3, shoes);
    if (hi) f.rotation.x = Math.PI / 2;
    f.position.set(0, -0.44, 0.06); knee.add(f);
    hips.add(leg); legs.push(leg);
  }

  // ---- torso (+ beer belly for Bubba)
  const torso = hi ? new THREE.Mesh(new THREE.CylinderGeometry(female ? 0.21 : 0.25, female ? 0.19 : 0.21, 0.62, 12), shirt) : box(0.5, 0.62, 0.3, shirt);
  torso.scale.z = hi ? 0.62 : 1; torso.position.y = 0.34; hips.add(torso);
  if (country && !female) { const belly = sph(0.22, shirt, 1.05, 0.95, 0.95); belly.position.set(0, 0.2, 0.1); hips.add(belly); }
  const pelvis = hi ? new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.16, 12), pants) : box(0.42, 0.16, 0.28, pants);
  pelvis.scale.z = hi ? 0.7 : 1; pelvis.position.y = 0.02; hips.add(pelvis);

  if (country && !female) {
    // jorts frayed hem
    for (const sx of [-1, 1]) { const hem = box(0.24, 0.04, 0.24, Mat('#c7d2e0')); hem.position.set(sx * 0.13, -0.42, 0); hips.add(hem); }
  }
  if (country && female) {
    const vest = hi ? new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.205, 0.5, 12, 1, true), Mat('#ff6a00', { side: THREE.DoubleSide })) : box(0.46, 0.5, 0.3, Mat('#ff6a00'));
    vest.scale.z = hi ? 0.66 : 1; vest.position.y = 0.38; hips.add(vest);
  }
  if (!country && !female) {
    // popped collar + pastel sweater tied over the shoulders + HOA lanyard
    for (const sx of [-1, 1]) { const c = box(0.1, 0.12, 0.03, Mat('#ffffff')); c.position.set(sx * 0.09, 0.7, 0.1); c.rotation.z = sx * 0.3; hips.add(c); }
    const sweater = hi ? new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16, Math.PI), Mat('#fde68a')) : box(0.44, 0.08, 0.3, Mat('#fde68a'));
    if (hi) { sweater.rotation.set(-Math.PI / 2.4, 0, 0); }
    sweater.position.set(0, 0.6, 0.02); hips.add(sweater);
    const knot = sph(0.06, Mat('#fde68a')); knot.position.set(0, 0.5, 0.16); hips.add(knot);
    const badge = box(0.08, 0.1, 0.01, Mat('#ffffff')); badge.position.set(0.07, 0.3, 0.17); hips.add(badge);
    const strap = box(0.02, 0.32, 0.01, Mat('#1e3a8a')); strap.position.set(0.04, 0.48, 0.165); hips.add(strap);
  }
  if (!country && female) {
    const cardi = hi ? new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.215, 0.6, 12, 1, true), Mat('#e7e5e4', { side: THREE.DoubleSide })) : box(0.46, 0.6, 0.3, Mat('#e7e5e4'));
    cardi.scale.z = hi ? 0.66 : 1; cardi.position.y = 0.34; hips.add(cardi);
  }

  // ---- head
  const head = new THREE.Group(); head.position.y = 0.72; hips.add(head);
  const neck = limb(0.07, 0.12, burnt); neck.position.y = 0.06; head.add(neck);
  const h = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin) : box(0.34, 0.36, 0.34, skin);
  if (hi) h.scale.set(0.95, 1.12, 1);
  h.position.y = 0.24; head.add(h);
  if (hi) {
    const faceGeo = new THREE.SphereGeometry(0.172, 16, 12, Math.PI * 0.5 - 0.75, 1.5, Math.PI * 0.22, Math.PI * 0.6);
    const faceKind = country ? (female ? 'clean' : 'beard') : (female ? 'clean' : 'grin');
    const faceM = new THREE.MeshStandardMaterial({ map: TX.face(faceKind, skinColor), transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false });
    const fm = new THREE.Mesh(faceGeo, faceM); fm.scale.set(0.95, 1.12, 1); fm.position.y = 0.24; head.add(fm);
    for (const sx of [-1, 1]) { const ear = sph(0.04, skin, 0.5, 1, 0.8, 8); ear.position.set(sx * 0.165, 0.24, 0); head.add(ear); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.065, 6), country ? burnt : skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.22, 0.185); head.add(nose);
  } else {
    for (const sx of [-1, 1]) { const e = box(0.05, 0.05, 0.02, Mat('#141414')); e.position.set(sx * 0.06, 0.27, 0.155); head.add(e); }
  }

  if (country && !female) {
    // trucker cap + mullet + big beard + chew in the cheek
    const cap = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), Mat('#f1f5f9')) : box(0.38, 0.14, 0.38, Mat('#f1f5f9'));
    cap.position.y = 0.33; head.add(cap);
    const front = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.183, 14, 8, -0.9, 1.8, 0, Math.PI / 2), Mat(color)) : box(0.38, 0.14, 0.04, Mat(color));
    front.position.y = 0.33; if (!hi) front.position.z = 0.18; head.add(front);
    const brim = box(0.3, 0.025, 0.2, Mat(color)); brim.position.set(0, 0.35, 0.22); brim.rotation.x = 0.12; head.add(brim);
    const mullet = box(0.3, 0.32, 0.12, Mat('#6b4423')); mullet.position.set(0, 0.12, -0.15); head.add(mullet);
    const beard = sph(0.15, Mat('#5a3a1e', { roughness: 1 }), 1, 0.9, 0.8); beard.position.set(0, 0.1, 0.09); head.add(beard);
    const chew = sph(0.035, skin); chew.position.set(0.11, 0.18, 0.12); head.add(chew);
  } else if (country && female) {
    // big teased hair + scrunchie ponytail
    const hair = sph(0.21, Mat('#b8762e', { roughness: 0.95 }), 1.1, 0.95, 1.05); hair.position.set(0, 0.34, -0.03); head.add(hair);
    const tail = limb(0.07, 0.3, Mat('#b8762e')); tail.position.set(0, 0.32, -0.2); tail.rotation.x = 0.4; head.add(tail);
    const scrunchie = hi ? new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 6, 12), Mat('#ec4899')) : box(0.1, 0.1, 0.05, Mat('#ec4899'));
    scrunchie.position.set(0, 0.36, -0.19); head.add(scrunchie);
  } else if (!country && !female) {
    // swoopy frosted hair + visor + aviators
    const hair = hi ? new THREE.Mesh(new THREE.SphereGeometry(0.178, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), Mat('#d4b04c', { roughness: 0.9 })) : box(0.36, 0.08, 0.36, Mat('#d4b04c'));
    hair.position.y = 0.27; head.add(hair);
    const swoop = sph(0.09, Mat('#e2c56a'), 1.4, 0.6, 1); swoop.position.set(0.05, 0.39, 0.07); head.add(swoop);
    const visor = hi ? new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 6, 20), Mat('#ffffff')) : box(0.38, 0.05, 0.38, Mat('#ffffff'));
    if (hi) visor.rotation.x = Math.PI / 2;
    visor.position.y = 0.33; head.add(visor);
    const brim = box(0.28, 0.02, 0.18, Mat('#ffffff')); brim.position.set(0, 0.33, 0.22); brim.rotation.x = 0.15; head.add(brim);
    const shades = box(0.26, 0.055, 0.03, Mat('#b8860b', { roughness: 0.1, metalness: 0.9 })); shades.position.set(0, 0.27, 0.172); head.add(shades);
  } else {
    // the asymmetrical "can I speak to your manager" bob + giant sunglasses
    const bob = sph(0.205, Mat('#e9d8a6', { roughness: 0.85 }), 1.12, 0.85, 1.05); bob.position.set(0, 0.28, -0.03); head.add(bob);
    const longSide = box(0.08, 0.22, 0.2, Mat('#e9d8a6')); longSide.position.set(0.17, 0.16, 0.05); head.add(longSide);
    const shortSide = box(0.06, 0.12, 0.18, Mat('#e9d8a6')); shortSide.position.set(-0.17, 0.22, 0.03); head.add(shortSide);
    for (const sx of [-1, 1]) { const lens = sph(0.05, Mat('#111111', { roughness: 0.1, metalness: 0.5 }), 1.1, 0.9, 0.3, 10); lens.position.set(sx * 0.065, 0.27, 0.172); head.add(lens); }
  }

  // ---- arms (sleeveless + sunburn for Bubba); hold the gun forward (+z in model space)
  const sleeve = country ? burnt : shirt;
  const armR = new THREE.Group(); armR.position.set(0.28, 0.6, 0); hips.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.28, 0.6, 0); hips.add(armL);
  for (const a of [armR, armL]) {
    a.add(limb(country && !female ? 0.085 : 0.072, 0.3, country ? burnt : sleeve));
    const elbow = new THREE.Group(); elbow.position.y = -0.28; a.add(elbow);
    elbow.add(limb(0.06, 0.28, country ? burnt : skin));
    const hand = hi ? sph(0.06, skin, 1, 1, 1, 8) : box(0.12, 0.12, 0.12, skin);
    hand.position.y = -0.3; elbow.add(hand);
    a.userData.elbow = elbow;
  }
  armR.rotation.set(-1.15, 0, 0.15); armR.userData.elbow.rotation.x = -0.35;
  armL.rotation.set(-1.25, 0, -0.45); armL.userData.elbow.rotation.x = -0.25;
  if (!country && female) { // phone in the off hand, presumably calling the manager
    const phone = box(0.07, 0.13, 0.015, Mat('#111827', { roughness: 0.2 })); phone.position.set(0, -0.36, 0.05); armL.userData.elbow.add(phone);
  }
  const gun = new THREE.Group(); gun.position.set(0.1, 0.48, 0.4); hips.add(gun);
  const rifle = buildGunModel('rifle', quality); rifle.scale.setScalar(0.9); gun.add(rifle);
  const shotgun = buildGunModel('shotgun', quality); shotgun.scale.setScalar(0.9); shotgun.visible = false; gun.add(shotgun);
  const deer = buildGunModel('deer', quality); deer.scale.setScalar(0.9); deer.visible = false; gun.add(deer);

  const body = new THREE.Group();
  body.add(root);
  root.rotation.y = Math.PI;
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  body.userData = { legs, head, hips, gun, rifle, shotgun, deer, armR, armL };
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
  if (quality !== 'low') { const real = realGun(kind); if (real) return real; }
  const g = new THREE.Group();
  const M = (color, extra = {}) => (quality === 'low' ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...extra }));
  if (kind === 'deer') {
    const wood = M('#6b3f1f'), metal = M('#22262b'), glassM = M('#0f172a', { roughness: 0.1, metalness: 0.6 });
    const stock = box(0.08, 0.15, 0.42, wood); stock.position.set(0, -0.04, -0.24); g.add(stock);
    const fore = box(0.08, 0.1, 0.46, wood); fore.position.set(0, -0.01, 0.2); g.add(fore);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.82, 8), metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, 0.48); g.add(barrel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), metal);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.12, 0.04); g.add(scope);
    for (const zz of [-0.15, 0.2]) { const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), glassM); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.12, zz); g.add(lens); }
    const bolt = box(0.03, 0.03, 0.08, metal); bolt.position.set(0.06, 0.05, -0.02); g.add(bolt);
  } else if (kind === 'shotgun') {
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
  if (kind === 'deer') return new THREE.Vector3(0, 0.05, 0.92);
  return kind === 'shotgun' ? new THREE.Vector3(0, 0.022, 0.73) : new THREE.Vector3(0, 0.033, 0.69);
}
