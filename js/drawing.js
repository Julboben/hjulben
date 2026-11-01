import {
  terrainAt,
  terrainCollisionsAt,
  terrainGeometry,
  terrainSurfacesAt,
} from "./terrain.js";
import { terrainMaterials } from "./materials.js";
import { lookParts } from "./cosmetics.js";
import { BIKE_LAMPS, bodyPose, lampColors, lampLenses, posedBodyPoint } from "./bike-lamps.js";
import { FINISH_FLOWER_LIFT } from "./finish.js";
import { APPLE_SPRITE } from "./apple.js";
import { SPIKE_CORE, SPIKE_TIP, spikePoints } from "./spike.js";
import { WHEELBASE } from "./config.js";
import { WATER_COLORS, surfaceWave, waterBodies } from "./water.js";
import {
  WATER_PROPS,
  SURFACE_PROPS,
  SURFACE_REACH,
  FISH_RANGE,
  FISH_CLEARANCE,
  FISH_HALF,
  REED_MAX,
  SEAWEED_MAX,
  waterPropBody,
  waterPropNoise,
  fishSwimY,
  fishSwim,
  fishDart,
  seaweedHeight,
  reedHeight,
  drawLily,
  drawReeds,
  drawSeaweed,
  drawFish,
  drawDuckFloating,
  drawDuckFlying,
  FISH_DART,
  DRAGONFLY_RANGE,
  drawBoat,
  drawBubbles,
  drawDragonfly,
  drawFrog,
  drawFrogPad,
  dragonflyAt,
  frogLeap,
  risingBubbles,
} from "./water-props.js";
import {
  BAT_ROOSTS,
  BEAM_HALF,
  CART_WHEELS,
  LANTERN_CENTRE,
  LANTERN_LIGHT,
  LANTERN_TOP,
  RAIL_TOP,
  drawBatFlying,
  drawBatHanging,
  drawBeams,
  drawDrip,
  drawHangingRoots,
  drawLantern,
  drawLanternGlass,
  drawMinecart,
  drawMushroomSpots,
  drawMushrooms,
  drawRails,
  drawStalactites,
  mushroomCaps,
  WATER,
} from "./cave-props.js";
import {
  STEEL,
  LAMP_HEAD,
  LAMP_BODY_BOTTOM,
  LAMP_LIGHT,
  CRANE_BODY_BOTTOM,
  CRANE_FOOTING,
  CRANE_LIGHTS,
  SCAFFOLD_STANDARDS,
  SCAFFOLD_TOP,
  GRAFFITI_BOUNDS,
  drawCone,
  drawBarrier,
  drawDumpster,
  drawLamp,
  drawLampGlass,
  drawBirdPerched,
  drawBirdFlying,
  drawCrane,
  drawScaffoldDecks,
  drawScaffoldCouplers,
  drawGraffiti,
  CHRISTIANIA_WHEELS,
  BENCH_ENDS,
  drawBench,
  drawChristianiaBike,
} from "./city-props.js";
import {
  SQUIRREL_RANGE,
  SQUIRREL_STEP,
  SQUIRREL_STEP_UP,
  SQUIRREL_LENGTH,
  PINE_TIERS,
  squirrelDash,
  drawSquirrelSitting,
  drawSquirrelRunning,
  FIRE,
  TENT,
  TENT_DOOR_CENTRE,
  drawFireplace,
  drawGrass,
  drawTent,
  drawTentDoorGlow,
  drawTentRopes,
  FIRE_TONGUES,
  grassLean,
  IVY,
  TREE_SWAY_MAX,
  fallingLeaves,
  treeSway,
  drawIvy,
  drawMoss,
  mossCushions,
  ivyLayout,
  ivyRustle,
} from "./forest-props.js";
import {
  HAZE,
  HAZE_HALF,
  HAZE_RISE,
  ROTOR,
  TOWER_BODY_BOTTOM,
  TOWER_LADDER,
  TOWER_LEGS,
  TOWER_PLATFORM,
  TUMBLEWEED_RADIUS,
  TUMBLEWEED_RUN,
  TUMBLEWEED_STEP,
  TUMBLEWEED_STEP_UP,
  VULTURE_HEIGHT,
  VULTURE_ORBIT,
  WINDMILL_BODY_BOTTOM,
  WINDMILL_FEET,
  WRECK_SINK,
  drawCarWreck,
  drawCowSkull,
  drawTumbleweed,
  drawVultureBanking,
  drawVultureLanding,
  drawVultureSoaring,
  drawVultureStanding,
  drawWaterTower,
  drawWindmillRotor,
  drawWindmillTower,
  hazeShift,
  hazeStreaks,
  tumbleweedRoll,
  vultureOrbit,
  windmillAngle,
} from "./desert-props.js";
import {
  CABLE_HALF,
  CABLE_TOP,
  HUT_BOUNDS,
  HUT_CHIMNEY,
  HUT_LIGHT,
  HUT_WINDOW,
  ICE,
  ICICLE_REACH,
  PYLON_BODY_BOTTOM,
  PYLON_NUMBER,
  PYLON_TOP,
  SMOKE,
  SNOW,
  SNOWMAN_EYE_HEIGHT,
  chimneySmoke,
  drawCable,
  drawCairn,
  drawCairnFoot,
  drawChair,
  drawHut,
  drawHutFoundation,
  drawHutWindowGlass,
  drawIcicles,
  drawPineDrift,
  drawPineSnow,
  drawPineSnowCap,
  drawPylon,
  drawPylonFooting,
  drawSnowman,
  drawSnowmanDrift,
  drawSnowmanFace,
  liftChair,
  pineShake,
  pineSnowFall,
  pineSnowPuffs,
  pineSway,
  snowmanGaze,
} from "./mountain-props.js";
import {
  BANNER_TOP,
  CAMERA_TALLY,
  CAMERA_TOWER_BODY_BOTTOM,
  CAMERA_TOWER_LEGS,
  HALFWAY_BEACON,
  HALFWAY_BOARD,
  HALFWAY_CLOTH,
  HALFWAY_LIGHT,
  HAY_BALES_BOUNDS,
  PIT_BOARD,
  PIT_BOARD_BOTTOM,
  SPECTATORS,
  TAPE_STAKES,
  TUTORIAL_BOUNDS,
  TYRE_WALL_BOUNDS,
  bannerLayout,
  bannerStyle,
  cameraTallyOn,
  drawArrowSign,
  drawBanner,
  drawCamera,
  drawCameraTower,
  drawCourseTape,
  drawHalfwayFlag,
  drawHayBales,
  drawMarshal,
  drawPerson,
  drawPetrolCan,
  drawPitBoard,
  drawSignPost,
  drawTutorialBrake,
  drawTutorialFlip,
  drawTutorialGas,
  drawTutorialLean,
  drawTutorialLeanForward,
  drawTutorialLedge,
  drawTutorialLight,
  drawTutorialRestart,
  drawTutorialRotate,
  drawTyreWall,
  drawWarningBang,
  drawWarningSkull,
  drawWarningTriangle,
  halfwayFlash,
  halfwayTextColor,
  marshalFlag,
  pitBoardText,
  spectatorHop,
  spectatorMood,
  splitText,
} from "./event-props.js";
import {
  CELL_BUNK,
  PRISONER_SKINS,
  PRISON_FENCE_BOUNDS,
  SEARCHLIGHT,
  SEARCHLIGHT_LIGHT,
  TALLY_BOUNDS,
  TUNNEL_DEPTH,
  WANTED,
  WANTED_POST_TOP,
  WATCHTOWER_BODY_BOTTOM,
  WATCHTOWER_LEGS,
  cellPrisoner,
  drawBallAndChain,
  drawCellBack,
  drawCellBars,
  drawPrisonFence,
  drawPrisoner,
  drawPrisonerBust,
  drawPrisonerHands,
  drawSearchlight,
  drawTallyMarks,
  drawTunnelLip,
  drawTunnelMound,
  drawWantedPoster,
  drawWatchtower,
  searchlightAim,
  searchlightBeam,
  tunnelPeek,
} from "./prison-props.js";
import {
  COBWEB_HANG,
  COCOON_HANG,
  SPIDER_DROP,
  WEB_HANG,
  cocoonMotion,
  danglingSpider,
  drawCobweb,
  drawCocoon,
  drawDanglingSpider,
  drawSpider,
  drawSpiderweb,
  webSize,
  webState,
} from "./spider-props.js";
import {
  BAR_XS,
  BARS,
  CHAINS_HANG,
  GIBBET_HANG,
  PORTCULLIS,
  TORCH_BODY_BOTTOM,
  TORCH_FLAME,
  barLayout,
  drawDungeonBars,
  drawGibbetCage,
  drawGibbetChain,
  drawHangingChains,
  drawPortcullis,
  drawSkeletonBody,
  drawSkeletonSkull,
  drawTorchFeet,
  drawTorchStand,
  hangingSwing,
  portcullisDrop,
  skeletonJaw,
  TORCH_TONGUES,
} from "./dungeon-props.js";
import { FLAME, drawFire, fireFrame } from "./fire.js";
import {
  FARMHOUSE,
  FARMHOUSE_BOUNDS,
  FLAGPOLE,
  MILL,
  STALL,
  STALL_BOUNDS,
  TURBINE,
  TURBINE_BOUNDS,
  drawFarmhouse,
  drawFarmhouseBase,
  drawFarmhouseWindowGlass,
  drawFlagpole,
  drawMailbox,
  drawMillBase,
  drawMillSails,
  drawMillTower,
  drawStall,
  drawStallCoin,
  drawStallLegs,
  drawTurbineBlades,
  drawTurbineFoot,
  drawTurbineTower,
  farmhouseLitWindows,
  farmhouseWindowCentre,
  mailboxFlagLift,
  millAngle,
  stallCoin,
  stallSignLines,
  turbineAngle,
} from "./countryside-props.js";
import { resolveWeather, windSign } from "./weather.js";
import { dayBlend, normalizeHour } from "./time-of-day.js";
import {
  CORGI_BOUNDS,
  CORGI_RANGE,
  CORGI_STEP,
  CORGI_STEP_UP,
  corgiGround,
  corgiPhase,
  corgiPose,
  corgiStart,
  drawCorgi,
} from "./corgi-props.js";
import {
  RABBIT_BOUND_HEIGHT,
  RABBIT_BOUNDS,
  RABBIT_HEIGHT,
  RABBIT_RANGE,
  RABBIT_STEP,
  RABBIT_STEP_UP,
  drawRabbit,
  rabbitFlee,
  rabbitIdle,
  rabbitPhase,
} from "./rabbit-props.js";

const GROUND_ALIGNED_PROP_SPANS = {
  bush: [-28, 28],
  fence: [-33, 33],
  rock: [-16, 18],
  boulder: [-22, 22],
  crates: [-40, 40],
  wheelbarrow: [-8, 20],
  beehive: [-16, 16],
  tyre: [-26, 26],
  cone: [-8, 8],
  barrier: [-32, 32],
  dumpster: [-26, 26],
  skull: [-14, 14],
  "car-wreck": [-48, 48],
  "tyre-wall": [-44, 44],
  "hay-bales": [-34, 34],
  "petrol-can": [-10, 10],
  "prison-fence": [-44, 44],
  "ball-and-chain": [-18, 18],
  "escape-tunnel": [-20, 20],
  skeleton: [-14, 22],
  tent: [-30, 30],
  "christiania-bike": CHRISTIANIA_WHEELS,
  bench: [BENCH_ENDS[0], BENCH_ENDS[1] + 4],
  fireplace: [-18, 18],
};

/**
 * The surface a prop is resting on, at an x.
 *
 * The search runs from `referenceY` downwards and takes the highest solid
 * surface at or below it. That is what makes a prop follow the ground it stands
 * on rather than a surface above it: a fence on a hillside follows the hillside,
 * not an island floating over it, and a prop on a cave floor follows that
 * floor rather than the ceiling.
 */
function surfaceAt(trail, x, referenceY) {
  const surface = terrainAt(trail, x, referenceY);
  return surface?.solid ? surface.y : null;
}

/**
 * The height a prop stands at: its own y when it has one, otherwise the surface
 * directly beneath it.
 */
function propGroundHeight(trail, prop) {
  if (Number.isFinite(prop.y)) return prop.y;
  return surfaceAt(trail, prop.x, null);
}

/**
 * Whether a prop is planted on the terrain or deliberately floating.
 *
 * A prop the author dragged onto a surface is planted and follows the slope
 * under it. A prop left in mid-air keeps a trail base, which is what makes a
 * floating prop read as floating.
 */
function isPlanted(trail, prop) {
  if (!Number.isFinite(prop.y)) return true;
  const below = surfaceAt(trail, prop.x, prop.y);
  if (below === null) return false;
  return Math.abs(below - prop.y) <= PLANTED_TOLERANCE;
}

// How close the ground has to be to a hand-placed prop for it to count as
// resting on it rather than floating. Generous, because a prop is placed by
// hand and usually sits a few units off the surface it is meant to be on, and
// because the alternative is a whole hillside of scenery that has silently
// stopped following the ground.
const PLANTED_TOLERANCE = 24;

/**
 * How far above a prop the search for its ground may reach.
 *
 * A prop's footprint can straddle a slope, so its uphill end sits higher than
 * the prop's own anchor. Searching strictly downwards would find nothing there
 * and the prop would read as flat, so the search starts a little above the prop
 * and walks down to the surface it stands on.
 */
const PROP_SLOPE_WINDOW = 90;

function propSlope(trail, prop, reference) {
  let [left, right] = GROUND_ALIGNED_PROP_SPANS[prop.type];
  // A mirrored prop stands on the mirror image of its footprint.
  if (prop.flip) [left, right] = [-right, -left];
  const a = surfaceAt(trail, prop.x + left, reference);
  const b = surfaceAt(trail, prop.x + right, reference);
  if (a === null || b === null) return null;
  return (b - a) / (right - left);
}

export function propAlignmentSlope(trail, prop) {
  // A rotated prop is posed by hand, so its rotation replaces the slope.
  if (!GROUND_ALIGNED_PROP_SPANS[prop.type] || propRotation(prop)) return 0;
  const standing = propGroundHeight(trail, prop);
  if (standing === null) return 0;
  if (!isPlanted(trail, prop)) return 0;
  const slope = propSlope(trail, prop, standing - PROP_SLOPE_WINDOW);
  return slope === null ? 0 : slope;
}

export function propDrawAngle(type, slope = 0) {
  return GROUND_ALIGNED_PROP_SPANS[type] && Number.isFinite(slope)
    ? Math.atan(slope)
    : 0;
}

// How far the camera can climb while the sun still sinks a little in the sky;
// above that it holds its place so it stays in view on tall trails.
const SUN_CLIMB_LIMIT = 600;
// The backdrop's hills rise as the camera goes down, and below them is only
// their flat colour, so past this camera height they stop: a trail that runs
// far below the usual ground would otherwise lose its sky and hills.
const BACKDROP_SINK_LIMIT = 300;
// Vertical spacing, in cloud-parallax space, of the cloud rows repeated above
// the first one as the camera climbs.
const CLOUD_ROW_SPACING = 180;
// Clouds are painted one cell per 4 world units into a small layer that is
// drawn with one alpha, so shapes that touch merge instead of darkening.
const CLOUD_CELL = 4;
// Each row of cloud banks has one bank, or none, per slot this wide.
const CLOUD_SLOT = 170;
const cloudLayers = new Map();

/**
 * The sky's cloud cover as one opaque layer. Cover builds up in stages:
 * small cumulus that grow into big banks, then from 30% a deck that fills in from the top of the sky on
 * a lumpy underside, with banks and thin streaks below it, lowering until,
 * at full cover, it fills the sky. The sun shows as a pale glow through cloud.
 * Returns the canvas and how far left and up of the view to draw it.
 */
function cloudLayer({ width, height, scrollX, cloudShift, cloudiness, color, glow, glowSize = 1, sunX, sunY }) {
  const cell = CLOUD_CELL;
  const gx0 = Math.floor(scrollX / cell),
    gy0 = Math.floor(-cloudShift / cell);
  const offsetX = scrollX - gx0 * cell,
    offsetY = -cloudShift - gy0 * cell;
  const cols = Math.ceil(width / cell) + 1,
    rows = Math.ceil(height / cell) + 1;
  // The sun in cloud space.
  const sunU = sunX + scrollX,
    sunV = sunY - cloudShift;
  const key = [gx0, gy0, cols, rows, cloudiness, color, glow, glowSize, Math.round(sunU / cell), Math.round(sunV / cell)].join("|");
  if (cloudLayers.has(key)) return { canvas: cloudLayers.get(key), offsetX, offsetY };

  const canvas = createCanvas(cols, rows);
  const g = canvas.getContext("2d");
  g.fillStyle = color;
  const uLeft = gx0 * cell,
    uRight = (gx0 + cols) * cell,
    vTop = gy0 * cell,
    vBottom = (gy0 + rows) * cell;
  const rowOf = (v) => Math.round(v / cell) - gy0;
  // Fills column i of the layer from v0 down to v1.
  const span = (i, v0, v1) => {
    const r0 = Math.max(0, rowOf(v0)),
      r1 = Math.min(rows, rowOf(v1));
    if (r1 > r0) g.fillRect(i, r0, 1, r1 - r0);
  };

  // The deck: from 30% it hangs in from the top on a lumpy underside of
  // overlapping round lobes, and lowers steadily until at 100% it is the
  // whole sky.
  const deck = cloudiness >= 1 ? Infinity : Math.max(0, (cloudiness - 0.3) / 0.7);
  const deckBottom = (u) => {
    const line = -40 + deck * (height * 0.6 + 40) + Math.sin(u * 0.0045 + 1) * 12;
    let bottom = -Infinity;
    for (let k = Math.floor(u / 36) - 1; k <= Math.floor(u / 36) + 1; k++) {
      const r = 22 + backdropNoise(k + 3) * 14;
      const d = u - (k * 36 + 18);
      if (Math.abs(d) < r)
        bottom = Math.max(bottom, line + (backdropNoise(k + 9) - 0.5) * 12 + Math.sqrt(r * r - d * d) * 0.8);
    }
    return bottom;
  };
  if (deck === Infinity) g.fillRect(0, 0, cols, rows);
  else if (deck > 0)
    for (let i = 0; i < cols; i++) span(i, vTop, deckBottom(uLeft + i * cell));

  if (deck !== Infinity) {
    const firstRow = Math.max(0, Math.ceil((64 - vBottom - 120) / CLOUD_ROW_SPACING));
    const lastRow = Math.max(0, Math.floor((64 - vTop + 120) / CLOUD_ROW_SPACING));
    // Thin high streaks come in with broken cloud and go once it is overcast.
    const streaks = cloudiness > 0.35 && cloudiness < 0.9 ? Math.sin((Math.PI * (cloudiness - 0.35)) / 0.55) : 0;
    for (let row = firstRow; row <= lastRow; row++) {
      // Higher rows are inside the deck once there is one.
      if (deck > 0 && row > 0) break;
      const rowV = 64 - row * CLOUD_ROW_SPACING;
      for (let k = Math.floor(uLeft / CLOUD_SLOT) - 1; k <= Math.ceil(uRight / CLOUD_SLOT); k++) {
        const n = (j) => backdropNoise(k * 7 + row * 131 + j * 17);
        // A bank: rounded puffs on one flat base. Up to 40% cover they grow
        // from small puffs into big banks; the deck does the rest.
        const w = (22 + 340 * Math.min(cloudiness, 0.4)) * (0.7 + 0.3 * n(1));
        const h = Math.max(12, w * (0.26 + 0.1 * n(2)));
        const left = k * CLOUD_SLOT + (CLOUD_SLOT - w) * (0.05 + 0.9 * n(3));
        // As the deck lowers it pushes the banks down ahead of it, so they
        // keep clear of its edge.
        const deckAbove = deck > 0 ? Math.max(deckBottom(left), deckBottom(left + w / 2), deckBottom(left + w)) : -Infinity;
        const base = Math.max(rowV + 40 + (n(4) - 0.5) * 56, deckAbove + 8 + h * 1.4);
        if (n(0) < 0.3 + Math.min(cloudiness, 0.4) * 1.2) {
          const count = 2 + Math.floor(w / 56);
          const puffs = [];
          for (let p = 0; p < count; p++) {
            // Biggest a little left of centre, smaller towards the ends.
            const middle = 1 - Math.abs((p + 0.5) / count - 0.4) * 1.6;
            const r = Math.max(8, h * (0.45 + 0.55 * backdropNoise(k * 13 + p + row * 7)) * (0.4 + 0.6 * middle));
            const c = left + r * 0.8 + (w - r * 1.6) * (count > 1 ? p / (count - 1) : 0.5);
            puffs.push({ c, r });
          }
          const first = puffs[0].c,
            last = puffs[puffs.length - 1].c;
          for (let i = 0; i < cols; i++) {
            const u = uLeft + i * cell;
            if (u < left - 4 || u > left + w + 4) continue;
            let top = u >= first && u <= last ? 8 : 0;
            // Each puff is a dome raised a little above the base.
            for (const { c, r } of puffs)
              if (Math.abs(u - c) < r) top = Math.max(top, r * 0.35 + Math.sqrt(r * r - (u - c) ** 2));
            if (top > 0) span(i, base - top, base);
          }
        }
        // A pair of long thin streaks, high above the banks.
        if (streaks && n(5) < streaks * 0.75) {
          const length = 40 + n(6) * 120;
          const u0 = k * CLOUD_SLOT + n(7) * (CLOUD_SLOT - length);
          const v = rowV - 4 - n(8) * 16;
          const r = rowOf(v),
            c0 = Math.round(u0 / cell) - gx0;
          g.fillRect(c0, r, Math.round(length / cell), 1);
          g.fillRect(c0 + 3, r + 1, Math.round((length * 0.6) / cell), 1);
        }
      }
    }
  }

  // The sun or moon lights the cloud in front of it: a pale disc painted
  // only over cloud. There is none when it is turned off.
  if (glow) {
    g.globalCompositeOperation = "source-atop";
    const sc = Math.round(sunU / cell) - gx0,
      sr = Math.round(sunV / cell) - gy0;
    for (const [size, amount] of [[13, 0.45], [9, 1]]) {
      const radius = Math.round(size * glowSize);
      g.fillStyle = mixHex(color, glow, amount);
      for (let dy = -radius; dy <= radius; dy++) {
        const reach = Math.floor(Math.sqrt(radius * radius - dy * dy));
        g.fillRect(sc - reach, sr + dy, reach * 2 + 1, 1);
      }
    }
  }

  cloudLayers.set(key, canvas);
  if (cloudLayers.size > 4) cloudLayers.delete(cloudLayers.keys().next().value);
  return { canvas, offsetX, offsetY };
}

// The colour set every look of the day starts from and overrides.
const BASE_TIME = {
  sky: "#eae9d9",
  skyTop: "#eae9d9",
  sun: "#f2c082",
  crater: null,
  far: "#b7c8b1",
  near: "#8ea997",
  tree: "#78977b",
  trunk: "#708b78",
  cloud: "#f8f7e9",
  stormCloud: "#bdc8c3",
  tint: null,
  glow: false,
  sunDrop: 0,
  sunScale: 1,
  light: 1,
  // How much the moon has taken over from the sun, and how bright the stars
  // are, 0…1.
  moon: 0,
  stars: 0,
  // How backdrop themes are shaded for this time of day.
  shade: null,
  shadeAmount: 0,
};

// The day's looks, the keyframes of time-of-day.js. The sun always stays on
// the right, where every prop is lit from. Only its height, size and colour
// change, which also lengthens shadows low in the sky; at night the moon
// takes its place.
const TIME_PRESETS = {
  // Just before sunrise: a pink horizon under a fading blue, the sun low and
  // the last stars going out. Lights are still on.
  dawn: {
    ...BASE_TIME,
    skyTop: "#8a95b6",
    sky: "#efc3ae",
    sun: "#f5b07e",
    far: "#a6a3b3",
    near: "#8a8d9b",
    tree: "#7e8291",
    trunk: "#777b8b",
    cloud: "#f1c6b8",
    stormCloud: "#b2b0ba",
    tint: "#f0dde0",
    glow: true,
    sunDrop: 110,
    sunScale: 1.2,
    light: 0.62,
    stars: 0.2,
    shade: "#8c7690",
    shadeAmount: 0.26,
  },
  morning: {
    ...BASE_TIME,
    skyTop: "#cfdde0",
    sky: "#f3e2cf",
    sun: "#f7d9a0",
    far: "#bcc6b8",
    near: "#98ab9c",
    tree: "#83998a",
    trunk: "#7a9082",
    cloud: "#fbefe2",
    stormCloud: "#c9ccc4",
    tint: "#fff3e6",
    sunDrop: 55,
    light: 0.85,
    shade: "#f0c8a0",
    shadeAmount: 0.12,
  },
  noon: { ...BASE_TIME, skyTop: "#dde5e0" },
  evening: {
    ...BASE_TIME,
    skyTop: "#9fa3c0",
    sky: "#f0b98e",
    sun: "#ee8a52",
    far: "#b49a95",
    near: "#8f8488",
    tree: "#7e7580",
    trunk: "#766d78",
    cloud: "#f3cdb0",
    stormCloud: "#b3a9ae",
    tint: "#f4d2bc",
    glow: true,
    sunDrop: 70,
    sunScale: 1.25,
    light: 0.75,
    shade: "#806a7c",
    shadeAmount: 0.42,
  },
  // After sunset: the blue hour, the sun's last glow on the horizon and the
  // first stars out.
  dusk: {
    ...BASE_TIME,
    skyTop: "#2f3a5e",
    sky: "#9a7690",
    sun: "#e2754c",
    far: "#615d76",
    near: "#4f4f66",
    tree: "#46455d",
    trunk: "#403f56",
    cloud: "#86708a",
    stormCloud: "#5d5b74",
    tint: "#bcaccc",
    glow: true,
    sunDrop: 135,
    sunScale: 1.3,
    light: 0.45,
    stars: 0.45,
    shade: "#3d3654",
    shadeAmount: 0.58,
  },
  night: {
    ...BASE_TIME,
    skyTop: "#141d33",
    sky: "#2b3a5c",
    sun: "#e6e8d6",
    crater: "#c3c7b6",
    far: "#34425f",
    near: "#2a3650",
    tree: "#253049",
    trunk: "#222c43",
    cloud: "#46557a",
    stormCloud: "#39456a",
    tint: "#98a6d4",
    glow: true,
    light: 0.25,
    moon: 1,
    stars: 1,
    shade: "#1e2942",
    shadeAmount: 0.7,
  },
};

// Prop light timing, shared by the prop art and the lighting pass so the
// glass and the light it casts change together. `time` 0 keeps them steady.
const lightNoise = (x, n) => {
  const s = Math.sin(n * 127.1 + x * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A lantern's slow, stepped flicker, 0.88…1. */
export function lanternFlicker(x, time) {
  return time ? [1, 0.92, 0.97, 0.88][Math.floor(time * 6 + lightNoise(x, 3) * 4) % 4] : 1;
}
/** Glowing mushrooms' gentle pulse, 0.7…1. */
export function mushroomPulse(x, time) {
  return time ? 0.85 + (0.15 * Math.round(Math.sin(time * 1.6 + x) * 2)) / 2 : 1;
}
/** Whether a crane's warning light is lit; they blink out of step. */
export function craneLightOn(index, time) {
  return !time || (time * 0.8 + index * 0.37) % 1 <= 0.55;
}

// A look between two others, `t` of the way from `a` to `b`: colours and
// numbers blend, and the lights are on if they are on in the nearer one. A
// colour only one of them has (the moon's craters, a shade) is kept, and no
// tint blends as white, which leaves the scene as it is.
function blendTimes(a, b, t) {
  const color = (x, y) => (x && y ? mixHex(x, y, t) : x || y);
  const tint = a.tint || b.tint ? mixHex(a.tint || "#ffffff", b.tint || "#ffffff", t) : null;
  const number = (key) => a[key] + (b[key] - a[key]) * t;
  return {
    ...a,
    sky: color(a.sky, b.sky),
    skyTop: color(a.skyTop, b.skyTop),
    sun: color(a.sun, b.sun),
    crater: color(a.crater, b.crater),
    far: color(a.far, b.far),
    near: color(a.near, b.near),
    tree: color(a.tree, b.tree),
    trunk: color(a.trunk, b.trunk),
    cloud: color(a.cloud, b.cloud),
    stormCloud: color(a.stormCloud, b.stormCloud),
    tint,
    glow: t < 0.5 ? a.glow : b.glow,
    sunDrop: number("sunDrop"),
    sunScale: number("sunScale"),
    light: number("light"),
    moon: number("moon"),
    stars: number("stars"),
    shade: color(a.shade, b.shade),
    shadeAmount: number("shadeAmount"),
  };
}

// Each hour's look, blended once.
const hourPalettes = new Map();

/**
 * The look of the sky, the hills and the light at an hour of the day (see
 * time-of-day.js): exactly a keyframe's look on its hour, a blend of the two
 * either side of it in between.
 */
export function hourPalette(hour) {
  const h = normalizeHour(hour);
  let palette = hourPalettes.get(h);
  if (!palette) {
    const { from, to, t } = dayBlend(h);
    palette = t ? blendTimes(TIME_PRESETS[from], TIME_PRESETS[to], t) : TIME_PRESETS[from];
    hourPalettes.set(h, palette);
  }
  return palette;
}

/** The sky, hill and light colours a trail is drawn with, for its hour. */
export function timeOfDayPalette(trail = {}) {
  return hourPalette(trail.timeOfDay);
}

/** A trail's fog, 0…1. */
export function fogAmount(weather = {}) {
  return Math.max(0, Math.min(1, Number(weather.fog) || 0));
}

/** The colour of a trail's fog: between its horizon and its clouds. */
export function fogColor(trail = {}) {
  const time = timeOfDayPalette(trail);
  return mixHex(time.sky, time.cloud, 0.65);
}

function mixHex(a, b, t) {
  const ca = parseColor(a),
    cb = parseColor(b);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(ca[i] + (cb[i] - ca[i]) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export const BACKDROPS = ["hills", "mountains", "forest", "desert", "city"];

// Daylight colours of each theme; the time of day shades them. Hills use the
// time of day's own hill colours, so they look exactly as before.
const BACKDROP_COLORS = {
  mountains: { far: "#a3b1b8", accent: "#eef1ea", near: "#8ea596", tree: "#6c8775" },
  forest: { far: "#9db2a1", near: "#71907a", tree: "#5a7a63" },
  desert: { far: "#d0ad88", accent: "#bf9873", near: "#dcc59f", tree: "#8c9c6b" },
  city: { far: "#9eaab0", near: "#7d8c90", tree: "#6f7d82", window: "#b9c7ca" },
};

function backdropColors(trail, time) {
  const theme = BACKDROP_COLORS[trail.backdrop];
  if (!theme)
    return {
      far: time.far,
      near: time.near,
      tree: time.tree,
      trunk: time.trunk,
      accent: null,
    };
  // Shade for the time of day, then fade toward the sky with distance.
  const grade = (color, haze) =>
    mixHex(
      time.shade ? mixHex(color, time.shade, time.shadeAmount) : color,
      time.sky,
      haze,
    );
  return {
    far: grade(theme.far, 0.3),
    // Faces turned away from the sun (mountains).
    farShade: grade(mixHex(theme.far, "#4f5d66", 0.22), 0.3),
    accent: theme.accent ? grade(theme.accent, 0.3) : null,
    accentShade: theme.accent ? grade(mixHex(theme.accent, "#9aa8b4", 0.35), 0.3) : null,
    near: grade(theme.near, 0.1),
    tree: grade(theme.tree, 0.1),
    trunk: null,
    // City windows: glass by day, and lit at evening and night.
    window: theme.window ? grade(theme.window, 0.1) : null,
    lit: theme.window && time.glow ? "#ffeaa8" : null,
  };
}

// A fixed 0…1 value per integer, so silhouettes never move between strips.
const backdropNoise = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const hillShape = (base, amp, frequency) => (x) =>
  base + Math.sin(x * frequency + 1.7) * amp + Math.sin(x * frequency * 2.1) * 10;
const groundAt = (shape, x) => Math.round(shape(x) / 4) * 4;

// Calls `place(x, n0, n1)` roughly every `spacing` units across a strip.
function scatter(left, right, spacing, jitter, place) {
  for (
    let i = Math.floor((left - 60) / spacing);
    i <= Math.ceil((right + 60) / spacing);
    i++
  ) {
    const x = Math.round((i * spacing + (backdropNoise(i) - 0.5) * jitter) / 4) * 4;
    place(x, backdropNoise(i + 17), backdropNoise(i + 41));
  }
}

// A pine silhouette on the 4-unit grid, centred on the column x…x+4, with a
// saw-toothed edge of three tiers.
function backdropPine(tools, x, groundY, height, color) {
  const rows = Math.max(3, Math.round(height / 4));
  const tierRows = Math.max(2, Math.round(rows / 3));
  const top = groundY - rows * 4;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const saw = (r % tierRows) / tierRows;
    const k = Math.round(t * height * 0.055 + saw * 1.2);
    tools.pixelRect(x - 4 * k, top + r * 4, 8 * k + 4, 4, color, 4);
  }
  tools.pixelRect(x, groundY - 4, 4, 8, color, 4);
}

// A saguaro silhouette with one low arm on the left and a higher one on the right.
function backdropCactus(tools, x, groundY, height, color) {
  const h = Math.round(height / 4) * 4;
  const q = (f) => Math.max(4, Math.round((h * f) / 4) * 4);
  tools.pixelRect(x - 4, groundY - h, 12, h + 4, color, 4);
  const leftArm = groundY - q(0.45);
  tools.pixelRect(x - 12, leftArm, 8, 4, color, 4);
  tools.pixelRect(x - 12, leftArm - q(0.3), 4, q(0.3), color, 4);
  const rightArm = groundY - q(0.62);
  tools.pixelRect(x + 8, rightArm, 8, 4, color, 4);
  tools.pixelRect(x + 12, rightArm - q(0.25), 4, q(0.25), color, 4);
}

/**
 * The two parallax layers of a theme. Each has a ground `shape(x)`, an
 * optional `column` hook for per-column detail (snow, rock bands) and an
 * optional `decorate` for silhouettes. `key` identifies its cached strips.
 */
function backdropLayers(theme, c) {
  const key = (i) =>
    `${theme}|${i}|${c.far}|${c.farShade}|${c.near}|${c.tree}|${c.trunk}|${c.accent}|${c.window}|${c.lit}`;

  if (theme === "mountains") {
    const base = 300,
      spacing = 210;
    // Separate peaks, each with its own height and width, fixed per index.
    const peakAt = (k) => ({
      c: k * spacing + (backdropNoise(k) - 0.5) * 90,
      h: 90 + backdropNoise(k + 7) * 80,
      w: 110 + backdropNoise(k + 13) * 70,
    });
    // The peak that shapes this x, and how high above the base it lifts it.
    const mountainAt = (x) => {
      const k0 = Math.floor(x / spacing);
      let peak = null,
        lift = 0;
      for (let k = k0 - 2; k <= k0 + 2; k++) {
        const p = peakAt(k);
        const l = p.h * (1 - Math.abs(x - p.c) / p.w);
        if (l > lift) {
          lift = l;
          peak = p;
        }
      }
      return { peak, lift };
    };
    const near = (x) =>
      262 + Math.sin(x * 0.013 + 0.5) * 22 + Math.sin(x * 0.031) * 8;
    return [
      {
        key: key(0),
        color: c.far,
        parallax: 0.12,
        shape: (x) => base - mountainAt(x).lift,
        column(context, x, y, step) {
          const { peak } = mountainAt(x);
          if (!peak) return;
          // The sun is on the right, so faces left of a summit are in shade.
          const shaded = x < peak.c;
          if (shaded) {
            context.fillStyle = c.farShade;
            context.fillRect(x, y, step, 400);
          }
          // Each peak's cap reaches about a quarter of the way down from its summit.
          const summit = base - peak.h;
          const jag =
            (backdropNoise(Math.floor(x / step) * 3 + 1) - 0.5) * 8;
          const snowLine = Math.round((summit + peak.h * 0.28 + jag) / 4) * 4;
          if (y >= snowLine) return;
          context.fillStyle = shaded ? c.accentShade : c.accent;
          context.fillRect(x, y, step, snowLine - y);
        },
      },
      {
        key: key(1),
        color: c.near,
        parallax: 0.27,
        shape: near,
        decorate: (tools, left, right) =>
          scatter(left, right, 46, 20, (x, n0, n1) => {
            if (n0 > 0.25)
              backdropPine(
                tools,
                x,
                groundAt(near, x) + 4,
                20 + n1 * 24,
                c.tree,
              );
          }),
      },
    ];
  }

  if (theme === "city") {
    const farSlot = 36,
      nearSlot = 52,
      farBase = 292,
      nearBase = 304;
    const q = (value) => Math.round(value / 4) * 4;
    // Mostly mid-height towers, with the odd very tall one.
    const farHeight = (k) => {
      const n = backdropNoise(k * 3 + 5);
      return q(40 + n * n * 140);
    };
    const nearHeight = (k) => q(28 + backdropNoise(k * 5 + 2) * 64);
    const far = (x) => {
      const k = Math.floor(x / farSlot),
        local = x - k * farSlot;
      const h = farHeight(k);
      // Tall towers step in at the top.
      const setback = h > 110 && (local < 8 || local >= farSlot - 8) ? 12 : 0;
      return farBase - h + setback;
    };
    const near = (x) => {
      const k = Math.floor(x / nearSlot),
        local = x - k * nearSlot;
      // A narrow alley between buildings.
      if (local < 4 || local >= nearSlot - 4) return nearBase;
      return nearBase - nearHeight(k);
    };
    return [
      {
        key: key(0),
        color: c.far,
        parallax: 0.14,
        step: 4,
        shape: far,
        // After dark, a few windows glow on the distant towers.
        column(context, x, y, step) {
          if (!c.lit) return;
          const k = Math.floor(x / farSlot),
            local = x - k * farSlot;
          if (
            local < 8 ||
            local >= farSlot - 8 ||
            (local - 8) % 8 >= 4
          )
            return;
          context.fillStyle = c.lit;
          for (let wy = y + 12; wy <= farBase - 12; wy += 16)
            if (backdropNoise(k * 97 + local * 13 + wy) > 0.82)
              context.fillRect(x, wy, step, 4);
        },
        decorate(tools, left, right) {
          // Antennas on the tallest towers.
          for (
            let k = Math.floor(left / farSlot) - 1;
            k <= Math.ceil(right / farSlot);
            k++
          ) {
            const h = farHeight(k);
            if (h < 130) continue;
            const x = k * farSlot + farSlot / 2 - 2;
            tools.pixelRect(x, farBase - h - 20, 4, 20, c.far, 4);
          }
        },
      },
      {
        key: key(1),
        color: c.near,
        parallax: 0.3,
        step: 4,
        shape: near,
        column(context, x, y, step) {
          const k = Math.floor(x / nearSlot),
            local = x - k * nearSlot;
          if (
            local < 8 ||
            local >= nearSlot - 8 ||
            (local - 8) % 8 >= 4
          )
            return;
          for (let wy = y + 8; wy <= nearBase - 12; wy += 12) {
            const on =
              c.lit &&
              backdropNoise(
                k * 131 + Math.floor(local / 8) * 17 + wy,
              ) > 0.45;
            context.fillStyle = on ? c.lit : c.window;
            context.fillRect(x, wy, step, 4);
          }
        },
      },
    ];
  }

  if (theme === "forest") {
    const cone = (x) => {
      const p = 36,
        k = Math.floor(x / p),
        t = (x - k * p) / p;
      return (1 - Math.abs(t * 2 - 1)) * (10 + backdropNoise(k) * 16);
    };
    const near = (x) => 270 + Math.sin(x * 0.011 + 2) * 12;
    return [
      {
        key: key(0),
        color: c.far,
        parallax: 0.15,
        step: 4,
        shape: (x) => 238 + Math.sin(x * 0.007) * 16 - cone(x),
      },
      {
        key: key(1),
        color: c.near,
        parallax: 0.3,
        shape: near,
        decorate: (tools, left, right) =>
          scatter(left, right, 26, 14, (x, n0, n1) => {
            if (n0 > 0.1)
              backdropPine(
                tools,
                x,
                groundAt(near, x) + 4,
                30 + n1 * 34,
                c.tree,
              );
          }),
      },
    ];
  }

  if (theme === "desert") {
    // 0 on the plain, 1 on a flat top, with steep sides between.
    const mesa = (x, f, phase) => {
      const m = Math.sin(x * f + phase) + Math.sin(x * f * 2.7) * 0.35;
      return m > 0.6 ? 1 : m > 0.42 ? (m - 0.42) / 0.18 : 0;
    };
    const bands = [188, 204, 228];
    const near = (x) =>
      278 + Math.sin(x * 0.009) * 14 + Math.sin(x * 0.018 + 1) * 5;
    return [
      {
        key: key(0),
        color: c.far,
        parallax: 0.14,
        shape: (x) => {
          const lift = Math.max(
            86 * mesa(x, 0.0045, 0.8),
            44 * mesa(x + 400, 0.0086, 2.1),
          );
          return 262 - lift + (lift ? 0 : Math.sin(x * 0.02) * 5);
        },
        // Level rock bands across the mesas, the same height everywhere.
        column(context, x, y, step) {
          context.fillStyle = c.accent;
          for (const band of bands)
            if (y < band) context.fillRect(x, band, step, 4);
        },
      },
      {
        key: key(1),
        color: c.near,
        parallax: 0.3,
        shape: near,
        decorate: (tools, left, right) =>
          scatter(left, right, 150, 80, (x, n0, n1) => {
            if (n0 > 0.35)
              backdropCactus(
                tools,
                x,
                groundAt(near, x) + 4,
                22 + n1 * 16,
                c.tree,
              );
          }),
      },
    ];
  }

  // Hills: the original layers and round trees, placed irregularly. Trees
  // are 48 wide and at least 70 apart, so they never crowd each other.
  const near = hillShape(247, 24, 0.015);
  return [
    {
      key: key(0),
      color: c.far,
      parallax: 0.16,
      shape: hillShape(201, 37, 0.009),
    },
    {
      key: key(1),
      color: c.near,
      parallax: 0.29,
      shape: near,
      decorate: (tools, left, right) =>
        scatter(left, right, 100, 30, (x, n0) => {
          if (n0 < 0.15) return;
          // Planted a little into the hill, like the forest pines.
          const y = groundAt(near, x) + 8;
          tools.pixelRect(x - 2, y - 28, 4, 28, c.trunk, 4);
          tools.drawPixelDisc(x, y - 34, 14, c.tree, 4);
          tools.drawPixelDisc(x - 10, y - 29, 10, c.tree, 4);
          tools.drawPixelDisc(x + 10, y - 28, 10, c.tree, 4);
        }),
    },
  ];
}

export function sunLight({
  width,
  cameraX = 0,
  cameraY = 0,
  weather = {},
  timeOfDay,
} = {}) {
  const time = hourPalette(timeOfDay);
  const sunshine = Math.max(0, Math.min(1, weather.sun ?? 1));
  const cloudiness = Math.max(0, Math.min(1, weather.clouds ?? 0.35));
  return {
    x: width * 0.77 - cameraX * 0.015,
    y: 85 + time.sunDrop - Math.max(cameraY, -SUN_CLIMB_LIMIT) * 0.08,
    sunshine,
    strength: sunshine * (1 - cloudiness * 0.55) * time.light,
  };
}

export function sunShadowOffset({
  bikeX,
  bikeY,
  sunX,
  sunY,
  height = 0,
  strength = 1,
}) {
  const slant = (sunX - bikeX) / Math.max(Math.abs(sunY - bikeY), 48);
  const reach = 10 + Math.max(0, height) * 0.05;
  const offset = -slant * strength * reach;
  if (!offset) return 0;
  return Math.max(-14, Math.min(14, offset));
}

// Props that attach to a wall face or cliff edge rather than stand on the ground.
export const WALL_PROPS = new Set(["vines", "roots", "moss", "ivy"]);
// Graffiti is painted onto the rock itself rather than stood in front of it or
// behind it, so it is drawn just after the terrain whatever its layer.
export const PAINTED_PROPS = new Set(["graffiti", "tutorial-lean", "tutorial-lean-forward", "tutorial-flip", "tutorial-rotate", "tutorial-light", "tutorial-restart", "tutorial-ledge", "tutorial-gas", "tutorial-brake", "tally-marks"]);
// The art of each painted prop: its local bounds and how to draw it.
const PAINTED_ART = {
  graffiti: { bounds: GRAFFITI_BOUNDS, draw: drawGraffiti },
  "tutorial-lean": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLean },
  "tutorial-flip": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialFlip },
  "tutorial-rotate": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialRotate },
  "tutorial-restart": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialRestart },
  "tutorial-ledge": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLedge },
  "tutorial-gas": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialGas },
  "tutorial-brake": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialBrake },
  "tutorial-light": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLight },
  "tutorial-lean-forward": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLeanForward },
  "tally-marks": { bounds: TALLY_BOUNDS, draw: drawTallyMarks },
};
/** A painted prop's local bounds, [left, top, right, bottom]. */
export const paintedBounds = (type) => (PAINTED_ART[type] ?? PAINTED_ART.graffiti).bounds;
// Props whose `text` the author sets: signs, banners and pit boards.
export const TEXT_PROPS = new Set(["sign", "banner", "pit-board", "stall"]);
// Props that print text or numbers, which would read backwards mirrored.
const LETTERED_PROPS = new Set(["banner", "pit-board", "halfway-flag", "wanted-poster"]);
// Props that hang from a cave ceiling. Each looks up from its anchor for the
// nearest roof; see propWallFit.
export const CEILING_PROPS = new Set([
  "hanging-roots",
  "stalactites",
  "drip",
  "lantern",
  "bats",
  "icicles",
  "spiderweb",
  "cobweb",
  "spider",
  "cocoon",
  "portcullis",
  "hanging-chains",
  "gibbet",
]);
// Cave props that fit themselves to the rock around them: support beams and
// dungeon bars reach up to the roof, and a mine cart's rails run along the
// floor to the walls.
const CAVE_FITTED_PROPS = new Set([...CEILING_PROPS, "beams", "dungeon-bars", "minecart"]);
// Signs, banners, pit boards, the halfway flag and wanted posters would mirror their text,
// as would graffiti; wall props already turn to face
// the wall, and ceiling props and beams are symmetric or lit from the right.
export const canFlip = (type) =>
  type !== "sign" &&
  !LETTERED_PROPS.has(type) &&
  type !== "beams" &&
  type !== "dungeon-bars" &&
  !WALL_PROPS.has(type) &&
  !PAINTED_PROPS.has(type) &&
  !CEILING_PROPS.has(type);
