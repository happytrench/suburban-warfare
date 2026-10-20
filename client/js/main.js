// SUBURBAN WARFARE — browser client.
import * as THREE from 'three';
import {
  PLAYER, WEAPONS, WEAPON_ORDER, MODES, TEAMS, KILL_LIMITS, TIME_LIMITS_MIN,
  INTERP_DELAY_MS, CLIENT_SEND_MS, RESPAWN_MS, ADS_SPREAD_MULT, fullAmmo,
} from '../shared/constants.js';
import { MAPS, getMap } from '../shared/map.js';
import { stepPlayer, raycastMap, rayPlayer } from '../shared/physics.js';
import { buildWorld, buildSky, setQuality } from './world.js';
import { buildCharacter, nameTag, playerColor, buildGunModel, muzzleOffset } from './characters.js';
import { loadGuns } from './guns.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Net } from './net.js';
import { Sfx } from './audio.js';
import { loadRig, rigReady, buildRiggedCharacter, animateRig, humanReady } from './rig.js';
import { updateMixamo, hitMixamo } from './mixamo.js';

// ======================================================================= helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem('sw_session') || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('sw_session', JSON.stringify(v)); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem('sw_session'); } catch { /* ignore */ } },
};

// ======================================================================= settings
const settings = Object.assign({
  sens: 1, fov: 80, vol: 0.6, invert: false, voice: false, shadows: true, scale: 1, quality: 'high', fps: false,
}, store.get('sw_settings', {}));
function saveSettings() { store.set('sw_settings', settings); }

// ======================================================================= renderer
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor('#9fc4dd');
container.appendChild(renderer.domElement);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 800);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight('#dff1ff', '#4d6b33', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe2b0', 3);
sun.position.set(55, 38, 35);
sun.castShadow = true;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 220 });
scene.add(sun);

// first-person weapon rendered in its own pass so it never clips into walls
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight('#ffffff', '#555555', 2.2));
const vmSun = new THREE.DirectionalLight('#fff1d0', 1.6); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
const viewmodel = new THREE.Group();
viewmodel.scale.setScalar(0.55);
vmScene.add(viewmodel);
const vmGuns = {};
const muzzleFlash = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 8, 6),
  new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.95 }),
);
muzzleFlash.visible = false;
const flashLight = new THREE.PointLight('#ffcc66', 0, 9);
scene.add(flashLight);

function buildViewmodels() {
  for (const k of Object.keys(vmGuns)) viewmodel.remove(vmGuns[k]);
  for (const w of WEAPON_ORDER) {
    const g = buildGunModel(w, settings.quality);
    g.rotation.y = Math.PI; // model forward +z -> view forward -z
    viewmodel.add(g);
    vmGuns[w] = g;
  }
  viewmodel.add(muzzleFlash);
}

function applyRenderSettings() {
  setQuality(settings.quality);
  renderer.toneMapping = settings.quality === 'high' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.shadowMap.enabled = !!settings.shadows;
  sun.castShadow = !!settings.shadows;
  const size = settings.quality === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.scale);
  camera.fov = settings.fov; camera.updateProjectionMatrix();
  $('fps').classList.toggle('hidden', !settings.fps);
  sfx.setVolume(settings.vol);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  vmCam.aspect = w / h; vmCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ======================================================================= world
let worldGroup = null, skyMesh = null, currentMapId = null, currentQuality = null;
const worldCache = new Map();
function loadMap(id) {
  const map = getMap(id);
  if (currentMapId === map.id && currentQuality === settings.quality) return map;
  if (worldGroup) scene.remove(worldGroup);
  if (skyMesh) scene.remove(skyMesh);
  const key = map.id + '|' + settings.quality;
  if (!worldCache.has(key)) worldCache.set(key, buildWorld(map));
  worldGroup = worldCache.get(key);
  scene.add(worldGroup);
  skyMesh = buildSky(map.theme);
  scene.add(skyMesh);
  applyTheme(map.theme);
  currentMapId = map.id;
  currentQuality = settings.quality;
  return map;
}
const activeMap = () => getMap(currentMapId || 'culdesac');

// Each map has its own time of day: sun color/angle, sky light, fog and exposure.
function applyTheme(t) {
  scene.fog = new THREE.Fog(t.fog, t.fogNear ?? 45, t.fogFar ?? 170);
  hemi.color.set(t.hemiSky || '#dff1ff');
  hemi.groundColor.set(t.hemiGround || '#4d6b33');
  hemi.intensity = t.hemiIntensity ?? 1.5;
  sun.color.set(t.sunColor || '#ffe2b0');
  sun.intensity = t.sunIntensity ?? 3;
  const sp = t.sunPos || [55, 38, 35];
  sun.position.set(sp[0], sp[1], sp[2]);
  renderer.toneMappingExposure = t.exposure ?? 1.05;
  renderer.setClearColor(t.horizon || '#9fc4dd');
}

// ======================================================================= effects
const particleGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const particleMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const MAX_P = 400;
const particles = new THREE.InstancedMesh(particleGeo, particleMat, MAX_P);
particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
particles.frustumCulled = false;
scene.add(particles);
const pData = Array.from({ length: MAX_P }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
let pCursor = 0;
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
for (let i = 0; i < MAX_P; i++) { particles.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); particles.setColorAt(i, tmpC.set('#fff')); }

function burst(x, y, z, colors, n = 8, speed = 3, size = 1) {
  for (let i = 0; i < n; i++) {
    const p = pData[pCursor];
    p.life = 0.5 + Math.random() * 0.4;
    p.x = x; p.y = y; p.z = z;
    p.vx = (Math.random() - 0.5) * speed; p.vy = Math.random() * speed; p.vz = (Math.random() - 0.5) * speed;
    p.s = size * (0.6 + Math.random() * 0.8);
    particles.setColorAt(pCursor, tmpC.set(colors[i % colors.length]));
    pCursor = (pCursor + 1) % MAX_P;
  }
  particles.instanceColor.needsUpdate = true;
}

function updateParticles(dt) {
  for (let i = 0; i < MAX_P; i++) {
    const p = pData[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy -= 9 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    const sc = p.life > 0 ? p.s * Math.min(1, p.life * 3) : 0;
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(sc, sc, sc));
    particles.setMatrixAt(i, tmpM);
  }
  particles.instanceMatrix.needsUpdate = true;
}

const tracers = [];
const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4, 1, true);
tracerGeo.translate(0, 0.5, 0);
tracerGeo.rotateX(Math.PI / 2);
for (let i = 0; i < 48; i++) {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.8, depthWrite: false }));
  m.visible = false; m.userData.life = 0;
  scene.add(m); tracers.push(m);
}
let tracerCursor = 0;
function tracer(from, to) {
  const m = tracers[tracerCursor]; tracerCursor = (tracerCursor + 1) % tracers.length;
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  m.position.copy(from);
  m.lookAt(to);
  m.scale.set(1, 1, len);
  m.visible = true; m.userData.life = 0.07;
  m.material.opacity = 0.8;
}
function updateTracers(dt) {
  for (const m of tracers) {
    if (!m.visible) continue;
    m.userData.life -= dt;
    m.material.opacity = Math.max(0, m.userData.life / 0.07) * 0.8;
    if (m.userData.life <= 0) m.visible = false;
  }
}

