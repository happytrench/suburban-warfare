// Procedural canvas textures — no image downloads needed.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function make(key, size, draw, repeat = [1, 1]) {
  const k = key + repeat.join('x');
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  cache.set(k, t);
  return t;
}

function noise(g, size, colors, count, r, seed = 1) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.fillRect(rand() * size, rand() * size, r * (0.5 + rand()), r * (0.5 + rand()));
  }
}

// Mowed-lawn stripes — very HOA compliant.
export const lawn = (rep = [30, 30]) => make('lawn', 1024, (g, s) => {
  g.fillStyle = '#4a6b2c'; g.fillRect(0, 0, s, s);
  const rand = rng(17);
  for (let i = 0; i < 60; i++) { // large mottling
    const x = rand() * s, y = rand() * s, r = 30 + rand() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, ['rgba(92,120,52,.35)', 'rgba(60,86,34,.35)', 'rgba(110,118,60,.25)'][i % 3]);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 90000; i++) {
    const x = rand() * s, y = rand() * s, l = 2 + rand() * 6;
    g.strokeStyle = ['#3d5c24', '#5e8238', '#486a2a', '#6f8f44', '#34501f', '#7a8a46'][i % 6];
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 2, y - l); g.stroke();
  }
  noise(g, s, ['rgba(90,70,40,.3)'], 300, 2, 8);
}, rep);

// Golf-course fairway: crisp mowing stripes.
export const fairway = (rep = [20, 20]) => make('fairway', 256, (g, s) => {
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5c8f35' : '#6ea43f'; g.fillRect(0, (i * s) / 4, s, s / 4); }
  const rand = rng(23);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * s, y = rand() * s;
    g.strokeStyle = ['#4f7f2c', '#7cb049', '#5f9637'][i % 3];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 2 - rand() * 2); g.stroke();
  }
}, rep);

// Dry late-summer pasture with dirt showing through.
export const pasture = (rep = [30, 30]) => make('pasture', 512, (g, s) => {
  g.fillStyle = '#8f8a4a'; g.fillRect(0, 0, s, s);
  const rand = rng(29);
  for (let i = 0; i < 50; i++) {
    const x = rand() * s, y = rand() * s, r = 20 + rand() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, ['rgba(120,90,50,.45)', 'rgba(110,120,50,.35)', 'rgba(150,130,70,.35)'][i % 3]);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 20000; i++) {
    const x = rand() * s, y = rand() * s, l = 2 + rand() * 5;
    g.strokeStyle = ['#a39a55', '#7d7a3c', '#b5a866', '#6f7238', '#c2b071'][i % 5];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 3, y - l); g.stroke();
  }
}, rep);

// Fairground dirt trampled flat, with scattered straw.
export const fairground = (rep = [30, 30]) => make('fairground', 512, (g, s) => {
  g.fillStyle = '#7a5f42'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#6d543a', '#86694a', '#5f4832', '#917353'], 12000, 2.5, 41);
  const rand = rng(43);
  for (let i = 0; i < 1800; i++) {
    const x = rand() * s, y = rand() * s, a = rand() * Math.PI;
    g.strokeStyle = ['#d9b44a', '#c9a640', '#e8c97a'][i % 3];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke();
  }
}, rep);

// Plowed field furrows.
export const furrows = (rep = [1, 1]) => make('furrows', 256, (g, s) => {
  g.fillStyle = '#5e4630'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, '#4a3624'); grd.addColorStop(0.5, '#7a5d40'); grd.addColorStop(1, '#4a3624');
    g.fillStyle = grd; g.fillRect(x, 0, 16, s);
  }
  noise(g, s, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.06)'], 2000, 2, 47);
}, rep);

export const sand = (rep = [1, 1]) => make('sand', 256, (g, s) => {
  g.fillStyle = '#d9c38f'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#cdb47c', '#e6d3a3', '#c4a96e', '#efe0b8'], 9000, 1.6, 51);
}, rep);

// Corrugated metal siding (pole barns, sheds).
export const metal = (rep = [1, 1]) => make('metal', 128, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, 'rgba(0,0,0,.14)'); grd.addColorStop(0.5, 'rgba(255,255,255,.12)'); grd.addColorStop(1, 'rgba(0,0,0,.14)');
    g.fillStyle = grd; g.fillRect(x, 0, 8, s);
  }
  noise(g, s, ['rgba(120,80,40,.06)', 'rgba(0,0,0,.05)'], 300, 3, 61);
}, rep);

