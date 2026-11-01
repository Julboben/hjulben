import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { normalizeTrail } from '../js/trail-schema.js';
import { trailHash } from '../js/trail-hash.js';
import { MAX_JSON_BYTES, decodeTrailLink, encodeTrailLink, readSharedTrail, trailLinkFromHash, trailShareUrl } from '../js/trail-link.js';
import { loadCatalogTrails } from './lib/trails.mjs';

const rejects = (promise, pattern) => assert.rejects(promise, error => pattern.test(error.message));

// The shipped trails stand in for real ones: each survives a link unchanged,
// down to its hash, or is refused as too big when its JSON won't fit.
for (const entry of [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus')]) {
  const trail = normalizeTrail(entry.trail);
  if (new TextEncoder().encode(JSON.stringify(trail)).length > MAX_JSON_BYTES) {
    await rejects(encodeTrailLink(trail), /too big/);
    continue;
  }
  const packed = await encodeTrailLink(trail);
  assert.match(packed, /^1\.[A-Za-z0-9_-]+$/, `${entry.id} packs into URL-safe characters`);
  const opened = await readSharedTrail(`#trail=${packed}`);
  assert.deepEqual(opened, trail, `${entry.id} round-trips`);
  assert.equal(trailHash(opened), trailHash(trail), `${entry.id} keeps its hash`);
}

// The link opens the game, without the editor's query, and is found again in the hash.
{
  const trail = normalizeTrail(loadCatalogTrails('official')[0].trail);
  const url = new URL(await trailShareUrl(trail, 'https://example.com/game/?sandbox=1#old'));
  assert.equal(url.origin + url.pathname + url.search, 'https://example.com/game/');
  assert.equal(trailLinkFromHash(url.hash), await encodeTrailLink(trail));
  assert.equal(trailLinkFromHash(''), null);
  assert.equal(trailLinkFromHash('#other=1'), null);
  assert.equal(await readSharedTrail('#other=1'), null);
}

// Damaged, unknown or hostile links are refused with a message for the player.
{
  await rejects(decodeTrailLink('2.abc'), /newer version|damaged/);
  await rejects(decodeTrailLink('1.'), /newer version|damaged/);
  await rejects(decodeTrailLink('1.not base64!'), /damaged/);
  await rejects(decodeTrailLink('1.AAAA'), /damaged/);
  const notJson = deflateRawSync('{"name": ').toString('base64url');
  await rejects(decodeTrailLink(`1.${notJson}`), /damaged/);
  // A small link that inflates to more than a megabyte.
  const bomb = deflateRawSync(Buffer.alloc(4 << 20, 32)).toString('base64url');
  await rejects(decodeTrailLink(`1.${bomb}`), /too big/);
  // A trail too big to ever open again is refused before it is packed.
  assert.equal(MAX_JSON_BYTES, 1 << 20);
  await rejects(encodeTrailLink({ name: 'Huge', description: 'x'.repeat(MAX_JSON_BYTES) }), /too big/);
  // A trail that decodes but doesn't validate.
  const broken = await encodeTrailLink({ name: 'Broken', terrainBlocks: [] });
  await rejects(readSharedTrail(`#trail=${broken}`), /./);
}

// An opened link is kept under Custom Trails: opening it again reuses that
// copy, a newer link to the same trail updates it, and a link to one of your
// own trails never overwrites your edits.
{
  const stored = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: key => stored.delete(key)
  });
  // trails.js loads the catalogs when imported.
  const realFetch = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async url => {
    const path = fileURLToPath(url);
    return existsSync(path) ? { ok: true, headers: new Headers(), json: async () => JSON.parse(readFileSync(path, 'utf8')) } : { ok: false, status: 404 };
  });
  const { customTrailEntries, saveBrowserTrail, saveSharedTrail } = await import('../js/trails.js');
  globalThis.fetch = realFetch;
  const base = normalizeTrail(loadCatalogTrails('official')[0].trail);

  const linked = { ...base, name: 'Linked' };
  const copy = saveSharedTrail(linked);
  assert.equal(copy.shared, true);
  assert.equal(saveSharedTrail({ ...linked }), copy, 'the same link reuses its copy');
  const count = customTrailEntries.length;
  const updated = saveSharedTrail({ ...linked, description: 'Now with more props.' });
  assert.equal(updated.id, copy.id, 'a newer link to the same trail updates its copy');
  assert.equal(updated.trail.description, 'Now with more props.');
  assert.equal(customTrailEntries.length, count, 'without adding another');

  // A trail of your own saved before trails lost their label still carries one.
  const labelled = saveBrowserTrail({ ...base, name: 'Old own', label: 'Trail 3' });
  const relinked = saveSharedTrail({ ...base, name: 'Old own' });
  assert.equal(relinked.id, labelled.id, 'a link to your own trail finds it, even with an old label');
  assert.ok(!relinked.shared, 'and it stays yours');

  const mine = saveBrowserTrail({ ...base, name: 'Mine', description: 'My edit.' });
  assert.equal(saveSharedTrail({ ...base, name: 'Mine', description: 'My edit.' }), mine, 'a link to your own trail finds it');
  const theirs = saveSharedTrail({ ...base, name: 'Mine', description: 'An older version.' });
  assert.notEqual(theirs.id, mine.id, 'a different version of your own trail opens as a copy');
  assert.equal(theirs.shared, true);
  assert.equal(mine.trail.description, 'My edit.', 'your trail keeps your edits');
}

console.log('trail link tests passed');
