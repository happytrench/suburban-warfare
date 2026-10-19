import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wsUrl } from '../client/js/net.js';

test('production client connects to the same host over wss://, never localhost', () => {
  assert.equal(wsUrl({ protocol: 'https:', host: 'suburban-warfare.onrender.com' }), 'wss://suburban-warfare.onrender.com/ws');
  assert.equal(wsUrl({ protocol: 'http:', host: 'localhost:3000' }), 'ws://localhost:3000/ws');
  for (const f of ['client/js/net.js', 'client/js/main.js']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /localhost|127\.0\.0\.1/, `${f} must not hardcode a host`);
  }
});
