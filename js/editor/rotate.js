// Rotating the selection. A round handle above it turns blocks, block points
// and props, and carries apples, spikes, water, the start and the finish round
// with them, keeping their own shape and settings. A single prop turns about
// its anchor; anything else about the middle of the selection. R and Shift+R
// turn it a step at a time.
import { canRotate } from "../drawing.js";
import { rotateBlock, rotatePoint } from "../terrain-geometry.js";
import { normalizeRotation } from "../trail-schema.js";
import { blocks, boundaryAt, replaceBlock } from "./blocks.js";
import { pushHistory } from "./history.js";
import { syncInspector } from "./inspector.js";
import { objectY, render } from "./render.js";
import { scaleFrame } from "./scale.js";
import {
  OBJECT_LISTS,
  blockNodes,
  itemPosition,
  selectionItems,
} from "./selection.js";
import { HIT_REACH, editor } from "./state.js";
import { refuseEdit } from "./status.js";
import { saveToolSettings, toolSettings } from "./tools.js";
import { moveWaterTo } from "./water.js";

// Degrees a Shift-drag snaps to and R turns by.
export const ROTATE_STEP = 15;
// Screen pixels the handle can be grabbed from, its distance above the
// selection, and the box padding, which matches the scale frame.
const HIT = 7;
const STALK = 28;
const PROP_STALK = 56;
const PAD = HIT + HIT_REACH + 1;
const DEG = Math.PI / 180;

let active = null;

const round = (value) => Math.round(value * 100) / 100;

