// Terrain geometry: the authoritative editable model, the curve tools the
// editor drives, and the deterministic compilation the runtime consumes.
//
// The editable model is deliberately small. A trail holds a flat list of
// `terrainBlocks`; each block is one connected solid piece: a material, one
// closed outer boundary and any number of closed inner boundaries (empty
// spaces). A cut that separates a block into pieces makes each piece its own
// block. The geometry helpers call any `{ outer, inner }` shape a region, and a
// block is a region with an id and a material. Nesting is purely geometric — a block inside another block's
// cave is just another entry in the list, with no stored parent reference.
//
// Direction convention: every boundary is stored with the solid on its left.
// For a region that means the outer ring has positive signed area and each inner
// ring negative. Normalization enforces it, so downstream code never has to
// guess which way round a ring runs.

// A fixed world-space tolerance for flattening curves. Chosen so a flattened
// edge stays well under one art pixel from the curve it came from, which keeps
// rendering and collision agreeing within a pixel.
export const CURVE_TOLERANCE = 0.2;

// Recursion limit for adaptive subdivision, so a pathological handle placement
// cannot stall a frame. 8 trails is 256 segments for one edge.
export const MAX_SUBDIVISION = 8;

// Geometry is normalized to this many decimals before it is compared or saved.
// Coordinates live in the low thousands, so 1e-4 is far below the art pixel
// grid but well above floating point noise.
const PRECISION = 4;
const SNAP = 10 ** PRECISION;

// Vertices closer together than this are treated as coincident.
export const COINCIDENT_EPSILON = 1e-6;

// How far apart two boundary endpoints may be and still be treated as the same
// point when a boolean leaves a T-junction behind.
const T_JUNCTION_SNAP = 1e-3;

// How far apart two segment endpoints may be and still be welded into one
// shared vertex before the boolean runs.
const WELD_TOLERANCE = 1e-6;

// The smallest area a region or ring may have before it counts as degenerate.
export const MIN_AREA = 1e-4;

// How far off the boundary to probe when deciding which side of an edge is
// solid. Small enough not to jump a thin feature, large enough to stay clear of
// floating point noise.
const SIDE_PROBE = 1e-3;

let idCounter = 0;

// Stable, collision-resistant enough for a per-document identifier. Ids only
// need to be unique inside one trail, and they are regenerated deterministically
// by normalizeBlock when a file omits them.
export function nextId(prefix) {
  idCounter += 1;
  return `${prefix}${idCounter.toString(36)}`;
}

export function resetIds() {
  idCounter = 0;
}

const round = value => Math.round(value * SNAP) / SNAP;
const key = value => Math.round(value * SNAP);

// ---------------------------------------------------------------------------
// Nodes and boundaries
// ---------------------------------------------------------------------------

/**
 * @typedef {{ x: number, y: number, mode?: 'corner' | 'smooth' | 'independent',
 *   in?: [number, number] | null, out?: [number, number] | null,
 *   edge?: 'straight' | 'curve', id?: string }} TerrainNode
 *
 * `in` and `out` are absolute handle positions (not offsets from the node). An
 * edge is a cubic Bézier when it has handles and `edge` is not 'straight'.
 *
 * @typedef {{ id: string, nodes: TerrainNode[] }} TerrainBoundary
 * @typedef {{ outer: TerrainBoundary, inner: TerrainBoundary[] }} TerrainRegion
 * @typedef {TerrainRegion & { id: string, material: string, layer?: 'back' }} TerrainBlock
 */

export function createNode(x, y, options = {}) {
  return {
    id: options.id || nextId('n'),
    x: Number(x) || 0,
    y: Number(y) || 0,
    mode: options.mode || 'corner',
    in: options.in ? [Number(options.in[0]), Number(options.in[1])] : null,
    out: options.out ? [Number(options.out[0]), Number(options.out[1])] : null,
    edge: options.edge === 'straight' ? 'straight' : options.edge || 'curve',
  };
}

export function createBoundary(nodes) {
  return { id: nextId('b'), nodes };
}

export function createRegion(outer, inner = []) {
  return { outer, inner };
}

export function createBlock(region, material = 'grass') {
  return { id: nextId('b'), material, outer: region.outer, inner: region.inner };
}

export function cloneBlock(block) {
  return JSON.parse(JSON.stringify(block));
}

/** A rectangular block, the starting point for the Block tool. */
export function rectangleBlock(left, top, right, bottom, material = 'grass') {
  const nodes = [
    createNode(left, top, { edge: 'straight' }),
    createNode(right, top, { edge: 'straight' }),
    createNode(right, bottom, { edge: 'straight' }),
    createNode(left, bottom, { edge: 'straight' }),
  ];
  return createBlock(createRegion(createBoundary(nodes)), material);
}

export function cloneNode(node) {
  return {
    ...node,
    in: node.in ? [...node.in] : null,
    out: node.out ? [...node.out] : null,
  };
}

export function cloneBoundary(boundary) {
  return { id: boundary.id, nodes: boundary.nodes.map(cloneNode) };
}

export function cloneRegion(region) {
  return { outer: cloneBoundary(region.outer), inner: region.inner.map(cloneBoundary) };
}

export function cloneBlocks(blocks) {
  return blocks.map(block => ({
    id: block.id,
    material: block.material,
    ...(block.layer === 'back' ? { layer: 'back' } : {}),
    ...cloneRegion(block),
  }));
}

// ---------------------------------------------------------------------------
// Cubic Bézier maths
// ---------------------------------------------------------------------------

export function cubicPoint(p0, c1, c2, p1, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
  ];
}

