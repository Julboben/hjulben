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
import { join } from 'node:path';

const bootPath = join(import.meta.dirname, 'lib/editor-boot.mjs');

let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
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
  check('the Apple tool\'s menu offers the nisse', report.menuShown);
  check('choosing it takes up the Apple tool, set to the nisse, and closes the menu', JSON.stringify(report.menuChose) === '["nisse","apple",true]', `(${JSON.stringify(report.menuChose)})`);
  check('it places the nisse, not an apple', report.placed && report.apples === 0);
  check('placing it again moves the one nisse',
    report.moved && Math.round(report.moved.x - report.placed.x) === 300);
  check('a selected nisse is titled and explained', report.title === 'NISSE' && report.hintShown);
  check('deleting it removes the field', report.deleted);
  check('and undo brings it back', report.restored && report.restored.x === report.moved.x);
  check('undo says what it took back', report.undoSaid === 'Undid: deleted the nisse', `("${report.undoSaid}")`);
  check('redo names the step in its tooltip, and says it did it again',
    report.redoTitle === 'Redo: deleted the nisse (Cmd/Ctrl+Shift+Z)' && report.redoSaid === 'Redid: deleted the nisse',
    `("${report.redoTitle}", "${report.redoSaid}")`);
  check('the undo history lists the step to redo, the one that made the trail as it is, then older ones',
    JSON.stringify(report.historyRows) === JSON.stringify(['redoable|Deleted the nisse', 'now|Moved the nisse', '|Added a nisse']),
    `(${JSON.stringify(report.historyRows)})`);
  check('picking an older step takes back the steps after it',
    report.historyBack[0]?.x === report.placed.x && report.historyBack[1] === 'Undid: moved the nisse',
    `(${JSON.stringify(report.historyBack)})`);
  check('picking the newest redoes every step up to it, as one jump',
    report.historyForward[0] === false && report.historyForward[1] === 'Redid 2 steps: moved the nisse and deleted the nisse',
    `(${JSON.stringify(report.historyForward)})`);
  check('a spike\'s radius set in the inspector carries over to the next spike', JSON.stringify(report.nextSpike?.slice(-2)) === '[30,30]', `(${JSON.stringify(report.nextSpike)})`);
  check('Start and Finish share a flag button that takes up the one used last, and its menu sets the start\'s facing',
    JSON.stringify(report.markerButton) === JSON.stringify([['start', 'flag'], ['finish', 'flag', 'finish', 'finish'], ['start', 'flag', 'start'], '-1']), `(${JSON.stringify(report.markerButton)})`);
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
  check('and the same sun in the rain does not', report.sunRainy === '100% · no glare', `(${report.sunRainy})`);
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
  check('the version chip starts unedited', !/edited/.test(report.labelBeforeDrag || ''), `("${report.labelBeforeDrag}")`);
  check('it stays unedited while a drag is held', report.labelMidDrag === report.labelBeforeDrag, `("${report.labelMidDrag}")`);
  check('and says edited once the drag is let go', /edited/.test(report.labelAfterDrag || ''), `("${report.labelAfterDrag}")`);
  check('undo takes the edited mark away again', report.labelAfterUndo === report.labelBeforeDrag, `("${report.labelAfterUndo}")`);
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
  check('with snapping off, a dragged point goes exactly where the pointer does', report.plainExact === true);
  check('pressing Alt mid-drag moves a copy instead', report.altPressCopies === true);
  check('letting go of Alt drops the copy and moves the original again', report.altReleaseRestores === true);
  check('a press on the edge of an unselected block moves the whole block', report.closedEdgeMovesBlock === true);
  check('on a selected block it moves only that edge', report.openEdgeMovesEdge === true);
  check('an unselected block\'s point is only grabbed on its dot', report.pointNeedsDot === true);
  check('Escape mid-drag puts everything back without an undo step', report.escapeCancelsDrag === true);
  check('hovering a point highlights it', report.hoverPoint === 'blockPoint', `(${report.hoverPoint})`);
  check('an unselected block\'s edge is not highlighted', report.hoverClosedEdge === null, `(${report.hoverClosedEdge})`);
  check('a selected block\'s edge is highlighted', report.hoverOpenEdge === 'blockEdge', `(${report.hoverOpenEdge})`);
}

