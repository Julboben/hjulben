// Scene lighting. Everything drawn is multiplied by a light map: the ambient
// light field, baked once per trail and time of day (see light-field.js), plus
// moving lights stamped on each frame in banded pixel-art steps (props, the
// bike's headlight and tail light). Lights add to the ambient
// light, only reach the skin of the rock, and saturate in daylight, so by day
// open ground looks just as it is drawn while caves stay dark.
import {
  ART_PIXEL,
  bikeLampPoints,
  craneLightOn,
  createCanvas,
  lanternFlicker,
  mushroomPulse,
  propPoint,
  propRotation,
  propWallFit,
  glareStrength,
  RAY_WARM,
  sunLight,
  sunRays,
  timeOfDayPalette,
} from "./drawing.js";
import { bakeLightField, bakeSunShafts, lightFieldAt, lightReach } from "./light-field.js";
import { dayBlend, normalizeHour } from "./time-of-day.js";
import { backWallGeometry, terrainAt, terrainGeometry } from "./terrain.js";
import { terrainSolidAt } from "./terrain-runtime.js";
import { isSeeThrough } from "./materials.js";
import { surfaceWave, waterColumns } from "./water.js";
import { LANTERN_CENTRE } from "./cave-props.js";
import { CRANE_LIGHTS, LAMP_HEAD } from "./city-props.js";
import { HUT_WINDOW_CENTRE } from "./mountain-props.js";
import { TURBINE, farmhouseLitWindows, farmhouseWindowCentre } from "./countryside-props.js";
import { SEARCHLIGHT } from "./prison-props.js";
import { TORCH_FLAME } from "./dungeon-props.js";
import { FIRE, TENT_DOOR_CENTRE } from "./forest-props.js";

// Per look of the day (the keyframes of time-of-day.js): the light open sky
// gives, the light deep in a cave, how far sky light soaks down through rock
// and fades in sideways through air, and how much of the sky air must see to
// be fully lit (see light-field.js). The hours between blend them.
const AMBIENT = {
  dawn: { sky: [232, 208, 216], cave: [50, 48, 62], soak: 300, reach: 150, open: 0.38 },
  morning: { sky: [255, 243, 230], cave: [70, 68, 80], soak: 900, reach: 170, open: 0.32 },
  noon: { sky: [255, 255, 255], cave: [78, 80, 94], soak: 1400, reach: 190, open: 0.3 },
  evening: { sky: [244, 210, 188], cave: [50, 42, 58], soak: 260, reach: 150, open: 0.38 },
  dusk: { sky: [182, 164, 204], cave: [36, 34, 52], soak: 160, reach: 140, open: 0.42 },
  night: { sky: [122, 136, 192], cave: [24, 28, 46], soak: 100, reach: 130, open: 0.45 },
};
const FLASH = [170, 185, 215];
// Rain greys the light: the sky's colour is pulled this far towards white.
const RAIN_SOFTEN = 0.35;
// Below this much ambient light, lamps and crane lights switch on.
const DARK_BELOW = 0.5;
// Shadows: rays are cast from each light this many world units apart at its
// edge, and light goes this far into the rock it hits (the skin the cover
// mask fades out).
const RAY_SPACING = 6,
  SHADOW_SKIN = 12;
// Field texels per culling tile, for skipping the pass in full daylight, and
// the ambient level a texel must reach to count as daylight: ground a little
// below the surface never quite reaches 1 by day, and a few percent of shade
// is not worth the pass.
const TILE = 16,
  DAYLIGHT = 0.9;
// Radius fraction → brightness; hard steps keep the pixel-art look.
const BANDS = [
  [0.3, 1],
  [0.5, 0.7],
  [0.72, 0.42],
  [1, 0.18],
];
const LANTERN = [255, 196, 118],
  GLOW = [90, 210, 196],
  LAMP = [255, 222, 160],
  CRANE = [232, 117, 91],
  HEADLIGHT = [255, 244, 212],
  TAIL = [255, 60, 50];

// The glint on a lit lamp: a pixel cross on the art grid, as [arm length in
// art pixels, brightness at the centre, body], filled out to a diamond `body`
// art pixels across from the centre. Each step out is dimmer.
const HEADLIGHT_FLARE = [2, 0.7, 0],
  TAIL_FLARE = [1, 0.45, 0],
  BRAKE_FLARE = [2, 0.8, 1],
  LANTERN_FLARE = [4, 0.6, 2],
  LAMP_FLARE = [3, 0.65, 1],
  CRANE_FLARE = [1, 0.6, 0];
// How dark the garage is with its lights off: what's left is the bike's lights.
const DARK_ROOM = "rgb(64,72,98)";

// The points across the sun's disc, as fractions of its radius, that are
// checked for terrain in front of it: one in the middle and two rings, so the
// glare fades smoothly as the sun slides behind a roof.
const SUN_SAMPLES = [[0, 0]];
for (const [ring, count] of [[0.5, 8], [1, 12]])
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    SUN_SAMPLES.push([Math.cos(angle) * ring, Math.sin(angle) * ring]);
  }
