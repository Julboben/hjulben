// Pointer, gesture and keyboard handling on the canvas.
import {
  addAt,
  blocks,
  boundaryAt,
  commitShape,
  insertBlockNode,
  selectedBlocks,
  updateShapePoints,
} from "./blocks.js";
import { isCurvedEdge } from "../terrain-geometry.js";
import { updatePromptOpen } from "../update-prompt.js";
import { typingInField } from "./clipboard.js";
import { $, canvas } from "./dom.js";
import { pushHistory, redo, restore, snapshot, undo, updateHistoryButtons } from "./history.js";
import { hitStack, hitTest, sameHit } from "./hit-test.js";
import {
  endScale,
  scaleCursor,
  scaleHandleAt,
  scaling,
  startScale,
  updateScale,
} from "./scale.js";
import {
  ROTATE_STEP,
  endRotate,
  rotateHandleAt,
  rotateSelection,
  rotating,
  startRotate,
  updateRotate,
} from "./rotate.js";
import {
  flushInspector,
  selectedPosition,
  syncInspector,
  updateSelectedPosition,
} from "./inspector.js";
import { closePlaytest, openPlaytest, playtestOpen } from "./playtest.js";
import { openQuickPick } from "./quick-pick.js";
import { render, renderView, startY } from "./render.js";
import {
  blockNodes,
  cyclePropType,
  deleteSelection,
  duplicateTarget,
  finishMarquee,
  inGroup,
  itemFromHit,
  itemPosition,
  makeSelection,
  nudgeSelection,
  sameItem,
  selectAll,
  selectionItems,
  toggleFlip,
} from "./selection.js";
import { gridSpacing, lockDirection, snapToAngleAndGrid } from "./snap.js";
import { setSnapping, snapLines, snapMove, snappingOn } from "./magnet.js";
import { mirrorSelection, orderSelection } from "./arrange.js";
import { toggleMinimap } from "./minimap.js";
import {
  enterGroup,
  groupOf,
  groupSelection,
  insideGroup,
  leaveGroup,
  selectionForHit,
  ungroupSelection,
  withWholeGroups,
} from "./groups.js";
import { clampZoom, editor } from "./state.js";
import { NOTICE_TIME, refuseEdit, refuseReadOnly, showStatus } from "./status.js";
import { PLACING_TOOLS, TOOL_KEYS, setTool, toolSettings } from "./tools.js";
import { groupLabel, isGroupLocked, toolGroup } from "./locks.js";
import { commitWater } from "./water.js";
import {
  beginPreviewDrag,
  draggingPreview,
  editingPreview,
  endPreviewDrag,
  movePreviewDrag,
  stopEditingPreview,
} from "./preview.js";
import { canSave, saveDraft, saveTrail } from "./trails.js";
import {
  clampCamera,
  fitTrail,
  focusOnStart,
  pointerWorld,
  toggleGameArt,
  updateZoom,
  zoomAtCenter,
} from "./view.js";

let dragging = false;

let panning = false;

let pointerStart = null;

let gestureStartZoom = 1;

let gestureAnchor = null;

// Every pointer that is down on the canvas, by id, so a second finger can be
// told from the first: only the primary pointer draws, drags or selects, and
// two fingers together pinch to zoom and pan instead.
const pointers = new Map();

// The pinch in progress: the fingers' starting distance, the zoom then, and
// the world point under their midpoint, which stays under it as they move.
let pinch = null;

// Once a pinch ends, the finger still down must not start a drag or a shape.
let pinchEnded = false;

/** Both fingers' midpoint and distance, in client pixels. */
function pinchGeometry() {
  const [a, b] = [...pointers.values()];
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2,
    distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
  };
}

function startPinch() {
  const geometry = pinchGeometry();
  pinch = {
    distance: geometry.distance,
    zoom: editor.zoom,
    anchor: pointerWorld(geometry),
  };
}

/** Zoom by how far the fingers have spread, keeping the midpoint's world point under them. */
function movePinch() {
  if (!pinch || pointers.size < 2) return;
  const geometry = pinchGeometry();
  editor.zoom = clampZoom((pinch.zoom * geometry.distance) / pinch.distance);
  const bounds = canvas.getBoundingClientRect();
  editor.cameraX = pinch.anchor.x - (geometry.clientX - bounds.left) / editor.zoom;
  editor.cameraY = pinch.anchor.y - (geometry.clientY - bounds.top) / editor.zoom;
  updateZoom();
}

// The trail as it was when a drag began. It becomes an undo step only once the
// drag actually moves something, so a plain click never leaves an empty one.
let dragSnapshot = null;

let dragOrigin = null;

let lastDragPointer = null;
// Cmd/Ctrl held mid-drag: the selection follows the pointer without snapping.
let dragFree = false;

// A drag of something that can be copied, so Alt can switch it between moving
// the original and moving a copy at any point in the drag: the trail before
// the drag, what was grabbed and where, what the original drag moves, and
// whether a copy is following the mouse now. Null for drags that can't be.
let dragCopyable = null;

let pendingKind = null;
// Pressing a selected item that shares its spot with others: a click without
// a drag moves the selection on to this next one.
let cycleNext = null;

