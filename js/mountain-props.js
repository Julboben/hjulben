// @ts-check
// Mountain and snow props. Like every prop they sit on the 2-unit art grid,
// have no outlines, and are lit from the right: shaded on the left and
// underneath. Floor props stand on y = 0; icicles hang down from y = 0, which
// drawing.js moves onto the overhang or cave roof it found above the anchor.
//
// Static parts are drawn once into sprites by drawing.js; the parts that move
// or follow the ground are drawn live from the functions exported here. Props
// whose base must follow the slope (the pylon, the hut) are split like the
// trees: a cached body that stops at a *_BODY_BOTTOM line, and a live base
// that drawing.js draws down to the ground. The motion is decoration only and
// never touches the simulation, and with reduced motion (time 0) everything
// stands still.
import { STEEL } from "./city-props.js";
import { PINE_TIERS } from "./forest-props.js";

// The snow terrain's own colours, so drifts blend into it, with the warm
// highlight the other props use where the sun hits.
export const SNOW = { light: "#fffdf4", base: "#eef3ed", shade: "#cbd5d6", deep: "#aebbc0" };
// Ice, from the crystal colours.
export const ICE = { dark: "#568f98", base: "#83d1ce", light: "#d9ffff", glint: "#fffdf4" };
const STONE = { dark: "#697872", base: "#7f8d83", mid: "#8b978c", light: "#a2ab9e", tip: "#aeb5a7" };
const WOOD = {
  dark: "#4d3f2f",
  base: "#66543f",
  plank: "#806244",
  light: "#856d4f",
  tip: "#aa8a60",
  cut: "#c39664",
};
const IRON = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const PAINT = { red: "#d63b2c", redDark: "#a8322a", redLight: "#e8755b", yellow: "#f1b95d", yellowDark: "#d9953a" };
const GLASS = { dark: "#3f6f78", base: "#568f98" };
const COAL = "#3a403d";
const CARROT = { base: "#f08a3a", shade: "#d9953a" };
export const SMOKE = { light: "#d9dccb", shade: "#b9c4af" };
// The hut's firelit window, from the lantern colours.
export const HUT_LIGHT = { glass: "#ffe39a", core: "#fff3be", flame: "#f1b95d" };

const snap = (value) => Math.round(value / 2) * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Fills `x`…`x + width` from `top` down to the ground under each column. */
function downTo(pixelRect, x, top, width, color, groundOffset) {
  for (let column = 0; column < width; column += 2) {
    const bottom = snap(groundOffset(x + column + 1));
    if (bottom > top) pixelRect(x + column, top, 2, bottom - top, color, 2);
  }
}

/** A low drift of snow heaped against something, seated on the ground. */
function drift(pixelRect, left, width, height, groundOffset) {
  for (let column = 0; column < width; column += 2) {
    const t = (column + 1) / width;
    // Rounded mound, a little steeper on the right.
    const h = snap(height * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)));
    if (h <= 0) continue;
    const ground = snap(groundOffset(left + column + 1));
    pixelRect(left + column, ground - h, 2, h + 2, t < 0.3 ? SNOW.shade : SNOW.base, 2);
    pixelRect(left + column, ground - h, 2, 2, t > 0.45 ? SNOW.light : SNOW.base, 2);
  }
}

// ---------------------------------------------------------------------------
// Trail cairn
// ---------------------------------------------------------------------------

// Stones from the bottom up: [left, top, width, height]. The stack leans and
// steps a little, so it reads as piled by hand rather than built.
const CAIRN_STONES = [
  [-14, -10, 28, 10],
  [-10, -18, 22, 8],
  [-12, -26, 18, 8],
  [-6, -32, 14, 6],
  [-4, -38, 8, 6],
];

/**
 * 28 × 42: a cairn of five stones with a red-white-red trail blaze painted on
 * the second, capped with snow. Down to y = 0; see drawCairnFoot.
 */
export function drawCairn({ pixelRect }) {
  CAIRN_STONES.forEach(([left, top, width, height], index) => {
    const right = left + width;
    const bottom = top + height;
    // Body with clipped corners.
    pixelRect(left + 2, top, width - 4, height, STONE.base, 2);
    pixelRect(left, top + 2, width, height - 4, STONE.base, 2);
    // Shaded left and underside, lit top and right.
    pixelRect(left, top + 2, 2, height - 4, STONE.dark, 2);
    if (index) pixelRect(left + 2, bottom - 2, width - 4, 2, STONE.dark, 2);
    pixelRect(left + 4, top, width - 6, 2, STONE.light, 2);
    pixelRect(right - 6, top, 4, 2, STONE.tip, 2);
    pixelRect(right - 2, top + 2, 2, height - 4, STONE.mid, 2);
  });
  // A crack in the foot stone.
  pixelRect(-4, -8, 2, 2, STONE.dark, 2);
  pixelRect(-2, -6, 2, 2, STONE.dark, 2);
  // Trail blaze: the route marker.
  pixelRect(0, -16, 8, 2, PAINT.red, 2);
  pixelRect(0, -14, 8, 2, SNOW.light, 2);
  pixelRect(0, -12, 8, 2, PAINT.red, 2);
  pixelRect(0, -16, 2, 6, PAINT.redDark, 2);
  // Snow on every ledge left uncovered by the stone above, and a cap on top.
  CAIRN_STONES.forEach(([left, top, width], index) => {
    const above = CAIRN_STONES[index + 1];
    const ledges = above
      ? [
          [left + 2, above[0]],
          [above[0] + above[2], left + width - 2],
        ]
      : [[left, left + width]];
    for (const [from, to] of ledges) {
      if (to - from < 2) continue;
      pixelRect(from, top - 2, to - from, 2, SNOW.base, 2);
      pixelRect(from, top - 2, 2, 2, SNOW.shade, 2);
      if (to - from >= 6) pixelRect(to - 4, top - 2, 2, 2, SNOW.light, 2);
    }
  });
  // The cap is heaped.
  pixelRect(-2, -42, 6, 2, SNOW.base, 2);
  pixelRect(2, -42, 2, 2, SNOW.light, 2);
}

