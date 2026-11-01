import { fallLine, terrainAt, terrainGeometry } from "./terrain.js";
import { hypot } from "./det-math.js";
import {
  signLines,
  TEXT_PROPS,
  SIGN_LINE_CHARACTERS,
  SIGN_MAX_LINES,
  BACKDROPS,
  ART_PIXEL,
} from "./drawing.js";
import { RADIUS, WHEELBASE } from "./config.js";
import { WATER_SIZE, normalizeWater, waterAt, waterBodies, waterColumns } from "./water.js";
import { WATER_PROPS, SURFACE_PROPS, waterPropBody } from "./water-props.js";
import { STALL_SIGN_LINE, STALL_SIGN_LINES, stallSignLines } from "./countryside-props.js";
import { BANNER_MAX } from "./event-props.js";
import { FINISH_FLOWER_LIFT, bikeTouchesFlower } from "./finish.js";
import { WEATHER_DEFAULTS, WEATHER_LEVELS, WIND_DIRECTIONS, resolveWeather } from "./weather.js";
import { DEFAULT_HOUR, HOURS, normalizeHour } from "./time-of-day.js";
import { isSeeThrough } from "./materials.js";
import {
  normalizeBlocks as normalizeTerrainBlocks,
  validateBlocks as validateTerrainBlocks,
  pointInRegion,
  pointInRings,
  regionBounds,
  regionRings,
} from "./terrain-geometry.js";
/** Blocks for a brand new trail: one rectangular slab to build on. */
export function createBlankTerrainBlocks(material = "grass") {
  return normalizeTerrainBlocks(
    [
      {
        id: "block-1",
        material,
        outer: {
          id: "boundary-1",
          nodes: [
            {
              id: "n1",
              x: 0,
              y: 320,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
            {
              id: "n2",
              x: 420,
              y: 300,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
            {
              id: "n3",
              x: 900,
              y: 336,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
            {
              id: "n4",
              x: 1400,
              y: 300,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
            {
              id: "n5",
              x: 1400,
              y: 580,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
            {
              id: "n6",
              x: 0,
              y: 580,
              mode: "corner",
              in: null,
              out: null,
              edge: "straight",
            },
          ],
        },
        inner: [],
      },
    ],
  );
}

export const cloneTrail = (trail) => JSON.parse(JSON.stringify(trail));

export function createBlankTrail() {
  return {
    name: "New Trail",
    finish: { x: 1200, y: null },
    description: "",
    start: { x: 90, y: null, facing: 1 },
    terrainBlocks: createBlankTerrainBlocks(),
    apples: [
      { x: 260, y: null },
      { x: 470, y: null },
      { x: 710, y: null },
      { x: 930, y: null },
      { x: 1100, y: null },
    ],
    props: [],
    spikes: [],
    water: [],
    weather: { ...WEATHER_DEFAULTS },
    timeOfDay: DEFAULT_HOUR,
  };
}

/** The terrain blocks on a trail, normalized. */
export function trailTerrainBlocks(trail) {
  return allTrailBlocks(trail).filter((block) => !isBackWall(block));
}

/** Is this block a back wall, scenery behind the terrain, rather than solid? */
export const isBackWall = (block) => block?.layer === "back";

/** The back walls on a trail, normalized: the blocks on the `back` layer. */
export function trailBackWalls(trail) {
  return allTrailBlocks(trail).filter(isBackWall);
}

function allTrailBlocks(trail) {
  return normalizeTerrainBlocks(trail?.terrainBlocks) || [];
}

/**
 * Where the finish stands, in world units.
 *
 * Like the start, a finish is a point: `trail.finish.y` holds an explicit height
 * once the author has placed it somewhere other than the ground, and null means
 * "stand on whatever surface is here". That is what lets a finish sit on a
 * floating block, or high above a cave, instead of being pinned to the ground.
 *
 * The finish is a flower that floats a little above that anchor; the run ends
 * when the bike touches it, wherever the bike comes from.
 */
export function finishHeight(trail) {
  if (Number.isFinite(trail?.finish?.y)) return trail.finish.y;
  return (
    surfaceBelow(trail, trail?.finish?.x ?? 0, null)?.y ?? fallLine(trail)
  );
}

/** The centre of the finish flower, which is what the bike has to touch. */
export function finishFlower(trail) {
  return { x: trail.finish.x, y: finishHeight(trail) - FINISH_FLOWER_LIFT };
}

/**
 * The topmost solid surface at or below `referenceY`. This is the single
 * answer to "where does something at this x rest". It reads the trail's
 * cached geometry, so it is cheap to call per object.
 */
export function surfaceBelow(trail, x, referenceY = null) {
  const surface = terrainAt(trail, x, referenceY);
  return surface?.solid ? surface : null;
}

/** A surface's height at an x, falling back to the trail's kill plane. */
function groundHeight(trail, x) {
  const surface = surfaceBelow(trail, x, null);
  return surface ? surface.y : fallLine(trail);
}

export const SPIKE_RADIUS = { min: 8, max: 64, default: 18 };
/**
 * Normalize a spike. `groundY` is the surface height at the spike's x, used
 * when the spike has no y of its own.
 */
export function normalizeSpike(spike, groundY = null) {
  const radius = Math.max(
    SPIKE_RADIUS.min,
    Math.min(SPIKE_RADIUS.max, Number(spike?.radius) || SPIKE_RADIUS.default),
  );
  const x = Number(spike?.x) || 0;
  const explicit = Number.isFinite(Number(spike?.y)) && spike?.y !== null;
  const surface = !explicit && Number.isFinite(groundY) ? groundY : 620;
  const y = explicit ? Number(spike.y) : surface - radius;
  const spin = Number(spike?.spin);
  return { x, y, radius, spin: Number.isFinite(spin) ? spin : 1 };
}

export const AUTHOR_MAX_LENGTH = 40;
// The name is shown in the trail list, so it can't run on for ever; the
// description is the trail's blurb.
export const NAME_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 2000;
/** A trail's notes for the career's overview, and how long each may be. */
export const OVERVIEW_KEYS = ["lesson", "alsoNew", "world"];
export const OVERVIEW_MAX_LENGTH = 400;
// Past these the editor and the game slow down, so the author is warned.
export const PROP_WARNING_COUNT = 300;
export const APPLE_WARNING_COUNT = 200;
export const SPIKE_WARNING_COUNT = 200;

/**
 * A prop's rotation in degrees, clockwise: wrapped to (-180, 180] and rounded
 * to a tenth of a degree. No rotation, or none worth keeping, is undefined so
 * it isn't stored.
 */
export function normalizeRotation(rotation) {
  if (rotation === null || rotation === undefined || rotation === "") return undefined;
  const value = Number(rotation);
  if (!Number.isFinite(value)) return undefined;
  let wrapped = Math.round((value % 360) * 10) / 10;
  if (wrapped <= -180) wrapped += 360;
  else if (wrapped > 180) wrapped -= 360;
  return wrapped === 0 ? undefined : wrapped;
}

/** Who made the trail: one line of text, whitespace collapsed, or "". */
export function normalizeAuthor(author) {
  return typeof author === "string"
    ? author.replace(/\s+/g, " ").trim().slice(0, AUTHOR_MAX_LENGTH)
    : "";
}

// A null y means "on the surface below". The null check has to come first:
// Number(null) is 0, which would silently pin the point to the top of the world.
const optionalY = (y) =>
  y === null || y === undefined || !Number.isFinite(Number(y)) ? null : Number(y);

export function normalizeTrail(input) {
  const fallback = createBlankTrail();
  const trail = { ...fallback, ...cloneTrail(input || {}) };
  trail.name = String(trail.name || fallback.name).slice(0, NAME_MAX_LENGTH);
  // Older files and share links may carry a label: a numbered caption that
  // nothing shows any more, so it is dropped.
  delete trail.label;
  // Credits are optional; an empty author is not stored.
  const author = normalizeAuthor(trail.author);
  if (author) trail.author = author;
  else delete trail.author;
  trail.description =
    typeof trail.description === "string"
      ? trail.description.slice(0, DESCRIPTION_MAX_LENGTH)
      : "";
  // Notes for the career's overview (TRAILS.md): what the trail teaches, what
  // is new to look at, and the world it belongs to. Optional, not part of the
  // ride, and left out when empty.
  for (const key of OVERVIEW_KEYS) {
    const text = typeof trail[key] === "string" ? trail[key].trim().slice(0, OVERVIEW_MAX_LENGTH) : "";
    if (text) trail[key] = text;
    else delete trail[key];
  }
  // The finish is a point, like the start. A null y means it stands on the
  // surface below, which is what a plain ground finish wants; a number pins it
  // in the air.
  const finish = trail.finish || fallback.finish;
  trail.finish = {
    x: Number(finish.x) || fallback.finish.x,
    y: optionalY(finish.y),
  };
  // Terrain comes from the input only: a trail without blocks has no terrain,
  // which validation reports, rather than silently getting the blank slab.
  trail.terrainBlocks =
    normalizeTerrainBlocks(input?.terrainBlocks) || [];
  const start = trail.start || fallback.start;
  trail.start = {
    // 0 is a valid start, so only a missing or broken x falls back.
    x: typeof start.x === "number" && Number.isFinite(start.x) ? start.x : Number(start.x) || 90,
    y: optionalY(start.y),
    facing: Number(start.facing) < 0 ? -1 : 1,
  };
  // An apple without a height, or with one that isn't a number, hangs over
  // the ground, like a prop.
  trail.apples = Array.isArray(trail.apples)
    ? trail.apples.map((apple) => ({
        x: Number(apple?.x) || 0,
        y: optionalY(apple?.y),
      }))
    : [];
  // The optional hidden nisse: at most one, where its feet stand. A trail
  // without one has no `nisse` field at all.
  if (trail.nisse && typeof trail.nisse === "object" && Number.isFinite(Number(trail.nisse.x)))
    trail.nisse = { x: Number(trail.nisse.x), y: optionalY(trail.nisse.y) };
  else delete trail.nisse;
  // Where the trail list's thumbnail is centred, framed in the editor. Without
  // it the game picks the trail's most eventful stretch.
  // Null and "" would pass as 0, so they count as missing.
  const coordinate = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
  const preview = trail.preview;
  if (preview && typeof preview === "object" && coordinate(preview.x) && coordinate(preview.y))
    trail.preview = { x: Math.round(Number(preview.x)), y: Math.round(Number(preview.y)) };
  else delete trail.preview;
  trail.props = Array.isArray(trail.props)
    ? trail.props.map((prop) => ({
        x: Number(prop.x) || 0,
        y:
          prop.y === null || prop.y === undefined
            ? null
            : Number.isFinite(Number(prop.y))
              ? Number(prop.y)
              : null,
        type: String(prop.type || "tree"),
        layer: prop.layer === "front" ? "front" : "back",
        text:
          TEXT_PROPS.has(prop.type) && typeof prop.text === "string"
            ? prop.text
            : undefined,
        flip: prop.flip === true ? true : undefined,
        rotation: normalizeRotation(prop.rotation),
      }))
    : [];
  trail.spikes = Array.isArray(trail.spikes)
    ? trail.spikes.map((spike) =>
        normalizeSpike(
          spike,
          surfaceBelow(trail, Number(spike?.x) || 0, null)?.y ?? null,
        ),
      )
    : [];
  trail.water = Array.isArray(trail.water) ? trail.water.map(normalizeWater) : [];
  // Every setting is spelled out, defaults included, so the editor shows what
  // the game draws; unknown settings are dropped.
  trail.weather = resolveWeather(trail.weather);
  // The hour of the day, 0…23: rounded and wrapped round the clock, and noon
  // when it is missing or unreadable.
  trail.timeOfDay = normalizeHour(trail.timeOfDay);
  // Hills is the default, so it isn't stored.
  if (!BACKDROPS.includes(trail.backdrop) || trail.backdrop === "hills")
    delete trail.backdrop;
  const medals = normalizeMedals(trail.medals);
  if (medals) trail.medals = medals;
  else delete trail.medals;
  // Bonus trails used to carry their unlock rule; js/unlocks.js holds every
  // rule now, so one left in an older file is dropped.
  delete trail.unlock;
  return trail;
}

export const MEDALS = ["gold", "silver", "bronze"];

/** Target times in seconds; invalid or incomplete tables are dropped. */
export function normalizeMedals(medals) {
  if (!medals || typeof medals !== "object") return null;
  const times = MEDALS.map((name) => Number(medals[name]));
  if (!times.every((time) => Number.isFinite(time) && time > 0)) return null;
  return { gold: times[0], silver: times[1], bronze: times[2] };
}

/** @returns {'gold' | 'silver' | 'bronze' | null} */
export function medalFor(medals, time) {
  if (!medals) return null;
  return MEDALS.find((name) => time <= medals[name]) || null;
}

/**
 * Would the bike, standing where it starts, already be touching the finish
 * flower? Then the run would end before the rider could move.
 */
function startTouchesFinish(trail) {
  const { x, y, facing } = trail.start;
  const wheelY = Number.isFinite(y) ? y : terrainAt(trail, x, null).y - RADIUS;
  const rear = { x: x - WHEELBASE / 2, y: wheelY },
    front = { x: x + WHEELBASE / 2, y: wheelY };
  // A rider sits about 43 units above the axles, slightly forward.
  const probes = [
    { x: x + 3 * (facing < 0 ? -1 : 1), y: wheelY - 43, radius: 6 },
    { x, y: wheelY - 30, radius: 5 },
  ];
  return bikeTouchesFlower(finishFlower(trail), { rear, front, probes });
}

/**
 * Is a point buried in solid terrain? Checked a unit above the point as well,
 * so something standing exactly on a surface, which the even-odd test can count
 * as inside, is not reported.
 */
function insideTerrain(blocks, x, y) {
  return blocks.some(
    (block) => pointInRegion(block, x, y) && pointInRegion(block, x, y - 1),
  );
}

// Most blocks are far smaller than this; a larger one is sampled more coarsely.
const BURIED_MAX_SAMPLES = 20000;

/**
 * The blocks that change nothing: buried, so the bike never touches them, and
 * never seen. Where blocks overlap, the game draws the material of the last
 * one, so a block inside another still shows (a stone sill on a brick wall)
 * unless a later block covers it or the block under it has the same material.
 * It is sampled at the centres of the game's art pixels, where the terrain is
 * drawn. Glass shows what is behind it and can break mid-ride, uncovering
 * what it buries, so a block that see-through terrain touches is never
 * reported.
 * @param {object[]} blocks the trail's blocks, back walls left out, in drawing order
 * @param {Set<number>} exposed indices of blocks with some surface left
 * @returns {Map<number, "material" | "covered">} each one, and whether it is
 *   hidden (at least in part) by being the same material as the block under
 *   it, which another material would fix, or only by blocks drawn over it
 */
function buriedBlocks(blocks, exposed) {
  const lost = new Map();
  const buried = blocks.map((_, index) => index).filter((index) => !exposed.has(index));
  if (!buried.length) return lost;
  const bounds = blocks.map((block) => regionBounds(block));
  const rings = new Map();
  const ringsOf = (index) => {
    if (!rings.has(index)) rings.set(index, regionRings(blocks[index]));
    return rings.get(index);
  };
  const overlaps = (a, b, margin = 0) =>
    a.left <= b.right + margin && b.left <= a.right + margin && a.top <= b.bottom + margin && b.top <= a.bottom + margin;
  for (const index of buried) {
    const box = bounds[index];
    const near = [];
    for (let other = 0; other < blocks.length; other++)
      if (other !== index && overlaps(box, bounds[other], 1)) near.push(other);
    if (near.some((other) => isSeeThrough(blocks[other].material))) continue;
    const own = ringsOf(index);
    const area = (box.right - box.left) * (box.bottom - box.top);
    const step = ART_PIXEL * Math.max(1, Math.ceil(Math.sqrt(area / (ART_PIXEL * ART_PIXEL) / BURIED_MAX_SAMPLES)));
    let seen = false, sameMaterial = false;
    for (let y = (Math.floor(box.top / step) + 0.5) * step; y < box.bottom && !seen; y += step) {
      for (let x = (Math.floor(box.left / step) + 0.5) * step; x < box.right && !seen; x += step) {
        if (!pointInRings(own, x, y)) continue;
        // On top here, and over a different material (or nothing) it shows.
        let above = false, below = -1;
        for (const other of near) {
          const b = bounds[other];
          if (x < b.left || x > b.right || y < b.top || y > b.bottom || !pointInRings(ringsOf(other), x, y)) continue;
          if (other > index) above = true;
          else if (other > below) below = other;
          if (above) break;
        }
        if (above) continue;
        if (below < 0 || blocks[below].material !== blocks[index].material) seen = true;
        else sameMaterial = true;
      }
    }
    if (!seen) lost.set(index, sameMaterial ? "material" : "covered");
  }
  return lost;
}

/**
 * The start's wheel centres: at the start's height when it has one, else each
 * on the ground under it, as the bike is set down.
 */
function startWheels(trail) {
  const { x, y } = trail.start;
  return [x - WHEELBASE / 2, x + WHEELBASE / 2].map((wheelX) => ({
    x: wheelX,
    y: Number.isFinite(y) ? y : terrainAt(trail, wheelX, null).y - RADIUS,
  }));
}

// How far off the line between its neighbours a point may be and still count
// as on it, in units: well under anything the bike or the eye can tell.
const STRAIGHT_POINT_TOLERANCE = 0.01;

/**
 * The points of a block that lie on the straight line between their
 * neighbours, with no curve handle on either side. They change nothing about
 * the shape and only add to the trail's size. Each comes with its ring and
 * index, so removing them in reverse order leaves the rest in place.
 * @returns {Array<{ ring: { nodes: object[] }, index: number }>}
 */
export function straightLinePoints(block) {
  const found = [];
  for (const ring of [block?.outer, ...(block?.inner || [])]) {
    const nodes = ring?.nodes || [];
    if (nodes.length <= 3) continue;
    nodes.forEach((node, index) => {
      const before = nodes[(index + nodes.length - 1) % nodes.length];
      const after = nodes[(index + 1) % nodes.length];
      if (before.out || node.in || node.out || after.in) return;
      const dx = after.x - before.x, dy = after.y - before.y;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) return;
      const off = Math.abs((node.x - before.x) * dy - (node.y - before.y) * dx) / Math.sqrt(lengthSquared);
      const along = ((node.x - before.x) * dx + (node.y - before.y) * dy) / lengthSquared;
      if (off < STRAIGHT_POINT_TOLERANCE && along > 0 && along < 1) found.push({ ring, index });
    });
  }
  return found;
}

export function validateTrail(trail) {
  const messages = [];
  // A target names the item a message is about, as the editor's selection
  // items do ({ type, index }), so the editor can take the author to it.
  const error = (text, target) =>
    messages.push(target ? { type: "error", text, target } : { type: "error", text });
  const warning = (text, target) =>
    messages.push(target ? { type: "warning", text, target } : { type: "warning", text });
  if (!trail.name.trim()) error("The trail needs a name.");

  // Block geometry is validated first, back walls included so blocks are
  // numbered as in the editor, and against the trail's other blocks so a fully
  // buried block is reported.
  const allBlocks = allTrailBlocks(trail);
  for (const message of validateTerrainBlocks(allBlocks)) messages.push(message);
  const blocks = allBlocks.filter((block) => !isBackWall(block));
  const number = allBlocks
    .map((block, index) => (isBackWall(block) ? -1 : index + 1))
    .filter((value) => value > 0);
  const compiled = blocks.length ? terrainGeometry(trail) : null;
  if (compiled) {
    // A block with no surface left on the union's boundary is entirely inside
    // other terrain, which usually means a surrounding block was moved over it.
    const exposed = new Set(
      compiled.bodies
        .filter((body) => body.liveCount > 0)
        .map((body) => body.blockIndex),
    );
    const lost = buriedBlocks(blocks, exposed);
    blocks.forEach((block, index) => {
      const reason = lost.get(index);
      if (!reason) return;
      warning(
        reason === "material"
          ? `Block ${number[index]} is buried inside terrain of the same material (${block.material}), so it is never ridden or seen; only its outline shows in the editor. Give it another material to make it show, or delete it.`
          : `Block ${number[index]} is completely buried inside other terrain and covered by blocks drawn over it, so it has no effect.`,
        { type: "block", index: number[index] - 1 },
      );
    });
    const edges = compiled.bodies.reduce(
      (total, body) => total + body.edgeCount,
      0,
    );
    if (edges > 40000)
      warning(
        `The terrain is very detailed (${edges} edges after curves are flattened) and may be slow on older devices.`,
      );
  }

  // Points on a straight line cost size and nothing else, which adds up in a
  // trail drawn with many of them, so they are named once for the trail.
  let straightPoints = 0;
  const straightBlocks = [];
  allBlocks.forEach((block, index) => {
    const count = straightLinePoints(block).length;
    if (!count) return;
    straightPoints += count;
    straightBlocks.push(index + 1);
  });
  if (straightPoints)
    warning(
      `${straightPoints === 1 ? "A point lies" : `${straightPoints} points lie`} on the straight line between ${straightPoints === 1 ? "its" : "their"} neighbours (block${straightBlocks.length === 1 ? "" : "s"} ${straightBlocks.join(", ")}), so ${straightPoints === 1 ? "it changes" : "they change"} nothing but the trail's size. Delete ${straightPoints === 1 ? "it" : "them"}: a straight run needs only its two ends.`,
      { type: "block", index: straightBlocks[0] - 1 },
    );

  if (!blocks.length) error("A trail needs terrain: add at least one block.");
  // The finish may sit on either side of the start, so it is checked against
  // both ends of the terrain rather than against a position to the right.
  const firstX = blocks.length
    ? Math.min(
        ...blocks.map((block) => regionBounds(block).left),
      )
    : Infinity;
  const finalX = blocks.length
    ? Math.max(
        ...blocks.map((block) => regionBounds(block).right),
      )
    : -Infinity;
  // A finish off the end of the terrain is already reported by the range check
  // below, so the "no terrain under it" check must not repeat the same problem.
  let finishOffTerrain = false;
  if (Number.isFinite(firstX) && trail.finish.x <= firstX) {
    finishOffTerrain = true;
    error(
      `The finish at x ${Math.round(trail.finish.x)} is before the start of the terrain (x ${Math.round(firstX)}). Move it onto the trail, or extend the blocks.`,
      { type: "finish" },
    );
  } else if (Number.isFinite(finalX) && trail.finish.x >= finalX) {
    finishOffTerrain = true;
    error(
      `The finish at x ${Math.round(trail.finish.x)} is past the end of the terrain (x ${Math.round(finalX)}). Move it onto the trail, or extend the blocks.`,
      { type: "finish" },
    );
  }
  if (Number.isFinite(trail.start?.x) && startTouchesFinish(trail)) {
    error(
      "The finish flower touches the bike at the start, so the trail would end at once. Move the finish away from the start.",
      { type: "finish" },
    );
  }
  if (!Number.isFinite(trail.start?.x))
    error("The trail needs a valid start position.");
  else if (compiled && Number.isFinite(trail.start?.y) && trail.start.y >= fallLine(trail))
    error(
      `The start (y ${Math.round(trail.start.y)}) is below all the terrain, so the bike is lost at once. Move it onto the trail.`,
      { type: "start" },
    );
  else if (compiled && startWheels(trail).some((wheel) => insideTerrain(blocks, wheel.x, wheel.y)))
    error(
      "The bike starts inside solid terrain. Move the start onto open ground, or lift it.",
      { type: "start" },
    );
  if (compiled && Number.isFinite(trail.finish.y) && trail.finish.y >= fallLine(trail))
    error(
      `The finish (y ${Math.round(trail.finish.y)}) is below all the terrain, so it can never be reached. Move it onto the trail.`,
      { type: "finish" },
    );
  else if (
    compiled &&
    Number.isFinite(trail.finish.y) &&
    insideTerrain(blocks, trail.finish.x, trail.finish.y - FINISH_FLOWER_LIFT)
  )
    error(
      "The finish flower is inside solid terrain, so it can never be reached. Move it into the open.",
      { type: "finish" },
    );
  for (const [index, apple] of (trail.apples || []).entries()) {
    const target = { type: "apple", index };
    if (!Number.isFinite(apple?.x)) {
      error(`Apple ${index + 1} must have a finite x.`, target);
      continue;
    }
    if (compiled && Number.isFinite(apple.y) && insideTerrain(blocks, apple.x, apple.y))
      error(
        `Apple ${index + 1} (x ${Math.round(apple.x)}) is inside solid terrain, so it can never be picked.`,
        target,
      );
  }
  if ((trail.props || []).length > PROP_WARNING_COUNT)
    warning(
      `The trail has ${trail.props.length} props; more than ${PROP_WARNING_COUNT} may be slow to draw on older devices.`,
    );
  if ((trail.apples || []).length > APPLE_WARNING_COUNT)
    warning(
      `The trail has ${trail.apples.length} apples; more than ${APPLE_WARNING_COUNT} may be slow on older devices.`,
    );
  if ((trail.spikes || []).length > SPIKE_WARNING_COUNT)
    warning(
      `The trail has ${trail.spikes.length} spikes; more than ${SPIKE_WARNING_COUNT} may be slow on older devices.`,
    );
  for (const [index, prop] of (trail.props || []).entries()) {
    const target = { type: "prop", index };
    if (
      ![
        "tree",
        "pine",
        "bush",
        "fence",
        "rock",
        "boulder",
        "flowers",
        "stump",
        "cactus",
        "crystal",
        "sign",
        "vines",
        "roots",
        "moss",
        "ivy",
        "sapling",
        "pine-small",
        "cactus-small",
        "pebbles",
        "crates",
        "apple",
        "ladder",
        "wheelbarrow",
        "scarecrow",
        "beehive",
        "tyre",
        "cone",
        "barrier",
        "dumpster",
        "lamp",
        "bird",
        "squirrel",
        "corgi",
        "rabbit",
        "graffiti",
        "crane",
        "scaffolding",
        "hanging-roots",
        "stalactites",
        "mushrooms",
        "minecart",
        "beams",
        "drip",
        "lantern",
        "bats",
        "skull",
        "tumbleweed",
        "car-wreck",
        "water-tower",
        "windmill",
        "heat-haze",
        "vulture",
        "cairn",
        "ski-lift",
        "icicles",
        "snow-pine",
        "hut",
        "snowman",
        "tyre-wall",
        "hay-bales",
        "course-tape",
        "banner",
        "spectators",
        "pit-board",
        "petrol-can",
        "marshal-start",
        "marshal-finish",
        "camera-tower",
        "warning-triangle",
        "warning-bang",
        "warning-skull",
        "arrow-sign",
        "halfway-flag",
        "tutorial-lean",
        "tutorial-flip",
        "tutorial-rotate",
        "tutorial-restart",
        "tutorial-ledge",
        "tutorial-gas",
        "tutorial-brake",
        "tutorial-light",
        "tutorial-lean-forward",
        "prison-fence",
        "watchtower",
        "jail-cell",
        "escape-tunnel",
        "ball-and-chain",
        "wanted-poster",
        "tally-marks",
        "spiderweb",
        "cobweb",
        "spider",
        "cocoon",
        "dungeon-bars",
        "portcullis",
        "torch",
        "hanging-chains",
        "gibbet",
        "skeleton",
        "tent",
        "grass",
        "flagpole",
        "christiania-bike",
        "bench",
        "fireplace",
        "smoke",
        "mill",
        "farmhouse",
        "mailbox",
        "stall",
        "wind-turbine",
        ...WATER_PROPS,
      ].includes(prop.type)
    )
      warning(`Prop ${index + 1} has an unknown type “${prop.type}”.`, target);
    if (WATER_PROPS.has(prop.type) && prop.type !== "reeds") {
      const y = Number.isFinite(prop.y) ? prop.y : groundHeight(trail, prop.x);
      if (!waterPropBody(waterBodies(trail), prop.type, prop.x, y))
        warning(
          prop.type === "dragonfly"
            ? `Prop ${index + 1} (dragonfly) hovers over water, but there is no water surface at or just above it.`
            : SURFACE_PROPS.has(prop.type)
            ? `Prop ${index + 1} (${prop.type}) floats on water, but there is no water surface at or just above it.`
            : `Prop ${index + 1} (${prop.type}) lives in water, but it is not in any water.`,
          target,
        );
    }
    if (prop.type === "sign") {
      if (typeof prop.text !== "string")
        warning(
          `Sign ${index + 1} needs its text as a string; use “” for a blank sign.`,
          target,
        );
      else if (
        signLines(prop.text).join("").replace(/\s/g, "").length <
        prop.text.replace(/\s/g, "").length
      )
        warning(
          `Sign ${index + 1} text doesn't fit in ${SIGN_MAX_LINES} lines of ${SIGN_LINE_CHARACTERS} characters and will be cut off.`,
          target,
        );
      else if (/[^A-Z0-9 →←↑↓\/.!+:\-×#']/.test(prop.text.toUpperCase()))
        warning(
          `Sign ${index + 1} text contains characters the pixel font cannot draw.`,
          target,
        );
    }
    if (prop.type === "stall" && typeof prop.text === "string" && prop.text.trim()) {
      const words = prop.text.trim().toUpperCase().split(/\s+/);
      if (stallSignLines(prop.text).join(" ").length < words.join(" ").length)
        warning(`Stall ${index + 1} sign doesn't fit in ${STALL_SIGN_LINES} lines of ${STALL_SIGN_LINE} characters and will be cut off.`, target);
      else if (/[^A-Z0-9 \/.!+:\-#']/.test(words.join(" ")))
        warning(`Stall ${index + 1} sign contains characters the pixel font cannot draw.`, target);
    }
    if ((prop.type === "banner" || prop.type === "pit-board") && typeof prop.text === "string") {
      const name = prop.type === "banner" ? "Banner" : "Pit board";
      const limit = prop.type === "banner" ? BANNER_MAX : 4;
      const label = prop.text.trim().toUpperCase().replace(/Ä/g, "A");
      if (label.length > limit)
        warning(`${name} ${index + 1} text is longer than ${limit} characters and will be cut off.`, target);
      else if (/[^A-Z0-9 \/.!+:\-#']/.test(label))
        warning(`${name} ${index + 1} text contains characters the pixel font cannot draw.`, target);
    }
  }
  for (const [index, spike] of (trail.spikes || []).entries()) {
    const target = { type: "spike", index };
    if (!Number.isFinite(spike.x) || !Number.isFinite(spike.y))
      error(`Spike ${index + 1} must have finite coordinates.`, target);
    if (!(spike.radius >= SPIKE_RADIUS.min && spike.radius <= SPIKE_RADIUS.max))
      error(
        `Spike ${index + 1} radius must be between ${SPIKE_RADIUS.min} and ${SPIKE_RADIUS.max}.`,
        target,
      );
    const startY = Number.isFinite(trail.start?.y)
      ? trail.start.y
      : groundHeight(trail, trail.start.x) - 12;
    if (hypot(spike.x - trail.start.x, spike.y - startY) < spike.radius + 70)
      warning(`Spike ${index + 1} is very close to the start position.`, target);
    for (const apple of trail.apples || []) {
      const appleY = Number.isFinite(apple.y)
        ? apple.y
        : groundHeight(trail, apple.x) - 60;
      if (hypot(spike.x - apple.x, spike.y - appleY) < spike.radius + 10)
        warning(
          `Spike ${index + 1} overlaps the apple at x ${Math.round(apple.x)}.`,
          target,
        );
    }
    if (trail.nisse) {
      // The nisse's middle, about 12 above where its feet stand.
      const nisseY = (Number.isFinite(trail.nisse.y) ? trail.nisse.y : groundHeight(trail, trail.nisse.x)) - 12;
      if (hypot(spike.x - trail.nisse.x, spike.y - nisseY) < spike.radius + 14)
        warning(`Spike ${index + 1} overlaps the nisse.`, target);
    }
  }
  for (const [index, body] of (trail.water || []).entries()) {
    const name = `Water ${index + 1}`;
    const target = { type: "water", index };
    if (![body.x, body.y, body.width, body.depth].every(Number.isFinite)) {
      error(`${name} must have finite coordinates and size.`, target);
      continue;
    }
    if (body.width < WATER_SIZE.minWidth || body.depth < WATER_SIZE.minDepth)
      error(
        `${name} must be at least ${WATER_SIZE.minWidth} wide and ${WATER_SIZE.minDepth} deep.`,
        target,
      );
    const startY = Number.isFinite(trail.start?.y)
      ? trail.start.y
      : groundHeight(trail, trail.start.x) - 12;
    if (waterAt([body], trail.start.x, startY))
      warning(`${name} covers the start position.`, target);
    if (compiled && !waterColumns(compiled, body).length)
      warning(`${name} is completely inside terrain, so it has no effect.`, target);
  }
  if (trail.medals !== undefined) {
    const times = MEDALS.map((name) => Number(trail.medals?.[name]));
    if (!times.every((time) => Number.isFinite(time) && time > 0))
      error(
        "Medal times need positive gold, silver and bronze values in seconds.",
      );
    else if (!(times[0] <= times[1] && times[1] <= times[2]))
      error("Medal times must get slower from gold to silver to bronze.");
  }
  for (const key of WEATHER_LEVELS) {
    const value = trail.weather?.[key];
    if (
      value !== undefined &&
      (!Number.isFinite(Number(value)) || value < 0 || value > 1)
    )
      error(`Weather.${key} must be between 0 and 1.`);
  }
  const hour = trail.timeOfDay;
  if (hour !== undefined && !(Number.isInteger(hour) && hour >= 0 && hour < HOURS))
    error(`The time of day must be a whole hour from 0 to ${HOURS - 1}.`);
  const direction = trail.weather?.windDirection;
  if (direction !== undefined && !WIND_DIRECTIONS.includes(direction))
    error(`Weather.windDirection must be ${WIND_DIRECTIONS.map((value) => `"${value}"`).join(" or ")}.`);
  // An object resting on "whatever is here" can be left over open air by an
  // edit. Checked last, so a broken finish or terrain, which
  // usually causes it, is the first thing reported.
  if (compiled) {
    const noGround = (x) => !terrainAt(trail, x, null).solid;
    if (trail.start?.y === null && noGround(trail.start.x))
      error(
        "The ground-anchored start has no terrain under it. Drag the start onto a block.",
        { type: "start" },
      );
    for (const [index, apple] of (trail.apples || []).entries()) {
      if (apple.y === null && noGround(apple.x))
        error(
          `Ground-anchored apple at x ${Math.round(apple.x)} has no terrain under it.`,
          { type: "apple", index },
        );
    }
    if (trail.nisse?.y === null && noGround(trail.nisse.x))
      error("The ground-anchored nisse has no terrain under it. Drag it onto a block.", { type: "nisse", index: 0 });
    if (
      !finishOffTerrain &&
      !Number.isFinite(trail.finish.y) &&
      noGround(trail.finish.x)
    )
      error(
        "The ground-anchored finish has no terrain under it. Drag it onto a block, or lift it into the air.",
        { type: "finish" },
      );
  }
  if (!messages.length)
    messages.push({ type: "ok", text: "Trail data is valid." });
  return messages;
}
