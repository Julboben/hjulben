// @ts-check
// Trials-event props (tyre walls, hay bales, course tape, sponsor banners,
// spectators, a pit board, a petrol can, flag marshals and a camera tower),
// and props that teach a trail without words (warning and arrow signs, the
// halfway flag and sprayed tutorial drawings). Like every prop they sit on
// the 2-unit art grid, have no outlines and are lit from the right. Static
// parts are drawn once into sprites by drawing.js; the parts that move, react
// or follow the ground are drawn live from the functions here.
//
// Text (banner brands, the pit-board number, the halfway split) is left to
// drawing.js, which draws it the right way round; this module only says where.

import { STEEL } from "./city-props.js";

const RUBBER = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const RED = { dark: "#a8322a", base: "#d63b2c", light: "#e8755b" };
const WHITE = { dark: "#b5bcae", base: "#f4e9d1", light: "#fffdf4" };
const YELLOW = { dark: "#d9953a", base: "#f1b95d", light: "#ffe39a" };
const BLUE = { dark: "#3f6f78", base: "#568f98", light: "#83d1ce" };
const GREEN = { dark: "#477158", base: "#568061", light: "#618b66" };
const ORANGE = { dark: "#c9573a", base: "#ed774e", light: "#ffc295" };
const WOOD = { dark: "#4d3f2f", base: "#66543f", light: "#856d4f", tip: "#aa8a60", cut: "#c39664" };
const DENIM = { dark: BLUE.dark, base: "#4a7f88", light: BLUE.base };
const KHAKI = { dark: WOOD.dark, base: WOOD.base, light: WOOD.light };
// A marshal's flag green, brighter than the leaves so it reads as cloth.
const FLAG_GREEN = { dark: "#477158", base: "#3aa63c", light: "#8fdc6e" };
const INK = "#182321";
// Skin tones from the rider's: [base, light, shade].
const SKIN = {
  fair: { base: "#e8b48f", light: "#f7d1b0", shade: "#c48f6c" },
  tan: { base: "#bd7954", light: "#dfa078", shade: "#9a5c40" },
  deep: { base: "#5e3726", light: "#7e4c35", shade: "#45271b" },
  light: { base: "#d99a72", light: "#f0bb93", shade: "#b47454" },
};

const snap = (value) => Math.round(value / 2) * 2;

// A box with its left side shaded and its right edge lit.
function block({ pixelRect }, x, y, width, height, c) {
  pixelRect(x, y, width, height, c.base, 2);
  pixelRect(x, y, 2, height, c.dark, 2);
  if (width > 4) pixelRect(x + width - 2, y, 2, height, c.light, 2);
}

// Rows of characters, one 2-unit cell each; `colors` maps a character to a
// colour and anything else is left clear.
function drawCells({ pixelRect }, rows, left, top, colors) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]];
      if (color) pixelRect(left + x * 2, top + y * 2, 2, 2, color, 2);
    }
  });
}

// ---------------------------------------------------------------- tyre wall

/** How many tyres high each column of a tyre wall is stacked, left to right. */
export const TYRE_WALL_COLUMNS = [3, 3, 2, 3];
/** Local bounds of the tyre wall sprite, [left, top, right, bottom]. */
export const TYRE_WALL_BOUNDS = [-48, -32, 48, 0];
const TYRE_PAINTS = [RED, WHITE, YELLOW, BLUE];

// One tyre lying flat, 24 × 10, seen side on: rubber sidewalls and a painted
// tread. The top tyre of a stack shows its hole.
function drawStackedTyre({ pixelRect }, x, y, c, top) {
  pixelRect(x + 2, y, 20, 10, RUBBER.base, 2);
  pixelRect(x, y + 2, 24, 6, RUBBER.base, 2);
  pixelRect(x, y + 2, 2, 6, RUBBER.dark, 2);
  pixelRect(x + 2, y + 8, 20, 2, RUBBER.dark, 2);
  pixelRect(x + 22, y + 2, 2, 4, RUBBER.light, 2);
  pixelRect(x + 2, y + 2, 20, 6, c.base, 2);
  pixelRect(x + 2, y + 2, 4, 6, c.dark, 2);
  pixelRect(x + 16, y + 2, 6, 2, c.light, 2);
  pixelRect(x + 20, y + 4, 2, 2, c.light, 2);
  if (top) pixelRect(x + 6, y, 12, 2, INK, 2);
}

/** 96 × 32, columns of painted tyres stacked flat, each a different colour. */
export function drawTyreWall(tools) {
  TYRE_WALL_COLUMNS.forEach((count, column) => {
    const x = -48 + column * 24;
    for (let row = 0; row < count; row++)
      drawStackedTyre(tools, x, -10 - row * 10, TYRE_PAINTS[(column * 3 + row) % 4], row === count - 1);
  });
}

// ---------------------------------------------------------------- hay bales

/** Local bounds of the hay bale sprite. */
export const HAY_BALES_BOUNDS = [-38, -40, 38, 0];

// One 36 × 18 bale: shaded cut end on the left, two blue twines.
function drawBale(tools, x, y) {
  const { pixelRect } = tools;
  const s = YELLOW;
  pixelRect(x, y, 36, 18, s.base, 2);
  pixelRect(x, y, 36, 2, s.light, 2);
  pixelRect(x, y, 4, 18, s.dark, 2);
  pixelRect(x + 34, y + 2, 2, 14, s.light, 2);
  pixelRect(x, y + 16, 36, 2, s.dark, 2);
  for (const [dx, dy] of [[8, 6], [14, 10], [22, 4], [28, 12], [18, 14], [8, 12], [26, 8]])
    pixelRect(x + dx, y + dy, 4, 2, s.dark, 2);
  pixelRect(x + 2, y + 6, 2, 2, s.base, 2);
  pixelRect(x + 2, y + 12, 2, 2, s.base, 2);
  for (const dx of [10, 24]) {
    pixelRect(x + dx, y, 2, 18, BLUE.base, 2);
    pixelRect(x + dx, y, 2, 2, BLUE.light, 2);
  }
  // Stray straws on top.
  pixelRect(x + 6, y - 2, 2, 2, s.light, 2);
  pixelRect(x + 28, y - 2, 4, 2, s.base, 2);
}

/** 76 × 40, three straw bales stacked two and one, to line a drop. */
export function drawHayBales(tools) {
  drawBale(tools, -36, -18);
  drawBale(tools, 0, -18);
  drawBale(tools, -18, -36);
}

// ------------------------------------------------------------- course tape

/** Local x of the two stakes the tape is strung between. */
export const TAPE_STAKES = [-46, 46];
/** How far above the ground the stakes stand. */
export const TAPE_HEIGHT = 26;
const TAPE_STRIPE = 8;

/**
 * How far the tape hangs below the line between the stake tops at `t` (0 at
 * the left stake, 1 at the right): a sag, plus a flutter in the wind (0…1)
 * that holds still at time 0. `phase` (0…1) staggers neighbouring tapes.
 */
export function tapeDroop(t, time, wind, phase) {
  const belly = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  if (!time) return belly * 6;
  return belly * (6 + (0.5 + wind * 4) * Math.sin(time * (3 + wind * 6) + t * 8 + phase * Math.PI * 2));
}

/**
 * The loose end of tape tied off at a stake, blowing `downwind` (-1 left, 1
 * right): five [dx, dy] points from the knot. A stronger wind lifts it out
 * straighter; at time 0 it hangs still.
 */
export function tapeTail(time, wind, phase, downwind) {
  const lift = 0.3 + 0.7 * Math.min(1, Math.max(0, wind));
  const points = [];
  for (let i = 1; i <= 5; i++) {
    const flutter = time ? Math.sin(time * (5 + wind * 8) + i * 1.3 + phase * Math.PI * 2) * i * (0.2 + wind * 0.8) : 0;
    points.push([downwind * i * (2 + lift * 2), i * 3 * (1 - lift) + flutter]);
  }
  return points;
}

/**
 * Red and white barrier tape strung between two wooden stakes. Everything is
 * drawn live: the stakes stand on the ground at their own x
 * (`groundOffset(localX)`), and the tape flutters between them.
 */
