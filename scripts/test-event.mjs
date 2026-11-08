// Trials-event and trail-hint props: banners and pit boards, the spectators'
// cheering and ducking, the marshals' waving, the course tape and the halfway
// flag. All of it is visual only and still at time 0.
import assert from 'node:assert/strict';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import { PAINTED_PROPS, TEXT_PROPS, canFlip, canRotate, paintedBounds, riderGaze } from '../js/drawing.js';
import {
  BANNER_BRANDS, BANNER_MAX, CAMERA_EYE, HALFWAY_FLASH, PERSON_EYES, SPECTATOR_CHEER, CRASH_DUCK, MARSHAL_WAVE,
  bannerLayout, bannerRipple, bannerRuns, bannerStyle, crashMood, halfwayFlash, marshalFlag, pitBoardText, spectatorHop, spectatorMood,
  splitText, tapeDroop, tapeTail,
} from '../js/event-props.js';

const EVENT_PROPS = [
  'tyre-wall', 'hay-bales', 'course-tape', 'banner', 'spectators', 'pit-board', 'petrol-can',
  'marshal-start', 'marshal-finish', 'camera-tower', 'warning-triangle', 'warning-bang', 'warning-skull',
  'arrow-sign', 'halfway-flag', 'tutorial-lean', 'tutorial-flip', 'tutorial-rotate', 'tutorial-light',
  'tutorial-restart', 'tutorial-ledge', 'tutorial-gas', 'tutorial-brake',
];

const trail = (props) => normalizeTrail({
  name: 'test', finish: { x: 2800, y: null }, apples: [], spikes: [],
  terrainBlocks: [rectangle(0, 320, 3000, 620, 'grass', 'ground')],
  start: { x: 120, y: null, facing: 1 }, props,
});
const prop = (type, x, extra = {}) => ({ type, x, y: null, layer: 'back', ...extra });
const warningsFor = (props) => validateTrail(trail(props)).filter((m) => m.type === 'warning').map((m) => m.text);

// Every new prop is a known type; lettered props don't mirror, arrows do.
{
  const warnings = warningsFor(EVENT_PROPS.map((type, index) => prop(type, 300 + index * 120)));
  assert.ok(!warnings.some((text) => /unknown type/.test(text)), warnings.join('\n'));
  for (const type of ['banner', 'pit-board', 'halfway-flag']) assert.ok(!canFlip(type), `${type} would mirror its text`);
  for (const type of ['arrow-sign', 'marshal-start', 'camera-tower', 'spectators']) assert.ok(canFlip(type), `${type} can flip`);
  for (const type of ['tutorial-lean', 'tutorial-flip', 'tutorial-rotate', 'tutorial-light', 'tutorial-restart', 'tutorial-ledge', 'tutorial-gas', 'tutorial-brake']) {
    assert.ok(PAINTED_PROPS.has(type) && canRotate(type), `${type} is painted on the rock`);
    assert.ok(paintedBounds(type)[3] > 0, 'and reaches below its anchor');
  }
}

// Banners and pit boards keep their text; signs still do, other props don't.
{
  const normalized = trail([prop('banner', 400, { text: 'Äpple Oil' }), prop('pit-board', 600, { text: '7' }), prop('rock', 800, { text: 'x' })]);
  assert.equal(normalized.props[0].text, 'Äpple Oil');
  assert.equal(normalized.props[1].text, '7');
  assert.equal(normalized.props[2].text, undefined);
  assert.ok(TEXT_PROPS.has('sign') && TEXT_PROPS.has('banner') && TEXT_PROPS.has('pit-board'));
  assert.deepEqual(warningsFor([prop('banner', 400, { text: 'Äpple Oil' }), prop('pit-board', 600, { text: 'P1' })]), []);
  assert.ok(warningsFor([prop('banner', 400, { text: 'X'.repeat(BANNER_MAX + 1) })]).some((text) => /longer than/.test(text)));
  assert.ok(warningsFor([prop('pit-board', 400, { text: 'LAP 12' })]).some((text) => /longer than/.test(text)));
  assert.ok(warningsFor([prop('banner', 400, { text: 'Ø' })]).some((text) => /cannot draw/.test(text)));
}

