// Street and building-site props, and a parked Christiania bike and a
// Copenhagen bench. Like every prop they sit on the 2-unit art
// grid, have no outlines, and are lit from the right: shaded on the left and
// underneath. Static parts are drawn once into sprites by drawing.js; the parts
// that move, light up or follow the ground are drawn live from the constants
// exported here.

// Galvanised steel, from the rock greys.
export const STEEL = {
  dark: "#4a524d",
  base: "#697872",
  mid: "#8b978c",
  light: "#aeb5a7",
};
const RUBBER = { dark: "#3a403d", base: "#4a524d", light: "#5b645e" };
const PAINT = { dark: "#3f6f78", base: "#568f98", light: "#83d1ce" };
// Traffic-cone orange is the collectible apple's, but a cone is large, striped
// and never glows, so the two don't get confused.
const CONE = { shade: "#c9573a", base: "#ed774e", light: "#ffc295" };
const WHITE = { shade: "#f4e9d1", base: "#fffdf4" };
const YELLOW = { dark: "#d9953a", base: "#f1b95d", light: "#ffe39a" };
const CONCRETE = { dark: "#697872", base: "#8b978c", light: "#aeb5a7" };
const WOOD = { dark: "#4d3f2f", base: "#66543f", plank: "#806244", light: "#856d4f", tip: "#aa8a60", cut: "#c39664" };
const BRICK = { dark: "#71392f", base: "#8d493d", light: "#a65a49" };
// The light a lamp throws after dark.
export const LAMP_LIGHT = { glass: "#fff3be", core: "#fffdf4", beam: "#ffe39a" };

// A Copenhagen bench's slats, and the blanket in a Christiania bike's box.
const PARK_GREEN = { dark: "#365345", base: "#3d6452", light: "#568061", bright: "#86a56a" };
// The Christiania bike's Dannebrog pennant.
const PENNANT = { pole: "#b5bcae", white: "#fffdf4", red: "#d63b2c", redDark: "#a8322a" };
const INK = "#182321";

const snap = (value) => Math.round(value / 2) * 2;

// A ring of radius r around (cx, cy), one 2-unit cell at a time: `light` on
// the upper right, `shade` on the lower left.
function ring({ pixelRect }, cx, cy, r, light, shade) {
  const steps = Math.ceil(Math.PI * r * 1.5);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = snap(cx + Math.cos(angle) * r), y = snap(cy + Math.sin(angle) * r);
    const lit = Math.cos(angle) - Math.sin(angle) > 0;
    pixelRect(x - 1, y - 1, 2, 2, lit ? light : shade, 2);
  }
}

// A horizontal tube: lit top, shaded underside.
function tube({ pixelRect }, x, y, width, c = STEEL) {
  pixelRect(x, y, width, 2, c.light, 2);
  pixelRect(x, y + 2, width, 2, c.base, 2);
}

// 20 × 24, a striped traffic cone on a square rubber foot.
export function drawCone({ pixelRect }) {
  const halfWidths = [2, 2, 4, 4, 4, 6, 6, 6, 8, 8];
  halfWidths.forEach((half, row) => {
    const y = -24 + row * 2;
    const striped = row === 3 || row === 4 || row === 7;
    const c = striped
      ? { shade: WHITE.shade, base: WHITE.base, light: WHITE.base }
      : CONE;
    pixelRect(-half, y, half * 2, 2, c.base, 2);
    pixelRect(-half, y, half >= 6 ? 4 : 2, 2, c.shade, 2);
    if (half >= 4) pixelRect(half - 4, y, 2, 2, c.light, 2);
  });
  pixelRect(-10, -4, 20, 4, RUBBER.base, 2);
  pixelRect(-10, -4, 2, 4, RUBBER.dark, 2);
  pixelRect(-2, -4, 10, 2, RUBBER.light, 2);
  pixelRect(-10, -2, 20, 2, RUBBER.dark, 2);
}

