// Realistic weapon models.
//   deer rifle: Poly Haven "Bolt Action Rifle 7.62" (CC0 photogrammetry-grade PBR model)
//   rifle (AR-15 pattern) and pump shotgun: built here from extruded side profiles with bevelled edges,
//   anodised metal / polymer / walnut PBR materials.
// Frame: +z = muzzle direction, +y up, origin at the trigger. Units: metres.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('../vendor/models/guns/', import.meta.url).href;
const tl = new THREE.TextureLoader();
const texCache = {};
function T(name, rep = 1, srgb = false) {
  const k = name + rep;
  if (!texCache[k]) {
    const t = tl.load(BASE + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache[k] = t;
  }
  return texCache[k];
}
let mats = null;
function materials() {
  if (mats) return mats;
  const metal = (color, rough, metalness, rep = 6) => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness, normalMap: T('metal_nor.jpg', rep), roughnessMap: T('metal_rough.jpg', rep), clearcoat: 0.25, clearcoatRoughness: 0.5 });
    m.normalScale.set(0.25, 0.25);
    return m;
  };
  mats = {
    anod: metal('#232427', 0.55, 0.65),            // hard-anodised aluminium receivers
    steel: metal('#1b1c1e', 0.38, 0.9, 10),         // barrels, bolts
    parker: metal('#2c2d2f', 0.7, 0.6, 10),         // phosphate-finished parts
    poly: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.82, metalness: 0, normalMap: T('metal_nor.jpg', 12) }),
    wood: new THREE.MeshPhysicalMaterial({ color: '#9c6a4c', map: T('wood_diff.jpg', 2, true), normalMap: T('wood_nor.jpg', 2), roughnessMap: T('wood_rough.jpg', 2), roughness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    lens: new THREE.MeshStandardMaterial({ color: '#335', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff2020' }),
    brass: new THREE.MeshStandardMaterial({ color: '#c8a050', roughness: 0.3, metalness: 1 }),
  };
  return mats;
}

// side profile (z forward, y up) extruded across x, centred, with rounded edges
function prof(points, width, mat, bevel = 0.003, curveSeg = 3) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: curveSeg, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> +z, extrusion -> x
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
const cylZ = (r, len, mat, z, y = 0, seg = 20, r2 = r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(0, y, z + len / 2); m.castShadow = true; return m; };
const bx = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
function rail(g, mat, z0, z1, y, w = 0.021) {
  g.add(bx(w * 0.75, 0.006, z1 - z0, mat, 0, y + 0.003, (z0 + z1) / 2));
  for (let z = z0 + 0.005; z < z1 - 0.004; z += 0.01) g.add(bx(w, 0.005, 0.0055, mat, 0, y + 0.0085, z));
}

function buildAR() {
  const M = materials(), g = new THREE.Group();
  // lower receiver with magwell and trigger guard area
  g.add(prof([[-0.075, 0.004], [-0.06, -0.012], [-0.012, -0.02], [0.02, -0.03], [0.095, -0.03], [0.1, -0.012], [0.112, -0.004], [0.112, 0.018], [-0.075, 0.018]], 0.024, M.anod, 0.0025));
  // upper receiver + forward assist bump + ejection port cover
  g.add(prof([[-0.085, 0.018], [0.16, 0.018], [0.16, 0.052], [0.02, 0.052], [-0.06, 0.05], [-0.085, 0.046]], 0.028, M.anod, 0.003));
  g.add(bx(0.004, 0.018, 0.06, M.parker, 0.0145, 0.034, 0.04));
  g.add(cylZ(0.006, 0.03, M.anod, -0.04, 0.04).translateX(0.016));
  rail(g, M.anod, -0.085, 0.16, 0.052);
  // charging handle
  g.add(prof([[-0.1, 0.044], [-0.085, 0.044], [-0.085, 0.05], [-0.1, 0.05]], 0.04, M.anod, 0.002));
  // free-float handguard (octagon) with top rail and M-LOK slots
  const hgGeo = new THREE.CylinderGeometry(0.0225, 0.0225, 0.34, 8); hgGeo.rotateY(Math.PI / 8); hgGeo.rotateX(Math.PI / 2);
  const hg = new THREE.Mesh(hgGeo, M.anod); hg.position.set(0, 0.033, 0.33); hg.castShadow = true; g.add(hg);
  rail(g, M.anod, 0.165, 0.5, 0.054);
  for (const sx of [-1, 1]) for (let z = 0.2; z < 0.48; z += 0.045) g.add(bx(0.003, 0.007, 0.03, M.poly, sx * 0.0215, 0.033, z));
  // barrel, gas block, compensator
  g.add(cylZ(0.0085, 0.14, M.steel, 0.5, 0.033));
  g.add(cylZ(0.0125, 0.045, M.steel, 0.635, 0.033, 12));
  for (let i = 0; i < 3; i++) g.add(bx(0.026, 0.003, 0.006, M.poly, 0, 0.043, 0.645 + i * 0.011));
  // pistol grip
  g.add(prof([[-0.03, -0.004], [0.002, -0.006], [-0.006, -0.03], [-0.03, -0.11], [-0.055, -0.112], [-0.06, -0.1], [-0.045, -0.03], [-0.045, -0.006]], 0.03, M.poly, 0.006));
  // trigger + guard
  g.add(prof([[0.0, -0.02], [0.006, -0.02], [0.002, -0.042], [-0.003, -0.04]], 0.006, M.steel, 0.001));
  g.add(prof([[-0.012, -0.05], [0.055, -0.05], [0.055, -0.03], [0.05, -0.03], [0.05, -0.045], [-0.012, -0.045]], 0.016, M.anod, 0.0015));
  // curved 30-round magazine
  // (its own group, origin at the top of the magwell, so reloads can pull it out)
  const SEAT = [0.059, -0.025];
  const mag = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; mag.push([0.03 + t * t * 0.05 + t * 0.012 - SEAT[0], -0.025 - t * 0.17 - SEAT[1]]); }
  for (let i = 10; i >= 0; i--) { const t = i / 10; mag.push([0.088 + t * t * 0.05 + t * 0.012 - SEAT[0], -0.025 - t * 0.17 + (i === 10 ? 0.006 : 0) - SEAT[1]]); }
  const magG = new THREE.Group(); magG.position.set(0, SEAT[1], SEAT[0]); g.add(magG);
  magG.add(prof(mag, 0.022, M.parker, 0.003));
  magG.add(prof([[0.092 - SEAT[0], -0.195 - SEAT[1]], [0.152 - SEAT[0], -0.195 - SEAT[1]], [0.152 - SEAT[0], -0.183 - SEAT[1]], [0.092 - SEAT[0], -0.183 - SEAT[1]]], 0.026, M.poly, 0.003)); // baseplate
  // buffer tube + collapsible stock
  g.add(cylZ(0.0145, 0.2, M.anod, -0.28, 0.032, 18));
  g.add(prof([[-0.36, -0.06], [-0.33, -0.065], [-0.2, 0.012], [-0.2, 0.052], [-0.3, 0.056], [-0.36, 0.05]], 0.04, M.poly, 0.005));
  g.add(prof([[-0.372, -0.068], [-0.358, -0.068], [-0.358, 0.056], [-0.372, 0.056]], 0.044, M.poly, 0.004)); // butt pad
  // red-dot sight on the rail
  const rd = new THREE.Group();
  rd.add(prof([[-0.01, 0], [0.05, 0], [0.05, 0.012], [-0.01, 0.012]], 0.026, M.anod, 0.002));
  const hous = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.05, 24, 1, true), M.anod); hous.rotation.x = Math.PI / 2; hous.position.set(0, 0.032, 0.02); rd.add(hous);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.003, 8, 24), M.anod); ring.position.set(0, 0.032, 0.045); rd.add(ring);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24), M.lens); lens.position.set(0, 0.032, 0.03); lens.rotation.y = Math.PI; rd.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 10), M.dot); dot.position.set(0, 0.032, 0.0302); dot.rotation.y = Math.PI; rd.add(dot);
  rd.add(bx(0.012, 0.012, 0.012, M.anod, 0.02, 0.032, 0.02));
  rd.position.set(0, 0.062, -0.02); g.add(rd);
  g.userData = { grip: new THREE.Vector3(0, -0.04, -0.035), fore: new THREE.Vector3(0, 0.025, 0.3), muzzle: new THREE.Vector3(0, 0.033, 0.68), sight: new THREE.Vector3(0, 0.094, 0.01), eject: new THREE.Vector3(-0.018, 0.034, 0.04), shell: 'brass', mag: magG, magSeat: magG.position.clone() };
  return g;
}