function impact(end, kind) {
  // kind: 1 = player, 2 = map geometry, 0 = nothing
  if (kind === 1) burst(end.x, end.y, end.z, ['#ffffff', '#fde68a', '#fca5a5'], 7, 3.5, 1.1); // "citation" confetti
  else if (kind === 2) burst(end.x, end.y, end.z, end.y < 0.1 ? ['#4a6b2c', '#6f8f44', '#5b4630'] : ['#9ca3af', '#d6d3d1', '#78716c'], 6, 2.5);
}

// ======================================================================= audio / ui refs
const sfx = new Sfx();
const net = new Net();

const screens = ['loading', 'menu', 'lobby', 'click-to-play', 'pause', 'end', 'conn'];
let screen = 'loading';
function show(name) {
  screen = name;
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  const hudOn = !['loading', 'menu', 'lobby'].includes(name) && (inMatch() || S.phase === 'ended');
  $('hud').classList.toggle('hidden', !hudOn);
}
function hideScreens() {
  screen = null;
  for (const s of screens) $(s).classList.add('hidden');
  $('hud').classList.remove('hidden');
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// ======================================================================= game state
const S = {
  myId: 0,
  code: '',
  room: null,
  phase: 'none',
  inRoom: false,
  helloed: false,
  pending: null,
  lastEnd: null,
  lastRoomAt: 0,
};
const me = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: false,
  yaw: 0, pitch: 0, epoch: 0, alive: false, hp: 100,
  weapon: 'rifle', ammo: fullAmmo(), ads: false, aimT: 0,
  reloadUntil: 0, nextFire: 0, seq: 0, lastSend: 0, recoil: 0, bob: 0, deathAt: 0, respawnAt: 0,
  kickPitch: 0, kickYaw: 0, shake: 0, bloom: 0, lastShot: 0,
  killerId: 0, kills: 0, deaths: 0, landT: 0,
};
const remotes = new Map();
const inMatch = () => S.phase === 'countdown' || S.phase === 'playing';
const mode = () => (S.room ? S.room.cfg.mode : 'ffa');
const playerInfo = (id) => (S.room ? S.room.players.find((p) => p.id === id) : null);
const outfitFor = (id, team) => (mode() === 'tdm' ? (team === 2 ? 'country' : 'suburban') : (id % 2 ? 'suburban' : 'country'));

// ======================================================================= input
const keys = new Set();
let mouseDown = false, firedThisClick = false, chatOpen = false, scoreboardOpen = false;
const locked = () => document.pointerLockElement === renderer.domElement;

function requestLock() {
  sfx.unlock();
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => toast('Click again to grab the mouse'));
  } catch { toast('Click again to grab the mouse'); }
}

document.addEventListener('pointerlockchange', () => {
  if (locked()) {
    if (screen) hideScreens();
  } else {
    mouseDown = false;
    keys.clear();
    if (chatOpen) closeChat();
    if (inMatch() && screen === null) openPause();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const s = 0.0022 * settings.sens * (camera.fov / settings.fov);
  me.yaw -= e.movementX * s;
  me.pitch -= e.movementY * s * (settings.invert ? -1 : 1);
  me.pitch = clamp(me.pitch, -1.5, 1.5);
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked()) { if (inMatch() && screen === null) requestLock(); return; }
  if (e.button === 0) { mouseDown = true; firedThisClick = false; }
  if (e.button === 2) me.ads = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) me.ads = false; });
document.addEventListener('contextmenu', (e) => { if (locked() || inMatch()) e.preventDefault(); });
document.addEventListener('wheel', (e) => {
  if (!locked() || !me.alive) return;
  const i = WEAPON_ORDER.indexOf(me.weapon);
  switchWeapon(WEAPON_ORDER[(i + (e.deltaY > 0 ? 1 : WEAPON_ORDER.length - 1)) % WEAPON_ORDER.length]);
});

document.addEventListener('keydown', (e) => {
  if (chatOpen) {
    if (e.key === 'Enter') { sendChat($('chat-input').value); closeChat(); e.preventDefault(); }
    return;
  }
  if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.code === 'Tab') { e.preventDefault(); if (inMatch() || S.phase === 'ended') { scoreboardOpen = true; renderScoreboard(); } return; }
  if (!locked()) return;
  keys.add(e.code);
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') switchWeapon('rifle');
  if (e.code === 'Digit2') switchWeapon('shotgun');
  if (e.code === 'Digit3') switchWeapon('deer');
  if (e.code === 'KeyQ') switchWeapon(WEAPON_ORDER[(WEAPON_ORDER.indexOf(me.weapon) + 1) % WEAPON_ORDER.length]);
  if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); }
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') { scoreboardOpen = false; $('scoreboard').classList.add('hidden'); }
});
window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });

function openChat() {
  chatOpen = true;
  keys.clear(); mouseDown = false;
  const i = $('chat-input'); i.classList.remove('hidden'); i.value = ''; i.focus();
}
function closeChat() {
  chatOpen = false;
  const i = $('chat-input'); i.blur(); i.classList.add('hidden');
}
function sendChat(text) {
  const t = String(text || '').trim();
  if (t) net.send({ t: 'chat', m: t.slice(0, 120) });
}

// ======================================================================= actions
function playerName() {
  const n = $('name-input').value.trim();
  store.set('sw_name', n);
  return n;
}
function act(msg) {
  net.name = playerName();
  if (net.status === 'open' && S.helloed) {
    net.send({ t: 'name', name: net.name });
    net.send(msg);
  } else {
    S.pending = msg;
    if (net.status !== 'open' && net.status !== 'connecting') net.connect();
  }
  $('menu-error').classList.add('hidden');
  $('server-status').textContent = 'Knocking on the door…';
}

function switchWeapon(w) {
  if (!WEAPONS[w] || w === me.weapon || !me.alive) return;
  me.weapon = w;
  me.reloadUntil = 0;
  me.nextFire = performance.now() + 250;
  me.swapT = 0.25;
  net.send({ t: 'w', w });
  updateHudWeapon();
}

function reload() {
  const w = WEAPONS[me.weapon];
  if (!me.alive || me.reloadUntil || me.ammo[me.weapon] >= w.mag) return;
  me.reloadUntil = performance.now() + w.reloadMs;
  net.send({ t: 'r' });
  sfx.reload();
  updateHudWeapon();
}

