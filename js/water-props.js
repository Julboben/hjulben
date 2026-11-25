// @ts-check
// Water props. Like every prop they sit on the 2-unit art grid, have no
// outlines, and are lit from the right: shaded on the left and underneath.
// Each one finds the water body it belongs to (see waterPropBody), and
// drawing.js moves it to where it lives in that body: lily pads and ducks onto
// the surface, fish to their swimming depth, and seaweed and reeds onto the
// bed. Everything here is decoration and never touches the simulation.

/** @typedef {import('./types.js').Water} Water */

/** Props that live in water. */
export const WATER_PROPS = new Set(["lily", "duck", "fish", "seaweed", "reeds", "frog", "boat", "bubbles", "dragonfly"]);
// Props that float on the surface, or hover over it (dragonflies).
export const SURFACE_PROPS = new Set(["lily", "duck", "frog", "boat", "dragonfly"]);
// How far above its anchor a floating prop looks for the surface, and how far
// below it, so a click just above the water still lands on it.
export const SURFACE_REACH = 160;
const SURFACE_ABOVE = 24;
// How far outside a body's rectangle an anchor may be and still belong to it.
const BODY_SLACK = 8;
// How far a fish swims either side of its anchor, and how much room it keeps
// from the walls, the bed and the surface.
export const FISH_RANGE = 96;
export const FISH_CLEARANCE = 6;
// Half a fish's length, nose to tail, which it keeps clear of walls.
export const FISH_HALF = 12;
// How long a startled fish takes to dart off and fade into the deep, in seconds.
export const FISH_DART = 0.8;
// Tallest seaweed, and how far under the surface it stops.
export const SEAWEED_MAX = 72;
const SEAWEED_HEADROOM = 6;
// Reeds stand this tall on dry ground, and this far out of the water in it.
const REED_HEIGHT = 56;
const REED_EMERGE = 28;
export const REED_MAX = 120;

const LEAF = { stem: "#3d6452", dark: "#477158", mid: "#568061", light: "#618b66" };
const PAD = { dark: "#3d6452", base: "#568061", light: "#7da36f" };
const PETAL = { shade: "#d86f82", base: "#ef9aa8", light: "#fffdf4", core: "#f4c64e" };
const KELP = { dark: "#2f5a52", base: "#3f7a66", light: "#5fa07c" };
const CATTAIL = { dark: "#4d3f2f", base: "#66543f", tip: "#aa8a60" };
const REED = { dark: "#3d6452", base: "#568061", dry: "#aa8a60" };
// Bright, so it still reads as a goldfish under the blue of the water.
const CARP = { back: "#ed774e", base: "#ffc295", belly: "#fffdf4", fin: "#c9573a", eye: "#3a403d" };
const MALLARD = {
  head: "#3d6452",
  sheen: "#568f98",
  ring: "#fffdf4",
  chest: "#806244",
  body: "#aeb5a7",
  back: "#8b978c",
  wing: "#697872",
  tail: "#3a403d",
  bill: "#f1b95d",
  eye: "#3a403d",
};

const snap = (value) => Math.round(value / 2) * 2;