export function drawCourseTape({ pixelRect }, groundOffset, time, wind, phase, downwind) {
  const [left, right] = TAPE_STAKES;
  const tops = TAPE_STAKES.map((sx) => snap(groundOffset(sx)) - TAPE_HEIGHT);
  TAPE_STAKES.forEach((sx, index) => {
    const top = tops[index];
    pixelRect(sx - 2, top, 2, TAPE_HEIGHT + 2, WOOD.base, 2);
    pixelRect(sx, top, 2, TAPE_HEIGHT + 2, WOOD.tip, 2);
    pixelRect(sx - 2, top - 2, 4, 4, ORANGE.base, 2);
    pixelRect(sx, top - 2, 2, 2, ORANGE.light, 2);
  });
  const stripe = (distance) => (Math.floor(distance / TAPE_STRIPE) % 2 ? WHITE.light : RED.base);
  for (let lx = left + 2; lx < right; lx += 2) {
    const t = (lx - left) / (right - left);
    const y = snap(tops[0] + (tops[1] - tops[0]) * t + 4 + tapeDroop(t, time, wind, phase));
    pixelRect(lx, y, 2, 2, stripe(lx - left), 2);
  }
  // The loose end, tied off at the downwind stake.
  const knot = downwind < 0 ? 0 : 1;
  const kx = TAPE_STAKES[knot] + (downwind < 0 ? -2 : 2);
  const ky = tops[knot] + 4;
  tapeTail(time, wind, phase, downwind).forEach(([dx, dy], index) =>
    pixelRect(snap(kx + dx), snap(ky + dy), 2, 2, index % 2 ? RED.base : WHITE.light, 2),
  );
}

// ---------------------------------------------------------- sponsor banners

/** The made-up sponsors, each with its own colours and logo. */
export const BANNER_BRANDS = [
  {
    name: "KNOBBLY TYRES",
    icon: "tyre",
    colors: { ...YELLOW, text: INK },
  },
  {
    // Drawn as APPLE with the umlaut added over the first letter.
    name: "APPLE OIL",
    umlaut: 0,
    icon: "apple",
    colors: { ...RED, text: WHITE.light },
  },
  {
    name: "HJULBEN RACING",
    icon: "wheel",
    colors: { dark: "#365345", base: "#3d6452", light: GREEN.base, text: "#fff3be" },
  },
];
/** The most characters a banner with its own text shows. */
export const BANNER_MAX = 16;
const BANNER_PLAIN = { ...BLUE, text: WHITE.light };
/** Top and bottom of the banner cloth, relative to the ground. */
export const BANNER_TOP = -44;
export const BANNER_BOTTOM = -22;

/**
 * What a banner shows. Blank text gets a sponsor picked by `pick` (0…1, from
 * the prop's position); a sponsor's name (with or without its Ä) gets that
 * sponsor's banner; anything else is printed on a plain blue banner.
 */
export function bannerStyle(text, pick = 0) {
  const label = String(text || "").trim().toUpperCase().replace(/Ä/g, "A");
  if (!label)
    return BANNER_BRANDS[Math.min(BANNER_BRANDS.length - 1, Math.floor(pick * BANNER_BRANDS.length))];
  return (
    BANNER_BRANDS.find((brand) => brand.name === label) ?? {
      name: label.slice(0, BANNER_MAX),
      icon: null,
      colors: BANNER_PLAIN,
    }
  );
}

/**
 * Where everything on a banner goes, in local units: `half` is half the
 * cloth's width, `text` the left and top of the lettering and `icon` the
 * centre of the logo, or null.
 */
export function bannerLayout(style) {
  const textWidth = style.name.length ? (style.name.length * 4 - 1) * 2 : 0;
  const iconWidth = style.icon ? 18 : 0;
  const half = Math.ceil((textWidth + iconWidth + 16) / 4) * 2;
  const left = -half + 8;
  return {
    half,
    icon: style.icon ? { x: left + 6, y: BANNER_TOP + 10 } : null,
    text: { x: left + iconWidth, y: BANNER_TOP + 6 },
  };
}

// The sponsors' logos, about 14 across, centred on (x, y).
function drawBannerIcon(tools, icon, x, y) {
  const { pixelRect, drawPixelDisc } = tools;
  if (icon === "tyre") {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      pixelRect(snap(x + Math.cos(angle) * 7) - 1, snap(y + Math.sin(angle) * 7) - 1, 2, 2, INK, 2);
    }
    drawPixelDisc(x, y, 6, INK, 2);
    drawPixelDisc(x, y, 2, STEEL.light, 2);
  } else if (icon === "apple") {
    drawPixelDisc(x, y + 1, 6, WHITE.light, 2);
    pixelRect(x - 2, y + 4, 2, 2, WHITE.base, 2);
    pixelRect(x, y - 8, 2, 4, WOOD.dark, 2);
    pixelRect(x + 2, y - 8, 4, 2, FLAG_GREEN.light, 2);
    // An oil drop where the apple's shine would be.
    pixelRect(x + 2, y - 2, 2, 2, YELLOW.base, 2);
    pixelRect(x + 2, y, 2, 2, YELLOW.dark, 2);
  } else if (icon === "wheel") {
    drawPixelDisc(x, y, 7, INK, 2);
    drawPixelDisc(x, y, 5, ORANGE.base, 2);
    drawPixelDisc(x, y, 3, "#3d6452", 2);
    pixelRect(x - 4, y, 10, 2, STEEL.light, 2);
    pixelRect(x, y - 4, 2, 10, STEEL.light, 2);
    pixelRect(x - 2, y - 2, 6, 6, ORANGE.base, 2);
    pixelRect(x, y, 2, 2, INK, 2);
  }
}

/**
 * A sponsor banner tied between two posts, lettering left out (drawing.js
 * draws it the right way round at `bannerLayout(style).text`). The posts run
 * down to the ground live.
 */
export function drawBanner(tools, style, groundOffset) {
  const { pixelRect } = tools;
  const { half, icon } = bannerLayout(style);
  const c = style.colors;
  const height = BANNER_BOTTOM - BANNER_TOP;
  // Posts, each standing on the ground under it.
  for (const px of [-half - 6, half + 2]) {
    const shaded = px < 0;
    const ground = snap(groundOffset(px + 2));
    const top = BANNER_TOP - 4;
    if (ground <= top) continue;
    pixelRect(px, top, 4, ground - top, shaded ? WOOD.base : WOOD.light, 2);
    pixelRect(px + (shaded ? 0 : 2), top, 2, ground - top, shaded ? WOOD.dark : WOOD.tip, 2);
  }
  // Ties from the cloth's corners to the posts.
  for (const y of [BANNER_TOP + 2, BANNER_BOTTOM - 4]) {
    pixelRect(-half - 2, y, 2, 2, WHITE.dark, 2);
    pixelRect(half, y, 2, 2, WHITE.base, 2);
  }
  // The cloth: lit hem along the top, a shaded fold along the bottom.
  pixelRect(-half, BANNER_TOP, half * 2, height, c.base, 2);
  pixelRect(-half, BANNER_TOP, half * 2, 2, c.light, 2);
  pixelRect(-half, BANNER_BOTTOM - 2, half * 2, 2, c.dark, 2);
  pixelRect(-half, BANNER_TOP, 2, height, c.dark, 2);
  pixelRect(half - 2, BANNER_TOP + 2, 2, height - 4, c.light, 2);
  // Eyelets.
  for (const x of [-half + 2, half - 4])
    for (const y of [BANNER_TOP + 2, BANNER_BOTTOM - 4]) pixelRect(x, y, 2, 2, STEEL.light, 2);
  if (icon) drawBannerIcon(tools, style.icon, icon.x, icon.y);
}

// ------------------------------------------------------------------ people

/**
 * How a person looks: shirt, trousers and skin palettes, hair colour, and an
 * optional hat or hi-vis vest.
 * @typedef {{ shirt: any, legs: any, skin: any, hair: string, hat?: any, vest?: boolean }} PersonLook
 */

/** Where a standing person's eyes are, above their feet. */
export const PERSON_EYES = -42;