const _dir = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();
function tryFire(now) {
  if (S.phase !== 'playing' || !me.alive || !locked() || chatOpen) return;
  const w = WEAPONS[me.weapon];
  if (!w.auto && firedThisClick) return;
  if (now < me.nextFire) return;
  if (me.reloadUntil) return;
  if (me.ammo[me.weapon] <= 0) { firedThisClick = true; sfx.empty(); reload(); return; }
  firedThisClick = true;
  me.nextFire = now + w.cooldownMs;
  me.ammo[me.weapon]--;
  me.seq++;
  camera.getWorldDirection(_dir);
  const aimed = me.aimT > 0.7 && !me.sprinting;
  net.send({ t: 'f', e: me.epoch, w: me.weapon, d: [_dir.x, _dir.y, _dir.z], s: me.seq, a: aimed });

  // immediate local feedback (server decides actual hits)
  const origin = { x: me.pos.x, y: me.pos.y + PLAYER.eye, z: me.pos.z };
  // tracer starts just in front/right/below the camera, where the viewmodel muzzle appears
  _from.set(0.18, -0.16, -0.8).applyQuaternion(camera.quaternion).add(camera.position);
  for (let i = 0; i < w.pellets; i++) {
    const sp = (w.scoped ? (aimed ? w.spread : w.hipSpread) : w.spread * (aimed ? ADS_SPREAD_MULT : 1)) * (me.sprinting ? 1.6 : 1);
    const d = new THREE.Vector3(_dir.x + (Math.random() - 0.5) * sp * 2, _dir.y + (Math.random() - 0.5) * sp * 2, _dir.z + (Math.random() - 0.5) * sp * 2).normalize();
    const hit = raycastMap(origin, d, w.range, activeMap().boxes);
    let best = hit.dist, kind = hit.box ? 2 : 0;
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      const h = rayPlayer(origin, d, r.obj.position.x, r.obj.position.y, r.obj.position.z);
      if (h && h.dist < best) { best = h.dist; kind = 1; }
    }
    _to.set(origin.x + d.x * best, origin.y + d.y * best, origin.z + d.z * best);
    tracer(_from, _to);
    if (kind === 2) impact(_to, 2);
  }
  const kick = { rifle: [0.35, 0.012], shotgun: [1, 0.045], deer: [1.3, 0.06] }[me.weapon];
  me.recoil = Math.min(me.recoil + kick[0], 1.6);
  const k = kick[1] * (aimed ? 0.6 : 1);
  me.kickPitch += k;                                  // visual kick that recovers...
  me.pitch = clamp(me.pitch + k * 0.25, -1.5, 1.5);   // ...and a little that stays (pull down to control)
  me.kickYaw += (Math.random() - 0.5) * k * 0.6;
  me.shake = Math.min(1, me.shake + (me.weapon === 'rifle' ? 0.12 : 0.5));
  me.bloom = Math.min(1, me.bloom + (me.weapon === 'rifle' ? 0.18 : 0.6));
  me.lastShot = now;
  muzzleFlash.visible = true; muzzleFlash.userData.t = 0.05;
  flashLight.position.copy(camera.position); flashLight.intensity = 6;
  sfx.shot(me.weapon);
  if (me.ammo[me.weapon] <= 0) setTimeout(reload, 150);
  updateHudWeapon();
}

// ======================================================================= remote players
function ensureRemote(id) {
  let r = remotes.get(id);
  const info = playerInfo(id);
  const team = info ? info.team : 0;
  const color = playerColor(id, team, mode());
  const outfit = outfitFor(id, team);
  if (r && (r.color !== color || r.outfit !== outfit || r.quality !== settings.quality || (r.obj.userData.pendingHuman && humanReady(r.obj.userData.pendingHuman)))) { removeRemote(id); r = null; }
  if (!r) {
    const useRig = rigReady() && settings.quality === 'high';
    const obj = useRig ? buildRiggedCharacter({ id, color, outfit }) : buildCharacter({ id, color, outfit, quality: settings.quality });
    const tag = nameTag(info ? info.name : `Neighbor ${id}`, color);
    tag.position.y = 2.25;
    obj.add(tag);
    scene.add(obj);
    r = { id, obj, tag, color, outfit, quality: settings.quality, buf: [], alive: true, flags: 1, walk: 0, fall: 0, name: info ? info.name : '', lastPos: new THREE.Vector3() };
    remotes.set(id, r);
  }
  if (info && info.name !== r.name) {
    r.obj.remove(r.tag);
    r.tag = nameTag(info.name, color); r.tag.position.y = 2.25; r.obj.add(r.tag);
    r.name = info.name;
  }
  return r;
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.obj);
  r.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  remotes.delete(id);
}
function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }

function updateRemotes(dt) {
  const renderT = net.serverNow() - INTERP_DELAY_MS;
  for (const r of remotes.values()) {
    const b = r.buf;
    if (!b.length) continue;
    while (b.length > 2 && b[1].t <= renderT) b.shift();
    let s;
    if (b.length >= 2 && b[0].t <= renderT && renderT <= b[1].t) {
      const a = b[0], c = b[1];
      const k = (renderT - a.t) / Math.max(1, c.t - a.t);
      s = { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, yaw: lerpAngle(a.yaw, c.yaw, k), pitch: a.pitch + (c.pitch - a.pitch) * k, flags: c.flags };
    } else s = b[b.length - 1];
    r.lastPos.copy(r.obj.position);
    r.obj.position.set(s.x, s.y, s.z);
    r.obj.rotation.y = s.yaw;
    r.flags = s.flags;
    const alive = (s.flags & 1) !== 0;
    r.alive = alive;
    const ud = r.obj.userData;
    const rig = ud.rig;
    ud.rifle.visible = !(s.flags & 4) && !(s.flags & 32);
    ud.shotgun.visible = !!(s.flags & 4);
    ud.deer.visible = !!(s.flags & 32);
    ud.gun.rotation.x = -s.pitch * 0.8;
    ud.armR.rotation.x = -1.15 - s.pitch * 0.8;
    ud.armL.rotation.x = -1.25 - s.pitch * 0.8;
    ud.head.rotation.x = -s.pitch * 0.5;
    if (r.flash > 0 || r.flashing) {
      r.flash = Math.max(0, (r.flash || 0) - dt);
      const on = r.flash > 0;
      if (on !== r.flashing) {
        r.obj.traverse((o) => {
          const m = o.isMesh && o.material; if (!m || !m.emissive) return;
          if (!m.userData.e0) m.userData.e0 = [m.emissive.clone(), m.emissiveIntensity];
          if (on) { m.emissive.set('#ff2020'); m.emissiveIntensity = 0.9; } else { m.emissive.copy(m.userData.e0[0]); m.emissiveIntensity = m.userData.e0[1]; }
        });
        r.flashing = on;
      }
    }
    r.flinch = Math.max(0, (r.flinch || 0) - dt * 6);
    if (!ud.mocap) ud.hips.rotation.x = -r.flinch * 0.18;
    const speed = r.lastPos.distanceTo(r.obj.position) / Math.max(dt, 0.001);
    r.walk += dt * Math.min(speed, 10) * 1.6;
    const swing = Math.sin(r.walk) * Math.min(speed / 6, 1) * 0.7;
    ud.legs[0].rotation.x = swing; ud.legs[1].rotation.x = -swing;
    r.speedS = (r.speedS || 0) * 0.85 + Math.min(speed, 12) * 0.15;   // smoothed for animation blending
    if (rig && rig.mixamo) {
      // movement relative to where they're facing → forward/back/strafe blend
      const dx = r.obj.position.x - r.lastPos.x, dz = r.obj.position.z - r.lastPos.z;
      const inv = 1 / Math.max(dt, 0.001), yaw = r.obj.rotation.y;
      const vx = dx * inv, vz = dz * inv;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      r.lv = r.lv || { f: 0, r: 0 };
      r.lv.f += ((vx * fx + vz * fz) - r.lv.f) * 0.25;
      r.lv.r += ((vx * -fz + vz * fx) - r.lv.r) * 0.25;
      const vy = (r.obj.position.y - r.lastPos.y) * inv;
      updateMixamo(rig, dt, r.lv, alive, s.pitch, Math.abs(vy) > 2.5);
    } else if (rig) animateRig(rig, alive ? r.speedS : 0, dt, s.pitch, alive);
    // death: fall over; spawn protection: blink
    r.fall = alive ? Math.max(0, r.fall - dt * 4) : Math.min(1, r.fall + dt * 3);
    if (!ud.mocap) { ud.hips.parent.rotation.x = -r.fall * Math.PI / 2; ud.hips.parent.position.y = r.fall * 0.25; }
    r.tag.visible = alive;
    r.obj.visible = alive || r.fall < 1 || (performance.now() % 1000) < 900;
    if (s.flags & 8) r.obj.visible = (performance.now() % 300) < 200;
  }
}

