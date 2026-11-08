// Snapping for the trail editor: a Shift-dragged point is locked to fixed
// angle steps around a neighbouring point and to the grid, and anything
// dragged lines up with other things and the grid nearby (see magnet.js).

export const SNAP_ANGLE_STEP = 15;

/** The spacing of the grid lines the editor draws, so what you see is what snaps. */
export function gridSpacing(zoom) {
  // Coarser when zoomed out, so lines stay at least ~35px apart on screen.
  if (zoom < .18) return 500;
  if (zoom < .35) return 200;
  if (zoom < .65) return 100;
  // Finer when zoomed right in, for placing things precisely.
  if (zoom >= 4) return 10;
  return zoom >= 2 ? 25 : 50;
}

/**
 * Snap a point onto the grid, and onto an angle ray from a nearby anchor.
 *
 * With anchors, the direction from each anchor to the pointer is rounded to
 * the nearest angle step. The point then slides along that ray to the nearest
 * grid line it crosses, so the result sits on the ray and on a grid line. Of
 * the anchors, the one whose result is nearest the pointer is used. Without
 * anchors the point simply snaps to the nearest grid intersection.
 *
 * @param {{x: number, y: number}} target where the pointer wants the point
 * @param {Array<{x: number, y: number}>} anchors points the angle is measured from
 * @param {number} spacing grid spacing in world units
 * @param {number} [angleStep] angle increment in degrees
 * @returns {{x: number, y: number, anchor: {x: number, y: number} | null, angle: number, length: number}}
 */
export function snapToAngleAndGrid(target, anchors, spacing, angleStep = SNAP_ANGLE_STEP) {
  const gridPoint = {
    x: Math.round(target.x / spacing) * spacing,
    y: Math.round(target.y / spacing) * spacing,
  };
  let best = null;
  for (const anchor of anchors) {
    const dx = target.x - anchor.x, dy = target.y - anchor.y;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    const step = angleStep * Math.PI / 180;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    // Exact zeros keep horizontal and vertical rays perfectly straight.
    const clean = value => Math.abs(value) < 1e-9 ? 0 : value;
    const ux = clean(Math.cos(angle)), uy = clean(Math.sin(angle));
    // Distance along the ray that is closest to the pointer (always positive
    // here, since the ray is within half a step of the pointer's direction).
    const along = dx * ux + dy * uy;
    let x, y;
    if (Math.abs(ux) >= Math.abs(uy)) {
      x = Math.round((anchor.x + along * ux) / spacing) * spacing;
      // Never fold back through the anchor or collapse onto it.
      if ((x - anchor.x) * ux <= 0) x = (ux > 0 ? Math.floor(anchor.x / spacing) + 1 : Math.ceil(anchor.x / spacing) - 1) * spacing;
      y = anchor.y + (x - anchor.x) * uy / ux;
    } else {
      y = Math.round((anchor.y + along * uy) / spacing) * spacing;
      if ((y - anchor.y) * uy <= 0) y = (uy > 0 ? Math.floor(anchor.y / spacing) + 1 : Math.ceil(anchor.y / spacing) - 1) * spacing;
      x = anchor.x + (y - anchor.y) * ux / uy;
    }
    const distance = Math.hypot(x - target.x, y - target.y);
    if (!best || distance < best.distance) {
      const degrees = angle * 180 / Math.PI;
      best = { x, y, anchor, angle: clean(Math.round(degrees * 1000) / 1000), length: Math.hypot(x - anchor.x, y - anchor.y), distance };
    }
  }
  if (!best) return { ...gridPoint, anchor: null, angle: 0, length: 0 };
  return { x: best.x, y: best.y, anchor: best.anchor, angle: best.angle, length: best.length };
}

// How close, in screen pixels, an edge has to come to something before it
// snaps to it, as in Figma: near enough to catch, far enough to slip past.
export const SNAP_DISTANCE = 6;

/**
 * Snap one axis of a move: the moving lines (`sources`, where they were
 * before the move) are shifted by `delta`, and the move is adjusted so the
 * nearest one lands on a target line within `threshold`. Lines of other
 * things win over the grid, so things line up with each other first.
 *
 * @param {number} delta how far the pointer has moved along this axis
 * @param {number[]} sources positions of the moving selection's lines
 * @param {number[]} targets positions of other things' lines
 * @param {number} threshold world units
 * @param {number} spacing grid spacing in world units
 * @returns {{delta: number, at: number | null, grid: boolean}} where `at` is
 *   the line it snapped to, or null when nothing was close enough
 */
export function snapAxis(delta, sources, targets, threshold, spacing) {
  let best = null;
  for (const source of sources) {
    const moved = source + delta;
    for (const target of targets) {
      const gap = target - moved;
      if (Math.abs(gap) <= threshold && (!best || Math.abs(gap) < Math.abs(best.gap)))
        best = { gap, at: target };
    }
  }
  if (!best && spacing > 0)
    for (const source of sources) {
      const moved = source + delta;
      const line = Math.round(moved / spacing) * spacing;
      const gap = line - moved;
      if (Math.abs(gap) <= threshold && (!best || Math.abs(gap) < Math.abs(best.gap)))
        best = { gap, at: line, grid: true };
    }
  if (!best) return { delta, at: null, grid: false };
  return { delta: delta + best.gap, at: best.at, grid: Boolean(best.grid) };
}

/**
 * Lock a move to horizontal, vertical or 45°, whichever is nearest its
 * direction, as Shift does in Figma.
 *
 * @returns {{dx: number, dy: number, angle: number}}
 */
export function lockDirection(dx, dy) {
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const ux = Math.round(Math.cos(angle)), uy = Math.round(Math.sin(angle));
  // Along a diagonal both axes move by the same amount: the mean of the two.
  const along = ux && uy ? (Math.abs(dx) + Math.abs(dy)) / 2 : ux ? Math.abs(dx) : Math.abs(dy);
  return { dx: ux * along, dy: uy * along, angle: Math.round(angle * 180 / Math.PI) };
}
