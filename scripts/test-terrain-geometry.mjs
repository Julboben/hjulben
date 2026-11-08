// The terrain model: one block type with outer and inner boundaries,
// curve-preserving cuts, point editing, and validation.
//
// The plan's acceptance criteria for the terrain model live here. Physics and
// rendering against the compiled result are in test-terrain-runtime.mjs.
import {
  rectangleBlock, cutBlock, normalizeBlock, regionRings, pointInRegion,
  regionArea, flattenBoundary, moveBlock, insertBoundaryNode, validateBlock, addInnerBoundary,
  createNode, createBoundary, createRegion, hitTestBlock, removeBoundaryNodes, setBoundaryEdge,
  setNodeMode, blockSolidArea, isCurvedEdge, scaleBlock, rotateBlock, mirrorBlock, mergeBlocks,
} from "../js/terrain-geometry.js";
import { normalizeTrail, validateTrail } from "../js/trail-schema.js";

let failures = 0;
const check = (label, condition) => {
  if (!condition) { failures++; console.log("FAIL", label); }
  else console.log("ok  ", label);
};

// 1. Rectangle block basics.
const square = rectangleBlock(0, 0, 100, 100);
check("rectangle is a single block", Array.isArray(square.inner) && !("regions" in square));
check("rectangle area", Math.abs(regionArea(square) - 10000) < 1e-6);
check("point inside", pointInRegion(square, 50, 50));
check("point outside", !pointInRegion(square, 150, 50));
check("validates clean", validateBlock(square).length === 0);

// 2. A cut entirely inside solid becomes an inner boundary.
const holed = cutBlock(square, [[25, 25], [75, 25], [75, 75], [25, 75]]);
check("inner cut changed the block", holed.changed);
check("inner cut keeps one block", holed.blocks.length === 1);
check("inner cut adds a hole", holed.blocks[0].inner.length === 1);
const region = holed.blocks[0];
check("cave is empty", !pointInRegion(region, 50, 50));
check("wall is solid", pointInRegion(region, 10, 50));
check("area dropped by the hole", Math.abs(regionArea(region) - 10000 + 2500) < 1e-6);
check("inner cut still valid", validateBlock(holed.blocks[0]).length === 0);

// 3. A cut across the whole block splits it into two blocks, largest first.
const split = cutBlock(square, [[45, -10], [55, -10], [55, 110], [45, 110]]);
check("cut through splits into two blocks", split.changed && split.blocks.length === 2);
check("the largest piece keeps the block id", split.blocks[0].id === square.id && split.blocks[1].id !== square.id);
check("split pieces come largest first", regionArea(split.blocks[0]) >= regionArea(split.blocks[1]));
check("split pieces are solid", split.blocks.every(b => regionArea(b) > 0));
check("split pieces keep the material", split.blocks.every(b => b.material === square.material));
check("split is valid", split.blocks.every(b => validateBlock(b).length === 0));

// 4. A cut across the outside edge opens an entrance.
const entrance = cutBlock(square, [[-10, 30], [60, 30], [60, 45], [-10, 45]]);
check("edge cut changes the block", entrance.changed);
check("edge cut stays one block", entrance.blocks.length === 1);
check("entrance is open", !pointInRegion(entrance.blocks[0], 20, 37));
check("inside the notch is solid", pointInRegion(entrance.blocks[0], 20, 60));
check("entrance is valid", validateBlock(entrance.blocks[0]).length === 0);

// 5. A cut outside the block changes nothing and says so.
const missed = cutBlock(square, [[500, 500], [600, 500], [600, 600]]);
check("distant cut is refused", !missed.changed && typeof missed.reason === "string");
check("refused cut returns the same block", missed.blocks.length === 1 && missed.blocks[0] === square);