/** A fixed 0…1 value per prop and index, so each prop moves its own way. */
export function waterPropNoise(x, n) {
  const s = Math.sin(n * 91.7 + x * 213.3) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The water body a prop belongs to, or null. Floating props take the nearest
 * surface at or above their anchor; the others the body around their anchor.
 * @param {Water[]} bodies normalized bodies
 * @param {string} type
 * @param {number} x
 * @param {number} y the prop's anchor: its own y, or the ground under it
 */
export function waterPropBody(bodies, type, x, y) {
  let found = null;
  for (const body of bodies) {
    if (x < body.x || x > body.x + body.width) continue;
    if (SURFACE_PROPS.has(type)) {
      if (body.y > y + SURFACE_ABOVE || body.y < y - SURFACE_REACH) continue;
      if (!found || body.y > found.y) found = body;
    } else if (
      y >= body.y - BODY_SLACK &&
      y <= body.y + body.depth + BODY_SLACK &&
      !found
    ) {
      found = body;
    }
  }
  return found;
}

/**
 * The depth a fish swims at in its body: its own y kept clear of the surface
 * and the bed, or, with no y of its own, halfway down to the bed under it.
 */
export function fishSwimY(body, anchorY, explicit) {
  const top = body.y + FISH_CLEARANCE;
  const bottom = body.y + body.depth - FISH_CLEARANCE;
  if (bottom <= top) return body.y + body.depth / 2;
  const y = explicit ? anchorY : (body.y + Math.min(anchorY, body.y + body.depth)) / 2;
  return Math.max(top, Math.min(bottom, y));
}

/** How tall seaweed grows from the bed, `room` below the surface (or null). */
export function seaweedHeight(room) {
  if (room === null) return 18;
  return snap(Math.max(10, Math.min(SEAWEED_MAX, room - SEAWEED_HEADROOM)));
}

/** How tall reeds grow from the bed, `room` below the surface (or null). */
export function reedHeight(room) {
  if (room === null || room <= 0) return REED_HEIGHT;
  return snap(Math.min(REED_MAX, room + REED_EMERGE));
}

/**
 * Where a fish that was startled at `from` (see fishSwim) is `age` seconds
 * later: darting away in `dir`, and diving where a wall stops it, but never
 * out of the open water its fit allows.
 */
export function fishDart(fit, from, dir, age) {
  const want = from.dx + dir * (80 * age + 240 * age * age);
  const dx = Math.max(-(fit?.left ?? 0), Math.min(fit?.right ?? 0, want));
  const dy = from.dy + 20 * age + Math.abs(want - dx) * 0.5;
  return { dx, dy: Math.min(dy, Math.max(from.dy, fit?.down ?? 0)) };
}

/**
 * Where a fish is at `time`, from its anchor: it swims from end to end of the
 * open water it has (`fit.left` and `fit.right` either side of its anchor),
 * easing into each turn. At time 0 it is at its anchor, heading the way it
 * faces. Returns the offset and which way it is heading.
 */
export function fishSwim(x, fit, time, flip = false) {
  const left = fit?.left ?? 0;
  const right = fit?.right ?? 0;
  const span = left + right;
  const bob = snap(Math.sin(time * (1.4 + waterPropNoise(x, 2) * 0.6)) * 2);
  const start = flip ? -1 : 1;
  if (span < 8) {
    // No room to swim: it hangs there and turns now and then.
    const turn = Math.floor((time + waterPropNoise(x, 3) * 4) / 4) % 2;
    return { dx: 0, dy: bob, dir: time > 0 && turn ? -start : start };
  }
  const speed = 14 + waterPropNoise(x, 1) * 10;
  const rate = (Math.PI * speed) / span;
  const begin = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * left) / span)));
  const theta = (flip ? 2 * Math.PI - begin : begin) + rate * time;
  const dx = -left + (span * (1 - Math.cos(theta))) / 2;
  const heading = Math.sin(theta);
  return { dx, dy: bob, dir: heading > 0 ? 1 : heading < 0 ? -1 : start };
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------

// Lily pads as [left, width], at the surface.
const PADS = [[-16, 16], [2, 12], [14, 6]];

/**
 * Lily pads with a flower, floating at y = 0. `wave(localX)` is how far the
 * surface has risen or fallen under each pad, so they ride the ripples.
 */