/**
 * A person about 48 tall, feet at (0, 0), facing right. `pose` is "idle",
 * "cheer" (arms up), "duck" (crouched, arms over the head), "wince" (hands on
 * the head) or "hold" (right arm left out, for a flag drawn live). Only the
 * head turns to `gaze` ({ x, y }, each -1, 0 or 1; see riderGaze in
 * drawing.js): to either side or out at the viewer, and up or down.
 * @param {any} tools
 * @param {PersonLook} look
 * @param {string} pose
 * @param {{ x: number, y: number }} [gaze]
 */
export function drawPerson({ pixelRect }, look, pose = "idle", gaze = { x: 1, y: 0 }) {
  const { shirt, legs, skin, hair, hat, vest } = look;
  const crouch = pose === "duck" ? 10 : 0;
  if (crouch) {
    pixelRect(-6, -8, 4, 6, legs.dark, 2);
    pixelRect(2, -8, 4, 6, legs.base, 2);
    pixelRect(-6, -14, 12, 6, legs.base, 2);
    pixelRect(-6, -14, 2, 6, legs.dark, 2);
    pixelRect(-6, -14, 12, 2, legs.light, 2);
  } else {
    pixelRect(-6, -18, 4, 16, legs.dark, 2);
    pixelRect(2, -18, 4, 16, legs.base, 2);
    pixelRect(4, -18, 2, 16, legs.light, 2);
  }
  pixelRect(-6, -2, 4, 2, RUBBER.dark, 2);
  pixelRect(2, -2, 6, 2, RUBBER.dark, 2);
  const top = -48 + crouch;
  const shoulder = top + 14;
  // The far arm, behind the body.
  if (pose === "cheer") {
    pixelRect(-8, shoulder - 6, 2, 8, shirt.dark, 2);
    pixelRect(-10, shoulder - 14, 2, 8, shirt.dark, 2);
    pixelRect(-10, shoulder - 16, 2, 2, skin.shade, 2);
  } else if (pose === "duck") {
    pixelRect(-8, shoulder - 10, 2, 12, shirt.dark, 2);
  } else if (pose === "wince") {
    pixelRect(-8, shoulder - 6, 2, 8, shirt.dark, 2);
    pixelRect(-8, top, 2, 8, shirt.dark, 2);
    pixelRect(-6, top - 2, 2, 2, skin.shade, 2);
  } else {
    pixelRect(-8, shoulder, 2, 12, shirt.dark, 2);
    pixelRect(-8, shoulder + 12, 2, 2, skin.shade, 2);
  }
  // Body.
  pixelRect(-6, shoulder - 2, 12, 18, shirt.base, 2);
  pixelRect(-6, shoulder - 2, 2, 18, shirt.dark, 2);
  pixelRect(4, shoulder - 2, 2, 16, shirt.light, 2);
  if (vest) {
    pixelRect(-4, shoulder - 2, 8, 14, ORANGE.base, 2);
    pixelRect(-4, shoulder - 2, 2, 14, ORANGE.dark, 2);
    pixelRect(2, shoulder - 2, 2, 12, ORANGE.light, 2);
    pixelRect(-4, shoulder + 6, 8, 2, WHITE.light, 2);
  }
  // Head, lit from the right whichever way it looks. A profile is mirrored
  // around the head's middle (x = 1); the eyes, and a profile's nose, move up
  // or down with the gaze.
  const eye = top + 6 + gaze.y * 2;
  const across = (x, width) => (gaze.x < 0 ? 2 - x - width : x);
  pixelRect(-4, top + 2, 10, 10, skin.base, 2);
  pixelRect(-4, top + 2, 2, 10, skin.shade, 2);
  pixelRect(4, top + 4, 2, 6, skin.light, 2);
  if (gaze.x) {
    pixelRect(across(6, 2), eye, 2, 2, skin.base, 2);
    pixelRect(across(2, 2), eye, 2, 2, INK, 2);
  } else {
    pixelRect(-2, eye, 2, 2, INK, 2);
    pixelRect(2, eye, 2, 2, INK, 2);
    pixelRect(0, eye + 2, 2, 2, skin.shade, 2);
  }
  pixelRect(-4, top, 10, 4, hair, 2);
  if (gaze.x) pixelRect(across(-6, 4), top + 2, 4, 6, hair, 2);
  else {
    pixelRect(-6, top + 2, 2, 4, hair, 2);
    pixelRect(6, top + 2, 2, 4, hair, 2);
  }
  if (hat) {
    pixelRect(-4, top - 2, 10, 4, hat.base, 2);
    pixelRect(-4, top - 2, 2, 4, hat.dark, 2);
    if (gaze.x) pixelRect(across(4, 6), top, 6, 2, hat.dark, 2);
    else pixelRect(-6, top, 14, 2, hat.dark, 2);
  }
  // The near arm, in front of the body.
  if (pose === "cheer") {
    pixelRect(6, shoulder - 6, 2, 8, shirt.base, 2);
    pixelRect(8, shoulder - 14, 2, 8, shirt.base, 2);
    pixelRect(8, shoulder - 16, 2, 2, skin.base, 2);
  } else if (pose === "duck") {
    pixelRect(6, shoulder - 10, 2, 12, shirt.base, 2);
    pixelRect(-6, top - 2, 12, 2, shirt.base, 2);
    pixelRect(-2, top - 2, 4, 2, skin.base, 2);
  } else if (pose === "wince") {
    pixelRect(6, top, 2, 16, shirt.base, 2);
    pixelRect(4, top - 2, 2, 2, skin.base, 2);
  } else if (pose !== "hold") {
    pixelRect(6, shoulder, 2, 12, shirt.base, 2);
    pixelRect(6, shoulder + 12, 2, 2, skin.base, 2);
  }
}

// --------------------------------------------------------------- spectators

/** The three people in a group of spectators: x along the ground and look. */
export const SPECTATORS = [
  { x: -22, look: { shirt: RED, legs: DENIM, skin: SKIN.tan, hair: WOOD.dark } },
  { x: 0, look: { shirt: YELLOW, legs: { dark: INK, base: RUBBER.dark, light: RUBBER.base }, skin: SKIN.fair, hair: WOOD.cut, hat: BLUE } },
  { x: 22, look: { shirt: GREEN, legs: KHAKI, skin: SKIN.deep, hair: INK, hat: ORANGE } },
];
/** How close the rider must be for spectators to cheer. */
export const SPECTATOR_CHEER = { x: 200, y: 160 };
/** How close a crash must be for them to duck, and for how many seconds. */
export const SPECTATOR_DUCK = { x: 240, y: 200, time: 1.4 };

/**
 * How spectators at (x, y) react: "duck" just after a crash nearby (scene
 * `crash`, { x, y, age }), then "wince" while the rider is down; "cheer"
 * while the rider is close; "idle" otherwise.
 */
export function spectatorMood(scene, x, y) {
  const crash = scene.crash;
  if (crash && Math.abs(crash.x - x) < SPECTATOR_DUCK.x && Math.abs(crash.y - y) < SPECTATOR_DUCK.y)
    return crash.age < SPECTATOR_DUCK.time ? "duck" : "wince";
  if (
    Number.isFinite(scene.riderX) &&
    Number.isFinite(scene.riderY) &&
    Math.abs(scene.riderX - x) < SPECTATOR_CHEER.x &&
    Math.abs(scene.riderY - y) < SPECTATOR_CHEER.y
  )
    return "cheer";
  return "idle";
}

/**
 * How high a cheering spectator jumps (0, -2 or -4), each one `index` out of
 * step and the group staggered by `phase` (0…1). Still at time 0.
 */
export function spectatorHop(time, index, phase) {
  if (!time) return 0;
  const beat = (((time * 2.6 + index * 0.37 + phase) % 1) + 1) % 1;
  return beat < 0.5 ? -snap(Math.sin(beat * 2 * Math.PI) * 4) : 0;
}

// --------------------------------------------------------------- pit board

/** The pit board's face, where drawing.js prints its number. */
export const PIT_BOARD = { left: -18, top: -68, width: 36, height: 30 };
/** Where the board's post starts, running down to the ground live. */
export const PIT_BOARD_BOTTOM = -38;

/**
 * What a pit board says: its own text (up to 4 characters), or a position
 * from P1 to P9 picked by `pick` (0…1).
 */
