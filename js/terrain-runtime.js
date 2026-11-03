// Runtime terrain: compiles the editable blocks into the single combined
// geometry that physics, surface queries, and rendering all read from.
//
// The pipeline is:
//
//   stored boundaries -> deterministic subdivision -> one body per block, with
//   its holes -> every body edge split where another body crosses it -> each
//   piece kept only if it lies on the boundary of the union of all solids
//
// Each block's holes are applied to that block alone, so a nested island stays
// solid inside another block's cave. Collision reads only the surviving
// ("live") pieces, so a buried edge can never become an invisible wall and a
// half-covered edge still collides where it is exposed.
//
// Containment and vertical surface queries read the full rings of every body
// and merge them into the union, so they never depend on how the seams were
// classified. The renderer reads the same column spans, which is what keeps the
// drawn terrain and the collided terrain the same shape.

import { hypot } from './det-math.js';
import { sweepCircleSegment } from './physics.js';
import { flattenBoundary, ringArea, COINCIDENT_EPSILON, MIN_AREA } from './terrain-geometry.js';

const EDGE_BUCKET_WIDTH = 64;
const COLUMN_WIDTH = 64;

// How far off a piece of boundary to probe when deciding whether another block
// fills the far side. Far below an art pixel, so a genuine gap between two
// blocks is never mistaken for a seam, and far above floating point noise.
const SEAM_PROBE = 0.05;

// Crossings closer to a piece's ends than this do not split it again.
const SPLIT_EPSILON = 1e-7;

// Bumped whenever the compiled collision shape changes for the same input. It
// is folded into the gameplay identity of every trail that has blocks, so a
// compiler change can never reuse an old leaderboard.
export const TERRAIN_COMPILER_VERSION = 2;

/**
 * @typedef {object} TerrainBody
 * @property {string} blockId
 * @property {number} blockIndex Draw and material priority: later blocks win.
 * @property {string} material
 * @property {number[][][]} rings Flattened outer ring first, then holes.
 * @property {{ left: number, right: number, top: number, bottom: number }} bounds
 * @property {Float64Array} edges Every ring edge as [ax, ay, bx, by].
 * @property {number} edgeCount
 * @property {number[][]} buckets Edge indices by x bucket from bounds.left.
 * @property {Float64Array} live Union-boundary pieces as [ax, ay, bx, by, nx, ny].
 * @property {number} liveCount
 * @property {number[][]} liveBuckets Live piece indices by x bucket.
 */

/**
 * Compile a trail's blocks into collision and query geometry. Deterministic:
 * the same blocks in the same order always produce the same compiled result.
 * Blocks whose ids are in `brokenBlocks` are left out but keep their place in
 * the order, so every other body compiles exactly as it would with them in.
 *
 * @param {{ terrainBlocks?: object[], brokenBlocks?: { has(id: string): boolean } }} trail
 */
export function compileTerrain(trail) {
  const blocks = Array.isArray(trail?.terrainBlocks) ? trail.terrainBlocks : [];
  const broken = trail?.brokenBlocks;
  /** @type {TerrainBody[]} */
  const bodies = [];
  blocks.forEach((block, blockIndex) => {
    if (broken?.has(String(block?.id ?? `block-${blockIndex}`))) return;
    const body = buildBody(block, blockIndex);
    if (body) { body.order = bodies.length; bodies.push(body); }
  });
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const body of bodies) {
    bounds.left = Math.min(bounds.left, body.bounds.left);
    bounds.right = Math.max(bounds.right, body.bounds.right);
    bounds.top = Math.min(bounds.top, body.bounds.top);
    bounds.bottom = Math.max(bounds.bottom, body.bounds.bottom);
  }
  const compiled = { version: TERRAIN_COMPILER_VERSION, bodies, bounds, blockCount: blocks.length, columns: indexColumns(bodies) };
  classifyEdges(compiled);
  return compiled;
}

/**
 * The compiled terrain after some blocks changed in place, as the editor
 * changes them: the same result as compiling every block again, but only the
 * changed blocks are rebuilt and only bodies they overlap, before or after the
 * change, are classified again. A body's surface depends only on the bodies
 * overlapping it, so every other body is reused as it was.
 *
 * `changed` maps block indices to their blocks as they are now, and
 * `blockCount` is how many blocks there are. Null when a change can't be
 * applied in place, so everything has to be compiled again: a different block
 * count, or a block that gains or loses a body (so later bodies would change
 * their order).
 *
 * The result carries `update`, the world x ranges that changed, so a renderer
 * that drew `previous` can redraw only those.
 *
 * @param {ReturnType<typeof compileTerrain>} previous
 * @param {number} blockCount
 * @param {Map<number, object>} changed
 */
