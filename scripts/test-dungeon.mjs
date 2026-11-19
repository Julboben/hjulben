// Dungeon props: the bars run from the roof to the floor, the portcullis
// grinds up as the rider comes, the torch flickers, the chains and gibbet
// swing after a hard landing, and the skeleton's jaw chatters. All of it is
// visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { CEILING_PROPS, canRotate, propSpan, propWallFit } from '../js/drawing.js';
import { canFlip } from '../js/trail-schema.js';
import {
  BAR_XS, BARS, CHATTER, JOLT, PORTCULLIS, TORCH_TONGUES, barLayout, hangingSwing, portcullisDrop, skeletonJaw,
} from '../js/dungeon-props.js';
import { fireFrame } from '../js/fire.js';

const DUNGEON_PROPS = ['dungeon-bars', 'portcullis', 'torch', 'hanging-chains', 'gibbet', 'skeleton'];
const HANGING = ['portcullis', 'hanging-chains', 'gibbet'];

// A stone floor at y = 320, and a roof from y = 120 up between x = 300 and 1400.
const trail = normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground'), rectangle(300, 0, 1400, 120, 'stone', 'wall')],
  start: { x: 120, y: null, facing: 1 },
  props: DUNGEON_PROPS.map((type, index) => ({ type, x: 400 + index * 160, y: null, layer: 'back' })),
});

// Every dungeon prop is a known type; the hanging ones hang from the roof and
// keep their angle, and so do the bars.
{
  const warnings = validateTrail(trail).filter((m) => m.type === 'warning').map((m) => m.text);
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  for (const type of HANGING) {
    assert.ok(CEILING_PROPS.has(type) && !canFlip(type) && !canRotate(type), `${type} hangs from the roof`);
    const [rise, hang] = propSpan(type, { ceiling: -200, drop: 200 });
    assert.ok(rise >= 200 && hang >= 0, `${type} is culled with its roof in view`);
  }
  assert.ok(!canFlip('dungeon-bars') && !canRotate('dungeon-bars'), 'the bars fit themselves to the rock');
  assert.ok(!canFlip('torch') && canFlip('skeleton'), 'the skeleton faces a way, the torch is lit from the right');
}

// The bars find the roof over each of them, and stand on their own with spear
// points where there is none.
{
  const fit = propWallFit(trail, { type: 'dungeon-bars', x: 600, y: 320 });
  assert.equal(fit.roofs.length, BAR_XS.length);
  assert.ok(fit.roofs.every((roof) => roof === -200), `roofs ${fit.roofs}`);
  const [rise] = propSpan('dungeon-bars', fit);
  assert.ok(rise >= 200, 'culled with its roof in view');
  const open = propWallFit(trail, { type: 'dungeon-bars', x: 2000, y: 320 });
  assert.ok(open.roofs.every((roof) => roof === null), 'no roof out in the open');
  const bars = barLayout(open.roofs, () => 0);
  assert.ok(bars.every((bar) => bar.capped && bar.top === -BARS.height && bar.bottom === 0));
  const sloped = barLayout(fit.roofs, (x) => x / 2, true);
  assert.deepEqual(sloped.map((bar) => bar.bottom), BAR_XS.map((x) => Math.round(x / 4) * 2), 'each bar meets the floor under it');
  assert.ok(sloped.every((bar) => bar.top % 2 === 0 && bar.bottom % 2 === 0), 'on the art grid');
  assert.deepEqual(sloped.map((bar) => bar.bow), [0, -4, 4, 0, 0], 'two bent bars, bowed apart');
}

// The portcullis is down to the floor until the rider comes, then grinds up.
{
  const alone = portcullisDrop({ riderX: null, riderY: null }, 500, 320, 200);
  assert.equal(alone, 198, 'down to just above the floor');
  assert.equal(portcullisDrop({}, 0, 0), PORTCULLIS.height, 'its own height with no floor');
  assert.equal(portcullisDrop({}, 0, 0, 1000), PORTCULLIS.max, 'never longer than it is');
  const close = portcullisDrop({ riderX: 520, riderY: 320 }, 500, 320, 200);
  assert.equal(close, PORTCULLIS.show, 'fully up as the rider rides under it');
  const coming = portcullisDrop({ riderX: 500 + (PORTCULLIS.from + PORTCULLIS.to) / 2, riderY: 320 }, 500, 320, 200);
  assert.ok(coming > PORTCULLIS.show && coming < alone && coming % 2 === 0, 'part way up as the rider comes');
}

// The torch's flame holds still at time 0 and flickers otherwise.
{
  assert.deepEqual(fireFrame(TORCH_TONGUES, 0, 0.4), fireFrame(TORCH_TONGUES, 0, 0.9), 'still at time 0');
  const heights = new Set(Array.from({ length: 40 }, (_, i) => fireFrame(TORCH_TONGUES, 1 + i * 0.03, 0.4)[0].height));
  assert.ok(heights.size > 1, 'it flickers');
}

// Chains and the gibbet sway, and swing away from a hard landing nearby.
{
  assert.equal(hangingSwing(0, 1, { x: 500, y: 300, time: 0, strength: 1 }, 520, 200), 0, 'still at time 0');
  const calm = Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(hangingSwing(1 + i * 0.1, 0, null, 520, 200))));
  assert.ok(calm > 0 && calm < 0.05, 'a slow sway in still air');
  const landing = { x: 480, y: 300, time: 5, strength: 1 };
  const kicked = Math.max(...Array.from({ length: 20 }, (_, i) => hangingSwing(5 + i * 0.03, 0, landing, 520, 200)));
  assert.ok(kicked > 0.1, 'swung away from the landing');
  assert.ok(Math.abs(hangingSwing(5.2, 0, { ...landing, x: 520 + JOLT.x + 10 }, 520, 200)) < 0.05, 'too far away to feel it');
  assert.ok(Math.abs(hangingSwing(5 + JOLT.time + 0.1, 0, landing, 520, 200)) < 0.05, 'and it dies away');
}

// The skeleton's jaw chatters for a moment after a hard landing nearby.
{
  const landing = { x: 500, y: 320, time: 3, strength: 1 };
  assert.equal(skeletonJaw(0, landing, 520, 320), 0, 'still at time 0');
  const chatter = Array.from({ length: 12 }, (_, i) => skeletonJaw(3 + i * 0.07, landing, 520, 320));
  assert.ok(chatter.includes(0) && chatter.includes(2), 'it chatters');
  assert.equal(skeletonJaw(3 + CHATTER.time + 0.1, landing, 520, 320), 0, 'then stops');
  assert.equal(skeletonJaw(3.1, { ...landing, x: 520 + CHATTER.x + 10 }, 520, 320), 0, 'only for landings nearby');
}

console.log('Dungeon props: all checks passed.');
