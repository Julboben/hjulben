// Cave props. Like every prop they sit on the 2-unit art grid, have no
// outlines, and are lit from the right: shaded on the left and underneath.
// Ceiling props are drawn hanging down from y = 0, which drawing.js moves onto
// the cave ceiling it found above the prop's anchor. Floor props stand on y = 0.
import { STEEL } from "./city-props.js";

// Wrought iron, from the rubber greys.
const IRON = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const WOOD = { dark: "#4d3f2f", base: "#66543f", plank: "#806244", light: "#856d4f", tip: "#aa8a60" };
// Seep water and the glow of cave mushrooms, from the crystal colours.
export const WATER = { dark: "#3f6f78", base: "#568f98", light: "#83d1ce", bright: "#d9ffff" };
const STEM = { shade: "#aeb5a7", base: "#f4e9d1" };
const BAT = { dark: "#3a403d", base: "#4d3f2f", light: "#66543f" };
const ORE = { dark: "#4a524d", base: "#697872", light: "#aeb5a7", gold: "#f1b95d", gem: "#83d1ce" };
export const LANTERN_LIGHT = { glass: "#ffe39a", core: "#fff3be", flame: "#f1b95d" };

const snap = (value) => Math.round(value / 2) * 2;

// ---------------------------------------------------------------------------
// Ceiling props
// ---------------------------------------------------------------------------

const ROOT_STRANDS = [[-10, 0.45], [-6, 0.8], [-2, 0.6], [2, 1], [8, 0.55], [12, 0.35]];

/**
 * Roots poking through a cave roof and hanging down, at most `room` long.
 * `noise(n)` is a fixed 0…1 value per prop, so each clump differs.
 */
export function drawHangingRoots({ pixelRect }, room, noise) {
  // Soil and root crowns where they come through the rock.
  pixelRect(-14, 0, 30, 2, WOOD.dark, 2);
  pixelRect(-10, 2, 24, 2, WOOD.dark, 2);
  pixelRect(4, 0, 8, 2, WOOD.base, 2);
  ROOT_STRANDS.forEach(([sx, share], index) => {
    const length = snap(Math.max(8, Math.min(room, 20 + share * 44 * (0.7 + noise(index) * 0.6))));
    for (let py = 2; py < length; py += 2) {
      const t = py / length;
      const x = sx + (t < 0.35 ? 0 : Math.round(Math.sin(py * 0.15 + index * 1.7)) * 2);
      if (t < 0.35) {
        // Thick near the roof: shaded left, lit right.
        pixelRect(x - 2, py, 2, 2, WOOD.dark, 2);
        pixelRect(x, py, 2, 2, WOOD.light, 2);
      } else {
        pixelRect(x, py, 2, 2, t > 0.85 ? WOOD.tip : WOOD.base, 2);
      }
      // Now and then a rootlet twists off to one side.
      if (py % 12 === 6 && t > 0.3 && t < 0.85)
        pixelRect(x + (index % 2 ? 2 : -2), py + 2, 2, 2, index % 2 ? WOOD.light : WOOD.dark, 2);
    }
  });
}

const STALACTITES = [[-14, 12, 4], [-6, 26, 6], [6, 18, 4], [14, 8, 2]];

/**
 * Rock icicles in the colours of the ceiling they grow from, at most `room`
 * long. The longest carries a bead of water at its tip.
 */
export function drawStalactites({ pixelRect }, colors, room, noise) {
  pixelRect(-18, 0, 36, 2, colors.base, 2);
  pixelRect(-18, 0, 2, 2, colors.dark, 2);
  let longest = null;
  STALACTITES.forEach(([cx, base, half], index) => {
    const length = snap(Math.max(6, Math.min(room, base * (0.8 + noise(index) * 0.4))));
    for (let py = 2; py < length; py += 2) {
      const t = py / length;
      const width = Math.max(2, Math.round(half * (1 - t)) * 2);
      const left = cx - Math.floor(width / 4) * 2;
      pixelRect(left, py, width, 2, colors.base, 2);
      if (width >= 4) {
        pixelRect(left, py, 2, 2, colors.dark, 2);
        pixelRect(left + width - 2, py, 2, 2, colors.light, 2);
      }
    }
    if (!longest || length > longest.length) longest = { cx, length };
  });
  pixelRect(longest.cx, longest.length, 2, 2, WATER.light, 2);
}

