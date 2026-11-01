// Playtests a trail from the command line with the replay bot, so a trail can
// be tried while it's being built, by a person or an AI that can't ride it.
//
//   node scripts/playtest.mjs trails/custom/my-trail.json   check, then solve one apple at a time
//   node scripts/playtest.mjs 12                             a catalog trail whose id or file name contains "12"
//   node scripts/playtest.mjs <trail> --check                validation and a survey only, instantly
//   node scripts/playtest.mjs <trail> --without turn         solve without turning around (see SKILLS)
//   node scripts/playtest.mjs <trail> --probe 1200,ground,1,300 --script "gas 1; gas fwd 0.4; coast 1"
//   node scripts/playtest.mjs <trail> --probe 1200,ground,1,300 --goal apple:3
//
// Options:
//   --order 2,1,3    the order to take the apples in (default: the bot's choice, nearest first)
//   --minutes N      search budget per stretch, in minutes (default 2)
//   --trials N       jittered reruns per second of riding for the forgiveness score (default 6; 0 skips it)
//   --fresh          ignore the runs saved from the last playtest
//   --json FILE      also write the whole report as JSON
//   --every S        seconds between trace lines in --script mode (default 0.1)
//
// The trail is solved in stretches: from the start to whichever apple the bot
// takes first, from there to the next, and so on to the finish. Each stretch
// gets its own search, so long trails stay solvable, and a stretch the bot
// can't solve is reported with how close it got. Every solved stretch is
// ridden again with its input timing jittered, as a rough measure of how
// forgiving the line is: the bot rides with perfect timing, people don't.
// Those reruns, and each jump's run-up ridden again too slowly, also find
// traps: places where a miss leaves the rider with no way back to the line
// and no crash, so a player can only restart by hand. Last, it looks for
// escapes: an end of the trail the rider can ride out of.
//
// Runs are saved in .playtest/ and tried first next time, so after a small
// edit only the stretches it broke are searched again. Progress goes to
// stderr and the report to stdout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RADIUS, STEP, WHEELBASE } from '../js/config.js';
import { bikeSpeed, createRide, seededRandom, stepRide } from '../js/ride.js';
import { decodeInputs, encodeInputs } from '../js/replay-codec.js';
import { DESCRIPTION_MAX_LENGTH, normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { terrainAt } from '../js/terrain.js';
import { hangsBelowWheel } from '../js/vehicle-physics.js';
import { cloneRide, exploreTrail, recordTrail } from './lib/replay-bot.mjs';
import { MAX_JSON_BYTES } from '../js/trail-link.js';
import { trailHash } from '../js/trail-hash.js';
import { loadCatalogTrails, loadTrailArgument, playtestRunPath, repoRoot } from './lib/trails.mjs';

// The bot reports its progress with console.log; keep stdout for the report.
console.log = (...args) => console.error(...args);
const out = (text = '') => process.stdout.write(text + '\n');

const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const VALUED = ['--minutes', '--trials', '--json', '--every', '--probe', '--script', '--goal', '--without', '--order'];
const target = args.find((arg, index) => !arg.startsWith('--') && !VALUED.includes(args[index - 1]));
const MINUTES = Number(option('--minutes')) || 2;
const TRIALS = Number(option('--trials') ?? 6);
// The forgiveness score nudges input timing by up to JITTER steps, in one WINDOW of seconds at a time.
const JITTER = 6;
const WINDOW = 1;
const EVERY = Number(option('--every')) || 0.1;

if (!target) {
  out('Usage: node scripts/playtest.mjs <trail file or catalog id> [--check] [--without SKILL] [--probe X,Y,FACING,SPEED --script "..." | --goal GOAL]');
  out('See the comment at the top of scripts/playtest.mjs for every option.');
  process.exit(1);
}

// Skills a trail can be solved without: each rule changes an input before it is ridden.
const SKILLS = {
  turn: (ride, input) => ({ ...input, facing: ride.facing }),
  'air-turn': (ride, input) => airborne(ride) ? { ...input, facing: ride.facing } : input,
  'lean-back': (ride, input) => input.leanInput * (input.facing || ride.facing) < 0 ? { ...input, leanInput: 0 } : input,
  'lean-forward': (ride, input) => input.leanInput * (input.facing || ride.facing) > 0 ? { ...input, leanInput: 0 } : input,
  brake: (_ride, input) => ({ ...input, braking: false }),
};
const without = (option('--without') || '').split(',').filter(Boolean);
for (const skill of without) if (!SKILLS[skill]) throw new Error(`unknown skill "${skill}"; use ${Object.keys(SKILLS).join(', ')}`);
const constrain = without.length ? (ride, input) => without.reduce((next, skill) => SKILLS[skill](ride, next), input) : null;

const airborne = ride => !ride.rear.grounded && !ride.front.grounded;
const mid = ride => ({ x: (ride.rear.x + ride.front.x) / 2, y: (ride.rear.y + ride.front.y) / 2 });
const at = point => `${Math.round(point.x)},${Math.round(point.y)}`;

// An apple taken on the way into a crash is no place to ride on from, so a
// stretch only ends at one if some input keeps the rider up for a moment after.
const SURVIVE_STEPS = Math.round(.5 / STEP);
const SURVIVE_INPUTS = [{}, { accelerating: true }, { braking: true }, { leanInput: -1 }, { leanInput: 1 }];
const survives = ride => ride.status !== 'crashed' && SURVIVE_INPUTS.some(input => {
  const probe = cloneRide(ride);
  for (let step = 0; step < SURVIVE_STEPS && probe.status === 'running'; step++) stepRide(probe, { facing: probe.facing, ...input });
  return probe.status !== 'crashed';
});
const seconds = steps => (steps * STEP).toFixed(2);

const entry = loadTrailArgument(target);
// Normalizing cuts an overlong description, so it's measured before.
const descriptionLength = typeof entry.trail.description === 'string' ? entry.trail.description.length : 0;
entry.trail = normalizeTrail(entry.trail);
const { trail } = entry;
const report = { trail: entry.id, file: entry.file, without };

// --- Validation and survey ---------------------------------------------------

/**
 * How heavy the trail is, next to the largest shipped trails, so detail can
 * be weighed (rule 14 in TRAILS_GUIDE.md): every block makes a trail larger
 * to load, share and edit.
 */
function describeSize() {
  const size = data => ({ blocks: (data.terrainBlocks || []).length, bytes: JSON.stringify(data).length });
  const own = size(entry.trail);
  const back = (entry.trail.terrainBlocks || []).filter(block => block.layer === 'back').length;
  const shipped = [...loadCatalogTrails('official'), ...loadCatalogTrails('bonus')].map(other => size(other.trail));
  const most = shipped.reduce((top, other) => ({ blocks: Math.max(top.blocks, other.blocks), bytes: Math.max(top.bytes, other.bytes) }), { blocks: 0, bytes: 0 });
  const kb = bytes => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
  let text = `Size: ${own.blocks} blocks (${back} back walls), ${kb(own.bytes)} of JSON; the largest official or bonus trail has ${most.blocks} blocks and ${kb(most.bytes)}.`;
  if (own.bytes > MAX_JSON_BYTES) text += ' Too large to share as a link, which holds at most 1 MiB: keep detail to where the camera is.';
  return text;
}

/**
 * Validation messages as lines, the same message about several items of one
 * kind (blocks, apples...) on one line with the items listed: a trail with
 * hundreds of identical warnings would otherwise bury everything after them.
 */
function groupMessages(messages) {
  const groups = new Map();
  for (const { type, text } of messages) {
    const item = /^(\w+) (\d+)\b/.exec(text);
    const key = `${type}\n${item ? text.replace(item[0], `${item[1]} N`) : text}`;
    if (!groups.has(key)) groups.set(key, { type, text, kind: item?.[1], numbers: [] });
    if (item) groups.get(key).numbers.push(item[2]);
  }
  return [...groups.values()].map(({ type, text, kind, numbers }) => {
    if (numbers.length < 2) return `${type.toUpperCase()}: ${text}`;
    const shown = numbers.slice(0, 30).join(', ') + (numbers.length > 30 ? ` and ${numbers.length - 30} more` : '');
    return `${type.toUpperCase()} x${numbers.length}: ${text.replace(`${kind} ${numbers[0]}`, `${kind} N`)} (${kind.toLowerCase()}s ${shown})`;
  });
}

function survey() {
  const messages = validateTrail(trail).filter(message => message.type !== 'ok');
  if (descriptionLength > DESCRIPTION_MAX_LENGTH) {
    messages.push({ type: 'warning', text: `The description is ${descriptionLength} characters, and everything past ${DESCRIPTION_MAX_LENGTH} is cut off when the trail loads. Shorten it.` });
  }
  report.validation = messages.map(({ type, text }) => ({ type, text }));
  out(`Trail: ${trail.name} (${entry.file.replace(repoRoot, '')})`);
  if (!messages.length) out('Validation: ok');
  for (const line of groupMessages(messages)) out(`  ${line}`);
  const ride = createRide(trail);
  const xs = [], ys = [];
  for (const block of trail.terrainBlocks) {
    if (block.layer === 'back') continue;
    for (const node of block.outer.nodes) { xs.push(node.x); ys.push(node.y); }
  }
  const facing = trail.start.facing < 0 ? 'left' : 'right';
  const round = Math.round;
  out(`Terrain: x ${round(Math.min(...xs))} to ${round(Math.max(...xs))}, y ${round(Math.min(...ys))} to ${round(Math.max(...ys))} (smaller y is higher)`);
  out(describeSize());
  out(`Start: ${at(mid(ride))} facing ${facing}. Finish flower: ${at(ride.flower)}`);
  out(`Apples (${ride.apples.length}):`);
  ride.apples.forEach((apple, index) => {
    const ground = terrainAt(trail, apple.x, apple.y);
    const above = ground && Number.isFinite(ground.y) ? Math.round(ground.y - apple.y) : null;
    out(`  ${index + 1}: ${at(apple)}${above === null ? ', nothing below' : `, ${above} above the surface below it`}`);
  });
  const extras = [
    ride.spikes.length && `${ride.spikes.length} spikes`,
    ride.water.length && `${ride.water.length} water bodies`,
    ride.nisse && `a nisse at ${at(ride.nisse)}`,
  ].filter(Boolean);
  if (extras.length) out(`Also: ${extras.join(', ')}`);
  report.apples = ride.apples.map(({ x, y }) => ({ x, y }));
  return messages.some(message => message.type === 'error');
}

// --- Riding inputs and measuring what happens ------------------------------

const describeInput = input => {
  const half = Math.abs(input.leanInput) < 1 ? ' half' : '';
  const lean = !input.leanInput ? '' : half + (input.leanInput * input.facing > 0 ? ' fwd' : ' back');
  return (input.accelerating ? 'gas' : input.braking ? 'brake' : 'coast') + lean;
};

/**
 * Rides `inputs` from a copy of `start` until `done`, a crash, or the inputs
 * run out, and measures the ride: jumps, flips, turns, hanging and so on.
 */
function measure(start, inputs, done) {
  const ride = cloneRide(start);
  const stats = {
    steps: 0, reached: false, status: 'running', crash: null, apples: [], jumps: [], flips: 0, turns: 0, airTurns: 0,
    hangSteps: 0, hangs: [], topSpeed: 0, slowSteps: 0, hardestLanding: null, shattered: 0, splashes: 0, route: [], nisse: false
  };
  let jump = null, hang = null;
  const sampleEvery = Math.round(1 / STEP);
  for (const input of inputs) {
    if (input.facing && input.facing !== ride.facing) {
      stats.turns++;
      if (airborne(ride)) stats.airTurns++;
    }
    const events = stepRide(ride, input);
    stats.steps++;
    const point = mid(ride);
    if (stats.steps % sampleEvery === 0) stats.route.push({ x: Math.round(point.x), y: Math.round(point.y) });
    const speed = Math.abs(bikeSpeed(ride));
    stats.topSpeed = Math.max(stats.topSpeed, speed);
    if (!airborne(ride) && speed < 25) stats.slowSteps++;
    for (const event of events) {
      if (event.type === 'apple') stats.apples.push({ index: ride.apples.indexOf(event.apple), step: stats.steps });
      else if (event.type === 'flip') stats.flips += event.count;
      else if (event.type === 'shatter') stats.shattered++;
      else if (event.type === 'splash' && !event.rider) stats.splashes++;
      else if (event.type === 'nisse') stats.nisse = true;
      // The bike settling as it spawns isn't a landing.
      else if (event.type === 'land' && ride.time > .3 && (!stats.hardestLanding || event.impact > stats.hardestLanding.impact))
        stats.hardestLanding = { impact: Math.round(event.impact), x: Math.round(point.x), y: Math.round(point.y) };
      else if (event.type === 'crash') stats.crash = { cause: event.cause, x: Math.round(event.x), y: Math.round(event.y) };
    }
    if (airborne(ride)) {
      jump ||= { from: point, steps: 0, top: point.y };
      jump.steps++;
      jump.top = Math.min(jump.top, point.y);
    } else if (jump) {
      if (jump.steps * STEP >= .3) stats.jumps.push({ ...jump, to: point });
      jump = null;
    }
    if (ride.status === 'running' && hangsBelowWheel(ride.vehicle)) {
      stats.hangSteps++;
      hang ||= { at: point, steps: 0 };
      hang.steps++;
    } else if (hang) {
      if (hang.steps * STEP >= .2) stats.hangs.push(hang);
      hang = null;
    }
    if (done(ride)) { stats.reached = true; break; }
    if (ride.status !== 'running') break;
  }
  stats.status = ride.status;
  return { ride, stats };
}

function describeStats(stats) {
  const lines = [];
  const jumps = stats.jumps.slice().sort((a, b) => b.steps - a.steps);
  const longest = jumps[0];
  lines.push(`air: ${jumps.length} jumps of 0.3 s or more`
    + (longest ? `, longest ${seconds(longest.steps)} s from ${at(longest.from)} to ${at(longest.to)}, peaking ${Math.round(longest.from.y - longest.top)} above takeoff` : '')
    + `; flips ${stats.flips}; turns ${stats.turns} (${stats.airTurns} in the air)`);
  lines.push(`hanging from one wheel: ${seconds(stats.hangSteps)} s`
    + (stats.hangs.length ? ` (at ${stats.hangs.map(hang => at(hang.at)).join(', ')})` : '')
    + `; top speed ${Math.round(stats.topSpeed)}; crawling below 25 for ${seconds(stats.slowSteps)} s`
    + (stats.hardestLanding ? `; hardest landing ${stats.hardestLanding.impact} at ${stats.hardestLanding.x},${stats.hardestLanding.y}` : ''));
  const extras = [stats.shattered && `${stats.shattered} glass panes broken`, stats.splashes && `${stats.splashes} splashes`, stats.nisse && 'took the nisse'].filter(Boolean);
  if (extras.length) lines.push(extras.join('; '));
  if (stats.route.length) lines.push(`route, once a second: ${stats.route.map(at).join(' > ')}`);
  return lines;
}

// Runs of one input, so timing can be jittered where the input changes.
function runsOf(inputs) {
  const runs = [];
  for (const input of inputs) {
    const last = runs[runs.length - 1];
    if (last && JSON.stringify(last.input) === JSON.stringify(input)) last.count++;
    else runs.push({ input, count: 1 });
  }
  return runs;
}

/**
 * Rides a stretch again with the timing of one second of it nudged, the way a
 * person never quite matches the bot: for each second, `TRIALS` reruns move
 * every input change in it by up to JITTER steps either way. Returns the share
 * of reruns that still reach the goal, and for each second how many did and
 * where the others most often crashed or stalled. `line` holds the earlier
 * stretches' line, for traps, and gets this stretch's added to it.
 */
function forgiveness(start, inputs, done, seed, focus = null, line = []) {
  const random = seededRandom(seed);
  const window = Math.round(WINDOW / STEP);
  const runs = runsOf(inputs);
  const windows = [];
  const ride = cloneRide(start);
  // Where the stretch's own line runs, and where reruns stalled, for traps.
  const route = line;
  const stalls = [];
  // The run-up to each jump, where it is ridden again too slowly (see below).
  const runUps = new Map(jumpRunUps(start, inputs).map(step => [step, null]));
  for (let from = 0; from < inputs.length; from += window) {
    // Where each run starts, and so where the input changes, in steps from the window's start.
    const local = [];
    let offset = -from;
    for (const run of runs) {
      if (offset + run.count > 0) local.push({ ...run, offset });
      offset += run.count;
    }
    local[0].count += local[0].offset;
    local[0].offset = 0;
    let reached = 0;
    const failures = new Map();
    for (let trial = 0; trial < TRIALS; trial++) {
      const jittered = local.map(run => ({ ...run }));
      for (let index = 0; index + 1 < jittered.length && jittered[index + 1].offset < window; index++) {
        const shift = Math.round((random() * 2 - 1) * JITTER);
        const moved = Math.max(1 - jittered[index].count, Math.min(jittered[index + 1].count - 1, shift));
        jittered[index].count += moved;
        jittered[index + 1].count -= moved;
      }
      const rest = jittered.flatMap(run => Array(run.count).fill(run.input));
      // A little past the end, in case the jitter left the goal just ahead.
      rest.push(...Array(Math.round(1 / STEP)).fill(rest[rest.length - 1]));
      const { ride: after, stats } = measure(ride, rest, done);
      if (stats.reached) { reached++; continue; }
      if (!stats.crash) stalls.push(after);
      const where = stats.crash || { cause: 'stalled', ...mid(after) };
      const near = { cause: where.cause, x: Math.round(where.x / 50) * 50, y: Math.round(where.y / 50) * 50 };
      const key = `${near.cause} near ${near.x},${near.y}`;
      failures.set(key, { ...near, count: (failures.get(key)?.count || 0) + 1 });
    }
    const worst = [...failures].sort((a, b) => b[1].count - a[1].count)[0];
    windows.push({ at: mid(ride), reached, failure: worst?.[0] ?? null, failedAt: worst?.[1] ?? null });
    for (let step = from; step < Math.min(from + window, inputs.length); step++) {
      if (runUps.has(step)) runUps.set(step, cloneRide(ride));
      stepRide(ride, inputs[step]);
      if (step % 6 === 0) route.push(mid(ride));
    }
  }
  // Timing isn't the only way to miss: a player who comes in too slowly
  // falls short. Each jump's run-up is ridden again from a moment before
  // takeoff at a fraction of the speed, with the same inputs, and where that
  // leaves the rider is checked for a trap like any stalled rerun.
  for (const [step, before] of runUps) {
    for (const share of SLOW_RUN_UPS) {
      const slow = cloneRide(before);
      slowDown(slow, share);
      const rest = inputs.slice(step, step + Math.round(RUN_UP_RIDE / STEP));
      const { ride: after, stats } = measure(slow, rest, done);
      if (!stats.reached && !stats.crash) stalls.push(after);
    }
  }
  const reached = windows.reduce((sum, entry) => sum + entry.reached, 0);
  return { share: reached / (windows.length * TRIALS), windows, traps: findTraps(stalls, route, start, done, focus) };
}

// How fast the slow run-ups come in, as a share of the bot's speed; how long
// before takeoff they start; how long they are ridden; and the shortest time
// in the air that counts as a jump.
const SLOW_RUN_UPS = [0.6, 0.8];
const RUN_UP = Math.round(0.4 / STEP);
const RUN_UP_RIDE = 3;
const JUMP_AIR = Math.round(0.3 / STEP);
const MAX_RUN_UPS = 6;

/** The steps a moment before each jump of the run takes off, at most MAX_RUN_UPS. */
function jumpRunUps(start, inputs) {
  const ride = cloneRide(start);
  const takeoffs = [];
  let air = 0;
  inputs.forEach((input, step) => {
    stepRide(ride, input);
    if (airborne(ride)) air++;
    else {
      if (air >= JUMP_AIR) takeoffs.push(step - air);
      air = 0;
    }
  });
  return takeoffs.map(step => Math.max(0, step - RUN_UP)).slice(0, MAX_RUN_UPS);
}

/** Slows the bike to `share` of its speed, wheels' spin included. */
function slowDown(ride, share) {
  for (const point of ride.vehicle.bikePoints) {
    point.ox = point.x - (point.x - point.ox) * share;
    point.oy = point.y - (point.y - point.oy) * share;
    if (Number.isFinite(point.angularVelocity)) point.angularVelocity *= share;
  }
}

// Traps: a rerun that neither reaches the goal nor crashes may have left the
// rider where they can neither ride on nor crash, such as a pit between two
// buildings, and a player has to restart by hand. Each place reruns stalled
// at is ridden on, coasting, until the bike crashes or comes to rest; from a
// rest, the bot gets a short search to get back to any point of the line
// ridden so far, this stretch's or an earlier one's, ahead or behind, or to
// the goal. A place it can't get out of is a trap. A miss that drops the
// rider back onto an earlier stretch, such as off an upper row of islands
// onto the lower one, costs time but leaves the route ahead.
//
// If this still reports false alarms on new trails (a trap the render shows
// the rider can ride out of), make traps a warning the builder names in the
// handover rather than one it must fix, and drop the "Fix every TRAP" rule
// from CLAUDE.md and TRAIL_FORMAT.md.
const TRAP_SETTLE = Math.round(3 / STEP);
const TRAP_REST = Math.round(0.5 / STEP);
const TRAP_NEAR = 120;
const TRAP_CHECKS = 3;
const TRAP_MINUTES = 0.25;
const ROUTE_REACH = 30;

function findTraps(stalls, route, start, done, focus) {
  const onLine = ({ x, y }) => route.some(point => Math.abs(point.x - x) < ROUTE_REACH && Math.abs(point.y - y) < ROUTE_REACH);
  const rests = [];
  for (const stalled of stalls) {
    if (rests.length >= TRAP_CHECKS) break;
    const settled = cloneRide(stalled);
    let still = 0;
    for (let step = 0; step < TRAP_SETTLE && settled.status === 'running' && still < TRAP_REST; step++) {
      stepRide(settled, { facing: settled.facing });
      still = !airborne(settled) && Math.abs(bikeSpeed(settled)) < 25 ? still + 1 : 0;
    }
    if (settled.status !== 'running' || still < TRAP_REST) continue;
    const place = mid(settled);
    // Come to rest on the line itself: nothing to get out of.
    if (onLine(place)) continue;
    if (rests.some(rest => Math.hypot(rest.place.x - place.x, rest.place.y - place.y) < TRAP_NEAR)) continue;
    rests.push({ ride: settled, place });
  }
  const back = probe => done(probe) || onLine(mid(probe));
  return rests.filter(({ ride }) => {
    // The bot heads for the nearest apple not taken, so, as in solve, it
    // searches on a copy where only the stretch's apple is left.
    const from = cloneRide(ride);
    if (focus !== null) from.apples.forEach((apple, index) => { apple.taken = index !== focus; });
    if (recordTrail(entry, { start: from, done: back, minutes: TRAP_MINUTES * 0.4, constrain }).done) return false;
    return !exploreTrail(entry, [], { start: from, done: back, minutes: TRAP_MINUTES * 0.6, polish: false, constrain });
  }).map(({ place }) => ({ x: Math.round(place.x), y: Math.round(place.y) }));
}

function describeForgiveness({ share, windows, traps }) {
  const tight = windows.filter(entry => entry.reached <= TRIALS / 2).sort((a, b) => a.reached - b.reached).slice(0, 4);
  return `forgiveness: ${Math.round(share * 100)}% of reruns reach the goal with ${WINDOW} s of the timing off by up to ${Math.round(JITTER * STEP * 1000)} ms`
    + (tight.length ? `; tight spots: ${tight.map(entry => `from ${at(entry.at)} ${entry.reached}/${TRIALS} (${entry.failure})`).join(', ')}` : '')
    + (traps.length ? `\n  TRAPS: a miss leaves the rider at ${traps.map(at).join(', ')}, with no way back to the line and no crash` : '');
}

// --- Solving ----------------------------------------------------------------

const cacheDir = repoRoot + '.playtest/';
const cachePath = playtestRunPath(entry.id, without.length ? `.without-${without.join('-')}` : '');
let cache = null;
// The escape searches' answers, saved for the next playtest by findEscapes.
const escapeCache = {};
if (!args.includes('--fresh') && existsSync(cachePath)) {
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { cache = null; }
}

/**
 * Finds inputs from `start` to `done`: a saved run first, then the greedy bot,
 * then the explorer. The bot heads for the nearest apple not yet taken, so to
 * aim it at one apple (`focus`) it searches on a copy of the ride where every
 * other apple counts as taken; apples never change the physics, so the inputs
 * ride the same on the real ride.
 */
function solve(start, done, saved, focus = null) {
  if (saved) {
    const inputs = decodeInputs(saved);
    const { stats } = measure(start, inputs, done);
    if (stats.reached) return { inputs: inputs.slice(0, stats.steps), method: 'saved run from the last playtest' };
  }
  if (focus !== null) {
    start = cloneRide(start);
    start.apples.forEach((apple, index) => { apple.taken = index !== focus; });
    start.collected = start.apples.length - 1;
  }
  const greedy = recordTrail(entry, { start, done, minutes: MINUTES * .4, constrain });
  if (greedy.done) return { inputs: greedy.inputs, method: 'greedy bot' };
  const stats = {};
  const explored = exploreTrail(entry, [], { start, done, minutes: MINUTES * .6, polish: false, constrain, stats });
  if (explored) return { inputs: explored.inputs, method: 'explorer' };
  const furthest = measure(start, greedy.inputs, done);
  return { failed: true, greedyEnd: { ...mid(furthest.ride), status: furthest.stats.status, crash: furthest.stats.crash }, explorer: stats };
}

function solveTrail() {
  const total = trail.apples.length;
  // The apple order to ride, as given with --order; apples it leaves out are taken nearest first.
  const order = (option('--order') || '').split(',').filter(Boolean).map(number => Number(number) - 1);
  for (const index of order) if (!trail.apples[index]) throw new Error(`--order: there is no apple ${index + 1}`);
  out();
  out(`Solving one apple at a time, ${order.length ? `in the order ${order.map(index => index + 1).join(', ')}` : 'nearest first'}, `
    + `${MINUTES} min at most per stretch${without.length ? `, without: ${without.join(', ')}` : ''}.`);
  let ride = createRide(trail);
  const stretches = [];
  // The line every stretch so far has taken, for traps.
  const ridden = [];
  const fullRun = [];
  let elapsed = 0;
  for (let stretch = 0; ride.status !== 'won'; stretch++) {
    const last = ride.collected === total;
    const collected = ride.collected;
    const focus = last ? null : order.find(index => !ride.apples[index].taken) ?? null;
    const done = last ? probe => probe.status === 'won'
      : focus !== null ? probe => probe.apples[focus].taken && survives(probe) : probe => probe.collected > collected && survives(probe);
    const goal = last ? 'the finish' : focus !== null ? `apple ${focus + 1}` : 'any apple';
    process.stderr.write(`stretch ${stretch + 1}: searching from ${at(mid(ride))} to ${goal}\n`);
    const found = solve(ride, done, cache?.stretches?.[stretch], focus);
    if (found.failed) {
      const { greedyEnd, explorer } = found;
      const left = ride.apples.map((apple, index) => ({ ...apple, index })).filter(apple => !apple.taken);
      out(`Stretch ${stretch + 1}: FAILED to reach ${goal} from ${at(mid(ride))}.`);
      if (left.length) out(`  apples not taken yet: ${left.map(apple => `${apple.index + 1} at ${at(apple)}`).join(', ')}`);
      out(`  greedy bot ended at ${at(greedyEnd)} (${greedyEnd.crash ? `crashed: ${greedyEnd.crash.cause}` : greedyEnd.status === 'running' ? 'stuck' : greedyEnd.status})`);
      if (explorer.closest) out(`  explorer got within ${Math.round(explorer.closest.distance)} units (through open space) of the next goal, from ${at(explorer.closest)}, after ${explorer.iterations} tries`);
      out('  The trail may be impossible from here, or need more search (--minutes). Probe the spot with --probe.');
      if (stretch && !order.length) out('  The bot takes apples nearest first; if this one was meant to be taken earlier, give the intended order with --order.');
      stretches.push({ failed: true, from: mid(ride), greedyEnd, explorer });
      break;
    }
    const { ride: after, stats } = measure(ride, found.inputs, done);
    // The bot plans in chunks and can overshoot the goal by a few steps; the
    // next stretch starts at the goal, so the run keeps only the steps to it.
    const inputs = found.inputs.slice(0, stats.steps);
    const taken = stats.apples.map(({ index }) => `apple ${index + 1} at ${at(after.apples[index])}`);
    const reached = last ? `the finish at ${at(after.flower)}` : taken.join(' and ');
    out(`Stretch ${stretch + 1}: ${at(mid(ride))} to ${reached} in ${seconds(inputs.length)} s (${found.method})`);
    for (const line of describeStats(stats)) out(`  ${line}`);
    const forgiving = TRIALS ? forgiveness(ride, inputs, done, stretch + 1, focus, ridden) : null;
    if (forgiving) out(`  ${describeForgiveness(forgiving)}`);
    stretches.push({ from: mid(ride), reached, seconds: inputs.length * STEP, method: found.method, stats, forgiveness: forgiving, inputs: encodeInputs(inputs) });
    fullRun.push(...inputs);
    elapsed += inputs.length * STEP;
    ride = after;
  }
  const finished = ride.status === 'won';
  out();
  if (finished) {
    out(`Result: the bot finished in ${elapsed.toFixed(2)} s. Its route is not optimised, so treat this as an upper bound for gold.`);
    // Gold at most 5% over the bot, silver and bronze as the official trails have them.
    const gold = Math.round(elapsed * 1.05), silver = Math.round(gold * 1.3), bronze = Math.round(gold * 1.75);
    out(`Medals: at most gold ${gold}, silver ${silver}, bronze ${bronze} (gold up to 5% over the bot, silver 1.3x and bronze 1.75x gold).`);
    const set = trail.medals?.gold;
    if (Number.isFinite(set) && set > gold) out(`  The trail's gold of ${set} s is more than 5% over the bot's time, so it is too easy to get: lower it.`);
  } else out(`Result: NOT finished; the bot took ${ride.collected} of ${total} apples.`);
  const traps = stretches.flatMap(stretch => stretch.forgiveness?.traps || []);
  if (traps.length) out(`TRAPS: ${traps.length} place${traps.length === 1 ? '' : 's'} where a miss leaves the rider with no way back and no crash (${traps.map(at).join(', ')}). Give each a way back to the line, or make it end the run (see TRAILS_GUIDE.md).`);
  report.traps = traps;
  const escapes = TRIALS ? findEscapes(stretches.flatMap(stretch => stretch.stats?.route || [])) : [];
  for (const { side, from, to, nisse, things } of escapes) {
    const way = `the rider can ride out past the ${side} end, from ${at(from)} to ${at(to)}`;
    if (nisse) out(`OPEN END: ${way}, to the nisse hidden out there at ${at(nisse)}. Fine if that is the way to it.`);
    else if (things.length) out(`OPEN END: ${way}. Out there: ${things.join(', ')}. Fine if that is meant to be found; otherwise close the end (rule 9 in TRAILS_GUIDE.md).`);
    else out(`ESCAPE: ${way}, onto plain ground beyond the closing, which is probably not meant. Close that end so nobody gets over it (rule 9 in TRAILS_GUIDE.md).`);
  }
  report.escapes = escapes;
  report.finished = finished;
  report.seconds = finished ? elapsed : null;
  report.stretches = stretches;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify({
    trail: entry.id,
    stretches: stretches.filter(stretch => !stretch.failed).map(stretch => stretch.inputs),
    order: order.map(index => index + 1),
    // Where reruns mostly failed, for scripts/render-trail.mjs to mark.
    tightSpots: stretches.flatMap(stretch => (stretch.forgiveness?.windows || [])
      .filter(entry => entry.reached <= TRIALS / 2)
      .map(({ at: from, reached, failedAt }) => ({ from: { x: Math.round(from.x), y: Math.round(from.y) }, reached, trials: TRIALS, failedAt }))),
    // Where a miss strands the rider, for scripts/render-trail.mjs to mark.
    traps,
    escapes: escapeCache,
    // The whole run in the replay format's encoding, usable as a human run for scripts/record-replays.mjs.
    inputs: finished ? encodeInputs(fullRun) : undefined
  }) + '\n');
}