/** The foot stone is bedded in: its body runs down to the ground. */
export function drawCairnFoot({ pixelRect }, groundOffset) {
  const [left, top, width, height] = CAIRN_STONES[0];
  const bottom = top + height - 2;
  downTo(pixelRect, left, bottom, 2, STONE.dark, groundOffset);
  downTo(pixelRect, left + 2, bottom, width - 4, STONE.base, groundOffset);
  downTo(pixelRect, left + width - 2, bottom, 2, STONE.mid, groundOffset);
}

// ---------------------------------------------------------------------------
// Ski-lift pylon
// ---------------------------------------------------------------------------

// The tower stands about 8 m tall: its upper column, head and rope are drawn
// PYLON_LIFT above the numbers they were first written with.
const PYLON_LIFT = 52;
export const PYLON_TOP = -178 - PYLON_LIFT;
export const PYLON_BODY_BOTTOM = -10;
// Top of the haul rope where it rides over the sheaves.
export const CABLE_Y = -168 - PYLON_LIFT;
// How far the rope runs either side of the tower before it fades out.
export const CABLE_HALF = 160;
// The rope climbs this many units per unit to the right (left when flipped),
// so the pylon can stand on a slope with the line running up the hill.
export const CABLE_SLOPE = 0.4;
const CABLE_FADE = 28;
const SHEAVES = [-18, -6, 6, 18];
const SHEAVE_HALF = 24;
// Units per second; one chair crosses the whole span in about 16 s.
export const CHAIR_SPEED = 16;
// How far below the rope the chair's art reaches.
export const CHAIR_DROP = 58;

/**
 * The rope's drop below CABLE_Y at local x: flat over the sheaves, then
 * climbing to the right and falling to the left, sagging a little either way.
 */
export function cableSag(x) {
  const out = Math.max(0, Math.abs(x) - SHEAVE_HALF);
  return snap(-Math.sign(x) * out * CABLE_SLOPE + out * out * 0.0004);
}
// The highest the rope gets, at its uphill end, from the anchor.
export const CABLE_TOP = CABLE_Y + cableSag(CABLE_HALF);

const pylonHalf = (py) => (py < -60 ? 4 : 6);

// The tower number, drawn live by drawing.js so it never reads mirrored: its
// centre on a plain pylon, and the colour.
export const PYLON_NUMBER = { text: "7", x: 1, y: -122 - PYLON_LIFT, color: WOOD.dark };

/** The tower above the footing: a steel column with pegs, a number plate and the sheave head. */
export function drawPylon({ pixelRect }) {
  // Tubular column, wider at the foot.
  for (let py = -152 - PYLON_LIFT; py < PYLON_BODY_BOTTOM; py += 2) {
    const half = pylonHalf(py);
    pixelRect(-half, py, half * 2, 2, STEEL.base, 2);
    pixelRect(-half, py, 2, 2, STEEL.dark, 2);
    pixelRect(half - 4, py, 2, 2, STEEL.mid, 2);
    pixelRect(half - 2, py, 2, 2, STEEL.light, 2);
  }
  // Flange where the column widens.
  pixelRect(-8, -62, 16, 4, STEEL.mid, 2);
  pixelRect(-8, -62, 2, 4, STEEL.dark, 2);
  pixelRect(4, -62, 4, 2, STEEL.light, 2);
  // Climbing pegs up the lit side.
  for (let py = -144 - PYLON_LIFT; py < -20; py += 10) pixelRect(pylonHalf(py), py, 4, 2, STEEL.light, 2);
  // Tower number plate; the number itself is PYLON_NUMBER.
  pixelRect(-6, -124 - PYLON_LIFT, 12, 16, PAINT.yellowDark, 2);
  pixelRect(-4, -122 - PYLON_LIFT, 10, 12, PAINT.yellow, 2);
  // Crossarm, seen end on.
  pixelRect(-8, -160 - PYLON_LIFT, 16, 8, STEEL.base, 2);
  pixelRect(-8, -160 - PYLON_LIFT, 2, 8, STEEL.dark, 2);
  pixelRect(4, -160 - PYLON_LIFT, 4, 2, STEEL.light, 2);
  pixelRect(6, -158 - PYLON_LIFT, 2, 6, STEEL.mid, 2);
  // Lightning rod.
  pixelRect(-2, PYLON_TOP, 2, 18, IRON.base, 2);
  pixelRect(-2, PYLON_TOP, 2, 2, STEEL.light, 2);
  // Sheave train: a beam along the rope with four wheels on it.
  pixelRect(-SHEAVE_HALF, -164 - PYLON_LIFT, SHEAVE_HALF * 2, 4, IRON.base, 2);
  pixelRect(-SHEAVE_HALF, -164 - PYLON_LIFT, SHEAVE_HALF * 2, 2, IRON.light, 2);
  pixelRect(-SHEAVE_HALF, -164 - PYLON_LIFT, 2, 4, IRON.dark, 2);
  for (const c of SHEAVES) {
    pixelRect(c - 2, CABLE_Y + 2, 6, 2, IRON.dark, 2);
    pixelRect(c - 4, CABLE_Y + 4, 10, 2, IRON.dark, 2);
    pixelRect(c - 2, CABLE_Y + 6, 6, 2, IRON.dark, 2);
    pixelRect(c, CABLE_Y + 4, 2, 2, STEEL.light, 2);
  }
  // Snow on the crossarm and on the beam ends.
  pixelRect(-8, -162 - PYLON_LIFT, 6, 2, SNOW.shade, 2);
  pixelRect(-SHEAVE_HALF, -166 - PYLON_LIFT, 4, 2, SNOW.base, 2);
  pixelRect(SHEAVE_HALF - 4, -166 - PYLON_LIFT, 4, 2, SNOW.light, 2);
}

