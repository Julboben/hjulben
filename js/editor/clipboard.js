// Copy, cut and paste, including between trails.
import { moveBlock, normalizeBlock } from "../terrain-geometry.js";
import { normalizeTrail } from "../trail-schema.js";
import {
  blocks,
  boundaryEntries,
  freshBlockCopy,
  selectedBlocks,
} from "./blocks.js";
import { canvas } from "./dom.js";
import { pushHistory } from "./history.js";
import { syncInspector } from "./inspector.js";
import { playtestOpen } from "./playtest.js";
import { groundY, render, restingY, syncTerrain } from "./render.js";
import {
  OBJECT_LISTS,
  blockNodes,
  deleteItems,
  itemPosition,
  makeSelection,
  selectionItems,
} from "./selection.js";
import { editor } from "./state.js";
import { refuseEdit, showStatus } from "./status.js";
import { setTool } from "./tools.js";
import { pointerWorld, viewportSize } from "./view.js";

// ---- Copy, cut and paste --------------------------------------------------
// The clipboard holds plain JSON, so a copy can be pasted into another trail,
// another tab or a later session.

const CLIPBOARD_FORMAT = "hjulben-editor-clipboard-v1";

const CLIPBOARD_LISTS = {
  apple: "apples",
  prop: "props",
  spike: "spikes",
  water: "water",
};

/**
 * What the selection copies: whole blocks, apples, props, spikes and water. A block
 * whose every point is selected counts as the whole block; loose points,
 * handles, the start and the finish aren't copied.
 */
function copyableSelection() {
  const items = selectionItems();
  const blockIndices = new Set(
    editor.selection?.kind === "block" || editor.selection?.kind === "items"
      ? selectedBlocks()
      : [],
  );
  const points = items.filter((item) => item.type === "point");
  blocks().forEach((block, blockIndex) => {
    const total = blockNodes(block).length;
    const picked = points.filter((point) => point.blockIndex === blockIndex);
    if (total && picked.length >= total) blockIndices.add(blockIndex);
  });
  return {
    blockIndices: [...blockIndices].sort((a, b) => a - b),
    objects: items.filter((item) => CLIPBOARD_LISTS[item.type]),
  };
}

function describeCopy({ blocks: copiedBlocks, apples, props, spikes, water = [] }) {
  return [
    [copiedBlocks.length, "block"],
    [apples.length, "apple"],
    [props.length, "prop"],
    [spikes.length, "spike"],
    [water.length, "water body", "water bodies"],
  ]
    .filter(([count]) => count)
    .map(
      ([count, name, plural = `${name}s`]) =>
        `${count} ${count === 1 ? name : plural}`,
    )
    .join(", ");
}

/** The clipboard payload for a copyable selection, or null when it's empty. */
function clipboardPayload({ blockIndices, objects }) {
  if (!blockIndices.length && !objects.length) return null;
  const payload = { format: CLIPBOARD_FORMAT, centre: [0, 0], blocks: [] };
  for (const list of Object.values(CLIPBOARD_LISTS)) payload[list] = [];
  const xs = [],
    ys = [];
  for (const index of blockIndices) {
    const block = blocks()[index];
    payload.blocks.push(structuredClone(block));
    for (const { boundary } of boundaryEntries(block))
      for (const node of boundary.nodes) {
        xs.push(node.x);
        ys.push(node.y);
      }
  }
  for (const item of objects) {
    const object = OBJECT_LISTS()[item.type][item.index];
    if (!object) continue;
    const copy = structuredClone(object);
    // A ground-anchored object remembers the floor it stood on, so a paste
    // into a cave can keep it on the cave floor.
    if (!Number.isFinite(object.y)) copy.floorY = groundY(object.x);
    payload[CLIPBOARD_LISTS[item.type]].push(copy);
    const [x, y] = itemPosition(item);
    xs.push(x);
    ys.push(y);
  }
  // The middle of the copied area lands under the cursor on paste.
  payload.centre = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  return payload;
}

/**
 * The clipboard's payload, normalized as a trail file would be, so a hand-made
 * or damaged payload can't put malformed blocks or objects in the trail.
 * Null when the text isn't ours at all; throws when it is but can't be read.
 */
function readClipboard(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data?.format !== CLIPBOARD_FORMAT) return null;
  if (!data.centre?.every?.(Number.isFinite) || data.centre.length !== 2)
    throw new Error("no centre");
  const lists = ["blocks", ...Object.values(CLIPBOARD_LISTS)];
  if (!lists.every((list) => Array.isArray(data[list]))) throw new Error("no lists");
  for (const list of lists)
    if (!data[list].every((item) => item && typeof item === "object")) throw new Error("bad item");
  const blocks = data.blocks.map((block) => normalizeBlock(block));
  // The objects go through the same normalizers as a trail's, on a trail
  // made of them; each keeps the floor it was copied from, which the
  // normalizers don't know about.
  const objects = normalizeTrail({
    name: "clipboard",
    terrainBlocks: blocks,
    apples: data.apples,
    props: data.props,
    spikes: data.spikes,
    water: data.water,
  });
  const withFloors = (list) =>
    objects[list].map((object, index) => {
      const floorY = data[list][index]?.floorY;
      return Number.isFinite(floorY) ? { ...object, floorY } : object;
    });
  return {
    format: CLIPBOARD_FORMAT,
    centre: [Number(data.centre[0]), Number(data.centre[1])],
    blocks,
    apples: withFloors("apples"),
    props: withFloors("props"),
    spikes: withFloors("spikes"),
    water: withFloors("water"),
  };
}

