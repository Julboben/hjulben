import assert from "node:assert/strict";
import {
  terrainCollisionsAt,
  terrainSweepCollision,
  seatedSurfaceAt,
  terrainAt,
  groundShadowSamples,
} from "../js/terrain.js";
import { sunLight, sunShadowOffset } from "../js/drawing.js";
import { normalizeTrail } from "../js/trail-schema.js";
import {
  propAlignmentSlope,
  propDrawAngle,
  propGroundOffset,
  propRotation,
  propPoint,
  canRotate,
} from "../js/drawing.js";
import { polygonBlock, rectangle, blockTrail } from "./lib/terrain-fixtures.mjs";

const trailOf = (blocks, extra = {}) => normalizeTrail(blockTrail(blocks, extra));
const radius = 12;

// Two slabs with a gap between them.
const flatGapTrail = trailOf(
  [rectangle(0, 100, 100, 300, "grass", "left"), rectangle(200, 100, 300, 300, "grass", "right")],
  { finish: { x: 280, y: null }, start: { x: 40, y: null, facing: 1 } },
);
assert.equal(
  terrainCollisionsAt(flatGapTrail, 150, 90, radius).length,
  0,
  "the gap between two blocks stays open",
);
assert.ok(
  terrainCollisionsAt(flatGapTrail, 104, 130, radius).length > 0,
  "the left gap wall collides",
);
assert.ok(
  terrainCollisionsAt(flatGapTrail, 196, 130, radius).length > 0,
  "the right gap wall collides",
);

// A floating block above a slab.
const islandTrail = trailOf(
  [rectangle(0, 500, 400, 700, "grass", "ground"), rectangle(100, 200, 240, 240, "concrete", "island")],
  { finish: { x: 380, y: null } },
);
const hits = (x, y, test) => terrainCollisionsAt(islandTrail, x, y, radius).some(test);
assert.ok(hits(170, 192, (c) => c.ny < 0), "a floating block's top collides");
assert.ok(hits(92, 220, (c) => c.nx < 0), "a floating block's side collides");
assert.ok(hits(170, 248, (c) => c.ny > 0), "a floating block's underside collides");
assert.ok(hits(94, 194, () => true), "a floating block's corner collides");
assert.ok(
  terrainSweepCollision(islandTrail, 170, 100, 170, 280, radius),
  "a fast approach sweeps into a floating block",
);
assert.equal(
  terrainAt(islandTrail, 170, 300).y,
  500,
  "the surface below the floating block is the ground",
);

// A steep wall pushes sideways rather than snapping the wheel up.
const steepTrail = trailOf(
  [polygonBlock([[0, 400], [200, 400], [220, 100], [400, 100], [400, 600], [0, 600]], "grass", "steep")],
  { finish: { x: 380, y: null } },
);
const [steep] = terrainCollisionsAt(steepTrail, 202, 300, 8);
assert.ok(steep, "the steep terrain remains collidable");
assert.ok(
  Math.abs(steep.nx) > Math.abs(steep.ny),
  "a steep contact pushes primarily sideways",
);
assert.ok(steep.ny > -0.5, "a steep contact does not snap the wheel upward");

// A hill with a gap and a floating rock shelf above it, for prop seating.
const hillTrail = trailOf(
  [
    polygonBlock([[0, 100], [140, 240], [140, 500], [0, 500]], "grass", "hill-left"),
    polygonBlock([[180, 280], [200, 300], [200, 500], [180, 500]], "grass", "hill-right"),
    polygonBlock([[40, 40], [160, 80], [160, 110], [40, 70]], "concrete", "shelf"),
  ],
  { finish: { x: 190, y: null }, start: { x: 20, y: null, facing: 1 } },
);
const hillMid = terrainAt(hillTrail, 100, 200);
assert.ok(Math.abs(hillMid.slope - 1) < 1e-9, "the hill slopes down at 45 degrees");
assert.equal(
  seatedSurfaceAt(hillTrail, 160, null),
  null,
  "ground-anchored props inside a gap have no surface",
);
assert.equal(
  seatedSurfaceAt(hillTrail, 100, hillMid.y - 40),
  null,
  "a prop floating above the hill stays unseated",
);
assert.equal(
  seatedSurfaceAt(hillTrail, 100, hillMid.y)?.y,
  hillMid.y,
  "a prop resting on the hill uses that surface",
);
const shelfY = terrainAt(hillTrail, 80).y;
assert.ok(
  Math.abs(seatedSurfaceAt(hillTrail, 80, shelfY).y - shelfY) < 1e-9,
  "a prop resting on the shelf uses the shelf",
);