/** The concrete footing under the column, down to the ground. */
export function drawPylonFooting({ pixelRect }, groundOffset) {
  downTo(pixelRect, -12, PYLON_BODY_BOTTOM, 4, STONE.dark, groundOffset);
  downTo(pixelRect, -8, PYLON_BODY_BOTTOM, 16, STONE.mid, groundOffset);
  downTo(pixelRect, 8, PYLON_BODY_BOTTOM, 4, STONE.light, groundOffset);
  pixelRect(-12, PYLON_BODY_BOTTOM, 24, 2, STONE.tip, 2);
  pixelRect(-12, PYLON_BODY_BOTTOM - 2, 10, 2, SNOW.shade, 2);
  pixelRect(-2, PYLON_BODY_BOTTOM - 2, 14, 2, SNOW.base, 2);
  drift(pixelRect, -24, 12, 6, groundOffset);
  drift(pixelRect, 12, 14, 8, groundOffset);
}

/** The haul rope, fading out at both ends so it reads as running on to the next tower. */
export function drawCable({ pixelRect }) {
  for (let x = -CABLE_HALF; x < CABLE_HALF; x += 2) {
    const fade = (CABLE_HALF - Math.abs(x + 1)) / CABLE_FADE;
    // Ordered dither: fewer pixels toward the ends.
    if (fade < 1 && ((x / 2) & 3) / 4 >= fade) continue;
    pixelRect(x, CABLE_Y + cableSag(x + 1), 2, 2, IRON.dark, 2);
  }
}

/**
 * Where the chair is at `time` (seconds), from the tower: `x` along the
 * rope, `y` its grip, `alpha` as it fades in and out at the ends, and its
 * `swing` (whole art pixels at the seat): it swings further and is pushed
 * `downwind` (-1 left, 1 right) the stronger the `wind` (0…1). `phase` is a
 * fixed 0…1 per prop. Standing still (time 0) it waits a little way up the
 * line.
 */
export function liftChair(time, phase, wind = 0.25, downwind = -1) {
  // A gap off the ends, so the chair does not pop straight back in.
  const span = CABLE_HALF * 2 + 48;
  const x = time
    ? snap(((time * CHAIR_SPEED + phase * span) % span) - CABLE_HALF - 24)
    : snap(CABLE_HALF * 0.45);
  const alpha = clamp((CABLE_HALF - Math.abs(x)) / CABLE_FADE, 0, 1);
  // Swinging gently, and kicked back a little as it rides over the sheaves.
  let swing = time ? Math.round(Math.sin(time * (1 + wind * 1.2) + phase * 6) * (0.5 + wind * 1.2) + downwind * wind * 1.2) : 0;
  if (time && Math.abs(x) < SHEAVE_HALF + 4) swing = -1;
  // The grip lifts over the sheave wheels.
  const y = CABLE_Y + cableSag(x) + (Math.abs(x) < SHEAVE_HALF ? -2 : 0);
  return { x, y, alpha, swing };
}

/**
 * A two-seat chair travelling right, its grip on the rope at (0, 0): a red
 * seat with the back on the trailing side, and the safety bar lowered.
 */
export function drawChair({ pixelRect, pixelPath }, swing = 0) {
  const s = swing * 2;
  // Grip.
  pixelRect(-4, -2, 8, 4, IRON.base, 2);
  pixelRect(-4, -2, 2, 4, IRON.dark, 2);
  pixelRect(2, -2, 2, 2, STEEL.light, 2);
  // Hanger: down from the grip, then back to the top of the backrest.
  pixelPath([[0, 2], [s / 2, 22], [s - 8, 30]], STEEL.base, 1, 2);
  pixelPath([[2, 4], [s / 2 + 2, 20]], STEEL.light, 1, 2);
  // Backrest on the trailing side.
  pixelRect(s - 12, 30, 6, 16, PAINT.red, 2);
  pixelRect(s - 12, 30, 2, 16, PAINT.redDark, 2);
  pixelRect(s - 8, 30, 2, 2, PAINT.redLight, 2);
  // Seat.
  pixelRect(s - 12, 44, 26, 4, PAINT.red, 2);
  pixelRect(s - 6, 44, 20, 2, PAINT.redLight, 2);
  pixelRect(s - 12, 46, 2, 2, PAINT.redDark, 2);
  // Frame under the seat.
  pixelRect(s - 12, 48, 26, 2, STEEL.dark, 2);
  // Safety bar, lowered: out from the hanger, down past the seat to the footrest.
  pixelPath([[s / 2, 22], [s + 14, 32], [s + 14, 54], [s + 20, 54]], STEEL.mid, 1, 2);
  pixelRect(s + 14, 32, 2, 2, STEEL.light, 2);
  // Snow on the seat.
  pixelRect(s - 2, 42, 10, 2, SNOW.base, 2);
  pixelRect(s + 4, 42, 4, 2, SNOW.light, 2);
}

// ---------------------------------------------------------------------------
// Icicles
// ---------------------------------------------------------------------------

