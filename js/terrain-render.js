import { terrainMaterials } from "./materials.js";
import { backWallGeometry, terrainAt, terrainGeometry } from "./terrain.js";
import {
  ART_PIXEL,
  createCanvas,
  compositeColor,
  drawStartPennant,
} from "./drawing.js";
import { resolveWeather, windSign } from "./weather.js";
import {
  terrainBodySpans,
  mergeSpans,
  terrainColumnSpans,
  terrainBodyAt,
} from "./terrain-runtime.js";

// Static terrain is rasterised once into square world-space chunks and then
// blitted. Chunk corners sit on the art-pixel grid, so a snapped camera maps
// each chunk pixel to exactly one buffer pixel.
const CHUNK_SIZE = 512;
const CHUNK_PIXELS = CHUNK_SIZE / ART_PIXEL;
const CHUNK_LIMIT = 96;
const CHUNK_MARGIN = 24;
const BRICK_COLOR = "#4e2e2a99";
const GLASS_GLINT_REPEAT = 48;
// Stones sit on a jittered grid this many art pixels apart, alternate rows
// shifted half a stone like masonry; distances count rows this much more than
// columns, so the stones come out wider than they are tall.
const STONE_WIDTH = 15;
const STONE_HEIGHT = 10;
const STONE_FLATTEN = 1.4;
const STONE_GROWTH = 3;
// Wood is laid as horizontal planks this many art pixels tall and long, each
// row's butt joints shifted by its own amount, like boards on a wall or deck.
const PLANK_HEIGHT = 9;
const PLANK_LENGTH = 34;
// Back walls are drawn as their material in shadow, a little cool, so they
// read as rock set back behind the riding surface.
const BACK_WALL_SHADE = [0.5, 0.52, 0.58];

const materialFor = (name) => terrainMaterials[name] || terrainMaterials.grass;

// ---------------------------------------------------------------------------
// Start sign
// ---------------------------------------------------------------------------

/**
 * Where the start sign stands, or null when there is no ground for it: a little
 * behind the start, on the surface under the start rather than the topmost one.
 */
function startSignAnchor(trail) {
  const start = trail.start || { x: 90, y: null };
  const x = start.x - 62;
  const surface = terrainAt(
    trail,
    x,
    Number.isFinite(start.y) ? start.y : null,
  );
  return surface.solid ? { x, y: surface.y } : null;
}

function drawStartSign(context, trail, anchor, time, weather) {
  // Look for the ground just above the anchor, so the pole's base follows
  // the slope it stands on. The pennant flies in the trail's wind.
  const reference = anchor.y - 16;
  drawStartPennant(context, anchor.x, anchor.y, (localX) => {
    const surface = terrainAt(trail, anchor.x + localX, reference);
    return surface?.solid ? surface.y - anchor.y : 0;
  }, time, weather.wind, windSign(weather));
}

// ---------------------------------------------------------------------------
// Block terrain rasteriser
//
// Blocks are drawn straight from the compiled union that physics collides
// with: every art-pixel column asks for the union's solid spans at its centre,
// so what is drawn solid is exactly what the wheels touch. A span's top is a
// floor and gets the grass-and-edge rim; its bottom is a ceiling and a sharp
// sideways change between columns is a wall, and both get a thin edge. The
// fill details are measured from the floor above them.
// Colours are written straight into the pixel buffer from the palette, so no
// anti-aliasing ever has to be quantised away.
// ---------------------------------------------------------------------------

// Neighbouring columns whose floors are within this height of each other are
// the same sloped surface, and their rims are joined; further apart is a wall.
const RIM_JOIN = 12;
const TUFT_CLEARANCE = 14;
const TUFT_MAX_RISE = 6;

// Wall faces: how many art-pixel columns in from the air a wall's rim and
// shading reach, and how steep a face must be to count as a wall rather than a
// slope (distance to air × this must be less than the depth below the floor).
const WALL_REACH = 6;
const WALL_STEEPNESS = 2;
// Strata and pebbles repeat this far apart, so tall faces keep their texture.
const DETAIL_REPEAT = 120;
// Ledges: at most one per face in each course of this many art pixels.
const LEDGE_ROWS = 36;
// Fraction of wall courses that get no ledge; raise it for fewer ledges.
const LEDGE_CHANCE = 0.85;
// The first four dirt lines follow the surface; below this depth the layers are
// flat and set in world space, so they line up on both sides of a wall.
const SURFACE_STRATA = 130;
const DEEP_BAND = 44;
// A cliff edge needs at least this much drop beside it to get a lip.
const LIP_DROP = 16;
const SUNLIGHT = [255, 248, 226];

const mixColor = (a, b, t) =>
  a.map((value, index) => Math.round(value + (b[index] - value) * t));

/** A repeatable 0…1 value for two integers, the same in every chunk. */
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const opaque = (color) => compositeColor(color, "#000000");
const materialColorCache = new Map();

