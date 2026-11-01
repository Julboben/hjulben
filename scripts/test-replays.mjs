import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { RADIUS, STEP, WHEELBASE } from '../js/config.js';
import { createRide, stepRide, riderCollisionPoints, simulateRun } from '../js/ride.js';
import { createRagdoll, stepRagdoll, HELMET_KNOCK_MAX, HELMET_RADIUS } from '../js/ragdoll.js';
import { decodeInputs, encodeInputs } from '../js/replay-codec.js';
import { terrainCollisionsAt, terrainAt } from '../js/terrain.js';
import { loadCatalogTrails, readJson, replayFile, repoRoot } from './lib/trails.mjs';
import { polygonBlock, rectangle } from './lib/terrain-fixtures.mjs';

const FINISH_TOLERANCE = .05;
const flatTrail = (overrides = {}) => ({
  name: 'test', terrainBlocks: [rectangle(0, 320, 3000, 620)],
  start: { x: 120, y: null, facing: 1 }, finish: { x: 2800, y: null }, apples: [], spikes: [], ...overrides
});
const hold = (steps, input) => Array.from({ length: steps }, () => ({ facing: 1, leanInput: 0, accelerating: false, braking: false, ...input }));
const deepestPenetration = (trail, points, radius) => Math.max(0, ...points.flatMap(point =>
  terrainCollisionsAt(trail, point.x, point.y, radius ?? point.radius).map(contact => contact.penetration)));

// Recorded runs through every official trail must reproduce their outcome.
const entries = loadCatalogTrails('official');
const expectedFixtures = new Set(entries.map(replayFile));
const staleFixtures = readdirSync(repoRoot + 'tests/replays').filter(file => file.endsWith('.json') && !expectedFixtures.has(file));
assert.deepEqual(staleFixtures, [], `replay fixtures without an official trail: ${staleFixtures.join(', ')}; run node scripts/record-replays.mjs`);
for (const entry of entries) {
  const path = 'tests/replays/' + replayFile(entry);
  assert.ok(existsSync(repoRoot + path), `missing replay fixture ${path}; run node scripts/record-replays.mjs`);
  const replay = readJson(path);
  assert.equal(replay.trail, entry.id);
  const inputs = decodeInputs(replay.inputs);
  assert.equal(inputs.length, replay.steps, `${entry.id}: decoded step count`);
  assert.deepEqual(encodeInputs(inputs), replay.inputs, `${entry.id}: replay encoding round-trips`);

  const ride = createRide(entry.trail, { seed: replay.seed });
  let worstPenetration = 0;
  for (const input of inputs) {
    stepRide(ride, input);
    const points = ride.vehicle.bikePoints;
    assert.ok(points.every(point => Number.isFinite(point.x + point.y + point.ox + point.oy)), `${entry.id}: state stays finite at step ${ride.steps}`);
    // Against the ride's own terrain, which loses its glass panes as they break.
    worstPenetration = Math.max(worstPenetration, deepestPenetration(ride.trail, [ride.rear, ride.front], RADIUS));
    if (ride.status !== 'running') break;
  }
  assert.ok(worstPenetration < RADIUS * .75, `${entry.id}: wheels never tunnel into terrain (deepest ${worstPenetration.toFixed(2)})`);
  const { outcome } = replay;
  assert.equal(ride.status, outcome.status, `${entry.id}: outcome`);
  assert.equal(ride.collected, outcome.collected, `${entry.id}: apples collected`);
  assert.equal(ride.crashCause, outcome.crashCause, `${entry.id}: crash cause`);
  assert.ok(Math.abs(ride.elapsed - outcome.elapsed) <= FINISH_TOLERANCE,
    `${entry.id}: finish time ${ride.elapsed.toFixed(3)}s within ${FINISH_TOLERANCE}s of ${outcome.elapsed}s`);
  if (outcome.status === 'won') assert.equal(ride.collected, ride.apples.length, `${entry.id}: a win collects every apple`);
}

