import { STORAGE_FAILED_EVENT, store } from './local-store.js';
import { createTextStore } from './text-store.js';
import { canonical, trailHash } from './trail-hash.js';
import { DEV_SERVER_HEADER, DEV_SERVER_WRITABLE } from './dev-server.js';
export { terrainMaterials } from './materials.js';

async function fetchJson(url, description) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${description}: ${response.status}`);
  return { response, body: await response.json() };
}

async function loadJson(url, description) {
  return (await fetchJson(url, description)).body;
}

function checkCatalog(catalog) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.trails)) throw new Error('Unsupported trail catalog format.');
  return catalog.trails;
}

// Generated next to the git-ignored custom trail files, so only the dev
// server has it; static hosting is never asked.
async function loadCustomCatalog() {
  try {
    const response = await fetch(new URL('../trails/custom-catalog.json', import.meta.url));
    return response.ok ? checkCatalog(await response.json()) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Every trail with its file loaded, and the dev server's mark on the catalog
 * (see js/dev-server.js), null from static hosting.
 */
async function loadTrailEntries() {
  const { response, body: catalog } = await fetchJson(new URL('../trails/catalog.json', import.meta.url), 'trail catalog');
  const devServer = response.headers.get(DEV_SERVER_HEADER);
  const entries = [...checkCatalog(catalog), ...(devServer ? await loadCustomCatalog() : [])];
  return {
    devServer,
    entries: await Promise.all(entries.map(async entry => ({
      ...entry,
      trail: await loadJson(new URL(`../trails/${entry.file}`, import.meta.url), `trail ${entry.file}`)
    })))
  };
}

function showLoadError(error) {
  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;align-content:center;gap:16px;padding:24px;'
    + 'background:#0f1a1c;color:#f6f3e8;font:600 14px/1.6 ui-monospace,monospace;text-align:center;';
  // Developers opening index.html from disk get the cause; players get what to do.
  const local = ['localhost', '127.0.0.1', '[::1]', ''].includes(window.location.hostname);
  const text = document.createElement('p');
  text.style.margin = '0';
  text.textContent = local
    ? `Could not load the trails: ${error.message}. Start the game with "npm run dev" so the trail files can be fetched.`
    : 'Couldn’t load the trails — check your connection and reload.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.style.cssText = 'padding:10px 22px;border:1px solid #f6f3e8;border-radius:2px;background:#ff8952;color:#241710;font:inherit;cursor:pointer;';
  retry.addEventListener('click', () => window.location.reload());
  message.append(text, retry);
  document.body.append(message);
  retry.focus();
}

let loadedEntries, devServerMark;
try {
  ({ entries: loadedEntries, devServer: devServerMark } = await loadTrailEntries());
} catch (error) {
  showLoadError(error);
  throw error;
}

// Trails saved in the browser, each its own record ({ key, trail, shared,
// order }) in a text store, compressed: one large trail filled localStorage,
// where they were kept together under this key before.
const BROWSER_TRAILS_KEY = 'hjulben-browser-trails-v1';
const TRAIL_RECORD = 'trail:';
const library = createTextStore({
  name: 'hjulben-trails',
  adopt(local) {
    let stored;
    try {
      stored = JSON.parse(local.getItem(BROWSER_TRAILS_KEY) || 'null');
    } catch (_) {
      return [];
    }
    if (!Array.isArray(stored)) return [];
    const items = stored.filter(item => item?.key && typeof item.trail?.name === 'string');
    return [{ from: BROWSER_TRAILS_KEY, entries: items.map((item, order) => [TRAIL_RECORD + item.key, JSON.stringify({ ...item, order })]) }];
  },
});
await library.open();
// The game tells the player its storage is full (see game.js).
library.onFailure(key => globalThis.window?.dispatchEvent(new CustomEvent(STORAGE_FAILED_EVENT, { detail: { key } })));
// The last save's write, for whoever has to know it reached the database.
let browserWrite = Promise.resolve(true);
/** Whether the last trail saved in the browser was stored, once its write is done. */
export const browserTrailSaved = () => browserWrite;

// The editor hands the trail being edited to the game (index.html?playtest=1),
// which it shows in a frame, as JSON on its own window: nothing is stored, so
// a large trail can't fill the browser's storage. The key held it before.
export const PLAYTEST_TRAIL_GLOBAL = 'hjulbenPlaytestTrail';
export const PLAYTEST_TRAIL_KEY = 'hjulben-playtest-v1';
export const PLAYTEST_EXIT_MESSAGE = 'hjulben-playtest-exit';

export function readPlaytestTrail() {
  if (new URLSearchParams(window.location.search).get('playtest') !== '1') return null;
  try {
    const json = window.parent !== window ? window.parent[PLAYTEST_TRAIL_GLOBAL] : null;
    const trail = typeof json === 'string' ? JSON.parse(json) : null;
    return typeof trail?.name === 'string' ? trail : null;
  } catch (_) {
    return null;
  }
}

// Trail Maker achievements (see editorProgress in achievements.js) waiting for
// the game to give them to the active rider: the editor has no rider of its
// own, and an editor play-test doesn't count as the rider's ride.
export const EDITOR_FEATS_KEY = 'hjulben-editor-feats-v1';

/**
 * Notes a feat for the game to reward: 'publish', 'new-trail' (a custom trail
 * published for the first time), 'share' or 'playtest'.
 */
export function reportEditorFeat(feat) {
  const feats = readEditorFeats();
  feats[feat] = (feats[feat] || 0) + 1;
  try { store().setItem(EDITOR_FEATS_KEY, JSON.stringify(feats)); } catch (_) {}
}

/** @returns {Record<string, number>} feat -> times */
function readEditorFeats() {
  try {
    const stored = JSON.parse(store().getItem(EDITOR_FEATS_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, times]) => Number.isInteger(times) && times > 0));
  } catch (_) {
    return {};
  }
}

/** The feats reported since the last call, which forgets them. */
export function takeEditorFeats() {
  const feats = readEditorFeats();
  if (Object.keys(feats).length) try { store().removeItem(EDITOR_FEATS_KEY); } catch (_) {}
  return feats;
}

/** The trails saved in the browser, in the order they were first saved. */
function readBrowserLibrary() {
  const items = [];
  for (const record of library.keys(TRAIL_RECORD)) {
    try {
      const item = JSON.parse(library.read(record) || 'null');
      if (item?.key && typeof item.trail?.name === 'string') items.push(item);
    } catch (_) {}
  }
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function browserEntry({ key, trail, shared = false }) {
  return { id: `browser:${key}`, source: 'custom', storage: 'browser', key, file: null, name: trail.name, trail, shared };
}

export function slugify(name) {
  return String(name || 'trail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'trail';
}

// Browser trails live in browser storage so they work on a static deployment without a server.
export const trailEntries = [...loadedEntries, ...readBrowserLibrary().map(browserEntry)];

export const officialTrailEntries = trailEntries.filter(entry => entry.source === 'official');
// Shipped trails outside the career: best times, medals and the online board,
// but no progression. Some ask for career progress first (see unlocks.js).
export const bonusTrailEntries = trailEntries.filter(entry => entry.source === 'bonus');
export const customTrailEntries = trailEntries.filter(entry => entry.source === 'custom');
export const officialTrails = officialTrailEntries.map(entry => entry.trail);

// Career systems use only the official sequence.
export const trails = officialTrails;

export function registerTrailEntry(entry) {
  const existing = trailEntries.find(candidate => candidate.id === entry.id);
  if (existing) {
    Object.assign(existing, entry);
    return existing;
  }
  trailEntries.push(entry);
  if (entry.source === 'custom') customTrailEntries.push(entry);
  else if (entry.source === 'bonus') bonusTrailEntries.push(entry);
  return entry;
}

/** @param {{ shared?: boolean }} [options] `shared`: it came from someone's share link */
export function saveBrowserTrail(trail, key = null, { shared = false } = {}) {
  const saved = readBrowserLibrary();
  let storageKey = key;
  if (!storageKey) {
    const base = slugify(trail.name);
    const taken = new Set(saved.map(item => item.key));
    storageKey = base;
    for (let suffix = 2; taken.has(storageKey); suffix++) storageKey = `${base}-${suffix}`;
  }
  const before = saved.find(item => item.key === storageKey);
  // Stays a shared trail when the editor saves it again, and keeps its place.
  const order = before?.order ?? Math.max(-1, ...saved.map(item => item.order ?? 0)) + 1;
  const stored = { key: storageKey, trail: JSON.parse(JSON.stringify(trail)), ...(shared || before?.shared ? { shared: true } : {}), order };
  browserWrite = library.write(TRAIL_RECORD + storageKey, JSON.stringify(stored));
  return registerTrailEntry(browserEntry(stored));
}

/**
 * Saves a trail opened from a share link under Custom Trails. Opening the same
 * link again reuses the copy saved the first time, and a newer link to the
 * same trail (new props, weather or nisse, which the hash leaves out) updates
 * that copy. A link to one of your own trails finds that trail, which stays
 * yours rather than becoming shared; if the link differs from it, the link
 * opens as a shared copy rather than overwrite your edits.
 */
export function saveSharedTrail(trail) {
  const hash = trailHash(trail);
  const copies = customTrailEntries.filter(entry => entry.storage === 'browser' && entry.name === trail.name && trailHash(entry.trail) === hash);
  // Copies saved before trails lost their label may still carry one.
  const content = value => canonical({ ...value, label: undefined });
  const same = copies.find(entry => content(entry.trail) === content(trail));
  if (same) return same;
  const older = copies.find(entry => entry.shared);
  return saveBrowserTrail(trail, older?.key ?? null, { shared: true });
}

export function removeTrailEntry(id) {
  for (const list of [trailEntries, bonusTrailEntries, customTrailEntries]) {
    const index = list.findIndex(entry => entry.id === id);
    if (index >= 0) list.splice(index, 1);
  }
}

export function deleteBrowserTrail(key) {
  browserWrite = library.remove(TRAIL_RECORD + key);
  removeTrailEntry(`browser:${key}`);
}

/** Whether the page runs on the dev server and may save trail files through it. */
export const devServerWritable = devServerMark === DEV_SERVER_WRITABLE;

async function devRequest(method, file, body) {
  const response = await fetch(new URL(`../api/trails/${file}`, import.meta.url), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed with ${response.status}`);
  return result;
}