// [centre, typical length, half width in art pixels].
const ICICLES = [
  [-16, 12, 2],
  [-10, 26, 3],
  [-4, 16, 2],
  [4, 34, 3],
  [10, 18, 2],
  [16, 10, 2],
];
// The longest an icicle grows, and how far below the roof its art can reach.
const ICICLE_LONGEST = 40;
export const ICICLE_REACH = ICICLE_LONGEST + 4;

/** The icicles' lengths, from their fixed noise, at most `room` (and ICICLE_LONGEST). */
export function icicleLengths(room, noise) {
  const most = Math.min(ICICLE_LONGEST, room);
  return ICICLES.map(([, base], index) => snap(Math.max(6, Math.min(most, base * (0.75 + noise(index) * 0.5)))));
}

/**
 * Icicles hanging from y = 0 under an overhang or cave roof, at most `room`
 * long. Now and then one catches the light. `time` in seconds; 0 holds them
 * still. Returns the tip of the longest, where drawing.js lets meltwater drip.
 */
export function drawIcicles({ pixelRect }, room, noise, time = 0) {
  // Ice crust along the rock.
  pixelRect(-20, 0, 40, 2, ICE.base, 2);
  pixelRect(-18, 2, 36, 2, ICE.light, 2);
  pixelRect(-20, 0, 2, 2, ICE.dark, 2);
  pixelRect(14, 2, 4, 2, ICE.glint, 2);
  const lengths = icicleLengths(room, noise);
  let longest = 0;
  ICICLES.forEach(([cx, , half], index) => {
    const length = lengths[index];
    if (length > lengths[longest]) longest = index;
    for (let py = 4; py < length + 4; py += 2) {
      const t = (py - 4) / length;
      // Tapering to a point, knobbly near the root.
      const knob = t < 0.5 && (py / 2 + index) % 5 === 0 ? 1 : 0;
      const width = Math.max(2, (Math.round(half * (1 - t)) + knob) * 2);
      const left = cx - Math.floor(width / 4) * 2;
      if (width < 4) {
        pixelRect(left, py, 2, 2, t > 0.85 ? ICE.base : ICE.light, 2);
        continue;
      }
      pixelRect(left, py, width, 2, ICE.light, 2);
      pixelRect(left, py, 2, 2, ICE.base, 2);
      pixelRect(left + width - 2, py, 2, 2, ICE.glint, 2);
    }
  });
  if (time) {
    // A glint slides down one icicle every couple of seconds.
    const beat = time / 2.3 + noise(7) * 5;
    const which = Math.floor(beat) % ICICLES.length;
    const along = beat % 1;
    if (along < 0.35) {
      const gy = 4 + snap(lengths[which] * (along / 0.35) * 0.7);
      pixelRect(ICICLES[which][0], gy, 2, 2, ICE.glint, 2);
    }
  }
  return { x: ICICLES[longest][0], y: lengths[longest] + 4 };
}

// ---------------------------------------------------------------------------
// Snow-covered pine
// ---------------------------------------------------------------------------

// The half width of a tier's row, exactly as drawPineTiers flares it.
const tierHalf = (row, rows, halfWidth) =>
  Math.max(2, Math.round((2 + (halfWidth - 2) * Math.pow(row / (rows - 1), 1.15)) / 2) * 2);

/**
 * Snow lying on one tier of boughs, drawn right after the tier so the tier
 * above covers it: a crust along the upper edges, heavy pads on the bough
 * tips and a band draped along the skirt.
 */
export function drawPineSnow({ pixelRect }, { top, bottom, halfWidth }) {
  const rows = (bottom - top) / 2;
  const cell = (px, py, side, lit) =>
    pixelRect(px, py, 2, 2, side < 0 ? SNOW.shade : lit ? SNOW.light : SNOW.base, 2);
  let previous = 0;
  for (let row = 0; row < rows - 3; row++) {
    const half = tierHalf(row, rows, halfWidth);
    const py = top + row * 2;
    // Crust on the edge, two art pixels deep, more where the edge steps out.
    const depth = Math.max(4, half - previous + 2);
    for (let d = 0; d < depth && d < half; d += 2) {
      cell(-half + d, py, -1, false);
      cell(half - 2 - d, py, 1, d === 0 || row === 0);
    }
    previous = half;
  }
  // A band of snow along the skirt, scalloped between the bough tips.
  const bandRow = rows - 5;
  const half = tierHalf(bandRow, rows, halfWidth);
  for (let px = -half; px < half; px += 2) {
    const across = (px + 1 + half) / (half * 2);
    const scallop = Math.abs(Math.sin(across * Math.PI * Math.max(2, Math.round(halfWidth / 10))));
    if (scallop < 0.35) continue;
    const py = top + bandRow * 2;
    cell(px, py, across < 0.3 ? -1 : 1, across > 0.6 && scallop > 0.8);
    if (scallop > 0.7) cell(px, py - 2, across < 0.3 ? -1 : 1, across > 0.55);
  }
  // Heavy pads hanging on the bough tips.
  const tip = top + (rows - 4) * 2;
  const tipHalf = tierHalf(rows - 4, rows, halfWidth);
  pixelRect(-tipHalf - 2, tip, 6, 4, SNOW.shade, 2);
  pixelRect(tipHalf - 4, tip, 6, 4, SNOW.base, 2);
  pixelRect(tipHalf - 2, tip, 4, 2, SNOW.light, 2);
}

/** A snowcap on the leader. */
export function drawPineSnowCap({ pixelRect }) {
  pixelRect(-2, -186, 4, 2, SNOW.base, 2);
  pixelRect(0, -186, 2, 2, SNOW.light, 2);
  pixelRect(-4, -184, 8, 2, SNOW.base, 2);
  pixelRect(-4, -184, 2, 2, SNOW.shade, 2);
}