// Props that fit themselves to the world or move through it keep their own
// angle: ceiling, cave-fitted and water props, and the animals and effects
// that wander, fly or shimmer, and the ski lift, whose chair hangs plumb, and
// moss, which lies along whatever surface it finds. Other wall props and
// graffiti turn about their anchor.
const UNROTATABLE_PROPS = new Set(["squirrel", "corgi", "rabbit", "tumbleweed", "vulture", "bird", "heat-haze", "ski-lift", "smoke", "moss"]);
export const canRotate = (type) =>
  !CAVE_FITTED_PROPS.has(type) &&
  !WATER_PROPS.has(type) &&
  !UNROTATABLE_PROPS.has(type);
/** A prop's hand-set rotation in radians, clockwise; 0 where it can't turn. */
export function propRotation(prop) {
  const degrees = Number(prop?.rotation);
  return degrees && Number.isFinite(degrees) && canRotate(prop.type)
    ? (degrees * Math.PI) / 180
    : 0;
}
/**
 * Where a point of a prop's art, given in its local coordinates (x to the
 * right, y down from the anchor at `y`), lands in the world once the prop is
 * flipped and rotated.
 */
export function propPoint(prop, y, localX, localY) {
  const lx = prop.flip && canFlip(prop.type) ? -localX : localX;
  const angle = propRotation(prop);
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: prop.x + lx * c - localY * s, y: y + lx * s + localY * c };
}
// Longest vines can hang, in world units.
export const VINE_MAX = 140;
const wallFits = new WeakMap();

/**
 * Which side a wall prop's rock is on (-1 left, 1 right, 0 none found) and,
 * for vines, how far they can hang before reaching the ground below.
 * Cached per prop until it moves or the terrain changes.
 */
export function propWallFit(trail, prop) {
  if (WATER_PROPS.has(prop.type)) return waterFit(trail, prop);
  if (prop.type === "squirrel") return squirrelFit(trail, prop);
  if (prop.type === "corgi") return corgiFit(trail, prop);
  if (prop.type === "rabbit") return rabbitFit(trail, prop);
  if (prop.type === "tumbleweed") return tumbleweedFit(trail, prop);
  // A vulture with no y of its own circles high over the ground.
  if (prop.type === "vulture") return { centre: Number.isFinite(prop.y) ? 0 : -VULTURE_HEIGHT };
  if (!WALL_PROPS.has(prop.type) && !CAVE_FITTED_PROPS.has(prop.type)) return null;
  const geometry = terrainGeometry(trail);
  const cached = wallFits.get(prop);
  if (cached && cached.x === prop.x && cached.y === prop.y
    && cached.type === prop.type && cached.geometry === geometry) return cached.fit;
  if (CAVE_FITTED_PROPS.has(prop.type)) {
    const fit = caveFit(trail, prop);
    wallFits.set(prop, { x: prop.x, y: prop.y, type: prop.type, geometry, fit });
    return fit;
  }

  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  const solidAt = (px, py) => terrainCollisionsAt(trail, px, py, 1).length > 0;
  // Vines sit on a cliff's top corner, so look a little below it for the
  // face; ivy grows up from the foot of one, so look a little above.
  const sampleY = y + (prop.type === "vines" ? 12 : prop.type === "ivy" ? -12 : 0);
  let side = 0;
  for (const reach of [4, 8, 14, 22]) {
    const left = solidAt(prop.x - reach, sampleY);
    const right = solidAt(prop.x + reach, sampleY);
    if (left !== right) {
      side = left ? -1 : 1;
      break;
    }
  }
  let drop = 0;
  if (prop.type === "vines") {
    // Measured just out in the air, beside the face.
    const airX = prop.x - side * 6;
    for (let d = 8; d <= VINE_MAX; d += 4) {
      if (solidAt(airX, y + d)) break;
      drop = d;
    }
  }
  // How far the face is from the anchor, so wall props sit on it wherever you click.
  let face = 0;
  if (side) {
    if (solidAt(prop.x, sampleY)) {
      // Clicked inside the rock: step out to the surface.
      for (let d = 2; d <= 22 && solidAt(prop.x - side * d, sampleY); d += 2) face = -side * d;
    } else {
      // Clicked in the air: step in until the rock starts.
      for (let d = 2; d <= 22; d += 2) {
        if (solidAt(prop.x + side * d, sampleY)) { face = side * (d - 2); break; }
      }
    }
  }
  // How far ivy can climb: up the face, while there is rock behind it and
  // open air in front.
  let rise = 0;
  if (prop.type === "ivy" && side) {
    const rockX = prop.x + face + side * 4, airX = prop.x + face - side * 4;
    for (let d = 4; d <= IVY.max; d += 4) {
      if (!solidAt(rockX, y - d) || solidAt(airX, y - d)) break;
      rise = d;
    }
  }
  const fit = { side, drop, face, rise };
  // Moss lies along the surface whichever way it faces: a wall, a slope, a
  // top or the underside of an overhang.
  if (prop.type === "moss") Object.assign(fit, mossSurface(solidAt, prop.x, y));
  wallFits.set(prop, { x: prop.x, y: prop.y, type: prop.type, geometry, fit });
  return fit;
}

/**
 * Which way the surface near (x, y) faces and where it is, for moss:
 * `normal`, a unit vector from the rock out into the air, found from which
 * points of a ring around the anchor are open air, trying wider rings until
 * one has both rock and air; and `at`, the point on the surface along that
 * normal, as an offset from the anchor. Straight up from the anchor with no
 * rock near it.
 * @param {(x: number, y: number) => boolean} solidAt
 */
export function mossSurface(solidAt, x, y) {
  for (const radius of [6, 10, 16, 24]) {
    let sx = 0, sy = 0, air = 0;
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const angle = (k / steps) * Math.PI * 2;
      if (solidAt(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) continue;
      air++;
      sx += Math.cos(angle);
      sy += Math.sin(angle);
    }
    const length = Math.hypot(sx, sy);
    if (!air || air === steps || length < 0.01) continue;
    const normal = [sx / length, sy / length];
    // Step along the normal to the surface: out of the rock, or back to it.
    const inside = solidAt(x, y);
    let reach = 0;
    for (let d = 2; d <= 32; d += 2) {
      const solid = solidAt(x + (inside ? 1 : -1) * normal[0] * d, y + (inside ? 1 : -1) * normal[1] * d);
      if (solid !== inside) {
        reach = (inside ? 1 : -1) * (d - 1);
        break;
      }
    }
    return { normal, at: [normal[0] * reach, normal[1] * reach] };
  }
  return { normal: [0, -1], at: [0, 0] };
}

// How far above its anchor a ceiling prop looks for the roof.
export const CEILING_REACH = 160;
// A lantern placed with no y hangs this far below the roof of the first cave.
const LANTERN_DROP = 44;
// How tall support beams may get, and how far a mine cart's rails may run
// either side before they end in a buffer stop.
export const BEAM_REACH = 220;
export const RAIL_REACH = 120;
const BEAM_HEIGHT = 96;
const BEAM_PACKING = 40;

/** Ceiling-prop colours taken from the rock they grow out of. */
function rockColors(material) {
  const m = terrainMaterials[material] || terrainMaterials.concrete;
  return { dark: m.layers[m.layers.length - 1], base: m.fill, light: m.layers[0] };
}

/**
 * The roof above a point: the nearest ceiling at or just below `y` within
 * CEILING_REACH, or, for a prop with no y of its own, the roof of the first cave
 * under the surface. Returns its offset from `y`, the free drop from it to the
 * floor below (null when nothing is below), and its material.
 */
function roofAbove(trail, x, y, explicit, reach = CEILING_REACH) {
  const surfaces = terrainSurfacesAt(trail, x);
  let index = -1;
  surfaces.forEach((surface, i) => {
    if (!surface.entering && surface.y <= y + 12 && surface.y >= y - reach) index = i;
  });
  if (index < 0 && !explicit)
    index = surfaces.findIndex(
      (surface, i) => !surface.entering && surface.y > y && surfaces[i + 1]?.entering,
    );
  if (index < 0) return null;
  const roof = surfaces[index];
  const floor = surfaces[index + 1];
  return {
    ceiling: roof.y - y,
    drop: floor ? floor.y - roof.y : null,
    material: roof.material,
  };
}

function caveFit(trail, prop) {
  const explicit = Number.isFinite(prop.y);
  const y = explicit ? prop.y : terrainAt(trail, prop.x).y;
  if (CEILING_PROPS.has(prop.type)) {
    const roof = roofAbove(trail, prop.x, y, explicit);
    const fit = {
      ceiling: roof ? roof.ceiling : null,
      drop: roof ? roof.drop : null,
      colors: rockColors(roof?.material),
      body: 0,
    };
    // A lantern with no y hangs a little below the roof of the cave under it.
    if (prop.type === "lantern" && roof && roof.ceiling > 0)
      fit.body = roof.ceiling + Math.min(LANTERN_DROP, Math.max(24, (roof.drop ?? 0) - 24));
    return fit;
  }
  if (prop.type === "beams") {
    const roofs = [];
    for (let local = -BEAM_HALF; local < BEAM_HALF; local += 2) {
      const roof = roofAbove(trail, prop.x + local + 1, y - 8, true, BEAM_REACH);
      roofs.push(roof ? roof.ceiling - 8 : null);
    }
    return { roofs };
  }
  if (prop.type === "dungeon-bars") {
    // The roof over each bar, from just above the floor.
    const roofs = BAR_XS.map((local) => {
      const roof = roofAbove(trail, prop.x + local + 1, y - 8, true, BARS.reach);
      return roof ? roof.ceiling - 8 : null;
    });
    return { roofs };
  }
  // Mine cart: follow the floor out each way until a wall, a drop or the
  // end of the track.
  const solid = (px, py) => terrainCollisionsAt(trail, px, py, 1).length > 0;
  const run = (dir) => {
    let floorY = y;
    for (let d = 2; d <= RAIL_REACH; d += 2) {
      const px = prop.x + dir * d;
      if (solid(px, floorY - 10)) return { reach: Math.max(0, d - 4), wall: true };
      const floor = terrainAt(trail, px, floorY - 16);
      if (!floor.solid || Math.abs(floor.y - floorY) > 12) return { reach: d - 2, wall: false };
      floorY = floor.y;
    }
    return { reach: RAIL_REACH, wall: false };
  };
  const left = run(-1);
  const right = run(1);
  return { left: left.reach, right: right.reach, leftWall: left.wall, rightWall: right.wall };
}

const waterFits = new WeakMap();

/**
 * Where a water prop sits in the body it belongs to, as offsets from its
 * anchor: `surface` for floating props, `swim` and the open water `left` and
 * `right` of it for a fish, and the `bed` it grows from, how tall it grows and
 * the `floor` under it for seaweed and reeds. Cached per prop until it, the
 * terrain or the water changes.
 */
function waterFit(trail, prop) {
  const geometry = terrainGeometry(trail);
  const bodies = waterBodies(trail);
  const water = bodies.map((b) => `${b.x},${b.y},${b.width},${b.depth}`).join(";");
  const cached = waterFits.get(prop);
  if (cached && cached.x === prop.x && cached.y === prop.y && cached.type === prop.type
    && cached.geometry === geometry && cached.water === water) return cached.fit;
  const fit = fitInWater(trail, prop, bodies);
  waterFits.set(prop, { x: prop.x, y: prop.y, type: prop.type, geometry, water, fit });
  return fit;
}

// Seaweed and reeds follow the bed this far either side of their stem.
const BED_HALF = 14;

function fitInWater(trail, prop, bodies) {
  const explicit = Number.isFinite(prop.y);
  const y = explicit ? prop.y : terrainAt(trail, prop.x).y;
  const body = waterPropBody(bodies, prop.type, prop.x, y);
  if (SURFACE_PROPS.has(prop.type)) return { surface: body ? body.y - y : null };
  if (prop.type === "fish") {
    if (!body) return { swim: 0, left: 0, right: 0 };
    const swimY = fishSwimY(body, y, explicit);
    const open = (px) =>
      px >= body.x + FISH_HALF &&
      px <= body.x + body.width - FISH_HALF &&
      !terrainCollisionsAt(trail, px, swimY, FISH_HALF).length;
    const run = (dir) => {
      let reach = 0;
      for (let d = 4; d <= FISH_RANGE && open(prop.x + dir * d); d += 4) reach = d;
      return reach;
    };
    // How far it can dive from its depth: to just above the bed or the
    // bottom of the body.
    const floor = terrainAt(trail, prop.x, swimY);
    const bottom = Math.min(body.y + body.depth, floor.solid ? floor.y : Infinity);
    return { swim: swimY - y, left: run(-1), right: run(1), down: Math.max(0, bottom - FISH_CLEARANCE - swimY) };
  }
  const tall = prop.type === "reeds" ? reedHeight : seaweedHeight;
  if (!body) return { bed: 0, height: tall(null), floor: null, rise: null };
  // Placed anywhere in the water, it grows from the bed below.
  const bottom = body.y + body.depth;
  let bedY = y;
  if (explicit) {
    const floor = terrainAt(trail, prop.x, y);
    bedY = floor.solid && floor.y >= y && floor.y <= bottom + BED_HALF ? floor.y : Math.max(y, bottom);
  }
  const floor = [];
  for (let local = -BED_HALF; local <= BED_HALF; local += 2) {
    const ground = terrainAt(trail, prop.x + local, bedY - BED_HALF);
    floor.push(ground.solid && Math.abs(ground.y - bedY) <= BED_HALF ? ground.y - bedY : 0);
  }
  // `rise` is how far the surface is above the bed, for bubbles.
  return { bed: bedY - y, height: tall(bedY - body.y), floor, rise: bedY - body.y };
}

/**
 * The ground an animal can walk along from (x, y) in `dir` (1 right, -1 left):
 * its y every `step` units, relative to y and starting with 0, up to a wall, a
 * drop (any step bigger than `stepUp`) or `range`.
 */
function traceGround(trail, x, y, dir, step, range, stepUp) {
  const path = [0];
  let groundY = y;
  for (let d = step; d <= range; d += step) {
    const ground = terrainAt(trail, x + dir * d, groundY - stepUp);
    if (!ground.solid || Math.abs(ground.y - groundY) > stepUp) break;
    groundY = ground.y;
    path.push(groundY - y);
  }
  return path;
}

const walkFits = new WeakMap();

/**
 * The ground an animal can walk along `left` and `right` of its anchor, one
 * offset every `step` up to `range`, a wall or a drop (see traceGround), and
 * the `material` it stands on at its anchor. Cached per prop until it or the
 * terrain changes.
 */
function walkFit(trail, prop, step, range, stepUp) {
  const geometry = terrainGeometry(trail);
  const cached = walkFits.get(prop);
  if (cached && cached.x === prop.x && cached.y === prop.y && cached.geometry === geometry) return cached.fit;
  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  const trace = (dir) => traceGround(trail, prop.x, y, dir, step, range, stepUp);
  const fit = { left: trace(-1), right: trace(1), material: terrainAt(trail, prop.x, y - stepUp).material };
  walkFits.set(prop, { x: prop.x, y: prop.y, geometry, fit });
  return fit;
}

/** The ground Coda the corgi can trot along (see corgi-props.js). */
const corgiFit = (trail, prop) => walkFit(trail, prop, CORGI_STEP, CORGI_RANGE, CORGI_STEP_UP);
/** The ground a rabbit can hop along (see rabbit-props.js). */
const rabbitFit = (trail, prop) => walkFit(trail, prop, RABBIT_STEP, RABBIT_RANGE, RABBIT_STEP_UP);

/**
 * Where a rabbit has hopped to at `time`, for startling it: its world `x` and
 * `y`, and its offset `from` its anchor, where its flight starts.
 */
export function rabbitPropAt(trail, prop, time) {
  const fit = propWallFit(trail, prop);
  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  const at = rabbitIdle(time, rabbitPhase(prop.x), fit, prop.flip ? -1 : 1);
  return { x: prop.x + at.dx, y: y + at.dy, from: at.dx };
}

// Trees a squirrel hides in, with how far above the base the leaves start to
// cover the trunk; it climbs on until it is out of sight above that line.
export const SQUIRREL_TREES = { tree: -90, pine: -28, "snow-pine": -28, sapling: -46, "pine-small": -16 };
const squirrelFits = new WeakMap();

/**
 * Where a startled squirrel can go, as offsets from its anchor: the ground it
 * can run along `left` and `right` of it (one offset every SQUIRREL_STEP, up
 * to a wall, a drop or SQUIRREL_RANGE), and the nearest `tree` along that
 * ground, with its trunk `dx` and the `leaves` line that hides it, or null.
 * Cached per squirrel until it, the terrain or a tree changes.
 */
function squirrelFit(trail, prop) {
  const geometry = terrainGeometry(trail);
  const trees = (trail.props || []).filter((other) => other.type in SQUIRREL_TREES);
  const key = trees.map((tree) => `${tree.type},${tree.x},${tree.y}`).join(";");
  const cached = squirrelFits.get(prop);
  if (cached && cached.x === prop.x && cached.y === prop.y
    && cached.geometry === geometry && cached.key === key) return cached.fit;
  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  const trace = (dir) => traceGround(trail, prop.x, y, dir, SQUIRREL_STEP, SQUIRREL_RANGE, SQUIRREL_STEP_UP);
  const left = trace(-1);
  const right = trace(1);
  let tree = null;
  for (const other of trees) {
    const dx = other.x - prop.x;
    const path = dx < 0 ? left : right;
    const step = Math.round(Math.abs(dx) / SQUIRREL_STEP);
    if (step >= path.length || (tree && Math.abs(dx) >= Math.abs(tree.dx))) continue;
    // Only a tree standing on the ground it runs along.
    const base = (Number.isFinite(other.y) ? other.y : terrainAt(trail, other.x).y) - y;
    if (Math.abs(base - path[step]) > SQUIRREL_STEP_UP) continue;
    tree = { dx, leaves: base + SQUIRREL_TREES[other.type] };
  }
  const fit = { left, right, tree };
  squirrelFits.set(prop, { x: prop.x, y: prop.y, geometry, key, fit });
  return fit;
}

const tumbleweedFits = new WeakMap();

/**
 * The ground a tumbleweed rolls over, as offsets from its anchor every
 * TUMBLEWEED_STEP units downwind (the way the trail's wind blows), up to a
 * wall, a drop or TUMBLEWEED_RUN. Cached per prop until it, the wind's
 * direction or the terrain changes.
 */
function tumbleweedFit(trail, prop) {
  const geometry = terrainGeometry(trail);
  const downwind = windSign(resolveWeather(trail.weather));
  const cached = tumbleweedFits.get(prop);
  if (cached && cached.x === prop.x && cached.y === prop.y
    && cached.downwind === downwind && cached.geometry === geometry) return cached.fit;
  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  const path = traceGround(trail, prop.x, y, downwind, TUMBLEWEED_STEP, TUMBLEWEED_RUN, TUMBLEWEED_STEP_UP);
  const fit = { path };
  tumbleweedFits.set(prop, { x: prop.x, y: prop.y, downwind, geometry, fit });
  return fit;
}

/**
 * Where a water prop is at `time`, for startling it: a fish where it has swum
 * to (with its `swim` offset), anything else where it floats or stands.
 */
export function waterPropAt(trail, prop, time) {
  const fit = propWallFit(trail, prop);
  const y = Number.isFinite(prop.y) ? prop.y : terrainAt(trail, prop.x).y;
  if (prop.type === "fish") {
    const swim = fishSwim(prop.x, fit, time, Boolean(prop.flip));
    return { x: prop.x + swim.dx, y: y + (fit?.swim ?? 0) + swim.dy, swim };
  }
  return { x: prop.x, y: y + (fit?.surface ?? 0) };
}

/**
 * How far a cave or water prop's art reaches above and below its anchor, once
 * fitted: [rise, hang], or null for other props.
 */
export function propSpan(type, fit) {
  if (SURFACE_PROPS.has(type)) {
    const surface = fit?.surface ?? 0;
    // A duck flies off, a frog leaps and dragonflies hover over the water.
    const above = { duck: 120, frog: 44, boat: 30, dragonfly: DRAGONFLY_RANGE.high + 12 }[type] ?? 12;
    return [Math.max(0, -surface) + above, Math.max(0, surface) + 6];
  }
  if (type === "bubbles") {
    const bed = fit?.bed ?? 0;
    return [Math.max(0, (fit?.rise ?? 40) + 8 - bed), Math.max(0, bed) + 4];
  }
  if (type === "fish") {
    const swim = fit?.swim ?? 0;
    return [Math.max(0, -swim) + 12, Math.max(0, swim) + 12];
  }
  if (WATER_PROPS.has(type)) {
    const bed = fit?.bed ?? 0;
    return [Math.max(0, (fit?.height ?? REED_MAX) + 16 - bed), Math.max(0, bed) + 4];
  }
  if (type === "squirrel") {
    const ground = [...(fit?.left ?? [0]), ...(fit?.right ?? [0])];
    const top = Math.min(...ground, (fit?.tree?.leaves ?? 0) - SQUIRREL_LENGTH);
    return [Math.max(0, -top) + 32, Math.max(0, ...ground) + 4];
  }
  if (type === "corgi") {
    const ground = [...(fit?.left ?? [0]), ...(fit?.right ?? [0])];
    return [Math.max(0, -Math.min(...ground)) - CORGI_BOUNDS[1] + 8, Math.max(0, ...ground) + 4];
  }
  if (type === "rabbit") {
    const ground = [...(fit?.left ?? [0]), ...(fit?.right ?? [0])];
    // Room for it sat up, as tall as it gets, at the top of a bound.
    const top = RABBIT_HEIGHT + RABBIT_BOUND_HEIGHT + 4;
    return [Math.max(0, -Math.min(...ground)) + top, Math.max(0, ...ground) + 4];
  }
  if (type === "tumbleweed") {
    const path = fit?.path ?? [0];
    return [Math.max(0, -Math.min(...path)) + TUMBLEWEED_RADIUS * 2 + 12, Math.max(0, ...path) + 4];
  }
  if (type === "vulture") {
    const centre = fit?.centre ?? 0;
    return [Math.max(0, -centre) + VULTURE_ORBIT.y + 16, Math.max(0, centre + VULTURE_ORBIT.y + 12)];
  }
  if (type === "beams") return [BEAM_REACH + 12, 4];
  if (type === "dungeon-bars") {
    const roofs = (fit?.roofs ?? []).filter((roof) => roof !== null);
    return [Math.max(BARS.height + 8, ...roofs.map((roof) => -roof)) + 4, 4];
  }
  if (type === "minecart") return [52, 4];
  if (!CEILING_PROPS.has(type)) return null;
  const ceiling = fit?.ceiling ?? 0;
  if (type === "lantern") {
    const body = fit?.body ?? 0;
    return [Math.max(-ceiling, -body - LANTERN_TOP) + 4, Math.max(0, body) + 4];
  }
  const below = {
    "hanging-roots": 72,
    stalactites: 36,
    drip: (fit?.drop ?? 200) + 8,
    bats: 120,
    // Icicles, and the meltwater dripping off them to the floor.
    icicles: Math.max(fit?.drop ?? ICICLE_REACH + 200, ICICLE_REACH) + 8,
    spiderweb: WEB_HANG + 8,
    cobweb: COBWEB_HANG + 4,
    spider: SPIDER_DROP + 16,
    cocoon: COCOON_HANG + 4,
    portcullis: PORTCULLIS.max + 8,
    "hanging-chains": CHAINS_HANG + 4,
    gibbet: GIBBET_HANG + 12,
  }[type];
  return [Math.max(0, -ceiling) + (type === "bats" ? 120 : 4), Math.max(0, ceiling + below)];
}

// How far a lantern's light reaches across the rock, in bands of brightness.
const LANTERN_REACH = 136;
const LANTERN_BANDS = [
  [40, 0.42],
  [70, 0.3],
  [102, 0.18],
  [LANTERN_REACH, 0.08],
];
const lanternLights = new WeakMap();

/**
 * The patch of rock a lantern lights up: warm rings around it, kept to solid
 * terrain so the cave wall glows and the open air does not. Cached per prop
 * until it moves or the terrain changes.
 */
function lanternLightSprite(trail, prop, centreX, centreY) {
  const geometry = terrainGeometry(trail);
  const cached = lanternLights.get(prop);
  if (cached && cached.x === centreX && cached.y === centreY && cached.geometry === geometry)
    return cached.sprite;
  const size = (LANTERN_REACH * 2) / ART_PIXEL;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const image = context.createImageData(size, size);
  const left = Math.round(centreX / ART_PIXEL) * ART_PIXEL - LANTERN_REACH;
  const top = Math.round(centreY / ART_PIXEL) * ART_PIXEL - LANTERN_REACH;
  const [r, g, b] = [0xff, 0xe3, 0x9a];
  for (let column = 0; column < size; column++) {
    const wx = left + column * ART_PIXEL + 1;
    const surfaces = terrainSurfacesAt(trail, wx);
    const spans = [];
    for (let i = 0; i < surfaces.length; i++)
      if (surfaces[i].entering) spans.push([surfaces[i].y, surfaces[i + 1]?.y ?? Infinity]);
    for (let row = 0; row < size; row++) {
      const wy = top + row * ART_PIXEL + 1;
      if (!spans.some(([from, to]) => wy >= from && wy <= to)) continue;
      // A checkerboard nudge dithers the edge between bands.
      const distance =
        Math.hypot(wx - centreX, wy - centreY) + ((column + row) % 2 ? 3 : -3);
      const band = LANTERN_BANDS.find(([radius]) => distance < radius);
      if (!band) continue;
      const at = (row * size + column) * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = Math.round(band[1] * 255);
    }
  }
  context.putImageData(image, 0, 0);
  const sprite = { canvas, left, top, size: LANTERN_REACH * 2 };
  lanternLights.set(prop, { x: centreX, y: centreY, geometry, sprite });
  return sprite;
}

// How far below the surface graffiti goes when its prop has no y of its own.
const GRAFFITI_DEPTH = 40;
// How close paint may come to the open air, so it stays off the surface lip
// and the edges of a face.
const GRAFFITI_INSET = { top: 8, side: 4, bottom: 4 };
const graffitiPaint = new WeakMap();

/** Where a painted prop's middle is: its own y, or a little into the rock below it. */
export function paintedPropY(trail, prop) {
  if (Number.isFinite(prop.y)) return prop.y;
  const surface = terrainAt(trail, prop.x);
  return surface?.solid ? surface.y + GRAFFITI_DEPTH : null;
}

/**
 * The graffiti sprite for a prop, with every pixel that is not on solid rock
 * cleared, so the paint stays on the rock face. Cached per prop until it
 * moves or the terrain changes.
 */
function graffitiSprite(trail, prop) {
  const y = paintedPropY(trail, prop);
  if (y === null) return null;
  const geometry = terrainGeometry(trail);
  const angle = propRotation(prop);
  const cached = graffitiPaint.get(prop);
  if (cached && cached.x === prop.x && cached.y === y && cached.angle === angle
    && cached.type === prop.type && cached.geometry === geometry)
    return cached.sprite;

  const art = PAINTED_ART[prop.type] ?? PAINTED_ART.graffiti;
  const [left, top, right, bottom] = angle ? graffitiTurnedBounds(prop.type) : art.bounds;
  const columns = (right - left) / ART_PIXEL;
  const rows = (bottom - top) / ART_PIXEL;
  const canvas = createCanvas(columns, rows);
  const context = canvas.getContext("2d");
  if (angle) context.putImageData(turnedGraffiti(art, angle, columns, rows, left, top), 0, 0);
  else {
    context.setTransform(1 / ART_PIXEL, 0, 0, 1 / ART_PIXEL, -left / ART_PIXEL, -top / ART_PIXEL);
    art.draw(createDrawingTools(context));
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  const anchorX = Math.round(prop.x / ART_PIXEL) * ART_PIXEL;
  const anchorY = Math.round(y / ART_PIXEL) * ART_PIXEL;
  const solid = (px, py) => terrainCollisionsAt(trail, px, py, 1).length > 0;
  const { data } = context.getImageData(0, 0, columns, rows);
  const { top: inTop, side, bottom: inBottom } = GRAFFITI_INSET;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!data[(row * columns + column) * 4 + 3]) continue;
      const wx = anchorX + left + column * ART_PIXEL + 1;
      const wy = anchorY + top + row * ART_PIXEL + 1;
      if (
        !solid(wx, wy) ||
        !solid(wx, wy - inTop) ||
        !solid(wx - side, wy) ||
        !solid(wx + side, wy) ||
        !solid(wx, wy + inBottom)
      )
        context.clearRect(column, row, 1, 1);
    }
  }
  const sprite = { canvas, left: anchorX + left, top: anchorY + top, width: right - left, height: bottom - top };
  graffitiPaint.set(prop, { x: prop.x, y, angle, type: prop.type, geometry, sprite });
  return sprite;
}

/** A square around the anchor that holds a painted prop at any angle. */
export function graffitiTurnedBounds(type = "graffiti") {
  const [left, top, right, bottom] = paintedBounds(type);
  const reach = Math.ceil(Math.hypot(Math.max(-left, right), Math.max(-top, bottom)) / ART_PIXEL) * ART_PIXEL;
  return [-reach, -reach, reach, reach];
}

/**
 * The graffiti turned clockwise by `angle` about its anchor, one art pixel per
 * canvas pixel, each taken from the nearest pixel of the upright art so the
 * paint stays crisp.
 */
function turnedGraffiti(art, angle, columns, rows, left, top) {
  const [artLeft, artTop, artRight, artBottom] = art.bounds;
  const artColumns = (artRight - artLeft) / ART_PIXEL;
  const artRows = (artBottom - artTop) / ART_PIXEL;
  const upright = createCanvas(artColumns, artRows).getContext("2d");
  upright.setTransform(1 / ART_PIXEL, 0, 0, 1 / ART_PIXEL, -artLeft / ART_PIXEL, -artTop / ART_PIXEL);
  art.draw(createDrawingTools(upright));
  const source = upright.getImageData(0, 0, artColumns, artRows).data;
  const turned = upright.createImageData(columns, rows);
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // The centre of this pixel, turned back onto the upright art.
      const x = left + (column + 0.5) * ART_PIXEL;
      const y = top + (row + 0.5) * ART_PIXEL;
      const sx = Math.floor((x * c + y * s - artLeft) / ART_PIXEL);
      const sy = Math.floor((-x * s + y * c - artTop) / ART_PIXEL);
      if (sx < 0 || sy < 0 || sx >= artColumns || sy >= artRows) continue;
      const from = (sy * artColumns + sx) * 4, to = (row * columns + column) * 4;
      for (let k = 0; k < 4; k++) turned.data[to + k] = source[from + k];
    }
  }
  return turned;
}

export function propGroundOffset(trail, prop) {
  // A rotated prop is posed by hand: its trunks and posts no longer reach for
  // the ground, which they would find along the wrong axis.
  if (propRotation(prop)) return () => 0;
  const standing = propGroundHeight(trail, prop);
  if (standing === null) return () => 0;
  const originY = Number.isFinite(prop.y) ? prop.y : standing;
  // A floating prop keeps a trail base. A planted one follows the ground across
  // its whole width, and its search reaches above its anchor so the uphill end
  // of a sloping footprint is found.
  if (!isPlanted(trail, prop)) return () => 0;
  const reference = standing - PROP_SLOPE_WINDOW;
  return (localX) => {
    const y = surfaceAt(trail, prop.x + localX, reference);
    return y === null ? 0 : y - originY;
  };
}

// World units per art pixel. Gameplay art snaps to this grid; far parallax uses twice it.
export const ART_PIXEL = 2;

