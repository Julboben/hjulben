// Countryside and Copenhagen props: the grass sways downwind and is pushed
// flat by a passing rider, Dannebrog ripples only while time runs, and the
// lean-forward drawing is painted on the rock like the other tutorials. All
// of it is visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { PAINTED_PROPS, WALL_PROPS, canFlip, canRotate, mossSurface, paintedBounds, propWallFit } from '../js/drawing.js';
import { FARMHOUSE, FARMHOUSE_BOUNDS, FARMHOUSE_WINDOWS, FLAGPOLE, MILL, STALL, STALL_COIN_DROP, STALL_SIGN_LINE, STALL_SIGN_LINES, STALL_TEXT, TURBINE, farmhouseLitWindows, flagDroop, flagRipple, mailboxFlagLift, millAngle, stallCoin, stallSignLines, turbineAngle } from '../js/countryside-props.js';
import { FIRE_TONGUES, GRASS_BRUSH, IVY, tentFlapSway, LEAF_REST, LEAVES_AIRBORNE, TREE_SWAY_MAX, fallingLeaves, grassLean, ivyLayout, ivyRustle, mossCushions, mossPlacement, treeSway } from '../js/forest-props.js';
import { fireFrame, fireTongues } from '../js/fire.js';

const COUNTRYSIDE_PROPS = ['tent', 'grass', 'flagpole', 'christiania-bike', 'bench', 'fireplace', 'farmhouse', 'mailbox', 'stall', 'wind-turbine', 'tutorial-lean-forward'];

// Every new prop is a known type; the drawing is painted on the rock.
{
  const trail = normalizeTrail({
    name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground')],
    start: { x: 120, y: null, facing: 1 },
    props: COUNTRYSIDE_PROPS.map((type, index) => ({ type, x: 400 + index * 160, y: null, layer: 'back' })),
  });
  const warnings = validateTrail(trail).filter((m) => m.type === 'warning').map((m) => m.text);
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  assert.ok(PAINTED_PROPS.has('tutorial-lean-forward') && canRotate('tutorial-lean-forward'));
  assert.ok(paintedBounds('tutorial-lean-forward')[3] > 0, 'it reaches below its anchor');
  for (const type of ['tent', 'grass', 'flagpole', 'christiania-bike', 'bench', 'fireplace', 'farmhouse', 'mailbox', 'stall', 'wind-turbine']) assert.ok(canFlip(type), `${type} can flip`);
}

// Grass leans downwind, harder in a strong wind, and holds its lean at time 0.
{
  assert.ok(grassLean(0, 0.5, -1, 0.3, 0) < 0, 'leans left with the wind blowing left');
  assert.ok(grassLean(0, 0.5, 1, 0.3, 0) > 0, 'and right when flipped');
  assert.ok(grassLean(0, 1, -1, 0.3, 0) < grassLean(0, 0.2, -1, 0.3, 0), 'further in a strong wind');
  assert.equal(grassLean(0, 0.5, -1, 0.3, 4), grassLean(0, 0.5, -1, 0.7, 4), 'still at time 0');
  const sway = new Set(Array.from({ length: 20 }, (_, i) => grassLean(1 + i * 0.1, 0.5, -1, 0.3, 0).toFixed(3)));
  assert.ok(sway.size > 5, 'it sways while time runs');
}

// A rider brushing through pushes the blades flat away from them.
{
  const calm = grassLean(0, 0.25, -1, 0, 0);
  assert.ok(grassLean(0, 0.25, -1, 0, 0, -4, -20) > 0.8, 'pushed right by a rider just to its left');
  assert.ok(grassLean(0, 0.25, -1, 0, 0, 4, -20) < -0.8, 'pushed left by a rider just to its right');
  assert.equal(grassLean(0, 0.25, -1, 0, 0, GRASS_BRUSH.x + 2, -20), calm, 'untouched when the rider is clear');
  assert.equal(grassLean(0, 0.25, -1, 0, 0, 2, -GRASS_BRUSH.y - 10), calm, 'or high above it');
  assert.ok(Math.abs(grassLean(3, 1, -1, 0, 0, 0.5, -10)) <= 1.4, 'never bent further than flat');
}

