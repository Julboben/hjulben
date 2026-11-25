// @ts-check
// Water: rectangles of still water that fill the open air inside them. The top
// of the rectangle is the surface; terrain inside it stays solid, so a body
// drawn over a pit fills the pit, and one drawn inside a cave floods the cave.
//
// Everything here that touches the simulation uses plain arithmetic and
// det-math only, so rides and replays stay deterministic.
import { GRAVITY, STEP, TAU, clamp } from "./config.js";
import { hypot } from "./det-math.js";
import { terrainColumnSpans } from "./terrain-runtime.js";

/** @typedef {import('./types.js').Water} Water */

/** Sizes in world units. A new body gets the defaults. */
export const WATER_SIZE = {
  minWidth: 16,
  minDepth: 8,
  width: 240,
  depth: 32,
};

/**
 * A wheel deeper than this below the surface wipes the rider out, so a body
 * up to this deep is a rideable ford and anything deeper is a hazard. It is
 * about where the water reaches the seat.
 */
export const WATER_WIPEOUT_DEPTH = 40;

// How water pushes on what is in it. Buoyancy is a share of gravity at full
// submersion: the bike sinks slowly, the rider floats. Drag slows anything in
// the water, more the faster it goes, so a rider dropping in hits it with a
// slap. Spin is how fast water brakes a wheel's rotation.
export const BIKE_WATER = { buoyancy: 0.35, drag: 1.1, quadratic: 0.0035, spin: 1.6 };
// A person is only a little lighter than water, so a rider who falls in goes
// well under and takes a couple of seconds to come back up. What lifts them
// is the air in their chest and helmet, so those float and the legs hang
// lower, as people float in the water: each of the ragdoll's joints has its
// own buoyancy.
const riderWater = (buoyancy) => ({ buoyancy, drag: 1, quadratic: 0.003, spin: 0 });
export const RAGDOLL_WATER = {
  // A helmet's foam and air lift the head clear.
  head: riderWater(2.0),
  shoulder: riderWater(1.6),
  hip: riderWater(1.0),
  elbow: riderWater(0.9),
  hand: riderWater(0.85),
  knee: riderWater(0.85),
  foot: riderWater(0.8),
};
// A bare head, never helmeted or with the helmet knocked off, is a little
// heavier than water, so the rider floats lower with their chin in it.
export const BARE_HEAD_WATER = riderWater(1.6);

// Thickness the rider's limbs and the chassis present to the water, which
// sets how gently they settle at the surface.
export const RAGDOLL_WATER_RADIUS = 8;
export const CHASSIS_WATER_RADIUS = 8;

export const WATER_COLORS = {
  body: "#3f9fc466",
  deep: "#1f5f8a55",
  shine: "#8fd6e888",
  foam: "#e4f7f4cc",
  splash: ["#e4f7f4", "#8fd6e8", "#5fb4d4"],
};

// Speed into the water, in world units a second, that throws up a splash.
export const SPLASH_SPEED = 90;

/**
 * Normalize a water body. Missing or invalid sizes get the defaults, and sizes
 * below the minimum are raised to it.
 * @returns {Water}
 */
export function normalizeWater(body) {
  const size = (value, min, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.max(min, number) : fallback;
  };
  return {
    x: Number.isFinite(Number(body?.x)) ? Number(body.x) : 0,
    y: Number.isFinite(Number(body?.y)) ? Number(body.y) : 0,
    width: size(body?.width, WATER_SIZE.minWidth, WATER_SIZE.width),
    depth: size(body?.depth, WATER_SIZE.minDepth, WATER_SIZE.depth),
  };
}

/** A trail's water bodies, normalized. */
export function waterBodies(trail) {
  return Array.isArray(trail?.water) ? trail.water.map(normalizeWater) : [];
}

/** Can a body of this depth wipe the rider out? */
export const deepWater = (depth) => depth > WATER_WIPEOUT_DEPTH;

/** The body whose rectangle holds a point, or null. */
export function waterAt(bodies, x, y) {
  for (const body of bodies)
    if (
      x >= body.x &&
      x <= body.x + body.width &&
      y >= body.y &&
      y <= body.y + body.depth
    )
      return body;
  return null;
}

/**
 * How much of a disc is under water: 0 dry, 1 fully submerged, measured from
 * the surface down and cut off at the bottom of the body. The most submerged
 * body wins where bodies overlap.
 */
export function submergedFraction(bodies, x, y, radius) {
  let best = 0;
  for (const body of bodies) {
    if (x < body.x || x > body.x + body.width) continue;
    const below = clamp((y + radius - body.y) / (2 * radius), 0, 1);
    const above = clamp((body.y + body.depth - (y - radius)) / (2 * radius), 0, 1);
    best = Math.max(best, Math.min(below, above));
  }
  return best;
}

