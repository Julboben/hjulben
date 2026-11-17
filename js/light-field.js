// The ambient light field: how much sky light reaches each point of a trail,
// baked once per trail and time of day, since terrain never moves.
//
// Air open to the sky gets full light, which fades in through air only (so
// rock blocks it) into cave mouths and under ledges. Rock takes the light of
// the air at its surface, and deeper in, the sky light soaking down from the
// top of its column or in from a nearby face. How far that soaks is set by the
// time of day, so ground stays bright by day and sinks into darkness at
// night, while caves are dark at any time.
//
// A cave is only dark where a back wall closes it off behind: air with nothing
// behind it sees the sky through the back of the scene, so the hollow of a
// ring or an arch is lit like open air. Light fades in from a back wall's edge
// the same way it fades in from a cave mouth.
import { backWallGeometry, terrainGeometry, terrainSurfacesAt } from "./terrain.js";
import { isSeeThrough } from "./materials.js";
import { terrainColumnSpans } from "./terrain-runtime.js";

// World units per texel; the field is smoothed when it is drawn.
export const LIGHT_UNIT = 4;
// Larger trails are baked coarser to bound the bake time and memory.
const MAX_TEXELS = 1_000_000;
// Room around the terrain, in world units: enough for the fades to settle.
const MARGIN = { side: 64, above: 16, below: 160 };
// Rock this close to air takes the air's light; deeper, the soaked sky light.
const LIP = 10;
const ROCK_BLEND = 16;
// How deep into rock a moving light still reaches.
const SKIN = 10;
// Enclosed air smaller than this (world units²) is lit like the rock around
// it, so window cut-outs and small hollows don't read as caves.
const POCKET_AREA = 24_000;
// Air thinner than this (world units) between rock above and below, like the
// slit under a ledge resting on the ground, is lit as rock too.
const THIN_GAP = 24;
// How far deep rock light is blurred (world units, run twice), smoothing the
// creases of the distance sweeps.
const DEEP_BLUR = 24;
// Bounce: the sky light air sees spreads on through air, fading over this
// many world units, so open shade under a ledge stays light. It never passes
// through rock, so caves seeing no sky anywhere near stay dark.
const BOUNCE_REACH = 300;
const DIAGONAL = Math.SQRT2;
// Directions sky light arrives from, in radians from straight up. Air that
// sees enough of the sky, like the space under a floating ledge, is lit even
// when it is far from open air; a cave sees almost none of it.
const SKY_RAYS = Array.from({ length: 13 }, (_, n) => ((n - 6) / 6) * 1.45);

const smooth = (v) => {
  const t = v < 0 ? 0 : v > 1 ? 1 : v;
  return t * t * (3 - 2 * t);
};

// Working arrays, kept between bakes so a new trail or hour doesn't allocate
// tens of megabytes again: only the field's own arrays are made fresh. Each
// slot is grown to the largest field seen (bounded by MAX_TEXELS) and sweeps
// whose lifetimes don't overlap share a slot.
const scratch = new Map();
function scratchArray(name, Type, length, fill) {
  let array = scratch.get(name);
  if (!array || array.length < length || array.constructor !== Type) {
    array = new Type(length);
    scratch.set(name, array);
  }
  const view = array.length === length ? array : array.subarray(0, length);
  view.fill(fill);
  return view;
}

/**
 * Bakes the light field for a trail. `soak` is how far sky light reaches down
 * through rock and `reach` how far it fades in sideways through air, both in
 * world units; `open` is the share of the sky air must see to be fully lit. Returns null for a trail without terrain blocks, else
 * { x, y, unit, width, height, light, cover }: `light` is 0…1 per texel, and
 * `cover` 0…1 is how much rock hides a moving light there.
 * @param {any} trail
 * @param {{ soak: number, reach: number, open?: number }} options
 */
