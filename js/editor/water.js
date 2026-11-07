// Water bodies in the editor: drawing them with the Water tool, and where
// their handle sits. A body is grabbed and moved by the middle of its surface.
import { WATER_SIZE, WATER_WIPEOUT_DEPTH, deepWater } from "../water.js";
import { editor, waters } from "./state.js";

/** Screen pixels a Water drag must cover to draw a body rather than count as a click. */
const CLICK_SIZE = 6;

/** The handle of a body: the middle of its surface. */
export function waterHandle(body) {
  return [body.x + body.width / 2, body.y];
}

/** Move a body so its handle lands on (x, y). */
export function moveWaterTo(body, x, y) {
  body.x = x - body.width / 2;
  body.y = y;
}

const tidy = (value) => Math.round(value * 10) / 10;

/** A width or depth for a body, clamped to the smallest allowed. */
export function waterSize(value, key) {
  const min = key === "width" ? WATER_SIZE.minWidth : WATER_SIZE.minDepth;
  const number = Number(value);
  return tidy(Math.max(min, Number.isFinite(number) ? number : WATER_SIZE[key]));
}

/**
 * Add a body from a finished Water drag, the dragged rectangle, and select
 * it. A click adds nothing, so it returns null.
 */
export function commitWater(shape) {
  const [sx, sy] = shape.points[0];
  const [ex, ey] = shape.points[2];
  if (
    Math.abs(ex - sx) * editor.zoom < CLICK_SIZE &&
    Math.abs(ey - sy) * editor.zoom < CLICK_SIZE
  )
    return null;
  const width = waterSize(Math.abs(ex - sx), "width");
  const depth = waterSize(Math.abs(ey - sy), "depth");
  const body = { x: tidy(Math.min(sx, ex)), y: tidy(Math.min(sy, ey)), width, depth };
  waters().push(body);
  editor.selection = { kind: "water", index: waters().length - 1 };
  return body;
}

/** What a body of this depth does to a rider, for the inspector. */
export function waterDepthHint(depth) {
  return deepWater(depth)
    ? `Deep (over ${WATER_WIPEOUT_DEPTH}): wipes the rider out.`
    : `Shallow (up to ${WATER_WIPEOUT_DEPTH}): the bike rides through, slowed.`;
}
