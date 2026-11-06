// The Garage behind the rider in the customizer: a quiet, low-contrast room
// (roller door, pegboard, a stack of tyres and a concrete floor) so the rider and
// bike stand out. Drawn in world units on the art pixel grid, anchored to the
// bike, so every crop of a preview shows the same room.
//
// The room fills up with the rider's career (see garageRoom in state.js): a
// map on the wall with the route ridden so far, a shelf of cups for their
// gold medals, a nisse figurine on the tyres once one is found, and Coda the corgi on
// his bed once the rider has given him some attention. They stand either
// side of the door, so only the big preview shows them.
//
// Given a `time`, the room is alive: dust drifts in the light by the door,
// and Coda, petted, woofs (see codaAt), pants and wags his tail under a
// heart for a moment. Without one it stands still, as in the swatches.
//
// The light switch by the door is a real one: the customizer lays a button
// over it (see LIGHT_SWITCH) that turns the lights off, to show the bike's.
import { ART_PIXEL } from './drawing.js';
import { CORGI_HEART, drawCorgi } from './corgi-props.js';

const COLORS = {
  wall: '#5f716e',
  wallShade: '#556663',
  frame: '#465654',
  door: '#6d807b',
  doorSlat: '#5f706c',
  doorLight: '#7a8c86',
  board: '#6c6656',
  boardHole: '#5a5547',
  boardShade: '#4f5f5c',
  tool: '#8d9a95',
  toolLight: '#aab5b0',
  toolDark: '#4a5653',
  handle: '#9c4a3e',
  wood: '#8a6a48',
  woodDark: '#6a5038',
  tyre: '#2c3534',
  tyreLight: '#3e4a48',
  tread: '#232b2a',
  hole: '#1c2423',
  rim: '#7b8784',
  skirting: '#3a4746',
  floor: '#4a5754',
  floorLight: '#53615d',
  floorLine: '#414d4b',
  spot: '#58665f',
  shadow: 'rgba(16, 26, 26, 0.35)',
  paper: '#b9b39a',
  paperShade: '#9d977f',
  land: '#8a9a72',
  sea: '#7d9a9a',
  woods: '#667a58',
  sand: '#c2ae7a',
  lake: '#6a8c92',
  cave: '#6b6a60',
  city: '#a29f94',
  rock: '#8c8f88',
  snow: '#e8e5d9',
  route: '#5a4a3a',
  pin: '#c9433a',
  plank: '#7a6448',
  plankShade: '#5a4a36',
  gold: '#d9ad45',
  goldLight: '#f2d27a',
  goldShade: '#a07a2a',
  nisse: '#c9433a',
  beard: '#e8e5d9',
  face: '#d9a07a',
  nose: '#c9725a',
  bed: '#6b4a5a',
  bedLight: '#85607a',
  cushion: '#a8956d',
  dust: 'rgba(255, 248, 231, 0.3)',
  switchPlate: '#c9c4b0',
  switchShade: '#a39e8b',
  switchToggle: '#4a5653',
};

/**
 * What the rider has done that the Garage shows; see garageRoom in state.js.
 * @typedef {{ route: number, cups: number, nisse: boolean, coda: boolean }} GarageRoom
 *   `route` is how far through the official trails they are, 0 to 1, and
 *   `cups` how many of the gold medal achievements (first gold, three golds,
 *   ten golds, gold on every trail) they have earned, 0 to 4.
 */

/**
 * When the room is drawn: `seconds` how long it has been on screen, for what
 * moves in it, and `petted` how long ago Coda was petted, or null.
 * @typedef {{ seconds: number, petted?: number | null }} GarageTime
 */

// Where Coda sits on his bed, from the bike's midpoint and the floor, and the
// area the customizer's Pet Coda button covers.
const CODA_X = -64;
export const CODA_AREA = { left: -96, right: -36, top: -40, bottom: 2 };
// How long a pat keeps him panting and wagging, in seconds.
export const CODA_HAPPY = 3;

// Where the light switch is, the middle of its plate, from the bike's
// midpoint and the floor: on the wall right of the door.
export const LIGHT_SWITCH = { dx: 61, dy: -67 };

