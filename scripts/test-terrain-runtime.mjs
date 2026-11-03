// The runtime half of the terrain: the compiled geometry that physics
// and surface queries read, covering the plan's Runtime acceptance criteria.
import { isDeepStrictEqual } from "node:util";
import {
  compileTerrain, removeTerrainBodies, terrainContacts, terrainSweep, terrainSurfaceBelow, terrainSurfaceNear,
  terrainSolidAt, terrainShadowSamples, terrainSurfaces, terrainRaycast,
} from "../js/terrain-runtime.js";
import { rectangleBlock, cutBlock, normalizeBlock, setBoundaryEdge } from "../js/terrain-geometry.js";
import { backWallGeometry, terrainGeometry, updateTerrain } from "../js/terrain.js";
import { normalizeTrail, trailTerrainBlocks } from "../js/trail-schema.js";
import { loadCatalogTrails } from "./lib/trails.mjs";

let failures = 0;
const check = (label, condition) => {
  if (!condition) { failures++; console.log("FAIL", label); }
  else console.log("ok  ", label);
};
const trail = blocks => ({ terrainBlocks: blocks });
const R = 12;

// 1. A solid block: floor, walls, and ceiling all collide.
{
  const ground = trail([rectangleBlock(-200, 500, 2000, 1500)]);
  const compiled = compileTerrain(ground);
  const floor = terrainContacts(compiled, 100, 490, R)[0];
  check("floor pushes up", floor && floor.ny < -0.9);
  check("floor reports the top", floor && floor.y === 500);
  // A normal always points from solid into empty, so a wheel overlapping the
  // block's right wall is pushed further right, away from the rock.
  const wall = terrainContacts(compiled, 2010, 700, R)[0];
  check("right wall pushes away from the block", wall && wall.nx > 0.9);
  const left = terrainContacts(compiled, -210, 700, R)[0];
  check("left wall pushes away from the block", left && left.nx < -0.9);
  check("a wheel exactly tangent to a wall has no contact", terrainContacts(compiled, 2012, 700, R).length === 0);
  const ceiling = terrainContacts(compiled, 100, 1510, R)[0];
  check("ceiling pushes down", ceiling && ceiling.ny > 0.9);
  check("open air has no contact", terrainContacts(compiled, 100, 200, R).length === 0);
  check("open air is not solid", !terrainSolidAt(compiled, 100, 200));
  check("rock is solid", terrainSolidAt(compiled, 100, 700));
}

// 2. A cave: floor, ceiling, and walls, and no contact with the roof above.
{
  const holed = cutBlock(rectangleBlock(-200, 500, 2000, 1500), [[600, 700], [1400, 700], [1400, 1200], [600, 1200]]);
  const compiled = compileTerrain(trail([holed.blocks[0]]));
  check("cave ceiling does not push a rider below it",
    terrainContacts(compiled, 1000, 900, R).length === 0);
  // The cave spans y 700 (ceiling) to 1200 (floor) between x 600 and 1400.
  const caveFloor = terrainContacts(compiled, 1000, 1190, R)[0];
  check("cave floor pushes up", caveFloor && caveFloor.ny < -0.9 && caveFloor.y === 1200);
  const caveRoof = terrainContacts(compiled, 1000, 710, R)[0];
  check("cave roof pushes down", caveRoof && caveRoof.ny > 0.9 && caveRoof.y === 700);
  const caveWall = terrainContacts(compiled, 590, 900, R)[0];
  check("cave wall pushes into the cave", caveWall && caveWall.nx > 0.9);
  check("above the cave is still solid", terrainSolidAt(compiled, 1000, 600));
  // A query started inside the cave finds the cave floor, not the surface above
  // the ceiling. This is the cave-aware behaviour the plan calls for.
  check("query inside a cave finds the cave floor", terrainSurfaceBelow(compiled, 1000, 950)?.y === 1200);
  check("query above a cave finds the top surface", terrainSurfaceBelow(compiled, 1000, 450)?.y === 500);
  check("query just under the cave roof finds the floor below it", terrainSurfaceBelow(compiled, 1000, 710)?.y === 1200);
}

