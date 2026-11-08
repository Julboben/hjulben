// Snapping while something is dragged, the way Figma does it: what moves lines
// up with the edges, middles and points of other things, or with the grid,
// once it comes within a few pixels of one, and otherwise follows the pointer
// exactly. Holding Cmd/Ctrl mid-drag moves freely, and N turns it off.
import { store } from "../local-store.js";
import { flattenBoundary, isCurvedEdge } from "../terrain-geometry.js";
import { blocks, boundariesOf, boundaryAt, selectedBlocks } from "./blocks.js";
import { selectedPosition } from "./inspector.js";
import { OBJECT_LISTS, itemPosition, sameItem, selectionBox, selectionItems } from "./selection.js";
import { SNAP_DISTANCE, gridSpacing, snapAxis } from "./snap.js";
import { editor } from "./state.js";
import { viewportSize } from "./view.js";

const OFF_KEY = "hjulben-editor-snapping";
let on = null;

/** Is snapping on? It is unless the author has turned it off (N). */
export function snappingOn() {
  if (on === null) {
    try {
      on = store().getItem(OFF_KEY) !== "off";
    } catch (_) {
      on = true;
    }
  }
  return on;
}

/** Turn snapping on or off, remembered for next time. */
export function setSnapping(value) {
  on = Boolean(value);
  try {
    if (on) store().removeItem(OFF_KEY);
    else store().setItem(OFF_KEY, "off");
  } catch (_) {
    // Blocked storage: the choice holds until the page reloads.
  }
  return on;
}

// A line something can snap along: `at` is where it crosses its axis (an x
// for a vertical line), and `lo` to `hi` how far it reaches along the other,
// so a guide can be drawn between the things it lines up.
const pointLines = ([x, y]) => ({
  xs: [{ at: x, lo: y, hi: y }],
  ys: [{ at: y, lo: x, hi: x }],
});

/** A box's two edges and its middle, each way. */
function boxLines({ left, top, right, bottom }) {
  return {
    xs: [left, (left + right) / 2, right].map((at) => ({ at, lo: top, hi: bottom })),
    ys: [top, (top + bottom) / 2, bottom].map((at) => ({ at, lo: left, hi: right })),
  };
}