export function recompileTerrain(previous, blockCount, changed) {
  if (!previous || previous.blockCount !== blockCount) return null;
  const position = new Map(previous.bodies.map((body, index) => [body.blockIndex, index]));
  const bodies = previous.bodies.slice();
  const regions = [];
  const rebuilt = new Set();
  for (const [blockIndex, block] of changed) {
    const at = position.get(blockIndex);
    const body = buildBody(block, blockIndex);
    if ((at === undefined) !== !body) return null;
    if (!body) continue;
    regions.push(bodies[at].bounds, body.bounds);
    body.order = bodies[at].order;
    bodies[at] = body;
    rebuilt.add(body);
  }
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const body of bodies) {
    bounds.left = Math.min(bounds.left, body.bounds.left);
    bounds.right = Math.max(bounds.right, body.bounds.right);
    bounds.top = Math.min(bounds.top, body.bounds.top);
    bounds.bottom = Math.max(bounds.bottom, body.bounds.bottom);
  }
  const compiled = { version: TERRAIN_COMPILER_VERSION, bodies, bounds, blockCount, columns: indexColumns(bodies) };
  // Every body that overlaps a changed block, where it was or where it is,
  // may have gained or lost surface; a copy of it is classified again, so
  // the previous result stays as it was.
  const touched = new Set(rebuilt);
  for (const region of regions)
    for (const body of bodiesNear(compiled, region.left, region.right, region.top, region.bottom)) touched.add(body);
  for (const body of touched) {
    if (rebuilt.has(body)) continue;
    const copy = { ...body };
    bodies[copy.order] = copy;
    rebuilt.add(copy);
  }
  compiled.columns = indexColumns(bodies);
  classifyEdges(compiled, [...rebuilt].sort((a, b) => a.order - b.order));
  // Only the newest result keeps its predecessor, so a run of edits never
  // holds on to every version before it.
  if (previous.update) previous.update = null;
  compiled.update = { from: previous, ranges: regions.map(region => [region.left, region.right]) };
  return compiled;
}

/**
 * The compiled terrain without the bodies of the blocks in `blockIds`, as a
 * pane of glass breaking takes its block out of a ride's terrain: the same
 * result as compiling again with them in `brokenBlocks`, but only the bodies
 * that overlapped one are classified again. Compiling a trail built of many
 * blocks takes long enough to stall a frame, and this happens mid-ride.
 *
 * `previous` is left as it was, since it is usually the trail's own terrain,
 * shared by every ride on it. The result carries `update` as
 * recompileTerrain's does, so the renderer redraws only around the gap.
 *
 * @param {ReturnType<typeof compileTerrain>} previous
 * @param {{ has(id: string): boolean }} blockIds
 */
export function removeTerrainBodies(previous, blockIds) {
  const removed = previous.bodies.filter(body => blockIds.has(body.blockId));
  if (!removed.length) return previous;
  // Bodies keep their place in the order; those after a removed one move up,
  // as a fresh compile numbers them, on a copy.
  const bodies = [];
  for (const body of previous.bodies) {
    if (blockIds.has(body.blockId)) continue;
    bodies.push(body.order === bodies.length ? body : { ...body, order: bodies.length });
  }
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const body of bodies) {
    bounds.left = Math.min(bounds.left, body.bounds.left);
    bounds.right = Math.max(bounds.right, body.bounds.right);
    bounds.top = Math.min(bounds.top, body.bounds.top);
    bounds.bottom = Math.max(bounds.bottom, body.bounds.bottom);
  }
  const compiled = { version: TERRAIN_COMPILER_VERSION, bodies, bounds, blockCount: previous.blockCount, columns: indexColumns(bodies) };
  // Only a body that overlapped a removed one can have gained surface: a copy
  // of it is classified again.
  const touched = new Set();
  for (const { bounds: region } of removed)
    for (const body of bodiesNear(compiled, region.left, region.right, region.top, region.bottom)) touched.add(body);
  const rebuilt = [...touched].map(body => (bodies[body.order] = { ...body }));
  compiled.columns = indexColumns(bodies);
  classifyEdges(compiled, rebuilt.sort((a, b) => a.order - b.order));
  compiled.update = { from: previous, ranges: removed.map(({ bounds: region }) => [region.left, region.right]) };
  return compiled;
}

