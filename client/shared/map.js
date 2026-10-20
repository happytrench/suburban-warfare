// THE CUL-DE-SAC — the one and only arena of SUBURBAN WARFARE.
//
// Everything solid is an axis-aligned box: { x, z } is the footprint centre,
// y is the bottom, and w/h/d are size on x/y/z. The server uses these same boxes
// for movement validation and bullet occlusion, so what you see is what blocks.
// Coordinates: +x east, +z south (towards the neighbourhood entrance), +y up.

const CIRCLE = { x: 0, z: -6, r: 15 }; // the cul-de-sac turnaround

function finalize(map) {
  for (const b of map.boxes) {
    b.minX = b.x - b.w / 2; b.maxX = b.x + b.w / 2;
    b.minZ = b.z - b.d / 2; b.maxZ = b.z + b.d / 2;
    b.minY = b.y; b.maxY = b.y + b.h;
  }
  return map;
}

function buildCuldesac() {
  const BOUNDS = 55;
  const boxes = [];
  const decor = [];

  const add = (kind, x, z, w, d, h, opts = {}, y = 0) => {
    boxes.push({ kind, x, y, z, w, h, d, ...opts });
  };
  const dec = (kind, x, z, opts = {}) => decor.push({ kind, x, z, ...opts });
  // eslint-disable-next-line no-use-before-define
  const { shell, powerLine } = helpers(boxes, decor); // shared building helpers, same arrays

  // Mirror helper: west-side content is authored once and reflected to the east.
  const sides = [-1, 1];

  // ---------------------------------------------------------------- boundary
  const B = BOUNDS;
  add('invisible', 0, -(B + 1.5), 2 * B + 6, 2, 40);
  add('invisible', 0, B + 1.5, 2 * B + 6, 2, 40);
  add('invisible', -(B + 1.5), 0, 2, 2 * B + 6, 40);
  add('invisible', B + 1.5, 0, 2, 2 * B + 6, 40);
  // Tall privacy hedges ring the whole block (visual + solid)
  add('hedge', 0, -(B + 0.5), 2 * B + 2, 1, 3.2);
  add('hedge', -(B + 0.5), 0, 1, 2 * B + 2, 3.2);
  add('hedge', B + 0.5, 0, 1, 2 * B + 2, 3.2);
  add('hedge', -30.5, B + 0.5, 49, 1, 3.2);
  add('hedge', 30.5, B + 0.5, 49, 1, 3.2);

  // ---------------------------------------------------------------- roads (visual)
  dec('circleRoad', CIRCLE.x, CIRCLE.z, { r: CIRCLE.r });
  dec('road', 0, (CIRCLE.z + B + 1) / 2, { w: 10, d: B + 1 - CIRCLE.z });
  dec('sidewalkRing', CIRCLE.x, CIRCLE.z, { r0: CIRCLE.r, r1: CIRCLE.r + 2 });
  for (const s of sides) dec('sidewalk', s * 6, (CIRCLE.z + 13 + B) / 2, { w: 2, d: B - CIRCLE.z - 13 });

  // ---------------------------------------------------------------- centre island
  add('planter', CIRCLE.x, CIRCLE.z, 8, 8, 0.6);
  add('trunk', CIRCLE.x, CIRCLE.z, 1.1, 1.1, 5);
  dec('canopy', CIRCLE.x, CIRCLE.z, { r: 4.2, y: 5.6, color: '#3f8f3a' });
  add('monument', CIRCLE.x, CIRCLE.z + 2.9, 2.4, 0.6, 1.4, { y: 0.6, text: 'HOA RULE #1' }, 0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    dec('flower', CIRCLE.x + Math.cos(a) * 3.1, CIRCLE.z + Math.sin(a) * 3.1, { y: 0.6, color: i % 2 ? '#f472b6' : '#facc15' });
  }

  // ---------------------------------------------------------------- north: the HOA President's McMansion
  add('house', 0, -41, 20, 10, 6.5, { facing: 's', wall: '#efe7d6', roof: '#4b3a33', trim: '#ffffff', big: true, label: 'HOA PRESIDENT' });
  dec('driveway', 0, -28.5, { w: 7, d: 15 });
  add('suv', -2.2, -28, 2.3, 4.9, 1.9, { color: '#111827', facing: 'z' });
  add('golfcart', 2.6, -27, 1.4, 2.4, 1.6, { color: '#f8fafc', facing: 'z' });
  add('post', 5.2, -34, 0.25, 0.25, 3.2, { color: '#6b7280', hoop: true });
  add('pool', 0, -50.5, 7, 6, 1.0, { color: '#e2e8f0' });
  dec('lawnSign', -6, -32, { text: 'KEEP OFF GRASS' });
  dec('flamingo', 7, -31); dec('flamingo', 7.6, -30.2); dec('gnome', -7, -30);

  // ---------------------------------------------------------------- mirrored lots
  const houseColors = [
    { wall: '#c9cbbd', roof: '#3a3f45', trim: '#fffaf0' }, // NW sage grey
    { wall: '#d8c6a3', roof: '#4a3a2e', trim: '#ffffff' }, // W tan
    { wall: '#a9b8c6', roof: '#33383e', trim: '#ffffff' }, // NE slate blue
    { wall: '#e6e1d6', roof: '#5a4639', trim: '#fff7ed' }, // E cream
  ];
  const suvColors = ['#7a1c1c', '#c9ccd1', '#1f2f4f', '#3b4a32'];

  sides.forEach((s, si) => {
    const X = (v) => v * s; // mirror x
    const face = s < 0 ? 'e' : 'w';
    const c1 = houseColors[si * 2];
    const c2 = houseColors[si * 2 + 1];

    // --- NW / NE house
    add('house', X(-30), -26, 14, 11, 3.4, { facing: face, ranch: true, ...c1, label: s < 0 ? 'THE KAPLANS' : 'THE DUBOISES' });
    add('garage', X(-30), -15.5, 10, 7, 3.3, { facing: face, wall: c1.wall, roof: c1.roof });
    dec('driveway', X(-20), -15.5, { w: 10, d: 6 });
    add('suv', X(-20), -15.6, 4.9, 2.3, 1.9, { color: suvColors[si * 2], facing: 'x' });
    add('mailbox', X(-16.8), -19.5, 0.35, 0.5, 1.25, { color: s < 0 ? '#1e3a8a' : '#7f1d1d' });
    add('trash', X(-24), -10.6, 0.75, 0.75, 1.1, { color: '#166534' });
    add('trash', X(-23.1), -10.6, 0.75, 0.75, 1.1, { color: '#1d4ed8' });
    add('hedge', X(-21), -27, 1, 8, 1.1);                // low front hedge (cover)
    dec('gnome', X(-19.5), -24); dec('gnome', X(-19.5), -29.5); dec('flamingo', X(-22), -21.5);
    // backyard
    // enterable backyard workshop
    shell(X(-46), -36, 6, 5, 2.8, { wall: s < 0 ? '#b45309' : '#64748b', tex: 'planks', roof: '#3f3f46', roofH: 1.0, open: { [s < 0 ? 'e' : 'w']: [[0, 'door']], s: [[0, 'window']] } });
    add('workbench', X(-46), -37.8, 3, 0.7, 0.95);
    add('barrel', X(-41), -42, 0.6, 0.6, 0.9, { color: '#374151' });
    add('pallets', X(-50), -26, 1.4, 1.2, 0.6);
    add('kiddiepool', X(-38), -14, 2.4, 2.4, 0.4);
    add('trampoline', X(-45), -22, 3.6, 3.6, 0.9);
    add('grill', X(-40), -40, 1.2, 0.8, 1.1);
    dec('flower', X(-37.5), -34); dec('flower', X(-37.5), -33); dec('flower', X(-37.5), -32);
    // fence between the McMansion and this lot (with a gate gap)
    add('fence', X(-15), -50, 0.2, 10, 1.2);
    add('fence', X(-15), -37.5, 0.2, 7, 1.2);
    // fence between north lot and west lot, with a gate
    add('fence', X(-47), 2, 16, 0.2, 1.2, { color: '#9ca3af' });   // chain-link
    add('fence', X(-30.5), 2, 9, 0.2, 1.2, { color: '#9ca3af' });

    // --- W / E house
    // enterable ranch home: front door to the street, back door to the yard, bedroom / living + kitchen
    const back = s < 0 ? 'w' : 'e';
    shell(X(-32), 14, 14, 11, 3.4, { wall: c2.wall, tex: 'siding', roof: c2.roof, roofH: 2.0, floor: 'wood', label: s < 0 ? 'THE OKAFORS' : 'THE LINDQVISTS', facing: face,
      open: { [face]: [[-3.2, 'window'], [1.6, 'door'], [4.2, 'window']], [back]: [[-2.4, 'door'], [2.6, 'window']], n: [[-3.5, 'window'], [3, 'window']], s: [[-3, 'window'], [3.5, 'window']] } });
    for (const sx of [-1, 1]) add('wallseg', X(-32 + sx * 3.95), 13.2, 6.1, 0.2, 3.4, { wall: '#ede6d8', tex: 'siding' });   // hallway wall with a gap
    add('couch', X(-34), 17.6, 2.4, 1.0, 0.9);
    add('table', X(-28.6), 17.2, 1.4, 1.4, 0.8);
    add('counter', X(-28.8), 19.0, 4.2, 0.7, 0.95);
    add('bed', X(-35.2), 10.2, 2.0, 2.4, 0.6);
    add('shelf', X(-28.2), 9.0, 2.2, 0.5, 1.9);
    add('garage', X(-30), 25.5, 10, 7, 3.3, { facing: face, wall: c2.wall, roof: c2.roof });
    dec('driveway', X(-16), 25.5, { w: 18, d: 6 });
    add('suv', X(-17), 25.4, 4.9, 2.3, 1.9, { color: suvColors[si * 2 + 1], facing: 'x' });
    add('mailbox', X(-8.4), 21, 0.35, 0.5, 1.25, { color: '#111827' });
    add('trash', X(-9), 30.5, 0.75, 0.75, 1.1, { color: '#166534' });
    add('hedge', X(-19), 13, 1, 9, 1.1);
    add('mower', X(-14), 8, 0.9, 1.4, 0.9, { color: s < 0 ? '#dc2626' : '#16a34a' });
    dec('gnome', X(-22), 9); dec('gnome', X(-22.6), 9.4); dec('gnome', X(-21.4), 9.6);
    dec('flamingo', X(-12), 16); dec('lawnSign', X(-11), 4, { text: s < 0 ? 'NO SOLICITING' : 'LAWN OF THE MONTH' });
    // backyard
    add('pool', X(-45), 10, 4.4, 4.4, 1.2, { color: '#5b8bb5', round: true }); // above-ground pool
    add('swing', X(-46), 22, 4, 0.3, 2.6);
    add('grill', X(-41), 28, 1.2, 0.8, 1.1);
    for (const [px, pz] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]]) add('post', X(-46) + px, 30 + pz, 0.14, 0.14, 2.6, { color: '#9ca3af' });
    add('plate', X(-46), 30, 6.3, 6.3, 0.1, { color: '#9ca3af' }, 2.6);   // carport roof
    add('pickup', X(-46), 30, 2.3, 5.4, 1.9, { color: s < 0 ? '#1f2937' : '#7a1c1c', facing: 'z' });
    add('fence', X(-38), 40, 0.2, 10, 1.8, { color: '#a3876a' });  // privacy fence
    add('woodpile', X(-52), 12, 1.4, 4, 1.2);

    // --- hedge row between west lot and the construction site (gap in the middle)
    add('hedge', X(-45), 34, 20, 1, 1.6);
    add('hedge', X(-21), 34, 14, 1, 1.6);

    // --- SW / SE: "Coming Soon" model home under construction
    add('slab', X(-30), 45, 14, 10, 0.3);
    add('wall', X(-30), 49.7, 14, 0.3, 2.8, {}, 0.3);       // back wall
    add('wall', X(-36.85), 47, 0.3, 5.4, 2.8, {}, 0.3);      // outer side wall (partial)
    add('wall', X(-23.15), 43, 0.3, 4, 2.8, {}, 0.3);        // inner side wall (partial)
    add('wall', X(-33), 40.2, 4, 0.3, 1.2, {}, 0.3);         // half wall at front
    add('post', X(-23.15), 47.5, 0.3, 0.3, 3.1, { color: '#d6b98c' });
    add('post', X(-23.15), 40.2, 0.3, 0.3, 3.1, { color: '#d6b98c' });
    add('post', X(-36.85), 40.2, 0.3, 0.3, 3.1, { color: '#d6b98c' });
    add('lumber', X(-18), 44, 2.4, 1.2, 0.8);
    add('lumber', X(-18), 46.5, 2.4, 1.2, 1.4);
    add('potty', X(-43), 50, 1.3, 1.3, 2.4);
    add('mixer', X(-43), 42, 1.6, 2.2, 1.7);
    dec('lawnSign', X(-14), 38, { text: s < 0 ? 'COMING SOON: MORE RULES' : 'MODEL HOME — DO NOT ENTER' });
  });

  // ---------------------------------------------------------------- the street
  powerLine(-8.3, 50, -8.3, 10, 20);
  add('truck', -2.8, 14, 2.5, 6, 2.9, { color: '#fde68a', facing: 'z', label: 'MR. SPRINKLES' });
  add('suv', 3, 33, 2.3, 4.9, 1.9, { color: '#2b2d31', facing: 'z' });
  add('trash', 2.2, 7.5, 0.75, 0.75, 1.1, { color: '#334155' });
  add('cone', -1.5, 26, 0.5, 0.5, 0.7);
  add('cone', 1.5, 24, 0.5, 0.5, 0.7);
  // barricade at the neighbourhood entrance
  add('barricade', -2.6, 50.5, 4.5, 0.6, 1.1);
  add('barricade', 2.6, 50.5, 4.5, 0.6, 1.1);
  add('sign', -8.5, 52, 0.4, 0.4, 3.2, { text: 'PRISTINE PINES · SULLIVAN, IN' });
  add('streetsign', 8.2, 48, 0.2, 0.2, 3, { text: 'N SKYLARK DR' });
  add('streetsign', -16.5, 4, 0.2, 0.2, 3, { text: 'W GREENBRIER LN' });
  // streetlights
  for (const [x, z] of [[-7.2, 0], [7.2, 0], [-7.2, 30], [7.2, 30], [0, -21.8]]) add('lamp', x, z, 0.3, 0.3, 5);

  // ---------------------------------------------------------------- trees & ground decor
  const trees = [[-50, -48], [50, -48], [-25, -50], [25, -50], [-52, 0], [52, 0], [-13, 46], [13, 46], [-50, 40], [50, 40], [-25, 6], [25, 6]];
  for (const [x, z] of trees) {
    add('trunk', x, z, 0.8, 0.8, 4.2);
    dec('canopy', x, z, { r: 2.8 + ((x * 7 + z * 3) % 10 + 10) % 10 / 10, y: 4.4, color: ((x + z) % 3 === 0) ? '#2f7d32' : '#4c9a2a' });
  }
  for (let i = 0; i < 24; i++) {
    // scattered flowers along the road edges
    const z = -2 + i * 2.2;
    if (z > 48) break;
    dec('flower', (i % 2 ? 7.6 : -7.6), z, { color: ['#f472b6', '#facc15', '#a78bfa', '#fb7185'][i % 4] });
  }

  // ---------------------------------------------------------------- spawns (feet positions)
  const spawns = [];
  const spawnBase = [
    [-46, -46, 0.6], [-47, -8, 1.2], [-46, 20, 1.5], [-47, 44, 2.4], [-20, -34, 0.3],
    [-11, 2, 1.0], [-12, 41, 2.8], [-8, -52, 0.0], [-20, 30, 2.0],
  ];
  for (const [x, z, yaw] of spawnBase) {
    spawns.push({ x, z, yaw: Math.PI * 0.5 + yaw * 0.3 });
    spawns.push({ x: -x, z, yaw: -Math.PI * 0.5 - yaw * 0.3 });
  }
  spawns.push({ x: 0, z: 40, yaw: 0 });
  spawns.push({ x: 0, z: 22, yaw: 0 });

  return finalize({
    id: 'culdesac',
    name: 'THE CUL-DE-SAC',
    faction: 'suburban',
    blurb: 'A Sullivan-style street of ranch homes — plus one HOA president who built too big.',
    bounds: BOUNDS,
    theme: { mood: 'Sunny morning', sky: '#5f9fd6', horizon: '#e7eef0', fog: '#c9dbe6', ground: 'lawn', hemiGround: '#4d6b33' },
    boxes, decor, spawns,
  });
}


