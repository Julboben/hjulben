// Smoke tests for the trail-building tools: scripts/playtest.mjs solves,
// probes and checks a trail, and scripts/render-trail.mjs draws it. They run
// the scripts as an author would, on small inline trails, so a change to the
// physics, the bot or the renderer that breaks them is caught here. The
// render test needs Chrome and is skipped without it, like the console test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRide, stepRide } from '../js/ride.js';
import { decodeInputs } from '../js/replay-codec.js';
import { normalizeTrail } from '../js/trail-schema.js';
import { chromePath } from './lib/chrome.mjs';
import { playtestRunPath, repoRoot } from './lib/trails.mjs';
import { polygonBlock, rectangle } from './lib/terrain-fixtures.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'hjulben-playtest-'));
// The id the scripts give the fixture, from its file name; its saved run goes in .playtest/.
const ID = 'test-playtest-fixture';
const file = path.join(dir, `${ID}.json`);
const run = (script, ...args) => execFileSync(process.execPath, [`scripts/${script}`, file, ...args], {
  cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
});
// A second fixture, with its own saved run, for traps.
const PIT_ID = 'test-playtest-pit';
const pitFile = path.join(dir, `${PIT_ID}.json`);
const runPit = (...args) => execFileSync(process.execPath, ['scripts/playtest.mjs', pitFile, ...args], {
  cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
});

// A flat field between two walls. The apple is ahead of the start and the
// finish behind it, so the trail can only be finished by turning around.
const trail = {
  name: 'Playtest fixture',
  terrainBlocks: [
    rectangle(-300, 320, 2300, 700, 'grass', 'ground'),
    rectangle(-300, 0, 0, 700, 'grass', 'west-wall'),
    rectangle(2000, 0, 2300, 700, 'grass', 'east-wall'),
  ],
  start: { x: 400, y: null, facing: 1 },
  finish: { x: 150, y: 270 },
  apples: [{ x: 900, y: null }],
  props: [{ x: 700, y: null, type: 'tree', layer: 'back' }, { x: 1100, y: null, type: 'bush', layer: 'front' }],
  spikes: [],
};
writeFileSync(file, JSON.stringify(trail));

