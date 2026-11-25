// @ts-check
// Coast props: shells, driftwood, a crab, bunting and a shipwreck, and the
// beach toys: a pail and spade, pennants, shells pressed into a wall and a
// beach ball. Like every prop they sit on the 2-unit art grid, have no
// outlines, and are lit from the right: shaded on the left and underneath.
// The driftwood and the shipwreck are drawn once into sprites by drawing.js,
// with the sand drifted against them, and tilt with the slope they lie on,
// like the car wreck; the rest are drawn live.
//
// The crab scuttles about its anchor along the ground drawing.js traces for it
// (`fit`, read with corgiGround and corgiReach, as the rabbit does). When the
// rider comes close it raises its claws and burrows into the sand; a wheel
// that gets to it first bowls it over, and it lies on its back waving its
// legs before it rights itself and burrows after all. render.js startles it
// like the other animals and notices a wheel running it over, so all of this
// is a pure function of how long ago that happened.
//
// The beach ball goes wherever the wheels push it, bouncing off the terrain
// and floating on water: render.js keeps its state for the ride and moves it
// on each frame with ballStep, as it walks Coda with corgiStep.
//
// Decoration only: none of it touches the simulation, and at time 0 (the
// editor, thumbnails, reduced motion) the crab and the ball sit still and the
// flags hang straight.

import { GRAVITY } from "./config.js";
import { CORGI_STEP, corgiGround, corgiReach, drawGrid } from "./corgi-props.js";
import { flagDroop, flagRipple } from "./countryside-props.js";
import { desertNoise } from "./desert-props.js";

/** Snaps a value onto the 2-unit art grid. */
const snap = (value) => Math.round(value / 2) * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The sand terrain's own colours, so drifts blend into it.
const SAND = { dark: "#c2a674", base: "#d8c08e", light: "#e6d2a3" };
const SHELL = { shade: "#c2a674", base: "#f4e9d1", light: "#fffdf4", pink: "#ef9aa8", rose: "#d86f82", deep: "#a98e61" };
const STAR = { base: "#c9573a", light: "#e8755b" };
const MUSSEL = { base: "#3a403d", sheen: "#3f6f78" };
// Sun-bleached wood, silver-grey from the hull and haze palettes.
const DRIFT = { deep: "#697872", dark: "#8b978c", base: "#b5bcae", light: "#d9dccb", top: "#eef3ed" };
const WOOD = { deep: "#3a3128", dark: "#4d3f2f", base: "#66543f", plank: "#806244", light: "#856d4f", tip: "#aa8a60" };
const WEATHERED = { dark: "#697872", base: "#8b978c", light: "#a2ab9e" };
const TEAL = { dark: "#3f6f78", base: "#568f98", light: "#83d1ce" };
const KELP = { dark: "#2f5a52" };
const RED = { dark: "#a8322a", base: "#d63b2c", light: "#e8755b" };
const YELLOW = { dark: "#d9953a", base: "#f1b95d", light: "#ffe39a" };
const WHITE = { dark: "#b5bcae", base: "#f4e9d1", light: "#fffdf4" };
const POLE = { dark: "#4d3f2f", base: "#856d4f", tip: "#aa8a60" };
// The blue of the blue helmet and bike.
const BLUE = { dark: "#2a4c88", base: "#3f6fc0", light: "#7ea6e6" };
const GLASS = { green: "#8fc7a0", greenLight: "#c9ecd2", blue: "#83d1ce", blueLight: "#c8f0ee" };
/** Crab shells: a red one and the green-brown Danish shore crab. */
export const CRAB_COLORS = {
  red: { a: "#e8755b", b: "#a8322a", c: "#71392f", k: "#a8322a", l: "#71392f", e: "#182321", u: "#f4e9d1", v: "#d9b884" },
  shore: { a: "#a65a49", b: "#58784d", c: "#3d4a36", k: "#58784d", l: "#3d4a36", e: "#182321", u: "#f4e9d1", v: "#d9b884" },
};

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

const SCALLOP = [".abba.", "abaaba", "cbabbb", ".cbba.", "..dd.."];
const WHELK = ["..a.", ".ba.", "cbba", "cbab", ".cb."];
const STARFISH = ["...b...", "..bab..", "bbbabba", ".bb.bb.", "b.....b"];
const MUSSEL_ROWS = [".mms.", "mmsss", ".mm.."];
const SHELL_KINDS = {
  scallop: { rows: SCALLOP, keys: { a: SHELL.light, b: SHELL.pink, c: SHELL.rose, d: SHELL.shade } },
  cockle: { rows: SCALLOP, keys: { a: SHELL.light, b: SHELL.base, c: SHELL.shade, d: SHELL.deep } },
  whelk: { rows: WHELK, keys: { a: SHELL.light, b: SHELL.base, c: SHELL.shade } },
  star: { rows: STARFISH, keys: { a: STAR.light, b: STAR.base } },
  mussel: { rows: MUSSEL_ROWS, keys: { m: MUSSEL.base, s: MUSSEL.sheen } },
};
/**
 * The ways a scatter of shells can lie: [kind, left x] for each shell.
 * @type {Array<Array<[keyof typeof SHELL_KINDS, number]>>}
 */