function materialColors(name) {
  const cached = materialColorCache.get(name);
  if (cached) return cached;
  const material = materialFor(name);
  const fill = opaque(material.fill),
    edge = opaque(material.edge);
  const layers = material.layers.map(opaque);
  const light = layers[0],
    dark = layers[layers.length - 1];
  const colors = {
    fill,
    edge,
    surface: opaque(material.surface),
    layers,
    detail: compositeColor(material.detail, material.fill),
    brick:
      material.pattern === "brick"
        ? compositeColor(BRICK_COLOR, material.fill)
        : null,
    glass:
      material.pattern === "glass"
        ? compositeColor(material.detail, material.fill)
        : null,
    // Each stone gets one of three face tones, a lit top and a shaded bottom.
    stone:
      material.pattern === "stone"
        ? {
            mortar: compositeColor(material.detail, material.fill),
            faces: [fill, mixColor(fill, light, 0.4), mixColor(fill, dark, 0.35)],
            top: light,
            bottom: dark,
          }
        : null,
    // Each plank gets one of three tones, a lit top, a shaded bottom, and
    // darker grain and knots.
    wood:
      material.pattern === "wood"
        ? {
            seam: compositeColor(material.detail, material.fill),
            faces: [fill, mixColor(fill, light, 0.35), mixColor(fill, dark, 0.3)],
            top: light,
            bottom: dark,
            grain: mixColor(fill, dark, 0.6),
            knot: mixColor(dark, edge, 0.5),
          }
        : null,
    vegetation: material.vegetation ? opaque(material.vegetation) : null,
    // Wall faces toward the sun (air on the right) and away from it.
    glint: mixColor(light, SUNLIGHT, 0.3),
    lit: light,
    litSoft: mixColor(light, fill, 0.5),
    shade: dark,
    shadeDeep: mixColor(fill, dark, 0.5),
    crack: mixColor(edge, fill, 0.3),
  };
  // A see-through material carries its alpha as a fourth channel: the body
  // faint, the rims and glints that outline it stronger.
  if (material.alpha !== undefined) {
    const body = Math.round(material.alpha * 255),
      rim = Math.round((material.rimAlpha ?? material.alpha) * 255);
    for (const key of ["fill", "lit", "litSoft", "shade", "shadeDeep"])
      colors[key] = [...colors[key], body];
    colors.layers = colors.layers.map((color) => [...color, body]);
    for (const key of ["edge", "surface", "detail", "glass", "glint", "crack"])
      if (colors[key]) colors[key] = [...colors[key], rim];
  }
  materialColorCache.set(name, colors);
  return colors;
}

/** The top of the span in `spans` nearest to `top` within the join distance, or null. */
function joinedTop(spans, top) {
  let best = null;
  for (const span of spans) {
    const distance = Math.abs(span.top - top);
    if (
      distance <= RIM_JOIN &&
      (best === null || distance < Math.abs(best - top))
    )
      best = span.top;
  }
  return best;
}

function solidIn(spans, y) {
  for (const span of spans) if (y >= span.top && y < span.bottom) return true;
  return false;
}

/** Where two lists of spans, each sorted top to bottom, are both solid. */
function overlapSpans(a, b) {
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    const top = Math.max(a[i].top, b[j].top),
      bottom = Math.min(a[i].bottom, b[j].bottom);
    if (top < bottom) out.push({ top, bottom });
    if (a[i].bottom < b[j].bottom) i++;
    else j++;
  }
  return out;
}

/** The body whose material shows at `y`: the latest block among those solid there. */
function bodyIn(bodySpans, y) {
  let best = null;
  for (const span of bodySpans) {
    if (
      y >= span.top &&
      y < span.bottom &&
      (!best || span.topBody.blockIndex > best.blockIndex)
    )
      best = span.topBody;
  }
  return best;
}

/**
 * Rasterise the compiled block terrain into an RGBA buffer covering
 * `width` × `height` art pixels from world (`originX`, `originY`). Pure, so it
 * can be tested without a canvas.
 *
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, opaque: boolean }}
 */