// A blank banner shows a sponsor picked by its position; a sponsor's name
// shows that sponsor; anything else goes on a plain banner. Wider text, wider cloth.
{
  assert.equal(bannerStyle('', 0), BANNER_BRANDS[0]);
  assert.equal(bannerStyle('', 0.999), BANNER_BRANDS[BANNER_BRANDS.length - 1]);
  assert.equal(bannerStyle('äpple oil').name, 'APPLE OIL');
  assert.equal(bannerStyle('äpple oil').umlaut, 0, 'the Ä is drawn over the first letter');
  const plain = bannerStyle('go go go');
  assert.equal(plain.name, 'GO GO GO');
  assert.equal(plain.icon, null);
  assert.equal(bannerStyle('x'.repeat(40)).name.length, BANNER_MAX);
  assert.ok(bannerLayout(bannerStyle('HJULBEN RACING')).half > bannerLayout(plain).half);
  for (const brand of BANNER_BRANDS) assert.equal(bannerLayout(brand).half % 2, 0, 'the cloth stays on the art grid');
}

// A pit board shows its own text, or a position P1–P9.
{
  assert.equal(pitBoardText('12'), '12');
  assert.equal(pitBoardText(' lap3 '), 'LAP3');
  assert.match(pitBoardText('', 0), /^P[1-9]$/);
  assert.match(pitBoardText('', 0.9999), /^P[1-9]$/);
}

// Spectators cheer while the rider is near, duck from a crash nearby, then wince.
{
  const scene = { time: 2, riderX: null, riderY: null };
  assert.equal(spectatorMood(scene, 500, 300), 'idle');
  assert.equal(spectatorMood({ ...scene, riderX: 560, riderY: 280 }, 500, 300), 'cheer');
  assert.equal(spectatorMood({ ...scene, riderX: 500 + SPECTATOR_CHEER.x + 1, riderY: 300 }, 500, 300), 'idle');
  const crash = { x: 540, y: 300, age: 0.2 };
  assert.equal(spectatorMood({ ...scene, riderX: 540, riderY: 300, crash }, 500, 300), 'duck');
  assert.equal(spectatorMood({ ...scene, crash: { ...crash, age: CRASH_DUCK.time + 0.1 } }, 500, 300), 'wince');
  assert.equal(spectatorMood({ ...scene, crash: { ...crash, x: 500 + CRASH_DUCK.x + 1 } }, 500, 300), 'idle', 'a crash far off');
  // The marshals and the camera operator react to a crash the same way.
  assert.equal(crashMood(scene, 500, 300), null, 'no crash');
  assert.equal(crashMood({ ...scene, crash }, 500, 300), 'duck');
  assert.equal(crashMood({ ...scene, crash: { ...crash, y: 300 + CRASH_DUCK.y + 1 } }, 500, 300), null, 'a crash far below');
  assert.equal(spectatorHop(0, 1, 0.3), 0, 'still at time 0');
  const hops = Array.from({ length: 40 }, (_, i) => spectatorHop(0.05 + i * 0.05, 0, 0));
  assert.ok(hops.some((hop) => hop < 0) && hops.every((hop) => hop <= 0 && hop % 2 === 0), 'they jump on the art grid');
}

// Each spectator turns their head to the rider from where they stand, and
// looks up at a rider overhead; a rider far off to the side is looked at
// sideways, even from the top of the camera tower. Mirrored, left is right.
{
  const eyes = (sx) => ({ x: sx, y: PERSON_EYES });
  const scene = { time: 1, riderX: 500, riderY: 280 };
  assert.deepEqual(riderGaze(scene, 500, 300, false, eyes(0)), { x: 0, y: 0 }, 'straight out at a rider in front');
  assert.equal(riderGaze({ ...scene, riderX: 430 }, 500, 300, false, eyes(-22)).x, 0, 'the near one still looks out');
  assert.equal(riderGaze({ ...scene, riderX: 430 }, 500, 300, false, eyes(22)).x, -1, 'the far one turns');
  assert.deepEqual(riderGaze({ ...scene, riderY: 100 }, 500, 300, false, eyes(0)), { x: 0, y: -1 }, 'up at a jump overhead');
  assert.deepEqual(riderGaze({ ...scene, riderX: 900 }, 500, 300, true, eyes(0)), { x: -1, y: 0 }, 'mirrored');
  const tower = (riderX, riderY) => riderGaze({ riderX, riderY }, 500, 300, false, CAMERA_EYE);
  assert.deepEqual(tower(560, 290), { x: 0, y: 1 }, 'down at the foot of the tower');
  assert.deepEqual(tower(1100, 290), { x: 1, y: 0 }, 'sideways when far off');
}

