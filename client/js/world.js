// Builds the 3D scene for a map from the shared map data.
// Static geometry is merged per material, keeping draw calls low on laptops.
import * as THREE from 'three';
import * as TX from './textures.js';

// 'high' = physically based materials with bump detail; 'low' = cheap Lambert shading.
let QUALITY = 'high';
export function setQuality(q) { QUALITY = q === 'low' ? 'low' : 'high'; }
export function getQuality() { return QUALITY; }

const matCache = new Map();
function mat(color, map = null, extra = {}) {
  const key = QUALITY + '|' + color + '|' + (map ? map.uuid : '') + '|' + JSON.stringify(extra);
  if (!matCache.has(key)) {
    let m;
    if (QUALITY === 'high') {
      const { roughness = 0.88, metalness = 0, ...rest } = extra;
      m = new THREE.MeshStandardMaterial({ color, map, roughness, metalness, ...rest });
      if (map) { m.bumpMap = map; m.bumpScale = 1.2; }
    } else {
      const { roughness, metalness, ...rest } = extra; void roughness; void metalness;
      m = new THREE.MeshLambertMaterial({ color, map, ...rest });
    }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// Box geometry whose UVs are scaled to world size, so textures tile consistently.
function boxGeo(w, h, d, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / uvScale, uv.getY(k) * dims[f][1] / uvScale);
    }
  }
  return g;
}

class Builder {
  constructor() {
    this.parts = new Map(); // material -> geometries
    this.dynamic = new THREE.Group();
    this.tmp = new THREE.Object3D();
  }

  push(geo, material, x, y, z, ry = 0, rx = 0, rz = 0, s = null) {
    this.tmp.position.set(x, y, z);
    this.tmp.rotation.set(rx, ry, rz);
    if (s) this.tmp.scale.set(s[0], s[1], s[2]); else this.tmp.scale.set(1, 1, 1);
    this.tmp.updateMatrix();
    geo.applyMatrix4(this.tmp.matrix);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geo);
  }

  // box with bottom at y
  box(w, h, d, x, y, z, material, uv = 0, ry = 0) {
    this.push(boxGeo(w, h, d, uv), material, x, y + h / 2, z, ry);
  }

  cyl(rTop, rBot, h, x, y, z, material, seg = 10, rx = 0, rz = 0, ry = 0) {
    this.push(new THREE.CylinderGeometry(rTop, rBot, h, seg), material, x, y + (rx || rz ? 0 : h / 2), z, ry, rx, rz);
  }

  sphere(r, x, y, z, material, detail = 0, s = null) {
    this.push(new THREE.IcosahedronGeometry(r, detail), material, x, y, z, 0, 0, 0, s);
  }

  // Gable roof (triangular prism) over a w x d footprint at height y.
  roof(w, d, y, x, z, rh, material, overhang = 0.5) {
    const alongZ = d >= w;
    const span = (alongZ ? w : d) + overhang * 2;
    const len = (alongZ ? d : w) + overhang * 2;
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rh); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
    this.push(g, material, x, y, z, alongZ ? 0 : Math.PI / 2);
  }

  build() {
    const group = new THREE.Group();
    for (const [material, geos] of this.parts) {
      const merged = mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !material.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
    group.add(this.dynamic);
    return group;
  }
}

function mergeGeometries(geos) {
  let count = 0;
  const flat = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; count += n.attributes.position.count; return n; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of flat) {
    g.computeVertexNormals();
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

const FACE = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

function signMesh(text, w, h, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: TX.textTexture(text, opts), side: THREE.DoubleSide }));
  return m;
}

// ----------------------------------------------------------------- kind builders
const glass = () => mat('#7fa9c4', null, { emissive: '#1b3a55', emissiveIntensity: 0.15, roughness: 0.15, metalness: 0.3 });
const white = () => mat('#ffffff');
const dark = () => mat('#1f2328');
const tire = () => mat('#16181b');

function windows(B, b, f, y0, rows) {
  // windows on each wall face, skipping the door spot on the front
  const sides = [
    { n: [0, 1], len: b.w, cx: b.x, cz: b.maxZ + 0.06 },
    { n: [0, -1], len: b.w, cx: b.x, cz: b.minZ - 0.06 },
    { n: [1, 0], len: b.d, cx: b.maxX + 0.06, cz: b.z },
    { n: [-1, 0], len: b.d, cx: b.minX - 0.06, cz: b.z },
  ];
  for (const s of sides) {
    const count = Math.max(1, Math.floor(s.len / 3.6));
    const front = s.n[0] === f[0] && s.n[1] === f[1];
    for (let r = 0; r < rows; r++) for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      if (front && r === 0 && Math.abs(t) < 0.5 / count + 0.01 && count % 2 === 1) continue; // door spot
      const off = t * s.len;
      const x = s.cx + (s.n[1] !== 0 ? off : 0);
      const z = s.cz + (s.n[0] !== 0 ? off : 0);
      const y = y0 + r * 2.7;
      const ry = s.n[0] !== 0 ? Math.PI / 2 : 0;
      B.box(1.5, 1.4, 0.08, x, y, z, glass(), 0, ry);
      B.box(1.7, 0.14, 0.16, x, y - 0.07, z, white(), 0, ry);
      B.box(1.7, 0.14, 0.16, x, y + 1.4, z, white(), 0, ry);
      // shutters
      const sx = s.n[1] !== 0 ? 1 : 0, sz = s.n[0] !== 0 ? 1 : 0;
      B.box(0.45, 1.5, 0.1, x - sx * 1.0, y - 0.05, z - sz * 1.0, mat(b.roof || '#334155'), 0, ry);
      B.box(0.45, 1.5, 0.1, x + sx * 1.0, y - 0.05, z + sz * 1.0, mat(b.roof || '#334155'), 0, ry);
    }
  }
}

function buildHouse(B, b) {
  const f = FACE[b.facing] || FACE.s;
  B.box(b.w, b.h, b.d, b.x, 0, b.z, mat(b.wall, TX.siding()), 1.2);
  B.box(b.w + 0.2, 0.6, b.d + 0.2, b.x, 0, b.z, mat('#ffffff', TX.brick()), 1.4); // brick foundation
  B.roof(b.w, b.d, b.h, b.x, b.z, b.big ? 3.6 : (b.ranch ? 2.0 : 3), mat(b.roof, TX.shingles()));
  windows(B, b, f, 1.1, b.h > 5 ? 2 : 1);
  const along = b.d >= b.w;
  for (const sgn of [-1, 1]) { // gutters
    if (along) B.box(0.14, 0.14, b.d + 1, b.x + sgn * (b.w / 2 + 0.5), b.h - 0.1, b.z, mat('#e5e7eb', null, { roughness: 0.5, metalness: 0.5 }));
    else B.box(b.w + 1, 0.14, 0.14, b.x, b.h - 0.1, b.z + sgn * (b.d / 2 + 0.5), mat('#e5e7eb', null, { roughness: 0.5, metalness: 0.5 }));
  }
  // front door + porch
  const fx = b.x + f[0] * (b.w / 2 + 0.06), fz = b.z + f[1] * (b.d / 2 + 0.06);
  const ry = f[0] !== 0 ? Math.PI / 2 : 0;
  B.box(1.3, 2.3, 0.12, fx, 0.2, fz, mat(b.big ? '#7c2d12' : '#b91c1c'), 0, ry);
  B.box(1.6, 0.2, 0.2, fx, 2.5, fz, white(), 0, ry);
  const px = b.x + f[0] * (b.w / 2 + 1.1), pz = b.z + f[1] * (b.d / 2 + 1.1);
  B.box(f[0] ? 2 : 3.4, 0.25, f[0] ? 3.4 : 2, px, 0, pz, mat('#cfc8b8', TX.concrete()), 1);
  // chimney
  B.box(1, 2.5, 1, b.x - (f[1] ? b.w * 0.3 : 0), b.h + (b.ranch ? 0.4 : 1), b.z - (f[0] ? b.d * 0.3 : 0), mat('#ffffff', TX.brick()), 1.2);
  if (b.big) {
    // porch columns for the McMansion
    for (const off of [-3, -1.2, 1.2, 3]) {
      B.cyl(0.25, 0.25, b.h - 0.3, b.x + off, 0.3, b.z + f[1] * (b.d / 2 + 1.6), white(), 10);
    }
    B.box(8.5, 0.4, 2.4, b.x, b.h - 0.4, b.z + f[1] * (b.d / 2 + 1.2), white());
  }
  if (b.label) {
    const s = signMesh(b.label, 2.8, 0.55, { bg: '#ffffff', border: '#1d2318', w: 512, h: 100 });
    s.position.set(fx + f[0] * 0.05, 3.0, fz + f[1] * 0.05);
    s.rotation.y = Math.atan2(f[0], f[1]);
    B.dynamic.add(s);
  }
}