/**
 * Water seeping through the roof: a bead swells, lets go, falls one art pixel
 * at a time and splashes into a puddle `drop` below. `time` in seconds; 0
 * holds the bead still. `phase` is a fixed 0…1 value per prop.
 */
export function drawDrip({ pixelRect }, colors, drop, time, phase) {
  // A wet nub on the ceiling.
  pixelRect(-2, 0, 4, 2, colors.base, 2);
  pixelRect(-2, 0, 2, 2, colors.dark, 2);
  // The floor's rim overhangs the surface by 4 units and covers back props.
  const floor = Number.isFinite(drop) ? snap(drop) - 4 : null;
  if (floor !== null) {
    // Puddle on the floor below.
    pixelRect(-8, floor - 2, 16, 2, WATER.base, 2);
    pixelRect(-8, floor - 2, 4, 2, WATER.dark, 2);
    pixelRect(2, floor - 2, 4, 2, WATER.light, 2);
  }
  if (!time) {
    pixelRect(0, 2, 2, 2, WATER.light, 2);
    pixelRect(0, 4, 2, 2, WATER.base, 2);
    return;
  }
  const GRAVITY = 360,
    FORM = 1.2,
    SPLASH = 0.3;
  const fall = Math.sqrt((2 * (floor ?? 200)) / GRAVITY);
  const period = Math.max(2.2 + phase * 1.4, FORM + fall + SPLASH + 0.4);
  const t = (time + phase * period) % period;
  if (t < FORM) {
    // Swelling: one pixel, then two, then three as it stretches.
    const size = 1 + Math.floor((t / FORM) * 3);
    for (let i = 0; i < size; i++)
      pixelRect(0, 2 + i * 2, 2, 2, i === 0 ? WATER.light : WATER.base, 2);
    return;
  }
  const falling = t - FORM;
  if (falling < fall) {
    const y = 4 + snap(0.5 * GRAVITY * falling * falling);
    if (floor !== null && y >= floor - 4) return;
    pixelRect(0, y, 2, 2, WATER.bright, 2);
    pixelRect(0, y + 2, 2, 2, WATER.light, 2);
    return;
  }
  const splash = falling - fall;
  if (floor === null || splash > SPLASH) return;
  const frame = Math.min(2, Math.floor((splash / SPLASH) * 3));
  const spread = [2, 4, 6][frame];
  const lift = [4, 6, 4][frame];
  pixelRect(-spread, floor - lift, 2, 2, WATER.light, 2);
  pixelRect(spread, floor - lift, 2, 2, WATER.bright, 2);
  if (frame === 0) pixelRect(0, floor - 4, 2, 2, WATER.bright, 2);
}

// Lantern body, from its foot at y = 0 up to its ring at y = -22.
export const LANTERN_TOP = -22;
export const LANTERN_CENTRE = -9;

export function drawLanternGlass({ pixelRect }, brightness = 1) {
  pixelRect(-4, -14, 8, 10, LANTERN_LIGHT.glass, 2);
  pixelRect(-2, -12, 4, 6, LANTERN_LIGHT.core, 2);
  pixelRect(0, -8 - brightness * 2, 2, 2 + brightness * 2, LANTERN_LIGHT.flame, 2);
}

/**
 * How far sideways a lantern hanging on a `chain` that long has swung, when
 * the chain is `swing` radians from straight down (see hangingSwing).
 */
export const lanternSway = (chain, swing) => snap(Math.sin(swing) * chain);

/**
 * A miner's lantern; with `chain` > 0 it hangs that far below a hook,
 * swung `swing` radians from straight down.
 */
