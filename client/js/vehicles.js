// Vehicles built from bevelled side profiles with wheel arches, tinted glass, chrome trim and
// clear-coated paint (High quality). Front = +z, origin on the ground at the centre.
import * as THREE from 'three';

const cache = {};
const M = {
  paint: (c) => cache['p' + c] || (cache['p' + c] = new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.55, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 })),
  glass: () => cache.glass || (cache.glass = new THREE.MeshPhysicalMaterial({ color: '#141b24', metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })),
  trim: () => cache.trim || (cache.trim = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.7, metalness: 0.1 })),
  chrome: () => cache.chrome || (cache.chrome = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.12, metalness: 1 })),
  tire: () => cache.tire || (cache.tire = new THREE.MeshStandardMaterial({ color: '#1a1a1b', roughness: 0.92 })),
  rim: () => cache.rim || (cache.rim = new THREE.MeshStandardMaterial({ color: '#b8bcc2', roughness: 0.25, metalness: 0.95 })),
  head: () => cache.head || (cache.head = new THREE.MeshStandardMaterial({ color: '#f5f5f0', emissive: '#fff6d8', emissiveIntensity: 0.5, roughness: 0.1 })),
  tail: () => cache.tail || (cache.tail = new THREE.MeshStandardMaterial({ color: '#8b0d0d', emissive: '#a50f0f', emissiveIntensity: 0.4, roughness: 0.2 })),
  seat: () => cache.seat || (cache.seat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.8 })),
};

function extrudeSide(shape, width, mat, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
// side outline (z, y) with semicircular wheel arches cut out of the bottom edge
function body(points, arches, bottom) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) s.lineTo(z, y);
  // bottom edge runs front -> rear, ducking around each arch
  const ord = [...arches].sort((a, b) => b[0] - a[0]);
  for (const [cz, r] of ord) {
    s.lineTo(cz + r, bottom);
    s.absarc(cz, bottom, r, 0, Math.PI, false);
  }
  s.closePath();
  return s;
}
function wheel(r, w) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), M.tire()); tire.rotation.z = Math.PI / 2; g.add(tire);
  const side = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 8, 28), M.tire()); side.rotation.y = Math.PI / 2;
  for (const sx of [-1, 1]) { const t = side.clone(); t.position.x = sx * w * 0.42; g.add(t); }
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 1.02, 24), M.rim()); rim.rotation.z = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, r * 1.05, 0.05), M.chrome());
      sp.rotation.x = (i / 6) * Math.PI; sp.position.x = sx * w * 0.52; g.add(sp);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
function glassPanel(points, x) { // flat window on the side at x
  const s = new THREE.Shape(); s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateY(x > 0 ? -Math.PI / 2 : Math.PI / 2);
  if (x < 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i)); }
  const m = new THREE.Mesh(g, M.glass()); m.position.x = x; return m;
}

