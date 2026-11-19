import http from 'node:http';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEV_SERVER_HEADER, DEV_SERVER_READ_ONLY, DEV_SERVER_WRITABLE } from '../js/dev-server.js';
import { RIDE_VERSION, simulateRun } from '../js/ride.js';
import { decodeInputs } from '../js/replay-codec.js';
import { validRows } from '../netlify/lib/verify-run.mjs';
import { catalogId, generateTrailCatalog } from './generate-trail-catalog.mjs';
import { contentType } from './lib/mime-types.mjs';
import { loadCatalogTrails, replayFile } from './lib/trails.mjs';
import './watch-trails.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const trailsRoot = path.join(projectRoot, 'trails');
const humanRunsRoot = path.join(projectRoot, 'tests', 'replays', 'human');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 8080;
const TRAIL_FILE = /^(official|bonus|custom)\/([a-z0-9][a-z0-9_-]*)\.json$/i;
// Only guards against a runaway request: the server is local, and a trail
// built from thousands of blocks can be several megabytes of JSON.
const MAX_BODY_BYTES = 50_000_000;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Is this Origin header the local page (any port, http only)? */
function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname === '::1' ? '[::1]' : url.hostname);
  } catch (_) {
    return false;
  }
}

const isJson = contentType => /^application\/json\b/i.test(String(contentType || '').trim());

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

class TooLarge extends Error {}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new TooLarge(`It is over ${MAX_BODY_BYTES / 1e6} MB, the most the dev server accepts.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The request's JSON, or an error that says whether it was too large or not JSON. */
async function readJson(request, what) {
  const text = await readBody(request).catch(error => { if (error instanceof TooLarge) throw new Error(`The ${what} is too large: ${error.message}`); throw error; });
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${what} JSON: ${error.message}`);
  }
}

/**
 * Rebuilds the catalog after a file changed. The file is already written, so
 * a catalog that can't be rebuilt is reported as a warning rather than a
 * failed save; the warning rides in the entry, which the editor shows.
 */
async function rebuildCatalog() {
  try {
    const warnings = await generateTrailCatalog();
    return warnings.length ? { warning: `The trail list could not include every file: ${warnings.join(' ')}` } : {};
  } catch (error) {
    console.error(error);
    return { warning: `The file was saved, but the trail list could not be rebuilt: ${error.message}` };
  }
}

async function handleTrailRequest(request, response, file) {
  const match = TRAIL_FILE.exec(file);
  if (!match) return sendJson(response, 400, { error: 'Trail files must be official/<name>.json, bonus/<name>.json or custom/<name>.json using letters, numbers, - and _.' });
  const [, source, name] = match;
  const target = path.join(trailsRoot, source, `${name}.json`);
  const entry = { id: catalogId(source, name), source, file: `${source}/${name}.json` };

  if (request.method === 'PUT') {
    let trail;
    try { trail = await readJson(request, 'trail'); } catch (error) { return sendJson(response, 400, { error: error.message }); }
    if (!trail || typeof trail.name !== 'string' || !trail.name.trim()) return sendJson(response, 400, { error: 'The trail needs a name.' });
    await writeFile(target, `${JSON.stringify(trail, null, 2)}\n`);
    const catalog = await rebuildCatalog();
    console.log(`Saved trails/${entry.file}`);
    return sendJson(response, 200, { ...catalog, entry: { ...entry, name: trail.name, ...catalog } });
  }
  if (request.method === 'DELETE') {
    if (source !== 'custom') return sendJson(response, 403, { error: 'Official and bonus trails cannot be deleted from the editor.' });
    await unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const catalog = await rebuildCatalog();
    console.log(`Deleted trails/${entry.file}`);
    return sendJson(response, 200, { ...catalog, entry: { ...entry, ...catalog } });
  }
  return sendJson(response, 405, { error: 'Use PUT to save or DELETE to remove a trail.' });
}