function finiteRing(points) {
  return points.filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function buildBody(block, blockIndex) {
  if (!block?.outer?.nodes?.length) return null;
  const outer = finiteRing(flattenBoundary(block.outer).points);
  const outerArea = ringArea(outer);
  if (outer.length < 3 || Math.abs(outerArea) < MIN_AREA) return null;
  const rings = [outer];
  // Which side of each ring is solid, as a sign on the right-hand normal
  // (dy, -dx): +1 means the solid is on the left and the right normal points
  // out into empty space. Worked out from each ring's own winding rather than
  // trusted from normalization, so a ring stored the wrong way round still
  // collides the right way.
  const outward = [outerArea > 0 ? 1 : -1];
  for (const hole of block.inner || []) {
    if (!hole?.nodes?.length) continue;
    const points = finiteRing(flattenBoundary(hole).points);
    const area = ringArea(points);
    if (points.length < 3 || Math.abs(area) < MIN_AREA) continue;
    rings.push(points);
    outward.push(area < 0 ? 1 : -1);
  }

  const pairs = [];
  rings.forEach((ring, ringIndex) => {
    for (let step = 0; step < ring.length; step++) {
      const a = ring[step], b = ring[(step + 1) % ring.length];
      if (hypot(b[0] - a[0], b[1] - a[1]) <= COINCIDENT_EPSILON) continue;
      pairs.push([a[0], a[1], b[0], b[1], outward[ringIndex]]);
    }
  });
  if (pairs.length < 3) return null;

  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [x, y] of outer) {
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const edges = new Float64Array(pairs.length * 4);
  const sides = new Int8Array(pairs.length);
  pairs.forEach((pair, index) => {
    edges[index * 4] = pair[0]; edges[index * 4 + 1] = pair[1];
    edges[index * 4 + 2] = pair[2]; edges[index * 4 + 3] = pair[3];
    sides[index] = pair[4];
  });
  const body = {
    kind: 'block',
    blockId: String(block.id ?? `block-${blockIndex}`),
    blockIndex,
    material: block.material || 'grass',
    rings,
    bounds: { left, right, top, bottom },
    edges, sides,
    edgeCount: pairs.length,
    buckets: [],
    live: new Float64Array(0),
    liveCount: 0,
    liveBuckets: [],
  };
  body.buckets = bucketEdges(body, edges, pairs.length, 4);
  return body;
}

/** Index edges stored `stride` numbers apart by the x buckets they overlap. */
function bucketEdges(body, edges, count, stride) {
  const buckets = [];
  const origin = body.bounds.left;
  for (let index = 0; index < count; index++) {
    const offset = index * stride;
    const low = Math.min(edges[offset], edges[offset + 2]);
    const high = Math.max(edges[offset], edges[offset + 2]);
    const first = Math.max(0, Math.floor((low - origin) / EDGE_BUCKET_WIDTH));
    const last = Math.max(0, Math.floor((high - origin) / EDGE_BUCKET_WIDTH));
    for (let bucket = first; bucket <= last; bucket++) (buckets[bucket] ||= []).push(index);
  }
  return buckets;
}

function bucketRange(body, left, right) {
  const last = body.buckets.length - 1;
  return [
    Math.max(0, Math.floor((left - body.bounds.left) / EDGE_BUCKET_WIDTH)),
    Math.min(last, Math.floor((right - body.bounds.left) / EDGE_BUCKET_WIDTH)),
  ];
}

// A coarse column index over every body, so a query skips blocks it cannot
// reach. Bodies are listed in compile order, which keeps every query's
// iteration order, and so its tie-breaking, deterministic.
function indexColumns(bodies) {
  const columns = new Map();
  bodies.forEach(body => {
    const first = Math.floor(body.bounds.left / COLUMN_WIDTH);
    const last = Math.floor(body.bounds.right / COLUMN_WIDTH);
    for (let column = first; column <= last; column++) {
      const list = columns.get(column);
      if (list) list.push(body); else columns.set(column, [body]);
    }
  });
  return columns;
}

function bodiesNear(compiled, left, right, top = -Infinity, bottom = Infinity) {
  const first = Math.floor(left / COLUMN_WIDTH);
  const last = Math.floor(right / COLUMN_WIDTH);
  if (first === last) {
    const list = compiled.columns.get(first) || [];
    return list.filter(body => overlaps(body.bounds, left, right, top, bottom));
  }
  const seen = new Set();
  const out = [];
  for (let column = first; column <= last; column++) {
    for (const body of compiled.columns.get(column) || []) {
      if (seen.has(body)) continue;
      seen.add(body);
      if (overlaps(body.bounds, left, right, top, bottom)) out.push(body);
    }
  }
  // Columns visit bodies out of order; restore compile order so results are
  // the same however wide the query is.
  return out.sort((a, b) => a.order - b.order);
}

const overlaps = (bounds, left, right, top, bottom) =>
  !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom);

