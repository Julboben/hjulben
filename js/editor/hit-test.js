// What is under the pointer.
import { cubicPoint, edgeCurve, isCurvedEdge, pointInRegion } from "../terrain-geometry.js";
import { blockSelected, blocks, boundaryEntries, isBackWall } from "./blocks.js";
import {
  finishY,
  groundY,
  isActiveNode,
  objectY,
  syncTerrain,
} from "./render.js";
import { terrainGeometry } from "../terrain.js";
import { normalizeWater, waterColumns } from "../water.js";
import { DOT_REACH, EDGE_REACH, HIT_REACH, editor, waters } from "./state.js";
import { isBlockLocked, isHitLocked, isLocked } from "./locks.js";
import { waterHandle } from "./water.js";
import { insideGroup } from "./groups.js";
import { NISSE_GROUND_LIFT } from "../nisse.js";

/**
 * Selection priority, highest first: the visible curve handles of the active
 * node, then points, then boundary edges, then the solid body of a block.
 * Clicking empty cave space matches nothing, and clicking a nested island
 * selects the island rather than the block around it, because the topmost
 * solid under the cursor wins. With `wholeBoundary`, a point or edge selects
 * the whole ring it belongs to instead.
 *
 * Anything locked is skipped, as if it weren't there, so a press on a locked
 * back wall starts a selection box instead of grabbing it.
 *
 * Back walls sit behind the terrain, so terrain wins over them: their points
 * and edges lose a tie to the terrain's, and their bodies are only hit where
 * no terrain is. A selected back wall is grabbed like terrain.
 *
 * Edges are only grabbed within EDGE_REACH, and only on a block whose outline
 * is being worked on (see outlineOpen): on any other block a press on its
 * edge takes the whole block, so a sloppy click can't reshape something that
 * was only meant to be picked up. Points are drawn on every block, so they
 * can always be grabbed, but on a block that isn't open only on their dots.
 * Inside a selected block, the block itself wins over any edge and over
 * points away from their dots, so a selected block can be dragged from
 * anywhere inside it. `preferEdges` turns all of that off, for a double-click
 * that adds a point to an edge.
 */
export function hitTest(point, { wholeBoundary = false, preferEdges = false } = {}) {
  const hits = collectHits(point, wholeBoundary, preferEdges);
  // A lower rank wins outright; within a rank the nearer one, then the first.
  let best = null;
  for (const hit of hits)
    if (
      !best ||
      hit.rank < best.rank ||
      (hit.rank === best.rank && hit.distance < best.distance)
    )
      best = hit;
  if (wholeBoundary) return best?.selection || ringAt(point);
  if (!preferEdges && best && grabsSelectedBody(best)) {
    const body = selectedBodyAt(point);
    if (body) return body;
  }
  if (best) return best.selection;

  // Bodies: a spike's own disc, then the topmost solid block under the cursor.
  for (let index = editor.trail.spikes.length - 1; index >= 0; index--) {
    const spike = editor.trail.spikes[index];
    if (isLocked("spike", index)) continue;
    if (Math.hypot(point.x - spike.x, point.y - spike.y) <= spike.radius)
      return { kind: "spike", index };
  }
  const selectedBody = preferEdges ? null : selectedBodyAt(point);
  if (selectedBody) return selectedBody;
  const water = openWaterAt(point);
  if (water !== null) return { kind: "water", index: water };
  for (const blockIndex of frontToBack()) {
    if (pointInRegion(blocks()[blockIndex], point.x, point.y))
      return { kind: "block", blockIndex };
  }
  return null;
}

/**
 * Every point, handle and object within reach of a point, in the order
 * clicking there cycles through them: by priority, then nearest first.
 */
export function hitStack(point) {
  return collectHits(point, false)
    .filter((hit) => hit.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.distance - b.distance)
    .map((hit) => hit.selection);
}

/** Do two hits pick the same thing? */
export function sameHit(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  return ["index", "blockIndex", "boundaryIndex", "side"].every(
    (key) => a[key] === b[key],
  );
}

/**
 * Is this block's outline being worked on: the block, or a point, edge, curve
 * handle or ring of it, is selected? Only then can its edges be grabbed.
 */
