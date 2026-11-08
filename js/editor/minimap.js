// The mini map: the whole trail in the corner of the canvas, with the part on
// screen framed. A press outside the frame moves the view there, and a drag
// on the frame moves it from where it was grabbed, as the map is too small to
// aim at one spot precisely.
// M hides and shows it, and the choice is remembered.
import { flattenBoundary } from "../terrain-geometry.js";
import { store } from "../local-store.js";
import { blocks, isBackWall } from "./blocks.js";
import { $ } from "./dom.js";
import { finishY, groundY, terrainBox, terrainPrint } from "./render.js";
import { editor, waters } from "./state.js";
import { centerOn, viewportSize } from "./view.js";

const SHOWN_KEY = "hjulben-editor-minimap";
// The map's largest size and its smallest height, in CSS pixels, and the gap
// kept round the trail inside it.
const MAX_WIDTH = 220;
const MAX_HEIGHT = 110;
const MIN_HEIGHT = 36;
const INSET = 6;
// A drag redraws the trail's outline at most this often, in milliseconds; the
// frame round the view follows every frame.
const REDRAW_MS = 120;

let shown = readShown();
// The trail's outline, drawn once per terrain change, and how it was laid out.
let outline = null;
let layout = null;
let drawnFor = null;
let drawnAt = 0;
let redrawTimer = null;
// While the map is pressed: how far from the view's middle it was grabbed.
let grab = null;

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

/** Where the trail sits in the map: its box in the world, the scale and the offset. */
function layOut(box) {
  const spanX = Math.max(1, box.right - box.left);
  const spanY = Math.max(1, box.bottom - box.top);
  let width = MAX_WIDTH;
  let height = (width * spanY) / spanX;
  if (height > MAX_HEIGHT) {
    height = MAX_HEIGHT;
    width = Math.max(MIN_HEIGHT, (height * spanX) / spanY);
  }
  height = Math.max(MIN_HEIGHT, height);
  width = Math.round(width);
  height = Math.round(height);
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

/** Draw the trail's blocks, water, start and finish into the cached outline. */
function drawOutline(map, box) {
  layout = layOut(box);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (map.style.width !== `${layout.width}px`) map.style.width = `${layout.width}px`;
  if (map.style.height !== `${layout.height}px`) map.style.height = `${layout.height}px`;
  outline ??= document.createElement("canvas");
  outline.width = Math.round(layout.width * dpr);
  outline.height = Math.round(layout.height * dpr);
  const ctx = outline.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.x, dpr * layout.y);
  ctx.clearRect(-layout.x / layout.scale, -layout.y / layout.scale, layout.width / layout.scale, layout.height / layout.scale);
  // Back walls first and faint, then the terrain the rider rides on.
  for (const back of [true, false]) {
    ctx.beginPath();
    for (const block of blocks()) {
      if (isBackWall(block) !== back) continue;
      for (const ring of [block.outer, ...block.inner]) {
        const { points } = flattenBoundary(ring);
        points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
    }
    ctx.fillStyle = back ? "#6f817a" : "#d9e3d0";
    ctx.fill("evenodd");
  }
  ctx.fillStyle = "#5fa8d3";
  for (const body of waters()) ctx.fillRect(body.x, body.y, body.width, body.depth);
  // The start and finish as dots a few pixels across, whatever the scale.
  const dot = (x, y, colour) => {
    ctx.beginPath();
    ctx.arc(x, y, 2.5 / layout.scale, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  const { start, finish } = editor.trail;
  dot(start.x, Number.isFinite(start.y) ? start.y : groundY(start.x), "#8fd18b");
  dot(finish.x, finishY(), "#f0a3c8");
  drawnFor = shownState();
  drawnAt = performance.now();
}

/**
 * What the outline shows, to tell when it needs drawing again. Blocks are
 * edited in place as they are dragged, so they are known by the terrain's
 * fingerprint; the water, start and finish are few enough to compare whole.
 */
function shownState() {
  const { start, finish } = editor.trail;
  return [terrainPrint(), JSON.stringify(waters()), start.x, start.y, finish.x, finishY()].join("|");
}

/** Bring the map up to date: the outline when the trail changed, and the view's frame. */
export function drawMinimap() {
  const map = /** @type {HTMLCanvasElement | null} */ ($("minimap"));
  if (!map) return;
  const box = terrainBox();
  map.hidden = !shown || !box;
  if (map.hidden || !box) return;
  if (!outline || drawnFor !== shownState()) {
    // A drag changes the terrain every frame; the outline catches up a few
    // times a second, and once more when the drag stops.
    const wait = REDRAW_MS - (performance.now() - drawnAt);
    if (!outline || wait <= 0) drawOutline(map, box);
    else if (redrawTimer === null)
      redrawTimer = setTimeout(() => {
        redrawTimer = null;
        drawMinimap();
      }, wait);
  }
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
  // The part of the trail on screen.
  const view = viewportSize();
  const left = (editor.cameraX * layout.scale + layout.x) * dpr;
  const top = (editor.cameraY * layout.scale + layout.y) * dpr;
  const across = (view.width / editor.zoom) * layout.scale * dpr;
  const down = (view.height / editor.zoom) * layout.scale * dpr;
  ctx.fillStyle = "#fff3be1f";
  ctx.fillRect(left, top, across, down);
  ctx.strokeStyle = "#fff3be";
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeRect(left, top, across, down);
}

/** The world point under a pointer on the map. */
function worldAt(event) {
  const bounds = /** @type {HTMLElement} */ ($("minimap")).getBoundingClientRect();
  return [
    (event.clientX - bounds.left - layout.x) / layout.scale,
    (event.clientY - bounds.top - layout.y) / layout.scale,
  ];
}

export function bindMinimap() {
  const map = $("minimap");
  if (!map) return;
  map.addEventListener("pointerdown", (event) => {
    if (!layout || event.button !== 0) return;
    event.preventDefault();
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
    if (!grab || !layout) return;
    const [x, y] = worldAt(event);
    centerOn(x - grab[0], y - grab[1]);
  });
  const stop = () => {
    grab = null;
  };
  map.addEventListener("pointerup", stop);
  map.addEventListener("pointercancel", stop);
}
