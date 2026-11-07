// @ts-check
// Dungeon props: iron bars running from the roof to the floor, a portcullis
// that grinds up as the rider comes, a torch burning on an iron stand, chains
// hanging from the roof, a gibbet cage with its long-dead prisoner, and a
// shackled skeleton that turns its skull to watch the rider. Like every prop
// they sit on the 2-unit art grid, have no outlines and are lit from the
// right. The bars fit themselves between the roof and the floor (see
// propWallFit in drawing.js); the portcullis, chains and gibbet hang from the
// roof like the cave props and are drawn live from the roof at y = 0
// downwards, so none of those can be flipped or rotated. The torch's flame is
// a fire from fire.js, drawn in the glow pass.

import { STEEL } from "./city-props.js";
import { fireTongues } from "./fire.js";

// Wrought iron, from the rubber greys.
const IRON = { dark: "#3a403d", base: "#4a524d", light: "#5b645e", glint: "#8b978c" };
const RUST = { dark: "#71392f", base: "#8d493d", light: "#a65a49" };
const BONE = { shade: "#b5bcae", base: "#e8e5d9", light: "#fffdf4" };
const WOOD = { dark: "#4d3f2f", base: "#66543f", light: "#856d4f", tip: "#aa8a60" };
const INK = "#182321";

const snap = (value) => Math.round(value / 2) * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// A vertical iron rod 4 wide, centred on x: shaded left, lit right.
function rod({ pixelRect }, x, top, bottom) {
  if (bottom <= top) return;
  pixelRect(x - 2, top, 2, bottom - top, IRON.dark, 2);
  pixelRect(x, top, 2, bottom - top, IRON.light, 2);
}

// A flat iron strap 4 tall across [left, right) at y: lit top, shaded under.
function strap({ pixelRect }, left, right, y) {
  pixelRect(left, y, right - left, 2, IRON.light, 2);
  pixelRect(left, y + 2, right - left, 2, IRON.base, 2);
  pixelRect(left, y, 2, 4, IRON.dark, 2);
}

/**
 * A chain hanging from (x, y) at `angle` radians from straight down (positive
 * swings it right), `length` long: links alternately face on and edge on, as
 * on the ball and chain. Returns its end point.
 */
function chain({ pixelRect }, x, y, length, angle = 0) {
  const sx = Math.sin(angle), cy = Math.cos(angle);
  const at = (d) => [snap(x + sx * d), snap(y + cy * d)];
  for (let d = 0; d < length; d += 8) {
    const [fx, fy] = at(d);
    pixelRect(fx - 2, fy, 4, 6, IRON.base, 2);
    pixelRect(fx - 2, fy, 2, 6, IRON.dark, 2);
    pixelRect(fx, fy, 2, 2, IRON.glint, 2);
    pixelRect(fx, fy + 2, 2, 2, INK, 2);
    if (d + 6 < length) {
      const [ex, ey] = at(d + 6);
      pixelRect(ex, ey, 2, 2, IRON.light, 2);
    }
  }
  return at(length);
}

// ------------------------------------------------------------- dungeon bars

/** Where each bar stands, across the prop. */
export const BAR_XS = [-24, -12, 0, 12, 24];
/**
 * The bars' layout: how far either side the straps run, how tall they stand
 * with no roof over them, and how far up they look for one. Set side by side
 * every 60 units, a row of them makes one long wall of bars.
 */
export const BARS = { half: 30, height: 112, reach: 260 };

/**
 * Where each bar runs, from `roofs[i]` (the roof over bar i, as an offset from
 * the anchor, or null with no roof) down to the ground under it. With no roof
 * a bar stands BARS.height tall and ends in a spear point. With `bent`, the
 * second and third bars bow apart, where someone squeezed through. Each is
 * { x, top, bottom, capped, bow }, snapped to the art grid.
 * @param {(number | null)[]} roofs
 * @param {(localX: number) => number} groundOffset
 */
