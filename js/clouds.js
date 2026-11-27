// The sky's clouds: cumulus built from round puffs on flat bases in two
// layers, a far one low over the hills and the main one above it, and a deck
// higher up, which closes over the sky as the cover grows, both built from
// round puffs so their edges are lumpy. Each cumulus is shaded in a few flat
// tones: a lit cap, a body, and shaded undersides, or warm ones when the sun
// is low.
//
// Drawing the sky every frame from noise would be far too slow, so each cloud
// is painted once into its own small canvas, and the deck into square tiles.
// A frame only places them in a canvas per layer, at one cell per art pixel,
// which the backdrop draws.

/** World units per cloud cell: one art pixel. */
export const CLOUD_CELL = 2;
// The deck's tiles are this many cells square.
const TILE = 64;
// The clouds rise as the camera goes down at the sun's rate, so a cloud in
// front of the sun stays in front of it.
const RISE = 0.08;
// A puff adds (1 - d²/R²)² to the cloud, and the cloud is where the sum
// passes EDGE, so neighbouring puffs melt into one rounded outline instead
// of a row of circles. R is the puff's radius times REACH, which puts a lone
// puff's edge at its radius.
const EDGE = 0.25;
const REACH = Math.SQRT2;
// Where the light comes from: above, leaning towards the side of the sky the
// sun is on. It is the same for every cloud, wherever it is, so a cloud
// drifting past the sun keeps its shading rather than having its lit side
// swing over while the rider watches the trail.
const LIGHT_X = 0.4 / Math.hypot(0.4, 1),
  LIGHT_Y = -1 / Math.hypot(0.4, 1);
// The cover past which the cumulus have melted into the deck, and the cover
// from which the deck is closed and shows no gaps.
const CUMULUS_GONE = 0.95;
const DECK_CLOSED = 0.97;

// Back to front. `parallax` is how far a layer moves with the camera and
// `drift` how fast in the wind, as shares of the main layer's; `slot` is the
// width each cloud of a row has to itself, `base` the height of the first
// row's bases. Higher rows only come into view as the camera climbs.
const LAYERS = [
  { parallax: 0.035, drift: 0.6, slot: 190, base: 200, scale: 0.45, flatten: 0.7, seed: 41, from: 0.25, haze: 0.5 },
  { parallax: 0.07, drift: 1, slot: 210, base: 140, scale: 1, flatten: 1, seed: 7, from: 0, rowSpacing: 240, haze: 0, deck: true },
];

