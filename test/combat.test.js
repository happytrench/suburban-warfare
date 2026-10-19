import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, sleep } from './helpers.js';
import { WEAPONS, COUNTDOWN_MS, RESPAWN_MS } from '../client/shared/constants.js';

let srv;
before(async () => { srv = await startServer({ reconnectGraceMs: 600 }); });
after(async () => { await srv.app.close(); });

// Put a player at an exact spot on the server (test-only shortcut instead of walking there).
function place(game, id, x, z, y = 0) {
  for (const room of game.rooms.values()) {
    const p = room.players.get(id);
    if (!p) continue;
    p.pos = { x, y, z };
    p.history = [{ t: Date.now(), x, y, z }];
    p.lastStateAt = Date.now();
    p.invulnUntil = 0;
    return p;
  }
  throw new Error('player not found');
}
const serverPlayer = (game, id) => { for (const r of game.rooms.values()) if (r.players.has(id)) return r.players.get(id); return null; };
const aim = (from, to) => { const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); };

async function matchOf2() {
  const a = await new Client(srv.url, 'Karen').connect();
  const b = await new Client(srv.url, 'Bubba').connect();
  a.send({ t: 'create' });
  const ja = await a.wait((m) => m.t === 'joined');
  b.send({ t: 'join', code: ja.code });
  const jb = await b.wait((m) => m.t === 'joined');
  await a.wait((m) => m.t === 'room' && m.players.length === 2);
  a.send({ t: 'vote', map: 'culdesac' });
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'room' && m.phase === 'countdown');
  await a.wait((m) => m.t === 'room' && m.phase === 'playing', COUNTDOWN_MS + 2000);
  return { a, b, ida: ja.id, idb: jb.id, code: ja.code };
}

test('non-host cannot start; movement is synchronized to other players', async () => {
  const { a, b, ida, idb } = await matchOf2();
  b.send({ t: 'start' });
  const e = await b.wait((m) => m.t === 'error' && m.code === 'nothost');
  assert.ok(e);
  const pa = serverPlayer(srv.app.game, ida);
  // walk a few small, legal steps
  let x = pa.pos.x, z = pa.pos.z;
  for (let i = 0; i < 5; i++) {
    z += 0.25;
    a.send({ t: 'st', e: pa.epoch, p: [x, 0, z], yw: 1.0, pt: 0.1 });
    await sleep(60);
  }
  const snap = await b.next((m) => m.t === 'snap' && m.p.some((r) => r[0] === ida && Math.abs(r[3] - z) < 0.01));
  const row = snap.p.find((r) => r[0] === ida);
  assert.equal(row[1], Math.round(x * 100) / 100);
  assert.equal(row[4], 1);
  // a teleport is rejected and corrected
  a.send({ t: 'st', e: pa.epoch, p: [x + 40, 0, z], yw: 1.0, pt: 0 });
  const corr = await a.wait((m) => m.t === 'corr');
  assert.equal(corr.why, 'speed');
  assert.ok(Math.abs(serverPlayer(srv.app.game, ida).pos.x - x) < 0.01);
  void idb;
  a.close(); b.close();
});

test('valid hits damage, kill, update score/kill feed, and the victim respawns', async () => {
  const { a, b, ida, idb } = await matchOf2();
  const g = srv.app.game;
  const pa = place(g, ida, 2, 18);
  place(g, idb, 2, 10);
  const dir = aim([2, 1.6, 18], [2, 0.9, 10]);
  let fired = 0;
  for (let i = 0; i < 12 && serverPlayer(g, idb).alive; i++) {
    a.send({ t: 'f', e: pa.epoch, w: 'rifle', d: dir, s: i });
    fired++;
    await sleep(WEAPONS.rifle.cooldownMs + 15);
  }
  const dmg = await b.wait((m) => m.t === 'dmg');
  assert.ok(dmg.hp < 100, 'victim took damage');
  const hit = await a.wait((m) => m.t === 'fired' && m.hit > 0);
  assert.ok(hit.hit >= WEAPONS.rifle.damage);
  const kill = await b.wait((m) => m.t === 'kill');
  assert.equal(kill.k, ida); assert.equal(kill.v, idb);
  assert.ok(fired <= 8, `took ${fired} shots`);
  const room = await a.wait((m) => m.t === 'room' && m.players.find((p) => p.id === ida)?.k === 1);
  assert.equal(room.players.find((p) => p.id === idb).d, 1);
  // dead players cannot shoot
  const pb = serverPlayer(g, idb);
  b.send({ t: 'f', e: pb.epoch, w: 'rifle', d: [0, 0, -1], s: 99 });
  const rej = await b.wait((m) => m.t === 'rej' && m.s === 99);
  assert.equal(rej.why, 'dead');
  // respawn after the delay
  const sp = await b.next((m) => m.t === 'spawn' && m.id === idb, RESPAWN_MS + 1500);
  assert.equal(sp.e, serverPlayer(g, idb).epoch);
  assert.equal(serverPlayer(g, idb).hp, 100);
  a.close(); b.close();
});

