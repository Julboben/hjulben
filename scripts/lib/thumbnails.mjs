// The official and bonus trails' thumbnails, drawn ahead by the game's own
// renderer in headless Chrome, so the Trails screen shows images instead of
// drawing every trail the first time it opens, which costs up to a quarter
// of a second a trail. Custom trails are still drawn in the game.
//
// An image's name holds a hash of its trail file and of the code that draws
// it (every module js/scene-preview.js reaches), so a changed trail or
// drawing gets a new image under a new name: scripts/generate-trail-catalog.mjs
// draws what is missing and lists each trail's image in the catalog, and its
// --check fails while one is missing. Browsers can keep an image for good,
// since its name changes with it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chromePath, launchChrome, sleep, startStaticServer } from './chrome.mjs';
import { repoRoot } from './trails.mjs';

/** Where the images go, inside trails/. */
export const THUMBNAIL_FOLDER = 'thumbnails';

// Relative imports, re-exports, dynamic imports and workers' module URLs.
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*)["'](\.{1,2}\/[^"']+\.js)["']/g;
// Comments import types for the type checker only, which draw nothing.
const withoutComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every module `entry` reaches, itself included, relative to the repo, sorted. */
function moduleGraph(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of withoutComments(readFileSync(join(repoRoot, file), 'utf8')).matchAll(IMPORT)) {
      visit(relative(repoRoot, join(repoRoot, dirname(file), specifier)).replaceAll('\\', '/'));
    }
  };
  visit(entry);
  return [...seen].sort();
}

const text = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

let drawing = null;

/** A hash of the code that draws the thumbnails: the renderer's modules and this file, which says how. */
function drawingHash() {
  if (!drawing) {
    const hash = createHash('sha256');
    for (const file of moduleGraph('js/scene-preview.js')) hash.update(`${file}\n${text(join(repoRoot, file))}\n`);
    hash.update(text(import.meta.filename));
    drawing = hash.digest('hex');
  }
  return drawing;
}

/**
 * The image a trail's thumbnail is kept in, relative to trails/: named by its
 * catalog id (`official:the-orchard`) and a hash of its file and the drawing code.
 */
export function thumbnailFile(id, trailFile) {
  const hash = createHash('sha256').update(drawingHash()).update(text(join(repoRoot, 'trails', trailFile))).digest('hex');
  return `${THUMBNAIL_FOLDER}/${id.replace(':', '/')}-${hash.slice(0, 8)}.webp`;
}

const PAGE = '/__thumbnails__.html';
// Lossless WebP: the same pixels as the game draws, in half the bytes of a PNG.
const PAGE_SOURCE = `<!doctype html><meta charset="utf-8"><script type="module">
import { drawTrailPreview } from '/js/scene-preview.js';
window.hjulbenThumbnail = trail => {
  const canvas = document.createElement('canvas');
  drawTrailPreview(canvas, trail);
  return canvas.toDataURL('image/webp', 1);
};
</script>`;

/**
 * Draws each `{ trail, file }` into trails/<file> as the Trails screen shows
 * it. Needs Chrome; returns false without it.
 */
export async function drawThumbnails(jobs) {
  if (!chromePath) return false;
  await using server = await startStaticServer({
    handle(pathname, response) {
      if (pathname !== PAGE) return false;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(PAGE_SOURCE);
      return true;
    },
  });
  await using chrome = await launchChrome(chromePath);
  const { session, evaluate } = await chrome.openTab();
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${PAGE}` }, session);
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    await sleep(100);
    ready = await evaluate('typeof window.hjulbenThumbnail === "function"').catch(() => false);
  }
  if (!ready) throw new Error('the thumbnail page did not load');
  for (const { trail, file } of jobs) {
    const url = await evaluate(`hjulbenThumbnail(${JSON.stringify(trail)})`);
    writeFileSync(join(repoRoot, 'trails', file), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  }
  return true;
}
