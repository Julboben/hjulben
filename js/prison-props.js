// @ts-check
// Prison props: a chain-link fence topped with razor wire, a guard tower with
// a searchlight, a jail cell with its prisoner, an escape tunnel, a ball and
// chain, a wanted poster and tally marks scratched into the rock. Like every
// prop they sit on the 2-unit art grid, have no outlines and are lit from the
// right. Static parts are drawn once into sprites by drawing.js; the parts
// that move, react or follow the ground are drawn live from the functions
// here. The poster's lettering is left to drawing.js, which draws it the
// right way round.

import { STEEL } from "./city-props.js";

const RUBBER = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const WHITE = { dark: "#b5bcae", base: "#f4e9d1", light: "#fffdf4" };
const WOOD = { dark: "#4d3f2f", base: "#66543f", light: "#856d4f", tip: "#aa8a60", cut: "#c39664" };
const CONCRETE = { dark: "#697872", base: "#8b978c", light: "#aeb5a7" };
const ORANGE = { dark: "#c9573a", base: "#ed774e", light: "#ffc295" };
const ROOF = { dark: "#365345", base: "#3d6452", light: "#568061" };
const INK = "#182321";
// The prisoner's stripes.
const STRIPE = { dark: RUBBER.dark, darkShade: INK, light: WHITE.light, lightShade: WHITE.dark };
/** Skin tones a prisoner can have, from the rider's: base, light, shade. */
export const PRISONER_SKINS = [
  { base: "#d99a72", light: "#f0bb93", shade: "#b47454" },
  { base: "#8f5638", light: "#b0714c", shade: "#6d3f28" },
  { base: "#e8b48f", light: "#f7d1b0", shade: "#c48f6c" },
];

const snap = (value) => Math.round(value / 2) * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// A ring of radius r around (cx, cy), one 2-unit cell at a time: `light` on
// the upper right, `shade` on the lower left.
function ring({ pixelRect }, cx, cy, r, light, shade) {
  const steps = Math.ceil(Math.PI * r * 1.5);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = snap(cx + Math.cos(angle) * r), y = snap(cy + Math.sin(angle) * r);
    // Lit where the ring faces up and to the right.
    const lit = Math.cos(angle) - Math.sin(angle) > 0;
    pixelRect(x - 1, y - 1, 2, 2, lit ? light : shade, 2);
  }
}

// Horizontal prison stripes, 4 units each, starting with white at `y`; the
// left column is shaded.
function stripes({ pixelRect }, x, y, width, height) {
  for (let row = 0; row < height; row += 2) {
    const dark = Math.floor(row / 4) % 2 === 1;
    pixelRect(x, y + row, width, 2, dark ? STRIPE.dark : STRIPE.light, 2);
    pixelRect(x, y + row, 2, 2, dark ? STRIPE.darkShade : STRIPE.lightShade, 2);
  }
}

// A prisoner's head, its top at (0, top): stubble, a striped cap. `look` is
// where they look, { x, y } each -1, 0 or 1 (see riderGaze in drawing.js).
function drawPrisonerHead({ pixelRect }, skin, top, look) {
  pixelRect(-4, top + 2, 10, 10, skin.base, 2);
  pixelRect(-4, top + 2, 2, 10, skin.shade, 2);
  pixelRect(4, top + 4, 2, 6, skin.light, 2);
  // Stubble along the jaw.
  pixelRect(-2, top + 10, 8, 2, skin.shade, 2);
  const eyes = look.x > 0 ? [4] : look.x < 0 ? [-2] : [0, 4];
  for (const ex of eyes) pixelRect(ex, top + 6 + look.y * 2, 2, 2, INK, 2);
  // Cap.
  stripes({ pixelRect }, -4, top - 2, 10, 4);
  pixelRect(-6, top + 2, 2, 2, STRIPE.dark, 2);
}