/** de Casteljau split at `t`, returning the two halves' control polygons. */
export function splitCubic(p0, c1, c2, p1, t) {
  const lerp2 = (a, b, amount) => [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
  const a = lerp2(p0, c1, t), b = lerp2(c1, c2, t), c = lerp2(c2, p1, t);
  const d = lerp2(a, b, t), e = lerp2(b, c, t);
  const f = lerp2(d, e, t);
  return [[p0, a, d, f], [f, e, c, p1]];
}

/** The sub-arc of a cubic between two parameters, with its own control points. */
export function subCubic(p0, c1, c2, p1, t0, t1) {
  if (t0 <= 0 && t1 >= 1) return [p0, c1, c2, p1];
  const [first] = t0 > 0 ? splitCubic(p0, c1, c2, p1, t0) : [[p0, c1, c2, p1]];
  const shifted = t0 > 0 ? first : [p0, c1, c2, p1];
  if (t1 >= 1) return shifted;
  const local = (t1 - t0) / (1 - t0);
  return splitCubic(shifted[0], shifted[1], shifted[2], shifted[3], Math.max(0, Math.min(1, local)))[0];
}

/** Longest distance of the control points from the chord, the flatness bound. */
function controlDeviation(p0, c1, c2, p1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return Math.max(Math.hypot(c1[0] - p0[0], c1[1] - p0[1]), Math.hypot(c2[0] - p0[0], c2[1] - p0[1]));
  const distance = point => Math.abs(dy * (point[0] - p0[0]) - dx * (point[1] - p0[1])) / Math.sqrt(lengthSquared);
  return Math.max(distance(c1), distance(c2));
}

// ---------------------------------------------------------------------------
// Boundary evaluation
// ---------------------------------------------------------------------------

/** The control points of the edge leaving `node` and arriving at `next`. */
export function edgeCurve(node, next) {
  const p0 = [node.x, node.y];
  const p3 = [next.x, next.y];
  const curved = node.edge !== 'straight' && node.out && next.in;
  if (!curved) return [p0, p0, p3, p3];
  return [p0, node.out, next.in, p3];
}

export function isCurvedEdge(node, next) {
  return node.edge !== 'straight' && Boolean(node.out) && Boolean(next.in);
}

function flattenPiece(p0, c1, c2, p1, t0, t1, out, depth) {
  if (depth < MAX_SUBDIVISION && controlDeviation(p0, c1, c2, p1) > CURVE_TOLERANCE) {
    const [a, b] = splitCubic(p0, c1, c2, p1, 0.5);
    const middle = (t0 + t1) / 2;
    flattenPiece(a[0], a[1], a[2], a[3], t0, middle, out, depth + 1);
    flattenPiece(b[0], b[1], b[2], b[3], middle, t1, out, depth + 1);
    return;
  }
  out.push({ t: t1, point: cubicPoint(p0, c1, c2, p1, t1) });
}

/**
 * Flatten a boundary to a closed polyline, keeping the curve parameter each
 * vertex came from.
 *
 * `t` and `curved` have one entry per *segment*, while `points` has one entry
 * per vertex, so a curved edge contributes several segments and therefore
 * several more points than the boundary has nodes. Callers that need to map a
 * segment back to an authored edge walk all three together.
 *
 * @returns {{ points: number[][], t: number[], curved: boolean[] }}
 */
export function flattenBoundary(boundary) {
  const nodes = boundary.nodes;
  const count = nodes.length;
  const points = [], t = [], curved = [], owner = [], start = [];
  for (let index = 0; index < count; index++) {
    const node = nodes[index];
    const next = nodes[(index + 1) % count];
    if (!isCurvedEdge(node, next)) {
      points.push([node.x, node.y]);
      t.push(1);
      curved.push(false);
      owner.push(index);
      start.push(0);
      continue;
    }
    const steps = [{ t: 0, point: [node.x, node.y] }];
    flattenPiece(...edgeCurve(node, next), 0, 1, steps, 0);
    // Each sample except the first becomes a vertex; the last is the node itself.
    for (let step = 0; step < steps.length - 1; step++) {
      points.push(steps[step].point);
      t.push(steps[step + 1].t);
      curved.push(true);
      owner.push(index);
      start.push(steps[step].t);
    }
  }
  return { points, t, curved, owner, start };
}

/** Signed area of a flat ring. Positive means the interior lies to the left. */
export function ringArea(points) {
  let total = 0;
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeNode(raw, fallbackId) {
  const x = Number(raw?.x), y = Number(raw?.y);
  const node = {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : fallbackId,
    x: Number.isFinite(x) ? round(x) : 0,
    y: Number.isFinite(y) ? round(y) : 0,
    mode: raw?.mode === 'smooth' || raw?.mode === 'independent' ? raw.mode : 'corner',
    in: null,
    out: null,
    edge: raw?.edge === 'straight' ? 'straight' : 'curve',
  };
  const handle = value => (Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1])))
    ? [round(Number(value[0])), round(Number(value[1]))]
    : null;
  node.in = handle(raw?.in);
  node.out = handle(raw?.out);
  // `edge` describes the edge leaving this node, so it only governs `out`. An
  // incoming handle belongs to the previous node's edge and must survive, or a
  // curve could never arrive at a corner. Curvature itself is always derived
  // from the handles, so `edge` is a hint that normalization reconciles.
  // A straight edge out drops the outgoing handle. The point is only a corner
  // if no handle is left: one that still has its incoming handle keeps its
  // mode, or a second pass would change what the first decided (a smooth
  // point that lost its outgoing handle becomes independent below, and must
  // stay so). The mode is part of the trail's hash, so it has to settle.
  if (node.edge === 'straight') {
    node.out = null;
    if (!node.in) node.mode = 'corner';
  }
  if (!node.out) node.edge = 'straight';
  if (!node.in && !node.out) node.mode = 'corner';
  else if (node.mode === 'smooth' && !(node.in && node.out)) node.mode = 'independent';
  return node;
}

function normalizeBoundary(raw) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : nextId('b'),
    nodes: nodes.map((node, index) => normalizeNode(node, nextId('n'))),
  };
}

function orientBoundary(boundary, wantPositive) {
  const { points } = flattenBoundary(boundary);
  const area = ringArea(points);
  if (Math.abs(area) < MIN_AREA) return boundary;
  if (area > 0 === wantPositive) return boundary;
  // Reversing the node order also swaps which handle belongs to which edge, so
  // the handles travel with their node rather than being re-derived.
  const nodes = boundary.nodes.slice().reverse();
  return {
    id: boundary.id,
    nodes: nodes.map(node => ({ ...node, in: node.out ? [...node.out] : null, out: node.in ? [...node.in] : null })),
  };
}

export function normalizeRegion(raw) {
  const region = {
    outer: normalizeBoundary(raw?.outer),
    inner: (Array.isArray(raw?.inner) ? raw.inner : []).map(normalizeBoundary),
  };
  region.outer = orientBoundary(region.outer, true);
  region.inner = region.inner.map(boundary => orientBoundary(boundary, false));
  return region;
}

export function normalizeBlock(raw, defaultMaterial = 'grass') {
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : nextId('b'),
    material: typeof raw?.material === 'string' && raw.material ? raw.material : defaultMaterial,
    // A back wall is scenery behind the terrain: drawn and lit, never ridden.
    ...(raw?.layer === 'back' ? { layer: 'back' } : {}),
    ...normalizeRegion(raw),
  };
}

export function normalizeBlocks(raw, defaultMaterial = 'grass') {
  if (!Array.isArray(raw)) return null;
  return raw.map(block => normalizeBlock(block, defaultMaterial));
}

