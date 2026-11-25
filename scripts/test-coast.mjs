// Coast props: the shells, driftwood and shipwreck stay within their bounds,
// the crab scuttles about, digs in or is bowled over, the bunting's flags
// flutter downwind, and the beach toys: the pail, pennant and shell decor
// stay within theirs, and the beach ball goes wherever it is pushed.
import assert from 'node:assert/strict';
import { canFlip, normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { polygonBlock, rectangle } from './lib/terrain-fixtures.mjs';
import { terrainCollisionsAt } from '../js/terrain.js';
import { RADIUS } from '../js/config.js';
import { canRotate, crabPropAt, propSpan, propWallFit } from '../js/drawing.js';
import {
  BALL_RADIUS,
  BUNTING,
  BUNTING_FLAGS,
  BUNTING_SWING,
  CRAB_BOUNDS,
  CRAB_BURIED,
  CRAB_FLEE,
  CRAB_FLING,
  CRAB_HEIGHT,
  CRAB_HIT,
  CRAB_KNOCKED,
  CRAB_RANGE,
  CRAB_STEP,
  CRAB_WANDER,
  DECOR_BOUNDS,
  DECOR_LAYOUTS,
  DRIFTWOOD_BOUNDS,
  PAIL_BOUNDS,
  PENNANT,
  SHELLS_BOUNDS,
  SHELL_LAYOUTS,
  SHIPWRECK_BOUNDS,
  ballStart,
  ballStep,
  buntingSwing,
  crabColors,
  crabFlee,
  crabIdle,
  crabPhase,
  crabRunOver,
  decorLayout,
  drawBeachBall,
  drawBunting,
  drawCrab,
  drawDriftwood,
  drawPail,
  drawPennant,
  drawShellDecor,
  drawShells,
  drawShipwreck,
  pailColors,
  pennantCloth,
  shellsLayout,
} from '../js/coast-props.js';

// Ground at 320 from 0 to 3000, with a wall rising to 200 from x 1000 to 1100.
const trail = (props) => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'sand', 'ground'), rectangle(1000, 200, 1100, 320, 'concrete', 'wall')],
  start: { x: 120, y: null, facing: 1 }, props,
});
const prop = (type, x, extra = {}) => ({ type, x, y: null, layer: 'back', ...extra });
const flat = { left: Array(CRAB_RANGE / CRAB_STEP + 1).fill(0), right: Array(CRAB_RANGE / CRAB_STEP + 1).fill(0) };

// Records what a drawing function paints: each rect, and every point of each
// path (marked, since the path tool lays them on the grid itself).
function record(draw) {
  const rects = [];
  const tools = {
    pixelRect: (x, y, width, height, color) => rects.push({ x, y, width, height, color }),
    pixelPath: (points, color, thickness) => points.forEach(([x, y]) => rects.push({ x: x - thickness, y: y - thickness, width: thickness * 2, height: thickness * 2, color, path: true })),
  };
  draw(tools);
  return rects;
}
const within = (rects, [left, top, right, bottom]) =>
  rects.every((r) => r.x >= left && r.y >= top && r.x + r.width <= right && r.y + r.height <= bottom);
const onGrid = (rects) => rects.every((r) => r.path || [r.x, r.y, r.width, r.height].every((v) => v % 2 === 0));

// They are all known prop types; only the shipwreck faces a way, and the crab
// moves about, so it keeps its own angle.
{
  const types = ['shells', 'driftwood', 'crab', 'bunting', 'shipwreck', 'pail', 'pennant', 'shell-decor', 'beach-ball'];
  const warnings = validateTrail(trail(types.map((type, i) => prop(type, 300 + i * 120))))
    .filter((m) => m.type === 'warning');
  assert.ok(!warnings.some((m) => /unknown type/.test(m.text)), warnings.map((m) => m.text).join('\n'));
  assert.deepEqual(types.filter(canFlip), ['shipwreck']);
  assert.ok(!canRotate('crab') && !canRotate('beach-ball') && canRotate('shipwreck') && canRotate('bunting'));
}

