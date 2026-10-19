// WebSocket connection with automatic reconnect and server clock sync.
import { PROTOCOL_VERSION } from '../shared/constants.js';

export function wsUrl(loc = window.location) {
  // Same origin as the page: wss:// when served over https (e.g. Render), ws:// locally.
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}/ws`;
}

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.status = 'idle';
    this.name = '';
    this.rtt = 100;
    this.offset = 0;          // serverTime ≈ performance-free Date.now() + offset
    this.offsetInit = false;
    this.retry = 0;
    this.wantOpen = true;
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, data) {
    for (const fn of this.handlers.get(type) || []) {
      try { fn(data); } catch (e) { console.error(`handler ${type}`, e); }
    }
  }

  serverNow() { return Date.now() + this.offset; }

  connect() {
    this.wantOpen = true;
    clearTimeout(this.reconnectTimer);
    this.setStatus('connecting');
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name });
      clearInterval(this.pingTimer);
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), 2000);
      this.emit('open');
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') {
        const now = Date.now();
        const rtt = Math.max(1, now - m.c);
        this.rtt = this.rtt * 0.7 + rtt * 0.3;
        const off = m.s + rtt / 2 - now;
        this.offset = this.offsetInit ? this.offset * 0.8 + off * 0.2 : off;
        this.offsetInit = true;
        return;
      }
      this.emit(m.t, m);
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('closed');
      this.emit('close', e);
      if (this.wantOpen) this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(4000, 400 * 2 ** this.retry);
    this.retry++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  ping() { this.send({ t: 'ping', c: Date.now(), r: Math.round(this.rtt) }); }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }
}