// Shared builder helpers for the other arenas.
function helpers(boxes = [], decor = []) {
  const add = (kind, x, z, w, d, h, opts = {}, y = 0) => { boxes.push({ kind, x, y, z, w, h, d, ...opts }); };
  const dec = (kind, x, z, opts = {}) => decor.push({ kind, x, z, ...opts });
  const boundary = (B, hedgeKind = 'hedge', h = 3.2) => {
    add('invisible', 0, -(B + 1.5), 2 * B + 6, 2, 40);
    add('invisible', 0, B + 1.5, 2 * B + 6, 2, 40);
    add('invisible', -(B + 1.5), 0, 2, 2 * B + 6, 40);
    add('invisible', B + 1.5, 0, 2, 2 * B + 6, 40);
    add(hedgeKind, 0, -(B + 0.5), 2 * B + 2, 1, h);
    add(hedgeKind, 0, B + 0.5, 2 * B + 2, 1, h);
    add(hedgeKind, -(B + 0.5), 0, 1, 2 * B + 2, h);
    add(hedgeKind, B + 0.5, 0, 1, 2 * B + 2, h);
  };
  const tree = (x, z, r = 3) => { add('trunk', x, z, 0.8, 0.8, 4.2); dec('canopy', x, z, { r, y: 4.4 }); };
  const mirrorSpawns = (list, extra = []) => {
    const out = [];
    for (const [x, z, yaw] of list) { out.push({ x, z, yaw }); out.push({ x: -x, z, yaw: -yaw }); }
    return out.concat(extra.map(([x, z, yaw]) => ({ x, z, yaw })));
  };
  // Enterable building: wall segments with door/window openings, plus a roof slab.
  // openings: { n|s|e|w: [[offset, 'door'|'window'|'bigdoor'], ...] } — offset along the wall from its centre.
  const shell = (x, z, w, d, h, o = {}) => {
    const t = 0.3, look = { wall: o.wall || '#e9e4d8', tex: o.tex || 'siding', trim: o.trim || '#ffffff' };
    const sides = {
      n: { cx: x, cz: z - d / 2 + t / 2, len: w, alongX: true },
      s: { cx: x, cz: z + d / 2 - t / 2, len: w, alongX: true },
      w: { cx: x - w / 2 + t / 2, cz: z, len: d - 2 * t, alongX: false },
      e: { cx: x + w / 2 - t / 2, cz: z, len: d - 2 * t, alongX: false },
    };
    for (const [side, g] of Object.entries(sides)) {
      const ops = (o.open && o.open[side] ? o.open[side] : []).map(([off, type]) => {
        const ow = type === 'bigdoor' ? (o.bigDoorW || 4.5) : type === 'door' ? 1.6 : 1.4;
        return { a: off - ow / 2, b: off + ow / 2, type };
      }).sort((p, q) => p.a - q.a);
      const piece = (a, b, y0, y1, extra = {}) => {
        if (b - a < 0.05 || y1 - y0 < 0.05) return;
        const mid = (a + b) / 2, len = b - a;
        add('wallseg', g.alongX ? g.cx + mid : g.cx, g.alongX ? g.cz : g.cz + mid, g.alongX ? len : t, g.alongX ? t : len, y1 - y0, { ...look, ...extra }, y0);
      };
      let cur = -g.len / 2;
      for (const op of ops) {
        piece(cur, op.a, 0, h);
        if (op.type === 'window') { piece(op.a, op.b, 0, 1.0, { sill: true }); piece(op.a, op.b, 2.0, h); }
        else { const dh = op.type === 'bigdoor' ? Math.min(h - 0.4, 3.8) : 2.4; piece(op.a, op.b, dh, h, { header: op.type }); }
        cur = op.b;
      }
      piece(cur, g.len / 2, 0, h);
    }
    add('shellroof', x, z, w, d, 0.25, { roof: o.roof || '#3f3f46', roofH: o.roofH ?? 2, metalRoof: !!o.metalRoof, label: o.label, facing: o.facing || 'n', lit: !!o.floor && o.floor !== 'dirt' }, h);
    if (o.floor) dec('floor', x, z, { w: w - 0.6, d: d - 0.6, tex: o.floor });
  };
  // A row of utility poles with sagging wires (poles are solid, wires are scenery).
  const powerLine = (x1, z1, x2, z2, spacing = 24) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / spacing));
    for (let i = 0; i <= n; i++) add('utilpole', x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 0.35, 0.35, 8.5);
    dec('wires', 0, 0, { x1, z1, x2, z2, n, h: 8 });
  };
  // Scatter solid bushes / brush piles in a rectangle, skipping a clear zone around given points.
  const scrub = (x0, z0, x1, z1, count, seed = 1, avoid = []) => {
    let r = seed;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      const sz = 1.4 + rand() * 1.4;
      add('bush', x, z, sz, sz * (0.8 + rand() * 0.4), 0.9 + rand() * 0.7);
    }
  };
  return { boxes, decor, add, dec, boundary, tree, mirrorSpawns, shell, powerLine, scrub };
}