// 76 × 38, a steel crowd-control barrier on two flat feet.
export function drawBarrier(tools) {
  const { pixelRect } = tools;
  // Infill bars first, so the rails cover their ends.
  for (let x = -26; x <= 24; x += 6) {
    pixelRect(x, -34, 2, 22, STEEL.base, 2);
    pixelRect(x, -34, 2, 2, STEEL.mid, 2);
  }
  tube(tools, -32, -36, 64);
  tube(tools, -32, -14, 64);
  // End frames: shaded left tube, lit right tube.
  pixelRect(-34, -36, 4, 34, STEEL.base, 2);
  pixelRect(-34, -36, 2, 34, STEEL.dark, 2);
  pixelRect(30, -36, 4, 34, STEEL.mid, 2);
  pixelRect(32, -36, 2, 34, STEEL.light, 2);
  // Hook that links it to the next barrier.
  pixelRect(34, -32, 4, 2, STEEL.light, 2);
  pixelRect(36, -30, 2, 2, STEEL.mid, 2);
  // Flat feet.
  for (const x of [-38, 24]) {
    pixelRect(x, -2, 14, 2, STEEL.base, 2);
    pixelRect(x, -4, 14, 2, STEEL.mid, 2);
    pixelRect(x, -2, 2, 2, STEEL.dark, 2);
    pixelRect(x + 12, -4, 2, 2, STEEL.light, 2);
  }
}

// 76 × 70, a painted skip bin on casters, its lid propped open by the
// rubbish.
export function drawDumpster(tools) {
  const { pixelRect, drawPixelDisc } = tools;
  // Rubbish poking out under the raised lid, drawn first.
  pixelRect(-28, -50, 10, 10, WOOD.cut, 2);
  pixelRect(-28, -50, 2, 10, WOOD.tip, 2);
  pixelRect(-26, -50, 8, 2, "#d9b884", 2);
  // A crumpled newspaper beside the box.
  drawPixelDisc(-12, -46, 4, WHITE.shade, 2);
  pixelRect(-12, -50, 4, 2, WHITE.base, 2);
  pixelRect(-16, -46, 2, 2, CONCRETE.light, 2);
  pixelRect(-10, -46, 4, 2, CONCRETE.dark, 2);
  // Body.
  pixelRect(-34, -40, 68, 32, PAINT.base, 2);
  pixelRect(-34, -40, 4, 32, PAINT.dark, 2);
  pixelRect(32, -40, 2, 30, PAINT.light, 2);
  pixelRect(-34, -10, 68, 2, PAINT.dark, 2);
  // Stiffening ribs: lit top, shaded underside.
  for (const y of [-34, -22]) {
    pixelRect(-30, y, 62, 2, PAINT.light, 2);
    pixelRect(-30, y + 2, 62, 2, PAINT.dark, 2);
  }
  // Rim along the top edge.
  pixelRect(-36, -42, 72, 2, PAINT.light, 2);
  pixelRect(-36, -40, 2, 4, PAINT.dark, 2);
  // Fork pockets and a hazard plate.
  pixelRect(-24, -16, 10, 2, PAINT.dark, 2);
  pixelRect(12, -16, 10, 2, PAINT.dark, 2);
  pixelRect(0, -30, 12, 8, WHITE.shade, 2);
  pixelRect(2, -28, 2, 4, CONE.base, 2);
  pixelRect(6, -28, 2, 4, CONE.base, 2);
  // Lid: two halves hinged along the back. The right one lies closed on the
  // rim; the left one is propped open on the rubbish, one slab tilting up to
  // the left, lit along its top edge and shaded underneath.
  pixelRect(0, -46, 38, 4, RUBBER.base, 2);
  pixelRect(0, -46, 38, 2, RUBBER.light, 2);
  pixelRect(0, -46, 2, 4, RUBBER.dark, 2);
  for (let x = -34; x < 0; x += 2) {
    const y = -46 - snap(-x * 0.6);
    pixelRect(x, y, 2, 4, RUBBER.base, 2);
    pixelRect(x, y, 2, 2, RUBBER.light, 2);
    pixelRect(x, y + 4, 2, 2, RUBBER.dark, 2);
  }
  // The hinge between the halves.
  pixelRect(-2, -44, 4, 2, STEEL.base, 2);
  pixelRect(0, -44, 2, 2, STEEL.light, 2);
  // Casters.
  for (const x of [-24, 20]) {
    pixelRect(x - 2, -8, 8, 2, STEEL.base, 2);
    drawPixelDisc(x + 2, -4, 4, RUBBER.dark, 2);
    pixelRect(x + 2, -6, 2, 2, STEEL.light, 2);
  }
}

