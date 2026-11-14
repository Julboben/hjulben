// @ts-check
// Checkpoints: flags along a long trail that a crashed or stuck rider can go
// back to instead of the start. Only geometry lives here, so the ride, the
// trail checks, the renderer and the editor agree on where a flag stands and
// what counts as reaching it.
import { RADIUS } from './config.js';
import { terrainAt } from './terrain.js';

/** How far above its foot the flag reaches: the flagpole's height. */
export const CHECKPOINT_HEIGHT = 170;
// The bike counts as at the flag while its middle is within this of the
// pole's foot below it, or anywhere up the pole, so a rider hopping past
// low still reaches it but one flying over the top does not.
const CHECKPOINT_BELOW = 30;

// A flag looks for the ground it stands on from this far above its height,
// and a wheel set down at it from this far above the flag's foot, so a
// height dragged a little into the ground, or the uphill wheel on a slope,
// still finds the same surface.
const GROUND_SEEK = 40;

/**
 * Where a checkpoint's flag stands: always on the ground, the top surface at
 * its x, or with a height of its own the surface at or below that height, for
 * a lower floor or a cave. Below all the terrain when there is none.
 * @param {import('./types.js').Trail} trail
 * @param {{ x: number, y?: number | null }} checkpoint
 */
export function checkpointFoot(trail, checkpoint) {
  const reference = Number.isFinite(checkpoint.y) ? /** @type {number} */ (checkpoint.y) - GROUND_SEEK : null;
  return { x: checkpoint.x, y: terrainAt(trail, checkpoint.x, reference).y };
}

/**
 * The height of a wheel's centre resting at `x` on the ground a flag stands on.
 * @param {import('./types.js').Trail} trail
 * @param {{ x: number, y: number }} foot
 * @param {number} x
 */
export function checkpointWheelY(trail, foot, x) {
  return terrainAt(trail, x, foot.y - GROUND_SEEK).y - RADIUS;
}

/**
 * Whether the bike is at the flag: the pole stands between its axles, with
 * the bike's middle no higher than the pole's top.
 * @param {{ x: number, y: number }} foot
 * @param {{ x: number, y: number }} rear
 * @param {{ x: number, y: number }} front
 */
export function bikeAtCheckpoint(foot, rear, front) {
  if (foot.x < Math.min(rear.x, front.x) || foot.x > Math.max(rear.x, front.x)) return false;
  const middle = (rear.y + front.y) / 2;
  return middle >= foot.y - CHECKPOINT_HEIGHT && middle <= foot.y + CHECKPOINT_BELOW;
}
