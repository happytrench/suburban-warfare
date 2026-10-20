// Photo-scanned props from Poly Haven (CC0): loaded once, cloned into the maps in place of the
// hand-built boxes for the same objects. Each is scaled to the map box's height so collisions still match.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('../vendor/models/props/', import.meta.url).href;
// map box kind -> model folder (+ yaw offset so the long side follows the box)
export const PROP_FOR = {
  barrel: { m: 'barrel_03' },
  picnic: { m: 'wooden_picnic_table', long: 'x' },
  lamp: { m: 'street_lamp_01' },
  crate: { m: 'wooden_crate_01' },
  chair: { m: 'plastic_monobloc_chair_01' },
  generator: { m: 'portable_generator', long: 'x' },
};
const models = {};
export function loadProps() {
  const ld = new GLTFLoader();
  const names = [...new Set(Object.values(PROP_FOR).map((p) => p.m))];
  return Promise.all(names.map((n) => new Promise((res) => ld.load(`${BASE}${n}/model.gltf`, (g) => {
    const s = g.scene;
    s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(s);
    models[n] = { scene: s, box, size: box.getSize(new THREE.Vector3()) };
    res(true);
  }, undefined, () => res(false)))));
}
export const propReady = (kind) => !!(PROP_FOR[kind] && models[PROP_FOR[kind].m]);

/** A placed copy of the prop for map box b (x/z centre, w/d footprint, h height). */
export function placeProp(b) {
  const p = PROP_FOR[b.kind], md = models[p.m];
  const o = md.scene.clone();
  const holder = new THREE.Group();
  // footprint orientation: rotate the model's long axis onto the box's long axis
  const modelLongX = md.size.x >= md.size.z, boxLongX = b.w >= b.d;
  if (p.long && modelLongX !== boxLongX) o.rotation.y = Math.PI / 2;
  const sc = b.h / md.size.y;
  o.scale.setScalar(sc);
  o.position.set(-(md.box.min.x + md.box.max.x) / 2 * sc, -md.box.min.y * sc, -(md.box.min.z + md.box.max.z) / 2 * sc);
  if (o.rotation.y) o.position.set(o.position.z, o.position.y, -o.position.x);
  holder.add(o);
  holder.position.set(b.x, b.y || 0, b.z);
  if (b.ry) holder.rotation.y = b.ry;
  if (!p.long) holder.rotation.y += ((b.x * 12.9898 + b.z * 78.233) % 6.283);
  return holder;
}