// --- Escaping the trail -----------------------------------------------------

// Each end is closed off, with ground carrying on beyond the closing so no
// edge shows (rule 9 in TRAILS_GUIDE.md). That ground is only scenery. From
// the line's outermost point at each end, the bot looks for a way to the very
// end of the terrain there, its last ESCAPE_END units: a rider who stands
// there has ridden out along the ground beyond the closing, or climbed the
// wall that ends the terrain, and either way has left the trail. An end the
// line itself comes within ESCAPE_CLEAR of is left alone.
const ESCAPE_CLEAR = 200;
const ESCAPE_END = 150;
const ESCAPE_MINUTES = 0.5;
// Plain nature and wildlife, which dress the ground beyond a closing on
// most trails. A prop type missing here counts as something placed out there
// on purpose.
const SCENERY = new Set(['tree', 'pine', 'sapling', 'pine-small', 'snow-pine', 'bush', 'grass', 'flowers', 'rock', 'boulder', 'pebbles', 'stump', 'cactus', 'cactus-small', 'vines', 'roots', 'moss', 'ivy', 'rabbit', 'squirrel', 'bird', 'vulture', 'tumbleweed']);

function findEscapes(route) {
  const ride = createRide(trail);
  const points = [mid(ride), ride.flower, ...ride.apples, ...route];
  const xs = trail.terrainBlocks.filter(block => block.layer !== 'back').flatMap(block => block.outer.nodes.map(node => node.x));
  const terrain = { left: Math.min(...xs), right: Math.max(...xs) };
  const west = points.reduce((a, b) => (b.x < a.x ? b : a)), east = points.reduce((a, b) => (b.x > a.x ? b : a));
  const ends = [
    { side: 'west', facing: -1, from: west, edge: Math.min(terrain.left + ESCAPE_END, west.x - ESCAPE_CLEAR), out: x => x < ends[0].edge, end: terrain.left },
    { side: 'east', facing: 1, from: east, edge: Math.max(terrain.right - ESCAPE_END, east.x + ESCAPE_CLEAR), out: x => x > ends[1].edge, end: terrain.right },
  ];
  // A hard climb out can take the bot most of this, and on a trail closed at
  // both ends it is spent in full. So the answer is saved with the ground it
  // was found on: editing scenery, props or the nisse doesn't search again.
  const minutes = Math.min(ESCAPE_MINUTES, MINUTES * 0.25);
  const found = [];
  for (const end of ends) {
    if (!(end.side === 'west' ? end.edge > end.end : end.edge < end.end)) continue;
    const key = `${trailHash(trail)}:${end.side}:${Math.round(end.from.x)}:${Math.round(end.edge)}`;
    const saved = cache?.escapes?.[key];
    // A way out found stays found; none found only counts for a search as long as this one.
    const way = saved && (saved.way || saved.minutes >= minutes) ? saved.way : searchEscape(end, minutes);
    escapeCache[key] = saved && !saved.way && saved.minutes >= minutes ? saved : { way, minutes };
    if (!way) continue;
    // What lies out there, past the line, says whether the end is meant to be
    // open: a nisse hidden there, or things placed there, are worth riding out
    // for; only plain nature beyond is likely ground that carries on to hide
    // the edge.
    const beyond = x => end.facing * (x - end.from.x) > ESCAPE_CLEAR;
    const nisse = ride.nisse && beyond(ride.nisse.x) ? ride.nisse : null;
    const things = [...new Set((trail.props || []).filter(prop => beyond(prop.x) && !SCENERY.has(prop.type)).map(prop => prop.type))];
    found.push({ side: end.side, ...way, nisse, things });
  }
  return found;
}