export function drawLantern(tools, chain = 0, swing = 0) {
  const top = LANTERN_TOP - chain;
  for (let py = top; py < LANTERN_TOP; py += 2)
    tools.pixelRect(lanternSway(py - top, swing) - 2, py, 2, 2, (py / 2) % 2 ? IRON.base : STEEL.mid, 2);
  // The lantern itself hangs straight from the chain's end.
  const dx = lanternSway(chain, swing);
  const pixelRect = (x, ...rest) => tools.pixelRect(x + dx, ...rest);
  // Ring and cap.
  pixelRect(-2, -22, 4, 2, IRON.base, 2);
  pixelRect(-4, -20, 2, 2, IRON.dark, 2);
  pixelRect(2, -20, 2, 2, IRON.light, 2);
  pixelRect(-4, -18, 8, 2, IRON.base, 2);
  pixelRect(-6, -16, 12, 2, IRON.base, 2);
  pixelRect(-6, -16, 2, 2, IRON.dark, 2);
  pixelRect(2, -18, 2, 2, IRON.light, 2);
  pixelRect(2, -16, 4, 2, IRON.light, 2);
  drawLanternGlass({ pixelRect });
  // Frame bars, shaded left and lit right.
  pixelRect(-6, -14, 2, 10, IRON.dark, 2);
  pixelRect(4, -14, 2, 10, IRON.light, 2);
  pixelRect(-6, -10, 12, 2, IRON.base, 2);
  // Foot.
  pixelRect(-6, -4, 12, 2, IRON.base, 2);
  pixelRect(4, -4, 2, 2, IRON.light, 2);
  pixelRect(-4, -2, 8, 2, IRON.dark, 2);
}

// Where each bat in a colony roosts: x, and how far below the roof.
export const BAT_ROOSTS = [[-12, 0], [0, 2], [10, 0]];

/** A bat hanging head down from y = 0; `stretch` opens one wing. */
export function drawBatHanging({ pixelRect }, x, top, stretch = false) {
  pixelRect(x + 2, top, 2, 2, BAT.dark, 2);
  pixelRect(x, top + 2, 6, 8, BAT.base, 2);
  pixelRect(x, top + 2, 2, 8, BAT.dark, 2);
  pixelRect(x + 4, top + 4, 2, 4, BAT.light, 2);
  // Head at the bottom, ears pointing down.
  pixelRect(x, top + 10, 6, 2, BAT.base, 2);
  pixelRect(x, top + 12, 2, 2, BAT.dark, 2);
  pixelRect(x + 4, top + 12, 2, 2, BAT.light, 2);
  if (stretch) {
    pixelRect(x + 6, top + 2, 4, 4, BAT.light, 2);
    pixelRect(x + 8, top + 6, 2, 2, BAT.base, 2);
  }
}

/** A bat in flight, centred on 0, 0. */
export function drawBatFlying({ pixelRect }, wingsUp) {
  pixelRect(-2, -2, 4, 4, BAT.base, 2);
  pixelRect(-2, -4, 2, 2, BAT.dark, 2);
  pixelRect(0, -4, 2, 2, BAT.light, 2);
  const y = wingsUp ? -4 : 0;
  const tip = wingsUp ? -6 : 2;
  pixelRect(-6, y, 4, 2, BAT.dark, 2);
  pixelRect(-10, tip, 4, 2, BAT.dark, 2);
  pixelRect(-10, y, 2, 2, BAT.dark, 2);
  pixelRect(2, y, 4, 2, BAT.light, 2);
  pixelRect(6, tip, 4, 2, BAT.light, 2);
  pixelRect(8, y, 2, 2, BAT.light, 2);
}

// ---------------------------------------------------------------------------
// Floor props
// ---------------------------------------------------------------------------

// x is the stem's left edge, `stem` its height and width, `cap` the cap's half width.
export const MUSHROOMS = [
  { x: -12, stem: 6, width: 2, cap: 4 },
  { x: 0, stem: 12, width: 4, cap: 8 },
  { x: 12, stem: 4, width: 2, cap: 4 },
];

/** Where each mushroom's cap sits, from the ground under its stem. */
export function mushroomCaps(groundOffset) {
  return MUSHROOMS.map((m) => {
    const cx = m.x + m.width / 2;
    const bottom = snap(groundOffset(cx)) - m.stem;
    return { ...m, cx, bottom };
  });
}

// Rows of a cap from the top, as half widths, ending with the gills.
const capRows = (cap) => [cap - 4, cap - 2, cap, cap].filter((half) => half > 0);