// ---------------------------------------------------------------------------- SULLIVAN ELKS COUNTRY CLUB
// Traced from satellite imagery of the Sullivan Elks Country Club (606 W Wolfe St, Sullivan, IN):
// x = (px - 500) * 0.5, z = (py - 320) * 0.5 from a north-up aerial, so positions match the
// real layout — clubhouse buildings on the north edge of the big lot, the drive down to W Wolfe St,
// the round Elks Lodge to the east, Buck Creek and its branch along the west side, greens and trees.
function buildCountryClub() {
  const BOUNDS = 70;
  const { boxes, decor, add, dec, boundary, tree, shell, powerLine, scrub } = helpers();
  boundary(BOUNDS);
  powerLine(-70, 73, 70, 73, 24);
  // W Wolfe St beyond the south fence, with N Skylark Dr ranch homes across it (backdrop)
  dec('road', 0, 80, { w: 200, d: 9 });
  add('fence', 0, 69.3, 138, 0.15, 1.6, { color: '#6b7280' });

  // ---- clubhouse complex (north edge of the lot)
  // clubhouse: enterable bar/dining room with a back hallway
  shell(9, -37.5, 18, 11, 3.6, {
    wall: '#8a6a4f', tex: 'planks', roof: '#3a2f2a', roofH: 1.8, label: 'SULLIVAN ELKS COUNTRY CLUB', facing: 's',
    open: { s: [[-6, 'window'], [-2, 'door'], [2.5, 'window'], [6.5, 'window']], n: [[-5, 'door'], [4, 'window']], e: [[0, 'window']], w: [[1, 'door']] },
    floor: 'wood',
  });
  add('counter', 4, -40, 7, 0.9, 1.05);                         // the bar
  for (const [x, z] of [[10, -35], [13.5, -35], [10, -39.5], [14.5, -39.5]]) add('table', x, z, 1.2, 1.2, 0.8);
  add('wallseg', 17, -38.8, 0.15, 5.6, 3.6, { wall: '#d8cbb5', tex: 'plain' });   // back office wall
  add('shelf', 0.8, -38, 0.6, 3, 2.0);
  // pro shop
  shell(-13, -42, 8, 15, 3.6, {
    wall: '#7a5c44', tex: 'planks', roof: '#2f2a28', roofH: 1.6, label: 'PRO SHOP', facing: 'e',
    open: { e: [[-4, 'window'], [0, 'door'], [4, 'window']], w: [[3, 'door']], s: [[0, 'window']] }, floor: 'wood',
  });
  add('counter', -14.5, -44, 0.8, 4, 1.0); add('shelf', -15.5, -38.5, 0.6, 3, 2.0); add('shelf', -11, -48, 3, 0.6, 2.0);
  // cart barn + shed
  shell(-24, -26, 7, 9, 3.4, { wall: '#9a7a5a', tex: 'metal', roof: '#6b7280', metalRoof: true, roofH: 1.2, open: { e: [[0, 'bigdoor']], n: [[0, 'door']] }, bigDoorW: 3.6 });
  add('golfcart', -25, -27, 1.4, 2.4, 1.6, { color: '#f8fafc', facing: 'z' });
  add('shed', 24, -29, 5, 6, 3, { color: '#9a7a5a' });
  add('tank', 20, -44, 1, 2.6, 1.1, { color: '#f1f5f9', lying: true });
  add('dumpster', 28, -40, 3.6, 1.8, 1.6, { color: '#1f4d3a' });
  add('ac', 1, -44, 1.2, 1.2, 1.1); add('ac', 17, -44, 1.2, 1.2, 1.1);
  add('slab', 9, -29, 14, 4, 0.3);
  for (const x of [4, 9, 14]) { add('table', x, -29, 1.2, 1.2, 1.0, {}, 0.3); dec('umbrella', x, -29, { y: 0.3, color: '#1f4d3a' }); }
  for (const x of [-6, -3.5, -1]) add('golfcart', x, -30, 1.4, 2.4, 1.6, { color: '#f8fafc', facing: 'z' });
  dec('green', 33, -48, { r: 5 }); // practice green behind the clubhouse

  // ---- the big lot and the drive out to Wolfe St
  dec('lot', 14, 4, { w: 50, d: 66 });
  dec('lot', 18, 55, { w: 9, d: 30 });
  const cc = ['#111827', '#e5e7eb', '#1f2f4f', '#4b5563', '#7a1c1c', '#2b2d31', '#c9ccd1', '#3b4a32', '#0f172a'];
  [[-4, -20, 'z'], [2, -20, 'z'], [20, -21, 'z'], [26, -21, 'z'], [32, -18, 'z'], [36, -6, 'x'], [36, 6, 'x'], [-6, 10, 'z'], [6, 22, 'z'], [30, 26, 'x']].forEach(([x, z, f], i) => {
    const pickup = i % 3 === 1;
    add(pickup ? 'pickup' : 'suv', x, z, f === 'x' ? (pickup ? 5.4 : 4.9) : 2.3, f === 'x' ? 2.3 : (pickup ? 5.4 : 4.9), 1.9, { color: cc[i % cc.length], facing: f });
  });
  add('lamp', 14, -6, 0.3, 0.3, 6); add('lamp', 14, 18, 0.3, 0.3, 6);
  add('planter', 14, 6, 4, 4, 0.5);
  add('streetsign', 25, 66, 0.2, 0.2, 3, { text: 'W WOLFE ST' });
  add('sign', 8, 64, 0.4, 0.4, 3.2, { text: 'SULLIVAN ELKS COUNTRY CLUB' });

  // ---- the Elks Lodge (round building east of the lot)
  add('lodge', 55, 1, 24, 24, 5.5, { label: 'ELKS LODGE' });
  dec('lot', 60, 40, { w: 18, d: 20 });
  add('pickup', 58, 42, 2.3, 5.4, 1.9, { color: '#7a1c1c', facing: 'z' });
  add('suv', 63, 38, 2.3, 4.9, 1.9, { color: '#1f2937', facing: 'z' });

  // ---- course: greens, bunkers, fairway, cart paths
  dec('mown', -45, -60, { w: 16, d: 24 });
  dec('green', -47, 5, { r: 10 }); add('post', -45, 4, 0.08, 0.08, 2.4, { color: '#f8fafc', flag: true });
  dec('bunker', -38, -4, { r: 3.2 }); dec('bunker', -56, 14, { r: 2.6 });
  dec('green', 50, -54, { r: 9 }); add('post', 51, -55, 0.08, 0.08, 2.4, { color: '#f8fafc', flag: true });
  dec('bunker', 41, -60, { r: 2.6 });
  dec('green', -66, 46, { r: 7 }); dec('bunker', -60, 36, { r: 2.4 });
  dec('cartpath', 0, 0, { pts: [[-70, 58], [-40, 58], [-28, 56]], w: 2.2 });
  dec('cartpath', 0, 0, { pts: [[-24, -26], [-34, -40], [-42, -55], [-46, -70]], w: 2.2 });
  dec('cartpath', 0, 0, { pts: [[-13, -34], [-20, -20], [-34, -8], [-40, 0]], w: 2.2 });
  add('tee', -40, -66, 6, 4, 0.3);
  add('chair', -30, 57, 2, 0.6, 0.5); add('trash', -34, 57, 0.75, 0.75, 1.1, { color: '#1f4d3a' });

  // ---- Buck Creek and the branch along the west side of the lot (shallow, walkable)
  dec('creek', 0, 0, { pts: [[-72, -4], [-59, 5], [-49, 20], [-37.5, 37.5], [-30, 50], [-28, 58], [-27.5, 72]], w: 4 });
  dec('creek', 0, 0, { pts: [[-19, -72], [-21, -40], [-22.5, -10], [-26, 20], [-27.5, 50]], w: 3 });
  add('slab', -28.6, 57.5, 6, 2.2, 0.35, { kind2: 'bridge', alongX: true });
  add('slab', -22, -14, 6, 2.2, 0.35, { kind2: 'bridge', alongX: true });

  // ---- trees traced from the aerial (clusters along the creek, the south strip and the north edge)
  const trees = [[-49, -35], [-40, -27.5], [-61, -44], [-58, -18], [-34, -50], [10, -66], [22.5, -65], [40, -62.5], [-3, -58],
    [45, -35], [62, -30], [66, -50], [-15, 60], [-40, 50], [-52, 62], [2.5, 58], [-15, 15], [-15, -10], [-34, 18], [-62, 28], [40, 60], [66, 22]];
  trees.forEach(([x, z], i) => tree(x, z, 3 + (i % 3) * 0.5));
  // denser woods along Buck Creek and its branch, like the real course
  const creekWoods = [[-55, -2], [-46, 14], [-43, 26], [-33, 44], [-36, 60], [-24, 40], [-18, 30], [-30, 6], [-17, -30], [-26, -48],
    [-14, -50], [-62, -30], [-66, -56], [-52, 46], [-58, 54], [-8, 46], [48, -44], [56, -62], [62, 48], [30, 64]];
  creekWoods.forEach(([x, z], i) => tree(x, z, 2.8 + (i % 4) * 0.4));
  for (const [x, z] of [[-30, 30], [-44, -44], [30, -62], [-8, 64]]) add('hedge', x, z, 3, 2.5, 1.3, { scrub: true });
  scrub(-70, -70, -30, 66, 22, 11, [[-47, 5, 11], [-40, -66, 5], [-30, 57, 4]]);
  scrub(36, -66, 70, -20, 8, 12, [[50, -54, 10]]);
  add('barrel', -36, 56, 0.6, 0.6, 0.9, { color: '#1f4d3a' }); add('ballwasher', -36, -64, 0.4, 0.4, 1.1);

  const spawns = [
    { x: -60, z: -62, yaw: 0.6 }, { x: -64, z: 0, yaw: 1.5 }, { x: -62, z: 62, yaw: 2.4 }, { x: -20, z: 64, yaw: 3 },
    { x: 6, z: 50, yaw: 3 }, { x: 46, z: 58, yaw: -2.6 }, { x: 64, z: 60, yaw: -2.4 }, { x: 64, z: -18, yaw: -1.6 },
    { x: 58, z: -64, yaw: -0.6 }, { x: 22, z: -56, yaw: 0 }, { x: -24, z: -62, yaw: 0.2 }, { x: -46, z: 30, yaw: 2 },
    { x: -40, z: -14, yaw: 1.2 }, { x: 38, z: 46, yaw: -2.8 },
  ];
  return finalize({
    id: 'countryclub', name: 'SULLIVAN ELKS COUNTRY CLUB', faction: 'suburban',
    blurb: 'The Elks course off W Wolfe St: the clubhouse lot, the Lodge and Buck Creek.',
    bounds: BOUNDS,
    theme: {
      mood: 'Golden-hour sunset', sky: '#3f5f9a', horizon: '#ffb36b', fog: '#e8b88a', fogNear: 50, fogFar: 190,
      ground: 'lawn', hemiSky: '#ffd9b0', hemiGround: '#5a5a2c', hemiIntensity: 1.1,
      sunColor: '#ff9f55', sunIntensity: 3.4, sunPos: [80, 18, 10], exposure: 1.0,
    },
    boxes, decor, spawns,
  });
}