export function rasterizeTerrainChunk(
  compiled,
  originX,
  originY,
  width,
  height,
  pixel = ART_PIXEL,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  const result = { data, width, height, opaque: false };
  const worldRight = originX + width * pixel,
    worldBottom = originY + height * pixel;
  const bounds = compiled?.bounds;
  if (
    !compiled?.bodies.length ||
    bounds.right < originX - 16 ||
    bounds.left > worldRight + 16 ||
    bounds.bottom < originY - 16 ||
    bounds.top > worldBottom + 16
  )
    return result;

  // 0 air, 1 plain fill, 2 fill detail, 3 rim or foliage. Pebbles may only
  // replace fill, so the rims always stay crisp.
  const kind = new Uint8Array(width * height);
  const column0 = Math.round(originX / pixel),
    row0 = Math.round(originY / pixel);
  const rowAt = (y) => Math.ceil(y / pixel - row0 - 0.5);
  const put = (column, row, color, what) => {
    if (column < 0 || column >= width || row < 0 || row >= height) return;
    const index = row * width + column,
      offset = index * 4;
    kind[index] = what;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3] ?? 255;
    result.opaque = true;
  };

  // WALL_REACH columns either side, so walls, joined rims and cliff lips at
  // the chunk's edges match the neighbouring chunk exactly.
  const bodySpans = [],
    spans = [];
  for (let column = -WALL_REACH; column < width + WALL_REACH; column++) {
    const own = terrainBodySpans(compiled, (column0 + column + 0.5) * pixel);
    bodySpans.push(own);
    spans.push(mergeSpans(own));
  }
  const spansAt = (column) => spans[column + WALL_REACH] || [];
  const bodiesAt = (column) => bodySpans[column + WALL_REACH] || [];
  const stoneCell = cachedStoneCells(column0, row0, width, height);
  // Columns from `column` to the nearest air at `y` in one direction, or 0.
  const airDistance = (column, y, direction) => {
    for (let step = 1; step <= WALL_REACH; step++)
      if (!solidIn(spansAt(column + direction * step), y)) return step;
    return 0;
  };

  for (let column = 0; column < width; column++) {
    const x = (column0 + column + 0.5) * pixel;
    const own = bodiesAt(column),
      here = spansAt(column);
    const left = spansAt(column - 1),
      right = spansAt(column + 1);
    if (!here.length) continue;
    // The rows solid in every column within WALL_REACH either side, where no
    // wall face can be. That is most of a chunk, and looking for the air
    // beside each of its pixels was most of what drawing one cost.
    let buried = here;
    for (let step = 1; step <= WALL_REACH && buried.length; step++)
      buried = overlapSpans(overlapSpans(buried, spansAt(column - step)), spansAt(column + step));
    const single =
      own.length === 1 ? materialColors(own[0].topBody.material) : null;
    const wobble = [0, 1, 2, 3].map((i) => Math.sin(x * 0.022 + i) * 5);
    let previousBottom = -Infinity;
    for (const span of here) {
      const above = previousBottom;
      previousBottom = span.bottom;
      if (span.bottom < originY - 8 || span.top > worldBottom + 8) continue;
      // A sloped floor's rim covers the height it climbs across the column,
      // taken as halfway to each neighbour, so the grass line never breaks.
      const leftTop = joinedTop(left, span.top),
        rightTop = joinedTop(right, span.top);
      const midLeft = leftTop === null ? span.top : (span.top + leftTop) / 2;
      const midRight = rightTop === null ? span.top : (span.top + rightTop) / 2;
      const rimTop = Math.min(span.top, midLeft, midRight);
      const rimBottom = Math.max(span.top, midLeft, midRight);
      const floor =
        single ||
        materialColors((bodyIn(own, span.top + 0.01) || span.topBody).material);

      // Rim overhanging the floor into the air. Glass has none: its top is
      // outlined like its sides.
      const airFirst = Math.max(0, rowAt(Math.max(rimTop - 4, above)));
      const airLast = floor.glass ? 0 : Math.min(height, rowAt(span.top));
      for (let row = airFirst; row < airLast; row++) {
        const y = (row0 + row + 0.5) * pixel;
        put(column, row, y < rimTop - 2 ? floor.edge : floor.surface, 3);
      }

      const first = Math.max(0, rowAt(span.top)),
        last = Math.min(height, rowAt(span.bottom));
      for (let row = first; row < last; row++) {
        const y = (row0 + row + 0.5) * pixel;
        if (floor.glass && y < rimBottom + pixel) {
          put(column, row, floor.edge, 3);
          continue;
        }
        if (!floor.glass && y < rimBottom + 2) {
          put(column, row, floor.surface, 3);
          continue;
        }
        if (!floor.glass && y < rimBottom + 4) {
          put(column, row, floor.edge, 3);
          continue;
        }
        const colors =
          single || materialColors((bodyIn(own, y) || span.topBody).material);
        if (
          span.bottom - y < pixel ||
          !solidIn(left, y) ||
          !solidIn(right, y)
        ) {
          put(column, row, colors.edge, 3);
          continue;
        }
        let color = colors.fill,
          what = 1;
        if (colors.brick) {
          const course = Math.floor(y / 14);
          const joint = (((course % 2) + 2) % 2) * 15;
          if (y - course * 14 < 2 || (((x - joint) % 30) + 30) % 30 < 2) {
            color = colors.brick;
            what = 2;
          }
        } else if (colors.glass) {
          // Diagonal glints, a wide and a narrow one, in place of strata.
          const glint = (((x + y) % GLASS_GLINT_REPEAT) + GLASS_GLINT_REPEAT) % GLASS_GLINT_REPEAT;
          if (glint < 3 || (glint >= 7 && glint < 9)) {
            color = colors.glass;
            what = 2;
          }
        } else if (colors.stone) {
          color = stoneShade(stoneCell, column0 + column, row0 + row, colors.stone);
          if (color !== colors.fill) what = 2;
        } else if (colors.wood) {
          color = woodShade(column0 + column, row0 + row, colors.wood);
          if (color !== colors.fill) what = 2;
        } else {
          // Strata repeat all the way down; the first four are as before.
          const depth = y - span.top;
          const band = Math.round((depth - 27) / 30);
          // The surface lines thin out with depth and the flat deep layers take
          // their place, segment by segment, so where columns with very
          // different tops meet (the foot of a pillar) the join is ragged,
          // not a straight cut.
          const keep =
            1 - Math.max(0, depth - 40) / (SURFACE_STRATA - 40);
          if (
            band >= 0 &&
            band < 4 &&
            hash2(band, Math.floor(x / 24)) < keep
          ) {
            if (Math.abs(depth - (27 + band * 30 + wobble[band])) < 1) {
              color = colors.layers[band % colors.layers.length];
              what = 2;
            }
          } else if (depth > 30) {
            // Deeper down: flat sediment with uneven spacing, waves and gaps.
            const deep = Math.floor(y / DEEP_BAND);
            const seed = hash2(deep, 17);
            const lineY =
              deep * DEEP_BAND +
              8 +
              seed * (DEEP_BAND - 16) +
              Math.sin(x * (0.008 + seed * 0.02) + deep) * 4;
            const broken = hash2(deep, Math.floor(x / 48)) < 0.3;
            if (!broken && Math.abs(y - lineY) < 1) {
              color =
                hash2(deep, 3) < 0.5
                  ? colors.layers[0]
                  : colors.layers.at(-1);
              what = 2;
            }
          }
        }
        // Wall faces: a lit band toward the sun, shade on the far side, and
        // the odd ledge. Only steep faces count, so slopes are left alone.
        const open = !solidIn(buried, y);
        const airRight = open ? airDistance(column, y, 1) : 0,
          airLeft = open ? airDistance(column, y, -1) : 0;
        const reach = Math.min(airRight || Infinity, airLeft || Infinity);
        if (reach !== Infinity && reach * pixel * WALL_STEEPNESS < y - span.top) {
          const lit = airRight > 0 && (!airLeft || airRight <= airLeft);
          const faceColumn = column0 + column + (lit ? reach : -reach);
          const faceColor = wallShade(
            colors,
            reach,
            lit,
            faceColumn,
            y,
            pixel,
          );
          if (faceColor) {
            color = faceColor;
            what = 3;
          }
        }
        put(column, row, color, what);
      }
    }
  }

  drawPebbles(
    compiled,
    originX,
    originY,
    worldRight,
    worldBottom,
    pixel,
    column0,
    row0,
    width,
    kind,
    put,
  );
  drawCliffLips(spansAt, bodiesAt, width, pixel, column0, row0, rowAt, put);
  drawTufts(compiled, originX, worldRight, pixel, column0, row0, put);
  return result;
}