// The flag lies flat at the pole and at time 0, and ripples otherwise.
{
  for (let column = 0; column < 20; column++) assert.ok(flagRipple(0, 1, 0.4, column) === 0);
  assert.ok(flagRipple(2.3, 1, 0.4, 0) === 0, 'held at the pole');
  const ripples = Array.from({ length: 20 }, (_, column) => flagRipple(2.3, 1, 0.4, column));
  assert.ok(ripples.some((value) => value !== 0) && ripples.every((value) => value % 2 === 0), 'ripples on the art grid');
  const reach = (wind) => Math.max(...Array.from({ length: 20 }, (_, column) => Math.abs(flagRipple(2.3, wind, 0.4, column))));
  assert.ok(reach(1) > reach(0.1), 'it ripples harder in a gale');
}

// In still air the flag droops, more towards its end; in a gale it flies straight out.
{
  assert.equal(flagDroop(0.3, 0), 0, 'held at the pole');
  assert.ok(flagDroop(0, 19) > flagDroop(0, 5) && flagDroop(0, 19) > flagDroop(0.5, 19));
  for (let column = 0; column < 20; column++) assert.equal(flagDroop(1, column), 0);
  assert.ok(grassLean(0, 1, -1, 0.3, 0) < -0.8, 'a gale bends the grass well over');
  assert.ok(Math.abs(grassLean(0, 0, -1, 0.3, 0)) < 0.1, 'it stands nearly straight in still air');
}

// Fire (fire.js) is sized to its prop, holds still at time 0, and flickers
// out of step otherwise.
{
  for (const [width, height] of [[8, 16], [20, 22], [60, 50]]) {
    const tongues = fireTongues(width, height);
    assert.ok(tongues.length >= 1 && tongues.length <= Math.ceil(width / 8) + 1, `a fire ${width} across has a few tongues`);
    assert.equal(Math.max(...tongues.map((tongue) => tongue.height)), height, 'the tallest is as tall as the fire');
    assert.ok(tongues.every((tongue) => Math.abs(tongue.x) + tongue.half <= width / 2 + 4), 'they stay within its width');
    assert.ok(tongues.flatMap((tongue) => [tongue.x, tongue.height, tongue.half]).every((v) => v % 2 === 0), 'on the art grid');
  }
  assert.deepEqual(fireFrame(FIRE_TONGUES, 0, 0.2), fireFrame(FIRE_TONGUES, 0, 0.9), 'still at time 0');
  assert.ok(fireFrame(FIRE_TONGUES, 0, 0).every((tongue) => tongue.lick === 0));
  const frames = Array.from({ length: 30 }, (_, i) => fireFrame(FIRE_TONGUES, 1 + i * 0.04, 0.2));
  assert.ok(new Set(frames.map((frame) => frame[0].height)).size > 1, 'the flames rise and fall');
  assert.ok(frames.some((frame) => frame[0].height - FIRE_TONGUES[0].height !== frame[1].height - FIRE_TONGUES[1].height), 'each tongue in its own time');
  assert.ok(frames.flat().every((tongue) => tongue.height % 2 === 0 && tongue.lick % 2 === 0), 'on the art grid');
}

// The flagpole stands about 6 m tall at 27 units to the metre (PROPS_GUIDE.md).
{
  assert.ok(-FLAGPOLE.top >= 162 && -FLAGPOLE.top <= 216, 'a garden flagpole is 6 to 8 m');
  assert.ok(FLAGPOLE.top % 2 === 0, 'on the art grid');
}

// Ivy climbs a wall face as high as it goes, and no higher than IVY.max.
{
  assert.ok(WALL_PROPS.has('ivy') && !canFlip('ivy'), 'ivy is a wall prop');
  // A wall standing on the ground: its left face at x = 600, 80 tall.
  const wall = normalizeTrail({
    name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground'), rectangle(600, 240, 700, 320, 'stone', 'ground'),
      rectangle(1000, 0, 1100, 320, 'stone', 'ground')],
    start: { x: 120, y: null, facing: 1 }, props: [],
  });
  const low = propWallFit(wall, { type: 'ivy', x: 598, y: 320 });
  assert.equal(low.side, 1, 'the rock is on its right');
  assert.ok(low.rise >= 72 && low.rise <= 80, `climbs to the top of a low wall (${low.rise})`);
  const tall = propWallFit(wall, { type: 'ivy', x: 998, y: 320 });
  assert.equal(tall.rise, IVY.max, 'no higher than IVY.max up a tall wall');
  const open = propWallFit(wall, { type: 'ivy', x: 300, y: 320 });
  assert.equal(open.rise, 0, 'nothing to climb out in the open');
  const noise = (n) => (n * 0.618) % 1;
  for (const rise of [16, 60, IVY.max]) {
    const { stems, leaves } = ivyLayout(rise, noise);
    const top = Math.min(...leaves.map((leaf) => leaf.y), ...stems.map(([, y]) => y));
    assert.ok(top >= -rise - 8, `leaves stay near the top of a ${rise} climb`);
    assert.ok([...stems.flat(), ...leaves.flatMap((leaf) => [leaf.x, leaf.y])].every((v) => v % 2 === 0), 'on the art grid');
    assert.ok(leaves.every((leaf) => leaf.x >= -10 && leaf.x <= 24), 'hugging the face');
  }
  assert.ok(ivyRustle(0, 1, 0.3, 4) === 0, 'still at time 0');
  assert.ok(new Set(Array.from({ length: 20 }, (_, i) => ivyRustle(1 + i * 0.1, 0.8, 0.3, 4))).size > 1, 'stirs in the wind');
}