function hash(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x, y, seed) {
  const i = Math.floor(x),
    j = Math.floor(y);
  const fx = x - i,
    fy = y - j;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed),
    b = hash(i + 1, j, seed),
    c = hash(i, j + 1, seed),
    d = hash(i + 1, j + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Two octaves of noise: broad shapes with a little detail, no speckle.
const fbm = (x, y, seed) => (noise(x, y, seed) * 2 + noise(x * 2.03, y * 2.03, seed + 101)) / 3;

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * The cumulus of a layer in a stretch of its sky. Each is a few big puffs on
 * a flat base with one or two smaller ones on top and lumps on the biggest.
 * They grow and crowd together up to 70% cover, then melt into the deck.
 */
function cumulus(spec, cover, uFrom, uTo, vFrom, vTo) {
  if (cover < spec.from) return [];
  const amount = Math.min(cover, 0.7) / 0.7;
  const chance = (0.12 + 0.8 * amount) * (1 - smooth(0.78, CUMULUS_GONE, cover));
  const clouds = [];
  const lastRow = spec.rowSpacing ? Math.max(0, Math.ceil((spec.base - vFrom) / spec.rowSpacing)) : 0;
  const widest = spec.scale * 480;
  for (let row = 0; row <= lastRow; row++) {
    const rowBase = spec.base - row * (spec.rowSpacing || 0);
    if (rowBase + 20 < vFrom || rowBase - 160 > vTo) continue;
    for (let k = Math.floor((uFrom - widest) / spec.slot); k <= Math.ceil(uTo / spec.slot); k++) {
      const n = (j) => hash(k, row * 31 + j, spec.seed);
      if (n(0) > chance) continue;
      // Mostly small clouds with the odd big one, as cumulus are.
      const w = spec.scale * (50 + 230 * amount) * (0.4 + 1.25 * n(1) ** 2);
      const h = Math.min(Math.max(w * (0.4 + 0.16 * n(2)), 16 * spec.scale), 100 * spec.scale) * spec.flatten;
      const left = k * spec.slot + (spec.slot - w) * n(3);
      if (left - h > uTo || left + w + h < uFrom) continue;
      const base = rowBase + (n(4) - 0.5) * 18 * spec.scale;
      const puffs = [];
      // Along the base, biggest in the middle and tapering to small ends
      // that ride up with it.
      const count = 2 + Math.floor(w / (70 * spec.scale));
      for (let p = 0; p < count; p++) {
        const t = (p + 0.5) / count + ((hash(k, p, spec.seed + 3) - 0.5) * 0.25) / count;
        const profile = Math.sin(Math.PI * Math.min(Math.max(t, 0.05), 0.95)) ** 0.7;
        const r = h * (0.18 + 0.46 * profile) * (0.85 + 0.3 * hash(k, p, spec.seed + 5));
        puffs.push({ u: left + w * t, v: base - lift(t, h) - r * 0.55, r });
      }
      // On top.
      const tops = 1 + Math.floor(w / (130 * spec.scale));
      for (let p = 0; p < tops; p++) {
        const t = ((p + 0.3 + 0.4 * hash(k, p, spec.seed + 11)) / tops) * 0.6 + 0.2;
        const r = h * (0.28 + 0.14 * hash(k, p, spec.seed + 13));
        puffs.push({ u: left + w * t, v: base - h + r, r });
      }
      // Smaller lumps on the bigger puffs give the top its cauliflower edge.
      for (const [p, puff] of puffs.slice().entries()) {
        if (puff.r < h * 0.3) continue;
        const angle = (hash(k, p, spec.seed + 17) - 0.5) * 2.2;
        const r = puff.r * (0.42 + 0.16 * hash(k, p, spec.seed + 19));
        puffs.push({
          u: puff.u + Math.sin(angle) * puff.r * 0.8,
          v: Math.min(puff.v - Math.cos(angle) * puff.r * 0.8, base - r),
          r,
        });
      }
      for (const puff of puffs) puff.reach = puff.r * REACH;
      clouds.push({ id: `${row}|${k}`, base, h, puffs, x0: left, w, left: left - h, right: left + w + h, top: base - h * 1.3 });
    }
  }
  return clouds;
}

// How far a cloud's puffs ride up at t along it: not at all in the middle,
// rising gently towards the ends so the cloud doesn't sit on a straight shelf.
function lift(t, h) {
  const end = clamp((Math.abs(2 * t - 1) - 0.55) / 0.45);
  return h * 0.22 * end * end;
}

// The bottom of a cloud at u: flattish, as the air it condenses in rises from
// one height, but uneven, and curving up at the ends.
function baseAt(cloud, u) {
  const t = (u - cloud.x0) / cloud.w;
  return cloud.base - lift(t, cloud.h) + (noise(u / 34, cloud.base, 5) - 0.5) * Math.min(10, cloud.h * 0.12);
}

// How much of a cloud is at (u, v): EDGE and over is inside it.
function density(cloud, u, v) {
  if (u < cloud.left || u > cloud.right || v < cloud.top) return 0;
  const above = baseAt(cloud, u) - v;
  if (above < 0) return 0;
  let f = 0;
  for (const puff of cloud.puffs) {
    const du = u - puff.u,
      dv = v - puff.v;
    if (Math.abs(du) > puff.reach || Math.abs(dv) > puff.reach) continue;
    const q = 1 - (du * du + dv * dv) / (puff.reach * puff.reach);
    if (q > 0) f += q * q;
  }
  // A lumpiness broad enough to keep the outline smooth.
  f += (noise(u / 26, v / 22, 9) - 0.5) * 0.1;
  // The cloud thins towards its base rather than being cut off there: where
  // it is thick the base stays nearly flat, and where it is thin, at its
  // ends, the base rounds up into the sides instead of meeting them in a
  // point.
  return f * smooth(0, cloud.h * 0.45, above);
}

// How thick the deck is at (u, v), in broad sweeps: above 0 is cloud. It is
// thicker higher in the sky, and fills in as the cover grows until it closes.
function deckThickness(cover, u, v) {
  const thickness = fbm(u / 420, v / 110, 23) + Math.max(-0.1, Math.min(0.12, (LAYERS[1].base - v) / 600));
  return thickness - (0.78 - smooth(0.55, 1, cover) * 0.5);
}

// The deck while it is broken, and the long rolls in it once it closes, are
// built, like the cumulus, from flattened round puffs, so their edges are as
// lumpy: one puff at most in each cell of a grid \`cellU\` by \`cellV\` units,
// placed and sized by how thick the cloud is there.
const DECK_PUFFS = { cellU: 72, cellV: 34, seed: 71, flatten: 0.55 };
const ROLL_PUFFS = { cellU: 130, cellV: 30, seed: 81, flatten: 0.35 };

// The deck's thickness, and a roll's, thicker the higher \`level\`.
const deckThicknessFor = (cover) => (u, v) => deckThickness(cover, u, v);
const rollThickness = (level) => (u, v) => fbm(u / 900, v / 95 + noise(u / 500, 3, 31) * 0.5, 29) - level;

/** The puffs of a shape that reach into a stretch of sky. */
function puffsIn(shape, thickness, uFrom, uTo, vFrom, vTo) {
  const { cellU, cellV, seed, flatten } = shape;
  const most = cellU * 0.78 * 1.2 * REACH;
  const puffs = [];
  for (let j = Math.floor((vFrom - most * flatten) / cellV); j <= Math.floor((vTo + most * flatten) / cellV); j++)
    for (let i = Math.floor((uFrom - most) / cellU); i <= Math.floor((uTo + most) / cellU); i++) {
      const u = (i + 0.2 + 0.6 * hash(i, j, seed)) * cellU,
        v = (j + 0.2 + 0.6 * hash(i, j, seed + 2)) * cellV;
      const t = thickness(u, v);
      if (t <= 0.008) continue;
      const reach = cellU * (0.3 + 0.48 * clamp(t / 0.1)) * (0.8 + 0.4 * hash(i, j, seed + 4)) * REACH;
      puffs.push({ u, v, reach, height: reach * flatten });
    }
  return puffs;
}

// How far into a puff-built cloud (u, v) is, above 0 inside: its puffs, and
// the thickness itself, which fills it in where it is thick.
function puffDepth(puffs, thickness, u, v) {
  let f = Math.max(0, thickness(u, v)) * 6 - EDGE;
  for (const puff of puffs) {
    const du = (u - puff.u) / puff.reach,
      dv = (v - puff.v) / puff.height;
    const q = 1 - du * du - dv * dv;
    if (q > 0) f += q * q;
  }
  return f;
}

/**
 * puffDepth for every cell of a block \`cols\` by \`rows\` cells from cell
 * (ox, oy), row by row. Each puff is added only to the cells it covers,
 * which is far quicker than adding up every puff for every cell.
 */
function puffDepths(shape, thickness, ox, oy, cols, rows) {
  const depths = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      depths[j * cols + i] = Math.max(0, thickness((ox + i + 0.5) * CLOUD_CELL, (oy + j + 0.5) * CLOUD_CELL)) * 6 - EDGE;
  const u0 = ox * CLOUD_CELL,
    v0 = oy * CLOUD_CELL;
  for (const puff of puffsIn(shape, thickness, u0, u0 + cols * CLOUD_CELL, v0, v0 + rows * CLOUD_CELL)) {
    const iFrom = Math.max(0, Math.floor((puff.u - puff.reach - u0) / CLOUD_CELL)),
      iTo = Math.min(cols - 1, Math.ceil((puff.u + puff.reach - u0) / CLOUD_CELL)),
      jFrom = Math.max(0, Math.floor((puff.v - puff.height - v0) / CLOUD_CELL)),
      jTo = Math.min(rows - 1, Math.ceil((puff.v + puff.height - v0) / CLOUD_CELL));
    for (let j = jFrom; j <= jTo; j++) {
      const dv = (v0 + (j + 0.5) * CLOUD_CELL - puff.v) / puff.height;
      for (let i = iFrom; i <= iTo; i++) {
        const du = (u0 + (i + 0.5) * CLOUD_CELL - puff.u) / puff.reach;
        const q = 1 - du * du - dv * dv;
        if (q > 0) depths[j * cols + i] += q * q;
      }
    }
  }
  return depths;
}

/** Paints cells into a new canvas, a row at a time in runs of one tone. */
function paint(cols, rows, toneAt, colors) {
  const canvas = new OffscreenCanvas(cols, rows);
  const g = canvas.getContext("2d");
  for (let j = 0; j < rows; j++) {
    let tone = null,
      start = 0;
    for (let i = 0; i <= cols; i++) {
      const next = i < cols ? toneAt(i, j) : null;
      if (next === tone) continue;
      if (tone) {
        g.fillStyle = colors[tone];
        g.fillRect(start, j, i - start, 1);
      }
      tone = next;
      start = i;
    }
  }
  return canvas;
}

// One cloud, as a canvas at its place on the cell grid.
function paintCloud(cloud, underlit, colors, stormy) {
  const ox = Math.floor(cloud.left / CLOUD_CELL),
    oy = Math.floor(cloud.top / CLOUD_CELL);
  const cols = Math.ceil(cloud.right / CLOUD_CELL) - ox,
    rows = Math.ceil((cloud.base + 4) / CLOUD_CELL) - oy;
  // The cap the light reaches: the cells this far from the cloud's edge
  // towards it.
  const band = Math.min(Math.max(cloud.h * 0.5, 8), 36);
  const canvas = paint(
    cols,
    rows,
    (i, j) => {
      const u = (ox + i + 0.5) * CLOUD_CELL,
        v = (oy + j + 0.5) * CLOUD_CELL;
      if (density(cloud, u, v) <= EDGE) return null;
      const lit = density(cloud, u + LIGHT_X * band, v + LIGHT_Y * band) <= EDGE;
      // The undersides are the cells this close above the cloud's lower edge,
      // so the shade follows each bulge rather than one straight line.
      const reachDown = Math.min(Math.max(cloud.h * (0.2 + 0.08 * (noise(u / 30, cloud.base, 17) - 0.5)), 4), 22);
      const under = density(cloud, u, v + reachDown) <= EDGE;
      if (underlit) return under ? "warm" : lit ? "light" : "body";
      if (under) return stormy ? "dark" : "shade";
      if (lit) return "light";
      return stormy ? "shade" : "body";
    },
    colors,
  );
  return { canvas, x: ox, y: oy };
}

// One tile of the deck. While it is broken its patches have a lit cap and a
// plain body, with no shaded undersides: those would show just below the
// cumulus in front and look like their shadows. Once it closes, long rolls
// show in it, faint ones, or dark ones in a storm.
function paintDeck(tx, ty, cover, colors, stormy) {
  const ox = tx * TILE,
    oy = ty * TILE;
  if (cover >= DECK_CLOSED) {
    // Rolls only; a storm's thick ones dark inside paler ones.
    const rolls = puffDepths(ROLL_PUFFS, rollThickness(stormy ? 0.45 : 0.57), ox, oy, TILE, TILE);
    const thick = stormy && puffDepths(ROLL_PUFFS, rollThickness(0.6), ox, oy, TILE, TILE);
    return paint(
      TILE,
      TILE,
      (i, j) => {
        const k = j * TILE + i;
        if (thick && thick[k] > 0) return "dark";
        if (rolls[k] > 0) return stormy ? "shade" : "roll";
        return "body";
      },
      colors,
    );
  }
  // The cap the light reaches: the cells this far from the patch's edge
  // towards it, with room round the tile to look that far.
  const lightI = Math.round((LIGHT_X * 12) / CLOUD_CELL),
    lightJ = Math.round((LIGHT_Y * 12) / CLOUD_CELL);
  const margin = Math.max(Math.abs(lightI), Math.abs(lightJ));
  const size = TILE + margin * 2;
  const depths = puffDepths(DECK_PUFFS, deckThicknessFor(cover), ox - margin, oy - margin, size, size);
  const at = (i, j) => depths[(j + margin) * size + i + margin];
  return paint(
    TILE,
    TILE,
    (i, j) => {
      if (at(i, j) <= 0) return null;
      if (at(i + lightI, j + lightJ) <= 0) return "light";
      return stormy ? "shade" : "body";
    },
    colors,
  );
}

function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16));
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c) => `rgb(${c.map(Math.round).join(" ")})`;

