// Drawing the trail, selection handles and live previews onto the canvas.
import {
  PAINTED_PROPS,
  propAlignmentSlope,
  propGroundOffset,
  propRotation,
  propWallFit,
} from "../drawing.js";
import { RADIUS, WHEELBASE } from "../config.js";
import { FINISH_FLOWER_RADIUS } from "../finish.js";
import { NISSE_GROUND_LIFT, drawNisse } from "../nisse.js";
import { SPIKE_TIP } from "../spike.js";
import { store } from "../local-store.js";
import { fallLine, invalidateTerrain, terrainGeometry, updateTerrain } from "../terrain.js";
import { terrainColumnSpans } from "../terrain-runtime.js";
import { regionBounds } from "../terrain-geometry.js";
import { finishFlower, finishHeight, surfaceBelow } from "../trail-schema.js";
import { terrainMaterials } from "../trails.js";
import { normalizeWater, waterColumns } from "../water.js";
import { resolveWeather } from "../weather.js";
import {
  blockSelected,
  blocks,
  boundaryEntries,
  isBackWall,
  traceBoundary,
  traceBlock,
} from "./blocks.js";
import { $, art, backWallArt, canvas, ctx, terrainArt, tools } from "./dom.js";
import { drawPreviewFrame } from "./preview.js";
import { scaleFrame, scaling } from "./scale.js";
import { selectionBox } from "./selection.js";
import { rotateHandle, rotationAngle } from "./rotate.js";
import { gridSpacing } from "./snap.js";
import { editor, waters } from "./state.js";
import { PLACING_TOOLS, placingNisse, toolSettings } from "./tools.js";
import { waterHandle, waterSize } from "./water.js";
import { viewportSize } from "./view.js";

export const GAME_ART_KEY = "hjulben-editor-game-art-v1";

/**
 * The editor edits blocks in place while dragging, so the compiled terrain the
 * renderer, surface queries and validation share has to be told. A cheap
 * fingerprint of each block is compared each time it is needed, and only the
 * blocks that really changed are rebuilt (see updateTerrain).
 */
let terrainFingerprint = null;
let terrainTrail = null;
// Each block's fingerprint, and the block it was taken of, by index.
let blockPrints = [];
let printedBlocks = [];
// Small numbers for the few strings a block holds (materials, layers, edge
// and node modes), so they mix as quickly as a coordinate.
const stringCodes = new Map();
const code = (value) => {
  let known = stringCodes.get(value);
  if (known === undefined) stringCodes.set(value, (known = stringCodes.size + 1));
  return known;
};

function blockPrint(block) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  };
  const point = (value) => mix(Math.round(value * 64) | 0);
  mix(code(String(block.material)));
  mix(code(block.layer || ""));
  for (const boundary of [block.outer, ...block.inner]) {
    mix(boundary.nodes.length);
    for (const node of boundary.nodes) {
      point(node.x);
      point(node.y);
      if (node.in) {
        point(node.in[0]);
        point(node.in[1]);
      } else mix(1);
      if (node.out) {
        point(node.out[0]);
        point(node.out[1]);
      } else mix(2);
      mix(code(node.edge || ""));
      mix(code(node.mode || ""));
    }
  }
  return hash;
}