// ---------------------------------------------------------------------------
// Point tests
// ---------------------------------------------------------------------------

/** Even-odd containment across a set of rings. */
export function pointInRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[previous];
      if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
    }
  }
  return inside;
}

/** The flat rings of a region, outer first, in stored order. */
export function regionRings(region) {
  return [flattenBoundary(region.outer).points, ...region.inner.map(boundary => flattenBoundary(boundary).points)];
}

export function pointInRegion(region, x, y) {
  const rings = regionRings(region);
  if (!pointInRings([rings[0]], x, y)) return false;
  return !pointInRings(rings.slice(1), x, y);
}

export function regionBounds(region) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const ring of regionRings(region)) {
    for (const [x, y] of ring) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { left, right, top, bottom };
}

export function regionArea(region) {
  const outer = ringArea(flattenBoundary(region.outer).points);
  let holes = 0;
  for (const boundary of region.inner) holes += Math.abs(ringArea(flattenBoundary(boundary).points));
  return Math.max(0, outer - holes);
}

// ---------------------------------------------------------------------------
// Planar boolean
//
// The boolean runs on flattened polylines but every segment remembers which
// authored edge it came from and the parameter range it covers, so a surviving
// piece of a curve is rebuilt as an exact sub-arc rather than refitted. That is
// the approach the plan calls for: polygon booleans for topology, provenance for
// curves. No curve fitting happens anywhere, so the reconstruction error is
// bounded by CURVE_TOLERANCE by construction.
// ---------------------------------------------------------------------------

function segmentIntersection(a, b) {
  const [ax, ay, bx, by] = a.box, [cx, cy, dx, dy] = b.box;
  const r0 = bx - ax, r1 = by - ay, r2 = dx - cx, r3 = dy - cy;
  const denominator = r0 * r3 - r1 * r2;
  if (Math.abs(denominator) < 1e-12) {
    // Collinear: the edges may still overlap, and a cut has to be able to start
    // and end exactly on a flat edge. Record a split at each endpoint that
    // falls inside the other segment. Two blocks that share part of an edge
    // need both ends of the overlap, on both segments, so every hit is returned.
    if (Math.abs((cx - ax) * r1 - (cy - ay) * r0) > 1e-9) return [];
    const pointOn = (px, py) => {
      const lengthSquared = r0 * r0 + r1 * r1;
      const amount = lengthSquared > 1e-18 ? ((px - ax) * r0 + (py - ay) * r1) / lengthSquared : 0;
      if (amount < -1e-9 || amount > 1 + 1e-9) return null;
      const t = ((px - cx) * r2 + (py - cy) * r3) / (r2 * r2 + r3 * r3 || 1);
      if (t < -1e-9 || t > 1 + 1e-9) return null;
      return { s: Math.max(0, Math.min(1, amount)), t: Math.max(0, Math.min(1, t)), x: px, y: py };
    };
    return [pointOn(cx, cy), pointOn(dx, dy), pointOn(ax, ay), pointOn(bx, by)].filter(Boolean);
  }
  const s = ((cx - ax) * r3 - (cy - ay) * r2) / denominator;
  const t = ((cx - ax) * r1 - (cy - ay) * r0) / denominator;
  if (s < 0 || s > 1 || t < 0 || t > 1) return [];
  return [{ s, t, x: ax + r0 * s, y: ay + r1 * s }];
}

function makeSegment(ax, ay, bx, by, source) {
  return { box: [ax, ay, bx, by], source, splits: [] };
}

/**
 * Every flat edge of a region, tagged with the authored edge it came from and
 * the slice of that edge's curve it covers. The flatten pass emits `t` per
 * segment, so a curved authored edge yields several tagged segments that all
 * point back at the same node pair.
 */
function regionSegments(region) {
  const segments = [];
  [region.outer, ...region.inner].forEach(boundary => {
    const { points, t, curved, owner, start } = flattenBoundary(boundary);
    // One stable key per authored edge, shared by all of its flat segments, so
    // the pieces a boolean returns can be rejoined back into a single curve.
    const edgeKeys = boundary.nodes.map((_, node) => ({ boundary, node }));
    for (let index = 0; index < points.length; index++) {
      const a = points[index], b = points[(index + 1) % points.length];
      const node = owner[index];
      const next = boundary.nodes[(node + 1) % boundary.nodes.length];
      segments.push(makeSegment(a[0], a[1], b[0], b[1], {
        kind: 'region',
        boundary,
        node,
        key: edgeKeys[node],
        t0: start[index],
        t1: t[index],
        control: curved[index] ? edgeCurve(boundary.nodes[node], next) : null,
      }));
    }
  });
  return segments;
}

/** A drawn cut outline, as closed straight segments with no curve history. */
function cutterSegments(points) {
  const segments = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    segments.push(makeSegment(a[0], a[1], b[0], b[1], { kind: 'cutter', key: null, t0: 0, t1: 1, control: null }));
  }
  return segments;
}

function splitSegments(segments) {
  // Snap every endpoint onto a shared vertex so coincident edges agree
  // everywhere, then split at each pair's crossing. Doing this in two passes is
  // what makes overlapping parts produce coincident pieces with identical
  // endpoints, so they deduplicate cleanly afterwards.
  const vertices = [];
  for (const segment of segments) {
    for (const x of [segment.box[0], segment.box[2]]) {
      let best = null, bestDistance = WELD_TOLERANCE;
      for (const point of vertices) {
        const distance = Math.hypot(point.x - x, point.y - segment.box[segment.box[0] === x ? 1 : 3]);
        if (distance < bestDistance) { bestDistance = distance; best = point; }
      }
      if (best) {
        if (segment.box[0] === x) { segment.box[0] = best.x; segment.box[1] = best.y; }
        else { segment.box[2] = best.x; segment.box[3] = best.y; }
      } else {
        vertices.push({ x, y: segment.box[segment.box[0] === x ? 1 : 3] });
      }
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      for (const hit of segmentIntersection(segments[i], segments[j])) {
        addSplit(segments[i], hit.s, hit.x, hit.y);
        addSplit(segments[j], hit.t, hit.x, hit.y);
      }
    }
  }
}

// Several edges can meet at one point, and a collinear overlap reports the same
// point more than once. Recording it once per position keeps the split list
// strictly increasing, which is what the chain walk relies on.
function addSplit(segment, position, x, y) {
  for (const existing of segment.splits) {
    if (Math.abs(existing.s - position) < 1e-9) return;
  }
  segment.splits.push({ s: position, x, y });
}