function buildGarage(B, b) {
  const f = FACE[b.facing] || FACE.s;
  B.box(b.w, b.h, b.d, b.x, 0, b.z, mat(b.wall, TX.siding()), 1.2);
  B.roof(b.w, b.d, b.h, b.x, b.z, 1.6, mat(b.roof, TX.shingles()), 0.35);
  const ry = f[0] !== 0 ? Math.PI / 2 : 0;
  const gx = b.x + f[0] * (b.w / 2 + 0.05), gz = b.z + f[1] * (b.d / 2 + 0.05);
  B.box(f[0] ? 0.1 : b.w * 0.8, 2.6, f[0] ? b.d * 0.8 : 0.1, gx, 0, gz, mat('#ffffff', TX.garageDoor()));
  void ry;
}

function buildVehicle(B, b) {
  const alongX = b.facing === 'x';
  const L = alongX ? b.w : b.d, W = alongX ? b.d : b.w;
  const ry = alongX ? Math.PI / 2 : 0;
  const body = mat(b.color, null, { roughness: 0.35, metalness: 0.4 });
  const put = (w, h, d, ox, oy, oz, m) => {
    // local (ox along width, oz along length)
    const x = b.x + (alongX ? oz : ox), z = b.z + (alongX ? ox : oz);
    B.box(alongX ? d : w, h, alongX ? w : d, x, oy, z, m);
  };
  if (b.kind === 'golfcart') {
    put(W, 0.5, L, 0, 0.35, 0, body);
    put(W * 0.9, 0.08, L * 0.6, 0, b.h - 0.08, -0.1, mat('#e2e8f0'));
    put(0.08, 1.0, 0.08, W * 0.4, 0.85, -L * 0.35, dark()); put(0.08, 1.0, 0.08, -W * 0.4, 0.85, -L * 0.35, dark());
    put(0.08, 1.0, 0.08, W * 0.4, 0.85, L * 0.15, dark()); put(0.08, 1.0, 0.08, -W * 0.4, 0.85, L * 0.15, dark());
    put(W * 0.8, 0.5, 0.5, 0, 0.85, 0.1, mat('#fef3c7'));
  } else if (b.kind === 'truck') {
    put(W, b.h - 0.5, L * 0.68, 0, 0.5, L * 0.16, body);
    put(W, 1.5, L * 0.3, 0, 0.5, -L * 0.34, mat('#f9fafb'));
    put(W * 0.9, 0.6, 0.05, 0, 1.2, -L * 0.5, glass());
    put(0.05, 1.1, L * 0.35, W / 2 + 0.03, 1.2, L * 0.15, mat('#fca5a5'));
    B.cyl(0.0, 0.5, 1.1, b.x, b.h + 0.55, b.z + (alongX ? 0 : L * 0.2), mat('#d6a35c'), 8, Math.PI, 0);
    B.sphere(0.55, b.x, b.h + 1.25, b.z + (alongX ? 0 : L * 0.2), mat('#f9a8d4'), 1);
    if (b.label) {
      const s = signMesh(b.label, L * 0.6, 0.7, { bg: '#fde68a', fg: '#be185d', border: '#be185d', w: 512, h: 90 });
      s.position.set(b.x - (W / 2 + 0.04), 1.9, b.z + L * 0.16);
      s.rotation.y = -Math.PI / 2;
      B.dynamic.add(s);
    }
  } else if (b.kind === 'pickup') {
    put(W, 0.9, L, 0, 0.45, 0, body);
    put(W * 0.96, 0.8, L * 0.32, 0, 1.3, -L * 0.12, body);
    put(W * 0.9, 0.55, 0.06, 0, 1.4, -L * 0.28, glass());
    put(W, 0.35, 0.12, 0, 1.3, L * 0.5, body); // tailgate lip
    put(W * 1.02, 0.25, 0.25, 0, 0.45, -L * 0.5, mat('#9ca3af'));
  } else {
    // SUV / van
    put(W, 1.0, L, 0, 0.4, 0, body);
    put(W * 0.94, b.h - 1.4, L * 0.72, 0, 1.4, 0.15 * L * 0.5, body);
    put(W * 0.96, (b.h - 1.4) * 0.7, L * 0.6, 0, 1.5, 0.08 * L, glass());
    put(W * 1.02, 0.2, 0.2, 0, 0.55, -L * 0.5, mat('#d1d5db'));
    put(0.4, 0.2, 0.06, W * 0.32, 1.05, -L * 0.5 - 0.02, mat('#fef9c3', null, { emissive: '#fef08a', emissiveIntensity: 0.6 }));
    put(0.4, 0.2, 0.06, -W * 0.32, 1.05, -L * 0.5 - 0.02, mat('#fef9c3', null, { emissive: '#fef08a', emissiveIntensity: 0.6 }));
  }
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ox = sx * (W / 2 - 0.05), oz = sz * L * 0.32;
    const x = b.x + (alongX ? oz : ox), z = b.z + (alongX ? ox : oz);
    B.cyl(0.42, 0.42, 0.3, x, 0.42, z, tire(), 14, 0, Math.PI / 2, ry);
    const hx = x + (alongX ? 0 : sx * 0.16), hz = z + (alongX ? sx * 0.16 : 0);
    B.cyl(0.24, 0.24, 0.02, hx, 0.42, hz, mat('#cbd5e1', null, { roughness: 0.3, metalness: 0.8 }), 10, 0, Math.PI / 2, ry);
  }
}

