// Movement collision and ray casting against the map's axis-aligned boxes.
// Shared by client (prediction) and server (validation + hit detection).

import { PLAYER } from './constants.js';

const R = PLAYER.radius;
const H = PLAYER.height;

function circleRectOverlap(px, pz, r, b) {
  const cx = Math.max(b.minX, Math.min(px, b.maxX));
  const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
  const dx = px - cx, dz = pz - cz;
  return dx * dx + dz * dz < r * r;
}

// Push a circle at (pos.x,pos.z) out of every box that overlaps the player's body.
function resolveHorizontal(pos, boxes, onGround) {
  for (const b of boxes) {
    if (pos.y + H <= b.minY + 0.01) continue;            // box entirely above head
    if (pos.y >= b.maxY - 0.01) continue;                // standing on/above it
    if (onGround && b.maxY - pos.y <= PLAYER.stepHeight) continue; // will step up
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = R - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // centre inside the box: push out along the shortest axis
      const left = pos.x - b.minX + R, right = b.maxX - pos.x + R;
      const back = pos.z - b.minZ + R, front = b.maxZ - pos.z + R;
      const m = Math.min(left, right, back, front);
      if (m === left) pos.x = b.minX - R;
      else if (m === right) pos.x = b.maxX + R;
      else if (m === back) pos.z = b.minZ - R;
      else pos.z = b.maxZ + R;
    }
  }
}

// Highest walkable surface under the player's footprint that is not above `maxTop`.
export function groundHeightAt(x, z, maxTop, boxes) {
  let g = 0;
  let surf = null;
  for (const b of boxes) {
    if (b.maxY > maxTop || b.maxY <= g) continue;
    if (!circleRectOverlap(x, z, R * 0.95, b)) continue;
    g = b.maxY;
    surf = b;
  }
  return { y: g, box: surf };
}

/**
 * Advance a player's physics state.
 * state: { pos:{x,y,z}, vel:{x,y,z}, onGround:boolean }
 * Returns events: { bounced, landed }
 */
export function stepPlayer(state, dt, map) {
  const boxes = map.boxes, BOUNDS = map.bounds;
  const ev = { bounced: false, landed: false };
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  const p = state.pos, v = state.vel;
  for (let i = 0; i < steps; i++) {
    const prevY = p.y;
    // horizontal
    p.x += v.x * h;
    p.z += v.z * h;
    resolveHorizontal(p, boxes, state.onGround);
    if (p.x < -BOUNDS) p.x = -BOUNDS; if (p.x > BOUNDS) p.x = BOUNDS;
    if (p.z < -BOUNDS) p.z = -BOUNDS; if (p.z > BOUNDS) p.z = BOUNDS;

    // vertical
    v.y -= PLAYER.gravity * h;
    p.y += v.y * h;

    // ceiling
    if (v.y > 0) {
      for (const b of boxes) {
        if (prevY + H <= b.minY + 0.001 && p.y + H > b.minY && circleRectOverlap(p.x, p.z, R * 0.95, b)) {
          p.y = b.minY - H;
          v.y = 0;
        }
      }
    }

    const reach = state.onGround ? prevY + PLAYER.stepHeight : prevY + 0.02;
    const g = groundHeightAt(p.x, p.z, reach, boxes);
    if (p.y <= g.y) {
      if (g.box && g.box.kind === 'trampoline' && v.y < -1) {
        p.y = g.y;
        v.y = PLAYER.bounceSpeed;
        state.onGround = false;
        ev.bounced = true;
      } else {
        if (!state.onGround) ev.landed = true;
        p.y = g.y;
        v.y = 0;
        state.onGround = true;
      }
    } else if (p.y > g.y + 0.05) {
      state.onGround = false;
    } else if (state.onGround) {
      p.y = g.y; // stick to slopes/steps going down slightly
    }
    if (p.y < -5) { p.y = 0; v.y = 0; } // safety net; should never happen
  }
  return ev;
}

// Is a player standing at feet position (x,y,z) embedded in solid geometry?
export function isInsideSolid(x, y, z, boxes, shrink = 0.15) {
  for (const b of boxes) {
    if (y + H - 0.1 <= b.minY || y + 0.05 >= b.maxY) continue;
    if (circleRectOverlap(x, z, R - shrink, b)) return true;
  }
  return false;
}

// Ray vs axis-aligned box (slab method). Returns distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = Infinity;
  const ax = [ox, oy, oz], ad = [dx, dy, dz];
  const mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ad[i]) < 1e-9) {
      if (ax[i] < mn[i] || ax[i] > mx[i]) return Infinity;
    } else {
      let t1 = (mn[i] - ax[i]) / ad[i];
      let t2 = (mx[i] - ax[i]) / ad[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function raycastMap(o, d, maxDist, boxes) {
  let best = maxDist;
  let hit = null;
  for (const b of boxes) {
    if (b.kind === 'invisible') continue;
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    if (t < best) { best = t; hit = b; }
  }
  // ground plane
  if (d.y < -1e-6) {
    const tg = -o.y / d.y;
    if (tg >= 0 && tg < best) { best = tg; hit = { kind: 'ground' }; }
  }
  return { dist: best, box: hit };
}

export function raySphere(o, d, cx, cy, cz, r) {
  const lx = o.x - cx, ly = o.y - cy, lz = o.z - cz;
  const b = lx * d.x + ly * d.y + lz * d.z;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t < 0 ? Infinity : t;
}

// Hitbox for a player whose feet are at (x,y,z): body box + head sphere.
export const HITBOX = { bodyHalf: 0.42, bodyTop: 1.42, headY: 1.62, headR: 0.27 };

export function rayPlayer(o, d, x, y, z) {
  const head = raySphere(o, d, x, y + HITBOX.headY, z, HITBOX.headR);
  const body = rayBox(o.x, o.y, o.z, d.x, d.y, d.z,
    x - HITBOX.bodyHalf, y, z - HITBOX.bodyHalf,
    x + HITBOX.bodyHalf, y + HITBOX.bodyTop, z + HITBOX.bodyHalf);
  if (head < body) return { dist: head, head: true };
  if (body < Infinity) return { dist: body, head: false };
  return null;
}

export function dirFromAngles(yaw, pitch) {
  // yaw 0 looks toward -z; positive yaw turns left (counter-clockwise from above)
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