export function barLayout(roofs, groundOffset, bent = false) {
  return BAR_XS.map((x, index) => {
    const roof = roofs[index];
    const capped = roof === null || roof === undefined;
    return {
      x,
      top: snap(capped ? -BARS.height : roof),
      bottom: snap(groundOffset(x)),
      capped,
      bow: bent && index === 1 ? -4 : bent && index === 2 ? 4 : 0,
    };
  });
}

/**
 * The bars, as laid out by barLayout: iron rods with two straps riveted
 * across them, flecked with rust, and a socket where each meets the floor.
 * @param {{ pixelRect: (...args: any[]) => void }} tools
 * @param {any[]} bars
 * @param {(index: number) => number} [noise]
 */
export function drawDungeonBars({ pixelRect }, bars, noise = () => 0.5) {
  const tools = { pixelRect };
  // Straps sit under the lowest roof and over the highest floor.
  const top = Math.max(...bars.map((bar) => bar.top));
  const bottom = Math.min(...bars.map((bar) => bar.bottom));
  const upper = top + 10, lower = bottom - 18;
  bars.forEach((bar, index) => {
    const height = bar.bottom - bar.top;
    // A bowed bar bends out between the straps, easing in and out.
    const shift = (y) => {
      if (!bar.bow || y <= upper + 4 || y >= lower) return 0;
      const t = (y - upper - 4) / (lower - upper - 4);
      return snap(bar.bow * Math.sin(t * Math.PI));
    };
    for (let y = bar.top; y < bar.bottom; y += 2) rod(tools, bar.x + shift(y), y, y + 2);
    // Rust streaking down from a strap.
    const streak = snap(upper + 4 + noise(index) * Math.max(0, height - 40));
    for (let y = streak; y < Math.min(bar.bottom - 4, streak + 6 + snap(noise(index + 5) * 10)); y += 2)
      pixelRect(bar.x + shift(y) - 2, y, 2, 2, y - streak < 4 ? RUST.base : RUST.dark, 2);
    if (bar.capped) {
      // A spear point on a bar with no roof to run into.
      pixelRect(bar.x - 4, bar.top - 2, 8, 2, IRON.base, 2);
      pixelRect(bar.x + 2, bar.top - 2, 2, 2, IRON.light, 2);
      pixelRect(bar.x - 2, bar.top - 6, 4, 4, IRON.base, 2);
      pixelRect(bar.x, bar.top - 6, 2, 4, IRON.glint, 2);
      pixelRect(bar.x, bar.top - 8, 2, 2, IRON.light, 2);
    }
    // Set into the floor.
    pixelRect(bar.x - 4, bar.bottom - 2, 8, 2, IRON.dark, 2);
    pixelRect(bar.x + 2, bar.bottom - 2, 2, 2, IRON.base, 2);
  });
  for (const y of bottom - top > 44 ? [upper, lower] : [upper]) {
    strap(tools, -BARS.half, BARS.half, y);
    for (const bar of bars) pixelRect(bar.x, y, 2, 2, IRON.glint, 2);
  }
}

// --------------------------------------------------------------- portcullis

/**
 * The portcullis: how far either side it reaches, how far down it drops with
 * no floor under it (and at most), how much of it stays below the roof when
 * raised, and how close the rider must come for it to start rising (`from`)
 * and to be fully up (`to`).
 */
export const PORTCULLIS = { half: 32, height: 120, max: 200, show: 26, from: 260, to: 110 };
const GATE_XS = [-26, -14, -2, 10, 22];
const GATE_ROW = 16;

/**
 * How far the gate hangs below the roof: right down to the floor `room`
 * below it, or PORTCULLIS.height with no floor, and grinding up into the
 * roof as the rider comes within PORTCULLIS.from of (x, y), the foot of the
 * closed gate. A pure function of where the rider is, so it holds still with
 * them; down when there is no rider.
 * @param {{ riderX?: number | null, riderY?: number | null }} scene
 */