// Street lamp, about 6.2 m tall: post at x = 0, lamp head over to the right.
export const LAMP_HEAD = { x: 22, y: -154 };
export const LAMP_BODY_BOTTOM = -10;
export function drawLamp({ pixelRect }) {
  const top = LAMP_HEAD.y + 2;
  // Plinth, down to where the live base takes over.
  pixelRect(-4, -16, 8, 6, RUBBER.base, 2);
  pixelRect(-4, -16, 2, 6, RUBBER.dark, 2);
  pixelRect(2, -16, 2, 6, STEEL.base, 2);
  // Post with a collar a third of the way up.
  pixelRect(-2, top, 4, -16 - top, RUBBER.base, 2);
  pixelRect(0, top, 2, -16 - top, STEEL.base, 2);
  pixelRect(-4, -64, 8, 4, RUBBER.base, 2);
  pixelRect(-4, -64, 2, 4, RUBBER.dark, 2);
  pixelRect(2, -64, 2, 2, STEEL.mid, 2);
  // Swan-neck arm.
  pixelRect(-2, top - 6, 4, 6, RUBBER.base, 2);
  pixelRect(0, top - 10, 6, 4, RUBBER.base, 2);
  pixelRect(4, top - 12, 14, 4, RUBBER.base, 2);
  pixelRect(4, top - 12, 14, 2, STEEL.base, 2);
  // Head: hood over the glass, with a finial on top.
  pixelRect(14, top - 10, 16, 4, RUBBER.base, 2);
  pixelRect(14, top - 10, 4, 4, RUBBER.dark, 2);
  pixelRect(22, top - 10, 8, 2, STEEL.base, 2);
  pixelRect(20, top - 14, 4, 4, RUBBER.base, 2);
  pixelRect(22, top - 14, 2, 2, STEEL.base, 2);
  pixelRect(16, top - 6, 12, 4, STEEL.light, 2);
  pixelRect(16, top - 6, 2, 4, STEEL.mid, 2);
  pixelRect(16, top - 2, 12, 2, RUBBER.dark, 2);
}
// Glass, lit, drawn over the sprite after dark.
export function drawLampGlass({ pixelRect }) {
  const top = LAMP_HEAD.y + 2;
  pixelRect(16, top - 6, 12, 4, LAMP_LIGHT.glass, 2);
  pixelRect(20, top - 4, 4, 2, LAMP_LIGHT.core, 2);
}

// A sparrow, 20 units long. Its feet are at y = 0 and it faces right.
const SPARROW = { wing: "#66543f", body: "#856d4f", head: "#806244", belly: "#c39664", beak: "#f1b95d", eye: RUBBER.dark, leg: "#d9953a" };
export function drawBirdPerched({ pixelRect }, peck = false) {
  const c = SPARROW;
  pixelRect(-2, -2, 2, 2, c.leg, 2);
  pixelRect(2, -2, 2, 2, c.leg, 2);
  pixelRect(-10, -8, 4, 2, c.wing, 2);
  pixelRect(-6, -8, 10, 6, c.body, 2);
  pixelRect(0, -6, 4, 4, c.belly, 2);
  pixelRect(-6, -8, 6, 4, c.wing, 2);
  pixelRect(-4, -8, 2, 2, c.body, 2);
  const hx = peck ? 4 : 2;
  const hy = peck ? -8 : -12;
  pixelRect(hx, hy, 6, 4, c.head, 2);
  pixelRect(hx + 2, hy, 4, 2, c.body, 2);
  pixelRect(hx + 4, hy + 2, 2, 2, c.eye, 2);
  pixelRect(hx + 6, hy + 2, 2, 2, c.beak, 2);
}
export function drawBirdFlying({ pixelRect }, wingsUp) {
  const c = SPARROW;
  pixelRect(-10, -6, 4, 2, c.wing, 2);
  pixelRect(-6, -8, 10, 4, c.body, 2);
  pixelRect(-2, -6, 6, 2, c.belly, 2);
  pixelRect(4, -10, 4, 4, c.head, 2);
  pixelRect(6, -10, 2, 2, c.eye, 2);
  pixelRect(8, -8, 2, 2, c.beak, 2);
  if (wingsUp) {
    pixelRect(-4, -14, 6, 6, c.wing, 2);
    pixelRect(-2, -18, 4, 4, c.wing, 2);
    pixelRect(0, -14, 2, 4, c.body, 2);
  } else {
    pixelRect(-4, -4, 6, 4, c.wing, 2);
    pixelRect(-2, 0, 4, 2, c.wing, 2);
  }
}

