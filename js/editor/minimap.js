// The mini map: the whole trail in the corner of the canvas, with the part on
// screen lit and the rest dimmed. It shows the trail's length in full but only
// the depth that is ridden, from the highest ground or apple to a little below
// the lowest ground, apple or flag, so a deep slab under a trail doesn't
// squash the line the rider follows into a sliver. A press outside the frame moves the view
// there, and a drag on the frame moves it from where it was grabbed, as the
// map is too small to aim at one spot precisely. It marks the apples, spikes,
// start and finish, frames the selection, and shows a dot for each problem
// validation found: a click on one selects what it is about.
// M hides and shows it, and the choice is remembered.
import { flattenBoundary } from "../terrain-geometry.js";
import { store } from "../local-store.js";
import { blocks, isBackWall } from "./blocks.js";
import { $ } from "./dom.js";
import { finishY, groundY, objectY, terrainBox, terrainPrint } from "./render.js";
import { itemPosition, revealItem, selectionBox } from "./selection.js";
import { editor, waters } from "./state.js";
import { centerOn, viewportSize } from "./view.js";

const SHOWN_KEY = "hjulben-editor-minimap";
// The map is the same size for every trail: a share of the canvas's width,
// within limits, and a fixed shape. The trail is fitted inside it, with a gap
// all round, and any room left over stays empty.
const SHARE = 0.2;
const MIN_WIDTH = 180;
const MAX_WIDTH = 300;
const SHAPE = 0.45;
const INSET = 8;
// A drag redraws the trail's outline at most this often, in milliseconds; the
// frame round the view and the marks follow every frame.
const REDRAW_MS = 120;
// How many places along the trail its ground is measured at, and how much
// room is kept below the lowest place ridden, as a share of the depth shown
// and at least a fixed amount in world units.
const GROUND_SAMPLES = 240;
const BELOW_SHARE = 0.12;
const BELOW_MIN = 80;
// How near a problem's dot a press must be to pick it, in CSS pixels.
const DOT_REACH = 6;

let shown = readShown();
// The trail's outline, drawn once per terrain change, and how it was laid out.
let outline = null;
let layout = null;
let drawnFor = null;
let drawnAt = 0;
let redrawTimer = null;
// While the map is pressed: how far from the view's middle it was grabbed.
let grab = null;
// Validation's problems with a place on the trail, and where their dots were drawn.
let issues = [];
let dots = [];
// The editor's colours, read once from its tokens.
let colours = null;

function readShown() {
  try {
    return store().getItem(SHOWN_KEY) !== "hidden";
  } catch (_) {
    return true;
  }
}

/** Hide or show the map (M). */
export function toggleMinimap() {
  shown = !shown;
  try {
    if (shown) store().removeItem(SHOWN_KEY);
    else store().setItem(SHOWN_KEY, "hidden");
  } catch (_) {
    // Blocked storage: the choice holds until the page reloads.
  }
  drawMinimap();
}

/** The latest validation messages; those about one thing get a dot. */
export function setMinimapIssues(messages) {
  issues = messages.filter((message) => message.target);
}

function readColours() {
  const style = getComputedStyle(document.documentElement);
  const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: token("--color-accent", "#ff8952"),
    error: token("--color-error", "#ec7044"),
    warning: token("--color-warning", "#e8bb66"),
  };
}

/** The map's size in CSS pixels, from the canvas's width. */
function mapSize() {
  const { width } = viewportSize();
  const across = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width * SHARE)));
  return { width: across, height: Math.round(across * SHAPE) };
}

/** Where the trail sits in the map: the scale and the offset that fit it in. */
function layOut(box, { width, height }) {
  const spanX = Math.max(1, box.right - box.left);
  const spanY = Math.max(1, box.bottom - box.top);
  const scale = Math.min((width - INSET * 2) / spanX, (height - INSET * 2) / spanY);
  return {
    box,
    width,
    height,
    scale,
    x: (width - spanX * scale) / 2 - box.left * scale,
    y: (height - spanY * scale) / 2 - box.top * scale,
  };
}

/**
 * The part of the trail the map shows: all of its length, and its depth from
 * the highest ground or apple down to a little below the lowest ground,
 * apple, spike, water, start or finish, which takes in caves that are ridden.
 */