export function bakeLightField(trail, { soak, reach, open = 0.35 }, unit = LIGHT_UNIT) {
  const bounds = terrainGeometry(trail)?.bounds;
  if (!bounds) return null;
  let x, y, width, height;
  for (;;) {
    x = Math.floor((bounds.left - MARGIN.side) / unit) * unit;
    y = Math.floor((bounds.top - MARGIN.above) / unit) * unit;
    width = Math.ceil((bounds.right + MARGIN.side - x) / unit);
    height = Math.ceil((bounds.bottom + MARGIN.below - y) / unit);
    if (width * height <= MAX_TEXELS) break;
    unit *= 2;
  }
  const size = width * height;
  const solid = scratchArray("solid", Uint8Array, size, 0);
  // The terrain as it is, before gaps and pockets are filled, for shadows.
  const rock = new Uint8Array(size);
  const dist = scratchArray("a", Float32Array, size, Infinity);
  const tops = scratchArray("tops", Float64Array, width, Infinity);
  // Below all the terrain is treated as more rock, so the ground doesn't end
  // in a lit band when the camera looks under it.
  const floorRow = Math.max(0, Math.ceil((bounds.bottom - y) / unit - 0.5));
  // Air with no back wall behind it, open to the sky behind the scene.
  const backWalls = backWallGeometry(trail);
  const backOpen = scratchArray("backOpen", Uint8Array, size, 0);

  for (let c = 0; c < width; c++) {
    const surfaces = terrainSurfacesAt(trail, x + (c + 0.5) * unit);
    for (let s = 0; s < surfaces.length; s++) {
      if (!surfaces[s].entering) continue;
      // Glass from top to bottom lets the light through, as if it were air.
      if (isSeeThrough(surfaces[s].material) && isSeeThrough(surfaces[s + 1]?.material)) continue;
      const from = surfaces[s].y,
        to = s + 1 < surfaces.length ? surfaces[s + 1].y : Infinity;
      if (tops[c] === Infinity) tops[c] = from;
      const r0 = Math.max(0, Math.ceil((from - y) / unit - 0.5));
      const r1 = Math.min(height - 1, Math.floor((to - y) / unit - 0.5));
      for (let r = r0; r <= r1; r++) solid[r * width + c] = 1;
    }
    for (let r = floorRow; r < height; r++) solid[r * width + c] = 1;
    for (let r = 0, i = c; r < height; r++, i += width) rock[i] = solid[i];
    fillThinGaps(solid, width, height, c, Math.floor(THIN_GAP / unit));
    // Air above the column's topmost rock is open to the sky.
    const open = Math.min(height, Math.ceil((tops[c] - y) / unit - 0.5));
    for (let r = 0; r < open; r++) if (!solid[r * width + c]) dist[r * width + c] = 0;
    markOpenBehind(backOpen, backWalls, x + (c + 0.5) * unit, y, unit, width, height, c);
    for (let r = open, i = open * width + c; r < height; r++, i += width)
      if (backOpen[i] && !solid[i]) dist[i] = 0;
  }

  // Air: distance, through air only, to air open to the sky.
  for (let r = 0; r < height; r++)
    for (let c = 0, i = r * width; c < width; c++, i++) {
      if (solid[i]) continue;
      let d = dist[i];
      if (c > 0 && !solid[i - 1] && dist[i - 1] + 1 < d) d = dist[i - 1] + 1;
      if (r > 0) {
        const j = i - width;
        if (!solid[j] && dist[j] + 1 < d) d = dist[j] + 1;
        if (c > 0 && !solid[j - 1] && dist[j - 1] + DIAGONAL < d) d = dist[j - 1] + DIAGONAL;
        if (c < width - 1 && !solid[j + 1] && dist[j + 1] + DIAGONAL < d) d = dist[j + 1] + DIAGONAL;
      }
      dist[i] = d;
    }
  for (let r = height - 1; r >= 0; r--)
    for (let c = width - 1, i = r * width + c; c >= 0; c--, i--) {
      if (solid[i]) continue;
      let d = dist[i];
      if (c < width - 1 && !solid[i + 1] && dist[i + 1] + 1 < d) d = dist[i + 1] + 1;
      if (r < height - 1) {
        const j = i + width;
        if (!solid[j] && dist[j] + 1 < d) d = dist[j] + 1;
        if (c < width - 1 && !solid[j + 1] && dist[j + 1] + DIAGONAL < d) d = dist[j + 1] + DIAGONAL;
        if (c > 0 && !solid[j - 1] && dist[j - 1] + DIAGONAL < d) d = dist[j - 1] + DIAGONAL;
      }
      dist[i] = d;
    }

  fillSmallPockets(solid, dist, width, Math.ceil(POCKET_AREA / (unit * unit)));

  // `view` is finished with once `bounce` is seeded, so its slot is reused below.
  const view = skyView(solid, width, height, scratchArray("b", Float32Array, size, 0));
  const bounce = scratchArray("c", Float32Array, size, 0);
  for (let i = 0; i < size; i++)
    if (!solid[i]) bounce[i] = backOpen[i] ? 1 : Math.min(1, view[i] / open);
  spreadThroughAir(bounce, solid, width, height, unit / BOUNCE_REACH);
  const light = new Float32Array(size);
  // `dist` (slot "a") is still read in the loop below, so `near` gets its own slot.
  const near = scratchArray("near", Float32Array, size, Infinity),
    nearLight = scratchArray("b", Float32Array, size, 0),
    soaked = scratchArray("d", Float32Array, size, 0);
  const sideFade = unit / reach;
  for (let i = 0; i < size; i++) {
    if (solid[i]) continue;
    const lit = Math.max(1 - smooth(dist[i] * sideFade), smooth(bounce[i]));
    light[i] = nearLight[i] = soaked[i] = lit;
    near[i] = 0;
  }

  // Rock: the nearest air's light, and the sky light soaking in through rock.
  const fade = unit / soak,
    diagonalFade = DIAGONAL * fade;
  const relax = (i, j, cost, loss) => {
    if (near[j] + cost < near[i]) {
      near[i] = near[j] + cost;
      nearLight[i] = nearLight[j];
    }
    const through = soaked[j] - loss;
    if (through > soaked[i]) soaked[i] = through;
  };
  for (let r = 0; r < height; r++)
    for (let c = 0, i = r * width; c < width; c++, i++) {
      if (!solid[i]) continue;
      if (c > 0) relax(i, i - 1, 1, fade);
      if (r > 0) {
        relax(i, i - width, 1, fade);
        if (c > 0) relax(i, i - width - 1, DIAGONAL, diagonalFade);
        if (c < width - 1) relax(i, i - width + 1, DIAGONAL, diagonalFade);
      }
    }
  for (let r = height - 1; r >= 0; r--)
    for (let c = width - 1, i = r * width + c; c >= 0; c--, i--) {
      if (!solid[i]) continue;
      if (c < width - 1) relax(i, i + 1, 1, fade);
      if (r < height - 1) {
        relax(i, i + width, 1, fade);
        if (c < width - 1) relax(i, i + width + 1, DIAGONAL, diagonalFade);
        if (c > 0) relax(i, i + width - 1, DIAGONAL, diagonalFade);
      }
    }

  // Deep in rock: the sky light from straight above, through every block in
  // the column, or soaked in from the nearest face, whichever is brighter.
  // `bounce` is finished with, so `deep` takes its slot.
  const deep = scratchArray("c", Float32Array, size, 0);
  for (let r = 0; r < height; r++) {
    const wy = y + (r + 0.5) * unit;
    for (let c = 0, i = r * width; c < width; c++, i++) {
      if (!solid[i]) {
        deep[i] = light[i];
        continue;
      }
      const above = tops[c] === Infinity ? 1 : 1 - (wy - tops[c]) / soak;
      deep[i] = Math.max(0, Math.min(1, Math.max(soaked[i], above)));
    }
  }
  const blur = Math.max(1, Math.round(DEEP_BLUR / unit));
  boxBlur(deep, width, height, blur);
  boxBlur(deep, width, height, blur);

  const cover = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    if (!solid[i]) continue;
    const depth = near[i] * unit;
    const edge = nearLight[i];
    light[i] = Math.max(0, Math.min(1, edge + (deep[i] - edge) * smooth((depth - LIP) / ROCK_BLEND)));
    cover[i] = near[i] === Infinity ? 1 : smooth(depth / SKIN);
  }
  return { x, y, unit, width, height, light, cover, rock };
}

