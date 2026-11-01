// Drives the real editor module against a stub DOM, one child process per trail
// shape.
//
// This exists because the bugs it catches were invisible to everything else. A
// malformed data path that throws, and a canvas call made with arguments the
// canvas rejects, cannot be seen in a source review, and a test that
// reimplements the editor's logic only verifies the copy. Importing the real
// module is the only way to see them.
//
// The child runs per trail shape because trails.js caches the catalog at import
// time, so two boots in one process would silently share a trail.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bootPath = fileURLToPath(new URL('./lib/editor-boot.mjs', import.meta.url));

let failures = 0;
const check = (label, condition) => {
  if (!condition) { failures++; console.log('FAIL', label); }
  else console.log('ok  ', label);
};

const boot = kind => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [bootPath], {
    env: { ...process.env, TSC_ENV_TRAIL: kind },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.on('close', () => {
    try { resolve(JSON.parse(out)); }
    catch (error) { reject(new Error(`${kind}: child produced no report (${error.message})`)); }
  });
  // The editor keeps timers open, so the child is killed once it has reported.
  setTimeout(() => child.kill('SIGKILL'), 30000).unref();
});

const reported = (report, label) => {
  const errors = report.errors.filter(error => error.startsWith(label));
  check(`${label} does not throw`, errors.length === 0);
  for (const error of errors) console.log('     ' + error);
};

// ---------------------------------------------------------------------------
// The nisse: one per trail, placed with the Apple tool.
// ---------------------------------------------------------------------------
{
  const report = await boot('nisse');
  check('the Apple tool can be set to place the nisse', report.placeField);
  check('it places the nisse, not an apple', report.placed && report.apples === 0);
  check('placing it again moves the one nisse',
    report.moved && Math.round(report.moved.x - report.placed.x) === 300);
  check('a selected nisse is titled and explained', report.title === 'NISSE' && report.hintShown);
  check('deleting it removes the field', report.deleted);
  check('and undo brings it back', report.restored && report.restored.x === report.moved.x);
}

// ---------------------------------------------------------------------------
// A block trail: drawing and the generic gestures.
// ---------------------------------------------------------------------------
{
  const report = await boot('blocks');

  check('the editor loads a block trail', report.loaded.terrainBlocks.length === 1);

  // The block must really be drawn, or nothing below proves anything.
  check('game art draws the terrain with the game renderer', report.gameArt);
  check('and outlines the blocks for editing', report.gameArtOutlined);
  check('a block is really drawn', report.drew);
  check('a block outline is stroked and closed', report.closed);
  // Caves stay open, which is what the even-odd rule is for.
  check('the block fill uses a fill rule', report.evenodd);
  // stroke() takes no arguments on a real canvas.
  check('stroke is never called with a fill rule', !report.strokeHasArgs);

  for (const label of ['block', 'cut', 'select', 'frames', 'camera', 'pinch']) {
    reported(report, label);
  }
  check('a block trail raises no errors at all', report.errors.length === 0);
  check('panning waits for the next frame', report.panDeferred);
  check('and draws once for several pan events', report.panRedraws === 1, `(${report.panRedraws})`);
  check('a block in view is drawn', report.blockFillsInView > 0);
  check('a block out of view is not', report.blockFillsOutOfView === 0, `(${report.blockFillsOutOfView})`);
  check('a clear sun says it glares', report.sunClear === '100% · full glare', `(${report.sunClear})`);
  check('and the same sun behind clouds does not', report.sunCloudy === '100% · no glare', `(${report.sunCloudy})`);
  check('the JSON box is filled as its dialog opens', report.jsonFilled);
  check('and follows edits while it is open', report.jsonFollowsOpen);
  check('but is left alone while it is closed', report.jsonLeftClosed);
  if ('startSnaps' in report) {
    check('a start put close to the ground snaps onto it', report.startSnaps);
    check('one put well above it stays in the air', report.startStaysUp);
  }
}