function buildShotgun() {
  const M = materials(), g = new THREE.Group();
  // receiver with ejection port
  g.add(prof([[-0.08, -0.03], [0.17, -0.03], [0.17, 0.035], [0.0, 0.04], [-0.06, 0.036], [-0.08, 0.025]], 0.034, M.steel, 0.004));
  g.add(bx(0.002, 0.022, 0.07, M.poly, 0.0172, 0.012, 0.06));
  // barrel with vent rib + bead, magazine tube
  g.add(cylZ(0.0125, 0.55, M.steel, 0.17, 0.022, 20));
  g.add(bx(0.008, 0.004, 0.55, M.steel, 0, 0.037, 0.445));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), M.brass); bead.position.set(0, 0.041, 0.715); g.add(bead);
  g.add(cylZ(0.0115, 0.43, M.steel, 0.17, -0.012, 18));
  g.add(cylZ(0.0125, 0.02, M.steel, 0.6, -0.012, 18));
  // ribbed pump forend (walnut)
  const pumpG = new THREE.Group(); g.add(pumpG);              // slides back and forward when racked
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.2, 20), M.wood);
  pump.rotation.x = Math.PI / 2; pump.scale.set(1, 1, 1.15); pump.position.set(0, -0.006, 0.33); pump.castShadow = true; pumpG.add(pump);
  for (let z = 0.25; z < 0.42; z += 0.012) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0238, 0.0016, 6, 20), M.wood); r.position.set(0, -0.006, z); r.scale.set(1, 1.15, 1); pumpG.add(r); }
  // trigger group
  g.add(prof([[-0.015, -0.03], [0.06, -0.03], [0.06, -0.05], [0.055, -0.056], [-0.015, -0.056]], 0.018, M.parker, 0.002));
  g.add(prof([[0.0, -0.03], [0.007, -0.03], [0.004, -0.048], [-0.002, -0.046]], 0.006, M.steel, 0.001));
  // walnut stock with pistol-grip wrist
  g.add(prof([[-0.075, 0.03], [-0.075, -0.03], [-0.06, -0.05], [-0.09, -0.09], [-0.12, -0.085], [-0.13, -0.05], [-0.45, -0.115], [-0.46, -0.11], [-0.46, 0.035], [-0.3, 0.03]], 0.04, M.wood, 0.007, 4));
  g.add(prof([[-0.475, -0.118], [-0.458, -0.118], [-0.458, 0.04], [-0.475, 0.04]], 0.044, M.poly, 0.004)); // recoil pad
  g.userData = { grip: new THREE.Vector3(0, -0.05, -0.07), fore: new THREE.Vector3(0, -0.006, 0.33), fore0: 0.33, reach: 0.29, muzzle: new THREE.Vector3(0, 0.022, 0.72), sight: new THREE.Vector3(0, 0.043, 0.0), pump: pumpG, eject: new THREE.Vector3(-0.02, 0.012, 0.06), shell: 'shell' };
  return g;
}

