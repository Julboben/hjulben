// Saved data in the browser (js/storage.js): what survives a full store, an
// edited trail, a session renewal and a login, without a browser.
import assert from 'node:assert/strict';
import { RIDE_VERSION } from '../js/ride.js';

// --- A browser's storage, with a switch that makes every write fail ----------

const items = new Map();
let full = false;
globalThis.localStorage = /** @type {any} */ ({
  getItem: key => items.get(key) ?? null,
  setItem: (key, value) => { if (full) throw new DOMException('full', 'QuotaExceededError'); items.set(key, String(value)); },
  removeItem: key => items.delete(key),
  key: index => [...items.keys()][index] ?? null,
  get length() { return items.size; },
});
globalThis.window = /** @type {any} */ (new EventTarget());

const storage = await import('../js/storage.js');
const TRAILS = 9;
const playerId = '0a1b2c3d-1111-4222-8333-444455556666';
const ghost = (time, physics = RIDE_VERSION) => ({ time, splits: [], startStep: 0, seed: 1, inputs: [[1, 1, 0, 1, 0]], physics });

// --- Stale trail data is pruned ---------------------------------------------

{
  storage.saveGhost('official:a@1111', ghost(5));          // current version of a shipped trail
  storage.saveGhost('official:a@2222', ghost(4));          // an earlier version: gone from the catalog
  storage.saveGhost('bonus:b@3333', ghost(6, RIDE_VERSION - 1)); // current trail, but a ghost this build can't play
  storage.saveGhost('trail:custom1', ghost(7));             // a custom trail: kept, a re-import gets the same key
  storage.recordLeaderboardRun('official:a@1111', { time: 5, name: 'A' });
  storage.recordLeaderboardRun('official:a@2222', { time: 4, name: 'A' });
  storage.recordLeaderboardRun('trail:custom1', { time: 7, name: 'A' });

  storage.pruneStaleTrailData(['official:a@1111', 'bonus:b@3333']);

  assert.ok(storage.readGhost('official:a@1111'), 'the current version keeps its ghost');
  assert.equal(storage.readGhost('official:a@2222'), null, 'an outdated version loses its ghost');
  assert.equal(storage.readGhost('bonus:b@3333'), null, 'a ghost from older physics goes too');
  assert.ok(storage.readGhost('trail:custom1'), 'custom trails keep theirs');
  assert.equal(storage.readLeaderboard('official:a@1111').length, 1);
  assert.deepEqual(storage.readLeaderboard('official:a@2222'), [], 'and the outdated local board is gone');
  assert.equal(storage.readLeaderboard('trail:custom1').length, 1);
}

// --- A full store is announced, and the session carries on ------------------

{
  let failures = 0;
  window.addEventListener(storage.STORAGE_FAILED_EVENT, () => failures++);
  storage.saveGhost('official:c@4444', ghost(9, RIDE_VERSION - 1)); // something prunable, for the retry
  full = true;
  storage.saveGhost('official:d@5555', ghost(8));
  assert.equal(failures, 1, 'a write that fails even after pruning is announced');
  assert.equal(storage.readGhost('official:c@4444'), null, 'the retry first made room');
  assert.equal(storage.readGhost('official:d@5555')?.time, 8, 'the session still sees what it saved');
  full = false;
  storage.saveGhost('official:d@5555', ghost(7));
  assert.equal(failures, 1, 'a write that succeeds is quiet');
  assert.equal(JSON.parse(items.get('hjulben-ghost-v1:official:d@5555')).time, 7);
}

// --- Progress, tokens and the cloud ------------------------------------------