// 6. Curves survive a cut that misses them.
const curved = normalizeBlock({
  material: "grass",
  outer: {
    id: "b1",
    nodes: [
      { id: "a", x: 0, y: 0, edge: "curve", out: [40, 80] },
      { id: "b", x: 100, y: 0, mode: "smooth", in: [60, 80], edge: "straight" },
      { id: "c", x: 100, y: 100, edge: "straight" },
      { id: "d", x: 0, y: 100, edge: "straight" },
    ],
  },
  inner: [],
});
const topBefore = flattenBoundary(curved.outer).points[1][1];
// The authored curve runs from (0,0) to (100,0) with handles at y=80, so it
// bulges down to about y=60 in the middle.
check("curve bulges downward", Math.max(...flattenBoundary(curved.outer).points.map(p => p[1])) > 40);
const nearMiss = cutBlock(curved, [[10, 200], [30, 200], [30, 220], [10, 220]]);
check("a cut below the block is refused", !nearMiss.changed);
const through = cutBlock(curved, [[40, -20], [60, -20], [60, 20], [40, 20]]);
check("a cut through the top changes the block", through.changed);
// The notch is taken out of the top edge and the surviving curve rejoins into
// one editable edge, so the block returns to its authored node count.
check("a dented block stays one block", through.blocks.length === 1);
const dentBoundary = through.blocks[0].outer;
check("the dented block returns to four nodes", dentBoundary.nodes.length === 4);
const dents = dentBoundary.nodes.filter((n, i) => isCurvedEdge(n, dentBoundary.nodes[(i + 1) % dentBoundary.nodes.length]));
check("the curve survives the notch", dents.length === 1);

// 7. Moving a block moves its caves with it.
const moved = moveBlock(holed.blocks[0], 500, 0);
check("moved block moved its outer", moved.outer.nodes[0].x === 600);
const movedHoleX = moved.inner[0].nodes[0].x;
check("moved block moved its hole", movedHoleX === 525);
check("moved cave is still empty", !pointInRegion(moved, 550, 50));

// Scaling a block scales its caves and curve handles about the pivot.
const scaled = scaleBlock(holed.blocks[0], 0, 0, 2, 3);
const area = (block) => blockSolidArea(block);
check("scaled block covers the scaled area", Math.abs(area(scaled) - area(holed.blocks[0]) * 6) < 1);
check("scaled block keeps its cave", scaled.inner.length === holed.blocks[0].inner.length);
const roundish = { ...holed.blocks[0], outer: { ...holed.blocks[0].outer, nodes: [
  { ...holed.blocks[0].outer.nodes[0], x: 10, y: 0, in: [10, -5], out: [10, 5] },
  ...holed.blocks[0].outer.nodes.slice(1),
] }, inner: [] };
const curvedScaled = scaleBlock(roundish, 0, 0, 2, 2).outer.nodes[0];
check("scaling moves curve handles", curvedScaled.in[1] === -10 && curvedScaled.out[0] === 20);

// Rotating a block turns its caves and curve handles about the pivot.
const wide = rectangleBlock(0, 0, 200, 100);
const turned = rotateBlock(wide, 100, 50, Math.PI / 2);
const xs = turned.outer.nodes.map(n => n.x), ys = turned.outer.nodes.map(n => n.y);
check("a quarter turn swaps width and height",
  Math.max(...xs) - Math.min(...xs) === 100 && Math.max(...ys) - Math.min(...ys) === 200);
check("rotation keeps the ids", turned.id === wide.id
  && turned.outer.nodes.every((n, i) => n.id === wide.outer.nodes[i].id));
const rotatedHoled = rotateBlock(holed.blocks[0], 13, 7, 0.7);
check("rotation keeps the area", Math.abs(area(rotatedHoled) - area(holed.blocks[0])) < 1);
check("rotation keeps the cave", rotatedHoled.inner.length === 1);
const back = rotateBlock(rotatedHoled, 13, 7, -0.7);
check("turning back restores the block", back.outer.nodes.every((n, i) =>
  Math.abs(n.x - holed.blocks[0].outer.nodes[i].x) < 0.05 && Math.abs(n.y - holed.blocks[0].outer.nodes[i].y) < 0.05));
const curvedTurned = rotateBlock(roundish, 0, 0, Math.PI / 2).outer.nodes[0];
check("rotation turns curve handles", curvedTurned.x === 0 && curvedTurned.y === 10
  && curvedTurned.in[0] === 5 && curvedTurned.in[1] === 10 && curvedTurned.out[0] === -5);

