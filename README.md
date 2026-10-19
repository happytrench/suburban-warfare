# SUBURBAN WARFARE

A chaotic multiplayer first-person shooter set in a neighborhood governed by an extremely strict HOA.
**Pristine Pines HOA** (polos, visors, golf carts) vs. the **Backroad Boys** (flannel, overalls, pickups).
Free-for-All or Team Deathmatch, 2–8 players, room codes, map voting, playable in any modern browser.

- **Client:** Three.js (vendored in `client/vendor/`, no download needed), plain ES modules — no bundler.
- **Server:** one Node.js process that serves the game *and* the multiplayer WebSocket (`/ws`) from the same origin.
- **Dependencies:** none. `npm install` installs nothing, so there is nothing to break at deploy time.
- **Hosting:** Render free web service (`render.yaml` included).

---

## Requirements

- **Node.js 20 or newer** (22 LTS recommended) — <https://nodejs.org>
- A desktop browser with WebGL: Chrome, Edge, Firefox or Safari (keyboard + mouse).
- For online play: a free GitHub account and a free Render account.

## How to install dependencies

```bash
npm install
```

The project has no third-party packages, so this only creates/validates `package-lock.json`.

## How to run the game locally

Quickest way:

- **Windows:** double-click `start-windows.bat`
- **Mac/Linux:** run `./start-mac-linux.sh`

Or from a terminal:

```bash
npm run build
npm start
```

Then open <http://localhost:3000>. To test multiplayer alone, open a second browser window (or a private window),
create a room in one and join with the code in the other.

Friends on the **same Wi-Fi** can join at `http://YOUR-PC-LOCAL-IP:3000` (find it with `ipconfig` on Windows,
allow Node through the firewall when asked). Friends at **other houses** should use the Render deployment below.

## How to run the client and server for development

The client and server run in the same process, so one command does both:

```bash
npm run dev
```

This serves the live source files from `client/` (no build needed — just refresh the browser after editing client
code) and automatically restarts the server when files in `server/` or `client/shared/` change.

Other commands:

```bash
npm run lint     # syntax-check every JavaScript file
npm test         # automated server tests (real WebSocket clients against a real server)
```

## How to run the production build locally

```bash
npm run build    # copies client/ into dist/ with cache-busting
npm start        # serves dist/ + the WebSocket on http://localhost:3000
```

Check it's healthy: <http://localhost:3000/health> should return `{"status":"ok",...}`.

## How to create a GitHub repository and push the code

1. Go to <https://github.com/new>, name it `suburban-warfare`, leave every "initialize" box **unchecked**, click **Create repository**.
2. In this folder:

```bash
git init
git add .
git commit -m "SUBURBAN WARFARE"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/suburban-warfare.git
git push -u origin main
```

If Git asks you to sign in, use the browser sign-in prompt (or GitHub Desktop). Never paste a token into any file.

## How to deploy the repository to Render's free tier

1. Sign in at <https://dashboard.render.com> (you can sign up with GitHub).
2. Click **New → Blueprint**, connect your GitHub account if asked, and pick the `suburban-warfare` repo.
   Render reads `render.yaml` and proposes one **free** web service named `suburban-warfare`.
3. Click **Apply** (or **Deploy Blueprint**). The first build takes 1–3 minutes.

Manual alternative (if you prefer **New → Web Service**):

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

## How to configure environment variables

None are required. Render provides `PORT` automatically and the server listens on it (on `0.0.0.0`).
Optional settings (see `.env.example`), added under the service's **Environment** tab on Render:

| Variable | Default | Meaning |
|---|---|---|
| `RECONNECT_GRACE_MS` | `30000` | How long a dropped player's slot and score are kept so they can rejoin |
| `MAX_CONNS_PER_IP` | `24` | Connection cap per IP address |
| `NODE_VERSION` | `22` (set in `render.yaml`) | Node version Render uses |

## How to find the public game URL

On the Render dashboard, open the `suburban-warfare` service. The URL is at the top of the page and looks like
`https://suburban-warfare-xxxx.onrender.com`. Open `https://…onrender.com/health` to confirm it's running.

## How to create a room and invite friends

1. Open the game URL, type your name, click **Create Room**.
2. Click **Copy invite link** and send it to your friends (text, Discord, anything). The link has the room code
   built in — they just type a name and click **Join Room**. You can also read them the 4-letter code.
3. Everyone votes on the map. The host picks mode (Free-for-All / Team Deathmatch), kill limit and time limit,
   then clicks **Start Match**. In Team Deathmatch, players choose HOA or Backroad Boys in the lobby.
4. Click the game to grab the mouse. After the match, the host can **Rematch** or **Return to Lobby** for a new vote.

**Quick Play** drops you into any open public room (or makes one).

## Common errors and their fixes

| Problem | Fix |
|---|---|
| First visit takes ~1 minute / shows a Render loading page | Free services sleep after 15 minutes idle. Open the URL a couple of minutes before game night. |
| "Server unreachable — retrying…" | The server is waking up or redeploying; wait. Check `/health`. |
| "No room with code …" | Codes are case-insensitive but must match; rooms disappear when everyone leaves or the server restarts. |
| Mouse doesn't lock / can't look around | Click inside the game. After pressing Esc, browsers need ~1 second before re-locking — click Resume again. |
| Low frame rate | Settings → Graphics: **Low**, Shadows off, Render scale 80% or 60%. Make sure browser hardware acceleration is on. The game also drops to Low automatically if it detects a sustained low frame rate. |
| "Game was updated. Please refresh the page." | A new version was deployed — refresh. |
| `npm` not found / `node` not found | Install Node.js LTS from nodejs.org and reopen the terminal. |
| `EADDRINUSE` locally | Something else is on port 3000: `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`). |
| Render build fails | Check Build Command is `npm install && npm run build` and Node is 20+. |

## How to update the live game after changing code

```bash
npm run lint && npm test && npm run build    # make sure it still works
git add .
git commit -m "Describe your change"
git push
```

Render auto-deploys every push to `main` (about 1–3 minutes). Players should refresh their browsers afterward.
**Deploying restarts the server, which ends any match in progress** — deploy between matches.

---

## Limitations to know about

- **In-memory state.** Rooms, scores and matches live in server memory. A restart, redeploy, or free-tier sleep ends active matches. Nothing is stored long-term (no accounts, no database).
- **Free tier sleep.** Render's free service sleeps after 15 minutes with no traffic and takes about a minute to wake. An active match keeps it awake.
- **Single instance.** All rooms run on one modest server. It was tested with simulated clients, not with 8 people on 8 real internet connections; expect it to handle a group of friends comfortably.
- **Anti-cheat is basic.** The server owns health, damage, kills and fire rate, and rejects impossible movement, but movement is client-predicted. Fine for friends, not for strangers.
- **Frame rate** is capped by the monitor's refresh rate (most laptops: 60 Hz).

## Project layout

```
client/               browser game (served as-is in dev, copied to dist/ for production)
  index.html, style.css
  js/                 main.js (game loop/UI), world.js (map rendering), characters.js, net.js, audio.js, textures.js
  shared/             constants.js, map.js, physics.js — used by BOTH client and server
  vendor/             three.module.min.js (MIT, see THREE_LICENSE.txt)
server/
  index.js            HTTP static server, /health, WebSocket endpoint, graceful shutdown
  ws.js               dependency-free WebSocket (RFC 6455) implementation
  game.js             rooms, voting, validation, hit detection, match loop
scripts/              build.js, check.js
test/                 automated server tests
render.yaml           Render deployment blueprint
```