/**
 * The stones around a block of world art pixels, `columns` × `rows` from
 * (`left`, `top`): each stone's centre and how much bigger than its
 * neighbours it is, seeded by its place so chunks agree. They are worked out
 * once per chunk rather than for each of a pixel's nine candidate stones.
 */
function stoneGrid(left, top, columns, rows) {
  const first = Math.floor(top / STONE_HEIGHT) - 1,
    last = Math.floor((top + rows - 1) / STONE_HEIGHT) + 1;
  // A row is shifted right by up to half a stone, and a pixel looks at the
  // stone either side of the one it is over.
  const firstAcross = Math.floor((left - (STONE_WIDTH >> 1)) / STONE_WIDTH) - 1,
    lastAcross = Math.floor((left + columns - 1) / STONE_WIDTH) + 1;
  const stride = lastAcross - firstAcross + 1;
  const count = (last - first + 1) * stride;
  const x = new Float64Array(count),
    y = new Float64Array(count),
    growth = new Float64Array(count);
  for (let r = first; r <= last; r++)
    for (let c = firstAcross; c <= lastAcross; c++) {
      const index = (r - first) * stride + c - firstAcross;
      x[index] = (c + 0.2 + hash2(c, r) * 0.6) * STONE_WIDTH;
      y[index] = (r + 0.2 + hash2(r + 4099, c) * 0.6) * STONE_HEIGHT;
      growth[index] = hash2(c + 7919, r) * STONE_GROWTH;
    }
  return { first, firstAcross, stride, x, y, growth };
}