// The sprites stay within their bounds, on the art grid.
for (const [name, draw, bounds] of [['driftwood', drawDriftwood, DRIFTWOOD_BOUNDS], ['shipwreck', drawShipwreck, SHIPWRECK_BOUNDS]]) {
  const rects = record(draw);
  assert.ok(within(rects, bounds), `the ${name} stays within its bounds`);
  assert.ok(onGrid(rects), `the ${name} is on the grid`);
}

// Every layout of shells lies within its bounds on flat ground, each shell on
// the ground under it, and every layout turns up somewhere.
{
  for (const layout of SHELL_LAYOUTS.keys()) {
    const rects = record((tools) => drawShells(tools, layout, () => 0));
    assert.ok(within(rects, SHELLS_BOUNDS) && onGrid(rects), `layout ${layout} fits`);
    assert.equal(Math.max(...rects.map((r) => r.y + r.height)), 2, 'sunk a pixel into the sand');
  }
  const seen = new Set(Array.from({ length: 200 }, (_, i) => shellsLayout(i * 37)));
  assert.equal(seen.size, SHELL_LAYOUTS.length);
  // On a slope each shell sits on the ground under it.
  const rects = record((tools) => drawShells(tools, 0, (x) => x / 2));
  const left = rects.filter((r) => r.x < -6), right = rects.filter((r) => r.x > 4);
  assert.ok(Math.max(...left.map((r) => r.y)) < Math.max(...right.map((r) => r.y)), 'lower down the slope');
}

// Crabs come in red and in the green-brown of the shore crab, picked by x.
{
  const seen = new Set(Array.from({ length: 50 }, (_, i) => crabColors(i * 53)));
  assert.deepEqual([...seen].sort(), ['red', 'shore']);
  for (const pose of ['stand', 'step', 'alarm', 'back', 'kick']) {
    const rects = record((tools) => drawCrab(tools, pose, 'red'));
    assert.ok(within(rects, CRAB_BOUNDS) && onGrid(rects), `${pose} fits`);
  }
  // Sinking into the sand, nothing is drawn below the ground, and buried it is gone.
  const half = record((tools) => drawCrab(tools, 'stand', 'shore', 8));
  assert.ok(half.length && half.every((r) => r.y + r.height <= 0), 'cut off at the ground');
  assert.equal(record((tools) => drawCrab(tools, 'stand', 'shore', CRAB_HEIGHT)).length, 0);
}

// It traces the ground either way, up to its range or a wall.
{
  const crab = prop('crab', 980);
  const fit = propWallFit(trail([crab]), crab);
  assert.equal(fit.left.length, CRAB_RANGE / CRAB_STEP + 1);
  assert.ok(fit.right.length * CRAB_STEP <= 20 + CRAB_STEP, 'the wall stops it');
  const [rise] = propSpan('crab', fit);
  assert.ok(rise >= CRAB_HEIGHT * 2, 'room above for it tumbling');
}

// At time 0 it sits still at its anchor; after that it scuttles about within
// its wander, and never past a wall.
{
  assert.deepEqual(crabIdle(0, 0.4, flat), { dx: 0, dy: 0, pose: 'stand' });
  const spots = new Set();
  let moved = false;
  for (let t = 0.05; t < 60; t += 0.05) {
    const at = crabIdle(t, 0.4, flat);
    assert.ok(Math.abs(at.dx) <= CRAB_WANDER, 'within its wander');
    spots.add(Math.round(at.dx));
    moved ||= at.pose === 'step';
  }
  assert.ok(spots.size > 5 && moved, 'it scuttles about');
  const walled = { left: flat.left, right: [0, 0, 0] };
  for (let t = 0.05; t < 60; t += 0.05) assert.ok(crabIdle(t, 0.7, walled).dx <= 8, 'stops at the wall');
  // Startled, it is caught wherever it has scuttled to.
  const crab = prop('crab', 500);
  const placed = trail([crab]);
  const at = crabPropAt(placed, crab, 12.3);
  const idle = crabIdle(12.3, crabPhase(500), propWallFit(placed, crab));
  assert.deepEqual(at, { x: 500 + idle.dx, y: 320 + idle.dy, from: idle.dx });
}