// ---------------------------------------------------------------------------
// A refusal to play test has to be visible and has to say what is wrong.
// ---------------------------------------------------------------------------
{
  const report = await boot('badgoal');
  check('play testing is refused when the trail does not validate', report.refused === true);
  check('the refusal names the actual problem', report.refusalNamed === true, `("${report.refusalText}")`);
  check('the refusal counts the errors', report.refusalCounted === true, `("${report.refusalText}")`);
  check('the refusal pops up over the canvas', report.refusalShown === true);
  check('the play-test button says how many errors', /\d+ ERROR/.test(report.buttonFlash || ''), `("${report.buttonFlash}")`);
  check('the playtest panel did not open', report.playtestClosed === true);
  check('the trail itself was not modified', report.jsonUnchanged === true);
}

// ---------------------------------------------------------------------------
// Precise editing on a block trail.
// ---------------------------------------------------------------------------
{
  const report = await boot('interact');
  check('a click without a drag leaves no undo step', report.clickLeavesNoUndo === true);
  check('a cut straight through splits the block into two blocks', JSON.stringify(report.splitBlocks) === '["id,inner,material,outer","id,inner,material,outer"]', `(${JSON.stringify(report.splitBlocks)})`);
  check('clicking one piece selects only that block', !/BLOCKS/.test(report.splitSelectsOne || ''), `("${report.splitSelectsOne}")`);
  check('dragging a corner of the second piece moves that corner', report.rightMoved === true);
  check('and leaves the first region alone', report.leftUntouched === true);
  check('Escape abandons a cut being drawn', report.escapeCancels === true);
  check('Shift-click selects several blocks', /2 BLOCKS/.test(report.multiTitle || ''), `("${report.multiTitle}")`);
  check('dragging moves every selected block', report.multiMoved === true);
  check('Delete removes every selected block', report.multiDeleted === true);
  check('Shift-drag moves a point', report.snapMoved === true);
  check('Shift-drag locks a point to 15 degree steps from a neighbour', report.snapAngle === true);
  check('Shift-drag puts a point on a grid line', report.snapGrid === true);
  check('releasing Shift mid-drag restores the exact position', report.releaseExact === true);
  check('pressing Shift mid-drag snaps again', report.repressSnaps === true);
  check('dragging without Shift is not snapped', report.plainExact === true);
}

// ---------------------------------------------------------------------------
// Locks in the Objects tab.
// ---------------------------------------------------------------------------
{
  const report = await boot('locks');
  reported(report, 'locks');
  check('unlocked, a press on a back wall takes it', report.unlockedTakesWall === 'BACK WALL', `("${report.unlockedTakesWall}")`);
  check('the Objects tab opens and lists every group', report.panelShown && report.groupCount === 7);
  check('a group lock is kept for this trail only', JSON.stringify(report.groupLockKeys) === '["hjulben-editor-locked-groups-t1"]', `(${JSON.stringify(report.groupLockKeys)})`);
  check('the tab shows a lock while anything is locked', report.badge === 'lock' && report.badgeGone === null);
  check('with back walls locked, a press on one draws a box that takes the apple', report.boxOverWall === 'apple', `(${report.boxOverWall})`);
  check('select all leaves a locked back wall out', JSON.stringify(report.selectAllBlocks) === '[0]', `(${report.selectAllBlocks})`);
  check('the Block tool will not draw onto a locked group', report.blockRefused);
  check('an item is listed by name', report.appleName === 'Apple', `("${report.appleName}")`);
  check('a locked item is left out of a selection box', report.lockedAppleBoxed === null, `(${report.lockedAppleBoxed})`);
  check('locks are not saved in the trail', report.notInFile);
  check('a cut leaves a locked group alone', report.cutRefused);
  check('locking what is selected lets go of it', report.slabSelected === 'block' && report.releasedOnLock === null, `(${report.slabSelected}, ${JSON.stringify(report.releasedOnLock)})`);
}

// ---------------------------------------------------------------------------
// A roof over something on the ground leaves it where it stood.
// ---------------------------------------------------------------------------
{
  const report = await boot('covered');
  check('a block drawn over the start leaves the start on its ground', report.startY === 288, `(${report.startY})`);
  check('a block dragged over a prop leaves the prop on its ground', report.propY === 300, `(${report.propY})`);
  check('raising the ground under the finish still carries it', report.finishY === null, `(${report.finishY})`);
  check('the finish tool clicked in a cave puts the finish on the cave floor', report.caveFinishY === 500, `(${report.caveFinishY})`);
  check('a finish lifted in the cave is pinned in the air', report.liftedFinishY === 420, `(${report.liftedFinishY})`);
  check('a selection box around the start selects it', /START/i.test(report.boxTitle || ''), `("${report.boxTitle}")`);
  check('select all moves the start', report.selectAllMovesStart === true);
  check('select all moves the finish', report.selectAllMovesFinish === true);
  check('a ground prop pasted into a cave lands on the cave floor', report.props === 3 && report.pastedPropY === 500, `(${report.props}, ${report.pastedPropY})`);
}