/** Under the cursor when it's over the canvas, else the middle of the view. */
function pastePoint() {
  if (editor.pointerClient) return pointerWorld(editor.pointerClient);
  const { width, height } = viewportSize();
  return { x: editor.cameraX + width / 2 / editor.zoom, y: editor.cameraY + height / 2 / editor.zoom };
}

function pasteClipboard(data) {
  const target = pastePoint();
  const dx = Math.round(target.x - data.centre[0]);
  const dy = Math.round(target.y - data.centre[1]);
  const pastedBlocks = data.blocks
    .map((block) => freshBlockCopy(moveBlock(block, dx, dy)))
    .filter(Boolean);
  // Ground-anchored objects (no y) stay anchored, to the ground where they land.
  const pastedObjects = Object.entries(CLIPBOARD_LISTS).flatMap(
    ([type, list]) =>
      data[list]
        .filter((object) => Number.isFinite(object?.x))
        .map(({ floorY, ...object }) => ({
          type,
          floorY: Number.isFinite(floorY) ? floorY + dy : null,
          object: {
            ...structuredClone(object),
            x: object.x + dx,
            y: Number.isFinite(object.y) ? object.y + dy : null,
          },
        })),
  );
  if (!pastedBlocks.length && !pastedObjects.length) return;
  pushHistory();
  const firstBlock = blocks().length;
  editor.trail.terrainBlocks = [...blocks(), ...pastedBlocks];
  const items = pastedBlocks.map((_, i) => ({
    type: "block",
    index: firstBlock + i,
  }));
  syncTerrain();
  for (const { type, object, floorY } of pastedObjects) {
    // Pasted under a roof or into a cave, it stays on the floor it lands on
    // instead of jumping onto the top.
    if (object.y === null && floorY !== null) {
      const y = restingY(object.x, floorY);
      if (y !== null) object.y = type === "apple" ? y - 60 : y;
    }
    const list = OBJECT_LISTS()[type];
    list.push(object);
    items.push({ type, index: list.length - 1 });
  }
  editor.selection = makeSelection(items);
  setTool("select");
  syncInspector();
  render();
  showStatus("info", `Pasted ${describeCopy(data)}.`);
}

export function typingInField() {
  const active = document.activeElement;
  return (
    active?.tagName === "TEXTAREA" ||
    (active?.tagName === "INPUT" &&
      !["checkbox", "radio", "button", "range", "color"].includes(
        active.type,
      )) ||
    Boolean(active?.isContentEditable)
  );
}

/** Copy and paste belong to the editor unless a text field or text selection has them. */
function clipboardIsOurs() {
  return (
    !playtestOpen() && !typingInField() && !document.getSelection()?.toString()
  );
}

function copyToClipboard(event, cut) {
  if (!clipboardIsOurs() || !editor.selection) return;
  event.preventDefault();
  const copied = copyableSelection();
  const payload = clipboardPayload(copied);
  if (!payload) {
    showStatus(
      "warning",
      "Nothing to copy: points, the start and the finish can't be copied.",
    );
    return;
  }
  event.clipboardData.setData("text/plain", JSON.stringify(payload));
  if (cut && refuseEdit()) return;
  if (cut) {
    pushHistory();
    deleteItems(copied.objects);
    const removed = new Set(copied.blockIndices);
    editor.trail.terrainBlocks = blocks().filter((_, index) => !removed.has(index));
    editor.selection = null;
    syncInspector();
    render();
  }
  showStatus("info", `${cut ? "Cut" : "Copied"} ${describeCopy(payload)}.`);
}

export function bindClipboard() {
  document.addEventListener("copy", (event) => copyToClipboard(event, false));

  document.addEventListener("cut", (event) => copyToClipboard(event, true));

  document.addEventListener("paste", (event) => {
    if (!clipboardIsOurs()) return;
    let data;
    try {
      data = readClipboard(event.clipboardData?.getData("text/plain") || "");
    } catch (_) {
      event.preventDefault();
      showStatus("warning", "Clipboard data is not a trail selection.");
      return;
    }
    if (!data) return;
    event.preventDefault();
    if (refuseEdit()) return;
    pasteClipboard(data);
    canvas.focus({ preventScroll: true });
  });
}