export const camo = (rep = [1, 1]) => make('camo', 64, (g, s) => {
  g.fillStyle = '#6b6b3a'; g.fillRect(0, 0, s, s);
  const rand = rng(71);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ['#4a4a26', '#8a7a4a', '#3a2f1e', '#5f6b34'][i % 4];
    g.beginPath(); g.ellipse(rand() * s, rand() * s, 4 + rand() * 9, 3 + rand() * 6, rand() * 3, 0, Math.PI * 2); g.fill();
  }
}, rep);

export const bark = (rep = [1, 1]) => make('bark', 256, (g, s) => {
  g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, s, s);
  const rand = rng(5);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = ['#2e241a', '#5d4a36', '#3a2e22'][i % 3]; g.lineWidth = 1 + rand() * 3;
    const x = rand() * s;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= s; y += 16) g.lineTo(x + (rand() - 0.5) * 8, y);
    g.stroke();
  }
}, rep);

// Leaf cluster with transparency — used on crossed "foliage cards", the classic console-era tree.
export const foliage = () => make('foliage', 256, (g, s) => {
  g.clearRect(0, 0, s, s);
  const rand = rng(77);
  for (let i = 0; i < 2600; i++) {
    const a = rand() * Math.PI * 2, rr = Math.pow(rand(), 0.6) * s * 0.47;
    const x = s / 2 + Math.cos(a) * rr, y = s / 2 + Math.sin(a) * rr * 0.9;
    const shade = rr / (s * 0.47);
    g.fillStyle = ['#2f5a1f', '#3e7029', '#4f8233', '#26491a', '#5e8f3a'][Math.floor(rand() * 5 * (1 - shade * 0.4))];
    g.beginPath(); g.ellipse(x, y, 3 + rand() * 4, 2 + rand() * 2, rand() * Math.PI, 0, Math.PI * 2); g.fill();
  }
});

export const denim = (rep = [1, 1]) => make('denim', 64, (g, s) => {
  g.fillStyle = '#34507a'; g.fillRect(0, 0, s, s);
  for (let i = -s; i < s; i += 3) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); }
  noise(g, s, ['rgba(0,0,0,.1)', 'rgba(255,255,255,.06)'], 300, 1.5, 3);
}, rep);

export const flannel = (base = '#9b2222', rep = [1, 1]) => make('flannel' + base, 64, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, 10, s, 10); g.fillRect(10, 0, 10, s);
  g.fillRect(0, 42, s, 10); g.fillRect(42, 0, 10, s);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 30, s, 2); g.fillRect(30, 0, 2, s);
  noise(g, s, ['rgba(0,0,0,.08)'], 200, 1.5, 2);
}, rep);

// Buffalo-check flannel at cloth resolution (woven: the weave detail comes from the jersey normal map).
export const buffalo = (a = '#a3191c', b = '#161314') => make('buffalo' + a + b, 512, (g, s) => {
  const c = s / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const ax = x % 2, ay = y % 2;
    g.fillStyle = ax && ay ? b : (ax || ay) ? '#5a1416' : a;
    g.fillRect(x * c, y * c, c, c);
  }
  g.globalAlpha = 0.18; // twill hatching where threads cross
  for (let i = -s; i < s; i += 4) { g.strokeStyle = i % 8 ? '#000' : '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); }
  g.globalAlpha = 1;
  noise(g, s, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.07)'], 6000, 1.2, 9);
});

export const knit = (base = '#3b82f6') => make('knit' + base, 64, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 3) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, y, s, 1); }
  noise(g, s, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.06)'], 300, 1.5, 6);
});