/** The bot's way out past one end, as where it starts and where it gets to, or null. */
function searchEscape(end, minutes) {
  // The bike stands on the floor under the line, not on the topmost surface
  // there, which in a cave is the outside of its roof.
  const below = end.from.y - RADIUS * 3;
  const floors = [-1, 1].map(side => terrainAt(trail, end.from.x + side * WHEELBASE / 2, below));
  if (!floors.every(floor => floor.solid)) return null;
  const start = createRide(trail, { start: { x: end.from.x, y: Math.min(...floors.map(floor => floor.y)) - RADIUS, facing: end.facing } });
  // A place out there to head for: the bot steers for apples, so one stands
  // in for it, and getting anywhere past the edge counts. Ground near the
  // line's height is the likely way out; failing that, the top of whatever
  // ends the terrain.
  const target = (end.edge + end.end) / 2;
  const level = terrainAt(trail, target, end.from.y - 400);
  const ground = level.solid ? level : terrainAt(trail, target, -1e5);
  if (!Number.isFinite(ground.y)) return null;
  goalOf(`reach:${Math.round(target)},${Math.round(ground.y - 60)}`, start);
  const done = probe => probe.status === 'running' && end.out(mid(probe).x);
  const greedy = recordTrail(entry, { start, done, minutes: minutes * 0.4, constrain });
  const path = greedy.done ? greedy.inputs : exploreTrail(entry, [], { start, done, minutes: minutes * 0.6, polish: false, constrain })?.inputs;
  if (!path) return null;
  const { ride: after } = measure(start, path, done);
  return { from: { x: Math.round(end.from.x), y: Math.round(end.from.y) }, to: { x: Math.round(mid(after).x), y: Math.round(mid(after).y) } };
}

