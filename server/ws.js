// Minimal, dependency-free RFC 6455 WebSocket server.
// Supports text frames, fragmentation, ping/pong, close handshake and payload caps.
// Binary frames and extensions (compression) are not used by the game and are refused.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WSConn extends EventEmitter {
  constructor(socket, { maxPayload = 16 * 1024, ip = '' } = {}) {
    super();
    this.socket = socket;
    this.maxPayload = maxPayload;
    this.ip = ip;
    this.buf = Buffer.alloc(0);
    this.frags = null;
    this.fragLen = 0;
    this.open = true;
    this.alive = true;
    this.closeSent = false;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._finish(1006));
    socket.on('error', () => this._finish(1006));
    socket.on('end', () => this._finish(1006));
  }

  get bufferedAmount() { return this.socket.writableLength; }

  _finish(code) {
    if (!this.open) return;
    this.open = false;
    try { this.socket.destroy(); } catch { /* ignore */ }
    this.emit('close', code);
  }

  _protocolError(code = 1002) {
    this.close(code);
    setTimeout(() => this._finish(code), 200).unref?.();
  }

  _onData(chunk) {
    if (!this.open) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    if (this.buf.length > this.maxPayload * 2 + 64) return this._protocolError(1009);
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const rsv = b[0] & 0x70;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (rsv) return this._protocolError(1002);
      if (!masked) return this._protocolError(1002); // clients must mask
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2);
        if (hi !== 0) return this._protocolError(1009);
        len = b.readUInt32BE(6); off = 10;
      }
      if (len > this.maxPayload) return this._protocolError(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const payload = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      this._onFrame(fin, opcode, payload);
    }
  }

  _onFrame(fin, opcode, payload) {
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) return this._protocolError(1002);
      if (opcode === 0x8) { // close
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        if (!this.closeSent) this._sendFrame(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0));
        this.closeSent = true;
        this.socket.end();
        this._finish(code);
      } else if (opcode === 0x9) { // ping
        this._sendFrame(0xA, payload);
      } else if (opcode === 0xA) { // pong
        this.alive = true;
      } else return this._protocolError(1002);
      return;
    }
    if (opcode === 0x0) { // continuation
      if (!this.frags) return this._protocolError(1002);
      this.fragLen += payload.length;
      if (this.fragLen > this.maxPayload) return this._protocolError(1009);
      this.frags.push(payload);
      if (fin) {
        const all = Buffer.concat(this.frags);
        this.frags = null;
        this._deliver(all);
      }
      return;
    }
    if (opcode === 0x1) {
      if (this.frags) return this._protocolError(1002);
      if (fin) this._deliver(payload);
      else { this.frags = [payload]; this.fragLen = payload.length; }
      return;
    }
    if (opcode === 0x2) return this._protocolError(1003); // binary unsupported
    return this._protocolError(1002);
  }

  _deliver(buf) {
    this.alive = true;
    this.emit('message', buf.toString('utf8'));
  }

  _sendFrame(opcode, payload) {
    if (this.socket.destroyed) return false;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    header[0] = 0x80 | opcode;
    try {
      this.socket.write(header);
      this.socket.write(payload);
      return true;
    } catch {
      return false;
    }
  }

  send(text) {
    if (!this.open || this.closeSent) return false;
    return this._sendFrame(0x1, Buffer.from(text, 'utf8'));
  }

  ping() {
    if (!this.open) return;
    this._sendFrame(0x9, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (!this.open || this.closeSent) return;
    this.closeSent = true;
    const r = Buffer.from(String(reason).slice(0, 100), 'utf8');
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this._sendFrame(0x8, p);
    setTimeout(() => this._finish(code), 1000).unref?.();
  }

  terminate() { this._finish(1006); }
}

/**
 * Attach a WebSocket endpoint to an http.Server.
 * onConnection(conn, req) is called for each accepted socket.
 */
export function attachWebSocket(server, { path = '/ws', maxPayload, heartbeatMs = 15000, onConnection, allow } = {}) {
  const conns = new Set();

  server.on('upgrade', (req, socket) => {
    const reject = (code, msg) => {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { return reject(400, 'Bad Request'); }
    if (url.pathname !== path) return reject(404, 'Not Found');
    const key = req.headers['sec-websocket-key'];
    const upgrade = (req.headers.upgrade || '').toLowerCase();
    if (upgrade !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
      return reject(400, 'Bad Request');
    }
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || req.socket.remoteAddress || '';
    if (allow && !allow(ip, req)) return reject(429, 'Too Many Requests');
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const conn = new WSConn(socket, { maxPayload, ip });
    conns.add(conn);
    conn.on('close', () => conns.delete(conn));
    onConnection(conn, req);
  });

  const hb = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.terminate(); continue; }
      c.alive = false;
      c.ping();
    }
  }, heartbeatMs);
  hb.unref?.();

  return {
    conns,
    closeAll(code = 1001, reason = 'Server shutting down') {
      clearInterval(hb);
      for (const c of conns) c.close(code, reason);
    },
  };
}