export function pitBoardText(text, pick = 0) {
  const own = String(text || "").trim().toUpperCase().slice(0, 4);
  return own || `P${1 + Math.min(8, Math.floor(pick * 9))}`;
}

/** 36 × 30, a black pit board in a steel frame, with a clamp for its post. */
export function drawPitBoard({ pixelRect }) {
  const { left, top, width, height } = PIT_BOARD;
  pixelRect(left, top, width, height, STEEL.mid, 2);
  pixelRect(left, top, 2, height, STEEL.dark, 2);
  pixelRect(left + width - 2, top, 2, height, STEEL.light, 2);
  pixelRect(left, top, width, 2, STEEL.light, 2);
  pixelRect(left + 2, top + 2, width - 4, height - 4, INK, 2);
  pixelRect(left + 2, top + 2, width - 4, 2, RUBBER.dark, 2);
  // Clamp holding the board to its post.
  pixelRect(-4, PIT_BOARD_BOTTOM, 8, 4, STEEL.base, 2);
  pixelRect(-4, PIT_BOARD_BOTTOM, 2, 4, STEEL.dark, 2);
}

// -------------------------------------------------------------- petrol can

/** 24 × 36, a red jerry can with a triple handle and a steel cap. */
export function drawPetrolCan(tools) {
  const { pixelRect, pixelPath } = tools;
  const c = RED;
  pixelRect(-10, -28, 20, 28, c.base, 2);
  pixelRect(-12, -26, 24, 24, c.base, 2);
  pixelRect(-12, -26, 2, 24, c.dark, 2);
  pixelRect(-10, -28, 2, 2, c.dark, 2);
  pixelRect(10, -26, 2, 20, c.light, 2);
  pixelRect(-10, -2, 20, 2, c.dark, 2);
  // The pressed X on its side.
  pixelRect(-8, -24, 16, 2, c.light, 2);
  pixelPath([[-6, -20], [6, -6]], c.dark, 1, 2);
  pixelPath([[6, -20], [-6, -6]], c.dark, 1, 2);
  // Handle.
  pixelRect(-10, -36, 14, 2, c.light, 2);
  for (const hx of [-10, -4, 2]) pixelRect(hx, -34, 2, 6, hx === -10 ? c.dark : c.base, 2);
  // Spout cap.
  pixelRect(6, -34, 6, 6, STEEL.base, 2);
  pixelRect(6, -34, 2, 6, STEEL.dark, 2);
  pixelRect(10, -34, 2, 4, STEEL.light, 2);
}

// ------------------------------------------------------------------ marshal

/** The marshals: the start one waves green, the finish one the checkered flag. */
export const MARSHALS = {
  "marshal-start": {
    flag: "green",
    look: { shirt: { dark: INK, base: RUBBER.dark, light: RUBBER.base }, legs: DENIM, skin: SKIN.light, hair: WOOD.dark, hat: ORANGE, vest: true },
  },
  "marshal-finish": {
    flag: "checkered",
    look: { shirt: { dark: INK, base: RUBBER.dark, light: RUBBER.base }, legs: KHAKI, skin: SKIN.tan, hair: INK, hat: ORANGE, vest: true },
  },
};
/** How close the rider must be for a marshal to wave. */
export const MARSHAL_WAVE = { x: 260, y: 200 };
// The flag pole in each hold: the hand, the pole's tip and which way the
// cloth flies from it.
const MARSHAL_HOLDS = {
  rest: { hand: [8, -20], tip: [10, -56] },
  up: { hand: [8, -40], tip: [8, -74] },
  right: { hand: [10, -38], tip: [28, -66] },
  left: { hand: [4, -40], tip: [-14, -68] },
};

/**
 * How a marshal at (x, y) holds the flag: `hold` is "rest" (at their side),
 * "up", "left" or "right", and `fly` the side the cloth streams out to (-1,
 * 1, or 0 to hang). They wave while the rider is near; at time 0 they hold
 * it up without moving.
 */
export function marshalFlag(scene, x, y, phase = 0) {
  const near =
    Number.isFinite(scene.riderX) &&
    Number.isFinite(scene.riderY) &&
    Math.abs(scene.riderX - x) < MARSHAL_WAVE.x &&
    Math.abs(scene.riderY - y) < MARSHAL_WAVE.y;
  if (!near) return { hold: "rest", fly: 0 };
  if (!scene.time) return { hold: "up", fly: -1 };
  const angle = scene.time * 8 + phase * Math.PI * 2;
  const swing = Math.sin(angle);
  // The cloth trails behind the way the pole is moving.
  const fly = Math.cos(angle) > 0 ? -1 : 1;
  return { hold: swing > 0.45 ? "right" : swing < -0.45 ? "left" : "up", fly };
}

// A flag's cloth, 10 columns by 6 rows of 2-unit cells, streaming out to
// `side` from (x, y), each column lifted by `wave(column)`.
function drawCloth({ pixelRect }, x, y, side, columns, rows, pattern, wave) {
  for (let column = 0; column < columns; column++) {
    const cx = side < 0 ? x - (column + 1) * 2 : x + column * 2;
    const cy = y + wave(column);
    for (let row = 0; row < rows; row++)
      pixelRect(cx, cy + row * 2, 2, 2, pattern(column, row, rows), 2);
  }
}

const FLAG_PATTERNS = {
  green: (column, row, rows) =>
    row === 0 ? FLAG_GREEN.light : row === rows - 1 ? FLAG_GREEN.dark : FLAG_GREEN.base,
  checkered: (column, row) => ((column >> 1) + (row >> 1)) % 2 ? INK : WHITE.light,
};

/**
 * A marshal and their flag. `flag` is "green" or "checkered", `wave` comes
 * from marshalFlag, `gaze` is where they look (see drawPerson), and the
 * person's feet are at (0, 0).
 */
export function drawMarshal(tools, type, wave, time = 0, gaze = { x: 1, y: 0 }) {
  const { pixelPath, pixelRect } = tools;
  const marshal = MARSHALS[type];
  const { look } = marshal;
  drawPerson(tools, look, "hold", gaze);
  const { hand, tip } = MARSHAL_HOLDS[wave.hold];
  // Arm from the shoulder to the hand, then the pole.
  pixelPath([[6, -34], hand], look.shirt.base, 1, 2);
  pixelPath([hand, tip], WOOD.tip, 1, 2);
  pixelRect(hand[0], hand[1], 2, 2, look.skin.base, 2);
  const pattern = FLAG_PATTERNS[marshal.flag];
  if (!wave.fly) {
    // Hanging from the tip.
    drawCloth(tools, tip[0] + 2, tip[1], 1, 5, 8, pattern, (column) => column * 2);
    return;
  }
  const flutter = (column) =>
    time ? snap(Math.sin(time * 14 - column * 0.9) * Math.min(column, 5) * 0.5) : 0;
  drawCloth(tools, tip[0] + (wave.fly < 0 ? 0 : 2), tip[1], wave.fly, 10, 6, pattern, flutter);
}

// ------------------------------------------------------------- camera tower

/** Where the tower's legs stand, and the deck the camera crew stands on. */
export const CAMERA_TOWER_LEGS = [-20, 16];
export const CAMERA_TOWER_DECK = -100;
/** Where the tower's sprite ends and the live legs take over. */
export const CAMERA_TOWER_BODY_BOTTOM = -16;
/** The camera's pan head, and its red tally light (centre). */
export const CAMERA_HEAD = { x: 10, y: -114 };
export const CAMERA_TALLY = { x: 10, y: -131 };
/** Where the camera crew looks from: the camera's lens. */
export const CAMERA_EYE = { x: CAMERA_HEAD.x, y: CAMERA_HEAD.y - 8 };
const CAMERA_OPERATOR = { shirt: BLUE, legs: KHAKI, skin: SKIN.light, hair: WOOD.dark, hat: { dark: INK, base: RUBBER.dark } };

/**
 * A scaffold camera tower: braced legs and the deck. The legs below
 * CAMERA_TOWER_BODY_BOTTOM, the crew (drawCameraCrew) and the railing in
 * front of them (drawCameraRail) are drawn live.
 */
