// The replay bot: a greedy search (recordTrail) and an explorer for trails
// it can't plan (exploreTrail). scripts/record-replays.mjs drives them per
// trail; both can also start from any ride and stop at any goal, which
// scripts/probe-replay-bot.mjs uses to test the bot on stretches of a run.
import { STEP } from '../../js/config.js';
import { copyRideTerrain } from '../../js/glass.js';
import { createRide, stepRide } from '../../js/ride.js';
import { terrainAt, terrainCollisionsAt } from '../../js/terrain.js';

const DECISION_STEPS = 12;
const HORIZONS = [36, 90, 180];
const MAX_SECONDS = 150;
const BACKTRACK_DECISIONS = 4;
const MAX_BACKTRACKS = 3000;

// A search's budget is the number of simulation steps it may ride, counting
// every look ahead and every try, rather than time, so the same trail and
// options give the same result on any machine, however busy. Budgets are
// given in millions of steps; one takes about half a minute on a laptop.
export const MILLION = 1e6;
export const MAX_STEPS = (Number(process.env.REPLAY_BUDGET) || 40) * MILLION;

const CANDIDATES = [];
for (const leanInput of [-1, -.5, 0, .5, 1]) {
  for (const [accelerating, braking] of [[true, false], [false, false], [false, true]]) {
    CANDIDATES.push({ leanInput, accelerating, braking });
  }
}

// The trail is shared rather than cloned, apart from its broken glass: a pane
// one try breaks must still be whole for the next. The ride kept at the last
// flag is shared too, as nothing changes it once kept.
export function cloneRide(ride) {
  const { trail, random, checkpoint, ...rest } = ride;
  return { ...structuredClone(rest), trail: copyRideTerrain(trail), random, checkpoint };
}

function target(ride) {
  const mx = (ride.rear.x + ride.front.x) / 2;
  let best = null;
  for (const apple of ride.apples) {
    if (apple.taken) continue;
    if (!best || Math.abs(apple.x - mx) < Math.abs(best.x - mx)) best = apple;
  }
  return best || { x: ride.trail.finish.x + 40, y: terrainAt(ride.trail, ride.trail.finish.x).y - 30 };
}

function score(ride, goalTarget, crashedAt) {
  if (ride.status === 'won') return 1e9 - ride.elapsed;
  const mx = (ride.rear.x + ride.front.x) / 2, my = (ride.rear.y + ride.front.y) / 2;
  let value = ride.collected * 1e6;
  value -= Math.abs(goalTarget.x - mx) + Math.max(0, Math.abs(goalTarget.y - my) - 40) * .5;
  const angle = Math.atan2(ride.front.y - ride.rear.y, ride.front.x - ride.rear.x) * ride.facing;
  const ground = terrainAt(ride.trail, mx, my);
  const tilt = Math.atan2(Math.sin(angle - Math.atan(ground.slope || 0)), Math.cos(angle - Math.atan(ground.slope || 0)));
  value -= Math.abs(tilt) * 25;
  if (crashedAt !== null) value -= 1e5 - crashedAt * 100;
  return value;
}

function evaluate(ride, facing, candidate, horizon, constrain) {
  const probe = cloneRide(ride);
  const goalTarget = target(ride);
  const input = { facing, ...candidate };
  let crashedAt = null, step = 0;
  while (step < horizon) {
    stepRide(probe, constrain ? constrain(probe, input) : input);
    step++;
    if (probe.status === 'crashed') { crashedAt = step - 1; break; }
    if (probe.status === 'won') break;
    if (probe.collected > ride.collected) break;
  }
  return { value: score(probe, goalTarget, crashedAt), crashed: crashedAt !== null, steps: step };
}

/**
 * @param {{ start?: any, done?: (ride: any) => boolean, steps?: number, constrain?: (ride: any, input: any) => any }} [options]
 *   where to start (a ride), when the goal is reached (default: the finish), the search budget in
 *   simulation steps, and
 *   an optional rule that changes each input before it is ridden (scripts/playtest.mjs uses it to
 *   take a skill away, such as turning around)
 */