// Tower crane, about 13 m tall. The mast stands on x = 0, the jib reaches
// right. Everything above the mast is drawn CRANE_LIFT higher than the
// numbers it's written with, so the cab and jib keep their size while the
// mast grows.
export const CRANE_BODY_BOTTOM = -8;
const CRANE_LIFT = 80;
// Where its warning lights sit, for after dark: mast top, jib tip, counter-jib end.
export const CRANE_LIGHTS = [
  [0, -276 - CRANE_LIFT],
  [170, -248 - CRANE_LIFT],
  [-70, -248 - CRANE_LIFT],
];
export function drawCrane(tools) {
  const c = YELLOW;
  // Mast: two chords with a zigzag of bracing between them.
  let { pixelRect, pixelPath } = tools;
  const mastTop = -232 - CRANE_LIFT;
  const mastHeight = CRANE_BODY_BOTTOM - mastTop;
  for (let y = CRANE_BODY_BOTTOM; y > mastTop; y -= 16) {
    pixelRect(-4, y - 2, 8, 2, c.dark, 2);
    const flip = ((CRANE_BODY_BOTTOM - y) / 16) % 2;
    pixelPath(
      [
        [flip ? 2 : -4, y - 2],
        [flip ? -4 : 2, y - 16],
      ],
      c.base,
      1,
      2,
    );
  }
  pixelRect(-8, mastTop, 2, mastHeight, c.dark, 2);
  pixelRect(-6, mastTop, 2, mastHeight, c.base, 2);
  pixelRect(4, mastTop, 2, mastHeight, c.base, 2);
  pixelRect(6, mastTop, 2, mastHeight, c.light, 2);

  // The rest is written as if the mast top were at -232.
  pixelRect = (x, y, ...rest) => tools.pixelRect(x, y - CRANE_LIFT, ...rest);
  pixelPath = (points, ...rest) => tools.pixelPath(points.map(([x, y]) => [x, y - CRANE_LIFT]), ...rest);

  // Pendant ties from the apex out to the jib and counter-jib.
  pixelPath([[0, -270], [110, -246]], RUBBER.base, 1, 2);
  pixelPath([[0, -270], [-62, -246]], RUBBER.base, 1, 2);
  // Apex.
  for (let row = 0; row < 7; row++) {
    const half = 2 + row;
    const y = -274 + row * 4;
    pixelRect(-half, y, half * 2, 4, c.base, 2);
    pixelRect(-half, y, 2, 4, c.dark, 2);
    if (half > 3) pixelRect(half - 2, y, 2, 4, c.light, 2);
  }

  // Jib: top and bottom chords with zigzag bracing, lit along the top.
  pixelRect(-10, -248, 182, 2, c.light, 2);
  pixelRect(-10, -246, 182, 2, c.base, 2);
  pixelRect(-10, -238, 182, 2, c.dark, 2);
  for (let x = -8; x < 170; x += 8) {
    pixelPath([[x, -244], [x + 4, -240]], c.base, 1, 2);
    pixelPath([[x + 4, -240], [x + 8, -244]], c.dark, 1, 2);
  }
  pixelRect(170, -248, 2, 12, c.base, 2);
  // Counter-jib with its stack of concrete weights.
  pixelRect(-72, -248, 62, 2, c.light, 2);
  pixelRect(-72, -246, 62, 4, c.base, 2);
  pixelRect(-72, -242, 62, 2, c.dark, 2);
  pixelRect(-70, -240, 22, 18, CONCRETE.base, 2);
  pixelRect(-70, -240, 4, 18, CONCRETE.dark, 2);
  pixelRect(-66, -240, 18, 2, CONCRETE.light, 2);
  pixelRect(-70, -232, 22, 2, CONCRETE.dark, 2);
  // Slewing ring and the driver's cab beside the mast.
  pixelRect(-10, -236, 20, 4, RUBBER.base, 2);
  pixelRect(4, -236, 6, 2, RUBBER.light, 2);
  pixelRect(10, -236, 14, 16, c.base, 2);
  pixelRect(10, -236, 2, 16, c.dark, 2);
  pixelRect(16, -232, 8, 6, PAINT.light, 2);
  pixelRect(16, -232, 2, 6, PAINT.base, 2);
  pixelRect(10, -222, 14, 2, c.dark, 2);

  // The trolley; the cable and its load hang from it live (drawCraneLoad).
  pixelRect(118, -236, 10, 4, RUBBER.base, 2);
  pixelRect(124, -236, 4, 2, RUBBER.light, 2);
}

