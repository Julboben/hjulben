// The words undo and redo use for a step: what changed between two snapshots.
import { describeStep } from '../js/editor/describe-step.js';
import { createBlankTrail, normalizeTrail } from '../js/trail-schema.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
  if (!ok) failures++;
};

const noFlags = () => ({ lock: { groups: [], items: [] }, hide: { groups: [], items: [] } });
const state = (trail, flags = noFlags()) => ({ trail: JSON.stringify(normalizeTrail(trail)), flags });
const base = () => {
  const trail = normalizeTrail(createBlankTrail());
  trail.props = [{ x: 100, y: null, type: 'pine-tree' }, { x: 200, y: null, type: 'rock' }];
  trail.terrainBlocks.push({ ...structuredClone(trail.terrainBlocks[0]), id: 'block-2', layer: 'back' });
  return normalizeTrail(trail);
};
/** The words for an edit made to a copy of the base trail. */
const words = (edit, flags) => {
  const before = base();
  const after = structuredClone(before);
  edit(after);
  return describeStep(state(before), state(after, flags));
};
const says = (name, edit, expected, flags) => {
  const got = words(edit, flags);
  check(name, got === expected, `("${got}")`);
};
const shift = (block, dx, dy) => {
  for (const ring of [block.outer, ...block.inner])
    for (const node of ring.nodes) { node.x += dx; node.y += dy; }
};

says('nothing changed is null', () => {}, null);
says('a moved prop is named by its type', (t) => { t.props[0].x += 40; }, 'moved the pine tree');
says('several moved props are counted', (t) => { t.props[0].x += 40; t.props[1].y = 300; }, 'moved 2 props');
says('a new prop is "a", a new apple "an"', (t) => {
  t.props.push({ x: 50, y: null, type: 'rock' });
  t.apples.push({ x: 60, y: null });
}, 'added an apple and a rock');
says('a deleted prop is found wherever it was in the list', (t) => { t.props.shift(); }, 'deleted the pine tree');
says('a block slid along is moved', (t) => { shift(t.terrainBlocks[0], 30, -10); }, 'moved the block');
says('a block with one point dragged is reshaped', (t) => { t.terrainBlocks[0].outer.nodes[0].x += 30; }, 'reshaped the block');
says('a back wall is called one', (t) => { shift(t.terrainBlocks[1], 5, 0); }, 'moved the back wall');
says('a new material is named as such', (t) => { t.terrainBlocks[0].material = 'rock'; }, 'changed the material of the block');
says('blocks in another order', (t) => { t.terrainBlocks.reverse(); }, 'changed the order of the blocks');
says('props in another order', (t) => { t.props.reverse(); }, 'changed the order of the props');
says('a turned prop', (t) => { t.props[1].rotation = 30; t.props[1].x += 4; }, 'turned the rock');
says('grouping several kinds at once', (t) => {
  t.props[0].group = 'hut';
  t.terrainBlocks[0].group = 'hut';
}, 'grouped the block and the pine tree');
says('the start turned round', (t) => { t.start.facing = -1; }, 'turned the start around');
says('the finish and the weather', (t) => { t.finish.x += 10; t.weather.rain = 0.5; }, 'moved the finish, changed the weather');
says('the nisse', (t) => { t.nisse = { x: 300, y: null }; }, 'added a nisse');
says('a rename', (t) => { t.name = 'Elsewhere'; }, 'renamed the trail');
says('more than three kinds of change are cut short', (t) => {
  t.name = 'Elsewhere';
  t.finish.x += 10;
  t.props[0].x += 1;
  t.apples.pop();
}, 'moved the finish, deleted the apple, moved the pine tree and more');
says('locking a group and a prop', () => {}, 'locked the back props and the rock', {
  lock: { groups: ['backProps'], items: ['prop:{"layer":"back","type":"rock","x":200,"y":null}#0'] },
  hide: { groups: [], items: [] },
});
{
  const flags = noFlags();
  flags.hide.items = ['block:block-1', 'block:block-2'];
  const got = describeStep(state(base(), flags), state(base()));
  check('showing hidden blocks again', got === 'showed 2 blocks', `("${got}")`);
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