/**
 * A prisoner in stripes, about 48 tall, facing right. With `pose` "stand"
 * their feet are at (0, 0) and their arms reach out to grip bars at x = -12 and 14
 * (see drawPrisonerHands); with "sit" (0, 0) is the seat under them.
 */
export function drawPrisoner(tools, skin, pose, look = { x: 0, y: 0 }) {
  const { pixelRect } = tools;
  if (pose === "sit") {
    // Thighs along the bunk, shins hanging over its edge.
    stripes(tools, -4, -6, 16, 6);
    stripes(tools, 8, 0, 4, 12);
    pixelRect(8, 12, 6, 2, RUBBER.dark, 2);
    stripes(tools, -6, -24, 12, 18);
    // Arms resting on the knees.
    pixelRect(2, -14, 8, 2, STRIPE.dark, 2);
    pixelRect(10, -14, 2, 2, skin.base, 2);
    drawPrisonerHead(tools, skin, -36, look);
    return;
  }
  stripes(tools, -6, -18, 4, 16);
  stripes(tools, 2, -18, 4, 16);
  pixelRect(-6, -2, 4, 2, RUBBER.dark, 2);
  pixelRect(2, -2, 6, 2, RUBBER.dark, 2);
  stripes(tools, -6, -34, 12, 18);
  // Arms out to the bars at shoulder height.
  pixelRect(-10, -34, 4, 2, STRIPE.dark, 2);
  pixelRect(6, -34, 6, 2, STRIPE.light, 2);
  drawPrisonerHead(tools, skin, -46, look);
}

/** The prisoner's hands gripping the bars, drawn over them. */
export function drawPrisonerHands({ pixelRect }, skin) {
  for (const hx of [-12, 14]) {
    pixelRect(hx - 2, -36, 6, 4, skin.base, 2);
    pixelRect(hx - 2, -36, 2, 4, skin.shade, 2);
    pixelRect(hx + 2, -36, 2, 2, skin.light, 2);
  }
}

// ------------------------------------------------------------ prison fence

/** How tall the fence's panel stands, about 3.7 m with its wire. */
const FENCE_TOP = -82;
/** Local bounds of the fence sprite. */
export const PRISON_FENCE_BOUNDS = [-52, FENCE_TOP - 18, 52, 0];

/**
 * 96 × 100, a chain-link fence panel between two steel posts, the posts'
 * arms leaning out to carry a coil of razor wire.
 */
export function drawPrisonFence(tools) {
  const { pixelRect, pixelPath } = tools;
  const top = FENCE_TOP;
  // Chain-link mesh: two sets of diagonals, a diamond every 8 units.
  for (let y = top; y < -2; y += 2)
    for (let x = -44; x < 44; x += 2) {
      const a = (((x - y) % 8) + 8) % 8, b = (((x + y) % 8) + 8) % 8;
      if (a === 0) pixelRect(x, y, 2, 2, STEEL.mid, 2);
      else if (b === 0) pixelRect(x, y, 2, 2, STEEL.base, 2);
    }
  // Top rail, a middle rail, and the bottom wire.
  pixelRect(-46, top - 2, 92, 2, STEEL.light, 2);
  pixelRect(-46, top, 92, 2, STEEL.base, 2);
  pixelRect(-46, snap(top / 2), 92, 2, STEEL.base, 2);
  pixelRect(-46, -4, 92, 2, STEEL.dark, 2);
  // Posts, with their arms leaning out over the top.
  for (const px of [-48, 44]) {
    const shaded = px < 0;
    pixelRect(px, top - 4, 4, 4 - top, shaded ? STEEL.base : STEEL.mid, 2);
    pixelRect(px + (shaded ? 0 : 2), top - 4, 2, 4 - top, shaded ? STEEL.dark : STEEL.light, 2);
    pixelRect(px, top - 6, 4, 2, STEEL.light, 2);
    pixelPath([[px + 2, top - 6], [px + 2 + (shaded ? -4 : 4), top - 14]], STEEL.base, 1, 2);
  }
  // Razor wire coils along the top, with barbs.
  for (let cx = -42; cx <= 42; cx += 12) {
    ring(tools, cx, top - 10, 6, STEEL.light, STEEL.dark);
    pixelRect(cx - 8, top - 12, 2, 2, STEEL.light, 2);
    pixelRect(cx + 6, top - 6, 2, 2, STEEL.mid, 2);
  }
}