/** The drift around the pine's trunk, seated on the ground. */
export function drawPineDrift({ pixelRect }, groundOffset) {
  drift(pixelRect, -22, 16, 6, groundOffset);
  drift(pixelRect, 4, 20, 8, groundOffset);
}

// How close to a pine a hard landing must be to knock its snow down, across
// and up or down, and how long the snow takes to fall and settle.
export const SNOW_PINE_REACH = 180;
const SNOW_PINE_REACH_Y = 220;
export const SNOW_PUFF_TIME = 1.6;

/**
 * How a hard landing shakes a pine standing at (`x`, `y`): the `age` of the
 * shake in seconds and its `strength` (0…1, less further away), or null when
 * there is none. `landing` is { x, y, time, strength }: where and when (in the
 * props' seconds) the rider last landed hard. Nothing shakes at time 0.
 */
export function pineShake(landing, x, y, time) {
  if (!landing || !Number.isFinite(landing.x) || !Number.isFinite(landing.time) || !time) return null;
  const age = time - landing.time;
  const distance = Math.abs(landing.x - x);
  if (age < 0 || age > SNOW_PUFF_TIME || distance > SNOW_PINE_REACH) return null;
  if (Number.isFinite(landing.y) && Number.isFinite(y) && Math.abs(landing.y - y) > SNOW_PINE_REACH_Y) return null;
  const strength = clamp(landing.strength ?? 1, 0, 1) * (1 - (distance / SNOW_PINE_REACH) * 0.6);
  return { age, strength };
}

/** How far the canopy sways sideways while shaking, in world units. */
export function pineSway({ age, strength }) {
  if (age > 0.45) return 0;
  return snap(Math.sin(age * 38) * 3 * strength * (1 - age / 0.45));
}

/**
 * The snow a shake knocks loose, as pixels to draw: clumps sliding off the
 * bough tips and breaking into powder as they fall, and powder drifting down
 * around the crown. Each is { x, y, size, color, alpha } in the pine's local
 * units; nothing falls below `groundOffset(x)`. `noise(n)` is a fixed 0…1
 * per prop.
 */
export function pineSnowFall({ age, strength }, noise, groundOffset) {
  const fade = Math.min(1, 1.6 * (1 - age / SNOW_PUFF_TIME));
  const out = [];
  let n = 0;
  PINE_TIERS.forEach(({ top, bottom, halfWidth }) => {
    const rows = (bottom - top) / 2;
    const tipY = top + (rows - 4) * 2;
    for (const side of [-1, 1]) {
      const count = 3 + Math.round(strength);
      for (let k = 0; k < count; k++, n++) {
        const t = age - noise(n + 20) * 0.3;
        if (t <= 0) continue;
        const sx = side * (halfWidth - 2 - k * 7);
        const x = sx + side * (4 + noise(n + 40) * 16) * t;
        const y = tipY + 2 + 170 * t * t - 10 * t;
        if (y > groundOffset(x) - 4) continue;
        const color = side < 0 ? SNOW.base : SNOW.light;
        // Whole clumps at first, breaking into powder as they fall.
        if (t < 0.3) out.push({ x: snap(x - 2), y: snap(y - 2), size: 6, color, alpha: fade });
        else {
          out.push({ x: snap(x), y: snap(y), size: 4, color, alpha: fade });
          out.push({ x: snap(x - side * 4), y: snap(y - 6), size: 2, color: SNOW.light, alpha: fade * 0.8 });
          out.push({ x: snap(x + side * 2), y: snap(y - 10), size: 2, color: SNOW.base, alpha: fade * 0.6 });
        }
      }
    }
  });
  // Powder drifting down around the crown.
  for (let k = 0; k < 16; k++) {
    const sx = (noise(k + 60) - 0.5) * 90;
    const sy = -50 - noise(k + 70) * 130;
    out.push({
      x: snap(sx + Math.sin(age * 3 + k) * 4),
      y: snap(sy + age * 30),
      size: 2,
      color: SNOW.light,
      alpha: fade * strength * Math.min(1, age / 0.12),
    });
  }
  return out;
}

/**
 * Puffs of powder, as [{ x, y, radius, alpha }] in the pine's local units:
 * one bursting off each bough tip as the snow lets go, and a cloud billowing
 * up off the ground where it lands (`y` there is above the ground, which
 * the caller adds).
 */
export function pineSnowPuffs({ age, strength }) {
  const out = { tips: [], ground: [] };
  const burst = age / 0.7;
  if (burst < 1)
    PINE_TIERS.forEach(({ top, bottom, halfWidth }) => {
      const tipY = bottom - 8;
      for (const side of [-1, 1])
        out.tips.push({
          x: side * snap(halfWidth - 4 + burst * 8),
          y: snap(tipY + burst * 10),
          radius: (4 + burst * 8) * (0.6 + 0.4 * strength),
          alpha: 0.75 * (1 - burst),
        });
    });
  const grow = Math.min(1, Math.max(0, (age - 0.3) / 0.7));
  const fade = Math.max(0, 1 - age / SNOW_PUFF_TIME);
  if (grow > 0)
    for (const side of [-1, 1])
      out.ground.push(
        { x: side * snap(34 + grow * 14), y: -snap(6 + grow * 6), radius: 5 + grow * 9 * strength, alpha: 0.75 * fade },
        { x: side * snap(16 + grow * 8), y: -snap(4 + grow * 4), radius: 4 + grow * 7 * strength, alpha: 0.65 * fade },
      );
  return out;
}

// ---------------------------------------------------------------------------
// Hut with a smoking chimney
// ---------------------------------------------------------------------------