export function recordTrail(entry, { start, done = ride => ride.status === 'won', steps: budget = MAX_STEPS, constrain = null } = {}) {
  const trail = entry.trail;
  let ride = start ? cloneRide(start) : createRide(trail);
  const inputs = [];
  // One frame per committed decision; each remembers the options that crashed from there.
  const stack = [{ ride: cloneRide(ride), length: 0, banned: new Set(), chosen: -1 }];
  const restore = frame => { ride = cloneRide(frame.ride); inputs.length = frame.length; };
  let backtracks = 0, deadEnds = 0, lastDeadEnd = -Infinity;
  // If the trail can't be finished, keep the run that got furthest.
  let furthest = { progress: -Infinity, inputs: [] };
  let work = 0;
  let reported = Date.now();
  while (ride.status === 'running' && !done(ride) && inputs.length < MAX_SECONDS / STEP) {
    const frame = stack[stack.length - 1];
    const mx = (ride.rear.x + ride.front.x) / 2;
    const progress = ride.collected * 1e5 + mx;
    if (progress > furthest.progress) furthest = { progress, inputs: inputs.slice() };
    const now = Date.now();
    if (now - reported > 30000) {
      reported = now;
      process.stderr.write(`  ${entry.id}: x ${mx.toFixed(0)}, ${ride.collected} apples, ${backtracks} backtracks, `
        + `furthest x ${(furthest.progress % 1e5).toFixed(0)}\n`);
    }
    if (work >= budget) break;
    const goalTarget = target(ride);
    const airborne = !ride.rear.grounded && !ride.front.grounded;
    const facing = !airborne && Math.abs(goalTarget.x - mx) > 30 ? Math.sign(goalTarget.x - mx) : ride.facing;
    let best = null;
    for (const [index, candidate] of CANDIDATES.entries()) {
      if (frame.banned.has(index)) continue;
      // A candidate is safe if holding it survives at least one horizon.
      const results = HORIZONS.map(horizon => evaluate(ride, facing, candidate, horizon, constrain));
      for (const result of results) work += result.steps;
      const safe = results.filter(result => !result.crashed);
      if (!safe.length) continue;
      const value = Math.max(...safe.map(result => result.value));
      if (!best || value > best.value) best = { index, candidate, value };
    }
    if (!best) {
      if (++backtracks > MAX_BACKTRACKS || stack.length === 1) break;
      // Repeated dead ends in the same stretch jump further back each time.
      deadEnds = frame.length - lastDeadEnd < 240 ? deadEnds + 1 : 0;
      lastDeadEnd = frame.length;
      const depth = BACKTRACK_DECISIONS * (1 + Math.min(deadEnds, 12));
      for (let pop = 0; pop < depth && stack.length > 1; pop++) stack.pop();
      const previous = stack[stack.length - 1];
      previous.banned.add(previous.chosen);
      restore(previous);
      continue;
    }
    frame.chosen = best.index;
    const input = { facing, ...best.candidate };
    for (let step = 0; step < DECISION_STEPS && ride.status === 'running'; step++) {
      const ridden = constrain ? constrain(ride, input) : input;
      stepRide(ride, ridden);
      work++;
      inputs.push(ridden);
    }
    if (ride.status === 'crashed') {
      backtracks++;
      frame.banned.add(best.index);
      restore(frame);
      continue;
    }
    stack.push({ ride: cloneRide(ride), length: inputs.length, banned: new Set(), chosen: -1 });
  }
  if (!done(ride) && furthest.inputs.length) return { inputs: furthest.inputs, backtracks, done: false, work };
  return { inputs, backtracks, done: done(ride), work };
}