// ---------------------------------------------------------------------------- THE FARMSTEAD
// Laid out from satellite imagery of a farm property on IN-154 west of Sullivan: a small white
// ranch house on a long gravel drive with a detached outbuilding, a working farm across the lane
// (house, two big white-roofed pole barns, equipment yard), SR-154 running east–west, crop fields
// and woods to the east. Positions: x = (px - 380) * 0.62, z = (py - 280) * 0.62 (distances
// compressed ~2x to fit; buildings and props are real size).
function buildFarmstead() {
  const BOUNDS = 70;
  const { boxes, decor, add, dec, boundary, tree, shell, powerLine, scrub } = helpers();
  boundary(BOUNDS, 'rail', 1.4);

  // ---- State Road 154 with ditches, power line, signs
  dec('road', 0, -40, { w: 300, d: 8 });
  dec('ditch', 0, -45.5, { w: 300, d: 3 }); dec('ditch', 0, -34.5, { w: 300, d: 3 });
  powerLine(-70, -47.5, 70, -47.5, 23);
  add('streetsign', -34, -35.6, 0.2, 0.2, 2.8, { text: 'IN 154', shield: true });
  add('streetsign', 24, -44.6, 0.2, 0.2, 2.8, { text: 'IN 154', shield: true });

  // ---- the property: white ranch house, long gravel drive, outbuilding, big yard trees
  dec('path', 55, -27, { w: 4, d: 22 });            // gravel drive off 154
  dec('path', 52, -6, { w: 14, d: 8 });             // turnaround
  add('mailbox', 52.5, -35, 0.35, 0.5, 1.25, { color: '#111827' });
  shell(52, -16, 14, 9, 3.0, {
    wall: '#f4f2ec', tex: 'siding', roof: '#3d3f44', roofH: 1.8, facing: 'n',
    open: { n: [[-4, 'window'], [0.5, 'door'], [4.5, 'window']], s: [[-3.5, 'window'], [2, 'door']], e: [[0, 'window']], w: [[-1.5, 'window']] },
    floor: 'wood',
  });
  // interior wall between the living room and the bedroom, with a doorway
  add('wallseg', 49, -18.6, 0.15, 3.2, 3.0, { wall: '#ece7dc', tex: 'plain' });
  add('wallseg', 49, -13.2, 0.15, 2.8, 3.0, { wall: '#ece7dc', tex: 'plain' });
  add('wallseg', 49, -16.2, 0.15, 1.6, 0.6, { wall: '#ece7dc', tex: 'plain' }, 2.4);
  add('counter', 56, -19.6, 5, 0.8, 0.95);        // kitchen
  add('couch', 54, -13, 2.4, 1, 0.9, { color: '#5b4636' });
  add('table', 57.5, -15, 1.4, 1.4, 0.8);
  add('bed', 46, -18, 2, 2.4, 0.6, { color: '#7c8a9e' });
  add('pickup', 59, -6, 2.3, 5.4, 1.9, { color: '#e5e7eb', facing: 'z' });
  shell(56, 6, 8, 6, 3.2, { wall: '#d9d6cf', tex: 'metal', roof: '#7d858c', metalRoof: true, roofH: 1.2, open: { s: [[0, 'bigdoor']], w: [[1, 'door']] }, bigDoorW: 3.2 });
  add('workbench', 56, 4, 4, 0.8, 0.95);
  add('mower', 54, 7.5, 0.9, 1.4, 0.9, { color: '#15803d' });
  add('tank', 45, -9, 1, 2.6, 1.1, { color: '#f1f5f9', lying: true });   // propane tank
  add('barrel', 63, 2, 0.7, 0.7, 1.0, { color: '#7c2d12' });              // burn barrel
  for (const [x, z] of [[46, -26], [63, -24], [44, -4], [64, -12], [48, 16], [64, 16], [40, 12]]) tree(x, z, 3.6);
  add('rail', 38, -10, 0.2, 40, 1.2);   // property fence along the field

  // ---- the working farm across the lane (west): house, two white pole barns, equipment yard
  dec('path', -40, 15, { w: 5, d: 110 });          // farm lane
  dec('path', -50, 12, { w: 20, d: 34 });          // gravel equipment yard
  shell(-60, -20, 12, 9, 3.0, {
    wall: '#e3dccd', tex: 'siding', roof: '#4a4038', roofH: 1.8, facing: 'e',
    open: { e: [[-2, 'window'], [2, 'door']], n: [[0, 'window']], s: [[-3, 'window'], [2.5, 'door']], w: [[0, 'window']] }, floor: 'wood',
  });
  add('counter', -62, -23.6, 4, 0.8, 0.95); add('table', -58, -18, 1.4, 1.4, 0.8);
  for (const [x, z] of [[-68, -30], [-52, -30], [-68, -8]]) tree(x, z, 3.8);
  // pole barn A (doors face the lane)
  shell(-56, 4, 14, 18, 5.2, {
    wall: '#e9ebe8', tex: 'metal', roof: '#f3f4f2', metalRoof: true, roofH: 2.2,
    open: { e: [[-3, 'bigdoor'], [5.5, 'door']], w: [[0, 'door']], n: [[3, 'window']], s: [[-3, 'window']] }, bigDoorW: 5,
  });
  add('tractor', -58, 1, 2.6, 4.4, 3.1, { color: '#2f6b2a' });
  add('workbench', -62.5, 10, 0.8, 5, 0.95); add('shelf', -50, 12, 4, 0.6, 2.2);
  add('crate', -52, 9, 1.4, 1.4, 1.4); add('crate', -52, 7.4, 1.4, 1.4, 1.4); add('crate', -52, 8.2, 1.2, 1.2, 1.2, {}, 1.4);
  // pole barn B (long), hay storage
  shell(-58, 34, 24, 12, 5.2, {
    wall: '#e9ebe8', tex: 'metal', roof: '#f3f4f2', metalRoof: true, roofH: 2.0,
    open: { n: [[-6, 'bigdoor'], [7, 'door']], e: [[0, 'bigdoor']], s: [[4, 'window']] }, bigDoorW: 5,
  });
  add('hay', -64, 37, 6, 3, 1.2); add('hay', -64, 37, 6, 3, 1.2, {}, 1.2); add('hay', -64.5, 37, 4, 3, 1.2, {}, 2.4);
  add('hay', -54, 37.5, 3, 3, 1.2); add('wagon', -50, 30, 2.6, 5, 2.4, { color: '#b91c1c' });
  // equipment yard: real farm clutter = cover
  add('wagon', -44, 0, 2.6, 5, 2.4, { color: '#ca8a04' });
  add('pickup', -46, 18, 2.3, 5.4, 1.9, { color: '#1f2937', facing: 'z' });
  add('fueltank', -47, -6, 3.2, 1.4, 2.6);
  add('tires', -45, 24, 1.6, 1.6, 1.2); add('tires', -43.2, 25, 1.6, 1.6, 0.8);
  add('pallets', -48, 27, 1.4, 1.2, 1.0); add('pallets', -50, 26.5, 1.4, 1.2, 0.6);
  add('scrap', -34, 30, 3, 2, 1.1); add('woodpile', -66, -2, 1.4, 4, 1.2);
  add('tank', -44, 9, 2.2, 2.2, 2.6, { color: '#9ca3af' });
  for (const [x, z] of [[-68, 50], [-50, 50], [-36, 50]]) add('hayroll', x, z, 1.8, 1.8, 1.7);

  // ---- fields: standing corn north of the road and south-east (cover you can't see through)
  for (let i = 0; i < 26; i++) { const x = -66 + i * 2.4; if (Math.abs(x + 14) < 3) continue; dec('cornrow', x, -60, { len: 18, alongX: false }); }
  dec('path', -14, -58, { w: 4, d: 24 });          // lane north into the field
  for (let i = 0; i < 12; i++) dec('cornrow', 2 + i * 2.4, 46, { len: 44, alongX: false });
  dec('plowed', -10, 20, { w: 46, d: 60 });
  add('scarecrow', 14, 30, 0.4, 0.4, 2.4);
  // ---- woods to the east with brush, and a fence line
  for (const [x, z] of [[68, -26], [66, 30], [68, 44], [62, 58], [68, 66], [60, 40], [66, 52], [56, 66], [-6, 66], [-22, 66]]) tree(x, z, 3.6);
  scrub(54, 26, 70, 70, 14, 7, [[56, 6, 7]]);
  scrub(-30, -32, 30, -20, 6, 9, [[0, -26, 4]]);
  add('rail', 16, -24, 40, 0.2, 1.1);
  add('rail', -24, 0, 0.2, 30, 1.1);

  const spawns = [
    { x: -66, z: -60, yaw: 2.6 }, { x: -20, z: -66, yaw: 3 }, { x: 30, z: -66, yaw: 3 }, { x: 66, z: -60, yaw: -2.6 },
    { x: 66, z: -30, yaw: -1.6 }, { x: 52, z: 30, yaw: 3 }, { x: 34, z: 66, yaw: 3 }, { x: -6, z: 60, yaw: 3 },
    { x: -30, z: 62, yaw: 2.6 }, { x: -66, z: 60, yaw: 2.4 }, { x: -30, z: 10, yaw: 1.6 }, { x: 10, z: -26, yaw: 0 },
    { x: 30, z: 8, yaw: 1.4 }, { x: -66, z: 18, yaw: 1.6 },
  ];
  return finalize({
    id: 'farmstead', name: 'SR-154 FARMSTEAD', faction: 'country',
    blurb: 'A farm on State Road 154: the ranch house, the pole barns, the equipment yard and the corn.',
    bounds: BOUNDS,
    theme: {
      mood: 'Hot, dusty afternoon', sky: '#9fb6c8', horizon: '#ead9b0', fog: '#d8c9a3', fogNear: 60, fogFar: 230,
      ground: 'pasture', hemiSky: '#fff1d6', hemiGround: '#7a6a3a', hemiIntensity: 1.5,
      sunColor: '#fff0c8', sunIntensity: 3.2, sunPos: [-30, 70, 20], exposure: 1.08,
    },
    boxes, decor, spawns,
  });
}