// How far, in screen pixels, a press must move before it drags or scales, so
// the wobble of a click or double-click moves nothing.
const DRAG_SLOP = 3;

// Where a press that may become a drag or scale began, until it has moved
// further than DRAG_SLOP.
let pressClient = null;

// An Escape this soon after the one before is part of a run of presses.
const ESCAPE_RUN = 500;
let lastEscape = -Infinity;
// When Escape last asked to leave the editor.
let leaveAsked = -Infinity;

/** Back out one step: an unfinished shape, then the group, then the selection, then the tool. */
function backOut() {
  if (cancelPendingShape()) return true;
  if (editor.tool !== "select") setTool("select");
  else if (leaveGroup()) syncInspector();
  else if (editor.selection) {
    editor.selection = null;
    syncInspector();
  } else return false;
  render();
  return true;
}

/**
 * Escape backs out one step. With nothing left to back out of it asks, and
 * another press while the question shows leaves the editor; the trail is
 * autosaved, so leaving loses nothing but the undo history. A press in a run
 * of them never asks, so pressing Escape a few times to deselect stays here.
 */
function escape() {
  const now = performance.now();
  const inRun = now - lastEscape < ESCAPE_RUN;
  lastEscape = now;
  if (backOut()) {
    leaveAsked = -Infinity;
    return;
  }
  if (now - leaveAsked < NOTICE_TIME) {
    /** @type {HTMLAnchorElement} */ (document.querySelector(".back-game")).click();
    return;
  }
  if (inRun) return;
  leaveAsked = now;
  showStatus("info", "Press Esc again to leave the editor.");
}

/** Has the pointer moved far enough from the press to start dragging? */
function pastSlop(event) {
  if (!pressClient) return true;
  if (
    Math.hypot(event.clientX - pressClient.clientX, event.clientY - pressClient.clientY) <
    DRAG_SLOP
  )
    return false;
  pressClient = null;
  return true;
}

// Where the pointer is while a scale handle is dragged, so Alt, Shift and
// Cmd/Ctrl can re-apply the scale without the pointer moving.
let scalePoint = null;

function applyScale(event) {
  const before = updateScale(scalePoint, {
    alt: event.altKey,
    shift: event.shiftKey,
    snap: snappingOn() && !event.metaKey && !event.ctrlKey,
  });
  if (before) pushHistory(before);
  syncInspector({ live: true });
  render();
}

// Where the pointer is while the rotate handle is dragged, so Shift can
// re-apply the turn without the pointer moving.
let rotatePoint = null;

function applyRotate(event) {
  const before = updateRotate(rotatePoint, { shift: event.shiftKey });
  if (before) pushHistory(before);
  syncInspector({ live: true });
  render();
}

// An Alt press that becomes a duplicate once the mouse moves.
let altPress = null;

// The trail, selection and undo history as a drag found them, so Escape can
// put everything back as if the drag never happened.
let dragStart = null;

function rememberDragStart(state) {
  dragStart = { state, history: editor.history.slice(), future: editor.future.slice() };
}

/**
 * Escape mid-drag: the trail goes back to how it was when the press began,
 * and the drag leaves no undo step. The button is still held, but nothing
 * follows the mouse until the next press.
 */
function cancelDrag() {
  if (!dragStart || !dragging || editor.pendingShape) return false;
  const start = dragStart;
  resetPointerState();
  editor.history = start.history;
  editor.future = start.future;
  restore(start.state);
  updateHistoryButtons();
  return true;
}

// Whether Alt, Cmd or Ctrl is held, which change what a press grabs, so the
// outline under the pointer isn't highlighted.
let hoverModifiers = false;
let hoverFrame = null;

/**
 * Highlight the point, curve handle or edge a press would grab right now, so
 * an outline is never reshaped by surprise. Worked out once a frame, from the
 * last pointer position, with the same hit test a press uses.
 */
function updateOutlineHover(event) {
  if (event) hoverModifiers = event.altKey || event.metaKey || event.ctrlKey;
  hoverFrame ??= requestAnimationFrame(() => {
    hoverFrame = null;
    const next = outlineUnderPointer();
    if (!next && !editor.hoverOutline) return;
    if (sameHit(next, editor.hoverOutline)) return;
    editor.hoverOutline = next;
    renderView();
  });
}

function outlineUnderPointer() {
  if (
    editor.tool !== "select" ||
    editor.readOnly ||
    hoverModifiers ||
    dragging ||
    panning ||
    altPress ||
    editor.marquee ||
    editor.pendingShape ||
    editor.spaceHeld ||
    editingPreview() ||
    !editor.pointerClient
  )
    return null;
  const point = pointerWorld(editor.pointerClient);
  // The scale and rotate handles take a press before any outline does.
  if (rotateHandleAt(point) || scaleHandleAt(point)) return null;
  const hit = hitTest(point);
  return ["blockPoint", "blockHandle", "blockEdge"].includes(hit?.kind) ? hit : null;
}

// A press on a read-only trail, which would have been a drag: if it moves, the
// author is told why nothing follows the mouse.
let readOnlyPress = null;

