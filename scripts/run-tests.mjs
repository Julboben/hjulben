// Runs the checks: `npm test` the fast ones, side by side on every core;
// `npm run test:slow` the playtest tools, whose bot searches take a while;
// `npm run test:all` both, the slow ones last and alone. The searches count
// simulation steps rather than time, so their results don't depend on the
// machine's load; running them alone only makes them finish sooner.
//
//   node scripts/run-tests.mjs [--slow | --all] [--verbose]
//
// Each check's output is shown when it fails, or for every check with
// --verbose, and never interleaved with another's.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { repoRoot } from './lib/trails.mjs';

const node = script => [process.execPath, `scripts/${script}`];
const test = name => ({ name, command: node(`test-${name}.mjs`) });
const check = (name, script) => ({ name, command: [...node(script), '--check'] });

// The slowest first, so they start before the cores fill with quick ones.
const FAST = [
  test('replays'),
  test('groups'),
  test('console'),
  test('editor-dom'),
  test('editor-storage'),
  test('vehicle-physics'),
  check('limits', 'measure-limits.mjs'),
  test('terrain-runtime'),
  ...[
    'det-math', 'terrain-geometry', 'terrain-render', 'lighting', 'terrain-integration',
    'terrain-schema', 'editor-terrain', 'editor-gestures', 'editor-snap', 'editor-markup',
    'terrain', 'physics', 'flips', 'glass', 'trail-schema', 'weather', 'time-of-day',
    'trail-link', 'career', 'water', 'squirrel', 'rabbit', 'corgi', 'interactions', 'desert',
    'mountain', 'event', 'prison', 'spiders', 'dungeon', 'countryside', 'apples', 'nisse', 'checkpoints',
    'prop-drawing', 'spikes', 'cosmetics', 'achievements', 'storage', 'pending-runs',
    'changelog', 'haptics', 'notifications',
  ].map(test),
  check('icons', 'generate-icons.mjs'),
  { name: 'tokens', command: node('check-tokens.mjs') },
  check('sw', 'generate-sw-core.mjs'),
  check('overview', 'generate-trails-overview.mjs'),
  check('context', 'generate-authoring-context.mjs'),
];
const SLOW = [test('playtest')];

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const fast = args.includes('--slow') ? [] : FAST;
const slow = args.includes('--slow') || args.includes('--all') ? SLOW : [];

/** Run one check, keeping what it prints for later. */
function run({ name, command }) {
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('close', code => resolve({ name, ok: code === 0, output, seconds: (Date.now() - started) / 1000 }));
  });
}

function report(result) {
  const time = `${result.seconds.toFixed(1)} s`.padStart(7);
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${time}  ${result.name}`);
  if (!result.ok || verbose) {
    const text = result.output.trimEnd();
    if (text) console.log(text.replace(/^/gm, '      | '));
  }
}

/** Run checks with at most `width` at a time, reporting each as it ends. */
async function runAll(checks, width) {
  const results = [];
  let next = 0;
  async function lane() {
    while (next < checks.length) {
      const result = await run(checks[next++]);
      report(result);
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, checks.length) }, lane));
  return results;
}

const started = Date.now();
const results = [
  ...(await runAll(fast, availableParallelism())),
  ...(await runAll(slow, 1)),
];
const failed = results.filter(result => !result.ok);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} checks failed in ${seconds} s: ${failed.map(result => result.name).join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed in ${seconds} s.`);