// Marshals wave while the rider is near, and hold the flag up still at time 0.
{
  assert.deepEqual(marshalFlag({ time: 3, riderX: null, riderY: null }, 500, 300), { hold: 'rest', fly: 0 });
  assert.deepEqual(marshalFlag({ time: 3, riderX: 500 + MARSHAL_WAVE.x + 1, riderY: 300 }, 500, 300), { hold: 'rest', fly: 0 });
  assert.equal(marshalFlag({ time: 0, riderX: 520, riderY: 300 }, 500, 300).hold, 'up');
  const holds = new Set(Array.from({ length: 60 }, (_, i) => marshalFlag({ time: i * 0.03, riderX: 520, riderY: 300 }, 500, 300).hold));
  assert.ok(holds.has('left') && holds.has('right') && holds.has('up'), 'the flag swings to and fro');
}

// The tape sags between its stakes and flutters only when time runs.
{
  assert.equal(tapeDroop(0, 0, 1, 0), 0, 'tied at the stakes');
  assert.equal(tapeDroop(1, 3, 1, 0.4).toFixed(6), '0.000000');
  assert.ok(tapeDroop(0.5, 0, 0, 0) > 0, 'it sags in the middle');
  assert.notEqual(tapeDroop(0.5, 1, 0.5, 0), tapeDroop(0.5, 1.2, 0.5, 0), 'it flutters');
  assert.deepEqual(tapeTail(0, 0.5, 0.2, -1), tapeTail(0, 0.5, 0.2, -1));
  assert.ok(tapeTail(1, 0.5, 0.2, -1).every(([dx]) => dx < 0), 'the loose end blows downwind');
  assert.ok(tapeTail(1, 0.5, 0.2, 1).every(([dx]) => dx > 0));
  const calm = tapeTail(0, 0, 0, -1).at(-1), gale = tapeTail(0, 1, 0, -1).at(-1);
  assert.ok(gale[1] < calm[1] && gale[0] < calm[0], 'a gale lifts it out straight');
}

// A banner's cloth ripples on the art grid, harder in a gale, but not at its
// tied ends or at time 0; its runs cover the cloth end to end.
{
  const half = bannerLayout(BANNER_BRANDS[2]).half;
  const lifts = (time, wind) => Array.from({ length: half }, (_, i) => bannerRipple(time, wind, -1, 0.3, -half + i * 2, half));
  assert.ok(lifts(0, 1).every((lift) => lift === 0), 'still at time 0');
  assert.equal(bannerRipple(2.3, 1, -1, 0.3, -half, half), 0, 'tied at the end');
  const moved = (wind) => Array.from({ length: 40 }, (_, t) => lifts(0.5 + t * 0.2, wind).filter((lift) => lift !== 0).length).reduce((a, b) => a + b);
  assert.ok(moved(1) > moved(0.25) && moved(0.25) > 0, 'it ripples in a breeze, more of it in a gale');
  assert.ok(lifts(2.3, 1).every((lift) => lift % 2 === 0 && Math.abs(lift) <= 2), 'on the art grid, a pixel at most');
  const runs = bannerRuns(half, (cx) => bannerRipple(2.3, 1, -1, 0.3, cx, half));
  assert.equal(runs[0].from, -half);
  assert.equal(runs.at(-1).to, half);
  runs.slice(1).forEach((run, index) => assert.ok(run.from === runs[index].to && run.lift !== runs[index].lift, 'runs meet and differ'));
}

// The halfway flag's split reads like the HUD timer, and its flash fades.
{
  assert.equal(splitText(23.47), '0:23.4');
  assert.equal(splitText(83.05), '1:23.0');
  assert.equal(splitText(undefined), '-:--.-');
  assert.equal(halfwayFlash(-1), null);
  assert.equal(halfwayFlash(HALFWAY_FLASH), null);
  const early = halfwayFlash(0.05), late = halfwayFlash(HALFWAY_FLASH * 0.9);
  assert.ok(early.alpha > late.alpha && early.radius < late.radius, 'the ring spreads as it fades');
}

console.log('Event props: all checks passed.');