/**
 * The points a Shift-drag measures its angle from: the neighbours of a dragged
 * point along its ring, or the point a curve handle belongs to.
 */
function snapAnchors() {
  if (editor.selection?.kind !== "blockPoint" && editor.selection?.kind !== "blockHandle")
    return null;
  const boundary = boundaryAt(editor.selection);
  const node = boundary?.nodes[editor.selection.index];
  if (!boundary || !node) return null;
  if (editor.selection.kind === "blockHandle") return [node];
  const count = boundary.nodes.length;
  return [
    boundary.nodes[(editor.selection.index + count - 1) % count],
    boundary.nodes[(editor.selection.index + 1) % count],
  ].filter((other) => other !== node);
}

/**
 * Where a Shift-drag's direction guide starts: the point of the moving
 * selection nearest where it was grabbed, so the guide runs from the corner
 * you hold. A curved edge bends instead of moving its points, so it starts at
 * the grabbed spot itself.
 */
function snapReference(pointer, position) {
  const selection = editor.selection;
  let candidates = [];
  if (selection?.kind === "block")
    candidates = selectedBlocks().flatMap((index) =>
      blocks()[index] ? blockNodes(blocks()[index]) : [],
    );
  else if (selection?.kind === "blockBoundary")
    candidates = boundaryAt(selection)?.nodes || [];
  else if (selection?.kind === "blockEdge") {
    const boundary = boundaryAt(selection);
    const node = boundary?.nodes[selection.index];
    const next = boundary?.nodes[(selection.index + 1) % boundary.nodes.length];
    if (node && next && !isCurvedEdge(node, next)) candidates = [node, next];
  } else if (selection?.kind === "items")
    candidates = selection.items.flatMap((item) => {
      if (item.type === "block")
        return blocks()[item.index] ? blockNodes(blocks()[item.index]) : [];
      const at = itemPosition(item);
      return at ? [{ x: at[0], y: at[1] }] : [];
    });
  let best = position ? { x: position[0], y: position[1] } : null;
  let nearest = Infinity;
  for (const { x, y } of candidates) {
    const distance = Math.hypot(x - pointer.x, y - pointer.y);
    if (distance < nearest) {
      nearest = distance;
      best = { x, y };
    }
  }
  return best;
}

function startDragOrigin(pointer) {
  const position = selectedPosition();
  return { pointer, position, reference: snapReference(pointer, position) };
}

/**
 * Move the dragged selection to where the pointer is. It snaps to other things
 * and to the grid as it comes close, unless snapping is off or Cmd/Ctrl is
 * held. Shift locks a point or curve handle to 15° steps from a neighbour and
 * to the grid, and anything else to moving across, up and down, or at 45°.
 */
function dragSelectionTo(pointer, shift) {
  if (dragSnapshot) {
    pushHistory(dragSnapshot);
    dragSnapshot = null;
  }
  // The selection moves by as much as the pointer has, so grabbing a block
  // away from its centre does not make it jump.
  const point = pointerWorld(pointer);
  const origin = dragOrigin?.position;
  let x = point.x,
    y = point.y;
  editor.snapGuide = null;
  editor.snapLines = [];
  const anchors = shift ? snapAnchors() : null;
  if (anchors) {
    const snapped = snapToAngleAndGrid(
      { x: origin[0] + point.x - dragOrigin.pointer.x, y: origin[1] + point.y - dragOrigin.pointer.y },
      anchors,
      gridSpacing(editor.zoom),
    );
    x = snapped.x;
    y = snapped.y;
    if (snapped.anchor)
      editor.snapGuide = {
        from: snapped.anchor,
        to: { x, y },
        angle: snapped.angle,
        length: snapped.length,
      };
  } else if (origin) {
    let dx = point.x - dragOrigin.pointer.x,
      dy = point.y - dragOrigin.pointer.y;
    const locked = shift && Math.hypot(dx, dy) > 1e-6 ? lockDirection(dx, dy) : null;
    if (locked) ({ dx, dy } = locked);
    // Along a diagonal the move snaps across, and goes up or down as far.
    const diagonal = Boolean(locked?.dx && locked?.dy);
    if (snappingOn() && !dragFree) {
      dragOrigin.lines ??= snapLines();
      const axes = locked ? { x: locked.dx !== 0, y: locked.dx === 0 } : { x: true, y: true };
      const snapped = snapMove(dragOrigin.lines, dx, dy, axes);
      dy = diagonal ? Math.sign(dy) * Math.abs(snapped.dx) : snapped.dy;
      dx = snapped.dx;
      editor.snapLines = diagonal ? [] : snapped.guides;
    }
    const reference = dragOrigin.reference;
    if (locked && reference)
      editor.snapGuide = {
        from: reference,
        to: { x: reference.x + dx, y: reference.y + dy },
        angle: locked.angle,
        length: Math.hypot(dx, dy),
      };
    x = origin[0] + dx;
    y = origin[1] + dy;
  }
  // A start dragged close to the ground lands on it, unless Shift holds it level.
  if (editor.selection?.kind === "start" && !shift) y = startY(x, y);
  updateSelectedPosition(x, y);
  syncInspector({ live: true });
  render();
}