// The explorer: a fallback for trails the greedy bot can't plan, where the
// way on leads away from the next apple first (roll back, turn around and
// launch, flip off a kicker, take the long way round). It keeps an archive
// of distinct situations, keyed by the apples taken, place, facing, speed,
// angle and whether the bike is in the air, each with the quickest inputs
// found that reach it. It keeps going back to rarely tried situations, most
// of all the ones closest to the next apple through open space (see
// openSpaceFields), and rides on from them with random moves (see MOVES)
// until a run finishes. After the first finish it explores as long again,
// so quicker routes can replace the slow ones.
//
// Given reference runs (human runs, or the replay a physics change broke), a
// place reached along one remembers how far into it it is. From there the
// explorer often rides on with the reference's inputs, resumed on time or a
// little early or late, and otherwise rides random moves for a while as a
// detour or in place of a stretch of the reference. Places furthest along
// a reference are favoured, so the search patches where the reference
// breaks instead of rediscovering the whole trail.
const EXPLORE_CELL = 48;
const EXPLORE_SPEED = 1.5;            // speed bucket size, in units per step
const EXPLORE_ANGLES = 8;             // buckets for the bike's angle, so a tumble doesn't stand in for a landing
const EXPLORE_DOOMED = .9;            // share of tries crashing straight away that rules a place out as the closest
const EXPLORE_MAX_CELLS = 40000;
const EXPLORE_MIN_POLISH = 3000;      // iterations kept exploring after the first finish
const EXPLORE_REPEAT = .75;           // chance of holding the previous input
const EXPLORE_TURN = .08;             // chance of turning around at a decision
const EXPLORE_GAS = .6;               // chance a new input holds the throttle
const EXPLORE_HOLDS = [1, 2, 4];      // decisions a new input is held for, so climbs get sustained gas
const STRETCH_MAX = 16 * 4 * DECISION_STEPS; // longest random stretch, in steps
const GUIDE_FOLLOW = .6;              // chance a guided place rides on with its reference
const GUIDE_SHIFTS = [-24, -12, -6, 6, 12, 24]; // steps a reference is resumed early or late
const GUIDE_FRONT = 240;              // steps behind the furthest guided place that still count as the front
const GUIDE_TAIL = 240;               // steps the last input is held past a reference's end, for when it ends early