// The share of the sky (0…1) each air texel sees, over SKY_RAYS. Each ray is
// swept across the grid once: steep rays row by row from the top, shallow
// ones column by column from the side they come from, sampling the texel the
// ray passed through before with linear interpolation. Off the grid is sky.
function skyView(solid, width, height, view = new Float32Array(width * height)) {
  let previous = scratchArray("rayA", Float32Array, Math.max(width, height), 1),
    current = scratchArray("rayB", Float32Array, previous.length, 1);
  for (const angle of SKY_RAYS) {
    const slope = Math.tan(angle);
    if (Math.abs(slope) <= 1) {
      // Up one row, across `slope` columns.
      previous.fill(1);
      for (let r = 0; r < height; r++) {
        for (let c = 0, i = r * width; c < width; c++, i++) {
          if (solid[i]) {
            current[c] = 0;
            continue;
          }
          const x = c + slope,
            c0 = Math.floor(x),
            f = x - c0;
          const a = c0 >= 0 && c0 < width ? previous[c0] : 1,
            b = c0 + 1 >= 0 && c0 + 1 < width ? previous[c0 + 1] : 1;
          current[c] = a + (b - a) * f;
          view[i] += current[c];
        }
        [previous, current] = [current, previous];
      }
    } else {
      // Across one column towards the light, up `rise` rows.
      const rise = 1 / Math.abs(slope),
        step = slope > 0 ? 1 : -1;
      previous.fill(1);
      for (let n = 0, c = step > 0 ? width - 1 : 0; n < width; n++, c -= step) {
        for (let r = 0, i = c; r < height; r++, i += width) {
          if (solid[i]) {
            current[r] = 0;
            continue;
          }
          const above = r > 0 ? previous[r - 1] : 1;
          current[r] = previous[r] + (above - previous[r]) * rise;
          view[i] += current[r];
        }
        [previous, current] = [current, previous];
      }
    }
  }
  const scale = 1 / SKY_RAYS.length;
  for (let i = 0; i < view.length; i++) view[i] *= scale;
  return view;
}

