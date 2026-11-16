// Water bodies: the data format, validation, and how the bike and rider behave in them.
import assert from 'node:assert/strict';
import { STEP } from '../js/config.js';
import { createEffects } from '../js/effects.js';
import { createRide, simulateRun, stepRide } from '../js/ride.js';
import { createBlankTrail, normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { trailHash } from '../js/trail-hash.js';
import { WATER_SIZE, WATER_WIPEOUT_DEPTH, deepWater, normalizeWater, waterAt, wheelImmersion } from '../js/water.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { propSpan, propWallFit, waterPropAt } from '../js/drawing.js';
import { DRAGONFLY_RANGE, FISH_HALF, FISH_RANGE, FROG_LEAP, SURFACE_PROPS, WATER_PROPS, dragonflyAt, fishDart, fishSwim, frogLeap, risingBubbles } from '../js/water-props.js';

const flatTrail = (overrides = {}) => ({
  name: 'test', terrainBlocks: [rectangle(0, 320, 3000, 620)],
  start: { x: 120, y: null, facing: 1 }, finish: { x: 2800, y: null }, apples: [], spikes: [], ...overrides
});
// Ground at 320, then a pit from x 600 to 1000 whose floor is at 440.
const pitTrail = water => flatTrail({
  terrainBlocks: [rectangle(0, 320, 600, 620, 'grass', 'a'), rectangle(600, 440, 1000, 620, 'grass', 'b'), rectangle(1000, 320, 3000, 620, 'grass', 'c')],
  water,
});
const hold = (steps, input) => Array.from({ length: steps }, () => ({ facing: 1, leanInput: 0, accelerating: false, braking: false, ...input }));
const warnings = trail => validateTrail(trail).filter(message => message.type === 'warning').map(message => message.text);
const errors = trail => validateTrail(trail).filter(message => message.type === 'error').map(message => message.text);

// Format: sizes default and clamp, and normalized trails always carry a list.
{
  assert.deepEqual(normalizeWater({ x: 10, y: 20 }), { x: 10, y: 20, width: WATER_SIZE.width, depth: WATER_SIZE.depth });
  assert.deepEqual(normalizeWater({ x: 0, y: 0, width: 2, depth: 1 }), { x: 0, y: 0, width: WATER_SIZE.minWidth, depth: WATER_SIZE.minDepth });
  assert.deepEqual(normalizeTrail(createBlankTrail()).water, []);
  assert.deepEqual(normalizeTrail(flatTrail()).water, [], 'trails without water get an empty list');
  const wet = normalizeTrail(flatTrail({ water: [{ x: 400, y: 288, width: 500, depth: 32 }] }));
  assert.deepEqual(normalizeTrail(wet), wet, 'water normalizes idempotently');
  assert.ok(!deepWater(WATER_WIPEOUT_DEPTH) && deepWater(WATER_WIPEOUT_DEPTH + 1));
}

// Queries: the body is open water only where there is no terrain.
{
  const bodies = [{ x: 100, y: 100, width: 100, depth: 50 }];
  assert.ok(waterAt(bodies, 150, 120));
  assert.ok(!waterAt(bodies, 150, 99) && !waterAt(bodies, 250, 120));
  // A wheel resting on the floor is immersed by the full depth, never more.
  assert.equal(wheelImmersion(bodies, 150, 140, 10), 50);
}

// The hash only changes when a trail actually has water, so existing trails and
// their leaderboards keep their ids.
{
  const plain = normalizeTrail(flatTrail());
  assert.equal(trailHash(plain), trailHash({ ...plain, water: undefined }));
  assert.notEqual(trailHash(plain), trailHash({ ...plain, water: [{ x: 400, y: 288, width: 500, depth: 32 }] }));
}

// Validation: buried water and water over the start are flagged, bad sizes are errors.
{
  assert.ok(warnings(normalizeTrail(flatTrail({ water: [{ x: 60, y: 280, width: 200, depth: 60 }] }))).some(text => /start/i.test(text)));
  assert.ok(warnings(normalizeTrail(flatTrail({ water: [{ x: 1000, y: 400, width: 200, depth: 60 }] }))).some(text => /inside terrain/i.test(text)));
  assert.ok(errors({ ...normalizeTrail(flatTrail()), water: [{ x: 400, y: NaN, width: 100, depth: 30 }] }).length > 0);
  assert.deepEqual(warnings(normalizeTrail(pitTrail([{ x: 600, y: 330, width: 400, depth: 110 }]))).filter(text => /water/i.test(text)), []);
}

// A shallow ford is ridden through, but slows the bike down.
{
  const run = water => simulateRun(flatTrail({ water }), hold(400, { accelerating: true }));
  const dry = run([]);
  const ford = run([{ x: 400, y: 320 - WATER_WIPEOUT_DEPTH, width: 500, depth: WATER_WIPEOUT_DEPTH }]);
  assert.notEqual(ford.ride.status, 'crashed', 'a ford no deeper than the threshold is rideable');
  assert.ok(ford.ride.rear.x < dry.ride.rear.x - 20, 'water slows the bike');
}

// Riding into deep water wipes the rider out, and the rider floats at the surface.
{
  const trail = pitTrail([{ x: 600, y: 330, width: 400, depth: 110 }]);
  const { ride, events } = simulateRun(trail, hold(400, { accelerating: true }), { settleSteps: 600 });
  assert.equal(ride.status, 'crashed');
  assert.equal(ride.crashCause, 'water');
  const crash = events.find(event => event.type === 'crash');
  assert.ok(crash.x > 600 && crash.x < 1000, 'the wipe-out happens in the water');
  assert.ok(events.some(event => event.type === 'splash' && !event.rider), 'the bike splashes in');
  assert.ok(events.some(event => event.type === 'splash' && event.rider), 'the rider splashes in');
  const points = ride.ragdoll.list;
  const centre = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  assert.ok(Math.abs(centre - 330) < 10, `the rider floats at the surface (centre ${centre.toFixed(1)})`);
  assert.ok(points.every(point => point.y < 440 - 4), 'no part of the rider sinks to the floor');
}

// Water is deterministic, down to every ragdoll joint.
{
  const trail = pitTrail([{ x: 600, y: 330, width: 400, depth: 110 }]);
  const run = () => simulateRun(trail, hold(400, { accelerating: true }), { settleSteps: 240 }).ride.ragdoll.list.map(p => [p.x, p.y]);
  assert.deepEqual(run(), run());
}

// Water props find their place in the body they belong to.
{
  // The pit is open water from 600 to 1000, surface at 330, bed at 440.
  const pond = [{ x: 600, y: 330, width: 400, depth: 110 }];
  const trail = normalizeTrail(pitTrail(pond));
  const fit = prop => propWallFit(trail, prop);
  // Floating props rise to the surface from anywhere in the water, or settle
  // onto it from just above.
  assert.equal(fit({ x: 700, y: 400, type: 'lily' }).surface, 330 - 400);
  assert.equal(fit({ x: 700, y: 320, type: 'duck' }).surface, 10);
  assert.equal(fit({ x: 700, y: null, type: 'lily' }).surface, 330 - 440, 'with no y it floats over the bed');
  assert.equal(fit({ x: 300, y: null, type: 'lily' }).surface, null, 'no water, nothing to float on');
  // Seaweed and reeds grow from the bed, however high in the water they are placed.
  const weed = fit({ x: 800, y: 360, type: 'seaweed' });
  assert.equal(weed.bed, 440 - 360);
  assert.ok(weed.height > 40 && weed.height <= 110 - 6, 'seaweed stops under the surface');
  const reeds = fit({ x: 800, y: null, type: 'reeds' });
  assert.equal(reeds.bed, 0);
  assert.ok(reeds.height > 110, 'reeds reach out of the water');
  assert.equal(fit({ x: 300, y: null, type: 'reeds' }).height, 56, 'reeds stand on a dry bank too');
  // A fish swims at its depth, through open water only.
  const fish = { x: 620, y: 380, type: 'fish' };
  const swim = fit(fish);
  assert.equal(swim.swim, 0);
  assert.ok(swim.left <= 20 - FISH_HALF, 'the pit wall stops it, nose to tail');
  assert.equal(swim.right, FISH_RANGE);
  assert.equal(fit({ x: 800, y: null, type: 'fish' }).swim, (330 + 440) / 2 - 440, 'with no y it swims halfway down');
  assert.deepEqual(fishSwim(fish.x, swim, 0), { dx: 0, dy: 0, dir: 1 }, 'at rest it is at its anchor, facing its way');
  assert.equal(fishSwim(fish.x, swim, 0, true).dir, -1);
  for (let time = 0; time < 60; time += 0.37) {
    const { dx } = fishSwim(fish.x, swim, time);
    assert.ok(dx >= -swim.left - 1e-9 && dx <= swim.right + 1e-9, 'it stays in open water');
  }
  // Startled toward the wall, it dives instead, and stops short of the bed.
  const dart = fishDart(swim, { dx: 0, dy: 0 }, -1, 0.7);
  assert.equal(dart.dx, -swim.left);
  assert.ok(dart.dy > 0 && dart.dy <= swim.down && 380 + swim.down < 440, JSON.stringify(dart));
  const at = waterPropAt(trail, fish, 3);
  assert.equal(at.x, fish.x + fishSwim(fish.x, swim, 3).dx, 'startled from where it has swum to');
  // Culling covers the surface above a floating prop's anchor.
  assert.ok(propSpan('lily', fit({ x: 700, y: 400, type: 'lily' }))[0] >= 70);
  // The editor warns about water props with no water.
  const stray = normalizeTrail(pitTrail(pond));
  stray.props = [
    { x: 300, y: null, type: 'fish', layer: 'back' },
    { x: 300, y: null, type: 'lily', layer: 'back' },
    { x: 300, y: null, type: 'reeds', layer: 'back' },
    { x: 700, y: 400, type: 'duck', layer: 'front' },
  ];
  const props = warnings(stray).filter(text => /^Prop/.test(text));
  assert.equal(props.length, 2, props.join('\n'));
  assert.ok(props[0].includes('Prop 1 (fish)') && props[1].includes('Prop 2 (lily)'));
}

// The frog, the rowing boat, the bubbles and the dragonflies.
{
  for (const type of ['frog', 'boat', 'bubbles', 'dragonfly']) assert.ok(WATER_PROPS.has(type), `${type} is a water prop`);
  for (const type of ['frog', 'boat', 'dragonfly']) assert.ok(SURFACE_PROPS.has(type), `${type} finds the surface`);
  // A pond 400 wide from x 400, its surface at y 300 and 60 deep.
  const pond = normalizeTrail(flatTrail({
    terrainBlocks: [rectangle(0, 360, 3000, 620)],
    water: [{ x: 400, y: 300, width: 400, depth: 60 }],
  }));
  const frog = propWallFit(pond, { type: 'frog', x: 500, y: null });
  assert.equal(frog.surface, -60, 'the frog floats on the surface above the bed');
  const bubbles = propWallFit(pond, { type: 'bubbles', x: 600, y: null });
  assert.equal(bubbles.rise, 60, 'bubbles know how far they rise to the surface');
  // The frog leaps up and away from the rider, then splashes in.
  const mid = frogLeap(FROG_LEAP / 2, 1), done = frogLeap(FROG_LEAP + 0.3, -1);
  assert.ok(mid.flying && mid.dx > 0 && mid.dy < -20, 'it arcs up and away');
  assert.ok(!done.flying && done.dx < 0 && done.rings > 0, 'then splashes in, the rings spreading');
  // Bubbles rise now and then, never past the surface, and pop there.
  assert.deepEqual(risingBubbles(0, 60, 0.3), [], 'none at time 0');
  const seen = Array.from({ length: 400 }, (_, i) => risingBubbles(i * 0.05, 60, 0.3)).flat();
  assert.ok(seen.length && seen.every((b) => b.y <= 0 && b.y >= -60), 'from the bed to the surface');
  assert.ok(seen.some((b) => b.popped) && seen.some((b) => !b.popped), 'rising, then popping');
  assert.ok(Array.from({ length: 400 }, (_, i) => risingBubbles(i * 0.05, 60, 0.3).length).filter((n) => n === 0).length > 100, 'only now and then');
  // Dragonflies hover over the water within their range, darting between spots.
  const flights = Array.from({ length: 300 }, (_, i) => dragonflyAt(i * 0.05, 0.4, 0));
  assert.ok(flights.every((f) => Math.abs(f.x) <= DRAGONFLY_RANGE.x && f.y <= -DRAGONFLY_RANGE.low + 2 && f.y >= -DRAGONFLY_RANGE.high - 2), 'over the water, within range');
  assert.ok(new Set(flights.map((f) => f.x)).size > 3, 'and darting about');
  assert.deepEqual(dragonflyAt(0, 0.4, 0), dragonflyAt(0, 0.4, 0), 'still at time 0');
}

// Riding through a ford soaks the rider's boots and legs, not their head;
// out of it they drip, and dry off slowly.
{
  const ford = normalizeTrail(flatTrail({ water: [{ x: 400, y: 296, width: 300, depth: 24 }] }));
  const ride = createRide(ford), effects = createEffects();
  effects.reset(ford);
  const wettest = { boots: 0, legs: 0, body: 0, head: 0 };
  let leftAt = null, dripped = 0;
  for (let step = 0; step < 2000 && ride.status === 'running'; step++) {
    stepRide(ride, { accelerating: true, leanInput: 0 });
    const drops = effects.particles.length;
    effects.riderWetness(ride);
    if (leftAt !== null) dripped += effects.particles.length - drops;
    for (const part of Object.keys(wettest)) wettest[part] = Math.max(wettest[part], effects.riderWet[part]);
    if (leftAt === null && ride.rear.x > 760) leftAt = { step, wet: { ...effects.riderWet } };
    if (leftAt && step - leftAt.step === Math.round(2 / STEP)) break;
  }
  assert.ok(leftAt, 'the bike gets through the ford');
  assert.equal(wettest.boots, 1, 'the boots are soaked');
  assert.ok(wettest.legs > 0.4, 'the legs are wet');
  assert.equal(wettest.head, 0, 'the head stays dry');
  assert.ok(dripped > 0, 'the rider drips once out of the water');
  const drying = leftAt.wet.boots - effects.riderWet.boots;
  assert.ok(drying > 0.1 && drying < 0.3, `two seconds out of the water dry the boots a little (${drying.toFixed(2)})`);
  effects.reset(ford);
  assert.deepEqual({ ...effects.riderWet }, { boots: 0, legs: 0, body: 0, head: 0 }, 'a new ride starts dry');
}

console.log('Water tests passed.');