export function portcullisDrop(scene, x, y, room = Infinity) {
  const closed = snap(Number.isFinite(room) ? Math.min(PORTCULLIS.max, room - 2) : PORTCULLIS.height);
  const known = Number.isFinite(scene.riderX) && Number.isFinite(scene.riderY);
  const distance = known ? Math.hypot(scene.riderX - x, (scene.riderY - y) * 0.6) : Infinity;
  const open = clamp((PORTCULLIS.from - distance) / (PORTCULLIS.from - PORTCULLIS.to), 0, 1);
  return snap(closed - open * Math.max(0, closed - PORTCULLIS.show));
}

/**
 * A portcullis hanging `drop` below the roof at y = 0: an iron-shod timber
 * lattice whose bars end in spikes at its foot. The rows are spaced up from
 * the spikes, so they ride up with the gate as it rises into the roof.
 */
export function drawPortcullis({ pixelRect }, drop) {
  const foot = snap(drop) - 8;
  // Cross rails, from the foot up into the roof.
  for (let y = foot - 6; y > -4; y -= GATE_ROW) {
    const top = Math.max(0, y);
    const height = y + 6 - top;
    if (height <= 0) continue;
    pixelRect(-PORTCULLIS.half, top, PORTCULLIS.half * 2, height, WOOD.base, 2);
    if (y >= 0) pixelRect(-PORTCULLIS.half, y, PORTCULLIS.half * 2, 2, WOOD.light, 2);
    if (y + 4 >= 0) pixelRect(-PORTCULLIS.half, y + 4, PORTCULLIS.half * 2, 2, WOOD.dark, 2);
    pixelRect(PORTCULLIS.half - 2, top, 2, height, WOOD.tip, 2);
  }
  // Uprights, iron-shod, over the rails, with a rivet at each crossing.
  for (const x of GATE_XS) {
    pixelRect(x - 2, 0, 2, foot, WOOD.dark, 2);
    pixelRect(x, 0, 4, foot, WOOD.light, 2);
    pixelRect(x + 2, 0, 2, foot, WOOD.tip, 2);
    for (let y = foot - 4; y > 0; y -= GATE_ROW) pixelRect(x, y, 2, 2, IRON.glint, 2);
    // The iron spike at its foot.
    pixelRect(x - 2, foot, 6, 2, IRON.base, 2);
    pixelRect(x - 2, foot, 2, 2, IRON.dark, 2);
    pixelRect(x - 2, foot + 2, 4, 2, IRON.base, 2);
    pixelRect(x, foot + 2, 2, 2, IRON.light, 2);
    pixelRect(x, foot + 4, 2, 2, IRON.glint, 2);
  }
}

// -------------------------------------------------------------------- torch

/** Where the torch's flame sits on its stand, and where its light comes from. */
export const TORCH_FLAME = { x: 0, y: -54 };
/** The torch's flame: a single tongue about 8 across and 16 tall (see fire.js). */
export const TORCH_TONGUES = fireTongues(8, 16);
/** Where the stand's sprite ends and its pole carries on down to the ground. */
export const TORCH_BODY_BOTTOM = -12;

/**
 * A torch on a wrought-iron stand, about 1.7 m to its flame: a pole with a
 * twisted collar, an iron basket holding the pitch-wrapped torch. The pole
 * below TORCH_BODY_BOTTOM, its feet and the flame are drawn live.
 */