// --------------------------------------------------------------- watchtower

/** Where the watchtower's legs stand, and where the sprite hands them over to the live part. */
export const WATCHTOWER_LEGS = [-22, 18];
export const WATCHTOWER_BODY_BOTTOM = -16;
// The tower stands about 8.5 m tall to its light: the deck, cabin and roof are
// drawn WATCHTOWER_LIFT above the numbers they were first written with, so the
// legs grow and the cabin keeps a guard's size.
const WATCHTOWER_LIFT = 52;
/** The searchlight's pivot on the roof. */
export const SEARCHLIGHT = { x: 18, y: -170 - WATCHTOWER_LIFT };
/** How close the rider must be, below the light, for it to lock on. */
export const SEARCHLIGHT_REACH = 360;
/** The beam: how far it reaches, its half-angle, and the size of its cells. */
export const SEARCHLIGHT_BEAM = { length: 340, spread: 0.12, cell: 4 };
/** The searchlight's colours, lit and dark. */
export const SEARCHLIGHT_LIGHT = { beam: "#fff3be", core: "#fffdf4" };

/** Where the guard at the watchtower's window looks from. */
export const WATCHTOWER_EYES = { x: 2, y: -134 - WATCHTOWER_LIFT };

/**
 * A wooden guard tower: braced legs, a walkway with a railing, and a cabin
 * with a window under a pitched roof. The legs below WATCHTOWER_BODY_BOTTOM,
 * the guard at the window (drawWatchtowerGuard) and the searchlight are drawn
 * live.
 */
export function drawWatchtower(tools) {
  const { pixelRect, pixelPath } = tools;
  const [left, right] = WATCHTOWER_LEGS;
  const deck = -112 - WATCHTOWER_LIFT;
  const bottom = WATCHTOWER_BODY_BOTTOM;
  // Cross bracing between the legs.
  for (let y = deck + 6; y < bottom; y += 32) {
    const end = Math.min(bottom, y + 32);
    pixelPath([[left + 4, y], [right, end]], WOOD.base, 1, 2);
    pixelPath([[right, y], [left + 4, end]], WOOD.dark, 1, 2);
    pixelRect(left, end - 2, right - left + 4, 2, WOOD.dark, 2);
  }
  for (const lx of [left, right]) {
    const shaded = lx === left;
    pixelRect(lx, deck, 4, bottom - deck, shaded ? WOOD.base : WOOD.light, 2);
    pixelRect(lx + (shaded ? 0 : 2), deck, 2, bottom - deck, shaded ? WOOD.dark : WOOD.tip, 2);
  }
  // Cabin walls, planked, with the window band.
  pixelRect(-26, -150 - WATCHTOWER_LIFT, 52, 38, WOOD.light, 2);
  for (let y = -146 - WATCHTOWER_LIFT; y < -112 - WATCHTOWER_LIFT; y += 6) pixelRect(-26, y, 52, 2, WOOD.base, 2);
  pixelRect(-26, -150 - WATCHTOWER_LIFT, 4, 38, WOOD.dark, 2);
  pixelRect(24, -150 - WATCHTOWER_LIFT, 2, 38, WOOD.tip, 2);
  pixelRect(-20, -144 - WATCHTOWER_LIFT, 40, 16, INK, 2);
  // Roof: eaves, then two steps up to the ridge.
  pixelRect(-32, -156 - WATCHTOWER_LIFT, 64, 6, ROOF.base, 2);
  pixelRect(-32, -152 - WATCHTOWER_LIFT, 64, 2, ROOF.dark, 2);
  pixelRect(-22, -160 - WATCHTOWER_LIFT, 44, 4, ROOF.base, 2);
  pixelRect(-12, -164 - WATCHTOWER_LIFT, 24, 4, ROOF.light, 2);
  pixelRect(-32, -156 - WATCHTOWER_LIFT, 4, 4, ROOF.dark, 2);
  pixelRect(22, -160 - WATCHTOWER_LIFT, 10, 4, ROOF.light, 2);
  // The searchlight's pedestal.
  pixelRect(SEARCHLIGHT.x - 2, SEARCHLIGHT.y + 2, 4, -158 - WATCHTOWER_LIFT - SEARCHLIGHT.y, STEEL.base, 2);
  // Walkway and railing, in front of the cabin.
  pixelRect(-34, deck, 68, 6, WOOD.light, 2);
  pixelRect(-34, deck, 68, 2, WOOD.tip, 2);
  pixelRect(-34, deck + 4, 68, 2, WOOD.dark, 2);
  for (const px of [-34, -12, 10, 30]) pixelRect(px, deck - 14, 4, 14, px < 0 ? WOOD.base : WOOD.light, 2);
  pixelRect(-34, deck - 16, 68, 2, WOOD.tip, 2);
  pixelRect(-34, deck - 14, 68, 2, WOOD.base, 2);
}

