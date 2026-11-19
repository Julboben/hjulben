// Spiders and webs: they hang from the roof, the web trembles and its spider
// retreats when the rider comes, the dangling spider climbs back up its
// thread, and the cocoon twitches now and then. Visual only, still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { CEILING_PROPS, canRotate, propSpan } from '../js/drawing.js';
import { canFlip } from '../js/trail-schema.js';
import {
  SPIDER_DROP, SPIDER_NOTICE, WEB, WEB_NOTICE, cobwebSwing, cocoonMotion, danglingSpider, spiderDare,
  webSize, webState,
} from '../js/spider-props.js';

const SPIDER_PROPS = ['spiderweb', 'cobweb', 'spider', 'cocoon'];

// Every spider prop is a known ceiling prop, and keeps its own angle.
{
  const trail = normalizeTrail({
    name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground'), rectangle(300, 0, 1400, 120, 'stone', 'wall')],
    start: { x: 120, y: null, facing: 1 },
    props: SPIDER_PROPS.map((type, index) => ({ type, x: 400 + index * 200, y: null, layer: 'back' })),
  });
  const warnings = validateTrail(trail).filter((m) => m.type === 'warning').map((m) => m.text);
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  for (const type of SPIDER_PROPS) {
    assert.ok(CEILING_PROPS.has(type) && !canFlip(type) && !canRotate(type), `${type} hangs from the roof`);
    const [rise, hang] = propSpan(type, { ceiling: -200, drop: 200 });
    assert.ok(rise >= 200 && hang >= 0, `${type} is culled with its roof in view`);
  }
}

// A spider dares to stay out until the rider comes close.
{
  assert.equal(spiderDare(Infinity, 200, 80), 1);
  assert.equal(spiderDare(50, 200, 80), 0);
  assert.ok(spiderDare(140, 200, 80) > 0 && spiderDare(140, 200, 80) < 1);
}

// The orb web shrinks under a low roof, and trembles only while time runs.
{
  assert.deepEqual(webSize(Infinity), { hub: WEB.hub, radius: WEB.radius });
  const low = webSize(40);
  assert.ok(low.hub < WEB.hub && low.radius < WEB.radius && low.hub % 2 === 0 && low.radius % 2 === 0);
  assert.deepEqual(webState({ time: 3, riderX: null, riderY: null }, 500, 100), { tremble: 0, dare: 1 });
  assert.equal(webState({ time: 0, riderX: 520, riderY: 100 }, 500, 100).tremble, 0, 'still at time 0');
  assert.equal(webState({ time: 0, riderX: 520, riderY: 100 }, 500, 100).dare, 0, 'the spider has gone up');
  const near = Array.from({ length: 10 }, (_, i) => webState({ time: 1 + i * 0.013, riderX: 500 + (WEB_NOTICE.from + WEB_NOTICE.to) / 2, riderY: 100 }, 500, 100).tremble);
  assert.ok(near.some((value) => Math.abs(value) > 0.1), 'it trembles as the rider passes');
}

// The dangling spider hangs low when alone, never through the floor, and climbs up as the rider comes.
{
  const alone = danglingSpider({ time: 0, riderX: null, riderY: null }, 500, 100);
  assert.equal(alone.length, SPIDER_DROP);
  assert.ok(danglingSpider({ time: 0, riderX: null, riderY: null }, 500, 100, 60).length <= 60 - 24, 'room for it under a low roof');
  const close = danglingSpider({ time: 0, riderX: 500, riderY: 100 + SPIDER_DROP }, 500, 100);
  assert.equal(close.length, 8, 'up by the roof');
  const half = danglingSpider({ time: 2, riderX: 500 + (SPIDER_NOTICE.from + SPIDER_NOTICE.to) / 2, riderY: 100 + SPIDER_DROP }, 500, 100);
  assert.ok(half.length > 8 && half.length < SPIDER_DROP && half.length % 2 === 0);
  const steps = new Set(Array.from({ length: 6 }, (_, i) => danglingSpider({ time: 2 + i * 0.09, riderX: 640, riderY: 210 }, 500, 100).step));
  assert.ok(steps.has(0) && steps.has(1), 'it scuttles up its thread');
}

// The cobweb and cocoon hold still at time 0, and stir otherwise.
{
  assert.equal(cobwebSwing(0, 1, 0.3), 0);
  assert.ok(cobwebSwing(5, 1, 0.3) < cobwebSwing(5, 0, 0.3), 'the wind blows the tatters left');
  assert.deepEqual(cocoonMotion(0, 1, 0.2), { swing: 0, twitch: 0 });
  const twitches = Array.from({ length: 200 }, (_, i) => cocoonMotion(i * 0.05, 0, 0.2).twitch);
  assert.ok(twitches.some((t) => t !== 0) && twitches.filter((t) => t === 0).length > 150, 'it twitches now and then');
}

console.log('Spider props: all checks passed.');