// ---------------------------------------------------------------------------- THE FAIRGROUNDS
// Based on the layout of the county 4-H fairgrounds outside Sullivan: a gravel loop road, a grid
// of long white-roofed livestock barns, a show arena and a tractor-pull track with grandstands.
function buildCountyFair() {
  const BOUNDS = 55;
  const { boxes, decor, add, dec, boundary, tree, shell, powerLine, scrub } = helpers();
  boundary(BOUNDS, 'rail', 1.4);
  dec('road', 0, 62, { w: 160, d: 9 });                 // County Rd 75 N
  powerLine(-55, 52, 55, 52, 22);
  // gravel loop road
  dec('path', 0, -46, { w: 96, d: 6 }); dec('path', 0, 46, { w: 96, d: 6 });
  dec('path', -46, 0, { w: 6, d: 96 }); dec('path', 46, 0, { w: 6, d: 96 });
  dec('path', 0, 0, { w: 6, d: 86 });                   // centre aisle

  // livestock barns: two rows of long metal barns with alleys between (close quarters)
  const barnLabels = ['SWINE', 'BEEF', 'SHEEP & GOATS', 'POULTRY & RABBITS'];
  // walk-through barns: big doors at both ends, side doors, wash racks and pens inside
  [[-9, -28], [9, -28], [-9, -2], [9, -2]].forEach(([x, z], i) => {
    shell(x, z, 10, 20, 3.6, {
      wall: '#eef0ee', tex: 'metal', roof: '#f3f4f2', metalRoof: true, roofH: 1.6, label: barnLabels[i],
      open: { n: [[0, 'bigdoor']], s: [[0, 'bigdoor']], e: [[-5, 'door'], [5, 'door']], w: [[-5, 'door'], [5, 'door']] }, bigDoorW: 3.6,
    });
    for (const dz of [-6, -1.5, 3]) {           // pens along both walls, centre aisle open
      add('rail', x - 3.2, z + dz, 3, 0.15, 1.2); add('rail', x + 3.2, z + dz, 3, 0.15, 1.2);
    }
    add('hay', x - 3.6, z + 7.5, 2, 1.2, 1.0); add('hay', x + 3.6, z - 8.2, 2, 1.2, 1.0);
    add('barrel', x + 3.8, z + 7.8, 0.6, 0.6, 0.9, { color: '#1d4ed8' });
  });
  shell(-9, 22, 10, 12, 3.6, {
    wall: '#eef0ee', tex: 'metal', roof: '#f3f4f2', metalRoof: true, roofH: 1.6, label: '4-H EXHIBITS',
    open: { e: [[0, 'bigdoor']], n: [[0, 'door']], w: [[2, 'window'], [-2, 'window']] }, bigDoorW: 3.6,
  });
  for (const dz of [-3, 0, 3]) add('table', -10.5, 22 + dz, 1.4, 1.4, 0.8);

  // show arena (west) with grandstand
  dec('arena', -30, -18, { w: 20, d: 34 });
  add('rail', -30, -35.2, 20, 0.2, 1.3); add('rail', -30, -0.8, 20, 0.2, 1.3);
  add('rail', -20, -24, 0.2, 22, 1.3); add('rail', -40, -18, 0.2, 34, 1.3);
  add('grandstand', -44.5, -18, 5, 26, 3.6);
  add('hay', -30, -22, 1.4, 3, 1.2); add('hay', -26, -10, 3, 1.4, 1.2);

  // tractor-pull track (east) with concrete barriers and grandstand
  dec('arena', 30, -10, { w: 16, d: 56 });
  add('jersey', 21.6, -10, 0.8, 50, 1.0); add('jersey', 38.4, -14, 0.8, 42, 1.0);
  add('grandstand', 44.5, -10, 5, 30, 3.6);
  add('tractor', 28, -24, 2.6, 4.4, 3.1, { color: '#b91c1c' });
  add('sled', 32, -32, 2.6, 4, 1.2);
  add('tractor', 31, 4, 2.6, 4.4, 3.1, { color: '#2f6b2a' });
  add('tank', 26, 12, 2, 2, 2.4, { color: '#facc15' });

  // historic county home (north-east)
  add('house', 36, -40, 12, 8, 6, { facing: 's', wall: '#a8553f', roof: '#3f3f46', trim: '#f5f0e6', label: 'SULLIVAN COUNTY POOR HOUSE' });

  // fair week: midway by the road
  const stands = [['CORN DOGS', '#dc2626'], ['LEMON SHAKE-UPS', '#eab308'], ['ELEPHANT EARS', '#2563eb'], ['PORK BURGERS', '#9333ea']];
  stands.forEach(([label, color], i) => add('stand', 10 + (i % 2) * 9, 24 + Math.floor(i / 2) * 9, 4, 3.4, 3.2, { color, label, facing: i % 2 ? 'e' : 'w' }));
  add('ferrisbase', 30, 30, 6, 3, 2.0);
  dec('ferris', 30, 30, { r: 8 });
  for (let i = 0; i < 3; i++) dec('lights', 0, 0, { x1: 6, z1: 20 + i * 8, x2: 24, z2: 22 + i * 8, h: 4.5 });
  for (let z = -40; z <= 10; z += 10) dec('lights', 0, 0, { x1: -3.6, z1: z, x2: 3.6, z2: z + 1, h: 5 });

  // parking / trailers (south-west), extension office
  add('house', -32, 24, 14, 9, 3.8, { facing: 's', wall: '#d6d3cb', roof: '#4b5563', trim: '#ffffff', label: 'PURDUE EXTENSION' });
  add('trailer', -40, 40, 2.4, 7, 2.6, { color: '#e5e7eb' });
  add('trailer', -34, 40, 2.4, 7, 2.6, { color: '#9ca3af' });
  add('pickup', -26, 40, 2.3, 5.4, 1.9, { color: '#1f2937', facing: 'z' });
  add('potty', -18, 34, 1.3, 1.3, 2.4); add('potty', -16.5, 34, 1.3, 1.3, 2.4);
  add('sign', 0, 52, 0.4, 0.4, 3.4, { text: 'SULLIVAN COUNTY 4-H FAIRGROUNDS' });
  add('streetsign', 14, 53, 0.2, 0.2, 3, { text: 'E COUNTY RD 75 N' });
  for (const [x, z] of [[-52, -52], [52, -52], [-52, 52], [52, 30], [-52, 6]]) tree(x, z, 3);
  // fair-week clutter: golf carts, hay, pallets, trash, livestock trailers, generators
  add('golfcart', 2, -16, 1.4, 2.4, 1.6, { color: '#16a34a', facing: 'z' });
  add('golfcart', -2.5, 10, 1.4, 2.4, 1.6, { color: '#f8fafc', facing: 'z' });
  add('trailer', 18, -40, 2.4, 7, 2.6, { color: '#cbd5e1' }); add('trailer', -20, -40, 2.4, 7, 2.6, { color: '#94a3b8' });
  add('pallets', 3.5, -42, 1.4, 1.2, 0.9); add('pallets', -3.5, 36, 1.4, 1.2, 0.6);
  add('barrel', 3.5, -10, 0.6, 0.6, 0.9, { color: '#166534' }); add('barrel', -3.5, -16, 0.6, 0.6, 0.9, { color: '#166534' });
  add('generator', 20, 34, 2, 1.2, 1.3); add('generator', -40, -6, 2, 1.2, 1.3);
  add('hay', -16, 8, 1.4, 3, 1.2); add('hay', 16, 8, 1.4, 3, 1.2); add('hay', -5, -36, 3, 1.4, 1.2);
  scrub(-54, -54, 54, -48, 6, 3); scrub(48, -40, 54, 40, 5, 4);
  const spawns = [
    { x: -46, z: -46, yaw: 0.8 }, { x: -46, z: 10, yaw: 1.4 }, { x: -46, z: 46, yaw: 2.4 }, { x: -14, z: 46, yaw: 3 },
    { x: 4, z: 46, yaw: 3 }, { x: 46, z: 46, yaw: -2.4 }, { x: 46, z: 18, yaw: -1.4 }, { x: 52, z: -46, yaw: -0.8 },
    { x: 14, z: -46, yaw: 0 }, { x: -14, z: -46, yaw: 0 }, { x: 0, z: 12, yaw: 0 }, { x: -24, z: 6, yaw: 1.2 },
    { x: 18, z: -14, yaw: -1.2 }, { x: 0, z: -40, yaw: Math.PI },
  ];
  return finalize({
    id: 'countyfair', name: 'SULLIVAN COUNTY 4-H FAIRGROUNDS', faction: 'country',
    blurb: 'Fair week on County Rd 75 N: livestock barns, the show ring and the tractor pull.',
    bounds: BOUNDS,
    theme: {
      mood: 'Dusk, lights on', sky: '#141a3a', horizon: '#b0587a', fog: '#3c2f4f', fogNear: 35, fogFar: 140,
      ground: 'pasture', hemiSky: '#8fa0ff', hemiGround: '#4a3020', hemiIntensity: 1.3,
      sunColor: '#ffb08a', sunIntensity: 1.3, sunPos: [-60, 14, -30], exposure: 1.15, night: true,
    },
    boxes, decor, spawns,
  });
}

