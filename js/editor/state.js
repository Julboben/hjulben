// Editor state shared across modules. Everything else lives in the module
// that owns it.
// How far the view can zoom out and in.
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 6;

/** Keep a zoom level within the editor's range. */
export function clampZoom(zoom) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** How near, in screen pixels, the pointer must be to grab a point or handle. */
export const HIT_REACH = 13;
/**
 * Edges are only grabbed when the pointer is on them, so a click a little
 * inside a block, even zoomed out, picks the block.
 */
export const EDGE_REACH = 7;
/** Inside a selected block, a point is only grabbed on its drawn dot. */
export const DOT_REACH = 7;

export const editor = {
  devServer: false,
  trailIndex: null,
  trail: null,
  // A trail this editor can't save (official, bonus or file trails without
  // the dev server) can be looked at, played and duplicated, but not edited.
  readOnly: false,
  tool: "select",
  selection: null,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
  spaceHeld: false,
  // The version the author opened: { kind: "saved" | "draft", at, base, edited },
  // where base is its pretty JSON, so edits since then can be told apart.
  version: null,
  history: [],
  future: [],
  snapGuide: null,
  gameArt: null,
  // The Block or Cut drag currently in progress, drawn live so the author sees the
  // shape before committing it.
  pendingShape: null,
  // The Select tool's selection box while it is being dragged.
  marquee: null,
  hoverPoint: null,
  // The point, curve handle or edge a press would grab, highlighted.
  hoverOutline: null,
  // The group the author has gone into to work on its members one at a time.
  openGroup: null,
  // The editor opens on the start, placed a little below the middle so the
  // ground and the sky above it are both in view.
  focusPending: true,
  pointerClient: null,
};

/** The trail's water bodies, created on first use for a trail saved without any. */
export function waters() {
  if (!Array.isArray(editor.trail.water)) editor.trail.water = [];
  return editor.trail.water;
}