/**
 * Alt pressed or released mid-drag, as in Illustrator or Figma: the trail goes
 * back to how it was before the drag, and then either a copy follows the mouse
 * while the original stays put, or the copy is gone and the original follows
 * the mouse again. The drag's single undo step covers it all.
 */
function setDragCopying(copying, shift) {
  const copyable = dragCopyable;
  if (!copyable || copyable.copying === copying || !dragging || scaling() || rotating())
    return;
  restore(copyable.before, { live: true });
  editor.selection = copyable.original;
  const copy = copying && duplicateTarget(copyable.hit);
  // Nothing to copy after all: the original goes on following the mouse.
  if (copy) editor.selection = copy;
  copyable.copying = Boolean(copy);
  dragOrigin = startDragOrigin(copyable.point);
  // Not moved yet: the drag waits for the first move, which records the undo step.
  if (lastDragPointer) dragSelectionTo(lastDragPointer, shift);
  else render();
}

// Pressing or releasing Shift or Cmd/Ctrl mid-drag changes the snapping
// straight away, without waiting for the pointer to move.
const onShiftChange = (event) => {
  if (scaling() && scalePoint && ["Shift", "Alt", "Meta", "Control"].includes(event.key)) {
    event.preventDefault();
    applyScale(event);
    return;
  }
  if (rotating() && rotatePoint && event.key === "Shift") {
    event.preventDefault();
    applyRotate(event);
    return;
  }
  const free = event.key === "Meta" || event.key === "Control";
  if (
    (event.key !== "Shift" && !free) ||
    !dragging ||
    !editor.selection ||
    editor.pendingShape ||
    !lastDragPointer
  )
    return;
  if (free) dragFree = event.type === "keydown";
  dragSelectionTo(lastDragPointer, event.shiftKey);
};

const SHAPE_KEYS = new Set(["Alt", "Shift", "Meta", "Control"]);

// Modifier keys change a Block or Cut drag straight away, without moving the mouse.
const onShapeModifier = (event) => {
  if (!editor.pendingShape || !SHAPE_KEYS.has(event.key)) return;
  event.preventDefault();
  editor.pendingShape.circle = event.metaKey || event.ctrlKey;
  editor.pendingShape.alt = event.altKey;
  editor.pendingShape.shift = event.shiftKey;
  updateShapePoints(editor.pendingShape);
  render();
};

/** Forget everything about the current press, so nothing keeps following the mouse. */
function resetPointerState() {
  dragging = false;
  panning = false;
  pointerStart = null;
  dragSnapshot = null;
  dragOrigin = null;
  lastDragPointer = null;
  dragFree = false;
  editor.snapLines = [];
  dragCopyable = null;
  editor.snapGuide = null;
  editor.marquee = null;
  altPress = null;
  readOnlyPress = null;
  scalePoint = null;
  rotatePoint = null;
  pressClient = null;
  cycleNext = null;
  dragStart = null;
  endScale();
  endRotate();
}

export const endPointer = () => {
  if (endPreviewDrag()) {
    resetPointerState();
    return;
  }
  if (editor.pendingShape) {
    const shape = editor.pendingShape;
    const kind = pendingKind;
    editor.pendingShape = null;
    pendingKind = null;
    resetPointerState();
    // Only a shape that changed something becomes an undo step, so a missed
    // cut neither leaves an empty step nor clears the redo history.
    const before = snapshot();
    if (kind === "water") {
      if (commitWater(shape)) pushHistory(before);
      else showStatus("warning", "Drag a rectangle to add water.");
    } else if (
      commitShape(kind, shape.points, shape.closed, shape.alt, shape.circleShape)
    )
      pushHistory(before);
    else if (kind === "block")
      showStatus(
        "warning",
        "That was too small to be a block. Drag a larger shape.",
      );
    syncInspector();
    render();
    return;
  }
  if (scaling() || rotating()) {
    resetPointerState();
    flushInspector();
    render();
    return;
  }
  if (editor.marquee) {
    finishMarquee();
    resetPointerState();
    syncInspector();
    render();
    return;
  }
  if (altPress) {
    // Alt-click without a drag keeps its old meaning: select the whole ring.
    editor.selection = hitTest(altPress.point, { wholeBoundary: true });
    resetPointerState();
    syncInspector();
    render();
    return;
  }
  if (cycleNext && !lastDragPointer) {
    editor.selection = cycleNext;
    resetPointerState();
    syncInspector();
    render();
    return;
  }
  const hadGuide = editor.snapGuide !== null || editor.snapLines.length > 0;
  resetPointerState();
  flushInspector();
  if (hadGuide) render();
};

/** Drop a Block or Cut drag that is still being drawn, without applying it. */
export function cancelPendingShape() {
  if (!editor.pendingShape && !editor.marquee) return false;
  editor.pendingShape = null;
  pendingKind = null;
  resetPointerState();
  render();
  return true;
}

const shortcuts = /** @type {HTMLDialogElement} */ ($("shortcuts"));