export function syncTerrain() {
  // A redraw that only moved the view can't have changed the terrain.
  if (viewOnly && terrainTrail === editor.trail && terrainFingerprint !== null)
    return;
  const list = blocks();
  const prints = list.map(blockPrint);
  // Undo and loading swap in another trail object, whose terrain is not an edit.
  const sameTrail = terrainTrail === editor.trail && terrainFingerprint !== null;
  terrainTrail = editor.trail;
  const changed = [];
  if (sameTrail && list.length === printedBlocks.length) {
    list.forEach((block, index) => {
      if (prints[index] !== blockPrints[index] || block !== printedBlocks[index]) changed.push(index);
    });
    if (!changed.length) return;
    // Blocks changed in place: only they are rebuilt, and only objects
    // standing where they were or are now can have lost their floor.
    const before = changed.map((index) => boxes[index]);
    for (const index of changed) boxes[index] = regionBounds(list[index]);
    const near = [...before, ...changed.map((index) => boxes[index])];
    const anchored = groundAnchoredObjects((x) => near.some((box) => x >= box.left && x <= box.right));
    remember(list, prints);
    measureAll();
    updateTerrain(editor.trail, new Set(changed.map((index) => list[index])));
    keepCoveredObjectsInPlace(anchored);
    return;
  }
  // Blocks added, removed or reordered, or another trail: everything again.
  const fingerprint = prints.join(",");
  if (fingerprint === terrainFingerprint && list.length === printedBlocks.length) {
    remember(list, prints);
    return;
  }
  // Read while the compiled terrain is still the one on screen.
  const anchored = sameTrail ? groundAnchoredObjects() : [];
  remember(list, prints);
  terrainFingerprint = fingerprint;
  measureBlocks();
  invalidateTerrain(editor.trail);
  keepCoveredObjectsInPlace(anchored);
}

function remember(list, prints) {
  printedBlocks = list.slice();
  blockPrints = prints;
  terrainFingerprint = prints.join(",");
}

// The box round each block, by index, and round all of them: a redraw only
// draws the blocks in view, and panning clamps to the trail without measuring
// thousands of blocks for every step. Measured again whenever the terrain
// changes (see syncTerrain).
let boxes = [];
let allBox = null;

function measureBlocks() {
  boxes = blocks().map((block) => regionBounds(block));
  measureAll();
}

function measureAll() {
  allBox = null;
  for (const box of boxes) {
    if (!allBox) allBox = { ...box };
    else {
      allBox.left = Math.min(allBox.left, box.left);
      allBox.right = Math.max(allBox.right, box.right);
      allBox.top = Math.min(allBox.top, box.top);
      allBox.bottom = Math.max(allBox.bottom, box.bottom);
    }
  }
}

/** The box round every block, or null without any. */
export function terrainBox() {
  if (terrainTrail !== editor.trail || terrainFingerprint === null) syncTerrain();
  return allBox && { ...allBox };
}

/** Whether block `index` reaches into the part of the world on screen. */
function blockInView(index, view) {
  const box = boxes[index];
  return !box || (box.right >= view.left && box.left <= view.right && box.bottom >= view.top && box.top <= view.bottom);
}

/** The world on screen, a handle's width larger all round. */
function viewBox() {
  const { width, height } = viewportSize();
  const margin = 12 / editor.zoom;
  return {
    left: editor.cameraX - margin,
    top: editor.cameraY - margin,
    right: editor.cameraX + width / editor.zoom + margin,
    bottom: editor.cameraY + height / editor.zoom + margin,
  };
}

/**
 * Objects without a height of their own (the start, the finish, props and
 * apples) stand on the topmost surface at their x. Each is listed with the
 * floor it stands on now and a way to pin its height.
 */
function groundAnchoredObjects(near = () => true) {
  const trail = editor.trail;
  const found = [];
  const add = (x, pin) => {
    if (!near(x)) return;
    const floor = surfaceBelow(trail, x, null);
    if (floor) found.push({ x, floor: floor.y, pin });
  };
  if (trail.start && !Number.isFinite(trail.start.y))
    add(trail.start.x, (y) => (trail.start.y = y - 12));
  if (!Number.isFinite(trail.finish.y))
    add(trail.finish.x, (y) => (trail.finish.y = y));
  for (const prop of trail.props || [])
    if (!Number.isFinite(prop.y)) add(prop.x, (y) => (prop.y = y));
  for (const apple of trail.apples || [])
    if (!Number.isFinite(apple.y)) add(apple.x, (y) => (apple.y = y - 60));
  if (trail.nisse && !Number.isFinite(trail.nisse.y))
    add(trail.nisse.x, (y) => (trail.nisse.y = y - NISSE_GROUND_LIFT));
  return found;
}

