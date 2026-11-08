// Tests the replay bot on one stretch of a human run at a time, to find out
// which part of a trail it can't work out by itself.
//
//   node scripts/probe-replay-bot.mjs 24              every stretch, one process each
//   node scripts/probe-replay-bot.mjs 24 --segment 3  only the stretch from apple 3 to apple 4
//   PROBE_BUDGET=12 node scripts/...                  budget per stretch in millions of simulation steps
//                                                     (default 8), split between greedy and explorer
//
// The human run (tests/replays/human/<trail file>.json) is played up to the
// moment it takes apple k; from that exact ride the bot then has to take one
// more apple, or finish once every apple is taken. No reference is given.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STEP } from '../js/config.js';
import { createRide, stepRide } from '../js/ride.js';
import { decodeInputs } from '../js/replay-codec.js';
import { MILLION, cloneRide, exploreTrail, recordTrail } from './lib/replay-bot.mjs';
import { loadCatalogTrails, replayFile, repoRoot } from './lib/trails.mjs';

const BUDGET = (Number(process.env.PROBE_BUDGET) || 8) * MILLION;
const args = process.argv.slice(2);
const filter = args.find(arg => !arg.startsWith('--')) || '';
const segmentArg = args.indexOf('--segment');
const entry = loadCatalogTrails('official').find(candidate => candidate.id.includes(filter) || candidate.file.includes(filter));
if (!filter || !entry) throw new Error(`no official trail matches "${filter}"`);
const human = JSON.parse(readFileSync(repoRoot + 'tests/replays/human/' + replayFile(entry), 'utf8'));
const inputs = decodeInputs(human.inputs);

// Where the human run was when it had taken each number of apples.
const starts = [];
{
  const ride = createRide(entry.trail);
  starts.push({ ride: cloneRide(ride), step: 0 });
  for (let index = 0; index < inputs.length && ride.status === 'running'; index++) {
    const before = ride.collected;
    stepRide(ride, inputs[index]);
    if (ride.collected > before) starts.push({ ride: cloneRide(ride), step: index + 1 });
  }
  if (ride.status !== 'won') throw new Error(`${entry.id}: the human run doesn't finish (${ride.status})`);
  starts.push({ ride: null, step: ride.steps });
}
const segments = starts.length - 2;

if (segmentArg < 0) {
  // Every stretch at once, one process each.
  console.log(`${entry.id}: ${segments + 1} stretches, ${BUDGET / MILLION} million steps of search each`);
  const runs = Array.from({ length: segments + 1 }, (_, segment) => new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), filter, '--segment', String(segment)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('close', () => resolve(out.trimEnd().split('\n').pop()));
  }));
  for (const line of await Promise.all(runs)) console.log(line);
} else {
  const segment = Number(args[segmentArg + 1]);
  const from = starts[segment];
  const last = segment === segments;
  const goal = last ? 'finish' : `apple ${segment + 1}`;
  const done = last ? ride => ride.status === 'won' : ride => ride.collected > segment;
  const humanSeconds = ((starts[segment + 1].step - from.step) * STEP).toFixed(2);
  const describe = result => result?.done ? `ok in ${(result.inputs.length * STEP).toFixed(2)}s` : 'failed';
  const greedy = recordTrail(entry, { start: from.ride, done, steps: BUDGET / 2 });
  const explorer = greedy.done ? null : exploreTrail(entry, [], { start: from.ride, done, steps: BUDGET / 2 });
  console.log(`  apple ${segment} -> ${goal.padEnd(8)} human ${humanSeconds.padStart(6)}s | greedy ${describe(greedy)}`
    + (greedy.done ? '' : ` | explorer ${describe(explorer)}`));
}