// Startled and left alone, it raises its claws, then digs in where it stood.
{
  const first = crabFlee(flat, 10, 1, 0.05);
  assert.equal(first.pose, 'alarm');
  assert.equal(first.sink, 0);
  const digging = crabFlee(flat, 10, 1, CRAB_BURIED - 0.2);
  assert.ok(digging.sink > 0 && digging.digging && digging.dx === 10, 'sinking where it stood');
  assert.ok(crabFlee(flat, 10, 1, CRAB_BURIED + 0.01).hidden, 'buried');
}

// A wheel bowls it over only while it still stands clear of the sand, and only close up.
{
  assert.ok(crabRunOver(0.1, 4, 2));
  assert.ok(!crabRunOver(0.1, CRAB_HIT.x + 2, 0), 'too far across');
  assert.ok(!crabRunOver(0.1, 0, CRAB_HIT.y + 2), 'too far above, mid-jump');
  assert.ok(!crabRunOver(CRAB_BURIED, 0, 0), 'already dug in');
}

// Bowled over, it is flung the way the wheel went, tumbles onto its back,
// waves its legs, rights itself and digs in there, and is gone by CRAB_FLEE.
{
  const knocked = 0.15;
  const tumbling = crabFlee(flat, 0, -1, knocked + 0.2, knocked);
  assert.ok(tumbling.dx < 0 && tumbling.dy < 0 && tumbling.angle < 0, 'flung back the way the wheel went');
  const onBack = crabFlee(flat, 0, -1, knocked + 1, knocked);
  assert.ok(['back', 'kick'].includes(onBack.pose) && onBack.dx === -CRAB_FLING && onBack.dy === 0);
  const poses = new Set([0, 0.1, 0.2, 0.3].map((t) => crabFlee(flat, 0, -1, knocked + 0.8 + t, knocked).pose));
  assert.deepEqual([...poses].sort(), ['back', 'kick'], 'its legs kick');
  assert.ok(!crabFlee(flat, 0, -1, knocked + CRAB_KNOCKED - 0.05, knocked).hidden);
  assert.ok(crabFlee(flat, 0, -1, knocked + CRAB_KNOCKED + 0.01, knocked).hidden, 'dug in at last');
  assert.ok(knocked + CRAB_KNOCKED <= CRAB_FLEE, 'gone within its flight');
  // Before the wheel reaches it, it is just a startled crab.
  assert.equal(crabFlee(flat, 0, -1, 0.1, knocked).pose, 'alarm');
  // A wall stops it short.
  const walled = { left: [0, 0, 0], right: flat.right };
  assert.equal(crabFlee(walled, 0, -1, knocked + 1, knocked).dx, -8);
}

// The bunting's flags hang straight when still and flutter downwind in a wind.
{
  assert.equal(buntingSwing(0, 1, 1, 0.3, 2), 0, 'still at time 0');
  let sum = 0;
  for (let t = 0.1; t < 20; t += 0.1) {
    for (const index of BUNTING_FLAGS.keys()) {
      const swing = buntingSwing(t, 1, -1, 0.3, index);
      assert.ok(Math.abs(swing) <= BUNTING_SWING);
      sum += swing;
    }
  }
  assert.ok(sum < 0, 'leans downwind');
  // Each pole stands on the ground under it, and the flags hang between them.
  const ground = (x) => (x < 0 ? -10 : 6);
  const rects = record((tools) => drawBunting(tools, ground, () => 0));
  const poles = rects.filter((r) => r.height >= BUNTING.pole);
  assert.deepEqual([...new Set(poles.map((r) => r.y + r.height))].sort((a, b) => a - b), [-8, 8], 'poles reach their ground');
  assert.ok(rects.every((r) => r.x >= -BUNTING.half - 2 && r.x + r.width <= BUNTING.half + 2), 'between the poles');
}