// Moss lies along the surface whichever way it faces: it finds the
// surface's normal and stands its cushions along it, on the art grid.
{
  const close = ([ax, ay], [bx, by]) => Math.abs(ax - bx) < 0.2 && Math.abs(ay - by) < 0.2;
  const s = Math.SQRT1_2;
  const cases = [
    ['a face looking right', (x) => x < 0, [1, 0]],
    ['a face looking left', (x) => x > 0, [-1, 0]],
    ['a hill rising to the right', (x, y) => y > -x, [-s, -s]],
    ['a flat top', (x, y) => y > 0, [0, -1]],
    ['an overhang', (x, y) => y < 0, [0, 1]],
  ];
  for (const [name, solid, expected] of cases) {
    const { normal, at } = mossSurface(solid, 0, 0);
    assert.ok(close(normal, expected), `${name}: faces ${normal.map((v) => v.toFixed(2))}`);
    assert.ok(Math.hypot(...at) <= 2, `${name}: already on the surface`);
  }
  // Clicked a little into the air above a top, it steps back down onto it.
  const above = mossSurface((x, y) => y > 0, 0, -9);
  assert.ok(close(above.normal, [0, -1]) && Math.abs(above.at[1] - 9) <= 2, `steps onto the surface (${above.at})`);
  assert.deepEqual(mossSurface(() => false, 0, 0), { normal: [0, -1], at: [0, 0] }, 'no rock near: it sits as on a top');
  // Along a slope the cushions follow the slope, not a vertical line.
  const placed = mossPlacement(mossCushions(() => 0.5), [-s, -s]);
  const first = placed[0], last = placed.at(-1);
  assert.ok(Math.sign(last.x - first.x) === -Math.sign(last.y - first.y) && Math.abs(last.x - first.x) > 10, 'it runs along the hill');
  assert.ok(placed.every(({ x, y }) => x % 2 === 0 && y % 2 === 0), 'on the art grid');
  assert.ok(!canRotate('moss'), 'it finds its own angle, so it is not turned by hand');
}

// A tree's crown bends in the wind: still in still air and at time 0, tipping
// a pixel now and then as a gust passes in a breeze, leaning and swaying
// downwind in a gale, and never further than TREE_SWAY_MAX.
{
  const over = (wind, downwind = -1) => {
    const tops = [];
    for (let t = 0.01; t < 120; t += 0.05) for (const x of [80, 210, 340]) tops.push(treeSway(t, wind, downwind, x, (x * 0.37) % 1));
    return { moving: tops.filter((top) => Math.abs(top) >= 1).length / tops.length, mean: tops.reduce((a, b) => a + b, 0) / tops.length, peak: Math.max(...tops.map(Math.abs)) };
  };
  assert.equal(treeSway(0, 1, -1, 100, 0.3), 0, 'still at time 0');
  assert.equal(over(0).peak, 0, 'still in still air');
  const breeze = over(0.25), gale = over(1);
  assert.ok(breeze.moving > 0.05 && breeze.moving < 0.35, `a breeze tips the tops now and then (${breeze.moving.toFixed(2)})`);
  assert.ok(gale.moving > 0.6, 'a gale keeps them moving');
  assert.ok(gale.mean < -0.5 && over(1, 1).mean > 0.5, 'and leans them downwind, either way');
  assert.ok(gale.peak <= TREE_SWAY_MAX && breeze.peak < 2, 'never past two art pixels; a breeze only one');
}

