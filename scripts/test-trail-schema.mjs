import assert from 'node:assert/strict';
import { FALL_MARGIN, fallLine, terrainAt } from '../js/terrain.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import {
  SPIKE_RADIUS, createBlankTrail, normalizeTrail, normalizeSpike, validateTrail, medalFor, normalizeMedals,
  trailTerrainBlocks, trailBackWalls, AUTHOR_MAX_LENGTH, NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH,
  PROP_WARNING_COUNT, APPLE_WARNING_COUNT, SPIKE_WARNING_COUNT, normalizeRotation, OVERVIEW_MAX_LENGTH
} from '../js/trail-schema.js';
import { RADIUS, WHEELBASE } from '../js/config.js';
import { trailHash } from '../js/trail-hash.js';
import { isOnlineTrail } from '../js/online-leaderboard.js';
import { loadCatalogTrails } from './lib/trails.mjs';

const errors = trail => validateTrail(trail).filter(message => message.type === 'error').map(message => message.text);

// Every shipped trail validates, and normalizing is idempotent.
for (const entry of [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus'), ...loadCatalogTrails('custom')]) {
  const trail = normalizeTrail(entry.trail);
  assert.deepEqual(errors(trail), [], `${entry.id} validates`);
  assert.deepEqual(normalizeTrail(trail), trail, `${entry.id} normalizes idempotently`);
}

// Spikes: ground-anchored spikes sit on the ground, radius is clamped, spin defaults to 1.
{
  const anchored = normalizeSpike({ x: 200 }, 300);
  assert.equal(anchored.radius, SPIKE_RADIUS.default);
  assert.equal(anchored.y, 300 - SPIKE_RADIUS.default);
  assert.equal(anchored.spin, 1);
  assert.equal(normalizeSpike({ x: 0, y: 10, radius: 999 }).radius, SPIKE_RADIUS.max);
  assert.equal(normalizeSpike({ x: 0, y: 10, radius: 1 }).radius, SPIKE_RADIUS.min);
  assert.equal(normalizeSpike({ x: 0, y: 10, spin: -0.5 }).spin, -0.5);
  assert.equal(normalizeSpike({ x: 0, y: null }, 250).y, 250 - SPIKE_RADIUS.default);

  const trail = normalizeTrail({ ...createBlankTrail(), spikes: [{ x: 700, y: 100, radius: 20 }] });
  trail.spikes.push({ x: Number.NaN, y: 0, radius: 20, spin: 1 });
  assert.ok(errors(trail).some(text => text.includes('finite coordinates')));
  trail.spikes = [{ x: trail.start.x + 10, y: terrainAt(trail, trail.start.x).y - 20, radius: 20, spin: 1 }];
  assert.ok(validateTrail(trail).some(message => message.type === 'warning' && message.text.includes('close to the start')));
}

// Import round-trip: export as JSON, parse, normalize — nothing is lost.
{
  const original = normalizeTrail({
    ...createBlankTrail(),
    name: 'Round Trip',
    spikes: [{ x: 640, radius: 24, spin: -1 }],
    apples: [{ x: 500, y: null }, { x: 820, y: 180 }],
    medals: { gold: 20, silver: 30, bronze: 45 }
  });
  const imported = normalizeTrail(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(imported, original);
  assert.deepEqual(errors(imported), []);
  assert.equal(trailHash(imported), trailHash(original));
}

// Garbage input still normalizes into a well-formed trail.
{
  const trail = normalizeTrail({ name: 'Broken', terrainBlocks: 'nope', spikes: [{}], apples: [{ x: 'x' }], start: {} });
  assert.deepEqual(trail.terrainBlocks, []);
  assert.equal(trail.spikes.length, 1);
  assert.ok(Number.isFinite(trail.spikes[0].y));
  assert.equal(trail.start.facing, 1);
  assert.equal(trail.start.x, 90, 'a missing start x falls back');
  // Low Bridge and Sinkhole start at x 0, which once fell back to 90 too.
  assert.equal(normalizeTrail({ start: { x: 0, y: null, facing: 1 } }).start.x, 0);
}

// Apples: a missing or unreadable height means "over the ground", never NaN,
// and an apple without a finite x is an error rather than a silent 0.
{
  const trail = normalizeTrail({ ...createBlankTrail(), apples: [{ x: 300 }, { x: 400, y: 'high' }, { x: 500, y: null }, { x: 600, y: '120' }] });
  assert.deepEqual(trail.apples.map(apple => apple.y), [null, null, null, 120]);
  assert.deepEqual(errors(trail), []);
  assert.ok(errors({ ...trail, apples: [{ x: Number.NaN, y: null }] }).some(text => text.includes('Apple 1 must have a finite x')));
}

// Things buried in solid terrain are errors: the start's wheels, an apple with
// a height of its own, and the finish flower. On the surface they are fine.
{
  const blank = normalizeTrail(createBlankTrail());
  const groundAt = x => terrainAt(blank, x, null).y;
  assert.deepEqual(errors(blank), []);
  const buried = x => normalizeTrail({ ...blank, start: { x, y: groundAt(x) + 40, facing: 1 } });
  assert.ok(errors(buried(300)).some(text => text.includes('starts inside solid terrain')));
  // One wheel under the ground is enough: here only the rear wheel is in the slab.
  const edge = normalizeTrail({ ...blank, start: { x: 1400 + WHEELBASE / 2 - 2, y: groundAt(1398) + 40, facing: 1 } });
  assert.ok(errors(edge).some(text => text.includes('starts inside solid terrain')), 'a rear wheel in the ground is reported');
  const resting = normalizeTrail({ ...blank, start: { x: 300, y: groundAt(300) - RADIUS, facing: 1 } });
  assert.ok(!errors(resting).some(text => text.includes('inside solid terrain')), 'wheels on the ground are fine');
  const hovering = normalizeTrail({ ...blank, start: { x: 300, y: groundAt(300) - 120, facing: 1 } });
  assert.ok(!errors(hovering).some(text => text.includes('inside solid terrain')), 'a start in the air is fine');

  const apples = normalizeTrail({ ...blank, apples: [{ x: 300, y: groundAt(300) + 30 }, { x: 500, y: groundAt(500) }, { x: 700, y: groundAt(700) - 60 }] });
  const appleErrors = errors(apples).filter(text => text.includes('inside solid terrain'));
  assert.equal(appleErrors.length, 1);
  assert.ok(appleErrors[0].startsWith('Apple 1'), 'only the buried apple is reported; one on the surface is not');
  assert.ok(validateTrail(apples).some(message => message.target?.type === 'apple' && message.target.index === 0));

  const finish = normalizeTrail({ ...blank, finish: { x: 1200, y: groundAt(1200) + 60 } });
  assert.ok(errors(finish).some(text => text.includes('finish flower is inside solid terrain')));
  const flag = normalizeTrail({ ...blank, finish: { x: 1200, y: groundAt(1200) } });
  assert.ok(!errors(flag).some(text => text.includes('inside solid terrain')), 'a finish standing on the ground is fine');
  // A buried start is one error, not an inside error on top of a below-the-terrain one.
  const sunk = normalizeTrail({ ...blank, start: { x: 300, y: 9000, facing: 1 } });
  assert.ok(!errors(sunk).some(text => text.includes('starts inside solid terrain')));
}

// Text is capped: a name or description can't run on for ever.
{
  const blank = normalizeTrail(createBlankTrail());
  const long = normalizeTrail({ ...blank, name: 'n'.repeat(500), description: 'd'.repeat(5000) });
  assert.equal(long.name.length, NAME_MAX_LENGTH);
  assert.equal(long.description.length, DESCRIPTION_MAX_LENGTH);
  assert.deepEqual(normalizeTrail(long), long, 'capped text normalizes idempotently');
}

// Older files and share links carry a label, which nothing shows; it is dropped.
assert.equal(normalizeTrail({ ...createBlankTrail(), label: 'OLD TRAIL / 07' }).label, undefined);

// Very many objects are a warning, not an error.
{
  const blank = normalizeTrail(createBlankTrail());
  const warnings = trail => validateTrail(trail).filter(message => message.type === 'warning').map(message => message.text);
  const many = normalizeTrail({
    ...blank,
    props: Array.from({ length: PROP_WARNING_COUNT + 1 }, (_, i) => ({ x: 10 + i, y: null, type: 'rock' })),
    apples: Array.from({ length: APPLE_WARNING_COUNT + 1 }, (_, i) => ({ x: 10 + i, y: null })),
    spikes: Array.from({ length: SPIKE_WARNING_COUNT + 1 }, (_, i) => ({ x: 10 + i, y: 100, radius: 10 })),
  });
  assert.ok(warnings(many).some(text => text.includes(`${PROP_WARNING_COUNT + 1} props`)));
  assert.ok(warnings(many).some(text => text.includes(`${APPLE_WARNING_COUNT + 1} apples`)));
  assert.ok(warnings(many).some(text => text.includes(`${SPIKE_WARNING_COUNT + 1} spikes`)));
  assert.ok(!errors(many).some(text => text.includes('may be slow')));
  assert.ok(!warnings(blank).some(text => text.includes('may be slow')));
}

// The overview's notes (lesson, alsoNew, world) are kept as trimmed text,
// dropped when empty or not text, and never change the trail's hash.
{
  const base = normalizeTrail(createBlankTrail());
  const noted = normalizeTrail({ ...base, lesson: '  Braking.  ', alsoNew: '', world: 42 });
  assert.equal(noted.lesson, 'Braking.');
  assert.ok(!('alsoNew' in noted) && !('world' in noted), 'empty or non-text notes are dropped');
  assert.equal(normalizeTrail({ ...base, lesson: 'x'.repeat(500) }).lesson.length, OVERVIEW_MAX_LENGTH);
  assert.equal(trailHash(noted), trailHash(base), 'notes are not part of the ride');
}

// A buried block is reported only when it changes nothing: blocks drawn on a
// wall as decoration show, so they are not.
{
  const buried = blocks => {
    const trail = normalizeTrail({ ...createBlankTrail(), terrainBlocks: [
      rectangle(-200, 300, 1800, 700, 'grass', 'ground'),
      rectangle(400, 0, 900, 300, 'brick', 'wall'),
      ...blocks,
    ] });
    return validateTrail(trail).filter(message => /^Block \d+ is (completely )?buried/.test(message.text)).map(message => message.text);
  };
  assert.deepEqual(buried([rectangle(500, 100, 540, 108, 'stone', 'sill')]), [], 'a stone sill on a brick wall shows');
  assert.deepEqual(buried([rectangle(500, 100, 540, 108, 'brick', 'patch')]),
    ['Block 3 is buried inside terrain of the same material (brick), so it is never ridden or seen; only its outline shows in the editor. Give it another material to make it show, or delete it.'],
    'a brick block inside a brick wall changes nothing, and the warning says why');
  assert.deepEqual(buried([rectangle(500, 100, 540, 108, 'stone', 'sill'), rectangle(490, 90, 550, 120, 'wood', 'cover')]),
    ['Block 3 is completely buried inside other terrain and covered by blocks drawn over it, so it has no effect.'],
    'a block covered by a later block is hidden');
  assert.deepEqual(buried([rectangle(495, 100, 545, 108, 'stone', 'sill'), rectangle(500, 100, 540, 108, 'wood', 'cover')]), [],
    'a block only partly covered still shows around the cover');
  const under = normalizeTrail({ ...createBlankTrail(), terrainBlocks: [
    rectangle(-200, 300, 1800, 700, 'grass', 'ground'),
    rectangle(500, 100, 540, 108, 'stone', 'sill'),
    rectangle(400, 0, 900, 300, 'brick', 'wall'),
  ] });
  assert.ok(validateTrail(under).some(message => message.text.startsWith('Block 2 is completely buried')), 'a block under a later wall is hidden');
  assert.deepEqual(buried([rectangle(500, 100, 540, 108, 'brick', 'patch'), rectangle(530, 90, 560, 120, 'glass', 'pane')]), [],
    'glass shows what it covers and can break, so a block it touches is kept');
}

// Medals.
{
  assert.equal(normalizeMedals({ gold: 10 }), null);
  assert.deepEqual(normalizeMedals({ gold: '10', silver: 12, bronze: 15 }), { gold: 10, silver: 12, bronze: 15 });
  const medals = { gold: 10, silver: 12, bronze: 15 };
  assert.equal(medalFor(medals, 9.5), 'gold');
  assert.equal(medalFor(medals, 12), 'silver');
  assert.equal(medalFor(medals, 14), 'bronze');
  assert.equal(medalFor(medals, 16), null);
  assert.equal(medalFor(undefined, 1), null);
  const trail = normalizeTrail({ ...createBlankTrail(), medals: { gold: 30, silver: 20, bronze: 40 } });
  assert.ok(errors(trail).some(text => text.includes('slower')));
}

// Content hashes identify a trail by its geometry, not its name or storage.
{
  const a = normalizeTrail(createBlankTrail());
  const b = normalizeTrail({ ...a, name: 'Renamed' });
  const c = normalizeTrail({ ...a, finish: { ...a.finish, x: a.finish.x - 10 } });
  assert.equal(trailHash(a), trailHash(b));
  assert.notEqual(trailHash(a), trailHash(c));
  assert.match(trailHash(a), /^[0-9a-f]{8}$/);
  const d = normalizeTrail({ ...a, props: [{ x: 100, y: null, type: 'fence' }] });
  assert.equal(trailHash(a), trailHash(d), 'props do not change the identity');
}
// Only shipped trails (official and bonus), keyed by id and gameplay hash, go to the online board.
for (const entry of [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus')]) {
  assert.ok(isOnlineTrail(`${entry.id}@${trailHash(entry.trail)}`), entry.id);
}
// Back walls: blocks on the back layer keep their layer, are left out of the
// ridden terrain, and are scenery only, so they never change the gameplay hash.
{
  const blank = normalizeTrail(createBlankTrail());
  const wall = { id: 'back-1', material: 'concrete', layer: 'back', outer: { nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }, inner: [] };
  const walled = normalizeTrail({ ...blank, terrainBlocks: [wall, ...blank.terrainBlocks] });
  assert.equal(walled.terrainBlocks[0].layer, 'back');
  assert.ok(!('layer' in walled.terrainBlocks[1]), 'terrain blocks store no layer');
  assert.deepEqual(normalizeTrail(walled), walled, 'back walls normalize idempotently');
  assert.deepEqual(trailTerrainBlocks(walled), blank.terrainBlocks, 'back walls are not ridden');
  assert.equal(trailBackWalls(walled).length, 1);
  assert.equal(trailHash(walled), trailHash(blank), 'back walls do not change the trail hash');
  assert.equal(terrainAt(walled, 50, 20).y, terrainAt(blank, 50, 20).y, 'back walls do not collide');
  assert.deepEqual(errors(walled), []);
  assert.ok(errors(normalizeTrail({ ...blank, terrainBlocks: [wall] })).some(text => text.includes('needs terrain')), 'back walls alone are not terrain');
}
{
  const blank = normalizeTrail(createBlankTrail());
  assert.ok(!('author' in blank), 'a blank trail has no author');
  const credited = normalizeTrail({ ...blank, author: '  Ada \n  Lovelace  ' });
  assert.equal(credited.author, 'Ada Lovelace', 'the author is one trimmed line');
  assert.deepEqual(normalizeTrail(credited), credited, 'the author normalizes idempotently');
  assert.equal(normalizeTrail({ ...blank, author: 'x'.repeat(99) }).author.length, AUTHOR_MAX_LENGTH);
  assert.ok(!('author' in normalizeTrail({ ...blank, author: '   ' })), 'an empty author is dropped');
  assert.ok(!('author' in normalizeTrail({ ...blank, author: 42 })), 'a non-string author is dropped');
  assert.equal(trailHash(credited), trailHash(blank), 'credit does not change the trail hash');
  assert.equal(normalizeTrail({ ...blank, description: 7 }).description, '');
}
assert.ok(!isOnlineTrail('official:the-orchard'), 'an official id without its hash stays offline');
assert.ok(!isOnlineTrail('trail:0123abcd'), 'custom trails stay offline');
assert.ok(isOnlineTrail('bonus:the-bonny-tyler@0123abcd'), 'bonus trails go online');
assert.ok(!isOnlineTrail('custom:caves@0123abcd'), 'custom file trails stay offline');

// Unlock rules live in js/unlocks.js now, so one left in an older trail file is dropped.
{
  const blank = normalizeTrail(createBlankTrail());
  assert.ok(!('unlock' in blank), 'a blank trail has no unlock rule');
  const old = normalizeTrail({ ...blank, unlock: { trails: 3, golds: 1 } });
  assert.ok(!('unlock' in old), 'an old unlock rule is dropped');
  assert.deepEqual(errors({ ...blank, unlock: { laps: 2 } }), [], 'and is not an error');
  assert.equal(trailHash(old), trailHash(blank));
}

// The fall line follows the terrain: a little below its lowest point, however
// deep the trail is built.
{
  const deep = normalizeTrail({
    ...createBlankTrail(), finish: { x: 2800, y: null }, start: { x: 100, y: 3400, facing: 1 },
    terrainBlocks: [rectangle(0, 3440, 3000, 5000)],
  });
  assert.equal(fallLine(deep), 5000 + FALL_MARGIN);
  assert.deepEqual(errors(deep), [], 'a deep trail validates');
  const below = normalizeTrail({ ...deep, start: { x: 100, y: 5400, facing: 1 } });
  assert.ok(errors(below).some(text => text.includes('below all the terrain')), 'a start under the terrain is reported');
}

// Prop rotation: degrees clockwise, wrapped to (-180, 180], a tenth of a degree, omitted when 0.
{
  assert.equal(normalizeRotation(20), 20);
  assert.equal(normalizeRotation(-45.04), -45);
  assert.equal(normalizeRotation(12.345), 12.3);
  assert.equal(normalizeRotation(270), -90);
  assert.equal(normalizeRotation(-180), 180);
  assert.equal(normalizeRotation(540), 180);
  assert.equal(normalizeRotation(360), undefined);
  assert.equal(normalizeRotation(0), undefined);
  assert.equal(normalizeRotation('15'), 15);
  assert.equal(normalizeRotation('tilted'), undefined);
  assert.equal(normalizeRotation(null), undefined);
  const trail = normalizeTrail({ ...createBlankTrail(), props: [
    { x: 100, y: null, type: 'crates', rotation: 30 },
    { x: 200, y: null, type: 'rock', rotation: 0 },
  ] });
  assert.equal(trail.props[0].rotation, 30);
  assert.ok(!('rotation' in JSON.parse(JSON.stringify(trail.props[1]))), 'no rotation is not stored');
  assert.equal(trailHash(trail), trailHash({ ...trail, props: [] }), 'rotating props never changes the hash');
}

// A point on the straight line between its neighbours changes nothing but the
// size, so it is warned about; a bend or a point with handles is not.
{
  const straight = text => /on the straight line between/.test(text);
  const warnings = trail => validateTrail(normalizeTrail(trail)).filter(message => message.type === 'warning').map(message => message.text);
  const ground = rectangle(-200, 320, 1600, 700, 'grass', 'ground');
  const top = ground.outer.nodes.findIndex(node => node.y === 320);
  const insert = node => {
    const nodes = ground.outer.nodes.slice();
    nodes.splice(top + 1, 0, node);
    return { ...createBlankTrail(), terrainBlocks: [{ ...ground, outer: { ...ground.outer, nodes } }] };
  };
  const [a, b] = [ground.outer.nodes[top], ground.outer.nodes[(top + 1) % ground.outer.nodes.length]];
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  assert.ok(warnings(insert(middle)).some(text => text.startsWith('A point lies on the straight line')), 'a point on a straight run is warned about');
  assert.ok(!warnings(insert({ ...middle, y: middle.y - 20 })).some(straight), 'a bend is not');
  assert.ok(!warnings(insert({ ...middle, mode: 'smooth', in: [middle.x - 50, middle.y], out: [middle.x + 50, middle.y] })).some(straight), 'nor a point with handles');
}

console.log('Trail schema tests passed.');