function suv(color, L = 4.9, W = 2.0) {
  const g = new THREE.Group(), h = L / 2;
  const prof = [[h, 0.55], [h - 0.05, 0.98], [h - 0.95, 1.12], [h - 1.55, 1.82], [-h + 0.25, 1.86], [-h + 0.05, 1.7], [-h, 1.0], [-h, 0.42]];
  g.add(extrudeSide(body(prof, [[h - 1.05, 0.48], [-h + 1.0, 0.48]], 0.36), W, M.paint(color), 0.07));
  // greenhouse glass (both sides), windshield, rear window
  for (const sx of [-1, 1]) {
    g.add(glassPanel([[h - 1.6, 1.16], [h - 1.62, 1.76], [-h + 0.32, 1.78], [-h + 0.12, 1.62], [-h + 0.12, 1.16]], sx * (W / 2 + 0.003)));
    for (const z of [h - 2.35, h - 3.45]) g.add(bx(0.02, 0.6, 0.07, M.trim(), sx * (W / 2 + 0.006), 1.46, z)); // pillars
    g.add(bx(0.08, 0.1, 0.2, M.trim(), sx * (W / 2 + 0.06), 1.22, h - 1.55));                                    // mirrors
    g.add(bx(0.02, 0.04, L * 0.7, M.chrome(), sx * (W / 2 + 0.004), 1.14, 0));
  }
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.18, 0.86), M.glass()); ws.position.set(0, 1.47, h - 1.25); ws.rotation.x = -0.86; g.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.25, 0.6), M.glass()); rw.position.set(0, 1.44, -h + 0.02); rw.rotation.y = Math.PI; rw.rotation.x = 0.12; g.add(rw);
  // bumpers, grille, lights
  g.add(bx(W + 0.04, 0.26, 0.22, M.trim(), 0, 0.45, h - 0.05)); g.add(bx(W + 0.04, 0.26, 0.22, M.trim(), 0, 0.45, -h + 0.05));
  g.add(bx(W * 0.5, 0.28, 0.04, M.trim(), 0, 0.82, h + 0.0));
  for (let i = 0; i < 4; i++) g.add(bx(W * 0.5, 0.025, 0.05, M.chrome(), 0, 0.72 + i * 0.065, h + 0.01));
  for (const sx of [-1, 1]) { g.add(bx(0.36, 0.14, 0.05, M.head(), sx * (W / 2 - 0.3), 0.86, h + 0.0)); g.add(bx(0.12, 0.34, 0.05, M.tail(), sx * (W / 2 - 0.12), 1.15, -h - 0.0)); }
  for (const [z, sx] of [[h - 1.05, 1], [h - 1.05, -1], [-h + 1.0, 1], [-h + 1.0, -1]]) { const w = wheel(0.4, 0.28); w.position.set(sx * (W / 2 - 0.12), 0.4, z); g.add(w); }
  return g;
}
function pickup(color, L = 5.4, W = 2.0) {
  const g = new THREE.Group(), h = L / 2;
  // cab + hood
  const cabRear = -0.35;
  const prof = [[h, 0.58], [h - 0.05, 1.05], [h - 1.1, 1.18], [h - 1.65, 1.86], [cabRear + 0.1, 1.88], [cabRear, 1.8], [cabRear, 1.05], [-h, 1.05], [-h, 0.45]];
  g.add(extrudeSide(body(prof, [[h - 1.1, 0.5], [-h + 1.05, 0.5]], 0.36), W, M.paint(color), 0.06));
  // open bed: floor dark, inner walls
  g.add(bx(W - 0.16, 0.04, -cabRear - (-h) - 0.15, M.trim(), 0, 1.02, (cabRear + -h) / 2));
  for (const sx of [-1, 1]) g.add(bx(0.06, 0.48, -cabRear - (-h) - 0.1, M.paint(color), sx * (W / 2 - 0.04), 1.27, (cabRear - h) / 2));
  g.add(bx(W - 0.04, 0.5, 0.06, M.paint(color), 0, 1.28, -h + 0.03));
  g.add(bx(W - 0.04, 0.5, 0.06, M.paint(color), 0, 1.28, cabRear - 0.05));
  for (const sx of [-1, 1]) {
    g.add(glassPanel([[h - 1.7, 1.2], [h - 1.72, 1.8], [cabRear + 0.15, 1.82], [cabRear + 0.12, 1.2]], sx * (W / 2 + 0.003)));
    g.add(bx(0.02, 0.6, 0.07, M.trim(), sx * (W / 2 + 0.006), 1.5, (h - 1.7 + cabRear) / 2));
    g.add(bx(0.09, 0.14, 0.22, M.chrome(), sx * (W / 2 + 0.07), 1.3, h - 1.6));
  }
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.18, 0.84), M.glass()); ws.position.set(0, 1.52, h - 1.37); ws.rotation.x = -0.86; g.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, 0.5), M.glass()); rw.position.set(0, 1.52, cabRear - 0.005); rw.rotation.y = Math.PI; g.add(rw);
  g.add(bx(W + 0.06, 0.28, 0.24, M.chrome(), 0, 0.5, h - 0.04)); g.add(bx(W + 0.06, 0.24, 0.2, M.chrome(), 0, 0.48, -h + 0.02));
  g.add(bx(W * 0.62, 0.36, 0.04, M.chrome(), 0, 0.86, h)); for (let i = 0; i < 5; i++) g.add(bx(W * 0.6, 0.03, 0.05, M.trim(), 0, 0.72 + i * 0.07, h + 0.01));
  for (const sx of [-1, 1]) { g.add(bx(0.3, 0.18, 0.05, M.head(), sx * (W / 2 - 0.24), 0.9, h)); g.add(bx(0.1, 0.36, 0.05, M.tail(), sx * (W / 2 - 0.08), 1.3, -h - 0.01)); }
  for (const [z, sx] of [[h - 1.1, 1], [h - 1.1, -1], [-h + 1.05, 1], [-h + 1.05, -1]]) { const w = wheel(0.42, 0.3); w.position.set(sx * (W / 2 - 0.12), 0.42, z); g.add(w); }
  return g;
}
function golfcart(color, L = 2.4, W = 1.3) {
  const g = new THREE.Group(), h = L / 2;
  const prof = [[h, 0.3], [h - 0.02, 0.72], [h - 0.45, 0.78], [h - 0.6, 0.62], [-h + 0.3, 0.62], [-h + 0.3, 0.95], [-h, 0.95], [-h, 0.3]];
  g.add(extrudeSide(body(prof, [[h - 0.4, 0.23], [-h + 0.45, 0.23]], 0.2), W, M.paint(color), 0.05));
  g.add(bx(W - 0.1, 0.12, 0.55, M.seat(), 0, 0.7, -0.1)); g.add(bx(W - 0.1, 0.45, 0.1, M.seat(), 0, 0.95, -0.4));
  for (const [z, sx] of [[h - 0.35, 1], [h - 0.35, -1], [-h + 0.35, 1], [-h + 0.35, -1]]) g.add(bx(0.04, 1.15, 0.04, M.chrome(), sx * (W / 2 - 0.06), 1.25, z * 0.85));
  g.add(bx(W + 0.05, 0.05, L * 0.95, M.paint(color), 0, 1.84, 0));
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.15, 0.85), new THREE.MeshPhysicalMaterial({ color: '#cfe4f0', roughness: 0.05, transparent: true, opacity: 0.25 })); ws.position.set(0, 1.35, h - 0.32); ws.rotation.x = -0.12; g.add(ws);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 18), M.trim()); sw.position.set(0.25, 1.05, 0.15); sw.rotation.x = -1.0; g.add(sw);
  for (const [z, sx] of [[h - 0.4, 1], [h - 0.4, -1], [-h + 0.45, 1], [-h + 0.45, -1]]) { const w = wheel(0.21, 0.18); w.position.set(sx * (W / 2 - 0.06), 0.21, z); g.add(w); }
  return g;
}

/** Vehicle for a map box (kind suv|pickup|truck|golfcart, w/d footprint, facing 'x'|'z'). */
export function buildCar(b) {
  const alongX = b.facing === 'x' || (b.facing == null && b.w > b.d);
  const L = alongX ? b.w : b.d, W = Math.min(alongX ? b.d : b.w, 2.15) - 0.1;
  const c = b.color || '#e5e7eb';
  const car = b.kind === 'golfcart' ? golfcart(c, L, W) : (b.kind === 'pickup' || b.kind === 'truck') ? pickup(c, L, W) : suv(c, L, W);
  car.position.set(b.x, b.y || 0, b.z);
  const flip = Math.abs(Math.round(b.x * 3 + b.z * 7)) % 2 ? Math.PI : 0;
  car.rotation.y = (alongX ? Math.PI / 2 : 0) + flip + (b.ry || 0);
  return car;
}