// ---------------------------------------------------------------------------
// Rotation: the handle, R and the inspector.
// ---------------------------------------------------------------------------
{
  const report = await boot('rotate');
  const json = JSON.stringify;
  check('a selected block shows the rotate handle and quarter-turn buttons', report.blockHandle === true && report.blockRowShown === true);
  check('dragging the handle a quarter turn turns the block about its centre', json(report.blockTurned) === json([250, 50, 550, 850]), `(${json(report.blockTurned)})`);
  check('one rotate drag is one undo step', report.oneUndo === true);
  check('the quarter-turn button turns the block', json(report.buttonTurned) === json([250, 50, 550, 850]), `(${json(report.buttonTurned)})`);
  check('a lone prop shows its Rotation field instead of the buttons', /PROP/i.test(report.propTitle || '') && report.propFieldShown === true && report.propButtonsHidden === true, `("${report.propTitle}")`);
  check('Shift snaps a prop to 15 degrees', report.snapped === 15, `(${report.snapped})`);
  check('without Shift a prop turns freely', Math.abs(report.free - 20) < 0.2, `(${report.free})`);
  check('undo restores an unrotated prop', report.undone === undefined, `(${report.undone})`);
  check('R turns a prop 15 degrees clockwise', report.keyR === 15, `(${report.keyR})`);
  check('Shift+R turns it back counter-clockwise', report.keyShiftR === -15, `(${report.keyShiftR})`);
  check('the Rotation field wraps to -180..180', report.fieldWrapped === -160, `(${report.fieldWrapped})`);
  check('a rotation of 0 is left out of the trail', report.fieldCleared === false);
  check('turning everything moves the start but keeps its facing', report.startMoved === true && report.startFacing === true);
  check('turning everything moves water but keeps it level', report.waterMoved === true && report.waterShape === true);
  check('turning everything turns the props', report.propTurned === 90, `(${report.propTurned})`);
  check('water alone has no rotate handle', /WATER/i.test(report.waterTitle || '') && report.waterHandle === null && report.waterRowHidden === true, `("${report.waterTitle}")`);
  check('rotating raises no errors', report.errors.length === 0);
}

// ---------------------------------------------------------------------------
// A group's props and spikes share their inspector fields.
// ---------------------------------------------------------------------------
{
  const report = await boot('group');
  const json = JSON.stringify;
  check('a group of props and spikes shows their shared fields', report.rowsShown === true);
  check('fields that differ across the group show blank', json(report.mixed) === json(['', '', '', '']) && report.flipMixed === '', `(${json(report.mixed)}, ${json(report.flipMixed)})`);
  check('Prop layer moves every selected prop', json(report.layers) === json(['front', 'front', 'front']) && report.layerShared === 'front', `(${json(report.layers)})`);
  check('one undo puts the layers back', json(report.layersUndone) === json(['back', 'front', 'back']), `(${json(report.layersUndone)})`);
  check('Flip skips props that cannot flip', json(report.flips) === json([true, true, false]), `(${json(report.flips)})`);
  check('Prop type changes every selected prop', json(report.types) === json(['pine', 'pine', 'pine']), `(${json(report.types)})`);
  check('Radius sets every selected spike', json(report.radii) === json([40, 40]), `(${json(report.radii)})`);
  check('clearing a mixed Radius changes nothing', json(report.radiiCleared) === json([20, 30]), `(${json(report.radiiCleared)})`);
  check('Spin sets every selected spike', json(report.spins) === json([-0.5, -0.5]), `(${json(report.spins)})`);
  check('X flips the whole group, then unflips it', json(report.keyFlip) === json([true, true, false]) && json(report.keyUnflip) === json([false, false, false]), `(${json(report.keyFlip)}, ${json(report.keyUnflip)})`);
  check('] gives the whole group one type', report.cycled === 1, `(${report.cycled})`);
  check('a plain click in the Objects tab selects one thing', json(report.listPlain) === json(['spike0']), `(${json(report.listPlain)})`);
  check('Cmd-click in the Objects tab adds to the selection', json(report.listAdded) === json(['spike0', 'spike1']), `(${json(report.listAdded)})`);
  check('Ctrl-click in the Objects tab takes a thing out again', json(report.listRemoved) === json(['spike1']), `(${json(report.listRemoved)})`);
  check('Shift-click in the Objects tab adds the rows between', json(report.listRange) === json(['prop0', 'prop2']), `(${json(report.listRange)})`);
  check('a lone spike shows no size', report.loneSizeHidden === true);
  check('two spikes show how far apart they are', report.spikeSize === '200 × 0', `("${report.spikeSize}")`);
  check('a block shows its width and height', report.blockSize === '800 × 300', `("${report.blockSize}")`);
}

