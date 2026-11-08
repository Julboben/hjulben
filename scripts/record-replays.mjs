// Records one replay per official trail with a search-based bot, so the
// regression tests have real full-trail runs to replay.
//
//   node scripts/record-replays.mjs            record trails whose replay is stale
//   node scripts/record-replays.mjs 03         only trails whose id or file name contains "03"
//   node scripts/record-replays.mjs --force    re-record even replays that still work (human runs are still used)
//   node scripts/record-replays.mjs --explore  skip the greedy bot and go straight to the explorer
//   REPLAY_BUDGET=10 node scripts/...          search budget per trail, in millions of simulation steps (default 40)
//   REPLAY_JOBS=4 node scripts/...             trails recorded at once (default: one per CPU core but one)
//
// Trails that need recording are recorded at the same time, each in its own
// process (started with --trail=<id>). The search budget counts simulation
// steps, not time, so a trail records the same however many jobs share the
// machine; more jobs than free cores only make it take longer. Keep the
// machine awake while it runs (e.g. `caffeinate -i` on macOS).
//
// A trail the bot can't figure out can be taught with a human run: save the
// ghost (localStorage `hjulben-ghost-v1:<trail id>@<hash>`) or the output of
// `hjulbenGame.dumpRun()` as tests/replays/human/<trail name>.json (the file name without its number). A human
// run that still finishes becomes the replay as is. One that stopped
// finishing, like an old replay broken by a physics change, is repaired
// where it breaks (see repairRun), and failing that guides the explorer.
//
// An existing replay is kept (its outcome refreshed) while it still finishes
// the trail, so editing one trail or tweaking physics only re-records the
// trails that broke. A replay that never finished is kept until its trail
// changes, since the bot would most likely fail again.
//
// The bot tries each input combination held over a short horizon on a copy
// of the ride, keeps the best-scoring one for a few steps, and repeats. When
// every option ahead crashes it backs up a little and searches again. If it
// can't finish a trail, the explorer (see exploreTrail) takes over: it finds
// routes that turn around, roll back for a run-up or launch off kickers.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { simulateRun } from '../js/ride.js';
import { decodeInputs, encodeInputs } from '../js/replay-codec.js';
import { MAX_STEPS, exploreTrail, recordTrail, repairRun } from './lib/replay-bot.mjs';
import { loadCatalogTrails, replayFile, repoRoot } from './lib/trails.mjs';

const OUT_DIR = repoRoot + 'tests/replays/';
const HUMAN_DIR = OUT_DIR + 'human/';

const args = process.argv.slice(2);
const force = args.includes('--force');
const exploreOnly = args.includes('--explore');
const filter = args.find(arg => !arg.startsWith('--')) || '';
// Set on the processes that record one trail each.
const onlyTrail = args.find(arg => arg.startsWith('--trail='))?.slice('--trail='.length);
const jobs = Number(process.env.REPLAY_JOBS) || Math.max(1, availableParallelism() - 1);
const trailHash = trail => createHash('sha256').update(JSON.stringify(trail)).digest('hex').slice(0, 16);

function outcomeOf(trail, inputs, seed = 1) {
  const { ride, events } = simulateRun(trail, inputs, { seed });
  const flips = events.filter(event => event.type === 'flip').reduce((sum, event) => sum + event.count, 0);
  return {
    ride,
    outcome: {
      status: ride.status,
      elapsed: Math.round(ride.elapsed * 1000) / 1000,
      collected: ride.collected,
      apples: ride.apples.length,
      crashCause: ride.crashCause,
      flips
    }
  };
}