/**
 * How far the crane's load has swung out sideways on its long cable, in
 * units: pushed `downwind` (-1 left, 1 right) the harder the `wind` (0…1)
 * blows, and swinging slowly while `time` runs (still at 0).
 */
export function craneSway(time, wind, downwind, phase) {
  let sway = downwind * wind * 4;
  if (time) sway += Math.sin(time * 0.7 + phase * Math.PI * 2) * (1 + wind * 5);
  return sway;
}

/**
 * The cable down from the trolley, and the hook block and a steel beam on
 * slings at its end, swung `sway` units sideways (see craneSway). The cable
 * pays out CRANE_LIFT further than the mast was raised, so the load hangs
 * where it always did.
 */
export function drawCraneLoad(tools, sway = 0) {
  const c = YELLOW;
  const dx = snap(sway);
  tools.pixelPath([[122, -232 - CRANE_LIFT], [122 + dx, -154]], RUBBER.dark, 1, 2);
  const pixelRect = (x, ...rest) => tools.pixelRect(x + dx, ...rest);
  const pixelPath = (points, ...rest) => tools.pixelPath(points.map(([x, y]) => [x + dx, y]), ...rest);
  pixelRect(118, -152, 10, 8, c.base, 2);
  pixelRect(118, -152, 2, 8, c.dark, 2);
  pixelRect(124, -152, 4, 2, c.light, 2);
  pixelRect(122, -144, 2, 6, STEEL.base, 2);
  pixelRect(120, -140, 2, 2, STEEL.base, 2);
  pixelPath([[122, -138], [104, -122]], RUBBER.dark, 1, 2);
  pixelPath([[122, -138], [140, -122]], RUBBER.dark, 1, 2);
  pixelRect(96, -122, 54, 6, "#d63b2c", 2);
  pixelRect(96, -122, 54, 2, "#e8755b", 2);
  pixelRect(96, -118, 54, 2, "#a8322a", 2);
  pixelRect(96, -122, 2, 6, "#a8322a", 2);
}
// Concrete footing below the mast, drawn live so it follows the ground.
export const CRANE_FOOTING = CONCRETE;

// Scaffolding: three standards and two lifts of plank decking.
export const SCAFFOLD_STANDARDS = [-44, -2, 40];
export const SCAFFOLD_TOP = -142;
export function drawScaffoldDecks(tools) {
  const { pixelRect, pixelPath } = tools;
  // Braces first, behind the tubes.
  pixelPath([[-40, -8], [-6, -56]], STEEL.base, 1, 2);
  pixelPath([[2, -64], [36, -112]], STEEL.base, 1, 2);
  for (const deck of [-62, -118]) {
    // Ledger tube under the deck, guard rail above it.
    tube(tools, -48, deck + 6, 96);
    tube(tools, -48, deck - 20, 96);
    // Planks: lit top, shaded underside, with butt joints.
    pixelRect(-50, deck, 100, 6, WOOD.light, 2);
    pixelRect(-50, deck, 100, 2, WOOD.tip, 2);
    pixelRect(-50, deck + 4, 100, 2, WOOD.base, 2);
    pixelRect(-50, deck, 2, 6, WOOD.base, 2);
    for (const joint of [-18, 16]) pixelRect(joint, deck, 2, 6, WOOD.dark, 2);
  }
  // Bricks stacked on the lower lift.
  for (const [x, y] of [[-34, -70], [-24, -70], [-14, -70], [-29, -78], [-19, -78]]) {
    pixelRect(x, y, 10, 8, BRICK.base, 2);
    pixelRect(x, y, 10, 2, BRICK.light, 2);
    pixelRect(x, y, 2, 8, BRICK.dark, 2);
  }
  // A paint bucket on the upper lift.
  pixelRect(18, -130, 12, 12, WHITE.base, 2);
  pixelRect(18, -130, 4, 12, WHITE.shade, 2);
  pixelRect(18, -132, 12, 2, STEEL.mid, 2);
  pixelRect(24, -126, 2, 6, PAINT.base, 2);
  pixelRect(22, -136, 8, 2, STEEL.base, 2);
}
// Couplers where the tubes clamp to the standards, drawn over them.
export function drawScaffoldCouplers({ pixelRect }) {
  for (const x of SCAFFOLD_STANDARDS)
    for (const y of [-56, -82, -112, -138])
      pixelRect(x, y, 4, 4, STEEL.dark, 2);
}