// ======================================================================= local movement
const stateObj = { pos: me.pos, vel: me.vel, onGround: false };
function updateLocal(dt, now) {
  if (!me.alive || !inMatch()) return;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const sdir = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  me.sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  me.sprinting = me.sprinting && f > 0;
  const speed = me.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  let wx = fx * f + rx * sdir, wz = fz * f + rz * sdir;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
  const accel = me.onGround ? 60 : 12;
  const dvx = wx - me.vel.x, dvz = wz - me.vel.z;
  const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
  if (dl > maxDv) { me.vel.x += (dvx / dl) * maxDv; me.vel.z += (dvz / dl) * maxDv; } else { me.vel.x = wx; me.vel.z = wz; }
  if (keys.has('Space') && me.onGround) { me.vel.y = PLAYER.jumpSpeed; me.onGround = false; sfx.jump(); }
  stateObj.onGround = me.onGround;
  const ev = stepPlayer(stateObj, dt, activeMap());
  me.onGround = stateObj.onGround;
  if (ev.bounced) sfx.boing();
  if (ev.landed) me.landT = 0.15;
  const moving = me.onGround && Math.hypot(me.vel.x, me.vel.z) > 1;
  if (moving) {
    const before = Math.floor(me.bob / Math.PI);
    me.bob += dt * (me.sprinting ? 13 : 9.5);
    if (Math.floor(me.bob / Math.PI) !== before) sfx.step(me.sprinting);
  }
  if (now - me.lastSend >= CLIENT_SEND_MS) {
    me.lastSend = now;
    net.send({ t: 'st', e: me.epoch, p: [+me.pos.x.toFixed(3), +me.pos.y.toFixed(3), +me.pos.z.toFixed(3)], yw: +me.yaw.toFixed(3), pt: +me.pitch.toFixed(3), sp: me.sprinting });
  }
}

function updateCamera(dt) {
  if (me.alive || !inMatch()) {
    const bobY = me.onGround ? Math.sin(me.bob * 2) * 0.04 * Math.min(1, Math.hypot(me.vel.x, me.vel.z) / 6) : 0;
    me.landT = Math.max(0, me.landT - dt);
    camera.position.set(me.pos.x, me.pos.y + PLAYER.eye + bobY - me.landT * 0.4, me.pos.z);
    // recoil recovers smoothly back to where you were aiming; shake decays fast
    me.kickPitch *= Math.exp(-dt * 11);
    me.kickYaw *= Math.exp(-dt * 11);
    me.shake = Math.max(0, me.shake - dt * 5);
    const sh = me.shake * me.shake * 0.012;
    camera.rotation.set(me.pitch + me.kickPitch + (Math.random() - 0.5) * sh, me.yaw + me.kickYaw + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.5);
    // crosshair bloom from movement + firing, tight when aiming
    me.bloom = Math.max(0, me.bloom - dt * 3.2);
    const move = Math.min(1, Math.hypot(me.vel.x, me.vel.z) / PLAYER.sprintSpeed) * (me.onGround ? 1 : 1.6);
    const gap = (4 + move * 9 + me.bloom * 10) * (1 - me.aimT * 0.7);
    const ch = $('crosshair').children;
    ch[0].style.transform = `translateY(${-gap}px)`; ch[1].style.transform = `translateY(${gap}px)`;
    ch[2].style.transform = `translateX(${-gap}px)`; ch[3].style.transform = `translateX(${gap}px)`;
  } else {
    // death cam: drift up and look down at where you fell
    const t = Math.min(1, (performance.now() - me.deathAt) / 1200);
    camera.position.set(me.pos.x, me.pos.y + 1.6 + t * 3.5, me.pos.z + t * 3);
    camera.lookAt(me.pos.x, me.pos.y + 0.5, me.pos.z);
  }
}

function updateViewmodel(dt, now) {
  // aim-down-sights: smooth zoom; sprinting or reloading drops aim
  const wantAim = me.ads && me.alive && inMatch() && !me.sprinting && !me.reloadUntil;
  me.aimT = clamp(me.aimT + (wantAim ? dt * 7 : -dt * 9), 0, 1);
  const scoped = me.weapon === 'deer' && me.aimT > 0.85;
  const zoomFov = me.weapon === 'deer' ? 22 : settings.fov * 0.72;
  const targetFov = settings.fov + (zoomFov - settings.fov) * me.aimT;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  $('scope').classList.toggle('hidden', !scoped);
  $('hud').classList.toggle('scoped', scoped);
  const showVm = me.alive && inMatch() && !scoped;
  viewmodel.visible = showVm;
  if (!showVm) return;
  for (const w of WEAPON_ORDER) vmGuns[w].visible = w === me.weapon;
  me.recoil = Math.max(0, me.recoil - dt * 6);
  me.swapT = Math.max(0, (me.swapT || 0) - dt);
  const speed = Math.hypot(me.vel.x, me.vel.z);
  const sway = Math.sin(me.bob) * 0.012 * Math.min(1, speed / 6);
  let reloadDip = 0;
  if (me.reloadUntil) {
    const total = WEAPONS[me.weapon].reloadMs;
    const left = me.reloadUntil - now;
    if (left <= 0) {
      me.reloadUntil = 0;
      me.ammo[me.weapon] = WEAPONS[me.weapon].mag;
      updateHudWeapon();
    } else reloadDip = Math.sin((1 - left / total) * Math.PI);
  }
  const a = me.aimT;
  viewmodel.position.set((0.2 + sway) * (1 - a), (-0.19 - Math.abs(sway)) * (1 - a) + (-0.11) * a - reloadDip * 0.18 - me.swapT * 0.8 + (me.sprinting ? -0.03 : 0), -0.42 + me.recoil * 0.05);
  viewmodel.rotation.set(me.recoil * 0.12 + reloadDip * 0.7, (me.sprinting ? 0.35 : 0) + reloadDip * 0.3, reloadDip * 0.4);
  muzzleFlash.position.copy(muzzleOffset(me.weapon)).multiply(new THREE.Vector3(1, 1, -1));
  if (muzzleFlash.visible) {
    muzzleFlash.userData.t -= dt;
    muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.8);
    if (muzzleFlash.userData.t <= 0) muzzleFlash.visible = false;
  }
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 120);
}

