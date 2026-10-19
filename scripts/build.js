// Production build: copies the client into dist/ (minus dev-only tools) and stamps a
// build id onto the entry script so browsers fetch the new version after each deploy.
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'client');
const out = path.join(root, 'dist');

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: (p) => !p.includes(`${path.sep}dev`) });

const id = Date.now().toString(36);
const indexPath = path.join(out, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = html.replace('src="js/main.js"', `src="js/main.js?v=${id}"`).replace('href="style.css"', `href="style.css?v=${id}"`);
writeFileSync(indexPath, html);
writeFileSync(path.join(out, 'build.json'), JSON.stringify({ id, builtAt: new Date().toISOString() }, null, 2));

// sanity check: the shared game modules must load in Node (same code the server runs)
await import(path.join(out, 'shared', 'map.js'));
if (!existsSync(path.join(out, 'vendor', 'three.module.min.js'))) throw new Error('three.js missing from build');
console.log(`Built dist/ (build ${id})`);
