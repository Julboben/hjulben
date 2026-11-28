import assert from 'node:assert/strict';
import { RADIUS, STEP, GRAVITY, GLASS_WEIGHT_IMPACT } from '../js/config.js';
import { cloneRide, createRide, stepRide } from '../js/ride.js';
import { terrainGeometry } from '../js/terrain.js';
import { glassStrength, paneSize } from '../js/glass.js';
import { blockTrail, polygonBlock, rectangle } from './lib/terrain-fixtures.mjs';

const PANE_TOP = 300;
const GROUND = 600;

// A pane centred on x = 400 over open ground far below.
function paneTrail(width, thickness) {
  return blockTrail([
    rectangle(0, GROUND, 1400, GROUND + 200, 'grass', 'ground'),
    rectangle(400 - width / 2, PANE_TOP, 400 + width / 2, PANE_TOP + thickness, 'glass', 'pane'),
  ], { finish: { x: 1300, y: null }, start: { x: 400, y: null, facing: 1 } });
}

// Drop height in units for a given landing speed.
const dropFor = speed => speed * speed / (2 * GRAVITY);

function ride(trail, { drop = 0, seconds = 1.5 } = {}) {
  const start = { x: 400, y: drop ? PANE_TOP - RADIUS - drop : null, facing: 1 };
  const current = createRide(trail, { start });
  const shatters = [];
  for (let step = 0; step < Math.round(seconds / STEP); step++)
    for (const event of stepRide(current, {}))
      if (event.type === 'shatter') shatters.push({ ...event, step: current.steps });
  return { ride: current, shatters };
}

const wheelsBelowPane = current => current.rear.y > PANE_TOP + 20 && current.front.y > PANE_TOP + 20;

// Strength is worked out from the pane's size.
{
  assert.equal(glassStrength(16, 96), Infinity, 'thick glass never breaks');
  assert.ok(glassStrength(4, 96) < glassStrength(8, 96), 'thinner glass is weaker');
  assert.ok(glassStrength(8, 300) < glassStrength(8, 96), 'longer glass is weaker');
}

// A pane is measured from its shape, so tilting it changes nothing.
{
  const rotated = (length, thickness, degrees) => {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    return [[0, 0], [length, 0], [length, thickness], [0, thickness]].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  };
  for (const degrees of [0, 30, 45, 90, 150]) {
    const { thickness, span } = paneSize([rotated(128, 7, degrees)]);
    assert.ok(Math.abs(thickness - 7) < 1e-6 && Math.abs(span - 128) < 1e-6, `a 7 × 128 pane at ${degrees}° measures ${thickness} × ${span}`);
  }
  const square = paneSize([rotated(40, 40, 20)]);
  assert.ok(Math.abs(square.thickness - 40) < 1e-6 && Math.abs(square.span - 40) < 1e-6, 'a square measures as itself');
}

// A tilted thin pane breaks like a level one when landed on hard.
{
  const pane = rotated => polygonBlock(rotated.map(([x, y]) => [x + 340, y + PANE_TOP]), 'glass', 'pane');
  const angle = -20 * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const outline = [[0, 0], [120, 0], [120, 7], [0, 7]].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const trail = blockTrail([rectangle(0, GROUND, 1400, GROUND + 200, 'grass', 'ground'), pane(outline)],
    { finish: { x: 1300, y: null }, start: { x: 400, y: null, facing: 1 } });
  const current = createRide(trail, { start: { x: 400, y: PANE_TOP - 140, facing: 1 } });
  const events = [];
  for (let step = 0; step < 2 / STEP; step++) events.push(...stepRide(current, {}));
  assert.ok(events.some(event => event.type === 'shatter'), 'a tilted thin pane shatters on a hard landing');
}

// A trail without glass is ridden as it is.
{
  const trail = blockTrail([rectangle(0, GROUND, 1400, GROUND + 200)]);
  assert.equal(createRide(trail).trail, trail, 'a trail without glass is not copied');
}