function seededGenerator(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cellKey(ride) {
  const mx = (ride.rear.x + ride.front.x) / 2, my = (ride.rear.y + ride.front.y) / 2;
  const vx = (ride.rear.x - ride.rear.ox + ride.front.x - ride.front.ox) / 2;
  const speed = Math.max(-3, Math.min(3, Math.round(vx / EXPLORE_SPEED)));
  let taken = 0;
  ride.apples.forEach((apple, index) => { if (apple.taken) taken |= 1 << index; });
  const angle = Math.atan2(ride.front.y - ride.rear.y, ride.front.x - ride.rear.x);
  const tilt = Math.round(angle / (2 * Math.PI) * EXPLORE_ANGLES) % EXPLORE_ANGLES;
  const airborne = !ride.rear.grounded && !ride.front.grounded ? 'a' : '';
  return `${taken}|${ride.facing}|${Math.floor(mx / EXPLORE_CELL)}|${Math.floor(my / EXPLORE_CELL)}|${speed}|${tilt}${airborne}`;
}

// The explorer rides in moves of a tenth of a second to a few seconds. Besides
// holding one input, they're the patterns human runs are made of: gas held
// for seconds while pumping the lean (climbing onto ledges), coasting to a
// stop and turning around (a run-up the other way), and turning around in
// mid-air with a tap of the brake (a flip).
const LEANS = [-1, -.5, 0, .5, 1];
const pickFrom = (random, list) => list[Math.floor(random() * list.length)];
const speedOf = ride => (ride.rear.x - ride.rear.ox + ride.front.x - ride.front.ox) / 2;

function* holdMove(ride, previous, random) {
  let input = previous, hold = 1;
  if (random() > EXPLORE_REPEAT) {
    const throttle = random() < EXPLORE_GAS;
    const { leanInput, accelerating, braking } = pickFrom(random, CANDIDATES.filter(candidate => candidate.accelerating === throttle));
    const facing = random() < EXPLORE_TURN ? -ride.facing : ride.facing;
    input = { facing, leanInput, accelerating, braking };
    hold = pickFrom(random, EXPLORE_HOLDS);
  }
  for (let step = 0; step < DECISION_STEPS * hold; step++) yield input;
}

function* pumpMove(ride, previous, random) {
  const facing = ride.facing, length = 240 + Math.floor(random() * 361);
  let leanInput = previous.leanInput;
  for (let step = 0; step < length;) {
    leanInput = pickFrom(random, LEANS.filter(lean => lean !== leanInput));
    const hold = 12 + Math.floor(random() * 109);
    for (let count = 0; count < hold && step < length; count++, step++) yield { facing, leanInput, accelerating: true, braking: false };
  }
}

function* turnMove(ride, previous, random) {
  const facing = ride.facing, braking = random() < .5, slowest = .2 + random() * .8;
  for (let step = 0; step < 240 && Math.abs(speedOf(ride)) > slowest; step++) yield { facing, leanInput: 0, accelerating: false, braking };
  const leanInput = pickFrom(random, LEANS), settle = 12 + Math.floor(random() * 37);
  for (let step = 0; step < settle; step++) yield { facing: -facing, leanInput, accelerating: false, braking: false };
}

function* airTurnMove(ride, previous, random) {
  if (ride.rear.grounded || ride.front.grounded) return yield* holdMove(ride, previous, random);
  const facing = -ride.facing, leanInput = pickFrom(random, [-1, 1]);
  const brake = Math.floor(random() * 25), coast = 12 + Math.floor(random() * 49);
  for (let step = 0; step < brake; step++) yield { facing, leanInput, accelerating: false, braking: true };
  for (let step = 0; step < coast; step++) yield { facing, leanInput, accelerating: false, braking: false };
}

const MOVES = [[holdMove, 4], [pumpMove, 3], [turnMove, 1], [airTurnMove, 2]];
const MOVE_TOTAL = MOVES.reduce((sum, [, weight]) => sum + weight, 0);

function pickMove(ride, previous, random) {
  let pick = random() * MOVE_TOTAL;
  for (const [move, weight] of MOVES) if ((pick -= weight) <= 0) return move(ride, previous, random);
  return holdMove(ride, previous, random);
}

// How far each place is from each apple and the finish through open space,
// so an apple on a ledge above counts as far away until there's a way up.
// Gravity isn't considered: it tells the explorer which places look
// promising, not how to ride there.
const FIELD_CELL = 16;
const FIELD_CLEARANCE = 10;           // how close to terrain a cell's centre may be and still be open
const FIELD_MAX_CELLS = 1e6;
const FIELD_FRONT = 160;              // how much further than the closest place still counts as the front

function openSpaceFields(ride) {
  const points = [ride.flower, ride.rear, ride.front, ...ride.apples];
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) points.push(value);
      Object.values(value).forEach(collect);
    }
  };
  collect(ride.trail.terrainBlocks);
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const left = Math.min(...xs) - 200, top = Math.min(...ys) - 400;
  let cell = FIELD_CELL;
  while (((Math.max(...xs) + 200 - left) / cell) * ((Math.max(...ys) + 200 - top) / cell) > FIELD_MAX_CELLS) cell *= 2;
  const width = Math.ceil((Math.max(...xs) + 200 - left) / cell), height = Math.ceil((Math.max(...ys) + 200 - top) / cell);
  const open = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      open[row * width + column] = terrainCollisionsAt(ride.trail, left + (column + .5) * cell, top + (row + .5) * cell, FIELD_CLEARANCE).length ? 0 : 1;
    }
  }
  const index = (x, y) => {
    const column = Math.floor((x - left) / cell), row = Math.floor((y - top) / cell);
    return column < 0 || row < 0 || column >= width || row >= height ? -1 : row * width + column;
  };
  // A breadth-first search from the goal through open cells, eight ways.
  const field = goal => {
    const distance = new Float32Array(width * height).fill(Infinity);
    const start = index(goal.x, goal.y);
    if (start < 0) return distance;
    distance[start] = 0;
    let queue = [start];
    while (queue.length) {
      const next = [];
      for (const at of queue) {
        const column = at % width, row = (at - column) / width;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const c = column + dx, r = row + dy, to = r * width + c;
          if ((!dx && !dy) || c < 0 || r < 0 || c >= width || r >= height || !open[to]) continue;
          const through = distance[at] + (dx && dy ? Math.SQRT2 : 1) * cell;
          if (through < distance[to]) { distance[to] = through; next.push(to); }
        }
      }
      queue = next;
    }
    return distance;
  };
  const apples = ride.apples.map(field), finish = field(ride.flower);
  // The distance to the nearest apple not yet taken, or to the finish once they all are.
  return ride => {
    const x = (ride.rear.x + ride.front.x) / 2, y = (ride.rear.y + ride.front.y) / 2;
    const fields = ride.apples.some(apple => !apple.taken) ? apples.filter((_, at) => !ride.apples[at].taken) : [finish];
    let best = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const at = index(x + dx * cell, y + dy * cell);
      if (at >= 0) for (const distance of fields) best = Math.min(best, distance[at] + (Math.abs(dx) + Math.abs(dy)) * cell);
    }
    return best;
  };
}