// Leaves let go as gusts pass, flutter down downwind, rest on the ground a
// moment and fade: a few in still air, more in a gale, never more than
// LEAVES_AIRBORNE in the air at once, and none at time 0.
{
  const crown = { left: -54, right: 54, top: -166, bottom: -96 };
  const slope = (lx) => lx * 0.25;
  const sample = (wind, downwind = -1) => {
    let falling = 0, peak = 0, drift = 0, landed = 0, ok = true, n = 0;
    for (let t = 0.5; t < 120; t += 0.1) {
      const leaves = fallingLeaves(t, wind, downwind, 300, crown, slope);
      const air = leaves.filter((leaf) => leaf.y < slope(leaf.x) - 2);
      n++; falling += air.length; peak = Math.max(peak, air.length);
      for (const leaf of leaves) {
        drift += leaf.x;
        if (leaf.y >= slope(leaf.x) - 2) landed++;
        if (leaf.y > slope(leaf.x) || leaf.x % 2 || leaf.y % 2 || leaf.alpha < 0 || leaf.alpha > 1) ok = false;
      }
    }
    return { falling: falling / n, peak, drift, landed, ok };
  };
  assert.deepEqual(fallingLeaves(0, 1, -1, 300, crown, slope), [], 'none at time 0');
  const calm = sample(0), gale = sample(1), right = sample(1, 1);
  assert.ok(calm.falling > 0.01 && calm.falling < 0.15, `a leaf only now and then in still air (${calm.falling.toFixed(2)})`);
  assert.ok(sample(0.4).falling < 0.3, 'still only a few in a moderate breeze');
  assert.ok(gale.falling > calm.falling * 4, 'many more in a gale');
  assert.ok(gale.peak <= LEAVES_AIRBORNE, `never more than ${LEAVES_AIRBORNE} in the air (${gale.peak})`);
  assert.ok(gale.drift < 0 && right.drift > 0, 'they drift downwind, either way');
  assert.ok(gale.landed > 0 && gale.ok, 'they land on the ground, never below it, on the art grid');
  assert.ok(LEAF_REST > 0.5, 'and rest there a moment');
  // A falling leaf changes its look slowly, as it rocks and turns over, not
  // every frame or two: it shouldn't blink.
  let changes = 0, previous = null, seen = 0;
  for (let t = 20; t < 80; t += 1 / 60) {
    const leaf = fallingLeaves(t, 1, -1, 300, crown, () => 0).filter((l) => l.y < -2)[0];
    const look = leaf ? `${leaf.flat}${leaf.color}` : null;
    if (look) seen++;
    if (look && previous && look !== previous) changes++;
    previous = look;
  }
  assert.ok(seen > 0 && changes / 60 < 4, `it turns over gently (${(changes / 60).toFixed(1)} changes a second)`);
}

// The windmill's sails: still at time 0 at an angle of their own, turning
// anticlockwise, slowly, faster in a stronger wind, never faster than about
// a turn every four seconds.
{
  assert.equal(millAngle(0, 1, 0.25), Math.PI / 2, 'still at time 0, at its own angle');
  const turn = (wind) => (millAngle(60, wind, 0) - millAngle(0.001, wind, 0)) / 60;
  assert.ok(turn(0.25) < 0 && turn(1) < 0, 'it turns anticlockwise');
  assert.ok(-turn(1) > -turn(0.25) * 2, 'faster in a gale');
  assert.ok(-turn(1) < (Math.PI * 2) / 3.5, 'but always slowly');
  assert.ok(MILL.hub.y - MILL.sail > -260, 'tall, but not taller than the view can show');
}

// The farmhouse is a landmark, but its door and windows are at true scale
// (PROPS_GUIDE.md), and the same windows are lit every night: most of them,
// never fewer than two.
{
  const [left, top, right, bottom] = FARMHOUSE_BOUNDS;
  assert.ok(right - left >= 216 && right - left <= 280, 'about 8 to 10 m long, roof and all');
  assert.ok(-top > 160 && -top < 200, 'tall, but no taller than the windmill');
  assert.ok([left, top, right, bottom, FARMHOUSE.chimney.x, FARMHOUSE.chimney.y].every((v) => v % 2 === 0), 'on the art grid');
  for (const w of FARMHOUSE_WINDOWS) {
    assert.ok(w.height >= 22 && w.height <= 34 && w.top > FARMHOUSE.eaves && w.top + w.height < FARMHOUSE.bodyBottom, 'a window sits in the wall');
    assert.ok([w.left, w.top, w.width, w.height].every((v) => v % 2 === 0));
  }
  for (const x of Array.from({ length: 200 }, (_, i) => i * 37.5 - 400)) {
    const lit = farmhouseLitWindows(x);
    assert.equal(lit.length, FARMHOUSE_WINDOWS.length);
    assert.ok(lit.filter(Boolean).length >= 2, `at least two windows lit at x ${x}`);
    assert.deepEqual(farmhouseLitWindows(x), lit, 'the same ones every time');
  }
  const houses = Array.from({ length: 200 }, (_, i) => farmhouseLitWindows(i * 53).join());
  assert.ok(new Set(houses).size > 4, 'different houses light different rooms');
}