// Returns the existing replay's inputs if they are still worth keeping.
function reusable(entry, path, hash, references) {
  if (force || !existsSync(path)) return null;
  let replay;
  try { replay = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  if (replay.trail !== entry.id) return null;
  const inputs = decodeInputs(replay.inputs);
  const { ride, outcome } = outcomeOf(entry.trail, inputs, replay.seed);
  if (ride.status === 'won') return { inputs: inputs.slice(0, ride.steps), reason: 'still finishes' };
  // A human run added since might finish where the bot couldn't.
  const unchanged = !references.length && replay.trailHash === hash && replay.outcome?.status !== 'won'
    && JSON.stringify(outcome) === JSON.stringify(replay.outcome);
  return unchanged ? { inputs, reason: 'never finished, trail unchanged (--force to retry)' } : null;
}

// Runs that once finished the trail: a human run, and the replay if it did
// (unless --force asks for a fresh recording).
function referencesFor(file, path) {
  const references = [];
  const runs = [['human run', HUMAN_DIR + file], ...force ? [] : [['previous replay', path]]];
  for (const [source, run] of runs) {
    if (!existsSync(run)) continue;
    let data;
    try { data = JSON.parse(readFileSync(run, 'utf8')); } catch { console.log(`  ${run}: unreadable, skipped`); continue; }
    if (source === 'previous replay' && data.outcome?.status !== 'won') continue;
    if (Array.isArray(data.inputs) && data.inputs.length) references.push({ source, inputs: decodeInputs(data.inputs) });
  }
  return references;
}

// If nothing finishes, the reference that gets furthest is better than an empty replay.
function furthest(entry, references) {
  let best = { inputs: [], backtracks: 0 }, bestProgress = -Infinity;
  for (const { inputs } of references) {
    const { ride } = outcomeOf(entry.trail, inputs);
    const progress = ride.collected * 1e5 + ride.elapsed;
    if (progress > bestProgress) { bestProgress = progress; best = { inputs: inputs.slice(0, ride.steps), backtracks: 0 }; }
  }
  return best;
}

// Whether a trail's replay can be kept, and what it has to go on if not.
function plan(entry) {
  const file = replayFile(entry);
  const path = OUT_DIR + file;
  const hash = trailHash(entry.trail);
  const references = referencesFor(file, path);
  return { path, hash, references, reuse: reusable(entry, path, hash, references) };
}

/** Writes a trail's replay, kept or newly recorded. */
function record(entry, { path, hash, references, reuse }) {
  const started = Date.now();
  let result = reuse;
  for (const { source, inputs } of reuse ? [] : references) {
    const { ride } = outcomeOf(entry.trail, inputs);
    if (ride.status === 'won') { result = { inputs: inputs.slice(0, ride.steps), backtracks: 0, source }; break; }
  }
  // A reference that stopped finishing is patched where it breaks.
  for (const { source, inputs } of result ? [] : references) {
    console.log(`  ${entry.id}: repairing the ${source}`);
    const repaired = repairRun(entry, inputs, { steps: MAX_STEPS / references.length });
    if (repaired.done) { result = { ...repaired, source: `repaired ${source}` }; break; }
  }
  // The greedy bot can't use a reference, so a trail that has one goes straight to the explorer.
  if (!result && !exploreOnly && !references.length) result = recordTrail(entry);
  if (!result || (!reuse && outcomeOf(entry.trail, result.inputs).ride.status !== 'won')) {
    if (result) console.log(`  ${entry.id}: the greedy bot didn't finish, exploring`);
    else if (references.length) console.log(`  ${entry.id}: exploring, guided by the ${references.map(ref => ref.source).join(' and ')}`);
    result = exploreTrail(entry, references.map(ref => ref.inputs)) || result || furthest(entry, references);
  }
  const { inputs, backtracks } = result;
  const { ride, outcome } = outcomeOf(entry.trail, inputs);
  const replay = {
    trail: entry.id,
    recordedBy: 'scripts/record-replays.mjs',
    seed: 1,
    trailHash: hash,
    steps: inputs.length,
    outcome,
    inputs: encodeInputs(inputs)
  };
  const text = JSON.stringify(replay) + '\n';
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
  const summary = `${ride.status} in ${ride.elapsed.toFixed(2)}s, ${ride.collected}/${ride.apples.length} apples`;
  if (reuse) {
    console.log(`${entry.id}: kept, ${reuse.reason} (${summary})`);
    return;
  }
  if (result.source) console.log(`${entry.id}: recorded from the ${result.source}, ${summary}`);
  else {
    console.log(`${entry.id}: recorded, ${summary}, ${replay.inputs.length} input runs, `
      + `${backtracks} backtracks, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}

/** Records a trail in a process of its own; resolves once it's done. */
function recordElsewhere(entry) {
  const passed = args.filter(arg => arg === '--force' || arg === '--explore');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), `--trail=${entry.id}`, ...passed], { stdio: 'inherit' });
  return new Promise(resolve => child.on('close', code => {
    if (code) console.log(`${entry.id}: recording failed (exit code ${code})`);
    resolve();
  }));
}

mkdirSync(OUT_DIR, { recursive: true });
const officialTrails = loadCatalogTrails('official');
if (onlyTrail) {
  const entry = officialTrails.find(candidate => candidate.id === onlyTrail);
  if (!entry) throw new Error(`no official trail ${onlyTrail}`);
  record(entry, plan(entry));
} else {
  // Drop replays left behind when an official trail is renamed or removed.
  const expected = new Set(officialTrails.map(replayFile));
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith('.json') || expected.has(file)) continue;
    unlinkSync(OUT_DIR + file);
    console.log(`${file}: removed, no official trail uses it`);
  }
  let kept = 0;
  const queue = [];
  for (const entry of officialTrails) {
    if (!entry.id.includes(filter) && !entry.file.includes(filter)) continue;
    const planned = plan(entry);
    if (planned.reuse) { record(entry, planned); kept++; } else queue.push({ entry, planned });
  }
  const recorded = queue.length;
  if (recorded > 1 && jobs > 1) {
    console.log(`Recording ${recorded} trails, ${Math.min(jobs, recorded)} at a time.`);
    await Promise.all(Array.from({ length: Math.min(jobs, recorded) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await recordElsewhere(next.entry);
    }));
  } else {
    for (const { entry, planned } of queue) record(entry, planned);
  }
  console.log(`${recorded} recorded, ${kept} kept.`);
}