/**
 * Drag and buoyancy on a Verlet point, by changing its velocity (`x - ox`)
 * ahead of the next integration. Returns how submerged the point is.
 */
export function applyWater(point, radius, bodies, params) {
  const submerged = submergedFraction(bodies, point.x, point.y, radius);
  if (!submerged) return 0;
  let vx = point.x - point.ox,
    vy = point.y - point.oy;
  const speed = hypot(vx, vy) / STEP;
  const keep = Math.max(
    0,
    1 - STEP * submerged * (params.drag + params.quadratic * speed),
  );
  vx *= keep;
  vy = vy * keep - params.buoyancy * GRAVITY * submerged * STEP * STEP;
  point.ox = point.x - vx;
  point.oy = point.y - vy;
  if (params.spin && point.angularVelocity)
    point.angularVelocity *= Math.max(0, 1 - STEP * submerged * params.spin);
  return submerged;
}

/**
 * How far under the surface the bottom of a wheel is, in the body that holds
 * its centre, or 0 when it is not in water. The body's floor caps it, so a
 * body no deeper than the wipe-out depth can never wipe the rider out.
 */
export function wheelImmersion(bodies, x, y, radius) {
  let deepest = 0;
  for (const body of bodies) {
    if (x < body.x || x > body.x + body.width) continue;
    if (y < body.y || y > body.y + body.depth) continue;
    deepest = Math.max(deepest, Math.min(y + radius, body.y + body.depth) - body.y);
  }
  return deepest;
}

/**
 * The body whose surface a point crossed going down between two positions,
 * or null.
 */
export function surfaceCrossing(bodies, fromX, fromY, toX, toY) {
  for (const body of bodies)
    if (
      fromY < body.y &&
      toY >= body.y &&
      toX >= body.x &&
      toX <= body.x + body.width
    )
      return body;
  return null;
}

// ---- Drawing ---------------------------------------------------------------
// The drawn surface moves, the simulated one does not: the bike and rider
// always meet a flat surface at the top of the body, so nothing below feeds
// back into a ride and it may use Math.sin and Math.random.

// World units in an art pixel, the grid the surface is drawn on.
const SURFACE_PIXEL = 2;

// Wind waves need open water to build up over. A pond gets ripples that grow
// with the wind up to POND_FETCH units of open surface; beyond it, a lake or
// a sea builds swell, at its tallest and longest over OCEAN_FETCH more, as
// real waves grow with the wind and the stretch of water it blows over.
const POND_FETCH = 400, OCEAN_FETCH = 2400;
// Waves die away this far from where the water meets a bank, so the waterline
// stays put against it.
const WAVE_TAPER = 28;

/**
 * The wind waves on a stretch of open surface `length` long over water
 * `depth` deep, in a wind of `strength` (0…1): the swell's `height`, the
 * `chop` on top of it and the swell's wavelength, in world units, and how
 * fast each travels downwind, in units a second. Shallow water can't hold
 * waves much taller than a third of its depth, so a ford only ever ripples.
 */
export function windWaves(length, depth, strength) {
  const pond = Math.min(1, length / POND_FETCH);
  const open = clamp((length - POND_FETCH) / OCEAN_FETCH, 0, 1) ** 0.7;
  const height = Math.min(depth * 0.35, pond * (0.3 + 3.4 * strength) + open * 14 * strength ** 2);
  const chop = Math.min(depth * 0.15, pond * 1.6 * strength ** 2);
  const swell = 130 + 270 * open;
  // Longer waves travel faster, as they do on deep water.
  return { height, chop, swell, swellSpeed: 1.2 * Math.sqrt(swell), chopSpeed: 7 };
}

// A wave with sharper crests and flatter troughs than a sine: -1 at the
// trough, 1.175 at the crest.
const crest = (wave) => wave + 0.35 * (wave * wave - 0.5);

// The ripples spread as springs between neighbouring columns, stepped at a
// fixed rate whatever the frame rate: each column is pulled back to rest
// (TENSION) and slowed (DAMPING), and passes some of its height to its
// neighbours (SPREAD, in SPREAD_PASSES rounds a step, so ripples travel at a
// believable speed). The ends of a stretch are held still by the banks.
const SPRING_STEP = 1 / 60;
const TENSION = 0.03, DAMPING = 0.015, SPREAD = 0.12, SPREAD_PASSES = 6;
// Ripples smaller than this, in world units, have died away.
const SETTLED = 0.02;
// Churned water, columns moving faster than this (units a spring step), and
// wind waves taller than CAP_HEIGHT near their crests, are drawn with foam.
const CHURN = 0.35, CAP_HEIGHT = 1.2;
// Something floating this close to the surface, above or below, bobs with it.
const FLOAT_BAND = 24;
// Raindrops striking the surface: how many a second fall on each unit of it
// in a downpour, and how hard each pushes it down.
const RAIN_DROPS = 1 / 40, RAIN_PUSH = 0.35;

