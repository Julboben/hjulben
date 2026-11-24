// Desert props: the tumbleweed's roll, the windmill in the wind, the heat
// haze, the vulture's circle and the palm's fronds and falling coconuts. All
// of it is visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { propSpan, propWallFit } from '../js/drawing.js';
import {
  COCONUT_REACH, COCONUTS, PALMS, PALM_BOUNDS, PALM_SWAY_MAX, coconutFall, coconutKnock, palmFrondBounds, palmFrondSway,
  TUMBLEWEED_RUN, TUMBLEWEED_STEP, VULTURE_HEIGHT, hazeShift, hazeStreaks,
  swoopDuration, tumbleweedRoll, vultureNotice, vultureOrbit, vulturePerch, vultureSwoop, windmillAngle,
} from '../js/desert-props.js';

// Ground at 320 from 0 to 3000, with a wall rising to 200 from x 1000 to 1100.
const trail = (props, windDirection = 'right') => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'sand', 'ground'), rectangle(1000, 200, 1100, 320, 'concrete', 'wall')],
  start: { x: 120, y: null, facing: 1 }, props, weather: { windDirection },
});
const prop = (type, x, extra = {}) => ({ type, x, y: null, layer: 'back', ...extra });

// The tumbleweed traces the ground downwind, up to its run or a wall, however
// it was placed facing.
{
  const open = prop('tumbleweed', 1200);
  const fit = propWallFit(trail([open]), open);
  assert.equal(fit.path.length, TUMBLEWEED_RUN / TUMBLEWEED_STEP + 1);
  assert.ok(fit.path.every((dy) => dy === 0), 'flat ground');
  const walled = prop('tumbleweed', 900);
  assert.ok(propWallFit(trail([walled]), walled).path.length * TUMBLEWEED_STEP <= 100 + TUMBLEWEED_STEP, 'the wall stops it');
  const leftward = prop('tumbleweed', 1200);
  assert.ok(propWallFit(trail([leftward], 'left'), leftward).path.length * TUMBLEWEED_STEP <= 100 + TUMBLEWEED_STEP, 'in a wind blowing left, it rolls left into the wall');
  const flipped = prop('tumbleweed', 1200, { flip: true });
  assert.equal(propWallFit(trail([flipped]), flipped).path.length, TUMBLEWEED_RUN / TUMBLEWEED_STEP + 1, 'flipping it does not turn it into the wind');
  const [rise, hang] = propSpan('tumbleweed', { path: [0, -30, -60, 10] });
  assert.ok(rise >= 60 + 24 && hang >= 10, 'culling covers the ball over the whole path');
}

// It sits still at time 0, rolls and fades in and out, and only rocks with no room.
{
  const path = Array(TUMBLEWEED_RUN / TUMBLEWEED_STEP + 1).fill(0);
  assert.deepEqual(tumbleweedRoll(path, 0), { distance: 0, dy: 0, angle: 0, lift: 0, alpha: 1 });
  const early = tumbleweedRoll(path, 0.5);
  const mid = tumbleweedRoll(path, 6);
  assert.ok(early.alpha < 1 && early.distance > 0, 'it fades in');
  assert.ok(mid.distance > early.distance && mid.alpha === 1 && mid.angle > early.angle, 'it rolls on');
  const short = tumbleweedRoll([0, 0, 0], 4);
  assert.equal(short.distance, 0);
  assert.equal(short.alpha, 1);
  // Faster in a stronger wind, and not blown along at all in still air.
  assert.ok(tumbleweedRoll(path, 2, 0, 0.9).distance > tumbleweedRoll(path, 2, 0, 0.3).distance, 'faster in a gale');
  const still = tumbleweedRoll(path, 4, 0, 0);
  assert.equal(still.distance, 0, 'it stays put in still air');
}

// The windmill turns one way only, faster in more wind.
{
  let last = windmillAngle(0, 0.2);
  for (let t = 0.1; t < 30; t += 0.1) {
    const angle = windmillAngle(t, 0.2);
    assert.ok(angle >= last, `monotonic at ${t.toFixed(1)}`);
    last = angle;
  }
  assert.ok(windmillAngle(20, 1) - windmillAngle(0, 1) > windmillAngle(20, 0.1) - windmillAngle(0, 0.1));
}

