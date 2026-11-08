// Mirroring a selection with blocks in it, and changing what is drawn on top.
// A mirror carries apples, props, spikes, water, the start and the finish
// across with the blocks, as a rotation does. Order is the order of the
// trail's lists: a later block or prop is drawn over an earlier one, so
// bringing something to the front moves it to the end of its list.
import { canFlip } from "../drawing.js";
import { mirrorBlock } from "../terrain-geometry.js";
import { normalizeRotation } from "../trail-schema.js";
import { blocks, replaceBlock, selectedBlocks } from "./blocks.js";
import { pushHistory } from "./history.js";
import { syncInspector } from "./inspector.js";
import { render } from "./render.js";
import { OBJECT_LISTS, selectionBox, selectionItems } from "./selection.js";
import { editor } from "./state.js";
import { refuseEdit } from "./status.js";

const round = (value) => Math.round(value * 100) / 100;

/** The selected items when the selection has a whole block in it, or null. */
function mirrorTargets() {
  const kind = editor.selection?.kind;
  if (kind !== "block" && kind !== "items") return null;
  const items = selectionItems();
  return items.some((item) => item.type === "block" && blocks()[item.index]) ? items : null;
}

/** Can the selection be mirrored? Props alone flip in place instead. */
export const canMirrorSelection = () => mirrorTargets() !== null;

/**
 * Mirror the selection across the middle of its box, left to right or top to
 * bottom, as one undo step. Returns whether anything was mirrored.
 */
export function mirrorSelection(horizontal) {
  const items = mirrorTargets();
  const box = items && selectionBox();
  if (!box || refuseEdit()) return false;
  const px = (box.left + box.right) / 2,
    py = (box.top + box.bottom) / 2;
  const across = (value, pivot) => round(2 * pivot - value);
  pushHistory();
  for (const item of items) {
    if (item.type === "block") {
      const block = blocks()[item.index];
      if (block) replaceBlock(item.index, mirrorBlock(block, px, py, horizontal));
      continue;
    }
    const object =
      item.type === "start" || item.type === "finish"
        ? editor.trail[item.type]
        : OBJECT_LISTS()[item.type]?.[item.index];
    if (!object) continue;
    if (item.type === "water") {
      // Water is kept by its top-left corner, so the far side lands there.
      if (horizontal) object.x = across(object.x + object.width, px);
      else object.y = across(object.y + object.depth, py);
      continue;
    }
    if (horizontal) {
      object.x = across(object.x, px);
      if (item.type === "start") object.facing = object.facing < 0 ? 1 : -1;
      if (item.type === "prop") {
        if (canFlip(object.type)) {
          if (object.flip) delete object.flip;
          else object.flip = true;
        }
        const rotation = normalizeRotation(-(object.rotation || 0));
        if (rotation === undefined) delete object.rotation;
        else object.rotation = rotation;
      }
    } else if (Number.isFinite(object.y)) {
      // Something standing on the ground stays on it, wherever the ground goes.
      object.y = across(object.y, py);
    }
  }
  syncInspector();
  render();
  return true;
}

/** The selected blocks and props, by list, as index sets. */
function orderTargets() {
  const selection = editor.selection;
  const props = new Set();
  // A point, edge or ring of a block orders its whole block.
  const chosen = new Set(
    Number.isInteger(selection?.blockIndex) ? [selection.blockIndex] : selectedBlocks(),
  );
  if (selection?.kind === "prop") props.add(selection.index);
  if (selection?.kind === "items")
    for (const item of selection.items) if (item.type === "prop") props.add(item.index);
  return { blocks: chosen, props };
}

/** Can anything selected be brought to the front or sent to the back? */
export function canOrderSelection() {
  const { blocks: chosen, props } = orderTargets();
  return chosen.size > 0 || props.size > 0;
}

/**
 * The list with the chosen entries moved to its end (`front`) or start, each
 * keeping its order among the others, and where every old index went.
 */
function reordered(list, chosen, front) {
  const indices = list.map((_, index) => index);
  const picked = indices.filter((index) => chosen.has(index));
  const rest = indices.filter((index) => !chosen.has(index));
  const order = front ? [...rest, ...picked] : [...picked, ...rest];
  const moved = new Map(order.map((old, index) => [old, index]));
  return { list: order.map((old) => list[old]), moved, changed: order.some((old, index) => old !== index) };
}

/**
 * Bring the selected blocks and props in front of the others of their kind,
 * or send them behind, as one undo step. Which layer they are on still
 * decides what is drawn over what between kinds. Returns whether anything moved.
 */
export function orderSelection(front) {
  const { blocks: chosen, props } = orderTargets();
  if (!chosen.size && !props.size) return false;
  if (refuseEdit()) return false;
  const blockOrder = reordered(blocks(), chosen, front);
  const propOrder = reordered(editor.trail.props, props, front);
  if (!blockOrder.changed && !propOrder.changed) return false;
  pushHistory();
  // New arrays, so the renderers see the lists have changed.
  editor.trail.terrainBlocks = blockOrder.list;
  editor.trail.props = propOrder.list;
  const selection = editor.selection;
  const block = (index) => blockOrder.moved.get(index);
  const prop = (index) => propOrder.moved.get(index);
  editor.selection =
    selection.kind === "items"
      ? {
          ...selection,
          items: selection.items.map((item) =>
            item.type === "block"
              ? { ...item, index: block(item.index) }
              : item.type === "prop"
                ? { ...item, index: prop(item.index) }
                : item.type === "point"
                  ? { ...item, blockIndex: block(item.blockIndex) }
                  : item,
          ),
        }
      : Number.isInteger(selection.blockIndex)
        ? { ...selection, blockIndex: block(selection.blockIndex) }
        : selection.kind === "prop"
          ? { ...selection, index: prop(selection.index) }
          : selection;
  syncInspector();
  render();
  return true;
}