/** Which stone of `stones` (see stoneGrid) the world art pixel (`column`, `row`) belongs to, as an id. */
function stoneCellAt(stones, column, row) {
  const near = Math.floor(row / STONE_HEIGHT);
  let best = Infinity,
    id = 0;
  for (let r = near - 1; r <= near + 1; r++) {
    const shift = (r & 1) * (STONE_WIDTH >> 1);
    const across = Math.floor((column - shift) / STONE_WIDTH);
    const offset = (r - stones.first) * stones.stride - stones.firstAcross;
    for (let c = across - 1; c <= across + 1; c++) {
      const dx = column - stones.x[offset + c] - shift;
      const dy = (row - stones.y[offset + c]) * STONE_FLATTEN;
      // Squared twice: `** 4` is a general power, and was most of what a
      // stone chunk cost to draw.
      const dx2 = dx * dx,
        dy2 = dy * dy;
      // A squarish distance gives blocky stones with clipped corners, and a
      // per-stone weight makes some stones bigger than their neighbours.
      const distance = Math.sqrt(Math.sqrt(dx2 * dx2 + dy2 * dy2)) - stones.growth[offset + c];
      if (distance < best) {
        best = distance;
        id = Math.imul(c, 73856093) ^ Math.imul(r, 19349663);
      }
    }
  }
  return id;
}

/**
 * `stoneCellAt`, remembered for the pixels of one chunk and a margin of two,
 * since every pixel's shade looks at the stones around it. Only those pixels
 * may be asked for.
 */
function cachedStoneCells(column0, row0, width, height) {
  const span = width + 4;
  let cells = null,
    known = null,
    stones = null;
  return (column, row) => {
    if (!cells) {
      cells = new Int32Array(span * (height + 4));
      known = new Uint8Array(cells.length);
      stones = stoneGrid(column0 - 2, row0 - 2, span, height + 4);
    }
    const index = (row - row0 + 2) * span + column - column0 + 2;
    if (!known[index]) {
      cells[index] = stoneCellAt(stones, column, row);
      known[index] = 1;
    }
    return cells[index];
  };
}

/**
 * The colour of a stone-pattern pixel: mortar where one stone meets the next
 * to its right or below, a lit row under the mortar above a stone and a shaded
 * one over the mortar below it, and the stone's own face tone between.
 */
function stoneShade(cellAt, column, row, stone) {
  const mortar = (c, r, id) => id !== cellAt(c + 1, r) || id !== cellAt(c, r + 1);
  const id = cellAt(column, row);
  if (mortar(column, row, id)) return stone.mortar;
  if (mortar(column, row - 1, cellAt(column, row - 1))) return stone.top;
  if (mortar(column, row + 1, id)) return stone.bottom;
  return stone.faces[Math.floor(hash2(id, 7) * stone.faces.length)];
}

/**
 * The colour of a wood-pattern pixel at world art pixel (`column`, `row`): a
 * dark seam between planks and at their butt joints, a lit row under the seam
 * above and a shaded one over the seam below, and between them the plank's own
 * tone with a broken grain line and the odd knot.
 */
function woodShade(column, row, wood) {
  const plank = Math.floor(row / PLANK_HEIGHT);
  const within = row - plank * PLANK_HEIGHT;
  const along = column + Math.floor(hash2(plank, 31) * PLANK_LENGTH);
  const board = Math.floor(along / PLANK_LENGTH);
  const into = along - board * PLANK_LENGTH;
  if (within === 0 || into === 0) return wood.seam;
  if (within === 1) return wood.top;
  if (within === PLANK_HEIGHT - 1) return wood.bottom;
  // A knot sits on some boards, away from their ends.
  if (hash2(board, plank + 5) < 0.3) {
    const knotColumn = 6 + Math.floor(hash2(plank, board + 11) * (PLANK_LENGTH - 12));
    const knotRow = 3 + Math.floor(hash2(board + 13, plank) * (PLANK_HEIGHT - 6));
    const dx = into - knotColumn;
    if (within === knotRow && (dx === 0 || dx === 1)) return wood.knot;
    // The grain parts around the knot rather than running through it.
    if (Math.abs(within - knotRow) === 1 && dx >= -1 && dx <= 2) return wood.grain;
    if (within === knotRow && dx >= -3 && dx <= 4) return wood.faces[0];
  }
  const grainRow = 2 + Math.floor(hash2(plank, board + 23) * (PLANK_HEIGHT - 4));
  if (within === grainRow && hash2(column >> 2, plank * 31 + board) < 0.55)
    return wood.grain;
  return wood.faces[Math.floor(hash2(board, plank + 3) * wood.faces.length)];
}

/**
 * The colour of a wall-face pixel `reach` columns in from the air, or null to
 * keep the fill. Ledges are seeded by world position, so chunks agree.
 */