// The beach toys stay within their bounds on the art grid, in every colour
// and layout, and every one turns up somewhere along a trail.
{
  const picks = (pick) => new Set(Array.from({ length: 200 }, (_, i) => pick(i * 37))).size;
  assert.ok(picks(pailColors) === 3 && picks(pennantCloth) === 4 && picks(decorLayout) === DECOR_LAYOUTS.length, 'every variant turns up');
  for (const colors of [0, 1, 2]) {
    const rects = record((tools) => drawPail(tools, colors));
    assert.ok(within(rects, PAIL_BOUNDS) && onGrid(rects), `pail ${colors} fits`);
  }
  const flag = [-PENNANT.columns * 2 - 4, PENNANT.top - 4, PENNANT.columns * 2 + 4, 2];
  for (const cloth of [0, 1, 2, 3])
    for (const downwind of [-1, 1])
      for (const [time, wind] of [[0, 0], [1.7, 0.5], [3.1, 1]]) {
        const rects = record((tools) => drawPennant(tools, () => 0, cloth, time, wind, 0.3, downwind));
        assert.ok(within(rects, flag) && onGrid(rects), `pennant ${cloth} fits`);
      }
  // It flies out downwind.
  const flies = (downwind) => record((tools) => drawPennant(tools, () => 0, 0, 1, 0.6, 0, downwind)).filter((r) => r.y < PENNANT.top + 20 && Math.abs(r.x) > 4);
  assert.ok(flies(1).every((r) => r.x > 0) && flies(-1).every((r) => r.x < 0), 'flies downwind');
  for (const layout of DECOR_LAYOUTS.keys()) {
    const rects = record((tools) => drawShellDecor(tools, layout));
    assert.ok(within(rects, DECOR_BOUNDS) && onGrid(rects), `decor ${layout} fits`);
  }
  // Turned to any angle it stays round and the same size; squashed, it is
  // wider and lower, still on the ground.
  const cells = (rects) => rects.reduce((sum, r) => sum + (r.width * r.height) / 4, 0);
  const upright = cells(record((tools) => drawBeachBall(tools, 0)));
  for (let turn = 0; turn < Math.PI * 2; turn += 0.3) {
    const rects = record((tools) => drawBeachBall(tools, turn));
    assert.ok(within(rects, [-BALL_RADIUS, -BALL_RADIUS * 2, BALL_RADIUS, 0]) && onGrid(rects) && cells(rects) === upright, 'the ball fits');
  }
  const squashed = record((tools) => drawBeachBall(tools, 0, 1));
  assert.ok(within(squashed, [-BALL_RADIUS - 2, -BALL_RADIUS * 2 + 4, BALL_RADIUS + 2, 0]) && onGrid(squashed), 'squashed, it is wider and lower');
}