export const HUT_BOUNDS = [-58, -136, 58, -8];
export const HUT_BODY_BOTTOM = -8;
// The window's glass, and where the chimney's smoke leaves it.
export const HUT_WINDOW = { left: 8, top: -52, width: 18, height: 14 };
// The middle of the window, where its firelight comes from.
export const HUT_WINDOW_CENTRE = [HUT_WINDOW.left + HUT_WINDOW.width / 2, HUT_WINDOW.top + HUT_WINDOW.height / 2];
export const HUT_CHIMNEY = { x: 28, y: -136 };
// The walls are 11 logs high, so the door is tall enough for a person.
const HUT_APEX = -120;
const HUT_WALL_TOP = -74;
// The outer edge of the roof's snow at a row: 45 degrees from the apex.
const roofHalf = (py) => py - HUT_APEX + 4;

/**
 * A log cabin, gable end on: snow piled on the roof, red shutters, a door and
 * a window that is lit from inside after dark (see drawHutWindowGlass), and a
 * stone chimney on the right. Down to HUT_BODY_BOTTOM; the foundation is live.
 */
export function drawHut({ pixelRect, drawPixelDisc }) {
  // Gable boards inside the roof triangle.
  for (let py = HUT_APEX + 4; py < HUT_WALL_TOP; py += 2) {
    const half = roofHalf(py) - 14;
    if (half <= 0) continue;
    for (let px = -half; px < half; px += 2) {
      const board = Math.floor((px + 60) / 6);
      const seam = (px + 60) % 6 === 0;
      const color = seam ? WOOD.dark : px < -half + 6 ? WOOD.base : board % 2 ? WOOD.plank : WOOD.light;
      pixelRect(px, py, 2, 2, color, 2);
    }
  }
  // Round attic vent with louvres.
  drawPixelDisc(0, -92, 6, WOOD.dark, 2);
  pixelRect(-4, -96, 8, 2, WOOD.base, 2);
  pixelRect(-4, -92, 8, 2, WOOD.base, 2);
  pixelRect(-2, -88, 6, 2, WOOD.base, 2);
  // Log walls, with the log ends crossing at the corners.
  for (let log = 0; log < 11; log++) {
    const py = HUT_WALL_TOP + log * 6;
    pixelRect(-40, py, 80, 2, WOOD.light, 2);
    pixelRect(-40, py + 2, 80, 2, WOOD.plank, 2);
    pixelRect(-40, py + 4, 80, 2, WOOD.dark, 2);
    pixelRect(-40, py, 4, 4, WOOD.base, 2);
    pixelRect(34, py, 6, 2, WOOD.tip, 2);
    for (const end of [-46, 40]) {
      pixelRect(end, py, 6, 6, WOOD.cut, 2);
      pixelRect(end, py, 2, 6, WOOD.tip, 2);
      pixelRect(end + 2, py + 2, 2, 2, WOOD.tip, 2);
      pixelRect(end, py + 4, 6, 2, WOOD.light, 2);
    }
  }
  // Door, about 1.9 m tall: planks in a dark frame, a handle and a step.
  pixelRect(-32, -60, 20, 52, WOOD.dark, 2);
  for (let px = -30; px < -14; px += 2) {
    const plank = Math.floor((px + 30) / 4);
    pixelRect(px, -58, 2, 50, (px + 30) % 4 === 0 ? WOOD.base : plank % 2 ? WOOD.plank : WOOD.light, 2);
  }
  pixelRect(-30, -58, 16, 2, WOOD.base, 2);
  pixelRect(-30, -40, 16, 2, WOOD.base, 2);
  pixelRect(-30, -22, 16, 2, WOOD.base, 2);
  pixelRect(-18, -36, 2, 4, IRON.base, 2);
  pixelRect(-18, -36, 2, 2, STEEL.light, 2);
  pixelRect(-34, -10, 24, 2, WOOD.tip, 2);
  // Window frame and shutters; the glass is drawn by drawHutWindowGlass.
  const w = HUT_WINDOW;
  pixelRect(w.left - 2, w.top - 2, w.width + 4, w.height + 4, WOOD.tip, 2);
  pixelRect(w.left - 2, w.top - 2, 2, w.height + 4, WOOD.base, 2);
  drawHutWindowGlass({ pixelRect }, 0);
  for (const sx of [w.left - 8, w.left + w.width + 2]) {
    pixelRect(sx, w.top - 2, 6, w.height + 4, PAINT.red, 2);
    pixelRect(sx, w.top - 2, 2, w.height + 4, PAINT.redDark, 2);
    pixelRect(sx + 2, w.top + 4, 2, 2, PAINT.redDark, 2);
    pixelRect(sx + 2, w.top + 10, 2, 2, PAINT.redDark, 2);
    pixelRect(sx + 4, w.top - 2, 2, 2, PAINT.redLight, 2);
  }
  // Sill with snow on it.
  pixelRect(w.left - 4, w.top + w.height + 2, w.width + 8, 2, WOOD.tip, 2);
  pixelRect(w.left - 4, w.top + w.height, w.width + 8, 2, SNOW.base, 2);
  pixelRect(w.left - 4, w.top + w.height, 4, 2, SNOW.shade, 2);
  pixelRect(w.left + w.width, w.top + w.height, 4, 2, SNOW.light, 2);
  // Roof: a dark fascia under a deep layer of snow, both sides of the apex.
  for (let py = HUT_APEX; py < HUT_WALL_TOP + 10; py += 2) {
    const half = roofHalf(py);
    for (const side of [-1, 1]) {
      const outer = side < 0 ? -half : half - 8;
      // Snow, 8 units deep, shaded on the left slope.
      pixelRect(outer, py, 8, 2, side < 0 ? SNOW.shade : SNOW.base, 2);
      pixelRect(side < 0 ? outer : outer + 6, py, 2, 2, side < 0 ? SNOW.deep : SNOW.light, 2);
      // Fascia board under it.
      const fascia = side < 0 ? -half + 8 : half - 14;
      if (py > HUT_APEX + 2) pixelRect(fascia, py, 6, 2, side < 0 ? WOOD.dark : WOOD.base, 2);
      if (py > HUT_APEX + 2) pixelRect(side < 0 ? fascia + 4 : fascia, py, 2, 2, WOOD.dark, 2);
    }
  }
  // Ridge cap of snow and overhangs drooping off the eaves.
  pixelRect(-6, HUT_APEX - 4, 12, 4, SNOW.base, 2);
  pixelRect(-6, HUT_APEX - 4, 4, 4, SNOW.shade, 2);
  pixelRect(2, HUT_APEX - 4, 4, 2, SNOW.light, 2);
  pixelRect(-58, HUT_WALL_TOP + 8, 8, 4, SNOW.shade, 2);
  pixelRect(-58, HUT_WALL_TOP + 12, 4, 2, SNOW.deep, 2);
  pixelRect(50, HUT_WALL_TOP + 8, 8, 4, SNOW.base, 2);
  pixelRect(54, HUT_WALL_TOP + 12, 4, 2, SNOW.shade, 2);
  // Little icicles off the eaves, under the overhangs.
  for (const [ix, length] of [[-56, 6], [-52, 4], [52, 4], [56, 8]]) {
    pixelRect(ix, HUT_WALL_TOP + 14, 2, length, ICE.light, 2);
    pixelRect(ix, HUT_WALL_TOP + 14 + length - 2, 2, 2, ICE.base, 2);
  }
  // Stone chimney through the right slope, down into the snow.
  const c = HUT_CHIMNEY;
  for (let px = c.x - 6; px < c.x + 6; px += 2) {
    const roof = HUT_APEX + (px + 1) - 4 + 10;
    for (let py = c.y + 8; py < roof; py += 2) {
      const course = Math.floor((py - c.y) / 4);
      const mortar = (py - c.y) % 4 === 0 || (px - c.x + (course % 2) * 4 + 12) % 8 === 0;
      let color = mortar ? STONE.dark : STONE.base;
      if (px === c.x - 6) color = STONE.dark;
      else if (px === c.x + 4) color = mortar ? STONE.base : STONE.light;
      pixelRect(px, py, 2, 2, color, 2);
    }
  }
  // Cap stone and snow on it.
  pixelRect(c.x - 8, c.y + 6, 16, 4, STONE.mid, 2);
  pixelRect(c.x - 8, c.y + 8, 2, 2, STONE.dark, 2);
  pixelRect(c.x + 4, c.y + 6, 4, 2, STONE.tip, 2);
  pixelRect(c.x - 6, c.y + 4, 12, 2, SNOW.base, 2);
  pixelRect(c.x - 6, c.y + 4, 2, 2, SNOW.shade, 2);
  pixelRect(c.x + 2, c.y + 4, 4, 2, SNOW.light, 2);
}