function wallShade(colors, reach, lit, faceColumn, y, pixel) {
  const worldRow = Math.floor(y / pixel);
  if (!colors.brick && !colors.glass && !colors.stone && !colors.wood) {
    const course = Math.floor(worldRow / LEDGE_ROWS);
    const group = Math.floor(faceColumn / 3) * 2 + (lit ? 1 : 0);
    if (hash2(course, group) > LEDGE_CHANCE) {
      const ledgeRow =
        course * LEDGE_ROWS +
        4 +
        Math.floor(hash2(course + 7919, group) * (LEDGE_ROWS - 8));
      const depth = 3 + Math.floor(hash2(course, group + 104729) * 4);
      if (reach <= depth + 1) {
        // A dark crack, with a sunlit lip above it or a shadow below it.
        if (worldRow === ledgeRow) return colors.crack;
        if (worldRow === ledgeRow - 1 && lit) return colors.glint;
        if (worldRow === ledgeRow + 1 && !lit) return colors.shadeDeep;
      }
    }
  }
  // The band's inner edge steps in and out every few rows, and its last
  // column is dithered, so it reads as light on rock rather than a stripe.
  const band = reach + (hash2(worldRow >> 2, faceColumn) < 0.35 ? 1 : 0);
  const dither = (worldRow + reach) % 2 === 0;
  if (lit) {
    if (reach === 2) return colors.glint;
    if (band <= 4) return colors.lit;
    if (band === 5 || (band === 6 && dither)) return colors.litSoft;
    return null;
  }
  if (band <= 3) return colors.shade;
  if (band <= 5 || dither) return colors.shadeDeep;
  return null;
}

// Pebbles hang below the floor above them, and repeat
// all the way down so a tall face is never left bare.
function drawPebbles(
  compiled,
  originX,
  originY,
  worldRight,
  worldBottom,
  pixel,
  column0,
  row0,
  width,
  kind,
  put,
) {
  for (
    let i = Math.floor((originX - 16) / 31);
    i <= Math.ceil((worldRight + 16) / 31);
    i++
  ) {
    const cx = i * 31 + Math.sin(i * 18) * 9;
    const rx = 2 + (((i % 3) + 3) % 3),
      ry = 1.5;
    if (cx + rx < originX || cx - rx > worldRight) continue;
    const cos = Math.cos(0.3),
      sin = Math.sin(0.3);
    for (const span of terrainColumnSpans(compiled, cx)) {
      const firstRepeat = Math.max(
        0,
        Math.floor((originY - span.top - 100) / DETAIL_REPEAT),
      );
      for (let repeat = firstRepeat; ; repeat++) {
        const cy =
          span.top +
          16 +
          (Math.sin(i * 23 + repeat * 1.7) + 1) * 34 +
          repeat * DETAIL_REPEAT;
        if (cy - ry > span.bottom || cy - ry > worldBottom) break;
        if (cy + ry > span.bottom - 2 || cy + ry < originY) continue;
        // Deeper repeats skip some pebbles and shift the rest sideways.
        if (repeat > 0 && hash2(i, repeat) < 0.4) continue;
        const px =
          cx + (repeat > 0 ? (hash2(i + 5, repeat) - 0.5) * 20 : 0);
        const colors = materialColors(
          (terrainBodyAt(compiled, px, cy) || span.topBody).material,
        );
        if (colors.glass || colors.stone || colors.wood) continue;
        for (
          let column = Math.floor((px - rx) / pixel) - column0;
          column <= Math.ceil((px + rx) / pixel) - column0;
          column++
        ) {
          for (
            let row = Math.floor((cy - rx) / pixel) - row0;
            row <= Math.ceil((cy + rx) / pixel) - row0;
            row++
          ) {
            const dx = (column0 + column + 0.5) * pixel - px,
              dy = (row0 + row + 0.5) * pixel - cy;
            const u = dx * cos + dy * sin,
              v = dy * cos - dx * sin;
            if ((u / rx) ** 2 + (v / ry) ** 2 > 1) continue;
            if (column < 0 || column >= width || row < 0) continue;
            const what = kind[row * width + column];
            if (what === 1 || what === 2) put(column, row, colors.detail, 2);
          }
        }
      }
    }
  }
}