/**
 * The guard watching from the watchtower's window, cap and shoulders, with
 * the glass's glint and the sill in front. The head leans to `gaze` ({ x, y },
 * each -1, 0 or 1; see riderGaze in drawing.js), to follow the rider.
 */
export function drawWatchtowerGuard({ pixelRect }, gaze = { x: 0, y: 0 }) {
  const hx = gaze.x * 2, hy = gaze.y * 2 - WATCHTOWER_LIFT;
  pixelRect(-8, -132 - WATCHTOWER_LIFT, 18, 4, RUBBER.base, 2);
  pixelRect(-4 + hx, -138 + hy, 10, 10, RUBBER.base, 2);
  pixelRect(-6 + hx, -140 + hy, 14, 2, RUBBER.light, 2);
  pixelRect(2 + hx * 2, -134 + hy, 2, 2, ORANGE.light, 2);
  pixelRect(12, -142 - WATCHTOWER_LIFT, 2, 4, CONCRETE.light, 2);
  pixelRect(14, -144 - WATCHTOWER_LIFT, 2, 2, CONCRETE.light, 2);
  pixelRect(-22, -128 - WATCHTOWER_LIFT, 44, 2, WOOD.tip, 2);
}

/**
 * Where the searchlight points, in radians clockwise from the right (so
 * π/2 is straight down). It locks on to the rider when they are below it and
 * within SEARCHLIGHT_REACH (`dx`, `dy` from the pivot, in its own frame, or
 * null); otherwise it sweeps slowly to and fro. At time 0 it holds still.
 */
export function searchlightAim(time, phase, dx, dy) {
  if (Number.isFinite(dx) && Number.isFinite(dy) && dy > 0 && Math.hypot(dx, dy) < SEARCHLIGHT_REACH)
    return clamp(Math.atan2(dy, dx), 0.15, Math.PI - 0.15);
  const sweep = time ? Math.sin(time * 0.5 + phase * Math.PI * 2) : -0.6;
  return Math.PI / 2 + sweep * 0.95;
}

/** The searchlight's lamp on its yoke, turned to `angle`; the lens shines when `lit`. */
export function drawSearchlight({ pixelRect, pixelPath, drawPixelDisc }, angle, lit = false) {
  const { x, y } = SEARCHLIGHT;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  pixelRect(x - 4, y, 8, 2, STEEL.dark, 2);
  pixelPath([[x - ux * 2, y - uy * 2], [x + ux * 6, y + uy * 6]], RUBBER.base, 3, 2);
  pixelPath([[x - ux * 2 - uy * 2, y - uy * 2 + ux * 2], [x + ux * 6 - uy * 2, y + uy * 6 + ux * 2]], RUBBER.light, 1, 2);
  drawPixelDisc(x + ux * 9, y + uy * 9, 3, lit ? SEARCHLIGHT_LIGHT.core : STEEL.light, 2);
}