export function outlineOpen(blockIndex) {
  const selection = editor.selection;
  if (!selection) return false;
  // A member of a group opens only once the author has gone into the group.
  const group = blocks()[blockIndex]?.group;
  if (group && !insideGroup(group)) return false;
  if (selection.kind === "items")
    return selection.items.some(
      (item) => (item.type === "block" ? item.index : item.blockIndex) === blockIndex &&
        (item.type === "block" || item.type === "point"),
    );
  if (selection.kind === "block") return blockSelected(blockIndex);
  return selection.blockIndex === blockIndex;
}

/** Everything grabbable near a point, with its distance and priority rank. */
function collectHits(point, wholeBoundary, preferEdges = false) {
  syncTerrain();
  const threshold = HIT_REACH / editor.zoom;
  const dotReach = DOT_REACH / editor.zoom;
  const edgeReach = EDGE_REACH / editor.zoom;
  const hits = [];
  const consider = (value, x, y, rank, reach = threshold) => {
    if (isHitLocked(value)) return;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= reach) hits.push({ selection: value, distance, rank });
  };

  for (const [blockIndex, block] of blocks().entries()) {
    if (isBlockLocked(blockIndex)) continue;
    const behind = isBackWall(block) && !blockSelected(blockIndex) ? 0.5 : 0;
    const open = preferEdges || outlineOpen(blockIndex);
    boundaryEntries(block).forEach(
      ({ boundary }, boundaryIndex) => {
        boundary.nodes.forEach((node, index) => {
          const base = { blockIndex, boundaryIndex, index };
          if (wholeBoundary) {
            const next = boundary.nodes[(index + 1) % boundary.nodes.length];
            const hit = edgeHit(node, next, point);
            consider(
              { kind: "blockBoundary", blockIndex, boundaryIndex },
              hit.x,
              hit.y,
              1 + behind,
            );
            return;
          }
          if (isActiveNode(blockIndex, boundaryIndex, index)) {
            for (const side of ["in", "out"]) {
              const handle = node[side];
              if (handle)
                consider(
                  { ...base, kind: "blockHandle", side },
                  handle[0],
                  handle[1],
                  0 + behind,
                );
            }
          }
          consider(
            { ...base, kind: "blockPoint" },
            node.x,
            node.y,
            1 + behind,
            open ? threshold : dotReach,
          );
          // The edge leaving this node, so a double-click can insert into it.
          // On a closed outline the edge stands for the block, so a press
          // just outside the block still takes it.
          const next = boundary.nodes[(index + 1) % boundary.nodes.length];
          const hit = edgeHit(node, next, point);
          if (hit.distance <= edgeReach)
            consider(
              open ? { ...base, kind: "blockEdge", t: hit.t } : { kind: "block", blockIndex },
              hit.x,
              hit.y,
              2 + behind,
            );
        });
      },
    );
  }
  if (wholeBoundary) return hits;

  editor.trail.apples.forEach((apple, index) =>
    consider({ kind: "apple", index }, apple.x, objectY(apple, 60), 1),
  );
  editor.trail.props.forEach((prop, index) =>
    consider({ kind: "prop", index }, prop.x, objectY(prop), 1),
  );
  if (editor.trail.nisse)
    consider({ kind: "nisse", index: 0 }, editor.trail.nisse.x, objectY(editor.trail.nisse, NISSE_GROUND_LIFT), 1);
  editor.trail.spikes.forEach((spike, index) =>
    consider({ kind: "spike", index }, spike.x, spike.y, 1),
  );
  waters().forEach((body, index) =>
    consider({ kind: "water", index }, ...waterHandle(body), 1),
  );
  const startY = Number.isFinite(editor.trail.start.y)
    ? editor.trail.start.y
    : groundY(editor.trail.start.x) - 12;
  consider({ kind: "start" }, editor.trail.start.x, startY, 1);
  consider({ kind: "finish" }, editor.trail.finish.x, finishY(), 1);
  return hits;
}

/**
 * The topmost water body with open water under a point, or null. Terrain
 * inside a body stays the terrain's, so a click there picks the block.
 */