// Riding into a spike kills the rider and reports the cause.
{
  const trail = flatTrail({ spikes: [{ x: 400, y: 300, radius: 18 }] });
  const { ride, events } = simulateRun(trail, hold(600, { accelerating: true }));
  assert.equal(ride.status, 'crashed');
  assert.equal(ride.crashCause, 'spike');
  const crash = events.find(event => event.type === 'crash');
  assert.ok(crash && Math.abs(crash.x - 400) < 30, 'spike crash is reported at the spike');
}

// Same inputs and seed give the same crash, down to every ragdoll joint.
{
  const trail = flatTrail({ spikes: [{ x: 400, y: 300, radius: 18 }] });
  const run = () => simulateRun(trail, hold(600, { accelerating: true }), { settleSteps: 240 }).ride.ragdoll.list.map(p => [p.x, p.y]);
  assert.deepEqual(run(), run());
}

// Timer starts on first input, not on spawn.
{
  const ride = createRide(flatTrail());
  for (let step = 0; step < 120; step++) stepRide(ride, { facing: 1 });
  assert.equal(ride.elapsed, 0, 'idle bike does not run the clock');
  assert.ok(ride.time > .9);
  const events = stepRide(ride, { facing: 1, accelerating: true });
  assert.ok(events.some(event => event.type === 'start'));
  assert.ok(Math.abs(ride.elapsed - STEP) < 1e-9);
}

// A bike set down on a steep slope rolls away by itself, and that starts the
// clock, or waiting would be a free head start. Creeping down a gentle slope
// doesn't, however long the rider waits.
{
  // The ground falls `drop` over 3000 units: about 20° and 6°.
  const slope = drop => flatTrail({ terrainBlocks: [polygonBlock([[-200, 300], [0, 300], [3000, 300 + drop], [3000, 700 + drop], [-200, 700 + drop]], 'grass', 'slope')], start: { x: 500, y: null, facing: 1 } });
  const steep = createRide(slope(1092));
  const events = [];
  for (let step = 0; step < Math.round(3 / STEP); step++) events.push(...stepRide(steep, { facing: 1 }));
  assert.ok(events.some(event => event.type === 'start'), 'rolling away starts the clock');
  assert.ok(steep.elapsed > 1.5, `and soon: it runs while the bike rolls (${steep.elapsed.toFixed(2)} s of 3)`);
  const gentle = createRide(slope(315));
  for (let step = 0; step < Math.round(60 / STEP); step++) stepRide(gentle, { facing: 1 });
  assert.equal(gentle.elapsed, 0, 'creeping for a minute does not');
  // A start in the air drops the bike, and the drop is timed: the clock starts
  // as it falls, not when it lands.
  const air = createRide(flatTrail({ start: { x: 500, y: 100, facing: 1 } }));
  let landed = false;
  for (let step = 0; step < Math.round(3 / STEP) && !landed; step++) {
    stepRide(air, { facing: 1 });
    landed = air.rear.grounded || air.front.grounded;
  }
  assert.ok(landed && air.started && air.elapsed > 0.3, `dropping from a start in the air starts the clock before landing (${air.elapsed.toFixed(2)} s timed)`);
  const drop = createRide(flatTrail({ start: { x: 500, y: 100, facing: 1 } }));
  stepRide(drop, { facing: 1 });
  assert.ok(drop.started, 'from its first step: no part of the drop is free');
}