export function drawTorchStand({ pixelRect }) {
  const tools = { pixelRect };
  rod(tools, 0, -36, TORCH_BODY_BOTTOM);
  // A twisted collar halfway up.
  for (let i = 0; i < 3; i++) {
    pixelRect(-4, -28 + i * 2, 8, 2, i % 2 ? IRON.base : IRON.light, 2);
    pixelRect(-4, -28 + i * 2, 2, 2, IRON.dark, 2);
  }
  // The torch's handle, then its pitch-wrapped head.
  pixelRect(-2, -46, 2, 10, WOOD.dark, 2);
  pixelRect(0, -46, 2, 10, WOOD.light, 2);
  pixelRect(-4, -52, 8, 6, INK, 2);
  pixelRect(-4, -50, 8, 2, IRON.dark, 2);
  pixelRect(2, -52, 2, 2, WOOD.base, 2);
  // The basket: a ring and prongs flaring out round the torch.
  pixelRect(-6, -38, 12, 2, IRON.light, 2);
  pixelRect(-6, -36, 12, 2, IRON.base, 2);
  pixelRect(-6, -38, 2, 4, IRON.dark, 2);
  for (const [x, lean] of [[-8, -2], [6, 2]]) {
    pixelRect(x, -44, 2, 6, x < 0 ? IRON.dark : IRON.light, 2);
    pixelRect(x + lean, -48, 2, 4, x < 0 ? IRON.base : IRON.glint, 2);
  }
}

/**
 * The pole running on down from the stand's sprite to the ground, and two
 * splayed feet that sit on it. `groundOffset(localX)` is the ground's y.
 */
export function drawTorchFeet({ pixelRect }, groundOffset) {
  const ground = snap(groundOffset(0));
  rod({ pixelRect }, 0, TORCH_BODY_BOTTOM, ground - 2);
  for (const [x, w, color] of /** @type {[number, number, string][]} */ ([[-8, 6, IRON.dark], [2, 6, IRON.light]])) {
    const y = snap(groundOffset(x + w / 2));
    pixelRect(x, y - 2, w, 2, color, 2);
    pixelRect(x + (x < 0 ? 4 : 0), y - 4, 2, 2, IRON.base, 2);
  }
  pixelRect(-2, ground - 4, 4, 4, IRON.base, 2);
  pixelRect(0, ground - 4, 2, 2, IRON.glint, 2);
}

// ------------------------------------------------------------ swinging iron

/** How far a hard landing's jolt reaches, across and up or down, and how long it swings. */
export const JOLT = { x: 240, y: 160, time: 2.4 };

/**
 * How far something hanging at (x, y) swings, in radians from straight down:
 * a slow sway in the wind (0…1), and a swing that dies away after a hard
 * landing nearby (`landing` as in the scene). Still at time 0. `phase` is a
 * fixed 0…1 value per prop.
 */
export function hangingSwing(time, wind, landing, x, y, phase = 0, size = 1) {
  if (!time) return 0;
  let angle = Math.sin(time * 1.1 + phase * Math.PI * 2) * (0.03 + wind * 0.08) * size;
  if (landing && Number.isFinite(landing.x) && Number.isFinite(landing.time)) {
    const age = time - landing.time;
    const near = Math.abs(landing.x - x) < JOLT.x && (!Number.isFinite(landing.y) || Math.abs(landing.y - y) < JOLT.y);
    if (near && age >= 0 && age < JOLT.time) {
      const strength = clamp(landing.strength ?? 1, 0, 1) * (1 - Math.abs(landing.x - x) / JOLT.x);
      // Kicked away from the landing, then swinging back and forth.
      const away = landing.x < x ? 1 : -1;
      angle += away * Math.sin(age * 5) * 0.3 * strength * (1 - age / JOLT.time) * size;
    }
  }
  return angle;
}

// ----------------------------------------------------------- hanging chains

/** The chains: where each hangs from, how long it is, and what's on its end. */
export const CHAINS = [
  { x: -12, length: 56, end: "manacle" },
  { x: 0, length: 28, end: null },
  { x: 12, length: 80, end: "hook" },
];
/** The longest a hanging chain gets, hook and all. */
export const CHAINS_HANG = 96;

/**
 * Chains hanging from a ring bolt in the roof at y = 0, at most `room` long
 * so they clear the floor: one ends in an open manacle, one in a meat hook.
 * `swing` (radians, see hangingSwing) sways them, the longer ones further.
 */