// ---------------------------------------------------------------------------- SULLIVAN LAKE
// Traced from satellite imagery of Sullivan County Park & Lake (beach area off Lake Rd):
// x = (px - 390) * 0.6, z = (py - 255) * 0.6. Deep water is impassable (invisible walls under
// the surface) but bullets fly over it.
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Fill a water polygon with invisible collision strips (3 m cells, merged per row).
function waterWalls(add, pts, bounds, cell = 3, inset = 1.2) {
  for (let z = -bounds; z < bounds; z += cell) {
    let start = null;
    for (let x = -bounds; x <= bounds + cell; x += cell) {
      const cx = x + cell / 2, cz = z + cell / 2;
      const wet = x <= bounds && pointInPoly(cx, cz, pts)
        && pointInPoly(cx + inset, cz, pts) && pointInPoly(cx - inset, cz, pts)
        && pointInPoly(cx, cz + inset, pts) && pointInPoly(cx, cz - inset, pts);
      if (wet && start === null) start = x;
      if (!wet && start !== null) { add('invisible', (start + x) / 2, cz, x - start, cell, 6, { water: true }, -1); start = null; }
    }
  }
}

function buildLake() {
  const BOUNDS = 70;
  const { boxes, decor, add, dec, tree, shell, powerLine, scrub } = helpers();
  powerLine(-36, -70, -36, 70, 24);
  // invisible walls on every side; a tree-line hedge only on the land sides (west, south-west)
  const B = BOUNDS;
  add('invisible', 0, -(B + 1.5), 2 * B + 6, 2, 40);
  add('invisible', 0, B + 1.5, 2 * B + 6, 2, 40);
  add('invisible', -(B + 1.5), 0, 2, 2 * B + 6, 40);
  add('invisible', B + 1.5, 0, 2, 2 * B + 6, 40);
  add('hedge', -(B + 0.5), 0, 1, 2 * B + 2, 3.2);
  add('hedge', -25, B + 0.5, 92, 1, 3.2);
  const water = [[74, -78], [72, -42], [64, -9], [66, 22], [48, 40], [33, 57], [29, 78], [80, 78], [80, -78]];
  // the rest of Lake Sullivan, beyond the playable area (north and east), plus the inlet to the south
  dec('waterpoly', 0, 0, { pts: [[-300, -72.5], [400, -72.5], [400, -400], [-300, -400]] });
  dec('waterpoly', 0, 0, { pts: [[70.5, -80], [400, -80], [400, 400], [70.5, 400]] });
  dec('waterpoly', 0, 0, { pts: [[22, 72], [80, 72], [80, 300], [10, 300]] });
  const sand = [[43, -42], [39, -9], [47, 15], [57, 27], [66, 22], [64, -9], [72, -42]];
  dec('waterpoly', 0, 0, { pts: water });
  dec('sandpoly', 0, 0, { pts: sand });
  waterWalls(add, water, BOUNDS);
  for (let x = -60; x <= 60; x += 9) tree(x + ((x * 7) % 4), -67 + (x % 3), 3);

  // the beach parking loop (north) and Lake Rd heading south past the beach house
  dec('loop', 31, -58, { rx: 34, rz: 18, w: 6 });
  dec('cartpath', 0, 0, { pts: [[-4, -48], [-9, -33], [-15, -10], [-21, 3], [-26, 30], [-30, 45], [-33, 75]], w: 6.5, road: true });
  dec('lot', -48, 8, { w: 34, d: 8 });  // gravel strip lot
  const cc = ['#7a1c1c', '#1f2937', '#e5e7eb', '#2b3a4a', '#3b4a32'];
  [[-60, 8], [-52, 8], [-40, 8]].forEach(([x, z], i) => add(i === 1 ? 'pickup' : 'suv', x, z, i === 1 ? 5.4 : 4.9, 2.3, 1.9, { color: cc[i], facing: 'x' }));
  [[14, -62], [24, -64], [44, -62], [52, -56]].forEach(([x, z], i) => add(i % 2 ? 'pickup' : 'suv', x, z, 2.3, i % 2 ? 5.4 : 4.9, 1.9, { color: cc[i + 1], facing: 'z' }));
  add('trailer', 0, -60, 2.4, 6, 1.4, { color: '#9ca3af', boat: true });

  // beach house + concession, picnic shelters, playground, volleyball
  // beach house: changing rooms + restrooms, doors on both sides, open breezeway through the middle
  shell(-3, 6, 16, 14, 3.4, {
    wall: '#8b5e3c', tex: 'planks', roof: '#3a2f2a', roofH: 1.8, label: 'BEACH HOUSE', facing: 'e',
    open: { e: [[-4, 'window'], [0, 'bigdoor'], [4.5, 'window']], w: [[0, 'bigdoor']], n: [[-4, 'door'], [3, 'window']], s: [[4, 'door'], [-3, 'window']] },
    bigDoorW: 3,
  });
  // breezeway through the middle (z 3.2–8.8) with a restroom on each side; doorways at x = -3
  for (const z of [3.2, 8.8]) {
    add('wallseg', -7.25, z, 6.9, 0.15, 3.4, { wall: '#c9b9a2', tex: 'plain' });
    add('wallseg', 1.25, z, 6.9, 0.15, 3.4, { wall: '#c9b9a2', tex: 'plain' });
    add('wallseg', -3, z, 1.6, 0.15, 1.0, { wall: '#c9b9a2', tex: 'plain' }, 2.4);
  }
  for (const x of [-9, -7, -5]) add('wallseg', x, 0.4, 0.1, 2.2, 2.0, { wall: '#9ca3af', tex: 'plain' });   // stalls
  for (const x of [1, 3, 5]) add('wallseg', x, 11.6, 0.1, 2.2, 2.0, { wall: '#9ca3af', tex: 'plain' });
  add('shed', 9, -24, 6, 5, 3, { color: '#a16207', label: 'CONCESSIONS' });
  add('pavilion', 22, -14, 10, 7, 3.6);
  add('pavilion', 22, 20, 10, 7, 3.6);
  for (const [x, z] of [[19, -15], [25, -13], [19, 19], [25, 21], [12, 34], [30, 4]]) add('picnic', x, z, 2, 1.6, 0.8);
  add('grill', 30, -20, 0.7, 0.7, 1.1); add('grill', 30, 26, 0.7, 0.7, 1.1);
  add('playset', 6, 30, 6, 4, 3.2);
  add('post', 50, -24, 0.15, 0.15, 2.5, { color: '#e5e7eb' }); add('post', 50, -14, 0.15, 0.15, 2.5, { color: '#e5e7eb' });
  dec('net', 50, -19, { len: 10 });
  add('lifeguard', 58, 0, 2, 2, 3.2);
  for (let i = 0; i < 8; i++) dec('buoy', 68 + (i % 2), -36 + i * 7);
  add('trash', 36, 0, 0.75, 0.75, 1.1, { color: '#166534' }); add('trash', 4, -36, 0.75, 0.75, 1.1, { color: '#166534' });
  add('sign', -18, -38, 0.4, 0.4, 3.2, { text: 'SULLIVAN COUNTY PARK & LAKE' });
  add('streetsign', -12, -40, 0.2, 0.2, 3, { text: 'LAKE RD' });

  // woods: dense to the west/north-west, scattered along Lake Rd and the inlet shore
  const woods = [];
  for (let x = -66; x <= -22; x += 7) for (let z = -66; z <= -18; z += 7) woods.push([x + ((x * 13 + z * 7) % 5), z + ((x * 3 + z * 11) % 4)]);
  for (const t of [[-64, 30], [-56, 40], [-48, 52], [-62, 62], [-44, 64], [-40, 28], [-8, 50], [4, 60], [16, 52], [24, 44], [-4, 66], [8, 44],
    [-2, -70], [10, -48], [40, -40], [56, -48], [60, -66], [-14, 24], [36, 40]]) woods.push(t);
  woods.forEach(([x, z], i) => tree(x, z, 2.8 + (i % 4) * 0.45));
  for (const [x, z] of [[-30, -30], [-50, -40], [-36, -58], [-58, -22]]) add('hedge', x, z, 3, 3, 1.4, { scrub: true });
  scrub(-70, -66, -24, -16, 18, 21, [[-36, -40, 3]]);
  scrub(-70, 20, -10, 70, 14, 22, [[-48, 8, 18], [-33, 60, 5]]);
  add('kayaks', 60, 12, 1.2, 3.5, 0.9); add('kayaks', 58, -28, 1.2, 3.5, 0.9);
  add('dumpster', -20, -20, 3.6, 1.8, 1.6, { color: '#1e3a8a' });
  add('picnic', -24, 36, 2, 1.6, 0.8); add('picnic', -8, 42, 2, 1.6, 0.8); add('grill', -10, 46, 0.7, 0.7, 1.1);
  add('pickup', 2, -44, 2.3, 5.4, 1.9, { color: '#475569', facing: 'z' });

  const spawns = [
    { x: -64, z: -8, yaw: 1.5 }, { x: -64, z: 22, yaw: 1.5 }, { x: -60, z: 52, yaw: 2.4 }, { x: -20, z: 64, yaw: 3 },
    { x: 14, z: 64, yaw: 3 }, { x: 18, z: 36, yaw: 2.6 }, { x: 36, z: -30, yaw: -1.2 }, { x: 54, z: 10, yaw: -1.6 },
    { x: 30, z: -46, yaw: 0 }, { x: -12, z: -64, yaw: 0.4 }, { x: -36, z: -10, yaw: 1.2 }, { x: 6, z: -12, yaw: 0.8 },
    { x: 60, z: -30, yaw: -1.2 }, { x: -46, z: 30, yaw: 1.8 },
  ];
  return finalize({
    id: 'lake', name: 'SULLIVAN LAKE', faction: 'country',
    blurb: 'Sullivan County Park & Lake: the beach, the beach house, Lake Rd and the woods.',
    bounds: BOUNDS,
    theme: {
      mood: 'Summer afternoon', sky: '#4f8fd0', horizon: '#dfeef5', fog: '#cfe2ea', fogNear: 60, fogFar: 200,
      ground: 'lawn', hemiSky: '#e6f4ff', hemiGround: '#4d6b33', hemiIntensity: 1.4,
      sunColor: '#fff3da', sunIntensity: 3.1, sunPos: [-50, 55, -40], exposure: 1.05,
    },
    boxes, decor, spawns,
  });
}