// A bike on the ground starts settled on its suspension and at rest, so it
// doesn't bounce, and waiting for it to settle gains nothing.
{
  const ride = createRide(flatTrail());
  assert.ok(ride.rear.compression > 3 && ride.front.compression > 2, `it starts sunk into its suspension (${ride.rear.compression.toFixed(1)}, ${ride.front.compression.toFixed(1)})`);
  let fastest = 0;
  for (let step = 0; step < 120; step++) {
    stepRide(ride, { facing: 1 });
    fastest = Math.max(fastest, Math.hypot(ride.rear.x - ride.rear.ox, ride.rear.y - ride.rear.oy, ride.front.x - ride.front.ox, ride.front.y - ride.front.oy) / STEP);
  }
  assert.ok(fastest < .1, `and stays still (${fastest.toFixed(3)} units/s at most)`);
}

// Gas held on the brakes revs the engine against them without moving the
// bike, and letting the brakes go drops the clutch at high revs.
{
  const ride = createRide(flatTrail());
  const x = ride.rear.x;
  for (let step = 0; step < 60; step++) stepRide(ride, { facing: 1, accelerating: true, braking: true });
  assert.ok(ride.vehicle.engine.rev > 60, `it revs (${ride.vehicle.engine.rev.toFixed(1)})`);
  assert.ok(Math.abs(ride.rear.x - x) < 1, 'and the brakes hold the bike');
  const launch = (revSteps) => {
    const bike = createRide(flatTrail());
    for (let step = 0; step < revSteps; step++) stepRide(bike, { facing: 1, accelerating: true, braking: true });
    for (let step = 0; step < 60; step++) stepRide(bike, { facing: 1, accelerating: true });
    return bike.rear.x;
  };
  assert.ok(launch(60) > launch(0) + 1, 'a revved launch pulls harder over its first half second');
}

// The finish is timed to the moment within its step that the bike reached the
// flower, not to the step's end.
{
  const { ride } = simulateRun(flatTrail({ finish: { x: 600, y: null } }), hold(600, { accelerating: true }));
  assert.equal(ride.status, 'won');
  const whole = ride.elapsedSteps * STEP;
  assert.ok(ride.elapsed > whole - STEP && ride.elapsed < whole - 1e-6, `a finish between steps (${ride.elapsed} s, the step ends at ${whole} s)`);
}
// A bike put down on its start, on every shipped trail, stays put long enough
// that only the rider starts the clock.
for (const entry of [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus')]) {
  const ride = createRide(entry.trail);
  for (let step = 0; step < Math.round(10 / STEP); step++) stepRide(ride, { facing: entry.trail.start.facing });
  assert.equal(ride.elapsed, 0, `${entry.id}: the bike stays on its start until the rider moves it`);
}

// Rider probes are anchored to the chassis and sit above the wheels at rest.
{
  const ride = createRide(flatTrail());
  for (let step = 0; step < 120; step++) stepRide(ride, { facing: 1 });
  const { head, hip } = riderCollisionPoints(ride);
  const mx = (ride.rear.x + ride.front.x) / 2, my = (ride.rear.y + ride.front.y) / 2;
  assert.ok(Math.abs(head.x - mx - 3) < 1.5 && my - head.y > 38 && my - head.y < 48, 'head probe above the bike');
  assert.ok(hip.y > head.y);
  for (const point of ride.vehicle.chassisPoints) { point.y -= (point.x - mx) * .2; point.oy = point.y; }
  const pitched = riderCollisionPoints(ride);
  assert.ok(Math.abs(pitched.head.x - head.x) > 3, 'probes follow chassis pitch');
}

// After a crash the ragdoll keeps knees and elbows bending the right way and
// the riderless bike stays on top of the ground.
{
  const trail = flatTrail({ spikes: [{ x: 300, y: 300, radius: 18 }] });
  const { ride } = simulateRun(trail, hold(600, { accelerating: true }), { settleSteps: 480 });
  assert.equal(ride.status, 'crashed');
  const cross = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  for (const hinge of ride.ragdoll.hinges) {
    const { [hinge.a]: a, [hinge.joint]: joint, [hinge.b]: b } = ride.ragdoll.points;
    assert.ok(cross(a, joint, b) * hinge.side >= -1e-6, `${hinge.joint} bends forwards only`);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= hinge.minSpan - .5, `${hinge.joint} respects the fold limit`);
  }
  assert.ok(ride.ragdoll.list.every(p => Number.isFinite(p.x + p.y)));
  assert.ok(deepestPenetration(trail, ride.vehicle.chassisPoints) < 2, 'crashed chassis rests on the ground');
  const ground = terrainAt(trail, ride.vehicle.chassis.top.x).y;
  assert.ok(ride.vehicle.chassisPoints.every(point => point.y < ground + 1), 'chassis did not sink through the ground');
}

