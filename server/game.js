// Authoritative game logic: rooms, players, validation, combat and the match loop.
// Transport-agnostic: a "conn" only needs send(text), close(code, reason), ip and
// EventEmitter-style 'message'/'close' events.

import { randomBytes, randomInt } from 'node:crypto';
import {
  PROTOCOL_VERSION, TICK_MS, PLAYER, RESPAWN_MS, SPAWN_PROTECT_MS, MAX_PLAYERS, NAME_MAX, CHAT_MAX,
  WEAPONS, WEAPON_ORDER, ADS_SPREAD_MULT, fullAmmo, MODES, TEAMS, KILL_LIMITS, TIME_LIMITS_MIN, DEFAULT_CONFIG, COUNTDOWN_MS,
  MAX_REWIND_MS, INTERP_DELAY_MS, MOVE_SLACK, MOVE_FLAT_TOLERANCE,
} from '../client/shared/constants.js';
import { MAPS, MAP_ORDER, getMap, ANNOUNCEMENTS, KILL_VERBS } from '../client/shared/map.js';
import { isInsideSolid, raycastMap, rayPlayer } from '../client/shared/physics.js';

void WEAPON_ORDER;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MSG_CHARS = 4096;
const MAX_ROOMS = 500;
const HISTORY_MS = 1200;
const FIRE_JITTER_MS = 60;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const pick = (arr) => arr[randomInt(arr.length)];

export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!s) s = `Neighbor ${randomInt(100, 1000)}`;
  return s;
}

function sanitizeChat(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);
}

function vec3(a) {
  if (!Array.isArray(a) || a.length !== 3 || !a.every(isNum)) return null;
  return { x: a[0], y: a[1], z: a[2] };
}