/**
 * The tones a cloud is painted in, from the time of day's colours: lit
 * near white and tinted by a low sun, shaded towards the storm colour and the
 * top of the sky, and hazed towards the horizon for the far layer.
 */
function cloudTones({ cloud, storm, sky, skyTop, sun, stormy, warmth, night }, haze) {
  const base = rgb(cloud),
    white = [255, 255, 255],
    sunColor = rgb(sun);
  const lit = mix(mix(base, white, night ? 0.15 : 0.5), sunColor, 0.06 + warmth * 0.3);
  const shadow = mix(mix(rgb(storm), rgb(skyTop), 0.35), [70, 80, 100], stormy ? 0.25 : 0.1);
  const tones = {
    light: lit,
    body: mix(base, shadow, stormy ? 0.25 : 0.12),
    warm: mix(mix(sunColor, white, 0.35), base, 0.25),
    shade: mix(base, shadow, stormy ? 0.7 : 0.36),
    roll: mix(base, shadow, 0.28),
    dark: mix(base, mix(shadow, [60, 66, 84], 0.45), 1),
  };
  const horizon = rgb(sky);
  return Object.fromEntries(Object.entries(tones).map(([name, c]) => [name, css(mix(c, horizon, haze))]));
}

// What is cached for each look of the sky, the latest last.
const looks = new Map();
const LOOK_LIMIT = 3;
const CLOUD_LIMIT = 96;
const TILE_LIMIT = 160;

