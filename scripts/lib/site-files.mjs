// The files the live site serves, shared by the service worker's precache list
// (scripts/generate-sw-core.mjs), the deploy (scripts/build-site.mjs) and the
// console test, so the site can't publish less than the game loads, nor the
// docs, scripts and tests beside it.
import { cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot } from './trails.mjs';

// Everything the two pages can request, besides the trail files (cached from
// the catalog) and the service worker itself.
const included = /\.(js|css|html|webmanifest)$|^icons\/.*\.(svg|png)$|^fonts\/.*\.woff2$/;
// Top-level folders and files that are never served to players.
const skipTop = new Set(['sw.js', 'scripts', 'trails', 'tests', 'node_modules', 'dist', 'coverage', 'netlify']);
// Served but never requested by the pages, so left out of the precache. The
// social preview is the picture a shared link to the game shows.
const SITE_ONLY = ['sw.js', '_headers', 'robots.txt', 'social-preview.png'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    const path = relative(repoRoot, full).replaceAll('\\', '/');
    if (dir === repoRoot && skipTop.has(entry.name)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (included.test(path)) out.push(path);
  }
  return out;
}

// Plain string order, identical on every machine, so the cache name is too.
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The pages' own files, relative to the repo root, in a stable order. */
export function pageFiles() {
  return walk(repoRoot).sort(byPath);
}

/** Every file the site serves: the pages' files, the shipped trails and their catalog, and the service worker and host files. */
export function siteFiles() {
  const catalog = JSON.parse(readFileSync(join(repoRoot, 'trails/catalog.json'), 'utf8'));
  const trails = catalog.trails.map(entry => `trails/${entry.file}`);
  return [...pageFiles(), 'trails/catalog.json', ...trails, ...SITE_ONLY];
}

/** Writes the site into `out`, replacing whatever was there, and returns how many files it holds. */
export function buildSite(out) {
  rmSync(out, { recursive: true, force: true });
  const files = siteFiles();
  for (const file of files) cpSync(join(repoRoot, file), join(out, file));
  return files.length;
}