/**
 * @param {CanvasRenderingContext2D} ctx  in world units
 * @param {{ x: number, y: number, width: number, height: number }} view
 * @param {{
 *   x: number, floor: number, room?: GarageRoom | null, time?: GarageTime | null, lightsOff?: boolean
 * }} at  the bike's midpoint and the floor under its wheels, the rider's room, the time to
 *   show it at, and whether the light switch is off
 */
export function drawGarage(ctx, view, { x, floor, room = null, time = null, lightsOff = false }) {
  const px = ART_PIXEL;
  const snap = value => Math.round(value / px) * px;
  const rect = (left, top, width, height, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(snap(left), snap(top), Math.max(px, snap(width)), Math.max(px, snap(height)));
  };
  const left = view.x - px, top = view.y - px, right = view.x + view.width + px, bottom = view.y + view.height + px;
  const back = floor - 8;

  // Wall, a shade darker towards the ceiling.
  rect(left, top, right - left, back - top, COLORS.wall);
  rect(left, top, right - left, Math.max(0, floor - 84 - top), COLORS.wallShade);

  // Roller door behind the bike.
  const doorLeft = x - 50, doorRight = x + 50, doorTop = floor - 110;
  rect(doorLeft - 4, doorTop - 4, doorRight - doorLeft + 8, back - doorTop + 4, COLORS.frame);
  rect(doorLeft, doorTop, doorRight - doorLeft, back - doorTop, COLORS.door);
  for (let y = back - 6; y > doorTop; y -= 6) {
    rect(doorLeft, y, doorRight - doorLeft, 2, COLORS.doorSlat);
    rect(doorLeft, y + 2, doorRight - doorLeft, 2, COLORS.doorLight);
  }

  // Pegboard with its tools, to the left.
  const boardLeft = x - 100, boardTop = floor - 80;
  rect(boardLeft + px, boardTop + px, PEGBOARD_TOOLS[0].length * px, PEGBOARD_HEIGHT * px, COLORS.boardShade);
  rect(boardLeft, boardTop, PEGBOARD_TOOLS[0].length * px, PEGBOARD_HEIGHT * px, COLORS.board);
  for (let row = 1; row < PEGBOARD_HEIGHT; row += 3) for (let column = 1; column < PEGBOARD_TOOLS[0].length; column += 3)
    rect(boardLeft + column * px, boardTop + row * px, px, px, COLORS.boardHole);
  drawArt(rect, boardLeft, boardTop, PEGBOARD_TOOLS, TOOL_PALETTE);

  // The light switch, its toggle up while the lights are on.
  const switchLeft = x + LIGHT_SWITCH.dx - 3, switchTop = floor + LIGHT_SWITCH.dy - 5;
  rect(switchLeft, switchTop, 6, 10, COLORS.switchPlate);
  rect(switchLeft + 4, switchTop + 2, 2, 8, COLORS.switchShade);
  rect(switchLeft + 2, switchTop + (lightsOff ? 5 : 2), 2, 3, COLORS.switchToggle);

  if (room?.route > 0) drawMap(rect, x + 70, floor - 88, room.route);
  if (room?.cups) drawShelf(rect, x + 72, floor - 44, room.cups);

  // Dust drifting up through the light in front of the door, each mote on a
  // slow loop of its own.
  if (time) {
    for (let mote = 0; mote < DUST_MOTES; mote++) {
      const rise = (time.seconds * 3 + mote * 23) % 80;
      const sway = Math.sin(time.seconds * 0.4 + mote * 1.7) * 6;
      rect(x - 40 + mote * 13 + sway, floor - 14 - rise, 2, 2, COLORS.dust);
    }
  }

  // Concrete floor, lit under the bike.
  rect(left, back - 2, right - left, 2, COLORS.skirting);
  rect(left, back, right - left, bottom - back, COLORS.floor);
  rect(x - 60, back + 2, 120, bottom - back - 2, COLORS.floorLight);
  rect(x - 40, floor - 3, 80, bottom - floor + 3, COLORS.spot);
  for (const lineX of [x - 92, x - 52, x + 52, x + 92]) rect(lineX, floor + 4, 2, bottom - floor, COLORS.floorLine);
  rect(left, floor + 4, right - left, 2, COLORS.floorLine);

  // Soft shadow under the bike.
  rect(x - 36, floor - 2, 72, 4, COLORS.shadow);
  rect(x - 26, floor - 1, 52, 2, COLORS.shadow);

  // A stack of spare tyres to the right, on the floor in front of the wall.
  const tyresTop = floor + 2 - TYRES.length * px;
  rect(x + 60, floor, 26, 2, COLORS.shadow);
  drawArt(rect, x + 58, tyresTop, TYRES, TYRE_PALETTE);

  // A little nisse on the tyres, stood on the near edge of the top one,
  // left of its hole: a pointed red cap, a face and nose over a long white
  // beard, and a red coat.
  if (room?.nisse) {
    const nisseLeft = x + 60, nisseTop = tyresTop - 4;
    rect(nisseLeft + 4, nisseTop, 2, 2, COLORS.nisse);
    rect(nisseLeft + 2, nisseTop + 2, 4, 2, COLORS.nisse);
    rect(nisseLeft, nisseTop + 4, 6, 2, COLORS.nisse);
    rect(nisseLeft, nisseTop + 6, 6, 2, COLORS.face);
    rect(nisseLeft + 2, nisseTop + 6, 2, 2, COLORS.nose);
    rect(nisseLeft, nisseTop + 8, 6, 4, COLORS.beard);
    rect(nisseLeft, nisseTop + 12, 6, 2, COLORS.nisse);
  }

  // Coda on his bed by the back wheel, facing the rider, his tail off the edge.
  if (room?.coda) {
    rect(x - 92, floor - 6, 52, 6, COLORS.bed);
    rect(x - 90, floor - 8, 48, 2, COLORS.bedLight);
    rect(x - 88, floor - 6, 44, 2, COLORS.cushion);
    const sitX = x + CODA_X, sitY = floor - 4;
    // Petted, he pants twice a second and wags, with a heart floating up.
    const petted = time?.petted ?? null;
    const happy = petted !== null && petted < CODA_HAPPY;
    const pose = happy ? {
      pose: 'sit', pant: true, frame: Math.floor(petted * 4) % 2, wag: Math.round(Math.sin(petted * 12)),
      heart: petted < CORGI_HEART ? petted / CORGI_HEART : null
    } : { pose: 'sit' };
    drawCorgi({ pixelRect: (left, top, width, height, color) => rect(sitX + left, sitY + top, width, height, color) }, pose);
  }
}