function lookFor(cover, colors) {
  const key = JSON.stringify([cover, colors]);
  let look = looks.get(key);
  if (look) {
    looks.delete(key);
  } else {
    look = {
      tones: LAYERS.map((spec) => cloudTones(colors, spec.haze)),
      // The deck is higher and further off than the cumulus, so hazier, until
      // it closes into the overcast.
      deckTones: cloudTones(colors, 0.35 * (1 - smooth(0.85, 1, cover))),
      clouds: new Map(),
      tiles: new Map(),
      layers: LAYERS.map(() => ({ canvas: null, key: "" })),
    };
    if (looks.size >= LOOK_LIMIT) looks.delete(looks.keys().next().value);
  }
  looks.set(key, look);
  return look;
}

// A cached canvas, painted when missing; the least recently used goes first.
function cached(map, key, limit, make) {
  let value = map.get(key);
  if (value) map.delete(key);
  else {
    value = make();
    if (map.size >= limit) map.delete(map.keys().next().value);
  }
  map.set(key, value);
  return value;
}

/**
 * The clouds for a view: a canvas per layer to draw back to front, one cell
 * per CLOUD_CELL units, `offsetX` and `offsetY` left of and above the view,
 * and how much of the sun's disc they hide, 0…1, off screen as much as on it.
 * `drift` is how far, in world units, the wind has carried the clouds, and
 * `colors` the time of day's (see cloudTones).
 */