/**
 * The searchlight's beam pointed at `angle`, as cells of light: { x, y,
 * alpha } squares SEARCHLIGHT_BEAM.cell across, in the tower's frame, stopping
 * at the ground (`groundOffset(localX)`). `hit` is where it lands on the
 * ground and how wide its spot is there, or null if it reaches no ground.
 * @param {number} angle
 * @param {(localX: number) => number} [groundOffset]
 */
export function searchlightBeam(angle, groundOffset = () => 0) {
  const { length, spread, cell } = SEARCHLIGHT_BEAM;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const ax = SEARCHLIGHT.x + ux * 10, ay = SEARCHLIGHT.y + uy * 10;
  let reach = length;
  for (let d = 0; d <= length; d += 2)
    if (ay + uy * d >= groundOffset(ax + ux * d)) {
      reach = d;
      break;
    }
  const tan = Math.tan(spread);
  const half = reach * tan + cell;
  const ends = [
    [ax, ay],
    [ax + ux * reach - uy * half, ay + uy * reach + ux * half],
    [ax + ux * reach + uy * half, ay + uy * reach - ux * half],
  ];
  const fit = (value) => Math.floor(value / cell) * cell;
  const left = fit(Math.min(...ends.map((p) => p[0]))), right = Math.max(...ends.map((p) => p[0]));
  const top = fit(Math.min(...ends.map((p) => p[1]))), bottom = Math.max(...ends.map((p) => p[1]));
  const cells = [];
  for (let y = top; y <= bottom; y += cell)
    for (let x = left; x <= right; x += cell) {
      const cx = x + cell / 2, cy = y + cell / 2;
      const along = (cx - ax) * ux + (cy - ay) * uy;
      if (along <= 0 || along > reach) continue;
      const across = Math.abs((cx - ax) * uy - (cy - ay) * ux);
      const width = along * tan + 2;
      if (across > width || cy > groundOffset(cx)) continue;
      const fade = 1 - along / (length + 60);
      cells.push({ x, y, alpha: (across < width * 0.45 ? 0.28 : 0.16) * fade });
    }
  const hit = reach < length
    ? { x: ax + ux * reach, y: ay + uy * reach, width: Math.max(8, reach * tan) }
    : null;
  return { cells, hit };
}

// ---------------------------------------------------------------- jail cell

/** The cell's opening, inside its concrete frame. */
export const CELL = { left: -34, top: -78, right: 34, bottom: -4 };
/** The bars across the opening. */
export const CELL_BARS = [-26, -12, 14, 28];
/** The bunk's top, where a sitting prisoner sits, and its middle. */
export const CELL_BUNK = { x: -18, y: -22 };
/** Where the prisoner looks from, sitting on the bunk or standing at the bars. */
export const CELL_EYES = { sit: { x: CELL_BUNK.x + 2, y: CELL_BUNK.y - 30 }, stand: { x: 2, y: -44 } };
/** How close the rider must be for the prisoner to come to the bars. */
export const CELL_REACH = { x: 220, y: 160 };

/**
 * The back of a jail cell: a concrete frame round a dim wall, a bunk and a
 * barred little window. The prisoner and the bars are drawn live over it.
 */
