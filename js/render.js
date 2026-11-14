// Scene rendering. Everything is drawn straight onto the screen canvas, scaled
// so one art pixel covers a whole number of device pixels. Art stays on its
// pixel grid, while the camera and moving sprites are placed to the nearest
// device pixel so scrolling and riding stay smooth.
import { RADIUS, TAU, clamp, lerp } from "./config.js";
import {
  ART_PIXEL,
  createCanvas,
  createDrawingTools,
  createGameArt,
  fogAmount,
  fogColor,
  PAINTED_PROPS,
  graffitiTurnedBounds,
  paintedBounds,
  paintedPropY,
  propAlignmentSlope,
  propGroundOffset,
  propPoint,
  propRotation,
  propSpan,
  propWallFit,
  rabbitPropAt,
  sunLight,
  sunShadowOffset,
  waterPropAt,
} from "./drawing.js";
import { fallLine, terrainAt, groundShadowSamples, terrainGeometry, terrainRaycastAt } from "./terrain.js";
import { finishHeight } from "./trail-schema.js";
import { waterBodies, waterColumns, surfaceWave } from "./water.js";
import { createTerrainRenderer } from "./terrain-render.js";
import { riderCollisionPoints } from "./ride.js";
import { probeClearance } from "./debug-hud.js";
import { vehicleMetrics } from "./vehicle-physics.js";
import { ragdollCenter } from "./ragdoll.js";
import { appleShine } from "./apple.js";
import { spikeAngle } from "./spike.js";
import {
  createRiderTrails,
  hairRoot,
  hairRestDirection,
  freeHairRestDirection,
  hairBackSupport,
  accessoryRoot,
  accessoryRestDirection,
  freeAccessoryRoot,
  freeAccessoryRestDirection,
} from "./rider-hair.js";
import { lookParts } from "./cosmetics.js";
import { reducedMotion } from "./state.js";
import { createLighting } from "./lighting.js";
import { CRANE_LIGHTS, LAMP_HEAD } from "./city-props.js";
import { CAMERA_TALLY, HALFWAY_BEACON, HALFWAY_REACH } from "./event-props.js";
import { SEARCHLIGHT, SEARCHLIGHT_BEAM } from "./prison-props.js";
import { drawNisse, nisseWiggle } from "./nisse.js";
import { TORCH_FLAME } from "./dungeon-props.js";
import { FARMHOUSE, FLAGPOLE, drawFlagpole, MILL, STALL, STALL_COIN_DROP, TURBINE, farmhouseWindowCentre } from "./countryside-props.js";
import { WATER_PROPS, FISH_DART, FISH_RANGE } from "./water-props.js";
import { FIRE, IVY, SQUIRREL_HIDE_MAX, SQUIRREL_RANGE, TENT_DOOR_CENTRE } from "./forest-props.js";
import {
  HAZE_HALF,
  TUMBLEWEED_RUN,
  VULTURE_HEIGHT,
  VULTURE_ORBIT,
  VULTURE_SIGHT,
  desertNoise,
  swoopDuration,
  vultureNotice,
  vultureOrbit,
  vulturePerch,
  vultureSwoop,
} from "./desert-props.js";
import { rainSlant, resolveWeather, snowDrift, windSign } from "./weather.js";
import { CABLE_HALF, CABLE_TOP, HUT_CHIMNEY, HUT_WINDOW_CENTRE } from "./mountain-props.js";
import { nearestInteraction } from "./interactions.js";
import {
  CORGI_HEART,
  CORGI_RANGE,
  corgiGround,
  corgiPhase,
  corgiSit,
  corgiStart,
  corgiStep,
} from "./corgi-props.js";
import { RABBIT_FLEE, RABBIT_RANGE } from "./rabbit-props.js";
import { crackLines, glassPane } from "./glass.js";

const GLASS_CRACK_COLOR = "#f6fffde6";

/**
 * How far left the camera may look. Blocks can reach into negative x, and the
 * finish may be out there, so the camera follows the bike as far as the
 * terrain goes.
 */
const SCENERY_SHADOWS = {
  tree: { width: 16, alpha: 0.15, thickness: 3, lift: 36 },
  pine: { width: 14, alpha: 0.15, thickness: 3, lift: 38 },
  crystal: { width: 10, alpha: 0.14, thickness: 3, lift: 28 },
  boulder: { width: 24, alpha: 0.15, thickness: 3, lift: 24 },
  cactus: { width: 12, alpha: 0.15, thickness: 3, lift: 22 },
  "cactus-small": { width: 7, alpha: 0.15, thickness: 3, lift: 12 },
  sapling: { width: 10, alpha: 0.15, thickness: 3, lift: 20 },
  "pine-small": { width: 9, alpha: 0.15, thickness: 3, lift: 22 },
  crates: { width: 26, alpha: 0.15, thickness: 3, lift: 24 },
  wheelbarrow: { width: 18, alpha: 0.13, thickness: 3, lift: 10 },
  scarecrow: { width: 8, alpha: 0.15, thickness: 3, lift: 30 },
  beehive: { width: 14, alpha: 0.14, thickness: 3, lift: 20 },
  cone: { width: 7, alpha: 0.14, thickness: 3, lift: 8 },
  dumpster: { width: 28, alpha: 0.15, thickness: 3, lift: 16 },
  lamp: { width: 6, alpha: 0.15, thickness: 3, lift: 40 },
  skull: { width: 12, alpha: 0.13, thickness: 3, lift: 6 },
  "car-wreck": { width: 54, alpha: 0.15, thickness: 3, lift: 16 },
  "water-tower": { width: 36, alpha: 0.15, thickness: 3, lift: 70 },
  windmill: { width: 24, alpha: 0.14, thickness: 3, lift: 60 },
  cairn: { width: 14, alpha: 0.13, thickness: 3, lift: 14 },
  "ski-lift": { width: 14, alpha: 0.14, thickness: 3, lift: 60 },
  "snow-pine": { width: 16, alpha: 0.15, thickness: 3, lift: 38 },
  hut: { width: 48, alpha: 0.15, thickness: 3, lift: 30 },
  snowman: { width: 16, alpha: 0.13, thickness: 3, lift: 20 },
  "tyre-wall": { width: 30, alpha: 0.15, thickness: 3, lift: 14 },
  "hay-bales": { width: 26, alpha: 0.14, thickness: 3, lift: 16 },
  "petrol-can": { width: 8, alpha: 0.14, thickness: 3, lift: 10 },
  spectators: { width: 30, alpha: 0.12, thickness: 3, lift: 20 },
  "camera-tower": { width: 24, alpha: 0.14, thickness: 3, lift: 50 },
  "prison-fence": { width: 40, alpha: 0.1, thickness: 3, lift: 20 },
  watchtower: { width: 28, alpha: 0.15, thickness: 3, lift: 60 },
  "jail-cell": { width: 36, alpha: 0.15, thickness: 3, lift: 26 },
  "ball-and-chain": { width: 7, alpha: 0.14, thickness: 3, lift: 4 },
  torch: { width: 8, alpha: 0.12, thickness: 3, lift: 26 },
  skeleton: { width: 18, alpha: 0.12, thickness: 3, lift: 10 },
  tent: { width: 36, alpha: 0.14, thickness: 3, lift: 22 },
  flagpole: { width: 6, alpha: 0.12, thickness: 3, lift: 50 },
  "christiania-bike": { width: 28, alpha: 0.14, thickness: 3, lift: 10 },
  bench: { width: 30, alpha: 0.14, thickness: 3, lift: 12 },
  mill: { width: 36, alpha: 0.15, thickness: 3, lift: 40 },
  farmhouse: { width: 100, alpha: 0.15, thickness: 3, lift: 40 },
  mailbox: { width: 8, alpha: 0.13, thickness: 3, lift: 20 },
  stall: { width: 34, alpha: 0.14, thickness: 3, lift: 20 },
};
/** Seconds the scene takes to slow to a stop behind the results. */
const WIN_SETTLE = 0.7;
// Ground shadows: one colour, each sample with its own alpha.
const SHADOW_COLOR = "rgb(31,53,39)";
// Rain and snow: how many particles the view's size scales up to, and the
// lower ceiling on touch screens and in performance mode, where fill rate is
// the tighter budget.
const PARTICLE_SCALE_MAX = 2.2,
  PARTICLE_SCALE_LIGHT = 1.1;
const GHOST_ALPHA = 0.38;
// Setting off from a standstill, the rider's toe presses the gear lever into
// first this fast.
const GEAR_TAP_SECONDS = 0.15;
// Pedalling the Pocket Classic: the driven wheel turns this many times for
// each turn of the cranks, which the rider keeps between a push on a stalled
// climb and a spin they could hold, in turns per second.
const CRANK_GEARING = 1.6,
  CRANK_TURNS_MIN = 0.6,
  CRANK_TURNS_MAX = 2.2;
// Coasting, the rider brings the cranks level to stand on, at this rate.
const CRANK_LEVEL_RATE = 8;
// World units around the hair root that the ghost's hair and cape can reach.
const GHOST_HAIR_REACH = 56;
// Where a front prop hides the rider, the hidden part shows as a silhouette.
const XRAY_COLOR = "#fff3be";
const XRAY_ALPHA = 0.25;
// World units around the bike and rider that the x-ray layer covers.
const XRAY_REACH = 70;
// How far each prop's art reaches above its anchor, for culling.
const PROP_RISE = {
  tree: 186,
  pine: 188,
  sapling: 80,
  "pine-small": 92,
  "cactus-small": 60,
  ladder: 102,
  scarecrow: 114,
  lamp: -LAMP_HEAD.y + 16,
  crane: -CRANE_LIGHTS[0][1] + 6,
  scaffolding: 146,
  skull: 28,
  "car-wreck": 48,
  "water-tower": 180,
  windmill: 196,
  "heat-haze": 56,
  cairn: 46,
  "ski-lift": -CABLE_TOP + 4,
  "snow-pine": 192,
  hut: -HUT_CHIMNEY.y + 86,
  snowman: 80,
  "camera-tower": 154,
  "halfway-flag": 126,
  watchtower: -SEARCHLIGHT.y + 14,
  torch: -TORCH_FLAME.y + 36,
  flagpole: -FLAGPOLE.top + 8,
  fireplace: -FIRE.smoke + 90,
  ivy: IVY.max + 10,
  smoke: 96,
  mill: -(MILL.hub.y - MILL.sail) + 4,
  farmhouse: -FARMHOUSE.chimney.y + 86,
  stall: -STALL.sign.top + 4,
  "wind-turbine": -(TURBINE.hub.y - TURBINE.blade) + 4,
};
// How far each prop's art hangs below its anchor, for culling.
const PROP_HANG = {
  vines: 148,
  ivy: 4,
  roots: 28,
  moss: 32,
  graffiti: 38,
  "tutorial-lean": 34,
  "tutorial-flip": 34,
  "tutorial-rotate": 34,
  "tutorial-restart": 34,
  "tutorial-ledge": 34,
  "tutorial-gas": 34,
  "tutorial-brake": 34,
  "tutorial-light": 34,
  "tutorial-lean-forward": 34,
  "tally-marks": 18,
};
// How far each prop's art reaches either side of its anchor, for culling.
const PROP_REACH = {
  crane: 180,
  minecart: 150,
  bats: 220,
  fish: FISH_RANGE + 120,
  frog: 70,
  dragonfly: 80,
  squirrel: SQUIRREL_RANGE + 40,
  corgi: CORGI_RANGE + 40,
  rabbit: RABBIT_RANGE + 40,
  tumbleweed: TUMBLEWEED_RUN + 30,
  vulture: VULTURE_ORBIT.x + 40,
  "heat-haze": HAZE_HALF + 10,
  "ski-lift": CABLE_HALF + 30,
  hut: 104,
  banner: 96,
  "course-tape": 76,
  fireplace: 84,
  smoke: 84,
  // Its leaves drift a long way downwind as they fall.
  tree: 300,
  mill: MILL.sail + 8,
  // Its chimney smoke blows well out past the gable downwind.
  farmhouse: 150,
  "wind-turbine": TURBINE.blade + 8,
};
// Perched birds and ducks take off, roosting bats scatter, fish dart off,
// rabbits bound away and squirrels run for a tree when the rider comes within
// `x` and `y` of them; they are gone `flight` seconds later (a squirrel as
// soon as it has hidden).
const STARTLE = {
  bird: { x: 110, y: 140, flight: 2.5 },
  bats: { x: 160, y: 200, flight: 2.2 },
  duck: { x: 130, y: 140, flight: 2.5 },
  // A frog's pad stays after it leaps, so its flight never ends.
  frog: { x: 110, y: 120, flight: Infinity },
  fish: { x: 90, y: 70, flight: FISH_DART },
  squirrel: { x: 140, y: 120, flight: SQUIRREL_HIDE_MAX },
  rabbit: { x: 130, y: 110, flight: RABBIT_FLEE },
};
// Heat haze shimmers the scene behind it, so it stays out of the x-ray mask,
// and it is left out with reduced motion and in the lighter graphics mode.
const HAZE_PROPS = new Set(["heat-haze"]);
// Props that change once the rider rides past them (see watchHalfway).
const PASS_PROPS = new Set(["halfway-flag", "mailbox"]);
// Props that glow, and how far their light reaches either side, for culling.
const GLOW_REACH = { lamp: 70, crane: 180, lantern: 100, torch: 100, fireplace: 100, tent: 60, mushrooms: 40, hut: 60, farmhouse: 100, "wind-turbine": 20, "camera-tower": 30, "halfway-flag": 30, watchtower: SEARCHLIGHT_BEAM.length + 20 };
// How far a hair strand may sink into a floor and still be lifted back onto it.
const HAIR_GROUND_ALLOWANCE = 8;
// Markers for missing apples out of view keep this far (world units) inside
// the view's edges, leaving room for their arrow and clear of the HUD at the
// top and the trail name at the bottom.
const APPLE_HINT_MARGIN = { side: 46, top: 76, bottom: 60 };
// An apple at least this far inside the view counts as in view.
const APPLE_HINT_VISIBLE = 12;
const APPLE_HINT_COLOR = "#fff3be";
const APPLE_HINT_OUTLINE = "#182321";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ still?: boolean }} [options]  `still` for scenes drawn once, such
 *   as the menu's: see createTerrainRenderer.
 */