// ======================================================================= HUD
function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHudWeapon() {
  const w = WEAPONS[me.weapon];
  $('weapon-name').textContent = w.name;
  $('ammo-mag').textContent = me.reloadUntil ? '··' : me.ammo[me.weapon];
  $('ammo-max').textContent = w.mag;
  $('ammo').classList.toggle('reloading', !!me.reloadUntil);
  $('ammo').classList.toggle('low', me.ammo[me.weapon] <= Math.ceil(w.mag * 0.25));
  for (const el of document.querySelectorAll('#weapon-slots span')) el.classList.toggle('on', el.dataset.w === me.weapon);
}

function updateHudHp() {
  const hp = Math.max(0, me.hp);
  $('hp-fill').style.width = `${hp}%`;
  $('hp-fill').classList.toggle('low', hp <= 30);
  $('hp-text').textContent = hp;
}

let lastHudSec = -1;
function updateHud() {
  if (!S.room) return;
  const now = net.serverNow();
  let txt = '';
  if (S.phase === 'countdown') txt = fmtTime(S.room.starts - now);
  else if (S.phase === 'playing') txt = fmtTime(S.room.ends - now);
  else txt = '0:00';
  $('hud-timer').textContent = txt;
  if (S.phase === 'countdown') {
    const c = Math.ceil((S.room.starts - now) / 1000);
    $('centermsg').textContent = c > 0 ? String(c) : '';
    if (c !== lastHudSec && c > 0) { sfx.tone?.(440, 0.1, 0.12, 'sine'); lastHudSec = c; }
  } else if ($('centermsg').textContent && S.phase === 'playing' && $('centermsg').dataset.keep !== '1') {
    $('centermsg').textContent = '';
  }
  if (!me.alive && inMatch()) {
    const left = me.respawnAt - performance.now();
    $('dead-timer').textContent = left > 0 ? `Respawning in ${Math.ceil(left / 1000)}…` : 'Respawning…';
  }
}

function renderRoomHud() {
  const r = S.room;
  if (!r) return;
  $('hud-mode').textContent = `${getMap(r.cfg.map).name} · ${MODES[r.cfg.mode].name}`;
  let lead = 0;
  if (r.cfg.mode === 'tdm') {
    $('hud-teamscore').classList.remove('hidden');
    $('hud-teamscore').querySelector('.t1').textContent = `HOA ${r.ts[1] || 0}`;
    $('hud-teamscore').querySelector('.t2').textContent = `${r.ts[2] || 0} BACKROAD`;
    lead = Math.max(r.ts[1] || 0, r.ts[2] || 0);
  } else {
    $('hud-teamscore').classList.add('hidden');
    for (const p of r.players) lead = Math.max(lead, p.k);
  }
  $('hud-limit').textContent = `Lead ${lead}/${r.cfg.killLimit}`;
  const mine = playerInfo(S.myId);
  if (mine) { $('hud-k').textContent = mine.k; $('hud-d').textContent = mine.d; }
  if (scoreboardOpen) renderScoreboard();
}

function boardRows(players, highlight) {
  return players.map((p) => {
    const color = playerColor(p.id, p.team, mode());
    return `<tr class="${p.id === highlight ? 'me' : ''}"><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:6px"></span>${esc(p.name)}${p.c === false ? ' <small>(reconnecting)</small>' : ''}</td><td>${p.k}</td><td>${p.d}</td><td>${p.ping ?? ''}</td></tr>`;
  }).join('');
}

function renderScoreboard() {
  const r = S.room;
  if (!r) return;
  const sorted = [...r.players].sort((a, b) => (b.k - a.k) || (a.d - b.d));
  let html = `<h3>${esc(getMap(r.cfg.map).name)} — ${esc(MODES[r.cfg.mode].name)}</h3>`;
  const head = '<tr><th>NEIGHBOR</th><th>K</th><th>D</th><th>PING</th></tr>';
  if (r.cfg.mode === 'tdm') {
    for (const t of TEAMS) {
      html += `<div class="eyebrow" style="color:${t.color};margin-top:8px">${esc(t.name)} — ${r.ts[t.id] || 0}</div><table>${head}${boardRows(sorted.filter((p) => p.team === t.id), S.myId)}</table>`;
    }
  } else html += `<table>${head}${boardRows(sorted, S.myId)}</table>`;
  $('scoreboard').innerHTML = html;
  $('scoreboard').classList.remove('hidden');
}

function feed(html, mine = false) {
  const d = document.createElement('div');
  d.innerHTML = html;
  if (mine) d.classList.add('mine');
  $('killfeed').prepend(d);
  while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}

function announce(msg, hoa = false) {
  const d = document.createElement('div');
  d.textContent = msg;
  if (hoa) d.classList.add('hoa');
  $('announce').innerHTML = '';
  $('announce').appendChild(d);
  setTimeout(() => { if (d.parentNode) d.remove(); }, hoa ? 6500 : 4000);
  if (settings.voice && 'speechSynthesis' in window) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(msg); u.rate = 1.05; u.volume = settings.vol; speechSynthesis.speak(u); } catch { /* no voice */ }
  }
}

function popup(text, cls = '') {
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  $('popups').appendChild(d);
  while ($('popups').children.length > 3) $('popups').firstChild.remove();
  setTimeout(() => d.remove(), 1300);
}

function flashRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  r.flash = 0.12;
  r.flinch = 1;
  if (r.obj.userData.rig && r.obj.userData.rig.mixamo) hitMixamo(r.obj.userData.rig);
}

function hitmarker(kind) {
  const h = $('hitmarker');
  h.className = '';
  void h.offsetWidth;
  h.classList.add('show');
  if (kind) h.classList.add(kind);
}

function damageIndicator(fromX, fromZ) {
  const ang = Math.atan2(fromX - me.pos.x, fromZ - me.pos.z);
  const rel = -(ang - Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw)));
  const d = document.createElement('div');
  d.style.transform = `rotate(${rel}rad)`;
  $('dmg-indicators').appendChild(d);
  setTimeout(() => d.remove(), 1200);
  const v = $('damage-vignette');
  v.style.opacity = '1';
  setTimeout(() => { v.style.opacity = String(me.hp < 35 ? 0.6 : 0); }, 180);
}

function chatLine(m) {
  const color = playerColor(m.id, m.team, mode());
  const html = `<b style="color:${color}">${esc(m.name)}:</b> ${esc(m.m)}`;
  const a = document.createElement('div'); a.innerHTML = html; $('lobby-chatlog').appendChild(a);
  $('lobby-chatlog').scrollTop = 1e6;
  const b = document.createElement('div'); b.innerHTML = html; $('chatlog').appendChild(b);
  while ($('chatlog').children.length > 6) $('chatlog').firstChild.remove();
}