/**
 * Break one segment at its split points. Each piece carries the slice of its
 * source curve it covers, so rejoining the pieces that were never touched
 * restores the original edge exactly.
 */
function explode(segment) {
  const { t0, t1 } = segment.source;
  const [ax, ay, bx, by] = segment.box;
  const splits = segment.splits.slice().sort((p, q) => p.s - q.s);
  const out = [];
  let fromS = 0;
  let from = { x: ax, y: ay };
  const emit = (toS, point) => {
    out.push({
      from, to: point, source: segment.source, reversed: false,
      u0: t0 + (t1 - t0) * fromS,
      u1: t0 + (t1 - t0) * toS,
    });
    from = point;
    fromS = toS;
  };
  for (const split of splits) emit(split.s, { x: split.x, y: split.y });
  emit(1, { x: bx, y: by });
  return out;
}

/** A point survives the cut when it is inside the region and outside the cutter. */
function probeSolid(regionRingsFlat, cutterRings, x, y) {
  return pointInRings(regionRingsFlat, x, y) && !pointInRings(cutterRings, x, y);
}

/**
 * Difference of one region by a closed cutter outline.
 *
 * Returns `{ changed, regions }`. When the cutter does not touch the region the
 * original region object comes back by identity, so untouched geometry keeps
 * both its exact nodes and its node ids.
 */