export function drawHangingChains({ pixelRect }, room, swing = 0) {
  const tools = { pixelRect };
  // The bolt plate in the roof.
  pixelRect(-16, 0, 32, 2, IRON.base, 2);
  pixelRect(-16, 0, 2, 2, IRON.dark, 2);
  pixelRect(14, 0, 2, 2, IRON.light, 2);
  CHAINS.forEach(({ x, length, end }, index) => {
    const reach = snap(clamp(Math.min(length, room - 24), 8, length));
    // Chains swing a little out of step with each other.
    const [ex, ey] = chain(tools, x, 2, reach, swing * (1 - index * 0.15));
    if (end === "manacle") {
      // An open cuff: a ring with its gap on the right.
      pixelRect(ex - 4, ey, 8, 2, IRON.light, 2);
      pixelRect(ex - 6, ey + 2, 2, 6, IRON.dark, 2);
      pixelRect(ex - 4, ey + 8, 8, 2, IRON.base, 2);
      pixelRect(ex + 4, ey + 6, 2, 2, IRON.glint, 2);
      pixelRect(ex - 4, ey + 2, 2, 2, IRON.base, 2);
    } else if (end === "hook") {
      // A shaft, then a curl up to a point on the left.
      pixelRect(ex - 2, ey, 4, 8, IRON.base, 2);
      pixelRect(ex, ey, 2, 8, IRON.glint, 2);
      pixelRect(ex - 6, ey + 8, 10, 2, IRON.base, 2);
      pixelRect(ex - 4, ey + 10, 6, 2, IRON.dark, 2);
      pixelRect(ex - 8, ey + 2, 2, 8, IRON.dark, 2);
      pixelRect(ex - 8, ey, 2, 2, STEEL.light, 2);
    }
  });
}

// -------------------------------------------------------------------- gibbet

/** The gibbet: its chain's longest drop, and its cage's size. */
export const GIBBET = { chain: 44, height: 58, half: 16 };
/** The longest a gibbet hangs below the roof. */
export const GIBBET_HANG = GIBBET.chain + GIBBET.height + 2;

// A skull with its top at (x, y), facing right or, with `look` -1, left.
function skull({ pixelRect }, x, y, look = 1, jaw = 0, up = 0) {
  pixelRect(x, y, 10, 8, BONE.base, 2);
  pixelRect(x + 2, y - 2, 6, 2, BONE.base, 2);
  pixelRect(x, y, 2, 8, BONE.shade, 2);
  pixelRect(x + 6, y - 2, 2, 2, BONE.light, 2);
  pixelRect(x + 8, y + 2, 2, 2, BONE.light, 2);
  // Sockets and nose, set towards where it looks; the sockets also look up
  // or down by `up`.
  const ex = look < 0 ? x + 2 : look > 0 ? x + 4 : x + 2;
  const ey = y + 2 + up * 2;
  pixelRect(ex, ey, 2, 2, INK, 2);
  pixelRect(ex + 4, ey, 2, 2, look ? IRON.dark : INK, 2);
  if (!look) pixelRect(x + 6, ey, 2, 2, INK, 2);
  pixelRect(ex + 2, y + 6, 2, 2, IRON.dark, 2);
  // The jaw, dropped open by `jaw`.
  pixelRect(x + 2, y + 8 + jaw, 8, 2, BONE.base, 2);
  pixelRect(x + 2, y + 8 + jaw, 2, 2, BONE.shade, 2);
  if (jaw) pixelRect(x + 2, y + 8, 8, jaw, INK, 2);
  pixelRect(x + 4, y + 8, 2, 2, BONE.light, 2);
  pixelRect(x + 8, y + 8, 2, 2, BONE.light, 2);
}

/**
 * A gibbet cage, its hanging ring at (0, 0): a domed top, iron bars, and a
 * skeleton slumped inside with one arm dangling out between the bars.
 */