// Mirroring a block keeps its shape, caves and curves, and leaves its rings
// running the way normalization wants, so loading it again changes nothing.
{
  const lopsided = normalizeBlock({ ...holed.blocks[0], outer: setBoundaryEdge(holed.blocks[0].outer, 0, true) });
  const curved = block => block.outer.nodes.filter((node, i, nodes) => isCurvedEdge(node, nodes[(i + 1) % nodes.length])).length;
  for (const horizontal of [true, false]) {
    const way = horizontal ? "left to right" : "upside down";
    const mirrored = mirrorBlock(lopsided, 40, 30, horizontal);
    check(`a block mirrored ${way} keeps its area and cave`,
      Math.abs(area(mirrored) - area(lopsided)) < 1 && mirrored.inner.length === 1);
    check(`and keeps its curved edge`, curved(mirrored) === curved(lopsided) && curved(lopsided) === 1);
    check(`and is left as it is by normalization`,
      JSON.stringify(normalizeBlock(mirrored)) === JSON.stringify(mirrored));
    const xs = block => regionRings(block)[0].map(([x, y]) => horizontal ? x : y);
    check(`and lands across the line`, Math.abs(Math.max(...xs(mirrored)) - (2 * (horizontal ? 40 : 30) - Math.min(...xs(lopsided)))) < 0.05);
    const twice = mirrorBlock(mirrored, 40, 30, horizontal);
    check(`mirrored ${way} twice, it is the block it was`, JSON.stringify(twice) === JSON.stringify(lopsided));
  }
}

// 8. Validation catches malformed geometry.
check("non-finite is rejected", validateBlock({ material: "grass", outer: { nodes: [
  { x: Number.NaN, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 },
] }, inner: [] }).some(m => m.type === "error"));
check("degenerate ring is rejected", validateBlock({ material: "grass", outer: { nodes: [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
] }, inner: [] }).some(m => m.type === "error"));
check("hole outside its region is rejected", validateBlock({
  material: "grass",
  outer: { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }, inner: [
    { nodes: [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }, { x: 100, y: 110 }] },
  ],
}).some(m => m.type === "error"));
const blockTrail = blocks => normalizeTrail({
  version: 2, name: "Buried", start: { x: 0, y: -40 }, finish: { x: 60, y: -40 },
  apples: [], terrainBlocks: blocks,
});
const buriedWarnings = blocks => validateTrail(blockTrail(blocks)).filter(m => /buried/.test(m.text));
check("a block inside a later block is buried", /^Block 1 /.test(buriedWarnings([square, rectangleBlock(-20, -20, 120, 120)])[0]?.text || ""));
check("a block inside an earlier block is buried", /^Block 2 /.test(buriedWarnings([rectangleBlock(-20, -20, 120, 120), square])[0]?.text || ""));
check("only the inner block is reported", buriedWarnings([rectangleBlock(-20, -20, 120, 120), square]).length === 1);
check("a visible block does not warn", buriedWarnings([square, rectangleBlock(500, 500, 600, 600)]).length === 0);
check("single block validation has no warnings", !validateBlock(square).some(m => m.type === "warning"));

// 9. Point editing.
const inserted = insertBoundaryNode(square.outer, 0, 0.5);
check("insert adds a node", inserted.nodes.length === 5);
const shapeBefore = regionArea(square);
const shapeAfter = regionArea({ outer: inserted, inner: [] });
check("inserting on a straight edge preserves area", Math.abs(shapeAfter - shapeBefore) < 1e-6);
const removed = removeBoundaryNodes(inserted, [4]);
check("removing a node keeps the ring valid", removed.nodes.length === 4);

// 10. Curve controls.
const bent = setBoundaryEdge(square.outer, 0, true);
check("edge can be curved", bent.nodes[0].out !== null && bent.nodes[1].in !== null);
const smoothed = setNodeMode(bent, 1, "smooth");
check("smooth aligns the handles", Math.abs(
  (smoothed.nodes[1].out[0] - smoothed.nodes[1].x) + (smoothed.nodes[1].in[0] - smoothed.nodes[1].x),
) < 1e-6);
const straightened = setBoundaryEdge(bent, 0, false);
check("edge can go back to straight", straightened.nodes[0].out === null);