function buildKind(B, b) {
  const sz = (m, uv = 0) => B.box(b.w, b.h, b.d, b.x, b.y, b.z, m, uv);
  switch (b.kind) {
    case 'invisible': return;
    case 'house': return buildHouse(B, b);
    case 'garage': return buildGarage(B, b);
    case 'suv': case 'truck': case 'golfcart': case 'pickup': return buildVehicle(B, b);
    case 'hedge': return sz(mat('#9fb48e', TX.hedge()), 1.5);
    case 'fence': {
      const alongX = b.w > b.d;
      const len = alongX ? b.w : b.d;
      const n = Math.floor(len / 0.32);
      const fm = mat(b.color || '#fbfaf5');
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5) * (len / n);
        B.box(0.16, b.h, 0.06, b.x + (alongX ? t : 0), 0, b.z + (alongX ? 0 : t), fm, 0, alongX ? 0 : Math.PI / 2);
      }
      for (const yy of [0.3, b.h - 0.35]) B.box(alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, b.x, yy, b.z, fm);
      return;
    }
    case 'shed': {
      sz(mat(b.color, TX.planks()), 1);
      B.roof(b.w, b.d, b.h, b.x, b.z, 1.0, mat('#475569', TX.shingles()), 0.3);
      B.box(1.1, 1.9, 0.08, b.x, 0, b.z + b.d / 2 + 0.03, mat('#f8fafc'));
      return;
    }
    case 'pool': {
      if (b.round) {
        B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, mat(b.color || '#5b8bb5', TX.siding()), 18);
        B.cyl(b.w / 2 - 0.1, b.w / 2 - 0.1, 0.04, b.x, b.h - 0.08, b.z, mat('#38bdf8', null, { roughness: 0.1, metalness: 0.2 }), 18);
        return;
      }
      sz(mat('#cbd5e1'));
      B.box(b.w - 0.4, 0.05, b.d - 0.4, b.x, b.h, b.z, mat('#38bdf8', null, { emissive: '#0369a1', emissiveIntensity: 0.25 }));
      B.box(1.2, 0.1, 0.5, b.x - 1, b.h + 0.02, b.z, mat('#fde047'));
      return;
    }
    case 'trampoline': {
      for (const [sx, sz2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B.cyl(0.06, 0.06, b.h, b.x + sx * b.w * 0.42, 0, b.z + sz2 * b.d * 0.42, dark(), 6);
      B.cyl(b.w / 2, b.w / 2, 0.08, b.x, b.h - 0.08, b.z, mat('#1d4ed8'), 20);
      B.cyl(b.w / 2 - 0.25, b.w / 2 - 0.25, 0.09, b.x, b.h - 0.07, b.z, mat('#111827'), 20);
      return;
    }
    case 'trunk':
      if (b.kind2 === 'fountain') {
        B.cyl(0.4, 0.6, b.h, b.x, 0.8, b.z, mat('#d6d3d1', TX.concrete()), 12);
        B.cyl(1.4, 1.2, 0.3, b.x, 0.8 + b.h * 0.6, b.z, mat('#d6d3d1', TX.concrete()), 16);
        B.cyl(1.25, 1.25, 0.05, b.x, 1.1 + b.h * 0.6, b.z, mat('#5aa9d6', null, { roughness: 0.1, metalness: 0.2 }), 16);
        B.cyl(3.2, 3.2, 0.04, b.x, 0.62, b.z, mat('#5aa9d6', null, { roughness: 0.1, metalness: 0.2 }), 20);
        return;
      }
      return B.cyl(b.w * 0.35, b.w * 0.55, b.h + 1, b.x, 0, b.z, mat('#ffffff', TX.bark([2, 3])), 9);
    case 'planter': {
      B.cyl(b.w / 2, b.w / 2 + 0.2, b.h, b.x, 0, b.z, mat('#a8a29e', TX.concrete()), 16);
      B.cyl(b.w / 2 - 0.3, b.w / 2 - 0.3, 0.05, b.x, b.h, b.z, mat('#5b3a1e'), 16);
      return;
    }
    case 'monument': {
      sz(mat('#9ca3af', TX.concrete()), 1);
      if (b.text) {
        const s = signMesh(b.text, b.w * 0.9, b.h * 0.5, { bg: '#9ca3af', fg: '#111827', border: null, w: 512, h: 140 });
        s.position.set(b.x, b.y + b.h * 0.55, b.z + b.d / 2 + 0.02);
        B.dynamic.add(s);
      }
      return;
    }
    case 'trash': {
      sz(mat(b.color));
      B.box(b.w + 0.08, 0.1, b.d + 0.08, b.x, b.h, b.z, mat(b.color));
      return;
    }
    case 'mailbox': {
      B.box(0.1, 1.0, 0.1, b.x, 0, b.z, mat('#4b3621'));
      B.box(b.w, 0.35, b.d + 0.2, b.x, 0.95, b.z, mat(b.color));
      B.box(0.04, 0.25, 0.1, b.x + b.w / 2 + 0.02, 1.15, b.z - 0.1, mat('#dc2626'));
      return;
    }
    case 'mower': {
      B.box(b.w, 0.35, b.d * 0.7, b.x, 0.1, b.z, mat(b.color));
      B.box(0.06, 0.8, 0.06, b.x - b.w * 0.35, 0.3, b.z + b.d * 0.4, dark());
      B.box(0.06, 0.8, 0.06, b.x + b.w * 0.35, 0.3, b.z + b.d * 0.4, dark());
      B.box(b.w * 0.8, 0.06, 0.06, b.x, b.h, b.z + b.d * 0.45, dark());
      return;
    }
    case 'grill': {
      B.box(b.w, 0.6, b.d, b.x, 0.45, b.z, dark());
      B.box(b.w * 0.9, 0.3, b.d * 0.9, b.x, 0.85, b.z, mat('#374151'));
      for (const sx of [-1, 1]) B.box(0.06, 0.45, 0.06, b.x + sx * b.w * 0.4, 0, b.z, dark());
      return;
    }
    case 'hottub': {
      sz(mat('#8b5a2b', TX.planks()), 1);
      B.box(b.w - 0.3, 0.05, b.d - 0.3, b.x, b.h, b.z, mat('#5eead4', null, { emissive: '#0f766e', emissiveIntensity: 0.3 }));
      return;
    }
    case 'swing': {
      const m = mat('#b91c1c');
      for (const sx of [-1, 1]) B.box(0.15, b.h, 0.15, b.x + sx * b.w / 2, 0, b.z, m);
      B.box(b.w + 0.3, 0.15, 0.15, b.x, b.h, b.z, m);
      for (const sx of [-0.25, 0.25]) {
        B.box(0.03, b.h - 0.6, 0.03, b.x + sx * b.w - 0.25, 0.6, b.z, dark());
        B.box(0.03, b.h - 0.6, 0.03, b.x + sx * b.w + 0.25, 0.6, b.z, dark());
        B.box(0.6, 0.06, 0.25, b.x + sx * b.w, 0.55, b.z, mat('#facc15'));
      }
      return;
    }
    case 'slab': {
      if (b.kind2 === 'bridge') {
        sz(mat('#a16207', TX.planks()), 1);
        for (const sx of [-1, 1]) {
          if (b.alongX) B.box(b.w, 0.9, 0.12, b.x, b.h, b.z + sx * (b.d / 2 - 0.06), mat('#7c4a1e'));
          else B.box(0.12, 0.9, b.d, b.x + sx * (b.w / 2 - 0.06), b.h, b.z, mat('#7c4a1e'));
        }
        return;
      }
      return sz(mat('#c4bfb3', TX.concrete()), 2);
    }
    case 'wall': {
      const alongX = b.w > b.d;
      const len = alongX ? b.w : b.d;
      const n = Math.floor(len / 0.6);
      const wm = mat('#d6b98c', TX.wood());
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + i * (len / n);
        B.box(0.12, b.h, 0.25, b.x + (alongX ? t : 0), b.y, b.z + (alongX ? 0 : t), wm, 0, alongX ? 0 : Math.PI / 2);
      }
      B.box(b.w, 0.12, b.d, b.x, b.y + b.h - 0.12, b.z, wm);
      B.box(b.w, 0.12, b.d, b.x, b.y, b.z, wm);
      // OSB sheathing on part of the wall
      B.box(alongX ? len * 0.55 : b.d + 0.02, b.h * 0.8, alongX ? b.d + 0.02 : len * 0.55, b.x - (alongX ? len * 0.2 : 0), b.y + 0.1, b.z - (alongX ? 0 : len * 0.2), mat('#c8a26b', TX.planks()), 1);
      return;
    }
    case 'post': {
      sz(mat(b.color || '#d6b98c'));
      if (b.flag) {
        B.box(0.6, 0.4, 0.03, b.x + 0.3, b.h - 0.45, b.z, mat('#dc2626'));
        return;
      }
      if (b.hoop) {
        B.box(1.4, 0.9, 0.08, b.x, b.h - 0.6, b.z + 0.35, white());
        B.cyl(0.25, 0.25, 0.04, b.x, b.h - 0.5, b.z + 0.65, mat('#ea580c'), 12);
      }
      return;
    }
    case 'lumber': {
      const lm = mat('#e3c08d', TX.wood());
      const layers = Math.round(b.h / 0.2);
      for (let i = 0; i < layers; i++) B.box(b.w, 0.18, b.d, b.x + (i % 2 ? 0.05 : -0.05), i * 0.2, b.z, lm);
      return;
    }
    case 'potty': {
      sz(mat('#2563eb'));
      B.box(b.w + 0.1, 0.12, b.d + 0.1, b.x, b.h, b.z, mat('#e5e7eb'));
      B.box(0.9, 1.9, 0.05, b.x, 0.1, b.z + b.d / 2 + 0.02, mat('#1e40af'));
      return;
    }
    case 'mixer': {
      B.box(b.w, 0.5, b.d, b.x, 0, b.z, mat('#374151'));
      B.cyl(0.55, 0.75, 1.3, b.x, 0.6, b.z, mat('#f97316'), 10, 0.5, 0);
      return;
    }
    case 'cone': {
      B.cyl(0.04, b.w / 2, b.h, b.x, 0, b.z, mat('#f97316'), 8);
      B.cyl(0.16, 0.2, 0.12, b.x, b.h * 0.45, b.z, white(), 8);
      return;
    }
    case 'barricade': {
      const alongX = b.w > b.d;
      for (const s of [-1, 1]) B.box(alongX ? 0.12 : 0.6, b.h, alongX ? 0.6 : 0.12, b.x + (alongX ? s * b.w * 0.42 : 0), 0, b.z + (alongX ? 0 : s * b.d * 0.42), white());
      for (let i = 0; i < 2; i++) B.box(b.w, 0.22, b.d * 0.3, b.x, 0.55 + i * 0.4, b.z, mat(i ? '#ffffff' : '#f97316'));
      return;
    }
    case 'sign': {
      B.box(0.18, b.h, 0.18, b.x - 1.3, 0, b.z, mat('#4b3621'));
      B.box(0.18, b.h, 0.18, b.x + 1.3, 0, b.z, mat('#4b3621'));
      const s = signMesh(b.text || '', 3.2, 1.1, { bg: '#2f7d32', fg: '#ffffff', border: '#ffffff' });
      s.position.set(b.x, b.h - 0.8, b.z - 0.1);
      B.dynamic.add(s);
      return;
    }
    case 'lamp': {
      B.cyl(0.08, 0.12, b.h, b.x, 0, b.z, mat('#1f2937'), 8);
      B.box(0.6, 0.25, 0.6, b.x, b.h, b.z, mat('#1f2937'));
      B.box(0.45, 0.1, 0.45, b.x, b.h - 0.08, b.z, mat('#fff7cc', null, { emissive: '#fde68a', emissiveIntensity: 0.9 }));
      return;
    }
    // ----- farm kinds (used by THE FARMSTEAD)
    case 'barn': {
      sz(mat(b.color || '#b42318', TX.planks()), 1.4);
      B.roof(b.w, b.d, b.h, b.x, b.z, b.roofH || 4, mat('#4b5563', TX.shingles()), 0.6);
      const alongZ = b.d >= b.w;
      for (const s of [-1, 1]) {
        const ex = b.x + (alongZ ? 0 : s * (b.w / 2 + 0.06)), ez = b.z + (alongZ ? s * (b.d / 2 + 0.06) : 0);
        B.box(alongZ ? 3.2 : 0.1, 3.4, alongZ ? 0.1 : 3.2, ex, 0, ez, white());
        B.box(alongZ ? 2.8 : 0.12, 3.0, alongZ ? 0.12 : 2.8, ex, 0.2, ez, mat('#7f1d1d', TX.planks()), 1);
      }
      return;
    }
    case 'silo': {
      B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, mat('#cbd5e1', TX.siding()), 16);
      B.sphere(b.w / 2, b.x, b.h, b.z, mat('#94a3b8'), 1, [1, 0.6, 1]);
      return;
    }
    case 'hay': return sz(mat('#e2c25a', TX.hay()), 1);
    case 'hayroll': return B.cyl(b.h / 2, b.h / 2, b.w, b.x, b.h / 2, b.z, mat('#d9b44a', TX.hay()), 14, 0, Math.PI / 2);
    case 'tractor': {
      B.box(b.w * 0.6, 1.1, b.d * 0.6, b.x, 0.7, b.z - b.d * 0.1, mat(b.color || '#15803d'));
      B.box(b.w * 0.55, 1.2, b.d * 0.35, b.x, 1.8, b.z + b.d * 0.15, glass());
      B.box(b.w * 0.6, 0.1, b.d * 0.4, b.x, 3.0, b.z + b.d * 0.15, mat(b.color || '#15803d'));
      B.cyl(0.08, 0.08, 1, b.x - 0.3, 1.8, b.z - b.d * 0.35, dark(), 6);
      for (const s of [-1, 1]) {
        B.cyl(0.95, 0.95, 0.55, b.x + s * (b.w / 2 - 0.25), 0.95, b.z + b.d * 0.25, tire(), 14, 0, Math.PI / 2);
        B.cyl(0.5, 0.5, 0.4, b.x + s * (b.w / 2 - 0.3), 0.5, b.z - b.d * 0.35, tire(), 12, 0, Math.PI / 2);
      }
      return;
    }
    case 'coop': {
      sz(mat('#e7d3a6', TX.planks()), 1);
      B.roof(b.w, b.d, b.h, b.x, b.z, 0.9, mat('#7f1d1d'), 0.25);
      return;
    }
    case 'trough': {
      sz(mat('#9ca3af'));
      B.box(b.w - 0.2, 0.05, b.d - 0.2, b.x, b.h - 0.1, b.z, mat('#60a5fa'));
      return;
    }
    case 'tank': {
      if (b.lying) {
        B.cyl(b.w / 2, b.w / 2, b.d, b.x, b.h / 2 + 0.15, b.z, mat(b.color || '#e5e7eb', null, { roughness: 0.35, metalness: 0.4 }), 14, Math.PI / 2, 0);
        for (const s2 of [-1, 1]) B.box(0.15, 0.4, b.w * 0.8, b.x, 0, b.z + s2 * b.d * 0.3, mat('#9ca3af'));
        return;
      }
      B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, mat(b.color || '#e5e7eb'), 14);
      return;
    }
    case 'woodpile': {
      const lm = mat('#8b5a2b', TX.wood());
      const alongX = b.w > b.d;
      for (let row = 0; row < Math.round(b.h / 0.35); row++) for (let i = 0; i < 5; i++) {
        const off = (i - 2) * ((alongX ? b.d : b.w) / 5);
        B.cyl(0.17, 0.17, alongX ? b.w : b.d, b.x + (alongX ? 0 : off), row * 0.35 + 0.17, b.z + (alongX ? off : 0), lm, 7, alongX ? 0 : Math.PI / 2, alongX ? Math.PI / 2 : 0);
      }
      return;
    }
    case 'porch': {
      sz(mat('#a16207', TX.planks()), 1);
      return;
    }
    case 'farmhouse': return buildHouse(B, b);
    case 'outhouse': {
      sz(mat('#92400e', TX.planks()), 1);
      B.roof(b.w, b.d, b.h, b.x, b.z, 0.5, mat('#57534e'), 0.15);
      return;
    }
    case 'crate': return sz(mat('#b45309', TX.planks()), 1);
    case 'rail': {
      // split-rail farm fence
      const alongX = b.w > b.d, len = alongX ? b.w : b.d;
      const wm = mat('#8b6b43', TX.wood());
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + i * (len / n);
        B.box(0.18, b.h + 0.1, 0.18, b.x + (alongX ? t : 0), 0, b.z + (alongX ? 0 : t), wm);
      }
      for (const yy of [0.45, b.h - 0.2]) B.box(alongX ? len : 0.1, 0.12, alongX ? 0.1 : len, b.x, yy, b.z, wm);
      return;
    }
    case 'tee': return sz(mat('#ffffff', TX.fairway([1, 1])), 1);
    case 'lodge': {
      // the round lodge: octagonal walls + low conical roof (collision stays a box)
      B.cyl(b.w / 2 - 0.5, b.w / 2 - 0.5, b.h, b.x, 0, b.z, mat('#b8a07c', TX.brick()), 16);
      B.cyl(1.2, b.w / 2 + 1.5, 3.2, b.x, b.h, b.z, mat('#6b3a2c', TX.shingles()), 16);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.box(0.25, 0.2, b.w / 2, b.x + Math.cos(a) * b.w / 4, b.h + 1.7, b.z + Math.sin(a) * b.w / 4, mat('#4a2a20'), 0, -a + Math.PI / 2); }
      B.box(2.4, 2.6, 0.2, b.x - b.w / 2 + 0.45, 0, b.z, mat('#7c2d12'), 0, Math.PI / 2);
      const sg = signMesh(b.label || 'LODGE', 3.2, 0.5, { bg: '#1f2937', fg: '#facc15', border: null, w: 384, h: 80 });
      sg.position.set(b.x - b.w / 2 + 0.4, 3.4, b.z); sg.rotation.y = -Math.PI / 2; B.dynamic.add(sg);
      return;
    }
    case 'grainbin': {
      const steel = mat('#cfd5db', TX.siding(), { roughness: 0.4, metalness: 0.6 });
      B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, steel, 20);
      B.cyl(0.4, b.w / 2 + 0.25, b.w * 0.35, b.x, b.h, b.z, mat('#b8c0c8', null, { roughness: 0.35, metalness: 0.7 }), 20);
      B.cyl(0.35, 0.35, 0.5, b.x, b.h + b.w * 0.35, b.z, mat('#9ca3af'), 8);
      for (let i = 0; i < 5; i++) B.box(0.08, b.h, 0.08, b.x + b.w / 2 + 0.05, 0, b.z - 0.3 + i * 0.15 - 0.3, dark()); // ladder
      return;
    }
    case 'wagon': {
      B.box(b.w, b.h - 0.7, b.d, b.x, 0.7, b.z, mat(b.color || '#ca8a04'));
      for (const sz2 of [-1, 1]) for (const sx of [-1, 1]) B.cyl(0.4, 0.4, 0.3, b.x + sx * (b.w / 2 - 0.1), 0.4, b.z + sz2 * b.d * 0.3, tire(), 10, 0, Math.PI / 2);
      return;
    }
    case 'trailer': {
      if (b.boat) {
        B.box(b.w * 0.9, 0.3, b.d, b.x, 0.45, b.z, dark());
        B.box(b.w, 0.9, b.d * 0.85, b.x, 0.75, b.z, mat('#f8fafc', null, { roughness: 0.3 }));
        B.box(b.w * 0.9, 0.2, b.d * 0.2, b.x, 1.65, b.z - b.d * 0.15, mat('#1e40af'));
        for (const sx of [-1, 1]) B.cyl(0.33, 0.33, 0.22, b.x + sx * (b.w / 2), 0.33, b.z, tire(), 10, 0, Math.PI / 2);
        return;
      }
      B.box(b.w, b.h - 0.5, b.d, b.x, 0.5, b.z, mat(b.color || '#e5e7eb', null, { roughness: 0.4, metalness: 0.5 }));
      for (let i = 0; i < 4; i++) B.box(b.w + 0.02, 0.15, 0.6, b.x, b.h - 0.6, b.z - b.d * 0.3 + i * 0.8, dark());
      for (const sx of [-1, 1]) B.cyl(0.38, 0.38, 0.25, b.x + sx * (b.w / 2), 0.38, b.z + 0.8, tire(), 10, 0, Math.PI / 2);
      return;
    }
    case 'polebarn': {
      const metal = mat(b.color || '#7c8a6e', TX.siding(), { roughness: 0.5, metalness: 0.4 });
      sz(metal, 1);
      B.roof(b.w, b.d, b.h, b.x, b.z, 2, mat('#9aa3ad', null, { roughness: 0.35, metalness: 0.6 }), 0.4);
      B.box(0.1, 4, b.d * 0.5, b.x - b.w / 2 - 0.05, 0, b.z, mat('#e5e7eb', TX.garageDoor()));
      return;
    }
    case 'showbarn': {
      // long open-sided livestock barn: low walls, posts, white metal roof (collision is solid)
      const wood = mat('#8a6a48', TX.planks());
      sz(mat('#b9a27f', TX.planks()), 1);
      B.roof(b.w, b.d, b.h, b.x, b.z, 1.6, mat('#f2f4f5', null, { roughness: 0.35, metalness: 0.5 }), 0.8);
      for (let i = 0; i <= 4; i++) {
        const t = -b.d / 2 + (i * b.d) / 4;
        for (const sx of [-1, 1]) B.box(0.25, b.h, 0.25, b.x + sx * (b.w / 2 + 0.1), 0, b.z + t, wood);
      }
      if (b.label) {
        for (const sgn of [-1, 1]) {
          const sg = signMesh(b.label, 3.6, 0.6, { bg: '#ffffff', fg: '#166534', border: '#166534', w: 512, h: 90 });
          sg.position.set(b.x, b.h - 0.6, b.z + sgn * (b.d / 2 + 0.06)); sg.rotation.y = sgn > 0 ? 0 : Math.PI; B.dynamic.add(sg);
        }
      }
      return;
    }
    case 'grandstand': {
      // stepped seating facing the arena (collision: solid block), with a roof on posts
      const steps = 4;
      const facingEast = b.x < 0;
      for (let i = 0; i < steps; i++) {
        const h = ((i + 1) / steps) * b.h * 0.7;
        const off = (i - (steps - 1) / 2) * (b.w / steps) * (facingEast ? -1 : 1);
        B.box(b.w / steps, h, b.d, b.x + off, 0, b.z, mat('#9aa3ad', null, { roughness: 0.4, metalness: 0.5 }));
        B.box(b.w / steps, 0.06, b.d, b.x + off, h, b.z, mat('#c8a26b', TX.planks()), 1);
      }
      const back = b.x + (facingEast ? -1 : 1) * (b.w / 2);
      for (const zz of [-b.d / 2, 0, b.d / 2]) B.box(0.2, b.h + 2, 0.2, back, 0, b.z + zz, dark());
      B.box(b.w + 1, 0.2, b.d + 1, b.x, b.h + 2, b.z, mat('#9aa3ad', null, { roughness: 0.35, metalness: 0.6 }));
      return;
    }
    case 'streetsign': {
      B.box(0.1, b.h, 0.1, b.x, 0, b.z, mat('#9ca3af', null, { roughness: 0.4, metalness: 0.6 }));
      const sg = b.shield
        ? signMesh(b.text || '', 0.8, 0.8, { bg: '#ffffff', fg: '#111111', border: '#111111', w: 256, h: 256, font: 'Rubik, Arial, sans-serif' })
        : signMesh(b.text || '', 1.9, 0.32, { bg: '#1f6b3a', fg: '#ffffff', border: '#ffffff', w: 512, h: 86, font: 'Rubik, Arial, sans-serif' });
      sg.position.set(b.x, b.h - 0.15, b.z); B.dynamic.add(sg);
      return;
    }
    case 'jersey': return sz(mat('#c8c4bb', TX.concrete()), 1.5);
    case 'pavilion': {
      for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.3, b.h, 0.3, b.x + sx * (b.w / 2 - 0.3), 0, b.z + sz2 * (b.d / 2 - 0.3), mat('#5b4a3a', TX.wood()));
      B.roof(b.w, b.d, b.h, b.x, b.z, 1.6, mat('#2f5d3a', null, { roughness: 0.5, metalness: 0.4 }), 0.5);
      B.box(b.w * 0.9, 0.12, b.d * 0.9, b.x, 0, b.z, mat('#c4bfb3', TX.concrete()), 1);
      return;
    }
    case 'picnic': {
      const w = mat('#8a6a48', TX.planks());
      B.box(b.w, 0.08, b.d * 0.5, b.x, b.h - 0.08, b.z, w);
      for (const sz2 of [-1, 1]) B.box(b.w, 0.06, 0.3, b.x, 0.42, b.z + sz2 * b.d * 0.45, w);
      for (const sx of [-1, 1]) B.box(0.08, b.h, b.d * 0.8, b.x + sx * b.w * 0.4, 0, b.z, w);
      return;
    }
    case 'playset': {
      const red = mat('#b91c1c'), post = mat('#e5e7eb', null, { roughness: 0.4, metalness: 0.5 });
      for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.15, b.h, 0.15, b.x + sx * b.w * 0.25, 0, b.z + sz2 * b.d * 0.4, post);
      B.box(b.w * 0.55, 0.15, b.d * 0.85, b.x, 1.5, b.z, mat('#a16207', TX.planks()));
      B.roof(b.w * 0.55, b.d * 0.85, b.h - 0.6, b.x, b.z, 0.8, red, 0.1);
      B.push(new THREE.BoxGeometry(0.8, 0.08, 3), mat('#facc15'), b.x + b.w * 0.42, 0.8, b.z, 0, 0.55, 0); // slide
      return;
    }
    case 'lifeguard': {
      const w = mat('#f5f5f0');
      for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.12, b.h - 0.6, 0.12, b.x + sx * b.w * 0.35, 0, b.z + sz2 * b.d * 0.35, w);
      B.box(b.w * 0.8, 0.1, b.d * 0.8, b.x, b.h - 1.6, b.z, w);
      B.box(b.w * 0.5, 0.6, 0.1, b.x, b.h - 1.5, b.z + b.d * 0.3, mat('#dc2626'));
      dec_umb(B, b.x, b.z, b.h - 1.5);
      return;
    }
    case 'wallseg': {
      const texMap = { siding: TX.siding(), metal: TX.metal(), planks: TX.planks(), brick: TX.brick(), plain: null };
      const t = texMap[b.tex] ?? TX.siding();
      sz(mat(b.tex === 'brick' ? '#ffffff' : b.wall, t, b.tex === 'metal' ? { roughness: 0.45, metalness: 0.45 } : {}), b.tex === 'metal' ? 1.4 : 1.2);
      if (b.sill || b.header === 'door') {
        // trim around openings
        const alongX = b.w > b.d;
        B.box(alongX ? b.w + 0.1 : b.d + 0.04, 0.08, alongX ? b.d + 0.04 : b.w + 0.1, b.x, b.sill ? b.y + b.h : b.y - 0.04, b.z, white());
      }
      return;
    }
    case 'shellroof': {
      // ceiling slab (collision) + pitched roof on top
      B.box(b.w, b.h, b.d, b.x, b.y, b.z, mat('#d8d4cb'));
      const rm = b.metalRoof ? mat(b.roof, TX.metal(), { roughness: 0.35, metalness: 0.55 }) : mat(b.roof, TX.shingles());
      B.roof(b.w, b.d, b.y + b.h, b.x, b.z, b.roofH, rm, 0.45);
      return;
    }
    case 'utilpole': {
      B.cyl(0.14, 0.18, b.h, b.x, 0, b.z, mat('#5a4632', TX.wood()), 7);
      B.box(2.4, 0.14, 0.14, b.x, b.h - 0.6, b.z, mat('#5a4632'));
      for (const sx of [-1, 0, 1]) B.cyl(0.05, 0.05, 0.18, b.x + sx * 1.0, b.h - 0.42, b.z, mat('#3f6e8f'), 5);
      B.cyl(0.25, 0.25, 0.8, b.x + 0.35, b.h - 2.2, b.z, mat('#9ca3af', null, { metalness: 0.5, roughness: 0.4 }), 8); // transformer
      return;
    }
    case 'counter': {
      sz(mat('#a3886a', TX.planks()), 1);
      B.box(b.w + 0.05, 0.05, b.d + 0.05, b.x, b.h, b.z, mat('#e7e2d8'));
      return;
    }
    case 'couch': {
      B.box(b.w, 0.45, b.d, b.x, 0, b.z, mat(b.color || '#5b4636'));
      B.box(b.w, 0.5, 0.25, b.x, 0.45, b.z + b.d / 2 - 0.12, mat(b.color || '#5b4636'));
      return;
    }
    case 'bed': {
      B.box(b.w, b.h, b.d, b.x, 0, b.z, mat(b.color || '#7c8a9e'));
      B.box(b.w, 0.9, 0.12, b.x, 0, b.z - b.d / 2, mat('#6b4a2a', TX.wood()));
      return;
    }
    case 'workbench': {
      B.box(b.w, 0.1, b.d, b.x, b.h - 0.1, b.z, mat('#8a6a48', TX.planks()));
      B.box(b.w * 0.95, 0.6, b.d * 0.9, b.x, 0.1, b.z, mat('#6b7280'));
      B.box(0.4, 0.3, 0.3, b.x - b.w * 0.2, b.h, b.z, mat('#dc2626')); // toolbox
      return;
    }
    case 'shelf': {
      const m = mat('#6b7280', null, { metalness: 0.4, roughness: 0.5 });
      for (let i = 0; i < 4; i++) B.box(b.w, 0.05, b.d, b.x, i * 0.7, b.z, m);
      for (const sx of [-1, 1]) B.box(0.06, b.h, b.d, b.x + sx * b.w / 2, 0, b.z, m);
      for (let i = 0; i < 6; i++) B.box(0.5, 0.4, b.d * 0.8, b.x - b.w / 2 + 0.4 + (i % 3) * 1.2, 0.05 + Math.floor(i / 3) * 0.7, b.z, mat(['#b45309', '#1d4ed8', '#9ca3af'][i % 3]));
      return;
    }
    case 'fueltank': {
      for (const sx of [-1, 1]) B.box(0.15, 1.2, 0.15, b.x + sx * b.w * 0.35, 0, b.z, dark());
      B.cyl(b.d / 2, b.d / 2, b.w, b.x, 1.2 + b.d / 2, b.z, mat('#dc2626', null, { roughness: 0.4, metalness: 0.4 }), 12, 0, Math.PI / 2);
      return;
    }
    case 'tires': {
      const n = Math.round(b.h / 0.3);
      for (let i = 0; i < n; i++) B.cyl(b.w / 2, b.w / 2, 0.28, b.x, i * 0.3, b.z, tire(), 12);
      return;
    }
    case 'pallets': {
      const n = Math.round(b.h / 0.15);
      for (let i = 0; i < n; i++) B.box(b.w, 0.13, b.d, b.x + (i % 2) * 0.04, i * 0.15, b.z, mat('#b9a27f', TX.planks()));
      return;
    }
    case 'scrap': {
      B.box(b.w, b.h * 0.6, b.d, b.x, 0, b.z, mat('#7c5a3a', null, { roughness: 0.9, metalness: 0.3 }));
      B.push(new THREE.BoxGeometry(b.w * 0.8, 0.1, b.d * 0.6), mat('#9a6b3f', null, { metalness: 0.4 }), b.x, b.h * 0.7, b.z, 0.4, 0.2, 0.1);
      B.cyl(0.4, 0.4, 0.3, b.x + b.w * 0.3, b.h * 0.6 + 0.2, b.z, tire(), 10, 0.8, 0);
      return;
    }
    case 'barrel': {
      B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, mat(b.color || '#7c2d12', null, { roughness: 0.8, metalness: 0.3 }), 10);
      return;
    }
    case 'bush': {
      const m = mat(['#3b5f2a', '#4a6b2f', '#36552a'][Math.floor((b.x * 7 + b.z * 3) % 3 + 3) % 3], null, { roughness: 1 });
      B.sphere(Math.max(b.w, b.d) / 2, b.x, b.h * 0.45, b.z, m, 1, [1, b.h / Math.max(b.w, b.d) * 1.1, b.d / b.w]);
      return;
    }
    case 'dumpster': {
      B.box(b.w, b.h * 0.85, b.d, b.x, 0.15, b.z, mat(b.color || '#1f4d3a', null, { roughness: 0.6, metalness: 0.4 }));
      B.push(new THREE.BoxGeometry(b.w * 1.02, 0.08, b.d * 1.05), mat('#111827'), b.x, b.h, b.z, 0, 0.12, 0);
      for (const sx of [-1, 1]) B.cyl(0.12, 0.12, 0.15, b.x + sx * b.w * 0.4, 0, b.z, dark(), 6);
      return;
    }
    case 'ac': {
      sz(mat('#cbd5e1', null, { roughness: 0.4, metalness: 0.5 }));
      B.cyl(b.w * 0.4, b.w * 0.4, 0.03, b.x, b.h, b.z, dark(), 12);
      return;
    }
    case 'generator': {
      sz(mat('#facc15', null, { roughness: 0.5, metalness: 0.3 }));
      B.box(b.w * 0.9, 0.15, b.d * 0.9, b.x, b.h, b.z, dark());
      return;
    }
    case 'kayaks': {
      const cols = ['#dc2626', '#facc15', '#2563eb'];
      for (let i = 0; i < 3; i++) B.sphere(0.3, b.x + (i - 1) * 0.42, 0.25 + i * 0.05, b.z, mat(cols[i]), 1, [1, 0.6, b.d / 0.6]);
      return;
    }
    case 'kiddiepool': {
      B.cyl(b.w / 2, b.w / 2, b.h, b.x, 0, b.z, mat('#38bdf8'), 16);
      B.cyl(b.w / 2 - 0.15, b.w / 2 - 0.15, 0.03, b.x, b.h, b.z, mat('#7dd3fc', null, { roughness: 0.1 }), 16);
      return;
    }
    case 'plate': return B.box(b.w, b.h, b.d, b.x, b.y, b.z, mat(b.color || '#9ca3af', TX.metal(), { roughness: 0.4, metalness: 0.5 }), 1);
    case 'carport': {
      // posts + metal roof; the posts are thin so the space underneath stays open
      for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.12, b.h, 0.12, b.x + sx * (b.w / 2 - 0.1), 0, b.z + sz2 * (b.d / 2 - 0.1), mat(b.color || '#9ca3af'));
      B.box(b.w + 0.3, 0.08, b.d + 0.3, b.x, b.h, b.z, mat(b.color || '#9ca3af', TX.metal(), { roughness: 0.4, metalness: 0.5 }));
      return;
    }
    case 'ballwasher': {
      B.box(0.08, b.h, 0.08, b.x, 0, b.z, dark());
      B.box(0.3, 0.3, 0.2, b.x, b.h - 0.3, b.z, mat('#1d4ed8'));
      return;
    }
    case 'table': {
      B.cyl(b.w / 2, b.w / 2, 0.08, b.x, b.y + b.h - 0.08, b.z, white(), 14);
      B.cyl(0.06, 0.06, b.h, b.x, b.y, b.z, dark(), 6);
      return;
    }
    case 'chair': {
      B.box(b.w, 0.15, b.d, b.x, b.y + 0.3, b.z, white());
      B.box(b.w, 0.5, 0.12, b.x, b.y + 0.35, b.z + b.d / 2 - 0.06, white());
      return;
    }
    case 'metalroof': {
      B.box(b.w, b.h, b.d, b.x, b.y, b.z, mat('#9aa3ad', null, { roughness: 0.4, metalness: 0.6 }));
      return;
    }
    case 'scarecrow': {
      B.box(0.12, b.h, 0.12, b.x, 0, b.z, mat('#6b4a2a'));
      B.box(1.6, 0.1, 0.1, b.x, b.h - 0.8, b.z, mat('#6b4a2a'));
      B.box(0.6, 0.8, 0.3, b.x, b.h - 1.3, b.z, mat('#8f2a1e', TX.flannel('#8f2a1e')));
      B.sphere(0.25, b.x, b.h - 0.2, b.z, mat('#d9b44a', TX.hay()), 1);
      B.cyl(0.0, 0.45, 0.35, b.x, b.h, b.z, mat('#7c5a2b'), 8);
      return;
    }
    case 'stand': {
      const f = FACE[b.facing] || FACE.s;
      B.box(b.w, b.h - 0.6, b.d, b.x, 0, b.z, mat('#f5efe0', TX.planks()), 1);
      // striped awning
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = -b.w / 2 + (i + 0.5) * (b.w / n);
        const alongX = !f[0];
        B.box(alongX ? b.w / n : b.d + 1.2, 0.12, alongX ? b.d + 1.2 : b.w / n, b.x + (alongX ? t : f[0] * 0.6), b.h - 0.5, b.z + (alongX ? f[1] * 0.6 : t), mat(i % 2 ? '#ffffff' : b.color));
      }
      if (b.label) {
        const sgn = signMesh(b.label, Math.min(b.w, 4), 0.6, { bg: '#fff8e7', fg: b.color, border: b.color, w: 512, h: 90 });
        sgn.position.set(b.x + f[0] * (b.w / 2 + 0.05), b.h - 0.2, b.z + f[1] * (b.d / 2 + 0.75));
        sgn.rotation.y = Math.atan2(f[0], f[1]);
        B.dynamic.add(sgn);
      }
      return;
    }
    case 'ticket': {
      B.box(b.w, b.h, b.d, b.x, 0, b.z, mat('#dc2626'));
      B.box(b.w + 0.3, 0.2, b.d + 0.3, b.x, b.h, b.z, mat('#facc15'));
      if (b.label) { const sg = signMesh(b.label, b.w * 0.9, 0.45, { bg: '#facc15', fg: '#7f1d1d', border: null, w: 384, h: 80 }); sg.position.set(b.x, b.h - 0.5, b.z + b.d / 2 + 0.02); B.dynamic.add(sg); }
      return;
    }
    case 'ferrisbase': {
      B.box(b.w, b.h, b.d, b.x, 0, b.z, mat('#475569'));
      return;
    }
    case 'sled': {
      B.box(b.w, 0.6, b.d, b.x, 0, b.z, mat('#facc15'));
      B.box(b.w * 0.8, 0.6, b.d * 0.4, b.x, 0.6, b.z - b.d * 0.2, mat('#1f2937'));
      return;
    }
    case 'bleacher': {
      B.box(b.w, b.h, b.d, b.x, 0, b.z, mat('#9aa3ad', null, { roughness: 0.4, metalness: 0.5 }));
      B.box(b.w * 0.9, 0.06, b.d, b.x, b.h, b.z, mat('#c8a26b', TX.planks()), 1);
      return;
    }
    default: return sz(mat(b.color || '#9ca3af'));
  }
}