/** The box around some items' points, curve handles and positions. */
function boxOf(items) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const add = ([x, y]) => {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  };
  const addNode = (node) =>
    [[node.x, node.y], node.in, node.out].filter(Boolean).forEach(add);
  for (const item of items) {
    if (item.type === "block") {
      const block = blocks()[item.index];
      if (block) blockNodes(block).forEach(addNode);
    } else if (item.type === "point") {
      const node = boundaryAt(item)?.nodes[item.index];
      if (node) addNode(node);
    } else {
      const position = itemPosition(item);
      if (position) add(position);
    }
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

/**
 * What a rotation acts on: the selected items and the point they turn about,
 * or null. A lone prop that can turn turns about its anchor. A lone apple,
 * spike, point or the like has nothing to turn, and water only moves.
 */
function target() {
  const items = selectionItems();
  if (!items.length || items.every((item) => item.type === "water")) return null;
  if (items.length === 1) {
    const [item] = items;
    if (item.type === "prop") {
      const prop = editor.trail.props[item.index];
      if (!prop || !canRotate(prop.type)) return null;
      return { items, prop, pivot: [prop.x, objectY(prop)] };
    }
    if (item.type !== "block" || !blocks()[item.index]) return null;
  }
  const box = boxOf(items);
  if (!box) return null;
  return {
    items,
    box,
    pivot: [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
  };
}

/** Can the selection be rotated? */
export const canRotateSelection = () => target() !== null;

/** Everything a rotation starts from, so each update turns the originals. */
function capture(items) {
  return items.map((item) => {
    if (item.type === "block") return blocks()[item.index] || null;
    if (item.type === "point") {
      const node = boundaryAt(item)?.nodes[item.index];
      return node && {
        x: node.x,
        y: node.y,
        in: node.in && [...node.in],
        out: node.out && [...node.out],
      };
    }
    const position = itemPosition(item);
    if (!position) return null;
    if (item.type === "prop")
      return { position, rotation: editor.trail.props[item.index]?.rotation || 0 };
    return { position };
  });
}

/** Turn the captured items by `degrees`, clockwise, about the pivot. */
function apply({ items, pivot, originals }, degrees) {
  const angle = degrees * DEG;
  const [px, py] = pivot;
  const turn = ([x, y]) => rotatePoint(x, y, px, py, angle).map(round);
  // A lone prop turns where it stands, keeping a ground anchor if it has one.
  const moves = items.length > 1;
  items.forEach((item, i) => {
    const original = originals[i];
    if (!original) return;
    if (item.type === "block") {
      replaceBlock(item.index, rotateBlock(original, px, py, angle));
      return;
    }
    if (item.type === "point") {
      const node = boundaryAt(item)?.nodes[item.index];
      if (!node) return;
      [node.x, node.y] = turn([original.x, original.y]);
      node.in = original.in ? turn(original.in) : null;
      node.out = original.out ? turn(original.out) : null;
      return;
    }
    // Like dragging a group, this fixes a ground-anchored object's height.
    const [x, y] = turn(original.position);
    if (item.type === "start" || item.type === "finish") {
      editor.trail[item.type].x = x;
      editor.trail[item.type].y = y;
      return;
    }
    const object = OBJECT_LISTS()[item.type][item.index];
    if (!object) return;
    if (item.type === "water") {
      moveWaterTo(object, x, y);
      return;
    }
    if (moves) {
      object.x = x;
      object.y = y;
    }
    if (item.type === "prop" && canRotate(object.type)) {
      const rotation = normalizeRotation(original.rotation + degrees);
      if (rotation === undefined) delete object.rotation;
      else object.rotation = rotation;
    }
  });
}

/**
 * Turn the selection by `degrees`, clockwise, as one undo step; with the Prop
 * tool, turn the next prop instead. Returns whether anything turned.
 */
export function rotateSelection(degrees) {
  if (refuseEdit()) return;
  if (editor.tool === "prop") {
    toolSettings.prop.rotation =
      normalizeRotation((Number(toolSettings.prop.rotation) || 0) + degrees) ?? 0;
    saveToolSettings();
    render();
    return true;
  }
  return rotateSelected(degrees);
}

/** Turn the selection by `degrees`, clockwise, as one undo step. */
export function rotateSelected(degrees) {
  const found = target();
  if (!found) return false;
  pushHistory();
  apply({ ...found, originals: capture(found.items) }, degrees);
  syncInspector();
  render();
  return true;
}

/**
 * The rotate handle, in world units: `from` is where its stalk starts and
 * (x, y) the knob. A lone prop's stands up from its anchor along the prop, so
 * it shows the prop's angle; a selection's stands above its box and turns with
 * it while it is dragged.
 */
export function rotateHandle() {
  if (editor.tool !== "select" || editor.pendingShape || editor.readOnly) return null;
  if (active) {
    const [px, py] = active.pivot;
    const turn = ({ x, y }) => {
      const [tx, ty] = rotatePoint(x, y, px, py, active.degrees * DEG);
      return { x: tx, y: ty };
    };
    const knob = turn(active.handle);
    return { from: turn(active.handle.from), x: knob.x, y: knob.y };
  }
  const found = target();
  if (!found) return null;
  if (found.prop) {
    const angle = (found.prop.rotation || 0) * DEG;
    const [px, py] = found.pivot;
    const length = PROP_STALK / editor.zoom;
    return {
      from: { x: px, y: py },
      x: px + Math.sin(angle) * length,
      y: py - Math.cos(angle) * length,
    };
  }
  const pad = PAD / editor.zoom;
  const frame = scaleFrame()?.frame || {
    left: found.box.left - pad,
    top: found.box.top - pad,
    right: found.box.right + pad,
  };
  const x = (frame.left + frame.right) / 2;
  return { from: { x, y: frame.top }, x, y: frame.top - STALK / editor.zoom };
}

/** Is the rotate handle under a world point? */
export function rotateHandleAt(point) {
  const handle = rotateHandle();
  return Boolean(
    handle &&
      Math.hypot(point.x - handle.x, point.y - handle.y) <= HIT / editor.zoom,
  );
}

export const rotating = () => active !== null;

/** How far the current drag has turned, in degrees, or null. */
export const rotationAngle = () => (active ? active.degrees : null);

/** Start turning from the handle; `before` becomes the undo step once something changes. */
export function startRotate(point, before) {
  const found = target();
  const handle = rotateHandle();
  if (!found || !handle) return false;
  active = {
    ...found,
    originals: capture(found.items),
    handle,
    start: point,
    before,
    degrees: 0,
    moved: false,
  };
  return true;
}

const snapDegrees = (degrees) => Math.round(degrees / ROTATE_STEP) * ROTATE_STEP;

/**
 * Turn to where the pointer is. Shift snaps to 15°: a lone prop's own angle,
 * or else how far the selection has turned. Returns the undo snapshot the
 * first time anything changes, so the caller can push it.
 */
export function updateRotate(point, { shift = false } = {}) {
  if (!active) return null;
  const [px, py] = active.pivot;
  const from = Math.atan2(active.start.y - py, active.start.x - px);
  const to = Math.atan2(point.y - py, point.x - px);
  let degrees = normalizeRotation((to - from) / DEG) ?? 0;
  if (shift) {
    const base = active.prop ? active.originals[0]?.rotation || 0 : 0;
    degrees = snapDegrees(base + degrees) - base;
  }
  active.degrees = degrees;
  apply(active, degrees);
  if (active.moved) return null;
  active.moved = true;
  return active.before;
}

export function endRotate() {
  active = null;
}
