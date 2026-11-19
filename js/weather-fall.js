// @ts-check
// Where rain and snow land: the first terrain or water surface along each
// slanted falling path. The renderer draws drops and flakes landing there, and
// the effects let rain soak a rider it reaches, so the two always agree on
// what shelters what.
import { ART_PIXEL } from './drawing.js';
import { terrainGeometry, terrainRaycastAt } from './terrain.js';
import { waterBodies } from './water.js';

// Weather drifts sideways by `drift` world units per unit fallen, so every
// point on one path shares x - drift * y; paths are cached by that, a column
// this wide at a time, and each is cast against the terrain only once. A path
// is cast from above the highest terrain, as rain falls from the sky, so
// anything overhead shelters what is under it, however far above the view it
// is. The casts don't depend on the camera, so they last until the slant or
// the terrain changes.
export const WEATHER_COLUMN = ART_PIXEL * 2;
const weatherGround = new WeakMap();

/**
 * The first terrain or water surface on `trail` along the falling path
 * through (`x`, `y`) that drifts `drift` units sideways per unit fallen: its
 * `y` (Infinity when nothing is below), and whether it is water.
 * @returns {{ y: number, water: boolean }}
 */
export function weatherGroundAt(trail, x, y, drift) {
  const geometry = terrainGeometry(trail);
  let cache = weatherGround.get(trail);
  if (!cache || cache.geometry !== geometry)
    weatherGround.set(
      trail,
      (cache = { geometry, water: waterBodies(trail), paths: new Map(), slant: NaN, columns: null }),
    );
  const slant = Math.round(drift * 100) / 100;
  // Nearly every call is for the same slant as the last.
  let columns;
  if (cache.slant === slant) columns = cache.columns;
  else {
    columns = cache.paths.get(slant);
    if (!columns) {
      // Only a slider being dragged changes the slant; keep just the latest few.
      if (cache.paths.size >= 8) cache.paths.delete(cache.paths.keys().next().value);
      cache.paths.set(slant, (columns = new Map()));
    }
    cache.slant = slant;
    cache.columns = columns;
  }
  const column = Math.round((x - slant * y) / WEATHER_COLUMN);
  let hit = columns.get(column);
  if (hit === undefined) {
    const along = (atY) => column * WEATHER_COLUMN + slant * atY;
    hit = { y: Infinity, water: false };
    if (geometry) {
      const top = geometry.bounds.top - 1,
        bottom = geometry.bounds.bottom + 1;
      const contact = terrainRaycastAt(trail, along(top), top, along(bottom), bottom);
      if (contact) hit.y = contact.y;
    }
    for (const body of cache.water) {
      const at = along(body.y);
      if (at >= body.x && at <= body.x + body.width && body.y < hit.y) hit = { y: body.y, water: true };
    }
    columns.set(column, hit);
  }
  return hit;
}