function curvedMag(g, M, mat, seat, len, curve, width = 0.022) {
  // magazine as its own group with origin at the top of the magwell (reloads pull it out)
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([-0.03 + t * t * curve + t * 0.01, -t * len]); }
  for (let i = 10; i >= 0; i--) { const t = i / 10; pts.push([0.03 + t * t * curve + t * 0.01, -t * len + (i === 10 ? 0.006 : 0)]); }
  const magG = new THREE.Group(); magG.position.set(0, seat[1], seat[0]); g.add(magG);
  magG.add(prof(pts, width, mat, 0.003));
  return magG;
}
function buildAK() {
  const M = materials(), g = new THREE.Group();
  const steel = M.parker;
  // stamped receiver + dust cover
  g.add(prof([[-0.11, -0.025], [0.17, -0.025], [0.17, 0.035], [-0.11, 0.03]], 0.032, steel, 0.003));
  g.add(prof([[-0.1, 0.03], [0.15, 0.035], [0.15, 0.05], [-0.05, 0.05], [-0.1, 0.042]], 0.03, steel, 0.006));
  g.add(bx(0.004, 0.012, 0.09, M.steel, -0.017, 0.02, 0.05));  // charging handle slot
  g.add(bx(0.012, 0.01, 0.03, M.steel, -0.022, 0.02, 0.1));
  // wooden lower + upper handguard, gas tube, barrel, front sight, muzzle brake
  g.add(prof([[0.17, -0.02], [0.4, -0.02], [0.4, 0.028], [0.17, 0.03]], 0.044, M.wood, 0.008));
  g.add(cylZ(0.012, 0.22, M.wood, 0.19, 0.048, 14));
  g.add(cylZ(0.0085, 0.2, M.steel, 0.4, 0.012, 14));
  g.add(cylZ(0.006, 0.12, M.steel, 0.41, 0.048, 10));
  g.add(bx(0.024, 0.03, 0.02, steel, 0, 0.042, 0.52)); g.add(bx(0.004, 0.035, 0.004, M.steel, 0, 0.065, 0.525));
  g.add(cylZ(0.012, 0.06, M.steel, 0.6, 0.012, 12));
  g.add(bx(0.03, 0.012, 0.05, steel, 0, 0.057, 0.12));        // rear sight block
  // pistol grip, trigger guard
  g.add(prof([[-0.03, -0.004], [0.002, -0.006], [-0.006, -0.03], [-0.035, -0.105], [-0.058, -0.105], [-0.058, -0.09], [-0.045, -0.03], [-0.045, -0.006]], 0.03, M.wood, 0.007));
  g.add(prof([[-0.012, -0.05], [0.055, -0.05], [0.055, -0.03], [0.05, -0.03], [0.05, -0.045], [-0.012, -0.045]], 0.016, steel, 0.0015));
  // wooden stock
  g.add(prof([[-0.11, 0.03], [-0.11, -0.03], [-0.42, -0.11], [-0.44, -0.11], [-0.44, 0.02], [-0.3, 0.02]], 0.04, M.wood, 0.007));
  g.add(prof([[-0.452, -0.115], [-0.438, -0.115], [-0.438, 0.024], [-0.452, 0.024]], 0.044, steel, 0.003));
  const magG = curvedMag(g, M, steel, [0.075, -0.025], 0.2, 0.09, 0.024);
  g.userData = { grip: new THREE.Vector3(0, -0.04, -0.035), fore: new THREE.Vector3(0, 0.0, 0.3), muzzle: new THREE.Vector3(0, 0.012, 0.66), sight: new THREE.Vector3(0, 0.07, 0.0), eject: new THREE.Vector3(-0.02, 0.03, 0.08), shell: 'brass', mag: magG, magSeat: magG.position.clone() };
  return g;
}
function buildSMG() {
  const M = materials(), g = new THREE.Group();
  // tubular receiver, cocking tube, polymer lower, slim handguard
  g.add(cylZ(0.022, 0.28, M.anod, -0.08, 0.03, 18));
  g.add(cylZ(0.009, 0.2, M.anod, 0.05, 0.062, 10));
  g.add(prof([[-0.06, 0.012], [0.12, 0.012], [0.12, -0.022], [0.03, -0.028], [-0.06, -0.028]], 0.03, M.poly, 0.004));
  g.add(cylZ(0.024, 0.13, M.poly, 0.2, 0.025, 16));
  g.add(cylZ(0.008, 0.08, M.steel, 0.33, 0.03, 12));
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 16), M.anod); hood.position.set(0, 0.07, 0.3); g.add(hood);
  g.add(bx(0.03, 0.02, 0.02, M.anod, 0, 0.065, -0.05));                    // drum rear sight
  // grip + guard
  g.add(prof([[-0.03, -0.01], [0.004, -0.012], [-0.004, -0.032], [-0.03, -0.11], [-0.054, -0.11], [-0.058, -0.095], [-0.044, -0.03], [-0.044, -0.01]], 0.03, M.poly, 0.007));
  g.add(prof([[-0.012, -0.05], [0.05, -0.05], [0.05, -0.03], [0.045, -0.03], [0.045, -0.045], [-0.012, -0.045]], 0.016, M.poly, 0.0015));
  // retractable stock: two rods and a butt plate
  for (const sx of [-1, 1]) { const r = cylZ(0.004, 0.13, M.steel, -0.21, 0.03, 6); r.position.x = sx * 0.016; g.add(r); }
  g.add(prof([[-0.23, -0.05], [-0.21, -0.05], [-0.21, 0.06], [-0.23, 0.06]], 0.05, M.poly, 0.004));
  const magG = curvedMag(g, M, M.parker, [0.06, -0.028], 0.16, 0.035, 0.02);
  g.userData = { grip: new THREE.Vector3(0, -0.045, -0.035), fore: new THREE.Vector3(0, 0.005, 0.22), muzzle: new THREE.Vector3(0, 0.03, 0.42), sight: new THREE.Vector3(0, 0.075, -0.02), eject: new THREE.Vector3(-0.022, 0.035, 0.05), shell: 'brass', mag: magG, magSeat: magG.position.clone() };
  return g;
}

