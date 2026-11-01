// Terrain block geometry: boundaries, points, drawn shapes and cuts.
import { canFlip, canRotate } from "../drawing.js";
import { isBackWall, normalizeRotation } from "../trail-schema.js";
import {
  cutBlock,
  edgeCurve,
  insertBoundaryNode,
  isCurvedEdge,
  mergeBlocks,
  normalizeBlocks,
  rectangleBlock,
} from "../terrain-geometry.js";
import { ctx } from "./dom.js";
import { pushHistory } from "./history.js";
import { isBlockLocked } from "./locks.js";
import { syncInspector } from "./inspector.js";
import { floorUnder, groundY, render, startY } from "./render.js";
import { blocksSelection } from "./selection.js";
import { gridSpacing } from "./snap.js";
import { editor } from "./state.js";
import { refuseEdit, showStatus } from "./status.js";
import { placingNisse, setTool, toolLayer, toolMaterial, toolSettings } from "./tools.js";

export { isBackWall };

/** The blocks being edited, normalized so every node and handle is well formed. */
export function blocks() {
  if (!editor.trail.terrainBlocks) editor.trail.terrainBlocks = [];
  return editor.trail.terrainBlocks;
}

/** A boundary as one canvas path, following its curves. */
export function traceBoundary(boundary) {
  const nodes = boundary.nodes;
  if (!nodes.length) return;
  ctx.moveTo(nodes[0].x, nodes[0].y);
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const next = nodes[(index + 1) % nodes.length];
    if (isCurvedEdge(node, next)) {
      const [p0, c1, c2, p1] = edgeCurve(node, next);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1]);
    } else {
      ctx.lineTo(next.x, next.y);
    }
  }
  ctx.closePath();
}

/** A block's solid area as one path, with its caves as holes. */
export function traceBlock(block) {
  ctx.beginPath();
  traceBoundary(block.outer);
  for (const hole of block.inner) traceBoundary(hole);
}

/** The block indices the current selection covers, whole or in part. */
export function selectedBlocks() {
  if (editor.selection?.kind === "items")
    return editor.selection.items
      .filter((item) => item.type === "block")
      .map((item) => item.index);
  return Number.isInteger(editor.selection?.blockIndex) ? [editor.selection.blockIndex] : [];
}

export function blockSelected(blockIndex) {
  return (
    (editor.selection?.kind === "block" || editor.selection?.kind === "items") &&
    selectedBlocks().includes(blockIndex)
  );
}

/**
 * Every boundary of a block in one list: the outer first, then its caves.
 * Selections store a boundary by its position in this list.
 */
export function boundaryEntries(block) {
  return [
    { boundary: block.outer, hole: -1 },
    ...block.inner.map((boundary, hole) => ({ boundary, hole })),
  ];
}

/**
 * A copy of a block with one boundary replaced, or removed when `replacement`
 * is null. Removing the outer boundary removes the block: that returns null.
 */
export function withBoundary(block, boundaryIndex, replacement) {
  const entry = boundaryEntries(block)[boundaryIndex];
  if (!entry) return block;
  if (entry.hole < 0) return replacement ? { ...block, outer: replacement } : null;
  const inner = block.inner
    .map((hole, index) => (index === entry.hole ? replacement : hole))
    .filter(Boolean);
  return { ...block, inner };
}

export function replaceBoundary(blockIndex, boundaryIndex, replacement) {
  const block = blocks()[blockIndex];
  if (block)
    replaceBlock(blockIndex, withBoundary(block, boundaryIndex, replacement));
}

/** Every boundary of a block: the outer first, then its caves. */
export function boundariesOf(block) {
  return [block.outer, ...block.inner];
}

export function boundaryAt(target) {
  const block = blocks()[target.blockIndex];
  if (!block) return null;
  return boundariesOf(block)[target.boundaryIndex] || null;
}

/** Replace one block at an index, returning a new block list. */
export function replaceBlock(index, block) {
  const next = blocks().slice();
  next[index] = block;
  editor.trail.terrainBlocks = next;
}