function dec_umb(B, x, z, y) {
  B.cyl(0.04, 0.04, 1.8, x, y, z, mat('#e5e7eb'), 6);
  B.cyl(0.05, 1.2, 0.4, x, y + 1.6, z, mat('#dc2626'), 8);
}

function buildDecor(B, d) {
  switch (d.kind) {
    case 'gnome': {
      B.cyl(0.14, 0.18, 0.3, d.x, 0, d.z, mat('#2563eb'), 8);
      B.sphere(0.11, d.x, 0.38, d.z, mat('#fcd7b6'));
      B.cyl(0.11, 0.13, 0.14, d.x, 0.27, d.z + 0.05, white(), 6);
      B.cyl(0.0, 0.13, 0.3, d.x, 0.45, d.z, mat('#dc2626'), 8);
      return;
    }
    case 'flamingo': {
      B.cyl(0.015, 0.015, 0.7, d.x, 0, d.z, dark(), 4);
      B.sphere(0.2, d.x, 0.85, d.z, mat('#f472b6'), 0, [1.4, 0.8, 0.8]);
      B.cyl(0.03, 0.03, 0.4, d.x + 0.2, 1.0, d.z, mat('#f472b6'), 5);
      B.sphere(0.08, d.x + 0.22, 1.22, d.z, mat('#f472b6'));
      return;
    }
    case 'flower': {
      B.cyl(0.02, 0.02, 0.3, d.x, d.y || 0, d.z, mat('#15803d'), 4);
      B.sphere(0.12, d.x, (d.y || 0) + 0.35, d.z, mat(d.color || '#f472b6'));
      return;
    }
    case 'canopy': {
      if (QUALITY === 'high') {
        // console-era tree: clusters of crossed leaf cards around a dark core
        const leaf = mat('#ffffff', TX.foliage(), { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
        const core = mat('#2a4a1c', null, { roughness: 1 });
        B.sphere(d.r * 0.7, d.x, d.y + d.r * 0.45, d.z, core, 1, [1, 0.8, 1]);
        const clusters = [[0, 0.5, 0, 1], [0.55, 0.8, -0.2, 0.7], [-0.5, 0.75, 0.3, 0.7], [0.1, 1.15, 0.15, 0.65], [-0.2, 0.3, -0.55, 0.6], [0.3, 0.35, 0.55, 0.6]];
        clusters.forEach(([ox, oy, oz, sc], ci) => {
          const size = d.r * 1.6 * sc;
          for (let k = 0; k < 3; k++) {
            const pg = new THREE.PlaneGeometry(size, size);
            B.push(pg, leaf, d.x + ox * d.r, d.y + oy * d.r, d.z + oz * d.r, (k * Math.PI) / 3 + ci, k === 2 ? Math.PI / 2 : 0, 0);
          }
        });
        return;
      }
      const c = mat(d.color || '#3f8f3a', null, { roughness: 1 });
      B.sphere(d.r, d.x, d.y + d.r * 0.4, d.z, c, 1, [1, 0.8, 1]);
      B.sphere(d.r * 0.65, d.x + d.r * 0.5, d.y + d.r * 0.85, d.z - d.r * 0.25, c, 1);
      return;
    }
    case 'lawnSign': {
      B.box(0.05, 0.9, 0.05, d.x, 0, d.z, mat('#4b3621'));
      const s = signMesh(d.text || '', 1.1, 0.42, { bg: '#ffffff', fg: '#b91c1c', border: '#b91c1c', w: 384, h: 140 });
      s.position.set(d.x, 0.8, d.z);
      s.rotation.y = d.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      B.dynamic.add(s);
      return;
    }
    case 'umbrella': {
      const y0 = d.y || 0;
      B.cyl(0.04, 0.04, 2.3, d.x, y0, d.z, mat('#e5e7eb'), 6);
      B.cyl(0.05, 1.5, 0.5, d.x, y0 + 2.1, d.z, mat(d.color || '#1f4d3a'), 8);
      return;
    }
    case 'flag': {
      B.box(0.06, 4, 0.06, d.x, 0, d.z, white());
      B.cyl(0.0, 0.5, 0.8, d.x, 3.2, d.z, mat(d.color), 3, Math.PI, 0);
      return;
    }
    case 'ferris': {
      const steel = mat('#e5e7eb', null, { roughness: 0.35, metalness: 0.6 });
      const cy = d.r + 2.5;
      for (const zoff of [-1.2, 1.2]) {
        B.push(new THREE.TorusGeometry(d.r, 0.12, 6, 40), steel, d.x, cy, d.z + zoff);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          B.push(new THREE.CylinderGeometry(0.06, 0.06, d.r, 4), steel, d.x + Math.cos(a) * d.r / 2, cy + Math.sin(a) * d.r / 2, d.z + zoff, 0, 0, a + Math.PI / 2);
        }
        for (const sx of [-1, 1]) B.push(new THREE.CylinderGeometry(0.15, 0.2, cy + 0.5, 6), mat('#94a3b8'), d.x + sx * 3, cy / 2, d.z + zoff, 0, 0, sx * 0.22);
      }
      const colors = ['#dc2626', '#facc15', '#2563eb', '#16a34a', '#ea580c', '#9333ea'];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        B.box(1.1, 1.0, 1.6, d.x + Math.cos(a) * d.r, cy + Math.sin(a) * d.r - 1.0, d.z, mat(colors[i % colors.length]));
      }
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const c = ['#fff1b8', '#ff8fb1', '#8fd3ff'][i % 3];
        B.sphere(0.13, d.x + Math.cos(a) * d.r, cy + Math.sin(a) * d.r, d.z + 1.35, mat(c, null, { emissive: c, emissiveIntensity: 2.5 }), 0);
      }
      return;
    }
    case 'plowed': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat('#ffffff', TX.furrows([d.w / 8, d.d / 8])));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.03, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
      return;
    }
    case 'lights': {
      // string of glowing bulbs between two poles (cheap: emissive, no real lights)
      const pole = mat('#4b3a2a');
      B.box(0.15, d.h, 0.15, d.x1, 0, d.z1, pole);
      B.box(0.15, d.h, 0.15, d.x2, 0, d.z2, pole);
      const n = Math.max(4, Math.round(Math.hypot(d.x2 - d.x1, d.z2 - d.z1) / 1.2));
      const bulbColors = ['#fff1b8', '#ffd27a', '#ffb3b3', '#b8e1ff'];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const sag = Math.sin(t * Math.PI) * 0.9;
        B.sphere(0.09, d.x1 + (d.x2 - d.x1) * t, d.h - 0.1 - sag, d.z1 + (d.z2 - d.z1) * t, mat(bulbColors[i % 4], null, { emissive: bulbColors[i % 4], emissiveIntensity: 2.2 }), 0);
      }
      return;
    }
    case 'net': {
      B.box(0.03, 0.9, d.len, d.x, 1.5, d.z, mat('#f8fafc', null, { transparent: true, opacity: 0.7 }));
      return;
    }
    case 'buoy': {
      B.sphere(0.25, d.x, 0.15, d.z, mat(d.x % 2 ? '#f97316' : '#f8fafc'), 0);
      return;
    }
    case 'wires': {
      const wm = mat('#1b1b1b');
      for (let i = 0; i < d.n; i++) {
        const ax = d.x1 + ((d.x2 - d.x1) * i) / d.n, az = d.z1 + ((d.z2 - d.z1) * i) / d.n;
        const bx = d.x1 + ((d.x2 - d.x1) * (i + 1)) / d.n, bz = d.z1 + ((d.z2 - d.z1) * (i + 1)) / d.n;
        for (const off of [-1, 0, 1]) {
          const segs = 6;
          for (let k = 0; k < segs; k++) {
            const t0 = k / segs, t1 = (k + 1) / segs;
            const sag = (t) => Math.sin(t * Math.PI) * 0.7;
            const p0 = new THREE.Vector3(ax + (bx - ax) * t0 + (d.z1 === d.z2 ? 0 : off), d.h - 0.4 - sag(t0), az + (bz - az) * t0 + (d.z1 === d.z2 ? 0 : 0));
            const p1 = new THREE.Vector3(ax + (bx - ax) * t1, d.h - 0.4 - sag(t1), az + (bz - az) * t1);
            if (d.z1 === d.z2) { p0.z += 0; p1.z += 0; p0.x = ax + (bx - ax) * t0; p1.x = ax + (bx - ax) * t1; }
            const len = p0.distanceTo(p1);
            const g = new THREE.CylinderGeometry(0.02, 0.02, len, 3);
            g.rotateZ(Math.PI / 2);
            const ang = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
            const yaw = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
            B.push(g, wm, (p0.x + p1.x) / 2 + (d.z1 === d.z2 ? 0 : off), (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 + (d.z1 === d.z2 ? off : 0), yaw, 0, ang);
          }
        }
      }
      return;
    }
    case 'cornrow': {
      // a row of corn stalks (visual only — you can push through the corn, but it hides you)
      const m = mat('#7ca83a'), tassel = mat('#e8c547');
      const n = Math.round(d.len / 0.7);
      for (let i = 0; i < n; i++) {
        const t = -d.len / 2 + (i + 0.5) * (d.len / n);
        const x = d.x + (d.alongX ? t : 0), z = d.z + (d.alongX ? 0 : t);
        const h = 2.1 + ((i * 37) % 7) * 0.08;
        B.cyl(0.05, 0.07, h, x, 0, z, m, 4);
        B.box(0.7, 0.05, 0.12, x, h * 0.55, z, m, 0, i * 1.3);
        B.cyl(0.0, 0.08, 0.35, x, h, z, tassel, 4);
      }
      return;
    }
    case 'chicken': {
      B.sphere(0.18, d.x, 0.25, d.z, white(), 0, [1.2, 1, 0.9]);
      B.sphere(0.09, d.x + 0.17, 0.42, d.z, white());
      B.box(0.06, 0.08, 0.04, d.x + 0.18, 0.5, d.z, mat('#dc2626'));
      return;
    }
    default: return undefined;
  }
}