// 3. A nested island inside a cave stays solid and collides.
{
  const host = cutBlock(rectangleBlock(-200, 500, 2000, 1500), [[600, 700], [1400, 700], [1400, 1200], [600, 1200]]);
  const island = rectangleBlock(900, 900, 1100, 1000);
  const compiled = compileTerrain(trail([host.blocks[0], island]));
  check("nested island is solid", terrainSolidAt(compiled, 1000, 950));
  check("cave is empty around the island", !terrainSolidAt(compiled, 700, 950));
  const islandTop = terrainContacts(compiled, 1000, 890, R)[0];
  check("island top collides", islandTop && islandTop.ny < -0.9 && islandTop.y === 900);
  check("query above the island finds the island first", terrainSurfaceBelow(compiled, 1000, 880)?.y === 900);
  check("query in the cave still finds the cave floor", terrainSurfaceBelow(compiled, 1000, 1050)?.y === 1200);
}

// 4. Overlapping blocks leave no internal collision barrier.
{
  const compiled = compileTerrain(trail([
    rectangleBlock(-200, 500, 2000, 1500),
    rectangleBlock(400, 400, 1600, 600),
  ]));
  // Deep inside the overlap there must be no wall between the two blocks.
  const deep = terrainContacts(compiled, 1000, 550, 4);
  check("overlap interior has no internal barrier", deep.every(c => Math.abs(c.nx) < 0.5));
  const top = terrainContacts(compiled, 1000, 390, R)[0];
  check("the upper block's own top still collides", top && top.ny < -0.9 && top.y === 400);
}

// 5. Moving the host block leaves a nested block alone.
{
  const host = cutBlock(rectangleBlock(-200, 500, 2000, 1500), [[600, 700], [1400, 700], [1400, 1200], [600, 1200]]);
  const island = rectangleBlock(900, 900, 1100, 1000);
  const before = terrainSurfaceBelow(compileTerrain(trail([host.blocks[0], island])), 1000, 880);
  const after = terrainSurfaceBelow(compileTerrain(trail([{ ...host.blocks[0], outer: host.blocks[0].outer, inner: host.blocks[0].inner }, island])), 1000, 880);
  check("a nested block is independent of its host", before.y === after.y);
}

// 6. Swept collisions still work against the compiled geometry.
{
  const compiled = compileTerrain(trail([rectangleBlock(-200, 500, 2000, 1500)]));
  const hit = terrainSweep(compiled, 100, 100, 100, 495, R);
  check("a fast drop sweeps into the floor", hit && hit.ny < -0.9);
  check("swept contact reports the surface", hit && hit.pointY === 500);
  check("a sweep away from the floor misses", terrainSweep(compiled, 100, 200, 100, 100, R) === null);
  // Sweeping left into the right-hand wall is pushed back to the right.
  const wall = terrainSweep(compiled, 2400, 700, 1990, 700, R);
  check("a fast sideways sweep hits the wall", wall && wall.nx > 0.9);
}

// 6b. Raycasts, as slanted weather uses them to find where it lands.
{
  // Ground at y 500 and an overhang above it from x 400 to 800, y 200 to 250.
  const compiled = compileTerrain(trail([
    rectangleBlock(-200, 500, 2000, 1500),
    rectangleBlock(400, 200, 800, 250),
  ]));
  check("a straight-down ray lands on the overhang", terrainRaycast(compiled, 600, 0, 600, 2000)?.y === 200);
  check("a ray beside the overhang lands on the ground", terrainRaycast(compiled, 300, 0, 300, 2000)?.y === 500);
  // Falling down-left from the right of the overhang reaches the ground under it.
  const slanted = terrainRaycast(compiled, 1100, 0, 100, 1000);
  check("a slanted ray reaches the ground under an overhang", slanted && slanted.y === 500 && slanted.x === 600);
  check("a ray leaving the terrain does not hit it", terrainRaycast(compiled, 600, 700, 600, 2000) === null);
  check("a ray inside a block finds nothing to enter", terrainRaycast(compiled, 600, 220, 600, 240) === null);
}