/**
 * Whether the canvas shortcuts should answer a key. Besides the canvas itself,
 * that is after a click on one of the editor's buttons, such as a tool or a
 * tab, which keeps focus and would otherwise swallow V, C and the rest. Text
 * fields, selects and open dialogs and menus keep their keys.
 */
function shortcutsReach() {
  const active = document.activeElement;
  if (!active || active === canvas || active === document.body) return true;
  return active.tagName === "BUTTON" && !active.closest("dialog, [role=menu]");
}

export function bindInput() {
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        // Browsers expose trackpad pinch as a wheel event with Ctrl held.
        const before = pointerWorld(event);
        editor.zoom = clampZoom(editor.zoom * Math.exp(-event.deltaY * 0.01));
        const bounds = canvas.getBoundingClientRect();
        editor.cameraX = before.x - (event.clientX - bounds.left) / editor.zoom;
        editor.cameraY = before.y - (event.clientY - bounds.top) / editor.zoom;
        updateZoom();
        return;
      }
      // A normal two-finger trackpad gesture pans in both axes.
      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      editor.cameraX += (event.deltaX * deltaScale) / editor.zoom;
      editor.cameraY += (event.deltaY * deltaScale) / editor.zoom;
      clampCamera();
      renderView();
    },
    { passive: false },
  );

  canvas.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    gestureStartZoom = editor.zoom;
    gestureAnchor = pointerWorld(event);
  });

  canvas.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    if (!gestureAnchor) return;
    editor.zoom = clampZoom(gestureStartZoom * event.scale);
    const bounds = canvas.getBoundingClientRect();
    editor.cameraX = gestureAnchor.x - (event.clientX - bounds.left) / editor.zoom;
    editor.cameraY = gestureAnchor.y - (event.clientY - bounds.top) / editor.zoom;
    updateZoom();
  });

  canvas.addEventListener("gestureend", (event) => {
    event.preventDefault();
    gestureAnchor = null;
  });

  // Ctrl-click opens the context menu on a Mac; while drawing it means a circle.
  canvas.addEventListener("contextmenu", (event) => {
    if (editor.pendingShape) event.preventDefault();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    // A second finger turns the touch into a pinch: whatever the first was
    // drawing is dropped, and from here the two zoom and pan together. (Safari
    // reports trackpad pinches as gesture events, handled above.)
    if (pointers.size === 2) {
      cancelPendingShape();
      resetPointerState();
      startPinch();
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (pointers.size > 2 || pinch || pinchEnded) return;
    // Only the primary pointer (the first finger, or the mouse) edits.
    if (event.isPrimary === false) return;
    canvas.focus({ preventScroll: true });
    editor.hoverOutline = null;
    const point = pointerWorld(event);
    if (event.button === 1 || editor.tool === "pan" || editor.spaceHeld) {
      panning = true;
      pointerStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        cameraX: editor.cameraX,
        cameraY: editor.cameraY,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    // Editing the preview: the canvas only moves its frame (panning still works).
    if (editingPreview()) {
      beginPreviewDrag(point);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    // A tool that adds to, or cuts, a locked group does nothing until it is unlocked.
    const group = toolGroup(editor.tool, toolSettings);
    if (!editor.readOnly && group && isGroupLocked(group)) {
      showStatus("warning", `The ${groupLabel(group).toLowerCase()} group is locked. Unlock it in the Objects tab.`);
      return;
    }
    if (editor.tool === "block" || editor.tool === "cut" || editor.tool === "water") {
      // These tools draw a shape: start the drag and show it as it grows.
      pendingKind = editor.tool;
      const color = { block: "#83d1ce", cut: "#ff8952", water: "#8fd6e8" }[editor.tool];
      editor.hoverPoint = null;
      editor.pendingShape = {
        raw: [[point.x, point.y]],
        end: [point.x, point.y],
        points: [],
        circle: event.metaKey || event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        closed: true,
        water: editor.tool === "water",
        color,
        fill: `${color}26`,
      };
      updateShapePoints(editor.pendingShape);
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }
    if (editor.tool !== "select") {
      addAt(point);
      return;
    }
    if (rotateHandleAt(point) && startRotate(point, snapshot())) {
      rememberDragStart(snapshot());
      pressClient = { clientX: event.clientX, clientY: event.clientY };
      dragging = true;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const scaleHandle = scaleHandleAt(point);
    if (scaleHandle && startScale(scaleHandle, point, snapshot())) {
      rememberDragStart(snapshot());
      pressClient = { clientX: event.clientX, clientY: event.clientY };
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    // Alt-press: a drag duplicates what's under the cursor; a plain click
    // (decided on release) still selects the whole ring.
    if (
      event.altKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      altPress = {
        point,
        clientX: event.clientX,
        clientY: event.clientY,
        hit: hitTest(point),
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const hit = hitTest(point, { wholeBoundary: event.altKey });
    const hitItem = itemFromHit(hit);
    // Dragging from empty space (or anywhere with Cmd/Ctrl) draws a selection box.
    if (!event.altKey && (!hit || event.metaKey || event.ctrlKey)) {
      editor.marquee = {
        from: point,
        to: point,
        base: event.shiftKey ? selectionItems() : [],
      };
      if (!event.shiftKey) editor.selection = null;
      canvas.setPointerCapture(event.pointerId);
      syncInspector();
      render();
      return;
    }
    // Shift-clicking a ring adds or removes its block.
    const toggled =
      hit?.kind === "blockBoundary"
        ? { type: "block", index: hit.blockIndex }
        : hitItem;
    if (event.shiftKey && toggled) {
      // Shift-click adds a block, point, apple, prop or spike, or takes it
      // back out; a member of a named group brings or takes its whole group.
      const items = selectionItems();
      const group = withWholeGroups([toggled]);
      if (items.some((item) => sameItem(item, toggled)))
        editor.selection = makeSelection(
          items.filter((item) => !group.some((member) => sameItem(member, item))),
        );
      else editor.selection = makeSelection([...items, ...group]);
      syncInspector();
      render();
      return;
    }
    // Several things share this spot and one of them is selected: keep it
    // (so a drag moves it), and a plain click picks the next one.
    const stack = hitStack(point);
    const current = stack.findIndex((entry) => sameHit(entry, editor.selection));
    if (stack.length > 1 && current >= 0) {
      cycleNext = stack[(current + 1) % stack.length];
    } else if (!(hitItem && inGroup(hitItem))) {
      // Pressing something that's part of the selection drags all of it;
      // anything else selects what was hit, or the named group it is in.
      editor.selection = selectionForHit(hit);
      if (stack.length > 1 && sameHit(stack[0], hit))
        showStatus("info", `${stack.length} things here. Click again to select the next one.`);
    }
    if (editor.selection && editor.readOnly) {
      // Pressing selects, so the inspector shows it; dragging says why it
      // doesn't move.
      readOnlyPress = { clientX: event.clientX, clientY: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    } else if (editor.selection) {
      pressClient = { clientX: event.clientX, clientY: event.clientY };
      dragSnapshot = snapshot();
      rememberDragStart(dragSnapshot);
      dragOrigin = startDragOrigin(point);
      dragging = true;
      // What is really being dragged: the selection, which may be the next
      // one down a stack, or the grabbed member of a group.
      const dragged = editor.selection.kind === "items" ? hit : editor.selection;
      const draggedItem = dragged?.kind === "blockEdge" ? { type: "block" } : itemFromHit(dragged);
      // Start, finish and curve handles can't be duplicated, so Alt leaves their drag alone.
      if (draggedItem && draggedItem.type !== "start" && draggedItem.type !== "finish")
        dragCopyable = {
          before: dragSnapshot,
          hit: dragged,
          point,
          original: editor.selection,
          copying: false,
        };
      canvas.setPointerCapture(event.pointerId);
    }
    syncInspector();
    render();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointers.has(event.pointerId))
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pinch) {
      movePinch();
      return;
    }
    if (event.isPrimary === false || pinchEnded) return;
    editor.pointerClient = { clientX: event.clientX, clientY: event.clientY };
    updateOutlineHover(event);
    // No button held: the release was missed, so end the drag here.
    if (
      (dragging || panning || editor.marquee || altPress || readOnlyPress || draggingPreview()) &&
      event.buttons === 0
    ) {
      endPointer();
      return;
    }
    if (panning && pointerStart) {
      editor.cameraX =
        pointerStart.cameraX - (event.clientX - pointerStart.clientX) / editor.zoom;
      editor.cameraY =
        pointerStart.cameraY - (event.clientY - pointerStart.clientY) / editor.zoom;
      clampCamera();
      renderView();
      return;
    }
    if (draggingPreview()) {
      movePreviewDrag(pointerWorld(event));
      return;
    }
    // The frame is all a press does while editing the preview.
    if (editingPreview()) return;
    if (PLACING_TOOLS.has(editor.tool) && !dragging) {
      editor.hoverPoint = pointerWorld(event);
      renderView();
    }
    if (editor.pendingShape) {
      const point = pointerWorld(event);
      const last = editor.pendingShape.raw.at(-1);
      // Sampled often enough to follow a curve, but not thousands of points.
      if (Math.hypot(point.x - last[0], point.y - last[1]) > 6 / editor.zoom)
        editor.pendingShape.raw.push([point.x, point.y]);
      editor.pendingShape.end = [point.x, point.y];
      editor.pendingShape.circle = event.metaKey || event.ctrlKey;
      editor.pendingShape.alt = event.altKey;
      editor.pendingShape.shift = event.shiftKey;
      updateShapePoints(editor.pendingShape);
      render();
      return;
    }
    if (editor.marquee) {
      editor.marquee.to = pointerWorld(event);
      renderView();
      return;
    }
    if (readOnlyPress) {
      if (
        Math.hypot(
          event.clientX - readOnlyPress.clientX,
          event.clientY - readOnlyPress.clientY,
        ) < 4
      )
        return;
      readOnlyPress = null;
      refuseEdit();
      return;
    }
    if (altPress) {
      // Wait for a real drag, so an Alt-click stays a click.
      if (
        Math.hypot(
          event.clientX - altPress.clientX,
          event.clientY - altPress.clientY,
        ) < 4
      )
        return;
      const press = altPress;
      altPress = null;
      if (refuseEdit()) return;
      // One undo step covers both the copy and the move.
      const before = snapshot();
      // What a plain drag from here would have moved, for when Alt is let go.
      const pressed = itemFromHit(press.hit);
      const original = pressed && inGroup(pressed) ? editor.selection : press.hit;
      const copy = duplicateTarget(press.hit);
      if (!copy) return;
      dragCopyable = { before, hit: press.hit, point: press.point, original, copying: true };
      rememberDragStart(before);
      editor.selection = copy;
      dragSnapshot = before;
      dragOrigin = startDragOrigin(press.point);
      dragging = true;
      lastDragPointer = { clientX: event.clientX, clientY: event.clientY };
      dragFree = event.metaKey || event.ctrlKey;
      dragSelectionTo(lastDragPointer, event.shiftKey);
      return;
    }
    if (scaling()) {
      if (!pastSlop(event)) return;
      scalePoint = pointerWorld(event);
      applyScale(event);
      return;
    }
    if (rotating()) {
      if (!pastSlop(event)) return;
      rotatePoint = pointerWorld(event);
      applyRotate(event);
      return;
    }
    if (editor.tool === "select" && !dragging && !panning) {
      const point = pointerWorld(event);
      const handle = scaleHandleAt(point);
      canvas.style.cursor = rotateHandleAt(point)
        ? "grab"
        : handle
          ? scaleCursor(handle)
          : "default";
    }
    if (!dragging || !editor.selection || !pastSlop(event)) return;
    lastDragPointer = { clientX: event.clientX, clientY: event.clientY };
    dragFree = event.metaKey || event.ctrlKey;
    // Alt went down or up while the window didn't have the key events (or
    // before the first move): catch up now.
    if (dragCopyable && Boolean(event.altKey) !== dragCopyable.copying) {
      setDragCopying(Boolean(event.altKey), event.shiftKey);
      return;
    }
    dragSelectionTo(lastDragPointer, event.shiftKey);
  });

  for (const type of ["keydown", "keyup"])
    window.addEventListener(type, (event) => {
      if (event.key !== "Alt" || event.repeat || !dragCopyable) return;
      event.preventDefault();
      setDragCopying(type === "keydown", event.shiftKey);
    });

  window.addEventListener("keydown", onShiftChange);

  window.addEventListener("keyup", onShiftChange);

  window.addEventListener("keydown", onShapeModifier);

  window.addEventListener("keyup", onShapeModifier);

  // On Windows a lone Alt press can move focus to the browser's menu bar;
  // keep it on the canvas.
  for (const type of ["keydown", "keyup"])
    window.addEventListener(type, (event) => {
      if (event.key === "Alt" && document.activeElement === canvas)
        event.preventDefault();
    });

  canvas.addEventListener("dblclick", (event) => {
    if (editor.tool !== "select") return;
    const point = pointerWorld(event);
    const hit = hitTest(point, { preferEdges: true });
    // A double-click on a group goes into it, selecting the part clicked.
    if (hit && groupOf(hit) && !insideGroup(groupOf(hit))) {
      enterGroup(hit);
      syncInspector();
      render();
      return;
    }
    // A double-click on an edge adds a point to it, keeping the edge's shape.
    if (hit?.kind === "blockEdge") {
      if (refuseEdit()) return;
      pushHistory();
      insertBlockNode(hit.boundaryIndex, hit.index, hit.t, hit.blockIndex);
      syncInspector();
      render();
    }
  });

  /**
   * A pointer lifted or lost. Lifting one of two pinching fingers ends the
   * pinch; the other finger does nothing more until it lifts too.
   * @returns whether the primary pointer's press is over
   */
  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (pinch) {
      pinch = null;
      pinchEnded = pointers.size > 0;
      return false;
    }
    if (pinchEnded) {
      pinchEnded = pointers.size > 0;
      return false;
    }
    return event.isPrimary !== false;
  }

  canvas.addEventListener("pointerup", (event) => {
    if (!releasePointer(event)) return;
    endPointer();
    // What a press would grab may have changed with the selection.
    updateOutlineHover(event);
  });

  // A cancelled gesture discards a half-drawn shape instead of applying it.
  canvas.addEventListener("pointercancel", (event) => {
    if (!releasePointer(event)) return;
    if (!cancelPendingShape()) endPointer();
  });

  canvas.addEventListener("pointerleave", () => {
    editor.pointerClient = null;
    if (!editor.hoverPoint && !editor.hoverOutline) return;
    editor.hoverPoint = null;
    editor.hoverOutline = null;
    renderView();
  });

  // The shortcuts list names only the modifier this machine uses: ⌘ on an
  // Apple device, as written in the markup, and Ctrl everywhere else. Some
  // browsers report an empty platform, so the user agent is asked as well.
  const nav = /** @type {any} */ (globalThis.navigator);
  const device = [nav?.userAgentData?.platform, nav?.platform, nav?.userAgent].join(" ");
  if (!/Mac|iPhone|iPad/.test(device))
    for (const key of document.querySelectorAll("kbd[data-mod]")) key.textContent = "Ctrl";
  $("show-shortcuts").addEventListener("click", () => shortcuts.showModal());
  $("open-quick-pick").addEventListener("click", openQuickPick);

  // Clicking the backdrop closes the list too.
  shortcuts.addEventListener("click", (event) => {
    if (event.target === shortcuts) shortcuts.close();
  });

  shortcuts.addEventListener("close", () => canvas.focus({ preventScroll: true }));

  // A key can change what a press would grab: a modifier, or Escape or
  // undo changing the selection under a pointer that hasn't moved.
  for (const type of ["keydown", "keyup"])
    window.addEventListener(type, (event) => updateOutlineHover(event));

  window.addEventListener("keydown", (event) => {
    // The reload for a new release comes first; the trail is kept for it.
    if (updatePromptOpen()) return;
    if (event.key === "Escape" && cancelDrag()) {
      event.preventDefault();
      return;
    }
    // Cmd/Ctrl+P opens the quick pick in place of printing, which the editor has no use for.
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyP" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (!playtestOpen() && !document.querySelector("dialog[open]")) {
        /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
        openQuickPick();
      }
      return;
    }
    if (shortcuts.open) return;
    if (event.key === "?" && !typingInField() && !playtestOpen()) {
      event.preventDefault();
      shortcuts.showModal();
      return;
    }
    if (playtestOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePlaytest();
      }
      return;
    }
    if (event.key === "Escape" && editingPreview() && !typingInField()) {
      event.preventDefault();
      stopEditingPreview();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      // Blurring commits a field that is still being typed in through its change handler.
      event.preventDefault();
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
      if (!event.shiftKey) openPlaytest();
      else {
        // Shift spawns the bike where the mouse is.
        const pointer = editor.pointerClient;
        const bounds = canvas.getBoundingClientRect();
        if (
          pointer &&
          pointer.clientX >= bounds.left &&
          pointer.clientX <= bounds.right &&
          pointer.clientY >= bounds.top &&
          pointer.clientY <= bounds.bottom
        )
          openPlaytest(pointerWorld(pointer));
        else showStatus("warning", "Point at the trail to choose where the bike starts.");
      }
      return;
    }
    // Undo and redo in a text field belong to the field.
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyZ" && !typingInField()) {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
      event.preventDefault();
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
      if (!event.shiftKey) saveDraft();
      else if (canSave()) saveTrail();
      else refuseReadOnly();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyY" && !typingInField()) {
      event.preventDefault();
      redo();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      (event.code === "KeyA" || event.code === "KeyD") &&
      !typingInField()
    ) {
      event.preventDefault();
      if (event.code === "KeyA") selectAll();
      else if (editor.selection) {
        editor.selection = null;
        syncInspector();
        render();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.code === "KeyG" && shortcutsReach()) {
      event.preventDefault();
      if (event.shiftKey ? ungroupSelection() : groupSelection()) {
        syncInspector();
        render();
      }
      return;
    }
    // By the key's place rather than its character, which Shift changes.
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      (event.code === "BracketRight" || event.code === "BracketLeft") &&
      shortcutsReach()
    ) {
      event.preventDefault();
      orderSelection(event.code === "BracketRight");
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      shortcutsReach()
    ) {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.code === "Space" && document.activeElement === canvas) {
      event.preventDefault();
      editor.spaceHeld = true;
    }
    if (
      !shortcutsReach() ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (event.key === "Escape") {
      escape();
      return;
    }
    if (TOOL_KEYS[event.code] && !event.shiftKey) {
      setTool(TOOL_KEYS[event.code]);
      render();
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      nudgeSelection(event.key, event.shiftKey);
      return;
    }
    if (event.key === "[" || event.key === "]") {
      cyclePropType(event.key === "]" ? 1 : -1);
      return;
    }
    // X flips a selection with blocks in it, Shift+X upside down; props alone
    // flip where they stand.
    if (event.code === "KeyX") {
      if (!mirrorSelection(!event.shiftKey) && !event.shiftKey) toggleFlip();
      return;
    }
    if (event.code === "KeyY") {
      toggleGameArt();
      return;
    }
    if (event.code === "KeyM") {
      toggleMinimap();
      return;
    }
    if (event.code === "KeyN") {
      const snapping = setSnapping(!snappingOn());
      showStatus("info", snapping ? "Snapping on" : "Snapping off: N turns it back on");
      return;
    }
    if (event.code === "KeyR") {
      rotateSelection(event.shiftKey ? -ROTATE_STEP : ROTATE_STEP);
      return;
    }
    if (event.key === "=" || event.key === "+") {
      zoomAtCenter(1.2);
      return;
    }
    if (event.key === "-") {
      zoomAtCenter(1 / 1.2);
      return;
    }
    if (event.key === "0") {
      zoomAtCenter(1 / editor.zoom);
      return;
    }
    if (event.key === "Home") {
      // Shift fits the whole trail in the view; plain Home goes back to the start.
      if (event.shiftKey) fitTrail();
      else focusOnStart();
      render();
      return;
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") editor.spaceHeld = false;
  });
}