export function cloudSky({ width, height, cameraX, cameraY, drift, cover, colors, sun }) {
  const look = lookFor(cover, colors);
  const layers = [];
  let clear = 1;
  for (const [index, spec] of LAYERS.entries()) {
    if (cover < spec.from) continue;
    const scrollX = cameraX * spec.parallax - drift * spec.drift;
    const scrollY = cameraY * RISE;
    const gx0 = Math.floor(scrollX / CLOUD_CELL),
      gy0 = Math.floor(scrollY / CLOUD_CELL);
    const cols = Math.ceil(width / CLOUD_CELL) + 1,
      rows = Math.ceil(height / CLOUD_CELL) + 1;
    // The sun in the layer's sky.
    const sunU = sun.x + scrollX,
      sunV = sun.y + scrollY;
    const deck = spec.deck && cover > 0.55;
    // A low sun lights every cloud warmly from underneath.
    const underlit = colors.warmth > 0.4;
    const tones = look.tones[index];

    // How much of the sun's disc the layer hides.
    const nearSun = cumulus(spec, cover, sunU - sun.radius, sunU + sun.radius, sunV - sun.radius, sunV + sun.radius);
    const deckThick = deckThicknessFor(cover);
    const deckNearSun =
      deck && cover < DECK_CLOSED
        ? puffsIn(DECK_PUFFS, deckThick, sunU - sun.radius, sunU + sun.radius, sunV - sun.radius, sunV + sun.radius)
        : null;
    const inDeck = (u, v) => deck && (!deckNearSun || puffDepth(deckNearSun, deckThick, u, v) > 0);
    const reach = Math.ceil(sun.radius / 4);
    let inside = 0,
      hidden = 0;
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy > reach * reach) continue;
        inside++;
        const u = sunU + dx * 4,
          v = sunV + dy * 4;
        if (inDeck(u, v) || nearSun.some((cloud) => density(cloud, u, v) > EDGE)) hidden++;
      }
    clear *= 1 - hidden / inside;

    const layer = look.layers[index];
    const key = [gx0, gy0, cols, rows].join("|");
    if (layer.key !== key) {
      if (layer.canvas?.width !== cols || layer.canvas?.height !== rows) layer.canvas = new OffscreenCanvas(cols, rows);
      const g = layer.canvas.getContext("2d");
      g.clearRect(0, 0, cols, rows);
      if (deck)
        for (let ty = Math.floor(gy0 / TILE); ty <= Math.floor((gy0 + rows) / TILE); ty++)
          for (let tx = Math.floor(gx0 / TILE); tx <= Math.floor((gx0 + cols) / TILE); tx++) {
            const tile = cached(look.tiles, `${tx}|${ty}`, TILE_LIMIT, () => paintDeck(tx, ty, cover, look.deckTones, colors.stormy));
            g.drawImage(tile, tx * TILE - gx0, ty * TILE - gy0);
          }
      const uFrom = gx0 * CLOUD_CELL,
        vFrom = gy0 * CLOUD_CELL;
      for (const cloud of cumulus(spec, cover, uFrom, uFrom + cols * CLOUD_CELL, vFrom, vFrom + rows * CLOUD_CELL)) {
        const painted = cached(look.clouds, `${index}|${cloud.id}`, CLOUD_LIMIT, () =>
          paintCloud(cloud, underlit, tones, colors.stormy),
        );
        g.drawImage(painted.canvas, painted.x - gx0, painted.y - gy0);
      }
      layer.key = key;
    }
    layers.push({ canvas: layer.canvas, offsetX: scrollX - gx0 * CLOUD_CELL, offsetY: scrollY - gy0 * CLOUD_CELL });
  }
  return { layers, sunCover: 1 - clear };
}