export async function saveTrailFile(file, trail) {
  const { entry } = await devRequest('PUT', file, trail);
  return registerTrailEntry({ ...entry, trail: JSON.parse(JSON.stringify(trail)) });
}

export async function deleteTrailFile(file) {
  const { entry } = await devRequest('DELETE', file);
  removeTrailEntry(entry.id);
}

/**
 * The file a custom trail should be published to: its own file while that
 * still matches the name (a numbered `-2` copy counts), otherwise a free file
 * named after it.
 */
export function customFileFor(entry, name) {
  const base = slugify(name);
  if (new RegExp(`^custom/${base}(-\\d+)?\\.json$`).test(entry.file)) return entry.file;
  return uniqueCustomFile(name);
}

/**
 * Write the trail to a new file and remove the old one. The entry keeps its
 * place in the trail lists, but takes the new file and id.
 */
export async function moveTrailFile(entry, file, trail) {
  const { entry: saved } = await devRequest('PUT', file, trail);
  await devRequest('DELETE', entry.file);
  return Object.assign(entry, saved, { trail: JSON.parse(JSON.stringify(trail)) });
}

export function uniqueCustomFile(name) {
  const base = slugify(name);
  const taken = new Set(trailEntries.map(entry => entry.file));
  let file = `custom/${base}.json`;
  for (let suffix = 2; taken.has(file); suffix++) file = `custom/${base}-${suffix}.json`;
  return file;
}