// The thrown rider keeps the neck and hips inside their limits, comes to rest
// on flat ground, and grips a moderate slope instead of creeping down it.
{
  const turn = (a, joint, b, mirror) => Math.atan2(
    (joint.x - a.x) * (b.y - joint.y) - (joint.y - a.y) * (b.x - joint.x),
    (joint.x - a.x) * (b.x - joint.x) + (joint.y - a.y) * (b.y - joint.y)) * mirror;
  const check = (trail, label) => {
    const { ride } = simulateRun(trail, hold(900, { accelerating: true }));
    assert.equal(ride.status, 'crashed', `${label}: crashes`);
    const { points } = ride.ragdoll;
    let restX = null;
    for (let step = 0; step < 1200; step++) {
      stepRide(ride, {});
      for (const limit of ride.ragdoll.angleLimits) {
        const angle = turn(points[limit.a], points[limit.joint], points[limit.b], limit.mirror);
        assert.ok(angle >= limit.least - .05 && angle <= limit.most + .05, `${label}: ${limit.joint} stays inside its limit`);
      }
      if (step === 900) restX = points.hip.x;
    }
    assert.ok(ride.ragdoll.asleep, `${label}: the rider comes to rest`);
    assert.ok(Math.abs(points.hip.x - restX) < .5, `${label}: the rider stays put`);
  };
  check(flatTrail({ spikes: [{ x: 400, y: 300, radius: 18 }] }), 'flat');
  check(flatTrail({
    terrainBlocks: [polygonBlock([[0, 320], [300, 320], [1300, 720], [3000, 720], [3000, 1200], [0, 1200]])],
    spikes: [{ x: 500, y: 380, radius: 18 }],
  }), 'slope');
}

// Landing head-first on a kicker folds the rider past half a turn at the hip;
// the hip limit must unfold it the short way round instead of flinging the
// rider high into the air.
{
  const trail = {
    name: 'kicker', finish: { x: 2800, y: null }, apples: [], spikes: [],
    start: { x: 120, y: null, facing: 1 },
    terrainBlocks: [polygonBlock([[0, 320], [400, 320], [600, 220], [640, 220], [640, 320], [3000, 320], [3000, 620], [0, 620]])],
  };
  const ride = createRide(trail, { seed: 1 });
  for (let step = 0; step < 1400 && ride.status === 'running'; step++) {
    stepRide(ride, { facing: 1, accelerating: step < 440, leanInput: step > 380 ? -.5 : 0 });
  }
  assert.equal(ride.status, 'crashed', 'kicker landing crashes');
  let landed = false, lowest = -Infinity, rise = 0;
  for (let step = 0; step < 720; step++) {
    stepRide(ride, {});
    const list = ride.ragdoll.list;
    landed ||= list.some(point => point.grounded);
    if (!landed) continue;
    const centre = list.reduce((sum, point) => sum + point.y, 0) / list.length;
    lowest = Math.max(lowest, centre);
    rise = Math.max(rise, lowest - centre);
  }
  assert.ok(rise < 40, `ragdoll stays down after a head-first landing (rose ${rise.toFixed(0)} px)`);
}