// --- Probing one spot ---------------------------------------------------------

/** A ride placed at `x,y,facing,speed`; y may be "ground" to stand on the surface. */
function probeRide(text) {
  const [x, y, facing = 1, speed = 0] = text.split(',').map(part => part.trim());
  const start = { x: Number(x), y: y === undefined || y === 'ground' ? null : Number(y), facing: Number(facing) < 0 ? -1 : 1 };
  const ride = createRide(trail, { start });
  // Verlet: a point's speed is where it is less where it was a step ago.
  for (const point of ride.vehicle.bikePoints) point.ox = point.x - Number(speed) * start.facing * STEP;
  return ride;
}

// "gas 1; gas fwd 0.4; turn; coast half back 0.5": each part is what to hold
// and for how many seconds: gas, brake or neither, and a lean (fwd or back,
// optionally half) relative to the way the bike faces. "turn" turns around.
function parseScript(text, facing) {
  const inputs = [];
  for (const part of text.split(';').map(part => part.trim()).filter(Boolean)) {
    const words = part.split(/\s+/);
    if (words[0] === 'turn') { facing = -facing; continue; }
    const duration = Number(words[words.length - 1]);
    if (!Number.isFinite(duration)) throw new Error(`"${part}" needs a duration in seconds at the end`);
    const has = word => words.includes(word);
    const leanInput = (has('fwd') ? 1 : has('back') ? -1 : 0) * (has('half') ? .5 : 1) * facing;
    const input = { facing, leanInput, accelerating: has('gas'), braking: has('brake') };
    for (let step = 0; step < Math.round(duration / STEP); step++) inputs.push(input);
  }
  return inputs;
}