// The heat haze is still at time 0 and only shimmers by a pixel either way.
{
  for (let row = 0; row < 44; row += 2) assert.equal(hazeShift(row, 0), 0);
  for (let t = 0.1; t < 5; t += 0.37) {
    for (let row = 0; row < 44; row += 2) assert.ok([-1, 0, 1].includes(hazeShift(row, t)));
  }
  assert.ok(Array.isArray(hazeStreaks(1.3)));
}

// The vulture sits at the centre of its circle at time 0 and circles it after.
{
  const still = vultureOrbit(0);
  assert.equal(still.dx, 0);
  assert.equal(still.dy, 0);
  const xs = Array.from({ length: 40 }, (_, i) => vultureOrbit(i * 0.3).dx);
  assert.ok(Math.min(...xs) < -40 && Math.max(...xs) > 40, 'it circles both ways');
  const high = prop('vulture', 600);
  assert.equal(propWallFit(trail([high]), high).centre, -VULTURE_HEIGHT);
  const placed = prop('vulture', 600, { y: 100 });
  assert.equal(propWallFit(trail([placed]), placed).centre, 0);
}

// They are all known prop types.
{
  const types = ['palm', 'palm-small', 'skull', 'tumbleweed', 'car-wreck', 'water-tower', 'windmill', 'heat-haze', 'vulture'];
  const warnings = validateTrail(trail(types.map((type, i) => prop(type, 300 + i * 80))))
    .filter((m) => m.type === 'warning');
  assert.ok(!warnings.some((m) => /unknown type/.test(m.text)), warnings.map((m) => m.text).join('\n'));
}

// After a crash, a vulture glides down and lands on the ground beside the rider.
{
  const flat = () => 320;
  assert.deepEqual(vulturePerch(500, 310, -1, 0, flat), { x: 460, y: 320 }, 'beside the rider, on its side');
  assert.equal(vulturePerch(500, 310, 1, 1, flat).x, 570, 'a second one stands further out');
  const cliff = (x) => (x < 500 ? 900 : 320);
  assert.equal(vulturePerch(500, 310, -1, 0, cliff).x, 540, 'the other side when its own is a drop');
  assert.equal(vulturePerch(500, 310, -1, 0, () => null), null, 'nowhere to stand');
  assert.ok(vultureNotice(0) > 0 && vultureNotice(0.9) > vultureNotice(0.1), 'it takes a moment to notice');
  const from = { x: 100, y: 100 }, to = { x: 460, y: 320 };
  const duration = swoopDuration(from, to);
  const start = vultureSwoop(from, to, 0, duration, 500);
  assert.ok(start.x === 100 && start.y === 100 && start.pose === 'soaring' && start.dir === 1);
  assert.equal(vultureSwoop(from, to, duration - 0.1, duration, 500).pose, 'landing');
  const stood = vultureSwoop(from, to, duration + 2, duration, 500);
  assert.ok(stood.pose === 'standing' && stood.x === 460 && stood.y < 320 && stood.dir === 1, 'standing, facing the rider');
  assert.equal(vultureSwoop(from, to, duration + 2, duration, 300).dir, -1, 'it turns to keep watching');
  let lowest = -Infinity;
  for (let age = 0; age <= duration; age += 0.1) {
    const at = vultureSwoop(from, to, age, duration, 500);
    assert.ok(at.y >= lowest - 1e-9, 'it only ever descends');
    lowest = at.y;
  }
}