/** A smooth node keeps its handles collinear, so moving one moves the other. */
export function realignSmooth(boundary, index) {
  const node = boundary.nodes[index];
  if (!node.in || !node.out) return;
  const inLength = Math.hypot(node.in[0] - node.x, node.in[1] - node.y);
  const outLength = Math.hypot(node.out[0] - node.x, node.out[1] - node.y);
  if (inLength < 1e-6 || outLength < 1e-6) return;
  const dx = (node.in[0] - node.x) / inLength,
    dy = (node.in[1] - node.y) / inLength;
  node.out = [node.x - dx * outLength, node.y - dy * outLength];
}

/**
 * Insert a point into an edge, keeping the edge's shape. On a curved edge this
 * splits the Bézier rather than flattening it, so the outline does not change.
 */
export function insertBlockNode(boundaryIndex, nodeIndex, t, blockIndex) {
  const block = blocks()[blockIndex];
  const boundary = block && boundariesOf(block)[boundaryIndex];
  if (!boundary) return;
  replaceBoundary(blockIndex, boundaryIndex, {
    ...insertBoundaryNode(boundary, nodeIndex, t),
    id: boundary.id,
  });
  // The inserted node sits right after the one the edge started at.
  editor.selection = {
    kind: "blockPoint",
    blockIndex,
    boundaryIndex,
    index: nodeIndex + 1,
  };
}

export function addAt(point) {
  if (refuseEdit()) return;
  pushHistory();
  if (editor.tool === "apple" && placingNisse()) {
    // A trail has one nisse at most, so placing it again moves it.
    editor.trail.nisse = { x: point.x, y: point.y };
    editor.selection = { kind: "nisse", index: 0 };
  } else if (editor.tool === "apple") {
    editor.trail.apples.push({ x: point.x, y: point.y });
    editor.selection = { kind: "apple", index: editor.trail.apples.length - 1 };
  } else if (editor.tool === "start") {
    editor.trail.start = {
      x: point.x,
      y: startY(point.x, point.y),
      facing: Number(toolSettings.start.facing) < 0 ? -1 : 1,
    };
    editor.selection = { kind: "start" };
  } else if (editor.tool === "prop") {
    const prop = {
      x: point.x,
      y: point.y,
      type: toolSettings.prop.type,
      layer: toolSettings.prop.layer === "front" ? "front" : "back",
    };
    if (prop.type === "sign") prop.text = "";
    if (toolSettings.prop.flip && canFlip(prop.type)) prop.flip = true;
    const rotation = normalizeRotation(toolSettings.prop.rotation);
    if (rotation && canRotate(prop.type)) prop.rotation = rotation;
    editor.trail.props.push(prop);
    editor.selection = { kind: "prop", index: editor.trail.props.length - 1 };
  } else if (editor.tool === "spike") {
    editor.trail.spikes.push({
      x: point.x,
      y: point.y,
      radius: toolSettings.spike.radius,
      spin: toolSettings.spike.spin,
    });
    editor.selection = { kind: "spike", index: editor.trail.spikes.length - 1 };
  } else if (editor.tool === "finish") {
    // Placed on the floor under the click, so inside a cave it lands on the
    // cave floor rather than the roof, ready to be dragged up or down.
    editor.trail.finish.x = point.x;
    editor.trail.finish.y = floorUnder(point.x, point.y) ?? groundY(point.x);
    editor.selection = { kind: "finish" };
  }
  // Start and finish are one of a kind, so those go back to Select; every
  // other tool stays active for the next click.
  if (editor.tool === "start" || editor.tool === "finish") setTool("select");
  syncInspector();
  render();
}

/** Drop points that barely change a freehand outline (Ramer–Douglas–Peucker). */
function simplifyOutline(points, tolerance) {
  if (points.length < 4) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a],
      [bx, by] = points[b];
    const dx = bx - ax,
      dy = by - ay,
      lengthSquared = dx * dx + dy * dy;
    let far = -1,
      farIndex = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
        : 0;
      const distance = Math.hypot(px - ax - dx * t, py - ay - dy * t);
      if (distance > far) {
        far = distance;
        farIndex = i;
      }
    }
    if (far > tolerance) {
      keep[farIndex] = 1;
      stack.push([a, farIndex], [farIndex, b]);
    }
  }
  const out = points.filter((_, index) => keep[index]);
  // The drawing usually ends back near its start; don't keep both.
  const [fx, fy] = out[0],
    [lx, ly] = out.at(-1);
  if (out.length > 3 && Math.hypot(fx - lx, fy - ly) < tolerance * 3) out.pop();
  return out;
}