export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

/** The flat colour palette the rider art reads, for a look (see cosmetics.js). */
export const riderPalette = (look) => lookParts(look).palette;

const RIDER_OUTLINE = "#263b36";

/**
 * Draws pixel art from `rows` of characters with its top left at (x, y), in
 * world units on a 2-unit pixel grid. Each character is a key of `colors`;
 * spaces and unknown characters are left clear. Runs of one colour along a row
 * are drawn as one rectangle.
 */
export function drawPixelRows(rect, x, y, rows, colors) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; ) {
      const key = row[c];
      let end = c + 1;
      while (end < row.length && row[end] === key) end++;
      const color = colors[key];
      if (color) rect(x + c * 2, y + r * 2, (end - c) * 2, 2, color);
      c = end;
    }
  });
}

// Motocross helmet facing right: a long peak over the goggles, a chin bar
// jutting forward, and a stripe over the crown, its back rounded. Top left
// at (-7, -10), so it sits a pixel above the bare head and barely past its
// back, and its chin bar clears the shoulder.
const MX_HELMET = [
  "  OOOO    ",
  " OLsLHOOOO",
  "OLHsHHHLLO",
  "OHHSOOOOO ",
  "OHHHOvVVO ",
  "OSHHHOOHHO",
  " OSHHHSSO ",
  "  OOOOOO  ",
];

/** The motocross helmet, centred on (0, 0) and facing right, like drawHelmetShell. */
export function drawMxHelmet(rect, colors) {
  drawPixelRows(rect, -7, -10, MX_HELMET, {
    O: RIDER_OUTLINE,
    H: colors.helmet,
    L: colors.helmetLight,
    S: colors.helmetShade,
    s: colors.stripe,
    g: colors.visor,
    V: colors.visor,
    v: colors.visorLight,
  });
}

// Headwear worn over the bare head, so the face (and some hair) shows
// under it: pixel rows as in drawPixelRows, facing right, with their top
// left in art pixels from the head's centre. H / L / S are the helmet colour
// (base, light, shade), s its stripe and V / v its visor; the other keys are
// HEADWEAR_COLORS.
const HEADWEAR = {
  // A paper cone, its brim over the top of the hair.
  dunce: {
    x: -4,
    y: -11,
    rows: [
      "    O    ",
      "   OWO   ",
      "   OwO   ",
      "  OWwgO  ",
      "  OWwgO  ",
      " OWwwwgO ",
      " OWwwwgO ",
      "OWwwwwwgO",
      "OgggggggO",
      " OOOOOOO ",
    ],
  },
  // A baseball cap, peak forward.
  cap: {
    x: -3,
    y: -6,
    rows: [
      "  OOOO    ",
      " OLLHHO   ",
      "OLHHHHSOOO",
      "OSSSSSSHHO",
      "      OOOO",
    ],
  },
  // The same cap, peak backward.
  "cap-back": {
    x: -6,
    y: -6,
    rows: [
      "    OOOO  ",
      "   OLLHHO ",
      "OOOLHHHHSO",
      "OHHSSSSSSO",
      "OOOO      ",
    ],
  },
  // A knitted beanie with a folded cuff.
  beanie: {
    x: -3,
    y: -6,
    rows: [
      "  OOO  ",
      " OLHHO ",
      "OHLHLSO",
      "OsssssO",
    ],
  },
  // A spotted bandana knotted at the back, its tails hanging down.
  bandana: {
    x: -5,
    y: -5,
    rows: [
      "   OOOOO ",
      " OOHsHsHO",
      "OHOSSSSSO",
      "OHHO     ",
      " OHO     ",
      "  O      ",
    ],
  },
  // A cowboy hat: a creased crown with a band, and a brim curled up at the ends.
  cowboy: {
    x: -6,
    y: -7,
    rows: [
      "    OOOOO   ",
      "   OLHOHSO  ",
      "   OLHHHSO  ",
      "O  OsssssO O",
      "OLHHHHHHHHSO",
      " OO      OO ",
    ],
  },
  // A vented bicycle helmet with a short peak.
  bike: {
    x: -4,
    y: -6,
    rows: [
      "  OOOOO  ",
      " OLVLVHO ",
      "OLHHVHVHO",
      "OHSSSSSOO",
      "OSO      ",
      " O       ",
    ],
  },
  // An open-face helmet, goggles up on its front, down over the ears.
  "open-face": {
    x: -4,
    y: -6,
    rows: [
      "  OOOOO  ",
      " OLLHsHO ",
      "OLHHHsHHO",
      "OHHOvVVVO",
      "OHO      ",
      "OHO      ",
      "OSO      ",
      " O       ",
    ],
  },
  // A riveted steel helmet with a horn either side.
  viking: {
    x: -6,
    y: -9,
    rows: [
      " O        O ",
      "OIO      OIO",
      "OIO      OIO",
      "OiIO OOOOIiO",
      " OiIOmmMOiO ",
      "  OOmMMMnO  ",
      "  OMMKMKMnO ",
      "  OnnnnnnnO ",
    ],
  },
};

// The colours headwear has whatever the helmet colour: paper, steel, horn.
const HEADWEAR_COLORS = {
  O: RIDER_OUTLINE,
  K: RIDER_OUTLINE,
  W: "#fff8e7",
  w: "#e8e5d9",
  g: "#b5bcae",
  M: "#b5bcae",
  m: "#e8e5d9",
  n: "#727c80",
  I: "#fff8e7",
  i: "#d9cfae",
};

// Hair that still shows under headwear; the rest is tucked under it.
const HAIR_UNDER_HEADWEAR = new Set(["mullet"]);

/** Whether a helmet shape is headwear worn over the bare head (see HEADWEAR). */
export const isHeadwear = (shape) => Object.hasOwn(HEADWEAR, shape);

/** Headwear on its own, centred on (0, 0) like the helmets; draw it over drawBareHead. */
function drawHeadwear(rect, shape, colors) {
  const wear = HEADWEAR[shape];
  drawPixelRows(rect, wear.x * 2, wear.y * 2, wear.rows, {
    ...HEADWEAR_COLORS,
    H: colors.helmet,
    L: colors.helmetLight,
    S: colors.helmetShade,
    s: colors.stripe,
    V: colors.visor,
    v: colors.visorLight,
  });
}

/**
 * The rider's head as `parts` (lookParts) wears it, centred on (0, 0) and
 * facing right: bare, or under its helmet. `loose` draws a knocked-off
 * helmet on its own, without the head headwear sits on.
 */
function drawRiderHead(rect, parts, colors, { bare = !parts.helmet, loose = false } = {}) {
  const shape = parts.shapes.helmet;
  if (bare) drawBareHead(rect, colors, parts.hair);
  else if (shape === "mx") drawMxHelmet(rect, colors);
  else if (isHeadwear(shape)) {
    if (!loose) {
      const { extra } = parts.hair;
      const hair = extra && !HAIR_UNDER_HEADWEAR.has(extra) ? { ...parts.hair, extra: null } : parts.hair;
      drawBareHead(rect, colors, hair);
    }
    drawHeadwear(rect, shape, colors);
  } else drawHelmetShell(rect, colors);
}

// The full-face helmet facing right: a shell with a stripe over the crown, a
// tinted visor with a glint, and a chin bar, outlined all round, its lower
// edge where the bare head's jaw line is. Top left at (-7, -8), a pixel
// above the bare head, so it clears the collar.
const HELMET_SHELL = [
  "  OOOO    ",
  " OLLsLO   ",
  "OLLHsHLLLH",
  "OSSSSVvvV ",
  "OHHHHVVVV ",
  "OSSSSOOHH ",
  " OOOOSSSS ",
  " OOOOOOOO ",
];

/** The full-face helmet, centred on (0, 0) and facing right, like the bare head. */
export function drawHelmetShell(rect, colors) {
  drawPixelRows(rect, -7, -10, HELMET_SHELL, {
    O: RIDER_OUTLINE,
    H: colors.helmet,
    L: colors.helmetLight,
    S: colors.helmetShade,
    s: colors.stripe,
    V: colors.visor,
    v: colors.visorLight,
  });
}

// More hair drawn over a bare head (a cut's `extra`), facing right: top left
// in art pixels from the head's centre, and rows as in drawPixelRows, with
// h the hair, L its highlight and d its shade.
const HAIR_EXTRAS = {
  // A knot on the back of the crown.
  bun: { x: -4, y: -6, rows: [" OO ", "OLhO", "OhdO"] },
  // One knot at the back of the crown and one at the front.
  buns: { x: -4, y: -6, rows: [" OO  OO ", "OLhOOLhO", "OhdOOhdO"] },
  // A crest along the crown over shaved sides.
  mohawk: { x: -2, y: -6, rows: [" OOO ", "OhLhO", "OhhdO", " hhd "] },
  // A round cloud over the crown and down the back, clear of the face.
  afro: {
    x: -5,
    y: -6,
    rows: [
      "  OOOOO  ",
      " OhLLhhO ",
      "OhLhhhhhO",
      "OhhhhhhdO",
      "Ohhhd    ",
      "Ohhd     ",
      " Od      ",
    ],
  },
  // A big curly mane, as worn on the Bonny Tyler trail: piled high on the
  // crown, bangs over the brow, and down past the shoulders.
  mane: {
    x: -8,
    y: -8,
    rows: [
      "    OO OOO OO",
      "   OhdOhdhOdhO",
      "  OhhLhhLhhLhO",
      " OhdhhdhhdhhdhO",
      " OhLhhLhhLhhLhO",
      "OdhhdhhdhhdhhO",
      "OLhhLhhLhOOOO",
      "OhdhhdhhO",
      "OhLhhLhhO",
      "OhhdhhdhO",
      "OhhhhhhO",
      " OhhdhhO",
      " OhhhhOO",
      "  OhhOhhO",
      "   OO OO",
    ],
  },
  // Short on top, long at the back, down over the collar.
  mullet: { x: -4, y: -2, rows: ["Oh ", "Ohh", "Ohh", "Ohd", "Odd", " OO"] },
};

// The rider's bare head facing right: the face with its outline, ear, eye
// under a dark brow, nose and mouth, and no hair. Top left at (-6, -8), so
// it is centred on (0, 0).
const BARE_HEAD = [
  " OOOOO ",
  "OsssssO",
  "OssssOO",
  "OsdselO",
  "Osslsss",
  "OssssmO",
  " OOOOO ",
];

// Hair over the bare head, as rows over BARE_HEAD: H the hair, h its shine.
// A 'short' cap stops above the ear, a 'long' one has bangs and falls to
// the nape, where a ponytail starts, a 'buzz' is the top row only, and a
// 'bald' head only catches the light.
const HAIR_CAPS = {
  short: ["", " HhhHH ", " HHH", " H"],
  long: ["", " HhhHH ", " HHHH", " H", "HH", "HH"],
  buzz: ["", " HhhHH "],
  bald: ["", "  ll"],
};

// Beards, as rows over BARE_HEAD: H the hair colour, h its shine, b its
// shade, and m keeps the mouth showing. The longer ones hang below the jaw.
const BEARDS = {
  stubble: ["", "", "", "", "   b   ", "  b b  "],
  moustache: ["", "", "", "", "", "    HH "],
  goatee: ["", "", "", "", "", "    H  ", "    HHO", "    OO "],
  full: ["", "", "", "", "  Hh   ", "  HHHmH", " OHHbHH", "  OOOOO"],
  lumberjack: ["", "", "", "", "  Hh   ", "  HHHmH", " OHhHHH", "  OHHbHO", "   OHHO", "    OO "],
};

/** Whether a beard shape has art (see BEARDS). */
export const hasBeardArt = (shape) => Object.hasOwn(BEARDS, shape);

/**
 * The rider's bare head, without a helmet or once it has come off, centred
 * where the helmet's centre is and facing right, in the same units as
 * drawHelmetShell. `hair` is the cut from lookParts: its cap (HAIR_CAPS),
 * any extra hair over it (HAIR_EXTRAS) and its beard (BEARDS).
 */
export function drawBareHead(rect, colors, hair) {
  const { cap = "short", extra = null, beard = null } = hair ?? {};
  const palette = {
    O: RIDER_OUTLINE,
    s: colors.skin,
    l: colors.skinLight,
    d: colors.skinShade,
    e: colors.eye,
    m: colors.mouth,
    H: colors.hair,
    h: colors.hairLight,
  };
  drawPixelRows(rect, -6, -8, BARE_HEAD, palette);
  if (HAIR_CAPS[cap]) drawPixelRows(rect, -6, -8, HAIR_CAPS[cap], palette);
  if (BEARDS[beard]) drawPixelRows(rect, -6, -8, BEARDS[beard], { ...palette, b: colors.hairShade });

  const more = HAIR_EXTRAS[extra];
  if (more)
    drawPixelRows(rect, more.x * 2, more.y * 2, more.rows, {
      O: RIDER_OUTLINE,
      h: colors.hair,
      L: colors.hairLight,
      d: colors.hairShade,
    });
}

// The riding pose, in bike body coordinates before lean: where the helmet's
// centre sits, over the collar, and the hand on the handlebar every bike
// model shares. The ponytail's root in rider-hair.js follows the head.
const RIDER_HEAD = [-1, -44];
const RIDER_HAND = [16, -28];

// The jersey, leaning forward from the hip on the seat to the shoulder. Top
// left at (-16, -38), moved with the lean.
const RIDER_TORSO = [
  "    OPPPPO ",
  "   OjjjjjJO",
  "   OdjjJJJO",
  "  OddJJJJJO",
  " OddJJJJO  ",
  "OPPPPPPO   ",
  " OPPPPO    ",
];

// How each outfit (its `shape` in js/cosmetics.js) is drawn, on the bike
// and thrown off it. Every key is optional and falls back to the street
// jacket's (OUTFIT_STYLES.jacket):
//   torso, torsoY  the torso's pixel rows (as RIDER_TORSO) and their top
//   keys           more pixel keys for the rows, each a palette key
//   sleeve         'rolled' (bare forearm, cuff at the elbow), 'long' (cuff
//                  at the wrist) or 'short' (cuff halfway down the upper arm)
//   sleeveColor    the sleeve's palette key; armLight its lit edge's
//   cuff           the cuff's palette key, or null for none
//   armBands       { color, at }: bands across the arm, at fractions of the
//                  way from the shoulder (0) through the elbow (.5) to the hand (1)
//   legs           'trousers', or 'shorts' (bare knee, `socks` below it)
//   legLight       the trousers' lit edge
//   legBands       { color, at }: bands across the leg, hip (0), knee (.5), ankle (1)
//   knee           'pad', 'big', 'slider' or 'none'
//   boots          'boot', 'tall', 'welly', 'trainer', 'heel' or 'snow'
//   bootRim        the palette key of a snow boot's rim
//   hem            the ragdoll's hem colour; bands { color, at } across its torso
const OUTFIT_STYLES = {
  jacket: {
    torso: RIDER_TORSO,
    torsoY: -38,
    keys: {},
    sleeve: "rolled",
    sleeveColor: "jacket",
    armLight: "jacketLight",
    cuff: "panel",
    armBands: null,
    legs: "trousers",
    legLight: "trousersLight",
    legBands: null,
    knee: "pad",
    boots: "boot",
    bootRim: null,
    hem: "panel",
    bands: null,
  },
  // A hood bunched up behind the neck, a front pocket and a ribbed hem.
  hoodie: {
    torso: [
      "  OOOO     ",
      " OjjjdO    ",
      " OdjddOPPO ",
      " OdddOjjjJO",
      "  OdjjjJJJO",
      "  OddJJJJJO",
      " OddJddJO  ",
      "OddddddO   ",
      " OddddO    ",
    ],
    torsoY: -42,
    sleeve: "long",
    cuff: "jacketShade",
    knee: "none",
    boots: "trainer",
    hem: "jacketShade",
  },
  // A race jersey with a side panel, worn loose over pants panelled to match.
  mx: {
    torso: [
      "    OPPPPO ",
      "   OjjjjjJO",
      "   OddjJJJO",
      "  OPPPPPPJO",
      " OddJJJJO  ",
      "OJJJJJJO   ",
      " OddddO    ",
    ],
    sleeve: "long",
    legLight: "panel",
    knee: "big",
    boots: "tall",
    hem: "jacket",
  },
  // Zipped to the chin, with a stripe down the sleeves and legs.
  tracksuit: {
    torso: [
      "    OJJJJO ",
      "   OjjjjjPO",
      "   OdjjJJPO",
      "  OddJJJJPO",
      " OddJJJPO  ",
      "OddddddO   ",
      " OddddO    ",
    ],
    sleeve: "long",
    armLight: "panel",
    cuff: "jacketShade",
    legLight: "panel",
    knee: "none",
    boots: "trainer",
    hem: "jacketShade",
  },
  // A denim bib and strap over the shirt, its sleeves rolled up.
  dungarees: {
    torso: [
      "    OjjjjO ",
      "   OjjjjjJO",
      "   OkjBbBJO",
      "  OdkBBBBBO",
      " OdkBBBBO  ",
      "OkkkkkkO   ",
      " OkkkkO    ",
    ],
    keys: { B: "denim", b: "denimLight", k: "denimShade" },
    cuff: "jacketLight",
    knee: "none",
    boots: "welly",
    hem: "denimShade",
    bands: { color: "denim", at: [0.3, 0.6] },
  },
  // A checked shirt, its sleeves rolled up, over cargo shorts and long socks.
  flannel: {
    torso: [
      "    OddddO ",
      "   OjdjjdJO",
      "   OddddddO",
      "  OJdJJdJJO",
      " OJdJJdJO  ",
      "OddddddO   ",
      " OJdJJO    ",
    ],
    cuff: "jacketShade",
    legs: "shorts",
    knee: "none",
    hem: "jacketShade",
    bands: { color: "jacketShade", at: [0.4, 0.7] },
  },
  // A yoke across the chest, fringe down the back and under the hem.
  western: {
    torso: [
      "    OPPPPO ",
      "   OPPjPPPO",
      "  POdjjPJJO",
      " P OddJJJJO",
      "P OddJJJO  ",
      " OPJPJPO   ",
      " P P P     ",
    ],
    sleeve: "long",
    knee: "none",
    boots: "heel",
  },
  // Black neoprene with a side panel in the outfit colour.
  wetsuit: {
    torso: [
      "    OKKKKO ",
      "   OkkkkkKO",
      "   OJkkKKKO",
      "  OJJKKKKKO",
      " OJJKKKKO  ",
      "OKKKKKKO   ",
      " OKKKKO    ",
    ],
    keys: { K: "rubber", k: "rubberLight" },
    sleeve: "long",
    sleeveColor: "rubber",
    armLight: "jacket",
    cuff: "rubber",
    legLight: "jacket",
    knee: "none",
    boots: "trainer",
    hem: "rubber",
  },
  // A one-piece with reflective bands round the chest, arms and legs.
  coveralls: {
    torso: [
      "    OddddO ",
      "   OjjjjjJO",
      "   OdjjJJJO",
      "  ORRRRRRRO",
      " OddJJJJO  ",
      "OddddddO   ",
      " OJJJJO    ",
    ],
    keys: { R: "reflect" },
    sleeve: "long",
    armBands: { color: "reflect", at: [0.75] },
    legBands: { color: "reflect", at: [0.75] },
    hem: "jacketShade",
    bands: { color: "reflect", at: [0.65] },
  },
  // A one-piece suit with a hump on the back and a stripe down the side.
  leathers: {
    torso: [
      "  OOOOPPPO ",
      " OjjjjjjjJO",
      " OdjjjjJJJO",
      " OddPPJJJJO",
      " OdPPJJJO  ",
      "OPJJJJJO   ",
      " OJJJJO    ",
    ],
    sleeve: "long",
    legLight: "panel",
    knee: "slider",
    boots: "tall",
    hem: "jacket",
  },
  // A quilted jacket, puffed out, with the scarf wrapped round the neck.
  puffer: {
    torso: [
      "   OPPPPPO ",
      "  OjjjjjjJO",
      " OjjjjjJJJO",
      " OddddddddO",
      "OddJJJJJO  ",
      "OdddddddO  ",
      " OJJJJJO   ",
    ],
    sleeve: "long",
    cuff: "jacketShade",
    armBands: { color: "jacketShade", at: [0.25, 0.75] },
    knee: "none",
    boots: "snow",
    bootRim: "fur",
    hem: "jacketShade",
    bands: { color: "jacketShade", at: [0.4, 0.7] },
  },
  // A suit in the outfit colour with an emblem on the chest and a belt.
  superhero: {
    torso: [
      "    OJJJJO ",
      "   OjjjjjJO",
      "   OdjjJPJO",
      "  OddJPPPJO",
      " OddJJPJO  ",
      "OPPPPPPO   ",
      " OJJJJO    ",
    ],
    sleeve: "long",
    cuff: null,
    knee: "none",
    boots: "tall",
  },
  // Yellow with the black and yellow target on the back, and black bands.
  dummy: {
    torso: [
      "    OPPPPO ",
      "   OPPjjjJO",
      "   OPPJJJJO",
      "  OdJJPPJJO",
      " OdJJPPO   ",
      "OJJJJJJO   ",
      " OPPPPO    ",
    ],
    sleeve: "long",
    cuff: null,
    armBands: { color: "panel", at: [0.5] },
    legBands: { color: "panel", at: [0.5] },
    knee: "none",
    hem: "jacket",
    bands: { color: "panel", at: [0.5] },
  },
  // A black jacket open over a white shirt front, and a bow tie.
  tuxedo: {
    torso: [
      "    ObbbbO ",
      "   OjjjPPJO",
      "   OdjjjPJO",
      "  OddJJJPJO",
      " OddJJJPO  ",
      "OJJJJJJO   ",
      " OJJJJO    ",
    ],
    keys: { b: "bow" },
    sleeve: "long",
    legLight: "jacketLight",
    knee: "none",
    boots: "trainer",
    hem: "jacket",
  },
  // Black and white stripes, head to toe.
  prisoner: {
    torso: [
      "    OPPPPO ",
      "   OjjjjjJO",
      "   OPPPPPPO",
      "  OddJJJJJO",
      " OPPPPPPO  ",
      "OJJJJJJO   ",
      " OPPPPO    ",
    ],
    sleeve: "long",
    cuff: null,
    armBands: { color: "panel", at: [0.25, 0.5, 0.75] },
    legBands: { color: "panel", at: [0.2, 0.45, 0.7] },
    knee: "none",
    bands: { color: "panel", at: [0.35, 0.6, 0.85] },
  },
  // Red wool with white trim, and a black belt with a gold buckle.
  nisse: {
    torso: [
      "    OPPPPO ",
      "   OjjjjjJO",
      "   OdjjJJJO",
      "  OddJJPJJO",
      " OBBBBYBO  ",
      "OPPPPPPO   ",
      " OJJJJO    ",
    ],
    keys: { B: "belt", Y: "buckle" },
    sleeve: "long",
    knee: "none",
    boots: "tall",
    bands: { color: "belt", at: [0.3] },
  },
  // A tunic with a big fur collar and a belt, bare forearms and wrapped legs.
  viking: {
    torso: [
      "   OPPPPPPO",
      "  OPpPPpPPO",
      "   OPdjJJJO",
      "  OddJJJJJO",
      " OBBBBYBO  ",
      "OJJJJJJO   ",
      " OJdJJO    ",
    ],
    keys: { p: "furShade", B: "belt", Y: "buckle" },
    legBands: { color: "wrap", at: [0.6, 0.72, 0.84] },
    knee: "none",
    boots: "snow",
    bootRim: "panel",
    hem: "jacketShade",
    bands: { color: "belt", at: [0.3] },
  },
};

/** Whether an outfit shape has its own drawing style (see OUTFIT_STYLES). */
export const hasOutfitStyle = (shape) => Object.hasOwn(OUTFIT_STYLES, shape);

/** The drawing style of an outfit shape, every key filled in from the street jacket's. */
const outfitStyle = (shape) => ({ ...OUTFIT_STYLES.jacket, ...OUTFIT_STYLES[shape] });

// Selectable bike models drawn by createGameArt().drawBike. Every model keeps
// the same seat, peg, and handlebar positions so any rider fits any bike.
export const BIKE_MODELS = ["elasto", "classic", "scrambler"];
export const DEFAULT_BIKE = "elasto";

/** The bike model a look rides (or `bike`, when given), falling back to the default. */
const bikeModel = (look, bike = null) => {
  const model = bike ?? lookParts(look).bike;
  return BIKE_MODELS.includes(model) ? model : DEFAULT_BIKE;
};

/**
 * Where the bike's headlight and tail light are, in the frame's units (facing
 * right, centred between the axles), with the suspension applied as drawBike
 * draws it. See bike-lamps.js.
 */
export function bikeLampPoints({ rear, front, facing = 1, look = null, bike = null }) {
  const lenses = lampLenses(BIKE_LAMPS[bikeModel(look, bike)]);
  const pose = bodyPose(rear, front, facing);
  return { head: posedBodyPoint(lenses.head, pose), tail: posedBodyPoint(lenses.tail, pose) };
}

/** Length of the Elasto fork's lower leg, from the axle (art px). */
const ELASTO_FORK_SLIDER_LENGTH = 11;

const ELASTO_COLORS = {
  green: "#3aa63c",
  greenLight: "#8fdc6e",
  greenDark: "#1f6b2c",
  white: "#eef1e8",
  silver: "#c3cbcd",
  silverDark: "#727c80",
  black: "#1b2124",
  red: "#d63b2c",
  orange: "#f08a3a",
  tire: "#16191b",
  tread: "#3a4246",
  rim: "#5d676b",
  spoke: "#39424a",
  hub: "#8e989c",
  hubLight: "#c9d0d2",
};

// The Elasto's sprung body as pixel art, one grid per rigid piece, each placed
// at its own centre so the body pitches with the suspension. G/L/D are the
// bike paint; see drawElastoFrame for the other keys.
const ELASTO_TAIL = [
  "  LL               ",
  "  GGLLLLLL         ",
  "   DWWRRRGGkkkkkkkk",
  "     DWWRRGKKKKKKKK",
  "   KSSSSDDWWWWW    ",
  "   KssssSSWKKKW    ",
  "        ssWKWKW    ",
  "          WKKKW    ",
  "          WKWKW    ",
  "          WKKKW    ",
  "          wwwww    ",
];

const ELASTO_TANK = [
  "  LLLLLLG   ",
  " LGGGGGGGG  ",
  " GGGGWWGGGG ",
  "  GGGGWWGGGG",
  "    GGGWWGGG",
  "     GGGWWGD",
  "      DDDDD ",
];

// Under the seat and tank: airbox, frame spar, finned cylinder, radiator and
// engine cases with the clutch cover.
const ELASTO_MID = [
  " kkksS        ",
  " kkksS        ",
  " kkksSSSSS    ",
  " kkksSeeee    ",
  " kkksSSSSS    ",
  " kkksSeeeeKkK ",
  " kkksSSSSSKkK ",
  "kkkksSeHHHee  ",
  " kkksSeHhHee  ",
  "  kksSeHHHee  ",
  "   kseeeeeee  ",
  "     KKKKKK   ",
];

// The Pocket Classic: a sprung bicycle, pedalled, with gold springs, hubs
// and chainring.
const CLASSIC_COLORS = {
  tire: "#203332",
  tread: "#3c524d",
  rim: "#b9c4af",
  rimShade: "#7f8f84",
  spoke: "#657a70",
  gold: "#edb466",
  goldLight: "#f1cb91",
  goldDark: "#b07a3a",
  chrome: "#dfe6d6",
  steel: "#b9c4af",
  steelDark: "#819084",
  chain: "#45524d",
  black: "#1b2124",
  saddle: "#3e5750",
  saddleDark: "#263a35",
};

// The chainring, centred on the crank: gold, lit from the top left, with
// a dark spider and a steel bolt.
const CLASSIC_CHAINRING = [
  "  yyy  ",
  " yYYYy ",
  "yYk kYy",
  "yY S yd",
  "yy k yd",
  " yyyyd ",
  "  ddd  ",
];

// The saddle on its post, nose forward.
const CLASSIC_SADDLE = [
  "QQQQQQQ   ",
  "qqqqqqqqqq",
  "    S     ",
];

// The rear rack the tail light sits on, back to the seat post.
const CLASSIC_RACK = [
  "SSSSSSSSS",
  "sssssssss",
];

const SCRAMBLER_COLORS = {
  tire: "#203332",
  tread: "#3c524d",
  rim: "#b9c4af",
  rimShade: "#7f8f84",
  spoke: "#657a70",
  gold: "#edb466",
  goldLight: "#f1cb91",
  goldDark: "#b07a3a",
  chrome: "#dfe6d6",
  steel: "#b9c4af",
  steelDark: "#819084",
  black: "#1b2124",
  case: "#435a52",
  caseLight: "#5d756b",
  caseDark: "#2f463d",
  seat: "#3e5750",
  seatDark: "#263a35",
};

// The Scrambler's sprung body, like the Elasto's: a ducktail seat over a
// pinstriped side panel, and a rounded tank. G/L/D are the bike paint; see
// drawScramblerFrame for the other keys. The tail light sits on the ducktail.
const SCRAMBLER_BODY = [
  "     QQQQQQQQQ        ",
  "   qqqqqqqqqqq  LLLL  ",
  "LLLGGGGGGGGGGq LGGGGL ",
  "GGGGyyyyyyyyGGLGGWWGGG",
  " DDGGGGGGGGGDDDGGGGGGD",
  "   DDDDDDDDD   DDDDDD ",
];

const SCRAMBLER_MUFFLER = [
  "KWWWWWWW",
  "KSSSSSSs",
];

// A single with a finned cylinder over round crankcases and a gold clutch
// cover, in the Pocket Classic's gold.
const SCRAMBLER_ENGINE = [
  "  SSSSS   ",
  "  sssss   ",
  "  SSSSS   ",
  " kCCCCCCk ",
  "kcckyyYcck",
  "kcyYYYYyck",
  "kcyYYYYyck",
  "kcckyyyccK",
  " kkkkkkkk ",
];

function parseColor(color) {
  const hex = color.replace("#", "");
  const value =
    hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
  return [0, 2, 4, 6].map((offset) =>
    offset < value.length ? parseInt(value.slice(offset, offset + 2), 16) : 255,
  );
}

// A translucent colour painted over an opaque one, as an opaque [r, g, b].
export function compositeColor(color, over) {
  const [r, g, b, a] = parseColor(color);
  const [br, bg, bb] = parseColor(over);
  const alpha = a / 255;
  return [
    r * alpha + br * (1 - alpha),
    g * alpha + bg * (1 - alpha),
    b * alpha + bb * (1 - alpha),
  ].map(Math.round);
}

// Snaps every pixel of a rendered sprite or chunk to fully opaque palette
// colours or full transparency, removing the canvas anti-aliasing. Returns
// false when nothing opaque remains.
export function quantizeToPalette(context, width, height, palette) {
  const colors = palette.map((color) =>
    typeof color === "string" ? parseColor(color).slice(0, 3) : color,
  );
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const nearest = new Map();
  let opaque = false;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 128) {
      data[offset + 3] = 0;
      continue;
    }
    opaque = true;
    const key =
      (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
    let match = nearest.get(key);
    if (!match) {
      let best = Infinity;
      for (const color of colors) {
        const dr = color[0] - data[offset],
          dg = color[1] - data[offset + 1],
          db = color[2] - data[offset + 2];
        const distance = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (distance < best) {
          best = distance;
          match = color;
        }
      }
      nearest.set(key, match);
    }
    data[offset] = match[0];
    data[offset + 1] = match[1];
    data[offset + 2] = match[2];
    data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return opaque;
}

// 3x5 bitmap glyphs, rows top to bottom.
const GLYPHS = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  0: "111101101101111",
  1: "010110010010111",
  2: "110001010100111",
  3: "110001010001110",
  4: "101101111001001",
  5: "111100110001110",
  6: "011100111101111",
  7: "111001010010010",
  8: "111101111101111",
  9: "111101111001110",
  " ": "000000000000000",
  "→": "010001111001010",
  "←": "010100111100010",
  "↑": "010111010010010",
  "↓": "010010010111010",
  "/": "001001010100100",
  ".": "000000000000010",
  "!": "010010010000010",
  "+": "000010111010000",
  "-": "000000111000000",
  ":": "000010000010000",
  "×": "000101010101000",
  "#": "101111101111101",
  "'": "010010000000000",
};

export function pixelTextWidth(text, pixel = ART_PIXEL) {
  return text.length ? (text.length * 4 - 1) * pixel : 0;
}

// Sign boards wrap their text onto up to SIGN_MAX_LINES lines and grow taller.
export const SIGN_LINE_CHARACTERS = 10;
export const SIGN_MAX_LINES = 4;
export const SIGN_MAX_CHARACTERS = SIGN_LINE_CHARACTERS * SIGN_MAX_LINES;

/** A sign's text wrapped at word boundaries; overlong words are split. */
export function signLines(text) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (let word of words) {
    while (word.length > SIGN_LINE_CHARACTERS) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, SIGN_LINE_CHARACTERS));
      word = word.slice(SIGN_LINE_CHARACTERS);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= SIGN_LINE_CHARACTERS)
      line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, SIGN_MAX_LINES);
}

/**
 * A sign board's size: `inner` is the cream face's width, `height` the whole
 * framed board's height. Widths keep the board and text on the pixel grid.
 */
export function signBoard(text) {
  const lines = signLines(text);
  const widest = Math.max(0, ...lines.map((line) => pixelTextWidth(line)));
  return {
    lines,
    inner: Math.max(22, widest + 8),
    height: Math.max(1, lines.length) * 12 + 10,
  };
}

export function createDrawingTools(ctx) {
  function line(points, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((point, index) =>
      index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]),
    );
    ctx.stroke();
  }

  function circle(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function pixelRect(x, y, width, height, color, pixel = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(x / pixel) * pixel,
      Math.round(y / pixel) * pixel,
      Math.max(pixel, Math.round(width / pixel) * pixel),
      Math.max(pixel, Math.round(height / pixel) * pixel),
    );
  }

  function pixelPath(points, color, thickness = 1, pixel = 2) {
    ctx.fillStyle = color;
    const radius = Math.floor(thickness / 2);
    for (let segment = 1; segment < points.length; segment++) {
      let x0 = Math.round(points[segment - 1][0] / pixel);
      let y0 = Math.round(points[segment - 1][1] / pixel);
      const x1 = Math.round(points[segment][0] / pixel);
      const y1 = Math.round(points[segment][1] / pixel);
      const dx = Math.abs(x1 - x0),
        sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0),
        sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      while (true) {
        ctx.fillRect(
          (x0 - radius) * pixel,
          (y0 - radius) * pixel,
          thickness * pixel,
          thickness * pixel,
        );
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

  // One fillRect per row; the centre snaps to the pixel grid.
  function drawPixelDisc(x, y, radius, color, pixel = 4) {
    ctx.fillStyle = color;
    const cells = Math.ceil(radius / pixel);
    const cx = Math.round(x / pixel) * pixel,
      cy = Math.round(y / pixel) * pixel;
    for (let py = -cells; py <= cells; py++) {
      const span = Math.floor(Math.sqrt(cells * cells - py * py));
      ctx.fillRect(
        cx - span * pixel,
        cy + py * pixel,
        (span * 2 + 1) * pixel,
        pixel,
      );
    }
  }

  // `x` is the anchor for `align`, `y` the top of the glyphs.
  function drawPixelText(
    text,
    x,
    y,
    color,
    { pixel = ART_PIXEL, align = "center" } = {},
  ) {
    const value = String(text).toUpperCase();
    const width = pixelTextWidth(value, pixel);
    let left =
      align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    left = Math.round(left / pixel) * pixel;
    const top = Math.round(y / pixel) * pixel;
    ctx.fillStyle = color;
    for (let index = 0; index < value.length; index++) {
      const glyph = GLYPHS[value[index]] || GLYPHS["#"];
      const glyphLeft = left + index * 4 * pixel;
      for (let cell = 0; cell < 15; cell++) {
        if (glyph[cell] === "1")
          ctx.fillRect(
            glyphLeft + (cell % 3) * pixel,
            top + Math.floor(cell / 3) * pixel,
            pixel,
            pixel,
          );
      }
    }
  }

  function drawPixelSpring(x1, y1, x2, y2, color) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length,
      ny = dx / length;
    const points = [[x1, y1]];
    for (let index = 1; index < 6; index++) {
      const amount = index / 6;
      const offset = (index % 2 ? 1 : -1) * 2.5;
      points.push([
        x1 + dx * amount + nx * offset,
        y1 + dy * amount + ny * offset,
      ]);
    }
    points.push([x2, y2]);
    pixelPath(points, color, 1);
  }

  return {
    line,
    circle,
    pixelRect,
    pixelPath,
    drawPixelDisc,
    drawPixelSpring,
    drawPixelText,
  };
}

// Start pennant: dark wooden pole with a yellow, red-bordered flag flying out
// `downwind` (-1 left, 1 right). (x, y) is the ground point under the pole;
// `groundOffset(localX)` gives the ground height relative to y, so the pole's
// base follows the slope. Like the other flags it droops in still air and
// ripples faster and harder in a stronger `wind` (0…1) while `time` runs.
export function drawStartPennant(ctx, x, y, groundOffset = () => 0, time = 0, wind = 0.25, downwind = -1) {
  const { pixelRect } = createDrawingTools(ctx);
  const ax = Math.round(x / ART_PIXEL) * ART_PIXEL;
  const ay = Math.round(y / ART_PIXEL) * ART_PIXEL;
  const rect = (px, py, w, h, color) =>
    pixelRect(ax + px, ay + py, w, h, color, ART_PIXEL);

  // Pole: shaded left, lit right; each column reaches down to the ground.
  for (const [px, color] of [
    [-2, "#4d3f2f"],
    [0, "#66543f"],
    [2, "#856d4f"],
  ]) {
    const bottom = groundOffset(px + 1);
    if (bottom > -100) rect(px, -100, 2, bottom + 100, color);
  }

  // Pennant with a red border, lit along the top and shaded along the bottom,
  // drawn a column at a time out from the pole so each column can drop.
  const TOP = -94,
    MID = -78,
    HALF = 16,
    LENGTH = 40;
  const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
  const strength = Math.max(0, Math.min(1, wind));
  const phase = (ax * 0.013) % 1;
  for (let px = 4; px < 4 + LENGTH; px += 2) {
    const cell = (px - 4) / 2;
    const droop = snap(cell * 1.4 * (1 - strength) ** 2);
    const ripple = time
      ? snap(Math.sin(time * (2.5 + strength * 6) - cell * 0.5 + phase * Math.PI * 2) * Math.min(cell, 6) * (0.15 + strength * 0.5))
      : 0;
    // Mirrored about the pole's middle when it flies left.
    const left = downwind < 0 ? -px : px;
    for (let py = TOP; py < MID + HALF; py += 2) {
      const d = Math.abs(py + 1 - MID);
      const outer = Math.round((LENGTH * (1 - d / HALF)) / 2) * 2;
      if (px - 4 >= outer) continue;
      const inner = d < 10 ? Math.round((28 * (1 - d / 10)) / 2) * 2 : 0;
      const yellow = px >= 8 && px - 8 < inner;
      const color = yellow
        ? py < MID - 4 ? "#ffe39a" : "#f6cf5a"
        : py < MID ? "#d63b2c" : "#a8322a";
      rect(left, py + droop + ripple, 2, 2, color);
    }
  }

  // Shadow the pennant casts on the pole's lit edge.
  if (downwind > 0) rect(2, -62, 2, 4, "#66543f");
}