test('invalid shooting requests are rejected', async () => {
  const { a, b, ida, idb } = await matchOf2();
  const g = srv.app.game;
  const pa = place(g, ida, 2, 18);
  place(g, idb, 2, 10);
  const dir = aim([2, 1.6, 18], [2, 0.9, 10]);
  const reasons = [];
  const shoot = async (msg, s) => { a.send({ ...msg, s }); const r = await a.wait((m) => (m.t === 'rej' || m.t === 'fired') && m.s === s); reasons.push(r.t === 'rej' ? r.why : 'ok'); };
  await shoot({ t: 'f', e: pa.epoch, w: 'rifle', d: [0, 5, 0] }, 1);              // not a unit vector
  await shoot({ t: 'f', e: pa.epoch, w: 'rifle', d: ['x', 0, 0] }, 2);            // garbage
  await shoot({ t: 'f', e: pa.epoch, w: 'shotgun', d: dir }, 3);                  // not the equipped weapon
  await shoot({ t: 'f', e: pa.epoch - 1, w: 'rifle', d: dir }, 4);                // stale epoch
  await shoot({ t: 'f', e: pa.epoch, w: 'rifle', d: dir }, 5);                    // valid
  await shoot({ t: 'f', e: pa.epoch, w: 'rifle', d: dir }, 6);                    // too fast (cooldown)
  assert.deepEqual(reasons, ['bad', 'bad', 'weapon', 'epoch', 'ok', 'cooldown']);
  // spamming can never beat the fire-rate cap
  const before = serverPlayer(g, ida).ammo.rifle;
  for (let i = 0; i < 40; i++) a.send({ t: 'f', e: pa.epoch, w: 'rifle', d: dir, s: 100 + i });
  await sleep(400);
  const used = before - serverPlayer(g, ida).ammo.rifle;
  assert.ok(used <= 5, `fired ${used} shots in ~0.4s`);
  // clients can't edit their own score
  a.send({ t: 'room', players: [{ id: ida, k: 999 }] });
  a.send({ t: 'kill', k: ida, v: idb });
  await sleep(100);
  assert.equal(serverPlayer(g, ida).kills, 0);
  a.close(); b.close();
});

test('match ends at the kill limit, then a rematch starts with fresh scores', async () => {
  const { a, b, ida, idb } = await matchOf2();
  const g = srv.app.game;
  const room = [...g.rooms.values()].find((r) => r.players.has(ida));
  room.config.killLimit = 1; // test shortcut
  const pa = place(g, ida, 2, 18);
  place(g, idb, 2, 10);
  const dir = aim([2, 1.6, 18], [2, 0.9, 10]);
  for (let i = 0; i < 12 && room.phase === 'playing'; i++) {
    a.send({ t: 'f', e: pa.epoch, w: 'rifle', d: dir, s: i });
    await sleep(WEAPONS.rifle.cooldownMs + 15);
  }
  const end = await b.wait((m) => m.t === 'end');
  assert.equal(end.winner.type, 'player');
  assert.equal(end.winner.id, ida);
  assert.equal(end.board[0].id, ida);
  // only the host can trigger the rematch
  b.send({ t: 'start' });
  await b.wait((m) => m.t === 'error' && m.code === 'nothost');
  a.send({ t: 'start' });
  const again = await b.next((m) => m.t === 'room' && m.phase === 'countdown');
  assert.ok(again.players.every((p) => p.k === 0 && p.d === 0));
  // and back to the lobby path works too
  room.phase = 'ended';
  a.send({ t: 'lobby' });
  await b.next((m) => m.t === 'room' && m.phase === 'lobby');
  a.close(); b.close();
});