const fence = { x: 100, y: hillMid.y, type: "fence" };
const tree = { x: 100, y: hillMid.y, type: "tree" };
const pine = { x: 100, y: hillMid.y, type: "pine" };
const flowers = { x: 80, y: shelfY, type: "flowers" };
const rock = { x: 80, y: shelfY, type: "rock" };
const boulder = { x: 80, y: shelfY, type: "boulder" };
assert.equal(propAlignmentSlope(hillTrail, tree), 0, "trees stay upright");
assert.equal(propAlignmentSlope(hillTrail, pine), 0, "pines stay upright");
assert.equal(propAlignmentSlope(hillTrail, flowers), 0, "flowers stay upright");
assert.ok(
  propAlignmentSlope(hillTrail, fence) > 0.5,
  "fences follow the hill under their footprint",
);
assert.ok(
  propAlignmentSlope(hillTrail, rock) > 0.3,
  "rocks follow the shelf under their footprint",
);
assert.ok(
  propAlignmentSlope(hillTrail, boulder) > 0.3,
  "boulders follow the shelf under their footprint",
);
assert.equal(
  propDrawAngle("tree", 1),
  0,
  "upright props ignore slope when drawn",
);
assert.equal(propDrawAngle("stump", 1), 0, "stumps stay upright");
assert.equal(propDrawAngle("crystal", 1), 0, "crystals stay upright");
assert.equal(propDrawAngle("pine", 1), 0, "pines ignore the slope when drawn");
assert.ok(
  Math.abs(propDrawAngle("fence", 1) - Math.atan(1)) < 1e-9,
  "fences rotate to the ground angle",
);
assert.ok(
  Math.abs(propDrawAngle("boulder", 1) - Math.atan(1)) < 1e-9,
  "boulders rotate to the ground angle",
);

const treeBase = propGroundOffset(hillTrail, tree);
const pineBase = propGroundOffset(hillTrail, pine);
const flowerBase = propGroundOffset(hillTrail, flowers);
const floatingTree = propGroundOffset(hillTrail, {
  x: 100,
  y: hillMid.y - 40,
  type: "tree",
});
assert.equal(treeBase(0), 0, "an upright prop stays planted at its anchor");
assert.ok(
  treeBase(8) > treeBase(-8),
  "tree trunks meet the downhill side of the hill",
);
assert.ok(
  pineBase(8) > pineBase(-8),
  "pine trunks meet the downhill side of the hill",
);
assert.ok(
  flowerBase(6) > flowerBase(-6),
  "each flower is planted on the slope under it",
);
assert.equal(floatingTree(8), 0, "a floating prop keeps a trail base");

// Crates on a cave floor under a low ledge stand level: the ledge's top is
// a surface within reach of one end, but the floor is the one they stand on.
const ledgeTrail = trailOf(
  [
    polygonBlock([[0, 250], [800, 250], [800, 400], [0, 400]], "stone", "floor"),
    polygonBlock([[420, 138], [485, 157], [550, 160], [750, 160], [750, 190], [430, 190]], "stone", "ledge"),
  ],
  { finish: { x: 700, y: null }, start: { x: 20, y: null, facing: 1 } },
);
assert.equal(propAlignmentSlope(ledgeTrail, { x: 525, y: 250, type: "crates" }), 0, "a ledge over a prop doesn't tip it");