// A palm's fronds hold still at time 0 and in still air, flutter each in
// their own time, and lean downwind further the harder it blows, never past
// PALM_SWAY_MAX (less on the small palm) and always on the art grid.
for (const [type, palm] of Object.entries(PALMS)) {
  palm.fronds.forEach((_, index) => {
    assert.equal(palmFrondSway(palm, 0, 1, -1, 0.3, index), 0, 'still at time 0');
    assert.equal(palmFrondSway(palm, 5, 0, -1, 0.3, index), 0, 'still in still air');
  });
  const mean = (wind, downwind) => {
    let sum = 0;
    for (let t = 0.1; t < 20; t += 0.1) palm.fronds.forEach((_, index) => (sum += palmFrondSway(palm, t, wind, downwind, 0.3, index)));
    return sum / (199 * palm.fronds.length);
  };
  assert.ok(mean(1, -1) < mean(0.4, -1) && mean(0.4, -1) < 0, `a gale leans the ${type}'s fronds further downwind`);
  assert.ok(mean(1, 1) > 0, 'either way');
  assert.notEqual(palmFrondSway(palm, 3, 0.5, 1, 0.3, 0), palmFrondSway(palm, 3, 0.5, 1, 0.3, 1), 'each frond in its own time');
  const most = Math.round((PALM_SWAY_MAX * palm.scale) / 2) * 2;
  for (let t = 0.1; t < 20; t += 0.37) {
    const sway = palmFrondSway(palm, t, 1, 1, 0.7, 4);
    assert.ok(Math.abs(sway) <= most && sway % 2 === 0, `on the grid and in range at ${t.toFixed(2)}`);
  }
  // The culling bounds hold every frond, however far it is pushed.
  palm.fronds.forEach((_, index) => {
    for (let sway = -most; sway <= most; sway += 2) {
      const [left, top, right] = palmFrondBounds(palm, index, sway);
      const bounds = PALM_BOUNDS[type];
      assert.ok(left >= bounds[0] && top >= bounds[1] && right <= bounds[2], `${type} frond ${index} at ${sway}`);
    }
  });
}
assert.ok(-PALM_BOUNDS['palm-small'][1] < -PALM_BOUNDS.palm[1] / 2, 'the small palm is less than half as tall');

// A hard landing near a palm knocks a coconut down, rolling away from the
// landing; each falls to the ground, rolls a little way and lies where it
// stops, apart from the others.
{
  const landing = { x: 500, y: 320, time: 10, strength: 1 };
  assert.equal(coconutKnock(null, 560, 320), null);
  assert.equal(coconutKnock(landing, 500 + COCONUT_REACH + 1, 320), null, 'too far to the side');
  assert.equal(coconutKnock(landing, 560, 900), null, 'too far above or below');
  assert.equal(coconutKnock(landing, 560, 320), 1, 'away from the landing');
  assert.equal(coconutKnock(landing, 440, 320), -1);
  const flat = () => 0;
  COCONUTS.forEach((_, index) => {
    const start = coconutFall(index, 0, 1, flat);
    assert.ok(start.y < PALMS.palm.crown.y + 20, 'it starts in the bunch');
    let last = start;
    for (let age = 0.05; age < 3; age += 0.05) {
      const nut = coconutFall(index, age, 1, flat);
      assert.ok(nut.y <= -6, `never sinks into the ground at ${age.toFixed(2)}`);
      assert.ok(nut.x >= last.x, 'it only rolls one way');
      last = nut;
    }
    const lying = coconutFall(index, 3, 1, flat);
    assert.ok(lying.y === -6 && lying.x > start.x, 'it lies on the ground, off to the side');
    assert.deepEqual(coconutFall(index, 60, 1, flat), lying, 'and stays there');
    assert.ok(coconutFall(index, 3, -1, flat).x < start.x, 'the other way too');
  });
  for (const dir of [-1, 1]) {
    const resting = COCONUTS.map((_, index) => coconutFall(index, 3, dir, flat).x);
    assert.ok(resting.every((x, i) => resting.every((other, j) => i === j || Math.abs(x - other) >= 10)), 'they come to rest apart');
    assert.ok(resting.every((x) => Math.abs(x) >= PALMS.palm.foot + 6), 'clear of the trunk');
  }
  const slope = (x) => -x;
  const stopped = coconutFall(0, 3, 1, slope);
  assert.equal(stopped.y, -stopped.x - 6, 'on the ground where it stops');
}

console.log('Desert tests passed.');