export const SHELL_LAYOUTS = [
  [["scallop", -16], ["mussel", -2], ["star", 8]],
  [["whelk", -12], ["cockle", -2], ["mussel", 12]],
  [["star", -18], ["scallop", 0], ["whelk", 12]],
];
/** Which layout a scatter at `x` lies in, so the editor shows what the game will. */
export const shellsLayout = (x) => Math.floor(desertNoise(x, 73) * SHELL_LAYOUTS.length);
/** How far the shells reach either side of the anchor, and how tall the tallest is. */
export const SHELLS_BOUNDS = [-18, -10, 26, 2];

/** A scatter of shells, each seated on the ground under it. */
export function drawShells(tools, layout, groundOffset) {
  for (const [kind, x] of SHELL_LAYOUTS[layout]) {
    const { rows, keys } = SHELL_KINDS[kind];
    const ground = snap(groundOffset(x + rows[0].length));
    drawGrid(tools, x, ground - rows.length * 2 + 2, rows, keys);
  }
}

// ---------------------------------------------------------------------------
// Driftwood
// ---------------------------------------------------------------------------

/** The driftwood's sprite bounds: [left, top, right, bottom]. */
export const DRIFTWOOD_BOUNDS = [-46, -34, 34, 2];

/**
 * A bleached log about 2 m long, sunk a little into the sand with small drifts
 * against it, its root knot on the left and a broken branch on the right.
 */
export function drawDriftwood({ pixelRect, pixelPath }) {
  // Roots behind the knot, and the stump of the branch.
  pixelPath([[-32, -12], [-38, -18], [-38, -24], [-42, -28]], DRIFT.dark, 2, 2);
  pixelPath([[-28, -18], [-28, -26], [-24, -32]], DRIFT.base, 2, 2);
  pixelPath([[-34, -6], [-40, -6], [-44, -10]], DRIFT.dark, 2, 2);
  pixelPath([[-36, -14], [-44, -18]], DRIFT.base, 2, 2);
  pixelPath([[12, -10], [16, -16], [22, -20]], DRIFT.base, 2, 2);
  pixelPath([[12, -12], [16, -18]], DRIFT.light, 2, 2);
  pixelRect(22, -22, 2, 2, DRIFT.top, 2);
  for (let x = -34; x < 32; x += 2) {
    const t = (x + 34) / 66;
    const knot = x < -22 ? 6 * (1 - (x + 34) / 12) : 0;
    const h = snap(16 - t * 6 + knot + Math.sin(x * 0.35) * 1.2);
    const top = 2 - h;
    pixelRect(x, top, 2, h, DRIFT.base, 2);
    pixelRect(x, top, 2, 2, DRIFT.top, 2);
    pixelRect(x, top + 2, 2, 2, DRIFT.light, 2);
    // Grain along the log, and its shaded underside.
    const grain = snap(top + h * 0.5 + Math.sin(x * 0.15) * 2);
    if ((x / 2) % 6 !== 0) pixelRect(x, grain, 2, 2, DRIFT.dark, 2);
    pixelRect(x, -2, 2, 4, DRIFT.dark, 2);
  }
  // The broken end catches the light, and a knot hole.
  pixelRect(30, -8, 2, 8, DRIFT.top, 2);
  pixelRect(-10, -10, 4, 2, DRIFT.deep, 2);
  pixelRect(-8, -8, 2, 2, DRIFT.deep, 2);
  for (const [x, w, h] of [[-36, 8, 2], [-30, 6, 4], [-8, 10, 2], [24, 8, 2], [30, 4, 2]]) {
    pixelRect(x, -h, w, h + 2, SAND.base, 2);
    pixelRect(x, -h, w, 2, SAND.light, 2);
  }
}

// ---------------------------------------------------------------------------
// Crab
// ---------------------------------------------------------------------------

/** A crab's fixed 0…1 phase, from where it is placed, so each one differs. */
export const crabPhase = (x) => desertNoise(x, 71);
/** Which shell a crab at `x` has (a key of CRAB_COLORS). */
export const crabColors = (x) => (desertNoise(x, 72) < 0.5 ? "red" : "shore");