// 11. Hit testing priority.
const hitCave = hitTestBlock(holed.blocks[0], 50, 50);
check("empty cave space selects nothing", hitCave === null);
const hitWall = hitTestBlock(holed.blocks[0], 12, 50);
check("solid selects the block", hitWall?.type === "solid");
const hitNode = hitTestBlock(holed.blocks[0], 0, 0);
check("a corner node wins over the body", hitNode?.type === "node");

// 12. Blocks are independent: nesting is purely geometric.
const island = rectangleBlock(40, 40, 60, 60);
const withIsland = { blocks: [holed.blocks[0], island] };
check("the island floats in the cave's empty space", !pointInRegion(withIsland.blocks[0], 50, 50));
check("island block is its own solid", pointInRegion(island, 50, 50));
check("island area is independent", Math.abs(blockSolidArea(island) - 400) < 1e-6);
check("the island does not fill the cave", !pointInRegion(withIsland.blocks[0], 50, 50));
check("the island is still its own solid", pointInRegion(withIsland.blocks[0], 5, 5));

// 13. Cuts through curved edges keep the curve editable.
{
  const curved = normalizeBlock({
    material: "grass",
    outer: {
      id: "b1",
      nodes: [
        { id: "a", x: 0, y: 0, edge: "curve", out: [40, 80] },
        { id: "b", x: 100, y: 0, in: [60, 80], edge: "straight" },
        { id: "c", x: 100, y: 100, edge: "straight" },
        { id: "d", x: 0, y: 100, edge: "straight" },
      ],
    },
    inner: [],
  });
  // The curve bulges down to about y=60 in the middle.
  check("a curve flattens to more than its endpoints",
    Math.max(...flattenBoundary(curved.outer).points.map(p => p[1])) > 40);

  const through = cutBlock(curved, [[40, -20], [60, -20], [60, 20], [40, 20]]);
  check("a cut through a curve changes the block", through.changed);
  // A dent in the top edge is not a split, so the block keeps one region and
  // rejoins the curve into a single editable edge.
  check("a dented block stays one block", through.blocks.length === 1);
  check("the dented block returns to four nodes", through.blocks[0].outer.nodes.length === 4);
  const dented = through.blocks[0].outer;
  check("the curve survives the notch",
    dented.nodes.filter((node, index) => isCurvedEdge(node, dented.nodes[(index + 1) % dented.nodes.length])).length === 1);
  check("the notch is empty", !pointInRegion(through.blocks[0], 50, 0));
  check("the body below the notch is solid", pointInRegion(through.blocks[0], 50, 80));
  check("left of the notch the rock is solid", pointInRegion(through.blocks[0], 20, 60));
  check("above the curve is air", !pointInRegion(through.blocks[0], 20, 20));

  // A cut entirely in the air above the block, even overlapping its bounds, does
  // nothing and leaves the very same block object in place.
  const above = cutBlock(curved, [[40, -100], [60, -100], [60, -60], [40, -60]]);
  check("a cut in the air above the block is refused", !above.changed);
  check("a refused cut returns the identical block", above.blocks[0] === curved);

  // Repeated cuts stay stable.
  let block = curved;
  for (const cut of [[[20, -20], [30, -20], [30, 20], [20, 20]], [[70, -20], [80, -20], [80, 20], [70, 20]]]) {
    const result = cutBlock(block, cut);
    if (result.changed) block = result.blocks[0];
  }
  const again = cutBlock(block, [[45, 40], [55, 40], [55, 60], [45, 60]]);
  check("repeated cuts stay valid", again.changed);
  check("repeated cuts never produce a zero-area region",
    again.changed && again.blocks.every(piece => regionArea(piece) > 0));
}

