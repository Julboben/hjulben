// The rewind's recorder (js/rewind.js): every moment of a run it rides again
// from its copies must be the moment as it was, before a crash, through it
// and after, and a long run must keep few copies and stay exact.
//
//   node scripts/test-rewind.mjs
import { createRide, stepRide } from '../js/ride.js';
import { createRewindRecorder, rewindStep } from '../js/rewind.js';
import { loadCatalogTrails } from './lib/trails.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
  else console.log('ok  ', label);
};

const { trail } = loadCatalogTrails('official').find(entry => entry.id === 'official:the-orchard');
const SEED = 7;

/** Where everything that moves is: the wheels, the bike and the thrown rider. */
const pose = ride => JSON.stringify([
  ride.rear.x, ride.rear.y, ride.front.x, ride.front.y, ride.facing, ride.collected, ride.status,
  ride.ragdoll && Object.values(ride.ragdoll.points).map(point => [point.x, point.y]),
]);

/**
 * Rides `inputs`, keeping the run with a recorder, and the pose at each of
 * `moments` (steps) from the ride itself.
 */
function ride(inputs, moments) {
  const live = createRide(trail, { seed: SEED });
  const recorder = createRewindRecorder();
  recorder.start(live, SEED);
  const poses = new Map();
  if (moments.has(0)) poses.set(0, pose(live));
  inputs.forEach((input, index) => {
    stepRide(live, input);
    recorder.note(live, input);
    if (moments.has(index + 1)) poses.set(index + 1, pose(live));
  });
  return { recorder, poses, live };
}

// Gas, then gas and leaning back until the bike loops over and throws the
// rider, who tumbles on: a run with a crash in it.
const crashing = [];
{
  const probe = createRide(trail, { seed: SEED });
  for (let step = 0; step < 1800 && !(probe.ragdoll && step > 600); step++) {
    const input = probe.ragdoll ? { facing: probe.facing } : { facing: probe.facing, accelerating: true, leanInput: step > 190 ? -1 : 0 };
    crashing.push(input);
    stepRide(probe, input);
  }
  // A second on, the rider still tumbling.
  for (let step = 0; step < 120; step++) crashing.push({ facing: probe.facing });
}
const crashAt = (() => {
  const probe = createRide(trail, { seed: SEED });
  return crashing.findIndex(input => { stepRide(probe, input); return Boolean(probe.ragdoll); }) + 1;
})();
check('the scripted run crashes', crashAt > 0, `crash at step ${crashAt}`);

const moments = new Set([0, 1, 59, 60, 61, 150, crashAt - 1, crashAt, crashAt + 1, crashAt + 37, crashing.length]);
const run = ride(crashing, moments);
const wrong = [...moments].filter(step => pose(run.recorder.at(step)) !== run.poses.get(step));
check('every moment of a run with a crash comes back as it was', !wrong.length, `wrong at steps ${wrong.join(', ')}`);
check('and going back to one leaves the ride itself alone', pose(run.live) === run.poses.get(crashing.length));

// Ten minutes of standing at the line: far more copies than are kept.
const standing = Array.from({ length: 72_000 }, () => ({ facing: 1 }));
const longMoments = new Set([0, 1234, 36_001, 71_999, 72_000]);
const long = ride(standing, longMoments);
check('a long run keeps few copies', long.recorder.copies <= 256, `${long.recorder.copies} copies`);
const longWrong = [...longMoments].filter(step => pose(long.recorder.at(step)) !== long.poses.get(step));
check('and still comes back exactly', !longWrong.length, `wrong at steps ${longWrong.join(', ')}`);

const steps = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(t => rewindStep(200, 1000, t));
check('a rewind runs from the end of the run back to where it set off', steps[0] === 1000 && steps.at(-1) === 200 && steps.every((step, index) => !index || step <= steps[index - 1]), steps.join(' '));

// Waiting at the line, then riding: the riding starts where the bike set off.
{
  const waiting = [...Array.from({ length: 300 }, () => ({ facing: 1 })), ...Array.from({ length: 120 }, () => ({ facing: 1, accelerating: true }))];
  const { recorder } = ride(waiting, new Set());
  check('the riding starts where the bike set off, not at the wait', recorder.setOff === 300, `set off at step ${recorder.setOff}`);
}

if (failures) {
  console.error(`Rewind test failed: ${failures} check${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Rewind test passed.');