export function drawCellBack({ pixelRect }) {
  const { left, top, right, bottom } = CELL;
  // Frame.
  pixelRect(left - 6, top - 6, right - left + 12, bottom - top + 10, CONCRETE.base, 2);
  pixelRect(left - 6, top - 6, 4, bottom - top + 10, CONCRETE.dark, 2);
  pixelRect(right + 4, top - 6, 2, bottom - top + 10, CONCRETE.light, 2);
  pixelRect(left - 6, top - 6, right - left + 12, 2, CONCRETE.light, 2);
  pixelRect(left - 8, bottom, right - left + 16, 4, CONCRETE.dark, 2);
  pixelRect(left - 8, bottom, right - left + 16, 2, CONCRETE.base, 2);
  // Dim back wall, with block joints.
  pixelRect(left, top, right - left, bottom - top, RUBBER.dark, 2);
  for (let y = top + 10; y < bottom; y += 12) pixelRect(left, y, right - left, 2, INK, 2);
  for (let y = top; y < bottom; y += 24)
    for (let x = left + 12; x < right; x += 24) pixelRect(x, y, 2, 10, INK, 2);
  pixelRect(left, top, 4, bottom - top, INK, 2);
  // A slit of daylight high in the back wall.
  pixelRect(4, top + 8, 20, 10, CONCRETE.light, 2);
  for (const x of [8, 14, 20]) pixelRect(x, top + 8, 2, 10, RUBBER.dark, 2);
  // Bunk on chains.
  const { x: bx, y: by } = CELL_BUNK;
  pixelRect(bx - 14, by, 28, 4, WOOD.light, 2);
  pixelRect(bx - 14, by, 28, 2, WOOD.tip, 2);
  pixelRect(bx - 14, by + 4, 28, 2, WOOD.dark, 2);
  pixelRect(bx - 14, by - 2, 10, 2, WHITE.dark, 2);
  pixelRect(bx - 12, by - 30, 2, 30, STEEL.dark, 2);
  pixelRect(bx + 10, by - 30, 2, 30, STEEL.dark, 2);
}

/** The bars across the front of the cell, and the door's lock. */
export function drawCellBars({ pixelRect }) {
  const { top, bottom } = CELL;
  for (const x of CELL_BARS) {
    pixelRect(x - 2, top, 2, bottom - top, STEEL.dark, 2);
    pixelRect(x, top, 2, bottom - top, STEEL.mid, 2);
  }
  for (const y of [top, bottom - 10]) {
    pixelRect(CELL.left, y, CELL.right - CELL.left, 4, STEEL.base, 2);
    pixelRect(CELL.left, y, CELL.right - CELL.left, 2, STEEL.light, 2);
  }
  pixelRect(18, top + 34, 8, 8, STEEL.base, 2);
  pixelRect(18, top + 34, 2, 8, STEEL.dark, 2);
  pixelRect(22, top + 38, 2, 2, INK, 2);
}

/**
 * What the prisoner in a cell at (x, y) is doing: lounging on the bunk until
 * the rider comes close, then at the bars, rattling them. `rattle` is how far
 * they are shaken (0 or ±2), still at time 0.
 */
export function cellPrisoner(scene, x, y) {
  const near =
    Number.isFinite(scene.riderX) &&
    Number.isFinite(scene.riderY) &&
    Math.abs(scene.riderX - x) < CELL_REACH.x &&
    Math.abs(scene.riderY - y) < CELL_REACH.y;
  if (!near) return { pose: "sit", rattle: 0 };
  const time = scene.time || 0;
  return { pose: "stand", rattle: time ? (Math.floor(time * 10) % 2 ? 2 : -2) : 0 };
}

// ------------------------------------------------------------ escape tunnel

/** How close the rider must be for the prisoner to start sinking out of sight, and to be gone. */
export const TUNNEL_SINK = { from: 240, to: 150 };
/** How far the prisoner sinks into the hole when out of sight. */
export const TUNNEL_DEPTH = 28;

/**
 * How far out of the tunnel the prisoner is: `rise` 1 (head and shoulders
 * out) to 0 (gone), falling as the rider comes closer; and which way they
 * look: glancing about, or at the rider once they are wary. Still at time 0.
 */