let pistol = null;
function loadPistol() {
  return new Promise((res) => new GLTFLoader().load(BASE + 'pistol/pistol.gltf', (gl) => {
    const root = new THREE.Group(), s = gl.scene;
    // the file holds two copies (assembled + spare parts): keep the assembled "_a" pistol
    const keep = /pistol_a|slide_a|hammer_a|trigger_a/;
    const drop = []; s.traverse((o) => { if (o.isMesh && !keep.test(o.name) && !keep.test(o.parent ? o.parent.name : '')) drop.push(o); });
    for (const o of drop) o.visible = false;
    s.rotation.y = -Math.PI / 2; s.position.set(0, -0.025, -0.05);
    s.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(s);
    let slide = null; s.traverse((o) => { if (/slide_a/.test(o.name) && !slide) slide = o; });
    root.userData = { grip: new THREE.Vector3(0, -0.055, -0.075), fore: new THREE.Vector3(0, -0.06, -0.05), reach: 0.1, oneHandish: true, muzzle: new THREE.Vector3(0, 0.03, 0.13), sight: new THREE.Vector3(0, 0.055, -0.02), eject: new THREE.Vector3(-0.012, 0.04, 0.02), shell: 'brass', slide: slide ? { o: slide, x0: slide.position.x } : null };
    pistol = root; res(true);
  }, undefined, () => res(false)));
}

