// Prison props: the searchlight sweeping and locking on, its beam stopping
// at the ground, the prisoner coming to the bars, and the one in the escape
// tunnel ducking out of sight. All of it is visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { PAINTED_PROPS } from '../js/drawing.js';
import { canFlip } from '../js/trail-schema.js';
import {
  CELL_REACH, SEARCHLIGHT, SEARCHLIGHT_BEAM, SEARCHLIGHT_REACH, TUNNEL_SINK,
  cellPrisoner, searchlightAim, searchlightBeam, tunnelPeek,
} from '../js/prison-props.js';

const PRISON_PROPS = ['prison-fence', 'watchtower', 'jail-cell', 'escape-tunnel', 'ball-and-chain', 'wanted-poster', 'tally-marks'];

const trail = (props) => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'stone', 'ground')],
  start: { x: 120, y: null, facing: 1 }, props,
});

// Every prison prop is a known type; the poster can't mirror its lettering.
{
  const warnings = validateTrail(trail(PRISON_PROPS.map((type, index) => ({ type, x: 400 + index * 200, y: null, layer: 'back' }))))
    .filter((m) => m.type === 'warning').map((m) => m.text);
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  assert.ok(!canFlip('wanted-poster'));
  assert.ok(!canFlip('watchtower') && !canFlip('jail-cell') && !canFlip('escape-tunnel'));
  assert.ok(PAINTED_PROPS.has('tally-marks'), 'tally marks are scratched into the rock');
}

// The searchlight sweeps below the horizon, holds still at time 0, and locks
// on to a rider below it and in reach.
{
  assert.equal(searchlightAim(0, 0.3, null, null), searchlightAim(0, 0.7, null, null), 'still at time 0');
  const sweep = Array.from({ length: 40 }, (_, i) => searchlightAim(i * 0.4, 0.2, null, null));
  assert.ok(sweep.every((angle) => angle > 0 && angle < Math.PI), 'it always points down');
  assert.ok(Math.max(...sweep) - Math.min(...sweep) > 1.5, 'and sweeps to and fro');
  const locked = searchlightAim(5, 0.2, 100, 100);
  assert.ok(Math.abs(locked - Math.PI / 4) < 1e-9, 'it points straight at the rider');
  assert.equal(searchlightAim(5, 0.2, -100, 100), (3 * Math.PI) / 4);
  assert.notEqual(searchlightAim(5, 0.2, SEARCHLIGHT_REACH, 100), Math.atan2(100, SEARCHLIGHT_REACH), 'out of reach');
  assert.notEqual(searchlightAim(5, 0.2, 100, -10), Math.atan2(-10, 100), 'not at a rider above it');
  assert.ok(searchlightAim(5, 0, 300, 2) >= 0.15, 'never quite level');
}

// The beam stops where it meets the ground, and throws a spot there.
{
  const down = Math.PI / 2;
  const flat = searchlightBeam(down, () => 0);
  assert.ok(flat.cells.length > 0 && flat.cells.every((cell) => cell.y + 2 <= 0), 'no light under the ground');
  assert.ok(flat.hit && Math.abs(flat.hit.y) <= 2 && Math.abs(flat.hit.x - SEARCHLIGHT.x) < 2, 'the spot is straight below');
  assert.ok(flat.cells.every((cell) => cell.alpha > 0 && cell.alpha < 0.3));
  const far = searchlightBeam(down, () => 1000);
  assert.equal(far.hit, null, 'no ground in reach, no spot');
  assert.ok(far.cells.length > flat.cells.length);
  assert.ok(far.cells.every((cell) => cell.y - SEARCHLIGHT.y <= SEARCHLIGHT_BEAM.length + 16));
}

// The prisoner lounges on the bunk until the rider comes by, then rattles the bars.
{
  assert.deepEqual(cellPrisoner({ time: 3, riderX: null, riderY: null }, 500, 300), { pose: 'sit', rattle: 0 });
  assert.equal(cellPrisoner({ time: 3, riderX: 500 + CELL_REACH.x + 1, riderY: 300 }, 500, 300).pose, 'sit');
  assert.deepEqual(cellPrisoner({ time: 0, riderX: 560, riderY: 300 }, 500, 300), { pose: 'stand', rattle: 0 }, 'still at time 0');
  const rattles = new Set(Array.from({ length: 10 }, (_, i) => cellPrisoner({ time: i * 0.1, riderX: 560, riderY: 300 }, 500, 300).rattle));
  assert.ok(rattles.has(2) && rattles.has(-2));
}

// The prisoner in the tunnel sinks out of sight as the rider comes close, eyeing them.
{
  assert.equal(tunnelPeek({ time: 0, riderX: null, riderY: null }, 500, 300).rise, 1);
  assert.equal(tunnelPeek({ time: 0, riderX: 500 + TUNNEL_SINK.from + 10, riderY: 300 }, 500, 300).rise, 1);
  const wary = tunnelPeek({ time: 2, riderX: 500 - (TUNNEL_SINK.from + TUNNEL_SINK.to) / 2, riderY: 300 }, 500, 300);
  assert.ok(wary.rise > 0 && wary.rise < 1);
  assert.equal(wary.look, -1, 'they watch the rider coming');
  assert.equal(tunnelPeek({ time: 2, riderX: 520, riderY: 300 }, 500, 300).rise, 0, 'gone');
  const looks = new Set(Array.from({ length: 12 }, (_, i) => tunnelPeek({ time: i * 0.7, riderX: null, riderY: null }, 500, 300).look));
  assert.ok(looks.has(-1) && looks.has(1), 'they glance about');
  assert.equal(tunnelPeek({ time: 0, riderX: null, riderY: null }, 500, 300).look, 0);
}

console.log('Prison props: all checks passed.');