// The bot heads for the nearest apple not yet taken, so a probe counts every
// other apple as taken; a place to reach becomes an apple of its own.
function goalOf(text, ride) {
  if (text === 'finish') return { name: 'the finish', done: probe => probe.status === 'won' };
  const apple = /^apple:(\d+)$/.exec(text);
  const reach = /^reach:(-?[\d.]+),(-?[\d.]+)$/.exec(text);
  if (!apple && !reach) throw new Error(`unknown goal "${text}"; use apple:N, finish or reach:X,Y`);
  if (apple && !ride.apples[Number(apple[1]) - 1]) throw new Error(`there is no apple ${apple[1]}`);
  const goal = apple ? ride.apples[Number(apple[1]) - 1] : { x: Number(reach[1]), y: Number(reach[2]), taken: false };
  for (const other of ride.apples) other.taken = other !== goal;
  if (!apple) ride.apples.push(goal);
  ride.collected = ride.apples.length - 1;
  const index = ride.apples.indexOf(goal);
  return { name: apple ? `apple ${apple[1]}` : `${goal.x},${goal.y}`, done: probe => probe.apples[index].taken && survives(probe) };
}

function probe() {
  const ride = probeRide(option('--probe'));
  out(`Probe: bike at ${at(mid(ride))}, facing ${ride.facing < 0 ? 'left' : 'right'}`);
  const script = option('--script');
  if (script) {
    const inputs = parseScript(script, ride.facing);
    const every = Math.max(1, Math.round(EVERY / STEP));
    out('   t     x     y    vx    vy  angle  state   input');
    const probeRide = cloneRide(ride);
    const trace = [];
    let peak = mid(probeRide), peakAngle = null;
    for (let index = 0; index < inputs.length; index++) {
      const events = stepRide(probeRide, inputs[index]);
      const point = mid(probeRide);
      const vx = (probeRide.rear.x - probeRide.rear.ox + probeRide.front.x - probeRide.front.ox) / 2 / STEP;
      const vy = (probeRide.rear.y - probeRide.rear.oy + probeRide.front.y - probeRide.front.oy) / 2 / STEP;
      const angle = Math.atan2(probeRide.front.y - probeRide.rear.y, probeRide.front.x - probeRide.rear.x) * 180 / Math.PI;
      if (point.y < peak.y) { peak = point; peakAngle = angle; }
      const state = probeRide.status !== 'running' ? probeRide.status : airborne(probeRide) ? 'air'
        : hangsBelowWheel(probeRide.vehicle) ? 'hang' : probeRide.rear.grounded && probeRide.front.grounded ? 'ground' : 'wheelie';
      // Wheels brushing the ground in a wheelie aren't worth a line; real landings are.
      const notable = events.filter(event => !['suspension', 'start'].includes(event.type) && (event.type !== 'land' || event.impact >= 100))
        .map(event => event.type === 'crash' ? `CRASH ${event.cause}` : event.type === 'apple' ? `APPLE ${probeRide.apples.indexOf(event.apple) + 1}`
          : event.type === 'land' ? `land ${Math.round(event.impact)}` : event.type);
      trace.push({ t: (index + 1) * STEP, x: point.x, y: point.y, vx, vy, angle, state, events: notable });
      if ((index + 1) % every === 0 || notable.length || probeRide.status !== 'running' || index === inputs.length - 1) {
        out(`${((index + 1) * STEP).toFixed(2).padStart(5)} ${point.x.toFixed(0).padStart(5)} ${point.y.toFixed(0).padStart(5)} `
          + `${vx.toFixed(0).padStart(5)} ${vy.toFixed(0).padStart(5)} ${angle.toFixed(0).padStart(6)}  ${state.padEnd(7)} ${describeInput(inputs[index])}`
          + (notable.length ? `  ${notable.join(', ')}` : ''));
      }
      if (probeRide.status !== 'running') break;
    }
    // The angle at the top of a jump shows how much the lip spun the bike.
    out(`Highest point: ${at(peak)}${peakAngle === null ? '' : `, angle ${peakAngle.toFixed(0)}°`}. End: ${at(mid(probeRide))}, ${probeRide.status}.`);
    report.probe = { start: mid(ride), trace };
    return;
  }
  const goal = goalOf(option('--goal') || 'finish', ride);
  out(`Solving to ${goal.name}, ${MINUTES} min at most${without.length ? `, without: ${without.join(', ')}` : ''}.`);
  const found = solve(ride, goal.done, null);
  if (found.failed) {
    out(`FAILED. Greedy bot ended at ${at(found.greedyEnd)}`
      + (found.explorer.closest ? `; explorer got within ${Math.round(found.explorer.closest.distance)} units from ${at(found.explorer.closest)}` : ''));
    report.probe = { failed: true, ...found };
    return;
  }
  const { stats } = measure(ride, found.inputs, goal.done);
  out(`Reached ${goal.name} in ${seconds(found.inputs.length)} s (${found.method})`);
  for (const line of describeStats(stats)) out(`  ${line}`);
  const forgiving = TRIALS ? forgiveness(ride, found.inputs, goal.done, 1) : null;
  if (forgiving) out(`  ${describeForgiveness(forgiving)}`);
  const steps = [];
  let facing = ride.facing;
  for (const run of runsOf(found.inputs)) {
    const turned = run.input.facing && run.input.facing !== facing;
    if (turned) { facing = run.input.facing; steps.push({ text: 'turn' }); }
    const text = describeInput(run.input), last = steps[steps.length - 1];
    if (last?.text === text) last.count += run.count;
    else steps.push({ text, count: run.count });
  }
  out(`  inputs, in the --script format: ${steps.map(step => step.count ? `${step.text} ${seconds(step.count)}` : step.text).join('; ')}`);
  report.probe = { seconds: found.inputs.length * STEP, method: found.method, stats, forgiveness: forgiving };
}

// --- Main -------------------------------------------------------------------

const broken = survey();
if (option('--probe')) probe();
else if (broken) out('\nFix the errors above before playtesting.');
else if (!args.includes('--check')) solveTrail();
const jsonPath = option('--json');
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