// ---------------------------------------------------------------------------
// Locks in the Objects panel.
// ---------------------------------------------------------------------------
{
  const report = await boot('locks');
  reported(report, 'locks');
  check('unlocked, a press on a back wall takes it', /BACK WALL/.test(report.unlockedTakesWall || ''), `("${report.unlockedTakesWall}")`);
  check('the Objects panel lists every group', report.groupCount === 7);
  check('a group lock is kept for this trail only', JSON.stringify(report.groupLockKeys) === '["hjulben-editor-locked-groups-t1"]', `(${JSON.stringify(report.groupLockKeys)})`);
  check('with back walls locked, a press on one draws a box that takes the apple', report.boxOverWall === 'apple', `(${report.boxOverWall})`);
  check('select all leaves a locked back wall out', JSON.stringify(report.selectAllBlocks) === '[0]', `(${report.selectAllBlocks})`);
  check('the Block tool will not draw onto a locked group', report.blockRefused);
  check('a group holding the selection is marked and opens to show it', report.appleGroupMarked && report.appleRevealed);
  check('the inspector titles a thing as the Objects panel names it', report.appleTitle === 'APPLE', `("${report.appleTitle}")`);
  check('an item is listed by name', report.appleName === 'Apple', `("${report.appleName}")`);
  check('a locked item is left out of a selection box', report.lockedAppleBoxed === null, `(${report.lockedAppleBoxed})`);
  check('locks are not saved in the trail', report.notInFile);
  check('a cut leaves a locked group alone', report.cutRefused);
  check('a named group can be hidden on its own', report.namedHideFree);
  check('but not shown while its category is hidden', report.namedHideHeld);
  check('locking what is selected lets go of it', report.slabSelected === 'block' && report.releasedOnLock === null, `(${report.slabSelected}, ${JSON.stringify(report.releasedOnLock)})`);
  check('the inspector lock button locks the selection', report.lockButtonShown && report.buttonLocked);
  check('the half-lit lock above the groups locks every group, then unlocks everything', JSON.stringify(report.lockEverything) === JSON.stringify(['mixed', 'true', true, 'false']));
  check('a second click on the lock above the groups frees everything', report.unlockedAll);
  check('L locks the selection', report.keyLocked);
  check('/ opens the Objects filter', report.filterKey);
  check('a new prop stays locked through undo and redo', report.placedLock === true);
  check('undo frees a lock and selects again, redo locks again, and undo shows what was hidden',
    JSON.stringify(report.lockUndo) === '["false",true,true,true,"false"]', `(${JSON.stringify(report.lockUndo)})`);
  check('⌘\' hides the grid and its snapping, and again shows both',
    JSON.stringify(report.gridKey) === JSON.stringify([[false, 'Show grid', false], [true, 'Hide grid', true]]), `(${JSON.stringify(report.gridKey)})`);
  check('⌘\\ hides the side panels, and again shows them', JSON.stringify(report.panelsKey) === '[true,false]', `(${JSON.stringify(report.panelsKey)})`);
  check('with nothing selected the inspector shows the trail settings, and a selection replaces them',
    JSON.stringify(report.trailSettings) === JSON.stringify([true, 'TRAIL', true, true, 'INSPECTOR']), `(${JSON.stringify(report.trailSettings)})`);
  check('the filter keeps only matching groups, open', JSON.stringify(report.filtered) === '[1,2]', `(${JSON.stringify(report.filtered)})`);
  check('a filter that matches nothing says so', report.noMatch);
  check('Collapse all closes every group', report.collapseShown && report.collapsed);
  check('Open all opens every group with something in it', report.openedAll);
  check('a group\'s lock is half lit when something in it is locked', report.markBefore === false && report.markAfter === true);
  check('a group button locks all of the group, then frees all of it', JSON.stringify(report.groupToggle) === JSON.stringify(['true', 'false']));
  check('a selection box leaves a hidden group out', report.hiddenBoxed === false, `(${report.hiddenBoxed})`);
  check('the eye above the groups brings hidden things back', report.shownAgain);
  check('a group\'s eye is half lit when something in it is hidden', report.hideMark);
  check('the inspector eye button hides the selection', report.hideButtonShown && report.buttonHid);
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
  check('a lone prop is titled by its name and shows its Rotation field instead of the buttons', report.propTitle === 'ROCK' && report.propFieldShown === true && report.propButtonsHidden === true, `("${report.propTitle}")`);
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
// Dragging snaps to other things and the grid nearby, as in Figma.
// ---------------------------------------------------------------------------
{
  const report = await boot('snap');
  const json = JSON.stringify;
  check('a block dragged near another lines up with its edge', report.aligned.left === 113 && report.aligned.top === 293, `(${json(report.aligned)})`);
  check('a guide shows what it lined up with while dragging', json(report.guides) === json([['x', 113]]), `(${json(report.guides)})`);
  check('the guide goes when the drag ends', report.guidesAfter === 0);
  check('Cmd held mid-drag moves it freely', report.free.left === 116 && report.free.top === 293, `(${json(report.free)})`);
  check('an edge near a grid line lands on it', report.grid.top === 300 && report.grid.left === 113, `(${json(report.grid)})`);
  check('Shift keeps a sideways move level', report.level.top === 300, `(${json(report.level)})`);
  check('a dragged point lines up with another point', report.pointY === 213, `(${report.pointY})`);
  check('a scale handle lines a side up with another block', report.scaled.left === 213, `(${json(report.scaled)})`);
  check('a guide shows what the scaled side lined up with', json(report.scaleGuides) === json([['x', 213]]), `(${json(report.scaleGuides)})`);
  check('Cmd held mid-scale follows the pointer', report.scaledFree.left === 204, `(${json(report.scaledFree)})`);
  check('the scale frame goes round a curved block, not its curve handles', Math.abs(report.bulgeFrameGaps[0] - report.bulgeFrameGaps[1]) < 0.01, `(${json(report.bulgeFrameGaps)})`);
  check('a run of Escapes deselects and stays in the editor', report.escapeRun[0] === null && report.escapeRun[1] === 0 && report.escapeRun[2] === false, `(${json(report.escapeRun)})`);
  check('Escape with nothing to back out of asks to leave', json(report.escapeAsks) === json([0, true]), `(${json(report.escapeAsks)})`);
  check('Escape after the question has gone asks again', report.escapeAsksAgain === 0);
  check('a held Escape repeating does not leave the editor', report.escapeRepeatStays === 0);
  check('Escape asks again once another message replaced the question', json(report.escapeAfterOtherMessage) === json([0, true]), `(${json(report.escapeAfterOtherMessage)})`);
  check('a second Escape while it asks leaves the editor', report.escapeLeaves === 1);
  check('stretching a curved block from one side keeps the other side still', Math.abs(report.bulgeLeft[1] - report.bulgeLeft[0]) < 0.01, `(${json(report.bulgeLeft)})`);
  check('N turns snapping off and on', report.offByKey && report.onByKey);
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
  check('in fields that can be changed', report.blockSizeEditable);
  check('a block is titled by its number and material', report.blockTitle === 'BLOCK 1 · GRASS', `("${report.blockTitle}")`);
  check('and its delete button says it deletes the block', report.blockDelete === 'DELETE BLOCK', `("${report.blockDelete}")`);
  check('a typed width stretches the block from its left edge', json(report.resized) === json([0, 400, 300]), `(${json(report.resized)})`);
  check('and undo puts its width back', report.resizeUndone === 800, `(${report.resizeUndone})`);
  check('a block cannot be made thinner than the handles allow', report.heightFloor === 8, `(${report.heightFloor})`);
  check('either handle of a smooth point turns the other', JSON.stringify(report.smoothTurns) === '[true,true]', `(${JSON.stringify(report.smoothTurns)})`);
  check('a point is titled by its number and block', report.pointTitle === 'POINT 2 · BLOCK 1', `("${report.pointTitle}")`);
  check('a point shows its kind but not an edge\'s shape', json(report.pointRows) === json([false, true, true]), `(${json(report.pointRows)})`);
  check('and its delete button says it deletes the point', report.pointDelete === 'DELETE POINT', `("${report.pointDelete}")`);
  check('an edge is titled by the points it joins', report.edgeTitle === 'EDGE 4–1 · BLOCK 1', `("${report.edgeTitle}")`);
  check('an edge shows its shape and Split Edge, but no point\'s kind', json(report.edgeRows) === json([true, false, false]), `(${json(report.edgeRows)})`);
  check('an edge offers no delete button', report.edgeDeleteHidden === true);
  check('Split Edge adds one point and selects it', json(report.split) === json([1, 'blockPoint', 4]), `(${json(report.split)})`);
  check('and undo takes it out again', report.splitUndone);
  check('whole blocks show the top-left of their box as X and Y', json(report.cornerShown) === json([true, true]), `(${json(report.cornerShown)})`);
  check('and a typed X moves that corner there', report.cornerMoved === 100, `(${report.cornerMoved})`);
  check('a selection with a block can be flipped', report.mirrorShown);
  check('flipping carries a prop across and turns it round', json(report.mirrored) === json([0, true]), `(${json(report.mirrored)})`);
  check('X flips it too', report.keyMirrored === 0, `(${report.keyMirrored})`);
  check('a prop alone has no block flip', report.propMirrorHidden);
  check('the start faces left with the arrows, and X turns it back', JSON.stringify(report.startFacing) === JSON.stringify([true, -1, true, 1]), `(${JSON.stringify(report.startFacing)})`);
  check('a lone ladder shows its facing arrows, Right lit, and Delete names it', JSON.stringify(report.loneProp) === JSON.stringify([true, true, 'DELETE LADDER']), `(${JSON.stringify(report.loneProp)})`);
  check('and Shift+X leaves it alone', report.shiftXOnProp);
  check('a prop can be brought to the front or sent to the back', report.orderShown);
  check('To front draws it last, and the selection follows it', json(report.toFront) === json([true, true]), `(${json(report.toFront)})`);
  check('Cmd+Shift+[ sends it to the back', json(report.toBack) === json([true, true]), `(${json(report.toBack)})`);
  check('and undo puts the order back', report.orderUndone);
  check('blocks and props can be grouped, not yet ungrouped', json(report.groupOffered) === json([false, true]), `(${json(report.groupOffered)})`);
  check('Cmd+G puts them in one named group', json(report.grouped) === json(['Group 1', 'Group 1', 'Group 1', null]), `(${json(report.grouped)})`);
  check('a group is titled by its name', report.groupTitle === 'GROUP 1 · GROUP', `("${report.groupTitle}")`);
  check('and shows its name to change', json(report.groupNameField) === json([false, 'Group 1']), `(${json(report.groupNameField)})`);
  check('grouping leaves the trail hash alone', report.groupHashSame);
  check('a grouped block\'s outline stays closed', report.groupOutlineClosed);
  check('a press on a member takes the whole group', report.pressTakesGroup === 'Group 1', `(${report.pressTakesGroup})`);
  check('and so does a box around one member', report.boxTakesGroup === 4, `(${report.boxTakesGroup})`);
  check('going into a group selects one member with its outline open', json(report.inside) === json(['block', true, 'BLOCK 1 · GRASS', false, true]), `(${json(report.inside)})`);
  check('inside a group, a press picks a member', report.insidePress === 'prop', `(${report.insidePress})`);
  check('Escape comes back out to the whole group', report.escapeOut === 'Group 1', `(${report.escapeOut})`);
  check('renaming a group renames every member', json(report.renamed) === json(['House', 'House']), `(${json(report.renamed)})`);
  check('a copy of a whole group is a group of its own', json(report.copiedWhole) === json(['House', 'House 2']), `(${json(report.copiedWhole)})`);
  check('a copy of one member stays in its group', json(report.copiedMember) === json(['House', ['House']]), `(${json(report.copiedMember)})`);
  check('a group is kept when the trail is loaded', json(report.groupKept) === json(['House', 'House']), `(${json(report.groupKept)})`);
  check('Cmd+Shift+G breaks it up, leaving its members selected', report.ungrouped);
  check('the mini map shows, and M hides and shows it', json(report.minimap) === json([false, true, false]), `(${json(report.minimap)})`);
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
  check('a Water click adds no body', report.afterClick === 1, `(${report.afterClick})`);
  check('a body is dragged by the middle of its surface', report.moved?.x === 1050 && report.moved?.y === 180, `(${JSON.stringify(report.moved)})`);
  check('clicking open water selects the body', report.clickSelects === true);
  check('changing the depth keeps the surface', report.deepened?.depth === 120 && report.deepened?.y === 250, `(${JSON.stringify(report.deepened)})`);
  check('the hint says deep water wipes the rider out', /wipes the rider out/.test(report.deepHint || ''), `("${report.deepHint}")`);
  check('Delete removes the body and undo brings it back', report.afterDelete === 1 && report.afterUndo === 2, `(${report.afterDelete}, ${report.afterUndo})`);
  check('water editing raises no errors', report.errors.length === 0);
  check('a shortcut works after a tool button is clicked', report.toolAfterButton === 'cut', `(${report.toolAfterButton})`);
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