// Thick glass is plain terrain: it carries the bike and survives a big drop.
{
  const trail = paneTrail(200, 20);
  assert.equal(ride(trail).shatters.length, 0, 'thick glass holds a resting bike');
  const dropped = ride(trail, { drop: dropFor(500) });
  assert.equal(dropped.shatters.length, 0, 'thick glass survives a fast landing');
  assert.ok(!wheelsBelowPane(dropped.ride), 'the bike stays on thick glass');
}

// Thin glass carries the bike, holds a landing just under its strength, and
// shatters at one just over it: the bike goes through, slowed.
{
  const trail = paneTrail(200, 8);
  const strength = glassStrength(8, 200);
  const resting = ride(trail);
  assert.equal(resting.shatters.length, 0, 'thin glass holds a resting bike');
  assert.ok(!wheelsBelowPane(resting.ride), 'the bike rests on thin glass');
  const under = ride(trail, { drop: dropFor(strength * .9) });
  assert.equal(under.shatters.length, 0, `a landing just under ${strength.toFixed(0)} px/s leaves it whole`);

  const over = ride(trail, { drop: dropFor(strength * 1.15), seconds: 2.5 });
  assert.equal(over.shatters.length, 1, 'a landing just over its strength shatters it');
  const [shatter] = over.shatters;
  assert.equal(shatter.blockId, 'pane');
  assert.ok(shatter.speed > strength, `shattered at ${shatter.speed} px/s`);
  assert.deepEqual([shatter.left, shatter.right, shatter.top, shatter.bottom], [300, 500, PANE_TOP, PANE_TOP + 8]);
  assert.ok(wheelsBelowPane(over.ride), 'the bike falls through the broken pane');

  // Only that ride lost the pane: the trail and the next attempt keep it.
  assert.ok(terrainGeometry(trail).bodies.some(body => body.blockId === 'pane'), 'the trail keeps its glass');
  assert.ok(!terrainGeometry(over.ride.trail).bodies.some(body => body.blockId === 'pane'), 'the ride lost its pane');
  assert.equal(createRide(trail).trail.brokenBlocks.size, 0, 'a retry starts with whole glass');

  // Breaking replays exactly.
  const again = ride(trail, { drop: dropFor(strength * 1.15), seconds: 2.5 });
  assert.equal(again.shatters[0].step, shatter.step, 'glass breaks on the same step every time');
  assert.equal(again.ride.rear.x, over.ride.rear.x);
  assert.equal(again.ride.rear.y, over.ride.rear.y);

  // The replay bot tries many copies of one ride: a pane a copy breaks stays
  // whole for the ride it was copied from.
  const before = createRide(trail, { start: { x: 400, y: PANE_TOP - RADIUS - dropFor(strength * 1.15), facing: 1 } });
  const copy = cloneRide(before);
  for (let step = 0; step < 2.5 / STEP; step++) stepRide(copy, {});
  assert.equal(copy.trail.brokenBlocks.size, 1, 'the copy broke the pane');
  assert.equal(before.trail.brokenBlocks.size, 0, 'the ride it was copied from keeps its pane');
  assert.ok(terrainGeometry(before.trail).bodies.some(body => body.blockId === 'pane'), 'and still collides with it');
}