// Painted face decal (transparent), console-era style.
// Painted face (transparent decal over the skin). kind: '+'-joined tokens —
// grin, beard, stubble, mustache, handlebar, goatee, old, iris colour (blue|green|brown).
export const face = (kind = 'clean', skin = '#e0ac69') => make('face2' + kind + skin, 512, (g, s) => {
  g.clearRect(0, 0, s, s);
  const K = new Set(kind.split('+'));
  const k = s / 128; g.save(); g.scale(k, k);
  const rand = rng(kind.length * 31 + 7);
  const soft = (x, y, rx, ry, c0, c1 = 'rgba(0,0,0,0)') => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore(); };
  // shading: eye sockets, cheeks, nose sides, under-lip, jaw
  for (const x of [44, 84]) { soft(x, 55, 16, 11, 'rgba(90,40,30,.22)'); soft(x + (x < 64 ? -6 : 6), 76, 15, 10, 'rgba(210,70,60,.16)'); }
  soft(58, 68, 4, 12, 'rgba(80,35,25,.18)'); soft(70, 68, 4, 12, 'rgba(80,35,25,.18)');
  soft(64, 66, 3, 11, 'rgba(255,255,255,.18)');                                   // nose bridge highlight
  soft(64, 98, 12, 5, 'rgba(70,30,25,.18)'); soft(64, 110, 34, 14, 'rgba(60,30,20,.10)');
  if (K.has('old')) { g.strokeStyle = 'rgba(80,40,30,.28)'; g.lineWidth = 0.8; for (const y of [34, 37, 40]) { g.beginPath(); g.moveTo(48, y); g.quadraticCurveTo(64, y - 2, 80, y); g.stroke(); } for (const x of [30, 98]) { for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x, 52 + i * 3); g.lineTo(x + (x < 64 ? -5 : 5), 50 + i * 4); g.stroke(); } } }
  // nasolabial folds
  g.strokeStyle = 'rgba(90,40,30,.22)'; g.lineWidth = 1.4;
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(64 + sx * 9, 74); g.quadraticCurveTo(64 + sx * 15, 84, 64 + sx * 13, 94); g.stroke(); }
  // eyes
  const iris = K.has('green') ? ['#5f7a4a', '#2f4024'] : K.has('brown') ? ['#6b4426', '#2b1a0e'] : ['#6f95b8', '#2d4a66'];
  for (const x of [44, 84]) {
    g.save(); g.beginPath(); g.ellipse(x, 56, 9, 4.6, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#efe9e1'; g.fillRect(x - 10, 50, 20, 12);
    soft(x, 52, 10, 5, 'rgba(120,80,70,.35)');                                    // lid shadow on the white
    const ig = g.createRadialGradient(x, 56, 0.5, x, 56, 4.4); ig.addColorStop(0, iris[0]); ig.addColorStop(0.75, iris[1]); ig.addColorStop(1, '#141414');
    g.fillStyle = ig; g.beginPath(); g.arc(x, 56, 4.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(x, 56, 1.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x + 1.4, 54.6, 0.9, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(30,18,12,.9)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(x, 56, 9, 4.6, 0, Math.PI, Math.PI * 2); g.stroke();   // upper lash line
    g.strokeStyle = 'rgba(90,50,40,.35)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x, 56, 8.5, 4.2, 0, 0.15, Math.PI - 0.15); g.stroke(); // lower lid
    g.strokeStyle = 'rgba(90,45,35,.35)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, 54, 9.5, 5.5, 0, Math.PI + 0.3, Math.PI * 2 - 0.3); g.stroke(); // crease
    // brows: individual hair strokes
    g.strokeStyle = K.has('old') ? 'rgba(150,145,140,.9)' : 'rgba(60,38,22,.85)'; g.lineWidth = 0.7;
    for (let i = 0; i < 26; i++) { const t = i / 25, bx = x - 11 + t * 22, by = 45 - Math.sin(t * Math.PI) * 2.2 + (x < 64 ? t : 1 - t) * 1.5; g.beginPath(); g.moveTo(bx, by + 1.6); g.lineTo(bx + 2.2 * (x < 64 ? 1 : -1) * (t - 0.3), by - 0.8 + rand()); g.stroke(); }
  }
  // nostrils + nose tip
  for (const sx of [-1, 1]) soft(64 + sx * 4, 77, 2.3, 1.4, 'rgba(60,20,15,.55)');
  soft(64, 74, 6, 4, 'rgba(255,230,220,.15)');
  // facial hair
  const stubble = (y0, y1, a) => { for (let i = 0; i < 2600; i++) { const x = 30 + rand() * 68, y = y0 + rand() * (y1 - y0); const dx = (x - 64) / 36, dy = (y - 96) / 26; if (dx * dx + dy * dy > 1 || (y < 84 && Math.abs(x - 64) < 14)) continue; g.fillStyle = `rgba(55,38,26,${a * (0.5 + rand() * 0.5)})`; g.fillRect(x, y, 0.6, 0.6); } };
  if (K.has('stubble')) stubble(78, 124, 0.55);
  const hairC = K.has('old') ? 'rgba(150,145,140,' : 'rgba(80,52,30,';
  const strokes = (path, n, len, a = 0.85) => { g.strokeStyle = hairC + a + ')'; g.lineWidth = 0.8; for (let i = 0; i < n; i++) { const [x, y, ang] = path(rand()); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke(); } };
  if (K.has('beard')) {
    g.fillStyle = hairC + '.92)'; g.beginPath(); g.ellipse(64, 100, 44, 30, 0, 0, Math.PI); g.fill();
    strokes((t) => [64 + (t - 0.5) * 86, 100 + rand() * 26, Math.PI / 2 + (t - 0.5) * 0.6], 900, 6);
  }
  if (K.has('mustache') || K.has('beard') || K.has('handlebar')) {
    g.fillStyle = hairC + '.95)'; g.beginPath(); g.ellipse(64, 85, 15, 4.5, 0, 0, Math.PI * 2); g.fill();
    strokes((t) => [64 + (t - 0.5) * 30, 83 + rand() * 4, Math.PI / 2 + (t - 0.5) * 1.6], 300, 4);
  }
  if (K.has('handlebar')) { g.strokeStyle = hairC + '.95)'; g.lineWidth = 3.4; g.lineCap = 'round'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(64 + sx * 12, 86); g.quadraticCurveTo(64 + sx * 20, 92, 64 + sx * 18, 106); g.stroke(); } }
  if (K.has('goatee')) { g.fillStyle = hairC + '.92)'; g.beginPath(); g.ellipse(64, 104, 9, 9, 0, 0, Math.PI * 2); g.fill(); strokes((t) => [55 + t * 18, 98 + rand() * 12, Math.PI / 2], 200, 4); }
  // mouth
  if (K.has('grin')) {
    g.fillStyle = '#5a1414'; g.beginPath(); g.moveTo(47, 89); g.quadraticCurveTo(64, 106, 81, 89); g.quadraticCurveTo(64, 93, 47, 89); g.fill();
    g.fillStyle = '#fbfaf6'; g.beginPath(); g.moveTo(49, 90); g.quadraticCurveTo(64, 95, 79, 90); g.quadraticCurveTo(64, 98, 49, 90); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 0.4; for (let x = 52; x < 78; x += 4) { g.beginPath(); g.moveTo(x, 90.5); g.lineTo(x, 95); g.stroke(); }
    g.strokeStyle = 'rgba(150,70,60,.8)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(46, 88.5); g.quadraticCurveTo(64, 107, 82, 88.5); g.stroke();
  } else if (!K.has('beard') || K.has('mustache')) {
    const lg = g.createLinearGradient(0, 87, 0, 97); lg.addColorStop(0, '#b0645a'); lg.addColorStop(0.45, '#8e4a42'); lg.addColorStop(0.55, '#5e2c27'); lg.addColorStop(1, '#b77066');
    g.fillStyle = lg; g.beginPath(); g.moveTo(52, 91); g.quadraticCurveTo(58, 87, 64, 89); g.quadraticCurveTo(70, 87, 76, 91); g.quadraticCurveTo(64, 98, 52, 91); g.fill();
    g.strokeStyle = 'rgba(60,25,20,.8)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(52, 91); g.quadraticCurveTo(64, 93, 76, 91); g.stroke();
    soft(64, 94.5, 5, 1.4, 'rgba(255,240,235,.25)');
  }
  g.restore();
  void skin;
});
export const dirt = (rep = [20, 20]) => make('dirt', 512, (g, s) => {
  g.fillStyle = '#9a7449'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#8a6640', '#a98256', '#7b5a37', '#b48d60', '#6e5032'], 16000, 2.6, 11);
  noise(g, s, ['#cfc3a8', '#9a9184', '#6b6257'], 900, 2.2, 13); // pebbles
  noise(g, s, ['#7fa04a', '#8fb35a'], 300, 3, 12);
}, rep);