export function tunnelPeek(scene, x, y, phase = 0) {
  const known = Number.isFinite(scene.riderX) && Number.isFinite(scene.riderY);
  const distance = known ? Math.hypot(scene.riderX - x, scene.riderY - y) : Infinity;
  const rise = clamp((distance - TUNNEL_SINK.to) / (TUNNEL_SINK.from - TUNNEL_SINK.to), 0, 1);
  let look = 0;
  if (rise < 1 && known) look = scene.riderX < x ? -1 : 1;
  else if (scene.time) look = [-1, 0, 1, 0][Math.floor(scene.time / 1.4 + phase * 4) % 4];
  return { rise, look };
}

/** The dug-up earth behind the hole, with the spoon it was dug with. */
export function drawTunnelMound({ pixelRect }) {
  const rows = [[-22, 22], [-20, 18], [-16, 14], [-10, 8]];
  rows.forEach(([l, r], row) => {
    const y = -4 - row * 2;
    pixelRect(l, y, r - l, 2, WOOD.base, 2);
    pixelRect(l, y, 4, 2, WOOD.dark, 2);
    pixelRect(r - 4, y, 4, 2, WOOD.light, 2);
  });
  pixelRect(-24, -2, 48, 2, WOOD.dark, 2);
  // Clods.
  for (const [cx, cy] of [[-26, -2], [26, -2], [14, -8]]) pixelRect(cx - 2, cy, 4, 2, WOOD.light, 2);
  // The spoon, stuck in the dirt.
  pixelRect(16, -20, 2, 12, STEEL.light, 2);
  pixelRect(14, -24, 6, 4, STEEL.mid, 2);
  pixelRect(18, -24, 2, 2, STEEL.light, 2);
}

/** The hole itself and the lip of earth in front of it, drawn over the prisoner. */
export function drawTunnelLip({ pixelRect }) {
  pixelRect(-12, -6, 24, 4, INK, 2);
  pixelRect(-14, -2, 28, 2, WOOD.base, 2);
  pixelRect(-14, -2, 4, 2, WOOD.dark, 2);
  pixelRect(10, -2, 4, 2, WOOD.light, 2);
}

/** The prisoner's head and shoulders, the bottom of their chest at (0, 0), hands on the rim. */
export function drawPrisonerBust(tools, skin, look = { x: 0, y: 0 }) {
  const { pixelRect } = tools;
  stripes(tools, -8, -14, 16, 14);
  pixelRect(-12, -6, 4, 4, skin.shade, 2);
  pixelRect(8, -6, 4, 4, skin.base, 2);
  drawPrisonerHead(tools, skin, -26, look);
}

// ------------------------------------------------------------ ball and chain

/** 36 × 12, an iron ball about 35 cm across on a chain ending in an open shackle. */
export function drawBallAndChain(tools) {
  const { pixelRect, drawPixelDisc } = tools;
  // Chain links, alternately face on and edge on.
  for (let i = 0; i < 5; i++) {
    const x = -12 + i * 4;
    if (i % 2) pixelRect(x, -4, 4, 2, STEEL.mid, 2);
    else {
      pixelRect(x, -6, 4, 4, STEEL.base, 2);
      pixelRect(x + 2, -4, 2, 2, INK, 2);
      pixelRect(x + 2, -6, 2, 2, STEEL.light, 2);
    }
  }
  // Shackle, lying open.
  pixelRect(-18, -6, 6, 2, STEEL.light, 2);
  pixelRect(-18, -4, 2, 2, STEEL.base, 2);
  pixelRect(-18, -2, 6, 2, STEEL.dark, 2);
  // The ball: shaded below and to the left, a glint up on the right.
  drawPixelDisc(12, -6, 6, INK, 2);
  drawPixelDisc(14, -8, 4, RUBBER.dark, 2);
  pixelRect(14, -10, 2, 2, RUBBER.base, 2);
  pixelRect(16, -10, 2, 2, RUBBER.light, 2);
}