// 14. A small cut must not turn a block into hundreds of nodes.
{
  const count = block => [block.outer, ...block.inner].reduce((sum, boundary) => sum + boundary.nodes.length, 0);
  const make = () => normalizeBlock({
    material: "grass",
    outer: {
      id: "b1",
      nodes: [
        { id: "a", x: 0, y: 0, edge: "curve", out: [40, 80] },
        { id: "b", x: 100, y: 0, in: [60, 80], edge: "straight" },
        { id: "c", x: 100, y: 100, edge: "straight" },
        { id: "d", x: 0, y: 100, edge: "straight" },
      ],
    },
    inner: [],
  });
  check("an authored block has four nodes", count(make()) === 4);

  // A curve that flattens into dozens of segments must still come back as one
  // editable edge after a cut.
  const heavy = normalizeBlock({
    material: "grass",
    outer: {
      id: "b1",
      nodes: [
        { id: "a", x: 0, y: 0, edge: "curve", out: [10, 300] },
        { id: "b", x: 400, y: 0, in: [390, 300], edge: "straight" },
        { id: "c", x: 400, y: 300, edge: "straight" },
        { id: "d", x: 0, y: 300, edge: "straight" },
      ],
    },
    inner: [],
  });
  check("a heavy curve flattens into many segments", flattenBoundary(heavy.outer).points.length > 40);
  const gash = cutBlock(heavy, [[190, 200], [210, 200], [210, 260], [190, 260]]);
  check("a heavily subdivided curve survives a cut", gash.changed);
  check("a heavy curve stays a manageable node count", gash.changed && count(gash.blocks[0]) < 60);
}

