// Writes trails/catalog.json, the list of trails the game loads, and the
// git-ignored custom catalog beside it, from the files in trails/official,
// trails/bonus and trails/custom; then TRAILS.md (see
// generate-trails-overview.mjs). Each official and bonus trail is listed with
// its thumbnail (see scripts/lib/thumbnails.mjs): this draws the ones that are
// out of date in headless Chrome and deletes the ones no trail uses any more.
//
//   node scripts/generate-trail-catalog.mjs           write them, drawing thumbnails
//   node scripts/generate-trail-catalog.mjs --check   fail if the catalog or a thumbnail is out of date
//
// The dev server and its trail watcher rebuild the catalogs without drawing,
// so a save doesn't wait for Chrome: a trail whose thumbnail is out of date
// is listed without one, and the game draws it, until this runs.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeTrailsOverview } from './generate-trails-overview.mjs';
import { drawingHash, drawThumbnails, readDrawn, THUMBNAIL_FOLDER, trailFileHash, writeDrawn } from './lib/thumbnails.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const trailsRoot = path.join(projectRoot, 'trails');
const sources = ['official', 'bonus', 'custom'];
// Custom trails are git-ignored, so they get their own (also ignored) catalog
// and the committed catalog.json is the same on every machine.
export const CUSTOM_CATALOG = 'custom-catalog.json';

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

/**
 * The catalogs as the trail files make them, without thumbnails, and the
 * trails themselves by file. A
 * file that can't be parsed, or has no name, is left out with a warning
 * rather than stopping the whole catalog: one broken file must not take
 * every other trail with it.
 */
async function readCatalogs() {
  const catalog = { schemaVersion: 1, trails: [] };
  const customCatalog = { schemaVersion: 1, trails: [] };
  const warnings = [];
  const ids = new Map();
  const trails = new Map();
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
      trails.set(relativePath, trail);
      (source === 'custom' ? customCatalog : catalog).trails.push({ id, source, file: relativePath, name: trail.name });
    }
  }
  return { catalog, customCatalog, warnings, trails };
}

const json = value => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Whether each official and bonus trail's thumbnail is fresh: drawn from the
 * trail's file and the drawing code as they are now, and still there.
 */
function freshness(drawn) {
  const code = drawingHash();
  return entry => {
    const image = drawn.trails[entry.id];
    return drawn.code === code && image?.from === trailFileHash(entry.file) && existsSync(path.join(trailsRoot, image.file));
  };
}

/**
 * Writes trails/catalog.json, the custom catalog and TRAILS.md. With `draw`,
 * draws the thumbnails that are out of date first, and deletes those no
 * trail uses any more; without, or without Chrome, a trail whose thumbnail
 * is out of date is listed without one. Returns the warnings, one per
 * skipped file.
 */
export async function generateTrailCatalog({ draw = false } = {}) {
  const { catalog, customCatalog, warnings, trails } = await readCatalogs();
  let drawn = readDrawn();
  let fresh = freshness(drawn);
  const stale = catalog.trails.filter(entry => !fresh(entry));
  if (draw && stale.length) {
    const files = await drawThumbnails(stale.map(entry => ({ id: entry.id, trail: trails.get(entry.file) })));
    if (files) {
      drawn = {
        code: drawingHash(),
        trails: Object.fromEntries(catalog.trails.map(entry => [
          entry.id, files.has(entry.id) ? { file: files.get(entry.id), from: trailFileHash(entry.file) } : drawn.trails[entry.id],
        ])),
      };
      writeDrawn(drawn);
      fresh = freshness(drawn);
      console.log(`Drew ${stale.length} thumbnail${stale.length === 1 ? '' : 's'}.`);
    } else warnings.push('Could not draw the thumbnails: they need Chrome (set CHROME_PATH). The game draws those trails itself until then.');
  }
  for (const entry of catalog.trails) if (fresh(entry)) entry.thumbnail = drawn.trails[entry.id].file;
  if (draw) {
    const used = new Set(Object.values(drawn.trails).map(image => image.file));
    for (const source of ['official', 'bonus']) {
      const folder = path.join(trailsRoot, THUMBNAIL_FOLDER, source);
      for (const file of existsSync(folder) ? await readdir(folder) : []) {
        if (!used.has(`${THUMBNAIL_FOLDER}/${source}/${file}`)) await rm(path.join(folder, file));
      }
    }
  }
  await writeFile(path.join(trailsRoot, 'catalog.json'), json(catalog));
  await writeFile(path.join(trailsRoot, CUSTOM_CATALOG), json(customCatalog));
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

/** Fails if catalog.json isn't what the trail files make, or a thumbnail is out of date. */
async function checkTrailCatalog() {
  const { catalog } = await readCatalogs();
  const drawn = readDrawn();
  const fresh = freshness(drawn);
  const stale = catalog.trails.filter(entry => !fresh(entry));
  for (const entry of catalog.trails) if (fresh(entry)) entry.thumbnail = drawn.trails[entry.id].file;
  const committed = await readFile(path.join(trailsRoot, 'catalog.json'), 'utf8').catch(() => '');
  if (committed.replaceAll('\r\n', '\n') === json(catalog) && !stale.length) {
    console.log(`trails/catalog.json: up to date, ${catalog.trails.length} trails, each with its thumbnail.`);
    return;
  }
  if (drawn.code !== drawingHash()) console.error('The code that draws trails has changed since their thumbnails were drawn.');
  else if (stale.length) console.error(`The thumbnails of ${stale.map(entry => entry.name).join(', ')} are out of date with their trails.`);
  else console.error('trails/catalog.json is out of date with the trail files.');
  console.error('Run `npm run trails` and commit the result.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--check')) await checkTrailCatalog();
  else await generateTrailCatalog({ draw: true });
}