// Air runs in column `c` no taller than `limit` texels, with rock above and
// below, become rock.
function fillThinGaps(solid, width, height, c, limit) {
  let r = 0;
  while (r < height && !solid[r * width + c]) r++;
  while (r < height) {
    while (r < height && solid[r * width + c]) r++;
    const start = r;
    while (r < height && !solid[r * width + c]) r++;
    if (r < height && r - start <= limit) for (let k = start; k < r; k++) solid[k * width + c] = 1;
  }
}

// Spreads each air texel's value to its air neighbours, losing `loss` per
// texel travelled; two chamfer sweeps, like the distance through air.
function spreadThroughAir(values, solid, width, height, loss) {
  const diagonal = loss * DIAGONAL;
  const pull = (i, j, cost) => {
    if (!solid[j] && values[j] - cost > values[i]) values[i] = values[j] - cost;
  };
  for (let r = 0; r < height; r++)
    for (let c = 0, i = r * width; c < width; c++, i++) {
      if (solid[i]) continue;
      if (c > 0) pull(i, i - 1, loss);
      if (r > 0) {
        pull(i, i - width, loss);
        if (c > 0) pull(i, i - width - 1, diagonal);
        if (c < width - 1) pull(i, i - width + 1, diagonal);
      }
    }
  for (let r = height - 1; r >= 0; r--)
    for (let c = width - 1, i = r * width + c; c >= 0; c--, i--) {
      if (solid[i]) continue;
      if (c < width - 1) pull(i, i + 1, loss);
      if (r < height - 1) {
        pull(i, i + width, loss);
        if (c < width - 1) pull(i, i + width + 1, diagonal);
        if (c > 0) pull(i, i + width - 1, diagonal);
      }
    }
}