{
  const look = { gender: 'female', skin: 'fair' };
  const save = storage.createSave(0, look, TRAILS, 'Freja', { playerId, token: 'aaa.bbb' });
  assert.ok(save.lookUpdatedAt > 0, 'a new save knows when its look was set');

  storage.saveProgress(0, 3, 5, TRAILS);
  storage.saveProgress(0, 2, 2, TRAILS);   // a tab with older progress
  assert.equal(storage.loadSaveSlots(TRAILS)[0].unlocked, 5, 'progress only goes forward');
  assert.equal(storage.loadSaveSlots(TRAILS)[0].trail, 2);

  assert.equal(storage.renewSaveToken(playerId, 'ccc.ddd', TRAILS), 0, 'a renewed token goes into the rider\'s slot');
  assert.equal(storage.loadSaveSlots(TRAILS)[0].token, 'ccc.ddd');
  assert.equal(storage.renewSaveToken(playerId, 'not a token', TRAILS), -1, 'a malformed token is ignored');
  assert.equal(storage.renewSaveToken('0a1b2c3d-9999-4222-8333-444455556666', 'eee.fff', TRAILS), -1, 'as is one for a rider not here');
  assert.equal(storage.loadSaveSlots(TRAILS)[0].token, 'ccc.ddd');

  // The look changed last wins when the cloud copy arrives.
  const player = { id: playerId, name: 'Freja', look: { ...look, hair: 'mohawk' } };
  storage.saveLook(0, TRAILS, { ...look, hair: 'buzz' }, () => true);
  const localAt = storage.loadSaveSlots(TRAILS)[0].lookUpdatedAt;
  let applied = storage.applyCloudSave(0, TRAILS, { player, save: { look: player.look, lookUpdatedAt: localAt - 1, unlocked: 5 } });
  assert.equal(applied.save.look.hair, 'buzz', 'a look changed here after the cloud\'s stays');
  assert.equal(applied.ahead, true, 'and is uploaded');
  applied = storage.applyCloudSave(0, TRAILS, { player, save: { look: player.look, lookUpdatedAt: localAt + 1, unlocked: 5 } });
  assert.equal(applied.save.look.hair, 'mohawk', 'a look changed elsewhere later wins');
  assert.equal(applied.ahead, false);

  // Login merges the server's ghosts, but only ones this build can play.
  storage.saveGhost('official:e@6666', ghost(10));
  const index = storage.restoreOnlineSave(TRAILS, {
    token: 'ggg.hhh', player, save: null,
    runs: [
      { trail: 'official:e@6666', ghost: ghost(9, RIDE_VERSION - 1) },  // faster, but from older physics
      { trail: 'official:f@7777', ghost: ghost(12) },
    ],
  });
  assert.equal(index, 0, 'the rider lands in their own slot');
  assert.equal(storage.readGhost('official:e@6666').time, 10, 'an older-physics ghost does not oust a usable one');
  assert.equal(storage.readGhost('official:f@7777').time, 12, 'a current one is taken');
  assert.equal(storage.loadSaveSlots(TRAILS)[0].bestTimes['official:e@6666'], 9, 'its time still counts as a best');
}

// --- The ghost a rider races -------------------------------------------------

{
  const look = { gender: 'male', skin: 'fair' };
  const id = '0a1b2c3d-2222-4222-8333-444455556666';
  const player = { id, name: 'Søren', look };
  const online = storage.createSave(1, look, TRAILS, 'Søren', { playerId: id, token: 'aaa.bbb' }, 'world');
  assert.equal(online.ghost, 'world', 'a new rider keeps the ghost picked when it was created');
  assert.ok(online.ghostUpdatedAt > 0);
  const offline = storage.createSave(2, look, TRAILS, 'Offline');
  assert.equal(offline.ghost, null, 'one created without a pick goes by the device\'s setting');

  // A choice made before the setting moved into saves is copied, stamped as old as can be.
  assert.deepEqual(storage.adoptGhostSetting(TRAILS, 'on', 'on'), [], 'the default is not copied');
  assert.deepEqual(storage.adoptGhostSetting(TRAILS, 'off', 'on'), [0, 2], 'a changed setting goes to saves without a choice');
  assert.equal(storage.loadSaveSlots(TRAILS)[2].ghost, 'off');
  assert.equal(storage.loadSaveSlots(TRAILS)[2].ghostUpdatedAt, 1);
  assert.equal(storage.loadSaveSlots(TRAILS)[1].ghost, 'world', 'a rider\'s own choice stays');

  // The choice made last wins when the cloud copy arrives, and on a tie the cloud's.
  const localAt = storage.loadSaveSlots(TRAILS)[1].ghostUpdatedAt;
  const synced = { lookUpdatedAt: online.lookUpdatedAt };
  let applied = storage.applyCloudSave(1, TRAILS, { player, save: { ...synced, ghost: 'off', ghostUpdatedAt: localAt - 1 } });
  assert.equal(applied.save.ghost, 'world', 'a choice made here after the cloud\'s stays');
  assert.equal(applied.ahead, true, 'and is uploaded');
  applied = storage.applyCloudSave(1, TRAILS, { player, save: { ...synced, ghost: 'world', ghostUpdatedAt: 0 } });
  assert.equal(applied.ahead, false, 'a cloud that already has it is not sent it again');
  applied = storage.applyCloudSave(1, TRAILS, { player, save: { ...synced, ghost: 'off', ghostUpdatedAt: localAt } });
  assert.equal(applied.save.ghost, 'off', 'a tie goes to the cloud');
  assert.equal(applied.ahead, false);
  applied = storage.applyCloudSave(1, TRAILS, { player, save: synced });
  assert.equal(applied.save.ghost, 'off', 'a cloud copy without a choice keeps this one');
  assert.equal(applied.ahead, true);

  // Logging in on a new device brings the rider's choice along.
  storage.deleteSave(1, TRAILS);
  const index = storage.restoreOnlineSave(TRAILS, { token: 'ccc.ddd', player, save: { ghost: 'world', ghostUpdatedAt: 5 }, runs: [] });
  assert.equal(storage.loadSaveSlots(TRAILS)[index].ghost, 'world');
  assert.equal(storage.saveGhostMode(index, TRAILS, 'sideways'), null, 'an unknown ghost is refused');
  assert.equal(storage.saveGhostMode(index, TRAILS, 'off').ghost, 'off');
}

console.log('Storage tests passed.');