export function subtractRegion(region, cutter) {
  const cutterPoints = cutter.map(point => [Number(point[0]), Number(point[1])])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (cutterPoints.length < 3) return { changed: false, regions: [region], reason: 'A cut needs at least three points.' };

  const regionRingsFlat = regionRings(region);
  const cutterRings = [cutterPoints];
  const bounds = regionBounds(region);
  const cutterBounds = cutterPoints.reduce((acc, [x, y]) => ({
    left: Math.min(acc.left, x), right: Math.max(acc.right, x),
    top: Math.min(acc.top, y), bottom: Math.max(acc.bottom, y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  if (cutterBounds.right < bounds.left || cutterBounds.left > bounds.right
    || cutterBounds.bottom < bounds.top || cutterBounds.top > bounds.bottom) {
    return { changed: false, regions: [region], reason: 'The cut is outside the selected block.' };
  }

  const segments = [...regionSegments(region), ...cutterSegments(cutterPoints)];
  const result = booleanRegions(segments, (x, y) => probeSolid(regionRingsFlat, cutterRings, x, y));
  if (!result.kept) return { changed: false, regions: [region], reason: 'The cut did not change the block.' };
  if (!result.regions) return { changed: false, regions: [region], reason: 'The cut left unresolved geometry. Nothing was changed.' };
  if (!result.regions.length) return { changed: false, regions: [region], reason: 'The cut removed the block entirely.' };
  return { changed: true, regions: result.regions };
}

/**
 * Union of two regions, keeping the curves of both.
 *
 * Returns `{ changed, regions }` with a single region when they overlap or share
 * an edge. Regions that are apart, or that only touch at a point, come back
 * unchanged with `apart` set, since joining them would not make one solid.
 */
export function unionRegions(a, b) {
  const ringsA = regionRings(a), ringsB = regionRings(b);
  const boundsA = regionBounds(a), boundsB = regionBounds(b);
  const apart = { changed: false, apart: true, regions: [a, b], reason: 'The blocks do not overlap or touch.' };
  if (boundsA.right < boundsB.left || boundsA.left > boundsB.right
    || boundsA.bottom < boundsB.top || boundsA.top > boundsB.bottom) return apart;

  const segments = [...regionSegments(a), ...regionSegments(b)];
  const result = booleanRegions(
    segments,
    (x, y) => pointInRings(ringsA, x, y) || pointInRings(ringsB, x, y),
    { mergeCollinear: true },
  );
  // An edge with solid on both sides is where the two overlap or meet. With
  // none, they are apart or meet at a single point.
  if (!result.buried) return apart;
  if (!result.regions || !result.regions.length) {
    return { changed: false, regions: [a, b], reason: 'The merge left unresolved geometry. Nothing was changed.' };
  }
  if (result.regions.length > 1) return apart;
  return { changed: true, regions: result.regions };
}

/**
 * The shared half of every boolean: split the segments where they cross, keep
 * the pieces with solid on exactly one side, and rebuild those as regions.
 *
 * Returns `kept` (the number of boundary pieces), `buried` (pieces with solid
 * on both sides) and `regions`, which is null when the pieces would not chain
 * into closed rings.
 */
function booleanRegions(segments, isSolid, options = {}) {
  splitSegments(segments);
  const pieces = segments.flatMap(explode).filter(piece => {
    const dx = piece.to.x - piece.from.x, dy = piece.to.y - piece.from.y;
    return dx * dx + dy * dy > COINCIDENT_EPSILON * COINCIDENT_EPSILON;
  });

  // Keep only the pieces where solid and empty swap sides, which is exactly the
  // boundary of the result. Every kept piece is stored with solid on its left.
  const kept = [];
  // Two outlines running along the same edge, like two blocks sharing their top
  // line, each give a copy of the piece that is kept. Only one may stay.
  const seen = new Set();
  let buried = 0;
  for (const piece of pieces) {
    const dx = piece.to.x - piece.from.x, dy = piece.to.y - piece.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const mx = (piece.from.x + piece.to.x) / 2, my = (piece.from.y + piece.to.y) / 2;
    const nx = -dy / length * SIDE_PROBE, ny = dx / length * SIDE_PROBE;
    const left = isSolid(mx + nx, my + ny);
    const right = isSolid(mx - nx, my - ny);
    if (left === right) {
      if (left) buried++;
      continue;
    }
    const oriented = left ? piece : {
      from: piece.to, to: piece.from, source: piece.source, reversed: !piece.reversed,
      u0: piece.u1, u1: piece.u0,
    };
    const id = `${pointId(oriented.from)} ${pointId(oriented.to)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(oriented);
  }
  if (!kept.length) return { kept: 0, buried, regions: [] };

  const rings = chainRings(kept);
  if (!rings) return { kept: kept.length, buried, regions: null };
  const regions = ringsToRegions(rings, options)
    // A sliver thinner than the boolean's own probe is a numerical artefact, not
    // authored geometry, so it is dropped rather than saved as a degenerate ring.
    .filter(region => Math.abs(regionArea(region)) > MIN_AREA);
  return { kept: kept.length, buried, regions };
}

/**
 * Walk the kept pieces into closed rings. Pieces are matched by shared vertices,
 * which the split step guarantees are the identical coordinate pair on both
 * sides of an intersection.
 */
function chainRings(pieces) {
  // A T-junction, where a cut or an overlapping part ends partway along another
  // edge, leaves endpoints that no piece starts from. Snapping those together
  // is what turns a chain of loose pieces back into closed rings.
  const endpoints = [];
  for (const piece of pieces) { endpoints.push(piece.from, piece.to); }
  const merge = nearestMatch(endpoints, pieces);
  if (!merge) return null;
  for (const piece of pieces) {
    const from = merge.get(pointId(piece.from));
    const to = merge.get(pointId(piece.to));
    if (from) piece.from = from;
    if (to) piece.to = to;
  }

  const outgoing = new Map();
  for (const piece of pieces) {
    const id = pointId(piece.from);
    const list = outgoing.get(id);
    if (list) list.push(piece); else outgoing.set(id, [piece]);
  }
  const rings = [];
  const used = new Set();
  for (const piece of pieces) {
    if (used.has(piece)) continue;
    const start = pointId(piece.from);
    const ring = [piece];
    used.add(piece);
    let current = piece;
    // A ring can never have more pieces than the input, so this bound always
    // terminates while still tolerating a malformed walk.
    for (let guard = pieces.length; guard > 0; guard--) {
      if (pointId(current.to) === start) break;
      const candidates = outgoing.get(pointId(current.to));
      const next = candidates?.find(candidate => !used.has(candidate));
      if (!next) return null;
      used.add(next);
      ring.push(next);
      current = next;
    }
    if (pointId(current.to) !== start) return null;
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

const pointId = point => `${Math.round(point.x * 1e4)},${Math.round(point.y * 1e4)}`;

/**
 * Pair up endpoints that no piece starts from with the endpoint they should
 * continue into, within a tolerance well below the geometry's own scale.
 */
function nearestMatch(endpoints, pieces) {
  const starts = new Set(pieces.map(piece => pointId(piece.from)));
  const loose = endpoints.filter(point => !starts.has(pointId(point)));
  if (!loose.length) return new Map();
  const mapping = new Map();
  for (const point of loose) {
    let best = null, bestDistance = T_JUNCTION_SNAP;
    for (const candidate of endpoints) {
      if (pointId(candidate) === pointId(point)) continue;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) { bestDistance = distance; best = candidate; }
    }
    if (best) mapping.set(pointId(point), best);
  }
  return mapping;
}

/**
 * Rebuild authored boundaries from boolean output, then group the rings into
 * regions. Rings with the solid on their left are outers; the rest are holes,
 * each assigned to the smallest outer that contains it.
 */
function ringsToRegions(rings, options = {}) {
  const outlines = rings.map(ring => {
    const nodes = ringToNodes(ring, options);
    if (!nodes.length) return null;
    return {
      nodes,
      area: ringArea(ring.map(piece => [piece.from.x, piece.from.y])),
      points: ring.map(piece => [piece.from.x, piece.from.y]),
    };
  }).filter(Boolean);

  const outers = outlines.filter(outline => outline.area > MIN_AREA);
  const holes = outlines.filter(outline => outline.area <= -MIN_AREA);
  if (!outers.length) return [];
  for (const hole of holes) {
    const x = hole.points[0][0], y = hole.points[0][1];
    let owner = null;
    for (const outer of outers) {
      if (owner && outer.area >= owner.area) continue;
      if (!pointInRings([outer.points], x, y)) continue;
      owner = outer;
    }
    if (owner) (owner.holes ||= []).push(hole);
  }
  return outers
    .map(outer => ({ outer: { id: nextId('b'), nodes: outer.nodes }, inner: (outer.holes || []).map(hole => ({ id: nextId('b'), nodes: hole.nodes })) }))
    .sort((a, b) => (a.outer.nodes[0].x - b.outer.nodes[0].x) || (a.outer.nodes[0].y - b.outer.nodes[0].y));
}

/**
 * Turn a ring of boolean pieces back into an editable boundary.
 *
 * A curve is flattened into many short segments before the boolean runs, so the
 * result arrives as a run of pieces that all came from one authored edge.
 * Rejoining them means a small cut leaves the rest of the curve as one editable
 * edge instead of a node per subdivision step, which is both what the plan asks
 * for and what keeps a second cut cheap and stable.
 *
 * With `mergeCollinear`, a point where two straight edges from different
 * boundaries continue in one line is dropped too: that is where two merged
 * blocks met, not a point anyone placed.
 */
function ringToNodes(ring, { mergeCollinear = false } = {}) {
  const edges = [];
  for (const piece of ring) {
    const previous = edges[edges.length - 1];
    const sameEdge = previous && previous.key !== null && previous.key === piece.source.key;
    if (sameEdge && previous.reversed === piece.reversed && Math.abs(previous.u1 - piece.u0) < 1e-9) {
      previous.to = piece.to;
      previous.u1 = piece.u1;
      previous.control = piece.source.control;
      continue;
    }
    edges.push({
      key: piece.source.key, source: piece.source,
      from: piece.from, to: piece.to, reversed: piece.reversed,
      u0: piece.u0, u1: piece.u1,
    });
  }
  // The ring wraps, so the first and last groups may be two halves of one edge.
  if (edges.length > 1) {
    const first = edges[0], last = edges[edges.length - 1];
    if (first.key !== null && first.key === last.key && first.reversed === last.reversed
      && Math.abs(last.u1 - first.u0) < 1e-9) {
      first.from = last.from;
      first.u0 = last.u0;
      first.control = last.control;
      edges.pop();
    }
  }
  if (mergeCollinear) {
    for (let index = 0; edges.length > 3 && index < edges.length;) {
      const edge = edges[index];
      const nextIndex = (index + 1) % edges.length;
      if (!continuesStraight(edge, edges[nextIndex])) { index++; continue; }
      edge.to = edges[nextIndex].to;
      edges.splice(nextIndex, 1);
      // The joined edge may line up with the one after it as well.
      if (nextIndex < index) index--;
    }
  }
  if (edges.length < 3) return [];

  const nodes = [];
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index];
    const next = edges[(index + 1) % edges.length];
    nodes.push(makeGroupNode(edge, next));
  }
  return nodes;
}

/** Two straight edges from different boundaries that run on in one line. */
function continuesStraight(edge, next) {
  if (edge.source.control || next.source.control) return false;
  if (edge.source.boundary === next.source.boundary) return false;
  const dx = next.to.x - edge.from.x, dy = next.to.y - edge.from.y;
  const length = Math.hypot(dx, dy);
  if (length < COINCIDENT_EPSILON) return false;
  const offset = Math.abs((edge.to.x - edge.from.x) * dy - (edge.to.y - edge.from.y) * dx) / length;
  const along = (edge.to.x - edge.from.x) * dx + (edge.to.y - edge.from.y) * dy;
  return offset < 1e-4 && along > 0 && along < length * length;
}

function makeGroupNode(edge, next) {
  const node = { x: round(edge.to.x), y: round(edge.to.y), mode: 'corner', in: null, out: null, edge: 'straight' };
  const incoming = survivingCurve(edge);
  const outgoing = survivingCurve(next);
  if (incoming) { node.in = [round(incoming[2][0]), round(incoming[2][1])]; node.edge = 'curve'; }
  if (outgoing) { node.out = [round(outgoing[1][0]), round(outgoing[1][1])]; node.edge = 'curve'; }
  if (node.in && node.out) {
    const ax = node.in[0] - node.x, ay = node.in[1] - node.y;
    const bx = node.out[0] - node.x, by = node.out[1] - node.y;
    const aligned = Math.abs(ax * by - ay * bx) < 1e-6 && ax * bx + ay * by > 0;
    node.mode = aligned ? 'smooth' : 'independent';
  } else if (node.in || node.out) node.mode = 'independent';
  return normalizeNode(node, nextId('n'));
}

/**
 * The curve an edge group still traces, as `[p0, c1, c2, p1]`, or null when the
 * group is a straight section. A group covering only part of its source curve
 * becomes the matching sub-arc, so a cut through a curve shortens the curve
 * instead of flattening it.
 */
function survivingCurve(edge) {
  const { control } = edge.source;
  if (!control) return null;
  const [p0, c1, c2, p1] = control;
  const low = Math.min(edge.u0, edge.u1), high = Math.max(edge.u0, edge.u1);
  if (edge.reversed) {
    const [a, b, c, d] = subCubic(p0, c1, c2, p1, low, high);
    return [d, c, b, a];
  }
  return subCubic(p0, c1, c2, p1, low, high);
}

// ---------------------------------------------------------------------------
// Block trail operations
// ---------------------------------------------------------------------------

/**
 * Cut a block with a closed outline. Returns the pieces left over as blocks,
 * largest first: the largest keeps the block's id, and every piece the cut
 * separated becomes a block of its own with the same material and layer.
 */
export function cutBlock(block, cutter) {
  const result = subtractRegion(block, cutter);
  if (!result.changed) return { changed: false, blocks: [block], reason: result.reason || 'The cut did not change the selected block.' };
  const pieces = result.regions.slice().sort((a, b) => regionArea(b) - regionArea(a));
  return {
    changed: true,
    blocks: pieces.map(({ outer, inner }, index) => ({
      ...block,
      id: index === 0 ? block.id : nextId('b'),
      outer,
      inner,
    })),
  };
}

/**
 * Merge blocks that overlap or touch into one. The largest block keeps its id,
 * material and layer. Blocks join in whatever order connects them, so two that
 * only meet through a third still merge. Returns `{ changed, block }`, or
 * `{ changed: false, reason }` when they cannot become one solid.
 */
export function mergeBlocks(blocks) {
  if (blocks.length < 2) return { changed: false, reason: 'Select at least two blocks to merge.' };
  if (new Set(blocks.map(block => block.layer === 'back')).size > 1) {
    return { changed: false, reason: 'Terrain blocks and back walls cannot be merged.' };
  }
  const [base, ...rest] = blocks.slice().sort((a, b) => regionArea(b) - regionArea(a));
  let region = base;
  while (rest.length) {
    let joined = false;
    for (let index = 0; index < rest.length; index++) {
      const result = unionRegions(region, rest[index]);
      if (result.changed) {
        region = result.regions[0];
        rest.splice(index, 1);
        joined = true;
        break;
      }
      if (!result.apart) return { changed: false, reason: result.reason };
    }
    if (!joined) return { changed: false, reason: 'Those blocks do not overlap or touch, so they cannot be merged.' };
  }
  return { changed: true, block: { ...base, outer: region.outer, inner: region.inner } };
}

/** Move a block and every boundary it owns, including its empty spaces. */
export function moveBlock(block, dx, dy) {
  const shift = boundary => ({
    ...boundary,
    nodes: boundary.nodes.map(node => ({
      ...node,
      x: round(node.x + dx),
      y: round(node.y + dy),
      in: node.in ? [round(node.in[0] + dx), round(node.in[1] + dy)] : null,
      out: node.out ? [round(node.out[0] + dx), round(node.out[1] + dy)] : null,
    })),
  });
  return { ...block, outer: shift(block.outer), inner: block.inner.map(shift) };
}

/**
 * Scale a block and every boundary it owns about (px, py), by sx across and sy
 * down. Both must be positive. Curve handles scale with their points, so a
 * circle scaled the same both ways stays a circle.
 */
export function scaleBlock(block, px, py, sx, sy) {
  const at = ([x, y]) => [round(px + (x - px) * sx), round(py + (y - py) * sy)];
  const scale = boundary => ({
    ...boundary,
    nodes: boundary.nodes.map(node => {
      const [x, y] = at([node.x, node.y]);
      return { ...node, x, y, in: node.in ? at(node.in) : null, out: node.out ? at(node.out) : null };
    }),
  });
  return { ...block, outer: scale(block.outer), inner: block.inner.map(scale) };
}

/**
 * Turn a point about (px, py) by `angle` radians, clockwise on screen (the
 * canvas y axis points down).
 */
export function rotatePoint(x, y, px, py, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - px, dy = y - py;
  return [px + dx * c - dy * s, py + dx * s + dy * c];
}

/**
 * Mirror a block across the line x = px (`horizontal`) or y = py. A mirror
 * turns every ring the other way round, and an outline must run one way and
 * its caves the other, so each ring's points are put back in their usual
 * order: each point's handles swap sides, and the straight-or-curved hint of
 * the edge leaving it comes from the edge that now arrives there.
 */
export function mirrorBlock(block, px, py, horizontal) {
  const mirrored = scaleBlock(block, px, py, horizontal ? -1 : 1, horizontal ? 1 : -1);
  const reverse = boundary => {
    const { nodes } = boundary;
    const flipped = nodes.map((node, index) => {
      const { edge, ...rest } = node;
      const arriving = nodes[(index + nodes.length - 1) % nodes.length].edge;
      return {
        ...rest,
        in: node.out ? [...node.out] : null,
        out: node.in ? [...node.in] : null,
        ...(arriving === undefined ? {} : { edge: arriving }),
      };
    });
    return { ...boundary, nodes: flipped.reverse() };
  };
  return { ...mirrored, outer: reverse(mirrored.outer), inner: mirrored.inner.map(reverse) };
}

/**
 * Rotate a block and every boundary it owns about (px, py) by `angle` radians,
 * clockwise on screen. Curve handles turn with their points, so curves keep
 * their shape exactly.
 */
export function rotateBlock(block, px, py, angle) {
  const at = ([x, y]) => rotatePoint(x, y, px, py, angle).map(round);
  const rotate = boundary => ({
    ...boundary,
    nodes: boundary.nodes.map(node => {
      const [x, y] = at([node.x, node.y]);
      return { ...node, x, y, in: node.in ? at(node.in) : null, out: node.out ? at(node.out) : null };
    }),
  });
  return { ...block, outer: rotate(block.outer), inner: block.inner.map(rotate) };
}

/** Insert a node into an edge without changing the edge's shape. */
export function insertBoundaryNode(boundary, edgeIndex, t) {
  const nodes = boundary.nodes;
  if (edgeIndex < 0 || edgeIndex >= nodes.length || !Number.isFinite(t)) return boundary;
  const node = nodes[edgeIndex];
  const next = nodes[(edgeIndex + 1) % nodes.length];
  const amount = Math.max(0.01, Math.min(0.99, t));
  const curved = isCurvedEdge(node, next);
  const [p0, c1, c2, p1] = edgeCurve(node, next);
  const [left, right] = splitCubic(p0, c1, c2, p1, amount);
  const middle = createNode(left[3][0], left[3][1], { edge: 'straight' });
  if (curved) {
    middle.in = [left[2][0], left[2][1]];
    middle.out = [right[1][0], right[1][1]];
    middle.mode = 'smooth';
  }
  next.in = curved ? [right[2][0], right[2][1]] : null;
  const updated = nodes.slice();
  updated[edgeIndex] = { ...node, out: curved ? [left[1][0], left[1][1]] : null };
  updated.splice(edgeIndex + 1, 0, middle);
  return { ...boundary, nodes: normalizeRegionBoundaries(updated) };
}

function normalizeRegionBoundaries(nodes) {
  // Only the outgoing type is stored, so reconcile it against the live handles
  // rather than rewriting them: a node can keep an incoming handle for a curved
  // edge that its own outgoing edge does not continue.
  return nodes.map(node => normalizeNode(node, node.id || nextId('n')));
}

export function removeBoundaryNodes(boundary, indices) {
  const drop = new Set(indices);
  const nodes = boundary.nodes.filter((_, index) => !drop.has(index));
  if (nodes.length < 3) return null;
  return { ...boundary, nodes: normalizeRegionBoundaries(nodes) };
}

/** Set whether the edge leaving `index` is straight or curved. */
export function setBoundaryEdge(boundary, index, curved) {
  const nodes = boundary.nodes.slice();
  const node = nodes[index];
  const next = nodes[(index + 1) % nodes.length];
  if (!node || !next) return boundary;
  if (curved) {
    const dx = next.x - node.x, dy = next.y - node.y;
    const third = 1 / 3;
    const updated = {
      ...node,
      edge: 'curve',
      mode: node.mode === 'corner' ? 'independent' : node.mode,
      out: node.out || [node.x + dx * third, node.y + dy * third],
    };
    // A smooth neighbour's aligned handle moves with it, so a curve is not
    // silently broken by curving the edge that arrives at it.
    const nextHandle = next.in
      || (next.mode === 'smooth' && node.out
        ? [2 * next.x - updated.out[0], 2 * next.y - updated.out[1]]
        : [next.x - dx * third, next.y - dy * third]);
    nodes[index] = updated;
    nodes[(index + 1) % nodes.length] = { ...next, in: nextHandle };
  } else {
    nodes[index] = { ...node, edge: 'straight', out: null, mode: 'corner' };
  }
  return { ...boundary, nodes: normalizeRegionBoundaries(nodes) };
}

/** 'corner' drops both handles, 'smooth' aligns them, 'independent' frees them. */
/** 'corner' drops both handles, 'smooth' aligns them, 'independent' frees them. */
export function setNodeMode(boundary, index, mode) {
  const nodes = boundary.nodes.slice();
  const count = nodes.length;
  const nextIndex = (index + 1) % count;
  const previousIndex = (index - 1 + count) % count;
  const node = nodes[index];
  const next = nodes[nextIndex];
  const previous = nodes[previousIndex];
  if (!node || !next || !previous) return boundary;

  if (mode === 'corner') {
    nodes[index] = { ...node, mode: 'corner', in: null, out: null };
    return { ...boundary, nodes: normalizeRegionBoundaries(nodes) };
  }

  const direction = tangentFor(node, previous, next);
  if (!direction) return boundary;
  // Each handle is a third as long as the edge on its side.
  const outLength = Math.hypot(next.x - node.x, next.y - node.y) / 3;
  const inLength = Math.hypot(previous.x - node.x, previous.y - node.y) / 3;
  const freshOut = [
    node.x + direction[0] * outLength,
    node.y + direction[1] * outLength,
  ];
  const freshIn = [
    node.x - direction[0] * inLength,
    node.y - direction[1] * inLength,
  ];
  // Smooth always gets fresh, aligned handles; independent keeps any it has.
  const out = mode === 'smooth' ? freshOut : node.out || freshOut;
  const inHandle = mode === 'smooth' ? freshIn : node.in || freshIn;
  nodes[index] = { ...node, mode, out, in: inHandle, edge: 'curve' };

  // An edge only curves when both of its ends have a handle. A neighbour
  // without one gets a neutral handle pointing straight at this point, so the
  // curve shows while the neighbour stays a sharp corner.
  if (!next.in)
    nodes[nextIndex] = {
      ...next,
      in: [next.x + (node.x - next.x) / 3, next.y + (node.y - next.y) / 3],
    };
  if (!previous.out)
    nodes[previousIndex] = {
      ...previous,
      edge: 'curve',
      out: [
        previous.x + (node.x - previous.x) / 3,
        previous.y + (node.y - previous.y) / 3,
      ],
    };
  return { ...boundary, nodes: normalizeRegionBoundaries(nodes) };
}

/** The unit direction a smooth point's handles run along: previous → next. */
function tangentFor(node, previous, next) {
  const candidates = [
    [next.x - previous.x, next.y - previous.y],
    [next.x - node.x, next.y - node.y],
    [node.x - previous.x, node.y - previous.y],
  ];
  for (const [x, y] of candidates) {
    const length = Math.hypot(x, y);
    if (length > 1e-6) return [x / length, y / length];
  }
  return null;
}

/** Add a whole inner boundary, filling a new empty space inside a region. */
export function addInnerBoundary(region, boundary) {
  return { ...region, inner: [...region.inner, orientBoundary(normalizeBoundary(boundary), false)] };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  const x = ax + dx * amount, y = ay + dy * amount;
  return { distance: Math.hypot(px - x, py - y), x, y, amount };
}

/**
 * Which part of a block is under the cursor. Points and handles win over edges,
 * which win over the solid body. Empty cave space deliberately does not match,
 * so clicking inside a cave never selects the surrounding block.
 */
export function hitTestBlock(block, x, y, threshold = 10) {
  for (const boundary of [block.outer, ...block.inner]) {
    for (let index = 0; index < boundary.nodes.length; index++) {
      const node = boundary.nodes[index];
      if (Math.hypot(node.x - x, node.y - y) <= threshold) return { type: 'node', boundary, index, node };
      const next = boundary.nodes[(index + 1) % boundary.nodes.length];
      for (const side of ['in', 'out']) {
        const handle = side === 'in' ? node.in : node.out;
        if (handle && Math.hypot(handle[0] - x, handle[1] - y) <= threshold) {
          return { type: 'handle', boundary, index, node, side };
        }
      }
      if (Math.hypot(next.x - x, next.y - y) <= threshold) continue;
      const hit = distanceToSegment(x, y, node.x, node.y, next.x, next.y);
      if (hit.distance <= threshold) {
        // Parameter along the edge, matching insertBoundaryNode.
        const t = edgeParameter(node, next, hit.x, hit.y);
        return { type: 'edge', boundary, index, node, t, x: hit.x, y: hit.y };
      }
    }
  }
  return pointInRegion(block, x, y) ? { type: 'solid' } : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Total solid area of a block, ignoring every other block. */
export function blockSolidArea(block) {
  return regionArea(block);
}

function segmentsCross(a, b) {
  const cross = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = cross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay);
  const d2 = cross(a.ax, a.ay, a.bx, a.by, b.bx, b.by);
  const d3 = cross(b.ax, b.ay, b.bx, b.by, a.ax, a.ay);
  const d4 = cross(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function ringEdges(points, ring) {
  return points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    return {
      ax: a[0], ay: a[1], bx: b[0], by: b[1], ring, index,
      left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]),
      top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]),
    };
  });
}

/**
 * Visit every pair of edges whose bounding boxes overlap, sweeping in x, and
 * stop as soon as `crosses` says yes. Validation runs on every edit, so this
 * keeps a long, finely sampled block from costing a quadratic scan per frame.
 */
function anyPair(edges, crosses) {
  const sorted = edges.slice().sort((a, b) => a.left - b.left);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].left <= a.right; j++) {
      const b = sorted[j];
      if (b.top > a.bottom || b.bottom < a.top) continue;
      if (crosses(a, b)) return true;
    }
  }
  return false;
}

/** True when a flattened boundary crosses itself anywhere but at a shared vertex. */
function selfIntersects(points) {
  const count = points.length;
  return anyPair(ringEdges(points, 0), (a, b) => {
    const gap = Math.abs(a.index - b.index);
    // Neighbouring edges, including the ring's last and first, share a vertex.
    if (gap === 1 || gap === count - 1) return false;
    return segmentsCross(a, b);
  });
}

function boundariesOverlap(region) {
  const rings = [flattenBoundary(region.outer).points, ...region.inner.map(boundary => flattenBoundary(boundary).points)];
  if (rings.length < 2) return false;
  const edges = rings.flatMap((points, ring) => ringEdges(points, ring));
  return anyPair(edges, (a, b) => a.ring !== b.ring && segmentsCross(a, b));
}

/**
 * Geometry errors for one block on its own.
 *
 * @returns {{ type: 'error' | 'warning', text: string }[]}
 */
export function validateBlock(block) {
  const messages = [];
  const error = text => messages.push({ type: 'error', text });
  for (const [which, boundary] of [['outer', block.outer], ...block.inner.map((b, i) => [`inner ${i + 1}`, b])]) {
    const nodes = boundary.nodes;
    if (nodes.length < 3) { error(`Block ${which} boundary needs at least three points.`); continue; }
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        error(`Block ${which} point ${index + 1} must have finite coordinates.`);
        continue;
      }
      const next = nodes[(index + 1) % nodes.length];
      if (Math.hypot(node.x - next.x, node.y - next.y) < COINCIDENT_EPSILON) {
        const where = which === 'outer' ? 'outline' : which;
        error(
          `Block ${where} has two points on top of each other (points ${index + 1} and ${(index + 1) % nodes.length + 1} at x ${Math.round(node.x)}, y ${Math.round(node.y)}). Delete one of them.`,
        );
      }
    }
    const points = flattenBoundary(boundary).points;
    if (Math.abs(ringArea(points)) < MIN_AREA) error(`Block ${which} boundary encloses no area.`);
    else if (selfIntersects(points)) error(`Block ${which} boundary crosses itself.`);
  }
  for (const [index, hole] of block.inner.entries()) {
    const point = hole.nodes[0];
    if (point && !pointInRings([flattenBoundary(block.outer).points], point.x, point.y)) {
      error(`Block empty space ${index + 1} is not inside the block.`);
    }
  }
  if (boundariesOverlap(block)) error('Block has boundaries that cross each other.');
  // Whether a block is buried under other blocks depends on the combined
  // terrain, so it is reported by trail validation from the compiled union.
  return messages;
}

/** Per-block geometry errors, labelled with each block's position in the list. */
export function validateBlocks(blocks) {
  return blocks.flatMap((block, index) => validateBlock(block).map(message => ({
    ...message,
    text: blocks.length > 1 ? `Block ${index + 1}: ${message.text}` : message.text,
    target: { type: 'block', index },
  })));
}

function edgeParameter(node, next, x, y) {
  if (!isCurvedEdge(node, next)) {
    const length = Math.hypot(next.x - node.x, next.y - node.y) || 1;
    return Math.max(0, Math.min(1, Math.hypot(x - node.x, y - node.y) / length));
  }
  const control = edgeCurve(node, next);
  // A short fixed sweep is enough: this only seeds an insertion, and the editor
  // refines it from the click position afterwards.
  let best = 0, bestDistance = Infinity;
  for (let step = 0; step <= 32; step++) {
    const t = step / 32;
    const point = cubicPoint(control[0], control[1], control[2], control[3], t);
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (distance < bestDistance) { bestDistance = distance; best = t; }
  }
  return best;
}