/**
 * The drawn surfaces of a ride's water: wind waves sized by the open water
 * and the wind, and ripples from whatever disturbs it (the bike, the rider,
 * splashes and rain) that spread out and reflect off the banks.
 */
export function createWaterSurface() {
  /** @type {any[]} */ let runs = [];
  let time = 0, lag = 0, wind = -1, downwind = -1;
  let last = null;
  const sampled = { offset: 0, foam: false };

  /**
   * Starts afresh on a ride's water: each stretch of open surface, from
   * `waterColumns`, becomes a run of columns with its own waves.
   * @param {Water[]} bodies
   * @param {any} compiled terrain from `terrainGeometry`, or null
   */
  function reset(bodies, compiled) {
    runs = [];
    time = 0; lag = 0; wind = -1; last = null;
    for (const body of bodies) {
      let run = null;
      for (const { x, segments } of waterColumns(compiled, body, SURFACE_PIXEL)) {
        const open = Math.abs(segments[0][0] - body.y) < 0.5;
        if (open && run && x === run.right) { run.right += SURFACE_PIXEL; continue; }
        if (run) runs.push(run);
        run = open ? { body, left: x, right: x + SURFACE_PIXEL } : null;
      }
      if (run) runs.push(run);
    }
    for (const run of runs) {
      const count = (run.right - run.left) / SURFACE_PIXEL;
      Object.assign(run, { height: new Float32Array(count), speed: new Float32Array(count), waves: null, active: false });
    }
  }

  // The run whose surface is at `y` and reaches over `x`, or null.
  function runAt(x, y) {
    if (last && x >= last.left && x < last.right && Math.abs(last.body.y - y) < 1) return last;
    for (const run of runs)
      if (x >= run.left && x < run.right && Math.abs(run.body.y - y) < 1) return (last = run);
    return null;
  }

  /**
   * Moves the surface on by `dt` seconds in `weather`: the waves roll on and
   * the ripples spread and settle. 0 holds it still.
   * @param {number} dt
   * @param {import('./weather.js').Weather} weather resolved
   */
  function step(dt, weather) {
    if (wind !== weather.wind) {
      wind = weather.wind;
      for (const run of runs) run.waves = windWaves(run.right - run.left, run.body.depth, wind);
    }
    downwind = weather.windDirection === "right" ? 1 : -1;
    if (!dt) return;
    time += dt;
    if (weather.rain > 0)
      for (const run of runs) {
        const drops = weather.rain * RAIN_DROPS * (run.right - run.left) * dt;
        for (let drop = Math.floor(drops + Math.random()); drop > 0; drop--)
          push(run, run.left + Math.random() * (run.right - run.left), RAIN_PUSH * (0.5 + Math.random()), 2);
      }
    lag = Math.min(lag + dt, SPRING_STEP * 6);
    for (; lag >= SPRING_STEP; lag -= SPRING_STEP)
      for (const run of runs) if (run.active) settle(run);
  }

  function settle(run) {
    const { height, speed } = run;
    const end = height.length - 1;
    let moving = false;
    for (let index = 1; index < end; index++) {
      speed[index] -= TENSION * height[index] + DAMPING * speed[index];
      height[index] += speed[index];
    }
    height[0] = height[end] = speed[0] = speed[end] = 0;
    for (let pass = 0; pass < SPREAD_PASSES; pass++) {
      let before = height[0];
      for (let index = 1; index < end; index++) {
        const here = height[index];
        const share = SPREAD * (before + height[index + 1] - 2 * here);
        before = here;
        height[index] += share;
        speed[index] += share;
      }
    }
    for (let index = 1; index < end; index++)
      if (Math.abs(height[index]) > SETTLED || Math.abs(speed[index]) > SETTLED) { moving = true; break; }
    if (!moving) { height.fill(0); speed.fill(0); }
    run.active = moving;
  }

  // Pushes a run's columns around `x` down (a positive `strength`, in units a
  // spring step) or up, falling off over `spread` units either side.
  function push(run, x, strength, spread) {
    const { speed } = run;
    const from = Math.max(1, Math.floor((x - 2 * spread - run.left) / SURFACE_PIXEL));
    const to = Math.min(speed.length - 2, Math.ceil((x + 2 * spread - run.left) / SURFACE_PIXEL));
    for (let index = from; index <= to; index++) {
      const away = run.left + (index + 0.5) * SURFACE_PIXEL - x;
      speed[index] += strength * Math.exp(-(away * away) / (2 * spread * spread));
    }
    if (from <= to) run.active = true;
  }

  /**
   * Pushes the surface near (`x`, `y`) down by `strength` (up if negative),
   * spread over about `spread` units either side: something breaking the
   * surface or moving through it. Water `y` is in, or just above, counts.
   */
  function disturb(x, y, strength, spread = 4) {
    for (const run of runs) {
      const { body } = run;
      if (x < run.left - spread || x > run.right + spread || y < body.y - 12 || y > body.y + body.depth) continue;
      push(run, x, strength, spread);
    }
  }

  /**
   * The drawn surface at `x` on the water whose surface is at `y`: its
   * `offset` from `y` in whole art pixels, down positive, and whether it
   * shows `foam` there, on a windblown crest or where the water is churned
   * up. The same object is reused for every call.
   */
  function sample(x, y) {
    sampled.offset = 0;
    sampled.foam = false;
    const run = runAt(x, y);
    if (!run) return sampled;
    const index = Math.floor((x - run.left) / SURFACE_PIXEL);
    let wave = 0;
    const waves = run.waves;
    if (waves && (waves.height || waves.chop)) {
      const edge = Math.min(x - run.left, run.right - x) / WAVE_TAPER;
      const taper = edge >= 1 ? 1 : edge * edge * (3 - 2 * edge);
      const along = (length, speed) => (TAU * (x - downwind * speed * time)) / length;
      const swell = 0.75 * crest(Math.sin(along(waves.swell, waves.swellSpeed)))
        + 0.25 * crest(Math.sin(along(waves.swell * 0.61, waves.swellSpeed * 0.78) + 2.1));
      const chop = crest(Math.sin(along(34, waves.chopSpeed) + 1.3));
      wave = -taper * (waves.height * swell + waves.chop * chop);
      sampled.foam = waves.height + waves.chop > CAP_HEIGHT && wave < -0.7 * (waves.height + waves.chop) * taper;
    }
    sampled.offset = Math.round((wave + run.height[index]) / SURFACE_PIXEL) * SURFACE_PIXEL;
    if (Math.abs(run.speed[index]) > CHURN) sampled.foam = true;
    return sampled;
  }

  /** How far the drawn surface at `x` on the water at `y` is off it; see `sample`. */
  const offset = (x, y) => sample(x, y).offset;

  /**
   * How far something floating at (`x`, `y`) is carried up or down by the
   * drawn surface, in whole art pixels: all of the surface's offset at the
   * surface, fading out over FLOAT_BAND units above or below it.
   */
  function carry(x, y) {
    for (const run of runs) {
      if (x < run.left || x >= run.right) continue;
      const away = Math.abs(y - run.body.y);
      if (away >= FLOAT_BAND) continue;
      const share = 1 - away / FLOAT_BAND;
      return Math.round((offset(x, run.body.y) * share) / SURFACE_PIXEL) * SURFACE_PIXEL;
    }
    return 0;
  }

  return { reset, step, disturb, sample, offset, carry };
}

