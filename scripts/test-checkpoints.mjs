// Checkpoints: flags on a long trail that a rider can go back to after a
// crash, or to give up on a bad try. Going back is an input of the run, so
// replays, ghosts and the server's check ride it exactly as it was ridden.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { trailHash } from '../js/trail-hash.js';
import { createRide, stepRide } from '../js/ride.js';
import { encodeInputs, decodeInputs } from '../js/replay-codec.js';
import { validRows } from '../netlify/lib/verify-run.mjs';
import { RADIUS } from '../js/config.js';
import { rectangle } from './lib/terrain-fixtures.mjs';

const GROUND = rectangle(-200, 320, 3000, 620, 'grass', 'ground');
const base = (extra = {}) => normalizeTrail({
  name: 'test', apples: [], spikes: [], props: [],
  terrainBlocks: [structuredClone(GROUND)],
  start: { x: 100, y: null, facing: 1 }, finish: { x: 2600, y: null },
  ...extra,
});

// A trail keeps its flags; one without has no field at all; junk is dropped.
{
  assert.deepEqual(base({ checkpoints: [{ x: '600', y: null }, { x: 900, y: 310 }] }).checkpoints, [{ x: 600, y: null }, { x: 900, y: 310 }]);
  assert.ok(!('checkpoints' in base()), 'no flags, no field');
  assert.ok(!('checkpoints' in base({ checkpoints: [] })));
  assert.ok(!('checkpoints' in base({ checkpoints: [{ y: 3 }, 'here'] })), 'a flag needs an x');
}

// Flags change what a run can do, so they change the trail's hash; a trail
// without them keeps the hash it always had.
{
  const plain = trailHash(base());
  assert.equal(trailHash(base({ checkpoints: [] })), plain);
  assert.notEqual(trailHash(base({ checkpoints: [{ x: 600, y: null }] })), plain);
}

// Validation: a flag needs ground to stand on and room for the bike.
{
  const messages = (trail) => validateTrail(trail).map((m) => `${m.type}: ${m.text}`);
  assert.ok(!messages(base({ checkpoints: [{ x: 600, y: null }] })).some((m) => /heckpoint/.test(m)), 'a flag on the ground is fine');
  assert.ok(messages(base({ checkpoints: [{ x: 5000, y: null }] })).some((m) => /^error: Checkpoint 1 .*no ground/.test(m)));
  const wall = rectangle(615, 200, 700, 320, 'stone', 'wall');
  assert.ok(messages(base({ terrainBlocks: [structuredClone(GROUND), wall], checkpoints: [{ x: 600, y: null }] }))
    .some((m) => /^error: Checkpoint 1 .*no room for the bike/.test(m)));
  assert.ok(!messages(base({ terrainBlocks: [structuredClone(GROUND), wall], checkpoints: [{ x: 580, y: null }] }))
    .some((m) => /heckpoint/.test(m)), 'clear of the wall');
}

// Respawns are steps of their own in the codec, and a run without one
// encodes as it always has.
{
  const ride = { facing: 1, leanInput: 0, accelerating: true, braking: false };
  const inputs = [ride, ride, { ...ride, respawn: true }, ride, ride];
  const rows = encodeInputs(inputs);
  assert.deepEqual(rows, [[2, 1, 0, 1, 0], [1, 1, 0, 1, 0, 1], [2, 1, 0, 1, 0]]);
  assert.deepEqual(decodeInputs(rows).map((input) => Boolean(input.respawn)), [false, false, true, false, false]);
  assert.deepEqual(encodeInputs([ride, ride]), [[2, 1, 0, 1, 0]]);
  assert.ok(validRows(rows));
  assert.ok(!validRows([[2, 1, 0, 1, 0, 1]]), 'a respawn is a single step');
  assert.ok(!validRows([[1, 1, 0, 1, 0, 2]]));
}

const GAS = { facing: 1, leanInput: 0, accelerating: true, braking: false };
const IDLE = { facing: 1, leanInput: 0, accelerating: false, braking: false };

/** Steps the ride with `input` until `until` holds, collecting the events. */
function rideUntil(ride, input, until, limit = 2000) {
  const events = [];
  for (let step = 0; step < limit && !until(ride, events); step++) events.push(...stepRide(ride, input));
  assert.ok(until(ride, events), 'the ride got there');
  return events;
}

