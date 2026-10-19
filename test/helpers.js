// Test helpers: start a real server on a random port and drive it with real WebSocket clients.
import { createGameServer } from '../server/index.js';

export async function startServer(opts = {}) {
  const app = createGameServer({ port: 0, host: '127.0.0.1', log: () => {}, ...opts });
  const port = await app.listen();
  return { app, port, url: `ws://127.0.0.1:${port}/ws`, http: `http://127.0.0.1:${port}` };
}

export class Client {
  constructor(url, name) {
    this.url = url;
    this.name = name;
    this.msgs = [];
    this.waiters = [];
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      this.msgs.push(m);
      for (const w of [...this.waiters]) {
        if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
      }
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.send({ t: 'hello', v: 1, name: this.name });
    await this.wait((m) => m.t === 'hello');
    return this;
  }

  send(m) { this.ws.send(JSON.stringify(m)); }

  // resolves with the first message (already received or future) matching pred
  wait(pred, ms = 3000, { fresh = false } = {}) {
    if (!fresh) {
      const found = this.msgs.find(pred);
      if (found) return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) { this.waiters.splice(i, 1); reject(new Error(`timeout waiting for message (${pred})`)); }
      }, ms);
    });
  }

  next(pred, ms) { return this.wait(pred, ms, { fresh: true }); }
  last(t) { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i]; return null; }
  clear() { this.msgs = []; }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