export function drawMushrooms({ pixelRect }, groundOffset) {
  for (const m of mushroomCaps(groundOffset)) {
    // Pale stem down to the ground.
    const ground = snap(groundOffset(m.cx));
    pixelRect(m.x, m.bottom, m.width, ground - m.bottom, STEM.base, 2);
    if (m.width > 2) pixelRect(m.x, m.bottom, 2, ground - m.bottom, STEM.shade, 2);
    const rows = capRows(m.cap);
    rows.forEach((half, index) => {
      const y = m.bottom - (rows.length - index) * 2;
      const gills = index === rows.length - 1;
      const left = m.cx - Math.ceil(half / 2) * 2;
      const width = half * 2;
      pixelRect(left, y, width, 2, gills ? WATER.dark : WATER.base, 2);
      if (gills) return;
      pixelRect(left, y, 2, 2, WATER.dark, 2);
      pixelRect(left + width - (half > 4 ? 4 : 2), y, half > 4 ? 4 : 2, 2, WATER.light, 2);
    });
  }
}

/** The bright spots on each cap, drawn again over the night grade. */
export function drawMushroomSpots({ pixelRect }, groundOffset) {
  for (const m of mushroomCaps(groundOffset)) {
    const rows = capRows(m.cap).length;
    const top = m.bottom - rows * 2;
    pixelRect(m.cx, top, 2, 2, WATER.bright, 2);
    if (m.cap > 4) {
      pixelRect(m.cx - 4, top + 4, 2, 2, WATER.bright, 2);
      pixelRect(m.cx + 4, top + 2, 2, 2, WATER.bright, 2);
    }
  }
}

// Rails: top of the rail above the ground under it.
// Sleepers sit on the floor's rim, which overhangs the surface by 4 units and
// is drawn over back-layer props; the rails sit on the sleepers.
export const RAIL_TOP = -12;
export const CART_WHEELS = [-12, 12];

/**
 * Track from `left` to `right`, following the ground. Open ends (not at a
 * wall) get a wooden buffer stop.
 */
export function drawRails({ pixelRect }, left, right, groundOffset, openLeft, openRight) {
  for (let x = left; x < right; x += 2) {
    const ground = snap(groundOffset(x + 1));
    pixelRect(x, ground + RAIL_TOP, 2, 2, STEEL.light, 2);
    pixelRect(x, ground + RAIL_TOP + 2, 2, 2, IRON.base, 2);
    if ((x - left) % 12 === 2) {
      pixelRect(x - 2, ground - 8, 8, 4, WOOD.base, 2);
      pixelRect(x - 2, ground - 8, 2, 4, WOOD.dark, 2);
      pixelRect(x + 2, ground - 8, 4, 2, WOOD.light, 2);
    }
  }
  const stop = (x) => {
    const ground = snap(groundOffset(x + 2));
    pixelRect(x, ground - 18, 4, 18, WOOD.plank, 2);
    pixelRect(x, ground - 18, 2, 18, WOOD.dark, 2);
    pixelRect(x + 2, ground - 18, 2, 2, WOOD.tip, 2);
  };
  if (openLeft) stop(left);
  if (openRight) stop(right - 4);
}