// A scratch canvas for the glow, kept from frame to frame.
let glowCanvas = null;

/**
 * Draws the pale glow of the sun or moon, `light` on screen, through a layer
 * of clouds drawn at (x, y): discs in flat steps like its disc, over cloud
 * only. It is drawn round the light each frame rather than painted into the
 * layer, whose cells drift with the clouds: there it would hop a cell to and
 * fro about the light as they drift past. `light.x` and `light.y` should land
 * on whole device pixels, like the layer; `strength`, 0…1, fades the glow.
 */
export function drawCloudGlow(ctx, layer, x, y, light, color, strength) {
  const scale = ctx.getTransform().a;
  const reach = Math.round((light.radius * 1.9) / CLOUD_CELL);
  const half = (reach + 1) * CLOUD_CELL;
  const size = Math.ceil(half * 2 * scale);
  if (!glowCanvas || glowCanvas.width < size) glowCanvas = new OffscreenCanvas(size, size);
  const g = glowCanvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, size, size);
  // Cells are centred on the light, in units from the canvas's corner.
  g.setTransform(scale, 0, 0, scale, half * scale, half * scale);
  g.fillStyle = color;
  for (const [share, alpha] of [[1.9, 0.27], [1.4, 0.36], [0.95, 0.57]]) {
    const radius = Math.round((light.radius * share) / CLOUD_CELL);
    g.globalAlpha = alpha * strength;
    for (let dy = -radius; dy <= radius; dy++) {
      const run = Math.floor(Math.sqrt(radius * radius - dy * dy));
      g.fillRect((-run - 0.5) * CLOUD_CELL, (dy - 0.5) * CLOUD_CELL, (run * 2 + 1) * CLOUD_CELL, CLOUD_CELL);
    }
  }
  // Only where the layer has cloud.
  g.globalAlpha = 1;
  g.globalCompositeOperation = "destination-in";
  g.imageSmoothingEnabled = false;
  g.drawImage(layer, x - light.x, y - light.y, layer.width * CLOUD_CELL, layer.height * CLOUD_CELL);
  ctx.drawImage(glowCanvas, 0, 0, size, size, light.x - half, light.y - half, size / scale, size / scale);
}