// At the top of a cliff the rim sticks one art pixel out past the face, and on
// grassy materials a few strands hang over it. Everything is decided from world
// geometry and world columns, so a lip split across two chunks still matches.
function drawCliffLips(
  spansAt,
  bodiesAt,
  width,
  pixel,
  column0,
  row0,
  rowAt,
  put,
) {
  for (let column = -1; column <= width; column++) {
    let above = -Infinity;
    for (const span of spansAt(column)) {
      const top = span.top,
        clearance = top - above;
      above = span.bottom;
      if (clearance < LIP_DROP) continue;
      const colors = materialColors(
        (bodyIn(bodiesAt(column), top + 0.01) || span.topBody).material,
      );
      if (colors.glass) continue;
      for (const direction of [-1, 1]) {
        const beside = spansAt(column + direction);
        // Not a cliff: the ground beside carries on as a slope, or is solid.
        if (joinedTop(beside, top) !== null) continue;
        if (
          [2, LIP_DROP / 2, LIP_DROP].some((drop) => solidIn(beside, top + drop))
        )
          continue;
        const lipColumn = column + direction;
        for (let row = rowAt(top - 4); row < rowAt(top + 4); row++) {
          const y = (row0 + row + 0.5) * pixel;
          if (solidIn(beside, y)) continue;
          put(
            lipColumn,
            row,
            y < top - 2 || y >= top + 2 ? colors.edge : colors.surface,
            3,
          );
        }
        if (!colors.vegetation) continue;
        // A short strand over the face, kept inside the rock so nothing hangs
        // out into open air past the lip.
        const worldColumn = column0 + column;
        const length = 1 + Math.floor(hash2(worldColumn + 31, direction) * 3);
        for (let step = 0; step < length; step++) {
          const row = rowAt(top + 4) + step;
          const y = (row0 + row + 0.5) * pixel;
          if (y >= span.bottom - pixel) break;
          put(
            column,
            row,
            step === length - 1 ? colors.edge : colors.vegetation,
            3,
          );
        }
      }
    }
  }
}

// Grass tufts on every gentle, open floor of a material that grows them,
// including cave floors, drawn with pixel lines.
function drawTufts(compiled, originX, worldRight, pixel, column0, row0, put) {
  for (
    let i = Math.floor((originX - 16) / 45);
    i <= Math.ceil((worldRight + 16) / 45);
    i++
  ) {
    const x = i * 45 + Math.sin(i * 9) * 8;
    if (x < originX - 8 || x > worldRight + 8) continue;
    let above = -Infinity;
    for (const span of terrainColumnSpans(compiled, x)) {
      const clearance = span.top - above;
      above = span.bottom;
      if (clearance < TUFT_CLEARANCE) continue;
      const colors = materialColors(
        (terrainBodyAt(compiled, x, span.top + 0.5) || span.topBody).material,
      );
      if (!colors.vegetation) continue;
      const before = joinedTop(terrainColumnSpans(compiled, x - 3), span.top);
      const after = joinedTop(terrainColumnSpans(compiled, x + 3), span.top);
      if (
        before === null ||
        after === null ||
        Math.abs(after - before) > TUFT_MAX_RISE
      )
        continue;
      const y = span.top;
      pixelLine(
        [
          [x - 4, y - 2],
          [x - 4, y - 8],
          [x, y - 4],
          [x + 2, y - 10],
        ],
        pixel,
        column0,
        row0,
        colors.vegetation,
        put,
      );
    }
  }
}

// Bresenham between art pixels, matching `pixelPath` from the drawing tools.
function pixelLine(points, pixel, column0, row0, color, put) {
  for (let segment = 1; segment < points.length; segment++) {
    let x0 = Math.round(points[segment - 1][0] / pixel),
      y0 = Math.round(points[segment - 1][1] / pixel);
    const x1 = Math.round(points[segment][0] / pixel),
      y1 = Math.round(points[segment][1] / pixel);
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      put(x0 - column0, y0 - row0, color, 3);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twice <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Chunk cache
// ---------------------------------------------------------------------------

// A body's identity for invalidation: its material and exact flattened edges.
function bodySignature(body) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const char of body.material) mix(char.charCodeAt(0));
  mix(body.blockIndex);
  const edges = body.edges;
  for (let index = 0; index < body.edgeCount * 4; index++)
    mix(Math.round(edges[index] * 64) | 0);
  return `${hash}:${body.edgeCount}`;
}

/**
 * The world x ranges whose art may differ between two compiled terrains.
 * Fill details hang from the floor above them, so a change anywhere in a
 * column can move art far below it: whole columns are dirty, not just boxes.
 */
function changedColumns(before, after) {
  const signatures = (compiled) =>
    new Map(compiled.bodies.map((body) => [bodySignature(body), body]));
  const old = signatures(before),
    next = signatures(after);
  const ranges = [];
  for (const [signature, body] of old)
    if (!next.has(signature))
      ranges.push([body.bounds.left, body.bounds.right]);
  for (const [signature, body] of next)
    if (!old.has(signature)) ranges.push([body.bounds.left, body.bounds.right]);
  return ranges;
}

function shadeBackWall(data) {
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] *= BACK_WALL_SHADE[0];
    data[offset + 1] *= BACK_WALL_SHADE[1];
    data[offset + 2] *= BACK_WALL_SHADE[2];
  }
}

/**
 * Draws a trail's terrain blocks in cached chunks, or with `backWalls` its
 * back-layer blocks instead, darkened and without the start sign.
 */