export function drawCameraTower(tools) {
  const { pixelRect, pixelPath } = tools;
  const [left, right] = CAMERA_TOWER_LEGS;
  const deck = CAMERA_TOWER_DECK;
  const bottom = CAMERA_TOWER_BODY_BOTTOM;
  // Braces, zigzagging between the legs.
  for (let y = deck + 6, flip = 0; y < bottom; y += 26, flip ^= 1) {
    const end = Math.min(bottom, y + 26);
    pixelPath([[flip ? right : left + 4, y], [flip ? left + 4 : right, end]], STEEL.base, 1, 2);
    pixelRect(left, end - 2, right - left + 4, 2, STEEL.dark, 2);
  }
  // Legs, down to where the live part takes over.
  for (const lx of [left, right]) {
    const shaded = lx === left;
    pixelRect(lx, deck, 4, bottom - deck, shaded ? STEEL.base : STEEL.mid, 2);
    pixelRect(lx + (shaded ? 0 : 2), deck, 2, bottom - deck, shaded ? STEEL.dark : STEEL.light, 2);
  }
  // Deck, lit on top.
  pixelRect(-28, deck, 56, 6, WOOD.light, 2);
  pixelRect(-28, deck, 56, 2, WOOD.tip, 2);
  pixelRect(-28, deck + 4, 56, 2, WOOD.dark, 2);
  pixelRect(-28, deck, 2, 6, WOOD.base, 2);
}

/**
 * The camera crew on the deck, drawn live: the operator beside the camera,
 * the tripod and the camera, which point where `gaze` says (see drawPerson
 * and drawCamera). `tally` lights the camera's tally light.
 * @param {any} tools
 * @param {{ x: number, y: number }} gaze
 * @param {boolean} [tally]
 */
export function drawCameraCrew(tools, gaze, tally = true) {
  const { pixelRect, pixelPath } = tools;
  const deck = CAMERA_TOWER_DECK;
  drawPersonAt({ pixelRect }, -8, deck, CAMERA_OPERATOR, gaze);
  // Tripod, its feet on the deck.
  const { x: hx, y: hy } = CAMERA_HEAD;
  pixelPath([[hx, hy], [hx - 8, deck - 2]], RUBBER.base, 1, 2);
  pixelPath([[hx, hy], [hx + 8, deck - 2]], RUBBER.light, 1, 2);
  pixelRect(hx, hy, 2, deck - hy, RUBBER.dark, 2);
  drawCamera(tools, gaze.x, tally, gaze.y);
}

/** The railing across the front of the camera tower's deck, in front of the crew. */
export function drawCameraRail({ pixelRect }) {
  const deck = CAMERA_TOWER_DECK;
  for (const px of [-28, 24]) {
    pixelRect(px, deck - 20, 2, 20, STEEL.base, 2);
    pixelRect(px + 2, deck - 20, 2, 20, STEEL.light, 2);
  }
  pixelRect(-28, deck - 22, 56, 2, STEEL.light, 2);
  pixelRect(-28, deck - 20, 56, 2, STEEL.base, 2);
  pixelRect(-28, deck - 10, 56, 2, STEEL.base, 2);
}

// A person stood at (x, y) inside another sprite.
function drawPersonAt({ pixelRect }, x, y, look, gaze) {
  drawPerson({ pixelRect: (px, py, w, h, color, p) => pixelRect(px + x, py + y, w, h, color, p) }, look, "idle", gaze);
}

/**
 * The TV camera on its pan head, drawn live at the head so it can follow the
 * rider: `aim` 1 points it right, -1 left and 0 straight out at the viewer,
 * and `tilt` -1 tips its lens up and 1 down. A little play triangle on its
 * side winks at the replays; `tally` lights the red tally light.
 */
export function drawCamera(tools, aim, tally = true, tilt = 0) {
  const { pixelRect, drawPixelDisc } = tools;
  const { x, y } = CAMERA_HEAD;
  const top = y - 14;
  const tip = tilt * 2;
  if (!aim) {
    pixelRect(x - 8, top, 18, 12, RUBBER.base, 2);
    pixelRect(x - 8, top, 2, 12, RUBBER.dark, 2);
    pixelRect(x + 8, top, 2, 12, RUBBER.light, 2);
    drawPixelDisc(x, top + 6 + tip, 4, INK, 2);
    pixelRect(x, top + 4 + tip, 2, 2, BLUE.light, 2);
  } else {
    const side = (dx, w) => (aim > 0 ? x + dx : x - dx - w);
    pixelRect(side(-10, 20), top, 20, 12, RUBBER.base, 2);
    pixelRect(side(-10, 20), top + 10, 20, 2, RUBBER.dark, 2);
    pixelRect(side(-10, 20), top, 20, 2, RUBBER.light, 2);
    // Lens hood out front, viewfinder at the back, tipped opposite ways.
    pixelRect(side(10, 6), top + 2 + tip, 6, 8, INK, 2);
    pixelRect(side(14, 2), top + 4 + tip, 2, 4, BLUE.light, 2);
    pixelRect(side(-14, 4), top + 2 - tip, 4, 6, RUBBER.dark, 2);
    // Play triangle sticker.
    const px = side(-4, 2);
    pixelRect(px, top + 4, 2, 6, WHITE.light, 2);
    pixelRect(aim > 0 ? px + 2 : px - 2, top + 6, 2, 2, WHITE.light, 2);
  }
  // Handle, with the tally light on top.
  pixelRect(x - 4, top - 2, 10, 2, RUBBER.dark, 2);
  pixelRect(CAMERA_TALLY.x - 2, CAMERA_TALLY.y - 1, 4, 2, tally ? RED.light : RED.dark, 2);
}

/** Whether the camera's tally light is on: it blinks while recording, steady at time 0. */
export const cameraTallyOn = (time) => !time || time % 1.2 < 0.8;

// ------------------------------------------------------------ warning signs

/** Where each warning and arrow sign's board ends and its post begins. */
export const SIGN_POST_TOP = -24;

const SKULL = [
  "..######..",
  ".########.",
  "##########",
  "#oo####oo#",
  "#oo####oo#",
  "####oo####",
  ".########.",
  "..#.##.#..",
  "..######..",
];
const BONES = [
  "#......#",
  ".#....#.",
  "..#..#..",
  "...##...",
  "..#..#..",
  ".#....#.",
  "#......#",
];

/** A red-bordered warning triangle with a "!", 36 wide. */
export function drawWarningTriangle(tools) {
  const { pixelRect } = tools;
  const rows = 16;
  const bottom = SIGN_POST_TOP - 2;
  for (let row = 0; row < rows; row++) {
    const y = bottom - (rows - row) * 2;
    const half = 2 + 2 * Math.round((row * 8) / (rows - 1));
    pixelRect(-half, y, half * 2, 2, RED.base, 2);
    pixelRect(-half, y, 2, 2, RED.dark, 2);
    pixelRect(half - 2, y, 2, 2, RED.light, 2);
    const inner = half - 6;
    if (row >= 5 && row < rows - 2 && inner > 0) pixelRect(-inner, y, inner * 2, 2, WHITE.light, 2);
  }
  pixelRect(-2, bottom - 22, 4, 10, INK, 2);
  pixelRect(-2, bottom - 10, 4, 2, INK, 2);
  // Bracket onto the post.
  pixelRect(-2, bottom, 4, 2, STEEL.dark, 2);
}

/** A yellow diamond with a big "!", 32 across. */
export function drawWarningBang({ pixelRect }) {
  const rows = 16;
  const bottom = SIGN_POST_TOP;
  for (let row = 0; row < rows; row++) {
    const y = bottom - (rows - row) * 2;
    const half = 2 + 2 * Math.min(row, rows - 1 - row);
    pixelRect(-half, y, half * 2, 2, INK, 2);
    const inner = half - 4;
    if (inner > 0) {
      pixelRect(-inner, y, inner * 2, 2, YELLOW.base, 2);
      pixelRect(-inner, y, 2, 2, YELLOW.dark, 2);
      pixelRect(inner - 2, y, 2, 2, YELLOW.light, 2);
    }
  }
  pixelRect(-2, bottom - 26, 4, 12, INK, 2);
  pixelRect(-2, bottom - 12, 4, 4, INK, 2);
}