// ---------------------------------------------------------------------------
// The Water tool draws, places and edits water bodies like the other tools.
// ---------------------------------------------------------------------------
{
  const report = await boot('water');
  const same = (body, expected) => JSON.stringify(body) === JSON.stringify(expected);
  check('a Water drag draws the dragged rectangle', same(report.drawn, { x: 1000, y: 200, width: 200, depth: 60 }), `(${JSON.stringify(report.drawn)})`);
  check('the new body is selected', report.drawnSelected === true);
  check('the inspector shows its depth', report.depthRowShown === true);
  check('a Water click drops a default body centred on the click', same(report.clicked, { x: 280, y: 250, width: 240, depth: 32 }), `(${JSON.stringify(report.clicked)})`);
  check('a body is dragged by the middle of its surface', report.moved?.x === 1050 && report.moved?.y === 180, `(${JSON.stringify(report.moved)})`);
  check('clicking open water selects the body', report.clickSelects === true);
  check('changing the depth keeps the surface', report.deepened?.depth === 120 && report.deepened?.y === 250, `(${JSON.stringify(report.deepened)})`);
  check('the hint says deep water wipes the rider out', /wipes the rider out/.test(report.deepHint || ''), `("${report.deepHint}")`);
  check('Delete removes the body and undo brings it back', report.afterDelete === 1 && report.afterUndo === 2, `(${report.afterDelete}, ${report.afterUndo})`);
  check('water editing raises no errors', report.errors.length === 0);
}

// ---------------------------------------------------------------------------
// A trail that can't be saved here can't be renamed or keep drafts.
// ---------------------------------------------------------------------------
{
  const report = await boot('readonly');
  check('a read-only trail hides Rename', report.renameHidden === true);
  check('and Save draft', report.draftHidden === true);
  check('and Delete', report.deleteHidden === true);
  check('and disables the selection and trail fields', report.fieldsLocked === true);
  check('and every tool but Select and Pan', report.toolsLocked === true);
  check('a tool shortcut leaves the Select tool on', report.toolRefused === true);
  check('things can still be selected', report.selectsAll === true);
  check('no drag, nudge, flip, rotate, delete or tool key changes it', report.unchanged === true);
  check('Cmd+S saves no draft of it', report.drafts === 0, `(${report.drafts})`);
}

// ---------------------------------------------------------------------------
// A validation message about one item selects it and brings it into view.
// ---------------------------------------------------------------------------
{
  const report = await boot('warned');
  check('a prop warning is clickable', report.clickable === true);
  check('clicking it selects the prop', report.selection?.kind === 'prop' && report.selection?.index === 0, `(${JSON.stringify(report.selection)})`);
  check('and centres the view on it', report.centredX === 600, `(${report.centredX})`);
  check('the inspector lists the selected prop\'s warning', report.issuesShown === true && report.issues.length === 1 && /unknown type/.test(report.issues[0]), `(${JSON.stringify(report.issues)})`);
  check('and hides the list with nothing selected', report.issuesHiddenAfter === true);
}

console.log(failures ? `\n${failures} failing` : '\nEditor DOM tests passed.');
process.exit(failures ? 1 : 0);