export function drawLily({ pixelRect }, wave) {
  PADS.forEach(([left, width], index) => {
    const lift = snap(wave(left + width / 2));
    // A notch in the top of the larger pads.
    const notch = width > 8 ? left + width / 2 - (index % 2 ? 2 : 0) : null;
    pixelRect(left + 2, lift - 2, width - 4, 2, PAD.base, 2);
    if (notch !== null) pixelRect(notch, lift - 2, 2, 2, PAD.dark, 2);
    pixelRect(left + width - 4, lift - 2, 2, 2, PAD.light, 2);
    pixelRect(left, lift, width, 2, PAD.dark, 2);
    pixelRect(left + width - 2, lift, 2, 2, PAD.base, 2);
  });
  // A water lily open on the big pad.
  const lift = snap(wave(-8));
  pixelRect(-12, lift - 4, 8, 2, PETAL.shade, 2);
  pixelRect(-14, lift - 6, 10, 2, PETAL.base, 2);
  pixelRect(-10, lift - 6, 2, 2, PETAL.core, 2);
  pixelRect(-12, lift - 8, 2, 2, PETAL.base, 2);
  pixelRect(-8, lift - 8, 2, 2, PETAL.light, 2);
  pixelRect(-6, lift - 6, 2, 2, PETAL.light, 2);
}

// Reed stalks as [x, share of the height, whether it carries a cattail].
/** @type {[number, number, boolean][]} */
const STALKS = [[-8, 0.75, false], [-4, 1, true], [0, 0.6, false], [4, 0.9, true], [8, 0.5, false]];

/**
 * Reeds `height` tall standing on y = 0, with a couple of brown cattails,
 * bent `downwind` (-1 left, 1 right) and swaying faster and further the
 * stronger the `wind` (0…1). `groundOffset` seats each stalk on the ground
 * under it.
 */
export function drawReeds({ pixelRect }, height, time, x, groundOffset, wind = 0.25, downwind = -1) {
  const bend = downwind * wind * 14;
  STALKS.forEach(([sx, share, cattail], index) => {
    const base = snap(groundOffset(sx));
    const length = snap(height * share * (0.85 + waterPropNoise(x, index) * 0.3));
    const phase = waterPropNoise(x, index + 7) * 6;
    let top = { x: sx, y: base };
    for (let py = 0; py < length; py += 2) {
      const t = py / length;
      const sway = time ? Math.sin(time * (0.9 + wind * 2.4) + phase) * (1 + wind * 5) : 0;
      const lean = snap((sway + (index - 2) * 3 + bend) * t * t);
      const color = t < 0.4 ? REED.dark : t > 0.9 && !cattail ? REED.dry : REED.base;
      pixelRect(sx + lean, base - py - 2, 2, 2, color, 2);
      top = { x: sx + lean, y: base - py - 2 };
    }
    if (!cattail) return;
    pixelRect(top.x - 2, top.y - 10, 2, 10, CATTAIL.dark, 2);
    pixelRect(top.x, top.y - 10, 2, 10, CATTAIL.base, 2);
    pixelRect(top.x, top.y - 14, 2, 4, CATTAIL.tip, 2);
  });
  // A few blades of leaf at the foot.
  for (const [lx, dir, length] of [[-6, -1, 18], [2, 1, 24], [6, 1, 14]]) {
    const base = snap(groundOffset(lx));
    for (let py = 0; py < length; py += 2) {
      const t = py / length;
      pixelRect(lx + snap((dir * 8 + bend * 0.6) * t * t), base - py - 2, 2, 2, t < 0.5 ? LEAF.dark : LEAF.mid, 2);
    }
  }
}

// Seaweed strands as [x, share of the height].
const STRANDS = [[-6, 0.65], [-2, 1], [2, 0.8], [6, 0.55]];

/**
 * Seaweed `height` tall growing up from y = 0, its strands rippling in the
 * current more the higher they reach.
 */