function riddenBox(box) {
  let top = box.top,
    bottom = -Infinity;
  const reach = (y) => {
    if (!Number.isFinite(y)) return;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  };
  for (let index = 0; index <= GROUND_SAMPLES; index++) {
    const y = groundY(box.left + ((box.right - box.left) * index) / GROUND_SAMPLES);
    // Where there is no ground, the answer is the fall line far below.
    if (y <= box.bottom) reach(y);
  }
  for (const apple of editor.trail.apples) reach(objectY(apple, 60));
  for (const spike of editor.trail.spikes) reach(objectY(spike));
  for (const body of waters()) {
    reach(body.y);
    reach(body.y + body.depth);
  }
  const { start } = editor.trail;
  reach(Number.isFinite(start.y) ? start.y : groundY(start.x));
  reach(finishY());
  if (!Number.isFinite(bottom)) return box;
  const below = Math.max(BELOW_MIN, (bottom - top) * BELOW_SHARE);
  return { ...box, top, bottom: Math.min(box.bottom, bottom + below) };
}

/** Draw the trail's blocks and water into the cached outline. */
function drawOutline(map, box, size) {
  layout = layOut(riddenBox(box), size);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  map.style.width = `${layout.width}px`;
  map.style.height = `${layout.height}px`;
  // The help line beside the map keeps clear of it.
  map.parentElement?.style.setProperty("--minimap-width", `${layout.width}px`);
  outline ??= document.createElement("canvas");
  outline.width = Math.round(layout.width * dpr);
  outline.height = Math.round(layout.height * dpr);
  const ctx = outline.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outline.width, outline.height);
  ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.x, dpr * layout.y);
  const outlines = (back) => {
    ctx.beginPath();
    for (const block of blocks()) {
      if (isBackWall(block) !== back) continue;
      for (const ring of [block.outer, ...block.inner]) {
        const { points } = flattenBoundary(ring);
        points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
    }
  };
  // Back walls first and dark, then the terrain the rider rides on, edged in
  // a bright line. The line is stroked before the fill, which covers its
  // inner half, so where blocks overlap only the terrain's outer edge shows.
  outlines(true);
  ctx.fillStyle = "#4d5f59";
  ctx.fill("evenodd");
  outlines(false);
  ctx.strokeStyle = "#eef3e6";
  ctx.lineWidth = 3 / layout.scale;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = "#8a9d8f";
  ctx.fill("evenodd");
  ctx.fillStyle = "#5fa8d3";
  for (const body of waters()) ctx.fillRect(body.x, body.y, body.width, body.depth);
  drawnFor = shownState(size);
  drawnAt = performance.now();
}

/**
 * What the outline shows and how it is fitted, to tell when it needs drawing
 * again. Blocks are edited in place as they are dragged, so they are known by
 * the terrain's fingerprint; the water and the things that decide the depth
 * shown are few enough to compare whole.
 */
function shownState(size) {
  const { apples, spikes, start, finish } = editor.trail;
  return [terrainPrint(), JSON.stringify([waters(), apples, spikes, start, finish]), size.width].join("|");
}

/** Bring the map up to date: the outline when the trail changed, then the marks and the frame. */
export function drawMinimap() {
  const map = /** @type {HTMLCanvasElement | null} */ ($("minimap"));
  if (!map) return;
  const box = terrainBox();
  map.hidden = !shown || !box;
  if (map.hidden || !box) return;
  const size = mapSize();
  if (!outline || drawnFor !== shownState(size)) {
    // A drag changes the terrain every frame; the outline catches up a few
    // times a second, and once more when the drag stops. A new size can't wait.
    const wait = REDRAW_MS - (performance.now() - drawnAt);
    if (!outline || wait <= 0 || layout?.width !== size.width) drawOutline(map, box, size);
    else if (redrawTimer === null)
      redrawTimer = setTimeout(() => {
        redrawTimer = null;
        drawMinimap();
      }, wait);
  }
  colours ??= readColours();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(layout.width * dpr);
  const height = Math.round(layout.height * dpr);
  if (map.width !== width) map.width = width;
  if (map.height !== height) map.height = height;
  const ctx = map.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(outline, 0, 0);
  // From here on, CSS pixels on the map.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const at = (x, y) => [x * layout.scale + layout.x, y * layout.scale + layout.y];
  // The marks go over the dimming, as they are there to find things by.
  drawView(ctx, at);
  drawMarks(ctx, at);
  drawSelection(ctx, at);
  drawIssues(ctx, at);
}

/** Apples, spikes, and flags at the start and finish. */
function drawMarks(ctx, at) {
  ctx.fillStyle = "#e0523a";
  for (const apple of editor.trail.apples) {
    const [x, y] = at(apple.x, objectY(apple, 60));
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.strokeStyle = "#e7ecea";
  ctx.lineWidth = 1;
  for (const spike of editor.trail.spikes) {
    const [x, y] = at(spike.x, objectY(spike));
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x + 2, y + 2);
    ctx.moveTo(x + 2, y - 2);
    ctx.lineTo(x - 2, y + 2);
    ctx.stroke();
  }
  const { start, finish } = editor.trail;
  flag(ctx, ...at(start.x, Number.isFinite(start.y) ? start.y : groundY(start.x)), "#8fd18b");
  flag(ctx, ...at(finish.x, finishY()), "#f0a3c8");
}