let deer = null;
/** Loads the scanned rifle. Resolves true when ready (procedural guns need no loading). */
export function loadGuns() {
  return Promise.all([loadDeer(), loadPistol()]).then((r) => r.every(Boolean));
}
function loadDeer() {
  return new Promise((res) => new GLTFLoader().load(BASE + 'deer/rifle.gltf', (gl) => {
    const root = new THREE.Group();
    const s = gl.scene;
    s.rotation.y = -Math.PI / 2;            // model points +x; ours +z
    s.position.set(0, 0.06, 0.29);           // trigger to the origin
    s.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material.map) o.material.map.anisotropy = 8; } });
    root.add(s);
    root.userData = { grip: new THREE.Vector3(0, -0.035, -0.07), fore: new THREE.Vector3(0, 0.0, 0.3), muzzle: new THREE.Vector3(0, 0.06, 0.88), sight: new THREE.Vector3(0, 0.14, 0.0) };
    deer = root; res(true);
  }, undefined, () => res(false)));
}

/** Realistic gun for kind ('rifle'|'shotgun'|'deer'), or null if not available yet. */
export function realGun(kind) {
  if (kind === 'deer') {
    if (!deer) return null;
    const c = deer.clone(); c.userData = { ...deer.userData, eject: new THREE.Vector3(-0.02, 0.06, -0.02), shell: 'brass', bolt: [] };
    c.traverse((o) => { if (/bolt/.test(o.name)) c.userData.bolt.push({ o, x0: o.position.x }); });
    return c;
  }
  if (kind === 'pistol') {
    if (!pistol) return null;
    const c = pistol.clone(); c.userData = { ...pistol.userData };
    if (pistol.userData.slide) { let sl = null; c.traverse((o) => { if (o.name === pistol.userData.slide.o.name && !sl) sl = o; }); c.userData.slide = sl ? { o: sl, x0: sl.position.x } : null; }
    return c;
  }
  if (kind === 'ak') return buildAK();
  if (kind === 'smg') return buildSMG();
  return kind === 'shotgun' ? buildShotgun() : buildAR();
}
