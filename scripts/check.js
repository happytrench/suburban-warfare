// Lightweight lint: syntax-check every JS file with Node's parser.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['server', 'client/js', 'client/shared', 'scripts', 'test'];
let n = 0, bad = 0;
for (const d of dirs) {
  let files = [];
  try { files = readdirSync(path.join(root, d)); } catch { continue; }
  for (const f of files) {
    const fp = path.join(root, d, f);
    if (!f.endsWith('.js') || !statSync(fp).isFile()) continue;
    n++;
    try { execFileSync(process.execPath, ['--check', fp], { stdio: 'pipe' }); } catch (e) { bad++; console.error(`✗ ${d}/${f}\n${e.stderr}`); }
  }
}
console.log(`${n - bad}/${n} files passed syntax check`);
if (bad) process.exit(1);