// 7. Surfaces and shadow samples.
{
  const compiled = compileTerrain(trail([
    rectangleBlock(-200, 500, 600, 1500),
    rectangleBlock(800, 500, 2000, 1500),
  ]));
  const all = terrainSurfaces(compiled, 400);
  check("solid ground has an entry and an exit surface", all.length === 2 && all[0].y === 500 && all[0].entering);
  check("no surface over a gap", terrainSurfaces(compiled, 700).length === 0);
  const samples = terrainShadowSamples(compiled, 400, 400, 100, 2);
  check("a shadow is sampled over solid ground", samples.flat().length > 0);
  const gapSamples = terrainShadowSamples(compiled, 700, 400, 50, 2);
  check("a shadow over a gap is empty", gapSamples.flat().length === 0);
  const straddling = terrainShadowSamples(compiled, 600, 400, 200, 2);
  check("a shadow breaks at the gap edge", straddling.length === 2);
}

// 8. Curved ground.
{
  const curved = normalizeBlock({ material: "grass", outer: { nodes: [
    { x: 0, y: 500, edge: "curve", out: [200, 300] },
    { x: 600, y: 500, in: [400, 300], edge: "straight" },
    { x: 600, y: 1500, edge: "straight" },
    { x: 0, y: 1500, edge: "straight" },
  ] }, inner: [] });
  const compiled = compileTerrain(trail([curved]));
  const crest = terrainSurfaceBelow(compiled, 300, 300);
  check("a curve bulges away from its endpoints", crest && crest.y < 500);
  const contact = terrainContacts(compiled, 300, crest.y + 10, R)[0];
  check("a curved surface collides", contact && Math.abs(contact.ny) > 0.9);
  // The authored curve is symmetric, so its slope is zero at the crest and
  // steepest on the flanks.
  check("the crest of a symmetric curve is flat", Math.abs(contact.slope) < 0.01);
  const flank = terrainContacts(compiled, 100, terrainSurfaceBelow(compiled, 100, 100).y + 10, R)[0];
  check("the flank of the same curve is steep", flank && Math.abs(flank.slope) > 0.5);
}

// 9. A cut straight through a block leaves two solid blocks with a gap between.
{
  const split = cutBlock(rectangleBlock(-200, 500, 2000, 1500), [[900, 400], [920, 400], [920, 1600], [900, 1600]]);
  check("a cut through makes two blocks", split.blocks.length === 2);
  const compiled = compileTerrain(trail(split.blocks));
  check("both sides of a split are solid", terrainSolidAt(compiled, 500, 700) && terrainSolidAt(compiled, 1400, 700));
  check("the split is a gap", !terrainSolidAt(compiled, 910, 700));
  check("the split gap has a left wall", terrainContacts(compiled, 890, 700, R)[0]?.nx > 0.9);
  check("the split gap has a right wall", terrainContacts(compiled, 930, 700, R)[0]?.nx < -0.9);
}

// 10. An entrance: a tunnel cut in from the outside, with a roof above it.
{
  const entrance = cutBlock(rectangleBlock(-200, 500, 2000, 1500), [[-400, 800], [700, 800], [700, 1000], [-400, 1000]]);
  const compiled = compileTerrain(trail([entrance.blocks[0]]));
  check("the entrance mouth is open", !terrainSolidAt(compiled, -150, 900));
  check("the tunnel is open", !terrainSolidAt(compiled, 400, 900));
  check("the roof over the tunnel is solid", terrainSolidAt(compiled, 400, 700));
  check("a query above the tunnel finds its roof", terrainSurfaceBelow(compiled, 400, 400)?.y === 500);
  check("a query in the tunnel finds its floor", terrainSurfaceBelow(compiled, 400, 900)?.y === 1000);
  check("the tunnel floor collides", terrainContacts(compiled, 400, 990, R)[0]?.ny < -0.9);
  check("the tunnel roof collides", terrainContacts(compiled, 400, 810, R)[0]?.ny > 0.9);
}