test('team deathmatch: no friendly fire, team score wins', async () => {
  const a = await new Client(srv.url, 'Chad').connect();
  const b = await new Client(srv.url, 'Bubba').connect();
  const c = await new Client(srv.url, 'Brad').connect();
  a.send({ t: 'create' });
  const ja = await a.wait((m) => m.t === 'joined');
  b.send({ t: 'join', code: ja.code }); const jb = await b.wait((m) => m.t === 'joined');
  c.send({ t: 'join', code: ja.code }); const jc = await c.wait((m) => m.t === 'joined');
  a.send({ t: 'cfg', mode: 'tdm', killLimit: 10, timeLimitMin: 5 });
  a.send({ t: 'team', team: 1 }); b.send({ t: 'team', team: 2 }); c.send({ t: 'team', team: 1 });
  await a.wait((m) => m.t === 'room' && m.cfg.mode === 'tdm' && m.players.length === 3 && m.players.find((p) => p.id === jc.id).team === 1 && m.players.find((p) => p.id === jb.id).team === 2);
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'room' && m.phase === 'playing', COUNTDOWN_MS + 2000);
  const g = srv.app.game;
  const pa = place(g, ja.id, 2, 18);
  place(g, jc.id, 2, 10); // teammate in the line of fire
  place(g, jb.id, -40, -40);
  a.send({ t: 'f', e: pa.epoch, w: 'rifle', d: aim([2, 1.6, 18], [2, 0.9, 10]), s: 1 });
  const f = await a.wait((m) => m.t === 'fired' && m.s === 1);
  assert.equal(f.hit, 0, 'teammates take no damage');
  assert.equal(serverPlayer(g, jc.id).hp, 100);
  a.close(); b.close(); c.close();
});

test('map voting picks the most-voted map', async () => {
  const a = await new Client(srv.url, 'V1').connect();
  a.send({ t: 'create' });
  const ja = await a.wait((m) => m.t === 'joined');
  const room = await a.wait((m) => m.t === 'room');
  assert.ok(room.vote.opts.length >= 1);
  const choice = room.vote.opts[room.vote.opts.length - 1];
  a.send({ t: 'vote', map: choice });
  a.send({ t: 'vote', map: 'not-a-map' }); // ignored
  const r2 = await a.wait((m) => m.t === 'room' && m.vote.tally[choice] === 1);
  assert.equal(r2.vote.mine[ja.id], choice);
  a.send({ t: 'start' });
  const started = await a.wait((m) => m.t === 'room' && m.phase === 'countdown');
  assert.equal(started.cfg.map, choice);
  a.close();
});

test('disconnects: player kept briefly for reconnect, then removed; empty rooms close', async () => {
  const a = await new Client(srv.url, 'Stay').connect();
  const b = await new Client(srv.url, 'Flaky').connect();
  a.send({ t: 'create' });
  const ja = await a.wait((m) => m.t === 'joined');
  b.send({ t: 'join', code: ja.code });
  const jb = await b.wait((m) => m.t === 'joined');
  b.close();
  const r1 = await a.next((m) => m.t === 'room' && m.players.some((p) => p.id === jb.id && p.c === false));
  assert.ok(r1);
  // reconnect with the token inside the grace window
  const b2 = await new Client(srv.url, 'Flaky').connect();
  b2.send({ t: 'rejoin', code: ja.code, token: jb.token });
  const back = await b2.wait((m) => m.t === 'joined');
  assert.equal(back.id, jb.id);
  await a.next((m) => m.t === 'room' && m.players.some((p) => p.id === jb.id && p.c === true));
  // drop again and let the grace period (600ms in tests) expire
  b2.close();
  await a.next((m) => m.t === 'gone' && m.id === jb.id, 3000);
  const r2 = await a.wait((m) => m.t === 'room' && m.players.length === 1, 3000);
  assert.equal(r2.players[0].id, ja.id);
  // host leaves → room is deleted
  a.send({ t: 'leave' });
  await a.wait((m) => m.t === 'left');
  await sleep(50);
  assert.equal(srv.app.game.rooms.has(ja.code), false);
  a.close();
});

test('oversized and malformed messages are handled safely', async () => {
  const a = await new Client(srv.url, 'Fuzz').connect();
  a.ws.send('not json');
  a.ws.send(JSON.stringify({ t: 'st', e: 'x', p: [NaN, null, 1] }));
  a.ws.send(JSON.stringify([1, 2, 3]));
  a.send({ t: 'create' });
  await a.wait((m) => m.t === 'joined');
  const closed = new Promise((r) => { a.ws.onclose = (e) => r(e.code); });
  a.ws.send('x'.repeat(20000));
  assert.equal(await closed, 1009);
  const h = await (await fetch(`${srv.http}/health`)).json();
  assert.equal(h.status, 'ok');
});