const sameInput = (a, b) => a.facing === b.facing && a.leanInput === b.leanInput
  && a.accelerating === b.accelerating && a.braking === b.braking;

/** The inputs that led to a trajectory node, oldest first. */
function inputsOf(node) {
  const runs = [];
  for (; node; node = node.parent) runs.push(node);
  const inputs = [];
  for (const { input, count } of runs.reverse()) for (let step = 0; step < count; step++) inputs.push(input);
  return inputs;
}

/**
 * @param {object[][]} [references] per-step inputs of runs to follow
 * @param {{ start?: any, done?: (ride: any) => boolean, steps?: number, at?: number, polish?: boolean,
 *   constrain?: (ride: any, input: any) => any, stats?: object }} [options]
 *   as for recordTrail, plus how far into the references `start` is, whether to look for a
 *   quicker route after the first one or stop there, and an object to fill in with how far the
 *   search got (the most apples taken, the place closest to the next one and the steps spent)
 * @returns the inputs from `start`, and where in its reference the route ended if it did following one
 */
export function exploreTrail(entry, references = [], { start: from, done = ride => ride.status === 'won', steps: budget = MAX_STEPS, at: startAt = 0, polish = true, constrain = null, stats = null } = {}) {
  const constrained = (ride, input) => constrain ? constrain(ride, input) : input;
  references = references.map(inputs => inputs.concat(Array(GUIDE_TAIL).fill(inputs[inputs.length - 1])));
  const random = seededGenerator(1);
  const start = from ? cloneRide(from) : createRide(entry.trail);
  const cells = new Map();
  const list = [];
  const distanceOf = openSpaceFields(start);
  let mostApples = 0;
  // How far along its reference a guided cell is, and the furthest a ride
  // following the reference's own inputs has got. Random stretches only
  // guess where they rejoin the reference, so they don't move the front.
  const along = guide => guide ? guide.at / references[guide.ref].length : -1;
  let front = -1;
  const visit = (ride, node, steps, guide = null, followed = false) => {
    const key = cellKey(ride);
    let cell = cells.get(key);
    if (cell) {
      if (steps < cell.steps) Object.assign(cell, { ride: cloneRide(ride), node, steps, guide: guide ?? cell.guide });
    } else {
      if (list.length >= EXPLORE_MAX_CELLS) return;
      cell = { ride: cloneRide(ride), node, steps, chosen: 0, crashed: 0, apples: ride.collected, guide, distance: distanceOf(ride) };
      cells.set(key, cell);
      list.push(cell);
      mostApples = Math.max(mostApples, ride.collected);
    }
    if (followed && cell.apples === mostApples) front = Math.max(front, along(guide));
  };
  visit(start, null, 0, references.length ? { ref: 0, at: startAt } : null);
  for (let ref = 1; ref < references.length; ref++) visit(start, null, 0, { ref, at: startAt });
  // Rarely chosen cells are favoured, cells holding the most apples so far
  // more, and of those the ones closest to the next apple, or at the front
  // of a reference, most of all.
  let closest = Infinity, closestCell = null;
  const choose = () => {
    let total = 0;
    closest = Infinity;
    for (const cell of list) {
      const doomed = cell.chosen >= 5 && cell.crashed >= cell.chosen * EXPLORE_DOOMED;
      if (cell.apples === mostApples && !doomed && cell.distance < closest) { closest = cell.distance; closestCell = cell; }
    }
    const weights = list.map(cell => {
      // A reference's front can run past an apple the ride missed, so the closest places count too.
      const atFront = cell.apples === mostApples && (cell.distance <= closest + FIELD_FRONT
        || (cell.guide && along(cell.guide) >= front - GUIDE_FRONT / references[cell.guide.ref].length));
      const weight = (cell.apples === mostApples ? 4 : 1) * (atFront ? 8 : 1) / Math.sqrt(1 + cell.chosen);
      total += weight;
      return weight;
    });
    let pick = random() * total;
    for (let index = 0; index < list.length; index++) if ((pick -= weights[index]) <= 0) return list[index];
    return list[list.length - 1];
  };
  let best = null, firstWin = 0, iterations = 0, work = 0;
  let reported = Date.now();
  while (work < budget) {
    iterations++;
    if (best && (!polish || iterations > firstWin * 2 + EXPLORE_MIN_POLISH)) break;
    const cell = choose();
    cell.chosen++;
    const ride = cloneRide(cell.ride);
    let { node, steps } = cell;
    let input = node?.input ?? { facing: ride.facing, leanInput: 0, accelerating: true, braking: false };
    const decisions = 4 + Math.floor(random() * 13);
    const reference = cell.guide && references[cell.guide.ref];
    const won = at => {
      if (!best || steps < best.steps) {
        best = { node, steps, at };
        if (!firstWin) firstWin = iterations;
        console.log(`  ${entry.id}: explorer finished in ${ride.elapsed.toFixed(2)}s after ${iterations} tries`);
      }
    };
    if (reference && cell.guide.at < reference.length && random() < GUIDE_FOLLOW) {
      // Ride on with the reference's inputs, resumed on time or a little early or late.
      const shift = random() < .5 ? 0 : GUIDE_SHIFTS[Math.floor(random() * GUIDE_SHIFTS.length)];
      let at = Math.max(0, cell.guide.at + shift);
      for (let decision = 0; decision < decisions && ride.status === 'running' && at < reference.length; decision++) {
        for (let count = 0; count < DECISION_STEPS && ride.status === 'running' && at < reference.length; count++) {
          const next = constrained(ride, reference[at++]);
          stepRide(ride, next);
          steps++;
          work++;
          // Nodes already stored in a cell are shared, so only extend this decision's own.
          if (count && sameInput(node.input, next)) node.count++;
          else node = { parent: node, input: next, count: 1 };
        }
        if (done(ride)) { won(at); break; }
        if (ride.status !== 'running' || steps * STEP > MAX_SECONDS) break;
        visit(ride, node, steps, { ref: cell.guide.ref, at }, true);
      }
    } else {
      // Up to `decisions` random moves. As a stretch of a reference
      // they either delay it (a detour) or stand in for that much of it.
      const replaces = random() < .5;
      let ridden = 0, ended = false;
      // Nodes already stored in a cell are shared, so only the newest unstored one is extended.
      let fresh = false;
      for (let move = 0; move < decisions && !ended && ridden < STRETCH_MAX; move++) {
        // Patches in a reference are mostly short holds; longer moves are for finding a way without one.
        for (const planned of reference && random() < .5 ? holdMove(ride, input, random) : pickMove(ride, input, random)) {
          const next = constrained(ride, planned);
          stepRide(ride, next);
          steps++;
          work++;
          ridden++;
          if (fresh && sameInput(node.input, next)) node.count++;
          else { node = { parent: node, input: next, count: 1 }; fresh = true; }
          input = next;
          if (done(ride)) { won(cell.guide ? cell.guide.at + (replaces ? ridden : 0) : null); ended = true; break; }
          if (ride.status !== 'running' || steps * STEP > MAX_SECONDS) { ended = true; break; }
          if (ridden % DECISION_STEPS) continue;
          const at = cell.guide && cell.guide.at + (replaces ? ridden : 0);
          visit(ride, node, steps, reference && at < reference.length ? { ref: cell.guide.ref, at } : null);
          fresh = false;
        }
      }
    }
    if (ride.status === 'crashed' && steps - cell.steps <= 4 * DECISION_STEPS) cell.crashed++;
    const now = Date.now();
    if (now - reported > 30000) {
      reported = now;
      process.stderr.write(`  ${entry.id}: explorer ${iterations} tries, ${list.length} places, `
        + `${mostApples}/${start.apples.length} apples, closest ${closest.toFixed(0)} away`
        + ` at ${closestCell ? `${((closestCell.ride.rear.x + closestCell.ride.front.x) / 2).toFixed(0)},${((closestCell.ride.rear.y + closestCell.ride.front.y) / 2).toFixed(0)}` : '-'}`
        + `${references.length ? `, ${(Math.max(0, front) * 100).toFixed(0)}% along` : ''}${best ? `, best ${(best.steps * STEP).toFixed(2)}s` : ''}\n`);
    }
  }
  if (stats) {
    const at = closestCell?.ride;
    Object.assign(stats, {
      iterations, places: list.length, apples: mostApples, work,
      closest: at ? { x: (at.rear.x + at.front.x) / 2, y: (at.rear.y + at.front.y) / 2, distance: closest } : null
    });
  }
  return best ? { inputs: inputsOf(best.node), backtracks: 0, done: true, at: best.at } : null;
}