// Graffiti piece reading "R⊙LL", the O being the Hjulben wheel.
const GRAFFITI_R = [
  "#######...",
  "########..",
  "###...###.",
  "###...###.",
  "###...###.",
  "########..",
  "#######...",
  "###.###...",
  "###..###..",
  "###..###..",
  "###...###.",
  "###...###.",
  "###....###",
  "###....###",
];
const GRAFFITI_L = [
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "###.....",
  "########",
  "########",
  "########",
];
export const GRAFFITI_BOUNDS = [-58, -26, 58, 36];
const GRAFFITI_COLORS = {
  bubble: PAINT.base,
  bubbleShade: PAINT.dark,
  top: CONE.base,
  bottom: YELLOW.base,
  shine: YELLOW.light,
  block: WOOD.dark,
  star: WHITE.base,
};

function drawGlyph({ pixelRect }, glyph, left, top) {
  const g = GRAFFITI_COLORS;
  const filled = (col, row) => glyph[row]?.[col] === "#";
  // 3D block, falling down and to the left, away from the light.
  glyph.forEach((line, row) => {
    for (let col = 0; col < line.length; col++)
      if (filled(col, row))
        pixelRect(left + col * 2 - 4, top + row * 2 + 4, 2, 2, g.block, 2);
  });
  glyph.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (!filled(col, row)) continue;
      let color = row < glyph.length / 2 ? g.top : g.bottom;
      if (!filled(col + 1, row) || !filled(col, row - 1)) color = g.shine;
      pixelRect(left + col * 2, top + row * 2, 2, 2, color, 2);
    }
  });
}

export function drawGraffiti(tools) {
  const { pixelRect, pixelPath, drawPixelDisc } = tools;
  const g = GRAFFITI_COLORS;
  // Sprayed cloud behind the letters, with drips running down.
  for (const [x, y, r] of [[-38, -2, 16], [-14, -6, 18], [12, -4, 18], [36, 0, 16], [-26, 8, 14], [24, 10, 14]])
    drawPixelDisc(x, y, r, g.bubble, 2);
  for (const [x, length] of [[-40, 6], [-22, 12], [6, 8], [30, 14], [44, 4]]) {
    pixelRect(x, 12, 2, 8 + length, g.bubble, 2);
    pixelRect(x, 18 + length, 2, 2, g.bubbleShade, 2);
  }
  pixelRect(-52, 2, 4, 8, g.bubbleShade, 2);
  pixelRect(-50, 10, 8, 2, g.bubbleShade, 2);

  drawGlyph(tools, GRAFFITI_R, -46, -16);
  // The O: the Hjulben wheel, knobbly tyre and orange rim, spokes and hub.
  const cx = -10, cy = -2;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    pixelRect(cx + Math.round(Math.cos(angle) * 8) * 2 - 1, cy + Math.round(Math.sin(angle) * 8) * 2 - 1, 2, 2, RUBBER.dark, 2);
  }
  drawPixelDisc(cx - 2, cy + 2, 14, g.block, 2);
  drawPixelDisc(cx, cy, 14, RUBBER.dark, 2);
  pixelRect(cx + 10, cy - 6, 2, 8, RUBBER.light, 2);
  drawPixelDisc(cx, cy, 10, CONE.base, 2);
  drawPixelDisc(cx, cy, 8, g.bubble, 2);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI;
    const dx = Math.cos(angle) * 8, dy = Math.sin(angle) * 8;
    pixelPath([[cx - dx, cy - dy], [cx + dx, cy + dy]], STEEL.light, 1, 2);
  }
  pixelRect(cx - 2, cy - 2, 6, 6, CONE.base, 2);
  pixelRect(cx, cy, 2, 2, RUBBER.dark, 2);
  drawGlyph(tools, GRAFFITI_L, 10, -18);
  drawGlyph(tools, GRAFFITI_L, 30, -14);
  // Glints, on the sunny side.
  for (const [x, y] of [[6, -20], [50, -20]]) {
    pixelRect(x - 2, y, 6, 2, g.star, 2);
    pixelRect(x, y - 2, 2, 6, g.star, 2);
  }
}