export function drawSeaweed({ pixelRect }, height, time, x, groundOffset) {
  STRANDS.forEach(([sx, share], index) => {
    const base = snap(groundOffset(sx));
    const length = Math.max(6, snap(height * share * (0.85 + waterPropNoise(x, index + 3) * 0.3)));
    const phase = waterPropNoise(x, index + 11) * 6;
    for (let py = 0; py < length; py += 2) {
      const reach = Math.min(1, py / 16);
      const sway = snap(Math.sin(py * 0.14 - time * 1.8 + phase) * 3 * reach);
      const left = sx + sway;
      pixelRect(left, base - py - 2, 2, 2, py < 6 ? KELP.dark : KELP.base, 2);
      // A leaf every few rows, off alternate sides.
      if (py % 10 === 6 && py < length - 4) {
        const side = (py / 10 + index) % 2 ? 2 : -2;
        pixelRect(left + side, base - py - 2, 2, 2, side > 0 ? KELP.light : KELP.dark, 2);
      }
    }
  });
}

/** A carp facing right, centred on y = 0; `flick` swings its tail. */
export function drawFish({ pixelRect }, flick) {
  const c = CARP;
  pixelRect(-2, -6, 4, 2, c.fin, 2);
  pixelRect(-4, -4, 8, 2, c.back, 2);
  pixelRect(-6, -2, 12, 2, c.base, 2);
  pixelRect(-6, 0, 14, 2, c.base, 2);
  pixelRect(-2, 0, 6, 2, c.belly, 2);
  pixelRect(-4, 2, 8, 2, c.back, 2);
  pixelRect(4, -2, 2, 2, c.eye, 2);
  if (flick) {
    pixelRect(-10, -2, 4, 4, c.fin, 2);
    pixelRect(-12, -4, 2, 2, c.fin, 2);
  } else {
    pixelRect(-8, -2, 2, 4, c.fin, 2);
    pixelRect(-10, -4, 2, 2, c.fin, 2);
    pixelRect(-10, 2, 2, 2, c.fin, 2);
  }
}

/**
 * A mallard floating with its waterline at y = 0, facing right. Dabbling, it
 * tips up with its head under water and its tail in the air.
 */
export function drawDuckFloating({ pixelRect }, dabble = false) {
  const c = MALLARD;
  if (dabble) {
    pixelRect(-4, -12, 2, 4, c.tail, 2);
    pixelRect(-2, -10, 2, 2, c.ring, 2);
    pixelRect(-4, -8, 10, 4, c.body, 2);
    pixelRect(-4, -8, 4, 2, c.back, 2);
    pixelRect(-2, -6, 6, 2, c.wing, 2);
    pixelRect(-4, -4, 12, 4, c.body, 2);
    pixelRect(4, -4, 4, 2, c.chest, 2);
    return;
  }
  pixelRect(-12, -8, 2, 2, c.tail, 2);
  pixelRect(-12, -6, 4, 2, c.tail, 2);
  pixelRect(-10, -6, 16, 6, c.body, 2);
  pixelRect(-8, -6, 12, 2, c.back, 2);
  pixelRect(-6, -4, 10, 2, c.wing, 2);
  pixelRect(4, -6, 4, 6, c.chest, 2);
  pixelRect(4, -8, 4, 2, c.ring, 2);
  pixelRect(4, -14, 6, 6, c.head, 2);
  pixelRect(6, -14, 4, 2, c.sheen, 2);
  pixelRect(8, -12, 2, 2, c.eye, 2);
  pixelRect(10, -10, 4, 2, c.bill, 2);
}

/** A mallard in flight, facing right; `wingsUp` picks the wingbeat frame. */
export function drawDuckFlying({ pixelRect }, wingsUp) {
  const c = MALLARD;
  pixelRect(-12, -6, 4, 2, c.tail, 2);
  pixelRect(-8, -8, 14, 4, c.body, 2);
  pixelRect(-6, -8, 10, 2, c.back, 2);
  pixelRect(4, -6, 4, 2, c.chest, 2);
  pixelRect(6, -8, 2, 2, c.ring, 2);
  pixelRect(8, -10, 4, 4, c.head, 2);
  pixelRect(10, -10, 2, 2, c.eye, 2);
  pixelRect(12, -8, 4, 2, c.bill, 2);
  if (wingsUp) {
    pixelRect(-4, -14, 8, 6, c.wing, 2);
    pixelRect(-2, -18, 4, 4, c.wing, 2);
    pixelRect(2, -14, 2, 4, c.sheen, 2);
  } else {
    pixelRect(-4, -4, 8, 4, c.wing, 2);
    pixelRect(-2, 0, 4, 2, c.wing, 2);
  }
}

