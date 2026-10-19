import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../client/shared/map.js';
import { stepPlayer, isInsideSolid, groundHeightAt } from '../client/shared/physics.js';

function walk(map, from, dir, seconds = 2.5) {
  const st = { pos: { x: from[0], y: 0, z: from[1] }, vel: { x: dir[0] * 6, y: 0, z: dir[1] * 6 }, onGround: true };
  for (let t = 0; t < seconds; t += 1 / 60) { st.vel.x = dir[0] * 6; st.vel.z = dir[1] * 6; stepPlayer(st, 1 / 60, map); }
  return st.pos;
}

test('players can walk through a doorway into the farmhouse', () => {
  const m = MAPS.farmstead;
  const p = walk(m, [52.5, -24], [0, 1]);       // north door of the ranch house at x ≈ 52.5
  assert.ok(p.z > -18, `stopped at z=${p.z.toFixed(2)}`);
});

test('windows block movement (but are open for shooting)', () => {
  const m = MAPS.farmstead;
  const p = walk(m, [48, -24], [0, 1]);          // window at x ≈ 48 on the north wall
  assert.ok(p.z < -20.4, `walked through a window to z=${p.z.toFixed(2)}`);
});

test('every spawn on every map is on open ground', () => {
  for (const m of Object.values(MAPS)) {
    for (const s of m.spawns) {
      const g = groundHeightAt(s.x, s.z, 100, m.boxes);
      assert.ok(!isInsideSolid(s.x, g.y, s.z, m.boxes, -0.4) && g.y < 0.5, `${m.id} spawn ${s.x},${s.z}`);
    }
  }
});