// Map registry. Add new arenas here (THE FARMSTEAD is next on the list).
export const MAPS = {
  culdesac: buildCuldesac(),
  countryclub: buildCountryClub(),
  farmstead: buildFarmstead(),
  countyfair: buildCountyFair(),
  lake: buildLake(),
};
export const MAP_ORDER = Object.keys(MAPS);
export const getMap = (id) => MAPS[id] || MAPS.culdesac;

export const ANNOUNCEMENTS = [
  'HOA NOTICE: A lawn has been measured at 3.2 inches. This is not a drill.',
  'HOA NOTICE: Unauthorized garden gnome detected. Reproduction is strictly forbidden.',
  'HOA NOTICE: Trash bins must be out of sight by 6 PM. Combat is permitted until 6:01.',
  'HOA NOTICE: The ice cream truck is operating without a permit. Tactically.',
  'HOA NOTICE: Holiday decorations must be removed by March. It is currently war.',
  'HOA NOTICE: Mailbox paint must be one of 3 approved shades of beige.',
  'HOA NOTICE: Trampoline use after 9 PM requires Form 27-B. Bounce responsibly.',
  'HOA NOTICE: Parking an SUV on the street is a Class C violation. Hiding behind one is fine.',
  'HOA NOTICE: Excessive leaf blowing reported. Fine increased to $500.',
  'HOA NOTICE: The model home is not a fort. Please stop using it as a fort.',
  'HOA NOTICE: Pink flamingos are limited to two per lawn. Violators will be flamingoed.',
  'HOA NOTICE: Reminder — this month\'s potluck theme is "Casseroles of Peace".',
];

// [what the feed says, how the victim hears it: "You were ___ by Karen"]
export const KILL_VERBS = [
  ['issued a citation to', 'issued a citation'], ['fined', 'fined'], ['reported', 'reported'],
  ['re-zoned', 're-zoned'], ['evicted', 'evicted'], ['out-mowed', 'out-mowed'],
  ['filed a complaint on', 'written up'], ['passive-aggressively notified', 'passive-aggressively notified'],
  ['foreclosed on', 'foreclosed on'], ['leaf-blew', 'leaf-blown'],
];