// ---------------------------------------------------------------------------
// Frog on a lily pad
// ---------------------------------------------------------------------------

const FROG = { dark: "#3d6452", base: "#618b66", light: "#86a56a", belly: "#d9dccb", eye: "#f1b95d", pupil: "#182321" };
/** How long the frog's leap takes, in seconds, before it splashes in. */
export const FROG_LEAP = 0.55;

/**
 * Where a startled frog is `age` seconds after it leaps, from its pad: an arc
 * up and away from the rider (`dir` -1 left, 1 right), down into the water.
 * Returns its offset, whether it is still in the air, and how far the rings
 * from its splash have spread (0 until it lands).
 */
export function frogLeap(age, dir) {
  const t = Math.min(age, FROG_LEAP) / FROG_LEAP;
  return {
    dx: snap(dir * 46 * t),
    dy: snap(-34 * Math.sin(Math.PI * t) + 6 * t),
    flying: age < FROG_LEAP,
    rings: age < FROG_LEAP ? 0 : age - FROG_LEAP,
  };
}

/** The frog's own small pad, floating at y = 0, riding `lift`. */
export function drawFrogPad({ pixelRect }, lift = 0) {
  pixelRect(-10, lift - 2, 18, 2, PAD.base, 2);
  pixelRect(-2, lift - 2, 2, 2, PAD.dark, 2);
  pixelRect(4, lift - 2, 2, 2, PAD.light, 2);
  pixelRect(-12, lift, 22, 2, PAD.dark, 2);
  pixelRect(8, lift, 2, 2, PAD.base, 2);
}

/**
 * A frog sitting on its haunches with its feet at y = 0, facing right, about
 * 12 long: green, lit along its back, a pale throat and a gold eye. `blink`
 * shuts the eye; `leaping` stretches it out with its legs trailing.
 */
export function drawFrog({ pixelRect }, blink = false, leaping = false) {
  const c = FROG;
  if (leaping) {
    pixelRect(-12, -4, 6, 2, c.dark, 2);
    pixelRect(-8, -6, 14, 4, c.base, 2);
    pixelRect(-6, -6, 10, 2, c.light, 2);
    pixelRect(-6, -2, 10, 2, c.belly, 2);
    pixelRect(6, -8, 4, 4, c.base, 2);
    pixelRect(8, -8, 2, 2, c.eye, 2);
    pixelRect(10, -4, 2, 2, c.dark, 2);
    return;
  }
  // Haunches and a folded back leg.
  pixelRect(-8, -6, 6, 6, c.dark, 2);
  pixelRect(-8, -2, 8, 2, c.base, 2);
  // Body, lit along the back, its throat pale.
  pixelRect(-4, -8, 10, 6, c.base, 2);
  pixelRect(-4, -8, 8, 2, c.light, 2);
  pixelRect(2, -4, 6, 2, c.belly, 2);
  // Front leg and head.
  pixelRect(4, -2, 4, 2, c.dark, 2);
  pixelRect(4, -10, 6, 4, c.base, 2);
  pixelRect(4, -12, 4, 2, c.light, 2);
  pixelRect(6, -12, 2, 2, blink ? c.base : c.eye, 2);
  if (!blink) pixelRect(6, -10, 2, 2, c.pupil, 2);
}

// ---------------------------------------------------------------------------
// Rowing boat
// ---------------------------------------------------------------------------