/** Its path is traced every CRAB_STEP units, the corgi's step, so corgiGround reads it. */
export const CRAB_STEP = CORGI_STEP;
/** The largest step up or down it will scuttle over, in world units. */
export const CRAB_STEP_UP = 6;
/** How far either side of its anchor it can ever go, bowled over, in world units. */
export const CRAB_RANGE = 72;
/** How far either side of its anchor it scuttles about. */
export const CRAB_WANDER = 36;
/** Seconds per spell: a scuttle to a new spot, then a rest there. */
export const CRAB_SPELL = 3.2;
/** How fast it scuttles, in units per second, and how often its legs change step. */
export const CRAB_SPEED = 40;
const STRIDE = 0.08;
/** Startled, it raises its claws for a moment, then digs itself in. */
export const CRAB_ALARM = 0.2;
export const CRAB_DIG = 0.5;
/** Seconds from being startled until it is buried, left alone. */
export const CRAB_BURIED = CRAB_ALARM + CRAB_DIG;
/** Bowled over: flung this far and this high over this long, then on its back, then righting itself. */
export const CRAB_FLING = 30;
const FLING_HEIGHT = 16;
const TUMBLE = 0.45;
const ON_BACK = 1.1;
const RIGHTING = 0.2;
/** Seconds from being bowled over until it is buried. */
export const CRAB_KNOCKED = TUMBLE + ON_BACK + RIGHTING + CRAB_DIG;
/** The longest a startled crab can stay in sight: bowled over just before it was buried. */
export const CRAB_FLEE = CRAB_BURIED + CRAB_KNOCKED;
/** How close a wheel's foot must come to bowl it over: across, and up or down. */
export const CRAB_HIT = { x: 12, y: 10 };
/** How tall it stands, and the sprite's bounds: [left, top, right, bottom]. */
export const CRAB_HEIGHT = 14;
export const CRAB_BOUNDS = [-12, -CRAB_HEIGHT, 12, 0];

/** Where it rests in spell `spell`, as an offset from its anchor within `reach`. */
function crabSpot(spell, phase, reach) {
  const low = Math.max(reach.min, -CRAB_WANDER);
  const high = Math.min(reach.max, CRAB_WANDER);
  let k = spell;
  for (let i = 0; i < 2 && desertNoise(phase, k * 5 + 1) < 0.3; i++) k--;
  return snap(low + (high - low) * desertNoise(phase, k * 5 + 2));
}

/** Its legs' step at `time` while it moves: "stand" and "step" in turn. */
const legs = (time) => (Math.floor(time / STRIDE) % 2 ? "step" : "stand");

/**
 * What a crab nobody has startled is doing at `time`: its offset `dx` from
 * the anchor, its feet's height `dy` (relative to the anchor, up is negative)
 * and its `pose`: "stand", "step" (legs on the other foot) or "alarm" (claws
 * raised), which it does now and then while resting. Still at time 0.
 */
export function crabIdle(time, phase, fit) {
  if (!(time > 0)) return { dx: 0, dy: 0, pose: "stand" };
  const reach = corgiReach(fit);
  const clock = time / CRAB_SPELL + phase * 11;
  const spell = Math.floor(clock);
  const into = (clock - spell) * CRAB_SPELL;
  const from = crabSpot(spell - 1, phase, reach);
  const to = crabSpot(spell, phase, reach);
  const walk = Math.abs(to - from) / CRAB_SPEED;
  if (into < walk) {
    const dx = from + (to - from) * (into / walk);
    return { dx, dy: corgiGround(fit, dx), pose: legs(into) };
  }
  // Resting, it waves its claws now and then.
  const rest = into - walk;
  const wave = desertNoise(phase, spell * 5 + 3) < 0.4 && rest > 0.6 && (rest * 1.5) % 1 < 0.35;
  return { dx: to, dy: corgiGround(fit, to), pose: wave ? "alarm" : "stand" };
}

/**
 * Where a crab startled `age` seconds ago is, having been at offset `from`
 * when it was. Left alone it raises its claws, then digs in where it stands.
 * Bowled over `knocked` seconds after it was startled (null if it never was),
 * it is flung `dir` (the way the wheel was going), tumbling, lies on its back
 * waving its legs, rights itself and digs in there. Returns its offset `dx`,
 * its feet's height `dy`, its `pose` ("back" and "kick" on its back), how far
 * it has sunk into the sand (`sink`), its turn in radians as it tumbles over
 * and rights itself (`angle`), whether it is
 * kicking up sand (`digging`) and whether it has gone (`hidden`).
 */
export function crabFlee(fit, from, dir, age, knocked = null) {
  const reach = corgiReach(fit);
  const start = clamp(from, reach.min, reach.max);
  const dig = (dx, t) => {
    const f = clamp(t / CRAB_DIG, 0, 1);
    return { dx, dy: corgiGround(fit, dx), pose: legs(t), sink: snap(f * CRAB_HEIGHT), angle: 0, digging: f < 1, hidden: f >= 1 };
  };
  if (knocked === null || age < knocked) {
    if (age < CRAB_ALARM) return { dx: start, dy: corgiGround(fit, start), pose: "alarm", sink: 0, angle: 0, digging: false, hidden: false };
    return dig(start, age - CRAB_ALARM);
  }
  const t = age - knocked;
  const land = clamp(start + dir * CRAB_FLING, reach.min, reach.max);
  if (t < TUMBLE) {
    const f = t / TUMBLE;
    const dx = start + (land - start) * f;
    const dy = corgiGround(fit, start) + (corgiGround(fit, land) - corgiGround(fit, start)) * f - FLING_HEIGHT * 4 * f * (1 - f);
    return { dx, dy, pose: "alarm", sink: 0, angle: dir * Math.PI * f, digging: false, hidden: false };
  }
  const dy = corgiGround(fit, land);
  if (t < TUMBLE + ON_BACK) return { dx: land, dy, pose: legs(t) === "step" ? "kick" : "back", sink: 0, angle: 0, digging: false, hidden: false };
  if (t < TUMBLE + ON_BACK + RIGHTING) {
    const f = (t - TUMBLE - ON_BACK) / RIGHTING;
    return { dx: land, dy, pose: "alarm", sink: 0, angle: dir * Math.PI * (1 - f), digging: false, hidden: false };
  }
  return dig(land, t - TUMBLE - ON_BACK - RIGHTING);
}