/** A hand-painted wooden board with a white skull and crossbones, 32 square. */
export function drawWarningSkull(tools) {
  const { pixelRect } = tools;
  const top = SIGN_POST_TOP - 32;
  // Three planks, lit from the right.
  for (let plank = 0; plank < 3; plank++) {
    const y = top + plank * 10 + 2;
    pixelRect(-16, y, 32, 10, WOOD.light, 2);
    pixelRect(-16, y, 32, 2, WOOD.tip, 2);
    pixelRect(-16, y + 8, 32, 2, WOOD.base, 2);
  }
  pixelRect(-16, top + 2, 2, 30, WOOD.dark, 2);
  pixelRect(14, top + 2, 2, 30, WOOD.cut, 2);
  drawCells(tools, BONES, -8, top + 14, { "#": WHITE.base });
  drawCells(tools, SKULL, -10, top + 4, { "#": WHITE.light, o: INK });
  // Nails.
  pixelRect(-12, top + 4, 2, 2, STEEL.dark, 2);
  pixelRect(10, top + 4, 2, 2, STEEL.dark, 2);
}

/** A black chevron board, three yellow chevrons pointing right, 48 wide. */
export function drawArrowSign({ pixelRect }) {
  const top = SIGN_POST_TOP - 24;
  pixelRect(-24, top, 48, 24, INK, 2);
  pixelRect(-24, top, 48, 2, RUBBER.base, 2);
  pixelRect(22, top, 2, 24, RUBBER.light, 2);
  pixelRect(-24, top + 22, 48, 2, RUBBER.dark, 2);
  for (let chevron = 0; chevron < 3; chevron++)
    for (let row = 0; row < 8; row++) {
      const offset = row < 4 ? row : 7 - row;
      const x = -20 + (chevron * 7 + offset) * 2;
      pixelRect(x, top + 4 + row * 2, 6, 2, row === 0 || row === 4 ? YELLOW.light : YELLOW.base, 2);
    }
}

/**
 * The post under a warning or arrow sign, running down to the ground live:
 * steel for the road-style signs, wood for the painted ones.
 */
export function drawSignPost({ pixelRect }, wooden, groundOffset) {
  const shade = wooden ? WOOD.base : STEEL.dark;
  const lit = wooden ? WOOD.tip : STEEL.light;
  for (const px of [-2, 0]) {
    const color = px < 0 ? shade : lit;
    const ground = snap(groundOffset(px + 1));
    if (ground > SIGN_POST_TOP) pixelRect(px, SIGN_POST_TOP, 2, ground - SIGN_POST_TOP, color, 2);
  }
}

// ------------------------------------------------------------- halfway flag

/** The halfway flag's beacon (centre), the cloth's top left and its size in cells. */
export const HALFWAY_BEACON = { x: 0, y: -116 };
export const HALFWAY_CLOTH = { x: 2, y: -108, columns: 16, rows: 10 };
/** The timing board under the flag, where drawing.js prints the split. */
export const HALFWAY_BOARD = { left: 4, top: -82, width: 54, height: 16 };
/** How close the rider must pass, above or below the flag, for it to count. */
export const HALFWAY_REACH = 240;
/** Seconds the flash lasts when the flag lights up. */
export const HALFWAY_FLASH = 0.6;

/**
 * A split as the HUD timer shows it, m:ss.t, or dashes before the flag is
 * passed.
 */
export function splitText(seconds) {
  if (!Number.isFinite(seconds)) return "-:--.-";
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 0.00001);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}

/**
 * The ring that flashes out from the beacon `age` seconds after the flag is
 * passed: { radius, alpha }, or null once it has faded.
 */
export function halfwayFlash(age) {
  if (!(age >= 0) || age >= HALFWAY_FLASH) return null;
  const t = age / HALFWAY_FLASH;
  return { radius: snap(6 + t * 22), alpha: 1 - t };
}

/**
 * The halfway flag: a steel pole with a beacon on top, a cloth that is half
 * checkered (half way to the checkered flag), and a timing board. It is pale
 * until `lit`, when the rider has passed it. The pole runs down to the ground
 * live; the cloth flies out `downwind` (-1 left, 1 right), drooping in still
 * air and rippling harder the stronger the `wind`.
 */
export function drawHalfwayFlag(tools, lit, groundOffset, time = 0, wind = 0, phase = 0, downwind = 1) {
  const { pixelRect } = tools;
  const ground = snap(groundOffset(0));
  const poleTop = HALFWAY_BEACON.y + 4;
  if (ground > poleTop) {
    pixelRect(-2, poleTop, 2, ground - poleTop, STEEL.dark, 2);
    pixelRect(0, poleTop, 2, ground - poleTop, STEEL.light, 2);
  }
  // Beacon: a steel cap over a bulb that lights once passed.
  const { x: bx, y: by } = HALFWAY_BEACON;
  pixelRect(bx - 4, by - 6, 8, 2, STEEL.base, 2);
  pixelRect(bx - 4, by - 4, 8, 6, lit ? YELLOW.light : STEEL.mid, 2);
  pixelRect(bx - 4, by - 4, 2, 6, lit ? YELLOW.base : STEEL.dark, 2);
  pixelRect(bx, by - 2, 2, 2, lit ? WHITE.light : STEEL.light, 2);
  // Cloth, rippling out from the pole.
  const { x, y, columns, rows } = HALFWAY_CLOTH;
  const checks = lit ? [INK, WHITE.light] : [STEEL.base, WHITE.base];
  const half = lit ? YELLOW : { dark: WHITE.dark, base: WHITE.base, light: WHITE.light };
  // It droops less than a loose flag: the board below stays clear of it.
  const droop = (column) => snap(column * 0.8 * (1 - Math.min(1, Math.max(0, wind))) ** 2);
  const ripple = (column) =>
    droop(column) +
    (time ? snap(Math.sin(time * (2.5 + wind * 6) - column * 0.7 + phase * Math.PI * 2) * Math.min(column, 6) * (0.15 + wind * 0.55)) : 0);
  drawCloth(tools, downwind < 0 ? -x : x, y, downwind < 0 ? -1 : 1, columns, rows, (column, row) => {
    if (column < columns / 2) return checks[((column >> 1) + (row >> 1)) % 2];
    return row === 0 ? half.light : row === rows - 1 ? half.dark : half.base;
  }, ripple);
  // Timing board on a bracket.
  const { left, top, width, height } = HALFWAY_BOARD;
  pixelRect(0, top + 4, left, 2, STEEL.base, 2);
  pixelRect(left, top, width, height, STEEL.mid, 2);
  pixelRect(left, top, 2, height, STEEL.dark, 2);
  pixelRect(left + width - 2, top, 2, height, STEEL.light, 2);
  pixelRect(left + 2, top + 2, width - 4, height - 4, INK, 2);
}

/** The colour of the split on the timing board: amber once lit, dim before. */
export const halfwayTextColor = (lit) => (lit ? YELLOW.light : RUBBER.light);
/** The beacon's light. */
export const HALFWAY_LIGHT = { glow: YELLOW.light, core: WHITE.light };

// -------------------------------------------------------- tutorial drawings

/** Local bounds of each tutorial drawing, centred on its anchor in the rock. */
export const TUTORIAL_BOUNDS = [-62, -38, 62, 38];
const SPRAY = {
  cloud: BLUE.dark, outline: INK,
  white: { fill: WHITE.base, light: WHITE.light, shade: WHITE.dark },
  yellow: { fill: YELLOW.base, light: YELLOW.light, shade: YELLOW.dark },
  red: { fill: RED.base, light: RED.light, shade: RED.dark },
  tyre: { fill: RUBBER.light, light: WHITE.dark, shade: RUBBER.base },
  ledge: { fill: BLUE.base, light: BLUE.light, shade: BLUE.dark },
};

// Shapes are tests of whether a point (in drawing units) lies inside them.
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const annulus = (cx, cy, inner, outer) => (x, y) => {
  const d = (x - cx) ** 2 + (y - cy) ** 2;
  return d >= inner * inner && d <= outer * outer;
};
// A stroke of width w from (ax, ay) to (bx, by), with round ends.
const stroke = (ax, ay, bx, by, w) => (x, y) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2 <= (w * w) / 4;
};
const polygon = (points) => (x, y) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const any = (...shapes) => (x, y) => shapes.some((shape) => shape(x, y));
const without = (shape, hole) => (x, y) => shape(x, y) && !hole(x, y);

