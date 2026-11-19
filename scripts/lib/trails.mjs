import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = join(import.meta.dirname, '../../');

export function readJson(path) {
  return JSON.parse(readFileSync(root + path, 'utf8'));
}

// Loads trails exactly as the browser does: raw JSON from the catalog.
export function loadCatalogTrails(source = 'official') {
  // Custom trails are git-ignored and have their own local catalog.
  const catalogPath = source === 'custom' ? 'trails/custom-catalog.json' : 'trails/catalog.json';
  if (!existsSync(root + catalogPath)) return [];
  return readJson(catalogPath).trails
    .filter(entry => entry.source === source)
    .map(entry => ({ ...entry, trail: readJson('trails/' + entry.file) }));
}

/**
 * A trail named on the command line: a path to a JSON file, or part of the id
 * or file name of a trail in the catalogs, such as `12` or `kicker`. `file` is
 * its absolute path.
 */
export function loadTrailArgument(name) {
  const path = resolve(name);
  if (existsSync(path) && name.endsWith('.json')) {
    return { id: basename(path, '.json'), file: path, trail: JSON.parse(readFileSync(path, 'utf8')) };
  }
  for (const source of ['official', 'bonus', 'custom']) {
    // The file name too: it holds the trail's number, which the id doesn't.
    const entry = loadCatalogTrails(source).find(candidate => candidate.id.includes(name) || candidate.file.includes(name));
    if (entry) return { ...entry, file: root + 'trails/' + entry.file };
  }
  throw new Error(`no trail file or catalog trail matches "${name}"`);
}

/**
 * The file of a trail's replay in tests/replays/ (and of a human run in
 * tests/replays/human/): named by its id, without its folder, so a trail
 * moved to another place keeps its replay.
 */
export const replayFile = entry => entry.id.slice(entry.id.indexOf(':') + 1) + '.json';

/** Where scripts/playtest.mjs saves its run of a trail, and scripts/render-trail.mjs reads it. */
export const playtestRunPath = (id, variant = '') => root + '.playtest/' + id.replace(/[^\w.-]+/g, '_') + variant + '.json';

export const repoRoot = root;
