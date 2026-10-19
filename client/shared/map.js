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
    add('shed', X(-46), -36, 4, 3, 2.4, { color: s < 0 ? '#b45309' : '#64748b' });
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
    add('house', X(-32), 14, 14, 11, 3.4, { facing: face, ranch: true, ...c2, label: s < 0 ? 'THE OKAFORS' : 'THE LINDQVISTS' });
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
function helpers() {
  const boxes = [], decor = [];
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
  return { boxes, decor, add, dec, boundary, tree, mirrorSpawns };
}

// ---------------------------------------------------------------------------- SULLIVAN ELKS COUNTRY CLUB
// Based on the real golf course on W Wolfe St in Sullivan, Indiana: long fairways split by
// thick tree lines, Buck Creek cutting diagonally past the clubhouse, a big parking lot, and the
// round lodge next door. Scaled down to an arena, with real-world object sizes.
function buildCountryClub() {
  const BOUNDS = 55;
  const { boxes, decor, add, dec, boundary, tree, mirrorSpawns } = helpers();
  boundary(BOUNDS);
  void mirrorSpawns;
  // W Wolfe St just past the south fence
  dec('road', 0, 62, { w: 160, d: 10 });
  add('fence', 0, 54.2, 108, 0.15, 1.8, { color: '#6b7280' }); // chain-link along the road

  // mown fairways over the rough
  dec('mown', -40, -4, { w: 22, d: 92 });
  dec('mown', -4, -8, { w: 24, d: 84 });
  dec('mown', 38, -30, { w: 32, d: 40 });

  // tree line between the west and center fairways (gaps let you cross)
  for (let z = -52; z <= 44; z += 5) {
    if ((z > -14 && z < -4) || (z > 18 && z < 28)) continue;
    tree((z / 5) % 2 ? -27 : -24, z, 3 + ((z * 7) & 1));
    if (z % 10 === 0) add('hedge', -25.5, z + 2.5, 2.4, 2.4, 1.3, { scrub: true });
  }
  // tree line along the creek's east bank
  for (const [x, z] of [[8, -46], [12, -38], [16, -28], [20, -18], [24, -48], [30, -50], [44, -2], [52, -6]]) tree(x, z, 3.2);

  // Buck Creek: shallow, walkable, with two footbridges
  dec('creek', 0, 0, { pts: [[-14, -57], [-8, -40], [-1, -26], [4, -12], [8, 2], [11, 16], [13, 30], [14, 44], [15, 57]], w: 4.5 });
  add('slab', 4, -12, 8, 2.4, 0.35, { kind2: 'bridge', alongX: true });
  add('slab', 12.4, 23, 8, 2.4, 0.35, { kind2: 'bridge', alongX: true });

  // greens, bunkers, pins, tee boxes
  dec('green', -40, -44, { r: 7 }); add('post', -39, -45, 0.08, 0.08, 2.4, { color: '#f8fafc', flag: true });
  dec('bunker', -47, -38, { r: 2.6 }); dec('bunker', -33, -49, { r: 2.2 });
  dec('green', -4, -42, { r: 7.5 }); add('post', -3, -43, 0.08, 0.08, 2.4, { color: '#f8fafc', flag: true });
  dec('bunker', 5, -38, { r: 2.6 }); dec('bunker', -12, -46, { r: 2.4 });
  dec('green', 40, -42, { r: 6.5 }); add('post', 41, -43, 0.08, 0.08, 2.4, { color: '#f8fafc', flag: true });
  dec('bunker', 32, -36, { r: 2.6 });
  dec('green', 22, 30, { r: 5 }); // practice green by the clubhouse
  add('tee', -40, 40, 6, 4, 0.3); add('tee', -4, 33, 6, 4, 0.3);
  add('chair', -36, 41, 2, 0.6, 0.5); add('trash', -44, 40, 0.75, 0.75, 1.1, { color: '#1f4d3a' });

  // clubhouse, patio, cart barn, the round lodge
  add('house', 34, 16, 20, 10, 4.2, { facing: 'w', wall: '#e8e2d2', roof: '#3a4048', trim: '#ffffff', label: 'SULLIVAN ELKS COUNTRY CLUB' });
  add('slab', 21.5, 16, 5, 10, 0.3);
  for (const z of [12.5, 19.5]) { add('table', 21.5, z, 1.2, 1.2, 1.0, {}, 0.3); dec('umbrella', 21.5, z, { y: 0.3, color: '#1f4d3a' }); }
  add('garage', 28, 2, 12, 6, 3.6, { facing: 's', wall: '#d9d2c0', roof: '#3a4048' });
  for (const x of [23, 26, 29]) add('golfcart', x, 7.5, 1.4, 2.4, 1.6, { color: '#f8fafc', facing: 'z' });
  add('lodge', 46, 0, 12, 12, 5, { label: 'ELKS LODGE' });
  dec('lawnSign', 40, 9, { text: 'MEMBERS & GUESTS' });
  add('streetsign', 18, 53, 0.2, 0.2, 3, { text: 'W WOLFE ST' });
  dec('lawnSign', 10, 50, { text: 'BUCK CREEK' });
  add('sign', -8, 52, 0.4, 0.4, 3.2, { text: 'SULLIVAN ELKS COUNTRY CLUB' });

  // parking lot by the road
  dec('lot', 36, 40, { w: 36, d: 24 });
  const carColors = ['#111827', '#e5e7eb', '#1f2f4f', '#4b5563', '#7a1c1c', '#2b2d31', '#c9ccd1'];
  [[24, 34], [30, 34], [42, 34], [48, 34], [27, 46], [36, 46], [45, 46]].forEach(([x, z], i) => {
    add(i % 3 === 1 ? 'pickup' : 'suv', x, z, 2.3, i % 3 === 1 ? 5.4 : 4.9, 1.9, { color: carColors[i], facing: 'z' });
  });
  add('lamp', 36, 40, 0.3, 0.3, 6);

  // maintenance corner (north-east)
  add('shed', 50, -20, 6, 5, 3, { color: '#64748b' });
  add('mower', 44, -18, 0.9, 1.4, 0.9, { color: '#16a34a' });
  for (const [x, z] of [[28, -14], [50, -46], [-50, 14], [-52, -30], [-14, 18], [2, 42]]) tree(x, z, 3.4);

  const spawns = [
    { x: -40, z: 46, yaw: 0 }, { x: -46, z: -50, yaw: Math.PI }, { x: -36, z: 10, yaw: 0.6 }, { x: -50, z: -12, yaw: 1.2 },
    { x: -6, z: 44, yaw: 0 }, { x: -2, z: -50, yaw: Math.PI }, { x: -12, z: 4, yaw: 1.5 },
    { x: 22, z: 48, yaw: 0.3 }, { x: 50, z: 26, yaw: -1.2 }, { x: 18, z: -4, yaw: -1.5 },
    { x: 34, z: -48, yaw: Math.PI }, { x: 48, z: -32, yaw: -2 }, { x: 24, z: -26, yaw: 2.2 },
    { x: 16, z: -50, yaw: 2.6 },
  ];
  return finalize({
    id: 'countryclub', name: 'SULLIVAN ELKS COUNTRY CLUB', faction: 'suburban',
    blurb: 'The Elks course off W Wolfe St: tree-lined fairways, Buck Creek and the Lodge.',
    bounds: BOUNDS,
    theme: {
      mood: 'Golden-hour sunset', sky: '#3f5f9a', horizon: '#ffb36b', fog: '#e8b88a', fogNear: 40, fogFar: 160,
      ground: 'lawn', hemiSky: '#ffd9b0', hemiGround: '#5a5a2c', hemiIntensity: 1.1,
      sunColor: '#ff9f55', sunIntensity: 3.4, sunPos: [70, 16, 10], exposure: 1.0,
    },
    boxes, decor, spawns,
  });
}