// A rider thrown onto flat ground still glides after landing: a hard impact
// must not turn the ground grip into a dead stop.
{
  const trail = flatTrail();
  let slide = 0;
  for (let throwIndex = 0; throwIndex < 10; throwIndex++) {
    let seed = throwIndex * 7919 + 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dx = 600 * STEP, dy = 4;
    const wheel = (x, y) => ({ x, y, ox: x - dx, oy: y - dy });
    const ragdoll = createRagdoll(wheel(175, 280), wheel(225, 280 - (throwIndex % 5 - 2) * 6), 1, random);
    let landX = null;
    for (let step = 0; step < 1200; step++) {
      stepRagdoll(ragdoll, trail);
      if (landX === null && ragdoll.list.some(point => point.grounded)) landX = ragdoll.points.hip.x;
    }
    slide += (ragdoll.points.hip.x - landX) / 10;
  }
  assert.ok(slide > 140, `thrown rider glides after landing (${slide.toFixed(0)} px)`);
}

// Once sliding, the rider skids a good way on flat ground and further down a
// hill, then still comes to rest instead of creeping on.
{
  const slope = (degrees) => {
    const drop = 5800 * Math.tan(degrees * Math.PI / 180);
    return flatTrail({
      terrainBlocks: [polygonBlock([[0, 320], [200, 320], [6000, 320 + drop], [6000, 720 + drop], [0, 720 + drop]])],
    });
  };
  const slide = (degrees) => {
    const trail = slope(degrees);
    let total = 0;
    for (let throwIndex = 0; throwIndex < 6; throwIndex++) {
      let seed = throwIndex * 7919 + 1;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const dx = 600 * STEP;
      const wheel = (x, y) => ({ x, y, ox: x - dx, oy: y - 2 });
      const ragdoll = createRagdoll(wheel(175, 280), wheel(225, 280 - (throwIndex % 3 - 1) * 6), 1, random);
      let landX = null, steps = 0;
      for (; steps < 1200 && !ragdoll.asleep; steps++) {
        stepRagdoll(ragdoll, trail);
        if (landX === null && ragdoll.list.some(point => point.grounded)) landX = ragdoll.points.hip.x;
      }
      assert.ok(ragdoll.asleep, `${degrees}°: thrown rider ${throwIndex} comes to rest (still moving after ${steps} steps)`);
      total += (ragdoll.points.hip.x - landX) / 6;
    }
    return total;
  };
  const flat = slide(0), hill = slide(20);
  assert.ok(flat > 300, `thrown rider skids along flat ground (${flat.toFixed(0)} px)`);
  assert.ok(hill > flat + 50, `and further down a hill (${hill.toFixed(0)} px vs ${flat.toFixed(0)} px)`);
}

// A bike tumbling over the rider it has just thrown must not fling them: the
// body only collides with the bike once all of it is clear, so a free arm
// caught on the bike can't drag the rest along. This crash used to launch the
// rider upwards at over 200 px/s.
{
  const entry = entries.find(candidate => candidate.id === 'official:brake-point');
  let seed = 2 * 31 + 7 + 6000;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ride = createRide(entry.trail, { seed: 2 });
  let leanInput = 0;
  for (let step = 0; step < 4000 && ride.status === 'running'; step++) {
    if (step % 40 === 0) leanInput = random() < .5 ? 0 : random() * 2 - 1;
    stepRide(ride, { facing: 1, accelerating: random() < .9, leanInput });
  }
  assert.equal(ride.status, 'crashed', 'brake-point bot run crashes (update this scenario if the trail changed)');
  let rising = 0;
  for (let step = 0; step < 400; step++) {
    stepRide(ride, {});
    if (step < 10) continue;
    let momentum = 0, mass = 0;
    for (const point of ride.ragdoll.list) {
      momentum += (point.y - point.oy) / point.inverseMass;
      mass += 1 / point.inverseMass;
    }
    rising = Math.max(rising, -momentum / mass / STEP);
  }
  assert.ok(rising < 100, `tumbling bike doesn't fling the rider (rose at ${rising.toFixed(0)} px/s)`);
}