/**
 * The window's glass: dark with a sky reflection by day (`lit` 0), or warm
 * firelight (`lit` > 0, with a flicker 0.88…1), crossed by its glazing bars.
 */
export function drawHutWindowGlass({ pixelRect }, lit = 1) {
  const { left, top, width, height } = HUT_WINDOW;
  if (lit > 0) {
    pixelRect(left, top, width, height, HUT_LIGHT.glass, 2);
    pixelRect(left + 2, top + height - 6, width - 4, 4, HUT_LIGHT.core, 2);
    pixelRect(left + 4, top + height - 4, 4, 2, lit < 0.95 ? HUT_LIGHT.glass : HUT_LIGHT.flame, 2);
  } else {
    pixelRect(left, top, width, height, GLASS.dark, 2);
    pixelRect(left + width - 6, top, 4, 2, GLASS.base, 2);
    pixelRect(left + width - 4, top + 2, 2, 2, GLASS.base, 2);
    pixelRect(left + 2, top + 8, 2, 2, GLASS.base, 2);
  }
  // Glazing bars.
  pixelRect(left + width / 2 - 1, top, 2, height, WOOD.base, 2);
  pixelRect(left, top + height / 2 - 1, width, 2, WOOD.base, 2);
}

/** Stone foundation under the hut and drifts against its walls, down to the ground. */
export function drawHutFoundation({ pixelRect }, groundOffset) {
  for (let px = -44; px < 44; px += 2) {
    const block = Math.floor((px + 44) / 10);
    const seam = (px + 44) % 10 === 0;
    let color = seam ? STONE.dark : block % 2 ? STONE.base : STONE.mid;
    if (px < -40) color = STONE.dark;
    downTo(pixelRect, px, HUT_BODY_BOTTOM, 2, color, groundOffset);
    pixelRect(px, HUT_BODY_BOTTOM, 2, 2, px > 30 ? STONE.tip : STONE.light, 2);
  }
  drift(pixelRect, -56, 14, 10, groundOffset);
  drift(pixelRect, 40, 18, 12, groundOffset);
  // Trodden snow in front of the door.
  drift(pixelRect, -38, 30, 4, groundOffset);
}

/**
 * Puffs of chimney smoke at `time` (seconds), as [{ x, y, radius, alpha }]
 * in the hut's local units: each rises, swells, thins out and is blown
 * `downwind` (-1 to the left, 1 to the right, in the hut's local units). In
 * a stronger `wind` (0…1, from the trail's weather) the plume bends over sooner and
 * flatter. `phase` is a fixed 0…1 per prop. Standing still (time 0) they hold.
 */
