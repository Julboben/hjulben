// Editor groups are a way of working, not part of the ride: grouping a
// trail's blocks and props, or renaming a group, must keep its hash, and must
// ride exactly the same. Leaderboards, ghosts and best times are all kept
// under trailKey() in js/state.js, which is the trail's id and this hash.
import assert from 'node:assert/strict';
import { createRide, stepRide } from '../js/ride.js';
import { decodeInputs } from '../js/replay-codec.js';
import { trailHash } from '../js/trail-hash.js';
import { normalizeTrail } from '../js/trail-schema.js';
import { loadCatalogTrails, readJson, replayFile } from './lib/trails.mjs';

/** A copy of a trail with every block and prop in one of two named groups. */
function grouped(trail, names) {
  const copy = structuredClone(trail);
  const name = index => names[index % names.length];
  copy.terrainBlocks.forEach((block, index) => { block.group = name(index); });
  (copy.props || []).forEach((prop, index) => { prop.group = name(index + 1); });
  return copy;
}

/** Where a recorded run ends on a trail: everything a leaderboard or ghost depends on. */
function ride(trail, replay) {
  const run = createRide(trail, { seed: replay.seed });
  for (const input of decodeInputs(replay.inputs)) {
    stepRide(run, input);
    if (run.status !== 'running') break;
  }
  const { status, elapsed, collected, crashCause, steps, rear, front } = run;
  return { status, elapsed, collected, crashCause, steps, rear: [rear.x, rear.y], front: [front.x, front.y] };
}

const entries = [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus')];
let ridden = 0;
for (const entry of entries) {
  const house = grouped(entry.trail, ['House', 'Castle']);
  const renamed = grouped(entry.trail, ['Barn', 'Tower']);
  for (const [label, trail] of [['grouped', house], ['with groups renamed', renamed]]) {
    assert.equal(trailHash(trail), trailHash(entry.trail), `${entry.id}: ${label}, the hash is the same`);
    assert.equal(trailHash(normalizeTrail(trail)), trailHash(normalizeTrail(entry.trail)), `${entry.id}: ${label} and loaded, the hash is the same`);
  }
  // The groups survive being saved and loaded, or the editor would lose them.
  const loaded = normalizeTrail(house);
  assert.ok(loaded.terrainBlocks.every(block => block.group === 'House' || block.group === 'Castle'), `${entry.id}: blocks keep their group`);
  assert.ok(loaded.props.every(prop => prop.group === 'House' || prop.group === 'Castle'), `${entry.id}: props keep their group`);

  // A recorded run rides the grouped trail exactly as it rides the original.
  if (entry.source !== 'official') continue;
  const replay = readJson('tests/replays/' + replayFile(entry));
  assert.deepEqual(ride(house, replay), ride(entry.trail, replay), `${entry.id}: a run on the grouped trail ends exactly the same`);
  ridden++;
}

console.log(`Group tests passed (${entries.length} trails, ${ridden} runs ridden).`);