// A rotated prop is posed by hand: its rotation replaces the slope, and its
// trunks and posts no longer reach for the ground.
const tiltedFence = { ...fence, rotation: 30 };
assert.equal(propAlignmentSlope(hillTrail, tiltedFence), 0, "a rotated prop ignores the slope");
assert.equal(propGroundOffset(hillTrail, { ...tree, rotation: -20 })(8), 0, "a rotated prop has a flat base");
assert.ok(Math.abs(propRotation(tiltedFence) - Math.PI / 6) < 1e-9, "rotation is read in degrees");
assert.equal(propRotation({ ...fence, rotation: 0 }), 0, "no rotation is no rotation");
for (const type of ["stalactites", "beams", "minecart", "lily", "fish", "squirrel", "corgi", "rabbit", "tumbleweed", "vulture", "bird", "heat-haze", "ski-lift", "icicles", "moss"]) {
  assert.ok(!canRotate(type), `${type} keeps its own angle`);
  assert.equal(propRotation({ x: 0, y: 0, type, rotation: 45 }), 0, `${type} ignores rotation`);
}
for (const type of ["tree", "crates", "sign", "lamp", "rock", "vines", "roots", "graffiti"]) assert.ok(canRotate(type), `${type} can rotate`);
const turnedLamp = propPoint({ x: 100, type: "lamp", rotation: 90 }, 200, 22, -114);
assert.ok(Math.abs(turnedLamp.x - 214) < 1e-9 && Math.abs(turnedLamp.y - 222) < 1e-9, "a quarter turn clockwise swings the lamp head to the right");
const flippedLadder = propPoint({ x: 100, type: "ladder", flip: true }, 200, 22, -114);
assert.ok(Math.abs(flippedLadder.x - 78) < 1e-9 && flippedLadder.y === 86, "a flipped ladder mirrors its point");

const crest = trailOf(
  [
    polygonBlock([[0, 200], [20, 180], [20, 400], [0, 400]], "grass", "crest-left"),
    polygonBlock([[40, 160], [100, 100], [200, 200], [200, 400], [40, 400]], "grass", "crest"),
  ],
  { finish: { x: 190, y: null }, start: { x: 120, y: null, facing: 1 } },
);
const crestShadow = groundShadowSamples(crest, 100, 80, 30).flat();
const crestCenter = crestShadow.find((sample) => sample.x === 100);
const crestEdge = crestShadow.find((sample) => sample.x === 70);
assert.ok(crestCenter && crestEdge, "the shadow is sampled across the crest");
assert.ok(
  crestEdge.y > crestCenter.y,
  "the shadow drops with the ground on either side of a hilltop",
);
const gapShadow = groundShadowSamples(crest, 30, 150, 40);
assert.equal(
  gapShadow.flat().some((sample) => sample.x > 20 && sample.x < 40),
  false,
  "the shadow does not cross a gap",
);
assert.equal(
  gapShadow.length,
  2,
  "the shadow breaks into the solid ground on either side of a gap",
);

const slopeShadow = groundShadowSamples(
  hillTrail,
  100,
  hillMid.y - 20,
  24,
).flat();
assert.ok(
  slopeShadow.at(-1).y > slopeShadow[0].y,
  "the shadow follows a downhill slope",
);

const noon = sunLight({
  width: 400,
  cameraX: 0,
  cameraY: 0,
  weather: { sun: 1, clouds: 0 },
});
assert.ok(noon.x > 200, "the sun sits in the right side of the sky");
assert.equal(
  sunLight({ width: 400, weather: { sun: 0, clouds: 1 } }).strength,
  0,
  "a hidden sun casts no sideways light",
);
const besideSun = sunShadowOffset({
  bikeX: 120,
  bikeY: 280,
  sunX: noon.x,
  sunY: noon.y,
  height: 0,
  strength: noon.strength,
});
const airborne = sunShadowOffset({
  bikeX: 120,
  bikeY: 280,
  sunX: noon.x,
  sunY: noon.y,
  height: 400,
  strength: noon.strength,
});
assert.ok(besideSun < 0, "a sun on the right shifts the shadow to the left");
assert.ok(
  airborne < besideSun,
  "jumping shifts the shadow a little farther from the sun",
);
assert.ok(
  Math.abs(airborne) <= 14,
  "the shadow stays with the rider instead of sliding down the hill",
);
assert.equal(
  sunShadowOffset({
    bikeX: 120,
    bikeY: 280,
    sunX: noon.x,
    sunY: noon.y,
    height: 400,
    strength: 0,
  }),
  0,
  "a hidden sun leaves the shadow centered",
);

const [buried] = terrainCollisionsAt(flatGapTrail, 60, 140, 4);
assert.ok(buried, "a point buried far below the surface still collides");
assert.ok(
  Math.abs(buried.nx) < 1e-9 && Math.abs(buried.ny + 1) < 1e-9,
  "a buried point is pushed out through the nearest edge, even when it is outside the query radius",
);
assert.ok(
  Math.abs(buried.penetration - 44) < 1e-9,
  "a buried point reports its full depth",
);

console.log("Terrain collision, seating and shadow tests passed.");