function openWaterAt(point) {
  const compiled = terrainGeometry(editor.trail);
  for (let index = waters().length - 1; index >= 0; index--) {
    if (isLocked("water", index)) continue;
    const body = normalizeWater(waters()[index]);
    if (point.x < body.x || point.x > body.x + body.width) continue;
    if (point.y < body.y || point.y > body.y + body.depth) continue;
    const column = waterColumns(compiled, body).find(
      (entry) => point.x >= entry.x && point.x < entry.x + 2,
    );
    if (column?.segments.some(([top, bottom]) => point.y >= top && point.y <= bottom))
      return index;
  }
  return null;
}

/** Would a press inside a selected block take that block instead of this hit? */
function grabsSelectedBody(best) {
  const kind = best.selection.kind;
  if (kind === "blockEdge") return true;
  return kind === "blockPoint" && best.distance > DOT_REACH / editor.zoom;
}

/** The frontmost selected block whose solid is under a point. */
function selectedBodyAt(point) {
  for (const blockIndex of frontToBack()) {
    if (!blockSelected(blockIndex)) continue;
    if (pointInRegion(blocks()[blockIndex], point.x, point.y))
      return { kind: "block", blockIndex };
  }
  return null;
}

/**
 * Block indices from the frontmost down: a selected back wall, then the
 * terrain topmost first, then the other back walls. Locked blocks are left out.
 */
function frontToBack() {
  const order = [...blocks().keys()].reverse().filter((index) => !isBlockLocked(index));
  const rank = (index) =>
    isBackWall(blocks()[index]) ? (blockSelected(index) ? 0 : 2) : 1;
  return order.sort((a, b) => rank(a) - rank(b));
}

/**
 * The ring under a point away from any edge: the cave it is inside, or else
 * the outer boundary of the topmost solid block it is inside.
 */
function ringAt(point) {
  const inside = (boundary) =>
    pointInRegion({ outer: boundary, inner: [] }, point.x, point.y);
  const body = hitTest(point);
  // A block in front of the cave, such as an island inside it, wins.
  for (const blockIndex of frontToBack()) {
    if (body?.kind === "block" && blockIndex === body.blockIndex) break;
    const entries = boundaryEntries(blocks()[blockIndex]);
    const hole = entries.findIndex(
      (entry) => entry.hole >= 0 && inside(entry.boundary),
    );
    if (hole >= 0)
      return { kind: "blockBoundary", blockIndex, boundaryIndex: hole };
  }
  if (body?.kind !== "block") return null;
  // The outer boundary always comes first in a block's boundary list.
  return { kind: "blockBoundary", blockIndex: body.blockIndex, boundaryIndex: 0 };
}

/** The closest point on an edge, following the curve when the edge is curved. */
export function edgeHit(node, next, point) {
  if (!isCurvedEdge(node, next)) {
    const dx = next.x - node.x,
      dy = next.y - node.y;
    const lengthSquared = dx * dx + dy * dy;
    const amount =
      lengthSquared > 1e-9
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - node.x) * dx + (point.y - node.y) * dy) /
                lengthSquared,
            ),
          )
        : 0;
    return {
      x: node.x + dx * amount,
      y: node.y + dy * amount,
      t: amount,
      distance: Math.hypot(
        point.x - node.x - dx * amount,
        point.y - node.y - dy * amount,
      ),
    };
  }
  const control = edgeCurve(node, next);
  const at = (t) => {
    const [x, y] = cubicPoint(control[0], control[1], control[2], control[3], t);
    return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
  };
  // The nearest of a coarse set of samples, then narrowed down around it, so
  // a long curve is matched exactly at any zoom.
  const steps = 24;
  let best = at(0);
  for (let step = 1; step <= steps; step++) {
    const sample = at(step / steps);
    if (sample.distance < best.distance) best = sample;
  }
  for (let span = 1 / steps; span > 1e-4; span /= 2)
    for (const t of [best.t - span / 2, best.t + span / 2]) {
      if (t < 0 || t > 1) continue;
      const sample = at(t);
      if (sample.distance < best.distance) best = sample;
    }
  return best;
}