export const asphalt = (rep = [1, 1]) => make('asphalt', 1024, (g, s) => {
  g.fillStyle = '#45494e'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#3c4044', '#52565b', '#36393d', '#5e6268', '#4a4d52', '#6b6f74'], 70000, 1.6, 3);
  const rand = rng(44);
  g.strokeStyle = 'rgba(20,20,22,.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { // cracks
    let x = rand() * s, y = rand() * s;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 7; j++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) { // oil stains
    const x = rand() * s, y = rand() * s, r = 6 + rand() * 14;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(0,0,0,.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}, rep);

export const concrete = (rep = [1, 1]) => make('concrete', 512, (g, s) => {
  g.fillStyle = '#d7d3c8'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#cfcbc0', '#e0ddd4', '#c6c2b6', '#b9b5a9', '#d9d5ca'], 14000, 1.5, 5);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
  g.strokeRect(0, 0, s, s);
}, rep);

export const siding = (rep = [1, 1]) => make('siding', 512, (g, s) => {
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 21) {
    const grd = g.createLinearGradient(0, y, 0, y + 21);
    grd.addColorStop(0, 'rgba(255,255,255,.35)'); grd.addColorStop(0.85, 'rgba(0,0,0,.04)'); grd.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = grd; g.fillRect(0, y, s, 21);
  }
  noise(g, s, ['rgba(0,0,0,.035)', 'rgba(255,255,255,.05)'], 1500, 3, 2);
}, rep);