// 15. Merging blocks that overlap or touch.
{
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const box = (left, top, right, bottom, material = "grass") => rectangleBlock(left, top, right, bottom, material);
  const valid = block => validateBlock(block).length === 0;

  const overlap = mergeBlocks([box(0, 0, 100, 100), box(50, 50, 150, 150)]);
  check("overlapping blocks merge", overlap.changed);
  check("overlap area is the union", overlap.changed && near(regionArea(overlap.block), 17500));
  check("overlap is one outline of eight corners", overlap.changed && overlap.block.outer.nodes.length === 8 && overlap.block.inner.length === 0);
  check("overlap is valid", overlap.changed && valid(overlap.block));

  const side = mergeBlocks([box(0, 0, 100, 100), box(100, 0, 200, 100)]);
  check("blocks sharing an edge merge", side.changed && near(regionArea(side.block), 20000));
  check("a shared edge leaves no points where the blocks met", side.changed && side.block.outer.nodes.length === 4);

  const partial = mergeBlocks([box(0, 0, 100, 100), box(100, 20, 200, 80)]);
  check("blocks sharing part of an edge merge", partial.changed && near(regionArea(partial.block), 16000));
  check("a partly shared edge keeps both of its ends", partial.changed && partial.block.outer.nodes.length === 8);
  check("partly shared edge is solid where they meet", partial.changed && pointInRegion(partial.block, 100, 50));
  check("partly shared edge is valid", partial.changed && valid(partial.block));

  const larger = mergeBlocks([box(0, 30, 100, 70), box(100, 0, 200, 100)]);
  check("a short edge against a long one merges", larger.changed && near(regionArea(larger.block), 14000) && larger.block.outer.nodes.length === 8);

  const cup = cutBlock(box(0, 0, 300, 200), [[100, -10], [200, -10], [200, 150], [100, 150]]).blocks[0];
  const lid = mergeBlocks([cup, box(50, -50, 250, 50)]);
  check("closing a U shape merges", lid.changed);
  check("closing a U shape leaves a cave", lid.changed && lid.block.inner.length === 1 && !pointInRegion(lid.block, 150, 100));
  check("closed U is valid", lid.changed && valid(lid.block));

  const caved = cutBlock(box(0, 0, 200, 200), [[50, 50], [150, 50], [150, 150], [50, 150]]).blocks[0];
  const plug = mergeBlocks([caved, box(25, 25, 175, 175)]);
  check("a block over a cave fills it", plug.changed && plug.block.inner.length === 0 && near(regionArea(plug.block), 40000));
  const partPlug = mergeBlocks([caved, box(40, 40, 100, 160)]);
  check("a block over part of a cave shrinks it", partPlug.changed && partPlug.block.inner.length === 1 && near(regionArea(partPlug.block), 40000 - 5000));

  const round = normalizeBlock({
    material: "grass",
    outer: {
      nodes: [
        { x: 0, y: 0, edge: "curve", out: [40, -60] },
        { x: 100, y: 0, mode: "smooth", in: [60, -60], edge: "straight" },
        { x: 100, y: 100, edge: "straight" },
        { x: 0, y: 100, edge: "straight" },
      ],
    },
    inner: [],
  });
  const withCurve = mergeBlocks([box(80, 40, 180, 100), round]);
  check("a curved block merges", withCurve.changed);
  check("its untouched curve stays one curved edge", withCurve.changed
    && withCurve.block.outer.nodes.filter(node => isCurvedEdge(node, withCurve.block.outer.nodes[(withCurve.block.outer.nodes.indexOf(node) + 1) % withCurve.block.outer.nodes.length])).length === 1);

  const apart = mergeBlocks([box(0, 0, 100, 100), box(200, 0, 300, 100)]);
  check("blocks that are apart are refused", !apart.changed && typeof apart.reason === "string");
  const corner = mergeBlocks([box(0, 0, 100, 100), box(100, 100, 200, 200)]);
  check("blocks meeting at a corner are refused", !corner.changed);

  const chain = mergeBlocks([box(0, 0, 100, 100), box(200, 0, 300, 100), box(90, 40, 210, 60)]);
  check("blocks that only meet through a third merge", chain.changed && near(regionArea(chain.block), 20000 + 100 * 20));

  const big = box(0, 0, 200, 200, "rock");
  const mixed = mergeBlocks([box(150, 0, 250, 100, "sand"), big]);
  check("the largest block keeps its id and material", mixed.changed && mixed.block.id === big.id && mixed.block.material === "rock");

  const wall = { ...box(50, 0, 150, 100), layer: "back" };
  check("terrain and back walls are refused", !mergeBlocks([box(0, 0, 100, 100), wall]).changed);
  check("one block is refused", !mergeBlocks([box(0, 0, 100, 100)]).changed);
  const walls = mergeBlocks([{ ...box(0, 0, 100, 100), layer: "back" }, wall]);
  check("back walls merge into a back wall", walls.changed && walls.block.layer === "back");

  // A cut that ends exactly on a flat edge still works with every collinear split recorded.
  const flush = cutBlock(box(0, 0, 100, 100), [[0, 20], [50, 20], [50, 60], [0, 60]]);
  check("a cut flush with an edge opens a notch", flush.changed && flush.blocks.length === 1 && near(regionArea(flush.blocks[0]), 8000));
}

// A point settles in one pass, whatever its handles, edge and mode: the mode
// is part of the trail's hash, so a second normalization must not change it.
// A smooth point whose edge out is straight once came back independent, then
// a corner.
{
  const unsettled = [];
  for (const hasIn of [false, true]) for (const hasOut of [false, true])
    for (const edge of ['straight', 'curve']) for (const mode of ['corner', 'smooth', 'independent']) {
      const node = { x: 100, y: 0, edge, mode, in: hasIn ? [80, -20] : null, out: hasOut ? [120, 20] : null };
      const once = normalizeBlock({ material: 'grass', outer: { nodes: [{ x: 0, y: 0 }, node, { x: 100, y: 100 }, { x: 0, y: 100 }] }, inner: [] });
      const twice = normalizeBlock(once);
      if (JSON.stringify(twice.outer.nodes) !== JSON.stringify(once.outer.nodes)) unsettled.push(`${mode}, edge ${edge}, ${hasIn ? 'in' : 'no in'}, ${hasOut ? 'out' : 'no out'}`);
    }
  check(`a point settles in one normalization${unsettled.length ? ` (not: ${unsettled.join('; ')})` : ''}`, unsettled.length === 0);
}

console.log(failures ? `\n${failures} failing` : "\nTerrain geometry tests passed.");
process.exit(failures ? 1 : 0);
