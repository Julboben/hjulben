// The official and bonus trails' thumbnails, drawn ahead by the game's own
// renderer in headless Chrome, so the Trails screen shows images instead of
// drawing every trail the first time it opens, which costs up to a quarter
// of a second a trail. Custom trails are still drawn in the game.
//
// An image is named by a hash of its pixels, so it keeps its name, and
// browsers their copy, until what it shows changes. trails/thumbnails/drawn.json
// records what the images were drawn from: a hash of the code that draws
// them (every module js/scene-preview.js reaches) and of each trail's file.
// When either changes, scripts/generate-trail-catalog.mjs draws the trail
// again; its --check fails until then. A change to the code that draws
// nothing differently then changes only the hash in drawn.json.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chromePath, launchChrome, sleep, startStaticServer } from './chrome.mjs';
import { repoRoot } from './trails.mjs';

/** Where the images go, inside trails/. */
export const THUMBNAIL_FOLDER = 'thumbnails';
const RECORD = join(repoRoot, 'trails', THUMBNAIL_FOLDER, 'drawn.json');

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
const hash = (...parts) => {
  const digest = createHash('sha256');
  for (const part of parts) digest.update(part);
  return digest.digest('hex');
};

/** A hash of the code that draws the thumbnails: the renderer's modules and this file, which says how. */
export function drawingHash() {
  return hash(...moduleGraph('js/scene-preview.js').map(file => `${file}\n${text(join(repoRoot, file))}\n`), text(import.meta.filename));
}

/** A hash of a trail's file, relative to trails/. */
export const trailFileHash = file => hash(text(join(repoRoot, 'trails', file)));

/**
 * What the images were drawn from: `code`, the drawing code's hash, and
 * `trails`, each trail's image (relative to trails/) and the hash of the
 * file it was drawn from, by catalog id.
 * @returns {{ code: string | null, trails: Record<string, { file: string, from: string }> }}
 */
export function readDrawn() {
  return existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { code: null, trails: {} };
}

export function writeDrawn(drawn) {
  writeFileSync(RECORD, `${JSON.stringify(drawn, null, 2)}\n`);
}

const PAGE = '/__thumbnails__.html';
// Lossless WebP: the same pixels as the game draws, in half the bytes of a
// PNG. Named by the pixels rather than the file, which another version of
// Chrome may encode differently.
const PAGE_SOURCE = `<!doctype html><meta charset="utf-8"><script type="module">
import { drawTrailPreview } from '/js/scene-preview.js';
window.hjulbenThumbnail = async trail => {
  const canvas = document.createElement('canvas');
  drawTrailPreview(canvas, trail);
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
  return { url: canvas.toDataURL('image/webp', 1), digest: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') };
};
</script>`;

/**
 * Draws each `{ id, trail }` as the Trails screen shows it, into an image
 * named by its catalog id (`official:the-orchard`) and its pixels. Returns
 * each image's file, relative to trails/, by id; null without Chrome.
 * @returns {Promise<Map<string, string> | null>}
 */
export async function drawThumbnails(jobs) {
  if (!chromePath) return null;
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
  const files = new Map();
  for (const { id, trail } of jobs) {
    const { url, digest } = await evaluate(`hjulbenThumbnail(${JSON.stringify(trail)})`);
    const file = `${THUMBNAIL_FOLDER}/${id.replace(':', '/')}-${digest.slice(0, 8)}.webp`;
    const path = join(repoRoot, 'trails', file);
    // The same pixels are kept as they are, even if encoded differently now.
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    }
    files.set(id, file);
  }
  return files;
}