// The beach ball: on the fixture's ground at y 320, with its wall rising to y
// 200 from x 1000 to 1100.
{
  const placed = trail([]);
  const contacts = (x, y, radius) => terrainCollisionsAt(placed, x, y, radius);
  const dry = () => 0;
  const roll = (state, seconds, { wheels = () => [], submerged = dry } = {}) => {
    for (let t = 0; t < seconds; t += 1 / 60)
      state = ballStep(state, { dt: 1 / 60, wheels: wheels(t), wheelRadius: RADIUS, contacts, submerged });
    return state;
  };
  const resting = ballStart(500, 320);
  assert.deepEqual(roll(resting, 2), resting, 'left alone, it stays put');
  assert.equal(ballStep(resting, { dt: 0, wheels: [], wheelRadius: RADIUS, contacts, submerged: dry }), resting, 'still at time 0');
  // Dropped, it bounces and comes to rest on the ground.
  const dropped = roll({ ...ballStart(500, 320), y: 200, resting: false }, 6);
  assert.ok(Math.abs(dropped.y - (320 - BALL_RADIUS)) < 1 && dropped.vx === 0 && dropped.vy === 0, `${dropped.y}`);
  // A wheel rolling into it sends it off ahead, rolling and turning.
  const wheel = (from, speed) => (t) => [{ x: from + speed * t, y: 320 - RADIUS, vx: speed, vy: 0 }];
  const pushed = roll(ballStart(500, 320), 0.5, { wheels: wheel(470, 200) });
  assert.ok(pushed.x > 520 && pushed.turn > 0, `pushed to ${pushed.x}`);
  // Sent into the wall, it bounces back off it.
  const thrown = roll({ ...ballStart(900, 320), vx: 400, resting: false }, 0.4);
  assert.ok(thrown.x < 1000 - BALL_RADIUS + 1 && thrown.vx < 0, `bounced to ${thrown.x} at ${thrown.vx}`);
  // A wheel's knock and a hard landing are heard, and the landing squashes it
  // for a moment; rolling along is silent.
  const kicked = ballStep(ballStart(500, 320), { dt: 1 / 60, wheels: [{ x: 480, y: 310, vx: 300, vy: 0 }], wheelRadius: RADIUS, contacts, submerged: dry });
  assert.ok(kicked.knock > 200, `knocked at ${kicked.knock}`);
  let landing = { ...ballStart(500, 320), y: 150, resting: false }, landed = null;
  for (let t = 0; t < 2 && !landed; t += 1 / 60) {
    landing = ballStep(landing, { dt: 1 / 60, wheels: [], wheelRadius: RADIUS, contacts, submerged: dry });
    if (landing.knock) landed = landing;
  }
  assert.ok(landed && landed.squash === 1 && landed.knock > 150, 'a hard landing is heard and squashes it');
  assert.ok(roll(landed, 0.2).squash === 0, 'and it springs back');
  const rolling = ballStep({ ...ballStart(500, 320), vx: 80, resting: false }, { dt: 1 / 60, wheels: [], wheelRadius: RADIUS, contacts, submerged: dry });
  assert.equal(rolling.knock, 0, 'rolling along is silent');
  // It rolls to a stop, and can be pushed again, as often as the wheels like.
  const stopped = roll(pushed, 10);
  assert.ok(stopped.vx === 0 && stopped.x > pushed.x, 'rolls to a stop');
  const again = roll(stopped, 0.5, { wheels: wheel(stopped.x + 30, -200) });
  assert.ok(again.x < stopped.x - 10, 'pushed back the other way');
  // Put on a slope it rests there until touched; once moving it rolls down
  // the slope rather than coming to rest on it.
  const onSlope = trail([]);
  onSlope.terrainBlocks.push(polygonBlock([[1200, 320], [1600, 220], [1600, 320]], 'sand', 'ramp'));
  const slopeContacts = (x, y, radius) => terrainCollisionsAt(onSlope, x, y, radius);
  const rollOn = (state, seconds, wheels = () => []) => {
    for (let t = 0; t < seconds; t += 1 / 60)
      state = ballStep(state, { dt: 1 / 60, wheels: wheels(t), wheelRadius: RADIUS, contacts: slopeContacts, submerged: dry });
    return state;
  };
  const perched = ballStart(1400, 270);
  assert.deepEqual(rollOn(perched, 3), perched, 'rests on a slope where it was put');
  const nudged = rollOn(perched, 3, (t) => (t < 0.1 ? [{ x: 1400 + 20, y: 258, vx: -60, vy: 0 }] : []));
  assert.ok(nudged.x < 1250, `rolls down the slope to ${nudged.x}`);

  // In water it floats up to the surface.
  const water = (x, y, radius) => Math.max(0, Math.min(1, (y + radius - 300) / (2 * radius)));
  const floating = roll({ ...ballStart(500, 320), y: 300, resting: false }, 4, { submerged: water });
  assert.ok(floating.y < 300 && floating.y > 300 - BALL_RADIUS * 2, `floats at ${floating.y}`);
}

console.log('Coast tests passed.');
