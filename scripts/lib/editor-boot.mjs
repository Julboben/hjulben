// Boots the real editor against a stub DOM, drives a set of gestures, and
// writes a JSON report to stdout.
//
// It runs as its own process because trails.js caches the trail catalog at
// import time: two boots in one process would silently share a trail, so the
// parent starts one child per trail shape.
import { buildDom, createContextStub, installGlobals, runFrames } from './editor-harness.mjs';
import { loadTrailShape } from './editor-fixture.mjs';

const kind = process.env.TSC_ENV_TRAIL || 'blocks';
const { html, trail } = loadTrailShape(kind);

// buildDom installs the globals and parses the markup, so elements it created
// keep their markup state, such as the playtest dialog starting hidden.
const dom = buildDom(html);
for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
  if (!dom.has(match[1])) dom.element(match[1]);
}
const canvas = dom.element('editor-canvas');
const context = createContextStub();
canvas.getContext = () => context;
dom.element('canvas-wrap');
dom.element('trail-picker');

// Static hosting's answers: no dev-server header, so no custom catalog is asked for.
globalThis.fetch = async url => (String(url).includes('catalog.json')
  ? { ok: true, headers: new Headers(), json: async () => ({ schemaVersion: 1, trails: [{ id: 't1', file: 'custom/t1.json', name: 'Test' }] }) }
  : { ok: true, headers: new Headers(), json: async () => trail });

// Window listeners are recorded so keyboard shortcuts can be driven.
const windowListeners = new Map();
globalThis.addEventListener = (type, handler) => {
  if (!windowListeners.has(type)) windowListeners.set(type, []);
  windowListeners.get(type).push(handler);
};

await import('../../js/editor/main.js');

// Drags snap to things nearby and the grid, which would move most of the
// gestures below off the exact positions they check. Snapping has its own
// checks, which turn it back on.
const { setSnapping } = await import('../../js/editor/magnet.js');
setSnapping(false);

// The fixture is a trail file, which only the dev server can write, so every
// shape but `readonly` is opened as if the dev server were running. Without
// it the trail is read-only and none of the editing gestures would apply.
if (kind !== 'readonly') {
  const { editor } = await import('../../js/editor/state.js');
  const { updateTrailControls } = await import('../../js/editor/trails.js');
  editor.devServer = true;
  updateTrailControls();
}

const fire = (type, extra = {}) => canvas.dispatch(type, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...extra });
// The editor opens centred on the start, so a screen position is only a world
// position once the camera is subtracted. The interact checks measure it first.
let cameraX = 0,
  cameraY = 0;
const world = (x, y) => ({ clientX: x - cameraX, clientY: y - cameraY });
const key = (keyName, extra = {}) => {
  document.activeElement = canvas;
  for (const handler of windowListeners.get('keydown') || []) handler({ key: keyName, code: '', preventDefault() {}, ...extra });
  runFrames();
};
// Mid-drag the JSON waits for the drag to end, so it is flushed first.
const { flushInspector } = await import('../../js/editor/inspector.js');
// The trail as the editor holds it. The JSON box is only filled while its
// dialog is open, so it is not read here.
const { editor: editorState } = await import('../../js/editor/state.js');
const current = () => {
  flushInspector();
  return JSON.parse(JSON.stringify(editorState.trail));
};
const toolButton = name => [...document.querySelectorAll('[data-tool]')].find(button => button.dataset.tool === name);
const drag = (from, to, extra = {}) => {
  fire('pointerdown', { ...world(...from), ...extra });
  fire('pointermove', { ...world(...to), ...extra });
  fire('pointerup');
};

