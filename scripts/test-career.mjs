// Trail ids and the career: an official or bonus trail is known by its file
// name without its number, so moving it keeps its leaderboard, best times
// and replay, and the trails a save has open are worked out from the trails
// it finished, so moving or adding trails never locks anyone out.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogId } from './generate-trail-catalog.mjs';
import { replayFile, repoRoot } from './lib/trails.mjs';

// --- Ids ---------------------------------------------------------------------------

assert.equal(catalogId('official', '05-windmill-hill'), 'official:windmill-hill', 'the number only sets the order');
assert.equal(catalogId('bonus', '01-the-bonny-tyler'), 'bonus:the-bonny-tyler');
assert.equal(catalogId('official', 'no-number'), 'official:no-number');
assert.equal(catalogId('custom', '04-my-trail'), 'custom:04-my-trail', 'custom trails keep their whole name');

// Every official and bonus file is in the catalog under its own id, and two
// files that only differ in their number would share one.
const catalog = JSON.parse(readFileSync(repoRoot + 'trails/catalog.json', 'utf8'));
for (const source of ['official', 'bonus']) {
  const files = readdirSync(repoRoot + 'trails/' + source).filter(file => file.endsWith('.json'));
  const ids = files.map(file => catalogId(source, file.replace(/\.json$/, '')));
  assert.equal(new Set(ids).size, ids.length, `no two ${source} files share an id`);
  for (const id of ids) assert.ok(catalog.trails.some(entry => entry.id === id), `${id} is in the catalog (run npm run trails)`);
}
assert.equal(replayFile({ id: 'official:windmill-hill' }), 'windmill-hill.json', 'a replay is named by the id');

// --- The open trails -------------------------------------------------------------

// trails.js loads the catalogs when imported, and state.js asks the window
// about reduced motion.
globalThis.window = /** @type {any} */ ({ matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {} });
globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem() {}, removeItem() {} });
globalThis.fetch = /** @type {any} */ (async url => {
  const path = fileURLToPath(url);
  return existsSync(path) ? { ok: true, headers: new Headers(), json: async () => JSON.parse(readFileSync(path, 'utf8')) } : { ok: false, status: 404 };
});
const { officialTrailEntries } = await import('../js/trails.js');
const { progressOf, trailKey, unlockedOf } = await import('../js/state.js');
const last = officialTrailEntries.length - 1;
const finished = (...indices) => ({ bestTimes: Object.fromEntries(indices.map(index => [trailKey(officialTrailEntries[index]), 10])) });

assert.equal(unlockedOf(null), 0, 'without a save only the first trail is open');
assert.equal(unlockedOf(finished()), 0);
assert.equal(unlockedOf(finished(0)), 1, 'finishing a trail opens the next');
assert.equal(unlockedOf(finished(0, 1, 2)), 3);
assert.equal(unlockedOf(finished(last)), last, 'finishing the last trail opens nothing past it');
// A trail edited since is still finished: its best time is under an older hash.
const edited = { bestTimes: { [officialTrailEntries[2].id + '@00000000']: 10 } };
assert.equal(unlockedOf(edited), 3, 'a trail counts as finished under any version of it');
// A trail added before ones already finished doesn't lock them: the trails
// finished stay open, whatever their place.
assert.equal(unlockedOf(finished(0, 1, 3, 4)), 5, 'trails finished stay open when a new one comes before them');
// The stored place is ignored: a save from before keeps what it finished, by id.
assert.equal(unlockedOf({ ...finished(0), unlocked: 9 }), 1, 'the stored place is not used');

assert.equal(progressOf({ ...finished(0, 1), unlocked: 9, achievements: {}, stats: {} }).trails, 2, 'progress counts the trails finished, not the stored place');

// ?debug=1 opens every trail, without counting any as finished.
globalThis.location = /** @type {any} */ ({ hostname: 'localhost', search: '?debug=1' });
assert.equal(unlockedOf(finished()), last, 'debug mode opens every trail');
assert.equal(progressOf({ ...finished(0), achievements: {}, stats: {} }).trails, 1, 'and counts only what was finished');
globalThis.location = /** @type {any} */ ({ hostname: '192.168.1.20', search: '?debug=1' });
assert.equal(unlockedOf(finished()), last, 'and works on the local network, for testing on a phone');
for (const hostname of ['example.com', 'deploy-preview-1--example.netlify.app', '10.example.com']) {
  globalThis.location = /** @type {any} */ ({ hostname, search: '?debug=1' });
  assert.equal(unlockedOf(finished()), 0, `but never on a public address such as ${hostname}`);
}
delete globalThis.location;

// --- Gear in the Garage ----------------------------------------------------------

const { lookItem } = await import('../js/cosmetics.js');
const { lookItemProgress, markGearSeen, unseenGear } = await import('../js/state.js');
const rider = (save = {}) => ({ playerId: 'rider-1', ...finished(), achievements: {}, stats: {}, ...save });
const gearProgress = (slot, id, save) => lookItemProgress(lookItem(slot, id), progressOf(rider(save)));
assert.equal(gearProgress('outfit', 'dungarees', { stats: { apples: 137 } }), '137 / 500', 'a locked item counts towards its lifetime goal');
assert.equal(gearProgress('bike', 'classic', finished(0, 1)), '2 / ' + officialTrailEntries.length, 'and towards a career goal');
assert.equal(gearProgress('outfit', 'prisoner', {}), '', 'a secret achievement keeps its goal to itself');
assert.equal(gearProgress('outfit', 'street', {}), '', 'an item everyone has counts nothing');

// A rider with no record has seen what they had won; what they win after is new until seen.
assert.deepEqual(unseenGear(rider()), [], 'a rider from before the badges starts with nothing new');
const won = rider(finished(0));
// Its time of 10 seconds wins gold, too.
assert.deepEqual(unseenGear(won), ['outfit:hoodie', 'outfit:tuxedo'], 'gear is new once won');
markGearSeen(won, ['outfit:hoodie', 'outfit:tuxedo']);
assert.deepEqual(unseenGear(won), [], 'and stops being new once seen');

// The Garage fills up with the career: a cup per gold achievement, Coda once petted.
const { garageRoom } = await import('../js/state.js');
assert.equal(garageRoom(null), null, 'without a rider the garage stays bare');
assert.deepEqual(garageRoom(rider()), { route: 0, cups: 0, nisse: false, coda: false }, 'a new rider has an empty garage');
const busy = garageRoom(rider({ ...finished(0), achievements: { 'pet-coda': 1 } }));
assert.equal(busy.route, 1 / officialTrailEntries.length, 'the map shows the route so far');
assert.equal(busy.cups, 1, 'a first gold puts a cup on the shelf');
assert.ok(busy.coda, 'Coda moves in once petted');

console.log('Career tests passed.');