const DUST_MOTES = 7;

// The tools on the pegboard, left to right: a ring spanner, a claw hammer,
// a screwdriver and a pair of pliers. The board is this wide and
// PEGBOARD_HEIGHT tall, with a hole every third pixel the tools don't cover.
const PEGBOARD_TOOLS = [
  '                    ',
  ' l l DDDDD l   ll   ',
  ' TTT DDDDD T   TT   ',
  '  T    W   T  TDDT  ',
  '  T    W   T   RR   ',
  '  T    W   T  R  R  ',
  '  T    W   RR R  R  ',
  '  T    W   RR R  R  ',
  '  T    W   RR R  R  ',
  '  T    w   RR R  R  ',
  ' TTT   w   RR       ',
  ' T T                ',
  ' TTT                ',
];
const PEGBOARD_HEIGHT = 14;
const TOOL_PALETTE = {
  T: COLORS.tool, l: COLORS.toolLight, D: COLORS.toolDark, R: COLORS.handle, W: COLORS.wood, w: COLORS.woodDark
};

// Two tyres lying on their sides, seen from a little above: the top one's
// rim and the hole through it, then the tread down both their sides.
const TYRES = [
  '   LLLLLLLL',
  ' LLLRRRRRRLLL',
  'LLLRHHHHHHRLLL',
  'tLLLRRRRRRLLLt',
  'ttLLLLLLLLLLtt',
  'tdttdttdttdttd',
  ' tttttttttttt',
  ' dddddddddddd',
  'LLLLLLLLLLLLLL',
  'tdttdttdttdttd',
  'tttttttttttttt',
  ' tttttttttttt',
];
const TYRE_PALETTE = { L: COLORS.tyreLight, t: COLORS.tyre, d: COLORS.tread, R: COLORS.rim, H: COLORS.hole };