// The 2-unit cells of the drawing that a shape covers, as a set of "column,row".
function cells(shape) {
  const [left, top, right, bottom] = TUTORIAL_BOUNDS;
  const set = new Set();
  for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2) if (shape(x + 1, y + 1)) set.add(`${x},${y}`);
  return set;
}
const has = (set, x, y) => set.has(`${x},${y}`);

// A sprayed piece: layers of shapes, each filled in its colour (lit along the
// top, shaded along the bottom) inside an ink outline. The whole piece first
// drops a block of ink down and to the left, like the graffiti's letters.
function sprayPiece({ pixelRect }, layers) {
  const masks = layers.map((layer) => ({ ...layer, cells: cells(layer.shape) }));
  const all = new Set(masks.flatMap((mask) => [...mask.cells]));
  for (const key of all) {
    const [x, y] = key.split(",").map(Number);
    pixelRect(x - 4, y + 2, 6, 4, SPRAY.outline, 2);
  }
  for (const { cells: set, paint } of masks) {
    for (const key of set) {
      const [x, y] = key.split(",").map(Number);
      pixelRect(x - 2, y - 2, 6, 6, SPRAY.outline, 2);
    }
    for (const key of set) {
      const [x, y] = key.split(",").map(Number);
      const color = !has(set, x, y - 2) || !has(set, x - 2, y) ? paint.light : !has(set, x, y + 2) || !has(set, x + 2, y) ? paint.shade : paint.fill;
      pixelRect(x, y, 2, 2, color, 2);
    }
  }
}

// A rough hash of a cell, 0…1, for the overspray.
const speckle = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997 / 997;

// The sprayed cloud behind a drawing: a lighter rim, overspray round it and a
// few drips running off the bottom, each ending in a bead.
function sprayCloud(tools) {
  const { pixelRect } = tools;
  const cloud = any(...[[-38, -4, 25], [-10, -12, 26], [20, -6, 25], [42, 4, 17], [-26, 12, 21], [12, 14, 19], [-50, 8, 12]].map(([x, y, r]) => disc(x, y, r)));
  const inner = cells(cloud);
  const [left, top, right, bottom] = TUTORIAL_BOUNDS;
  for (let y = top; y < bottom; y += 2)
    for (let x = left; x < right; x += 2) {
      if (has(inner, x, y)) {
        pixelRect(x, y, 2, 2, SPRAY.cloud, 2);
      } else if (cloud(x + 1, y + 1 - 4) || cloud(x + 1 - 4, y + 1) || cloud(x + 1 + 4, y + 1) || cloud(x + 1, y + 1 + 4)) {
        if (speckle(x, y) < 0.25) pixelRect(x, y, 2, 2, SPRAY.cloud, 2);
      } else if (cloud(x + 1, y + 1 - 8) || cloud(x + 1 + 8, y + 1)) {
        if (speckle(x, y) < 0.06) pixelRect(x, y, 2, 2, SPRAY.cloud, 2);
      }
    }
  for (const [x, length] of [[-42, 2], [-18, 8], [10, 0], [34, 4]]) {
    const start = [...inner].map((key) => key.split(",").map(Number)).filter(([cx]) => cx === x).reduce((low, [, cy]) => Math.max(low, cy), -Infinity);
    pixelRect(x, start, 2, 4 + length, SPRAY.cloud, 2);
    pixelRect(x - 2, start + 4 + length, 4, 2, SPRAY.cloud, 2);
  }
}

// Where a bike's parts are, facing right with the rear axle at the origin and
// y down, before it is placed: `lean` (−1…1) moves the rider back or forward.
function bikeParts(lean) {
  const hip = [9 - lean * 2, -17];
  const shoulder = [15 - lean * 9, -29 + Math.abs(lean) * 2];
  const head = [shoulder[0] + 3 - lean * 3, shoulder[1] - 7];
  const bars = [23, -20];
  const elbow = [(shoulder[0] + bars[0]) / 2 + 1, (shoulder[1] + bars[1]) / 2 + 4];
  return {
    wheels: [
      [annulus(0, 0, 6, 9.5), disc(0, 0, 2)],
      [annulus(30, 0, 6, 9.5), disc(30, 0, 2)],
    ],
    frame: [
      stroke(0, 0, 12, -6, 4),
      polygon([[-10, -15], [6, -17], [8, -12], [-2, -11]]),
      stroke(2, -15, 14, -16, 4.5),
      polygon([[11, -18], [23, -20], [26, -13], [14, -9]]),
      polygon([[9, -11], [20, -12], [20, -2], [11, -2]]),
      stroke(30, 0, 23, -19, 4),
      stroke(25, -13, 36, -12, 3),
      stroke(21, -21, 26, -20, 2.5),
    ],
    rider: [
      stroke(...hip, 19, -14, 5),
      stroke(19, -14, 15, -5, 4),
      stroke(13, -5, 18, -5, 3),
      stroke(...hip, ...shoulder, 7),
      stroke(...shoulder, ...elbow, 3.5),
      stroke(...elbow, ...bars, 3),
    ],
    head,
    bars,
  };
}

// A stencilled bike and rider, its rear axle at (x, y), turned by `angle`
// (radians, clockwise), `scale` times its own size and facing right, or left
// when `facing` is −1: a red bike with a white rider in a red helmet. Returns
// the layers to spray and where its lamp is.
function bikeLayers(x, y, angle, { lean = 0, facing = 1, scale = 1.1 } = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  // A shape in the bike's own units, tested at a point of the drawing.
  const place = (shape) => (px, py) => {
    const dx = px - x, dy = py - y;
    return shape(((dx * c + dy * s) / scale) * facing, (-dx * s + dy * c) / scale);
  };
  const toDrawing = ([bx, by]) => [x + (bx * facing * c - by * s) * scale, y + (bx * facing * s + by * c) * scale];
  const parts = bikeParts(lean);
  const [hx, hy] = parts.head;
  const visor = polygon([[hx + 1, hy - 1], [hx + 6, hy - 1], [hx + 6, hy + 2], [hx + 1, hy + 2]]);
  return {
    layers: [
      { shape: place(any(...parts.frame)), paint: SPRAY.red },
      { shape: place(any(...parts.wheels.flat())), paint: SPRAY.tyre },
      { shape: place(any(...parts.rider)), paint: SPRAY.white },
      { shape: place(without(disc(hx, hy, 5.5), visor)), paint: SPRAY.red },
    ],
    lamp: toDrawing([parts.bars[0] + 4, parts.bars[1] + 4]),
  };
}

