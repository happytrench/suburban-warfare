#!/usr/bin/env sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed. Get the LTS version from https://nodejs.org"; exit 1; }
npm run build
( sleep 1; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1 ) &
node server/index.js