function buildGround(B, map, decor) {
  const g = {
    dirt: () => TX.dirt([40, 40]),
    fairway: () => TX.fairway([60, 60]),
    pasture: () => TX.pasture([36, 36]),
    fairground: () => TX.fairground([34, 34]),
  }[map.theme.ground]?.() || TX.lawn([48, 48]);
  const size = map.bounds * 2 + 500; // extends to the fog so there is never a visible edge
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(map.theme.groundTint || '#ffffff', g));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  B.dynamic.add(ground);

  const asph = mat('#ffffff', TX.asphalt([1, 1]));
  const conc = mat('#ffffff', TX.concrete([1, 1]));
  const gravel = mat('#b8a98a', TX.dirt([1, 1]));
  for (const d of decor) {
    if (d.kind === 'circleRoad') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(d.r, 48), mat('#ffffff', TX.asphalt([6, 6])));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.02, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
    } else if (d.kind === 'sidewalkRing') {
      const m = new THREE.Mesh(new THREE.RingGeometry(d.r0, d.r1, 48), mat('#ffffff', TX.concrete([10, 1])));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.03, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
    } else if (d.kind === 'green' || d.kind === 'bunker' || d.kind === 'pond') {
      const look = {
        green: mat('#7fae58', TX.lawn([4, 4]), {}),
        bunker: mat('#e8d9a8', TX.concrete([3, 3])),
        pond: mat('#3f7fa6', null, { roughness: 0.08, metalness: 0.3 }),
      }[d.kind];
      const m = new THREE.Mesh(new THREE.CircleGeometry(d.r, 28), look);
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, d.kind === 'pond' ? 0.04 : 0.03, d.z); m.receiveShadow = true;
      if (d.kind !== 'green') m.scale.set(1, 1.25, 1);
      B.dynamic.add(m);
    } else if (d.kind === 'floor' || d.kind === 'ditch') {
      const tex = d.kind === 'ditch' ? TX.lawn([d.w / 4, d.d / 4]) : TX.planks([d.w / 2, d.d / 2]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat(d.kind === 'ditch' ? '#8aa06a' : '#c79a6a', tex));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, d.kind === 'ditch' ? 0.012 : 0.03, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
    } else if (d.kind === 'mown' || d.kind === 'lot' || d.kind === 'arena') {
      const tex = d.kind === 'mown' ? TX.fairway([d.w / 3, d.d / 3]) : d.kind === 'lot' ? TX.asphalt([d.w / 6, d.d / 6]) : TX.dirt([d.w / 5, d.d / 5]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat('#ffffff', tex));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, d.kind === 'mown' ? 0.015 : 0.025, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
      if (d.kind === 'lot') for (let i = -3; i <= 3; i++) for (const zz of [-6, 6]) B.box(0.12, 0.01, 4.5, d.x + i * 6 + 3, 0.03, d.z + zz, white());
    } else if (d.kind === 'waterpoly' || d.kind === 'sandpoly') {
      const shape = new THREE.Shape(d.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ShapeGeometry(shape);
      const isWater = d.kind === 'waterpoly';
      const m = new THREE.Mesh(geo, isWater
        ? mat('#2f6077', null, { roughness: 0.05, metalness: 0.35 })
        : mat('#ffffff', TX.sand([2, 2])));
      m.rotation.x = -Math.PI / 2; m.position.y = isWater ? 0.06 : 0.04; m.receiveShadow = true;
      if (!isWater) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8); }
      B.dynamic.add(m);
    } else if (d.kind === 'loop') {
      const outer = new THREE.Shape(); outer.absellipse(0, 0, d.rx, d.rz, 0, Math.PI * 2);
      const hole = new THREE.Path(); hole.absellipse(0, 0, d.rx - d.w, d.rz - d.w, 0, Math.PI * 2, true);
      outer.holes.push(hole);
      const geo = new THREE.ShapeGeometry(outer, 48);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
      const m = new THREE.Mesh(geo, mat('#ffffff', TX.asphalt([1, 1])));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.03, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
    } else if (d.kind === 'creek' || d.kind === 'cartpath') {
      const isPath = d.kind === 'cartpath';
      const water = isPath ? mat('#ffffff', d.road ? TX.asphalt([1, 4]) : TX.concrete([1, 4])) : mat('#3a6d7f', null, { roughness: 0.1, metalness: 0.3 });
      const mud = isPath ? null : mat('#6b5a3e', TX.dirt([1, 1]));
      for (let i = 0; i < d.pts.length - 1; i++) {
        const [x1, z1] = d.pts[i], [x2, z2] = d.pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1) + 1.5, ang = Math.atan2(x2 - x1, z2 - z1);
        for (const [w, y, m] of (isPath ? [[d.w, 0.03, water]] : [[d.w + 2.4, 0.02, mud], [d.w, 0.035, water]])) {
          const seg = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
          seg.rotation.set(-Math.PI / 2, 0, ang); seg.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); seg.receiveShadow = true;
          B.dynamic.add(seg);
        }
      }
    } else if (d.kind === 'court') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat('#3d7a6a'));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.03, d.z); m.receiveShadow = true;
      B.dynamic.add(m);
      for (const off of [-d.w / 2 + 1, d.w / 2 - 1]) B.box(0.08, 0.01, d.d - 2, d.x + off, 0.035, d.z, white());
      for (const off of [-d.d / 2 + 1, d.d / 2 - 1, 0]) B.box(d.w - 2, 0.01, 0.08, d.x, 0.035, d.z + off, white());
    } else if (d.kind === 'road' || d.kind === 'sidewalk' || d.kind === 'driveway' || d.kind === 'path') {
      const m = d.kind === 'road' ? asph : d.kind === 'path' ? gravel : conc;
      const tex = d.kind === 'road' ? TX.asphalt([d.w / 6, d.d / 6]) : d.kind === 'path' ? TX.dirt([d.w / 4, d.d / 4]) : TX.concrete([d.w / 1.5, d.d / 1.5]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat(m.color.getStyle(), tex));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(d.x, d.kind === 'road' ? 0.02 : 0.035, d.z);
      mesh.receiveShadow = true;
      B.dynamic.add(mesh);
      if (d.kind === 'road') {
        // dashed centre line along the road's long axis
        const alongX = d.w > d.d, len = alongX ? d.w : d.d;
        const dashes = Math.floor(len / 4);
        for (let i = 0; i < dashes; i++) {
          const t = -len / 2 + 2 + i * 4;
          if (alongX) B.box(1.8, 0.01, 0.18, d.x + t, 0.025, d.z, mat('#facc15'));
          else B.box(0.18, 0.01, 1.8, d.x, 0.025, d.z + t, mat('#facc15'));
        }
      }
    }
  }
}