export function chimneySmoke(time, phase, wind = 0.25, downwind = -1) {
  const PUFFS = 6;
  const LIFE = 4.2;
  const w = clamp(Number(wind) || 0, 0, 1);
  // In still air it rises nearly straight up; in a gale it is torn off flat.
  const lean = 4 + w * 120;
  const climb = 76 - w * 50;
  const out = [];
  for (let k = 0; k < PUFFS; k++) {
    const t = ((((time || 0.6) / LIFE + k / PUFFS + phase) % 1) + 1) % 1;
    out.push({
      x: HUT_CHIMNEY.x + snap(downwind * t * t * lean + Math.sin(t * 7 + k * 1.7) * 3),
      y: HUT_CHIMNEY.y - snap(t * climb),
      radius: 3 + t * 7,
      alpha: 0.7 * (t < 0.1 ? t / 0.1 : 1) * (1 - t) ** 1.3,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snowman
// ---------------------------------------------------------------------------

// Where the snowman looks from; riderGaze in drawing.js says where it looks.
export const SNOWMAN_EYE_HEIGHT = -56;

/**
 * 50 × 76: three balls of snow with a top hat, scarf, stick arms and coal
 * buttons, down to y = 0. The face is drawn live by drawSnowmanFace.
 */
export function drawSnowman({ pixelRect, pixelPath, drawPixelDisc }) {
  // Stick arms, behind the body.
  pixelPath([[-8, -38], [-18, -44], [-26, -50]], WOOD.base, 1, 2);
  pixelPath([[-18, -44], [-20, -52]], WOOD.base, 1, 2);
  pixelPath([[8, -38], [18, -42], [24, -50]], WOOD.light, 1, 2);
  pixelPath([[18, -42], [26, -42]], WOOD.light, 1, 2);
  // Three balls, each shaded on the left with a lit crown on the right.
  for (const [cy, r] of [[-14, 14], [-36, 10], [-52, 8]]) {
    drawPixelDisc(0, cy, r, SNOW.shade, 2);
    drawPixelDisc(2, cy - 2, r - 3, SNOW.base, 2);
    drawPixelDisc(Math.round(r * 0.35) * 2 - 2, cy - Math.round(r * 0.3) * 2, Math.max(2, r * 0.3), SNOW.light, 2);
  }
  // Blue shadow under the middle ball and the head.
  pixelRect(-8, -28, 16, 2, SNOW.deep, 2);
  pixelRect(-6, -44, 10, 2, SNOW.shade, 2);
  // Coal buttons.
  for (const by of [-40, -34, -20]) pixelRect(0, by, 2, 2, COAL, 2);
  // Scarf with a tail hanging down the shaded side.
  pixelRect(-8, -46, 16, 4, PAINT.red, 2);
  pixelRect(-8, -46, 4, 4, PAINT.redDark, 2);
  pixelRect(4, -46, 4, 2, PAINT.redLight, 2);
  pixelRect(-10, -42, 4, 12, PAINT.red, 2);
  pixelRect(-10, -42, 2, 12, PAINT.redDark, 2);
  pixelRect(-10, -30, 2, 2, PAINT.redLight, 2);
  pixelRect(-6, -30, 2, 2, PAINT.redLight, 2);
  // Top hat with a red band.
  pixelRect(-10, -62, 20, 2, IRON.dark, 2);
  pixelRect(-6, -74, 12, 12, IRON.base, 2);
  pixelRect(-6, -74, 2, 12, IRON.dark, 2);
  pixelRect(2, -74, 2, 10, IRON.light, 2);
  pixelRect(-6, -66, 12, 2, PAINT.red, 2);
  pixelRect(-6, -66, 2, 2, PAINT.redDark, 2);
  pixelRect(-4, -76, 8, 2, SNOW.base, 2);
}

/**
 * The coal eyes, which follow `gaze` (see riderGaze in drawing.js), the carrot nose that
 * points the way they look, and a coal smile.
 */
export function drawSnowmanFace({ pixelRect }, gaze = { x: 0, y: 0 }) {
  const ex = gaze.x * 2,
    ey = gaze.y * 2;
  pixelRect(-4 + ex, SNOWMAN_EYE_HEIGHT + ey, 2, 2, COAL, 2);
  pixelRect(2 + ex, SNOWMAN_EYE_HEIGHT + ey, 2, 2, COAL, 2);
  if (gaze.x > 0) {
    pixelRect(0 + ex, -52, 6, 2, CARROT.base, 2);
    pixelRect(0 + ex, -50, 2, 2, CARROT.shade, 2);
    pixelRect(6 + ex, -52, 2, 2, CARROT.shade, 2);
  } else if (gaze.x < 0) {
    pixelRect(-6 + ex, -52, 6, 2, CARROT.base, 2);
    pixelRect(-6 + ex, -52, 2, 2, CARROT.shade, 2);
    pixelRect(-2 + ex, -50, 2, 2, CARROT.shade, 2);
  } else {
    pixelRect(-2, -52, 2, 2, CARROT.shade, 2);
    pixelRect(0, -52, 2, 2, CARROT.base, 2);
  }
  for (const [mx, my] of [[-4, -48], [-2, -46], [0, -46], [2, -48]]) pixelRect(mx + ex, my, 2, 2, COAL, 2);
}

/** Packed snow the bottom ball is bedded in, down to the ground. */
export function drawSnowmanDrift({ pixelRect }, groundOffset) {
  downTo(pixelRect, -12, 0, 6, SNOW.shade, groundOffset);
  downTo(pixelRect, -6, 0, 18, SNOW.base, groundOffset);
  drift(pixelRect, -18, 36, 4, groundOffset);
}