// ---------------------------------------------------------------------------- THE FARMSTEAD
// A typical Sullivan County farm: white farmhouse, red bank barn, a row of grain bins,
// a metal pole barn, a cornfield and a gravel lane off the county road.
function buildFarmstead() {
  const BOUNDS = 55;
  const { boxes, decor, add, dec, boundary, tree } = helpers();
  boundary(BOUNDS, 'rail', 1.4);
  dec('road', 0, 62, { w: 160, d: 9 });                 // county road
  dec('path', 10, 30, { w: 5, d: 52 });                 // gravel lane
  dec('path', 6, -8, { w: 34, d: 24 });                 // gravel barnyard
  add('mailbox', 6, 53, 0.35, 0.5, 1.25, { color: '#6b7280' });
  add('sign', 18, 52, 0.4, 0.4, 3, { text: 'SWEET CORN · FRESH EGGS' });
  add('streetsign', -6, 53, 0.2, 0.2, 3, { text: 'N COUNTY RD 150 E' });

  // farmhouse with wraparound porch, yard trees, swing
  add('house', -24, 32, 12, 10, 6, { facing: 'e', wall: '#f1ede2', roof: '#3f3f46', trim: '#ffffff', label: 'THE HOLLISTERS' });
  add('porch', -16.5, 32, 3, 12, 0.45);
  add('porch', -24, 38.5, 12, 3, 0.45);
  for (const [x, z] of [[-36, 24], [-34, 44], [-12, 44], [-40, 36]]) tree(x, z, 3.6);
  add('swing', -36, 40, 3, 0.3, 2.4);
  add('woodpile', -34, 20, 4, 1.4, 1.2);
  add('pickup', -8, 36, 2.3, 5.4, 1.9, { color: '#7a1c1c', facing: 'z' });

  // red bank barn
  add('barn', -16, -24, 14, 24, 7.5, { color: '#9b2b20', roofH: 4.5 });
  add('hay', -6.5, -32, 3, 1.4, 1.2); add('hay', -6.5, -32, 1.5, 1.4, 1.2, {}, 1.2);
  add('hay', -6.5, -16, 1.4, 3, 1.2);

  // grain bins + leg tower
  for (const x of [14, 23, 32]) add('grainbin', x, -40, 7, 7, 8);
  add('post', 23, -31.5, 0.6, 0.6, 14, { color: '#9ca3af' });
  add('wagon', 18, -26, 2.6, 5, 2.4, { color: '#ca8a04' });
  add('tractor', 6, -14, 2.6, 4.4, 3.1, { color: '#2f6b2a' });
  add('tank', -2, -2, 2, 3.5, 2.4, { color: '#e5e7eb' });

  // metal pole barn
  add('polebarn', 30, 6, 16, 20, 5.5, { color: '#7c8a6e' });
  add('crate', 20, 0, 1.4, 1.4, 1.4); add('crate', 20, 1.6, 1.4, 1.4, 1.4); add('crate', 20, 0.8, 1.2, 1.2, 1.2, {}, 1.4);
  add('pickup', 22, 18, 2.3, 5.4, 1.9, { color: '#2b3a4a', facing: 'z' });

  // pasture (east) with round bales and a feeder
  add('rail', 40, 26, 0.2, 30, 1.2);
  for (const [x, z] of [[46, 22], [50, 36], [44, 44], [52, 48]]) add('hayroll', x, z, 1.8, 1.8, 1.7);
  add('trough', 48, 30, 3, 1, 0.8);
  for (const [x, z] of [[47, 26], [51, 28]]) dec('chicken', x, z);
  add('coop', -2, 20, 5, 4, 2.4);
  add('outhouse', -42, 50, 1.6, 1.6, 2.4);

  // cornfield (north-west) — hides you, doesn't stop bullets
  for (let i = 0; i < 12; i++) dec('cornrow', -52 + i * 2.5, -26, { len: 50, alongX: false });
  add('scarecrow', -40, -30, 0.4, 0.4, 2.4);
  add('rail', -23, -26, 0.2, 52, 1.2);
  // windbreak along the north edge, plowed field north-east
  for (let x = -18; x <= 52; x += 6) tree(x, -51, 3);
  dec('plowed', 44, -24, { w: 20, d: 28 });
  const spawns = [
    { x: -48, z: 4, yaw: 1.4 }, { x: -46, z: 48, yaw: 2 }, { x: -30, z: 8, yaw: 1 }, { x: -4, z: 50, yaw: 0 },
    { x: 2, z: 30, yaw: 0.4 }, { x: 22, z: 48, yaw: -0.4 }, { x: 50, z: 12, yaw: -1.5 }, { x: 48, z: -10, yaw: -1.4 },
    { x: 46, z: -44, yaw: -2.6 }, { x: 4, z: -46, yaw: Math.PI }, { x: -30, z: -48, yaw: 2.8 }, { x: -44, z: -40, yaw: 2.2 },
    { x: -2, z: -28, yaw: 2 }, { x: 36, z: -20, yaw: -2 },
  ];
  return finalize({
    id: 'farmstead', name: 'THE FARMSTEAD', faction: 'country',
    blurb: 'A Sullivan County farm: bank barn, grain bins, pole barn and a whole lot of corn.',
    bounds: BOUNDS,
    theme: {
      mood: 'Hot, dusty afternoon', sky: '#9fb6c8', horizon: '#ead9b0', fog: '#d8c9a3', fogNear: 25, fogFar: 125,
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
  const { boxes, decor, add, dec, boundary, tree } = helpers();
  boundary(BOUNDS, 'rail', 1.4);
  dec('road', 0, 62, { w: 160, d: 9 });                 // County Rd 75 N
  // gravel loop road
  dec('path', 0, -46, { w: 96, d: 6 }); dec('path', 0, 46, { w: 96, d: 6 });
  dec('path', -46, 0, { w: 6, d: 96 }); dec('path', 46, 0, { w: 6, d: 96 });
  dec('path', 0, 0, { w: 6, d: 86 });                   // centre aisle

  // livestock barns: two rows of long metal barns with alleys between (close quarters)
  const barnLabels = ['SWINE', 'BEEF', 'SHEEP & GOATS', 'POULTRY & RABBITS'];
  [[-9, -28], [9, -28], [-9, -2], [9, -2]].forEach(([x, z], i) => add('showbarn', x, z, 10, 20, 3.4, { label: barnLabels[i] }));
  add('showbarn', -9, 22, 10, 12, 3.4, { label: '4-H EXHIBITS' });

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

// Map registry. Add new arenas here (THE FARMSTEAD is next on the list).
export const MAPS = {
  culdesac: buildCuldesac(),
  countryclub: buildCountryClub(),
  farmstead: buildFarmstead(),
  countyfair: buildCountyFair(),
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