// A box blur of `radius` texels, rows then columns, in place.
function boxBlur(values, width, height, radius) {
  const line = scratchArray("line", Float32Array, Math.max(width, height), 0);
  const scale = 1 / (radius * 2 + 1);
  const blurLine = (start, stride, length) => {
    for (let k = 0, i = start; k < length; k++, i += stride) line[k] = values[i];
    const last = length - 1;
    let sum = line[0] * (radius + 1);
    for (let k = 1; k <= radius; k++) sum += line[k < last ? k : last];
    for (let k = 0, i = start; k < length; k++, i += stride) {
      values[i] = sum * scale;
      const add = k + radius + 1,
        drop = k - radius;
      sum += line[add < last ? add : last] - line[drop > 0 ? drop : 0];
    }
  };
  for (let r = 0; r < height; r++) blurLine(r * width, 1, width);
  for (let c = 0; c < width; c++) blurLine(c, width, height);
}

// Enclosed air (still at an infinite distance from the sky) in pockets
// smaller than `limit` texels becomes rock for lighting.
/** Marks the texels of column `c` with no back wall behind them. */
function markOpenBehind(backOpen, compiled, worldX, y, unit, width, height, c) {
  const spans = compiled ? terrainColumnSpans(compiled, worldX) : [];
  let r = 0;
  for (const span of spans) {
    const r0 = Math.min(height, Math.max(0, Math.ceil((span.top - y) / unit - 0.5)));
    for (; r < r0; r++) backOpen[r * width + c] = 1;
    r = Math.max(r, Math.min(height, Math.floor((span.bottom - y) / unit - 0.5) + 1));
  }
  for (; r < height; r++) backOpen[r * width + c] = 1;
}

function fillSmallPockets(solid, dist, width, limit) {
  const size = solid.length;
  const seen = scratchArray("seen", Uint8Array, size, 0);
  const stack = scratchArray("stack", Int32Array, size, 0);
  const pocket = [];
  let top = 0;
  const visit = (j) => {
    if (j < 0 || j >= size || solid[j] || seen[j]) return;
    seen[j] = 1;
    stack[top++] = j;
  };
  for (let start = 0; start < size; start++) {
    if (solid[start] || seen[start] || dist[start] !== Infinity) continue;
    pocket.length = 0;
    visit(start);
    while (top) {
      const i = stack[--top];
      if (pocket.length <= limit) pocket.push(i);
      const c = i % width;
      if (c > 0) visit(i - 1);
      if (c < width - 1) visit(i + 1);
      visit(i - width);
      visit(i + width);
    }
    if (pocket.length <= limit) for (const i of pocket) solid[i] = 1;
  }
}

/** The baked light (0…1) at a world point; open sky outside the field. */
// A light at its source stays lit while buried in rock this deep, so lamps
// set into a wall still shine out of it.
const BURIED = 16;

/**
 * How far light travels from a world point along the unit direction
 * (dx, dy), up to `max`: it stops `skin` units into the first rock it meets.
 * Outside the field is open sky.
 */
export function lightReach(field, x, y, dx, dy, max, skin) {
  if (!field) return max;
  const { rock, unit, width, height } = field;
  const step = unit / 2;
  let inAir = false;
  for (let d = 0; d < max; d += step) {
    const c = Math.floor((x + dx * d - field.x) / unit),
      r = Math.floor((y + dy * d - field.y) / unit);
    const solid = c >= 0 && c < width && r >= 0 && rock[Math.min(r, height - 1) * width + c];
    if (!solid) inAir = true;
    else if (inAir) return Math.min(max, d + skin);
    else if (d > BURIED) return 0;
  }
  return max;
}