try {
  // --check validates and surveys without solving.
  const check = run('playtest.mjs', '--check');
  assert.match(check, /Validation: ok/);
  assert.match(check, /1: 900,\d+, 60 above the surface below it/, 'apples are listed with their height');
  assert.doesNotMatch(check, /Solving/, '--check does not solve');
  assert.match(check, /Size: 3 blocks \(0 back walls\), \d+ KB of JSON; the largest official or bonus trail has \d+ blocks/, 'the size is weighed against the shipped trails');

  // An overlong description is cut off when a trail loads, so it is reported.
  writeFileSync(file, JSON.stringify({ ...trail, description: 'x'.repeat(2100) }));
  assert.match(run('playtest.mjs', '--check'), /WARNING: The description is 2100 characters/);

  // The same warning about several blocks is one line, listing them.
  writeFileSync(file, JSON.stringify({ ...trail, terrainBlocks: [
    ...trail.terrainBlocks, rectangle(500, 400, 540, 410, 'grass', 'patch-a'), rectangle(600, 400, 640, 410, 'grass', 'patch-b'),
  ] }));
  const grouped = run('playtest.mjs', '--check');
  assert.match(grouped, /WARNING x2: Block N is buried inside terrain of the same material \(grass\).* \(blocks 4, 5\)/, 'repeated warnings are grouped');
  assert.doesNotMatch(grouped, /WARNING: Block 4/, 'and not listed one by one');
  writeFileSync(file, JSON.stringify(trail));

  // The bot solves the trail one apple at a time, turning around on the way back.
  const solved = run('playtest.mjs', '--fresh', '--minutes', '0.5', '--trials', '2');
  assert.match(solved, /Stretch 1: .* to apple 1 at 900,\d+ in [\d.]+ s/);
  assert.match(solved, /Stretch 2: .* to the finish at 150,248 in [\d.]+ s/);
  assert.match(solved, /turns [1-9]/, 'the way back takes a turn');
  assert.match(solved, /forgiveness: \d+% of reruns/);
  assert.match(solved, /Result: the bot finished in [\d.]+ s/);
  assert.doesNotMatch(solved, /ESCAPE/, 'walls the bike can\'t get over close the trail');
  const saved = JSON.parse(readFileSync(playtestRunPath(ID), 'utf8'));
  assert.equal(saved.stretches.length, 2, 'the run is saved stretch by stretch');
  assert.ok(saved.inputs, 'a finished run is saved whole as well');
  // The bot can overshoot an apple; the saved run must still ride as the
  // stretches were solved, from the start without a stop.
  const replay = createRide(normalizeTrail(trail));
  for (const input of decodeInputs(saved.inputs)) if (replay.status === 'running') stepRide(replay, input);
  assert.equal(replay.status, 'won', 'the saved run replays to the finish');
  assert.match(run('playtest.mjs', '--trials', '0'), /saved run from the last playtest/, 'the saved run is tried first');
  assert.match(solved, /Medals: at most gold \d+, silver \d+, bronze \d+/, 'medals are suggested from the bot\'s time');
  writeFileSync(file, JSON.stringify({ ...trail, medals: { gold: 999, silver: 1000, bronze: 1001 } }));
  assert.match(run('playtest.mjs', '--trials', '0'), /gold of 999 s is more than 5% over the bot's time/, 'a gold that is too easy is flagged');
  writeFileSync(file, JSON.stringify(trail));

  // Without turning around, the finish behind the start can't be reached.
  const unturned = run('playtest.mjs', '--fresh', '--without', 'turn', '--minutes', '0.05', '--trials', '0');
  assert.match(unturned, /Stretch 2: FAILED to reach the finish/);
  assert.match(unturned, /Result: NOT finished; the bot took 1 of 1 apples/);

  // A jump over a deep pit with a floor: a rider who misses lands on the floor,
  // can't climb out and doesn't crash, which is a trap. The far side is a
  // slope too steep to climb rather than a sheer wall, so a jump that falls
  // short slides down it onto the floor instead of hitting it head first.
  // Spikes on the floor make the same miss end the run, so it isn't.
  const pit = {
    ...trail,
    terrainBlocks: [
      rectangle(-300, 0, 0, 900, 'grass', 'west-wall'),
      polygonBlock([[-300, 300], [520, 300], [600, 270], [600, 900], [-300, 900]], 'grass', 'takeoff'),
      rectangle(600, 560, 880, 900, 'stone', 'pit-floor'),
      polygonBlock([[880, 560], [940, 300], [1800, 300], [1800, 900], [880, 900]], 'grass', 'landing'),
      rectangle(1800, 0, 2100, 900, 'grass', 'east-wall'),
    ],
    start: { x: 100, y: null, facing: 1 },
    finish: { x: 1500, y: 250 },
    apples: [{ x: 1100, y: null }],
    props: [],
  };
  writeFileSync(pitFile, JSON.stringify(pit));
  const trapped = runPit('--fresh', '--minutes', '0.5');
  assert.match(trapped, /TRAPS: a miss leaves the rider at \d+,5\d\d, with no way back/, 'a pit a miss can\'t leave is a trap');
  assert.match(trapped, /^TRAPS: 1 place/m, 'and it is summed up at the end');
  writeFileSync(pitFile, JSON.stringify({ ...pit, spikes: [640, 700, 760, 820, 880].map(x => ({ x, y: 540, radius: 20 })) }));
  assert.doesNotMatch(runPit('--fresh', '--minutes', '0.5'), /TRAP/, 'spikes on its floor make it a crash, not a trap');

  // An end closed by a gentle ramp onto the ground beyond it can be ridden
  // out of: the rider escapes the trail.
  const ramp = {
    ...trail,
    terrainBlocks: [
      rectangle(-300, 0, 0, 700, 'grass', 'west-wall'),
      polygonBlock([[-300, 320], [2000, 320], [2400, 220], [3600, 220], [3600, 700], [-300, 700]], 'grass', 'ground'),
    ],
  };
  writeFileSync(pitFile, JSON.stringify(ramp));
  assert.match(runPit('--fresh', '--minutes', '0.5', '--trials', '1'), /ESCAPE: the rider can ride out past the east end/, 'a ramp out of the trail is an escape');
  // With a nisse hidden out there, the open end is the way to it, not a fault.
  writeFileSync(pitFile, JSON.stringify({ ...ramp, nisse: { x: 3200, y: null } }));
  const hidden = runPit('--minutes', '0.5', '--trials', '1');
  assert.match(hidden, /OPEN END: the rider can ride out past the east end.*to the nisse hidden out there/, 'an end opening onto the nisse is reported as a choice');
  assert.doesNotMatch(hidden, /ESCAPE/, 'and not as an escape');
  // A roof over the walled field runs out past both walls. Its top is the
  // topmost ground at either end, but the rider is inside, below it.
  writeFileSync(pitFile, JSON.stringify({
    ...trail,
    terrainBlocks: [...trail.terrainBlocks, rectangle(-300, -100, 2300, -50, 'stone', 'roof')],
    start: { x: 400, y: 308, facing: 1 },
    apples: [{ x: 900, y: 260 }],
  }));
  assert.doesNotMatch(runPit('--fresh', '--minutes', '0.5', '--trials', '1'), /ESCAPE|OPEN END/, 'the ground above a roof is no way out');

  // A scripted probe prints a trace and rides where the script says.
  const scripted = run('playtest.mjs', '--probe', '400,ground,1,0', '--script', 'gas 0.5; gas fwd 0.1; gas 0.5; turn; brake 0.3', '--every', '0.5');
  assert.match(scripted, /Probe: bike at 400,\d+, facing right/);
  assert.match(scripted, /^\s+0\.50\s+\d+/m, 'trace lines every --every seconds');
  const [, endX, status] = /End: (\d+),\d+, (\w+)\./.exec(scripted);
  assert.ok(Number(endX) > 450, 'gas moves the bike ahead');
  assert.equal(status, 'running');

  // A probe with a goal lets the bot find its own way and prints its inputs as a script.
  const goal = run('playtest.mjs', '--probe', '400,ground,-1,0', '--goal', 'reach:1200,290', '--minutes', '0.5', '--trials', '0');
  assert.match(goal, /Reached 1200,290 in [\d.]+ s/);
  assert.match(goal, /inputs, in the --script format: .*turn/, 'facing left, the bot turns to reach a place to the right');

  if (!chromePath) console.log('Playtest tests passed; render tests skipped: Chrome not found (set CHROME_PATH).');
  else {
    const out = path.join(dir, 'renders') + '/';
    const isPng = name => readFileSync(out + name).subarray(1, 4).toString() === 'PNG';
    const rendered = execFileSync(process.execPath, ['scripts/render-trail.mjs', file, '--out', out], { cwd: repoRoot, encoding: 'utf8' });
    assert.match(rendered, /Route from the last playtest \([\d.]+ s, finished\)/, 'the saved run is drawn');
    const images = readdirSync(out).sort();
    assert.ok(images.includes('overview.png'));
    assert.ok(images.some(name => /^section-01_x-?\d+--?\d+\.png$/.test(name)), 'section names hold their x range');
    assert.ok(images.every(isPng));
    execFileSync(process.execPath, ['scripts/render-trail.mjs', file, '--out', out, '--view', '300,0,880,500', '--props', '--route'], { cwd: repoRoot });
    assert.ok(existsSync(out + 'view-300_0_880x500.png') && isPng('view-300_0_880x500.png'), '--view draws one view');
    // --camera frames the route as the game's camera does, every few seconds.
    const framed = execFileSync(process.execPath, ['scripts/render-trail.mjs', file, '--out', out, '--camera', '--camera-every', '1'], { cwd: repoRoot, encoding: 'utf8' });
    const frames = readdirSync(out).filter(name => /^camera-\d\d_t\d+s\.png$/.test(name));
    assert.ok(frames.length >= 3 && frames.every(isPng), `--camera draws a frame a second (${frames.length})`);
    assert.match(framed, /camera-01_t0s\.png: x -?\d+ to -?\d+, y -?\d+ to -?\d+;.*\bstart\b/, 'the first frame shows the start');
    assert.ok(images.includes('overview.png') && readdirSync(out).includes('overview.png'), 'and leaves the other images alone');
    console.log('Playtest and render tests passed.');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(playtestRunPath(ID), { force: true });
  rmSync(playtestRunPath(PIT_ID), { force: true });
  rmSync(playtestRunPath(ID, '.without-turn'), { force: true });
}
