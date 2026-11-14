// The two trail shapes the editor DOM test boots against.
import { readFileSync } from 'node:fs';

const html = () => readFileSync(new URL('../../editor.html', import.meta.url), 'utf8');

const blockNodes = [
  { id: 'n1', x: 0, y: 300, mode: 'corner', in: null, out: null, edge: 'straight' },
  { id: 'n2', x: 800, y: 300, mode: 'corner', in: null, out: null, edge: 'straight' },
  { id: 'n3', x: 800, y: 600, mode: 'corner', in: null, out: null, edge: 'straight' },
  { id: 'n4', x: 0, y: 600, mode: 'corner', in: null, out: null, edge: 'straight' },
];

const base = () => ({
  name: 'Test', finish: { x: 700, y: null },
  terrainBlocks: [{
    id: 'b1',
    material: 'grass',
    outer: { id: 'bo1', nodes: blockNodes }, inner: [],
  }],
  apples: [], props: [], spikes: [], weather: { sun: 1, clouds: 0 },
  start: { x: 90, y: null, facing: 1 },
});

/**
 * `blocks` is a plain block trail. `badgoal` is the same trail with its
 * ground-anchored finish well past the end of the terrain, where it has no
 * ground to stand on, so it does not validate. `interact` uses the plain trail
 * too, and drives precise gestures against it. `warned` has a prop of an
 * unknown type, so its validation warning points at a prop. `locks` adds a
 * back wall beside the slab with an apple in front of it. `group` has
 * props and spikes that differ, for editing them together in the inspector.
 */
export function loadTrailShape(kind) {
  const trail = base();
  if (kind === 'badgoal') Object.assign(trail, { finish: { x: 3000, y: null } });
  if (kind === 'covered') trail.props = [
    { x: 500, y: null, type: 'tree', layer: 'back' },
    { x: 250, y: null, type: 'tree', layer: 'back' },
  ];
  if (kind === 'warned') trail.props = [{ x: 600, y: null, type: 'nope', layer: 'back' }];
  if (kind === 'locks') {
    // A back wall behind and beside the slab, with an apple in front of it.
    trail.terrainBlocks.push({
      id: 'b2', material: 'rock', layer: 'back',
      outer: { id: 'bo2', nodes: [
        { id: 'w1', x: 900, y: 0, mode: 'corner', in: null, out: null, edge: 'straight' },
        { id: 'w2', x: 1600, y: 0, mode: 'corner', in: null, out: null, edge: 'straight' },
        { id: 'w3', x: 1600, y: 600, mode: 'corner', in: null, out: null, edge: 'straight' },
        { id: 'w4', x: 900, y: 600, mode: 'corner', in: null, out: null, edge: 'straight' },
      ] },
      inner: [],
    });
    trail.apples = [{ x: 1200, y: 300 }];
  }
  if (kind === 'rotate') {
    trail.props = [{ x: 600, y: null, type: 'rock', layer: 'back' }];
    trail.water = [{ x: 1000, y: 200, width: 200, depth: 60 }];
  }
  if (kind === 'group') {
    trail.props = [
      { x: 200, y: null, type: 'tree', layer: 'back' },
      { x: 400, y: null, type: 'rock', layer: 'front', flip: true },
      { x: 600, y: null, type: 'sign', layer: 'back', text: 'GO' },
    ];
    trail.spikes = [{ x: 300, y: 200, radius: 20, spin: 0 }, { x: 500, y: 200, radius: 30, spin: 1 }];
  }
  return { html: html(), trail };
}