// ======================================================================= lobby UI
const htmlCache = new Map();
function setHtml(id, html) {
  // only touch the DOM when content changed, so clicks and open dropdowns aren't interrupted
  if (htmlCache.get(id) === html) return false;
  htmlCache.set(id, html);
  $(id).innerHTML = html;
  return true;
}
function renderLobby() {
  const r = S.room;
  if (!r) return;
  const isHost = r.host === S.myId;
  $('lobby-code').textContent = r.code;
  $('pause-code').textContent = r.code;
  // map vote
  const v = r.vote;
  const myVote = v.mine ? v.mine[S.myId] : null;
  setHtml('lobby-vote', v.opts.map((id) => {
    const m = MAPS[id];
    return `<button class="vote-card ${myVote === id ? 'mine' : ''}" data-map="${id}">
      <div class="vname">${esc(m.name)}</div>
      <div class="vfac ${m.faction}">${m.faction === 'suburban' ? 'SUBURBAN TURF' : 'COUNTRY TURF'}</div>
      <div class="vblurb">${esc(m.blurb || '')}</div>
      <div class="vcount">${v.tally[id] || 0}</div></button>`;
  }).join(''));
  // config
  const dis = isHost ? '' : 'disabled';
  const cfgChanged = setHtml('lobby-config', `
    <label>Mode<select id="cfg-mode" ${dis}>${Object.values(MODES).map((m) => `<option value="${m.id}" ${r.cfg.mode === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
    <label>Kill limit<select id="cfg-kills" ${dis}>${KILL_LIMITS.map((k) => `<option ${r.cfg.killLimit === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label>Time limit<select id="cfg-time" ${dis}>${TIME_LIMITS_MIN.map((t) => `<option value="${t}" ${r.cfg.timeLimitMin === t ? 'selected' : ''}>${t} min</option>`).join('')}</select></label>
    <label>Players<select disabled><option>${r.players.length} / 8</option></select></label>`);
  if (isHost && cfgChanged) {
    const send = () => net.send({ t: 'cfg', mode: $('cfg-mode').value, killLimit: Number($('cfg-kills').value), timeLimitMin: Number($('cfg-time').value) });
    $('cfg-mode').onchange = send; $('cfg-kills').onchange = send; $('cfg-time').onchange = send;
  }
  $('lobby-teams').classList.toggle('hidden', r.cfg.mode !== 'tdm');
  setHtml('lobby-players', r.players.map((p) => {
    const color = playerColor(p.id, p.team, r.cfg.mode);
    const team = r.cfg.mode === 'tdm' ? `<span class="you">${p.team === 2 ? 'Backroad Boys' : 'Pristine Pines HOA'}</span>` : '';
    return `<li><span class="swatch" style="background:${color}"></span>${esc(p.name)} ${p.id === r.host ? '<span class="tag">HOST</span>' : ''} ${p.id === S.myId ? '<span class="you">(you)</span>' : ''} ${team}
      <span class="ping">${p.c === false ? 'reconnecting…' : (p.ping ? p.ping + ' ms' : '')}</span></li>`;
  }).join(''));
  const startBtn = $('btn-start');
  startBtn.disabled = !isHost;
  startBtn.textContent = isHost ? 'Start Match' : 'Waiting for host…';
}

// ======================================================================= network handlers
net.on('status', (s) => {
  const dot = $('server-dot'), txt = $('server-status');
  dot.className = 'dot' + (s === 'open' ? ' ok' : s === 'closed' ? ' bad' : '');
  txt.textContent = s === 'open' ? 'Connected to the neighborhood' : s === 'connecting' ? 'Connecting to the neighborhood…' : 'Server unreachable — retrying…';
  $('lobby-dot').className = 'dot' + (s === 'open' ? ' ok' : ' bad');
  $('lobby-status').textContent = s === 'open' ? 'Connected' : 'Reconnecting…';
  if (s !== 'open') S.helloed = false;
});

let connLostAt = 0;
net.on('close', () => {
  if (S.inRoom) {
    if (!connLostAt) connLostAt = Date.now();
    if (locked()) document.exitPointerLock();
    $('conn-eyebrow').textContent = 'CONNECTION LOST';
    $('conn-title').textContent = 'Reconnecting…';
    $('conn-text').textContent = 'Hang tight — trying to get you back into your match.';
    show('conn');
    if (Date.now() - connLostAt > 25000) {
      $('conn-title').textContent = 'Could not reconnect';
      $('conn-text').textContent = 'The server may be waking up or restarting. You can keep waiting or go back to the menu.';
    }
  }
});

net.on('hello', (m) => {
  S.helloed = true;
  const sess = session.get();
  if (sess && sess.code && sess.token) {
    net.send({ t: 'rejoin', code: sess.code, token: sess.token });
  } else if (S.pending) {
    net.send(S.pending);
    S.pending = null;
  }
  void m;
});

net.on('joined', (m) => {
  connLostAt = 0;
  S.myId = m.id; S.code = m.code; S.inRoom = true;
  session.set({ code: m.code, token: m.token });
  S.pending = null;
  history.replaceState(null, '', `?room=${m.code}`);
  // the following 'room' message decides which screen to show
});

net.on('room', (m) => {
  const prev = S.phase;
  S.room = m;
  S.phase = m.phase;
  if (m.cfg.map !== currentMapId) {
    loadMap(m.cfg.map);
  }
  // drop remotes who left
  for (const id of [...remotes.keys()]) if (!m.players.some((p) => p.id === id && p.c !== false)) removeRemote(id);
  renderLobby();
  renderRoomHud();
  if (m.phase === 'lobby') {
    if (prev !== 'lobby' || screen === 'menu' || screen === 'loading' || screen === 'end' || screen === 'conn') {
      if (locked()) document.exitPointerLock();
      me.alive = false;
      clearRemotes();
      show('lobby');
    }
  } else if (m.phase === 'countdown' || m.phase === 'playing') {
    if (!(prev === 'countdown' || prev === 'playing') || ['lobby', 'menu', 'end', 'conn', 'loading'].includes(screen)) {
      $('dead').classList.add('hidden');
      if (locked()) hideScreens(); else show('click-to-play');
    }
  }
});

net.on('spawn', (m) => {
  if (m.id === S.myId) {
    me.epoch = m.e;
    me.pos.set(m.p[0], m.p[1], m.p[2]);
    me.vel.set(0, 0, 0);
    me.yaw = m.yw; me.pitch = 0;
    me.alive = true;
    me.hp = 100;
    me.reloadUntil = 0;
    me.ammo = fullAmmo();
    $('dead').classList.add('hidden');
    updateHudHp(); updateHudWeapon();
  } else {
    const r = ensureRemote(m.id);
    r.buf = [{ t: net.serverNow() - 1000, x: m.p[0], y: m.p[1], z: m.p[2], yaw: m.yw, pitch: 0, flags: 9 }];
    r.fall = 0;
    r.obj.position.set(m.p[0], m.p[1], m.p[2]);
  }
});

net.on('snap', (m) => {
  for (const e of m.p) {
    const [id, x, y, z, yaw, pitch, flags] = e;
    if (id === S.myId) continue;
    const r = ensureRemote(id);
    r.buf.push({ t: m.ts, x, y, z, yaw, pitch, flags });
    if (r.buf.length > 30) r.buf.shift();
  }
});

net.on('you', (m) => {
  me.hp = m.hp;
  if (m.w && m.w !== me.weapon) me.weapon = m.w;
  if (m.ammo) {
    // keep local predicted ammo unless the server says we have less
    for (const k of Object.keys(m.ammo)) if (!me.reloadUntil) me.ammo[k] = m.ammo[k];
  }
  if (m.rl) me.reloadUntil = performance.now() + m.rl;
  else if (me.reloadUntil && m.ammo && m.ammo[me.weapon] === WEAPONS[me.weapon].mag) { me.reloadUntil = 0; me.ammo[me.weapon] = m.ammo[me.weapon]; }
  if (m.alive === false && me.alive && inMatch()) die(0);
  updateHudHp(); updateHudWeapon();
});

net.on('corr', (m) => {
  me.epoch = m.e;
  me.pos.set(m.p[0], m.p[1], m.p[2]);
  me.vel.set(0, 0, 0);
});

net.on('fired', (m) => {
  if (!me.reloadUntil) me.ammo[me.weapon] = Math.min(me.ammo[me.weapon], m.ammo);
  if (m.hit > 0) {
    hitmarker(m.k ? 'kill' : m.hd ? 'head' : '');
    if (!m.k) sfx.hit(m.hd);
    for (const id of m.v || []) flashRemote(id);
    for (const e of m.ends) if (e[3] === 1) impact({ x: e[0], y: e[1], z: e[2] }, 1);
  }
  updateHudWeapon();
});

net.on('rej', () => { /* server rejected a shot (e.g. cooldown); ammo resyncs via 'you'/'fired' */ });

net.on('shot', (m) => {
  const r = remotes.get(m.id);
  const from = new THREE.Vector3(m.o[0], m.o[1] - 0.25, m.o[2]);
  if (r) {
    const fwd = new THREE.Vector3(-Math.sin(r.obj.rotation.y), 0, -Math.cos(r.obj.rotation.y));
    from.addScaledVector(fwd, 0.6);
  }
  for (const e of m.h) {
    _to.set(e[0], e[1], e[2]);
    tracer(from, _to);
    impact(_to, e[3]);
  }
  const dist = from.distanceTo(camera.position);
  const rel = new THREE.Vector3().subVectors(from, camera.position).applyQuaternion(camera.quaternion.clone().invert());
  sfx.shot(m.w, dist, clamp(rel.x / Math.max(1, dist), -1, 1));
});

net.on('dmg', (m) => {
  me.hp = m.hp;
  updateHudHp();
  damageIndicator(m.from[0], m.from[1]);
  me.shake = Math.min(1, me.shake + 0.7);
  sfx.hurt();
});

function die(killerId) {
  me.alive = false;
  me.deathAt = performance.now();
  me.respawnAt = performance.now() + RESPAWN_MS;
  me.reloadUntil = 0;
  mouseDown = false;
  me.killerId = killerId;
  $('dead').classList.remove('hidden');
}

net.on('kill', (m) => {
  const mineK = m.k === S.myId, mineV = m.v === S.myId;
  const kc = playerColor(m.k, playerInfo(m.k)?.team, mode());
  const vc = playerColor(m.v, playerInfo(m.v)?.team, mode());
  feed(`<b style="color:${kc}">${esc(m.kn)}</b> <span class="verb">${esc(m.verb)}</span> <b style="color:${vc}">${esc(m.vn)}</b> ${m.hd ? '🎯' : ''} <small>[${{ shotgun: 'ENFORCER', deer: 'DEER RIFLE' }[m.w] || 'BLASTER'}]</small>`, mineK || mineV);
  if (mineV) {
    die(m.k);
    $('dead-by').innerHTML = `You were ${esc(m.pverb || m.verb)} by <b>${esc(m.kn)}</b>${m.hd ? ' (headshot)' : ''}.`;
    $('dead-fine').textContent = `Fine issued: $${m.fine}. Payable to the HOA within 30 days.`;
  }
  if (mineK) {
    hitmarker('kill'); sfx.kill(m.hd);
    const ki = $('killicon'); ki.className = ''; void ki.offsetWidth; ki.className = 'show';
    popup(`+100 ${m.vn.toUpperCase()} ${m.verb.split(' ')[0].toUpperCase()}`, 'big');
    if (m.hd) popup('HEADSHOT +50', 'head');
    const me2 = playerInfo(S.myId); if (me2 && (me2.k + 1) % 3 === 0) popup(`${me2.k + 1} KILL STREAK`);
  }
  const r = remotes.get(m.v);
  if (r) { r.alive = false; burst(r.obj.position.x, r.obj.position.y + 1.2, r.obj.position.z, ['#ffffff', '#fde68a', '#fecaca', '#bbf7d0'], 22, 5, 1.4); }
});

net.on('ann', (m) => announce(m.msg, !!m.hoa));
net.on('feed', (m) => feed(`<i>${esc(m.msg)}</i>`));
net.on('chat', (m) => chatLine(m));
net.on('gone', (m) => removeRemote(m.id));

net.on('end', (m) => {
  S.lastEnd = m;
  if (locked()) document.exitPointerLock();
  const w = m.winner || { type: 'tie' };
  let title, sub;
  if (w.type === 'team') {
    title = `${w.name} win!`;
    sub = w.team === 1 ? 'The HOA has approved this outcome. Unanimously.' : 'Property values have officially plummeted. Yeehaw.';
  } else if (w.type === 'player') {
    title = w.id === S.myId ? 'You are Neighbor of the Month!' : `${w.name} is Neighbor of the Month!`;
    sub = 'Their lawn will be featured in the next newsletter.';
  } else {
    title = "It's a tie.";
    sub = 'The HOA will decide in committee. Expect a ruling in 6–8 weeks.';
  }
  $('end-title').textContent = title;
  $('end-sub').textContent = sub;
  $('end-board').innerHTML = `<tr><th>NEIGHBOR</th><th>KILLS</th><th>DEATHS</th></tr>` + m.board.map((p) => {
    const color = playerColor(p.id, p.team, mode());
    return `<tr class="${p.id === S.myId ? 'me' : ''}"><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:6px"></span>${esc(p.name)}</td><td>${p.k}</td><td>${p.d}</td></tr>`;
  }).join('');
  const isHost = S.room && S.room.host === S.myId;
  $('btn-rematch').classList.toggle('hidden', !isHost);
  $('btn-to-lobby').classList.toggle('hidden', !isHost);
  $('end-wait').classList.toggle('hidden', isHost);
  me.alive = false;
  $('dead').classList.add('hidden');
  sfx.ding();
  show('end');
});

net.on('left', () => backToMenu());

net.on('error', (m) => {
  if (m.code === 'norejoin') {
    session.clear();
    S.inRoom = false;
    if (S.pending) { net.send(S.pending); S.pending = null; return; }
    if (screen === 'conn' || screen === 'loading') backToMenu('Your previous match ended while you were away.');
    return;
  }
  if (m.code === 'shutdown') { toast(m.msg, 5000); return; }
  if (screen === 'menu' || screen === 'loading') {
    $('menu-error').textContent = m.msg;
    $('menu-error').classList.remove('hidden');
    $('server-status').textContent = 'Connected to the neighborhood';
  } else toast(m.msg);
});

function backToMenu(msg) {
  if (locked()) document.exitPointerLock();
  session.clear();
  S.inRoom = false; S.room = null; S.phase = 'none'; S.myId = 0;
  me.alive = false;
  clearRemotes();
  history.replaceState(null, '', location.pathname);
  show('menu');
  if (msg) { $('menu-error').textContent = msg; $('menu-error').classList.remove('hidden'); }
}

function leaveRoom() {
  net.send({ t: 'leave' });
  backToMenu();
}

// ======================================================================= buttons
function openPause() {
  if (!inMatch()) return;
  show('pause');
}
$('btn-play').onclick = () => act({ t: 'quick' });
$('btn-create').onclick = () => act({ t: 'create' });
$('btn-join').onclick = () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) { $('menu-error').textContent = 'Enter the 4-letter room code your host gave you.'; $('menu-error').classList.remove('hidden'); return; }
  act({ t: 'join', code });
};
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-copy-code').onclick = () => copy(S.code, 'Room code copied');
$('btn-copy-link').onclick = () => copy(`${location.origin}${location.pathname}?room=${S.code}`, 'Invite link copied — send it to your friends');
function copy(text, msg) {
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(text));
  else { toast(text, 6000); }
}
$('btn-leave').onclick = leaveRoom;
$('btn-start').onclick = () => net.send({ t: 'start' });
$('lobby-vote').addEventListener('click', (e) => {
  const card = e.target.closest('.vote-card');
  if (card) net.send({ t: 'vote', map: card.dataset.map });
});
for (const b of document.querySelectorAll('.team-btn')) b.onclick = () => net.send({ t: 'team', team: Number(b.dataset.team) });
$('lobby-chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { sendChat(e.target.value); e.target.value = ''; }
});
$('btn-enter').onclick = requestLock;
$('btn-resume').onclick = requestLock;
$('btn-pause-leave').onclick = leaveRoom;
$('btn-rematch').onclick = () => net.send({ t: 'start' });
$('btn-to-lobby').onclick = () => net.send({ t: 'lobby' });
$('btn-end-leave').onclick = leaveRoom;
$('btn-conn-menu').onclick = () => { leaveRoom(); };