export function createTerrainRenderer({ backWalls = false } = {}) {
  const geometryOf = backWalls ? backWallGeometry : terrainGeometry;
  let currentTrail = null;
  let currentGeometry = null;
  let chunks = new Map();

  function buildBlockChunk(geometry, originX, originY) {
    const raster = rasterizeTerrainChunk(
      geometry,
      originX,
      originY,
      CHUNK_PIXELS,
      CHUNK_PIXELS,
    );
    if (!raster.opaque) return null;
    if (backWalls) shadeBackWall(raster.data);
    const canvas = createCanvas(CHUNK_PIXELS, CHUNK_PIXELS);
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(raster.data, CHUNK_PIXELS, CHUNK_PIXELS),
        0,
        0,
      );
    return canvas;
  }

  // The sign follows the start, which the editor moves without touching the
  // terrain, so it is drawn live rather than baked in.
  let signKey = "",
    signAnchor = null;
  function startSign(trail) {
    if (!currentGeometry || backWalls) return null;
    const key = `${trail.start?.x}|${trail.start?.y}`;
    if (key !== signKey) {
      signKey = key;
      signAnchor = startSignAnchor(trail);
    }
    return signAnchor;
  }

  function chunk(column, row) {
    const key = column + "," + row;
    if (chunks.has(key)) {
      const cached = chunks.get(key);
      chunks.delete(key);
      chunks.set(key, cached);
      return cached;
    }
    const originX = column * CHUNK_SIZE,
      originY = row * CHUNK_SIZE;
    const built = currentGeometry
      ? buildBlockChunk(currentGeometry, originX, originY)
      : null;
    chunks.set(key, built);
    if (chunks.size > CHUNK_LIMIT) chunks.delete(chunks.keys().next().value);
    return built;
  }

  // Draws every chunk overlapping the view. `ctx` must already map world units.
  // The compiled terrain is cached per trail and replaced whenever the trail is
  // invalidated, so an edit is noticed here without the caller doing anything,
  // and only the chunks in the columns it changed are drawn again. A ride's
  // copy of a trail counts as the trail itself, so a pane breaking or a
  // restart redraws only the glass. `time` (seconds, 0 to hold still) waves
  // the start pennant in the trail's `weather` (resolved by the caller, or
  // here).
  function draw(ctx, trail, viewX, viewY, width, height, time = 0, weather = null) {
    if ((trail?.terrainSource || trail) !== currentTrail) invalidate(trail);
    else refresh(trail);
    if (!currentGeometry) return;
    const firstColumn = Math.floor(viewX / CHUNK_SIZE),
      lastColumn = Math.floor((viewX + width) / CHUNK_SIZE);
    const firstRow = Math.floor(viewY / CHUNK_SIZE),
      lastRow = Math.floor((viewY + height) / CHUNK_SIZE);
    let ready = true;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        ready &&= chunks.has(column + "," + row);
        const image = chunk(column, row);
        if (image)
          ctx.drawImage(
            image,
            column * CHUNK_SIZE,
            row * CHUNK_SIZE,
            CHUNK_SIZE,
            CHUNK_SIZE,
          );
      }
    }
    // When every chunk in view was ready, one more just outside it, so the
    // rider rarely comes on a chunk still to draw, and never on several at
    // once: drawing a few in one frame stalled it.
    if (ready) drawAhead(firstColumn - 1, lastColumn + 1, firstRow - 1, lastRow + 1);
    const sign = startSign(trail);
    if (sign) drawStartSign(ctx, trail, sign, time, weather ?? resolveWeather(trail.weather));
  }

  /** Draws the first missing chunk on the border of these columns and rows, if any. */
  function drawAhead(firstColumn, lastColumn, firstRow, lastRow) {
    for (let row = firstRow; row <= lastRow; row++)
      for (let column = firstColumn; column <= lastColumn; column++) {
        const border = row === firstRow || row === lastRow || column === firstColumn || column === lastColumn;
        if (border && !chunks.has(column + "," + row)) {
          chunk(column, row);
          return;
        }
      }
  }

  function refresh(trail) {
    const geometry = trail ? geometryOf(trail) : null;
    if (geometry === currentGeometry) return;
    if (!geometry || !currentGeometry) {
      invalidate(trail);
      return;
    }
    const previous = currentGeometry;
    currentGeometry = geometry;
    signKey = "";
    // An edit rebuilt in place says where it changed; anything else is
    // compared body by body.
    invalidateColumns(geometry.update?.from === previous ? geometry.update.ranges : changedColumns(previous, geometry));
  }

  /** Forget the chunks covering any of the given world x ranges, with rim margin. */
  function invalidateColumns(ranges) {
    for (const key of [...chunks.keys()]) {
      const column = Number(key.slice(0, key.indexOf(",")));
      const left = column * CHUNK_SIZE - CHUNK_MARGIN,
        right = (column + 1) * CHUNK_SIZE + CHUNK_MARGIN;
      if (ranges.some(([from, to]) => to >= left && from <= right))
        chunks.delete(key);
    }
  }

  function invalidate(trail = null) {
    currentTrail = trail?.terrainSource || trail;
    currentGeometry = trail ? geometryOf(trail) : null;
    chunks = new Map();
    signKey = "";
  }

  return { draw, invalidate };
}