/**
 * Whether a wheel bowls over a crab startled `age` seconds ago: only while it
 * still stands out of the sand, and only if the wheel's foot comes within
 * CRAB_HIT of it, `dx` across and `dy` up or down.
 */
export function crabRunOver(age, dx, dy) {
  return age < CRAB_ALARM + CRAB_DIG / 2 && Math.abs(dx) < CRAB_HIT.x && Math.abs(dy) < CRAB_HIT.y;
}

const CRAB_POSES = {
  stand: ["k.........a", "kk.e...e.aa", ".k.e...e.a.", "..bbbbbaa..", ".cbbbbbbal.", "l.cbbbbbl.l", "l..l...l..l"],
  step: ["k.........a", "kk.e...e.aa", ".k.e...e.a.", "..bbbbbaa..", ".cbbbbbbal.", ".lcbbbbbl..", "l..l..l...l"],
  alarm: ["kk.......aa", "k.k.....a.a", ".kke...eaa.", "...ebbbea..", ".cbbbbbbal.", "l.cbbbbbl.l", "l..l...l..l"],
  // On its back: its pale belly up, legs kicking in the air, claws flailing.
  back: ["l..l...l..l", ".l.l...l.l.", "..vuuuuuu..", "kkvuuuuuuaa", "k.cbbbbba.a", "...cbbba..."],
  kick: [".l.l...l.l.", "l..l...l..l", "..vuuuuuu..", ".kvuuuuuua.", "kk.cbbbaa.a", "...cbbba..."],
};

/**
 * The crab seen from the front, its feet at y 0, sunk `sink` units into the
 * sand: what would be under the ground is left off.
 */
export function drawCrab(tools, pose, colors, sink = 0) {
  const rows = CRAB_POSES[pose];
  drawGrid(tools, -12, -rows.length * 2 + sink, rows.slice(0, rows.length - sink / 2), CRAB_COLORS[colors]);
}

/** Sand kicked up either side while it digs in, flickering with `time`. */
export function drawCrabDig({ pixelRect }, time) {
  const flick = Math.floor(time / STRIDE) % 2;
  pixelRect(-14, -4 - flick * 2, 2, 2, SAND.light, 2);
  pixelRect(12, -2 - (1 - flick) * 2, 2, 2, SAND.light, 2);
  pixelRect(-12 - flick * 2, -2, 2, 2, SAND.dark, 2);
}

// ---------------------------------------------------------------------------
// Bunting
// ---------------------------------------------------------------------------

/** Two poles `half` either side of the anchor, `pole` tall, the line sagging `sag` between them, a flag every `every`. */
export const BUNTING = { half: 96, pole: 56, sag: 18, every: 14 };
const PENNANTS = [RED, YELLOW, TEAL, WHITE];
/** The flags' left edges along the line, from the anchor. */
export const BUNTING_FLAGS = Array.from({ length: Math.floor((2 * BUNTING.half - 16) / BUNTING.every) }, (_, i) => -BUNTING.half + 10 + i * BUNTING.every);
/** How far a flag's tip can swing, in world units. */
export const BUNTING_SWING = 8;

/**
 * How far flag `index`'s tip swings along x at `time`, for a `wind` of 0…1
 * blowing `downwind`: a lean that grows with the wind and a flutter each flag
 * keeps in its own time. 0 at time 0.
 */
export function buntingSwing(time, wind, downwind, phase, index) {
  if (!time) return 0;
  const lean = downwind * wind * wind * 6;
  const flutter = Math.sin(time * (5 + (index % 4) * 0.7) + phase * 6.28 + index * 1.3) * (0.5 + wind * 2.5);
  return clamp(lean + flutter, -BUNTING_SWING, BUNTING_SWING);
}

/** The line's height at `x`, between pole tops `left` and `right` (from the anchor). */
export function buntingLine(x, left, right) {
  const t = (x + BUNTING.half) / (2 * BUNTING.half);
  return left + (right - left) * t + BUNTING.sag * 4 * t * (1 - t);
}

/**
 * Two poles standing on the ground and a line of party pennants sagging
 * between them; `swing(index)` gives each flag's tip swing (see buntingSwing).
 */