// The mailbox's flag is down until the rider passes, then flips up,
// overshoots a little and settles; with reduced motion it is simply up.
{
  assert.equal(mailboxFlagLift(null, 3), 0, 'down until passed');
  assert.equal(mailboxFlagLift(0.1, 0), 1, 'up at once at time 0');
  assert.equal(mailboxFlagLift(0, 3), 0, 'it starts from down');
  const lifts = Array.from({ length: 80 }, (_, i) => mailboxFlagLift(i * 0.02, 3));
  assert.ok(Math.max(...lifts) > 1 && Math.max(...lifts) < 1.25, 'overshoots a little');
  assert.equal(mailboxFlagLift(5, 3), 1, 'and settles up');
}

// The stall's sign wraps to its lines, falls back to the default, and the
// honesty box takes a coin that drops into its slot.
{
  assert.deepEqual(stallSignLines(STALL_TEXT), ['KARTOFLER', '20 KR']);
  assert.deepEqual(stallSignLines('  '), stallSignLines(STALL_TEXT), 'a blank sign reads the default');
  for (const text of ['jordbær 30 kr', 'NYE KARTOFLER 20 KR BAKKEN', 'ÆBLER', 'ASPARGESKARTOFLER']) {
    const lines = stallSignLines(text);
    assert.ok(lines.length <= STALL_SIGN_LINES && lines.every((line) => line.length <= STALL_SIGN_LINE), text);
  }
  const trail = (text) => normalizeTrail({
    name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground')],
    start: { x: 120, y: null, facing: 1 }, props: [{ type: 'stall', x: 400, y: null, text }],
  });
  const warns = (text) => validateTrail(trail(text)).filter((m) => m.type === 'warning').map((m) => m.text).join('\n');
  assert.equal(trail('ÆG 2 KR').props[0].text, 'ÆG 2 KR', 'the stall keeps its text');
  assert.ok(/cannot draw/.test(warns('Æg 10 kr')), 'Æ is flagged, the pixel font has no glyph for it');
  assert.ok(/cut off/.test(warns('Nye danske kartofler 20 kr')), 'too long is flagged');
  assert.ok(!/Stall/.test(warns('Jordbaer 30 kr')), 'a sign that fits is fine');
  assert.equal(stallCoin(-0.1), null);
  assert.equal(stallCoin(STALL_COIN_DROP), null, 'gone in once it has dropped');
  const drop = Array.from({ length: 10 }, (_, i) => stallCoin((i * STALL_COIN_DROP) / 10));
  assert.ok(drop.every((coin, i) => coin && coin.x === STALL.slot.x && coin.y < STALL.slot.y && (i === 0 || coin.y >= drop[i - 1].y)), 'it falls into the slot');
}

// The wind turbine turns the other way from the windmill, still at time 0,
// and stands tall without leaving the view.
{
  assert.equal(turbineAngle(0, 1, 0.3), -millAngle(0, 1, 0.3), 'still at time 0');
  assert.ok(turbineAngle(30, 0.5, 0) - turbineAngle(0.001, 0.5, 0) > 0, 'it turns clockwise');
  assert.ok(TURBINE.hub.y - TURBINE.blade > -300 && TURBINE.hub.y - TURBINE.blade < -240, 'tall, but within the view');
}

// The tent's loose door flaps hang still in still air, blow downwind, and
// flap out of step while time runs.
{
  for (const side of [-1, 1]) assert.ok(tentFlapSway(2.3, 0, -1, 0.4, side) === 0, 'still in still air');
  assert.ok(tentFlapSway(0, 0.6, -1, 0.4, -1) < 0 && tentFlapSway(0, 0.6, 1, 0.4, -1) > 0, 'blown downwind');
  assert.notEqual(tentFlapSway(2.3, 0.6, -1, 0.4, -1), tentFlapSway(2.3, 0.6, -1, 0.4, 1), 'out of step');
}

console.log('Countryside props: all checks passed.');