// The map of the career, inside its paper border: the fields at the bottom
// left, then the woods, the desert, the lakes, the caves, the city and the
// snowy mountains at the top right, in the sea.
const MAP = [
  '~~~~~~~~~~ggmwm~',
  '~~~~~~~~~gcgmmwm',
  '~~~~~~gkkgccggm~',
  '~~~~~gkkkgcgg~~~',
  '~~~~ggggglllg~~~',
  '~~~gtgtggllgg~~~',
  '~~ggttgtsssg~~~~',
  '~gggtgtssssss~~~',
  '~gggggsssss~~~~~',
  '~~ggggg~~~~~~~~~',
];
const MAP_PALETTE = {
  '~': COLORS.sea, g: COLORS.land, t: COLORS.woods, s: COLORS.sand, l: COLORS.lake,
  k: COLORS.cave, c: COLORS.city, m: COLORS.rock, w: COLORS.snow
};

// Waypoints of the route across the map, through each world in turn, in its
// art pixels from the map's top left.
const MAP_ROUTE = [[2, 8], [5, 6], [9, 7], [11, 5], [7, 2], [10, 1], [13, 0]];

/** Paints rows of art, a character to a pixel, in `palette`'s colours; a space is left clear. */
function drawArt(rect, left, top, rows, palette) {
  rows.forEach((row, y) => [...row].forEach((key, x) => {
    if (palette[key]) rect(left + x * ART_PIXEL, top + y * ART_PIXEL, ART_PIXEL, ART_PIXEL, palette[key]);
  }));
}

/** A map pinned to the wall, with the route dotted along as far as `route` (0 to 1) and a pin at its end. */
function drawMap(rect, left, top, route) {
  const px = ART_PIXEL, width = (MAP[0].length + 2) * px, height = (MAP.length + 2) * px;
  rect(left + px, top + px, width, height, COLORS.paperShade);
  rect(left, top, width, height, COLORS.paper);
  drawArt(rect, left + px, top + px, MAP, MAP_PALETTE);
  // A dot on every other pixel along each leg, as far as the rider has got.
  const legs = MAP_ROUTE.length - 1;
  const end = route * legs;
  let last = MAP_ROUTE[0], dot = 0;
  for (let leg = 0; leg < legs && leg < end; leg++) {
    const [ax, ay] = MAP_ROUTE[leg], [bx, by] = MAP_ROUTE[leg + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const share = Math.min(1, end - leg);
    for (let step = leg ? 1 : 0; step <= share * steps; step++) {
      last = [Math.round(ax + (bx - ax) * step / steps), Math.round(ay + (by - ay) * step / steps)];
      if (dot++ % 2 === 0) rect(left + (last[0] + 1) * px, top + (last[1] + 1) * px, px, px, COLORS.route);
    }
  }
  const [pinX, pinY] = [left + (last[0] + 1) * px, top + (last[1] + 1) * px];
  rect(pinX, pinY - 4, px, 4 + px, COLORS.pin);
  rect(pinX - px, pinY - 6, 2 * px, px, COLORS.pin);
}

// Where each cup stands on the shelf, in the order they are won: the first
// gold's and three golds' at either end, ten golds' taller one beside the
// first, and gold on every trail's big one next to it, so the four stand
// handle to handle. Each is its bowl's left edge, width and height.
const CUPS = [[2, 4, 8], [28, 4, 8], [10, 4, 10], [18, 6, 12]];

/** A shelf on brackets, with a gold cup for each of the `cups` gold medal achievements earned. */
function drawShelf(rect, left, top, cups) {
  rect(left, top, 34, 2, COLORS.plank);
  rect(left, top + 2, 34, 2, COLORS.plankShade);
  rect(left + 4, top + 4, 2, 4, COLORS.plankShade);
  rect(left + 28, top + 4, 2, 4, COLORS.plankShade);
  for (const [dx, width, height] of CUPS.slice(0, cups)) {
    const at = left + dx;
    // The bowl with its handles, then the stem and the base.
    rect(at, top - height, width, height / 2, COLORS.gold);
    rect(at, top - height, 2, height / 2, COLORS.goldLight);
    rect(at - 2, top - height + 2, 2, 2, COLORS.goldShade);
    rect(at + width, top - height + 2, 2, 2, COLORS.goldShade);
    rect(at + width / 2 - 1, top - height / 2, 2, height / 2 - 2, COLORS.goldShade);
    rect(at, top - 2, width, 2, COLORS.goldShade);
  }
}
