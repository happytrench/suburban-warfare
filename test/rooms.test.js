import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.app.close(); });

test('server starts, serves the page and reports health', async () => {
  const page = await fetch(`${srv.http}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SUBURBAN WARFARE/);
  const h = await (await fetch(`${srv.http}/health`)).json();
  assert.equal(h.status, 'ok');
  const missing = await fetch(`${srv.http}/../../etc/passwd`);
  assert.notEqual(missing.status, 200);
});

test('two clients create and join the same room with distinct ids', async () => {
  const a = await new Client(srv.url, 'Karen').connect();
  const b = await new Client(srv.url, 'Bubba').connect();
  a.send({ t: 'create' });
  const ja = await a.wait((m) => m.t === 'joined');
  assert.match(ja.code, /^[A-Z2-9]{4}$/);
  b.send({ t: 'join', code: ja.code.toLowerCase() });
  const jb = await b.wait((m) => m.t === 'joined');
  assert.equal(jb.code, ja.code);
  assert.notEqual(ja.id, jb.id);
  const room = await a.wait((m) => m.t === 'room' && m.players.length === 2);
  assert.deepEqual(room.players.map((p) => p.name).sort(), ['Bubba', 'Karen']);
  assert.equal(room.host, ja.id);
  a.close(); b.close();
});

test('joining a missing room returns a clear error', async () => {
  const c = await new Client(srv.url, 'Lost').connect();
  c.send({ t: 'join', code: 'ZZZZ' });
  const e = await c.wait((m) => m.t === 'error');
  assert.equal(e.code, 'noroom');
  c.close();
});
