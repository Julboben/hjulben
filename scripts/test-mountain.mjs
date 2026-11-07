// Mountain props: the hut's smoke in the wind, the snowy pine's shake after a
// hard landing, the snowman's gaze, the ski lift's chair and the icicles. All
// of it is visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { canFlip, canRotate, propSpan, propWallFit, riderGaze } from '../js/drawing.js';
import {
  CABLE_HALF, HUT_CHIMNEY, ICICLE_REACH, SNOW_PINE_REACH, SNOW_PUFF_TIME, chimneySmoke, icicleLengths,
  SNOWMAN_EYE_HEIGHT, liftChair, pineShake, pineSnowFall, pineSway,
} from '../js/mountain-props.js';

const MOUNTAIN_PROPS = ['cairn', 'ski-lift', 'icicles', 'snow-pine', 'hut', 'snowman'];

// Ground at 320, with an overhang whose underside is 200 above it.
const trail = (props) => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'snow', 'ground'), rectangle(1000, 0, 1200, 120, 'stone', 'wall')],
  start: { x: 120, y: null, facing: 1 }, props,
});
const prop = (type, x, extra = {}) => ({ type, x, y: null, layer: 'back', ...extra });

// Every mountain prop is a known type.
{
  const warnings = validateTrail(trail(MOUNTAIN_PROPS.map((type, index) => prop(type, 400 + index * 200))))
    .filter((m) => m.type === 'warning');
  assert.ok(!warnings.some((m) => /unknown type/.test(m.text)), warnings.map((m) => m.text).join('\n'));
  assert.ok(!canRotate('ski-lift'), 'the chair hangs plumb');
  assert.ok(canFlip('hut') && canFlip('snowman') && !canFlip('icicles'));
}

// The smoke blows downwind, leans further in a stronger wind, and holds still at time 0.
{
  const drift = (puffs) => puffs.reduce((sum, puff) => sum + (puff.x - HUT_CHIMNEY.x) * puff.alpha, 0);
  assert.ok(drift(chimneySmoke(3, 0.2, 0.3, -1)) < 0, 'it drifts left with the weather');
  assert.ok(drift(chimneySmoke(3, 0.2, 0.3, 1)) > 0, 'and right when the hut is flipped');
  assert.ok(drift(chimneySmoke(3, 0.2, 1, -1)) < drift(chimneySmoke(3, 0.2, 0, -1)), 'a gale bends it over');
  assert.deepEqual(chimneySmoke(0, 0.2, 0.5), chimneySmoke(0, 0.2, 0.5), 'still at time 0');
  for (const puff of chimneySmoke(7.3, 0.6, 1)) assert.ok(puff.y <= HUT_CHIMNEY.y && puff.alpha >= 0 && puff.alpha <= 1);
  const top = (puffs) => Math.min(...puffs.map((puff) => puff.y));
  assert.ok(top(chimneySmoke(3, 0.2, 1, -1)) > top(chimneySmoke(3, 0.2, 0, -1)), 'a gale keeps it low');
}

// A hard landing nearby shakes the pine for a moment; nothing shakes at time 0.
{
  const landing = { x: 500, y: 300, time: 10, strength: 1 };
  assert.equal(pineShake(null, 500, 320, 10.2), null);
  assert.equal(pineShake(landing, 500, 320, 0), null, 'reduced motion');
  assert.equal(pineShake(landing, 500, 320, 9.9), null, 'not before the landing');
  assert.equal(pineShake(landing, 500, 320, 10 + SNOW_PUFF_TIME + 0.1), null, 'it settles');
  assert.equal(pineShake(landing, 500 + SNOW_PINE_REACH + 1, 320, 10.2), null, 'too far to the side');
  assert.equal(pineShake(landing, 500, 900, 10.2), null, 'too far above or below');
  const near = pineShake(landing, 520, 320, 10.1);
  const far = pineShake(landing, 500 + SNOW_PINE_REACH - 10, 320, 10.1);
  assert.ok(near && far && near.strength > far.strength, 'weaker further away');
  assert.ok(pineShake({ ...landing, strength: 0.4 }, 520, 320, 10.1).strength < near.strength, 'softer landing, softer shake');
  assert.notEqual(pineSway(near), 0, 'the crown sways');
  const flakes = pineSnowFall(near, () => 0.5, () => 0);
  assert.ok(flakes.length > 0 && flakes.every((flake) => flake.y <= 0), 'snow falls, but not through the ground');
}

// The snowman's eyes follow the rider sideways, and up or down when far off.
{
  const eye = { x: 0, y: SNOWMAN_EYE_HEIGHT };
  const at = (dx, dy) => riderGaze({ riderX: 500 + dx, riderY: 300 + SNOWMAN_EYE_HEIGHT + dy }, 500, 300, false, eye);
  assert.deepEqual(riderGaze({ riderX: null, riderY: null }, 500, 300, false, eye), { x: 0, y: 0 });
  assert.deepEqual(at(-200, 0), { x: -1, y: 0 });
  assert.deepEqual(at(200, -200), { x: 1, y: -1 });
  assert.deepEqual(at(0, 200), { x: 0, y: 1 });
}

// The chair waits on the rope at time 0, and fades out past its ends.
{
  assert.deepEqual(liftChair(0, 0.3), liftChair(0, 0.9));
  assert.equal(liftChair(0, 0.3).alpha, 1);
  for (let time = 0.5; time < 40; time += 0.7) {
    const chair = liftChair(time, 0.3);
    if (Math.abs(chair.x) > CABLE_HALF) assert.equal(chair.alpha, 0);
  }
  // It swings further in a gale, pushed downwind.
  const swings = (wind, downwind) => Array.from({ length: 60 }, (_, i) => liftChair(0.5 + i * 0.37, 0.3, wind, downwind))
    .filter((chair) => chair.alpha > 0).map((chair) => chair.swing);
  const range = (values) => Math.max(...values) - Math.min(...values);
  assert.ok(range(swings(1, -1)) > range(swings(0, -1)), 'swings further in a gale');
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(swings(1, -1)) < 0 && mean(swings(1, 1)) > 0, 'pushed downwind');
}

// Icicles fit under an overhang, and culling covers the meltwater's fall.
{
  const noise = (n) => (n * 0.37) % 1;
  assert.ok(icicleLengths(1000, noise).every((length) => length <= ICICLE_REACH));
  assert.ok(icicleLengths(20, noise).every((length) => length <= 20), 'shorter near the floor');
  const icicles = prop('icicles', 1100, { y: 130 });
  const fit = propWallFit(trail([icicles]), icicles);
  assert.ok(Number.isFinite(fit.ceiling) && Number.isFinite(fit.drop), 'it finds the overhang above and the floor below');
  const [, hang] = propSpan('icicles', fit);
  assert.ok(hang >= fit.ceiling + fit.drop, 'culling reaches the puddle');
}

// The smoke prop: the hut's plume on its own, for a chimney built from
// terrain. It is a known type, and it rises straight up whatever the prop's
// rotation, so it can't be turned.
{
  const trail = normalizeTrail({
    name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground')],
    start: { x: 120, y: null, facing: 1 }, props: [{ type: 'smoke', x: 400, y: null, layer: 'back' }],
  });
  const warnings = validateTrail(trail).filter((m) => m.type === 'warning').map((m) => m.text);
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  assert.ok(!canRotate('smoke') && canFlip('smoke'));
}

console.log('Mountain tests passed.');
