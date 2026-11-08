// @ts-check
import { RIDE_VERSION } from './ride.js';
import { TERRAIN_COMPILER_VERSION } from './terrain-runtime.js';

// Identifies a trail by the geometry and rules that decide a run, so renaming
// or re-importing a trail keeps its leaderboard, while any edit that changes
// the ride starts a fresh one.
//
// The terrain compiler and physics versions are hashed too: a compiler change
// alters what the wheels touch and a physics change how the bike rides, so
// old replays and scores must not carry over. Bumping RIDE_VERSION starts
// fresh leaderboards, ghosts and best times on every trail.
const GAMEPLAY_KEYS = ['terrainBlocks', 'start', 'finish', 'apples', 'spikes'];

/** JSON with sorted keys, so equal trails compare equal whatever order their keys were written in. */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}

/** FNV-1a over the canonical gameplay fields, as 8 hex digits. */
export function trailHash(trail) {
  /** @type {Record<string, unknown>} */
  const fields = Object.fromEntries(GAMEPLAY_KEYS.map(key => [key, trail?.[key]]));
  // Back walls are scenery, so they never change the hash, and nor does the
  // editor group a block is in.
  if (Array.isArray(fields.terrainBlocks))
    fields.terrainBlocks = fields.terrainBlocks
      .filter(block => block?.layer !== 'back')
      .map(block => (block && typeof block === 'object' && 'group' in block ? { ...block, group: undefined } : block));
  // The first block's material, under the key every published hash was made with.
  if (Array.isArray(fields.terrainBlocks)) fields.terrain = fields.terrainBlocks[0]?.material;
  fields.terrainCompiler = TERRAIN_COMPILER_VERSION;
  fields.physics = RIDE_VERSION;
  // Water is only hashed when a trail has some.
  if (Array.isArray(trail?.water) && trail.water.length) fields.water = trail.water;
  const text = canonical(fields);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