export const brick = (rep = [1, 1]) => make('brick', 512, (g, s) => {
  g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, s, s);
  const rand = rng(8);
  const bh = 16, bw = 42;
  for (let row = 0; row < s / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < s; x += bw) {
      const v = 0.8 + rand() * 0.35;
      g.fillStyle = `rgb(${Math.round(160 * v)},${Math.round(70 * v)},${Math.round(52 * v)})`;
      g.fillRect(x + 2, row * bh + 2, bw - 3, bh - 3);
    }
  }
  noise(g, s, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'], 2500, 2, 9);
}, rep);

export const shingles = (rep = [1, 1]) => make('shingles', 512, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  const rand = rng(9);
  for (let row = 0; row < 16; row++) {
    const y = row * 16, off = row % 2 ? 12 : 0;
    for (let x = -off; x < s; x += 24) {
      const v = Math.round(200 + rand() * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 1, y, 23, 15);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 14, s, 2);
  }
  noise(g, s, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.1)'], 3000, 1.5, 9);
}, rep);

export const wood = (rep = [1, 1]) => make('wood', 128, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  const rand = rng(21);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(80,50,20,${0.08 + rand() * 0.12})`;
    g.lineWidth = 1 + rand() * 2;
    const x = rand() * s;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, s / 3, x - 6, (2 * s) / 3, x + 3, s); g.stroke();
  }
}, rep);

export const planks = (rep = [1, 1]) => make('planks', 256, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 21) { g.fillStyle = 'rgba(40,20,5,.28)'; g.fillRect(x, 0, 2, s); }
  noise(g, s, ['rgba(60,30,10,.10)', 'rgba(255,255,255,.12)'], 500, 3, 4);
}, rep);

export const hedge = (rep = [1, 1]) => make('hedge', 128, (g, s) => {
  g.fillStyle = '#2f6b2a'; g.fillRect(0, 0, s, s);
  noise(g, s, ['#3b7f33', '#25591f', '#4a9140', '#1f4d1a', '#57a24a'], 1600, 4, 13);
}, rep);

export const hay = (rep = [1, 1]) => make('hay', 128, (g, s) => {
  g.fillStyle = '#e2c25a'; g.fillRect(0, 0, s, s);
  const rand = rng(31);
  for (let i = 0; i < 500; i++) {
    g.strokeStyle = ['#c9a640', '#f0d77a', '#b8932f'][i % 3];
    g.lineWidth = 1;
    const x = rand() * s, y = rand() * s, a = rand() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.stroke();
  }
}, rep);

export const garageDoor = () => make('garagedoor', 128, (g, s) => {
  g.fillStyle = '#f8f8f4'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 32) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, y, s, 3); }
  for (let x = 0; x < s; x += 32) for (let y = 6; y < s; y += 32) {
    g.strokeStyle = 'rgba(0,0,0,.10)'; g.strokeRect(x + 4, y + 2, 24, 20);
  }
});

export function textTexture(text, { w = 512, h = 128, bg = '#fff8e7', fg = '#1d2318', border = '#2f7d32', font = 'Bungee, Impact, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(6, h * 0.08); g.strokeRect(0, 0, w, h); }
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = h * 0.42;
  g.font = `${size}px ${font}`;
  while (g.measureText(text).width > w * 0.9 && size > 10) { size -= 2; g.font = `${size}px ${font}`; }
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