/** A flag on a pole, standing on (x, y), a few pixels high whatever the scale. */
function flag(ctx, x, y, colour) {
  const px = Math.round(x) + 0.5;
  ctx.strokeStyle = "#142126";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(px, y - 9);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(px + 0.5, y - 9);
  ctx.lineTo(px + 6, y - 6.5);
  ctx.lineTo(px + 0.5, y - 4);
  ctx.closePath();
  ctx.fill();
}

/** Everything off screen dimmed, and a frame round what is on it. */
function drawView(ctx, at) {
  const view = viewportSize();
  const [left, top] = at(editor.cameraX, editor.cameraY);
  const across = (view.width / editor.zoom) * layout.scale;
  const down = (view.height / editor.zoom) * layout.scale;
  ctx.beginPath();
  ctx.rect(0, 0, layout.width, layout.height);
  ctx.rect(left, top, across, down);
  ctx.fillStyle = "#0e1a1e8c";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#fff3be";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, across, down);
}

/** A box round the selection, at least a few pixels across so a point shows too. */
function drawSelection(ctx, at) {
  const box = editor.selection ? selectionBox() : null;
  if (!box) return;
  const [left, top] = at(box.left, box.top);
  const [right, bottom] = at(box.right, box.bottom);
  const grow = (from, to) => Math.max(0, (5 - (to - from)) / 2);
  const x = grow(left, right),
    y = grow(top, bottom);
  ctx.strokeStyle = colours.accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left - x, top - y, right - left + x * 2, bottom - top + y * 2);
}

/** A ringed dot for each problem, errors over warnings. */
function drawIssues(ctx, at) {
  dots = [];
  const ordered = [...issues].sort((a, b) => (a.type === "error") - (b.type === "error"));
  for (const message of ordered) {
    const position = itemPosition(message.target);
    if (!position?.every(Number.isFinite)) continue;
    const [x, y] = at(...position);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = message.type === "error" ? colours.error : colours.warning;
    ctx.fill();
    ctx.strokeStyle = "#142126";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    dots.push({ x, y, message });
  }
}

/** The problem whose dot is under a pointer, the topmost first, or null. */
function dotAt(event) {
  const bounds = /** @type {HTMLElement} */ ($("minimap")).getBoundingClientRect();
  const x = event.clientX - bounds.left,
    y = event.clientY - bounds.top;
  for (let index = dots.length - 1; index >= 0; index--)
    if (Math.hypot(dots[index].x - x, dots[index].y - y) <= DOT_REACH) return dots[index].message;
  return null;
}

/** The world point under a pointer on the map. */
function worldAt(event) {
  const bounds = /** @type {HTMLElement} */ ($("minimap")).getBoundingClientRect();
  return [
    (event.clientX - bounds.left - layout.x) / layout.scale,
    (event.clientY - bounds.top - layout.y) / layout.scale,
  ];
}

const HINT = "Click or drag to go there. M hides it.";

export function bindMinimap() {
  const map = $("minimap");
  if (!map) return;
  map.addEventListener("pointerdown", (event) => {
    if (!layout || event.button !== 0) return;
    event.preventDefault();
    // A problem's dot selects what it is about and brings it into view.
    const issue = dotAt(event);
    if (issue) {
      revealItem(issue.target);
      return;
    }
    map.setPointerCapture(event.pointerId);
    const [x, y] = worldAt(event);
    const view = viewportSize();
    const left = editor.cameraX,
      top = editor.cameraY;
    const right = left + view.width / editor.zoom,
      bottom = top + view.height / editor.zoom;
    const inside = x >= left && x <= right && y >= top && y <= bottom;
    grab = inside ? [x - (left + right) / 2, y - (top + bottom) / 2] : [0, 0];
    if (!inside) centerOn(x, y);
  });
  map.addEventListener("pointermove", (event) => {
    if (!grab) {
      // Hovering a dot names its problem.
      const issue = layout && dotAt(event);
      map.title = issue ? issue.text : HINT;
      return;
    }
    const [x, y] = worldAt(event);
    centerOn(x - grab[0], y - grab[1]);
  });
  const stop = () => {
    grab = null;
  };
  map.addEventListener("pointerup", stop);
  map.addEventListener("pointercancel", stop);
}