/**
 * Terrain that now covers a ground-anchored object, like a roof or a cave
 * ceiling dragged over it, would lift it onto the new top. Pin it to the floor
 * it was standing on instead. Ground raised or lowered beneath an object still
 * carries it along.
 */
function keepCoveredObjectsInPlace(anchored) {
  for (const { x, floor, pin } of anchored) {
    const y = restingY(x, floor);
    if (y !== null) pin(y);
  }
}

/**
 * The floor under a point: the top of the solid it is inside, else the first
 * surface below it. Null when there is none.
 */
export function floorUnder(x, y) {
  const compiled = terrainGeometry(editor.trail);
  if (!compiled || !Number.isFinite(y)) return null;
  for (const span of terrainColumnSpans(compiled, x)) {
    if (span.bottom < y - 0.5) continue;
    return span.top;
  }
  return null;
}

/**
 * Where something standing at (x, y) should rest. Null when the floor it is on
 * is the topmost surface, so it can stay ground-anchored; otherwise an explicit
 * height, so a roof or cave ceiling above it doesn't lift it onto the top.
 */
export function restingY(x, y) {
  const top = surfaceBelow(editor.trail, x, null);
  if (!top) return null;
  const floor = floorUnder(x, y - 1);
  if (floor !== null && Math.abs(floor - top.y) < 0.5) return null;
  return floor ?? y;
}

// How close on screen a start put down by hand must come to the ground under
// its wheels to snap onto it. A start a few units off the ground drops or
// jolts the bike as a run begins; one put further away is meant to be there.
const START_SNAP_PX = 16;

/**
 * Where the start goes when it is put down at (x, y): resting on the floor
 * under its wheels when it is that close, else where it was put. Null is the
 * topmost surface, which the start then follows when the terrain changes.
 */
export function startY(x, y) {
  const wheels = [x - WHEELBASE / 2, x + WHEELBASE / 2];
  const floors = wheels.map((wheel) => floorUnder(wheel, y));
  if (floors.some((floor) => floor === null)) return y;
  const resting = Math.min(...floors) - RADIUS;
  if (Math.abs(resting - y) > START_SNAP_PX / editor.zoom) return y;
  const onTop = wheels.every((wheel, index) => Math.abs((surfaceBelow(editor.trail, wheel, null)?.y ?? NaN) - floors[index]) < 0.5);
  return onTop ? null : resting;
}

// Below this zoom the game art is too small to read and slow to draw, so the
// plain terrain is drawn instead.
export const GAME_ART_MIN_ZOOM = 0.35;

// Back walls in the editor: shaded like the game draws them, with a dotted
// outline and their own point colour, so they read as behind the terrain.
const BACK_WALL_SHADE = "#1b263380";
const BACK_WALL_OUTLINE = "#b9c7ff99";
const BACK_WALL_POINT = "#a99cf0";

function showGameArt() {
  return editor.gameArt && editor.zoom >= GAME_ART_MIN_ZOOM;
}