// Saves a finished run as the replay bot's reference for the official trail
// it finishes (see scripts/record-replays.mjs). The run says nothing about
// which trail it was, as a play test doesn't know its file, so it's replayed
// against every saved official trail. A play test of unsaved edits finishes
// none of them.
async function handleReferenceRun(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Use POST to save a reference run.' });
  let run;
  try { run = await readJson(request, 'run'); } catch (error) { return sendJson(response, 400, { error: error.message }); }
  // Checked before decoding: a run's counts can ask for far more steps than its size suggests.
  if (!validRows(run?.inputs)) return sendJson(response, 400, { error: 'The run\'s inputs are malformed or longer than ten minutes.' });
  if (run.physics !== RIDE_VERSION) return sendJson(response, 409, { error: 'The run was ridden with older physics. Reload the game and ride it again.' });
  const inputs = decodeInputs(run.inputs);
  const seed = Number.isFinite(run.seed) ? run.seed : 1;
  const entry = loadCatalogTrails('official').find(candidate => simulateRun(candidate.trail, inputs, { seed }).ride.status === 'won');
  if (!entry) return sendJson(response, 422, { error: 'The run doesn\'t finish any saved official trail. Save the trail first.' });
  const file = replayFile(entry);
  const target = path.join(humanRunsRoot, file);
  const previous = await readFile(target, 'utf8').then(text => JSON.parse(text).time ?? null, () => undefined);
  const { ride } = simulateRun(entry.trail, inputs, { seed });
  const saved = { trail: entry.id, time: ride.elapsed, seed, startStep: run.startStep ?? 0, physics: RIDE_VERSION, savedAt: new Date().toISOString(), inputs: run.inputs };
  await mkdir(humanRunsRoot, { recursive: true });
  await writeFile(target, `${JSON.stringify(saved)}\n`);
  console.log(`Saved tests/replays/human/${file} (${entry.trail.name}, ${ride.elapsed.toFixed(2)}s)`);
  return sendJson(response, 200, { trail: entry.id, name: entry.trail.name, time: ride.elapsed, replaced: previous !== undefined, previousTime: previous ?? null });
}

/** Tells the game it runs on the dev server, and whether the trail API below accepts its writes. */
const devServerHeader = hostname => ({ [DEV_SERVER_HEADER]: LOCAL_HOSTS.includes(hostname) ? DEV_SERVER_WRITABLE : DEV_SERVER_READ_ONLY });

async function serveStatic(request, response, pathname, hostname) {
  let filePath = path.normalize(path.join(projectRoot, decodeURIComponent(pathname)));
  const relative = path.relative(projectRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.') && part.length > 1)) {
    response.writeHead(403); return response.end('Forbidden');
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store', ...devServerHeader(hostname) });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const hostname = (request.headers.host || '').replace(/:\d+$/, '');
    if (pathname.startsWith('/api/')) {
      if (!LOCAL_HOSTS.includes(hostname)) return sendJson(response, 403, { error: 'The trail API only accepts local requests.' });
      // A page on another site can't be allowed to write trail files or
      // replays: a POST with a plain content type is a "simple" request that
      // the browser sends without asking, so the origin is checked, and
      // every write has to be JSON.
      const origin = request.headers.origin;
      if (origin !== undefined && !isLocalOrigin(origin)) return sendJson(response, 403, { error: 'The trail API only accepts requests from the local page.' });
      if ((request.method === 'POST' || request.method === 'PUT') && !isJson(request.headers['content-type']))
        return sendJson(response, 415, { error: 'The trail API only accepts application/json.' });
    }
    // No online board here. An empty answer, rather than a 404, keeps the console
    // clean; the client can't parse it, so it quietly uses the local board.
    if (pathname === '/api/leaderboard') { response.writeHead(204, { 'Cache-Control': 'no-store' }); return response.end(); }
    if (pathname.startsWith('/api/trails/')) return await handleTrailRequest(request, response, pathname.slice('/api/trails/'.length));
    if (pathname === '/api/reference-runs') return await handleReferenceRun(request, response);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed.' });
    await serveStatic(request, response, pathname, hostname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: error.message });
    else response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Hjulben dev server running at http://${host}:${port}`);
  console.log('Editor saves write directly to trails/official, trails/bonus and trails/custom. Refresh the browser manually after code changes.');
});