export function drawBunting({ pixelRect, pixelPath }, groundOffset, swing) {
  const tops = [-BUNTING.half, BUNTING.half - 2].map((px) => {
    const ground = snap(groundOffset(px + 1));
    pixelRect(px, ground - BUNTING.pole, 2, BUNTING.pole + 2, POLE.base, 2);
    pixelRect(px - 2, ground - BUNTING.pole, 2, BUNTING.pole + 2, POLE.dark, 2);
    pixelRect(px - 2, ground - BUNTING.pole - 2, 4, 2, POLE.tip, 2);
    return ground - BUNTING.pole + 4;
  });
  const line = [];
  for (let x = -BUNTING.half; x <= BUNTING.half; x += 4) line.push([x, snap(buntingLine(x, tops[0], tops[1]))]);
  pixelPath(line, WHITE.dark, 1, 2);
  BUNTING_FLAGS.forEach((x, index) => {
    const y = snap(buntingLine(x + 4, tops[0], tops[1])) + 2;
    const tip = swing(index);
    const color = PENNANTS[index % PENNANTS.length];
    for (let r = 0; r < 5; r++) {
      const lean = snap((tip * r) / 4);
      pixelRect(x + r + lean, y + r * 2, 10 - r * 2, 2, r === 0 ? color.light : color.base, 2);
      pixelRect(x + r + lean, y + r * 2, 2, 2, color.dark, 2);
    }
  });
}

// ---------------------------------------------------------------------------
// Shipwreck
// ---------------------------------------------------------------------------

/** The shipwreck's sprite bounds: [left, top, right, bottom]. */
export const SHIPWRECK_BOUNDS = [-112, -110, 112, 2];

/**
 * A wooden fishing boat about 7 m long, broken open amidships and sunk in the
 * sand to its waterline, its raked bow (on the right) and curved stern lifted
 * clear, and its mast snapped. Sand is drifted against the hull, deeper at
 * the stern.
 */
export function drawShipwreck({ pixelRect, pixelPath }) {
  const sheer = (x) => {
    const t = (x + 100) / 200;
    return -40 - 18 * t * t;
  };
  // The mast's stump and its torn rigging, behind the hull.
  for (let y = -104; y < -36; y += 2) {
    const x = snap(-18 + (y + 104) * -0.12);
    pixelRect(x, y, 4, 2, WEATHERED.base, 2);
    pixelRect(x + 4, y, 2, 2, WEATHERED.light, 2);
    pixelRect(x - 2, y, 2, 2, WEATHERED.dark, 2);
  }
  pixelRect(-12, -108, 2, 4, WEATHERED.light, 2);
  pixelRect(-16, -106, 2, 2, WEATHERED.base, 2);
  pixelPath([[-14, -98], [20, -80], [60, -74], [96, -66]], WOOD.dark, 1, 2);
  pixelPath([[-16, -92], [-30, -70], [-34, -54]], WOOD.dark, 1, 2);
  for (let x = -100; x < 100; x += 2) {
    let top = snap(sheer(x));
    // The bow curves up into the stem.
    if (x > 84) top = snap(top - (x - 84) * 0.6);
    // The forefoot and the stern lift out of the sand.
    const bottom = snap(x > 40 ? -(((x - 40) / 60) ** 2) * 40 : x < -78 ? -(((-78 - x) / 22) ** 2) * 14 : 2);
    const open = x > -34 && x < 22;
    for (let y = top; y < bottom; y += 2) {
      const seam = (y - top) % 8 === 6;
      let color = Math.floor((y - top) / 8) % 2 ? WOOD.plank : WOOD.base;
      if (seam) color = WOOD.dark;
      if (y === top) color = WOOD.tip;
      if (y === top + 2) color = WOOD.light;
      // Broken open amidships: the ribs and the dark hold.
      if (open && y > top + 4 && y < snap(-14 + Math.sin(x * 0.5) * 4)) {
        const rib = (x + 34) % 14;
        color = rib < 2 ? WOOD.light : rib < 4 ? WOOD.base : WOOD.deep;
      }
      // Weathered and slimed near the sand.
      if (y > -8 && !seam) color = (x / 2) % 3 === 0 ? KELP.dark : WEATHERED.dark;
      if (y === bottom - 2 && bottom < 2) color = WOOD.dark;
      pixelRect(x, y, 2, 2, color, 2);
    }
    // What's left of the paint: a faded stripe under the gunwale.
    if (!open && (x / 2) % 7 !== 3) pixelRect(x, top + 6, 2, 2, x > 40 ? TEAL.base : TEAL.dark, 2);
  }
  // The stem post and the transom's edge.
  pixelRect(100, -82, 2, 32, WOOD.light, 2);
  pixelRect(-102, -40, 2, 28, WOOD.dark, 2);
  // Ragged plank ends at the break.
  for (const [x, y, w] of [[-34, -34, 6], [-36, -26, 8], [18, -44, 6], [20, -36, 4], [22, -28, 6]]) pixelRect(x, y, w, 2, WOOD.tip, 2);
  for (let x = -110; x < 112; x += 2) {
    const edge = Math.min(x + 110, 112 - x);
    const h = snap(Math.min(10, edge * 0.5) * (x < 0 ? 1.4 : 1) + Math.sin(x * 0.13) * 2);
    if (h <= 0) continue;
    pixelRect(x, -h, 2, h + 2, SAND.base, 2);
    pixelRect(x, -h, 2, 2, SAND.light, 2);
    if (h > 4) pixelRect(x, -h + 4, 2, 2, SAND.dark, 2);
  }
}