// ------------------------------------------------------------- wanted poster

/** The poster's paper and where drawing.js prints its two lines. */
export const WANTED = {
  left: -26, top: -92, width: 52, height: 62,
  title: { text: "WANTED", y: -88 },
  reward: { text: "100 KR", y: -46 },
};
/** Where the poster's post starts, running down to the ground live. */
export const WANTED_POST_TOP = -30;

/**
 * A wanted poster nailed to a post, a torn corner, and a mugshot of a rider
 * in a helmet: whoever has been riding too fast through here. Its lettering
 * is drawn by drawing.js at WANTED.title and WANTED.reward.
 */
export function drawWantedPoster({ pixelRect }) {
  const { left, top, width, height } = WANTED;
  // Post top behind the paper.
  pixelRect(-2, top + 4, 4, height - 4, WOOD.base, 2);
  // Paper: shaded down the left, lit on the right, a torn lower corner.
  pixelRect(left, top, width, height, WHITE.base, 2);
  pixelRect(left, top, 2, height, WHITE.dark, 2);
  pixelRect(left + width - 2, top, 2, height - 8, WHITE.light, 2);
  pixelRect(left + width - 6, top + height - 6, 6, 6, WOOD.base, 2);
  pixelRect(left + width - 8, top + height - 2, 2, 2, WOOD.base, 2);
  pixelRect(left + width - 2, top + height - 8, 2, 2, WOOD.base, 2);
  pixelRect(left + width - 8, top + height - 6, 2, 2, WHITE.dark, 2);
  // Nails.
  pixelRect(left + 4, top + 2, 2, 2, STEEL.dark, 2);
  pixelRect(left + width - 6, top + 2, 2, 2, STEEL.dark, 2);
  // Mugshot: a framed rider in an orange helmet with the visor down.
  const mx = -14, my = top + 16;
  pixelRect(mx, my, 28, 26, INK, 2);
  pixelRect(mx + 2, my + 2, 24, 22, CONCRETE.light, 2);
  for (const y of [my + 6, my + 12, my + 18]) pixelRect(mx + 2, y, 4, 2, CONCRETE.dark, 2);
  pixelRect(mx + 6, my + 18, 16, 6, RUBBER.base, 2);
  pixelRect(mx + 8, my + 4, 12, 14, ORANGE.base, 2);
  pixelRect(mx + 8, my + 4, 2, 14, ORANGE.dark, 2);
  pixelRect(mx + 16, my + 4, 4, 4, ORANGE.light, 2);
  pixelRect(mx + 12, my + 10, 10, 4, INK, 2);
  pixelRect(mx + 18, my + 10, 2, 2, CONCRETE.light, 2);
}

// -------------------------------------------------------------- tally marks

/** Local bounds of the tally marks, centred on their anchor in the rock. */
export const TALLY_BOUNDS = [-40, -16, 40, 16];
const SCRATCH = { light: "#e8e5d9", shade: "#4a524d" };

/** Tally marks scratched into the rock: three gates of five, and three more. */
export function drawTallyMarks({ pixelRect, pixelPath }) {
  const marks = (x, count, gate) => {
    for (let i = 0; i < count; i++) {
      const mx = x + i * 4, lean = (i % 2) * 2;
      pixelRect(mx - 2, -10 + lean, 2, 20 - lean, SCRATCH.shade, 2);
      pixelRect(mx, -10 + lean, 2, 20 - lean, SCRATCH.light, 2);
    }
    if (gate) {
      pixelPath([[x - 4, 8], [x + 16, -8]], SCRATCH.shade, 1, 2);
      pixelPath([[x - 2, 8], [x + 18, -8]], SCRATCH.light, 1, 2);
    }
  };
  marks(-34, 4, true);
  marks(-12, 4, true);
  marks(10, 4, true);
  marks(30, 3, false);
}