/**
 * Whether a glint of light shows on the surface at `x` at `time`: short
 * bright dashes that drift slowly along the water and fade in and out.
 */
export function surfaceGlint(x, time) {
  const cell = Math.floor((x + time * 6) / 6);
  let hash = Math.imul(cell ^ 0x9e3779b9, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % 100 > 62 && Math.sin(time * 0.7 + (hash % 600) / 100) > 0.2;
}

// Which parts of a body are open water, column by column: the rectangle minus
// the terrain. Cached per compiled terrain, so it is only worked out again
// when the terrain or the body changes.

const columnCache = new WeakMap();
const NO_TERRAIN = {};
const CACHE_LIMIT = 96;

/**
 * Open-water segments of a body in columns `step` wide on the world's pixel
 * grid: `[{ x, segments: [[top, bottom], ...] }]`.
 * @param {any} compiled terrain from `terrainGeometry`, or null
 * @param {Water} body
 */
export function waterColumns(compiled, body, step = 2) {
  const owner = compiled || NO_TERRAIN;
  let cache = columnCache.get(owner);
  if (!cache) columnCache.set(owner, (cache = new Map()));
  const key = `${body.x},${body.y},${body.width},${body.depth},${step}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const columns = [];
  const top = body.y,
    bottom = body.y + body.depth;
  const first = Math.floor(body.x / step) * step;
  for (let x = first; x < body.x + body.width; x += step) {
    let segments = [[top, bottom]];
    const spans = compiled ? terrainColumnSpans(compiled, x + step / 2) : [];
    for (const span of spans) {
      if (span.bottom <= top || span.top >= bottom) continue;
      const next = [];
      for (const [a, b] of segments) {
        if (span.bottom <= a || span.top >= b) {
          next.push([a, b]);
          continue;
        }
        if (span.top > a) next.push([a, span.top]);
        if (span.bottom < b) next.push([span.bottom, b]);
      }
      segments = next;
    }
    segments = segments.filter(([a, b]) => b - a >= 1);
    if (segments.length) columns.push({ x, segments });
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, columns);
  return columns;
}