/** Even-odd containment in one body, reading only the edges above this x. */
function insideBody(body, x, y) {
  const { bounds } = body;
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
  const indices = body.buckets[Math.floor((x - bounds.left) / EDGE_BUCKET_WIDTH)];
  if (!indices) return false;
  const edges = body.edges;
  let inside = false;
  for (const index of indices) {
    const offset = index * 4;
    const ax = edges[offset], bx = edges[offset + 2];
    if ((ax > x) === (bx > x)) continue;
    const ay = edges[offset + 1], by = edges[offset + 3];
    if (ay + (by - ay) * (x - ax) / (bx - ax) < y) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Union boundary
// ---------------------------------------------------------------------------

/**
 * Split every edge where another body's boundary crosses it and keep only the
 * pieces on the union's boundary.
 *
 * A piece is buried when another body fills the space just outside it: that
 * is the internal seam overlapping blocks leave, and a nested island
 * overlapping a cave wall leaves. When two bodies share a boundary facing the
 * same way, only the earlier body keeps it, so a surface is never collided
 * twice.
 */
function classifyEdges(compiled, bodies = compiled.bodies) {
  for (const body of bodies) {
    const others = bodiesNear(compiled, body.bounds.left, body.bounds.right, body.bounds.top, body.bounds.bottom)
      .filter(other => other !== body);
    const live = [];
    const edges = body.edges;
    for (let index = 0; index < body.edgeCount; index++) {
      const offset = index * 4;
      const ax = edges[offset], ay = edges[offset + 1], bx = edges[offset + 2], by = edges[offset + 3];
      const side = body.sides[index];
      const length = hypot(bx - ax, by - ay);
      const nx = (by - ay) / length * side, ny = -(bx - ax) / length * side;
      if (!others.length) { live.push(ax, ay, bx, by, nx, ny); continue; }
      const cuts = splitPoints(ax, ay, bx, by, others);
      for (let piece = 0; piece + 1 < cuts.length; piece++) {
        const s0 = cuts[piece], s1 = cuts[piece + 1];
        if (s1 - s0 < SPLIT_EPSILON) continue;
        const middle = (s0 + s1) / 2;
        const mx = ax + (bx - ax) * middle, my = ay + (by - ay) * middle;
        if (buried(body, others, mx, my, nx, ny)) continue;
        live.push(ax + (bx - ax) * s0, ay + (by - ay) * s0, ax + (bx - ax) * s1, ay + (by - ay) * s1, nx, ny);
      }
    }
    body.live = Float64Array.from(live);
    body.liveCount = live.length / 6;
    body.liveBuckets = bucketEdges(body, body.live, body.liveCount, 6);
  }
}

function buried(body, others, mx, my, nx, ny) {
  const outX = mx + nx * SEAM_PROBE, outY = my + ny * SEAM_PROBE;
  const inX = mx - nx * SEAM_PROBE, inY = my - ny * SEAM_PROBE;
  for (const other of others) {
    if (insideBody(other, outX, outY)) return true;
    // Another body whose boundary runs along this piece, facing the same way:
    // it holds the space just inside but not just outside. The earlier body
    // keeps the surface.
    if (other.order < body.order && insideBody(other, inX, inY)) return true;
  }
  return false;
}

/** Sorted parameters along an edge where any other body's boundary meets it. */
function splitPoints(ax, ay, bx, by, others) {
  const cuts = [0, 1];
  const left = Math.min(ax, bx), right = Math.max(ax, bx);
  const top = Math.min(ay, by), bottom = Math.max(ay, by);
  const rx = bx - ax, ry = by - ay;
  const lengthSquared = rx * rx + ry * ry;
  for (const other of others) {
    if (!overlaps(other.bounds, left, right, top, bottom)) continue;
    const [first, last] = bucketRange(other, left, right);
    const seen = new Set();
    for (let bucket = first; bucket <= last; bucket++) {
      for (const index of other.buckets[bucket] || []) {
        if (seen.has(index)) continue;
        seen.add(index);
        const offset = index * 4;
        const cx = other.edges[offset], cy = other.edges[offset + 1];
        const dx = other.edges[offset + 2], dy = other.edges[offset + 3];
        if (Math.max(cx, dx) < left || Math.min(cx, dx) > right || Math.max(cy, dy) < top || Math.min(cy, dy) > bottom) continue;
        const sx = dx - cx, sy = dy - cy;
        const denominator = rx * sy - ry * sx;
        if (Math.abs(denominator) > 1e-12 * Math.sqrt(lengthSquared * (sx * sx + sy * sy))) {
          const s = ((cx - ax) * sy - (cy - ay) * sx) / denominator;
          const t = ((cx - ax) * ry - (cy - ay) * rx) / denominator;
          if (s > SPLIT_EPSILON && s < 1 - SPLIT_EPSILON && t >= -SPLIT_EPSILON && t <= 1 + SPLIT_EPSILON) cuts.push(s);
          continue;
        }
        // Parallel: split where a collinear edge starts or ends along this one.
        if (Math.abs((cx - ax) * ry - (cy - ay) * rx) > 1e-9 * Math.sqrt(lengthSquared)) continue;
        for (const [px, py] of [[cx, cy], [dx, dy]]) {
          const s = ((px - ax) * rx + (py - ay) * ry) / lengthSquared;
          if (s > SPLIT_EPSILON && s < 1 - SPLIT_EPSILON) cuts.push(s);
        }
      }
    }
  }
  return cuts.sort((p, q) => p - q);
}

// ---------------------------------------------------------------------------
// Containment and column spans
// ---------------------------------------------------------------------------

/**
 * Is this point inside the union of every block's solids? With `counts`, only
 * bodies it accepts are counted, such as those that aren't see-through.
 * @param {(body: TerrainBody) => boolean} [counts]
 */
export function terrainSolidAt(compiled, x, y, counts) {
  for (const body of compiled.columns.get(Math.floor(x / COLUMN_WIDTH)) || []) {
    if ((!counts || counts(body)) && insideBody(body, x, y)) return true;
  }
  return false;
}

function edgeSlope(body, index) {
  const offset = index * 4;
  const dx = body.edges[offset + 2] - body.edges[offset];
  return Math.abs(dx) > 1e-9 ? (body.edges[offset + 3] - body.edges[offset + 1]) / dx : 0;
}

/**
 * The solid spans of the union along the vertical line at `x`, top to bottom.
 * Each span's top is a floor and its bottom a ceiling, and each end remembers
 * the body and edge it came from, for material and slope.
 *
 * @returns {{ top: number, bottom: number, topBody: TerrainBody, topEdge: number,
 *   bottomBody: TerrainBody, bottomEdge: number }[]}
 */
export function terrainColumnSpans(compiled, x) {
  return mergeSpans(terrainBodySpans(compiled, x));
}

/**
 * Every body's own solid spans at `x`, unmerged and in no particular order.
 * Where bodies overlap, the one with the highest `blockIndex` shows.
 */
export function terrainBodySpans(compiled, x) {
  const spans = [];
  for (const body of compiled.columns.get(Math.floor(x / COLUMN_WIDTH)) || []) {
    const { bounds } = body;
    if (x < bounds.left || x > bounds.right) continue;
    const indices = body.buckets[Math.floor((x - bounds.left) / EDGE_BUCKET_WIDTH)];
    if (!indices) continue;
    const crossings = [];
    const edges = body.edges;
    for (const index of indices) {
      const offset = index * 4;
      const ax = edges[offset], bx = edges[offset + 2];
      if ((ax > x) === (bx > x)) continue;
      const ay = edges[offset + 1], by = edges[offset + 3];
      crossings.push({ y: ay + (by - ay) * (x - ax) / (bx - ax), index });
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a.y - b.y || a.index - b.index);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const top = crossings[index], bottom = crossings[index + 1];
      if (bottom.y - top.y <= 0) continue;
      spans.push({ top: top.y, bottom: bottom.y, topBody: body, topEdge: top.index, bottomBody: body, bottomEdge: bottom.index });
    }
  }
  return spans;
}

/** The union of `terrainBodySpans`, top to bottom; the input is left untouched. */
export function mergeSpans(bodySpans) {
  if (bodySpans.length < 2) return bodySpans;
  const spans = bodySpans.map(span => ({ ...span }));
  // Merge into the union. Where two bodies start at the same height the later
  // block wins, matching the material rule used for drawing.
  spans.sort((a, b) => a.top - b.top || b.topBody.blockIndex - a.topBody.blockIndex);
  const merged = [spans[0]];
  for (let index = 1; index < spans.length; index++) {
    const span = spans[index];
    const current = merged[merged.length - 1];
    if (span.top <= current.bottom + 1e-9) {
      if (span.bottom > current.bottom) {
        current.bottom = span.bottom;
        current.bottomBody = span.bottomBody;
        current.bottomEdge = span.bottomEdge;
      }
    } else {
      merged.push(span);
    }
  }
  return merged;
}

/**
 * The block whose material shows at a point: the latest block in the list
 * that is solid there. Shared by rendering and contacts so the two agree.
 */
export function terrainBodyAt(compiled, x, y) {
  let best = null;
  for (const body of compiled.columns.get(Math.floor(x / COLUMN_WIDTH)) || []) {
    if (best && body.blockIndex < best.blockIndex) continue;
    if (insideBody(body, x, y)) best = body;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

// Edges spanning several buckets are listed in each; a per-body stamp skips
// repeats without allocating a set on every query.
let visitStamp = 0;

function nearestLiveInBody(body, x, y, left, right, best) {
  const live = body.live;
  let first = 0, end = 0, all = left === -Infinity;
  if (!all) {
    const last = body.liveBuckets.length - 1;
    first = Math.max(0, Math.floor((left - body.bounds.left) / EDGE_BUCKET_WIDTH));
    end = Math.min(last, Math.floor((right - body.bounds.left) / EDGE_BUCKET_WIDTH));
  }
  let stamps = null;
  if (!all && first !== end) {
    if (!body.liveStamps || body.liveStamps.length < body.liveCount) body.liveStamps = new Uint32Array(body.liveCount);
    stamps = body.liveStamps;
    if (++visitStamp > 0xfffffff0) { visitStamp = 1; stamps.fill(0); }
  }
  let bestSquared = best ? best.squared : Infinity;
  const count = all ? 1 : end - first + 1;
  for (let step = 0; step < count; step++) {
    const indices = all ? null : body.liveBuckets[first + step];
    if (!all && !indices) continue;
    const length = all ? body.liveCount : indices.length;
    for (let slot = 0; slot < length; slot++) {
      const index = all ? slot : indices[slot];
      if (stamps) {
        if (stamps[index] === visitStamp) continue;
        stamps[index] = visitStamp;
      }
      const offset = index * 6;
      const ax = live[offset], ay = live[offset + 1];
      const dx = live[offset + 2] - ax, dy = live[offset + 3] - ay;
      const lengthSquared = dx * dx + dy * dy || 1;
      const amount = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
      const nearestX = ax + dx * amount, nearestY = ay + dy * amount;
      const offX = x - nearestX, offY = y - nearestY;
      const squared = offX * offX + offY * offY;
      // hypot is a correctly rounded sqrt, so a piece no nearer in squared
      // distance can never win; skip the root for it.
      if (squared >= bestSquared) continue;
      const distance = hypot(offX, offY);
      if (best && distance >= best.distance) continue;
      bestSquared = squared;
      best = { distance, squared, nearestX, nearestY, dx, dy, nx: live[offset + 4], ny: live[offset + 5], body, index };
    }
  }
  return best;
}

/**
 * The nearest live piece anywhere, for a point buried in rock. The search
 * widens until the window is at least as wide as the best distance found, so
 * the answer is the true nearest piece however deep the point is.
 */
function nearestLiveAnywhere(compiled, x, y, radius) {
  for (let reach = Math.max(radius, 16); reach < 1 << 20; reach *= 4) {
    let best = null;
    for (const body of bodiesNear(compiled, x - reach, x + reach, y - reach, y + reach)) {
      best = nearestLiveInBody(body, x, y, x - reach, x + reach, best);
    }
    if (best && best.distance <= reach) return best;
    if (reach > (compiled.bounds.right - compiled.bounds.left) + (compiled.bounds.bottom - compiled.bounds.top)) break;
  }
  let best = null;
  for (const body of compiled.bodies) best = nearestLiveInBody(body, x, y, -Infinity, Infinity, best);
  return best;
}

function makeContact(nearest, x, y, radius, inside) {
  let nx, ny;
  if (nearest.distance > .0001) {
    nx = (x - nearest.nearestX) / nearest.distance;
    ny = (y - nearest.nearestY) / nearest.distance;
    if (inside) { nx *= -1; ny *= -1; }
  } else {
    // Exactly on the boundary: the piece's own outward normal is the answer.
    nx = nearest.nx; ny = nearest.ny;
  }
  const length = hypot(nearest.dx, nearest.dy) || 1;
  return {
    kind: 'block',
    material: nearest.body.material,
    blockId: nearest.body.blockId,
    y: nearest.nearestY,
    slope: Math.abs(nearest.dx) > .0001 ? nearest.dy / nearest.dx : 0,
    solid: true,
    nx, ny,
    tangentX: nearest.dx / length,
    tangentY: nearest.dy / length,
    pointX: nearest.nearestX,
    pointY: nearest.nearestY,
    penetration: inside ? radius + nearest.distance : radius - nearest.distance,
  };
}

/**
 * Contacts for a circle against the combined terrain.
 *
 * A centre inside the union is pushed out through the nearest live piece of
 * boundary, whichever block owns it, so a wheel inside two overlapping blocks
 * leaves through the real surface rather than through a buried seam. A centre
 * in open space gets one contact per block it touches, so a wheel in a corner
 * feels both faces.
 */
export function terrainContacts(compiled, x, y, radius) {
  const near = bodiesNear(compiled, x - radius, x + radius, y - radius, y + radius);
  if (!near.length) return [];
  if (near.some(body => insideBody(body, x, y))) {
    const nearest = nearestLiveAnywhere(compiled, x, y, radius);
    return nearest ? [makeContact(nearest, x, y, radius, true)] : [];
  }
  const contacts = [];
  for (const body of near) {
    const nearest = nearestLiveInBody(body, x, y, x - radius, x + radius, null);
    if (nearest && nearest.distance < radius) contacts.push(makeContact(nearest, x, y, radius, false));
  }
  return contacts.length > 1 ? contacts.sort((a, b) => b.penetration - a.penetration) : contacts;
}

/** Swept circle against the combined terrain, for fast movement. */
export function terrainSweep(compiled, fromX, fromY, toX, toY, radius) {
  let earliest = null, earliestBody = null, earliestIndex = -1;
  const motionX = toX - fromX, motionY = toY - fromY;
  const left = Math.min(fromX, toX) - radius, right = Math.max(fromX, toX) + radius;
  const top = Math.min(fromY, toY) - radius, bottom = Math.max(fromY, toY) + radius;
  for (const body of bodiesNear(compiled, left, right, top, bottom)) {
    const live = body.live;
    const last = body.liveBuckets.length - 1;
    const first = Math.max(0, Math.floor((left - body.bounds.left) / EDGE_BUCKET_WIDTH));
    const end = Math.min(last, Math.floor((right - body.bounds.left) / EDGE_BUCKET_WIDTH));
    const seen = first === end ? null : new Set();
    for (let bucket = first; bucket <= end; bucket++) {
      for (const index of body.liveBuckets[bucket] || []) {
        if (seen) { if (seen.has(index)) continue; seen.add(index); }
        const offset = index * 6;
        const hit = sweepCircleSegment(fromX, fromY, toX, toY, radius, live[offset], live[offset + 1], live[offset + 2], live[offset + 3]);
        if (!hit) continue;
        if (earliest && (hit.time > earliest.time
          || (hit.time === earliest.time && (earliestBody !== body || index >= earliestIndex)))) continue;
        // Ignore a piece when the motion is away from its candidate normal.
        if (motionX * hit.nx + motionY * hit.ny >= 0) continue;
        earliest = hit;
        earliestBody = body;
        earliestIndex = index;
      }
    }
  }
  if (!earliest) return null;
  const offset = earliestIndex * 6, live = earliestBody.live;
  const dx = live[offset + 2] - live[offset], dy = live[offset + 3] - live[offset + 1];
  const length = hypot(dx, dy) || 1;
  return {
    ...earliest,
    kind: 'block',
    material: earliestBody.material,
    blockId: earliestBody.blockId,
    slope: Math.abs(dx) > .0001 ? dy / dx : 0,
    tangentX: dx / length,
    tangentY: dy / length,
    penetration: 0,
    swept: true,
  };
}

/**
 * Where a straight line from (fromX, fromY) to (toX, toY) first enters the
 * combined terrain, as { x, y, blockId, material }, or null. An exact
 * zero-width cast: cheaper than a sweep, and it never grazes a vertex or
 * wall it only passes beside.
 */
export function terrainRaycast(compiled, fromX, fromY, toX, toY) {
  const motionX = toX - fromX, motionY = toY - fromY;
  const left = Math.min(fromX, toX), right = Math.max(fromX, toX);
  const top = Math.min(fromY, toY), bottom = Math.max(fromY, toY);
  let earliest = Infinity, hitBody = null;
  for (const body of bodiesNear(compiled, left, right, top, bottom)) {
    const live = body.live;
    const [first, end] = [
      Math.max(0, Math.floor((left - body.bounds.left) / EDGE_BUCKET_WIDTH)),
      Math.min(body.liveBuckets.length - 1, Math.floor((right - body.bounds.left) / EDGE_BUCKET_WIDTH)),
    ];
    for (let bucket = first; bucket <= end; bucket++) {
      // An edge listed in several buckets gives the same time each time.
      for (const index of body.liveBuckets[bucket] || []) {
        const offset = index * 6;
        // Only pieces faced from outside: the line is entering the solid.
        if (motionX * live[offset + 4] + motionY * live[offset + 5] >= 0) continue;
        const ax = live[offset], ay = live[offset + 1];
        const sx = live[offset + 2] - ax, sy = live[offset + 3] - ay;
        const denominator = motionX * sy - motionY * sx;
        if (Math.abs(denominator) < 1e-12) continue;
        const rx = ax - fromX, ry = ay - fromY;
        const time = (rx * sy - ry * sx) / denominator;
        const along = (rx * motionY - ry * motionX) / denominator;
        if (time < 0 || time > 1 || along < 0 || along > 1 || time >= earliest) continue;
        earliest = time;
        hitBody = body;
      }
    }
  }
  if (!hitBody) return null;
  return {
    x: fromX + motionX * earliest,
    y: fromY + motionY * earliest,
    blockId: hitBody.blockId,
    material: hitBody.material,
  };
}

// ---------------------------------------------------------------------------
// Surface queries
// ---------------------------------------------------------------------------

/**
 * Every surface crossing the vertical line at `x`, top to bottom: each floor
 * (`entering`, solid below) and each ceiling. Read from the union, so a buried
 * seam is never reported, a query inside a cave finds the cave floor, and one
 * above a nested island finds the island's top.
 */
export function terrainSurfaces(compiled, x) {
  const surfaces = [];
  for (const span of terrainColumnSpans(compiled, x)) {
    surfaces.push({
      y: span.top, slope: edgeSlope(span.topBody, span.topEdge),
      material: span.topBody.material, blockId: span.topBody.blockId, solid: true, entering: true,
    });
    surfaces.push({
      y: span.bottom, slope: edgeSlope(span.bottomBody, span.bottomEdge),
      material: span.bottomBody.material, blockId: span.bottomBody.blockId, solid: true, entering: false,
    });
  }
  return surfaces;
}

/**
 * The floor a downward query from `referenceY` lands on: the highest floor at
 * or below the reference, or the topmost floor when there is no reference.
 * This is what props, apples, shadows, and the finish attach to.
 */
export function terrainSurfaceBelow(compiled, x, referenceY = null) {
  const threshold = referenceY === null || !Number.isFinite(referenceY) ? -Infinity : referenceY - .5;
  for (const span of terrainColumnSpans(compiled, x)) {
    if (span.top < threshold) continue;
    return {
      y: span.top, slope: edgeSlope(span.topBody, span.topEdge),
      material: span.topBody.material, blockId: span.topBody.blockId, solid: true, entering: true,
    };
  }
  return null;
}

/** The nearest floor or ceiling to a point, within `tolerance`. Used for prop seating. */
export function terrainSurfaceNear(compiled, x, y, tolerance = 12) {
  if (!Number.isFinite(y)) return terrainSurfaceBelow(compiled, x, null);
  let nearest = null;
  for (const surface of terrainSurfaces(compiled, x)) {
    const distance = Math.abs(surface.y - y);
    if (distance > tolerance) continue;
    if (nearest && distance >= Math.abs(nearest.y - y)) continue;
    nearest = surface;
  }
  return nearest;
}

/** Where a shadow should land: the floor below a reference, sampled across a width. */
export function terrainShadowSamples(compiled, x, referenceY, width, step = 2, center = x) {
  const origin = Number.isFinite(center) ? center : x;
  const segments = [];
  let segment = [];
  if (!(width > 0) || !(step > 0)) return segments;
  for (let sampleX = origin - width; sampleX <= origin + width; sampleX += step) {
    const surface = terrainSurfaceBelow(compiled, sampleX, referenceY);
    if (!surface) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    segment.push({ x: sampleX, y: surface.y, slope: surface.slope });
  }
  if (segment.length) segments.push(segment);
  return segments;
}

/** Every boundary crossing of the vertical line at `x`, for debugging and tools. */
export function terrainIntersectionsAt(compiled, x) {
  return terrainSurfaces(compiled, x).map(surface => ({
    y: surface.y, material: surface.material, blockId: surface.blockId,
  }));
}