function boxOf(points) {
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function join(into, lines) {
  into.xs.push(...lines.xs);
  into.ys.push(...lines.ys);
}

/**
 * What a drag of the current selection snaps by, and what it snaps to. Taken
 * when the drag starts, so the selection's own old place is never a target.
 * A point, a curve handle or a straight edge snaps by its points; anything
 * bigger by its box, as Figma snaps a frame by its edges and middle.
 */
export function snapLines() {
  const selection = editor.selection;
  const moving = { xs: [], ys: [] };
  const movingNodes = new Set();
  const kind = selection?.kind;
  const boundary = kind?.startsWith("block") && kind !== "block" ? boundaryAt(selection) : null;
  if (kind === "blockPoint" || kind === "blockHandle") {
    const at = selectedPosition();
    if (at) join(moving, pointLines(at));
    if (kind === "blockPoint" && boundary) movingNodes.add(boundary.nodes[selection.index]);
  } else if (kind === "blockEdge" && boundary) {
    const node = boundary.nodes[selection.index];
    const next = boundary.nodes[(selection.index + 1) % boundary.nodes.length];
    // A curved edge bends rather than moving its points, so only the spot
    // that was grabbed moves with the pointer.
    if (isCurvedEdge(node, next)) join(moving, pointLines(selectedPosition()));
    else
      for (const end of [node, next]) {
        join(moving, pointLines([end.x, end.y]));
        movingNodes.add(end);
      }
  } else if (kind === "blockBoundary" && boundary) {
    join(moving, boxLines(boxOf(flattenBoundary(boundary).points)));
    boundary.nodes.forEach((node) => movingNodes.add(node));
  } else {
    const box = selectionBox();
    if (box) join(moving, boxLines(box));
  }
  const items = selectionItems();
  for (const item of items)
    if (item.type === "point") {
      const node = boundaryAt(item)?.nodes[item.index];
      if (node) movingNodes.add(node);
    }
  const wholeBlocks = new Set(kind === "block" || kind === "items" ? selectedBlocks() : []);
  return { moving, targets: targetLines(wholeBlocks, movingNodes, items) };
}

/**
 * The lines of everything in view that is staying put: each block's box and
 * points, and each object where it stands, or water by its rectangle. Only
 * what can be seen snaps, so nothing pulls from off screen.
 */
function targetLines(wholeBlocks, movingNodes, movingItems) {
  const { width, height } = viewportSize();
  const view = {
    left: editor.cameraX,
    top: editor.cameraY,
    right: editor.cameraX + width / editor.zoom,
    bottom: editor.cameraY + height / editor.zoom,
  };
  const seen = ([x, y]) => x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  const overlaps = (box) =>
    box.left <= view.right && box.right >= view.left && box.top <= view.bottom && box.bottom >= view.top;
  const targets = { xs: [], ys: [] };
  blocks().forEach((block, index) => {
    if (wholeBlocks.has(index)) return;
    const box = boxOf(flattenBoundary(block.outer).points);
    if (!overlaps(box)) return;
    const nodes = boundariesOf(block).flatMap((boundary) => boundary.nodes);
    // A block whose own points are moving has no settled box yet.
    if (!nodes.some((node) => movingNodes.has(node))) join(targets, boxLines(box));
    for (const node of nodes)
      if (!movingNodes.has(node) && seen([node.x, node.y])) join(targets, pointLines([node.x, node.y]));
  });
  const staying = (item) => !movingItems.some((other) => sameItem(other, item));
  for (const [type, list] of Object.entries(OBJECT_LISTS()))
    list.forEach((object, index) => {
      const item = { type, index };
      if (!object || !staying(item)) return;
      if (type === "water") {
        const box = { left: object.x, top: object.y, right: object.x + object.width, bottom: object.y + object.depth };
        if (overlaps(box)) join(targets, boxLines(box));
        return;
      }
      const at = itemPosition(item);
      if (at && seen(at)) join(targets, pointLines(at));
    });
  for (const type of ["start", "finish"]) {
    const at = staying({ type }) && itemPosition({ type });
    if (at && seen(at)) join(targets, pointLines(at));
  }
  return targets;
}

/**
 * Snap a move of the dragged selection by (dx, dy), on the axes allowed. It
 * returns the adjusted move, and the guides to draw: a line along each axis
 * that lined up with something, reaching from the selection to that thing.
 * The grid needs no guide, since its lines are already drawn.
 */
export function snapMove(lines, dx, dy, axes = { x: true, y: true }) {
  const threshold = SNAP_DISTANCE / editor.zoom;
  const spacing = gridSpacing(editor.zoom);
  const along = (allowed, delta, moving, targets) =>
    allowed
      ? snapAxis(delta, moving.map((line) => line.at), targets.map((line) => line.at), threshold, spacing)
      : { delta, at: null, grid: false };
  const x = along(axes.x, dx, lines.moving.xs, lines.targets.xs);
  const y = along(axes.y, dy, lines.moving.ys, lines.targets.ys);
  const guides = [];
  const guide = (axis, snapped, moving, targets, across) => {
    if (snapped.at === null || snapped.grid) return;
    const near = (value) => Math.abs(value - snapped.at) < 1e-6;
    const spans = [
      ...moving.filter((line) => near(line.at + snapped.delta)).map((line) => [line.lo + across, line.hi + across]),
      ...targets.filter((line) => near(line.at)).map((line) => [line.lo, line.hi]),
    ];
    guides.push({
      axis,
      at: snapped.at,
      from: Math.min(...spans.map(([lo]) => lo)),
      to: Math.max(...spans.map(([, hi]) => hi)),
    });
  };
  guide("x", x, lines.moving.xs, lines.targets.xs, y.delta);
  guide("y", y, lines.moving.ys, lines.targets.ys, x.delta);
  return { dx: x.delta, dy: y.delta, guides };
}