export function drawGibbetCage({ pixelRect }) {
  const tools = { pixelRect };
  const { half, height } = GIBBET;
  const top = 10, floor = height - 4;
  // The prisoner, sitting hunched, behind the bars.
  skull(tools, -6, top + 10, 1);
  pixelRect(-2, top + 20, 2, 10, BONE.shade, 2);
  for (let i = 0; i < 4; i++) {
    pixelRect(-8, top + 22 + i * 4, 12, 2, BONE.base, 2);
    pixelRect(-8, top + 22 + i * 4, 2, 2, BONE.shade, 2);
  }
  pixelRect(-6, top + 38, 10, 4, BONE.base, 2);
  pixelRect(-6, top + 38, 2, 4, BONE.shade, 2);
  // Knees up, shins down to the cage floor.
  pixelRect(2, top + 36, 10, 2, BONE.base, 2);
  pixelRect(10, top + 36, 2, floor - top - 36, BONE.light, 2);
  pixelRect(8, floor - 2, 6, 2, BONE.shade, 2);
  // The arm that hangs out through the bars, fingers down.
  pixelRect(2, top + 22, 2, 8, BONE.base, 2);
  pixelRect(4, top + 28, 14, 2, BONE.base, 2);
  pixelRect(18, top + 28, 2, 12, BONE.light, 2);
  pixelRect(16, top + 40, 2, 4, BONE.shade, 2);
  pixelRect(20, top + 40, 2, 2, BONE.base, 2);
  // The hanging ring.
  pixelRect(-2, 0, 4, 2, IRON.light, 2);
  pixelRect(-4, 2, 2, 4, IRON.dark, 2);
  pixelRect(2, 2, 2, 4, IRON.light, 2);
  // Dome, stepping out to the sides.
  pixelRect(-6, 6, 12, 2, IRON.light, 2);
  pixelRect(-12, 8, 24, 2, IRON.base, 2);
  pixelRect(4, 8, 8, 2, IRON.light, 2);
  pixelRect(-half, top, half * 2, 2, IRON.base, 2);
  pixelRect(-half, top, 2, 2, IRON.dark, 2);
  // Bars, and the bands round them.
  for (let x = -half; x <= half - 2; x += 6) {
    const lit = x > 0;
    pixelRect(x, top, 2, floor - top, lit ? IRON.light : IRON.dark, 2);
  }
  pixelRect(half - 2, top, 2, floor - top, IRON.glint, 2);
  strap(tools, -half, half, top + 18);
  strap(tools, -half, half, floor - 2);
  // The base plate, with a rust bloom and a point below.
  pixelRect(-half + 2, floor + 2, half * 2 - 4, 2, IRON.dark, 2);
  pixelRect(-6, floor + 2, 6, 2, RUST.dark, 2);
  pixelRect(-2, height - 2, 4, 2, IRON.base, 2);
}

/**
 * A gibbet hanging from the roof at y = 0: its chain, as long as `room`
 * allows, swung out by `swing` (radians, see hangingSwing), and the cage on
 * its end, kept upright. Returns where the cage's ring is, for drawing it.
 */
export function drawGibbetChain({ pixelRect }, room, swing = 0) {
  const length = snap(clamp(room - GIBBET.height - 20, 8, GIBBET.chain));
  pixelRect(-6, 0, 12, 2, IRON.base, 2);
  pixelRect(-6, 0, 2, 2, IRON.dark, 2);
  const [x, y] = chain({ pixelRect }, 0, 2, length, swing);
  return [x, y];
}

// ------------------------------------------------------------------ skeleton

/** How long a skeleton's jaw chatters after a hard landing nearby, and how near it must be. */
export const CHATTER = { time: 0.9, x: 220, y: 140 };

/**
 * A skeleton slumped on the floor, about 38 tall, shackled by the wrist to
 * a ring set in the floor: legs out to the right, spine and ribs, an arm resting on its
 * knee. Its skull is drawn live (drawSkeletonSkull), turning to the rider.
 */