/** 48 × 36 mine cart heaped with ore, wheels resting on y = 0. */
export function drawMinecart({ pixelRect }) {
  // Ore heap behind the rim.
  pixelRect(-20, -32, 40, 2, ORE.base, 2);
  pixelRect(-14, -34, 26, 2, ORE.base, 2);
  pixelRect(-8, -36, 14, 2, ORE.base, 2);
  pixelRect(-20, -32, 4, 2, ORE.dark, 2);
  pixelRect(-14, -34, 4, 2, ORE.dark, 2);
  pixelRect(10, -32, 6, 2, ORE.light, 2);
  pixelRect(2, -34, 6, 2, ORE.light, 2);
  pixelRect(-2, -36, 4, 2, ORE.light, 2);
  pixelRect(-10, -32, 2, 2, ORE.gold, 2);
  pixelRect(-4, -34, 2, 2, ORE.gold, 2);
  pixelRect(6, -32, 2, 2, ORE.gem, 2);
  // Tub, narrowing to the bottom.
  for (let row = 0; row < 9; row++) {
    const y = -28 + row * 2;
    const half = 22 - Math.min(2, Math.floor(row / 4)) * 2;
    pixelRect(-half, y, half * 2, 2, STEEL.base, 2);
    pixelRect(-half, y, 4, 2, IRON.base, 2);
    pixelRect(half - 2, y, 2, 2, STEEL.mid, 2);
  }
  // Rolled rim.
  pixelRect(-24, -30, 48, 2, STEEL.light, 2);
  pixelRect(-24, -30, 4, 2, STEEL.mid, 2);
  pixelRect(-24, -28, 2, 2, IRON.dark, 2);
  // Straps, a band and rivets.
  for (const sx of [-10, 8]) pixelRect(sx, -26, 2, 14, IRON.base, 2);
  pixelRect(-20, -20, 40, 2, IRON.base, 2);
  for (const [rx, ry] of [[-10, -26], [8, -26], [-16, -20], [-10, -20], [8, -20], [14, -20]])
    pixelRect(rx, ry, 2, 2, STEEL.light, 2);
  // Rust on the shaded side.
  pixelRect(-16, -14, 4, 2, WOOD.plank, 2);
  pixelRect(-14, -12, 2, 2, WOOD.light, 2);
  // Chassis and wheels.
  pixelRect(-18, -10, 36, 2, IRON.dark, 2);
  for (const c of CART_WHEELS) {
    pixelRect(c - 2, -8, 4, 2, IRON.dark, 2);
    pixelRect(c - 4, -6, 8, 4, IRON.dark, 2);
    pixelRect(c - 2, -2, 4, 2, IRON.dark, 2);
    pixelRect(c + 2, -6, 2, 2, IRON.light, 2);
    pixelRect(c, -4, 2, 2, STEEL.mid, 2);
  }
}

// Support set: two posts and a cap beam, 68 wide.
export const BEAM_HALF = 34;
const POSTS = [-28, 22];

/**
 * A timber support set. `headerTop` is the top of the cap beam, `ceiling(x)`
 * the roof above column x (or null), and gaps between them are packed with
 * lagging boards.
 */
export function drawBeams({ pixelRect }, groundOffset, headerTop, ceiling, packing) {
  const top = headerTop;
  // Lagging between the cap beam and the roof.
  for (let x = -BEAM_HALF; x < BEAM_HALF; x += 2) {
    const roof = ceiling(x) === null ? null : snap(ceiling(x));
    if (roof === null || roof >= top || top - roof > packing) continue;
    const board = Math.floor((x + BEAM_HALF) / 10);
    const seam = (x + BEAM_HALF) % 10 === 0;
    pixelRect(x, roof, 2, top - roof, seam ? WOOD.dark : board % 2 ? WOOD.base : WOOD.plank, 2);
  }
  // Posts, down to the ground under each column.
  for (const px of POSTS) {
    [WOOD.dark, WOOD.plank, WOOD.light].forEach((color, column) => {
      const x = px + column * 2;
      const ground = snap(groundOffset(x + 1));
      if (ground > top + 8) pixelRect(x, top + 8, 2, ground - top - 8, color, 2);
    });
    pixelRect(px + 2, top + 26, 2, 2, WOOD.base, 2);
  }
  // Knee braces.
  for (let i = 0; i < 5; i++) {
    pixelRect(-22 + i * 2, top + 18 - i * 2, 4, 2, WOOD.base, 2);
    pixelRect(-20 + i * 2, top + 18 - i * 2, 2, 2, WOOD.light, 2);
    pixelRect(18 - i * 2, top + 18 - i * 2, 4, 2, WOOD.plank, 2);
    pixelRect(20 - i * 2, top + 18 - i * 2, 2, 2, WOOD.tip, 2);
  }
  // Cap beam: lit top and right end, shaded underneath and on the left.
  pixelRect(-BEAM_HALF, top, BEAM_HALF * 2, 8, WOOD.plank, 2);
  pixelRect(-BEAM_HALF, top, BEAM_HALF * 2, 2, WOOD.light, 2);
  pixelRect(-BEAM_HALF, top + 6, BEAM_HALF * 2, 2, WOOD.base, 2);
  pixelRect(-BEAM_HALF, top, 2, 8, WOOD.dark, 2);
  pixelRect(BEAM_HALF - 2, top, 2, 6, WOOD.tip, 2);
  pixelRect(-20, top + 4, 8, 2, WOOD.base, 2);
  pixelRect(6, top + 2, 10, 2, WOOD.base, 2);
}
