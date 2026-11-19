// Regenerates the CACHE name and CORE list in sw.js from the files the game
// and editor can load, so the precache can't drift out of sync by hand. Also
// writes js/version.js from package.json, so the menu shows the right version,
// and js/changelog.js from CHANGELOG.md for the What's new screen.
//
//   node scripts/generate-sw-core.mjs          rewrite sw.js if needed
//   node scripts/generate-sw-core.mjs --check  fail if sw.js is out of date (CI)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { readChangelog, plainText } from './lib/changelog.mjs';

const check = process.argv.includes('--check');
const root = join(import.meta.dirname, '..');
const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');

/** Writes a generated module, or fails in --check mode when it is stale. */
function generate(file, source, content, summary) {
  const path = join(root, file);
  let current = '';
  try { current = readFileSync(path, 'utf8').replaceAll('\r\n', '\n'); } catch {}
  if (current === content) return;
  if (check) {
    console.error(`${file}: out of date with ${source}. Run \`npm run sw\` and commit the result.`);
    process.exit(1);
  }
  writeFileSync(path, content);
  console.log(`${file}: ${summary}`);
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
generate('js/version.js', 'package.json',
  `// Generated from package.json by scripts/generate-sw-core.mjs; do not edit.\nexport const VERSION = ${JSON.stringify(version)};\n`,
  `updated to ${version}`);

// The What's new screen reads the release notes from a module, so they are
// precached with the rest of the game and work offline.
const changelog = readChangelog();
if (changelog.errors.length) {
  console.error(changelog.errors.join('\n'));
  process.exit(1);
}
const releases = changelog.releases.map(release => ({
  ...release,
  changes: release.changes.map(change => ({ ...change, text: plainText(change.text) }))
}));
generate('js/changelog.js', 'CHANGELOG.md', [
  '// Generated from CHANGELOG.md by scripts/generate-sw-core.mjs; do not edit.',
  "/** @type {{ version: string, date: string, changes: { type: 'new' | 'improved' | 'fixed', text: string }[] }[]} */",
  `export const RELEASES = ${JSON.stringify(releases, null, 2)};`,
  '',
].join('\n'), `updated, ${releases.length} releases`);

// Everything the two pages can request, besides the trail files (cached from
// the catalog) and the service worker itself.
const included = /\.(js|css|html|webmanifest)$|^icons\/.*\.(svg|png)$|^fonts\/.*\.woff2$/;
// Top-level folders and files that are never served to players.
const skipTop = new Set(['sw.js', 'scripts', 'trails', 'tests', 'node_modules', 'dist', 'coverage', 'netlify']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    const path = relative(root, full).replaceAll('\\', '/');
    if (dir === root && skipTop.has(entry.name)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (included.test(path)) out.push('./' + path);
  }
  return out;
}

// Plain string order, identical on every machine, so the cache name is too.
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const files = ['./', ...walk(root).sort(byPath)];

// A new cache name whenever the list or any file's content changes, so clients
// drop the old precache. Line endings are normalised so every OS gets the same hash.
const hash = createHash('sha256').update(files.join('\n'));
const binary = /\.(png|woff2)$/;
for (const file of files.slice(1)) {
  const data = readFileSync(join(root, file.slice(2)));
  hash.update('\n');
  hash.update(binary.test(file) ? data : data.toString('utf8').replaceAll('\r\n', '\n'));
}
const digest = hash.digest('hex');
const cache = `hjulben-${digest.slice(0, 8)}`;

const block = [
  `const CACHE = '${cache}';`,
  'const CORE = [',
  ...files.map((file) => `  '${file}',`),
  '];',
].join('\n');

const current = sw.match(/const CACHE = '[^']*';\r?\nconst CORE = \[[\s\S]*?\r?\n\];/);
if (!current) {
  console.error('sw.js: could not find the CACHE/CORE block; has its shape changed?');
  process.exit(1);
}
if (current[0].replaceAll('\r\n', '\n') === block) {
  console.log(`sw.js: up to date, ${files.length} files, cache ${cache}`);
  process.exit(0);
}
if (check) {
  console.error('sw.js: CORE is out of date. Run `npm run sw` and commit the result.');
  process.exit(1);
}
writeFileSync(swPath, sw.replace(current[0], block));
console.log(`sw.js: updated, ${files.length} files, cache ${cache}`);