// Riding face-first into a beam at speed knocks the helmet off; it tumbles
// away on its own, comes to rest on the ground, and does so the same way
// every time.
{
  const trail = flatTrail({ terrainBlocks: [rectangle(0, 320, 3000, 620), rectangle(1200, 100, 1400, 270)] });
  const run = () => {
    const ride = createRide(trail, { seed: 3 });
    const knocks = [];
    for (let step = 0; step < 2400; step++)
      knocks.push(...stepRide(ride, { facing: 1, accelerating: ride.status === 'running' }).filter(event => event.type === 'helmet'));
    return { ride, knocks };
  };
  const { ride, knocks } = run();
  assert.equal(ride.crashCause, 'head', 'the beam stops the rider by the head');
  assert.equal(knocks.length, 1, 'the helmet comes off once');
  assert.ok(knocks[0].speed > HELMET_KNOCK_MAX, `a hard hit knocks it off (${knocks[0].speed.toFixed(0)})`);
  const { helmet, points } = ride.ragdoll;
  assert.ok(points.head.radius < HELMET_RADIUS, 'the bare head is smaller than the helmet');
  assert.ok([helmet.x, helmet.y, helmet.spin].every(Number.isFinite), 'helmet stays finite');
  assert.ok(helmet.asleep, 'the helmet comes to rest');
  assert.ok(deepestPenetration(trail, [helmet]) < 1, 'the helmet rests on the ground');
  const again = run().ride.ragdoll.helmet;
  assert.deepEqual([again.x, again.y, again.spin], [helmet.x, helmet.y, helmet.spin], 'the helmet comes off the same way every time');
}

// A gentle backward loop at walking pace puts the rider down with the helmet on.
{
  for (const seed of [1, 2, 3]) {
    const ride = createRide(flatTrail(), { seed });
    for (let step = 0; step < 1500; step++)
      for (const event of stepRide(ride, { facing: 1, accelerating: step < 300, leanInput: -1 }))
        assert.notEqual(event.type, 'helmet', `seed ${seed}: a soft fall keeps the helmet on`);
    assert.equal(ride.status, 'crashed');
    assert.equal(ride.ragdoll.helmet, null);
  }
}

// Only the head crashes on terrain: a corner poking up between the wheels to
// the hip is ignored, while the same corner at the head ends the run.
{
  const settled = createRide(flatTrail());
  for (let step = 0; step < 60; step++) stepRide(settled, {});
  const probes = riderCollisionPoints(settled);
  for (const [name, crashes] of [['hip', false], ['head', true]]) {
    const { x, y } = probes[name];
    const trail = flatTrail({ terrainBlocks: [rectangle(0, 320, 3000, 620), rectangle(x - 3, y - 3, x + 3, y + 3, 'concrete', 'corner')] });
    const ride = createRide(trail);
    for (let step = 0; step < 60 && ride.status === 'running'; step++) stepRide(ride, {});
    assert.equal(ride.status === 'crashed', crashes, `terrain at the ${name} ${crashes ? 'crashes' : 'does not crash'}`);
  }
}

// Falling below the trail ends the run.
{
  const trail = flatTrail({ terrainBlocks: [rectangle(0, 320, 300, 620)] });
  const { ride } = simulateRun(trail, hold(900, { accelerating: true }));
  assert.equal(ride.crashCause, 'fall');
}

// The goal stays locked until every apple is collected.
{
  const trail = flatTrail({ finish: { x: 500, y: null }, apples: [{ x: 1800, y: null }] });
  const { ride, events } = simulateRun(trail, hold(360, { accelerating: true }));
  assert.ok(events.some(event => event.type === 'goalLocked' && event.missing === 1));
  assert.notEqual(ride.status, 'won');
}

assert.ok(WHEELBASE > 0);
console.log(`Replay regression tests passed (${entries.length} trails).`);
