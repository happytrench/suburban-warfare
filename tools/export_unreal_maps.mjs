// Exports every map (client/shared/map.js) for the Unreal project's map builder.
//   node tools/export_unreal_maps.mjs  ->  unreal/SuburbanWarfare/Content/Python/maps/<id>.json
// Coordinates are converted to Unreal: centimetres, Z up, left-handed.
//   three (x, y, z)  ->  unreal (X = -z, Y = x, Z = y) * 100
// Boxes keep their footprint (w along three-x = unreal Y, d along three-z = unreal X).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS, MAP_ORDER } from '../client/shared/map.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'unreal', 'SuburbanWarfare', 'Content', 'Python', 'maps');
mkdirSync(out, { recursive: true });

const P = (x, y, z) => [Math.round(-z * 100), Math.round(x * 100), Math.round(y * 100)];
// three yaw (radians, 0 = facing -z) -> unreal yaw (degrees, 0 = +X). Facing -z in three is +X in unreal.
const yawDeg = (yaw) => Math.round((-yaw * 180) / Math.PI * 10) / 10;
const FACING = { n: 0, e: 90, s: 180, w: -90 }; // map "facing" letter -> unreal yaw the front looks toward
const KEEP = ['color', 'wall', 'roof', 'trim', 'label', 'text', 'tex', 'ranch', 'big', 'round', 'metalRoof', 'roofH', 'sill', 'header', 'kind2', 'lit'];

for (const id of MAP_ORDER) {
  const m = MAPS[id];
  const boxes = m.boxes.map((b) => {
    const o = { kind: b.kind, loc: P(b.x, b.y || 0, b.z), size: [Math.round(b.d * 100), Math.round(b.w * 100), Math.round(b.h * 100)] };
    if (b.facing) o.facingYaw = b.facing === 'x' ? 90 : b.facing === 'z' ? 0 : FACING[b.facing] ?? 0;
    for (const k of KEEP) if (b[k] != null) o[k] = b[k];
    return o;
  });
  const decor = m.decor.map((d) => {
    const o = { kind: d.kind, loc: P(d.x || 0, d.y || 0, d.z || 0) };
    if (d.w != null) o.size = [Math.round((d.d || d.w) * 100), Math.round(d.w * 100)];
    if (d.r != null) o.r = Math.round(d.r * 100);
    if (d.r0 != null) { o.r0 = Math.round(d.r0 * 100); o.r1 = Math.round(d.r1 * 100); }
    if (d.pts) o.pts = d.pts.map(([x, z]) => [Math.round(-z * 100), Math.round(x * 100)]);
    for (const k of ['color', 'text', 'tex']) if (d[k] != null) o[k] = d[k];
    return o;
  });
  const spawns = m.spawns.map((s) => ({ loc: P(s.x, 0, s.z), yaw: yawDeg(s.yaw || 0) }));
  const data = { id, name: m.name, faction: m.faction, blurb: m.blurb, boundsCm: m.bounds * 100, theme: m.theme, boxes, decor, spawns };
  writeFileSync(path.join(out, `${id}.json`), JSON.stringify(data));
  console.log(`${id}: ${boxes.length} boxes, ${decor.length} decor, ${spawns.length} spawns`);
}