export class GameServer {
  constructor(opts = {}) {
    this.reconnectGraceMs = opts.reconnectGraceMs ?? 30000;
    this.log = opts.log ?? (() => {});
    this.rooms = new Map();
    this.nextId = 1;
    this.clients = new Set();
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try { this.tick(); } catch (e) { this.log('tick error', e); }
    }, TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.players.size;
    return { rooms: this.rooms.size, players, connections: this.clients.size };
  }

  // ------------------------------------------------------------------ connections
  handleConnection(conn) {
    const client = {
      conn,
      player: null,
      helloed: false,
      name: '',
      tokens: 100,
      lastRefill: Date.now(),
      drops: 0,
      lastChat: 0,
    };
    this.clients.add(client);
    conn.on('message', (text) => this.onMessage(client, text));
    conn.on('close', () => this.onClose(client));
  }

  send(conn, msg) {
    if (!conn) return;
    conn.send(JSON.stringify(msg));
  }

  rateOk(client) {
    const now = Date.now();
    client.tokens = Math.min(120, client.tokens + ((now - client.lastRefill) / 1000) * 80);
    client.lastRefill = now;
    if (client.tokens < 1) {
      client.drops++;
      if (client.drops > 400) client.conn.close(1008, 'Rate limit exceeded');
      return false;
    }
    client.tokens -= 1;
    if (client.drops > 0) client.drops -= 0.05;
    return true;
  }

  onMessage(client, text) {
    if (typeof text !== 'string' || text.length > MAX_MSG_CHARS) return;
    if (!this.rateOk(client)) return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    try {
      this.dispatch(client, m);
    } catch (e) {
      this.log('handler error', m.t, e);
      this.send(client.conn, { t: 'error', msg: 'Server error handling request.' });
    }
  }

  dispatch(client, m) {
    if (m.t === 'ping') {
      if (client.player && isNum(m.r)) client.player.rtt = clamp(m.r, 0, 2000);
      return this.send(client.conn, { t: 'pong', c: isNum(m.c) ? m.c : 0, s: Date.now() });
    }
    if (m.t === 'hello') {
      if (m.v !== PROTOCOL_VERSION) {
        this.send(client.conn, { t: 'error', code: 'version', msg: 'Game was updated. Please refresh the page.' });
        return;
      }
      client.helloed = true;
      client.name = sanitizeName(m.name);
      return this.send(client.conn, { t: 'hello', name: client.name, s: Date.now() });
    }
    if (!client.helloed) return;

    const p = client.player;
    switch (m.t) {
      case 'create': return this.cmdCreate(client, !!m.pub);
      case 'join': return this.cmdJoin(client, m.code);
      case 'quick': return this.cmdQuick(client);
      case 'rejoin': return this.cmdRejoin(client, m.code, m.token);
      case 'name': client.name = sanitizeName(m.name); if (p) { p.name = client.name; this.broadcastRoom(p.room); } return;
    }
    if (!p) return;
    switch (m.t) {
      case 'leave': return this.removePlayer(p, 'left');
      case 'st': return this.onState(p, m);
      case 'f': return this.onFire(p, m);
      case 'r': return this.onReload(p);
      case 'w': return this.onWeapon(p, m.w);
      case 'cfg': return this.onConfig(p, m);
      case 'team': return this.onTeam(p, m.team);
      case 'start': return this.onStart(p);
      case 'lobby': return this.onToLobby(p);
      case 'chat': return this.onChat(client, p, m.m);
      case 'vote': return this.onVote(p, m.map);
      default: return undefined;
    }
  }

  onClose(client) {
    this.clients.delete(client);
    const p = client.player;
    if (!p || p.client !== client) return;
    p.client = null;
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.alive = false;
    this.broadcastRoom(p.room);
    this.roomEvent(p.room, { t: 'feed', msg: `${p.name} lost connection` });
  }

  // ------------------------------------------------------------------ rooms
  makeCode() {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let j = 0; j < 4; j++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('no room codes left');
  }

  createRoom(pub) {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const room = {
      code: this.makeCode(),
      pub,
      hostId: 0,
      players: new Map(),
      phase: 'lobby',
      config: { ...DEFAULT_CONFIG },
      startsAt: 0,
      endsAt: 0,
      winner: null,
      teamScore: { 1: 0, 2: 0 },
      nextAnnounceAt: 0,
      firstBlood: false,
      createdAt: Date.now(),
      lastRoomBroadcast: 0,
      vote: null,
    };
    this.newVote(room);
    this.rooms.set(room.code, room);
    this.log(`room ${room.code} created (${pub ? 'public' : 'private'})`);
    return room;
  }

  cmdCreate(client, pub) {
    if (client.player) this.removePlayer(client.player, 'switched');
    const room = this.createRoom(pub);
    if (!room) return this.send(client.conn, { t: 'error', code: 'full', msg: 'Server is at capacity. Try again soon.' });
    this.addPlayer(client, room);
  }

  cmdJoin(client, rawCode) {
    const code = typeof rawCode === 'string' ? rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';
    const room = this.rooms.get(code);
    if (!room) return this.send(client.conn, { t: 'error', code: 'noroom', msg: `No room with code "${code || '?'}". Check the code with your host.` });
    if (client.player && client.player.room === room) return this.sendRoomTo(client.player);
    if (room.players.size >= MAX_PLAYERS) return this.send(client.conn, { t: 'error', code: 'roomfull', msg: `Room ${code} is full (${MAX_PLAYERS} max).` });
    if (client.player) this.removePlayer(client.player, 'switched');
    this.addPlayer(client, room);
  }

  cmdQuick(client) {
    let best = null;
    for (const r of this.rooms.values()) {
      if (!r.pub || r.players.size >= MAX_PLAYERS) continue;
      if (!best || r.players.size > best.players.size) best = r;
    }
    if (!best) return this.cmdCreate(client, true);
    if (client.player) this.removePlayer(client.player, 'switched');
    this.addPlayer(client, best);
  }

  cmdRejoin(client, code, token) {
    const room = typeof code === 'string' ? this.rooms.get(code.toUpperCase()) : null;
    const p = room && typeof token === 'string'
      ? [...room.players.values()].find((x) => x.token === token)
      : null;
    if (!p) return this.send(client.conn, { t: 'error', code: 'norejoin', msg: 'Your previous session expired.' });
    if (p.client && p.client !== client) {
      const old = p.client;
      old.player = null;
      old.conn.close(4000, 'Session resumed elsewhere');
    }
    if (client.player && client.player !== p) this.removePlayer(client.player, 'switched');
    p.client = client;
    p.conn = client.conn;
    p.connected = true;
    p.disconnectedAt = 0;
    client.player = p;
    client.name = p.name;
    this.send(p.conn, { t: 'joined', id: p.id, token: p.token, code: room.code, s: Date.now() });
    this.broadcastRoom(room);
    if (room.phase === 'countdown' || room.phase === 'playing') this.spawn(p);
    else this.sendYou(p);
    this.sendSnapshotTo(room, p);
    this.roomEvent(room, { t: 'feed', msg: `${p.name} reconnected` });
  }

  addPlayer(client, room) {
    const id = this.nextId++;
    const p = {
      id,
      token: randomBytes(16).toString('hex'),
      name: client.name,
      room,
      client,
      conn: client.conn,
      connected: true,
      disconnectedAt: 0,
      team: 0,
      kills: 0,
      deaths: 0,
      alive: false,
      hp: PLAYER.maxHp,
      pos: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      sprint: false,
      epoch: 0,
      lastStateAt: Date.now(),
      history: [],
      weapon: 'rifle',
      ammo: fullAmmo(),
      reloadUntil: 0,
      nextFireAt: 0,
      respawnAt: 0,
      invulnUntil: 0,
      streak: 0,
      lastKillAt: 0,
      multi: 0,
      rtt: 80,
      violations: 0,
      joinedAt: Date.now(),
    };
    p.team = this.pickTeam(room);
    room.players.set(id, p);
    client.player = p;
    if (!room.hostId || !room.players.has(room.hostId)) room.hostId = id;
    this.send(p.conn, { t: 'joined', id, token: p.token, code: room.code, s: Date.now() });
    this.broadcastRoom(room);
    this.roomEvent(room, { t: 'feed', msg: `${p.name} moved into the neighborhood` }, p);
    if (room.phase === 'countdown' || room.phase === 'playing') {
      this.spawn(p); // late join drops straight into the action
      this.sendSnapshotTo(room, p);
    } else if (room.phase === 'ended') {
      this.send(p.conn, this.endMessage(room));
    }
  }

  pickTeam(room) {
    let a = 0, b = 0;
    for (const q of room.players.values()) { if (q.team === 1) a++; else if (q.team === 2) b++; }
    return a <= b ? 1 : 2;
  }

  removePlayer(p, reason) {
    const room = p.room;
    if (!room.players.has(p.id)) return;
    room.players.delete(p.id);
    if (p.client) {
      p.client.player = null;
      if (reason === 'left') this.send(p.conn, { t: 'left' });
    }
    p.client = null;
    p.conn = null;
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      this.log(`room ${room.code} closed (empty)`);
      return;
    }
    if (room.hostId === p.id) {
      const next = [...room.players.values()].sort((a, b) => (b.connected - a.connected) || (a.joinedAt - b.joinedAt))[0];
      room.hostId = next.id;
      this.roomEvent(room, { t: 'feed', msg: `${next.name} is now the HOA president (host)` });
    }
    this.roomEvent(room, { t: 'gone', id: p.id });
    this.roomEvent(room, { t: 'feed', msg: `${p.name} ${reason === 'timeout' ? 'was evicted (connection lost)' : 'moved away'}` });
    this.broadcastRoom(room);
  }

  roomEvent(room, msg, except = null) {
    const s = JSON.stringify(msg);
    for (const q of room.players.values()) if (q !== except && q.conn) q.conn.send(s);
  }

  roomState(room) {
    return {
      t: 'room',
      code: room.code,
      pub: room.pub,
      host: room.hostId,
      phase: room.phase,
      cfg: room.config,
      starts: room.startsAt,
      ends: room.endsAt,
      ts: room.teamScore,
      s: Date.now(),
      vote: { opts: room.vote.opts, tally: this.tally(room), mine: Object.fromEntries(room.vote.votes) },
      players: [...room.players.values()].map((q) => ({
        id: q.id, name: q.name, team: q.team, k: q.kills, d: q.deaths, ping: Math.round(q.rtt), c: q.connected,
      })),
    };
  }

  broadcastRoom(room) {
    if (!this.rooms.has(room.code)) return;
    room.lastRoomBroadcast = Date.now();
    this.roomEvent(room, this.roomState(room));
  }

  sendRoomTo(p) { this.send(p.conn, this.roomState(p.room)); }

  // ------------------------------------------------------------------ lobby controls
  isHost(p) { return p.room.hostId === p.id; }

  onConfig(p, m) {
    const room = p.room;
    if (!this.isHost(p) || room.phase === 'countdown' || room.phase === 'playing') return;
    const cfg = { ...room.config };
    if (typeof m.mode === 'string' && MODES[m.mode]) cfg.mode = m.mode;
    if (KILL_LIMITS.includes(m.killLimit)) cfg.killLimit = m.killLimit;
    if (TIME_LIMITS_MIN.includes(m.timeLimitMin)) cfg.timeLimitMin = m.timeLimitMin;
    room.config = cfg;
    this.broadcastRoom(room);
  }

  // ---- CoD-style map vote: everyone votes in the lobby, the host's Start locks it in.
  newVote(room) {
    let opts = [...MAP_ORDER];
    if (opts.length > 6) {
      // shuffle, then keep a mix of both factions' turf
      opts.sort(() => Math.random() - 0.5);
      const sub = opts.filter((id) => MAPS[id].faction === 'suburban');
      const cty = opts.filter((id) => MAPS[id].faction !== 'suburban');
      opts = [...sub.slice(0, 2), ...cty.slice(0, 2)];
      for (const id of MAP_ORDER) if (opts.length < 4 && !opts.includes(id)) opts.push(id);
    }
    room.vote = { opts, votes: new Map() };
  }

  onVote(p, mapId) {
    const room = p.room;
    if (room.phase === 'countdown' || room.phase === 'playing') return;
    if (!room.vote.opts.includes(mapId)) return;
    room.vote.votes.set(p.id, mapId);
    this.broadcastRoom(room);
  }

  tally(room) {
    const t = {};
    for (const id of room.vote.opts) t[id] = 0;
    for (const [pid, id] of room.vote.votes) if (room.players.has(pid) && t[id] !== undefined) t[id]++;
    return t;
  }

  resolveVote(room) {
    const t = this.tally(room);
    const max = Math.max(...Object.values(t));
    const top = Object.keys(t).filter((id) => t[id] === max);
    return top[randomInt(top.length)];
  }

  onTeam(p, team) {
    if (p.room.phase === 'countdown' || p.room.phase === 'playing') return;
    if (team !== 1 && team !== 2) return;
    p.team = team;
    this.broadcastRoom(p.room);
  }

  onChat(client, p, raw) {
    const now = Date.now();
    if (now - client.lastChat < 600) return;
    const msg = sanitizeChat(raw);
    if (!msg) return;
    client.lastChat = now;
    this.roomEvent(p.room, { t: 'chat', id: p.id, name: p.name, team: p.team, m: msg });
  }

  onStart(p) {
    const room = p.room;
    if (!this.isHost(p)) return this.send(p.conn, { t: 'error', code: 'nothost', msg: 'Only the host can start the match.' });
    if (room.phase === 'countdown' || room.phase === 'playing') return;
    this.startMatch(room);
  }

  onToLobby(p) {
    const room = p.room;
    if (!this.isHost(p) || room.phase !== 'ended') return;
    room.phase = 'lobby';
    room.winner = null;
    for (const q of room.players.values()) q.alive = false;
    this.broadcastRoom(room);
  }

  startMatch(room) {
    const now = Date.now();
    room.config = { ...room.config, map: this.resolveVote(room) };
    this.newVote(room); // fresh ballot for the next round
    room.phase = 'countdown';
    room.startsAt = now + COUNTDOWN_MS;
    room.endsAt = room.startsAt + room.config.timeLimitMin * 60000;
    room.winner = null;
    room.teamScore = { 1: 0, 2: 0 };
    room.firstBlood = false;
    room.nextAnnounceAt = room.startsAt + 20000;
    if (room.config.mode === 'tdm') this.balanceTeams(room);
    for (const q of room.players.values()) {
      q.kills = 0; q.deaths = 0; q.streak = 0; q.multi = 0;
      q.weapon = 'rifle';
      if (q.connected) this.spawn(q);
    }
    this.broadcastRoom(room);
    this.roomEvent(room, { t: 'ann', msg: `${getMap(room.config.map).name} · ${MODES[room.config.mode].name.toUpperCase()} — first to ${room.config.killLimit} wins.` });
  }

  balanceTeams(room) {
    const ps = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const count = () => ps.reduce((acc, q) => { acc[q.team === 2 ? 2 : 1]++; return acc; }, { 1: 0, 2: 0 });
    let c = count();
    while (Math.abs(c[1] - c[2]) > 1) {
      const big = c[1] > c[2] ? 1 : 2;
      const mover = [...ps].reverse().find((q) => q.team === big);
      mover.team = big === 1 ? 2 : 1;
      c = count();
    }
  }

  // ------------------------------------------------------------------ spawning
  spawn(p) {
    const room = p.room;
    const enemies = [...room.players.values()].filter((q) => q !== p && q.alive && q.connected
      && !(room.config.mode === 'tdm' && q.team === p.team));
    const scored = getMap(room.config.map).spawns.map((s) => {
      let minD = 999;
      for (const e of enemies) minD = Math.min(minD, Math.hypot(e.pos.x - s.x, e.pos.z - s.z));
      return { s, score: minD + Math.random() * 8 };
    }).sort((a, b) => b.score - a.score);
    const s = scored[Math.min(scored.length - 1, randomInt(3))].s;
    const now = Date.now();
    p.alive = true;
    p.hp = PLAYER.maxHp;
    p.pos = { x: s.x, y: 0, z: s.z };
    p.yaw = s.yaw;
    p.pitch = 0;
    p.epoch++;
    p.lastStateAt = now;
    p.history = [{ t: now, x: s.x, y: 0, z: s.z }];
    p.ammo = fullAmmo();
    p.reloadUntil = 0;
    p.nextFireAt = 0;
    p.invulnUntil = now + SPAWN_PROTECT_MS;
    p.violations = 0;
    this.roomEvent(room, { t: 'spawn', id: p.id, e: p.epoch, p: [s.x, 0, s.z], yw: r2(s.yaw) });
    this.sendYou(p);
  }

  sendYou(p) {
    this.send(p.conn, {
      t: 'you',
      hp: Math.max(0, Math.ceil(p.hp)),
      alive: p.alive,
      w: p.weapon,
      ammo: p.ammo,
      rl: p.reloadUntil > Date.now() ? p.reloadUntil - Date.now() : 0,
      ra: p.respawnAt > Date.now() ? p.respawnAt - Date.now() : 0,
    });
  }

  // ------------------------------------------------------------------ movement
  onState(p, m) {
    const room = p.room;
    if (isNum(m.yw)) p.yaw = m.yw % (Math.PI * 2);
    if (isNum(m.pt)) p.pitch = clamp(m.pt, -1.55, 1.55);
    p.sprint = !!m.sp;
    if (!p.alive || (room.phase !== 'playing' && room.phase !== 'countdown')) return;
    if (m.e !== p.epoch) return; // stale packet from before a respawn/correction
    const np = vec3(m.p);
    if (!np) return;
    const map = getMap(room.config.map);
    const BOUNDS = map.bounds;
    const now = Date.now();
    const dt = clamp(now - p.lastStateAt, 16, 1000) / 1000;
    const dx = np.x - p.pos.x, dz = np.z - p.pos.z, dy = np.y - p.pos.y;
    const horiz = Math.hypot(dx, dz);
    const maxH = PLAYER.sprintSpeed * MOVE_SLACK * dt + MOVE_FLAT_TOLERANCE;
    const maxUp = PLAYER.bounceSpeed * MOVE_SLACK * dt + MOVE_FLAT_TOLERANCE;
    let bad = '';
    if (horiz > maxH) bad = 'speed';
    else if (dy > maxUp) bad = 'fly';
    else if (np.y < -0.5 || np.y > 9) bad = 'height';
    else if (Math.abs(np.x) > BOUNDS + 0.5 || Math.abs(np.z) > BOUNDS + 0.5) bad = 'bounds';
    else if (isInsideSolid(np.x, np.y, np.z, map.boxes)) bad = 'solid';
    else if (horiz > 0.05 && this.crossesWall(p.pos, np, map)) bad = 'wall';
    if (bad) {
      p.violations++;
      p.epoch++;
      p.lastStateAt = now;
      this.send(p.conn, { t: 'corr', e: p.epoch, p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], why: bad });
      return;
    }
    p.lastStateAt = now;
    p.pos = np;
    p.history.push({ t: now, x: np.x, y: np.y, z: np.z });
    while (p.history.length > 2 && now - p.history[0].t > HISTORY_MS) p.history.shift();
  }

  crossesWall(a, b, map) {
    const o = { x: a.x, y: a.y + 1.7, z: a.z };
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    if (!map.walls) map.walls = map.boxes.filter((x) => x.h >= 2.5 && x.kind !== 'invisible');
    for (const w of map.walls) {
      if (o.y > w.maxY || o.y < w.minY) continue;
      const hit = raycastMap(o, d, len, [w]);
      if (hit.box && hit.box !== null && hit.box.kind !== 'ground' && hit.dist < len - 0.05) return true;
    }
    return false;
  }

  positionAt(q, t) {
    const h = q.history;
    if (!h.length) return q.pos;
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t && t <= b.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return h[h.length - 1];
  }

  // ------------------------------------------------------------------ combat
  finishReload(p, now) {
    if (p.reloadUntil && now >= p.reloadUntil) {
      p.ammo[p.reloadWeapon] = WEAPONS[p.reloadWeapon].mag;
      p.reloadUntil = 0;
      return true;
    }
    return false;
  }

  onReload(p) {
    const now = Date.now();
    if (!p.alive || p.reloadUntil) return;
    const w = WEAPONS[p.weapon];
    if (p.ammo[p.weapon] >= w.mag) return;
    p.reloadUntil = now + w.reloadMs;
    p.reloadWeapon = p.weapon;
    this.sendYou(p);
    this.roomEvent(p.room, { t: 'rl', id: p.id }, p);
  }

  onWeapon(p, w) {
    if (!WEAPONS[w] || p.weapon === w) return;
    p.weapon = w;
    p.reloadUntil = 0; // switching cancels a reload
    p.nextFireAt = Math.max(p.nextFireAt, Date.now() + 250);
    this.sendYou(p);
  }

  reject(p, why, seq) {
    this.send(p.conn, { t: 'rej', why, s: isNum(seq) ? seq : 0 });
    return false;
  }

  onFire(p, m) {
    const room = p.room;
    const now = Date.now();
    if (room.phase !== 'playing') return this.reject(p, 'phase', m.s);
    if (!p.alive) return this.reject(p, 'dead', m.s);
    if (m.e !== p.epoch) return this.reject(p, 'epoch', m.s);
    if (m.w !== p.weapon || !WEAPONS[m.w]) return this.reject(p, 'weapon', m.s);
    const w = WEAPONS[p.weapon];
    this.finishReload(p, now);
    if (p.reloadUntil) return this.reject(p, 'reloading', m.s);
    if (now < p.nextFireAt - FIRE_JITTER_MS) return this.reject(p, 'cooldown', m.s);
    if (p.ammo[p.weapon] <= 0) return this.reject(p, 'empty', m.s);
    const d = vec3(m.d);
    if (!d) return this.reject(p, 'bad', m.s);
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 0.9 || len > 1.1) return this.reject(p, 'bad', m.s);
    d.x /= len; d.y /= len; d.z /= len;

    p.ammo[p.weapon]--;
    // Shots stay on a fixed schedule: a packet may arrive up to FIRE_JITTER_MS early (network bunching),
    // but the next allowed time is always a full cooldown after the scheduled one, so rate can't exceed 1/cooldown.
    p.nextFireAt = Math.max(p.nextFireAt, now) + w.cooldownMs;
    p.invulnUntil = 0; // firing ends spawn protection

    const origin = { x: p.pos.x, y: p.pos.y + PLAYER.eye, z: p.pos.z };
    const rewind = clamp(p.rtt / 2 + INTERP_DELAY_MS, 0, MAX_REWIND_MS);
    const tPast = now - rewind;
    const targets = [];
    for (const q of room.players.values()) {
      if (q === p || !q.alive || !q.connected) continue;
      if (room.config.mode === 'tdm' && q.team === p.team) continue;
      targets.push({ q, pos: this.positionAt(q, tPast) });
    }

    const damage = new Map();
    const ends = [];
    const sprintPenalty = p.sprint ? 1.6 : 1;
    const aimed = !!m.a && !p.sprint;
    const baseSpread = w.scoped ? (aimed ? w.spread : w.hipSpread) : w.spread * (aimed ? ADS_SPREAD_MULT : 1);
    for (let i = 0; i < w.pellets; i++) {
      const sd = this.spreadDir(d, baseSpread * sprintPenalty);
      const mapHit = raycastMap(origin, sd, w.range, getMap(room.config.map).boxes);
      let best = mapHit.dist;
      let bestQ = null, head = false;
      for (const t of targets) {
        const h = rayPlayer(origin, sd, t.pos.x, t.pos.y, t.pos.z);
        if (h && h.dist < best) { best = h.dist; bestQ = t.q; head = h.head; }
      }
      ends.push([r2(origin.x + sd.x * best), r2(origin.y + sd.y * best), r2(origin.z + sd.z * best), bestQ ? 1 : (mapHit.box ? 2 : 0)]);
      if (bestQ) {
        let dmg = w.damage * (head ? w.headMult : 1);
        if (best > w.falloffStart) {
          const k = clamp((best - w.falloffStart) / Math.max(1, w.range - w.falloffStart), 0, 1);
          dmg *= 1 - k * (1 - w.falloffMin);
        }
        const cur = damage.get(bestQ) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head = cur.head || head;
        damage.set(bestQ, cur);
      }
    }

    this.roomEvent(room, { t: 'shot', id: p.id, w: p.weapon, o: [r2(origin.x), r2(origin.y), r2(origin.z)], h: ends }, p);

    let total = 0, anyHead = false, killed = false;
    for (const [q, info] of damage) {
      if (q.invulnUntil > now) continue;
      const dmg = Math.round(info.dmg);
      q.hp -= dmg;
      total += dmg;
      anyHead = anyHead || info.head;
      this.send(q.conn, { t: 'dmg', hp: Math.max(0, Math.ceil(q.hp)), from: [r2(p.pos.x), r2(p.pos.z)], by: p.id });
      if (q.hp <= 0) {
        killed = true;
        this.kill(p, q, info.head);
      }
    }
    const victims = [...damage.keys()].filter((q) => q.invulnUntil <= now || q.hp <= 0).map((q) => q.id);
    this.send(p.conn, { t: 'fired', s: isNum(m.s) ? m.s : 0, ammo: p.ammo[p.weapon], hit: total, hd: anyHead, k: killed, ends, v: victims });
    if (p.ammo[p.weapon] <= 0) this.onReload(p);
    return true;
  }

  spreadDir(d, spread) {
    if (spread <= 0) return d;
    // random point in a cone around d
    const ax = Math.abs(d.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let ux = d.y * ax.z - d.z * ax.y, uy = d.z * ax.x - d.x * ax.z, uz = d.x * ax.y - d.y * ax.x;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const x = d.x + ux * ca + vx * sa, y = d.y + uy * ca + vy * sa, z = d.z + uz * ca + vz * sa;
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  }

  kill(killer, victim, head) {
    const room = killer.room;
    const now = Date.now();
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.streak = 0;
    victim.respawnAt = now + RESPAWN_MS;
    victim.reloadUntil = 0;
    killer.kills++;
    killer.streak++;
    if (room.config.mode === 'tdm') room.teamScore[killer.team] = (room.teamScore[killer.team] || 0) + 1;
    killer.multi = now - killer.lastKillAt < 4000 ? killer.multi + 1 : 1;
    killer.lastKillAt = now;

    this.roomEvent(room, {
      t: 'kill', k: killer.id, v: victim.id, kn: killer.name, vn: victim.name, w: killer.weapon,
      hd: !!head, ...(([verb, pverb]) => ({ verb, pverb }))(pick(KILL_VERBS)), fine: 50 * randomInt(1, 21),
    });
    this.sendYou(victim);

    let ann = '';
    if (!room.firstBlood) { room.firstBlood = true; ann = `FIRST CITATION! ${killer.name} drew first blood on ${victim.name}.`; }
    if (killer.multi === 2) ann = `DOUBLE CITATION! ${killer.name}`;
    else if (killer.multi === 3) ann = `TRIPLE VIOLATION! ${killer.name}`;
    else if (killer.multi >= 4) ann = `NEIGHBORHOOD MENACE! ${killer.name} x${killer.multi}`;
    if (killer.streak === 5) ann = `${killer.name} is on a ROAD-RAGE STREAK (5)!`;
    else if (killer.streak === 10) ann = `${killer.name} has been elected HOA PRESIDENT (10 streak)!`;
    if (ann) this.roomEvent(room, { t: 'ann', msg: ann });

    this.broadcastRoom(room);
    this.checkWin(room);
  }

  // ------------------------------------------------------------------ match end
  checkWin(room) {
    if (room.phase !== 'playing') return;
    const limit = room.config.killLimit;
    if (room.config.mode === 'tdm') {
      if (room.teamScore[1] >= limit || room.teamScore[2] >= limit) this.endMatch(room);
    } else {
      for (const q of room.players.values()) if (q.kills >= limit) return this.endMatch(room);
    }
  }

  computeWinner(room) {
    if (room.config.mode === 'tdm') {
      const a = room.teamScore[1], b = room.teamScore[2];
      if (a === b) return { type: 'tie' };
      const t = TEAMS.find((x) => x.id === (a > b ? 1 : 2));
      return { type: 'team', team: t.id, name: t.name };
    }
    const ps = [...room.players.values()].sort((x, y) => (y.kills - x.kills) || (x.deaths - y.deaths));
    if (!ps.length) return { type: 'tie' };
    if (ps.length > 1 && ps[0].kills === ps[1].kills && ps[0].deaths === ps[1].deaths) return { type: 'tie' };
    return { type: 'player', id: ps[0].id, name: ps[0].name };
  }

  endMatch(room) {
    room.phase = 'ended';
    room.winner = this.computeWinner(room);
    for (const q of room.players.values()) { q.alive = false; q.reloadUntil = 0; }
    this.roomEvent(room, this.endMessage(room));
    this.broadcastRoom(room);
    this.log(`room ${room.code} match ended: ${JSON.stringify(room.winner)}`);
  }

  endMessage(room) {
    return {
      t: 'end',
      winner: room.winner,
      ts: room.teamScore,
      board: [...room.players.values()]
        .sort((x, y) => (y.kills - x.kills) || (x.deaths - y.deaths))
        .map((q) => ({ id: q.id, name: q.name, team: q.team, k: q.kills, d: q.deaths })),
    };
  }

  // ------------------------------------------------------------------ tick
  snapshot(room) {
    const now = Date.now();
    const list = [];
    for (const q of room.players.values()) {
      if (!q.connected) continue;
      const flags = (q.alive ? 1 : 0) | (q.sprint ? 2 : 0) | (q.weapon === 'shotgun' ? 4 : 0) | (q.weapon === 'deer' ? 32 : 0)
        | (q.invulnUntil > now ? 8 : 0) | (q.reloadUntil > now ? 16 : 0);
      list.push([q.id, r2(q.pos.x), r2(q.pos.y), r2(q.pos.z), r2(q.yaw), r2(q.pitch), flags]);
    }
    return JSON.stringify({ t: 'snap', ts: now, p: list });
  }

  sendSnapshotTo(room, p) {
    if (p.conn) p.conn.send(this.snapshot(room));
  }

  tick() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      // evict players whose reconnect grace ran out
      for (const q of [...room.players.values()]) {
        if (!q.connected && now - q.disconnectedAt > this.reconnectGraceMs) this.removePlayer(q, 'timeout');
      }
      if (!this.rooms.has(room.code)) continue;

      if (room.phase === 'countdown' && now >= room.startsAt) {
        room.phase = 'playing';
        this.broadcastRoom(room);
        this.roomEvent(room, { t: 'ann', msg: 'BEGIN! The HOA has authorized lethal landscaping.' });
      }
      if (room.phase === 'playing') {
        if (now >= room.endsAt) { this.endMatch(room); continue; }
        for (const q of room.players.values()) {
          if (!q.connected) continue;
          if (this.finishReload(q, now)) this.sendYou(q);
          if (!q.alive && q.respawnAt && now >= q.respawnAt) { q.respawnAt = 0; this.spawn(q); }
        }
        if (now >= room.nextAnnounceAt) {
          room.nextAnnounceAt = now + 35000 + randomInt(20000);
          this.roomEvent(room, { t: 'ann', msg: pick(ANNOUNCEMENTS), hoa: true });
        }
      }
      if (room.phase === 'countdown' || room.phase === 'playing') {
        const s = this.snapshot(room);
        for (const q of room.players.values()) {
          if (!q.conn) continue;
          if (q.conn.bufferedAmount > 512 * 1024) continue; // slow client: skip a snapshot
          q.conn.send(s);
        }
      }
      if (now - room.lastRoomBroadcast > 3000) this.broadcastRoom(room);
    }
  }

  shutdown() {
    this.stop();
    for (const room of this.rooms.values()) {
      this.roomEvent(room, { t: 'error', code: 'shutdown', msg: 'The server is restarting. Rejoin in a minute.' });
    }
  }
}