// Precise interactions on a plain slab, reported on their own because the
// generic gestures below scramble the trail.
if (kind === 'interact') {
  // Find the camera: an apple placed at screen 0,0 lands at the camera's world
  // position (zoom is 1). The placement is undone, so it leaves no trace.
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();
  toolButton('select').click();

  const out = {};
  const undo = document.getElementById('undo');
  fire('pointerdown', world(400, 450));
  fire('pointerup');
  out.clickLeavesNoUndo = undo.disabled === true;

  // The version chip says "edited" once a drag is let go, not while it is
  // held, even through a pause longer than the autosave delay. `current()`
  // would flush it, so it isn't used.
  const versionLabel = () => document.getElementById('version-label').textContent;
  out.labelBeforeDrag = versionLabel();
  fire('pointerdown', world(400, 450));
  fire('pointermove', world(420, 450));
  await new Promise(resolve => setTimeout(resolve, 1300));
  out.labelMidDrag = versionLabel();
  fire('pointerup');
  out.labelAfterDrag = versionLabel();
  undo.click();
  out.labelAfterUndo = versionLabel();

  // A cut straight through the slab splits it into two blocks.
  toolButton('cut').click();
  fire('pointerdown', world(380, 250));
  for (const [x, y] of [[420, 250], [420, 650], [380, 650]]) fire('pointermove', world(x, y));
  fire('pointerup');
  out.splitBlocks = current().terrainBlocks.map(block => Object.keys(block).sort().join(','));

  // The tools stay active after a shape, so go back to Select before moving
  // corners, or the next drag draws another cut instead.
  toolButton('select').click();
  // Each piece is its own block, so clicking one selects only that one.
  drag([600, 450], [600, 450]);
  out.splitSelectsOne = document.getElementById('selection-title').textContent;

  // Dragging the right-hand piece's top-right corner must move that corner
  // and leave the left piece alone.
  const outline = block => block.outer.nodes.map(node => [Math.round(node.x), Math.round(node.y)]);
  const pieces = () => {
    const list = current().terrainBlocks.slice(0, 2);
    const left = list.find(block => block.outer.nodes.some(node => node.x < 100));
    return { left: outline(left), right: outline(list.find(block => block !== left)) };
  };
  const before = pieces();
  drag([800, 300], [830, 270]);
  const after = pieces();
  out.leftUntouched = JSON.stringify(before.left) === JSON.stringify(after.left);
  out.rightMoved = after.right.some(([x, y]) => x === 830 && y === 270);

  // Escape abandons a cut that is still being drawn.
  toolButton('cut').click();
  const blocksBefore = JSON.stringify(current().terrainBlocks);
  fire('pointerdown', world(100, 350));
  for (const [x, y] of [[200, 350], [200, 450], [100, 450]]) fire('pointermove', world(x, y));
  key('Escape');
  fire('pointerup');
  out.escapeCancels = JSON.stringify(current().terrainBlocks) === blocksBefore;

  // Shift-click builds a multi-selection, and dragging it moves both blocks.
  // Alt makes a rectangle, since a plain two-point drag is a freehand line.
  toolButton('block').click();
  drag([1000, 300], [1200, 500], { altKey: true });
  toolButton('select').click();
  const count = current().terrainBlocks.length;
  drag([200, 450], [200, 450]);
  fire('pointerdown', { ...world(1100, 400), shiftKey: true });
  fire('pointerup');
  out.multiTitle = document.getElementById('selection-title').textContent;
  const leftBefore = current().terrainBlocks[0].outer.nodes[0].x;
  const newBefore = current().terrainBlocks[count - 1].outer.nodes[0].x;
  drag([1100, 400], [1150, 400]);
  out.multiMoved = current().terrainBlocks[0].outer.nodes[0].x === leftBefore + 50
    && current().terrainBlocks[count - 1].outer.nodes[0].x === newBefore + 50;
  key('Delete');
  out.multiDeleted = current().terrainBlocks.length === count - 2;

  // Shift-dragging a point locks it to 15 degree steps from a neighbour, and to the grid.
  toolButton('block').click();
  drag([100, 100], [300, 300], { altKey: true });
  toolButton('select').click();
  const ring = () => current().terrainBlocks.at(-1).outer.nodes;
  const corner = () => ring().reduce((best, node) => Math.hypot(node.x - 300, node.y - 300) < Math.hypot(best.x - 300, best.y - 300) ? node : best);
  const cornerId = corner().id;
  const cornerIndex = ring().findIndex(node => node.id === cornerId);
  const grab = ring()[cornerIndex];
  const from = { x: grab.x, y: grab.y };
  fire('pointerdown', world(from.x, from.y));
  fire('pointermove', { ...world(from.x + 73, from.y + 12), shiftKey: true });
  const snapped = ring()[cornerIndex];
  const neighbours = [ring()[(cornerIndex + 3) % 4], ring()[(cornerIndex + 1) % 4]];
  const stepFrom = neighbour => {
    const angle = Math.atan2(snapped.y - neighbour.y, snapped.x - neighbour.x) * 180 / Math.PI / 15;
    return Math.abs(angle - Math.round(angle)) < 1e-6;
  };
  out.snapAngle = neighbours.some(stepFrom);
  out.snapGrid = snapped.x % 50 === 0 || snapped.y % 50 === 0;
  out.snapMoved = snapped.x !== from.x || snapped.y !== from.y;
  // Releasing Shift mid-drag gives the pointer its exact position back.
  for (const handler of windowListeners.get('keyup') || []) handler({ type: 'keyup', key: 'Shift', shiftKey: false, preventDefault() {} });
  out.releaseExact = ring()[cornerIndex].x === from.x + 73 && ring()[cornerIndex].y === from.y + 12;
  // Pressing it again snaps again.
  for (const handler of windowListeners.get('keydown') || []) handler({ type: 'keydown', key: 'Shift', shiftKey: true, preventDefault() {} });
  out.repressSnaps = ring()[cornerIndex].x === snapped.x && ring()[cornerIndex].y === snapped.y;
  fire('pointerup');
  // With snapping off and no Shift, the point goes exactly where the pointer does.
  const plainFrom = { ...ring()[cornerIndex] };
  fire('pointerdown', world(plainFrom.x, plainFrom.y));
  fire('pointermove', world(plainFrom.x + 7, plainFrom.y + 3));
  fire('pointerup');
  out.plainExact = ring()[cornerIndex].x === plainFrom.x + 7 && ring()[cornerIndex].y === plainFrom.y + 3;
  // Pressing Alt mid-drag swaps the block for a copy, and letting go of it
  // takes the copy away and drags the original again.
  const altCount = current().terrainBlocks.length;
  const altBlock = () => current().terrainBlocks[altCount - 1].outer.nodes[0];
  const altFrom = { ...altBlock() };
  const altKey = (type, down) => {
    for (const handler of windowListeners.get(type) || [])
      handler({ type, key: 'Alt', altKey: down, shiftKey: false, preventDefault() {} });
  };
  fire('pointerdown', world(200, 200));
  fire('pointermove', world(240, 210));
  altKey('keydown', true);
  out.altPressCopies = current().terrainBlocks.length === altCount + 1
    && altBlock().x === altFrom.x && current().terrainBlocks.at(-1).outer.nodes[0].x === altFrom.x + 40;
  altKey('keyup', false);
  out.altReleaseRestores = current().terrainBlocks.length === altCount
    && altBlock().x === altFrom.x + 40 && altBlock().y === altFrom.y + 10;
  fire('pointerup');

  // Outlines are only reshaped on purpose. A fresh square, away from the rest.
  toolButton('block').click();
  drag([2000, 100], [2200, 300], { altKey: true });
  toolButton('select').click();
  const square = () => current().terrainBlocks.at(-1).outer.nodes.map(node => [node.x, node.y]);
  const top = () => Math.min(...square().map(([, y]) => y));
  const left = () => Math.min(...square().map(([x]) => x));
  const deselect = () => { fire('pointerdown', world(2600, 900)); fire('pointerup'); };
  const shifted = (before, dy, moved) => square().every(([x, y], index) =>
    x === before[index][0] && y === before[index][1] + (moved(before[index]) ? dy : 0));
  // A press just outside an edge of a block that isn't selected takes the whole block.
  deselect();
  let held = square();
  drag([2100, top() - 4], [2100, top() - 24]);
  out.closedEdgeMovesBlock = shifted(held, -20, () => true);
  // Once it is selected, the same press takes the edge.
  held = square();
  const edgeY = top();
  drag([2100, edgeY - 4], [2100, edgeY - 24]);
  out.openEdgeMovesEdge = shifted(held, -20, ([, y]) => y === edgeY);
  // On a block that isn't selected, a point is only grabbed on its dot.
  deselect();
  held = square();
  drag([left() + 8, top() + 6], [left() + 8, top() + 26]);
  out.pointNeedsDot = shifted(held, 20, () => true);
  // Escape mid-drag puts it all back and leaves no undo step.
  const undoSteps = editorState.history.length;
  held = square();
  fire('pointerdown', world(left() + 100, top() + 100));
  fire('pointermove', world(left() + 160, top() + 140));
  key('Escape');
  fire('pointermove', world(left() + 200, top() + 200));
  fire('pointerup');
  out.escapeCancelsDrag = JSON.stringify(square()) === JSON.stringify(held)
    && editorState.history.length === undoSteps;
  // The point or edge a press would grab is highlighted, and nothing else.
  deselect();
  fire('pointermove', world(left(), top()));
  runFrames();
  out.hoverPoint = editorState.hoverOutline?.kind;
  fire('pointermove', world(left() + 100, top() - 4));
  runFrames();
  out.hoverClosedEdge = editorState.hoverOutline?.kind ?? null;
  fire('pointerdown', world(left() + 100, top() + 100));
  fire('pointerup');
  fire('pointermove', world(left() + 100, top() - 4));
  runFrames();
  out.hoverOpenEdge = editorState.hoverOutline?.kind;
  out.errors = [];
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Without the dev server a file trail can't be saved, so it can't be renamed
// or keep drafts either.
if (kind === 'readonly') {
  const { currentEntry } = await import('../../js/editor/trails.js');
  const { listDrafts } = await import('../../js/editor/drafts.js');
  const hidden = id => document.getElementById(id).hidden === true;
  const out = {
    errors: [],
    renameHidden: hidden('rename-trail'),
    draftHidden: hidden('save-draft') && hidden('versions-save-draft'),
    deleteHidden: hidden('delete-trail'),
    fieldsLocked: ['selection-fieldset', 'trail-fields'].every(id => document.getElementById(id).disabled === true),
    toolsLocked: toolButton('block').disabled === true && toolButton('select').disabled === false,
  };
  // Every way of changing the trail is tried, and none of them does.
  const before = current();
  toolButton('apple').click();
  fire('pointerdown', { clientX: 300, clientY: 300 });
  fire('pointerup');
  out.toolRefused = toolButton('select').classList.contains('active');
  key('a', { code: 'KeyA', metaKey: true });
  out.selectsAll = Boolean(document.getElementById('selection-fields').hidden === false);
  for (let x = 0; x <= 1200; x += 150)
    for (let y = 0; y <= 800; y += 200) drag([x, y], [x + 60, y + 40]);
  key('a', { code: 'KeyA', metaKey: true });
  for (const name of ['ArrowRight', 'ArrowUp', '[', ']']) key(name, { code: name });
  key('x', { code: 'KeyX' });
  key('r', { code: 'KeyR' });
  key('Delete', { code: 'Delete' });
  for (const code of ['KeyB', 'KeyA', 'KeyP', 'KeyW']) key('', { code });
  canvas.dispatch('dblclick', { clientX: 400, clientY: 400 });
  key('s', { code: 'KeyS', metaKey: true });
  out.unchanged = JSON.stringify(current()) === JSON.stringify(before);
  out.drafts = listDrafts(currentEntry().id).length;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// A validation message about one item takes the author to it.
if (kind === 'warned') {
  const { editor } = await import('../../js/editor/state.js');
  flushInspector();
  const out = { errors: [] };
  editor.cameraX = -5000;
  const button = document.getElementById('validation-list').children
    .flatMap(item => item.children)
    .find(child => child.tagName?.toLowerCase() === 'button');
  out.clickable = Boolean(button);
  button?.click();
  out.selection = editor.selection;
  out.centredX = editor.cameraX + 1200 / 2 / editor.zoom;
  const issues = document.getElementById('selection-issues');
  out.issuesShown = issues.hidden === false;
  out.issues = issues.children.map(item => item.textContent);
  // Nothing selected, nothing listed.
  editor.selection = null;
  flushInspector();
  const { syncInspector } = await import('../../js/editor/inspector.js');
  syncInspector();
  out.issuesHiddenAfter = issues.hidden === true;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// The Water tool: drawing, clicking, moving, resizing and deleting a body.
if (kind === 'water') {
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();

  const out = { errors: [] };
  const water = () => current().water || [];
  // A drag draws the dragged rectangle; the top is the surface.
  toolButton('water').click();
  drag([1000, 200], [1200, 260]);
  out.drawn = water()[0];
  out.drawnSelected = /WATER/i.test(document.getElementById('selection-title').textContent);
  out.depthRowShown = document.getElementById('selection-water-depth-row').hidden === false;
  // A click adds nothing: water is always drawn.
  drag([400, 250], [400, 250]);
  out.afterClick = water().length;
  drag([280, 250], [520, 282]);
  // Its handle is the middle of the surface, so Select drags it from there.
  toolButton('select').click();
  drag([1100, 200], [1150, 180]);
  out.moved = water()[0];
  // Clicking open water selects the body.
  drag([400, 260], [400, 260]);
  out.clickSelects = /WATER/i.test(document.getElementById('selection-title').textContent);
  // Deepening it in the inspector keeps the surface and says it is deep now.
  const depth = document.getElementById('selection-water-depth');
  depth.value = '120';
  depth.dispatch('change');
  out.deepened = water()[1];
  out.deepHint = document.getElementById('selection-water-hint').textContent;
  key('Delete');
  out.afterDelete = water().length;
  document.getElementById('undo').click();
  out.afterUndo = water().length;
  // A tool picked with its button keeps focus there, and the shortcuts still answer.
  toolButton('select').click();
  document.activeElement = toolButton('select');
  for (const handler of windowListeners.get('keydown') || []) handler({ key: 'c', code: 'KeyC', preventDefault() {} });
  out.toolAfterButton = editorState.tool;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Turning blocks, props and mixed selections with the rotate handle, R and
// the inspector.
if (kind === 'rotate') {
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();
  toolButton('select').click();

  const { rotateHandle } = await import('../../js/editor/rotate.js');
  const out = { errors: [] };
  const undo = document.getElementById('undo');
  const bounds = block => {
    const xs = block.outer.nodes.map(node => node.x), ys = block.outer.nodes.map(node => node.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  // Grab the knob and swing it a quarter turn clockwise about the pivot.
  const turnHandle = (pivot, degrees, extra = {}) => {
    const knob = rotateHandle();
    const radius = Math.hypot(knob.x - pivot[0], knob.y - pivot[1]);
    const from = Math.atan2(knob.y - pivot[1], knob.x - pivot[0]) + degrees * Math.PI / 180;
    fire('pointerdown', world(knob.x, knob.y));
    fire('pointermove', { ...world(pivot[0] + Math.cos(from) * radius, pivot[1] + Math.sin(from) * radius), ...extra });
    fire('pointerup');
  };

  // The 800 by 300 slab turns about its centre into a 300 by 800 one.
  drag([200, 450], [200, 450]);
  out.blockRowShown = document.getElementById('selection-rotate-row').hidden === false;
  out.blockHandle = Boolean(rotateHandle());
  const slab = bounds(current().terrainBlocks[0]);
  turnHandle([400, 450], 90);
  out.blockTurned = bounds(current().terrainBlocks[0]);
  undo.click();
  out.oneUndo = JSON.stringify(bounds(current().terrainBlocks[0])) === JSON.stringify(slab);
  // The inspector's quarter-turn button does the same.
  document.getElementById('rotate-cw').click();
  out.buttonTurned = bounds(current().terrainBlocks[0]);
  undo.click();

  // A lone prop has its own Rotation field and turns about its anchor.
  drag([600, 290], [600, 290]);
  out.propTitle = document.getElementById('selection-title').textContent;
  out.propFieldShown = document.getElementById('selection-rotation-row').hidden === false;
  out.propButtonsHidden = document.getElementById('selection-rotate-row').hidden === true;
  turnHandle([600, 300], 20, { shiftKey: true });
  out.snapped = current().props[0].rotation;
  undo.click();
  turnHandle([600, 300], 20);
  out.free = current().props[0].rotation;
  undo.click();
  out.undone = current().props[0].rotation;
  key('r', { code: 'KeyR' });
  out.keyR = current().props[0].rotation;
  key('R', { code: 'KeyR', shiftKey: true });
  key('R', { code: 'KeyR', shiftKey: true });
  out.keyShiftR = current().props[0].rotation;
  const field = document.getElementById('selection-rotation');
  field.value = '200';
  field.dispatch('change');
  out.fieldWrapped = current().props[0].rotation;
  field.value = '0';
  field.dispatch('change');
  out.fieldCleared = 'rotation' in current().props[0];

  // Turning everything orbits the start and water without turning them.
  const before = current();
  key('a', { metaKey: true, code: 'KeyA' });
  document.getElementById('rotate-cw').click();
  const after = current();
  out.startFacing = after.start.facing === before.start.facing;
  out.startMoved = after.start.x !== before.start.x;
  out.waterShape = after.water[0].width === 200 && after.water[0].depth === 60;
  out.waterMoved = after.water[0].x !== before.water[0].x;
  out.propTurned = after.props[0].rotation;
  undo.click();

  // Water alone has no handle.
  key('Escape');
  drag([1100, 230], [1100, 230]);
  out.waterTitle = document.getElementById('selection-title').textContent;
  out.waterHandle = rotateHandle();
  out.waterRowHidden = document.getElementById('selection-rotate-row').hidden === true;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Editing a group's props and spikes together from the inspector and keys.
if (kind === 'group') {
  const { editor } = await import('../../js/editor/state.js');
  const { syncInspector } = await import('../../js/editor/inspector.js');
  const field = id => document.getElementById(id);
  const out = {};
  const undo = field('undo');
  const select = () => {
    editor.selection = {
      kind: 'items',
      items: [0, 1, 2].map(index => ({ type: 'prop', index }))
        .concat([0, 1].map(index => ({ type: 'spike', index }))),
    };
    syncInspector();
  };
  const set = (id, value) => {
    field(id).value = value;
    field(id).dispatch('change');
  };
  select();
  out.rowsShown = ['prop-type', 'layer', 'flip', 'radius', 'spin']
    .every(name => field(`selection-${name}-row`).hidden === false);
  out.mixed = ['prop-type', 'layer', 'radius', 'spin'].map(name => field(`selection-${name}`).value);
  // The sign can't flip, so only the tree and the rock count: one of each.
  out.flipMixed = field('selection-flip').value;

  set('selection-layer', 'front');
  out.layers = current().props.map(prop => prop.layer);
  out.layerShared = field('selection-layer').value;
  undo.click();
  out.layersUndone = current().props.map(prop => prop.layer);

  set('selection-flip', 'true');
  out.flips = current().props.map(prop => Boolean(prop.flip));
  undo.click();

  set('selection-prop-type', 'pine');
  out.types = current().props.map(prop => prop.type);
  undo.click();
  select();

  set('selection-radius', '40');
  out.radii = current().spikes.map(spike => spike.radius);
  undo.click();
  select();
  // Clearing a Mixed field changes nothing.
  set('selection-radius', '');
  out.radiiCleared = current().spikes.map(spike => spike.radius);
  set('selection-spin', '-0.5');
  out.spins = current().spikes.map(spike => spike.spin);
  undo.click();
  select();

  // X flips the group, and again unflips it, once all of them are flipped.
  key('x', { code: 'KeyX' });
  out.keyFlip = current().props.map(prop => Boolean(prop.flip));
  key('x', { code: 'KeyX' });
  out.keyUnflip = current().props.map(prop => Boolean(prop.flip));
  key(']');
  out.cycled = new Set(current().props.map(prop => prop.type)).size;
  undo.click();
  undo.click();
  undo.click();

  // Selecting from the Objects tab: Cmd/Ctrl-click toggles, Shift-click adds a range.
  const { setTab } = await import('../../js/editor/tools.js');
  setTab('objects');
  const groupRow = name => document.getElementById('object-groups').children[['terrain', 'back', 'backProps', 'frontProps', 'water', 'spikes', 'apples'].indexOf(name)];
  const rowName = (group, index) => groupRow(group).children[1].children[index].children[0];
  const picked = () => editor.selection?.kind === 'items'
    ? editor.selection.items.map(item => `${item.type}${item.index}`)
    : editor.selection ? [`${editor.selection.kind}${editor.selection.index}`] : [];
  groupRow('spikes').children[0].children[0].click();
  rowName('spikes', 0).click();
  out.listPlain = picked();
  // A lone spike has no size.
  out.loneSizeHidden = field('selection-size-row').hidden === true;
  rowName('spikes', 1).dispatch('click', { metaKey: true });
  out.listAdded = picked();
  out.spikeSize = field('selection-size').textContent;
  rowName('spikes', 0).dispatch('click', { ctrlKey: true });
  out.listRemoved = picked();
  groupRow('backProps').children[0].children[0].click();
  rowName('backProps', 0).click();
  rowName('backProps', 1).dispatch('click', { shiftKey: true });
  out.listRange = picked();

  // A block measures by its outline.
  editor.selection = { kind: 'block', blockIndex: 0 };
  syncInspector();
  out.blockSize = [field('selection-width').value, field('selection-height').value].join(' × ');
  out.blockSizeEditable = field('selection-width-row').hidden === false && field('selection-size-row').hidden === true;
  out.blockTitle = field('selection-title').textContent;
  out.blockDelete = field('delete-selection').textContent;

  // Typing a width stretches the block from its left edge, as one undo step.
  const { selectionBox } = await import('../../js/editor/selection.js');
  const before = selectionBox();
  set('selection-width', '400');
  const after = selectionBox();
  out.resized = [after.left - before.left, after.right - after.left, after.bottom - after.top].map(Math.round);
  undo.click();
  editor.selection = { kind: 'block', blockIndex: 0 };
  syncInspector();
  out.resizeUndone = Math.round(selectionBox().right - selectionBox().left);
  // A size too small to ride or grab is held at the smallest the handles allow.
  set('selection-height', '0');
  out.heightFloor = Math.round(selectionBox().bottom - selectionBox().top);
  undo.click();

  // A point shows its kind and an edge its shape, never the other's.
  editor.selection = { kind: 'blockPoint', blockIndex: 0, boundaryIndex: 0, index: 1 };
  syncInspector();
  out.pointTitle = field('selection-title').textContent;
  out.pointRows = [field('selection-node-row').hidden, field('selection-edge-row').hidden, field('split-edge').hidden];
  out.pointDelete = field('delete-selection').textContent;
  editor.selection = { kind: 'blockEdge', blockIndex: 0, boundaryIndex: 0, index: 3 };
  syncInspector();
  out.edgeTitle = field('selection-title').textContent;
  out.edgeRows = [field('selection-node-row').hidden, field('selection-edge-row').hidden, field('split-edge').hidden];
  out.edgeDeleteHidden = field('delete-selection').hidden;
  // Split Edge puts a point halfway along it and selects that point.
  const points = () => current().terrainBlocks[0].outer.nodes.length;
  const pointsBefore = points();
  field('split-edge').click();
  out.split = [points() - pointsBefore, editor.selection?.kind, editor.selection?.index];
  undo.click();
  out.splitUndone = points() === pointsBefore;

  // Whole blocks are placed by the top-left of their box.
  editor.selection = { kind: 'block', blockIndex: 0 };
  syncInspector();
  const box = selectionBox();
  out.cornerShown = [Number(field('selection-x').value) === Math.round(box.left), Number(field('selection-y').value) === Math.round(box.top)];
  set('selection-x', String(Math.round(box.left) + 100));
  out.cornerMoved = Math.round(selectionBox().left - box.left);
  undo.click();

  // Flipping a block with a prop carries the prop across and turns it round.
  const prop = () => current().props[0];
  const propBefore = { ...prop() };
  editor.selection = { kind: 'items', items: [{ type: 'block', index: 0 }, { type: 'prop', index: 0 }] };
  syncInspector();
  const middle = (selectionBox().left + selectionBox().right) / 2;
  out.mirrorShown = field('selection-mirror-row').hidden === false;
  field('mirror-horizontal').click();
  out.mirrored = [Math.round(prop().x - (2 * middle - propBefore.x)), Boolean(prop().flip) !== Boolean(propBefore.flip)];
  undo.click();
  // X does the same; Shift+X on props alone does nothing.
  editor.selection = { kind: 'items', items: [{ type: 'block', index: 0 }, { type: 'prop', index: 0 }] };
  key('x', { code: 'KeyX' });
  out.keyMirrored = Math.round(prop().x - (2 * middle - propBefore.x));
  undo.click();
  editor.selection = { kind: 'prop', index: 0 };
  syncInspector();
  out.propMirrorHidden = field('selection-mirror-row').hidden === true;
  const propsBefore = JSON.stringify(current().props);
  key('X', { code: 'KeyX', shiftKey: true });
  out.shiftXOnProp = JSON.stringify(current().props) === propsBefore;

  // To front puts a prop last in its list, where it is drawn over the others,
  // and the selection follows it; Cmd+Shift+[ sends it back.
  out.orderShown = field('selection-order-row').hidden === false;
  const first = JSON.stringify(current().props[0]);
  field('order-front').click();
  out.toFront = [JSON.stringify(current().props.at(-1)) === first, editor.selection?.index === current().props.length - 1];
  key('{', { code: 'BracketLeft', metaKey: true, shiftKey: true });
  out.toBack = [JSON.stringify(current().props[0]) === first, editor.selection?.index === 0];
  undo.click();
  undo.click();
  out.orderUndone = JSON.stringify(current().props) === propsBefore;

  // Named groups: Cmd+G makes one of the selected block and props.
  const groups = await import('../../js/editor/groups.js');
  const { outlineOpen } = await import('../../js/editor/hit-test.js');
  const { duplicateTarget } = await import('../../js/editor/selection.js');
  const { trailHash } = await import('../../js/trail-hash.js');
  const { normalizeTrail } = await import('../../js/trail-schema.js');
  // An Alt-drag records the undo step before it copies, so these do too.
  const { pushHistory } = await import('../../js/editor/history.js');
  const hashBefore = trailHash(current());
  const members = [{ type: 'block', index: 0 }, { type: 'prop', index: 0 }, { type: 'prop', index: 1 }];
  editor.selection = { kind: 'items', items: members };
  syncInspector();
  out.groupOffered = [field('group-selection').hidden, field('ungroup-selection').hidden];
  key('g', { code: 'KeyG', metaKey: true });
  out.grouped = [current().terrainBlocks[0].group, current().props[0].group, current().props[1].group, current().props[2].group ?? null];
  out.groupTitle = field('selection-title').textContent;
  out.groupNameField = [field('selection-group-row').hidden, field('selection-group').value];
  out.groupHashSame = trailHash(current()) === hashBefore;
  out.groupOutlineClosed = outlineOpen(0) === false;
  // A press on any member takes the whole group; a box takes it too.
  editor.selection = null;
  editor.selection = groups.selectionForHit({ kind: 'prop', index: 1 });
  out.pressTakesGroup = groups.selectedGroup();
  out.boxTakesGroup = groups.withWholeGroups([{ type: 'prop', index: 0 }]).length;
  // A double-click goes in: one member, its outline open, a hint to get out.
  groups.enterGroup({ kind: 'block', blockIndex: 0 });
  syncInspector();
  out.inside = [editor.selection?.kind, outlineOpen(0), field('selection-title').textContent, field('selection-group-hint').hidden, field('selection-group-row').hidden];
  // Inside, a press picks a member, not the group.
  out.insidePress = groups.selectionForHit({ kind: 'prop', index: 0 })?.kind;
  key('Escape');
  out.escapeOut = groups.selectedGroup();
  // Renaming it renames every member.
  set('selection-group', 'House');
  out.renamed = [current().terrainBlocks[0].group, current().props[1].group];
  // A copy of the whole group is a new group; a copy of one member stays in it.
  pushHistory();
  duplicateTarget({ kind: 'prop', index: 0 });
  out.copiedWhole = groups.groupNames();
  undo.click();
  groups.enterGroup({ kind: 'prop', index: 0 });
  pushHistory();
  duplicateTarget({ kind: 'prop', index: 0 });
  out.copiedMember = [current().props.at(-1).group, groups.groupNames()];
  undo.click();
  // The group survives a save and load, and Cmd+Shift+G breaks it up.
  const loaded = normalizeTrail(current());
  out.groupKept = [loaded.terrainBlocks[0].group, loaded.props[0].group];
  // A click on empty space first, which leaves the group.
  editor.selection = null;
  editor.selection = groups.selectionForHit({ kind: 'prop', index: 0 });
  key('G', { code: 'KeyG', metaKey: true, shiftKey: true });
  out.ungrouped = groups.groupNames().length === 0 && editor.selection?.items?.length === 3;

  // The mini map shows the trail, and M hides and shows it.
  out.minimap = [field('minimap').hidden];
  key('m', { code: 'KeyM' });
  out.minimap.push(field('minimap').hidden);
  key('m', { code: 'KeyM' });
  out.minimap.push(field('minimap').hidden);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}


// Drags snap to other things and the grid when they come close, as in Figma.
// Two rectangles are drawn far from the trail, so nothing else is in view.
if (kind === 'snap') {
  const { snappingOn } = await import('../../js/editor/magnet.js');
  const out = { errors: [] };
  const B = 100000;
  editorState.zoom = 1;
  editorState.cameraX = cameraX = B;
  editorState.cameraY = cameraY = B;
  setSnapping(true);
  const box = () => {
    const nodes = current().terrainBlocks.at(-1).outer.nodes;
    const xs = nodes.map(node => node.x - B), ys = nodes.map(node => node.y - B);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  };
  // A 100 square at 113, and an 80 square to the right of it, off the grid.
  toolButton('block').click();
  drag([B + 113, B + 113], [B + 213, B + 213], { altKey: true });
  drag([B + 313, B + 263], [B + 393, B + 343], { altKey: true });
  toolButton('select').click();
  fire('pointerdown', world(B + 353, B + 303));
  fire('pointerup');
  // Its left edge comes within 3 of the first square's and lines up with it;
  // its top is nowhere near anything, so it follows the pointer exactly.
  fire('pointerdown', world(B + 353, B + 303));
  fire('pointermove', world(B + 353 - 197, B + 303 + 30));
  out.guides = editorState.snapLines.map(({ axis, at }) => [axis, at - B]);
  fire('pointerup');
  out.aligned = box();
  out.guidesAfter = editorState.snapLines.length;
  // Cmd held, it goes exactly where the pointer does.
  fire('pointerdown', world(B + 160, B + 333));
  fire('pointermove', { ...world(B + 163, B + 333), metaKey: true });
  fire('pointerup');
  out.free = box();
  // Its top comes within 2 of a grid line and lands on it.
  fire('pointerdown', world(B + 160, B + 333));
  fire('pointermove', world(B + 160, B + 338));
  fire('pointerup');
  out.grid = box();
  // Shift keeps a mostly sideways move level.
  fire('pointerdown', world(B + 160, B + 340));
  fire('pointermove', { ...world(B + 360, B + 355), shiftKey: true });
  fire('pointerup');
  out.level = box();
  // A point dragged near the height of the first square's bottom corner
  // lines up with it.
  const corner = box();
  fire('pointerdown', world(B + corner.left, B + corner.top));
  fire('pointermove', world(B + corner.left, B + 215));
  fire('pointerup');
  out.pointY = current().terrainBlocks.at(-1).outer.nodes.map(node => node.y - B).sort((a, b) => a - b)[0];
  // N turns snapping off, and on again.
  key('n', { code: 'KeyN' });
  out.offByKey = snappingOn() === false;
  key('n', { code: 'KeyN' });
  out.onByKey = snappingOn() === true;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// A roof or cave ceiling placed or dragged over something standing on the
// ground must not lift it onto the new top.
// Locking a group or an item in the Objects tab, and what it then refuses.
if (kind === 'locks') {
  const { editor } = await import('../../js/editor/state.js');
  // Find the camera as the interact checks do.
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();
  toolButton('select').click();

  const out = { errors: [] };
  const title = () => document.getElementById('selection-title').textContent;
  const groupRow = key => document.getElementById('object-groups').children[['terrain', 'back', 'backProps', 'frontProps', 'water', 'spikes', 'apples'].indexOf(key)];
  const groupLock = key => groupRow(key).children[0].children[1];
  const box = () => {
    drag([1000, 100], [1400, 500]);
    return editor.selection;
  };

  // Unlocked, a press on the back wall takes the back wall.
  drag([1100, 100], [1100, 100]);
  out.unlockedTakesWall = title();
  editor.selection = null;

  // The stub DOM only finds tool buttons by selector, so the tab is opened directly.
  const { setTab } = await import('../../js/editor/tools.js');
  setTab('objects');
  out.panelShown = document.getElementById('panel-objects').hidden === false;
  out.groupCount = document.getElementById('object-groups').children.length;
  groupLock('back').click();
  out.badge = document.getElementById('tab-objects').getAttribute('data-icon-after');
  // A group lock belongs to this trail alone.
  out.groupLockKeys = [...localStorage.store.keys()].filter(name => name.includes('locked-groups'));
  // Locked, the same press draws a box, which takes only the apple.
  out.boxOverWall = box()?.kind ?? null;
  key('a', { code: 'KeyA', metaKey: true });
  out.selectAllBlocks = (editor.selection.items || []).filter(item => item.type === 'block').map(item => item.index);
  // The Block tool can't add to a locked group.
  const { toolSettings } = await import('../../js/editor/tools.js');
  toolButton('block').click();
  toolSettings.block.layer = 'back';
  const blocksBefore = current().terrainBlocks.length;
  drag([1000, 700], [1200, 800], { altKey: true });
  out.blockRefused = current().terrainBlocks.length === blocksBefore;
  toolSettings.block.layer = 'terrain';
  toolButton('select').click();

  // Unlocking the group, then locking only the apple.
  groupLock('back').click();
  out.badgeGone = document.getElementById('tab-objects').getAttribute('data-icon-after');
  groupRow('apples').children[0].children[0].click();
  const appleRow = groupRow('apples').children[1].children[0];
  out.appleName = appleRow.children[0].textContent;
  appleRow.children[1].click();
  editor.selection = null;
  // Cmd draws a box even over the (now unlocked) back wall.
  drag([1150, 250], [1250, 350], { metaKey: true });
  out.lockedAppleBoxed = editor.selection?.kind ?? null;
  out.notInFile = !/"locked"|"lock"/.test(JSON.stringify(current()));

  // Locking what is selected lets go of it.
  drag([200, 450], [200, 450]);
  out.slabSelected = editor.selection?.kind ?? null;
  groupLock('terrain').click();
  out.releasedOnLock = editor.selection;
  groupLock('terrain').click();

  // A cut skips a locked group: lock the terrain and cut through the slab.
  groupLock('terrain').click();
  const slab = JSON.stringify(current().terrainBlocks[0]);
  toolButton('cut').click();
  toolSettings.cut.layer = 'terrain';
  fire('pointerdown', world(380, 250));
  for (const [x, y] of [[420, 250], [420, 650], [380, 650]]) fire('pointermove', world(x, y));
  fire('pointerup');
  out.cutRefused = JSON.stringify(current().terrainBlocks[0]) === slab && current().terrainBlocks.length === 2;
  groupLock('terrain').click();
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// The nisse: the Apple tool places it, placing it again moves it, and it can
// be selected, deleted and brought back with undo.
if (kind === 'nisse') {
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();

  const out = {};
  const { toolSettings } = await import('../../js/editor/tools.js');
  // The stub DOM keeps appended options as children, not in `options`.
  const walk = node => [node, ...[...(node.children || [])].flatMap(walk)];
  out.placeField = walk(document.getElementById('tool-settings-fields')).some(node => node.value === 'nisse');
  // What the Place select's change handler does.
  toolSettings.apple.kind = 'nisse';
  fire('pointerdown', world(300, 200));
  fire('pointerup');
  out.placed = current().nisse;
  out.apples = current().apples.length;
  fire('pointerdown', world(600, 150));
  fire('pointerup');
  out.moved = current().nisse;
  out.title = document.getElementById('selection-title').textContent;
  out.hintShown = document.getElementById('selection-nisse-hint').hidden === false;
  document.getElementById('delete-selection').click();
  out.deleted = !('nisse' in current());
  document.getElementById('undo').click();
  out.restored = current().nisse;
  toolSettings.apple.kind = 'apple';
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (kind === 'covered') {
  toolButton('apple').click();
  fire('pointerdown', { clientX: 0, clientY: 0 });
  fire('pointerup');
  const probe = current().apples.at(-1);
  cameraX = probe.x;
  cameraY = probe.y;
  document.getElementById('undo').click();

  const out = { errors: [] };
  // A block drawn over the start.
  toolButton('block').click();
  drag([40, 150], [140, 220], { altKey: true });
  out.startY = current().start.y;
  // A block drawn away from everything, then dragged over the prop.
  drag([1000, 100], [1200, 200], { altKey: true });
  toolButton('select').click();
  drag([1100, 150], [550, 150]);
  out.propY = current().props[0].y;
  // Raising the ground under the finish still carries it along.
  drag([800, 300], [800, 250]);
  out.finishY = current().finish.y;

  // A cave under the slab's top, from y 400 to 500.
  toolButton('cut').click();
  fire('pointerdown', world(400, 400));
  for (const [x, y] of [[700, 400], [700, 500], [400, 500]]) fire('pointermove', world(x, y));
  fire('pointerup');
  // The finish tool clicked inside the cave puts the finish on its floor.
  toolButton('finish').click();
  fire('pointerdown', world(650, 450));
  fire('pointerup');
  out.caveFinishY = current().finish.y;
  // Dragged up into the cave's air, it stays where it was dropped.
  toolButton('select').click();
  drag([650, 500], [650, 420]);
  out.liftedFinishY = current().finish.y;

  // A ground-anchored prop copied and pasted into the cave lands on its floor.
  const docEvent = (type, data = '') => {
    let written = data;
    const clipboardData = { setData: (_, value) => { written = value; }, getData: () => written };
    for (const handler of document.listeners.get(type) || []) handler({ preventDefault() {}, clipboardData });
    return written;
  };
  // The slab's top slopes after the corner drag, so the prop stands at 284.375.
  fire('pointerdown', world(250, 284));
  fire('pointerup');
  const copied = docEvent('copy');
  fire('pointermove', world(600, 480));
  docEvent('paste', copied);
  out.pastedPropY = current().props.at(-1).y;
  out.props = current().props.length;

  // A selection box around the start selects it.
  drag([60, 250], [120, 295]);
  out.boxTitle = document.getElementById('selection-title').textContent;
  // Select all includes the start and finish, so a nudge moves them too.
  const before = current();
  key('a', { metaKey: true, code: 'KeyA' });
  key('ArrowRight', { code: 'ArrowRight' });
  const after = current();
  out.selectAllMovesStart = after.start.x === before.start.x + 1;
  out.selectAllMovesFinish = after.finish.x === before.finish.x + 1;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const report = { loaded: current(), errors: [] };

// A drag, so the editor actually renders rather than returning early. Game art
// is on by default: the terrain comes from the game's rasteriser.
context.calls.length = 0;
fire('pointerdown', world(400, 300));
fire('pointermove', world(410, 310));
report.gameArt = context.calls.some(call => call[0] === 'drawImage');
report.gameArtOutlined = context.calls.some(call => call[0] === 'stroke');
fire('pointerup');

// With game art off, blocks are drawn as flat editing fills.
const toggle = document.getElementById('game-art');
toggle.checked = false;
toggle.dispatch('change');
context.calls.length = 0;
fire('pointerdown', world(400, 300));
fire('pointermove', world(410, 310));
report.drew = context.calls.some(call => call[0] === 'beginPath') && context.calls.some(call => call[0] === 'fill');
report.evenodd = context.calls.some(call => call[0] === 'fill' && call[1] === 'evenodd');
report.closed = context.calls.some(call => call[0] === 'closePath');
// stroke() takes no arguments on a real canvas.
report.strokeHasArgs = context.calls.some(call => call[0] === 'stroke' && call.length > 1);
report.calls = context.calls.length;
fire('pointerup');

// A trackpad sends more pan events than the screen shows frames: they are
// drawn once, in the next frame.
{
  context.calls.length = 0;
  for (let step = 0; step < 3; step++)
    for (const handler of canvas.listeners.get('wheel')) handler({ deltaX: 5, deltaY: 0, deltaMode: 0, preventDefault() {} });
  report.panDeferred = !context.calls.some(call => call[0] === 'setTransform');
  runFrames();
  report.panRedraws = context.calls.filter(call => call[0] === 'setTransform').length;
}

// Blocks out of view are not drawn (game art is off here, so each block in
// view is filled with the even-odd rule).
{
  const { renderView } = await import('../../js/editor/render.js');
  const fills = () => {
    context.calls.length = 0;
    renderView();
    runFrames();
    return context.calls.filter(call => call[0] === 'fill' && call[1] === 'evenodd').length;
  };
  report.blockFillsInView = fills();
  const cameraX = editorState.cameraX;
  editorState.cameraX += 100_000;
  report.blockFillsOutOfView = fills();
  editorState.cameraX = cameraX;
}

// Beside the sun's level, the glare it gives, which clouds temper.
{
  const { syncInspector } = await import('../../js/editor/inspector.js');
  const weather = editorState.trail.weather;
  editorState.trail.weather = { ...weather, sun: 1, clouds: 0 };
  syncInspector();
  report.sunClear = document.getElementById('weather-sun-value').textContent;
  editorState.trail.weather = { ...weather, sun: 1, clouds: 1 };
  syncInspector();
  report.sunCloudy = document.getElementById('weather-sun-value').textContent;
  editorState.trail.weather = weather;
  syncInspector();
}

// The import and export box is filled as its dialog opens and kept current
// while it is open. Closed, it is left alone: filling it is slow on a large trail.
{
  const { syncInspector } = await import('../../js/editor/inspector.js');
  const dialog = document.getElementById('data-dialog');
  dialog.showModal = () => { dialog.open = true; };
  const box = document.getElementById('trail-json');
  box.value = '';
  document.getElementById('open-data').click();
  report.jsonFilled = box.value !== '' && JSON.stringify(JSON.parse(box.value)) === JSON.stringify(current());
  const name = editorState.trail.name;
  editorState.trail.name = 'Renamed while open';
  syncInspector();
  report.jsonFollowsOpen = JSON.parse(box.value).name === 'Renamed while open';
  dialog.open = false;
  editorState.trail.name = 'Renamed while closed';
  syncInspector();
  report.jsonLeftClosed = JSON.parse(box.value).name === 'Renamed while open';
  editorState.trail.name = name;
  syncInspector();
}

// A start put down close to the ground snaps onto it, so the bike doesn't
// drop or jolt as a run begins; one put further up stays in the air.
{
  const { startY } = await import('../../js/editor/render.js');
  const { surfaceBelow } = await import('../../js/trail-schema.js');
  const x = editorState.trail.start.x;
  const ground = surfaceBelow(editorState.trail, x, null)?.y;
  if (Number.isFinite(ground)) {
    const zoom = editorState.zoom;
    editorState.zoom = 1;
    report.startSnaps = startY(x, ground - 12 - 6) === null && startY(x, ground - 12 + 3) === null;
    report.startStaysUp = startY(x, ground - 12 - 200) === ground - 12 - 200;
    editorState.zoom = zoom;
  }
}

const run = (label, gesture) => {
  try { gesture(); }
  catch (error) { report.errors.push(`${label}: ${error.message}`); }
};

run('block', () => {
  fire('pointerdown', world(300, 200));
  fire('pointermove', world(500, 320));
  fire('pointerup');
});
run('cut', () => {
  fire('pointerdown', world(400, 340));
  fire('pointermove', world(700, 340));
  fire('pointermove', world(700, 460));
  fire('pointermove', world(400, 460));
  fire('pointerup');
});
run('select', () => {
  for (const [x, y] of [[300, 200], [500, 320], [550, 400], [0, 300], [100, 100], [700, 250], [400, 500]]) {
    fire('pointerdown', world(x, y));
    fire('pointermove', world(x + 3, y + 3));
    fire('pointerup');
  }
});
run('frames', () => {
  for (let x = 0; x < 900; x += 37) {
    fire('pointerdown', world(x, 250));
    fire('pointermove', world(x + 11, 280));
    fire('pointerup');
  }
});
run('camera', () => {
  fire('wheel', { deltaX: 10, deltaY: 10, deltaMode: 0, ctrlKey: false });
  fire('gesturestart', {});
  fire('gesturechange', { scale: 1.2 });
  fire('gestureend', {});
});
run('pinch', () => { fire('wheel', { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true }); });

// A refusal has to be visible, and it has to say what is wrong, here for a
// trail whose ground-anchored finish has no terrain under it.
if (process.env.TSC_ENV_TRAIL === 'badgoal') {
  const button = document.getElementById('play-test');
  const before = JSON.stringify(current());
  button.click();
  const toast = document.getElementById('editor-toast');
  report.refusalText = toast.textContent;
  report.refused = report.refusalText.includes('before play testing');
  report.refusalShown = toast.hidden === false;
  // It has to name the actual problem, not just "fix the validation errors".
  report.refusalNamed = /finish has no terrain under it/.test(report.refusalText);
  report.refusalCounted = /\b1 validation error\b/.test(report.refusalText);
  report.buttonFlash = button.textContent;
  report.playtestClosed = document.getElementById('playtest').hidden === true;
  report.jsonUnchanged = JSON.stringify(current()) === before;
}

process.stdout.write(JSON.stringify(report));
// The editor holds timers and listeners open, so the report is written and the
// process ends explicitly rather than waiting for a clean exit.
process.exit(0);
