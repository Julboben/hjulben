// Every prop type the editor offers draws without throwing: still and
// moving, flipped and turned, and its glow by day and after dark. Drawing
// code only fails when a line runs, so a stray name in one prop's branch
// (a leftover variable after a refactor, say) breaks the game and the editor
// for any trail that uses it, while every other check passes. This runs each
// branch once against a canvas that accepts any call.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';

const STYLE_KEYS = new Set(['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'globalCompositeOperation',
  'imageSmoothingEnabled', 'font', 'lineCap', 'lineJoin', 'textAlign', 'textBaseline', 'filter']);
// A 2D context that takes any drawing call and remembers any style set on it.
const anyContext = () => new Proxy({
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  measureText: () => ({ width: 10 }),
}, {
  get: (target, key) => (key in target ? target[key]
    : typeof key === 'string' && /^[a-z]/.test(key) && !STYLE_KEYS.has(key) ? () => {} : target[key]),
  set: (target, key, value) => { target[key] = value; return true; },
});
globalThis.OffscreenCanvas = class { constructor(width, height) { Object.assign(this, { width, height }); } getContext() { return anyContext(); } };

const { createGameArt, propWallFit } = await import('../js/drawing.js');

const html = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');
const list = html.slice(html.indexOf('id="selection-prop-type"'));
const types = [...new Set([...list.matchAll(/<option value="([a-z0-9-]+)"/g)].map((match) => match[1]))];
assert.ok(types.length > 50, `found the editor's prop types (${types.length})`);

const art = createGameArt(anyContext());
// Ground, and a roof over part of it for the props that hang from one.
const trail = normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [], props: [],
  start: { x: 120, y: null, facing: 1 },
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground'), rectangle(300, 0, 1400, 120, 'stone', 'wall')],
});
const scenes = [
  undefined,
  { time: 3.3, riderX: 610, riderY: 300, wind: 0.6, landing: { x: 590, y: 320, time: 3, strength: 1 } },
  // Just passed (a halfway flag, a mailbox) and just paid (a stall).
  { time: 3.3, riderX: 610, riderY: 300, passed: { split: 12.3, age: 0.1 }, paid: { time: 3.2 } },
];
const failures = [];
for (const type of types) {
  const prop = { type, x: 600, y: 320 };
  try {
    const fit = propWallFit(trail, prop);
    for (const scene of scenes)
      for (const flip of [false, true])
        for (const rotation of [0, 0.3])
          art.drawProp(type, 600, 320, 1, 0, () => 0, type === 'sign' ? 'HI' : '', fit, flip, scene, rotation);
    for (const dark of [false, true]) art.drawPropGlow(type, 600, 320, () => 0, false, 2, { trail, prop, fit, dark });
  } catch (error) {
    failures.push(`${type}: ${error.message}`);
  }
}
assert.deepEqual(failures, [], `every prop draws:\n${failures.join('\n')}`);
console.log(`Prop drawing tests passed (${types.length} types).`);