// Riding past a flag keeps the ride as it is; going back puts the bike at
// the flag, standing still and facing as it was there, with the apples taken
// since back on the trail. The clock keeps its time and waits for the rider.
{
  const trail = base({ checkpoints: [{ x: 500, y: null }], apples: [{ x: 300, y: null }, { x: 800, y: null }] });
  const ride = createRide(trail);
  const reached = rideUntil(ride, GAS, (_, events) => events.some((event) => event.type === 'checkpoint'));
  assert.deepEqual(reached.find((event) => event.type === 'checkpoint'), { type: 'checkpoint', index: 0, x: 500, y: 320 });
  assert.equal(ride.collected, 1, 'the first apple was taken before the flag');
  rideUntil(ride, GAS, () => ride.collected === 2);
  const clock = ride.elapsedSteps;
  const events = stepRide(ride, { ...IDLE, facing: -1, respawn: true });
  assert.deepEqual(events.find((event) => event.type === 'respawn'), { type: 'respawn', index: 0, x: 500, y: 320, collected: 1, total: 2 });
  assert.equal(ride.facing, 1, 'facing the way the rider faced at the flag');
  assert.equal(ride.collected, 1);
  assert.deepEqual(ride.apples.map((apple) => apple.taken), [true, false]);
  assert.equal(ride.splits.length, 1);
  assert.ok(Math.abs((ride.rear.x + ride.front.x) / 2 - 500) < 1, 'set down at the flag');
  assert.ok(Math.abs(ride.rear.y - (320 - RADIUS)) < 3, 'on the ground');
  assert.equal(ride.started, false);
  for (let step = 0; step < 60; step++) stepRide(ride, IDLE);
  assert.equal(ride.elapsedSteps, clock, 'the clock waits at the flag');
  assert.ok(Math.abs((ride.rear.x + ride.front.x) / 2 - 500) < 1, 'standing still');
  const resumed = stepRide(ride, GAS);
  assert.ok(resumed.some((event) => event.type === 'resume') && !resumed.some((event) => event.type === 'start'));
  assert.equal(ride.elapsedSteps, clock + 1, 'and carries on from where it was');
}

// A crash after a flag is not the end: the rider goes back to it, and the
// run, crash and all, replays exactly from its inputs.
{
  const trail = base({ checkpoints: [{ x: 500, y: null }], spikes: [{ x: 900, y: 300, radius: 14 }] });
  const ride = createRide(trail, { seed: 7 });
  const inputs = [];
  const step = (input) => { inputs.push(input); return stepRide(ride, input); };
  while (ride.status === 'running' && inputs.length < 3000) step(GAS);
  assert.equal(ride.status, 'crashed');
  assert.ok(ride.checkpoint, 'the flag was reached before the spike');
  const crashedAt = ride.elapsedSteps;
  for (let index = 0; index < 120; index++) step(IDLE);
  assert.equal(ride.elapsedSteps, crashedAt, 'the clock stops while the rider is down');
  step({ ...IDLE, respawn: true });
  assert.equal(ride.status, 'running');
  assert.equal(ride.ragdoll, null);
  for (let index = 0; index < 100; index++) step({ ...GAS, accelerating: index % 3 !== 0 });

  const again = createRide(trail, { seed: 7 });
  for (const input of decodeInputs(encodeInputs(inputs))) stepRide(again, input);
  assert.equal(again.elapsedSteps, ride.elapsedSteps);
  assert.equal(again.respawns, 1);
  assert.deepEqual([again.rear.x, again.rear.y, again.front.x, again.front.y], [ride.rear.x, ride.rear.y, ride.front.x, ride.front.y]);
}

// On a trail without flags, nothing changes: a respawn does nothing.
{
  const ride = createRide(base());
  rideUntil(ride, GAS, () => ride.elapsedSteps > 100);
  const x = ride.rear.x;
  const events = stepRide(ride, { ...GAS, respawn: true });
  assert.ok(!events.some((event) => event.type === 'respawn'));
  assert.ok(ride.rear.x > x);
}

console.log('checkpoint tests passed');