const APPLE_COLORS = {
  R: "#ed774e",
  D: "#c9573a",
  H: "#ffc295",
  S: "#617144",
  L: "#567a4e",
};

// The fruit's colours under the shine's bright leading edge and its softer
// trail; the stem and leaf don't shine.
const APPLE_SHINE = {
  lead: { R: "#ffd9b8", D: "#f7a07a", H: "#fff1df" },
  trail: { R: "#f9a27a", D: "#e2734f", H: "#ffdcbd" },
};

// Tree canopies are drawn once into sprites, down to these heights above the
// ground anchor; the trunk below is drawn live so its base follows the slope.
// The canopy never reaches below them, and the ground at the trunk never
// rises above them.
const TREE_CANOPY_BOTTOM = -64;
const PINE_CANOPY_BOTTOM = -26;

/**
 * Tools that draw bent by the wind: everything is moved along x by `sway`
 * times how far up the crown it is (0 at `foot`, 1 at `top`, to a power so
 * the top moves most), snapped to the art grid. Each shape moves whole, so a
 * crown drawn from overlapping clumps bends without tearing.
 */
function bentTools(tools, sway, foot, top) {
  const shift = (y) => {
    const up = Math.max(0, Math.min(1, (foot - y) / (foot - top)));
    return Math.round((sway * up ** 1.3) / ART_PIXEL) * ART_PIXEL;
  };
  return {
    ...tools,
    shift,
    pixelRect: (x, y, w, h, color, pixel) => tools.pixelRect(x + shift(y + h / 2), y, w, h, color, pixel),
    drawPixelDisc: (x, y, r, color, pixel) => tools.drawPixelDisc(x + shift(y), y, r, color, pixel),
    pixelPath: (points, color, thickness, pixel) =>
      tools.pixelPath(points.map(([x, y]) => [x + shift(y), y]), color, thickness, pixel),
  };
}

/** Tools that draw everything moved along x by `dx`, for a pine tier that bends whole. */
function movedTools(tools, dx) {
  return {
    ...tools,
    pixelRect: (x, y, w, h, color, pixel) => tools.pixelRect(x + dx, y, w, h, color, pixel),
    drawPixelDisc: (x, y, r, color, pixel) => tools.drawPixelDisc(x + dx, y, r, color, pixel),
    pixelPath: (points, color, thickness, pixel) =>
      tools.pixelPath(points.map(([x, y]) => [x + dx, y]), color, thickness, pixel),
  };
}

// The crown's top, for bending it in the wind.
const TREE_CANOPY_TOP = -182;
// Where the tree's leaves let go from, inside its crown.
const TREE_LEAF_CROWN = { left: -54, right: 54, top: -166, bottom: -96 };

/**
 * The deciduous tree's crown and upper trunk, its foliage and branches bent
 * by `sway` (world units at the top of the crown; see treeSway). The trunk
 * stays upright.
 */
function drawTreeCanopy(tools, sway = 0) {
  // The trunk stays upright; the branches and foliage bend.
  const { pixelRect } = tools;
  const leaves = bentTools(tools, sway, TREE_CANOPY_BOTTOM, TREE_CANOPY_TOP);
  const { pixelPath, drawPixelDisc } = leaves;
  const leafRect = leaves.pixelRect;
  // Upper trunk, hidden behind the crown.
  pixelRect(-8, -114, 16, TREE_CANOPY_BOTTOM + 114, "#66543f", 2);
  pixelRect(2, -110, 6, TREE_CANOPY_BOTTOM + 110, "#856d4f", 2);
  pixelRect(6, -100, 2, TREE_CANOPY_BOTTOM + 100, "#aa8a60", 2);

  // Branch structure, drawn behind the foliage.
  pixelPath(
    [
      [-2, -72],
      [-8, -104],
      [-28, -128],
    ],
    "#66543f",
    3,
    2,
  );
  pixelPath(
    [
      [2, -84],
      [14, -112],
      [32, -130],
    ],
    "#66543f",
    3,
    2,
  );
  pixelPath(
    [
      [4, -88],
      [16, -112],
      [30, -128],
    ],
    "#856d4f",
    1,
    2,
  );

  // Dark rear foliage forms a connected, uneven silhouette.
  // Offset clusters keep the tree organic without shifting
  // the overall crown away from the trunk.
  drawPixelDisc(-30, -112, 28, "#477158", 2);
  drawPixelDisc(30, -112, 30, "#477158", 2);
  drawPixelDisc(-38, -132, 22, "#477158", 2);
  drawPixelDisc(38, -136, 22, "#477158", 2);
  drawPixelDisc(-18, -152, 24, "#477158", 2);
  drawPixelDisc(14, -154, 24, "#477158", 2);
  drawPixelDisc(0, -124, 34, "#477158", 2);

  // Main leaf masses overlap the rear silhouette,
  // leaving shadow pockets along the underside.
  drawPixelDisc(-30, -132, 24, "#4e785c", 2);
  drawPixelDisc(-10, -148, 26, "#4e785c", 2);
  drawPixelDisc(22, -144, 28, "#568061", 2);
  drawPixelDisc(36, -126, 20, "#568061", 2);
  drawPixelDisc(2, -124, 28, "#568061", 2);
  drawPixelDisc(-20, -112, 20, "#4e785c", 2);

  // Smaller sunlit clusters on the upper-right surfaces.
  // Broad patches read clearly at gameplay zoom.
  drawPixelDisc(14, -158, 16, "#618b66", 2);
  drawPixelDisc(34, -144, 12, "#618b66", 2);
  drawPixelDisc(12, -132, 14, "#618b66", 2);

  // A few chunky leaf accents, rather than scattered noise.
  leafRect(-16, -152, 8, 4, "#568061", 2);
  leafRect(-22, -148, 6, 4, "#568061", 2);
  leafRect(28, -116, 8, 4, "#618b66", 2);
  leafRect(22, -112, 6, 4, "#618b66", 2);
  leafRect(-10, -104, 8, 4, "#568061", 2);

  // Top of the first bark detail; the rest is drawn with the lower trunk.
  pixelRect(-4, -68, 2, TREE_CANOPY_BOTTOM + 68, "#856d4f", 2);
}

/**
 * Bough tiers bent by `sway` (world units at `top`): each tier moves whole by
 * how high its middle stands between `foot` and `top`, so the boughs shift
 * tier by tier rather than row by row. `each(tools, tier)` draws extras that
 * ride on a tier, like its snow.
 */
function drawBentTiers(tools, tiers, sway, foot, top, each = null) {
  const { shift } = bentTools(tools, sway, foot, top);
  for (const tier of tiers) {
    const moved = movedTools(tools, shift((tier.top + tier.bottom) / 2));
    drawPineTiers(moved, [tier]);
    if (each) each(moved, tier);
  }
}

function drawPineCanopy(tools, sway = 0) {
  const { pixelRect } = tools;
  // Upper trunk, hidden behind the boughs.
  pixelRect(-6, -100, 12, PINE_CANOPY_BOTTOM + 100, "#66543f", 2);
  pixelRect(2, -100, 4, PINE_CANOPY_BOTTOM + 100, "#856d4f", 2);
  pixelRect(4, -96, 2, PINE_CANOPY_BOTTOM + 96, "#aa8a60", 2);
  // Broad lower boughs first; smaller tiers overlap them. They bend in the wind.
  drawBentTiers(tools, PINE_TIERS, sway, PINE_CANOPY_BOTTOM, -186);
  // Small highlight on the central leader.
  const { shift } = bentTools(tools, sway, PINE_CANOPY_BOTTOM, -186);
  pixelRect(shift(-177), -180, 2, 6, "#618b66", 2);
}

function drawBushCanopy(tools, sway = 0) {
  // Low, broad shrub with overlapping leaf clusters. Its clumps stir in the
  // wind over a base that stays put. Sprite bounds: x -36..36, y -44..0.
  const { pixelRect, drawPixelDisc } = bentTools(tools, sway, 0, -44);

  // Connected shaded base.
  pixelRect(-28, -12, 56, 12, "#477158", 2);
  pixelRect(-30, -8, 60, 6, "#477158", 2);

  // Irregular outer silhouette.
  drawPixelDisc(-20, -16, 12, "#477158", 2);
  drawPixelDisc(18, -16, 12, "#477158", 2);
  drawPixelDisc(-10, -26, 14, "#477158", 2);
  drawPixelDisc(10, -28, 14, "#477158", 2);

  // Broad middle-green leaf masses.
  drawPixelDisc(-20, -18, 10, "#4e785c", 2);
  drawPixelDisc(-8, -26, 12, "#568061", 2);
  drawPixelDisc(10, -28, 12, "#568061", 2);
  drawPixelDisc(20, -18, 10, "#568061", 2);

  // Front foliage overlaps the rear clusters.
  drawPixelDisc(-10, -12, 10, "#4e785c", 2);
  drawPixelDisc(6, -14, 12, "#568061", 2);

  // Sunlight on the upper-right surfaces.
  drawPixelDisc(12, -32, 6, "#618b66", 2);
  drawPixelDisc(22, -20, 4, "#618b66", 2);
  drawPixelDisc(4, -18, 6, "#618b66", 2);

  // A few grouped leaf accents, not scattered noise.
  pixelRect(-14, -30, 6, 2, "#618b66", 2);
  pixelRect(-18, -26, 4, 2, "#568061", 2);
  pixelRect(10, -10, 6, 2, "#4e785c", 2);
  pixelRect(-4, -6, 6, 2, "#477158", 2);
}

// Small props' sprites end at these heights; the part below is drawn live so
// its base follows the slope.
const SAPLING_CANOPY_BOTTOM = -30;
const SMALL_PINE_CANOPY_BOTTOM = -14;
const SMALL_CACTUS_BOTTOM = -8;

function drawSaplingCanopy(tools, sway = 0) {
  // The trunk stays upright; the branch and leaves bend in the wind.
  const { pixelRect } = tools;
  const leaves = bentTools(tools, sway, SAPLING_CANOPY_BOTTOM, -76);
  const { pixelPath, drawPixelDisc } = leaves;
  // Upper trunk, hidden behind the crown.
  pixelRect(-4, -56, 4, SAPLING_CANOPY_BOTTOM + 56, "#66543f", 2);
  pixelRect(0, -56, 2, SAPLING_CANOPY_BOTTOM + 56, "#856d4f", 2);
  pixelRect(2, -52, 2, SAPLING_CANOPY_BOTTOM + 52, "#aa8a60", 2);
  // One young branch, peeking out under the crown.
  pixelPath([[0, -40], [10, -50]], "#66543f", 2, 2);

  // Dark rear silhouette.
  drawPixelDisc(-12, -50, 12, "#477158", 2);
  drawPixelDisc(12, -52, 12, "#477158", 2);
  drawPixelDisc(0, -60, 14, "#477158", 2);
  // Main leaf masses.
  drawPixelDisc(-10, -54, 9, "#4e785c", 2);
  drawPixelDisc(8, -56, 10, "#568061", 2);
  drawPixelDisc(0, -62, 10, "#568061", 2);
  // Sunlit top right.
  drawPixelDisc(8, -64, 6, "#618b66", 2);
  drawPixelDisc(14, -54, 4, "#618b66", 2);
  leaves.pixelRect(-14, -48, 6, 2, "#568061", 2);
}

// The pines' tiered, shaded bough pattern, for any tier list.
function drawPineTiers({ pixelRect }, tiers) {
  for (const { top, bottom, halfWidth } of tiers) {
    const rows = (bottom - top) / 2;
    for (let row = 0; row < rows; row++) {
      const t = row / (rows - 1);
      const half = Math.max(
        2,
        Math.round((2 + (halfWidth - 2) * Math.pow(t, 1.15)) / 2) * 2,
      );
      const py = top + row * 2;
      const underside = row >= rows - 3;
      for (let px = -half; px < half; px += 2) {
        const cellCenter = px + 1;
        const across = (cellCenter + half) / (half * 2);
        const fromCenter = Math.abs(cellCenter);
        if (
          row === rows - 1 &&
          ((fromCenter > half * 0.28 && fromCenter < half * 0.46) ||
            (fromCenter > half * 0.66 && fromCenter < half * 0.82))
        )
          continue;
        let color = "#4e785c";
        if (underside || across < 0.24) color = "#477158";
        else if (across > 0.55 && across < 0.9) color = "#568061";
        if (!underside && row > 3 && row % 9 < 2 && across > 0.64 && across < 0.84)
          color = "#618b66";
        pixelRect(px, py, 2, 2, color, 2);
      }
    }
  }
}

// The big pine under a load of snow. Each tier gets its snow before the tier
// above is drawn, so the tier above covers it.
function drawSnowPineCanopy(tools, sway = 0) {
  const { pixelRect } = tools;
  // Upper trunk, hidden behind the boughs.
  pixelRect(-6, -100, 12, PINE_CANOPY_BOTTOM + 100, "#66543f", 2);
  pixelRect(2, -100, 4, PINE_CANOPY_BOTTOM + 100, "#856d4f", 2);
  pixelRect(4, -96, 2, PINE_CANOPY_BOTTOM + 96, "#aa8a60", 2);
  // Each tier and the snow on it bend together in the wind.
  drawBentTiers(tools, PINE_TIERS, sway, PINE_CANOPY_BOTTOM, -188, drawPineSnow);
  const { shift } = bentTools(tools, sway, PINE_CANOPY_BOTTOM, -188);
  drawPineSnowCap(movedTools(tools, shift(-185)));
}

function drawSmallPineCanopy(tools, sway = 0) {
  const { pixelRect } = tools;
  // Upper trunk, hidden behind the boughs.
  pixelRect(-4, -60, 4, SMALL_PINE_CANOPY_BOTTOM + 60, "#66543f", 2);
  pixelRect(0, -60, 2, SMALL_PINE_CANOPY_BOTTOM + 60, "#856d4f", 2);
  pixelRect(2, -60, 2, SMALL_PINE_CANOPY_BOTTOM + 60, "#aa8a60", 2);
  drawBentTiers(tools, [
    { top: -56, bottom: -14, halfWidth: 22 },
    { top: -72, bottom: -40, halfWidth: 16 },
    { top: -86, bottom: -60, halfWidth: 10 },
  ], sway, SMALL_PINE_CANOPY_BOTTOM, -88);
  // Highlight on the leader.
  const { shift } = bentTools(tools, sway, SMALL_PINE_CANOPY_BOTTOM, -88);
  pixelRect(shift(-82), -84, 2, 4, "#618b66", 2);
}

function drawSmallCactusBody(tools) {
  drawCactusStem(tools, -6, 6, -50, SMALL_CACTUS_BOTTOM);
  drawCactusFlower(tools, 0, -52, CACTUS_COLORS.petalLight);
}

// Saguaro body (trunk and arms) is cached like the canopies; only the base is
// drawn live so it seats on the slope. The ground at the trunk never rises
// above this height.
const CACTUS_BODY_BOTTOM = -12;

const CACTUS_COLORS = {
  deep: "#3d6452",
  shadow: "#477158",
  mid: "#4e785c",
  base: "#568061",
  light: "#618b66",
  spine: "#b9c4af",
  petal: "#e8755b",
  petalLight: "#f1b95d",
  center: "#f4e9d1",
};

// Colour of one 2-unit column across a ribbed stem lit from the right.
// `across` runs from 0 (left edge) to 1 (right edge).
function cactusStemColor(across, groove) {
  const c = CACTUS_COLORS;
  if (across < 0.2) return groove ? c.deep : c.shadow;
  if (across < 0.5) return groove ? c.shadow : c.mid;
  if (across < 0.9) return groove ? c.mid : across > 0.6 ? c.light : c.base;
  return c.base;
}

// Upright ribbed stem with a rounded crown. `foot` rounds the outer bottom
// corner where an arm bends into its elbow, and shades its underside.
function drawCactusStem(
  { pixelRect },
  left,
  right,
  top,
  bottom,
  { foot } = {},
) {
  const c = CACTUS_COLORS;
  const width = right - left;
  const wide = width >= 16;
  for (let x = left; x < right; x += 2) {
    const index = (x - left) / 2;
    const fromEdge = Math.min(index, (right - 2 - x) / 2);
    const across = (x - left + 1) / width;
    const groove = fromEdge > 0 && index % 3 === 0;
    const start =
      top + (fromEdge === 0 ? (wide ? 4 : 2) : fromEdge === 1 && wide ? 2 : 0);
    const end =
      bottom -
      (foot && fromEdge === 0 && (foot === "left") === (x === left) ? 2 : 0);

    pixelRect(x, start, 2, end - start, cactusStemColor(across, groove), 2);
    // Sun on the crown.
    pixelRect(x, start, 2, 2, across > 0.35 ? c.light : c.base, 2);
    if (foot) pixelRect(x, end - 2, 2, 2, across < 0.2 ? c.deep : c.shadow, 2);

    // Sparse, staggered spines along the ridges, not scattered noise.
    if (index % 3 === 1 && fromEdge > 0)
      for (let y = start + 6 + (index % 2) * 6; y < end - 4; y += 12)
        pixelRect(x, y, 2, 2, c.spine, 2);
  }
}

// Horizontal elbow joining an arm to the trunk: sunlit top, shaded underside.
function drawCactusLimb({ pixelRect }, left, right, top, bottom) {
  const c = CACTUS_COLORS;
  const width = right - left;
  pixelRect(left, top, width, bottom - top, c.mid, 2);
  pixelRect(left, top, width, 2, c.light, 2);
  pixelRect(left, top + 2, width, 2, c.base, 2);
  pixelRect(left, bottom - 2, width, 2, c.shadow, 2);
}

// Same cross-shaped blossom as the flowers prop.
function drawCactusFlower({ pixelRect }, x, y, color) {
  pixelRect(x - 2, y, 6, 2, color, 2);
  pixelRect(x, y - 2, 2, 6, color, 2);
  pixelRect(x, y, 2, 2, CACTUS_COLORS.center, 2);
}

function drawCactusBody(tools) {
  const c = CACTUS_COLORS;
  // Arms first, so the trunk overlaps their inner ends.
  // Left arm: lower and shorter, on the trunk's shaded side.
  drawCactusLimb(tools, -24, -8, -44, -36);
  drawCactusStem(tools, -28, -18, -68, -36, { foot: "left" });
  // Right arm: higher and taller, facing the sun.
  drawCactusLimb(tools, 8, 24, -58, -48);
  drawCactusStem(tools, 18, 30, -82, -48, { foot: "right" });

  // Trunk, centred on x = 0.
  drawCactusStem(tools, -10, 10, -96, CACTUS_BODY_BOTTOM);

  drawCactusFlower(tools, 0, -98, c.petal);
  drawCactusFlower(tools, 24, -84, c.petalLight);
}

// Farm props. Each is drawn in the coordinates of its original 2-unit art
// grid, from the top-left corner, and shifted so x = 0 is roughly its centre
// and y = 0 is the ground it stands on.

// Colours the farm props add to the palette: tyre rubber and shirt cloth.
const RUBBER = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const CLOTH = { dark: "#3f6f78", base: "#568f98", light: "#83d1ce" };
const FARM_WOOD = {
  dark: "#4d3f2f",
  base: "#66543f",
  plank: "#806244",
  light: "#856d4f",
  tip: "#aa8a60",
  cut: "#c39664",
};
const FARM_STRAW = { dark: "#d9953a", base: "#f1b95d", light: "#ffe39a" };
const FARM_LEAF = { stem: "#3d6452", dark: "#477158", mid: "#568061", light: "#618b66" };
// The start pennant's reds. Darker than a collectible apple, and these never
// glow or bob, so they don't read as something to pick up.
const PROP_APPLE = { base: "#d63b2c", shade: "#a8322a", shine: "#e8755b" };

// Draws [x, y, width, height, colour] rectangles shifted by (dx, dy).
function drawFarmRects({ pixelRect }, rects, dx, dy) {
  for (const [x, y, width, height, color] of rects)
    pixelRect(x + dx, y + dy, width, height, color, 2);
}

const FARM_APPLE = [
  [2, 2, 4, 8, PROP_APPLE.base],
  [0, 4, 8, 4, PROP_APPLE.base],
  [0, 4, 2, 4, PROP_APPLE.shade],
  [2, 8, 2, 2, PROP_APPLE.shade],
  [4, 4, 2, 2, PROP_APPLE.shine],
  [4, 0, 2, 2, FARM_WOOD.dark],
  [6, 0, 2, 2, FARM_LEAF.light],
];

const FARM_CRATE = [
  [0, 0, 40, 28, FARM_WOOD.dark],
  [4, 0, 32, 8, FARM_WOOD.light],
  [4, 0, 32, 2, FARM_WOOD.tip],
  [4, 10, 32, 8, FARM_WOOD.plank],
  [4, 20, 32, 8, FARM_WOOD.base],
  [16, 12, 8, 4, FARM_WOOD.dark],
  [0, 0, 4, 28, FARM_WOOD.base],
  [36, 0, 4, 28, FARM_WOOD.light],
  [36, 0, 4, 2, FARM_WOOD.tip],
];

// 100 × 72: two crates with a third stacked on top. They are empty, so they
// can hold anything: apple props fill them in the orchard.
function drawCrates(tools) {
  const ox = -50, oy = -72;
  for (const [x, y] of [[2, 44], [46, 44], [24, 16]])
    drawFarmRects(tools, FARM_CRATE, ox + x, oy + y);
}

// 8 × 10: one small apple, to hang in a tree or fill a crate or barrow.
function drawSmallApple(tools) {
  drawFarmRects(tools, FARM_APPLE, -4, -10);
}

// 54 × 100: leans to the right, so it rests against something on its right.
function drawLadder(tools) {
  const ox = -28, oy = -100;
  const rects = [];
  // Rails step 2 units right for every 8 up.
  for (let step = 0; step < 12; step++) {
    const y = 92 - step * 8;
    rects.push([6 + step * 2, y, 4, 8, FARM_WOOD.base]);
    rects.push([26 + step * 2, y, 4, 8, FARM_WOOD.light]);
  }
  // Rungs: lit top, shaded underside.
  for (let rung = 0; rung < 5; rung++) {
    const x = 12 + rung * 4;
    const y = 86 - rung * 16;
    rects.push([x, y, 16, 2, FARM_WOOD.tip]);
    rects.push([x, y + 2, 16, 2, FARM_WOOD.base]);
  }
  rects.push(
    [28, 4, 4, 2, FARM_WOOD.tip],
    [48, 4, 4, 2, FARM_WOOD.tip],
    [6, 98, 4, 2, FARM_WOOD.dark],
    [26, 98, 4, 2, FARM_WOOD.dark],
  );
  drawFarmRects(tools, rects, ox, oy);
}

// 80 × 48: an empty painted barrow, wheel on the right.
function drawWheelbarrow(tools) {
  // 62 × 32, facing right, the wheel at the front.
  const ox = -32, oy = -32;
  drawFarmRects(
    tools,
    [
      // Handle.
      [0, 8, 8, 2, FARM_WOOD.dark],
      [8, 10, 10, 2, FARM_WOOD.base],
      // Frame and leg.
      [14, 20, 36, 2, FARM_WOOD.plank],
      [22, 22, 4, 8, FARM_WOOD.base],
      [20, 30, 8, 2, FARM_WOOD.dark],
    ],
    ox,
    oy,
  );
  drawFarmRects(
    tools,
    [
      // Painted tub.
      [12, 8, 42, 2, FARM_LEAF.light],
      [14, 10, 38, 2, FARM_LEAF.mid],
      [16, 12, 34, 2, "#4e785c"],
      [18, 14, 30, 2, FARM_LEAF.dark],
      [20, 16, 26, 2, FARM_LEAF.dark],
      [22, 18, 22, 2, FARM_LEAF.dark],
      [14, 10, 2, 2, FARM_LEAF.dark],
      [16, 12, 4, 2, FARM_LEAF.stem],
      [18, 14, 4, 2, FARM_LEAF.stem],
      [48, 12, 2, 2, FARM_LEAF.stem],
      // Wheel: rubber tyre, rock-grey hub.
      [48, 14, 8, 2, RUBBER.dark],
      [46, 16, 12, 2, RUBBER.dark],
      [44, 18, 16, 10, RUBBER.dark],
      [46, 28, 12, 2, RUBBER.dark],
      [48, 30, 8, 2, RUBBER.dark],
      [58, 20, 2, 4, RUBBER.base],
      [48, 20, 8, 6, "#697872"],
      [52, 22, 2, 2, "#a2ab9e"],
    ],
    ox,
    oy,
  );
}

// 64 × 112. The sprite stops above the ground; the post below it is drawn
// live so it follows the slope, and the face is drawn live so it can turn.
const SCARECROW_OX = -32;
const SCARECROW_OY = -112;
const SCARECROW_BODY_BOTTOM = -32;
// Eyes and mouth for each way the head can look, in sprite coordinates.
const SCARECROW_FACES = {
  left: [[24, 26], [30, 26], [26, 32], [30, 32]],
  front: [[26, 26], [36, 26], [28, 32], [34, 32]],
  right: [[32, 26], [38, 26], [32, 32], [36, 32]],
};
// How far the rider must be to one side before a watching prop (the
// scarecrow, the snowman) turns to follow.
const WATCH_TURN = 60;

function drawScarecrow(tools) {
  const s = FARM_STRAW;
  drawFarmRects(
    tools,
    [
      // Post, down to where the live part takes over.
      [30, 40, 2, 40, FARM_WOOD.base],
      [32, 40, 2, 40, FARM_WOOD.light],
      // Sleeves.
      [6, 42, 14, 10, CLOTH.dark],
      [6, 42, 14, 2, CLOTH.base],
      [44, 42, 14, 10, CLOTH.base],
      [44, 50, 14, 2, CLOTH.dark],
      // Plaid shirt with a red patch and a rope belt.
      [20, 42, 24, 30, CLOTH.base],
      [20, 42, 6, 30, CLOTH.dark],
      [20, 54, 24, 2, CLOTH.dark],
      [32, 42, 2, 30, CLOTH.dark],
      [42, 44, 2, 24, CLOTH.light],
      [36, 58, 6, 6, PROP_APPLE.base],
      [36, 62, 2, 2, PROP_APPLE.shade],
      [20, 66, 24, 2, s.dark],
      // Straw poking out of the cuffs and hem.
      [2, 44, 4, 2, s.base],
      [4, 52, 2, 2, s.base],
      [58, 44, 4, 2, s.base],
      [58, 52, 2, 2, s.base],
      [22, 72, 2, 6, s.base],
      [38, 72, 2, 4, s.base],
      [0, 48, 6, 2, s.dark],
      [58, 48, 6, 2, s.dark],
      [26, 72, 2, 4, s.dark],
      [42, 72, 2, 6, s.dark],
      // Burlap head.
      [24, 20, 16, 20, FARM_WOOD.cut],
      [22, 22, 20, 16, FARM_WOOD.cut],
      [22, 22, 4, 16, FARM_WOOD.tip],
      [24, 38, 16, 2, FARM_WOOD.tip],
      [26, 38, 12, 2, s.dark],
      // Hair and hat.
      [18, 22, 4, 4, s.dark],
      [42, 22, 4, 4, s.base],
      [16, 18, 32, 2, FARM_WOOD.plank],
      [16, 20, 32, 2, FARM_WOOD.dark],
      [22, 8, 20, 10, FARM_WOOD.base],
      [22, 8, 4, 10, FARM_WOOD.dark],
      [38, 8, 4, 6, FARM_WOOD.light],
      [22, 14, 20, 2, PROP_APPLE.base],
    ],
    SCARECROW_OX,
    SCARECROW_OY,
  );
}

// 56 × 72: a straw skep on a stool. The bees are drawn live.
function drawBeehive(tools) {
  const s = FARM_STRAW;
  const rects = [
    // Stool.
    [10, 54, 4, 18, FARM_WOOD.base],
    [42, 54, 4, 18, FARM_WOOD.light],
    [6, 50, 44, 4, FARM_WOOD.plank],
    [6, 50, 44, 2, FARM_WOOD.tip],
    // Knob on top.
    [24, 10, 8, 4, s.base],
    [24, 10, 2, 4, s.dark],
  ];
  // Coiled bands: [left, top, width], each with a groove, a shaded left end
  // and a lit right shoulder.
  const bands = [
    [20, 14, 16, 4],
    [14, 20, 28, 6],
    [10, 26, 36, 6],
    [8, 32, 40, 6],
    [8, 38, 40, 6],
    [10, 44, 36, 6],
  ];
  for (const [x, y, width] of bands) rects.push([x, y, width, 6, s.base]);
  for (const [x, y, width, shade] of bands) {
    rects.push([x, y + 4, width, 2, s.dark]);
    rects.push([x, y, shade, 6, s.dark]);
  }
  for (const [x, y, width] of bands)
    rects.push([x + width - 8, y, 4, 2, s.light]);
  rects.push([26, 42, 4, 2, FARM_WOOD.dark], [24, 44, 8, 6, FARM_WOOD.dark]);
  drawFarmRects(tools, rects, -28, -72);
}
// Where each bee hovers, relative to the hive's anchor.
const BEES = [
  [14, -62],
  [-22, -52],
  [6, -32],
];

// 64 × 40: the logo's tyre, a tractor tyre about 1.9 m across, worn and
// sunk in the ground past its middle. It sits a little below its anchor so the
// dirt at its base blends into the ground.
const TYRE_SINK = 4;
const TYRE = { hole: 12, wall: 22, outer: 26, lug: 30, centre: -6 };
function drawTyre({ pixelRect }) {
  const r = RUBBER;
  const cy = TYRE.centre;
  // The ring, cell by cell: the dirt-filled hole, a rim, the sidewall lit at
  // the upper right, and the tread, its lugs standing proud of the edge.
  const lug = (angle) => ((angle / 0.4) % 1 + 1) % 1 < 0.5;
  for (let y = cy - TYRE.lug; y < TYRE_SINK; y += 2)
    for (let x = -TYRE.lug; x < TYRE.lug; x += 2) {
      const dx = x + 1, dy = cy - (y + 1);
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const lit = (dx * 0.6 + dy * 0.8) / Math.max(d, 1);
      let color = null;
      if (d < TYRE.hole) color = FARM_WOOD.dark;
      else if (d < TYRE.hole + 2) color = r.dark;
      else if (d < TYRE.wall) color = lit > 0.55 ? r.light : lit < -0.45 ? r.dark : r.base;
      else if (d < TYRE.outer) color = lug(angle) ? (lit > 0.6 ? r.light : r.base) : r.dark;
      else if (d < TYRE.lug && lug(angle)) color = lit > 0.6 ? r.base : r.dark;
      if (color) pixelRect(x, y, 2, 2, color, 2);
    }
  // A weed growing in the hole, and dirt and grass heaped at the base.
  pixelRect(0, -8, 2, 10, "#4e785c", 2);
  pixelRect(2, -6, 2, 2, FARM_LEAF.light, 2);
  pixelRect(-2, -4, 2, 2, FARM_LEAF.mid, 2);
  for (const side of [-1, 1]) {
    const x = side < 0 ? -TYRE.lug - 2 : TYRE.lug - 8;
    pixelRect(x, 0, 10, 4, FARM_WOOD.plank, 2);
    pixelRect(x + 2, -2, 2, 2, side < 0 ? FARM_LEAF.mid : FARM_LEAF.light, 2);
    pixelRect(x + 6, -4, 2, 4, side < 0 ? FARM_LEAF.light : FARM_LEAF.mid, 2);
  }
}

// What a prop can react to: the time in seconds for its animation, the
// rider's position, the trail's weather (resolved, see weather.js) for the
// wind, and the last hard landing ({ x, y, time, strength }). Without them,
// props stand still in the default breeze and the scarecrow and snowman look
// ahead.
const NO_SCENE = { time: 0, riderX: null, riderY: null, weather: resolveWeather(), landing: null };

/**
 * The wind on a prop: how hard it blows (`wind`, 0…1) and which way in the
 * prop's own frame (`downwind`, -1 or 1), so a mirrored prop still blows the
 * same way as the rest of the world.
 */
function propWind(scene, mirrored) {
  const weather = scene.weather ?? NO_SCENE.weather;
  return { wind: weather.wind, downwind: windSign(weather) * (mirrored ? -1 : 1) };
}

/**
 * Which way a prop at `x` turns to watch the rider: -1, 0 or 1 in its own
 * frame, so a mirrored prop still looks the right way.
 */
function riderSide(scene, x, mirrored) {
  if (!Number.isFinite(scene.riderX)) return 0;
  const dx = (scene.riderX - x) * (mirrored ? -1 : 1);
  return dx < -WATCH_TURN ? -1 : dx > WATCH_TURN ? 1 : 0;
}

// Local bounds [left, top, right, bottom] of each canopy sprite, in world units.
const CANOPY_SPRITES = {
  // Room either side for the crown bending in the wind (TREE_SWAY_MAX).
  tree: { bounds: [-68, -182, 68, TREE_CANOPY_BOTTOM], draw: drawTreeCanopy },
  pine: { bounds: [-52, -186, 52, PINE_CANOPY_BOTTOM], draw: drawPineCanopy },
  bush: {
    bounds: [-36, -44, 36, 0],
    draw: drawBushCanopy,
  },
  cactus: {
    bounds: [-32, -104, 32, CACTUS_BODY_BOTTOM],
    draw: drawCactusBody,
  },
  sapling: {
    bounds: [-32, -76, 32, SAPLING_CANOPY_BOTTOM],
    draw: drawSaplingCanopy,
  },
  "pine-small": {
    bounds: [-28, -88, 28, SMALL_PINE_CANOPY_BOTTOM],
    draw: drawSmallPineCanopy,
  },
  "cactus-small": {
    bounds: [-8, -56, 8, SMALL_CACTUS_BOTTOM],
    draw: drawSmallCactusBody,
  },
  crates: { bounds: [-50, -72, 50, 0], draw: drawCrates },
  apple: { bounds: [-4, -10, 4, 0], draw: drawSmallApple },
  ladder: { bounds: [-28, -100, 26, 0], draw: drawLadder },
  wheelbarrow: { bounds: [-34, -34, 30, 0], draw: drawWheelbarrow },
  scarecrow: {
    bounds: [SCARECROW_OX, SCARECROW_OY, -SCARECROW_OX, SCARECROW_BODY_BOTTOM],
    draw: drawScarecrow,
  },
  beehive: { bounds: [-28, -72, 28, 0], draw: drawBeehive },
  tyre: { bounds: [-34, TYRE.centre - TYRE.lug - 2, 34, TYRE_SINK], draw: drawTyre },
  cone: { bounds: [-10, -24, 10, 0], draw: drawCone },
  barrier: { bounds: [-40, -38, 40, 0], draw: drawBarrier },
  dumpster: { bounds: [-40, -72, 40, 0], draw: drawDumpster },
  lamp: { bounds: [-6, LAMP_HEAD.y - 14, 34, LAMP_BODY_BOTTOM], draw: drawLamp },
  crane: { bounds: [-72, CRANE_LIGHTS[0][1] - 4, 174, CRANE_BODY_BOTTOM], draw: drawCrane },
  scaffolding: { bounds: [-52, -142, 52, 0], draw: drawScaffoldDecks },
  graffiti: { bounds: GRAFFITI_BOUNDS, draw: drawGraffiti },
  minecart: { bounds: [-26, -38, 26, 0], draw: drawMinecart },
  skull: { bounds: [-22, -26, 22, 0], draw: drawCowSkull },
  "car-wreck": { bounds: [-70, -44, 70, WRECK_SINK], draw: drawCarWreck },
  "water-tower": { bounds: [-38, -178, 40, TOWER_BODY_BOTTOM], draw: drawWaterTower },
  windmill: { bounds: [-62, -172, 24, WINDMILL_BODY_BOTTOM], draw: drawWindmillTower },
  "snow-pine": { bounds: [-54, -188, 54, PINE_CANOPY_BOTTOM], draw: drawSnowPineCanopy },
  "ski-lift": { bounds: [-28, PYLON_TOP, 28, PYLON_BODY_BOTTOM], draw: drawPylon },
  hut: { bounds: HUT_BOUNDS, draw: drawHut },
  cairn: { bounds: [-16, -44, 16, 0], draw: drawCairn },
  snowman: { bounds: [-28, -78, 28, 0], draw: drawSnowman },
  "tyre-wall": { bounds: TYRE_WALL_BOUNDS, draw: drawTyreWall },
  "hay-bales": { bounds: HAY_BALES_BOUNDS, draw: drawHayBales },
  "pit-board": { bounds: [PIT_BOARD.left, PIT_BOARD.top, PIT_BOARD.left + PIT_BOARD.width, PIT_BOARD_BOTTOM + 4], draw: drawPitBoard },
  "petrol-can": { bounds: [-12, -36, 12, 0], draw: drawPetrolCan },
  "camera-tower": { bounds: [-30, -152, 30, CAMERA_TOWER_BODY_BOTTOM], draw: drawCameraTower },
  "warning-triangle": { bounds: [-18, -58, 18, -22], draw: drawWarningTriangle },
  "warning-bang": { bounds: [-16, -56, 16, -24], draw: drawWarningBang },
  "warning-skull": { bounds: [-16, -56, 16, -24], draw: drawWarningSkull },
  "arrow-sign": { bounds: [-24, -48, 24, -24], draw: drawArrowSign },
  "tutorial-lean": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLean },
  "tutorial-flip": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialFlip },
  "tutorial-rotate": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialRotate },
  "tutorial-restart": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialRestart },
  "tutorial-ledge": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLedge },
  "tutorial-gas": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialGas },
  "tutorial-brake": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialBrake },
  "tutorial-light": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLight },
  "tutorial-lean-forward": { bounds: TUTORIAL_BOUNDS, draw: drawTutorialLeanForward },
  "tally-marks": { bounds: TALLY_BOUNDS, draw: drawTallyMarks },
  "prison-fence": { bounds: PRISON_FENCE_BOUNDS, draw: drawPrisonFence },
  watchtower: { bounds: [-36, SEARCHLIGHT.y + 4, 36, WATCHTOWER_BODY_BOTTOM], draw: drawWatchtower },
  "jail-cell": { bounds: [-42, -86, 42, 0], draw: drawCellBack },
  "ball-and-chain": { bounds: [-22, -14, 20, 0], draw: drawBallAndChain },
  "escape-tunnel": { bounds: [-28, -26, 28, 0], draw: drawTunnelMound },
  torch: { bounds: [-12, TORCH_FLAME.y - 2, 12, TORCH_BODY_BOTTOM], draw: drawTorchStand },
  skeleton: { bounds: [-22, -26, 30, 0], draw: drawSkeletonBody },
  tent: { bounds: [-TENT.half - 4, TENT.apex - 6, TENT.half + 4, 0], draw: drawTent },
  "christiania-bike": { bounds: [-34, -44, 42, 0], draw: drawChristianiaBike },
  bench: { bounds: [-38, -44, 38, 0], draw: drawBench },
  fireplace: { bounds: [-22, -12, 22, 0], draw: drawFireplace },
  mill: { bounds: [-48, -174, 48, MILL.bodyBottom], draw: drawMillTower },
  // Its variant is the wash: 0 limewashed white, 1 yellow ochre.
  farmhouse: { bounds: FARMHOUSE_BOUNDS, draw: drawFarmhouse },
  stall: { bounds: STALL_BOUNDS, draw: drawStall },
  "wind-turbine": { bounds: TURBINE_BOUNDS, draw: drawTurbineTower },
  "wanted-poster": { bounds: [WANTED.left, WANTED.top, WANTED.left + WANTED.width, WANTED.top + WANTED.height], draw: drawWantedPoster },
};
const canopySprites = new Map();