const signedArea = (points) =>
  points.reduce((sum, [x, y], index) => {
    const [nx, ny] = points[(index + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;

// Outline points of a circle while it's drawn, and of a circular cut.
const CIRCLE_STEPS = 48;
// Handle length that makes four cubic curves follow a circle.
const CIRCLE_HANDLE = 0.5523;

/** The four smooth points of a circle, wound like `like`'s outline. */
function circleNodes({ cx, cy, r }, like) {
  const template = like.nodes[0];
  const dir = Math.sign(signedArea(like.nodes.map((node) => [node.x, node.y]))) || 1;
  return Array.from({ length: 4 }, (_, index) => {
    const angle = (index * Math.PI * dir) / 2;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const x = cx + r * cos,
      y = cy + r * sin;
    const tx = -sin * dir * r * CIRCLE_HANDLE,
      ty = cos * dir * r * CIRCLE_HANDLE;
    return {
      ...template,
      id: `${template.id}-${index}`,
      x,
      y,
      mode: "smooth",
      in: [x - tx, y - ty],
      out: [x + tx, y + ty],
      edge: "curve",
    };
  });
}

/**
 * A circular cut fully inside solid leaves a cave of the circle's sampled
 * points; give it the four curved points of a drawn circle instead.
 */
function roundCircularCaves(block, circle) {
  const onCircle = (node) =>
    Math.abs(Math.hypot(node.x - circle.cx, node.y - circle.cy) - circle.r) < 1;
  return {
    ...block,
    inner: block.inner.map((boundary) =>
      boundary.nodes.length === CIRCLE_STEPS && boundary.nodes.every(onCircle)
        ? { ...boundary, nodes: circleNodes(circle, boundary) }
        : boundary,
    ),
  };
}

function snapToGrid([x, y]) {
  const g = gridSpacing(editor.zoom);
  return [Math.round(x / g) * g, Math.round(y / g) * g];
}

/**
 * What a Block or Cut drag will make, from its raw path and the keys held:
 * Cmd/Ctrl draws a circle, Alt a rectangle, and Shift snaps to the grid.
 */
export function updateShapePoints(shape) {
  const snap = shape.shift ? snapToGrid : (point) => point;
  shape.circleShape = null;
  if (shape.water) {
    // Water is always a rectangle, from the corner where the drag started.
    const [sx, sy] = snap(shape.raw[0]);
    const [ex, ey] = snap(shape.end);
    shape.points = [[sx, sy], [ex, sy], [ex, ey], [sx, ey]];
    return;
  }
  if (shape.circle) {
    // A circle in the dragged square, from the corner where the drag started.
    const [sx, sy] = snap(shape.raw[0]);
    const [ex, ey] = snap(shape.end);
    const size = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
    const r = size / 2;
    const cx = sx + Math.sign(ex - sx || 1) * r;
    const cy = sy + Math.sign(ey - sy || 1) * r;
    shape.circleShape = { cx, cy, r };
    shape.points = Array.from({ length: CIRCLE_STEPS }, (_, index) => {
      const angle = (index / CIRCLE_STEPS) * Math.PI * 2;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    });
    return;
  }
  if (shape.alt) {
    const [sx, sy] = snap(shape.raw[0]);
    const [ex, ey] = snap(shape.end);
    shape.points = [[sx, sy], [ex, sy], [ex, ey], [sx, ey]];
    return;
  }
  const points = [];
  for (const raw of [...shape.raw, shape.end]) {
    const point = snap(raw);
    const last = points.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1])
      points.push(point);
  }
  // Snapped outlines drop points that only continue a straight grid line.
  shape.points = shape.shift ? simplifyOutline(points, 0.5) : points;
}

/**
 * Commit a drawn shape. A Block drag makes a new block in the drawn shape (a
 * rectangle with `rect`, or a curved circle with `circle`); a Cut drag removes
 * the drawn outline from a block.
 *
 * The kind is passed in rather than read from `pendingKind`, because the caller
 * has already cleared that state by the time it gets here.
 */
export function commitShape(kind, points, closed, rect = false, circle = null) {
  if (points.length < 2) return false;
  if (kind === "block") {
    const xs = points.map((value) => value[0]),
      ys = points.map((value) => value[1]);
    const left = Math.min(...xs),
      right = Math.max(...xs);
    const top = Math.min(...ys),
      bottom = Math.max(...ys);
    if (right - left < 8 || bottom - top < 8) return false;
    const block = rectangleBlock(
      left,
      top,
      right,
      bottom,
      toolMaterial("block"),
    );
    if (circle) {
      block.outer = { ...block.outer, nodes: circleNodes(circle, block.outer) };
    } else if (!rect) {
      // Freehand: the drawn outline, with the rectangle's ids and winding.
      const outline = simplifyOutline(points, 3 / editor.zoom);
      if (outline.length < 3 || Math.abs(signedArea(outline)) < 64)
        return false;
      const outer = block.outer;
      const template = outer.nodes[0];
      if (
        Math.sign(signedArea(outline)) !==
        Math.sign(
          signedArea(
            outer.nodes.map((node) => [node.x, node.y]),
          ),
        )
      )
        outline.reverse();
      block.outer = {
        ...outer,
        nodes: outline.map(([x, y], index) => ({
          ...template,
          id: `${template.id}-${index}`,
          x,
          y,
          mode: "corner",
          in: null,
          out: null,
          edge: "straight",
        })),
      };
    }
    if (toolLayer("block") === "back") block.layer = "back";
    editor.trail.terrainBlocks = [
      ...blocks(),
      normalizeBlocks([block], "grass")[0],
    ];
    editor.selection = {
      kind: "block",
      blockIndex: editor.trail.terrainBlocks.length - 1,
    };
    return true;
  }

  // A cut needs at least three corners, and only cuts blocks on its own layer.
  // It applies to the selected blocks when it overlaps any of them, so a cave
  // can be cut into a block that sits under another one; otherwise it applies
  // to the topmost block it changes, so one stroke never carves through every
  // block at once.
  if (!closed || points.length < 3) {
    showStatus("warning", "That cut was too small. Drag a larger outline.");
    return false;
  }
  // A cut that separates a block leaves each piece as a block of its own: the
  // largest keeps the block's place and id, the rest go in right after it.
  const attempt = (blockIndex) => {
    const result = cutBlock(blocks()[blockIndex], points);
    if (!result.changed) return result;
    const pieces = normalizeBlocks(
      circle ? result.blocks.map((block) => roundCircularCaves(block, circle)) : result.blocks,
      "grass",
    );
    const list = blocks();
    editor.trail.terrainBlocks = [
      ...list.slice(0, blockIndex),
      ...pieces,
      ...list.slice(blockIndex + 1),
    ];
    return { ...result, added: pieces.length - 1 };
  };
  let reason = null;
  const back = toolLayer("cut") === "back";
  const onLayer = (index) =>
    blocks()[index] && isBackWall(blocks()[index]) === back && !isBlockLocked(index);
  // Cut from the last index down, so pieces inserted after a block never shift
  // the indices of the blocks still to be cut.
  const selected = selectedBlocks().filter(onLayer).sort((a, b) => b - a);
  const changed = [];
  for (const index of selected) {
    const result = attempt(index);
    reason ||= result.reason;
    if (result.changed) {
      for (let i = 0; i < changed.length; i++) changed[i] += result.added;
      changed.push(index);
    }
  }
  if (changed.length) {
    editor.selection = blocksSelection(changed.sort((a, b) => a - b));
    return true;
  }
  for (let blockIndex = blocks().length - 1; blockIndex >= 0; blockIndex--) {
    if (selected.includes(blockIndex) || !onLayer(blockIndex)) continue;
    const result = attempt(blockIndex);
    if (result.changed) {
      editor.selection = { kind: "block", blockIndex };
      return true;
    }
    reason ||= result.reason;
  }
  showStatus(
    "warning",
    reason || `The cut did not overlap any ${back ? "back wall" : "terrain block"}.`,
  );
  return false;
}

/**
 * Merges the selected blocks into one, in the largest block's material. The
 * merged block takes the place of the topmost one, so it is not hidden behind
 * blocks that were drawn between them. Says why when they can't be merged.
 */
export function mergeSelectedBlocks() {
  if (refuseEdit()) return false;
  const list = blocks();
  const indices = selectedBlocks().filter((index) => list[index]);
  const result = mergeBlocks(indices.map((index) => list[index]));
  if (!result.changed) {
    showStatus("warning", result.reason);
    return false;
  }
  pushHistory();
  const top = Math.max(...indices);
  const merged = normalizeBlocks([result.block], "grass")[0];
  editor.trail.terrainBlocks = list.flatMap((block, index) => {
    if (index === top) return [merged];
    return indices.includes(index) ? [] : [block];
  });
  editor.selection = {
    kind: "block",
    blockIndex: top - indices.filter((index) => index < top).length,
  };
  const mixed = new Set(indices.map((index) => list[index].material)).size > 1;
  showStatus(
    "info",
    `Merged ${indices.length} ${isBackWall(merged) ? "back walls" : "blocks"}${mixed ? ` into ${merged.material}` : ""}.`,
  );
  return true;
}

/** A copy of a block with fresh ids, so it's fully independent of the original. */
export function freshBlockCopy(block) {
  const strip = (boundary) => ({
    nodes: boundary.nodes.map(({ id, ...node }) => structuredClone(node)),
  });
  return normalizeBlocks(
    [
      {
        material: block.material,
        ...(isBackWall(block) ? { layer: "back" } : {}),
        outer: strip(block.outer),
        inner: block.inner.map(strip),
      },
    ],
    "grass",
  )[0];
}

/**
 * The caves a "fill with back wall" would close off: the selected cave, or
 * every cave in the selected terrain blocks, as { block, boundary } pairs.
 * Caves that already have a back wall in their exact shape are left out.
 */
export function selectedCaves() {
  const existing = new Set(
    blocks()
      .filter(isBackWall)
      .map((block) => outlineKey(block.outer)),
  );
  return allSelectedCaves().filter(
    ({ boundary }) => !existing.has(outlineKey(boundary)),
  );
}

function allSelectedCaves() {
  const selection = editor.selection;
  if (selection?.kind === "blockBoundary") {
    const block = blocks()[selection.blockIndex];
    const entry = block && boundaryEntries(block)[selection.boundaryIndex];
    return entry && entry.hole >= 0 && !isBackWall(block)
      ? [{ block, boundary: entry.boundary }]
      : [];
  }
  if (selection?.kind !== "block" && selection?.kind !== "items") return [];
  return selectedBlocks()
    .map((index) => blocks()[index])
    .filter((block) => block && !isBackWall(block))
    .flatMap((block) => block.inner.map((boundary) => ({ block, boundary })));
}

const outlineKey = (boundary) =>
  boundary.nodes
    .map((node) => `${Math.round(node.x)},${Math.round(node.y)}`)
    .sort()
    .join(" ");

/**
 * Puts a back wall in the exact shape of each selected cave, in the cave's
 * material, so the cave stays dark. Returns how many were added.
 */
export function fillCavesWithBackWalls() {
  if (refuseEdit()) return 0;
  const caves = selectedCaves();
  if (!caves.length) return 0;
  pushHistory();
  const walls = caves.map(({ block, boundary }) =>
    freshBlockCopy({
      material: block.material,
      layer: "back",
      outer: boundary,
      inner: [],
    }),
  );
  const first = blocks().length;
  editor.trail.terrainBlocks = [...blocks(), ...walls];
  editor.selection = blocksSelection(walls.map((_, index) => first + index));
  return walls.length;
}
