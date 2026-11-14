// Server-side run verification: replays the submitted inputs through the same
// deterministic simulation the game uses and takes the finish time from that.
import { createRide, stepRide, RIDE_VERSION } from '../../js/ride.js';
import { encodeInputs, decodeInputs } from '../../js/replay-codec.js';
import { trailHash } from '../../js/trail-hash.js';
import { HttpError } from './auth.mjs';

// Shipped trails only: official and bonus. Custom trails never reach the server.
export const TRAIL_RE = /^(official|bonus):[a-z0-9][a-z0-9-]{0,55}@[0-9a-f]{8}$/;
const MAX_STEPS = 600 * 120;      // ten minutes at 120 steps per second
const MAX_ROWS = 20_000;

const trailCache = new Map();
let trailLoader = null;

/** Swaps where shipped trails come from, for tests. */
export function useTrailLoader(loader) {
  trailLoader = loader;
}

/** Shipped trails, fetched from the deployed site so they always match the game build. */
async function fetchShippedTrail(id, origin) {
  if (trailLoader) return trailLoader(id);
  if (!trailCache.has(id)) {
    trailCache.set(id, (async () => {
      const load = async path => {
        const res = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.json();
      };
      const catalog = await load('/trails/catalog.json');
      const entry = catalog.trails?.find(item => item.id === id && ['official', 'bonus'].includes(item.source));
      return entry ? load('/trails/' + entry.file) : null;
    })().catch(error => { trailCache.delete(id); throw error; }));
  }
  return trailCache.get(id);
}

/** Whether `rows` are well-formed encoded inputs no longer than MAX_STEPS, checked before decoding them. */
export function validRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return false;
  let steps = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || (row.length !== 5 && row.length !== 6)) return false;
    const [count, facing, lean, accelerating, braking] = row;
    if (!Number.isInteger(count) || count < 1) return false;
    // A respawn is one step of its own.
    if (row.length === 6 && (row[5] !== 1 || count !== 1)) return false;
    if (facing !== 1 && facing !== -1) return false;
    if (typeof lean !== 'number' || !(lean >= -1 && lean <= 1)) return false;
    if ((accelerating !== 0 && accelerating !== 1) || (braking !== 0 && braking !== 1)) return false;
    steps += count;
    if (steps > MAX_STEPS) return false;
  }
  return true;
}

/**
 * @param {string} trailKey  'official:<id>@<hash>' or 'bonus:<id>@<hash>'
 * @param {{ inputs: number[][], seed: number, physics: number }} run
 * @param {string} origin  the site to load the trail from
 * @returns {Promise<{ timeMs: number, replay: object }>}
 */
export async function verifyRun(trailKey, run, origin) {
  if (!TRAIL_RE.test(trailKey)) throw new HttpError(400, 'bad trail');
  if (run?.physics !== RIDE_VERSION) throw new HttpError(409, 'outdated game version');
  if (!validRows(run.inputs)) throw new HttpError(400, 'bad inputs');
  const seed = Number(run.seed) >>> 0;

  const [id, hash] = trailKey.split('@');
  let trail = await fetchShippedTrail(id, origin);
  if (!trail) throw new HttpError(400, 'unknown trail');
  if (trailHash(trail) !== hash) {
    // A warm instance may still hold the trail from before a deploy changed
    // its ride; fetch it once more before calling the run outdated.
    trailCache.delete(id);
    trail = await fetchShippedTrail(id, origin);
    if (!trail || trailHash(trail) !== hash) throw new HttpError(409, 'outdated trail');
  }

  const inputs = decodeInputs(run.inputs);
  const ride = createRide(trail, { seed });
  let startStep = 0;
  // A crash only ends the run on a trail without flags: on one with them,
  // the rider can go back to the last flag reached.
  for (let index = 0; index < inputs.length && ride.status !== 'won'; index++) {
    if (stepRide(ride, inputs[index]).some(event => event.type === 'start')) startStep = index;
  }
  if (ride.status !== 'won') throw new HttpError(422, 'run does not finish');

  return {
    timeMs: Math.round(ride.elapsed * 1000),
    // Exactly what loadGhost() in the game expects.
    replay: {
      time: ride.elapsed, splits: ride.splits.slice(), startStep, seed,
      inputs: encodeInputs(inputs.slice(0, ride.steps)), physics: RIDE_VERSION,
    },
  };
}