// ---------------------------------------------------------------------------
// Pail and spade
// ---------------------------------------------------------------------------

const PAIL_ROWS = [
  "...hhhh....",
  "..h....h...",
  ".h......h..",
  "rRRRRRRRRa.",
  ".cbbbbbba..",
  ".cbbbbbba..",
  ".cnnnnnnl..",
  ".cbbbbbba..",
  "..cbbbba...",
  "..cbbbba...",
  "sscbbbbass.",
];
const SPADE_ROWS = [".ggg", ".gG.", ".gG.", "..g.", "..g.", "..g.", "..g.", "..g.", ".kkK", "kkkK", "skkK", "ssss"];
/** Each pail's colour and its spade's: red with yellow, yellow with blue, blue with red. */
const PAIL_COLORS = [[RED, YELLOW], [YELLOW, BLUE], [BLUE, RED]];
/** Which colours a pail at `x` has, so the editor shows what the game will. */
export const pailColors = (x) => Math.floor(desertNoise(x, 74) * PAIL_COLORS.length);
/** The pail and spade's reach either side of the anchor, and how tall the spade stands. */
export const PAIL_BOUNDS = [-12, -24, 18, 0];

/** A plastic pail with its handle up and a spade stuck in the sand beside it. */
export function drawPail(tools, colors) {
  const [bucket, spade] = PAIL_COLORS[colors];
  drawGrid(tools, -12, -PAIL_ROWS.length * 2, PAIL_ROWS, {
    h: bucket.dark, r: bucket.dark, R: bucket.base, a: bucket.light, c: bucket.dark, b: bucket.base, n: bucket.light, l: WHITE.light, s: SAND.light,
  });
  drawGrid(tools, 10, -SPADE_ROWS.length * 2, SPADE_ROWS, { g: spade.base, G: spade.light, k: spade.dark, K: spade.base, s: SAND.light });
}

// ---------------------------------------------------------------------------
// Pennant
// ---------------------------------------------------------------------------

/** The stick's top, and the flag's length and height at the stick in 2-unit cells. */
export const PENNANT = { top: -64, columns: 12, rows: 8 };
/** The flags: red, yellow, teal, and white with a red stripe. */
const PENNANT_CLOTHS = [{ body: RED, stripe: null }, { body: YELLOW, stripe: null }, { body: TEAL, stripe: null }, { body: WHITE, stripe: RED }];
/** Which flag a pennant at `x` flies, so the editor shows what the game will. */
export const pennantCloth = (x) => Math.floor(desertNoise(x, 75) * PENNANT_CLOTHS.length);

/**
 * A triangular flag on a wooden stick stuck in the sand, flying out
 * `downwind` (-1 left, 1 right) and rippling with `time` and `wind` like the
 * flagpole's flag, half as much, so it keeps its shape.
 */