// A band of width w round (cx, cy) at radius r, from angle `from` to `to`
// (radians, clockwise).
function arcBand(cx, cy, r, from, to, width) {
  const span = to - from, dir = Math.sign(span) || 1;
  return (x, y) => {
    if (Math.abs(Math.hypot(x - cx, y - cy) - r) > width / 2) return false;
    const turn = ((((Math.atan2(y - cy, x - cx) - from) * dir) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return turn <= Math.abs(span);
  };
}
// An arrowhead for a shaft of width w ending at (x, y) and heading (dx, dy).
function arrowHead(x, y, dx, dy, width) {
  const w = width * 1.3;
  return polygon([[x - dx * 2 - dy * w, y - dy * 2 + dx * w], [x + dx * width * 1.6, y + dy * width * 1.6], [x - dx * 2 + dy * w, y - dy * 2 - dx * w]]);
}
// A thick curved arrow round (cx, cy), with its head at `to`.
function arrowShape(cx, cy, r, from, to, width = 5) {
  const dir = Math.sign(to - from) || 1;
  return any(
    arcBand(cx, cy, r, from, to, width),
    arrowHead(cx + Math.cos(to) * r, cy + Math.sin(to) * r, -Math.sin(to) * dir, Math.cos(to) * dir, width),
  );
}

// A key cap with a symbol on it, `width` wide and 16 high, top left at (x, y).
function keyCap(tools, x, y, symbol, width = 16) {
  const { pixelRect } = tools;
  pixelRect(x - 2, y - 2, width + 4, 22, SPRAY.outline, 2);
  pixelRect(x - 4, y + 2, 2, 18, SPRAY.outline, 2);
  pixelRect(x, y + 14, width, 4, WHITE.dark, 2);
  pixelRect(x, y, width, 14, WHITE.base, 2);
  pixelRect(x, y, width, 2, WHITE.light, 2);
  pixelRect(x, y, 2, 14, WHITE.light, 2);
  drawCells(tools, symbol, x + Math.round((width - symbol[0].length * 2) / 4) * 2, y + 2, { "#": INK });
}
const KEY_LEFT = ["..#..", ".#...", "#####", ".#...", "..#.."];
const KEY_RIGHT = ["..#..", "...#.", "#####", "...#.", "..#.."];
const KEY_UP = ["..#..", ".###.", "#.#.#", "..#..", "..#.."];
const KEY_L = ["#....", "#....", "#....", "#....", "#####"];
const KEY_R = ["####.", "#...#", "####.", "#..#.", "#...#"];
const KEY_SPACE = ["#.........#", "#.........#", "###########"];
// A plus between two keys.
const KEY_PLUS = ["..#..", "..#..", "#####", "..#..", "..#.."];

/** Lean back: a bike up on its back wheel, an arrow tipping it back, and ←. */
export function drawTutorialLean(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-36, 24, -0.5, { lean: 1 });
  sprayPiece(tools, [{ shape: arrowShape(-36, 24, 54, -0.2, -1.0), paint: SPRAY.yellow }, ...bike.layers]);
  keyCap(tools, 34, -6, KEY_LEFT);
}

/** Lean forward: a bike nosing down off a ledge, an arrow tipping it forward, and →. */
export function drawTutorialLeanForward(tools) {
  sprayCloud(tools);
  const ledge = polygon([[-62, 10], [-34, 10], [-34, 32], [-62, 32]]);
  const bike = bikeLayers(-46, 8, 0.55, { lean: -1 });
  sprayPiece(tools, [
    { shape: ledge, paint: SPRAY.ledge },
    { shape: arrowShape(-16, 10, 44, -1.95, -0.55), paint: SPRAY.yellow },
    ...bike.layers,
  ]);
  keyCap(tools, 36, 6, KEY_RIGHT);
}

/** Rotate: a bike spinning in mid-air, a looping arrow round it, and ←. */
export function drawTutorialRotate(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-18, 16, -0.8, { lean: 0.6, scale: 0.8 });
  sprayPiece(tools, [{ shape: arrowShape(-18, 0, 33, 0.9, 0.9 - Math.PI * 1.6), paint: SPRAY.yellow }, ...bike.layers]);
  keyCap(tools, 34, 4, KEY_LEFT);
}

/** Turn around: a bike facing back the way it came, a U-turn beside it, and Space. */
export function drawTutorialFlip(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-12, 24, 0, { facing: -1, scale: 1 });
  const uTurn = any(
    stroke(4, -28, 30, -28, 5),
    arcBand(30, -18, 10, -Math.PI / 2, Math.PI / 2, 5),
    stroke(30, -8, 12, -8, 5),
    arrowHead(12, -8, -1, 0, 5),
  );
  sprayPiece(tools, [{ shape: uTurn, paint: SPRAY.yellow }, ...bike.layers]);
  keyCap(tools, 12, 6, KEY_SPACE, 30);
}

/** Headlight: a bike throwing a beam ahead of it, and L. */
export function drawTutorialLight(tools) {
  const { pixelRect } = tools;
  sprayCloud(tools);
  const bike = bikeLayers(-50, 22, 0);
  const [lx, ly] = bike.lamp;
  const beam = (reach, spread) => polygon([[lx, ly - 2], [lx + reach, ly - spread], [lx + reach, ly + spread * 0.9], [lx, ly + 2]]);
  sprayPiece(tools, bike.layers);
  // The beam, brightest at the lamp and sprayed thinner further out.
  const [left, top, right, bottom] = TUTORIAL_BOUNDS;
  const near = beam(20, 9), mid = beam(38, 16), far = beam(58, 24);
  for (let y = top; y < bottom; y += 2)
    for (let x = left; x < right; x += 2) {
      if (near(x + 1, y + 1)) pixelRect(x, y, 2, 2, YELLOW.light, 2);
      else if (mid(x + 1, y + 1)) pixelRect(x, y, 2, 2, YELLOW.base, 2);
      else if (far(x + 1, y + 1) && (x + y) % 4 === 0) pixelRect(x, y, 2, 2, YELLOW.dark, 2);
    }
  pixelRect(snap(lx) - 2, snap(ly) - 2, 4, 4, WHITE.light, 2);
  keyCap(tools, 38, -32, KEY_L);
}

/** Restart: a bike upside down with its rider's helmet in the dirt, a circling arrow, and R. */
export function drawTutorialRestart(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-36, -16, 1.9, { lean: -1, scale: 1.1 });
  const star = (cx, cy, r) => any(stroke(cx - r, cy, cx + r, cy, 2.5), stroke(cx, cy - r, cx, cy + r, 2.5));
  sprayPiece(tools, [
    { shape: stroke(-60, 32, 8, 32, 3), paint: SPRAY.white },
    { shape: any(star(2, 18, 5), star(-30, 24, 3), star(-4, 4, 3)), paint: SPRAY.yellow },
    ...bike.layers,
  ]);
  sprayPiece(tools, [{ shape: arrowShape(36, -14, 12, -0.6, -0.6 + Math.PI * 1.6), paint: SPRAY.yellow }]);
  keyCap(tools, 28, 10, KEY_R);
}

/** Hanging from a ledge: the front wheel hooked over its lip, an arrow up over it, and ↑ + →. */
export function drawTutorialLedge(tools) {
  sprayCloud(tools);
  const ledge = polygon([[-8, -6], [62, -6], [62, 34], [-8, 34]]);
  const bike = bikeLayers(-18, 11, -1.1, { lean: -0.6, scale: 1 });
  sprayPiece(tools, [
    { shape: ledge, paint: SPRAY.ledge },
    { shape: arrowShape(2, -6, 20, Math.PI * 1.1, Math.PI * 1.85), paint: SPRAY.yellow },
    ...bike.layers,
  ]);
  keyCap(tools, 4, 8, KEY_UP);
  drawCells(tools, KEY_PLUS, 26, 14, { "#": WHITE.light });
  keyCap(tools, 40, 8, KEY_RIGHT);
}

const KEY_DOWN = ["..#..", "..#..", "#.#.#", ".###.", "..#.."];

/** Gas: a bike pulling away with speed lines streaming behind it, and ↑. */
export function drawTutorialGas(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-16, 22, -0.12, { lean: -0.4 });
  const lines = any(stroke(-58, -8, -36, -8, 4), stroke(-54, 4, -30, 4, 4), stroke(-60, 16, -40, 16, 4));
  sprayPiece(tools, [{ shape: lines, paint: SPRAY.yellow }, ...bike.layers]);
  keyCap(tools, 38, -30, KEY_UP);
}

/**
 * Brake: a bike pitched onto its front wheel, its rear lifting, with the rider
 * leaning back against it, an arrow tipping it back and ↓ + ←.
 */
export function drawTutorialBrake(tools) {
  sprayCloud(tools);
  const bike = bikeLayers(-28, 12, 0.3, { lean: 1 });
  const skid = stroke(-22, 31, -2, 31, 3);
  const dust = any(disc(17, 28, 5), disc(24, 22, 3.5), disc(14, 19, 2.5));
  sprayPiece(tools, [
    { shape: stroke(-60, 34, 30, 34, 3), paint: SPRAY.white },
    { shape: skid, paint: SPRAY.tyre },
    { shape: dust, paint: SPRAY.white },
    { shape: arrowShape(3, 22, 56, -2.2, -3.0), paint: SPRAY.yellow },
    ...bike.layers,
  ]);
  keyCap(tools, 10, -32, KEY_DOWN);
  drawCells(tools, KEY_PLUS, 30, -26, { "#": WHITE.light });
  keyCap(tools, 42, -32, KEY_LEFT);
}