// settings modal
const setIds = { sens: 'set-sens', fov: 'set-fov', vol: 'set-vol', invert: 'set-invert', voice: 'set-voice', shadows: 'set-shadows', scale: 'set-scale', quality: 'set-quality', fps: 'set-fps' };
function syncSettingsUi() {
  for (const [k, id] of Object.entries(setIds)) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k];
  }
  $('out-sens').textContent = Number(settings.sens).toFixed(2);
  $('out-fov').textContent = settings.fov;
  $('out-vol').textContent = Math.round(settings.vol * 100) + '%';
}
for (const [k, id] of Object.entries(setIds)) {
  $(id).addEventListener('input', (e) => {
    const el = e.target;
    settings[k] = el.type === 'checkbox' ? el.checked : (k === 'quality' ? el.value : Number(el.value));
    saveSettings();
    syncSettingsUi();
    if (k === 'quality') {
      applyRenderSettings();
      buildViewmodels();
      const id2 = currentMapId; currentMapId = null; loadMap(id2 || 'culdesac');
      for (const id3 of [...remotes.keys()]) ensureRemote(id3);
    } else applyRenderSettings();
  });
}
let settingsReturn = null;
function openSettings() { settingsReturn = screen; syncSettingsUi(); $('settings').classList.remove('hidden'); }
$('btn-settings').onclick = openSettings;
$('btn-pause-settings').onclick = openSettings;
$('btn-settings-close').onclick = () => { $('settings').classList.add('hidden'); void settingsReturn; };
$('btn-howto').onclick = () => $('howto').classList.remove('hidden');
$('btn-howto-close').onclick = () => $('howto').classList.add('hidden');

