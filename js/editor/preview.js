// The trail's thumbnail in the game's trail list. The Trail tab shows it live;
// Edit preview puts a frame on the canvas, the exact area the thumbnail shows,
// to drag where it should look. The zoom is the same on every trail.
import { TRAIL_PREVIEW, trailPreviewCentre } from "../trail-preview.js";
import { $, canvas, ctx } from "./dom.js";
import { pushHistory, snapshot } from "./history.js";
import { syncInspector } from "./inspector.js";
import { render } from "./render.js";
import { editor } from "./state.js";
import { refuseEdit, showStatus } from "./status.js";
import { centerOn, viewportSize } from "./view.js";

let editing = false;

// The automatic framing, worked out once when editing starts: it walks the
// whole trail, too slow to repeat for every frame drawn.
let automatic = null;

// A drag of the frame: where it was grabbed, relative to the frame's middle,
// and the trail before it, which becomes an undo step once the frame moves.
let drag = null;

let thumbnailTimer = 0;

export const editingPreview = () => editing;

function centre() {
  if (editor.trail.preview) return editor.trail.preview;
  automatic ??= trailPreviewCentre(editor.trail);
  return automatic;
}

/** The area the thumbnail shows, in world units. */
export function previewFrame() {
  const { x, y } = centre();
  const { width, height } = TRAIL_PREVIEW;
  return { left: x - width / 2, top: y - height / 2, width, height };
}

/** Redraws the Trail tab's thumbnail soon, once a run of changes settles. */
export function schedulePreviewThumbnail() {
  clearTimeout(thumbnailTimer);
  thumbnailTimer = setTimeout(drawThumbnail, drag ? 60 : 150);
}

async function drawThumbnail() {
  const target = /** @type {HTMLCanvasElement} */ ($("trail-preview"));
  // Only while it can be seen: the Trail tab is open.
  if (!target || $("panel-trail").hidden) return;
  try {
    // The game's renderer is big, so it loads the first time a thumbnail is drawn.
    const { drawTrailPreview } = await import("../scene-preview.js");
    drawTrailPreview(target, editor.trail);
  } catch (_) {
    // A trail half-way through an edit may not draw; the next change redraws it.
  }
}

/** The Trail tab's buttons and note, for the trail as it is. */
export function syncPreviewControls() {
  const framed = Boolean(editor.trail.preview);
  $("edit-preview").textContent = editing ? "DONE" : "EDIT PREVIEW";
  $("edit-preview").classList.toggle("active", editing);
  $("reset-preview").disabled = !framed;
  $("preview-note").textContent = editing
    ? "Drag the frame on the canvas to choose what the trail list shows. Esc when done."
    : framed
      ? "Framed by you."
      : "Automatic: the trail's most eventful stretch.";
  schedulePreviewThumbnail();
}

export function startEditingPreview() {
  if (refuseEdit()) return;
  editing = true;
  automatic = null;
  // Start where the thumbnail looks now, in view.
  const { x, y } = centre();
  centerOn(x, y);
  canvas.style.cursor = "move";
  syncPreviewControls();
}

export function stopEditingPreview() {
  if (!editing) return;
  editing = false;
  drag = null;
  canvas.style.cursor = editor.tool === "pan" ? "grab" : editor.tool === "select" ? "default" : "crosshair";
  syncPreviewControls();
  renderLater();
}

/** Back to the automatic framing. */
export function resetPreview() {
  if (!editor.trail.preview || refuseEdit()) return;
  pushHistory();
  delete editor.trail.preview;
  // The trail may have changed since the automatic framing was last worked out.
  automatic = null;
  showStatus("info", "The preview is automatic again.");
  // Like any edit: the trail's JSON, the save buttons and the autosave catch up.
  syncInspector();
  renderLater();
}

/**
 * A press on the canvas while editing: grabbing the frame drags it from
 * where it was held; a press outside brings its middle there.
 */
export function beginPreviewDrag(point) {
  const frame = previewFrame();
  const inside = point.x >= frame.left && point.x <= frame.left + frame.width
    && point.y >= frame.top && point.y <= frame.top + frame.height;
  const middle = centre();
  drag = {
    offset: inside ? { x: point.x - middle.x, y: point.y - middle.y } : { x: 0, y: 0 },
    before: snapshot(),
  };
  if (!inside) movePreviewDrag(point);
}

/** @returns {boolean} whether a frame drag took the move */
export function movePreviewDrag(point) {
  if (!drag) return false;
  if (drag.before) {
    pushHistory(drag.before);
    drag.before = null;
  }
  editor.trail.preview = {
    x: Math.round(point.x - drag.offset.x),
    y: Math.round(point.y - drag.offset.y),
  };
  // Like any edit, so Save sees the change; live, as the rest waits for the drag to end.
  syncInspector({ live: true });
  renderLater();
  return true;
}

/** @returns {boolean} whether a frame drag ended */
export function endPreviewDrag() {
  if (!drag) return false;
  const moved = drag.before === null;
  drag = null;
  if (moved) syncInspector();
  else schedulePreviewThumbnail();
  return true;
}

export const draggingPreview = () => drag !== null;

const renderLater = () => render();

/**
 * While editing: everything outside the frame is dimmed, like a camera's
 * viewfinder, with the frame and its name on top. In world units, drawn
 * with the canvas already moved to the camera.
 */
export function drawPreviewFrame() {
  if (!editing) return;
  const frame = previewFrame();
  const { width, height } = viewportSize();
  const view = { x: editor.cameraX, y: editor.cameraY, width: width / editor.zoom, height: height / editor.zoom };
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.width, view.height);
  ctx.rect(frame.left, frame.top, frame.width, frame.height);
  ctx.fillStyle = "#0b161acc";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#fff3be";
  ctx.lineWidth = 2 / editor.zoom;
  ctx.setLineDash([8 / editor.zoom, 5 / editor.zoom]);
  ctx.strokeRect(frame.left, frame.top, frame.width, frame.height);
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff3be";
  ctx.font = `${12 / editor.zoom}px system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillText("TRAIL PREVIEW", frame.left, frame.top - 5 / editor.zoom);
  ctx.restore();
}