// Repairs a reference run that stopped finishing (after a physics or trail
// change) one break at a time. It plays the run until it crashes or runs
// out, then has the explorer search from a moment shortly before that for a
// patch that takes the next apple, or the finish: first mostly following the
// run's own inputs, then, for a stretch that needs a new way, without them.
// The rest of the run carries on from the point in it that gets furthest
// from where the patch ends. A break that can't be patched from close by is
// tried again from further back. Each search only spans a few seconds, so it
// depends far less on luck than exploring the whole trail does.
const REPAIR_BACK = [1, 3, 6, 12];    // seconds before a break a patch may start
const REPAIR_STEPS = [2, 4, 6, 8].map(millions => millions * MILLION); // search budget for a patch from each of those, guided and then not
const REPAIR_REJOIN = 6;              // seconds around a patch's end to look for the place to rejoin the run

// The point in `inputs` to carry on from after a patch that left the ride as
// `ride`: the one whose rest gets furthest, preferring the patch's own guess.
function rejoin(ride, inputs, from, guess) {
  const window = Math.round(REPAIR_REJOIN / STEP);
  const candidates = guess != null ? [guess] : [];
  for (let at = Math.max(0, from - window); at < Math.min(inputs.length, from + window); at += DECISION_STEPS) candidates.push(at);
  // A patch that ends past the end of the run has nothing left to rejoin.
  let best = { at: inputs.length, progress: -Infinity };
  for (const at of candidates) {
    const probe = cloneRide(ride);
    let step = at;
    while (step < inputs.length && probe.status === 'running') stepRide(probe, inputs[step++]);
    const progress = probe.status === 'won' ? Infinity : probe.collected * 1e6 + step - at;
    if (progress > best.progress) best = { at, progress };
    if (progress === Infinity) break;
  }
  return best.at;
}