export function lightFieldAt(field, wx, wy) {
  if (!field) return 1;
  const c = Math.floor((wx - field.x) / field.unit),
    r = Math.floor((wy - field.y) / field.unit);
  if (c < 0 || c >= field.width || r < 0) return 1;
  return field.light[Math.min(r, field.height - 1) * field.width + c];
}

// Sunbeams: air the sun reaches directly, with sun-shaded air around it, lit
// in slanting beams as dust and haze catch the light. The more of the air
// within SHAFT_SPREAD world units is in the sun's shade, the stronger the
// beam: a narrow gap into the dark gives crisp beams, a wide opening that
// lets the sun into most of a space only faint ones, and open ground none.
// Beams start showing at SHAFT_SHADE of the air in shade, are full by
// SHAFT_SHADE + SHAFT_SHADE_RANGE, and fade over SHAFT_REACH world units from
// where they enter the shade.
const SHAFT_SPREAD = 48,
  SHAFT_SHADE = 0.35,
  SHAFT_SHADE_RANGE = 0.5,
  SHAFT_REACH = 320;

/**
 * How bright the sun's beams are in each texel of a light field, 0…1, for a
 * sun `slant` texels across per texel up and to the right; null when there
 * are none. Beams come in bands across their width, the same for every beam.
 */
export function bakeSunShafts(field, slant) {
  const { width, height, rock, unit } = field;
  const size = width * height;
  // Direct sun, swept row by row from the top: air is lit as much as the air
  // up the slant from it, blended between the two texels there, so a beam's
  // edges soften as it goes. Beyond the right edge is open sky.
  // Working arrays share the light field's scratch slots, free once it is baked.
  const sun = scratchArray("a", Float32Array, size, 0);
  const step = Math.floor(slant),
    frac = slant - step;
  const above = (i, c) => {
    const a = c + step;
    const near = a < width ? sun[i - width + step] : 1,
      far = a + 1 < width ? sun[i - width + step + 1] : 1;
    return near + (far - near) * frac;
  };
  for (let c = 0; c < width; c++) sun[c] = rock[c] ? 0 : 1;
  for (let r = 1; r < height; r++)
    for (let c = 0, i = r * width; c < width; c++, i++) sun[i] = rock[i] ? 0 : above(i, c);
  // The share of the air nearby that is in the sun's shade.
  const air = scratchArray("b", Float32Array, size, 0),
    shade = scratchArray("c", Float32Array, size, 0);
  for (let i = 0; i < size; i++) {
    air[i] = rock[i] ? 0 : 1;
    shade[i] = air[i] * (1 - sun[i]);
  }
  const spread = Math.max(1, Math.round(SHAFT_SPREAD / unit));
  boxBlur(air, width, height, spread);
  boxBlur(shade, width, height, spread);
  // How far each texel is down its beam from where it entered the shade.
  const depth = scratchArray("d", Float32Array, size, 0);
  const values = new Float32Array(size);
  let any = false;
  for (let r = 0; r < height; r++)
    for (let c = 0, i = r * width; c < width; c++, i++) {
      if (rock[i] || sun[i] <= 0 || air[i] <= 0) continue;
      const shaded = smooth((shade[i] / air[i] - SHAFT_SHADE) / SHAFT_SHADE_RANGE);
      if (shaded <= 0) continue;
      const up = Math.round(c + slant);
      depth[i] = r > 0 && up < width ? depth[i - width + up - c] + 1 : 0;
      // Bands across the beams, in hard steps for the pixel look.
      const across = (c + slant * r) * unit;
      const band = Math.round(Math.max(0, Math.min(1, 0.55 + 0.25 * Math.sin(across * 0.045) + 0.2 * Math.sin(across * 0.115 + 1.3))) * 3) / 3;
      values[i] = sun[i] * shaded * Math.exp((-depth[i] * unit) / SHAFT_REACH) * band;
      if (values[i] > 0) any = true;
    }
  return any ? values : null;
}