const HULL = { shade: "#b5bcae", base: "#f4e9d1", light: "#fffdf4", stripe: "#a8322a", keel: "#4d3f2f" };
const OAR = { shaft: "#aa8a60", blade: "#856d4f" };
/** The boat's length either side of its anchor, and how high it rides. */
export const BOAT = { half: 32, gunwale: -14 };

/**
 * A wooden rowing boat with its waterline at y = 0, bow to the right, about
 * 64 long (2.4 m): a white-painted hull with a red stripe under the varnished
 * gunwale, a pointed bow and a square stern, its oars left lying in it, and
 * a mooring rope from the bow sagging down into the water.
 */
export function drawBoat({ pixelRect, pixelPath }) {
  const { half, gunwale } = BOAT;
  // The oars left in the boat: one lying along it, its flat blade out past
  // the stern; just the handle of the other showing.
  pixelPath([[-22, gunwale - 2], [20, gunwale - 4]], OAR.shaft, 1, 2);
  pixelRect(-32, gunwale - 2, 10, 2, OAR.blade, 2);
  pixelRect(-32, gunwale, 10, 2, OAR.shaft, 2);
  pixelRect(8, gunwale - 6, 2, 6, OAR.shaft, 2);
  // The hull, row by row: a square stern, the bow drawing in to a point.
  for (let y = gunwale; y < 2; y += 2) {
    const down = (y - gunwale) / 2;
    const left = -half + 2 + Math.floor(down / 3) * 2;
    const right = half - down * 2;
    if (right <= left) continue;
    const color = y === gunwale ? OAR.shaft : y === gunwale + 2 ? HULL.stripe : y >= -2 ? HULL.shade : HULL.base;
    pixelRect(left, y, right - left, 2, color, 2);
    if (y > gunwale + 2 && y < -2) {
      pixelRect(left, y, 2, 2, HULL.shade, 2);
      pixelRect(right - 2, y, 2, 2, HULL.light, 2);
    }
  }
  // A plank seam along the hull.
  pixelRect(-half + 6, gunwale + 8, half * 2 - 18, 2, HULL.shade, 2);
  // The bow ring and the mooring rope, sagging down into the water.
  pixelRect(half - 4, gunwale + 2, 2, 2, HULL.keel, 2);
  pixelPath([[half - 2, gunwale + 4], [half + 6, gunwale + 12], [half + 12, 2]], HULL.keel, 1, 2);
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

/**
 * The bubbles rising from the bed at `time`, `rise` below the surface (or
 * null with no water above): now and then a short string of two or three,
 * wobbling as they rise, each popping in a fleck at the surface. Each is
 * { x, y, size, popped } from the bed at y = 0. None at time 0.
 */
export function risingBubbles(time, rise, phase = 0) {
  if (!time || !(rise > 6)) return [];
  const bubbles = [];
  const speed = 26;
  const climb = rise / speed;
  // A string of bubbles every few seconds, each string its own size.
  const period = 3.5 + phase * 2.5;
  const cycle = Math.floor((time + phase * period) / period);
  for (const k of [cycle - 1, cycle]) {
    const start = k * period - phase * period;
    const count = 2 + Math.floor(waterPropNoise(k, 7 + phase) * 2);
    for (let i = 0; i < count; i++) {
      const age = time - start - i * 0.35;
      if (age < 0 || age > climb + 0.25) continue;
      const up = Math.min(rise, age * speed * (1 + i * 0.08));
      const wobble = snap(Math.sin(age * 6 + i * 2 + phase * 9) * 2);
      bubbles.push({
        x: wobble + (i % 2 ? 2 : 0),
        y: -snap(up),
        size: i === 0 && waterPropNoise(k, 11) > 0.5 ? 4 : 2,
        popped: age > climb,
      });
    }
  }
  return bubbles;
}

const BUBBLE = { rim: "#d9ffff", core: "#83d1ce" };

/**
 * Bubbles as risingBubbles gives them, or the ones a splash lets go of:
 * little rings 2, 4 or 6 across with (x, y) at their lower left, and flecks
 * where they pop.
 */
export function drawBubbles({ pixelRect }, bubbles) {
  for (const { x, y, size, popped } of bubbles) {
    if (popped) {
      pixelRect(x - 2, y - 2, 2, 2, BUBBLE.rim, 2);
      pixelRect(x + 2, y - 2, 2, 2, BUBBLE.rim, 2);
    } else if (size > 4) {
      // A big one: a ring, lit at the top left.
      pixelRect(x, y - 6, 6, 2, BUBBLE.rim, 2);
      pixelRect(x - 2, y - 4, 2, 4, BUBBLE.rim, 2);
      pixelRect(x + 6, y - 4, 2, 4, BUBBLE.core, 2);
      pixelRect(x, y, 6, 2, BUBBLE.core, 2);
      pixelRect(x + 2, y - 4, 2, 2, BUBBLE.rim, 2);
    } else if (size > 2) {
      pixelRect(x, y - 4, 4, 4, BUBBLE.core, 2);
      pixelRect(x + 2, y - 4, 2, 2, BUBBLE.rim, 2);
    } else pixelRect(x, y - 2, 2, 2, BUBBLE.rim, 2);
  }
}

// ---------------------------------------------------------------------------
// Dragonflies
// ---------------------------------------------------------------------------

const DRAGONFLY = { body: "#3f6f78", tail: "#568f98", head: "#2f5a52", wing: "#d9ffff", glint: "#fffdf4" };
/** How far a dragonfly roams either side of its anchor, and above the water. */
export const DRAGONFLY_RANGE = { x: 56, low: 10, high: 46 };

/**
 * Where the `index`th dragonfly of a pair is at `time`, over the water at
 * y = 0: hovering at a spot for a second or two, then darting to the next,
 * the way they do. Returns its offset and which way it faces. At time 0 it
 * hovers at its first spot.
 */
export function dragonflyAt(time, phase, index) {
  const spot = (n) => ({
    x: snap((waterPropNoise(n * 3 + index, 21 + phase) * 2 - 1) * DRAGONFLY_RANGE.x),
    y: -snap(DRAGONFLY_RANGE.low + waterPropNoise(n * 5 + index, 22 + phase) * (DRAGONFLY_RANGE.high - DRAGONFLY_RANGE.low)),
  });
  const hover = 1.4 + index * 0.3, dart = 0.25, step = hover + dart;
  const clock = time + phase * step * 3 + index * 0.9;
  const n = Math.floor(clock / step);
  const into = clock - n * step;
  const from = spot(n), to = spot(n + 1);
  // A tiny bob while it hovers.
  const bob = time ? snap(Math.sin(time * 9 + index) * 1) : 0;
  if (into < hover || !time) return { x: from.x, y: from.y + bob, dir: to.x >= from.x ? 1 : -1 };
  const t = (into - hover) / dart;
  return { x: snap(from.x + (to.x - from.x) * t), y: snap(from.y + (to.y - from.y) * t), dir: to.x >= from.x ? 1 : -1 };
}

/**
 * A dragonfly about 14 long facing right, its body at (0, 0): a slender
 * blue-green body, and two pairs of glassy wings, up or down by `wingsUp`.
 */
export function drawDragonfly({ pixelRect }, wingsUp = false) {
  const c = DRAGONFLY;
  pixelRect(-8, 0, 8, 2, c.tail, 2);
  pixelRect(0, 0, 4, 2, c.body, 2);
  pixelRect(4, -2, 2, 4, c.head, 2);
  const wy = wingsUp ? -4 : -2;
  pixelRect(-4, wy, 4, 2, c.wing, 2);
  pixelRect(2, wy, 4, 2, c.wing, 2);
  pixelRect(4, wy, 2, 2, c.glint, 2);
}