export function createRenderer(canvas, { still = false } = {}) {
  const ctx = canvas.getContext("2d");
  const { pixelRect, pixelPath, drawPixelText } = createDrawingTools(ctx);
  const gameArt = createGameArt(ctx);
  const terrainRenderer = createTerrainRenderer({ still });
  const backWallRenderer = createTerrainRenderer({ backWalls: true, still });
  const lighting = createLighting();
  // Whether the bike's lamps are on: lit lenses in the art, and their light.
  let headlights = true;
  const popups = [];
  let W = 380,
    H = 410,
    pixelScale = 1;
  /** Each rider's foot, by ride; see stepFoot. */
  const feet = new WeakMap();
  /** The player's tyre dirt from the effects; the ghost's wheels stay clean. */
  let wheelDirt = null,
    wheelSquish = null;
  let hair = null,
    ghostHair = null,
    flipVisual = 1,
    trail = null,
    cameraX = 0,
    cameraY = 0,
    // The rider's place in the last frame, for the menu's resume snapshot.
    riderOnScreen = { x: 0.5, y: 0.5 };
  let xrayMask = null,
    xrayRider = null,
    glowLayer = null,
    glowMask = null,
    ghostHairLayer = null;
  // What props react to this frame; see drawProp.
  let propScene = { time: 0, riderX: null, riderY: null, weather: resolveWeather(), landing: null };
  // The sun's place and strength for this frame (see sunLight), worked out
  // once in draw() for every shadow and the lighting.
  let frameSun = sunLight({ width: W });
  // The fog's colour this frame, and its gradient, kept while the fog and
  // colour are unchanged (see drawFog).
  let frameFogColor = "";
  let fogGradient = null,
    fogGradientKey = "";
  // The interaction nearest the rider, worked out once per frame (see nearestSpot).
  let spotScene = null,
    spot = null;
  // The device pixel ratio the canvas was last sized for, and the media query
  // that fires when it changes (see resize).
  let lastPixelRatio = 0,
    pixelRatioQuery = null,
    pixelRatioChanged = null;
  // Touch screens get fewer rain drops and snowflakes (see drawRain).
  const coarsePointer =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  // The last hard landing, { x, y, time, strength }, which shakes the snow off
  // nearby snowy pines.
  let landing = null;
  // Milliseconds of play the scene has animated for: props move on this clock,
  // not the wall clock, so it stops while the game is paused and nothing
  // carries on behind the pause screen (or jumps ahead after the menu).
  let sceneClock = 0;
  // Seconds the results have been up. Behind them the scene slows to a stop,
  // as it is still behind the pause screen, rather than freezing mid-burst.
  let wonFor = 0;
  let frameNow = 0;
  // The checkpoint flags the rider has reached on this ride, with the scene
  // clock when each started up its pole.
  const raisedFlags = new Map();
  // Milliseconds a flag takes to run up its pole.
  const FLAG_HOIST_MS = 800;
  // Birds and bats that have taken off, with when and which way, for the
  // current ride.
  const flights = new Map();
  let flightRide = null;
  // Vultures swooping down to the crashed rider, by prop: where from and to,
  // and when they set off. `crashedAt` is when the ragdoll first appeared.
  const swoops = new Map();
  let crashedAt = null;
  // When the rider last came off, for the spectators to duck (scene clock, ms).
  let crashStart = null;
  // Halfway flags and mailboxes the rider has passed this ride: the split,
  // and when.
  const passes = new Map();
  let passRide = null;
  let passFromX = null;
  // Each corgi's state (see corgiStep) for the current ride, and how many
  // woofs have gone off in view since game.js last asked, for the sound.
  const corgis = new Map();
  let corgiRide = null;
  // When (scene time) a coin last went into each stall's honesty box.
  const payments = new Map();
  let woofs = 0;
  // The interact key's label, shown over whatever it would act on.
  let interactLabel = "";
  // Until when (scene clock, ms) the missing apples are pointed out.
  let appleHintUntil = 0;

  // The canvas is laid out in CSS pixels, so a change of device pixel ratio
  // (a window dragged to another screen, the browser zoomed) changes nothing
  // the ResizeObserver sees. A media query for the current ratio fires once
  // when it changes; it is made again for the new ratio on each resize.
  function watchPixelRatio() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    pixelRatioQuery?.removeEventListener("change", onPixelRatioChange);
    pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    pixelRatioQuery.addEventListener("change", onPixelRatioChange);
  }

  function onPixelRatioChange() {
    resize();
    pixelRatioChanged?.();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    watchPixelRatio();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratioChanged = dpr !== lastPixelRatio;
    lastPixelRatio = dpr;
    const worldScale = clamp(rect.width / 760, 1, 1.45);
    const targetWidth = Math.max(320, rect.width / worldScale);
    const targetHeight = Math.max(340, rect.height / worldScale);
    const deviceWidth = Math.round(rect.width * dpr),
      deviceHeight = Math.round(rect.height * dpr);
    pixelScale = Math.max(
      1,
      Math.min(
        Math.floor(deviceWidth / (targetWidth / ART_PIXEL)),
        Math.floor(deviceHeight / (targetHeight / ART_PIXEL)),
      ),
    );
    // Setting a size, even the same one, reallocates and clears the canvas.
    if (canvas.width !== deviceWidth || ratioChanged) canvas.width = deviceWidth;
    if (canvas.height !== deviceHeight || ratioChanged) canvas.height = deviceHeight;
    W = Math.ceil(deviceWidth / pixelScale) * ART_PIXEL;
    H = Math.ceil(deviceHeight / pixelScale) * ART_PIXEL;
    // The scratch layers only grow as they are used (see fitLayer); one left
    // over from a much larger view is given back.
    for (const layer of [xrayMask, xrayRider, glowLayer, glowMask, ghostHairLayer]) {
      if (!layer) continue;
      if (layer.canvas.width > deviceWidth * 2) layer.canvas.width = deviceWidth;
      if (layer.canvas.height > deviceHeight * 2) layer.canvas.height = deviceHeight;
    }
  }

  /**
   * A fixed view of `width` × `height` world units with `scale` device pixels
   * per art pixel, for canvases that are not laid out on the page.
   */
  function setViewport(width, height, scale) {
    pixelScale = Math.max(1, Math.round(scale));
    W = Math.ceil(width / ART_PIXEL) * ART_PIXEL;
    H = Math.ceil(height / ART_PIXEL) * ART_PIXEL;
    canvas.width = (W / ART_PIXEL) * pixelScale;
    canvas.height = (H / ART_PIXEL) * pixelScale;
  }

  function reset(nextTrail, facing) {
    trail = nextTrail;
    hair = null;
    ghostHair = null;
    flipVisual = facing;
    popups.length = 0;
    landing = null;
    raisedFlags.clear();
    appleHintUntil = 0;
    spotScene = null;
    bucketProps();
    lighting.prepare(trail);
  }

  /**
   * The rider set down again mid-ride, at a checkpoint: their hair starts
   * afresh rather than streaming after them from where they were.
   */
  function respawn(facing) {
    hair = null;
    flipVisual = facing;
    landing = null;
  }

  // The trail's props sorted once into the lists each pass walks, so a frame
  // doesn't sift every prop half a dozen times. Made again if the trail's
  // props are swapped out from under the renderer.
  let buckets = null;
  function bucketProps() {
    const props = trail?.props || [];
    if (buckets?.props === props) return buckets;
    const layer = () => ({ all: [], wet: [], dry: [] });
    buckets = {
      props,
      // Drawn props by layer, and by whether they are water props; squirrels
      // come last, so one climbs up the front of its tree's trunk.
      layers: { back: layer(), front: layer() },
      shadowed: [],
      startled: [],
      corgis: [],
      vultures: [],
      passable: [],
      painted: [],
      glowing: [],
      interactive: [],
    };
    for (const squirrels of [false, true])
      for (const prop of props) {
        if ((prop.type === "squirrel") !== squirrels) continue;
        const drawn = buckets.layers[prop.layer];
        if (drawn && !PAINTED_PROPS.has(prop.type)) {
          drawn.all.push(prop);
          (WATER_PROPS.has(prop.type) ? drawn.wet : drawn.dry).push(prop);
        }
      }
    for (const prop of props) {
      if (SCENERY_SHADOWS[prop.type]) buckets.shadowed.push(prop);
      if (STARTLE[prop.type]) buckets.startled.push(prop);
      if (prop.type === "corgi") buckets.corgis.push(prop);
      if (prop.type === "vulture") buckets.vultures.push(prop);
      if (PASS_PROPS.has(prop.type)) buckets.passable.push(prop);
      if (PAINTED_PROPS.has(prop.type)) buckets.painted.push(prop);
      if (GLOW_REACH[prop.type]) buckets.glowing.push(prop);
      if (INTERACTIONS[prop.type]) buckets.interactive.push(prop);
    }
    return buckets;
  }

  /** A hard landing at x, y, `strength` 0…1, for the props to react to. */
  function land(x, y, strength = 1) {
    landing = { x, y, time: frameNow / 1000, strength: clamp(strength, 0, 1) };
  }

  /** Points out the apples still missing for `seconds`, e.g. at a locked finish. */
  function pointToApples(seconds) {
    appleHintUntil = sceneClock + seconds * 1000;
  }

  /** Floating pixel text in world space, e.g. "+1 FLIP". */
  function popup(text, x, y, color = "#fff3be") {
    popups.push({ text, x, y, color, life: 1.2, max: 1.2 });
  }

  // `rise` is how far the art reaches above its anchor `y`.
  const inView = (x, margin, y = null, rise = margin) =>
    x >= cameraX - margin &&
    x <= cameraX + W + margin &&
    (y === null || (y + margin >= cameraY && y - rise <= cameraY + H));

  // One colour for every sample, each with its own alpha: a number is far
  // cheaper to set than a colour string is to build and parse. The rects are
  // snapped to the art grid as pixelRect would.
  function drawShadowBlob(samples, centerX, width, alpha, thickness) {
    ctx.fillStyle = SHADOW_COLOR;
    for (const sample of samples) {
      const along = (sample.x - centerX) / width;
      if (Math.abs(along) > 1) continue;
      const envelope = Math.sqrt(Math.max(0, 1 - along * along));
      const height = Math.max(2, thickness * envelope);
      ctx.globalAlpha = alpha * (0.45 + 0.55 * envelope);
      ctx.fillRect(
        Math.round((sample.x - 1) / 2) * 2,
        Math.round((sample.y - height + 1) / 2) * 2,
        2,
        Math.max(2, Math.round(height / 2) * 2),
      );
    }
    ctx.globalAlpha = 1;
  }


  function drawSceneryShadow(
    x,
    y,
    light,
    { width, alpha, thickness, lift = 0 },
  ) {
    const ground = terrainAt(trail, x, y);
    if (!ground.solid) return;
    const height = Math.max(0, ground.y - y) + lift;
    const offset = sunShadowOffset({
      bikeX: x - cameraX,
      bikeY: y - cameraY,
      sunX: light.x,
      sunY: light.y,
      height,
      strength: light.strength,
    });
    const center = x + offset;
    drawShadowBlob(
      groundShadowSamples(trail, x, y, width, 2, center).flat(),
      center,
      width,
      alpha,
      thickness,
    );
  }

  function drawSceneryShadows(ride, now, full) {
    if (!full) return;
    const light = frameSun;
    for (const prop of bucketProps().shadowed) {
      const spec = SCENERY_SHADOWS[prop.type];
      if (!inView(prop.x, 80)) continue;
      const ground = terrainAt(trail, prop.x);
      if (!ground.solid && !Number.isFinite(prop.y)) continue;
      drawSceneryShadow(
        prop.x,
        Number.isFinite(prop.y) ? prop.y : ground.y,
        light,
        spec,
      );
    }
    for (const apple of ride.apples) {
      if (apple.taken || !inView(apple.x, 40)) continue;
      drawSceneryShadow(apple.x, apple.y, light, {
        width: 8,
        alpha: 0.18,
        thickness: 3,
      });
    }
  }

  // Perched birds, ducks, roosting bats, fish, rabbits and squirrels take off,
  // away from the rider (a squirrel to its tree), once the rider comes close.
  // Purely visual: nothing here feeds back into the simulation.
  function startleProps(ride, focus, now) {
    if (flightRide !== ride) {
      flights.clear();
      flightRide = ride;
    }
    for (const prop of bucketProps().startled) {
      const reach = STARTLE[prop.type];
      if (flights.has(prop)) continue;
      let x = prop.x,
        y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y,
        from;
      if (prop.type === "bats") y += propWallFit(trail, prop)?.ceiling ?? 0;
      if (WATER_PROPS.has(prop.type)) {
        // A fish darts off from wherever it has swum to.
        ({ x, y, swim: from } = waterPropAt(trail, prop, propScene.time));
      }
      // A rabbit bounds off from wherever it has hopped to.
      if (prop.type === "rabbit") ({ x, y, from } = rabbitPropAt(trail, prop, propScene.time));
      if (Math.abs(focus.x - x) < reach.x && Math.abs(focus.y - y) < reach.y)
        flights.set(prop, { start: now, dir: x >= focus.x ? 1 : -1, from });
    }
  }

  // Coda trots about and runs over to greet the rider. Purely visual, like the
  // startled animals; with reduced motion (time 0) he sits still.
  function walkCorgis(ride, focus, dt) {
    if (corgiRide !== ride) {
      corgis.clear();
      corgiRide = ride;
    }
    for (const prop of bucketProps().corgis) {
      const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
      const state = corgiStep(corgis.get(prop) ?? corgiStart(prop.flip ? -1 : 1), {
        time: propScene.time,
        dt,
        riderDx: focus.x - prop.x,
        riderDy: focus.y - y,
        fit: propWallFit(trail, prop),
        phase: corgiPhase(prop.x),
      });
      corgis.set(prop, state);
      if (state.woofed && inView(prop.x + state.dx, 40, y, 50)) woofs++;
    }
  }

  // What the rider can interact with, by prop type (see interactions.js).
  const INTERACTIONS = {
    corgi: {
      // Coda, wherever he has trotted to. Told to sit again once his heart
      // has floated away, he is praised again.
      find(prop) {
        const state = corgis.get(prop);
        if (!state) return null;
        const anchor = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
        const ready = state.mode !== "sit" || propScene.time - state.sitAt > CORGI_HEART;
        return { x: prop.x + state.dx, y: anchor + corgiGround(propWallFit(trail, prop), state.dx), hint: 62, ready };
      },
      act(prop) {
        corgis.set(prop, corgiSit(corgis.get(prop), propScene.time));
        return { sound: "pant", announce: "Coda sits. Good dog." };
      },
    },
    stall: {
      // The honesty box, ready again once the last coin has dropped in.
      find(prop) {
        const anchor = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
        const paid = payments.get(prop);
        const ready = paid === undefined || !propScene.time || propScene.time - paid > STALL_COIN_DROP + 0.4;
        return { x: prop.x + (prop.flip ? -1 : 1) * STALL.slot.x, y: anchor, hint: -STALL.slot.y + 12, ready };
      },
      act(prop) {
        payments.set(prop, propScene.time);
        return { sound: "coin", announce: "A coin in the honesty box. Tak!" };
      },
    },
  };

  /**
   * The interaction nearest the rider and in reach, with its prop, or null.
   * Worked out once per frame (`propScene` is new each frame), and again
   * after an interaction, which changes what is ready.
   */
  function nearestSpot() {
    if (spotScene === propScene) return spot;
    const spots = [];
    for (const prop of bucketProps().interactive) {
      const found = INTERACTIONS[prop.type].find(prop);
      if (found) spots.push({ ...found, prop });
    }
    spot = nearestInteraction(spots, propScene.riderX, propScene.riderY);
    spotScene = propScene;
    return spot;
  }

  /**
   * Uses the interaction nearest the rider, if one is in reach.
   * @returns {import("./interactions.js").InteractionResult | null}
   */
  function interact() {
    const found = nearestSpot();
    if (!found) return null;
    spotScene = null;
    return { type: found.prop.type, ...INTERACTIONS[found.prop.type].act(found.prop) };
  }

  // The interact key in a small key cap over whatever it would act on.
  function drawInteractHint() {
    if (!interactLabel) return;
    const spot = nearestSpot();
    if (!spot || !inView(spot.x, 40, spot.y, spot.hint + 20)) return;
    const width = interactLabel.length * 8 - 2;
    const x = Math.round(spot.x / 2) * 2;
    const top = Math.round((spot.y - spot.hint) / 2) * 2;
    ctx.fillStyle = "#182321d9";
    ctx.fillRect(x - width / 2 - 4, top - 4, width + 8, 18);
    ctx.fillRect(x - 2, top + 14, 4, 2);
    drawPixelText(interactLabel, x, top, "#fff3be", { pixel: 2, align: "center" });
  }

  /** How many times Coda has woofed in view since the last call. */
  function takeWoofs() {
    const count = woofs;
    woofs = 0;
    return count;
  }

  // After a crash, each circling vulture that can see the rider glides down
  // and lands beside them a moment later. Reduced motion leaves them circling.
  function watchCrash(ride, focus, now) {
    if (!ride.ragdoll || reducedMotion) {
      swoops.clear();
      crashedAt = null;
      return;
    }
    crashedAt ??= now;
    const groundAt = (x, above) => {
      const ground = terrainAt(trail, x, above);
      return ground.solid ? ground.y : null;
    };
    const time = propScene.time;
    const taken = { [-1]: 0, 1: 0 };
    for (const swoop of swoops.values()) taken[swoop.side]++;
    for (const prop of bucketProps().vultures) {
      const swoop = swoops.get(prop);
      if (swoop) {
        // Until it is nearly down, it steers for the rider as they slide.
        if ((now - swoop.start) / 1000 < swoop.duration * 0.7) {
          const perch = vulturePerch(focus.x, focus.y, swoop.side, swoop.slot, groundAt);
          if (perch) swoop.to = perch;
        }
        continue;
      }
      const phase = desertNoise(prop.x, 7);
      if (now - crashedAt < vultureNotice(phase) * 1000) continue;
      const anchor = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
      if (!Number.isFinite(anchor)) continue;
      const orbit = vultureOrbit(time, phase);
      const from = {
        x: prop.x + orbit.dx,
        y: anchor + (Number.isFinite(prop.y) ? 0 : -VULTURE_HEIGHT) + orbit.dy,
      };
      if (Math.hypot(focus.x - from.x, focus.y - from.y) > VULTURE_SIGHT) continue;
      if (terrainRaycastAt(trail, from.x, from.y, focus.x, focus.y)) continue;
      const side = from.x < focus.x ? -1 : 1;
      const slot = taken[side]++;
      const to = vulturePerch(focus.x, focus.y, side, slot, groundAt);
      if (!to) continue;
      swoops.set(prop, { from, to, side, slot, start: now, duration: swoopDuration(from, to) });
    }
  }

  // A halfway flag lights up once the rider rides past it, keeping the ride
  // time it was passed at for its timing board, and a mailbox's flag flips
  // up. Purely visual.
  function watchHalfway(ride, focus, now) {
    if (passRide !== ride) {
      passes.clear();
      // Coins dropped into honesty boxes belong to the ride too.
      payments.clear();
      passRide = ride;
      passFromX = null;
    }
    const fromX = passFromX;
    passFromX = ride.ragdoll ? null : focus.x;
    if (!ride.started || ride.ragdoll || fromX === null || fromX === focus.x) return;
    for (const prop of bucketProps().passable) {
      if (passes.has(prop)) continue;
      if ((fromX - prop.x) * (focus.x - prop.x) > 0) continue;
      const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
      if (!Number.isFinite(y) || Math.abs(focus.y - y) > HALFWAY_REACH) continue;
      passes.set(prop, { split: ride.elapsed, start: now });
    }
  }

  // Graffiti, painted onto the rock just after the terrain is drawn.
  function drawWallPaint() {
    for (const prop of bucketProps().painted) {
      if (!inView(prop.x, 70)) continue;
      const y = paintedPropY(trail, prop);
      if (y === null) continue;
      const [, top, , bottom] = propRotation(prop) ? graffitiTurnedBounds(prop.type) : paintedBounds(prop.type);
      if (!inView(prop.x, 70, y + bottom + 2, bottom - top + 2)) continue;
      gameArt.drawWallPaint(trail, prop);
    }
  }

  // The glowing parts of props, drawn over the lit scene: the lighting pass
  // casts their light. Street lamps, crane lights and house windows only once it
  // is dark around them; lanterns and mushrooms always. Back-layer props sit
  // behind the rider, the terrain and front props, so their glows are drawn
  // into a layer with those cut out of it first (see drawGlowsBehind).
  function drawPropGlows(ride, look, state, full) {
    const behind = [];
    for (const prop of bucketProps().glowing) {
      const rotation = propRotation(prop);
      const reach = GLOW_REACH[prop.type] + (rotation ? PROP_RISE[prop.type] ?? 90 : 0);
      if (!inView(prop.x, reach)) continue;
      const ground = terrainAt(trail, prop.x);
      if (!ground.solid && !Number.isFinite(prop.y)) continue;
      const y = Number.isFinite(prop.y) ? prop.y : ground.y;
      const [hx, hy] =
        prop.type === "crane"
          ? CRANE_LIGHTS[0]
          : prop.type === "lamp"
            ? [0, LAMP_HEAD.y]
            : prop.type === "hut"
              ? HUT_WINDOW_CENTRE
              : prop.type === "camera-tower"
                ? [CAMERA_TALLY.x, CAMERA_TALLY.y]
                : prop.type === "halfway-flag"
                  ? [HALFWAY_BEACON.x, HALFWAY_BEACON.y]
                  : prop.type === "watchtower"
                    ? [SEARCHLIGHT.x, SEARCHLIGHT.y]
                    : prop.type === "torch"
                      ? [TORCH_FLAME.x, TORCH_FLAME.y]
                      : prop.type === "tent"
                        ? TENT_DOOR_CENTRE
                        : prop.type === "fireplace"
                          ? [0, FIRE.y - 10]
                          : prop.type === "farmhouse"
                            ? farmhouseWindowCentre(2)
                            : prop.type === "wind-turbine"
                              ? [TURBINE.light.x, TURBINE.light.y]
                              : [0, -10];
      const head = propPoint(prop, y, hx, hy);
      const dark = lighting.isDark(trail, head.x, head.y);
      if (!dark && (prop.type === "lamp" || prop.type === "crane" || prop.type === "hut" || prop.type === "farmhouse" || prop.type === "wind-turbine" || prop.type === "tent" || prop.type === "watchtower")) continue;
      const lit = passes.has(prop);
      if (prop.type === "halfway-flag" && !lit) continue;
      const fit = propWallFit(trail, prop);
      let [rise, hang] = propSpan(prop.type, fit) || [PROP_RISE[prop.type] ?? 90, 0];
      if (rotation) rise = hang = Math.max(rise, hang);
      if (!inView(prop.x, reach, y + hang + reach, rise + hang + reach * 2)) continue;
      const glow = [
        prop.type,
        prop.x,
        y,
        propGroundOffset(trail, prop),
        prop.flip,
        propScene.time,
        { dark, trail, prop, fit, emissive: true, rotation, lit, rider: { x: propScene.riderX, y: propScene.riderY }, weather: propScene.weather, landing: propScene.landing },
      ];
      if (prop.layer === "front") gameArt.drawPropGlow(...glow);
      else
        behind.push({
          glow,
          // The box the glow can reach, in world units: the one inView checked.
          left: prop.x - reach,
          right: prop.x + reach,
          top: y - rise - reach,
          bottom: y + hang + reach,
        });
    }
    if (behind.length) drawGlowsBehind(behind, ride, look, state, full);
  }

  // Draws back-layer glows into a scratch layer, cuts out everything in
  // front of them (the terrain, front props, the bike and rider), and lays
  // what is left over the scene. All of it is confined to the box the glows
  // can reach, as drawXray is, rather than the whole view.
  function drawGlowsBehind(glows, ride, look, state, full) {
    const area = {
      left: Math.min(...glows.map((item) => item.left)),
      right: Math.max(...glows.map((item) => item.right)),
      top: Math.min(...glows.map((item) => item.top)),
      bottom: Math.max(...glows.map((item) => item.bottom)),
    };
    const transform = ctx.getTransform();
    const x0 = Math.max(0, Math.floor(transform.a * area.left + transform.e));
    const y0 = Math.max(0, Math.floor(transform.d * area.top + transform.f));
    const x1 = Math.min(canvas.width, Math.ceil(transform.a * area.right + transform.e));
    const y1 = Math.min(canvas.height, Math.ceil(transform.d * area.bottom + transform.f));
    if (x1 <= x0 || y1 <= y0) return;
    const width = x1 - x0,
      height = y1 - y0;
    glowLayer ??= xrayCanvas(width, height);
    glowMask ??= xrayCanvas(width, height);
    for (const layer of [glowLayer, glowMask]) {
      fitLayer(layer, width, height);
      layer.context.setTransform(transform.a, 0, 0, transform.d, transform.e - x0, transform.f - y0);
      layer.context.imageSmoothingEnabled = false;
    }
    for (const item of glows) glowLayer.art.drawPropGlow(...item.glow);
    // The world the box covers, on the art grid, for the terrain's chunks.
    const viewX = Math.floor((x0 - transform.e) / transform.a / ART_PIXEL) * ART_PIXEL,
      viewY = Math.floor((y0 - transform.f) / transform.d / ART_PIXEL) * ART_PIXEL;
    terrainRenderer.draw(
      glowMask.context,
      ride.trail,
      viewX,
      viewY,
      Math.ceil(width / transform.a) + ART_PIXEL,
      Math.ceil(height / transform.d) + ART_PIXEL,
      propScene.time,
      propScene.weather,
    );
    drawProps("front", full, glowMask.art, area);
    if (hair) hair.draw(glowMask.tools.pixelPath, currentHairRoot(ride, false, flipVisual, look));
    glowMask.art.drawBike(bikeDrawing(ride, look, flipVisual, state));
    if (ride.ragdoll) glowMask.art.drawRagdoll(ride.ragdoll, look);
    const context = glowLayer.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "destination-out";
    context.drawImage(glowMask.canvas, 0, 0, width, height, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glowLayer.canvas, 0, 0, width, height, x0, y0, width, height);
    ctx.restore();
  }

  // `area` limits drawing to props that can reach a world-space box
  // { left, top, right, bottom }, and `wet` to water props (true) or the
  // others (false); returns how many props were drawn. Squirrels come last, so
  // one climbs up the front of its tree's trunk.
  function drawProps(layer, full, art = gameArt, area = null, wet = null) {
    let drawn = 0;
    const drawnLayer = bucketProps().layers[layer];
    const props = wet === null ? drawnLayer.all : wet ? drawnLayer.wet : drawnLayer.dry;
    for (const prop of props) {
      const rotation = propRotation(prop);
      // A rotated prop can reach as far as its longest side in any direction.
      const reach = Math.max(
        PROP_REACH[prop.type] ?? 70,
        rotation ? Math.max(PROP_RISE[prop.type] ?? 90, PROP_HANG[prop.type] ?? 0) : 0,
      );
      const swoop = swoops.get(prop);
      if (swoop) {
        const at = vultureSwoop(swoop.from, swoop.to, (frameNow - swoop.start) / 1000, swoop.duration, propScene.riderX);
        if (!inView(at.x, 40, at.y + 20, 50) || (area && (at.x < area.left - 40 || at.x > area.right + 40))) continue;
        art.drawProp(prop.type, at.x, at.y, 1, 0, () => 0, "", null, false, { ...propScene, swoop: at });
        drawn++;
        continue;
      }
      if (
        (!full && (prop.type === "tree" || prop.type === "pine" || prop.type === "snow-pine")) ||
        (HAZE_PROPS.has(prop.type) && (reducedMotion || !full || area)) ||
        !inView(prop.x, reach) ||
        (area && (prop.x < area.left - reach || prop.x > area.right + reach))
      )
        continue;
      const ground = terrainAt(trail, prop.x);
      if (!ground.solid && !Number.isFinite(prop.y)) continue;
      const y = Number.isFinite(prop.y) ? prop.y : ground.y;
      const fit = propWallFit(trail, prop);
      const span = propSpan(prop.type, fit);
      let rise = span ? span[0] : PROP_RISE[prop.type] ?? 90;
      let hang = span ? span[1] : PROP_HANG[prop.type] ?? 0;
      if (rotation) rise = hang = Math.max(rise, hang, reach);
      if (!inView(prop.x, reach, y + hang, rise + hang)) continue;
      if (area && (y - rise > area.bottom || y + hang + 70 < area.top)) continue;
      let scene = propScene;
      const corgi = corgis.get(prop);
      if (corgi) scene = { ...propScene, corgi };
      const paid = payments.get(prop);
      if (paid !== undefined) scene = { ...propScene, paid: { time: paid } };
      const pass = passes.get(prop);
      if (pass) scene = { ...propScene, passed: { split: pass.split, age: (frameNow - pass.start) / 1000 } };
      const flight = flights.get(prop);
      if (flight) {
        const age = (frameNow - flight.start) / 1000;
        // With reduced motion a startled animal is simply gone (a frog
        // leaves its empty pad behind).
        if (reducedMotion && prop.type === "frog") scene = { ...propScene, flight: { age: Infinity, dir: flight.dir } };
        else if (reducedMotion || age > STARTLE[prop.type].flight) continue;
        else scene = { ...propScene, flight: { age, dir: flight.dir, from: flight.from } };
      }
      art.drawProp(
        prop.type,
        prop.x,
        y,
        1,
        propAlignmentSlope(trail, prop),
        propGroundOffset(trail, prop),
        prop.text,
        fit,
        prop.flip,
        scene,
        rotation,
      );
      drawn++;
    }
    return drawn;
  }

  function xrayCanvas(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas,
      context,
      art: createGameArt(context),
      tools: createDrawingTools(context),
    };
  }

  function fitLayer(layer, width, height) {
    if (layer.canvas.width < width || layer.canvas.height < height) {
      layer.canvas.width = Math.max(layer.canvas.width, width);
      layer.canvas.height = Math.max(layer.canvas.height, height);
    }
    layer.context.setTransform(1, 0, 0, 1, 0, 0);
    layer.context.globalCompositeOperation = "source-over";
    layer.context.clearRect(0, 0, width, height);
  }

  // Redraws the bike and rider into a scratch layer, keeps only the pixels a
  // front prop covers, and lays them over the scene as a flat silhouette.
  function drawXray(ride, look, state, full) {
    const points = [ride.rear, ride.front];
    if (ride.ragdoll) points.push(...ride.ragdoll.list);
    if (ride.ragdoll?.helmet) points.push(ride.ragdoll.helmet);
    const area = {
      left: Math.min(...points.map((point) => point.x)) - XRAY_REACH,
      right: Math.max(...points.map((point) => point.x)) + XRAY_REACH,
      top: Math.min(...points.map((point) => point.y)) - XRAY_REACH,
      bottom: Math.max(...points.map((point) => point.y)) + XRAY_REACH,
    };
    const transform = ctx.getTransform();
    const x0 = Math.max(0, Math.floor(transform.a * area.left + transform.e));
    const y0 = Math.max(0, Math.floor(transform.d * area.top + transform.f));
    const x1 = Math.min(
      canvas.width,
      Math.ceil(transform.a * area.right + transform.e),
    );
    const y1 = Math.min(
      canvas.height,
      Math.ceil(transform.d * area.bottom + transform.f),
    );
    if (x1 <= x0 || y1 <= y0) return;
    const width = x1 - x0,
      height = y1 - y0;
    xrayMask ??= xrayCanvas(width, height);
    xrayRider ??= xrayCanvas(width, height);
    const place = (layer) => {
      fitLayer(layer, width, height);
      layer.context.setTransform(
        transform.a,
        0,
        0,
        transform.d,
        transform.e - x0,
        transform.f - y0,
      );
      layer.context.imageSmoothingEnabled = false;
    };

    place(xrayMask);
    if (!drawProps("front", full, xrayMask.art, area)) return;

    place(xrayRider);
    if (hair)
      hair.draw(xrayRider.tools.pixelPath, currentHairRoot(ride, false, flipVisual, look));
    xrayRider.art.drawBike(bikeDrawing(ride, look, flipVisual, state));
    if (ride.ragdoll) xrayRider.art.drawRagdoll(ride.ragdoll, look);

    const context = xrayRider.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(
      xrayMask.canvas,
      0,
      0,
      width,
      height,
      0,
      0,
      width,
      height,
    );
    context.globalCompositeOperation = "source-in";
    context.fillStyle = XRAY_COLOR;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = XRAY_ALPHA;
    ctx.drawImage(xrayRider.canvas, 0, 0, width, height, x0, y0, width, height);
    ctx.restore();
  }

  // Cracks belong to the ride, not the cached terrain, so they are drawn over it.
  function drawGlassCracks(rideTrail) {
    const cracks = rideTrail.glassCracks;
    if (!cracks?.length) return;
    for (const crack of cracks) {
      if (rideTrail.brokenBlocks.has(crack.blockId) || !inView(crack.x, 50, crack.y, 50)) continue;
      const pane = glassPane(rideTrail, crack.blockId);
      if (!pane) continue;
      for (const line of crackLines(crack, pane)) pixelPath(line, GLASS_CRACK_COLOR, 1, 2);
    }
  }

  function drawSkidMarks(skidMarks) {
    for (const mark of skidMarks) {
      const length = mark.length * mark.direction;
      ctx.globalAlpha = clamp(mark.life / mark.max, 0, 1) * 0.42;
      pixelPath(
        [
          [mark.x - length, mark.y - mark.slope * length],
          [mark.x, mark.y],
        ],
        "#263b36",
        1,
        2,
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(particles, splatter) {
    for (const p of particles) {
      if (Boolean(p.splatter) !== splatter) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      // A particle that grows (smoke) swells round its centre by whole art
      // pixels, up to `grow` more by the end of its life.
      const grown = p.grow ? Math.round(((1 - p.life / p.max) * p.grow) / 2) * 2 : 0;
      const size = (p.size || 4) + grown;
      pixelRect(p.x - grown / 2, p.y - grown / 2, size, size, p.color, 2);
    }
    ctx.globalAlpha = 1;
  }

  function riderPose(ride, flip = flipVisual) {
    return {
      rear: ride.rear,
      front: ride.front,
      facing: ride.facing,
      flipVisual: flip,
      leanVisual: ride.leanVisual,
    };
  }

  function currentHairRoot(ride, exact, flip = flipVisual, look = null) {
    if (ride.ragdoll) {
      const head = ride.ragdoll.points.head;
      return { x: head.x - ride.facing * 6, y: head.y, forward: { x: ride.facing, y: 0 } };
    }
    const shelled = look ? !lookParts(look).bareHead : false;
    return hairRoot(riderPose(ride, flip), exact, shelled);
  }

  function hairState(ride, flip, look) {
    const pose = riderPose(ride, flip);
    const shape = lookParts(look).accessory?.shape;
    return {
      // The outfit's accessory, which trails from the body rather than the head.
      accessory: shape
        ? ride.ragdoll
          ? {
              root: freeAccessoryRoot(ride.ragdoll.points.shoulder, ride.facing, shape),
              rest: freeAccessoryRestDirection(ride.facing, shape),
            }
          : { root: accessoryRoot(pose, shape, true), rest: accessoryRestDirection(pose, shape) }
        : null,
      root: currentHairRoot(ride, true, flip, look),
      rest: ride.ragdoll
        ? freeHairRestDirection(ride.facing)
        : hairRestDirection(pose),
      back: ride.ragdoll ? null : hairBackSupport(pose),
      // The floor under each strand, not the topmost surface: under an
      // overhang the topmost one is above the rider, and clamping to it drew
      // the hair as a pole up to the peak.
      groundAt: (x, y) => terrainAt(trail, x, y - HAIR_GROUND_ALLOWANCE),
    };
  }

  /**
   * Steps what trails behind the rider of `ride` (a ponytail, a braid, a cape); returns
   * it, or null for a look with neither.
   */
  function updateHair(current, ride, look, dt, flip = flipVisual) {
    const parts = lookParts(look);
    if (!parts.hair.tail && !parts.accessory) return null;
    const state = hairState(ride, flip, look);
    let next = current;
    if (
      !next ||
      next.lookKey !== parts.key ||
      Math.hypot(state.root.x - next.root.x, state.root.y - next.root.y) > 60
    )
      next = Object.assign(createRiderTrails(state, parts), { lookKey: parts.key });
    next.update(dt, state);
    return next;
  }

  /** Lets the rider's hair come to rest around a ride held still, for posed scenes. */
  function settleHair(ride, look, seconds = 1.5) {
    flipVisual = ride.facing;
    hair = updateHair(null, ride, look, 0);
    hair?.settle(seconds, hairState(ride, flipVisual, look));
  }

  /**
   * Steps the foot of the rider on `ride`: a tap on the gear lever as the bike
   * sets off from standing at the start, and the cranks a pedalled bike turns
   * (`crank`, in radians, 0 level with the near pedal forward). `kick` is how
   * far through kick-starting the engine the rider is, 0 to 1, or null.
   * Drawing only: nothing here feeds the simulation.
   */
  function stepFoot(ride, dt, kick = null) {
    const standing =
      !ride.started && !ride.ragdoll && ride.rear.grounded && ride.front.grounded;
    let foot = feet.get(ride);
    if (!foot) {
      foot = { standing, kick: null, tap: null, crank: 0 };
      feet.set(ride, foot);
    }
    // On the gas the cranks follow the driven wheel, which is the front one
    // facing left; off it the freewheel lets the wheel run on under still feet.
    const driven = ride.facing > 0 ? ride.rear : ride.front;
    if (ride.throttle > 0.05 && !ride.ragdoll) {
      const turns = clamp((ride.facing * driven.angularVelocity) / TAU / CRANK_GEARING, CRANK_TURNS_MIN, CRANK_TURNS_MAX);
      foot.crank = (foot.crank + turns * TAU * dt) % TAU;
    } else {
      const level = Math.round(foot.crank / Math.PI) * Math.PI;
      foot.crank += (level - foot.crank) * (1 - Math.exp(-CRANK_LEVEL_RATE * dt));
    }
    if (foot.standing && ride.started && !ride.ragdoll) foot.tap = 0;
    else if (foot.tap !== null) {
      foot.tap += dt / GEAR_TAP_SECONDS;
      if (foot.tap >= 1) foot.tap = null;
    }
    foot.standing = standing;
    foot.kick = standing ? kick : null;
  }

  function bikeGeometry(ride) {
    const { rear, front } = ride;
    return {
      mx: (rear.x + front.x) / 2,
      my: (rear.y + front.y) / 2,
      angle: Math.atan2(front.y - rear.y, front.x - rear.x),
      length: Math.hypot(front.x - rear.x, front.y - rear.y),
    };
  }

  function drawBike(ride, look, flip, state) {
    const geometry = bikeGeometry(ride);
    const { mx, my } = geometry;
    const ground = terrainAt(ride.trail, mx, my);
    if (ground.solid) {
      const light = frameSun;
      const heightAboveGround = Math.max(0, ground.y - my - RADIUS);
      const shadowAlpha = clamp(0.22 - heightAboveGround / 700, 0.035, 0.22);
      const shadowWidth = clamp(35 - heightAboveGround * 0.07, 13, 35);
      const offset = sunShadowOffset({
        bikeX: mx - cameraX,
        bikeY: my - cameraY,
        sunX: light.x,
        sunY: light.y,
        height: heightAboveGround,
        strength: light.strength,
      });
      const center = mx + offset;
      const samples = groundShadowSamples(
        ride.trail,
        mx,
        my,
        shadowWidth,
        2,
        center,
      ).flat();
      drawShadowBlob(samples, center, shadowWidth, shadowAlpha, 4);
      drawShadowBlob(
        samples,
        center + Math.sign(offset) * 3,
        shadowWidth * 0.7,
        shadowAlpha * 0.55,
        2,
      );
    }
    gameArt.drawBike(bikeDrawing(ride, look, flip, state, geometry));
  }

  function bikeDrawing(
    ride,
    look,
    flip,
    state,
    geometry = bikeGeometry(ride),
  ) {
    return {
      rear: ride.rear,
      front: ride.front,
      ...geometry,
      flipVisual: flip,
      facing: ride.facing,
      brakePressure: ride.brakePressure,
      lights: headlights,
      state,
      leanVisual: ride.leanVisual,
      look,
      dirt: wheelDirt,
      squish: wheelSquish,
      foot: feet.get(ride) ?? null,
    };
  }

  // The hair is many overlapping strokes, so drawing them straight at ghost
  // alpha stacks them up nearly opaque. Draw it solid off screen, then blend
  // the result once.
  function drawGhostHair(root) {
    const transform = ctx.getTransform();
    const x0 = Math.max(0, Math.floor(transform.a * (root.x - GHOST_HAIR_REACH) + transform.e));
    const y0 = Math.max(0, Math.floor(transform.d * (root.y - GHOST_HAIR_REACH) + transform.f));
    const x1 = Math.min(canvas.width, Math.ceil(transform.a * (root.x + GHOST_HAIR_REACH) + transform.e));
    const y1 = Math.min(canvas.height, Math.ceil(transform.d * (root.y + GHOST_HAIR_REACH) + transform.f));
    if (x1 <= x0 || y1 <= y0) return;
    const width = x1 - x0,
      height = y1 - y0;
    ghostHairLayer ??= xrayCanvas(width, height);
    fitLayer(ghostHairLayer, width, height);
    ghostHairLayer.context.setTransform(transform.a, 0, 0, transform.d, transform.e - x0, transform.f - y0);
    ghostHairLayer.context.imageSmoothingEnabled = false;
    ghostHair.draw(ghostHairLayer.tools.pixelPath, root);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = GHOST_ALPHA;
    ctx.drawImage(ghostHairLayer.canvas, 0, 0, width, height, x0, y0, width, height);
    ctx.restore();
  }

  function drawGhost(ghost, look, dt) {
    if (!ghost) {
      ghostHair = null;
      return;
    }
    // Simulated off screen too, so the hair has settled when the ghost
    // reappears; frozen with the ghost once it has finished.
    ghostHair = updateHair(ghostHair, ghost, look, ghost.status === "won" ? 0 : dt, ghost.facing);
    if (
      !inView(
        (ghost.rear.x + ghost.front.x) / 2,
        80,
        (ghost.rear.y + ghost.front.y) / 2,
      )
    )
      return;
    if (ghostHair) drawGhostHair(currentHairRoot(ghost, false, ghost.facing, look));
    ctx.globalAlpha = GHOST_ALPHA;
    gameArt.drawBike({
      rear: ghost.rear,
      front: ghost.front,
      ...bikeGeometry(ghost),
      flipVisual: ghost.facing,
      facing: ghost.facing,
      brakePressure: ghost.brakePressure,
      state: ghost.ragdoll ? "ragdoll" : "running",
      leanVisual: ghost.leanVisual,
      look,
      foot: feet.get(ghost) ?? null,
    });
    if (ghost.ragdoll) gameArt.drawRagdoll(ghost.ragdoll, look);
    ctx.globalAlpha = 1;
  }

  // An arrow `length` long from (x, y) along (dx, dy), outlined so it reads
  // on any background.
  function drawHintArrow(x, y, dx, dy, length) {
    const tipX = x + dx * length,
      tipY = y + dy * length;
    const head = 7;
    const wing = (side) => [
      tipX - dx * head - dy * head * side,
      tipY - dy * head + dx * head * side,
    ];
    const lines = [[[x, y], [tipX, tipY]], [wing(1), [tipX, tipY]], [wing(-1), [tipX, tipY]]];
    for (const line of lines) pixelPath(line, APPLE_HINT_OUTLINE, 3, 2);
    for (const line of lines) pixelPath(line, APPLE_HINT_COLOR, 1, 2);
  }

  // Each missing apple in view gets an arrow bobbing over it; one out of view
  // is shown at the edge nearest it, with an arrow pointing its way.
  function drawAppleHints(ride) {
    const left = appleHintUntil - sceneClock;
    if (left <= 0) return;
    ctx.globalAlpha = clamp(left / 400, 0, 1);
    const bob = reducedMotion ? 0 : Math.round(Math.sin(sceneClock / 160) * 2) * 2;
    const { side, top, bottom } = APPLE_HINT_MARGIN;
    // Apples off the same stretch of edge share one marker.
    const markers = [];
    for (const apple of ride.apples) {
      if (apple.taken) continue;
      if (inView(apple.x, -APPLE_HINT_VISIBLE, apple.y, -APPLE_HINT_VISIBLE)) {
        drawHintArrow(apple.x, apple.y - 40 + bob, 0, 1, 18);
        continue;
      }
      const x = clamp(apple.x, cameraX + side, cameraX + W - side);
      const y = clamp(apple.y, cameraY + top, cameraY + H - bottom);
      if (markers.some((marker) => Math.abs(marker.x - x) < 34 && Math.abs(marker.y - y) < 34)) continue;
      markers.push({ x, y });
      const distance = Math.hypot(apple.x - x, apple.y - y);
      const dx = (apple.x - x) / distance,
        dy = (apple.y - y) / distance;
      ctx.fillStyle = "#182321d9";
      ctx.fillRect(Math.round(x / 2) * 2 - 15, Math.round(y / 2) * 2 - 15, 30, 30);
      gameArt.drawApple(x, y + 1);
      // The arrow points out from the marker, toward the apple.
      drawHintArrow(x + dx * (20 + bob / 2), y + dy * (20 + bob / 2), dx, dy, 10);
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups(dt) {
    for (const item of popups) {
      item.life -= dt;
      item.y -= dt * 30;
      ctx.globalAlpha = clamp((item.life / item.max) * 2, 0, 1);
      drawPixelText(item.text, item.x, item.y, item.color, {
        pixel: 2,
        align: "center",
      });
    }
    ctx.globalAlpha = 1;
    for (let index = popups.length - 1; index >= 0; index--)
      if (popups[index].life <= 0) popups.splice(index, 1);
  }

  /**
   * Fog over the level, drawn before the riders: a sheet over the backdrop,
   * terrain, and pickups that thickens with `fog`, so at full fog the trail
   * is hard to make out. It thins softly towards the rider, so a little more
   * can be seen close by. `fogHaze` then lays a lighter veil over everything,
   * the rider included.
   */
  function drawFog(fog, focus, facing) {
    const x = focus.x + facing * 25 * fog;
    // The gradient is built round the origin and moved to the rider, so it
    // is only made again when the fog or its colour changes.
    const key = `${fog}|${frameFogColor}`;
    if (key !== fogGradientKey) {
      const thickness = fog ** 1.3;
      const outer = 0.97 * fog ** 1.6;
      const inner = 0.3 * thickness;
      // At full fog the view closes in to about 5 m (WHEELBASE is ~1.45 m).
      const near = 40 + (1 - fog) * 260;
      const far = 170 + (1 - fog) ** 1.5 * 500;
      fogGradient = ctx.createRadialGradient(0, 0, near, 0, 0, far);
      for (let step = 0; step <= 4; step++) {
        const t = step / 4;
        const eased = t * t * (3 - 2 * t);
        fogGradient.addColorStop(t, withAlpha(frameFogColor, inner + (outer - inner) * eased));
      }
      fogGradientKey = key;
    }
    ctx.save();
    ctx.translate(x, focus.y);
    ctx.fillStyle = fogGradient;
    ctx.fillRect(cameraX - x, cameraY - focus.y, W, H);
    ctx.restore();
  }

  function withAlpha(hex, alpha) {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function fogHaze(fog) {
    ctx.globalAlpha = 0.3 * fog;
    ctx.fillStyle = frameFogColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // How far a drop falls past the ground while its splash shows.
  const RAIN_SPLASH = ART_PIXEL * 10;

  // A stable pseudo-random value in [0, 1) for each drop and attribute.
  function rainHash(index, salt) {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  /**
   * Rain streaks. The slider sets how many drops fall, not how faint they
   * are, so a little rain is just a few drops. Each drop has its own depth:
   * nearer drops are longer, brighter, faster, and shift more as the camera
   * moves, so the drops never line up into rows. A drop lands somewhere new
   * each time it falls past the bottom.
   */
  // The first terrain or water surface along each slanted falling path, for
  // rain and snow to land on. Weather drifts sideways by `drift` world units
  // per unit fallen, so every point on one path shares x - drift * y; paths
  // are cached by that, and each is cast against the terrain only once. A
  // path is cast from above the highest terrain, as rain falls from the sky,
  // so anything overhead shelters what is under it, however far above the
  // view it is. The casts don't depend on the camera, so they last until the
  // slant or the terrain changes.
  const weatherGround = new WeakMap();
  const WEATHER_COLUMN = ART_PIXEL * 2;
  // How much of the camera's vertical movement rain and snow follow. Sideways
  // they move with the world at their depth, for parallax; up and down they
  // keep nearly to the screen, or a rider falling as fast as the flakes would
  // see the snow stand still (or rise), and one riding upward would see it
  // rush past.
  const WEATHER_VERTICAL_PARALLAX = 0.05;

  function weatherGroundAt(x, y, drift) {
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

  // `drift` is how far the drops are blown sideways per unit they fall
  // (negative to the left), from the wind.
  // How many drops or flakes the view's size calls for, relative to a phone's.
  function particleScale(full) {
    return clamp((W * H) / (760 * 430), 0.6, coarsePointer || !full ? PARTICLE_SCALE_LIGHT : PARTICLE_SCALE_MAX);
  }

  function drawRain(intensity, time, drift, full) {
    const scale = particleScale(full);
    // Above about 0.6 the rain builds to a downpour: more, longer, faster
    // drops under a darker sky.
    const storm = Math.max(0, (intensity - 0.6) / 0.4) ** 1.5;
    const count = Math.max(1, Math.round(scale * (160 * intensity ** 1.15 + 240 * storm)));
    const motion = reducedMotion ? 0 : time * 720;
    const spanX = W + 80,
      spanY = H + 70;
    ctx.fillStyle = `rgba(33, 52, 61, ${intensity * 0.12 + storm * 0.1})`;
    ctx.fillRect(0, 0, W, H);
    // One colour for every drop, each with its own alpha: a number is far
    // cheaper to set than a colour string is to build and parse.
    ctx.fillStyle = "rgb(205, 225, 224)";
    for (let index = 0; index < count; index++) {
      const depth = 0.45 + rainHash(index, 1) * 0.75;
      const fall =
        rainHash(index, 2) * spanY +
        motion * (0.6 + rainHash(index, 3) * 0.25 + storm * 0.45) * depth -
        cameraY * depth * WEATHER_VERTICAL_PARALLAX;
      const cycle = Math.floor(fall / spanY);
      const y = fall - cycle * spanY - 35;
      // Blown sideways over this fall only, so moving the wind slider swings
      // the drops rather than throwing them across the screen.
      const rawX =
        (rainHash(index, 4) + rainHash(index + cycle * 7919, 5)) * spanX +
        (y + 35) * drift -
        cameraX * depth;
      const x = (((rawX % spanX) + spanX) % spanX) - 40;
      ctx.globalAlpha = 0.25 + depth * 0.3 + storm * 0.1;
      // The streak runs along the drop's slant, so the further the wind lays
      // it over, the less it reaches down and the more it reaches across.
      const length = (8 + intensity * 6 + storm * 14) * depth + rainHash(index, 6) * 4;
      const down = Math.max(1, Math.round(length / Math.hypot(1, drift) / ART_PIXEL)) * ART_PIXEL;
      const across = Math.abs(drift) * down;
      const left = Math.round(x / ART_PIXEL) * ART_PIXEL,
        top = Math.round(y / ART_PIXEL) * ART_PIXEL;
      // Rain stops at the first terrain or water it reaches, with a splash.
      const worldX = left - ART_PIXEL / 2 + cameraX,
        worldY = top + cameraY;
      const hit = weatherGroundAt(worldX, worldY, drift);
      // Where along its slant this drop meets the ground.
      const landX = worldX + drift * (hit.y - worldY);
      const surface = hit.water ? hit.y + surfaceWave(landX, propScene.time) : hit.y;
      const ground = Math.round((surface - cameraY) / ART_PIXEL) * ART_PIXEL;
      const age = top + down - ground;
      if (age >= 0 && age < RAIN_SPLASH) {
        const left = Math.round((landX + ART_PIXEL / 2 - cameraX) / ART_PIXEL) * ART_PIXEL;
        const phase = Math.floor((age / RAIN_SPLASH) * 2);
        const spread = ART_PIXEL * (1 + phase);
        if (hit.water) {
          // A plop that leaves a ripple spreading along the surface.
          if (!phase) ctx.fillRect(left - ART_PIXEL, ground - ART_PIXEL * 2, ART_PIXEL, ART_PIXEL);
          ctx.fillRect(left - spread - ART_PIXEL, ground - ART_PIXEL, ART_PIXEL * 2, ART_PIXEL);
          ctx.fillRect(left + spread - ART_PIXEL * 2, ground - ART_PIXEL, ART_PIXEL * 2, ART_PIXEL);
        } else {
          const lift = phase ? ART_PIXEL : ART_PIXEL * 2;
          ctx.fillRect(left - spread - ART_PIXEL, ground - lift, ART_PIXEL, ART_PIXEL);
          ctx.fillRect(left + spread - ART_PIXEL, ground - lift, ART_PIXEL, ART_PIXEL);
        }
      }
      if (top >= ground) continue;
      const side = Math.sign(drift);
      if (across <= down) {
        // Falling steeply: one-pixel columns, each lower one a step downwind.
        const columns = Math.round(across / ART_PIXEL) + 1;
        for (let column = 0; column < columns; column++) {
          const from = top + Math.round((column * down) / columns / ART_PIXEL) * ART_PIXEL;
          const to = top + Math.round(((column + 1) * down) / columns / ART_PIXEL) * ART_PIXEL;
          const size = Math.min(to, ground) - from;
          if (size <= 0) break;
          ctx.fillRect(left + side * column * ART_PIXEL, from, ART_PIXEL, size);
        }
      } else {
        // Driven nearly flat: one-pixel rows, each lower one further downwind.
        const rows = down / ART_PIXEL;
        for (let row = 0; row < rows; row++) {
          const y = top + row * ART_PIXEL;
          if (y >= ground) break;
          const near = Math.round((row * across) / rows / ART_PIXEL) * ART_PIXEL;
          const far = Math.round(((row + 1) * across) / rows / ART_PIXEL) * ART_PIXEL;
          const width = Math.max(ART_PIXEL, far - near);
          ctx.fillRect(side < 0 ? left - near - width + ART_PIXEL : left + near, y, width, ART_PIXEL);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // How far a flake would have fallen past the ground while it rests there.
  const SNOW_SETTLE = ART_PIXEL * 14;

  /**
   * Snowflakes. Like rain, the slider sets how many fall, and from about 0.6
   * it builds to a blizzard: more, larger flakes under a white haze. The wind
   * drives them sideways by `drift` per unit fallen. Each flake sways as it
   * falls, with nearer flakes bigger, brighter, and faster. A flake rests
   * briefly where it lands on terrain and melts straight into water.
   */
  // Wind swirls live in the world, in stretches this wide, each with its own
  // gusts, so a gust stays put in the world as the camera moves.
  const GUST_STRETCH = 600;

  /**
   * Gusts made visible: thin, pale streaks of air blowing through the world
   * downwind (`dir`, -1 left or 1 right), each with a gentle wave and some
   * curling into a loop on the way. None in light air; a few in a stiff
   * breeze; several, faster, in a gale. Most fly low and follow the ground
   * below them, up a hill and down the other side; the rest fly high and
   * nearly level. They only show in open air: nothing is drawn inside the
   * terrain or under it, so none blow through a hill, a cave or the space
   * under an overhang (the same first surface from above that stops the rain;
   * see weatherGroundAt). Rain already shows the wind, so with rain they are
   * fewer, fainter and shorter; with snow they are broken into dots, like
   * snow being whirled along. Worked out from the time alone, like the rain
   * and snow, and left out with reduced motion.
   */
  function drawWindSwirls(wind, time, dir, rain, snow) {
    const strength = clamp((wind - 0.25) / 0.75, 0, 1);
    if (!strength || reducedMotion) return;
    const wet = Math.max(rain, snow);
    // Gust slots per stretch, rising slowly through a stiff breeze and
    // quickly towards a gale: about one gust in view at a time at 0.4 wind,
    // four in a gale. The last slot only fires some of its gusts, so the
    // count grows smoothly with the wind.
    const want = (0.6 + 9.4 * strength ** 1.4) * (1 - wet * 0.55);
    const slots = Math.ceil(want);
    const share = want - Math.floor(want) || 1;
    const speed = 150 + strength * 230;
    // The open air's floor at a world x: the first surface from the sky,
    // smoothed over the columns either side so a low gust flows over
    // the ground rather than stepping with it. The paths are cast a column
    // (WEATHER_COLUMN) at a time, so the floor is worked out once per column
    // a gust crosses and kept for the rest of that gust.
    const groundAt = (x) => weatherGroundAt(x, cameraY, 0).y;
    const floors = new Map();
    const floorAt = (x) => {
      const column = Math.round(x / WEATHER_COLUMN);
      let floor = floors.get(column);
      if (floor !== undefined) return floor;
      const at = column * WEATHER_COLUMN;
      const a = groundAt(at - 12),
        b = groundAt(at),
        c = groundAt(at + 12);
      let sum = 0,
        hits = 0;
      if (a !== Infinity) {
        sum += a;
        hits++;
      }
      if (b !== Infinity) {
        sum += b;
        hits++;
      }
      if (c !== Infinity) {
        sum += c;
        hits++;
      }
      floor = hits ? sum / hits : Infinity;
      floors.set(column, floor);
      return floor;
    };
    const open = (x, y) => y < groundAt(x);
    const first = Math.floor((cameraX - GUST_STRETCH) / GUST_STRETCH);
    const last = Math.floor((cameraX + W + GUST_STRETCH) / GUST_STRETCH);
    for (let stretch = first; stretch <= last; stretch++)
      for (let slot = 0; slot < slots; slot++) {
        const index = stretch * 61 + slot;
        // Each slot sends a gust every so often, from its own place each time.
        const period = 3.2 + rainHash(index, 31) * 3;
        const clock = time + rainHash(index, 32) * period;
        const cycle = Math.floor(clock / period);
        const age = clock - cycle * period;
        const seed = index + cycle * 7919;
        const life = 1.6 + rainHash(seed, 33) * 0.9;
        if (age > life) continue;
        if (slot === slots - 1 && rainHash(seed, 43) > share) continue;
        const travel = speed * (0.75 + rainHash(seed, 34) * 0.5);
        const startX = stretch * GUST_STRETCH + rainHash(seed, 39) * GUST_STRETCH;
        // Low gusts skim the ground and follow it; high ones fly nearly level.
        const low = rainHash(seed, 40) < 0.7;
        const height = low ? 14 + rainHash(seed, 42) * 50 : 90 + rainHash(seed, 42) * 130;
        const follow = low ? 1 : 0.2;
        const startFloor = floorAt(startX);
        if (!Number.isFinite(startFloor) || !open(startX, startFloor - height)) continue;
        const length = (70 + rainHash(seed, 35) * 70) * (1 - rain * 0.4);
        const curl = rainHash(seed, 36) < 0.55 ? 7 + rainHash(seed, 37) * 6 : 0;
        const wave = (low ? 3 : 5) + rainHash(seed, 38) * 5;
        const headAlong = age * travel;
        // Skip gusts nowhere near the view.
        const headX = startX + dir * headAlong;
        if (headX < cameraX - 200 || headX > cameraX + W + 200) continue;
        floors.clear();
        // A point of the gust, `back` world units behind its head.
        const at = (back) => {
          const along = Math.max(0, headAlong - back);
          let x = startX + dir * along;
          let y = Math.sin(along / 40 + rainHash(seed, 41) * 6.3) * wave;
          if (curl) {
            // A loop part-way along: the air turns over once and carries on.
            const loopAt = travel * life * 0.45;
            const into = (along - loopAt) / (curl * 6.3);
            if (into > 0 && into < 1) {
              const turn = into * Math.PI * 2;
              x += dir * (Math.sin(turn) * curl - into * curl * 6.3);
              y -= (1 - Math.cos(turn)) * curl;
            } else if (into >= 1) x -= dir * curl * 6.3;
          }
          const floor = floorAt(x);
          const ground = Number.isFinite(floor) ? startFloor + (floor - startFloor) * follow : startFloor;
          return [x, ground - height + y];
        };
        // Fading in at the start of its life and out at the end, and along its tail.
        const life01 = age / life;
        const fade = Math.min(1, life01 * 5, (1 - life01) * 4) * (0.55 - rain * 0.22);
        let previousLeft = NaN,
          previousTop = NaN;
        for (let back = 0; back < length; back += ART_PIXEL) {
          const [x, y] = at(back);
          // Only in open air: not in the ground, a cave or under an overhang.
          if (!open(x, y + ART_PIXEL)) continue;
          const left = Math.round((x - cameraX) / ART_PIXEL) * ART_PIXEL;
          const top = Math.round((y - cameraY) / ART_PIXEL) * ART_PIXEL;
          if (left === previousLeft && top === previousTop) continue;
          previousLeft = left;
          previousTop = top;
          // Snow breaks the streak into flakes being whirled along.
          if (snow && (back / ART_PIXEL) % 3 !== 0) continue;
          // A pale streak with a faint shaded underside, so it reads against a
          // light sky as well as dark leaves.
          const tail = 1 - back / length;
          ctx.globalAlpha = fade * tail * 0.4;
          ctx.fillStyle = "rgb(70, 96, 100)";
          ctx.fillRect(left, top + ART_PIXEL, ART_PIXEL, ART_PIXEL);
          ctx.globalAlpha = fade * tail;
          ctx.fillStyle = "rgb(244, 249, 247)";
          ctx.fillRect(left, top, ART_PIXEL, ART_PIXEL);
        }
      }
    ctx.globalAlpha = 1;
  }

  function drawSnow(intensity, time, drift, full) {
    const scale = particleScale(full);
    const storm = Math.max(0, (intensity - 0.6) / 0.4) ** 1.5;
    const count = Math.max(1, Math.round(scale * (150 * intensity ** 1.15 + 520 * storm)));
    const seconds = reducedMotion ? 0 : time;
    const spanX = W + 120,
      spanY = H + 40;
    if (storm) {
      ctx.fillStyle = `rgba(232, 238, 242, ${storm * 0.24})`;
      ctx.fillRect(0, 0, W, H);
    }
    // One colour, each flake with its own alpha, as for rain.
    ctx.fillStyle = "rgb(246, 249, 250)";
    for (let index = 0; index < count; index++) {
      const depth = 0.4 + rainHash(index, 11) * 0.8;
      const fall =
        rainHash(index, 12) * spanY +
        seconds * 55 * (0.7 + rainHash(index, 13) * 0.6) * depth * (1 + storm * 1.8) -
        cameraY * depth * WEATHER_VERTICAL_PARALLAX;
      const cycle = Math.floor(fall / spanY);
      const y = fall - cycle * spanY - 20;
      const sway =
        Math.sin(seconds * (0.9 + rainHash(index, 14)) + rainHash(index, 15) * 6.3) *
        10 *
        depth;
      const rawX =
        (rainHash(index, 16) + rainHash(index + cycle * 7919, 17)) * spanX +
        (y + 20) * drift +
        sway -
        cameraX * depth;
      const x = (((rawX % spanX) + spanX) % spanX) - 60;
      const size = (depth > 0.9 - storm * 0.35 ? 2 : 1) * ART_PIXEL;
      const left = Math.round(x / ART_PIXEL) * ART_PIXEL,
        top = Math.round(y / ART_PIXEL) * ART_PIXEL;
      const worldX = left + size / 2 + cameraX,
        worldY = top + size + cameraY;
      const hit = weatherGroundAt(worldX, worldY, drift);
      const ground = Math.round((hit.y - cameraY) / ART_PIXEL) * ART_PIXEL;
      const alpha = 0.45 + depth * 0.4;
      if (top + size > ground) {
        if (hit.water || top + size - ground > SNOW_SETTLE) continue;
        // Resting where it landed until it melts away.
        const rest = Math.round((left - drift * (top + size - ground)) / ART_PIXEL) * ART_PIXEL;
        ctx.globalAlpha = alpha * (1 - (top + size - ground) / SNOW_SETTLE);
        ctx.fillRect(rest, ground - ART_PIXEL, size, ART_PIXEL);
        continue;
      }
      ctx.globalAlpha = alpha;
      ctx.fillRect(left, top, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawWeather(weather, full) {
    const rainIntensity = clamp(Number(trail.weather?.rain) || 0, 0, 1);
    const snow = clamp(Number(trail.weather?.snow) || 0, 0, 1);
    const fog = fogAmount(trail.weather);
    const air = propScene.weather;
    const wind = clamp(Number(air?.wind) || 0, 0, 1);
    if (!rainIntensity && !snow && !fog && weather.flash <= 0 && wind <= 0.25) return;
    ctx.save();
    if (fog) fogHaze(fog);
    // Gusts behind the rain and snow; all three are blown by the same wind.
    drawWindSwirls(wind, weather.time, windSign(air), rainIntensity, snow);
    if (rainIntensity) drawRain(rainIntensity, weather.time, windSign(air) * rainSlant(air.wind), full);
    if (snow) drawSnow(snow, weather.time, windSign(air) * snowDrift(air.wind), full);
    if (weather.flash > 0) {
      // The lighting pass lights the scene up; this adds the glare on top.
      ctx.fillStyle = `rgba(225, 239, 237, ${weather.flash * 0.14})`;
      ctx.fillRect(0, 0, W, H);
      if (weather.flash > 0.3 && !reducedMotion) {
        const proximity = 1 - weather.distance;
        const startX = weather.x * W;
        const bolt = [[startX, 0]];
        for (let step = 1; step <= 6; step++)
          bolt.push([
            startX + Math.sin(weather.x * 91 + step * 7.3) * 16,
            step * H * 0.085,
          ]);
        pixelPath(
          bolt,
          `rgba(246, 244, 204, ${weather.flash})`,
          proximity > 0.5 ? 2 : 1,
        );
      }
    }
    ctx.restore();
  }

  function drawPhysicsOverlay(vehicle, ride) {
    const { chassis } = vehicle;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1;
    for (const constraint of vehicle.dampedConstraints) {
      if (constraint.type !== "distance" && constraint.type !== "leg") continue;
      const limit =
        constraint.type === "leg"
          ? constraint.lower !== null || constraint.upper !== null
          : constraint.minLength !== null || constraint.maxLength !== null;
      ctx.strokeStyle = limit ? "#f0b45f" : "#83d1ce";
      ctx.beginPath();
      ctx.moveTo(constraint.a.x, constraint.a.y);
      ctx.lineTo(constraint.b.x, constraint.b.y);
      ctx.stroke();
    }
    for (const point of Object.values(chassis)) {
      ctx.fillStyle = "#fff3be";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, TAU);
      ctx.fill();
    }
    for (const point of [vehicle.rear, vehicle.front]) {
      if (!point.contact) continue;
      ctx.strokeStyle = "#e65e56";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(
        point.x + point.contact.nx * 24,
        point.y + point.contact.ny * 24,
      );
      ctx.stroke();
    }
    // The rider's crash probes: only the head ends a run on terrain, so it is
    // drawn red when it touches; the shoulder and hip go orange inside it.
    if (ride && !ride.ragdoll)
      for (const [name, probe] of Object.entries(riderCollisionPoints(ride))) {
        const clearance = probeClearance(ride.trail, probe);
        const touching = clearance !== null && clearance <= 0;
        ctx.strokeStyle = touching ? (name === "head" ? "#ff3b30" : "#ff9f2e") : "#7fd8ff";
        ctx.beginPath();
        ctx.arc(probe.x, probe.y, probe.radius, 0, TAU);
        ctx.stroke();
      }
    const center = vehicleMetrics(vehicle).center;
    ctx.strokeStyle = "#ff8952";
    ctx.beginPath();
    ctx.moveTo(center.x - 5, center.y);
    ctx.lineTo(center.x + 5, center.y);
    ctx.moveTo(center.x, center.y - 5);
    ctx.lineTo(center.x, center.y + 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawGoal(ride) {
    if (!inView(trail.finish.x, 65)) return;
    const goalY = finishHeight(trail);
    if (inView(trail.finish.x, 65, goalY, 115))
      gameArt.drawFlag(
        trail.finish.x,
        goalY,
        ride.collected === ride.apples.length,
        reducedMotion ? 0 : ride.time,
      );
  }

  // The shine is only decoration, so it follows the scene clock and is left
  // out with reduced motion.
  function drawApples(ride) {
    for (const apple of ride.apples) {
      if (apple.taken || !inView(apple.x, 30, apple.y)) continue;
      gameArt.drawApple(apple.x, apple.y, reducedMotion ? null : appleShine(apple, sceneClock / 1000));
    }
  }

  // Each checkpoint's flag waits low on its pole and runs up it, easing in
  // at the top, once the rider reaches it; with reduced motion it is
  // simply up. It flies like a flagpole prop's, in the trail's wind.
  function drawCheckpoints(ride) {
    const { wind } = propScene.weather;
    const downwind = windSign(propScene.weather);
    ride.checkpoints.forEach((foot, index) => {
      if (!inView(foot.x, 50, foot.y, -FLAGPOLE.top + 8)) return;
      const raised = raisedFlags.get(index);
      const up = raised === undefined ? 0 : reducedMotion ? 1 : Math.min(1, (sceneClock - raised) / FLAG_HOIST_MS);
      ctx.save();
      ctx.translate(Math.round(foot.x / 2) * 2, Math.round(foot.y / 2) * 2);
      drawFlagpole({ pixelRect }, () => 0, reducedMotion ? 0 : propScene.time, wind, index * 0.37, downwind, 1 - (1 - up) ** 3);
      ctx.restore();
    });
  }

  // The nisse's hat tip flops now and then, on the scene clock; held still
  // with reduced motion.
  function drawNisseInRide(ride) {
    const nisse = ride.nisse;
    if (!nisse || nisse.taken || !inView(nisse.x, 30, nisse.y - 12)) return;
    drawNisse({ pixelRect }, nisse.x, nisse.y, reducedMotion ? 0 : nisseWiggle(nisse, sceneClock / 1000));
  }

  function drawSpikes(ride) {
    for (const spike of ride.spikes) {
      if (!inView(spike.x, spike.radius + 10, spike.y)) continue;
      gameArt.drawSpike(
        spike.x,
        spike.y,
        spike.radius,
        // The spin is gameplay: the star kills where it is drawn.
        spikeAngle(spike, ride.spikeTime),
      );
    }
  }

  // Drawn over the bike and rider, so whatever is in the water looks wet;
  // terrain inside a body is left dry.
  function drawWater(ride) {
    if (!ride.water?.length) return;
    const compiled = terrainGeometry(trail);
    for (const body of ride.water) {
      if (
        body.x > cameraX + W ||
        body.x + body.width < cameraX ||
        body.y > cameraY + H ||
        body.y + body.depth < cameraY - 4
      )
        continue;
      gameArt.drawWater(body, waterColumns(compiled, body, ART_PIXEL), propScene.time);
    }
  }

  /** Where the camera should look: the bike, or the tumbling rider after a crash. */
  function focusOf(ride) {
    return ride.ragdoll
      ? ragdollCenter(ride.ragdoll)
      : vehicleMetrics(ride.vehicle).center;
  }

  /**
   * @param {{
   *   ride: any, ghost: any, camera: any, effects: any, state: string,
   *   look?: import('./cosmetics.js').Look | null, ghostLook?: import('./cosmetics.js').Look | null,
   *   full: boolean, dt: number, debug: boolean, kick?: number | null
   * }} frame  `look` is the rider's, `ghostLook` the ghost's (the rider's by default);
   *   `dt` is the seconds since the last frame, 0 for a still scene; `kick`
   *   is how far through kick-starting the engine the rider is, 0 to 1
   */
  function draw({
    ride,
    ghost,
    camera,
    effects,
    look = null,
    ghostLook = null,
    state,
    full,
    dt,
    debug,
    fireworks = null,
    kick = null,
  }) {
    const paused = state === "paused";
    wonFor = state === "won" ? wonFor + dt : 0;
    const settle = state === "won" ? Math.max(0, 1 - wonFor / WIN_SETTLE) ** 2 : 1;
    const animationDt = paused ? 0 : dt * settle;
    // The weather clock steps with the physics, which stops at the finish;
    // keep it in step with the props while they slow down.
    if (state === "won") effects.weather.time += animationDt;
    sceneClock += animationDt * 1000;
    const now = sceneClock;
    // A ghost the player beat rides on to the finish at full speed while the
    // rest of the scene settles, and stops once it gets there.
    const ghostDt = paused || ghost?.status === "won" ? 0 : state === "won" ? dt : animationDt;
    // Posed scenes for the menu ("ready") hold the rider still, and the
    // rider's feet stop on the pedals at the finish, as the hair does.
    if (state !== "ready") {
      stepFoot(ride, ride.status === "won" ? 0 : animationDt, kick);
      if (ghost) stepFoot(ghost, ghostDt);
    }
    const focus = focusOf(ride);
    // The ride is already interpolated for this frame, and nothing here feeds
    // back into the simulation, so replays are unaffected.
    if (!ride.ragdoll) crashStart = null;
    else crashStart ??= now;
    propScene = {
      time: reducedMotion ? 0 : now / 1000,
      riderX: focus.x,
      riderY: focus.y,
      weather: resolveWeather(trail.weather),
      landing,
      // Where the rider came off, and how long ago, for the spectators.
      crash: ride.ragdoll ? { x: focus.x, y: focus.y, age: (now - crashStart) / 1000 } : null,
    };
    frameNow = now;
    startleProps(ride, focus, now);
    watchCrash(ride, focus, now);
    watchHalfway(ride, focus, now);
    walkCorgis(ride, focus, animationDt);
    camera.follow(focus, {
      facing: ride.facing,
      loose: Boolean(ride.ragdoll),
      width: W,
      height: H,
      // Held still while paused, so redrawing a paused scene doesn't move it.
      dt: animationDt,
      fallY: fallLine(trail),
    });
    const flipSmoothing = reducedMotion ? 1 : 1 - Math.exp(-18 * dt);
    flipVisual = lerp(flipVisual, ride.facing, flipSmoothing);
    if (Math.abs(flipVisual - ride.facing) < 0.002) flipVisual = ride.facing;
    const worldToDevice = pixelScale / ART_PIXEL;
    const view = camera.view();
    // Whole device pixels, so art on the world's pixel grid never straddles a pixel.
    cameraX = Math.round(view.x * worldToDevice) / worldToDevice;
    cameraY = Math.round(view.y * worldToDevice) / worldToDevice;
    riderOnScreen = { x: (focus.x - cameraX) / W, y: (focus.y - cameraY) / H };
    // Worked out once for everything this frame draws by the sun or in the fog.
    frameSun = sunLight({ width: W, cameraX, cameraY, weather: trail.weather, timeOfDay: trail.timeOfDay });
    const fog = fogAmount(trail.weather);
    if (fog) frameFogColor = fogColor(trail);

    ctx.setTransform(worldToDevice, 0, 0, worldToDevice, 0, 0);
    ctx.imageSmoothingEnabled = false;
    gameArt.drawBackground({
      width: W,
      height: H,
      palette: trail,
      cameraX,
      cameraY,
      full,
      smooth: true,
      sceneTime: propScene.time,
    });
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    effects.update(animationDt);
    wheelDirt = effects.wheelDirt;
    wheelSquish = effects.tyreSquish;
    // Fireworks go off in the sky behind the land and the buildings. They
    // keep the real clock, as the scene's own slows to a stop at the finish.
    if (fireworks?.active()) {
      fireworks.update(paused ? 0 : dt, { x: cameraX, y: cameraY, width: W, height: H });
      fireworks.draw(ctx);
    }
    backWallRenderer.draw(ctx, trail, cameraX, cameraY, W, H);
    drawProps("back", full);
    terrainRenderer.draw(ctx, ride.trail, cameraX, cameraY, W, H, propScene.time, propScene.weather);
    drawGlassCracks(ride.trail);
    drawWallPaint();
    drawSkidMarks(effects.skidMarks);
    drawSceneryShadows(ride, now, full);
    drawParticles(effects.particles, true);
    drawGoal(ride);
    drawCheckpoints(ride);
    drawSpikes(ride);
    drawApples(ride);
    drawNisseInRide(ride);
    if (fog) drawFog(fog, focus, ride.facing);
    drawGhost(ghost, ghostLook ?? look, ghostDt);
    hair = updateHair(hair, ride, look, ride.status === "won" ? 0 : animationDt);
    if (hair) hair.draw(pixelPath, currentHairRoot(ride, false, flipVisual, look));
    drawBike(ride, look, flipVisual, ride.ragdoll ? "ragdoll" : state);
    if (debug) drawPhysicsOverlay(ride.vehicle, ride);
    if (ride.ragdoll) gameArt.drawRagdoll(ride.ragdoll, look);
    // Water props in front are drawn before the water, so what is under the
    // surface looks wet.
    drawProps("front", full, gameArt, null, true);
    drawWater(ride);
    drawProps("front", full, gameArt, null, false);
    drawXray(ride, look, ride.ragdoll ? "ragdoll" : state, full);
    drawParticles(effects.particles, false);
    // Light the scene, then the glowing parts of props on top.
    lighting.draw(ctx, {
      trail,
      ride,
      look,
      cameraX,
      cameraY,
      width: W,
      height: H,
      flash: effects.weather.flash,
      time: propScene.time,
      flip: flipVisual,
      sun: frameSun,
      lights: fireworks?.lights(),
    });
    drawPropGlows(ride, look, ride.ragdoll ? "ragdoll" : state, full);
    // Thrown off the bike, the rider can't interact, so there's no key to show.
    if (!ride.ragdoll) drawInteractHint();
    drawPopups(animationDt);
    drawAppleHints(ride);
    effects.prune();
    ctx.restore();
    drawWeather(effects.weather, full);
  }

  /**
   * Only the bike and rider, standing still, for menu scenes with art of their
   * own: no trail, props, shadow, weather or lighting. `backdrop` paints first,
   * in world units, given the view (`x`, `y`, `width`, `height`); without one
   * the rest of the canvas stays transparent. `dark` turns the room's lights
   * off, leaving the bike's headlight and tail light to light it.
   * @param {{ ride: any, look?: import('./cosmetics.js').Look | null, view: { x: number, y: number },
   *   backdrop?: ((ctx: CanvasRenderingContext2D, view: { x: number, y: number, width: number, height: number }) => void) | null,
   *   dark?: boolean }} frame
   */
  function drawFigure({ ride, look = null, view, backdrop = null, dark = false }) {
    const worldToDevice = pixelScale / ART_PIXEL;
    cameraX = Math.round(view.x * worldToDevice) / worldToDevice;
    cameraY = Math.round(view.y * worldToDevice) / worldToDevice;
    flipVisual = ride.facing;
    wheelDirt = null;
    wheelSquish = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(worldToDevice, 0, 0, worldToDevice, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    backdrop?.(ctx, { x: cameraX, y: cameraY, width: W, height: H });
    hair = updateHair(hair, ride, look, 0);
    if (hair) hair.draw(pixelPath, currentHairRoot(ride, false, flipVisual, look));
    const lit = headlights;
    // In the dark the bike's lights are on, whatever the setting.
    if (dark) headlights = true;
    gameArt.drawBike(bikeDrawing(ride, look, flipVisual, "ready"));
    headlights = lit;
    if (dark) lighting.drawDark(ctx, { ride, look, cameraX, cameraY, width: W, height: H, flip: flipVisual });
    ctx.restore();
  }

  return {
    resize,
    /**
     * Called after the canvas has been sized again for a new device pixel
     * ratio (see resize), so whatever was on it can be drawn again.
     * @param {(() => void) | null} listener
     */
    onPixelRatioChange(listener) {
      pixelRatioChanged = listener;
    },
    setViewport,
    settleHair,
    reset,
    respawn,
    /** Sends a checkpoint's flag up its pole, once, as the rider reaches it. */
    raiseFlag(index) {
      if (!raisedFlags.has(index)) raisedFlags.set(index, sceneClock);
    },
    land,
    takeWoofs,
    /** Whether the scene behind the results has come to a stop. */
    settled: () => wonFor >= WIN_SETTLE,
    interact,
    setInteractKey(label) {
      interactLabel = String(label || "");
    },
    draw,
    drawFigure,
    popup,
    pointToApples,
    setHeadlights(on) {
      headlights = Boolean(on);
      lighting.setHeadlights(on);
    },
    /** Where the rider was in the last frame, as fractions of the view's width and height. */
    riderOnScreen: () => riderOnScreen,
    get width() {
      return W;
    },
    get height() {
      return H;
    },
  };
}
