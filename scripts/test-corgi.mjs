// Coda the corgi: the ground he can trot along, wandering near his anchor,
// running over to greet the rider and woofing, and sitting still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { canRotate, propSpan, propWallFit } from '../js/drawing.js';
import { canFlip } from '../js/trail-schema.js';
import {
  CORGI_GAP, CORGI_HEART, CORGI_RANGE, CORGI_STAY, CORGI_STEP, CORGI_WANDER, corgiGround, corgiPhase, corgiPose, corgiReach, corgiSit, corgiStart,
  corgiStep,
} from '../js/corgi-props.js';

// Ground at 320, with a wall from 1000 to 1200.
const trail = (props) => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'grass', 'ground'), rectangle(1000, 100, 1200, 320, 'stone', 'ground')],
  start: { x: 120, y: null, facing: 1 }, props,
});
const prop = (type, x, extra = {}) => ({ type, x, y: null, layer: 'back', ...extra });

// Runs a corgi for `seconds` with the rider at `riderDx` (or none).
function run(fit, seconds, riderDx = null, state = corgiStart(), from = 0.01) {
  const woofs = [];
  for (let t = from; t < from + seconds; t += 1 / 60) {
    state = corgiStep(state, { time: t, dt: 1 / 60, riderDx, riderDy: riderDx === null ? null : 0, fit, phase: 0.3 });
    if (state.woofed) woofs.push(t);
  }
  return { state, woofs };
}

// A known type that keeps upright and can be placed facing either way.
{
  const warnings = validateTrail(trail([prop('corgi', 600)])).filter((m) => m.type === 'warning');
  assert.ok(!warnings.some((m) => /unknown type/.test(m.text)), warnings.map((m) => m.text).join('\n'));
  assert.ok(!canRotate('corgi') && canFlip('corgi'));
}

// His ground stops at the wall and reaches no further than CORGI_RANGE.
const corgi = prop('corgi', 900);
const level = trail([corgi]);
const fit = propWallFit(level, corgi);
{
  const reach = corgiReach(fit);
  assert.equal(reach.min, -CORGI_RANGE, 'open ground to the left');
  assert.ok(reach.max < 1000 - 900 && reach.max >= 1000 - 900 - CORGI_STEP * 2, 'stops at the wall');
  assert.equal(corgiGround(fit, -50), 0, 'flat ground');
  assert.equal(propWallFit(level, corgi), fit, 'cached');
  assert.ok(propSpan('corgi', fit)[0] >= 40, 'culling covers his ears');
}

// At time 0 he sits at his anchor, facing the way he was placed.
{
  assert.deepEqual(corgiStep(corgiStart(-1), { time: 0, dt: 0.1, riderDx: 10, fit }), corgiStart(-1));
  const pose = corgiPose(corgiStart(-1), fit, corgiPhase(900));
  assert.equal(pose.pose, 'sit');
  assert.equal(pose.dx, 0);
  assert.equal(pose.dir, -1);
  assert.ok(!pose.woof && pose.wag === 0);
}

// Alone, he potters about within CORGI_WANDER of his anchor.
{
  let state = corgiStart();
  let far = 0;
  for (let t = 0.01; t < 120; t += 1 / 30) {
    state = corgiStep(state, { time: t, dt: 1 / 30, fit, phase: 0.3 });
    far = Math.max(far, Math.abs(state.dx));
  }
  assert.ok(far > 4 && far <= CORGI_WANDER + 1, `wandered ${far}`);
}

// A rider nearby: he woofs, runs over and stops a little short of them.
{
  const { state, woofs } = run(fit, 4, -120);
  assert.equal(state.mode, 'greet');
  assert.ok(Math.abs(state.dx - (-120 + CORGI_GAP)) <= 12, `stopped at ${state.dx}`);
  assert.equal(state.dir, -1, 'facing the rider');
  assert.ok(woofs.length >= 2, 'woofs on noticing and then now and then');
  const pose = corgiPose(state, fit, 0.3);
  assert.equal(pose.pose, 'stand');
}

// Never past the wall, however close the rider is behind it.
{
  const { state } = run(fit, 4, 140);
  assert.ok(state.dx <= corgiReach(fit).max);
}

// Once the rider has gone, he loses interest and trots home.
{
  const greeting = run(fit, 4, -120).state;
  const { state } = run(fit, 20, -900, greeting, 4);
  assert.equal(state.mode, 'wander');
  assert.ok(Math.abs(state.dx) <= CORGI_WANDER + 1);
}

// A rider high above (on a ledge) goes unnoticed.
{
  let state = corgiStart();
  for (let t = 0.01; t < 2; t += 1 / 60)
    state = corgiStep(state, { time: t, dt: 1 / 60, riderDx: 40, riderDy: -200, fit, phase: 0.3 });
  assert.equal(state.mode, 'wander');
}

// Told to sit, he sits and pants where he is, facing the rider, with a heart
// over his head at first, until he has stayed long enough.
{
  const greeting = run(fit, 4, -120).state;
  const told = corgiSit(greeting, 4);
  const { state, woofs } = run(fit, 3, -100, told, 4);
  assert.equal(state.mode, 'sit');
  assert.equal(state.dx, greeting.dx, 'stays put');
  assert.equal(state.dir, -1);
  assert.equal(woofs.length, 0, 'quiet while sitting');
  const pose = corgiPose(state, fit, 0.3);
  assert.ok(pose.pose === 'sit' && pose.pant && pose.heart === null);
  assert.ok(corgiPose(corgiStep(told, { time: 4.5, dt: 1 / 60, riderDx: -100, fit }), fit).heart > 0, 'a heart at first');
  assert.ok(0.5 < CORGI_HEART && CORGI_HEART < CORGI_STAY);
  const later = run(fit, CORGI_STAY, -100, state, 7).state;
  assert.notEqual(later.mode, 'sit', 'up again after a while');
  const left = run(fit, 1, -900, state, 7).state;
  assert.equal(left.mode, 'wander', 'up when the rider leaves');
}

console.log('Corgi tests passed.');