// Glass lets the sun through, so a sun seen through a window still glares.
const opaque = (body) => !isSeeThrough(body.material);
const tracePath = (ctx, rings) => {
  for (const ring of rings) {
    ring.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
};

/**
 * How much of the sun's disc, at (x, y) in the world and `radius` across (see
 * sunLight), no terrain or back wall hides: the sky and its sun are drawn
 * behind everything, so a building in front of the sun hides it, and its
 * glare with it.
 */
export function sunVisible(trail, x, y, radius) {
  const layers = [terrainGeometry(trail), backWallGeometry(trail)].filter(Boolean);
  if (!layers.length) return 1;
  let open = 0;
  for (const [dx, dy] of SUN_SAMPLES)
    if (!layers.some((compiled) => terrainSolidAt(compiled, x + dx * radius, y + dy * radius, opaque))) open++;
  return open / SUN_SAMPLES.length;
}

// Sun rays: [angle offset from straight at the view's centre, beam half-width,
// length as a fraction of the view's diagonal, brightness].
// Sunbeams show sharpest while something cuts across the sun: with half of it
// hidden, its rays are this much stronger again.
const EDGE_RAYS = 0.8;
const SUN_RAYS = [
  [-0.42, 0.05, 1.1, 0.8],
  [-0.2, 0.09, 1.25, 1],
  [0.02, 0.04, 0.95, 0.7],
  [0.22, 0.07, 1.2, 0.9],
  [0.45, 0.05, 0.9, 0.6],
];

// The eyes getting used to the sun's glare: how fast, per second, they adjust
// to more of it and to less. Less is slower, so a sun that ducks behind a
// pillar for a moment still dazzles a little when it comes back.
const ADAPT_LIGHT = 3.2,
  ADAPT_DARK = 1.2;
// How bright the dazzle of a sun coming out is at the sun, at its strongest,
// and how far its glow reaches, as a fraction of the view's diagonal.
const DAZZLE = 0.75,
  DAZZLE_REACH = 0.65;
// Glitter on water is thickest within about this many world units of the
// sun's x, and thin elsewhere; the path of light under the sun is this bright.
const GLITTER_SPREAD = 120,
  GLITTER_PATH = 0.35;
// The sun's reflection in glass: a band slanting down and to the left from
// under the sun on screen, this many world units of x across per unit down,
// bright this far either side of its middle and soft out to the second.
const REFLECTION_SLANT = 0.55,
  REFLECTION_CORE = 8,
  REFLECTION_EDGE = 14;
// How bright a pane's sheen is on its sunny upper right, and where the sheen
// starts, as a fraction across the pane at its top.
const SHEEN = 0.2,
  SHEEN_START = 0.15;
// The glint where the reflection crosses a pane's top right corner: a pixel
// cross, as for lamps (see drawFlare).
const PANE_FLARE = [2, 1, 0];
// Sunbeams through gaps into shade (see bakeSunShafts): how bright they are
// at full strength, and the dust in them, one mote now and then in each patch
// of the world this many units across.
const SHAFT_BRIGHTNESS = 0.6,
  MOTE = "#fff3d6",
  MOTE_PATCH = 48;
// Lens flare: ghosts of the sun on the line from it through the middle of the
// view, as [how far along (1 is the middle), radius in world units, ring width
// (0 for a solid disc), colour, brightness at full glare].
const LENS_GHOSTS = [
  [0.35, 4, 0, "#ffe0a8", 0.35],
  [0.62, 12, 0, "#cfeec8", 0.12],
  [0.9, 6, 0, "#ffd2a0", 0.22],
  [1.25, 22, 4, "#d8c8ff", 0.16],
  [1.5, 8, 0, "#bfe8f0", 0.18],
  [1.9, 30, 0, "#ffe6c0", 0.07],
];

const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
const towardWhite = (color, amount) => color.map((value) => Math.round(value + (255 - value) * amount));

// The glass panes of one layer's compiled geometry, each with the opaque
// blocks of its layer drawn over it. Whatever is in front of the layer is
// drawn after its glints. Kept per compiled geometry, so a frame doesn't look
// through every body for them.
const paneCache = new WeakMap();
function glassPanes(compiled) {
  let panes = paneCache.get(compiled);
  if (panes) return panes;
  const overlaps = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  panes = compiled.bodies
    .filter((body) => body.material === "glass")
    .map((body) => ({
      body,
      occluders: compiled.bodies.filter(
        (other) => other !== body && opaque(other) && other.blockIndex > body.blockIndex && overlaps(body.bounds, other.bounds),
      ),
    }));
  paneCache.set(compiled, panes);
  return panes;
}

/**
 * How used to the sun's glare the eyes are after `dt` seconds of seeing
 * `glare` (0…1), coming from `adapted`. Glare above that dazzles.
 */
export function adaptToGlare(adapted, glare, dt) {
  const rate = glare > adapted ? ADAPT_LIGHT : ADAPT_DARK;
  return adapted + (glare - adapted) * (1 - Math.exp(-rate * dt));
}

// Two whole numbers hashed to 0…1, so the glitter looks random but needs no
// state and looks the same whenever the scene is drawn again.
function hash(a, b) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The twinkle on one art-pixel column of water at `time`, or null: each
 * column flashes briefly now and then, more often the nearer it is to under
 * the sun (`near`, 0…1). `depth` is in art pixels below the surface.
 */
function glitterTwinkle(column, time, near) {
  const period = 0.6 + 0.8 * hash(column, -1);
  const turn = time / period + hash(column, -2);
  const cycle = Math.floor(turn);
  if (hash(column, cycle * 2) > 0.03 + 0.3 * near) return null;
  const roll = hash(column, cycle * 2 + 1);
  return { brightness: Math.sin(Math.PI * (turn - cycle)) ** 2, depth: roll < 0.7 ? 0 : roll < 0.85 ? 1 : 2 };
}

// Each hour's ambient light, blended once.
const hourAmbients = new Map();

/** The ambient light at an hour of the day: a keyframe's, or a blend of two. */
function hourAmbient(hour) {
  const h = normalizeHour(hour);
  let ambient = hourAmbients.get(h);
  if (!ambient) {
    const { from, to, t } = dayBlend(h);
    const a = AMBIENT[from], b = AMBIENT[to];
    const mix = (x, y) => x + (y - x) * t;
    ambient = t
      ? {
          sky: a.sky.map((value, i) => Math.round(mix(value, b.sky[i]))),
          cave: a.cave.map((value, i) => Math.round(mix(value, b.cave[i]))),
          soak: mix(a.soak, b.soak),
          reach: mix(a.reach, b.reach),
          open: mix(a.open, b.open),
        }
      : a;
    hourAmbients.set(h, ambient);
  }
  return ambient;
}

/** The lighting settings for a trail's time of day and weather. */
export function ambientFor(trail) {
  const preset = hourAmbient(trail.timeOfDay);
  const rain = Math.max(0, Math.min(1, Number(trail.weather?.rain) || 0)) * RAIN_SOFTEN;
  return {
    ...preset,
    sky: preset.sky.map((value) => Math.round(value + (255 - value) * rain)),
    glow: Boolean(timeOfDayPalette(trail).glow),
  };
}

const hexRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
// The sun's colour turned `warmth` of the way toward a low sun's (see sunRays).
const warmed = (color, warmth) => {
  const warm = hexRgb(RAY_WARM);
  return color.map((value, index) => Math.round(value + (warm[index] - value) * warmth));
};

export function createLighting() {
  let canvas = null,
    context = null,
    lightCanvas = null,
    lightContext = null,
    cols = 0,
    rows = 0;
  // The sun's rays and halo (`rays`), redrawn only as the sun moves on screen
  // or its rays sway, and with the baked shade cut out of them (`glare`), redrawn
  // only as the view moves (see drawGlare).
  let glareCanvas = null,
    glareContext = null,
    glareKey = "",
    raysCanvas = null,
    raysContext = null,
    raysKey = "",
    glareEntry = null,
    glintCanvas = null,
    glintContext = null,
    shaftCanvas = null,
    shaftContext = null,
    shaftKey = "",
    shaftEntry = null,
    headlights = true;
  // How used to the sun's glare the eyes are, for the ride and scene time
  // they last saw it (see drawDazzle).
  let adapted = 0,
    adaptedRide = null,
    adaptedTime = 0;
  const bakes = new WeakMap();
  const sprites = new Map();
  // The rays' gradients, drawn from the origin, by colour (see rayGradients).
  const gradients = new Map();

  function ensure(width, height) {
    if (canvas && cols === width && rows === height) return;
    cols = width;
    rows = height;
    canvas = createCanvas(cols, rows);
    context = canvas.getContext("2d");
    lightCanvas = createCanvas(cols, rows);
    lightContext = lightCanvas.getContext("2d");
    glareCanvas = raysCanvas = glintCanvas = shaftCanvas = null;
    glareKey = raysKey = shaftKey = "";
    gradients.clear();
  }

  /** Switches the bike's headlight and tail light on or off. */
  function setHeadlights(on) {
    headlights = Boolean(on);
  }

  /**
   * Bakes a trail's light, or returns the cached bake while its terrain, time
   * of day and weather are unchanged. Call it when a ride starts so the first
   * frame doesn't pay for the bake.
   */
  function prepare(trail) {
    const geometry = terrainGeometry(trail);
    const backWalls = backWallGeometry(trail);
    const { weather = {} } = trail;
    const key = `${trail.timeOfDay}|${weather.rain || 0}|${weather.snow || 0}|${weather.fog || 0}|${weather.lightning || 0}|${weather.sun}`;
    let entry = bakes.get(trail);
    if (!entry || entry.geometry !== geometry || entry.backWalls !== backWalls || entry.key !== key) {
      entry = bake(trail, ambientFor(trail));
      entry.geometry = geometry;
      entry.backWalls = backWalls;
      entry.key = key;
      bakes.set(trail, entry);
    }
    return entry;
  }

  function bake(trail, ambient) {
    const field = bakeLightField(trail, ambient);
    const entry = {
      ambient,
      field,
      glare: glareStrength(trail),
      rays: sunRays(trail),
      shade: null,
      sky: rgb(ambient.sky),
      alwaysOn: ambient.sky.some((value) => value < 255),
      image: null,
      flash: null,
      cover: null,
      tiles: null,
      tileCols: 0,
      props: null,
    };
    if (field) {
      const { width, height, light, cover } = field;
      const lightning = Boolean(trail.weather?.lightning);
      const image = new ImageData(width, height),
        coverImage = new ImageData(width, height),
        flashImage = lightning ? new ImageData(width, height) : null,
        shadeImage = entry.glare > 0 ? new ImageData(width, height) : null;
      const tileCols = Math.ceil(width / TILE);
      const tiles = new Uint8Array(tileCols * Math.ceil(height / TILE));
      const { sky, cave } = ambient;
      for (let i = 0, at = 0; i < light.length; i++, at += 4) {
        const level = light[i];
        image.data[at] = cave[0] + (sky[0] - cave[0]) * level;
        image.data[at + 1] = cave[1] + (sky[1] - cave[1]) * level;
        image.data[at + 2] = cave[2] + (sky[2] - cave[2]) * level;
        image.data[at + 3] = 255;
        coverImage.data[at + 3] = cover[i] * 255;
        if (shadeImage) shadeImage.data[at + 3] = (1 - level) * 255;
        if (flashImage) {
          const strength = 0.25 + level * 0.75;
          flashImage.data[at] = FLASH[0] * strength;
          flashImage.data[at + 1] = FLASH[1] * strength;
          flashImage.data[at + 2] = FLASH[2] * strength;
          flashImage.data[at + 3] = 255;
        }
        if (level < DAYLIGHT) {
          const c = i % width,
            r = (i - c) / width;
          tiles[Math.floor(r / TILE) * tileCols + Math.floor(c / TILE)] = 1;
        }
      }
      entry.image = toCanvas(image);
      entry.cover = toCanvas(coverImage);
      // The cover mask lives on as that canvas; the texels (up to 4 MB) don't.
      field.cover = null;
      entry.flash = flashImage && toCanvas(flashImage);
      entry.shade = shadeImage && toCanvas(shadeImage);
      entry.tiles = tiles;
      entry.tileCols = tileCols;
      entry.shafts = entry.rays.strength > 0 ? bakeShafts(trail, field, entry.rays) : null;
    }
    entry.props = propLights(trail, entry);
    return entry;
  }

  // The sun's beams through gaps into shade (see bakeSunShafts): how bright
  // each texel is, an image of them in their colour, and which tiles of the
  // field have any, for skipping views with none.
  function bakeShafts(trail, field, rays) {
    const values = bakeSunShafts(field, rays.slant);
    if (!values) return null;
    const [r, g, b] = towardWhite(warmed(hexRgb(timeOfDayPalette(trail).sun || "#fff2c8"), rays.warmth), 0.5);
    const { width, height } = field;
    const image = new ImageData(width, height);
    const tileCols = Math.ceil(width / TILE);
    const tiles = new Uint8Array(tileCols * Math.ceil(height / TILE));
    for (let i = 0, at = 0; i < values.length; i++, at += 4) {
      if (!values[i]) continue;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = values[i] * 255;
      const c = i % width;
      tiles[Math.floor((i - c) / width / TILE) * tileCols + Math.floor(c / TILE)] = 1;
    }
    return { values, image: toCanvas(image), tiles, tileCols };
  }

  function toCanvas(image) {
    const target = createCanvas(image.width, image.height);
    target.getContext("2d").putImageData(image, 0, 0);
    return target;
  }

  function darkAt(entry, x, y) {
    return entry.ambient.glow || lightFieldAt(entry.field, x, y) < DARK_BELOW;
  }

  /** Whether it is dark enough at a world point for lamps to be on. */
  function isDark(trail, x, y) {
    return darkAt(prepare(trail), x, y);
  }

  // Lights that never move, worked out once per bake. `kind` picks how each
  // flickers, pulses or blinks.
  function propLights(trail, entry) {
    const lights = [];
    for (const prop of trail.props || []) {
      const { type } = prop;
      if (!["lantern", "torch", "fireplace", "lamp", "mushrooms", "crane", "hut", "farmhouse", "wind-turbine", "tent", "watchtower"].includes(type)) continue;
      const ground = terrainAt(trail, prop.x);
      if (!ground.solid && !Number.isFinite(prop.y)) continue;
      const y = Number.isFinite(prop.y) ? prop.y : ground.y;
      // Points on the prop's art, flipped and rotated with it.
      const at = (lx, ly) => propPoint(prop, y, lx, ly);
      const angle = propRotation(prop);
      if (type === "lantern") {
        const fit = propWallFit(trail, prop);
        const cy = y + (fit?.body || 0) + LANTERN_CENTRE;
        lights.push({ kind: type, phase: prop.x, x: prop.x, y: cy, radius: 150, color: LANTERN, flare: LANTERN_FLARE });
      } else if (type === "torch") {
        // Firelight, always; it flickers like a lantern.
        const flame = at(TORCH_FLAME.x, TORCH_FLAME.y - 6);
        lights.push({ kind: "lantern", phase: prop.x, x: flame.x, y: flame.y, radius: 160, color: LANTERN, flare: LANTERN_FLARE });
      } else if (type === "mushrooms") {
        const glow = at(0, -6);
        lights.push({ kind: type, phase: prop.x, x: glow.x, y: glow.y, radius: 64, color: GLOW, strength: 0.8 });
      } else if (type === "lamp") {
        const { x: hx, y: hy } = at(LAMP_HEAD.x, LAMP_HEAD.y);
        if (!darkAt(entry, hx, hy)) continue;
        lights.push({ x: hx, y: hy, radius: 210, color: LAMP, angle: Math.PI / 2 + angle, spread: 0.42 });
        lights.push({ x: hx, y: hy, radius: 40, color: LAMP, strength: 0.6, flare: LAMP_FLARE });
      } else if (type === "hut") {
        // Firelight in the window, after dark; it flickers like a lantern.
        const window = at(...HUT_WINDOW_CENTRE);
        if (!darkAt(entry, window.x, window.y)) continue;
        lights.push({ kind: "lantern", phase: prop.x, x: window.x, y: window.y, radius: 110, color: LANTERN, strength: 0.8, flare: LANTERN_FLARE });
      } else if (type === "farmhouse") {
        // Lamplight in the lit windows, after dark; each flickers on its own.
        const middle = at(...farmhouseWindowCentre(2));
        if (!darkAt(entry, middle.x, middle.y)) continue;
        farmhouseLitWindows(prop.x).forEach((lit, index) => {
          if (!lit) return;
          const window = at(...farmhouseWindowCentre(index));
          lights.push({ kind: "lantern", phase: prop.x + index * 37, x: window.x, y: window.y, radius: 80, color: LANTERN, strength: 0.6, flare: LANTERN_FLARE });
        });
      } else if (type === "wind-turbine") {
        // The warning light on the nacelle, after dark; it blinks like a
        // crane's, in step with every other turbine's.
        const light = at(TURBINE.light.x, TURBINE.light.y);
        if (!darkAt(entry, light.x, light.y)) continue;
        lights.push({ kind: "crane", phase: 0, x: light.x, y: light.y, radius: 40, color: CRANE, strength: 0.7, flare: CRANE_FLARE });
      } else if (type === "fireplace") {
        // Firelight, always; it flickers like a lantern, and reaches further
        // than a torch's.
        const fire = at(0, FIRE.y - 10);
        lights.push({ kind: "lantern", phase: prop.x, x: fire.x, y: fire.y, radius: 190, color: LANTERN, flare: LANTERN_FLARE });
      } else if (type === "tent") {
        // The lantern inside, after dark, glowing through the doorway.
        const door = at(...TENT_DOOR_CENTRE);
        if (!darkAt(entry, door.x, door.y)) continue;
        lights.push({ kind: "lantern", phase: prop.x, x: door.x, y: door.y, radius: 90, color: LANTERN, strength: 0.7, flare: LANTERN_FLARE });
      } else if (type === "watchtower") {
        // A glow round the searchlight itself, after dark; its beam moves, so
        // drawing.js draws that.
        const lamp = at(SEARCHLIGHT.x, SEARCHLIGHT.y);
        if (!darkAt(entry, lamp.x, lamp.y)) continue;
        lights.push({ x: lamp.x, y: lamp.y, radius: 56, color: LAMP, strength: 0.6, flare: LAMP_FLARE });
      } else {
        const top = at(...CRANE_LIGHTS[0]);
        if (!darkAt(entry, top.x, top.y)) continue;
        CRANE_LIGHTS.forEach(([lx, ly], index) => {
          const light = at(lx, ly);
          lights.push({ kind: type, phase: index, x: light.x, y: light.y, radius: 40, color: CRANE, strength: 0.7, flare: CRANE_FLARE });
        });
      }
    }
    return lights;
  }

  // `flip` is the animated facing, -1…1. The lights sit on the lamps the bike
  // art draws (see bike-lamps.js), placed with the same transform as the
  // sprite: centred between the wheels, turned to the frame and mirrored by
  // `flip`, so they stay on the bike through flips, loops and 180s in the air.
  // The brake light works with the lights off, and glows brighter the harder
  // it's held.
  function bikeLights(ride, flip, look, lights, entry = null, on = headlights) {
    const brake = Math.max(0, Math.min(1, ride.brakePressure || 0));
    const braking = brake > 0.08;
    if (ride.ragdoll || (!on && !braking)) return;
    const { rear, front } = ride;
    const mx = (rear.x + front.x) / 2,
      my = (rear.y + front.y) / 2;
    const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const at = ([lx, ly]) => ({ x: mx + cos * flip * lx - sin * ly, y: my + sin * flip * lx + cos * ly });
    const facing = flip < 0 ? -1 : 1;
    const turn = Math.abs(flip);
    const lamps = bikeLampPoints({ rear, front, facing: ride.facing, look });
    const tail = braking ? 0.75 + 0.5 * brake : 0.7;
    lights.push({
      ...at(lamps.tail),
      radius: braking ? 24 + 22 * brake : 22,
      color: TAIL,
      strength: tail * turn,
      flare: brake > 0.6 ? BRAKE_FLARE : TAIL_FLARE,
    });
    if (!on) return;
    const head = at(lamps.head);
    // In full daylight, with the lamp out under a white sky, the beam adds
    // nothing the light map can show; only its glint is drawn.
    const glintOnly = Boolean(entry && !entry.alwaysOn && lightFieldAt(entry.field, head.x, head.y) >= 1);
    lights.push({
      ...head,
      radius: 230,
      color: HEADLIGHT,
      strength: turn,
      angle: Math.atan2(sin * facing, cos * facing),
      spread: 0.3,
      flare: HEADLIGHT_FLARE,
      glintOnly,
    });
  }

  function strengthOf(item, time) {
    const base = item.strength ?? 1;
    if (item.kind === "lantern") return base * lanternFlicker(item.phase, time);
    if (item.kind === "mushrooms") return base * mushroomPulse(item.phase, time);
    if (item.kind === "crane") return craneLightOn(item.phase, time) ? base : 0;
    return base;
  }

  // A light at full strength, cached by size, colour and beam width. A beam
  // points along +x from the sprite's centre.
  function sprite(radius, color, spread = 0) {
    const r = Math.max(1, Math.round(radius / ART_PIXEL));
    const key = `${r}|${color}|${spread}`;
    let cached = sprites.get(key);
    if (cached) return cached;
    const image = createCanvas(r * 2, r * 2);
    const g = image.getContext("2d");
    if (spread) {
      g.beginPath();
      g.moveTo(r, r);
      g.arc(r, r, r, -spread, spread);
      g.closePath();
      g.clip();
    }
    const gradient = g.createRadialGradient(r, r, 0, r, r, r);
    const [cr, cg, cb] = color;
    let from = 0;
    for (const [to, level] of BANDS) {
      const stop = `rgba(${cr},${cg},${cb},${level})`;
      gradient.addColorStop(from, stop);
      gradient.addColorStop(to, stop);
      from = Math.min(1, to + 0.0001);
    }
    gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, r * 2, r * 2);
    cached = { image, r };
    sprites.set(key, cached);
    return cached;
  }

  // The area a light reaches before the terrain blocks it, as a world-space
  // polygon [x, y, x, y, …], or null when nothing blocks it.
  function lightShape(field, { x, y, radius, spread = 0, angle = 0 }) {
    // A beam's polygon is a touch wider than the beam so its edges aren't clipped.
    const arc = spread ? spread * 2 + 0.04 : Math.PI * 2;
    const count = Math.max(8, Math.min(180, Math.ceil((arc * radius) / RAY_SPACING)));
    const from = spread ? angle - spread - 0.02 : 0;
    const points = spread ? [x, y] : [];
    let blocked = false;
    for (let i = 0; i < (spread ? count + 1 : count); i++) {
      const a = from + (arc * i) / count,
        dx = Math.cos(a),
        dy = Math.sin(a);
      const reach = lightReach(field, x, y, dx, dy, radius, SHADOW_SKIN);
      if (reach < radius) blocked = true;
      points.push(x + dx * reach, y + dy * reach);
    }
    return blocked ? points : null;
  }

  // Lights are cut to what they can reach, so they cast shadows; prop lights
  // never move, so their shape is worked out once, the first time they're seen.
  function stamp(item, strength, left, top, field) {
    const { image, r } = sprite(item.radius, item.color, item.spread);
    const px = Math.round((item.x - left) / ART_PIXEL),
      py = Math.round((item.y - top) / ART_PIXEL);
    if (px + r < 0 || py + r < 0 || px - r > cols || py - r > rows) return false;
    if (item.glintOnly) return true;
    if (item.shape === undefined) item.shape = field ? lightShape(field, item) : null;
    const shape = item.shape;
    if (shape) {
      lightContext.save();
      lightContext.beginPath();
      for (let k = 0; k < shape.length; k += 2)
        lightContext.lineTo((shape[k] - left) / ART_PIXEL, (shape[k + 1] - top) / ART_PIXEL);
      lightContext.closePath();
      lightContext.clip();
    }
    lightContext.globalAlpha = Math.min(1, strength);
    if (item.spread) {
      lightContext.setTransform(1, 0, 0, 1, px, py);
      lightContext.rotate(item.angle);
      lightContext.drawImage(image, -r, -r);
      lightContext.setTransform(1, 0, 0, 1, 0, 0);
    } else lightContext.drawImage(image, px - r, py - r);
    if (shape) lightContext.restore();
    return true;
  }

  // Draws one of the baked layers for the view; below the field its bottom
  // row carries on down, and anything else outside it is open sky.
  function drawField(target, image, field, left, top) {
    const { unit } = field;
    const scale = unit / ART_PIXEL;
    const sx = (left - field.x) / unit,
      sy = (top - field.y) / unit;
    const x0 = Math.max(0, Math.floor(sx) - 1),
      x1 = Math.min(field.width, Math.ceil(sx + cols / scale) + 1);
    if (x1 <= x0) return;
    const y0 = Math.max(0, Math.floor(sy) - 1),
      y1 = Math.min(field.height, Math.ceil(sy + rows / scale) + 1);
    const dx = (x0 - sx) * scale,
      dw = (x1 - x0) * scale;
    if (y1 > y0) target.drawImage(image, x0, y0, x1 - x0, y1 - y0, dx, (y0 - sy) * scale, dw, (y1 - y0) * scale);
    const bottom = Math.max(0, (field.height - 1 - sy) * scale);
    if (bottom < rows) target.drawImage(image, x0, field.height - 1, x1 - x0, 1, dx, bottom, dw, rows - bottom);
  }

  // Whether any of the view isn't in full daylight.
  function viewIsLit(entry, left, top) {
    return Boolean(entry.field) && tilesInView(entry.field, entry.tiles, entry.tileCols, left, top);
  }

  /** Whether any of a field's marked tiles is in the view at (left, top). */
  function tilesInView(field, tiles, tileCols, left, top) {
    const span = field.unit * TILE;
    const c0 = Math.max(0, Math.floor((left - field.x) / span)),
      c1 = Math.min(tileCols - 1, Math.floor((left + cols * ART_PIXEL - field.x) / span));
    const tileRows = tiles.length / tileCols;
    const r0 = Math.min(tileRows - 1, Math.max(0, Math.floor((top - field.y) / span))),
      r1 = Math.min(tileRows - 1, Math.max(0, Math.floor((top + rows * ART_PIXEL - field.y) / span)));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tiles[r * tileCols + c]) return true;
    return false;
  }

  /**
   * Multiplies everything already drawn by the light map, then adds a pixel
   * glint on each light's source, and a strong sun's glare, its glitter on
   * the ride's water and its dazzle as it comes out. Draws in world space;
   * `width` and `height` are the view's size in world units. Returns false
   * when the view is in full daylight and the scene needed no shading. `sun`
   * is the sun's place and strength for this view (see sunLight), when the
   * caller has it already; `still` is for reduced motion.
   */
  function draw(ctx, options) {
    const { trail, cameraX, cameraY, width, height } = options;
    const entry = prepare(trail);
    const left = Math.floor(cameraX / ART_PIXEL) * ART_PIXEL,
      top = Math.floor(cameraY / ART_PIXEL) * ART_PIXEL;
    ensure(Math.ceil(width / ART_PIXEL) + 2, Math.ceil(height / ART_PIXEL) + 2);
    const lit = (entry.alwaysOn || viewIsLit(entry, left, top)) && shadeScene(ctx, entry, options, left, top);
    if (entry.glare > 0) {
      const sun =
        options.sun ?? sunLight({ width, cameraX, cameraY, weather: trail.weather, timeOfDay: trail.timeOfDay });
      const color = hexRgb(timeOfDayPalette(trail).sun || "#fff2c8");
      // A cloud over the sun dims all its shine, and lets it dazzle as it comes out.
      const clear = 1 - sun.clouded;
      const open = sunOpen(entry, trail, sun, cameraX + sun.x, cameraY + sun.y) * clear;
      const glare = entry.glare * open;
      if (entry.shafts) drawShafts(ctx, entry, options, sun, left, top);
      if (glare > 0.01) {
        const rays = entry.rays.strength * open * (1 + EDGE_RAYS * 4 * open * (1 - open));
        drawGlare(ctx, entry, options, sun, color, glare, rays, left, top);
        drawGhosts(ctx, options, sun, glare);
      }
      drawGlitter(ctx, entry, options, sun, color, shineOf(entry, sun));
      drawDazzle(ctx, options, sun, color, glare);
    }
    return lit;
  }

  /**
   * The sun caught in the glass of one `layer`, "back" walls or "terrain",
   * drawn just after that layer, so whatever stands in front of a window
   * hides its glint. Draws in world space, as `draw` does, with its options.
   */
  function drawGlass(ctx, options, layer) {
    const { trail, ride, cameraX, cameraY, width, height } = options;
    const entry = prepare(trail);
    if (entry.glare <= 0) return;
    // Broken panes are gone from the ride's own terrain, so they don't glint.
    const terrain = ride?.trail ?? trail;
    const compiled = layer === "back" ? backWallGeometry(terrain) : terrainGeometry(terrain);
    if (!compiled) return;
    const left = Math.floor(cameraX / ART_PIXEL) * ART_PIXEL,
      top = Math.floor(cameraY / ART_PIXEL) * ART_PIXEL;
    ensure(Math.ceil(width / ART_PIXEL) + 2, Math.ceil(height / ART_PIXEL) + 2);
    const sun = options.sun ?? sunLight({ width, cameraX, cameraY, weather: trail.weather, timeOfDay: trail.timeOfDay });
    const color = hexRgb(timeOfDayPalette(trail).sun || "#fff2c8");
    drawGlints(ctx, entry, options, sun, color, shineOf(entry, sun), left, top, compiled);
  }

  // A low sun shines on water and glass well after its glare has faded: in
  // full from half the glare, and fading out with it more slowly. A cloud
  // over the sun dims it.
  function shineOf(entry, sun) {
    return Math.min(1, Math.sqrt(entry.glare * 2)) * (1 - sun.clouded);
  }

  function shadeScene(ctx, entry, { ride, look = null, flash = 0, time = 0, flip = 1, lights: extra = [] }, left, top) {
    const { field } = entry;

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = entry.sky;
    context.fillRect(0, 0, cols, rows);
    context.imageSmoothingEnabled = true;
    if (field) drawField(context, entry.image, field, left, top);
    if (flash > 0 && entry.flash) {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = Math.min(1, flash);
      drawField(context, entry.flash, field, left, top);
      context.globalAlpha = 1;
    }

    // `extra`: passing lights, like fireworks bursting over the trail.
    const lights = [...entry.props, ...extra];
    bikeLights(ride, flip, look, lights, entry);
    return composeLights(ctx, lights, { left, top, field, cover: entry.cover, time });
  }

  /**
   * The bike in a dark room (the garage with its lights off): everything
   * already drawn is darkened to `room`, lit only by the bike's lights, which
   * are on whatever the setting. Draws in world space, like `draw`.
   */
  function drawDark(ctx, { ride, look = null, cameraX, cameraY, width, height, flip = ride.facing, room = DARK_ROOM }) {
    const left = Math.floor(cameraX / ART_PIXEL) * ART_PIXEL,
      top = Math.floor(cameraY / ART_PIXEL) * ART_PIXEL;
    ensure(Math.ceil(width / ART_PIXEL) + 2, Math.ceil(height / ART_PIXEL) + 2);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = room;
    context.fillRect(0, 0, cols, rows);
    const lights = [];
    bikeLights(ride, flip, look, lights, null, true);
    return composeLights(ctx, lights, { left, top, field: null, time: 0 });
  }

  // Adds `lights` to the light map (`context`, holding the ambient light),
  // multiplies the scene by it, then puts a glint on each light's source.
  function composeLights(ctx, lights, { left, top, field = null, cover = null, time }) {
    lightContext.setTransform(1, 0, 0, 1, 0, 0);
    lightContext.globalCompositeOperation = "source-over";
    lightContext.globalAlpha = 1;
    lightContext.clearRect(0, 0, cols, rows);
    lightContext.globalCompositeOperation = "lighter";
    lightContext.imageSmoothingEnabled = false;
    const flares = [];
    let stamped = 0;
    for (const item of lights) {
      const strength = strengthOf(item, time);
      if (strength <= 0 || !stamp(item, strength, left, top, field)) continue;
      if (!item.glintOnly) stamped++;
      if (item.flare) flares.push(item, strength);
    }
    if (stamped) {
      if (field) {
        // Moving lights only reach the skin of the rock.
        lightContext.globalCompositeOperation = "destination-out";
        lightContext.globalAlpha = 1;
        lightContext.imageSmoothingEnabled = true;
        drawField(lightContext, cover, field, left, top);
      }
      context.globalCompositeOperation = "lighter";
      context.drawImage(lightCanvas, 0, 0);
      context.globalCompositeOperation = "source-over";
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(canvas, left, top, cols * ART_PIXEL, rows * ART_PIXEL);
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < flares.length; index += 2) drawFlare(ctx, flares[index], flares[index + 1]);
    ctx.restore();
    return true;
  }

  // A light's glint: a pixel cross on the art grid, centred on the art pixel
  // the light shines from and filled out to a diamond `body` pixels across,
  // dimming with each step out.
  function drawFlare(ctx, item, strength) {
    const [arm, brightness, body = 0] = item.flare;
    const x = Math.floor(item.x / ART_PIXEL) * ART_PIXEL,
      y = Math.floor(item.y / ART_PIXEL) * ART_PIXEL;
    ctx.fillStyle = rgb(item.color);
    for (let dy = -arm; dy <= arm; dy++) {
      for (let dx = -arm; dx <= arm; dx++) {
        const steps = Math.abs(dx) + Math.abs(dy);
        if (dx && dy && steps > body) continue;
        ctx.globalAlpha = Math.min(1, brightness * strength * (1 - steps / (arm + 1)));
        ctx.fillRect(x + dx * ART_PIXEL, y + dy * ART_PIXEL, ART_PIXEL, ART_PIXEL);
      }
    }
  }

  // The rays' gradients for a colour and length (see sunRays), drawn from the origin (translated to the
  // sun as they are used) and kept, as a radial gradient is dear to build.
  function rayGradients(color, longer) {
    const key = `${color.join(",")}|${longer}`;
    let list = gradients.get(key);
    if (list) return list;
    const [cr, cg, cb] = color;
    const diagonal = Math.hypot(cols, rows) * longer;
    list = SUN_RAYS.map(([, , length, level]) => {
      const gradient = raysContext.createRadialGradient(0, 0, 0, 0, 0, length * diagonal);
      let from = 0;
      for (const [to, band] of BANDS) {
        const stop = `rgba(${cr},${cg},${cb},${band * level})`;
        gradient.addColorStop(from, stop);
        gradient.addColorStop(to, stop);
        from = Math.min(1, to + 0.0001);
      }
      gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      return gradient;
    });
    gradients.set(key, list);
    return list;
  }

  // Sunbeams through gaps into shade (see bakeSunShafts), as strong as the
  // sun's rays, so a passing cloud dims them too, and screened on like the
  // glare. They are only cut to the view again when it has moved. Dust drifts
  // in them, a mote now and then in each patch of the world, showing only
  // where it is in a beam; with reduced motion there is none.
  function drawShafts(ctx, entry, { time = 0, still = false }, sun, left, top) {
    const { field, shafts } = entry;
    const strength = entry.rays.strength * (1 - sun.clouded);
    if (strength <= 0.01 || !tilesInView(field, shafts.tiles, shafts.tileCols, left, top)) return;
    if (!shaftCanvas) {
      shaftCanvas = createCanvas(cols, rows);
      shaftContext = shaftCanvas.getContext("2d");
    }
    const key = `${left}|${top}`;
    if (key !== shaftKey || entry !== shaftEntry) {
      shaftKey = key;
      shaftEntry = entry;
      shaftContext.clearRect(0, 0, cols, rows);
      shaftContext.imageSmoothingEnabled = true;
      drawField(shaftContext, shafts.image, field, left, top);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = SHAFT_BRIGHTNESS * strength;
    ctx.drawImage(shaftCanvas, left, top, cols * ART_PIXEL, rows * ART_PIXEL);
    if (!still) {
      ctx.fillStyle = MOTE;
      const right = left + cols * ART_PIXEL,
        bottom = top + rows * ART_PIXEL;
      for (let cy = Math.floor(top / MOTE_PATCH); cy * MOTE_PATCH < bottom; cy++)
        for (let cx = Math.floor(left / MOTE_PATCH); cx * MOTE_PATCH < right; cx++) {
          const patch = cx * 7919 + cy;
          const life = 6 + 6 * hash(patch, -1),
            turn = time / life + hash(patch, -2),
            round = Math.floor(turn),
            age = (turn - round) * life;
          const x = (cx + hash(patch, round * 2)) * MOTE_PATCH + Math.sin(age * 0.7 + patch) * 6,
            y = (cy + hash(patch, round * 2 + 1)) * MOTE_PATCH + age * 1.6;
          const c = Math.floor((x - field.x) / field.unit),
            r = Math.floor((y - field.y) / field.unit);
          if (c < 0 || r < 0 || c >= field.width || r >= field.height) continue;
          const beam = shafts.values[r * field.width + c];
          if (beam < 0.15) continue;
          ctx.globalAlpha = Math.sin((Math.PI * age) / life) * Math.min(1, beam * 2) * strength * 0.8;
          ctx.fillRect(Math.round(x / ART_PIXEL) * ART_PIXEL, Math.round(y / ART_PIXEL) * ART_PIXEL, ART_PIXEL, ART_PIXEL);
        }
    }
    ctx.restore();
  }

  // How much of the sun shows from its place (sx, sy) in the world, 0…1: less
  // when that place is dark, as when the view is deep in a cave, and as
  // terrain or a back wall in front of the sun hides it.
  function sunOpen(entry, trail, sun, sx, sy) {
    const seen = entry.field ? Math.max(0, lightFieldAt(entry.field, sx, sy) * 2 - 1) : 1;
    return seen * (seen > 0 ? sunVisible(trail, sx, sy, sun.radius) : 0);
  }

  // The glare of a strong sun: a halo round it as strong as `glare`, and slow
  // rays fanning down across the view as strong as `rays` (see sunRays),
  // kept out of caves and rock by the baked shade. Screened on top so it only
  // ever brightens. The rays are only drawn again when the sun has moved a
  // pixel on screen, their sway has moved on (about every third frame) or
  // their strength has changed a step, and the shade is only cut out again
  // when the view has moved; otherwise the kept canvas is laid over the scene.
  function drawGlare(ctx, entry, { cameraX, cameraY, width, height, time = 0 }, sun, color, glare, rays, left, top) {
    const sx = cameraX + sun.x,
      sy = cameraY + sun.y;
    if (!raysCanvas) {
      raysCanvas = createCanvas(cols, rows);
      raysContext = raysCanvas.getContext("2d");
    }
    const ox = Math.round((sx - left) / ART_PIXEL),
      oy = Math.round((sy - top) / ART_PIXEL);
    const toward = Math.atan2(height * 0.6 - sun.y, width * 0.5 - sun.x);
    const sway = Math.floor(time * 20);
    // The whole glare is laid on as strong as the halo, so the rays are drawn
    // as strong as they are beside it, over again where that is more than once.
    const beside = Math.round((rays / glare) * 20) / 20;
    const { longer, warmth } = entry.rays;
    const rayColor = warmed(color, warmth);
    const key = `${ox}|${oy}|${Math.round(toward * 100)}|${sway}|${color}|${sun.radius}|${beside}`;
    if (key !== raysKey) {
      raysKey = key;
      const g = raysContext;
      const diagonal = Math.hypot(cols, rows) * longer;
      const beams = rayGradients(rayColor, longer);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, cols, rows);
      g.globalCompositeOperation = "lighter";
      g.imageSmoothingEnabled = false;
      g.translate(ox, oy);
      const swayTime = sway / 20;
      for (let remaining = beside; remaining > 0; remaining--)
        SUN_RAYS.forEach(([offset, spread, length], index) => {
          const angle = toward + offset + Math.sin(swayTime * 0.21 + index * 2.3) * 0.025;
          const pulse = 0.7 + 0.3 * Math.sin(swayTime * 0.55 + index * 1.7);
          const reach = length * diagonal;
          g.globalAlpha = pulse * Math.min(1, remaining);
          g.fillStyle = beams[index];
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, reach, angle - spread, angle + spread);
          g.closePath();
          g.fill();
        });
      g.globalAlpha = 1;
      const halo = sprite(150, color);
      g.drawImage(halo.image, -halo.r, -halo.r);
      // The rays and halo start at the sun's edge rather than cross its disc:
      // the disc's cells (see drawPixelDisc), on its 4-unit grid, are cut out.
      g.globalCompositeOperation = "destination-out";
      g.globalAlpha = 1;
      const cell = 4 / ART_PIXEL,
        cells = Math.ceil(sun.radius / 4);
      for (let row = -cells; row <= cells; row++) {
        const span = Math.floor(Math.sqrt(cells * cells - row * row));
        g.fillRect(-span * cell, row * cell, (span * 2 + 1) * cell, cell);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
    }
    let image = raysCanvas;
    if (entry.shade) {
      if (!glareCanvas) {
        glareCanvas = createCanvas(cols, rows);
        glareContext = glareCanvas.getContext("2d");
      }
      const shadeKey = `${key}|${left}|${top}`;
      if (shadeKey !== glareKey || entry !== glareEntry) {
        glareKey = shadeKey;
        glareEntry = entry;
        const g = glareContext;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
        g.clearRect(0, 0, cols, rows);
        g.drawImage(raysCanvas, 0, 0);
        g.globalCompositeOperation = "destination-out";
        g.imageSmoothingEnabled = true;
        drawField(g, entry.shade, entry.field, left, top);
        g.globalCompositeOperation = "source-over";
      }
      image = glareCanvas;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.24 * glare;
    ctx.drawImage(image, left, top, cols * ART_PIXEL, rows * ART_PIXEL);
    ctx.restore();
  }

  // Glitter on water in a clear sun: a faint path of light along the surface
  // under the sun, and twinkles on it, thick there and thin elsewhere. Only
  // water in daylight glitters, and with reduced motion only the path shows.
  function drawGlitter(ctx, entry, { trail, ride, cameraX, cameraY, width, height, time = 0, still = false }, sun, color, shine) {
    if (!ride?.water?.length) return;
    const compiled = terrainGeometry(trail);
    const sx = cameraX + sun.x;
    const path = rgb(towardWhite(color, 0.4)),
      spark = rgb(towardWhite(color, 0.65));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const body of ride.water) {
      if (body.x > cameraX + width || body.x + body.width < cameraX || body.y > cameraY + height || body.y < cameraY)
        continue;
      const surface = Math.round(body.y / ART_PIXEL) * ART_PIXEL;
      for (const { x, segments } of waterColumns(compiled, body, ART_PIXEL)) {
        if (x < cameraX - ART_PIXEL || x > cameraX + width || Math.abs(segments[0][0] - body.y) >= 0.5) continue;
        const y = surface + surfaceWave(x, time);
        const lit = Math.max(0, Math.min(1, (lightFieldAt(entry.field, x, y - ART_PIXEL) - 0.6) / 0.4));
        const strength = shine * lit;
        if (strength <= 0) continue;
        const near = Math.exp(-(((x - sx) / GLITTER_SPREAD) ** 2));
        ctx.fillStyle = path;
        ctx.globalAlpha = GLITTER_PATH * near * strength;
        ctx.fillRect(x, y, ART_PIXEL, ART_PIXEL);
        if (still) continue;
        const twinkle = glitterTwinkle(x / ART_PIXEL, time, near);
        if (!twinkle) continue;
        const alpha = twinkle.brightness * strength,
          top = y + twinkle.depth * ART_PIXEL;
        ctx.fillStyle = spark;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, top, ART_PIXEL, ART_PIXEL);
        // The brightest, right under the sun, catch it as a little cross.
        if (twinkle.depth || near < 0.55 || twinkle.brightness < 0.6) continue;
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillRect(x - ART_PIXEL, top, ART_PIXEL, ART_PIXEL);
        ctx.fillRect(x + ART_PIXEL, top, ART_PIXEL, ART_PIXEL);
        ctx.fillRect(x, top - ART_PIXEL, ART_PIXEL, ART_PIXEL);
      }
    }
    ctx.restore();
  }

  // Lens flare: faint ghosts of the sun strung along the line from it through
  // the middle of the view, so they swing about as the camera moves. Pixel
  // discs and a ring on the art grid, as bright as the glare, so they fade as
  // terrain or a cloud covers the sun.
  function drawGhosts(ctx, { cameraX, cameraY, width, height }, sun, glare) {
    const sx = cameraX + sun.x,
      sy = cameraY + sun.y;
    const dx = cameraX + width / 2 - sx,
      dy = cameraY + height / 2 - sy;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const [along, radius, ring, color, brightness] of LENS_GHOSTS) {
      const cx = Math.round((sx + dx * along) / ART_PIXEL) * ART_PIXEL,
        cy = Math.round((sy + dy * along) / ART_PIXEL) * ART_PIXEL;
      const cells = radius / ART_PIXEL,
        hole = ring ? (radius - ring) / ART_PIXEL : 0;
      ctx.fillStyle = color;
      ctx.globalAlpha = brightness * glare;
      for (let row = -cells; row <= cells; row++) {
        const reach = Math.floor(Math.sqrt(cells * cells - row * row));
        const inner = Math.abs(row) < hole ? Math.ceil(Math.sqrt(hole * hole - row * row)) : 0;
        const y = cy + row * ART_PIXEL;
        if (!inner) ctx.fillRect(cx - reach * ART_PIXEL, y, (reach * 2 + 1) * ART_PIXEL, ART_PIXEL);
        else {
          ctx.fillRect(cx - reach * ART_PIXEL, y, (reach - inner + 1) * ART_PIXEL, ART_PIXEL);
          ctx.fillRect(cx + inner * ART_PIXEL, y, (reach - inner + 1) * ART_PIXEL, ART_PIXEL);
        }
      }
    }
    ctx.restore();
  }

  // The sun caught in the glass of one layer's geometry (`compiled`): each
  // pane in daylight gets a faint sheen on its sunny upper right, and the
  // sun's reflection lies across the panes in a slanted band under the sun on
  // screen, so it crosses each window as the view rides past and glints at
  // the pane's top right corner as it goes.
  function drawGlints(ctx, entry, { cameraX, cameraY, width, height }, sun, color, shine, left, top, compiled) {
    const panes = glassPanes(compiled);
    if (!panes.length) return;
    const sx = cameraX + sun.x,
      sy = cameraY + sun.y;
    // Where the middle of the reflection is at height y.
    const reflection = (y) => sx - (y - sy) * REFLECTION_SLANT;
    if (!glintCanvas) {
      glintCanvas = createCanvas(cols, rows);
      glintContext = glintCanvas.getContext("2d");
    }
    const g = glintContext;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, cols, rows);
    // Drawn in world units, one texel per art pixel.
    g.setTransform(1 / ART_PIXEL, 0, 0, 1 / ART_PIXEL, -left / ART_PIXEL, -top / ART_PIXEL);
    g.fillStyle = rgb(towardWhite(color, 0.8));
    const flare = towardWhite(color, 0.9);
    let drawn = false;
    for (const { body, occluders } of panes) {
      const { left: x0, right: x1, top: y0, bottom: y1 } = body.bounds;
      if (x1 < cameraX || x0 > cameraX + width || y1 < cameraY || y0 > cameraY + height) continue;
      const lit = Math.max(0, Math.min(1, (lightFieldAt(entry.field, (x0 + x1) / 2, (y0 + y1) / 2) - 0.6) / 0.4));
      const strength = shine * lit;
      if (strength <= 0) continue;
      drawn = true;
      g.save();
      g.beginPath();
      tracePath(g, body.rings);
      g.clip("evenodd");
      const across = x1 - x0,
        tall = y1 - y0;
      for (let y = Math.floor(y0 / ART_PIXEL) * ART_PIXEL; y < y1; y += ART_PIXEL) {
        // The sheen, right of a line running down from near the top left to the right side.
        const from = Math.round((x0 + across * (SHEEN_START + (1 - SHEEN_START) * ((y - y0) / tall))) / ART_PIXEL) * ART_PIXEL;
        g.globalAlpha = SHEEN * strength;
        g.fillRect(from, y, x1 - from, ART_PIXEL);
        const middle = Math.round(reflection(y) / ART_PIXEL) * ART_PIXEL;
        if (middle + REFLECTION_EDGE < x0 || middle - REFLECTION_EDGE > x1) continue;
        g.globalAlpha = 0.25 * strength;
        g.fillRect(middle - REFLECTION_EDGE, y, REFLECTION_EDGE * 2, ART_PIXEL);
        g.globalAlpha = 0.3 * strength;
        g.fillRect(middle - REFLECTION_CORE, y, REFLECTION_CORE * 2, ART_PIXEL);
      }
      g.restore();
      const miss = Math.abs(x1 - reflection(y0));
      if (miss < REFLECTION_CORE * 1.5)
        drawFlare(g, { x: x1 - ART_PIXEL, y: y0 + ART_PIXEL, color: flare, flare: PANE_FLARE }, strength * (1 - miss / (REFLECTION_CORE * 1.5)));
      // Whatever is drawn over the pane hides its glints.
      if (occluders.length) {
        g.save();
        g.globalCompositeOperation = "destination-out";
        g.globalAlpha = 1;
        // One at a time, so each keeps its holes, such as its own windows.
        for (const other of occluders) {
          g.beginPath();
          tracePath(g, other.rings);
          g.fill("evenodd");
        }
        g.restore();
      }
    }
    if (!drawn) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(glintCanvas, left, top, cols * ART_PIXEL, rows * ART_PIXEL);
    ctx.restore();
  }

  // The eyes adjusting as the sun comes out from behind a hill or the view
  // leaves a cave: a glow from the sun across the view, as strong as the glare
  // has outgrown what the eyes are used to, settling over about a second. A
  // new ride starts used to its sun, and with reduced motion there is none.
  function drawDazzle(ctx, { ride, cameraX, cameraY, width, height, time = 0, still = false }, sun, color, glare) {
    if (ride !== adaptedRide || still) {
      adaptedRide = ride;
      adapted = glare;
      adaptedTime = time;
      return;
    }
    adapted = adaptToGlare(adapted, glare, Math.max(0, Math.min(0.25, time - adaptedTime)));
    adaptedTime = time;
    const dazzle = (glare - adapted) * DAZZLE;
    if (dazzle <= 0.01) return;
    const [r, g, b] = towardWhite(color, 0.5);
    const x = cameraX + sun.x,
      y = cameraY + sun.y;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.hypot(width, height) * DAZZLE_REACH);
    gradient.addColorStop(0, `rgba(${r},${g},${b},${dazzle})`);
    gradient.addColorStop(0.35, `rgba(${r},${g},${b},${dazzle * 0.43})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},${dazzle * 0.16})`);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(cameraX, cameraY, width, height);
    ctx.restore();
  }

  return { prepare, isDark, draw, drawGlass, drawDark, setHeadlights };
}
