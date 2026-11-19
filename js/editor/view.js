// Camera, zoom, the game art and grid toggles and screen-to-world conversion.
import { store } from "../local-store.js";
import { $, canvas, ctx } from "./dom.js";
import {
  GAME_ART_KEY,
  GAME_ART_MIN_ZOOM,
  groundY,
  render,
  renderView,
  syncTerrain,
  terrainBox,
} from "./render.js";
import { clampZoom, editor } from "./state.js";

/** The box round every block of the trail, or null without any. */
export const trailBounds = () => terrainBox();

// How far past the trail the view can be panned, in world units at zoom 1:
// generous, so there is room to build on, but the trail can't be lost
// altogether.
const PAN_MARGIN = 3000;

/**
 * Keep the trail within reach: the view may wander a good way past the blocks,
 * but never so far that none of them could be found again.
 */
export function clampCamera() {
  const bounds = trailBounds();
  if (!bounds) return;
  const { width, height } = viewportSize();
  const margin = PAN_MARGIN / Math.min(1, editor.zoom);
  const viewWidth = width / editor.zoom;
  const viewHeight = height / editor.zoom;
  const minX = bounds.left - margin;
  const maxX = Math.max(minX, bounds.right + margin - viewWidth);
  const minY = bounds.top - margin;
  const maxY = Math.max(minY, bounds.bottom + margin - viewHeight);
  editor.cameraX = Math.min(maxX, Math.max(minX, editor.cameraX));
  editor.cameraY = Math.min(maxY, Math.max(minY, editor.cameraY));
}

/** Zoom and move the view so the whole trail is in it, with a little air round it. */
export function fitTrail() {
  const bounds = trailBounds();
  const { width, height } = viewportSize();
  if (!bounds || !width || !height) return false;
  const padding = 80;
  const spanX = bounds.right - bounds.left + padding * 2;
  const spanY = bounds.bottom - bounds.top + padding * 2;
  editor.zoom = clampZoom(Math.min(width / spanX, height / spanY));
  editor.cameraX = (bounds.left + bounds.right) / 2 - width / 2 / editor.zoom;
  editor.cameraY = (bounds.top + bounds.bottom) / 2 - height / 2 / editor.zoom;
  editor.focusPending = false;
  updateZoom();
  return true;
}

export function focusOnStart() {
  const { width, height } = viewportSize();
  if (!width || !height) return false;
  syncTerrain();
  const startY = Number.isFinite(editor.trail.start.y)
    ? editor.trail.start.y
    : groundY(editor.trail.start.x) - 12;
  editor.cameraX = editor.trail.start.x - width / 2 / editor.zoom;
  editor.cameraY = startY - (height * 0.6) / editor.zoom;
  editor.focusPending = false;
  return true;
}

export function resize() {
  const bounds = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * dpr));
  canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (editor.focusPending) focusOnStart();
  render();
}

export function viewportSize() {
  const bounds = canvas.getBoundingClientRect();
  return { width: bounds.width, height: bounds.height };
}

export function pointerWorld(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: editor.cameraX + (event.clientX - bounds.left) / editor.zoom,
    y: editor.cameraY + (event.clientY - bounds.top) / editor.zoom,
  };
}

/** Move the view so a world position is in its middle, keeping the zoom. */
export function centerOn(x, y) {
  const { width, height } = viewportSize();
  editor.cameraX = x - width / 2 / editor.zoom;
  editor.cameraY = y - height / 2 / editor.zoom;
  editor.focusPending = false;
  renderView();
}

/** Zoom by a factor, keeping the middle of the view where it is. */
export function zoomAtCenter(factor) {
  const { width, height } = viewportSize();
  const centerX = editor.cameraX + width / 2 / editor.zoom;
  const centerY = editor.cameraY + height / 2 / editor.zoom;
  editor.zoom = clampZoom(editor.zoom * factor);
  editor.cameraX = centerX - width / 2 / editor.zoom;
  editor.cameraY = centerY - height / 2 / editor.zoom;
  updateZoom();
}

export function updateZoom() {
  clampCamera();
  $("zoom-label").textContent = Math.round(editor.zoom * 100) + "%";
  updateGameArtButton();
  renderView();
}

/** Draw the terrain with the game's own art, or as plain shapes, and remember it. */
export function setGameArt(on) {
  editor.gameArt = on;
  try {
    store().setItem(GAME_ART_KEY, on ? "1" : "0");
  } catch (_) {}
  updateGameArtButton();
  render();
}

export const toggleGameArt = () => setGameArt(!editor.gameArt);

export const GRID_KEY = "hjulben-editor-grid-hidden";

/** Show or hide the grid, which things only snap to while it shows, and remember it. */
export function setGrid(on) {
  editor.grid = on;
  try {
    if (on) store().removeItem(GRID_KEY);
    else store().setItem(GRID_KEY, "1");
  } catch (_) {}
  updateGridButton();
  render();
}

export const toggleGrid = () => setGrid(!editor.grid);

export function updateGridButton() {
  $("toggle-grid-label").textContent = editor.grid ? "Hide grid" : "Show grid";
}

// Below GAME_ART_MIN_ZOOM the art is not drawn even when it is on, so the
// button dims and says why rather than looking broken.
export function updateGameArtButton() {
  const button = $("game-art");
  const zoomedOut = editor.zoom < GAME_ART_MIN_ZOOM;
  button.setAttribute("aria-pressed", String(Boolean(editor.gameArt)));
  button.classList.toggle("zoomed-out", zoomedOut);
  button.title = !editor.gameArt
    ? "Show game art (Y)"
    : zoomedOut
      ? `Game art shows from ${Math.round(GAME_ART_MIN_ZOOM * 100)}% zoom (Y to hide)`
      : "Hide game art (Y)";
}

/** Hide or show both side panels, leaving the canvas the whole width. */
export function toggleSidePanels() {
  const workspace = document.querySelector(".workspace");
  const hidden = !workspace.classList.contains("panels-hidden");
  workspace.classList.toggle("panels-hidden", hidden);
  for (const panel of document.querySelectorAll(".toolbox, .inspector")) panel.inert = hidden;
}