// ---------------------------------------------------------- Christiania bike

/** Where the Christiania bike's wheels touch the ground. */
export const CHRISTIANIA_WHEELS = [-22, 16];

/**
 * A Christiania bike parked facing right, about 62 long (about 2.3 m): a
 * black frame with a leather saddle, one wheel behind and the plywood box up
 * front over its pair of smaller wheels, a blanket in the box and a Dannebrog
 * pennant on its corner.
 */
export function drawChristianiaBike(tools) {
  const { pixelRect, pixelPath, drawPixelDisc } = tools;
  const [rear, front] = CHRISTIANIA_WHEELS;
  // Wheels: tyres, spokes and hubs.
  for (const [cx, r] of [[rear, 9], [front, 7]]) {
    const cy = -r;
    for (let a = 0; a < 3; a++) {
      const angle = (a / 3) * Math.PI;
      pixelPath([[cx - Math.cos(angle) * (r - 2), cy - Math.sin(angle) * (r - 2)], [cx + Math.cos(angle) * (r - 2), cy + Math.sin(angle) * (r - 2)]], STEEL.base, 1, 2);
    }
    // A solid tyre: two rings, lit on the upper right.
    ring(tools, cx, cy, r, RUBBER.light, INK);
    ring(tools, cx, cy, r - 1, RUBBER.base, INK);
    pixelRect(cx - 2, cy - 2, 4, 4, STEEL.light, 2);
  }
  // Frame: stays to the saddle and the cranks, a tube down to the box.
  pixelPath([[rear, -9], [-14, -28]], RUBBER.dark, 1, 2);
  pixelPath([[rear, -9], [-8, -10]], RUBBER.dark, 1, 2);
  pixelPath([[-14, -28], [-8, -10]], RUBBER.base, 2, 2);
  pixelPath([[-12, -22], [4, -16]], RUBBER.base, 1, 2);
  pixelPath([[-8, -10], [4, -12]], RUBBER.dark, 1, 2);
  // Chainring and pedal.
  drawPixelDisc(-8, -10, 2, STEEL.base, 2);
  pixelRect(-6, -6, 4, 2, RUBBER.base, 2);
  // Saddle, nose to the right.
  pixelRect(-20, -32, 10, 2, WOOD.light, 2);
  pixelRect(-20, -30, 10, 2, WOOD.base, 2);
  // The handlebar: up off the back of the box and back towards the saddle.
  pixelPath([[6, -24], [4, -32]], RUBBER.base, 1, 2);
  pixelPath([[4, -32], [-2, -34]], RUBBER.light, 1, 2);
  pixelRect(-6, -36, 4, 2, RUBBER.dark, 2);
  // The box: plywood sides with a darker rim, over its wheels.
  const left = 4, right = 32, top = -24, bottom = -10;
  pixelRect(left, top, right - left, bottom - top, WOOD.cut, 2);
  pixelRect(left, top, 2, bottom - top, WOOD.tip, 2);
  pixelRect(right - 2, top, 2, bottom - top, "#e0b77e", 2);
  pixelRect(left, top, right - left, 2, WOOD.light, 2);
  pixelRect(left, bottom - 2, right - left, 2, WOOD.tip, 2);
  pixelRect(18, top + 4, 2, bottom - top - 6, WOOD.tip, 2);
  // A green blanket heaped up in it.
  pixelRect(8, top - 4, 16, 4, PARK_GREEN.base, 2);
  pixelRect(12, top - 6, 8, 2, PARK_GREEN.light, 2);
  pixelRect(8, top - 4, 2, 4, PARK_GREEN.dark, 2);
  // The pennant, on a stick at the front corner.
  pixelRect(28, top - 16, 2, 16, PENNANT.pole, 2);
  for (let column = 0; column < 5; column++)
    for (let row = 0; row < 3; row++) {
      const white = column === 1 || row === 1;
      pixelRect(30 + column * 2, top - 16 + row * 2, 2, 2, white ? PENNANT.white : row === 2 ? PENNANT.redDark : PENNANT.red, 2);
    }
}