// ======================================================================= main loop
let last = performance.now(), fpsAcc = 0, fpsFrames = 0, lowFpsTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (mouseDown) tryFire(now);
  updateLocal(dt, now);
  updateCamera(dt);
  updateRemotes(dt);
  updateViewmodel(dt, now);
  updateParticles(dt);
  updateTracers(dt);
  updateHud();

  // menu backdrop: slow orbit over the map
  if (!inMatch()) {
    const t = now / 1000 * 0.05;
    camera.position.set(Math.cos(t) * 45, 22, Math.sin(t) * 45);
    camera.lookAt(0, 0, -4);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (viewmodel.visible) {
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    const fps = Math.round(fpsFrames / fpsAcc);
    if (settings.fps) $('fps').textContent = `${fps} FPS · ${renderer.info.render.calls} draws`;
    // auto-protect low-end PCs: if a match is running below ~35 fps for 6s, drop to Low
    if (inMatch() && fps < 35 && settings.quality === 'high') {
      lowFpsTime += fpsAcc;
      if (lowFpsTime > 6) {
        settings.quality = 'low'; settings.shadows = false; saveSettings(); syncSettingsUi();
        applyRenderSettings(); buildViewmodels();
        const id2 = currentMapId; currentMapId = null; loadMap(id2);
        for (const id3 of [...remotes.keys()]) ensureRemote(id3);
        toast('Switched to Low graphics to keep things smooth (change in Settings)', 5000);
        lowFpsTime = 0;
      }
    } else lowFpsTime = 0;
    fpsAcc = 0; fpsFrames = 0;
  }
}

// ======================================================================= boot
async function boot() {
  const fill = $('loading-fill'), text = $('loading-text');
  const step = (pct, msg) => { fill.style.width = pct + '%'; text.textContent = msg; return new Promise((r) => setTimeout(r, 30)); };
  try {
    await step(10, 'Measuring lawns to regulation height…');
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    applyRenderSettings();
    resize();
    await Promise.race([loadGuns(), new Promise((r) => setTimeout(r, 6000))]);
    // image-based lighting so metal, skin and cloth pick up soft reflections
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    vmScene.environment = env; scene.environment = env; scene.environmentIntensity = 0.35;
    buildViewmodels();
    await step(25, 'Hiring neighbors (loading characters)…');
    await Promise.race([loadRig(), new Promise((r) => setTimeout(r, 8000))]);
    await step(45, 'Building houses (permits pending)…');
    loadMap('culdesac');
    await step(80, 'Parking oversized SUVs…');
    renderer.compile(scene, camera);
    await step(100, 'Ready.');
  } catch (e) {
    console.error(e);
    text.textContent = 'Your browser could not start WebGL. Try Chrome, Edge or Firefox with hardware acceleration on.';
    return;
  }
  $('name-input').value = store.get('sw_name', '');
  const q = new URLSearchParams(location.search).get('room');
  if (q) {
    $('join-code').value = q.toUpperCase().slice(0, 4);
    $('btn-join').classList.add('primary');
  }
  updateHudHp(); updateHudWeapon();
  requestAnimationFrame(frame);
  net.connect();
  const sess = session.get();
  if (sess && sess.token) {
    $('loading-text').textContent = 'Rejoining your match…';
    setTimeout(() => { if (screen === 'loading') show('menu'); }, 4000);
  } else show('menu');
}

// expose a tiny debug hook for automated tests
window.__sw = { S, me, net, remotes, get screen() { return screen; } };
boot();
