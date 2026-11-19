import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeTrailsOverview } from './generate-trails-overview.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const trailsRoot = path.join(projectRoot, 'trails');
const sources = ['official', 'bonus', 'custom'];
// Custom trails are git-ignored, so they get their own (also ignored) catalog
// and the committed catalog.json is the same on every machine.
export const CUSTOM_CATALOG = 'custom-catalog.json';

/**
 * Writes trails/catalog.json and the custom catalog. A file that can't be
 * parsed, or has no name, is left out with a warning rather than stopping the
 * whole catalog: one broken file must not take every other trail with it.
 * Returns the warnings, one per skipped file.
 */
/**
 * A trail's id: its folder and its file name, without the number an official
 * or bonus file starts with. The number only sets the order, so a trail moved
 * to another place keeps its id, and with it its leaderboard, best times,
 * nisse finds and unlocks. Custom trails keep the whole name: they are
 * known by their content (see trailKey in js/state.js).
 */
export function catalogId(source, name) {
  const bare = source === 'custom' ? name : name.replace(/^\d+-/, '');
  return `${source}:${bare}`;
}

export async function generateTrailCatalog() {
  const catalog = { schemaVersion: 1, trails: [] };
  const customCatalog = { schemaVersion: 1, trails: [] };
  const warnings = [];
  const ids = new Map();
  for (const source of sources) {
    const directory = path.join(trailsRoot, source);
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter(file => file.endsWith('.json')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const file of files) {
      const relativePath = `${source}/${file}`;
      let trail;
      try {
        trail = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
      } catch (error) {
        warnings.push(`Skipped trails/${relativePath}: could not parse it (${error.message}).`);
        continue;
      }
      if (!trail || typeof trail.name !== 'string' || !trail.name.trim()) {
        warnings.push(`Skipped trails/${relativePath}: it needs a string name.`);
        continue;
      }
      const id = catalogId(source, file.replace(/\.json$/i, ''));
      // Two files can't share an id, such as 04-hill.json and 09-hill.json.
      if (ids.has(id)) {
        warnings.push(`Skipped trails/${relativePath}: trails/${ids.get(id)} has the same name, and so the same id (${id}). Rename one of them.`);
        continue;
      }
      ids.set(id, relativePath);
      (source === 'custom' ? customCatalog : catalog).trails.push({
        id,
        source,
        file: relativePath,
        name: trail.name
      });
    }
  }
  await writeFile(path.join(trailsRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(path.join(trailsRoot, CUSTOM_CATALOG), `${JSON.stringify(customCatalog, null, 2)}\n`);
  // The career's overview follows the catalog (see generate-trails-overview.mjs).
  try {
    for (const warning of writeTrailsOverview()) warnings.push(`TRAILS.md: ${warning}`);
  } catch (error) {
    warnings.push(`TRAILS.md could not be written: ${error.message}`);
  }
  for (const warning of warnings) console.warn(warning);
  console.log(`Generated trails/catalog.json with ${catalog.trails.length} trails, trails/${CUSTOM_CATALOG} with ${customCatalog.trails.length}, and TRAILS.md.`);
  return warnings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateTrailCatalog();
}