// ------------------------------------------------------------ Copenhagen bench

/** Where the bench's legs meet the ground, front left and front right. */
export const BENCH_ENDS = [-30, 30];
// The bench's cast iron, near black, and its slats in Copenhagen green.
const CAST = { dark: INK, base: RUBBER.dark, light: RUBBER.light };

/**
 * A Copenhagen bench, 68 long, seen from the front and a little above: green
 * slats, a seat about 18 high that you can see the top of, and a back that
 * leans back, on black cast-iron ends with curled armrests and claw feet.
 * Its far legs show behind the near ones, under the seat.
 */
export function drawBench({ pixelRect }) {
  const half = 34;
  // The far legs, in shadow under the seat.
  for (const x of [-26, 24]) pixelRect(x, -16, 2, 14, CAST.dark, 2);
  // The back's iron supports, showing between the slats.
  for (const x of [-28, -2, 24]) {
    pixelRect(x, -42, 4, 20, CAST.base, 2);
    pixelRect(x + 2, -42, 2, 20, CAST.light, 2);
  }
  // Back: three slats with gaps between, leaning back so each sits a little
  // further in than the one below it.
  for (const [y, inset] of [[-40, 6], [-34, 4], [-28, 2]]) {
    const left = -half + inset, width = (half - inset) * 2;
    pixelRect(left, y, width, 4, PARK_GREEN.base, 2);
    pixelRect(left, y, width, 2, PARK_GREEN.light, 2);
    pixelRect(left, y, 2, 4, PARK_GREEN.dark, 2);
    pixelRect(left + width - 2, y, 2, 2, PARK_GREEN.bright, 2);
  }
  // Seat: the top of the back slat and the front one seen from a little
  // above, then the front slat's edge.
  pixelRect(-half + 2, -22, half * 2 - 4, 2, PARK_GREEN.base, 2);
  pixelRect(-half + 2, -20, half * 2 - 4, 2, PARK_GREEN.dark, 2);
  pixelRect(-half, -18, half * 2, 2, PARK_GREEN.bright, 2);
  pixelRect(-half, -16, half * 2, 2, PARK_GREEN.light, 2);
  pixelRect(-half + 2, -14, half * 2 - 4, 2, PARK_GREEN.dark, 2);
  pixelRect(-half, -18, 2, 4, PARK_GREEN.dark, 2);
  // Near ends: a leg down to a claw foot, an armrest out over the seat with
  // a scroll curling down at its front.
  for (const x of BENCH_ENDS) {
    const lit = x > 0;
    const leg = x - 2;
    pixelRect(leg, -20, 4, 18, CAST.base, 2);
    pixelRect(lit ? leg + 2 : leg, -20, 2, 18, lit ? CAST.light : CAST.dark, 2);
    // Claw foot, splaying out.
    pixelRect(leg - 2, -4, 8, 2, CAST.base, 2);
    pixelRect(leg - 4, -2, 12, 2, CAST.dark, 2);
    pixelRect(lit ? leg + 4 : leg - 2, -4, 2, 2, CAST.light, 2);
    // Armrest and scroll.
    pixelRect(leg - 2, -30, 8, 2, CAST.light, 2);
    pixelRect(leg - 2, -28, 8, 2, CAST.base, 2);
    pixelRect(leg, -26, 4, 6, CAST.base, 2);
    pixelRect(lit ? leg + 2 : leg, -26, 2, 6, lit ? CAST.light : CAST.dark, 2);
    pixelRect(lit ? leg + 6 : leg - 4, -28, 2, 6, CAST.base, 2);
    pixelRect(lit ? leg + 4 : leg - 2, -22, 2, 2, CAST.base, 2);
  }
}