// The editor changes blocks in place and rebuilds only what they touch
// (updateTerrain): the result must be exactly what compiling every block
// again gives, on every trail, through a run of edits.
{
  // Everything a query, the physics or the renderer reads, without identities.
  const shape = compiled => compiled && JSON.stringify({
    bounds: compiled.bounds,
    blockCount: compiled.blockCount,
    bodies: compiled.bodies.map(body => ({
      blockId: body.blockId, blockIndex: body.blockIndex, order: body.order, material: body.material,
      rings: body.rings, bounds: body.bounds, edges: [...body.edges], sides: [...body.sides],
      buckets: body.buckets, live: [...body.live], liveBuckets: body.liveBuckets,
    })),
    columns: [...compiled.columns].sort((a, b) => a[0] - b[0]).map(([column, list]) => [column, list.map(body => body.order)]),
  });
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const trails = ['official', 'bonus', 'custom'].flatMap(source => loadCatalogTrails(source));
  let edits = 0, mismatches = 0, incremental = 0;
  for (const entry of trails) {
    const edited = normalizeTrail(entry.trail);
    const front = edited.terrainBlocks.filter(block => block.layer !== 'back');
    if (front.length < 2) continue;
    terrainGeometry(edited);
    for (let step = 0; step < 4; step++) {
      // Move a block, stretch one of its points, or change its material.
      const block = front[Math.floor(random() * front.length)];
      const kind = step % 3;
      if (kind === 0) for (const boundary of [block.outer, ...block.inner]) for (const node of boundary.nodes) { node.x += 37; node.y -= 23; }
      else if (kind === 1) { block.outer.nodes[0].x -= 55; block.outer.nodes[0].y += 15; }
      else block.material = block.material === 'stone' ? 'brick' : 'stone';
      updateTerrain(edited, new Set([block]));
      const updated = terrainGeometry(edited);
      if (updated.update) incremental++;
      // Compiled apart from the trail's cache, which keeps the run of edits going.
      const full = compileTerrain({ terrainBlocks: trailTerrainBlocks(edited) });
      edits++;
      if (shape(updated) !== shape(full)) {
        mismatches++;
        console.log(`  ${entry.id}: block ${edited.terrainBlocks.indexOf(block) + 1} after edit ${step + 1} differs from a full compile`);
      }
    }
  }
  check(`an edit rebuilt in place matches a full compile (${edits} edits on ${trails.length} trails)`, edits > 0 && mismatches === 0);
  check('and edits are rebuilt in place, not compiled again', incremental === edits);
}

// A block moved between the terrain and the back walls, in place as the
// editor's layer selector does, leaves the one and joins the other.
{
  const moving = normalizeTrail({ terrainBlocks: [rectangleBlock(-200, 500, 2000, 900), { ...rectangleBlock(400, 100, 700, 500), layer: "back" }] });
  const block = moving.terrainBlocks[1];
  const walls = () => backWallGeometry(moving)?.bodies.length ?? 0;
  terrainGeometry(moving);
  check("the back wall starts as a back wall", walls() === 1 && terrainGeometry(moving).bodies.length === 1);
  delete block.layer;
  updateTerrain(moving, new Set([block]));
  check("moved into the terrain, it is no longer drawn as a back wall", walls() === 0 && terrainGeometry(moving).bodies.length === 2);
  block.layer = "back";
  updateTerrain(moving, new Set([block]));
  check("and moved back, it is a back wall again", walls() === 1 && terrainGeometry(moving).bodies.length === 1);
}

// Breaking glass takes its pane out of the compiled terrain in place: the
// result must be exactly what compiling again without it gives, pane after
// pane, and the terrain it started from, shared by every ride, is unchanged.
{
  // Everything compiled is compared, so a field added to compileTerrain later
  // that removeTerrainBodies doesn't keep up fails here. Only `update`, which
  // tells the renderer what changed, differs by design.
  const same = (a, b) => isDeepStrictEqual({ ...a, update: undefined }, { ...b, update: undefined });
  for (const { id, trail: catalogTrail } of ['official', 'bonus'].flatMap(source => loadCatalogTrails(source))) {
    const blocks = trailTerrainBlocks(catalogTrail);
    const panes = blocks.filter(block => block.material === 'glass').map(block => String(block.id));
    if (!panes.length) continue;
    const source = compileTerrain(trail(blocks));
    const before = structuredClone(source);
    const broken = new Set();
    let current = source, matches = true;
    for (const pane of panes) {
      broken.add(pane);
      current = removeTerrainBodies(current, new Set([pane]));
      matches &&= same(current, compileTerrain({ terrainBlocks: blocks, brokenBlocks: broken }));
    }
    check(`${id}: breaking each pane in place matches compiling again`, matches);
    check(`${id}: and leaves the trail's own terrain as it was`, same(source, before));
  }
}

console.log(failures ? `\n${failures} failing` : "\nTerrain runtime tests passed.");
process.exit(failures ? 1 : 0);