function drawBlocks() {
  const gameArt = showGameArt();
  const view = viewBox();
  for (const [blockIndex, block] of blocks().entries()) {
    if (!blockInView(blockIndex, view)) continue;
    const material = terrainMaterials[block.material] || terrainMaterials.grass;
    const back = isBackWall(block);
    // With game art showing, the blocks are already drawn exactly as they
    // will be ridden, so only their outlines are added for editing. Back
    // walls are filled earlier, behind everything.
    if (!gameArt && !back) {
      traceBlock(block);
      // Even-odd fill so a block's caves stay open.
      ctx.fillStyle = material.fill;
      ctx.globalAlpha = material.alpha ?? 1;
      ctx.fill("evenodd");
      ctx.globalAlpha = 1;
    }
    // The outline is stroked one boundary at a time: stroke() takes no fill rule,
    // and tracing a whole block at once would also stroke the shared seam where
    // a cave meets its own outer boundary twice.
    const selected = blockSelected(blockIndex);
    boundaryEntries(block).forEach(({ boundary }, boundaryIndex) => {
      const highlighted =
        selected ||
        (editor.selection?.kind === "blockBoundary" &&
          editor.selection.blockIndex === blockIndex &&
          editor.selection.boundaryIndex === boundaryIndex);
      ctx.strokeStyle = highlighted
        ? "#fff3be"
        : back
          ? BACK_WALL_OUTLINE
          : gameArt
            ? "#17262b99"
            : material.edge;
      ctx.lineWidth = highlighted
        ? 3 / editor.zoom
        : gameArt || back
          ? 1.5 / editor.zoom
          : Math.max(2.5, 1.5 / editor.zoom);
      if (highlighted) ctx.setLineDash([8 / editor.zoom, 5 / editor.zoom]);
      else if (back) ctx.setLineDash([3 / editor.zoom, 4 / editor.zoom]);
      ctx.beginPath();
      traceBoundary(boundary);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
}

/** The outline a drag is about to draw, or the cut preview, in a muted colour. */
function drawPendingShape(shape) {
  if (!shape || shape.points.length < 2) return;
  ctx.beginPath();
  shape.points.forEach(([x, y], index) =>
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
  );
  if (shape.closed) ctx.closePath();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = 2 / editor.zoom;
  ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (shape.closed && shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
}

/**
 * Back walls, behind everything but the sky: the game's art when it shows,
 * else their material darkened like the game draws them.
 */
function drawBackWalls() {
  if (!showGameArt()) {
    const view = viewBox();
    for (const [blockIndex, block] of blocks().entries()) {
      if (!isBackWall(block) || !blockInView(blockIndex, view)) continue;
      const material = terrainMaterials[block.material] || terrainMaterials.grass;
      traceBlock(block);
      ctx.fillStyle = material.fill;
      ctx.fill("evenodd");
      ctx.fillStyle = BACK_WALL_SHADE;
      ctx.fill("evenodd");
    }
    return;
  }
  const { width, height } = viewportSize();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  backWallArt.draw(ctx, editor.trail, editor.cameraX, editor.cameraY, width / editor.zoom, height / editor.zoom);
  ctx.restore();
}

function drawTerrain() {
  if (showGameArt()) {
    // The game's own renderer, fed the same compiled terrain the game rides.
    const { width, height } = viewportSize();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    terrainArt.draw(ctx, editor.trail, editor.cameraX, editor.cameraY, width / editor.zoom, height / editor.zoom);
    ctx.restore();
  }
  // Graffiti is painted onto the rock, so it goes straight over the terrain.
  for (const prop of editor.trail.props || [])
    if (PAINTED_PROPS.has(prop.type)) art.drawWallPaint(editor.trail, prop);
  drawBlocks();
  drawPendingShape(editor.pendingShape);
}

function drawGrid(width, height) {
  const spacing = gridSpacing(editor.zoom);
  const left = Math.floor(editor.cameraX / spacing) * spacing;
  const top = Math.floor(editor.cameraY / spacing) * spacing;
  const right = editor.cameraX + width / editor.zoom;
  const bottom = editor.cameraY + height / editor.zoom;
  ctx.beginPath();
  for (let x = left; x <= right; x += spacing) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = top; y <= bottom; y += spacing) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.strokeStyle = "#263b3d2c";
  ctx.lineWidth = 1 / editor.zoom;
  ctx.stroke();
}

export function objectY(object, offset = 0) {
  return Number.isFinite(object.y) ? object.y : groundY(object.x) - offset;
}

/** The ground height at an x: the topmost surface at or below `referenceY`. */
export function groundY(x, referenceY = null) {
  const surface = surfaceBelow(editor.trail, x, referenceY);
  return surface ? surface.y : fallLine(editor.trail);
}

/**
 * Where the finish flag stands: an explicit height when the author has set one,
 * else the surface below it. Shared with the game so the flag is drawn where the
 * editor put it.
 */
export function finishY() {
  return finishHeight(editor.trail);
}

/**
 * What the props react to in the editor: nothing moves, but they lean and
 * stream the way the trail's wind blows.
 */
function stillScene() {
  return { time: 0, riderX: null, riderY: null, weather: resolveWeather(editor.trail.weather), landing: null };
}

function drawProps(layer) {
  const scene = stillScene();
  for (const prop of editor.trail.props || []) {
    if (prop.layer !== layer || PAINTED_PROPS.has(prop.type)) continue;
    art.drawProp(
      prop.type,
      prop.x,
      objectY(prop),
      1,
      propAlignmentSlope(editor.trail, prop),
      propGroundOffset(editor.trail, prop),
      prop.text,
      propWallFit(editor.trail, prop),
      prop.flip,
      scene,
      propRotation(prop),
    );
  }
}

const GLOWING_PROPS = new Set(["lamp", "crane", "lantern", "torch", "fireplace", "mushrooms", "hut", "farmhouse", "wind-turbine", "tent", "camera-tower", "watchtower"]);

/**
 * Street lamps, crane and wind-turbine lights, hut and farmhouse windows, tents and searchlights after dark;
 * lanterns, torches, mushrooms and a camera tower's tally light always.
 */
function drawPropGlows(dark) {
  for (const prop of editor.trail.props || []) {
    if (!GLOWING_PROPS.has(prop.type)) continue;
    art.drawPropGlow(
      prop.type,
      prop.x,
      objectY(prop),
      propGroundOffset(editor.trail, prop),
      prop.flip,
      0,
      {
        dark,
        trail: editor.trail,
        prop,
        fit: propWallFit(editor.trail, prop),
        rotation: propRotation(prop),
      },
    );
  }
}

function drawSpikes() {
  for (const [index, spike] of editor.trail.spikes.entries()) {
    art.drawSpike(spike.x, spike.y, spike.radius);
    if (!isSelected("spike", index)) continue;
    ctx.beginPath();
    ctx.arc(spike.x, spike.y, spike.radius + SPIKE_TIP, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff3be";
    ctx.lineWidth = 2 / editor.zoom;
    ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Water as the game draws it, with its rectangle outlined so the parts
 * hidden in terrain still show where the body reaches.
 */
function drawWater() {
  const list = waters();
  if (!list.length) return;
  const compiled = terrainGeometry(editor.trail);
  list.forEach((raw, index) => {
    const body = normalizeWater(raw);
    art.drawWater(body, waterColumns(compiled, body), 0);
    const selected = isSelected("water", index);
    ctx.strokeStyle = selected ? "#fff3be" : "#8fd6e8aa";
    ctx.lineWidth = (selected ? 2 : 1) / editor.zoom;
    ctx.setLineDash(
      selected
        ? [6 / editor.zoom, 4 / editor.zoom]
        : [3 / editor.zoom, 4 / editor.zoom],
    );
    ctx.strokeRect(body.x, body.y, body.width, body.depth);
    ctx.setLineDash([]);
  });
}

function drawObjects() {
  drawSpikes();
  for (const apple of editor.trail.apples)
    art.drawApple(apple.x, objectY(apple, 60));
  if (editor.trail.nisse) drawNisse(tools, editor.trail.nisse.x, objectY(editor.trail.nisse, NISSE_GROUND_LIFT));
  art.drawFlag(editor.trail.finish.x, finishY(), true, 0);
  if (editor.selection?.kind === "finish") {
    // The petals the bike has to touch.
    const flower = finishFlower(editor.trail);
    ctx.beginPath();
    ctx.arc(flower.x, flower.y, FINISH_FLOWER_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff3be";
    ctx.lineWidth = 2 / editor.zoom;
    ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  drawProps("front");
  const startY = Number.isFinite(editor.trail.start.y)
    ? editor.trail.start.y
    : groundY(editor.trail.start.x) - 12;
  ctx.save();
  ctx.globalAlpha = 0.72;
  art.drawBike({
    rear: { x: editor.trail.start.x - 25, y: startY, spin: 0, compression: 0 },
    front: { x: editor.trail.start.x + 25, y: startY, spin: 0, compression: 0 },
    mx: editor.trail.start.x,
    my: startY,
    angle: 0,
    length: 50,
    facing: editor.trail.start.facing,
    flipVisual: editor.trail.start.facing,
  });
  ctx.restore();
}

function isSelected(kind, index) {
  if (editor.selection?.kind === "items")
    return editor.selection.items.some(
      (item) => item.type === kind && item.index === index,
    );
  return editor.selection?.kind === kind && editor.selection.index === index;
}

/** Is this the node whose curve handles are showing: the selected point, or the owner of the selected handle? */
export function isActiveNode(blockIndex, boundaryIndex, nodeIndex) {
  return (
    (editor.selection?.kind === "blockPoint" || editor.selection?.kind === "blockHandle") &&
    editor.selection.blockIndex === blockIndex &&
    editor.selection.boundaryIndex === boundaryIndex &&
    editor.selection.index === nodeIndex
  );
}

/** Is this particular node or handle the current selection? */
function isBlockPart(blockIndex, boundaryIndex, nodeIndex, side = null) {
  if (editor.selection?.kind === "items")
    return (
      side === null &&
      editor.selection.items.some(
        (item) =>
          item.type === "point" &&
          item.blockIndex === blockIndex &&
          item.boundaryIndex === boundaryIndex &&
          item.index === nodeIndex,
      )
    );
  if (
    editor.selection?.kind !== "blockPoint" &&
    editor.selection?.kind !== "blockHandle" &&
    editor.selection?.kind !== "blockBoundary"
  )
    return false;
  if (
    editor.selection.blockIndex !== blockIndex ||
    editor.selection.boundaryIndex !== boundaryIndex
  )
    return false;
  if (editor.selection.kind === "blockBoundary") return true;
  if (editor.selection.index !== nodeIndex) return false;
  return editor.selection.kind !== "blockHandle" || editor.selection.side === side;
}

function drawHandles() {
  const radius = 5 / editor.zoom;
  const drawHandle = (x, y, selected, color = "#ff8952") => {
    ctx.fillStyle = selected ? "#fff3be" : color;
    ctx.strokeStyle = "#17262b";
    ctx.lineWidth = 2 / editor.zoom;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const view = viewBox();
  for (const [blockIndex, block] of blocks().entries()) {
    // The selected block's curve handles can reach past its box.
    if (blockIndex !== editor.selection?.blockIndex && !blockInView(blockIndex, view)) continue;
    boundaryEntries(block).forEach(({ boundary, hole }, boundaryIndex) => {
      boundary.nodes.forEach((node, index) => {
        drawHandle(
          node.x,
          node.y,
          isBlockPart(blockIndex, boundaryIndex, index),
          isBackWall(block) ? BACK_WALL_POINT : hole >= 0 ? "#83d1ce" : "#f0b45f",
        );
        // Curve handles are only drawn for the active node, so the canvas
        // stays readable, and only those can be grabbed.
        if (!isActiveNode(blockIndex, boundaryIndex, index)) return;
        for (const side of ["in", "out"]) {
          const handle = node[side];
          if (!handle) continue;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(handle[0], handle[1]);
          ctx.strokeStyle = "#e65e5699";
          ctx.lineWidth = 1.5 / editor.zoom;
          ctx.stroke();
          drawHandle(
            handle[0],
            handle[1],
            editor.selection.kind === "blockHandle" && editor.selection.side === side,
            "#e65e56",
          );
        }
      });
    });
  }
  editor.trail.apples.forEach((apple, index) =>
    drawHandle(
      apple.x,
      objectY(apple, 60),
      isSelected("apple", index),
      "#ef8150",
    ),
  );
  editor.trail.props.forEach((prop, index) =>
    drawHandle(prop.x, objectY(prop), isSelected("prop", index), "#83d1ce"),
  );
  if (editor.trail.nisse)
    drawHandle(editor.trail.nisse.x, objectY(editor.trail.nisse, NISSE_GROUND_LIFT), isSelected("nisse", 0), "#d63b2c");
  editor.trail.spikes.forEach((spike, index) =>
    drawHandle(spike.x, spike.y, isSelected("spike", index), "#e65e56"),
  );
  waters().forEach((body, index) =>
    drawHandle(...waterHandle(body), isSelected("water", index), "#5fb4d4"),
  );
  const startY = Number.isFinite(editor.trail.start.y)
    ? editor.trail.start.y
    : groundY(editor.trail.start.x) - 12;
  drawHandle(editor.trail.start.x, startY, isSelected("start"), "#c6dfa9");
  drawHandle(editor.trail.finish.x, finishY(), isSelected("finish"), "#c6dfa9");
}

let viewOnly = false;
let viewFrame = null;

/**
 * Redraw after only the view or a preview changed (panning, zooming, hovering,
 * box-selecting), skipping the check for terrain edits. Anything that edits the
 * trail must call render().
 *
 * A trackpad sends more pan and zoom events than the screen shows frames, so
 * the redraw waits for the next frame and draws once for all of them.
 */
export function renderView() {
  viewFrame ??= requestAnimationFrame(() => {
    viewFrame = null;
    viewOnly = true;
    try {
      render();
    } finally {
      viewOnly = false;
    }
  });
}

export function render() {
  // A full redraw now covers any view change waiting for the next frame.
  if (viewFrame !== null && !viewOnly) {
    cancelAnimationFrame(viewFrame);
    viewFrame = null;
  }
  // The inspector only has something to show for a selection.
  const inspector = $("inspector");
  const open = Boolean(editor.selection);
  if (inspector && inspector.classList.contains("open") !== open) {
    inspector.classList.toggle("open", open);
    inspector.inert = !open;
  }
  const { width, height } = viewportSize();
  if (!width || !height) return;
  syncTerrain();
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  art.drawBackground({
    width,
    height,
    palette: editor.trail,
    cameraX: editor.cameraX,
    cameraY: editor.cameraY,
    full: true,
  });
  ctx.save();
  ctx.translate(-editor.cameraX * editor.zoom, -editor.cameraY * editor.zoom);
  ctx.scale(editor.zoom, editor.zoom);
  drawGrid(width, height);
  drawBackWalls();
  drawProps("back");
  drawTerrain();
  drawObjects();
  drawWater();
  drawPlacementPreview();
  drawPropGlows(
    art.drawTimeTint(editor.trail, editor.cameraX, editor.cameraY, width / editor.zoom, height / editor.zoom),
  );
  drawHandles();
  drawScaleFrame();
  drawRotateHandle();
  drawSnapGuide();
  drawMarquee();
  drawSizeTag();
  drawPreviewFrame();
  ctx.restore();
}

/** The box around selected blocks, with the handles that scale them. */
function drawScaleFrame() {
  const shown = editor.pendingShape ? null : scaleFrame();
  if (!shown) return;
  const { frame, handles } = shown;
  ctx.save();
  ctx.strokeStyle = "#fff3be99";
  ctx.lineWidth = 1 / editor.zoom;
  ctx.setLineDash([4 / editor.zoom, 4 / editor.zoom]);
  ctx.strokeRect(frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top);
  ctx.setLineDash([]);
  const size = 8 / editor.zoom;
  ctx.lineWidth = 2 / editor.zoom;
  for (const { x, y } of handles) {
    ctx.fillStyle = "#fff3be";
    ctx.strokeStyle = "#17262b";
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
}

/** The round handle that rotates the selection, and the angle while it turns. */
function drawRotateHandle() {
  const handle = rotateHandle();
  if (!handle) return;
  const { from, x, y } = handle;
  const radius = 5 / editor.zoom;
  ctx.save();
  ctx.strokeStyle = "#fff3be99";
  ctx.lineWidth = 1 / editor.zoom;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fff3be";
  ctx.strokeStyle = "#17262b";
  ctx.lineWidth = 2 / editor.zoom;
  ctx.fill();
  ctx.stroke();
  const angle = rotationAngle();
  if (angle !== null)
    drawTag(
      `${angle > 0 ? "+" : ""}${Math.round(angle * 10) / 10}\u00b0`,
      x + 12 / editor.zoom,
      y - 12 / editor.zoom,
    );
  ctx.restore();
}

/** While a Shift-drag is snapping, show the line it is locked to and its angle and length. */
function drawSnapGuide() {
  if (!editor.snapGuide) return;
  const { from, to, angle, length } = editor.snapGuide;
  ctx.save();
  ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = "#fff3be";
  ctx.lineWidth = 1.5 / editor.zoom;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(to.x, to.y, 8 / editor.zoom, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff3be";
  ctx.stroke();
  ctx.restore();
  drawTag(
    `${Math.round(angle * 10) / 10}\u00b0 \u00b7 ${Math.round(length)}`,
    to.x + 12 / editor.zoom,
    to.y - 12 / editor.zoom,
  );
}

/** A short label beside a world point, readable over any background. */
function drawTag(label, x, y) {
  ctx.save();
  ctx.font = `${12 / editor.zoom}px system-ui, sans-serif`;
  ctx.lineWidth = 3 / editor.zoom;
  ctx.strokeStyle = "#17262b";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = "#fff3be";
  ctx.fillText(label, x, y);
  ctx.restore();
}

/** Width × height beside a shape being drawn, or a selection being scaled. */
function drawSizeTag() {
  const shape = editor.pendingShape;
  let box = null,
    at = null;
  if (shape?.points.length >= 2) {
    const xs = shape.points.map(([x]) => x),
      ys = shape.points.map(([, y]) => y);
    box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    at = shape.end;
  } else if (scaling()) {
    const frame = scaleFrame()?.frame;
    box = selectionBox();
    at = frame && [frame.right, frame.bottom];
  }
  if (!box || !at) return;
  const width = Math.round(box.right - box.left),
    height = Math.round(box.bottom - box.top);
  // Below and right of the pointer, clear of the cursor.
  drawTag(`${width} × ${height}`, at[0] + 12 / editor.zoom, at[1] + 24 / editor.zoom);
}

/** A faded copy of what the current tool will place, under the cursor. */
function drawPlacementPreview() {
  if (!editor.hoverPoint) return;
  const { x, y } = editor.hoverPoint;
  if (editor.tool === "water" && !editor.pendingShape) {
    // What a click drops: a body of the tool's size, its surface centred here.
    const width = waterSize(toolSettings.water.width, "width");
    const depth = waterSize(toolSettings.water.depth, "depth");
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#8fd6e8";
    ctx.fillStyle = "#3f9fc433";
    ctx.lineWidth = 1.5 / editor.zoom;
    ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
    ctx.fillRect(x - width / 2, y, width, depth);
    ctx.strokeRect(x - width / 2, y, width, depth);
    ctx.restore();
    return;
  }
  if (!PLACING_TOOLS.has(editor.tool)) return;
  if (editor.tool === "prop") {
    const prop = {
      x,
      y,
      type: toolSettings.prop.type,
      layer: "back",
      rotation: toolSettings.prop.rotation,
    };
    art.drawProp(
      prop.type,
      x,
      y,
      0.5,
      propAlignmentSlope(editor.trail, prop),
      propGroundOffset(editor.trail, prop),
      "",
      propWallFit(editor.trail, prop),
      toolSettings.prop.flip,
      stillScene(),
      propRotation(prop),
    );
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.5;
  if (editor.tool === "apple" && placingNisse()) drawNisse(tools, x, y);
  else if (editor.tool === "apple") art.drawApple(x, y);
  else art.drawSpike(x, y, toolSettings.spike.radius);
  ctx.restore();
}

function drawMarquee() {
  if (!editor.marquee) return;
  const x = Math.min(editor.marquee.from.x, editor.marquee.to.x),
    y = Math.min(editor.marquee.from.y, editor.marquee.to.y);
  const w = Math.abs(editor.marquee.to.x - editor.marquee.from.x),
    h = Math.abs(editor.marquee.to.y - editor.marquee.from.y);
  ctx.fillStyle = "#fff3be22";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fff3be";
  ctx.lineWidth = 1.5 / editor.zoom;
  ctx.setLineDash([6 / editor.zoom, 4 / editor.zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