export function drawSkeletonBody({ pixelRect }) {
  // The ring in the floor, and the chain to the wrist.
  pixelRect(-20, -4, 6, 2, IRON.light, 2);
  pixelRect(-20, -2, 2, 2, IRON.dark, 2);
  pixelRect(-16, -2, 2, 2, IRON.base, 2);
  pixelRect(-14, -4, 2, 2, IRON.base, 2);
  // Pelvis on the floor.
  pixelRect(-6, -8, 12, 6, BONE.base, 2);
  pixelRect(-6, -8, 2, 6, BONE.shade, 2);
  pixelRect(-2, -6, 4, 2, IRON.dark, 2);
  pixelRect(4, -8, 2, 2, BONE.light, 2);
  // Thigh up to the knee, shin down to the foot.
  pixelRect(4, -8, 10, 2, BONE.base, 2);
  pixelRect(12, -12, 4, 4, BONE.light, 2);
  pixelRect(16, -10, 2, 4, BONE.base, 2);
  pixelRect(18, -6, 2, 4, BONE.base, 2);
  pixelRect(18, -2, 6, 2, BONE.shade, 2);
  pixelRect(22, -2, 2, 2, BONE.base, 2);
  // The other leg, flat out along the floor.
  pixelRect(4, -4, 22, 2, BONE.shade, 2);
  pixelRect(24, -6, 4, 2, BONE.base, 2);
  // Spine, leaning back.
  for (let y = -10; y > -26; y -= 4) {
    const x = y < -16 ? -4 : -2;
    pixelRect(x, y, 2, 2, BONE.base, 2);
    pixelRect(x, y - 2, 2, 2, BONE.shade, 2);
  }
  // Ribs.
  for (let i = 0; i < 3; i++) {
    const y = -22 + i * 4;
    pixelRect(-8, y, 14 - i * 2, 2, BONE.base, 2);
    pixelRect(-8, y, 2, 2, BONE.shade, 2);
    pixelRect(4 - i * 2, y, 2, 2, BONE.light, 2);
  }
  // The near arm: shoulder down to the elbow, forearm on to the knee.
  pixelRect(4, -24, 2, 10, BONE.base, 2);
  pixelRect(6, -14, 6, 2, BONE.base, 2);
  // The far arm hangs down to the shackle by the ring.
  pixelRect(-10, -22, 2, 10, BONE.shade, 2);
  pixelRect(-12, -12, 2, 6, BONE.shade, 2);
  pixelRect(-14, -8, 4, 4, IRON.base, 2);
  pixelRect(-12, -8, 2, 2, IRON.glint, 2);
}

/** Where the skeleton's skull sits, its top left corner. */
export const SKELETON_SKULL = { x: -6, y: -34 };
/** Where the skeleton looks from. */
export const SKELETON_EYES = { x: SKELETON_SKULL.x + 5, y: SKELETON_SKULL.y + 2 };

/**
 * How far the skeleton's jaw hangs open: 0, or chattering 0 and 2 for a
 * moment after a hard landing nearby (`landing` as in the scene). Still at
 * time 0.
 */
export function skeletonJaw(time, landing, x, y) {
  if (!time || !landing || !Number.isFinite(landing.x) || !Number.isFinite(landing.time)) return 0;
  const age = time - landing.time;
  if (age < 0 || age > CHATTER.time) return 0;
  if (Math.abs(landing.x - x) > CHATTER.x) return 0;
  if (Number.isFinite(landing.y) && Number.isFinite(y) && Math.abs(landing.y - y) > CHATTER.y) return 0;
  return Math.floor(age * 14) % 2 ? 0 : 2;
}

/**
 * The skeleton's skull, looking `look` ({ x, y }, each -1, 0 or 1, in its own
 * frame; see riderGaze in drawing.js) with its jaw dropped by `jaw`. It tips
 * its head back as it turns.
 */
export function drawSkeletonSkull({ pixelRect }, look = { x: 0, y: 0 }, jaw = 0) {
  const { x, y } = SKELETON_SKULL;
  skull({ pixelRect }, x + look.x * 2, y, look.x, jaw, look.y);
}
