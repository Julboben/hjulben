// The Garage behind the rider in the customizer: a quiet, low-contrast room
// (roller door, pegboard, a tyre stack and a concrete floor) so the rider and
// bike stand out. Drawn in world units on the art pixel grid, anchored to the
// bike, so every crop of a preview shows the same room.
//
// The room fills up with the rider's career (see garageRoom in state.js): a
// map pinned to the pegboard with the route ridden so far, a shelf of cups for their
// gold medals, a nisse figurine on the tyres once one is found, and Coda the corgi on
// his bed once the rider has given him some attention. They stand either
// side of the door, so only the big preview shows them.
//
// Given a `time`, the room is alive: dust drifts in the light by the door,
// and Coda, petted, woofs (see codaAt), pants and wags his tail under a
// heart for a moment. Without one it stands still, as in the swatches.
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
  tool: '#8d9a95',
  toolDark: '#4a5653',
  tyre: '#2c3534',
  tyreLight: '#3e4a48',
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
};

/**
 * What the rider has done that the Garage shows; see garageRoom in state.js.
 * @typedef {{ route: number, cups: number, nisse: boolean, coda: boolean }} GarageRoom
 *   `route` is how far through the official trails they are, 0 to 1, and
 *   `cups` how many of the gold medal achievements (first gold, three golds,
 *   gold on every trail) they have earned, 0 to 3.
 */

/**
 * When the room is drawn: `seconds` how long it has been on screen, for what
 * moves in it, and `petted` how long ago Coda was petted, or null.
 * @typedef {{ seconds: number, petted?: number | null }} GarageTime
 */

// Where Coda sits on his bed, from the bike's midpoint and the floor, and the
// area a click pets him in.
const CODA_X = -64;
const CODA_AREA = { left: -96, right: -36, top: -40, bottom: 2 };
// How long a pat keeps him panting and wagging, in seconds.
export const CODA_HAPPY = 3;

/**
 * Whether a point in world units, from the bike's midpoint and the floor
 * under it, is on Coda, for petting him.
 */
export const codaAt = (dx, dy) =>
  dx >= CODA_AREA.left && dx <= CODA_AREA.right && dy >= CODA_AREA.top && dy <= CODA_AREA.bottom;

/**
 * @param {CanvasRenderingContext2D} ctx  in world units
 * @param {{ x: number, y: number, width: number, height: number }} view
 * @param {{ x: number, floor: number, room?: GarageRoom | null, time?: GarageTime | null }} at  the
 *   bike's midpoint and the floor under its wheels, the rider's room, and the time to show it at
 */
export function drawGarage(ctx, view, { x, floor, room = null, time = null }) {
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

  // Pegboard with a few tools, to the left.
  const boardLeft = x - 82, boardTop = floor - 76;
  rect(boardLeft, boardTop, 24, 26, COLORS.board);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++)
    rect(boardLeft + 4 + column * 8, boardTop + 4 + row * 8, 2, 2, COLORS.boardHole);
  rect(boardLeft + 4, boardTop + 6, 2, 14, COLORS.tool);
  rect(boardLeft + 2, boardTop + 4, 6, 2, COLORS.tool);
  rect(boardLeft + 12, boardTop + 6, 2, 10, COLORS.toolDark);
  rect(boardLeft + 10, boardTop + 16, 6, 4, COLORS.toolDark);
  rect(boardLeft + 18, boardTop + 6, 4, 4, COLORS.tool);
  rect(boardLeft + 19, boardTop + 10, 2, 10, COLORS.tool);

  // A stack of spare tyres, to the right.
  for (let index = 0; index < 2; index++) {
    const tyreLeft = x + 58, tyreTop = floor - 10 - index * 10;
    rect(tyreLeft + 2, tyreTop, 20, 10, COLORS.tyre);
    rect(tyreLeft, tyreTop + 2, 24, 6, COLORS.tyre);
    rect(tyreLeft + 2, tyreTop, 20, 2, COLORS.tyreLight);
    rect(tyreLeft + 8, tyreTop + 4, 8, 2, COLORS.rim);
  }

  // The map is pinned over the pegboard, clear of the preview's light switch top right.
  if (room?.route > 0) drawMap(rect, x - 86, floor - 72, room.route);
  if (room?.cups) drawShelf(rect, x + 54, floor - 44, room.cups);

  // Dust drifting up through the light in front of the door, each mote on a
  // slow loop of its own.
  if (time) {
    for (let mote = 0; mote < DUST_MOTES; mote++) {
      const rise = (time.seconds * 3 + mote * 23) % 80;
      const sway = Math.sin(time.seconds * 0.4 + mote * 1.7) * 6;
      rect(x - 40 + mote * 13 + sway, floor - 14 - rise, 2, 2, COLORS.dust);
    }
  }

  // A little nisse on the tyres: a pointed red cap, a face and nose over a
  // long white beard, and a red coat.
  if (room?.nisse) {
    const nisseLeft = x + 66, nisseTop = floor - 34;
    rect(nisseLeft + 4, nisseTop, 2, 2, COLORS.nisse);
    rect(nisseLeft + 2, nisseTop + 2, 4, 2, COLORS.nisse);
    rect(nisseLeft, nisseTop + 4, 6, 2, COLORS.nisse);
    rect(nisseLeft, nisseTop + 6, 6, 2, COLORS.face);
    rect(nisseLeft + 2, nisseTop + 6, 2, 2, COLORS.nose);
    rect(nisseLeft, nisseTop + 8, 6, 4, COLORS.beard);
    rect(nisseLeft, nisseTop + 12, 6, 2, COLORS.nisse);
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

// Waypoints of the route across the map, from the bottom left to the snowy
// top right, relative to its top left corner.
const MAP_ROUTE = [[4, 15], [8, 12], [12, 14], [16, 11], [19, 12], [22, 9], [24, 8]];

/** A map pinned to the wall, with the route dotted along as far as `route` (0 to 1) and a pin at its end. */
function drawMap(rect, left, top, route) {
  rect(left, top, 30, 20, COLORS.paperShade);
  rect(left, top, 28, 18, COLORS.paper);
  rect(left + 2, top + 2, 24, 14, COLORS.sea);
  rect(left + 2, top + 8, 14, 8, COLORS.land);
  rect(left + 10, top + 4, 16, 10, COLORS.land);
  rect(left + 22, top + 2, 4, 4, COLORS.paper);
  // The dots along each leg, as far as the rider has got.
  const legs = MAP_ROUTE.length - 1;
  const end = route * legs;
  let last = MAP_ROUTE[0];
  for (let leg = 0; leg < legs && leg < end; leg++) {
    const [ax, ay] = MAP_ROUTE[leg], [bx, by] = MAP_ROUTE[leg + 1];
    const share = Math.min(1, end - leg);
    for (let step = 0; step <= share * 2; step++) {
      const t = step / 2;
      last = [ax + (bx - ax) * t, ay + (by - ay) * t];
      rect(left + last[0], top + last[1], 2, 2, COLORS.route);
    }
  }
  rect(left + last[0], top + last[1] - 4, 2, 4, COLORS.pin);
  rect(left + last[0] - 2, top + last[1] - 6, 4, 2, COLORS.pin);
}

// Where each cup stands on the shelf, in the order they are won: the first
// gold's and three golds' either side, and gold on every trail's big one in
// the middle. Each is its bowl's left edge, width and height.
const CUPS = [[4, 4, 8], [28, 4, 8], [14, 8, 12]];

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