export function drawPennant({ pixelRect }, groundOffset, cloth, time = 0, wind = 0.25, phase = 0, downwind = 1) {
  const ground = snap(groundOffset(0));
  const { top, columns, rows } = PENNANT;
  pixelRect(-2, top, 2, ground - top, POLE.dark, 2);
  pixelRect(0, top, 2, ground - top, POLE.base, 2);
  pixelRect(-2, top - 2, 4, 2, POLE.tip, 2);
  pixelRect(-4, ground - 2, 8, 2, SAND.dark, 2);
  pixelRect(-2, ground - 4, 4, 2, SAND.light, 2);
  const { body, stripe } = PENNANT_CLOTHS[cloth];
  const ripple = (column) => snap(flagRipple(time, wind, phase, column) / 2);
  const hoist = downwind < 0 ? -2 : 2;
  for (let column = 0; column < columns; column++) {
    // The flag narrows evenly from the stick to its point.
    const tall = Math.max(1, Math.round(rows * (1 - column / columns)));
    const skip = Math.floor((rows - tall) / 2);
    const x = downwind < 0 ? hoist - (column + 1) * 2 : hoist + column * 2;
    const y = top + flagDroop(wind, column) + ripple(column) + skip * 2;
    const lift = ripple(column + 1) - ripple(column);
    for (let row = 0; row < tall; row++) {
      const color = stripe && Math.abs(skip + row - (rows - 1) / 2) < 1 ? stripe : body;
      // Folds facing up catch the light, folds facing down are in shade.
      const shade = row === tall - 1 || lift > 0, lit = row === 0 || lift < 0;
      pixelRect(x, y + row * 2, 2, 2, shade ? color.dark : lit ? color.light : color.base, 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Shell decor
// ---------------------------------------------------------------------------

/** Sea glass and pebbles, beside the shells, to press into a wall. */
const DECOR_BITS = {
  ...SHELL_KINDS,
  green: { rows: [".ab", "abb", "bb."], keys: { a: GLASS.greenLight, b: GLASS.green } },
  blue: { rows: ["ab.", "bbb", ".bb"], keys: { a: GLASS.blueLight, b: GLASS.blue } },
  pebble: { rows: [".ab.", "cbbb", ".cb."], keys: { a: WEATHERED.light, b: WEATHERED.base, c: WEATHERED.dark } },
};
// The hollow each is pressed into, showing below and to its left.
const PRESSED = "#5f5139";
/** How far above its anchor a decor's middle sits, so one without a y of its own sits on the ground. */
const DECOR_MIDDLE = -28;
const ring = (radius, kinds) =>
  kinds.map((kind, i) => {
    const angle = (i / kinds.length) * Math.PI * 2 - Math.PI / 2;
    return [kind, snap(Math.cos(angle) * radius), snap(Math.sin(angle) * radius)];
  });
/**
 * The ways shells can be pressed into a wall, as [kind, x, y] of each one's
 * middle about the decor's: a rosette round a starfish, a frieze and a scatter.
 * @type {Array<Array<[keyof typeof DECOR_BITS, number, number]>>}
 */
export const DECOR_LAYOUTS = [
  [["star", 0, 0], ...ring(20, ["scallop", "blue", "cockle", "green", "scallop", "pebble", "cockle", "blue", "scallop", "green"])],
  [["scallop", -48, 0], ["green", -36, 0], ["cockle", -24, 0], ["pebble", -12, 0], ["whelk", 0, 0], ["blue", 12, 0], ["scallop", 24, 0], ["green", 36, 0], ["cockle", 48, 0]],
  [["star", -18, -6], ["scallop", 4, -12], ["green", -4, 4], ["whelk", 16, 2], ["pebble", -20, 10], ["blue", 22, -10], ["cockle", 6, 10]],
];
/** Which layout a decor at `x` has, so the editor shows what the game will. */
export const decorLayout = (x) => Math.floor(desertNoise(x, 76) * DECOR_LAYOUTS.length);
/** How far the widest layout reaches about the anchor. */
export const DECOR_BOUNDS = [-56, -56, 56, 2];

/** Shells, sea glass and pebbles pressed into a wall, each in its hollow. */
export function drawShellDecor(tools, layout) {
  for (const [kind, x, y] of DECOR_LAYOUTS[layout]) {
    const { rows, keys } = DECOR_BITS[kind];
    const left = snap(x - rows[0].length),
      top = snap(DECOR_MIDDLE + y - rows.length);
    drawGrid(tools, left - 2, top + 2, rows, Object.fromEntries(Object.keys(keys).map((key) => [key, PRESSED])));
    drawGrid(tools, left, top, rows, keys);
  }
}

// ---------------------------------------------------------------------------
// Beach ball
// ---------------------------------------------------------------------------

/** The ball's radius, about 74 cm across: a big beach ball, drawn big enough to read. */
export const BALL_RADIUS = 10;
/**
 * The ball's colour at a point of it seen from the side, `x` and `y` across
 * its disc from -1 to 1 with its axis upright: red caps top and bottom, and a
 * yellow panel, a white one and a blue one running round between them, their
 * seams curving in towards the caps.
 */
function ballPanel(x, y) {
  const ay = Math.abs(y),
    ax = Math.abs(x);
  if (ay > 0.8 || (ay > 0.6 && ax < 0.45) || (ay > 0.4 && ax < 0.22)) return "r";
  const seam = 0.4 + 0.5 * y * y;
  return x < -seam ? "y" : x > seam ? "b" : "w";
}
const BALL_COLORS = { r: RED, y: YELLOW, b: BLUE, w: WHITE };
// Air drag (per second), and how much of its speed it keeps off the terrain.
const BALL_DRAG = 0.4;
const BALL_BOUNCE = 0.7;
// Below this speed into a surface it stops bouncing and rolls along it.
const BALL_SETTLE = 30;
// How fast rolling slows it (per second), the speed it comes to rest below,
// and how level ground must be for it to rest there (the up-facing normal's
// share, about 14°); on anything steeper it rolls on downhill.
const BALL_ROLL = 0.6;
const BALL_REST = 3;
const BALL_LEVEL = 0.97;
// How much of a wheel's closing speed it bounces off with, and how far it
// pops up off a hard knock (units per second).
const BALL_KICK = 0.8;
const BALL_POP = 80;
// In water it floats: buoyancy against gravity, and drag (per second).
const BALL_FLOAT = 3;
const BALL_WATER_DRAG = 3;
// Landing harder than this (units per second) squashes it for SQUASH_TIME seconds.
const BALL_SQUASH_SPEED = 150;
const BALL_SQUASH_TIME = 0.1;
// The furthest it moves in one sub-step, so it never passes through a thin wall.
const BALL_SUBSTEP = 4;

/**
 * A ball at rest on the ground at (`x`, `groundY`): its middle, velocity, how
 * far it has turned, how squashed it is (0…1) and how hard it was last hit
 * (see ballStep), and whether it is resting, which it does where it was put
 * until a wheel touches it, whatever the slope.
 */
export function ballStart(x, groundY) {
  return { x, y: groundY - BALL_RADIUS, vx: 0, vy: 0, turn: 0, squash: 0, knock: 0, resting: true };
}

/**
 * The ball `dt` seconds on: pushed by the `wheels` ({ x, y, vx, vy }, each
 * `wheelRadius` round) it touches, falling, bouncing off the terrain
 * (`contacts(x, y, radius)` as terrainCollisionsAt gives them), rolling to a
 * stop on level enough ground and floating where `submerged(x, y, radius)`
 * (0…1) says it is under water. It turns with the distance it rolls, and is
 * squashed for a moment by a hard landing. `knock` is the speed of the
 * hardest hit this step, by a wheel or a bounce, for its sound (0 if none).
 */
export function ballStep(state, { dt, wheels, wheelRadius, contacts, submerged }) {
  if (!dt) return state;
  const touched = wheels.some((wheel) => Math.hypot(state.x - wheel.x, state.y - wheel.y) < BALL_RADIUS + wheelRadius);
  if (state.resting && !touched) return state;
  let { x, y, vx, vy, turn } = state;
  let squash = Math.max(0, state.squash - dt / BALL_SQUASH_TIME),
    knock = 0;
  for (const wheel of wheels) {
    const dx = x - wheel.x,
      dy = y - wheel.y;
    const distance = Math.hypot(dx, dy),
      reach = BALL_RADIUS + wheelRadius;
    if (distance >= reach || !distance) continue;
    const nx = dx / distance,
      ny = dy / distance;
    x += nx * (reach - distance);
    y += ny * (reach - distance);
    const closing = (vx - wheel.vx) * nx + (vy - wheel.vy) * ny;
    if (closing >= 0) continue;
    knock = Math.max(knock, -closing);
    vx -= (1 + BALL_KICK) * closing * nx;
    vy -= (1 + BALL_KICK) * closing * ny + BALL_POP * Math.min(1, -closing / 300);
  }
  const steps = Math.min(16, Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / BALL_SUBSTEP)));
  const h = dt / steps;
  // The most level ground it touched, as its normal's upward share.
  let level = 0;
  for (let step = 0; step < steps; step++) {
    const wet = submerged(x, y, BALL_RADIUS);
    vy += GRAVITY * (1 - wet * BALL_FLOAT) * h;
    const drag = Math.exp(-(BALL_DRAG + wet * BALL_WATER_DRAG) * h);
    vx *= drag;
    vy *= drag;
    x += vx * h;
    y += vy * h;
    for (const contact of contacts(x, y, BALL_RADIUS)) {
      x += contact.nx * contact.penetration;
      y += contact.ny * contact.penetration;
      const into = vx * contact.nx + vy * contact.ny;
      if (into < 0) {
        const bounce = -into > BALL_SETTLE ? BALL_BOUNCE : 0;
        if (bounce) knock = Math.max(knock, -into);
        if (contact.ny < -0.5 && -into > BALL_SQUASH_SPEED) squash = 1;
        vx -= (1 + bounce) * into * contact.nx;
        vy -= (1 + bounce) * into * contact.ny;
      }
      level = Math.max(level, -contact.ny);
    }
  }
  // A surface facing up is ground it rolls on.
  if (level > 0.5) vx *= Math.exp(-BALL_ROLL * dt);
  const resting = level > BALL_LEVEL && Math.hypot(vx, vy) < BALL_REST;
  if (resting) vx = vy = 0;
  return { x, y, vx, vy, turn: turn + (vx * dt) / BALL_RADIUS, squash, knock, resting };
}

/** How many steps a turn of the ball is drawn in: enough to roll smoothly, few enough to stay crisp. */
const BALL_TURN_STEPS = 16;
/** The ball's size in 2-unit cells. */
const BALL_CELLS = BALL_RADIUS;

/**
 * The ball sitting on y 0, turned `turn` radians as it rolls (clockwise
 * rolling right), in BALL_TURN_STEPS steps a turn; `squash` (0…1) flattens it
 * for a moment when it lands hard. The light stays where it is, from the
 * upper right.
 */
export function drawBeachBall({ pixelRect }, turn = 0, squash = 0) {
  const angle = (Math.round((turn / (Math.PI * 2)) * BALL_TURN_STEPS) / BALL_TURN_STEPS) * Math.PI * 2;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  // Flattened, it is a cell wider each side and two cells lower.
  const flat = squash > 0.4 ? 1 : 0;
  const wide = BALL_CELLS + flat * 2,
    tall = BALL_CELLS - flat * 2;
  const edge = 1 + 0.6 / (BALL_CELLS / 2) ** 2;
  for (let row = 0; row < tall; row++)
    for (let column = 0; column < wide; column++) {
      const u = (column + 0.5 - wide / 2) / (wide / 2),
        v = (row + 0.5 - tall / 2) / (tall / 2);
      if (u * u + v * v > edge) continue;
      // Back through the turn, to the ball upright.
      const color = BALL_COLORS[ballPanel(u * cos + v * sin, -u * sin + v * cos)];
      const rim = Math.hypot(u, v) > 0.68 && u * 0.6 - v * 0.8 < -0.12;
      const glint = (column === wide - 3 && row === 2) || (column === wide - 4 && row === 1);
      pixelRect(-wide + column * 2, -tall * 2 + row * 2, 2, 2, glint ? color.light : rim ? color.dark : color.base, 2);
    }
}