// Landings that don't break a pane crack it, and a cracked pane is weaker:
// the same landing that cracked it once breaks it after enough of them.
{
  const trail = paneTrail(200, 8);
  const strength = glassStrength(8, 200);
  const landings = (share, count) => {
    const current = createRide(trail, { start: { x: 400, y: PANE_TOP - RADIUS - dropFor(strength * share), facing: 1 } });
    const results = [];
    for (let landing = 0; landing < count && !current.trail.brokenBlocks.size; landing++) {
      if (landing) for (const point of current.vehicle.bikePoints) {
        point.y -= dropFor(strength * share);
        point.ox = point.x;
        point.oy = point.y;
      }
      const events = [];
      for (let step = 0; step < 1.5 / STEP; step++) events.push(...stepRide(current, {}));
      results.push({
        cracks: events.filter(event => event.type === 'crack').length,
        shattered: events.some(event => event.type === 'shatter'),
        left: current.trail.paneStrength.get('pane')?.strength ?? strength,
      });
    }
    return results;
  };

  const soft = landings(.4, 3);
  assert.ok(soft.every(landing => !landing.cracks && !landing.shattered), 'soft landings leave no mark');
  assert.equal(soft.at(-1).left, strength, 'soft landings cost no strength');

  const medium = landings(.6, 4);
  assert.ok(medium[0].cracks > 0 && !medium[0].shattered, 'a medium landing cracks the pane');
  assert.ok(medium[0].left < strength && medium[1].left < medium[0].left, 'each crack weakens it further');
  assert.equal(medium.length, 3, 'the third medium landing breaks it');
  assert.ok(medium[2].shattered);

  const hard = landings(.9, 3);
  assert.ok(hard[0].cracks > 0 && !hard[0].shattered, 'a hard landing just under its strength only cracks it');
  assert.equal(hard.length, 2, 'the second hard landing breaks it');
  assert.ok(hard[1].shattered);

  // Both wheels of one landing count once: the harder hit sets the damage.
  assert.ok(Math.abs(hard[0].left - (strength - strength * .9 * .5)) < strength * .05,
    `one hard landing leaves about ${(strength * .55).toFixed(0)} (left ${hard[0].left.toFixed(0)})`);
}

// Glass too thin for its length cannot carry the bike at all.
{
  assert.ok(glassStrength(2, 400) < GLASS_WEIGHT_IMPACT);
  const resting = ride(paneTrail(400, 2), { seconds: 2.5 });
  assert.equal(resting.shatters.length, 1, 'very thin, long glass gives way under the bike');
  assert.ok(resting.shatters[0].step < 10, `broke on step ${resting.shatters[0].step}`);
  assert.ok(wheelsBelowPane(resting.ride), 'the bike drops through');
}

// Riding flat out across a thin glass bridge leaves it whole.
{
  const trail = blockTrail([
    rectangle(0, PANE_TOP, 400, GROUND, 'grass', 'left'),
    rectangle(400, PANE_TOP, 700, PANE_TOP + 8, 'glass', 'bridge'),
    rectangle(700, PANE_TOP, 1400, GROUND, 'grass', 'right'),
  ], { finish: { x: 1300, y: null }, start: { x: 150, y: null, facing: 1 } });
  const current = createRide(trail);
  const events = [];
  for (let step = 0; step < 5 / STEP && current.status === 'running'; step++)
    events.push(...stepRide(current, { accelerating: true }));
  assert.ok(!events.some(event => event.type === 'shatter'), 'driving across thin glass does not break it');
  assert.equal(current.status, 'won', 'the bike crosses the bridge to the finish');
}

// An upright pane is a wall: riding into it fast breaks it, and the bike
// rides on through. Rolling into it slowly does not.
{
  const wallTrail = startX => blockTrail([
    rectangle(0, GROUND, 1400, GROUND + 200, 'grass', 'ground'),
    rectangle(700, 300, 708, GROUND, 'glass', 'wall'),
  ], { finish: { x: 1300, y: null }, start: { x: startX, y: null, facing: 1 } });
  const rideInto = (startX, input) => {
    const current = createRide(wallTrail(startX));
    const events = [];
    let reach = -Infinity;
    for (let step = 0; step < 5 / STEP && current.status === 'running'; step++) {
      events.push(...stepRide(current, input(current)));
      reach = Math.max(reach, current.front.x + RADIUS);
    }
    return { current, events, reach };
  };
  const fast = rideInto(100, () => ({ accelerating: true }));
  assert.ok(fast.events.some(event => event.type === 'shatter' && event.blockId === 'wall'), 'riding fast into a thin glass wall breaks it');
  assert.ok(fast.current.rear.x > 708, 'the bike rides on through the wall');
  // Throttle only until short of the wall, then roll into it.
  const slow = rideInto(600, current => ({ accelerating: current.front.x < 650 }));
  assert.ok(slow.reach > 699, `the slow bike reaches the wall (${slow.reach})`);
  assert.ok(!slow.events.some(event => event.type === 'shatter'), 'rolling gently into a glass wall leaves it whole');
}

console.log('Glass tests passed.');