/** @param {object[]} reference per-step inputs of a run that once finished */
export function repairRun(entry, reference, { steps: budget = MAX_STEPS } = {}) {
  let spent = 0;
  let inputs = reference.slice();
  for (let patches = 0; ; patches++) {
    // Play the run, keeping a copy of the ride every decision to patch from.
    const ride = createRide(entry.trail);
    const saved = [];
    let step = 0;
    for (; step < inputs.length && ride.status === 'running'; step++) {
      if (step % DECISION_STEPS === 0) saved.push(cloneRide(ride));
      stepRide(ride, inputs[step]);
    }
    if (ride.status === 'won') return { inputs: inputs.slice(0, step), backtracks: 0, done: true, patches };
    const apples = ride.collected;
    const done = apples < ride.apples.length ? probe => probe.collected > apples : probe => probe.status === 'won';
    let patched = null;
    for (const [index, back] of REPAIR_BACK.entries()) {
      const from = Math.max(0, saved.length - 1 - Math.round(back / STEP / DECISION_STEPS));
      for (const guided of [true, false]) {
        const left = budget - spent;
        if (left <= 0) break;
        const stats = {};
        const result = exploreTrail(entry, guided ? [inputs] : [], {
          start: saved[from], at: from * DECISION_STEPS, done, steps: Math.min(REPAIR_STEPS[index], left), polish: false, stats
        });
        spent += stats.work;
        if (!result) continue;
        const end = cloneRide(saved[from]);
        for (const input of result.inputs) stepRide(end, input);
        const at = rejoin(end, inputs, from * DECISION_STEPS + result.inputs.length, result.at);
        process.stderr.write(`  ${entry.id}: patched a break at ${(step * STEP).toFixed(2)}s from ${back}s before it`
          + `${guided ? '' : ', finding a new way'}\n`);
        patched = inputs.slice(0, from * DECISION_STEPS).concat(result.inputs, inputs.slice(at));
        break;
      }
      if (patched) break;
    }
    if (!patched) return { inputs, backtracks: 0, done: false, patches };
    inputs = patched;
  }
}