function buildBackdrop(B, map) {
  if (map.id === 'lake') { // far shore of the lake: a low wooded ridge
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI * 0.6 + (i / 40) * Math.PI * 1.2;
      const x = Math.sin(a) * 230, z = -Math.cos(a) * 230;
      B.sphere(14 + (i % 3) * 3, x, 2, z, mat('#2f5a24', null, { roughness: 1 }), 1, [1.6, 0.6, 1]);
    }
    return;
  }
  // Cheap distant scenery beyond the boundary hedge for depth.
  const R = map.bounds + 12;
  const treeM = mat('#2f6b2a'), trunkM = mat('#5b3a1e');
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = R + (i % 3) * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 7 + ((i * 13) % 5);
    B.cyl(0.3, 0.4, 2, x, 0, z, trunkM, 5);
    B.cyl(0, 3 + (i % 2), h, x, 1.5, z, treeM, 6);
  }
  if (map.faction !== 'country') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.1;
      const x = Math.cos(a) * (R + 22), z = Math.sin(a) * (R + 22);
      B.box(10, 6, 9, x, 0, z, mat(['#e9d5b0', '#c7d7f5', '#f3c4cf', '#bfe3c0'][i % 4]));
      B.roof(10, 9, 6, x, z, 3, mat('#4b5563'));
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const x = Math.cos(a) * (R + 26), z = Math.sin(a) * (R + 26);
      if (i % 2) B.cyl(3, 3, 14, x, 0, z, mat('#cbd5e1'), 10);
      else { B.box(10, 6, 14, x, 0, z, mat('#8f2a1e')); B.roof(10, 14, 6, x, z, 3.5, mat('#4b5563')); }
    }
  }
}

export function buildWorld(map) {
  const B = new Builder();
  buildGround(B, map, map.decor);
  for (const b of map.boxes) buildKind(B, b);
  for (const d of map.decor) buildDecor(B, d);
  buildBackdrop(B, map);
  return B.build();
}

export function buildSky(theme) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const top = new THREE.Color(theme.sky), mid = new THREE.Color(theme.horizon);
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 400, 0, 1);
    const c = mid.clone().lerp(top, Math.pow(t, 0.5));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  return m;
}
