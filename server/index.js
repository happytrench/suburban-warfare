// SUBURBAN WARFARE — single-process server.
// Serves the game client over HTTP and runs the multiplayer WebSocket endpoint (/ws)
// from the same origin, so it works behind any HTTPS proxy (wss:// is automatic).

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws.js';
import { GameServer } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Serve the production build (dist/) when it exists, unless started with --dev
// (live source files) or STATIC_DIR overrides it.
export function resolveStaticDir(env = process.env, argv = process.argv) {
  if (env.STATIC_DIR) return path.resolve(ROOT, env.STATIC_DIR);
  const dist = path.join(ROOT, 'dist');
  if (!argv.includes('--dev') && existsSync(path.join(dist, 'index.html'))) return dist;
  return path.join(ROOT, 'client');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
};

export function createGameServer({
  port = Number(process.env.PORT) || 3000,
  host = process.env.HOST || '0.0.0.0',
  staticDir = resolveStaticDir(),
  reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS) || 30000,
  maxConnsPerIp = Number(process.env.MAX_CONNS_PER_IP) || 24,
  log = (...a) => console.log(new Date().toISOString(), ...a),
} = {}) {
  const game = new GameServer({ reconnectGraceMs, log });
  const startedAt = Date.now();
  const ipCounts = new Map();

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400).end(); return; }
    const common = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    };

    if (url.pathname === '/health' || url.pathname === '/healthz') {
      res.writeHead(200, { ...common, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...game.stats() }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...common, Allow: 'GET, HEAD' }).end();
      return;
    }

    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(staticDir + path.sep)) { res.writeHead(403, common).end(); return; }

    let st;
    try { st = statSync(file); } catch { st = null; }
    if (!st || !st.isFile()) {
      res.writeHead(404, { ...common, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      ...common,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ETag: etag,
      'Cache-Control': rel.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });

  const wss = attachWebSocket(server, {
    path: '/ws',
    maxPayload: 8 * 1024,
    allow: (ip) => (ipCounts.get(ip) || 0) < maxConnsPerIp,
    onConnection: (conn) => {
      ipCounts.set(conn.ip, (ipCounts.get(conn.ip) || 0) + 1);
      conn.on('close', () => {
        const n = (ipCounts.get(conn.ip) || 1) - 1;
        if (n <= 0) ipCounts.delete(conn.ip); else ipCounts.set(conn.ip, n);
      });
      game.handleConnection(conn);
    },
  });

  game.start();

  return {
    server,
    game,
    wss,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const addr = server.address();
          log(`SUBURBAN WARFARE server listening on http://${host}:${addr.port} (static: ${path.relative(ROOT, staticDir) || '.'})`);
          resolve(addr.port);
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        game.shutdown();
        wss.closeAll();
        server.close(() => resolve());
        setTimeout(resolve, 1500).unref();
      });
    },
  };
}

// Run directly: `node server/index.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createGameServer();
  app.listen();
  let stopping = false;
  const stop = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`${sig} received — shutting down gracefully`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('uncaughtException', (e) => console.error('uncaughtException', e));
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
}