/** A canopy's cached sprite; `variant` is how far a crown that bends is bent. */
function canopySprite(type, variant = 0) {
  const key = variant ? `${type}:${variant}` : type;
  if (canopySprites.has(key)) return canopySprites.get(key);
  const {
    bounds: [left, top, right, bottom],
    draw,
  } = CANOPY_SPRITES[type];
  const canvas = createCanvas(
    (right - left) / ART_PIXEL,
    (bottom - top) / ART_PIXEL,
  );
  const context = canvas.getContext("2d");
  context.setTransform(
    1 / ART_PIXEL,
    0,
    0,
    1 / ART_PIXEL,
    -left / ART_PIXEL,
    -top / ART_PIXEL,
  );
  draw(createDrawingTools(context), variant);
  const sprite = {
    canvas,
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
  canopySprites.set(key, sprite);
  return sprite;
}
// A sign reading "GO" (or a "start" prop) is drawn as the start pennant.
const isStartSign = (type, text) =>
  type === "start" ||
  (type === "sign" &&
    String(text || "")
      .trim()
      .toUpperCase() === "GO");

// Generous local bounds [left, top, right] of each prop, in world units; the
// bottom follows the ground under it.
const PROP_EXTENTS = {
  // Room for the crown bending in the wind (TREE_SWAY_MAX), and for its
  // leaves drifting downwind, either way, as they fall.
  tree: [-300, -184, 300],
  pine: [-52, -186, 52],
  bush: [-36, -44, 36],
  fence: [-42, -38, 42],
  rock: [-18, -20, 20],
  boulder: [-24, -42, 24],
  flowers: [-16, -22, 16],
  stump: [-12, -18, 12],
  cactus: [-32, -104, 32],
  "cactus-small": [-14, -58, 14],
  sapling: [-32, -78, 32],
  "pine-small": [-28, -90, 28],
  pebbles: [-14, -12, 14],
  crystal: [-16, -42, 16],
  // The pennant flies downwind, either way.
  start: [-48, -102, 48],
  vines: [-16, -10, 16],
  roots: [-32, -16, 32],
  // Moss lies along whatever surface it finds, so any way round.
  moss: [-32, -32, 32],
  crates: [-50, -72, 50],
  apple: [-6, -12, 6],
  ladder: [-28, -100, 26],
  wheelbarrow: [-34, -36, 30],
  scarecrow: [-32, -112, 32],
  beehive: [-32, -80, 32],
  tyre: [-36, TYRE.centre - TYRE.lug - 4, 36],
  cone: [-12, -26, 12],
  barrier: [-42, -40, 42],
  dumpster: [-42, -74, 42],
  lamp: [-8, LAMP_HEAD.y - 16, 36],
  crane: [-74, CRANE_LIGHTS[0][1] - 6, 176],
  scaffolding: [-54, -144, 54],
  bird: [-12, -20, 12],
  squirrel: [-16, -32, 14],
  corgi: [CORGI_BOUNDS[0] - 2, CORGI_BOUNDS[1] - 4, CORGI_BOUNDS[2] + 2],
  rabbit: [RABBIT_BOUNDS[0] - 2, RABBIT_BOUNDS[1] - 4, RABBIT_BOUNDS[2] + 2],
  graffiti: [GRAFFITI_BOUNDS[0], GRAFFITI_BOUNDS[1], GRAFFITI_BOUNDS[2]],
  ivy: [-24, -IVY.max - 10, 24],
  "hanging-roots": [-16, -CEILING_REACH - 4, 16],
  stalactites: [-20, -CEILING_REACH - 4, 20],
  drip: [-10, -CEILING_REACH - 4, 10],
  lantern: [-8, -CEILING_REACH - 4, 8],
  bats: [-16, -CEILING_REACH - 4, 18],
  mushrooms: [-20, -34, 20],
  minecart: [-RAIL_REACH - 4, -52, RAIL_REACH + 4],
  beams: [-BEAM_HALF - 2, -BEAM_REACH - 12, BEAM_HALF + 2],
  lily: [-18, -SURFACE_REACH - 12, 22],
  duck: [-14, -SURFACE_REACH - 20, 16],
  // A frog leaps out either way, and its splash spreads.
  frog: [-60, -SURFACE_REACH - 44, 60],
  boat: [-36, -SURFACE_REACH - 30, 50],
  dragonfly: [-DRAGONFLY_RANGE.x - 12, -SURFACE_REACH - DRAGONFLY_RANGE.high - 12, DRAGONFLY_RANGE.x + 12],
  bubbles: [-8, -SURFACE_REACH - 40, 10],
  fish: [-FISH_RANGE - 14, -SURFACE_REACH, FISH_RANGE + 14],
  seaweed: [-16, -SEAWEED_MAX - 16, 16],
  reeds: [-24, -REED_MAX - 20, 28],
  skull: [-22, -26, 22],
  // It rolls downwind, either way.
  tumbleweed: [-TUMBLEWEED_RUN - 16, -TUMBLEWEED_RADIUS * 2 - 12, TUMBLEWEED_RUN + 16],
  "car-wreck": [-70, -46, 70],
  "water-tower": [-38, -178, 42],
  windmill: [-62, ROTOR.y - ROTOR.radius - 4, ROTOR.radius + 4],
  "heat-haze": [-HAZE_HALF - 4, -HAZE_RISE - 8, HAZE_HALF + 4],
  vulture: [-VULTURE_ORBIT.x - 30, -VULTURE_HEIGHT - VULTURE_ORBIT.y - 16, VULTURE_ORBIT.x + 30],
  cairn: [-16, -44, 16],
  // The rope and the chair on it reach well out either side of the tower.
  // The rope runs out either side and climbs above the tower to the right.
  "ski-lift": [-CABLE_HALF - 24, Math.min(PYLON_TOP, CABLE_TOP) - 4, CABLE_HALF + 24],
  icicles: [-22, -CEILING_REACH - 4, 22],
  spiderweb: [-36, -CEILING_REACH - 4, 36],
  cobweb: [-40, -CEILING_REACH - 4, 40],
  spider: [-14, -CEILING_REACH - 4, 14],
  cocoon: [-12, -CEILING_REACH - 4, 12],
  // Room for the snow a hard landing knocks off, and the cloud it raises.
  "snow-pine": [-70, -192, 70],
  // Room for the chimney smoke rising and blowing downwind, either way.
  hut: [-100, HUT_CHIMNEY.y - 86, 100],
  snowman: [-28, -78, 28],
  "tyre-wall": [-48, -34, 48],
  "hay-bales": [-38, -42, 38],
  // The tape's loose end blows out past either stake.
  "course-tape": [TAPE_STAKES[0] - 26, -40, TAPE_STAKES[1] + 26],
  // Wide enough for the longest banner text, posts and all.
  banner: [-92, BANNER_TOP - 6, 92],
  spectators: [-36, -72, 36],
  "pit-board": [PIT_BOARD.left - 2, PIT_BOARD.top - 2, PIT_BOARD.left + PIT_BOARD.width + 2],
  "petrol-can": [-12, -36, 12],
  "marshal-start": [-36, -88, 44],
  "marshal-finish": [-36, -88, 44],
  "camera-tower": [-30, -152, 30],
  "warning-triangle": [-18, -60, 18],
  "warning-bang": [-16, -58, 16],
  "warning-skull": [-16, -58, 16],
  "arrow-sign": [-24, -50, 24],
  // The cloth flies downwind, either side of the pole.
  "halfway-flag": [-HALFWAY_CLOTH.x - HALFWAY_CLOTH.columns * 2 - 2, HALFWAY_BEACON.y - 8, HALFWAY_BOARD.left + HALFWAY_BOARD.width + 2],
  "tutorial-lean": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-flip": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-rotate": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-restart": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-ledge": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-gas": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-brake": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-light": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tutorial-lean-forward": [TUTORIAL_BOUNDS[0], TUTORIAL_BOUNDS[1], TUTORIAL_BOUNDS[2]],
  "tally-marks": [TALLY_BOUNDS[0], TALLY_BOUNDS[1], TALLY_BOUNDS[2]],
  "prison-fence": [PRISON_FENCE_BOUNDS[0], PRISON_FENCE_BOUNDS[1], PRISON_FENCE_BOUNDS[2]],
  // Room for the searchlight turning on the roof.
  watchtower: [-38, SEARCHLIGHT.y - 14, 38],
  "jail-cell": [-42, -86, 42],
  "ball-and-chain": [-22, -14, 20],
  // The prisoner's head pokes up out of the hole.
  "escape-tunnel": [-28, -34, 28],
  "wanted-poster": [WANTED.left - 2, WANTED.top - 2, WANTED.left + WANTED.width + 2],
  "dungeon-bars": [-BARS.half - 2, -BARS.reach - 12, BARS.half + 2],
  portcullis: [-PORTCULLIS.half - 2, -CEILING_REACH - 4, PORTCULLIS.half + 2],
  "hanging-chains": [-26, -CEILING_REACH - 4, 26],
  gibbet: [-40, -CEILING_REACH - 4, 40],
  // Room for the sparks rising off the flame.
  torch: [-12, TORCH_FLAME.y - 36, 12],
  skeleton: [-24, -38, 32],
  // Guy ropes out to the pegs either side.
  tent: [-TENT.peg - 4, TENT.apex - 6, TENT.peg + 4],
  // Room for the blades bent flat as the rider brushes through.
  grass: [-44, -30, 44],
  // The flag flies out downwind, either way.
  flagpole: [-44, FLAGPOLE.top - 8, 44],
  "christiania-bike": [-34, -44, 42],
  bench: [-38, -44, 38],
  // Room for the smoke rising and blowing downwind, either way.
  fireplace: [-80, FIRE.smoke - 90, 80],
  smoke: [-80, -96, 80],
  // The sails sweep round the hub, above and either side of the tower.
  mill: [-MILL.sail - 4, MILL.hub.y - MILL.sail - 4, MILL.sail + 4],
  // Room for the chimney smoke rising and blowing downwind, either way.
  farmhouse: [-150, FARMHOUSE.chimney.y - 86, 150],
  // Room for the flag swung out to the right.
  mailbox: [-14, -58, 26],
  stall: [STALL_BOUNDS[0], STALL_BOUNDS[1], STALL_BOUNDS[2]],
  // The blades sweep round the hub, above and either side of the tower.
  "wind-turbine": [-TURBINE.blade - 4, TURBINE.hub.y - TURBINE.blade - 4, TURBINE.blade + 4],
};
// How far below its anchor each ceiling prop's art can reach.
const CEILING_HANG = {
  "hanging-roots": 72,
  stalactites: 36,
  drip: 260,
  lantern: 4,
  bats: 20,
  icicles: 260,
  spiderweb: WEB_HANG,
  cobweb: COBWEB_HANG,
  spider: SPIDER_DROP + 12,
  cocoon: COCOON_HANG,
  portcullis: PORTCULLIS.max,
  "hanging-chains": CHAINS_HANG,
  gibbet: GIBBET_HANG,
};
// How far below its anchor each water prop's art can reach, once moved onto
// the surface, to its depth or down to the bed.
// The rings a frog's splash leaves on the water.
const WATER_RING = "#d9ffff";
const WATER_HANG = { lily: 32, duck: 32, fish: SURFACE_REACH, seaweed: 200, reeds: 200, frog: 32, boat: 32, dragonfly: 32, bubbles: 200 };

function propBounds(type, angle, groundOffset, text, flip = false) {
  let [left, top, right] = PROP_EXTENTS[type] || [-64, -190, 64];
  if (flip) [left, right] = [-right, -left];
  if (type === "bush") {
    // Bound the intact, rotated sprite—not terrain-shifted columns.
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const corners = [
      [left, top],
      [right, top],
      [left, 0],
      [right, 0],
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [px, py] of corners) {
      const rx = px * c - py * s;
      const ry = px * s + py * c;

      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }

    return [minX - 4, minY - 4, maxX + 4, maxY + 4];
  }
  if (type === "sign") {
    const { inner, height } = signBoard(text);
    const half = inner / 2 + 4;
    [left, top, right] = [-half, -22 - height, half];
  }
  let bottom = Math.max(
    0,
    groundOffset(left),
    groundOffset(0),
    groundOffset(right),
  );
  if (type === "tyre") bottom = Math.max(bottom, TYRE_SINK);
  if (type === "car-wreck") bottom = Math.max(bottom, WRECK_SINK);
  if (type === "vulture") bottom = Math.max(bottom, VULTURE_ORBIT.y + 12);
  if (PAINTED_PROPS.has(type)) bottom = Math.max(bottom, paintedBounds(type)[3]);
  if (CEILING_HANG[type]) bottom = Math.max(bottom, CEILING_HANG[type]);
  if (WATER_HANG[type]) bottom = Math.max(bottom, WATER_HANG[type]);
  // Wall props reach below their anchor, so faded ones need a taller box.
  if (WALL_PROPS.has(type))
    bottom = Math.max(bottom, type === "vines" ? VINE_MAX + 8 : 28);
  if (angle) {
    const reach = Math.max(-left, -top, right, bottom);
    [left, top, right, bottom] = [-reach, -reach, reach, reach];
  }
  return [left - 4, top - 4, right + 4, bottom + 4];
}

const BACKGROUND_STRIP_WIDTH = 512;
const BACKGROUND_STRIP_TOP = 120;
const BACKGROUND_STRIP_HEIGHT = 400;
const BACKGROUND_STRIP_LIMIT = 64;
const BIKE_SPRITE_REACH = 80;

export function createGameArt(ctx) {
  const { pixelRect, pixelPath, drawPixelDisc, drawPixelText } =
    createDrawingTools(ctx);
  const TAU = Math.PI * 2;
  const spikeSprites = new Map();
  const flowerSprites = new Map();
  const backgroundStrips = new Map();
  // Head sprites by look key and helmet state.
  const headSprites = new Map();
  let bikeSprite = null;
  let propLayer = null;

  // Moving sprites sit at their exact position rounded to whole device pixels,
  // so they glide instead of stepping a full art pixel at a time.
  function translateToDevice(x, y) {
    const scale = ctx.getTransform().a || 1;
    ctx.translate(Math.round(x * scale) / scale, Math.round(y * scale) / scale);
  }

  /** The apple at (x, y); `shine` is the diagonal its shine is on (see appleShine), or null. */
  function drawApple(x, y, shine = null) {
    const left = Math.round(x / ART_PIXEL) * ART_PIXEL - 11;
    const top = Math.round(y / ART_PIXEL) * ART_PIXEL - 12;
    for (let row = 0; row < APPLE_SPRITE.length; row++) {
      const line = APPLE_SPRITE[row];
      for (let column = 0; column < line.length; column++) {
        const key = line[column];
        const diagonal = column + row;
        const glint = shine === null ? null
          : diagonal === shine ? APPLE_SHINE.lead
          : diagonal === shine - 1 ? APPLE_SHINE.trail
          : null;
        const color = glint?.[key] ?? APPLE_COLORS[key];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          left + column * ART_PIXEL - 1,
          top + row * ART_PIXEL,
          ART_PIXEL,
          ART_PIXEL,
        );
      }
    }
  }

  const FLOWER_COLORS = {
    open: {
      edge: "#b9c4af",
      rim: "#d4dbc6",
      shade: "#e8ecd9",
      petal: "#fffdf4",
      halo: "#fbf0ce",
      ring: "#d9953a",
      core: "#f4c64e",
      glint: "#fff0a8",
    },
    locked: {
      edge: "#758477",
      rim: "#97a596",
      shade: "#b9c4af",
      petal: "#d9dccb",
      halo: "#e8dcb0",
      ring: "#9c8452",
      core: "#c9b27a",
      glint: "#e8dcb0",
    },
  };

  // The petals turn, but rotating a pixel sprite breaks up its edges. So each
  // step of the turn is drawn straight onto the pixel grid instead: every art
  // pixel is tested against the turned petals, and the outline is added
  // afterwards as a ring one pixel wide round whatever they cover, so the
  // flower's edge stays whole at every angle. The light stays put, from the
  // upper right, while the petals turn under it. The petals repeat every
  // eighth of a turn, so that is all that needs drawing.
  const FLOWER_REACH = 20;
  const FLOWER_STEPS = 24;
  // Petal layers: distance out from the centre, half-length, half-width.
  const FLOWER_SHADE = [9.5, 6.5, 2.6];
  const FLOWER_FACE = [10, 5, 2];
  function flowerFrame(locked, step) {
    const key = `${locked ? "locked" : "open"}:${step}`;
    if (flowerSprites.has(key)) return flowerSprites.get(key);
    const cells = (FLOWER_REACH * 2) / ART_PIXEL;
    const turn = (step / FLOWER_STEPS) * (TAU / 8);
    const axes = Array.from({ length: 8 }, (_, i) => {
      const angle = turn + (i * TAU) / 8;
      return [Math.cos(angle), Math.sin(angle)];
    });
    const covers = ([distance, along, across], px, py) =>
      axes.some(([ux, uy]) => {
        const dx = px - ux * distance, dy = py - uy * distance;
        const u = (dx * ux + dy * uy) / along, v = (dy * ux - dx * uy) / across;
        return u * u + v * v <= 1;
      });
    // Each pixel takes the layer covering at least half of it (four samples).
    const layer = (column, row) => {
      let face = 0, shade = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const px = (column + sx) * ART_PIXEL - FLOWER_REACH;
        const py = (row + sy) * ART_PIXEL - FLOWER_REACH;
        if (covers(FLOWER_FACE, px, py)) face++;
        else if (covers(FLOWER_SHADE, px, py)) shade++;
      }
      return face >= 2 ? 2 : face + shade >= 2 ? 1 : 0;
    };
    const grid = [];
    for (let row = 0; row < cells; row++)
      for (let column = 0; column < cells; column++) grid.push(layer(column, row));
    const filled = (column, row) =>
      column >= 0 && row >= 0 && column < cells && row < cells && grid[row * cells + column] > 0;
    const c = FLOWER_COLORS[locked ? "locked" : "open"];
    const canvas = createCanvas(cells, cells);
    const context = canvas.getContext("2d");
    for (let row = 0; row < cells; row++)
      for (let column = 0; column < cells; column++) {
        const value = grid[row * cells + column];
        let color = value === 2 ? c.petal : value === 1 ? c.shade : null;
        if (!color) {
          // Side neighbours only, so the outline doesn't bridge the gaps
          // between petals.
          const touching =
            filled(column - 1, row) || filled(column + 1, row) ||
            filled(column, row - 1) || filled(column, row + 1);
          if (!touching) continue;
          // Edges facing the light are softer than those in shadow.
          color = filled(column - 1, row + 1) && !filled(column + 1, row - 1) ? c.rim : c.edge;
        }
        context.fillStyle = color;
        context.fillRect(column, row, 1, 1);
      }
    const frame = { canvas, reach: FLOWER_REACH };
    flowerSprites.set(key, frame);
    return frame;
  }

  // Sparkles twinkling round an open flower: where on the ring, and when.
  const FLOWER_SPARKLES = [
    [-0.7, 0],
    [1.4, 0.35],
    [2.9, 0.7],
  ];

  // Pass your game clock as `time` (seconds) so the flower stops when paused.
  function drawFlag(x, y, unlocked, time) {
    const seconds =
      time ??
      (typeof performance !== "undefined" ? performance.now() : Date.now()) /
        1000;
    const cx = Math.round(x / ART_PIXEL) * ART_PIXEL;
    const cy = Math.round((y - FINISH_FLOWER_LIFT) / ART_PIXEL) * ART_PIXEL;
    const c = FLOWER_COLORS[unlocked ? "open" : "locked"];

    if (unlocked) {
      // A halo that breathes slowly, brighter towards the middle.
      const alpha = ctx.globalAlpha;
      const breath = seconds ? 0.5 + 0.5 * Math.sin(seconds * 2.2) : 0.5;
      ctx.globalAlpha = alpha * 0.28;
      drawPixelDisc(cx, cy, 26, c.halo, ART_PIXEL);
      ctx.globalAlpha = alpha * (0.2 + 0.15 * breath);
      drawPixelDisc(cx, cy, 20, c.halo, ART_PIXEL);
      ctx.globalAlpha = alpha;
    }

    const turn = (seconds * (unlocked ? 1.6 : 0.35)) % (TAU / 8);
    const step = Math.floor((turn / (TAU / 8)) * FLOWER_STEPS) % FLOWER_STEPS;
    const frame = flowerFrame(!unlocked, step);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      frame.canvas,
      cx - frame.reach,
      cy - frame.reach,
      frame.reach * 2,
      frame.reach * 2,
    );
    ctx.restore();

    // Centre stays unrotated, so its highlight always faces the sun.
    drawPixelDisc(cx, cy, 7, c.ring, ART_PIXEL);
    drawPixelDisc(cx, cy, 5, c.core, ART_PIXEL);
    pixelRect(cx - 4, cy + 2, 2, 2, c.ring, 2);
    pixelRect(cx, cy - 4, 4, 2, c.glint, 2);
    pixelRect(cx + 2, cy - 2, 2, 2, c.glint, 2);

    // Once open, sparkles twinkle in and out round it; none with reduced motion.
    if (unlocked && seconds) {
      for (const [angle, offset] of FLOWER_SPARKLES) {
        const phase = (seconds * 0.8 + offset) % 1;
        if (phase > 0.4) continue;
        const size = phase < 0.1 || phase > 0.3 ? 1 : 2;
        const sx = Math.round((cx + Math.cos(angle) * 23) / 2) * 2;
        const sy = Math.round((cy + Math.sin(angle) * 23) / 2) * 2;
        pixelRect(sx, sy, 2, 2, c.glint, 2);
        if (size > 1)
          for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]])
            pixelRect(sx + dx, sy + dy, 2, 2, c.halo, 2);
      }
    }
  }

  function starPath(context, points, outer, inner) {
    context.beginPath();
    for (let index = 0; index < points * 2; index++) {
      const angle = (index * Math.PI) / points;
      const radius = index % 2 ? inner : outer;
      if (index)
        context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else context.moveTo(radius, 0);
    }
    context.closePath();
  }

  // The rotating star is rendered once per radius, snapped to its palette, and
  // then rotated with nearest-neighbour sampling so it stays pixel-sharp.
  function spikeSprite(radius) {
    const key = radius.toFixed(2);
    if (spikeSprites.has(key)) return spikeSprites.get(key);
    const reach = Math.ceil((radius + 4) / ART_PIXEL) * ART_PIXEL;
    const size = (reach / ART_PIXEL) * 2;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    context.setTransform(
      1 / ART_PIXEL,
      0,
      0,
      1 / ART_PIXEL,
      size / 2,
      size / 2,
    );
    const points = spikePoints(radius);
    const core = radius * SPIKE_CORE;
    starPath(context, points, radius + SPIKE_TIP, core);
    context.fillStyle = "#263b36";
    context.fill();
    starPath(context, points, radius - 0.5, core * 0.9);
    context.fillStyle = "#b9c4af";
    context.fill();
    const tools = createDrawingTools(context);
    for (let index = 0; index < points; index++) {
      const spoke = (index * TAU) / points;
      tools.pixelPath(
        [
          [Math.cos(spoke) * core * 0.7, Math.sin(spoke) * core * 0.7],
          [Math.cos(spoke) * (radius - 4), Math.sin(spoke) * (radius - 4)],
        ],
        "#e8ecd9",
        1,
        ART_PIXEL,
      );
    }
    quantizeToPalette(context, size, size, ["#263b36", "#b9c4af", "#e8ecd9"]);
    const sprite = { canvas, reach };
    spikeSprites.set(key, sprite);
    return sprite;
  }

  function drawSpike(x, y, radius = 18, angle = 0) {
    const core = radius * SPIKE_CORE;
    const cx = Math.round(x / ART_PIXEL) * ART_PIXEL,
      cy = Math.round(y / ART_PIXEL) * ART_PIXEL;
    const sprite = spikeSprite(radius);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(
      sprite.canvas,
      -sprite.reach,
      -sprite.reach,
      sprite.reach * 2,
      sprite.reach * 2,
    );
    ctx.restore();
    drawPixelDisc(cx, cy, core + 1.5, "#263b36", ART_PIXEL);
    drawPixelDisc(cx, cy, core - 0.5, "#c7442f", ART_PIXEL);
    drawPixelDisc(
      cx - core * 0.15,
      cy - core * 0.15,
      core * 0.65,
      "#ed7050",
      ART_PIXEL,
    );
    pixelRect(
      cx - core * 0.55,
      cy - core * 0.6,
      Math.max(2, core * 0.35),
      Math.max(2, core * 0.25),
      "#ffc295",
      2,
    );
    pixelRect(cx - 2, cy - 2, 4, 4, "#263b36", 2);
    pixelRect(
      cx + Math.cos(angle) * core * 0.45 - 1,
      cy + Math.sin(angle) * core * 0.45 - 1,
      2,
      2,
      "#7c2b24",
      2,
    );
  }

  /**
   * A body of water from its open columns (see `waterColumns`): see-through
   * blue, darker with depth, with a light rippling line where it meets the
   * air. `time` only moves the ripples.
   */
  function drawWater(body, columns, time = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    for (const { x, segments } of columns) {
      for (const [top, bottom] of segments) {
        const surface = Math.abs(top - body.y) < 0.5;
        const wave = surface ? surfaceWave(x, time) : 0;
        const y0 = Math.round(top / ART_PIXEL) * ART_PIXEL + wave;
        const y1 = Math.round(bottom / ART_PIXEL) * ART_PIXEL;
        if (y1 <= y0) continue;
        ctx.fillStyle = WATER_COLORS.body;
        ctx.fillRect(x, y0, ART_PIXEL, y1 - y0);
        const deep = Math.max(y0, Math.round((body.y + 18) / ART_PIXEL) * ART_PIXEL);
        if (y1 > deep) {
          ctx.fillStyle = WATER_COLORS.deep;
          ctx.fillRect(x, deep, ART_PIXEL, y1 - deep);
        }
        if (!surface) continue;
        ctx.fillStyle = WATER_COLORS.shine;
        ctx.fillRect(x, y0 + ART_PIXEL, ART_PIXEL, ART_PIXEL * 2);
        ctx.fillStyle = WATER_COLORS.foam;
        ctx.fillRect(x, y0, ART_PIXEL, ART_PIXEL);
      }
    }
    ctx.restore();
  }

  /** Clumps of dirt on the tyre, turning with it; a fast wheel smears them into a tint. */
  // The tyre being drawn, squished against the ground: { level, dx, dy }
  // with (dx, dy) toward the ground, or null for a round tyre. Level 1 cuts
  // the tyre's outer row where it meets the ground, which leaves a flat patch
  // on the ground line; level 2 also bulges the sidewalls above it.
  let tyre = null;
  const onTyre = (x, y) => !tyre || x * tyre.dx + y * tyre.dy <= 5.5;
  function drawTyreBulge(color) {
    if (!tyre || tyre.level < 2) return;
    for (let y = -7; y <= 7; y++)
      for (let x = -7; x <= 7; x++) {
        const distance = Math.hypot(x, y),
          toward = x * tyre.dx + y * tyre.dy;
        if (distance > 6.5 && distance <= 7.3 && toward >= 1.5 && toward <= 4.5)
          pixelRect(x * 2, y * 2, 2, 2, color);
      }
  }

  function drawWheelDirt(point, dirt, blur) {
    if (!dirt?.length) return;
    if (blur > 0)
      withAlpha(blur * Math.min(1, dirt.length / 4) * 0.55, () =>
        drawWheelRing(5.4, 6.5, dirt[dirt.length - 1].color, 0.5, wheelShimmer(point)),
      );
    for (const clump of dirt) {
      const turn = (point.spin || 0) + clump.angle;
      const angle = Math.round(turn / (TAU / 32)) * (TAU / 32);
      const cx = Math.round(Math.cos(angle) * 6),
        cy = Math.round(Math.sin(angle) * 6);
      if (!onTyre(cx, cy)) continue;
      withAlpha((1 - blur) * Math.min(1, clump.life / 1.2), () => {
        pixelRect(cx * 2, cy * 2, 2, 2, clump.color);
        if (clump.size > 1)
          pixelRect(
            Math.round(Math.cos(angle + 0.25) * 5.2) * 2,
            Math.round(Math.sin(angle + 0.25) * 5.2) * 2,
            2,
            2,
            clump.color,
          );
      });
    }
  }

  function drawElastoWheel(point, dirt) {
    const c = ELASTO_COLORS;
    ctx.save();
    translateToDevice(point.x, point.y);
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const distance = Math.hypot(x, y);
        if (distance <= 6.5 && distance >= 4.9) {
          if (onTyre(x, y)) pixelRect(x * 2, y * 2, 2, 2, c.tire);
        }
        else if (distance < 4.9 && distance >= 4)
          pixelRect(x * 2, y * 2, 2, 2, c.rim);
      }
    drawTyreBulge(c.tire);
    const spin = point.spin || 0;
    const blur = wheelBlur(point);
    const shimmer = wheelShimmer(point);
    if (blur > 0)
      withAlpha(blur, () => {
        drawWheelRing(5, 6.2, c.tread, 0.6, shimmer);
        drawWheelRing(0, 4, c.spoke, 0.3, shimmer);
      });
    const treadPhase = Math.round(spin / (TAU / 32)) * (TAU / 32);
    withAlpha(1 - blur * 0.6, () => {
      for (let i = 0; i < 8; i++) {
        const tread = treadPhase + (i * TAU) / 8;
        const tx = Math.round(Math.cos(tread) * 5.6),
          ty = Math.round(Math.sin(tread) * 5.6);
        if (onTyre(tx, ty)) pixelRect(tx * 2, ty * 2, 2, 2, c.tread);
      }
    });
    drawWheelDirt(point, dirt, blur);
    drawSpokes(point, Math.round(spin / (TAU / 24)) * (TAU / 24), 6, c.spoke, blur);
    pixelRect(-4, -2, 8, 4, c.hub);
    pixelRect(-2, -4, 4, 8, c.hub);
    pixelRect(-2, -2, 4, 4, c.hubLight);
    ctx.restore();
  }

  // Past about a quarter of the tread spacing per frame, the tread and spokes
  // would seem to stand still or run backwards; they smear into a blur instead.
  function wheelBlur(point) {
    const spin = Math.abs(point.angularVelocity || 0);
    return Math.min(1, Math.max(0, (spin - 18) / 12));
  }

  function withAlpha(alpha, draw) {
    if (alpha <= 0) return;
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * Math.min(1, alpha);
    draw();
    ctx.globalAlpha = base;
  }

  /**
   * Fills the wheel's art pixels between two radii, `density` of them in a
   * dither. `shimmer` shifts the dither; following the wheel's spin, it keeps
   * a blurred wheel flickering, so it never looks parked.
   */
  function drawWheelRing(inner, outer, color, density = 1, shimmer = 0) {
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const distance = Math.hypot(x, y);
        if (distance < inner || distance > outer || !onTyre(x, y)) continue;
        if (density < 1 && ((x * 7 + y * 13 + shimmer) & 7) >= density * 8) continue;
        pixelRect(x * 2, y * 2, 2, 2, color);
      }
  }

  /** Dither offset for a blurred wheel: changes about every frame at speed, still when it stops. */
  const wheelShimmer = (point) => Math.floor((point.spin || 0) * 3) & 7;

  /** Spokes, with a fainter trail behind each one while the wheel is blurred. */
  function drawSpokes(point, phase, count, color, blur) {
    const trail = -Math.sign(point.angularVelocity || 0) * (TAU / 24);
    const passes = blur > 0 ? [[trail, blur * 0.45], [0, 1 - blur * 0.4]] : [[0, 1]];
    for (const [offset, alpha] of passes)
      withAlpha(alpha, () => {
        for (let i = 0; i < count; i++) {
          const spoke = phase + offset + (i * TAU) / count;
          pixelPath(
            [
              [0, 0],
              [Math.cos(spoke) * 8, Math.sin(spoke) * 8],
            ],
            color,
            1,
          );
        }
      });
  }

  function drawClassicWheel(point, dirt) {
    const c = CLASSIC_COLORS;
    ctx.save();
    translateToDevice(point.x, point.y);
    // A thin tire round a tall rim, lit from the top left and shaded below.
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const distance = Math.hypot(x, y);
        if (distance <= 6.5 && distance >= 5.6) {
          if (onTyre(x, y)) pixelRect(x * 2, y * 2, 2, 2, c.tire);
        }
        else if (distance < 5.6 && distance >= 4.6)
          pixelRect(x * 2, y * 2, 2, 2, x + y > 1 ? c.rimShade : c.rim);
      }
    drawTyreBulge(c.tire);
    const spin = point.spin || 0;
    const blur = wheelBlur(point);
    const shimmer = wheelShimmer(point);
    if (blur > 0)
      withAlpha(blur, () => {
        drawWheelRing(5.6, 6.5, c.tread, 0.6, shimmer);
        drawWheelRing(0, 4.6, c.spoke, 0.3, shimmer);
      });
    const treadPhase = Math.round(spin / (TAU / 32)) * (TAU / 32);
    withAlpha(1 - blur * 0.6, () => {
      for (let i = 0; i < 8; i++) {
        const tread = treadPhase + (i * TAU) / 8;
        const tx = Math.round(Math.cos(tread) * 6),
          ty = Math.round(Math.sin(tread) * 6);
        if (onTyre(tx, ty)) pixelRect(tx * 2, ty * 2, 2, 2, c.tread);
      }
    });
    drawWheelDirt(point, dirt, blur);
    drawSpokes(point, Math.round(spin / (TAU / 32)) * (TAU / 32), 8, c.spoke, blur);
    pixelRect(-2, -2, 4, 4, c.goldDark);
    pixelRect(-2, -2, 2, 2, c.goldLight);
    ctx.restore();
  }

  function drawScramblerWheel(point, dirt) {
    const c = SCRAMBLER_COLORS;
    ctx.save();
    translateToDevice(point.x, point.y);
    // Tire, then a polished rim lit from the top left and shaded below.
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const distance = Math.hypot(x, y);
        if (distance <= 6.5 && distance >= 4.7) {
          if (onTyre(x, y)) pixelRect(x * 2, y * 2, 2, 2, c.tire);
        }
        else if (distance < 4.7 && distance >= 3.5)
          pixelRect(x * 2, y * 2, 2, 2, x + y > 1 ? c.rimShade : c.rim);
      }
    drawTyreBulge(c.tire);
    const spin = point.spin || 0;
    const blur = wheelBlur(point);
    const shimmer = wheelShimmer(point);
    if (blur > 0)
      withAlpha(blur, () => {
        drawWheelRing(5, 6.2, c.tread, 0.6, shimmer);
        drawWheelRing(0, 3.5, c.spoke, 0.35, shimmer);
      });
    // Road tread: finer than the Elasto's knobs, so twice as many.
    const treadPhase = Math.round(spin / (TAU / 32)) * (TAU / 32);
    withAlpha(1 - blur * 0.6, () => {
      for (let i = 0; i < 16; i += 2) {
        const tread = treadPhase + (i * TAU) / 16;
        const tx = Math.round(Math.cos(tread) * 5.6),
          ty = Math.round(Math.sin(tread) * 5.6);
        if (onTyre(tx, ty)) pixelRect(tx * 2, ty * 2, 2, 2, c.tread);
      }
    });
    drawWheelDirt(point, dirt, blur);
    drawSpokes(point, Math.round(spin / (TAU / 32)) * (TAU / 32), 4, c.spoke, blur);
    pixelRect(-4, -2, 8, 4, c.goldDark);
    pixelRect(-2, -4, 4, 8, c.goldDark);
    pixelRect(-2, -2, 4, 4, c.goldLight);
    ctx.restore();
  }

  // Parallax layers are static in their own scroll space, so each is cached as
  // 512-unit strips that are blitted at the layer's scroll offset.
  function backgroundStrip(layer, index) {
    const key = `${layer.key}|${index}`;
    if (backgroundStrips.has(key)) {
      const strip = backgroundStrips.get(key);
      backgroundStrips.delete(key);
      backgroundStrips.set(key, strip);
      return strip;
    }
    const canvas = createCanvas(
      BACKGROUND_STRIP_WIDTH / ART_PIXEL,
      BACKGROUND_STRIP_HEIGHT / ART_PIXEL,
    );
    const context = canvas.getContext("2d");
    const left = index * BACKGROUND_STRIP_WIDTH;
    context.setTransform(
      1 / ART_PIXEL,
      0,
      0,
      1 / ART_PIXEL,
      -left / ART_PIXEL,
      -BACKGROUND_STRIP_TOP / ART_PIXEL,
    );
    const tools = createDrawingTools(context);
    const bottom = BACKGROUND_STRIP_TOP + BACKGROUND_STRIP_HEIGHT;
    const step = layer.step || 8;
    for (
      let worldX = left - step;
      worldX < left + BACKGROUND_STRIP_WIDTH;
      worldX += step
    ) {
      const y = Math.round(layer.shape(worldX) / 4) * 4;
      // Reset every column: `column` hooks paint windows in other colours.
      context.fillStyle = layer.color;
      context.fillRect(worldX, y, step, bottom - y);
      layer.column?.(context, worldX, y, step);
    }
    layer.decorate?.(tools, left, left + BACKGROUND_STRIP_WIDTH);
    backgroundStrips.set(key, canvas);
    if (backgroundStrips.size > BACKGROUND_STRIP_LIMIT)
      backgroundStrips.delete(backgroundStrips.keys().next().value);
    return canvas;
  }

  /**
   * `smooth` is for contexts that map world units to many device pixels: shapes
   * keep their pixel grid but are placed at their exact scroll position.
   */
  function drawBackground({
    width,
    height,
    palette,
    cameraX = 0,
    cameraY = 0,
    full = true,
    smooth = false,
  }) {
    // Offsets land on whole device pixels so pixel rows never blend at their seams.
    const deviceScale = smooth ? ctx.getTransform().a : 1 / ART_PIXEL;
    const snap = (value) => Math.round(value * deviceScale) / deviceScale;
    // Draws pixel-snapped art around (x, y), then shifts it by the snapping error.
    const placed = (x, y, grid, draw) => {
      if (!smooth) {
        draw(x, y);
        return;
      }
      const gx = Math.round(x / grid) * grid,
        gy = Math.round(y / grid) * grid;
      ctx.save();
      ctx.translate(snap(x - gx), snap(y - gy));
      draw(gx, gy);
      ctx.restore();
    };
    const weather = palette.weather || {};
    const rain = Math.max(0, Math.min(1, Number(weather.rain) || 0));
    const lightning = Math.max(0, Math.min(1, Number(weather.lightning) || 0));
    const cloudiness = Math.max(0, Math.min(1, weather.clouds ?? 0.35));
    const time = timeOfDayPalette(palette);
    const light = sunLight({
      width,
      cameraX,
      cameraY,
      weather,
      timeOfDay: palette.timeOfDay,
    });
    const storminess = Math.max(rain, lightning);
    const fog = fogAmount(weather);
    // Fog washes over everything drawn so far, so each layer further back
    // ends up behind more of it.
    const fogWash = (amount) => {
      if (!fog) return;
      ctx.save();
      ctx.globalAlpha = fog * amount;
      ctx.fillStyle = fogColor(palette);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    };

    // Sky: one colour, or a banded gradient on the 4-unit grid.
    if (time.skyTop === time.sky) {
      ctx.fillStyle = time.sky;
      ctx.fillRect(0, 0, width, height);
    } else {
      const bands = 10;
      const horizon = height * 0.75;
      for (let i = 0; i < bands; i++) {
        const top = Math.round(((i * horizon) / bands) / 4) * 4;
        const bottom =
          i === bands - 1
            ? height
            : Math.round((((i + 1) * horizon) / bands) / 4) * 4;
        ctx.fillStyle = mixHex(time.skyTop, time.sky, i / (bands - 1));
        ctx.fillRect(0, top, width, bottom - top);
      }
    }

    // Fixed stars, fading in after sunset; the hills drawn later cover the
    // low ones.
    if (time.stars > 0) {
      ctx.save();
      ctx.globalAlpha = (1 - cloudiness * 0.7) * time.stars;
      const span = width + 200;
      const rise = Math.max(cameraY, -SUN_CLIMB_LIMIT) * 0.04;
      for (let i = 0; i < 70; i++) {
        const a = Math.sin(i * 91.7) * 43758.5453,
          b = Math.sin(i * 47.3 + 3) * 24634.6345;
        const wrapped =
          (((a - Math.floor(a)) * span - cameraX * 0.01) % span + span) % span;
        const sx = wrapped - 100;
        const sy = (b - Math.floor(b)) * height * 0.6 - rise;
        pixelRect(sx, sy, 2, 2, i % 4 ? "#c9d2e8" : "#fffbe8", 2);
      }
      ctx.restore();
    }

    if (light.sunshine > 0) {
      ctx.save();
      // Round midnight the moon is up; in the hours either side it fades in
      // as the sun goes down, or out as it comes up.
      if (time.moon >= 0.5) {
        ctx.globalAlpha = 0.95 * (1 - cloudiness * 0.4) * time.moon;
        placed(light.x, light.y, 4, (x, y) => {
          drawPixelDisc(x, y, 22, time.sun, 4);
          drawPixelDisc(x - 8, y - 4, 6, time.crater, 4);
          drawPixelDisc(x + 6, y + 8, 4, time.crater, 4);
        });
      } else {
        ctx.globalAlpha = light.strength * (1 - time.moon);
        placed(light.x, light.y, 4, (x, y) =>
          drawPixelDisc(
            x,
            y,
            (28 + light.sunshine * 8) * time.sunScale,
            time.sun,
            4,
          ),
        );
      }
      ctx.restore();
    }
    if (cloudiness > 0) {
      const scrollX = cameraX * 0.07;
      // Rows above the first only come into view once the camera climbs.
      const cloudShift = -cameraY * 0.08;
      const overcast = Math.max(0, (cloudiness - 0.8) / 0.2);
      const cloudColor =
        storminess > 0.15
          ? time.stormCloud
          : mixHex(time.cloud, time.stormCloud, overcast * 0.5);
      const layer = cloudLayer({
        width,
        height,
        scrollX,
        cloudShift,
        cloudiness,
        color: cloudColor,
        // Fades with the sun setting; the moon gives a smaller, fainter glow.
        glow:
          light.sunshine > 0
            ? mixHex(cloudColor, time.sun, (0.3 - time.moon * 0.18) * light.sunshine)
            : null,
        glowSize: 1 - time.moon * 0.3,
        sunX: light.x,
        sunY: light.y,
      });
      ctx.save();
      ctx.globalAlpha = 0.7 + cloudiness * 0.3;
      ctx.drawImage(
        layer.canvas,
        snap(-layer.offsetX),
        snap(-layer.offsetY),
        layer.canvas.width * CLOUD_CELL,
        layer.canvas.height * CLOUD_CELL,
      );
      ctx.restore();
    }

    if (full) {
      const theme = BACKDROPS.includes(palette.backdrop)
        ? palette.backdrop
        : "hills";
      const layers = backdropLayers(theme, backdropColors(palette, time));
      for (const layer of layers) {
        fogWash(0.45);
        const offsetX = snap(cameraX * layer.parallax);
        const offsetY = snap(Math.min(cameraY, BACKDROP_SINK_LIMIT) * layer.parallax);
        const first = Math.floor(offsetX / BACKGROUND_STRIP_WIDTH);
        const last = Math.floor((offsetX + width) / BACKGROUND_STRIP_WIDTH);
        const stripTop = BACKGROUND_STRIP_TOP - offsetY;
        const below = stripTop + BACKGROUND_STRIP_HEIGHT;
        if (stripTop < height && below > 0)
          for (let index = first; index <= last; index++) {
            ctx.drawImage(
              backgroundStrip(layer, index),
              index * BACKGROUND_STRIP_WIDTH - offsetX,
              stripTop,
              BACKGROUND_STRIP_WIDTH,
              BACKGROUND_STRIP_HEIGHT,
            );
          }
        if (below < height) {
          ctx.fillStyle = layer.color;
          ctx.fillRect(0, below, width, height - below);
        }
      }
      fogWash(0.45);
    } else fogWash(0.5);
    if (storminess > 0) {
      ctx.fillStyle = `rgba(38, 55, 62, ${storminess * 0.2})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Colour-grades everything already drawn in the box, for the time of day.
   * Rain softens it so the two never stack too dark. Returns true when bright
   * gameplay objects (apples, the finish) should be drawn again on top.
   */
  function drawTimeTint(palette, x, y, width, height) {
    const time = timeOfDayPalette(palette);
    if (!time.tint) return false;
    const rain = Math.max(
      0,
      Math.min(1, Number(palette.weather?.rain) || 0),
    );
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1 - rain * 0.35;
    ctx.fillStyle = time.tint;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    return time.glow;
  }

  function rectDownTo(x, top, width, color, pixel, groundOffset) {
    for (let column = 0; column < width; column += pixel) {
      const bottom = groundOffset(x + column + pixel / 2);
      if (bottom <= top) continue;
      pixelRect(x + column, top, pixel, bottom - top, color, pixel);
    }
  }

  function rectAboveGround(x, y, width, height, color, pixel, groundOffset) {
    for (let column = 0; column < width; column += pixel) {
      const bottom = Math.min(y + height, groundOffset(x + column + pixel / 2));
      if (bottom <= y) continue;
      pixelRect(x + column, y, pixel, bottom - y, color, pixel);
    }
  }

  const LEAF = { stem: "#3d6452", dark: "#477158", mid: "#568061", light: "#618b66" };
  const BARK = { dark: "#4d3f2f", base: "#66543f", light: "#856d4f", tip: "#aa8a60" };

  // A fixed 0…1 value per prop and index, so wall props never flicker.
  const propNoise = (x, n) => {
    const s = Math.sin(n * 127.1 + x * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // Where a watchtower at (x, y) points its searchlight, in its own frame:
  // locked on to the rider at (riderX, riderY) once close, sweeping otherwise.
  function searchlightAimAt(time, x, y, riderX, riderY, mirrored) {
    const dx = Number.isFinite(riderX) ? (riderX - x) * (mirrored ? -1 : 1) - SEARCHLIGHT.x : null;
    const dy = Number.isFinite(riderY) ? riderY - (y + SEARCHLIGHT.y) : null;
    return searchlightAim(time, propNoise(x, 22), dx, dy);
  }

  // Hanging from a cliff's top corner. `wall.drop` is the free fall below.
  function drawVines(x, wall) {
    const length = Math.max(24, Math.min(VINE_MAX, wall?.drop || 56));
    const lean = (wall?.side || 0) * 2;
    // Leafy clump over the lip.
    pixelRect(-10, -4, 20, 4, LEAF.dark, 2);
    pixelRect(-6, -6, 12, 2, LEAF.mid, 2);
    pixelRect(0, -6, 4, 2, LEAF.light, 2);
    [-6, 0, 6].forEach((offset, index) => {
      const reach = Math.round((length * (0.55 + propNoise(x, index) * 0.45)) / 2) * 2;
      const sway = (py) => Math.round(Math.sin((py + index * 9) * 0.12) * 1.2) * 2;
      const stemX = offset + lean;
      for (let py = 0; py < reach; py += 2) {
        const sx = stemX + sway(py);
        pixelRect(sx, py, 2, 2, LEAF.stem, 2);
        if ((py / 2 + index) % 4 === 0) {
          const side = Math.floor(py / 8) % 2 ? -2 : 2;
          pixelRect(sx + side, py, 2, 2, side > 0 ? LEAF.light : LEAF.dark, 2);
          pixelRect(sx + side, py + 2, 2, 2, LEAF.mid, 2);
        }
      }
      const tipX = stemX + sway(reach);
      pixelRect(tipX - 2, reach, 6, 2, LEAF.mid, 2);
      pixelRect(tipX, reach + 2, 2, 2, LEAF.dark, 2);
    });
  }

  // Drawn growing toward +x; the caller mirrors it for faces the other way.
  function drawRoots(x) {
    pixelRect(-2, -10, 6, 22, BARK.dark, 2);
    const roots = [
      { y: -8, reach: 16 + propNoise(x, 1) * 8, droop: -4 },
      { y: 0, reach: 22 + propNoise(x, 2) * 8, droop: 6 },
      { y: 8, reach: 12 + propNoise(x, 3) * 6, droop: 14 },
    ];
    for (const root of roots) {
      const points = [
        [0, root.y],
        [root.reach * 0.4, root.y - 2],
        [root.reach * 0.75, root.y + root.droop * 0.4],
        [root.reach, root.y + root.droop],
      ];
      pixelPath(points, BARK.base, 2, 2);
      pixelPath(points.slice(0, 3).map(([px, py]) => [px, py - 2]), BARK.light, 1, 2);
      const [tx, ty] = points[3];
      pixelPath([[tx, ty], [tx + 2, ty + 6]], BARK.tip, 1, 2);
    }
  }

  // A colony roosting on the roof, or scattering once startled
  // (`scene.flight`): each bat flutters off on its own path, away from the rider.
  function drawBats(x, scene) {
    const tools = { pixelRect };
    const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
    const flight = scene.flight;
    BAT_ROOSTS.forEach(([bx, by], index) => {
      if (!flight) {
        // Now and then one stretches a wing.
        const time = scene.time || 0;
        const stretch = time > 0 && (time + propNoise(x, index + 5) * 11) % 6 < 0.5;
        drawBatHanging(tools, bx, by, stretch);
        return;
      }
      const age = flight.age;
      const speed = 60 + propNoise(x, index + 8) * 50;
      const climb = [-1.1, 0.5, -0.2][index % 3] * 50;
      const dx = flight.dir * (speed * age + 50 * age * age) * (index === 1 ? 0.8 : 1);
      // A short drop off the roof, then a jinking flight.
      const dy = 10 * Math.min(age, 0.2) / 0.2 + climb * age + Math.sin(age * 11 + index * 2) * 6;
      ctx.save();
      ctx.translate(snap(bx + 2 + dx), snap(by + 8 + dy));
      ctx.scale(flight.dir, 1);
      drawBatFlying(tools, Math.floor(age * 16 + index) % 2 === 0);
      ctx.restore();
    });
  }

  // A water prop where its fit puts it (see waterFit): lily pads and ducks
  // riding the ripples on the surface, a fish swimming to and fro and darting
  // off once startled (`scene.flight`), and seaweed and reeds swaying on the bed.
  function drawWaterProp(type, x, fit, mirrored, groundOffset, scene) {
    const tools = { pixelRect };
    const time = scene.time || 0;
    const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
    const worldX = (local) => x + (mirrored ? -local : local);
    if (SURFACE_PROPS.has(type)) {
      const afloat = Number.isFinite(fit?.surface);
      ctx.translate(0, afloat ? snap(fit.surface) : 0);
      const wave = (local) => (afloat ? surfaceWave(worldX(local), time) : 0);
      if (type === "lily") {
        // Just clear of the foam line, so the pads lie on the water.
        ctx.translate(0, -2);
        drawLily(tools, wave);
        return;
      }
      if (type === "frog") {
        // On its own pad, riding the ripples; startled, it leaps away from
        // the rider into the water, leaving rings and its empty pad.
        const lift = snap(wave(0));
        ctx.translate(0, -2);
        drawFrogPad(tools, lift);
        const flight = scene.flight;
        if (flight) {
          const dir = flight.dir * (mirrored ? -1 : 1);
          const leap = frogLeap(flight.age, dir);
          if (leap.flying) {
            ctx.translate(leap.dx, lift - 2 + leap.dy);
            ctx.scale(dir, 1);
            drawFrog(tools, false, true);
          } else if (leap.rings < 1.2) {
            const base = ctx.globalAlpha;
            ctx.globalAlpha = base * (1 - leap.rings / 1.2);
            for (const spread of [4 + leap.rings * 22, 2 + leap.rings * 12]) {
              const r = snap(spread);
              pixelRect(leap.dx - r, 2, 4, 2, WATER_RING, 2);
              pixelRect(leap.dx + r - 2, 2, 4, 2, WATER_RING, 2);
            }
            ctx.globalAlpha = base;
          }
          return;
        }
        ctx.translate(0, lift - 2);
        // Now and then it blinks.
        drawFrog(tools, time > 0 && (time + waterPropNoise(x, 6) * 5) % 4 < 0.15);
        return;
      }
      if (type === "boat") {
        // Moored, bobbing with the ripples, low in the water.
        ctx.translate(0, snap(wave(0)) + 2);
        drawBoat({ pixelRect, pixelPath });
        return;
      }
      if (type === "dragonfly") {
        // A pair hovering and darting over the water, on warm days only:
        // never in rain, snow or a gale.
        const weather = scene.weather;
        if (weather?.rain > 0.1 || weather?.snow > 0.1 || weather?.wind > 0.7) return;
        for (const index of [0, 1]) {
          const fly = dragonflyAt(time, waterPropNoise(x, 8), index);
          ctx.save();
          ctx.translate(fly.x, fly.y - 4);
          ctx.scale(fly.dir, 1);
          drawDragonfly(tools, time > 0 && Math.floor(time * 24 + index) % 2 === 0);
          ctx.restore();
        }
        return;
      }
      const flight = scene.flight;
      if (flight) {
        // A run across the water, then up and away from the rider.
        const age = flight.age;
        const dir = flight.dir * (mirrored ? -1 : 1);
        ctx.translate(snap(dir * (40 * age + 70 * age * age)), snap(wave(0) - (30 * age + 50 * age * age)));
        ctx.scale(dir, 1);
        drawDuckFlying(tools, Math.floor(age * 10) % 2 === 0);
        return;
      }
      // Sitting low, with the foam at its waterline. Now and then it dabbles.
      ctx.translate(0, wave(2) + 2);
      drawDuckFloating(tools, time > 0 && (time + waterPropNoise(x, 4) * 9) % 7 < 0.9);
      return;
    }
    if (type === "fish") {
      // Swims in world directions, whichever way it was placed facing.
      if (mirrored) ctx.scale(-1, 1);
      ctx.translate(0, snap(fit?.swim ?? 0));
      const flight = scene.flight;
      if (flight) {
        const age = flight.age;
        const dart = fishDart(fit, flight.from || { dx: 0, dy: 0 }, flight.dir, age);
        ctx.globalAlpha *= Math.max(0, 1 - age / FISH_DART);
        ctx.translate(snap(dart.dx), snap(dart.dy));
        ctx.scale(flight.dir, 1);
        drawFish(tools, Math.floor(age * 20) % 2 === 0);
        return;
      }
      const swim = fishSwim(x, fit, time, mirrored);
      ctx.translate(snap(swim.dx), swim.dy);
      ctx.scale(swim.dir, 1);
      drawFish(tools, time > 0 && Math.floor(time * 5 + waterPropNoise(x, 5) * 5) % 2 === 0);
      return;
    }
    ctx.translate(0, snap(fit?.bed ?? 0));
    if (type === "bubbles") {
      // Now and then a string of bubbles rises from the bed and pops.
      drawBubbles(tools, risingBubbles(time, fit?.rise ?? null, waterPropNoise(x, 9)));
      return;
    }
    const floor = fit?.floor;
    const ground = floor
      ? (local) => {
          const world = mirrored ? -local : local;
          return floor[Math.max(0, Math.min(floor.length - 1, Math.round((world + BED_HALF) / 2)))];
        }
      : groundOffset;
    const height = fit?.height ?? (type === "reeds" ? reedHeight(null) : seaweedHeight(null));
    if (type === "reeds") {
      const { wind, downwind } = propWind(scene, mirrored);
      drawReeds(tools, height, time, x, ground, wind, downwind);
    }
    else drawSeaweed(tools, height, time, x, ground);
  }

  // Heat haze: in play (time > 0) the rows of the scene already drawn behind
  // it are nudged one art pixel to and fro, strongest near the ground, under
  // faint rising glare and a mirage of sky lying on the ground. Standing still
  // (in the editor) only the glare and mirage show.
  function drawHeatHaze(x, scene, groundOffset) {
    const time = scene.time || 0;
    const phase = propNoise(x, 9);
    const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
    const base = snap(groundOffset(0));
    const rows = HAZE_RISE / ART_PIXEL;
    const transform = ctx.getTransform();
    if (time > 0 && !transform.b && !transform.c && ctx.canvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let row = 0; row < rows; row++) {
        const shift = hazeShift(row, time, phase);
        if (!shift) continue;
        // The shimmer narrows as it rises.
        const half = snap(HAZE_HALF * (1 - (row / rows) * 0.45));
        const ends = [-half, half].map((local) => Math.round(transform.a * local + transform.e));
        const top = Math.round(transform.d * (base - (row + 1) * ART_PIXEL) + transform.f);
        const height = Math.round(transform.d * ART_PIXEL);
        const left = Math.max(0, Math.min(...ends));
        const width = Math.min(ctx.canvas.width, Math.max(...ends)) - left;
        if (width <= 0 || height <= 0 || top < 0 || top + height > ctx.canvas.height) continue;
        const nudge = Math.round(shift * Math.abs(transform.a) * ART_PIXEL);
        ctx.drawImage(ctx.canvas, left, top, width, height, left + nudge, top, width, height);
      }
      ctx.restore();
    }
    const alpha = ctx.globalAlpha;
    for (const streak of hazeStreaks(time, phase)) {
      if (streak.alpha <= 0.01) continue;
      ctx.globalAlpha = alpha * streak.alpha;
      pixelRect(streak.x - streak.width / 2, base + streak.y, streak.width, 2, HAZE.glare, 2);
    }
    // The mirage: patches of pale sky lying on the ground, fading at the ends.
    for (let sx = -HAZE_HALF + 16; sx < HAZE_HALF - 16; sx += 8) {
      const edge = 1 - Math.abs(sx + 4) / (HAZE_HALF - 12);
      const flicker = 0.6 + 0.4 * Math.sin(time * 2.4 + sx * 0.13 + phase * 6);
      ctx.globalAlpha = alpha * Math.max(0, edge) * flicker * 0.4;
      const ground = snap(groundOffset(sx + 4));
      pixelRect(sx, ground - 2, 8, 2, HAZE.mirage, 2);
      if (edge > 0.5) pixelRect(sx + 2, ground - 4, 4, 2, HAZE.mirage, 2);
    }
    ctx.globalAlpha = alpha;
  }

  // Framed board lit from the right, growing upward from `bottom`. `x` must be
  // even; the board and every line centre on x + 1, the middle of the post.
  function drawBoard(x, bottom, text) {
    const { lines, inner, height } = signBoard(text);
    const top = bottom - height;
    const left = x + 1 - inner / 2;
    const outer = inner + 4;
    pixelRect(left - 2, top, outer, height, "#856d4f", 2);
    pixelRect(left - 2, top, outer, 2, "#aa8a60", 2);
    pixelRect(left + inner, top, 2, height, "#aa8a60", 2);
    pixelRect(left - 2, top, 2, height, "#66543f", 2);
    pixelRect(left - 2, bottom - 2, outer, 2, "#66543f", 2);
    pixelRect(left, top + 2, inner, height - 4, "#f4e9d1", 2);
    lines.forEach((line, index) =>
      drawPixelText(line, x + 1, top + 6 + index * 12, "#365345"),
    );
  }

  // The snow a shake knocks off a snowy pine: clumps falling and breaking
  // up, powder bursting off the bough tips, and a cloud where it lands.
  function drawPineSnowFall(shake, x, groundOffset) {
    const base = ctx.globalAlpha;
    for (const flake of pineSnowFall(shake, (n) => propNoise(x, n), groundOffset)) {
      ctx.globalAlpha = base * flake.alpha;
      pixelRect(flake.x, flake.y, flake.size, flake.size, flake.color, 2);
    }
    const puffs = pineSnowPuffs(shake);
    for (const puff of puffs.tips) {
      ctx.globalAlpha = base * puff.alpha;
      drawPixelDisc(puff.x, puff.y, puff.radius, SNOW.light, 2);
    }
    for (const puff of puffs.ground) {
      ctx.globalAlpha = base * puff.alpha;
      drawPixelDisc(puff.x, groundOffset(puff.x) + puff.y, puff.radius, SNOW.light, 2);
    }
    ctx.globalAlpha = base;
  }

  /**
   * How far the wind bends the top of a tree or bush at x (see treeSway),
   * scaled by `scale`: bushes stir half as much as trees.
   */
  function windSwayOf(scene, x, mirrored, scale = 1) {
    const { wind, downwind } = propWind(scene, mirrored);
    return scale * treeSway(scene.time || 0, wind, downwind, x, propNoise(x, 50), mirrored ? -downwind : downwind);
  }

  /**
   * A crown bent by the wind, `top` world units at its top (see treeSway):
   * drawn from a sprite whose clumps were bent as it was drawn (see
   * bentTools), one cached for each whole unit of bend.
   */
  function drawSwayingCanopy(type, top) {
    drawCanopy(type, Math.max(-TREE_SWAY_MAX, Math.min(TREE_SWAY_MAX, Math.round(top))));
  }

  function drawCanopy(type, variant = 0) {
    const sprite = canopySprite(type, variant);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sprite.canvas,
      sprite.left,
      sprite.top,
      sprite.width,
      sprite.height,
    );
  }

  // A translucent prop is drawn opaque into a scratch layer on the same device
  // pixel grid and then blended once, so overlapping shapes inside it do not
  // stack up into darker, more solid patches.
  function drawPropLayer(
    type,
    x,
    y,
    alpha,
    slope,
    groundOffset,
    text,
    wall,
    flip,
    scene,
    rotation,
  ) {
    const transform = ctx.getTransform();
    if (transform.b || transform.c) return false;
    const [left, top, right, bottom] = propBounds(
      type,
      propDrawAngle(type, slope) + rotation,
      groundOffset,
      text,
      flip,
    );
    const anchorX = Math.round(x / 2) * 2,
      anchorY = Math.round(y / 2) * 2;
    const deviceX = (value) => transform.a * (anchorX + value) + transform.e;
    const deviceY = (value) => transform.d * (anchorY + value) + transform.f;
    const x0 = Math.max(0, Math.floor(Math.min(deviceX(left), deviceX(right))));
    const y0 = Math.max(0, Math.floor(Math.min(deviceY(top), deviceY(bottom))));
    const x1 = Math.min(
      ctx.canvas.width,
      Math.ceil(Math.max(deviceX(left), deviceX(right))),
    );
    const y1 = Math.min(
      ctx.canvas.height,
      Math.ceil(Math.max(deviceY(top), deviceY(bottom))),
    );
    if (x1 <= x0 || y1 <= y0) return true;
    const width = x1 - x0,
      height = y1 - y0;
    if (!propLayer) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      propLayer = { canvas, context, art: createGameArt(context) };
    }
    const { canvas, context, art } = propLayer;
    if (canvas.width < width || canvas.height < height) {
      canvas.width = Math.max(canvas.width, width);
      canvas.height = Math.max(canvas.height, height);
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(
      transform.a,
      0,
      0,
      transform.d,
      transform.e - x0,
      transform.f - y0,
    );
    art.drawProp(type, x, y, 1, slope, groundOffset, text, wall, flip, scene, rotation);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(canvas, 0, 0, width, height, x0, y0, width, height);
    ctx.restore();
    return true;
  }

  // Puffs of smoke from chimneySmoke, each shaded at its lower left, faded
  // by `alpha`: the hut's chimney, a fireplace and the smoke prop.
  function drawSmokePuffs(puffs, alpha = 1) {
    const base = ctx.globalAlpha;
    for (const puff of puffs) {
      ctx.globalAlpha = base * puff.alpha * alpha;
      drawPixelDisc(puff.x - 2, puff.y + 2, puff.radius, SMOKE.shade, 2);
      drawPixelDisc(puff.x, puff.y, Math.max(2, puff.radius - 2), SMOKE.light, 2);
    }
    ctx.globalAlpha = base;
  }

  function drawProp(
    type,
    x,
    y,
    alpha = 1,
    slope = 0,
    groundOffset = () => 0,
    text = "",
    wall = null,
    flip = false,
    scene = NO_SCENE,
    rotation = 0,
  ) {
    if (isStartSign(type, text)) type = "start";
    const mirrored = Boolean(flip) && canFlip(type);
    if (!canRotate(type) || !Number.isFinite(rotation)) rotation = 0;
    if (
      alpha < 1 &&
      drawPropLayer(
        type,
        x,
        y,
        alpha,
        slope,
        groundOffset,
        text,
        wall,
        mirrored,
        scene,
        rotation,
      )
    )
      return;
    ctx.save();
    ctx.translate(Math.round(x / 2) * 2, Math.round(y / 2) * 2);
    // Rotate before mirroring, so a turn is clockwise either way round.
    ctx.rotate(propDrawAngle(type, slope) + rotation);
    if (mirrored) {
      // Mirror around the anchor. Ground lookups still use world positions,
      // so trunks and posts keep following the slope.
      ctx.scale(-1, 1);
      const worldGround = groundOffset;
      groundOffset = (localX) => worldGround(-localX);
    }
    ctx.globalAlpha = alpha;
    if (type === "tree") {
      // Mature deciduous tree: approximately 124 units wide
      // and 180 units tall, centered over the ground anchor.
      // The trunk stays upright; its base follows the terrain. The crown
      // bends in the wind over it.
      drawSwayingCanopy(type, windSwayOf(scene, x, mirrored));

      // Main trunk with a shaded side and a narrow sunlit edge.
      const trunkTop = TREE_CANOPY_BOTTOM;
      rectDownTo(-8, trunkTop, 10, "#66543f", 2, groundOffset);
      rectDownTo(2, trunkTop, 4, "#856d4f", 2, groundOffset);
      rectDownTo(6, trunkTop, 2, "#aa8a60", 2, groundOffset);

      // Exposed bark details below the crown.
      rectAboveGround(
        -4,
        trunkTop,
        2,
        -54 - trunkTop,
        "#856d4f",
        2,
        groundOffset,
      );
      rectAboveGround(2, -44, 2, 10, "#66543f", 2, groundOffset);
      rectAboveGround(-4, -26, 2, 8, "#856d4f", 2, groundOffset);

      // Leaves let go as gusts pass and flutter down to the ground, where
      // they rest a moment before fading. None in snow.
      if (!(scene.weather?.snow > 0.2)) {
        const { wind, downwind } = propWind(scene, mirrored);
        const base = ctx.globalAlpha;
        for (const leaf of fallingLeaves(scene.time || 0, wind, downwind, x, TREE_LEAF_CROWN, groundOffset, mirrored ? -downwind : downwind)) {
          ctx.globalAlpha = base * leaf.alpha;
          // Drawn a little larger than life, so it reads as a leaf: flat, a
          // small lens with a bump; edge on, a short upright sliver.
          if (leaf.flat) {
            pixelRect(leaf.x - 2, leaf.y, 6, 2, leaf.color, 2);
            pixelRect(leaf.x, leaf.y - 2, 2, 2, leaf.color, 2);
          } else pixelRect(leaf.x, leaf.y - 2, 2, 4, leaf.color, 2);
        }
        ctx.globalAlpha = base;
      }
    } else if (type === "pine") {
      // Local x = 0 is the shared trunk / canopy center.
      // Overall size: 92 units wide, 182 units tall.
      // Keep the tree upright; only its base follows the terrain. Its boughs
      // bend in the wind, tier by tier.
      drawSwayingCanopy(type, windSwayOf(scene, x, mirrored));

      // Trunk: centered, with shaded bark and a narrow lit edge.
      const trunkTop = PINE_CANOPY_BOTTOM;
      rectDownTo(-6, trunkTop, 8, "#66543f", 2, groundOffset);
      rectDownTo(2, trunkTop, 2, "#856d4f", 2, groundOffset);
      rectDownTo(4, trunkTop, 2, "#aa8a60", 2, groundOffset);

      // Subtle bark marks on the exposed lower trunk.
      rectAboveGround(-4, -22, 2, 8, "#856d4f", 2, groundOffset);
      rectAboveGround(0, -12, 2, 6, "#856d4f", 2, groundOffset);
    } else if (type === "sapling" || type === "pine-small") {
      // Young trees: cached crown bent by the wind, thin trunk whose base
      // follows the slope.
      drawSwayingCanopy(type, windSwayOf(scene, x, mirrored));
      const trunkTop =
        type === "sapling"
          ? SAPLING_CANOPY_BOTTOM
          : SMALL_PINE_CANOPY_BOTTOM;
      rectDownTo(-4, trunkTop, 4, "#66543f", 2, groundOffset);
      rectDownTo(0, trunkTop, 2, "#856d4f", 2, groundOffset);
      rectDownTo(2, trunkTop, 2, "#aa8a60", 2, groundOffset);
    } else if (type === "cactus-small") {
      drawCanopy(type);
      // Lower stem continues the same ribs down to the ground.
      for (let x = -6; x < 6; x += 2) {
        const index = (x + 6) / 2;
        const groove = index > 0 && index < 5 && index % 3 === 0;
        rectDownTo(
          x,
          SMALL_CACTUS_BOTTOM,
          2,
          cactusStemColor((x + 7) / 12, groove),
          2,
          groundOffset,
        );
      }
      // One pebble at its foot.
      rectDownTo(-12, groundOffset(-11) - 4, 4, "#7f8d83", 2, groundOffset);
      pixelRect(-10, groundOffset(-11) - 4, 2, 2, "#aeb5a7", 2);
    } else if (type === "pebbles") {
      // Three small stones, each seated on the ground under it, lit from the right.
      const stones = [
        { x: -10, w: 6, h: 4 },
        { x: -2, w: 8, h: 6 },
        { x: 8, w: 4, h: 2 },
      ];
      for (const s of stones) {
        const ground = Math.round(groundOffset(s.x + s.w / 2) / 2) * 2;
        const top = ground - s.h;
        pixelRect(s.x, top, s.w, s.h, "#7f8d83", 2);
        if (s.h > 2) pixelRect(s.x, top + 2, 2, s.h - 2, "#697872", 2);
        pixelRect(s.x + 2, top, s.w - 2, 2, "#aeb5a7", 2);
      }
    } else if (type === "bush") {
      // The cached shrub, its clumps stirring in the wind, half as much as a
      // tree's. drawProp() already applies the ground-alignment rotation.
      drawSwayingCanopy("bush", windSwayOf(scene, x, mirrored, 0.5));
    } else if (type === "fence") {
      // A post-and-rail fence, 80 wide and 36 tall (about 1.3 m).
      // Rails sit behind the posts; existing slope rotation is preserved.

      // Upper rail.
      pixelRect(-40, -28, 80, 4, "#856d4f", 2);
      pixelRect(-40, -28, 80, 2, "#aa8a60", 2);
      pixelRect(-40, -24, 80, 2, "#66543f", 2);

      // Lower rail.
      pixelRect(-40, -14, 80, 4, "#856d4f", 2);
      pixelRect(-40, -14, 80, 2, "#aa8a60", 2);
      pixelRect(-40, -10, 80, 2, "#66543f", 2);

      // Balanced posts, centered at x = -33 and +33.
      for (const postX of [-36, 30]) {
        pixelRect(postX, -32, 6, 32, "#856d4f", 2);

        // Stepped post cap.
        pixelRect(postX, -34, 6, 2, "#aa8a60", 2);
        pixelRect(postX + 2, -36, 2, 2, "#aa8a60", 2);

        // Lit edge and shaded side.
        pixelRect(postX, -32, 2, 30, "#aa8a60", 2);
        pixelRect(postX + 4, -32, 2, 32, "#66543f", 2);

        // Small fasteners where the rails meet each post.
        pixelRect(postX + 2, -26, 2, 2, "#66543f", 2);
        pixelRect(postX + 2, -12, 2, 2, "#66543f", 2);
      }

      // Sparse wood grain.
      pixelRect(-24, -26, 10, 2, "#66543f", 2);
      pixelRect(10, -26, 6, 2, "#66543f", 2);
      pixelRect(-14, -12, 8, 2, "#66543f", 2);
      pixelRect(20, -12, 4, 2, "#66543f", 2);
    } else if (type === "rock") {
      // Uneven silhouette, keeping the original footprint.
      pixelRect(-16, -6, 34, 6, "#697872", 2);
      pixelRect(-12, -12, 28, 8, "#697872", 2);
      pixelRect(-8, -16, 20, 8, "#7f8d83", 2);
      pixelRect(-4, -18, 10, 4, "#aeb5a7", 2);

      // Lit upper face and a darker right-hand fracture.
      pixelRect(-8, -14, 16, 4, "#8b978c", 2);
      pixelRect(-12, -10, 12, 4, "#7f8d83", 2);
      pixelRect(8, -12, 4, 8, "#697872", 2);
      pixelRect(12, -8, 4, 6, "#697872", 2);

      // Small angular highlight and a crack.
      pixelRect(-4, -16, 8, 2, "#aeb5a7", 2);
      pixelRect(2, -8, 2, 4, "#697872", 2);
      pixelRect(4, -4, 4, 2, "#697872", 2);
    } else if (type === "boulder") {
      // Asymmetric stone mass, within the original 44 × 40 bounds.
      pixelRect(-22, -10, 44, 10, "#697872", 2);
      pixelRect(-20, -18, 40, 12, "#697872", 2);
      pixelRect(-16, -28, 34, 18, "#7f8d83", 2);
      pixelRect(-10, -36, 24, 20, "#8b978c", 2);
      pixelRect(-2, -40, 8, 6, "#a2ab9e", 2);

      // Broad illuminated top plane.
      pixelRect(-8, -34, 20, 6, "#a2ab9e", 2);
      pixelRect(-12, -28, 18, 6, "#8b978c", 2);
      pixelRect(-2, -38, 8, 4, "#aeb5a7", 2);

      // Stepped shadow plane on the right.
      pixelRect(10, -30, 4, 10, "#7f8d83", 2);
      pixelRect(8, -20, 10, 8, "#697872", 2);
      pixelRect(4, -12, 16, 8, "#697872", 2);

      // Short fracture and a chipped lower face.
      pixelPath(
        [
          [-4, -24],
          [0, -20],
          [-2, -14],
        ],
        "#697872",
        1,
        2,
      );
      pixelRect(-14, -10, 8, 4, "#8b978c", 2);
      pixelRect(-10, -10, 4, 2, "#a2ab9e", 2);
    } else if (type === "flowers") {
      // Fixed variation: no random changes or flicker between frames.
      const flowers = [
        { x: -12, height: 8, color: "#e8755b" },
        { x: -6, height: 14, color: "#f1b95d" },
        { x: 0, height: 10, color: "#e8755b" },
        { x: 6, height: 16, color: "#f1b95d" },
        { x: 12, height: 8, color: "#e8755b" },
      ];

      for (const flower of flowers) {
        const base = groundOffset(flower.x + 1);
        const top = base - flower.height;

        pixelRect(flower.x, top, 2, flower.height, "#58784d", 2);

        // Leaves sit above each stem's local ground anchor.
        pixelRect(flower.x - 2, base - 6, 2, 2, "#477158", 2);
        pixelRect(flower.x + 2, base - 8, 2, 2, "#618b66", 2);

        // Compact cross-shaped blossom with a warm center.
        pixelRect(flower.x - 2, top - 2, 6, 2, flower.color, 2);
        pixelRect(flower.x, top - 4, 2, 6, flower.color, 2);
        pixelRect(flower.x, top - 2, 2, 2, "#f4e9d1", 2);
      }
    } else if (type === "stump") {
      // Flared base, still following the terrain column by column.
      rectDownTo(-10, -8, 20, "#66543f", 2, groundOffset);
      rectDownTo(-8, -14, 16, "#806244", 2, groundOffset);
      rectDownTo(4, -12, 4, "#856d4f", 2, groundOffset);

      // Bark ridges remain clipped to the local ground.
      rectAboveGround(-6, -12, 2, 10, "#66543f", 2, groundOffset);
      rectAboveGround(0, -10, 2, 8, "#66543f", 2, groundOffset);
      rectAboveGround(6, -10, 2, 8, "#aa8a60", 2, groundOffset);

      // Cut surface: stepped rim and a compact growth ring.
      rectAboveGround(-8, -16, 16, 4, "#c39664", 2, groundOffset);
      rectAboveGround(-10, -14, 20, 2, "#aa8a60", 2, groundOffset);
      rectAboveGround(-4, -16, 8, 2, "#76573d", 2, groundOffset);
      rectAboveGround(-2, -16, 4, 2, "#c39664", 2, groundOffset);
    } else if (type === "cactus") {
      // Saguaro: about 60 units wide and 100 tall, centred on the anchor.
      // The body is cached; the base follows the terrain column by column.
      drawCanopy(type);

      // Lower trunk continues the same ribs down to the ground.
      for (let x = -10; x < 10; x += 2) {
        const index = (x + 10) / 2;
        const groove = index > 0 && index < 9 && index % 3 === 0;
        rectDownTo(
          x,
          CACTUS_BODY_BOTTOM,
          2,
          cactusStemColor((x + 11) / 20, groove),
          2,
          groundOffset,
        );
      }

      // A couple of desert pebbles seated on the local ground.
      rectDownTo(-18, groundOffset(-16) - 4, 4, "#7f8d83", 2, groundOffset);
      pixelRect(-18, groundOffset(-16) - 4, 2, 2, "#aeb5a7", 2);
      rectDownTo(12, groundOffset(13) - 2, 4, "#697872", 2, groundOffset);
    } else if (type === "crystal") {
      // Solid shards painted in horizontal bands.
      // Ground clipping keeps their bases seated on uneven terrain.
      const shard = (center, top, halfWidth, lean) => {
        const bottom = Math.round(groundOffset(center) / 2) * 2;
        const height = bottom - top;
        if (height <= 0) return;

        for (let py = top; py < bottom; py += 2) {
          const t = (py - top) / height;

          // Pointed tip, broad shoulder, then a narrower buried base.
          const profile = t < 0.4 ? t / 0.4 : 1 - ((t - 0.4) / 0.6) * 0.35;

          const half = Math.max(2, Math.round((halfWidth * profile) / 2) * 2);
          const axis = center + Math.round((lean * (1 - t)) / 2) * 2;

          rectAboveGround(axis - half, py, half, 2, "#568f98", 2, groundOffset);
          rectAboveGround(axis, py, half, 2, "#83d1ce", 2, groundOffset);

          // A narrow bright facet below the tip.
          if (t > 0.1 && t < 0.8) {
            rectAboveGround(axis, py, 2, 2, "#d9ffff", 2, groundOffset);
          }
        }
      };

      // Side shards behind the taller central crystal.
      shard(-8, -26, 6, -2);
      shard(8, -24, 6, 2);
      shard(0, -40, 8, 0);
    } else if (
      type === "crates" ||
      type === "apple" ||
      type === "ladder" ||
      type === "wheelbarrow" ||
      type === "tyre" ||
      type === "christiania-bike" ||
      type === "bench"
    ) {
      drawCanopy(type);
    } else if (type === "scarecrow") {
      drawCanopy(type);
      // The post below the body follows the ground, like a tree trunk.
      rectDownTo(-2, SCARECROW_BODY_BOTTOM, 2, FARM_WOOD.base, 2, groundOffset);
      rectDownTo(0, SCARECROW_BODY_BOTTOM, 2, FARM_WOOD.light, 2, groundOffset);
      // The head watches the rider go by. Only the face moves, so the head's
      // light and shade stay put.
      const side = riderSide(scene, x, mirrored);
      const face = side < 0 ? "left" : side > 0 ? "right" : "front";
      for (const [fx, fy] of SCARECROW_FACES[face])
        pixelRect(
          fx + SCARECROW_OX,
          fy + SCARECROW_OY,
          2,
          2,
          FARM_WOOD.dark,
          2,
        );
    } else if (type === "beehive") {
      drawCanopy(type);
      const time = scene.time || 0;
      const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
      BEES.forEach(([bx, by], index) => {
        const left = bx + snap(Math.sin(time * 3 + index * 2.1) * 4);
        const top = by + snap(Math.cos(time * 4.3 + index * 1.3) * 2);
        pixelRect(left, top + 2, 4, 2, "#f4c64e", 2);
        pixelRect(left + 2, top + 2, 2, 2, FARM_WOOD.dark, 2);
        pixelRect(left, top, 2, 2, "#fffdf4", 2);
      });
    } else if (
      type === "cone" ||
      type === "barrier" ||
      type === "dumpster" ||
      type === "graffiti"
    ) {
      drawCanopy(type);
    } else if (type === "lamp") {
      drawCanopy(type);
      // The plinth's foot follows the ground.
      rectDownTo(-4, LAMP_BODY_BOTTOM, 2, "#3a403d", 2, groundOffset);
      rectDownTo(-2, LAMP_BODY_BOTTOM, 4, "#4a524d", 2, groundOffset);
      rectDownTo(2, LAMP_BODY_BOTTOM, 2, STEEL.base, 2, groundOffset);
    } else if (type === "crane") {
      drawCanopy(type);
      // Concrete footing, following the ground.
      const f = CRANE_FOOTING;
      rectDownTo(-16, CRANE_BODY_BOTTOM, 4, f.dark, 2, groundOffset);
      rectDownTo(-12, CRANE_BODY_BOTTOM, 28, f.base, 2, groundOffset);
      rectAboveGround(-12, CRANE_BODY_BOTTOM, 28, 2, f.light, 2, groundOffset);
    } else if (type === "scaffolding") {
      drawCanopy(type);
      // Standards run down to base plates on the ground, like tree trunks.
      for (const sx of SCAFFOLD_STANDARDS) {
        rectDownTo(sx, SCAFFOLD_TOP, 2, STEEL.base, 2, groundOffset);
        rectDownTo(sx + 2, SCAFFOLD_TOP, 2, STEEL.light, 2, groundOffset);
        const foot = Math.round(groundOffset(sx + 2) / 2) * 2;
        pixelRect(sx - 2, foot - 2, 8, 2, STEEL.dark, 2);
      }
      drawScaffoldCouplers({ pixelRect });
    } else if (type === "bird") {
      const tools = { pixelRect };
      const flight = scene.flight;
      if (flight) {
        // Away from the rider: a steep take-off that flattens out.
        const age = flight.age;
        const dir = flight.dir * (mirrored ? -1 : 1);
        const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
        ctx.translate(snap(dir * (50 * age + 90 * age * age)), snap(-(80 * age + 40 * age * age)));
        ctx.scale(dir, 1);
        drawBirdFlying(tools, Math.floor(age * 14) % 2 === 0);
      } else {
        // Now and then it pecks at the ground.
        const time = scene.time || 0;
        const peck = time > 0 && (time + propNoise(x, 1) * 7) % 3 < 0.3;
        drawBirdPerched(tools, peck);
      }
    } else if (type === "squirrel") {
      const tools = { pixelRect };
      const flight = scene.flight;
      if (flight) {
        // Runs and climbs in world directions, whichever way it was facing.
        if (mirrored) ctx.scale(-1, 1);
        const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
        const age = flight.age;
        const dash = squirrelDash(wall, flight.dir, age);
        if (dash.hidden) {
          ctx.restore();
          return;
        }
        const stretch = Math.floor(age * 12) % 2 === 0;
        ctx.globalAlpha *= dash.alpha;
        if (dash.climbing) {
          // Gone from sight where the leaves start to cover the trunk.
          ctx.beginPath();
          ctx.rect(-SQUIRREL_RANGE - 40, snap(wall.tree.leaves), (SQUIRREL_RANGE + 40) * 2, 1000);
          ctx.clip();
          ctx.translate(snap(dash.dx) + dash.dir * 6, snap(dash.dy));
          ctx.scale(dash.dir, 1);
          ctx.rotate(-Math.PI / 2);
        } else {
          // A bounding run, a little hop each stride.
          ctx.translate(snap(dash.dx), snap(dash.dy) - (stretch ? 2 : 0));
          ctx.scale(dash.dir, 1);
        }
        drawSquirrelRunning(tools, stretch);
      } else {
        // Now and then it nibbles a nut.
        const time = scene.time || 0;
        drawSquirrelSitting(tools, time > 0 && (time + propNoise(x, 2) * 9) % 5 < 1.2);
      }
    } else if (type === "skull" || type === "car-wreck") {
      drawCanopy(type);
    } else if (type === "tumbleweed") {
      // Blown along downwind, turning the way it rolls.
      const { wind, downwind } = propWind(scene, mirrored);
      const roll = tumbleweedRoll(wall?.path, scene.time || 0, propNoise(x, 6), wind);
      if (roll.alpha > 0) {
        ctx.globalAlpha *= roll.alpha;
        const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
        ctx.translate(snap(roll.distance * downwind), snap(roll.dy - roll.lift) - TUMBLEWEED_RADIUS);
        drawTumbleweed({ pixelPath, pixelRect }, roll.angle * downwind);
      }
    } else if (type === "corgi") {
      // Coda trots about in world directions, whichever way he was placed
      // facing; render.js steps his state (scene.corgi) each frame.
      if (mirrored) ctx.scale(-1, 1);
      const state = scene.corgi ?? corgiStart(mirrored ? -1 : 1);
      const pose = corgiPose(state, wall, corgiPhase(x));
      ctx.translate(pose.dx, 0);
      ctx.scale(pose.dir, 1);
      drawCorgi({ pixelRect }, pose, (lx) => corgiGround(wall, pose.dx + lx * pose.dir));
    } else if (type === "rabbit") {
      // Hops about, and bounds off once startled, in world directions,
      // whichever way it was placed facing. On snow it is a white hare.
      if (mirrored) ctx.scale(-1, 1);
      const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
      const flight = scene.flight;
      const hop = flight
        ? rabbitFlee(wall, flight.from ?? 0, flight.dir, flight.age)
        : { ...rabbitIdle(scene.time || 0, rabbitPhase(x), wall, mirrored ? -1 : 1), alpha: 1, hidden: false };
      if (hop.hidden) {
        ctx.restore();
        return;
      }
      ctx.globalAlpha *= hop.alpha;
      ctx.translate(snap(hop.dx), snap(hop.dy));
      ctx.scale(hop.dir, 1);
      drawRabbit({ pixelRect }, hop.pose, wall?.material === "snow");
    } else if (type === "water-tower") {
      drawCanopy(type);
      // Legs and ladder run down from the platform to the ground.
      const top = TOWER_PLATFORM + 4;
      for (const [lx, width, shaded] of TOWER_LEGS) {
        if (shaded) {
          rectDownTo(lx, top, width, width > 2 ? FARM_WOOD.base : FARM_WOOD.dark, 2, groundOffset);
          rectDownTo(lx, top, 2, FARM_WOOD.dark, 2, groundOffset);
        } else {
          rectDownTo(lx, top, width, FARM_WOOD.light, 2, groundOffset);
          rectDownTo(lx + width - 2, top, 2, FARM_WOOD.tip, 2, groundOffset);
        }
        if (width > 2) {
          const foot = Math.round(groundOffset(lx + width / 2) / 2) * 2;
          pixelRect(lx - 2, foot - 2, width + 4, 2, "#697872", 2);
          pixelRect(lx + width, foot - 2, 2, 2, "#8b978c", 2);
        }
      }
      const { left, right, top: ladderTop, step } = TOWER_LADDER;
      rectDownTo(left, ladderTop, 2, FARM_WOOD.base, 2, groundOffset);
      rectDownTo(right - 2, ladderTop, 2, FARM_WOOD.light, 2, groundOffset);
      for (let ry = ladderTop + 4; ry < 0; ry += step)
        rectAboveGround(left + 2, ry, right - left - 4, 2, FARM_WOOD.tip, 2, groundOffset);
    } else if (type === "windmill") {
      drawCanopy(type);
      // Feet on concrete footings that follow the ground.
      for (const fx of WINDMILL_FEET) {
        rectDownTo(fx, WINDMILL_BODY_BOTTOM, 2, STEEL.dark, 2, groundOffset);
        rectDownTo(fx + 2, WINDMILL_BODY_BOTTOM, 2, STEEL.base, 2, groundOffset);
        const foot = Math.round(groundOffset(fx + 2) / 2) * 2;
        pixelRect(fx - 4, foot - 4, 12, 4, "#8b978c", 2);
        pixelRect(fx - 4, foot - 4, 12, 2, "#aeb5a7", 2);
        pixelRect(fx - 4, foot - 2, 2, 2, "#697872", 2);
      }
      // The rotor turns with the wind.
      ctx.translate(ROTOR.x, ROTOR.y);
      drawWindmillRotor(
        { pixelRect, pixelPath },
        windmillAngle(scene.time || 0, propWind(scene, mirrored).wind, propNoise(x, 3)),
      );
    } else if (type === "heat-haze") {
      drawHeatHaze(x, scene, groundOffset);
    } else if (type === "cairn") {
      drawCanopy(type);
      drawCairnFoot({ pixelRect }, groundOffset);
    } else if (type === "ski-lift") {
      drawCanopy(type);
      // The tower number reads the right way round on a flipped pylon too.
      ctx.save();
      if (mirrored) ctx.scale(-1, 1);
      drawPixelText(PYLON_NUMBER.text, mirrored ? -PYLON_NUMBER.x : PYLON_NUMBER.x, PYLON_NUMBER.y, PYLON_NUMBER.color);
      ctx.restore();
      drawPylonFooting({ pixelRect }, groundOffset);
      drawCable({ pixelRect });
      // One chair rides the rope, fading in and out where the rope does.
      const { wind, downwind } = propWind(scene, mirrored);
      const chair = liftChair(scene.time || 0, propNoise(x, 11), wind, downwind);
      if (chair.alpha > 0) {
        ctx.save();
        ctx.globalAlpha *= chair.alpha;
        ctx.translate(chair.x, chair.y);
        drawChair({ pixelRect, pixelPath }, chair.swing);
        ctx.restore();
      }
    } else if (type === "snow-pine") {
      // A hard landing nearby (scene.landing) shakes the crown and knocks
      // its snow down; the trunk stays put.
      const shake = pineShake(scene.landing, x, y, scene.time || 0);
      ctx.save();
      if (shake) ctx.translate(pineSway(shake), 0);
      drawSwayingCanopy(type, windSwayOf(scene, x, mirrored));
      ctx.restore();
      const trunkTop = PINE_CANOPY_BOTTOM;
      rectDownTo(-6, trunkTop, 8, "#66543f", 2, groundOffset);
      rectDownTo(2, trunkTop, 2, "#856d4f", 2, groundOffset);
      rectDownTo(4, trunkTop, 2, "#aa8a60", 2, groundOffset);
      rectAboveGround(-4, -22, 2, 8, "#856d4f", 2, groundOffset);
      drawPineDrift({ pixelRect }, groundOffset);
      if (shake) drawPineSnowFall(shake, x, groundOffset);
    } else if (type === "hut") {
      drawCanopy(type);
      drawHutFoundation({ pixelRect }, groundOffset);
      // Chimney smoke, blown downwind.
      const { wind, downwind } = propWind(scene, mirrored);
      drawSmokePuffs(chimneySmoke(scene.time || 0, propNoise(x, 10), wind, downwind));
    } else if (type === "snowman") {
      drawCanopy(type);
      drawSnowmanDrift({ pixelRect }, groundOffset);
      // The eyes watch the rider go by, like the scarecrow, and glance up or
      // down at them too; the carrot turns with them.
      const dy = Number.isFinite(scene.riderY) ? scene.riderY - (y + SNOWMAN_EYE_HEIGHT) : null;
      drawSnowmanFace({ pixelRect }, snowmanGaze(riderSide(scene, x, mirrored), dy));
    } else if (
      type === "tyre-wall" ||
      type === "hay-bales" ||
      type === "petrol-can" ||
      PAINTED_PROPS.has(type)
    ) {
      drawCanopy(type);
    } else if (type === "course-tape") {
      // The loose end blows downwind.
      const { wind, downwind } = propWind(scene, mirrored);
      drawCourseTape({ pixelRect }, groundOffset, scene.time || 0, wind, propNoise(x, 13), downwind);
    } else if (type === "banner") {
      const style = bannerStyle(text, propNoise(x, 14));
      drawBanner({ pixelRect, drawPixelDisc }, style, groundOffset);
      const layout = bannerLayout(style);
      drawPixelText(style.name, layout.text.x, layout.text.y, style.colors.text, { align: "left" });
      if (Number.isInteger(style.umlaut)) {
        const ux = layout.text.x + style.umlaut * 8;
        pixelRect(ux, layout.text.y - 4, 2, 2, style.colors.text, 2);
        pixelRect(ux + 4, layout.text.y - 4, 2, 2, style.colors.text, 2);
      }
    } else if (type === "spectators") {
      // They cheer as the rider goes by and duck from a crash nearby.
      const mood = spectatorMood(scene, x, y);
      const phase = propNoise(x, 15);
      SPECTATORS.forEach(({ x: sx, look }, index) => {
        const hop = mood === "cheer" ? spectatorHop(scene.time || 0, index, phase) : 0;
        ctx.save();
        ctx.translate(sx, Math.round(groundOffset(sx) / 2) * 2 + hop);
        drawPerson({ pixelRect }, look, mood);
        ctx.restore();
      });
    } else if (type === "pit-board") {
      drawCanopy(type);
      rectDownTo(-2, PIT_BOARD_BOTTOM + 4, 2, STEEL.dark, 2, groundOffset);
      rectDownTo(0, PIT_BOARD_BOTTOM + 4, 2, STEEL.light, 2, groundOffset);
      const label = pitBoardText(text, propNoise(x, 16));
      const big = label.length <= 2;
      drawPixelText(label, 0, PIT_BOARD.top + (big ? 4 : 10), "#fffdf4", { pixel: big ? 4 : 2 });
    } else if (type === "marshal-start" || type === "marshal-finish") {
      ctx.translate(0, Math.round(groundOffset(0) / 2) * 2);
      drawMarshal({ pixelRect, pixelPath }, type, marshalFlag(scene, x, y, propNoise(x, 17)), scene.time || 0);
    } else if (type === "camera-tower") {
      drawCanopy(type);
      for (const [index, lx] of CAMERA_TOWER_LEGS.entries()) {
        rectDownTo(lx, CAMERA_TOWER_BODY_BOTTOM, 2, index ? STEEL.mid : STEEL.dark, 2, groundOffset);
        rectDownTo(lx + 2, CAMERA_TOWER_BODY_BOTTOM, 2, index ? STEEL.light : STEEL.base, 2, groundOffset);
        const foot = Math.round(groundOffset(lx + 2) / 2) * 2;
        pixelRect(lx - 2, foot - 2, 8, 2, STEEL.dark, 2);
      }
      // The camera follows the rider, its tally light blinking while it rolls.
      drawCamera({ pixelRect, drawPixelDisc }, riderSide(scene, x, mirrored), cameraTallyOn(scene.time || 0));
    } else if (
      type === "warning-triangle" ||
      type === "warning-bang" ||
      type === "warning-skull" ||
      type === "arrow-sign"
    ) {
      drawSignPost({ pixelRect }, type === "warning-skull" || type === "arrow-sign", groundOffset);
      drawCanopy(type);
    } else if (type === "halfway-flag") {
      // Pale until the rider passes (scene.passed), then lit, with the split
      // on its timing board.
      const passed = scene.passed;
      const { wind, downwind } = propWind(scene, mirrored);
      drawHalfwayFlag({ pixelRect }, Boolean(passed), groundOffset, scene.time || 0, wind, propNoise(x, 18), downwind);
      const { left, top, width } = HALFWAY_BOARD;
      drawPixelText(splitText(passed?.split), left + width / 2, top + 3, halfwayTextColor(Boolean(passed)));
      const flash = passed && scene.time ? halfwayFlash(passed.age) : null;
      if (flash) {
        const base = ctx.globalAlpha;
        ctx.globalAlpha = base * flash.alpha * 0.6;
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          pixelRect(
            Math.round((HALFWAY_BEACON.x + Math.cos(angle) * flash.radius) / 2) * 2 - 1,
            Math.round((HALFWAY_BEACON.y + Math.sin(angle) * flash.radius) / 2) * 2 - 1,
            2,
            2,
            HALFWAY_LIGHT.glow,
            2,
          );
        }
        ctx.globalAlpha = base;
      }
    } else if (type === "prison-fence" || type === "ball-and-chain") {
      drawCanopy(type);
    } else if (type === "watchtower") {
      drawCanopy(type);
      for (const [index, lx] of WATCHTOWER_LEGS.entries()) {
        rectDownTo(lx, WATCHTOWER_BODY_BOTTOM, 2, index ? FARM_WOOD.light : FARM_WOOD.dark, 2, groundOffset);
        rectDownTo(lx + 2, WATCHTOWER_BODY_BOTTOM, 2, index ? FARM_WOOD.tip : FARM_WOOD.base, 2, groundOffset);
        const foot = Math.round(groundOffset(lx + 2) / 2) * 2;
        pixelRect(lx - 2, foot - 4, 8, 4, "#8b978c", 2);
        pixelRect(lx - 2, foot - 4, 8, 2, "#aeb5a7", 2);
      }
      // The searchlight sweeps, and swings round to the rider once close.
      const angle = searchlightAimAt(scene.time || 0, x, y, scene.riderX, scene.riderY, mirrored);
      drawSearchlight({ pixelRect, pixelPath, drawPixelDisc }, angle, false);
    } else if (type === "jail-cell") {
      // The prisoner lounges on the bunk, and comes to rattle the bars when
      // the rider rides by, watching them go.
      drawCanopy(type);
      const tools = { pixelRect };
      const skin = PRISONER_SKINS[Math.floor(propNoise(x, 21) * PRISONER_SKINS.length)];
      const { pose, rattle } = cellPrisoner(scene, x, y);
      const look = riderSide(scene, x, mirrored);
      ctx.save();
      if (pose === "sit") ctx.translate(CELL_BUNK.x, CELL_BUNK.y);
      else ctx.translate(rattle, -4);
      drawPrisoner(tools, skin, pose, look);
      ctx.restore();
      drawCellBars(tools);
      if (pose === "stand") {
        ctx.save();
        ctx.translate(rattle, -4);
        drawPrisonerHands(tools, skin);
        ctx.restore();
      }
    } else if (type === "escape-tunnel") {
      // A prisoner peeks out of the tunnel, and sinks back out of sight as
      // the rider comes close.
      drawCanopy(type);
      const peek = tunnelPeek(scene, x, y, propNoise(x, 20));
      if (peek.rise > 0) {
        const skin = PRISONER_SKINS[Math.floor(propNoise(x, 21) * PRISONER_SKINS.length)];
        ctx.save();
        ctx.beginPath();
        ctx.rect(-40, -80, 80, 76);
        ctx.clip();
        ctx.translate(0, -2 + Math.round(((1 - peek.rise) * TUNNEL_DEPTH) / 2) * 2);
        drawPrisonerBust({ pixelRect }, skin, mirrored ? -peek.look : peek.look);
        ctx.restore();
      }
      drawTunnelLip({ pixelRect });
    } else if (type === "wanted-poster") {
      rectDownTo(-2, WANTED_POST_TOP, 2, FARM_WOOD.base, 2, groundOffset);
      rectDownTo(0, WANTED_POST_TOP, 2, FARM_WOOD.tip, 2, groundOffset);
      drawCanopy(type);
      drawPixelText(WANTED.title.text, 0, WANTED.title.y, "#182321");
      drawPixelText(WANTED.reward.text, 0, WANTED.reward.y, "#a8322a");
    } else if (type === "vulture" && scene.swoop) {
      // Swooping down to a crashed rider: drawn at its body, which x and y
      // already are (see vultureSwoop).
      const { pose, dir, flap, dip } = scene.swoop;
      ctx.scale(dir, 1);
      if (pose === "standing") drawVultureStanding({ pixelRect }, dip);
      else if (pose === "landing") drawVultureLanding({ pixelRect }, flap);
      else drawVultureSoaring({ pixelRect }, flap);
    } else if (type === "vulture") {
      const orbit = vultureOrbit(scene.time || 0, propNoise(x, 7));
      const snap = (value) => Math.round(value / ART_PIXEL) * ART_PIXEL;
      ctx.translate(snap(orbit.dx), snap((wall?.centre ?? 0) + orbit.dy));
      if (orbit.banking) drawVultureBanking({ pixelRect });
      else {
        ctx.scale(orbit.dir, 1);
        drawVultureSoaring({ pixelRect }, orbit.flap);
      }
    } else if (CEILING_PROPS.has(type)) {
      const tools = { pixelRect };
      const fit = wall || { ceiling: null, drop: null, colors: rockColors(), body: 0 };
      const noise = (n) => propNoise(x, n);
      // With no roof found it hangs from its own anchor.
      const roof = Math.round((fit.ceiling ?? 0) / 2) * 2;
      if (type === "lantern") {
        const body = Math.round((fit.body || 0) / 2) * 2;
        ctx.translate(0, body);
        const chain = fit.ceiling === null ? 0 : Math.max(0, body + LANTERN_TOP - roof);
        drawLantern(tools, chain);
      } else {
        ctx.translate(0, roof);
        const room = Number.isFinite(fit.drop) ? fit.drop : Infinity;
        if (type === "hanging-roots") drawHangingRoots(tools, Math.min(64, room - 14), noise);
        else if (type === "stalactites") drawStalactites(tools, fit.colors, Math.min(32, room - 24), noise);
        else if (type === "drip") drawDrip(tools, fit.colors, fit.drop, scene.time || 0, noise(4));
        else if (type === "icicles") {
          // Meltwater drips off the longest icicle, just like a cave drip.
          const tip = drawIcicles(tools, room - 24, noise, scene.time || 0);
          ctx.translate(tip.x, tip.y - 2);
          const drop = Number.isFinite(fit.drop) ? fit.drop - tip.y + 2 : null;
          drawDrip(tools, { base: ICE.light, dark: ICE.base }, drop, scene.time || 0, noise(4));
        }
        else if (type === "spiderweb") {
          // The web trembles as the rider passes, and its spider scurries up
          // out of the way.
          const { hub } = webSize(room);
          const state = webState(scene, x, y + roof + hub);
          const sway = scene.time ? Math.sin(scene.time * 0.9 + noise(5) * 6) * propWind(scene, mirrored).wind : 0;
          const { spider } = drawSpiderweb({ pixelRect, pixelPath }, room, noise, state, sway);
          ctx.translate(spider[0], spider[1]);
          drawSpider({ pixelRect, drawPixelDisc }, state.dare < 1 && scene.time ? Math.floor(scene.time * 12) % 2 : 0);
        } else if (type === "cobweb") {
          const { wind, downwind } = propWind(scene, mirrored);
          drawCobweb({ pixelRect, pixelPath }, room, noise, scene.time || 0, wind, downwind);
        } else if (type === "spider") {
          // Lets itself down on its thread, and climbs back up when the rider comes.
          const hang = danglingSpider(scene, x, y + roof, room, noise(6));
          const { spider } = drawDanglingSpider({ pixelPath }, hang);
          ctx.translate(spider[0], spider[1]);
          drawSpider({ pixelRect, drawPixelDisc }, hang.step);
        } else if (type === "cocoon")
          drawCocoon({ pixelRect, pixelPath }, room, cocoonMotion(scene.time || 0, propWind(scene, mirrored).wind, noise(7)));
        else if (type === "portcullis")
          // Grinds up into the roof as the rider comes, and down behind them.
          drawPortcullis(tools, portcullisDrop(scene, x, y + roof + Math.min(room, PORTCULLIS.height), room));
        else if (type === "hanging-chains" || type === "gibbet") {
          // Swaying in the draught, and swinging after a hard landing nearby.
          const swing = hangingSwing(scene.time || 0, propWind(scene, mirrored).wind, scene.landing, x, y + roof, noise(8), type === "gibbet" ? 0.7 : 1);
          if (type === "hanging-chains") drawHangingChains(tools, room, swing);
          else {
            const [cx, cy] = drawGibbetChain(tools, room, swing);
            ctx.translate(cx, cy);
            drawGibbetCage(tools);
          }
        }
        else drawBats(x, scene);
      }
    } else if (WATER_PROPS.has(type)) {
      drawWaterProp(type, x, wall, mirrored, groundOffset, scene);
    } else if (type === "mushrooms") {
      drawMushrooms({ pixelRect }, groundOffset);
    } else if (type === "minecart") {
      const fit = wall || { left: 40, right: 40, leftWall: false, rightWall: false };
      // Rails run in world space, so a mirrored cart's track is mirrored back.
      const [left, right, openLeft, openRight] = mirrored
        ? [-fit.right, fit.left, !fit.rightWall, !fit.leftWall]
        : [-fit.left, fit.right, !fit.leftWall, !fit.rightWall];
      const snapTo = (value) => Math.round(value / 2) * 2;
      drawRails({ pixelRect }, snapTo(left), snapTo(right), groundOffset, openLeft, openRight);
      // The cart tilts to sit both wheels on the rails.
      const [rear, front] = CART_WHEELS.map((wx) => snapTo(groundOffset(wx)));
      ctx.translate(0, snapTo((rear + front) / 2) + RAIL_TOP);
      ctx.rotate(Math.atan2(front - rear, CART_WHEELS[1] - CART_WHEELS[0]));
      drawCanopy(type);
    } else if (type === "beams") {
      const roofs = wall?.roofs || [];
      const roofAt = (local) => roofs[(local + BEAM_HALF) / 2] ?? null;
      const found = roofs.filter((roof) => roof !== null);
      // The cap beam sits under the lowest point of the roof above it.
      let headerTop = found.length ? Math.max(...found) : -BEAM_HEIGHT;
      headerTop = Math.min(-32, Math.round(headerTop / 2) * 2);
      drawBeams({ pixelRect }, groundOffset, headerTop, roofAt, BEAM_PACKING);
    } else if (type === "tent") {
      drawCanopy(type);
      drawTentRopes({ pixelRect, pixelPath }, groundOffset);
    } else if (type === "fireplace") {
      // The stones and logs; the flames are drawn with the glowing parts.
      // Smoke rises off the fire and blows downwind, like the hut's.
      drawCanopy(type);
      const { wind, downwind } = propWind(scene, mirrored);
      ctx.translate(-HUT_CHIMNEY.x, FIRE.smoke - HUT_CHIMNEY.y);
      drawSmokePuffs(chimneySmoke(scene.time || 0, propNoise(x, 35), wind, downwind), 0.8);
    } else if (type === "mill") {
      // A Danish windmill: the tower, its base down to the ground, and the
      // sails turning slowly with the wind.
      drawCanopy(type);
      drawMillBase({ pixelRect }, groundOffset);
      const { wind } = propWind(scene, mirrored);
      drawMillSails({ pixelRect, pixelPath, drawPixelDisc }, millAngle(scene.time || 0, wind, propNoise(x, 52)));
    } else if (type === "farmhouse") {
      // A half-timbered farmhouse, white or ochre by its place in the trail:
      // the house, its plinth down to the ground, and chimney smoke blown
      // downwind like the hut's.
      drawCanopy(type, propNoise(x, 53) < 0.5 ? 1 : 0);
      drawFarmhouseBase({ pixelRect }, groundOffset);
      const { wind, downwind } = propWind(scene, mirrored);
      ctx.translate(FARMHOUSE.chimney.x - HUT_CHIMNEY.x, FARMHOUSE.chimney.y - HUT_CHIMNEY.y);
      drawSmokePuffs(chimneySmoke(scene.time || 0, propNoise(x, 54), wind, downwind));
    } else if (type === "mailbox") {
      // The flag flips up as the rider passes (scene.passed), the way the
      // halfway flag lights up.
      drawMailbox({ pixelRect, pixelPath }, groundOffset, mailboxFlagLift(scene.passed?.age ?? null, scene.time || 0));
    } else if (type === "stall") {
      drawCanopy(type);
      drawStallLegs({ pixelRect }, groundOffset);
      // The sign is centred on the anchor, so it is painted the right way
      // round on a flipped stall by turning it back.
      if (mirrored) ctx.scale(-1, 1);
      const lines = stallSignLines(text);
      const { top, height } = STALL.sign;
      lines.forEach((line, index) => drawPixelText(line, 0, top + (height - lines.length * 12 + 2) / 2 + index * 12, "#a8322a"));
      if (mirrored) ctx.scale(-1, 1);
      // A coin dropping into the honesty box after the rider pays.
      const coin = scene.paid && scene.time ? stallCoin(scene.time - scene.paid.time) : null;
      if (coin) drawStallCoin({ pixelRect }, coin);
    } else if (type === "wind-turbine") {
      // Far off on the horizon, its blades turning slowly clockwise, however
      // it is flipped.
      drawCanopy(type);
      drawTurbineFoot({ pixelRect }, groundOffset);
      const { wind } = propWind(scene, mirrored);
      const angle = turbineAngle(scene.time || 0, wind, propNoise(x, 55));
      drawTurbineBlades({ pixelPath, drawPixelDisc }, mirrored ? Math.PI - angle : angle);
    } else if (type === "smoke") {
      // A plume rising from its anchor, on top of a chimney built from terrain
      // say, blown downwind like the hut's.
      const { wind, downwind } = propWind(scene, mirrored);
      ctx.translate(-HUT_CHIMNEY.x, -HUT_CHIMNEY.y);
      drawSmokePuffs(chimneySmoke(scene.time || 0, propNoise(x, 38), wind, downwind));
    } else if (type === "grass") {
      // Swaying downwind, and pushed flat as the rider brushes through. The
      // rider's offset is taken in the tuft's own frame.
      const side = mirrored ? -1 : 1;
      const known = Number.isFinite(scene.riderX) && Number.isFinite(scene.riderY);
      const phase = propNoise(x, 33);
      const { wind, downwind } = propWind(scene, mirrored);
      drawGrass({ pixelRect }, groundOffset, (blade) => {
        const ground = groundOffset(blade.x + 1);
        return grassLean(
          scene.time || 0, wind, downwind, phase, blade.x,
          known ? (scene.riderX - x) * side - blade.x : null,
          known ? scene.riderY - (y + ground) : null,
        );
      });
    } else if (type === "flagpole") {
      // Dannebrog flies downwind.
      const { wind, downwind } = propWind(scene, mirrored);
      drawFlagpole({ pixelRect }, groundOffset, scene.time || 0, wind, propNoise(x, 34), downwind);
    } else if (type === "dungeon-bars") {
      const bars = barLayout(wall?.roofs ?? BAR_XS.map(() => null), groundOffset, propNoise(x, 30) < 0.3);
      drawDungeonBars({ pixelRect }, bars, (n) => propNoise(x, 31 + n));
    } else if (type === "torch") {
      // The stand; its flame is drawn with the glowing parts.
      drawCanopy(type);
      drawTorchFeet({ pixelRect }, groundOffset);
    } else if (type === "skeleton") {
      // The skull turns to watch the rider, and its jaw chatters after a
      // hard landing nearby.
      drawCanopy(type);
      drawSkeletonSkull({ pixelRect }, riderSide(scene, x, mirrored), skeletonJaw(scene.time || 0, scene.landing, x, y));
    } else if (type === "start") {
      // Same pennant as the start line, drawn by the shared function, flying
      // downwind.
      const { wind, downwind } = propWind(scene, mirrored);
      drawStartPennant(ctx, 0, 0, groundOffset, scene.time || 0, wind, downwind);
    } else if (WALL_PROPS.has(type)) {
      if (type === "moss") ctx.translate(Math.round((wall?.at?.[0] ?? 0) / 2) * 2, Math.round((wall?.at?.[1] ?? 0) / 2) * 2);
      else if (type !== "vines") ctx.translate(wall?.face || 0, 0);
      // Grow away from the rock: rock on the right (side 1) means grow left.
      if (type === "vines") drawVines(x, wall);
      else if (type === "moss") {
        // Cushions of moss along the surface, whichever way it faces.
        drawMoss({ pixelRect }, mossCushions((n) => propNoise(x, 40 + n)), wall?.normal ?? [0, -1]);
      }
      else if (type === "ivy") {
        // Climbs the face, its leaves out in the air and stirring in the wind.
        ctx.scale(wall?.side === 1 ? -1 : 1, 1);
        const phase = propNoise(x, 36);
        const layout = ivyLayout(wall?.rise || IVY.alone, (n) => propNoise(x, 37 + n));
        const { wind } = propWind(scene, mirrored);
        drawIvy({ pixelRect }, layout, (index) => ivyRustle(scene.time || 0, wind, phase, index));
      } else {
        ctx.scale(wall?.side === 1 ? -1 : 1, 1);
        drawRoots(x);
      }
    } else if (type === "sign") {
      // Post from -2 to +4: shaded left, lit right, following the slope.
      rectDownTo(-2, -22, 6, "#856d4f", 2, groundOffset);
      rectDownTo(-2, -22, 2, "#66543f", 2, groundOffset);
      rectDownTo(2, -22, 2, "#aa8a60", 2, groundOffset);
      drawBoard(0, -22, text);
    }
    ctx.restore();
  }

  function bikeCanvas() {
    if (bikeSprite) return bikeSprite;
    const size = (BIKE_SPRITE_REACH * 2) / ART_PIXEL;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    bikeSprite = { canvas, context, size, tools: createDrawingTools(context) };
    return bikeSprite;
  }

  // The frame and rider are drawn axis-aligned into a scratch sprite, where every
  // rectangle lands on whole art pixels, and the sprite is then rotated onto the
  // scene with nearest-neighbour sampling instead of rotating each rectangle.
  // Frames are drawn facing right with the rear axle at (-half, 0) and the front
  // axle at (half, 0). Parts joined to an axle use `path`; parts on the sprung
  // body use `bodyPoint`, `bodyRect`, and `bodyPath` so they pitch and drop.
  function drawClassicFrame({
    paint,
    path,
    spring,
    half,
    bodyPoint,
    bodyRows,
    bodyPath,
  }) {
    const c = CLASSIC_COLORS;
    const colors = {
      Q: c.saddle,
      q: c.saddleDark,
      S: c.steel,
      s: c.steelDark,
      y: c.gold,
      Y: c.goldLight,
      d: c.goldDark,
      k: c.saddleDark,
    };
    const backMount = bodyPoint(-9, -15),
      frontMount = bodyPoint(12, -23);
    const crank = bodyPoint(-3, -1);
    const seat = bodyPoint(-8, -19),
      head = bodyPoint(13, -18);

    // Chain, from the chainring round the gold cog on the rear hub.
    path([bodyPoint(-3, -7), [-half, -3]], c.chain, 1);
    path([bodyPoint(-3, 5), [-half, 3]], c.chain, 1);
    path([[-half, -1], [-half, 1]], c.gold, 3);

    // Rear rack under the tail light, braced to the rear axle.
    path([bodyPoint(-25, -19), [-half, 0]], c.steelDark, 1);
    bodyRows(-27, -20, CLASSIC_RACK, colors);

    // Chrome mudguards over both wheels.
    bodyPath(
      [
        [-15, -16],
        [-24, -18],
        [-33, -16],
        [-37, -11],
      ],
      c.chrome,
      1,
    );
    const axle = WHEELBASE / 2;
    bodyPath(
      [
        [axle - 7, -16],
        [axle + 1, -17],
        [axle + 7, -14],
      ],
      c.chrome,
      1,
    );

    // The diamond frame: stays to the rear axle, then the seat, top and down
    // tubes, each lit along its top and shaded under.
    path([[-half, 2], [crank[0], crank[1] + 2]], paint.dark, 1);
    path([[-half, 0], crank], paint.base, 2);
    path([[-half, 0], seat], paint.shade, 2);
    path([[-half, 0], backMount], c.steelDark, 2);
    path([[-half, -1], [backMount[0], backMount[1] - 1]], c.steel, 1);
    spring(-half, 0, backMount[0], backMount[1], c.gold);
    path([[head[0], head[1] + 2], [crank[0] + 1, crank[1] + 1]], paint.dark, 1);
    path([head, crank], paint.base, 2);
    path([crank, bodyPoint(-8, -20)], paint.base, 2);
    path([[crank[0] - 1, crank[1]], bodyPoint(-9, -20)], paint.light, 1);
    path([seat, head], paint.base, 2);
    path([bodyPoint(-8, -20), bodyPoint(13, -19)], paint.light, 1);

    bodyRows(-17, -24, CLASSIC_SADDLE, colors);
    bodyRows(-10, -8, CLASSIC_CHAINRING, colors);
    // Crank arm and pedal, under the rider's foot.
    bodyPath(
      [
        [-3, -1],
        [1, 4],
      ],
      c.steelDark,
      2,
    );
    bodyPath(
      [
        [1, 5],
        [3, 5],
      ],
      c.black,
      2,
    );

    // Fork: a steel leg lit along its front, inside the coil spring.
    path([[half, 0], frontMount], c.steelDark, 2);
    path([[half + 1, 0], [frontMount[0] + 1, frontMount[1]]], c.chrome, 1);
    spring(half, 0, frontMount[0], frontMount[1], c.gold);
    // Stem and swept-back handlebar.
    bodyPath(
      [
        [10, -23],
        [12, -28],
        [19, -28],
      ],
      c.saddleDark,
      2,
    );
  }

  function drawScramblerFrame({
    paint,
    path,
    spring,
    half,
    bodyPoint,
    bodyRows,
    bodyPath,
  }) {
    const c = SCRAMBLER_COLORS;
    const colors = {
      G: paint.base,
      L: paint.light,
      D: paint.dark,
      W: c.chrome,
      Q: c.seat,
      q: c.seatDark,
      S: c.steel,
      s: c.steelDark,
      y: c.gold,
      Y: c.goldLight,
      C: c.caseLight,
      c: c.case,
      k: c.caseDark,
      K: c.black,
    };
    const backMount = bodyPoint(-9, -15),
      frontMount = bodyPoint(12, -23);
    const crank = bodyPoint(-3, -1);

    // The thin twin-loop frame, each tube with a shadow under it.
    path(
      [[-half, 2], [crank[0], crank[1] + 2], [half, 2]],
      paint.dark,
      1,
    );
    path(
      [[-half, 0], bodyPoint(-7, -18), bodyPoint(13, -17), [half, 0]],
      paint.shade,
      2,
    );
    path([[-half, 0], crank, [half, 0]], paint.base, 2);
    path([[-half, 0], backMount], c.steelDark, 2);
    path([[-half, -1], [backMount[0], backMount[1] - 1]], c.steel, 1);
    spring(-half, 0, backMount[0], backMount[1], c.gold);

    // Rear fender, from the ducktail down over the rear wheel.
    bodyPath(
      [
        [-24, -18],
        [-32, -16],
        [-36, -12],
      ],
      paint.base,
      1,
    );
    bodyPath(
      [
        [-25, -20],
        [-33, -18],
      ],
      paint.light,
      1,
    );

    bodyRows(-11, -14, SCRAMBLER_ENGINE, colors);
    // Chrome exhaust, under the engine and swept up to a scrambler muffler.
    bodyPath(
      [
        [4, -9],
        [7, -2],
        [2, 3],
        [-10, 3],
        [-15, -7],
      ],
      c.steelDark,
      1,
    );
    bodyRows(-29, -12, SCRAMBLER_MUFFLER, colors);
    bodyRows(-27, -24, SCRAMBLER_BODY, colors);

    // Fork: a steel leg lit along its front, inside the coil spring.
    path([[half, 0], frontMount], c.steelDark, 2);
    path([[half + 1, 0], [frontMount[0] + 1, frontMount[1]]], c.chrome, 1);
    spring(half, 0, frontMount[0], frontMount[1], c.gold);
    bodyPath(
      [
        [10, -23],
        [12, -28],
        [19, -28],
      ],
      c.seatDark,
      2,
    );
    // Short front fender over the resting front wheel, like the Elasto's.
    const axle = WHEELBASE / 2;
    bodyPath(
      [
        [axle - 7, -16],
        [axle + 1, -17],
        [axle + 7, -14],
      ],
      paint.base,
      1,
    );
    bodyPath(
      [
        [axle - 5, -18],
        [axle + 2, -18],
      ],
      paint.light,
      1,
    );
  }

  function drawElastoFrame({
    paint,
    path,
    spring,
    half,
    bodyPoint,
    bodyRows,
    bodyPath,
  }) {
    const c = ELASTO_COLORS;
    const colors = {
      G: paint.base,
      L: paint.light,
      D: paint.dark,
      W: c.white,
      w: c.silver,
      S: c.silver,
      s: c.silverDark,
      e: c.rim,
      h: c.hub,
      H: c.hubLight,
      K: c.black,
      k: c.tread,
      R: c.red,
    };
    const pivot = bodyPoint(-4, -6),
      shockTop = bodyPoint(-6, -20),
      forkTop = bodyPoint(14, -26);
    const shockBase = [-half + (pivot[0] + half) * 0.45, pivot[1] * 0.45];
    // The fork's lower leg is bolted to the axle and keeps its length, so the
    // stanchion above it shows the fork's travel: about 17 px of it topped
    // out, 14 at sag, and 2 to 4 at the bottom of the stroke.
    const forkLength = Math.hypot(forkTop[0] - half, forkTop[1]) || 1;
    const sliderShare = Math.min(1, ELASTO_FORK_SLIDER_LENGTH / forkLength);
    const forkSlider = [
      half + (forkTop[0] - half) * sliderShare,
      forkTop[1] * sliderShare,
    ];

    path([[-half, 0], pivot], c.silver, 2);
    path(
      [
        [-half, 2],
        [pivot[0], pivot[1] + 2],
      ],
      c.spoke,
      1,
    );

    bodyRows(-10, -24, ELASTO_MID, colors);
    bodyPath(
      [
        [14, -22],
        [16, -12],
        [12, -2],
      ],
      c.black,
      1,
    );
    spring(shockBase[0], shockBase[1], shockTop[0], shockTop[1], c.orange);
    bodyRows(-40, -28, ELASTO_TAIL, colors);
    bodyRows(-4, -26, ELASTO_TANK, colors);

    path([[half, 0], forkTop], c.silverDark, 2);
    path([forkSlider, forkTop], c.silver, 2);
    path([[half, 0], forkSlider], c.hubLight, 1);
    // Top clamp, riser and handlebar, raised clear of the tank.
    bodyPath(
      [
        [14, -26],
        [13, -28],
      ],
      c.black,
      2,
    );
    bodyPath(
      [
        [11, -28],
        [19, -28],
      ],
      c.black,
      2,
    );
    // Front fender, bolted to the lower triple clamp: it rides on the sprung
    // body, where it sits over the resting front wheel, so the tire rises
    // toward it as the fork compresses instead of carrying it along.
    const axle = WHEELBASE / 2;
    bodyPath(
      [
        [axle - 6, -18],
        [axle + 2, -18],
        [axle + 9, -16],
      ],
      paint.base,
      1,
    );
    bodyPath(
      [
        [axle - 4, -20],
        [axle + 5, -20],
      ],
      paint.light,
      1,
    );
  }

  const BIKES = {
    elasto: { wheel: drawElastoWheel, frame: drawElastoFrame },
    classic: { wheel: drawClassicWheel, frame: drawClassicFrame },
    scrambler: { wheel: drawScramblerWheel, frame: drawScramblerFrame },
  };

  function drawBike({
    rear,
    front,
    mx,
    my,
    angle,
    length,
    flipVisual = 1,
    facing = 1,
    brakePressure = 0,
    lights = false,
    state = "ready",
    leanVisual = 0,
    look = null,
    bike = null,
    dirt = null,
    squish = null,
  }) {
    const parts = lookParts(look);
    const modelId = bikeModel(look, bike);
    const model = BIKES[modelId];
    tyre = squish?.rear.level ? squish.rear : null;
    model.wheel(rear, dirt?.rear);
    tyre = squish?.front.level ? squish.front : null;
    model.wheel(front, dirt?.front);
    tyre = null;
    const sprite = bikeCanvas();
    const { context, size } = sprite;
    const {
      pixelRect: rect,
      pixelPath: path,
      drawPixelSpring: spring,
    } = sprite.tools;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, size, size);
    context.setTransform(
      1 / ART_PIXEL,
      0,
      0,
      1 / ART_PIXEL,
      size / 2,
      size / 2,
    );

    const half = length / 2;
    const pose = bodyPose(rear, front, facing);
    const bodyDrop = pose.drop;
    const bodyPitch = pose.pitch;
    const pc = Math.cos(bodyPitch),
      ps = Math.sin(bodyPitch);
    const bodyPoint = (x, y) => [x * pc - y * ps, x * ps + y * pc + bodyDrop];

    // Body parts pitch with the suspension by moving each piece's centre, so
    // the pieces themselves stay on the pixel grid.
    const drop = Math.round(bodyDrop / 2) * 2;
    const bodyRect = (x, y, width, height, color, pixel = 2) => {
      const cx = x + width / 2,
        cy = y + height / 2;
      rect(
        cx * pc - cy * ps - width / 2,
        cx * ps + cy * pc - height / 2 + drop,
        width,
        height,
        color,
        pixel,
      );
    };
    const bodyPath = (points, color, thickness) =>
      path(
        points.map(([x, y]) => [x * pc - y * ps, x * ps + y * pc + drop]),
        color,
        thickness,
      );
    // A rigid pixel-art piece with its top left at (x, y), moved by its centre.
    const bodyRows = (x, y, rows, colors) => {
      const width = Math.max(...rows.map((row) => row.length)) * 2,
        height = rows.length * 2;
      const cx = x + width / 2,
        cy = y + height / 2;
      drawPixelRows(
        rect,
        cx * pc - cy * ps - width / 2,
        cx * ps + cy * pc - height / 2 + drop,
        rows,
        colors,
      );
    };
    model.frame({
      paint: parts.bikeColors,
      path,
      spring,
      half,
      bodyPoint,
      bodyRect,
      bodyRows,
      bodyPath,
    });
    const lamps = BIKE_LAMPS[modelId];
    const lampPaint = lampColors(parts.bikeColors, { lights, brakePressure });
    bodyRows(lamps.head.x, lamps.head.y, lamps.head.rows, lampPaint);
    bodyRows(lamps.tail.x, lamps.tail.y, lamps.tail.rows, lampPaint);

    if (state !== "ragdoll") {
      const shift = Math.round(leanVisual * 4.5) * 2;
      const colors = parts.palette;
      const outline = "#263b36";

      const hip = [-11 + shift, -26];
      const knee = [2 + shift * 0.45, -16];
      const ankle = [-2, -3];

      const shoulder = [-4 + shift, -36];
      const elbow = [8 + shift * 0.45, -32];
      const hand = RIDER_HAND;

      const style = outfitStyle(parts.shapes.outfit);
      // A point `t` of the way along a limb's joints (0 at the first, 1 at
      // the last, each section an equal share), and the limb's direction there.
      const along = (joints, t) => {
        const sections = joints.length - 1;
        const index = Math.min(sections - 1, Math.floor(t * sections));
        const [a, b] = [joints[index], joints[index + 1]];
        const local = t * sections - index;
        return { at: [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local], dx: b[0] - a[0], dy: b[1] - a[1] };
      };
      // Bands straight across a limb `width` wide, as on the stripes and cuffs.
      const limbBands = (joints, bands, width) => {
        if (!bands) return;
        for (const t of bands.at) {
          const { at, dx, dy } = along(joints, t);
          const length = Math.hypot(dx, dy) || 1;
          const nx = (-dy / length) * width, ny = (dx / length) * width;
          bodyPath([[at[0] - nx, at[1] - ny], [at[0] + nx, at[1] + ny]], colors[bands.color], 2);
        }
      };
      const leg = [hip, knee, ankle];
      const arm = [shoulder, elbow, hand];

      // Trousers: outlined silhouette with a narrow lit edge.
      bodyPath(leg, outline, 4);
      bodyPath(leg, colors.trousers, 3);
      if (style.legs === "shorts") {
        // Bare from the hem above the knee, long socks from mid-shin.
        const hem = along(leg, 0.42).at, sock = along(leg, 0.7).at;
        bodyPath([hem, knee, sock], colors.skin, 3);
        bodyPath([sock, ankle], colors.socks, 3);
        bodyPath([hem, knee], colors.skinLight, 1);
      }
      bodyPath(
        [
          [-10 + shift, -27],
          [knee[0] - 2, knee[1] - 2],
        ],
        colors[style.legLight],
        1,
      );
      limbBands(leg, style.legBands, 2);

      // The knee: a compact reinforced pad, a big guard or a race slider.
      if (style.knee === "pad") {
        bodyRect(knee[0] - 2, knee[1] - 2, 6, 4, colors.trousersLight);
        bodyRect(knee[0], knee[1], 4, 2, colors.panel);
      } else if (style.knee === "big") {
        bodyRect(knee[0] - 2, knee[1] - 4, 6, 6, colors.panel);
        bodyRect(knee[0], knee[1] - 2, 4, 2, colors.trousersLight);
      } else if (style.knee === "slider") {
        bodyRect(knee[0] + 2, knee[1] - 2, 4, 4, colors.panel);
      }

      // Boots stay anchored at the existing foot / peg position.
      if (style.boots === "tall" || style.boots === "welly") {
        const top = along(leg, 0.72).at;
        bodyPath([top, ankle], outline, 4);
        bodyPath([top, ankle], colors.boots, 3);
        if (style.boots === "tall") limbBands(leg, { color: "sole", at: [0.86] }, 1.5);
      }
      if (style.boots === "trainer") {
        bodyRect(-3, -7, 4, 2, colors.trousers);
        bodyRect(-5, -5, 10, 4, colors.boots);
        bodyRect(-5, -3, 10, 2, colors.sole);
      } else {
        bodyRect(-5, -7, 6, 6, colors.boots);
        bodyRect(-5, -5, 10, 4, colors.boots);
        bodyRect(-5, -3, 10, 2, colors.sole);
        if (style.boots === "boot") bodyRect(-3, -7, 4, 2, colors.trousersLight);
        if (style.boots === "heel") {
          bodyRect(-5, -1, 4, 2, colors.sole);
          bodyRect(5, -3, 2, 2, colors.boots);
        }
        if (style.boots === "snow") bodyRect(-7, -9, 10, 2, colors[style.bootRim]);
      }

      // Neck, slanting forward with the back from inside the collar, which
      // covers its foot, up under the back of the skull rather than the chin.
      // Only its front is outlined, so the back of the head runs straight
      // down into the collar.
      const neck = [
        [-3 + shift, -37],
        [-2 + shift, -40],
      ];
      bodyPath(neck.map(([x, y]) => [x + 2, y]), outline, 3);
      bodyPath(neck, colors.skin, 2);

      // Jersey leaning over the tank, clear of the arm and tank in front.
      const torsoKeys = { O: outline, J: colors.jacket, j: colors.jacketLight, d: colors.jacketShade, P: colors.panel };
      for (const [key, color] of Object.entries(style.keys)) torsoKeys[key] = colors[color];
      bodyRows(-16 + shift, style.torsoY, style.torso, torsoKeys);

      // Arm sloping down to the raised handlebar, bent at a dropped elbow.
      const sleeve = colors[style.sleeveColor];
      bodyPath(arm, outline, 3);
      bodyPath([shoulder, elbow], sleeve, 2);
      bodyPath(
        [
          [-4 + shift, -38],
          [6 + shift * 0.45, -34],
        ],
        colors[style.armLight],
        1,
      );

      // Forearm, bare or sleeved, then the cuff and glove.
      if (style.sleeve === "long") bodyPath([elbow, hand], sleeve, 2);
      else {
        if (style.sleeve === "short") bodyPath([along(arm, 0.3).at, elbow], colors.skin, 2);
        bodyPath([elbow, hand], colors.skin, 2);
        bodyPath(
          [
            [10 + shift * 0.3, -33],
            [13, -29],
          ],
          colors.skinLight,
          1,
        );
      }
      limbBands(arm, style.armBands, 1.5);
      if (style.cuff) {
        if (style.sleeve === "long") limbBands(arm, { color: style.cuff, at: [0.9] }, 1.5);
        else {
          const cuff = style.sleeve === "short" ? along(arm, 0.3).at : elbow;
          bodyRect(cuff[0] - 2, cuff[1] - 2, 4, 4, colors[style.cuff]);
        }
      }
      bodyRect(hand[0] - 2, hand[1] - 2, 6, 4, colors.gloves);
      bodyRect(hand[0], hand[1] - 2, 4, 2, colors.jacketLight);

      // The head is the same one the ragdoll shows, centred on the neck. It
      // moves with the body as one piece, by whole art pixels, so its own
      // pixels never slip against each other as the body pitches.
      const headX = RIDER_HEAD[0] + shift,
        headY = RIDER_HEAD[1];
      const headDX = Math.round((headX * pc - headY * ps - headX) / 2) * 2,
        headDY = Math.round((headX * ps + headY * pc + drop - headY) / 2) * 2;
      const head = (x, y, width, height, color) =>
        rect(x + headX + headDX, y + headY + headDY, width, height, color);
      drawRiderHead(head, parts, colors);
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    translateToDevice(mx, my);
    ctx.rotate(angle);
    ctx.scale(flipVisual, 1);
    ctx.drawImage(
      sprite.canvas,
      -BIKE_SPRITE_REACH,
      -BIKE_SPRITE_REACH,
      BIKE_SPRITE_REACH * 2,
      BIKE_SPRITE_REACH * 2,
    );
    ctx.restore();
  }

  // One tiny cached head as worn, one bare head, and one loose helmet, per
  // look. Rotating the sprite with nearest-neighbour sampling keeps it sharp.
  function ragdollHeadSprite(parts, mode) {
    const key = parts.key + "|" + mode;
    if (headSprites.has(key)) return headSprites.get(key);

    const canvas = createCanvas(32 / ART_PIXEL, 38 / ART_PIXEL);
    const context = canvas.getContext("2d");

    // Local helmet anchor is (0, 0).
    // Sprite bounds: x -16..16, y -26..12 (room for the motocross chin bar,
    // wide brims, big hair and the dunce cap's point).
    context.setTransform(
      1 / ART_PIXEL,
      0,
      0,
      1 / ART_PIXEL,
      16 / ART_PIXEL,
      26 / ART_PIXEL,
    );

    const { pixelRect: rect } = createDrawingTools(context);
    drawRiderHead(rect, parts, parts.palette, { bare: mode === "bare", loose: mode === "loose" });

    headSprites.set(key, canvas);
    return canvas;
  }

  // A head sprite turned to `angle`, mirrored to `facing`.
  function drawHeadSprite(sprite, x, y, angle, facing) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    translateToDevice(x, y);
    ctx.rotate(angle);
    ctx.scale(facing, 1);
    ctx.drawImage(sprite, -16, -26, 32, 38);
    ctx.restore();
  }

  /** Draws the thrown rider, and the helmet if it has been knocked off. */
  function drawRagdoll(ragdoll, look) {
    const p = ragdoll.points;
    const parts = lookParts(look);
    const colors = parts.palette;
    const outline = "#263b36";
    const facing = p.head.drawFacing ?? 1;

    const point = (joint) => [joint.x, joint.y];

    // A short section of a limb, useful for sleeves, cuffs and boots.
    const between = (a, b, amount) => [
      a.x + (b.x - a.x) * amount,
      a.y + (b.y - a.y) * amount,
    ];

    // The original shoulder-to-head vector is (1, -10).
    // Recover a body-oriented frame so the helmet tumbles with the rider.
    const headAngle =
      Math.atan2(p.head.y - p.shoulder.y, p.head.x - p.shoulder.x) -
      Math.atan2(-10, facing);

    const fc = Math.cos(headAngle);
    const fs = Math.sin(headAngle);

    const facingVector = [fc * facing, fs * facing];

    const style = outfitStyle(parts.shapes.outfit);
    // Bands straight across the limb from `a` to `b`, at fractions along it.
    const limbBands = (a, b, at, color, width) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / length) * width, ny = ((b.x - a.x) / length) * width;
      for (const t of at) {
        const [x, y] = between(a, b, t);
        pixelPath([[x - nx, y - ny], [x + nx, y + ny]], color, 2, 2);
      }
    };
    // Bands on a two-part limb, `at` running 0 to .5 on the first part and .5 to 1 on the second.
    const jointBands = (first, joint, last, bands, width) => {
      if (!bands) return;
      const color = colors[bands.color];
      limbBands(first, joint, bands.at.filter((t) => t < 0.5).map((t) => t * 2), color, width);
      limbBands(joint, last, bands.at.filter((t) => t >= 0.5).map((t) => t * 2 - 1), color, width);
    };

    // TROUSERS
    pixelPath([point(p.hip), point(p.knee), point(p.foot)], outline, 4, 2);
    pixelPath(
      [point(p.hip), point(p.knee), point(p.foot)],
      colors.trousers,
      3,
      2,
    );
    if (style.legs === "shorts") {
      pixelPath([between(p.hip, p.knee, 0.8), point(p.knee), between(p.knee, p.foot, 0.4)], colors.skin, 3, 2);
      pixelPath([between(p.knee, p.foot, 0.4), point(p.foot)], colors.socks, 3, 2);
    }

    const thighStart = between(p.hip, p.knee, 0.15);
    const thighEnd = between(p.hip, p.knee, 0.85);

    pixelPath(
      [
        [
          thighStart[0] + facingVector[0] * 2,
          thighStart[1] + facingVector[1] * 2,
        ],
        [thighEnd[0] + facingVector[0] * 2, thighEnd[1] + facingVector[1] * 2],
      ],
      colors[style.legLight],
      1,
      2,
    );
    jointBands(p.hip, p.knee, p.foot, style.legBands, 2);

    if (style.knee !== "none")
      pixelPath(
        [between(p.hip, p.knee, 0.88), between(p.knee, p.foot, 0.12)],
        colors.panel,
        style.knee === "big" ? 3 : 2,
        2,
      );

    // BOOT
    // Its toe follows the lower leg instead of remaining screen-aligned.
    const shinX = p.foot.x - p.knee.x;
    const shinY = p.foot.y - p.knee.y;
    const shinLength = Math.hypot(shinX, shinY) || 1;
    const downX = shinX / shinLength;
    const downY = shinY / shinLength;

    const toeX = downY * facing;
    const toeY = -downX * facing;

    const heel = [p.foot.x - toeX * 2, p.foot.y - toeY * 2];
    const toe = [p.foot.x + toeX * 6, p.foot.y + toeY * 6];

    const shaft = { tall: 0.45, welly: 0.45, trainer: 0.92 }[style.boots] ?? 0.76;
    pixelPath(
      [between(p.knee, p.foot, shaft), point(p.foot)],
      colors.boots,
      3,
      2,
    );
    if (style.bootRim)
      pixelPath([between(p.knee, p.foot, 0.7), between(p.knee, p.foot, 0.78)], colors[style.bootRim], 4, 2);
    pixelPath([heel, toe], colors.boots, 2, 2);
    pixelPath(
      [
        [heel[0] + downX * 2, heel[1] + downY * 2],
        [toe[0] + downX * 2, toe[1] + downY * 2],
      ],
      colors.sole,
      1,
      2,
    );

    // JACKET
    pixelPath([point(p.hip), point(p.shoulder)], outline, 5, 2);
    pixelPath([point(p.hip), point(p.shoulder)], colors.jacket, 4, 2);

    const backLower = between(p.hip, p.shoulder, 0.18);
    const backUpper = between(p.hip, p.shoulder, 0.82);

    pixelPath(
      [
        [
          backLower[0] - facingVector[0] * 2,
          backLower[1] - facingVector[1] * 2,
        ],
        [
          backUpper[0] - facingVector[0] * 2,
          backUpper[1] - facingVector[1] * 2,
        ],
      ],
      colors.jacketShade,
      2,
      2,
    );
    if (style.bands) limbBands(p.hip, p.shoulder, style.bands.at, colors[style.bands.color], 2.5);

    // Contrasting hem.
    pixelPath(
      [point(p.hip), between(p.hip, p.shoulder, 0.18)],
      colors[style.hem],
      3,
      2,
    );

    // Shoulder highlight.
    pixelPath(
      [between(p.hip, p.shoulder, 0.82), point(p.shoulder)],
      colors.jacketLight,
      3,
      2,
    );

    // NECK, outlined like the limbs, from inside the collar up to the head.
    const neck = [between(p.shoulder, p.head, 0.3), point(p.head)];
    pixelPath(neck, outline, 4, 2);
    pixelPath(neck, colors.skin, 2, 2);

    // ARM
    pixelPath(
      [point(p.shoulder), point(p.elbow), point(p.hand)],
      outline,
      3,
      2,
    );

    const sleeve = colors[style.sleeveColor];
    pixelPath([point(p.shoulder), point(p.elbow)], sleeve, 2, 2);
    pixelPath(
      [between(p.shoulder, p.elbow, 0.12), between(p.shoulder, p.elbow, 0.72)],
      colors[style.armLight],
      1,
      2,
    );

    if (style.sleeve === "long") pixelPath([point(p.elbow), point(p.hand)], sleeve, 2, 2);
    else {
      if (style.sleeve === "short") pixelPath([between(p.shoulder, p.elbow, 0.6), point(p.elbow)], colors.skin, 2, 2);
      pixelPath([point(p.elbow), point(p.hand)], colors.skin, 2, 2);
      pixelPath(
        [between(p.elbow, p.hand, 0.2), between(p.elbow, p.hand, 0.65)],
        colors.skinLight,
        1,
        2,
      );
    }
    jointBands(p.shoulder, p.elbow, p.hand, style.armBands, 1.5);

    // Cuff.
    if (style.cuff) {
      const cuff = style.sleeve === "long" ? [between(p.elbow, p.hand, 0.7), between(p.elbow, p.hand, 0.8)]
        : style.sleeve === "short" ? [between(p.shoulder, p.elbow, 0.5), between(p.shoulder, p.elbow, 0.6)]
          : [between(p.shoulder, p.elbow, 0.85), point(p.elbow)];
      pixelPath(cuff, colors[style.cuff], 2, 2);
    }

    // Glove and small highlight.
    pixelPath(
      [between(p.elbow, p.hand, 0.8), point(p.hand)],
      colors.gloves,
      2,
      2,
    );
    pixelRect(p.hand.x - 1, p.hand.y - 1, 2, 2, colors.jacketLight, 2);

    // HEAD
    // Cached and mirrored correctly; follows the head/shoulder axis. Bare
    // without a helmet, or once it has been knocked off, which then tumbles
    // on its own.
    const { helmet } = ragdoll;
    drawHeadSprite(
      ragdollHeadSprite(parts, helmet || !parts.helmet ? "bare" : "worn"),
      p.head.x,
      p.head.y,
      headAngle,
      facing,
    );
    if (helmet)
      drawHeadSprite(
        ragdollHeadSprite(parts, "loose"),
        helmet.x,
        helmet.y,
        helmet.spin,
        helmet.facing,
      );
  }

  /** Paints a graffiti prop onto the rock, clipped to it. Draw after the terrain. */
  function drawWallPaint(trail, prop) {
    const sprite = graffitiSprite(trail, prop);
    if (!sprite) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite.canvas, sprite.left, sprite.top, sprite.width, sprite.height);
  }

  /**
   * Prop lights, drawn over the time-of-day grade so they stay bright: a street
   * lamp and the pool it throws on the ground, a crane's warning lights, a
   * lantern and the cave wall around it, and glowing mushrooms. Lamps and cranes
   * only light up after dark; lanterns and mushrooms always glow, more brightly
   * once `dark`. `time` is in seconds; 0 keeps the lights steady. `trail`,
   * `prop` and `fit` (from propWallFit) are needed for a lantern. With
   * `emissive`, only the glowing parts are drawn (glass, spots, spores and
   * bulbs), for when the lighting pass casts the light itself.
   */
  function drawPropGlow(
    type,
    x,
    y,
    groundOffset = () => 0,
    flip = false,
    time = 0,
    { dark = true, trail = null, prop = null, fit = null, emissive = false, rotation = 0, lit = false, rider = null } = {},
  ) {
    const dir = flip ? -1 : 1;
    const strength = dark ? 1 : 0.5;
    if (type === "lantern") {
      const centreY = y + (fit?.body || 0) + LANTERN_CENTRE;
      const flicker = lanternFlicker(x, time);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = "screen";
      if (trail && prop && !emissive) {
        const light = lanternLightSprite(trail, prop, x, centreY);
        ctx.globalAlpha = strength * flicker;
        ctx.drawImage(light.canvas, light.left, light.top, light.size, light.size);
      }
      ctx.translate(Math.round(x / 2) * 2, Math.round(centreY / 2) * 2);
      if (!emissive) {
        ctx.globalAlpha = 0.22 * strength * flicker;
        drawPixelDisc(0, 0, 16, LANTERN_LIGHT.flame, 2);
        ctx.globalAlpha = 0.3 * strength * flicker;
        drawPixelDisc(0, 0, 10, LANTERN_LIGHT.glass, 2);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.translate(0, -LANTERN_CENTRE);
      drawLanternGlass({ pixelRect }, flicker < 0.95 ? 0 : 1);
      ctx.restore();
      return;
    }
    if (type === "torch" || type === "fireplace") {
      // Firelight on the rock round it, flickering like a lantern's, and the
      // flames themselves, always burning.
      const flicker = lanternFlicker(x, time);
      const angle = rotation && canRotate(type) ? rotation : 0;
      const rise = type === "torch" ? TORCH_FLAME.y - 6 : FIRE.y - 10;
      const flame = { x: x - Math.sin(angle) * rise, y: y + Math.cos(angle) * rise };
      const big = type === "fireplace" ? 1.3 : 1;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (!emissive) {
        ctx.globalCompositeOperation = "screen";
        if (trail && prop) {
          const light = lanternLightSprite(trail, prop, flame.x, flame.y);
          ctx.globalAlpha = strength * flicker;
          ctx.drawImage(light.canvas, light.left, light.top, light.size, light.size);
        }
        ctx.globalAlpha = 0.22 * strength * flicker;
        drawPixelDisc(flame.x, flame.y, 18 * big, FLAME.glow, 2);
        ctx.globalAlpha = 0.28 * strength * flicker;
        drawPixelDisc(flame.x, flame.y, 10 * big, FLAME.light, 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      ctx.translate(Math.round(x / 2) * 2, Math.round(y / 2) * 2);
      if (angle) ctx.rotate(angle);
      const phase = propNoise(x, 32);
      if (type === "torch") {
        ctx.translate(TORCH_FLAME.x, TORCH_FLAME.y);
        drawFire({ pixelRect }, fireFrame(TORCH_TONGUES, time, phase), time, phase, { sparks: 2, rise: 22 });
      } else {
        // Out in the open, the wind bends the flames and carries the sparks.
        const weather = resolveWeather(trail?.weather);
        ctx.translate(0, FIRE.y);
        drawFire({ pixelRect }, fireFrame(FIRE_TONGUES, time, phase), time, phase, {
          sparks: 3, rise: 36, wind: weather.wind, downwind: windSign(weather),
        });
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(Math.round(x / 2) * 2, Math.round(y / 2) * 2);
    if (rotation && canRotate(type)) ctx.rotate(rotation);
    if (type === "mushrooms") {
      ctx.scale(dir, 1);
      const caps = mushroomCaps((local) => groundOffset(local * dir));
      const pulse = mushroomPulse(x, time);
      ctx.globalCompositeOperation = "screen";
      if (!emissive) for (const cap of caps) {
        ctx.globalAlpha = 0.22 * strength * pulse;
        drawPixelDisc(cap.cx, cap.bottom - 4, cap.cap + 6, WATER.light, 2);
        ctx.globalAlpha = 0.18 * strength * pulse;
        drawPixelDisc(cap.cx, cap.bottom - 4, cap.cap + 2, WATER.bright, 2);
      }
      // Spores drifting up off the caps, one art pixel at a time.
      if (time) {
        caps.forEach((cap, index) => {
          const rise = (time * 6 + index * 11 + propNoise(x, index) * 30) % 30;
          const sx = cap.cx + Math.round(Math.sin(time + index * 2) * 1.5) * 2;
          ctx.globalAlpha = strength * (1 - rise / 30);
          pixelRect(sx, cap.bottom - 8 - Math.round(rise / 2) * 2, 2, 2, WATER.bright, 2);
        });
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      drawMushroomSpots({ pixelRect }, (local) => groundOffset(local * dir));
    } else if (type === "camera-tower") {
      // The tally light, blinking while the camera rolls.
      if (cameraTallyOn(time)) {
        const cx = dir * CAMERA_TALLY.x;
        if (!emissive) {
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.3 * strength;
          drawPixelDisc(cx, CAMERA_TALLY.y, 6, "#e8755b", 2);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        pixelRect(cx - 2, CAMERA_TALLY.y - 1, 4, 2, "#ffc295", 2);
      }
    } else if (type === "halfway-flag") {
      // The beacon, once the rider has passed.
      if (lit) {
        const { x: bx, y: by } = HALFWAY_BEACON;
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.3 * strength;
        drawPixelDisc(bx, by - 1, 12, HALFWAY_LIGHT.glow, 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        pixelRect(bx - 4, by - 4, 8, 6, HALFWAY_LIGHT.glow, 2);
        pixelRect(bx - 2, by - 2, 4, 2, HALFWAY_LIGHT.core, 2);
      }
    } else if (!dark) {
      // Lamps, crane lights, hut windows and searchlights stay off by day.
    } else if (type === "watchtower") {
      // The searchlight's beam, and the spot it throws where it meets the
      // ground. It moves, so it is drawn here rather than baked into the
      // lighting.
      ctx.scale(dir, 1);
      const local = (lx) => groundOffset(lx * dir);
      const angle = searchlightAimAt(time, x, y, rider?.x, rider?.y, flip);
      const { cells, hit } = searchlightBeam(angle, local);
      ctx.globalCompositeOperation = "screen";
      for (const cell of cells) {
        ctx.globalAlpha = cell.alpha;
        pixelRect(cell.x, cell.y, 4, 4, SEARCHLIGHT_LIGHT.beam, 2);
      }
      if (hit) {
        const half = Math.round(hit.width / 2) * 2;
        for (let dx = -half; dx < half; dx += 2) {
          const reach = Math.abs(dx + 1) / half;
          ctx.globalAlpha = reach < 0.5 ? 0.4 : 0.22;
          const gy = Math.round(local(hit.x + dx) / 2) * 2;
          pixelRect(hit.x + dx, gy - 6, 2, 8, SEARCHLIGHT_LIGHT.beam, 2);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      drawSearchlight({ pixelRect, pixelPath, drawPixelDisc }, angle, true);
    } else if (type === "tent") {
      // The lantern inside lights up the doorway, and spills out onto the
      // ground in front of it.
      const flicker = lanternFlicker(x, time);
      const [cx, cy] = TENT_DOOR_CENTRE;
      ctx.scale(dir, 1);
      if (!emissive) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.2 * flicker;
        drawPixelDisc(cx, cy, 24, HUT_LIGHT.flame, 2);
        ctx.globalAlpha = 0.3 * flicker;
        drawPixelDisc(cx, cy, 12, HUT_LIGHT.glass, 2);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      drawTentDoorGlow({ pixelRect }, flicker);
    } else if (type === "hut") {
      // Firelight in the window, flickering like a lantern, and the light it
      // throws on the snow below.
      const flicker = lanternFlicker(x, time);
      const { left, top, width, height } = HUT_WINDOW;
      const cx = left + width / 2,
        cy = top + height / 2;
      ctx.scale(dir, 1);
      if (!emissive) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.2 * flicker;
        drawPixelDisc(cx, cy, 22, HUT_LIGHT.flame, 2);
        ctx.globalAlpha = 0.3 * flicker;
        drawPixelDisc(cx, cy, 13, HUT_LIGHT.glass, 2);
        for (let dx = -18; dx < 18; dx += 2) {
          const reach = Math.abs(dx + 1);
          ctx.globalAlpha = (reach < 8 ? 0.3 : reach < 14 ? 0.18 : 0.1) * flicker;
          // Ground lookups take world-facing positions.
          const ground = Math.round(groundOffset((cx + dx) * dir) / 2) * 2;
          pixelRect(cx + dx, ground - 4, 2, 6, HUT_LIGHT.glass, 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      drawHutWindowGlass({ pixelRect }, flicker);
    } else if (type === "farmhouse") {
      // Lamplight in most of the windows, each lamp flickering on its own.
      ctx.scale(dir, 1);
      for (const [index, lit] of farmhouseLitWindows(x).entries()) {
        if (!lit) continue;
        const flicker = lanternFlicker(x + index * 37, time);
        const [cx, cy] = farmhouseWindowCentre(index);
        if (!emissive) {
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.18 * flicker;
          drawPixelDisc(cx, cy, 20, HUT_LIGHT.flame, 2);
          ctx.globalAlpha = 0.28 * flicker;
          drawPixelDisc(cx, cy, 12, HUT_LIGHT.glass, 2);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = 1;
        drawFarmhouseWindowGlass({ pixelRect }, index, flicker);
      }
    } else if (type === "lamp") {
      // Glass centre and the ground below it, relative to the anchor.
      const headX = dir * LAMP_HEAD.x;
      const ground = Math.min(
        Math.round(groundOffset(headX) / 2) * 2,
        LAMP_HEAD.y + 200,
      );
      if (!emissive) {
        ctx.globalCompositeOperation = "screen";
        // Beam: stepped bands widening down to the ground.
        const span = ground - LAMP_HEAD.y;
        for (let py = LAMP_HEAD.y; py < ground; py += 4) {
          const t = (py - LAMP_HEAD.y) / span;
          const outer = Math.round((6 + t * 26) / 2) * 2;
          const inner = Math.round(outer * 0.5 / 2) * 2;
          ctx.globalAlpha = 0.07;
          pixelRect(headX - outer, py, outer * 2, 4, LAMP_LIGHT.beam, 2);
          ctx.globalAlpha = 0.06;
          pixelRect(headX - inner, py, inner * 2, 4, LAMP_LIGHT.beam, 2);
        }
        // Pool on the ground, brightest under the lamp, following the slope.
        for (let dx = -40; dx < 40; dx += 2) {
          const reach = Math.abs(dx + 1);
          const height = reach < 14 ? 8 : reach < 26 ? 6 : 4;
          ctx.globalAlpha = reach < 14 ? 0.34 : reach < 26 ? 0.22 : 0.12;
          const gy = Math.round(groundOffset(headX + dx) / 2) * 2;
          pixelRect(headX + dx, gy - height, 2, height + 4, LAMP_LIGHT.beam, 2);
        }
        // Halo, then the glass itself at full brightness.
        ctx.globalAlpha = 0.28;
        drawPixelDisc(headX, LAMP_HEAD.y - 2, 14, LAMP_LIGHT.beam, 2);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      ctx.scale(dir, 1);
      drawLampGlass({ pixelRect });
    } else if (type === "wind-turbine") {
      // The red warning light on the nacelle. A wind farm's lights blink
      // together, so every turbine blinks in step.
      if (craneLightOn(0, time)) {
        const cx = dir * TURBINE.light.x,
          ly = TURBINE.light.y;
        if (!emissive) {
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.35;
          drawPixelDisc(cx, ly, 6, "#e8755b", 2);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        pixelRect(cx - 2, ly - 2, 4, 4, "#e8755b", 2);
        pixelRect(cx, ly - 2, 2, 2, "#ffc295", 2);
      }
    } else if (type === "crane") {
      CRANE_LIGHTS.forEach(([lx, ly], index) => {
        // Blink slowly, out of step with each other.
        if (!craneLightOn(index, time)) return;
        const cx = dir * lx;
        if (!emissive) {
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.35;
          drawPixelDisc(cx, ly, 6, "#e8755b", 2);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        pixelRect(cx - 2, ly - 2, 4, 4, "#e8755b", 2);
        pixelRect(cx, ly - 2, 2, 2, "#ffc295", 2);
      });
    }
    ctx.restore();
  }

  return {
    drawApple,
    drawFlag,
    drawBike,
    drawRagdoll,
    drawProp,
    drawWallPaint,
    drawPropGlow,
    drawSpike,
    drawWater,
    drawBackground,
    drawTimeTint,
    drawPixelText,
  };
}
